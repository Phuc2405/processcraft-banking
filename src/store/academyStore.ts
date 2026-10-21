/**
 * The Academy split view's own state: which chapter and level the learner is on, whether the lesson panel is open, and which
 * lessons are done. It knows nothing about the bank. academySync.ts is what turns a chosen level into a lit, focused node.
 *
 * Remembered in the browser (one small JSON entry); anything read back is checked, so a stale or hand-edited entry can drop
 * progress but never crash the app.
 */

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { CHAPTER_IDS, isChapterId, levelById, type ChapterId, type LevelId } from '../sim/academyCatalog';
import { quizFor } from '../sim/academyKnowledge';
import { browserStorage, type KeyValueStorage } from './persistence';

export const ACADEMY_KEY = 'processcraft:v1:academy';
export const PANEL_WIDTH = { min: 300, max: 560, initial: 400 } as const;
export const clampPanelWidth = (px: number): number => (Number.isFinite(px) ? Math.round(Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, px))) : PANEL_WIDTH.initial);

export type LessonSet = Readonly<Record<LevelId, true>>;

/** How a chapter's quiz went: the best and the latest score out of `total`. */
export interface QuizScore {
  best: number;
  last: number;
  total: number;
}
/** Quiz scores by chapter number. */
export type QuizScores = Readonly<Partial<Record<string, QuizScore>>>;

export interface AcademyState {
  /** 1 to 6. */
  activeChapterId: ChapterId;
  /** The level in focus, or null while the chapter is only open. */
  activeLevelId: LevelId | null;
  isSplitScreenOpen: boolean;
  /** Focus Mode: the lesson panel fills the screen and the map is hidden behind it. Never remembered across reloads. */
  isMaximized: boolean;
  /** Levels the learner marked done. */
  completedLessons: LessonSet;
  /** Levels the learner has opened, so a chapter they began shows In Progress before anything is finished. */
  startedLessons: LessonSet;
  /** Width of the lesson panel in pixels. */
  panelWidth: number;
  /** The result of each chapter quiz the learner has taken. */
  quizScores: QuizScores;
  /** The section of the panel on show. Not remembered across reloads. */
  studyTab: StudyTab;
  /** The chapter the Flashcards tab is filtered to, or 'all'. Not remembered across reloads. */
  cardsChapter: ChapterId | 'all';

  /** Opens a chapter. Its levels show; no level is chosen yet. */
  setChapter(id: ChapterId): void;
  /** Chooses a level, which also opens its chapter. */
  setLevel(id: LevelId): void;
  toggleSplitScreen(): void;
  /** Opens or closes the lesson panel. */
  setSplitScreen(open: boolean): void;
  /** Enters or leaves Focus Mode. Entering also opens the lesson panel. */
  setMaximized(on: boolean): void;
  toggleMaximized(): void;
  completeLesson(id: LevelId): void;
  setPanelWidth(px: number): void;
  /** Keeps a chapter quiz result: `last` is always the newest, `best` the highest so far. */
  recordQuiz(chapter: ChapterId, score: number): void;
  setStudyTab(tab: StudyTab): void;
  setCardsChapter(chapter: ChapterId | 'all'): void;
  /** [📇 Practice in Flashcards Tab]: opens the panel on the Flashcards tab, filtered to one chapter. */
  openFlashcards(chapter: ChapterId): void;
}

export type StudyTab = 'lessons' | 'cards' | 'quiz';

type Saved = Pick<AcademyState, 'activeChapterId' | 'activeLevelId' | 'isSplitScreenOpen' | 'completedLessons' | 'startedLessons' | 'panelWidth' | 'quizScores'>;

const DEFAULTS: Saved = { activeChapterId: 1, activeLevelId: null, isSplitScreenOpen: false, completedLessons: {}, startedLessons: {}, panelWidth: PANEL_WIDTH.initial, quizScores: {} };

function readSet(v: unknown): LessonSet {
  const out: Record<LevelId, true> = {};
  if (v && typeof v === 'object') for (const id of Object.keys(v)) if (levelById(id)) out[id] = true;
  return out;
}

function readQuizScores(v: unknown): QuizScores {
  const out: Record<string, QuizScore> = {};
  if (!v || typeof v !== 'object') return out;
  for (const chapter of CHAPTER_IDS) {
    const raw = (v as Record<string, unknown>)[String(chapter)];
    if (!raw || typeof raw !== 'object') continue;
    const { best, last, total } = raw as Record<string, unknown>;
    const max = quizFor(chapter).length;
    const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
    // A saved score only counts while the quiz still has the same number of questions.
    if (ok(best) && ok(last) && total === max && best >= last) out[String(chapter)] = { best, last, total: max };
  }
  return out;
}

/** Reads the saved entry; any part that does not check out falls back to its default. */
export function loadAcademy(storage: KeyValueStorage | null): Saved {
  try {
    const raw = storage?.getItem(ACADEMY_KEY);
    if (!raw) return { ...DEFAULTS };
    const j = JSON.parse(raw) as Partial<Record<keyof Saved, unknown>>;
    const level = typeof j.activeLevelId === 'string' ? levelById(j.activeLevelId) : null;
    return {
      activeChapterId: level ? level.chapter : isChapterId(j.activeChapterId) ? j.activeChapterId : 1,
      activeLevelId: level ? level.id : null,
      isSplitScreenOpen: j.isSplitScreenOpen === true,
      completedLessons: readSet(j.completedLessons),
      startedLessons: readSet(j.startedLessons),
      panelWidth: typeof j.panelWidth === 'number' ? clampPanelWidth(j.panelWidth) : PANEL_WIDTH.initial,
      quizScores: readQuizScores(j.quizScores),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveAcademy(storage: KeyValueStorage | null, s: AcademyState): void {
  try {
    const saved: Saved = { activeChapterId: s.activeChapterId, activeLevelId: s.activeLevelId, isSplitScreenOpen: s.isSplitScreenOpen, completedLessons: s.completedLessons, startedLessons: s.startedLessons, panelWidth: s.panelWidth, quizScores: s.quizScores };
    storage?.setItem(ACADEMY_KEY, JSON.stringify(saved));
  } catch {
    // Remembering progress is a nicety.
  }
}

export function createAcademyStore(options: { storage?: KeyValueStorage | null } = {}): StoreApi<AcademyState> {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const store = createStore<AcademyState>()((set, get) => ({
    ...loadAcademy(storage),
    isMaximized: false,
    studyTab: 'lessons',
    cardsChapter: 'all',

    setStudyTab: (tab) => {
      if (get().studyTab !== tab) set({ studyTab: tab });
    },
    setCardsChapter: (chapter) => {
      if (chapter === 'all' || isChapterId(chapter)) set({ cardsChapter: chapter });
    },
    openFlashcards: (chapter) => {
      if (!isChapterId(chapter)) return;
      set({ studyTab: 'cards', cardsChapter: chapter, isSplitScreenOpen: true });
    },

    setChapter: (id) => {
      if (!isChapterId(id) || get().activeChapterId === id) return;
      set({ activeChapterId: id, activeLevelId: null });
    },
    setLevel: (id) => {
      const level = levelById(id);
      if (!level) return;
      set((s) => ({ activeLevelId: level.id, activeChapterId: level.chapter, startedLessons: s.startedLessons[level.id] ? s.startedLessons : { ...s.startedLessons, [level.id]: true } }));
    },
    // A closed panel can never be maximized.
    toggleSplitScreen: () => set((s) => ({ isSplitScreenOpen: !s.isSplitScreenOpen, isMaximized: s.isSplitScreenOpen ? false : s.isMaximized })),
    setSplitScreen: (open) => {
      const s = get();
      if (s.isSplitScreenOpen !== open || (!open && s.isMaximized)) set(open ? { isSplitScreenOpen: true } : { isSplitScreenOpen: false, isMaximized: false });
    },
    setMaximized: (on) => {
      const s = get();
      if (s.isMaximized !== on || (on && !s.isSplitScreenOpen)) set(on ? { isMaximized: true, isSplitScreenOpen: true } : { isMaximized: false });
    },
    toggleMaximized: () => get().setMaximized(!get().isMaximized),
    completeLesson: (id) => {
      if (!levelById(id) || get().completedLessons[id]) return;
      set((s) => ({ completedLessons: { ...s.completedLessons, [id]: true } }));
    },
    recordQuiz: (chapter, score) => {
      if (!isChapterId(chapter)) return;
      const total = quizFor(chapter).length;
      if (!Number.isInteger(score) || score < 0 || score > total) return;
      const before = get().quizScores[String(chapter)];
      const best = before && before.total === total ? Math.max(before.best, score) : score;
      set((s) => ({ quizScores: { ...s.quizScores, [String(chapter)]: { best, last: score, total } } }));
    },
    setPanelWidth: (px) => {
      const panelWidth = clampPanelWidth(px);
      if (panelWidth !== get().panelWidth) set({ panelWidth });
    },
  }));
  store.subscribe((s) => saveAcademy(storage, s));
  return store;
}

export const academyStore = createAcademyStore();

export function useAcademyStore<T>(selector: (state: AcademyState) => T): T {
  return useStore(academyStore, selector);
}
