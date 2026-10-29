/** The general ledger: a chart of accounts, double-entry lines, and the checks that keep them honest. */

import type { AccountId, AccountType, EpochMs, GLEntry, Id, MinorUnits, PostingKind } from '../types/processLearning';
import { formatAud } from './money';

export type Side = 'DEBIT' | 'CREDIT';

export type AccountGroup = 'CUSTOMER' | 'CLEARING' | 'RECON' | 'CREDIT' | 'PAYMENTS' | 'COMPLIANCE' | 'DISPUTES';

export interface AccountDef {
  id: AccountId;
  /** A four-digit general-ledger code: 1xxx assets, 2xxx liabilities, 5xxx expenses. */
  code: string;
  name: string;
  type: AccountType;
  /** The side an increase is posted to. Assets and expenses grow with debits, liabilities and income with credits. */
  normal: Side;
  group: AccountGroup;
  description: string;
}

export const DEFAULT_CURRENCY = 'AUD';

export const sideOf = (type: AccountType): Side => (type === 'ASSET' || type === 'EXPENSE' ? 'DEBIT' : 'CREDIT');

const account = (id: AccountId, code: string, name: string, type: AccountType, group: AccountGroup, description: string): AccountDef => ({
  id,
  code,
  name,
  type,
  normal: sideOf(type),
  group,
  description,
});

export const CHART_OF_ACCOUNTS: Readonly<Record<AccountId, AccountDef>> = {
  CUST_CASA: account('CUST_CASA', '2010', 'Customer CASA', 'LIABILITY', 'CUSTOMER', 'What the bank owes customers in their cheque and savings accounts. A debit here is money leaving a customer.'),
  CUST_CASA_HOLD: account('CUST_CASA_HOLD', '1110', 'Customer CASA Hold', 'ASSET', 'CUSTOMER', 'Funds reserved on a customer’s cheque or savings account for a card purchase that has been authorised but not yet settled.'),
  CUST_CREDIT_HOLD: account('CUST_CREDIT_HOLD', '1120', 'Customer Credit Line Hold', 'ASSET', 'CUSTOMER', 'Open-to-buy reserved on a credit card for a purchase that has been authorised but not yet settled.'),
  CUST_PREPAID_HOLD: account('CUST_PREPAID_HOLD', '1130', 'Prepaid Wallet Hold', 'ASSET', 'CUSTOMER', 'Stored value reserved on a prepaid card for a purchase that has been authorised but not yet settled.'),
  CARD_RECEIVABLE: account('CARD_RECEIVABLE', '1150', 'Credit Card Receivable', 'ASSET', 'CUSTOMER', 'What cardholders owe the bank on their credit cards. A purchase adds to it once it settles.'),
  PREPAID_WALLET: account('PREPAID_WALLET', '2020', 'Prepaid Wallet Balances', 'LIABILITY', 'CUSTOMER', 'What the bank owes customers for the money loaded on their prepaid cards.'),
  CARD_CLEARING_PAYABLE: account('CARD_CLEARING_PAYABLE', '2110', 'Card Settlement Clearing Payable', 'LIABILITY', 'CLEARING', 'What the bank owes the card scheme for purchases it has authorised and not yet paid for.'),
  SCHEME_NOSTRO: account('SCHEME_NOSTRO', '1210', 'Scheme Settlement Nostro', 'ASSET', 'CLEARING', 'The bank’s cash account used to settle with the card scheme. A credit here is cash paid out.'),
  RECON_SUSPENSE: account('RECON_SUSPENSE', '1910', 'Reconciliation Suspense', 'ASSET', 'RECON', 'The holding box for items that did not match at end of day. Nothing stays here: an ops clerk finds the cause and clears it.'),
  FX_GAIN_SUSPENSE: account('FX_GAIN_SUSPENSE', '2920', 'FX Gain Suspense', 'LIABILITY', 'RECON', 'Exchange-rate differences that went the bank’s way, waiting for treasury to recognise them.'),
  FX_LOSS_SUSPENSE: account('FX_LOSS_SUSPENSE', '1920', 'FX Loss Suspense', 'ASSET', 'RECON', 'Exchange-rate differences that went against the bank, waiting for treasury to recognise them.'),
  BNPL_RECEIVABLE: account('BNPL_RECEIVABLE', '1310', 'BNPL Instalments Receivable', 'ASSET', 'CREDIT', 'The three Pay-in-4 instalments still to come from customers, after the bank has paid the merchant in full.'),
  A2A_INSTANT_SETTLEMENT: account('A2A_INSTANT_SETTLEMENT', '1410', 'Instant Payments Settlement Account', 'ASSET', 'PAYMENTS', 'The bank’s settlement account on the instant-payments rail. A credit here is value sent out.'),
  A2A_RTGS_SETTLEMENT: account('A2A_RTGS_SETTLEMENT', '1420', 'RTGS Settlement Account', 'ASSET', 'PAYMENTS', 'The bank’s exchange settlement account at the central bank, used for high-value payments. A credit here is value sent out.'),
  ATM_CASH: account('ATM_CASH', '1015', 'ATM Cash in Machines', 'ASSET', 'PAYMENTS', 'The notes loaded in the bank’s ATMs. A credit here is cash that has left a machine, so it must match what the customer was debited.'),
  A2A_QUEUE_PAYABLE: account('A2A_QUEUE_PAYABLE', '2410', 'A2A Gateway Queue Payable', 'LIABILITY', 'PAYMENTS', 'Customer money taken for payments that are waiting in the gateway queue and have not been released yet.'),
  AML_RESTRAINED_FUNDS: account('AML_RESTRAINED_FUNDS', '2510', 'AML Restrained Funds', 'LIABILITY', 'COMPLIANCE', 'Customer money frozen while compliance reviews a payment. It belongs to the customer and cannot be used.'),
  OUTWARD_PAYMENTS_CLEARING: account('OUTWARD_PAYMENTS_CLEARING', '2420', 'Outward Payments Clearing', 'LIABILITY', 'PAYMENTS', 'Payments the bank has released for a customer and not yet settled with the receiving bank.'),
  DISPUTE_RECEIVABLE: account('DISPUTE_RECEIVABLE', '1510', 'Scheme Dispute Receivable', 'ASSET', 'DISPUTES', 'Money the bank has paid a cardholder in advance and expects to win back from the card scheme through a chargeback.'),
  TELLER_VAULT_CASH: account('TELLER_VAULT_CASH', '1012', 'Branch Teller Vault Cash', 'ASSET', 'PAYMENTS', 'The notes in the branch tellers’ tills and vault. A credit here is cash handed over the counter.'),
  SWIFT_NOSTRO: account('SWIFT_NOSTRO', '1430', 'Correspondent Nostro (SWIFT)', 'ASSET', 'PAYMENTS', 'The bank’s accounts with correspondent banks abroad, used to pay cross-border remittances. A credit here is value sent overseas.'),
  FRAUD_LOSS_EXPENSE: account('FRAUD_LOSS_EXPENSE', '5010', 'Fraud Loss Expense', 'EXPENSE', 'DISPUTES', 'Fraud the bank has to absorb because nobody else is liable: it cannot be charged back.'),
};

export const ACCOUNT_IDS = Object.keys(CHART_OF_ACCOUNTS) as AccountId[];

export const isAccountId = (id: string): id is AccountId => id in CHART_OF_ACCOUNTS;

export const accountName = (id: AccountId): string => CHART_OF_ACCOUNTS[id].name;

// Lines

export class LedgerError extends Error {}

export interface EntryInput {
  id: Id;
  txId: Id;
  timestamp: EpochMs;
  debitAccount: AccountId;
  creditAccount: AccountId;
  amount: MinorUnits;
  currency?: string;
  kind: PostingKind;
  memo: string;
}

/** Builds one ledger line. Refuses anything that could not be a legal line: it is better to fail loudly than to post it. */
export function makeEntry(input: EntryInput): GLEntry {
  const problems = lineProblems({ ...input, currency: input.currency ?? DEFAULT_CURRENCY });
  if (problems.length > 0) throw new LedgerError(`Cannot post ${input.id}: ${problems.join('; ')}`);
  return { ...input, currency: input.currency ?? DEFAULT_CURRENCY };
}

/** What is wrong with a single line, in words. Empty when it is a legal line. */
export function lineProblems(e: Pick<GLEntry, 'debitAccount' | 'creditAccount' | 'amount' | 'currency'>): string[] {
  const out: string[] = [];
  if (!isAccountId(e.debitAccount)) out.push(`unknown debit account '${e.debitAccount}'`);
  if (!isAccountId(e.creditAccount)) out.push(`unknown credit account '${e.creditAccount}'`);
  if (e.debitAccount === e.creditAccount) out.push('debit and credit are the same account');
  if (!Number.isInteger(e.amount) || e.amount <= 0) out.push(`amount ${e.amount} is not a positive whole number of cents`);
  if (!/^[A-Z]{3}$/.test(e.currency)) out.push(`currency '${e.currency}' is not an ISO code`);
  return out;
}

export function entryProblems(entries: readonly GLEntry[]): string[] {
  const out: string[] = [];
  const seen = new Set<Id>();
  for (const e of entries) {
    for (const p of lineProblems(e)) out.push(`${e.id}: ${p}`);
    if (seen.has(e.id)) out.push(`${e.id}: duplicate entry id`);
    seen.add(e.id);
  }
  return out;
}

// Balances

export interface TrialRow {
  account: AccountId;
  debit: MinorUnits;
  credit: MinorUnits;
  /** debit - credit: positive when the account stands in debit. */
  net: MinorUnits;
  /** The side the account stands on right now. */
  side: Side;
  /** The balance read on the account's own normal side: negative means it is on the wrong side (an overdrawn asset, say). */
  natural: MinorUnits;
}

export interface TrialBalance {
  rows: TrialRow[];
  totalDebits: MinorUnits;
  totalCredits: MinorUnits;
  /** The test every ledger must pass: total debits equal total credits. */
  balanced: boolean;
}

/** The trial balance: for each account, what has been debited and what has been credited, and the totals of both. */
export function trialBalance(entries: readonly GLEntry[]): TrialBalance {
  const debit = new Map<AccountId, MinorUnits>();
  const credit = new Map<AccountId, MinorUnits>();
  for (const e of entries) {
    debit.set(e.debitAccount, (debit.get(e.debitAccount) ?? 0) + e.amount);
    credit.set(e.creditAccount, (credit.get(e.creditAccount) ?? 0) + e.amount);
  }
  const rows: TrialRow[] = [];
  for (const id of ACCOUNT_IDS) {
    const d = debit.get(id) ?? 0;
    const c = credit.get(id) ?? 0;
    if (d === 0 && c === 0) continue;
    const net = d - c;
    const def = CHART_OF_ACCOUNTS[id];
    rows.push({ account: id, debit: d, credit: c, net, side: net >= 0 ? 'DEBIT' : 'CREDIT', natural: def.normal === 'DEBIT' ? net : -net });
  }
  const totalDebits = rows.reduce((n, r) => n + r.debit, 0);
  const totalCredits = rows.reduce((n, r) => n + r.credit, 0);
  return { rows, totalDebits, totalCredits, balanced: totalDebits === totalCredits };
}

/** True when the lines are all legal and the accounts' debits and credits add up to the same total. */
export function isBalanced(entries: readonly GLEntry[]): boolean {
  return entryProblems(entries).length === 0 && trialBalance(entries).balanced;
}

/** The lines of each transaction, in the order they were posted. */
export function groupByTransaction(entries: readonly GLEntry[]): Map<Id, GLEntry[]> {
  const out = new Map<Id, GLEntry[]>();
  for (const e of entries) {
    const list = out.get(e.txId);
    if (list) list.push(e);
    else out.set(e.txId, [e]);
  }
  return out;
}

/** True when each transaction balances on its own, which is what "every finalized transaction posts balanced entries" means. */
export function everyTransactionBalances(entries: readonly GLEntry[]): boolean {
  for (const lines of groupByTransaction(entries).values()) if (!isBalanced(lines)) return false;
  return true;
}

// Words

/** "Dr Customer CASA Hold $200.00 / Cr Card Settlement Clearing Payable $200.00" */
export function describeEntry(e: Pick<GLEntry, 'debitAccount' | 'creditAccount' | 'amount'>): string {
  const money = formatAud(e.amount);
  return `Dr ${accountName(e.debitAccount)} ${money} / Cr ${accountName(e.creditAccount)} ${money}`;
}

export const sideLabel = (side: Side): string => (side === 'DEBIT' ? 'Dr' : 'Cr');

/** How a trial-balance row reads in the drawer: "Dr $200.00". */
export function describeBalance(row: Pick<TrialRow, 'net' | 'side'>): string {
  return row.net === 0 ? '$0.00' : `${sideLabel(row.side)} ${formatAud(Math.abs(row.net))}`;
}

// A book that lines are added to one at a time (the Living Bank keeps one per day)

export interface LedgerBook {
  entries: GLEntry[];
}

export const emptyBook = (): LedgerBook => ({ entries: [] });

export function post(book: LedgerBook, entries: readonly GLEntry[]): void {
  const problems = entryProblems(entries);
  if (problems.length > 0) throw new LedgerError(problems.join('; '));
  for (const e of entries) book.entries.push(e);
}
