/** Phase 8 Step 2: the Staff Roleplay Workspace engine. */

import { AML_POLICY, CTR_THRESHOLD_CENTS, DISPUTE_SLA_DAYS, EKYC_POLICY, FDS_POLICY } from './amlEngine';
import { isAutomatedNode } from './nodeKind';
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

/** Whether a roleplay desk is a server-run system (eKYC onboarding, the FDS device check, SWIFT STP) or a desk people staff (AML, disputes, BNPL, the teller counter). */
export const isAutomatedDesk = (role: StaffRoleId): boolean => isAutomatedNode(ROLE_STATION[role]);

/** A held case the bank's checks flagged: a field breaches the SOP, or the right answer is to refuse it. */
export const isExceptionCase = (c: Pick<StaffCase, 'expected' | 'fields'>): boolean => c.expected === 'REJECT' || c.fields.some((f) => f.flag);

/** How a desk is entered: a person's shift on a human desk; on a system, monitoring, or reviewing the exceptions it flagged. */
export type DeskEntry = 'roleplay' | 'monitor' | 'exceptions';
export const deskEntry = (role: StaffRoleId, exceptions: number): DeskEntry => (!isAutomatedDesk(role) ? 'roleplay' : exceptions > 0 ? 'exceptions' : 'monitor');

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
  /** An operational warning that does not change the verdict (the low-cassette alert). */
  alert?: boolean;
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

/** A task of the 28-task matrix: tasks 1-3 are fixed drills, task 4 is a random shift mixing them. Task 5 is the desk's retail-operations queue. */
export type StaffTaskNo = 1 | 2 | 3 | 4 | 5;
export type StaffDrillNo = 1 | 2 | 3;
export const STAFF_TASKS: readonly StaffTaskNo[] = [1, 2, 3, 4];
export const STAFF_DRILLS: readonly StaffDrillNo[] = [1, 2, 3];
export const RANDOM_TASK: StaffTaskNo = 4;
/** Phase 10: the retail-operations queue every desk has beside the 28-task matrix. */
export const RETAIL_TASK: StaffTaskNo = 5;
/** Every task the workspace offers: the matrix, then the retail queue. */
export const WORKSPACE_TASKS: readonly StaffTaskNo[] = [...STAFF_TASKS, RETAIL_TASK];
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
  scene: StaffScene | TaskScene | RetailScene;
  /** The drill a task-matrix case belongs to (absent on live-queue cases). */
  drill?: StaffDrillNo;
  /** The desk incident that surged this case into the queue (Incident Mode). */
  incident?: DeskIncidentId;
  /** A retail-operations case: its scenario, status codes and the journal each decision posts. */
  retail?: RetailCaseData;
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
  /** The double-entry journal this decision posts to the core ledger (every graded training case). */
  journal?: JournalEntry;
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

/** The identity checks' outcome, as the inspector names it: a spoofed face (liveness), a document that fails OCR or validation, a face that is not the document's, or verified. */
const EKYC_VERDICT_MSG = { LIVENESS_FAILED: 'ekycVerdictLiveness', FAKE_ID: 'ekycVerdictDocument', CITIZEN_DB_MISMATCH: 'ekycVerdictDocument', FACE_MISMATCH: 'ekycVerdictFace', VERIFIED: 'ekycVerdictVerified' } as const;

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
          { key: 'ekycVerdict', value: { t: 'msg', key: EKYC_VERDICT_MSG[c.verdict] }, flag: c.verdict !== 'VERIFIED' },
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
          { key: 'fxGross', value: { t: 'code', v: sw ? `${sw.currency} ${(p.amountCents / 100 / sw.fxRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' } },
          { key: 'fxMarkup', value: { t: 'money', cents: fxMarkupCents(p.amountCents, between(id, 'spread', 18, 65)) } },
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

// The 28-task matrix (7 roles × 4 tasks): synthetic training cases, graded by the task SOPs below

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
          { key: 'ekycVerdict', value: msg(hit ? 'ekycVerdictDocument' : 'ekycVerdictVerified'), flag: hit },
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
          { key: 'ekycVerdict', value: msg(hit ? 'ekycVerdictDocument' : 'ekycVerdictVerified'), flag: hit },
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
          { key: 'ekycVerdict', value: msg(hit ? 'ekycVerdictLiveness' : 'ekycVerdictVerified'), flag: hit },
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
          { key: 'fxSpread', value: code(`${DEFAULT_FX_SPREAD_BPS} bps`) },
          { key: 'fxGross', value: code(`USD ${(amount / 100 / (1.48 + unit(id, 'fx') * 0.08)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`) },
          { key: 'fxMarkup', value: cash(fxMarkupCents(amount, DEFAULT_FX_SPREAD_BPS)) },
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
  if (task === RETAIL_TASK) return buildRetailCase(role, seq);
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
/** The first retail case at or after `seq` that plays `focus` (the Task 5 filter): its sequence number. */
export function nextRetailSeq(role: StaffRoleId, seq: number, focus: RetailScenarioId): number {
  if (!RETAIL_DESK[role].includes(focus)) return seq;
  for (let n = seq; n < seq + 500; n++) if (pickOf(`RT-${role.toUpperCase()}-${String(n + 1).padStart(3, '0')}`, 'scenario', RETAIL_DESK[role]) === focus) return n;
  return seq;
}

/** The next `size` retail cases of one scenario from `seq` (the filtered queue). */
export function retailDeck(role: StaffRoleId, seq: number, size: number, focus: RetailScenarioId): StaffCase[] {
  const out: StaffCase[] = [];
  for (let n = nextRetailSeq(role, seq, focus); out.length < size; n = nextRetailSeq(role, n + 1, focus)) out.push(buildRetailCase(role, n));
  return out;
}

export function taskDeck(role: StaffRoleId, task: StaffTaskNo, seq: number, size = 4, incident: IncidentId | null = null): StaffCase[] {
  return Array.from({ length: size }, (_, i) => buildTaskCase(role, task, seq + i, incident));
}

/** Grades a decision on a task-matrix case against its SOP. */
export function gradeTaskCase(c: StaffCase, decision: StaffDecision): StaffDecisionResult {
  if (c.retail) return gradeRetailCase(c, c.retail, decision);
  const drill = c.drill ?? 1;
  const statusCode = decision === 'APPROVE' ? APPROVE_CODE[c.role] : TASK_REJECT_CODE[c.role][drill];
  return {
    ok: true,
    packetId: c.id,
    decision,
    expected: c.expected,
    correct: decision === c.expected,
    statusCode,
    journal: caseJournal(c, decision, statusCode),
  };
}

// Time-Attack Challenge Mode

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

// Incident Mode: 25 crisis events (4 bank-wide, 3 per desk)

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

// Career progression (lifetime XP → level and rank) and operational badges

export type CareerRankId = 'intern' | 'junior' | 'senior' | 'cro';

/** The four ranks, lowest first. `maxXp` is the last XP inside the rank; `xpPerLevel` only applies to the open-ended top rank. */
export const CAREER_RANKS: readonly { id: CareerRankId; icon: string; minLevel: number; maxLevel: number | null; minXp: number; maxXp: number | null; xpPerLevel?: number }[] = [
  { id: 'intern', icon: '🐣', minLevel: 1, maxLevel: 5, minXp: 0, maxXp: 1_500 },
  { id: 'junior', icon: '🛡️', minLevel: 6, maxLevel: 15, minXp: 1_501, maxXp: 5_000 },
  { id: 'senior', icon: '⚡', minLevel: 16, maxLevel: 30, minXp: 5_001, maxXp: 15_000 },
  { id: 'cro', icon: '👑', minLevel: 31, maxLevel: null, minXp: 15_001, maxXp: null, xpPerLevel: 1_000 },
];

export interface CareerStanding {
  rank: CareerRankId;
  icon: string;
  level: number;
  xp: number;
  /** XP at which the next rank starts, or null at the top rank. */
  nextRankXp: number | null;
  /** 0-1 through the current rank (1 at the top rank). */
  rankProgress: number;
}

/** Level and rank for a lifetime XP total. Levels are spread evenly across each rank's XP band. */
export function careerStanding(xp: number): CareerStanding {
  const total = Math.max(0, Math.floor(xp));
  const tier = [...CAREER_RANKS].reverse().find((r) => total >= r.minXp) ?? CAREER_RANKS[0]!;
  const into = total - tier.minXp;
  if (tier.maxXp === null || tier.maxLevel === null) {
    return { rank: tier.id, icon: tier.icon, level: tier.minLevel + Math.floor(into / (tier.xpPerLevel ?? 1_000)), xp: total, nextRankXp: null, rankProgress: 1 };
  }
  const band = tier.maxXp + 1 - tier.minXp;
  const levels = tier.maxLevel - tier.minLevel + 1;
  return {
    rank: tier.id,
    icon: tier.icon,
    level: Math.min(tier.maxLevel, tier.minLevel + Math.floor((into * levels) / band)),
    xp: total,
    nextRankXp: tier.maxXp + 1,
    rankProgress: Math.min(1, into / band),
  };
}

export type BadgeId = 'ekycHawkEye' | 'amlIronShield' | 'slaMaster' | 'perfectAuditor';
export const BADGES: readonly BadgeId[] = ['ekycHawkEye', 'amlIronShield', 'slaMaster', 'perfectAuditor'];
export const BADGE_ICON: Readonly<Record<BadgeId, string>> = { ekycHawkEye: '👁️', amlIronShield: '🛑', slaMaster: '⚡', perfectAuditor: '⚖️' };

/** What each badge asks for. */
export const BADGE_RULES = {
  /** eKYC Hawk-Eye: this many eKYC reviews in a row, all correct. */
  ekycStreak: 10,
  /** AML Iron Shield: this many structuring or OFAC blocks in a row inside one shift. */
  amlBlocks: 5,
  /** SLA Master: a full shift averaging under this many seconds a review. */
  slaAvgSec: 8,
  /** Perfect Auditor: this many full Expert-mode shifts in a row at 100%. */
  auditorShifts: 3,
} as const;

/** The shift being worked toward the next badge check. */
export interface CareerShiftLog {
  reviews: number;
  correct: number;
  latencySumSec: number;
  /** Every decision this shift was taken in Expert mode. */
  allExpert: boolean;
  amlBlockRun: number;
  amlBlockBest: number;
}

export interface CareerProgress {
  /** Lifetime XP across every shift. */
  xp: number;
  badges: BadgeId[];
  /** Consecutive correct eKYC reviews (lifetime). */
  ekycStreak: number;
  /** Consecutive full Expert shifts at 100% accuracy. */
  perfectExpertShifts: number;
  shift: CareerShiftLog;
}

export const EMPTY_SHIFT_LOG: CareerShiftLog = { reviews: 0, correct: 0, latencySumSec: 0, allExpert: true, amlBlockRun: 0, amlBlockBest: 0 };
export const EMPTY_CAREER: CareerProgress = { xp: 0, badges: [], ekycStreak: 0, perfectExpertShifts: 0, shift: EMPTY_SHIFT_LOG };

export interface CareerDecision {
  role: StaffRoleId;
  drill?: StaffDrillNo;
  expected: StaffDecision | null;
  decision: StaffDecision;
  correct: boolean;
  latencySec: number;
  expert: boolean;
  /** XP the decision booked on the shift. */
  xp: number;
}

/** AML structuring (drill 2) and OFAC (drill 1) cases the SOP says to block. */
const amlBlockCase = (d: CareerDecision): boolean => d.role === 'aml' && (d.drill === 1 || d.drill === 2) && d.expected === 'REJECT';

/** Books a decision on the career; at the end of every SHIFT_TARGET.reviews-review shift, checks the badges. Returns the badges it just unlocked. */
export function recordCareerDecision(c: CareerProgress, d: CareerDecision): { career: CareerProgress; unlocked: BadgeId[] } {
  const s = c.shift;
  const blocked = amlBlockCase(d) && d.correct;
  const amlBlockRun = blocked ? s.amlBlockRun + 1 : d.correct ? s.amlBlockRun : 0;
  const shift: CareerShiftLog = {
    reviews: s.reviews + 1,
    correct: s.correct + (d.correct ? 1 : 0),
    latencySumSec: s.latencySumSec + Math.max(0, d.latencySec),
    allExpert: s.allExpert && d.expert,
    amlBlockRun,
    amlBlockBest: Math.max(s.amlBlockBest, amlBlockRun),
  };
  const ekycStreak = d.role === 'ekyc' ? (d.correct ? c.ekycStreak + 1 : 0) : c.ekycStreak;
  const next: CareerProgress = { ...c, xp: Math.max(0, c.xp + d.xp), ekycStreak, shift };
  if (shift.reviews < SHIFT_TARGET.reviews) return { career: next, unlocked: [] };

  const perfectExpertShifts = shift.allExpert && shift.correct === shift.reviews ? c.perfectExpertShifts + 1 : 0;
  const earned: Record<BadgeId, boolean> = {
    ekycHawkEye: ekycStreak >= BADGE_RULES.ekycStreak,
    amlIronShield: shift.amlBlockBest >= BADGE_RULES.amlBlocks,
    slaMaster: shift.latencySumSec / shift.reviews < BADGE_RULES.slaAvgSec,
    perfectAuditor: perfectExpertShifts >= BADGE_RULES.auditorShifts,
  };
  const unlocked = BADGES.filter((b) => earned[b] && !c.badges.includes(b));
  return { career: { ...next, perfectExpertShifts, shift: EMPTY_SHIFT_LOG, badges: [...c.badges, ...unlocked] }, unlocked };
}

// Phase 10: retail banking operations and the double-entry core ledger

/** The core ledger's chart of accounts. Balances are kept debit-positive: assets and expenses carry a positive balance, the rest a negative one. */
export const GL_ACCOUNTS = [
  { id: 'VAULT_CASH', code: '1010', side: 'asset' },
  { id: 'ATM_CASH', code: '1011', side: 'asset' },
  { id: 'TILL_CASH', code: '1012', side: 'asset' },
  { id: 'OVERDRAFT_RECV', code: '1310', side: 'asset' },
  { id: 'LOAN_PRINCIPAL', code: '1320', side: 'asset' },
  { id: 'LOAN_LOSS_ALLOWANCE', code: '1290', side: 'asset' },
  { id: 'INTERBANK_SETTLEMENT', code: '1510', side: 'asset' },
  { id: 'NOSTRO', code: '1520', side: 'asset' },
  { id: 'ATM_SUSPENSE', code: '1910', side: 'asset' },
  { id: 'DISPUTE_ACCOUNT', code: '1920', side: 'asset' },
  { id: 'CASA', code: '2011', side: 'liability' },
  { id: 'TERM_DEPOSIT', code: '2021', side: 'liability' },
  { id: 'TD_PLEDGED', code: '2022', side: 'liability' },
  { id: 'WALLET_SETTLEMENT', code: '2410', side: 'liability' },
  { id: 'LOYALTY_LIABILITY', code: '2450', side: 'liability' },
  { id: 'BILLER_PAYABLE', code: '2460', side: 'liability' },
  { id: 'CLEARING_SUSPENSE', code: '2912', side: 'liability' },
  { id: 'FROZEN_ASSETS', code: '2930', side: 'liability' },
  { id: 'GOV_ASSET_RECOVERY', code: '2110', side: 'liability' },
  { id: 'EQUITY', code: '3010', side: 'equity' },
  { id: 'INTEREST_INCOME', code: '4110', side: 'income' },
  { id: 'FEE_INCOME', code: '4510', side: 'income' },
  { id: 'PENALTY_INCOME', code: '4520', side: 'income' },
  { id: 'LATE_PENALTY_INCOME', code: '4530', side: 'income' },
  { id: 'WIRE_FEE_INCOME', code: '4540', side: 'income' },
  { id: 'INTEREST_EXPENSE', code: '5110', side: 'expense' },
  { id: 'REWARDS_EXPENSE', code: '5410', side: 'expense' },
  { id: 'SWITCH_FEE_EXPENSE', code: '5420', side: 'expense' },
  { id: 'REGULATORY_PENALTY_EXPENSE', code: '5510', side: 'expense' },
  { id: 'PROVISION_EXPENSE', code: '5610', side: 'expense' },
] as const satisfies readonly { id: string; code: string; side: 'asset' | 'liability' | 'equity' | 'income' | 'expense' }[];

export type GlAccount = (typeof GL_ACCOUNTS)[number]['id'];
export type GlSide = (typeof GL_ACCOUNTS)[number]['side'];
export const GL_IDS: readonly GlAccount[] = GL_ACCOUNTS.map((a) => a.id);
export const GL_CODE = Object.fromEntries(GL_ACCOUNTS.map((a) => [a.id, a.code])) as Readonly<Record<GlAccount, string>>;
export const GL_SIDE = Object.fromEntries(GL_ACCOUNTS.map((a) => [a.id, a.side])) as Readonly<Record<GlAccount, GlSide>>;

/** One line of a journal: a debit or a credit, in cents. */
export interface LedgerLine {
  gl: GlAccount;
  dr: number;
  cr: number;
}

export interface JournalEntry {
  caseId: string;
  role: StaffRoleId;
  /** The case's scene: a retail scenario, a drill of the 28-task matrix or a live-queue review. */
  scene: StaffCase['scene'];
  decision: StaffDecision;
  statusCode: string;
  /** Debits equal credits; empty for a memo-only decision. */
  lines: LedgerLine[];
  /** The channel/desk that posted it and when (ISO 8601); stamped by the store, absent on journals saved before Phase 11. */
  station?: StationId;
  at?: string;
}

export interface RetailLedger {
  /** Debit-positive balance per account, in cents. Always sums to zero. */
  balances: Record<GlAccount, number>;
  /** The latest journals, newest first (at most RETAIL_JOURNAL_CAP). */
  journal: JournalEntry[];
  /** Journals posted since the opening balances. */
  posted: number;
  /** Face value of every posted transaction that settled (not parked in suspense, frozen, pledged or disputed). */
  settledVolume: number;
}

export const RETAIL_JOURNAL_CAP = 25;

/** The teller's till float, its floor and its ceiling: below the floor the vault tops it up to the float; above the ceiling the surplus goes back to the vault. */
export const TILL_FLOAT_CENTS = 2_500_000;
export const TILL_FLOOR_CENTS = 1_000_000;
export const TILL_CEILING_CENTS = 4_000_000;
/** The branch vault's opening cash ($50,000). */
export const VAULT_OPENING_CENTS = 5_000_000;

const OPENING_POSITIONS: Partial<Record<GlAccount, number>> = {
  VAULT_CASH: VAULT_OPENING_CENTS,
  ATM_CASH: 1_800_000,
  TILL_CASH: TILL_FLOAT_CENTS,
  OVERDRAFT_RECV: 4_000_000,
  LOAN_PRINCIPAL: 60_000_000,
  INTERBANK_SETTLEMENT: 40_000_000,
  NOSTRO: NOSTRO_OPENING_CENTS,
  CASA: -70_000_000,
  TERM_DEPOSIT: -25_000_000,
  TD_PLEDGED: -6_000_000,
  WALLET_SETTLEMENT: -2_000_000,
  LOYALTY_LIABILITY: -800_000,
};

/** The opening trial balance: capital & reserves is the balancing figure, so the books start square. */
export const OPENING_BALANCES: Readonly<Record<GlAccount, number>> = (() => {
  const b = Object.fromEntries(GL_IDS.map((gl) => [gl, OPENING_POSITIONS[gl] ?? 0])) as Record<GlAccount, number>;
  b.EQUITY = -GL_IDS.reduce((sum, gl) => sum + b[gl], 0);
  return b;
})();

export const openingLedger = (): RetailLedger => ({ balances: { ...OPENING_BALANCES }, journal: [], posted: 0, settledVolume: 0 });

/** True when a journal's debits equal its credits. */
export const journalBalanced = (lines: readonly LedgerLine[]): boolean => lines.reduce((s, l) => s + l.dr - l.cr, 0) === 0;

/** A balance the way a statement prints it: debit-natural for assets and expenses, credit-natural for the rest. */
export const naturalBalance = (gl: GlAccount, debitPositive: number): number => (GL_SIDE[gl] === 'asset' || GL_SIDE[gl] === 'expense' ? debitPositive : 0 - debitPositive);

/** Accounts that hold funds pending a decision: suspense, frozen, pledged and disputed money has not settled. */
export const HOLDING_ACCOUNTS: readonly GlAccount[] = ['ATM_SUSPENSE', 'CLEARING_SUSPENSE', 'DISPUTE_ACCOUNT', 'FROZEN_ASSETS', 'TD_PLEDGED'];
const CUSTOMER_ACCOUNTS: readonly GlAccount[] = ['CASA', 'OVERDRAFT_RECV'];

/** What a journal adds to the settled volume: nothing when it routes funds into a holding account. */
export function settledCents(lines: readonly LedgerLine[]): number {
  if (lines.some((l) => HOLDING_ACCOUNTS.includes(l.gl) && naturalBalance(l.gl, l.dr - l.cr) > 0)) return 0;
  const customer = lines.filter((l) => CUSTOMER_ACCOUNTS.includes(l.gl));
  const sum = (ls: readonly LedgerLine[], side: 'dr' | 'cr'): number => ls.reduce((s, l) => s + l[side], 0);
  return customer.length ? Math.max(sum(customer, 'dr'), sum(customer, 'cr')) : sum(lines, 'dr');
}

/** Posts a journal: every line moves its account, the journal heads the list and its settled amount joins the volume. */
export function postJournal(l: RetailLedger, entry: JournalEntry): RetailLedger {
  const balances = { ...l.balances };
  for (const line of entry.lines) balances[line.gl] += line.dr - line.cr;
  return { balances, journal: [entry, ...l.journal].slice(0, RETAIL_JOURNAL_CAP), posted: l.posted + 1, settledVolume: l.settledVolume + settledCents(entry.lines) };
}

export interface LedgerSummary {
  assets: number;
  liabilities: number;
  equity: number;
  income: number;
  expense: number;
  /** Income less expenses since the opening balances. */
  net: number;
  /** Assets = liabilities + equity + net (true whenever every journal balanced). */
  balanced: boolean;
}

export function ledgerSummary(l: RetailLedger): LedgerSummary {
  const total = (side: GlSide): number => GL_IDS.filter((gl) => GL_SIDE[gl] === side).reduce((s, gl) => s + naturalBalance(gl, l.balances[gl]), 0);
  const [assets, liabilities, equity, income, expense] = [total('asset'), total('liability'), total('equity'), total('income'), total('expense')];
  const net = income - expense;
  return { assets, liabilities, equity, income, expense, net, balanced: assets === liabilities + equity + net };
}

/** The figures the workspace keeps in view: the retail four, and the header card's four. */
export interface RetailKpis {
  feeIncome: number;
  atmCash: number;
  /** ATM jams plus interbank reconciliation breaks. */
  suspense: number;
  overdraft: number;
  /** The ATM fleet's cassette cash is under ATM_FLEET_LOW_CENTS. */
  atmLow: boolean;
  settledVolume: number;
  /** Fee, penalty and interest revenue less interest, rewards and switch expenses. */
  netRevenue: number;
  /** Emergency-frozen funds plus pledged collateral savings. */
  frozenCollateral: number;
}

/** Below this, the ATM fleet's cassette cash needs a replenishment run. */
export const ATM_FLEET_LOW_CENTS = 1_000_000;

export function retailKpis(l: RetailLedger): RetailKpis {
  const nat = (gl: GlAccount): number => naturalBalance(gl, l.balances[gl]);
  return {
    feeIncome: nat('FEE_INCOME') + nat('PENALTY_INCOME'),
    atmCash: nat('ATM_CASH'),
    suspense: nat('ATM_SUSPENSE') + nat('CLEARING_SUSPENSE'),
    overdraft: nat('OVERDRAFT_RECV'),
    atmLow: nat('ATM_CASH') < ATM_FLEET_LOW_CENTS,
    settledVolume: l.settledVolume,
    netRevenue: ledgerSummary(l).net,
    frozenCollateral: nat('FROZEN_ASSETS') + nat('TD_PLEDGED'),
  };
}

/** Wire fee the cross-border desk charges on an outward remittance. */
export const WIRE_FEE_CENTS = 2_500;

/** The FX markup on a remittance: the bank's spread over mid-market (the case's fxSpread, in basis points; 40 when it has none). */
export const DEFAULT_FX_SPREAD_BPS = 40;
export const fxSpreadBps = (c: Pick<StaffCase, 'fields'>): number => {
  const f = c.fields.find((x) => x.key === 'fxSpread');
  const bps = f && f.value.t === 'code' ? Number.parseInt(f.value.v, 10) : NaN;
  return Number.isFinite(bps) ? bps : DEFAULT_FX_SPREAD_BPS;
};
export const fxMarkupCents = (amountCents: number, bps: number): number => Math.round((amountCents * bps) / 10_000);

/** What a remittance costs the customer: the principal, the wire fee and the FX markup (both of the bank's take go to 4540). */
export const remittanceBreakdown = (c: Pick<StaffCase, 'fields' | 'amountCents'>): { principal: number; wireFee: number; markup: number; total: number } => {
  const markup = fxMarkupCents(c.amountCents, fxSpreadBps(c));
  return { principal: c.amountCents, wireFee: WIRE_FEE_CENTS, markup, total: c.amountCents + WIRE_FEE_CENTS + markup };
};

/** The instant virtual prepaid card a verified eKYC onboarding issues: its first load, onto the e-wallet / prepaid settlement account (2410). */
export const PREPAID_CARD_LOAD_CENTS = 5_000;

/** AML holds that freeze the funds (sanctions matches and funnel accounts) rather than just returning the payment. */
const amlFreezes = (c: StaffCase): boolean => c.drill === 1 || c.drill === 3 || c.scene === 'aml_OFAC';

/** The journal a 28-task-matrix or live-queue decision posts. */
export function caseJournalLines(c: StaffCase, decision: StaffDecision): LedgerLine[] {
  // eKYC verified: an instant virtual prepaid card, funded by the customer's transfer in (Dr 1510 / Cr 2410). Refused: nothing moves.
  if (c.role === 'ekyc') return decision === 'APPROVE' ? journal([['INTERBANK_SETTLEMENT', PREPAID_CARD_LOAD_CENTS]], [['WALLET_SETTLEMENT', PREPAID_CARD_LOAD_CENTS]]) : [];
  const a = c.amountCents;
  if (a <= 0) return [];
  if (decision === 'REJECT') return c.role === 'aml' && amlFreezes(c) ? journal([['CASA', a]], [['FROZEN_ASSETS', a]]) : [];
  switch (c.role) {
    case 'cashier': {
      const cashIn = c.fields.some((f) => f.key === 'direction' && f.value.t === 'msg' && f.value.key === 'cashIn');
      return cashIn ? journal([['TILL_CASH', a]], [['CASA', a]]) : journal([['CASA', a]], [['TILL_CASH', a]]);
    }
    case 'swift': {
      // The customer pays the principal, the wire fee and the FX markup; the principal leaves through the Nostro, the bank keeps the rest (4540).
      const fx = remittanceBreakdown(c);
      return journal(
        [['CASA', fx.total]],
        [
          ['NOSTRO', fx.principal],
          ['WIRE_FEE_INCOME', fx.wireFee + fx.markup],
        ],
      );
    }
    case 'dispute':
      return journal([['DISPUTE_ACCOUNT', a]], [['CASA', a]]);
    case 'aml':
    case 'fds':
      return journal([['CASA', a]], [['INTERBANK_SETTLEMENT', a]]);
    case 'bnpl':
      return journal([['LOAN_PRINCIPAL', a]], [['INTERBANK_SETTLEMENT', a]]);
  }
}

/** The cash movement between the branch vault (1010) and the teller's till (1012) the till's balance calls for now, or null: a top-up when it has run low, a sweep when it holds too much. */
export function vaultReplenishment(l: RetailLedger, at?: string): JournalEntry | null {
  const till = l.balances.TILL_CASH;
  if (till < TILL_FLOOR_CENTS) {
    const amount = Math.min(TILL_FLOAT_CENTS - till, Math.max(0, l.balances.VAULT_CASH));
    if (amount <= 0) return null;
    return { caseId: `VAULT-${l.posted + 1}`, role: 'cashier', scene: 'cashier_OUT', decision: 'APPROVE', statusCode: 'VAULT_TO_TILL', lines: journal([['TILL_CASH', amount]], [['VAULT_CASH', amount]]), station: 'TELLER_CASH', ...(at ? { at } : {}) };
  }
  if (till > TILL_CEILING_CENTS) {
    const amount = till - TILL_FLOAT_CENTS;
    return { caseId: `VAULT-${l.posted + 1}`, role: 'cashier', scene: 'cashier_IN', decision: 'APPROVE', statusCode: 'TILL_TO_VAULT', lines: journal([['VAULT_CASH', amount]], [['TILL_CASH', amount]]), station: 'TELLER_CASH', ...(at ? { at } : {}) };
  }
  return null;
}

/** The journal entry of a decided case outside the retail queue. */
export const caseJournal = (c: StaffCase, decision: StaffDecision, statusCode: string): JournalEntry => ({ caseId: c.id, role: c.role, scene: c.scene, decision, statusCode, lines: caseJournalLines(c, decision) });

/** The retail scenarios, and the desk that works each one. */
export const RETAIL_SCENARIOS = [
  'ANNUAL_FEE',
  'AUTO_PAY',
  'CASHBACK',
  'POINTS_WAIVER',
  'ATM_INTERBANK',
  'ATM_LOW_CASH',
  'ATM_JAM',
  'CARD_CAPTURED',
  'DEBT_WATERFALL',
  'TD_EARLY_BREAK',
  'TD_PLEDGE',
  'TD_LIQUIDATION',
  'WALLET',
  'RTP_QR',
  'CLEARING_BREAK',
  'NPL_PROVISION',
  'FX_VOLATILITY',
  'EKYC_RISK',
] as const;
export type RetailScenarioId = (typeof RETAIL_SCENARIOS)[number];
export type RetailScene = `retail_${RetailScenarioId}`;
export const RETAIL_SCENES: readonly RetailScene[] = RETAIL_SCENARIOS.map((id) => `retail_${id}` as RetailScene);

export const RETAIL_DESK: Readonly<Record<StaffRoleId, readonly RetailScenarioId[]>> = {
  ekyc: ['ANNUAL_FEE', 'AUTO_PAY', 'EKYC_RISK'],
  fds: ['CASHBACK', 'POINTS_WAIVER'],
  cashier: ['ATM_LOW_CASH', 'TD_EARLY_BREAK'],
  dispute: ['ATM_JAM', 'CARD_CAPTURED'],
  swift: ['ATM_INTERBANK', 'CLEARING_BREAK', 'FX_VOLATILITY'],
  bnpl: ['DEBT_WATERFALL', 'TD_PLEDGE', 'TD_LIQUIDATION', 'NPL_PROVISION'],
  aml: ['WALLET', 'RTP_QR'],
};

/** Thresholds and tariffs the retail SOPs quote (analystWorkspace.messages.ts `retail_<id>_sop*`). */
export const RETAIL_SOP = {
  nsfFeeCents: 3_500,
  /** Loyalty points per dollar of fee waived (1 point = 1 cent). */
  pointsPerDollar: 100,
  cashbackRatePct: { '5541': 1, '5411': 2, '5812': 3, '4511': 4, '5732': 5 },
  cashbackExcludedMcc: ['6011', '6051', '4829'],
  /** What the bank charges the customer (flat + % of the amount) and pays the switch, per ATM network. */
  atmFee: {
    napas: { flatCents: 110, pct: 0.1, switchCents: 50 },
    intl: { flatCents: 350, pct: 1, switchCents: 150 },
  },
  /** An ATM whose cassette would fall below this after a dispense raises a low-cash alert. */
  lowCassetteCents: 500_000,
  /** Early break: interest is recalculated at the demand-deposit rate. */
  demandRatePct: 0.1,
  tdMaxLtvPct: 90,
  /** Days past due at which a secured overdraft is in default. */
  defaultDpd: 90,
  walletDailyCapCents: 500_000,
  rtpLimitCents: 500_000,
  /** A SWIFT message is held for a re-quote when the live rate has moved more than this from the booked one (±%). */
  fxVolatilityPct: 2,
  /** eKYC risk profiling: a score at or above this is high risk (EDD), as is any PEP match or high-risk country. */
  highRiskScore: 70,
} as const;

/** The SBV's five debt groups (Circular 11/2021/TT-NHNN): from days past due, and the specific provision rate of each. */
export const NPL_GROUPS = [
  { group: 1, minDpd: 0, ratePct: 0 },
  { group: 2, minDpd: 10, ratePct: 5 },
  { group: 3, minDpd: 90, ratePct: 20 },
  { group: 4, minDpd: 180, ratePct: 50 },
  { group: 5, minDpd: 360, ratePct: 100 },
] as const;
export type NplGroup = (typeof NPL_GROUPS)[number];
/** The debt group of a loan `dpd` days past due. */
export const nplGroupOf = (dpd: number): NplGroup => [...NPL_GROUPS].reverse().find((g) => dpd >= g.minDpd)!;
/** The specific provision on a loan in a group (no eligible collateral deducted). */
export const provisionCents = (outstanding: number, g: NplGroup): number => Math.round((outstanding * g.ratePct) / 100);

/** Share of retail cases that breach their scenario's SOP. */
export const RETAIL_HIT_RATE = 0.5;

export interface RetailCaseData {
  id: RetailScenarioId;
  /** Status codes for an approval and a rejection. */
  codes: readonly [string, string];
  /** The journal each decision posts. */
  approve: LedgerLine[];
  reject: LedgerLine[];
}

type Leg = readonly [GlAccount, number];
/** A journal from its debit legs and credit legs; zero legs are dropped. */
const journal = (debits: readonly Leg[], credits: readonly Leg[]): LedgerLine[] => [
  ...debits.filter(([, c]) => c > 0).map(([gl, c]) => ({ gl, dr: c, cr: 0 })),
  ...credits.filter(([, c]) => c > 0).map(([gl, c]) => ({ gl, dr: 0, cr: c })),
];

/** Debiting a customer: what the balance covers comes off deposits, the rest is lent on the overdraft. */
const customerDebit = (balance: number, cents: number): Leg[] => {
  const fromDeposit = Math.max(0, Math.min(balance, cents));
  return [
    ['CASA', fromDeposit],
    ['OVERDRAFT_RECV', cents - fromDeposit],
  ];
};

const MCCS_EARNING = ['5541', '5411', '5812', '4511', '5732'] as const;
const QR_MERCHANTS = ['HIGHLANDS COFFEE', 'CIRCLE K', 'PHUC LONG TEA', 'WINMART'] as const;
const MULE_NAMES = ['NGUYEN VAN AN', 'TRAN THI BICH', 'LE MINH TUAN'] as const;

interface RetailDrill extends Drill {
  data: Omit<RetailCaseData, 'id'>;
}

/** One retail case. `hit` = the case breaches its SOP's red flag, which is always a REJECT. */
function retailDrill(scenario: RetailScenarioId, id: string, hit: boolean): RetailDrill {
  const b = (purpose: string, lo: number, hi: number): number => between(id, purpose, lo, hi);
  const S = RETAIL_SOP;
  const expected: StaffDecision = hit ? 'REJECT' : 'APPROVE';
  switch (scenario) {
    case 'ANNUAL_FEE': {
      const card = unit(id, 'kind') < 0.65;
      const fee = card ? pickOf(id, 'fee', [9_000, 15_000]) : 1_100;
      const limit = b('od', 50, 200) * 1_000;
      const balance = hit ? -(limit - b('room', 0, fee / 100 - 1) * 100) : unit(id, 'neg') < 0.5 ? b('bal', fee / 100 + 20, 3_000) * 100 : 0 - b('used', 0, Math.floor((limit - fee) / 100) - 1) * 100;
      const headroom = balance + limit;
      return {
        amountCents: fee,
        expected,
        fields: [
          { key: 'feeType', value: msg(card ? 'feeCardAnnual' : 'feeAccountMaintenance') },
          { key: 'accountBalance', value: cash(balance) },
          { key: 'overdraftLimit', value: cash(limit) },
          { key: 'headroom', value: cash(headroom), flag: headroom < fee },
        ],
        data: { codes: ['FEE_POSTED', 'FEE_HELD_OVER_LIMIT'], approve: journal(customerDebit(balance, fee), [['FEE_INCOME', fee]]), reject: [] },
      };
    }
    case 'AUTO_PAY': {
      const biller = pickOf(id, 'biller', ['billerElectric', 'billerWater', 'billerInternet'] as const);
      const bill = (biller === 'billerElectric' ? b('bill', 60, 320) : biller === 'billerWater' ? b('bill', 20, 90) : b('bill', 40, 110)) * 100;
      const balance = hit ? b('bal', 0, bill / 100 - 1) * 100 : b('bal', bill / 100 + 10, 4_000) * 100;
      return {
        amountCents: bill,
        expected,
        fields: [
          { key: 'biller', value: msg(biller) },
          { key: 'accountBalance', value: cash(balance), flag: balance < bill },
          { key: 'nsfFee', value: cash(S.nsfFeeCents) },
        ],
        data: {
          codes: ['DD_PAID', 'DD_RETURNED_NSF'],
          approve: journal([['CASA', bill]], [['BILLER_PAYABLE', bill]]),
          reject: journal(customerDebit(balance, S.nsfFeeCents), [['PENALTY_INCOME', S.nsfFeeCents]]),
        },
      };
    }
    case 'CASHBACK': {
      const excluded = hit && unit(id, 'why') < 0.6;
      const reversed = hit && !excluded;
      const mcc = excluded ? pickOf(id, 'mcc', S.cashbackExcludedMcc) : pickOf(id, 'mcc', MCCS_EARNING);
      // An excluded MCC still shows the 1% default the rewards engine proposed: spotting the MCC is the job.
      const rate = excluded ? 1 : S.cashbackRatePct[mcc as (typeof MCCS_EARNING)[number]];
      const amount = b('amt', 20, 1_500) * 100;
      const reward = Math.round((amount * rate) / 100);
      const points = unit(id, 'program') < 0.4;
      return {
        amountCents: amount,
        expected,
        fields: [
          { key: 'mcc', value: msg(`mcc${mcc}`), flag: excluded },
          { key: 'txnStatus', value: msg(reversed ? 'statusReversed' : 'statusSettled'), flag: reversed },
          { key: 'rewardRate', value: pct(rate) },
          points ? { key: 'proposedPoints', value: num(reward) } : { key: 'proposedCashback', value: cash(reward) },
        ],
        data: { codes: ['REWARD_CREDITED', 'REWARD_INELIGIBLE'], approve: journal([['REWARDS_EXPENSE', reward]], [[points ? 'LOYALTY_LIABILITY' : 'CASA', reward]]), reject: [] },
      };
    }
    case 'POINTS_WAIVER': {
      const fee = pickOf(id, 'fee', [9_000, 15_000]);
      const needed = Math.round((fee * S.pointsPerDollar) / 100);
      const points = hit ? b('pts', 0, needed - 500) : b('pts', needed, needed + 40_000);
      return {
        amountCents: fee,
        expected,
        fields: [
          { key: 'feeType', value: msg('feeCardAnnual') },
          { key: 'pointsBalance', value: num(points), flag: points < needed },
          { key: 'pointsNeeded', value: num(needed) },
        ],
        data: { codes: ['FEE_WAIVED_POINTS', 'FEE_CHARGED_NO_POINTS'], approve: journal([['LOYALTY_LIABILITY', fee]], [['FEE_INCOME', fee]]), reject: journal([['CASA', fee]], [['FEE_INCOME', fee]]) },
      };
    }
    case 'ATM_INTERBANK': {
      const intl = unit(id, 'net') < 0.4;
      const t = intl ? S.atmFee.intl : S.atmFee.napas;
      const amount = b('amt', 10, 50) * 1_000;
      const fee = atmFeeCents(intl ? 'intl' : 'napas', amount);
      const total = amount + fee;
      // The trap: the balance covers the cash but not the network fee on top.
      const balance = hit ? (unit(id, 'trap') < 0.6 ? amount + b('short', 0, fee - 1) : b('bal', 0, amount / 100 - 1) * 100) : total + b('spare', 0, 2_000) * 100;
      return {
        amountCents: amount,
        expected,
        fields: [
          { key: 'atmNetwork', value: msg(intl ? 'netIntl' : 'netNapas') },
          { key: 'networkFee', value: cash(fee) },
          { key: 'totalDebit', value: cash(total) },
          { key: 'accountBalance', value: cash(balance), flag: balance < total },
        ],
        data: {
          codes: ['ATM_INTERBANK_PAID', 'ATM_NSF_WITH_FEE'],
          approve: journal(
            [
              ['CASA', total],
              ['SWITCH_FEE_EXPENSE', t.switchCents],
            ],
            [
              ['INTERBANK_SETTLEMENT', amount + t.switchCents],
              ['FEE_INCOME', fee],
            ],
          ),
          reject: [],
        },
      };
    }
    case 'ATM_LOW_CASH': {
      const amount = b('amt', 10, 80) * 1_000;
      const low = S.lowCassetteCents;
      const cassette = hit ? b('cas', 0, amount / 1_000 - 1) * 1_000 : unit(id, 'low') < 0.5 ? amount + b('cas', 0, low / 1_000 - 1) * 1_000 : amount + low + b('cas', 0, 5_000) * 1_000;
      const after = cassette - amount;
      const alert = !hit && after < low;
      return {
        amountCents: amount,
        expected,
        fields: [
          { key: 'atmId', value: code(`ATM-${pickOf(id, 'site', ['HAN', 'SGN', 'DAD'])}-${String(b('n', 1, 48)).padStart(3, '0')}`) },
          { key: 'cassetteCash', value: cash(cassette), flag: hit },
          { key: 'cashAfter', value: cash(after), flag: hit, ...(alert ? { alert } : {}) },
          { key: 'lowCashThreshold', value: cash(low) },
        ],
        data: { codes: [alert ? 'ATM_DISPENSED_REPLENISH' : 'ATM_DISPENSED', 'ATM_CASSETTE_SHORT'], approve: journal([['CASA', amount]], [['ATM_CASH', amount]]), reject: [] },
      };
    }
    case 'ATM_JAM': {
      const amount = b('amt', 10, 50) * 1_000;
      return {
        amountCents: amount,
        expected,
        fields: [
          { key: 'atmFault', value: msg(pickOf(id, 'fault', ['faultCashJam', 'faultTimeout'])) },
          { key: 'ejStatus', value: msg(hit ? 'ejPresented' : 'ejRetracted'), flag: hit },
          { key: 'cashCountSurplus', value: cash(hit ? 0 : amount), flag: hit },
        ],
        data: { codes: ['ATM_SUSPENSE_REFUND', 'ATM_DISPENSE_CONFIRMED'], approve: journal([['ATM_SUSPENSE', amount]], [['CASA', amount]]), reject: [] },
      };
    }
    case 'CARD_CAPTURED': {
      const hot = hit && unit(id, 'why') < 0.5;
      const noId = hit && !hot;
      return {
        amountCents: 0,
        expected,
        fields: [
          { key: 'captureReason', value: msg(hot ? 'captureHotlist' : pickOf(id, 'reason', ['captureTimeout', 'captureHostDown', 'capturePinTries'])), flag: hot },
          { key: 'cardStatus', value: msg(hot ? 'cardHotlisted' : 'cardActive'), flag: hot },
          { key: 'idVerified', value: bool(!noId), flag: noId },
        ],
        // A captured card moves no money: the decision is logged as a memo.
        data: { codes: ['CARD_RETURNED', 'CARD_DESTROYED_REISSUE'], approve: [], reject: [] },
      };
    }
    case 'DEBT_WATERFALL': {
      const penalty = b('fee', 15, 60) * 100;
      const interest = b('int', 20, 250) * 100;
      const principal = b('prin', 500, 4_000) * 100;
      const pay = unit(id, 'part') < 0.25 ? penalty + b('part', 1, interest / 100 - 1) * 100 : penalty + interest + b('extra', 0, principal / 100 - 1) * 100;
      const right = waterfall(pay, penalty, interest, principal);
      // A misconfigured allocator pays principal first, then interest, and leaves the penalty for last.
      const p = Math.min(pay, principal);
      const i = Math.min(pay - p, interest);
      const proposed = hit ? { penalty: pay - p - i, interest: i, principal: p } : right;
      const post = (a: typeof right): LedgerLine[] =>
        journal(
          [['CASA', pay]],
          [
            ['LATE_PENALTY_INCOME', a.penalty],
            ['INTEREST_INCOME', a.interest],
            ['LOAN_PRINCIPAL', a.principal],
          ],
        );
      return {
        amountCents: pay,
        expected,
        fields: [
          { key: 'latePenaltyDue', value: cash(penalty) },
          { key: 'overdueInterestDue', value: cash(interest) },
          { key: 'principalDue', value: cash(principal) },
          { key: 'allocPenalty', value: cash(proposed.penalty), flag: proposed.penalty !== right.penalty },
          { key: 'allocInterest', value: cash(proposed.interest), flag: proposed.interest !== right.interest },
          { key: 'allocPrincipal', value: cash(proposed.principal), flag: proposed.principal !== right.principal },
        ],
        data: { codes: ['REPAYMENT_POSTED', 'WATERFALL_REALLOCATED'], approve: post(proposed), reject: post(right) },
      };
    }
    case 'TD_EARLY_BREAK': {
      const principal = b('p', 50, 500) * 10_000;
      const rate = pickOf(id, 'rate', [4.8, 5.2, 5.5, 6]);
      const days = b('days', 30, 330);
      const right = tdInterestCents(principal, S.demandRatePct, days);
      const paid = hit ? tdInterestCents(principal, rate, days) : right;
      const post = (interest: number): LedgerLine[] =>
        journal(
          [
            ['TERM_DEPOSIT', principal],
            ['INTEREST_EXPENSE', interest],
          ],
          [['CASA', principal + interest]],
        );
      return {
        amountCents: principal,
        expected,
        fields: [
          { key: 'contractRate', value: pct(rate) },
          { key: 'daysHeld', value: code(`${days} / 365 d`) },
          { key: 'appliedRate', value: pct(hit ? rate : S.demandRatePct), flag: hit },
          { key: 'payoutInterest', value: cash(paid), flag: hit },
        ],
        data: { codes: ['TD_BROKEN_DEMAND_RATE', 'TD_INTEREST_RECALCULATED'], approve: post(paid), reject: post(right) },
      };
    }
    case 'TD_PLEDGE': {
      const td = b('td', 50, 500) * 10_000;
      const ltv = hit ? b('ltv', S.tdMaxLtvPct + 1, 120) : b('ltv', 40, S.tdMaxLtvPct);
      return {
        amountCents: Math.round((td * ltv) / 100),
        expected,
        fields: [
          { key: 'tdBalance', value: cash(td) },
          { key: 'ltv', value: pct(ltv), flag: ltv > S.tdMaxLtvPct },
          { key: 'lienStatus', value: msg('lienNone') },
        ],
        data: { codes: ['TD_LIEN_MARKED', 'TD_LTV_EXCEEDED'], approve: journal([['TERM_DEPOSIT', td]], [['TD_PLEDGED', td]]), reject: [] },
      };
    }
    case 'TD_LIQUIDATION': {
      const owed = b('od', 20, 400) * 10_000;
      const td = owed + b('extra', 0, 300) * 10_000;
      const dpd = hit ? b('dpd', 5, S.defaultDpd - 1) : b('dpd', S.defaultDpd, 180);
      return {
        amountCents: owed,
        expected,
        fields: [
          { key: 'pledgedTd', value: cash(td) },
          { key: 'daysPastDue', value: num(dpd), flag: dpd < S.defaultDpd },
          { key: 'surplusToCustomer', value: cash(td - owed) },
        ],
        data: {
          codes: ['COLLATERAL_LIQUIDATED', 'LIEN_RETAINED'],
          approve: journal(
            [['TD_PLEDGED', td]],
            [
              ['OVERDRAFT_RECV', owed],
              ['CASA', td - owed],
            ],
          ),
          reject: [],
        },
      };
    }
    case 'WALLET': {
      const topUp = unit(id, 'dir') < 0.5;
      const amount = b('amt', 50, 2_000) * 100;
      const nameMismatch = hit && unit(id, 'why') < 0.5;
      const overCap = hit && !nameMismatch;
      const cap = S.walletDailyCapCents;
      const used = overCap ? cap - amount + b('over', 1, 500) * 100 : b('used', 0, (cap - amount) / 100) * 100;
      const headroom = cap - used;
      return {
        amountCents: amount,
        expected,
        fields: [
          { key: 'walletProvider', value: code(pickOf(id, 'wallet', ['PayPal', 'Apple Pay', 'Revolut'])) },
          { key: 'walletDirection', value: msg(topUp ? 'walletTopUp' : 'walletCashOut') },
          { key: 'linkedNameMatch', value: bool(!nameMismatch), flag: nameMismatch },
          { key: 'walletHeadroom', value: cash(headroom), flag: amount > headroom },
        ],
        data: { codes: ['WALLET_SETTLED', 'WALLET_BLOCKED'], approve: topUp ? journal([['CASA', amount]], [['WALLET_SETTLEMENT', amount]]) : journal([['WALLET_SETTLEMENT', amount]], [['CASA', amount]]), reject: [] },
      };
    }
    case 'RTP_QR': {
      const badCrc = hit && unit(id, 'why') < 0.4;
      const mismatch = hit && !badCrc && unit(id, 'why2') < 0.6;
      const overLimit = hit && !badCrc && !mismatch;
      const amount = overLimit ? S.rtpLimitCents + b('over', 1, 2_000) * 100 : b('amt', 5, 300) * 1_000;
      const merchant = pickOf(id, 'merchant', QR_MERCHANTS);
      return {
        amountCents: amount,
        expected,
        fields: [
          { key: 'qrMerchant', value: code(merchant) },
          { key: 'lookupName', value: code(mismatch ? pickOf(id, 'mule', MULE_NAMES) : merchant), flag: mismatch },
          { key: 'qrCrcValid', value: bool(!badCrc), flag: badCrc },
          { key: 'instantLimit', value: cash(S.rtpLimitCents), flag: overLimit },
        ],
        data: { codes: ['RTP_ACSC', 'RTP_REJECTED'], approve: journal([['CASA', amount]], [['INTERBANK_SETTLEMENT', amount]]), reject: [] },
      };
    }
    case 'NPL_PROVISION': {
      const outstanding = b('o', 500, 20_000) * 100;
      // Group 1 to 5 by days past due; a breach understates the group by one (an under-provisioned NPL).
      const dpd = pickOf(id, 'grp', hit ? [b('d2', 10, 89), b('d3', 90, 179), b('d4', 180, 359), b('d5', 360, 540)] : [b('d1', 0, 9), b('d2', 10, 89), b('d3', 90, 179), b('d4', 180, 359), b('d5', 360, 540)]);
      const right = nplGroupOf(dpd);
      const proposed = hit ? NPL_GROUPS[right.group - 2]! : right;
      const post = (g: NplGroup): LedgerLine[] => journal([['PROVISION_EXPENSE', provisionCents(outstanding, g)]], [['LOAN_LOSS_ALLOWANCE', provisionCents(outstanding, g)]]);
      return {
        amountCents: outstanding,
        expected,
        fields: [
          { key: 'loanOutstanding', value: cash(outstanding) },
          { key: 'daysPastDue', value: num(dpd) },
          { key: 'debtGroup', value: msg(`nplGroup${proposed.group}`), flag: hit },
          { key: 'provisionRate', value: pct(proposed.ratePct), flag: hit },
          { key: 'proposedProvision', value: cash(provisionCents(outstanding, proposed)), flag: hit },
        ],
        data: { codes: ['NPL_PROVISION_BOOKED', 'NPL_RECLASSIFIED'], approve: post(proposed), reject: post(right) },
      };
    }
    case 'FX_VOLATILITY': {
      const amount = b('amt', 50, 1_500) * 1_000;
      const booked = b('rate', 25_200, 25_600);
      // Basis points of movement since the rate was booked: over ±2% the message is held for a re-quote.
      const moveBp = (unit(id, 'sign') < 0.5 ? -1 : 1) * (hit ? b('mv', 210, 450) : b('mv', 0, 190));
      const live = Math.round(booked * (1 + moveBp / 10_000));
      return {
        amountCents: amount,
        expected,
        fields: [
          { key: 'currencyPair', value: code('USD/VND') },
          { key: 'bookedRate', value: num(booked) },
          { key: 'liveRate', value: num(live) },
          { key: 'rateMove', value: pct(moveBp / 100), flag: hit },
          { key: 'remitAmount', value: cash(amount) },
        ],
        data: { codes: ['FX_SWIFT_RELEASED', 'FX_HELD_VOLATILITY'], approve: journal([['CASA', amount]], [['NOSTRO', amount]]), reject: [] },
      };
    }
    case 'EKYC_RISK': {
      // High risk if a PEP, a high-risk country or a score of 70+; a breach proposes a lower tier anyway.
      const why = unit(id, 'why');
      const pep = hit ? why < 0.35 : false;
      const country = hit ? why >= 0.35 && why < 0.65 : false;
      const score = hit && !pep && !country ? b('s', S.highRiskScore, 95) : b('s', 10, S.highRiskScore - 1);
      const high = pep || country || score >= S.highRiskScore;
      const proposed = hit ? pickOf(id, 'tier', ['tierLow', 'tierMedium']) : score >= 40 ? 'tierMedium' : 'tierLow';
      return {
        amountCents: b('vol', 5, 400) * 10_000,
        expected,
        fields: [
          { key: 'occupation', value: msg(pickOf(id, 'occ', ['occStudent', 'occOffice', 'occTrader', 'occCivil'])) },
          { key: 'pepScreening', value: msg(pep ? 'pepMatch' : 'pepNone'), flag: pep },
          { key: 'countryRisk', value: msg(country ? 'countryHigh' : 'countryStandard'), flag: country },
          { key: 'riskScore', value: num(score), flag: high && !pep && !country },
          { key: 'proposedTier', value: msg(proposed), flag: hit },
        ],
        // Risk profiling moves no money: the decision is logged as a memo.
        data: { codes: ['RISK_TIER_ACCEPTED', 'RISK_TIER_ESCALATED_EDD'], approve: [], reject: [] },
      };
    }
    case 'CLEARING_BREAK': {
      const amount = b('amt', 20, 900) * 1_000;
      return {
        amountCents: amount,
        expected,
        fields: [
          { key: 'coreStatus', value: msg('coreDebited') },
          { key: 'networkStatus', value: code(hit ? 'pacs.002 ACSC' : pickOf(id, 'net', ['pacs.002 RJCT', 'TIMEOUT · no pacs.002'])), flag: hit },
          { key: 'inSettlementFile', value: bool(hit), flag: hit },
          { key: 'eodDifference', value: cash(hit ? 0 : amount) },
        ],
        data: { codes: ['CLEARING_SUSPENSE_PARKED', 'CLEARING_MATCHED'], approve: journal([['INTERBANK_SETTLEMENT', amount]], [['CLEARING_SUSPENSE', amount]]), reject: [] },
      };
    }
  }
}

/** The customer's ATM fee on a network: flat plus a share of the amount. */
export function atmFeeCents(network: keyof typeof RETAIL_SOP.atmFee, amountCents: number): number {
  const t = RETAIL_SOP.atmFee[network];
  return t.flatCents + Math.round((amountCents * t.pct) / 100);
}

/** Simple interest on a term deposit for `days` of a 365-day year. */
export const tdInterestCents = (principalCents: number, ratePct: number, days: number): number => Math.round((principalCents * ratePct * days) / (100 * 365));

/** The debt-recovery waterfall: late penalty fees first, then overdue interest, then principal. */
export function waterfall(pay: number, penalty: number, interest: number, principal: number): { penalty: number; interest: number; principal: number } {
  const f = Math.min(pay, penalty);
  const i = Math.min(pay - f, interest);
  return { penalty: f, interest: i, principal: Math.min(pay - f - i, principal) };
}

/** One case of a desk's retail queue, stable per role and sequence number. */
export function buildRetailCase(role: StaffRoleId, seq: number): StaffCase {
  const id = `RT-${role.toUpperCase()}-${String(seq + 1).padStart(3, '0')}`;
  const scenario = pickOf(id, 'scenario', RETAIL_DESK[role]);
  const d = retailDrill(scenario, id, unit(id, 'hit') < RETAIL_HIT_RATE);
  return {
    id,
    station: ROLE_STATION[role],
    role,
    scenario: '',
    amountCents: d.amountCents,
    waitedMin: between(id, 'wait', 0, 6),
    fields: d.fields,
    scene: `retail_${scenario}`,
    retail: { id: scenario, ...d.data },
    expected: d.expected,
  };
}

function gradeRetailCase(c: StaffCase, r: RetailCaseData, decision: StaffDecision): StaffDecisionResult {
  const statusCode = decision === 'APPROVE' ? r.codes[0] : r.codes[1];
  return {
    ok: true,
    packetId: c.id,
    decision,
    expected: c.expected,
    correct: decision === c.expected,
    statusCode,
    journal: { caseId: c.id, role: c.role, scene: c.scene, decision, statusCode, lines: decision === 'APPROVE' ? r.approve : r.reject },
  };
}

// Emergency Crisis Queue: Incident Mode as its own queue

/** With Incident Mode on, a desk stops working its routine task and works an emergency queue instead. */

/** Every crisis a desk can face: the four bank-wide incidents and its own three. Over the seven desks that is all 25. */
export const crisisPool = (role: StaffRoleId): readonly IncidentId[] => [...GLOBAL_INCIDENTS, ...DESK_INCIDENTS[role]];

/** The crisis a shift in the emergency queue opens with: always one, picked at random from the desk's pool. */
export function rollCrisis(role: StaffRoleId, rand: () => number = Math.random, previous: IncidentId | null = null): IncidentId {
  const pool = crisisPool(role);
  // A new shift never repeats the crisis that just ended, so the queue keeps moving through the pool.
  const fresh = pool.length > 1 && previous ? pool.filter((id) => id !== previous) : pool;
  return fresh[Math.min(fresh.length - 1, Math.floor(rand() * fresh.length))]!;
}

/** The cases the emergency queue serves under `incident`: the drill a desk incident floods, or all drills for a bank-wide one. */
export const crisisTask = (incident: IncidentId): StaffTaskNo => (incident in INCIDENT_DRILL ? INCIDENT_DRILL[incident as DeskIncidentId] : RANDOM_TASK);

/** The task a desk is actually working: its routine task, or the crisis queue's while Incident Mode runs one. */
export const workingTask = (task: StaffTaskNo, incidentMode: boolean, incident: IncidentId | null | undefined): StaffTaskNo => (incidentMode && incident ? crisisTask(incident) : task);

/** How many cases one crisis lasts in the emergency queue: the presets of the batch picker, and the bounds of a custom size. */
export const CRISIS_BATCHES = [3, 5, 10] as const;
export const CRISIS_BATCH = { default: SHIFT_TARGET.reviews, min: 1, max: 50 } as const;
export const clampCrisisBatch = (n: number): number => (Number.isFinite(n) ? Math.min(CRISIS_BATCH.max, Math.max(CRISIS_BATCH.min, Math.round(n))) : CRISIS_BATCH.default);

/** The mixed crisis stream: every case brings a different crisis. Switched on explicitly, or by a batch of one case. */
export const isCrisisStream = (batch: number, stream: boolean): boolean => stream || clampCrisisBatch(batch) === 1;

/** Whether the crisis that has just booked a decision (`a`, already advanced) is over, so the next case opens a new one. */
export const crisisOver = (a: ActiveIncident, batch: number, stream: boolean): boolean => isCrisisStream(batch, stream) || a.reviews >= clampCrisisBatch(batch);

/** Cases left in the running crisis, this one included. */
export const crisisCasesLeft = (a: ActiveIncident, batch: number): number => Math.max(1, clampCrisisBatch(batch) - a.reviews);

/** Bank-wide outages during which a payment cannot be confirmed with the other bank, so it waits in suspense. */
const UNCONFIRMED: ReadonlySet<IncidentId> = new Set<IncidentId>(['NETWORK_LATENCY', 'POWER_GRID_FAILOVER', 'CORRUPTED_PAYLOAD']);
/** Desks whose refusal during a crisis holds the customer's money instead of simply not moving it. */
const HOLD_ON_REJECT: ReadonlySet<StaffRoleId> = new Set<StaffRoleId>(['aml', 'fds', 'swift']);

/** A crisis decision's journal: the routine posting, re-routed to the risk and holding accounts. */
export function crisisJournalLines(c: StaffCase, decision: StaffDecision, incident: IncidentId): LedgerLine[] {
  const a = c.amountCents;
  if (a <= 0) return [];
  if (decision === 'REJECT') return HOLD_ON_REJECT.has(c.role) ? journal([['CASA', a]], [['FROZEN_ASSETS', a]]) : caseJournalLines(c, decision);
  const lines = caseJournalLines(c, decision);
  if (!UNCONFIRMED.has(incident)) return lines;
  return lines.map((l) => (l.cr && (l.gl === 'INTERBANK_SETTLEMENT' || l.gl === 'NOSTRO') ? { ...l, gl: 'CLEARING_SUSPENSE' } : l));
}
