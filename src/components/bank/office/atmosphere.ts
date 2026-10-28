/**
 * The look of the sky and the light over the 3D office at a given bank minute, and in rain. Pure: the scene reads it each
 * frame, and the tests read it directly.
 *
 * The bank's day runs 08:00 to 24:00 (sim/clock.ts), so the four presets are spread over it:
 *
 *   Morning     08:00  pale sky, low sun, a mist over the street that burns off by 10:00
 *   Noon        12:00  the brightest, whitest light
 *   Afternoon   15:30  warm, lower sun
 *   Night       20:00  deep navy sky, the sun gone, street lamps and lit windows
 *
 * Between two presets every value is blended, so the light changes gradually rather than snapping. Rain greys the sky, dims
 * the sun and thickens the haze at any hour.
 */

export type DayPart = 'morning' | 'noon' | 'afternoon' | 'night';

export interface Atmosphere {
  part: DayPart;
  /** Sky gradient behind the diorama, top and horizon. */
  skyTop: string;
  skyHorizon: string;
  /** The key light and the sky/ground bounce. */
  sun: { intensity: number; color: string };
  hemi: { intensity: number; sky: string; ground: string };
  /** Distance haze (world units from the camera), its colour the horizon's. */
  fog: { near: number; far: number; color: string };
  /** Morning mist over the street, 0-1. */
  mist: number;
  /** Street lamps and lit office windows in the city, 0-1. */
  lamps: number;
  windows: number;
}

interface Key {
  at: number;
  part: DayPart;
  skyTop: string;
  skyHorizon: string;
  sun: number;
  sunColor: string;
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
  { at: 8 * 60, part: 'morning', skyTop: '#8fb4d6', skyHorizon: '#e9dccb', sun: 1.55, sunColor: '#ffe3c2', hemi: 0.95, hemiSky: '#f3efe6', hemiGround: '#cdbb9f', fogNear: 52, fogFar: 82, mist: 0.85, lamps: 0.35, windows: 0.25 },
  { at: 10 * 60, part: 'morning', skyTop: '#7fb0de', skyHorizon: '#e6eef6', sun: 2.1, sunColor: '#fff0d6', hemi: 1.1, hemiSky: '#fff8ec', hemiGround: '#ecd9bb', fogNear: 62, fogFar: 104, mist: 0, lamps: 0, windows: 0 },
  { at: 12 * 60, part: 'noon', skyTop: '#6aa7e3', skyHorizon: '#eef4fa', sun: 2.5, sunColor: '#fffaf0', hemi: 1.2, hemiSky: '#ffffff', hemiGround: '#efe0c4', fogNear: 66, fogFar: 112, mist: 0, lamps: 0, windows: 0 },
  { at: 15.5 * 60, part: 'afternoon', skyTop: '#6d9fd2', skyHorizon: '#f6e3c8', sun: 2.25, sunColor: '#ffd9a8', hemi: 1.05, hemiSky: '#fff1dc', hemiGround: '#e7cfa8', fogNear: 62, fogFar: 104, mist: 0, lamps: 0, windows: 0.1 },
  { at: 17.5 * 60, part: 'afternoon', skyTop: '#5f6fa8', skyHorizon: '#f2b98a', sun: 1.6, sunColor: '#ffb980', hemi: 0.85, hemiSky: '#ffd9b8', hemiGround: '#b8977a', fogNear: 58, fogFar: 96, mist: 0, lamps: 0.6, windows: 0.55 },
  { at: 20 * 60, part: 'night', skyTop: '#0b1224', skyHorizon: '#1e2a47', sun: 0.55, sunColor: '#a9bdf2', hemi: 0.45, hemiSky: '#6f84b8', hemiGround: '#2a2f3e', fogNear: 54, fogFar: 88, mist: 0, lamps: 1, windows: 1 },
  { at: 24 * 60, part: 'night', skyTop: '#070b16', skyHorizon: '#141d33', sun: 0.45, sunColor: '#9fb3e8', hemi: 0.4, hemiSky: '#5c6fa0', hemiGround: '#23283a', fogNear: 52, fogFar: 84, mist: 0, lamps: 1, windows: 0.85 },
];

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (rgb: readonly number[]): string => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
export const mixHex = (a: string, b: string, t: number): string => {
  const [x, y] = [hex(a), hex(b)];
  return toHex(x.map((v, i) => v + (y[i]! - v) * t));
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The rain's grey, mixed into the sky and the haze. */
const RAIN_GREY = '#7d8794';

/** The atmosphere at `minute` (minutes since midnight), dry or in rain. */
export function atmosphereAt(minute: number, rain = false): Atmosphere {
  const m = Math.max(DAY_KEYS[0]!.at, Math.min(DAY_KEYS[DAY_KEYS.length - 1]!.at, minute));
  let i = 0;
  while (i < DAY_KEYS.length - 2 && DAY_KEYS[i + 1]!.at <= m) i++;
  const a = DAY_KEYS[i]!;
  const b = DAY_KEYS[i + 1]!;
  const t = b.at === a.at ? 0 : (m - a.at) / (b.at - a.at);
  const part: DayPart = m >= 19 * 60 ? 'night' : m >= 14 * 60 ? 'afternoon' : m >= 11 * 60 ? 'noon' : 'morning';
  const wet = rain ? 1 : 0;
  // Rain: a grey sky, a weaker sun, and the haze pulled in.
  const grey = (c: string, k: number): string => mixHex(c, RAIN_GREY, k * wet);
  return {
    part,
    skyTop: grey(mixHex(a.skyTop, b.skyTop, t), part === 'night' ? 0.25 : 0.55),
    skyHorizon: grey(mixHex(a.skyHorizon, b.skyHorizon, t), part === 'night' ? 0.25 : 0.5),
    sun: { intensity: lerp(a.sun, b.sun, t) * (1 - 0.45 * wet), color: mixHex(a.sunColor, b.sunColor, t) },
    hemi: { intensity: lerp(a.hemi, b.hemi, t) * (1 - 0.15 * wet), sky: grey(mixHex(a.hemiSky, b.hemiSky, t), 0.3), ground: mixHex(a.hemiGround, b.hemiGround, t) },
    fog: { near: lerp(a.fogNear, b.fogNear, t) - 6 * wet, far: lerp(a.fogFar, b.fogFar, t) - 14 * wet, color: grey(mixHex(a.skyHorizon, b.skyHorizon, t), 0.5) },
    mist: Math.min(1, lerp(a.mist, b.mist, t) + 0.25 * wet),
    lamps: Math.min(1, lerp(a.lamps, b.lamps, t) + (rain && part !== 'night' ? 0.35 : 0)),
    windows: lerp(a.windows, b.windows, t),
  };
}
