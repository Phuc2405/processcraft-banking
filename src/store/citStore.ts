/**
 * The CIT vans the learner dispatched by hand today. Plain data: the runs themselves are derived (citEngine.citAt), so a paused,
 * replayed or reloaded day can never post one twice. A new day, or a replay rewound past a dispatch, drops it.
 */

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { CIT_DEMO_CAP, type CitDemo, type CitManual, type SbvMode } from '../sim/citEngine';

interface CitDemoState {
  day: number;
  manual: readonly CitManual[];
  /** The 3D van is out of its away spot (driving in, at the bay, or driving off): the dispatch lock holds until it has gone. */
  van: boolean;
  /** The SBV demo's case, picked on its sheet (🟢 deposit / 🔴 withdrawal): the knowledge sheet and the next SBV dispatch follow it. */
  sbvCase: SbvMode;
  setSbvCase(mode: SbvMode): void;
  /** Records a dispatch at the bank's clock; false once the day's cap is reached. An SBV dispatch takes the picked case. */
  dispatch(kind: CitDemo, day: number, minute: number, refillCents?: number): boolean;
  /** Takes back today's dispatch `CIT-<day>-M<n>` (Cancel demo): its postings were derived from it, so they go with it. */
  cancel(runId: string): void;
  /** Keeps only the dispatches the bank's clock has reached today. */
  prune(day: number, minute: number): void;
  /** Plays today's dispatch `index` on by `minutes` on its own (the bank is paused): its `lead` grows, nothing else moves. */
  playAhead(index: number, minutes: number): void;
  /** Today's ATM dispatch `index` has delivered its cash to the retail cassette. */
  markRefilled(index: number): void;
}

export const citStore = createStore<CitDemoState>((set, get) => ({
  day: -1,
  manual: [],
  van: false,
  sbvCase: 'DEPOSIT',
  setSbvCase: (sbvCase) => set({ sbvCase }),
  dispatch: (kind, day, minute, refillCents) => {
    const s = get();
    const today = s.day === day ? s.manual : [];
    if (today.length >= CIT_DEMO_CAP) return false;
    set({ day, manual: [...today, { kind, at: minute, ...(refillCents ? { refillCents } : {}), ...(kind === 'SBV' ? { sbv: s.sbvCase } : {}) }] });
    return true;
  },
  cancel: (runId) => {
    const s = get();
    const n = manualIndexOf(runId, s.day);
    if (n >= 0 && n < s.manual.length) set({ manual: s.manual.filter((_, i) => i !== n) });
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
  markRefilled: (index) => {
    const s = get();
    if (!s.manual[index] || s.manual[index]!.refilled) return;
    set({ manual: s.manual.map((x, i) => (i === index ? { ...x, refilled: true } : x)) });
  },
}));

export const useCitStore = <T,>(select: (s: CitDemoState) => T): T => useStore(citStore, select);

/** Today's index in `manual` of a learner's run id (`CIT-<day>-M<n>`), or -1 for a scheduled run or another day's. */
export function manualIndexOf(runId: string, day: number): number {
  const m = /^CIT-(\d+)-M(\d+)$/.exec(runId);
  return m && Number(m[1]) === day ? Number(m[2]) - 1 : -1;
}

/**
 * Whether the 3D van out on the bay belongs to a run that is gone: another day's (a day-over run dropped at the day's turn by
 * prune), or a learner's run cancelled or pruned away. Such a van drives off on its own and never holds the dispatch lock.
 */
export function vanOrphaned(runId: string | null, s: Pick<CitDemoState, 'day' | 'manual'>, bankDay: number): boolean {
  if (!runId) return false;
  const day = /^CIT-(\d+)-/.exec(runId);
  if (day && Number(day[1]) !== bankDay) return true;
  if (!runId.includes('-M')) return false;
  const n = manualIndexOf(runId, s.day);
  return s.day !== bankDay || n < 0 || n >= s.manual.length;
}
