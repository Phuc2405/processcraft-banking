import { describe, expect, it } from 'vitest';
import { everyTransactionBalances, isBalanced, trialBalance } from '../../engine/ledger';
import { BankSimulation } from '../bankSimulation';
import { EOD_START } from '../clock';

const SEED = 7;

const play = (day: number, until?: number): BankSimulation => {
  const sim = new BankSimulation({ seed: SEED, day });
  if (until === undefined) sim.runToEndOfDay();
  else sim.stepUntil(until);
  return sim;
};

describe('the Living Bank ledger', () => {
  it('starts the day empty', () => {
    const sim = new BankSimulation({ seed: SEED });
    const view = sim.snapshot().ledger;
    expect(view.lines).toBe(0);
    expect(view.payments).toBe(0);
    expect(view.recent).toEqual([]);
    expect(view.trial.balanced).toBe(true);
    expect(view.trial.rows).toEqual([]);
  });

  it('posts a balanced entry for every payment that finishes, all day long', () => {
    const sim = new BankSimulation({ seed: SEED });
    let beats = 0;
    while (!sim.dayOver) {
      sim.step();
      beats++;
      if (beats % 12 === 0) {
        expect(isBalanced(sim.ledgerEntries), `beat ${beats}`).toBe(true);
        expect(everyTransactionBalances(sim.ledgerEntries), `beat ${beats}`).toBe(true);
      }
    }
    expect(sim.ledgerEntries.length).toBeGreaterThan(50);
    expect(everyTransactionBalances(sim.ledgerEntries)).toBe(true);
    expect(sim.snapshot().ledger.trial.balanced).toBe(true);
  });

  it('writes one hold for each approved card payment, before the night cycle', () => {
    const sim = play(1, EOD_START);
    const holds = sim.ledgerEntries.filter((e) => e.kind === 'AUTH_HOLD');
    const kpis = sim.snapshot().kpis;
    expect(holds.length).toBeGreaterThan(0);
    // Every approved payment holds money, and a decline never leaves a hold behind (it releases it).
    const net = holds.length - sim.ledgerEntries.filter((e) => e.kind === 'HOLD_RELEASE').length;
    expect(net).toBeLessThanOrEqual(kpis.approved);
    expect(net).toBeGreaterThan(0);
  });

  it('settles the night’s records and parks the breaks in suspense', () => {
    const sim = play(1);
    const kinds = new Set(sim.ledgerEntries.map((e) => e.kind));
    expect(kinds.has('SETTLEMENT')).toBe(true);
    expect(sim.ledgerEntries.every((e) => e.amount > 0 && Number.isInteger(e.amount))).toBe(true);
  });

  it('pays out the suspense account when the clerks clear it, and still balances', () => {
    const sim = new BankSimulation({ seed: SEED, day: 1 });
    sim.runToEndOfDay();
    const carry = sim.carryState();
    expect(carry.suspense.length).toBeGreaterThan(0);
    const next = new BankSimulation({ seed: SEED, day: 2, carry });
    next.runToEndOfDay();
    const cleared = next.ledgerEntries.filter((e) => e.kind === 'SUSPENSE_CLEARED');
    expect(cleared.length).toBeGreaterThan(0);
    expect(cleared.every((e) => e.debitAccount === 'RECON_SUSPENSE' && e.creditAccount === 'SCHEME_NOSTRO')).toBe(true);
    expect(everyTransactionBalances(next.ledgerEntries)).toBe(true);
  });

  it('is the same every time for the same seed and day', () => {
    const a = play(3).ledgerEntries;
    const b = play(3).ledgerEntries;
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('gives every line a unique id, stamped with the bank’s clock', () => {
    const sim = play(1);
    const ids = sim.ledgerEntries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const stamps = sim.ledgerEntries.map((e) => e.timestamp);
    expect(stamps.every((t) => t >= 86_400_000)).toBe(true);
    for (let i = 1; i < stamps.length; i++) expect(stamps[i]!).toBeGreaterThanOrEqual(stamps[i - 1]!);
  });

  it('sends the screen only the latest lines, newest first, with the trial balance over all of them', () => {
    const sim = play(1);
    const view = sim.snapshot().ledger;
    expect(view.lines).toBe(sim.ledgerEntries.length);
    expect(view.recent.length).toBeLessThanOrEqual(40);
    expect(view.recent[0]).toEqual(sim.ledgerEntries[sim.ledgerEntries.length - 1]);
    expect(view.trial).toEqual(trialBalance(sim.ledgerEntries));
    expect(view.payments).toBeGreaterThan(0);
    expect(view.payments).toBeLessThanOrEqual(view.lines);
  });

  it('starts a fresh book on the next day', () => {
    const sim = new BankSimulation({ seed: SEED });
    sim.runToEndOfDay();
    expect(sim.ledgerEntries.length).toBeGreaterThan(0);
    sim.nextDay();
    expect(sim.ledgerEntries).toEqual([]);
    expect(sim.snapshot().ledger.lines).toBe(0);
  });

  it('survives being copied and sent as text', () => {
    const view = play(1, EOD_START).snapshot().ledger;
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it('balances on a flash-sale day and a fraud-ring day too', () => {
    for (const day of [2, 13, 8]) {
      const sim = play(day);
      expect(everyTransactionBalances(sim.ledgerEntries), `day ${day}`).toBe(true);
      expect(sim.snapshot().ledger.trial.balanced, `day ${day}`).toBe(true);
    }
  });
});
