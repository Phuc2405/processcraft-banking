/**
 * The retail book's vault crossings, shown for a few seconds after they post (Observer of the retail ops store): a till surplus
 * walked back to the vault, a cassette refill, a large withdrawal paid from the vault. The CIT runs' crossings need no store: they
 * are derived from the CIT snapshot (sim/vaultFlows.citCashFlows).
 */

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { retailCashFlow, type VaultCashFlow } from '../sim/vaultFlows';
import { retailOpsStore } from './retailOpsStore';

/** How long a retail crossing stays lit, in real milliseconds. */
export const RETAIL_FLOW_MS = 4_500;

interface VaultFlowState {
  retail: readonly VaultCashFlow[];
  /** Lights a crossing for `ms`, then lets it go. */
  push(flow: VaultCashFlow, ms?: number): void;
  clear(): void;
}

export const vaultFlowStore = createStore<VaultFlowState>((set, get) => ({
  retail: [],
  push: (flow, ms = RETAIL_FLOW_MS) => {
    set({ retail: [...get().retail.filter((f) => f.endpoint !== flow.endpoint), flow] });
    setTimeout(() => set({ retail: get().retail.filter((f) => f !== flow) }), ms);
  },
  clear: () => set({ retail: [] }),
}));

export const useVaultFlowStore = <T,>(select: (s: VaultFlowState) => T): T => useStore(vaultFlowStore, select);

/** Every new retail journal that touches the vault lights its crossing. */
retailOpsStore.subscribe((s, prev) => {
  const j = s.last?.journal;
  if (!j || s.last === prev.last) return;
  const flow = retailCashFlow(j);
  if (flow) vaultFlowStore.getState().push(flow);
});
