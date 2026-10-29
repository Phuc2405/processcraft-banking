import { GUARD_CABIN, KERB_Z, MAIN_GATE, STREET, type V2 } from '../plan/layout3d';
import { AISLE, BACK_LANE, GUARD_DOOR, GUARD_POST, guardPatrol, HANDOVER_S, LOT, LOT_SIDE, shiftOf } from './parking';

/** The security guard at the branch's main entrance, and their cabin beside it. */

/** A cabin: its middle, its size along x and z, and its height. Its door is in the side facing +x or -x (`door`). */
export interface Cabin {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  door: 1 | -1;
}

/** Everything a guard post needs: the cabin, where the guard stands and patrols, the way in and out of the cabin by its door, and where guards come on and go off duty. */
export interface GuardPostPlan {
  cabin: Cabin;
  post: V2;
  /** Where the patrol has the guard at time `t`. */
  beat: (t: number) => V2;
  /** Which way a guard standing still faces (radians about y). */
  face: number;
  /** In from the post by the door, and out again. */
  into: readonly V2[];
  out: readonly V2[];
  /** Where an incoming guard comes from, and the way to the post; where the outgoing one leaves by, and goes. */
  shiftIn: V2;
  arrive: readonly V2[];
  leaveBy: V2;
  shiftOut: V2;
}

/** The ways into a cabin from a post (to the doorstep, in through the door, to the middle) and out of it again. */
function cabinRoutes(c: Cabin, post: V2): { inside: V2; door: V2; into: V2[]; out: V2[] } {
  const door: V2 = [c.x + (c.door * c.w) / 2, c.z];
  const step: V2 = [door[0] + c.door * 0.45, c.z];
  const inside: V2 = [c.x - c.door * 0.1, c.z];
  return { inside, door, into: [post, step, door, inside], out: [door, step, post] };
}

/** The post by the entrance, the end of the beat along the front, and the spot inside the cabin. */
export const FRONT_POST: V2 = [MAIN_GATE.x - MAIN_GATE.width / 2 - 0.25, STREET.z0 + 1.55];
export const BEAT_END: V2 = [MAIN_GATE.x + MAIN_GATE.width / 2 + 0.6, STREET.z0 + 1.55];
const FRONT_CABIN: Cabin = { ...GUARD_CABIN, door: 1 };
const FRONT_ROUTES = cabinRoutes(FRONT_CABIN, FRONT_POST);
export const CABIN_IN: V2 = FRONT_ROUTES.inside;
/** The cabin's door: in the middle of its side towards the entrance. */
export const CABIN_DOOR: V2 = FRONT_ROUTES.door;

/** Where guards come on and go off duty: along the pavement, from and to past the ends of the street. */
const PAVEMENT_Z = KERB_Z - 0.75;
export const SHIFT_IN: V2 = [-STREET.halfWidth - 6, PAVEMENT_Z];
export const SHIFT_OUT: V2 = [STREET.halfWidth + 6, PAVEMENT_Z];

export const GUARD_PACE = { walk: 1.1, beat: 0.45 } as const;

/** Whether the guard keeps watch from inside the cabin: in wet weather and at night (19:00 to 06:00). */
export const inCabin = (minute: number, wet: boolean): boolean => wet || minute < 6 * 60 || minute >= 19 * 60;

/** Where the beat takes the guard at time `t`: 16 s at the post, then a slow walk to the end of the beat and back. */
export function beatAt(t: number): V2 {
  const len = Math.hypot(BEAT_END[0] - FRONT_POST[0], BEAT_END[1] - FRONT_POST[1]);
  const walk = len / GUARD_PACE.beat;
  const cycle = 16 + 2 * walk + 3;
  const u = ((t % cycle) + cycle) % cycle;
  let k = 0;
  if (u >= 16 && u < 16 + walk) k = (u - 16) / walk;
  else if (u >= 16 + walk && u < 16 + walk + 3) k = 1;
  else if (u >= 16 + walk + 3) k = 1 - (u - 16 - walk - 3) / walk;
  return [FRONT_POST[0] + (BEAT_END[0] - FRONT_POST[0]) * k, FRONT_POST[1] + (BEAT_END[1] - FRONT_POST[1]) * k];
}

/** The main entrance's post: the beat along the front, and shifts changing along the pavement's walking line. */
export const FRONT_PLAN: GuardPostPlan = {
  cabin: FRONT_CABIN,
  post: FRONT_POST,
  beat: beatAt,
  face: 0,
  into: FRONT_ROUTES.into,
  out: FRONT_ROUTES.out,
  shiftIn: SHIFT_IN,
  arrive: [],
  leaveBy: [FRONT_POST[0], PAVEMENT_Z],
  shiftOut: SHIFT_OUT,
};

/** The car park's guard cabin: beside the guard's post at the gate, on the outer side of the drive, in the corner the bays leave free (before the first bay of the outer row), its door on the side towards the post. */
export const PARKING_CABIN: Cabin = { x: LOT_SIDE * (AISLE + 2.75), z: LOT.gateZ + 0.55, w: 1.1, d: 1.0, h: 2.1, door: (-LOT_SIDE) as 1 | -1 };
const PARKING_ROUTES = cabinRoutes(PARKING_CABIN, GUARD_POST);
export const PARKING_PLAN: GuardPostPlan = {
  cabin: PARKING_CABIN,
  post: GUARD_POST,
  beat: (t) => guardPatrol(t).at,
  face: Math.PI,
  into: PARKING_ROUTES.into,
  out: PARKING_ROUTES.out,
  shiftIn: [LOT_SIDE * (LOT.x1 + 7), BACK_LANE.out - 0.85],
  arrive: [GUARD_DOOR],
  leaveBy: GUARD_DOOR,
  shiftOut: [LOT_SIDE * (LOT.x1 + 7), BACK_LANE.out - 0.85],
};

export interface GuardFigure {
  at: V2;
  heading: number;
  walking: boolean;
}

/** One guard walking towards where they want to be: straight there, except in and out of the cabin by its door. */
class Walker {
  at: V2;
  heading = 0;
  walking = false;
  /** Waypoints still to walk before heading for the goal. */
  via: V2[] = [];

  constructor(at: V2) {
    this.at = at;
  }

  /** Walks up to `dt * pace` towards `goal`; true once there. */
  walk(goal: V2, dt: number, pace: number): boolean {
    let left = dt * pace;
    let moved = false;
    for (;;) {
      const next = this.via[0] ?? goal;
      const dx = next[0] - this.at[0];
      const dz = next[1] - this.at[1];
      const d = Math.hypot(dx, dz);
      if (d < 1e-4) {
        if (this.via.length) {
          this.via.shift();
          continue;
        }
        this.walking = moved;
        return true;
      }
      this.heading = Math.atan2(dx, dz);
      if (left <= 0) break;
      const s = Math.min(d, left);
      this.at = [this.at[0] + (dx / d) * s, this.at[1] + (dz / d) * s];
      left -= s;
      moved = true;
    }
    this.walking = true;
    return false;
  }
}

/** The guard (and, during a handover, the two guards) at a post: the front of the branch unless another plan is given. */
export class FrontGuard {
  t = 0;
  shift: 0 | 1 | 2;
  /** The guard on duty. */
  private duty: Walker;
  private inside: boolean;
  /** During a change of shift: the guard going off, walking away, and how long the handover has run. */
  private leaving: Walker | null = null;
  private since = 0;

  constructor(
    minute: number,
    wet: boolean,
    readonly plan: GuardPostPlan = FRONT_PLAN,
  ) {
    this.shift = shiftOf(minute);
    this.inside = inCabin(minute, wet);
    this.duty = new Walker(this.inside ? this.cabinIn : plan.post);
  }

  private get cabinIn(): V2 {
    return this.plan.into[this.plan.into.length - 1]!;
  }

  step(dt: number, minute: number, wet: boolean): void {
    this.t += dt;
    const shift = shiftOf(minute);
    if (shift !== this.shift) {
      // The new guard comes up the pavement; the one on duty heads off the other way once they meet.
      this.shift = shift;
      this.leaving = this.duty;
      this.leaving.via = [...(this.isInCabin(this.leaving.at) ? this.plan.out : []), this.plan.leaveBy];
      this.duty = new Walker(this.plan.shiftIn);
      this.duty.via = [...this.plan.arrive, ...(this.inside ? this.plan.into : [this.plan.post])];
      this.since = 0;
    }
    if (this.leaving) {
      this.since += dt;
      if (this.since > HANDOVER_S * 0.3 && this.leaving.walk(this.plan.shiftOut, dt, GUARD_PACE.walk)) this.leaving = null;
    }
    const want = inCabin(minute, wet);
    if (want !== this.inside) {
      // In by the post and the door, or out by the door to the post.
      this.inside = want;
      const there = this.isInCabin(this.duty.at);
      this.duty.via = want ? (there ? [] : [...this.plan.into]) : there ? [...this.plan.out] : [];
    }
    const goal = this.inside ? this.cabinIn : this.plan.beat(this.t);
    const there = this.duty.walk(goal, dt, GUARD_PACE.walk);
    // Standing still at the post or in the cabin, they face the way they keep watch.
    if (there && !this.duty.walking) this.duty.heading = this.plan.face;
  }

  private isInCabin(p: V2): boolean {
    const c = this.plan.cabin;
    return Math.abs(p[0] - c.x) < c.w / 2 && Math.abs(p[1] - c.z) < c.d / 2;
  }

  /** The guard on duty, and the one going off duty during a handover. */
  figures(): { duty: GuardFigure; leaving: GuardFigure | null } {
    const f = (w: Walker): GuardFigure => ({ at: w.at, heading: w.heading, walking: w.walking });
    return { duty: f(this.duty), leaving: this.leaving ? f(this.leaving) : null };
  }

  /** Whether the guard on duty is inside the cabin now. */
  sheltered(): boolean {
    return this.isInCabin(this.duty.at);
  }
}
