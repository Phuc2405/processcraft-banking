/**
 * The bank's clock. A day runs from the 08:00 staff briefing to midnight; the hours the bank
 * sleeps through (00:00 to 08:00) are skipped, and tired people recover during them.
 *
 *   PRE_OPEN     08:00-09:00  systems check, staff settle in
 *   WORKING      09:00-17:00  live customers: checkouts, BNPL purchases, POS swipes
 *   AFTER_HOURS  17:00-23:00  no new customers; the last queues drain
 *   EOD          23:00-24:00  the night cycle: batch clearing, Visa settlement, 3-way reconciliation
 *
 * The simulation moves in beats. A beat is a few minutes of bank time, and how many depends on how
 * much is going on: customers arrive in 5-minute beats, the quiet hours pass an hour at a time.
 */

import { activeLocale } from '../i18n/locale';

export type Phase = 'PRE_OPEN' | 'WORKING' | 'AFTER_HOURS' | 'EOD';

export const DAY_START = 8 * 60;
export const WORK_START = 9 * 60;
export const WORK_END = 17 * 60;
export const EOD_START = 23 * 60;
export const DAY_END = 24 * 60;

export const PHASES: ReadonlyArray<{ phase: Phase; from: number; to: number; label: string; short: string }> = [
  { phase: 'PRE_OPEN', from: DAY_START, to: WORK_START, label: 'Pre-open', short: 'Pre-open' },
  { phase: 'WORKING', from: WORK_START, to: WORK_END, label: 'Working hours', short: 'Working' },
  { phase: 'AFTER_HOURS', from: WORK_END, to: EOD_START, label: 'After hours', short: 'After hours' },
  { phase: 'EOD', from: EOD_START, to: DAY_END, label: 'EOD night cycle', short: 'EOD night' },
];

export function phaseAt(minute: number): Phase {
  if (minute < WORK_START) return 'PRE_OPEN';
  if (minute < WORK_END) return 'WORKING';
  if (minute < EOD_START) return 'AFTER_HOURS';
  return 'EOD';
}

const BEAT_MINUTES: Record<Phase, number> = { PRE_OPEN: 60, WORKING: 5, AFTER_HOURS: 60, EOD: 2 };

export const beatMinutes = (phase: Phase): number => BEAT_MINUTES[phase];

/** How many beats a whole day takes. */
export const BEATS_PER_DAY = PHASES.reduce((n, p) => n + (p.to - p.from) / BEAT_MINUTES[p.phase], 0);

/** Beats at the start of the day, including the opening one. Used for the progress bar. */
export function beatIndexAt(minute: number): number {
  let n = 0;
  for (const p of PHASES) {
    if (minute >= p.to) n += (p.to - p.from) / BEAT_MINUTES[p.phase];
    else if (minute > p.from) n += Math.floor((minute - p.from) / BEAT_MINUTES[p.phase]);
  }
  return n;
}

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export function formatClock(minute: number): string {
  const m = Math.min(minute, DAY_END);
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/**
 * Real milliseconds one beat takes at the Relaxed (1x) speed. The busy phases are slow enough to follow with your
 * eyes (one beat every 1.5 seconds); the quiet hours pass a little faster because nothing much happens in them.
 */
const BEAT_MS: Record<Phase, number> = { PRE_OPEN: 900, WORKING: 1500, AFTER_HOURS: 900, EOD: 1500 };

export interface SpeedChoice {
  /** What the button says. */
  label: string;
  /** How much faster than Relaxed this runs. */
  factor: number;
  /** A name for the speeds that have one. */
  name?: string;
}

/** The six speeds on the clock bar. 1x is Relaxed: one tick every 1.5 seconds. */
/** The name of a speed in the active language. */
export const speedNameText = (name: string | undefined): string | undefined => (name === undefined ? undefined : activeLocale() === 'vi' ? ({ 'Slow-mo': 'Chậm', Relaxed: 'Thong thả' } as Record<string, string>)[name] ?? name : name);

export const SPEEDS: readonly SpeedChoice[] = [
  { label: '0.25×', factor: 0.25, name: 'Slow-mo' },
  { label: '0.5×', factor: 0.5 },
  { label: '1×', factor: 1, name: 'Relaxed' },
  { label: '2×', factor: 2 },
  { label: '5×', factor: 5 },
  { label: '10×', factor: 10 },
];

/** The speed a new bank starts on: Relaxed. */
export const DEFAULT_SPEED_INDEX = 2;

/** The slowest speed. Guided walkthroughs lock to it so nothing runs ahead of the explanation. */
export const SLOWEST_SPEED_INDEX = 0;

export const beatMs = (phase: Phase, factor: number): number => Math.round(BEAT_MS[phase] / Math.max(0.1, factor));
