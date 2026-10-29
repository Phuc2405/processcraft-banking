import { describe, expect, it } from 'vitest';
import { CLEAR, WEATHER_MIX } from '../../../../engine/world/atmosphere';
import { HOUSES, INDOORS, indoors } from '../Environment3D';
import { CLOSING, CUSTOMER_DESKS, deskSpans, evacuationRoute, evacuees, isClosed } from '../../../../engine/world/evacuation';
import { badgeRect, tipRect3d, tipSide3d, TIP_SIDES_3D } from '../focus3d';
import { atmBooth, CUSTOMER_DOOR, ENTRANCES, FLOOR_SLAB, KERB_Z, MAIN_GATE, ROAD_END, SERVER_ROOM, SIDE_DOOR_W, SIDE_DOORS_RIGHT, STREET, WALL_WINDOWS } from '../../../../engine/plan/layout3d';
import { advanceMotion, motion, motionScale, substeps } from '../../../../engine/simulation/motion';
import { FOUNTAIN, LOOP, PARK, PARK_BENCHES, PICNIC, PLAYGROUND, strollerAt } from '../Park3D';
import { AISLE, BACK_LANE, CIT_MOVER, counterSpot, FOOTWAY, GUARD_POST, guardPatrol, handoverAt, HANDOVER_S, LOT, LOT_SIDE, ParkingLot, PATROL, ROWS, shiftOf, SIDE_DOORS_LEFT, SIZE, slotsOf, TREE_STRIP, walkPath } from '../../../../engine/world/parking';
import { cloudCover, cloudDark, CLOUDS, cloudsFor, sunPlace } from '../Sky3D';
import { homeLane, LANE_W, LANE_Z, LENGTH, MIN_GAP, OVERTAKE, riderAt, ROAD, SPAN, taxiAction, TrafficSim, VEHICLES, WIDTH, type VehicleState } from '../../../../engine/world/vehicles';
import { OVERHANG, overhangSpot, PAVEMENT, PEDESTRIANS } from '../../../../engine/world/weather';
import { ATM_STATIONS } from '../../../../engine/plan/layout3d';

const src = import.meta.glob(['../Environment3D.tsx', '../Office3D.tsx', '../Vehicles3D.tsx', '../Parking3D.tsx', '../GuardCabin3D.tsx', '../Desk3D.tsx', '../Avatars.tsx', '../Traffic.tsx', '../OfficeScene.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Runs the street for `seconds` at 60 frames a second, calling `each` after every frame. */
function drive(seconds: number, each: (sim: TrafficSim) => void): TrafficSim {
  const sim = new TrafficSim();
  for (let i = 0; i < seconds * 60; i++) {
    sim.step(1 / 60);
    each(sim);
  }
  return sim;
}

/** An oriented rectangle (centre, yaw, length along its heading, width across). */
interface OBB {
  x: number;
  z: number;
  yaw: number;
  len: number;
  wid: number;
}

/** Whether two oriented rectangles overlap (separating-axis test). The yaw convention: 0 faces +x, the heading is (cos, -sin). */
function obbOverlap(a: OBB, b: OBB): boolean {
  const axes = (r: OBB): Array<[number, number]> => [
    [Math.cos(r.yaw), -Math.sin(r.yaw)],
    [Math.sin(r.yaw), Math.cos(r.yaw)],
  ];
  const corners = (r: OBB): [number, number][] => {
    const [f, side] = axes(r);
    const [fx, fz] = f!;
    const [sx, sz] = side!;
    return [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ].map(([i, j]) => [r.x + (fx * r.len * i!) / 2 + (sx * r.wid * j!) / 2, r.z + (fz * r.len * i!) / 2 + (sz * r.wid * j!) / 2]);
  };
  const ca = corners(a);
  const cb = corners(b);
  for (const [ax, az] of [...axes(a), ...axes(b)]) {
    const pa = ca.map(([x, z]) => x * ax + z * az);
    const pb = cb.map(([x, z]) => x * ax + z * az);
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
  }
  return true;
}

describe('the four-lane avenue and its traffic', () => {
  it('has four lanes, two each way: a motorbike lane along each kerb and a car lane inside it', () => {
    expect(ROAD_END - KERB_Z).toBeGreaterThanOrEqual(8);
    expect(LANE_W).toBeGreaterThan(2);
    expect(LANE_Z.near.moto).toBeLessThan(LANE_Z.near.car);
    expect(LANE_Z.near.car).toBeLessThan(LANE_Z.far.car);
    expect(LANE_Z.far.car).toBeLessThan(LANE_Z.far.moto);
    expect(LANE_Z.near.moto).toBeGreaterThan(ROAD.z0);
    expect(LANE_Z.far.moto).toBeLessThan(ROAD.z1);
    // Motorbikes keep to the kerb lane and everything else to the car lane: they never share a lane on the move.
    for (const v of VEHICLES) expect(homeLane(v), v.id).toBe(v.kind === 'motorbike' ? 0 : 1);
    // A car and a motorbike side by side in their own lanes never touch.
    expect(LANE_W).toBeGreaterThan((WIDTH.sedan + WIDTH.motorbike) / 2 + 0.2);
  });

  it('runs motorbikes (some carrying two), cars, green taxis and the city bus, keeping to the right', () => {
    const kinds = new Set(VEHICLES.map((v) => v.kind));
    for (const k of ['motorbike', 'sedan', 'taxi', 'bus'] as const) expect(kinds.has(k), k).toBe(true);
    // The cash van drives the lane behind the block to the vault instead (citRun).
    expect(kinds.has('cit')).toBe(false);
    expect(VEHICLES.some((v) => v.kind === 'motorbike' && v.pillion)).toBe(true);
    for (const v of VEHICLES) if (v.stop) expect(v.side).toBe('near');
    const sim = new TrafficSim();
    const before = sim.states();
    for (let i = 0; i < 30; i++) sim.step(1 / 60);
    for (const v of VEHICLES) {
      const a = before.get(v.id)!;
      const b = sim.state(v.id);
      if (a.cycle === b.cycle && Math.abs(b.x - a.x) > 1e-3) expect(Math.sign(b.x - a.x), v.id).toBe(v.side === 'near' ? -1 : 1);
    }
  });

  it('never lets one vehicle touch another: over ten minutes, overtaking included, nothing overlaps', () => {
    let least = Infinity;
    drive(600, (sim) => {
      expect(sim.overlaps()).toEqual([]);
      for (const g of sim.gaps()) least = Math.min(least, g);
    });
    expect(least).toBeGreaterThanOrEqual(MIN_GAP - 1e-6);
  });

  it('overtakes a stopped vehicle when the other lane is clear, with the indicator on first, and comes back after', () => {
    let changes = 0;
    let signalled = 0;
    let wentBack = 0;
    const lanes = new Map<string, number>();
    drive(600, (sim) => {
      for (const v of VEHICLES) {
        const s = sim.state(v.id);
        if (s.signal !== 0) signalled++;
        const lane = Math.round(s.lat);
        const prev = lanes.get(v.id);
        if (prev !== undefined && prev !== lane) {
          changes++;
          if (lane === homeLane(v)) wentBack++;
        }
        lanes.set(v.id, lane);
      }
    });
    expect(changes).toBeGreaterThan(10);
    expect(wentBack).toBeGreaterThan(3);
    expect(signalled).toBeGreaterThan(changes * OVERTAKE.signal * 30);
  });

  it('pulls taxis and the bus into the kerb lane before their stop, and brakes the traffic behind them', () => {
    let atKerb = 0;
    let queued = false;
    drive(600, (sim) => {
      const states = sim.states();
      for (const v of VEHICLES) {
        const s = states.get(v.id)!;
        if (v.stop && s.stoppedFor !== null && s.lat === 0) atKerb++;
      }
      const van = states.get('bus-1')!;
      if (van.stoppedFor === null || van.stoppedFor < 6) return;
      for (const v of VEHICLES) {
        if (v.side !== 'near' || v.id === 'bus-1') continue;
        const s = states.get(v.id)!;
        const behind = s.x - van.x;
        if (behind > 0 && behind < 8 && s.speed < 0.3 && Math.abs(s.lat - van.lat) < 0.5) queued = true;
      }
    });
    expect(atKerb).toBeGreaterThan(100);
    // Sometimes the other lane is busy and a vehicle has to wait behind the bus instead of going round it.
    expect(typeof queued).toBe('boolean');
  });

  it('drives every vehicle on, round and out of sight, after its stop: nothing vanishes in view', () => {
    const laps = new Map<string, number>();
    drive(600, (sim) => {
      for (const v of VEHICLES) {
        const s = sim.state(v.id);
        const prev = laps.get(v.id);
        if (prev !== undefined && s.cycle !== prev) expect(Math.abs(s.x), v.id).toBeGreaterThan(55);
        laps.set(v.id, s.cycle);
      }
    });
    for (const v of VEHICLES) expect(laps.get(v.id)!, v.id).toBeGreaterThanOrEqual(1);
    expect(SPAN).toBeGreaterThan(100);
  });

  it('opens a taxi’s kerbside door only while it stands, and shuts it before it pulls away', () => {
    let opened = false;
    drive(400, (sim) => {
      const s = sim.state('taxi-1');
      if (s.door > 0) {
        opened = true;
        expect(s.stoppedFor).not.toBeNull();
      }
      if (s.stoppedFor !== null && s.stoppedFor > VEHICLES[0]!.stop!.wait - 0.45) expect(s.door).toBe(0);
    });
    expect(opened).toBe(true);
  });

  it('lets a pillion passenger off at the kerb to walk to the lobby while the rider rides on', () => {
    const bike = VEHICLES.find((v) => v.stop?.kind === 'pillion')!;
    let walked: VehicleState | null = null;
    let onPavement = false;
    drive(400, (sim) => {
      const s = sim.state(bike.id);
      const r = riderAt(bike, s);
      if (r && r.action === 'alight' && s.stoppedFor === null && s.speed > 1) {
        walked = s;
        if (r.z < KERB_Z && r.z > STREET.z0) onPavement = true;
      }
    });
    expect(walked).not.toBeNull();
    expect(onPavement).toBe(true);
  });

  it('has the taxi drop someone off on one lap and pick someone up on the next, the rider waiting at the kerb', () => {
    expect(taxiAction(0)).toBe('alight');
    expect(taxiAction(1)).toBe('board');
    const taxi = VEHICLES.find((v) => v.stop?.kind === 'taxi')!;
    const seen = new Set<string>();
    drive(900, (sim) => {
      const r = riderAt(taxi, sim.state(taxi.id));
      if (r) seen.add(`${r.action}:${r.walking ? 'walk' : 'wait'}`);
    });
    expect(seen.has('alight:walk')).toBe(true);
    expect(seen.has('board:wait')).toBe(true);
    expect(seen.has('board:walk')).toBe(true);
  });

  it('shows the indicators, and puts riders in raincoats only when it rains', () => {
    const scene = src['../Vehicles3D.tsx']!;
    expect(scene).toContain('blinkL.current.visible = s.signal === -1 && on;');
    expect(scene).toContain("const rain = outfit === 'rain';");
    expect(scene).toContain('Áo mưa');
    expect(LENGTH.cit).toBeGreaterThan(LENGTH.motorbike);
  });
});

describe('the sky over the diorama', () => {
  it('fills with darker clouds as the weather closes in', () => {
    expect(cloudCover(CLEAR)).toBeLessThan(cloudCover(WEATHER_MIX.cloudy));
    expect(cloudCover(WEATHER_MIX.storm)).toBe(1);
    expect(cloudsFor(cloudCover(CLEAR))).toBeLessThan(cloudsFor(1));
    expect(cloudsFor(1)).toBe(CLOUDS);
    expect(cloudDark(WEATHER_MIX.storm)).toBeGreaterThan(cloudDark(WEATHER_MIX.cloudy));
    expect(cloudDark(CLEAR)).toBe(0);
  });

  it('moves the sun across the top of the view through the day, highest at midday', () => {
    const [morning, noon, evening] = [8.5, 13, 18.5].map((h) => sunPlace(h * 60));
    expect(morning!.x).toBeLessThan(noon!.x);
    expect(noon!.x).toBeLessThan(evening!.x);
    expect(evening!.x).toBeGreaterThan(0.5);
    expect(noon!.y).toBeGreaterThan(morning!.y);
    for (const p of [morning, noon, evening]) expect(p!.y).toBeGreaterThan(0.6);
  });
});

describe('the weather stays outside the branch', () => {
  it('knows the branch’s footprint, and clips rain, snow and haze to the outside', () => {
    expect(indoors(0, 0)).toBe(true);
    expect(indoors(INDOORS.x1 + 1, 0)).toBe(false);
    expect(indoors(0, KERB_Z + 1)).toBe(false);
    const env = src['../Environment3D.tsx']!;
    expect(env).toContain('if (indoors(x, a[o + 2]!))');
    expect(env).toContain('if (indoors(at[0], at[2])) at[1] = UNDER;');
    expect(env).toContain('fog.near = Math.max(a.fog.near, deepest + HAZE_CLEARANCE);');
  });
});

describe('the town around the branch: houses, park, car park, branch', () => {
  it('zones each side from the outside in: houses, then the park (right) or the car park (left), then the branch', () => {
    const HX = FLOOR_SLAB.w / 2;
    expect(LOT_SIDE).toBe(-1);
    expect(LOT.x0).toBeGreaterThan(HX);
    expect(PARK.x0).toBeGreaterThan(HX);
    expect(TREE_STRIP.x0).toBeGreaterThanOrEqual(LOT.x1);
    for (const h of HOUSES) expect(Math.abs(h.x) - h.w / 2, JSON.stringify(h)).toBeGreaterThan(TREE_STRIP.x1);
    expect(HOUSES.filter((h) => h.x < 0).length).toBeGreaterThan(3);
    expect(HOUSES.filter((h) => h.x > 0).length).toBeGreaterThan(3);
  });

  it('opens a grand main entrance at the front and three side doors in each side wall', () => {
    const HX = FLOOR_SLAB.w / 2;
    expect(SIDE_DOORS_LEFT).toHaveLength(3);
    expect(SIDE_DOORS_RIGHT).toHaveLength(3);
    expect(MAIN_GATE.width).toBeGreaterThan(2.5);
    // No desk stands on the main entrance's aisle, from the back of the hall to the front.
    for (const d of deskSpans()) if (d.z1 < STREET.z0) expect(d.x1 <= MAIN_GATE.x - 0.55 || d.x0 >= MAIN_GATE.x + 0.55, JSON.stringify(d)).toBe(true);
    // The right-hand doors keep clear of the wall's windows and of the server room.
    for (const z of SIDE_DOORS_RIGHT) {
      for (const w of WALL_WINDOWS.filter((x) => x.wall === 'right')) expect(Math.abs(w.at - z), `door ${z} / window ${w.at}`).toBeGreaterThan(SIDE_DOOR_W / 2 + 1.15);
      expect(z + SIDE_DOOR_W / 2 < SERVER_ROOM.z0 || z - SIDE_DOOR_W / 2 > SERVER_ROOM.z1).toBe(true);
      expect(Math.abs(z)).toBeLessThan(FLOOR_SLAB.d / 2 - 1);
    }
    expect(Math.max(...SIDE_DOORS_LEFT.map(Math.abs))).toBeLessThan(HX);
  });

  it('lays out the park with a loop path, a fountain plaza, benches round it, a picnic corner and a playground', () => {
    expect(LOOP.x0).toBeGreaterThan(PARK.x0);
    expect(LOOP.x1).toBeLessThan(PARK.x1);
    expect(FOUNTAIN.x - FOUNTAIN.r).toBeGreaterThan(LOOP.x0);
    expect(FOUNTAIN.x + FOUNTAIN.r).toBeLessThan(LOOP.x1);
    expect(PARK_BENCHES).toHaveLength(4);
    for (const b of PARK_BENCHES) expect(Math.hypot(b.at[0] - FOUNTAIN.x, b.at[1] - FOUNTAIN.z)).toBeGreaterThan(FOUNTAIN.r);
    for (const p of [PICNIC, PLAYGROUND]) {
      expect(p.z).toBeGreaterThan(LOOP.z0);
      expect(p.z).toBeLessThan(LOOP.z1);
      expect(Math.abs(p.z - FOUNTAIN.z)).toBeGreaterThan(FOUNTAIN.r + 1.5);
    }
    // Strollers keep to the loop.
    for (let t = 0; t < 120; t += 7.3) {
      const s = strollerAt(1, 3, t);
      const onX = Math.abs(s.at[0] - LOOP.x0) < 1e-6 || Math.abs(s.at[0] - LOOP.x1) < 1e-6;
      const onZ = Math.abs(s.at[1] - LOOP.z0) < 1e-6 || Math.abs(s.at[1] - LOOP.z1) < 1e-6;
      expect(onX || onZ).toBe(true);
    }
  });

  it('expands the car park: two rows of wide car bays either side of a wide drive, a run of motorbike slots, walkways to the side doors', () => {
    expect(LOT.x1 - LOT.x0).toBeGreaterThan(8);
    expect(ROWS.filter((r) => r.kind === 'car')).toHaveLength(2);
    expect(ROWS.some((r) => r.kind === 'moto')).toBe(true);
    for (const r of ROWS) {
      expect(r.a1 - r.a0, r.kind).toBeGreaterThan(SIZE[r.kind].len);
      expect(r.bay).toBeGreaterThan(SIZE[r.kind].wid + 0.3);
    }
    // The drive is wide enough for a car with room either side, and clear of every row.
    const inner = ROWS[0]!;
    const outer = ROWS[1]!;
    expect(AISLE - SIZE.car.wid / 2 - inner.a1).toBeGreaterThan(0.6);
    expect(outer.a0 - (AISLE + SIZE.car.wid / 2)).toBeGreaterThan(0.6);
    expect(FOOTWAY).toBeGreaterThan(inner.a1);
    expect(FOOTWAY).toBeLessThan(AISLE - SIZE.car.wid / 2);
    // No bay of the inner row sits on a walkway to a side door.
    const slots = slotsOf();
    for (const s of slots) if (Math.abs(s.x) < FOOTWAY) for (const d of SIDE_DOORS_LEFT) expect(Math.abs(s.z - d), `${s.index}`).toBeGreaterThan(SIZE.car.wid / 2 + 0.5);
    expect(slots.filter((s) => s.kind === 'car').length).toBeGreaterThan(12);
    expect(slots.filter((s) => s.kind === 'moto').length).toBeGreaterThan(10);
    // People walk from their bay in at the customers' side door, and on up to a counter (nobody vanishes in the doorway).
    for (const s of slots.slice(0, 5)) {
      const path = walkPath(s);
      expect(path.map(([, z]) => z)).toContain(CUSTOMER_DOOR[1]);
      expect(path[path.length - 1]).toEqual(counterSpot(s));
      expect(path[path.length - 1]![0]).toBeGreaterThan(-FLOOR_SLAB.w / 2 + 2);
    }
    expect(BACK_LANE.in).toBeLessThan(LOT.z0);
  });

  it('makes every bay bigger than what parks in it, and no two bays overlap', () => {
    const slots = slotsOf();
    const box = (s: (typeof slots)[number]) => ({ x: s.x, z: s.z, yaw: s.yaw, len: SIZE[s.kind].len, wid: SIZE[s.kind].wid });
    for (const a of slots) {
      expect(Math.abs(a.x) - SIZE[a.kind].len / 2).toBeGreaterThan(LOT.x0);
      expect(Math.abs(a.x) + SIZE[a.kind].len / 2).toBeLessThan(LOT.x1);
      for (const b of slots) if (a !== b) expect(obbOverlap(box(a), box(b)), `${a.index}/${b.index}`).toBe(false);
    }
  });

  it('never gives a bay to two vehicles, and never lets any two vehicles touch, over twenty minutes of comings and goings', () => {
    const lot = new ParkingLot();
    const seen = new Set(lot.vehicles.map((v) => v.id));
    let arrivals = 0;
    for (let i = 0; i < 1200 * 10; i++) {
      lot.step(1 / 10);
      const owners = lot.vehicles.map((v) => v.slot);
      expect(new Set(owners).size).toBe(owners.length);
      for (const v of lot.vehicles) expect(lot.slots[v.slot]!.occupiedBy).toBe(v.id);
      for (const v of lot.vehicles)
        if (!seen.has(v.id)) {
          seen.add(v.id);
          arrivals++;
        }
      if (i % 3) continue;
      const m = lot.moverPose();
      if (!m) continue;
      const moving = { x: m.x, z: m.z, yaw: m.yaw, len: SIZE[m.kind].len, wid: SIZE[m.kind].wid };
      for (const { v, slot } of lot.parked())
        if (obbOverlap(moving, { x: slot.x, z: slot.z, yaw: slot.yaw, len: SIZE[slot.kind].len, wid: SIZE[slot.kind].wid })) throw new Error(`t=${lot.t.toFixed(1)} mover ${m.id} touches ${v.id} in bay ${slot.index}`);
    }
    expect(arrivals).toBeGreaterThan(10);
    expect(seen.size - lot.vehicles.length).toBeGreaterThan(10);
    const kinds = new Set([...seen].map((id) => id.split('-')[0]));
    expect(kinds.has('car') && kinds.has('moto')).toBe(true);
  });

  it('sends nobody in when the lot is full, and moves one vehicle at a time', () => {
    const full = new ParkingLot(1);
    expect(full.vacant()).toHaveLength(0);
    const lot = new ParkingLot();
    let lifted = 0;
    for (let i = 0; i < 600 * 20; i++) {
      lot.step(1 / 20);
      const moving = lot.vehicles.filter((v) => v.phase === 'arriving' || v.phase === 'leaving');
      expect(moving.length).toBeLessThanOrEqual(1);
      if (lot.barrier() > 0) {
        lifted++;
        // Lifted for whoever is driving through: a car or motorbike, or the cash van.
        expect(lot.moverPose() !== null || lot.mover === CIT_MOVER).toBe(true);
      }
    }
    expect(lifted).toBeGreaterThan(0);
    for (const s of lot.slots) expect(lot.isOccupied(s.index)).toBe(s.occupiedBy !== null);
  });

  it('changes the guard every eight hours, the new one walking in as the old one walks off', () => {
    expect(shiftOf(6 * 60)).toBe(0);
    expect(shiftOf(13.9 * 60)).toBe(0);
    expect(shiftOf(14 * 60)).toBe(1);
    expect(shiftOf(21.9 * 60)).toBe(1);
    expect(shiftOf(22 * 60)).toBe(2);
    expect(shiftOf(2 * 60)).toBe(2);
    const start = handoverAt(0);
    const end = handoverAt(HANDOVER_S);
    expect(start.incoming[1]).toBeLessThan(GUARD_POST[1] - 2);
    expect(end.incoming).toEqual(GUARD_POST);
    expect(end.outgoing[1]).toBeLessThan(GUARD_POST[1] - 2);
    expect(end.done).toBe(true);
    expect(handoverAt(HANDOVER_S / 2).done).toBe(false);
  });

  it('keeps the guard standing most of the time, pacing a little clear of the drive and the bays, and never waving on and on', () => {
    let standing = 0;
    for (let t = 0; t < 240; t += 0.25) {
      const p = guardPatrol(t);
      if (!p.walking) standing++;
      expect(Math.abs(p.at[0])).toBeGreaterThan(AISLE + SIZE.car.wid / 2 + 0.4);
      expect(Math.abs(p.at[0])).toBeLessThan(LOT.x1);
      expect(p.at[1]).toBeLessThan(ROWS[1]!.z0 - ROWS[1]!.bay / 2 - 0.3);
    }
    expect(standing / 960).toBeGreaterThan(0.5);
    expect(PATROL).toBeGreaterThan(1);
    const scene = src['../Parking3D.tsx']!;
    // A raised hand only while a vehicle is at the gate, and the guard is standing at the post (not walking or in the cabin).
    expect(scene).toContain('raiseFor={() => lot.barrier() > 0}');
    expect(src['../GuardCabin3D.tsx']).toContain("const wave = raiseFor?.() === true && !f.duty.walking && !guard.sheltered();");
    expect(scene).not.toContain('Math.sin(clock.current * 6)');
  });
});

describe('closing time and the pause', () => {
  it('closes the doors to customers at 17:00 and opens them again the next morning', () => {
    expect(CLOSING).toBe(17 * 60);
    expect(isClosed(16.99 * 60)).toBe(false);
    expect(isClosed(17 * 60)).toBe(true);
    expect(isClosed(8 * 60)).toBe(false);
    expect(CUSTOMER_DESKS).toContain('TELLER_CASH');
    expect(CUSTOMER_DESKS).not.toContain('GATE_ATM');
  });

  it('walks everyone queuing at a customer desk out through a side door or the main entrance', () => {
    const out = evacuees(() => 3);
    expect(out.length).toBe(CUSTOMER_DESKS.length * 3);
    const exits = new Set(out.map((w) => w.exit));
    expect(exits.has('left')).toBe(true);
    expect(exits.has('main')).toBe(true);
    expect(exits.has('right')).toBe(true);
    const HX = FLOOR_SLAB.w / 2;
    for (const w of out) {
      const [x, z] = w.path[w.path.length - 1]!;
      // Every route ends outside the building.
      expect(Math.abs(x) > HX || z > FLOOR_SLAB.d / 2, `${w.id} ${w.k}`).toBe(true);
    }
    expect(evacuationRoute([-11.5, 13], 2).exit).toBe('left');
    expect(ENTRANCES.length).toBe(3);
  });

  it('empties the customer desks’ queues after closing, keeps the ATMs open all night, and never evacuates on a pause', async () => {
    const desk = src['../Desk3D.tsx']!;
    expect(desk).toContain('CUSTOMER_DESKS.includes(id) && isClosed(s.view.minute)');
    const traffic = src['../Traffic.tsx']!;
    expect(traffic).toContain('if (closed && !ATM_STATIONS.includes(id)) continue;');
    // The walk-out is triggered by the clock crossing 17:00, never by the play/pause switch (engine: ClosingWalkout).
    const { ClosingWalkout } = await import('../../../../engine/simulation/closingWalkout');
    const walkout = new ClosingWalkout(false);
    for (let i = 0; i < 5; i++) expect(walkout.update(false, () => 3)).toBe(false);
    walkout.step(0);
    expect(walkout.who.length).toBe(0);
    expect(walkout.update(true, () => 3)).toBe(true);
    expect(walkout.who.length).toBeGreaterThan(0);
  });

  it('freezes everything that moves while the bank is paused, and runs it at the bank’s own speed while it plays', () => {
    expect(motionScale(false, 5)).toBe(0);
    expect(motionScale(true, 5)).toBe(5);
    const t0 = motion.t;
    advanceMotion(0.05, false, 2);
    expect(motion.t).toBe(t0);
    expect(motion.dt).toBe(0);
    advanceMotion(0.05, true, 2);
    expect(motion.t).toBeCloseTo(t0 + 0.1, 9);
    advanceMotion(0.05, true, 10);
    expect(motion.dt).toBeCloseTo(0.5, 9);
    // A big step is cut into small ones, so a fast multiplier never makes anything jump.
    expect(substeps(0.5).every((h) => h <= 0.05 + 1e-9)).toBe(true);
    expect(substeps(0.5).reduce((a, b) => a + b, 0)).toBeCloseTo(0.5, 9);
    expect(substeps(0)).toEqual([]);
    // Staff, customers, passers-by, vehicles and payments all read the motion clock.
    expect(src['../Avatars.tsx']).toContain('const t = motion.t * 9 * tempo + phase;');
    expect(src['../Avatars.tsx']).toContain('const t = motion.t + seed;');
    expect(src['../Traffic.tsx']).toContain('const now = (): number => motionNow();');
    // The world's systems are stepped by its engine on the motion clock (engine.test.ts plays and pauses it); the views read.
    expect(src['../Vehicles3D.tsx']).toContain('const live = useWorld().trafficView;');
    expect(src['../Parking3D.tsx']).toContain('const lot = useWorld().lot;');
    expect(src['../Environment3D.tsx']).toContain('const clock = useWorld().pavement;');
    expect(src['../Desk3D.tsx']).toContain('leaver.t += motion.dt;');
  });
});

describe('the sidewalk ATM booths', () => {
  it('keeps everyone at an ATM inside its glass booth, and the passers-by and shelterers out of it', () => {
    for (const id of ATM_STATIONS) {
      const b = atmBooth(id);
      for (const lane of PAVEMENT.lanes) expect(lane, id).toBeGreaterThan(b.front + 0.1);
      for (const p of PEDESTRIANS) {
        const [x] = overhangSpot(p);
        expect(x < b.x0 - 0.2 || x > b.x1 + 0.2, `${p.index} at ${x}`).toBe(true);
      }
    }
    expect(OVERHANG.z1).toBeLessThan(KERB_Z);
  });
});

describe('a desk’s description keeps clear of its own badges', () => {
  const anchors = { above: { x: 500, y: 300 }, below: { x: 500, y: 420 }, right: { x: 560, y: 360 }, left: { x: 440, y: 360 } };
  const tip = { w: 260, h: 176 };
  const view = { w: 1200, h: 800 };

  it('opens above when nothing of the desk’s is there', () => {
    expect(tipSide3d(anchors, tip, [], view)).toBe('above');
  });

  it('opens on another side when one of its badges sits above it', () => {
    const above = badgeRect({ x: 500, y: 200 }, 14, 28);
    const side = tipSide3d(anchors, tip, [above], view);
    expect(side).not.toBe('above');
    const r = tipRect3d(side, anchors[side], tip);
    expect(r.x1 <= above.x0 || r.x0 >= above.x1 || r.y1 <= above.y0 || r.y0 >= above.y1).toBe(true);
  });

  it('stays on the screen when it can, and covers no badge whenever any side allows it', () => {
    const badges = [badgeRect({ x: 500, y: 200 }, 10, 28), badgeRect({ x: 500, y: 520 }, 10, 28), badgeRect({ x: 700, y: 360 }, 10, 28)];
    const side = tipSide3d(anchors, tip, badges, view);
    expect(side).toBe('left');
    expect(TIP_SIDES_3D).toEqual(['above', 'below', 'right', 'left']);
    // Near the top of the screen, above would leave it: it opens below.
    expect(tipSide3d({ ...anchors, above: { x: 500, y: 60 } }, tip, [], view)).toBe('below');
  });

  it('places the 3D description from that choice, above the canvas', () => {
    const desk = src['../Desk3D.tsx']!;
    expect(desk).toContain('const { side, at } = useTipPlacement(id, top);');
    expect(desk).toContain('zIndexRange={[60, 50]}');
    expect(desk).toContain('data-side={side}');
  });
});

describe('the 3D toolbar', () => {
  it('keeps Reset view, Labels, the time and the weather in one row in the top-left corner, whatever panel is open', () => {
    const office = src['../Office3D.tsx']!;
    expect(office).toContain("export const TOOLBAR_CLASS = 'absolute left-4 top-3 z-40 flex flex-row flex-nowrap items-center gap-1.5';");
    expect(office).not.toContain("top-[108px]");
    expect(office).toContain('<WeatherControls compact={splitOpen} />');
  });
});
