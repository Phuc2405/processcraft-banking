import type { StationId } from '../../../sim/topology';
import { carParkApproach, CUSTOMER_DOOR, FLOOR_SLAB, FRONT_AISLE_Z, LEFT_WALK_X, MAIN_GATE, queueSlots, SIDE_DOORS_RIGHT, STATION_POSES, WALK_IN_DESKS, type V2 } from './layout3d';

/**
 * Closing time in the 3D office. At 17:00 the branch closes its doors to customers: everyone still queuing at a customer
 * desk gives up their place and walks out (through a side door in the left wall back to the car park, a side door in the
 * right wall onto the park, or the main entrance at the front), and from then until the next morning no customer is inside
 * at all: the night's desks are worked by the bank's own staff and systems only. The sidewalk ATMs stay open all night. The simulation's own numbers are untouched:
 * this is the office's picture of the day ending. Pausing never sets anyone walking; only the clock reaching 17:00 does.
 */

/** When the doors close to customers, and when the next day opens (the bank day starts at 08:00). */
export const CLOSING = 17 * 60;
export const isClosed = (minute: number): boolean => minute >= CLOSING;

/** The desks customers queue at in person, inside the branch: the teller and the disputes desk. */
export const CUSTOMER_DESKS: readonly StationId[] = WALK_IN_DESKS;

const HX = FLOOR_SLAB.w / 2;
const HZ = FLOOR_SLAB.d / 2;

export type ExitKind = 'main' | 'left' | 'right';

/**
 * The way out for the `k`th person in a desk's queue, standing at `at`: by turns, along the clear aisle at the front of the
 * hall to the main entrance, to the nearest side door in the right wall onto the park, or back the way the car park's
 * customers came in (along the inside of the left wall, out of the side door, across the walkway and back along the car
 * park's footway to their car). Each route ends a few steps outside.
 */
export function evacuationRoute(at: V2, k: number): { exit: ExitKind; path: V2[] } {
  const front: V2 = [at[0], FRONT_AISLE_Z];
  if (k % 3 === 2) {
    const door = CUSTOMER_DOOR;
    const toCar = carParkApproach([-HX + 0.3, door[1]], k).reverse();
    return { exit: 'left', path: [at, front, [LEFT_WALK_X, FRONT_AISLE_Z], [LEFT_WALK_X, door[1]], ...toCar] };
  }
  if (k % 3 === 0) return { exit: 'main', path: [at, front, [MAIN_GATE.x, FRONT_AISLE_Z], [MAIN_GATE.x, HZ + 1.0]] };
  const d = SIDE_DOORS_RIGHT.reduce((best, z) => (Math.abs(z - FRONT_AISLE_Z) < Math.abs(best - FRONT_AISLE_Z) ? z : best));
  return { exit: 'right', path: [at, front, [HX - 1.2, FRONT_AISLE_Z], [HX - 1.2, d], [HX + 1.2, d]] };
}

/** Everyone queuing at a customer desk when the doors close, with their way out. */
export function evacuees(queueLength: (id: StationId) => number): Array<{ id: StationId; k: number; exit: ExitKind; path: V2[] }> {
  return CUSTOMER_DESKS.flatMap((id) => queueSlots(id, queueLength(id)).map((at, k) => ({ id, k, ...evacuationRoute(at, k) })));
}

/** How fast people walk out: unhurried, but they do not dawdle. */
export const EXIT_PACE = 1.3;

/** The desks' own places, for the tests: no desk stands on the main entrance's aisle. */
export const deskSpans = (): Array<{ x0: number; x1: number; z0: number; z1: number }> =>
  Object.values(STATION_POSES).map((p) => ({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 }));
