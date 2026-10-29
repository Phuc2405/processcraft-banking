import { deskPose, FLOOR_SLAB, smoothLane, type V2 } from './layout3d';
import { pathLength, pointAlongPath } from './tour3d';
import { LENGTH, WIDTH } from './vehicles';

/**
 * The armoured cash-in-transit van's run to the vault. It comes along the lane behind the block, indicates and pulls into
 * its painted loading bay against the back wall, right behind the Risk Vault; stops; its guard opens the rear doors and
 * carries the cash (boxes and a bag) one at a time from the van to the vault's loading door, which rolls up while they
 * work; then the doors are shut, and the van indicates, pulls out and drives off along the lane. Pure and stepped on the
 * motion clock, so it freezes on pause and keeps pace with the speed multiplier.
 *
 * The van shares the lane with the cars turning in and out of the car park, so it only sets off past the car park's gate
 * when the car park lets it (ParkingLot gives it the lane, as it would its own mover): nothing ever drives into it.
 */

const HZ = FLOOR_SLAB.d / 2;

/** The painted bay: where the van stands (its middle), and the bay's size. Along the back wall behind the vault. */
export const LOADING_BAY = (() => {
  const x = deskPose('SEC_VAULT').x + 1.1;
  return { x, z: -HZ - 0.95, len: LENGTH.cit + 1.0, w: WIDTH.cit + 0.35 } as const;
})();

/** The vault's loading door in the back wall: just behind the van's rear doors, where the guard hands the cash in. */
export const LOADING_DOOR: V2 = [LOADING_BAY.x - LENGTH.cit / 2 - 1.4, -HZ - 0.2];
/** Where the guard takes each load from, at the van's open rear doors. */
export const VAN_REAR: V2 = [LOADING_BAY.x - LENGTH.cit / 2 - 0.45, LOADING_BAY.z];

/** How fast the van drives, and how long each step of its stop takes (seconds on the motion clock). */
export const CIT_RUN = { speed: 5, doors: 1.2, pick: 0.6, hand: 0.7, pace: 0.9, signal: 9, gapMin: 70, gapMax: 100, first: 20 } as const;
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
  /** The indicator: +1 towards the building (pulling in), -1 towards the lane (pulling out), 0 off. */
  signal: -1 | 0 | 1;
  guard: { at: V2; heading: number; walking: boolean; carrying: Load | null } | null;
}

const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const driveTime = (len: number): number => len / CIT_RUN.speed + 1.2;
const yawOf = (dx: number, dz: number): number => Math.atan2(-dz, dx);
const rnd = (k: number): number => {
  const x = Math.sin(k * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
};

/** One trip of the guard: pick a load up at the van, carry it to the door, hand it in, walk back. */
const TRIP_LEN = Math.hypot(LOADING_DOOR[0] - VAN_REAR[0], LOADING_DOOR[1] - VAN_REAR[1]);
const TRIP_S = CIT_RUN.pick + (2 * TRIP_LEN) / CIT_RUN.pace + CIT_RUN.hand;
export const LOAD_S = LOADS.length * TRIP_S;

export class CitRun {
  phase: CitPhase = 'away';
  /** Seconds into the phase. */
  t = 0;
  runs = 0;
  private due: number = CIT_RUN.first;
  readonly arrive: V2[];
  readonly depart: V2[];

  /** `laneZ`: the middle of the lane it drives in; `far`: how far out along it the van comes from and goes to; `gateX`: the
   * car park's gate, which the van passes on its way in. */
  constructor(
    readonly laneZ: number,
    readonly far: number,
    readonly gateX: number,
  ) {
    const { x, z } = LOADING_BAY;
    this.arrive = smoothLane(
      [
        [-far, laneZ],
        [x - 5, laneZ],
        [x - 1.5, z],
        [x, z],
      ],
      1.6,
      8,
    );
    this.depart = smoothLane(
      [
        [x, z],
        [x + 1.5, z],
        [x + 5, laneZ],
        [far, laneZ],
      ],
      1.6,
      8,
    );
  }

  /** Steps the run on; `laneFree` says whether the van may set off past the car park's gate now. */
  step(dt: number, laneFree: boolean): void {
    this.t += dt;
    switch (this.phase) {
      case 'away':
        if (this.t >= this.due && laneFree) this.next('arrive');
        break;
      case 'arrive':
        if (this.t >= driveTime(pathLength(this.arrive))) this.next('open');
        break;
      case 'open':
        if (this.t >= CIT_RUN.doors) this.next('load');
        break;
      case 'load':
        if (this.t >= LOAD_S) this.next('close');
        break;
      case 'close':
        if (this.t >= CIT_RUN.doors) this.next('depart');
        break;
      case 'depart':
        if (this.t >= driveTime(pathLength(this.depart))) {
          this.runs++;
          this.due = CIT_RUN.gapMin + rnd(this.runs) * (CIT_RUN.gapMax - CIT_RUN.gapMin);
          this.next('away');
        }
        break;
    }
  }

  private next(phase: CitPhase): void {
    this.phase = phase;
    this.t = 0;
  }

  /** Whether the van is still on the stretch of lane the car park's traffic uses (up to just past the gate). */
  needsLane(): boolean {
    if (this.phase !== 'arrive') return false;
    return this.pose().x - LENGTH.cit / 2 < this.gateX + 3.5;
  }

  pose(): CitPose {
    const { x, z } = LOADING_BAY;
    const still = (doors: number, shutter: number, guard: CitPose['guard'], signal: CitPose['signal'] = 0): CitPose => ({ phase: this.phase, x, z, yaw: 0, doors, shutter, signal, guard });
    const on = (path: readonly V2[], signal: CitPose['signal']): CitPose => {
      const len = pathLength(path);
      const d = len * ease(Math.min(1, this.t / driveTime(len)));
      const [px, pz] = pointAlongPath(path, d);
      const [ax, az] = pointAlongPath(path, Math.min(len, d + 0.05));
      const [bx, bz] = pointAlongPath(path, Math.max(0, d - 0.05));
      return { phase: this.phase, x: px, z: pz, yaw: yawOf(ax - bx, az - bz), doors: 0, shutter: 0, signal, guard: null };
    };
    switch (this.phase) {
      case 'away':
        // Out of sight, past the end of the lane.
        return { phase: this.phase, x: this.far, z: this.laneZ, yaw: 0, doors: 0, shutter: 0, signal: 0, guard: null };
      case 'arrive': {
        // Indicating towards the bay over the last stretch in.
        const left = pathLength(this.arrive) * (1 - ease(Math.min(1, this.t / driveTime(pathLength(this.arrive)))));
        return on(this.arrive, left < CIT_RUN.signal ? 1 : 0);
      }
      case 'open': {
        const k = Math.min(1, this.t / CIT_RUN.doors);
        return still(k, k, k > 0.6 ? { at: VAN_REAR, heading: -Math.PI / 2, walking: false, carrying: null } : null);
      }
      case 'load':
        return still(1, 1, this.guardAt(this.t));
      case 'close': {
        const k = Math.max(0, 1 - this.t / CIT_RUN.doors);
        return still(k, k, null, -1);
      }
      case 'depart':
        // Indicating out into the lane until it is out.
        return on(this.depart, this.t < 2.6 ? -1 : 0);
    }
  }

  /** The guard `t` seconds into the loading: at the van, walking to the door with a load, handing it in, walking back. */
  private guardAt(t: number): NonNullable<CitPose['guard']> {
    const trip = Math.min(LOADS.length - 1, Math.floor(t / TRIP_S));
    const u = t - trip * TRIP_S;
    const load = LOADS[trip]!;
    const walk = TRIP_LEN / CIT_RUN.pace;
    const toDoor = Math.atan2(LOADING_DOOR[0] - VAN_REAR[0], LOADING_DOOR[1] - VAN_REAR[1]);
    const toVan = Math.atan2(VAN_REAR[0] - LOADING_DOOR[0], VAN_REAR[1] - LOADING_DOOR[1]);
    const lerp = (k: number): V2 => [VAN_REAR[0] + (LOADING_DOOR[0] - VAN_REAR[0]) * k, VAN_REAR[1] + (LOADING_DOOR[1] - VAN_REAR[1]) * k];
    // Taking the load out of the back of the van (facing it).
    if (u < CIT_RUN.pick) return { at: VAN_REAR, heading: Math.PI / 2, walking: false, carrying: u > CIT_RUN.pick / 2 ? load : null };
    if (u < CIT_RUN.pick + walk) return { at: lerp((u - CIT_RUN.pick) / walk), heading: toDoor, walking: true, carrying: load };
    // Handing it in at the door.
    if (u < CIT_RUN.pick + walk + CIT_RUN.hand) return { at: LOADING_DOOR, heading: Math.PI, walking: false, carrying: u < CIT_RUN.pick + walk + CIT_RUN.hand / 2 ? load : null };
    return { at: lerp(1 - Math.min(1, (u - CIT_RUN.pick - walk - CIT_RUN.hand) / walk)), heading: toVan, walking: true, carrying: null };
  }
}
