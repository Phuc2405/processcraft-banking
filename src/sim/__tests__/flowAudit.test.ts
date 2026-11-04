import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { WALK_IN_DESKS } from '../../engine/plan/layout3d';
import { Flashcard } from '../../components/knowledge/RetailOpsStudy';
import { ACRONYM_DETAILS } from '../../data/acronyms';
import { RETAIL_FLASHCARDS } from '../../data/retailFlashcards';
import { OPS_FLASHCARDS } from '../../data/retailOpsKnowledge';
import { buildSearchIndex, searchIndex } from '../../hooks/useSearchIndex';
import { setActiveLocale } from '../../i18n/locale';
import { glossaryTerms } from '../../components/bank/codeGlossary';
import { BankSimulation } from '../bankSimulation';
import { DESK_VISITS } from '../deskVisit';
import { modeOf } from '../demoSchedule';
import { presetCustomer } from '../presets';
import { DEFAULT_RULES } from '../rules';
import type { OpsActionId } from '../retailOps';

afterEach(() => setActiveLocale('en'));

describe('the acronym index', () => {
  const NEW = ['ASIC', 'AFCA', 'NCCP', 'IFRS', 'MT202', 'SBV'] as const;

  it('defines every new regulatory acronym, with its Vietnamese name, in the glossary and the details table', () => {
    const keys = new Set(glossaryTerms('en').map((t) => t.key));
    for (const k of NEW) {
      expect(keys.has(k), k).toBe(true);
      expect(ACRONYM_DETAILS[k]?.name.vi, k).toBeTruthy();
    }
    expect(ACRONYM_DETAILS.ASIC!.name.vi).toBe('Ủy ban Chứng khoán & Đầu tư Úc');
    expect(ACRONYM_DETAILS.AFCA!.name.vi).toBe('Cơ quan Giải quyết Khiếu nại Tài chính Úc');
    expect(ACRONYM_DETAILS.NCCP!.name.vi).toBe('Đạo luật Bảo vệ Tín dụng Khách hàng');
    expect(ACRONYM_DETAILS.IFRS!.name.vi).toBe('Chuẩn mực Báo cáo Tài chính Quốc tế');
    expect(ACRONYM_DETAILS.MT202!.name.vi).toBe('Lệnh chuyển tiền liên ngân hàng');
    expect(ACRONYM_DETAILS.SBV!.name.vi).toBe('Ngân hàng Nhà nước Việt Nam');
  });

  it('puts the definition card first in Ctrl+K for an exact acronym, in both languages', () => {
    for (const locale of ['en', 'vi'] as const) {
      const index = buildSearchIndex('expert', locale);
      for (const k of NEW) {
        for (const q of [k, k.toLowerCase()]) {
          const r = searchIndex(index, q);
          const first = r.groups[r.order[0]!][0]!;
          expect(first.id, `${locale} ${q}`).toBe(`kb:term:${k}`);
          expect(first.full, `${locale} ${q}`).toBe(ACRONYM_DETAILS[k]!.name.en);
        }
      }
    }
  });

  it('answers the Vietnamese abbreviation NHNN with the same bank', () => {
    const r = searchIndex(buildSearchIndex('expert', 'vi'), 'nhnn');
    const first = r.groups[r.order[0]!][0]!;
    expect(first.id).toBe('kb:term:NHNN');
    expect(first.full).toBe(ACRONYM_DETAILS.SBV!.name.en.replace(' (NHNN)', ''));
  });
});

describe('the flashcard back', () => {
  const cards = [...RETAIL_FLASHCARDS, ...OPS_FLASHCARDS];

  it('gives every card a definition, a journal tier and a supplementary rule', () => {
    for (const c of cards) {
      expect(c.rule.en.length, c.id).toBeGreaterThan(0);
      expect(c.detail?.en, c.id).toBeTruthy();
      expect(c.detail?.vi, c.id).toBeTruthy();
    }
  });

  it('keeps the core definition short: three sentences at most', () => {
    for (const c of cards) expect(c.rule.en.split(/(?<=[.!?])\s+/).filter(Boolean).length, c.id).toBeLessThanOrEqual(3);
  });

  it('stacks name and definition, the Dr/Cr journal, then the rules, inside one scroll container', () => {
    const out = renderToStaticMarkup(createElement(Flashcard, { card: RETAIL_FLASHCARDS.find((c) => c.lines.length > 0)!, lit: false }));
    const at = (tier: string) => out.indexOf(`data-tier="${tier}"`);
    expect(out).toContain('data-testid="flashcard-back-scroll"');
    expect(out).toMatch(/bk-scroll[^"]*max-h-\[220px\][^"]*overflow-y-auto/);
    expect(at('definition')).toBeGreaterThan(0);
    expect(at('journal')).toBeGreaterThan(at('definition'));
    expect(at('rules')).toBeGreaterThan(at('journal'));
  });
});

describe('24/7 channels at night', () => {
  it('settles a card swipe sent at 23:30, after the batch cut-off', () => {
    const sim = new BankSimulation({ seed: 7, rules: DEFAULT_RULES });
    sim.stepUntil(23 * 60 + 30);
    expect(sim.dayOver).toBe(false);
    const id = sim.inject(presetCustomer('pos-20', DEFAULT_RULES)!)!;
    expect(id).toBeTruthy();
    sim.runToEndOfDay();
    expect(sim.traceOf(id)?.done).toBe(true);
    expect(sim.traceOf(id)?.plan.outcome).toBe('APPROVED');
  });
});

describe('human and system animation', () => {
  it('counts every walk-in desk of the 3D office as a human desk', () => {
    for (const desk of WALK_IN_DESKS) expect(desk === 'TELLER_CASH' || desk === 'DISPUTE_DESK').toBe(true);
    expect(modeOf('teller-12k')).toBe('human');
    expect(modeOf('claim-return')).toBe('human');
  });

  it('brings people in only for human-driven demos', () => {
    for (const id of Object.keys(DESK_VISITS) as OpsActionId[]) expect(modeOf(id), id).toBe('human');
  });
});
