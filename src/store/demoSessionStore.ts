/**
 * The learner's one running demo (State pattern): idle, or running a payment, a CIT run, or a replay (a closed-day sandbox payment or the
 * EoD demo's one batch case). While one runs the navigation is locked, the run button turns into "Cancel demo", and cancelling asks first.
 * Whether the run is still going is derived from the stores that play it (components/bank/DemoSession.tsx), never ticked.
 */

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * A payment, a CIT run, or a replay the hop player shows alone (a closed-day sandbox payment, the EoD demo's one batch case). `name`
 * is the scenario's own name in the learner's language, read when drawn, for the hover card's "👉 [Scenario: …] - Step X/Y" banner.
 */
export type DemoRun = ({ kind: 'payment'; id: string } | { kind: 'cit'; runId: string } | { kind: 'sandbox'; id: string }) & { name?: () => string };

/** The bank's clock when a demo ended: its clean stage is held until the clock moves again. */
export interface StageHold {
  day: number;
  minute: number;
}

interface DemoSessionState {
  active: DemoRun | null;
  /** A demo just ended (done or cancelled): the stage stays clean (no one else's customers) until the bank plays on. */
  held: StageHold | null;
  /** The "cancel this demo?" dialog is open. */
  confirming: boolean;
  start(run: DemoRun): void;
  /** The run is over (or was cancelled): navigation unlocks, and its clean stage is held at `at` (the bank's clock) if given. */
  finish(at?: StageHold): void;
  /** A demo is about to start: its stage is clean from now (before its session opens), held at `at`. */
  hold(at: StageHold): void;
  /** The bank plays on: the held stage gives way to the live bank. */
  release(): void;
  askCancel(): void;
  dismissCancel(): void;
}

export const demoSessionStore = createStore<DemoSessionState>((set, get) => ({
  active: null,
  held: null,
  confirming: false,
  start: (run) => set({ active: run, confirming: false, held: null }),
  finish: (at) => {
    if (get().active || get().confirming) set({ active: null, confirming: false, held: get().active && at ? at : get().held });
  },
  hold: (at) => set({ held: at }),
  release: () => {
    if (get().held) set({ held: null });
  },
  askCancel: () => {
    if (get().active) set({ confirming: true });
  },
  dismissCancel: () => set({ confirming: false }),
}));

export const useDemoSession = <T,>(select: (s: DemoSessionState) => T): T => useStore(demoSessionStore, select);
