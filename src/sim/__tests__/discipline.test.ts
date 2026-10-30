import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { calculateReward, REWARD_MAX_CENTS, REWARD_MIN_CENTS } from '../../engine/rewardEngine';
import { calculatePenalty, DEBUFF_ERRORS, disciplineAfter, FRESH_DISCIPLINE, REHAB_STREAK, type Discipline, type DisciplineEvent } from '../../engine/penaltyEngine';
import { amlScorecard, DECISIONS, disciplinedOutcome, LEAK, outcomeEvent, SCORE_MAX, typologyCases, WRONG_FREEZE, type CaseRecord, type ReviewCase } from '../amlReview';
import { createAmlStore } from '../../store/amlStore';
import { amlDecisionMessages } from '../../components/ops/amlDecision.messages';
import { AmlScorecardView } from '../../components/ops/AmlReview';

const base = typologyCases(7, 1)[0]!;
const caseOf = (laundering: boolean, id: string): ReviewCase => ({ ...base, id, laundering });
const run = (events: DisciplineEvent[], from: Discipline = FRESH_DISCIPLINE): Discipline => events.reduce((d, e) => disciplineAfter(d, e, calculateReward), from);
const ERROR: DisciplineEvent = { kind: 'ERROR' };
const TP: DisciplineEvent = { kind: 'TRUE_POSITIVE', amountCents: 1_050_000 };

describe('the reward engine', () => {
  it('pays $1 to $5 in proportion to the case, +1 or +2 KPI points, and nothing while debuffed', () => {
    expect(calculateReward(1_050_000, false, false)).toEqual({ cashBonus: 420, kpiPoints: 2 });
    expect(calculateReward(50_000, false, false)).toEqual({ cashBonus: REWARD_MIN_CENTS, kpiPoints: 1 });
    expect(calculateReward(90_000_000, false, false).cashBonus).toBe(REWARD_MAX_CENTS);
    expect(calculateReward(1_050_000, true, false)).toEqual({ cashBonus: 0, kpiPoints: 0 });
    fc.assert(
      fc.property(fc.nat(1_000_000_000), (a) => {
        const r = calculateReward(a, false, false);
        expect(r.cashBonus).toBeGreaterThanOrEqual(REWARD_MIN_CENTS);
        expect(r.cashBonus).toBeLessThanOrEqual(REWARD_MAX_CENTS);
        expect([1, 2]).toContain(r.kpiPoints);
      }),
    );
  });
});

describe('the penalty engine and the debuff state', () => {
  it('doubles fines and points while debuffed', () => {
    expect(calculatePenalty(2_000_000, -15, true)).toEqual({ fineCents: 4_000_000, points: 30 });
    expect(calculatePenalty(2_000_000, -15, false)).toEqual({ fineCents: 2_000_000, points: 15 });
  });

  it('debuffs on a tipping-off at once, or on the third error', () => {
    expect(run([{ kind: 'TIP_OFF' }]).mode).toBe('DEBUFFED');
    expect(run([ERROR, ERROR]).mode).toBe('NORMAL');
    expect(run(Array(DEBUFF_ERRORS).fill(ERROR))).toMatchObject({ mode: 'DEBUFFED', consecutiveCleanCases: 0, debuffs: 1 });
  });

  it('needs 20 true positives in a row to recover; an error resets the streak; correct releases neither count nor reset', () => {
    const debuffed = run([{ kind: 'TIP_OFF' }]);
    expect(run(Array(REHAB_STREAK - 1).fill(TP), debuffed)).toMatchObject({ mode: 'DEBUFFED', consecutiveCleanCases: 19 });
    expect(run([...Array(10).fill(TP), ERROR], debuffed)).toMatchObject({ mode: 'DEBUFFED', consecutiveCleanCases: 0 });
    expect(run([...Array(5).fill(TP), { kind: 'CORRECT', amountCents: 1 }], debuffed).consecutiveCleanCases).toBe(5);
    const back = run(Array(REHAB_STREAK).fill(TP), debuffed);
    expect(back).toMatchObject({ mode: 'NORMAL', errors: 0, consecutiveCleanCases: 0 });
    // While debuffed the 20 correct cases earned nothing; back to normal, they pay again.
    expect(back.bonusCents).toBe(0);
    expect(run([TP], back).bonusCents).toBe(420);
  });

  it('counts every correct case and its bonus', () => {
    const d = run([TP, { kind: 'CORRECT', amountCents: 500_000 }]);
    expect(d).toMatchObject({ totalCorrect: 2, bonusCents: 420 + 200, kpiPoints: 2 + 1 });
  });
});

describe('outcomes through the discipline', () => {
  it('reads each outcome when its truth is out: errors, true positives, correct releases, and nothing for a SAR in flight', () => {
    expect(outcomeEvent(caseOf(true, 'a'), DECISIONS.FREEZE.apply(caseOf(true, 'a'), 0), { kind: 'PATH', path: 'FREEZE' })).toMatchObject({ kind: 'TRUE_POSITIVE' });
    expect(outcomeEvent(caseOf(false, 'b'), DECISIONS.FREEZE.apply(caseOf(false, 'b'), 0), { kind: 'PATH', path: 'FREEZE' })).toEqual({ kind: 'ERROR' });
    expect(outcomeEvent(caseOf(false, 'c'), DECISIONS.FALSE_POSITIVE.apply(caseOf(false, 'c'), 0), { kind: 'PATH', path: 'FALSE_POSITIVE' })).toMatchObject({ kind: 'CORRECT' });
    expect(outcomeEvent(caseOf(true, 'd'), DECISIONS.FALSE_POSITIVE.apply(caseOf(true, 'd'), 0), { kind: 'PATH', path: 'FALSE_POSITIVE' })).toEqual({ kind: 'ERROR' });
    expect(outcomeEvent(caseOf(true, 'e'), DECISIONS.FILE_SAR.apply(caseOf(true, 'e'), 0), { kind: 'PATH', path: 'FILE_SAR' })).toBeNull();
  });

  it('doubles a debuffed desk’s fine (in the journal too) and withholds its points', () => {
    const wrong = DECISIONS.FREEZE.apply(caseOf(false, 'f'), 0);
    const doubled = disciplinedOutcome(undefined, wrong, true);
    expect(doubled.record).toMatchObject({ fineCents: 2 * WRONG_FREEZE.fineCents, points: -2 * WRONG_FREEZE.points });
    expect(doubled.commands.find((c) => c.kind === 'FINE')!.lines[0]!.dr).toBe(4_000_000);
    expect(disciplinedOutcome(undefined, wrong, false)).toBe(wrong);
    const reward: CaseRecord = { ...wrong.record, fineCents: 0, points: 0 };
    expect(disciplinedOutcome(reward, { ...wrong, record: { ...reward, points: 15 } }, true).record.points).toBe(0);
  });

  it('debuffs the store after three errors, then doubles the next fine', () => {
    const store = createAmlStore();
    for (let i = 0; i < 3; i++) store.getState().decide(caseOf(true, `L${i}`), 'FALSE_POSITIVE', 10 + i);
    expect(store.getState().discipline.mode).toBe('DEBUFFED');
    store.getState().decide(caseOf(true, 'L3'), 'FALSE_POSITIVE', 20);
    expect(store.getState().reviews.L3).toMatchObject({ fineCents: 2 * LEAK.fineCents, points: -2 * LEAK.points });
    // A correct freeze while debuffed: no bonus, one step of the streak.
    store.getState().decide(caseOf(true, 'F1'), 'FREEZE', 30);
    expect(store.getState().discipline).toMatchObject({ consecutiveCleanCases: 1, bonusCents: 0, totalCorrect: 1 });
    expect(store.getState().escalations).toEqual([]);
  });
});

describe('the 10,000-point scorecard in a 2x3 grid', () => {
  const cases = [caseOf(false, 'S1')];
  it('scores out of 10,000, grades by percentage, shows the way to the next grade, and caps a debuffed desk at D', () => {
    const fresh = amlScorecard(cases, {});
    expect(fresh).toMatchObject({ score: 8500, pct: 85, grade: 'B', capped: false });
    expect(fresh.next).toMatchObject({ grade: 'A', at: 8800, short: 300 });
    // KPI points at face value: +10 is 8,510.
    const kpi = amlScorecard(cases, {}, { debuffed: false, kpiPoints: 10, totalCorrect: 5, bonusCents: 2000 });
    expect(kpi.score).toBe(8510);
    expect(kpi.next).toMatchObject({ grade: 'A', short: 290 });
    expect(kpi).toMatchObject({ totalCorrect: 5, bonusCents: 2000 });
    const debuffed = amlScorecard(cases, {}, { debuffed: true, kpiPoints: 40, totalCorrect: 0, bonusCents: 0 });
    expect(debuffed).toMatchObject({ grade: 'D', capped: true, next: null });
    expect(SCORE_MAX).toBe(10_000);
  });

  it('draws six cards, the progress bar, and the debuff accent', () => {
    const html = renderToStaticMarkup(createElement(AmlScorecardView, { cases: [] }));
    for (const id of ['fpr', 'friction', 'penalties', 'rating', 'correct', 'bonus']) expect(html).toContain(`data-testid="aml-score-${id}"`);
    expect(html).toContain('lg:grid-cols-3');
    expect(html).toContain('data-testid="aml-score-progress"');
    expect(amlDecisionMessages.messages.debuffBanner.vi).toBe('Cảnh báo vi phạm / Phạt nặng: Xếp hạng tối đa D, thưởng $0, phạt x2 (Đã xử lý đúng: {n}/20 ca liên tiếp để khôi phục).');
    expect(amlDecisionMessages.messages.scoreCorrect.vi).toBe('Tổng số case đúng');
    expect(amlDecisionMessages.messages.scoreBonus.vi).toBe('Tổng tiền thưởng');
  });
});

describe('the SOP hint: shown on request, the reward halved', () => {
  it('halves the cash and the KPI points (rounded down), and a debuffed desk still earns nothing', () => {
    expect(calculateReward(1_000_000, false, true)).toEqual({ cashBonus: 200, kpiPoints: 1 });
    expect(calculateReward(1_050_000, false, true)).toEqual({ cashBonus: 210, kpiPoints: 1 });
    expect(calculateReward(50_000, false, true)).toEqual({ cashBonus: 50, kpiPoints: 0 });
    expect(calculateReward(1_050_000, true, true)).toEqual({ cashBonus: 0, kpiPoints: 0 });
  });

  it('marks the case used the first time it is shown, keeps it used when hidden, and pays the halved reward', () => {
    const store = createAmlStore();
    store.getState().toggleHint('H1');
    expect(store.getState()).toMatchObject({ hintsShown: { H1: true }, hintsUsed: { H1: true } });
    store.getState().toggleHint('H1');
    expect(store.getState().hintsShown.H1).toBeUndefined();
    expect(store.getState().hintsUsed.H1).toBe(true);
    store.getState().decide(caseOf(true, 'H1'), 'FREEZE', 0);
    store.getState().decide(caseOf(true, 'H2'), 'FREEZE', 0);
    // H1 hinted: $2.10 and +1; H2 not: $4.20 and +2.
    expect(store.getState().discipline).toMatchObject({ totalCorrect: 2, bonusCents: 210 + 420, kpiPoints: 1 + 2 });
  });
});

describe('points at face value on the 10,000 scale', () => {
  const one = [caseOf(false, 'V1')];
  const rec = (points: number): Record<string, CaseRecord> => ({ V1: { ...DECISIONS.FALSE_POSITIVE.apply(caseOf(false, 'V1'), 0).record, points } });
  it('adds +1/+2 KPI points and subtracts −10/−15 penalty points exactly, and doubles them while debuffed', () => {
    expect(amlScorecard(one, rec(0)).score).toBe(8500);
    expect(amlScorecard(one, rec(0), { debuffed: false, kpiPoints: 1, totalCorrect: 1, bonusCents: 0 }).score).toBe(8501);
    expect(amlScorecard(one, rec(0), { debuffed: false, kpiPoints: 2, totalCorrect: 1, bonusCents: 0 }).score).toBe(8502);
    expect(amlScorecard(one, rec(-10)).score).toBe(8490);
    expect(amlScorecard(one, rec(-15)).score).toBe(8485);
    const doubled = disciplinedOutcome(undefined, DECISIONS.FALSE_POSITIVE.apply(caseOf(true, 'V2'), 0), true);
    expect(doubled.record.points).toBe(-20);
    expect(doubled.record.fineCents).toBe(10_000_000);
  });
});
