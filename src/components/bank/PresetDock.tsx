import { memo, useEffect, useRef } from 'react';
import { activeLocale, pick, tr, useLocale } from '../../i18n/locale';
import { acronymHint } from './codeGlossary';
import { demoActionById, demoActionsFor, demoBlocked, type DemoAction } from '../../sim/demoActions';
import { demoGroup, groupOf, showsGroupsOf } from '../../sim/demoGroups';
import { shiftOf, shiftSnap } from '../../sim/demoSchedule';
import { shiftQueueStore, useShiftQueue } from '../../store/shiftQueueStore';
import { flowText, GUIDED_FLOWS } from '../../sim/guidedFlows';
import type { PresetVariant } from '../../sim/presets';
import { cassetteStatus } from '../../sim/retailOps';
import { activeFlowOf, citChildOf, useBankStore } from '../../store/bankStore';
import { formatAud } from '../../engine/money';
import { retailOpsStore, useRetailOpsStore } from '../../store/retailOpsStore';
import { childFocusStore, useChildFocusId, useChildPlaces } from '../../store/childFocusStore';
import { useMessages } from '../../utils/i18nHelper';
import { ScenarioPicker } from './ScenarioPicker';
import { RunOrCancel, useDemoLocked } from './DemoSession';
import { retailOpsMessages } from './retailOps.messages';
import { focusChild, opsStamp, runDemo, showLitInfo } from './retailOpsActions';
import { topBand, useInspectorCovers, useMeasuredBox, useRightInset, useTopBand } from './ViewportControls';
import { dockLayout } from './dockOverflow';
import { refillAtmByCit } from '../ops/citActions';
import { LessonLink } from '../ops/LessonLink';
import { CitDemoPicker, CitDockButton } from '../ops/CitPanel';
import { CIT_FLOW } from '../../types/viewport';
import { CIT_INFO_KEYS } from '../../data/subProcessKeys';
import { CIT_SHEETS } from '../../data/subProcessCitSheets';

/** The one demo bar of the guided flow in focus, anchored at the bottom of the map in the Beginner scope. Every control runs through runDemo. */

const VARIANT: Record<PresetVariant, string> = {
  success: 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400',
  danger: 'bg-rose-500 text-white hover:bg-rose-400',
  primary: 'bg-sky-500 text-sky-950 hover:bg-sky-400',
  warning: 'bg-amber-400 text-amber-950 hover:bg-amber-300',
};

/** The pass / fail colour of a scenario in the dropdown, so both sides of the decision stay readable without the pills. */
const DOT: Record<PresetVariant, string> = { success: 'bg-emerald-400', danger: 'bg-rose-400', primary: 'bg-sky-400', warning: 'bg-amber-300' };

/** Under this free width (the map less the inspector and zoom toolbar), the pills would stack into rows, so the bar becomes a selector. */
export const COMPACT_DOCK_PX = 640;

/** Whether the bar shows a selector and a Run button instead of its pills. An unmeasured map (0) counts as wide. */
export const dockIsCompact = (freeWidth: number, shortMap: boolean, windowWidth: number): boolean => shortMap || windowWidth < 1024 || (freeWidth > 0 && freeWidth < COMPACT_DOCK_PX);

/** Whether a demo can run now, and what its tooltip says. */
function useDemoState(action: DemoAction | undefined): { disabled: boolean; title: string } {
  const m = useMessages(retailOpsMessages);
  const dayOver = useBankStore((s) => s.view.dayOver);
  const minute = useBankStore((s) => s.view.minute);
  const counterLocked = useRetailOpsStore((s) => s.book.vaultPrompt !== null);
  if (!action) return { disabled: true, title: '' };
  const locked = counterLocked && action.group === 'teller-vault';
  // A counter button stays live after the day: it offers to replay today up to 16:30.
  const shift = shiftOf(action.id);
  // A 24/7 channel stays live after midnight (it rolls the bank into the next day), as a counter button does (it replays today up to 16:30).
  const why = shift === 'always' || shiftSnap(action.id, minute)?.direction === 'back' ? null : demoBlocked(action.id, { dayOver, minute });
  const hint = shift === 'always' ? action.hint() : `${action.hint()} ${m(shift === 'day' ? 'shiftHintDay' : 'shiftHintEod')}`;
  const title = locked ? m('theCounterIsLockedUntil') : why === 'dayOver' ? tr({ en: 'Today is over: start the next day (or reset this one) to send another payment.', vi: 'Hôm nay đã kết thúc: hãy bắt đầu ngày mới (hoặc chạy lại ngày này) để gửi giao dịch khác.' }) : hint;
  return { disabled: why !== null || locked, title: acronymHint(title, activeLocale()) };
}

function DemoButton({ action }: { action: DemoAction }) {
  const { disabled, title } = useDemoState(action);
  return (
    <button type="button" onClick={() => runDemo(action.id)} disabled={disabled} title={title} data-testid={action.testId} data-variant={action.variant} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-bold shadow transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT[action.variant]}`}>
      <span aria-hidden="true">{action.icon}</span> {action.label()}
    </button>
  );
}

/**
 * The bar on a narrow or short map: pick a scenario from the shared dropdown (ScenarioPicker), then run it. The pick is the one
 * child focus (childFocusStore), so the dropdown, the map and the drawer always name the same scenario; it is read-only while a
 * demo runs, so the running case can never be switched under it.
 */
function DemoSelector({ actions }: { actions: readonly DemoAction[] }) {
  const m = useMessages(retailOpsMessages);
  const focused = useChildFocusId();
  const locked = useDemoLocked();
  const chosen = actions.find((a) => a.id === focused) ?? actions[0];
  const { disabled, title } = useDemoState(chosen);
  const items = actions.map((a) => ({ id: a.id, icon: a.icon, label: a.label(), hint: a.hint(), dot: DOT[a.variant] }));
  return (
    <ScenarioPicker items={items} picked={chosen?.id ?? ''} onPick={(id) => focusChild(id as DemoAction['id'])} label={m('selectScenario')} testId="demo" disabled={locked}>
      <RunOrCancel>
        <button type="button" onClick={() => chosen && runDemo(chosen.id)} disabled={disabled} title={title} data-testid="demo-run" className="shrink-0 whitespace-nowrap rounded-lg bg-emerald-500 px-3 py-1.5 text-[12px] font-bold text-emerald-950 shadow transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">
          ▶ {m('runDemo')}
        </button>
      </RunOrCancel>
    </ScenarioPicker>
  );
}

/** "ℹ️ Process info": brings the drawer back on the lit sheet once it was closed (it hides while the sheet is open). */
function InfoButton({ compact }: { compact: boolean }) {
  const m = useMessages(retailOpsMessages);
  const open = useBankStore((s) => s.selection.kind === 'subprocess');
  if (open) return null;
  return (
    <button type="button" onClick={showLitInfo} title={m('processInfoHint')} aria-label={m('processInfo')} data-testid="dock-info" className="shrink-0 whitespace-nowrap rounded-lg border border-sky-400/50 bg-sky-500/15 px-2.5 py-1.5 text-[12px] font-semibold text-sky-100 transition hover:bg-sky-500/25">
      <span aria-hidden="true">ℹ️</span>
      {compact ? null : <> {m('processInfo')}</>}
    </button>
  );
}

/** "👁️ Show all desks": shown while a picked child soft-dims its sub-process, it brings every desk back to full opacity. */
function ShowAllDesks({ compact }: { compact: boolean }) {
  const m = useMessages(retailOpsMessages);
  const child = useChildPlaces();
  // Hidden while a demo runs, so the bar stays uncluttered: it is back once the run has finished or been cancelled.
  const locked = useDemoLocked();
  if (!child || locked) return null;
  return (
    <button type="button" onClick={() => childFocusStore.getState().reset()} title={m('showAllDesksHint')} data-testid="show-all-desks" className="shrink-0 whitespace-nowrap rounded-lg border border-slate-600 bg-slate-800/80 px-2.5 py-1.5 text-[12px] font-semibold text-slate-100 transition hover:bg-slate-700">
      <span aria-hidden="true">👁️</span> {compact ? m('showAllDesksShort') : m('showAllDesks')}
    </button>
  );
}

/** The buttons pressed outside their shift that the learner chose to wait with: each runs by itself when its window opens. */
function WaitingChips() {
  const m = useMessages(retailOpsMessages);
  const waiting = useShiftQueue((s) => s.waiting);
  if (!waiting.length) return null;
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5" role="status" data-testid="shift-waiting">
      <span className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wider text-amber-300">⏳ {m('shiftWaitingTitle')}</span>
      {waiting.map((w) => {
        const label = demoActionById(w.id).label();
        return (
          <span key={w.id} className="flex min-w-0 max-w-[16rem] items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 py-0.5 pl-2 pr-1 text-[11px] font-semibold text-amber-100" data-testid={`shift-waiting-${w.id}`} data-shift={w.shift}>
            <span className="min-w-0 truncate" title={label}>
              {label} · {w.shift === 'day' ? '09:00' : '23:00'}
            </span>
            <button type="button" onClick={() => shiftQueueStore.getState().unqueue(w.id)} aria-label={m('shiftWaitingRemove', { label })} title={m('shiftWaitingRemove', { label })} className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[12px] leading-none text-amber-200 hover:bg-amber-400/20">
              ×
            </button>
          </span>
        );
      })}
    </div>
  );
}

function PresetDockView() {
  const m = useMessages(retailOpsMessages);
  const locale = useLocale();
  const flow = useBankStore(activeFlowOf);
  const sub = useBankStore((s) => groupOf(s.subProcess));
  // Flow 09's dock is the CIT dispatch: the picked child's own run (top menu → Flow 09 → child), else the scenario dropdown.
  const citPicked = useBankStore(citChildOf);
  const solid = useBankStore((s) => s.viewMode === '3d');
  const running = useBankStore((s) => s.presetTrace !== null && !s.presetTrace.done);
  const right = useRightInset();
  const shortMap = useTopBand((s) => s.shortMap);
  const mapW = useTopBand((s) => s.mapW);
  const vault = useRetailOpsStore((s) => s.book.vaultPrompt);
  const waitingCount = useShiftQueue((s) => s.waiting.length);
  const covered = useInspectorCovers();
  const cassetteLow = cassetteStatus(useRetailOpsStore((s) => s.book)).low;
  const box = useRef<HTMLDivElement>(null);
  // What stands on top of the bar (the ledger) keeps clear of it, whatever height the bar takes.
  useMeasuredBox(box, (b) => topBand.setState({ demoDock: b }), [flow, sub, citPicked, shortMap, mapW, right, vault, cassetteLow, waitingCount]);
  useEffect(() => {
    if (!flow || covered) topBand.setState({ demoDock: null });
  }, [flow, covered]);
  if (!flow || covered) return null;
  const f = GUIDED_FLOWS[flow];
  const ft = flowText(flow);
  const actions = demoActionsFor(flow, sub);
  // A single-group flow's dock is titled by its flow, as the menu lists it; the 📖 lesson is the retail book's, so core groups have none.
  const group = sub && showsGroupsOf(flow) ? demoGroup(sub) : null;
  // Every sub-process has a lesson now (data/subProcessLessons.ts): the group's, or its flow's.
  const lesson = sub && demoGroup(sub).flow === flow ? sub : (`flow-${flow}` as const);
  const cit = flow === CIT_FLOW ? citPicked : null;
  const citFlow = flow === CIT_FLOW;
  const citSheet = cit ? CIT_SHEETS.find((c) => c.key === CIT_INFO_KEYS[cit]) : undefined;
  const title = citSheet ? pick(citSheet.title, locale) : group ? pick(group.title, locale) : `${f.code}. ${ft.title}`;
  const free = mapW > 0 ? mapW - right - 24 : 1280;
  // One row only: what the title, the lesson link and the padding leave of the free width must hold every pill, or the whole area is a dropdown.
  const budget = free - Math.round(title.length * 6.2 + 24) - 30 - 32;
  const windowW = typeof window === 'undefined' ? Infinity : window.innerWidth;
  const compact = dockIsCompact(mapW - right, shortMap, windowW);
  const dropdown = !citFlow && (compact || dockLayout(actions.map((a) => ({ id: a.id, variant: a.variant, text: `${a.icon} ${a.label()}` })), budget, windowW) === 'dropdown');
  return (
    // The middle of what the inspector and the zoom toolbar leave free, so the bar never slides under them.
    <div
      ref={box}
      style={{ left: `calc(50% - ${Math.round(right / 2)}px)`, maxWidth: `calc(100% - ${right + 24}px)`, ...(compact ? { width: `calc(100% - ${right + 24}px)` } : dropdown ? { width: `min(760px, calc(100% - ${right + 24}px))` } : {}) }}
      className={`absolute bottom-0 z-20 flex flex-col ${dropdown ? '' : 'w-max'} -translate-x-1/2 gap-1.5 rounded-t-2xl transition-[left] duration-200 ease-out border border-b-0 border-slate-800 px-3 py-2 shadow-2xl ${solid ? 'bg-slate-900/95' : 'bg-slate-950/90 backdrop-blur-md'}`}
      role="toolbar"
      aria-label={tr({ en: `${ft.title} actions`, vi: `Thao tác ${ft.title}` })}
      data-testid="preset-dock"
      data-flow={flow}
      data-sub={sub ?? undefined}
      data-cit={cit ?? undefined}
      data-compact={compact}
      data-layout={dropdown ? 'dropdown' : 'inline'}
    >
      <WaitingChips />
      {/* One row: the title gives way first (an ellipsis, its full text the tooltip), then the scenario name; the buttons never shrink. */}
      <div className={`flex min-w-0 items-center gap-2 ${dropdown ? '' : 'flex-wrap'}`} data-testid="preset-dock-row">
      {!compact && (
        <button type="button" onClick={showLitInfo} title={title} data-testid="preset-dock-title" className={`mr-1 min-w-0 truncate text-left text-[10.5px] font-bold uppercase tracking-wider hover:underline ${dropdown ? 'max-w-[28%] shrink' : 'max-w-[22rem]'}`} style={{ color: f.accent }}>
          {title}
        </button>
      )}
      <LessonLink lessonKey={cit ? CIT_INFO_KEYS[cit] : lesson} className="text-[13px]" />
      {cit ? (
        <CitDockButton kind={cit} />
      ) : citFlow ? (
        <CitDemoPicker />
      ) : dropdown ? (
        // Keyed by the list: another flow starts from its own first scenario.
        <DemoSelector key={`${flow}-${sub ?? ''}`} actions={actions} />
      ) : (
        <RunOrCancel>{actions.map((a) => <DemoButton key={a.id} action={a} />)}</RunOrCancel>
      )}
      {flow === 6 && vault && (
        // The transfer is mandatory, so it stays one click away even with the inspector closed.
        <button type="button" onClick={() => retailOpsStore.getState().transferToVault(opsStamp())} title={m('transferToTheVault', { surplus: formatAud(vault.surplusCents) })} data-testid="dock-vault-transfer" className="shrink-0 whitespace-nowrap rounded-lg bg-amber-400 px-3 py-1.5 text-[12px] font-bold text-amber-950 shadow hover:bg-amber-300">
          ⚠️ {compact ? m('vaultTransferShort') : m('transferToTheVault', { surplus: formatAud(vault.surplusCents) })}
        </button>
      )}
      {flow === 3 && cassetteLow && (
        // Only while a refill is due: the warning has no payment to inspect, so its one action lives here.
        <button type="button" onClick={refillAtmByCit} data-testid="dock-cassette-refill" className="shrink-0 whitespace-nowrap rounded-lg bg-amber-400 px-3 py-1.5 text-[12px] font-bold text-amber-950 shadow hover:bg-amber-300">
          🚚 {m('citRefill')}
        </button>
      )}
      {/* Beside a dropdown the reset takes its short label, so the scenario's own name keeps the room. */}
      {!citFlow && <ShowAllDesks compact={compact || dropdown} />}
      <InfoButton compact={compact || dropdown} />
      {running && !compact && !dropdown && (
        <span className="whitespace-nowrap text-[11px] text-slate-400" role="status" data-testid="preset-running">
          {tr({ en: 'Payment on its way…', vi: 'Giao dịch đang di chuyển…' })}
        </span>
      )}
      </div>
    </div>
  );
}

export const PresetDock = memo(PresetDockView);
