/**
 * Regression suite §5: general-ledger accounting and its conservation laws, across the three books the simulator keeps (the core
 * card / payments ledger, the retail-ops book and the CIT cash book): Σ Dr = Σ Cr per transaction and over the day, the VAS cash
 * codes (TK 1111, 1112, 1113, 1121, 1131), and what a cancelled demo does to each book.
 */

import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { cancelDemo, demoLocked } from '../../../components/bank/DemoSession';
import { executeDemo } from '../../../components/bank/retailOpsActions';
import { citNow, dispatchCitDemo } from '../../../components/ops/citActions';
import { CHART_OF_ACCOUNTS, everyTransactionBalances, isBalanced, LedgerError, makeEntry, trialBalance, type EntryInput } from '../../../engine/ledger';
import { bankStore } from '../../../store/bankStore';
import { citStore } from '../../../store/citStore';
import { retailOpsStore } from '../../../store/retailOpsStore';
import { BankSimulation } from '../../bankSimulation';
import { bookAfter, CIT_ACCOUNT_IDS, CIT_DEMOS, CIT_OPENING, citAccount, citAt, dispatchEntry, entryBalanced, manualOrder, postEntry, receiptEntry, type CitDemo, type CitManual } from '../../citEngine';
import { OPS_ACTIONS, OPS_OPENING, OPS_ACCOUNT_IDS, openingBook, opsJournalBalanced, opsTrial, runOpsAction, type OpsActionId } from '../../retailOps';
import { at, freshBank } from './harness';

const sum = (book: Readonly<Record<string, number>>): number => Object.values(book).reduce((n, v) => n + v, 0);
const line = (over: Partial<EntryInput> = {}): EntryInput => ({ id: 'e1', txId: 't1', timestamp: 0, debitAccount: 'CUST_CASA', creditAccount: 'CARD_CLEARING_PAYABLE', amount: 100, kind: 'CAPTURE' as EntryInput['kind'], memo: 'test', ...over });

beforeEach(freshBank);

describe('§5.1 double entry: a line cannot be posted unless it is legal', () => {
  it('refuses the same account on both sides, a zero / negative / fractional amount and a bad currency', () => {
    expect(() => makeEntry(line())).not.toThrow();
    expect(() => makeEntry(line({ creditAccount: 'CUST_CASA' }))).toThrow(LedgerError);
    for (const amount of [0, -1, 1.5, Number.NaN]) expect(() => makeEntry(line({ amount })), String(amount)).toThrow(LedgerError);
    expect(() => makeEntry(line({ currency: 'aud' }))).toThrow(LedgerError);
  });

  it('balances any set of legal lines, and flags a duplicated line id (property)', () => {
    const ids = Object.keys(CHART_OF_ACCOUNTS) as EntryInput['debitAccount'][];
    const pair = fc.tuple(fc.constantFrom(...ids), fc.constantFrom(...ids)).filter(([a, b]) => a !== b);
    fc.assert(
      fc.property(fc.array(fc.tuple(pair, fc.integer({ min: 1, max: 1_000_000 })), { maxLength: 40 }), (rows) => {
        const entries = rows.map(([[d, c], amount], i) => makeEntry(line({ id: `e${i}`, txId: `t${i % 5}`, debitAccount: d, creditAccount: c, amount })));
        const tb = trialBalance(entries);
        expect(tb.balanced).toBe(true);
        expect(tb.totalDebits).toBe(rows.reduce((n, [, a]) => n + a, 0));
        expect(everyTransactionBalances(entries)).toBe(true);
        expect(isBalanced(entries)).toBe(true);
        if (entries.length) expect(isBalanced([...entries, entries[0]!])).toBe(false);
      }),
    );
  });
});

describe('§5.2 the core ledger over whole simulated days', () => {
  it('balances every transaction and the day, for any seed (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000 }), fc.integer({ min: 1, max: 4 }), (seed, day) => {
        const sim = new BankSimulation({ seed, day, headless: true });
        sim.runToEndOfDay();
        expect(everyTransactionBalances(sim.ledgerEntries)).toBe(true);
        expect(isBalanced(sim.ledgerEntries)).toBe(true);
      }),
      { numRuns: 4 },
    );
  });

  it('keeps the live bank’s trial balance level beat by beat, through a run of demos', () => {
    at(9 * 60);
    for (const id of ['pos-20', 'teller-12k', 'swift-6800', 'qr-780', 'cdm-200'] as const) {
      executeDemo(id);
      for (let i = 0; i < 60 && !bankStore.getState().presetTrace?.done; i++) {
        bankStore.getState().tickBeat();
        expect(bankStore.getState().view.ledger.trial.balanced, `${id} beat ${i}`).toBe(true);
      }
      cancelDemo();
    }
  });
});

describe('§5.3 the CIT cash book (TK 1111 / 1112 / 1113 / 1121 / 1131)', () => {
  it('codes the cash accounts on the Vietnamese chart', () => {
    expect(citAccount('VAULT').code).toBe('1111');
    expect(citAccount('TILL').code).toBe('1111');
    expect(citAccount('UNFIT').code).toBe('1112');
    expect(citAccount('ATM').code).toBe('1113');
    expect(citAccount('SBV').code).toBe('1121');
    expect(citAccount('TRANSIT').code).toBe('1131');
  });

  it('opens balanced (corporate deposits are the balancing figure) with nothing in transit', () => {
    expect(sum(CIT_OPENING)).toBe(0);
    expect(CIT_OPENING.TRANSIT).toBe(0);
  });

  it('posts every manual run as balanced dispatch and receipt entries that clear transit (every kind, both SBV cases)', () => {
    const cases: CitManual[] = [...CIT_DEMOS.map((kind): CitManual => ({ kind, at: 600 })), { kind: 'SBV', at: 600, sbv: 'WITHDRAW' }, { kind: 'SBV', at: 600, sbv: 'DEPOSIT' }];
    for (const m of cases) {
      const o = manualOrder(1, 1, m, CIT_OPENING);
      const out = dispatchEntry(o);
      const back = receiptEntry(o);
      expect(entryBalanced(out), m.kind).toBe(true);
      expect(entryBalanced(back), m.kind).toBe(true);
      const after = bookAfter([out, back]);
      expect(after.TRANSIT, m.kind).toBe(0);
      expect(sum(after), m.kind).toBe(0);
    }
    expect(() => postEntry(CIT_OPENING, { runId: 'x', status: 'EN_ROUTE', memo: { en: '', vi: '' }, lines: [{ account: 'VAULT', dr: 1, cr: 0 }] })).toThrow();
  });

  it('conserves the book over any day of manual dispatches, minute by minute (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.array(fc.record({ kind: fc.constantFrom<CitDemo>(...CIT_DEMOS), at: fc.integer({ min: 420, max: 1300 }) }), { maxLength: 6 }),
        fc.integer({ min: 420, max: 1440 }),
        (day, raw, minute) => {
          const manual = [...raw].sort((a, b) => a.at - b.at);
          const snap = citAt(day, minute, manual);
          for (const e of snap.journal) expect(entryBalanced(e), e.runId).toBe(true);
          expect(sum(snap.book)).toBe(0);
          for (const id of CIT_ACCOUNT_IDS) expect(Number.isInteger(snap.book[id]), id).toBe(true);
          // At the end of the day every run has settled: nothing is left in transit.
          expect(citAt(day, 1440 + 120, manual).book.TRANSIT).toBe(0);
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('§5.4 the retail-ops book', () => {
  it('opens balanced', () => {
    expect(OPS_ACCOUNT_IDS.reduce((n, id) => n + OPS_OPENING[id], 0)).toBe(0);
    expect(opsTrial(openingBook()).balanced).toBe(true);
  });

  it('posts every action from a fresh book as a balanced journal, or posts nothing', () => {
    for (const a of OPS_ACTIONS) {
      const { book, outcome } = runOpsAction(openingBook(), a.id, 'D1 10:00:00');
      if (outcome.journal) expect(opsJournalBalanced(outcome.journal.lines), a.id).toBe(true);
      else expect(book.balances, a.id).toEqual(openingBook().balances);
      expect(opsTrial(book).balanced, a.id).toBe(true);
    }
  });

  it('stays balanced over any sequence of actions (property)', () => {
    const ids = OPS_ACTIONS.map((a) => a.id) as OpsActionId[];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...ids), { maxLength: 25 }), (seq) => {
        let book = openingBook();
        for (const id of seq) book = runOpsAction(book, id, 'D1 10:00:00').book;
        expect(opsTrial(book).balanced).toBe(true);
        expect(OPS_ACCOUNT_IDS.reduce((n, id) => n + book.balances[id], 0)).toBe(0);
      }),
      { numRuns: 60 },
    );
  });
});

describe('§5.5 cancellation semantics', () => {
  it('rolls a cancelled CIT demo back completely: no dispatch, no postings, the book as if it never ran', () => {
    at(10 * 60);
    const before = citNow();
    expect(dispatchCitDemo('SBV')).toBe(true);
    const during = citNow();
    const id = `CIT-${citStore.getState().day}-M1`;
    expect(during.journal.some((e) => e.runId === id)).toBe(true);
    expect(during.book).not.toEqual(before.book);
    cancelDemo();
    const after = citNow();
    expect(citStore.getState().manual).toEqual([]);
    expect(after.journal.some((e) => e.runId === id)).toBe(false);
    expect(after.book).toEqual(before.book);
    expect(sum(after.book)).toBe(0);
    expect(demoLocked()).toBe(false);
    expect(bankStore.getState().playing).toBe(false);
  });

  it('keeps a cancelled retail demo’s books balanced, and still balanced once the bank plays on', () => {
    at(10 * 60);
    executeDemo('teller-12k');
    const posted = retailOpsStore.getState().book.posted;
    bankStore.getState().tickBeat();
    bankStore.getState().tickBeat();
    cancelDemo();
    expect(demoLocked()).toBe(false);
    expect(bankStore.getState().presetTxId).toBeNull();
    expect(bankStore.getState().playing).toBe(false);
    expect(opsTrial(retailOpsStore.getState().book).balanced).toBe(true);
    expect(retailOpsStore.getState().book.posted).toBe(posted);
    expect(bankStore.getState().view.ledger.trial.balanced).toBe(true);
    // Resume: the bank plays on and every line it posts still balances.
    bankStore.getState().play();
    for (let i = 0; i < 30; i++) bankStore.getState().tickBeat();
    bankStore.getState().pause();
    expect(bankStore.getState().view.ledger.trial.balanced).toBe(true);
    expect(everyTransactionBalances(bankStore.getState().sim.ledgerEntries)).toBe(true);
    expect(opsTrial(retailOpsStore.getState().book).balanced).toBe(true);
  });
});
