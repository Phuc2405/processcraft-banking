/** A one-way channel from the 3D canvas to the page: where the desks of the tour are on the screen right now (read with readTourScreen). */

import type { ScreenRect } from '../../../types/geometry';

export interface TourScreen {
  /** The canvas size in CSS pixels. */
  w: number;
  h: number;
  /** The desk the token is at. */
  here: ScreenRect;
  /** The desk it goes to next, if that is a different one. */
  next: ScreenRect | null;
  /** The other desks of the chapter, which stay lit. */
  lit: readonly ScreenRect[];
}

let current: TourScreen | null = null;

const sameRect = (a: ScreenRect | null, b: ScreenRect | null): boolean => (a === null || b === null ? a === b : a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom);

/** Publishes the screen layout of the tour. Does nothing when it has not changed. */
export function publishTourScreen(next: TourScreen | null): void {
  const was = current;
  if (was === next) return;
  if (was && next && was.w === next.w && was.h === next.h && sameRect(was.here, next.here) && sameRect(was.next, next.next) && was.lit.length === next.lit.length && was.lit.every((r, i) => sameRect(r, next.lit[i] ?? null))) return;
  current = next;
}

export const readTourScreen = (): TourScreen | null => current;

