import { CHECKOUT_KINDS } from '../kpis';
import { describe, expect, it } from 'vitest';
import { BankSimulation, PATIENCE, sampleMoves } from '../bankSimulation';
import { BEATS_PER_DAY, DAY_END, EOD_START, WORK_END, WORK_START } from '../clock';
import { COVER_COST_CENTS, pnl } from '../kpis';
import { DEFAULT_RULES } from '../rules';
import { STATION_IDS, WIRES, hasWire, isStation } from '../topology';
import { eventForDay } from '../traffic';
import type { DayReport } from '../types';
import { compareDays, simulateDay, sumReports } from '../whatIf';

const SEED = 7;
const NORMAL_DAY = 1;
const PROMO_DAY = 2;
const RING_DAY = 13;
const GLITCH_DAY = 8;

const day = (n: number, rules = {}, cover = {}): DayReport => simulateDay({ seed: SEED, day: n, rules, cover });

describe('the calendar used by these tests', () => {
  it('has the events these tests expect', () => {
    expect(eventForDay(SEED, NORMAL_DAY).id).toBe('NORMAL');
    expect(eventForDay(SEED, PROMO_DAY).id).toBe('PROMO');
    expect(eventForDay(SEED, RING_DAY).id).toBe('FRAUD_RING');
    expect(eventForDay(SEED, GLITCH_DAY).id).toBe('VISA_GLITCH');
  });
});

describe('time', () => {
  it('starts at the 07:00 start on day 1 and ends at midnight after one beat per step', () => {
    const sim = new BankSimulation({ seed: SEED });
    expect(sim.day).toBe(1);
    expect(sim.minute).toBe(7 * 60);
    let steps = 0;
    while (!sim.dayOver) {
      sim.step();
      steps++;
    }
    expect(steps).toBe(BEATS_PER_DAY);
    expect(sim.minute).toBe(DAY_END);
    sim.step();
    expect(sim.minute).toBe(DAY_END);
  });

  it('moves through the four phases in order', () => {
    const sim = new BankSimulation({ seed: SEED });
    const seen: string[] = [];
    while (!sim.dayOver) {
      const phase = sim.snapshot().phase;
      if (seen[seen.length - 1] !== phase) seen.push(phase);
      sim.step();
    }
    expect(seen.slice(0, 4)).toEqual(['PRE_OPEN', 'WORKING', 'AFTER_HOURS', 'EOD']);
  });

  it('lets customers in only between 09:00 and 17:00', () => {
    const sim = new BankSimulation({ seed: SEED });
    sim.stepUntil(WORK_START);
    expect(sim.snapshot().kpis.arrivals).toBe(0);
    sim.stepUntil(WORK_START + 60);
    const midMorning = sim.snapshot().kpis.arrivals;
    expect(midMorning).toBeGreaterThan(0);
    sim.stepUntil(WORK_END);
    const atClose = sim.snapshot().kpis.arrivals;
    expect(atClose).toBeGreaterThan(midMorning);
    sim.stepUntil(DAY_END);
    expect(sim.snapshot().kpis.arrivals).toBe(atClose);
  });

  it('the night cycle starts at 23:00: nothing is batched before, records are cleared after', () => {
    const sim = new BankSimulation({ seed: SEED });
    sim.stepUntil(EOD_START);
    expect(sim.snapshot().stations.EOD_BATCH.queueLength).toBe(0);
    expect(sim.snapshot().stations.EOD_BATCH.stats.processedToday).toBe(0);
    sim.step();
    const v = sim.snapshot();
    expect(v.phase).toBe('EOD');
    expect(v.stations.EOD_BATCH.stats.processedToday).toBeGreaterThan(0);
    expect(v.stations.EOD_VISA.queueLength + v.stations.RECON.queueLength).toBeGreaterThan(0);
  });
});

describe('an ordinary day', () => {
  const sim = new BankSimulation({ seed: SEED });
  const r = sim.runToEndOfDay();
  const k = r.kpis;

  it('is deterministic', () => {
    expect(day(NORMAL_DAY)).toEqual(simulateDay({ seed: SEED, day: NORMAL_DAY }));
    expect(JSON.stringify(new BankSimulation({ seed: SEED }).runToEndOfDay())).toBe(JSON.stringify(r));
  });

  it('is the same with or without a screen watching it', () => {
    expect(simulateDay({ seed: SEED, day: NORMAL_DAY })).toEqual(r);
  });

  it('every customer who arrives is either approved or declined', () => {
    expect(k.arrivals).toBeGreaterThan(650);
    expect(k.approved + k.declined).toBe(k.arrivals);
    expect(k.finished).toBe(k.arrivals);
    expect(sim.snapshot().inFlight).toBe(r.close.reconBacklog + r.close.suspenseItems);
    expect(CHECKOUT_KINDS.reduce((n, kind) => n + k.byKind[kind], 0)).toBe(k.arrivals);
  });

  it('declines add up and none are process errors', () => {
    expect(Object.values(k.declines).reduce((a, b) => a + b, 0)).toBe(k.declined);
    expect(k.declines.PROCESS_ERROR).toBe(0);
  });

  it('says yes to nearly everyone and nobody waits long', () => {
    expect(k.approved / k.arrivals).toBeGreaterThan(0.88);
    expect(k.approved / k.arrivals).toBeLessThan(0.99);
    expect(k.waitSumMin / k.finished).toBeLessThan(3);
    expect(k.declines.TIMEOUT).toBe(0);
  });

  it('fraud attempts are either blocked or slip through', () => {
    expect(k.fraudAttempts).toBeGreaterThan(3);
    expect(k.fraudBlocked + k.fraudSlipped).toBe(k.fraudAttempts);
    expect(k.fraudLossCents).toBeGreaterThanOrEqual(k.fraudSlipped * 100);
  });

  it('the night team gets through every record before midnight', () => {
    expect(r.close.reconBacklog).toBe(0);
    expect(r.close.nightDoneMinute).not.toBeNull();
    expect(r.close.nightDoneMinute!).toBeLessThanOrEqual(DAY_END);
    // Only card payments go through tonight's clearing: an instant transfer settles on its own rail, ATM cash is counted at the
    // machine, and the Phase 8 channels post straight to the CASA ledger.
    const x = k.ext;
    const extended = x.accountsOpened + x.qrPaid + x.swiftSent + x.tellerDeposits + x.tellerWithdrawals + x.disputesRefunded;
    expect(k.recon.records).toBe(k.approved - k.a2a.released - k.atm.dispensed - extended);
    const breaks = k.recon.breakAmount + k.recon.breakMissing + k.recon.breakDuplicate;
    expect(k.recon.matched + breaks).toBe(k.recon.records);
  });

  it('every break is in the suspense account, worth what was posted', () => {
    const breaks = k.recon.breakAmount + k.recon.breakMissing + k.recon.breakDuplicate;
    expect(r.close.suspenseItems).toBe(breaks);
    expect(r.close.suspenseCents).toBe(k.recon.suspenseAddedCents);
    expect(sim.snapshot().suspense.items).toBe(breaks);
  });

  it('the ordinary rules make a profit', () => {
    expect(pnl(k).revenueCents).toBeGreaterThan(100_000);
  });

  it('nobody is exhausted', () => {
    expect(r.close.maxFatigue).toBeLessThan(75);
  });
});

describe('what the screen reads', () => {
  it('is plain data that survives being copied and sent as text', () => {
    const sim = new BankSimulation({ seed: SEED, day: PROMO_DAY });
    sim.stepUntil(13 * 60);
    const v = sim.snapshot();
    expect(structuredClone(v)).toEqual(v);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });

  it('shows every desk with its people, queue, stats and recent activity', () => {
    const sim = new BankSimulation({ seed: SEED, day: PROMO_DAY });
    sim.stepUntil(13 * 60);
    const v = sim.snapshot();
    for (const id of STATION_IDS) {
      const s = v.stations[id];
      expect(s.workers.length).toBeGreaterThan(0);
      for (const w of s.workers) {
        expect(w.name.length).toBeGreaterThan(3);
        expect(w.role.length).toBeGreaterThan(3);
        expect(w.fatigue).toBeGreaterThanOrEqual(0);
        expect(w.fatigue).toBeLessThanOrEqual(100);
        expect(w.activity.length).toBeGreaterThan(5);
      }
      expect(s.queueLength).toBeGreaterThanOrEqual(s.queue.length);
      expect(s.stats.lines.length).toBeGreaterThan(0);
    }
    const desk = v.stations.SEC_3DS;
    expect(desk.stats.processedToday).toBeGreaterThan(50);
    expect(desk.stream.length).toBeGreaterThan(5);
    expect(desk.stream.some((e) => /risk score \d+/.test(e.text))).toBe(true);
    expect(desk.workers.some((w) => w.working)).toBe(true);
  });

  it('has the Visa-batch-against-GL wording on the reconciliation desk at night', () => {
    const sim = new BankSimulation({ seed: SEED });
    sim.stepUntil(EOD_START + 10);
    const v = sim.snapshot();
    expect(v.stations.RECON.stream.some((e) => /Matching Visa clearing batch vs GL/.test(e.text))).toBe(true);
    expect(v.stations.RECON.workers.some((w) => /Matching Visa clearing batch vs GL/.test(w.activity))).toBe(true);
  });

  it('only moves payments along wires that exist on the map, and never too many at once', () => {
    const sim = new BankSimulation({ seed: SEED, day: PROMO_DAY });
    let moves = 0;
    while (!sim.dayOver) {
      sim.step();
      const v = sim.snapshot();
      expect(v.moves.length).toBeLessThanOrEqual(28);
      for (const m of v.moves) {
        expect(hasWire(m.from, m.to)).toBe(true);
        expect(m.at).toBeGreaterThanOrEqual(0);
        expect(m.at).toBeLessThanOrEqual(1);
      }
      moves += v.moves.length;
    }
    expect(moves).toBeGreaterThan(300);
    expect(WIRES.length).toBeGreaterThan(20);
  });

  it('gives each move a different key within a beat', () => {
    const sim = new BankSimulation({ seed: SEED });
    sim.stepUntil(12 * 60);
    const keys = sim.snapshot().moves.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('thins a crowded beat evenly', () => {
    const moves = Array.from({ length: 100 }, (_, i) => ({ key: String(i), packetId: String(i), edge: '', from: 'GATE_POS' as const, to: 'LEDGER_DEBIT' as const, kind: 'POS' as const, cardType: 'DEBIT' as const, scenario: '', amountCents: 0, at: 0 }));
    const kept = sampleMoves(moves, 10);
    expect(kept).toHaveLength(10);
    expect(kept[0]!.key).toBe('0');
    expect(Number(kept[9]!.key)).toBeGreaterThan(80);
    expect(sampleMoves(moves.slice(0, 5), 10)).toHaveLength(5);
  });

  it('lists feed lines newest first, with the briefing at the start of the day', () => {
    const sim = new BankSimulation({ seed: SEED, day: PROMO_DAY });
    sim.stepUntil(11 * 60);
    const feed = sim.snapshot().feed;
    expect(feed.length).toBeGreaterThan(1);
    expect(feed[feed.length - 1]!.text).toMatch(/Day 2: Flash sale/);
    for (let i = 1; i < feed.length; i++) expect(feed[i - 1]!.id).toBeGreaterThan(feed[i]!.id);
  });

  it('tracks only the desks and tallies that exist', () => {
    const v = new BankSimulation({ seed: SEED }).snapshot();
    expect(Object.keys(v.stations).sort()).toEqual([...STATION_IDS].sort());
    expect(Object.keys(v.externals)).toEqual(['CUSTOMER_OTP', 'OUT_APPROVED', 'OUT_DECLINED', 'OUT_SETTLED']);
    for (const id of Object.keys(v.stations)) expect(isStation(id as never)).toBe(true);
  });
});

describe('a flash sale', () => {
  const noCover = new BankSimulation({ seed: SEED, day: PROMO_DAY });
  let peakWait = 0;
  let peakQueue = 0;
  let sawQueueAlert = false;
  while (!noCover.dayOver) {
    noCover.step();
    const v = noCover.snapshot();
    for (const id of STATION_IDS) {
      peakQueue = Math.max(peakQueue, v.stations[id].queueLength);
      peakWait = Math.max(peakWait, ...v.stations[id].queue.map((q) => q.waitedMin));
    }
    if (v.alerts.some((a) => a.id.startsWith('queue:'))) sawQueueAlert = true;
  }
  const crowded = noCover.report();

  it('builds queues, raises an alert and loses customers who give up', () => {
    expect(peakQueue).toBeGreaterThan(15);
    expect(peakWait).toBeGreaterThan(8);
    expect(sawQueueAlert).toBe(true);
    expect(crowded.kpis.declines.TIMEOUT).toBeGreaterThan(5);
    expect(crowded.kpis.frictionLostCount).toBeGreaterThanOrEqual(crowded.kpis.declines.TIMEOUT - crowded.kpis.fraudBlocked);
  });

  it('wears the staff out more than an ordinary day', () => {
    expect(crowded.close.maxFatigue).toBeGreaterThan(day(NORMAL_DAY).close.maxFatigue + 15);
  });

  it('hands the night team more than it can finish, and the rest rolls into tomorrow', () => {
    expect(crowded.close.reconBacklog).toBeGreaterThan(50);
    expect(crowded.close.nightDoneMinute).toBeNull();
  });

  it('is relieved by extra hands where the queue is, at a cost', () => {
    const covered = day(PROMO_DAY, {}, { SEC_3DS: 1, LEDGER_DEBIT: 1, BNPL: 1 });
    expect(covered.kpis.declines.TIMEOUT).toBeLessThan(crowded.kpis.declines.TIMEOUT);
    expect(covered.kpis.waitSumMin / covered.kpis.finished).toBeLessThan((crowded.kpis.waitSumMin / crowded.kpis.finished) / 2);
    expect(covered.kpis.coverCostCents).toBe(3 * COVER_COST_CENTS);
  });

  it('customers have limited patience', () => {
    expect(PATIENCE.POS).toBeLessThan(PATIENCE.BNPL);
  });
});

describe('temporary cover', () => {
  it('adds a named person at the desk for the day, up to two, and charges for them', () => {
    const sim = new BankSimulation({ seed: SEED });
    const before = sim.snapshot().stations.SEC_3DS.workers.length;
    expect(sim.addCover('SEC_3DS')).toBe(true);
    expect(sim.addCover('SEC_3DS')).toBe(true);
    expect(sim.addCover('SEC_3DS')).toBe(false);
    const view = sim.snapshot().stations.SEC_3DS;
    expect(view.workers).toHaveLength(before + 2);
    expect(view.workers.filter((w) => w.temp)).toHaveLength(2);
    expect(sim.snapshot().kpis.coverCostCents).toBe(2 * COVER_COST_CENTS);
  });

  it('go home at the end of the day', () => {
    const sim = new BankSimulation({ seed: SEED });
    const before = sim.snapshot().stations.SEC_3DS.workers.length;
    sim.addCover('SEC_3DS');
    sim.runToEndOfDay();
    sim.nextDay();
    const v = sim.snapshot();
    expect(v.stations.SEC_3DS.workers).toHaveLength(before);
    expect(v.kpis.coverCostCents).toBe(0);
  });

  it('cannot be booked once the day is over', () => {
    const sim = new BankSimulation({ seed: SEED });
    sim.runToEndOfDay();
    expect(sim.addCover('BNPL')).toBe(false);
  });
});

describe('the next day', () => {
  it('starts at 07:00 on the following day with fresh numbers and rested staff', () => {
    const sim = new BankSimulation({ seed: SEED, day: PROMO_DAY });
    const tired = sim.runToEndOfDay().close.maxFatigue;
    sim.nextDay();
    const v = sim.snapshot();
    expect(v.day).toBe(PROMO_DAY + 1);
    expect(v.minute).toBe(7 * 60);
    expect(v.dayOver).toBe(false);
    expect(v.kpis.arrivals).toBe(0);
    expect(Math.max(...STATION_IDS.flatMap((id) => v.stations[id].workers.map((w) => w.fatigue)))).toBeLessThan(tired * 0.6);
    expect(v.history).toHaveLength(1);
    expect(v.history[0]!.day).toBe(PROMO_DAY);
  });

  it('the suspense account is cleared by the clerks during the next working day', () => {
    const sim = new BankSimulation({ seed: SEED });
    const first = sim.runToEndOfDay();
    expect(first.close.suspenseItems).toBeGreaterThan(10);
    sim.nextDay();
    sim.stepUntil(WORK_START);
    expect(sim.snapshot().stations.SUSPENSE.stats.processedToday).toBe(0);
    sim.stepUntil(WORK_END);
    const v = sim.snapshot();
    expect(v.stations.SUSPENSE.stats.processedToday).toBeGreaterThan(10);
    expect(v.kpis.suspenseClearedItems).toBe(v.stations.SUSPENSE.stats.processedToday);
    expect(v.kpis.suspenseClearedCents).toBeGreaterThan(0);
  });

  it('records the night team did not finish are carried into tomorrow night', () => {
    const sim = new BankSimulation({ seed: SEED, day: PROMO_DAY });
    const promo = sim.runToEndOfDay();
    expect(promo.close.reconBacklog).toBeGreaterThan(0);
    sim.nextDay();
    const next = sim.runToEndOfDay();
    expect(next.kpis.recon.records).toBeGreaterThan(next.kpis.approved - next.kpis.a2a.released - next.kpis.atm.dispensed);
  });

  it('can finish a day that is not over when asked to move on', () => {
    const sim = new BankSimulation({ seed: SEED });
    sim.stepUntil(12 * 60);
    sim.nextDay();
    expect(sim.day).toBe(2);
    expect(sim.snapshot().history).toHaveLength(1);
  });

  it('can be rebuilt from what a day hands on', () => {
    const a = new BankSimulation({ seed: SEED, day: PROMO_DAY });
    a.runToEndOfDay();
    const carry = a.carryState();
    expect(carry.suspense.length).toBeGreaterThan(0);
    expect(carry.backlog.length).toBeGreaterThan(0);
    const b = new BankSimulation({ seed: SEED, day: PROMO_DAY + 1, carry });
    const v = b.snapshot();
    expect(v.suspense.items).toBe(carry.suspense.length);
    expect(v.suspense.cents).toBe(carry.suspense.reduce((s, i) => s + i.amountCents, 0));
    expect(v.stations.EOD_BATCH.queueLength + v.stations.EOD_VISA.queueLength + v.stations.RECON.queueLength).toBe(carry.backlog.length);
    expect(JSON.parse(JSON.stringify(carry))).toEqual(carry);
  });
});

describe('changing a rule', () => {
  const base = day(NORMAL_DAY);
  const ring = day(RING_DAY);

  it('a lower frictionless line challenges more customers and loses more of them', () => {
    const strict = day(NORMAL_DAY, { frictionlessBelow: 20 });
    expect(strict.kpis.threeDs.challenged).toBeGreaterThan(base.kpis.threeDs.challenged * 2);
    expect(strict.kpis.threeDs.abandoned).toBeGreaterThan(base.kpis.threeDs.abandoned);
    expect(strict.kpis.frictionLostCount).toBeGreaterThan(base.kpis.frictionLostCount);
  });

  it('a higher frictionless line challenges fewer', () => {
    expect(day(NORMAL_DAY, { frictionlessBelow: 60 }).kpis.threeDs.challenged).toBeLessThan(base.kpis.threeDs.challenged / 2);
  });

  it('on a fraud-ring day, challenging more catches more fraud', () => {
    const strict = day(RING_DAY, { frictionlessBelow: 20 });
    expect(strict.kpis.fraudSlipped).toBeLessThan(ring.kpis.fraudSlipped);
    expect(strict.kpis.fraudLossCents).toBeLessThan(ring.kpis.fraudLossCents);
    expect(strict.kpis.threeDs.challenged).toBeGreaterThan(ring.kpis.threeDs.challenged);
  });

  it('on a fraud-ring day, waving more through lets more fraud in', () => {
    const loose = day(RING_DAY, { frictionlessBelow: 65, rejectAtOrAbove: 100 });
    expect(loose.kpis.fraudSlipped).toBeGreaterThan(ring.kpis.fraudSlipped);
  });

  it('a lower reject line rejects more, including genuine customers', () => {
    const strict = day(NORMAL_DAY, { rejectAtOrAbove: 55 });
    expect(strict.kpis.threeDs.rejected).toBeGreaterThan(base.kpis.threeDs.rejected);
  });

  it('a shorter dCVV window expires far more codes; a longer one expires fewer', () => {
    expect(day(NORMAL_DAY, { dcvvWindowSec: 30 }).kpis.virtual.expired).toBeGreaterThan(base.kpis.virtual.expired * 3);
    expect(day(NORMAL_DAY, { dcvvWindowSec: 120 }).kpis.virtual.expired).toBeLessThan(base.kpis.virtual.expired);
  });

  it('a longer dCVV window lets more replayed codes in on a fraud-ring day', () => {
    const long = day(RING_DAY, { dcvvWindowSec: 150 });
    const short = day(RING_DAY, { dcvvWindowSec: 25 });
    expect(long.kpis.fraudSlipped).toBeGreaterThanOrEqual(short.kpis.fraudSlipped);
  });

  it('a higher BNPL score line approves fewer plans and takes on less bad debt', () => {
    const strict = day(NORMAL_DAY, { bnplMinScore: 700 });
    expect(strict.kpis.bnpl.plans).toBeLessThan(base.kpis.bnpl.plans);
    expect(strict.kpis.bnpl.expectedLossCents).toBeLessThan(base.kpis.bnpl.expectedLossCents);
    expect(strict.kpis.bnpl.fallbackApproved).toBeGreaterThan(base.kpis.bnpl.fallbackApproved);
  });

  it('a lower BNPL score line approves more plans and more bad debt', () => {
    const loose = day(NORMAL_DAY, { bnplMinScore: 500 });
    expect(loose.kpis.bnpl.plans).toBeGreaterThan(base.kpis.bnpl.plans);
    expect(loose.kpis.bnpl.expectedLossCents).toBeGreaterThan(base.kpis.bnpl.expectedLossCents);
  });

  it('a higher down-payment floor turns customers who chose 25% back to a normal card', () => {
    expect(day(NORMAL_DAY, { bnplMinDownPct: 35 }).kpis.bnpl.plans).toBeLessThan(base.kpis.bnpl.plans / 4);
  });

  it('a zero tolerance floods the suspense account with rounding dust and swamps the night team', () => {
    const tight = day(NORMAL_DAY, { reconToleranceCents: 0 });
    expect(tight.kpis.recon.falseBreaks).toBeGreaterThan(base.kpis.recon.falseBreaks * 5);
    expect(tight.close.suspenseItems).toBeGreaterThan(base.close.suspenseItems * 2);
    expect(tight.close.reconBacklog).toBeGreaterThan(0);
  });

  it('a wide tolerance matches real errors away', () => {
    const loose = day(NORMAL_DAY, { reconToleranceCents: 1000 });
    expect(loose.kpis.recon.falseBreaks).toBe(0);
    expect(loose.kpis.recon.leakedCount).toBeGreaterThan(base.kpis.recon.leakedCount);
    expect(loose.kpis.recon.leakageCents).toBeGreaterThan(0);
  });

  it('a faulty Visa file fills the suspense account', () => {
    const glitch = day(GLITCH_DAY);
    expect(glitch.close.suspenseItems).toBeGreaterThan(base.close.suspenseItems * 2.5);
  });

  it('applies to customers who arrive after the change, not to payments already inside', () => {
    const sim = new BankSimulation({ seed: SEED });
    sim.stepUntil(11 * 60);
    const challengedBefore = sim.snapshot().kpis.threeDs.challenged;
    sim.setRules({ frictionlessBelow: 15 });
    expect(sim.rules.frictionlessBelow).toBe(15);
    sim.stepUntil(WORK_END);
    expect(sim.snapshot().kpis.threeDs.challenged).toBeGreaterThan(challengedBefore + 20);
  });

  it('keeps the dials inside their ranges', () => {
    const sim = new BankSimulation({ seed: SEED, rules: { frictionlessBelow: 95, rejectAtOrAbove: 50 } });
    expect(sim.rules.frictionlessBelow).toBeLessThan(sim.rules.rejectAtOrAbove);
  });

  it('shows the rules in force in the report', () => {
    expect(day(NORMAL_DAY, { frictionlessBelow: 33 }).rules.frictionlessBelow).toBe(33);
    expect(base.rules).toEqual(DEFAULT_RULES);
  });
});

describe('"what if" comparisons', () => {
  it('a change that is no change leaves every number alone', () => {
    const c = compareDays({ seed: SEED, startDay: NORMAL_DAY, baseRules: DEFAULT_RULES, tweakedRules: {} });
    expect(c.changed).toEqual([]);
    expect(c.rows.every((r) => r.delta === 0 && r.verdict === 'same')).toBe(true);
  });

  it('plays the same customers under both rule sets', () => {
    const c = compareDays({ seed: SEED, startDay: NORMAL_DAY, baseRules: DEFAULT_RULES, tweakedRules: { frictionlessBelow: 20 } });
    expect(c.changed).toEqual(['frictionlessBelow']);
    expect(c.before.kpis.arrivals).toBe(c.after.kpis.arrivals);
    expect(c.before.kpis.byKind).toEqual(c.after.kpis.byKind);
    expect(c.before.kpis.fraudAttempts).toBe(c.after.kpis.fraudAttempts);
    const challenge = c.rows.find((r) => r.def.id === 'challengeRate')!;
    expect(challenge.after).toBeGreaterThan(challenge.before);
  });

  it('judges the effect of a tighter fraud line on a ring day: less fraud, more good customers lost', () => {
    const c = compareDays({ seed: SEED, startDay: RING_DAY, baseRules: DEFAULT_RULES, tweakedRules: { frictionlessBelow: 20 } });
    const row = (id: string) => c.rows.find((r) => r.def.id === id)!;
    expect(row('fraudSlipped').verdict).toBe('better');
    expect(row('friction').verdict).toBe('worse');
  });

  it('adds several days together', () => {
    const c = compareDays({ seed: SEED, startDay: NORMAL_DAY, count: 3, baseRules: DEFAULT_RULES, tweakedRules: { bnplMinScore: 700 } });
    expect(c.days).toHaveLength(3);
    expect(c.before.kpis.arrivals).toBe(c.days.reduce((s, d) => s + d.before.kpis.arrivals, 0));
    expect(c.after.kpis.bnpl.plans).toBe(c.days.reduce((s, d) => s + d.after.kpis.bnpl.plans, 0));
    expect(c.before.close).toEqual(c.days[2]!.before.close);
  });

  it('starts from what the bank has been left with', () => {
    const sim = new BankSimulation({ seed: SEED, day: PROMO_DAY });
    sim.runToEndOfDay();
    const carry = sim.carryState();
    const withCarry = compareDays({ seed: SEED, startDay: PROMO_DAY + 1, baseRules: DEFAULT_RULES, tweakedRules: {}, carry });
    const without = compareDays({ seed: SEED, startDay: PROMO_DAY + 1, baseRules: DEFAULT_RULES, tweakedRules: {} });
    expect(withCarry.before.kpis.recon.records).toBeGreaterThan(without.before.kpis.recon.records);
  });

  it('adding up one report gives that report back', () => {
    const r = day(NORMAL_DAY);
    expect(sumReports([r])).toEqual(r);
  });

  it('is quick enough to run when a learner moves a slider', () => {
    const t = Date.now();
    compareDays({ seed: 99, startDay: 1, baseRules: DEFAULT_RULES, tweakedRules: { dcvvWindowSec: 40 } });
    expect(Date.now() - t).toBeLessThan(4000);
  });
});

describe('people get tired', () => {
  it('a busy desk ends the day more tired than a quiet one, and a tired person works more slowly', () => {
    const sim = new BankSimulation({ seed: SEED, day: PROMO_DAY });
    sim.stepUntil(WORK_START);
    const fresh = sim.snapshot().stations.LEDGER_DEBIT.workers.map((w) => w.productivity);
    sim.stepUntil(WORK_END);
    const v = sim.snapshot();
    const busy = Math.max(...v.stations.LEDGER_DEBIT.workers.map((w) => w.fatigue));
    const quiet = Math.max(...v.stations.GATE_VIRTUAL.workers.map((w) => w.fatigue));
    expect(busy).toBeGreaterThan(quiet + 25);
    expect(Math.min(...v.stations.LEDGER_DEBIT.workers.map((w) => w.productivity))).toBeLessThan(Math.min(...fresh));
  });

  it('exhausted staff fumble items and have to redo them', () => {
    let reworks = 0;
    for (const d of [PROMO_DAY, 10]) reworks += day(d).kpis.reworks;
    expect(reworks).toBeGreaterThan(0);
  });

  it('warns about a worn-out person', () => {
    const sim = new BankSimulation({ seed: SEED, day: PROMO_DAY });
    let warned = false;
    while (!sim.dayOver) {
      sim.step();
      if (sim.snapshot().alerts.some((a) => a.id.startsWith('fatigue:'))) warned = true;
    }
    expect(warned).toBe(true);
  });

  it('the night team is off shift in the daytime', () => {
    const sim = new BankSimulation({ seed: SEED });
    sim.stepUntil(11 * 60);
    expect(sim.snapshot().stations.RECON.workers[0]!.activity).toMatch(/Off shift/);
  });
});

describe('speed', () => {
  it('plays a day with nobody watching in well under two seconds', () => {
    const t = Date.now();
    simulateDay({ seed: 3, day: 2 });
    expect(Date.now() - t).toBeLessThan(2000);
  });
});
