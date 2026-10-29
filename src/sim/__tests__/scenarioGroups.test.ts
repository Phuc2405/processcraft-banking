import { describe, expect, it } from 'vitest';
import { LESSONS, type ProcessId } from '../learning';
import { localLesson } from '../learningVi';
import { groupScenarios, scenarioPathOf } from '../scenarioGroups';
import { setActiveLocale } from '../../i18n/localeCore';

const IDS = Object.keys(LESSONS) as ProcessId[];

describe('test-scenario groups', () => {
  it('gives every lesson at least one happy path and one edge case', () => {
    for (const id of IDS) {
      const g = groupScenarios(id, LESSONS[id].examples);
      expect(g.happy.length, id).toBeGreaterThan(0);
      expect(g.edge.length, id).toBeGreaterThan(0);
      expect(g.happy.length + g.edge.length, id).toBe(LESSONS[id].examples.length);
    }
  });

  it('sorts the A2A chapter as the brief lists it', () => {
    const g = groupScenarios('E', LESSONS.E.examples);
    expect(g.happy.map((e) => e.id)).toEqual(['split', 'rent']);
    expect(g.edge.map((e) => e.id)).toEqual(['noref', 'shortbic', 'mismatch', 'broke']);
  });

  it('never calls fraud, a challenge or a fallback the happy path', () => {
    for (const id of IDS) for (const ex of LESSONS[id].examples) if (ex.payload.isFraud) expect(scenarioPathOf(id, ex.id), `${id}/${ex.id}`).toBe('edge');
    expect(scenarioPathOf('B', 'borderline')).toBe('edge');
    expect(scenarioPathOf('C', 'weak')).toBe('edge');
  });

  it('is the same in both languages and keeps the lesson order', () => {
    setActiveLocale('vi');
    try {
      const vi = groupScenarios('E', localLesson(LESSONS.E).examples);
      expect(vi.happy.map((e) => e.id)).toEqual(['split', 'rent']);
    } finally {
      setActiveLocale('en');
    }
  });

  it('treats an unknown id as an edge case', () => {
    expect(scenarioPathOf('A', 'nope')).toBe('edge');
  });
});
