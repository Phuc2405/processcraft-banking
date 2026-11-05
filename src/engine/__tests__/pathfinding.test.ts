/**
 * Obstacle-aware walking: every route anyone walks in the 3D office (in from the street, the gate or a parked car; out after being
 * served; out at closing; to and from a car's bay; the CIT crew and the vault's staff) keeps to the walks, crossings, footways and
 * aisles. Each route is sampled every 5 cm against the scenery a person cannot walk through: the hedges, the park's flowerbeds and
 * fountain, the car park's tree strip, the guard cabins, the desks, and every parked bay but the walker's own.
 */
import { describe, expect, it } from 'vitest';
import { pathLength, pointAlongPath } from '../plan/path';
import { ATM_STATIONS, FRONT_AISLE_Z, GUARD_CABIN, lobbyWalkIn, MAIN_GATE, queueSlots, STATION_POSES, WALK_IN_DESKS, type V2 } from '../plan/layout3d';
import { routesFor } from '../simulation/routes';
import { CREW_PATH, CORRIDOR } from '../world/citRun';
import { evacuationRoute } from '../world/evacuation';
import { PARKING_CABIN } from '../world/guardCabin';
import { PARK_EXIT } from '../world/parkLife';
import { FLOWERBEDS, FOUNTAIN, HEDGES } from '../world/parkPlan';
import { alightPath, LOT_HEDGES, SIZE, slotRoutes, slotsOf, TREE_STRIP, LOT, LOT_SIDE } from '../world/parking';

type Box = { name: string; x0: number; x1: number; z0: number; z1: number };
const box = (name: string, x: number, z: number, w: number, d: number): Box => ({ name, x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
const mirror = (b: { x0: number; x1: number }): { x0: number; x1: number } => (LOT_SIDE < 0 ? { x0: -b.x1, x1: -b.x0 } : b);

/** What a person cannot walk through, shrunk by a body's half-width tolerance (the walks run right beside some of it). */
const SCENERY: readonly Box[] = [
  ...LOT_HEDGES.map((h, i) => ({ name: `car-park hedge ${i}`, ...mirror(h), z0: h.z0, z1: h.z1 })),
  ...HEDGES.map((h, i) => ({ name: `park hedge ${i}`, ...h })),
  ...FLOWERBEDS.map((f, i) => box(`flowerbed ${i}`, f.at[0], f.at[1], f.size, f.size)),
  box('fountain', FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r * 1.4, FOUNTAIN.r * 1.4),
  { name: 'tree strip', ...mirror({ x0: TREE_STRIP.x0 + 0.05, x1: TREE_STRIP.x1 }), z0: LOT.z0, z1: LOT.z1 },
  box('front guard cabin', GUARD_CABIN.x, GUARD_CABIN.z, GUARD_CABIN.w, GUARD_CABIN.d),
  box('car-park guard cabin', PARKING_CABIN.x, PARKING_CABIN.z, PARKING_CABIN.w, PARKING_CABIN.d),
  ...Object.entries(STATION_POSES).map(([id, p]) => box(`desk ${id}`, p.x, p.z, p.w - 0.1, p.d - 0.1)),
];

/** Every bay of the car park as the vehicle parked in it, nose to tail. */
const BAYS = slotsOf().map((s) => {
  const { len, wid } = SIZE[s.kind];
  const along = Math.abs(Math.cos(s.yaw)) > 0.5;
  return { slot: s.index, ...box(`bay ${s.index}`, s.x, s.z, (along ? len : wid) - 0.1, (along ? wid : len) - 0.1) };
});

const inside = (p: V2, b: Box): boolean => p[0] > b.x0 && p[0] < b.x1 && p[1] > b.z0 && p[1] < b.z1;

/** The obstacles a route runs into, sampled every 5 cm; `own` is the walker's own bay (they start or end in it). */
function hits(path: readonly V2[], own: number | null = null): string[] {
  const len = pathLength(path);
  const out = new Set<string>();
  for (let d = 0; d <= len; d += 0.05) {
    const p = pointAlongPath(path, d);
    for (const b of SCENERY) if (inside(p, b)) out.add(`${b.name} at [${p[0].toFixed(2)}, ${p[1].toFixed(2)}]`);
    for (const b of BAYS) if (b.slot !== own && inside(p, b)) out.add(`${b.name} at [${p[0].toFixed(2)}, ${p[1].toFixed(2)}]`);
  }
  return [...out];
}

describe('obstacle-aware walking routes', () => {
  it('the car park’s front hedge has a gap where the footway meets the pavement, and the park’s where its path does', () => {
    expect(LOT_HEDGES.length).toBe(2);
    expect(HEDGES.length).toBe(2);
  });

  it.each(WALK_IN_DESKS.map((id) => [id]))('customers of %s walk in from the street, the gate or a parked car and out again around everything', (id) => {
    const cars = slotsOf().filter((s) => s.kind === 'car');
    for (let place = 0; place < 5; place++) {
      expect(hits(routesFor(id).approach(place)), `${id} from the street, place ${place}`).toEqual([]);
      expect(hits(routesFor(id).approach(place, 'gate')), `${id} from the gate, place ${place}`).toEqual([]);
      const car = cars[(place * 5) % cars.length]!;
      expect(hits(routesFor(id).approach(place, { car: alightPath(car) }), car.index), `${id} from bay ${car.index}`).toEqual([]);
      expect(hits(routesFor(id).depart(place)), `${id} leaving from place ${place}`).toEqual([]);
    }
  });

  it.each(ATM_STATIONS.map((id) => [id]))('customers of the %s ATM walk to it and off down the pavement around everything', (id) => {
    for (let place = 0; place < 5; place++) {
      expect(hits(routesFor(id).approach(place)), `approach ${place}`).toEqual([]);
      expect(hits(routesFor(id).depart(place)), `depart ${place}`).toEqual([]);
    }
  });

  it('everyone sent out at closing time takes the walks out of all three exits', () => {
    for (const id of WALK_IN_DESKS) queueSlots(id, 6).forEach((at, k) => expect(hits(evacuationRoute(at, k).path), `${id} #${k} via ${evacuationRoute(at, k).exit}`).toEqual([]));
    expect(hits(PARK_EXIT)).toEqual([]);
  });

  it('drivers walk between their bay and the branch, and passengers out of a parked car, without crossing anyone else’s bay', () => {
    for (const s of slotsOf()) {
      expect(hits(slotRoutes(s).walk, s.index), `driver of bay ${s.index}`).toEqual([]);
      if (s.kind === 'car') expect(hits(alightPath(s), s.index), `passenger of bay ${s.index}`).toEqual([]);
    }
  });

  it('people dropped at the kerb walk in at the main gate around the guard cabin', () => {
    for (const x of [-12, -6, MAIN_GATE.x, 2, 9]) expect(hits(lobbyWalkIn(x)), `from x ${x}`).toEqual([]);
  });

  it('the CIT crew and the vault’s staff keep to the bay walkway, the left wall and the front aisle', () => {
    expect(hits(CREW_PATH)).toEqual([]);
    expect(hits(CORRIDOR)).toEqual([]);
    for (const [, z] of CORRIDOR.slice(2, 4)) expect(z).toBe(FRONT_AISLE_Z);
  });
});
