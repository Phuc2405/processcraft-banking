import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { tr } from '../../i18n/locale';
import { academyStore, useAcademyStore } from '../../store/academyStore';
import { bindAcademySync } from '../../store/academySync';
import { bankStore } from '../../store/bankStore';

/** The Academy split view: the toggle, the layout frame and its sizing. The lesson panel itself is a lazy chunk. */

const AcademyPanel = lazy(() => import('./AcademyPanel').then((m) => ({ default: m.AcademyPanel })));

// Toggle

/** The button that opens and closes the split view (the top bar of the Living Bank). */
export function AcademySplitToggle() {
  const open = useAcademyStore((s) => s.isSplitScreenOpen);
  const toggle = useAcademyStore((s) => s.toggleSplitScreen);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={open}
      title={open ? tr({ en: 'Close the lesson panel', vi: 'Đóng bảng bài học' }) : tr({ en: 'Open the Academy split view: lessons on the left, the bank on the right', vi: 'Mở chế độ chia đôi Học viện: bài học bên trái, ngân hàng bên phải' })}
      data-testid="academy-split-toggle"
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold ring-1 transition-colors duration-200 ${open ? 'bg-lime-400 text-slate-950 ring-lime-300' : 'bg-slate-900 text-slate-100 ring-slate-700 hover:bg-slate-800'}`}
    >
      <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="1" y="1.5" width="14" height="11" rx="2" />
        <path d="M6 1.5v11" />
        <path d={open ? 'M3 5h1.5M3 7h1.5M3 9h1.5' : 'M3 5h1.5M3 7h1.5'} strokeLinecap="round" />
      </svg>
      <span className="max-[1439px]:sr-only">{tr({ en: 'Lessons', vi: 'Bài học' })}</span>
    </button>
  );
}

/** The least map the split view must leave beside the lesson panel (and the bank's left rail). */
const MIN_SPLIT_MAP_PX = 480;
const RAIL_PX = 48;

/** True when the window cannot hold the panel at `width` beside a usable map: the open panel then shows in Focus Mode, over the map. */
export const splitTooNarrow = (windowWidth: number, width: number): boolean => windowWidth - RAIL_PX - width < MIN_SPLIT_MAP_PX;

function useWindowWidth(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? Infinity : window.innerWidth));
  useEffect(() => {
    const on = (): void => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

/** Whether the panel is maximized: chosen in the store, or forced on a window too narrow to split. */
export function useMaximized(): boolean {
  const ww = useWindowWidth();
  return useAcademyStore((s) => s.isSplitScreenOpen && (s.isMaximized || splitTooNarrow(ww, s.panelWidth)));
}

// Layout

/** Lays the lesson panel beside the Living Bank's map (`children`). */
export function AcademySplitLayout({ children }: { children: ReactNode }) {
  useEffect(() => bindAcademySync(academyStore, bankStore), []);
  const maximized = useMaximized();
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stage.current as (HTMLDivElement & { inert: boolean }) | null;
    if (el) el.inert = maximized;
  }, [maximized]);
  return (
    <div className="flex min-h-0 min-w-0 flex-1" data-testid="academy-split">
      <Suspense fallback={null}>
        <AcademyPanel />
      </Suspense>
      <div ref={stage} aria-hidden={maximized || undefined} data-testid="academy-stage" className={`flex min-h-0 min-w-0 flex-1 transition-[filter] duration-300 ${maximized ? 'pointer-events-none blur-sm' : ''}`}>
        {children}
      </div>
    </div>
  );
}
