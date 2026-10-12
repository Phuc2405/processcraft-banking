/**
 * The Build Lab guided tour: what the learner has open, which step they are on, what they answered.
 *
 * The tour never touches the learner's diagram. It builds its own canvas store (`createWorkflowStore`, no saving) holding a
 * copy of the diagram it walks, steps that copy's runner one box at a time at a locked slow speed, and publishes the dimming
 * and the glowing path as `spotlight` on that copy. The learner's own canvas, selection and saved work stay exactly as they were.
 *
 * Step `i` of the tour is "the token has just arrived at box `i` and is waiting": the runner has taken `i` steps. Pressing Next
 * takes one more, so the box does its work and the token rides the wire the diagram chose. The last step is the End event; the
 * Next after it finishes the run and opens the verdict.
 *
 * No timers here (the components own the auto-play clock), which keeps the store deterministic and testable.
 */

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { LEVELS, REFERENCE_SOLUTIONS } from '../data/seedChallenges';
import { featuredTest, buildLabTour, playableTests, quizzesOf, spotlightFor, type LabQuiz, type LabTour, type TourSource } from '../sim/labTour';
import type { Id, ProcessGraph } from '../types/processLearning';
import { createWorkflowStore, type WorkflowStore } from './workflowStore';

/** One quarter of the normal 900 ms tick, as the brief asks. */
export const LAB_TOUR_PLAYBACK_MS = 3600;

export type TourPhase = 'closed' | 'intro' | 'touring';

export interface QuizAnswer {
  picked: number;
  correct: boolean;
}

/** What the tour needs to know about the Build Lab it was opened from. */
export interface LabTourHost {
  /** The level open in the Build Lab. */
  levelId: () => Id;
  /** A copy of the learner's diagram on it. */
  learnerGraph: () => ProcessGraph;
}

export interface LabTourState {
  phase: TourPhase;
  levelId: Id | null;
  source: TourSource;
  testId: Id | null;
  tour: LabTour | null;
  quizzes: LabQuiz[];
  /** 0 to steps.length. Equal to steps.length once the run has finished and the verdict is showing. */
  index: number;
  auto: boolean;
  /** Answers by step index. They survive Previous and a change of test, so going back never asks twice. */
  answers: Record<number, QuizAnswer>;
  /** The private canvas the tour draws on. */
  canvas: WorkflowStore | null;
  /** Why the tour could not open, shown on the opening card. Null when it can. */
  refusal: string | null;

  open: (source: TourSource) => boolean;
  setTest: (testId: Id) => void;
  begin: () => void;
  next: () => void;
  prev: () => void;
  go: (index: number) => void;
  setAuto: (auto: boolean) => void;
  answer: (option: number) => void;
  exit: () => void;
}

export type LabTourStore = StoreApi<LabTourState>;

const CLOSED = {
  phase: 'closed' as TourPhase,
  levelId: null,
  testId: null,
  tour: null,
  quizzes: [] as LabQuiz[],
  index: 0,
  auto: false,
  answers: {} as Record<number, QuizAnswer>,
  canvas: null,
  refusal: null,
};

/** Is the learner stuck at a question they have not answered at this step? */
export function isBlocked(s: Pick<LabTourState, 'phase' | 'index' | 'quizzes' | 'answers'>): boolean {
  return s.phase === 'touring' && s.quizzes.some((q) => q.step === s.index) && s.answers[s.index] === undefined;
}

export const quizAt = (s: Pick<LabTourState, 'quizzes'>, index: number): LabQuiz | null => s.quizzes.find((q) => q.step === index) ?? null;

export const isFinished = (s: Pick<LabTourState, 'tour' | 'index'>): boolean => s.tour !== null && s.index >= s.tour.steps.length;

export function createLabTourStore(host: LabTourHost): LabTourStore {
  /** The model answer for a level, or null if it has none. */
  const exampleGraph = (levelId: Id): ProcessGraph | null => {
    const ref = REFERENCE_SOLUTIONS.find((r) => r.challengeId === levelId);
    return ref ? structuredClone(ref.graph) : null;
  };

  return createStore<LabTourState>()((set, get) => {
    /**
     * Put the private canvas at step `index`: replay from the start so that Previous and jumping work the same way as Next,
     * pause it, and light the path. The deciding token is followed, so a diagram that splits into parallel branches still
     * shows the branch the card is about.
     */
    const place = (index: number): void => {
      const { canvas, tour, testId } = get();
      if (!canvas || !tour || !testId) return;
      const c = canvas.getState();
      c.resetSimulation();
      c.startSimulation(testId);
      c.pauseSimulation();

      const target = tour.steps[index];
      const wanted = target ? target.index : tour.steps.length;
      let guard = tour.graph.nodes.length * 4 + 20;
      const arrived = (): boolean => {
        const s = canvas.getState();
        if (s.simulation?.finished) return true;
        const t = s.activeTokens.find((a) => a.tokenId === tour.tokenId) ?? s.activeTokens[0];
        if (!t) return false;
        if (!target) return false;
        return t.nodeId === target.nodeId && (wanted === 0 || t.edgeId === target.viaEdgeId);
      };
      while (guard-- > 0 && !arrived()) {
        const before = canvas.getState().currentTick;
        canvas.getState().stepSimulation();
        if (canvas.getState().currentTick === before) break;
      }
      canvas.getState().pauseSimulation();
      canvas.setState({ spotlight: spotlightFor(tour, index) });
    };

    /** Build the tour for a payment on the diagram being walked, and a canvas to draw it on. */
    const prepare = (levelId: Id, source: TourSource, testId: Id | null): Partial<LabTourState> => {
      const level = LEVELS.find((l) => l.id === levelId);
      if (!level) return { ...CLOSED, refusal: `There is no level '${levelId}'.` };
      const graph = source === 'example' ? exampleGraph(levelId) : structuredClone(host.learnerGraph());
      if (!graph) return { ...CLOSED, refusal: 'This level has no worked example yet.' };

      const test = (testId ? playableTests(level).find((t) => t.id === testId) : null) ?? featuredTest(level, graph);
      if (!test) return { ...CLOSED, refusal: 'This level has no payment to follow.' };

      const tour = buildLabTour(level, graph, test, source);
      const canvas = createWorkflowStore({ levels: LEVELS, initialLevelId: levelId, storage: null });
      canvas.getState().loadGraph(graph);
      canvas.getState().setPlaybackMs(LAB_TOUR_PLAYBACK_MS);
      return { levelId, source, testId: test.id, tour, quizzes: quizzesOf(tour), canvas, refusal: null };
    };

    const settle = (index: number): void => {
      const s = get();
      const last = s.tour?.steps.length ?? 0;
      const clamped = Math.max(0, Math.min(index, last));
      set({ index: clamped });
      place(clamped);
    };

    return {
      ...CLOSED,
      source: 'example',

      open: (source) => {
        const levelId = host.levelId();
        const made = prepare(levelId, source, null);
        if (!made.tour) {
          set({ ...CLOSED, source, refusal: made.refusal ?? 'The tour could not open.', phase: 'intro', levelId });
          return false;
        }
        set({ ...CLOSED, ...made, phase: 'intro', answers: {} });
        place(0);
        return true;
      },

      setTest: (testId) => {
        const s = get();
        if (!s.levelId || s.phase === 'closed' || testId === s.testId) return;
        const made = prepare(s.levelId, s.source, testId);
        if (!made.tour) return;
        set({ ...made, index: 0, auto: false, answers: {}, phase: s.phase === 'touring' ? 'touring' : 'intro' });
        place(0);
      },

      begin: () => {
        const s = get();
        if (s.phase !== 'intro' || !s.tour || s.tour.steps.length === 0) return;
        set({ phase: 'touring', auto: false });
        settle(0);
      },

      next: () => {
        const s = get();
        if (s.phase !== 'touring' || !s.tour || isBlocked(s)) return;
        if (s.index >= s.tour.steps.length) return;
        settle(s.index + 1);
      },

      prev: () => {
        const s = get();
        if (s.phase !== 'touring' || s.index <= 0) return;
        set({ auto: false });
        settle(s.index - 1);
      },

      go: (index) => {
        const s = get();
        if (s.phase !== 'touring' || !s.tour) return;
        // Jumping forward may not skip a question the learner has not answered yet.
        const firstOpen = s.quizzes.find((q) => s.answers[q.step] === undefined)?.step;
        const limit = firstOpen === undefined ? s.tour.steps.length : firstOpen;
        set({ auto: false });
        settle(Math.min(index, limit));
      },

      setAuto: (auto) => {
        const s = get();
        if (s.phase !== 'touring') return;
        if (auto && isFinished(s)) {
          // Play again from the top.
          set({ auto: true });
          settle(0);
          return;
        }
        set({ auto });
      },

      answer: (option) => {
        const s = get();
        const q = quizAt(s, s.index);
        if (s.phase !== 'touring' || !q || s.answers[s.index] !== undefined) return;
        if (!Number.isInteger(option) || option < 0 || option >= q.options.length) return;
        set({ answers: { ...s.answers, [s.index]: { picked: option, correct: option === q.correct } } });
      },

      exit: () => {
        set({ ...CLOSED, source: get().source });
      },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// App-wide instance
// ─────────────────────────────────────────────────────────────────────────────

let appHost: LabTourHost | null = null;

/** The app tells the tour where the learner's diagram lives. Done once, by the module that owns the Build Lab store. */
export function connectLabTour(host: LabTourHost): void {
  appHost = host;
}

export const labTourStore: LabTourStore = createLabTourStore({
  levelId: () => {
    if (!appHost) throw new Error('The guided tour has not been connected to the Build Lab.');
    return appHost.levelId();
  },
  learnerGraph: () => {
    if (!appHost) throw new Error('The guided tour has not been connected to the Build Lab.');
    return appHost.learnerGraph();
  },
});

export function useLabTour<T>(selector: (state: LabTourState) => T): T {
  return useStore(labTourStore, selector);
}
