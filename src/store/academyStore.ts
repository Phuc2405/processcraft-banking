/**
 * The Academy split view's own state: which chapter and level the learner is on, whether the lesson panel is open, and which
 * lessons are done. It knows nothing about the bank. academySync.ts is what turns a chosen level into a lit, focused node.
 *
 * Remembered in the browser (one small JSON entry); anything read back is checked, so a stale or hand-edited entry can drop
 * progress but never crash the app.
 */

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { isChapterId, levelById, type ChapterId, type LevelId } from '../sim/academyCatalog';
import { browserStorage, type KeyValueStorage } from './persistence';

export const ACADEMY_KEY = 'processcraft:v1:academy';
export const PANEL_WIDTH = { min: 300, max: 560, initial: 400 } as const;
export const clampPanelWidth = (px: number): number => (Number.isFinite(px) ? Math.round(Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, px))) : PANEL_WIDTH.initial);

export type LessonSet = Readonly<Record<LevelId, true>>;

export interface AcademyState {
  /** 1 to 6. */
  activeChapterId: ChapterId;
  /** The level in focus, or null while the chapter is only open. */
  activeLevelId: LevelId | null;
  isSplitScreenOpen: boolean;
  /** Levels the learner marked done. */
  completedLessons: LessonSet;
  /** Levels the learner has opened, so a chapter they began shows In Progress before anything is finished. */
  startedLessons: LessonSet;
  /** Width of the lesson panel in pixels. */
  panelWidth: number;

  /** Opens a chapter. Its levels show; no level is chosen yet. */
  setChapter(id: ChapterId): void;
  /** Chooses a level, which also opens its chapter. */
  setLevel(id: LevelId): void;
  toggleSplitScreen(): void;
  completeLesson(id: LevelId): void;
  setPanelWidth(px: number): void;
}

type Saved = Pick<AcademyState, 'activeChapterId' | 'activeLevelId' | 'isSplitScreenOpen' | 'completedLessons' | 'startedLessons' | 'panelWidth'>;

const DEFAULTS: Saved = { activeChapterId: 1, activeLevelId: null, isSplitScreenOpen: false, completedLessons: {}, startedLessons: {}, panelWidth: PANEL_WIDTH.initial };

function readSet(v: unknown): LessonSet {
  const out: Record<LevelId, true> = {};
  if (v && typeof v === 'object') for (const id of Object.keys(v)) if (levelById(id)) out[id] = true;
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
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveAcademy(storage: KeyValueStorage | null, s: AcademyState): void {
  try {
    const saved: Saved = { activeChapterId: s.activeChapterId, activeLevelId: s.activeLevelId, isSplitScreenOpen: s.isSplitScreenOpen, completedLessons: s.completedLessons, startedLessons: s.startedLessons, panelWidth: s.panelWidth };
    storage?.setItem(ACADEMY_KEY, JSON.stringify(saved));
  } catch {
    // Remembering progress is a nicety.
  }
}

export function createAcademyStore(options: { storage?: KeyValueStorage | null } = {}): StoreApi<AcademyState> {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const store = createStore<AcademyState>()((set, get) => ({
    ...loadAcademy(storage),

    setChapter: (id) => {
      if (!isChapterId(id) || get().activeChapterId === id) return;
      set({ activeChapterId: id, activeLevelId: null });
    },
    setLevel: (id) => {
      const level = levelById(id);
      if (!level) return;
      set((s) => ({ activeLevelId: level.id, activeChapterId: level.chapter, startedLessons: s.startedLessons[level.id] ? s.startedLessons : { ...s.startedLessons, [level.id]: true } }));
    },
    toggleSplitScreen: () => set((s) => ({ isSplitScreenOpen: !s.isSplitScreenOpen })),
    completeLesson: (id) => {
      if (!levelById(id) || get().completedLessons[id]) return;
      set((s) => ({ completedLessons: { ...s.completedLessons, [id]: true } }));
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
