/**
 * The card-dispute (chargeback) cycle as a state machine.
 *
 *   RETRIEVAL_REQUEST  ->  FIRST_CHARGEBACK  ->  REPRESENTMENT  ->  PRE_ARBITRATION
 *   "show me the receipt"   "I am taking the     "the merchant       "I do not accept the
 *                            money back"          fights back"        answer; this goes to the scheme"
 *
 * Each stage ends in one of three ways: the case moves to the next stage, someone wins and the case is resolved, or the
 * scheme allows no action at all (the claim is out of time, or the bank carries the liability itself).
 *
 * Liability is the heart of it. When a purchase was authenticated with 3-D Secure, the liability for fraud shifts to the
 * ISSUER: the merchant did everything the scheme asks, so a fraud chargeback against it is not allowed and the issuer
 * absorbs the loss. Without authentication the MERCHANT stays liable, so the issuer can charge back.
 *
 * Pure functions, no I/O.
 */

import type { DisputeContext, DisputeNext, DisputeReason, DisputeStage, MerchantEvidence } from '../types/processLearning';

export const DISPUTE_STAGES: readonly DisputeStage[] = ['RETRIEVAL_REQUEST', 'FIRST_CHARGEBACK', 'REPRESENTMENT', 'PRE_ARBITRATION'];

/** How long after the purchase a cardholder may still raise a dispute. */
export const DEFAULT_FILING_WINDOW_DAYS = 120;

export type Liability = 'ISSUER' | 'MERCHANT';

/** Who carries a loss on this kind of claim. Only an authenticated purchase disputed as fraud shifts liability to the issuer. */
export function liabilityFor(reason: DisputeReason, authenticated: boolean | undefined): Liability {
  return reason === 'FRAUD' && authenticated === true ? 'ISSUER' : 'MERCHANT';
}

/**
 * Where the case goes after the stage it is in, given how strong the merchant's answer is.
 * `NEW` is a claim nobody has acted on yet: the first move is always to ask the merchant for the paperwork.
 */
export function transition(stage: DisputeStage | 'NEW', evidence: MerchantEvidence): DisputeNext {
  switch (stage) {
    case 'NEW':
      return 'RETRIEVAL_REQUEST';
    case 'RETRIEVAL_REQUEST':
      // A compelling receipt (signed, delivered, matching) ends it for the merchant. Otherwise the bank takes the money back.
      return evidence === 'COMPELLING' ? 'RESOLVED_MERCHANT' : 'FIRST_CHARGEBACK';
    case 'FIRST_CHARGEBACK':
      // Silence from the merchant means the cardholder wins by default. Any answer is a representment.
      return evidence === 'NONE' ? 'RESOLVED_CARDHOLDER' : 'REPRESENTMENT';
    case 'REPRESENTMENT':
      return evidence === 'COMPELLING' ? 'RESOLVED_MERCHANT' : evidence === 'WEAK' ? 'PRE_ARBITRATION' : 'RESOLVED_CARDHOLDER';
    case 'PRE_ARBITRATION':
      return evidence === 'COMPELLING' ? 'RESOLVED_MERCHANT' : evidence === 'NONE' ? 'RESOLVED_CARDHOLDER' : 'PRE_ARBITRATION';
  }
}

export interface DisputeStep {
  /** Can the claim still be filed? A case that has already been filed is always OPEN. */
  window: 'OPEN' | 'EXPIRED';
  liability: Liability;
  next: DisputeNext;
  /** Plain English: why the case goes where it goes. */
  why: string;
}

/** The stages at which the claim is still being brought. Past them it has been filed and the window no longer matters. */
const STILL_FILING: ReadonlySet<DisputeContext['stage']> = new Set(['NEW', 'RETRIEVAL_REQUEST']);

export function advanceDispute(d: Readonly<DisputeContext>, authenticated: boolean | undefined, filingWindowDays: number = DEFAULT_FILING_WINDOW_DAYS): DisputeStep {
  const liability = liabilityFor(d.reason, authenticated);
  const window = STILL_FILING.has(d.stage) && d.daysSinceTransaction > filingWindowDays ? 'EXPIRED' : 'OPEN';

  if (window === 'EXPIRED') {
    return { window, liability, next: 'NONE', why: `The purchase is ${d.daysSinceTransaction} days old and the filing window is ${filingWindowDays} days, so the claim is time-barred.` };
  }
  if (liability === 'ISSUER') {
    return { window, liability, next: 'NONE', why: 'The purchase was authenticated with 3-D Secure, so liability for fraud shifted to the issuer. The scheme does not allow a chargeback; the bank absorbs the loss.' };
  }
  const next = transition(d.stage, d.merchantEvidence);
  const evidence = d.merchantEvidence.toLowerCase();
  const why =
    d.stage === 'NEW'
      ? 'A new claim starts with a retrieval request: ask the merchant for the receipt before taking the money back.'
      : `At ${d.stage.toLowerCase().replace(/_/g, ' ')} the merchant's answer is ${evidence}, so the case moves to ${next.toLowerCase().replace(/_/g, ' ')}.`;
  return { window, liability, next, why };
}

/** The same step in the words a learner reads on a card. */
export const STAGE_LABEL: Readonly<Record<DisputeStage | 'NEW' | 'RESOLVED_CARDHOLDER' | 'RESOLVED_MERCHANT' | 'NONE', string>> = {
  NEW: 'New claim',
  RETRIEVAL_REQUEST: 'Retrieval request',
  FIRST_CHARGEBACK: 'First chargeback',
  REPRESENTMENT: 'Representment',
  PRE_ARBITRATION: 'Pre-arbitration',
  RESOLVED_CARDHOLDER: 'Resolved: cardholder wins',
  RESOLVED_MERCHANT: 'Resolved: merchant wins',
  NONE: 'No scheme action',
};
