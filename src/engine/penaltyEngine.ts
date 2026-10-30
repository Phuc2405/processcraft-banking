/**
 * The AML desk's penalties and its discipline (State pattern).
 *
 * calculatePenalty (Strategy): a fine and a point deduction, doubled while the desk is debuffed.
 *
 * The discipline is a small state machine, NORMAL or DEBUFFED. A tipping-off, or a third error, debuffs the desk: its grade is
 * capped at D, correct cases earn nothing, and every new penalty is doubled. Rehabilitation takes 20 consecutive true positives
 * (correct holds on real laundering: a freeze, a SAR or an EDD action); any error resets the streak to 0, and reaching 20 lifts
 * the debuff and starts the error count afresh.
 */

export interface Penalty {
  /** Fine (cents), positive. */
  fineCents: number;
  /** Points lost, positive. */
  points: number;
}

export const DEBUFF_MULTIPLIER = 2;
/** Errors that debuff the desk. */
export const DEBUFF_ERRORS = 3;
/** Consecutive true positives that lift the debuff. */
export const REHAB_STREAK = 20;

/** One penalty rule (Strategy). */
export type PenaltyStrategy = (baseFine: number, basePoints: number) => Penalty;
export const standardPenalty: PenaltyStrategy = (baseFine, basePoints) => ({ fineCents: Math.abs(baseFine), points: Math.abs(basePoints) });
export const doubledPenalty: PenaltyStrategy = (baseFine, basePoints) => ({ fineCents: Math.abs(baseFine) * DEBUFF_MULTIPLIER, points: Math.abs(basePoints) * DEBUFF_MULTIPLIER });

/** A fine and points (either sign accepted), doubled while debuffed: -$20,000 / -15 becomes -$40,000 / -30. */
export const calculatePenalty = (baseFine: number, basePoints: number, isDebuffed: boolean): Penalty => (isDebuffed ? doubledPenalty : standardPenalty)(baseFine, basePoints);

// The discipline (State)

export type DisciplineMode = 'NORMAL' | 'DEBUFFED';

export interface Discipline {
  mode: DisciplineMode;
  /** Errors counted toward a debuff (since the desk was last rehabilitated). */
  errors: number;
  /** True positives in a row while debuffed (the rehabilitation streak). */
  consecutiveCleanCases: number;
  /** Times the desk has been debuffed this session. */
  debuffs: number;
  /** Every correct case, the bonus they earned (cents) and their KPI points. */
  totalCorrect: number;
  bonusCents: number;
  kpiPoints: number;
}

export const FRESH_DISCIPLINE: Discipline = { mode: 'NORMAL', errors: 0, consecutiveCleanCases: 0, debuffs: 0, totalCorrect: 0, bonusCents: 0, kpiPoints: 0 };

/** What happened at the desk, as the discipline sees it. A true positive is a correct hold on real laundering; any other correct case is CORRECT. */
export type DisciplineEvent = { kind: 'ERROR' } | { kind: 'TIP_OFF' } | { kind: 'TRUE_POSITIVE'; amountCents: number; hintUsed?: boolean } | { kind: 'CORRECT'; amountCents: number; hintUsed?: boolean };

/** The reward rule the discipline is given (rewardEngine.calculateReward). */
export type RewardRule = (amountCents: number, debuffed: boolean, hintUsed: boolean) => { cashBonus: number; kpiPoints: number };

/** How each state answers each event (State). */
interface DisciplineState {
  on(d: Discipline, e: DisciplineEvent): Discipline;
}

const debuff = (d: Discipline): Discipline => ({ ...d, mode: 'DEBUFFED', consecutiveCleanCases: 0, debuffs: d.debuffs + 1 });
/** A correct case's reward, by the current mode. */
const rewarded = (d: Discipline, e: { amountCents: number; hintUsed?: boolean }, debuffed: boolean, reward: RewardRule): Discipline => {
  const r = reward(e.amountCents, debuffed, e.hintUsed ?? false);
  return { ...d, totalCorrect: d.totalCorrect + 1, bonusCents: d.bonusCents + r.cashBonus, kpiPoints: d.kpiPoints + r.kpiPoints };
};

/** The two states, given the reward rule (injected, so this module stays independent of the reward engine's details). */
export function disciplineStates(reward: RewardRule): Readonly<Record<DisciplineMode, DisciplineState>> {
  return {
    NORMAL: {
      on(d, e) {
        switch (e.kind) {
          case 'TIP_OFF':
            return debuff({ ...d, errors: d.errors + 1 });
          case 'ERROR': {
            const errors = d.errors + 1;
            return errors >= DEBUFF_ERRORS ? debuff({ ...d, errors }) : { ...d, errors };
          }
          case 'TRUE_POSITIVE':
          case 'CORRECT':
            return rewarded(d, e, false, reward);
        }
      },
    },
    DEBUFFED: {
      on(d, e) {
        switch (e.kind) {
          case 'TIP_OFF':
          case 'ERROR':
            // Any error resets the rehabilitation streak.
            return { ...d, errors: d.errors + 1, consecutiveCleanCases: 0 };
          case 'CORRECT':
            return rewarded(d, e, true, reward);
          case 'TRUE_POSITIVE': {
            const next = rewarded({ ...d, consecutiveCleanCases: d.consecutiveCleanCases + 1 }, e, true, reward);
            // 20 in a row: rehabilitated, the slate wiped clean.
            return next.consecutiveCleanCases >= REHAB_STREAK ? { ...next, mode: 'NORMAL', errors: 0, consecutiveCleanCases: 0 } : next;
          }
        }
      },
    },
  };
}

/** The discipline after one event. */
export const disciplineAfter = (d: Discipline, e: DisciplineEvent, reward: RewardRule): Discipline => disciplineStates(reward)[d.mode].on(d, e);
