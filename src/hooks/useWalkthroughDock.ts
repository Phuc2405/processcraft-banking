import { useCallback, useEffect, useRef, useState } from 'react';
import { lessonOf } from '../sim/learningVi';
import { bankStore, useBankStore } from '../store/bankStore';
import { useSpotlightFocus, type Focus } from '../components/bank/useSpotlight';

/** How long the chapter chip glows after the step changes. */
export const STEP_PULSE_MS = 2000;

/** Identifies "the step on screen": a new lesson, a new example or a new step all count as new content. */
export const stepKey = (focus: Focus | null): string | null => (focus && !focus.tour.intro ? `${focus.tour.process}:${focus.tour.exampleId}:${focus.index}` : null);

export interface WalkthroughDock {
  focus: Focus | null;
  /** A tour is past its intro: the chip and (unless collapsed) the dock are on screen. */
  active: boolean;
  collapsed: boolean;
  /** The docked step column is showing. */
  open: boolean;
  chapter: number;
  /** 1-based. */
  step: number;
  total: number;
  /** True for STEP_PULSE_MS after the step changes (never on first mount). */
  pulsing: boolean;
  toggle(): void;
  expand(): void;
  /** Go to a step from a navigation control and show its details. */
  jumpTo(step: number): void;
}

/** One place for the walkthrough dock's state: open or folded, which step, and the "new content" glow. */
export function useWalkthroughDock(): WalkthroughDock {
  const focus = useSpotlightFocus();
  const collapsed = useBankStore((s) => s.walkCollapsed);
  const active = focus !== null && !focus.tour.intro;
  const pulsing = usePulse(stepKey(focus));

  const expand = useCallback(() => bankStore.getState().setWalkCollapsed(false), []);
  const toggle = useCallback(() => {
    const s = bankStore.getState();
    s.setWalkCollapsed(!s.walkCollapsed);
  }, []);
  const jumpTo = useCallback((step: number) => {
    const s = bankStore.getState();
    s.spotlightGo(step);
    s.setWalkCollapsed(false);
  }, []);

  return {
    focus,
    active,
    collapsed,
    open: active && !collapsed,
    chapter: focus ? lessonOf(focus.tour.process).chapter : 0,
    step: focus ? focus.index + 1 : 0,
    total: focus ? focus.plan.steps.length : 0,
    pulsing,
    toggle,
    expand,
    jumpTo,
  };
}

/** True for STEP_PULSE_MS each time `key` changes to a new non-null value after the first render. */
function usePulse(key: string | null): boolean {
  const [pulsing, setPulsing] = useState(false);
  const last = useRef(key);
  useEffect(() => {
    if (key === last.current) return;
    last.current = key;
    if (key === null) {
      setPulsing(false);
      return;
    }
    setPulsing(true);
    const id = window.setTimeout(() => setPulsing(false), STEP_PULSE_MS);
    return () => window.clearTimeout(id);
  }, [key]);
  return pulsing;
}
