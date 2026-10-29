import { eventText } from '../../sim/traffic';
import type { DayEvent } from '../../sim/types';
import { message } from '../../utils/i18nHelper';
import { dayIntroMessages } from './dayIntro.messages';

/**
 * The start-of-day banner, shown over the map (2D blueprint and 3D office alike) as each new bank day opens: the day's
 * number and what kind of day it is, what is going on, and what to watch for. Pure, so the tests can read it.
 */

/** How long the banner stays up before it fades away by itself, in milliseconds. */
export const DAY_INTRO_MS = 9000;
/** How long the banner takes to fade out when it goes (timed out or closed), in ms: its `duration-500` opacity transition. */
export const DAY_INTRO_FADE_MS = 500;

/** The day's number as the banner shows it: two digits ("Day 03"). */
export const dayLabel = (day: number): string => String(Math.max(1, Math.trunc(day))).padStart(2, '0');

export interface DayIntroCopy {
  /** "Day 03 – An ordinary day" */
  heading: string;
  /** What is happening today. */
  detail: string;
  /** "What to watch:" */
  watchLabel: string;
  /** The hint after it. */
  watch: string;
  /** Whether it is a special day (a sale, an outage, a payday…) rather than an ordinary one. */
  special: boolean;
}

export function dayIntroCopy(day: number, event: DayEvent): DayIntroCopy {
  const text = eventText(event);
  return {
    heading: message(dayIntroMessages, 'heading', { day: dayLabel(day), title: text.title }),
    detail: text.blurb,
    watchLabel: message(dayIntroMessages, 'watch'),
    watch: text.watch,
    special: event.id !== 'NORMAL',
  };
}

/**
 * Whether the banner should open now: on the first look at the bank, and whenever the day number moves on, but never over
 * the end-of-day report (it waits until that is closed, so the new day's banner follows the old day's report).
 */
export function introDue(shownFor: number | null, day: number, reportOpen: boolean): boolean {
  return !reportOpen && shownFor !== day;
}
