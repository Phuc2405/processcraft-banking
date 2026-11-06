import { CATEGORY_ICON, flowIcon } from '../../sim/transactionPath';
import { citDemoBusy, type CitRun } from '../../sim/citEngine';
import { CIT_STOPS, citReached, citStops } from '../../sim/citRoute';
import type { PacketTrace } from '../../sim/types';
import { bankStore, beatLive } from '../../store/bankStore';
import { citStore } from '../../store/citStore';
import { hopPlayerStore, type HopSource } from '../../store/hopPlayerStore';
import { citNow } from '../ops/citActions';

/** The driver of the hop player: what each kind of run looks like as stops (Strategy), and the clock that ticks the play. */

/** The learner's payment: its route's places, as far as the simulation has taken it. */
export function paymentSource(t: Pick<PacketTrace, 'id' | 'route' | 'at' | 'done'> | null): HopSource | null {
  if (!t || t.route.length === 0) return null;
  return { id: `tx:${t.id}`, kind: 'payment', stops: t.route.map((place) => ({ place, cit: null })), route: t.route, icon: flowIcon(t.route), reached: t.done ? t.route.length - 1 : t.at, over: t.done };
}

/** The learner's CIT run: the vault, the bay and the far end, as far as its lifecycle has got. */
export function citSource(run: Pick<CitRun, 'order' | 'status'> | null): HopSource | null {
  if (!run) return null;
  const stops = citStops(run.order.scenario, run.order.direction).map((cit) => ({ place: CIT_STOPS[cit].place, cit }));
  return { id: `cit:${run.order.id}`, kind: 'cit', stops, route: [], icon: CATEGORY_ICON.cash, reached: citReached(run), over: run.status === 'SETTLED' };
}

/** A closed day's sandbox replay: the whole route is already known, so the player shows every stop at its own pace. */
export function sandboxSource(t: Pick<PacketTrace, 'id' | 'route'> | null): HopSource | null {
  if (!t || t.route.length === 0) return null;
  return { id: `sbx:${t.id}`, kind: 'payment', stops: t.route.map((place) => ({ place, cit: null })), route: t.route, icon: flowIcon(t.route), reached: t.route.length - 1, over: false };
}

/** The runs the player may show now: the learner's payment (not during a tour), a sandbox replay and their CIT dispatch. */
export function hopSources(): (HopSource | null)[] {
  const bank = bankStore.getState();
  return [bank.spotlight ? null : paymentSource(bank.presetTrace), sandboxSource(bank.sandboxTrace), citSource(citDemoBusy(citNow()))];
}

/**
 * Whether the play is held on the sim clock: the learner paused while their payment was still on its way (a solo run stopped by
 * Pause). A payment that has finished plays out its last stops; a CIT run and a sandbox replay play while the bank is paused by design.
 * A beat stepped by hand ("Nhích 1 bước", bankStore.step) is live: the play animates up to the stop that beat reached (stepPlay never
 * runs past `reached`), then holds there until the next step or Play.
 */
export function hopFrozen(bank: Pick<ReturnType<typeof bankStore.getState>, 'playing' | 'presetTrace' | 'stepView' | 'view'>, session: { kind: HopSource['kind']; id: string } | null): boolean {
  if (!session || session.kind !== 'payment' || !session.id.startsWith('tx:') || beatLive(bank)) return false;
  return bank.presetTrace !== null && `tx:${bank.presetTrace.id}` === session.id && !bank.presetTrace.done;
}

/** Milliseconds between ticks: smooth enough for the 2D icon, which is drawn from the store (the 3D orb reads it every frame). */
export const HOP_TICK_MS = 40;

/** Ticks the player on the wall clock while a run is on show; the runs are re-read only when the bank or the CIT store changes. Returns the way to stop. */
export function installHopPlayer(): () => void {
  let sources = hopSources();
  const refresh = (): void => {
    sources = hopSources();
    // A new run starts its play at once: a fast STP payment can finish before the next tick, and must not be skipped as already over.
    hopPlayerStore.getState().tick(0, sources);
  };
  const stops = [bankStore.subscribe(refresh), citStore.subscribe(refresh)];
  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    const s = hopPlayerStore.getState();
    if (s.session || sources.some((x) => x && !x.over)) s.tick(dt, sources, hopFrozen(bankStore.getState(), s.session));
  }, HOP_TICK_MS);
  return () => {
    stops.forEach((f) => f());
    clearInterval(timer);
  };
}
