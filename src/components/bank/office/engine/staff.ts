import { DAY_START, EOD_START } from '../../../../sim/clock';
import { DAY_SHIFT, NIGHT_SHIFT } from '../../../../sim/roster';
import type { StationId } from '../../../../sim/topology';

/**
 * The people who work the desks, coming in before their shift (Strategy: ShiftScheduleStrategy). The day's tellers and
 * officers and the night's reconciliation clerks are the same kind of StaffEntity; what differs is the schedule they keep:
 * when they set off for work, and whether they sit ready ahead of the simulation putting them on duty. Pure, so the tests
 * can check every member of staff is seated before their shift.
 */

/** When the staff come in: [first to set off, last to set off], in the bank's minutes. */
export const STAFF_ARRIVAL = { day: [DAY_START, DAY_START + 20], night: [EOD_START - 60, EOD_START - 40] } as const;

/** Where a member of staff is, as far as the 3D office shows it: not in yet, in and sitting ready (before the simulation has
 * them on duty), or as the simulation has them (at the desk, or gone home). */
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

  /** Where they are at `minute`: not in yet (their shift's window has opened, their time has not come), sitting ready
   * ahead of the shift, or as the simulation has them. */
  presence(minute: number): StaffPresence {
    const [from] = this.schedule.arrival;
    const due = this.setOff;
    if (minute >= from && minute < due) return 'away';
    if (this.schedule.readyUntil !== null && minute >= due && minute < this.schedule.readyUntil) return 'ready';
    return 'roster';
  }
}
