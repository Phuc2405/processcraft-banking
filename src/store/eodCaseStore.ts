import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * Flow 04's "Balance & clear the suspense accounts (TK 1910 / 2912)" switch, on the EOD sheet: on, the night demo routes its case
 * through the Suspense Account and the sheet teaches the suspense close; off, the standard close bypasses it (sim/eodCase.ts).
 */
interface EodCaseState {
  suspense: boolean;
  setSuspense(on: boolean): void;
}

export const eodCaseStore = createStore<EodCaseState>((set) => ({
  suspense: false,
  setSuspense: (suspense) => set({ suspense }),
}));

export const useEodCase = <T,>(select: (s: EodCaseState) => T): T => useStore(eodCaseStore, select);
