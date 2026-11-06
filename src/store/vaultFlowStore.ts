/**
 * The retail books' vault crossings, each lit once when it posts (Observer of the retail ops store and of the bank's own retail
 * ledger): a till surplus walked back to the vault, a cassette refill, a large withdrawal paid from the vault, the automatic till
 * top-up. The CIT runs' crossings need no store: they are derived from the CIT snapshot (sim/vaultFlows.citCashFlows).
 *
 * Single shot: a journal lights its crossing exactly once, and while an endpoint's crossing is lit (and for a short cooldown after)
 * the same endpoint and direction cannot light again, so one low-till breach is one transfer on screen and one line in the log.
 * An echo runs on wall time: every demo pauses the bank, and an echo frozen with the clock would read as the vault topping the
 * till up over and over.
 */

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { formatAud } from '../engine/money';
import type { JournalEntry } from '../sim/staffRoleplay';
import { CASH_ICON_SECONDS, retailCashFlow, type VaultCashFlow } from '../sim/vaultFlows';
import { bankStore } from './bankStore';
import { notificationStore } from './notificationStore';
import { retailOpsStore } from './retailOpsStore';

/** How long a retail crossing stays lit: one 💵 run along the wire, and a beat to read where it arrived. */
export const RETAIL_FLOW_MS = CASH_ICON_SECONDS * 1000 + 600;
/** After a crossing ends, the same endpoint and direction stays quiet this long before another can light. */
export const REFILL_COOLDOWN_MS = 2_000;
/** How many fired journals the guard remembers (the newest): far more than a day posts between two resets. */
const FIRED_CAP = 500;

interface VaultFlowState {
  retail: readonly VaultCashFlow[];
  /** Lights a crossing for `ms`, once: false (and nothing lit) for a journal already shown or a lane still replenishing. */
  push(flow: VaultCashFlow, ms?: number): boolean;
  clear(): void;
}

const lane = (f: VaultCashFlow): string => `${f.endpoint}:${f.dir}`;
const timers = new Map<VaultCashFlow, ReturnType<typeof setTimeout>>();
/** The journals already lit (the single-shot guard). */
const fired = new Set<string>();
/** Per endpoint and direction: until when it is replenishing (lit, then cooling down). */
const busyUntil = new Map<string, number>();

/** The one log line of an automatic till top-up: "⚡ Tự động tiếp quỹ: Kho Quỹ ➔ Quầy GDV $12,000.00". */
export function logAutoRefill(flow: VaultCashFlow): void {
  if (flow.endpoint !== 'TELLER' || flow.dir !== 'OUT') return;
  const amount = flow.cents ? ` ${formatAud(flow.cents)}` : '';
  notificationStore.getState().push({
    tone: 'info',
    icon: '⚡',
    title: { en: `Auto top-up: Main Vault ➔ Teller till${amount}`, vi: `Tự động tiếp quỹ: Kho Quỹ ➔ Quầy GDV${amount}` },
    deferred: false,
    source: `auto-refill:${flow.id}`,
  });
}

export const vaultFlowStore = createStore<VaultFlowState>((set, get) => {
  const drop = (flow: VaultCashFlow): void => {
    clearTimeout(timers.get(flow));
    timers.delete(flow);
    set({ retail: get().retail.filter((f) => f !== flow) });
  };
  return {
    retail: [],
    push: (flow, ms = RETAIL_FLOW_MS) => {
      const now = Date.now();
      if (fired.has(flow.id) || (busyUntil.get(lane(flow)) ?? 0) > now) return false;
      fired.add(flow.id);
      if (fired.size > FIRED_CAP) fired.delete(fired.values().next().value!);
      busyUntil.set(lane(flow), now + ms + REFILL_COOLDOWN_MS);
      // The other direction at the same endpoint gives way: the newest move is the one on the wire.
      for (const f of get().retail) if (f.endpoint === flow.endpoint) drop(f);
      timers.set(flow, setTimeout(() => drop(flow), ms));
      set({ retail: [...get().retail, flow] });
      logAutoRefill(flow);
      return true;
    },
    clear: () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      fired.clear();
      busyUntil.clear();
      set({ retail: [] });
    },
  };
});

export const useVaultFlowStore = <T,>(select: (s: VaultFlowState) => T): T => useStore(vaultFlowStore, select);

/** Every new retail-ops journal that touches the vault lights its crossing. */
retailOpsStore.subscribe((s, prev) => {
  const j = s.last?.journal;
  if (!j || s.last === prev.last) return;
  const flow = retailCashFlow(j);
  if (flow) vaultFlowStore.getState().push(flow);
});

/** The bank's own till rebalancing (staffRoleplay.vaultReplenishment) as a crossing of the teller wire, or null. */
export function tillRebalanceFlow(j: JournalEntry | undefined): VaultCashFlow | null {
  if (!j || (j.statusCode !== 'VAULT_TO_TILL' && j.statusCode !== 'TILL_TO_VAULT')) return null;
  const cents = j.lines.find((l) => l.gl === 'TILL_CASH');
  return { endpoint: 'TELLER', dir: j.statusCode === 'VAULT_TO_TILL' ? 'OUT' : 'IN', source: 'retail', id: `${j.caseId}@${j.at ?? ''}`, cents: cents ? cents.dr || cents.cr : 0 };
}

/** The counter's automatic top-up (or surplus sweep) posts after the case that called for it, so it is the newest journal. */
bankStore.subscribe((s, prev) => {
  if (s.retailLedger === prev.retailLedger) return;
  const j = s.retailLedger.journal[0];
  if (j === prev.retailLedger.journal[0]) return;
  const flow = tillRebalanceFlow(j);
  if (flow) vaultFlowStore.getState().push(flow);
});
