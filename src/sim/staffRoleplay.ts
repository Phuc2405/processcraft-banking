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

export interface StaffCase {
  id: string;
  station: StationId;
  role: StaffRoleId;
  /** The scenario label in English (localizeScenarioText at display). */
  scenario: string;
  amountCents: number;
  waitedMin: number;
  fields: StaffField[];
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
  return { id: p.id, station: ROLE_STATION[role], role, scenario: p.scenario, amountCents: p.amountCents, waitedMin, fields: built.fields, expected: built.expected };
}

function fieldsFor(role: StaffRoleId, p: Packet, stop: Stop, ctx: StaffDeskContext, ext: ExtendedContext | undefined): { fields: StaffField[]; expected: StaffDecision } | null {
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
        expected: c.verdict === 'VALID' ? 'APPROVE' : 'REJECT',
        fields: [
          { key: 'fxRate', value: { t: 'code', v: sw ? `1 ${sw.currency} = ${(sw.fxRate).toFixed(4)} AUD` : c.currency } },
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
