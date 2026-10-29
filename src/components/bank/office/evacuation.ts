import type { StationId } from '../../../sim/topology';
import { carParkApproach, ENTRANCES, FLOOR_SLAB, MAIN_GATE, queueMouth, queueSlots, SIDE_DOORS_RIGHT, STATION_POSES, WALK_IN_GATES, type V2 } from './layout3d';

/**
 * Closing time in the 3D office. At 17:00 the branch closes its doors to customers: everyone still queuing at a customer
 * desk gives up their place and walks out, through the nearest way out (a side door in the left wall onto the car park, a
 * side door in the right wall onto the park, or the main entrance at the front), and from then until the next morning
 * those desks have no one queuing. The sidewalk ATMs stay open all night. The simulation's own numbers are untouched:
 * this is the office's picture of the day ending. Pausing never sets anyone walking; only the clock reaching 17:00 does.
 */

/** When the doors close to customers, and when the next day opens (the bank day starts at 08:00). */
export const CLOSING = 17 * 60;
export const isClosed = (minute: number): boolean => minute >= CLOSING;

/** The desks customers queue at in person: the shop gates, the teller and the disputes desk. */
export const CUSTOMER_DESKS: readonly StationId[] = [...WALK_IN_GATES, 'TELLER_CASH', 'DISPUTE_DESK'];

const HX = FLOOR_SLAB.w / 2;
const HZ = FLOOR_SLAB.d / 2;
/** The open strip along the front of the hall, between the last row of queues and the front wall. */
const FRONT_AISLE = HZ - 1.35;

export type ExitKind = 'main' | 'left' | 'right';

/** The side door in the left wall nearest `z`. */
const leftDoor = (z: number): number => ENTRANCES.map((e) => e.at[1]).reduce((best, d) => (Math.abs(d - z) < Math.abs(best - z) ? d : best));

/**
 * The way out for the `k`th person in a desk's queue, standing at `at`: the shop gates' customers out through the left
 * wall's side doors; everyone else along the front of the hall, by turns to the main entrance or to the nearest side door
 * in the right wall. Each route ends a few steps outside.
 */
export function evacuationRoute(id: StationId, at: V2, k: number): { exit: ExitKind; path: V2[] } {
  if (WALK_IN_GATES.includes(id)) {
    // Back down the rope lane and out of its open end first: nobody steps over a rope.
    const d = leftDoor(at[1]);
    const mouth = queueMouth(id).inside;
    // Then out of the side door, across the walkway and back along the car park's footway to their car.
    const toCar = carParkApproach([-HX + 0.3, d], k).reverse();
    return { exit: 'left', path: [at, [at[0], mouth[1]], [-HX + 0.4, mouth[1]], [-HX + 0.4, d], ...toCar] };
  }
  if (k % 2 === 0) return { exit: 'main', path: [at, [at[0], FRONT_AISLE], [MAIN_GATE.x, FRONT_AISLE], [MAIN_GATE.x, HZ + 1.0]] };
  const d = SIDE_DOORS_RIGHT.reduce((best, z) => (Math.abs(z - FRONT_AISLE) < Math.abs(best - FRONT_AISLE) ? z : best));
  return { exit: 'right', path: [at, [at[0], FRONT_AISLE], [HX - 1.2, FRONT_AISLE], [HX - 1.2, d], [HX + 1.2, d]] };
}

/** Everyone queuing at a customer desk when the doors close, with their way out. */
export function evacuees(queueLength: (id: StationId) => number): Array<{ id: StationId; k: number; exit: ExitKind; path: V2[] }> {
  return CUSTOMER_DESKS.flatMap((id) => queueSlots(id, queueLength(id)).map((at, k) => ({ id, k, ...evacuationRoute(id, at, k) })));
}

/** How fast people walk out: unhurried, but they do not dawdle. */
export const EXIT_PACE = 1.3;

/** The desks' own places, for the tests: no desk stands on the main entrance's aisle. */
export const deskSpans = (): Array<{ x0: number; x1: number; z0: number; z1: number }> =>
  Object.values(STATION_POSES).map((p) => ({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 }));
