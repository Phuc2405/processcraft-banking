/**
 * The AML monitoring desk: three steps an analyst works through every day.
 *
 *   1. Monitor      rules run over the day's finished payments and raise alerts automatically:
 *                     LARGE_VALUE     any payment above $10,000 (the threshold-transaction line)
 *                     VELOCITY_BURST  eight or more card-not-present payments of $5 or less inside five minutes, the
 *                                     signature of a bot testing stolen cards
 *   2. Investigate  the analyst opens an alert, sees the payments behind it and the risk factors, and decides.
 *   3. Report       a suspicious activity report (SAR) is filed with the regulator, or the alert is closed as a false positive.
 *
 * Pure functions over the transaction log the simulation already keeps.
 */

import { BOT_SCENARIO_ID, AML_TEST_SCENARIO_ID, scenarioLabelEn } from './scenarios';
import { makeCustomer } from './traffic';
import type { Customer, DayEvent, TxRecord } from './types';

export const AML_THRESHOLD_CENTS = 1_000_000;
export const VELOCITY_WINDOW_MIN = 5;
export const VELOCITY_MIN_COUNT = 8;
export const VELOCITY_MAX_CENTS = 500;

export type AmlAlertKind = 'LARGE_VALUE' | 'VELOCITY_BURST';
export type AmlAlertStatus = 'OPEN' | 'SAR_FILED' | 'CLOSED_FALSE_POSITIVE';

export interface AmlAlert {
  /** Stable for the same payments: "LV-d1-5003" or "VB-d3-0915". */
  id: string;
  kind: AmlAlertKind;
  /** Minute of the day of the first payment behind it. */
  minute: number;
  /** Total value of the payments behind it. */
  amountCents: number;
  count: number;
  /** Packet ids of the payments behind it. */
  txIds: string[];
  /** The scenario label of the first payment. */
  scenario: string;
  /** 0 to 100: how strongly the rule fired. */
  riskScore: number;
  /** Approved payments behind it (money that actually moved). */
  approved: number;
}

const isCardNotPresent = (t: TxRecord): boolean => t.kind === 'ECOM' || t.kind === 'VIRTUAL';

/** The alerts the day's payments raise, newest first. */
export function scanForAml(log: readonly TxRecord[]): AmlAlert[] {
  const alerts: AmlAlert[] = [];
  for (const t of log) {
    if (t.amountCents <= AML_THRESHOLD_CENTS) continue;
    const over = t.amountCents / AML_THRESHOLD_CENTS;
    alerts.push({
      id: `LV-${t.id}`,
      kind: 'LARGE_VALUE',
      minute: t.minute,
      amountCents: t.amountCents,
      count: 1,
      txIds: [t.id],
      scenario: scenarioLabelEn(t.scenario),
      riskScore: Math.min(99, Math.round(55 + over * 10 + (t.isFraud ? 20 : 0))),
      approved: t.status === 'APPROVED' ? 1 : 0,
    });
  }
  const windows = new Map<number, TxRecord[]>();
  for (const t of log) {
    if (!isCardNotPresent(t) || t.amountCents > VELOCITY_MAX_CENTS || t.kind === 'VIRTUAL') continue;
    const w = Math.floor(t.minute / VELOCITY_WINDOW_MIN);
    const list = windows.get(w) ?? [];
    list.push(t);
    windows.set(w, list);
  }
  for (const [w, list] of windows) {
    if (list.length < VELOCITY_MIN_COUNT) continue;
    const sorted = [...list].sort((a, b) => a.minute - b.minute);
    const first = sorted[0]!;
    const minute = w * VELOCITY_WINDOW_MIN;
    const day = /^d(\d+)-/.exec(first.id)?.[1] ?? '0';
    alerts.push({
      id: `VB-d${day}-${String(Math.floor(minute / 60)).padStart(2, '0')}${String(minute % 60).padStart(2, '0')}`,
      kind: 'VELOCITY_BURST',
      minute: first.minute,
      amountCents: sorted.reduce((n, t) => n + t.amountCents, 0),
      count: sorted.length,
      txIds: sorted.map((t) => t.id),
      scenario: scenarioLabelEn(first.scenario),
      riskScore: Math.min(99, 60 + sorted.length * 3),
      approved: sorted.filter((t) => t.status === 'APPROVED').length,
    });
  }
  return alerts.sort((a, b) => b.minute - a.minute);
}

/** True when a burst is made of the botnet's own payments (Chaos Monkey day 3). */
export const isBotBurst = (alert: AmlAlert, log: readonly TxRecord[]): boolean => alert.kind === 'VELOCITY_BURST' && alert.txIds.some((id) => log.find((t) => t.id === id)?.scenario === BOT_SCENARIO_ID);

/** A $12,500 business transfer for the "send a test payment" button: well formed, funded, so it is approved and flagged. */
export function amlTestCustomer(seed: number, day: number, minute: number, event: DayEvent): Customer {
  const base = makeCustomer(seed, day, `aml-test-${day}-${Math.round(minute)}`, 'A2A', minute, event);
  const amount = 1_250_000;
  const a2a = base.payload.a2a;
  return {
    ...base,
    scenario: AML_TEST_SCENARIO_ID,
    payload: {
      ...base.payload,
      amount,
      isFraud: false,
      availableBalance: 5_000_000,
      ...(a2a ? { a2a: { ...a2a, endToEndId: a2a.endToEndId || `TFR-${day}-AML001`, creditorAgent: 'WSTPAU2S', interbankSettlementAmount: amount } } : {}),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The SAR form
// ─────────────────────────────────────────────────────────────────────────────

export type SarActivity = 'STRUCTURING' | 'CARD_TESTING' | 'LARGE_UNUSUAL' | 'SANCTIONS' | 'OTHER';
export const SAR_ACTIVITIES: readonly SarActivity[] = ['LARGE_UNUSUAL', 'CARD_TESTING', 'STRUCTURING', 'SANCTIONS', 'OTHER'];

export interface SarDraft {
  alertId: string;
  subject: string;
  activity: SarActivity;
  narrative: string;
  /** The analyst confirms the customer has not been told (tipping-off is an offence). */
  noTipOff: boolean;
}

export type SarProblem = 'SUBJECT' | 'NARRATIVE' | 'TIP_OFF';

export const SAR_MIN_NARRATIVE = 40;

/** What is still missing before the report can be filed. Empty when it can go. */
export function sarProblems(d: SarDraft): SarProblem[] {
  const out: SarProblem[] = [];
  if (d.subject.trim().length < 2) out.push('SUBJECT');
  if (d.narrative.trim().length < SAR_MIN_NARRATIVE) out.push('NARRATIVE');
  if (!d.noTipOff) out.push('TIP_OFF');
  return out;
}

/** The regulator's reference for a filed report: "SMR-2026-D3-VB0915". */
export const sarReference = (alertId: string, day: number): string => `SMR-2026-D${day}-${alertId.replace(/^(LV|VB)-d\d+-/, '$1').toUpperCase()}`;
