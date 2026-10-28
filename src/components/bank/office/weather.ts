import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { KERB_Z, STREET } from './layout3d';

/**
 * The weather over the 3D office, and how the people on the pavement behave in it. The rain is a learner's toggle: the bank
 * simulation does not depend on it. Everything below the store is pure, so the tests can walk a pedestrian through a shower.
 */

interface WeatherState {
  rain: boolean;
  setRain(on: boolean): void;
}

export const weatherStore = createStore<WeatherState>()((set) => ({
  rain: false,
  setRain: (rain) => set({ rain }),
}));
export const useWeather = <T>(pick: (s: WeatherState) => T): T => useStore(weatherStore, pick);

// ─────────────────────────────────────────────────────────────────────────────
// Pedestrians
// ─────────────────────────────────────────────────────────────────────────────

/** Where people walk: two lanes along the pavement, clear of the ATMs against the building. */
export const PAVEMENT = {
  /** The x range they walk, past the ends of the drawn street so they come and go out of the haze. */
  x0: -STREET.halfWidth - 6,
  x1: STREET.halfWidth + 6,
  /** Walking lanes: nearer the kerb (to the right) and nearer the building (to the left). */
  lanes: [KERB_Z - 0.55, KERB_Z - 1.25] as const,
  /** Under the canopy along the facade: where people shelter from the rain. */
  shelterZ: STREET.z0 + 0.45,
  shelterX0: -STREET.halfWidth + 3.4,
  shelterX1: STREET.halfWidth - 1.2,
} as const;

export const WALK = { relaxed: [0.45, 0.75] as const, umbrella: 0.95, sprint: 2.6 } as const;

export type PedestrianPose = 'walk' | 'chat' | 'umbrella' | 'run' | 'shelter';

export interface Pedestrian {
  /** Stable per person: shirt colour, lane, pace and whether they carry an umbrella. */
  index: number;
  lane: 0 | 1;
  /** +1 walks towards +x, -1 towards -x. */
  dir: 1 | -1;
  pace: number;
  /** Carries an umbrella and keeps walking in the rain (otherwise runs for the canopy). */
  umbrella: boolean;
  /** A pair who stop to talk in dry weather, at this x. */
  chatX: number | null;
}

/** A deterministic 0-1 value for person `i` and a key, so the crowd is the same on every load. */
const unit = (i: number, k: number): number => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export const PEDESTRIAN_COUNT = 12;

export const PEDESTRIANS: readonly Pedestrian[] = Array.from({ length: PEDESTRIAN_COUNT }, (_, i) => ({
  index: i,
  lane: (i % 2) as 0 | 1,
  dir: i % 2 === 0 ? 1 : -1,
  pace: WALK.relaxed[0] + unit(i, 1) * (WALK.relaxed[1] - WALK.relaxed[0]),
  umbrella: unit(i, 2) < 0.5,
  // Two pairs stop to talk: persons 0/1 and 4/5, a little apart on the pavement.
  chatX: i < 2 ? -4 + i * 0.7 : i === 4 || i === 5 ? 6 + (i - 4) * 0.7 : null,
}));

export interface PedestrianState {
  x: number;
  z: number;
  /** Heading round the vertical axis, radians (0 faces +z, towards the camera side of the street). */
  heading: number;
  pose: PedestrianPose;
  /** Walking speed now, for the leg swing. */
  speed: number;
}

const span = PAVEMENT.x1 - PAVEMENT.x0;
const wrap = (x: number): number => PAVEMENT.x0 + ((((x - PAVEMENT.x0) % span) + span) % span);

/** Where a person walking at `pace` since time 0 is at `t` seconds, wrapping round the street's ends. */
const strollX = (p: Pedestrian, t: number, pace: number): number => wrap(PAVEMENT.x0 + unit(p.index, 3) * span + p.dir * pace * t);

/** A person's own spot under the canopy, spread along the facade. */
export const shelterSpot = (p: Pedestrian): [number, number] => [PAVEMENT.shelterX0 + ((p.index * 0.618) % 1) * (PAVEMENT.shelterX1 - PAVEMENT.shelterX0), PAVEMENT.shelterZ];

/**
 * Where person `p` is at `t` seconds, and what they are doing.
 *
 *   Dry      a relaxed stroll along their lane; the two pairs stand and talk at their spot (facing each other).
 *   Rain     umbrella carriers keep walking, a little faster, under their umbrellas; everyone else sprints to their own spot
 *            under the canopy and waits there, facing the street, for as long as it rains.
 *
 * `rainFor` is how long it has been raining (seconds), or null when dry.
 */
export function pedestrianAt(p: Pedestrian, t: number, rainFor: number | null): PedestrianState {
  const laneZ = PAVEMENT.lanes[p.lane];
  const along = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  if (rainFor === null) {
    if (p.chatX !== null) {
      // The pair face each other, the first of them to the right.
      const first = p.index % 2 === 0;
      return { x: p.chatX, z: laneZ, heading: first ? Math.PI / 2 : -Math.PI / 2, pose: 'chat', speed: 0 };
    }
    return { x: strollX(p, t, p.pace), z: laneZ, heading: along, pose: 'walk', speed: p.pace };
  }
  if (p.umbrella && p.chatX === null) return { x: strollX(p, t, WALK.umbrella), z: laneZ, heading: along, pose: 'umbrella', speed: WALK.umbrella };
  // Run from where the shower caught them to their spot under the canopy, then wait there.
  const start: [number, number] = p.chatX !== null ? [p.chatX, laneZ] : [strollX(p, t - rainFor, p.pace), laneZ];
  const [sx, sz] = shelterSpot(p);
  const dist = Math.hypot(sx - start[0], sz - start[1]);
  const run = Math.min(1, (rainFor * WALK.sprint) / Math.max(dist, 1e-6));
  if (run >= 1) return { x: sx, z: sz, heading: 0, pose: 'shelter', speed: 0 };
  return { x: start[0] + (sx - start[0]) * run, z: start[1] + (sz - start[1]) * run, heading: Math.atan2(sx - start[0], sz - start[1]), pose: 'run', speed: WALK.sprint };
}
