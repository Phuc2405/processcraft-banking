import { useEffect, useMemo, useRef } from 'react';
import { PLACE_BOX, type PlaceBox } from '../components/bank/layout';
import { useSpotlightFocus, type Focus } from '../components/bank/useSpotlight';
import { prefersReducedMotion } from '../components/canvas/timing';
import { flowScope } from '../sim/guidedFlows';
import type { FlowId } from '../types/viewport';
import type { PlaceId } from '../sim/topology';
import { academyFocusOf, activeFlowOf, useBankStore } from '../store/bankStore';
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
  home(ms: number): void;
}

// padding: share of the viewport left free around the cluster. minBox: floor so one desk never fills the screen.
export const SMART_ZOOM = { padding: 0.15, minBox: { w: 420, h: 300 }, ms: 480 } as const;

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
export function smartView(rect: StageRect, viewport: Viewport, fit: number, padding: number = SMART_ZOOM.padding): SmartView {
  const r = inflateToMin(rect);
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const free = 1 - padding;
  const raw = fit > 0 && viewport.w > 0 && viewport.h > 0 ? Math.min((viewport.w * free) / (w * fit), (viewport.h * free) / (h * fit)) : 1;
  const zoom = Number.isFinite(raw) ? Math.min(ZOOM_2D.max, Math.max(1, raw)) : 1;
  return { zoom, cx: (r.x0 + r.x1) / 2, cy: (r.y0 + r.y1) / 2 };
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

/** Glides the 2D map to the active cluster whenever it changes, and back to the full map when it clears. */
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

  useEffect(() => {
    const c = cam.current;
    const ms = prefersReducedMotion() ? 0 : SMART_ZOOM.ms;
    if (rect) {
      const vp = c.viewport();
      if (!vp) return;
      c.flyTo(smartView(rect, vp, c.fit), ms);
      wasActive.current = true;
    } else if (wasActive.current) {
      wasActive.current = false;
      c.home(ms);
    }
  }, [rect, fitKey]);

  return rect;
}
