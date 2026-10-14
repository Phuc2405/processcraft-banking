import { describe, expect, it } from 'vitest';
import { isBalanced } from '../../engine/ledger';
import { BankSimulation } from '../bankSimulation';
import { WORK_START } from '../clock';
import { PRESETS, presetCustomer, type PresetId } from '../presets';
import { generateDay } from '../traffic';

function runPreset(id: PresetId, opts: { headless?: boolean } = {}) {
  const sim = new BankSimulation({ seed: 2026, ...opts });
  sim.stepUntil(WORK_START + 30);
  const customer = presetCustomer(id, sim.rules);
  if (!customer) throw new Error('no customer');
  const txId = sim.inject(customer);
  if (!txId) throw new Error('not injected');
  for (let i = 0; i < 40 && !sim.traceOf(txId)?.done; i++) sim.step();
  return { sim, trace: sim.traceOf(txId)! };
}

describe('preset actions', () => {
  it('a $20 swipe is approved at Debit CASA with a hold', () => {
    const { trace } = runPreset('pos-20');
    expect(trace.done).toBe(true);
    expect(trace.route).toEqual(['GATE_POS', 'LEDGER_DEBIT', 'OUT_APPROVED']);
    expect(trace.record?.status).toBe('APPROVED');
    expect(trace.plan.heldCents).toBe(2000);
    expect(trace.ledger.map((e) => e.kind)).toContain('AUTH_HOLD');
  });

  it('a $500 swipe on a $120 account is declined for funds', () => {
    const { trace } = runPreset('pos-500');
    expect(trace.record?.status).toBe('DECLINED');
    expect(trace.record?.decline).toBe('FUNDS');
    expect(trace.route.at(-1)).toBe('OUT_DECLINED');
  });

  it('a token checkout goes through the vault and the dCVV desk', () => {
    const { trace } = runPreset('token-45');
    expect(trace.route.slice(0, 3)).toEqual(['GATE_VIRTUAL', 'SEC_VAULT', 'SEC_DCVV']);
    expect(trace.record?.status).toBe('APPROVED');
  });

  it('the 3DS preset is always challenged and passes the OTP', () => {
    const { trace } = runPreset('otp-250');
    expect(trace.route).toContain('CUSTOMER_OTP');
    expect(trace.plan.threeDs).toBe('CHALLENGE_PASSED');
    expect(trace.record?.status).toBe('APPROVED');
  });

  it('a cash deposit credits the customer and the machine cash, and the books still balance', () => {
    const { sim, trace } = runPreset('cdm-200');
    expect(trace.route).toEqual(['GATE_ATM', 'ATM_CASH', 'OUT_APPROVED']);
    expect(trace.record?.status).toBe('APPROVED');
    expect(trace.record?.deposit).toBe(true);
    const deposit = trace.ledger.find((e) => e.kind === 'ATM_DEPOSIT');
    expect(deposit).toMatchObject({ debitAccount: 'ATM_CASH', creditAccount: 'CUST_CASA', amount: 20_000 });
    expect(isBalanced(sim.ledgerEntries)).toBe(true);
  });

  it('every payment preset has a customer, the night preset has none', () => {
    for (const p of PRESETS) expect(presetCustomer(p.id, new BankSimulation({ seed: 1 }).rules) === null).toBe(p.id === 'eod');
  });

  it('sending a preset never changes the customers the day generates', () => {
    const before = generateDay(2026, 1).customers.map((c) => c.id + c.scenario);
    runPreset('pos-20');
    expect(generateDay(2026, 1).customers.map((c) => c.id + c.scenario)).toEqual(before);
  });

  it('scripted ids get their own serials and are forgotten the next day', () => {
    const { sim, trace } = runPreset('pos-20');
    expect(trace.id).toBe('d1-9001');
    sim.nextDay();
    expect(sim.traceOf(trace.id)).toBeNull();
  });
});
