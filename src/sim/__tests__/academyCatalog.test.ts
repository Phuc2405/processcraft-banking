import { describe, expect, it } from 'vitest';
import { ACADEMY_CHAPTERS, ACADEMY_LEVELS, chapterStatus, levelById, levelMatchesFlow, nextLevel } from '../academyCatalog';
import { GUIDED_FLOW_NODES } from '../guidedFlows';
import { STATIONS } from '../topology';

describe('the Academy catalog', () => {
  it('has the six chapters in order, each with levels numbered chapter.n', () => {
    expect(ACADEMY_CHAPTERS.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const c of ACADEMY_CHAPTERS) {
      expect(c.levels.length).toBeGreaterThan(0);
      c.levels.forEach((l, i) => expect(l.id).toBe(`${c.id}.${i + 1}`));
    }
    expect(new Set(ACADEMY_LEVELS.map((l) => l.id)).size).toBe(ACADEMY_LEVELS.length);
  });

  it('agrees with the Phase 1 guided flows: every flow level names a real step and a place that step uses', () => {
    for (const l of ACADEMY_LEVELS) {
      expect(levelMatchesFlow(l), l.id).toBe(true);
      if (l.flow !== null && l.node !== null) expect(GUIDED_FLOW_NODES[l.flow]).toContain(l.node);
    }
  });

  it('keeps flow-less levels to desks that no guided flow lights', () => {
    const flowless = ACADEMY_LEVELS.filter((l) => l.flow === null);
    expect(flowless.map((l) => l.id)).toEqual(['4.1', '4.2', '4.3', '5.1']);
    expect(Object.keys(STATIONS)).toContain('BNPL');
  });

  it('walks the whole course with nextLevel', () => {
    expect(nextLevel('1.4')?.id).toBe('2.1');
    expect(nextLevel('6.4')).toBeNull();
    expect(levelById('9.9')).toBeNull();
    expect(levelById(null)).toBeNull();
  });

  it('derives a chapter badge from finished and opened levels', () => {
    const c = ACADEMY_CHAPTERS[2]!;
    expect(chapterStatus(c, {}, {})).toBe('not-started');
    expect(chapterStatus(c, {}, { '3.1': true })).toBe('in-progress');
    expect(chapterStatus(c, { '3.1': true }, {})).toBe('in-progress');
    expect(chapterStatus(c, Object.fromEntries(c.levels.map((l) => [l.id, true as const])), {})).toBe('completed');
  });
});
