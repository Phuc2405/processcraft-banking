import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { pick, useLocale } from '../../i18n/locale';
import { flowText, GUIDED_FLOWS } from '../../sim/guidedFlows';
import { demoGroup, demoGroupsIn, showsGroupsOf, type DemoGroupId } from '../../sim/demoGroups';
import { bankStore, useBankStore, type Selection } from '../../store/bankStore';
import { CIT_INFO_KEYS, infoKeyForChoice, type CitInfoKey, type InfoKey } from '../../data/subProcessKeys';
import { CIT_SHEETS } from '../../data/subProcessCitSheets';
import { subProcessInfoMessages } from '../ops/subProcessInfo.messages';
import { inspectorCoversMap, topBand } from './ViewportControls';
import { FLOW_IDS, type FlowId } from '../../types/viewport';
import { useMessages } from '../../utils/i18nHelper';
import { AdaptivePopover, listboxKey } from '../shell/AdaptivePopover';
import { retailOpsMessages } from './retailOps.messages';
import { selectSubProcess } from './retailOpsActions';

/**
 * What the menu offers, in order: each of the eight flows, with its child sub-groups under it, and under Flow 06 the CIT domain's
 * four child sub-processes (each opens its sheet with a "run this scenario" button). A flow with a single sub-group lists none:
 * picking the flow already shows that group's buttons, so a nested row would only repeat its parent.
 */
export type MenuChoice = { kind: 'flow'; flow: FlowId } | { kind: 'sub'; flow: FlowId; sub: DemoGroupId } | { kind: 'cit'; flow: 6; key: CitInfoKey };

const CIT_FLOW = 6 as const;
const citChoices = (flow: FlowId): MenuChoice[] => (flow === CIT_FLOW ? Object.values(CIT_INFO_KEYS).map((key): MenuChoice => ({ kind: 'cit', flow: CIT_FLOW, key })) : []);

export const MENU_CHOICES: readonly MenuChoice[] = FLOW_IDS.flatMap((flow): MenuChoice[] => [{ kind: 'flow', flow }, ...(showsGroupsOf(flow) ? demoGroupsIn(flow).map((g): MenuChoice => ({ kind: 'sub', flow, sub: g.id })) : []), ...citChoices(flow)]);

const choiceId = (c: MenuChoice): string => (c.kind === 'flow' ? `flow-${c.flow}` : c.kind === 'sub' ? `flow-sub-${c.sub}` : `flow-cit-${c.key}`);
const choiceInfo = (c: MenuChoice): InfoKey => (c.kind === 'cit' ? c.key : infoKeyForChoice(c.flow, c.kind === 'sub' ? c.sub : null));
const CIT_SHEET_OF = new Map(CIT_SHEETS.map((s) => [s.key, s]));

/** Shows a choice's fact sheet in the right drawer, unless the drawer would cover the map or is busy with a desk or a payment. */
export function showInfo(c: MenuChoice, force = false): void {
  const bank = bankStore.getState();
  const free = bank.selection.kind === 'none' || bank.selection.kind === 'subprocess';
  if (!force && (!free || inspectorCoversMap(topBand.getState().mapW, bank.inspectorWidth, true))) return;
  bank.select({ kind: 'subprocess', key: choiceInfo(c) });
}

/** The compact replacement for the row of flow pills: one button naming what is lit, opening a keyboard-navigable list. */
export function SubProcessMenu() {
  const m = useMessages(retailOpsMessages);
  const spi = useMessages(subProcessInfoMessages);
  const locale = useLocale();
  const flow = useBankStore((s) => s.flow);
  const sub = useBankStore((s) => s.subProcess);
  const setFlow = useBankStore((s) => s.setActiveFlow);
  const [open, setOpen] = useState(false);
  const infoOpen = useBankStore((s) => s.selection.kind === 'subprocess');
  // The sheet open when the list opened: hovering previews other sheets, and closing without a pick brings it back.
  const before = useRef<Selection | null>(null);
  const selected = MENU_CHOICES.findIndex((c) => (sub && showsGroupsOf(flow) ? c.kind === 'sub' && c.sub === sub : c.kind === 'flow' && c.flow === flow));
  const [active, setActive] = useState(selected);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const accent = GUIDED_FLOWS[flow].accent;
  // A single-group flow's group is shown as its flow, as the menu lists it.
  const group = sub && showsGroupsOf(flow) ? sub : null;
  const title = group ? pick(demoGroup(group).title, locale) : `${GUIDED_FLOWS[flow].code}. ${flowText(flow).title}`;

  useEffect(() => {
    if (open) {
      setActive(selected);
      before.current = infoOpen ? bankStore.getState().selection : null;
    } else if (before.current) {
      bankStore.getState().select(before.current);
      before.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hover = (i: number): void => {
    setActive(i);
    const c = MENU_CHOICES[i];
    if (c && before.current) showInfo(c);
  };

  const choose = (c: MenuChoice | undefined): void => {
    if (!c) return;
    if (c.kind === 'flow') setFlow(c.flow);
    else if (c.kind === 'sub') selectSubProcess(c.sub);
    else setFlow(c.flow);
    before.current = null;
    // A CIT child's sheet is where its scenario runs from, so it always opens.
    showInfo(c, c.kind === 'cit');
    setOpen(false);
    trigger.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    const next = listboxKey(e.key, active, MENU_CHOICES.length);
    if (next === null) return;
    e.preventDefault();
    if (next === 'pick') choose(MENU_CHOICES[active]);
    else if (next === 'close') {
      e.stopPropagation();
      setOpen(false);
    } else hover(next);
  };

  return (
    <div className="bk-slide-down flex min-w-0 items-center gap-1" data-testid="flow-bar">
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={m('selectSubProcess')}
        title={group ? pick(demoGroup(group).title, locale) : flowText(flow).blurb}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        data-testid="flow-menu"
        data-flow={flow}
        data-sub={sub ?? undefined}
        className="flex w-full min-w-0 max-w-[min(420px,90vw)] items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-1.5 text-[12px] font-semibold text-slate-100 shadow-xl transition hover:bg-slate-900"
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} aria-hidden="true" />
        <span className="min-w-0 truncate" data-testid="flow-menu-title">
          {title}
        </span>
        <span className={`shrink-0 text-[10px] text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          ▼
        </span>
      </button>
      <button
        type="button"
        onClick={() => (infoOpen ? bankStore.getState().clearSelection() : showInfo(MENU_CHOICES[selected] ?? { kind: 'flow', flow }, true))}
        aria-pressed={infoOpen}
        aria-label={spi('open')}
        title={spi('open')}
        data-testid="flow-info"
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border text-[13px] shadow-xl transition ${infoOpen ? 'border-sky-400/70 bg-sky-500/20 text-sky-100' : 'border-slate-700 bg-slate-950/95 text-slate-300 hover:bg-slate-900'}`}
      >
        ℹ️
      </button>
      {open && (
        <AdaptivePopover anchor={trigger} onClose={() => setOpen(false)} width={360} id={listId} label={m('selectSubProcess')} testId="flow-menu-list" activeIndex={active}>
          {MENU_CHOICES.map((c, i) => {
            const on = i === selected;
            const parent = c.kind === 'flow';
            const cit = c.kind === 'cit' ? CIT_SHEET_OF.get(c.key) : undefined;
            const label = parent ? flowText(c.flow).title : c.kind === 'sub' ? pick(demoGroup(c.sub).title, locale) : `${cit?.icon ?? ''} ${cit ? pick(cit.title, locale) : ''}`;
            return (
              <li
                key={choiceId(c)}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={on}
                data-index={i}
                data-testid={choiceId(c)}
                data-level={parent ? 1 : 2}
                data-kind={c.kind}
                onPointerMove={() => hover(i)}
                onClick={() => choose(c)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg py-1 pr-2 ${parent ? `pl-2 text-[12px] font-bold text-slate-100 ${i > 0 ? 'mt-1' : ''}` : 'ml-3.5 border-l border-slate-700 pl-3 text-[11.5px] text-slate-300'} ${i === active ? 'bg-slate-800' : ''}`}
              >
                {parent && (
                  <span className="w-5 shrink-0 font-mono text-[11px]" style={{ color: GUIDED_FLOWS[c.flow].accent }}>
                    {GUIDED_FLOWS[c.flow].code}
                  </span>
                )}
                <span className="min-w-0 flex-1">{label}</span>
                {c.kind === 'cit' && (
                  <span className="shrink-0 rounded bg-cyan-400/15 px-1 font-mono text-[9.5px] font-bold text-cyan-200 ring-1 ring-cyan-300/30" aria-hidden="true">
                    CIT
                  </span>
                )}
                {on && (
                  <span aria-hidden="true" style={{ color: accent }}>
                    ✓
                  </span>
                )}
              </li>
            );
          })}
        </AdaptivePopover>
      )}
    </div>
  );
}
