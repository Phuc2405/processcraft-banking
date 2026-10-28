import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { BufferGeometry, Group } from 'three';
import { useBankStore } from '../../../store/bankStore';
import { CustomerFigure } from './Avatars';
import { Sign, useMerged } from './Dressing';
import { box, cyl, merge, type Part } from './kit';
import { customerShirt } from './layout3d';
import { glow, pane, solid } from './materials';
import { motion, substeps } from './motion';
import { AISLE, FOOTWAY, guardPatrol, handoverAt, HANDOVER_S, LOT, LOT_SIDE, ParkingLot, ROWS, shiftOf, SIDE_DOORS_LEFT, TREE_STRIP, WALKWAY, type LotKind } from './parking';
import { bodyParts, Rider } from './Vehicles3D';
import { outfitOf, outfitShirt, useWeather } from './weather';

/**
 * The car park on the left of the branch, drawn from ParkingLot (parking.ts): asphalt with white bay lines, walkways
 * striped across to the branch's side doors, a sheltered run of motorbike slots, a booth and a barrier at the gate, the
 * guard on duty (patrolling, and changing over every eight hours), the vehicles parked in their bays, the one vehicle
 * moving, and the drivers walking in.
 */

const ASPHALT = '#5b616b';
const LINE = '#f8fafc';
const KERB = '#d6d3cd';
const GROUND_Y = -0.03;
/** Where the booth and the barrier post stand, as |x|: between the lot's inner edge and the drive. */
export const BOOTH_A = LOT.x0 + 0.3;
export const POST_A = LOT.x0 + 0.65;

const s = LOT_SIDE;

/** The lot's fixed parts: surface, lines, walkways, kerbs, booth, lamps, the motorbike shelter. */
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
      if (onWalkway) continue;
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
  // The booth by the gate: a little cabin with a window and a roof.
  const bx = s * BOOTH_A;
  const bz = LOT.gateZ - 0.4;
  parts.push(box([bx, 0.55, bz], [0.5, 1.1, 0.7], '#e2e8f0'), box([bx, 1.15, bz], [0.62, 0.1, 0.86], '#1e3a8a'), box([bx, 0.05, bz], [0.56, 0.1, 0.76], '#94a3b8'));
  const glass: Part[] = [box([bx - s * 0.26, 0.72, bz], [0.02, 0.4, 0.5], '#bae6fd'), box([bx, 0.72, bz + 0.36], [0.34, 0.4, 0.02], '#bae6fd')];
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

/**
 * The guard on duty: standing at the post facing the lane, now and then pacing along the front of the lot and back; a
 * raised hand only while a vehicle is at the gate. At a change of shift (06:00, 14:00, 22:00) the next guard walks in
 * from the lane and the one going off duty walks away.
 */
function Guards({ lot }: { lot: ParkingLot }) {
  const shift = useBankStore((st) => shiftOf(st.view.minute));
  const [handover, setHandover] = useState<{ from: number; to: number } | null>(null);
  const since = useRef(0);
  const last = useRef(shift);
  useEffect(() => {
    if (shift !== last.current) {
      setHandover({ from: last.current, to: shift });
      since.current = 0;
      last.current = shift;
    }
  }, [shift]);
  const onDuty = useRef<Group>(null);
  const incoming = useRef<Group>(null);
  const outgoing = useRef<Group>(null);
  const raise = useMemo(() => ({ current: 0 }), []);
  const [walking, setWalking] = useState(false);
  useFrame(() => {
    if (handover) {
      since.current += motion.dt;
      const h = handoverAt(since.current);
      incoming.current?.position.set(h.incoming[0], GROUND_Y, h.incoming[1]);
      outgoing.current?.position.set(h.outgoing[0], GROUND_Y, h.outgoing[1]);
      if (incoming.current) incoming.current.rotation.y = 0;
      if (outgoing.current) outgoing.current.rotation.y = Math.PI;
      if (h.done) setHandover(null);
      return;
    }
    const p = guardPatrol(motion.t);
    onDuty.current?.position.set(p.at[0], GROUND_Y, p.at[1]);
    if (onDuty.current) onDuty.current.rotation.y = p.heading;
    if (p.walking !== walking) setWalking(p.walking);
    // A raised hand to the driver only while a vehicle is at the gate; otherwise arms by the side.
    raise.current += ((lot.barrier() > 0 && !p.walking ? 0.55 : 0) - raise.current) * Math.min(1, motion.dt * 4 + 0.02);
  });
  const figure = (look: number, moving: boolean, r?: { current: number }) => (
    <CustomerFigure index={look} shirt="#1e3a5f" walking stride={moving ? 1 : 0} scale={0.72} wear="guard" raise={r} />
  );
  if (handover)
    return (
      <group name="parking-guard-handover" userData={{ handoverS: HANDOVER_S }}>
        <group ref={incoming}>{figure(GUARD_LOOK[handover.to]!, true)}</group>
        <group ref={outgoing}>{figure(GUARD_LOOK[handover.from]!, true)}</group>
      </group>
    );
  return (
    <group ref={onDuty} name="parking-guard">
      {figure(GUARD_LOOK[shift]!, walking, raise)}
    </group>
  );
}

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
  const lot = useMemo(() => new ParkingLot(), []);
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
    for (const h of substeps(motion.dt)) lot.step(h);
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
      <Guards lot={lot} />
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
