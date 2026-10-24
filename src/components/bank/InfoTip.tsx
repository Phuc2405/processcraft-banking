import { tr } from '../../i18n/locale';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { placeTip, tipWidth } from './tipPlacement';

/**
 * A small (?) that explains a term. It opens on hover, on keyboard focus and on tap (for touch screens), and closes on leaving,
 * on blur, on Escape or on a second tap. The tip is rendered into document.body with `position: fixed` and a z-index above
 * every modal, so no scrolling container or `overflow: hidden` can clip it, and it is kept inside the window on small screens.
 *
 * `example` makes it a hybrid tip: the standard definition, then what the term means at this particular desk.
 */
export function InfoTip({ text, label, testId, example }: { text: string; label: string; testId?: string; example?: { title: string; text: string } }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = (): void => {
      const a = button.current?.getBoundingClientRect();
      const t = tip.current;
      if (!a || !t) return;
      const p = placeTip(a, { width: t.offsetWidth, height: t.offsetHeight }, { width: window.innerWidth, height: window.innerHeight });
      setPos({ left: p.left, top: p.top });
    };
    place();
    // The report scrolls and the window can be resized while a tip is open: follow the (?).
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const away = (e: PointerEvent): void => {
      if (e.target instanceof Node && button.current?.contains(e.target)) return;
      setPinned(false);
      setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [pinned]);

  const close = (): void => {
    if (!pinned) setOpen(false);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={tr({ en: `What is “${label}”?`, vi: `“${label}” là gì?` })}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        data-testid={testId}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={close}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setPinned(false);
          setOpen(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          const next = !pinned;
          setPinned(next);
          setOpen(next);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            // Close the tip, not the report behind it.
            e.stopPropagation();
            setPinned(false);
            setOpen(false);
          }
        }}
        className="ml-1 inline-grid h-[15px] w-[15px] shrink-0 cursor-help place-items-center rounded-full border border-slate-500 align-[1px] text-[9.5px] font-bold leading-none text-slate-300 transition hover:border-sky-300 hover:text-sky-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400"
      >
        ?
      </button>
      {open &&
        createPortal(
          <div
            ref={tip}
            id={id}
            role="tooltip"
            data-testid={testId ? `${testId}-tip` : undefined}
            className="pointer-events-none fixed z-[1000] rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-[12px] font-medium normal-case leading-snug tracking-normal text-slate-900 shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: tipWidth(window.innerWidth), visibility: pos ? 'visible' : 'hidden' }}
          >
            <span className="block text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
            {text}
            {example && (
              <span className="mt-1.5 block border-t border-slate-200 pt-1.5" data-testid={testId ? `${testId}-example` : undefined}>
                <span className="mr-1 font-bold text-sky-700">{example.title}:</span>
                {example.text}
              </span>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
