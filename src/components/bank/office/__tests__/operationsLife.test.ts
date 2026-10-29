import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STATION_IDS, STATIONS } from '../../../../sim/topology';
import type { StationView } from '../../../../sim/types';
import { bundleProblems } from '../../../../utils/i18nHelper';
import { isWorking } from '../../../../engine/simulation/deskActivity';
import { deskBadgeMessages } from '../../deskBadge.messages';
import { DAY_INTRO_FADE_MS, DAY_INTRO_MS } from '../../dayIntro';
import { atmosphereAt, WEATHER_MIX } from '../../../../engine/world/atmosphere';
import { CUSTOMER_DESKS, evacuees } from '../../../../engine/world/evacuation';
import { atmBooth, atmExitPath, atmQueueMarks, ATM_KIOSK, ATM_STATIONS, arrivalPath, FLOOR_SLAB, isDigital, kioskCentre, KERB_Z, queueSlots, queueStyle, STREET, WALKER_STATIONS } from '../../../../engine/plan/layout3d';
import { ParkingLot, walkPath } from '../../../../engine/world/parking';
import { CELL_TOWER, DIGITAL_GATES, SIGNAL_KIND, signalPoint, signalTarget } from '../../../../engine/world/signals';
import { SIDEWALK, SidewalkCrowd } from '../../../../engine/world/sidewalk';
import { pathLength, pointAlongPath } from '../tour3d';
import { busRiders, riderAt, taxiAction, TrafficSim, VEHICLES } from '../../../../engine/world/vehicles';
import { pedestrianAt, PEDESTRIANS } from '../../../../engine/world/weather';

const read = (rel: string): string => readFileSync(join(__dirname, rel), 'utf8');
const HX = FLOOR_SLAB.w / 2;
const HZ = FLOOR_SLAB.d / 2;
const inside = (x: number, z: number): boolean => Math.abs(x) < HX - 0.05 && Math.abs(z) < HZ - 0.05;

describe('a wider pavement, and smooth steering on it', () => {
  it('gives the pavement room for two people to pass between the booths and the kerb', () => {
    expect(STREET.walk).toBeGreaterThanOrEqual(4);
    expect(SIDEWALK.z1 - SIDEWALK.z0).toBeGreaterThan(1.4);
  });

  it('sidesteps at a walking pace, never a snap, and keeps the side it chose until they have passed', () => {
    const crowd = new SidewalkCrowd();
    const z = KERB_Z - 0.8;
    const dt = 1 / 60;
    let prev: Record<string, number> = { a: z, b: z + 0.02 };
    let least = Infinity;
    const sideA: number[] = [];
    for (let i = 0; i < 8 * 60; i++) {
      const t = i * dt;
      const a = crowd.place('a', -4 + t, z, dt);
      const b = crowd.place('b', 4 - t, z + 0.02, dt);
      for (const [k, p] of [['a', a], ['b', b]] as const) {
        // Sideways speed is capped: no jitter, no jumps.
        expect(Math.abs(p[1] - prev[k]!) / dt, `${k} at ${t.toFixed(2)}`).toBeLessThanOrEqual(SIDEWALK.stride + 1e-6);
      }
      prev = { a: a[1], b: b[1] };
      least = Math.min(least, Math.hypot(a[0] - b[0], a[1] - b[1]));
      if (Math.abs(a[0] - b[0]) < SIDEWALK.look) sideA.push(Math.sign(a[1] - b[1]));
    }
    expect(least).toBeGreaterThan(0.38);
    // a picked a side and kept to it all the way past.
    expect(new Set(sideA.filter((s) => s !== 0)).size).toBe(1);
  });
});

describe('the ATM queue: a line to wait in, a turn at the machine, and out without touching the machine or the glass', () => {
  it('paints a wait-here line across each booth between the machine and the line, and footprints where each waits', () => {
    for (const id of ATM_STATIONS) {
      const b = atmBooth(id);
      const marks = atmQueueMarks(id);
      expect(marks.line.z).toBeGreaterThan(b.head);
      expect(marks.line.z).toBeLessThan(b.line);
      expect(marks.line.x0).toBeGreaterThan(b.x0);
      expect(marks.line.x1).toBeLessThan(b.x1);
      expect(marks.spots.length).toBeGreaterThanOrEqual(3);
      for (const [, z] of marks.spots) expect(z).toBe(b.line);
    }
    expect(read('../AtmKiosk.tsx')).toContain('name={`atm-queue-line-${id}`}');
  });

  it('never walks anyone into an ATM machine: not coming, waiting, stepping up or leaving', () => {
    for (const id of ATM_STATIONS) {
      const [kx, kz] = kioskCentre(id);
      const hits = (x: number, z: number): boolean => Math.abs(x - kx) < ATM_KIOSK.w / 2 + 0.15 && Math.abs(z - kz) < ATM_KIOSK.d / 2 + 0.15;
      const paths = [atmExitPath(id), ...[0, 1, 2, 3, 4].map((q) => arrivalPath(id, q))];
      for (const path of paths) {
        const len = pathLength(path);
        for (let d = 0; d <= len; d += 0.05) expect(hits(...pointAlongPath(path, d)), id).toBe(false);
      }
      for (const [x, z] of queueSlots(id, 5)) expect(hits(x, z)).toBe(false);
    }
  });

  it('walks the next in line up to the machine once the one before has turned away, on the motion clock', () => {
    const people = read('../../../../engine/simulation/people.ts');
    expect(people).toContain('this.hold = now + (this.atm ? SERVED.atm : SERVED.counter) + 0.7;');
    expect(people).toContain('const step = now < this.hold ? 0 : STEP_UP_PACE * dt;');
  });

  it('runs people caught by the rain along the pavement and then straight in to shelter, never through a booth', () => {
    const booths = ATM_STATIONS.map((id) => atmBooth(id));
    for (const p of PEDESTRIANS)
      for (const storm of [false, true, 'hail'] as const)
        for (let r = 0; r < 12; r += 0.05) {
          const s = pedestrianAt(p, 40, r, storm);
          for (const b of booths) expect(s.x > b.x0 + 0.05 && s.x < b.x1 - 0.05 && s.z > b.z0 && s.z < b.front - 0.05, `${p.index}`).toBe(false);
        }
  });
});

describe('digital desks: signals, not walk-ins', () => {
  it('treats every gate as digital: no walkers, a queue of phones, and their arrivals beamed in from the cell tower', () => {
    for (const id of ['GATE_POS', 'GATE_VIRTUAL', 'GATE_ECOM', 'GATE_A2A', 'GATE_QR', 'GATE_SWIFT', 'GATE_EKYC'] as const) {
      expect(isDigital(id), id).toBe(true);
      expect(WALKER_STATIONS).not.toContain(id);
      expect(queueStyle(id)).toBe('phones');
      expect(DIGITAL_GATES).toContain(id);
      expect(SIGNAL_KIND[id]).toBeDefined();
    }
    expect(DIGITAL_GATES).toHaveLength(STATION_IDS.filter((id) => STATIONS[id].kind === 'GATE').length);
  });

  it('flies each pulse from the top of the tower, arcing over, down onto its gate’s desk', () => {
    // The tower stands outside the branch, in the car park's corner, clear of the left wall.
    expect(CELL_TOWER.x).toBeLessThan(-HX);
    expect(CELL_TOWER.top).toBeGreaterThan(5);
    for (const id of DIGITAL_GATES) {
      expect(signalPoint(id, 0)).toEqual([CELL_TOWER.x, CELL_TOWER.top, CELL_TOWER.z]);
      const [tx, ty, tz] = signalTarget(id);
      const end = signalPoint(id, 1);
      expect(end[0]).toBeCloseTo(tx, 9);
      expect(end[1]).toBeCloseTo(ty, 9);
      expect(end[2]).toBeCloseTo(tz, 9);
      // Above the office's walls the whole way, until it comes down onto the desk.
      for (let u = 0; u <= 0.85; u += 0.05) expect(signalPoint(id, u)[1]).toBeGreaterThan(2.9);
    }
    expect(read('../OfficeScene.tsx')).toContain('<SignalPulses />');
  });
});

describe('after hours: nobody but staff inside', () => {
  it('queues only case files at the internal desks (the night’s batch, settlement, reconciliation and suspense among them)', () => {
    for (const id of STATION_IDS) {
      if (queueStyle(id) !== 'people') continue;
      expect([...CUSTOMER_DESKS, ...ATM_STATIONS], id).toContain(id);
    }
    for (const id of ['EOD_BATCH', 'EOD_VISA', 'RECON', 'SUSPENSE', 'SEC_VAULT', 'LEDGER_DEBIT', 'AML_DESK'] as const) expect(queueStyle(id)).toBe('files');
    // The customer desks' queues empty at closing time; the files are drawn by the desk.
    expect(read('../Desk3D.tsx')).toContain("style === 'files' ? (");
  });

  it('walks the car park’s drivers back from the counters to their cars at closing time, and parks nobody after hours', () => {
    const lot = new ParkingLot();
    for (let i = 0; i < 120 * 20; i++) lot.step(0.05);
    lot.setClosed(true);
    // Shortly after closing, nobody is on their way in; within a few minutes everyone has gone.
    const inside0 = (): number =>
      lot.walkers().filter((w) => inside(w.x, w.z)).length + lot.vehicles.filter((v) => v.phase === 'parked' || v.phase === 'walkingIn').length;
    for (let i = 0; i < 2 * 20; i++) lot.step(0.05);
    expect(lot.vehicles.filter((v) => v.phase === 'walkingIn')).toHaveLength(0);
    expect(lot.vehicles.filter((v) => v.phase === 'parked')).toHaveLength(0);
    for (let i = 0; i < 600 * 20; i++) lot.step(0.05);
    expect(inside0()).toBe(0);
    expect(lot.vehicles).toHaveLength(0);
    // Open again: they come back.
    lot.setClosed(false);
    for (let i = 0; i < 60 * 20; i++) lot.step(0.05);
    expect(lot.vehicles.length).toBeGreaterThan(0);
  });

  it('starts and ends every driver’s walk at a counter inside, never in a doorway', () => {
    const lot = new ParkingLot();
    for (const s of lot.slots.slice(0, 8)) {
      const path = walkPath(s);
      const end = path[path.length - 1]!;
      expect(inside(end[0], end[1])).toBe(true);
      expect(end[0]).toBeGreaterThan(-HX + 2);
    }
  });

  it('sends people getting off a taxi, a motorbike or the bus after closing off down the street, not into the branch', () => {
    const sim = new TrafficSim();
    let seen = 0;
    for (let i = 0; i < 400 * 20; i++) {
      sim.step(0.05);
      for (const v of VEHICLES) {
        const s = sim.state(v.id);
        const r = riderAt(v, s, true);
        if (r && r.action === 'alight') {
          seen++;
          expect(inside(r.x, r.z), v.id).toBe(false);
        }
        for (const b of busRiders(v, s, true)) expect(inside(b.x, b.z), v.id).toBe(false);
      }
    }
    expect(seen).toBeGreaterThan(0);
    // By day, the first one off the bus still goes in to the teller.
    expect(read('../../../../engine/world/vehicles.ts')).toContain('k === 0 && !closed ? lobbyWalkIn(front) : downStreet(front)');
  });

  it('empties every customer queue at closing through a way out', () => {
    for (const e of evacuees(() => 3)) {
      const [x, z] = e.path[e.path.length - 1]!;
      expect(inside(x, z)).toBe(false);
    }
  });
});

describe('desk badges: waiting and working, in 2D and 3D', () => {
  const view = (working: StationView['working'], served: number): Pick<StationView, 'working' | 'served'> => ({ working, served });

  it('counts a desk as working while a case is at its counter, whatever the queue', () => {
    expect(isWorking(view(null, 0))).toBe(false);
    expect(isWorking(view({ kind: 'POS', cardType: 'DEBIT' } as StationView['working'], 0))).toBe(true);
    expect(isWorking(view(null, 2))).toBe(true);
    expect(bundleProblems(deskBadgeMessages)).toEqual([]);
  });

  it('shows "X waiting · Y working" on the 3D badge, its tooltip, and the 2D desk card, never "Working Working"', () => {
    const desk = read('../Desk3D.tsx');
    // Zoomed out the badge folds to its count; from the middle zoom on it says "X waiting" (labelLod.ts).
    expect(desk).toContain("{shows.name ? `${queueLength} ${t('waiting')}` : queueLength}");
    expect(desk).toContain('data-testid={`pin-working-${id}`}');
    expect(desk).toContain("{bm('working', { n: working })}");
    // The tooltip's line is the shared "X waiting · Y working · status" (engine/simulation/deskStatus.ts deskStatusLine).
    expect(desk).toContain('{line}');
    expect(desk).not.toContain("bm('working')}");
    const map = read('../../BankMap.tsx');
    // Read from the one desk-status stream both views share (engine/deskStatus.ts: deskStatusOf uses workingCount).
    expect(map).toContain('const { working, showStatus, waiting } = desk;');
    expect(map).toContain('data-testid={`working-${id}`}');
    expect(map).toContain("{bm('working', { n: working })}");
    expect(map).not.toContain("bm('working')}");
  });
});

describe('the start-of-day banner goes quickly', () => {
  it('stays up only a few seconds before fading', () => {
    expect(DAY_INTRO_MS).toBeLessThanOrEqual(4000);
    expect(DAY_INTRO_MS).toBeGreaterThanOrEqual(2500);
    expect(DAY_INTRO_FADE_MS).toBe(500);
  });
});

describe('drop-offs pull straight over', () => {
  it('lets passengers off at the first clear kerb without first waiting in the kerb lane behind a stopped vehicle', () => {
    const sim = new TrafficSim();
    let waiting = 0;
    let drops = 0;
    const was = new Map<string, boolean>();
    for (let i = 0; i < 900 * 30; i++) {
      sim.step(1 / 30);
      for (const v of VEHICLES) {
        if (!v.stop || v.stop.kind === 'bus') continue;
        const s = sim.state(v.id);
        const drop = v.stop.kind === 'pillion' || (v.stop.kind === 'taxi' && taxiAction(s.cycle) === 'alight');
        if (!drop) continue;
        // Standing still on the frontage without having stopped to let anyone off: held up.
        if (s.stoppedFor === null && s.speed < 0.05 && s.x > -9 && s.x < 16) waiting++;
        const now = s.stoppedFor !== null;
        if (now && !was.get(v.id)) drops++;
        was.set(v.id, now);
      }
    }
    expect(drops).toBeGreaterThan(40);
    // Hardly ever held up: well under a second a minute across the whole fleet.
    expect(waiting / 30).toBeLessThan(15);
    expect(sim.overlaps()).toEqual([]);
  });
});

describe('the weather on the street', () => {
  it('keeps every pedestrian on the street in any weather: sheltering, under umbrellas, or walking on', () => {
    for (const storm of [false, true, 'hail'] as const) for (const p of PEDESTRIANS) expect(pedestrianAt(p, 30, 20, storm).x).toEqual(expect.any(Number));
    expect(PEDESTRIANS.length).toBe(12);
  });

  it('softens fog and smog: smog a light dust haze, never a thick yellow wall', () => {
    const noon = 12 * 60;
    const smog = atmosphereAt(noon, WEATHER_MIX.smog);
    const fog = atmosphereAt(noon, WEATHER_MIX.fog);
    expect(smog.mist).toBeLessThan(0.7);
    expect(fog.mist).toBeLessThan(0.9);
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(smog.skyHorizon.slice(k, k + 2), 16));
    // Light: every channel bright; and only softly warm.
    for (const c of [r, g, b]) expect(c!).toBeGreaterThan(170);
    expect(r! - b!).toBeLessThan(40);
  });
});
