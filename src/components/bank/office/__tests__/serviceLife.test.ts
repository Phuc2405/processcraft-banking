import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { atmosphereAt, GROUND_FOG, WEATHER_MIX } from '../atmosphere';
import { CIT_RUN, LOADING_BAY, LOADING_DOOR, LOADS, VAN_REAR, type CitPhase } from '../citRun';
import { chatPhase, MIST_BANKS, MIST_CLIP, MIST_LAYERS } from '../Environment3D';
import { evacuationRoute } from '../evacuation';
import { FrontGuard, PARKING_CABIN, PARKING_PLAN } from '../guardCabin';
import { arrivalPath, ATM_STATIONS, atmBooth, CAR_PARK_FOOTWAY_X, ENTRANCES, FLOOR_SLAB, KERB_Z, queueSlots, ROAD_END, vaultRoom, type V2 } from '../layout3d';
import { AISLE, CIT_MOVER, LOT, LOT_SIDE, ParkingLot, SIZE, slotsOf } from '../parking';
import { ParkCrowd, PARK_MEMBERS, talkers } from '../parkLife';
import { PARK } from '../parkPlan';
import { SIDEWALK, SidewalkCrowd } from '../sidewalk';
import { BUS_X, busBoxClear, DROP_ZONE, LENGTH, taxiAction, TrafficSim, VEHICLES } from '../vehicles';
import { DAY_INTRO_FADE_MS } from '../../dayIntro';

const read = (rel: string): string => readFileSync(join(__dirname, rel), 'utf8');
const HX = FLOOR_SLAB.w / 2;
const HZ = FLOOR_SLAB.d / 2;

describe('the cash van’s run to the vault’s loading bay', () => {
  /** Runs the car park (which steps the van) for `seconds`, calling `each` after every step. */
  const run = (seconds: number, each: (lot: ParkingLot) => void): ParkingLot => {
    const lot = new ParkingLot();
    for (let i = 0; i < seconds * 20; i++) {
      lot.step(0.05);
      each(lot);
    }
    return lot;
  };

  it('has a painted bay against the back wall behind the vault, its loading door just behind the van’s rear doors', () => {
    const vault = vaultRoom();
    expect(LOADING_DOOR[0]).toBeGreaterThan(vault.x0);
    expect(LOADING_DOOR[0]).toBeLessThan(vault.x1);
    // Outside the back wall, clear of the lane behind the block, and nowhere near the car park.
    expect(LOADING_BAY.z + LOADING_BAY.w / 2).toBeLessThan(-HZ);
    expect(LOADING_BAY.z - LOADING_BAY.w / 2).toBeGreaterThan(-HZ - 1.75);
    expect(LOADING_BAY.x + LOADING_BAY.len / 2).toBeLessThan(HX);
    expect(LOADING_BAY.x - LOADING_BAY.len / 2).toBeGreaterThan(-HX);
    expect(Math.abs(VAN_REAR[0] - (LOADING_BAY.x - LENGTH.cit / 2))).toBeLessThan(0.6);
    const src = read('../Parking3D.tsx');
    expect(src).toContain('<LoadingBay3D run={lot.cit} />');
  });

  it('drives in indicating, stops, opens up, carries the cash box by box to the door, shuts up and drives off', () => {
    const order: CitPhase[] = [];
    const carried = new Set<string>();
    let signalIn = false;
    let signalOut = false;
    const lot = run(600, (l) => {
      const p = l.cit.pose();
      if (order[order.length - 1] !== p.phase) order.push(p.phase);
      if (p.phase === 'arrive' && p.signal === 1) signalIn = true;
      if (p.phase === 'depart' && p.signal === -1) signalOut = true;
      // Doors open, the shutter up and the guard out only while it stands in its bay.
      if (p.doors > 0 || p.shutter > 0 || p.guard) {
        expect(p.x).toBe(LOADING_BAY.x);
        expect(p.z).toBe(LOADING_BAY.z);
      }
      if (p.guard) {
        // On the walk between the back of the van and the loading door, nowhere else.
        const [gx, gz] = p.guard.at;
        expect(gx).toBeGreaterThanOrEqual(Math.min(VAN_REAR[0], LOADING_DOOR[0]) - 1e-6);
        expect(gx).toBeLessThanOrEqual(Math.max(VAN_REAR[0], LOADING_DOOR[0]) + 1e-6);
        expect(gz).toBeLessThanOrEqual(LOADING_DOOR[1] + 1e-6);
        if (p.guard.carrying) carried.add(p.guard.carrying);
        if (p.guard.walking && p.guard.carrying) expect(Math.abs(p.guard.heading - Math.atan2(LOADING_DOOR[0] - VAN_REAR[0], LOADING_DOOR[1] - VAN_REAR[1]))).toBeLessThan(1e-6);
      }
    });
    expect(order.join(' ')).toContain('away arrive open load close depart away');
    expect(lot.cit.runs).toBeGreaterThanOrEqual(3);
    expect([...carried].sort()).toEqual([...new Set(LOADS)].sort());
    expect(signalIn).toBe(true);
    expect(signalOut).toBe(true);
    expect(CIT_RUN.doors).toBeGreaterThan(0.5);
  });

  it('only passes the car park’s gate while the car park is still, so nothing turns in or out across it', () => {
    let held = 0;
    run(900, (l) => {
      if (l.cit.needsLane()) {
        expect(l.mover).toBe(CIT_MOVER);
        expect(l.moverPose()).toBeNull();
        held++;
      }
    });
    expect(held).toBeGreaterThan(0);
  });
});

describe('the start-of-day banner fades', () => {
  it('is see-through over a blur, and fades out over half a second however it goes', () => {
    const src = read('../../DayIntroBanner.tsx');
    expect(src).toContain('transition-opacity duration-500 ease-out');
    expect(src).toContain('bg-slate-950/55');
    expect(src).not.toContain('bg-slate-950/90');
    expect(src).toContain('backdrop-blur-sm');
    expect(src).toContain('setTimeout(() => setOpen(false), DAY_INTRO_FADE_MS)');
    expect(DAY_INTRO_FADE_MS).toBe(500);
  });
});

describe('people on the pavement keep apart', () => {
  it('steps two people meeting head on to either side, so they pass without touching, and back onto their line after', () => {
    const crowd = new SidewalkCrowd();
    const z = KERB_Z - 0.75;
    let least = Infinity;
    let a: V2 = [0, z];
    let b: V2 = [0, z];
    for (let i = 0; i < 400; i++) {
      const t = i * 0.02;
      a = crowd.place('a', -4 + t, z, 0.02);
      b = crowd.place('b', 4 - t, z, 0.02);
      least = Math.min(least, Math.hypot(a[0] - b[0], a[1] - b[1]));
      for (const p of [a, b]) {
        expect(p[1]).toBeGreaterThanOrEqual(SIDEWALK.z0 - 1e-9);
        expect(p[1]).toBeLessThanOrEqual(SIDEWALK.z1 + 1e-9);
      }
    }
    expect(least).toBeGreaterThan(0.38);
    // Well past each other now: both back on (close to) their own line.
    for (let i = 0; i < 200; i++) {
      a = crowd.place('a', 4 + i * 0.02, z, 0.02);
      b = crowd.place('b', -4 - i * 0.02, z, 0.02);
    }
    expect(Math.abs(a[1] - z)).toBeLessThan(0.05);
    expect(Math.abs(b[1] - z)).toBeLessThan(0.05);
  });

  it('lets someone faster overtake a slower walker without walking through them, and leaves people off the pavement alone', () => {
    const crowd = new SidewalkCrowd();
    const z = KERB_Z - 0.45;
    let least = Infinity;
    for (let i = 0; i < 600; i++) {
      const t = i * 0.02;
      const slow = crowd.place('slow', -2 + 0.6 * t, z, 0.02);
      const fast = crowd.place('fast', -4 + 1.2 * t, z, 0.02);
      least = Math.min(least, Math.hypot(slow[0] - fast[0], slow[1] - fast[1]));
    }
    expect(least).toBeGreaterThan(0.38);
    // In an ATM booth, or under the entrance overhang: not steered.
    const b = atmBooth(ATM_STATIONS[0]!);
    expect(crowd.place('in-booth', b.x0 + 0.5, b.line, 0.02)).toEqual([b.x0 + 0.5, b.line]);
    crowd.leave('slow');
    crowd.leave('fast');
    expect(crowd.size).toBe(0);
  });

  it('steers every walker on the pavement: passers-by, ATM customers coming and going, and people off the buses and taxis', () => {
    expect(read('../Environment3D.tsx')).toContain('sidewalk.place(`passer-${p.index}`');
    const traffic = read('../Traffic.tsx');
    expect(traffic).toContain("placeWalkers(walks.current, pool.current, 'arrival')");
    expect(traffic).toContain("placeWalkers(walks.current, pool.current, 'atm-leaver')");
    const cars = read('../Vehicles3D.tsx');
    expect(cars).toContain('sidewalk.place(`rider-${v.id}`');
    expect(cars).toContain('sidewalk.place(`bus-${id}`');
  });
});

describe('the ATM queues, from the street to the machine and away', () => {
  it('walks customers to the ATMs at an unhurried pace on the motion clock, each on one figure the whole way', () => {
    const traffic = read('../Traffic.tsx');
    expect(traffic).toContain('export const ARRIVAL_PACE = { atm: 0.85, gate: 1.0 } as const;');
    expect(traffic).toContain('export const LEAVE_PACE = 0.9;');
    // Paced walks on the scaled motion clock, not squeezed into a beat: and nobody's figure is taken over mid-walk.
    expect(traffic).toContain('const p = laneAt(w.path, (t - w.start) * w.pace);');
    expect(traffic).not.toContain('walks.current.splice(0, walks.current.length - MAX_WALKERS)');
  });

  it('lines the waiting customers up behind the rope, the one at the machine stepping up to it', () => {
    for (const id of ATM_STATIONS) {
      const b = atmBooth(id);
      const slots = queueSlots(id, 5);
      expect(slots[0]![1]).toBe(b.head);
      for (const [x, z] of slots.slice(1)) {
        expect(z).toBe(b.line);
        expect(z).toBeLessThan(b.front);
        expect(z).toBeGreaterThan(b.head);
        expect(x).toBeGreaterThan(b.x0);
        expect(x).toBeLessThan(b.x1);
      }
    }
  });

  it('turns the customer round at the machine before they walk off down the street', () => {
    const traffic = read('../Traffic.tsx');
    expect(traffic).toContain('export const ATM_TURN_S = 0.8;');
    expect(traffic).toContain('const path: V2[] = [[kx, b.head - 0.01], ...atmExitPath(id)];');
  });
});

describe('the ground mist outdoors', () => {
  const inBank = (x: number, z: number, [bx, , bz, w, d]: (typeof MIST_BANKS)[number]): boolean => Math.abs(x - bx) < w / 2 && Math.abs(z - bz) < d / 2;

  it('lies over the street, the lane behind the block, the park’s lawns and the car park, in layers', () => {
    const spots: Array<[string, number, number]> = [
      ['pavement', 0, KERB_Z - 0.5],
      ['avenue', 0, (KERB_Z + ROAD_END) / 2],
      ['back lane', 0, -HZ - 3.2],
      ['park', (PARK.x0 + PARK.x1) / 2, (PARK.z0 + PARK.z1) / 2],
      ['car park', LOT_SIDE * (LOT.x0 + LOT.x1) / 2, (LOT.z0 + LOT.z1) / 2],
    ];
    for (const [name, x, z] of spots) expect(MIST_BANKS.some((b) => inBank(x, z, b)), name).toBe(true);
    expect(MIST_LAYERS.length).toBeGreaterThanOrEqual(3);
    // Every bank's floor is low enough to lie on the ground it covers.
    for (const [, y] of MIST_BANKS.slice(0, 5)) expect(y).toBeLessThan(0.3);
    // The branch is cut out of it.
    expect(MIST_CLIP.z1).toBeLessThan(KERB_Z);
  });

  it('is thick in fog all day and in smog, and gone on a clear day', () => {
    for (const minute of [8 * 60, 12 * 60, 16 * 60]) expect(atmosphereAt(minute, WEATHER_MIX.fog).mist, String(minute)).toBeGreaterThanOrEqual(GROUND_FOG);
    expect(atmosphereAt(12 * 60, WEATHER_MIX.smog).mist).toBeGreaterThan(0.6);
    expect(atmosphereAt(12 * 60, WEATHER_MIX.clear).mist).toBe(0);
  });
});

describe('the car park’s guard cabin', () => {
  const inCabinBox = (p: V2): boolean => Math.abs(p[0] - PARKING_CABIN.x) < PARKING_CABIN.w / 2 && Math.abs(p[1] - PARKING_CABIN.z) < PARKING_CABIN.d / 2;

  it('stands by the gate, clear of the drive and every bay', () => {
    const c = PARKING_CABIN;
    expect(Math.abs(c.x) - c.w / 2).toBeGreaterThan(AISLE + 1.5);
    expect(Math.abs(c.x) + c.w / 2).toBeLessThan(LOT.x1);
    expect(c.z - c.d / 2).toBeGreaterThan(LOT.z0);
    for (const s of slotsOf()) {
      const half = SIZE[s.kind];
      const apart = Math.abs(s.x - c.x) > half.len / 2 + c.w / 2 || Math.abs(s.z - c.z) > half.wid / 2 + 0.4 + c.d / 2;
      expect(apart, `bay ${s.index}`).toBe(true);
    }
  });

  it('sends the guard in at the cabin door in rain or hail and back out after, and changes guards every eight hours', () => {
    const g = new FrontGuard(12 * 60, false, PARKING_PLAN);
    let was = g.figures().duty.at;
    const step = (seconds: number, minute: number, wet: boolean): void => {
      for (let i = 0; i < seconds * 20; i++) {
        g.step(0.05, minute, wet);
        const now = g.figures().duty.at;
        if (inCabinBox(now) !== inCabinBox(was)) expect(Math.abs(now[1] - PARKING_CABIN.z), 'by the door').toBeLessThan(0.35);
        was = now;
      }
    };
    step(30, 12 * 60, false);
    expect(g.sheltered()).toBe(false);
    step(15, 12 * 60, true);
    expect(g.sheltered()).toBe(true);
    step(15, 12 * 60, false);
    expect(g.sheltered()).toBe(false);
    step(1, 13 * 60 + 59, false);
    step(1, 14 * 60, false);
    expect(g.figures().leaving).not.toBeNull();
    step(80, 14 * 60 + 5, false);
    expect(g.figures().leaving).toBeNull();
    expect(read('../Parking3D.tsx')).toContain('<GuardCabin3D plan={PARKING_PLAN}');
  });
});

describe('both sides of a conversation', () => {
  it('puts a bubble over each of a pair sitting together in the park, and none over someone sitting alone', () => {
    const pair = PARK_MEMBERS.filter((m) => m.id.startsWith('bench-0-'));
    const both = new ParkCrowd(undefined, (m) => pair.includes(m));
    expect(talkers(both).map((t) => t.id).sort()).toEqual(pair.map((m) => m.id).sort());
    expect(new Set(talkers(both).map((t) => t.turn)).size).toBe(2);
    const alone = new ParkCrowd(undefined, (m) => m === pair[0]);
    expect(talkers(alone)).toEqual([]);
    const table = new ParkCrowd(undefined, (m) => m.role === 'picnic');
    expect(talkers(table)).toHaveLength(4);
  });

  it('puts a bubble over both of a pair talking on the pavement, the two taking turns', () => {
    const src = read('../Environment3D.tsx');
    expect(src).toContain("{pose === 'chat' && (");
    expect(src).not.toContain("pose === 'chat' && p.index % 2 === 0");
    expect(Math.abs(chatPhase(1) - chatPhase(0))).toBeCloseTo(Math.PI / 1.3);
  });
});

describe('dropping off at the first clear spot', () => {
  it('pulls a drop-off in at the first clear stretch of kerb along the frontage, never in the bus box, never across the traffic', () => {
    const sim = new TrafficSim();
    const drops: number[] = [];
    const was = new Map<string, boolean>();
    for (let i = 0; i < 900 * 30; i++) {
      sim.step(1 / 30);
      for (const v of VEHICLES) {
        if (!v.stop) continue;
        const s = sim.state(v.id);
        const now = s.stoppedFor !== null;
        const drop = v.stop.kind === 'pillion' || (v.stop.kind === 'taxi' && taxiAction(s.cycle) === 'alight');
        if (now && !was.get(v.id) && drop) {
          drops.push(s.x);
          expect(s.lat, v.id).toBe(0);
          expect(s.stopX).toBeCloseTo(s.x, 5);
          expect(s.x).toBeLessThanOrEqual(DROP_ZONE.x1);
          expect(s.x).toBeGreaterThanOrEqual(DROP_ZONE.x0);
          expect(busBoxClear(s.x, LENGTH[v.kind]), `${v.id} at ${s.x}`).toBe(true);
        }
        was.set(v.id, now);
      }
    }
    expect(drops.length).toBeGreaterThan(40);
    // The first clear spot is just past the bus stop: nobody drives on down the street with their passenger.
    const sorted = [...drops].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]!).toBeGreaterThan(BUS_X - 6);
  });
});

describe('from the car park to the side doors', () => {
  it('walks gate customers in from the car park’s footway, and back out to it at closing time', () => {
    for (const e of ENTRANCES) {
      const path = arrivalPath(e.id, 1);
      expect(path[0]![0]).toBe(CAR_PARK_FOOTWAY_X);
      // Along the footway to the walkway, then straight across it to the door.
      expect(path[1]).toEqual([CAR_PARK_FOOTWAY_X, e.at[1]]);
      expect(path[2]![1]).toBe(e.at[1]);
      const out = evacuationRoute(e.id, [e.at[0] + 3, e.at[1] - 1], 0).path;
      expect(out[out.length - 1]![0]).toBe(CAR_PARK_FOOTWAY_X);
    }
    expect(read('../Traffic.tsx')).toContain('walk in from their cars in');
  });
});
