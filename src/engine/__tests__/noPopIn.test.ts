import { describe, expect, it } from 'vitest';
import { VISIT_3D } from '../plan/deskVisitPaths';
import { arrivalPath, ATM_STATIONS, CUSTOMER_DOOR, STREET, WALK_IN_DESKS, type V2 } from '../plan/layout3d';
import { counterTags, type TagSource } from '../simulation/peopleTags';
import { evacuees, servedExit } from '../world/evacuation';
import { alightPath, ParkingLot, SIZE, slotsOf } from '../world/parking';
import { stepSeconds } from '../../store/deskVisitStore';
import { VISIT_DESKS } from '../../sim/deskVisit';
import { crowdStatus } from '../../sim/deskCrowd';

/** Off the drawn street: where people come from and go to, never a spot in the middle of the map. */
const offStreet = (p: V2): boolean => Math.abs(p[0]) > STREET.halfWidth;

describe('nobody appears or vanishes in the middle of the 3D office', () => {
  it('walks every counter and ATM customer in from beyond the end of the street, by the side door or the main gate', () => {
    for (const id of [...WALK_IN_DESKS, ...ATM_STATIONS]) {
      for (let q = 0; q < 5; q++) for (const o of ['street', 'gate'] as const) expect(offStreet(arrivalPath(id, q, o)[0]!), `${id} ${o} ${q}`).toBe(true);
    }
  });

  it('walks everyone served, and everyone leaving at closing, off beyond the end of the street', () => {
    for (const id of [...WALK_IN_DESKS, ...ATM_STATIONS]) for (let k = 0; k < 3; k++) expect(offStreet(servedExit(id, k).at(-1)!), `${id} ${k}`).toBe(true);
    for (const e of evacuees(() => 6)) expect(offStreet(e.path.at(-1)!), `${e.id} #${e.k} by ${e.exit}`).toBe(true);
  });

  it('brings the desk visits’ customers in from the street and back off it; their officers come from behind the counter', () => {
    for (const desk of VISIT_DESKS) {
      const geo = VISIT_3D[desk];
      for (let place = 0; place < 3; place++) expect(offStreet(geo.walkIn(place)[0]!), `${desk} in ${place}`).toBe(true);
      expect(offStreet(geo.walkOut.at(-1)!), `${desk} out`).toBe(true);
      // Long enough to walk in from the street, short enough for a demo.
      expect(stepSeconds({ desk, customers: 2, officer: true, delay: 0, work: 'close' })).toBeLessThan(60);
    }
    for (const desk of ['SAVINGS_DESK', 'COLLATERAL_VAULT', 'BNPL'] as const) expect(offStreet(VISIT_3D[desk].officerIn[0]!), desk).toBe(false);
  });
});

describe('getting in and out of a car at its side, never its boot', () => {
  it('starts every driver’s walk at their door: beside the vehicle, within its length, in the gap to the next bay', () => {
    for (const s of slotsOf()) {
      const [door, tail] = alightPath(s);
      const { len, wid } = SIZE[s.kind];
      expect(Math.abs(door![0] - s.x), `bay ${s.index}`).toBeLessThan(len / 2);
      expect(Math.abs(door![1] - s.z)).toBeGreaterThan(wid / 2);
      // Then round its tail to the footway.
      expect(Math.abs(tail![0] - s.x)).toBeGreaterThan(len / 2);
    }
  });

  it('lets a passenger out of a car standing parked, or says there is none', () => {
    const lot = new ParkingLot(0.6);
    const parked = lot.vehicles.filter((v) => v.phase === 'parked' && v.kind === 'car');
    expect(parked.length).toBeGreaterThan(0);
    const path = lot.alight(3)!;
    expect(parked.map((v) => alightPath(lot.slots[v.slot]!)[0])).toContainEqual(path[0]);
    expect(new ParkingLot(0).alight(0)).toBeNull();
    // Their walk goes on down the footway and in at the side door.
    expect(arrivalPath('TELLER_CASH', 1, { car: path })).toContainEqual(CUSTOMER_DOOR);
  });
});

describe('the status over a counter customer’s head', () => {
  const source = (served: Array<{ state: 'walking' | 'interacting' | 'turning' | 'departing' | 'gone' }>, head: boolean): TagSource => ({
    arrivals: { poses: [{ x: 1, z: 1, yaw: 0, visible: true }, { x: 0, z: 0, yaw: 0, visible: false }] },
    line: () => ({
      figures: [{ x: 0, z: 0, yaw: 0, visible: head }],
      servedPoses: new Map(served.map((s, i) => [i, { at: [i, i] as V2, yaw: 0, walking: false, busy: s.state === 'interacting', state: s.state }])),
    }),
  });

  it('tags the walking-in as arriving, the one at the counter as processing, the served as done, the gone not at all', () => {
    const tags = counterTags(source([{ state: 'turning' }, { state: 'gone' }], true), 20, ['TELLER_CASH']);
    expect(tags.map((t) => t.status).sort()).toEqual(['arriving', 'done', 'processing']);
    // Someone late at the counter: they are the one processing, the head of the line waits.
    const late = counterTags(source([{ state: 'interacting' }], true), 20, ['TELLER_CASH']);
    expect(late.map((t) => t.status)).toEqual(['processing', 'arriving', 'waiting']);
    expect(counterTags(source([{ state: 'departing' }], true), 2, ['TELLER_CASH']).map((t) => t.status)).toEqual(['processing', 'arriving']);
  });

  it('labels the 2D line the same way: movers and the head only', () => {
    expect(crowdStatus({ leaving: true, arriving: false, serving: false, place: 0 })).toBe('done');
    expect(crowdStatus({ leaving: false, arriving: true, serving: false, place: 2 })).toBe('arriving');
    expect(crowdStatus({ leaving: false, arriving: false, serving: true, place: 0 })).toBe('processing');
    expect(crowdStatus({ leaving: false, arriving: false, serving: false, place: 0 })).toBe('waiting');
    expect(crowdStatus({ leaving: false, arriving: false, serving: true, place: 1 })).toBeNull();
  });
});
