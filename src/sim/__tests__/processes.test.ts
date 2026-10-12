import { describe, expect, it } from 'vitest';
import type { BankingPayload } from '../../types/processLearning';
import { buildGraphs, planCheckout, planSettlement, routeIsWired } from '../processes';
import { DEFAULT_RULES, clampRules } from '../rules';
import { generateDay } from '../traffic';
import type { CheckoutKind, Customer } from '../types';

const TS = 1_800_000_000_000;

const base = (over: Partial<BankingPayload> = {}): BankingPayload => ({
  txId: 'tx_test',
  amount: 5000,
  channel: 'ECOMMERCE',
  cardType: 'DEBIT',
  rawCvv: '123',
  clientTimestamp: TS,
  riskScore: 10,
  isFraud: false,
  availableBalance: 100_000,
  creditLimit: 0,
  ...over,
});

const customer = (kind: CheckoutKind, payload: BankingPayload, otpCompletes = true): Customer => ({ id: 'c1', kind, scenario: '', minute: 600, payload, otpCompletes });

const virtual = (ageMs: number, over: Partial<BankingPayload> = {}, funding: 'DEBIT' | 'CREDIT' = 'DEBIT'): BankingPayload =>
  base({
    cardType: 'VIRTUAL_DPAN',
    rawCvv: '482',
    virtualCard: { dpan: '5111111111111111', vaultEntry: { fpanLast4: '4242', status: 'ACTIVE', fundingSource: funding, expectedDcvv: '482', dcvvIssuedAt: TS - ageMs } },
    ...over,
  });

const places = (plan: { stops: Array<{ place: string }> }): string[] => plan.stops.map((s) => s.place);
const graphs = buildGraphs(DEFAULT_RULES);

describe('buildGraphs', () => {
  it('writes the bank rules into the node settings of the real diagrams', () => {
    const g = buildGraphs(clampRules({ dcvvWindowSec: 90, frictionlessBelow: 30, rejectAtOrAbove: 70, bnplMinScore: 650, bnplMinDownPct: 30, reconToleranceCents: 12 }));
    expect(g.virtual.nodes.find((n) => n.id === 'n_dcvv')?.configParams.validityWindowMs).toBe(90_000);
    expect(g.ecom.nodes.find((n) => n.id === 'n_3ds')?.configParams).toMatchObject({ frictionlessBelow: 30, rejectAtOrAbove: 70 });
    expect(g.bnpl.nodes.find((n) => n.id === 'n_bnpl')?.configParams).toMatchObject({ minScore: 650, minDownPaymentPct: 30 });
    expect(g.settle.nodes.find((n) => n.id === 'n_recon')?.configParams.toleranceMinor).toBe(12);
  });

  it('does not change the shared reference diagrams', () => {
    buildGraphs(clampRules({ frictionlessBelow: 15 }));
    expect(buildGraphs(DEFAULT_RULES).ecom.nodes.find((n) => n.id === 'n_3ds')?.configParams.frictionlessBelow).toBe(40);
  });
});

describe('virtual card route', () => {
  it('goes gate, vault, dCVV, ledger, approved', () => {
    const plan = planCheckout(customer('VIRTUAL', virtual(20_000)), graphs);
    expect(places(plan)).toEqual(['GATE_VIRTUAL', 'SEC_VAULT', 'SEC_DCVV', 'LEDGER_DEBIT', 'OUT_APPROVED']);
    expect(plan.outcome).toBe('APPROVED');
    expect(plan.heldCents).toBe(5000);
  });

  it('uses the credit line when the virtual card is funded by credit', () => {
    const plan = planCheckout(customer('VIRTUAL', virtual(20_000, { availableBalance: 90_000, creditLimit: 200_000 }, 'CREDIT')), graphs);
    expect(places(plan)).toContain('LEDGER_CREDIT');
    expect(places(plan)).not.toContain('LEDGER_DEBIT');
  });

  it('declines an expired dynamic CVV before the ledger is asked', () => {
    const plan = planCheckout(customer('VIRTUAL', virtual(100_000)), graphs);
    expect(plan.outcome).toBe('DECLINED');
    expect(plan.decline).toBe('DCVV_EXPIRED');
    expect(places(plan)).toEqual(['GATE_VIRTUAL', 'SEC_VAULT', 'SEC_DCVV', 'OUT_DECLINED']);
  });

  it('a longer validity window rescues the same payment', () => {
    const longer = buildGraphs(clampRules({ dcvvWindowSec: 120 }));
    expect(planCheckout(customer('VIRTUAL', virtual(100_000)), longer).outcome).toBe('APPROVED');
  });

  it('declines a wrong code', () => {
    const plan = planCheckout(customer('VIRTUAL', virtual(10_000, { rawCvv: '000' })), graphs);
    expect(plan.decline).toBe('DCVV_MISMATCH');
  });

  it('declines a virtual card number the vault has never seen', () => {
    const p = virtual(10_000);
    p.virtualCard = { dpan: '5999999999999999', vaultEntry: null };
    const plan = planCheckout(customer('VIRTUAL', p), graphs);
    expect(plan.decline).toBe('UNKNOWN_DPAN');
    expect(places(plan)[places(plan).length - 1]).toBe('OUT_DECLINED');
  });
});

describe('POS route', () => {
  it('skips 3DS and the virtual-card checks', () => {
    const plan = planCheckout(customer('POS', base({ channel: 'POS', riskScore: 95 })), graphs);
    expect(places(plan)).toEqual(['GATE_POS', 'LEDGER_DEBIT', 'OUT_APPROVED']);
  });

  it('declines for funds', () => {
    const plan = planCheckout(customer('POS', base({ channel: 'POS', availableBalance: 1000 })), graphs);
    expect(plan.decline).toBe('FUNDS');
    expect(places(plan)).toEqual(['GATE_POS', 'LEDGER_DEBIT', 'OUT_DECLINED']);
  });

  it('sends a credit card to the credit line', () => {
    const plan = planCheckout(customer('POS', base({ channel: 'POS', cardType: 'CREDIT', availableBalance: 90_000, creditLimit: 150_000 })), graphs);
    expect(places(plan)).toEqual(['GATE_POS', 'LEDGER_CREDIT', 'OUT_APPROVED']);
  });
});

describe('online card route and the 3DS challenge', () => {
  it('a low-risk payment is frictionless', () => {
    const plan = planCheckout(customer('ECOM', base({ riskScore: 12 })), graphs);
    expect(places(plan)).toEqual(['GATE_ECOM', 'SEC_3DS', 'LEDGER_DEBIT', 'OUT_APPROVED']);
    expect(plan.threeDs).toBe('FRICTIONLESS');
    expect(plan.passes).toBe(1);
  });

  it('a middling score sends the customer to their phone and back', () => {
    const plan = planCheckout(customer('ECOM', base({ riskScore: 55 }), true), graphs);
    expect(places(plan)).toEqual(['GATE_ECOM', 'SEC_3DS', 'CUSTOMER_OTP', 'SEC_3DS', 'LEDGER_DEBIT', 'OUT_APPROVED']);
    expect(plan.passes).toBe(2);
    expect(plan.threeDs).toBe('CHALLENGE_PASSED');
  });

  it('a customer who never types the code is declined', () => {
    const plan = planCheckout(customer('ECOM', base({ riskScore: 55 }), false), graphs);
    expect(plan.decline).toBe('OTP_ABANDONED');
    expect(places(plan)).toEqual(['GATE_ECOM', 'SEC_3DS', 'CUSTOMER_OTP', 'SEC_3DS', 'OUT_DECLINED']);
  });

  it('a very high score is rejected without a challenge', () => {
    const plan = planCheckout(customer('ECOM', base({ riskScore: 90 })), graphs);
    expect(plan.decline).toBe('THREE_DS_REJECT');
    expect(plan.passes).toBe(1);
  });

  it('moving the frictionless line moves the same payment from challenge to frictionless', () => {
    const payload = base({ riskScore: 45 });
    expect(planCheckout(customer('ECOM', payload), graphs).passes).toBe(2);
    expect(planCheckout(customer('ECOM', payload), buildGraphs(clampRules({ frictionlessBelow: 60 }))).passes).toBe(1);
  });

  it('moving the reject line turns the same challenge into a reject', () => {
    const payload = base({ riskScore: 72 });
    expect(planCheckout(customer('ECOM', payload), graphs).decline).toBeNull();
    expect(planCheckout(customer('ECOM', payload), buildGraphs(clampRules({ rejectAtOrAbove: 70 }))).decline).toBe('THREE_DS_REJECT');
  });

  it('declines for funds after a frictionless pass', () => {
    const plan = planCheckout(customer('ECOM', base({ riskScore: 5, availableBalance: 100 })), graphs);
    expect(plan.decline).toBe('FUNDS');
  });
});

describe('Pay-in-4 route', () => {
  const bnpl = (score: number, down: number, over: Partial<BankingPayload> = {}) => base({ amount: 20_000, bnpl: { underwritingScore: score, downPaymentMinor: down }, ...over });

  it('an eligible plan collects only the down payment', () => {
    const plan = planCheckout(customer('BNPL', bnpl(700, 5000)), graphs);
    expect(places(plan)).toEqual(['GATE_ECOM', 'BNPL', 'LEDGER_DEBIT', 'OUT_APPROVED']);
    expect(plan.bnpl).toBe('ELIGIBLE');
    expect(plan.heldCents).toBe(5000);
  });

  it('a weak score falls back to a normal payment of the full amount', () => {
    const plan = planCheckout(customer('BNPL', bnpl(540, 5000)), graphs);
    expect(plan.bnpl).toBe('INELIGIBLE');
    expect(plan.outcome).toBe('APPROVED');
    expect(plan.heldCents).toBe(20_000);
  });

  it('a down payment the card cannot cover is declined, not silently switched to the full amount', () => {
    const plan = planCheckout(customer('BNPL', bnpl(700, 5000, { availableBalance: 4000 })), graphs);
    expect(plan.decline).toBe('DOWN_PAYMENT');
  });

  it('a raised score line removes the plan', () => {
    const strict = buildGraphs(clampRules({ bnplMinScore: 720 }));
    expect(planCheckout(customer('BNPL', bnpl(700, 5000)), strict).bnpl).toBe('INELIGIBLE');
  });

  it('a raised down-payment floor removes the plan', () => {
    const strict = buildGraphs(clampRules({ bnplMinDownPct: 30 }));
    expect(planCheckout(customer('BNPL', bnpl(700, 5000)), strict).bnpl).toBe('INELIGIBLE');
  });
});

describe('settlement route', () => {
  const settle = (legs: [number | null, number | null, number | null], presentments = 1, rules = DEFAULT_RULES) =>
    planSettlement(base({ amount: 10_000, settlement: { ledgerAmount: legs[0], clearingAmount: legs[1], switchAmount: legs[2], clearingPresentments: presentments } }), buildGraphs(rules));

  it('a clean record is batched, presented, matched and settled', () => {
    const plan = settle([10_000, 10_000, 10_000]);
    expect(places(plan)).toEqual(['EOD_BATCH', 'EOD_VISA', 'RECON', 'OUT_SETTLED']);
    expect(plan.suspenseCents).toBe(0);
    expect(plan.recon).toBe('MATCHED');
  });

  it('rounding dust inside the tolerance matches; outside it, it breaks', () => {
    expect(settle([10_000, 10_003, 10_000]).recon).toBe('MATCHED');
    const plan = settle([10_000, 10_003, 10_000], 1, clampRules({ reconToleranceCents: 2 }));
    expect(plan.recon).toBe('BREAK_AMOUNT');
    expect(places(plan)).toEqual(['EOD_BATCH', 'EOD_VISA', 'RECON', 'SUSPENSE', 'OUT_SETTLED']);
    expect(plan.suspenseCents).toBe(3);
  });

  it('a missing leg parks the whole amount in suspense', () => {
    const plan = settle([10_000, null, 10_000]);
    expect(plan.recon).toBe('BREAK_MISSING_LEG');
    expect(plan.suspenseCents).toBe(10_000);
  });

  it('a doubled presentment parks the whole amount in suspense', () => {
    const plan = settle([10_000, 10_000, 10_000], 2);
    expect(plan.recon).toBe('BREAK_DUPLICATE');
    expect(plan.suspenseCents).toBe(10_000);
  });

  it('a break costs the reconciliation desk more time than a match', () => {
    const weight = (plan: ReturnType<typeof settle>) => plan.stops.find((s) => s.place === 'RECON')?.weight;
    expect(weight(settle([10_000, 10_000, 10_000]))).toBe(1);
    expect(weight(settle([10_000, null, 10_000]))).toBeGreaterThan(1);
  });
});

describe('every route the bank can plan', () => {
  it('only uses wires that are on the map, and never breaks the diagram, across a month of customers', () => {
    let planned = 0;
    for (const seed of [1, 7, 42]) {
      for (const day of [1, 2, 13]) {
        for (const c of generateDay(seed, day).customers) {
          const plan = planCheckout(c, graphs);
          planned++;
          expect(plan.broken).toBe(false);
          expect(routeIsWired(plan.stops)).toBe(true);
          expect(plan.stops[0]?.kind).toBe('GATE');
          // Every route ends at Approved or Declined, except a jammed ATM: its cash never came out, so it runs on through the
          // suspense desk to the refund and finishes at Settled.
          const jam = c.kind === 'ATM' && plan.reasonCode === 'ATM_JAM';
          expect(jam ? ['OUT_SETTLED'] : ['OUT_APPROVED', 'OUT_DECLINED']).toContain(plan.stops[plan.stops.length - 1]?.place);
          if (jam) expect(plan.stops.map((s) => s.place)).toContain('SUSPENSE');
        }
      }
    }
    expect(planned).toBeGreaterThan(2000);
  });
});
