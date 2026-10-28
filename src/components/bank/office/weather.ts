import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { CLEAR, rainOf, WEATHER_MIX, type Weather, type WeatherMix } from './atmosphere';
import { KERB_Z, STREET } from './layout3d';

/**
 * The weather over the 3D office, the shelters on the pavement, and how the people there behave. The weather is a learner's
 * pick: the bank simulation does not depend on it. Everything below the store is pure, so the tests can walk a pedestrian
 * through a shower.
 */

/** What the learner picked: one weather, or random (the default), which moves on to another every RANDOM_EVERY_S. */
export type WeatherChoice = 'random' | Weather;

interface WeatherState {
  choice: WeatherChoice;
  /** The weather now: the pick, or random mode's current one. */
  weather: Weather;
  /** The blend the sky has reached (eased towards the weather by WeatherDriver), refreshed a few times a second for the page. */
  mix: WeatherMix;
  /** Pick a weather, or random mode (which moves on from the weather now). */
  choose(choice: WeatherChoice): void;
  setWeather(weather: Weather): void;
}

export const weatherStore = createStore<WeatherState>()((set) => ({
  choice: 'random',
  weather: 'clear',
  mix: CLEAR,
  choose: (choice) => set(choice === 'random' ? { choice } : { choice, weather: choice }),
  setWeather: (weather) => set({ weather }),
}));
export const useWeather = <T>(pick: (s: WeatherState) => T): T => useStore(weatherStore, pick);

/** The blend right now, eased every frame by WeatherDriver: what the scene's lights, rain and trees read. */
export const liveMix: WeatherMix = { ...CLEAR };

/** Whether it is raining now (any rain in the blend), or about to (the pick brings rain). */
export const isRaining = (): boolean => rainOf(liveMix) > 0.02 || WEATHER_MIX[weatherStore.getState().weather].rain > 0;

/**
 * What people on the pavement wear: coats, scarves and hats in snow; T-shirts and sunglasses in the heat; raincoats in the
 * wet; a face mask in smog or pollen; a jacket on a cool, cloudy or autumn day.
 */
export type Outfit = 'everyday' | 'summer' | 'winter' | 'rain' | 'mask' | 'jacket';

const OUTFIT_OF: Readonly<Record<Weather, Outfit>> = {
  clear: 'everyday',
  golden: 'everyday',
  cloudy: 'jacket',
  autumn: 'jacket',
  hot: 'summer',
  heatwave: 'summer',
  spring: 'summer',
  rain: 'rain',
  rainbow: 'everyday',
  storm: 'rain',
  hail: 'rain',
  fog: 'jacket',
  smog: 'mask',
  pollen: 'mask',
  snow: 'winter',
};
export const outfitOf = (w: Weather): Outfit => OUTFIT_OF[w];

/** In a heatwave people carry a cold drink. */
export const carriesDrink = (w: Weather): boolean => w === 'heatwave';

const OUTFIT_TONES: Readonly<Record<Exclude<Outfit, 'everyday' | 'mask'>, readonly string[]>> = {
  summer: ['#fde68a', '#f9a8d4', '#a7f3d0', '#bae6fd', '#fecaca', '#ffffff'],
  winter: ['#374151', '#7f1d1d', '#1e3a8a', '#3f3f46', '#78350f', '#14532d'],
  rain: ['#facc15', '#1f2937', '#0e7490', '#b45309', '#4d7c0f', '#334155'],
  jacket: ['#78716c', '#57534e', '#9a3412', '#3f6212', '#1e40af', '#713f12'],
};

/** The top a person wears in an outfit (`everyday` keeps their own `shirt`). */
export const outfitShirt = (outfit: Outfit, index: number, shirt: string): string =>
  outfit === 'everyday' || outfit === 'mask' ? shirt : OUTFIT_TONES[outfit][index % OUTFIT_TONES[outfit].length]!;

// ─────────────────────────────────────────────────────────────────────────────
// Shelters
// ─────────────────────────────────────────────────────────────────────────────

export interface Roof {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Height of the roof's underside. */
  h: number;
}

/** The glass overhang along the front of the branch, over the pavement by the entrance. */
export const OVERHANG: Roof = { x0: -STREET.halfWidth + 2.6, x1: STREET.halfWidth - 0.6, z0: STREET.z0 + 0.02, z1: STREET.z0 + 1.15, h: 2.55 };

/** The glass bus stop and taxi stand by the kerb, on the right of the street. */
export const BUS_STOP: Roof = { x0: 10.3, x1: 13.7, z0: KERB_Z - 1.45, z1: KERB_Z - 0.18, h: 2.25 };

/** Whether (x, z) is under a roof, inside its edge by `margin`. */
export const underRoof = (r: Roof, x: number, z: number, margin = 0.15): boolean => x >= r.x0 + margin && x <= r.x1 - margin && z >= r.z0 + margin && z <= r.z1 - margin;

// ─────────────────────────────────────────────────────────────────────────────
// Pedestrians
// ─────────────────────────────────────────────────────────────────────────────

/** Where people walk: a lane near the kerb (through the bus stop) and one nearer the building, clear of the ATMs. */
export const PAVEMENT = {
  /** The x range they walk, past the ends of the drawn street so they come and go out of the haze. */
  x0: -STREET.halfWidth - 6,
  x1: STREET.halfWidth + 6,
  lanes: [KERB_Z - 0.55, KERB_Z - 1.75] as const,
} as const;

export const WALK = { relaxed: [0.45, 0.75] as const, umbrella: 0.95, sprint: 2.6 } as const;

/** How long an umbrella takes to open, and the gap between one person opening theirs and the next. */
export const UMBRELLA = { open: 0.5, stagger: 0.35, first: 0.3 } as const;

export type PedestrianPose = 'walk' | 'chat' | 'umbrella' | 'run' | 'shelter' | 'phone' | 'lookup' | 'fold' | 'shake';

/** The wet weather people react to: rain (false), a storm (true) or hail ('hail'). */
export type Downpour = boolean | 'hail';

/** How long people stop and look up when the first drops fall, before they run (umbrella carriers wait until they open theirs). */
export const LOOK_UP = 0.5;

/** After the rain: lowering and furling the umbrella, then shaking the water off it, in seconds. */
export const FOLD = { lower: 0.6, shake: 0.7 } as const;

/** The rain that has just stopped: how long ago, how long it lasted, and what it was. */
export interface AfterRain {
  since: number;
  lasted: number;
  was: Downpour;
}

export interface Pedestrian {
  /** Stable per person: shirt colour, lane, pace and whether they carry an umbrella. */
  index: number;
  lane: 0 | 1;
  /** +1 walks towards +x, -1 towards -x. */
  dir: 1 | -1;
  pace: number;
  /** Carries an umbrella (keeps walking under it in rain; in a storm heads for the bus stop and calls a taxi). */
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

/** Who waits at the bus stop in a storm, calling a taxi: the umbrella carriers and the people who were chatting. */
export const stormGoesToBus = (p: Pedestrian): boolean => p.umbrella || p.chatX !== null;

const BUS_GOERS = PEDESTRIANS.filter(stormGoesToBus);

/** Places in a row under a roof, kept inside it: `n` people, the `k`th of them, at depth `z`. */
const slot = (r: Roof, k: number, n: number, z: number): [number, number] => {
  const x0 = r.x0 + 0.35;
  const x1 = r.x1 - 0.35;
  return [n <= 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * k) / (n - 1), z];
};

/** A person's spot under the entrance overhang, spread along it. */
export const overhangSpot = (p: Pedestrian): [number, number] => slot(OVERHANG, PEDESTRIANS.indexOf(p), PEDESTRIANS.length, (OVERHANG.z0 + OVERHANG.z1) / 2);

/** A person's spot in the bus stop, in two rows. */
export const busSpot = (p: Pedestrian): [number, number] => {
  const k = Math.max(0, BUS_GOERS.indexOf(p));
  const perRow = Math.ceil(BUS_GOERS.length / 2);
  const row = Math.floor(k / perRow);
  return slot(BUS_STOP, k % perRow, Math.min(perRow, BUS_GOERS.length - row * perRow), BUS_STOP.z0 + 0.45 + row * 0.45);
};

/** Where a person runs to: in a storm the bus-stop group to the bus stop, everyone else to the entrance overhang. */
export const shelterSpot = (p: Pedestrian, storm = false): [number, number] => (storm && stormGoesToBus(p) ? busSpot(p) : overhangSpot(p));

export interface PedestrianState {
  x: number;
  z: number;
  /** Heading round the vertical axis, radians (0 faces +z, towards the camera side of the street). */
  heading: number;
  pose: PedestrianPose;
  /** Walking speed now, for the leg swing. */
  speed: number;
  /** How far open the umbrella is, 0-1. */
  umbrella: number;
}

const span = PAVEMENT.x1 - PAVEMENT.x0;
const wrap = (x: number): number => PAVEMENT.x0 + ((((x - PAVEMENT.x0) % span) + span) % span);

/** Where a person walking at `pace` since time 0 is at `t` seconds, wrapping round the street's ends. */
const strollX = (p: Pedestrian, t: number, pace: number): number => wrap(PAVEMENT.x0 + unit(p.index, 3) * span + p.dir * pace * t);

/** When a person's umbrella starts to open after the rain begins: one after another, not all at once. */
export const umbrellaDelay = (p: Pedestrian): number => UMBRELLA.first + (PEDESTRIANS.indexOf(p) % 6) * UMBRELLA.stagger;

/**
 * Where person `p` is at `t` seconds, and what they are doing: a small state machine driven by how long the weather has
 * been wet, or how long ago it dried up.
 *
 *   Dry        a relaxed stroll along their lane; the two pairs stand and talk at their spot (facing each other).
 *   Rain       everyone stops and looks up; umbrella carriers then raise an arm and open their umbrellas one after another
 *              and walk on, a little faster; everyone else sprints to their spot under the entrance overhang and waits there.
 *   Storm      no one stays out: the umbrella carriers and the chatting pairs run for the bus stop and wait there on their
 *              phones, calling a taxi; the rest sprint for the overhang.
 *   Hail       everyone, umbrella or not, ducks under the overhang.
 *   After      (`after`, once it dries up) umbrella carriers lower and furl their umbrellas, shake the water off and walk
 *              on; the sheltering step back out to their lane (the pairs to their spot) and carry on.
 *
 * `rainFor` is how long it has been wet (seconds), or null when dry.
 */
export function pedestrianAt(p: Pedestrian, t: number, rainFor: number | null, storm: Downpour = false, after: AfterRain | null = null): PedestrianState {
  const laneZ = PAVEMENT.lanes[p.lane];
  const along = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  if (rainFor === null && after) return afterRainAt(p, t, after);
  if (rainFor === null) {
    if (p.chatX !== null) {
      // The pair face each other, the first of them to the right.
      const first = p.index % 2 === 0;
      return { x: p.chatX, z: laneZ, heading: first ? Math.PI / 2 : -Math.PI / 2, pose: 'chat', speed: 0, umbrella: 0 };
    }
    return { x: strollX(p, t, p.pace), z: laneZ, heading: along, pose: 'walk', speed: p.pace, umbrella: 0 };
  }
  const hail = storm === 'hail';
  const caught: [number, number] = p.chatX !== null ? [p.chatX, laneZ] : [strollX(p, t - rainFor, p.pace), laneZ];
  if (p.umbrella && p.chatX === null && storm === false) {
    const delay = umbrellaDelay(p);
    // They stop where the first drops caught them and look up; then the arm goes up and the umbrella opens as they set off
    // again at their own pace, and once it is open they walk on a little faster under it.
    if (rainFor < delay) return { x: caught[0], z: laneZ, heading: along, pose: 'lookup', speed: 0, umbrella: 0 };
    const open = Math.min(1, (rainFor - delay) / UMBRELLA.open);
    const x = open < 1 ? caught[0] + p.dir * p.pace * (rainFor - delay) : caught[0] + p.dir * (p.pace * UMBRELLA.open + WALK.umbrella * (rainFor - delay - UMBRELLA.open));
    return { x: wrap(x), z: laneZ, heading: along, pose: 'umbrella', speed: open < 1 ? p.pace : WALK.umbrella, umbrella: open };
  }
  // A moment to look up, then run from where the weather caught them to their shelter, and wait there.
  if (rainFor < LOOK_UP) return { x: caught[0], z: caught[1], heading: along, pose: 'lookup', speed: 0, umbrella: 0 };
  const start = caught;
  const [sx, sz] = hail ? overhangSpot(p) : shelterSpot(p, storm === true);
  const dist = Math.hypot(sx - start[0], sz - start[1]);
  const run = Math.min(1, ((rainFor - LOOK_UP) * WALK.sprint) / Math.max(dist, 1e-6));
  const atBus = storm === true && stormGoesToBus(p);
  if (run >= 1) return { x: sx, z: sz, heading: atBus ? Math.PI : 0, pose: atBus ? 'phone' : 'shelter', speed: 0, umbrella: 0 };
  return { x: start[0] + (sx - start[0]) * run, z: start[1] + (sz - start[1]) * run, heading: Math.atan2(sx - start[0], sz - start[1]), pose: 'run', speed: WALK.sprint, umbrella: 0 };
}

/** Once it dries up: where the person was when it stopped, then folding the umbrella or stepping back out, then on as before. */
function afterRainAt(p: Pedestrian, t: number, after: AfterRain): PedestrianState {
  const laneZ = PAVEMENT.lanes[p.lane];
  const along = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  const s = after.since;
  const at = pedestrianAt(p, t - s, after.lasted, after.was);
  if (at.umbrella > 0) {
    // Lower and furl it while slowing to a stop, shake the water off, then stroll on.
    const slow = WALK.relaxed[0] * 0.5;
    if (s < FOLD.lower) return { x: wrap(at.x + p.dir * slow * s), z: laneZ, heading: along, pose: 'fold', speed: slow, umbrella: at.umbrella * (1 - s / FOLD.lower) };
    const stop = wrap(at.x + p.dir * slow * FOLD.lower);
    if (s < FOLD.lower + FOLD.shake) return { x: stop, z: laneZ, heading: along, pose: 'shake', speed: 0, umbrella: 0 };
    return { x: wrap(stop + p.dir * p.pace * (s - FOLD.lower - FOLD.shake)), z: laneZ, heading: along, pose: 'walk', speed: p.pace, umbrella: 0 };
  }
  // Step back out from the shelter (or from wherever the run had got to) to their lane, or the pair to their spot.
  const target: [number, number] = p.chatX !== null ? [p.chatX, laneZ] : [at.x, laneZ];
  const dist = Math.hypot(target[0] - at.x, target[1] - at.z);
  const back = dist / WALK.relaxed[1];
  if (s < back) {
    const k = s / back;
    return { x: at.x + (target[0] - at.x) * k, z: at.z + (target[1] - at.z) * k, heading: Math.atan2(target[0] - at.x, target[1] - at.z), pose: 'walk', speed: WALK.relaxed[1], umbrella: 0 };
  }
  if (p.chatX !== null) return { x: p.chatX, z: laneZ, heading: p.index % 2 === 0 ? Math.PI / 2 : -Math.PI / 2, pose: 'chat', speed: 0, umbrella: 0 };
  return { x: wrap(target[0] + p.dir * p.pace * (s - back)), z: laneZ, heading: along, pose: 'walk', speed: p.pace, umbrella: 0 };
}
