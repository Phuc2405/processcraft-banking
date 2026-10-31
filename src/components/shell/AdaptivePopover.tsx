import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** One floating list for every menu over the map: portalled above all overlays, kept inside the window, and always scrollable. */

export type PopoverDirection = 'down' | 'up';

export interface PopoverPlace {
  direction: PopoverDirection;
  left: number;
  width: number;
  /** Distance from the window's top edge, opening down. */
  top?: number;
  /** Distance from the window's bottom edge, opening up. */
  bottom?: number;
  maxHeight: number;
}

const EDGE = 8;
const GAP = 4;
/** Below this much room, the list opens the other way if there is more room there. */
const MIN_ROOM = 160;

/** Where a list goes for its anchor: the preferred way unless that is too tight, as tall as the limits and the window allow, and never off the side of the window. */
export function popoverPlace(anchor: { left: number; right: number; top: number; bottom: number }, view: { w: number; h: number }, o: { direction?: PopoverDirection; width: number; maxVh?: number; maxPx?: number; align?: 'center' | 'start' }): PopoverPlace {
  const roomDown = view.h - anchor.bottom - GAP - EDGE;
  const roomUp = anchor.top - GAP - EDGE;
  const wanted = o.direction ?? 'down';
  const preferred = wanted === 'down' ? roomDown : roomUp;
  const other = wanted === 'down' ? roomUp : roomDown;
  const direction: PopoverDirection = preferred < MIN_ROOM && other > preferred ? (wanted === 'down' ? 'up' : 'down') : wanted;
  const room = direction === 'down' ? roomDown : roomUp;
  const width = Math.min(o.width, view.w - EDGE * 2);
  const start = o.align === 'start' ? anchor.left : anchor.left + (anchor.right - anchor.left) / 2 - width / 2;
  return {
    direction,
    left: Math.max(EDGE, Math.min(start, view.w - width - EDGE)),
    width,
    maxHeight: Math.max(0, Math.min((o.maxVh ?? 0.55) * view.h, o.maxPx ?? 380, room)),
    ...(direction === 'down' ? { top: anchor.bottom + GAP } : { bottom: view.h - anchor.top + GAP }),
  };
}

/** What a key does in an open list: the next active row, pick it, close it, or nothing. */
export function listboxKey(key: string, active: number, count: number): number | 'pick' | 'close' | null {
  if (key === 'ArrowDown') return (active + 1) % count;
  if (key === 'ArrowUp') return (active + count - 1) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'Enter' || key === ' ') return 'pick';
  if (key === 'Escape') return 'close';
  return null;
}

export function AdaptivePopover({
  anchor,
  onClose,
  direction = 'down',
  width,
  maxVh,
  maxPx,
  align,
  id,
  label,
  testId,
  activeIndex,
  className = 'border-slate-700 bg-slate-950 p-1 shadow-2xl',
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  direction?: PopoverDirection;
  width: number;
  maxVh?: number;
  maxPx?: number;
  align?: 'center' | 'start';
  id?: string;
  label: string;
  testId: string;
  /** The keyboard's row, kept in view as the list scrolls (rows carry data-index). */
  activeIndex?: number;
  className?: string;
  children: ReactNode;
}) {
  const list = useRef<HTMLUListElement>(null);
  const [place, setPlace] = useState<PopoverPlace | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const measure = (): void => {
      const r = anchor.current?.getBoundingClientRect();
      if (r) setPlace(popoverPlace(r, { w: window.innerWidth, h: window.innerHeight }, { direction, width, ...(maxVh === undefined ? {} : { maxVh }), ...(maxPx === undefined ? {} : { maxPx }), ...(align ? { align } : {}) }));
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchor, direction, width, maxVh, maxPx, align]);

  useEffect(() => {
    const away = (e: PointerEvent): void => {
      const at = e.target as Node;
      if (!anchor.current?.contains(at) && !list.current?.contains(at)) close.current();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [anchor]);

  useEffect(() => {
    if (activeIndex !== undefined) list.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return createPortal(
    <ul
      ref={list}
      id={id}
      role="listbox"
      aria-label={label}
      data-testid={testId}
      data-direction={place?.direction}
      style={place ? { left: place.left, width: place.width, maxHeight: place.maxHeight, ...(place.top === undefined ? { bottom: place.bottom } : { top: place.top }) } : { visibility: 'hidden' }}
      onWheel={(e) => e.stopPropagation()}
      className={`bk-scroll fixed z-[100] overflow-y-auto overscroll-contain rounded-xl border ${className}`}
    >
      {children}
    </ul>,
    document.body,
  );
}
