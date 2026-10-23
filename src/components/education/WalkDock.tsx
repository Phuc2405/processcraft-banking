import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../i18n/locale';
import { lessonOf } from '../../sim/learningVi';
import { useBankStore } from '../../store/bankStore';
import { useSpotlightFocus, type Focus } from '../bank/useSpotlight';
import { StepCard } from './GuidedWalkthrough';

// The dock's mount node, shared by the 2D map and the 3D office (they own the arrival timing).
type DockState = { host: HTMLElement | null; filled: boolean };
let state: DockState = { host: null, filled: false };
const listeners = new Set<() => void>();
const setDock = (patch: Partial<DockState>): void => {
  const next = { ...state, ...patch };
  if (next.host === state.host && next.filled === state.filled) return;
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const hostRef = (el: HTMLElement | null): void => setDock({ host: el });
const useDock = (): DockState => useSyncExternalStore(subscribe, () => state, () => state);

export const WALK_DOCK_WIDTH = 360;

/** True while the docked step column is on screen. */
export function useWalkDockOpen(): boolean {
  const focus = useSpotlightFocus();
  const collapsed = useBankStore((s) => s.walkCollapsed);
  return focus !== null && !focus.tour.intro && !collapsed;
}

/** Left column beside the map holding the current step (What / Takeaway / What can go wrong). */
export function WalkDock() {
  const open = useWalkDockOpen();
  const focus = useSpotlightFocus();
  const { filled } = useDock();
  if (!open || !focus) return null;
  const chapter = lessonOf(focus.tour.process).chapter;
  return (
    <aside
      aria-label={tr({ en: 'Walkthrough step', vi: 'Bước hướng dẫn' })}
      data-testid="walk-dock"
      className="relative flex shrink-0 flex-col border-r bg-[#0a0f1c]"
      style={{ width: WALK_DOCK_WIDTH, borderColor: `${focus.accent}66` }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
        <span className="h-2 w-2 rounded-full" style={{ background: focus.accent }} aria-hidden="true" />
        {tr({ en: `Chapter ${chapter} · Step details`, vi: `Chương ${chapter} · Chi tiết bước` })}
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 overflow-y-auto p-2.5" data-testid="walk-dock-body" />
      {!filled && (
        <p className="pointer-events-none absolute inset-x-0 top-11 px-4 text-[12px] italic text-slate-500" role="status" data-testid="walk-dock-wait">
          {tr({ en: 'Following the payment to the next desk…', vi: 'Đang theo giao dịch đến bàn tiếp theo…' })}
        </p>
      )}
    </aside>
  );
}

/** Renders the step card into the dock (call once the token has arrived). */
export function DockedStepCard({ focus }: { focus: Focus }) {
  const { host } = useDock();
  useEffect(() => {
    setDock({ filled: true });
    return () => setDock({ filled: false });
  }, []);
  return host ? createPortal(<StepCard focus={focus} docked />, host) : null;
}
