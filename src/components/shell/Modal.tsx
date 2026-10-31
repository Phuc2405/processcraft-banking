import { useEffect, useId, useRef, type ReactNode } from 'react';
import { tr } from '../../i18n/locale';

/** A centred dialog over a dark veil: title bar with a close button, a scrolling body and an optional footer. */
export function Modal({ title, subtitle, icon, onClose, children, footer, actions, width = 'max-w-4xl', testId, z = 'z-50', bodyClass = '' }: { title: string; subtitle?: string; icon?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; /** Controls in the title bar, before the close button, that govern the whole dialog. */ actions?: ReactNode; width?: string; testId: string; z?: string; /** Extra classes for the scrolling body. */ bodyClass?: string }) {
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
        <header className="flex shrink-0 flex-wrap items-start gap-x-3 gap-y-2 border-b border-slate-800 px-5 py-3.5">
          {icon && (
            <span className="mt-0.5 text-[22px] leading-none" aria-hidden="true">
              {icon}
            </span>
          )}
          {/* A floor under the title: below it the controls drop to their own row, so the title never narrows until its letters stack. */}
          <div className="min-w-[12rem] flex-1 basis-0 [overflow-wrap:break-word]">
            <h2 id={titleId} className="text-[18px] font-bold leading-tight text-slate-50">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[14px] leading-normal text-slate-400">{subtitle}</p>}
          </div>
          {actions && (
            <div className="order-3 flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto sm:shrink-0 sm:justify-end" data-testid={`${testId}-actions`}>
              {actions}
            </div>
          )}
          <button type="button" onClick={onClose} aria-label={tr({ en: 'Close', vi: 'Đóng' })} data-testid={`${testId}-close`} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[20px] leading-none text-slate-400 hover:bg-slate-800 hover:text-white">
            ×
          </button>
        </header>
        <div className={`min-h-0 flex-1 overflow-y-auto px-6 py-5 leading-normal ${bodyClass}`}>{children}</div>
        {footer && <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-800 bg-slate-950 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
