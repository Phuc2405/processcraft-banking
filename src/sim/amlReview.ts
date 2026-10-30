/**
 * The AML desk's what-if decision engine: review cases (from the monitoring rules and from three money-laundering typologies),
 * four decision paths with their downstream consequences, and the after-action scorecard. No React here.
 *
 * Patterns: a Factory per typology makes its cases; a Strategy per decision path applies it; each case walks a State machine
 * (open, released, frozen, escalated, pending EDD, SAR filed...); every ledger effect is a Command, a journal the desk posts.
 */

import type { LedgerLine } from './staffRoleplay';
import { calculatePenalty, type DisciplineEvent } from '../engine/penaltyEngine';
import type { AmlAlert } from './amlMonitor';
import type { TxRecord } from './types';

// Cases

export type AmlTypology = 'STRUCTURING' | 'MONEY_MULE' | 'SYNTHETIC_ID' | 'LARGE_VALUE' | 'VELOCITY_BURST';

/** One movement of money behind a case. */
export interface CaseTx {
  minute: number;
  amountCents: number;
  /** "CDM deposit", "Inbound transfer"... (a message key of the desk's copy). */
  what: 'CDM_DEPOSIT' | 'ATM_DEPOSIT' | 'INBOUND' | 'OUTBOUND' | 'CARD' | 'TRANSFER';
}

/** The proof of funds a customer sends for enhanced due diligence. */
export interface EddDocument {
  kind: 'VAT_INVOICE' | 'INCOME_STATEMENT';
  /** What the document shows: consistent with the money, or not (dates, amounts, issuer). */
  genuine: boolean;
  /** How many of the bank's minutes after the request the customer uploads it: within the 24-hour SLA, after it, or never (null: the customer stalls). */
  uploadAfterMin: number | null;
}

/** Who the account holder is, as KYC has them: the baseline a case's money is judged against. */
export interface CustomerProfile {
  segment: 'STUDENT' | 'NEW_RETAIL' | 'GIG_WORKER' | 'MARKET_TRADER' | 'IMPORT_EXPORT' | 'SALARIED_PRO';
  /** How long the account has been open, in days. */
  tenureDays: number;
  /** What normally goes through the account in a month (cents). */
  avgMonthlyCents: number;
  kyc: 'BASIC_EKYC' | 'CHIP_ID_FACE' | 'FULL_CDD';
  history: 'UNKNOWN_SENDERS' | 'FIXED_PARTNERS' | 'REGULAR_PAYROLL' | 'NO_HISTORY';
}

export interface ReviewCase {
  id: string;
  typology: AmlTypology;
  /** The bank day the case turned up on: an unresolved case stays on the desk across the night, with its own day and time. */
  day: number;
  /** The account holder's KYC baseline. */
  profile: CustomerProfile;
  /** The account holder, as the case shows them. */
  subject: string;
  /** The money the decision acts on (held, frozen or released). */
  amountCents: number;
  minute: number;
  txs: readonly CaseTx[];
  /** The red flags, as message keys of the desk's copy. */
  indicators: readonly string[];
  riskScore: number;
  /** The truth the desk cannot see: laundering, or a legitimate customer who only looks like it. */
  laundering: boolean;
  edd: EddDocument;
}

/** A deterministic 0-1 value for a key, so a day's cases and their outcomes are the same on every replay. */
export function roll(...parts: Array<string | number>): number {
  let h = 2166136261;
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 100_000) / 100_000;
}

const NAMES = ['Nguyen Van An', 'Tran Thi Binh', 'Le Hoang Cuong', 'Pham Thu Dung', 'Vo Minh Em', 'Hoang Gia Phat', 'Dang Ngoc Hanh', 'Bui Quoc Khanh'];

/** Makes the cases of one typology (Factory). */
export interface TypologyFactory {
  readonly typology: Extract<AmlTypology, 'STRUCTURING' | 'MONEY_MULE' | 'SYNTHETIC_ID'>;
  make(seed: number, day: number, k: number): ReviewCase;
}

/** The KYC baseline: a launderer's account is thin (new, low volume, basic eKYC, strangers sending money); a legitimate lookalike's fits the money it moves. */
export function profileFor(id: string, laundering: boolean, typology: AmlTypology): CustomerProfile {
  const r = (k: string): number => roll(id, 'kyc', k);
  if (laundering) {
    const segment = (['STUDENT', 'NEW_RETAIL', 'GIG_WORKER'] as const)[Math.floor(r('seg') * 3)]!;
    return { segment, tenureDays: typology === 'SYNTHETIC_ID' ? 1 : 3 + Math.floor(r('t') * 40), avgMonthlyCents: (5 + Math.floor(r('v') * 15)) * 10_000, kyc: 'BASIC_EKYC', history: typology === 'SYNTHETIC_ID' ? 'NO_HISTORY' : 'UNKNOWN_SENDERS' };
  }
  const segment = typology === 'STRUCTURING' ? 'MARKET_TRADER' : typology === 'SYNTHETIC_ID' ? 'SALARIED_PRO' : 'IMPORT_EXPORT';
  return { segment, tenureDays: 365 + Math.floor(r('t') * 4 * 365), avgMonthlyCents: (40 + Math.floor(r('v') * 160)) * 100_000, kyc: segment === 'IMPORT_EXPORT' ? 'FULL_CDD' : 'CHIP_ID_FACE', history: segment === 'SALARIED_PRO' ? 'REGULAR_PAYROLL' : 'FIXED_PARTNERS' };
}

/** How many months of the customer's normal volume the case's money is: over 5, an extreme red flag. */
export const volumeMultiple = (c: Pick<ReviewCase, 'amountCents' | 'profile'>): number => Math.round((10 * c.amountCents) / Math.max(1, c.profile.avgMonthlyCents)) / 10;
export const EXTREME_MULTIPLE = 5;

/** EDD's proof: genuine for a legitimate customer; a launderer's is forged. When it comes: a legitimate customer sends it on time
 *  (2 to 20 bank hours) or late (26 to 40); a launderer on time, late, or never (stalling: 40% of them). */
function eddFor(id: string, laundering: boolean, kind: EddDocument['kind']): EddDocument {
  const u = roll(id, 'upload');
  const onTime = Math.round(120 + roll(id, 'upload-at') * 18 * 60);
  const late = Math.round(EDD_SLA_MIN + 120 + roll(id, 'upload-at') * 14 * 60);
  const uploadAfterMin = laundering ? (u < 0.4 ? null : u < 0.7 ? late : onTime) : u < 0.25 ? late : onTime;
  return { kind, genuine: !laundering, uploadAfterMin };
}

/** Structuring / smurfing: five cash deposits at the CDM just under the $2,500 reporting line, within 15 minutes. A market stall's takings look the same. */
const STRUCTURING: TypologyFactory = {
  typology: 'STRUCTURING',
  make(seed, day, k) {
    const id = `ST-d${day}-${k}`;
    const laundering = roll(seed, id, 'truth') < 0.75;
    const start = 9 * 60 + Math.floor(roll(seed, id, 'm') * 7 * 60);
    const txs: CaseTx[] = Array.from({ length: 5 }, (_, i) => ({ minute: start + i * 3, amountCents: 210_000, what: i % 2 ? 'ATM_DEPOSIT' : 'CDM_DEPOSIT' }));
    return { id, typology: 'STRUCTURING', day, profile: profileFor(id, laundering, 'STRUCTURING'), subject: NAMES[Math.floor(roll(seed, id, 'n') * NAMES.length)]!, amountCents: 1_050_000, minute: start, txs, indicators: ['ind_belowLimit', 'ind_rapidDeposits', 'ind_multiMachine'], riskScore: 78, laundering, edd: eddFor(id, laundering, 'VAT_INVOICE') };
  },
};

/** Money mule: money in from many senders and straight out again to one beneficiary, within the hour. A small trader collecting for a group buy looks the same. */
const MONEY_MULE: TypologyFactory = {
  typology: 'MONEY_MULE',
  make(seed, day, k) {
    const id = `MM-d${day}-${k}`;
    const laundering = roll(seed, id, 'truth') < 0.75;
    const start = 10 * 60 + Math.floor(roll(seed, id, 'm') * 6 * 60);
    const ins: CaseTx[] = Array.from({ length: 6 }, (_, i) => ({ minute: start + i * 6, amountCents: 175_000, what: 'INBOUND' }));
    const txs = [...ins, { minute: start + 40, amountCents: 1_050_000, what: 'OUTBOUND' as const }];
    return { id, typology: 'MONEY_MULE', day, profile: profileFor(id, laundering, 'MONEY_MULE'), subject: NAMES[Math.floor(roll(seed, id, 'n') * NAMES.length)]!, amountCents: 1_050_000, minute: start, txs, indicators: ['ind_passThrough', 'ind_manySenders', 'ind_zeroBalance'], riskScore: 84, laundering, edd: eddFor(id, laundering, 'INCOME_STATEMENT') };
  },
};

/** Synthetic identity / rapid in-out: a day-old account, a mismatched identity score, and its whole balance out at once. A newcomer moving their savings looks the same. */
const SYNTHETIC_ID: TypologyFactory = {
  typology: 'SYNTHETIC_ID',
  make(seed, day, k) {
    const id = `SI-d${day}-${k}`;
    const laundering = roll(seed, id, 'truth') < 0.75;
    const start = 11 * 60 + Math.floor(roll(seed, id, 'm') * 5 * 60);
    const txs: CaseTx[] = [
      { minute: start, amountCents: 1_050_000, what: 'INBOUND' },
      { minute: start + 8, amountCents: 1_050_000, what: 'OUTBOUND' },
    ];
    return { id, typology: 'SYNTHETIC_ID', day, profile: profileFor(id, laundering, 'SYNTHETIC_ID'), subject: NAMES[Math.floor(roll(seed, id, 'n') * NAMES.length)]!, amountCents: 1_050_000, minute: start, txs, indicators: ['ind_newAccount', 'ind_idMismatch', 'ind_instantDrain'], riskScore: 88, laundering, edd: eddFor(id, laundering, 'INCOME_STATEMENT') };
  },
};

export const TYPOLOGY_FACTORIES: readonly TypologyFactory[] = [STRUCTURING, MONEY_MULE, SYNTHETIC_ID];

/** The typology cases of a day: one of each pattern, the same for the same seed and day. */
export const typologyCases = (seed: number, day: number): ReviewCase[] => TYPOLOGY_FACTORIES.map((f, k) => f.make(seed, day, k));

/** A monitoring alert as a review case (Adapter): laundering when a payment behind it was fraud (or a botnet's). */
export function alertCase(a: AmlAlert, log: readonly TxRecord[], day = 1): ReviewCase {
  const rows = a.txIds.map((id) => log.find((t) => t.id === id)).filter((t): t is TxRecord => t !== undefined);
  const laundering = rows.some((t) => t.isFraud);
  return {
    id: a.id,
    typology: a.kind,
    day,
    profile: profileFor(a.id, laundering, a.kind),
    subject: a.scenario,
    amountCents: a.amountCents,
    minute: a.minute,
    txs: rows.map((t) => ({ minute: t.minute, amountCents: t.amountCents, what: t.kind === 'A2A' ? 'TRANSFER' : 'CARD' })),
    indicators: a.kind === 'LARGE_VALUE' ? ['ind_overThreshold'] : ['ind_velocity'],
    riskScore: a.riskScore,
    laundering,
    edd: eddFor(a.id, laundering, 'INCOME_STATEMENT'),
  };
}

// Decisions and their consequences

export type AmlPath = 'FALSE_POSITIVE' | 'FREEZE' | 'REQUEST_EDD' | 'FILE_SAR';
export const AML_PATHS: readonly AmlPath[] = ['FALSE_POSITIVE', 'FREEZE', 'REQUEST_EDD', 'FILE_SAR'];

/** Where a case stands (State). */
export type CaseState = 'OPEN' | 'RELEASED' | 'FROZEN' | 'ESCALATED' | 'TEMP_RELEASED' | 'PENDING_EDD' | 'EDD_CLEARED' | 'EDD_REJECTED' | 'EDD_EXPIRED' | 'EDD_LATE_DOCS' | 'SAR_FILED' | 'SEIZED' | 'SAR_REJECTED';

/** What the desk recorded about a case: its state, and what it has cost or earned. */
export interface CaseRecord {
  state: CaseState;
  path: AmlPath;
  /** The bank's minute (counted from day 1, 00:00) each step was taken. */
  decidedAt: number;
  /** A regulatory fine for laundered money the audit later found (cents), and the compliance points lost. */
  fineCents: number;
  points: number;
  /** A customer's complaint at the branch, raised by a freeze. */
  escalation: 'NONE' | 'PENDING' | 'KEPT' | 'RELEASED';
  /** EDD: when the 24-hour SLA runs out, and when the proof arrives (the bank's minutes from day 1, 00:00). */
  eddDue: number | null;
  eddUploadAt: number | null;
  /** On the blacklist and escalated to the Financial Intelligence Unit (a SAR). */
  blacklisted: boolean;
  /** Times the customer was told why the account is locked after a SAR: tipping-off. */
  tipOffs: number;
  /** A SAR: when the FIU's answer comes back (the bank's minutes from day 1, 00:00), until it has. */
  fiuDue: number | null;
  /** The points the FIU's seizure grants this SAR (15; 10 for a SAR on a customer who never sent proof). */
  fiuReward?: number;
  /** Customer friction this case caused beyond a branch escalation (a false SAR on valid documents). */
  friction?: number;
}

/** A journal the desk posts (Command): what it does, and its double-entry lines. */
export interface LedgerCommand {
  readonly kind: 'RELEASE' | 'FREEZE' | 'HOLD_EDD' | 'RELEASE_HELD' | 'RETURN_HELD' | 'FREEZE_HELD' | 'RELEASE_FROZEN' | 'UNFREEZE' | 'FINE' | 'SEIZE' | 'MEMO';
  readonly statusCode: string;
  readonly lines: readonly LedgerLine[];
}

const line = (gl: LedgerLine['gl'], dr: number, cr: number): LedgerLine => ({ gl, dr, cr });
/** The ledger commands, by what they do: release out to the beneficiary, freeze, hold for EDD, and settle a hold. */
export const LEDGER_COMMANDS = {
  /** Release: the payment goes out (Dr CASA, Cr interbank settlement). */
  release: (a: number): LedgerCommand => ({ kind: 'RELEASE', statusCode: 'AML_CLEARED', lines: [line('CASA', a, 0), line('INTERBANK_SETTLEMENT', 0, a)] }),
  /** Freeze: the funds leave the customer's reach for the frozen-funds account (Dr CASA, Cr frozen assets 2930). */
  freeze: (a: number, statusCode = 'AML_FROZEN'): LedgerCommand => ({ kind: 'FREEZE', statusCode, lines: [line('CASA', a, 0), line('FROZEN_ASSETS', 0, a)] }),
  /** Hold for EDD: parked in the clearing suspense account until the proof is judged (Dr CASA, Cr clearing suspense 2912). */
  holdEdd: (a: number): LedgerCommand => ({ kind: 'HOLD_EDD', statusCode: 'PENDING_EDD', lines: [line('CASA', a, 0), line('CLEARING_SUSPENSE', 0, a)] }),
  /** EDD cleared: the hold is lifted and the money is back in the customer's account, free to use (Dr clearing suspense 2912, Cr 2011 CASA). */
  releaseHeld: (a: number): LedgerCommand => ({ kind: 'RELEASE_HELD', statusCode: 'EDD_CLEARED', lines: [line('CLEARING_SUSPENSE', a, 0), line('CASA', 0, a)] }),
  /** EDD refused or out of time: the payment is refused and the money back in the account. */
  returnHeld: (a: number, statusCode: string): LedgerCommand => ({ kind: 'RETURN_HELD', statusCode, lines: [line('CLEARING_SUSPENSE', a, 0), line('CASA', 0, a)] }),
  /** A SAR on a held EDD payment: it moves from the EDD hold to frozen assets, silently (Dr clearing suspense 2912, Cr frozen assets 2930). */
  freezeHeld: (a: number, statusCode = 'SAR_FILED_FIU'): LedgerCommand => ({ kind: 'FREEZE_HELD', statusCode, lines: [line('CLEARING_SUSPENSE', a, 0), line('FROZEN_ASSETS', 0, a)] }),
  /** A step that moves no money, logged to the audit trail (the EDD SLA running out: the hold simply continues). */
  memo: (statusCode: string): LedgerCommand => ({ kind: 'MEMO', statusCode, lines: [] }),
  /** A regulator's fine, paid at once: Dr 5510 regulatory penalty expense, Cr 1510 interbank settlement. */
  fine: (a: number, statusCode = 'AML_AUDIT_FINE'): LedgerCommand => ({ kind: 'FINE', statusCode, lines: [line('REGULATORY_PENALTY_EXPENSE', a, 0), line('INTERBANK_SETTLEMENT', 0, a)] }),
  /** The FIU's directive on a valid SAR: the frozen money is seized for the state (Dr frozen assets 2930, Cr 2110 government asset recovery). */
  seize: (a: number): LedgerCommand => ({ kind: 'SEIZE', statusCode: 'FIU_SEIZED', lines: [line('FROZEN_ASSETS', a, 0), line('GOV_ASSET_RECOVERY', 0, a)] }),
  /** The FIU rejected the SAR: the silently frozen money goes back to the customer (Dr frozen assets 2930, Cr 2011 CASA). */
  unfreeze: (a: number): LedgerCommand => ({ kind: 'UNFREEZE', statusCode: 'FIU_SAR_REJECTED', lines: [line('FROZEN_ASSETS', a, 0), line('CASA', 0, a)] }),
  /** Emergency release of frozen funds: they go out after all. */
  releaseFrozen: (a: number): LedgerCommand => ({ kind: 'RELEASE_FROZEN', statusCode: 'AML_TEMP_RELEASE', lines: [line('FROZEN_ASSETS', a, 0), line('INTERBANK_SETTLEMENT', 0, a)] }),
} as const;

/** The fine when laundered money is let through (the audit finds every one: the fourth quadrant of the freeze/release matrix), and the points it costs. */
export const LEAK = { fineCents: 5_000_000, points: 10, audited: 1, obvious: 1 } as const;
export const OBVIOUS_TYPOLOGIES: readonly AmlTypology[] = ['MONEY_MULE', 'STRUCTURING'];
/** How likely the audit is to find laundered money released on case `c`. */
export const auditRate = (c: Pick<ReviewCase, 'typology'>): number => (OBVIOUS_TYPOLOGIES.includes(c.typology) ? LEAK.obvious : LEAK.audited);
/** The other two penalty tiers (Dr 5510 / Cr 1510): a legitimate customer's account frozen (at once), or reported to the FIU (when the FIU rejects the SAR). */
export const WRONG_FREEZE = { fineCents: 2_000_000, points: 15 } as const;
export const WRONG_SAR = { fineCents: 3_000_000, points: 20 } as const;
/** The rewards, both from the FIU's directive on a valid SAR: the SAR confirmed, and the money seized (granted together, never at filing). */
export const REWARD = { validSar: 0, seizure: 15 } as const;
/** When the FIU answers a SAR: 1 to 2 bank days after filing (the same case, the same day on every replay). */
export const fiuDueAt = (c: Pick<ReviewCase, 'id'>, filedAt: number): number => filedAt + 1440 + Math.floor(roll(c.id, 'fiu') * 1440);
/** A SAR's reference for the FIU's notice ("SAR-8801"), the same for a case on every replay. */
export const sarRef = (c: Pick<ReviewCase, 'id'>): string => `SAR-${1000 + Math.floor(roll(c.id, 'sar') * 9000)}`;

/** The 24-hour SLA a customer has to send their proof of funds for EDD (the bank's minutes). */
export const EDD_SLA_MIN = 24 * 60;
/** How long after a freeze the customer turns up at the branch (real seconds). */
export const ESCALATION_DELAY_S = 10;

/** What the desk is told at once about a step (the feedback toast): a penalty tier, a reward, or a follow-up. */
export type AmlFeedback = 'LEAK' | 'WRONG_FREEZE' | 'SAR_SUBMITTED' | 'FIU_SEIZED' | 'FIU_REJECTED' | 'EDD_APPROVED' | 'EDD_REFUSED' | 'EDD_EXPIRED' | 'EDD_LATE_DOCS' | 'EDD_FALSE_SAR' | 'EDD_UNLOCK_BREACH';

/** The freeze/release matrix: what a hold or a release turned out to be on the truth. */
export type FreezeQuadrant = 'VALID_FREEZE' | 'WRONG_FREEZE' | 'VALID_RELEASE' | 'LEAK';
export const FREEZE_QUADRANTS: readonly FreezeQuadrant[] = ['VALID_FREEZE', 'WRONG_FREEZE', 'VALID_RELEASE', 'LEAK'];
/** Which quadrant a settled case is in: held (frozen, at the branch, seized) or released (closed, released at the branch, EDD cleared), on laundering or not. A SAR waits for the FIU. */
export function quadrantOf(c: Pick<ReviewCase, 'laundering'>, r: CaseRecord | undefined): FreezeQuadrant | null {
  if (!r) return null;
  if (r.state === 'FROZEN' || r.state === 'ESCALATED' || r.state === 'SEIZED') return c.laundering ? 'VALID_FREEZE' : 'WRONG_FREEZE';
  if (r.state === 'RELEASED' || r.state === 'TEMP_RELEASED' || r.state === 'EDD_CLEARED') return c.laundering ? 'LEAK' : 'VALID_RELEASE';
  return null;
}

/** What a decision did: the case's record, the journals it posts, and whether it raises a branch escalation. */
export interface Outcome {
  /** The toast it raises, if any. */
  feedback?: AmlFeedback;
  record: CaseRecord;
  commands: LedgerCommand[];
  /** A false negative the audit found (a fine). */
  leak: boolean;
  /** The customer will turn up at the branch, ESCALATION_DELAY_S from now. */
  escalates: boolean;
}

/** Laundered money let through (closed as a false positive, released at the branch, or cleared on a forged proof): the audit finds it at auditRate (the same case, the same answer on every replay). */
const leaked = (c: ReviewCase, step: string): boolean => c.laundering && roll(c.id, step, 'audit') < auditRate(c);

const fresh = (path: AmlPath, now: number): CaseRecord => ({ state: 'OPEN', path, decidedAt: now, fineCents: 0, points: 0, escalation: 'NONE', eddDue: null, eddUploadAt: null, blacklisted: false, tipOffs: 0, fiuDue: null });
const fined = (r: CaseRecord, tier: { fineCents: number; points: number } = LEAK): CaseRecord => ({ ...r, fineCents: r.fineCents + tier.fineCents, points: r.points - tier.points });

/** One decision path (Strategy). */
export interface DecisionStrategy {
  readonly path: AmlPath;
  apply(c: ReviewCase, now: number): Outcome;
}

export const DECISIONS: Readonly<Record<AmlPath, DecisionStrategy>> = {
  /** Close as a false positive: the money goes out now. Laundered money let through is found by the audit (auditRate): a $50,000 fine and 10 points. */
  FALSE_POSITIVE: {
    path: 'FALSE_POSITIVE',
    apply(c, now) {
      const leak = leaked(c, 'fp');
      const record = { ...fresh('FALSE_POSITIVE', now), state: 'RELEASED' as const };
      return { record: leak ? fined(record) : record, commands: [LEDGER_COMMANDS.release(c.amountCents), ...(leak ? [LEDGER_COMMANDS.fine(LEAK.fineCents)] : [])], leak, escalates: false, ...(leak ? { feedback: 'LEAK' as const } : {}) };
    },
  },
  /** Freeze the account: the funds into frozen assets, and the customer at the branch within moments. A legitimate customer's freeze is fined at once: $20,000 and 15 points. */
  FREEZE: {
    path: 'FREEZE',
    apply(c, now) {
      // A correct freeze on real laundering: held in 2930, no customer at the branch and no complaint.
      if (c.laundering) return { record: { ...fresh('FREEZE', now), state: 'FROZEN' }, commands: [LEDGER_COMMANDS.freeze(c.amountCents)], leak: false, escalates: false };
      const record: CaseRecord = { ...fresh('FREEZE', now), state: 'ESCALATED', escalation: 'PENDING' };
      return { record: fined(record, WRONG_FREEZE), commands: [LEDGER_COMMANDS.freeze(c.amountCents), LEDGER_COMMANDS.fine(WRONG_FREEZE.fineCents, 'AML_WRONG_FREEZE_FINE')], leak: false, escalates: true, feedback: 'WRONG_FREEZE' };
    },
  },
  /** Ask for enhanced due diligence: the payment held while the customer has 24 hours to prove where the money came from. */
  REQUEST_EDD: {
    path: 'REQUEST_EDD',
    apply(c, now) {
      return { record: { ...fresh('REQUEST_EDD', now), state: 'PENDING_EDD', eddDue: now + EDD_SLA_MIN, eddUploadAt: c.edd.uploadAfterMin === null ? null : now + c.edd.uploadAfterMin }, commands: [LEDGER_COMMANDS.holdEdd(c.amountCents)], leak: false, escalates: false };
    },
  },
  /** File a SAR with the MLRO: a silent freeze, the subject blacklisted, the case sent to the FIU. The customer must not be told.
   *  Nothing is granted or charged at filing: the FIU answers 1 to 2 days later (fiuDirective). */
  FILE_SAR: {
    path: 'FILE_SAR',
    apply(c, now) {
      const record: CaseRecord = { ...fresh('FILE_SAR', now), state: 'SAR_FILED', blacklisted: true, fiuDue: fiuDueAt(c, now) };
      return { record, commands: [LEDGER_COMMANDS.freeze(c.amountCents, 'SAR_FILED_FIU')], leak: false, escalates: false, feedback: 'SAR_SUBMITTED' };
    },
  },
};

/** The branch escalation answered: keep the account frozen, or release the money on the spot (laundered money let through may be found later). */
export function resolveEscalation(c: ReviewCase, r: CaseRecord, keep: boolean): Outcome {
  if (r.escalation !== 'PENDING') return { record: r, commands: [], leak: false, escalates: false };
  if (keep) return { record: { ...r, state: 'FROZEN', escalation: 'KEPT' }, commands: [], leak: false, escalates: false };
  const leak = leaked(c, 'temp');
  const record: CaseRecord = { ...r, state: 'TEMP_RELEASED', escalation: 'RELEASED' };
  return { record: leak ? fined(record) : record, commands: [LEDGER_COMMANDS.releaseFrozen(c.amountCents), ...(leak ? [LEDGER_COMMANDS.fine(LEAK.fineCents)] : [])], leak, escalates: false, ...(leak ? { feedback: 'LEAK' as const } : {}) };
}

/** Whether the customer's proof of funds has arrived by `now`, within the SLA. */
export const eddUploaded = (r: CaseRecord, now: number): boolean => r.state === 'PENDING_EDD' && r.eddUploadAt !== null && r.eddUploadAt <= now && (r.eddDue === null || r.eddUploadAt <= r.eddDue);

// The EDD timeline: on time, late, or stalling, and what each can lead to

/** Where an EDD case stands on its timeline: waiting within the SLA, proof in on time, proof in late, or overdue with none (stalling). */
export type EddTimeline = 'WAITING' | 'ON_TIME' | 'LATE' | 'STALLING';
export function eddTimeline(r: CaseRecord | undefined, now: number): EddTimeline | null {
  if (!r) return null;
  if (r.state === 'PENDING_EDD') return eddUploaded(r, now) ? 'ON_TIME' : 'WAITING';
  if (r.state === 'EDD_LATE_DOCS') return 'LATE';
  if (r.state === 'EDD_EXPIRED') return 'STALLING';
  return null;
}

/** What the desk can do at each point of the timeline. */
export type EddAction = 'RELEASE' | 'SAR' | 'REFUSE' | 'UNLOCK';
export const EDD_ACTIONS_AT: Readonly<Record<EddTimeline, readonly EddAction[]>> = {
  WAITING: [],
  ON_TIME: ['RELEASE', 'SAR', 'REFUSE'],
  LATE: ['RELEASE', 'SAR', 'REFUSE'],
  STALLING: ['SAR', 'UNLOCK'],
};

/** The EDD matrix's numbers: a valid release earns +5; a SAR on valid documents is a false filing ($30,000, −15, friction); a SAR on a
 *  customer who never sent proof earns +10 at the FIU's seizure (+15 when forged proof was sent); releasing without any proof is the
 *  worst breach ($50,000, −20). */
export const EDD_MATRIX = {
  validReleasePoints: 5,
  falseSar: { fineCents: 3_000_000, points: 15 },
  stallSarReward: 10,
  forgedSarReward: 15,
  unlockNoDocs: { fineCents: 5_000_000, points: 20 },
} as const;

const none = (r: CaseRecord): Outcome => ({ record: r, commands: [], leak: false, escalates: false });

/** One EDD decision (Strategy): what it does to the case and the books, given the truth behind the documents. */
type EddStrategy = (c: ReviewCase, r: CaseRecord, now: number, t: EddTimeline) => Outcome;
const EDD_STRATEGIES: Readonly<Record<EddAction, EddStrategy>> = {
  /** Release on the documents: the hold lifted back to CASA. Valid: +5. Forged: the audit's leak, $50,000 and −10. */
  RELEASE: (c, r) => {
    const record: CaseRecord = { ...r, state: 'EDD_CLEARED' };
    const release = LEDGER_COMMANDS.releaseHeld(c.amountCents);
    if (c.laundering) return { record: fined(record), commands: [release, LEDGER_COMMANDS.fine(LEAK.fineCents)], leak: true, escalates: false, feedback: 'LEAK' };
    return { record: { ...record, points: r.points + EDD_MATRIX.validReleasePoints }, commands: [release], leak: false, escalates: false, feedback: 'EDD_APPROVED' };
  },
  /** Report a SAR. On forged documents (or none): a silent freeze, 2912 → 2930, and the FIU's answer 1–2 days later.
   *  On valid documents: a false filing judged at once, $30,000, −15 and customer friction, and the hold returned. */
  SAR: (c, r, now, t) => {
    if (t !== 'STALLING' && !c.laundering) {
      return {
        record: fined({ ...r, state: 'SAR_REJECTED', friction: (r.friction ?? 0) + 1 }, EDD_MATRIX.falseSar),
        commands: [LEDGER_COMMANDS.returnHeld(c.amountCents, 'EDD_SAR_FALSE_FILING'), LEDGER_COMMANDS.fine(EDD_MATRIX.falseSar.fineCents, 'AML_WRONG_SAR_FINE')],
        leak: false,
        escalates: false,
        feedback: 'EDD_FALSE_SAR',
      };
    }
    const reward = t === 'STALLING' ? EDD_MATRIX.stallSarReward : EDD_MATRIX.forgedSarReward;
    return { record: { ...r, state: 'SAR_FILED', blacklisted: true, fiuDue: fiuDueAt(c, now), fiuReward: reward }, commands: [LEDGER_COMMANDS.freezeHeld(c.amountCents)], leak: false, escalates: false, feedback: 'SAR_SUBMITTED' };
  },
  /** Refuse on the documents: the payment is not made and the hold is returned. */
  REFUSE: (c, r) => ({ record: { ...r, state: 'EDD_REJECTED' }, commands: [LEDGER_COMMANDS.returnHeld(c.amountCents, 'EDD_REJECTED')], leak: false, escalates: false, feedback: 'EDD_REFUSED' }),
  /** Unlock with no documents at all: an extreme audit breach whatever the truth, $50,000 and −20. */
  UNLOCK: (c, r) => ({
    record: fined({ ...r, state: 'EDD_CLEARED' }, EDD_MATRIX.unlockNoDocs),
    commands: [LEDGER_COMMANDS.releaseHeld(c.amountCents), LEDGER_COMMANDS.fine(EDD_MATRIX.unlockNoDocs.fineCents, 'AML_UNLOCK_NO_DOCS_FINE')],
    leak: c.laundering,
    escalates: false,
    feedback: 'EDD_UNLOCK_BREACH',
  }),
};

/** Takes an EDD decision, if the case's timeline allows it now. */
export function eddDecision(c: ReviewCase, r: CaseRecord, action: EddAction, now: number): Outcome {
  const t = eddTimeline(r, now);
  if (!t || !EDD_ACTIONS_AT[t].includes(action)) return none(r);
  return EDD_STRATEGIES[action](c, r, now, t);
}

/** The proof judged: approve (released to CASA) or reject (refused, the hold returned). */
export const reviewEdd = (c: ReviewCase, r: CaseRecord, approve: boolean, now: number): Outcome => eddDecision(c, r, approve ? 'RELEASE' : 'REFUSE', now);

/** The SLA run out with no proof (counted on the bank's clock, across the night): the case goes overdue and the hold simply continues, silently. */
export function expireEdd(_c: ReviewCase, r: CaseRecord, now: number): Outcome {
  if (r.state !== 'PENDING_EDD' || r.eddDue === null || now < r.eddDue || eddUploaded(r, r.eddDue)) return none(r);
  return { record: { ...r, state: 'EDD_EXPIRED' }, commands: [LEDGER_COMMANDS.memo('EDD_SLA_EXPIRED')], leak: false, escalates: false, feedback: 'EDD_EXPIRED' };
}

/** Proof that arrives after the SLA: the overdue case now has late documents to judge. */
export function lateDocs(_c: ReviewCase, r: CaseRecord, now: number): Outcome {
  if (r.state !== 'EDD_EXPIRED' || r.eddUploadAt === null || now < r.eddUploadAt) return none(r);
  return { record: { ...r, state: 'EDD_LATE_DOCS' }, commands: [], leak: false, escalates: false, feedback: 'EDD_LATE_DOCS' };
}

/** The FIU's answer to a SAR, once it is due. A valid SAR (real laundering): the money seized to 2110 and +15 points.
 *  A false filing (a legitimate customer): the FIU rejects it, the frozen money goes back to the customer, and a $30,000 fine and −20 points. */
export function fiuDirective(c: ReviewCase, r: CaseRecord, now: number): Outcome {
  if (r.state !== 'SAR_FILED' || r.fiuDue === null || now < r.fiuDue) return { record: r, commands: [], leak: false, escalates: false };
  if (c.laundering) return { record: { ...r, state: 'SEIZED', fiuDue: null, points: r.points + (r.fiuReward ?? REWARD.validSar + REWARD.seizure) }, commands: [LEDGER_COMMANDS.seize(c.amountCents)], leak: false, escalates: false, feedback: 'FIU_SEIZED' };
  return {
    record: fined({ ...r, state: 'SAR_REJECTED', fiuDue: null, blacklisted: false }, WRONG_SAR),
    commands: [LEDGER_COMMANDS.unfreeze(c.amountCents), LEDGER_COMMANDS.fine(WRONG_SAR.fineCents, 'AML_WRONG_SAR_FINE')],
    leak: false,
    escalates: false,
    feedback: 'FIU_REJECTED',
  };
}

// The desk's discipline: what each outcome means for the reward and penalty engines

/** The penalised outcomes: each is an error for the discipline. */
export const ERROR_FEEDBACK: readonly AmlFeedback[] = ['LEAK', 'WRONG_FREEZE', 'FIU_REJECTED', 'EDD_FALSE_SAR', 'EDD_UNLOCK_BREACH'];
/** Where an outcome came from: a path taken, a branch escalation answered, an EDD decision, or a follow-up on the bank's clock. */
export type DeskStep = { kind: 'PATH'; path: AmlPath } | { kind: 'ESCALATION' } | { kind: 'EDD'; action: EddAction } | { kind: 'FOLLOW_UP' };

/** What an outcome means once its truth is out: an error (any penalty), a true positive (a correct hold on real laundering: a freeze,
 *  a refused forged proof, the FIU's seizure after a SAR), a correct case (a legitimate customer released), or nothing yet (a SAR
 *  or an EDD request waiting for its answer). Judged when the outcome reveals the truth, never before. */
export function outcomeEvent(c: Pick<ReviewCase, 'laundering' | 'amountCents'>, out: Outcome, step: DeskStep): DisciplineEvent | null {
  if (out.feedback && ERROR_FEEDBACK.includes(out.feedback)) return { kind: 'ERROR' };
  const amountCents = c.amountCents;
  if (out.feedback === 'FIU_SEIZED') return { kind: 'TRUE_POSITIVE', amountCents };
  switch (step.kind) {
    case 'PATH':
      if (step.path === 'FREEZE' && c.laundering) return { kind: 'TRUE_POSITIVE', amountCents };
      if (step.path === 'FALSE_POSITIVE' && !c.laundering) return { kind: 'CORRECT', amountCents };
      return null;
    case 'EDD':
      if (step.action === 'REFUSE' && c.laundering) return { kind: 'TRUE_POSITIVE', amountCents };
      if (step.action === 'RELEASE' && !c.laundering) return { kind: 'CORRECT', amountCents };
      return null;
    default:
      return null;
  }
}

/** An outcome as the discipline shapes it: while debuffed, a penalty is doubled (the fine on the record and in its journal, and
 *  the points lost) and no points are granted. `prev` is the case's record before the step. */
export function disciplinedOutcome(prev: CaseRecord | undefined, out: Outcome, debuffed: boolean): Outcome {
  if (!debuffed) return out;
  const fine0 = prev?.fineCents ?? 0;
  const points0 = prev?.points ?? 0;
  const dFine = out.record.fineCents - fine0;
  const dPoints = out.record.points - points0;
  // No reward while debuffed.
  if (dPoints >= 0) return dPoints > 0 ? { ...out, record: { ...out.record, points: points0 } } : out;
  const p = calculatePenalty(dFine, dPoints, true);
  return {
    ...out,
    record: { ...out.record, fineCents: fine0 + p.fineCents, points: points0 - p.points },
    commands: out.commands.map((cmd) => (cmd.kind === 'FINE' ? LEDGER_COMMANDS.fine(p.fineCents, cmd.statusCode) : cmd)),
  };
}

// The desk's badges, filters and history

/** The badge a case shows, from where it truly stands now: open, awaiting documents, documents in (on time or late), overdue with none,
 *  frozen, at the branch, sent to the FIU, seized, refused, or resolved. Each is a message key `state_<badge>`. */
export type DeskBadge = 'OPEN' | 'ESCALATED' | 'FROZEN' | 'PENDING_EDD' | 'EDD_DOCS' | 'EDD_LATE_DOCS' | 'EDD_EXPIRED' | 'SAR_FILED' | 'SEIZED' | 'EDD_REJECTED' | 'SAR_REJECTED' | 'DONE';
export function badgeOfState(state: CaseState, docsIn = false): DeskBadge {
  switch (state) {
    case 'PENDING_EDD':
      return docsIn ? 'EDD_DOCS' : 'PENDING_EDD';
    case 'RELEASED':
    case 'TEMP_RELEASED':
    case 'EDD_CLEARED':
      return 'DONE';
    default:
      return state;
  }
}
export const deskBadge = (r: CaseRecord | undefined, now: number): DeskBadge => (r ? badgeOfState(r.state, eddUploaded(r, now)) : 'OPEN');

/** The desk's list filters: what needs action (the default), documents in, awaiting documents, overdue, sent to the FIU, and the history. */
export type DeskFilter = 'ACTION' | 'DOCS' | 'WAITING' | 'OVERDUE' | 'SAR' | 'HISTORY';
export const DESK_FILTERS: readonly DeskFilter[] = ['ACTION', 'DOCS', 'WAITING', 'OVERDUE', 'SAR', 'HISTORY'];
const FILTER_BADGES: Readonly<Record<DeskFilter, readonly DeskBadge[]>> = {
  ACTION: ['OPEN', 'ESCALATED', 'PENDING_EDD', 'EDD_DOCS', 'EDD_LATE_DOCS', 'EDD_EXPIRED'],
  DOCS: ['EDD_DOCS', 'EDD_LATE_DOCS'],
  WAITING: ['PENDING_EDD'],
  OVERDUE: ['EDD_EXPIRED', 'EDD_LATE_DOCS'],
  SAR: ['SAR_FILED'],
  HISTORY: ['DONE', 'SEIZED', 'FROZEN', 'EDD_REJECTED', 'SAR_REJECTED'],
};
export const inDeskFilter = (f: DeskFilter, r: CaseRecord | undefined, now: number): boolean => FILTER_BADGES[f].includes(deskBadge(r, now));
/** A case with nothing left to do: it belongs to the history. */
export const isResolved = (r: CaseRecord | undefined): r is CaseRecord => r !== undefined && FILTER_BADGES.HISTORY.includes(badgeOfState(r.state));

/** The resolved history kept in memory, and one page of it. */
export const HISTORY_CAP = 200;
export const HISTORY_PAGE = 10;
/** The resolved cases over the cap, oldest first: what to prune. Unresolved work is never pruned. */
export function overHistoryCap(reviews: Readonly<Record<string, CaseRecord>>, cap: number = HISTORY_CAP): string[] {
  const done = Object.entries(reviews).filter(([, r]) => isResolved(r));
  if (done.length <= cap) return [];
  return done
    .sort(([a, ra], [b, rb]) => ra.decidedAt - rb.decidedAt || a.localeCompare(b))
    .slice(0, done.length - cap)
    .map(([id]) => id);
}

/** Whether a case stays on the desk across the night: not yet decided, or still holding, frozen, reported or blacklisted. */
export const carriesOver = (r: CaseRecord | undefined): boolean => !r || ['PENDING_EDD', 'ESCALATED', 'FROZEN', 'EDD_EXPIRED', 'EDD_LATE_DOCS', 'SAR_FILED', 'SEIZED'].includes(r.state);

/** Telling the customer why the account is locked after a SAR: tipping-off, a criminal offence. */
export const tipOff = (r: CaseRecord): CaseRecord => ({ ...r, tipOffs: r.tipOffs + 1 });

/** Whether a case's money ended up held from a legitimate customer (the desk was too hard on them). */
const heldFromLegit = (c: ReviewCase, r: CaseRecord): boolean => !c.laundering && (r.state === 'FROZEN' || r.state === 'ESCALATED' || r.state === 'SAR_FILED' || r.state === 'SAR_REJECTED' || r.state === 'EDD_REJECTED' || r.state === 'EDD_EXPIRED' || r.state === 'EDD_LATE_DOCS');

// The after-action review

export type ComplianceGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface AmlScorecard {
  decided: number;
  /** Legitimate customers whose money the desk froze, reported or refused, as a share of the legitimate customers decided (%). */
  falsePositiveRate: number;
  /** Branch escalations the desk's freezes caused. */
  frictionIndex: number;
  /** Every fine the desk caused: laundered money let through, a legitimate customer frozen or reported (cents). */
  penaltiesCents: number;
  tipOffs: number;
  /** 0-10,000 (SCORE_MAX), every point at face value: the baseline (SCORE_BASE, 8,500), plus the case points (+15 a seizure, +5 a valid
   *  release) and the KPI points (+1 or +2 a correct case), minus the penalty points (−10, −15, −20...; doubled while debuffed), the
   *  over-freezing, the complaints and any tipping-off. */
  score: number;
  /** The score as a share of SCORE_MAX (%), one decimal. */
  pct: number;
  grade: ComplianceGrade;
  /** The next grade up, the score it needs, how many points short, and how far through the current band (0-1). Null at A+, or while the grade is capped. */
  next: { grade: ComplianceGrade; at: number; short: number; progress: number } | null;
  /** The grade is held at D (a tipping-off, or the desk is debuffed). */
  capped: boolean;
  debuffed: boolean;
  /** Correct cases, and the bonus they earned (cents). */
  totalCorrect: number;
  bonusCents: number;
}

/** The desk's discipline, as the scorecard reads it (penaltyEngine.ts). */
export interface ScorecardDiscipline {
  debuffed: boolean;
  kpiPoints: number;
  totalCorrect: number;
  bonusCents: number;
}
export const NO_DISCIPLINE: ScorecardDiscipline = { debuffed: false, kpiPoints: 0, totalCorrect: 0, bonusCents: 0 };

/** Grades from the score: A+ (Compliance Master) to F (Bank License Suspended). Tipping-off is a crime: one caps the grade at D. */
export const GRADE_BANDS: ReadonlyArray<readonly [number, ComplianceGrade]> = [
  [95, 'A+'],
  [88, 'A'],
  [78, 'B'],
  [65, 'C'],
  [50, 'D'],
  [-Infinity, 'F'],
];

/** The scale of the score: grades are read from its percentage. Every point counts at face value: no hidden multiplier. */
export const SCORE_MAX = 10_000;
/** Where the score starts: 8,500 (85%, a B), so correct work lifts the grade and every penalty pulls it down. */
export const SCORE_BASE = 8_500;
/** What the over-freezing, a complaint and a tipping-off cost, in points (face value): per percentage point of false positives, per complaint, per tipping-off. */
export const SCORE_COST = { falsePositivePct: 1, complaint: 3, tipOff: 40 } as const;

export function amlScorecard(cases: readonly ReviewCase[], records: Readonly<Record<string, CaseRecord>>, discipline: ScorecardDiscipline = NO_DISCIPLINE): AmlScorecard {
  const decided = cases.filter((c) => records[c.id]);
  const legit = decided.filter((c) => !c.laundering);
  const tooHard = legit.filter((c) => heldFromLegit(c, records[c.id]!)).length;
  const falsePositiveRate = legit.length ? Math.round((1000 * tooHard) / legit.length) / 10 : 0;
  const frictionIndex = decided.reduce((n, c) => n + (records[c.id]!.escalation !== 'NONE' ? 1 : 0) + (records[c.id]!.friction ?? 0), 0);
  const penaltiesCents = decided.reduce((s, c) => s + records[c.id]!.fineCents, 0);
  const points = decided.reduce((s, c) => s + records[c.id]!.points, 0);
  const tipOffs = decided.reduce((s, c) => s + records[c.id]!.tipOffs, 0);
  const raw = SCORE_BASE + points + discipline.kpiPoints - falsePositiveRate * SCORE_COST.falsePositivePct - frictionIndex * SCORE_COST.complaint - tipOffs * SCORE_COST.tipOff;
  const score = Math.max(0, Math.min(SCORE_MAX, Math.round(raw)));
  const pct = Math.round((1000 * score) / SCORE_MAX) / 10;
  const band = GRADE_BANDS.findIndex(([min]) => pct >= min);
  const capped = (tipOffs > 0 || discipline.debuffed) && band < GRADE_BANDS.findIndex(([, g]) => g === 'D');
  const grade = capped ? 'D' : GRADE_BANDS[band]![1];
  let next: AmlScorecard['next'] = null;
  if (!capped && band > 0 && !(tipOffs > 0 || discipline.debuffed)) {
    const [lo] = GRADE_BANDS[band]!;
    const [hi, up] = GRADE_BANDS[band - 1]!;
    const at = Math.round((hi * SCORE_MAX) / 100);
    const floor = Number.isFinite(lo) ? (lo * SCORE_MAX) / 100 : 0;
    next = { grade: up, at, short: Math.max(0, at - score), progress: Math.max(0, Math.min(1, (score - floor) / Math.max(1, at - floor))) };
  }
  return { decided: decided.length, falsePositiveRate, frictionIndex, penaltiesCents, tipOffs, score, pct, grade, next, capped: grade === 'D' && (tipOffs > 0 || discipline.debuffed), debuffed: discipline.debuffed, totalCorrect: discipline.totalCorrect, bonusCents: discipline.bonusCents };
}
