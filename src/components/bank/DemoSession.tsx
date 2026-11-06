import { useSyncExternalStore, type ReactNode } from 'react';
import { citDemoBusy } from '../../sim/citEngine';
import { bankStore } from '../../store/bankStore';
import { citStore } from '../../store/citStore';
import { demoSessionStore, useDemoSession, type DemoRun } from '../../store/demoSessionStore';
import { hopPlayerStore } from '../../store/hopPlayerStore';
import { deskVisitStore } from '../../store/deskVisitStore';
import { vaultFlowStore } from '../../store/vaultFlowStore';
import { isolateView } from '../../engine/simulation/deskStatus';
import type { BankView } from '../../sim/types';
import { useMessages } from '../../utils/i18nHelper';
import { citNow } from '../ops/citActions';
import { Modal } from '../shell/Modal';
import { retailOpsMessages } from './retailOps.messages';

/**
 * The running demo's lock (store/demoSessionStore.ts): whether the learner's run is still going is read from the stores that play
 * it (Observer), so a run that finishes unlocks the navigation by itself and a cancelled one is gone at once.
 */

/** Whether `run` is still playing: its payment or CIT run is not over, or the hop player is still showing it. */
export function demoRunning(run: DemoRun | null = demoSessionStore.getState().active): boolean {
  if (!run) return false;
  const hop = hopPlayerStore.getState().session?.id;
  const bank = bankStore.getState();
  switch (run.kind) {
    case 'payment':
      return hop === `tx:${run.id}` || (bank.presetTxId === run.id && bank.presetTrace !== null && !bank.presetTrace.done);
    case 'sandbox':
      return bank.sandboxTrace?.id === run.id;
    case 'cit':
      // Until it settles and the 3D van has driven off the bay (the dispatch lock), and the hop player has shown its last stop.
      return hop === `cit:${run.runId}` || citDemoBusy(citNow())?.order.id === run.runId || citStore.getState().van;
  }
}

const STORES = [bankStore, citStore, hopPlayerStore, demoSessionStore] as const;
/** Hears every change that can start, move or end a demo. */
export const subscribeDemo = (fn: () => void): (() => void) => {
  const stops = STORES.map((s) => s.subscribe(fn));
  return () => stops.forEach((stop) => stop());
};

/** Whether a demo is running now: the menus, the dock's pickers and the drawer's selectors are locked while it is. */
export const demoLocked = (): boolean => demoRunning();
export const useDemoLocked = (): boolean => useSyncExternalStore(subscribeDemo, demoLocked, demoLocked);

/**
 * Whether the stage shows only the demo's own case (both maps: packets, queues, passers-by, off-route wires): while a demo runs, and
 * after it ends until the bank's own clock moves again (Play, Step, a skip), so its completion never brings anyone else back on stage.
 */
export const stageIsolated = (): boolean => demoLocked() || demoSessionStore.getState().held !== null;
export const useStageIsolated = (): boolean => useSyncExternalStore(subscribeDemo, stageIsolated, stageIsolated);

/** How an element off the lit route is drawn: not at all on a demo's stage, dimmed otherwise. */
export const offRouteOpacity = (isolated: boolean): number => (isolated ? 0 : 0.15);

let isolatedView: { view: BankView; own: string | null; out: BankView } | null = null;
/**
 * The bank's view as the desks show it (badges, lines, heat, both maps): the bank's own view, or while a demo runs only its case
 * (deskStatus.isolateView), so a desk counts exactly the demo's customers and none of the paused bank's. The same object until it changes.
 */
export function deskView(): BankView {
  const { view } = bankStore.getState();
  if (!stageIsolated()) return view;
  const run = demoSessionStore.getState().active;
  const own = run?.kind === 'payment' ? run.id : null;
  if (isolatedView?.view !== view || isolatedView.own !== own) isolatedView = { view, own, out: isolateView(view, own) };
  return isolatedView.out;
}
export const useDeskView = (): BankView => useSyncExternalStore(subscribeDemo, deskView, deskView);
/** One value read from deskView (a desk's status, its staff at work), re-rendering only when it changes: return a primitive or a part of the view. */
export function useDeskViewOf<T>(select: (view: BankView) => T): T {
  const read = (): T => select(deskView());
  return useSyncExternalStore(subscribeDemo, read, read);
}

/**
 * Purges every entity on the stage: the people at the counters (a walk-in, a frozen visitor, a demo's own) and the vault's cash
 * echoes, so no ghost customer or counter outlives its case. Spawns nothing.
 */
export function destroyAllActiveEntities(): void {
  deskVisitStore.getState().clear();
  vaultFlowStore.getState().clear();
}

/** Before any demo starts: the bank pauses (the demo plays alone on its solo run), the stage is cleared and held clean. */
export function preScenarioReset(): void {
  const bank = bankStore.getState();
  if (bank.playing) bank.pause();
  destroyAllActiveEntities();
  const { day, minute } = bankStore.getState().view;
  demoSessionStore.getState().hold({ day, minute });
}

/**
 * The moment a demo reaches its end or is cancelled: silent. Every entity goes, nothing new is spawned, the clock stays paused and
 * the clean stage is held (queues read "0 waiting") until the learner plays the bank on.
 */
export function postScenarioCleanup(): void {
  destroyAllActiveEntities();
  const { day, minute } = bankStore.getState().view;
  demoSessionStore.getState().finish({ day, minute });
}

/**
 * While a demo runs, only its own case is drawn (both maps): the simulation's other packets, the queues at the desks and the passers-by
 * are hidden, so a learner watching a night batch or one teller withdrawal sees that case alone. `own` is the demo's payment, or null
 * (a CIT run, a replay: the hop player draws those, so no simulation packet shows).
 */
export const isolateMoves = <M extends { packetId: string }>(moves: readonly M[], isolated: boolean, own: string | null): readonly M[] => (isolated ? moves.filter((m) => m.packetId === own) : moves);

/**
 * The one execution-lock guard for a trigger that reaches the stores directly (the welcome window, the regulatory registry's scenario
 * links, the Academy's "Simulate this Flow"): while a demo runs it does nothing, as the dock and the menus do.
 */
export const guarded =
  <A extends unknown[]>(fn: (...args: A) => void) =>
  (...args: A): void => {
    if (!demoLocked()) fn(...args);
  };

/** Stops the running demo where it is: a CIT run is taken back (its postings were derived, so they go with it), the clock stays paused. */
export function cancelDemo(): void {
  const run = demoSessionStore.getState().active;
  if (run?.kind === 'cit') citStore.getState().cancel(run.runId);
  bankStore.getState().clearDemo();
  hopPlayerStore.getState().reset();
  postScenarioCleanup();
}

/** Keeps the session tidy: a run that has finished is closed, and a sandbox replay is dropped once the hop player has shown it. Returns the way to stop. */
export function installDemoSession(): () => void {
  let shown: string | null = null;
  const check = (): void => {
    const bank = bankStore.getState();
    const hop = hopPlayerStore.getState().session?.id ?? null;
    const box = bank.sandboxTrace ? `sbx:${bank.sandboxTrace.id}` : null;
    if (box && hop === box) shown = box;
    else if (box && shown === box) {
      shown = null;
      bankStore.setState({ sandboxTrace: null });
      return;
    }
    const { active, held } = demoSessionStore.getState();
    if (active && !demoRunning(active)) postScenarioCleanup();
    // The held clean stage gives way once the bank's own clock moves on (Play, Step, a skip, a new day).
    else if (held && ((bank.playing && !bank.solo) || bank.view.day !== held.day || bank.view.minute !== held.minute)) demoSessionStore.getState().release();
  };
  return subscribeDemo(check);
}

/** The run button while no demo runs; "Hủy demo" (asking first) while one does. */
export function RunOrCancel({ children }: { children: ReactNode }) {
  const m = useMessages(retailOpsMessages);
  const locked = useDemoLocked();
  if (!locked) return <>{children}</>;
  return (
    <button type="button" onClick={() => demoSessionStore.getState().askCancel()} title={m('demoLocked')} data-testid="demo-cancel" className="shrink-0 whitespace-nowrap rounded-lg bg-rose-500 px-3 py-1.5 text-[12px] font-bold text-white shadow transition hover:bg-rose-400">
      ✕ {m('cancelDemo')}
    </button>
  );
}

/** The open dialog: shown while the learner is asked (demoSessionStore.confirming). */
export function CancelDemoDialog() {
  const confirming = useDemoSession((s) => s.confirming);
  return confirming ? <CancelDemoView onKeep={() => demoSessionStore.getState().dismissCancel()} onConfirm={cancelDemo} /> : null;
}

/** "Bạn có chắc chắn muốn hủy demo?": the run stops only on Yes. */
export function CancelDemoView({ onKeep: keep, onConfirm }: { onKeep: () => void; onConfirm: () => void }) {
  const m = useMessages(retailOpsMessages);
  return (
    <Modal
      title={m('cancelDemoTitle')}
      icon="⚠️"
      onClose={keep}
      width="max-w-md"
      z="z-[130]"
      testId="cancel-demo-dialog"
      footer={
        <>
          <button type="button" onClick={keep} data-testid="cancel-demo-keep" className="rounded-lg border border-slate-600 px-3 py-1.5 text-[13px] font-semibold text-slate-200 hover:bg-slate-800">
            {m('cancelDemoKeep')}
          </button>
          <button type="button" onClick={onConfirm} data-testid="cancel-demo-confirm" className="rounded-lg bg-rose-500 px-3 py-1.5 text-[13px] font-bold text-white hover:bg-rose-400">
            {m('cancelDemoConfirm')}
          </button>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed text-slate-200" data-testid="cancel-demo-body">
        {m('cancelDemoBody')}
      </p>
    </Modal>
  );
}
