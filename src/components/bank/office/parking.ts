import { FLOOR_SLAB, smoothLane, STREET, type V2 } from './layout3d';
import { pathLength, pointAlongPath } from './tour3d';

/**
 * The two car parks beside the branch, reached from the quiet lane behind the block: cars on the left (-x), motorbikes on
 * the right (+x), each with a gate, a barrier, a booth and a guard waving people in. Pure and deterministic, so the tests
 * can run a lot for an hour and check that no two vehicles ever touch.
 *
 * How nothing ever overlaps:
 *   - a bay is reserved (occupiedBy) the moment a vehicle is sent for it, and freed only once that vehicle has driven
 *     away, so no two vehicles are ever given the same bay;
 *   - only one vehicle moves in a lot at a time (the "mover"): arriving, or reversing out and driving away. Everyone else
 *     is parked, each in its own bay, and bays are wider and deeper than what parks in them;
 *   - a vehicle only turns in when a bay is free; when the lot is full nobody is sent.
 */

const HX = FLOOR_SLAB.w / 2;
const HZ = FLOOR_SLAB.d / 2;

/** One lot, as |x| (mirrored on the left) and z. */
export const LOT = {
  x0: HX + 0.4,
  x1: HX + 5.6,
  z0: -HZ - 1.6,
  z1: STREET.z0,
  /** Where the gate barrier crosses the drive in. */
  gateZ: -HZ - 0.4,
} as const;

/** The strip of shade trees along each lot's outer edge, as |x|. */
export const TREE_STRIP = { x0: HX + 5.6, x1: HX + 6.1, x: HX + 5.85 } as const;

/** The lane behind the block that the lots open onto: in towards the lot, out on the far side. */
export const BACK_LANE = { in: -HZ - 2.45, out: -HZ - 3.95, far: 62 } as const;

export type LotKind = 'car' | 'moto';

/** Each lot's layout: its aisle (as |x|), its rows of bays (where along |x| a parked vehicle stands, and which way it faces). */
export const LOT_PLAN: Readonly<Record<LotKind, { side: -1 | 1; aisle: number; rows: ReadonlyArray<{ a0: number; a1: number; facing: 1 | -1 }>; bay: number; first: number }>> = {
  // Cars nose-in along the outer side, an aisle down the building side.
  car: { side: -1, aisle: HX + 1.7, rows: [{ a0: HX + 3.2, a1: HX + 5.55, facing: 1 }], bay: 1.4, first: LOT.gateZ + 2.2 },
  // Motorbikes in two rows of narrow slots either side of the aisle; a shelter roof over the outer row.
  moto: {
    side: 1,
    aisle: HX + 2.95,
    rows: [
      { a0: HX + 0.5, a1: HX + 1.85, facing: -1 },
      { a0: HX + 4.05, a1: HX + 5.4, facing: 1 },
    ],
    bay: 0.78,
    first: LOT.gateZ + 2.2,
  },
};

/** The vehicles: their length and width, and how fast they move in the lot and on the lane. */
export const SIZE: Readonly<Record<LotKind, { len: number; wid: number }>> = { car: { len: 2.1, wid: 0.97 }, moto: { len: 1.2, wid: 0.34 } };
const SPEED = 3.6;
/** How long someone takes to walk between their bay and the front of the lot, and back. */
export const WALK_PACE = 0.85;

export interface Slot {
  index: number;
  /** World x and z of the parked vehicle's centre. */
  x: number;
  z: number;
  /** Yaw of a vehicle parked there (radians about y; 0 faces +x). */
  yaw: number;
  /** The aisle point in front of the bay. */
  aisleX: number;
  /** Who has the bay (parked, or on the way to it, or leaving it). */
  occupiedBy: string | null;
}

/** Yaw (about y) of something facing along (dx, dz): 0 faces +x. */
export const yawOf = (dx: number, dz: number): number => Math.atan2(-dz, dx);

/** Every bay of a lot. */
export function slotsOf(kind: LotKind): Slot[] {
  const plan = LOT_PLAN[kind];
  const out: Slot[] = [];
  for (const row of plan.rows) {
    const a = (row.a0 + row.a1) / 2;
    for (let z = plan.first; z + plan.bay / 2 <= LOT.z1 - 0.3; z += plan.bay)
      out.push({ index: out.length, x: plan.side * a, z, yaw: yawOf(plan.side * row.facing, 0), aisleX: plan.side * plan.aisle, occupiedBy: null });
  }
  return out;
}

export type Phase = 'arriving' | 'walkingIn' | 'parked' | 'walkingOut' | 'leaving';

export interface LotVehicle {
  id: string;
  kind: LotKind;
  color: string;
  slot: number;
  phase: Phase;
  /** Seconds into the phase. */
  t: number;
  /** How long it stays parked. */
  stay: number;
}

/** Where someone walks between their bay and the front of the lot (then on to the branch's front door). */
function walkPath(kind: LotKind, s: Slot): V2[] {
  const side = LOT_PLAN[kind].side;
  const off = (SIZE[kind].len / 2 + 0.25) * Math.sign(s.aisleX - s.x);
  // Beside the vehicle, inside its own bay.
  const z = s.z + LOT_PLAN[kind].bay / 2 - 0.1;
  return [
    [s.x + off * 0.6, z],
    [s.aisleX - side * 0.6, z],
    [s.aisleX - side * 0.6, LOT.z1 - 0.15],
    [s.aisleX - side * 0.6, STREET.z0 + 0.5],
  ];
}

/** The drive in: along the lane behind the block, into the gate, down the aisle, and nose into the bay. */
export function arrivalPath(kind: LotKind, s: Slot): V2[] {
  const side = LOT_PLAN[kind].side;
  return smoothLane(
    [
      [side * BACK_LANE.far, BACK_LANE.in],
      [s.aisleX, BACK_LANE.in],
      [s.aisleX, s.z],
      [s.x, s.z],
    ],
    0.9,
    6,
  );
}

/** The drive out: reverse out of the bay to the aisle, then forward to the gate, out onto the lane and away. */
export function leavingPaths(kind: LotKind, s: Slot): { reverse: V2[]; forward: V2[] } {
  const side = LOT_PLAN[kind].side;
  return {
    reverse: [
      [s.x, s.z],
      [s.aisleX, s.z],
    ],
    forward: smoothLane(
      [
        [s.aisleX, s.z],
        [s.aisleX, BACK_LANE.out],
        [side * BACK_LANE.far, BACK_LANE.out],
      ],
      0.9,
      6,
    ),
  };
}

/** The vehicle moving in a lot, wherever it is on its way. */
export interface MoverPose {
  id: string;
  x: number;
  z: number;
  yaw: number;
  /** Backing out of its bay. */
  reversing: boolean;
}

/** How long a drive of `len` units takes, easing in and out. */
const driveTime = (len: number): number => len / SPEED + 1.2;
const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

/** A deterministic 0-1 value. */
const rnd = (i: number, k: number): number => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const CAR_TONES = ['#e5e7eb', '#111827', '#991b1b', '#1e40af', '#6b7280', '#f8fafc', '#065f46', '#b45309'];
const MOTO_TONES = ['#dc2626', '#1d4ed8', '#111827', '#f59e0b', '#0f766e', '#7c3aed', '#e5e7eb'];

/** One car park and everything in it. Step it with the frame time. */
export class ParkingLot {
  readonly kind: LotKind;
  readonly slots: Slot[];
  vehicles: LotVehicle[] = [];
  /** The one vehicle allowed to move in the lot, or null. */
  mover: string | null = null;
  t = 0;
  private serial = 0;
  private nextArrival: number;
  /** The last vehicle given the lot was leaving: the next turn goes to a newcomer, so the two take turns. */
  private lastLeft = false;

  constructor(kind: LotKind, fill = 0.55) {
    this.kind = kind;
    this.slots = slotsOf(kind);
    // Start part full, staying for different lengths of time.
    for (const s of this.slots) if (rnd(s.index, kind === 'car' ? 3 : 4) < fill) this.park(s, 'parked', 15 + rnd(s.index, 5) * 160);
    this.nextArrival = 4;
  }

  private park(s: Slot, phase: Phase, stay: number): LotVehicle {
    const n = this.serial++;
    const tones = this.kind === 'car' ? CAR_TONES : MOTO_TONES;
    const v: LotVehicle = { id: `${this.kind}-${n}`, kind: this.kind, color: tones[n % tones.length]!, slot: s.index, phase, t: 0, stay };
    s.occupiedBy = v.id;
    this.vehicles.push(v);
    return v;
  }

  /** Whether bay `i` is taken (parked, reserved, or being left). */
  isOccupied(i: number): boolean {
    return this.slots[i]!.occupiedBy !== null;
  }

  /** The free bays. */
  vacant(): Slot[] {
    return this.slots.filter((s) => s.occupiedBy === null);
  }

  step(dt: number): void {
    const h = Math.min(Math.max(dt, 0), 0.1);
    this.t += h;
    for (const v of this.vehicles) v.t += h;
    const slot = (v: LotVehicle) => this.slots[v.slot]!;
    for (const v of [...this.vehicles]) {
      const s = slot(v);
      if (v.phase === 'arriving' && v.t >= driveTime(pathLength(arrivalPath(this.kind, s)))) {
        // In the bay: the lot is free for the next vehicle, and the driver walks off to the branch.
        v.phase = 'walkingIn';
        v.t = 0;
        this.mover = null;
      } else if (v.phase === 'walkingIn' && v.t >= pathLength(walkPath(this.kind, s)) / WALK_PACE) {
        v.phase = 'parked';
        v.t = 0;
      } else if (v.phase === 'walkingOut' && v.t >= pathLength(walkPath(this.kind, s)) / WALK_PACE) {
        v.phase = 'leaving';
        v.t = 0;
      } else if (v.phase === 'leaving') {
        const { reverse, forward } = leavingPaths(this.kind, s);
        if (v.t >= driveTime(pathLength(reverse)) + driveTime(pathLength(forward))) {
          // Gone down the lane and out of sight: only now is the bay free again.
          s.occupiedBy = null;
          this.vehicles = this.vehicles.filter((x) => x !== v);
          this.mover = null;
        }
      }
    }
    if (this.mover !== null) return;
    // The lot is still: someone whose stay is up walks back to their vehicle and drives off (they have the lot until they
    // are gone), or else a newcomer is sent to a free bay.
    const due = this.vehicles.find((v) => v.phase === 'parked' && v.t >= v.stay);
    const free = this.vacant();
    const arrivalDue = this.t >= this.nextArrival && free.length > 0;
    // Leavers and newcomers take turns at the gate, so a busy lot neither empties nor locks out new arrivals.
    if (due && !(arrivalDue && this.lastLeft)) {
      due.phase = 'walkingOut';
      due.t = 0;
      this.mover = due.id;
      this.lastLeft = true;
      return;
    }
    if (this.t < this.nextArrival) return;
    this.nextArrival = this.t + 6 + rnd(this.serial, 7) * 10;
    if (free.length === 0) return;
    const s = free[Math.floor(rnd(this.serial, 8) * free.length)]!;
    const v = this.park(s, 'arriving', 60 + rnd(this.serial, 9) * 120);
    this.mover = v.id;
    this.lastLeft = false;
  }

  /** Where the moving vehicle is, or null when the lot is still. */
  moverPose(): MoverPose | null {
    const v = this.vehicles.find((x) => x.id === this.mover);
    if (!v || (v.phase !== 'arriving' && v.phase !== 'leaving')) return null;
    const s = this.slots[v.slot]!;
    const on = (path: readonly V2[], t: number, back: boolean): MoverPose => {
      const len = pathLength(path);
      const d = len * ease(Math.min(1, t / driveTime(len)));
      const [x, z] = pointAlongPath(path, d);
      const [ax, az] = pointAlongPath(path, Math.min(len, d + 0.05));
      const [bx, bz] = pointAlongPath(path, Math.max(0, d - 0.05));
      const yaw = yawOf(ax - bx, az - bz) + (back ? Math.PI : 0);
      return { id: v.id, x, z, yaw, reversing: back };
    };
    if (v.phase === 'arriving') return on(arrivalPath(this.kind, s), v.t, false);
    const { reverse, forward } = leavingPaths(this.kind, s);
    const tr = driveTime(pathLength(reverse));
    return v.t < tr ? on(reverse, v.t, true) : on(forward, v.t - tr, false);
  }

  /** The vehicles standing in their bays (including one whose driver is walking to or from it). */
  parked(): Array<{ v: LotVehicle; slot: Slot }> {
    return this.vehicles.filter((v) => v.phase === 'walkingIn' || v.phase === 'parked' || v.phase === 'walkingOut').map((v) => ({ v, slot: this.slots[v.slot]! }));
  }

  /** People walking between their bay and the branch. */
  walkers(): Array<{ id: string; x: number; z: number; heading: number }> {
    const out: Array<{ id: string; x: number; z: number; heading: number }> = [];
    for (const v of this.vehicles) {
      if (v.phase !== 'walkingIn' && v.phase !== 'walkingOut') continue;
      const path = walkPath(this.kind, this.slots[v.slot]!);
      const p = v.phase === 'walkingIn' ? path : [...path].reverse();
      const len = pathLength(p);
      const d = Math.min(len, v.t * WALK_PACE);
      const [x, z] = pointAlongPath(p, d);
      const [ax, az] = pointAlongPath(p, Math.min(len, d + 0.05));
      out.push({ id: v.id, x, z, heading: Math.atan2(ax - x, az - z) });
    }
    return out;
  }

  /** How far the barrier is up, 0-1: up while the moving vehicle is near the gate. */
  barrier(): number {
    const m = this.moverPose();
    if (!m) return 0;
    return Math.abs(m.z - LOT.gateZ) < 3.2 && Math.abs(Math.abs(m.x) - Math.abs(this.slots[0]!.aisleX)) < 3 ? 1 : 0;
  }
}
