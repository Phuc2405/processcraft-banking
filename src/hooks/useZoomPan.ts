import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { STAGE } from '../components/bank/layout';
import { clampZoom, wheelZoom, ZOOM_STEP, zoomStore } from '../store/zoomStore';
import { freeCentre, type SmartView, type SmartZoomCamera, type ViewInsets } from './useSmartZoom';

const MIN_SCALE = 0.5;
const MAX_SCALE = 1.3;

// Glide convergence: snap once within these.
export const CONVERGE = { zoom: 0.005, px: 0.5 } as const;

export const easeInOutCubic = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** True when the camera is close enough to the target to snap. */
export function converged(zoom: number, sx: number, sy: number, to: SmartView, scale: number): boolean {
  return Math.abs(zoom - to.zoom) < CONVERGE.zoom && Math.abs((sx - to.cx) * scale) < CONVERGE.px && Math.abs((sy - to.cy) * scale) < CONVERGE.px;
}

/** Fitted scale of the stage. Measured on the border box, so scrollbars appearing mid-zoom never change it. */
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

/**
 * Zoom and pan on top of the fitted scale: wheel zooms about the cursor, background drag pans, toolbar commands arrive via
 * zoomStore, and `camera` glides for smart zoom.
 */
export function useZoomPan(frame: RefObject<HTMLDivElement>, fit: number, insets: ViewInsets): { zoom: number; content: RefObject<HTMLDivElement>; panned: RefObject<boolean>; camera: SmartZoomCamera } {
  const [zoom, setZoom] = useState(1);
  // Bumped per flight frame so a pan-only frame still re-scrolls.
  const [nudge, setNudge] = useState(0);
  const flight = useRef<number | null>(null);
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  const stopFlight = (): void => {
    if (flight.current !== null) cancelAnimationFrame(flight.current);
    flight.current = null;
  };
  const content = useRef<HTMLDivElement>(null);
  const panned = useRef(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const fitRef = useRef(fit);
  fitRef.current = fit;
  /** Stage point that must land under frame point (cx, cy) once the new scale is drawn. */
  const anchor = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);

  const zoomAbout = (next: number, cx: number, cy: number): void => {
    const el = frame.current;
    const box = content.current;
    const target = clampZoom(next);
    if (!el || !box || target === zoomRef.current) return;
    const scale = fitRef.current * zoomRef.current;
    anchor.current = { sx: (el.scrollLeft + cx - box.offsetLeft) / scale, sy: (el.scrollTop + cy - box.offsetTop) / scale, cx, cy };
    setZoom(target);
  };

  // Non-passive so the page does not scroll while zooming.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      stopFlight();
      const r = el.getBoundingClientRect();
      zoomAbout(wheelZoom(zoomRef.current, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      stopFlight();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After the new scale is drawn, scroll the anchored stage point back into place.
  useLayoutEffect(() => {
    const el = frame.current;
    const box = content.current;
    const a = anchor.current;
    if (!el || !box || !a) return;
    anchor.current = null;
    const scale = fit * zoom;
    el.scrollLeft = box.offsetLeft + a.sx * scale - a.cx;
    el.scrollTop = box.offsetTop + a.sy * scale - a.cy;
  }, [zoom, fit, frame, nudge]);

  // Toolbar commands.
  useEffect(
    () =>
      zoomStore.subscribe((s, prev) => {
        const c = s.command;
        if (!c || c === prev.command) return;
        const el = frame.current;
        if (!el) return;
        stopFlight();
        if (c.kind === 'fit') {
          anchor.current = null;
          setZoom(1);
          el.scrollTo({ left: 0, top: 0 });
          return;
        }
        zoomAbout(zoomRef.current * (c.kind === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP), el.clientWidth / 2, el.clientHeight / 2);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    zoomStore.getState().report(fit * zoom * 100);
  }, [fit, zoom]);

  // Background drag pans.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let start: { x: number; y: number; left: number; top: number; id: number } | null = null;
    const onDown = (e: PointerEvent): void => {
      const t = e.target as HTMLElement;
      const background = t === el || t.dataset.testid === 'bank-stage' || t.dataset.panBg !== undefined || t === content.current;
      panned.current = false;
      if (e.button !== 0 || !background) return;
      stopFlight();
      start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, id: e.pointerId };
    };
    const onMove = (e: PointerEvent): void => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!panned.current && Math.hypot(dx, dy) < 4) return;
      if (!panned.current) {
        panned.current = true;
        el.setPointerCapture?.(e.pointerId);
        el.style.cursor = 'grabbing';
      }
      el.scrollLeft = start.left - dx;
      el.scrollTop = start.top - dy;
    };
    const onUp = (e: PointerEvent): void => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      el.style.cursor = '';
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [frame]);

  // Smart-zoom glide: zoom (log-eased) and centre together, toward the free area's centre.
  const flyTo = (to: SmartView, ms: number): void => {
    const el = frame.current;
    const box = content.current;
    if (!el || !box) return;
    stopFlight();
    const ins = insetsRef.current;
    const { x: vx, y: vy } = freeCentre({ w: el.clientWidth, h: el.clientHeight }, { ...ins, right: ins.right + (to.padRight ?? 0) });
    const z0 = zoomRef.current;
    const s0 = fitRef.current * z0;
    const x0 = (el.scrollLeft + vx - box.offsetLeft) / s0;
    const y0 = (el.scrollTop + vy - box.offsetTop) / s0;
    const target: SmartView = { ...to, zoom: clampZoom(to.zoom) };
    // Already there: no flight, no re-render.
    if (converged(z0, x0, y0, target, s0)) return;
    const t0 = performance.now();
    const step = (now: number): void => {
      const u = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
      const e = easeInOutCubic(u);
      const z = clampZoom(z0 * Math.pow(target.zoom / z0, e));
      const sx = x0 + (target.cx - x0) * e;
      const sy = y0 + (target.cy - y0) * e;
      const done = u >= 1 || converged(z, sx, sy, target, fitRef.current * z);
      anchor.current = done ? { sx: target.cx, sy: target.cy, cx: vx, cy: vy } : { sx, sy, cx: vx, cy: vy };
      setZoom(done ? target.zoom : z);
      setNudge((n) => n + 1);
      flight.current = done ? null : requestAnimationFrame(step);
    };
    if (ms > 0) flight.current = requestAnimationFrame(step);
    else step(t0);
  };

  const camera: SmartZoomCamera = {
    fit,
    viewport: () => {
      const el = frame.current;
      if (!el) return null;
      const { top, right, bottom, left } = insetsRef.current;
      const w = el.clientWidth - 24 - left - right;
      const h = el.clientHeight - 12 - top - bottom;
      return w > 0 && h > 0 ? { w, h } : null;
    },
    flyTo,
    stop: stopFlight,
    home: (ms) => flyTo({ zoom: 1, cx: STAGE.width / 2, cy: STAGE.height / 2 }, ms),
  };

  return { zoom, content, panned, camera };
}
