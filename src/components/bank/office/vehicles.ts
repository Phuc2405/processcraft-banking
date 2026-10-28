import { ATM_ALCOVE, KERB_Z, ROAD_END, STREET, type V2 } from './layout3d';
import { BUS_STOP } from './weather';

/**
 * The traffic on the avenue in front of the branch: motorbikes (many carrying two), cars, green ride-hailing taxis and the
 * armoured cash-in-transit van that services the ATMs. A small driving simulation (TrafficSim), stepped every frame: each
 * vehicle looks ahead at the one in front and at its own kerbside stop, brakes smoothly to keep a safe distance, waits
 * behind a vehicle that has pulled in, and never closes up past MIN_GAP: nobody ever drives into or through anybody.
 *
 * Traffic keeps to the right. Seen from the pavement, the near lane runs towards -x and the far lane towards +x. Only the
 * near lane stops at the kerb: a taxi drops off or picks up at the bus stop (opening its kerbside door), a motorbike lets
 * its pillion passenger off, and the cash van pulls in by the ATM alcove while its guard carries a cash box to the machines
 * and back. Then they pull away and drive on, out past the end of the street (well out in the haze) before coming round
 * again: nothing vanishes in view.
 */

/** The road between the kerb and the far side, and the middle of each lane. */
export const ROAD = { z0: KERB_Z + STREET.kerbW, z1: ROAD_END } as const;
const roadW = ROAD.z1 - ROAD.z0;
export const LANE_Z = { near: ROAD.z0 + roadW * 0.27, far: ROAD.z0 + roadW * 0.73 } as const;

/** Where the traffic comes from and goes to: well past the drawn street, out of the haze. */
export const TRAFFIC_SPAN = { x0: -62, x1: 62 } as const;
export const SPAN = TRAFFIC_SPAN.x1 - TRAFFIC_SPAN.x0;

/** Bumper to bumper, the closest any two vehicles ever get (world units); and the distance they like to keep at speed. */
export const MIN_GAP = 0.8;
export const SAFE_GAP = 1.6;
/** How hard vehicles brake and pull away (units/s²). */
export const BRAKE = 4.5;
export const ACCEL = 2.4;

export type VehicleKind = 'motorbike' | 'sedan' | 'taxi' | 'cit';
export type StopKind = 'taxi' | 'pillion' | 'cit';

export interface Stop {
  kind: StopKind;
  x: number;
  /** Seconds standing at the kerb. */
  wait: number;
}

export interface Vehicle {
  id: string;
  kind: VehicleKind;
  lane: 'near' | 'far';
  /** Cruising speed, world units a second. */
  speed: number;
  /** Where along its lane it starts (world units from the lane's start). */
  start: number;
  color: string;
  /** A motorbike carrying a passenger on the back seat. */
  pillion: boolean;
  stop?: Stop;
}

/** Bumper-to-bumper length of each kind. */
export const LENGTH: Record<VehicleKind, number> = { motorbike: 1.2, sedan: 2.1, taxi: 2.1, cit: 2.5 };

const BUS_X = (BUS_STOP.x0 + BUS_STOP.x1) / 2;
const ALCOVE_X = (ATM_ALCOVE.x0 + ATM_ALCOVE.x1) / 2;

/** The fleet, spread out along both lanes. */
export const VEHICLES: readonly Vehicle[] = [
  { id: 'taxi-1', kind: 'taxi', lane: 'near', speed: 5, start: 0, color: '#16a34a', pillion: false, stop: { kind: 'taxi', x: BUS_X, wait: 5 } },
  { id: 'moto-1', kind: 'motorbike', lane: 'near', speed: 5.6, start: 20, color: '#dc2626', pillion: true, stop: { kind: 'pillion', x: -5.5, wait: 2.6 } },
  { id: 'sedan-1', kind: 'sedan', lane: 'near', speed: 6, start: 40, color: '#e5e7eb', pillion: false },
  { id: 'moto-2', kind: 'motorbike', lane: 'near', speed: 6.2, start: 58, color: '#1d4ed8', pillion: false },
  { id: 'cit-1', kind: 'cit', lane: 'near', speed: 4.6, start: 78, color: '#334155', pillion: false, stop: { kind: 'cit', x: ALCOVE_X, wait: 14 } },
  { id: 'moto-3', kind: 'motorbike', lane: 'near', speed: 5.4, start: 100, color: '#0f766e', pillion: true, stop: { kind: 'pillion', x: 3.2, wait: 2.6 } },
  { id: 'sedan-2', kind: 'sedan', lane: 'far', speed: 6.5, start: 0, color: '#1e3a8a', pillion: false },
  { id: 'moto-4', kind: 'motorbike', lane: 'far', speed: 7, start: 24, color: '#f59e0b', pillion: true },
  { id: 'taxi-2', kind: 'taxi', lane: 'far', speed: 6, start: 50, color: '#16a34a', pillion: false },
  { id: 'moto-5', kind: 'motorbike', lane: 'far', speed: 6.8, start: 75, color: '#7c3aed', pillion: false },
  { id: 'sedan-3', kind: 'sedan', lane: 'far', speed: 6.3, start: 100, color: '#b91c1c', pillion: false },
];

/** How far off the lane centre a vehicle pulls in at the kerb, towards the pavement. */
const PULL_Z: Record<VehicleKind, number> = { motorbike: ROAD.z0 + 0.5, sedan: ROAD.z0 + 0.85, taxi: ROAD.z0 + 0.85, cit: ROAD.z0 + 1.0 };
/** Over how many units before and after its stop a vehicle eases in to the kerb and back out. */
const PULL_RUN = 6;

export interface VehicleState {
  x: number;
  z: number;
  /** Radians about y: 0 drives towards +x. */
  heading: number;
  /** How many times round the street it has been (taxis alternate drop-off and pick-up). */
  cycle: number;
  /** Seconds since it came to a stop at the kerb, or null on the move. */
  stoppedFor: number | null;
  /** Seconds since its kerbside stop this lap began (it keeps counting after it drives off), or null. */
  sinceStop: number | null;
  /** How far ahead its stop still is this lap (world units), or null once it has stopped. */
  toStop: number | null;
  /** How far it has pulled in to the kerb, 0-1. */
  pull: number;
  speed: number;
  /** How far its kerbside door is open, 0-1 (a taxi). */
  door: number;
}

interface Driving {
  v: Vehicle;
  /** Distance driven since the start of its lane (keeps growing; the lap is s / SPAN). */
  s: number;
  speed: number;
  /** The lap whose stop it has made. */
  doneLap: number;
  stoppedAt: number | null;
  lastStopAt: number | null;
  lastStopLap: number;
}

const startX = (v: Vehicle): number => (v.lane === 'near' ? TRAFFIC_SPAN.x1 : TRAFFIC_SPAN.x0);
const dirOf = (v: Vehicle): number => (v.lane === 'near' ? -1 : 1);
/** Where along its lane a vehicle's stop is. */
const stopS = (v: Vehicle): number => (v.stop ? Math.abs(v.stop.x - startX(v)) : 0);
const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** The driving simulation: step it with the frame time, read each vehicle's state. */
export class TrafficSim {
  t = 0;
  private cars: Driving[];

  constructor(fleet: readonly Vehicle[] = VEHICLES) {
    this.cars = fleet.map((v) => ({ v, s: v.start, speed: v.speed, doneLap: -1, stoppedAt: null, lastStopAt: null, lastStopLap: -1 }));
  }

  /** Bumper-to-bumper gap from `a` to the vehicle in front of it in its lane (round the ring), and that vehicle. */
  gapAhead(a: Driving): { gap: number; lead: Driving | null } {
    let best: Driving | null = null;
    let bestD = Infinity;
    for (const b of this.cars) {
      if (b === a || b.v.lane !== a.v.lane) continue;
      const d = mod(b.s - a.s, SPAN);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) return { gap: Infinity, lead: null };
    return { gap: bestD - (LENGTH[a.v.kind] + LENGTH[best.v.kind]) / 2, lead: best };
  }

  step(dt: number): void {
    const h = Math.min(Math.max(dt, 0), 0.1);
    this.t += h;
    // Leaders first, so each follower brakes for where the vehicle in front has got to now.
    const order = [...this.cars].sort((a, b) => this.gapAhead(b).gap - this.gapAhead(a).gap);
    for (const c of order) {
      const lap = Math.floor(c.s / SPAN);
      // Standing at the kerb.
      if (c.stoppedAt !== null) {
        if (this.t - c.stoppedAt >= c.v.stop!.wait) {
          c.doneLap = lap;
          c.stoppedAt = null;
        } else {
          c.speed = 0;
          continue;
        }
      }
      const { gap } = this.gapAhead(c);
      // The fastest it may go and still stop in time: behind the vehicle in front, and at its own stop.
      let limit = c.v.speed;
      limit = Math.min(limit, Math.sqrt(2 * BRAKE * Math.max(0, gap - SAFE_GAP)));
      const pending = c.v.stop && c.doneLap < lap ? stopS(c.v) - mod(c.s, SPAN) : null;
      if (pending !== null && pending >= -0.01) limit = Math.min(limit, Math.sqrt(2 * BRAKE * Math.max(0, pending)));
      c.speed = limit < c.speed ? Math.max(limit, c.speed - BRAKE * 2 * h) : Math.min(limit, c.speed + ACCEL * h);
      let move = c.speed * h;
      if (pending !== null && pending >= -0.01 && move >= pending - 0.02 && c.speed < 1.2) {
        // Arrived at the kerb.
        move = Math.max(0, pending);
        c.s += move;
        c.speed = 0;
        c.stoppedAt = this.t;
        c.lastStopAt = this.t;
        c.lastStopLap = lap;
        continue;
      }
      // Never closer than MIN_GAP to the vehicle in front, whatever happens.
      move = Math.min(move, Math.max(0, gap - MIN_GAP));
      c.s += move;
      if (move < c.speed * h) c.speed = move / Math.max(h, 1e-6);
    }
  }

  /** Every vehicle's state now. */
  states(): Map<string, VehicleState> {
    return new Map(this.cars.map((c) => [c.v.id, this.stateOf(c)]));
  }

  state(id: string): VehicleState {
    return this.stateOf(this.cars.find((c) => c.v.id === id)!);
  }

  /** The bumper-to-bumper gaps in each lane, for checking that nobody overlaps. */
  gaps(): number[] {
    return this.cars.map((c) => this.gapAhead(c).gap).filter(Number.isFinite);
  }

  private stateOf(c: Driving): VehicleState {
    const v = c.v;
    const lap = Math.floor(c.s / SPAN);
    const along = mod(c.s, SPAN);
    const x = startX(v) + dirOf(v) * along;
    const laneZ = LANE_Z[v.lane];
    let pull = 0;
    let toStop: number | null = null;
    if (v.stop) {
      const d = stopS(v) - along;
      if (c.stoppedAt !== null) pull = 1;
      else if (c.doneLap < lap && d >= 0) {
        toStop = d;
        pull = Math.max(0, 1 - d / PULL_RUN);
      } else if (c.lastStopLap === lap && d < 0) pull = Math.max(0, 1 + d / PULL_RUN);
    }
    const stoppedFor = c.stoppedAt === null ? null : this.t - c.stoppedAt;
    const sinceStop = c.lastStopAt !== null && c.lastStopLap === lap ? this.t - c.lastStopAt : null;
    // A taxi's door opens once it has stopped and shuts again before it pulls away.
    const door = v.kind === 'taxi' && stoppedFor !== null && v.stop ? Math.max(0, Math.min(1, stoppedFor / 0.4, (v.stop.wait - 0.5 - stoppedFor) / 0.4)) : 0;
    return { x, z: laneZ + (PULL_Z[v.kind] - laneZ) * pull, heading: dirOf(v) > 0 ? 0 : Math.PI, cycle: lap, stoppedFor, sinceStop, toStop, pull, speed: c.speed, door };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// People getting on and off
// ─────────────────────────────────────────────────────────────────────────────

/** A walking pace for people stepping out of a vehicle, how long the door takes before they appear, and how far off a waiting rider sees their taxi. */
export const ALIGHT = { pace: 0.8, door: 0.6, board: 1.1, seeFrom: 22 } as const;

export type RiderAction = 'alight' | 'board' | 'guard';

export interface RiderState {
  x: number;
  z: number;
  heading: number;
  walking: boolean;
  /** Carrying the cash box (the van's guard). */
  carrying: boolean;
}

/** What a taxi does at its stop this lap: even laps drop someone off, odd laps pick someone up. */
export const taxiAction = (cycle: number): 'alight' | 'board' => (cycle % 2 === 0 ? 'alight' : 'board');

/** Where someone walking a polyline at `pace` is after `t` seconds, or null once they are there. */
function along(path: readonly V2[], t: number, pace: number): { at: V2; heading: number } | null {
  let d = t * pace;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1]!;
    const [bx, bz] = path[i]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (d <= len) {
      const k = len === 0 ? 0 : d / len;
      return { at: [ax + (bx - ax) * k, az + (bz - az) * k], heading: Math.atan2(bx - ax, bz - az) };
    }
    d -= len;
  }
  return null;
}

/** The lobby door the people who get out walk to: the middle of the front of the branch. */
const doorFor = (x: number): V2 => [x * 0.55, STREET.z0 + 0.35];

/**
 * The person getting on or off vehicle `v` (in state `s`) at its stop, or null when there is no one: a taxi's passenger
 * stepping out onto the pavement and walking to the lobby (or a rider waiting at the kerb as their taxi comes, and getting
 * in), a motorbike's pillion passenger climbing off and walking in while the rider rides away, the cash van's guard carrying
 * the box to the ATMs and back.
 */
export function riderAt(v: Vehicle, s: VehicleState): (RiderState & { action: RiderAction }) | null {
  if (!v.stop) return null;
  const side = PULL_Z[v.kind] - 0.45;
  const kerb = KERB_Z - 0.35;
  const x = v.stop.x;
  if (v.stop.kind === 'cit') {
    if (s.stoppedFor === null || s.stoppedFor < ALIGHT.door) return null;
    const box = ATM_ALCOVE.z + 0.55;
    const out: V2[] = [
      [x, side],
      [x, kerb],
      [x, box],
    ];
    const leg = (Math.abs(side - kerb) + Math.abs(kerb - box)) / ALIGHT.pace;
    const tt = s.stoppedFor - ALIGHT.door;
    const back = v.stop.wait - ALIGHT.door - leg - 0.2;
    if (tt < leg) {
      const w = along(out, tt, ALIGHT.pace)!;
      return { x: w.at[0], z: w.at[1], heading: w.heading, walking: true, carrying: true, action: 'guard' };
    }
    if (tt < back) return { x, z: box, heading: Math.PI, walking: false, carrying: false, action: 'guard' };
    const w = along([...out].reverse(), tt - back, ALIGHT.pace);
    return w ? { x: w.at[0], z: w.at[1], heading: w.heading, walking: true, carrying: true, action: 'guard' } : null;
  }
  const action = v.stop.kind === 'taxi' ? taxiAction(s.cycle) : 'alight';
  if (action === 'board') {
    // Waiting at the kerb as the taxi comes in, then a few steps to the open door, and in.
    if (s.toStop !== null && s.toStop < ALIGHT.seeFrom) return { x: x - 0.4, z: kerb, heading: 0, walking: false, carrying: false, action };
    if (s.stoppedFor === null) return null;
    const w = along(
      [
        [x - 0.4, kerb],
        [x, side],
      ],
      s.stoppedFor,
      ALIGHT.pace,
    );
    return w ? { x: w.at[0], z: w.at[1], heading: w.heading, walking: true, carrying: false, action } : null;
  }
  // Out of the door (or off the back seat), up onto the pavement and to the lobby; they keep walking after it pulls away.
  if (s.sinceStop === null || s.sinceStop < ALIGHT.door) return null;
  const w = along([[x, side], [x, kerb], doorFor(x)], s.sinceStop - ALIGHT.door, ALIGHT.pace);
  return w ? { x: w.at[0], z: w.at[1], heading: w.heading, walking: true, carrying: false, action } : null;
}
