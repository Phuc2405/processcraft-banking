/**
 * The AML desk's reward for a correct case (Strategy): a small cash bonus scaled to the money the case moved, and KPI points.
 * Opening the case's SOP hint halves it; a debuffed desk earns nothing until it has rehabilitated (penaltyEngine.ts).
 */

export interface Reward {
  /** Cash bonus (cents): $1 to $5. */
  cashBonus: number;
  /** KPI points: +1, or +2 on a case of $10,000 or more. */
  kpiPoints: number;
}

export const REWARD_MIN_CENTS = 100;
export const REWARD_MAX_CENTS = 500;
/** The bonus is 0.04% of the case's money, kept between $1 and $5. */
export const REWARD_RATE = 0.0004;
/** A case at least this large earns the second KPI point. */
export const REWARD_LARGE_CASE_CENTS = 1_000_000;

export const NO_REWARD: Reward = { cashBonus: 0, kpiPoints: 0 };

/** One reward rule (Strategy): what a correct case on `amountCents` earns. */
export type RewardStrategy = (amountCents: number) => Reward;

/** The normal rule: proportional cash, one or two KPI points. */
export const proportionalReward: RewardStrategy = (amountCents) => ({
  cashBonus: Math.min(REWARD_MAX_CENTS, Math.max(REWARD_MIN_CENTS, Math.round(Math.max(0, amountCents) * REWARD_RATE))),
  kpiPoints: amountCents >= REWARD_LARGE_CASE_CENTS ? 2 : 1,
});

/** The debuffed rule: nothing. */
export const debuffedReward: RewardStrategy = () => NO_REWARD;

/** What the SOP hint costs: half the reward. */
export const HINT_FACTOR = 0.5;
/** The hinted rule: half of the proportional reward, cash to the cent and KPI points rounded down (+2 becomes +1, +1 becomes +0). */
export const hintedReward: RewardStrategy = (amountCents) => {
  const full = proportionalReward(amountCents);
  return { cashBonus: Math.round(full.cashBonus * HINT_FACTOR), kpiPoints: Math.floor(full.kpiPoints * HINT_FACTOR) };
};

/** What a correct case on `amountCents` (cents) earns: proportional, halved when its SOP hint was opened, nothing while debuffed (hint or not). */
export const calculateReward = (amountCents: number, isDebuffed: boolean, isHintUsed: boolean): Reward =>
  (isDebuffed ? debuffedReward : isHintUsed ? hintedReward : proportionalReward)(amountCents);
