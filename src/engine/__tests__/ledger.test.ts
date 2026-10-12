import { describe, expect, it } from 'vitest';
import type { GLEntry } from '../../types/processLearning';
import {
  ACCOUNT_IDS,
  CHART_OF_ACCOUNTS,
  LedgerError,
  describeBalance,
  describeEntry,
  emptyBook,
  entryProblems,
  everyTransactionBalances,
  groupByTransaction,
  isBalanced,
  makeEntry,
  post,
  sideOf,
  trialBalance,
} from '../ledger';
import { authHold, capture, fxDifference, holdRelease, settle, toEntries } from '../postings';

const T = 1_700_000_000_000;

describe('chart of accounts', () => {
  it('has a unique four-digit code and a sensible normal side for every account', () => {
    const codes = ACCOUNT_IDS.map((id) => CHART_OF_ACCOUNTS[id].code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const id of ACCOUNT_IDS) {
      const a = CHART_OF_ACCOUNTS[id];
      expect(a.id).toBe(id);
      expect(a.code).toMatch(/^[1-5]\d{3}$/);
      expect(a.normal).toBe(sideOf(a.type));
      expect(a.description.length).toBeGreaterThan(20);
    }
  });

  it('uses the names the brief gives for the card hold', () => {
    expect(CHART_OF_ACCOUNTS.CUST_CASA_HOLD.name).toBe('Customer CASA Hold');
    expect(CHART_OF_ACCOUNTS.CARD_CLEARING_PAYABLE.name).toBe('Card Settlement Clearing Payable');
  });

  it('puts assets and expenses on the debit side, liabilities and income on the credit side', () => {
    expect(sideOf('ASSET')).toBe('DEBIT');
    expect(sideOf('EXPENSE')).toBe('DEBIT');
    expect(sideOf('LIABILITY')).toBe('CREDIT');
    expect(sideOf('INCOME')).toBe('CREDIT');
  });
});

describe('making a line', () => {
  const base = { id: 'GL-1', txId: 'TX-1', timestamp: T, kind: 'AUTH_HOLD' as const, memo: 'm' };

  it('refuses a line that debits and credits the same account', () => {
    expect(() => makeEntry({ ...base, debitAccount: 'CUST_CASA', creditAccount: 'CUST_CASA', amount: 100 })).toThrow(LedgerError);
  });

  it.each([0, -5, 12.5, Number.NaN])('refuses an amount of %s', (amount) => {
    expect(() => makeEntry({ ...base, debitAccount: 'CUST_CASA', creditAccount: 'SCHEME_NOSTRO', amount })).toThrow(/whole number of cents/);
  });

  it('defaults the currency to AUD and keeps the fields it was given', () => {
    const e = makeEntry({ ...base, debitAccount: 'CUST_CASA_HOLD', creditAccount: 'CARD_CLEARING_PAYABLE', amount: 20000 });
    expect(e).toMatchObject({ id: 'GL-1', txId: 'TX-1', timestamp: T, debitAccount: 'CUST_CASA_HOLD', creditAccount: 'CARD_CLEARING_PAYABLE', amount: 20000, currency: 'AUD' });
  });

  it('reports a duplicate id and an unknown account', () => {
    const good = makeEntry({ ...base, debitAccount: 'CUST_CASA', creditAccount: 'SCHEME_NOSTRO', amount: 100 });
    const bad = { ...good, id: 'GL-2', debitAccount: 'MADE_UP' } as unknown as GLEntry;
    expect(entryProblems([good, good])).toEqual(['GL-1: duplicate entry id']);
    expect(entryProblems([good, bad])[0]).toMatch(/unknown debit account 'MADE_UP'/);
    expect(isBalanced([good, bad])).toBe(false);
  });
});

describe('the brief’s example: a card authorisation hold', () => {
  const entries = toEntries([authHold('DEBIT', 20000)], 'TX-1', T);

  it('debits Customer CASA Hold and credits Card Settlement Clearing Payable', () => {
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ debitAccount: 'CUST_CASA_HOLD', creditAccount: 'CARD_CLEARING_PAYABLE', amount: 20000, currency: 'AUD', txId: 'TX-1', timestamp: T });
    expect(describeEntry(entries[0]!)).toBe('Dr Customer CASA Hold $200.00 / Cr Card Settlement Clearing Payable $200.00');
  });

  it('numbers lines within a transaction and carries a plain-English memo', () => {
    const two = toEntries([authHold('CREDIT', 5000), holdRelease('CREDIT', 5000)], 'TX-9', T);
    expect(two.map((e) => e.id)).toEqual(['GL-TX-9-01', 'GL-TX-9-02']);
    expect(two[0]!.memo).toMatch(/Reserves \$50\.00/);
  });

  it('drops a zero-amount draft instead of posting it', () => {
    expect(toEntries([settle(0)], 'TX-1', T)).toEqual([]);
  });
});

describe('trial balance', () => {
  // A full life of one $200 debit purchase: hold, then capture and settle.
  const life = toEntries([authHold('DEBIT', 20000), capture('DEBIT', 20000), settle(20000)], 'TX-1', T);

  it('balances, and the books come out where an accountant expects', () => {
    const tb = trialBalance(life);
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebits).toBe(tb.totalCredits);
    const by = Object.fromEntries(tb.rows.map((r) => [r.account, r]));
    // The hold is reserved and then released: nothing left on it.
    expect(by.CUST_CASA_HOLD).toMatchObject({ debit: 20000, credit: 20000, net: 0 });
    // The bank owes the scheme and then pays it: nothing left owed.
    expect(by.CARD_CLEARING_PAYABLE).toMatchObject({ net: 0 });
    // The customer is $200 poorer (a debit to a liability) and the bank's cash is $200 lower (a credit to an asset).
    expect(by.CUST_CASA).toMatchObject({ side: 'DEBIT', net: 20000, natural: -20000 });
    expect(by.SCHEME_NOSTRO).toMatchObject({ side: 'CREDIT', net: -20000, natural: -20000 });
  });

  it('reads a balance the way the drawer shows it', () => {
    const tb = trialBalance(toEntries([authHold('DEBIT', 20000)], 'TX-1', T));
    const rows = Object.fromEntries(tb.rows.map((r) => [r.account, describeBalance(r)]));
    expect(rows).toEqual({ CUST_CASA_HOLD: 'Dr $200.00', CARD_CLEARING_PAYABLE: 'Cr $200.00' });
  });

  it('is balanced for an empty ledger', () => {
    expect(trialBalance([])).toMatchObject({ rows: [], totalDebits: 0, totalCredits: 0, balanced: true });
  });

  it('checks each transaction on its own', () => {
    const many = [...life, ...toEntries([authHold('CREDIT', 999), fxDifference('LOSS', 7)], 'TX-2', T)];
    expect([...groupByTransaction(many).keys()]).toEqual(['TX-1', 'TX-2']);
    expect(everyTransactionBalances(many)).toBe(true);
  });

  it('refuses to post a bad line into a book', () => {
    const book = emptyBook();
    post(book, life);
    expect(book.entries).toHaveLength(3);
    expect(() => post(book, [{ ...life[0]!, id: 'x', amount: 0 }])).toThrow(LedgerError);
    expect(book.entries).toHaveLength(3);
  });
});
