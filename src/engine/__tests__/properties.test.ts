/**
 * Property-based invariants (fast-check): checked over arbitrary seeds, days, times of day, speeds and frame timings rather
 * than hand-picked cases. A failure prints the smallest input that breaks the property.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BankSimulation } from '../../sim/bankSimulation';
import { BEATS_PER_DAY, beatIndexAt, beatMinutesAt, DAY_END, DAY_START } from '../../sim/clock';
import { STATION_IDS } from '../../sim/topology';
import { createBankStore } from '../../store/bankStore';
import { QUEUE_VISIBLE } from '../plan/layout3d';
import { advanceMotion, motion, substeps } from '../simulation/motion';
import { MAX_WALKERS, SERVED_KEEP } from '../simulation/people';
import { SimulationEngine } from '../simulation/SimulationEngine';
import { citRoutes, ParkingLot } from '../world/parking';
import { CitRun } from '../world/citRun';
import { CLEAR } from '../world/atmosphere';
import { liveMix } from '../world/weather';
import { MIN_GAP, TrafficSim } from '../world/vehicles';
import { activeCount, badgeMode, badgePills } from '../../components/bank/office/labelLod';

const seed = fc.integer({ min: 1, max: 1_000_000 });
const day = fc.integer({ min: 1, max: 30 });
const minute = fc.integer({ min: DAY_START, max: DAY_END });

/** A bank of seed `s`, day `d`, played to `m`. */
const bankAt = (s: number, d: number, m: number): BankSimulation => {
  const sim = new BankSimulation({ seed: s, day: d, headless: true });
  sim.stepUntil(m);
  return sim;
};

/** Every number in a plain-data tree, with where it is. */
function numbers(x: unknown, path = ''): Array<[string, number]> {
  if (typeof x === 'number') return [[path, x]];
  if (x === null || typeof x !== 'object') return [];
  return Object.entries(x).flatMap(([k, v]) => numbers(v, path ? `${path}.${k}` : k));
}

/** The money figures that may go below zero: profit and loss, and the change in balances. */
const SIGNED = /(net|pnl|profit|margin|delta|change)/i;

describe('the bank, for any seed, day and time of day', () => {
  it('conserves customers: everyone who came in is answered or still in the bank (entered = served + active)', () => {
    fc.assert(
      fc.property(seed, day, minute, (s, d, m) => {
        const sim = bankAt(s, d, m);
        const k = sim.snapshot().kpis;
        expect(k.arrivals).toBe(k.finished + sim.customersInFlight());
        expect(k.approved + k.declined).toBe(k.finished);
      }),
      { numRuns: 12 },
    );
  });

  it('keeps every count at or above zero: queues, desks, staff, KPIs', () => {
    fc.assert(
      fc.property(seed, day, minute, (s, d, m) => {
        const v = bankAt(s, d, m).snapshot();
        for (const id of STATION_IDS) {
          const st = v.stations[id];
          expect(st.queueLength).toBeGreaterThanOrEqual(0);
          expect(st.arrivals).toBeGreaterThanOrEqual(0);
          expect(st.served).toBeGreaterThanOrEqual(0);
          expect(st.workers.length).toBeGreaterThanOrEqual(0);
          for (const [path, n] of numbers(st.stats)) expect(n, `${id}.${path}`).toBeGreaterThanOrEqual(0);
        }
        for (const [path, n] of numbers(v.kpis)) if (!SIGNED.test(path)) expect(n, path).toBeGreaterThanOrEqual(0);
        expect(v.inFlight).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 12 },
    );
  });

  it('conserves payment tokens: each is in one place only, never duplicated, never lost', () => {
    fc.assert(
      fc.property(seed, day, minute, (s, d, m) => {
        const sim = bankAt(s, d, m);
        const packets = sim.packetsInFlight();
        const ids = packets.map((p) => `${p.kind}:${p.id}`);
        expect(new Set(ids).size).toBe(ids.length);
        expect(packets.length).toBe(sim.snapshot().inFlight);
      }),
      { numRuns: 12 },
    );
  });

  it('conserves money: debits equal credits after every beat, every posting is a whole positive amount, and the trial balance adds up', () => {
    fc.assert(
      fc.property(seed, day, (s, d) => {
        const sim = new BankSimulation({ seed: s, day: d, headless: true });
        while (!sim.dayOver) {
          sim.step();
          const { trial } = sim.snapshot().ledger;
          if (!trial.balanced || trial.totalDebits !== trial.totalCredits) return false;
          if (trial.rows.reduce((n, r) => n + r.debit, 0) !== trial.totalDebits) return false;
          if (trial.rows.reduce((n, r) => n + r.credit, 0) !== trial.totalCredits) return false;
        }
        return sim.snapshot().ledger.recent.every((e) => Number.isInteger(e.amount) && e.amount > 0);
      }),
      { numRuns: 4 },
    );
  });
});

describe('the clock', () => {
  it('moves forward a whole beat at a time, from any minute', () => {
    fc.assert(
      fc.property(minute, (m) => {
        const i = beatIndexAt(m);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThanOrEqual(BEATS_PER_DAY);
        expect(beatIndexAt(Math.min(DAY_END, m + beatMinutesAt(m)))).toBeGreaterThanOrEqual(i);
        expect(beatMinutesAt(m)).toBeGreaterThan(0);
      }),
    );
  });

  it('cuts any frame into substeps that add back up to it, none longer than the limit', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 20, noNaN: true }), fc.double({ min: 0.005, max: 1, noNaN: true }), (dt, max) => {
        const parts = substeps(dt, max);
        expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(dt > 0 ? dt : 0, 9);
        for (const p of parts) expect(p).toBeLessThanOrEqual(max + 1e-12);
      }),
    );
  });

  it('runs the motion clock at the speed asked, frozen on pause, whatever the frame timing', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.double({ min: 0, max: 0.3, noNaN: true }), fc.boolean(), fc.constantFrom(0.25, 0.5, 1, 2, 5, 10)), { maxLength: 60 }), (frames) => {
        Object.assign(motion, { t: 0, dt: 0, ms: 0, scale: 0 });
        let want = 0;
        for (const [dt, playing, speed] of frames) {
          advanceMotion(dt, playing, speed);
          want += playing ? Math.min(dt, 0.1) * speed : 0;
        }
        expect(motion.t).toBeCloseTo(want, 9);
        expect(motion.dt).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

describe('the 3D world, for any seed, speed and frame timing', () => {
  it('conserves the people it shows, keeps every count at or above zero, and never shows more than it has places for', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9999 }),
        fc.constantFrom(9 * 60, 12 * 60, 16 * 60 + 40, 19 * 60, 22 * 60 + 20),
        fc.constantFrom(0.5, 1, 2, 5, 10),
        fc.array(fc.double({ min: 1 / 240, max: 0.1, noNaN: true }), { minLength: 10, maxLength: 30 }),
        (s, from, speed, dts) => {
          Object.assign(motion, { t: 0, dt: 0, ms: 0, scale: 0 });
          Object.assign(liveMix, CLEAR);
          const store = createBankStore({ seed: s, storage: null });
          store.setState({ playing: true });
          while (store.getState().view.minute < from) store.getState().tickBeat();
          const world = new SimulationEngine(store).createWorld('clear');
          const stop = store.subscribe((st) => world.onBank(st.view));
          try {
            for (let b = 0; b < 3; b++) {
              store.getState().tickBeat();
              for (const dt of dts) {
                const v = store.getState().view;
                world.tick({ realDt: dt, playing: true, speed, minute: v.minute, weather: 'clear', queueLength: (id) => v.stations[id].queueLength });
                const walking = world.arrivals.walks.length;
                expect(walking).toBeGreaterThanOrEqual(0);
                expect(walking).toBeLessThanOrEqual(MAX_WALKERS);
                // Each walker is on a figure of its own: no figure shared, none duplicated.
                expect(new Set(world.arrivals.walks.map((w) => w.slot)).size).toBe(walking);
                // Everyone on their way to a line is expected there: the hand-off never counts below zero.
                for (const id of STATION_IDS) expect(world.handoff.pending(id)).toBeGreaterThanOrEqual(0);
                for (const id of STATION_IDS) {
                  const line = world.line(id);
                  expect(line.shown).toBeGreaterThanOrEqual(0);
                  expect(line.figures.filter((f) => f.visible).length).toBeLessThanOrEqual(Math.min(line.shown, QUEUE_VISIBLE));
                  expect(line.served.length).toBeLessThanOrEqual(SERVED_KEEP);
                  expect(new Set(line.served.map((x) => x.key)).size).toBe(line.served.length);
                  for (const sv of line.served) if (motion.t >= sv.start) expect(line.servedPoses.has(sv.key)).toBe(true);
                  const staff = world.staff(id);
                  for (const w of staff.walks) if (w.arriving) expect(staff.absent().has(w.id)).toBe(true);
                }
              }
            }
          } finally {
            stop();
            world.dispose();
          }
        },
      ),
      { numRuns: 6 },
    );
  });

  it('never lets two vehicles on the avenue touch, whatever the step sizes', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 0.2, noNaN: true }), { minLength: 50, maxLength: 800 }), (dts) => {
        const sim = new TrafficSim();
        for (const dt of dts) {
          sim.step(dt);
          if (sim.overlaps().length > 0) return false;
          if (sim.gaps().some((g) => g < MIN_GAP - 1e-6)) return false;
        }
        return true;
      }),
      { numRuns: 15 },
    );
  });

  it('conserves car-park bays and moves one vehicle at a time in the lot, opening and closing at any moment', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.double({ min: 0, max: 0.1, noNaN: true }), fc.boolean()), { minLength: 100, maxLength: 1500 }), fc.double({ min: 0, max: 1, noNaN: true }), (steps, fill) => {
        const lot = new ParkingLot(fill);
        for (const [dt, closed] of steps) {
          lot.setClosed(closed);
          lot.step(dt);
          const bays = lot.vehicles.map((v) => v.slot);
          if (new Set(bays).size !== bays.length) return false;
          if (lot.vehicles.some((v) => lot.slots[v.slot]!.occupiedBy !== v.id)) return false;
          // Every bay marked taken belongs to a vehicle in the lot: none leaks.
          if (lot.slots.filter((s) => s.occupiedBy !== null).length !== lot.vehicles.length) return false;
          if (lot.vehicles.filter((v) => v.phase === 'arriving' || v.phase === 'leaving').length > 1) return false;
          if (lot.vehicles.filter((v) => v.phase === 'approaching').length > 1) return false;
        }
        return true;
      }),
      { numRuns: 15 },
    );
  });

  it('has the cash van never both stop for someone and ask them to wait for it', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400 }), fc.double({ min: -60, max: 60, noNaN: true }), fc.double({ min: -30, max: 30, noNaN: true }), (steps, x, z) => {
        const run = new CitRun(citRoutes());
        for (let i = 0; i < steps; i++) run.step(0.1, true);
        expect(run.inPath([x, z]) && run.makesWait([x, z])).toBe(false);
        expect(run.go).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

describe('the desks’ badges', () => {
  const counts = fc.record({ waiting: fc.integer({ min: 0, max: 500 }), working: fc.integer({ min: 0, max: 50 }) });
  it('never draw a pill that says 0, at any zoom', () => {
    fc.assert(
      fc.property(counts, fc.constantFrom('far', 'mid', 'near' as const), (c, lod) => {
        for (const n of Object.values(badgePills({ ...c, lod }))) expect(n === null || n > 0).toBe(true);
      }),
    );
  });

  it('show on their own exactly when something is active at the desk (waiting + working > 0)', () => {
    fc.assert(
      fc.property(counts, fc.boolean(), (c, accumulates) => {
        const mode = badgeMode({ hovered: false, selected: false, lit: null, always: true, accumulates, ...c });
        expect(mode !== 'hidden').toBe(activeCount(c) > 0);
      }),
    );
  });
});
