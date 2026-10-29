import { GUARD_CABIN, KERB_Z, MAIN_GATE, STREET, type V2 } from './layout3d';
import { HANDOVER_S, shiftOf } from './parking';

/**
 * The security guard at the branch's main entrance, and their cabin beside it. By day in fair weather the guard on duty
 * stands at a post by the entrance and now and then walks a slow beat along the front of the branch and back. In rain,
 * a storm, hail or snow, and at night, they go into the cabin (in at its door, on the side towards the entrance) and keep
 * watch from behind the glass under its lamp. Three guards share the day in eight-hour shifts (06:00, 14:00, 22:00); at a
 * change the next one walks up the pavement to take over and the one going off duty walks away down it. Everything here is
 * pure, stepped on the motion clock (and so frozen on pause).
 */

/** The post by the entrance, the end of the beat along the front, and the spot inside the cabin. */
export const FRONT_POST: V2 = [MAIN_GATE.x - MAIN_GATE.width / 2 - 0.25, STREET.z0 + 1.55];
export const BEAT_END: V2 = [MAIN_GATE.x + MAIN_GATE.width / 2 + 0.6, STREET.z0 + 1.55];
export const CABIN_IN: V2 = [GUARD_CABIN.x - 0.1, GUARD_CABIN.z];
/** The cabin's door: in the middle of its side towards the entrance, and the step just outside it. */
export const CABIN_DOOR: V2 = [GUARD_CABIN.x + GUARD_CABIN.w / 2, GUARD_CABIN.z];
const DOORSTEP: V2 = [GUARD_CABIN.x + GUARD_CABIN.w / 2 + 0.45, GUARD_CABIN.z];

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

/** The ways into the cabin (from the post, to the doorstep, in through the door) and out of it again; and onto the
 * pavement's walking line from the post, clear of the cabin and the ATM booths. */
const INTO_CABIN: V2[] = [FRONT_POST, DOORSTEP, CABIN_DOOR, CABIN_IN];
const OUT_OF_CABIN: V2[] = [CABIN_DOOR, DOORSTEP, FRONT_POST];
const TO_PAVEMENT: V2 = [FRONT_POST[0], PAVEMENT_Z];

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

/** The guard (and, during a handover, the two guards) at the front of the branch. */
export class FrontGuard {
  t = 0;
  shift: 0 | 1 | 2;
  /** The guard on duty. */
  private duty: Walker;
  private inside: boolean;
  /** During a change of shift: the guard going off, walking away, and how long the handover has run. */
  private leaving: Walker | null = null;
  private since = 0;

  constructor(minute: number, wet: boolean) {
    this.shift = shiftOf(minute);
    this.inside = inCabin(minute, wet);
    this.duty = new Walker(this.inside ? CABIN_IN : FRONT_POST);
  }

  step(dt: number, minute: number, wet: boolean): void {
    this.t += dt;
    const shift = shiftOf(minute);
    if (shift !== this.shift) {
      // The new guard comes up the pavement; the one on duty heads off the other way once they meet.
      this.shift = shift;
      this.leaving = this.duty;
      this.leaving.via = [...(this.isInCabin(this.leaving.at) ? OUT_OF_CABIN : []), TO_PAVEMENT];
      this.duty = new Walker(SHIFT_IN);
      this.duty.via = this.inside ? [...INTO_CABIN] : [FRONT_POST];
      this.since = 0;
    }
    if (this.leaving) {
      this.since += dt;
      if (this.since > HANDOVER_S * 0.3 && this.leaving.walk(SHIFT_OUT, dt, GUARD_PACE.walk)) this.leaving = null;
    }
    const want = inCabin(minute, wet);
    if (want !== this.inside) {
      // In by the post and the door, or out by the door to the post.
      this.inside = want;
      const there = this.isInCabin(this.duty.at);
      this.duty.via = want ? (there ? [] : [...INTO_CABIN]) : there ? [...OUT_OF_CABIN] : [];
    }
    const goal = this.inside ? CABIN_IN : beatAt(this.t);
    const there = this.duty.walk(goal, dt, GUARD_PACE.walk);
    // Standing still at the post or in the cabin, they face the street.
    if (there && !this.duty.walking) this.duty.heading = 0;
  }

  private isInCabin(p: V2): boolean {
    return Math.abs(p[0] - GUARD_CABIN.x) < GUARD_CABIN.w / 2 && Math.abs(p[1] - GUARD_CABIN.z) < GUARD_CABIN.d / 2;
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
