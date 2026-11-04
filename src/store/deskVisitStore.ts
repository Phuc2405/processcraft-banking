/**
 * The desk visits now playing. Timed on the wall clock (a solo demo stops the bank as soon as its one payment is done, and the people
 * should still finish their business), but a deliberate pause freezes them where they stand: the visit's own clock stops with the
 * bank's, and carries on from the same frame when the bank plays again. Nothing moves while the learner has paused.
 */

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { VISIT_2D, VISIT_3D } from '../engine/plan/deskVisitPaths';
import { DESK_VISITS, visitDuration, type DeskVisitStep, type VisitAction, type VisitDesk } from '../sim/deskVisit';

export interface ActiveVisit {
  id: number;
  step: DeskVisitStep;
  /** performance.now() when the demo began. */
  startedAt: number;
}

interface DeskVisitState {
  visits: readonly ActiveVisit[];
  /** performance.now() when the learner paused, or null while the visits run. */
  frozenAt: number | null;
  /** Milliseconds the visits have spent frozen since they started. */
  frozenMs: number;
  /** Starts the people of a demo, replacing whoever is still at those desks. Does nothing for a demo that brings nobody in. */
  start(action: VisitAction, now?: number): void;
  /** A walk-in joins the desks (one step, sim/deskVisit.ts AMBIENT_VISITS) unless that desk is already busy. Never while frozen. Returns whether it came in. */
  arrive(step: DeskVisitStep, now?: number): boolean;
  /** The learner paused: everyone stops where they are. */
  freeze(now?: number): void;
  /** The learner played again: everyone carries on from where they stopped. */
  thaw(now?: number): void;
  clear(): void;
}

const clock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;

const stopTimer = (): void => {
  if (timer !== null) clearTimeout(timer);
  timer = null;
};

/** How long a step keeps its desk busy, in whichever view takes longer: they run off the same clock. */
export const stepSeconds = (step: DeskVisitStep): number => Math.max(visitDuration(step, VISIT_2D[step.desk]), visitDuration(step, VISIT_3D[step.desk]));

export const deskVisitStore = createStore<DeskVisitState>((set, get) => {
  /** Ends the visits once the last person has gone, counting only the time they actually ran. */
  const ends = (v: ActiveVisit, frozenMs: number): number => v.startedAt + frozenMs + stepSeconds(v.step) * 1000;
  const schedule = (now: number): void => {
    stopTimer();
    const { visits, frozenMs } = get();
    if (visits.length === 0) return;
    // Wake when the first of them is done: each visit leaves on its own, so a walk-in never holds a finished demo on screen (or the other way round).
    const next = Math.min(...visits.map((v) => ends(v, frozenMs)));
    timer = setTimeout(
      () => {
        timer = null;
        const at = clock();
        // A few ms of slack: a timer can fire a hair early.
        const left = get().visits.filter((v) => ends(v, get().frozenMs) > at + 5);
        set(left.length ? { visits: left } : { visits: [], frozenAt: null, frozenMs: 0 });
        if (left.length) schedule(at);
      },
      Math.max(0, next - now),
    );
    // Never hold a test run or a closing page open for a few figures.
    (timer as { unref?: () => void }).unref?.();
  };

  return {
    visits: [],
    frozenAt: null,
    frozenMs: 0,
    start: (action, now = clock()) => {
      const steps = DESK_VISITS[action];
      if (!steps) return;
      set({ visits: steps.map((step) => ({ id: nextId++, step, startedAt: now })), frozenAt: null, frozenMs: 0 });
      schedule(now);
    },
    arrive: (step, now = clock()) => {
      const { visits, frozenAt, frozenMs } = get();
      if (frozenAt !== null || visits.some((v) => v.step.desk === step.desk)) return false;
      // Its clock starts now: the time the others have spent frozen is not its own.
      set({ visits: [...visits, { id: nextId++, step, startedAt: now - frozenMs }] });
      schedule(now);
      return true;
    },
    freeze: (now = clock()) => {
      if (get().frozenAt !== null || get().visits.length === 0) return;
      stopTimer();
      set({ frozenAt: now });
    },
    thaw: (now = clock()) => {
      const { frozenAt, frozenMs } = get();
      if (frozenAt === null) return;
      set({ frozenAt: null, frozenMs: frozenMs + Math.max(0, now - frozenAt) });
      schedule(now);
    },
    clear: () => {
      stopTimer();
      set({ visits: [], frozenAt: null, frozenMs: 0 });
    },
  };
});

/** Seconds a visit has actually run: wall time since it began, less every moment it spent frozen. Read every frame by both views. */
export function visitElapsed(visit: ActiveVisit, now: number = clock()): number {
  const { frozenAt, frozenMs } = deskVisitStore.getState();
  const until = frozenAt ?? now;
  return Math.max(0, until - visit.startedAt - frozenMs) / 1000;
}

export const useDeskVisits = (): readonly ActiveVisit[] => useStore(deskVisitStore, (s) => s.visits);

/** Whether people are at this desk now: its staff work and its card shows it. */
export const useDeskVisited = (desk: string): boolean => useStore(deskVisitStore, (s) => s.visits.some((v) => v.step.desk === (desk as VisitDesk)));
