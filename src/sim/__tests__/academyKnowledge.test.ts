import { describe, expect, it } from 'vitest';
import { ACADEMY_CHAPTERS, ACADEMY_TRACKS, trackOfChapter } from '../academyCatalog';
import { glossaryEntry, glossaryFor, GLOSSARY, gradeQuiz, quizFor, QUIZZES } from '../academyKnowledge';
import { sampleFor, sampleForLevel } from '../academySamples';

describe('the knowledge tracks', () => {
  it('group the six chapters into three tracks, each chapter in exactly one', () => {
    expect(ACADEMY_TRACKS.map((t) => t.chapters)).toEqual([[1, 2], [3, 4], [5, 6]]);
    for (const c of ACADEMY_CHAPTERS) expect(ACADEMY_TRACKS.filter((t) => t.chapters.includes(c.id))).toHaveLength(1);
    expect(trackOfChapter(4).title).toBe('Operations');
  });

  it('list only concepts that exist in the glossary, in a chapter of their own track', () => {
    for (const t of ACADEMY_TRACKS) {
      for (const id of t.concepts) {
        const g = glossaryEntry(id);
        expect(g, id).not.toBeNull();
        expect(t.chapters, id).toContain(g!.chapter);
      }
    }
  });

  it('cover every concept the brief names', () => {
    const all = new Set(ACADEMY_TRACKS.flatMap((t) => t.concepts));
    for (const id of ['card-types', 'casa', 'overdraft', 'ekyc', 'stations', 'iso-response-codes', 'qr-codes', 'four-party', 'auth-capture', 'tokenization', 'three-ds', 'mdr-interchange', 'refund-void', 'chargeback', 'bnpl', 'a2a-instant', 'cdm-liquidity', 'iso-20022', 'double-entry', 'alm', 'nim', 'basel', 'bank-run', 'aml']) {
      expect(all.has(id), id).toBe(true);
    }
  });
});

describe('the glossary and flashcards', () => {
  it('has unique ids and a term and definition for every chapter', () => {
    expect(new Set(GLOSSARY.map((g) => g.id)).size).toBe(GLOSSARY.length);
    for (const c of ACADEMY_CHAPTERS) expect(glossaryFor(c.id).length, `chapter ${c.id}`).toBeGreaterThan(0);
    for (const g of GLOSSARY) {
      expect(g.term.length).toBeGreaterThan(0);
      expect(g.definition.length).toBeGreaterThan(20);
    }
  });
});

describe('the chapter quizzes', () => {
  it('give every chapter well-formed questions with an answer inside the options', () => {
    for (const c of ACADEMY_CHAPTERS) {
      const qs = quizFor(c.id);
      expect(qs.length, `chapter ${c.id}`).toBeGreaterThanOrEqual(3);
      for (const q of qs) {
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(4);
        expect(q.explanation.length).toBeGreaterThan(10);
      }
    }
    expect(new Set(Object.values(QUIZZES).flat().map((q) => q.id)).size).toBe(Object.values(QUIZZES).flat().length);
  });

  it('grades answers and counts blanks as missed', () => {
    const qs = quizFor(1);
    const right = Object.fromEntries(qs.map((q) => [q.id, q.answer]));
    expect(gradeQuiz(1, right)).toEqual({ score: qs.length, total: qs.length, missed: [] });
    const wrong = { ...right, [qs[0]!.id]: (qs[0]!.answer + 1) % 4 };
    delete (wrong as Record<string, number>)[qs[1]!.id];
    expect(gradeQuiz(1, wrong)).toEqual({ score: qs.length - 2, total: qs.length, missed: [qs[0]!.id, qs[1]!.id] });
  });
});

describe('the inspector samples', () => {
  it('play a real payment and show its ISO 8583 message and balanced postings', () => {
    const s = sampleFor('pos-20');
    expect(s).not.toBeNull();
    expect(s!.responseCode).toBe('00');
    expect(s!.message).toMatchObject({ mti: '0110', de39_responseCode: '00' });
    expect(s!.journal.length).toBeGreaterThan(0);
    for (const l of s!.journal) {
      expect(l.debit.code).not.toBe(l.credit.code);
      expect(l.amountCents).toBe(2000);
    }
  });

  it('shows a declined swipe with code 51 and the night flow with the day sample, and nothing for a flow-less desk', () => {
    expect(sampleFor('pos-500')!.responseCode).toBe('51');
    expect(sampleForLevel({ flow: 4 })?.preset).toBe('pos-20');
    expect(sampleForLevel({ flow: 3 })?.preset).toBe('cdm-200');
    expect(sampleForLevel({ flow: null })).toBeNull();
    expect(sampleFor('eod')).toBeNull();
  });
});
