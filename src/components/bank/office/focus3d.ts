import { flowPlaces, flowScope } from '../../../sim/guidedFlows';
import type { PlaceId } from '../../../sim/topology';
import type { FlowId } from '../../../types/viewport';
import { COUNTER, LANES, STREET, type Pose, type V2 } from './layout3d';
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
// Staff going home
// ─────────────────────────────────────────────────────────────────────────────

/** The simulation's own words for a member of staff who has gone home (bankSimulation.ts workerView). */
export const isOffShift = (activity: string): boolean => /^(Off shift|Desk closed)/.test(activity);

/** How fast staff walk out, in world units a second. */
export const LEAVE_SPEED = 1.15;

/**
 * The way out for someone seated at `seat` (relative to the desk at `pose`): up from the chair, along the back of the counter
 * to its end, down the aisle beside the desk to the front of the branch, and out onto the pavement.
 */
export function leaveRoute(pose: Pose, seat: V2): V2[] {
  const sx = pose.x + seat[0];
  const sz = pose.z + seat[1];
  const aisle = pose.x + COUNTER.w / 2 + 0.55;
  return [
    [sx, sz],
    [aisle, sz],
    [aisle, STREET.z0 + 0.6],
    [aisle, STREET.z0 + 1.7],
  ];
}

/** Where someone on `route` is after walking for `t` seconds, which way they face, and whether they are out. */
export function leaveAt(route: readonly V2[], t: number): { at: V2; heading: number; done: boolean } {
  const len = pathLength(route);
  const d = Math.min(len, Math.max(0, t) * LEAVE_SPEED);
  const at = pointAlongPath(route, d);
  const ahead = pointAlongPath(route, Math.min(len, d + 0.05));
  const heading = ahead[0] === at[0] && ahead[1] === at[1] ? 0 : Math.atan2(ahead[0] - at[0], ahead[1] - at[1]);
  return { at, heading, done: d >= len };
}
