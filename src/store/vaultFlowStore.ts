/**
 * The retail book's vault crossings, shown for a few seconds after they post (Observer of the retail ops store): a till surplus
 * walked back to the vault, a cassette refill, a large withdrawal paid from the vault. The CIT runs' crossings need no store: they
 * are derived from the CIT snapshot (sim/vaultFlows.citCashFlows).
 */

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { retailCashFlow, type VaultCashFlow } from '../sim/vaultFlows';
import { bankStore } from './bankStore';
import { retailOpsStore } from './retailOpsStore';

/** How long a retail crossing stays lit, in milliseconds of running clock: the countdown stops while the bank is paused. */
export const RETAIL_FLOW_MS = 4_500;

interface VaultFlowState {
  retail: readonly VaultCashFlow[];
  /** The bank is paused: every echo's countdown is frozen where it was, and resumes from there on play. */
  paused: boolean;
  /** Lights a crossing for `ms` of running time, then lets it go. */
  push(flow: VaultCashFlow, ms?: number): void;
  setPaused(paused: boolean): void;
  clear(): void;
}

/** One echo's countdown: what is left of it, and since when it has been running (null while frozen). */
interface Countdown {
  left: number;
  since: number | null;
  timer: ReturnType<typeof setTimeout> | null;
}
const countdowns = new Map<VaultCashFlow, Countdown>();

export const vaultFlowStore = createStore<VaultFlowState>((set, get) => {
  const drop = (flow: VaultCashFlow): void => {
    const c = countdowns.get(flow);
    if (c?.timer) clearTimeout(c.timer);
    countdowns.delete(flow);
    set({ retail: get().retail.filter((f) => f !== flow) });
  };
  const run = (flow: VaultCashFlow, c: Countdown): void => {
    c.since = Date.now();
    c.timer = setTimeout(() => drop(flow), c.left);
  };
  const freeze = (c: Countdown): void => {
    if (c.timer) clearTimeout(c.timer);
    if (c.since !== null) c.left = Math.max(0, c.left - (Date.now() - c.since));
    c.timer = null;
    c.since = null;
  };
  return {
    retail: [],
    paused: false,
    push: (flow, ms = RETAIL_FLOW_MS) => {
      for (const f of get().retail) if (f.endpoint === flow.endpoint) drop(f);
      const c: Countdown = { left: ms, since: null, timer: null };
      countdowns.set(flow, c);
      if (!get().paused) run(flow, c);
      set({ retail: [...get().retail, flow] });
    },
    setPaused: (paused) => {
      if (paused === get().paused) return;
      countdowns.forEach((c, flow) => (paused ? freeze(c) : run(flow, c)));
      set({ paused });
    },
    clear: () => {
      countdowns.forEach((c) => c.timer && clearTimeout(c.timer));
      countdowns.clear();
      set({ retail: [] });
    },
  };
});

export const useVaultFlowStore = <T,>(select: (s: VaultFlowState) => T): T => useStore(vaultFlowStore, select);

/** Every new retail journal that touches the vault lights its crossing. */
retailOpsStore.subscribe((s, prev) => {
  const j = s.last?.journal;
  if (!j || s.last === prev.last) return;
  const flow = retailCashFlow(j);
  if (flow) vaultFlowStore.getState().push(flow);
});

/** The echoes keep sim time, not wall time: pausing the bank freezes them, playing resumes them. */
vaultFlowStore.getState().setPaused(!bankStore.getState().playing);
bankStore.subscribe((s, prev) => {
  if (s.playing !== prev.playing) vaultFlowStore.getState().setPaused(!s.playing);
});
