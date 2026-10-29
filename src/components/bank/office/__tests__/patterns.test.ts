import { describe, expect, it } from 'vitest';
import { STATION_IDS, STATIONS } from '../../../../sim/topology';
import { journeyPose, journeyState, type Journey } from '../../../../engine/simulation/customerLifecycle';
import { EntityFactory } from '../../../../engine/simulation/EntityFactory';
import { routesFor, MAIN_GATE_STAFF_ROUTE } from '../../../../engine/simulation/routes';
import { MORNING_SHIFT_SCHEDULE, NIGHT_SHIFT_SCHEDULE, StaffEntity } from '../../../../engine/simulation/staff';
import { evacuationRoute, servedExit } from '../../../../engine/world/evacuation';
import { arriveRoute, leaveRoute } from '../focus3d';
import { arrivalPath, atmExitPath, deskPose, laneLength, queueSlots, WALKER_STATIONS, type V2 } from '../../../../engine/plan/layout3d';
import { DAY_SHIFT, NIGHT_SHIFT } from '../../../../sim/roster';
import { drivingStateOf, KerbsideDropOff, TrafficSim, VEHICLES, type DropOffStrategy } from '../../../../engine/world/vehicles';

describe('a served customer’s journey (State)', () => {
  const path: V2[] = [
    [0, 0],
    [0, 2],
    [4, 2],
  ];
  const journey = (stopAt: number): Journey => ({ path, length: laneLength(path), stopAt, wait: 3, turn: 0.5, pace: 1 });

  it('walks up, does its business, turns, walks off, and is gone, in that order', () => {
    const j = journey(2);
    const seen: string[] = [];
    for (let t = 0; t < 12; t += 0.05) {
      const s = journeyState(j, t);
      if (seen.at(-1) !== s) seen.push(s);
    }
    expect(seen).toEqual(['walking', 'interacting', 'turning', 'departing', 'gone']);
    // At the counter it stands still facing it, keying in or talking; turning, it has stopped.
    expect(journeyPose(j, 3)).toMatchObject({ state: 'interacting', at: [0, 2], yaw: Math.PI, walking: false, busy: true });
    expect(journeyPose(j, 4.8).busy).toBe(false);
    expect(journeyPose(j, 6).walking).toBe(true);
  });

  it('starts at the counter (no walk-up) for someone served there, and never moves while finishing up', () => {
    const j = journey(0);
    expect(journeyState(j, 0)).toBe('interacting');
    expect(journeyPose(j, 1).at).toEqual([0, 0]);
    expect(journeyPose(j, 1).busy).toBe(false);
    // The turn eases round: it never snaps.
    let last = journeyPose(j, 2.5).yaw;
    for (let t = 2.5; t <= 3; t += 0.02) {
      const y = journeyPose(j, t).yaw;
      expect(Math.abs(y - last)).toBeLessThan(0.3);
      last = y;
    }
  });
});

describe('way-finding (Strategy)', () => {
  it('gives each desk the way its customers have always taken', () => {
    for (const id of WALKER_STATIONS) {
      const r = routesFor(id);
      for (const place of [0, 2]) expect(r.approach(place)).toEqual(arrivalPath(id, place));
      const at = queueSlots(id, 1)[0]!;
      expect(r.depart(0)).toEqual(STATIONS[id].kind === 'ATM' ? [at, ...atmExitPath(id)] : evacuationRoute(at, 2).path);
      expect(servedExit(id)).toEqual(r.depart(0));
    }
    const pose = deskPose('RECON');
    expect(MAIN_GATE_STAFF_ROUTE.arrive(pose, [0.4, -0.8], 1)).toEqual(arriveRoute(pose, [0.4, -0.8], 1));
    expect(MAIN_GATE_STAFF_ROUTE.leave(pose, [0.4, -0.8], 1)).toEqual(leaveRoute(pose, [0.4, -0.8], 1));
  });
});

describe('drop-offs (Strategy) and the kerb stop (State)', () => {
  it('drives the same with the kerbside strategy as before, and lets another strategy be swapped in', () => {
    const a = new TrafficSim();
    const b = new TrafficSim(VEHICLES, new KerbsideDropOff());
    for (let i = 0; i < 1200; i++) {
      a.step(1 / 20);
      b.step(1 / 20);
    }
    expect([...a.states()]).toEqual([...b.states()]);
    // A strategy that never finds a spot: drop-off vehicles drive past, and only the bus still stops.
    const never: DropOffStrategy = { findSpot: () => null, keepsIntent: () => false };
    const c = new TrafficSim(VEHICLES, never);
    const stopped = new Set<string>();
    for (let i = 0; i < 1500 * 20; i += 1) {
      c.step(1 / 20);
      if (i % 20 === 0) for (const [id, s] of c.states()) if (s.stoppedFor !== null) stopped.add(id);
    }
    for (const id of stopped) expect(VEHICLES.find((v) => v.id === id)!.stop!.kind).not.toBe('pillion');
    expect(stopped.has('bus-1')).toBe(true);
    expect(drivingStateOf({ stoppedAt: 3 })).toBe('at-kerb');
    expect(drivingStateOf({ stoppedAt: null })).toBe('driving');
  });
});

describe('staff on their shift’s schedule (Strategy) and made by the factory', () => {
  it('puts the night desks’ staff on the night schedule and everyone else on the morning one, with the roster’s hours', () => {
    const f = new EntityFactory();
    const night = f.staff('RECON', ['a', 'b']);
    const day = f.staff('TELLER_CASH', ['c']);
    expect(night.every((s) => s.schedule === NIGHT_SHIFT_SCHEDULE)).toBe(true);
    expect(day[0]!.schedule).toBe(MORNING_SHIFT_SCHEDULE);
    expect(NIGHT_SHIFT_SCHEDULE.hours).toBe(NIGHT_SHIFT);
    expect(MORNING_SHIFT_SCHEDULE.hours).toBe(DAY_SHIFT);
    expect(night[1]!.seat).toBe(1);
  });

  it('keeps someone away until they set off, then as the roster has them (the night’s sitting ready until 23:00)', () => {
    const clerk = new StaffEntity('n1', 'RECON', 0, NIGHT_SHIFT_SCHEDULE);
    expect(clerk.presence(21 * 60)).toBe('roster');
    expect(clerk.presence(22 * 60)).toBe(clerk.setOff > 22 * 60 ? 'away' : 'ready');
    expect(clerk.presence(22.5 * 60)).toBe('ready');
    expect(clerk.presence(23 * 60)).toBe('roster');
    const teller = new StaffEntity('d1', 'TELLER_CASH', 0, MORNING_SHIFT_SCHEDULE);
    expect(teller.presence(teller.setOff - 0.5)).toBe('away');
    expect(teller.presence(teller.setOff)).toBe('roster');
  });

  it('makes the world’s traffic, car park, park and guards in one place', () => {
    const f = new EntityFactory();
    expect(f.traffic()).toBeInstanceOf(TrafficSim);
    expect(f.pedestrians().length).toBe(12);
    expect(f.parkCrowd(12 * 60).people.length).toBeGreaterThan(10);
    expect(STATION_IDS.length).toBeGreaterThan(0);
  });
});

describe('the world behind one front (Facade)', () => {
  it('ticks the world once and draws it through four renderers that only read it', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const scene = readFileSync(join(__dirname, '../OfficeScene.tsx'), 'utf8');
    const facade = scene.slice(scene.indexOf('function BankingWorldFacade'), scene.indexOf('export function OfficeScene'));
    for (const r of ['<WorldProvider>', '<WeatherRenderer />', '<TrafficRenderer />', '<CrowdRenderer />', '<DeskRenderer />']) expect(facade).toContain(r);
    expect(scene).toContain('<BankingWorldFacade>');
    // Nothing that draws the world steps it: only the engine's ticker does.
    for (const f of ['../Vehicles3D.tsx', '../Parking3D.tsx', '../Park3D.tsx', '../GuardCabin3D.tsx', '../Environment3D.tsx']) {
      const src = readFileSync(join(__dirname, f), 'utf8');
      expect(src, f).not.toMatch(/\.step\(/);
    }
  });
});

describe('closing time’s walk-out, in the engine', () => {
  it('walks the counters’ lines out exactly as the view used to, then clears', async () => {
    const { ClosingWalkout } = await import('../../../../engine/simulation/closingWalkout');
    const { evacuees, EXIT_PACE } = await import('../../../../engine/world/evacuation');
    const { pathLength, pointAlongPath } = await import('../../../../engine/plan/path');
    const queue = (): number => 3;
    const walkout = new ClosingWalkout(false);
    expect(walkout.update(false, queue)).toBe(false);
    expect(walkout.update(true, queue)).toBe(true);
    // The old Evacuation view's own reckoning, frame by frame.
    const old = evacuees(queue);
    let since = 0;
    for (let f = 0; f < 3000 && walkout.who.length; f++) {
      const dt = 1 / 60;
      since += dt;
      walkout.step(dt);
      if (!walkout.who.length) break;
      walkout.poses().forEach((p, i) => {
        const w = old[i]!;
        const len = pathLength(w.path);
        const d = (since - w.k * 0.35) * EXIT_PACE;
        expect(p.visible).toBe(d < len);
        if (p.visible) expect(p.at).toEqual(pointAlongPath(w.path, Math.max(0, d)));
      });
    }
    expect(walkout.who.length).toBe(0);
    // Already closed when first looked at: nobody is walked out again.
    const late = new ClosingWalkout(true);
    expect(late.update(true, queue)).toBe(false);
  });

  it('is stepped by the world engine with the rest of the world', async () => {
    const { WorldEngine } = await import('../../../../engine/simulation/WorldEngine');
    const world = new WorldEngine({ minute: 16.9 * 60, weather: 'clear' });
    const frame = { realDt: 1 / 60, playing: true, speed: 1, weather: 'clear' as const, queueLength: () => 2 };
    world.tick({ ...frame, minute: 16.9 * 60 });
    const v = world.walkoutVersion;
    world.tick({ ...frame, minute: 17 * 60 });
    expect(world.walkoutVersion).toBe(v + 1);
    expect(world.walkout.who.length).toBeGreaterThan(0);
  });
});

describe('random weather as spells', () => {
  it('holds each weather for its spell, never repeats one, and stops when a weather is picked by hand', async () => {
    const { WeatherCycle } = await import('../../../../engine/world/weatherCycle');
    const { WEATHER_SPAN } = await import('../../../../engine/world/atmosphere');
    let r = 0;
    const cycle = new WeatherCycle(() => (r = (r + 0.37) % 1));
    let now = cycle.update(9 * 60, 'clear', true)!;
    expect(now).not.toBe('clear');
    const { from, until } = cycle.current!;
    expect(until - from).toBeGreaterThanOrEqual(WEATHER_SPAN[now][0]);
    expect(until - from).toBeLessThanOrEqual(WEATHER_SPAN[now][1]);
    expect(cycle.update(from + 1, now, true)).toBeNull();
    const next = cycle.update(until, now, true)!;
    expect(next).not.toBe(now);
    now = next;
    // The clock wound back (a new day): a new spell at once.
    expect(cycle.update(8 * 60, now, true)).not.toBeNull();
    expect(cycle.update(8 * 60 + 1, now, false)).toBeNull();
    expect(cycle.current).toBeNull();
  });
});
