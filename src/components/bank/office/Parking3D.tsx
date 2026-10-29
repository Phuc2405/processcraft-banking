import { useWorld } from './WorldProvider';
import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef, useState } from 'react';
import type { BufferGeometry, Group } from 'three';
import { CustomerFigure } from './Avatars';
import { Sign, useMerged } from './Dressing';
import { box, cyl, merge, type Part } from './kit';
import { customerShirt } from '../../../engine/plan/layout3d';
import { glow, pane, solid } from './materials';
import { GuardCabin3D } from './GuardCabin3D';
import { LoadingBay3D } from './LoadingBay3D';
import { PARKING_PLAN } from '../../../engine/world/guardCabin';
import { AISLE, CIT_CLEAR, FOOTWAY, LOT, LOT_SIDE, ROWS, SIDE_DOORS_LEFT, TREE_STRIP, WALKWAY, type LotKind, type ParkingLot } from '../../../engine/world/parking';
import { bodyParts, Rider } from './Vehicles3D';
import { outfitOf, outfitShirt } from '../../../engine/world/weather';
import { useWeather } from './useWeather';

/**
 * The car park on the left of the branch, drawn from ParkingLot (parking.ts): asphalt with white bay lines, walkways
 * striped across to the branch's side doors, a sheltered run of motorbike slots, a barrier at the gate and the guard's
 * cabin beside it with the guard on duty (patrolling, into the cabin in the wet and at night, and changing over every eight
 * hours), the vehicles parked in their bays, the one vehicle moving, and the drivers walking in.
 */

const ASPHALT = '#5b616b';
const LINE = '#f8fafc';
const KERB = '#d6d3cd';
const GROUND_Y = -0.03;
/** Where the barrier post stands, as |x|: between the lot's inner edge and the drive. */
export const POST_A = LOT.x0 + 0.65;

const s = LOT_SIDE;

/** The lot's fixed parts: surface, lines, walkways, kerbs, lamps, the motorbike shelter. (The guard's cabin is GuardCabin3D.) */
function lotParts(): { solid: Part[]; glass: Part[]; lit: Part[] } {
  const w = LOT.x1 - LOT.x0;
  const d = LOT.z1 - LOT.z0;
  const mid = (LOT.x0 + LOT.x1) / 2;
  const midZ = (LOT.z0 + LOT.z1) / 2;
  const parts: Part[] = [
    // The bed down to the land, the asphalt on it, and the grass strip with the trees along the outer edge.
    box([s * mid, -0.34, midZ], [w, 0.6, d], '#8a7d6b'),
    box([s * mid, GROUND_Y - 0.005, midZ], [w, 0.01, d], ASPHALT),
    box([s * ((TREE_STRIP.x0 + TREE_STRIP.x1) / 2), -0.34, midZ], [TREE_STRIP.x1 - TREE_STRIP.x0, 0.62, d], '#6b8f4e'),
  ];
  // Kerbs round the lot, open at the gate where the drive comes in from the lane.
  const gate0 = AISLE - 1.5;
  const gate1 = AISLE + 1.5;
  parts.push(
    box([s * LOT.x1, 0.03, midZ], [0.12, 0.12, d], KERB),
    box([(s * (LOT.x0 + gate0)) / 2, 0.03, LOT.z0], [gate0 - LOT.x0, 0.12, 0.12], KERB),
    box([(s * (gate1 + LOT.x1)) / 2, 0.03, LOT.z0], [LOT.x1 - gate1, 0.12, 0.12], KERB),
    // A low hedge along the front, by the pavement.
    box([s * mid, 0.22, LOT.z1 - 0.12], [w, 0.5, 0.24], '#3f7d3a'),
  );
  // Bay lines: one at each end of every bay, and one along the back of each row.
  for (const row of ROWS) {
    const a = (row.a0 + row.a1) / 2;
    const depth = row.a1 - row.a0;
    for (let z = row.z0; z + row.bay / 2 <= row.z1; z += row.bay) {
      const onWalkway = row.a0 < FOOTWAY && SIDE_DOORS_LEFT.some((dz) => Math.abs(z - dz) < row.bay / 2 + WALKWAY / 2);
      const onLoadingBay = row.a0 < FOOTWAY && z + row.bay / 2 > CIT_CLEAR[0] && z - row.bay / 2 < CIT_CLEAR[1];
      if (onWalkway || onLoadingBay) continue;
      for (const e of [-1, 1]) parts.push(box([s * a, GROUND_Y + 0.004, z + (e * row.bay) / 2], [depth, 0.006, 0.06], LINE));
    }
    const back = row.facing > 0 ? row.a1 : row.a0;
    parts.push(box([s * back, GROUND_Y + 0.004, (row.z0 + row.z1) / 2], [0.06, 0.006, row.z1 - row.z0 + row.bay / 2], LINE));
  }
  // Zebra walkways across the inner row to each side door, and the footway's edge line.
  for (const dz of SIDE_DOORS_LEFT)
    for (let k = 0; k < 5; k++) parts.push(box([s * ((LOT.x0 + FOOTWAY) / 2 + 0.1), GROUND_Y + 0.005, dz - WALKWAY / 2 + 0.2 + k * 0.3], [FOOTWAY - LOT.x0 + 0.2, 0.006, 0.16], LINE));
  parts.push(box([s * (FOOTWAY + 0.45), GROUND_Y + 0.004, midZ], [0.05, 0.006, d - 1], '#94a3b8'));
  // Arrows down the drive.
  for (let z = LOT.gateZ + 2; z < LOT.z1 - 1; z += 3.5) parts.push(box([s * AISLE, GROUND_Y + 0.004, z], [0.08, 0.006, 0.9], '#facc15'));
  const glass: Part[] = [];
  // Lamp posts down the outer edge.
  const lit: Part[] = [];
  for (const z of [LOT.z0 + 3, midZ, LOT.z1 - 2.5]) {
    parts.push(cyl([s * (LOT.x1 - 0.2), 1.3, z], 0.04, 0.06, 2.6, '#475569'), box([s * (LOT.x1 - 0.45), 2.6, z], [0.6, 0.08, 0.16], '#334155'));
    lit.push(box([s * (LOT.x1 - 0.55), 2.55, z], [0.34, 0.03, 0.12], '#fff4cf'));
  }
  // A shelter roof over the motorbike slots.
  const moto = ROWS.find((r) => r.kind === 'moto')!;
  for (let z = moto.z0 - moto.bay / 2; z <= moto.z1; z += moto.bay * 5) parts.push(cyl([s * (moto.a1 + 0.1), 0.95, z], 0.04, 0.04, 1.9, '#64748b'));
  parts.push(box([s * ((moto.a0 + moto.a1) / 2 + 0.1), 1.92, (moto.z0 + moto.z1) / 2], [moto.a1 - moto.a0 + 0.5, 0.06, moto.z1 - moto.z0 + moto.bay], '#334155'));
  glass.push(box([s * ((moto.a0 + moto.a1) / 2 + 0.1), 1.97, (moto.z0 + moto.z1) / 2], [moto.a1 - moto.a0 + 0.4, 0.03, moto.z1 - moto.z0 + moto.bay - 0.1], '#bfdbfe'));
  return { solid: parts, glass, lit };
}

/** A cache of vehicle bodies by kind and colour, so a full lot shares a handful of geometries. */
const bodies = new Map<string, { body: BufferGeometry; lights: BufferGeometry }>();
function bodyOf(kind: LotKind, color: string): { body: BufferGeometry; lights: BufferGeometry } {
  const key = `${kind}|${color}`;
  const hit = bodies.get(key);
  if (hit) return hit;
  const p = bodyParts({ kind: kind === 'car' ? 'sedan' : 'motorbike', color });
  const made = { body: merge(p.body), lights: merge(p.lights) };
  bodies.set(key, made);
  return made;
}

function Parked({ kind, color, x, z, yaw }: { kind: LotKind; color: string; x: number; z: number; yaw: number }) {
  const g = bodyOf(kind, color);
  return (
    <group position={[x, GROUND_Y, z]} rotation={[0, yaw, 0]}>
      <mesh geometry={g.body} material={solid} castShadow />
      <mesh geometry={g.lights} material={glow} />
    </group>
  );
}

/** The three guards, one to each eight-hour shift. */
const GUARD_LOOK = [91, 95, 99];

/** The barrier arm across the drive, red and white, lifting while the moving vehicle is at the gate. */
function Barrier({ lot }: { lot: ParkingLot }) {
  const arm = useRef<Group>(null);
  const lift = useRef(0);
  const reach = AISLE + 1.4 - POST_A;
  const stripes = useMerged(() => Array.from({ length: Math.ceil(reach / 0.3) }, (_, i) => box([i * 0.3 + 0.15, 0, 0], [0.3, 0.07, 0.07], i % 2 ? '#ffffff' : '#dc2626')), [reach]);
  useFrame((_, dt) => {
    const want = lot.barrier();
    lift.current += (want - lift.current) * Math.min(1, dt * 4);
    if (arm.current) arm.current.rotation.z = lift.current * 1.35;
  });
  return (
    <group position={[s * POST_A, 0.75, LOT.gateZ]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
      <mesh position={[0, -0.38, 0]} material={solid}>
        <boxGeometry args={[0.2, 0.76, 0.2]} />
      </mesh>
      <group ref={arm}>
        <mesh geometry={stripes} material={solid} />
      </group>
    </group>
  );
}

/** The car park, stepped on the motion clock (frozen while the bank is paused). */
export const Parking3D = memo(function Parking3D() {
  const lot = useWorld().lot;
  const parts = useMemo(lotParts, []);
  const ground = useMerged(() => parts.solid, [parts]);
  const glass = useMerged(() => parts.glass, [parts]);
  const lit = useMerged(() => parts.lit, [parts]);
  const [parked, setParked] = useState(() => lot.parked().map(({ v, slot }) => ({ id: v.id, kind: v.kind, color: v.color, x: slot.x, z: slot.z, yaw: slot.yaw })));
  const [mover, setMover] = useState<{ id: string; kind: LotKind; color: string } | null>(null);
  const moving = useRef<Group>(null);
  const walkers = useRef<Array<Group | null>>([]);
  const parkedKey = useRef('');
  const outfit = useWeather((st) => outfitOf(st.weather));
  useFrame(() => {
    // (Stepped by the world engine, closing time and all: WorldEngine.tick.)
    const list = lot.parked();
    const key = list.map((p) => p.v.id).join(',');
    if (key !== parkedKey.current) {
      parkedKey.current = key;
      setParked(list.map(({ v, slot }) => ({ id: v.id, kind: v.kind, color: v.color, x: slot.x, z: slot.z, yaw: slot.yaw })));
    }
    const pose = lot.moverPose();
    const v = pose ? lot.vehicles.find((x) => x.id === pose.id) : undefined;
    if ((v?.id ?? null) !== (mover?.id ?? null)) setMover(v ? { id: v.id, kind: v.kind, color: v.color } : null);
    if (moving.current && pose) {
      moving.current.position.set(pose.x, GROUND_Y, pose.z);
      moving.current.rotation.y = pose.yaw;
    }
    const people = lot.walkers();
    walkers.current.forEach((g, i) => {
      if (!g) return;
      const p = people[i];
      g.visible = !!p;
      if (p) {
        g.position.set(p.x, GROUND_Y, p.z);
        g.rotation.y = p.heading;
      }
    });
  });
  return (
    <group name="office-parking">
      <mesh geometry={ground} material={solid} receiveShadow />
      <mesh geometry={glass} material={pane} />
      <mesh geometry={lit} material={glow} />
      <Sign text="P  CARS · MOTORBIKES" fg="#ffffff" bg="#1d4ed8" position={[s * (LOT.x0 + 4.4), 1.45, LOT.z1 - 0.3]} width={2.6} />
      <Barrier lot={lot} />
      {/* The guard's cabin by the gate, and the guard: a raised hand to a driver only while a vehicle is at the gate (and the
          guard is standing at the post, not walking or sheltering in the cabin). */}
      {/* The cash van's run in through the gate to its loading bay against the left wall: it shares the drive, so the lot steps it. */}
      <LoadingBay3D run={lot.cit} />
      <GuardCabin3D plan={PARKING_PLAN} name="parking-guard-cabin" guardName="parking-guard" looks={GUARD_LOOK} raiseFor={() => lot.barrier() > 0} />
      {parked.map((p) => (
        <Parked key={p.id} kind={p.kind} color={p.color} x={p.x} z={p.z} yaw={p.yaw} />
      ))}
      {mover && (
        <group ref={moving} name="parking-mover">
          <mesh geometry={bodyOf(mover.kind, mover.color).body} material={solid} castShadow />
          <mesh geometry={bodyOf(mover.kind, mover.color).lights} material={glow} />
          {mover.kind === 'moto' && <Rider x={0.05} index={mover.id.length * 3} rain={outfit === 'rain'} wide={false} />}
        </group>
      )}
      {[0, 1, 2, 3].map((i) => (
        <group
          key={i}
          ref={(g) => {
            walkers.current[i] = g;
          }}
          visible={false}
        >
          <CustomerFigure index={i * 13 + 101} shirt={outfitShirt(outfit, i + 5, customerShirt(i * 5 + 4))} phase={i * 1.9} walking scale={0.7} />
        </group>
      ))}
    </group>
  );
});
