import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StationView } from '../../../../sim/types';
import { workingCount, statusAfterWorking } from '../../../../engine/simulation/deskActivity';
import { fadeToward, WEATHER_BLEND_S } from '../../../../engine/world/atmosphere';
import { MIST_BANKS, MIST_CLIP } from '../Environment3D';
import { servedExit } from '../../../../engine/world/evacuation';
import { arriveRoute, arrivalMinute, arrivalState, leaveRoute, STAFF_ARRIVAL } from '../focus3d';
import { ATM_STATIONS, atmBooth, CAR_PARK_FOOTWAY_X, deskPose, EYE_POLAR, ISO_POLAR, KERB_Z, MAIN_GATE, queueSlots, ROAD_END, STREET, WALK_IN_DESKS, type V2 } from '../../../../engine/plan/layout3d';
import { LOT, LOT_SIDE } from '../../../../engine/world/parking';
import { PARK } from '../../../../engine/world/parkPlan';
import { ParkCrowd, PARK_MEMBERS, PARK_PACE, PARK_STAY, wantsPark } from '../../../../engine/world/parkLife';
import { SidewalkCrowd, SIDEWALK } from '../../../../engine/world/sidewalk';
import { pathLength, pointAlongPath } from '../tour3d';
import { TAXI_X, TrafficSim, TRAFFIC_SPAN, type Vehicle } from '../../../../engine/world/vehicles';

const read = (rel: string): string => readFileSync(join(__dirname, rel), 'utf8');

describe('the outdoor mist: even everywhere, and cross-fading', () => {
  it('lies as one even sheet over the street, the lane, the park and the car park, cut out over the branch', () => {
    expect(MIST_BANKS).toHaveLength(1);
    const [cx, y, cz, w, d] = MIST_BANKS[0]!;
    const covers = (x: number, z: number): boolean => Math.abs(x - cx) < w / 2 && Math.abs(z - cz) < d / 2;
    for (const [x, z] of [
      [0, KERB_Z - 0.5],
      [0, (KERB_Z + ROAD_END) / 2],
      [(PARK.x0 + PARK.x1) / 2, (PARK.z0 + PARK.z1) / 2],
      [(LOT_SIDE * (LOT.x0 + LOT.x1)) / 2, (LOT.z0 + LOT.z1) / 2],
    ] as const)
      expect(covers(x, z)).toBe(true);
    expect(y).toBeLessThan(0.3);
    expect(MIST_CLIP.z1).toBeLessThan(KERB_Z);
  });

  it('eases its thickness to a new weather over two seconds instead of snapping', () => {
    let v = 0;
    const seen: number[] = [];
    for (let t = 0; t < WEATHER_BLEND_S + 0.5; t += 0.05) {
      v = fadeToward(v, 0.8, 0.05);
      seen.push(v);
    }
    // Steady, small steps, never past the target, and there in about two seconds.
    for (let k = 1; k < seen.length; k++) expect(seen[k]! - seen[k - 1]!).toBeLessThanOrEqual(0.05 / WEATHER_BLEND_S + 1e-9);
    expect(seen[Math.round((0.8 * WEATHER_BLEND_S) / 0.05) - 2]).toBeLessThan(0.8);
    expect(v).toBe(0.8);
    expect(fadeToward(0.8, 0, 0.05)).toBeCloseTo(0.8 - 0.05 / WEATHER_BLEND_S, 9);
    expect(read('../Environment3D.tsx')).toContain('s.mist = fadeToward(s.mist, a.mist, dt);');
  });
});

describe('served at a counter or an ATM: finish, turn, walk away', () => {
  it('walks the one served at a counter back out of the side door to the car park, and at an ATM off down the street', () => {
    for (const id of WALK_IN_DESKS) {
      const out = servedExit(id);
      expect(out[0]).toEqual(queueSlots(id, 1)[0]);
      expect(out.at(-1)![0]).toBe(CAR_PARK_FOOTWAY_X);
      expect(pathLength(out)).toBeGreaterThan(5);
    }
    for (const id of ATM_STATIONS) {
      const out = servedExit(id);
      const b = atmBooth(id);
      expect(out[0]![1]).toBe(b.head);
      // Out of the booth onto the pavement, and past the end of the street.
      expect(Math.abs(out.at(-1)![0])).toBeGreaterThan(STREET.halfWidth);
    }
  });

  it('keeps the one served visible on the spot until they turn and walk off: nobody vanishes at the desk', () => {
    const desk = read('../Desk3D.tsx');
    expect(desk).toContain('function ServedCustomer(');
    // While finishing up they stand at the spot where they were served, then turn smoothly to the way out.
    expect(desk).toContain('const now = journeyPose(journey, motion.t - s.start);');
    expect(desk).toContain('who: before + j + salt');
    // Talking to the teller at the front of a counter's line.
    expect(desk).toContain('<CounterUser index={who}');
    expect(read('../OfficeScene.tsx')).not.toContain('AtmLeavers');
  });
});

describe('the park in the weather', () => {
  const noon = 12 * 60;
  const want = (m: (typeof PARK_MEMBERS)[number]): boolean => wantsPark(m, noon);
  const here = (c: ParkCrowd): number => c.people.filter((p) => c.poseOf(p).pose !== 'away').length;

  /** Steps the crowd `minutes` of the bank's day at one minute of the bank to `rate` seconds of drawn time. */
  const run = (c: ParkCrowd, sky: 'dry' | 'rain' | 'storm', from: number, minutes: number, rate = 1): number => {
    for (let m = 0; m < minutes; m += 0.05 / rate) c.step(0.05, want, sky, from + m);
    return from + minutes;
  };

  it('stays about half an hour in fair weather', () => {
    const c = new ParkCrowd(PARK_MEMBERS, want);
    const start = here(c);
    run(c, 'dry', noon, 5);
    expect(here(c)).toBe(start);
    // Someone's visit is up within the longest stay, so people come and go.
    let left = false;
    let m = noon + 5;
    while (m < noon + PARK_STAY.dry[1] + 2 && !left) {
      m = run(c, 'dry', m, 1);
      left = c.people.some((p) => p.going === 'out');
    }
    expect(left).toBe(true);
  });

  it('cuts visits to five to ten minutes once it rains, under umbrellas', () => {
    const c = new ParkCrowd(PARK_MEMBERS, want);
    const start = here(c);
    let m = run(c, 'rain', noon, 4);
    expect(here(c)).toBe(start);
    expect(c.wet).toBe(true);
    m = run(c, 'rain', m, PARK_STAY.rain[1] + 4);
    expect(here(c)).toBeLessThan(start);
  });

  it('clears the park at a run in a storm, and lets nobody in until it passes', () => {
    const c = new ParkCrowd(PARK_MEMBERS, want);
    expect(here(c)).toBeGreaterThan(5);
    let m = run(c, 'storm', noon, 0.2);
    expect(c.storm).toBe(true);
    expect(c.people.some((p) => p.going === 'out')).toBe(true);
    m = run(c, 'storm', m, 2, 40);
    expect(here(c)).toBe(0);
    expect(PARK_PACE.run).toBeGreaterThan(PARK_PACE.wet);
    expect(read('../Park3D.tsx')).toContain('tempo={running ? 1.7 : 1}');
  });
});

describe('waiting and talking people stand still; walkers curve smoothly round them', () => {
  const z = (SIDEWALK.z0 + SIDEWALK.z1) / 2;

  it('locks someone standing still where they are, however close a walker comes', () => {
    const crowd = new SidewalkCrowd();
    const dt = 1 / 60;
    let walkerZ: number[] = [];
    for (let t = 0; t < 6; t += dt) {
      const [sx, sz] = crowd.place('waiting', 0, z, dt, true);
      expect([sx, sz]).toEqual([0, z]);
      const [, wz] = crowd.place('walker', -4 + t * 1.3, z, dt);
      walkerZ.push(wz);
    }
    // The walker curves out and back once: its sideways motion changes direction at most twice (out, back, settle).
    const turns = walkerZ.slice(2).filter((v, k) => Math.sign(v - walkerZ[k + 1]!) !== Math.sign(walkerZ[k + 1]! - walkerZ[k]!) && Math.abs(v - walkerZ[k + 1]!) > 1e-4).length;
    expect(turns).toBeLessThanOrEqual(2);
    expect(Math.max(...walkerZ.map((v) => Math.abs(v - z)))).toBeGreaterThan(SIDEWALK.reach * 0.6);
    walkerZ = [];
  });

  it('settles two walkers side by side at the same pace instead of hunting back and forth', () => {
    const crowd = new SidewalkCrowd();
    const dt = 1 / 60;
    const trace: number[] = [];
    for (let t = 0; t < 8; t += dt) {
      crowd.place('a', t, z, dt);
      trace.push(crowd.place('b', t + 0.2, z, dt)[1]);
    }
    const tail = trace.slice(-120);
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(0.01);
  });

  it('locks the talking pairs, the bus stop and the riders waiting at the kerb', () => {
    expect(read('../Environment3D.tsx')).toContain('sidewalk.place(`passer-${p.index}`, s.x, s.z, motion.dt, s.speed === 0)');
    expect(read('../Vehicles3D.tsx')).toContain('sidewalk.place(`bus-${id}`, r.x, r.z, motion.dt, !r.walking)');
    // Runners for shelter run: quicker steps and a lean.
    expect(read('../Environment3D.tsx')).toContain("tempo={pose === 'run' ? 1.7 : 1}");
  });
});

describe('staff walk in before their shift', () => {
  it('sets the day staff off between 07:00 and 07:20 and the night staff between 22:00 and 22:20', () => {
    for (let k = 0; k < 6; k++) {
      const day = arrivalMinute(false, `w${k}`, k);
      const night = arrivalMinute(true, `n${k}`, k);
      expect(day).toBeGreaterThanOrEqual(STAFF_ARRIVAL.day[0]);
      expect(day).toBeLessThan(STAFF_ARRIVAL.day[1]);
      expect(night).toBeGreaterThanOrEqual(22 * 60);
      expect(night).toBeLessThan(22 * 60 + 20);
      expect(day).toBeLessThan(7 * 60 + 20);
    }
  });

  it('keeps a seat empty until its person is due, and seats the night staff ready before 23:00', () => {
    const ids = ['a', 'b', 'c'];
    const at7 = arrivalState(false, ids, 7 * 60);
    expect(at7.away.length).toBeGreaterThan(0);
    expect(arrivalState(false, ids, 7.4 * 60).away).toEqual([]);
    expect(arrivalState(true, ids, 21.9 * 60)).toEqual({ away: [], early: [] });
    expect(arrivalState(true, ids, 22.6 * 60).early).toEqual(ids);
    expect(arrivalState(true, ids, 23 * 60).early).toEqual([]);
  });

  it('walks them in from down the street, through the main entrance, never through an ATM booth', () => {
    for (const id of ['TELLER_CASH', 'RECON', 'SEC_DCVV', 'LEDGER_DEBIT'] as const) {
      const pose = deskPose(id);
      const seat: V2 = [0.4, -0.86];
      const route = arriveRoute(pose, seat, 1);
      expect(route).toEqual([...leaveRoute(pose, seat, 1)].reverse());
      expect(Math.abs(route[0]![0])).toBeGreaterThan(STREET.halfWidth);
      expect(route.at(-1)).toEqual([pose.x + seat[0], pose.z + seat[1]]);
      expect(route.some(([x]) => x === MAIN_GATE.x)).toBe(true);
      for (let k = 1; k < route.length; k++) expect(route[k]![0] === route[k - 1]![0] || route[k]![1] === route[k - 1]![1]).toBe(true);
      const len = pathLength(route);
      for (let d = 0; d < len; d += 0.1) {
        const [x, z] = pointAlongPath(route, d);
        for (const b of ATM_STATIONS.map((s) => atmBooth(s))) expect(x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1, `${id} through a booth`).toBe(false);
      }
    }
    expect(read('../Desk3D.tsx')).toContain('route: MAIN_GATE_STAFF_ROUTE.arrive(pose, seatsNow[i]!, i), t: 0, index: i, arriving: true');
  });
});

describe('desk badges read "X waiting · Y working"', () => {
  const view = (n: number, working: StationView['working'] = null): Pick<StationView, 'working' | 'served' | 'workers'> => ({
    working,
    served: 0,
    workers: Array.from({ length: 3 }, (_, i) => ({ working: i < n }) as StationView['workers'][number]),
  });

  it('counts the staff working a case, at least one while the desk is working', () => {
    expect(workingCount(view(0))).toBe(0);
    expect(workingCount(view(2))).toBe(2);
    expect(workingCount(view(0, { kind: 'POS', cardType: 'DEBIT' } as StationView['working']))).toBe(1);
  });

  it('never says "working" twice: the status word drops while busy', () => {
    expect(statusAfterWorking('BUSY', 2)).toBe(false);
    expect(statusAfterWorking('CONGESTED', 2)).toBe(true);
    expect(statusAfterWorking('BUSY', 0)).toBe(true);
  });
});

describe('a lower camera tilt', () => {
  it('lets the view tilt from isometric down to nearly eye level, and resets to isometric', () => {
    expect(EYE_POLAR).toBeGreaterThan(ISO_POLAR + 0.2);
    expect(EYE_POLAR).toBeLessThan(Math.PI / 2 - 0.2);
    const scene = read('../OfficeScene.tsx');
    expect(scene).toContain('maxPolarAngle={EYE_POLAR}');
    expect(scene).toContain('glideTo(HOME_TARGET[0], HOME_TARGET[1], ISO_AZIMUTH, zoom, RESET_MS, ISO_POLAR);');
  });
});

describe('a drop-off held up in traffic pulls over where it stands', () => {
  it('signals and moves across to the kerb beside it, rather than waiting in the queue', () => {
    const at = (x: number): number => TRAFFIC_SPAN.x1 - x;
    const fleet: Vehicle[] = [
      // Crawling along the car lane in front of the frontage.
      { id: 'crawler', kind: 'sedan', side: 'near', speed: 0.3, start: at(10), color: '#000', pillion: false },
      { id: 'taxi', kind: 'taxi', side: 'near', speed: 6.5, start: at(10) - 14, color: '#0f0', pillion: false, stop: { kind: 'taxi', x: TAXI_X, wait: 5 } },
    ];
    const sim = new TrafficSim(fleet);
    let halted: number | null = null;
    let stoppedAt: number | null = null;
    for (let i = 0; i < 30 * 60 && stoppedAt === null; i++) {
      sim.step(1 / 60);
      const s = sim.state('taxi');
      if (halted === null && s.speed < 2 && Math.abs(s.x - sim.state('crawler').x) < 6) halted = s.x;
      if (s.stoppedFor !== null) stoppedAt = s.x;
    }
    expect(halted).not.toBeNull();
    expect(stoppedAt).not.toBeNull();
    // Let off within a few metres of where the traffic held it, not driven on down the street.
    expect(Math.abs(stoppedAt! - halted!)).toBeLessThan(5);
    expect(sim.overlaps()).toEqual([]);
  });
});
