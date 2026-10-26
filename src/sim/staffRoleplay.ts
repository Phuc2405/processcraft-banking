/**
 * Phase 8 Step 2: the Staff Roleplay Workspace engine.
 *
 * The learner sits at one of seven review desks and decides the payment at the head of the desk's queue. The bank's own
 * verdict (the checkpoint the interceptor already wrote on the stop, sim/amlEngine.ts) is the answer key, and every field the
 * learner sees is either read from that checkpoint or derived from the packet so it agrees with the SOP thresholds below.
 *
 * Pure and English-only (codes, numbers, scenario ids): screens translate at display.
 */

import { AML_POLICY, CTR_THRESHOLD_CENTS, DISPUTE_SLA_DAYS, EKYC_POLICY, FDS_POLICY } from './amlEngine';
import type { StationId } from './topology';
import type { Checkpoint, DeclineReason, ExtendedContext, Packet, Stop } from './types';

export type StaffRoleId = 'aml' | 'dispute' | 'bnpl' | 'cashier' | 'ekyc' | 'fds' | 'swift';
export type StaffDecision = 'APPROVE' | 'REJECT';

export const STAFF_ROLES: readonly StaffRoleId[] = ['aml', 'dispute', 'bnpl', 'cashier', 'ekyc', 'fds', 'swift'];

export const ROLE_STATION: Readonly<Record<StaffRoleId, StationId>> = {
  aml: 'AML_DESK',
  dispute: 'DISPUTE_DESK',
  bnpl: 'BNPL',
  cashier: 'TELLER_CASH',
  ekyc: 'GATE_EKYC',
  fds: 'SEC_FDS',
  swift: 'GATE_SWIFT',
};

export const ROLE_ICON: Readonly<Record<StaffRoleId, string>> = { aml: '🛡️', dispute: '⚖️', bnpl: '💳', cashier: '🏧', ekyc: '🆔', fds: '🔍', swift: '🌐' };

const STATION_ROLE = Object.fromEntries(STAFF_ROLES.map((r) => [ROLE_STATION[r], r])) as Partial<Record<StationId, StaffRoleId>>;

export const roleForStation = (id: StationId): StaffRoleId | null => STATION_ROLE[id] ?? null;

/** A review is due within this many real seconds of reaching the head of the queue. */
export const STAFF_SLA_SECONDS = 30;
/** XP for a decision that matches the SOP. */
export const STAFF_XP_PER_CORRECT = 100;

/** In-shift combo: consecutive correct decisions needed for each multiplier tier. */
export const COMBO_TIERS = { hot: 3, zone: 5 } as const;
export type ComboTier = 'none' | 'hot' | 'zone';

/** The tier a streak of `combo` consecutive correct decisions sits in. */
export const comboTier = (combo: number): ComboTier => (combo >= COMBO_TIERS.zone ? 'zone' : combo >= COMBO_TIERS.hot ? 'hot' : 'none');

/** XP multiplier for a streak: 1.0x (0–2), 1.5x (3–4), 2.0x (5+). */
export const comboMultiplier = (combo: number): number => ({ none: 1, hot: 1.5, zone: 2 })[comboTier(combo)];

/** XP for one correct decision that brings the streak to `combo`. */
export const comboXp = (combo: number): number => Math.round(STAFF_XP_PER_CORRECT * comboMultiplier(combo));

/** True when this streak just entered a higher tier (3 or 5). */
export const comboTierUp = (combo: number): boolean => combo === COMBO_TIERS.hot || combo === COMBO_TIERS.zone;
/** The shift objective: this many reviews, at or above this accuracy. */
export const SHIFT_TARGET = { reviews: 10, accuracyPct: 90 } as const;
/** Opening balance of the AUD nostro the SWIFT desk pays out of. */
export const NOSTRO_OPENING_CENTS = 50_000_000;
/** SOP numbers the desks below decide by, beside the interceptor's own policies. */
export const STAFF_SOP = {
  amlVelocityBlockAt: 8,
  bnplDtiMaxPct: 40,
  bnplMaxMissed: 1,
} as const;

/** One value on the payload card. `flag` marks a value that breaches the SOP. */
export type StaffFieldValue =
  | { t: 'pct'; v: number }
  | { t: 'num'; v: number }
  | { t: 'money'; cents: number }
  | { t: 'bool'; v: boolean }
  | { t: 'code'; v: string }
  /** A message key in analystWorkspace.messages.ts (`val_<key>`). */
  | { t: 'msg'; key: string };

export interface StaffField {
  /** `field_<key>` in analystWorkspace.messages.ts. */
  key: string;
  value: StaffFieldValue;
  flag?: boolean;
}

export const STAFF_SCENES = [
  'aml_OFAC',
  'aml_PEP',
  'aml_STRUCTURING',
  'aml_LARGE_CROSS_BORDER',
  'aml_NONE',
  'dispute_CHARGEBACK',
  'dispute_PACS004_RETURN',
  'dispute_ATM_MISMATCH',
  'bnpl_apply',
  'cashier_IN',
  'cashier_OUT',
  'ekyc_onboard',
  'fds_device',
  'swift_remit',
] as const;
export type StaffScene = (typeof STAFF_SCENES)[number];

/** A task of the 28-task matrix: tasks 1-3 are fixed drills, task 4 is a random shift mixing them. */
export type StaffTaskNo = 1 | 2 | 3 | 4;
export type StaffDrillNo = 1 | 2 | 3;
export const STAFF_TASKS: readonly StaffTaskNo[] = [1, 2, 3, 4];
export const STAFF_DRILLS: readonly StaffDrillNo[] = [1, 2, 3];
export const RANDOM_TASK: StaffTaskNo = 4;
export type TaskScene = `task_${StaffRoleId}_${StaffDrillNo}`;
export const TASK_SCENES: readonly TaskScene[] = STAFF_ROLES.flatMap((r) => STAFF_DRILLS.map((n) => `task_${r}_${n}` as TaskScene));

export interface StaffCase {
  id: string;
  station: StationId;
  role: StaffRoleId;
  /** The scenario label in English (localizeScenarioText at display). */
  scenario: string;
  amountCents: number;
  waitedMin: number;
  fields: StaffField[];
  /** The story the card tells (`scene_<scene>_*` in analystWorkspace.messages.ts). It never gives the verdict away. */
  scene: StaffScene | TaskScene;
  /** The drill a task-matrix case belongs to (absent on live-queue cases). */
  drill?: StaffDrillNo;
  /** The desk incident that surged this case into the queue (Incident Mode). */
  incident?: DeskIncidentId;
  /** The bank's verdict for this stop: the answer key. */
  expected: StaffDecision;
}

export interface StaffDecisionResult {
  ok: boolean;
  packetId: string;
  decision: StaffDecision;
  expected: StaffDecision | null;
  correct: boolean;
  /** The status code the decision applies: an approval code, or the decline reason. */
  statusCode: string;
}

/** What the desk knows that is not on the packet. */
export interface StaffDeskContext {
  vaultCents: number;
  nostroCents: number;
  bnplMinScore: number;
}

const APPROVE_CODE: Readonly<Record<StaffRoleId, string>> = {
  aml: 'AML_RELEASED',
  dispute: 'DISPUTE_REFUNDED',
  bnpl: 'BNPL_APPROVED',
  cashier: 'TELLER_COUNTED',
  ekyc: 'EKYC_VERIFIED',
  fds: 'FDS_CLEAR',
  swift: 'PACS008_ACCEPTED',
};

const REJECT_CODE: Readonly<Record<StaffRoleId, DeclineReason>> = {
  aml: 'AML_STR_BLOCKED',
  dispute: 'DISPUTE_REJECTED',
  bnpl: 'DOWN_PAYMENT',
  cashier: 'TELLER_SUSPECT_NOTE',
  ekyc: 'EKYC_LIVENESS_FAILED',
  fds: 'FDS_HIGH_RISK_DEVICE',
  swift: 'SWIFT_INVALID',
};

export function statusCodeFor(role: StaffRoleId, decision: StaffDecision, p: Pick<Packet, 'plan'>): string {
  if (decision === 'APPROVE') return APPROVE_CODE[role];
  return p.plan.decline ?? REJECT_CODE[role];
}

/** A stable 0-1 number per packet and purpose, so derived fields never move between renders. */
function unit(id: string, purpose: string): number {
  let h = 2166136261;
  const s = `${id}|${purpose}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
const between = (id: string, purpose: string, lo: number, hi: number): number => Math.round(lo + unit(id, purpose) * (hi - lo));

type CheckAt<A extends Checkpoint['at']> = Extract<Checkpoint, { at: A }>;
const checkAt = <A extends Checkpoint['at']>(stop: Stop, at: A): CheckAt<A> | null => (stop.check?.at === at ? (stop.check as CheckAt<A>) : null);

/** The payload card for the packet at the head of a desk, or null when this stop is not a review this role makes. */
export function buildStaffCase(role: StaffRoleId, p: Packet, ctx: StaffDeskContext, waitedMin = 0): StaffCase | null {
  const stop = p.plan.stops[p.stopIndex];
  if (!stop || stop.place !== ROLE_STATION[role]) return null;
  const built = fieldsFor(role, p, stop, ctx, p.ext);
  if (!built) return null;
  return { id: p.id, station: ROLE_STATION[role], role, scenario: p.scenario, amountCents: p.amountCents, waitedMin, fields: built.fields, scene: built.scene, expected: built.expected };
}

function fieldsFor(role: StaffRoleId, p: Packet, stop: Stop, ctx: StaffDeskContext, ext: ExtendedContext | undefined): { fields: StaffField[]; expected: StaffDecision; scene: StaffScene } | null {
  const id = p.id;
  switch (role) {
    case 'aml': {
      const c = checkAt(stop, 'AML_REVIEW');
      if (!c) return null;
      const screen = p.plan.stops.find((s) => s.screen)?.screen;
      const blocked = c.verdict === 'BLOCKED_SANCTION' || c.verdict === 'BLOCKED_STR';
      const floor = c.reason === 'STRUCTURING' ? 74 : c.reason === 'PEP' ? 62 : c.reason === 'LARGE_CROSS_BORDER' ? 55 : 40;
      const str = Math.min(99, Math.max(screen?.score ?? 0, floor + between(id, 'str', 0, blocked ? 22 : 12)));
      const velocity = blocked && c.verdict === 'BLOCKED_STR' ? between(id, 'vel', STAFF_SOP.amlVelocityBlockAt, 16) : between(id, 'vel', 1, STAFF_SOP.amlVelocityBlockAt - 1);
      const watch = c.reason === 'OFAC' ? 'watchOfac' : c.reason === 'PEP' ? 'watchPep' : 'watchNone';
      return {
        scene: `aml_${c.reason}`,
        expected: blocked ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'strScore', value: { t: 'pct', v: str } },
          { key: 'watchlist', value: { t: 'msg', key: watch }, flag: c.reason === 'OFAC' },
          { key: 'nameScore', value: { t: 'pct', v: screen?.score ?? 0 }, flag: (screen?.score ?? 0) >= AML_POLICY.sanctionMatchAt },
          { key: 'holdReason', value: { t: 'msg', key: `hold${c.reason}` } },
          { key: 'velocity', value: { t: 'num', v: velocity }, flag: velocity >= STAFF_SOP.amlVelocityBlockAt },
        ],
      };
    }
    case 'dispute': {
      const c = checkAt(stop, 'DISPUTE');
      const claim = ext?.dispute;
      if (!c || !claim) return null;
      const limit = DISPUTE_SLA_DAYS[claim.type];
      const proofKey = claim.type === 'CHARGEBACK' ? 'proofMerchant' : claim.type === 'ATM_MISMATCH' ? 'proofJournal' : 'proofRecoverable';
      const proof = claim.type === 'CHARGEBACK' ? claim.merchantEvidence : claim.type === 'ATM_MISMATCH' ? claim.journalShowsDispensed : claim.fundsRecoverable;
      const proofAgainst = claim.type === 'PACS004_RETURN' ? !proof : proof;
      return {
        scene: `dispute_${claim.type}`,
        expected: c.verdict === 'REFUND' ? 'APPROVE' : 'REJECT',
        fields: [
          { key: 'merchant', value: { t: 'code', v: p.scenario || p.id } },
          { key: 'cbCode', value: { t: 'code', v: claim.type === 'CHARGEBACK' ? 'Visa 13.1 / chargeback' : claim.type === 'PACS004_RETURN' ? 'pacs.004 PaymentReturn' : 'ATM EJ mismatch' } },
          { key: 'claimAge', value: { t: 'code', v: `${claim.ageDays} / ${limit} d` }, flag: claim.ageDays > limit },
          { key: 'claimNotes', value: { t: 'msg', key: `note${claim.type}` } },
          { key: proofKey, value: { t: 'bool', v: proof }, flag: proofAgainst },
        ],
      };
    }
    case 'bnpl': {
      if (stop.facts.bnplDecision === undefined) return null;
      const ok = stop.facts.bnplDecision === 'ELIGIBLE';
      const scoreOk = p.score >= ctx.bnplMinScore;
      // When the score passes but the plan is refused, the card shows the affordability reason the analyst would see.
      const affordability = !ok && scoreOk;
      const missedFirst = affordability && unit(id, 'why') < 0.5;
      const dti = affordability && !missedFirst ? between(id, 'dti', STAFF_SOP.bnplDtiMaxPct + 1, 62) : between(id, 'dti', 12, STAFF_SOP.bnplDtiMaxPct - 2);
      const missed = missedFirst ? between(id, 'missed', STAFF_SOP.bnplMaxMissed + 1, 4) : ok ? 0 : between(id, 'missed', 0, STAFF_SOP.bnplMaxMissed);
      const plans = between(id, 'plans', 0, 9);
      return {
        scene: 'bnpl_apply',
        expected: ok ? 'APPROVE' : 'REJECT',
        fields: [
          { key: 'creditScore', value: { t: 'num', v: p.score }, flag: !scoreOk },
          { key: 'dti', value: { t: 'pct', v: dti }, flag: dti > STAFF_SOP.bnplDtiMaxPct },
          { key: 'payIn4History', value: { t: 'code', v: `${plans} plans · ${missed} missed` }, flag: missed > STAFF_SOP.bnplMaxMissed },
          { key: 'downPayment', value: { t: 'money', cents: stop.facts.installment1Minor ?? Math.ceil(p.amountCents / 4) } },
        ],
      };
    }
    case 'cashier': {
      const c = checkAt(stop, 'TELLER');
      if (!c) return null;
      const till = ext?.cash?.tillCents ?? ctx.vaultCents;
      return {
        scene: `cashier_${c.direction}`,
        expected: c.verdict === 'COUNTED' ? 'APPROVE' : 'REJECT',
        fields: [
          { key: 'direction', value: { t: 'msg', key: c.direction === 'IN' ? 'cashIn' : 'cashOut' } },
          { key: 'vaultBalance', value: { t: 'money', cents: ctx.vaultCents } },
          { key: 'tillCash', value: { t: 'money', cents: till }, flag: c.direction === 'OUT' && p.amountCents > till },
          { key: 'serialMismatch', value: { t: 'num', v: c.suspectSerials }, flag: c.direction === 'IN' && c.suspectSerials > 0 },
          { key: 'ctrRequired', value: { t: 'bool', v: p.amountCents >= CTR_THRESHOLD_CENTS } },
        ],
      };
    }
    case 'ekyc': {
      const c = checkAt(stop, 'EKYC');
      if (!c) return null;
      const identity = ext?.identity;
      const tamper = identity?.tamperScore ?? (c.verdict === 'FAKE_ID' ? between(id, 'tamper', EKYC_POLICY.tamperMax + 1, 95) : between(id, 'tamper', 2, 30));
      const db = identity?.citizenDbMatch ?? c.verdict !== 'CITIZEN_DB_MISMATCH';
      return {
        scene: 'ekyc_onboard',
        expected: c.verdict === 'VERIFIED' ? 'APPROVE' : 'REJECT',
        fields: [
          { key: 'faceMatch', value: { t: 'pct', v: c.faceMatchPct }, flag: c.faceMatchPct < EKYC_POLICY.faceMatchMin },
          { key: 'liveness', value: { t: 'pct', v: c.livenessScore }, flag: c.livenessScore < EKYC_POLICY.livenessMin },
          { key: 'ocrMatch', value: { t: 'pct', v: c.ocrMatchPct }, flag: c.ocrMatchPct < EKYC_POLICY.ocrMinPct },
          { key: 'tamper', value: { t: 'num', v: tamper }, flag: tamper > EKYC_POLICY.tamperMax },
          { key: 'nationalDb', value: { t: 'bool', v: db }, flag: !db },
        ],
      };
    }
    case 'fds': {
      const c = checkAt(stop, 'FDS');
      if (!c) return null;
      const has = (s: (typeof c.signals)[number]): boolean => c.signals.includes(s);
      return {
        scene: 'fds_device',
        expected: c.verdict === 'CLEAR' ? 'APPROVE' : 'REJECT',
        fields: [
          { key: 'deviceScore', value: { t: 'num', v: c.score }, flag: c.score >= FDS_POLICY.highRiskAt },
          { key: 'ipAnomaly', value: { t: 'bool', v: has('IP') }, flag: has('IP') },
          { key: 'jailbreak', value: { t: 'bool', v: has('ROOT') }, flag: has('ROOT') },
          { key: 'binAttack', value: { t: 'bool', v: has('BIN') }, flag: has('BIN') },
          { key: 'newDevice', value: { t: 'bool', v: has('NEW_DEVICE') } },
        ],
      };
    }
    case 'swift': {
      const c = checkAt(stop, 'SWIFT');
      if (!c) return null;
      const sw = ext?.swift;
      return {
        scene: 'swift_remit',
        expected: c.verdict === 'VALID' ? 'APPROVE' : 'REJECT',
        fields: [
          { key: 'fxRate', value: { t: 'code', v: sw ? `1 ${sw.currency} = ${sw.fxRate.toFixed(4)} AUD` : c.currency } },
          { key: 'fxSpread', value: { t: 'code', v: `${between(id, 'spread', 18, 65)} bps` } },
          { key: 'pacs008', value: { t: 'code', v: sw ? `E2E ${sw.endToEndId || '∅'} · ${sw.debtorAgent} → ${sw.creditorAgent}` : 'pacs.008.001.08' } },
          { key: 'invalidField', value: c.field ? { t: 'code', v: c.field } : { t: 'msg', key: 'none' }, flag: c.field !== null },
          { key: 'nostro', value: { t: 'money', cents: ctx.nostroCents }, flag: ctx.nostroCents < p.amountCents },
        ],
      };
    }
  }
}

/** Live roleplay counters a desk keeps, read back as Inspector lines. */
export const RP_COUNTERS = { reviews: 'rpReviews', correct: 'rpCorrect', latency: 'rpLatencySec' } as const;

// ─────────────────────────────────────────────────────────────────────────────
// The 28-task matrix (7 roles × 4 tasks): synthetic training cases, graded by the task SOPs below
// ─────────────────────────────────────────────────────────────────────────────

/** Thresholds the task SOPs quote (analystWorkspace.messages.ts `task_<role>_<n>_sop`). */
export const TASK_SOP = {
  amlNameMatchPct: 85,
  amlStructuringTxns: 8,
  amlFunnelRetainedPct: 5,
  ekycOcrMinPct: 80,
  ekycLivenessRejectBelow: 70,
  ekycLivenessApproveAbove: 85,
  fdsTravelKmh: 900,
  fdsVelocityPerMin: 10,
  disputeDuplicateGapSec: 1,
  bnplDtiMaxPct: 45,
  bnplMinScore: 600,
  bnplMaxLate: 1,
  bnplNewAccountDays: 30,
  bnplNewAccountCapCents: 50_000,
  ctrCents: 1_000_000,
} as const;

/** Share of training cases that breach their drill's SOP. */
export const TASK_HIT_RATE = 0.6;

const TASK_REJECT_CODE: Readonly<Record<StaffRoleId, Readonly<Record<StaffDrillNo, string>>>> = {
  aml: { 1: 'AML_SANCTION_MATCH', 2: 'AML_STR_BLOCKED', 3: 'AML_FUNNEL_FROZEN' },
  ekyc: { 1: 'EKYC_OCR_UNREADABLE', 2: 'EKYC_DOCUMENT_INVALID', 3: 'EKYC_LIVENESS_FAILED' },
  fds: { 1: 'FDS_IMPOSSIBLE_TRAVEL', 2: 'FDS_BIN_ATTACK', 3: 'FDS_HIGH_RISK_DEVICE' },
  dispute: { 1: 'DISPUTE_NOT_DUPLICATE', 2: 'DISPUTE_REJECTED', 3: 'PACS004_REFUSED' },
  bnpl: { 1: 'BNPL_AFFORDABILITY', 2: 'BNPL_LATE_HISTORY', 3: 'BNPL_LIMIT_CAPPED' },
  cashier: { 1: 'TELLER_ID_REQUIRED', 2: 'TELLER_SUSPECT_NOTE', 3: 'TELLER_VAULT_LIMIT' },
  swift: { 1: 'SWIFT_INVALID', 2: 'NOSTRO_LIMIT_HOLD', 3: 'CORRESPONDENT_SANCTIONED' },
};

/** The drill a case of a task plays: itself for 1-3, a stable random pick for task 4. */
export function drillFor(task: StaffTaskNo, caseId: string): StaffDrillNo {
  return task === RANDOM_TASK ? ((1 + Math.min(2, Math.floor(unit(caseId, 'drill') * 3))) as StaffDrillNo) : (task as StaffDrillNo);
}

const pct = (v: number): StaffFieldValue => ({ t: 'pct', v });
const num = (v: number): StaffFieldValue => ({ t: 'num', v });
const cash = (cents: number): StaffFieldValue => ({ t: 'money', cents });
const bool = (v: boolean): StaffFieldValue => ({ t: 'bool', v });
const code = (v: string): StaffFieldValue => ({ t: 'code', v });
const msg = (key: string): StaffFieldValue => ({ t: 'msg', key });

interface Drill {
  amountCents: number;
  fields: StaffField[];
  expected: StaffDecision;
}

const ORIGINS = ['Hanoi, VN', 'Ho Chi Minh City, VN', 'Da Nang, VN'] as const;
const FAR = ['Paris, FR', 'Frankfurt, DE', 'Madrid, ES'] as const;
const pickOf = <T>(id: string, purpose: string, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(unit(id, purpose) * list.length))]!;

/** One drill case. `hit` = the case breaches the SOP's red flag (which is a REJECT, except for the dispute refunds). */
function drillCase(role: StaffRoleId, drill: StaffDrillNo, id: string, hit: boolean): Drill {
  const b = (purpose: string, lo: number, hi: number): number => between(id, purpose, lo, hi);
  const S = TASK_SOP;
  switch (`${role}_${drill}` as `${StaffRoleId}_${StaffDrillNo}`) {
    case 'aml_1': {
      const score = hit ? b('name', S.amlNameMatchPct + 1, 98) : b('name', 35, 72);
      return {
        amountCents: b('amt', 80, 450) * 10_000,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'nameScore', value: pct(score), flag: score > S.amlNameMatchPct },
          { key: 'watchlist', value: msg(hit ? 'watchOfac' : 'watchNone'), flag: hit },
          { key: 'beneficiaryCountry', value: code(hit ? pickOf(id, 'c', ['IR', 'KP', 'SY']) : pickOf(id, 'c', ['SG', 'JP', 'AU'])) },
        ],
      };
    }
    case 'aml_2': {
      const count = hit ? b('n', S.amlStructuringTxns, 14) : b('n', 1, 3);
      const each = hit ? 990_000 : b('each', 120, 640) * 1_000;
      return {
        amountCents: each,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'velocity', value: num(count), flag: count >= S.amlStructuringTxns },
          { key: 'splitPattern', value: bool(hit), flag: hit },
          { key: 'dailyTotal', value: cash(each * count) },
        ],
      };
    }
    case 'aml_3': {
      const retained = hit ? b('ret', 0, 2) : b('ret', 60, 95);
      const wallets = hit ? b('w', 18, 24) : b('w', 0, 2);
      return {
        amountCents: 10_000_000,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'inflowAmount', value: cash(10_000_000) },
          { key: 'outWallets', value: num(wallets), flag: hit },
          { key: 'retainedPct', value: pct(retained), flag: retained < S.amlFunnelRetainedPct },
          { key: 'passThroughMin', value: num(hit ? b('min', 2, 4) : b('min', 2_880, 20_160)), flag: hit },
        ],
      };
    }
    case 'ekyc_1': {
      const ocr = hit ? b('ocr', 18, 55) : b('ocr', 92, 99);
      return {
        amountCents: 0,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'ocrMatch', value: pct(ocr), flag: ocr < S.ekycOcrMinPct },
          { key: 'imageQuality', value: msg(hit ? pickOf(id, 'q', ['qualityBlurred', 'qualityCornerCut', 'qualityGlare']) : 'qualityClear'), flag: hit },
          { key: 'idReadable', value: bool(!hit), flag: hit },
        ],
      };
    }
    case 'ekyc_2': {
      const declared = b('age', 21, 58);
      const expired = hit && unit(id, 'which') < 0.5;
      const docAge = hit && !expired ? declared + pickOf(id, 'gap', [-6, -4, 5, 8]) : declared;
      return {
        amountCents: 0,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'declaredAge', value: num(declared) },
          { key: 'documentAge', value: num(docAge), flag: docAge !== declared },
          { key: 'docExpired', value: bool(expired), flag: expired },
        ],
      };
    }
    case 'ekyc_3': {
      const live = hit ? b('live', 22, 59) : b('live', S.ekycLivenessApproveAbove + 1, 99);
      return {
        amountCents: 0,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'liveness', value: pct(live), flag: live < S.ekycLivenessRejectBelow },
          { key: 'faceMatch', value: pct(hit ? b('face', 70, 96) : b('face', 90, 99)) },
          { key: 'replaySignal', value: bool(hit), flag: hit },
        ],
      };
    }
    case 'fds_1': {
      const speed = hit ? b('kmh', 98_000, 112_000) : b('kmh', 0, 60);
      return {
        amountCents: b('amt', 40, 260) * 1_000,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'loginLocation', value: code(`${pickOf(id, 'from', ORIGINS)} · 02:00`) },
          { key: 'cardLocation', value: code(`${hit ? pickOf(id, 'to', FAR) : pickOf(id, 'from', ORIGINS)} · 02:05`), flag: hit },
          { key: 'travelSpeed', value: num(speed), flag: speed > S.fdsTravelKmh },
        ],
      };
    }
    case 'fds_2': {
      const rate = hit ? b('rate', 35, 60) : b('rate', 1, 3);
      return {
        amountCents: hit ? 100 : b('amt', 25, 180) * 100,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'txPerMin', value: num(rate), flag: rate > S.fdsVelocityPerMin },
          { key: 'avgTicket', value: cash(hit ? 100 : b('amt', 25, 180) * 100), flag: hit },
          { key: 'binAttack', value: bool(hit), flag: hit },
        ],
      };
    }
    case 'fds_3': {
      const rat = hit && unit(id, 'which') < 0.5;
      const root = hit && !rat ? true : hit && unit(id, 'root') < 0.5;
      return {
        amountCents: b('amt', 50, 900) * 1_000,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'jailbreak', value: bool(root), flag: root },
          { key: 'ratDetected', value: bool(rat), flag: rat },
          { key: 'deviceScore', value: num(hit ? b('dev', 82, 98) : b('dev', 4, 25)), flag: hit },
        ],
      };
    }
    case 'dispute_1': {
      const gap = hit ? 0 : b('gap', 1_800, 14_400);
      return {
        amountCents: 5_000,
        expected: hit ? 'APPROVE' : 'REJECT',
        fields: [
          { key: 'posAmount', value: cash(5_000) },
          { key: 'arnMatch', value: bool(hit) },
          { key: 'gapSec', value: num(gap), flag: gap > S.disputeDuplicateGapSec },
        ],
      };
    }
    case 'dispute_2': {
      const noInvoice = !hit && unit(id, 'which') < 0.5;
      const replied = !hit && !noInvoice;
      return {
        amountCents: b('amt', 60, 900) * 1_000,
        expected: hit ? 'APPROVE' : 'REJECT',
        fields: [
          { key: 'proofInvoice', value: bool(!noInvoice), flag: noInvoice },
          { key: 'merchantReplied', value: bool(replied), flag: replied },
          { key: 'daysPastSla', value: num(b('late', 3, 21)) },
        ],
      };
    }
    case 'dispute_3': {
      const reportH = b('rh', 7, 11);
      const swipeH = hit ? reportH + b('sh', 1, 6) : reportH - b('sh', 1, 5);
      const hhmm = (h: number, m: number): string => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      return {
        amountCents: b('amt', 80, 1_400) * 1_000,
        expected: hit ? 'APPROVE' : 'REJECT',
        fields: [
          { key: 'lostReportedAt', value: code(hhmm(reportH, b('rm', 0, 59))) },
          { key: 'swipedAt', value: code(hhmm(swipeH, b('sm', 0, 59))) },
          { key: 'reportedBeforeSwipe', value: bool(hit), flag: !hit },
        ],
      };
    }
    case 'bnpl_1': {
      const lowScore = hit && unit(id, 'which') < 0.4;
      const dti = hit && !lowScore ? b('dti', 51, 68) : b('dti', 15, 40);
      const score = lowScore ? b('score', 480, S.bnplMinScore - 1) : b('score', 640, 790);
      return {
        amountCents: b('amt', 30, 150) * 1_000,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'dti', value: pct(dti), flag: dti > S.bnplDtiMaxPct },
          { key: 'creditScore', value: num(score), flag: score < S.bnplMinScore },
          { key: 'requestedLimit', value: cash(b('amt', 30, 150) * 1_000) },
        ],
      };
    }
    case 'bnpl_2': {
      const late = hit ? b('late', S.bnplMaxLate, 3) : 0;
      return {
        amountCents: b('amt', 40, 120) * 1_000,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'payIn4History', value: code(`${b('plans', 3, 9)} plans`) },
          { key: 'latePayments', value: num(late), flag: late >= S.bnplMaxLate },
          { key: 'maxDaysLate', value: num(hit ? b('days', 16, 45) : 0), flag: hit },
        ],
      };
    }
    case 'bnpl_3': {
      const smallAsk = !hit && unit(id, 'which') < 0.5;
      const age = hit || smallAsk ? b('age', 2, 6) : b('age', 120, 900);
      const ask = smallAsk ? b('ask', 20, 50) * 1_000 : 300_000;
      return {
        amountCents: ask,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'accountAge', value: num(age), flag: age < S.bnplNewAccountDays && ask > S.bnplNewAccountCapCents },
          { key: 'requestedLimit', value: cash(ask), flag: hit },
          { key: 'limitCap', value: age < S.bnplNewAccountDays ? cash(S.bnplNewAccountCapCents) : msg('none') },
        ],
      };
    }
    case 'cashier_1': {
      const amount = b('amt', 120, 180) * 10_000;
      return {
        amountCents: amount,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'direction', value: msg(unit(id, 'dir') < 0.5 ? 'cashIn' : 'cashOut') },
          { key: 'ctrRequired', value: bool(amount >= S.ctrCents) },
          { key: 'idVerified', value: bool(!hit), flag: hit },
        ],
      };
    }
    case 'cashier_2': {
      const bad = hit ? b('bad', 1, 3) : 0;
      return {
        amountCents: 150_000,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'direction', value: msg('cashIn') },
          { key: 'serialMismatch', value: num(bad), flag: bad > 0 },
          { key: 'polymerCheck', value: bool(!hit), flag: hit },
        ],
      };
    }
    case 'cashier_3': {
      const till = 1_200_000;
      const ask = hit ? 2_000_000 : b('ask', 20, 110) * 10_000;
      return {
        amountCents: ask,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'direction', value: msg('cashOut') },
          { key: 'tillCash', value: cash(till), flag: ask > till },
          { key: 'vaultBalance', value: cash(25_000_000) },
        ],
      };
    }
    case 'swift_1': {
      const noUetr = hit && unit(id, 'which') < 0.5;
      const noAddr = hit && !noUetr;
      return {
        amountCents: b('amt', 50, 400) * 10_000,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'uetrPresent', value: bool(!noUetr), flag: noUetr },
          { key: 'creditorAddress', value: bool(!noAddr), flag: noAddr },
          { key: 'invalidField', value: noUetr ? code('UETR') : noAddr ? code('Cdtr/PstlAdr') : msg('none'), flag: hit },
        ],
      };
    }
    case 'swift_2': {
      const nostro = 50_000_000;
      const amount = hit ? b('amt', 520, 900) * 100_000 : b('amt', 50, 400) * 100_000;
      return {
        amountCents: amount,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'fxRate', value: code(`1 USD = ${(1.48 + unit(id, 'fx') * 0.08).toFixed(4)} AUD`) },
          { key: 'nostro', value: cash(nostro), flag: amount > nostro },
          { key: 'pacs008', value: code('pacs.008.001.08') },
        ],
      };
    }
    case 'swift_3':
      return {
        amountCents: b('amt', 80, 600) * 10_000,
        expected: hit ? 'REJECT' : 'APPROVE',
        fields: [
          { key: 'correspondentBank', value: code(hit ? pickOf(id, 'bic', ['MELIIRTH', 'KKBCKPPY', 'CBSYSYDA']) : pickOf(id, 'bic', ['CHASUS33', 'DEUTDEFF', 'HSBCHKHH'])) },
          { key: 'correspondentSanctioned', value: bool(hit), flag: hit },
          { key: 'pacs008', value: code('pacs.008.001.08') },
        ],
      };
  }
}

/** One training case of the 28-task matrix, stable per role, task and sequence number. A desk incident at this role floods the queue with its drill. */
export function buildTaskCase(role: StaffRoleId, task: StaffTaskNo, seq: number, incident: IncidentId | null = null): StaffCase {
  const id = `TR-${role.toUpperCase()}-${task}-${String(seq + 1).padStart(3, '0')}`;
  const surge = incident && incidentRole(incident) === role ? (incident as DeskIncidentId) : null;
  const drill = surge ? INCIDENT_DRILL[surge] : drillFor(task, id);
  const hit = unit(id, 'hit') < (surge ? INCIDENT.surgeHitRate : TASK_HIT_RATE);
  const d = drillCase(role, drill, id, hit);
  return {
    id,
    station: ROLE_STATION[role],
    role,
    scenario: '',
    amountCents: d.amountCents,
    waitedMin: between(id, 'wait', 0, 6),
    fields: d.fields,
    scene: `task_${role}_${drill}`,
    drill,
    ...(surge ? { incident: surge } : {}),
    expected: d.expected,
  };
}

/** The head of a task's queue and the cases behind it. */
export function taskDeck(role: StaffRoleId, task: StaffTaskNo, seq: number, size = 4, incident: IncidentId | null = null): StaffCase[] {
  return Array.from({ length: size }, (_, i) => buildTaskCase(role, task, seq + i, incident));
}

/** Grades a decision on a task-matrix case against its SOP. */
export function gradeTaskCase(c: StaffCase, decision: StaffDecision): StaffDecisionResult {
  const drill = c.drill ?? 1;
  return {
    ok: true,
    packetId: c.id,
    decision,
    expected: c.expected,
    correct: decision === c.expected,
    statusCode: decision === 'APPROVE' ? APPROVE_CODE[c.role] : TASK_REJECT_CODE[c.role][drill],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Time-Attack Challenge Mode
// ─────────────────────────────────────────────────────────────────────────────

export const CHALLENGE = {
  /** Length of a challenge shift, in real seconds. */
  durationSec: 180,
  /** XP for a decision that matches the SOP. */
  base: 100,
  /** Most speed bonus a correct decision can add. */
  bonusMax: 50,
  /** The speed bonus falls from bonusMax at 0 s to nothing at this many seconds. */
  bonusWindowSec: 15,
  /** XP lost for a wrong approval or rejection. */
  penalty: 50,
} as const;

/** How an incident changes scoring: whether the speed bonus pays, and how many times the error penalty bites. */
export interface ScoringRules {
  speedBonus: boolean;
  penaltyMult: number;
}
export const NORMAL_RULES: ScoringRules = { speedBonus: true, penaltyMult: 1 };

/** Speed bonus for a correct decision taken after `latencySec`. */
export const challengeBonus = (latencySec: number, rules: ScoringRules = NORMAL_RULES): number =>
  rules.speedBonus ? Math.round(CHALLENGE.bonusMax * Math.max(0, 1 - Math.max(0, latencySec) / CHALLENGE.bonusWindowSec)) : 0;

/** XP a single challenge decision is worth: base plus speed bonus when right, the penalty when wrong. */
export const challengePoints = (correct: boolean, latencySec: number, rules: ScoringRules = NORMAL_RULES): number =>
  correct ? CHALLENGE.base + challengeBonus(latencySec, rules) : -CHALLENGE.penalty * rules.penaltyMult;

export interface ChallengeTally {
  reviews: number;
  correct: number;
  /** Net XP: base and bonus earned, penalties taken off. */
  xp: number;
  bonusXp: number;
  penaltyXp: number;
}

export const EMPTY_TALLY: ChallengeTally = { reviews: 0, correct: 0, xp: 0, bonusXp: 0, penaltyXp: 0 };

export function addToTally(t: ChallengeTally, correct: boolean, latencySec: number, rules: ScoringRules = NORMAL_RULES): ChallengeTally {
  const bonus = correct ? challengeBonus(latencySec, rules) : 0;
  return {
    reviews: t.reviews + 1,
    correct: t.correct + (correct ? 1 : 0),
    xp: t.xp + challengePoints(correct, latencySec, rules),
    bonusXp: t.bonusXp + bonus,
    penaltyXp: t.penaltyXp + (correct ? 0 : CHALLENGE.penalty * rules.penaltyMult),
  };
}

export type ChallengeGrade = 'S' | 'A' | 'B' | 'C' | 'F';
export const CHALLENGE_GRADES: readonly ChallengeGrade[] = ['S', 'A', 'B', 'C', 'F'];

/** What each grade needs, best first: an accuracy floor and a volume of reviews inside the shift. */
export const GRADE_BANDS: readonly { grade: Exclude<ChallengeGrade, 'F'>; minAccuracyPct: number; minReviews: number }[] = [
  { grade: 'S', minAccuracyPct: 95, minReviews: 12 },
  { grade: 'A', minAccuracyPct: 90, minReviews: 9 },
  { grade: 'B', minAccuracyPct: 80, minReviews: 6 },
  { grade: 'C', minAccuracyPct: 65, minReviews: 3 },
];

export const tallyAccuracy = (t: Pick<ChallengeTally, 'reviews' | 'correct'>): number => (t.reviews > 0 ? (t.correct / t.reviews) * 100 : 0);

/** The operational efficiency grade for a finished shift. */
export function challengeGrade(t: Pick<ChallengeTally, 'reviews' | 'correct'>): ChallengeGrade {
  const acc = tallyAccuracy(t);
  return GRADE_BANDS.find((b) => acc >= b.minAccuracyPct && t.reviews >= b.minReviews)?.grade ?? 'F';
}

// ─────────────────────────────────────────────────────────────────────────────
// Incident Mode: 25 crisis events (4 bank-wide, 3 per desk)
// ─────────────────────────────────────────────────────────────────────────────

export const GLOBAL_INCIDENTS = ['AUDIT_DAY', 'NETWORK_LATENCY', 'CORRUPTED_PAYLOAD', 'POWER_GRID_FAILOVER'] as const;

/** Each desk's incidents in drill order: an incident surges its drill into the queue (INCIDENT_DRILL). */
export const DESK_INCIDENTS = {
  aml: ['AML_SANCTION_FLASH_UPDATE', 'AML_SMURF_WAVE', 'AML_PASS_THROUGH_BURST'],
  ekyc: ['EKYC_DOCUMENT_FORGERY_RING', 'EKYC_UNDERAGE_IDENTITY_THEFT', 'EKYC_DEEPFAKE_BOTNET'],
  fds: ['FDS_IMPOSSIBLE_TRAVEL_SPIKE', 'FDS_BIN_STORM', 'FDS_RAT_MALWARE_OUTBREAK'],
  dispute: ['DISPUTE_DOUBLE_DEBIT_GLITCH', 'DISPUTE_ROGUE_MERCHANT_SURGE', 'DISPUTE_FRIENDLY_FRAUD_RING'],
  bnpl: ['BNPL_INCOME_STUB_FORGERY', 'BNPL_DEFAULT_CASCADE', 'BNPL_BUSTOUT_RING'],
  cashier: ['CASH_CTR_SPLIT_CIRCUMVENTION', 'CASH_COUNTERFEIT_RING', 'CASH_VAULT_DRAIN'],
  swift: ['SWIFT_ISO20022_SCHEMA_CORRUPTION', 'SWIFT_NOSTRO_CRUNCH', 'SWIFT_FLASH_SANCTION_ROUTE'],
} as const satisfies Record<StaffRoleId, readonly [string, string, string]>;

export type GlobalIncidentId = (typeof GLOBAL_INCIDENTS)[number];
export type DeskIncidentId = (typeof DESK_INCIDENTS)[StaffRoleId][number];
export type IncidentId = GlobalIncidentId | DeskIncidentId;

export const INCIDENT_IDS: readonly IncidentId[] = [...GLOBAL_INCIDENTS, ...STAFF_ROLES.flatMap((r) => DESK_INCIDENTS[r])];

const INCIDENT_HOME = Object.fromEntries(STAFF_ROLES.flatMap((r) => DESK_INCIDENTS[r].map((id, i) => [id, { role: r, drill: (i + 1) as StaffDrillNo }]))) as Readonly<
  Record<DeskIncidentId, { role: StaffRoleId; drill: StaffDrillNo }>
>;

/** The drill a desk incident floods the queue with. */
export const INCIDENT_DRILL = Object.fromEntries(Object.entries(INCIDENT_HOME).map(([id, h]) => [id, h.drill])) as Readonly<Record<DeskIncidentId, StaffDrillNo>>;

/** The desk an incident belongs to, or null for a bank-wide one. */
export const incidentRole = (id: IncidentId): StaffRoleId | null => (id in INCIDENT_HOME ? INCIDENT_HOME[id as DeskIncidentId].role : null);

export const INCIDENT = {
  /** Chance a shift opens with an incident. */
  chance: 0.25,
  /** Share of surged cases that breach the incident's SOP. */
  surgeHitRate: 0.9,
  /** AUDIT_DAY: an error costs this many times STAFF_XP_PER_CORRECT, and this much compliance. */
  auditPenaltyMult: 3,
  auditComplianceDrop: 15,
  /** NETWORK_LATENCY: the SLA keeps this share of its length. */
  latencySlaFactor: 0.7,
  /** POWER_GRID_FAILOVER: the SLA clock runs this many times faster. */
  powerClockRate: 1.5,
  /** CORRUPTED_PAYLOAD: most fields hidden on one card. */
  maxMasked: 2,
} as const;

/** The incident running at a desk, its compliance score (AUDIT_DAY) and the decisions taken under it. */
export interface ActiveIncident {
  id: IncidentId;
  compliance: number;
  reviews: number;
}

/** Rolls the incident a new shift at `role` opens with: none 75% of the time, otherwise any bank-wide or desk incident. */
export function rollIncident(role: StaffRoleId, rand: () => number = Math.random): IncidentId | null {
  if (rand() >= INCIDENT.chance) return null;
  const pool: readonly IncidentId[] = [...GLOBAL_INCIDENTS, ...DESK_INCIDENTS[role]];
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
}

export const startIncident = (id: IncidentId | null): ActiveIncident | null => (id ? { id, compliance: 100, reviews: 0 } : null);

/** The SLA a review has under an incident. */
export const incidentSlaSeconds = (id: IncidentId | null | undefined): number => (id === 'NETWORK_LATENCY' ? Math.round(STAFF_SLA_SECONDS * INCIDENT.latencySlaFactor) : STAFF_SLA_SECONDS);

/** How fast the SLA clock runs under an incident. */
export const incidentClockRate = (id: IncidentId | null | undefined): number => (id === 'POWER_GRID_FAILOVER' ? INCIDENT.powerClockRate : 1);

export const incidentRules = (id: IncidentId | null | undefined): ScoringRules => (id === 'AUDIT_DAY' ? { speedBonus: false, penaltyMult: INCIDENT.auditPenaltyMult } : NORMAL_RULES);

/** Shift XP an error costs: nothing normally, 3x a correct decision during an audit. */
export const incidentErrorXp = (id: IncidentId | null | undefined): number => (id === 'AUDIT_DAY' ? STAFF_XP_PER_CORRECT * INCIDENT.auditPenaltyMult : 0);

/** CORRUPTED_PAYLOAD: the 1-2 field keys a card hides, stable per case, never every field. */
export function maskedFields(c: Pick<StaffCase, 'id' | 'fields'>, id: IncidentId | null | undefined): ReadonlySet<string> {
  if (id !== 'CORRUPTED_PAYLOAD' || c.fields.length < 2) return new Set();
  const n = Math.min(c.fields.length - 1, unit(c.id, 'maskN') < 0.5 ? 1 : INCIDENT.maxMasked);
  const order = c.fields.map((f) => f.key).sort((a, b) => unit(c.id, `mask:${a}`) - unit(c.id, `mask:${b}`));
  return new Set(order.slice(0, n));
}

/** Books one decision on an incident: AUDIT_DAY errors cost compliance. */
export const advanceIncident = (a: ActiveIncident, correct: boolean): ActiveIncident => ({
  ...a,
  reviews: a.reviews + 1,
  compliance: a.id === 'AUDIT_DAY' && !correct ? Math.max(0, a.compliance - INCIDENT.auditComplianceDrop) : a.compliance,
});
