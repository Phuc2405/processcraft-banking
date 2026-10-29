import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import type { Group } from 'three';
import { MeshBasicMaterial } from 'three';
import { CustomerFigure } from './Avatars';
import { CARRY_PATH, LOADING_BAY, LOADING_DOOR, VAN_REAR, type CitPhase, type CitRun, type Load } from '../../../engine/world/citRun';
import { Sign, useMerged } from './Dressing';
import { box, type Part } from './kit';
import { FLOOR_SLAB } from '../../../engine/plan/layout3d';
import { glow, solid } from './materials';
import { CitMarker, bodyParts } from './Vehicles3D';
import { LENGTH, WIDTH } from '../../../engine/world/vehicles';

/**
 * The cash-in-transit run to the vault (citRun.ts says where everything is): the painted yellow loading bay in the car
 * park's inner row against the branch's left wall, in full view of the camera, the vault's loading door in that wall with
 * its roller shutter, the armoured van coming in through the car park's gate and down the drive (indicating, the yellow
 * ▼ over it) and nosing into the bay, its rear doors swinging open, the guard carrying the cash boxes and the bag from the
 * back of the van round its side to the door, a member of the vault's staff taking each one in, and the van shutting up,
 * backing out and driving off.
 */

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
  const blinkLeft = useRef<Group>(null);
  const blinkRight = useRef<Group>(null);
  const doors = useMemo(() => ({ current: 0 }), []);
  const [look, setLook] = useState<{ phase: CitPhase; guard: boolean; walking: boolean; carrying: Load | null; staff: boolean }>({ phase: run.phase, guard: false, walking: false, carrying: null, staff: false });
  useFrame(({ clock }) => {
    const p = run.pose();
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
    if (guard.current) {
      guard.current.visible = p.guard !== null;
      if (p.guard) {
        guard.current.position.set(p.guard.at[0], GROUND_Y, p.guard.at[1]);
        guard.current.rotation.y = p.guard.heading;
      }
    }
    const next = { phase: p.phase, guard: p.guard !== null, walking: p.guard?.walking ?? false, carrying: p.guard?.carrying ?? null, staff: p.shutter > 0.6 };
    if (next.phase !== look.phase || next.guard !== look.guard || next.walking !== look.walking || next.carrying !== look.carrying || next.staff !== look.staff) setLook(next);
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
      {look.staff && (
        // A member of the vault's staff in the open doorway, facing out, taking the cash in.
        <group position={[-HX + 0.25, 0, LOADING_DOOR[1]]} rotation={[0, -Math.PI / 2, 0]} name="cit-vault-staff">
          <CustomerFigure index={57} shirt="#7c3aed" scale={0.72} />
        </group>
      )}
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
        {look.phase !== 'away' && <CitMarker />}
      </group>
      <group ref={guard} visible={false} name="cit-guard">
        {look.guard && <CustomerFigure index={83} shirt="#1e293b" walking={look.walking} scale={0.72} wear="guard" />}
        {look.carrying && <Carried load={look.carrying} />}
      </group>
    </group>
  );
}
