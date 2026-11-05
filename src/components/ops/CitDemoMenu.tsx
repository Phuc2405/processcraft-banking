import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { CIT_DEMOS, type CitDemo } from '../../sim/citEngine';
import { useBankStore } from '../../store/bankStore';
import { useMessages } from '../../utils/i18nHelper';
import { AdaptivePopover, listboxKey } from '../shell/AdaptivePopover';
import { citMessages } from './cit.messages';
import { dispatchCitDemo, type CitDemoBlock } from './citActions';
import { CitBusyBadge, DEMO_ICON, useCitLock, type CitLockStage } from './CitPanel';

/**
 * The bottom dock's one CIT control: "🚚 Demo CIT & Kho quỹ ▾" opening the dispatches. While the learner's run holds the lock
 * (until it is SETTLED and its van has driven off and home) the options are disabled and a badge says where the run is; while the
 * bank is paused the run plays on its own.
 */
export function CitDemoMenu() {
  const { block, stage } = useCitLock();
  const paused = useBankStore((s) => !s.playing);
  return <CitDemoMenuView block={block} stage={stage} paused={paused} />;
}

export function CitDemoMenuView({ block, stage = null, paused }: { block: CitDemoBlock; stage?: CitLockStage | null; paused: boolean }) {
  const m = useMessages(citMessages);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const choose = (kind: CitDemo | undefined): void => {
    if (!kind || block) return;
    dispatchCitDemo(kind);
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
    const next = listboxKey(e.key, active, CIT_DEMOS.length);
    if (next === null) return;
    e.preventDefault();
    if (next === 'pick') choose(CIT_DEMOS[active]);
    else if (next === 'close') {
      e.stopPropagation();
      setOpen(false);
    } else setActive(next);
  };

  return (
    <span className="flex shrink-0 items-center gap-1.5" data-testid="cit-demo-menu" data-block={block ?? 'none'}>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={m('demoGroup')}
        title={block ? m(`demoBlock_${block}`) : m('demoGroup')}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        data-testid="cit-demo-trigger"
        className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-bold shadow transition ${block ? 'bg-cyan-400/40 text-cyan-950/70' : 'bg-cyan-400 text-cyan-950 hover:bg-cyan-300'}`}
      >
        <span aria-hidden="true">🚚</span> {m('demoMenu')}{' '}
        <span aria-hidden="true" className={`inline-block transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {block === 'busy' && <CitBusyBadge stage={stage} paused={paused} />}
      {open && (
        <AdaptivePopover anchor={trigger} onClose={() => setOpen(false)} direction="up" width={260} align="start" id={listId} label={m('demoMenu')} testId="cit-demo-list" activeIndex={active}>
          {CIT_DEMOS.map((kind, i) => (
            <li
              key={kind}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={block !== null}
              data-index={i}
              data-testid={`cit-demo-${kind}`}
              title={block ? m(`demoBlock_${block}`) : m(`demoHint_${kind}`)}
              onPointerMove={() => setActive(i)}
              onClick={() => choose(kind)}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold ${block ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer text-slate-100'} ${i === active ? 'bg-slate-800' : ''}`}
            >
              <span aria-hidden="true">{DEMO_ICON[kind]}</span>
              <span className="min-w-0 flex-1">{m(`demoOption_${kind}`)}</span>
            </li>
          ))}
        </AdaptivePopover>
      )}
    </span>
  );
}
