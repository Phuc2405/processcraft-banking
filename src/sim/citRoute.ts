/**
 * Where a CIT run's cash goes, stop by stop, for the map highlight and the hop player (Flow 09). One table for every CIT child:
 * the vault, the loading bay (a van run) and the far end: the teller till, the ATM / CDM, a corporate client, HQ or the State
 * Bank. Pure: no React, no Three.js.
 */

import type { Localized } from '../i18n/localeCore';
import { citBayRun, CIT_STRATEGIES, type CitAccountId, type CitDemo, type CitDirection, type CitOrder, type CitPlanned, type CitRun, type CitScenario, type CitSnapshot, type CitStatus } from './citEngine';
import { hashSeed } from './prng';
import type { FlowScope } from './guidedFlows';
import { STATIONS, type CashEndpoint, type DepartmentId, type PlaceId } from './topology';

export type CitStopId = 'VAULT' | 'BAY' | 'TELLER' | 'ATM' | 'CORP' | 'SBV' | 'HQ';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

/** Each stop's name and icon, and the desk on the map it is (the bay and the off-site ends have none). */
export const CIT_STOPS: Readonly<Record<CitStopId, { name: Localized<string>; icon: string; place: PlaceId | null }>> = {
  VAULT: { name: L('Central Cash Vault', 'Kho Quỹ Trung Tâm'), icon: '💰', place: 'MAIN_CASH_VAULT' },
  BAY: { name: L('CIT Loading Bay', 'Sảnh Giao Nhận CIT'), icon: '🚚', place: null },
  TELLER: { name: L('Teller Cash Counter', 'Quầy Giao dịch viên Tiền mặt'), icon: '🧑‍💼', place: 'TELLER_CASH' },
  ATM: { name: L('ATM / CDM', 'Máy ATM/CDM'), icon: '🏧', place: 'ATM_CASH' },
  CORP: { name: L('Corporate client', 'Khách hàng Doanh nghiệp'), icon: '🏬', place: null },
  SBV: { name: L('State Bank (SBV)', 'Ngân hàng Nhà nước (NHNN)'), icon: '🏦', place: null },
  HQ: { name: L('HQ vault', 'Kho Hội sở'), icon: '🏛️', place: null },
};

const FAR_END: Readonly<Record<CitAccountId, CitStopId | null>> = { VAULT: null, HQ_VAULT: 'HQ', TILL: 'TELLER', UNFIT: null, ATM: 'ATM', SBV: 'SBV', TRANSIT: null, CORP: 'CORP' };

/** The stops in the order the cash meets them: out of the vault (through the bay for a van) to the far end, or the other way round. */
export function citStops(scenario: CitScenario, direction: CitDirection): CitStopId[] {
  const { from, to } = CIT_STRATEGIES[scenario].route(direction);
  const out = from === 'VAULT';
  const far = FAR_END[out ? to : from] ?? 'BAY';
  const middle: CitStopId[] = CIT_STRATEGIES[scenario].van ? ['BAY'] : [];
  return out ? ['VAULT', ...middle, far] : [far, ...middle, 'VAULT'];
}

/** The scenario and usual direction of each CIT child, for its highlight before any run (an SBV run may go either way). */
const CHILD: Readonly<Record<CitDemo, { scenario: CitScenario; direction: CitDirection }>> = {
  ATM: { scenario: 'ATM_CDM', direction: 'OUT' },
  DOORSTEP: { scenario: 'DOORSTEP', direction: 'IN' },
  SBV: { scenario: 'SBV', direction: 'OUT' },
  TELLER: { scenario: 'TELLER', direction: 'IN' },
};
export const citChildStops = (demo: CitDemo): CitStopId[] => citStops(CHILD[demo].scenario, CHILD[demo].direction);

/** The gold cash lines a child uses: the vault ↔ bay line for a van, the vault ↔ ATM / teller line where the cash reaches a desk. */
export function citChildLines(demo: CitDemo): CashEndpoint[] {
  const stops = citChildStops(demo);
  return (['BAY', 'ATM', 'TELLER'] as const).filter((e) => stops.includes(e));
}

const SCOPES = new Map<CitDemo | 'all', FlowScope>();
/**
 * What a CIT child lights: the vault and the desk its cash reaches, never a payment wire (no POS, CASA, STP or outcome node). With
 * no child picked, Flow 09 as a whole: the vault, the tills and the ATM.
 */
export function citScope(demo: CitDemo | null): FlowScope {
  const key = demo ?? 'all';
  const hit = SCOPES.get(key);
  if (hit) return hit;
  const stops = demo ? citChildStops(demo) : (['VAULT', 'TELLER', 'ATM'] as const);
  const places = new Set(stops.map((s) => CIT_STOPS[s].place).filter((p): p is PlaceId => p !== null));
  const departments = new Set<DepartmentId>([...places].map((p) => STATIONS[p as keyof typeof STATIONS].department));
  const scope: FlowScope = { places, departments, wires: new Set() };
  SCOPES.set(key, scope);
  return scope;
}

/**
 * How far along its stops a run's cash has got (the hop player never runs ahead of it): a van outflow is at the bay while it loads
 * (EN_ROUTE) and at the far end from ARRIVED; an inflow is at the far end while the van collects, at the bay on ARRIVED and in the
 * vault from the count on. A till run is at its far end once it has ARRIVED. SETTLED is the last stop.
 */
export function citReached(run: Pick<CitRun, 'order' | 'status'>): number {
  const stops = citStops(run.order.scenario, run.order.direction);
  const last = stops.length - 1;
  const s: CitStatus = run.status;
  if (s === 'SETTLED') return last;
  if (stops.length === 2) return s === 'EN_ROUTE' ? 0 : 1;
  const out = stops[0] === 'VAULT';
  if (out) return s === 'EN_ROUTE' ? 1 : 2;
  return s === 'EN_ROUTE' ? 0 : s === 'ARRIVED' ? 1 : 2;
}

// The loading bay (its inspector, both maps)

/** The branch's armoured vans; a run is given one by its id, so a replayed day sends the same van. A till run has none (it is walked). */
export const CIT_FLEET = ['51C-CIT.01', '51C-CIT.02', '51C-CIT.03'] as const;
export const citVanId = (o: Pick<CitOrder, 'id' | 'scenario'>): string | null => (CIT_STRATEGIES[o.scenario].van ? CIT_FLEET[hashSeed('van', o.id) % CIT_FLEET.length]! : null);

/** The bay's vehicle now: a van standing at it (loading or unloading), a van out on a run, or none. */
export type BayVehicle = 'AT_BAY' | 'ON_ROAD' | 'IDLE';

export function bayVehicle(cit: CitSnapshot): { state: BayVehicle; run: CitRun | null } {
  const at = citBayRun(cit);
  if (at) return { state: 'AT_BAY', run: at };
  const run = cit.active?.run ?? null;
  if (run && run.status !== 'SETTLED' && CIT_STRATEGIES[run.order.scenario].van) return { state: 'ON_ROAD', run };
  return { state: 'IDLE', run: null };
}

/** Today's runs so far, newest first, for the bay's log. */
export const bayLog = (cit: CitSnapshot): Array<{ planned: CitPlanned; run: CitRun }> =>
  cit.runs.filter((r): r is { planned: CitPlanned; run: CitRun } => r.run !== null).reverse();
