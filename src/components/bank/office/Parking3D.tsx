import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef, useState } from 'react';
import type { BufferGeometry, Group } from 'three';
import { CustomerFigure } from './Avatars';
import { Sign, useMerged } from './Dressing';
import { box, cyl, merge, type Part } from './kit';
import { customerShirt } from './layout3d';
import { glow, pane, solid } from './materials';
import { LOT, LOT_PLAN, ParkingLot, SIZE, TREE_STRIP, type LotKind } from './parking';
import { bodyParts, Rider } from './Vehicles3D';
import { outfitOf, outfitShirt, useWeather } from './weather';

/**
 * The car park (left of the branch) and the motorbike park (right), drawn from ParkingLot (parking.ts): asphalt with
 * white bay lines and kerbs, a shelter roof over the motorbikes, a booth and a barrier at each gate, a guard who waves the
 * arriving vehicle in, the vehicles parked in their bays, the one vehicle moving, and the drivers walking to the branch.
 */

const ASPHALT = '#5b616b';
const LINE = '#f8fafc';
const KERB = '#d6d3cd';
const GROUND_Y = -0.03;
/** Where the booth and the barrier post stand, as |x|: between the lot's inner edge and the drive. */
export const BOOTH_A = LOT.x0 + 0.3;
export const POST_A = LOT.x0 + 0.65;

/** The lot's fixed parts, for one side: surface, lines, kerbs, booth, sign posts, lamps, the moto shelter. */
function lotParts(kind: LotKind): { solid: Part[]; glass: Part[]; lit: Part[] } {
  const plan = LOT_PLAN[kind];
  const s = plan.side;
  const w = LOT.x1 - LOT.x0;
  const d = LOT.z1 - LOT.z0;
  const mid = (LOT.x0 + LOT.x1) / 2;
  const midZ = (LOT.z0 + LOT.z1) / 2;
  const solidParts: Part[] = [
    // The bed down to the land, the asphalt on it, and the grass strip with the trees along the outer edge.
    box([s * mid, -0.34, midZ], [w, 0.6, d], '#8a7d6b'),
    box([s * mid, GROUND_Y - 0.005, midZ], [w, 0.01, d], ASPHALT),
    box([s * ((TREE_STRIP.x0 + TREE_STRIP.x1) / 2), -0.34, midZ], [TREE_STRIP.x1 - TREE_STRIP.x0, 0.62, d], '#6b8f4e'),
  ];
  // Kerbs round the lot, open at the gate where the drive comes in from the lane.
  const gate0 = plan.aisle - 1.3;
  const gate1 = plan.aisle + 1.3;
  solidParts.push(
    box([s * LOT.x0, 0.03, midZ], [0.12, 0.12, d], KERB),
    box([s * LOT.x1, 0.03, midZ], [0.12, 0.12, d], KERB),
    box([s * (LOT.x0 + gate0) / 2, 0.03, LOT.z0], [gate0 - LOT.x0, 0.12, 0.12], KERB),
    box([s * (gate1 + LOT.x1) / 2, 0.03, LOT.z0], [LOT.x1 - gate1, 0.12, 0.12], KERB),
    // A low hedge along the front, by the pavement.
    box([s * mid, 0.22, LOT.z1 - 0.12], [w, 0.5, 0.24], '#3f7d3a'),
  );
  // Bay lines: a line between each pair of bays and one along the back of each row, and an arrow down the aisle.
  for (const row of plan.rows) {
    const a = (row.a0 + row.a1) / 2;
    const depth = row.a1 - row.a0;
    for (let z = plan.first - plan.bay / 2; z <= LOT.z1 - 0.3 + 1e-6; z += plan.bay) solidParts.push(box([s * a, GROUND_Y + 0.004, z], [depth, 0.006, 0.06], LINE));
    const back = row.facing > 0 ? row.a1 : row.a0;
    solidParts.push(box([s * back, GROUND_Y + 0.004, (plan.first - plan.bay / 2 + LOT.z1 - 0.3) / 2], [0.06, 0.006, LOT.z1 - 0.3 - plan.first + plan.bay / 2], LINE));
  }
  for (let z = LOT.gateZ + 1.6; z < LOT.z1 - 1; z += 3) solidParts.push(box([s * plan.aisle, GROUND_Y + 0.004, z], [0.08, 0.006, 0.9], '#facc15'));
  // The booth by the gate: a little cabin with a window and a roof.
  // (It stands beside the drive, between the lot's inner edge and the barrier post, clear of anything driving in.)
  const bx = s * BOOTH_A;
  const bz = LOT.gateZ - 0.4;
  solidParts.push(box([bx, 0.55, bz], [0.5, 1.1, 0.7], '#e2e8f0'), box([bx, 1.15, bz], [0.62, 0.1, 0.86], '#1e3a8a'), box([bx, 0.05, bz], [0.56, 0.1, 0.76], '#94a3b8'));
  const glass: Part[] = [box([bx + s * 0.26, 0.72, bz], [0.02, 0.4, 0.5], '#bae6fd'), box([bx, 0.72, bz + 0.36], [0.34, 0.4, 0.02], '#bae6fd')];
  // Lamp posts down the outer edge.
  const lit: Part[] = [];
  for (const z of [LOT.z0 + 3, midZ, LOT.z1 - 2.5]) {
    solidParts.push(cyl([s * (LOT.x1 - 0.2), 1.3, z], 0.04, 0.06, 2.6, '#475569'), box([s * (LOT.x1 - 0.45), 2.6, z], [0.6, 0.08, 0.16], '#334155'));
    lit.push(box([s * (LOT.x1 - 0.55), 2.55, z], [0.34, 0.03, 0.12], '#fff4cf'));
  }
  if (kind === 'moto') {
    // A shelter roof over the outer row of motorbikes.
    const row = plan.rows[1]!;
    for (let z = plan.first - plan.bay / 2; z <= LOT.z1 - 0.3; z += plan.bay * 5) solidParts.push(cyl([s * (row.a1 + 0.05), 0.95, z], 0.04, 0.04, 1.9, '#64748b'));
    solidParts.push(box([s * ((row.a0 + row.a1) / 2 + 0.1), 1.92, (plan.first + LOT.z1 - 0.3) / 2], [row.a1 - row.a0 + 0.5, 0.06, LOT.z1 - 0.3 - plan.first + plan.bay], '#334155'));
    glass.push(box([s * ((row.a0 + row.a1) / 2 + 0.1), 1.97, (plan.first + LOT.z1 - 0.3) / 2], [row.a1 - row.a0 + 0.4, 0.03, LOT.z1 - 0.3 - plan.first + plan.bay - 0.1], '#bfdbfe'));
  }
  return { solid: solidParts, glass, lit };
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

/** The guard at the gate: in uniform and cap, standing, waving the arriving vehicle in. */
function Guard({ kind, lot }: { kind: LotKind; lot: ParkingLot }) {
  const s = LOT_PLAN[kind].side;
  const raise = useMemo(() => ({ current: 0 }), []);
  const clock = useRef(0);
  useFrame((_, dt) => {
    clock.current += Math.min(dt, 0.1);
    // Waving while a vehicle is coming in or going out; arm down when the lot is still.
    raise.current = lot.mover ? 0.55 + 0.4 * Math.sin(clock.current * 6) : 0;
  });
  // Beside the gate, clear of the drive, facing the lane.
  const a = kind === 'car' ? LOT_PLAN.car.aisle + SIZE.car.wid / 2 + 1.1 : LOT.x0 + 0.9;
  return (
    <group position={[s * a, GROUND_Y, LOT.gateZ + 0.6]} rotation={[0, Math.PI, 0]} name={`parking-guard-${kind}`}>
      <CustomerFigure index={kind === 'car' ? 91 : 92} shirt="#1e3a5f" walking stride={0} scale={0.72} wear="guard" raise={raise} />
    </group>
  );
}

/** The barrier arm across the drive, red and white, lifting while the moving vehicle is at the gate. */
function Barrier({ kind, lot }: { kind: LotKind; lot: ParkingLot }) {
  const plan = LOT_PLAN[kind];
  const s = plan.side;
  const arm = useRef<Group>(null);
  const lift = useRef(0);
  const reach = plan.aisle + 1.2 - POST_A;
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

/** One lot, with everything in it, stepped every frame. */
function Lot({ kind }: { kind: LotKind }) {
  const lot = useMemo(() => new ParkingLot(kind), [kind]);
  const parts = useMemo(() => lotParts(kind), [kind]);
  const ground = useMerged(() => parts.solid, [parts]);
  const glass = useMerged(() => parts.glass, [parts]);
  const lit = useMerged(() => parts.lit, [parts]);
  const [parked, setParked] = useState(() => lot.parked().map(({ v, slot }) => ({ id: v.id, color: v.color, x: slot.x, z: slot.z, yaw: slot.yaw })));
  const [mover, setMover] = useState<{ id: string; color: string } | null>(null);
  const moving = useRef<Group>(null);
  const walkers = useRef<Array<Group | null>>([]);
  const parkedKey = useRef('');
  const outfit = useWeather((s) => outfitOf(s.weather));
  useFrame((_, dt) => {
    lot.step(dt);
    const list = lot.parked();
    const key = list.map((p) => p.v.id).join(',');
    if (key !== parkedKey.current) {
      parkedKey.current = key;
      setParked(list.map(({ v, slot }) => ({ id: v.id, color: v.color, x: slot.x, z: slot.z, yaw: slot.yaw })));
    }
    const pose = lot.moverPose();
    const v = pose ? lot.vehicles.find((x) => x.id === pose.id) : undefined;
    if ((v?.id ?? null) !== (mover?.id ?? null)) setMover(v ? { id: v.id, color: v.color } : null);
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
  const s = LOT_PLAN[kind].side;
  return (
    <group name={`parking-${kind}`}>
      <mesh geometry={ground} material={solid} receiveShadow />
      <mesh geometry={glass} material={pane} />
      <mesh geometry={lit} material={glow} />
      <Sign text={kind === 'car' ? 'P  CAR PARK' : 'P  MOTORBIKES'} fg="#ffffff" bg="#1d4ed8" position={[s * (LOT.x0 + 1.6), 1.45, LOT.z1 - 0.3]} width={1.7} />
      <Barrier kind={kind} lot={lot} />
      <Guard kind={kind} lot={lot} />
      {parked.map((p) => (
        <Parked key={p.id} kind={kind} color={p.color} x={p.x} z={p.z} yaw={p.yaw} />
      ))}
      {mover && (
        <group ref={moving} name={`parking-${kind}-mover`}>
          <mesh geometry={bodyOf(kind, mover.color).body} material={solid} castShadow />
          <mesh geometry={bodyOf(kind, mover.color).lights} material={glow} />
          {kind === 'moto' && <Rider x={0.05} index={mover.id.length * 3} rain={outfit === 'rain'} wide={false} />}
        </group>
      )}
      {[0, 1, 2].map((i) => (
        <group
          key={i}
          ref={(g) => {
            walkers.current[i] = g;
          }}
          visible={false}
        >
          <CustomerFigure index={i * 13 + (kind === 'car' ? 101 : 111)} shirt={outfitShirt(outfit, i + 5, customerShirt(i * 5 + (kind === 'car' ? 4 : 8)))} phase={i * 1.9} walking scale={0.7} />
        </group>
      ))}
    </group>
  );
}

/** Both car parks. */
export const Parking3D = memo(function Parking3D() {
  return (
    <group name="office-parking">
      <Lot kind="car" />
      <Lot kind="moto" />
    </group>
  );
});
