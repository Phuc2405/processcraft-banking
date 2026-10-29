import { KERB_Z, STREET, type V2 } from './layout3d';
import { FOUNTAIN, LOOP, PARK, PARK_BENCHES, PICNIC, PLAYGROUND } from './parkPlan';
import { pathLength, pointAlongPath } from './tour3d';

/**
 * The people in the park, as a small simulation the tests can step: who is there, where each one is, and how they come and
 * go. Nobody pops in or out of the park. Everyone has a place (a bench, a seat at the picnic table, a swing, or the loop
 * path for a stroller) and a way out to the street through the gap in the hedge: when they are no longer wanted there (the
 * rain comes, night falls, the evening crowd thins) they get up after a moment's look at the sky, one after another, and
 * walk out along the paths (briskly, umbrella up, in the wet); when they are wanted again they walk back in the same way.
 * Their walks only ever follow the paths and the open lawn: never through the fountain, a flowerbed, the picnic table or
 * the hedge.
 */

export type ParkRole = 'bench' | 'picnic' | 'swing' | 'stroll';

export interface ParkMember {
  id: string;
  role: ParkRole;
  /** Which bench, seat, swing or stroller this is. */
  k: number;
  /** Where they sit or stand when they are there, and which way they face. */
  at: V2;
  facing: number;
}

/** The gap in the front hedge, where the path from the street comes in, on the loop; and the way out onto the pavement. */
export const PARK_GATE: V2 = [LOOP.x0 + 1.9, LOOP.z1];
export const PARK_EXIT: V2[] = [PARK_GATE, [PARK_GATE[0], PARK.z1 + 0.5], [PARK_GATE[0], KERB_Z - 0.75], [STREET.halfWidth + 9, KERB_Z - 0.75]];

/** The loop path as a closed ring, and how far round it each corner is. */
export const LOOP_RING: V2[] = [
  [LOOP.x0, LOOP.z0],
  [LOOP.x1, LOOP.z0],
  [LOOP.x1, LOOP.z1],
  [LOOP.x0, LOOP.z1],
  [LOOP.x0, LOOP.z0],
];
export const LOOP_LEN = pathLength(LOOP_RING);
const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** How far round the loop the point `p` (which is on it) is. */
export function loopParam(p: V2): number {
  let best = 0;
  let bestD = Infinity;
  let acc = 0;
  for (let i = 1; i < LOOP_RING.length; i++) {
    const a = LOOP_RING[i - 1]!;
    const b = LOOP_RING[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len)));
    const d = Math.hypot(a[0] + (b[0] - a[0]) * u - p[0], a[1] + (b[1] - a[1]) * u - p[1]);
    if (d < bestD) {
      bestD = d;
      best = acc + u * len;
    }
    acc += len;
  }
  return mod(best, LOOP_LEN);
}

/** The way along the loop from param `a` to param `b`, the shorter way round, corners included. */
export function loopWay(a: number, b: number): V2[] {
  const fwd = mod(b - a, LOOP_LEN);
  const back = LOOP_LEN - fwd;
  const out: V2[] = [pointAlongPath(LOOP_RING, mod(a, LOOP_LEN))];
  const corners = [0, LOOP.x1 - LOOP.x0, LOOP.x1 - LOOP.x0 + (LOOP.z1 - LOOP.z0), 2 * (LOOP.x1 - LOOP.x0) + (LOOP.z1 - LOOP.z0)];
  const steps = fwd <= back ? fwd : -back;
  const passed = corners
    .map((c) => ({ c, along: steps >= 0 ? mod(c - a, LOOP_LEN) : mod(a - c, LOOP_LEN) }))
    .filter((x) => x.along > 1e-6 && x.along < Math.abs(steps) - 1e-6)
    .sort((x, y) => x.along - y.along);
  for (const p of passed) out.push(pointAlongPath(LOOP_RING, p.c));
  out.push(pointAlongPath(LOOP_RING, mod(b, LOOP_LEN)));
  return out;
}

const GATE_PARAM = loopParam(PARK_GATE);

/** From a point on the loop, round it to the gate and out onto the pavement. */
const outFrom = (onLoop: V2): V2[] => [...loopWay(loopParam(onLoop), GATE_PARAM), ...PARK_EXIT.slice(1)];

/** The inner ring of the fountain plaza, between the basin and the benches, that bench sitters walk round. */
const RING_R = 1.75;
const ringAt = (a: number): V2 => [FOUNTAIN.x + Math.cos(a) * RING_R, FOUNTAIN.z + Math.sin(a) * RING_R];

/** The way out from each place: off the seat, onto the nearest path, along it to the loop, round to the gate and out. */
export function exitRoute(m: ParkMember): V2[] {
  switch (m.role) {
    case 'bench': {
      // In to the plaza's inner ring, round it to the cross path that runs to the front of the park, and down that.
      const a = Math.atan2(m.at[1] - FOUNTAIN.z, m.at[0] - FOUNTAIN.x);
      const south = Math.PI / 2;
      const d = mod(south - a + Math.PI, 2 * Math.PI) - Math.PI;
      const arc: V2[] = [];
      const n = Math.max(1, Math.ceil(Math.abs(d) / (Math.PI / 12)));
      for (let i = 0; i <= n; i++) arc.push(ringAt(a + (d * i) / n));
      return [m.at, ...arc, ...outFrom([FOUNTAIN.x, LOOP.z1])];
    }
    case 'picnic': {
      // Up from the bench, away from the table, round its end, and along to the cross path.
      const out = m.at[1] < PICNIC.z ? -0.55 : 0.55;
      const end = PICNIC.x - 1.2;
      return [m.at, [m.at[0], m.at[1] + out], [end, m.at[1] + out], ...outFrom([end, LOOP.z1])];
    }
    case 'swing': {
      // Off the seat, a step forward clear of the frame, across the lawn to the loop's near side, and round to the gate.
      const clear: V2 = [m.at[0], PLAYGROUND.z + 0.9];
      return [m.at, clear, ...outFrom([LOOP.x0, clear[1]])];
    }
    case 'stroll':
      return outFrom(m.at);
  }
}

/** Everyone who can be in the park: two to a bench, four at the picnic table, a child to each swing, and five strollers. */
export const PARK_MEMBERS: readonly ParkMember[] = [
  ...PARK_BENCHES.flatMap((b, k) =>
    [-0.32, 0.32].map((dz, j): ParkMember => {
      const along = b.facing + Math.PI / 2;
      return { id: `bench-${k}-${j}`, role: 'bench', k: k * 2 + j, at: [b.at[0] + Math.sin(along) * dz, b.at[1] + Math.cos(along) * dz], facing: b.facing };
    }),
  ),
  ...[0, 1, 2, 3].map((k): ParkMember => ({ id: `picnic-${k}`, role: 'picnic', k, at: [PICNIC.x + (k % 2 ? 0.45 : -0.45), PICNIC.z + (k < 2 ? -0.7 : 0.7)], facing: k < 2 ? 0 : Math.PI })),
  ...SWING_XS().map((x, k): ParkMember => ({ id: `swing-${k}`, role: 'swing', k, at: [x, PLAYGROUND.z], facing: 0 })),
  ...[0, 1, 2, 3, 4].map((k): ParkMember => ({ id: `stroll-${k}`, role: 'stroll', k, at: PARK_GATE, facing: 0 })),
];

/** Where the two swing seats hang, as x. */
export function SWING_XS(): number[] {
  return [-0.4, 0.4].map((dx) => PLAYGROUND.x - 1.1 + dx);
}

/**
 * Who wants to be in the park at `minute`: more on the benches and paths after the bank closes at 17:00. The weather never
 * changes who is there (a shower sends nobody home and brings nobody out): it only changes what they do (ParkCrowd.step).
 */
export function wantsPark(m: ParkMember, minute: number): boolean {
  const h = minute / 60;
  const evening = h >= 17;
  switch (m.role) {
    case 'bench':
      return h >= 7 && h < 22 && m.k < (evening ? 8 : 4);
    case 'picnic':
      return h >= 10 && h < 19.5;
    case 'swing':
      return h >= 8 && h < 18.5;
    case 'stroll':
      return h >= 6 && h < 22 && m.k < (evening ? 5 : 3);
  }
}

/** Walking paces (units a second): an easy stroll in, a brisk walk out in the wet. And the pauses before anyone moves. */
export const PARK_PACE = { stroll: 0.85, in: 0.9, out: 1.0, wet: 1.45 } as const;
export const PARK_HOLD = { look: 0.7, stagger: 0.45, back: 1.2 } as const;

export type ParkPose = 'away' | 'home' | 'up' | 'walk';

export interface ParkState {
  m: ParkMember;
  /** How far along their way out they are: 0 at their place, `len` out on the pavement past the end of the street. */
  d: number;
  route: V2[];
  len: number;
  /** Seconds left before they set off, once they have decided to move. */
  hold: number;
  /** Which way they are heading: out, in, or staying put. */
  going: 'out' | 'in' | null;
  /** A stroller's place round the loop, when at home. */
  loop: number;
}

/**
 * The park's people, stepped on the motion clock. In the wet nobody leaves: everyone puts up an umbrella where they are
 * (Park3D), the strollers keep to the loop, and the children get off the swings and wait under the swing frame.
 */
export class ParkCrowd {
  t = 0;
  /** It is raining (or hailing, or snowing) now. */
  wet = false;
  readonly people: ParkState[];

  constructor(members: readonly ParkMember[] = PARK_MEMBERS, present: (m: ParkMember) => boolean = () => false) {
    this.people = members.map((m, i) => {
      const route = exitRoute(m);
      const len = pathLength(route);
      const here = present(m);
      return { m, d: here ? 0 : len, route, len, hold: 0, going: null, loop: mod(GATE_PARAM + (i * LOOP_LEN) / 5, LOOP_LEN) };
    });
  }

  /** Moves everyone on by `dt` seconds; `wanted` says who should be in the park now, `wet` whether it is raining. */
  step(dt: number, wanted: (m: ParkMember) => boolean, wet: boolean): void {
    this.t += dt;
    this.wet = wet;
    let leaving = 0;
    let coming = 0;
    for (const p of this.people) {
      const want = wanted(p.m);
      const target: 'out' | 'in' | null = want ? (p.d > 0 ? 'in' : null) : p.d < p.len ? 'out' : null;
      if (target !== p.going) {
        // A change of mind: a look at the sky (or a moment to notice the sun is back) first, everyone a beat apart.
        p.going = target;
        if (target === 'out' && p.d === 0) {
          p.hold = PARK_HOLD.look + leaving * PARK_HOLD.stagger;
          if (p.m.role === 'stroll') this.leaveLoop(p);
        } else if (target === 'in' && p.d >= p.len) {
          p.hold = PARK_HOLD.back + coming * PARK_HOLD.stagger * 2;
          if (p.m.role === 'stroll') this.comeToGate(p);
        } else p.hold = 0;
      }
      if (target === 'out') leaving++;
      if (target === 'in') coming++;
      if (p.going === null) {
        if (p.m.role === 'stroll' && p.d === 0) p.loop = mod(p.loop + dt * (PARK_PACE.stroll + (p.m.k % 3) * 0.1), LOOP_LEN);
        continue;
      }
      if (p.hold > 0) {
        p.hold = Math.max(0, p.hold - dt);
        continue;
      }
      if (p.going === 'out') {
        p.d = Math.min(p.len, p.d + dt * (wet ? PARK_PACE.wet : PARK_PACE.out));
        if (p.d >= p.len) p.going = null;
      } else {
        p.d = Math.max(0, p.d - dt * PARK_PACE.in);
        if (p.d <= 0) {
          p.going = null;
          if (p.m.role === 'stroll') p.loop = loopParam(p.route[0]!);
        }
      }
    }
  }

  /** A stroller stops where they are on the loop, and their way out starts from there. */
  private leaveLoop(p: ParkState): void {
    p.route = outFrom(pointAlongPath(LOOP_RING, p.loop));
    p.len = pathLength(p.route);
  }

  /** A stroller coming back walks in through the gate and starts their stroll from there. */
  private comeToGate(p: ParkState): void {
    p.route = [...PARK_EXIT];
    p.len = pathLength(p.route);
    p.d = p.len;
  }

  /** Where someone is and what they are doing. */
  poseOf(p: ParkState): { pose: ParkPose; at: V2; heading: number } {
    if (p.d >= p.len) return { pose: 'away', at: p.route[p.route.length - 1]!, heading: 0 };
    if (p.d <= 0) {
      if (p.m.role === 'stroll') {
        const at = pointAlongPath(LOOP_RING, p.loop);
        const ahead = pointAlongPath(LOOP_RING, mod(p.loop + 0.05, LOOP_LEN));
        return { pose: p.going === 'out' ? 'up' : 'home', at, heading: Math.atan2(ahead[0] - at[0], ahead[1] - at[1]) };
      }
      // A child off the swing in the wet stands under its frame, waiting for the rain to stop.
      const waiting = p.m.role === 'swing' && this.wet;
      return { pose: p.going === 'out' || waiting ? 'up' : 'home', at: p.m.at, heading: p.m.facing };
    }
    const at = pointAlongPath(p.route, p.d);
    // Facing the way they walk: along the route going out, back along it coming in.
    const step = p.going === 'in' ? -0.05 : 0.05;
    const next = pointAlongPath(p.route, Math.max(0, Math.min(p.len, p.d + step)));
    const heading = Math.hypot(next[0] - at[0], next[1] - at[1]) < 1e-6 ? p.m.facing : Math.atan2(next[0] - at[0], next[1] - at[1]);
    return { pose: 'walk', at, heading };
  }

  /** Whether each swing has a child on it now (a swing only ever moves with someone on it; nobody swings in the wet). */
  swingTaken(k: number): boolean {
    const p = this.people.find((x) => x.m.role === 'swing' && x.m.k === k);
    return !!p && p.d === 0 && p.going === null && !this.wet;
  }
}

/** A speech bubble over someone in a conversation: where, and their turn in it (they speak by turns). */
export interface Talker {
  id: string;
  at: V2;
  turn: number;
}

/**
 * Who is talking now: everyone sitting in their place on a bench or at the picnic table whose bench (or table) has someone
 * else sitting at it too, as it takes two to talk. Each of them gets a bubble of their own, so a conversation shows over
 * both (or all) of the people in it, never over one side only.
 */
export function talkers(crowd: ParkCrowd): Talker[] {
  const seated = crowd.people.filter((p) => (p.m.role === 'bench' || p.m.role === 'picnic') && p.d === 0 && p.going === null);
  const group = (id: string): string => (id.startsWith('picnic-') ? 'picnic' : id.slice(0, id.lastIndexOf('-')));
  const out: Talker[] = [];
  for (const p of seated) {
    const mates = seated.filter((q) => group(q.m.id) === group(p.m.id));
    if (mates.length < 2) continue;
    out.push({ id: p.m.id, at: p.m.at, turn: mates.indexOf(p) });
  }
  return out;
}
