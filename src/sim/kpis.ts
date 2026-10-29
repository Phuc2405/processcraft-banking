/** The numbers an operations manager reads at the end of a day, and the day's profit and loss. */

import type { CheckoutKind, DayKpis, DayReport, DeclineReason } from './types';

export const CHECKOUT_KINDS: readonly CheckoutKind[] = ['POS', 'ECOM', 'VIRTUAL', 'BNPL', 'A2A', 'ATM', 'ONBOARD', 'QR', 'TELLER', 'SWIFT', 'DISPUTE'];

export const DECLINE_REASONS: readonly DeclineReason[] = [
  'FUNDS',
  'DCVV_EXPIRED',
  'DCVV_MISMATCH',
  'UNKNOWN_DPAN',
  'THREE_DS_REJECT',
  'OTP_ABANDONED',
  'DOWN_PAYMENT',
  'PIN_LOCKED',
  'A2A_INVALID',
  'ATM_JAM',
  'TIMEOUT',
  'PROCESS_ERROR',
  'EKYC_LIVENESS_FAILED',
  'BIOMETRIC_AUTH_REQUIRED',
  'FDS_HIGH_RISK_DEVICE',
  'AML_SANCTION_MATCH',
  'AML_STR_BLOCKED',
  'QR_PAYLOAD_INVALID',
  'SWIFT_INVALID',
  'TELLER_VAULT_LIMIT',
  'TELLER_SUSPECT_NOTE',
  'DISPUTE_REJECTED',
];

/** Why a payment was turned away, in a few plain words. */
export const DECLINE_LABEL: Record<DeclineReason, string> = {
  FUNDS: 'Not enough money',
  DCVV_EXPIRED: 'Expired dCVV',
  DCVV_MISMATCH: 'Wrong dCVV',
  UNKNOWN_DPAN: 'Unknown virtual card',
  THREE_DS_REJECT: '3DS rejected',
  OTP_ABANDONED: 'OTP never typed',
  DOWN_PAYMENT: 'Down payment declined',
  PIN_LOCKED: 'ATM PIN locked, card kept',
  A2A_INVALID: 'Transfer message rejected',
  ATM_JAM: 'ATM dispenser jammed',
  TIMEOUT: 'Customer gave up waiting',
  PROCESS_ERROR: 'Process error',
  EKYC_LIVENESS_FAILED: 'eKYC identity not proven',
  BIOMETRIC_AUTH_REQUIRED: 'FacePay face match failed',
  FDS_HIGH_RISK_DEVICE: 'FDS high-risk device',
  AML_SANCTION_MATCH: 'Sanctions list match',
  AML_STR_BLOCKED: 'Blocked after STR review',
  QR_PAYLOAD_INVALID: 'VietQR payload invalid',
  SWIFT_INVALID: 'SWIFT message rejected',
  TELLER_VAULT_LIMIT: 'Teller vault cash limit',
  TELLER_SUSPECT_NOTE: 'Suspect notes at the counter',
  DISPUTE_REJECTED: 'Dispute claim rejected',
};

/** The Phase 8 channels' own numbers. */
export function emptyExtKpis(): DayKpis['ext'] {
  return {
    accountsOpened: 0,
    ekycRejected: 0,
    qrPaid: 0,
    swiftSent: 0,
    swiftCents: 0,
    tellerDeposits: 0,
    tellerWithdrawals: 0,
    ctrFiled: 0,
    biometricChecks: 0,
    biometricFailed: 0,
    fdsBlocked: 0,
    strHeld: 0,
    strFiled: 0,
    sanctionsBlocked: 0,
    disputesRefunded: 0,
    disputesRejected: 0,
    refundedCents: 0,
  };
}

export function emptyKpis(): DayKpis {
  return {
    arrivals: 0,
    byKind: { POS: 0, ECOM: 0, VIRTUAL: 0, BNPL: 0, A2A: 0, ATM: 0, ONBOARD: 0, QR: 0, TELLER: 0, SWIFT: 0, DISPUTE: 0 },
    approved: 0,
    declined: 0,
    approvedCents: 0,
    declinedCents: 0,
    genuineCardCents: 0,
    declines: Object.fromEntries(DECLINE_REASONS.map((r) => [r, 0])) as Record<DeclineReason, number>,
    fraudAttempts: 0,
    fraudBlocked: 0,
    fraudSlipped: 0,
    fraudLossCents: 0,
    frictionLostCount: 0,
    frictionLostCents: 0,
    threeDs: { frictionless: 0, challenged: 0, passed: 0, abandoned: 0, rejected: 0 },
    virtual: { checkouts: 0, expired: 0, mismatch: 0, unknown: 0 },
    a2a: { transfers: 0, released: 0, invalid: 0, feeCents: 0 },
    atm: { sessions: 0, dispensed: 0, dispensedCents: 0, pinLocked: 0, jams: 0, jamCents: 0, refundedCents: 0 },
    ext: emptyExtKpis(),
    bnpl: { applications: 0, plans: 0, fallbackApproved: 0, downPaymentDeclined: 0, cardDeclined: 0, basketCents: 0, financedCents: 0, expectedLossCents: 0 },
    latencySumMs: 0,
    waitSumMin: 0,
    finished: 0,
    recon: { records: 0, matched: 0, breakAmount: 0, breakMissing: 0, breakDuplicate: 0, falseBreaks: 0, leakageCents: 0, leakedCount: 0, suspenseAddedCents: 0 },
    suspenseClearedCents: 0,
    suspenseClearedItems: 0,
    reworks: 0,
    coverCostCents: 0,
  };
}

// Money

/** Card interchange the bank earns on an approved genuine sale. */
export const INTERCHANGE_RATE = 0.02;
/** The flat fee the bank charges for releasing an instant transfer. */
export const A2A_FEE_CENTS = 25;
/** Merchant fee on a Pay-in-4 basket. */
export const BNPL_FEE_RATE = 0.06;
/** What it costs the bank each time a good customer is turned away: goodwill and the repeat business that goes with it. */
export const FRICTION_COST_CENTS = 1200;
/** What a person spends investigating and clearing one suspense item. */
export const INVESTIGATION_COST_CENTS = 900;
/** What one day of temporary cover costs. */
export const COVER_COST_CENTS = 12_000;

/** The chance a Pay-in-4 customer never pays the rest. Falls steeply as the underwriting score rises. */
export function bnplDefaultRate(score: number): number {
  return 0.25 * Math.exp(-(score - 400) / 140);
}

export interface Pnl {
  revenueCents: number;
  interchangeCents: number;
  bnplFeeCents: number;
  a2aFeeCents: number;
  fraudLossCents: number;
  bnplLossCents: number;
  leakageCents: number;
  investigationCents: number;
  frictionCents: number;
  coverCents: number;
  netCents: number;
}

export function pnl(k: DayKpis): Pnl {
  const interchangeCents = Math.round(k.genuineCardCents * INTERCHANGE_RATE);
  const bnplFeeCents = Math.round(k.bnpl.basketCents * BNPL_FEE_RATE);
  const investigationCents = k.suspenseClearedItems * INVESTIGATION_COST_CENTS;
  const frictionCents = k.frictionLostCount * FRICTION_COST_CENTS;
  const a2aFeeCents = k.a2a.feeCents;
  const revenueCents = interchangeCents + bnplFeeCents + a2aFeeCents;
  const netCents = revenueCents - k.fraudLossCents - k.bnpl.expectedLossCents - k.recon.leakageCents - investigationCents - frictionCents - k.coverCostCents;
  return {
    revenueCents,
    interchangeCents,
    bnplFeeCents,
    a2aFeeCents,
    fraudLossCents: k.fraudLossCents,
    bnplLossCents: k.bnpl.expectedLossCents,
    leakageCents: k.recon.leakageCents,
    investigationCents,
    frictionCents,
    coverCents: k.coverCostCents,
    netCents,
  };
}

export function formatMoney(cents: number, compact = false): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  if (compact && abs >= 100_000_00) return `${sign}$${(abs / 100_000_00).toFixed(1)}M`;
  if (compact && abs >= 10_000_00) return `${sign}$${(abs / 100_000).toFixed(1)}k`;
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${dollars}${compact ? '' : `.${String(abs % 100).padStart(2, '0')}`}`;
}

export const pct = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);

export const formatPct = (value: number, digits = 1): string => `${value.toFixed(digits)}%`;

// Comparing two days

export type RowFormat = 'count' | 'money' | 'pct' | 'minutes';
export type Better = 'higher' | 'lower' | 'neutral';

export interface KpiRowDef {
  id: string;
  label: string;
  format: RowFormat;
  better: Better;
  /** One line on why a manager cares. */
  help: string;
  get: (r: DayReport) => number;
}

const closeFatigue = (r: DayReport): number => r.close.avgFatigue;

export const KPI_ROWS: readonly KpiRowDef[] = [
  { id: 'net', label: 'Day profit & loss', format: 'money', better: 'higher', help: 'Fees earned, minus fraud, bad Pay-in-4 debt, missed breaks, lost goodwill and the cost of clearing the suspense account.', get: (r) => pnl(r.kpis).netCents },
  { id: 'approvedRate', label: 'Approval rate', format: 'pct', better: 'higher', help: 'Share of all payments the bank said yes to.', get: (r) => pct(r.kpis.approved, r.kpis.arrivals) },
  { id: 'approvedCents', label: 'Approved volume', format: 'money', better: 'higher', help: 'Value of everything approved today.', get: (r) => r.kpis.approvedCents },
  { id: 'fraudSlipped', label: 'Fraud approved', format: 'count', better: 'lower', help: 'Fraudulent payments the bank said yes to.', get: (r) => r.kpis.fraudSlipped },
  { id: 'fraudLoss', label: 'Fraud loss', format: 'money', better: 'lower', help: 'The value of that fraud. The bank pays it back.', get: (r) => r.kpis.fraudLossCents },
  { id: 'friction', label: 'Good customers turned away', format: 'count', better: 'lower', help: 'Genuine customers lost to an expired code, an OTP they walked away from, a 3DS reject, or a long wait.', get: (r) => r.kpis.frictionLostCount },
  { id: 'frictionCents', label: 'Sales lost to friction', format: 'money', better: 'lower', help: 'The value of those lost sales.', get: (r) => r.kpis.frictionLostCents },
  { id: 'challengeRate', label: '3DS challenge rate', format: 'pct', better: 'neutral', help: 'Share of online payments sent to the customer’s phone for a one-time code.', get: (r) => pct(r.kpis.threeDs.challenged, r.kpis.threeDs.frictionless + r.kpis.threeDs.challenged + r.kpis.threeDs.rejected) },
  { id: 'otpAbandon', label: 'OTP abandonment', format: 'pct', better: 'lower', help: 'Share of challenged customers who never typed the code.', get: (r) => pct(r.kpis.threeDs.abandoned, r.kpis.threeDs.challenged) },
  { id: 'dcvvExpired', label: 'Expired dCVV declines', format: 'count', better: 'neutral', help: 'Virtual-card payments declined because the code was too old.', get: (r) => r.kpis.virtual.expired },
  { id: 'bnplPlans', label: 'Pay-in-4 plans approved', format: 'count', better: 'higher', help: 'Customers who got a four-instalment plan.', get: (r) => r.kpis.bnpl.plans },
  { id: 'bnplLoss', label: 'Expected Pay-in-4 bad debt', format: 'money', better: 'lower', help: 'What the bank expects not to collect from those plans.', get: (r) => r.kpis.bnpl.expectedLossCents },
  { id: 'a2aReleased', label: 'Instant transfers released', format: 'count', better: 'higher', help: 'Account-to-account transfers that passed the pacs.008 check and the ledger.', get: (r) => r.kpis.a2a.released },
  { id: 'atmJams', label: 'ATM jams', format: 'count', better: 'lower', help: 'Withdrawals where the customer was debited but the notes never came out. The money waits in suspense until the cash count clears it.', get: (r) => r.kpis.atm.jams },
  { id: 'wait', label: 'Average wait', format: 'minutes', better: 'lower', help: 'Minutes a payment spent in queues.', get: (r) => (r.kpis.finished > 0 ? r.kpis.waitSumMin / r.kpis.finished : 0) },
  { id: 'falseBreaks', label: 'False breaks', format: 'count', better: 'lower', help: 'Records flagged as breaks that were only rounding dust. Staff time spent on nothing.', get: (r) => r.kpis.recon.falseBreaks },
  { id: 'leakedCount', label: 'Real errors matched away', format: 'count', better: 'lower', help: 'Genuine mistakes in the records that the tolerance let through as a match.', get: (r) => r.kpis.recon.leakedCount },
  { id: 'leakage', label: 'Value of errors matched away', format: 'money', better: 'lower', help: 'The money in those mistakes.', get: (r) => r.kpis.recon.leakageCents },
  { id: 'suspense', label: 'Suspense balance at close', format: 'money', better: 'lower', help: 'Money parked in the suspense account, not yet explained.', get: (r) => r.close.suspenseCents },
  { id: 'reconBacklog', label: 'Unreconciled at midnight', format: 'count', better: 'lower', help: 'Records the night team did not get to. They are carried into tomorrow night.', get: (r) => r.close.reconBacklog },
  { id: 'fatigue', label: 'Staff fatigue at close', format: 'pct', better: 'lower', help: 'Average tiredness across the team when the day ended.', get: closeFatigue },
];

export type Verdict = 'better' | 'worse' | 'same';

export interface KpiComparisonRow {
  def: KpiRowDef;
  before: number;
  after: number;
  delta: number;
  verdict: Verdict;
}

/** Differences smaller than this are treated as the same: a single payment, a tenth of a point, a few cents. */
function epsilon(format: RowFormat): number {
  switch (format) {
    case 'count':
      return 0.5;
    case 'money':
      return 50;
    case 'pct':
      return 0.05;
    case 'minutes':
      return 0.05;
  }
}

export function compareReports(before: DayReport, after: DayReport): KpiComparisonRow[] {
  return KPI_ROWS.map((def) => {
    const b = def.get(before);
    const a = def.get(after);
    const delta = a - b;
    const same = Math.abs(delta) < epsilon(def.format);
    const verdict: Verdict = same || def.better === 'neutral' ? 'same' : (delta > 0) === (def.better === 'higher') ? 'better' : 'worse';
    return { def, before: b, after: a, delta: same ? 0 : delta, verdict };
  });
}

export function formatKpi(value: number, format: RowFormat): string {
  switch (format) {
    case 'count':
      return String(Math.round(value));
    case 'money':
      return formatMoney(value, Math.abs(value) >= 1_000_00);
    case 'pct':
      return formatPct(value);
    case 'minutes':
      return `${value.toFixed(1)} min`;
  }
}

export function formatDelta(delta: number, format: RowFormat): string {
  if (delta === 0) return '—';
  const sign = delta > 0 ? '+' : '−';
  const abs = Math.abs(delta);
  switch (format) {
    case 'count':
      return `${sign}${Math.round(abs)}`;
    case 'money':
      return `${sign}${formatMoney(abs, abs >= 1_000_00)}`;
    case 'pct':
      return `${sign}${abs.toFixed(1)} pts`;
    case 'minutes':
      return `${sign}${abs.toFixed(1)} min`;
  }
}
