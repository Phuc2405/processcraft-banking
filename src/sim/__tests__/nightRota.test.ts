import { describe, expect, it } from 'vitest';
import { BankSimulation } from '../bankSimulation';
import { NIGHT_FATIGUE, NIGHT_RESERVES, NIGHT_SEATS, NIGHT_STATIONS, nightFatigueFactor, nightPoolFor, nightRotaFor, rosterFor } from '../roster';
import { STATION_IDS, STATIONS } from '../topology';

describe('the night rota', () => {
  const pool = NIGHT_SEATS + NIGHT_RESERVES;

  it('fills every night seat each night, with nobody in two seats', () => {
    for (let day = 1; day <= 12; day++) {
      const rota = nightRotaFor(day);
      for (const id of NIGHT_STATIONS) expect(rota.seats[id], `day ${day} ${id}`).toHaveLength(STATIONS[id].staff);
      const seated = NIGHT_STATIONS.flatMap((id) => rota.seats[id]);
      expect(new Set([...seated, ...rota.resting]).size).toBe(pool);
      expect(rota.resting).toHaveLength(NIGHT_RESERVES);
    }
  });

  it('gives everyone two nights in three, and one night off', () => {
    const worked = new Array(pool).fill(0);
    for (let day = 1; day <= 3; day++) for (const id of NIGHT_STATIONS) for (const i of nightRotaFor(day).seats[id]) worked[i]++;
    expect(worked).toEqual(new Array(pool).fill(2));
  });

  it('hands the one-person desks (Batch Clearing, Visa Settlement) to someone new every night', () => {
    for (let day = 1; day <= 12; day++) {
      const today = nightRotaFor(day);
      const tomorrow = nightRotaFor(day + 1);
      expect(tomorrow.seats.EOD_BATCH).not.toEqual(today.seats.EOD_BATCH);
      expect(tomorrow.seats.EOD_VISA).not.toEqual(today.seats.EOD_VISA);
    }
  });

  it('is a pure function of the day, and day 1 is the crew the bank always had', () => {
    expect(nightRotaFor(5)).toEqual(nightRotaFor(5));
    const day1 = nightRotaFor(1);
    expect(NIGHT_STATIONS.flatMap((id) => day1.seats[id])).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keeps the people of the roster and adds reserves with names nobody else has', () => {
    const members = nightPoolFor(2026);
    expect(members).toHaveLength(pool);
    const roster = rosterFor(2026);
    expect(members.slice(0, NIGHT_SEATS).map((m) => m.name)).toEqual(NIGHT_STATIONS.flatMap((id) => roster[id].map((w) => w.name)));
    const everyone = [...STATION_IDS.filter((id) => !NIGHT_STATIONS.includes(id as never)).flatMap((id) => roster[id].map((w) => w.name)), ...members.map((m) => m.name)];
    expect(new Set(everyone).size).toBe(everyone.length);
    expect(new Set(members.map((m) => m.id)).size).toBe(pool);
  });
});

describe('night stamina follows the load', () => {
  it('tires an idle night worker a little and a flat-out one a lot', () => {
    expect(nightFatigueFactor(0)).toBe(NIGHT_FATIGUE.idle);
    expect(nightFatigueFactor(1)).toBeCloseTo(NIGHT_FATIGUE.flatOut, 9);
    expect(nightFatigueFactor(0.5)).toBeGreaterThan(nightFatigueFactor(0.2));
    expect(nightFatigueFactor(-1)).toBe(NIGHT_FATIGUE.idle);
    expect(nightFatigueFactor(9)).toBeCloseTo(NIGHT_FATIGUE.flatOut, 9);
  });
});

describe('the night shift in the bank', () => {
  it('seats a different crew each night, reports who was on, who rested and how the shift went', () => {
    const sim = new BankSimulation({ seed: 2026, day: 1, headless: true });
    const batchDesk: string[] = [];
    for (let d = 0; d < 6; d++) {
      const r = sim.runToEndOfDay();
      const n = r.nightShift;
      expect(n, `day ${r.day}`).toBeDefined();
      if (!n) return;
      expect(n.crew).toHaveLength(NIGHT_SEATS);
      expect(n.resting).toHaveLength(NIGHT_RESERVES);
      for (const name of n.resting) expect(n.crew.map((m) => m.name)).not.toContain(name);
      expect(n.left).toBe(r.close.reconBacklog);
      expect(n.finishedAt).toBe(r.close.nightDoneMinute);
      expect(n.completion).toBeGreaterThanOrEqual(0);
      expect(n.completion).toBeLessThanOrEqual(1);
      if (n.finishedAt !== null) expect(n.completion).toBe(1);
      expect(n.crew.reduce((sum, m) => sum + m.items, 0)).toBeGreaterThan(0);
      batchDesk.push(n.crew.find((m) => m.station === 'EOD_BATCH')?.name ?? '');
      sim.nextDay();
    }
    for (let i = 1; i < batchDesk.length; i++) expect(batchDesk[i]).not.toBe(batchDesk[i - 1]);
  });

  it('seats the same crew for a day whether the bank played up to it or was opened on it (reload, Reset day)', () => {
    const played = new BankSimulation({ seed: 2026, day: 1, headless: true });
    for (let d = 1; d < 4; d++) played.nextDay();
    const opened = new BankSimulation({ seed: 2026, day: 4, headless: true });
    const names = (s: BankSimulation): string[] => NIGHT_STATIONS.flatMap((id) => s.snapshot().stations[id].workers.map((w) => w.name));
    expect(names(played)).toEqual(names(opened));
  });

  it('does not leave the same person the most exhausted in the bank, day after day', () => {
    const sim = new BankSimulation({ seed: 2026, day: 1, headless: true });
    const most: string[] = [];
    for (let d = 0; d < 6; d++) {
      sim.runToEndOfDay();
      const all = Object.values(sim.snapshot().stations).flatMap((s) => s.workers.filter((w) => !w.machine));
      const top = all.reduce((a, b) => (b.fatigue > a.fatigue ? b : a));
      most.push(top.name);
      sim.nextDay();
    }
    expect(new Set(most).size).toBeGreaterThan(1);
    // On an ordinary day nobody should end the day exhausted.
    const calm = new BankSimulation({ seed: 2026, day: 1, headless: true }).runToEndOfDay();
    expect(calm.close.maxFatigue).toBeLessThan(65);
  });
});
