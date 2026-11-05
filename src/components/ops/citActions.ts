import { formatMoney } from '../../sim/kpis';
import { citAccount, citAt, citDemoBusy, type CitDemo, type CitSnapshot } from '../../sim/citEngine';
import { OPS_LIMITS } from '../../sim/retailOps';
import { bankStore } from '../../store/bankStore';
import { citStore } from '../../store/citStore';
import { notificationStore } from '../../store/notificationStore';
import { retailOpsStore } from '../../store/retailOpsStore';
import { opsStamp } from '../bank/retailOpsActions';

/** The CIT demo dispatch: the one pipeline behind the dock's CIT menu, the inspector's buttons, and the retail ATM refill. */

const manualOf = (day: number) => {
  const s = citStore.getState();
  return s.day === day ? s.manual : [];
};

/** The live CIT snapshot outside React. */
export function citNow(): CitSnapshot {
  const { day, minute } = bankStore.getState().view;
  return citAt(day, minute, manualOf(day));
}

export type CitDemoBlock = 'dayOver' | 'busy' | null;

/**
 * Why a demo cannot be dispatched now, or null: the day is over, or the lock holds (the learner's run is not SETTLED and home yet,
 * or the 3D van has not driven off). One mutex for the dock menu, the inspector and the drawer's "run this scenario".
 */
export const citDemoBlock = (cit: CitSnapshot, dayOver: boolean, van: boolean = citStore.getState().van): CitDemoBlock => (dayOver ? 'dayOver' : citDemoBusy(cit) || van ? 'busy' : null);

/** The retail ATM cassette's shortfall the vault can cover: what an ATM run carries, so both books move the same cash. */
function retailShortfall(): number {
  const { balances } = retailOpsStore.getState().book;
  return Math.max(0, Math.min(OPS_LIMITS.cassetteCapacityCents - balances.CASH_ATM, balances.CASH_VAULT));
}

/** Sends a van now: the dispatch posts at once (Dr 1131 / Cr source), and the run walks its states with the bank's clock (or alone, while paused). */
export function dispatchCitDemo(kind: CitDemo): boolean {
  const { day, minute, dayOver } = bankStore.getState().view;
  if (citDemoBlock(citNow(), dayOver)) return false;
  const refill = kind === 'ATM' ? retailShortfall() : 0;
  if (!citStore.getState().dispatch(kind, day, minute, refill)) return false;
  // The retail cassette fills (and a sensor drill clears) with the same van.
  if (kind === 'ATM') retailOpsStore.getState().refillCassette(opsStamp());
  const id = `CIT-${day}-M${citStore.getState().manual.length}`;
  const run = citNow().runs.find((r) => r.planned.order.id === id)?.run;
  const lines = run?.entries[0]?.lines ?? [];
  const text = (dr: string, cr: string) => lines.map((l) => `${l.dr ? dr : cr} ${citAccount(l.account).code} ${formatMoney(l.dr || l.cr)}`).join(' · ');
  notificationStore.getState().push({
    tone: 'info',
    icon: '🚚',
    title: { en: 'CIT van dispatched', vi: 'Đã điều xe CIT' },
    body: { en: `${run?.order.id ?? ''}: ${text('Dr', 'Cr')}`, vi: `${run?.order.id ?? ''}: ${text('Nợ', 'Có')}` },
    deferred: false,
    source: `cit-demo:${kind}`,
    onOpen: () => bankStore.getState().select({ kind: 'station', id: 'COLLATERAL_VAULT' }),
  });
  return true;
}

/** The retail cassette's "CIT refill": a real van run when one can leave, else the cassette alone (a van is already on the road). */
export function refillAtmByCit(): void {
  if (!dispatchCitDemo('ATM')) retailOpsStore.getState().refillCassette(opsStamp());
}

/** Real milliseconds per CIT minute of a pause-isolated demo: a whole run (65 minutes) plays in about 20 seconds. */
export const CIT_SOLO_MS = 300;

/** Today's dispatch a paused bank plays on its own, as its index in the store, or -1: the learner's van that has not settled yet. */
export function citSoloIndex(bank: Pick<typeof bankStore, 'getState'> = bankStore): number {
  const s = bank.getState();
  if (s.playing || s.view.dayOver) return -1;
  const open = citDemoBusy(citNow());
  if (!open) return -1;
  return citStore.getState().manual.findIndex((_, i) => open.order.id === `CIT-${s.view.day}-M${i + 1}`);
}

/** Whether a CIT demo is playing in isolation now (the bank paused, the learner's run still locked): the bay animates, nothing else does. */
export const citSoloActive = (): boolean => citSoloIndex() >= 0;

/**
 * Keeps today's manual runs in step with the bank: drops those a new day or a rewound replay left behind, and, while the bank is
 * paused, plays the learner's open van on by itself a minute every CIT_SOLO_MS (no other run, payment or visitor moves). Returns the way to stop.
 */
export function installCitSync(bank: Pick<typeof bankStore, 'getState' | 'subscribe'> = bankStore): () => void {
  const prune = (): void => {
    const { day, minute } = bank.getState().view;
    citStore.getState().prune(day, minute);
  };
  prune();
  const stop = bank.subscribe(prune);
  const solo = setInterval(() => {
    const i = citSoloIndex(bank);
    if (i >= 0) citStore.getState().playAhead(i, 1);
  }, CIT_SOLO_MS);
  return () => {
    stop();
    clearInterval(solo);
  };
}
