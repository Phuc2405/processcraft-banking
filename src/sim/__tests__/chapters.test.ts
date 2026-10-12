import { describe, expect, it } from 'vitest';
import { chapterOf, chapters, DIFFICULTY_HINT, stepsText } from '../chapters';
import { LESSON_LIST } from '../learning';
import { spotPlan } from '../spotlightPlan';

describe('the Course Catalog', () => {
  const list = chapters();

  it('lists six chapters, strictly progressive, under the titles of the brief', () => {
    expect(list.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(list.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(list.map((c) => c.title)).toEqual([
      'Virtual Card Tokenization & dCVV Masking',
      '3-D Secure 2.x Risk Engine (Frictionless vs Challenge OTP)',
      'BNPL Pay-in-4 Underwriting & Card Fallback',
      'EOD 3-Way Reconciliation & Suspense Accounting',
      'Instant Account-to-Account Transfers (A2A & pacs.008)',
      'AML Screening & Chargeback Dispute Resolution',
    ]);
  });

  it('puts BNPL at chapter 3, not 4 (the mislabel the brief names)', () => {
    expect(chapterOf('C').number).toBe(3);
    expect(chapterOf('D').number).toBe(4);
  });

  it('gives every card a difficulty tag, a one-line explanation and a step estimate', () => {
    for (const c of list) {
      expect(Object.keys(DIFFICULTY_HINT), c.id).toContain(c.difficulty);
      expect(c.layman, c.id).not.toMatch(/\n/);
      expect(c.layman.length, c.id).toBeGreaterThan(40);
      expect(c.layman.length, c.id).toBeLessThan(150);
      expect(c.layman, c.id).toMatch(/[.”]$/);
      expect(c.steps.min, c.id).toBeGreaterThanOrEqual(3);
      expect(c.steps.max, c.id).toBeGreaterThanOrEqual(c.steps.min);
      expect(c.examples, c.id).toBeGreaterThanOrEqual(5);
    }
  });

  it('counts the estimate from the real plans: the fewest and the most steps any example takes', () => {
    for (const lesson of LESSON_LIST) {
      const counts = lesson.examples.map((e) => spotPlan(lesson.id, e.id).steps.length);
      const c = chapterOf(lesson.id);
      expect(c.steps).toEqual({ min: Math.min(...counts), max: Math.max(...counts) });
    }
  });

  it('starts easy and ends hard', () => {
    expect(list[0]?.difficulty).toBe('Beginner');
    expect(list[list.length - 1]?.difficulty).toBe('Advanced');
  });

  it('reads the estimate as a range, or as one number when every example takes the same', () => {
    expect(stepsText({ steps: { min: 6, max: 6 } })).toBe('6 steps');
    expect(stepsText({ steps: { min: 4, max: 10 } })).toBe('4–10 steps');
  });
});
