import { describe, expect, it } from 'vitest';
import { STATION_IDS } from '../../../../sim/topology';
import { createBankStore } from '../../../../store/bankStore';
import { SimulationEngine } from '../../../../engine/simulation/SimulationEngine';
import { motion } from '../../../../engine/simulation/motion';
import { MAX_WALKERS } from '../../../../engine/simulation/people';
import type { WorldEngine } from '../../../../engine/simulation/WorldEngine';
import { QUEUE_VISIBLE } from '../../../../engine/plan/layout3d';

/** A bank playing a day, with a 3D world following it the way the scene does: synced as the bank moves, ticked each frame. */
function playing(beats: number, onFrame: (world: WorldEngine) => void, framesPerBeat = 40) {
  const store = createBankStore();
  store.setState({ playing: true });
  const engine = new SimulationEngine(store);
  const world = engine.createWorld('clear');
  const stop = store.subscribe((s) => world.onBank(s.view));
  for (let b = 0; b < beats; b++) {
    store.getState().tickBeat();
    for (let f = 0; f < framesPerBeat; f++) {
      const s = store.getState();
      world.tick({ realDt: 1 / 30, playing: true, speed: 1, minute: s.view.minute, weather: 'clear', queueLength: (id) => s.view.stations[id].queueLength });
      onFrame(world);
    }
  }
  stop();
  return { store, world };
}

describe('the people of the desks live in the engine', () => {
  it('walks customers to the lines, keeps their places, serves them and walks them off: nobody vanishes', () => {
    let walked = 0;
    let served = 0;
    let lateServed = 0;
    playing(160, (world) => {
      walked = Math.max(walked, world.arrivals.walks.length);
      for (const id of STATION_IDS) {
        const line = world.line(id);
        // Never more figures than places drawn, and every one shown stands where the engine put it.
        expect(line.figures.filter((f) => f.visible).length).toBeLessThanOrEqual(Math.min(line.shown, QUEUE_VISIBLE));
        served = Math.max(served, line.served.length);
        // Someone who walks up to the counter or machine does their business there (keying in, talking).
        if (line.served.some((s) => s.business)) lateServed++;
        // Everyone being served has a pose the view can draw.
        for (const s of line.served) if (motion.t >= s.start) expect(line.servedPoses.has(s.key)).toBe(true);
      }
      expect(world.arrivals.walks.length).toBeLessThanOrEqual(MAX_WALKERS);
    });
    expect(walked).toBeGreaterThan(0);
    expect(served).toBeGreaterThan(0);
    expect(lateServed).toBeGreaterThan(0);
  });

  it('walks the day’s staff in before their shift, keeping their seats empty until they sit', () => {
    let walkingIn = 0;
    let away = 0;
    // At the app's own pace: a beat before a shift is on screen 2.4 s at 1x (sim/clock.ts), 72 frames at 30 a second: 07:00-08:00 in one beat, then 08:00-09:00 in twelve.
    const { world } = playing(13, (w) => {
      for (const id of STATION_IDS) {
        const staff = w.staff(id);
        walkingIn += staff.walks.filter((x) => x.arriving).length;
        away += staff.away.size;
        // A seat is empty while its person is away or still on the way in.
        for (const x of staff.walks) if (x.arriving) expect(staff.absent().has(x.id)).toBe(true);
      }
    }, 72);
    expect(away).toBeGreaterThan(0);
    expect(walkingIn).toBeGreaterThan(0);
    // By 09:00, when the doors open, everyone is in and seated.
    for (const id of STATION_IDS) {
      expect(world.staff(id).away.size, id).toBe(0);
      expect(world.staff(id).walks.filter((x) => x.arriving).length, id).toBe(0);
    }
  });

  it('tells the views only when the people change (Observer)', () => {
    const store = createBankStore();
    store.setState({ playing: true });
    const world = new SimulationEngine(store).createWorld('clear');
    let heard = 0;
    world.subscribe(() => heard++);
    const s = store.getState();
    for (let f = 0; f < 5; f++) world.tick({ realDt: 1 / 30, playing: false, speed: 1, minute: s.view.minute, weather: 'clear' });
    expect(heard).toBe(0);
    // The same view again changes nothing.
    world.onBank(s.view);
    expect(heard).toBe(0);
    store.getState().tickBeat();
    world.onBank(store.getState().view);
    for (let f = 0; f < 200; f++) world.tick({ realDt: 1 / 30, playing: true, speed: 1, minute: store.getState().view.minute, weather: 'clear' });
    expect(heard).toBeGreaterThan(0);
  });
});

describe('the street’s people live in the engine', () => {
  it('walks the passers-by, opens umbrellas out in the rain, and lets passengers off the taxis and buses', async () => {
    const { PEDESTRIANS, underCover } = await import('../../../../engine/world/weather');
    const store = createBankStore();
    const world = new SimulationEngine(store).createWorld('clear');
    const frame = (weather: 'clear' | 'rain') => world.tick({ realDt: 1 / 30, playing: true, speed: 2, minute: 12 * 60, weather });
    let riders = 0;
    let busRiders = 0;
    for (let f = 0; f < 30 * 120; f++) {
      frame('clear');
      riders += [...world.street.riders.values()].filter(Boolean).length;
      for (const m of world.street.busRiders.values()) busRiders += m.size;
    }
    expect(world.street.passers.length).toBe(PEDESTRIANS.length);
    expect(riders).toBeGreaterThan(0);
    expect(busRiders).toBeGreaterThan(0);
    for (let f = 0; f < 30 * 6; f++) frame('rain');
    // Umbrella carriers out in the open have theirs up; nobody has one up under a roof.
    PEDESTRIANS.forEach((p, i) => {
      const s = world.street.passers[i]!;
      if (underCover(s.x, s.z)) expect(s.umbrella, `${p.index}`).toBeLessThan(1);
      else if (p.umbrella && s.pose !== 'lookup') expect(s.umbrella, `${p.index}`).toBe(1);
    });
  });
});
