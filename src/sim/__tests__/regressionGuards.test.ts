import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeDemo, runDemo } from '../../components/bank/retailOpsActions';
import { everyTransactionBalances, trialBalance } from '../../engine/ledger';
import { installAmbientVisits } from '../../store/ambientVisits';
import { bankStore, beatLive } from '../../store/bankStore';
import { deskVisitStore, stepSeconds, visitElapsed } from '../../store/deskVisitStore';
import { retailOpsStore } from '../../store/retailOpsStore';
import { shiftQueueStore } from '../../store/shiftQueueStore';
import { WORK_END, WORK_START } from '../clock';
import { DEMO_GROUPS, demoGroup, groupMembers } from '../demoGroups';
import { AMBIENT_VISITS, ambientVisitsDue, DESK_VISITS, type DeskVisitStep } from '../deskVisit';
import { OPS_ACTIONS, openingBook, opsJournalBalanced, opsTrial, runOpsAction, type OpsActionId } from '../retailOps';
import { VISIT_2D, VISIT_3D } from '../../engine/plan/deskVisitPaths';
import { DeskStatusFeed, deskStatusOf } from '../../engine/simulation/deskStatus';
import { occupancyOf } from '../../store/deskOccupancy';
import { visitCounts } from '../deskVisit';
import { CROWD_CAP, crowdSize, crowdStep, emptyCrowd } from '../deskCrowd';

/**
 * Regression guards for three reported bugs, and the invariants behind them:
 *  1. Nobody ever walked to the Savings Desk or the Collateral Vault unless a demo button was pressed.
 *  2. A paused bank replayed its last beat's payments when the map was drawn again (2D/3D, another sub-process) or its clock moved.
 *  3. Core banking rules hold over any sequence of demos: Σ Dr = Σ Cr, per transaction and over the day.
 */

const AT = 'D1 10:00:00';
const s = () => bankStore.getState();

const resetAll = (): void => {
  s().pause();
  s().resetDay();
  shiftQueueStore.getState().clear();
  retailOpsStore.getState().reset();
  deskVisitStore.getState().clear();
};

// 1. The day's walk-ins at the Savings Desk and the Collateral Vault

describe('walk-in customers at the Savings Desk and the Collateral Vault', () => {
  it('brings one to each desk on its cadence, minute by minute, only inside opening hours', () => {
    const seen = new Map<string, number[]>();
    for (let m = WORK_START - 120; m < WORK_END + 120; m++) {
      for (const step of ambientVisitsDue(m, m + 1, WORK_START, WORK_END)) seen.set(step.desk, [...(seen.get(step.desk) ?? []), m + 1]);
    }
    for (const slot of AMBIENT_VISITS) {
      const times = seen.get(slot.desk) ?? [];
      expect(times.length, slot.desk).toBe(Math.floor((WORK_END - 1 - (WORK_START + slot.offset)) / slot.every) + 1);
      expect(times[0]).toBe(WORK_START + slot.offset);
      for (const t of times) expect(t >= WORK_START && t < WORK_END, `${slot.desk} at ${t}`).toBe(true);
      for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBe(slot.every);
    }
    expect([...seen.keys()].sort()).toEqual(['COLLATERAL_VAULT', 'SAVINGS_DESK']);
  });

  it('never brings anyone for a clock that stood still or went back, and never two to one desk for a long jump (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1440 }), fc.integer({ min: -600, max: 1440 }), (from, d) => {
        const to = from + d;
        const due = ambientVisitsDue(from, to, WORK_START, WORK_END);
        if (to <= from) expect(due).toEqual([]);
        expect(new Set(due.map((v) => v.desk)).size).toBe(due.length);
        for (const v of due) {
          const slot = AMBIENT_VISITS.find((a) => a.desk === v.desk)!;
          expect(slot.works).toContain(v.work);
          expect(v.officer).toBe(slot.officer);
          expect(v.customers).toBeGreaterThanOrEqual(1);
          expect(v.customers).toBeLessThanOrEqual(2);
        }
      }),
    );
  });

  it('draws a real walk on both maps for every walk-in it can bring: a finite, positive time at the desk', () => {
    for (const slot of AMBIENT_VISITS) {
      for (const work of slot.works) {
        for (const customers of [1, 2]) {
          const secs = stepSeconds({ desk: slot.desk, customers, officer: slot.officer, delay: 0, work });
          expect(Number.isFinite(secs) && secs > 0, `${slot.desk} ${work}`).toBe(true);
        }
      }
    }
  });

  describe('driven by the bank clock', () => {
    let stop: (() => void) | null = null;
    beforeEach(() => {
      resetAll();
      stop = installAmbientVisits();
    });
    afterEach(() => {
      stop?.();
      stop = null;
      resetAll();
    });

    const desks = (): string[] => deskVisitStore.getState().visits.map((v) => v.step.desk).sort();

    it('brings people to both desks while the bank plays through opening hours', () => {
      s().skipTo(WORK_START);
      s().play();
      for (let i = 0; i < 400 && desks().length < 2; i++) s().tickBeat();
      expect(desks()).toEqual(['COLLATERAL_VAULT', 'SAVINGS_DESK']);
    });

    it('brings nobody while paused, whatever the clock is moved to', () => {
      s().skipTo(WORK_START + 5);
      s().skipTo(WORK_START + 200);
      s().jumpToEod();
      expect(s().playing).toBe(false);
      expect(desks()).toEqual([]);
    });

    it('never displaces a demo already at the desk, and stays out once the bank is paused', () => {
      s().skipTo(WORK_START);
      executeDemo('td-break-10k');
      const demo = deskVisitStore.getState().visits.map((v) => v.id);
      expect(deskVisitStore.getState().arrive({ desk: 'SAVINGS_DESK', customers: 1, officer: false, delay: 0, work: 'close' })).toBe(false);
      expect(deskVisitStore.getState().visits.map((v) => v.id)).toEqual(demo);
      s().pause();
      expect(deskVisitStore.getState().frozenAt).not.toBeNull();
      expect(deskVisitStore.getState().arrive({ desk: 'COLLATERAL_VAULT', customers: 1, officer: true, delay: 0, work: 'lock' })).toBe(false);
    });

    it('starts a walk-in clock of its own: time the others spent frozen is not taken from it', () => {
      const store = deskVisitStore.getState();
      const step: DeskVisitStep = { desk: 'BNPL', customers: 2, officer: true, delay: 0, work: 'appraise' };
      store.start('bnpl-approve-400', 0);
      store.freeze(1_000);
      store.thaw(9_000);
      expect(deskVisitStore.getState().frozenMs).toBe(8_000);
      expect(store.arrive({ ...step, desk: 'SAVINGS_DESK' }, 9_000)).toBe(true);
      const walkIn = deskVisitStore.getState().visits.find((v) => v.step.desk === 'SAVINGS_DESK')!;
      expect(visitElapsed(walkIn, 9_000)).toBeCloseTo(0, 5);
      expect(visitElapsed(walkIn, 10_500)).toBeCloseTo(1.5, 5);
    });
  });
});

// 2. A pause is a pause

describe('pause isolation: nothing moves on a paused bank but what the learner asks for', () => {
  beforeEach(resetAll);
  afterEach(resetAll);

  it('never lets the last beat replay after the map is drawn again or the clock is moved while paused', () => {
    s().skipTo(WORK_START);
    s().play();
    for (let i = 0; i < 6; i++) s().tickBeat();
    expect(beatLive(s())).toBe(true);
    s().pause();
    expect(beatLive(s())).toBe(false);
    s().setViewMode('3d');
    s().selectSubProcess('term-deposit', 6);
    s().setViewMode('2d');
    s().setActiveFlow(2);
    expect(beatLive(s())).toBe(false);
    s().skipTo(WORK_START + 120);
    expect(beatLive(s())).toBe(false);
    expect(s().playing).toBe(false);
  });

  it('plays the one beat the learner steps to by hand, and only that one', () => {
    s().skipTo(WORK_START);
    s().step();
    expect(s().playing).toBe(false);
    expect(beatLive(s())).toBe(true);
    s().setViewMode('3d');
    expect(beatLive(s()), 'a view toggle does not change the beat').toBe(true);
    s().skipTo(WORK_START + 30);
    expect(beatLive(s()), 'a later snapshot is not the stepped one').toBe(false);
    s().setViewMode('2d');
  });

  it('freezes the people at the counters on every way the bank stops, not only the Pause button', () => {
    const stops: Array<[string, () => void]> = [
      ['resetDay', () => s().resetDay()],
      ['startSpotlight', () => s().startSpotlight('B')],
      ['pause', () => s().pause()],
    ];
    for (const [name, stopIt] of stops) {
      resetAll();
      s().skipTo(WORK_START);
      s().play();
      deskVisitStore.getState().start('td-break-10k');
      expect(deskVisitStore.getState().frozenAt, name).toBeNull();
      stopIt();
      expect(s().playing, name).toBe(false);
      expect(deskVisitStore.getState().frozenAt, name).not.toBeNull();
      if (s().spotlight) s().exitSpotlight();
    }
  });

  it('lets a solo demo run end by itself without freezing its people (they finish their business)', () => {
    s().skipTo(WORK_START);
    executeDemo('td-break-10k');
    expect(s().solo).toBe(true);
    for (let i = 0; i < 200 && s().playing; i++) s().tickBeat();
    expect(s().playing).toBe(false);
    expect(deskVisitStore.getState().frozenAt).toBeNull();
  });

  it('holds over any sequence of view, flow, sub-process and clock changes made while paused (property)', () => {
    const groups = DEMO_GROUPS.map((g) => g.id);
    const action = fc.oneof(
      fc.constantFrom('2d', '3d').map((v) => ({ kind: 'view' as const, v: v as '2d' | '3d' })),
      fc.constantFrom(...groups).map((g) => ({ kind: 'sub' as const, g })),
      fc.integer({ min: 1, max: 8 }).map((f) => ({ kind: 'flow' as const, f })),
      fc.integer({ min: 1, max: 90 }).map((m) => ({ kind: 'skip' as const, m })),
      fc.constant({ kind: 'select' as const }),
    );
    fc.assert(
      fc.property(fc.array(action, { minLength: 1, maxLength: 12 }), (actions) => {
        resetAll();
        s().skipTo(WORK_START);
        const opsBefore = retailOpsStore.getState().book.posted;
        for (const a of actions) {
          if (a.kind === 'view') s().setViewMode(a.v);
          else if (a.kind === 'sub') s().selectSubProcess(a.g, demoGroup(a.g).flow as never);
          else if (a.kind === 'flow') s().setActiveFlow(a.f as never);
          else if (a.kind === 'skip') s().skipTo(Math.min(WORK_END - 1, s().view.minute + a.m));
          else s().clearSelection();
          expect(s().playing).toBe(false);
          expect(s().solo).toBe(false);
          expect(beatLive(s())).toBe(false);
          expect(s().presetTxId).toBeNull();
          expect(deskVisitStore.getState().visits).toEqual([]);
        }
        // No retail journal was posted and no queued scenario ran behind the learner's back.
        expect(retailOpsStore.getState().book.posted).toBe(opsBefore);
        expect(retailOpsStore.getState().last).toBeNull();
      }),
      { numRuns: 40 },
    );
    s().setViewMode('2d');
  });

  it('still runs a demo the learner presses while paused (an explicit action), as a solo run', () => {
    s().skipTo(WORK_START);
    runDemo('collateral-lock');
    expect(s().solo).toBe(true);
    expect(deskVisitStore.getState().visits.map((v) => v.step.desk)).toEqual(DESK_VISITS['collateral-lock']!.map((v) => v.desk));
  });
});

// 3. Core banking invariants

describe('ledger invariants over any sequence of demos', () => {
  beforeEach(resetAll);
  afterEach(resetAll);

  const demos = [...new Set(DEMO_GROUPS.flatMap((g) => groupMembers(g.id).map((m) => m.def.id)))].filter((id) => id !== 'eod');

  it('posts balanced entries (Σ Dr = Σ Cr) per transaction and over the whole day, whatever demos run in whatever order (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...demos), { minLength: 1, maxLength: 8 }), (ids) => {
        resetAll();
        s().skipTo(WORK_START + 30);
        for (const id of ids) {
          executeDemo(id as never);
          for (let i = 0; i < 60 && s().playing; i++) s().tickBeat();
        }
        const entries = s().sim.ledgerEntries;
        expect(everyTransactionBalances(entries)).toBe(true);
        expect(trialBalance(entries).balanced).toBe(true);
        for (const e of entries) expect(e.amount).toBeGreaterThan(0);
        expect(opsTrial(retailOpsStore.getState().book).balanced).toBe(true);
      }),
      { numRuns: 25 },
    );
  });

  it('never posts or moves money for a refused retail case, and leaves the book exactly as it was', () => {
    const book = openingBook();
    for (const a of OPS_ACTIONS) {
      const r = runOpsAction(book, a.id, AT);
      if (r.outcome.status === 'BLOCKED') {
        expect(r.outcome.journal, a.id).toBeNull();
        expect(r.book.balances, a.id).toEqual(book.balances);
      }
      if (r.outcome.journal) expect(opsJournalBalanced(r.outcome.journal.lines), a.id).toBe(true);
      // No line is ever both sides, or empty.
      for (const l of r.outcome.journal?.lines ?? []) expect((l.dr > 0) !== (l.cr > 0), a.id).toBe(true);
    }
  });

  it('runs the named edge cases to the outcome their label promises', () => {
    const outcome = (id: OpsActionId) => runOpsAction(openingBook(), id, AT).outcome;
    // Insufficient funds: the bill is returned with ISO 8583 RC 51.
    expect(outcome('bill-nsf-51')).toMatchObject({ rc: '51' });
    expect(outcome('bill-nsf-51').status).not.toBe('APPROVED');
    // A biller timeout never leaves the customer charged for a bill the biller did not take.
    const timeout = runOpsAction(openingBook(), 'bill-timeout-68', AT);
    expect(timeout.outcome.rc).toBe('68');
    expect(timeout.outcome.customer?.after ?? timeout.outcome.customer?.before).toBe(timeout.outcome.customer?.before);
    // A collateral shortfall applies the pledge and keeps the books balanced over the lock and the liquidation.
    const locked = runOpsAction(openingBook(), 'collateral-lock', AT).book;
    const short = runOpsAction(locked, 'collateral-shortfall', AT);
    expect(opsTrial(short.book).balanced).toBe(true);
    // A pledged savings book cannot be closed; an ID mismatch pays nothing.
    for (const id of ['td-break-pledged', 'td-break-id-mismatch'] as const) {
      const r = runOpsAction(openingBook(), id, AT);
      expect(r.outcome.status, id).not.toBe('APPROVED');
      expect(r.book.balances.TERM_DEPOSIT, id).toBe(openingBook().balances.TERM_DEPOSIT);
    }
    // A SWIFT sanction hit is frozen on the core: declined for the sanction match, restrained, never paid out.
    s().skipTo(WORK_START + 60);
    executeDemo('swift-sanction');
    expect(s().presetTrace!.plan).toMatchObject({ outcome: 'DECLINED', decline: 'AML_SANCTION_MATCH' });
  });
});

// 4. A desk with people at it says so


describe('the badge of a desk with people at it', () => {
  beforeEach(resetAll);
  afterEach(resetAll);

  const step: DeskVisitStep = { desk: 'SAVINGS_DESK', customers: 3, officer: true, delay: 0, work: 'close' };

  it('counts the customers walking in and in line as waiting, the one at the counter as processing, and never the officer', () => {
    for (const geo of [VISIT_2D.SAVINGS_DESK, VISIT_3D.SAVINGS_DESK]) {
      let sawWaiting = false;
      let sawProcessing = false;
      for (let t = 0; t < stepSeconds(step); t += 0.25) {
        const c = visitCounts(step, geo, t);
        expect(c.waiting + c.processing).toBeLessThanOrEqual(step.customers);
        expect(c.processing).toBeLessThanOrEqual(1);
        sawWaiting ||= c.waiting > 0;
        sawProcessing ||= c.processing > 0;
      }
      expect(sawWaiting && sawProcessing).toBe(true);
      expect(visitCounts(step, geo, stepSeconds(step) + 1)).toEqual({ waiting: 0, processing: 0 });
    }
  });

  it('turns "0 waiting · idle" into "X waiting · Y working · busy" while people are at an idle desk', () => {
    const sv = s().view.stations.SAVINGS_DESK;
    expect(sv.status).toBe('IDLE');
    expect(deskStatusOf(sv, { waiting: 2, processing: 1 })).toMatchObject({ waiting: sv.queueLength + 2, working: 1, status: 'BUSY' });
    expect(deskStatusOf(sv)).toEqual(deskStatusOf(sv, undefined));
  });

  it('feeds the overlay to every subscriber, keeping the same object while the count does not change', () => {
    let people: { waiting: number; processing: number } | undefined;
    const listeners = new Set<() => void>();
    const feed = new DeskStatusFeed(bankStore, { get: (id) => (id === 'SAVINGS_DESK' ? people : undefined), subscribe: (l) => (listeners.add(l), () => listeners.delete(l)) });
    let heard = 0;
    const stop = feed.subscribe('SAVINGS_DESK', () => heard++);
    const idle = feed.get('SAVINGS_DESK');
    people = { waiting: 1, processing: 1 };
    listeners.forEach((l) => l());
    expect(heard).toBe(1);
    expect(feed.get('SAVINGS_DESK')).toMatchObject({ waiting: idle.waiting + 1, working: 1 });
    listeners.forEach((l) => l());
    expect(heard).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
  });

  it('adds up the visits of a desk, and leaves out the desks nobody is at', () => {
    s().skipTo(WORK_START);
    deskVisitStore.getState().start('collateral-lock', 0);
    const occ = occupancyOf(deskVisitStore.getState().visits, '2d', 1_000);
    expect(Object.keys(occ)).toEqual(['COLLATERAL_VAULT']);
    expect(occ.COLLATERAL_VAULT!.waiting + occ.COLLATERAL_VAULT!.processing).toBeGreaterThan(0);
    expect(occupancyOf(deskVisitStore.getState().visits, '3d', 600_000)).toEqual({});
  });
});

describe('the 2D line at the walk-up counters', () => {
  it('serves from the head and joins at the tail, never more than the cap, keys never reused (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 12 }), { maxLength: 40 }), (sizes) => {
        let c = emptyCrowd(0);
        const seen = new Set<number>();
        for (const n of sizes) {
          const before = c.line;
          const r = crowdStep(c, n);
          c = r.crowd;
          expect(c.line.length).toBe(Math.min(CROWD_CAP, n));
          expect(r.left).toEqual(before.slice(0, r.left.length));
          for (const k of r.joined) {
            expect(seen.has(k)).toBe(false);
            seen.add(k);
          }
          expect(new Set(c.line).size).toBe(c.line.length);
        }
      }),
    );
    expect(crowdSize(2, 1)).toBe(3);
    expect(crowdSize(0, 0)).toBe(0);
  });
});
