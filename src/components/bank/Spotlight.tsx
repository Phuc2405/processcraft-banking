import { useLayoutEffect, useRef } from 'react';
import { LESSONS } from '../../sim/learning';
import type { PacketKind } from '../../sim/types';
import { prefersReducedMotion } from '../canvas/timing';
import { TokenShape } from '../canvas/tokens/TokenGlyph';
import { Kickoff } from '../education/GuidedWalkthrough';
import { DockedStepCard } from '../education/WalkDock';
import { pointAlong, polylineLength, restPoint, tokenPolyline, travelMs, type Pt } from './tokenPath';
import { lookOfKind } from './ui';
import { useSpotlightFocus, useTourPlayback, type Focus } from './useSpotlight';
import { useBankStore } from '../../store/bankStore';

/**
 * The map side of Learn & Explore: the one token that walks the process, and the explanation card that waits for it at
 * each desk. (Dimming and the glowing path are drawn by the map itself; the words are in education/GuidedWalkthrough.)
 */

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** The polyline the token follows to arrive at the current step, or null when it should simply be set down there. */
function arrivalPath(focus: Focus, from: number | null): Pt[] {
  const here = focus.current;
  if (focus.tour.intro || from === null) return tokenPolyline(here.route.slice(0, 1));
  if (from === focus.index - 1) return tokenPolyline(here.route);
  if (from === focus.index + 1) {
    const back = focus.plan.steps[from];
    return back ? [...tokenPolyline(back.route)].reverse() : tokenPolyline([here.place]);
  }
  return tokenPolyline([here.place]);
}

/** The walkthrough token. It lives inside the stage, so it scales with the map. */
export function SpotlightToken({ focus }: { focus: Focus }) {
  const ref = useRef<HTMLDivElement>(null);
  const was = useRef<{ index: number; intro: boolean; plan: Focus['plan'] } | null>(null);
  const exampleKind = LESSONS[focus.tour.process].examples.find((e) => e.id === focus.tour.exampleId);
  const look = lookOfKind((exampleKind?.kind ?? 'ECOM') as PacketKind, exampleKind?.payload.cardType ?? 'DEBIT');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const before = was.current;
    was.current = { index: focus.index, intro: focus.tour.intro, plan: focus.plan };
    const sameRun = before !== null && before.plan === focus.plan;
    // Moving off the briefing, or stepping back or forward by one, travels. Anything else sets the token down.
    const from = sameRun && !focus.tour.intro ? (before.intro ? focus.index : before.index) : null;
    const points = arrivalPath(focus, from);
    const put = (p: Pt): void => {
      el.style.transform = `translate(${(p[0] - 22).toFixed(1)}px, ${(p[1] - 16).toFixed(1)}px)`;
    };
    const length = polylineLength(points);
    const duration = travelMs(points);
    if (prefersReducedMotion() || length === 0 || duration === 0) {
      put(points[points.length - 1] ?? restPoint(focus.current.place));
      return;
    }
    const started = performance.now();
    let frame = 0;
    const tick = (now: number): void => {
      const t = Math.min(1, (now - started) / duration);
      put(pointAlong(points, length * easeInOut(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    put(points[0] as Pt);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [focus.index, focus.tour.intro, focus.plan]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={ref} className="pointer-events-none absolute left-0 top-0 z-30" style={{ width: 44, height: 32 }} data-testid="walk-token" data-place={focus.current.place} aria-hidden="true">
      <span className="bk-token-pulse absolute inset-0 rounded-full" style={{ ['--tour' as string]: focus.accent }} />
      <svg width="44" height="32" viewBox="-22 -16 44 32" className="relative">
        <TokenShape look={look} />
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Where the explanation goes
// ─────────────────────────────────────────────────────────────────────────────

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const overlap = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

export interface PlaceOptions {
  /** Space kept between the desk and the card. */
  gap?: number;
  /** The desk the token goes to next: the card should not hide where the story is heading. */
  next?: Rect | null;
  /** Every other desk the process uses, which stay lit. Hiding them costs a little. */
  lit?: readonly Rect[];
  /** The card never goes higher than this (the viewport dock sits above it). */
  minTop?: number;
}

export type CalloutSide = 'right' | 'left' | 'below' | 'above' | 'far';

/**
 * Puts the card where it hides the least of the story: never on the desk the token is at, preferably not on the desk it
 * goes to next, and as little as possible on the other lit desks, while staying close to the token. Pure, so it can be tested.
 */
export function placeCallout(desk: Rect, card: { w: number; h: number }, bounds: { w: number; h: number }, opts: PlaceOptions = {}): { left: number; top: number; side: CalloutSide } {
  const gap = opts.gap ?? 16;
  const margin = 8;
  const cx = (desk.left + desk.right) / 2;
  const cy = (desk.top + desk.bottom) / 2;
  const clampX = (x: number): number => Math.max(margin, Math.min(bounds.w - card.w - margin, x));
  const top = Math.max(margin, opts.minTop ?? margin);
  const clampY = (y: number): number => Math.max(top, Math.min(bounds.h - card.h - margin, y));
  const midX = clampX(bounds.w / 2 - card.w / 2);
  const candidates: Array<{ side: CalloutSide; left: number; top: number }> = [
    { side: 'right', left: clampX(desk.right + gap), top: clampY(cy - card.h / 2) },
    { side: 'left', left: clampX(desk.left - gap - card.w), top: clampY(cy - card.h / 2) },
    { side: 'below', left: clampX(cx - card.w / 2), top: clampY(desk.bottom + gap) },
    { side: 'above', left: clampX(cx - card.w / 2), top: clampY(desk.top - gap - card.h) },
    { side: 'far', left: clampX(margin), top: clampY(margin) },
    { side: 'far', left: clampX(bounds.w), top: clampY(margin) },
    { side: 'far', left: clampX(margin), top: clampY(bounds.h) },
    { side: 'far', left: clampX(bounds.w), top: clampY(bounds.h) },
    { side: 'far', left: midX, top: clampY(margin) },
    { side: 'far', left: midX, top: clampY(bounds.h) },
  ];
  const lit = opts.lit ?? [];
  let best = candidates[0] as (typeof candidates)[number];
  let bestCost = Infinity;
  for (const c of candidates) {
    const rect: Rect = { left: c.left, top: c.top, right: c.left + card.w, bottom: c.top + card.h };
    let cost = overlap(rect, desk) * 12;
    if (opts.next) cost += overlap(rect, opts.next) * 5;
    for (const l of lit) cost += overlap(rect, l) * 1.5;
    // Close to the token is worth some hidden map: reading starts where the eye already is.
    cost += Math.hypot(c.left + card.w / 2 - cx, c.top + card.h / 2 - cy) * 120;
    if (cost < bestCost) {
      best = c;
      bestCost = cost;
    }
  }
  return best;
}

/** The briefing over the map, then the step card in the left dock once the token arrives; drives auto-play. */
export function SpotlightOverlay() {
  const focus = useSpotlightFocus();
  const collapsed = useBankStore((s) => s.walkCollapsed);
  // Same travel time the token takes.
  const arrived = useTourPlayback(focus, (f) => (prefersReducedMotion() ? 0 : travelMs(tokenPolyline(f.current.route))));
  if (!focus) return null;
  if (focus.tour.intro) return <Kickoff focus={focus} />;
  if (!arrived || collapsed) return null;
  return <DockedStepCard focus={focus} />;
}
