import { useEffect, useRef, useState } from 'react';
import { useBankStore } from '../../store/bankStore';
import { HUD_EVENTS, HUD_TTL_MS, newEvents, pushToasts, type DeclineCounts, type HudToast } from './hudToasts';

const TONE = {
  amber: 'border-amber-400/50 bg-[#1c1406]/90 text-amber-100 [--dot:#fbbf24]',
  red: 'border-rose-400/50 bg-[#1f0a10]/90 text-rose-100 [--dot:#fb7185]',
} as const;

const META = Object.fromEntries(HUD_EVENTS.map((e) => [e.kind, e]));

/**
 * Floating alert pills at the top right of the map (2D or 3D). Max three, each gone after 3.5 s. The whole layer ignores the
 * pointer, so it never blocks a click on the map or a drag of the 3D camera.
 */
export function HudToasts() {
  const declines = useBankStore((s) => s.view.kpis.declines) as DeclineCounts;
  const playing = useBankStore((s) => s.playing);
  const touring = useBankStore((s) => s.spotlight !== null);
  const [toasts, setToasts] = useState<HudToast[]>([]);
  const before = useRef<DeclineCounts | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    const events = newEvents(before.current, declines);
    before.current = declines;
    // Only while the day is being watched: a skip to the end of the day would otherwise fire a burst of stale alerts.
    if (!playing || touring || events.length === 0) return;
    const now = performance.now();
    setToasts((cur) => pushToasts(cur, events.map((e) => ({ id: nextId.current++, kind: e.kind, count: e.count, at: now }))));
  }, [declines, playing, touring]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const oldest = Math.min(...toasts.map((t) => t.at));
    const t = window.setTimeout(() => setToasts((cur) => cur.filter((x) => performance.now() - x.at < HUD_TTL_MS - 20)), Math.max(0, oldest + HUD_TTL_MS - performance.now()));
    return () => window.clearTimeout(t);
  }, [toasts]);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none absolute right-3 top-12 z-30 flex w-[230px] flex-col items-end gap-1.5" aria-live="polite" data-testid="hud-toasts">
      {toasts.map((t) => {
        const meta = META[t.kind];
        if (!meta) return null;
        return (
          <div key={t.id} className={`bk-hud-toast pointer-events-none flex items-center gap-2 rounded-full border px-3 py-1 text-[11.5px] font-semibold shadow-lg backdrop-blur-sm ${TONE[meta.tone]}`} data-testid={`hud-toast-${t.kind}`} role="status">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--dot)]" aria-hidden="true" />
            {meta.title}
            {t.count > 1 && <span className="tabular-nums opacity-75">×{t.count}</span>}
          </div>
        );
      })}
    </div>
  );
}
