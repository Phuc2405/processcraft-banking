import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../bankPersistence';
import { ACADEMY_KEY, createAcademyStore, PANEL_WIDTH } from '../academyStore';
import { bindAcademySync, simulateFlow } from '../academySync';
import { academyFocusOf, activeFlowOf, createBankStore, viewportOf } from '../bankStore';

const bank = () => createBankStore({ storage: memoryStorage(), now: () => new Date('2026-10-14T00:00:00Z'), seed: 7 });

describe('the Academy store', () => {
  it('starts closed on chapter 1 with nothing done', () => {
    const s = createAcademyStore({ storage: null }).getState();
    expect(s).toMatchObject({ activeChapterId: 1, activeLevelId: null, isSplitScreenOpen: false, completedLessons: {}, panelWidth: PANEL_WIDTH.initial });
  });

  it('setChapter opens a chapter and clears the level; setLevel opens the level and its chapter', () => {
    const a = createAcademyStore({ storage: null });
    a.getState().setLevel('4.2');
    expect(a.getState()).toMatchObject({ activeChapterId: 4, activeLevelId: '4.2', startedLessons: { '4.2': true } });
    a.getState().setChapter(6);
    expect(a.getState()).toMatchObject({ activeChapterId: 6, activeLevelId: null });
    a.getState().setChapter(6);
    a.getState().setLevel('6.1');
    a.getState().setChapter(6);
    expect(a.getState().activeLevelId).toBe('6.1');
  });

  it('ignores chapters and levels that do not exist', () => {
    const a = createAcademyStore({ storage: null });
    a.getState().setChapter(7 as never);
    a.getState().setLevel('9.9');
    a.getState().completeLesson('0.0');
    expect(a.getState()).toMatchObject({ activeChapterId: 1, activeLevelId: null, completedLessons: {} });
  });

  it('toggles the split view and completes lessons once', () => {
    const a = createAcademyStore({ storage: null });
    a.getState().toggleSplitScreen();
    expect(a.getState().isSplitScreenOpen).toBe(true);
    a.getState().toggleSplitScreen();
    expect(a.getState().isSplitScreenOpen).toBe(false);
    a.getState().completeLesson('1.1');
    const first = a.getState().completedLessons;
    a.getState().completeLesson('1.1');
    expect(a.getState().completedLessons).toBe(first);
    expect(first).toEqual({ '1.1': true });
  });

  it('clamps the panel width', () => {
    const a = createAcademyStore({ storage: null });
    a.getState().setPanelWidth(10);
    expect(a.getState().panelWidth).toBe(PANEL_WIDTH.min);
    a.getState().setPanelWidth(5000);
    expect(a.getState().panelWidth).toBe(PANEL_WIDTH.max);
  });

  it('remembers progress, and survives a corrupt entry', () => {
    const storage = memoryStorage();
    const a = createAcademyStore({ storage });
    a.getState().setLevel('2.3');
    a.getState().completeLesson('2.2');
    a.getState().toggleSplitScreen();
    const b = createAcademyStore({ storage }).getState();
    expect(b).toMatchObject({ activeChapterId: 2, activeLevelId: '2.3', isSplitScreenOpen: true, completedLessons: { '2.2': true } });
    storage.setItem(ACADEMY_KEY, JSON.stringify({ activeLevelId: 'nope', completedLessons: { '1.1': true, junk: true }, panelWidth: 'wide' }));
    expect(createAcademyStore({ storage }).getState()).toMatchObject({ activeLevelId: null, completedLessons: { '1.1': true }, panelWidth: PANEL_WIDTH.initial });
    storage.setItem(ACADEMY_KEY, '{not json');
    expect(createAcademyStore({ storage }).getState().activeChapterId).toBe(1);
  });
});

describe('the Academy sync with the Living Bank', () => {
  it('focuses nothing while the panel is closed', () => {
    const academy = createAcademyStore({ storage: null });
    const b = bank();
    bindAcademySync(academy, b);
    academy.getState().setLevel('1.2');
    expect(b.getState().focusPlace).toBeNull();
  });

  it('lights the level’s guided flow and focuses its node', () => {
    const academy = createAcademyStore({ storage: null });
    const b = bank();
    bindAcademySync(academy, b);
    academy.getState().toggleSplitScreen();
    academy.getState().setLevel('2.3');
    expect(viewportOf(b.getState())).toMatchObject({ scope: 'beginner', activeFlow: 2 });
    expect(b.getState().focusPlace).toBe('SEC_3DS');
    expect(academyFocusOf(b.getState())).toBe('SEC_3DS');
    academy.getState().setLevel('6.4');
    expect(viewportOf(b.getState())).toMatchObject({ scope: 'beginner', activeFlow: 4 });
    expect(b.getState().focusPlace).toBe('RECON');
  });

  it('shows the whole bank for a desk no guided flow covers', () => {
    const academy = createAcademyStore({ storage: null });
    const b = bank();
    bindAcademySync(academy, b);
    academy.getState().toggleSplitScreen();
    academy.getState().setLevel('4.2');
    expect(viewportOf(b.getState())).toMatchObject({ scope: 'advanced', activeFlow: null });
    expect(academyFocusOf(b.getState())).toBe('BNPL');
  });

  it('lights a chapter’s flow with no single node when only the chapter is open', () => {
    const academy = createAcademyStore({ storage: null });
    const b = bank();
    bindAcademySync(academy, b);
    academy.getState().toggleSplitScreen();
    academy.getState().setChapter(5);
    expect(viewportOf(b.getState())).toMatchObject({ scope: 'beginner', activeFlow: 3 });
    expect(b.getState().focusPlace).toBeNull();
  });

  it('clears the focus when the panel closes or the sync stops', () => {
    const academy = createAcademyStore({ storage: null });
    const b = bank();
    const stop = bindAcademySync(academy, b);
    academy.getState().toggleSplitScreen();
    academy.getState().setLevel('1.1');
    expect(b.getState().focusPlace).toBe('GATE_POS');
    academy.getState().toggleSplitScreen();
    expect(b.getState().focusPlace).toBeNull();
    academy.getState().toggleSplitScreen();
    expect(b.getState().focusPlace).toBe('GATE_POS');
    stop();
    expect(b.getState().focusPlace).toBeNull();
  });

  it('ends a chapter tour, and hides a focus the learner has dimmed by picking another flow', () => {
    const academy = createAcademyStore({ storage: null });
    const b = bank();
    bindAcademySync(academy, b);
    b.getState().startSpotlight('B');
    academy.getState().toggleSplitScreen();
    academy.getState().setLevel('1.1');
    expect(b.getState().spotlight).toBeNull();
    expect(activeFlowOf(b.getState())).toBe(1);
    b.getState().setActiveFlow(4);
    expect(b.getState().focusPlace).toBe('GATE_POS');
    expect(academyFocusOf(b.getState())).toBeNull();
  });

  it('applies a panel that was left open', () => {
    const academy = createAcademyStore({ storage: memoryStorage({ [ACADEMY_KEY]: JSON.stringify({ isSplitScreenOpen: true, activeLevelId: '3.2' }) }) });
    const b = bank();
    bindAcademySync(academy, b);
    expect(viewportOf(b.getState())).toMatchObject({ scope: 'beginner', activeFlow: 2 });
    expect(b.getState().focusPlace).toBe('SEC_3DS');
  });
});

describe('quiz scores and the Simulate deep link', () => {
  it('keeps the best and the latest score per chapter, and remembers them', () => {
    const storage = memoryStorage();
    const a = createAcademyStore({ storage });
    a.getState().recordQuiz(1, 2);
    a.getState().recordQuiz(1, 4);
    a.getState().recordQuiz(1, 3);
    expect(a.getState().quizScores['1']).toEqual({ best: 4, last: 3, total: 4 });
    a.getState().recordQuiz(2, 99);
    a.getState().recordQuiz(9 as never, 1);
    expect(a.getState().quizScores['2']).toBeUndefined();
    expect(createAcademyStore({ storage }).getState().quizScores['1']).toEqual({ best: 4, last: 3, total: 4 });
  });

  it('drops a saved score that no longer fits its quiz', () => {
    const storage = memoryStorage();
    storage.setItem(ACADEMY_KEY, JSON.stringify({ quizScores: { '1': { best: 3, last: 3, total: 9 }, '2': { best: 1, last: 3, total: 3 }, '3': { best: 3, last: 2, total: 4 }, x: 1 } }));
    expect(createAcademyStore({ storage }).getState().quizScores).toEqual({ '3': { best: 3, last: 2, total: 4 } });
  });

  it('setSplitScreen opens and closes the panel', () => {
    const a = createAcademyStore({ storage: null });
    a.getState().setSplitScreen(true);
    expect(a.getState().isSplitScreenOpen).toBe(true);
    a.getState().setSplitScreen(false);
    expect(a.getState().isSplitScreenOpen).toBe(false);
  });

  it('Simulate this Flow closes the panel, lights the flow and sends its main payment', () => {
    const a = createAcademyStore({ storage: null });
    const b = bank();
    a.getState().setSplitScreen(true);
    simulateFlow(a, b, 2);
    expect(a.getState().isSplitScreenOpen).toBe(false);
    expect(b.getState()).toMatchObject({ scope: 'beginner', flow: 2 });
    expect(b.getState().presetTxId).toMatch(/^d1-9001$/);
    expect(b.getState().presetTrace?.scenario).toBe('preset-token-45');
  });
});
