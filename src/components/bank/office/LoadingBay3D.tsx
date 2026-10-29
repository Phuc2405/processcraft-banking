import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import type { Group } from 'three';
import { MeshBasicMaterial } from 'three';
import { CustomerFigure } from './Avatars';
import { LOADING_BAY, LOADING_DOOR, type CitPhase, type CitRun, type Load } from './citRun';
import { Sign, useMerged } from './Dressing';
import { box, type Part } from './kit';
import { FLOOR_SLAB } from './layout3d';
import { glow, solid } from './materials';
import { CitMarker, bodyParts } from './Vehicles3D';
import { LENGTH, WIDTH } from './vehicles';

/**
 * The cash-in-transit run to the vault (citRun.ts says where everything is): the painted yellow loading bay on a paved
 * apron against the back wall behind the Risk Vault, the vault's loading door with its roller shutter, the armoured van
 * driving in along the lane behind the block (indicating, the yellow ▼ over it), its rear doors swinging open, the guard
 * carrying the cash boxes and the bag from the van to the door, a member of the vault's staff taking them in, and the van
 * shutting up and driving off.
 */

const HZ = FLOOR_SLAB.d / 2;
const ROAD_Y = -0.14;
const BLINKER = new MeshBasicMaterial({ color: '#fbbf24', toneMapped: false });
const DOOR = { w: 1.3, h: 2.0 } as const;
const len = LENGTH.cit;
const wid = WIDTH.cit;

/** The apron, the painted bay with its hatching and its "CIT ONLY" bar, and the loading door's frame in the back wall. */
function bayParts(): Part[] {
  const { x, z, len: bl, w: bw } = LOADING_BAY;
  const x0 = LOADING_DOOR[0] - 1.1;
  const x1 = x + bl / 2 + 0.6;
  const apronD = 1.72;
  const y = ROAD_Y + 0.006;
  const out: Part[] = [
    // Paving level with the lane, from the wall out to the lane's edge.
    box([(x0 + x1) / 2, -0.3, -HZ - apronD / 2], [x1 - x0, 0.32, apronD], '#5b616b'),
    // The bay: a yellow box, hatched across.
    ...[-bw / 2, bw / 2].map((dz) => box([x, y, z + dz], [bl, 0.006, 0.08], '#facc15')),
    ...[-bl / 2, bl / 2].map((dx) => box([x + dx, y, z], [0.08, 0.006, bw], '#facc15')),
    // A walkway striped from the van's back to the loading door.
    ...[0, 1, 2, 3].map((k) => box([LOADING_DOOR[0] + 0.25 + k * 0.32, y, -HZ - 0.55], [0.16, 0.006, 0.8], '#f8fafc')),
    // The door's steel frame and a lit lamp over it.
    box([LOADING_DOOR[0], DOOR.h + 0.08, -HZ - 0.04], [DOOR.w + 0.24, 0.16, 0.1], '#334155'),
    ...[-1, 1].map((sx) => box([LOADING_DOOR[0] + (sx * (DOOR.w + 0.12)) / 2, DOOR.h / 2, -HZ - 0.04], [0.12, DOOR.h, 0.1], '#334155')),
    // Bollards either side of the door, so the van never backs into it.
    ...[-1, 1].map((sx) => box([LOADING_DOOR[0] + sx * (DOOR.w / 2 + 0.3), 0.3, -HZ - 0.3], [0.14, 0.6, 0.14], '#facc15')),
  ];
  for (let k = -bl / 2 + 0.35; k < bl / 2 - 0.2; k += 0.45) out.push(box([x + k, y, z], [0.07, 0.006, bw * 1.05], '#facc15', [0, 0.7, 0]));
  return out;
}

/** The van's rear doors, hinged at their outer edges; and what the guard carries. */
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

function Carried({ load }: { load: Load }) {
  return load === 'bag' ? (
    // A sealed cash bag, grey canvas with a red tag.
    <group position={[0.2, 0.42, 0.06]}>
      <mesh>
        <boxGeometry args={[0.16, 0.22, 0.2]} />
        <meshStandardMaterial color="#6b7280" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>
    </group>
  ) : (
    // A steel cash box, carried in front in both hands.
    <mesh position={[0, 0.5, 0.2]}>
      <boxGeometry args={[0.34, 0.2, 0.24]} />
      <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.3} />
    </mesh>
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
  const guard = useRef<Group>(null);
  const blinkIn = useRef<Group>(null);
  const blinkOut = useRef<Group>(null);
  const doors = useMemo(() => ({ current: 0 }), []);
  const [look, setLook] = useState<{ phase: CitPhase; guard: boolean; walking: boolean; carrying: Load | null; staff: boolean }>({ phase: run.phase, guard: false, walking: false, carrying: null, staff: false });
  useFrame(({ clock }) => {
    const p = run.pose();
    if (van.current) {
      van.current.visible = p.phase !== 'away';
      van.current.position.set(p.x, ROAD_Y, p.z);
      van.current.rotation.y = p.yaw;
    }
    doors.current = p.doors;
    // The roller shutter rolls up into its box over the door.
    if (shutter.current) {
      shutter.current.scale.y = Math.max(0.04, 1 - p.shutter);
      shutter.current.position.y = DOOR.h - (DOOR.h * shutter.current.scale.y) / 2;
    }
    const on = Math.floor(clock.elapsedTime * 3) % 2 === 0;
    // The van drives along the lane towards +x, so the bay (towards the building, +z from the lane) is on its own +z side.
    if (blinkIn.current) blinkIn.current.visible = p.signal === 1 && on;
    if (blinkOut.current) blinkOut.current.visible = p.signal === -1 && on;
    if (guard.current) {
      guard.current.visible = p.guard !== null;
      if (p.guard) {
        guard.current.position.set(p.guard.at[0], ROAD_Y, p.guard.at[1]);
        guard.current.rotation.y = p.guard.heading;
      }
    }
    const next = { phase: p.phase, guard: p.guard !== null, walking: p.guard?.walking ?? false, carrying: p.guard?.carrying ?? null, staff: p.shutter > 0.6 };
    if (next.phase !== look.phase || next.guard !== look.guard || next.walking !== look.walking || next.carrying !== look.carrying || next.staff !== look.staff) setLook(next);
  });
  return (
    <group name="cit-loading-bay">
      <mesh geometry={bay} material={solid} receiveShadow name="cit-bay" />
      <Sign text="CASH LOADING · CIT ONLY" fg="#111827" bg="#facc15" position={[LOADING_DOOR[0], DOOR.h + 0.42, -HZ - 0.1]} rotationY={Math.PI} width={1.8} />
      {/* The roller shutter: grey slats, rolled up while the cash goes in. */}
      <group position={[LOADING_DOOR[0], 0, -HZ - 0.06]}>
        <group ref={shutter} position={[0, DOOR.h / 2, 0]}>
          <mesh material={solid}>
            <boxGeometry args={[DOOR.w, DOOR.h, 0.05]} />
          </mesh>
        </group>
        <mesh position={[0, DOOR.h + 0.08, -0.06]} material={glow}>
          <boxGeometry args={[0.3, 0.06, 0.06]} />
        </mesh>
      </group>
      {look.staff && (
        // A member of the vault's staff in the open doorway, taking the cash in.
        <group position={[LOADING_DOOR[0] + 0.15, ROAD_Y, -HZ + 0.25]} rotation={[0, Math.PI, 0]} name="cit-vault-staff">
          <CustomerFigure index={57} shirt="#7c3aed" scale={0.72} />
        </group>
      )}
      <group ref={van} visible={false} name="cit-van">
        <mesh geometry={body} material={solid} castShadow />
        <mesh geometry={lights} material={glow} />
        <RearDoors doors={doors} />
        {([
          [blinkIn, 1],
          [blinkOut, -1],
        ] as const).map(([ref, side]) => (
          <group key={side} ref={ref} visible={false}>
            {[-1, 1].map((end) => (
              <mesh key={end} position={[end * (len / 2 + 0.01), 0.62, side * (wid / 2 - 0.06)]} material={BLINKER}>
                <boxGeometry args={[0.04, 0.07, 0.12]} />
              </mesh>
            ))}
          </group>
        ))}
        {look.phase !== 'away' && <CitMarker />}
      </group>
      <group ref={guard} visible={false} name="cit-guard">
        {look.guard && <CustomerFigure index={83} shirt="#1e293b" walking={look.walking} scale={0.72} wear="guard" />}
        {look.carrying && <Carried load={look.carrying} />}
      </group>
    </group>
  );
}
