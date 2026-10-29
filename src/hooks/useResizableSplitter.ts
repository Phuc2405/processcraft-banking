import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

export interface SplitBounds {
  /** Smallest share of the container the first pane may take (0–1). */
  min: number;
  /** Largest share (0–1). */
  max: number;
}

/** Keeps a ratio inside its bounds; NaN falls back to the midpoint. */
export function clampRatio(ratio: number, { min, max }: SplitBounds): number {
  if (!Number.isFinite(ratio)) return (min + max) / 2;
  return Math.min(max, Math.max(min, ratio));
}

/** The first pane's share when the divider is dragged to `client` (px), inside a container spanning `start` to `start + size`. */
export function ratioAt(client: number, start: number, size: number, bounds: SplitBounds): number {
  if (size <= 0) return clampRatio(Number.NaN, bounds);
  return clampRatio((client - start) / size, bounds);
}

export interface ResizableSplitter<E extends HTMLElement> {
  /** Put on the element that holds both panes and the handle. */
  containerRef: RefObject<E>;
  /** Spread onto the handle: pointer drag, arrow keys, Home / End, ARIA separator values. */
  handleProps: HTMLAttributes<HTMLDivElement>;
  dragging: boolean;
}

/** Drag state for a two-pane split. */
export function useResizableSplitter<E extends HTMLElement = HTMLDivElement>({
  ratio,
  onChange,
  bounds,
  axis = 'y',
  keyStep = 0.05,
}: {
  ratio: number;
  onChange: (ratio: number) => void;
  bounds: SplitBounds;
  axis?: 'x' | 'y';
  keyStep?: number;
}): ResizableSplitter<E> {
  const containerRef = useRef<E>(null);
  const [dragging, setDragging] = useState(false);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const emit = useCallback((next: number) => onChange(clampRatio(next, bounds)), [onChange, bounds]);

  const fromPointer = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return;
      const client = axis === 'y' ? e.clientY : e.clientX;
      const [start, size] = axis === 'y' ? [box.top, box.height] : [box.left, box.width];
      // One update per frame: a fast drag fires pointermove far more often than the screen repaints.
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => onChange(ratioAt(client, start, size, bounds)));
    },
    [axis, bounds, onChange],
  );

  const end = useCallback((e: PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const handleProps: HTMLAttributes<HTMLDivElement> = {
    role: 'separator',
    tabIndex: 0,
    'aria-orientation': axis === 'y' ? 'horizontal' : 'vertical',
    'aria-valuemin': Math.round(bounds.min * 100),
    'aria-valuemax': Math.round(bounds.max * 100),
    'aria-valuenow': Math.round(ratio * 100),
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    },
    onPointerMove: (e) => {
      if (dragging) fromPointer(e);
    },
    onPointerUp: end,
    onPointerCancel: end,
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      const back = axis === 'y' ? 'ArrowUp' : 'ArrowLeft';
      const fwd = axis === 'y' ? 'ArrowDown' : 'ArrowRight';
      if (e.key === back) emit(ratio - keyStep);
      else if (e.key === fwd) emit(ratio + keyStep);
      else if (e.key === 'Home') emit(bounds.min);
      else if (e.key === 'End') emit(bounds.max);
      else return;
      e.preventDefault();
    },
  };

  return { containerRef, handleProps, dragging };
}
