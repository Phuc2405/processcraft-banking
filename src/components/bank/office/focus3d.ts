import { flowPlaces, flowScope } from '../../../sim/guidedFlows';
import type { PlaceId } from '../../../sim/topology';
import type { FlowId } from '../../../types/viewport';
import { LANES, type V2 } from '../../../engine/plan/layout3d';
import { pathLength, pointAlongPath } from './tour3d';

/**
 * What the 3D office brings forward and what it lets fade, and the staff walking home. Pure, so the tests can check them.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Focus: a pointed-at desk, or a guided scenario
// ─────────────────────────────────────────────────────────────────────────────

/** How strongly the rest of the office fades: to 20% round a pointed-at desk, to 10% outside a sub-process (guided scenario). */
export const DIM = { hover: 0.2, flow: 0.1 } as const;

/** How far the unrelated lanes and badges fade round a pointed-at desk. */
export const LANE_DIM = 0.15;

/** How far a condition badge outside the sub-process fades: almost gone, so only the scenario's own words read. */
export const FLOW_BADGE_DIM = 0.1;

/** The places one lane away from `place`, and the place itself. */
export function neighbours(place: PlaceId): ReadonlySet<PlaceId> {
  const out = new Set<PlaceId>([place]);
  for (const l of LANES) {
    if (l.from === place) out.add(l.to);
    if (l.to === place) out.add(l.from);
  }
  return out;
}

/** The opacity a desk (or kiosk) is drawn at: full when it is in focus, faded otherwise. A pointed-at desk wins over a scenario. */
export function deskFocus(place: PlaceId, hover: PlaceId | null, flow: FlowId | null): number {
  if (hover) return neighbours(hover).has(place) ? 1 : DIM.hover;
  if (flow) return flowPlaces(flow).has(place) ? 1 : DIM.flow;
  return 1;
}

/** The lanes lit now: the pointed-at desk's own, else the guided scenario's; and how much the others fade. */
export function litLanes(hover: PlaceId | null, flow: FlowId | null): { lanes: ReadonlySet<string>; dim: number } {
  if (hover) return { lanes: new Set(LANES.filter((l) => l.from === hover || l.to === hover).map((l) => l.id)), dim: LANE_DIM };
  if (flow) return { lanes: flowScope(flow).wires, dim: DIM.flow };
  return { lanes: new Set(), dim: 1 };
}

export type BadgeFocus = 'lit' | 'dim' | 'plain' | 'faded';

/**
 * How a lane's condition badge shows. A pointed-at desk: its own lanes' badges bright yellow ('lit'), every other badge
 * faded to LANE_DIM ('dim'). A sub-process: its own wires' badges as usual and in full ('plain'), every other badge almost
 * gone ('faded', FLOW_BADGE_DIM). Otherwise as usual ('plain'). A pointed-at desk wins over the sub-process.
 */
export function badgeFocus(l: { id?: string; from: PlaceId; to: PlaceId }, hover: PlaceId | null, flow: FlowId | null = null): BadgeFocus {
  if (hover !== null) return l.from === hover || l.to === hover ? 'lit' : 'dim';
  if (flow !== null) return l.id !== undefined && flowScope(flow).wires.has(l.id) ? 'plain' : 'faded';
  return 'plain';
}

/** A badge's opacity for its focus. */
export const badgeOpacity = (f: BadgeFocus): number => (f === 'dim' ? LANE_DIM : f === 'faded' ? FLOW_BADGE_DIM : 1);

/**
 * A lane cut into dashes, `dash` = [on, off] in world units (none: the whole lane), each dash its own run of points, so a
 * ribbon drawn over them reads dashed or dotted like the 2D wire.
 */
export function dashLane(points: readonly V2[], dash?: readonly [number, number]): V2[][] {
  if (!dash) return [points.slice()];
  const len = pathLength(points);
  const [on, off] = dash;
  const out: V2[][] = [];
  for (let d = 0; d < len; d += on + off) {
    const end = Math.min(len, d + on);
    const run: V2[] = [];
    // Sampled finely enough that a dash going round a bend follows it.
    for (let k = d; k < end; k += 0.08) run.push(pointAlongPath(points, k));
    run.push(pointAlongPath(points, end));
    if (run.length >= 2) out.push(run);
  }
  return out;
}

/** Light pulses on a lit lane: how many ride it at once, and how fast (world units a second). */
export const PULSE = { perLane: 2, speed: 3.2 } as const;

/** Where pulse `k` of a lane of length `len` is at time `t`: evenly spaced, looping from the start. */
export const pulseDistance = (len: number, k: number, t: number): number => (len <= 0 ? 0 : (((t * PULSE.speed + (k * len) / PULSE.perLane) % len) + len) % len);

// ─────────────────────────────────────────────────────────────────────────────
// Staff coming and going: the engine's (engine/staff.ts), re-exported for the views that draw them
// ─────────────────────────────────────────────────────────────────────────────

export { ARRIVE_SPEED, arriveRoute, arrivalMinute, arrivalState, isOffShift, LEAVE_SPEED, leaveAt, leaveRoute, STAFF_ARRIVAL } from '../../../engine/simulation/staff';

// ─────────────────────────────────────────────────────────────────────────────
// Where a desk's description opens, clear of its own badges
// ─────────────────────────────────────────────────────────────────────────────

export type TipSide3d = 'above' | 'below' | 'right' | 'left';
export const TIP_SIDES_3D: readonly TipSide3d[] = ['above', 'below', 'right', 'left'];

/** A box on the screen, in CSS pixels. */
export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The gap between the description and the point it opens from. */
export const TIP_GAP_3D = 10;

/** The description's box when it opens on `side` of its anchor point there (anchors differ per side: top, front, flanks). */
export function tipRect3d(side: TipSide3d, at: { x: number; y: number }, tip: { w: number; h: number }): ScreenRect {
  switch (side) {
    case 'above':
      return { x0: at.x - tip.w / 2, y0: at.y - TIP_GAP_3D - tip.h, x1: at.x + tip.w / 2, y1: at.y - TIP_GAP_3D };
    case 'below':
      return { x0: at.x - tip.w / 2, y0: at.y + TIP_GAP_3D, x1: at.x + tip.w / 2, y1: at.y + TIP_GAP_3D + tip.h };
    case 'right':
      return { x0: at.x + TIP_GAP_3D, y0: at.y - tip.h / 2, x1: at.x + TIP_GAP_3D + tip.w, y1: at.y + tip.h / 2 };
    case 'left':
      return { x0: at.x - TIP_GAP_3D - tip.w, y0: at.y - tip.h / 2, x1: at.x - TIP_GAP_3D, y1: at.y + tip.h / 2 };
  }
}

const overlaps = (a: ScreenRect, b: ScreenRect): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * The side a pointed-at desk's description opens on in 3D: the first of above, below, right and left that stays on the
 * screen and covers none of the desk's own condition badges (they light up yellow on hover, so the card must leave them
 * readable); failing that, the first that covers none of them; failing that, the first on the screen.
 */
export function tipSide3d(anchors: Readonly<Record<TipSide3d, { x: number; y: number }>>, tip: { w: number; h: number }, badges: readonly ScreenRect[], view: { w: number; h: number }): TipSide3d {
  const rect = (s: TipSide3d) => tipRect3d(s, anchors[s], tip);
  const onScreen = (s: TipSide3d) => {
    const r = rect(s);
    return r.x0 >= 0 && r.y0 >= 0 && r.x1 <= view.w && r.y1 <= view.h;
  };
  const clear = (s: TipSide3d) => !badges.some((b) => overlaps(rect(s), b));
  return TIP_SIDES_3D.find((s) => onScreen(s) && clear(s)) ?? TIP_SIDES_3D.find(clear) ?? TIP_SIDES_3D.find(onScreen) ?? 'above';
}

/** A badge's box on the screen: BADGE_H world units tall, as wide as its words, at `px` CSS pixels to a world unit. */
export const badgeRect = (at: { x: number; y: number }, chars: number, px: number, h = 0.34): ScreenRect => {
  const hh = h * px;
  const w = hh * (0.47 * chars + 1.15);
  return { x0: at.x - w / 2, y0: at.y - hh / 2, x1: at.x + w / 2, y1: at.y + hh / 2 };
};
