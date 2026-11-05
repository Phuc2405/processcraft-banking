/**
 * Straight-Through Processing: the rules that decide whether a case posts with no human touch, falls back to a desk, or is
 * fast-failed at the gate. Pure functions (Strategy pattern: one strategy per product), shared by the live bank, the retail
 * demos, the STP drawer, the roleplay desks and the tests.
 */

import type { Localized } from '../i18n/localeCore';
import type { BnplContext } from '../types/processLearning';
import { CTR_THRESHOLD_CENTS } from './amlEngine';
import { DTI_LIMIT_PCT, type DebtGroup } from './creditEngine';
import { hashSeed } from './prng';
import type { OpsActionId } from './retailOps';
import type { PlaceId } from './topology';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

export interface StpConfig {
  /** The bank-wide switch: off sends every case to its desk. */
  enabled: boolean;
  /** BNPL / retail credit: the largest amount auto-approved, in cents. */
  bnplMaxCents: number;
  /** BNPL / retail credit: the highest DTI auto-approved, in percent (inclusive). */
  maxDtiPct: number;
  termDeposit: boolean;
  cardFees: boolean;
  kiosk: boolean;
}

export const DEFAULT_STP: StpConfig = { enabled: true, bnplMaxCents: 50_000, maxDtiPct: 23, termDeposit: true, cardFees: true, kiosk: true };

export const STP_LIMITS = {
  bnplMaxCents: { min: 10_000, max: 200_000, step: 5_000 },
  maxDtiPct: { min: 15, max: 35, step: 1 },
  /** Term deposits roll over or pay out by STP below this. */
  termDepositMaxCents: 5_000_000,
  /** Cash below the CTR line goes to the Smart Kiosk. */
  kioskMaxCents: CTR_THRESHOLD_CENTS,
  /** Spend in the last 12 months that earns a waived annual fee. */
  premiumSpendCents: 1_000_000,
} as const;

const clampTo = (v: unknown, { min, max, step }: { min: number; max: number; step: number }, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v / step) * step)) : fallback;

/** Any partial or stale config (localStorage, a test) made valid. */
export function clampStp(input: Partial<StpConfig> | null | undefined): StpConfig {
  const i = input ?? {};
  const flag = (k: 'enabled' | 'termDeposit' | 'cardFees' | 'kiosk'): boolean => (typeof i[k] === 'boolean' ? i[k] : DEFAULT_STP[k]);
  return {
    enabled: flag('enabled'),
    bnplMaxCents: clampTo(i.bnplMaxCents, STP_LIMITS.bnplMaxCents, DEFAULT_STP.bnplMaxCents),
    maxDtiPct: clampTo(i.maxDtiPct, STP_LIMITS.maxDtiPct, DEFAULT_STP.maxDtiPct),
    termDeposit: flag('termDeposit'),
    cardFees: flag('cardFees'),
    kiosk: flag('kiosk'),
  };
}

export const stpEqual = (a: StpConfig, b: StpConfig): boolean => (Object.keys(a) as (keyof StpConfig)[]).every((k) => a[k] === b[k]);

// Cases and verdicts

export type StpProduct = 'BNPL' | 'TERM_DEPOSIT' | 'CARD_FEE' | 'KIOSK_CASH';
export type EkycStatus = 'PASS' | 'BIOMETRIC_AUTH_FAILED' | 'FDS_HIGH_RISK_DEVICE';

export interface StpCase {
  product: StpProduct;
  amountCents: number;
  ekyc?: EkycStatus;
  dtiPct?: number;
  cicGroup?: DebtGroup;
  pledged?: boolean;
  casaCents?: number;
  /** Card spend over the last 12 months. */
  spendCents?: number;
  amlHit?: boolean;
}

export type StpFlag =
  | 'STP_DISABLED'
  | 'PRODUCT_OFF'
  | 'AMOUNT_OVER_LIMIT'
  | 'DTI_OVER_LIMIT'
  | 'CIC_NOT_GROUP_1'
  | 'PLEDGED'
  | 'OVER_CTR'
  | 'INSUFFICIENT_CASA'
  | 'AML_SANCTION_MATCH'
  | 'BIOMETRIC_AUTH_FAILED'
  | 'FDS_HIGH_RISK_DEVICE'
  | 'CIC_BAD_DEBT';

/** STP: posts with no human touch. MANUAL: falls back to the desk. REJECT: fast-failed at the gate, no desk ever sees it. */
export type StpRoute = 'STP' | 'MANUAL' | 'REJECT';
export type StpAction = 'APPROVE' | 'RENEW' | 'WAIVE' | 'DEBIT' | 'POST';

export interface StpVerdict {
  route: StpRoute;
  flags: StpFlag[];
  action?: StpAction;
}

export const STP_FLAG_TEXT: Readonly<Record<StpFlag, Localized<string>>> = {
  STP_DISABLED: L('STP is switched off bank-wide', 'STP đang tắt toàn hệ thống'),
  PRODUCT_OFF: L('STP is off for this product', 'STP đang tắt cho sản phẩm này'),
  AMOUNT_OVER_LIMIT: L('Amount above the STP limit', 'Số tiền vượt hạn mức STP'),
  DTI_OVER_LIMIT: L('DTI above the STP cap', 'DTI vượt ngưỡng STP'),
  CIC_NOT_GROUP_1: L('CIC is not group 1', 'CIC không phải nhóm 1'),
  PLEDGED: L('Deposit is pledged as collateral', 'Sổ tiết kiệm đang cầm cố'),
  OVER_CTR: L('Cash at or above the $10,000 CTR line', 'Tiền mặt từ $10,000 trở lên (ngưỡng CTR)'),
  INSUFFICIENT_CASA: L('CASA cannot cover the fee', 'CASA không đủ để thu phí'),
  AML_SANCTION_MATCH: L('Sanctions screening hit (AML_SANCTION_MATCH)', 'Trùng danh sách cấm vận (AML_SANCTION_MATCH)'),
  BIOMETRIC_AUTH_FAILED: L('eKYC biometric check failed', 'Xác thực sinh trắc học eKYC thất bại'),
  FDS_HIGH_RISK_DEVICE: L('FDS flagged a high-risk device', 'FDS gắn cờ thiết bị rủi ro cao'),
  CIC_BAD_DEBT: L('Bad debt on CIC (group 3 to 5)', 'Nợ xấu trên CIC (nhóm 3 đến 5)'),
};

/** The gate checks that end a case before any queue: a dead payload never reaches a desk. */
export function fastFail(c: StpCase): StpFlag | null {
  if (c.ekyc && c.ekyc !== 'PASS') return c.ekyc;
  if (c.product === 'BNPL' && c.cicGroup !== undefined && c.cicGroup >= 3) return 'CIC_BAD_DEBT';
  return null;
}

interface StpStrategy {
  enabled(cfg: StpConfig): boolean;
  /** What stops this case going straight through, and what STP does when nothing does. */
  check(c: StpCase, cfg: StpConfig): { flags: StpFlag[]; action: StpAction };
}

const STRATEGIES: Readonly<Record<StpProduct, StpStrategy>> = {
  BNPL: {
    enabled: () => true,
    check: (c, cfg) => ({
      action: 'APPROVE',
      flags: [
        c.amountCents > cfg.bnplMaxCents && 'AMOUNT_OVER_LIMIT',
        (c.dtiPct ?? 100) > cfg.maxDtiPct && 'DTI_OVER_LIMIT',
        (c.cicGroup ?? 5) !== 1 && 'CIC_NOT_GROUP_1',
        c.amlHit && 'AML_SANCTION_MATCH',
      ].filter(Boolean) as StpFlag[],
    }),
  },
  TERM_DEPOSIT: {
    enabled: (cfg) => cfg.termDeposit,
    check: (c) => ({ action: 'RENEW', flags: [c.pledged && 'PLEDGED', c.amountCents >= STP_LIMITS.termDepositMaxCents && 'AMOUNT_OVER_LIMIT'].filter(Boolean) as StpFlag[] }),
  },
  CARD_FEE: {
    enabled: (cfg) => cfg.cardFees,
    check: (c) => {
      if ((c.spendCents ?? 0) >= STP_LIMITS.premiumSpendCents) return { action: 'WAIVE', flags: [] };
      return { action: 'DEBIT', flags: (c.casaCents ?? 0) >= c.amountCents ? [] : ['INSUFFICIENT_CASA'] };
    },
  },
  KIOSK_CASH: {
    enabled: (cfg) => cfg.kiosk,
    check: (c) => ({ action: 'POST', flags: [c.amountCents >= STP_LIMITS.kioskMaxCents && 'OVER_CTR', c.amlHit && 'AML_SANCTION_MATCH'].filter(Boolean) as StpFlag[] }),
  },
};

export function decideStp(c: StpCase, cfg: StpConfig): StpVerdict {
  const dead = fastFail(c);
  if (dead) return { route: 'REJECT', flags: [dead] };
  if (!cfg.enabled) return { route: 'MANUAL', flags: ['STP_DISABLED'] };
  const s = STRATEGIES[c.product];
  if (!s.enabled(cfg)) return { route: 'MANUAL', flags: ['PRODUCT_OFF'] };
  const { flags, action } = s.check(c, cfg);
  return flags.length ? { route: 'MANUAL', flags } : { route: 'STP', flags: [], action };
}

/** Straight-through rate: the share of decided cases that needed no human. */
export const straightThroughRate = (stp: number, manual: number): number => (stp + manual > 0 ? stp / (stp + manual) : 0);

// Live traffic

/** CIC group odds by score band, cumulative over groups 1..5: a good score mostly means a clean file, never always. */
const CIC_BANDS: ReadonlyArray<{ minScore: number; cumulative: readonly [number, number, number, number] }> = [
  { minScore: 680, cumulative: [0.95, 0.99, 0.996, 0.999] },
  { minScore: 600, cumulative: [0.84, 0.96, 0.985, 0.995] },
  { minScore: 540, cumulative: [0.4, 0.92, 0.97, 0.99] },
  { minScore: 480, cumulative: [0.12, 0.6, 0.82, 0.93] },
  { minScore: -Infinity, cumulative: [0.02, 0.3, 0.55, 0.78] },
];

const unitOf = (key: string): number => (hashSeed(key) % 10_000) / 10_000;

/**
 * The bureau facts of a Pay-in-4 applicant: the scripted ones when given, otherwise a deterministic draw keyed by the id (no RNG
 * draw, so seeded days are unchanged). DTI is right-skewed and falls as the score rises; synthetic identities run higher.
 */
export function bnplCreditProfile(id: string, bnpl: BnplContext | undefined, synthetic = false): { dtiPct: number; cicGroup: DebtGroup } {
  const score = bnpl?.underwritingScore ?? 0;
  const v = unitOf(`stp:cic:${id}`);
  const band = CIC_BANDS.find((b) => score >= b.minScore)!.cumulative;
  const drawn = (band.findIndex((p) => v < p) + 1 || 5) as DebtGroup;
  const cicGroup: DebtGroup = bnpl?.cicGroup ?? drawn;
  const u = unitOf(`stp:${id}`);
  const median = 26 - (score - 640) / 14 + (synthetic ? 6 : 0);
  const skewed = median * (0.55 + 0.9 * u * u);
  const dtiPct = bnpl?.dtiPct ?? Math.round(Math.min(DTI_LIMIT_PCT + 25, Math.max(4, skewed)) * 10) / 10;
  return { dtiPct, cicGroup };
}

// Retail demos

/** The STP case behind a retail demo button, or null when it has none. */
export const OPS_STP_CASE: Readonly<Partial<Record<OpsActionId, StpCase>>> = {
  'bnpl-approve-400': { product: 'BNPL', amountCents: 40_000, ekyc: 'PASS', dtiPct: 23, cicGroup: 1 },
  'bnpl-decline-dti': { product: 'BNPL', amountCents: 40_000, ekyc: 'PASS', dtiPct: 48, cicGroup: 1 },
  'bnpl-decline-cic': { product: 'BNPL', amountCents: 40_000, ekyc: 'PASS', dtiPct: 30, cicGroup: 3 },
  'td-mature-close': { product: 'TERM_DEPOSIT', amountCents: 1_000_000 },
  'td-break-pledged': { product: 'TERM_DEPOSIT', amountCents: 1_000_000, pledged: true },
  'fee-card-10': { product: 'CARD_FEE', amountCents: 1_000, casaCents: 60_000 },
  'fee-annual-45': { product: 'CARD_FEE', amountCents: 4_500, casaCents: 2_000 },
  'fee-collect-fail': { product: 'CARD_FEE', amountCents: 4_500, casaCents: 0 },
  'fee-annual-waived': { product: 'CARD_FEE', amountCents: 4_500, casaCents: 60_000, spendCents: 1_200_000 },
  'teller-deposit-5000': { product: 'KIOSK_CASH', amountCents: 500_000 },
};

/** The path a demo takes when it goes straight through, or is fast-failed: the human desk drops out. */
const STP_PATH: Readonly<Record<StpProduct, readonly PlaceId[]>> = {
  BNPL: ['GATE_ECOM', 'STP_ENGINE', 'OUT_APPROVED'],
  TERM_DEPOSIT: ['STP_ENGINE', 'OUT_APPROVED'],
  CARD_FEE: ['STP_ENGINE', 'OUT_APPROVED'],
  KIOSK_CASH: ['GATE_ATM', 'ATM_CASH', 'OUT_APPROVED'],
};
const REJECT_PATH: readonly PlaceId[] = ['GATE_ECOM', 'STP_ENGINE', 'OUT_DECLINED'];

export const opsStpVerdict = (id: OpsActionId, cfg: StpConfig): StpVerdict | null => {
  const c = OPS_STP_CASE[id];
  return c ? decideStp(c, cfg) : null;
};

/** A demo's route under the config: its own desks on MANUAL, the STP path otherwise. */
export function stpRoute(id: OpsActionId, manual: readonly PlaceId[], cfg: StpConfig): readonly PlaceId[] {
  const c = OPS_STP_CASE[id];
  const v = c ? decideStp(c, cfg) : null;
  if (!c || !v || v.route === 'MANUAL') return manual;
  return v.route === 'REJECT' ? REJECT_PATH : STP_PATH[c.product];
}

/** Every place a demo can light, whichever way the dials send it. */
export function stpPlaces(id: OpsActionId, manual: readonly PlaceId[]): readonly PlaceId[] {
  const c = OPS_STP_CASE[id];
  if (!c) return manual;
  const alt = fastFail(c) ? REJECT_PATH : STP_PATH[c.product];
  return [...new Set([...manual, ...alt])];
}
