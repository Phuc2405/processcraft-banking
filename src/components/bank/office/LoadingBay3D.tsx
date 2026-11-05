import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BoxGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, SphereGeometry, type Group } from 'three';
import { CustomerFigure } from './Avatars';
import { CARRY_PATH, CORRIDOR, LOADING_BAY, LOADING_DOOR, VAN_REAR, VAULT_DOOR, VAULT_STOP, type CitPhase, type CitPose, type CitRun, type CrewFigure } from '../../../engine/world/citRun';
import { budgeted } from './focus3d';
import { frameMemo, ObjectPool } from './webglSafety';
import { pathLength, pointAlongPath } from '../../../engine/plan/path';
import { TAG_STYLE } from '../personStatus';
import { Html } from '@react-three/drei';
import { Sign, useMerged } from './Dressing';
import { box, type Part } from './kit';
import { FLOOR_SLAB } from '../../../engine/plan/layout3d';
import { glow, solid } from './materials';
import { CitMarker, bodyParts } from './Vehicles3D';
import { LENGTH, WIDTH } from '../../../engine/world/vehicles';

/** The cash-in-transit run to the vault and its crew on foot (citRun.ts says where everything is, sim/citCrew.ts when). */

const HX = FLOOR_SLAB.w / 2;
const GROUND_Y = -0.03;
const BLINKER = new MeshBasicMaterial({ color: '#fbbf24', toneMapped: false });
const DOOR = { w: 1.3, h: 2.0 } as const;
const len = LENGTH.cit;
const wid = WIDTH.cit;

/** The painted bay with its hatching and its "CIT ONLY" bar, the striped walk to the loading door, and the door's frame. */
function bayParts(): Part[] {
  const { x, z, len: bl, w: bw } = LOADING_BAY;
  const y = GROUND_Y + 0.008;
  const dz = LOADING_DOOR[1];
  const wx = -HX - 0.04;
  const out: Part[] = [
    // The bay: a yellow box, hatched across.
    ...[-bw / 2, bw / 2].map((e) => box([x, y, z + e], [bl, 0.006, 0.08], '#facc15')),
    ...[-bl / 2, bl / 2].map((e) => box([x + e, y, z], [0.08, 0.006, bw], '#facc15')),
    // A walkway striped along the van's side, from its back to the loading door.
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => box([VAN_REAR[0] + 0.2 + k * 0.4, y, CARRY_PATH[1]![1]], [0.18, 0.006, 0.55], '#f8fafc')),
    // The door's steel frame in the left wall, and bollards either side of it so nothing backs into it.
    box([wx, DOOR.h + 0.08, dz], [0.1, 0.16, DOOR.w + 0.24], '#334155'),
    ...[-1, 1].map((sz) => box([wx, DOOR.h / 2, dz + (sz * (DOOR.w + 0.12)) / 2], [0.1, DOOR.h, 0.12], '#334155')),
    ...[-1, 1].map((sz) => box([wx - 0.3, 0.3, dz + sz * (DOOR.w / 2 + 0.3)], [0.14, 0.6, 0.14], '#facc15')),
  ];
  for (let k = -bw / 2 + 0.3; k < bw / 2 - 0.15; k += 0.4) out.push(box([x, y, z + k], [bl * 0.92, 0.006, 0.07], '#facc15', [0, 0.35, 0]));
  return out;
}

/** The van's rear doors, hinged at their outer edges. */
function RearDoors({ doors }: { doors: { current: number } }) {
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  useFrame(() => {
    // Swung right round against the van's flanks when open.
    if (left.current) left.current.rotation.y = -1.9 * doors.current;
    if (right.current) right.current.rotation.y = 1.9 * doors.current;
  });
  return (
    <>
      {([
        [left, 1],
        [right, -1],
      ] as const).map(([ref, side]) => (
        <group key={side} ref={ref} position={[-len / 2 - 0.02, 0.95, (side * wid) / 2]}>
          <mesh position={[0, 0, (-side * wid) / 4]} material={solid}>
            <boxGeometry args={[0.04, 1.3, wid / 2 - 0.02]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** Flyweight: the steel cash cassette box, one shape and one surface for every run. */
const CASSETTE = new BoxGeometry(0.34, 0.2, 0.24);
const CASSETTE_MAT = new MeshStandardMaterial({ color: '#9ca3af', metalness: 0.7, roughness: 0.3 });

/** Each of the run's people on foot: their look and the shirt they wear. */
const ROLES = [
  { role: 'custodian', index: 61, shirt: '#0e7490', wear: 'none' },
  { role: 'guard', index: 83, shirt: '#1e293b', wear: 'guard' },
  { role: 'staff', index: 57, shirt: '#7c3aed', wear: 'none' },
] as const;
type Role = (typeof ROLES)[number]['role'];
/** The run's pose for this frame, computed once and shared by the van, the crew and the vault (frameMemo). */
type PoseOf = (frame: number) => CitPose;

const crewOf = (p: CitPose, role: Role): CrewFigure | null => {
  for (const c of p.crew) if (c.role === role) return c;
  return null;
};

/**
 * One of the run's people. Both of their figures (walking and standing) and the cassette are mounted once, for the scene's life,
 * and shown or hidden every frame (a pool of one): a crew that steps out, walks, stops and climbs back in never mounts a mesh,
 * never re-renders and never allocates GPU memory. Their status badge is PeopleTags3D's, as everyone's.
 */
function CrewMember({ pose, role, index, shirt, wear }: { pose: PoseOf; role: Role; index: number; shirt: string; wear: 'none' | 'guard' }) {
  const group = useRef<Group>(null);
  const walker = useRef<Group>(null);
  const stander = useRef<Group>(null);
  const cassette = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const f = crewOf(pose(clock.elapsedTime), role);
    if (!group.current) return;
    group.current.visible = f !== null;
    if (!f) return;
    group.current.position.set(f.at[0], GROUND_Y, f.at[1]);
    group.current.rotation.y = f.heading;
    if (walker.current) walker.current.visible = f.walking;
    if (stander.current) stander.current.visible = !f.walking;
    if (cassette.current) cassette.current.visible = f.carrying !== null;
  });
  return (
    <group ref={group} visible={false} name={`cit-${role}`}>
      <group ref={walker} visible={false}>
        <CustomerFigure index={index} shirt={shirt} walking scale={0.72} wear={wear} />
      </group>
      <group ref={stander}>
        <CustomerFigure index={index} shirt={shirt} walking={false} scale={0.72} wear={wear} />
      </group>
      <mesh ref={cassette} visible={false} position={[0, 0.5, 0.2]} geometry={CASSETTE} material={CASSETTE_MAT} />
    </group>
  );
}

const PULSE = { IN: '#facc15', OUT: '#f97316' } as const;
type Flow = keyof typeof PULSE;
/** Flyweight: one sphere and one material per colour, shared by every cash particle; one ring shape each for the door and the floor. */
const SPARK = new SphereGeometry(0.09, 10, 8);
const SPARK_MAT: Readonly<Record<Flow, MeshBasicMaterial>> = { IN: new MeshBasicMaterial({ color: PULSE.IN, toneMapped: false }), OUT: new MeshBasicMaterial({ color: PULSE.OUT, toneMapped: false }) };
const RING_MAT: Readonly<Record<Flow, MeshBasicMaterial>> = { IN: new MeshBasicMaterial({ color: PULSE.IN, transparent: true, opacity: 0.85, toneMapped: false }), OUT: new MeshBasicMaterial({ color: PULSE.OUT, transparent: true, opacity: 0.85, toneMapped: false }) };
const DOOR_RING = new RingGeometry(0.98, 1.16, 40);
const FLOOR_RING = new RingGeometry(0.55, 0.75, 32);
const SPARKS = budgeted(8);
/** The cash particles' stretch: from the loading door's inside along the crew's corridor to the round vault door. */
const STREAM = CORRIDOR.slice(1);
const STREAM_LEN = pathLength(STREAM);

/**
 * The round vault door lit while cash crosses it (the primary target of every vault deposit and withdrawal): a ring round the
 * door, a ring on the floor where the crew stands, gold (Dr 1111) or orange (Cr 1111) cash particles streaming along the corridor
 * into the door or out of it, and the GL tag. The rings stay mounted and hide between runs; the particles come from a pool that
 * hands the same few meshes to every run.
 */
function VaultPulse({ pose, run }: { pose: PoseOf; run: CitRun }) {
  const root = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const floor = useRef<Mesh>(null);
  const stream = useRef<Group>(null);
  const pool = useMemo(() => new ObjectPool<Mesh>(() => new Mesh(SPARK, SPARK_MAT.IN), SPARKS), []);
  const sparks = useRef<Mesh[]>([]);
  const [flow, setFlow] = useState<Flow | null>(null);
  const shown = useRef<Flow | null>(null);
  useEffect(
    () => () => {
      for (const m of sparks.current) stream.current?.remove(m);
      sparks.current = [];
      // The meshes share the flyweight's geometry and materials, which outlive this view: only the pool's own list goes.
      pool.drain();
    },
    [pool],
  );
  useFrame(({ clock }) => {
    const p = pose(clock.elapsedTime);
    // The particles run while the custodian carries the cassettes, not only at the door.
    const f: Flow | null = p.vaultPulse ?? (p.crew.some((c) => c.carrying) ? run.flow : null);
    if (f !== shown.current) {
      shown.current = f;
      setFlow(f);
      if (f) {
        if (ring.current) ring.current.material = RING_MAT[f];
        if (floor.current) floor.current.material = RING_MAT[f];
        for (let i = sparks.current.length; i < SPARKS; i++) {
          const m = pool.acquire();
          if (!m) break;
          m.material = SPARK_MAT[f];
          sparks.current.push(m);
          stream.current?.add(m);
        }
      } else {
        for (const m of sparks.current) {
          stream.current?.remove(m);
          pool.release(m);
        }
        sparks.current = [];
      }
    }
    if (root.current) root.current.visible = f !== null;
    if (!f) return;
    const t = clock.elapsedTime;
    if (ring.current) ring.current.scale.setScalar(1 + 0.08 * Math.sin(t * 6));
    sparks.current.forEach((m, i) => {
      m.material = SPARK_MAT[f];
      const u = (t * 0.22 + i / SPARKS) % 1;
      const [x, z] = pointAlongPath(STREAM, (f === 'OUT' ? 1 - u : u) * STREAM_LEN);
      m.position.set(x, 1.0 + 0.12 * Math.sin(t * 5 + i), z);
    });
  });
  return (
    <group ref={root} visible={false} name="cit-vault-pulse" userData={{ flow }}>
      <mesh ref={ring} geometry={DOOR_RING} material={RING_MAT.IN} position={[VAULT_DOOR.x, VAULT_DOOR.y, VAULT_DOOR.z + 0.32]} />
      <mesh ref={floor} geometry={FLOOR_RING} material={RING_MAT.IN} position={[VAULT_STOP[0], 0.03, VAULT_STOP[1]]} rotation={[-Math.PI / 2, 0, 0]} />
      <group ref={stream} />
      {flow && (
        <Html position={[VAULT_DOOR.x, VAULT_DOOR.y + 1.0, VAULT_DOOR.z + 0.4]} center zIndexRange={[11, 0]} style={{ pointerEvents: 'none' }}>
          <div data-testid="cit-vault-post" style={{ ...TAG_STYLE, color: PULSE[flow] }}>
            {flow === 'IN' ? '⬇ Dr 1111' : '⬆ Cr 1111'}
          </div>
        </Html>
      )}
    </group>
  );
}

/** The cash van's run to the vault, read every frame from `run` (the car park steps it). */
export function LoadingBay3D({ run }: { run: CitRun }) {
  const bay = useMerged(bayParts, []);
  const parts = useMemo(() => bodyParts({ kind: 'cit', color: '#334155' }), []);
  const body = useMerged(() => parts.body, [parts]);
  const lights = useMerged(() => parts.lights, [parts]);
  const van = useRef<Group>(null);
  const shutter = useRef<Group>(null);
  const blinkLeft = useRef<Group>(null);
  const blinkRight = useRef<Group>(null);
  const doors = useMemo(() => ({ current: 0 }), []);
  const [phase, setPhase] = useState<CitPhase>(run.phase);
  // One pose a frame for the van, the three crew and the vault, instead of five.
  const pose = useMemo<PoseOf>(() => frameMemo(() => run.pose()), [run]);
  useFrame(({ clock }) => {
    const p = pose(clock.elapsedTime);
    if (van.current) {
      van.current.visible = p.phase !== 'away';
      van.current.position.set(p.x, GROUND_Y, p.z);
      van.current.rotation.y = p.yaw;
    }
    doors.current = p.doors;
    // The roller shutter rolls up into its box over the door.
    if (shutter.current) {
      shutter.current.scale.y = Math.max(0.04, 1 - p.shutter);
      shutter.current.position.y = DOOR.h - (DOOR.h * shutter.current.scale.y) / 2;
    }
    const on = Math.floor(clock.elapsedTime * 3) % 2 === 0;
    // Left is the van's own -z side (it faces +x at yaw 0), right its +z side.
    if (blinkLeft.current) blinkLeft.current.visible = p.signal === 1 && on;
    if (blinkRight.current) blinkRight.current.visible = p.signal === -1 && on;
    if (p.phase !== phase) setPhase(p.phase);
  });
  return (
    <group name="cit-loading-bay">
      <mesh geometry={bay} material={solid} receiveShadow name="cit-bay" />
      <Sign text="CASH LOADING · CIT ONLY" fg="#111827" bg="#facc15" position={[-HX - 0.1, DOOR.h + 0.42, LOADING_DOOR[1]]} rotationY={-Math.PI / 2} width={1.8} />
      {/* The roller shutter: grey slats, rolled up while the cash goes in. */}
      <group position={[-HX - 0.06, 0, LOADING_DOOR[1]]}>
        <group ref={shutter} position={[0, DOOR.h / 2, 0]}>
          <mesh material={solid}>
            <boxGeometry args={[0.05, DOOR.h, DOOR.w]} />
          </mesh>
        </group>
        <mesh position={[-0.06, DOOR.h + 0.08, 0]} material={glow}>
          <boxGeometry args={[0.06, 0.06, 0.3]} />
        </mesh>
      </group>
      <group ref={van} visible={false} name="cit-van">
        <mesh geometry={body} material={solid} castShadow />
        <mesh geometry={lights} material={glow} />
        <RearDoors doors={doors} />
        {([
          [blinkLeft, -1],
          [blinkRight, 1],
        ] as const).map(([ref, side]) => (
          <group key={side} ref={ref} visible={false}>
            {[-1, 1].map((end) => (
              <mesh key={end} position={[end * (len / 2 + 0.01), 0.62, side * (wid / 2 - 0.06)]} material={BLINKER}>
                <boxGeometry args={[0.04, 0.07, 0.12]} />
              </mesh>
            ))}
          </group>
        ))}
        {phase !== 'away' && <CitMarker />}
      </group>
      {/* The custodian and the guard step out of the cab and walk to the vault and back; the vault's staff walks out to open the door. */}
      {ROLES.map((r) => (
        <CrewMember key={r.role} pose={pose} {...r} />
      ))}
      <VaultPulse pose={pose} run={run} />
    </group>
  );
}
