import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { STAGE } from '../engine/plan/layout';
import { clampZoom, wheelZoom, ZOOM_STEP, zoomStore } from '../store/zoomStore';
import { freeCentre, type SmartView, type SmartZoomCamera, type ViewInsets, type Viewport } from './useSmartZoom';

const MIN_SCALE = 0.5;
const MAX_SCALE = 1.3;

// Glide convergence: snap once within these.
export const CONVERGE = { zoom: 0.005, px: 0.5 } as const;

/**
 * Drag-to-pan.
 *   slack      share of the frame the stage may be dragged past its edges (so at least half a frame of map stays in view)
 *   threshold  px the pointer must travel before a press becomes a drag (below it, it is a click)
 *   rubber     resistance past the bounds while dragging (1 = none), easing off to at most `stretch` px
 *   settleMs   spring back into bounds on release
 */
export const PAN = { slack: 0.5, threshold: 4, rubber: 0.3, stretch: 120, settleMs: 220 } as const;

/** Elements that keep their own pointer behaviour: a press on them never starts a pan. */
/** Surfaces inside the map frame whose text stays selectable. */
export const SELECTABLE = 'input, textarea, [contenteditable="true"], [role="dialog"], [role="region"], .select-text';

export const PAN_BLOCK = 'button, a, input, select, textarea, label, [role="button"], [role="dialog"], [role="region"], [role="listbox"], [data-no-pan]';

/** Drops any text range the browser has selected (a press that slipped onto a label before the drag took over). */
export function clearTextSelection(): void {
  try {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (sel && sel.rangeCount > 0) sel.removeAllRanges();
  } catch {
    // Some embedded browsers throw on getSelection; nothing to clear then.
  }
}

/** True when a press on `target` belongs to the map background (and so may start a pan). */
export const isPanTarget = (frame: Element, target: EventTarget | null): boolean => target instanceof Element && frame.contains(target) && !target.closest(PAN_BLOCK);

export const easeInOutCubic = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeOutCubic = (u: number): number => 1 - Math.pow(1 - u, 3);

/** True when the camera is close enough to the target to snap. */
export function converged(zoom: number, sx: number, sy: number, to: SmartView, scale: number): boolean {
  return Math.abs(zoom - to.zoom) < CONVERGE.zoom && Math.abs((sx - to.cx) * scale) < CONVERGE.px && Math.abs((sy - to.cy) * scale) < CONVERGE.px;
}

/** Frame px of the stage's top-left corner. */
export interface Pan {
  x: number;
  y: number;
}

export interface PanBounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Where the stage's corner may go: flush edges when it is larger than the frame, centred room when smaller, plus `slack`. */
export function panBounds(frame: Viewport, stage: Viewport, slack: number = PAN.slack): PanBounds {
  const mx = frame.w * slack;
  const my = frame.h * slack;
  return {
    x0: Math.min(frame.w - stage.w, 0) - mx,
    x1: Math.max(frame.w - stage.w, 0) + mx,
    y0: Math.min(frame.h - stage.h, 0) - my,
    y1: Math.max(frame.h - stage.h, 0) + my,
  };
}

/** Grows the bounds to include `p`, so a view a glide left outside them is never yanked back by the first drag. */
export const includePan = (b: PanBounds, p: Pan): PanBounds => ({ x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), y0: Math.min(b.y0, p.y), y1: Math.max(b.y1, p.y) });

export const clampPan = (p: Pan, b: PanBounds): Pan => ({ x: Math.min(b.x1, Math.max(b.x0, p.x)), y: Math.min(b.y1, Math.max(b.y0, p.y)) });

/**
 * Past a bound the stage follows the pointer at `k` of its speed, easing off towards `limit` px however far the pointer goes:
 * the map stretches a little, then springs back on release.
 */
export function rubberBand(v: number, lo: number, hi: number, k: number = PAN.rubber, limit: number = PAN.stretch): number {
  const stretch = (over: number): number => limit * (1 - 1 / (1 + (over * k) / limit));
  if (v < lo) return lo - stretch(lo - v);
  if (v > hi) return hi + stretch(v - hi);
  return v;
}

/** The whole-map view: centred across the frame, centred between the top dock and the bottom bar. */
export function homePan(frame: Viewport, stage: Viewport, insets: Pick<ViewInsets, 'top' | 'bottom'>): Pan {
  return { x: (frame.w - stage.w) / 2, y: insets.top + Math.max(0, (frame.h - insets.top - insets.bottom - stage.h) / 2) };
}

/** Fitted scale of the stage. Measured on the border box, so nothing inside the frame can change it. */
export function useFitScale(topInset: number, bottomInset: number): { ref: RefObject<HTMLDivElement>; scale: number } {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const w = el.offsetWidth - 24;
      const h = el.offsetHeight - 12 - topInset - bottomInset;
      if (w <= 0 || h <= 0) return;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(w / STAGE.width, h / STAGE.height)));
      setScale((was) => (Math.abs(was - next) < 1e-4 ? was : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [topInset, bottomInset]);
  return { ref, scale };
}

interface View {
  zoom: number;
  x: number;
  y: number;
}

export interface ZoomPan {
  zoom: number;
  pan: Pan;
  /** True while the stage is being dragged (drives the `grabbing` cursor). */
  panning: boolean;
  /** True after a drag, until the next press: lets a background click that ended a drag skip clearing the selection. */
  panned: RefObject<boolean>;
  camera: SmartZoomCamera;
}

/**
 * Zoom and pan on top of the fitted scale. The stage is placed with a transform (`pan` + `zoom`), so it can be dragged at any
 * zoom, including the whole-map fit. Wheel zooms about the cursor, a left-drag on empty map pans (never on a card or a
 * button), toolbar commands arrive via zoomStore, and `camera` glides for smart zoom.
 *
 * While a drag is held the view belongs to the user: glides stop at once and a smart-zoom flight asked for meanwhile waits
 * for the release, so the two never fight over the stage.
 */
export function useZoomPan(frame: RefObject<HTMLDivElement>, fit: number, insets: ViewInsets): ZoomPan {
  const [view, setViewState] = useState<View>(() => ({ zoom: 1, x: 0, y: 0 }));
  const [panning, setPanning] = useState(false);
  const viewRef = useRef(view);
  const setView = (next: View): void => {
    viewRef.current = next;
    setViewState(next);
  };
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const flight = useRef<number | null>(null);
  const panned = useRef(false);
  const interacting = useRef(false);
  const pendingFlight = useRef<{ to: SmartView; ms: number } | null>(null);
  // True while the view is the whole-map fit: a resize then re-centres instead of keeping a stage point.
  const homed = useRef(true);

  const stopFlight = (): void => {
    if (flight.current !== null) cancelAnimationFrame(flight.current);
    flight.current = null;
  };
  const frameSize = (): Viewport | null => {
    const el = frame.current;
    return el && el.clientWidth > 0 && el.clientHeight > 0 ? { w: el.clientWidth, h: el.clientHeight } : null;
  };
  const stageSize = (zoom: number): Viewport => ({ w: STAGE.width * fitRef.current * zoom, h: STAGE.height * fitRef.current * zoom });
  const goHome = (): void => {
    const f = frameSize();
    if (!f) return;
    homed.current = true;
    setView({ zoom: 1, ...homePan(f, stageSize(1), insetsRef.current) });
  };

  /** Zooms keeping the stage point under frame point (cx, cy) still. */
  const zoomAbout = (next: number, cx: number, cy: number): void => {
    const v = viewRef.current;
    const target = clampZoom(next);
    if (target === v.zoom) return;
    const s0 = fitRef.current * v.zoom;
    const s1 = fitRef.current * target;
    homed.current = false;
    const anchored = { x: cx - ((cx - v.x) / s0) * s1, y: cy - ((cy - v.y) / s0) * s1 };
    // Zooming about empty space far from the stage must not carry the map out of view: keep it inside the drag bounds.
    const f = frameSize();
    const kept = f ? clampPan(anchored, panBounds(f, stageSize(target))) : anchored;
    setView({ zoom: target, ...kept });
  };

  // First layout, and every refit: the whole map if it was showing, otherwise the stage point in the middle stays put.
  const lastFit = useRef<number | null>(null);
  useLayoutEffect(() => {
    const was = lastFit.current;
    lastFit.current = fit;
    if (was === null || homed.current) return goHome();
    const f = frameSize();
    if (!f || was === fit) return;
    const v = viewRef.current;
    const c = { x: f.w / 2, y: f.h / 2 };
    setView({ zoom: v.zoom, x: c.x - ((c.x - v.x) / (was * v.zoom)) * (fit * v.zoom), y: c.y - ((c.y - v.y) / (was * v.zoom)) * (fit * v.zoom) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);

  // A frame that changes size without a refit (the scale is capped) still re-centres the whole-map view.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (homed.current && !interacting.current) goHome();
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);
  useEffect(() => {
    if (homed.current) goHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insets.top, insets.bottom]);

  // Wheel: non-passive so the page does not scroll while zooming.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      stopFlight();
      const r = el.getBoundingClientRect();
      zoomAbout(wheelZoom(viewRef.current.zoom, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      stopFlight();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toolbar commands.
  useEffect(
    () =>
      zoomStore.subscribe((s, prev) => {
        const c = s.command;
        if (!c || c === prev.command) return;
        const f = frameSize();
        if (!f) return;
        stopFlight();
        if (c.kind === 'fit') return goHome();
        zoomAbout(viewRef.current.zoom * (c.kind === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP), f.w / 2, f.h / 2);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    zoomStore.getState().report(fit * view.zoom * 100);
  }, [fit, view.zoom]);

  // Smart-zoom glide: zoom (log-eased) and centre together, toward the free area's centre.
  const flyTo = (to: SmartView, ms: number): void => {
    // The user holds the map: this flight waits for the release.
    if (interacting.current) {
      pendingFlight.current = { to, ms };
      return;
    }
    const f = frameSize();
    if (!f) return;
    stopFlight();
    const ins = insetsRef.current;
    const { x: vx, y: vy } = freeCentre(f, { ...ins, right: ins.right + (to.padRight ?? 0) });
    const v0 = viewRef.current;
    const z0 = v0.zoom;
    const s0 = fitRef.current * z0;
    const x0 = (vx - v0.x) / s0;
    const y0 = (vy - v0.y) / s0;
    const target: SmartView = { ...to, zoom: clampZoom(to.zoom) };
    const isHome = to.home === true;
    // Already there: no flight, no re-render.
    if (converged(z0, x0, y0, target, s0)) {
      homed.current = isHome;
      return;
    }
    homed.current = false;
    const place = (z: number, sx: number, sy: number): void => {
      const s = fitRef.current * z;
      setView({ zoom: z, x: vx - sx * s, y: vy - sy * s });
    };
    const t0 = performance.now();
    const step = (now: number): void => {
      const u = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
      const e = easeInOutCubic(u);
      const z = clampZoom(z0 * Math.pow(target.zoom / z0, e));
      const sx = x0 + (target.cx - x0) * e;
      const sy = y0 + (target.cy - y0) * e;
      const done = u >= 1 || converged(z, sx, sy, target, fitRef.current * z);
      if (done) {
        flight.current = null;
        if (isHome) goHome();
        else place(target.zoom, target.cx, target.cy);
        return;
      }
      place(z, sx, sy);
      flight.current = requestAnimationFrame(step);
    };
    if (ms > 0) flight.current = requestAnimationFrame(step);
    else step(t0);
  };

  /** Eases the stage back inside its bounds after a drag that ended in the rubber band. */
  const settle = (from: View, to: Pan): void => {
    if (from.x === to.x && from.y === to.y) return;
    const t0 = performance.now();
    const step = (now: number): void => {
      const u = Math.min(1, (now - t0) / PAN.settleMs);
      const e = easeOutCubic(u);
      setView({ zoom: from.zoom, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      flight.current = u < 1 ? requestAnimationFrame(step) : null;
    };
    stopFlight();
    flight.current = requestAnimationFrame(step);
  };

  // Left-drag on empty map pans.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let start: { x: number; y: number; view: View; bounds: PanBounds; id: number } | null = null;
    const end = (e: PointerEvent): void => {
      if (!start || e.pointerId !== start.id) return;
      const dragged = panned.current;
      start = null;
      interacting.current = false;
      setPanning(false);
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (dragged) {
        clearTextSelection();
        const f = frameSize();
        const v = viewRef.current;
        if (f) settle(v, clampPan(v, panBounds(f, stageSize(v.zoom))));
      }
      const pending = pendingFlight.current;
      pendingFlight.current = null;
      if (pending) flyTo(pending.to, pending.ms);
    };
    const onDown = (e: PointerEvent): void => {
      panned.current = false;
      if (e.button !== 0 || !isPanTarget(el, e.target)) return;
      const f = frameSize();
      if (!f) return;
      // No text range may start from a press on the map background.
      e.preventDefault();
      clearTextSelection();
      // The user takes the camera: any glide stops here, before the first move.
      stopFlight();
      interacting.current = true;
      const v = viewRef.current;
      start = { x: e.clientX, y: e.clientY, view: v, bounds: includePan(panBounds(f, stageSize(v.zoom)), v), id: e.pointerId };
    };
    const onMove = (e: PointerEvent): void => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!panned.current) {
        if (Math.hypot(dx, dy) < PAN.threshold) return;
        panned.current = true;
        homed.current = false;
        el.setPointerCapture?.(e.pointerId);
        setPanning(true);
        clearTextSelection();
      }
      const b = start.bounds;
      setView({ zoom: start.view.zoom, x: rubberBand(start.view.x + dx, b.x0, b.x1), y: rubberBand(start.view.y + dy, b.y0, b.y1) });
    };
    // Cancelling pointerdown does not stop Chrome's text selection: that is mousedown's default action, so cancel it too.
    const onMouseDown = (e: MouseEvent): void => {
      if (e.button === 0 && isPanTarget(el, e.target)) e.preventDefault();
    };
    // No selection may begin on the map itself, even from a press on a card (which keeps its click and focus): a drag from
    // there would otherwise sweep up the text of the panels around the map. Reading surfaces that float over the map (the
    // tour's dialog and step card, form fields, anything marked select-text) keep normal selection for copy and paste.
    const onSelectStart = (e: Event): void => {
      const t = e.target instanceof Element ? e.target : e.target instanceof Node ? e.target.parentElement : null;
      if (!t?.closest(SELECTABLE)) e.preventDefault();
    };
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('selectstart', onSelectStart);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    // Without capture (a press that never became a drag), leaving the frame ends it too.
    el.addEventListener('pointerleave', end);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('selectstart', onSelectStart);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      el.removeEventListener('pointerleave', end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  const camera: SmartZoomCamera = {
    fit,
    viewport: () => {
      const f = frameSize();
      if (!f) return null;
      const { top, right, bottom, left } = insetsRef.current;
      const w = f.w - 24 - left - right;
      const h = f.h - 12 - top - bottom;
      return w > 0 && h > 0 ? { w, h } : null;
    },
    flyTo,
    stop: () => {
      stopFlight();
      pendingFlight.current = null;
    },
    // The stage point that sits at the free centre in the whole-map view, so the glide ends exactly on goHome().
    home: (ms) => {
      const f = frameSize();
      if (!f) return;
      const ins = insetsRef.current;
      const h = homePan(f, stageSize(1), ins);
      const c = freeCentre(f, ins);
      flyTo({ zoom: 1, cx: (c.x - h.x) / fitRef.current, cy: (c.y - h.y) / fitRef.current, home: true }, ms);
    },
    isInteracting: () => interacting.current,
  };

  return { zoom: view.zoom, pan: { x: view.x, y: view.y }, panning, panned, camera };
}
