import { FLOOR_SLAB, type V2 } from '../plan/layout3d';
import { pathLength, pointAlongPath } from '../plan/path';
import { LENGTH, WIDTH } from './vehicles';

/**
 * The armoured cash-in-transit van's run to the vault. It comes along the lane behind the block, indicates, turns in at
 * the car park's gate and drives down the drive to its own painted loading bay in the car park's inner row, against the
 * branch's left wall, where the camera looks straight at it; noses in and stops. Its guard opens the rear doors and carries
 * the cash (boxes and a bag) one at a time from the back of the van, round its side to the vault's loading door in the
 * left wall, which rolls up while they work and where one of the vault's staff takes each load in; then the doors are
 * shut, and the van indicates, backs out, and drives back up the drive and away along the lane. Pure and stepped on the
 * motion clock, so it freezes on pause and keeps pace with the speed multiplier.
 *
 * The van shares the drive with the car park's own traffic, so it only drives in or out while the car park is still, and
 * holds the car park's turn (ParkingLot gives it the lot as it would its own mover) until it is in its bay or gone: nothing
 * ever drives into it. Its bay is kept clear of the car bays, so standing there it is in nobody's way.
 */

const HX = FLOOR_SLAB.w / 2;

/** The painted bay: where the van stands (its middle) nose-in to the left wall, and the bay's size (`len` across the
 * row, `w` along it). Between the second and third side doors, where none of the car park's walkways run. */
export const LOADING_BAY = (() => {
  const len = LENGTH.cit + 0.5;
  return { x: -(HX + 0.35 + LENGTH.cit / 2), z: -4.6, len, w: WIDTH.cit + 0.7 } as const;
})();

/** The vault's loading door in the left wall, just past the van's nose on its door side; where the guard hands the cash in. */
export const LOADING_DOOR: V2 = [-HX - 0.2, LOADING_BAY.z + 1.25];
/** Where the guard takes each load from, behind the van's open rear doors. */
export const VAN_REAR: V2 = [LOADING_BAY.x - LENGTH.cit / 2 - 0.4, LOADING_BAY.z];

/** The guard's walk with each load: from the back of the van, round its corner and along its side to the loading door. */
export const CARRY_PATH: readonly V2[] = [VAN_REAR, [VAN_REAR[0], LOADING_BAY.z + WIDTH.cit / 2 + 0.45], [-HX - 0.55, LOADING_BAY.z + WIDTH.cit / 2 + 0.45], LOADING_DOOR];

/** How fast the van drives, and how long each step of its stop takes (seconds on the motion clock). */
export const CIT_RUN = { speed: 5, doors: 1.2, pick: 0.6, hand: 0.7, pace: 0.9, signal: 6, gapMin: 70, gapMax: 100, first: 20 } as const;
/** What the guard carries, trip by trip. */
export const LOADS = ['box', 'bag', 'box'] as const;
export type Load = (typeof LOADS)[number];

export type CitPhase = 'away' | 'arrive' | 'open' | 'load' | 'close' | 'depart';

export interface CitPose {
  phase: CitPhase;
  x: number;
  z: number;
  /** Yaw about y: 0 faces +x. */
  yaw: number;
  /** How far the rear doors are open, 0-1; how far the vault's loading door has rolled up, 0-1. */
  doors: number;
  shutter: number;
  /** The indicator: 1 left, -1 right (as the driver sits), 0 off. */
  signal: -1 | 0 | 1;
  /** Backing out of the bay. */
  reversing: boolean;
  guard: { at: V2; heading: number; walking: boolean; carrying: Load | null } | null;
}

/** The van's drives, from the car park (parking.ts lays them along its drive): in to the bay; backing out of it; and away. */
export interface CitRoutes {
  arrive: readonly V2[];
  reverse: readonly V2[];
  depart: readonly V2[];
}

const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const driveTime = (len: number): number => len / CIT_RUN.speed + 1.2;
const yawOf = (dx: number, dz: number): number => Math.atan2(-dz, dx);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const rnd = (k: number): number => {
  const x = Math.sin(k * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
};

/** One trip of the guard: pick a load up at the van, carry it to the door, hand it in, walk back. */
const TRIP_LEN = pathLength(CARRY_PATH);
const TRIP_S = CIT_RUN.pick + (2 * TRIP_LEN) / CIT_RUN.pace + CIT_RUN.hand;
export const LOAD_S = LOADS.length * TRIP_S;

/** Which way a drive along `path` turns over the next few metres from `d`: 1 left, -1 right, 0 (nearly) straight on. */
export function turnAhead(path: readonly V2[], d: number, look: number = CIT_RUN.signal): -1 | 0 | 1 {
  const len = pathLength(path);
  const at = (s: number): number => {
    const [ax, az] = pointAlongPath(path, Math.min(len, s + 0.05));
    const [bx, bz] = pointAlongPath(path, Math.max(0, s - 0.05));
    return yawOf(ax - bx, az - bz);
  };
  const turn = wrap(at(Math.min(len - 0.06, d + look)) - at(Math.max(0.06, d)));
  return Math.abs(turn) < 0.5 ? 0 : turn > 0 ? 1 : -1;
}

export class CitRun {
  phase: CitPhase = 'away';
  /** Seconds into the phase. */
  t = 0;
  runs = 0;
  private due: number = CIT_RUN.first;

  constructor(readonly routes: CitRoutes) {}

  /** Steps the run on; `lotFree` says whether the car park is still, so the van may drive in or out now. */
  step(dt: number, lotFree: boolean): void {
    this.t += dt;
    switch (this.phase) {
      case 'away':
        if (this.t >= this.due && lotFree) this.next('arrive');
        break;
      case 'arrive':
        if (this.t >= driveTime(pathLength(this.routes.arrive))) this.next('open');
        break;
      case 'open':
        if (this.t >= CIT_RUN.doors) this.next('load');
        break;
      case 'load':
        if (this.t >= LOAD_S) this.next('close');
        break;
      case 'close':
        // Shut up, then waits for the car park to be still before backing out.
        if (this.t >= CIT_RUN.doors && lotFree) this.next('depart');
        break;
      case 'depart':
        if (this.t >= this.departS()) {
          this.runs++;
          this.due = CIT_RUN.gapMin + rnd(this.runs) * (CIT_RUN.gapMax - CIT_RUN.gapMin);
          this.next('away');
        }
        break;
    }
  }

  private departS(): number {
    return driveTime(pathLength(this.routes.reverse)) + driveTime(pathLength(this.routes.depart));
  }

  private next(phase: CitPhase): void {
    this.phase = phase;
    this.t = 0;
  }

  /** Whether the van is driving in the car park (or on its way in or out through the gate): it has the lot's turn. */
  needsLane(): boolean {
    return this.phase === 'arrive' || this.phase === 'depart';
  }

  pose(): CitPose {
    const { x, z } = LOADING_BAY;
    const still = (doors: number, shutter: number, guard: CitPose['guard'], signal: CitPose['signal'] = 0): CitPose => ({ phase: this.phase, x, z, yaw: 0, doors, shutter, signal, reversing: false, guard });
    const on = (path: readonly V2[], t: number, back: boolean, signal: boolean): CitPose => {
      const len = pathLength(path);
      const d = len * ease(Math.min(1, t / driveTime(len)));
      const [px, pz] = pointAlongPath(path, d);
      const [ax, az] = pointAlongPath(path, Math.min(len, d + 0.05));
      const [bx, bz] = pointAlongPath(path, Math.max(0, d - 0.05));
      const yaw = yawOf(ax - bx, az - bz) + (back ? Math.PI : 0);
      return { phase: this.phase, x: px, z: pz, yaw, doors: 0, shutter: 0, signal: signal ? turnAhead(path, d) : 0, reversing: back, guard: null };
    };
    switch (this.phase) {
      case 'away': {
        // Out of sight, past the end of the lane.
        const [fx, fz] = this.routes.arrive[0]!;
        return { phase: this.phase, x: fx, z: fz, yaw: 0, doors: 0, shutter: 0, signal: 0, reversing: false, guard: null };
      }
      case 'arrive':
        // Indicating before each turn: into the car park's gate, and into the bay.
        return on(this.routes.arrive, this.t, false, true);
      case 'open': {
        const k = Math.min(1, this.t / CIT_RUN.doors);
        return still(k, k, k > 0.6 ? { at: VAN_REAR, heading: Math.PI / 2, walking: false, carrying: null } : null);
      }
      case 'load':
        return still(1, 1, this.guardAt(this.t));
      case 'close': {
        const k = Math.max(0, 1 - this.t / CIT_RUN.doors);
        // Indicating out once it is shut up and waiting to back out.
        return still(k, k, null, k === 0 ? turnAhead(this.routes.depart, 0, 4) || 1 : 0);
      }
      case 'depart': {
        const tr = driveTime(pathLength(this.routes.reverse));
        if (this.t < tr) return { ...on(this.routes.reverse, this.t, true, false), signal: turnAhead(this.routes.depart, 0, 4) || 1 };
        return on(this.routes.depart, this.t - tr, false, true);
      }
    }
  }

  /** The guard `t` seconds into the loading: at the van, walking to the door with a load, handing it in, walking back. */
  private guardAt(t: number): NonNullable<CitPose['guard']> {
    const trip = Math.min(LOADS.length - 1, Math.floor(t / TRIP_S));
    const u = t - trip * TRIP_S;
    const load = LOADS[trip]!;
    const walk = TRIP_LEN / CIT_RUN.pace;
    const along = (s: number, back: boolean): { at: V2; heading: number } => {
      const p = back ? [...CARRY_PATH].reverse() : CARRY_PATH;
      const d = Math.max(0, Math.min(TRIP_LEN, s));
      const at = pointAlongPath(p, d);
      const [ax, az] = pointAlongPath(p, Math.min(TRIP_LEN, d + 0.05));
      const [bx, bz] = pointAlongPath(p, Math.max(0, d - 0.05));
      return { at, heading: Math.atan2(ax - bx, az - bz) };
    };
    // Taking the load out of the back of the van (facing it).
    if (u < CIT_RUN.pick) return { at: VAN_REAR, heading: Math.PI / 2, walking: false, carrying: u > CIT_RUN.pick / 2 ? load : null };
    if (u < CIT_RUN.pick + walk) return { ...along((u - CIT_RUN.pick) * CIT_RUN.pace, false), walking: true, carrying: load };
    // Handing it in at the door (facing the wall).
    if (u < CIT_RUN.pick + walk + CIT_RUN.hand) return { at: LOADING_DOOR, heading: Math.PI / 2, walking: false, carrying: u < CIT_RUN.pick + walk + CIT_RUN.hand / 2 ? load : null };
    return { ...along((u - CIT_RUN.pick - walk - CIT_RUN.hand) * CIT_RUN.pace, true), walking: true, carrying: null };
  }
}
