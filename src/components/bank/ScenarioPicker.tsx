import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AdaptivePopover, listboxKey } from '../shell/AdaptivePopover';

/** One choice of a scenario dropdown: the dock's payment demos and the CIT demos share this shape. */
export interface PickerItem {
  id: string;
  icon: string;
  label: string;
  hint: string;
  /** The dot's colour class (pass / fail tone of a payment, cyan for a CIT run). */
  dot: string;
}

/**
 * The established dropdown pattern of the demo bar: a combobox naming the picked scenario that opens a keyboard-navigable list
 * (↑ ↓ Enter Esc), and whatever action sits beside it (Run / Cancel). Controlled: the caller owns the pick. Test ids from `testId`:
 * `<p>-selector` the row, `<p>-select` the combobox, `<p>-select-list` the list, `<p>-option-<id>` each choice. With `placeholder`,
 * nothing is shown as picked until a choice is made (the trigger reads `label`): a navigator, not a setting.
 */
export function ScenarioPicker({ items, picked, onPick, label, testId, direction = 'up', disabled = false, placeholder = false, children }: { items: readonly PickerItem[]; picked: string; onPick: (id: string) => void; label: string; testId: string; direction?: 'up' | 'down'; disabled?: boolean; placeholder?: boolean; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const chosen = items.find((a) => a.id === picked) ?? (placeholder ? undefined : items[0]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (open) setActive(Math.max(0, items.findIndex((a) => a.id === chosen?.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const choose = (a: PickerItem | undefined): void => {
    if (a) onPick(a.id);
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
    const next = listboxKey(e.key, active, items.length);
    if (next === null) return;
    e.preventDefault();
    if (next === 'pick') choose(items[active]);
    else if (next === 'close') {
      e.stopPropagation();
      setOpen(false);
    } else setActive(next);
  };
  return (
    <div className="flex min-w-[8rem] flex-1 items-center gap-2" data-testid={`${testId}-selector`}>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={label}
        title={chosen?.hint ?? label}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        data-testid={`${testId}-select`}
        data-picked={chosen?.id}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[12px] font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`shrink-0 text-[10px] text-slate-400 transition-transform ${open === (direction === 'up') ? 'rotate-180' : ''}`} aria-hidden="true">
          ▼
        </span>
        {chosen && <span aria-hidden="true">{chosen.icon}</span>}
        <span className="min-w-0 truncate">{chosen ? chosen.label : label}</span>
      </button>
      {children}
      {open && (
        <AdaptivePopover anchor={trigger} onClose={() => setOpen(false)} direction={direction} width={380} maxVh={0.45} maxPx={320} align="start" id={listId} label={label} testId={`${testId}-select-list`} activeIndex={active}>
          {items.map((a, i) => (
            <li key={a.id} id={`${listId}-${i}`} role="option" aria-selected={a.id === chosen?.id} data-index={i} data-testid={`${testId}-option-${a.id}`} title={a.hint} onPointerMove={() => setActive(i)} onClick={() => choose(a)} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-slate-100 ${i === active ? 'bg-slate-800' : ''}`}>
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${a.dot}`} />
              <span aria-hidden="true">{a.icon}</span>
              <span className="min-w-0 flex-1">{a.label}</span>
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
