/**
 * The out-of-hours prompt and the "Waiting for Scheduled Shift" queue of the demo dock. A shift-bound button pressed outside its
 * window (demoSchedule.ts) opens the prompt; staying puts the button in the queue, and it runs by itself once the clock reaches its
 * window. Plain data: the pipeline that acts on it is in components/bank/retailOpsActions.ts.
 */

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { DemoActionId } from '../sim/demoActions';
import type { DemoShift, ShiftSnap } from '../sim/demoSchedule';

export interface ShiftPrompt {
  id: DemoActionId;
  snap: ShiftSnap;
}

export interface WaitingDemo {
  id: DemoActionId;
  shift: Exclude<DemoShift, 'always'>;
}

interface ShiftQueueState {
  prompt: ShiftPrompt | null;
  waiting: readonly WaitingDemo[];
  ask(prompt: ShiftPrompt): void;
  /** Closes the prompt without queueing anything. */
  dismiss(): void;
  /** Closes the prompt and queues its button for its shift (once: pressing it again does not queue it twice). */
  stay(): void;
  unqueue(id: DemoActionId): void;
  /** Takes the queued buttons `ready` accepts out of the queue, and returns them in the order they were queued. */
  release(ready: (w: WaitingDemo) => boolean): WaitingDemo[];
  clear(): void;
}

export const shiftQueueStore = createStore<ShiftQueueState>((set, get) => ({
  prompt: null,
  waiting: [],
  ask: (prompt) => set({ prompt }),
  dismiss: () => set({ prompt: null }),
  stay: () => {
    const p = get().prompt;
    if (!p) return;
    const queued = get().waiting.some((w) => w.id === p.id);
    set({ prompt: null, waiting: queued ? get().waiting : [...get().waiting, { id: p.id, shift: p.snap.shift }] });
  },
  unqueue: (id) => set({ waiting: get().waiting.filter((w) => w.id !== id) }),
  release: (ready) => {
    const due = get().waiting.filter(ready);
    if (due.length) set({ waiting: get().waiting.filter((w) => !due.includes(w)) });
    return due;
  },
  clear: () => set({ prompt: null, waiting: [] }),
}));

export const useShiftQueue = <T,>(select: (s: ShiftQueueState) => T): T => useStore(shiftQueueStore, select);
