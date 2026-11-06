import { citAccount, type CitAccountId, type CitSnapshot } from './citEngine';
import { bayVehicle } from './citRoute';
import { GL_CODE, naturalBalance, type GlAccount, type RetailLedger } from './staffRoleplay';
import type { StationId } from './topology';

/**
 * The cash metrics of the two cash stations that are not counters, the Main Cash Vault and the CIT Loading Bay. They fill the lower half
 * of the one hover card (hoverCard.ts) on both maps: the place's state now, and its balances.
 */
export type CashStationId = 'MAIN_CASH_VAULT' | 'LOADING_BAY';
export const CASH_STATIONS: readonly CashStationId[] = ['MAIN_CASH_VAULT', 'LOADING_BAY'];

/** The state line's message key (cit.messages): the vault's cash moving out, in or still; the bay's van at the bay, on the road or none. */
export type CashStationStatus = 'outflow' | 'inflow' | 'vaultIdle' | 'bayState_AT_BAY' | 'bayState_ON_ROAD' | 'bayState_IDLE';

export interface CashStationTipModel {
  id: CashStationId;
  icon: string;
  status: CashStationStatus;
  /** The run on the road or at the bay, by its order id and seal, when there is one. */
  run: { id: string; seal: string } | null;
  /** The GL lines the card lists, in order, with today's balance in cents. */
  balances: ReadonlyArray<{ account: CitAccountId; code: string; cents: number }>;
}

/** Which accounts each station shows: the vault its three cash GLs, the bay the vault it serves and the cash on the road. */
export const TIP_ACCOUNTS: Readonly<Record<CashStationId, readonly CitAccountId[]>> = {
  MAIN_CASH_VAULT: ['VAULT', 'UNFIT', 'TRANSIT'],
  LOADING_BAY: ['VAULT', 'TRANSIT'],
};

export function cashStationTip(id: CashStationId, cit: CitSnapshot): CashStationTipModel {
  const balances = TIP_ACCOUNTS[id].map((account) => ({ account, code: citAccount(account).code, cents: cit.book[account] }));
  if (id === 'MAIN_CASH_VAULT') {
    const run = cit.active?.run ?? null;
    const status: CashStationStatus = cit.vaultFlow === 'OUT' ? 'outflow' : cit.vaultFlow === 'IN' ? 'inflow' : 'vaultIdle';
    return { id, icon: '💰', status, run: run && cit.vaultFlow ? { id: run.order.id, seal: run.order.sealId } : null, balances };
  }
  const { state, run } = bayVehicle(cit);
  return { id, icon: '🚚', status: `bayState_${state}`, run: run ? { id: run.order.id, seal: run.order.sealId } : null, balances };
}


/**
 * The core-ledger lines a desk's card lists under its metrics. The AML desk and the nightly reconciliation desk both answer for
 * TK 2930 Frozen assets: AML freezes into it and the FIU's directive drains it; reconciliation reports what is still held there.
 */
export const DESK_ACCOUNTS: Readonly<Partial<Record<StationId, readonly GlAccount[]>>> = {
  AML_DESK: ['FROZEN_ASSETS'],
  RECON: ['FROZEN_ASSETS'],
};

/** A desk's live balances from the core ledger, statement-natural (a credit balance on 2930 reads positive); empty for other desks. */
export function deskBalances(id: StationId, ledger: Pick<RetailLedger, 'balances'>): ReadonlyArray<{ account: GlAccount; code: string; cents: number }> {
  return (DESK_ACCOUNTS[id] ?? []).map((account) => ({ account, code: GL_CODE[account], cents: naturalBalance(account, ledger.balances[account]) }));
}
