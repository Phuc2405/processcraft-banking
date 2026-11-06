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

interface DemoSessionState {
  active: DemoRun | null;
  /** The "cancel this demo?" dialog is open. */
  confirming: boolean;
  start(run: DemoRun): void;
  /** The run is over (or was cancelled): navigation unlocks. */
  finish(): void;
  askCancel(): void;
  dismissCancel(): void;
}

export const demoSessionStore = createStore<DemoSessionState>((set, get) => ({
  active: null,
  confirming: false,
  start: (run) => set({ active: run, confirming: false }),
  finish: () => {
    if (get().active || get().confirming) set({ active: null, confirming: false });
  },
  askCancel: () => {
    if (get().active) set({ confirming: true });
  },
  dismissCancel: () => set({ confirming: false }),
}));

export const useDemoSession = <T,>(select: (s: DemoSessionState) => T): T => useStore(demoSessionStore, select);
