import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { pick, useLocale } from '../../i18n/locale';
import { flowText, GUIDED_FLOWS } from '../../sim/guidedFlows';
import { opsSubProcess, opsSubProcessesIn, type OpsSubProcessId } from '../../sim/retailOps';
import { useBankStore } from '../../store/bankStore';
import { FLOW_IDS, type FlowId } from '../../types/viewport';
import { useMessages } from '../../utils/i18nHelper';
import { AdaptivePopover, listboxKey } from '../shell/AdaptivePopover';
import { retailOpsMessages } from './retailOps.messages';
import { selectSubProcess } from './retailOpsActions';

/** What the menu offers, in order: each of the eight flows, with its retail sub-processes under it. */
export type MenuChoice = { kind: 'flow'; flow: FlowId } | { kind: 'sub'; flow: FlowId; sub: OpsSubProcessId };

export const MENU_CHOICES: readonly MenuChoice[] = FLOW_IDS.flatMap((flow): MenuChoice[] => [{ kind: 'flow', flow }, ...opsSubProcessesIn(flow).map((s): MenuChoice => ({ kind: 'sub', flow, sub: s.id }))]);

const choiceId = (c: MenuChoice): string => (c.kind === 'flow' ? `flow-${c.flow}` : `flow-sub-${c.sub}`);

/** The compact replacement for the row of flow pills: one button naming what is lit, opening a keyboard-navigable list. */
export function SubProcessMenu() {
  const m = useMessages(retailOpsMessages);
  const locale = useLocale();
  const flow = useBankStore((s) => s.flow);
  const sub = useBankStore((s) => s.subProcess);
  const setFlow = useBankStore((s) => s.setActiveFlow);
  const [open, setOpen] = useState(false);
  const selected = MENU_CHOICES.findIndex((c) => (sub ? c.kind === 'sub' && c.sub === sub : c.kind === 'flow' && c.flow === flow));
  const [active, setActive] = useState(selected);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const accent = GUIDED_FLOWS[flow].accent;
  const title = sub ? pick(opsSubProcess(sub).title, locale) : `${GUIDED_FLOWS[flow].code}. ${flowText(flow).title}`;

  useEffect(() => {
    if (open) setActive(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (c: MenuChoice | undefined): void => {
    if (!c) return;
    if (c.kind === 'flow') setFlow(c.flow);
    else selectSubProcess(c.sub);
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
    } else setActive(next);
  };

  return (
    <div className="bk-slide-down min-w-0" data-testid="flow-bar">
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={m('selectSubProcess')}
        title={sub ? pick(opsSubProcess(sub).title, locale) : flowText(flow).blurb}
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
      {open && (
        <AdaptivePopover anchor={trigger} onClose={() => setOpen(false)} width={360} id={listId} label={m('selectSubProcess')} testId="flow-menu-list" activeIndex={active}>
          {MENU_CHOICES.map((c, i) => {
            const on = i === selected;
            const label = c.kind === 'flow' ? `${GUIDED_FLOWS[c.flow].code}. ${flowText(c.flow).title}` : pick(opsSubProcess(c.sub).title, locale);
            return (
              <li
                key={choiceId(c)}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={on}
                data-index={i}
                data-testid={choiceId(c)}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(c)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg py-1 pr-2 ${c.kind === 'flow' ? 'pl-2 text-[12px] font-bold text-slate-100' : 'pl-6 text-[11.5px] text-slate-300'} ${i === active ? 'bg-slate-800' : ''}`}
              >
                <span className="min-w-0 flex-1">{label}</span>
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
