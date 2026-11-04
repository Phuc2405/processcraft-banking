/**
 * The credit engine's calculations: the debt recovery waterfall, debt-to-income, the 5 debt groups and their provisions, the
 * credit score, and early term deposit closure. Pure functions in whole cents, so the desk, the Knowledge Base and the tests
 * share one set of numbers. The thresholds are this simulator's teaching values, in line with what the retail guides describe.
 */

export interface DebtBuckets {
  penaltyCents: number;
  interestCents: number;
  principalCents: number;
}

export interface WaterfallResult {
  toPenalty: number;
  toInterest: number;
  toPrincipal: number;
  /** What was paid beyond the whole debt: it goes back to the customer. */
  surplus: number;
  /** What is still owed in each bucket. */
  remaining: DebtBuckets;
}

/** A repayment fills each bucket in the fixed order before the next: penalties, then overdue interest, then principal. */
export function allocateWaterfall(paymentCents: number, debt: DebtBuckets): WaterfallResult {
  let left = Math.max(0, paymentCents);
  const take = (owed: number): number => {
    const paid = Math.min(left, Math.max(0, owed));
    left -= paid;
    return paid;
  };
  const toPenalty = take(debt.penaltyCents);
  const toInterest = take(debt.interestCents);
  const toPrincipal = take(debt.principalCents);
  return { toPenalty, toInterest, toPrincipal, surplus: left, remaining: { penaltyCents: debt.penaltyCents - toPenalty, interestCents: debt.interestCents - toInterest, principalCents: debt.principalCents - toPrincipal } };
}

/** Above this share of income going to debt, a new credit line is refused. */
export const DTI_LIMIT_PCT = 45;
/** Above this, the application is approved but kept on a watch list. */
export const DTI_WATCH_PCT = 36;

export type DtiBand = 'HEALTHY' | 'WATCH' | 'HIGH_RISK';

export interface DtiResult {
  /** Monthly debt service as a share of income, to one decimal place. */
  dtiPct: number;
  band: DtiBand;
  approved: boolean;
}

/** Debt service-to-income, including the new instalment. No income means no capacity to repay. */
export function assessDti(monthlyIncomeCents: number, existingDebtCents: number, newInstalmentCents: number): DtiResult {
  if (monthlyIncomeCents <= 0) return { dtiPct: 100, band: 'HIGH_RISK', approved: false };
  const dtiPct = Math.round(((existingDebtCents + newInstalmentCents) / monthlyIncomeCents) * 1000) / 10;
  const band: DtiBand = dtiPct > DTI_LIMIT_PCT ? 'HIGH_RISK' : dtiPct > DTI_WATCH_PCT ? 'WATCH' : 'HEALTHY';
  return { dtiPct, band, approved: band !== 'HIGH_RISK' };
}

export type DebtGroup = 1 | 2 | 3 | 4 | 5;

/** The day each debt group starts, oldest first; groups 3 to 5 are non-performing. */
const GROUP_FROM_DAY: readonly (readonly [number, DebtGroup])[] = [
  [360, 5],
  [180, 4],
  [90, 3],
  [10, 2],
];

export const debtGroup = (daysPastDue: number): DebtGroup => GROUP_FROM_DAY.find(([day]) => daysPastDue >= day)?.[1] ?? 1;
export const isNonPerforming = (group: DebtGroup): boolean => group >= 3;

/** The specific provision rate of each group, in percent. */
export const PROVISION_PCT: Readonly<Record<DebtGroup, number>> = { 1: 0, 2: 5, 3: 20, 4: 50, 5: 100 };

/** The specific provision on what the eligible collateral does not cover. */
export function specificProvision(balanceCents: number, eligibleCollateralCents: number, group: DebtGroup): number {
  return Math.round((Math.max(0, balanceCents - eligibleCollateralCents) * PROVISION_PCT[group]) / 100);
}

export const SCORE_RANGE = { min: 300, max: 850 } as const;

/** A score after what is known today: late payment costs the most, and high debt service costs a little. */
export function creditScore(baseScore: number, daysPastDue: number, dtiPct: number): number {
  const latePenalty = Math.min(300, Math.round(daysPastDue * 1.5));
  const dtiPenalty = dtiPct > DTI_LIMIT_PCT ? 60 : dtiPct > DTI_WATCH_PCT ? 25 : 0;
  return Math.max(SCORE_RANGE.min, Math.min(SCORE_RANGE.max, baseScore - latePenalty - dtiPenalty));
}

/** The demand rate an early-closed term deposit falls back to, % a year. */
export const DEMAND_RATE_PCT = 0.1;

const simpleInterest = (principalCents: number, ratePct: number, days: number): number => Math.round((principalCents * ratePct * days) / (100 * 365));

export interface EarlyClosure {
  /** Interest accrued so far at the contract rate. */
  accruedCents: number;
  /** What the customer is paid: interest at the demand rate. */
  paidCents: number;
  /** The early withdrawal penalty: the interest given up, reversed out of the bank's interest expense. */
  forfeitedCents: number;
}

/** Recalculates a term deposit closed early, on an actual/365 basis, from the contract rate down to the demand rate. */
export function closeTermDepositEarly(principalCents: number, termRatePct: number, daysHeld: number, demandRatePct: number = DEMAND_RATE_PCT): EarlyClosure {
  const accruedCents = simpleInterest(principalCents, termRatePct, daysHeld);
  const paidCents = Math.min(accruedCents, simpleInterest(principalCents, demandRatePct, daysHeld));
  return { accruedCents, paidCents, forfeitedCents: accruedCents - paidCents };
}
