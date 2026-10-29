import { flowPlaces, flowScope } from '../../../sim/guidedFlows';
import type { PlaceId } from '../../../sim/topology';
import type { FlowId } from '../../../types/viewport';
import { DAY_START, EOD_START } from '../../../sim/clock';
import { COUNTER, FRONT_AISLE_Z, KERB_Z, LANES, MAIN_GATE, STREET, type Pose, type V2 } from './layout3d';
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

/** How fast staff walk out, in world units a second; and how briskly they come in before a shift, to be at their desks
 * well before it starts. */
export const LEAVE_SPEED = 1.4;
export const ARRIVE_SPEED = 3.5;

/** The pavement's inner walking lane (clear of the ATM booths and the guard's cabin), where staff come and go. */
const STAFF_LANE_Z = KERB_Z - 0.85;

/**
 * The way out for someone seated at `seat` (relative to the desk at `pose`): up from the chair, along the back of the counter
 * to its end, down the aisle beside the desk to the clear aisle along the front of the hall, along it to the main entrance,
 * out onto the pavement and off down the street (`k` odd to the left, even to the right). Every leg runs straight along x
 * or z: never through a desk, the front wall or an ATM booth.
 */
export function leaveRoute(pose: Pose, seat: V2, k = 0): V2[] {
  const sx = pose.x + seat[0];
  const sz = pose.z + seat[1];
  const aisle = pose.x + COUNTER.w / 2 + 0.55;
  const end = (k % 2 ? -1 : 1) * (STREET.halfWidth + 1.5);
  return [
    [sx, sz],
    [aisle, sz],
    [aisle, FRONT_AISLE_Z],
    [MAIN_GATE.x, FRONT_AISLE_Z],
    [MAIN_GATE.x, STAFF_LANE_Z],
    [end, STAFF_LANE_Z],
  ];
}

/**
 * Staff coming in before their shift: the day's staff set off between 07:00 and 07:20 for their 08:00 shift, the night's
 * between 22:00 and 22:20 for the night's work at 23:00. The hour before each shift ticks in short beats (sim/clock.ts
 * PRE_SHIFT) and they walk in briskly (ARRIVE_SPEED), so everyone is seated well before it starts.
 */
export const STAFF_ARRIVAL = { day: [DAY_START, DAY_START + 20], night: [EOD_START - 60, EOD_START - 40] } as const;

/** The minute the `k`th member of staff at a desk sets off for work: spread through their shift's arrival window, steady per person. */
export function arrivalMinute(night: boolean, seed: string, k: number): number {
  const [from, by] = night ? STAFF_ARRIVAL.night : STAFF_ARRIVAL.day;
  let h = k * 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 9973;
  return from + ((h % 97) / 97) * (by - from - 4);
}

/**
 * At `minute`, who of a desk's staff (`ids`, in seat order) is not in yet (`away`: their shift's arrival window has begun
 * and their time to set off has not come), and, at a night desk, who has come in and sits ready before the night's work
 * starts (`early`: the simulation still has them off shift until 23:00).
 */
export function arrivalState(night: boolean, ids: readonly string[], minute: number): { away: string[]; early: string[] } {
  const [from] = night ? STAFF_ARRIVAL.night : STAFF_ARRIVAL.day;
  const away: string[] = [];
  const early: string[] = [];
  ids.forEach((id, k) => {
    const due = arrivalMinute(night, id, k);
    if (minute >= from && minute < due) away.push(id);
    else if (night && minute >= due && minute < EOD_START) early.push(id);
  });
  return { away, early };
}

/** The way in to `seat`: the way out walked backwards, from down the street, in at the main entrance, to the chair. */
export const arriveRoute = (pose: Pose, seat: V2, k = 0): V2[] => leaveRoute(pose, seat, k).reverse();

/** Where someone on `route` is after walking for `t` seconds at `speed`, which way they face, and whether they are there. */
export function leaveAt(route: readonly V2[], t: number, speed: number = LEAVE_SPEED): { at: V2; heading: number; done: boolean } {
  const len = pathLength(route);
  const d = Math.min(len, Math.max(0, t) * speed);
  const at = pointAlongPath(route, d);
  const ahead = pointAlongPath(route, Math.min(len, d + 0.05));
  const heading = ahead[0] === at[0] && ahead[1] === at[1] ? 0 : Math.atan2(ahead[0] - at[0], ahead[1] - at[1]);
  return { at, heading, done: d >= len };
}

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
