/** One-line explanations for the End-of-Day report, for learners who have never worked in finance. */

import type { DeclineReason } from '../sim/types';

/** The Profit & Loss lines, keyed by the label the report shows. */
export const PNL_GLOSSARY = {
  'Card interchange': 'Fee earned by the issuing bank from merchants on card transactions.',
  'Pay-in-4 merchant fees': 'The cut a shop pays the bank for letting its customer split a purchase into four payments.',
  'Instant-transfer fees': 'The small fee the bank charges to move money straight from one account to another in seconds.',
  'Fraud the bank repaid': 'Money the bank had to give back to customers for fraudulent payments it approved.',
  'Expected Pay-in-4 bad debt': 'The share of today’s four-payment plans the bank expects some customers never to finish paying.',
  'Real errors matched away': 'Genuine mistakes in the records that the reconciliation tolerance treated as rounding, so nobody will chase them.',
  'Clearing the suspense account': 'Temporary holding ledger cleared when overnight reconcilers match physical cash and failed transactions.',
  'Good customers lost': 'Legitimate revenue missed due to excessive 3DS authentication friction or false declines.',
  'Temporary cover': 'What the bank paid for extra staff booked for the day to clear a queue.',
  'Day result': 'Everything the bank earned today minus everything it lost or paid out.',
} as const satisfies Record<string, string>;

/** The "Day in numbers" tiles. */
export const STAT_GLOSSARY = {
  Payments: 'Every payment that arrived today: card taps, online checkouts, transfers and ATM withdrawals.',
  Approved: 'The share of payments the bank said yes to, and the money they were worth.',
  'Fraud approved': 'Fraudulent payments that got through the bank’s checks, out of all the fraud attempted.',
  'Pay-in-4 plans': 'Purchases the bank agreed to split into four interest-free payments.',
  'Instant transfers': 'Account-to-account transfers (pacs.008) released, out of all that arrived.',
  'Sidewalk ATM': 'Cash withdrawals the ATM paid out, out of all sessions, and how many jammed.',
  '3DS challenged': 'Online payments where the customer had to type a one-time code to prove it was them.',
  'Average wait': 'How long a customer waited in a queue, on average, before a desk started on their payment.',
  'Matched overnight': 'Records the night team matched across the ledger, the card scheme and the shop’s bank.',
  'Suspense account': 'Money parked in the temporary holding ledger at midnight, and how many items it holds.',
} as const satisfies Record<string, string>;

/** Why payments were declined, keyed by reason so the tip is right whichever vocabulary the label is shown in. */
export const DECLINE_GLOSSARY: Record<DeclineReason, string> = {
  FUNDS: 'The account or credit line did not have enough available to cover the payment.',
  DCVV_EXPIRED: '3-digit rotating security code (dCVV) on virtual cards that expired before transaction completion.',
  DCVV_MISMATCH: 'The rotating security code typed did not match the one the virtual card was showing.',
  UNKNOWN_DPAN: 'The virtual card number did not belong to any card in the bank’s token vault.',
  THREE_DS_REJECT: 'The risk engine scored the online payment as too likely to be fraud and refused it outright.',
  OTP_ABANDONED: 'The customer was asked for a one-time SMS code and never typed it in.',
  DOWN_PAYMENT: 'The first of the four Pay-in-4 payments could not be taken from the customer’s card.',
  PIN_LOCKED: 'Three wrong PINs at the ATM, so the machine ended the session and kept the card.',
  A2A_INVALID: 'The bank-to-bank transfer message was malformed, so it was refused before any money moved.',
  ATM_JAM: 'Physical banknote jam in the ATM tray; debited funds are parked in Suspense until audit.',
  TIMEOUT: 'The customer gave up waiting in a queue before a desk could serve them.',
  PROCESS_ERROR: 'The process diagram itself failed on this payment (should not happen with the bundled diagrams).',
  EKYC_LIVENESS_FAILED: 'The selfie failed liveness, did not match the CCCD photo, or the ID was forged or unknown, so no account was opened.',
  BIOMETRIC_AUTH_REQUIRED: 'A transfer over $400 (10M VND) needs a FacePay face match, and the face did not match or none was enrolled.',
  FDS_HIGH_RISK_DEVICE: 'The FDS scored the device too risky: an IP anomaly, a rooted or jailbroken phone, or a BIN-attack burst.',
  AML_SANCTION_MATCH: 'The name matched the OFAC sanctions list; an analyst confirmed it and the funds were frozen.',
  AML_STR_BLOCKED: 'An AML analyst found the held payment suspicious, filed a Suspicious Transaction Report and blocked it.',
  QR_PAYLOAD_INVALID: 'The VietQR string failed its CRC, broke the EMVCo tag format, or carried a different amount.',
  SWIFT_INVALID: 'The cross-border pacs.008 broke an ISO 20022 format rule (EndToEndId, a BIC, the currency or the amount).',
  TELLER_VAULT_LIMIT: 'The teller’s till did not hold enough cash for the withdrawal, so it waits for a vault top-up.',
  TELLER_SUSPECT_NOTE: 'The counting machine flagged suspect notes, so their serials were recorded and the deposit was refused.',
  DISPUTE_REJECTED: 'The claim came after its time limit, or the evidence (merchant proof, ATM journal, beneficiary bank) went against it.',
};

export type PnlLabel = keyof typeof PNL_GLOSSARY;
export type StatLabel = keyof typeof STAT_GLOSSARY;

/** The Overview's hero cards and charts. */
export const OVERVIEW_GLOSSARY = {
  'Capital & P&L': 'Today’s result, and the bank’s reserves (its own money, which absorbs losses) before and after it.',
  'Settlement & volume': 'The share of payments approved, and the money those approved payments moved.',
  'Customer base & churn': 'Customers with an account, the new ones who joined today, and the good ones who left after being turned away.',
  'Top revenue drain': 'The single loss line that cost the bank the most today.',
  'Revenue vs losses': 'Everything earned today against everything lost or written off; the gap is the day’s result.',
  'Decline breakdown': 'Why payments were refused today, grouped into money, OTP walk-aways, risk blocks, identity checks, cash and queues.',
} as const satisfies Record<string, string>;

export type OverviewLabel = keyof typeof OVERVIEW_GLOSSARY;
