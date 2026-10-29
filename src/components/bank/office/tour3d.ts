/**
 * The guided tour in the 3D office, as plain numbers: where the camera goes for each step, which desks get a pool of light,
 * and the floor path the tour token follows. Nothing here touches three.js or React, so it can be tested without a browser.
 *
 * The camera stays orthographic and keeps its isometric tilt. For each step it slides (dolly) over the desks in play and
 * swings a little round the vertical axis (orbit) towards the side of the office the desk is on, so the view visibly turns
 * as the story crosses the floor. It never leaves the range the learner could reach by hand.
 */

import { edgeId, isStation, type PlaceId } from '../../../sim/topology';
import { pathLength } from '../../../engine/plan/path';
export { pathLength, pointAlongPath } from '../../../engine/plan/path';
import { COUNTER, clampTarget, fitZoom, HOME_TARGET, ISO_AZIMUTH, kioskPose, deskPose, ORBIT_RANGE, packetLane, SCENE, ZOOM_LIMITS, type V2 } from '../../../engine/plan/layout3d';

/** The most the camera turns away from the home azimuth for a tour step. Well inside the learner's own ORBIT_RANGE. */
export const TOUR_SWING = 0.3;
/** How close the tour camera comes, as a multiple of the zoom that fits the whole office, and as an absolute ceiling. */
export const TOUR_CLOSE = { factor: 2.3, ceiling: 54 } as const;
/** How long the camera takes to move to the next step, in milliseconds. */
export const TOUR_GLIDE_MS = 900;
/** Two places further apart than this (world units) are not framed together. */
export const TOGETHER = 10;

export interface Footprint {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** The centre of a place on the floor: the desk, or the tally or phone kiosk. */
export function placeXZ(place: PlaceId): V2 {
  const p = isStation(place) ? deskPose(place) : kioskPose(place);
  return [p.x, p.z];
}

/** The area a place takes on the floor including the people at it, which is what the camera frames and the light ring surrounds. */
export function placeFootprint(place: PlaceId): Footprint {
  if (isStation(place)) {
    const p = deskPose(place);
    return { x: p.x, z: p.z, w: COUNTER.w + 1, d: 3 };
  }
  const p = kioskPose(place);
  return { x: p.x, z: p.z, w: p.w + 0.9, d: p.d + 1.1 };
}

/** Where a point of the floor lands on the screen, in world units (x to the right, y up), for a camera at azimuth `az`. */
export function groundToScreen(az: number, x: number, z: number): V2 {
  // The camera sits at (sin az, ., cos az) looking at the middle; its right-hand direction on the floor is (cos az, -sin az).
  // The camera looks down at the isometric angle, so a step away from it moves a point up the screen by sin(35.26 deg) = 1/sqrt(3).
  return [x * Math.cos(az) - z * Math.sin(az), (-x * Math.sin(az) - z * Math.cos(az)) / Math.sqrt(3)];
}

export interface CamFocus {
  /** The point of the floor the camera looks at. */
  x: number;
  z: number;
  /** Pixels per world unit. */
  zoom: number;
  /** Azimuth of the camera round the vertical axis (radians, as OrbitControls measures it). */
  az: number;
}

const corners = (f: Footprint): V2[] => [
  [f.x - f.w / 2, f.z - f.d / 2],
  [f.x + f.w / 2, f.z - f.d / 2],
  [f.x + f.w / 2, f.z + f.d / 2],
  [f.x - f.w / 2, f.z + f.d / 2],
];

/**
 * Where to put the camera to show these places filling the screen: swung towards the side of the office they are on, centred
 * on them, and close enough that they fill the frame but never closer than the tour allows. `viewport` is the size of the
 * canvas in pixels.
 */
export function frameFocus(places: readonly PlaceId[], viewport: { w: number; h: number }): CamFocus {
  const feet = places.map(placeFootprint);
  if (feet.length === 0) return { x: HOME_TARGET[0], z: HOME_TARGET[1], zoom: fitZoom(viewport.w, viewport.h), az: ISO_AZIMUTH };
  const pts = feet.flatMap(corners);
  const gx = pts.map((p) => p[0]);
  const gz = pts.map((p) => p[1]);
  const cx = (Math.min(...gx) + Math.max(...gx)) / 2;
  const cz = (Math.min(...gz) + Math.max(...gz)) / 2;
  // Swing towards the side of the office the desks are on, up to TOUR_SWING either way.
  const side = Math.max(-1, Math.min(1, (cx - SCENE.cx) / (SCENE.w / 2)));
  const az = ISO_AZIMUTH + side * TOUR_SWING;

  const screen = pts.map((p) => groundToScreen(az, p[0], p[1]));
  const sx = screen.map((p) => p[0]);
  const sy = screen.map((p) => p[1]);
  // A person standing at a desk is 1.7 units tall and a name badge floats above that: add that on top of the floor shape.
  const spanX = Math.max(...sx) - Math.min(...sx) + 2.4;
  const spanY = Math.max(...sy) - Math.min(...sy) + 3.2;
  const home = fitZoom(viewport.w, viewport.h);
  const ceiling = Math.min(ZOOM_LIMITS.max, TOUR_CLOSE.ceiling, home * TOUR_CLOSE.factor);
  const fit = Math.min(viewport.w / spanX, viewport.h / spanY);
  const zoom = Math.max(home, Math.min(ceiling, fit));
  const [x, z] = clampTarget(cx, cz);
  return { x, z, zoom, az };
}

/** The places the camera frames for a step: the desk the token is at, and the one it goes to next if that is close by. */
export function framedPlaces(here: PlaceId, upNext: PlaceId | undefined): PlaceId[] {
  if (!upNext || upNext === here) return [here];
  const a = placeXZ(here);
  const b = placeXZ(upNext);
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= TOGETHER ? [here, upNext] : [here];
}

/** True when an azimuth is one the learner could also reach by dragging (so the camera controls will not clamp it). */
export const azimuthReachable = (az: number): boolean => Math.abs(az - ISO_AZIMUTH) <= ORBIT_RANGE + 1e-9;

// ─────────────────────────────────────────────────────────────────────────────
// The light
// ─────────────────────────────────────────────────────────────────────────────

/** How much of the daylight is left while a tour is running: the rest of the office falls back and the lit desks stand out. */
export const TOUR_DAYLIGHT = { sky: 0.3, ambient: 0.35, sun: 0.26, fill: 0.2 } as const;

/** The most pools of light at once. Fixed, so the shaders are built once when a tour starts. */
export const MAX_POOLS = 8;

/**
 * Which of the chapter's places get a real light on them (the rest still get a painted ring): the desk the token is at, the one
 * it goes to next, then the others nearest to the token. At most MAX_POOLS.
 */
export function poolPlaces(scope: ReadonlySet<PlaceId>, here: PlaceId, upNext: PlaceId | undefined): PlaceId[] {
  const at = placeXZ(here);
  const rest = [...scope]
    .filter((p) => p !== here && p !== upNext)
    .sort((a, b) => {
      const da = Math.hypot(placeXZ(a)[0] - at[0], placeXZ(a)[1] - at[1]);
      const db = Math.hypot(placeXZ(b)[0] - at[0], placeXZ(b)[1] - at[1]);
      return da - db || (a < b ? -1 : 1);
    });
  return [here, ...(upNext && upNext !== here ? [upNext] : []), ...rest].slice(0, MAX_POOLS);
}

// ─────────────────────────────────────────────────────────────────────────────
// The token
// ─────────────────────────────────────────────────────────────────────────────

/** How high the tour token hovers over the floor. */
export const TOKEN_HEIGHT = 1.9;

const same = (a: V2, b: V2): boolean => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

/**
 * The path on the floor from one place to the end of a route: along the lane painted for each wire (the same rounded path the
 * packets fly) and straight across where no wire is drawn. It starts at the first place's centre and ends at the last's.
 */
export function tourPath(route: readonly PlaceId[]): V2[] {
  const first = route[0];
  if (!first) return [];
  const out: V2[] = [placeXZ(first)];
  const push = (p: V2): void => {
    const last = out[out.length - 1];
    if (!last || !same(last, p)) out.push(p);
  };
  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1] as PlaceId;
    const to = route[i] as PlaceId;
    const lane = packetLane(edgeId(from, to));
    if (lane) for (const p of lane) push(p);
    push(placeXZ(to));
  }
  return out;
}

/** How long the token takes to travel a path, in milliseconds: never less than the camera needs, never longer than a few seconds. */
export function tourTravelMs(path: readonly V2[]): number {
  const length = pathLength(path);
  if (length < 0.01) return 0;
  return Math.round(Math.min(3200, Math.max(TOUR_GLIDE_MS, length * 150)));
}
