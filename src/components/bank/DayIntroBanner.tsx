import { useEffect, useState } from 'react';
import { useBankStore } from '../../store/bankStore';
import { useMessages } from '../../utils/i18nHelper';
import { DAY_INTRO_FADE_MS, DAY_INTRO_MS, dayIntroCopy, introDue } from './dayIntro';
import { dayIntroMessages } from './dayIntro.messages';
import { useTerms } from './useTerms';

/** The start-of-day banner: "Day 03 – An ordinary day", what is going on today, and what to watch. */
export function DayIntroBanner() {
  const terms = useTerms();
  const m = useMessages(dayIntroMessages);
  const day = useBankStore((s) => s.view.day);
  const event = useBankStore((s) => s.view.event);
  const reportOpen = useBankStore((s) => s.reportOpen);
  const viewMode = useBankStore((s) => s.viewMode);
  const [shownFor, setShownFor] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!introDue(shownFor, day, reportOpen)) return;
    setShownFor(day);
    setOpen(true);
    setLeaving(false);
  }, [day, reportOpen, shownFor]);

  useEffect(() => {
    if (!open) return;
    const fade = setTimeout(() => setLeaving(true), DAY_INTRO_MS);
    const close = setTimeout(() => setOpen(false), DAY_INTRO_MS + DAY_INTRO_FADE_MS + 50);
    return () => {
      clearTimeout(fade);
      clearTimeout(close);
    };
  }, [open, shownFor]);

  if (!open) return null;
  const copy = dayIntroCopy(day, event);
  const dismiss = (): void => {
    setLeaving(true);
    setTimeout(() => setOpen(false), DAY_INTRO_FADE_MS);
  };
  return (
    <div className={`pointer-events-none absolute inset-x-0 ${viewMode === '3d' ? 'top-28' : 'top-20'} z-40 flex justify-center px-4`}>
      <section
        role="status"
        aria-live="polite"
        data-testid="day-intro"
        data-view={viewMode}
        className={`relative w-full max-w-[520px] overflow-hidden rounded-2xl border shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-opacity duration-500 ease-out ${
          leaving ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'
        } ${copy.special ? 'border-fuchsia-400/40 bg-slate-950/55' : 'border-sky-400/30 bg-slate-950/55'}`}
        style={{ animation: leaving ? undefined : 'day-intro-in 600ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
      >
        <style>{'@keyframes day-intro-in { from { opacity: 0; transform: translateY(-12px) scale(0.98); } to { opacity: 1; transform: none; } }'}</style>
        <div className={`h-1 w-full ${copy.special ? 'bg-gradient-to-r from-fuchsia-500 via-amber-400 to-fuchsia-500' : 'bg-gradient-to-r from-sky-500 via-lime-400 to-sky-500'}`} />
        <div className="px-5 pb-4 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{m('kicker')}</div>
              <h2 className={`mt-0.5 text-[18px] font-bold leading-tight ${copy.special ? 'text-fuchsia-100' : 'text-slate-50'}`} data-testid="day-intro-heading">
                {terms.t(copy.heading)}
              </h2>
            </div>
            <button type="button" onClick={dismiss} aria-label={m('dismiss')} className="-mr-1 rounded-md px-1.5 text-[18px] leading-none text-slate-400 transition hover:bg-white/10 hover:text-slate-100">
              ×
            </button>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-200">{terms.t(copy.detail)}</p>
          <p className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[12.5px] leading-relaxed text-amber-50">
            <span className="mr-1 font-semibold text-amber-300">{copy.watchLabel}</span>
            {terms.t(copy.watch)}
          </p>
        </div>
      </section>
    </div>
  );
}
