/**
 * Everything the End-of-Day report shows that is worked out rather than read straight off the day: the P&L lines in order,
 * revenue against losses, the biggest loss, the decline reasons grouped for the overview bar, the coaching tips and the
 * takeaway, and the CSV export. Pure functions of a DayReport, so the screen and the download always agree.
 */

import { PNL_GLOSSARY, type PnlLabel } from '../data/reportGlossary';
import { formatClock } from './clock';
import { DECLINE_LABEL, DECLINE_REASONS, formatMoney, pct, pnl } from './kpis';
import type { ProcessId } from './learning';
import { STATIONS } from './topology';
import { scenarioLabelEn } from './scenarios';
import type { DayReport, DeclineReason, PacketKind, TxRecord } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Profit & loss
// ─────────────────────────────────────────────────────────────────────────────

export interface PnlLine {
  label: PnlLabel;
  cents: number;
  kind: 'revenue' | 'loss' | 'net';
}

/** The P&L in report order. Temporary cover only appears on days the bank booked some. */
export function pnlLines(r: DayReport): PnlLine[] {
  const p = pnl(r.kpis);
  const lines: PnlLine[] = [
    { label: 'Card interchange', cents: p.interchangeCents, kind: 'revenue' },
    { label: 'Pay-in-4 merchant fees', cents: p.bnplFeeCents, kind: 'revenue' },
    { label: 'Instant-transfer fees', cents: p.a2aFeeCents, kind: 'revenue' },
    { label: 'Fraud the bank repaid', cents: p.fraudLossCents, kind: 'loss' },
    { label: 'Expected Pay-in-4 bad debt', cents: p.bnplLossCents, kind: 'loss' },
    { label: 'Real errors matched away', cents: p.leakageCents, kind: 'loss' },
    { label: 'Clearing the suspense account', cents: p.investigationCents, kind: 'loss' },
    { label: 'Good customers lost', cents: p.frictionCents, kind: 'loss' },
  ];
  if (p.coverCents > 0) lines.push({ label: 'Temporary cover', cents: p.coverCents, kind: 'loss' });
  lines.push({ label: 'Day result', cents: p.netCents, kind: 'net' });
  return lines;
}

/** Gross revenue earned against everything lost or written off. revenue − losses = the day's result. */
export function revenueVsLosses(r: DayReport): { revenueCents: number; lossCents: number; netCents: number } {
  const lines = pnlLines(r);
  const revenueCents = lines.filter((l) => l.kind === 'revenue').reduce((n, l) => n + l.cents, 0);
  const lossCents = lines.filter((l) => l.kind === 'loss').reduce((n, l) => n + l.cents, 0);
  return { revenueCents, lossCents, netCents: revenueCents - lossCents };
}

/** The single biggest loss line of the day, and its share of all losses; null on a day with no losses at all. */
export function topDrain(r: DayReport): { label: PnlLabel; cents: number; share: number } | null {
  const losses = pnlLines(r).filter((l) => l.kind === 'loss' && l.cents > 0);
  if (losses.length === 0) return null;
  const total = losses.reduce((n, l) => n + l.cents, 0);
  const top = losses.reduce((a, b) => (b.cents > a.cents ? b : a));
  return { label: top.label, cents: top.cents, share: top.cents / total };
}

// ─────────────────────────────────────────────────────────────────────────────
// Declines, grouped
// ─────────────────────────────────────────────────────────────────────────────

export type DeclineGroupId = 'NSF' | 'OTP' | 'RISK' | 'HARDWARE' | 'QUEUE';

export const DECLINE_GROUPS: ReadonlyArray<{ id: DeclineGroupId; label: string; color: string; reasons: readonly DeclineReason[] }> = [
  { id: 'NSF', label: 'Not enough money', color: '#64748b', reasons: ['FUNDS', 'DOWN_PAYMENT'] },
  { id: 'OTP', label: 'OTP abandoned', color: '#f59e0b', reasons: ['OTP_ABANDONED'] },
  { id: 'RISK', label: 'Risk & security blocks', color: '#f43f5e', reasons: ['THREE_DS_REJECT', 'DCVV_EXPIRED', 'DCVV_MISMATCH', 'UNKNOWN_DPAN', 'A2A_INVALID'] },
  { id: 'HARDWARE', label: 'ATM hardware', color: '#38bdf8', reasons: ['ATM_JAM', 'PIN_LOCKED'] },
  { id: 'QUEUE', label: 'Queues & errors', color: '#a78bfa', reasons: ['TIMEOUT', 'PROCESS_ERROR'] },
];

/** The day's declines in the overview's groups, with each group's share of all declines. Every reason is in exactly one group. */
export function declineGroups(r: DayReport): Array<{ id: DeclineGroupId; label: string; color: string; count: number; share: number }> {
  const total = DECLINE_REASONS.reduce((n, reason) => n + r.kpis.declines[reason], 0);
  return DECLINE_GROUPS.map((g) => {
    const count = g.reasons.reduce((n, reason) => n + r.kpis.declines[reason], 0);
    return { id: g.id, label: g.label, color: g.color, count, share: total === 0 ? 0 : count / total };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Coaching
// ─────────────────────────────────────────────────────────────────────────────

/** Lower-cases the first word of a label, unless it is an acronym such as OTP or 3DS. */
const lowerFirst = (text: string): string => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

export interface Tip {
  text: string;
  process: ProcessId | null;
}

/** Up to three plain observations about the day, each pointing at the lesson that explains it. */
export function coachTips(r: DayReport): Tip[] {
  const k = r.kpis;
  const tips: Array<Tip & { weight: number }> = [];
  const declines = (Object.entries(k.declines) as Array<[DeclineReason, number]>).filter(([reason]) => reason !== 'FUNDS' && reason !== 'PROCESS_ERROR').sort((a, b) => b[1] - a[1]);
  const top = declines[0];

  if (k.fraudSlipped >= 4) tips.push({ weight: k.fraudLossCents / 100, text: `${k.fraudSlipped} fraud payments slipped through, costing ${formatMoney(k.fraudLossCents)}. Consider tightening the 3DS risk thresholds before Day ${r.day + 1}.`, process: 'B' });
  if (top && top[1] >= 8) {
    const process: ProcessId | null =
      top[0] === 'DCVV_EXPIRED' || top[0] === 'DCVV_MISMATCH' || top[0] === 'UNKNOWN_DPAN'
        ? 'A'
        : top[0] === 'THREE_DS_REJECT' || top[0] === 'OTP_ABANDONED'
          ? 'B'
          : top[0] === 'DOWN_PAYMENT'
            ? 'C'
            : top[0] === 'ATM_JAM'
              ? 'D'
              : top[0] === 'A2A_INVALID'
                ? 'E'
                : null;
    tips.push({
      weight: (k.frictionLostCents / 100) * 0.5 + top[1],
      text:
        top[0] === 'TIMEOUT'
          ? `${top[1]} customers gave up waiting in a queue. The desks were short of hands, not short of rules: look at the queues and call in cover.`
          : `The biggest reason customers were turned away, apart from money, was “${lowerFirst(DECLINE_LABEL[top[0]])}” (${top[1]}).`,
      process,
    });
  }
  if (k.recon.falseBreaks >= 15) tips.push({ weight: k.recon.falseBreaks * 3, text: `${k.recon.falseBreaks} records were flagged as breaks when they were only rounding dust. Each one took a person’s time.`, process: 'D' });
  if (k.recon.leakedCount >= 1) tips.push({ weight: k.recon.leakageCents / 100, text: `${k.recon.leakedCount} real errors worth ${formatMoney(k.recon.leakageCents)} were matched away by the tolerance and nobody will look at them.`, process: 'D' });
  if (r.close.reconBacklog > 0) tips.push({ weight: r.close.reconBacklog, text: `The night team left ${r.close.reconBacklog} records unreconciled at midnight. They roll into tomorrow night.`, process: 'D' });
  if (k.bnpl.expectedLossCents > k.bnpl.basketCents * 0.06 * 0.8 && k.bnpl.plans > 20) tips.push({ weight: k.bnpl.expectedLossCents / 100, text: `Expected bad debt on Pay-in-4 plans (${formatMoney(k.bnpl.expectedLossCents)}) is eating most of the fee earned (${formatMoney(Math.round(k.bnpl.basketCents * 0.06))}).`, process: 'C' });
  if (k.a2a.invalid >= 3) tips.push({ weight: k.a2a.invalid * 4, text: `${k.a2a.invalid} instant transfers were turned back because the bank-to-bank message was malformed. No money moved, and the sender has to start again.`, process: 'E' });
  if (k.atm.jams >= 1) tips.push({ weight: k.atm.jamCents / 100 + 20, text: `${k.atm.jams} sidewalk ATM ${k.atm.jams === 1 ? 'withdrawal' : 'withdrawals'} jammed after the customer was debited (${formatMoney(k.atm.jamCents)}). The money waited in the suspense account until the cash count cleared it.`, process: 'D' });
  if (r.close.maxFatigue >= 80) tips.push({ weight: r.close.maxFatigue, text: 'Someone finished the day exhausted. Tired people slow down and slip, which lengthens queues. Temporary cover is cheap next to that.', process: null });

  return tips
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(({ text, process }) => ({ text, process }));
}


/** The one recommendation the overview leads with: the day's most costly problem, and the chapter that explains it. */
export function takeaway(r: DayReport): Tip {
  const top = coachTips(r)[0];
  if (top) return top;
  return { text: 'A clean day: nothing cost the bank much. Try tightening a rule in the Rule Lab and see whether you can beat it.', process: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV export
// ─────────────────────────────────────────────────────────────────────────────

const cell = (v: string | number): string => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dollars = (cents: number): string => (cents / 100).toFixed(2);

/** Approved ÷ all payments × 100, to one decimal place: "94.3". `pct` already returns a percentage, so it is not multiplied again. */
export const approvalRateText = (approved: number, total: number): string => pct(approved, total).toFixed(1);

export const CSV_HEADER = ['Section', 'Item', 'Value', 'Unit', 'Note'] as const;

/**
 * The day's report as a CSV file: one row per figure, in five columns, so it opens straight into Excel, Numbers or Google
 * Sheets. Money is in dollars with two decimals and no symbol, so a spreadsheet can add it up. Lines end in CRLF and the file
 * starts with a byte-order mark, which is what Excel needs to read the emoji and the curly quotes correctly.
 */
export function reportCsv(r: DayReport, glossary: Readonly<Record<string, string>> = PNL_GLOSSARY): string {
  const rows: Array<Array<string | number>> = [];
  const add = (section: string, item: string, value: string | number, unit = '', note = ''): void => {
    rows.push([section, item, value, unit, note]);
  };
  const k = r.kpis;

  add('Report', 'Day', r.day);
  add('Report', 'Event', r.event.title, '', r.event.blurb);

  if (r.book) {
    add('Capital', 'Reserves at start of day', dollars(r.book.reservesStartCents), 'AUD');
    add('Capital', 'Net result', dollars(r.book.reservesEndCents - r.book.reservesStartCents), 'AUD');
    add('Capital', 'Reserves at end of day', dollars(r.book.reservesEndCents), 'AUD');
    add('Customers', 'Active at start of day', r.book.customersStart, 'customers');
    add('Customers', 'New signups', r.book.signups, 'customers');
    add('Customers', 'Churned (friction or false declines)', r.book.churned, 'customers');
    add('Customers', 'Active at end of day', r.book.customersEnd, 'customers');
  }

  for (const l of pnlLines(r)) add('Profit & loss', l.label, dollars(l.kind === 'loss' ? -l.cents : l.cents), 'AUD', glossary[l.label] ?? '');
  const bal = revenueVsLosses(r);
  add('Profit & loss', 'Gross revenue', dollars(bal.revenueCents), 'AUD');
  add('Profit & loss', 'Total losses and write-offs', dollars(-bal.lossCents), 'AUD');
  const drain = topDrain(r);
  if (drain) add('Profit & loss', 'Top revenue drain', drain.label, '', `${dollars(-drain.cents)} AUD, ${Math.round(drain.share * 100)}% of all losses`);

  add('Operations', 'Payments', k.arrivals, 'payments');
  add('Operations', 'Approved', k.approved, 'payments');
  add('Operations', 'Approval rate', approvalRateText(k.approved, k.arrivals), '%');
  add('Operations', 'Approved volume', dollars(k.approvedCents), 'AUD');
  add('Operations', 'Fraud attempts', k.fraudAttempts, 'payments');
  add('Operations', 'Fraud approved', k.fraudSlipped, 'payments');
  add('Operations', 'Pay-in-4 plans', k.bnpl.plans, 'plans');
  add('Operations', 'Instant transfers released', k.a2a.released, 'transfers', `of ${k.a2a.transfers}`);
  add('Operations', 'ATM withdrawals paid out', k.atm.dispensed, 'withdrawals', `of ${k.atm.sessions} sessions`);
  add('Operations', 'ATM jams', k.atm.jams, 'withdrawals');
  add('Operations', '3DS challenged', k.threeDs.challenged, 'payments');
  add('Operations', 'Average wait', k.finished > 0 ? (k.waitSumMin / k.finished).toFixed(2) : '', 'minutes');
  add('Operations', 'Records matched overnight', k.recon.matched, 'records', `of ${k.recon.records}`);
  add('Operations', 'Suspense account at midnight', dollars(r.close.suspenseCents), 'AUD', `${r.close.suspenseItems} items`);
  add('Operations', 'Records left unreconciled', r.close.reconBacklog, 'records');

  const declines = DECLINE_REASONS.reduce((n, reason) => n + k.declines[reason], 0);
  for (const reason of DECLINE_REASONS) {
    const n = k.declines[reason];
    if (n > 0) add('Declines', DECLINE_LABEL[reason], n, 'payments', `${reason}; ${Math.round((n / declines) * 1000) / 10}% of declines`);
  }
  for (const g of declineGroups(r)) add('Decline groups', g.label, g.count, 'payments', `${Math.round(g.share * 1000) / 10}% of declines`);

  if (r.nightShift) {
    const n = r.nightShift;
    add('Night shift', 'Status', n.finishedAt !== null ? `Complete at ${formatClock(n.finishedAt)}` : `Incomplete: ${n.left} records left`);
    add('Night shift', 'Records worked', n.records - n.left, 'records', `of ${n.records} (${Math.round(n.completion * 100)}%)`);
    for (const m of n.crew) add('Night shift', m.name, 100 - m.fatigue, '% stamina', `${STATIONS[m.station].name}; ${m.items} records${m.temp ? '; temporary cover' : ''}`);
    if (n.resting.length > 0) add('Night shift', 'Off tonight (rota)', n.resting.join('; '));
  }

  const t = takeaway(r);
  add('Takeaway', 'Recommendation', t.text);
  return `﻿${[CSV_HEADER, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

export const reportFileName = (r: DayReport): string => `processcraft-day-${r.day}-report.csv`;

/** Today's net result as money text with a sign: "-$4,531.66" or "+$1,200.00". */
export const signedMoney = (cents: number): string => (cents >= 0 ? `+${formatMoney(cents)}` : formatMoney(cents));

// ─────────────────────────────────────────────────────────────────────────────
// Master Transactions export
// ─────────────────────────────────────────────────────────────────────────────

export const TX_CSV_HEADER = [
  'Timestamp',
  'Transaction_ID',
  'Channel_Type',
  'Amount_AUD',
  'Fee_Earned_AUD',
  'Status',
  'Decline_Reason',
  'Is_Fraud',
  'Overnight_Reconciled',
  'Channel_Detail',
  'Card_Type',
  'Merchant_Description',
  'Ledger_Ref',
] as const;

export type ChannelType = 'CARD_PAYMENT' | 'PAY_IN_4' | 'INSTANT_A2A' | 'ATM_WITHDRAWAL' | 'CASH_DEPOSIT';

export const CHANNEL_TYPE: Record<Exclude<PacketKind, 'SETTLEMENT'>, ChannelType> = {
  POS: 'CARD_PAYMENT',
  ECOM: 'CARD_PAYMENT',
  VIRTUAL: 'CARD_PAYMENT',
  BNPL: 'PAY_IN_4',
  A2A: 'INSTANT_A2A',
  ATM: 'ATM_WITHDRAWAL',
};

/** "08:14:22" for a minute of the day with a fraction for the seconds. */
export function clockWithSeconds(minute: number): string {
  const total = Math.max(0, Math.round(minute * 60));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * The day's raw transaction stream as a CSV file, one row per customer payment in the order they arrived. The first nine
 * columns are the standard ones; the last four help trace a row back to the screen (the channel the payment came in on, the
 * card type, the merchant story and the payment id the ledger drawer shows). Built only when the learner asks for it.
 */
export function transactionsCsv(records: readonly TxRecord[]): string {
  const rows = [...records]
    .sort((a, b) => a.minute - b.minute || (a.txId < b.txId ? -1 : 1))
    .map((t) => [
      clockWithSeconds(t.minute),
      t.txId,
      t.deposit ? 'CASH_DEPOSIT' : (CHANNEL_TYPE[t.kind as Exclude<PacketKind, 'SETTLEMENT'>] ?? t.kind),
      dollars(t.amountCents),
      dollars(t.feeCents),
      t.status,
      t.decline ?? '',
      t.isFraud ? 'YES' : 'NO',
      t.recon,
      t.kind,
      t.kind === 'A2A' ? 'ACCOUNT' : t.cardType,
      scenarioLabelEn(t.scenario),
      t.id,
    ]);
  return `\uFEFF${[TX_CSV_HEADER, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

export const transactionsFileName = (day: number): string => `processcraft-day-${day}-transactions.csv`;
