/**
 * Everything the ledger drawer says. One `Localized` table, so a second language is one more entry and no component changes.
 * The names of the accounts and the memo on each line come from the engine (engine/ledger.ts, engine/postings.ts).
 */

import { pick, type Localized } from '../i18n/locale';
import type { PostingKind } from '../types/processLearning';

export interface LedgerUi {
  title: string;
  /** One sentence under the title: what double entry is. */
  lede: string;
  empty: string;
  emptyLab: string;
  debit: string;
  credit: string;
  debitShort: string;
  creditShort: string;
  amount: string;
  entries: (n: number) => string;
  transaction: string;
  trialBalance: string;
  account: string;
  totalDebits: string;
  totalCredits: string;
  balanced: string;
  outOfBalance: string;
  everyLineBalances: string;
  replaySource: string;
  gradedSource: string;
  noGraded: string;
  declinedNothing: string;
  /** "3 payments, 5 lines" */
  summary: (payments: number, lines: number) => string;
  /** The Living Bank's drawer. */
  bank: {
    button: string;
    buttonTitle: string;
    close: string;
    title: string;
    lede: string;
    /** Nothing has finished yet today. */
    quiet: string;
    /** "Showing the latest 40 of 812 lines. The trial balance below adds up all 812." */
    showing: (shown: number, total: number) => string;
    /** The title of one block of lines, from the transaction id: "Payment d1-0287", "Overnight settlement of d1-0287". */
    payment: (txId: string) => string;
    /** "1,419 transactions, 1,482 lines" */
    summary: (transactions: number, lines: number) => string;
    /** "Settled at 23:10" */
    postedAt: (clock: string) => string;
    allBalance: string;
  };
}

interface LedgerBook {
  ui: LedgerUi;
  kinds: Record<PostingKind, string>;
}

const EN: LedgerBook = {
  ui: {
    title: 'Live double-entry mini ledger',
    lede: 'Every movement of money is written twice: once as a debit to one account, once as a credit to another, for the same amount. Add up every debit and every credit and the totals must match.',
    empty: 'Nothing has been posted yet.',
    emptyLab: 'Replay a test payment on the canvas, or press Submit. When a payment finishes, the lines it posts to the general ledger appear here.',
    debit: 'Debit',
    credit: 'Credit',
    debitShort: 'Dr',
    creditShort: 'Cr',
    amount: 'Amount',
    entries: (n) => `${n} line${n === 1 ? '' : 's'}`,
    transaction: 'Payment',
    trialBalance: 'Trial balance',
    account: 'Account',
    totalDebits: 'Total debits',
    totalCredits: 'Total credits',
    balanced: 'Balanced',
    outOfBalance: 'Out of balance',
    everyLineBalances: 'Every payment balances on its own.',
    replaySource: 'This replay',
    gradedSource: 'Every graded test',
    noGraded: 'Press Submit to grade the diagram. The lines each visible test would post appear here.',
    declinedNothing: 'This payment moved no money, so it posted nothing.',
    summary: (payments, lines) => `${payments} payment${payments === 1 ? '' : 's'}, ${lines} line${lines === 1 ? '' : 's'}`,
    bank: {
      button: 'Ledger',
      buttonTitle: 'Open the live double-entry ledger: every payment that finishes today writes its lines here',
      close: 'Close the ledger',
      title: 'Live double-entry mini ledger',
      lede: 'Each payment that finishes writes its money movements here, a debit and a credit of the same amount. The trial balance adds up the whole day and must always agree.',
      quiet: 'No payment has finished yet today. Press play and the lines will appear here as customers are approved, settled or cleared.',
      showing: (shown, total) => (shown >= total ? `All ${total} line${total === 1 ? '' : 's'} so far.` : `Showing the latest ${shown} of ${total} lines. The trial balance adds up all ${total}.`),
      payment: (txId) => {
        const base = txId.replace(/-CLR$/, '').replace(/^tx_/, '');
        if (txId.endsWith('-CLR')) return `Suspense paid out for ${base}`;
        return txId.startsWith('tx_') ? `Overnight settlement of ${base}` : `Payment ${base}`;
      },
      summary: (transactions, lines) => `${transactions.toLocaleString('en-US')} transaction${transactions === 1 ? '' : 's'}, ${lines.toLocaleString('en-US')} line${lines === 1 ? '' : 's'}`,
      postedAt: (clock) => `posted ${clock}`,
      allBalance: 'Every payment balances on its own, and so does the day.',
    },
  },
  kinds: {
    AUTH_HOLD: 'Authorisation hold',
    HOLD_RELEASE: 'Hold released',
    BNPL_FINANCING: 'Pay-in-4 financing',
    CAPTURE: 'Captured',
    SETTLEMENT: 'Settled',
    SUSPENSE_BREAK: 'Break parked in suspense',
    FX_VARIANCE: 'Exchange-rate difference',
    SUSPENSE_CLEARED: 'Suspense cleared',
    A2A_PAYMENT: 'Bank-to-bank payment',
    A2A_QUEUED: 'Queued payment',
    PAYMENT_EXECUTED: 'Queued payment sent',
    AML_RESTRAIN: 'Funds frozen',
    AML_RELEASE: 'Funds released',
    PROVISIONAL_CREDIT: 'Provisional credit',
    DISPUTE_RECOVERY: 'Recovered from scheme',
    DISPUTE_REVERSAL: 'Credit reversed',
    ISSUER_LOSS: 'Written off',
    ATM_DISPENSE: 'ATM cash out',
    ATM_JAM: 'ATM jam parked in suspense',
    ATM_REFUND: 'ATM jam refunded',
    ATM_DEPOSIT: 'Cash deposited',
  },
};

export const LEDGER_COPY: Localized<LedgerBook> = { en: EN };

const book = (): LedgerBook => pick(LEDGER_COPY);

export const ledgerUi = (): LedgerUi => book().ui;
export const postingKindLabel = (kind: PostingKind): string => book().kinds[kind];
