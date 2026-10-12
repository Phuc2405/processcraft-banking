import { describe, expect, it } from 'vitest';
import { BEATS_PER_DAY, DAY_END, DAY_START, EOD_START, WORK_END, WORK_START, beatMinutes, beatMs, formatClock, phaseAt } from '../clock';
import { COVER_COST_CENTS, FRICTION_COST_CENTS, INVESTIGATION_COST_CENTS, bnplDefaultRate, compareReports, emptyKpis, formatDelta, formatKpi, formatMoney, pnl } from '../kpis';
import { Rng, hashSeed } from '../prng';
import { DEFAULT_RULES, RULE_KEYS, RULE_META, changedRules, clampRules, rulesEqual } from '../rules';
import { MAX_COVER_PER_STATION, fatigueChange, mistakeChance, productivityFor, rosterFor } from '../roster';
import { SERVICE_ORDER, STATIONS, STATION_IDS, WIRES, hasWire, isStation } from '../topology';
import { DAY_EVENTS, WORKING_BEATS, eventForDay, generateDay, intensityAt, makeSettlement } from '../traffic';
import type { DayReport } from '../types';

describe('random numbers', () => {
  it('the same seed gives the same stream, a different seed a different one', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    const c = new Rng(6);
    const as = Array.from({ length: 8 }, () => a.next());
    expect(Array.from({ length: 8 }, () => b.next())).toEqual(as);
    expect(Array.from({ length: 8 }, () => c.next())).not.toEqual(as);
  });

  it('stays inside its ranges', () => {
    const r = new Rng(1);
    for (let i = 0; i < 500; i++) {
      const n = r.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      const k = r.int(3, 5);
      expect(k).toBeGreaterThanOrEqual(3);
      expect(k).toBeLessThanOrEqual(5);
    }
  });

  it('hashes the same parts to the same number', () => {
    expect(hashSeed('a', 1, 'b')).toBe(hashSeed('a', 1, 'b'));
    expect(hashSeed('a', 1, 'b')).not.toBe(hashSeed('a', 2, 'b'));
  });

  it('poisson draws average out near the rate', () => {
    const r = new Rng(9);
    const n = 4000;
    const mean = Array.from({ length: n }, () => r.poisson(3)).reduce((a, b) => a + b, 0) / n;
    expect(mean).toBeGreaterThan(2.85);
    expect(mean).toBeLessThan(3.15);
  });
});

describe('the clock', () => {
  it('has four phases that fit together from 08:00 to midnight', () => {
    expect(phaseAt(DAY_START)).toBe('PRE_OPEN');
    expect(phaseAt(WORK_START)).toBe('WORKING');
    expect(phaseAt(WORK_END - 1)).toBe('WORKING');
    expect(phaseAt(WORK_END)).toBe('AFTER_HOURS');
    expect(phaseAt(EOD_START)).toBe('EOD');
    expect(phaseAt(DAY_END - 1)).toBe('EOD');
  });

  it('counts the beats in a day', () => {
    expect(BEATS_PER_DAY).toBe(1 + 96 + 6 + 30);
    expect(WORKING_BEATS).toBe(96);
  });

  it('formats times', () => {
    expect(formatClock(540)).toBe('09:00');
    expect(formatClock(1380)).toBe('23:00');
    expect(formatClock(DAY_END)).toBe('24:00');
  });

  it('plays the busy phases slower than the quiet ones and faster at higher speed', () => {
    expect(beatMs('WORKING', 1)).toBeGreaterThan(beatMs('AFTER_HOURS', 1));
    expect(beatMs('WORKING', 4)).toBeLessThan(beatMs('WORKING', 1));
    expect(beatMinutes('EOD')).toBe(2);
  });
});

describe('rules', () => {
  it('pulls every dial inside its range', () => {
    const r = clampRules({ dcvvWindowSec: 9999, bnplMinScore: -5, reconToleranceCents: 7.6 });
    expect(r.dcvvWindowSec).toBe(RULE_META.dcvvWindowSec.max);
    expect(r.bnplMinScore).toBe(RULE_META.bnplMinScore.min);
    expect(r.reconToleranceCents).toBe(8);
  });

  it('ignores junk', () => {
    expect(clampRules({ dcvvWindowSec: Number.NaN, frictionlessBelow: 'x' as unknown as number })).toEqual(DEFAULT_RULES);
  });

  it('keeps the frictionless line below the reject line', () => {
    const r = clampRules({ frictionlessBelow: 70, rejectAtOrAbove: 60 });
    expect(r.frictionlessBelow).toBeLessThan(r.rejectAtOrAbove);
  });

  it('knows what changed', () => {
    const next = clampRules({ frictionlessBelow: 55 });
    expect(changedRules(DEFAULT_RULES, next)).toEqual(['frictionlessBelow']);
    expect(rulesEqual(DEFAULT_RULES, { ...DEFAULT_RULES })).toBe(true);
    expect(rulesEqual(DEFAULT_RULES, next)).toBe(false);
  });

  it('has metadata for every dial and the default sits inside its range', () => {
    for (const k of RULE_KEYS) {
      expect(DEFAULT_RULES[k]).toBeGreaterThanOrEqual(RULE_META[k].min);
      expect(DEFAULT_RULES[k]).toBeLessThanOrEqual(RULE_META[k].max);
    }
  });
});

describe('the map', () => {
  it('has a desk for every station and the service order lists each exactly once', () => {
    expect([...SERVICE_ORDER].sort()).toEqual([...STATION_IDS].sort());
    for (const id of STATION_IDS) expect(STATIONS[id].staff).toBeGreaterThan(0);
  });

  it('every wire runs forward in the service order, except the phone round trip', () => {
    for (const [from, to] of WIRES) {
      if (!isStation(from) || !isStation(to)) continue;
      expect(SERVICE_ORDER.indexOf(from)).toBeLessThan(SERVICE_ORDER.indexOf(to));
    }
    expect(hasWire('CUSTOMER_OTP', 'SEC_3DS')).toBe(true);
    expect(hasWire('GATE_POS', 'SEC_3DS')).toBe(false);
  });
});

describe('people', () => {
  it('everyone on the roster has a different name', () => {
    const roster = rosterFor(3);
    const names = STATION_IDS.flatMap((id) => roster[id].map((w) => w.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it('is the same people for the same seed', () => {
    expect(rosterFor(3)).toEqual(rosterFor(3));
    expect(rosterFor(3)).not.toEqual(rosterFor(4));
  });

  it('tired people are slower, and being flat out tires faster than being idle', () => {
    expect(productivityFor(0)).toBe(1);
    expect(productivityFor(50)).toBeLessThan(productivityFor(20));
    expect(productivityFor(100)).toBeGreaterThan(0.4);
    expect(fatigueChange(60, 1)).toBeGreaterThan(fatigueChange(60, 0.5));
    expect(fatigueChange(60, 0)).toBeLessThan(0);
  });

  it('mistakes only start when someone is quite worn out', () => {
    expect(mistakeChance(50)).toBe(0);
    expect(mistakeChance(90)).toBeGreaterThan(mistakeChance(70));
    expect(MAX_COVER_PER_STATION).toBe(2);
  });
});

describe('customers and days', () => {
  it('the same seed and day always bring the same customers', () => {
    expect(generateDay(7, 3)).toEqual(generateDay(7, 3));
    expect(generateDay(7, 3).customers.length).not.toBe(0);
    expect(generateDay(8, 3).customers.map((c) => c.id)).not.toEqual([]);
  });

  it('a day has about 700-800 card customers, a few hundred more on the newer channels, and a lunchtime peak', () => {
    const d = generateDay(7, 1);
    const card = d.customers.filter((c) => c.kind !== 'A2A' && c.kind !== 'ATM');
    // The four card channels draw from their own random stream, so adding the A2A gate and the ATM left them exactly as they were.
    expect(card.length).toBeGreaterThan(650);
    expect(card.length).toBeLessThan(900);
    expect(d.customers.length).toBeGreaterThan(card.length + 80);
    expect(d.customers.length).toBeLessThan(1150);
    const perBeat = d.beats.map((b) => b.length);
    const lunch = perBeat.slice(36, 48).reduce((a, b) => a + b, 0);
    const morning = perBeat.slice(0, 12).reduce((a, b) => a + b, 0);
    expect(lunch).toBeGreaterThan(morning * 1.5);
    expect(intensityAt(12.8 * 60)).toBeGreaterThan(intensityAt(9 * 60));
  });

  it('arrivals fall inside the working day, in order, in the beat they are filed under', () => {
    const d = generateDay(7, 1);
    d.beats.forEach((beat, i) => {
      for (const c of beat) {
        expect(c.minute).toBeGreaterThanOrEqual(WORK_START + i * 5);
        expect(c.minute).toBeLessThan(WORK_START + (i + 1) * 5);
      }
    });
  });

  it('day 1 is ordinary, day 2 is a flash sale, and special days never come back to back', () => {
    expect(eventForDay(11, 1).id).toBe('NORMAL');
    expect(eventForDay(11, 2).id).toBe('PROMO');
    const seen = new Set<string>();
    for (let day = 3; day < 120; day++) {
      const e = eventForDay(11, day);
      seen.add(e.id);
      if (e.id !== 'NORMAL') expect(eventForDay(11, day - 1).id === 'NORMAL' || day === 3).toBe(true);
    }
    expect(seen.size).toBe(Object.keys(DAY_EVENTS).length);
  });

  it('a flash sale brings more online and Pay-in-4 customers; payday more card swipes', () => {
    const count = (day: number, kind: string) => generateDay(7, day).customers.filter((c) => c.kind === kind).length;
    expect(count(2, 'ECOM')).toBeGreaterThan(count(1, 'ECOM') * 1.3);
    expect(count(2, 'BNPL')).toBeGreaterThan(count(1, 'BNPL') * 1.5);
    expect(eventForDay(7, 6).id).toBe('PAYDAY');
    expect(count(6, 'POS')).toBeGreaterThan(count(1, 'POS') * 1.2);
  });

  it('a fraud ring brings several times the online fraud', () => {
    const fraud = (day: number) => generateDay(7, day).customers.filter((c) => c.payload.isFraud && c.kind !== 'POS').length;
    expect(eventForDay(7, 13).id).toBe('FRAUD_RING');
    expect(fraud(13)).toBeGreaterThan(fraud(1) * 2.5);
  });

  it('fraud scores higher on risk than genuine customers on average', () => {
    const all = [1, 3, 4, 5, 7, 9].flatMap((d) => generateDay(7, d).customers).filter((c) => c.kind === 'ECOM');
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const fraud = all.filter((c) => c.payload.isFraud).map((c) => c.payload.riskScore);
    const good = all.filter((c) => !c.payload.isFraud).map((c) => c.payload.riskScore);
    expect(fraud.length).toBeGreaterThan(10);
    expect(avg(fraud)).toBeGreaterThan(avg(good) + 20);
  });

  it('every payment has a sensible amount and a funding account', () => {
    for (const c of generateDay(7, 2).customers) {
      expect(Number.isInteger(c.payload.amount)).toBe(true);
      expect(c.payload.amount).toBeGreaterThanOrEqual(100);
      expect(c.payload.availableBalance).toBeGreaterThan(0);
      if (c.payload.cardType === 'CREDIT') expect(c.payload.creditLimit).toBeGreaterThanOrEqual(c.payload.availableBalance);
    }
  });
});

describe('tonight’s records', () => {
  it('are fixed by the seed, the day and the payment', () => {
    expect(makeSettlement(1, 4, 'tx_a', 'DEBIT', 5000, 1)).toEqual(makeSettlement(1, 4, 'tx_a', 'DEBIT', 5000, 1));
  });

  it('mostly agree to the cent; some have dust; a few are real breaks, and a glitch day has many more', () => {
    const tally = (glitch: number) => {
      const t = { NONE: 0, NOISE: 0, AMOUNT: 0, MISSING: 0, DUPLICATE: 0 };
      for (let i = 0; i < 5000; i++) t[makeSettlement(1, 1, `tx_${i}`, 'DEBIT', 4000 + i, glitch).truth.trueKind]++;
      return t;
    };
    const normal = tally(1);
    const glitch = tally(5);
    expect(normal.NONE / 5000).toBeGreaterThan(0.7);
    expect(normal.NOISE / 5000).toBeGreaterThan(0.15);
    expect(normal.NOISE / 5000).toBeLessThan(0.3);
    const real = (t: typeof normal) => t.AMOUNT + t.MISSING + t.DUPLICATE;
    expect(real(normal) / 5000).toBeGreaterThan(0.02);
    expect(real(normal) / 5000).toBeLessThan(0.06);
    expect(real(glitch)).toBeGreaterThan(real(normal) * 3.5);
  });

  it('describe their own truth: dust is small, amount errors are bigger', () => {
    for (let i = 0; i < 2000; i++) {
      const { payload, truth } = makeSettlement(2, 1, `tx_${i}`, 'CREDIT', 9000, 3);
      const s = payload.settlement!;
      const legs = [s.ledgerAmount, s.clearingAmount, s.switchAmount].filter((x): x is number => x !== null);
      if (truth.trueKind === 'NONE') expect(Math.max(...legs) - Math.min(...legs)).toBe(0);
      if (truth.trueKind === 'NOISE') expect(truth.trueVarianceCents).toBeLessThanOrEqual(10);
      if (truth.trueKind === 'MISSING') expect(legs.length).toBe(2);
      if (truth.trueKind === 'DUPLICATE') expect(s.clearingPresentments).toBe(2);
    }
  });
});

describe('numbers and money', () => {
  const report = (patch: (r: DayReport) => void): DayReport => {
    const r: DayReport = {
      day: 1,
      event: DAY_EVENTS.NORMAL,
      rules: DEFAULT_RULES,
      kpis: emptyKpis(),
      close: { suspenseCents: 0, suspenseItems: 0, reconBacklog: 0, nightDoneMinute: 1430, avgFatigue: 20, maxFatigue: 40 },
    };
    patch(r);
    return r;
  };

  it('adds up the profit and loss', () => {
    const k = emptyKpis();
    k.genuineCardCents = 1_000_000;
    k.bnpl.basketCents = 500_000;
    k.fraudLossCents = 10_000;
    k.bnpl.expectedLossCents = 5_000;
    k.recon.leakageCents = 100;
    k.suspenseClearedItems = 10;
    k.frictionLostCount = 5;
    k.coverCostCents = COVER_COST_CENTS;
    const p = pnl(k);
    expect(p.interchangeCents).toBe(20_000);
    expect(p.bnplFeeCents).toBe(30_000);
    expect(p.netCents).toBe(50_000 - 10_000 - 5_000 - 100 - 10 * INVESTIGATION_COST_CENTS - 5 * FRICTION_COST_CENTS - COVER_COST_CENTS);
  });

  it('Pay-in-4 customers with weaker scores are more likely to default', () => {
    expect(bnplDefaultRate(450)).toBeGreaterThan(bnplDefaultRate(600));
    expect(bnplDefaultRate(600)).toBeGreaterThan(bnplDefaultRate(750));
    expect(bnplDefaultRate(600)).toBeLessThan(0.1);
  });

  it('judges a change as better or worse by the direction a manager wants', () => {
    const before = report((r) => (r.kpis.fraudSlipped = 10));
    const after = report((r) => (r.kpis.fraudSlipped = 4));
    const row = compareReports(before, after).find((x) => x.def.id === 'fraudSlipped')!;
    expect(row.delta).toBe(-6);
    expect(row.verdict).toBe('better');
    const worse = compareReports(after, before).find((x) => x.def.id === 'fraudSlipped')!;
    expect(worse.verdict).toBe('worse');
  });

  it('treats tiny differences as no change, and neutral numbers as neutral', () => {
    const a = report((r) => (r.kpis.threeDs.challenged = 10));
    const b = report((r) => (r.kpis.threeDs.challenged = 30));
    const rows = compareReports(a, b);
    expect(rows.find((x) => x.def.id === 'challengeRate')!.verdict).toBe('same');
    expect(rows.find((x) => x.def.id === 'fraudSlipped')!.delta).toBe(0);
  });

  it('formats money, percentages and changes', () => {
    expect(formatMoney(123456)).toBe('$1,234.56');
    expect(formatMoney(-5000)).toBe('-$50.00');
    expect(formatMoney(2_500_000, true)).toBe('$25.0k');
    expect(formatKpi(12.34, 'pct')).toBe('12.3%');
    expect(formatDelta(0, 'count')).toBe('—');
    expect(formatDelta(-3, 'count')).toBe('−3');
    expect(formatDelta(2.5, 'pct')).toBe('+2.5 pts');
  });
});
