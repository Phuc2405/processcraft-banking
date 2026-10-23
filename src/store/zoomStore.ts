/**
 * The map's zoom, shared between the floating zoom toolbar and whichever view is on screen (the 2D blueprint or the 3D office).
 *
 * The toolbar sends commands (`zoomIn`, `zoomOut`, `fit`); the view on screen carries them out and reports back the zoom it
 * ended at as a percentage, which the toolbar shows. Each view keeps its own camera; this store only carries the messages.
 */

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type ZoomCommandKind = 'in' | 'out' | 'fit';

export interface ZoomCommand {
  kind: ZoomCommandKind;
  /** Increases with every command, so pressing the same button twice is two commands. */
  serial: number;
}

export interface ZoomState {
  /** The zoom of the view on screen, in percent of its natural size. */
  percent: number;
  command: ZoomCommand | null;
  send(kind: ZoomCommandKind): void;
  report(percent: number): void;
}

/** One press of + or −. */
export const ZOOM_STEP = 1.2;
/** The 2D blueprint's zoom range, in multiples of the fitted size. */
export const ZOOM_2D = { min: 0.5, max: 3 } as const;

export const clampZoom = (z: number, min: number = ZOOM_2D.min, max: number = ZOOM_2D.max): number => (Number.isFinite(z) ? Math.min(max, Math.max(min, z)) : 1);

/** The zoom after a wheel movement: smooth and proportional to how far the wheel turned. */
export const wheelZoom = (zoom: number, deltaY: number): number => clampZoom(zoom * Math.exp(-deltaY * 0.0015));

/**
 * Where the scroll position must go so the point under the cursor stays put when the scale changes from `from` to `to`.
 * `cursor` is the cursor's offset inside the scrolling frame, `scroll` the frame's scroll offset, `pad` the content's offset
 * inside the scrolled area (the stage is centred, so it may start some way in).
 */
export function scrollToKeep(cursor: number, scroll: number, pad: number, from: number, to: number): number {
  const stagePoint = (scroll + cursor - pad) / from;
  return stagePoint * to + pad - cursor;
}

export function createZoomStore(): StoreApi<ZoomState> {
  return createStore<ZoomState>()((set, get) => ({
    percent: 100,
    command: null,
    send: (kind) => set({ command: { kind, serial: (get().command?.serial ?? 0) + 1 } }),
    report: (percent) => {
      const p = Math.round(percent);
      if (Number.isFinite(p) && p !== get().percent) set({ percent: p });
    },
  }));
}

export const zoomStore = createZoomStore();

export function useZoomStore<T>(selector: (state: ZoomState) => T): T {
  return useStore(zoomStore, selector);
}
