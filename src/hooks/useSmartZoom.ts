import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { EDGE_PAD, needsRightPad, PLACE_BOX, type PlaceBox } from '../components/bank/layout';
import { useSpotlightFocus, type Focus } from '../components/bank/useSpotlight';
import { prefersReducedMotion } from '../components/canvas/timing';
import { flowScope } from '../sim/guidedFlows';
import type { FlowId } from '../types/viewport';
import type { PlaceId } from '../sim/topology';
import { academyFocusOf, activeFlowOf, useBankStore } from '../store/bankStore';
import { useNavStore } from '../store/navStore';
import { ZOOM_2D } from '../store/zoomStore';

export interface StageRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Target view: zoom as a multiple of the fitted scale, and the stage point to centre. */
export interface SmartView {
  zoom: number;
  cx: number;
  cy: number;
  /** Extra px kept free on the right (edge clusters). */
  padRight?: number;
  /** The whole-map view: the camera ends on its exact home placement. */
  home?: boolean;
}

export interface Viewport {
  w: number;
  h: number;
}

/** What a 2D view must provide for smart zoom. */
export interface SmartZoomCamera {
  fit: number;
  viewport(): Viewport | null;
  flyTo(view: SmartView, ms: number): void;
  /** Cancels any glide in flight. */
  stop(): void;
  home(ms: number): void;
  /** True while the user is dragging the map: flights wait for the release. */
  isInteracting(): boolean;
}

// padding: share of the viewport left free around the cluster. minBox: floor so one desk never fills the screen.
export const SMART_ZOOM = { padding: 0.15, minBox: { w: 420, h: 300 }, ms: 480 } as const;
// Search jumps: tighter box, slower glide.
export const NAV_ZOOM = { minBox: { w: 360, h: 260 }, ms: 640 } as const;

/** Screen px the floating chrome covers on each side of the map frame. */
export interface ViewInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Frame point (px) where the free area's centre lies. */
export function freeCentre(frame: Viewport, insets: ViewInsets): { x: number; y: number } {
  return { x: insets.left + Math.max(0, frame.w - insets.left - insets.right) / 2, y: insets.top + Math.max(0, frame.h - insets.top - insets.bottom) / 2 };
}

export function boundsOf(places: Iterable<PlaceId>, boxes: Readonly<Record<PlaceId, PlaceBox>> = PLACE_BOX): StageRect | null {
  let r: StageRect | null = null;
  for (const p of places) {
    const b = boxes[p];
    if (!b) continue;
    const x0 = b.cx - b.w / 2;
    const y0 = b.cy - b.h / 2;
    const x1 = b.cx + b.w / 2;
    const y1 = b.cy + b.h / 2;
    r = r ? { x0: Math.min(r.x0, x0), y0: Math.min(r.y0, y0), x1: Math.max(r.x1, x1), y1: Math.max(r.y1, y1) } : { x0, y0, x1, y1 };
  }
  return r;
}

export function inflateToMin(r: StageRect, min: Viewport = SMART_ZOOM.minBox): StageRect {
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  const w = Math.max(min.w, r.x1 - r.x0) / 2;
  const h = Math.max(min.h, r.y1 - r.y0) / 2;
  return { x0: cx - w, y0: cy - h, x1: cx + w, y1: cy + h };
}

/** Zoom/centre that fits `rect` into the viewport with `padding`; never below the full-map fit. */
export function smartView(rect: StageRect, viewport: Viewport, fit: number, padding: number = SMART_ZOOM.padding, minBox: Viewport = SMART_ZOOM.minBox): SmartView {
  const r = inflateToMin(rect, minBox);
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const free = 1 - padding;
  // Right-edge clusters: reserve extra room on the right, which also shifts the centre left.
  const padRight = needsRightPad(rect) ? EDGE_PAD.right : 0;
  const vw = Math.max(0, viewport.w - padRight);
  const raw = fit > 0 && vw > 0 && viewport.h > 0 ? Math.min((vw * free) / (w * fit), (viewport.h * free) / (h * fit)) : 1;
  const zoom = Number.isFinite(raw) ? Math.min(ZOOM_2D.max, Math.max(1, raw)) : 1;
  return { zoom, cx: (r.x0 + r.x1) / 2, cy: (r.y0 + r.y1) / 2, ...(padRight ? { padRight } : {}) };
}

/** Active node ids: tour step (current route + next stop), else the guided flow, else the Academy node. */
export function activePlaces(focus: Pick<Focus, 'tour' | 'plan' | 'index' | 'current' | 'scope'> | null, flow: FlowId | null, academy: PlaceId | null): PlaceId[] | null {
  if (focus) {
    if (focus.tour.intro) return [...focus.scope.places];
    const next = focus.plan.steps[focus.index + 1]?.place;
    return [...new Set<PlaceId>([...focus.current.route, ...(next ? [next] : [])])];
  }
  if (flow) return [...flowScope(flow).places];
  return academy ? [academy] : null;
}

/** Glides the 2D map to the active cluster whenever it changes, back to the full map when it clears, and to search jumps. */
export function useSmartZoom(camera: SmartZoomCamera): StageRect | null {
  const focus = useSpotlightFocus();
  const flow = useBankStore(activeFlowOf);
  const academy = useBankStore(academyFocusOf);
  const places = useMemo(() => activePlaces(focus, flow, academy), [focus, flow, academy]);
  const key = places ? [...places].sort().join('|') : '';
  const rect = useMemo(() => (places ? boundsOf(places) : null), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const cam = useRef(camera);
  cam.current = camera;
  const wasActive = useRef(false);
  const fitKey = Math.round(camera.fit * 100);
  // Last target flown to: the same cluster at the same fit is never re-launched.
  const flown = useRef('');

  // A new cluster (preset click) halts the current glide before paint.
  useLayoutEffect(() => {
    cam.current.stop();
  }, [key]);

  useEffect(() => {
    const c = cam.current;
    const ms = prefersReducedMotion() ? 0 : SMART_ZOOM.ms;
    if (rect) {
      const target = `${key}@${fitKey}`;
      if (flown.current === target) return;
      const vp = c.viewport();
      if (!vp) return;
      flown.current = target;
      c.flyTo(smartView(rect, vp, c.fit), ms);
      wasActive.current = true;
    } else if (wasActive.current) {
      wasActive.current = false;
      flown.current = '';
      c.home(ms);
    }
  }, [rect, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search jump: one place, tighter. Re-runs on refit so a jump made before the map mounted still lands.
  const nav = useNavStore((s) => s.target);
  useEffect(() => {
    if (!nav) return;
    const c = cam.current;
    const box = boundsOf([nav.place]);
    const vp = c.viewport();
    if (!box || !vp) return;
    flown.current = '';
    c.flyTo(smartView(box, vp, c.fit, SMART_ZOOM.padding, NAV_ZOOM.minBox), prefersReducedMotion() ? 0 : NAV_ZOOM.ms);
  }, [nav, fitKey]);

  return rect;
}
