/**
 * The path of the walkthrough token. It rides the same hand-routed wires the bank's own packets use (layout.ts),
 * from the resting place at one desk to the resting place at the next.
 */

import type { PlaceId } from '../../sim/topology';
import { edgeId } from '../../sim/topology';
import { CARD, PLACE_BOX, wireById } from '../../engine/plan/layout';

export type Pt = readonly [number, number];

/** Where the token sits at a desk: on the right edge of the card's picture, clear of the name and the queue number. */
export function restPoint(place: PlaceId): Pt {
  const b = PLACE_BOX[place];
  const isCard = b.w === CARD.w;
  return isCard ? [b.cx - b.w / 2 + 14, b.cy + 8] : [b.cx - b.w / 2 + 14, b.cy + b.h / 2 - 14];
}

/** The polyline from the resting place at the start of a route to the resting place at its end. */
export function tokenPolyline(route: readonly PlaceId[]): Pt[] {
  const first = route[0];
  if (!first) return [];
  const out: Pt[] = [restPoint(first)];
  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1] as PlaceId;
    const to = route[i] as PlaceId;
    const wire = wireById(edgeId(from, to));
    if (wire) out.push(...wire.points);
    else out.push(PLACE_BOX[from] ? [PLACE_BOX[from].cx, PLACE_BOX[from].cy] : restPoint(from), [PLACE_BOX[to].cx, PLACE_BOX[to].cy]);
    out.push(restPoint(to));
  }
  return out;
}

export function polylineLength(points: readonly Pt[]): number {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += Math.hypot((points[i] as Pt)[0] - (points[i - 1] as Pt)[0], (points[i] as Pt)[1] - (points[i - 1] as Pt)[1]);
  return n;
}

/** The point `d` units along a polyline (clamped to its ends). */
export function pointAlong(points: readonly Pt[], d: number): Pt {
  const first = points[0];
  if (!first) return [0, 0];
  let left = Math.max(0, d);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= len) {
      const t = len === 0 ? 0 : left / len;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= len;
  }
  return points[points.length - 1] as Pt;
}

/**
 * How long the token takes over a polyline. The tour locks the bank clock to 0.25×, and this is that pace: about a
 * quarter of the speed of the bank's own packets, with a floor so a short hop is still easy to follow.
 */
export const TOUR_PX_PER_MS = 0.22;
export const travelMs = (points: readonly Pt[]): number => (points.length < 2 ? 0 : Math.round(Math.min(3000, Math.max(700, polylineLength(points) / TOUR_PX_PER_MS))));

/** How long auto-play stays on a step so the explanation can be read: about 200 words a minute, within sensible bounds. */
export function dwellMs(words: number): number {
  return Math.round(Math.min(14_000, Math.max(4500, (words / 200) * 60_000)));
}
