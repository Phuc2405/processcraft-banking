import { memo, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { pick, tr, useLocale } from '../../i18n/locale';
import { demoActionsFor, demoBlocked, type DemoAction } from '../../sim/demoActions';
import { flowText, GUIDED_FLOWS } from '../../sim/guidedFlows';
import type { PresetVariant } from '../../sim/presets';
import { cassetteStatus, opsSubProcess } from '../../sim/retailOps';
import { opsLessonAnchor } from '../../data/retailOpsKnowledge';
import { activeFlowOf, useBankStore } from '../../store/bankStore';
import { formatAud } from '../../engine/money';
import { retailOpsStore, useRetailOpsStore } from '../../store/retailOpsStore';
import { uiStore } from '../../store/uiStore';
import { useMessages } from '../../utils/i18nHelper';
import { AdaptivePopover, listboxKey } from '../shell/AdaptivePopover';
import { retailOpsMessages } from './retailOps.messages';
import { opsStamp, runDemo } from './retailOpsActions';
import { topBand, useMeasuredBox, useRightInset, useTopBand } from './ViewportControls';

/** The one demo bar of the guided flow in focus, anchored at the bottom of the map in the Beginner scope. Every control runs through runDemo. */

const VARIANT: Record<PresetVariant, string> = {
  success: 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400',
  danger: 'bg-rose-500 text-white hover:bg-rose-400',
  primary: 'bg-sky-500 text-sky-950 hover:bg-sky-400',
  warning: 'bg-amber-400 text-amber-950 hover:bg-amber-300',
};

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
  const locked = counterLocked && action.sub === 'teller-vault';
  const why = demoBlocked(action.id, { dayOver, minute });
  const title = locked ? m('theCounterIsLockedUntil') : why === 'dayOver' ? tr({ en: 'Today is over: start the next day (or reset this one) to send another payment.', vi: 'Hôm nay đã kết thúc: hãy bắt đầu ngày mới (hoặc chạy lại ngày này) để gửi giao dịch khác.' }) : why === 'night' ? tr({ en: 'The branch is closed for the night cycle. Start the next day to send another payment.', vi: 'Chi nhánh đã đóng cửa cho chu kỳ ban đêm. Hãy bắt đầu ngày mới để gửi giao dịch khác.' }) : action.hint();
  return { disabled: why !== null || locked, title };
}

function DemoButton({ action }: { action: DemoAction }) {
  const { disabled, title } = useDemoState(action);
  return (
    <button type="button" onClick={() => runDemo(action.id)} disabled={disabled} title={title} data-testid={action.testId} data-variant={action.variant} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-bold shadow transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT[action.variant]}`}>
      <span aria-hidden="true">{action.icon}</span> {action.label()}
    </button>
  );
}

/** The bar on a narrow or short map: pick a scenario from a list that opens upwards, then run it. */
function DemoSelector({ actions }: { actions: readonly DemoAction[] }) {
  const m = useMessages(retailOpsMessages);
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const chosen = actions.find((a) => a.id === picked) ?? actions[0];
  const [active, setActive] = useState(0);
  const { disabled, title } = useDemoState(chosen);
  useEffect(() => {
    if (open) setActive(Math.max(0, actions.findIndex((a) => a.id === chosen?.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const choose = (a: DemoAction | undefined): void => {
    if (a) setPicked(a.id);
    setOpen(false);
    trigger.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (!open) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    const next = listboxKey(e.key, active, actions.length);
    if (next === null) return;
    e.preventDefault();
    if (next === 'pick') choose(actions[active]);
    else if (next === 'close') {
      e.stopPropagation();
      setOpen(false);
    } else setActive(next);
  };
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" data-testid="demo-selector">
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={m('selectScenario')}
        title={m('selectScenario')}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        data-testid="demo-select"
        data-picked={chosen?.id}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[12px] font-semibold text-slate-100 transition hover:bg-slate-800"
      >
        <span className={`shrink-0 text-[10px] text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          🔼
        </span>
        <span className="min-w-0 truncate">{chosen ? chosen.label() : m('selectScenario')}</span>
      </button>
      <button type="button" onClick={() => chosen && runDemo(chosen.id)} disabled={disabled} title={title} data-testid="demo-run" className="shrink-0 whitespace-nowrap rounded-lg bg-emerald-500 px-3 py-1.5 text-[12px] font-bold text-emerald-950 shadow transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">
        ▶ {m('runDemo')}
      </button>
      {open && (
        <AdaptivePopover anchor={trigger} onClose={() => setOpen(false)} direction="up" width={380} maxVh={0.45} maxPx={320} align="start" id={listId} label={m('selectScenario')} testId="demo-select-list" activeIndex={active}>
          {actions.map((a, i) => (
            <li key={a.id} id={`${listId}-${i}`} role="option" aria-selected={a.id === chosen?.id} data-index={i} data-testid={`demo-option-${a.id}`} title={a.hint()} onPointerMove={() => setActive(i)} onClick={() => choose(a)} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-slate-100 ${i === active ? 'bg-slate-800' : ''}`}>
              <span aria-hidden="true">{a.icon}</span>
              <span className="min-w-0 flex-1">{a.label()}</span>
              {a.id === chosen?.id && (
                <span aria-hidden="true" className="text-emerald-300">
                  ✓
                </span>
              )}
            </li>
          ))}
        </AdaptivePopover>
      )}
    </div>
  );
}

function PresetDockView() {
  const m = useMessages(retailOpsMessages);
  const locale = useLocale();
  const flow = useBankStore(activeFlowOf);
  const sub = useBankStore((s) => s.subProcess);
  const solid = useBankStore((s) => s.viewMode === '3d');
  const running = useBankStore((s) => s.presetTrace !== null && !s.presetTrace.done);
  const right = useRightInset();
  const shortMap = useTopBand((s) => s.shortMap);
  const mapW = useTopBand((s) => s.mapW);
  const vault = useRetailOpsStore((s) => s.book.vaultPrompt);
  const cassetteLow = cassetteStatus(useRetailOpsStore((s) => s.book)).low;
  const box = useRef<HTMLDivElement>(null);
  // What stands on top of the bar (the ledger) keeps clear of it, whatever height the bar takes.
  useMeasuredBox(box, (b) => topBand.setState({ demoDock: b }), [flow, sub, shortMap, mapW, right, vault, cassetteLow]);
  useEffect(() => {
    if (!flow) topBand.setState({ demoDock: null });
  }, [flow]);
  if (!flow) return null;
  const f = GUIDED_FLOWS[flow];
  const ft = flowText(flow);
  const actions = demoActionsFor(flow, sub);
  const compact = dockIsCompact(mapW - right, shortMap, typeof window === 'undefined' ? Infinity : window.innerWidth);
  return (
    // The middle of what the inspector and the zoom toolbar leave free, so the bar never slides under them.
    <div
      ref={box}
      style={{ left: `calc(50% - ${Math.round(right / 2)}px)`, maxWidth: `calc(100% - ${right + 24}px)`, ...(compact ? { width: `calc(100% - ${right + 24}px)` } : {}) }}
      className={`absolute bottom-0 z-20 flex ${compact ? '' : 'w-max flex-wrap'} -translate-x-1/2 items-center gap-2 rounded-t-2xl transition-[left] duration-200 ease-out border border-b-0 border-slate-800 px-3 py-2 shadow-2xl ${solid ? 'bg-slate-900/95' : 'bg-slate-950/90 backdrop-blur-md'}`}
      role="toolbar"
      aria-label={tr({ en: `${ft.title} actions`, vi: `Thao tác ${ft.title}` })}
      data-testid="preset-dock"
      data-flow={flow}
      data-sub={sub ?? undefined}
      data-compact={compact}
    >
      {!compact && (
        <span className="mr-1 whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wider" style={{ color: f.accent }}>
          {sub ? pick(opsSubProcess(sub).title, locale) : `${f.code}. ${ft.title}`}
        </span>
      )}
      {sub && (
        <button type="button" onClick={() => uiStore.getState().openKnowledge(opsLessonAnchor(sub))} title={m('openThisSubProcessS')} aria-label={m('openThisSubProcessS')} data-testid={`ops-lesson-${sub}`} className="shrink-0 text-[13px]">
          📖
        </button>
      )}
      {compact ? (
        // Keyed by the list: another flow starts from its own first scenario.
        <DemoSelector key={`${flow}-${sub ?? ''}`} actions={actions} />
      ) : (
        actions.map((a) => <DemoButton key={a.id} action={a} />)
      )}
      {flow === 6 && vault && (
        // The transfer is mandatory, so it stays one click away even with the inspector closed.
        <button type="button" onClick={() => retailOpsStore.getState().transferToVault(opsStamp())} title={m('transferToTheVault', { surplus: formatAud(vault.surplusCents) })} data-testid="dock-vault-transfer" className="shrink-0 whitespace-nowrap rounded-lg bg-amber-400 px-3 py-1.5 text-[12px] font-bold text-amber-950 shadow hover:bg-amber-300">
          ⚠️ {compact ? m('vaultTransferShort') : m('transferToTheVault', { surplus: formatAud(vault.surplusCents) })}
        </button>
      )}
      {flow === 3 && cassetteLow && (
        // Only while a refill is due: the warning has no payment to inspect, so its one action lives here.
        <button type="button" onClick={() => retailOpsStore.getState().refillCassette(opsStamp())} data-testid="dock-cassette-refill" className="shrink-0 whitespace-nowrap rounded-lg bg-amber-400 px-3 py-1.5 text-[12px] font-bold text-amber-950 shadow hover:bg-amber-300">
          🚚 {m('citRefill')}
        </button>
      )}
      {running && !compact && (
        <span className="whitespace-nowrap text-[11px] text-slate-400" role="status" data-testid="preset-running">
          {tr({ en: 'Payment on its way…', vi: 'Giao dịch đang di chuyển…' })}
        </span>
      )}
    </div>
  );
}

export const PresetDock = memo(PresetDockView);
