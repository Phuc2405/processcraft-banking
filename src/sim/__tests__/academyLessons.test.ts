import { describe, expect, it } from 'vitest';
import { ACADEMY_LEVELS } from '../academyCatalog';
import { LESSON_CONTENT, lessonContentFor } from '../academyLessons';
import { CHART_OF_ACCOUNTS } from '../../engine/ledger';
import { GL_PLAIN, glName, plainText, rcLabel, RC_PLAIN } from '../plainLanguage';

describe('the four-section lessons', () => {
  it('every level has a scenario, at least three steps, a rationale and at least one edge case', () => {
    for (const l of ACADEMY_LEVELS) {
      expect(l.realWorldScenario.length, l.id).toBeGreaterThan(20);
      expect(l.stepByStepFlow.length, l.id).toBeGreaterThanOrEqual(3);
      for (const s of l.stepByStepFlow) expect(s.actor && s.action, l.id).toBeTruthy();
      expect(l.whyItMatters.length, l.id).toBeGreaterThan(40);
      expect(l.edgeCasesAndErrors.length, l.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('has no content for a level that does not exist, and throws for a missing one', () => {
    const ids = new Set(ACADEMY_LEVELS.map((l) => l.id));
    expect(Object.keys(LESSON_CONTENT).filter((id) => !ids.has(id))).toEqual([]);
    expect(() => lessonContentFor('9.9')).toThrow();
  });

  it('every response code and GL code a lesson mentions has a Beginner name', () => {
    for (const l of ACADEMY_LEVELS) {
      const text = [l.goal, l.realWorldScenario, l.whyItMatters, ...l.stepByStepFlow.map((s) => s.action), ...l.edgeCasesAndErrors.flatMap((e) => [e.title, e.detail])].join(' ');
      for (const m of text.matchAll(/\bRC ?([0-9]{2}|N7)\b/g)) expect(RC_PLAIN[m[1]!], `${l.id} RC ${m[1]}`).toBeDefined();
      for (const e of l.edgeCasesAndErrors) if (e.code !== null) expect(RC_PLAIN[e.code], `${l.id} ${e.code}`).toBeDefined();
      expect(plainText(text, 'beginner'), l.id).not.toMatch(/\bRC ?\d\d\b|\b(1|2|5)\d{3}\b(?![.,]?\d)/);
    }
  });
});

describe('Beginner View vocabulary', () => {
  it('names every GL account in plain English, with the brief’s three exact', () => {
    for (const a of Object.values(CHART_OF_ACCOUNTS)) expect(GL_PLAIN[a.code], a.code).toBeTruthy();
    expect([GL_PLAIN['1120'], GL_PLAIN['2110'], GL_PLAIN['1910']]).toEqual(['Pending Card Hold', 'Merchant Payout Pool', 'Network Error Hold']);
    expect(glName('2110', 'expert')).toBe('2110-Card Settlement Clearing Payable');
  });

  it('gives the response codes friendly titles', () => {
    expect(['62', '51', '68'].map((c) => rcLabel(c, 'beginner'))).toEqual(['Card Frozen by User', 'Insufficient Balance', 'Network Lag']);
    expect(rcLabel('51', 'expert')).toBe('RC 51 Insufficient Funds');
  });

  it('rewrites codes in free text only in Beginner View, leaving amounts and message types alone', () => {
    const s = 'Sends 0100; RC 51 declines $1120.00. Posts DR 1110 / CR 2110.';
    expect(plainText(s, 'expert')).toBe(s);
    expect(plainText(s, 'beginner')).toBe('Sends 0100; Insufficient Balance declines $1120.00. Posts DR Pending Debit Card Hold / CR Merchant Payout Pool.');
  });
});
