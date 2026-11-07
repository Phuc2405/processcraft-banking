import { CATEGORY_ICON, flowIcon } from '../../sim/transactionPath';
import { citDemoBusy, type CitRun } from '../../sim/citEngine';
import { CIT_STOPS, citReached, citStops } from '../../sim/citRoute';
import { vanStepCap, type VanStage } from '../../sim/citCrew';
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

/**
 * Where the 3D van stands on a run, while the 3D office is on screen (its world registers this); null in 2D, whose bay has no van to
 * wait for. The CIT step badge reads it so it never runs ahead of the van (citCrew.vanStepCap).
 */
let vanStageOf: ((runId: string) => VanStage | null) | null = null;
export function setCitVanStage(read: ((runId: string) => VanStage | null) | null): void {
  vanStageOf = read;
}

/** The learner's CIT run: the vault, the bay and the far end, as far as its lifecycle (and, in 3D, its van) has got. */
export function citSource(run: Pick<CitRun, 'order' | 'status'> | null, vanStage: ((runId: string) => VanStage | null) | null = vanStageOf): HopSource | null {
  if (!run) return null;
  const ids = citStops(run.order.scenario, run.order.direction);
  const stops = ids.map((cit) => ({ place: CIT_STOPS[cit].place, cit }));
  const over = run.status === 'SETTLED';
  const stage = over || !vanStage ? null : vanStage(run.order.id);
  const cap = vanStepCap(ids, stage);
  const reached = cap === null ? citReached(run) : Math.min(citReached(run), cap);
  return { id: `cit:${run.order.id}`, kind: 'cit', stops, route: [], icon: CATEGORY_ICON.cash, reached, over, hold: stage?.phase === 'depart' };
}

/** A closed day's sandbox replay: the whole route is already known, so the player shows every stop at its own pace. */
export function sandboxSource(t: Pick<PacketTrace, 'id' | 'route'> | null): HopSource | null {
  if (!t || t.route.length === 0) return null;
  return { id: `sbx:${t.id}`, kind: 'payment', stops: t.route.map((place) => ({ place, cit: null })), route: t.route, icon: flowIcon(t.route), reached: t.route.length - 1, over: false };
}

/** The runs the player may show now: the learner's payment (not during a tour), a sandbox replay and their CIT dispatch. */
export function hopSources(): (HopSource | null)[] {
  const bank = bankStore.getState();
  return [bank.spotlight ? null : paymentSource(bank.presetTrace), sandboxSource(bank.sandboxTrace), citSource(citDemoBusy(citNow())) ?? vanHeldSource()];
}

/**
 * The CIT run on show after the CIT book has settled it, while the 3D van is still out for it: the books close the run as the cash is
 * handed over at the bay, but the van has yet to drive off. The badge keeps to the van (vanStepCap), so the last step shows only once
 * the van pulls away; once the van is done with the run, it is gone and the play finishes its last stop.
 */
function vanHeldSource(): HopSource | null {
  const session = hopPlayerStore.getState().session;
  if (!vanStageOf || session?.kind !== 'cit') return null;
  const stage = vanStageOf(session.id.slice('cit:'.length));
  // A settled run whose van never came (the office opened mid-run) is not waited for.
  const cap = stage?.phase === 'pending' ? null : vanStepCap(session.stops.map((s) => s.cit ?? ''), stage);
  return cap === null ? null : { ...session, reached: cap, over: false, hold: stage?.phase === 'depart' };
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
    // The 3D van moves every frame, not on a store change: its run's furthest stop is re-read each tick.
    if (vanStageOf && s.session?.kind === 'cit') sources = hopSources();
    if (s.session || sources.some((x) => x && !x.over)) s.tick(dt, sources, hopFrozen(bankStore.getState(), s.session));
  }, HOP_TICK_MS);
  return () => {
    stops.forEach((f) => f());
    clearInterval(timer);
  };
}
