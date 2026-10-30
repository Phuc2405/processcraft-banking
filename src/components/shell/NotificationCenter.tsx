import { useEffect, useState } from 'react';
import { pick, useLocale } from '../../i18n/locale';
import { NOTICE_FADE_MS, NOTICE_TTL_MS, noticeTop, notificationStore, useNotificationStore, type NoticeTone } from '../../store/notificationStore';
import { useMessages } from '../../utils/i18nHelper';
import { notificationMessages } from './notification.messages';

const TONE: Readonly<Record<NoticeTone, string>> = {
  danger: 'border-rose-400 bg-rose-950/95 text-rose-50 shadow-[0_0_40px_rgba(244,63,94,0.4)]',
  success: 'border-lime-400 bg-emerald-950/95 text-lime-50 shadow-[0_0_40px_rgba(163,230,53,0.35)]',
  info: 'border-sky-400 bg-slate-950/95 text-sky-50 shadow-[0_0_40px_rgba(56,189,248,0.3)]',
  warning: 'border-amber-400 bg-amber-950/95 text-amber-50 shadow-[0_0_40px_rgba(251,191,36,0.3)]',
};
const BODY: Readonly<Record<NoticeTone, string>> = { danger: 'text-rose-200', success: 'text-lime-200', info: 'text-sky-200', warning: 'text-amber-200' };

/** Location B: the action feedback toasts, directly under the start-of-day banner (Location A) and never over it. */
export function NotificationCenter() {
  const m = useMessages(notificationMessages);
  const locale = useLocale();
  const shown = useNotificationStore((s) => s.shown);
  const waiting = useNotificationStore((s) => s.queue.length);
  const top = useNotificationStore((s) => noticeTop(s.sod));
  const [now, setNow] = useState(() => Date.now());
  const busy = shown.length > 0 || waiting > 0;
  useEffect(() => {
    if (!busy) return;
    const beat = (): void => {
      const t = Date.now();
      notificationStore.getState().pump(t);
      setNow(t);
    };
    beat();
    const id = window.setInterval(beat, 150);
    return () => window.clearInterval(id);
  }, [busy]);
  if (shown.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[96] flex flex-col items-center gap-2 px-4" style={{ top }} aria-live="assertive" data-testid="notice-zone" data-zone="B">
      <style>{'@keyframes notice-in { from { opacity: 0; transform: translateY(-10px) scale(0.98); } to { opacity: 1; transform: none; } }'}</style>
      {shown.map((n) => {
        const leaving = now - n.at > NOTICE_TTL_MS - NOTICE_FADE_MS;
        return (
          <div
            key={n.id}
            role={n.tone === 'danger' ? 'alert' : 'status'}
            data-testid={`notice-${n.tone}`}
            data-source={n.source}
            className={`pointer-events-auto flex w-full max-w-2xl items-start gap-3 rounded-2xl border-2 px-4 py-3 transition-opacity duration-500 ease-out ${TONE[n.tone]} ${leaving ? 'opacity-0' : 'opacity-100'}`}
            style={{ animation: 'notice-in 450ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
          >
            <span className="text-[22px] leading-none" aria-hidden="true">
              {n.icon}
            </span>
            {n.onOpen ? (
              <button
                type="button"
                data-testid="notice-open"
                onClick={() => {
                  notificationStore.getState().dismiss(n.id);
                  n.onOpen?.();
                }}
                className="min-w-0 flex-1 rounded-lg text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span className="block text-[14.5px] font-black leading-snug">{pick(n.title, locale)}</span>
                {n.body && <span className={`mt-1 block font-mono text-[12.5px] ${BODY[n.tone]}`}>{pick(n.body, locale)}</span>}
              </button>
            ) : (
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-black leading-snug">{pick(n.title, locale)}</p>
                {n.body && <p className={`mt-1 font-mono text-[12.5px] ${BODY[n.tone]}`}>{pick(n.body, locale)}</p>}
              </div>
            )}
            <button type="button" onClick={() => notificationStore.getState().dismiss(n.id)} aria-label={m('dismiss')} title={m('dismiss')} className="-mr-1 rounded-md px-1.5 text-[18px] leading-none opacity-70 transition hover:bg-white/10 hover:opacity-100">
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
