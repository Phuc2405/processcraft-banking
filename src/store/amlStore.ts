/** The AML desk's case book for the session: which alerts have been closed as false positives and which have had a suspicious activity report filed, with the regulator's reference. */

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { SarActivity } from '../sim/amlMonitor';

export type AmlCase =
  | { status: 'SAR_FILED'; reference: string; activity: SarActivity; subject: string; narrative: string; day: number; filedMinute: number }
  | { status: 'CLOSED_FALSE_POSITIVE'; day: number; closedMinute: number };

export interface AmlState {
  cases: Readonly<Record<string, AmlCase>>;
  fileSar(alertId: string, c: Extract<AmlCase, { status: 'SAR_FILED' }>): void;
  closeFalsePositive(alertId: string, day: number, minute: number): void;
  reopen(alertId: string): void;
}

export function createAmlStore(): StoreApi<AmlState> {
  return createStore<AmlState>()((set) => ({
    cases: {},
    fileSar: (alertId, c) => set((s) => ({ cases: { ...s.cases, [alertId]: c } })),
    closeFalsePositive: (alertId, day, minute) => set((s) => ({ cases: { ...s.cases, [alertId]: { status: 'CLOSED_FALSE_POSITIVE', day, closedMinute: minute } } })),
    reopen: (alertId) =>
      set((s) => {
        const next = { ...s.cases };
        delete next[alertId];
        return { cases: next };
      }),
  }));
}

export const amlStore = createAmlStore();

export function useAmlStore<T>(selector: (state: AmlState) => T): T {
  return useStore(amlStore, selector);
}
