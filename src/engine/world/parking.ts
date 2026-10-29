import { CitRun, LOADING_BAY } from './citRun';
import { CAR_PARK_FOOTWAY_X, CUSTOMER_DOOR, deskPose, ENTRANCES, FLOOR_SLAB, FRONT_AISLE_Z, LEFT_WALK_X, smoothLane, WALK_IN_DESKS, type V2 } from '../plan/layout3d';
import { pathLength, pointAlongPath } from '../plan/path';

/** The car park on the left of the branch (the park is on the right, Park3D), reached from the quiet lane behind the block. */

const HX = FLOOR_SLAB.w / 2;
const HZ = FLOOR_SLAB.d / 2;

/** The lot, as |x| (it is on the left, so x = -|x|) and z. */
export const LOT = {
  x0: HX + 0.4,
  x1: HX + 8.6,
  z0: -HZ - 1.6,
  z1: FLOOR_SLAB.d / 2,
  /** Where the gate barrier crosses the drive in. */
  gateZ: -HZ - 0.4,
} as const;
/** The lot is on the left of the branch. */
export const LOT_SIDE = -1;

/** The strip of shade trees along the lot's outer edge, as |x|. */
export const TREE_STRIP = { x0: LOT.x1, x1: LOT.x1 + 0.6, x: LOT.x1 + 0.3 } as const;

/** The lane behind the block that the lot opens onto: in towards the lot, out on the far side. */
export const BACK_LANE = { in: -HZ - 2.45, out: -HZ - 3.95, far: 62 } as const;

export type LotKind = 'car' | 'moto';

export interface Row {
  kind: LotKind;
  /** Where along |x| the row's bays run, and which way the vehicles in them face (+1 away from the branch). */
  a0: number;
  a1: number;
  facing: 1 | -1;
  /** The stretch of z the row covers. */
  z0: number;
  z1: number;
  bay: number;
}

/** The middle of the drive down the lot, as |x|: wide enough for a car to pass a car backing out. */
export const AISLE = HX + 4.45;
/** Where people walk down the lot, as |x|: between the inner row and the drive (the customers' walk in to the side doors follows it too: carParkApproach). */
export const FOOTWAY = -CAR_PARK_FOOTWAY_X;

const FIRST = LOT.gateZ + 2.3;
const SPLIT = 4.5;

/** The rows: cars nose-in along the branch side; cars, then a sheltered run of motorbike slots, along the outer side. */
export const ROWS: readonly Row[] = [
  { kind: 'car', a0: HX + 0.5, a1: HX + 3.1, facing: -1, z0: FIRST, z1: LOT.z1 - 0.3, bay: 1.5 },
  { kind: 'car', a0: HX + 5.8, a1: HX + 8.4, facing: 1, z0: FIRST, z1: SPLIT, bay: 1.5 },
  { kind: 'moto', a0: HX + 6.3, a1: HX + 7.8, facing: 1, z0: SPLIT + 0.4, z1: LOT.z1 - 0.3, bay: 0.8 },
];

/** The branch's side doors on the lot's side (the doorways in its left wall), on z. */
export const SIDE_DOORS_LEFT: readonly number[] = ENTRANCES.map((e) => e.at[1]);
/** How wide the walkway across the inner row is at each side door. */
export const WALKWAY = 1.6;

/** The stretch of the inner row (on z) kept for the cash van's loading bay and its guard's walk to the loading door. */
export const CIT_CLEAR: readonly [number, number] = [LOADING_BAY.z - LOADING_BAY.w / 2, LOADING_BAY.z + 1.9];

/** The vehicles: their length and width, and how fast they move in the lot and on the lane. */
export const SIZE: Readonly<Record<LotKind, { len: number; wid: number }>> = { car: { len: 2.1, wid: 0.97 }, moto: { len: 1.2, wid: 0.34 } };
const SPEED = 5.2;
/** How fast people walk between their bay and the branch. */
export const WALK_PACE = 1.05;

export interface Slot {
  index: number;
  kind: LotKind;
  /** World x and z of the parked vehicle's centre. */
  x: number;
  z: number;
  /** Yaw of a vehicle parked there (radians about y; 0 faces +x). */
  yaw: number;
  /** Who has the bay (parked, or on the way to it, or leaving it). */
  occupiedBy: string | null;
}

/** Yaw (about y) of something facing along (dx, dz): 0 faces +x. */
export const yawOf = (dx: number, dz: number): number => Math.atan2(-dz, dx);

/** The row a bay belongs to. */
const rowOf = (s: Pick<Slot, 'x' | 'kind'>): Row => ROWS.find((r) => r.kind === s.kind && Math.abs(s.x) >= r.a0 && Math.abs(s.x) <= r.a1)!;

/** Every bay, leaving the walkways in front of the side doors clear. */
export function slotsOf(): Slot[] {
  const out: Slot[] = [];
  for (const row of ROWS) {
    const a = (row.a0 + row.a1) / 2;
    for (let z = row.z0; z + row.bay / 2 <= row.z1; z += row.bay) {
      const onWalkway = row.a0 < FOOTWAY && SIDE_DOORS_LEFT.some((d) => Math.abs(z - d) < row.bay / 2 + WALKWAY / 2);
      // The cash van's loading bay, and the guard's walk from it to the vault's loading door, are kept clear too.
      const onLoadingBay = row.a0 < FOOTWAY && z + row.bay / 2 > CIT_CLEAR[0] && z - row.bay / 2 < CIT_CLEAR[1];
      if (onWalkway || onLoadingBay) continue;
      out.push({ index: out.length, kind: row.kind, x: LOT_SIDE * a, z, yaw: yawOf(LOT_SIDE * row.facing, 0), occupiedBy: null });
    }
  }
  return out;
}

/** A vehicle's life in the lot: up the lane to just short of the drive (approaching), in through the gate to its bay (arriving: it has the lot's turn), the driver to the branch and back, then out of the bay and through the gate to the lane (leaving: the lot's turn again). Off down the lane it is one of the `departing`. */
export type Phase = 'approaching' | 'arriving' | 'walkingIn' | 'parked' | 'walkingOut' | 'ready' | 'leaving';

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

const ax = LOT_SIDE * AISLE;
const fx = LOT_SIDE * FOOTWAY;
/** Where a vehicle coming up the lane waits its turn for the lot: on the in-lane short of the drive, clear of anything driving out across it. */
export const LANE_WAIT: V2 = [LOT_SIDE * (AISLE + 3), BACK_LANE.in];
/** Where a vehicle leaving hands the lot back: on the out-lane just past the drive, pointing away. */
export const LANE_EXIT: V2 = [LOT_SIDE * (AISLE + 2.5), BACK_LANE.out];

/** The side door nearest `z`. */
export const nearestDoor = (z: number): number => SIDE_DOORS_LEFT.reduce((best, d) => (Math.abs(d - z) < Math.abs(best - z) ? d : best), SIDE_DOORS_LEFT[0]!);

/** Where a driver goes in the branch: up to the teller's counter or the disputes desk (by turns), beside its queue. */
export const counterSpot = (s: Pick<Slot, 'index'>): V2 => {
  const pose = deskPose(WALK_IN_DESKS[s.index % WALK_IN_DESKS.length]!);
  return [pose.x + 0.55, pose.z + pose.d / 2 + 0.45];
};

/** Where someone walks between their bay and the counter they came for. */
export function walkPath(s: Slot): V2[] {
  const len = SIZE[s.kind].len;
  // Beside the vehicle, inside its own bay, at its aisle end.
  const z = s.z + rowOf(s).bay / 2 - 0.1;
  const end = s.x + Math.sign(ax - s.x) * (len / 2 - 0.2);
  const door = CUSTOMER_DOOR[1];
  const spot = counterSpot(s);
  return [
    [end, z],
    [fx, z],
    [fx, door],
    [-HX - 0.1, door],
    [LEFT_WALK_X, door],
    [LEFT_WALK_X, FRONT_AISLE_Z],
    [spot[0], FRONT_AISLE_Z],
    spot,
  ];
}

/** The drive up the lane behind the block, from out of sight to where it waits for the lot (LANE_WAIT). */
export const approachPath = (): V2[] => [[LOT_SIDE * BACK_LANE.far, BACK_LANE.in], LANE_WAIT];

/** The drive in: from the lane, through the gate, down the aisle, and nose into the bay. */
export function arrivalPath(s: Slot): V2[] {
  return smoothLane([LANE_WAIT, [ax, BACK_LANE.in], [ax, s.z], [s.x, s.z]], 0.9, 6);
}

/** The drive out: reverse out of the bay to the aisle, then forward through the gate and onto the out-lane (LANE_EXIT). */
export function leavingPaths(s: Slot): { reverse: V2[]; forward: V2[] } {
  return {
    reverse: [
      [s.x, s.z],
      [ax, s.z],
    ],
    forward: smoothLane([[ax, s.z], [ax, BACK_LANE.out], LANE_EXIT], 0.9, 6),
  };
}

/** From the out-lane past the drive, away down the lane and out of sight. */
export const departPath = (): V2[] => [LANE_EXIT, [LOT_SIDE * BACK_LANE.far, BACK_LANE.out]];

/** The cash van's drives: in through the gate, down the drive and nose-in to its bay. */
export function citRoutes(): { arrive: V2[]; reverse: V2[]; depart: V2[] } {
  const { x, z } = LOADING_BAY;
  const turn = z + 2.4;
  return {
    arrive: smoothLane(
      [
        [LOT_SIDE * BACK_LANE.far, BACK_LANE.in],
        [ax, BACK_LANE.in],
        [ax, z],
        [x, z],
      ],
      1.2,
      8,
    ),
    reverse: smoothLane(
      [
        [x, z],
        [ax, z],
        [ax, turn],
      ],
      1.2,
      8,
    ),
    depart: smoothLane(
      [
        [ax, turn],
        [ax, BACK_LANE.out],
        [LOT_SIDE * BACK_LANE.far, BACK_LANE.out],
      ],
      0.9,
      6,
    ),
  };
}

/** A vehicle that has left the lot, driving off down the lane (its bay is already free). */
export interface Departing {
  id: string;
  kind: LotKind;
  color: string;
  t: number;
}

/** How long drivers stay (seconds on the motion clock): those already parked when the office opens are there for the day and leave a few at a time; a newcomer's visit is half an hour to an hour or so of the bank's day. */
export const STAY = { first: [120, 900], visit: [25, 70] } as const;
/** Seconds between newcomers setting off up the lane: one at a time through the gate, so the lot never takes in more than it lets out. */
export const ARRIVAL_GAP = [8, 18] as const;

/** The vehicle moving in the lot, wherever it is on its way. */
export interface MoverPose {
  id: string;
  kind: LotKind;
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

/** A vehicle `t` seconds into an eased drive along `path` (backing along it if `back`). */
function onPath(id: string, kind: LotKind, path: readonly V2[], t: number, back: boolean): MoverPose {
  const len = pathLength(path);
  const d = len * ease(Math.min(1, t / driveTime(len)));
  const [x, z] = pointAlongPath(path, d);
  const [px, pz] = pointAlongPath(path, Math.min(len, d + 0.05));
  const [bx, bz] = pointAlongPath(path, Math.max(0, d - 0.05));
  const yaw = yawOf(px - bx, pz - bz) + (back ? Math.PI : 0);
  return { id, kind, x, z, yaw, reversing: back };
}

/** The lot's turn, while the cash van has it. */
export const CIT_MOVER = 'cit-van';

const CAR_TONES = ['#e5e7eb', '#111827', '#991b1b', '#1e40af', '#6b7280', '#f8fafc', '#065f46', '#b45309'];
const MOTO_TONES = ['#dc2626', '#1d4ed8', '#111827', '#f59e0b', '#0f766e', '#7c3aed', '#e5e7eb'];

/** The car park and everything in it. Step it with the motion clock. */
export class ParkingLot {
  readonly slots: Slot[];
  vehicles: LotVehicle[] = [];
  /** The one vehicle allowed to move in the lot, or null. */
  mover: string | null = null;
  /** The cash van's run in through the gate and down the drive to its loading bay against the left wall. */
  readonly cit = new CitRun(citRoutes());
  t = 0;
  private serial = 0;
  private nextArrival: number;
  /** The last vehicle given the lot was leaving: the next turn goes to a newcomer, so the two take turns. */
  private lastLeft = false;
  /** The branch is closed to customers: nobody new parks, and everyone still inside walks back to their car. */
  private closed = false;

  /** Vehicles gone from the lot, driving off down the out-lane. */
  departing: Departing[] = [];

  constructor(fill = 0.35) {
    this.slots = slotsOf();
    // Start part full, staying for different lengths of time.
    for (const s of this.slots) if (rnd(s.index, 3) < fill) this.park(s, 'parked', STAY.first[0] + rnd(s.index, 5) * (STAY.first[1] - STAY.first[0]));
    this.nextArrival = 4;
  }

  private park(s: Slot, phase: Phase, stay: number): LotVehicle {
    const n = this.serial++;
    const tones = s.kind === 'car' ? CAR_TONES : MOTO_TONES;
    const v: LotVehicle = { id: `${s.kind}-${n}`, kind: s.kind, color: tones[n % tones.length]!, slot: s.index, phase, t: 0, stay };
    s.occupiedBy = v.id;
    this.vehicles.push(v);
    return v;
  }

  /** Whether bay `i` is taken (parked, reserved, or being left). */
  isOccupied(i: number): boolean {
    return this.slots[i]!.occupiedBy !== null;
  }

  /** The free bays (of one kind). */
  vacant(kind?: LotKind): Slot[] {
    return this.slots.filter((s) => s.occupiedBy === null && (!kind || s.kind === kind));
  }

  /** Opens or closes the branch to customers. */
  setClosed(closed: boolean): void {
    if (closed === this.closed) return;
    this.closed = closed;
    if (!closed) {
      this.nextArrival = this.t + 2;
      return;
    }
    for (const v of this.vehicles) {
      if (v.phase === 'parked' || v.phase === 'approaching' || v.phase === 'arriving') v.stay = 0;
      if (v.phase === 'walkingIn') {
        // Turn round where they are.
        const len = pathLength(walkPath(this.slots[v.slot]!));
        v.phase = 'walkingOut';
        v.t = Math.max(0, len / WALK_PACE - v.t);
      }
    }
  }

  /** One step; `walkers` are the other people on foot near the lot (customers walking in to the side doors), whom the cash van gives way to as well. */
  step(dt: number, walkers: readonly V2[] = []): void {
    const h = Math.min(Math.max(dt, 0), 0.1);
    this.t += h;
    // People on foot stop for the cash van while it drives past them.
    const onFoot = this.walkers();
    const waiting = new Set(onFoot.filter((w) => this.cit.makesWait([w.x, w.z])).map((w) => w.id));
    for (const v of this.vehicles) if (!waiting.has(v.id)) v.t += h;
    for (const d of this.departing) d.t += h;
    // Down the lane and out of sight: gone.
    this.departing = this.departing.filter((d) => d.t < driveTime(pathLength(departPath())));
    for (const v of [...this.vehicles]) {
      const s = this.slots[v.slot]!;
      if (v.phase === 'approaching' && v.t >= driveTime(pathLength(approachPath()))) {
        // Waiting on the lane for the lot's turn (handed out below).
        v.t = driveTime(pathLength(approachPath()));
      } else if (v.phase === 'arriving' && v.t >= driveTime(pathLength(arrivalPath(s)))) {
        // In the bay: the lot is free for the next vehicle, and the driver walks off to the branch (after hours, they only turn round).
        v.phase = this.closed ? 'ready' : 'walkingIn';
        v.t = 0;
        this.mover = null;
      } else if (v.phase === 'walkingIn' && v.t >= pathLength(walkPath(s)) / WALK_PACE) {
        v.phase = 'parked';
        v.t = 0;
      } else if (v.phase === 'parked' && v.t >= v.stay) {
        // Their stay is up: back from the counter to the car (on foot, so the lot need not be still).
        v.phase = 'walkingOut';
        v.t = 0;
      } else if (v.phase === 'walkingOut' && v.t >= pathLength(walkPath(s)) / WALK_PACE) {
        // At the car, waiting for the lot to be still to drive off.
        v.phase = 'ready';
        v.t = 0;
      } else if (v.phase === 'leaving') {
        const { reverse, forward } = leavingPaths(s);
        if (v.t >= driveTime(pathLength(reverse)) + driveTime(pathLength(forward))) {
          // Out through the gate onto the lane: the bay is free again, the lot is the next vehicle's, and it drives off.
          s.occupiedBy = null;
          this.vehicles = this.vehicles.filter((x) => x !== v);
          this.departing.push({ id: v.id, kind: v.kind, color: v.color, t: 0 });
          this.mover = null;
        }
      }
    }
    // The cash van drives in (or backs out and leaves) only while the lot is still and its lane is clear, and holds the lot's turn while it drives; it gives way to anyone on foot in front of it.
    const laneFree = this.cit.phase === 'away' ? !this.vehicles.some((v) => v.phase === 'approaching') : this.cit.phase === 'close' ? this.departing.length === 0 : true;
    this.cit.step(h, this.mover === null && laneFree, [...onFoot.map((w): V2 => [w.x, w.z]), ...walkers]);
    if (this.cit.needsLane()) {
      if (this.mover === null) this.mover = CIT_MOVER;
    } else if (this.mover === CIT_MOVER) this.mover = null;
    // A newcomer sets off up the lane (one at a time, and not while the cash van is on it) and takes a free bay; it needs the lot only at the gate.
    const approaching = this.vehicles.find((v) => v.phase === 'approaching');
    if (!approaching && !this.closed && this.t >= this.nextArrival && this.cit.phase !== 'arrive' && !this.cit.wantsIn()) {
      this.nextArrival = this.t + ARRIVAL_GAP[0] + rnd(this.serial, 7) * (ARRIVAL_GAP[1] - ARRIVAL_GAP[0]);
      // A car or a motorbike, to a free bay of its kind (or of the other kind, if its own are all taken).
      const want: LotKind = rnd(this.serial, 6) < 0.55 ? 'car' : 'moto';
      const free = this.vacant(want).length ? this.vacant(want) : this.vacant();
      if (free.length > 0) {
        const s = free[Math.floor(rnd(this.serial, 8) * free.length)]!;
        this.park(s, 'approaching', STAY.visit[0] + rnd(this.serial, 9) * (STAY.visit[1] - STAY.visit[0]));
      }
    }
    if (this.mover !== null) return;
    // The cash van waiting to back out has the next turn: nobody else is given the lot meanwhile.
    if (this.cit.wantsOut()) return;
    // The lot is still: whoever has waited longest at their car drives off (they have the lot until they are through the gate), or else the newcomer waiting on the lane drives in; the two take turns.
    const ready = this.vehicles.filter((v) => v.phase === 'ready');
    // The cash van due in goes next: the newcomer at the gate drives in to clear its lane, nobody drives out meanwhile.
    const due = this.cit.wantsIn() ? undefined : ready.reduce<LotVehicle | undefined>((a, v) => (a && a.t >= v.t ? a : v), undefined);
    const atGate = this.vehicles.find((v) => v.phase === 'approaching' && v.t >= driveTime(pathLength(approachPath())));
    // With more than one driver back at their car, the lot lets them out first: a backlog never builds up inside it.
    const backlog = ready.length > 1;
    if (due && (backlog || !(atGate && this.lastLeft))) {
      due.phase = 'leaving';
      due.t = 0;
      this.mover = due.id;
      this.lastLeft = true;
      return;
    }
    if (!atGate) return;
    atGate.phase = 'arriving';
    atGate.t = 0;
    this.mover = atGate.id;
    this.lastLeft = false;
  }

  /** The vehicles on the lane behind the block: coming up to the lot (or waiting at it), and driving off. */
  lanePoses(): Array<MoverPose & { color: string }> {
    const out: Array<MoverPose & { color: string }> = [];
    for (const v of this.vehicles) if (v.phase === 'approaching') out.push({ ...onPath(v.id, v.kind, approachPath(), v.t, false), color: v.color });
    for (const d of this.departing) out.push({ ...onPath(d.id, d.kind, departPath(), d.t, false), color: d.color });
    return out;
  }

  /** Where the moving vehicle is, or null when the lot is still. */
  moverPose(): MoverPose | null {
    const v = this.vehicles.find((x) => x.id === this.mover);
    if (!v || (v.phase !== 'arriving' && v.phase !== 'leaving')) return null;
    const s = this.slots[v.slot]!;
    if (v.phase === 'arriving') return onPath(v.id, v.kind, arrivalPath(s), v.t, false);
    const { reverse, forward } = leavingPaths(s);
    const tr = driveTime(pathLength(reverse));
    return v.t < tr ? onPath(v.id, v.kind, reverse, v.t, true) : onPath(v.id, v.kind, forward, v.t - tr, false);
  }

  /** The vehicles standing in their bays (including one whose driver is walking to or from it). */
  parked(): Array<{ v: LotVehicle; slot: Slot }> {
    return this.vehicles.filter((v) => v.phase === 'walkingIn' || v.phase === 'parked' || v.phase === 'walkingOut' || v.phase === 'ready').map((v) => ({ v, slot: this.slots[v.slot]! }));
  }

  /** People walking between their bay and the branch. */
  walkers(): Array<{ id: string; x: number; z: number; heading: number }> {
    const out: Array<{ id: string; x: number; z: number; heading: number }> = [];
    for (const v of this.vehicles) {
      if (v.phase !== 'walkingIn' && v.phase !== 'walkingOut') continue;
      const path = walkPath(this.slots[v.slot]!);
      const p = v.phase === 'walkingIn' ? path : [...path].reverse();
      const len = pathLength(p);
      const d = Math.min(len, v.t * WALK_PACE);
      const [x, z] = pointAlongPath(p, d);
      const [px, pz] = pointAlongPath(p, Math.min(len, d + 0.05));
      out.push({ id: v.id, x, z, heading: Math.atan2(px - x, pz - z) });
    }
    return out;
  }

  /** How far the barrier is up, 0-1: up while the moving vehicle is near the gate. */
  barrier(): number {
    const m = this.mover === CIT_MOVER ? this.cit.pose() : this.moverPose();
    if (!m) return 0;
    return Math.abs(m.z - LOT.gateZ) < 3.2 && Math.abs(Math.abs(m.x) - AISLE) < 3 ? 1 : 0;
  }
}

// The guards' shifts

/** Three eight-hour shifts a day: 06:00-14:00, 14:00-22:00 and 22:00-06:00. */
export const SHIFT_HOURS = 8;
export const shiftOf = (minute: number): 0 | 1 | 2 => (Math.floor(((((minute / 60 - 6) % 24) + 24) % 24) / SHIFT_HOURS) % 3) as 0 | 1 | 2;

/** How long a handover takes on the motion clock: the new guard walks in from the lane, the old one walks off. */
export const HANDOVER_S = 9;

/** The guard's post by the gate, beside the drive, and where guards come and go (the lane behind the block). */
export const GUARD_POST: V2 = [LOT_SIDE * (AISLE + 1.75), LOT.gateZ + 0.6];
export const GUARD_DOOR: V2 = [LOT_SIDE * (AISLE + 1.75), BACK_LANE.out - 0.6];

/** Where a guard on post is at time `t`: standing at the post facing the lane, now and then pacing beside the gate towards the lane and back (a slow patrol, clear of the drive, of the bays and of the guard's cabin next to the post). */
export function guardPatrol(t: number): { at: V2; heading: number; walking: boolean } {
  const cycle = 24;
  const u = ((t % cycle) + cycle) % cycle;
  // Stand for 14 s, walk 1.6 m towards the lane for 5 s, and back for 5 s.
  if (u < 14) return { at: GUARD_POST, heading: Math.PI, walking: false };
  const out = u < 19;
  const k = out ? (u - 14) / 5 : 1 - (u - 19) / 5;
  return { at: [GUARD_POST[0], GUARD_POST[1] - PATROL * k], heading: out ? Math.PI : 0, walking: true };
}
/** How far the patrol goes. */
export const PATROL = 1.6;

/** A handover `t` seconds in: the incoming guard walking from the lane to the post, the outgoing one walking away. */
export function handoverAt(t: number): { incoming: V2; outgoing: V2; done: boolean } {
  const k = Math.max(0, Math.min(1, t / HANDOVER_S));
  // The new guard arrives over the first two thirds; the old one stays to hand over, then leaves over the last two thirds.
  const inK = Math.min(1, k * 1.5);
  const outK = Math.max(0, (k - 1 / 3) * 1.5);
  const lerp = (a: V2, b: V2, u: number): V2 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  return { incoming: lerp(GUARD_DOOR, GUARD_POST, inK), outgoing: lerp([GUARD_POST[0] - LOT_SIDE * 0.7, GUARD_POST[1]], GUARD_DOOR, outK), done: k >= 1 };
}
