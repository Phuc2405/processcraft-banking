import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { LessonExample, ProcessId } from '../../sim/learning';
import { groupScenarios, SCENARIO_PATHS, type ScenarioPath } from '../../sim/scenarioGroups';
import { useMessages } from '../../utils/i18nHelper';
import { walkMessages } from './walkthrough.messages';

const GROUP: Record<ScenarioPath, { dot: string; key: 'groupHappy' | 'groupEdge'; tone: string }> = {
  happy: { dot: '🟢', key: 'groupHappy', tone: 'text-emerald-300' },
  edge: { dot: '🔴', key: 'groupEdge', tone: 'text-rose-300' },
};

/**
 * [🧪 Test Scenarios · 6 ▾ An ordinary purchase]: a glass pill that opens the lesson's example payments, grouped into the
 * straight-through Happy Path and the Edge Cases. A listbox, not a native <select>, so the groups can be styled; it keeps the
 * listbox keyboard contract (↑ ↓ Home End Enter Esc) and stops those keys from reaching the tour's own shortcuts.
 */
export function ScenarioPicker({
  lessonId,
  examples,
  value,
  onChange,
  accent,
  placement = 'up',
  testId,
}: {
  lessonId: ProcessId;
  examples: readonly Pick<LessonExample, 'id' | 'label'>[];
  value: string;
  onChange: (id: string) => void;
  accent: string;
  placement?: 'up' | 'down';
  testId: string;
}) {
  const m = useMessages(walkMessages);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(value);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const groups = useMemo(() => groupScenarios(lessonId, examples), [lessonId, examples]);
  // Keyboard order follows the groups as drawn.
  const ordered = useMemo(() => SCENARIO_PATHS.flatMap((p) => groups[p]), [groups]);
  const current = examples.find((e) => e.id === value) ?? examples[0];

  // Close on a press outside.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  // Opening puts the keyboard on the list, starting at the chosen scenario.
  useEffect(() => {
    if (!open) return;
    setActive(value);
    list.current?.focus();
  }, [open, value]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  const choose = (id: string): void => {
    setOpen(false);
    button.current?.focus();
    if (id !== value) onChange(id);
  };

  const move = (delta: number | 'first' | 'last'): void => {
    if (ordered.length === 0) return;
    const at = ordered.findIndex((e) => e.id === active);
    const next = delta === 'first' ? 0 : delta === 'last' ? ordered.length - 1 : Math.min(ordered.length - 1, Math.max(0, (at < 0 ? 0 : at) + delta));
    setActive(ordered[next]!.id);
  };

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  const onListKey = (e: KeyboardEvent<HTMLUListElement>): void => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      Home: () => move('first'),
      End: () => move('last'),
      Enter: () => choose(active),
      ' ': () => choose(active),
      Escape: () => {
        setOpen(false);
        button.current?.focus();
      },
      Tab: () => setOpen(false),
    };
    const run = keys[e.key];
    if (!run) return;
    if (e.key !== 'Tab') e.preventDefault();
    // The tour listens on window for ← → Space Esc Enter: none of these may leak out of the picker.
    e.stopPropagation();
    run();
  };

  return (
    <div ref={root} className="relative" data-testid={`${testId}-picker`}>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={m('scenarioPick', { n: examples.length, current: current?.label ?? '' })}
        title={m('scenarioCount', { n: examples.length })}
        data-testid={testId}
        data-value={value}
        className="group flex max-w-[340px] items-center gap-2 rounded-full bg-white/[0.07] py-1 pl-2.5 pr-2 text-[12px] text-slate-100 shadow-[0_4px_24px_-6px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/15 backdrop-blur-md transition hover:bg-white/[0.12] hover:ring-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        style={{ boxShadow: open ? `0 0 0 1px ${accent}99, 0 0 22px ${accent}40` : undefined }}
      >
        <span aria-hidden="true">🧪</span>
        <span className="whitespace-nowrap font-bold">{m('scenarios')}</span>
        <span className="grid min-w-[1.25rem] place-items-center rounded-full px-1 text-[10.5px] font-black tabular-nums text-slate-950" style={{ background: accent }} data-testid={`${testId}-count`}>
          {examples.length}
        </span>
        <span aria-hidden="true" className="h-3.5 w-px bg-white/20" />
        <span className="min-w-0 truncate text-slate-300 group-hover:text-slate-100">{current?.label}</span>
        <span aria-hidden="true" className={`text-[10px] text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={m('scenarios')}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
          data-testid={`${testId}-list`}
          className={`absolute right-0 z-50 max-h-[min(420px,60vh)] w-[320px] overflow-y-auto rounded-2xl bg-slate-900/80 p-1.5 shadow-2xl ring-1 ring-white/15 backdrop-blur-xl focus:outline-none ${placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          {SCENARIO_PATHS.filter((p) => groups[p].length > 0).map((path) => {
            const g = GROUP[path];
            const headId = `${listId}-${path}`;
            return (
              <li key={path} role="presentation" className="mb-1 last:mb-0">
                <div id={headId} className={`flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wider ${g.tone}`}>
                  <span aria-hidden="true">{g.dot}</span>
                  {m(g.key)}
                  <span className="ml-auto font-mono font-normal text-slate-500">{groups[path].length}</span>
                </div>
                <ul role="group" aria-labelledby={headId} data-testid={`${testId}-group-${path}`}>
                  {groups[path].map((ex) => {
                    const selected = ex.id === value;
                    const isActive = ex.id === active;
                    return (
                      <li
                        key={ex.id}
                        id={`${listId}-${ex.id}`}
                        role="option"
                        aria-selected={selected}
                        data-active={isActive}
                        data-testid={`${testId}-option-${ex.id}`}
                        onPointerEnter={() => setActive(ex.id)}
                        onClick={() => choose(ex.id)}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] transition-colors ${isActive ? 'bg-white/10 text-white' : 'text-slate-300'}`}
                        style={selected ? { boxShadow: `inset 2px 0 0 ${accent}` } : undefined}
                      >
                        <span className="min-w-0 flex-1">{ex.label}</span>
                        {selected && (
                          <span aria-hidden="true" style={{ color: accent }}>
                            ✓
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
