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
 * The weather is a blend of four moods over clear sky (WeatherMix): harsh sun, overcast, rain and storm. The scene eases the
 * blend towards the one the learner picks over two seconds, so the change is gradual: a drizzle thickens into rain.
 */

export type DayPart = 'morning' | 'noon' | 'afternoon' | 'night';

/** How much of each mood is in the sky now, each 0-1. All zero is a clear day. */
export interface WeatherMix {
  harsh: number;
  overcast: number;
  rain: number;
  storm: number;
}

export const CLEAR: WeatherMix = { harsh: 0, overcast: 0, rain: 0, storm: 0 };

export type Weather = 'clear' | 'harsh' | 'overcast' | 'rain' | 'storm';
export const WEATHERS: readonly Weather[] = ['clear', 'harsh', 'overcast', 'rain', 'storm'];

/** The blend a weather pick aims for. A storm is rain too, and overcast. */
export const WEATHER_MIX: Readonly<Record<Weather, WeatherMix>> = {
  clear: CLEAR,
  harsh: { harsh: 1, overcast: 0, rain: 0, storm: 0 },
  overcast: { harsh: 0, overcast: 1, rain: 0, storm: 0 },
  rain: { harsh: 0, overcast: 0.6, rain: 1, storm: 0 },
  storm: { harsh: 0, overcast: 1, rain: 1, storm: 1 },
};

/** How long the sky takes to move from one weather to the next, in seconds. */
export const WEATHER_BLEND_S = 2;

/** One step of the blend towards `to`: every mood moves at the same rate, so a full change takes WEATHER_BLEND_S. */
export function stepMix(from: WeatherMix, to: WeatherMix, dt: number): WeatherMix {
  const k = Math.max(0, dt) / WEATHER_BLEND_S;
  const step = (a: number, b: number): number => (Math.abs(b - a) <= k ? b : a + Math.sign(b - a) * k);
  return { harsh: step(from.harsh, to.harsh), overcast: step(from.overcast, to.overcast), rain: step(from.rain, to.rain), storm: step(from.storm, to.storm) };
}

export const sameMix = (a: WeatherMix, b: WeatherMix): boolean => a.harsh === b.harsh && a.overcast === b.overcast && a.rain === b.rain && a.storm === b.storm;

/** How hard the wind blows, 0 (still) to about 2 (storm): it sways the trees and slants the rain. */
export const windOf = (w: WeatherMix): number => Math.max(0.1, 0.3 - 0.15 * w.harsh + 0.35 * w.overcast + 0.45 * w.rain + 1.3 * w.storm);

/** How much rain falls, 0-1 (the share of the drops drawn). */
export const rainOf = (w: WeatherMix): number => Math.min(1, w.rain);

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

/** The storm's slate grey, mixed into the sky. */
const STORM_GREY = '#39414e';
const RAIN_GREY = '#7d8794';

/** The atmosphere at `minute` (minutes since midnight) under `weather` (a blend, or `true` for full rain). */
export function atmosphereAt(minute: number, weather: WeatherMix | boolean = CLEAR): Atmosphere {
  const w: WeatherMix = weather === true ? WEATHER_MIX.rain : weather === false ? CLEAR : weather;
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
    return mixHex(out, STORM_GREY, (night ? 0.35 : 0.65) * w.storm);
  };
  const top = mixHex(a.skyTop, b.skyTop, t);
  const horizon = mixHex(a.skyHorizon, b.skyHorizon, t);

  const sunBase = lerp(a.sun, b.sun, t);
  const sunIntensity = sunBase * (1 + 0.45 * w.harsh * daylight) * (1 - 0.6 * w.overcast) * (1 - 0.25 * w.rain) * (1 - 0.4 * w.storm);
  const sunColor = mixHex(desaturate(mixHex(a.sunColor, b.sunColor, t), 0.6 * w.overcast), '#fffbe6', 0.5 * w.harsh * (part === 'afternoon' ? 0.3 : 1));
  // Harsh sun lowers the bounce for contrast; overcast raises it for soft, shadowless light.
  const hemiIntensity = lerp(a.hemi, b.hemi, t) * (1 - 0.3 * w.harsh * daylight) * (1 + 0.2 * w.overcast * daylight) * (1 - 0.3 * w.storm);
  const haze = 8 * w.overcast + 10 * w.rain + 12 * w.storm;
  const dir = a.sunDir.map((v, k) => lerp(v, b.sunDir[k]!, t)) as unknown as readonly [number, number, number];
  return {
    part,
    skyTop: sky(top, '#2f7fd4'),
    skyHorizon: sky(horizon, '#dbe9f7'),
    sun: { intensity: sunIntensity, color: sunColor, dir },
    hemi: { intensity: hemiIntensity, sky: desaturate(mixHex(a.hemiSky, b.hemiSky, t), 0.5 * w.overcast), ground: mixHex(a.hemiGround, b.hemiGround, t) },
    fog: { near: lerp(a.fogNear, b.fogNear, t) - haze * 0.4, far: lerp(a.fogFar, b.fogFar, t) - haze, color: sky(horizon, '#dbe9f7') },
    mist: Math.min(1, lerp(a.mist, b.mist, t) + 0.2 * w.rain + 0.15 * w.overcast),
    lamps: Math.min(1, lerp(a.lamps, b.lamps, t) + 0.35 * w.rain * daylight + 0.5 * w.storm * daylight),
    windows: Math.min(1, lerp(a.windows, b.windows, t) + 0.5 * w.storm * daylight),
    motes: part === 'night' ? 0 : Math.max(0, (part === 'morning' ? 0.6 : 1) * (1 + 0.5 * w.harsh) - w.overcast - w.rain) / 1.5,
  };
}
