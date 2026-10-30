import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { atmosphereAt, CLEAR, WEATHER_MIX } from '../../../../engine/world/atmosphere';
import { atmPress } from '../Desk3D';
import { mistClipped } from '../Environment3D';
import { evacuees } from '../../../../engine/world/evacuation';
import { CABIN_DOOR, FrontGuard, inCabin } from '../../../../engine/world/guardCabin';
import { ATM_STATIONS, arrivalPath, atmBooth, atmExitPath, GUARD_CABIN, KERB_Z, lobbyWalkIn, ROPED_QUEUES, stanchionLine, STREET, WALK_IN_DESKS, type V2 } from '../../../../engine/plan/layout3d';
import { exitRoute, PARK_GATE, PARK_MEMBERS, ParkCrowd, wantsPark } from '../../../../engine/world/parkLife';
import { FLOWERBEDS, FOUNTAIN, HEDGES, LOOP, PICNIC } from '../../../../engine/world/parkPlan';
import { swingAmp, SWING } from '../Park3D';
import { pathLength, pointAlongPath } from '../../../../engine/plan/path';
import { BUS_X, busRiders, kerbZ, LENGTH, MIN_GAP, TAXI_X, TrafficSim, VEHICLES, WIDTH } from '../../../../engine/world/vehicles';
import { DAY_EVENTS } from '../../../../sim/traffic';
import { dayIntroCopy, dayLabel, introDue } from '../../dayIntro';

const read = (rel: string): string => readFileSync(join(__dirname, rel), 'utf8');

/** Whether segments ab and cd cross (touching counts). */
function crosses(a: V2, b: V2, c: V2, d: V2): boolean {
  const o = (p: V2, q: V2, r: V2): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Every rope, and the glass sides of the ATM booths: nobody may walk through any of them. */
const BARRIERS: Array<[V2, V2]> = [
  ...ROPED_QUEUES.flatMap((id) => stanchionLine(id).ropes),
  ...ATM_STATIONS.flatMap((id) => {
    const b = atmBooth(id);
    return [
      [[b.x0, b.z0], [b.x0, b.front]],
      [[b.x1, b.z0], [b.x1, b.front]],
    ] as Array<[V2, V2]>;
  }),
];
const barrierHits = (path: readonly V2[]): number => {
  let n = 0;
  for (let i = 1; i < path.length; i++) for (const [c, d] of BARRIERS) if (crosses(path[i - 1]!, path[i]!, c, d)) n++;
  return n;
};

describe('queue ropes, stanchions and booth glass are walls to walk round', () => {
  it('brings every customer to the back of the queue without stepping through a rope or a booth wall', () => {
    for (const id of [...WALK_IN_DESKS, ...ATM_STATIONS]) for (let q = 0; q <= 6; q++) expect(barrierHits(arrivalPath(id, q)), `${id} queue ${q}`).toBe(0);
  });

  it('walks ATM customers out of the booth by the gap and off down the street, and closing-time leavers out of the rope lanes', () => {
    for (const id of ATM_STATIONS) {
      const out = atmExitPath(id);
      expect(barrierHits(out), id).toBe(0);
      expect(out[out.length - 1]![0]).toBeGreaterThan(STREET.halfWidth);
    }
    for (const e of evacuees(() => 5)) expect(barrierHits(e.path), `${e.id} #${e.k}`).toBe(0);
  });

  it('keys in at the ATM with the hand out at the keypad', () => {
    for (let t = 0; t < 5; t += 0.05) {
      expect(atmPress(t)).toBeGreaterThanOrEqual(0.42);
      expect(atmPress(t)).toBeLessThanOrEqual(0.47);
    }
    // The one served is drawn by the desk itself, on the spot, then walks off: there is no separate pool of leavers.
    expect(read('../Desk3D.tsx')).toContain('<ServedCustomer key={s.key} id={id} s={s} line={line} />');
    expect(read('../OfficeScene.tsx')).not.toContain('<AtmLeavers />');
  });

  it('walks people in from the kerb by the main entrance to the teller’s queue, through no booth', () => {
    for (const x of [TAXI_X, BUS_X, -5.5, 3.2]) expect(barrierHits(lobbyWalkIn(x)), String(x)).toBe(0);
  });
});

/** Drives the avenue for `seconds`, calling `each` after every step. */
function drive(seconds: number, each: (sim: TrafficSim) => void): void {
  const sim = new TrafficSim();
  for (let i = 0; i < seconds * 30; i++) {
    sim.step(1 / 30);
    each(sim);
  }
}

describe('the kerb lane, the bus and the cash van', () => {
  it('only ever stops at the kerb from the kerb lane, fully pulled in, so nobody gets out across the traffic', () => {
    let stops = 0;
    drive(900, (sim) => {
      for (const v of VEHICLES) {
        if (!v.stop) continue;
        const s = sim.state(v.id);
        if (s.stoppedFor === null) continue;
        stops++;
        expect(s.lat, v.id).toBe(0);
        expect(s.pull, v.id).toBe(1);
      }
    });
    expect(stops).toBeGreaterThan(500);
  });

  it('runs a city bus that signals into the kerb lane and pulls into its stop, clear of the taxi stand', () => {
    const bus = VEHICLES.find((v) => v.kind === 'bus')!;
    expect(bus.stop?.x).toBe(BUS_X);
    expect(BUS_X - LENGTH.bus / 2 - (TAXI_X + LENGTH.taxi / 2)).toBeGreaterThan(MIN_GAP);
    let signalled = false;
    let stopped = false;
    drive(600, (sim) => {
      const s = sim.state(bus.id);
      if (s.signal === -1) signalled = true;
      if (s.stoppedFor !== null) {
        stopped = true;
        expect(Math.abs(s.x - BUS_X)).toBeLessThan(0.1);
      }
    });
    expect(signalled).toBe(true);
    expect(stopped).toBe(true);
  });

  it('lets bus passengers off and on only between its doors and the pavement', () => {
    const bus = VEHICLES.find((v) => v.kind === 'bus')!;
    const doorSide = kerbZ('bus') - WIDTH.bus / 2;
    const seen = new Set<string>();
    drive(600, (sim) => {
      for (const r of busRiders(bus, sim.state(bus.id))) {
        seen.add(`${r.action}:${r.walking ? 'walk' : 'wait'}`);
        expect(r.z, r.id).toBeLessThanOrEqual(doorSide);
      }
    });
    for (const k of ['alight:walk', 'board:walk', 'board:wait']) expect(seen.has(k), k).toBe(true);
  });

  it('makes the cash van a bulky armoured truck with a ▼ marker over it and a painted loading bay', () => {
    expect(LENGTH.cit).toBeGreaterThan(LENGTH.sedan + 0.5);
    expect(WIDTH.cit).toBeGreaterThan(WIDTH.sedan + 0.15);
    const src = read('../Vehicles3D.tsx');
    expect(src).toContain('▼');
    expect(src).toContain('hazard chevrons');
    expect(src).toContain('<KerbBays />');
    // The loading bay is behind the vault now, and the ▼ rides on the van there (serviceLife.test.ts runs it).
    const bay = read('../LoadingBay3D.tsx');
    expect(bay).toContain('<CitMarker />');
    expect(bay).toContain('name="cit-bay"');
  });
});

describe('the park’s people', () => {
  const noon = 12 * 60;
  const fair = (m: (typeof PARK_MEMBERS)[number]): boolean => wantsPark(m, noon);
  const evening = (m: (typeof PARK_MEMBERS)[number]): boolean => wantsPark(m, 23.75 * 60);

  it('keeps the flowerbeds off the paths, so nobody strolling the loop walks through one', () => {
    for (const { at: [fx, fz], size } of FLOWERBEDS) {
      const h = size / 2;
      expect(fx + h < LOOP.x1 - LOOP.w / 2 && fx - h > LOOP.x0 + LOOP.w / 2, `bed at ${fx}`).toBe(true);
      expect(Math.abs(fx - FOUNTAIN.x) > h + 0.45 || Math.abs(fz - FOUNTAIN.z) > h + 0.45).toBe(true);
    }
  });

  it('keeps every way out on the paths: clear of the fountain, the beds, the picnic table and the hedge', () => {
    for (const m of PARK_MEMBERS) {
      const route = exitRoute(m);
      const len = pathLength(route);
      for (let d = 0.3; d < len; d += 0.1) {
        const [x, z] = pointAlongPath(route, d);
        expect(Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z), `${m.id} fountain`).toBeGreaterThan(1.4);
        for (const { at: [fx, fz], size } of FLOWERBEDS) expect(Math.abs(x - fx) < size / 2 + 0.05 && Math.abs(z - fz) < size / 2 + 0.05, `${m.id} bed`).toBe(false);
        if (m.role !== 'picnic') expect(Math.abs(x - PICNIC.x) < 0.85 && Math.abs(z - PICNIC.z) < 0.45, `${m.id} table`).toBe(false);
        for (const h of HEDGES) expect(x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1, `${m.id} hedge`).toBe(false);
      }
      expect(route.some((p) => p[0] === PARK_GATE[0] && p[1] === PARK_GATE[1]), m.id).toBe(true);
    }
  });

  it('keeps everyone in the park when the rain comes (umbrellas up, the children off the swings), and nobody vanishes', () => {
    const crowd = new ParkCrowd(PARK_MEMBERS, fair);
    const here = (): number => crowd.people.filter((p) => crowd.poseOf(p).pose !== 'away').length;
    const start = here();
    expect(start).toBeGreaterThan(8);
    for (let i = 0; i < 60 * 20; i++) crowd.step(0.05, fair, true);
    // A whole minute of rain: the same people, all still there.
    expect(here()).toBe(start);
    expect(crowd.wet).toBe(true);
    for (const p of crowd.people.filter((q) => q.m.role === 'swing')) expect(crowd.poseOf(p).pose).toBe('up');
    for (let i = 0; i < 10 * 20; i++) crowd.step(0.05, fair, false);
    expect(here()).toBe(start);
    expect(read('../Park3D.tsx')).toContain("const wet = l !== 'away' && crowd.wet && !underCover(s.at[0], s.at[1], [PICNIC_ROOF]);");
  });

  it('walks people out gradually as the evening ends, and back in the next day: nobody vanishes or appears', () => {
    const crowd = new ParkCrowd(PARK_MEMBERS, fair);
    const here = (): number => crowd.people.filter((p) => crowd.poseOf(p).pose !== 'away').length;
    const start = here();
    const last = new Map(crowd.people.map((p) => [p.m.id, crowd.poseOf(p).at]));
    const step = (want: typeof fair, rain: boolean, seconds: number): void => {
      for (let i = 0; i < seconds * 20; i++) {
        crowd.step(0.05, want, rain);
        for (const p of crowd.people) {
          const s = crowd.poseOf(p);
          const was = last.get(p.m.id)!;
          // A smooth walk (or a stroll), never a jump, except for the far-off spot where the away ones wait.
          if (s.pose !== 'away') expect(Math.hypot(s.at[0] - was[0], s.at[1] - was[1]), p.m.id).toBeLessThan(0.2);
          last.set(p.m.id, s.at);
        }
      }
    };
    step(evening, false, 0.5);
    expect(here()).toBe(start);
    step(evening, false, 3);
    expect(crowd.people.some((p) => crowd.poseOf(p).pose === 'walk')).toBe(true);
    step(evening, false, 60);
    expect(here()).toBe(0);
    step(fair, false, 70);
    expect(here()).toBe(start);
  });

  it('moves a swing only with a child on it, and lets it settle still once they are off', () => {
    const crowd = new ParkCrowd(PARK_MEMBERS, fair);
    expect(crowd.swingTaken(0)).toBe(true);
    let amp = 0;
    for (let i = 0; i < 200; i++) amp = swingAmp(amp, crowd.swingTaken(0), 0.05);
    expect(amp).toBeCloseTo(SWING.amp, 5);
    // In the rain the child gets off and the swing settles.
    for (let i = 0; i < 20 * 60; i++) crowd.step(0.05, fair, true);
    expect(crowd.swingTaken(0)).toBe(false);
    for (let i = 0; i < 200; i++) amp = swingAmp(amp, crowd.swingTaken(0), 0.05);
    expect(amp).toBeLessThan(0.001);
    expect(swingAmp(0, false, 1)).toBe(0);
  });

  it('seats four at the picnic table, eating and drinking', () => {
    expect(PARK_MEMBERS.filter((m) => m.role === 'picnic')).toHaveLength(4);
    const src = read('../Park3D.tsx');
    expect(src).toContain('a cup or a bite raised to the mouth');
    expect(src).toContain('park-grass');
  });
});

describe('ground mist and the branch', () => {
  it('lies over the street, the pavement and the park, never inside the branch', () => {
    expect(mistClipped(0, 0)).toBe(true);
    expect(mistClipped(-10, 12)).toBe(true);
    expect(mistClipped(0, KERB_Z + 1)).toBe(false);
    expect(mistClipped(0, STREET.z0 + 1)).toBe(false);
    expect(mistClipped(PARK_GATE[0], PARK_GATE[1] - 5)).toBe(false);
  });

  it('thickens in fog and in smog', () => {
    const noon = 12 * 60;
    expect(atmosphereAt(noon, CLEAR).mist).toBeLessThan(0.1);
    expect(atmosphereAt(noon, WEATHER_MIX.smog).mist).toBeGreaterThan(0.4);
    // A fine, light dust haze, never a thick wall.
    expect(atmosphereAt(noon, WEATHER_MIX.smog).mist).toBeLessThan(0.7);
  });
});

describe('the guard cabin by the main entrance', () => {
  const run = (g: FrontGuard, seconds: number, minute: number, wet: boolean, each?: () => void): void => {
    for (let i = 0; i < seconds * 20; i++) {
      g.step(0.05, minute, wet);
      each?.();
    }
  };
  const inBox = (p: V2): boolean => Math.abs(p[0] - GUARD_CABIN.x) < GUARD_CABIN.w / 2 && Math.abs(p[1] - GUARD_CABIN.z) < GUARD_CABIN.d / 2;

  it('patrols by day, goes in by the door when it rains or at night, and comes out again', () => {
    expect(inCabin(12 * 60, false)).toBe(false);
    expect(inCabin(12 * 60, true)).toBe(true);
    expect(inCabin(23 * 60, false)).toBe(true);
    const g = new FrontGuard(12 * 60, false);
    let was = g.figures().duty.at;
    const throughDoorOnly = (): void => {
      const now = g.figures().duty.at;
      // Into or out of the cabin only through its door.
      if (inBox(now) !== inBox(was)) expect(Math.abs(now[1] - CABIN_DOOR[1]), 'by the door').toBeLessThan(0.35);
      was = now;
    };
    run(g, 40, 12 * 60, false, throughDoorOnly);
    expect(g.sheltered()).toBe(false);
    run(g, 15, 12 * 60, true, throughDoorOnly);
    expect(g.sheltered()).toBe(true);
    run(g, 15, 12 * 60, false, throughDoorOnly);
    expect(g.sheltered()).toBe(false);
  });

  it('hands over at a change of shift: the next guard walks up and the other walks off', () => {
    const g = new FrontGuard(13 * 60 + 59, false);
    run(g, 1, 13 * 60 + 59, false);
    run(g, 1, 14 * 60, false);
    expect(g.figures().leaving).not.toBeNull();
    run(g, 60, 14 * 60 + 5, false);
    expect(g.figures().leaving).toBeNull();
    expect(g.figures().duty.at[1]).toBeLessThan(KERB_Z);
  });
});

describe('the start-of-day banner', () => {
  it('names the day and what kind of day it is, what is going on and what to watch', () => {
    expect(dayLabel(3)).toBe('03');
    const copy = dayIntroCopy(3, DAY_EVENTS.NORMAL);
    expect(copy.heading).toBe('Day 03 – An ordinary day');
    expect(copy.detail).toBe(DAY_EVENTS.NORMAL.blurb);
    expect(copy.watchLabel).toBe('What to watch:');
    expect(copy.special).toBe(false);
  });

  it('opens on a new day, but not over the end-of-day report, and once a day', () => {
    expect(introDue(null, 1, false)).toBe(true);
    expect(introDue(1, 1, false)).toBe(false);
    expect(introDue(1, 2, true)).toBe(false);
    expect(introDue(1, 2, false)).toBe(true);
  });

  it('is one banner over the frame both views share, so the 2D blueprint and the 3D office show it alike', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'LivingBank.tsx'), 'utf8');
    expect(src.match(/<DayIntroBanner \/>/g)).toHaveLength(1);
    const frame = src.slice(src.indexOf('<BankMap />'), src.indexOf('<Inspector />'));
    expect(frame).toContain('<DayIntroBanner />');
  });
});
