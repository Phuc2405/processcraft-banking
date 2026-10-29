import { DAY_START, EOD_START } from '../../sim/clock';
import { DAY_SHIFT, NIGHT_SHIFT } from '../../sim/roster';
import type { StationId } from '../../sim/topology';
import { COUNTER, FRONT_AISLE_Z, KERB_Z, MAIN_GATE, STREET, type Pose, type V2 } from '../plan/layout3d';
import { pathLength, pointAlongPath } from '../plan/path';

/** The people who work the desks, coming in before their shift (Strategy: ShiftScheduleStrategy). */

/** When the staff come in: [first to set off, last to set off], in the bank's minutes. */
export const STAFF_ARRIVAL = { day: [DAY_START, DAY_START + 20], night: [EOD_START - 60, EOD_START - 40] } as const;

/** Where a member of staff is, as far as the 3D office shows it. */
export type StaffPresence = 'away' | 'ready' | 'roster';

/** A shift's schedule: one per shift, shared by everyone on it. */
export interface ShiftScheduleStrategy {
  readonly name: 'MORNING' | 'NIGHT';
  /** The shift's hours, as the roster states them (sim/roster.ts). */
  readonly hours: string;
  /** The window its staff set off for work in. */
  readonly arrival: readonly [number, number];
  /** Until when someone who is in sits ready at the desk while the simulation still has them off shift (null: never). */
  readonly readyUntil: number | null;
  /** The minute the member of staff `seed` (in seat `seat`) sets off: spread through the window, steady per person. */
  setOff(seed: string, seat: number): number;
}

/** A schedule's set-off time: a steady hash of the person spread across the window, ending a few minutes short of it. */
function spreadSetOff([from, by]: readonly [number, number], seed: string, seat: number): number {
  let h = seat * 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 9973;
  return from + ((h % 97) / 97) * (by - from - 4);
}

class Schedule implements ShiftScheduleStrategy {
  constructor(
    readonly name: 'MORNING' | 'NIGHT',
    readonly hours: string,
    readonly arrival: readonly [number, number],
    readonly readyUntil: number | null,
  ) {}

  setOff(seed: string, seat: number): number {
    return spreadSetOff(this.arrival, seed, seat);
  }
}

/** The day's staff: they set off between 07:00 and 07:20 for the 08:00 shift, which the simulation starts them on. */
export const MORNING_SHIFT_SCHEDULE: ShiftScheduleStrategy = new Schedule('MORNING', DAY_SHIFT, STAFF_ARRIVAL.day, null);

/** The night's staff: they set off between 22:00 and 22:20 and sit ready until the night's work starts at 23:00. */
export const NIGHT_SHIFT_SCHEDULE: ShiftScheduleStrategy = new Schedule('NIGHT', NIGHT_SHIFT, STAFF_ARRIVAL.night, EOD_START);

/** One member of staff at a desk, on their shift's schedule. */
export class StaffEntity {
  constructor(
    readonly id: string,
    readonly desk: StationId | null,
    readonly seat: number,
    readonly schedule: ShiftScheduleStrategy,
  ) {}

  /** The minute they set off for work. */
  get setOff(): number {
    return this.schedule.setOff(this.id, this.seat);
  }

  /** Where they are at `minute`: not in yet (their shift's window has opened, their time has not come), sitting ready ahead of the shift, or as the simulation has them. */
  presence(minute: number): StaffPresence {
    const [from] = this.schedule.arrival;
    const due = this.setOff;
    if (minute >= from && minute < due) return 'away';
    if (this.schedule.readyUntil !== null && minute >= due && minute < this.schedule.readyUntil) return 'ready';
    return 'roster';
  }
}

// Staff coming and going

/** The simulation's own words for a member of staff who has gone home (bankSimulation.ts workerView). */
export const isOffShift = (activity: string): boolean => /^(Off shift|Desk closed)/.test(activity);

/** How fast staff walk out, in world units a second; and how briskly they come in before a shift, to be at their desks well before it starts. */
export const LEAVE_SPEED = 1.4;
export const ARRIVE_SPEED = 3.5;

/** The pavement's inner walking lane (clear of the ATM booths and the guard's cabin), where staff come and go. */
const STAFF_LANE_Z = KERB_Z - 0.85;

/** The way out for someone seated at `seat` (relative to the desk at `pose`). */
export function leaveRoute(pose: Pose, seat: V2, k = 0): V2[] {
  const sx = pose.x + seat[0];
  const sz = pose.z + seat[1];
  const aisle = pose.x + COUNTER.w / 2 + 0.55;
  const end = (k % 2 ? -1 : 1) * (STREET.halfWidth + 1.5);
  return [
    [sx, sz],
    [aisle, sz],
    [aisle, FRONT_AISLE_Z],
    [MAIN_GATE.x, FRONT_AISLE_Z],
    [MAIN_GATE.x, STAFF_LANE_Z],
    [end, STAFF_LANE_Z],
  ];
}

/** The minute the `k`th member of staff at a desk sets off for work: spread through their shift's arrival window, steady per person (their shift's ShiftScheduleStrategy). */
export const arrivalMinute = (night: boolean, seed: string, k: number): number => (night ? NIGHT_SHIFT_SCHEDULE : MORNING_SHIFT_SCHEDULE).setOff(seed, k);

/** At `minute`, who of a desk's staff (`ids`, in seat order) is not in yet (`away`. */
export function arrivalState(night: boolean, ids: readonly string[], minute: number): { away: string[]; early: string[] } {
  const schedule = night ? NIGHT_SHIFT_SCHEDULE : MORNING_SHIFT_SCHEDULE;
  const away: string[] = [];
  const early: string[] = [];
  ids.forEach((id, k) => {
    const presence = new StaffEntity(id, null, k, schedule).presence(minute);
    if (presence === 'away') away.push(id);
    else if (presence === 'ready') early.push(id);
  });
  return { away, early };
}

/** The way in to `seat`: the way out walked backwards, from down the street, in at the main entrance, to the chair. */
export const arriveRoute = (pose: Pose, seat: V2, k = 0): V2[] => leaveRoute(pose, seat, k).reverse();

/** Where someone on `route` is after walking for `t` seconds at `speed`, which way they face, and whether they are there. */
export function leaveAt(route: readonly V2[], t: number, speed: number = LEAVE_SPEED): { at: V2; heading: number; done: boolean } {
  const len = pathLength(route);
  const d = Math.min(len, Math.max(0, t) * speed);
  const at = pointAlongPath(route, d);
  const ahead = pointAlongPath(route, Math.min(len, d + 0.05));
  const heading = ahead[0] === at[0] && ahead[1] === at[1] ? 0 : Math.atan2(ahead[0] - at[0], ahead[1] - at[1]);
  return { at, heading, done: d >= len };
}
