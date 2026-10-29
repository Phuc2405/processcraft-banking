/** The sidewalk ATM: what the machine itself does, apart from the bank behind it. */

import type { MinorUnits } from '../types/processLearning';
import { formatAud } from './money';

/** How many PIN tries a card gets before the machine locks the session and keeps the card. */
export const MAX_PIN_TRIES = 3;

/** The notes the machine holds, largest first. The $50 cassette and the $20 cassette: the usual Australian ATM. */
export const NOTE_DENOMINATIONS: readonly MinorUnits[] = [5000, 2000];

/** The least a withdrawal can be, and the most in one go. */
export const ATM_MIN_CENTS = 2000;
export const ATM_MAX_CENTS = 100_000;

export type PinOutcome = 'VERIFIED' | 'LOCKED';

export interface PinResult {
  outcome: PinOutcome;
  /** How many tries were used, the last one included. */
  tries: number;
  /** Plain words for the machine's log. */
  note: string;
}

/** `wrongBefore` is how many wrong PINs the customer types before (if ever) the right one. */
export function verifyPin(wrongBefore: number, eventuallyCorrect: boolean): PinResult {
  const wrong = Math.max(0, Math.floor(wrongBefore));
  if (!eventuallyCorrect || wrong >= MAX_PIN_TRIES) {
    return { outcome: 'LOCKED', tries: MAX_PIN_TRIES, note: `PIN wrong ${MAX_PIN_TRIES} times: the machine locks the session and keeps the card.` };
  }
  return {
    outcome: 'VERIFIED',
    tries: wrong + 1,
    note: wrong === 0 ? 'PIN accepted on the first try.' : `PIN accepted on try ${wrong + 1} of ${MAX_PIN_TRIES}.`,
  };
}

export interface NoteMix {
  /** Each denomination used and how many notes of it, largest first. */
  notes: Array<{ value: MinorUnits; count: number }>;
  /** What the notes add up to. Equals the request when `ok`. */
  total: MinorUnits;
  ok: boolean;
}

/** The fewest notes that make exactly `amount`, or `ok: false` when the machine cannot pay it in whole notes. */
export function noteMix(amount: MinorUnits): NoteMix {
  let left = amount;
  const notes: NoteMix['notes'] = [];
  const [big = 5000, small = 2000] = NOTE_DENOMINATIONS;
  // Use as many large notes as leave a remainder the small note can finish.
  for (let large = Math.floor(left / big); large >= 0; large--) {
    const rest = left - large * big;
    if (rest % small === 0) {
      if (large > 0) notes.push({ value: big, count: large });
      if (rest > 0) notes.push({ value: small, count: rest / small });
      return { notes, total: amount, ok: amount > 0 };
    }
  }
  return { notes: [], total: 0, ok: false };
}

export const describeNotes = (mix: NoteMix): string =>
  mix.ok ? mix.notes.map((n) => `${n.count} × ${formatAud(n.value)}`).join(' + ') : 'no combination of notes';

export type DispenseOutcome = 'DISPENSED' | 'JAMMED' | 'REFUSED';

export interface DispenseResult {
  outcome: DispenseOutcome;
  mix: NoteMix;
  note: string;
}

/** Counts the notes out. `jams` is whether the dispenser fails on this withdrawal (fixed in advance by the day's seed). */
export function dispense(amount: MinorUnits, jams: boolean): DispenseResult {
  if (amount < ATM_MIN_CENTS || amount > ATM_MAX_CENTS) {
    return { outcome: 'REFUSED', mix: { notes: [], total: 0, ok: false }, note: `${formatAud(amount)} is outside what the machine pays (${formatAud(ATM_MIN_CENTS)} to ${formatAud(ATM_MAX_CENTS)}).` };
  }
  const mix = noteMix(amount);
  if (!mix.ok) return { outcome: 'REFUSED', mix, note: `${formatAud(amount)} cannot be paid in whole ${NOTE_DENOMINATIONS.map(formatAud).join(' and ')} notes.` };
  if (jams) return { outcome: 'JAMMED', mix, note: `Counted ${describeNotes(mix)} but the notes jammed in the dispenser: nothing came out.` };
  return { outcome: 'DISPENSED', mix, note: `Dispensed ${describeNotes(mix)}.` };
}
