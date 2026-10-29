import { FLOOR_SLAB, type V2 } from './layout3d';
import { LOT } from './parking';
import { pathLength, pointAlongPath } from './tour3d';

/**
 * Where everything in the public park is (the park on the right of the branch, between it and the houses): the lawn, the
 * cobbled loop path, the fountain plaza, the benches, the playground and the picnic corner. Park3D draws it; parkLife moves
 * its people about it.
 */

const HX = FLOOR_SLAB.w / 2;

/** The park, as world x (it is on the right) and z. */
export const PARK = {
  x0: HX + 0.4,
  x1: LOT.x1,
  z0: LOT.z0,
  z1: LOT.z1,
} as const;
export const PARK_CX = (PARK.x0 + PARK.x1) / 2;
export const PARK_CZ = (PARK.z0 + PARK.z1) / 2;

/** The loop path, inset from the park's edge. */
export const LOOP = { x0: PARK.x0 + 0.9, x1: PARK.x1 - 0.9, z0: PARK.z0 + 1.2, z1: PARK.z1 - 1.0, w: 1.0 } as const;
/** The fountain plaza in the middle. */
export const FOUNTAIN = { x: PARK_CX, z: PARK_CZ, r: 2.3 } as const;
/** The playground, at the back of the park; the picnic corner, at the front. */
export const PLAYGROUND = { x: PARK_CX, z: PARK.z0 + 5 } as const;
export const PICNIC = { x: PARK_CX + 1.2, z: PARK.z1 - 4.2 } as const;

/** The benches round the fountain, facing it (where, and which way the sitter faces). */
export const PARK_BENCHES: ReadonlyArray<{ at: V2; facing: number }> = [0, 1, 2, 3].map((k) => {
  const a = Math.PI / 4 + (k * Math.PI) / 2;
  const r = FOUNTAIN.r + 0.55;
  return { at: [FOUNTAIN.x + Math.cos(a) * r, FOUNTAIN.z + Math.sin(a) * r] as V2, facing: Math.atan2(-Math.cos(a), -Math.sin(a)) };
});

/**
 * The park's lamp posts: along both sides of the loop path, and four round the fountain plaza just behind the benches, so
 * whoever sits out on a bench in the evening sits in a pool of lamplight. `height` is where the lamp head hangs.
 */
export const PARK_LAMP_HEIGHT = 2.4;
export const PARK_LAMPS: readonly V2[] = [
  [LOOP.x0 - 0.65, LOOP.z0 + 3],
  [LOOP.x0 - 0.65, PARK_CZ + 4],
  [LOOP.x0 - 0.65, LOOP.z1 - 2],
  [LOOP.x1 + 0.65, LOOP.z0 + 6],
  [LOOP.x1 + 0.65, PARK_CZ - 3],
  [LOOP.x1 + 0.65, LOOP.z1 - 4],
  ...[0, 1, 2, 3].map((k): V2 => {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    return [FOUNTAIN.x + Math.cos(a) * (FOUNTAIN.r + 1.4), FOUNTAIN.z + Math.sin(a) * (FOUNTAIN.r + 1.4)];
  }),
];

/** The two runs of hedge along the front of the park, by the pavement, with the gap for the path in from the street. */
export const HEDGES: ReadonlyArray<{ x0: number; x1: number; z0: number; z1: number }> = [
  { x0: PARK.x0 + 0.4, x1: PARK.x0 + 2.4, z0: PARK.z1 - 0.24, z1: PARK.z1 },
  { x0: PARK.x1 - 4.4, x1: PARK.x1 - 0.4, z0: PARK.z1 - 0.24, z1: PARK.z1 },
];

/**
 * The flowerbeds round the fountain plaza, set off the cross paths: a pair past the plaza's edge at the front and back, and
 * (the park being narrow, with the loop path close by on either side) a smaller pair tucked in at each side, between the
 * benches. `at` is the bed's middle and `size` its side.
 */
export const FLOWERBEDS: ReadonlyArray<{ at: V2; size: number }> = [
  ...[-1, 1].flatMap((sz) => [-1, 1].map((e) => ({ at: [FOUNTAIN.x + e * 0.95, FOUNTAIN.z + sz * (FOUNTAIN.r + 0.7)] as V2, size: 0.8 }))),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((e) => ({ at: [FOUNTAIN.x + sx * 2.3, FOUNTAIN.z + e * 0.95] as V2, size: 0.6 }))),
];

/** The loop as a closed path, for the strollers. */
const LOOP_PATH: V2[] = [
  [LOOP.x0, LOOP.z0],
  [LOOP.x1, LOOP.z0],
  [LOOP.x1, LOOP.z1],
  [LOOP.x0, LOOP.z1],
  [LOOP.x0, LOOP.z0],
];
const LOOP_LEN = pathLength(LOOP_PATH);

/** Where stroller `i` of `n` is on the loop at time `t`: evenly spread, walking at their own easy pace. */
export function strollerAt(i: number, n: number, t: number): { at: V2; heading: number } {
  const pace = 0.75 + (i % 3) * 0.12;
  const d = (((i / n) * LOOP_LEN + t * pace) % LOOP_LEN + LOOP_LEN) % LOOP_LEN;
  const at = pointAlongPath(LOOP_PATH, d);
  const ahead = pointAlongPath(LOOP_PATH, Math.min(LOOP_LEN, d + 0.05));
  return { at, heading: Math.atan2(ahead[0] - at[0], ahead[1] - at[1]) };
}
