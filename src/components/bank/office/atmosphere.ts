/**
 * The look of the sky and the light over the 3D office at a given bank minute, under a given weather. Pure: the scene reads
 * it each frame, and the tests read it directly.
 *
 * The bank's day runs 08:00 to 24:00 (sim/clock.ts), so the time-of-day presets are spread over it:
 *
 *   Morning     08:00  soft, bright light from a low sun in the east, and a mist over the street that burns off by 10:00
 *   Noon        12:00  the highest, whitest sun
 *   Afternoon   15:30  a deep golden-amber sun, low in the west, for long raking light
 *   Night       20:00  deep navy sky, the sun gone, street lamps, lit windows and bright desk lights
 *
 * The weather is a blend of moods over clear sky (WeatherMix): harsh sun, overcast, rain, storm, a golden low sun, snow, fog,
 * falling leaves and blossom, hail, smog and pollen. Every weather is a point in that one space, so the scene
 * moves between ANY two of them the same way: each mood eases linearly towards its target over two seconds (stepMix), so a
 * drizzle thickens into rain, a storm thins into sunshine, a fog lifts into smog, with nothing to special-case.
 *
 * Two things follow the clock whatever the weather: a fog lifts as the bank opens (gone by FOG_LIFT), and late in the
 * afternoon a warm sunset glow blends into the weather's own light (sunsetAt).
 */

export type DayPart = 'morning' | 'noon' | 'afternoon' | 'night';

/** How much of each mood is in the sky now, each 0-1. All zero is a clear day. */
export interface WeatherMix {
  harsh: number;
  overcast: number;
  rain: number;
  storm: number;
  /** A low, deep-amber sun whatever the hour: the golden hour. */
  golden: number;
  snow: number;
  /** Thick ground fog. */
  fog: number;
  /** Autumn leaves and spring blossom drifting on the wind. */
  leaves: number;
  petals: number;
  /** Ice pellets bouncing on the ground. */
  hail: number;
  /** A yellowish haze of fine dust. */
  smog: number;
  /** Pollen thick in the sunlight. */
  pollen: number;
}

export const MOODS = ['harsh', 'overcast', 'rain', 'storm', 'golden', 'snow', 'fog', 'leaves', 'petals', 'hail', 'smog', 'pollen'] as const satisfies readonly (keyof WeatherMix)[];

export const CLEAR: WeatherMix = { harsh: 0, overcast: 0, rain: 0, storm: 0, golden: 0, snow: 0, fog: 0, leaves: 0, petals: 0, hail: 0, smog: 0, pollen: 0 };

export type Weather = 'clear' | 'cloudy' | 'hot' | 'rain' | 'storm' | 'hail' | 'fog' | 'smog' | 'autumn' | 'spring' | 'pollen' | 'snow';
export const WEATHERS: readonly Weather[] = ['clear', 'cloudy', 'hot', 'rain', 'storm', 'hail', 'fog', 'smog', 'autumn', 'spring', 'pollen', 'snow'];

/** The weathers random mode moves between: everyday ones, never snow or hail (those are picked by hand). */
export const RANDOM_WEATHERS: readonly Weather[] = WEATHERS.filter((w) => w !== 'snow' && w !== 'hail');

const moods = (m: Partial<WeatherMix>): WeatherMix => ({ ...CLEAR, ...m });

/** The blend a weather pick aims for. A storm is rain too, and overcast; snow and fog come under a grey sky. */
export const WEATHER_MIX: Readonly<Record<Weather, WeatherMix>> = {
  clear: CLEAR,
  cloudy: moods({ overcast: 1 }),
  hot: moods({ harsh: 1 }),
  rain: moods({ overcast: 0.6, rain: 1 }),
  storm: moods({ overcast: 1, rain: 1, storm: 1 }),
  hail: moods({ overcast: 0.9, hail: 1 }),
  fog: moods({ overcast: 0.4, fog: 1 }),
  smog: moods({ overcast: 0.3, smog: 1 }),
  autumn: moods({ golden: 0.3, leaves: 1 }),
  spring: moods({ petals: 1 }),
  pollen: moods({ pollen: 1 }),
  snow: moods({ overcast: 0.7, snow: 1 }),
};

/** In random mode, how often the weather moves on (seconds of real time), and the next weather: never the same twice running. */
export const RANDOM_EVERY_S = 150;
export const nextRandomWeather = (now: Weather, r: number): Weather => {
  const others = RANDOM_WEATHERS.filter((w) => w !== now);
  return others[Math.min(others.length - 1, Math.floor(Math.max(0, r) * others.length))]!;
};

/** How long the sky takes to move from one weather to the next, in seconds. */
export const WEATHER_BLEND_S = 2;

/** One step of the blend towards `to`: every mood moves at the same rate, so a full change takes WEATHER_BLEND_S. */
export function stepMix(from: WeatherMix, to: WeatherMix, dt: number): WeatherMix {
  const k = Math.max(0, dt) / WEATHER_BLEND_S;
  const step = (a: number, b: number): number => (Math.abs(b - a) <= k ? b : a + Math.sign(b - a) * k);
  const out = { ...from };
  for (const m of MOODS) out[m] = step(from[m], to[m]);
  return out;
}

export const sameMix = (a: WeatherMix, b: WeatherMix): boolean => MOODS.every((m) => a[m] === b[m]);

/** How hard the wind blows, 0 (still) to about 2 (storm): it sways the trees, slants the rain and carries the leaves. */
export const windOf = (w: WeatherMix): number =>
  Math.max(0.1, 0.3 - 0.15 * w.harsh + 0.35 * w.overcast + 0.45 * w.rain + 1.3 * w.storm + 0.55 * w.leaves + 0.2 * w.petals + 0.25 * w.snow - 0.2 * w.fog + 0.5 * w.hail - 0.15 * w.smog);

/** Wind strong enough to see: the streaks blowing across the scene, 0-1. */
export const gustOf = (w: WeatherMix): number => Math.max(0, Math.min(1, (windOf(w) - 0.7) / 1.2));

/** How much rain falls, 0-1 (the share of the drops drawn). */
export const rainOf = (w: WeatherMix): number => Math.min(1, w.rain);

/** How wet the street is, 0-1: rain, and hail melting. */
export const wetOf = (w: WeatherMix): number => Math.min(1, w.rain + 0.6 * w.hail);

/** A fog is thick until the bank opens at 9:00 and has lifted by FOG_LIFT: how much of it is left at `minute`, 0-1. */
export const FOG_LIFT = 9.75 * 60;
/** How much of a fog stays lying low over the ground once it has lifted off the city. */
export const GROUND_FOG = 0.7;
export const fogLeft = (minute: number): number => Math.max(0, Math.min(1, (FOG_LIFT - minute) / (FOG_LIFT - 9 * 60)));

/** The late-afternoon sunset glow, 0-1: rising from 16:30, strongest at 17:45, gone by 19:15. */
export const sunsetAt = (minute: number): number => {
  const h = minute / 60;
  return h <= 16.5 || h >= 19.25 ? 0 : h < 17.75 ? (h - 16.5) / 1.25 : (19.25 - h) / 1.5;
};

/** How much weather there is in the sky (cloud, rain, snow, fog...), 0-1: what the sunset glow has to show through. */
const weatherIn = (w: WeatherMix): number => Math.min(1, w.overcast + w.rain + w.storm + w.snow + w.fog + w.smog + w.hail);

export interface Atmosphere {
  part: DayPart;
  /** Sky gradient behind the diorama, top and horizon. */
  skyTop: string;
  skyHorizon: string;
  /** The key light (where it shines from, as a unit-ish vector) and the sky/ground bounce. */
  sun: { intensity: number; color: string; dir: readonly [number, number, number] };
  hemi: { intensity: number; sky: string; ground: string };
  /** Distance haze (world units from the camera), its colour the horizon's. */
  fog: { near: number; far: number; color: string };
  /** Morning mist over the street, 0-1. */
  mist: number;
  /** Street lamps, lit city windows and the lights over the desks, 0-1. */
  lamps: number;
  windows: number;
  /** Dust and pollen floating in sunlight, 0-1. */
  motes: number;
  /** How white the ground is with settled snow, 0-1. */
  snowCover: number;
}

interface Key {
  at: number;
  skyTop: string;
  skyHorizon: string;
  sun: number;
  sunColor: string;
  /** Where the sun stands: x (east is -x), height, z (the street side is +z). */
  sunDir: readonly [number, number, number];
  hemi: number;
  hemiSky: string;
  hemiGround: string;
  fogNear: number;
  fogFar: number;
  mist: number;
  lamps: number;
  windows: number;
}

/** The presets, by minute of the day. The camera stands 60 units from the point it looks at, so the haze starts past the office. */
export const DAY_KEYS: readonly Key[] = [
  { at: 8 * 60, skyTop: '#8fb4d6', skyHorizon: '#e9dccb', sun: 1.55, sunColor: '#ffe3c2', sunDir: [-30, 14, 10], hemi: 0.95, hemiSky: '#f3efe6', hemiGround: '#cdbb9f', fogNear: 52, fogFar: 82, mist: 0.85, lamps: 0.35, windows: 0.25 },
  { at: 10 * 60, skyTop: '#7fb0de', skyHorizon: '#e6eef6', sun: 2.1, sunColor: '#fff0d6', sunDir: [-22, 24, 14], hemi: 1.1, hemiSky: '#fff8ec', hemiGround: '#ecd9bb', fogNear: 62, fogFar: 104, mist: 0, lamps: 0, windows: 0 },
  { at: 12 * 60, skyTop: '#6aa7e3', skyHorizon: '#eef4fa', sun: 2.5, sunColor: '#fffaf0', sunDir: [-8, 34, 12], hemi: 1.2, hemiSky: '#ffffff', hemiGround: '#efe0c4', fogNear: 66, fogFar: 112, mist: 0, lamps: 0, windows: 0 },
  // Afternoon: a deep golden-amber sun, low in the west, raking long light across the floor.
  { at: 15.5 * 60, skyTop: '#5d86b8', skyHorizon: '#f0a35e', sun: 2.3, sunColor: '#e67e22', sunDir: [22, 16, 14], hemi: 0.95, hemiSky: '#ffd7a8', hemiGround: '#d9a76a', fogNear: 60, fogFar: 100, mist: 0, lamps: 0, windows: 0.1 },
  { at: 17.5 * 60, skyTop: '#4d5d96', skyHorizon: '#e67e22', sun: 1.7, sunColor: '#d35400', sunDir: [30, 9, 12], hemi: 0.78, hemiSky: '#ffb877', hemiGround: '#a8784f', fogNear: 56, fogFar: 94, mist: 0, lamps: 0.6, windows: 0.55 },
  { at: 20 * 60, skyTop: '#0b1224', skyHorizon: '#1e2a47', sun: 0.55, sunColor: '#a9bdf2', sunDir: [-10, 30, -6], hemi: 0.45, hemiSky: '#6f84b8', hemiGround: '#2a2f3e', fogNear: 54, fogFar: 88, mist: 0, lamps: 1, windows: 1 },
  { at: 24 * 60, skyTop: '#070b16', skyHorizon: '#141d33', sun: 0.45, sunColor: '#9fb3e8', sunDir: [-10, 30, -6], hemi: 0.4, hemiSky: '#5c6fa0', hemiGround: '#23283a', fogNear: 52, fogFar: 84, mist: 0, lamps: 1, windows: 0.85 },
];

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (rgb: readonly number[]): string => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
export const mixHex = (a: string, b: string, t: number): string => {
  const [x, y] = [hex(a), hex(b)];
  return toHex(x.map((v, i) => v + (y[i]! - v) * t));
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** A colour's grey of the same lightness: the overcast sky drains the colour out. */
const desaturate = (c: string, k: number): string => {
  const [r, g, b] = hex(c);
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  return toHex([r + (l - r) * k, g + (l - g) * k, b + (l - b) * k]);
};

/** The storm's slate grey, mixed into the sky; the pale sky of snow and fog. */
const STORM_GREY = '#39414e';
const RAIN_GREY = '#7d8794';
const SNOW_SKY = '#dfe5ec';
const FOG_SKY = '#d5dadf';
const SMOG_SKY = '#c8b98a';
const GOLD = '#e67e22';

/** The atmosphere at `minute` (minutes since midnight) under `weather` (a blend, or `true` for full rain). */
export function atmosphereAt(minute: number, weather: WeatherMix | boolean = CLEAR): Atmosphere {
  const picked: WeatherMix = weather === true ? WEATHER_MIX.rain : weather === false ? CLEAR : weather;
  // The fog lifts as the morning goes on; late in the day a warm sunset blends into whatever weather there is (a clear
  // sky has its own amber evening in DAY_KEYS already).
  const w: WeatherMix = { ...picked, fog: picked.fog * fogLeft(minute), golden: Math.min(1, picked.golden + 0.6 * sunsetAt(minute) * weatherIn(picked)) };
  const m = Math.max(DAY_KEYS[0]!.at, Math.min(DAY_KEYS[DAY_KEYS.length - 1]!.at, minute));
  let i = 0;
  while (i < DAY_KEYS.length - 2 && DAY_KEYS[i + 1]!.at <= m) i++;
  const a = DAY_KEYS[i]!;
  const b = DAY_KEYS[i + 1]!;
  const t = b.at === a.at ? 0 : (m - a.at) / (b.at - a.at);
  const part: DayPart = m >= 19 * 60 ? 'night' : m >= 14 * 60 ? 'afternoon' : m >= 11 * 60 ? 'noon' : 'morning';
  const night = part === 'night' ? 1 : 0;
  const daylight = 1 - night;

  // Sky: clear, then drained by overcast, greyed by rain, darkened by storm; harsh sun deepens the blue.
  const sky = (c: string, deep: string): string => {
    let out = mixHex(c, deep, 0.25 * w.harsh * daylight);
    out = desaturate(out, 0.75 * w.overcast);
    out = mixHex(out, RAIN_GREY, (night ? 0.2 : 0.45) * w.rain);
    out = mixHex(out, SNOW_SKY, (night ? 0.15 : 0.55) * w.snow);
    out = mixHex(out, FOG_SKY, (night ? 0.2 : 0.7) * w.fog);
    out = mixHex(out, SMOG_SKY, (night ? 0.25 : 0.65) * w.smog);
    out = mixHex(out, RAIN_GREY, (night ? 0.2 : 0.5) * w.hail);
    return mixHex(out, STORM_GREY, (night ? 0.35 : 0.65) * w.storm);
  };
  const top = mixHex(a.skyTop, b.skyTop, t);
  // The golden hour warms the horizon to amber and the top of the sky to a dusky blue.
  const horizon = mixHex(mixHex(a.skyHorizon, b.skyHorizon, t), GOLD, 0.75 * w.golden * daylight);
  const topSky = mixHex(top, '#4d5d96', 0.45 * w.golden * daylight);

  const sunBase = lerp(a.sun, b.sun, t);
  const sunIntensity =
    sunBase * (1 + 0.45 * w.harsh * daylight) * (1 - 0.6 * w.overcast) * (1 - 0.25 * w.rain) * (1 - 0.4 * w.storm) * (1 - 0.35 * w.fog) * (1 - 0.35 * w.smog) * (1 - 0.2 * w.hail);
  const sunColor = mixHex(
    mixHex(mixHex(desaturate(mixHex(a.sunColor, b.sunColor, t), 0.6 * w.overcast), '#fffbe6', 0.5 * w.harsh * (part === 'afternoon' ? 0.3 : 1)), '#e8c77a', 0.6 * w.smog),
    GOLD,
    w.golden * daylight,
  );
  // Harsh sun lowers the bounce for contrast; overcast raises it for soft, shadowless light.
  const hemiIntensity = lerp(a.hemi, b.hemi, t) * (1 - 0.3 * w.harsh * daylight) * (1 + 0.2 * w.overcast * daylight) * (1 - 0.3 * w.storm);
  const haze = 8 * w.overcast + 10 * w.rain + 12 * w.storm + 6 * w.snow + 34 * w.fog + 28 * w.smog + 8 * w.hail;
  // The golden hour drops the sun low in the west, so the light rakes long across the floor.
  const dir = a.sunDir.map((v, k) => lerp(lerp(v, b.sunDir[k]!, t), ([30, 8, 12] as const)[k]!, w.golden * daylight)) as unknown as readonly [number, number, number];
  return {
    part,
    skyTop: sky(topSky, '#2f7fd4'),
    skyHorizon: sky(horizon, '#dbe9f7'),
    sun: { intensity: sunIntensity, color: sunColor, dir },
    hemi: { intensity: hemiIntensity, sky: desaturate(mixHex(a.hemiSky, b.hemiSky, t), 0.5 * w.overcast), ground: mixHex(a.hemiGround, b.hemiGround, t) },
    fog: { near: lerp(a.fogNear, b.fogNear, t) - haze * 0.4, far: lerp(a.fogFar, b.fogFar, t) - haze, color: sky(horizon, '#dbe9f7') },
    // Ground mist: the morning's, a little in rain or under cloud, and thick in fog and in smog. When a fog lifts off the
    // city (the distance haze above), a low mist stays lying over the streets, the car park and the lawns all day.
    mist: Math.min(1, lerp(a.mist, b.mist, t) * fogLeft(minute) + 0.2 * w.rain + 0.15 * w.overcast + Math.max(w.fog, GROUND_FOG * picked.fog) + 0.85 * w.smog),
    lamps: Math.min(1, lerp(a.lamps, b.lamps, t) + (0.35 * w.rain + 0.5 * w.storm + 0.4 * w.fog + 0.3 * w.golden + 0.5 * w.smog + 0.3 * w.hail) * daylight),
    windows: Math.min(1, lerp(a.windows, b.windows, t) + 0.5 * w.storm * daylight + 0.3 * w.golden * daylight),
    motes:
      part === 'night'
        ? 0
        : Math.min(1, Math.max(0, (part === 'morning' ? 0.6 : 1) * (1 + 0.5 * w.harsh + 0.3 * w.golden) - w.overcast - w.rain - w.fog - w.snow - w.smog - w.hail) / 1.5 + w.pollen),
    snowCover: w.snow,
  };
}
