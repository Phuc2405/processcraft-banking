import { describe, expect, it } from 'vitest';
import type { A2aContext, BankingPayload } from '../../types/processLearning';
import { END_TO_END_ID_MAX, gateway, isoAmount, pacs008From, pacs008Xml, priorityFor, railFor, validatePacs008, type GatewayPolicy } from '../iso20022';

const POLICY: GatewayPolicy = { instantLimitMinor: 5_000_000, queueCapacity: 50, priorityReserveMinor: 10_000_000 };

const a2a = (over: Partial<A2aContext> = {}): A2aContext => ({
  endToEndId: 'INV-2026-000417',
  debtorAgent: 'NOVAAU2S',
  creditorAgent: 'HRBRAU3MXXX',
  interbankSettlementAmount: 125_000,
  currency: 'AUD',
  purposeCode: 'SUPP',
  queueDepth: 12,
  liquidityAvailableMinor: 80_000_000,
  ...over,
});

const pay = (amount: number, over: Partial<A2aContext> = {}): BankingPayload => ({
  txId: 'TX-A2A',
  amount,
  channel: 'IN_APP',
  cardType: 'DEBIT',
  rawCvv: '',
  clientTimestamp: 0,
  riskScore: 5,
  isFraud: false,
  availableBalance: 0,
  creditLimit: 0,
  a2a: a2a({ interbankSettlementAmount: amount, ...over }),
});

describe('pacs.008 validation', () => {
  const ok = pacs008From(pay(125_000))!;

  it('accepts a well-formed message, with 8 or 11 character BICs', () => {
    expect(validatePacs008(ok, 125_000)).toEqual([]);
    expect(ok.debtorAgent).toHaveLength(8);
    expect(ok.creditorAgent).toHaveLength(11);
  });

  it('reads the four fields the Academy teaches', () => {
    expect(ok).toMatchObject({ endToEndId: 'INV-2026-000417', debtorAgent: 'NOVAAU2S', creditorAgent: 'HRBRAU3MXXX', interbankSettlementAmount: 125_000 });
  });

  it('has no message when the payment came without one', () => {
    expect(pacs008From({ ...pay(100), a2a: undefined })).toBeNull();
    expect(gateway({ ...pay(100), a2a: undefined }, POLICY)).toBeNull();
  });

  it.each([
    ['a missing EndToEndId', { endToEndId: '  ' }, 'EndToEndId'],
    ['an EndToEndId over 35 characters', { endToEndId: 'X'.repeat(END_TO_END_ID_MAX + 1) }, 'EndToEndId'],
    ['a short DebtorAgent', { debtorAgent: 'ANZB' }, 'DebtorAgent'],
    ['a lower-case CreditorAgent', { creditorAgent: 'ctbaau2s' }, 'CreditorAgent'],
    ['a 9-character BIC', { creditorAgent: 'HRBRAU3MX' }, 'CreditorAgent'],
    ['a zero settlement amount', { interbankSettlementAmount: 0 }, 'InterbankSettlementAmount'],
    ['a settlement amount that differs from the instruction', { interbankSettlementAmount: 124_999 }, 'InterbankSettlementAmount'],
    ['a made-up currency', { currency: 'AU' }, 'Currency'],
  ] as const)('rejects %s', (_name, patch, field) => {
    const m = pacs008From(pay(125_000, patch))!;
    const issues = validatePacs008(m, 125_000);
    expect(issues.map((i) => i.field)).toEqual([field]);
    expect(issues[0]!.message.length).toBeGreaterThan(15);
  });

  it('accepts an EndToEndId of exactly 35 characters', () => {
    expect(validatePacs008(pacs008From(pay(125_000, { endToEndId: 'X'.repeat(END_TO_END_ID_MAX) }))!, 125_000)).toEqual([]);
  });
});

describe('rails and priority', () => {
  it('uses the instant rail up to and including the limit, RTGS above it', () => {
    expect(railFor(5_000_000, 5_000_000)).toBe('INSTANT');
    expect(railFor(5_000_001, 5_000_000)).toBe('RTGS');
  });

  it('treats only payroll (SALA) as priority', () => {
    expect(priorityFor('SALA')).toBe('PRIORITY');
    for (const p of ['SUPP', 'TAXS', 'OTHR'] as const) expect(priorityFor(p)).toBe('NORMAL');
  });
});

describe('the gateway', () => {
  it('releases an ordinary payment that fits: valid, instant, open queue, enough liquidity', () => {
    expect(gateway(pay(125_000), POLICY)).toMatchObject({ valid: true, rail: 'INSTANT', priority: 'NORMAL', queue: 'OPEN', liquidity: 'SUFFICIENT' });
  });

  it('is congested exactly when the queue is at capacity', () => {
    expect(gateway(pay(1000, { queueDepth: 49 }), POLICY)!.queue).toBe('OPEN');
    expect(gateway(pay(1000, { queueDepth: 50 }), POLICY)!.queue).toBe('CONGESTED');
  });

  it('keeps the reserve for priority payments', () => {
    // $150,000 of liquidity, $100,000 reserve: an ordinary payment can use $50,000, payroll can use all $150,000.
    const available = 15_000_000;
    const ordinary = gateway(pay(7_500_000, { liquidityAvailableMinor: available }), POLICY)!;
    const payroll = gateway(pay(7_500_000, { liquidityAvailableMinor: available, purposeCode: 'SALA' }), POLICY)!;
    expect(ordinary).toMatchObject({ liquidity: 'SHORTFALL', usableLiquidityMinor: 5_000_000 });
    expect(payroll).toMatchObject({ liquidity: 'SUFFICIENT', usableLiquidityMinor: 15_000_000 });
  });

  it('cannot create liquidity for payroll either', () => {
    expect(gateway(pay(30_000_000, { liquidityAvailableMinor: 25_000_000, purposeCode: 'SALA' }), POLICY)!.liquidity).toBe('SHORTFALL');
  });

  it('does not let a liquidity position under the reserve go negative', () => {
    expect(gateway(pay(100, { liquidityAvailableMinor: 5_000_000 }), POLICY)!.usableLiquidityMinor).toBe(0);
  });

  it('can use exactly all the usable liquidity', () => {
    expect(gateway(pay(5_000_000, { liquidityAvailableMinor: 15_000_000 }), POLICY)!.liquidity).toBe('SUFFICIENT');
    expect(gateway(pay(5_000_001, { liquidityAvailableMinor: 15_000_000 }), POLICY)!.liquidity).toBe('SHORTFALL');
  });
});

describe('the message as XML', () => {
  it('formats amounts from integers', () => {
    expect(isoAmount(125_000)).toBe('1250.00');
    expect(isoAmount(5)).toBe('0.05');
    expect(isoAmount(5_000_001)).toBe('50000.01');
  });

  it('writes the four teaching fields and the rail', () => {
    const xml = pacs008Xml(pacs008From(pay(125_000))!, 'INSTANT');
    expect(xml).toContain('<EndToEndId>INV-2026-000417</EndToEndId>');
    expect(xml).toContain('<IntrBkSttlmAmt Ccy="AUD">1250.00</IntrBkSttlmAmt>');
    expect(xml).toContain('<DbtrAgt><FinInstnId><BICFI>NOVAAU2S</BICFI>');
    expect(xml).toContain('<CdtrAgt><FinInstnId><BICFI>HRBRAU3MXXX</BICFI>');
    expect(xml).toContain('<Prtry>INSTANT</Prtry>');
    expect(xml).toContain('pacs.008');
  });

  it('escapes markup in the EndToEndId', () => {
    const xml = pacs008Xml(pacs008From(pay(100, { endToEndId: 'A&B<1>' }))!);
    expect(xml).toContain('<EndToEndId>A&amp;B&lt;1&gt;</EndToEndId>');
    expect(xml).not.toContain('ClrSys');
  });
});
