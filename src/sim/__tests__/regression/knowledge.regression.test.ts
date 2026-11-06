/**
 * Regression suite §7: the Knowledge Base, the regulatory registry (Sổ pháp lý), the Academy and the feedback form. All four stay
 * open and readable while a demo runs on the canvas (only the run triggers lock), and every lesson / legal deep link resolves.
 */

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChapterArticles } from '../../../components/academy/ChapterArticles';
import { FlashcardsView, SimulateButton } from '../../../components/academy/AcademyStudy';
import { demoLocked } from '../../../components/bank/DemoSession';
import { executeDemo } from '../../../components/bank/retailOpsActions';
import { AmlArticle, CitArticle, CoreLedgerArticle, KnowledgeBaseModal, kbAnchorId, RetailArticle, StpArticle } from '../../../components/knowledge/KnowledgeBaseModal';
import { RegulatoryRegistry } from '../../../components/knowledge/RegulatoryRegistry';
import { OpsFlashcards } from '../../../components/knowledge/RetailOpsStudy';
import { dispatchCitDemo } from '../../../components/ops/citActions';
import { FeedbackModal } from '../../../components/shell/FeedbackModal';
import { REG_DOCUMENTS, regDocById } from '../../../data/regulatoryRegistry';
import { chapterArticles } from '../../../data/retailOpsKnowledge';
import { lessonAnchor, SUBPROCESS_LESSON, type LessonKey } from '../../../data/subProcessLessons';
import { INFO_KEYS, isInfoKey, subProcessInfo } from '../../../data/subProcessRegistry';
import { setActiveLocale } from '../../../i18n/localeCore';
import { bankStore } from '../../../store/bankStore';
import { knowledgeTabOf, uiStore, type KnowledgeTab } from '../../../store/uiStore';
import { ACADEMY_CHAPTERS, ACADEMY_LEVELS, flowStepOf, levelById, levelMatchesFlow } from '../../academyCatalog';
import { ALL_DEMO_ACTIONS } from '../../demoActions';
import { DEMO_GROUPS } from '../../demoGroups';
import { at, freshBank } from './harness';

const html = (el: ReactElement): string => renderToStaticMarkup(el);
const TAB_ARTICLE: Readonly<Record<KnowledgeTab, (highlight: string) => ReactElement>> = {
  core: (h) => createElement(CoreLedgerArticle, { highlight: h, view: 'advanced' }),
  aml: (h) => createElement(AmlArticle, { highlight: h, view: 'advanced' }),
  stp: (h) => createElement(StpArticle, { highlight: h, view: 'advanced' }),
  cit: (h) => createElement(CitArticle, { highlight: h, view: 'advanced' }),
  retail: (h) => createElement(RetailArticle, { highlight: h, view: 'advanced' }),
  flashcards: (h) => createElement(OpsFlashcards, { highlight: h }),
  legal: (h) => createElement(RegulatoryRegistry, { highlight: h }),
};

beforeEach(freshBank);

describe('§7.1 reading stays open while a demo runs', () => {
  const running = [
    ['a retail payment', () => executeDemo('teller-12k')],
    ['a CIT run', () => void dispatchCitDemo('SBV')],
    ['the EoD batch', () => executeDemo('eod')],
  ] as const;

  it.each(running)('opens the Knowledge Base, the registry tab and the Academy during %s', (_, start) => {
    at(10 * 60);
    start();
    expect(demoLocked()).toBe(true);
    uiStore.getState().openKnowledge('aml-cash-ctr');
    expect(uiStore.getState().overlay).toBe('knowledge');
    uiStore.getState().setKnowledgeTab('legal');
    expect(uiStore.getState().knowledgeTab).toBe('legal');
    uiStore.getState().closeKnowledge();
    bankStore.getState().openAcademy();
    expect(bankStore.getState().academyOpen).toBe(true);
    bankStore.getState().closeAcademy();
    // Still the same demo: opening the reading never cancelled it.
    expect(demoLocked()).toBe(true);
  });

  it.each(running)('renders every reading window fully during %s, with no locked tab or field', (_, start) => {
    at(10 * 60);
    start();
    expect(demoLocked()).toBe(true);
    const kb = html(createElement(KnowledgeBaseModal));
    expect(kb).toContain('data-testid="knowledge-base"');
    for (const tab of Object.keys(TAB_ARTICLE)) expect(kb).toContain(`data-testid="kb-tab-${tab}"`);
    expect(kb).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="kb-tab-/);
    const registry = html(createElement(RegulatoryRegistry, { highlight: null }));
    for (const doc of REG_DOCUMENTS.slice(0, 5)) expect(registry, doc.id).toContain(doc.id);
    // Only the registry's scenario run links wait for the demo; the documents themselves are all there.
    expect(registry).not.toMatch(/<(input|select)[^>]*disabled=""/);
    // The Academy's reading (chapter articles, flashcards) renders whole; only its "Simulate this Flow" run waits for the demo.
    for (const c of ACADEMY_CHAPTERS) {
      if (!chapterArticles(c.id).length) continue;
      const out = html(createElement(ChapterArticles, { chapter: c.id }));
      expect(out, `chapter ${c.id}`).toContain(`data-testid="chapter-articles-${c.id}"`);
      expect(out, `chapter ${c.id}`).not.toContain('disabled=""');
    }
    expect(html(createElement(FlashcardsView)).length).toBeGreaterThan(0);
    expect(html(createElement(SimulateButton, { flow: 6 }))).toMatch(/<button[^>]*disabled=""/);
    const feedback = html(createElement(FeedbackModal, { onClose: () => undefined, endpoint: '' }));
    expect(feedback).toContain('data-testid="feedback-field-text"');
    expect(feedback).not.toMatch(/<(textarea|input|select)[^>]*disabled=""/);
  });
});

describe('§7.1b the run triggers are the only thing that locks', () => {
  it('unlocks the Academy’s Simulate button once no demo runs', () => {
    expect(demoLocked()).toBe(false);
    expect(html(createElement(SimulateButton, { flow: 6 }))).not.toMatch(/<button[^>]*disabled=""/);
  });
});

describe('§7.2 lesson anchor integrity', () => {
  const keys = Object.keys(SUBPROCESS_LESSON) as LessonKey[];

  it('gives every sheet and every demo group a lesson', () => {
    for (const k of INFO_KEYS) expect(SUBPROCESS_LESSON[k], k).toBeTruthy();
    for (const g of DEMO_GROUPS) expect(SUBPROCESS_LESSON[g.id], g.id).toBeTruthy();
  });

  it.each(keys)('%s opens a section the Knowledge Base really renders, on the right tab', (key) => {
    const anchor = lessonAnchor(key);
    const tab = knowledgeTabOf(anchor);
    uiStore.getState().openKnowledge(anchor);
    expect(uiStore.getState().knowledgeTab).toBe(tab);
    expect(uiStore.getState().knowledgeAnchor).toBe(anchor);
    uiStore.getState().closeKnowledge();
    expect(html(TAB_ARTICLE[tab](anchor)), `${key} → ${tab}/${anchor}`).toContain(`id="${kbAnchorId(anchor)}"`);
  });

  it('sends the AML anchors to the AML tab, the CIT children to the CIT tab', () => {
    expect(knowledgeTabOf(lessonAnchor('cash-ctr'))).toBe('aml');
    expect(knowledgeTabOf(lessonAnchor('flow-8'))).toBe('aml');
    for (const k of ['09-cit-atm', '09-cit-doorstep', '09-cit-sbv', '09-cit-teller-vault', 'flow-9'] as const) expect(knowledgeTabOf(lessonAnchor(k)), k).toBe('cit');
  });

  it('closes the Knowledge Base back to the overlay it was opened over', () => {
    uiStore.getState().open('aml');
    uiStore.getState().openKnowledge('aml-cft');
    uiStore.getState().closeKnowledge();
    expect(uiStore.getState().overlay).toBe('aml');
  });
});

describe('§7.3 the registry and the Academy hold together', () => {
  it('links every sheet’s legal references to a real registry document, and every related sheet to a real sheet', () => {
    for (const key of INFO_KEYS) {
      const info = subProcessInfo(key);
      for (const id of info.legal) expect(regDocById(id), `${key} → ${id}`).toBeDefined();
      for (const r of info.related) expect(isInfoKey(r), `${key} → ${r}`).toBe(true);
    }
  });

  it('points every registry scenario link at a real demo button', () => {
    const known = new Set<string>(ALL_DEMO_ACTIONS.map((a) => a.id));
    for (const doc of REG_DOCUMENTS) for (const id of doc.scenarios) expect(known.has(id), `${doc.id} → ${id}`).toBe(true);
    expect(new Set(REG_DOCUMENTS.map((d) => d.id)).size).toBe(REG_DOCUMENTS.length);
  });

  it('sends every Academy chapter’s article link to a section the Knowledge Base renders', () => {
    const links = ACADEMY_CHAPTERS.flatMap((c) => chapterArticles(c.id).map((a) => a.anchor));
    expect(links.length).toBeGreaterThan(0);
    for (const anchor of links) expect(html(TAB_ARTICLE[knowledgeTabOf(anchor)](anchor)), anchor).toContain(`id="${kbAnchorId(anchor)}"`);
  });

  it('maps every Academy level to its flow step and place, and finds it by id', () => {
    expect(ACADEMY_LEVELS.length).toBeGreaterThan(0);
    expect(new Set(ACADEMY_LEVELS.map((l) => l.id)).size).toBe(ACADEMY_LEVELS.length);
    for (const level of ACADEMY_LEVELS) {
      expect(levelById(level.id), level.id).toBe(level);
      expect(levelMatchesFlow(level), level.id).toBe(true);
      if (level.flow !== null) expect(flowStepOf(level), level.id).not.toBeNull();
    }
    for (const c of ACADEMY_CHAPTERS) expect(c.levels.length, `chapter ${c.id}`).toBeGreaterThan(0);
  });

  it('renders the Knowledge Base in Vietnamese as well', () => {
    setActiveLocale('vi');
    expect(html(createElement(KnowledgeBaseModal))).toContain('data-testid="kb-tab-legal"');
  });
});
