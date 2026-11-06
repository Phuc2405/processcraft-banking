/**
 * Physical cash crossing the Main Cash Vault's door (MAIN_CASH_VAULT), for both maps. The rule is one sentence: whoever needs
 * cash takes it OUT of the vault (Cr 1111), whoever has surplus cash brings it IN (Dr 1111). The three endpoints are the teller
 * tills, the ATM / CDM and the CIT loading bay (topology.CASH_ENDPOINTS).
 *
 * Two sources, one shape (Strategy): a CIT run, read from its lifecycle state, and a retail-book journal that touches the vault
 * account. Pure: the CIT flows are derived from the snapshot, so a paused or replayed day shows exactly what it posted.
 */

import { CIT_STRATEGIES, type CitRun, type CitSnapshot, type CitStatus } from './citEngine';
import type { OpsJournal } from './retailOps';
import type { CashEndpoint } from './topology';

/** OUT of the vault (Cr 1111) or IN to it (Dr 1111). */
export type CashDir = 'OUT' | 'IN';

export interface VaultCashFlow {
  endpoint: CashEndpoint;
  dir: CashDir;
  source: 'cit' | 'retail';
  /** The run or journal it belongs to (a React key, and what a test follows). */
  id: string;
}

/** The vault's own GL line for a movement. */
export const vaultPost = (dir: CashDir): 'Dr 1111' | 'Cr 1111' => (dir === 'IN' ? 'Dr 1111' : 'Cr 1111');

const between = (s: CitStatus, from: CitStatus, to: CitStatus): boolean => {
  const order: readonly CitStatus[] = ['EN_ROUTE', 'ARRIVED', 'IN_COUNT', 'DELIVERED', 'SETTLED'];
  const i = order.indexOf(s);
  return i >= order.indexOf(from) && i <= order.indexOf(to);
};

/**
 * Where one CIT run's cash crosses the vault right now, if it does:
 *  - out of the vault: loaded into the van at the bay while it is EN_ROUTE (an ATM run then also lights vault → ATM while the van
 *    is at the machine, ARRIVED → DELIVERED);
 *  - into the vault: unloaded at the bay from ARRIVED until the count is DELIVERED (a CDM collection first lights ATM → vault while
 *    the van empties the deposit cassette, EN_ROUTE);
 *  - a till run (no van) walks between the vault and the teller desk the whole way, EN_ROUTE → DELIVERED.
 */
export function citRunFlows(run: CitRun): VaultCashFlow[] {
  const { scenario, direction, id } = run.order;
  const route = CIT_STRATEGIES[scenario].route(direction);
  const out = route.from === 'VAULT';
  const into = route.to === 'VAULT';
  if (!out && !into) return [];
  const s = run.status;
  const flow = (endpoint: CashEndpoint, dir: CashDir): VaultCashFlow => ({ endpoint, dir, source: 'cit', id: `${id}:${endpoint}` });
  if (scenario === 'TELLER') return between(s, 'EN_ROUTE', 'DELIVERED') ? [flow('TELLER', out ? 'OUT' : 'IN')] : [];
  const flows: VaultCashFlow[] = [];
  if (out) {
    if (s === 'EN_ROUTE') flows.push(flow('BAY', 'OUT'));
    if (scenario === 'ATM_CDM' && between(s, 'ARRIVED', 'DELIVERED')) flows.push(flow('ATM', 'OUT'));
  } else {
    if (scenario === 'ATM_CDM' && s === 'EN_ROUTE') flows.push(flow('ATM', 'IN'));
    if (between(s, 'ARRIVED', 'DELIVERED')) flows.push(flow('BAY', 'IN'));
  }
  return flows;
}

/** Every vault crossing of the day's CIT runs at the snapshot's minute. */
export const citCashFlows = (cit: CitSnapshot): VaultCashFlow[] => cit.runs.flatMap(({ run }) => (run && run.status !== 'SETTLED' ? citRunFlows(run) : []));

/**
 * A retail-book journal's vault crossing, if it touches the vault account: Dr vault is cash coming IN, Cr vault cash going OUT.
 * The other side says where: the ATM cassette (a refill) or, for anything else, the teller (a till surplus, a cash withdrawal
 * paid from the vault under dual control).
 */
export function retailCashFlow(j: OpsJournal): VaultCashFlow | null {
  const vault = j.lines.find((l) => l.account === 'CASH_VAULT');
  if (!vault || vault.dr === vault.cr) return null;
  const endpoint: CashEndpoint = j.lines.some((l) => l.account === 'CASH_ATM') ? 'ATM' : 'TELLER';
  return { endpoint, dir: vault.dr > vault.cr ? 'IN' : 'OUT', source: 'retail', id: `${j.id}:${endpoint}` };
}

/** One flow per endpoint (the CIT run wins over a retail echo of the same move), in a stable order. */
export function mergeFlows(...lists: ReadonlyArray<readonly VaultCashFlow[]>): VaultCashFlow[] {
  const seen = new Map<CashEndpoint, VaultCashFlow>();
  for (const list of lists) for (const f of list) if (!seen.has(f.endpoint)) seen.set(f.endpoint, f);
  return (['TELLER', 'ATM', 'BAY'] as const).flatMap((e) => (seen.has(e) ? [seen.get(e)!] : []));
}

export interface CashMovements {
  total: number;
  in: number;
  out: number;
}

/**
 * The vault card's headline: how many times cash crossed the vault's door today, both books (the CIT runs dispatched so far and the
 * retail journals that touched the vault), split IN (Dr 1111) and OUT (Cr 1111).
 */
export function dailyCashMovements(cit: CitSnapshot, journals: readonly OpsJournal[], day: number): CashMovements {
  const dirs: CashDir[] = [];
  for (const { run } of cit.runs) {
    if (!run) continue;
    const r = CIT_STRATEGIES[run.order.scenario].route(run.order.direction);
    if (r.from === 'VAULT') dirs.push('OUT');
    else if (r.to === 'VAULT') dirs.push('IN');
  }
  const today = `D${day} `;
  for (const j of journals) {
    const f = j.at.startsWith(today) ? retailCashFlow(j) : null;
    if (f) dirs.push(f.dir);
  }
  const inn = dirs.filter((d) => d === 'IN').length;
  return { total: dirs.length, in: inn, out: dirs.length - inn };
}
