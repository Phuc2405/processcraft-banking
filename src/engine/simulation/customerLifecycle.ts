import { laneAt, type V2 } from '../plan/layout3d';
import { pointAlongPath } from '../plan/path';

/** The journey of a customer served at a counter or an ATM, as a state machine (State pattern). */

/** What the customer looks like at a moment of their journey. */
export interface CustomerPose {
  state: JourneyStateName;
  at: V2;
  /** Rotation about y as the figure is drawn (the queue's convention: π faces the counter). */
  yaw: number;
  /** Whether the legs swing (walking) or stand still. */
  walking: boolean;
  /** Doing their business at the counter or machine: the hand keys in or gestures. */
  busy: boolean;
}

export type JourneyStateName = 'walking' | 'interacting' | 'turning' | 'departing' | 'gone';

/** A served customer's journey: their way (from where they are, through the counter or machine, out), and its timing. */
export interface Journey {
  path: readonly V2[];
  length: number;
  /** How far along `path` the counter or machine is (0: they are at it already). */
  stopAt: number;
  /** How long they stay at it, the last `turn` of it turning round. */
  wait: number;
  /** Whether they do their business there (keying in at the machine, talking at the counter), rather than just finishing up after being served from the line; by default, when they walk up to it. */
  business?: boolean;
  turn: number;
  pace: number;
}

interface JourneyState {
  readonly name: JourneyStateName;
  /** When this state ends, in seconds since the journey began. */
  until(j: Journey): number;
  pose(j: Journey, t: number): CustomerPose;
  readonly next: JourneyState | null;
}

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const walkUpS = (j: Journey): number => j.stopAt / j.pace;
/** The way they face walking along the path: the queue's figures face the way they walk at heading + π/2. */
const walkingAt = (j: Journey, d: number, name: JourneyStateName): CustomerPose => {
  const p = laneAt(j.path, d);
  return { state: name, at: [p.x, p.z], yaw: p.heading + Math.PI / 2, walking: true, busy: false };
};
const atCounter = (j: Journey): V2 => pointAlongPath(j.path, j.stopAt);

const Gone: JourneyState = {
  name: 'gone',
  until: () => Infinity,
  pose: (j) => ({ state: 'gone', at: j.path[j.path.length - 1]!, yaw: 0, walking: false, busy: false }),
  next: null,
};

const Departing: JourneyState = {
  name: 'departing',
  until: (j) => walkUpS(j) + j.wait + (j.length - j.stopAt) / j.pace,
  pose: (j, t) => walkingAt(j, j.stopAt + (t - walkUpS(j) - j.wait) * j.pace, 'departing'),
  next: Gone,
};

const Turning: JourneyState = {
  name: 'turning',
  until: (j) => walkUpS(j) + j.wait,
  pose: (j, t) => {
    // From facing the counter (π) round to the way out, eased: never a snap.
    const u = Math.max(0, Math.min(1, (t - walkUpS(j) - (j.wait - j.turn)) / j.turn));
    const out = laneAt(j.path, j.stopAt + 0.05).heading + Math.PI / 2;
    return { state: 'turning', at: atCounter(j), yaw: Math.PI + wrapAngle(out - Math.PI) * u * u * (3 - 2 * u), walking: false, busy: false };
  },
  next: Departing,
};

const Interacting: JourneyState = {
  name: 'interacting',
  until: (j) => walkUpS(j) + j.wait - j.turn,
  // Keying in or talking only when they came up to do their business here; one just served is finishing up.
  pose: (j) => ({ state: 'interacting', at: atCounter(j), yaw: Math.PI, walking: false, busy: j.business ?? j.stopAt > 0 }),
  next: Turning,
};

const Walking: JourneyState = {
  name: 'walking',
  until: (j) => walkUpS(j),
  pose: (j, t) => walkingAt(j, t * j.pace, 'walking'),
  next: Interacting,
};

/** The state of a journey `t` seconds after it began. */
export function journeyState(j: Journey, t: number): JourneyStateName {
  let s: JourneyState = Walking;
  while (s.next && t >= s.until(j)) s = s.next;
  return s.name;
}

/** Where and how the customer is `t` seconds into their journey. */
export function journeyPose(j: Journey, t: number): CustomerPose {
  let s: JourneyState = Walking;
  while (s.next && t >= s.until(j)) s = s.next;
  return s.pose(j, Math.max(0, t));
}
