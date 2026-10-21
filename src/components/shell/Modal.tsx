import { useEffect, useId, useRef, type ReactNode } from 'react';
import { tr } from '../../i18n/locale';

/**
 * A centred dialog over a dark veil: title bar with a close button, a scrolling body and an optional footer. Escape and a click
 * on the veil close it, and focus moves into it when it opens and back where it was when it closes.
 */
export function Modal({ title, subtitle, icon, onClose, children, footer, width = 'max-w-3xl', testId, z = 'z-50' }: { title: string; subtitle?: string; icon?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: string; testId: string; z?: string }) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  // The latest onClose, so the effect below runs once per opening and never steals focus back while the learner types.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, []);
  return (
    <div className={`fixed inset-0 ${z} flex items-center justify-center bg-black/80 p-4`} onClick={(e) => e.target === e.currentTarget && onClose()} data-testid={`${testId}-backdrop`}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid={testId} className={`flex max-h-[90vh] w-full ${width} flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl outline-none`}>
        <header className="flex shrink-0 items-start gap-3 border-b border-slate-800 px-5 py-3.5">
          {icon && (
            <span className="mt-0.5 text-[22px] leading-none" aria-hidden="true">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[16px] font-bold leading-tight text-slate-50">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[12px] leading-snug text-slate-400">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={tr({ en: 'Close', vi: 'Đóng' })} data-testid={`${testId}-close`} className="grid h-7 w-7 place-items-center rounded-md text-[18px] leading-none text-slate-400 hover:bg-slate-800 hover:text-white">
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-800 bg-slate-950 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
