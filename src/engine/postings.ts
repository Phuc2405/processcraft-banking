/**
 * Posting rules: what a finished transaction does to the books.
 *
 * A transaction's journey through a diagram decides the money that moves. A decline moves none. An approval holds, pays or
 * settles. A break parks money in a suspense account. A dispute credits the cardholder and, later, wins it back or loses it.
 * Every rule here returns a list of `Draft`s (one debit account, one credit account, one amount) and `toEntries` turns a
 * list of drafts into numbered `GLEntry` lines. Because a draft names both sides, whatever a rule returns balances.
 *
 * The same drafts serve the Build Lab (`postToken` reads a token that has reached an end event) and the Living Bank
 * (which calls the builders directly as the day's events happen).
 */

import type {
  AccountId,
  BankingCapability,
  BankingPayload,
  DerivedFacts,
  EpochMs,
  FundingSource,
  GLEntry,
  Id,
  MinorUnits,
  Outcome,
  PostingKind,
  SimulationToken,
  TestCaseResult,
} from '../types/processLearning';
import { DEFAULT_CURRENCY, accountName, makeEntry } from './ledger';
import { formatAud } from './money';

export interface Draft {
  kind: PostingKind;
  debit: AccountId;
  credit: AccountId;
  amount: MinorUnits;
  memo: string;
}

const draft = (kind: PostingKind, debit: AccountId, credit: AccountId, amount: MinorUnits, memo: string): Draft => ({ kind, debit, credit, amount, memo });

// ─────────────────────────────────────────────────────────────────────────────
// Builders (one per kind of event)
// ─────────────────────────────────────────────────────────────────────────────

const HOLD_ACCOUNT: Readonly<Record<FundingSource, AccountId>> = { DEBIT: 'CUST_CASA_HOLD', CREDIT: 'CUST_CREDIT_HOLD', PREPAID: 'CUST_PREPAID_HOLD' };
/** Where a customer's money really sits once a held purchase is captured. */
const CUSTOMER_ACCOUNT: Readonly<Record<FundingSource, AccountId>> = { DEBIT: 'CUST_CASA', CREDIT: 'CARD_RECEIVABLE', PREPAID: 'PREPAID_WALLET' };

export const holdAccountFor = (source: FundingSource): AccountId => HOLD_ACCOUNT[source];

/** The funding account behind a card: a virtual card is judged by the account behind it, which defaults to debit. */
export const fundingOf = (payload: Readonly<BankingPayload>, derived: Readonly<DerivedFacts>): FundingSource =>
  derived.fundingSource ?? (payload.cardType === 'VIRTUAL_DPAN' ? 'DEBIT' : payload.cardType);

/**
 * A chargeback raised from the live ledger: the amount the bank owed the merchant side for the purchase (2110) goes back to
 * the cardholder's account (2010).
 */
export const chargebackReversal = (amount: MinorUnits): Draft =>
  draft('CHARGEBACK_REVERSAL', 'CARD_CLEARING_PAYABLE', 'CUST_CASA', amount, `Chargeback: ${formatAud(amount)} owed to the merchant is reversed back to the cardholder’s account.`);

/** An authorisation: reserve the customer's funds and record that the bank now owes the scheme. */
export const authHold = (source: FundingSource, amount: MinorUnits): Draft =>
  draft('AUTH_HOLD', HOLD_ACCOUNT[source], 'CARD_CLEARING_PAYABLE', amount, `Reserves ${formatAud(amount)} on the ${accountName(HOLD_ACCOUNT[source])}; the bank now owes the card scheme the same amount.`);

/** The hold is let go because the payment did not complete. */
export const holdRelease = (source: FundingSource, amount: MinorUnits): Draft =>
  draft('HOLD_RELEASE', 'CARD_CLEARING_PAYABLE', HOLD_ACCOUNT[source], amount, `The payment did not complete, so the ${formatAud(amount)} hold is released and the amount owed to the scheme is cancelled.`);

/** At settlement the held money becomes a real debit on the customer's account. */
export const capture = (source: FundingSource, amount: MinorUnits): Draft =>
  draft('CAPTURE', CUSTOMER_ACCOUNT[source], HOLD_ACCOUNT[source], amount, `Settlement day: the ${formatAud(amount)} hold becomes a real debit on the customer's account.`);

/** The bank pays the scheme what it owes. */
export const settle = (amount: MinorUnits): Draft =>
  draft('SETTLEMENT', 'CARD_CLEARING_PAYABLE', 'SCHEME_NOSTRO', amount, `The bank pays the card scheme ${formatAud(amount)}; what it owed is cleared.`);

/** Pay-in-4: the bank pays the merchant in full and is owed the instalments still to come. */
export const bnplFinancing = (remaining: MinorUnits, instalment: MinorUnits | undefined): Draft =>
  draft('BNPL_FINANCING', 'BNPL_RECEIVABLE', 'CARD_CLEARING_PAYABLE', remaining, `The bank pays the merchant in full and is owed ${formatAud(remaining)} more${instalment ? ` as three instalments of ${formatAud(instalment)}` : ''}.`);

/** Money that did not match moves out of the clearing payable into the holding box. */
export const parkInSuspense = (amount: MinorUnits, why: string): Draft =>
  draft('SUSPENSE_BREAK', 'CARD_CLEARING_PAYABLE', 'RECON_SUSPENSE', amount, `${why} ${formatAud(amount)} moves into suspense until an ops clerk finds the cause.`);

/** The scheme claims money the bank never booked: record the claim against suspense. */
export const unbookedClaim = (amount: MinorUnits, why: string): Draft =>
  draft('SUSPENSE_BREAK', 'RECON_SUSPENSE', 'CARD_CLEARING_PAYABLE', amount, `${why} ${formatAud(amount)} is recorded in suspense as a claim nobody has booked.`);

/** A foreign-exchange difference: a loss when the scheme settled for more than was booked, a gain when for less. */
export const fxDifference = (direction: 'GAIN' | 'LOSS', amount: MinorUnits): Draft =>
  direction === 'LOSS'
    ? draft('FX_VARIANCE', 'FX_LOSS_SUSPENSE', 'CARD_CLEARING_PAYABLE', amount, `The scheme settled for ${formatAud(amount)} more than was booked at the exchange rate: an FX loss, held in the FX loss suspense account.`)
    : draft('FX_VARIANCE', 'CARD_CLEARING_PAYABLE', 'FX_GAIN_SUSPENSE', amount, `The scheme settled for ${formatAud(amount)} less than was booked at the exchange rate: an FX gain, held in the FX gain suspense account.`);

/** An ops clerk clears a suspense item by paying it to the scheme. */
export const clearSuspense = (amount: MinorUnits): Draft =>
  draft('SUSPENSE_CLEARED', 'RECON_SUSPENSE', 'SCHEME_NOSTRO', amount, `Ops found the cause and the ${formatAud(amount)} is settled with the scheme; the suspense item is cleared.`);

/** A released A2A payment leaves the customer's account and the bank's settlement account. */
export const a2aPayment = (rail: 'INSTANT' | 'RTGS', amount: MinorUnits): Draft =>
  draft('A2A_PAYMENT', 'CUST_CASA', rail === 'RTGS' ? 'A2A_RTGS_SETTLEMENT' : 'A2A_INSTANT_SETTLEMENT', amount, `The customer is debited ${formatAud(amount)} and the bank's ${rail === 'RTGS' ? 'RTGS' : 'instant-payments'} settlement account pays it out.`);

export const a2aQueued = (amount: MinorUnits): Draft =>
  draft('A2A_QUEUED', 'CUST_CASA', 'A2A_QUEUE_PAYABLE', amount, `The customer is debited ${formatAud(amount)} but the payment is waiting in the gateway queue, so the money sits in the queue payable.`);

export const paymentExecuted = (amount: MinorUnits): Draft =>
  draft('PAYMENT_EXECUTED', 'CUST_CASA', 'OUTWARD_PAYMENTS_CLEARING', amount, `The payment is released: the customer is debited ${formatAud(amount)} and it goes to outward clearing.`);

/** Cash leaves the bank’s own ATM and the customer’s account is debited for the same amount. No card scheme is involved. */
export const atmDeposit = (amount: MinorUnits): Draft =>
  draft('ATM_DEPOSIT', 'ATM_CASH', 'CUST_CASA', amount, `The machine counted ${formatAud(amount)} in notes into its cassette, so the cash in the machine rises and the customer's account is credited ${formatAud(amount)}.`);

export const atmDispense = (amount: MinorUnits): Draft =>
  draft('ATM_DISPENSE', 'CUST_CASA', 'ATM_CASH', amount, `The ATM counted out ${formatAud(amount)} in notes, so the customer is debited ${formatAud(amount)} and the cash in the machine falls by the same amount.`);

/** The machine took the debit but jammed before the notes came out: the money is parked in suspense, not left with the customer or the ATM. */
export const atmJam = (amount: MinorUnits): Draft =>
  draft('ATM_JAM', 'CUST_CASA', 'RECON_SUSPENSE', amount, `The dispenser jammed. The customer was debited ${formatAud(amount)} but got no cash, so the ${formatAud(amount)} is parked in suspense until the ATM’s cash count proves what happened.`);

/** Ops confirms the notes never left the machine, so the parked debit is paid back to the customer. */
export const atmRefund = (amount: MinorUnits): Draft =>
  draft('ATM_REFUND', 'RECON_SUSPENSE', 'CUST_CASA', amount, `The cash count showed the notes never left the machine, so the ${formatAud(amount)} in suspense is paid back to the customer.`);

export const amlRestrain = (amount: MinorUnits, why: string): Draft =>
  draft('AML_RESTRAIN', 'CUST_CASA', 'AML_RESTRAINED_FUNDS', amount, `${why} ${formatAud(amount)} is frozen in AML restrained funds.`);

export const amlRelease = (amount: MinorUnits): Draft =>
  draft('AML_RELEASE', 'AML_RESTRAINED_FUNDS', 'CUST_CASA', amount, `Compliance cleared the name match, so the ${formatAud(amount)} is released back to the customer.`);

/** The bank credits the cardholder at once while it chases the money through the scheme. */
export const provisionalCredit = (amount: MinorUnits): Draft =>
  draft('PROVISIONAL_CREDIT', 'DISPUTE_RECEIVABLE', 'CUST_CASA', amount, `First chargeback: the cardholder is credited ${formatAud(amount)} now and the bank expects to win it back from the scheme.`);

export const disputeRecovery = (amount: MinorUnits): Draft =>
  draft('DISPUTE_RECOVERY', 'SCHEME_NOSTRO', 'DISPUTE_RECEIVABLE', amount, `The cardholder won: the scheme pays the bank ${formatAud(amount)} and the receivable is cleared.`);

export const disputeReversal = (amount: MinorUnits): Draft =>
  draft('DISPUTE_REVERSAL', 'CUST_CASA', 'DISPUTE_RECEIVABLE', amount, `The merchant won: the ${formatAud(amount)} credited to the cardholder is taken back.`);

export const issuerLoss = (amount: MinorUnits): Draft =>
  draft('ISSUER_LOSS', 'FRAUD_LOSS_EXPENSE', 'CUST_CASA', amount, `Liability sits with the issuer: the cardholder is refunded ${formatAud(amount)} and the bank books the loss.`);

// ─────────────────────────────────────────────────────────────────────────────
// Turning drafts into numbered lines
// ─────────────────────────────────────────────────────────────────────────────

export function toEntries(drafts: readonly Draft[], txId: Id, timestamp: EpochMs, currency: string = DEFAULT_CURRENCY): GLEntry[] {
  const out: GLEntry[] = [];
  for (const d of drafts) {
    if (d.amount <= 0) continue;
    out.push(makeEntry({ id: `GL-${txId}-${String(out.length + 1).padStart(2, '0')}`, txId, timestamp, debitAccount: d.debit, creditAccount: d.credit, amount: d.amount, currency, kind: d.kind, memo: d.memo }));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules for a token that has reached an end event
// ─────────────────────────────────────────────────────────────────────────────

/** A funds check that found enough puts a hold. The hold stands only if the payment goes through. */
function fundsDrafts(payload: Readonly<BankingPayload>, derived: Readonly<DerivedFacts>, outcome: Outcome): Draft[] {
  if (derived.ledgerDecision !== 'SUFFICIENT' || !derived.authHoldMinor) return [];
  const source = fundingOf(payload, derived);
  const held = derived.authHoldMinor;
  const out = [authHold(source, held)];
  if (outcome !== 'APPROVED') {
    out.push(holdRelease(source, held));
  } else if (derived.bnplDecision === 'ELIGIBLE' && derived.installment1Minor !== undefined && held === derived.installment1Minor && held < payload.amount) {
    out.push(bnplFinancing(payload.amount - held, derived.installmentAmountMinor));
  }
  return out;
}

/** End-of-day: approved means settled with the scheme; a suspense outcome means money is parked, and where depends on the break. */
function settlementDrafts(payload: Readonly<BankingPayload>, derived: Readonly<DerivedFacts>, outcome: Outcome): Draft[] {
  const s = payload.settlement;
  if (!s) return [];
  const { ledgerAmount: ledger, clearingAmount: clearing, switchAmount: sw } = s;
  if (outcome === 'APPROVED') return [settle(ledger ?? clearing ?? sw ?? payload.amount)];
  if (outcome !== 'ROUTED_TO_SUSPENSE') return [];

  switch (derived.reconStatus) {
    case 'BREAK_AMOUNT': {
      if (ledger === null || clearing === null) return [parkInSuspense(ledger ?? clearing ?? payload.amount, 'The legs disagree.')];
      if (derived.reconCause === 'FX_RATE') {
        // Settle what the scheme says, and keep the exchange-rate difference visible in its own account.
        return [fxDifference(clearing > ledger ? 'LOSS' : 'GAIN', Math.abs(clearing - ledger)), settle(clearing)];
      }
      return [parkInSuspense(ledger, `The legs disagree by ${formatAud(Math.abs(clearing - ledger))} and nothing explains it.`)];
    }
    case 'BREAK_MISSING_LEG':
      return ledger !== null
        ? [parkInSuspense(ledger, 'The bank booked this payment but a record is missing at the scheme or acquirer.')]
        : [unbookedClaim(clearing ?? sw ?? payload.amount, 'The scheme cleared a payment the bank never booked.')];
    case 'BREAK_DUPLICATE': {
      const once = ledger ?? clearing ?? sw ?? payload.amount;
      return [settle(once), unbookedClaim(once * Math.max(1, s.clearingPresentments - 1), 'The scheme presented the same payment again.')];
    }
    default:
      return [parkInSuspense(ledger ?? clearing ?? sw ?? payload.amount, 'The item was sent to suspense.')];
  }
}

function a2aDrafts(payload: Readonly<BankingPayload>, derived: Readonly<DerivedFacts>, outcome: Outcome): Draft[] {
  if (outcome === 'APPROVED') return [a2aPayment(derived.a2aRail ?? 'INSTANT', payload.amount)];
  if (outcome === 'ROUTED_TO_SUSPENSE') return [a2aQueued(payload.amount)];
  return [];
}

function amlDrafts(payload: Readonly<BankingPayload>, derived: Readonly<DerivedFacts>, outcome: Outcome): Draft[] {
  const amount = payload.amount;
  const hit = derived.amlList !== undefined && derived.amlList !== 'NONE';
  switch (outcome) {
    case 'APPROVED':
      // A name hit that compliance cleared leaves its trace: frozen, then released, then paid.
      return hit ? [amlRestrain(amount, 'A name matched a watchlist, so the payment was held.'), amlRelease(amount), paymentExecuted(amount)] : [paymentExecuted(amount)];
    case 'DECLINED':
      return derived.amlStatus === 'SANCTION_HIT' ? [amlRestrain(amount, 'A sanctions match was confirmed.')] : [];
    case 'ROUTED_TO_SUSPENSE':
      return [amlRestrain(amount, derived.amlStructuring ? 'A structuring pattern was reported.' : 'The case is escalated for review.')];
    default:
      return [];
  }
}

function disputeDrafts(payload: Readonly<BankingPayload>, derived: Readonly<DerivedFacts>, outcome: Outcome): Draft[] {
  const d = payload.dispute;
  if (!d) return [];
  const amount = payload.amount;
  const credited = d.stage === 'FIRST_CHARGEBACK' || d.stage === 'REPRESENTMENT' || d.stage === 'PRE_ARBITRATION';
  switch (outcome) {
    case 'APPROVED':
      return derived.disputeNext === 'RESOLVED_CARDHOLDER' ? [disputeRecovery(amount)] : [issuerLoss(amount)];
    case 'ROUTED_TO_SUSPENSE':
      return derived.disputeNext === 'FIRST_CHARGEBACK' ? [provisionalCredit(amount)] : [];
    case 'DECLINED':
      return derived.disputeNext === 'RESOLVED_MERCHANT' && credited ? [disputeReversal(amount)] : [];
    default:
      return [];
  }
}

/**
 * The ledger lines a transaction posts, read from its journey. Returns nothing for a token that has not finished, and
 * nothing for a decline that moved no money. Each family of rules runs only if the matching capability was on the path.
 */
export function postToken(token: Readonly<SimulationToken>): GLEntry[] {
  const outcome = token.finalOutcome;
  if (outcome === null) return [];
  const caps: ReadonlySet<BankingCapability> = new Set(token.executionPathHistory.flatMap((s) => (s.capability ? [s.capability] : [])));
  const { payload, derived } = token;
  const drafts: Draft[] = [];
  // An account-to-account payment is not a card purchase: its funds check puts no card hold on the account, because the payment
  // itself (a2aDrafts below) is what debits the customer.
  if (caps.has('CORE_LEDGER_CHECK') && !payload.a2a) drafts.push(...fundsDrafts(payload, derived, outcome));
  if (caps.has('RECON_DESK')) drafts.push(...settlementDrafts(payload, derived, outcome));
  if (caps.has('A2A_GATEWAY') && payload.a2a) drafts.push(...a2aDrafts(payload, derived, outcome));
  if (caps.has('AML_SCREENING') && payload.aml) drafts.push(...amlDrafts(payload, derived, outcome));
  if (caps.has('CHARGEBACK_DESK')) drafts.push(...disputeDrafts(payload, derived, outcome));
  return toEntries(drafts, payload.txId, payload.clientTimestamp + token.elapsedMs);
}

/** The lines for one test run: those of the token that decided the outcome. Hidden tests carry no tokens, so they post nothing. */
export function postTestResult(result: Pick<TestCaseResult, 'actualOutcome' | 'tokens'>): GLEntry[] {
  if (result.actualOutcome === 'NO_OUTCOME') return [];
  const deciding = result.tokens.find((t) => t.finalOutcome === result.actualOutcome);
  return deciding ? postToken(deciding) : [];
}
