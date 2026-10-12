import { describe, expect, it } from 'vitest';
import type { DayReport } from '../../../sim/types';
import { simulateDay } from '../../../sim/whatIf';
import { coachTips } from '../DayReportModal';

const day = (rules = {}): DayReport => simulateDay({ seed: 7, day: 1, rules });

describe('coaching tips on the day report', () => {
  it('gives at most three tips, each with something to say', () => {
    const tips = coachTips(day());
    expect(tips.length).toBeLessThanOrEqual(3);
    for (const t of tips) expect(t.text.length).toBeGreaterThan(20);
  });

  it('points only at lessons that exist', () => {
    for (const rules of [{}, { frictionlessBelow: 90, rejectAtOrAbove: 100 }, { reconToleranceCents: 1000 }, { bnplMinScore: 400, bnplMinDownPct: 10 }]) {
      for (const t of coachTips(day(rules))) expect(['A', 'B', 'C', 'D', 'E', 'F', null]).toContain(t.process);
    }
  });

  it('notices fraud waved through when the risk lines are loosened, and sends the learner to 3-D Secure', () => {
    const tips = coachTips(day({ frictionlessBelow: 90, rejectAtOrAbove: 100 }));
    expect(tips.some((t) => t.process === 'B')).toBe(true);
  });

  it('tells the learner about jammed ATMs and malformed transfers, and sends them to the chapter that explains each', () => {
    const jammy = simulateDay({ seed: 7, day: 1, rules: {} });
    const fake = (patch: (r: DayReport) => DayReport): DayReport => patch(jammy);
    const withJam = fake((r) => ({ ...r, kpis: { ...r.kpis, atm: { ...r.kpis.atm, jams: 2, jamCents: 20000 } } }));
    expect(coachTips(withJam).some((t) => t.process === 'D' && /ATM/.test(t.text))).toBe(true);
    const withBad = fake((r) => ({ ...r, kpis: { ...r.kpis, atm: { ...r.kpis.atm, jams: 0, jamCents: 0 }, a2a: { ...r.kpis.a2a, invalid: 9 } } }));
    const bad = coachTips(withBad).find((t) => t.process === 'E');
    expect(bad?.text).toMatch(/malformed/);
  });

  it('gives the same tips for the same day', () => {
    expect(coachTips(day())).toEqual(coachTips(day()));
  });
});

describe('the night shift on the day report', () => {
  it('names the stamina band of each person', async () => {
    const { staminaState } = await import('../DayReportModal');
    expect(staminaState(10).label).toBe('Fine');
    expect(staminaState(45).label).toBe('Tired');
    expect(staminaState(65).label).toBe('Worn out');
    expect(staminaState(90).label).toBe('Exhausted');
  });
});
