/**
 * Regression suite §4: the Straight-Through Processing engine. The auto-approval rules, the fast-fail gate, the fall-back to the
 * human desk, the dials' limits, the demo routes they decide, and the day's STP tally and queues.
 */

import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { executeDemo } from '../../../components/bank/retailOpsActions';
import { bankStore } from '../../../store/bankStore';
import { BankSimulation } from '../../bankSimulation';
import { clampStp, DEFAULT_STP, decideStp, fastFail, OPS_STP_CASE, opsStpVerdict, STP_FLAG_TEXT, STP_LIMITS, stpEqual, stpPlaces, stpRoute, straightThroughRate, type StpCase, type StpConfig } from '../../stpEngine';
import type { OpsActionId } from '../../retailOps';
import { at, freshBank, playDemoToEnd } from './harness';

const good: StpCase = { product: 'BNPL', amountCents: 40_000, ekyc: 'PASS', dtiPct: 20, cicGroup: 1 };

beforeEach(() => {
  freshBank();
  bankStore.getState().setStp(DEFAULT_STP);
});

describe('§4.1 auto-approval rules', () => {
  it('approves a low-risk digital case with no human touch', () => {
    expect(decideStp(good, DEFAULT_STP)).toEqual({ route: 'STP', flags: [], action: 'APPROVE' });
    expect(decideStp({ product: 'TERM_DEPOSIT', amountCents: 1_000_000 }, DEFAULT_STP)).toEqual({ route: 'STP', flags: [], action: 'RENEW' });
    expect(decideStp({ product: 'CARD_FEE', amountCents: 1_000, casaCents: 5_000 }, DEFAULT_STP)).toEqual({ route: 'STP', flags: [], action: 'DEBIT' });
    expect(decideStp({ product: 'CARD_FEE', amountCents: 4_500, casaCents: 0, spendCents: STP_LIMITS.premiumSpendCents }, DEFAULT_STP)).toEqual({ route: 'STP', flags: [], action: 'WAIVE' });
    expect(decideStp({ product: 'KIOSK_CASH', amountCents: 500_000 }, DEFAULT_STP)).toEqual({ route: 'STP', flags: [], action: 'POST' });
  });

  it('diverts to the manual queue on every threshold or risk breach, naming each', () => {
    expect(decideStp({ ...good, amountCents: DEFAULT_STP.bnplMaxCents + 1 }, DEFAULT_STP).flags).toEqual(['AMOUNT_OVER_LIMIT']);
    expect(decideStp({ ...good, dtiPct: DEFAULT_STP.maxDtiPct + 0.1 }, DEFAULT_STP).flags).toEqual(['DTI_OVER_LIMIT']);
    expect(decideStp({ ...good, dtiPct: DEFAULT_STP.maxDtiPct }, DEFAULT_STP).route).toBe('STP');
    expect(decideStp({ ...good, cicGroup: 2 }, DEFAULT_STP).flags).toEqual(['CIC_NOT_GROUP_1']);
    expect(decideStp({ ...good, amlHit: true }, DEFAULT_STP).flags).toEqual(['AML_SANCTION_MATCH']);
    expect(decideStp({ ...good, amountCents: 999_999, dtiPct: 40, cicGroup: 2, amlHit: true }, DEFAULT_STP)).toEqual({ route: 'MANUAL', flags: ['AMOUNT_OVER_LIMIT', 'DTI_OVER_LIMIT', 'CIC_NOT_GROUP_1', 'AML_SANCTION_MATCH'] });
    expect(decideStp({ product: 'TERM_DEPOSIT', amountCents: 1_000, pledged: true }, DEFAULT_STP).flags).toEqual(['PLEDGED']);
    expect(decideStp({ product: 'TERM_DEPOSIT', amountCents: STP_LIMITS.termDepositMaxCents }, DEFAULT_STP).flags).toEqual(['AMOUNT_OVER_LIMIT']);
    expect(decideStp({ product: 'CARD_FEE', amountCents: 4_500, casaCents: 100 }, DEFAULT_STP).flags).toEqual(['INSUFFICIENT_CASA']);
    // A missing bureau fact is the worst case: never auto-approved.
    expect(decideStp({ product: 'BNPL', amountCents: 10_000 }, DEFAULT_STP).route).toBe('MANUAL');
  });

  it('fast-fails a dead payload at the gate before any switch is read', () => {
    for (const ekyc of ['BIOMETRIC_AUTH_FAILED', 'FDS_HIGH_RISK_DEVICE'] as const) {
      expect(fastFail({ ...good, ekyc })).toBe(ekyc);
      expect(decideStp({ ...good, ekyc }, { ...DEFAULT_STP, enabled: false })).toEqual({ route: 'REJECT', flags: [ekyc] });
    }
    for (const cicGroup of [3, 4, 5] as const) expect(decideStp({ ...good, cicGroup }, DEFAULT_STP)).toEqual({ route: 'REJECT', flags: ['CIC_BAD_DEBT'] });
    expect(fastFail(good)).toBeNull();
  });

  it('sends everything to the desk when STP is off, bank-wide or per product', () => {
    expect(decideStp(good, { ...DEFAULT_STP, enabled: false })).toEqual({ route: 'MANUAL', flags: ['STP_DISABLED'] });
    expect(decideStp({ product: 'TERM_DEPOSIT', amountCents: 1 }, { ...DEFAULT_STP, termDeposit: false }).flags).toEqual(['PRODUCT_OFF']);
    expect(decideStp({ product: 'CARD_FEE', amountCents: 1, casaCents: 9 }, { ...DEFAULT_STP, cardFees: false }).flags).toEqual(['PRODUCT_OFF']);
    expect(decideStp({ product: 'KIOSK_CASH', amountCents: 1 }, { ...DEFAULT_STP, kiosk: false }).flags).toEqual(['PRODUCT_OFF']);
  });

  it('only ever answers STP with no flags, and MANUAL / REJECT with at least one, each with words in both languages (property)', () => {
    const cfg = fc.record({ enabled: fc.boolean(), bnplMaxCents: fc.integer({ min: 0, max: 400_000 }), maxDtiPct: fc.integer({ min: 0, max: 60 }), termDeposit: fc.boolean(), cardFees: fc.boolean(), kiosk: fc.boolean() });
    const kase = fc.record(
      {
        product: fc.constantFrom('BNPL', 'TERM_DEPOSIT', 'CARD_FEE', 'KIOSK_CASH' as const),
        amountCents: fc.integer({ min: 0, max: 10_000_000 }),
        ekyc: fc.constantFrom('PASS', 'BIOMETRIC_AUTH_FAILED', 'FDS_HIGH_RISK_DEVICE' as const),
        dtiPct: fc.integer({ min: 0, max: 80 }),
        cicGroup: fc.constantFrom(1, 2, 3, 4, 5 as const),
        pledged: fc.boolean(),
        casaCents: fc.integer({ min: 0, max: 100_000 }),
        spendCents: fc.integer({ min: 0, max: 2_000_000 }),
        amlHit: fc.boolean(),
      },
      { requiredKeys: ['product', 'amountCents'] },
    );
    fc.assert(
      fc.property(kase, cfg, (c, k) => {
        const v = decideStp(c as StpCase, k as StpConfig);
        if (v.route === 'STP') {
          expect(v.flags).toEqual([]);
          expect(v.action).toBeDefined();
        } else expect(v.flags.length).toBeGreaterThan(0);
        for (const f of v.flags) expect(STP_FLAG_TEXT[f].en && STP_FLAG_TEXT[f].vi).toBeTruthy();
      }),
    );
  });
});

describe('§4.2 the dials and their limits', () => {
  it('clamps any stale or hostile config into range and onto the step', () => {
    expect(clampStp(null)).toEqual(DEFAULT_STP);
    expect(clampStp({ bnplMaxCents: 1, maxDtiPct: 999 })).toMatchObject({ bnplMaxCents: STP_LIMITS.bnplMaxCents.min, maxDtiPct: STP_LIMITS.maxDtiPct.max });
    expect(clampStp({ bnplMaxCents: Number.NaN, enabled: 'yes' as unknown as boolean })).toMatchObject({ bnplMaxCents: DEFAULT_STP.bnplMaxCents, enabled: DEFAULT_STP.enabled });
    fc.assert(
      fc.property(fc.double({ noNaN: false }), fc.double({ noNaN: false }), (a, b) => {
        const c = clampStp({ bnplMaxCents: a, maxDtiPct: b });
        expect(c.bnplMaxCents).toBeGreaterThanOrEqual(STP_LIMITS.bnplMaxCents.min);
        expect(c.bnplMaxCents).toBeLessThanOrEqual(STP_LIMITS.bnplMaxCents.max);
        expect(c.bnplMaxCents % STP_LIMITS.bnplMaxCents.step).toBe(0);
        expect(c.maxDtiPct).toBeGreaterThanOrEqual(STP_LIMITS.maxDtiPct.min);
        expect(c.maxDtiPct).toBeLessThanOrEqual(STP_LIMITS.maxDtiPct.max);
        expect(stpEqual(clampStp(c), c)).toBe(true);
      }),
    );
  });

  it('applies the dials to the live bank and keeps them clamped', () => {
    bankStore.getState().setStp({ bnplMaxCents: 10, maxDtiPct: 50 });
    expect(bankStore.getState().stp).toMatchObject({ bnplMaxCents: STP_LIMITS.bnplMaxCents.min, maxDtiPct: STP_LIMITS.maxDtiPct.max });
  });
});

describe('§4.3 the demo buttons the engine decides', () => {
  const expected: Readonly<Partial<Record<OpsActionId, 'STP' | 'MANUAL' | 'REJECT'>>> = {
    'bnpl-approve-400': 'STP',
    'bnpl-decline-dti': 'MANUAL',
    'bnpl-decline-cic': 'REJECT',
    'td-mature-close': 'STP',
    'td-break-pledged': 'MANUAL',
    'fee-card-10': 'STP',
    'fee-annual-45': 'MANUAL',
    'fee-collect-fail': 'MANUAL',
    'fee-annual-waived': 'STP',
    'teller-deposit-5000': 'STP',
  };

  it('routes each STP-backed button as documented under the default dials', () => {
    expect(Object.keys(expected).sort()).toEqual(Object.keys(OPS_STP_CASE).sort());
    for (const [id, route] of Object.entries(expected) as [OpsActionId, string][]) expect(opsStpVerdict(id, DEFAULT_STP)?.route, id).toBe(route);
  });

  it('drops the human desk from a straight-through route and keeps it on a manual one; a rejection ends declined', () => {
    const manual = ['GATE_ECOM', 'BNPL', 'OUT_APPROVED'] as const;
    expect(stpRoute('bnpl-approve-400', manual, DEFAULT_STP)).toEqual(['GATE_ECOM', 'STP_ENGINE', 'OUT_APPROVED']);
    expect(stpRoute('bnpl-approve-400', manual, { ...DEFAULT_STP, enabled: false })).toEqual(manual);
    expect(stpRoute('bnpl-decline-cic', manual, DEFAULT_STP).at(-1)).toBe('OUT_DECLINED');
    // Every place a demo can light covers both of its possible routes.
    for (const id of Object.keys(OPS_STP_CASE) as OpsActionId[]) {
      const lit = new Set(stpPlaces(id, manual));
      for (const cfg of [DEFAULT_STP, { ...DEFAULT_STP, enabled: false }]) for (const p of stpRoute(id, manual, cfg)) expect(lit.has(p), `${id} ${p}`).toBe(true);
    }
  });

  it('plays the BNPL approval through the STP engine, and through the desk once STP is off', () => {
    at(10 * 60);
    executeDemo('bnpl-approve-400');
    expect(playDemoToEnd()).toBe(true);
    const straight = bankStore.getState().presetTrace!.route;
    expect(straight).toContain('STP_ENGINE');
    expect(straight).not.toContain('BNPL');

    freshBank();
    bankStore.getState().setStp({ enabled: false });
    at(10 * 60);
    executeDemo('bnpl-approve-400');
    expect(playDemoToEnd()).toBe(true);
    expect(bankStore.getState().presetTrace!.route).not.toContain('STP_ENGINE');
    bankStore.getState().setStp(DEFAULT_STP);
  });
});

describe('§4.4 queues, the day’s STP tally and its rate', () => {
  it('computes the straight-through rate as STP / (STP + manual), 0 with nothing decided', () => {
    expect(straightThroughRate(0, 0)).toBe(0);
    expect(straightThroughRate(3, 1)).toBe(0.75);
    fc.assert(fc.property(fc.nat(10_000), fc.nat(10_000), (s, m) => {
      const r = straightThroughRate(s, m);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }));
  });

  it('tallies a whole day consistently, and switching STP off moves the work to the desk', () => {
    const on = new BankSimulation({ seed: 9, day: 1, headless: true });
    on.runToEndOfDay();
    const t = on.stpTally();
    expect(t.straight).toBeGreaterThan(0);
    expect(t.rate).toBeCloseTo(straightThroughRate(t.straight, t.manual), 10);

    const off = new BankSimulation({ seed: 9, day: 1, headless: true, stp: { enabled: false } });
    off.runToEndOfDay();
    const u = off.stpTally();
    expect(u.straight).toBe(0);
    expect(u.manual).toBeGreaterThan(t.manual);
    expect(u.rate).toBe(0);
  });

  it('empties every desk queue by the end of the day (no case is lost in a pool)', () => {
    const sim = new BankSimulation({ seed: 4, day: 1, headless: true });
    sim.runToEndOfDay();
    const view = sim.snapshot();
    // The suspense account is not a work queue: unmatched settlements age there across days by design (view.suspense).
    const left = Object.entries(view.stations).filter(([id, st]) => id !== 'SUSPENSE' && (st as { queueLength: number }).queueLength > 0).map(([id]) => id);
    expect(left).toEqual([]);
    expect(sim.customersInFlight()).toBe(0);
  });
});
