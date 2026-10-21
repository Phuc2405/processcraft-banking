/**
 * The Expert data depth of a payment: the ISO 8583 response code a terminal would get, the raw message as JSON, and the
 * double-entry journal the core banking ledger posted. Standard depth gets the same facts as plain cards. Pure functions of
 * a PacketTrace, so the inspector and the tests read the same thing.
 */

import { formatAud } from '../engine/money';
import { CHART_OF_ACCOUNTS } from '../engine/ledger';
import type { AccountId } from '../types/processLearning';
import { placeName } from './topology';
import type { DeclineReason, PacketTrace } from './types';

export interface ResponseCode {
  /** "00", "51", or an ISO 20022 status for an account-to-account transfer. */
  code: string;
  text: string;
  scheme: 'ISO 8583' | 'ISO 20022';
  tone: 'good' | 'bad' | 'pending';
}

const DECLINE_RC: Record<DeclineReason, readonly [string, string]> = {
  FUNDS: ['51', 'Insufficient Funds'],
  DOWN_PAYMENT: ['51', 'Insufficient Funds'],
  DCVV_EXPIRED: ['N7', 'Dynamic CVV Expired'],
  DCVV_MISMATCH: ['N7', 'CVV Mismatch'],
  UNKNOWN_DPAN: ['14', 'Invalid Card Number'],
  THREE_DS_REJECT: ['59', 'Suspected Fraud'],
  OTP_ABANDONED: ['05', 'Do Not Honour (authentication not completed)'],
  PIN_LOCKED: ['75', 'PIN Tries Exceeded'],
  A2A_INVALID: ['RJCT', 'Rejected: FF01 Invalid Message'],
  ATM_JAM: ['96', 'System Malfunction (dispenser jam)'],
  TIMEOUT: ['68', 'Response Received Too Late'],
  PROCESS_ERROR: ['96', 'System Malfunction'],
};

/** The ISO response code and its text for a decline reason. */
export const declineResponseCode = (decline: DeclineReason): readonly [string, string] => DECLINE_RC[decline];

/** The answer the payment got, as a terminal (or, for a transfer, the instant-payments rail) would see it. */
export function responseCodeFor(trace: PacketTrace): ResponseCode {
  const scheme = trace.kind === 'A2A' ? 'ISO 20022' : 'ISO 8583';
  if (!trace.done || !trace.record) return { code: '··', text: 'Awaiting response', scheme, tone: 'pending' };
  const decline = trace.record.decline;
  if (decline === null) return trace.kind === 'A2A' ? { code: 'ACSC', text: 'Settlement Completed', scheme, tone: 'good' } : { code: '00', text: 'Approved', scheme, tone: 'good' };
  const [code, text] = DECLINE_RC[decline];
  return { code, text, scheme, tone: 'bad' };
}

const isCard = (t: PacketTrace): boolean => t.kind !== 'A2A' && t.kind !== 'ATM';
const isDeposit = (t: PacketTrace): boolean => t.plan.reasonCode === 'CASH_DEPOSITED';

/** ISO 8583 processing code (field 3): 00 purchase, 01 cash withdrawal, 21 deposit. */
function processingCode(t: PacketTrace): string {
  if (isDeposit(t)) return '210000';
  if (t.kind === 'ATM') return '010000';
  return '000000';
}

/** Field 22, the point-of-service entry mode: contactless at a shop, e-commerce online, chip and PIN at the machine. */
function entryMode(t: PacketTrace): string {
  if (t.kind === 'POS') return '071';
  if (t.kind === 'ATM') return '051';
  return '810';
}

const amount12 = (cents: number): string => String(Math.max(0, Math.round(cents))).padStart(12, '0');
const stan = (id: string): string => (/(\d+)$/.exec(id)?.[1] ?? '0').padStart(6, '0').slice(-6);

/**
 * The payment as the bank's switch would log it: an ISO 8583 0100 authorisation request while it is on its way, the 0110
 * response once it has an answer. Card numbers are masked; an account-to-account transfer is shown as its pacs.008 header.
 */
export function rawMessage(trace: PacketTrace): Record<string, unknown> {
  const rc = responseCodeFor(trace);
  if (trace.kind === 'A2A') {
    return {
      msgType: 'pacs.008.001.08',
      msgId: `MSG-${trace.id}`,
      instrAmt: { ccy: 'AUD', value: (trace.amountCents / 100).toFixed(2) },
      status: trace.done ? (rc.code === 'ACSC' ? 'ACSC' : 'RJCT') : 'PDNG',
      facts: trace.facts,
    };
  }
  const message: Record<string, unknown> = {
    mti: trace.done ? '0110' : '0100',
    de2_pan: trace.cardType === 'VIRTUAL_DPAN' ? '5120 44•• •••• 3316 (DPAN)' : '4000 12•• •••• 4242',
    de3_processingCode: processingCode(trace),
    de4_amount: amount12(trace.amountCents),
    de11_stan: stan(trace.id),
    de22_posEntryMode: entryMode(trace),
    de49_currency: '036',
  };
  if (trace.done) message.de39_responseCode = rc.code;
  if (isCard(trace)) {
    message.cardType = trace.cardType;
    message.riskScore = trace.riskScore;
    if (trace.plan.threeDs) message.threeDs = trace.plan.threeDs;
  }
  message.latencyMs = trace.plan.latencyMs;
  message.facts = trace.facts;
  return message;
}

export interface JournalLine {
  kind: string;
  debit: { code: string; name: string };
  credit: { code: string; name: string };
  amountCents: number;
  memo: string;
}

const acct = (id: AccountId): { code: string; name: string } => ({ code: CHART_OF_ACCOUNTS[id].code, name: CHART_OF_ACCOUNTS[id].name });

/** The ledger lines posted for the payment so far. */
export function journalLines(trace: PacketTrace): JournalLine[] {
  return trace.ledger.map((e) => ({ kind: e.kind, debit: acct(e.debitAccount), credit: acct(e.creditAccount), amountCents: e.amount, memo: e.memo }));
}

/** "DR: 1110-Customer CASA Hold $20.00 | CR: 2110-Card Clearing Payable $20.00" */
export const journalText = (l: JournalLine): string => `DR: ${l.debit.code}-${l.debit.name} ${formatAud(l.amountCents)} | CR: ${l.credit.code}-${l.credit.name} ${formatAud(l.amountCents)}`;

export interface PlainFact {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'pending';
}

/** The Standard depth: the same payment as a handful of plain-English facts. */
export function plainFacts(trace: PacketTrace): PlainFact[] {
  const rc = responseCodeFor(trace);
  const where = trace.route[trace.at];
  const status = !trace.done ? `On its way: at ${where ? placeName(where) : 'the bank'}` : rc.tone === 'good' ? (isDeposit(trace) ? 'Credited' : 'Approved') : trace.record?.status === 'JAMMED' ? 'Machine jammed' : 'Declined';
  const facts: PlainFact[] = [{ label: 'Status', value: status, tone: rc.tone }];
  facts.push({ label: isDeposit(trace) ? 'Cash Paid In' : 'Amount', value: formatAud(trace.amountCents) });
  if (isCard(trace)) facts.push({ label: 'Hold Amount', value: !trace.done ? 'Pending' : rc.tone === 'good' ? formatAud(trace.plan.heldCents) : formatAud(0) });
  if (trace.done && rc.tone === 'bad') facts.push({ label: 'Why', value: rc.text });
  if (trace.plan.threeDs === 'CHALLENGE_PASSED') facts.push({ label: 'Extra Check', value: 'Customer typed the SMS code' });
  facts.push({ label: 'Latency', value: `${Math.round(trace.plan.latencyMs)}ms` });
  return facts;
}
