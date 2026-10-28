import { ATM_ALCOVE, KERB_Z, ROAD_END, STREET, type V2 } from './layout3d';
import { BUS_STOP } from './weather';

/**
 * The traffic on the avenue in front of the branch: motorbikes (many carrying two), cars, green ride-hailing taxis and the
 * armoured cash-in-transit van that services the ATMs. Pure, so the tests can drive a taxi to the kerb and watch its
 * passenger get out: the scene (Vehicles3D.tsx) only places what these functions say.
 *
 * Traffic keeps to the right. Seen from the pavement, the near lane runs towards -x and the far lane towards +x. Only the
 * near lane stops at the kerb: a taxi drops off or picks up at the bus stop, a motorbike lets its pillion passenger off, and
 * the cash van pulls in by the ATM alcove while its guard carries a cash box to the machines and back.
 */

/** The road between the kerb and the far side, and the middle of each lane. */
export const ROAD = { z0: KERB_Z + STREET.kerbW, z1: ROAD_END } as const;
const roadW = ROAD.z1 - ROAD.z0;
export const LANE_Z = { near: ROAD.z0 + roadW * 0.27, far: ROAD.z0 + roadW * 0.73 } as const;

/** Where the traffic comes from and goes to: well past the drawn street, out of the haze. */
export const TRAFFIC_SPAN = { x0: -62, x1: 62 } as const;
const SPAN = TRAFFIC_SPAN.x1 - TRAFFIC_SPAN.x0;

/** How far a vehicle slows down over before a stop, and speeds up over after it (world units). */
const BRAKE = 3;

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
  /** World units a second. */
  speed: number;
  /** Seconds into its cycle at time 0, so the fleet is spread out. */
  offset: number;
  color: string;
  /** A motorbike carrying a passenger on the back seat. */
  pillion: boolean;
  stop?: Stop;
}

const BUS_X = (BUS_STOP.x0 + BUS_STOP.x1) / 2;
const ALCOVE_X = (ATM_ALCOVE.x0 + ATM_ALCOVE.x1) / 2;

/** The fleet. The near lane all drives at one speed and the far lane at another, so nobody drives through anybody. */
export const VEHICLES: readonly Vehicle[] = [
  { id: 'taxi-1', kind: 'taxi', lane: 'near', speed: 5, offset: 0, color: '#16a34a', pillion: false, stop: { kind: 'taxi', x: BUS_X, wait: 5 } },
  { id: 'moto-1', kind: 'motorbike', lane: 'near', speed: 5, offset: 7, color: '#dc2626', pillion: true, stop: { kind: 'pillion', x: -5.5, wait: 2.6 } },
  { id: 'sedan-1', kind: 'sedan', lane: 'near', speed: 5, offset: 13, color: '#e5e7eb', pillion: false },
  { id: 'moto-2', kind: 'motorbike', lane: 'near', speed: 5, offset: 18, color: '#1d4ed8', pillion: false },
  { id: 'cit-1', kind: 'cit', lane: 'near', speed: 5, offset: 22, color: '#334155', pillion: false, stop: { kind: 'cit', x: ALCOVE_X, wait: 14 } },
  { id: 'moto-3', kind: 'motorbike', lane: 'near', speed: 5, offset: 3.5, color: '#0f766e', pillion: true, stop: { kind: 'pillion', x: 3.2, wait: 2.6 } },
  { id: 'sedan-2', kind: 'sedan', lane: 'far', speed: 6.5, offset: 0, color: '#1e3a8a', pillion: false },
  { id: 'moto-4', kind: 'motorbike', lane: 'far', speed: 6.5, offset: 4, color: '#f59e0b', pillion: true },
  { id: 'taxi-2', kind: 'taxi', lane: 'far', speed: 6.5, offset: 8.5, color: '#16a34a', pillion: false },
  { id: 'moto-5', kind: 'motorbike', lane: 'far', speed: 6.5, offset: 12, color: '#7c3aed', pillion: false },
  { id: 'sedan-3', kind: 'sedan', lane: 'far', speed: 6.5, offset: 15.5, color: '#b91c1c', pillion: false },
];

/** How far off the lane centre a vehicle pulls in at the kerb, towards the pavement. */
const PULL_Z: Record<VehicleKind, number> = { motorbike: ROAD.z0 + 0.5, sedan: ROAD.z0 + 0.85, taxi: ROAD.z0 + 0.85, cit: ROAD.z0 + 1.0 };

export interface VehicleState {
  x: number;
  z: number;
  /** Radians about y: 0 drives towards +x. */
  heading: number;
  /** Which lap of the avenue this is (taxis alternate drop-off and pick-up). */
  cycle: number;
  /** Seconds since the vehicle came to a stop at the kerb, or null on the move. */
  stoppedFor: number | null;
  /** Seconds since its kerbside stop began (keeps counting after it drives off, for a passenger still walking), or null. */
  sinceStop: number | null;
  /** How far it has pulled in to the kerb, 0-1. */
  pull: number;
  speed: number;
}

/** How long one lap takes. */
export const lapOf = (v: Vehicle): number => SPAN / v.speed + (v.stop ? (2 * BRAKE) / v.speed + v.stop.wait : 0);

/** Where vehicle `v` is at `t` seconds. */
export function vehicleAt(v: Vehicle, t: number): VehicleState {
  const lap = lapOf(v);
  const k = t + v.offset;
  const cycle = Math.floor(k / lap);
  const c = k - cycle * lap;
  const dir = v.lane === 'near' ? -1 : 1;
  const laneZ = LANE_Z[v.lane];
  const start = dir > 0 ? TRAFFIC_SPAN.x0 : TRAFFIC_SPAN.x1;
  const heading = dir > 0 ? 0 : Math.PI;
  if (!v.stop) return { x: start + dir * v.speed * c, z: laneZ, heading, cycle, stoppedFor: null, sinceStop: null, pull: 0, speed: v.speed };
  // Cruise, brake over BRAKE units, stand, pull away over BRAKE units, cruise on.
  const s0 = Math.abs(v.stop.x - start);
  const cruise1 = (s0 - BRAKE) / v.speed;
  const brake = (2 * BRAKE) / v.speed;
  const arrive = cruise1 + brake;
  let s: number;
  let pull = 0;
  let speed = v.speed;
  if (c < cruise1) s = v.speed * c;
  else if (c < arrive) {
    const u = c - cruise1;
    s = s0 - BRAKE + v.speed * u - (v.speed * v.speed * u * u) / (4 * BRAKE);
    pull = u / brake;
    speed = v.speed * (1 - u / brake);
  } else if (c < arrive + v.stop.wait) {
    s = s0;
    pull = 1;
    speed = 0;
  } else if (c < arrive + v.stop.wait + brake) {
    const u = c - arrive - v.stop.wait;
    s = s0 + (v.speed * v.speed * u * u) / (4 * BRAKE);
    pull = 1 - u / brake;
    speed = v.speed * (u / brake);
  } else s = s0 + BRAKE + v.speed * (c - arrive - v.stop.wait - brake);
  const z = laneZ + (PULL_Z[v.kind] - laneZ) * pull;
  const stoppedFor = c >= arrive && c < arrive + v.stop.wait ? c - arrive : null;
  return { x: start + dir * s, z, heading, cycle, stoppedFor, sinceStop: c >= arrive ? c - arrive : null, pull, speed };
}

// ─────────────────────────────────────────────────────────────────────────────
// People getting on and off
// ─────────────────────────────────────────────────────────────────────────────

/** A walking pace for people stepping out of a vehicle, and how long the door takes before they appear. */
export const ALIGHT = { pace: 0.8, door: 0.6, board: 1.1, waitBefore: 5 } as const;

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
 * The person getting on or off vehicle `v` at its stop, or null when there is no one: a taxi's passenger stepping out onto
 * the pavement and walking to the lobby (or a rider waiting at the kerb and getting in), a motorbike's pillion passenger
 * climbing off and walking in while the rider rides away, the cash van's guard carrying the box to the ATMs and back.
 */
export function riderAt(v: Vehicle, t: number): (RiderState & { action: RiderAction }) | null {
  if (!v.stop) return null;
  const s = vehicleAt(v, t);
  const side = s.z - 0.45;
  const kerb = KERB_Z - 0.35;
  const x = v.stop.x;
  if (v.stop.kind === 'cit') {
    if (s.stoppedFor === null || s.stoppedFor < ALIGHT.door) return null;
    const out: V2[] = [
      [x, side],
      [x, kerb],
      [x, ATM_ALCOVE.z + 0.55],
    ];
    const leg = (Math.abs(side - kerb) + Math.abs(kerb - (ATM_ALCOVE.z + 0.55))) / ALIGHT.pace;
    const tt = s.stoppedFor - ALIGHT.door;
    const back = v.stop.wait - ALIGHT.door - leg;
    if (tt < leg) {
      const w = along(out, tt, ALIGHT.pace)!;
      return { x: w.at[0], z: w.at[1], heading: w.heading, walking: true, carrying: true, action: 'guard' };
    }
    if (tt < back) return { x, z: ATM_ALCOVE.z + 0.55, heading: Math.PI, walking: false, carrying: false, action: 'guard' };
    const w = along([...out].reverse(), tt - back, ALIGHT.pace);
    return w ? { x: w.at[0], z: w.at[1], heading: w.heading, walking: true, carrying: true, action: 'guard' } : null;
  }
  const action = v.stop.kind === 'taxi' ? taxiAction(s.cycle) : 'alight';
  if (action === 'board') {
    // Waiting at the kerb as the taxi comes in, then a few steps to the door, and in.
    const untilArrive = timeToStop(v, t, lapOf(v));
    if (untilArrive !== null && untilArrive < ALIGHT.waitBefore) return { x: x - 0.4, z: kerb, heading: 0, walking: false, carrying: false, action };
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

/** Seconds until vehicle `v` next stops at its kerb (within this lap), or null if it has already stopped this lap. */
function timeToStop(v: Vehicle, t: number, lap: number): number | null {
  if (!v.stop) return null;
  const start = v.lane === 'near' ? TRAFFIC_SPAN.x1 : TRAFFIC_SPAN.x0;
  const arrive = (Math.abs(v.stop.x - start) - BRAKE) / v.speed + (2 * BRAKE) / v.speed;
  const c = (((t + v.offset) % lap) + lap) % lap;
  return c < arrive ? arrive - c : null;
}
