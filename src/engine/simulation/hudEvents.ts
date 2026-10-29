/** HUD toasts: small alerts over the map when a payment fails in one of three ways a learner should notice. */

import type { DeclineReason } from '../../sim/types';

export type HudKind = 'OTP' | 'DCVV' | 'NSF';

export const HUD_EVENTS: ReadonlyArray<{ kind: HudKind; reason: DeclineReason; title: string; tone: 'amber' | 'red' }> = [
  { kind: 'OTP', reason: 'OTP_ABANDONED', title: 'SMS OTP Abandonment', tone: 'amber' },
  { kind: 'DCVV', reason: 'DCVV_EXPIRED', title: 'dCVV Timeout', tone: 'amber' },
  { kind: 'NSF', reason: 'FUNDS', title: 'NSF Block', tone: 'red' },
];

export const HUD_MAX = 3;
export const HUD_TTL_MS = 3500;

export interface HudToast {
  id: number;
  kind: HudKind;
  count: number;
  at: number;
}

export type DeclineCounts = Readonly<Partial<Record<DeclineReason, number>>>;

/** What happened between two snapshots of the day's decline counters: one entry per watched event that went up, with how many. */
export function newEvents(before: DeclineCounts | null, after: DeclineCounts): Array<{ kind: HudKind; count: number }> {
  if (!before) return [];
  const out: Array<{ kind: HudKind; count: number }> = [];
  for (const e of HUD_EVENTS) {
    const delta = (after[e.reason] ?? 0) - (before[e.reason] ?? 0);
    if (delta > 0) out.push({ kind: e.kind, count: delta });
  }
  return out;
}

/** Adds toasts, newest first, keeping at most HUD_MAX: a new event pushes the oldest one off. */
export function pushToasts(current: readonly HudToast[], added: readonly HudToast[]): HudToast[] {
  return [...[...added].reverse(), ...current].slice(0, HUD_MAX);
}
