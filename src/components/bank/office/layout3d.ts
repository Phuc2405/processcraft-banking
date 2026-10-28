/**
 * Where everything stands in the 3D office. Pure numbers and no three.js, so the placement can be tested without a GPU.
 *
 * Desks, departments and wires come from officePlan.ts, a frozen copy of the original 2D stage geometry, so 2D layout
 * changes never move the 3D rooms.
 *
 *   world x  = (stage x - stage width / 2) / WORLD_SCALE      to the right on the 2D map
 *   world z  = (stage y - stage height / 2) / WORLD_SCALE     down the 2D map (towards the viewer)
 *   world y  = up
 *
 * A desk is a teller counter that faces +z: customers queue on that side, the staff sit behind it.
 */

import { DEPARTMENTS, STATION_IDS, STATIONS, type DepartmentId, type PlaceId, type StationId } from '../../../sim/topology';
import type { StationStatus } from '../../../sim/types';
import { BUILDING } from '../layout';
import { OFFICE_DEPT_BOX as DEPT_BOX, OFFICE_PLACE_BOX as PLACE_BOX, OFFICE_WIRES as BANK_WIRES, officeWireById as wireById } from './officePlan';

/** Stage units per world unit. A 160-wide desk card is four world units wide. */
export const WORLD_SCALE = 40;

/** A point on the floor: [x, z]. */
export type V2 = readonly [number, number];

/**
 * The origin is the middle of the BUILDING, not of the whole 2D stage: the stage also holds the pavement below the branch
 * (the sidewalk ATMs), which in 3D is a street outside the office and not part of its floor.
 */
export const toWorld = (sx: number, sy: number): V2 => [(sx - BUILDING.width / 2) / WORLD_SCALE, (sy - BUILDING.height / 2) / WORLD_SCALE];

/**
 * Phase 8 made the building 370 units deeper for the extended-flows wing, which moved the origin. Positions placed by hand in
 * world units before then (server room, plants, right-hand windows) are written in the old frame and shifted by this.
 */
export const LEGACY_Z = (BUILDING.height / 2 - 405) / WORLD_SCALE;
const legacyZ = (z: number): number => z - LEGACY_Z;

/** The floor of the office, a little larger than the stage so the walls have room. */
export const FLOOR = {
  /** Size of the building in world units. */
  w: BUILDING.width / WORLD_SCALE,
  d: BUILDING.height / WORLD_SCALE,
  /** Slab past the building's plan on every side. */
  margin: 1.4,
} as const;

export const FLOOR_SLAB = { w: FLOOR.w + FLOOR.margin * 2, d: FLOOR.d + FLOOR.margin * 2 } as const;

// ─────────────────────────────────────────────────────────────────────────────
// The street in front of the branch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Outside the front of the building: a pavement with the sidewalk ATMs on it, a kerb, and a strip of road. The pavement
 * starts where the office slab ends, so a customer at an ATM stands on the street, not in the lobby.
 */
export const STREET = {
  /** The front edge of the office slab, where the pavement begins. */
  z0: FLOOR_SLAB.d / 2,
  /** How deep the pavement is, from the building to the kerb. */
  walk: 3.2,
  /** The road beyond the kerb that is drawn: a two-lane avenue, one lane each way. */
  road: 5.2,
  kerbH: 0.14,
  kerbW: 0.22,
  /** Half the width of the street: past the slab on both sides, so it reads as a street that carries on. */
  halfWidth: FLOOR_SLAB.w / 2 + 2.6,
} as const;

/** Where the kerb is, on z. */
export const KERB_Z = STREET.z0 + STREET.walk;
/** The far edge of the road that is drawn. */
export const ROAD_END = KERB_Z + STREET.road;

/** The part of the world the home view fits: the whole office and the pavement out to the kerb. */
export const SCENE = (() => {
  const x1 = FLOOR_SLAB.w / 2;
  const z0 = -FLOOR_SLAB.d / 2;
  const z1 = KERB_Z + 0.9;
  return { x0: -x1, x1, z0, z1, w: 2 * x1, d: z1 - z0, cx: 0, cz: (z0 + z1) / 2 } as const;
})();

// ─────────────────────────────────────────────────────────────────────────────
// Desks and departments
// ─────────────────────────────────────────────────────────────────────────────

export interface Pose {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** The counter of a desk: the footprint (not the card on the 2D map, which also holds the name and the queue number). */
export const COUNTER = { w: 3.3, d: 0.95, h: 0.86 } as const;

export function deskPose(id: StationId): Pose {
  const b = PLACE_BOX[id];
  const [x, z] = toWorld(b.cx, b.cy);
  return { x, z, w: COUNTER.w, d: COUNTER.d };
}

/** The centre and size of a tally or the phone: a small kiosk on the floor. */
export function kioskPose(id: PlaceId): Pose {
  const b = PLACE_BOX[id];
  const [x, z] = toWorld(b.cx, b.cy);
  return { x, z, w: b.w / WORLD_SCALE - 0.3, d: b.h / WORLD_SCALE - 0.5 };
}

export function departmentFloor(id: DepartmentId): Pose & { accent: string } {
  const b = DEPT_BOX[id];
  const [x, z] = toWorld(b.x + b.w / 2, b.y + b.h / 2);
  const d = b.h / WORLD_SCALE;
  // The ATM department is on the pavement: its floor starts at the front of the building, not inside the lobby.
  if (id === 'ATM') {
    const z0 = Math.max(z - d / 2, STREET.z0 + 0.04);
    return { x, z: (z0 + z + d / 2) / 2, w: b.w / WORLD_SCALE, d: z + d / 2 - z0, accent: DEPARTMENTS[id].accent };
  }
  return { x, z, w: b.w / WORLD_SCALE, d, accent: DEPARTMENTS[id].accent };
}

export const STATION_POSES: Readonly<Record<StationId, Pose>> = Object.fromEntries(STATION_IDS.map((id) => [id, deskPose(id)])) as Record<StationId, Pose>;

/** The desk's department accent, the colour of its edge strip. */
export const accentOf = (id: StationId): string => DEPARTMENTS[STATIONS[id].department].accent;

// ─────────────────────────────────────────────────────────────────────────────
// People
// ─────────────────────────────────────────────────────────────────────────────

/** Staff sit behind the counter, four to a row. Offsets are from the counter's centre; z is negative (behind). */
export const SEAT_ROW = 4;
export const SEAT_GAP = 0.78;
export const SEAT_BACK = 0.86;
export const SEAT_ROW_GAP = 1.05;

export function seatOffsets(count: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / SEAT_ROW);
    const inRow = Math.min(SEAT_ROW, count - row * SEAT_ROW);
    const col = i % SEAT_ROW;
    out.push([(col - (inRow - 1) / 2) * SEAT_GAP, -(SEAT_BACK + row * SEAT_ROW_GAP)]);
  }
  return out;
}

/** The most customers drawn in a queue; the rest are a number on the sign. */
export const QUEUE_VISIBLE = 5;
export const QUEUE_GAP = 0.34;

/** Where the customers of a queue stand, head of the queue first: in front of the counter, in a slightly zig-zag line. */
export function queueSlots(id: StationId, count: number): V2[] {
  const pose = STATION_POSES[id];
  const n = Math.min(count, QUEUE_VISIBLE);
  const out: V2[] = [];
  for (let i = 0; i < n; i++) out.push([pose.x + (i % 2 === 0 ? -0.18 : 0.18) - 0.5, pose.z + pose.d / 2 + 0.42 + i * QUEUE_GAP]);
  return out;
}

/** A gate whose customers arrive as messages from a phone (A2A, VietQR, SWIFT, eKYC): no door, and a queue of phones. */
export const isDigital = (id: StationId): boolean => STATIONS[id].digital === true || STATIONS[id].capability === 'A2A_GATEWAY';

/**
 * The gates whose customers are people who walk in at a door in the left wall: the three shop checkouts. An instant transfer
 * arrives as a message on a phone, so its gate has no door and no walkers.
 */
export const WALK_IN_GATES: readonly StationId[] = STATION_IDS.filter((id) => STATIONS[id].kind === 'GATE' && !isDigital(id));

/** Every desk that customers walk up to: the shop gates, and the sidewalk ATM where a customer comes down the street. */
export const WALKER_STATIONS: readonly StationId[] = STATION_IDS.filter((id) => WALK_IN_GATES.includes(id) || STATIONS[id].kind === 'ATM');

/** A desk that no member of staff sits at: a machine on the pavement. */
export const isMachine = (id: StationId): boolean => STATIONS[id].automated === true;

/** Whether the queue at a desk is made of people or of phones (a transfer queues as a message). */
export const queueStyle = (id: StationId): 'people' | 'phones' => (isDigital(id) ? 'phones' : 'people');

/** Where a customer comes in from: a door in the left wall for a gate, or the far end of the pavement for an ATM. */
export function entrancePoint(id: StationId): V2 {
  const pose = STATION_POSES[id];
  if (STATIONS[id].kind === 'ATM') return [-STREET.halfWidth + 0.4, pose.z + pose.d / 2 + 1.0];
  return [-FLOOR.w / 2 - FLOOR.margin + 0.3, pose.z + pose.d / 2 + 0.9];
}

/** The way a customer walks from the door to the back of the queue: along the wall's side, then up to the tail. */
export function arrivalPath(id: StationId, queued: number): V2[] {
  const door = entrancePoint(id);
  const slots = queueSlots(id, Math.max(1, Math.min(QUEUE_VISIBLE, queued + 1)));
  const tail = slots[slots.length - 1] as V2;
  return [door, [tail[0], door[1]], tail];
}

/** The doors drawn on the wall: one per shop gate. */
export const ENTRANCES: ReadonlyArray<{ id: StationId; at: V2 }> = WALK_IN_GATES.map((id) => ({ id, at: entrancePoint(id) }));

// ─────────────────────────────────────────────────────────────────────────────
// Lanes and packets
// ─────────────────────────────────────────────────────────────────────────────

/** The floor lane of a wire, from the same routes the 2D map draws. */
export function wireLane(edge: string): V2[] | null {
  const wire = wireById(edge);
  if (!wire) return null;
  return wire.points.map(([x, y]) => toWorld(x, y));
}

export const LANES: ReadonlyArray<{ id: string; from: PlaceId; to: PlaceId; points: V2[] }> = BANK_WIRES.map((w) => ({ id: w.id, from: w.from, to: w.to, points: w.points.map(([x, y]) => toWorld(x, y)) }));

/** The lanes a pointed-at desk or kiosk lights up: its own, in and out (the 3D twin of the 2D map's hover focus). */
export const lanesOf = (place: string | null): ReadonlySet<string> => new Set(place ? LANES.filter((l) => l.from === place || l.to === place).map((l) => l.id) : []);

/**
 * Whether a lane's condition shows, by the 2D map's rules: a decline's condition only while its desk is pointed at; the others
 * with "Labels: Always Show", and always for the pointed-at desk.
 */
export const laneLabelShown = (l: { from: string; to: string }, hover: string | null, always: boolean): boolean => {
  const own = hover !== null && (l.from === hover || l.to === hover);
  return own || (always && l.to !== 'OUT_DECLINED');
};

/** Each lane's words, at the spot its route gives them on the plan: the same condition the 2D map writes on its wire. */
export const LANE_LABELS: ReadonlyArray<{ id: string; from: PlaceId; to: PlaceId; text: string; at: V2 }> = BANK_WIRES.filter((w) => w.label).map((w) => ({ id: w.id, from: w.from, to: w.to, text: w.label!, at: toWorld(w.labelAt[0], w.labelAt[1]) }));

export function laneLength(points: readonly V2[]): number {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += Math.hypot((points[i] as V2)[0] - (points[i - 1] as V2)[0], (points[i] as V2)[1] - (points[i - 1] as V2)[1]);
  return n;
}

/** The point `d` along a lane and the direction there (radians about the y axis, so a card can face the way it travels). */
export function laneAt(points: readonly V2[], d: number): { x: number; z: number; heading: number } {
  const first = points[0];
  if (!first) return { x: 0, z: 0, heading: 0 };
  let left = Math.max(0, d);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as V2;
    const b = points[i] as V2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= len || i === points.length - 1) {
      const t = len === 0 ? 0 : Math.min(1, left / len);
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, heading: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) || 0 };
    }
    left -= len;
  }
  const last = points[points.length - 1] as V2;
  return { x: last[0], z: last[1], heading: 0 };
}

/** When a move starts and how long its hop takes, in milliseconds. The same timing the 2D map gives its travellers. */
export function hopTiming(at: number, beatMs: number): { delayMs: number; durationMs: number } {
  return { delayMs: Math.round(at * beatMs * 0.55), durationMs: Math.round(Math.max(240, Math.min(720, beatMs * 0.5))) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True isometric: the camera sits on a diagonal and looks at the middle of the floor. It stands in front of the bank and to
 * the left, which is the 2D blueprint turned a quarter-turn-and-a-half: left to right on the map runs from the near corner
 * up to the far one, so the journey of a payment still reads from the gates to the Approved and Declined bins.
 */
export const CAMERA_DIRECTION: V2 = [-1, 1];
export const CAMERA_DISTANCE = 60;
export const ZOOM_LIMITS = { min: 12, max: 110 } as const;
/** Learner zoom range, as multiples of the fitted zoom (20%–500% on the toolbar). */
export const ZOOM_3D = { min: 0.2, max: 5.0, speed: 1.2 } as const;

/** Absolute OrbitControls bounds for a fitted zoom. */
export function zoomBounds3d(fit: number): { min: number; max: number } {
  const f = Number.isFinite(fit) && fit > 0 ? fit : 28;
  return { min: f * ZOOM_3D.min, max: f * ZOOM_3D.max };
}

export const clampZoom3d = (zoom: number, fit: number): number => {
  const { min, max } = zoomBounds3d(fit);
  return Math.min(max, Math.max(min, zoom));
};

/** True when a key event should reset the 3D camera (R or Esc, not while typing or with modifiers). */
export function isCameraResetKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'defaultPrevented' | 'repeat'>, target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key !== 'r' && e.key !== 'R' && e.key !== 'Escape') return false;
  const tag = target?.tagName?.toUpperCase();
  return !(target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');
}

/** How many pixels per world unit shows the whole office and its pavement in a container of this size. */
export function fitZoom(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 28;
  // On screen a w-by-d floor is (w + d) / sqrt(2) wide and (w + d) / sqrt(6) tall, plus the height of a person.
  const span = SCENE.w + SCENE.d;
  const screenW = span / Math.SQRT2;
  const screenH = span / Math.sqrt(6) + 3.7;
  const zoom = Math.min(width / (screenW * 1.04), height / (screenH * 1.04));
  return Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, zoom));
}

/** Keeps the point the camera looks at over the scene (the office and the pavement), so a drag cannot lose it. */
export function clampTarget(x: number, z: number): V2 {
  return [Math.max(SCENE.x0, Math.min(SCENE.x1, x)), Math.max(SCENE.z0, Math.min(SCENE.z1, z))];
}

/** The point the home view looks at: the middle of the office and its pavement. */
export const HOME_TARGET: V2 = [SCENE.cx, SCENE.cz];

/** A stable colour for a customer, from the packet's id or the queue slot. */
const CUSTOMER_SHIRTS = ['#38bdf8', '#f472b6', '#facc15', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf', '#f87171'] as const;
export const customerShirt = (n: number): string => CUSTOMER_SHIRTS[Math.abs(Math.trunc(n)) % CUSTOMER_SHIRTS.length] as string;

// ─────────────────────────────────────────────────────────────────────────────
// Grid
// ─────────────────────────────────────────────────────────────────────────────

/** The line segments of the floor grid, as x/z pairs ready for a line-segments geometry (y is added by the scene). */
export function gridSegments(width: number, depth: number, step = 1): Float32Array {
  const xs: number[] = [];
  const zs: number[] = [];
  for (let x = -Math.floor(width / 2 / step) * step; x <= width / 2 + 1e-9; x += step) xs.push(Math.round(x * 1000) / 1000);
  for (let z = -Math.floor(depth / 2 / step) * step; z <= depth / 2 + 1e-9; z += step) zs.push(Math.round(z * 1000) / 1000);
  const out: number[] = [];
  for (const x of xs) out.push(x, -depth / 2, x, depth / 2);
  for (const z of zs) out.push(-width / 2, z, width / 2, z);
  return new Float32Array(out);
}


// ─────────────────────────────────────────────────────────────────────────────
// Furniture shared by the scene and the tests
// ─────────────────────────────────────────────────────────────────────────────

/** An L-shaped desk: the counter plus a return that runs back from its right-hand end. Two staff or fewer fit beside it. */
export const WING = { w: 0.72, len: 1.25 } as const;
export const hasWing = (staff: number): boolean => staff <= 2;

/** The return of an L-desk, relative to the counter's centre. */
export function wingPose(): Pose {
  return { x: COUNTER.w / 2 - WING.w / 2, z: -COUNTER.d / 2 - WING.len / 2, w: WING.w, d: WING.len };
}

/** The walls are this tall; the far two (back and right) frame the office, the near two stay low so the room can be seen into. */
export const WALL_H = 2.9;
export const WALL_T = 0.2;
export const KERB_H = 0.34;

// ─────────────────────────────────────────────────────────────────────────────
// People at work
// ─────────────────────────────────────────────────────────────────────────────

/** Past this much fatigue (out of 100) a member of staff slumps over the keyboard. */
export const SLUMP_FATIGUE = 80;
export const isSlumped = (fatigue: number): boolean => fatigue > SLUMP_FATIGUE;

/** 0-1: how hard a desk is being pushed. A long queue or a warning light means a surge. */
export function surgeLevel(queue: number, status: StationStatus): number {
  const q = Math.max(0, Math.min(1, queue / 12));
  const floor = status === 'ALERT' ? 0.85 : status === 'CONGESTED' ? 0.65 : 0;
  return Math.max(q, floor);
}

/** How fast the hands move, in radians per second of the typing wave: lazy when idle, quick when busy, quickest in a surge, crawling when spent. */
export function typingRate(o: { working: boolean; productivity: number; surge: number; fatigue: number }): number {
  if (isSlumped(o.fatigue)) return 0.8;
  if (!o.working) return 2;
  const clamp = (n: number): number => Math.max(0, Math.min(1, n));
  return 7 + 5 * clamp(o.productivity) + 8 * clamp(o.surge);
}

// ─────────────────────────────────────────────────────────────────────────────
// Curved paths for the packets
// ─────────────────────────────────────────────────────────────────────────────

const dist = (a: V2, b: V2): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * A lane with its corners rounded by quadratic Bezier curves. The painted wires turn at right angles; a packet that
 * followed them exactly would jerk round every corner, so it flies the rounded version. Straight runs are kept as they are.
 */
export function smoothLane(points: readonly V2[], radius = 0.9, steps = 6): V2[] {
  if (points.length < 3) return points.slice();
  const out: V2[] = [points[0] as V2];
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1] as V2;
    const p1 = points[i] as V2;
    const p2 = points[i + 1] as V2;
    const l0 = dist(p0, p1);
    const l1 = dist(p1, p2);
    const cross = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
    const r = Math.min(radius, l0 / 2, l1 / 2);
    if (l0 < 1e-6 || l1 < 1e-6 || Math.abs(cross) < 1e-9 || r < 1e-6) {
      out.push(p1);
      continue;
    }
    const a: V2 = [p1[0] + ((p0[0] - p1[0]) * r) / l0, p1[1] + ((p0[1] - p1[1]) * r) / l0];
    const b: V2 = [p1[0] + ((p2[0] - p1[0]) * r) / l1, p1[1] + ((p2[1] - p1[1]) * r) / l1];
    out.push(a);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * p1[0] + t * t * b[0], u * u * a[1] + 2 * u * t * p1[1] + t * t * b[1]]);
    }
    out.push(b);
  }
  out.push(points[points.length - 1] as V2);
  return out;
}

const flown = new Map<string, V2[] | null>();

/** The rounded path a packet flies along a wire. Worked out once per wire. */
export function packetLane(edge: string): V2[] | null {
  const cached = flown.get(edge);
  if (cached !== undefined) return cached;
  const lane = wireLane(edge);
  const smooth = lane ? smoothLane(lane) : null;
  flown.set(edge, smooth);
  return smooth;
}

/** How high a packet is above the floor `u` (0 to 1) of the way through a hop: a gentle hop, low at both ends. */
export const hopHeight = (u: number, peak = 0.34): number => Math.sin(Math.max(0, Math.min(1, u)) * Math.PI) * peak;

// ─────────────────────────────────────────────────────────────────────────────
// Glass partitions
// ─────────────────────────────────────────────────────────────────────────────

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
export type WallSide = 'front' | 'back' | 'left' | 'right';

/** A straight run of wall: along z at x = `at` (axis 'z'), or along x at z = `at` (axis 'x'). */
export interface WallRun {
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
}
export interface WallDoor {
  axis: 'x' | 'z';
  at: number;
  centre: number;
  width: number;
}

/** Where the lanes cross one side of a rectangle, along that side. */
export function crossings(rect: Rect, side: WallSide, lanes: ReadonlyArray<readonly V2[]>): number[] {
  const vertical = side === 'left' || side === 'right';
  const line = side === 'left' ? rect.x0 : side === 'right' ? rect.x1 : side === 'front' ? rect.z1 : rect.z0;
  const [lo, hi] = vertical ? [rect.z0, rect.z1] : [rect.x0, rect.x1];
  const out: number[] = [];
  for (const lane of lanes) {
    for (let i = 1; i < lane.length; i++) {
      const a = lane[i - 1] as V2;
      const b = lane[i] as V2;
      const [ac, bc] = vertical ? [a[0], b[0]] : [a[1], b[1]];
      const [ao, bo] = vertical ? [a[1], b[1]] : [a[0], b[0]];
      if (ac === bc || (ac - line) * (bc - line) > 0) continue;
      const t = (line - ac) / (bc - ac);
      const along = ao + (bo - ao) * t;
      if (along > lo && along < hi) out.push(along);
    }
  }
  return out.sort((x, y) => x - y);
}

/**
 * The walls of a glass room: each chosen side is cut open wherever a lane crosses it, so the payments can pass through
 * a doorway instead of the glass. Doorways close together are merged into one.
 */
export function partition(rect: Rect, sides: readonly WallSide[], lanes: ReadonlyArray<readonly V2[]>, gap = 1.1): { runs: WallRun[]; doors: WallDoor[] } {
  const runs: WallRun[] = [];
  const doors: WallDoor[] = [];
  for (const side of sides) {
    const vertical = side === 'left' || side === 'right';
    const at = side === 'left' ? rect.x0 : side === 'right' ? rect.x1 : side === 'front' ? rect.z1 : rect.z0;
    const [lo, hi] = vertical ? [rect.z0, rect.z1] : [rect.x0, rect.x1];
    const axis = vertical ? 'z' : 'x';
    // Merge the openings.
    const opens: Array<[number, number]> = [];
    for (const c of crossings(rect, side, lanes)) {
      const from = Math.max(lo, c - gap / 2);
      const to = Math.min(hi, c + gap / 2);
      const last = opens[opens.length - 1];
      if (last && from <= last[1] + 0.05) last[1] = Math.max(last[1], to);
      else opens.push([from, to]);
    }
    let cursor = lo;
    for (const [from, to] of opens) {
      if (from - cursor > 0.25) runs.push({ axis, at, from: cursor, to: from });
      doors.push({ axis, at, centre: (from + to) / 2, width: to - from });
      cursor = to;
    }
    if (hi - cursor > 0.25) runs.push({ axis, at, from: cursor, to: hi });
  }
  return { runs, doors };
}

/**
 * The Security & 3DS Risk Vault, in glass. The room runs from the front of the department right back to the wall, so the
 * vault door can hang on the wall behind its desk. The back side is the wall itself.
 */
export function vaultRoom(): Rect {
  const f = departmentFloor('SECURITY');
  return { x0: f.x - f.w / 2, x1: f.x + f.w / 2, z0: -FLOOR_SLAB.d / 2 + WALL_T + 0.02, z1: f.z + f.d / 2 };
}

/** The core server racks, in a glass room against the right-hand wall, behind the Core Ledger. */
export const SERVER_ROOM: Rect & { racks: V2[] } = (() => {
  const hx = FLOOR_SLAB.w / 2;
  const z0 = legacyZ(-5.95);
  const racks: V2[] = [0, 1, 2, 3].map((i) => [hx - WALL_T - 0.55, z0 + 0.55 + i * 1.0] as V2);
  return { x0: hx - WALL_T - 1.45, x1: hx - WALL_T - 0.02, z0, z1: z0 + 4.5, racks };
})();

// ─────────────────────────────────────────────────────────────────────────────
// Gates: stanchion ropes, and the ATM nook
// ─────────────────────────────────────────────────────────────────────────────

/** Half the width of a rope-lined queue lane. */
export const QUEUE_HALF = 0.58;

/**
 * The posts and ropes that guide a gate's queue. The line of customers stands half a unit left of the counter's middle
 * (see queueSlots), so the posts straddle that line. Two posts a side keep the ropes clear of the next gate's staff.
 */
export function stanchionLine(id: StationId): { posts: V2[]; ropes: Array<[V2, V2]> } {
  const pose = STATION_POSES[id];
  const cx = pose.x - 0.5;
  const front = pose.z + pose.d / 2;
  const zs = [front + 0.45, front + 1.25];
  const posts: V2[] = [];
  const ropes: Array<[V2, V2]> = [];
  for (const side of [-1, 1]) {
    const a: V2 = [cx + side * QUEUE_HALF, zs[0] as number];
    const b: V2 = [cx + side * QUEUE_HALF, zs[1] as number];
    posts.push(a, b);
    ropes.push([a, b]);
  }
  return { posts, ropes };
}

/** The gates and ATMs that have a rope line to guide their queue: the shop gates and the two ATM bays. */
export const ROPED_QUEUES: readonly StationId[] = STATION_IDS.filter((id) => WALK_IN_GATES.includes(id) || STATIONS[id].kind === 'ATM');

// ─────────────────────────────────────────────────────────────────────────────
// The sidewalk ATMs
// ─────────────────────────────────────────────────────────────────────────────

/** An ATM kiosk: a blue machine on the pavement, its screen and card slot facing the street. */
export const ATM_KIOSK = { w: 0.96, d: 0.8, h: 1.72 } as const;

/** The kiosk stands half a unit left of its desk's middle, the same as the line of customers (see queueSlots), so the line points straight at it. */
export const kioskCentre = (id: StationId): V2 => [STATION_POSES[id].x - 0.5, STATION_POSES[id].z];

/** The paved pad a kiosk stands on: from just in front of the building to the end of the longest queue. */
export function bayRect(id: StationId): Rect {
  const [x] = kioskCentre(id);
  const tail = STATION_POSES[id].z + STATION_POSES[id].d / 2 + 0.42 + (QUEUE_VISIBLE - 1) * QUEUE_GAP;
  return { x0: x - 1.15, x1: x + 1.15, z0: STREET.z0 + 0.05, z1: Math.min(KERB_Z - 0.05, tail + 0.35) };
}

/** The desks that are machines on the pavement. */
export const ATM_STATIONS: readonly StationId[] = STATION_IDS.filter((id) => STATIONS[id].kind === 'ATM');

/** The back wall of the ATM alcove: a low panel along the front of the building behind both kiosks, with a wing at each end. */
export const ATM_ALCOVE = (() => {
  const xs = ATM_STATIONS.map((id) => kioskCentre(id)[0]);
  const x0 = Math.min(...xs) - 1.3;
  const x1 = Math.max(...xs) + 1.3;
  return { x0, x1, z: STREET.z0 + 0.14, h: 1.25, wing: 0.9 };
})();

/** Street lamps along the kerb: where they stand, as x. They clear the ATM queues, which come out at the kiosks. */
export const STREET_LAMPS: readonly V2[] = [-11.2, -3.8, 9.8, 14.0].map((x) => [x, KERB_Z - 0.3] as V2);

/** How far a lamp's arm reaches back over the pavement, and how high its head hangs. */
export const LAMP = { height: 3.3, reach: 0.95, pool: 2.3 } as const;

/** The front of the building is a low plinth, cut open wherever a lane leaves the office to the pavement. */
export function frontPlinth(): { runs: WallRun[]; doors: WallDoor[] } {
  const hx = FLOOR_SLAB.w / 2;
  const hz = FLOOR_SLAB.d / 2;
  return partition({ x0: -hx, x1: hx, z0: -hz, z1: hz }, ['front'], LANES.map((l) => l.points), 1.0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Plants and windows
// ─────────────────────────────────────────────────────────────────────────────

export type PlantKind = 'ficus' | 'monstera' | 'palm';
export interface PlantSpot {
  x: number;
  z: number;
  kind: PlantKind;
  scale: number;
}

const wallZ = -FLOOR_SLAB.d / 2 + WALL_T + 0.4;
const wallX = FLOOR_SLAB.w / 2 - WALL_T - 0.4;

export const PLANTS: readonly PlantSpot[] = [
  { x: -wallX, z: wallZ, kind: 'ficus', scale: 1.25 },
  { x: -9.2, z: wallZ, kind: 'monstera', scale: 1 },
  { x: -7.5, z: wallZ, kind: 'palm', scale: 1.05 },
  { x: 0.7, z: wallZ, kind: 'monstera', scale: 0.95 },
  { x: 11.2, z: wallZ, kind: 'monstera', scale: 1 },
  { x: wallX, z: wallZ, kind: 'ficus', scale: 1.3 },
  { x: wallX, z: legacyZ(0.6), kind: 'palm', scale: 1.1 },
  { x: wallX, z: legacyZ(4.7), kind: 'ficus', scale: 1.15 },
  { x: wallX, z: legacyZ(10.0), kind: 'monstera', scale: 1.05 },
  { x: -13.9, z: legacyZ(5.0), kind: 'ficus', scale: 1.1 },
  { x: -13.9, z: legacyZ(10.2), kind: 'palm', scale: 1.0 },
  { x: -9.6, z: legacyZ(5.5), kind: 'monstera', scale: 0.9 },
  { x: -1.6, z: legacyZ(2.15), kind: 'ficus', scale: 0.95 },
  { x: 9.3, z: legacyZ(2.0), kind: 'monstera', scale: 0.95 },
  { x: 2.6, z: legacyZ(5.5), kind: 'palm', scale: 0.9 },
];

export interface WallWindow {
  wall: 'back' | 'right';
  at: number;
}

export const WALL_WINDOWS: readonly WallWindow[] = [
  { wall: 'back', at: -3.6 },
  { wall: 'back', at: 2.6 },
  { wall: 'back', at: 6.4 },
  { wall: 'back', at: 10.2 },
  { wall: 'right', at: legacyZ(-9.4) },
  { wall: 'right', at: legacyZ(2.0) },
  { wall: 'right', at: legacyZ(5.8) },
  { wall: 'right', at: legacyZ(9.0) },
];

// ─────────────────────────────────────────────────────────────────────────────
// Camera, continued
// ─────────────────────────────────────────────────────────────────────────────

/** The polar angle of a true isometric view, measured from straight up (54.74 degrees): the camera looks down at 35.26 degrees. */
export const ISO_POLAR = Math.acos(1 / Math.sqrt(3));
/** The home azimuth of the camera, from the +z axis: front-left, 45 degrees. */
export const ISO_AZIMUTH = Math.atan2(CAMERA_DIRECTION[0], CAMERA_DIRECTION[1]);
/** How far (radians) the learner may swing the view either side of home. The back walls stay behind the office. */
export const ORBIT_RANGE = 0.62;

/** Where the line of sight through the camera's middle meets the floor. Panning moves this point, so this is what we keep over the office. */
export function viewGround(camera: readonly [number, number, number], target: readonly [number, number, number]): V2 {
  const dx = target[0] - camera[0];
  const dy = target[1] - camera[1];
  const dz = target[2] - camera[2];
  if (Math.abs(dy) < 1e-9) return [target[0], target[2]];
  const t = -target[1] / dy;
  return [target[0] + dx * t, target[2] + dz * t];
}
