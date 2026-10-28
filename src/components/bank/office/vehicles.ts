import { ATM_ALCOVE, KERB_Z, ROAD_END, STREET, type V2 } from './layout3d';
import { BUS_STOP } from './weather';

/**
 * The traffic on the avenue in front of the branch: motorbikes (many carrying two), cars, green ride-hailing taxis and the
 * armoured cash-in-transit van that services the ATMs. A small driving simulation (TrafficSim), stepped on the motion clock.
 *
 * The avenue has four lanes, two each way, and traffic keeps to the right: in each direction a motorbike lane along the
 * kerb and a car lane inside it, so cars and motorbikes never share a lane. Seen from the pavement the near side runs
 * towards -x and the far side towards +x.
 *
 * Every vehicle looks ahead in its lane:
 *   - it brakes smoothly to keep a safe distance, and never closes up past MIN_GAP: nobody drives into or through anybody;
 *   - when the vehicle ahead has stopped (a taxi at the kerb, the cash van, a motorbike letting its passenger off) it checks
 *     the other lane its way: clear far enough behind and beyond the stopped vehicle, it puts its indicator on, eases
 *     across, overtakes and eases back once its own lane is clear again; not clear, it waits behind. Every vehicle behind
 *     does the same, so traffic flows round a stop without a jam and queues neatly when it cannot.
 *
 * Only the near side stops at the kerb (in the motorbike lane, which is the kerb lane): a taxi drops off or picks up at the
 * bus stop (opening its kerbside door), a motorbike lets its pillion passenger off, and the cash van pulls in by the ATMs
 * while its guard carries a cash box to the machines and back. Then they pull away and drive on, out past the end of the
 * street (well out in the haze) before coming round again: nothing vanishes in view.
 */

/** The road between the kerb and the far side. */
export const ROAD = { z0: KERB_Z + STREET.kerbW, z1: ROAD_END } as const;
const roadW = ROAD.z1 - ROAD.z0;
/** One lane's width. */
export const LANE_W = roadW / 4;

export type Side = 'near' | 'far';
/** A lane: which side of the avenue, and 0 for the motorbike (kerb) lane, 1 for the car lane. */
export type LaneIndex = 0 | 1;

/** The middle of a lane (or of a point between two, for a vehicle changing lanes), on z. */
export const laneZ = (side: Side, lat: number): number => (side === 'near' ? ROAD.z0 + LANE_W * (0.5 + lat) : ROAD.z1 - LANE_W * (0.5 + lat));

/** The middle of each lane, by side and kind of lane. */
export const LANE_Z = { near: { moto: laneZ('near', 0), car: laneZ('near', 1) }, far: { car: laneZ('far', 1), moto: laneZ('far', 0) } } as const;

/** Where the traffic comes from and goes to: well past the drawn street, out of the haze. */
export const TRAFFIC_SPAN = { x0: -62, x1: 62 } as const;
export const SPAN = TRAFFIC_SPAN.x1 - TRAFFIC_SPAN.x0;

/** Bumper to bumper, the closest any two vehicles ever get (world units); and the distance they like to keep at speed. */
export const MIN_GAP = 0.8;
export const SAFE_GAP = 1.6;
/** How hard vehicles brake and pull away (units/s²). */
export const BRAKE = 5;
export const ACCEL = 2.8;
/** Overtaking: how far ahead a driver looks for a stopped vehicle, how much clear road the other lane needs behind and in
 * front, how long the indicator blinks before moving across, and how long the move across takes. */
export const OVERTAKE = { look: 12, behind: 7, beyond: 5, signal: 0.7, shift: 1.1 } as const;

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
  side: Side;
  /** Cruising speed, world units a second. */
  speed: number;
  /** Where along its side it starts (world units from where its side begins). */
  start: number;
  color: string;
  /** A motorbike carrying a passenger on the back seat. */
  pillion: boolean;
  stop?: Stop;
}

/** Bumper-to-bumper length, and width, of each kind. */
export const LENGTH: Record<VehicleKind, number> = { motorbike: 1.2, sedan: 2.1, taxi: 2.1, cit: 2.5 };
export const WIDTH: Record<VehicleKind, number> = { motorbike: 0.4, sedan: 0.97, taxi: 0.97, cit: 1.07 };

/** A vehicle's own lane: motorbikes in the kerb lane, everything else in the car lane. */
export const homeLane = (v: Pick<Vehicle, 'kind'>): LaneIndex => (v.kind === 'motorbike' ? 0 : 1);

const BUS_X = (BUS_STOP.x0 + BUS_STOP.x1) / 2;
const ALCOVE_X = (ATM_ALCOVE.x0 + ATM_ALCOVE.x1) / 2;

/** The fleet, spread out along both sides of the avenue. A natural pace: a little brisker than a stroll of a city street. */
export const VEHICLES: readonly Vehicle[] = [
  { id: 'taxi-1', kind: 'taxi', side: 'near', speed: 6.5, start: 0, color: '#16a34a', pillion: false, stop: { kind: 'taxi', x: BUS_X, wait: 5 } },
  { id: 'moto-1', kind: 'motorbike', side: 'near', speed: 7, start: 12, color: '#dc2626', pillion: true, stop: { kind: 'pillion', x: -5.5, wait: 2.6 } },
  { id: 'sedan-1', kind: 'sedan', side: 'near', speed: 7.4, start: 30, color: '#e5e7eb', pillion: false },
  { id: 'moto-2', kind: 'motorbike', side: 'near', speed: 7.8, start: 42, color: '#1d4ed8', pillion: false },
  { id: 'cit-1', kind: 'cit', side: 'near', speed: 5.8, start: 62, color: '#334155', pillion: false, stop: { kind: 'cit', x: ALCOVE_X, wait: 14 } },
  { id: 'moto-3', kind: 'motorbike', side: 'near', speed: 6.8, start: 80, color: '#0f766e', pillion: true, stop: { kind: 'pillion', x: 3.2, wait: 2.6 } },
  { id: 'sedan-4', kind: 'sedan', side: 'near', speed: 7.2, start: 96, color: '#6b7280', pillion: false },
  { id: 'moto-6', kind: 'motorbike', side: 'near', speed: 7.4, start: 108, color: '#ea580c', pillion: false },
  { id: 'sedan-2', kind: 'sedan', side: 'far', speed: 8, start: 0, color: '#1e3a8a', pillion: false },
  { id: 'moto-4', kind: 'motorbike', side: 'far', speed: 8.4, start: 18, color: '#f59e0b', pillion: true },
  { id: 'taxi-2', kind: 'taxi', side: 'far', speed: 7.4, start: 44, color: '#16a34a', pillion: false },
  { id: 'moto-5', kind: 'motorbike', side: 'far', speed: 8, start: 66, color: '#7c3aed', pillion: false },
  { id: 'sedan-3', kind: 'sedan', side: 'far', speed: 7.8, start: 88, color: '#b91c1c', pillion: false },
  { id: 'moto-7', kind: 'motorbike', side: 'far', speed: 7.6, start: 104, color: '#0891b2', pillion: false },
];

/** Where a vehicle stands when pulled in to the kerb (z): just off the kerb, inside the kerb lane. */
export const kerbZ = (kind: VehicleKind): number => ROAD.z0 + WIDTH[kind] / 2 + 0.25;
/** Over how many units before its stop a vehicle eases in to the kerb, and back out after. */
const PULL_RUN = 6;
/** How far before its stop a car-lane vehicle moves across into the kerb lane. */
const MERGE_BEFORE = 28;

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
  /** Which lane it is in (0 kerb, 1 car), between the two while it moves across. */
  lat: number;
  /** Its indicator: -1 towards the kerb, 1 away from it, 0 off. */
  signal: -1 | 0 | 1;
}

interface Driving {
  v: Vehicle;
  /** Distance driven along its side (keeps growing; the lap is s / SPAN). */
  s: number;
  speed: number;
  /** The lane it is in, or moving to; and where it is across, continuously. */
  lane: LaneIndex;
  lat: number;
  /** A lane it means to move to once its indicator has blinked long enough, and since when. */
  wants: LaneIndex | null;
  signalSince: number;
  /** The lap whose stop it has made. */
  doneLap: number;
  stoppedAt: number | null;
  lastStopAt: number | null;
  lastStopLap: number;
}

const startX = (v: Vehicle): number => (v.side === 'near' ? TRAFFIC_SPAN.x1 : TRAFFIC_SPAN.x0);
const dirOf = (v: Vehicle): number => (v.side === 'near' ? -1 : 1);
/** Where along its side a vehicle's stop is. */
const stopS = (v: Vehicle): number => (v.stop ? Math.abs(v.stop.x - startX(v)) : 0);
const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Whether two vehicles at these places across the road would touch side to side. */
const sideBySide = (a: Driving, b: Driving): boolean => Math.abs(a.lat - b.lat) * LANE_W < (WIDTH[a.v.kind] + WIDTH[b.v.kind]) / 2 + 0.12;

/** The driving simulation: step it with the motion clock, read each vehicle's state. */
export class TrafficSim {
  t = 0;
  private cars: Driving[];

  constructor(fleet: readonly Vehicle[] = VEHICLES) {
    this.cars = fleet.map((v) => ({ v, s: v.start, speed: v.speed, lane: homeLane(v), lat: homeLane(v), wants: null, signalSince: 0, doneLap: -1, stoppedAt: null, lastStopAt: null, lastStopLap: -1 }));
  }

  /** Bumper-to-bumper gap from `a` to the nearest vehicle in front of it that it would touch (round the ring), and that vehicle. */
  gapAhead(a: Driving, at: (b: Driving) => boolean = (b) => sideBySide(a, b)): { gap: number; lead: Driving | null } {
    let best: Driving | null = null;
    let bestD = Infinity;
    for (const b of this.cars) {
      if (b === a || b.v.side !== a.v.side || !at(b)) continue;
      const d = mod(b.s - a.s, SPAN);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) return { gap: Infinity, lead: null };
    return { gap: bestD - (LENGTH[a.v.kind] + LENGTH[best.v.kind]) / 2, lead: best };
  }

  /** Whether lane `lane` on `a`'s side is clear from `behind` units behind `a` to `ahead` units in front of it. */
  laneClear(a: Driving, lane: LaneIndex, behind: number, ahead: number): boolean {
    const probe = { ...a, lat: lane };
    for (const b of this.cars) {
      if (b === a || b.v.side !== a.v.side) continue;
      if (!sideBySide(probe, b) && !(b.wants === lane && sideBySide({ ...b, lat: lane }, probe))) continue;
      const fwd = mod(b.s - a.s, SPAN);
      const back = mod(a.s - b.s, SPAN);
      const reach = (LENGTH[a.v.kind] + LENGTH[b.v.kind]) / 2;
      // Room for the time the move across takes: whatever is coming up behind may close in meanwhile, and a slower
      // vehicle ahead may be caught up.
      const closing = OVERTAKE.shift + 0.3;
      if (fwd < ahead + reach + Math.max(0, a.speed - b.speed) * closing || back < behind + reach + Math.max(0, b.speed - a.speed) * closing) return false;
    }
    return true;
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
      const pending = c.v.stop && c.doneLap < lap ? stopS(c.v) - mod(c.s, SPAN) : null;
      this.steer(c, pending);
      // Move across towards its lane.
      const step = h / OVERTAKE.shift;
      c.lat = Math.abs(c.lane - c.lat) <= step ? c.lane : c.lat + Math.sign(c.lane - c.lat) * step;

      const { gap } = this.gapAhead(c);
      // The fastest it may go and still stop in time: behind the vehicle in front, and at its own stop.
      let limit = c.v.speed;
      limit = Math.min(limit, Math.sqrt(2 * BRAKE * Math.max(0, gap - SAFE_GAP)));
      if (pending !== null && pending >= -0.01) limit = Math.min(limit, Math.sqrt(2 * BRAKE * Math.max(0, pending)));
      c.speed = limit < c.speed ? Math.max(limit, c.speed - BRAKE * 2 * h) : Math.min(limit, c.speed + ACCEL * h);
      let move = c.speed * h;
      if (pending !== null && pending >= -0.01 && move >= pending - 0.02 && c.speed < 1.2) {
        // Arrived at the kerb.
        c.s += Math.max(0, Math.min(pending, gap - MIN_GAP));
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

  /**
   * Lane choice, every step: into the kerb lane ahead of a kerbside stop; round a stopped vehicle when the other lane is
   * clear (indicator first, then across); and back to its own lane once that is clear again. A move only starts when the
   * lane it is going to is clear behind and ahead, and only after the indicator has blinked for a moment.
   */
  private steer(c: Driving, pending: number | null): void {
    const home = homeLane(c.v);
    const other = (1 - c.lane) as LaneIndex;
    let want: LaneIndex | null = null;
    if (pending !== null && pending >= 0 && pending < MERGE_BEFORE) {
      // Going to the kerb: into the kerb lane, when there is room.
      if (c.lane !== 0) want = 0;
    } else {
      const { gap, lead } = this.gapAhead(c, (b) => Math.abs(b.lat - c.lane) < 0.5);
      const blocked = lead !== null && gap < OVERTAKE.look && (lead.stoppedAt !== null || lead.speed < 0.4);
      if (blocked && c.lane === c.lat) want = other;
      else if (c.lane !== home && c.lane === c.lat) {
        // Overtaking: back to its own lane once it has passed whatever it went round and its lane is clear.
        want = home;
      }
      if (want !== null && want === home && !blocked) {
        // Only when the way home is clear for a good distance.
        if (!this.laneClear(c, home, OVERTAKE.behind, OVERTAKE.beyond)) want = null;
      } else if (want !== null && lead) {
        // Round the stopped vehicle: clear behind, and until well past it.
        const past = mod(lead.s - c.s, SPAN) + LENGTH[lead.v.kind] / 2 + OVERTAKE.beyond;
        if (!this.laneClear(c, want, OVERTAKE.behind, past)) want = null;
      }
    }
    if (want !== null && want === c.lane) want = null;
    if (want !== null && want !== 0 && pending !== null && pending >= 0 && pending < MERGE_BEFORE) want = null;
    if (want === 0 && pending !== null && pending >= 0 && pending < MERGE_BEFORE && !this.laneClear(c, 0, OVERTAKE.behind, OVERTAKE.beyond)) want = null;
    if (want === null) {
      c.wants = null;
      return;
    }
    if (c.wants !== want) {
      // Indicator on.
      c.wants = want;
      c.signalSince = this.t;
      return;
    }
    if (this.t - c.signalSince >= OVERTAKE.signal) {
      c.lane = want;
      c.wants = null;
    }
  }

  /** Every vehicle's state now. */
  states(): Map<string, VehicleState> {
    return new Map(this.cars.map((c) => [c.v.id, this.stateOf(c)]));
  }

  state(id: string): VehicleState {
    return this.stateOf(this.cars.find((c) => c.v.id === id)!);
  }

  /** The bumper-to-bumper gaps to whatever each vehicle would touch ahead, for checking that nobody overlaps. */
  gaps(): number[] {
    return this.cars.map((c) => this.gapAhead(c).gap).filter(Number.isFinite);
  }

  /** Pairs of vehicles side by side and overlapping along the road: there must never be any. */
  overlaps(): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (const a of this.cars)
      for (const b of this.cars) {
        if (a.v.id >= b.v.id || a.v.side !== b.v.side || !sideBySide(a, b)) continue;
        const d = Math.min(mod(b.s - a.s, SPAN), mod(a.s - b.s, SPAN));
        if (d < (LENGTH[a.v.kind] + LENGTH[b.v.kind]) / 2) out.push([a.v.id, b.v.id]);
      }
    return out;
  }

  private stateOf(c: Driving): VehicleState {
    const v = c.v;
    const lap = Math.floor(c.s / SPAN);
    const along = mod(c.s, SPAN);
    const x = startX(v) + dirOf(v) * along;
    let pull = 0;
    let toStop: number | null = null;
    if (v.stop) {
      const d = stopS(v) - along;
      // It pulls right in only from the kerb lane (blocked out of it, it stops where it is).
      if (c.stoppedAt !== null) pull = c.lat === 0 ? 1 : 0;
      else if (c.doneLap < lap && d >= 0) {
        toStop = d;
        pull = c.lat === 0 ? Math.max(0, 1 - d / PULL_RUN) : 0;
      } else if (c.lastStopLap === lap && d < 0) pull = Math.max(0, 1 + d / PULL_RUN);
    }
    const stoppedFor = c.stoppedAt === null ? null : this.t - c.stoppedAt;
    const sinceStop = c.lastStopAt !== null && c.lastStopLap === lap ? this.t - c.lastStopAt : null;
    // A taxi's door opens once it has stopped and shuts again before it pulls away.
    const door = v.kind === 'taxi' && stoppedFor !== null && v.stop ? Math.max(0, Math.min(1, stoppedFor / 0.4, (v.stop.wait - 0.5 - stoppedFor) / 0.4)) : 0;
    const z0 = laneZ(v.side, c.lat);
    const z = z0 + (kerbZ(v.kind) - z0) * pull;
    // The indicator: blinking towards the lane it means to move to, or the one it is moving into.
    const target = c.wants ?? (c.lat !== c.lane ? c.lane : null);
    const signal: -1 | 0 | 1 = target === null ? 0 : target < c.lat ? -1 : 1;
    return { x, z, heading: dirOf(v) > 0 ? 0 : Math.PI, cycle: lap, stoppedFor, sinceStop, toStop, pull, speed: c.speed, door, lat: c.lat, signal };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// People getting on and off
// ─────────────────────────────────────────────────────────────────────────────

/** A walking pace for people stepping out of a vehicle, how long the door takes before they appear, and how far off a waiting rider sees their taxi. */
export const ALIGHT = { pace: 1.0, door: 0.6, board: 1.1, seeFrom: 22 } as const;

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
  const side = kerbZ(v.kind) - WIDTH[v.kind] / 2 - 0.15;
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
