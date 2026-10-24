/**
 * What a worker is doing, in words. The inspector's "live activity" lines and the bank-wide feed
 * both come from here, built from the facts the real process diagram wrote for the step.
 */

import { formatAud } from '../engine/capabilities';
import type { CardType } from '../types/processLearning';
import { scenarioLabelEn } from './scenarios';
import type { StationId } from './topology';
import type { Checkpoint, Packet, Stop } from './types';

const CARD_LABEL: Record<CardType, string> = {
  DEBIT: 'debit card',
  CREDIT: 'credit card',
  PREPAID: 'prepaid card',
  VIRTUAL_DPAN: 'virtual card',
};

export const cardLabel = (card: CardType): string => CARD_LABEL[card];

const tail = (id: string): string => `…${id.slice(-6)}`;

/** What the payment is: "🛒 Supermarket Groceries ($62.80)", or just the amount when it has no scenario (night-cycle records). */
const tag = (p: Packet): string => scenarioLabelEn(p.scenario) || formatAud(p.amountCents);

const lowerFirst = (text: string): string => (text.length > 0 ? text[0]!.toLowerCase() + text.slice(1) : text);

const THREE_DS_TEXT: Record<string, string> = {
  FRICTIONLESS: 'frictionless, waved through',
  CHALLENGE: 'sending a one-time code to the customer',
  CHALLENGE_PASSED: 'code entered, authenticated',
  CHALLENGE_FAILED: 'no code entered, authentication failed',
  REJECT: 'too risky, rejected',
};

type Check<A extends Checkpoint['at']> = Extract<Checkpoint, { at: A }>;

export const EKYC_TEXT: Record<Check<'EKYC'>['verdict'], string> = {
  VERIFIED: 'identity verified',
  LIVENESS_FAILED: 'liveness failed',
  FACE_MISMATCH: 'face does not match the CCCD',
  FAKE_ID: 'fake ID suspected',
  CITIZEN_DB_MISMATCH: 'not found in the National Citizen Database',
};

export const SCREEN_TEXT: Record<Check<'AML_SCREEN'>['reason'], string> = {
  NONE: 'clean',
  PEP: 'STR_PENDING, PEP',
  STRUCTURING: 'STR_PENDING, structuring',
  LARGE_CROSS_BORDER: 'STR_PENDING, large cross-border',
  OFAC: 'AML_SANCTION_MATCH',
};

export const REVIEW_REASON: Record<Check<'AML_REVIEW'>['reason'], string> = { NONE: 'no reason', PEP: 'PEP', STRUCTURING: 'structuring', LARGE_CROSS_BORDER: 'large cross-border', OFAC: 'OFAC match' };

export const REVIEW_TEXT: Record<Check<'AML_REVIEW'>['verdict'], string> = {
  RELEASED: 'false positive, released',
  STR_FILED_RELEASED: 'STR filed, released',
  BLOCKED_STR: 'STR filed, blocked',
  BLOCKED_SANCTION: 'sanctions match confirmed, funds frozen',
};

export const CLAIM_TEXT: Record<Check<'DISPUTE'>['type'], string> = { CHARGEBACK: 'chargeback', PACS004_RETURN: 'pacs.004 return', ATM_MISMATCH: 'ATM mismatch' };

export const DISPUTE_TEXT: Record<Check<'DISPUTE'>['verdict'], string> = {
  REFUND: 'upheld, refund',
  REJECTED_SLA: 'past the time limit, rejected',
  REJECTED_EVIDENCE: 'evidence against the customer, rejected',
};

export const POSTING_TEXT: Record<Check<'POSTING'>['verdict'], string> = {
  ACCOUNT_OPENED: 'account opened',
  DEBITED: 'debited',
  CREDITED: 'credited',
  REFUNDED: 'refund credited',
  NO_FUNDS: 'not enough money, declined',
};

const screenTail = (s: Stop): string => (s.screen ? `; AML screen ${SCREEN_TEXT[s.screen.reason]}` : '');

/** The activity line of a Phase 8 checkpoint. Each one is a single fixed template, so feedVi.ts can rebuild it in Vietnamese. */
function describeCheckpoint(c: Checkpoint, what: string, stop: Stop): string {
  switch (c.at) {
    case 'EKYC':
      return `eKYC for ${what}: OCR ${c.ocrMatchPct}%, liveness ${c.livenessScore}, face match ${c.faceMatchPct}%: ${EKYC_TEXT[c.verdict]}`;
    case 'QR':
      return `Parsing the VietQR for ${what}: ${
        c.verdict === 'PARSED' ? `${c.mode === 'DYNAMIC' ? 'dynamic' : 'static'} QR, CRC ok, mapped to ISO 8583 0200` : c.issue === 'CRC' ? 'CRC mismatch, refused' : c.issue === 'AMOUNT' ? 'amount disagrees, refused' : 'malformed EMVCo tags, refused'
      }`;
    case 'SWIFT':
      return `Validating the pacs.008 for ${what} (${c.currency}): ${c.verdict === 'VALID' ? 'well formed, FX converted' : `${c.field} is invalid, rejected`}`;
    case 'FACEPAY':
      return `FacePay check on ${what}: face match ${c.faceMatchPct}%, ${c.verdict === 'MATCHED' ? 'authorised' : c.verdict === 'NOT_ENROLLED' ? 'no face enrolled, BIOMETRIC_AUTH_REQUIRED' : 'BIOMETRIC_AUTH_REQUIRED'}`;
    case 'FDS':
      return `Scoring the device behind ${what}: score ${c.score}${c.signals.length > 0 ? ` (${c.signals.join(', ')})` : ''}, ${c.verdict === 'CLEAR' ? 'clear' : 'FDS_HIGH_RISK_DEVICE'}${screenTail(stop)}`;
    case 'TELLER':
      return `Counting ${what} ${c.direction === 'IN' ? 'in' : 'out'}: ${
        c.verdict === 'SUSPECT_NOTES' ? `${c.suspectSerials} suspect notes, serials recorded` : c.verdict === 'VAULT_LIMIT' ? 'not enough cash in the till' : c.ctr ? 'counted, CTR filed' : 'counted'
      }${screenTail(stop)}`;
    case 'AML_REVIEW':
      return `Reviewing ${what} (${REVIEW_REASON[c.reason]}): ${REVIEW_TEXT[c.verdict]}`;
    case 'DISPUTE':
      return `Working the ${CLAIM_TEXT[c.type]} claim for ${what}: ${DISPUTE_TEXT[c.verdict]}`;
    case 'POSTING':
      return `Posting ${what} on the CASA ledger: ${POSTING_TEXT[c.verdict]}`;
    case 'AML_SCREEN':
      return `Screening ${what}: ${SCREEN_TEXT[c.reason]}`;
  }
}

/** One line saying what the worker is doing with this packet at this desk. Read at the moment the item is finished. */
export function describeWork(station: StationId, p: Packet, stop: Stop, previous: Stop | undefined): string {
  const money = formatAud(p.amountCents);
  const what = tag(p);
  const f = stop.facts;
  if (stop.check) return describeCheckpoint(stop.check, what, stop);

  switch (station) {
    case 'GATE_VIRTUAL':
      return `Receiving ${what} paid with a virtual card`;
    case 'GATE_POS':
      return `Receiving ${what} from a shop terminal`;
    case 'GATE_ECOM':
      return p.kind === 'BNPL' ? `Receiving ${what}: a Pay-in-4 application` : `Receiving ${what} paid online by ${cardLabel(p.cardType)}`;

    case 'GATE_A2A':
      return f.a2aValid === false
        ? `Rejected the pacs.008 for ${what}: the message is malformed, so the money is never touched`
        : `Validated the pacs.008 for ${what}: well formed, released on the ${(f.a2aRail ?? 'INSTANT').toLowerCase()} rail`;

    case 'GATE_ATM':
      return `ATM, ${what}. ${stop.note}`;
    case 'ATM_CASH':
      return `ATM, ${what}. ${stop.note}`;

    case 'SEC_VAULT':
      return f.tokenStatus ? `Resolving a virtual card to ···${f.fpanLast4 ?? '????'}, funded by ${(f.fundingSource ?? 'DEBIT').toLowerCase()}` : 'No match in the vault for this virtual card number: unknown DPAN';

    case 'SEC_DCVV':
      return `Checking the dynamic CVV on ${what}: ${lowerFirst(stop.note || 'no result')}`;

    case 'SEC_3DS': {
      const verdict = THREE_DS_TEXT[f.threeDsPath ?? ''] ?? 'scoring';
      return previous?.kind === 'OTP'
        ? `Customer returned from their phone (risk ${p.riskScore}): ${verdict}`
        : `Reviewing risk score ${p.riskScore} on ${what} (${cardLabel(p.cardType)}): ${verdict}`;
    }

    case 'LEDGER_DEBIT':
    case 'LEDGER_CREDIT': {
      const line = station === 'LEDGER_CREDIT' ? 'credit line' : 'balance';
      const held = p.kind === 'BNPL' && p.plan.bnpl === 'ELIGIBLE';
      const amount = held ? `the ${formatAud(f.authHoldMinor ?? p.plan.heldCents)} down payment on ${what}` : what;
      if (p.kind === 'A2A') return f.ledgerDecision === 'SUFFICIENT' ? `Debiting ${what} from the account: enough, transfer released` : `Checking ${what} against the balance: not enough, transfer declined`;
      if (f.ledgerDecision === 'SUFFICIENT') return `Checking ${amount} against the ${line}: enough, hold placed`;
      return `Checking ${amount} against the ${line}: ${f.ledgerDecision === 'OVER_LIMIT' ? 'over the limit' : 'not enough'}, declined`;
    }

    case 'BNPL':
      return f.bnplDecision === 'ELIGIBLE'
        ? `Underwriting ${what} (score ${p.score}): plan approved, ${formatAud(f.installment1Minor ?? 0)} due today`
        : `Underwriting ${what} (score ${p.score}): ${lowerFirst(stop.note.replace(/^Ineligible: /, 'not eligible, '))} Falling back to a normal card payment`;

    case 'EOD_BATCH':
      return `Adding ${tail(p.id)} (${money}) to tonight’s clearing file`;
    case 'EOD_VISA':
      return `Presenting ${tail(p.id)} (${money}) to Visa and agreeing the net settlement`;

    case 'RECON': {
      const status = f.reconStatus;
      const outcome = status === 'MATCHED' ? 'matched' : status === 'BREAK_AMOUNT' ? 'amount break' : status === 'BREAK_MISSING_LEG' ? 'a leg is missing' : status === 'BREAK_DUPLICATE' ? 'presented twice' : 'checked';
      return `Matching Visa clearing batch vs GL and acquirer report for ${tail(p.id)} (${money}): ${outcome}`;
    }

    case 'SUSPENSE':
      if (p.kind === 'ATM') return `Refunding the ATM jam ${tail(p.id)} (${what}): the cash count shows the notes never came out`;
      return `Investigating suspense item ${tail(p.id)} (${formatAud(p.plan.suspenseCents)}): ${p.plan.reasonCode ?? 'unmatched'}`;

    // Phase 8 desks only ever see packets with a checkpoint (handled above); this is the line for anything else.
    case 'GATE_EKYC':
    case 'GATE_QR':
    case 'TELLER_CASH':
    case 'SEC_FACEPAY':
    case 'SEC_FDS':
    case 'AML_DESK':
    case 'DISPUTE_DESK':
    case 'GATE_SWIFT':
      return `Working on ${what}`;
  }
}

export const IDLE_TEXT: Record<StationId, string> = {
  GATE_VIRTUAL: 'Watching the virtual-card feed',
  GATE_POS: 'Watching the terminal feed',
  GATE_ECOM: 'Watching the checkout feed',
  SEC_VAULT: 'Waiting for the next virtual card to resolve',
  SEC_DCVV: 'Waiting for the next dCVV to check',
  SEC_3DS: 'Waiting for the next payment to score',
  LEDGER_DEBIT: 'Waiting for the next debit hold',
  LEDGER_CREDIT: 'Waiting for the next credit check',
  BNPL: 'Waiting for the next application',
  EOD_BATCH: 'Standing by for the 23:00 batch',
  EOD_VISA: 'Standing by for the clearing file',
  RECON: 'Standing by for tonight’s records',
  SUSPENSE: 'Nothing waiting in suspense',
  GATE_A2A: 'Watching the instant-payment feed',
  GATE_ATM: 'Waiting for the next card at the sidewalk ATM',
  ATM_CASH: 'Cash cassettes loaded, waiting for a withdrawal',
  GATE_EKYC: 'Waiting for the next CCCD scan and selfie',
  GATE_QR: 'Watching the Napas247 QR feed',
  TELLER_CASH: 'Till balanced, waiting for the next customer',
  SEC_FACEPAY: 'Waiting for the next high-value transfer',
  SEC_FDS: 'Scoring device fingerprints in real time',
  AML_DESK: 'No alerts waiting for review',
  DISPUTE_DESK: 'No claims waiting',
  GATE_SWIFT: 'Watching the SWIFT inbound and outbound queues',
};
