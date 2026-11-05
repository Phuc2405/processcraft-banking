/**
 * The CIT vans the learner dispatched by hand today. Plain data: the runs themselves are derived (citEngine.citAt), so a paused,
 * replayed or reloaded day can never post one twice. A new day, or a replay rewound past a dispatch, drops it.
 */

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { CIT_DEMO_CAP, type CitDemo, type CitManual } from '../sim/citEngine';

interface CitDemoState {
  day: number;
  manual: readonly CitManual[];
  /** Records a dispatch at the bank's clock; false once the day's cap is reached. */
  dispatch(kind: CitDemo, day: number, minute: number, refillCents?: number): boolean;
  /** Keeps only the dispatches the bank's clock has reached today. */
  prune(day: number, minute: number): void;
  /** Plays today's dispatch `index` on by `minutes` on its own (the bank is paused): its `lead` grows, nothing else moves. */
  playAhead(index: number, minutes: number): void;
}

export const citStore = createStore<CitDemoState>((set, get) => ({
  day: -1,
  manual: [],
  dispatch: (kind, day, minute, refillCents) => {
    const s = get();
    const today = s.day === day ? s.manual : [];
    if (today.length >= CIT_DEMO_CAP) return false;
    set({ day, manual: [...today, { kind, at: minute, ...(refillCents ? { refillCents } : {}) }] });
    return true;
  },
  prune: (day, minute) => {
    const s = get();
    if (s.day !== day) {
      if (s.manual.length) set({ day, manual: [] });
      return;
    }
    if (s.manual.some((m) => m.at > minute)) set({ manual: s.manual.filter((m) => m.at <= minute) });
  },
  playAhead: (index, minutes) => {
    const s = get();
    const m = s.manual[index];
    if (!m) return;
    set({ manual: s.manual.map((x, i) => (i === index ? { ...x, lead: (x.lead ?? 0) + minutes } : x)) });
  },
}));

export const useCitStore = <T,>(select: (s: CitDemoState) => T): T => useStore(citStore, select);
