import { describe, expect, it } from 'vitest';
import { STATION_IDS, STATIONS } from '../../../../sim/topology';
import { journeyPose, journeyState, type Journey } from '../engine/customerLifecycle';
import { EntityFactory } from '../engine/EntityFactory';
import { routesFor, MAIN_GATE_STAFF_ROUTE } from '../engine/routes';
import { MORNING_SHIFT_SCHEDULE, NIGHT_SHIFT_SCHEDULE, StaffEntity } from '../engine/staff';
import { evacuationRoute, servedExit } from '../evacuation';
import { arriveRoute, leaveRoute } from '../focus3d';
import { arrivalPath, atmExitPath, deskPose, laneLength, queueSlots, WALKER_STATIONS, type V2 } from '../layout3d';
import { DAY_SHIFT, NIGHT_SHIFT } from '../../../../sim/roster';
import { drivingStateOf, KerbsideDropOff, TrafficSim, VEHICLES, type DropOffStrategy } from '../vehicles';

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
