import { describe, expect, it } from 'vitest';
import { CLEAR, WEATHER_MIX } from '../atmosphere';
import { INDOORS, indoors } from '../Environment3D';
import { badgeRect, tipRect3d, tipSide3d, TIP_SIDES_3D } from '../focus3d';
import { FLOOR_SLAB, KERB_Z, ROAD_END, STREET } from '../layout3d';
import { BACK_LANE, LOT, LOT_PLAN, ParkingLot, SIZE, slotsOf, TREE_STRIP, type LotKind } from '../parking';
import { cloudCover, cloudDark, CLOUDS, cloudsFor, sunPlace } from '../Sky3D';
import { ALIGHT, LANE_Z, LENGTH, MIN_GAP, riderAt, ROAD, SPAN, taxiAction, TrafficSim, VEHICLES, type VehicleState } from '../vehicles';

const src = import.meta.glob(['../Environment3D.tsx', '../Office3D.tsx', '../Vehicles3D.tsx', '../Parking3D.tsx', '../Desk3D.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

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

describe('the two-lane avenue and its traffic', () => {
  it('is a two-lane road, a lane each way, wide enough for a car beside a car', () => {
    expect(ROAD_END - KERB_Z).toBeGreaterThanOrEqual(5);
    expect(LANE_Z.near).toBeGreaterThan(ROAD.z0 + 0.8);
    expect(LANE_Z.far).toBeLessThan(ROAD.z1 - 0.8);
    expect(LANE_Z.far - LANE_Z.near).toBeGreaterThan(2);
  });

  it('runs motorbikes (some carrying two), cars, green taxis and the armoured cash van, keeping to the right', () => {
    const kinds = new Set(VEHICLES.map((v) => v.kind));
    for (const k of ['motorbike', 'sedan', 'taxi', 'cit'] as const) expect(kinds.has(k), k).toBe(true);
    expect(VEHICLES.some((v) => v.kind === 'motorbike' && v.pillion)).toBe(true);
    for (const v of VEHICLES) if (v.stop) expect(v.lane).toBe('near');
    const sim = new TrafficSim();
    const before = sim.states();
    for (let i = 0; i < 30; i++) sim.step(1 / 60);
    for (const v of VEHICLES) {
      const a = before.get(v.id)!;
      const b = sim.state(v.id);
      if (a.cycle === b.cycle && Math.abs(b.x - a.x) > 1e-3) expect(Math.sign(b.x - a.x), v.id).toBe(v.lane === 'near' ? -1 : 1);
    }
  });

  it('never lets one vehicle touch another: over ten minutes of traffic every bumper-to-bumper gap stays at least MIN_GAP', () => {
    let least = Infinity;
    drive(600, (sim) => {
      for (const g of sim.gaps()) least = Math.min(least, g);
    });
    expect(least).toBeGreaterThanOrEqual(MIN_GAP - 1e-6);
  });

  it('brakes behind a vehicle standing at the kerb and waits, rather than driving through it', () => {
    // Somebody ends up queued behind the cash van while it stands for its full wait.
    let queued = false;
    drive(600, (sim) => {
      const states = sim.states();
      const van = states.get('cit-1')!;
      if (van.stoppedFor === null || van.stoppedFor < 6) return;
      for (const v of VEHICLES) {
        if (v.lane !== 'near' || v.id === 'cit-1') continue;
        const s = states.get(v.id)!;
        const behind = s.x - van.x; // the near lane runs towards -x, so behind is +x
        if (behind > 0 && behind < 6 && s.speed < 0.05) queued = true;
      }
    });
    expect(queued).toBe(true);
  });

  it('drives every vehicle on, round and out of sight, after its stop: nothing vanishes in view', () => {
    const laps = new Map<string, number>();
    drive(600, (sim) => {
      for (const v of VEHICLES) {
        const s = sim.state(v.id);
        const prev = laps.get(v.id);
        if (prev !== undefined && s.cycle !== prev) {
          // It comes round only at the far end of the street, out in the haze.
          expect(Math.abs(s.x), v.id).toBeGreaterThan(55);
        }
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

  it('sends the cash van’s guard with a cash box to the ATMs and back while the van waits', () => {
    const van = VEHICLES.find((v) => v.kind === 'cit')!;
    const seen = new Set<string>();
    drive(600, (sim) => {
      const s = sim.state(van.id);
      const r = riderAt(van, s);
      if (r) {
        expect(s.stoppedFor).not.toBeNull();
        seen.add(r.walking ? (r.carrying ? 'carrying' : 'walking') : 'at-atm');
      }
    });
    expect(seen.has('carrying')).toBe(true);
    expect(seen.has('at-atm')).toBe(true);
    expect(ALIGHT.door).toBeGreaterThan(0);
  });

  it('puts riders in raincoats only when it rains', () => {
    const scene = src['../Vehicles3D.tsx']!;
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

describe('the car park and the motorbike park', () => {
  it('lays the car park on the left and the motorbike park on the right, between the branch and the next block', () => {
    expect(LOT_PLAN.car.side).toBe(-1);
    expect(LOT_PLAN.moto.side).toBe(1);
    expect(LOT.x0).toBeGreaterThan(FLOOR_SLAB.w / 2);
    expect(TREE_STRIP.x0).toBeGreaterThanOrEqual(LOT.x1);
    // They open onto the lane behind the block, so their traffic never crosses the avenue's.
    expect(BACK_LANE.in).toBeLessThan(LOT.z0);
    expect(BACK_LANE.out).toBeLessThan(BACK_LANE.in);
    expect(LOT.z1).toBeLessThanOrEqual(STREET.z0);
  });

  it('makes every bay wider and deeper than what parks in it, inside the lot, and no two bays overlap', () => {
    for (const kind of ['car', 'moto'] as const) {
      const plan = LOT_PLAN[kind];
      for (const row of plan.rows) expect(row.a1 - row.a0, kind).toBeGreaterThan(SIZE[kind].len);
      expect(plan.bay).toBeGreaterThan(SIZE[kind].wid + 0.2);
      const slots = slotsOf(kind);
      expect(slots.length).toBeGreaterThan(kind === 'car' ? 8 : 30);
      const box = (s: (typeof slots)[number]) => ({ x: s.x, z: s.z, yaw: s.yaw, len: SIZE[kind].len, wid: SIZE[kind].wid });
      for (const a of slots) {
        expect(Math.abs(a.x) - SIZE[kind].len / 2).toBeGreaterThan(LOT.x0);
        expect(Math.abs(a.x) + SIZE[kind].len / 2).toBeLessThan(LOT.x1);
        expect(a.z + SIZE[kind].wid / 2).toBeLessThan(LOT.z1);
        for (const b of slots) if (a !== b) expect(obbOverlap(box(a), box(b)), `${kind} ${a.index}/${b.index}`).toBe(false);
      }
    }
  });

  it('never gives a bay to two vehicles, and never lets any two vehicles touch, over twenty minutes of comings and goings', () => {
    for (const kind of ['car', 'moto'] as LotKind[]) {
      const lot = new ParkingLot(kind);
      let arrivals = 0;
      let departures = 0;
      const seen = new Set(lot.vehicles.map((v) => v.id));
      for (let i = 0; i < 1200 * 10; i++) {
        lot.step(1 / 10);
        // One bay, one vehicle.
        const owners = lot.vehicles.map((v) => v.slot);
        expect(new Set(owners).size, kind).toBe(owners.length);
        for (const v of lot.vehicles) expect(lot.slots[v.slot]!.occupiedBy).toBe(v.id);
        for (const v of lot.vehicles)
          if (!seen.has(v.id)) {
            seen.add(v.id);
            arrivals++;
          }
        if (i % 3) continue;
        // The one vehicle on the move never touches anything standing (standing ones are each in their own bay, and no
        // two bays overlap: see the test above).
        const m = lot.moverPose();
        if (!m) continue;
        const moving = { x: m.x, z: m.z, yaw: m.yaw, len: SIZE[kind].len, wid: SIZE[kind].wid };
        for (const { v, slot } of lot.parked())
          if (obbOverlap(moving, { x: slot.x, z: slot.z, yaw: slot.yaw, len: SIZE[kind].len, wid: SIZE[kind].wid })) throw new Error(`${kind} t=${lot.t.toFixed(1)} mover ${m.id} touches ${v.id} in bay ${slot.index}`);
      }
      departures = seen.size - lot.vehicles.length;
      expect(arrivals, kind).toBeGreaterThan(10);
      expect(departures, kind).toBeGreaterThan(10);
    }
  });

  it('sends nobody in when the lot is full, and a newcomer to a free bay otherwise', () => {
    const lot = new ParkingLot('car', 1);
    expect(lot.vacant()).toHaveLength(0);
    for (let i = 0; i < 20 * 20; i++) {
      lot.step(1 / 20);
      const arriving = lot.vehicles.filter((v) => v.phase === 'arriving');
      // Only once somebody has left and their bay is free can anyone come in.
      if (arriving.length) expect(lot.slots.length).toBeGreaterThan(lot.vehicles.length - 1);
    }
    for (const s of lot.slots) expect(lot.isOccupied(s.index)).toBe(s.occupiedBy !== null);
  });

  it('moves one vehicle at a time in each lot, and lifts the barrier only while it is at the gate', () => {
    const lot = new ParkingLot('moto');
    let lifted = 0;
    for (let i = 0; i < 600 * 20; i++) {
      lot.step(1 / 20);
      const moving = lot.vehicles.filter((v) => v.phase === 'arriving' || v.phase === 'leaving');
      expect(moving.length).toBeLessThanOrEqual(1);
      if (moving.length) expect(lot.mover).toBe(moving[0]!.id);
      if (lot.barrier() > 0) {
        lifted++;
        expect(lot.moverPose()).not.toBeNull();
      }
    }
    expect(lifted).toBeGreaterThan(0);
  });

  it('stations a uniformed guard at each gate who waves the moving vehicle in, beside a booth and a barrier', () => {
    const scene = src['../Parking3D.tsx']!;
    expect(scene).toContain('wear="guard"');
    expect(scene).toContain('raise.current = lot.mover ?');
    expect(scene).toContain('<Barrier kind={kind} lot={lot} />');
    expect(scene).toContain("'P  CAR PARK'");
    expect(scene).toContain("'P  MOTORBIKES'");
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
