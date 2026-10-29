/** The 08:00-24:00 time bar, as numbers. */

import { DAY_END, DAY_START, PHASES, type Phase } from '../../sim/clock';

/** How much of the bar (in percent) each phase takes. They add up to 100. */
export const SEGMENT_WIDTH: Record<Phase, number> = { PRE_OPEN: 11, WORKING: 40, AFTER_HOURS: 29, EOD: 20 };

/** A dragged or clicked time snaps to this many minutes. */
export const SCRUB_SNAP = 5;

/** Where on the bar a clock time sits, from 0 (08:00) to 1 (24:00). */
export function minuteToFraction(minute: number): number {
  let x = 0;
  for (const seg of PHASES) {
    const w = SEGMENT_WIDTH[seg.phase];
    if (minute >= seg.to) x += w;
    else {
      if (minute > seg.from) x += ((minute - seg.from) / (seg.to - seg.from)) * w;
      break;
    }
  }
  return Math.max(0, Math.min(1, x / 100));
}

/** The clock time at a point of the bar (0 to 1), snapped to SCRUB_SNAP minutes and kept inside the day. */
export function fractionToMinute(fraction: number): number {
  const at = Math.max(0, Math.min(1, fraction)) * 100;
  let left = 0;
  let minute = DAY_END;
  for (const seg of PHASES) {
    const w = SEGMENT_WIDTH[seg.phase];
    if (at <= left + w) {
      minute = seg.from + ((at - left) / w) * (seg.to - seg.from);
      break;
    }
    left += w;
  }
  return clampMinute(Math.round(minute / SCRUB_SNAP) * SCRUB_SNAP);
}

export const clampMinute = (minute: number): number => Math.max(DAY_START, Math.min(DAY_END, Math.round(minute)));

/** What the arrow keys do on the scrubber: a quarter of an hour, or a whole hour with Page Up and Page Down. */
export function keyStep(key: string, minute: number): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clampMinute(minute + 15);
    case 'ArrowLeft':
    case 'ArrowDown':
      return clampMinute(minute - 15);
    case 'PageUp':
      return clampMinute(minute + 60);
    case 'PageDown':
      return clampMinute(minute - 60);
    case 'Home':
      return DAY_START;
    case 'End':
      return DAY_END;
    default:
      return null;
  }
}
