/** The Learning Hub's four lessons. */

import type { BankingPayload } from '../types/processLearning';
import type { BoxSide } from '../types/geometry';
import { LESSON_E, LESSON_F } from './learningAcademy';
import type { BankRules } from './rules';
import type { PlaceId, StationId } from './topology';

/** The six chapters of the Academy, in the order of the course catalog: chapter 1 is A, chapter 6 is F. */
export type ProcessId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type GraphKey = 'virtual' | 'ecom' | 'bnpl' | 'settle' | 'a2a' | 'aml' | 'dispute';

export type DiagramKind = 'start' | 'task' | 'gateway' | 'end' | 'system' | 'phone' | 'account';

export interface DiagramPoint {
  x: number;
  y: number;
}

/** A box on the diagram that is not a node of the process graph (the customer's phone, the suspense account, the night batch). */
export interface SyntheticNode extends DiagramPoint {
  id: string;
  kind: DiagramKind;
  label: string;
  sub?: string;
  place: PlaceId | null;
}


export interface EdgeRoute {
  fromSide?: BoxSide;
  toSide?: BoxSide;
  /** Slides where the wire leaves or arrives along the side. */
  fromDy?: number;
  toDy?: number;
  fromDx?: number;
  toDx?: number;
  /** Points the wire must pass through, in order. Gives a rounded elbow line instead of an S-curve. */
  via?: Array<readonly [number, number]>;
  /** Where to put the label, as a point; otherwise the middle of the wire. */
  labelAt?: readonly [number, number];
}

export interface SyntheticEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface LessonLayout {
  width: number;
  height: number;
  /** Where each node of the process graph sits. */
  nodes: Record<string, DiagramPoint>;
  synthetic: SyntheticNode[];
  syntheticEdges: SyntheticEdge[];
  routes: Record<string, EdgeRoute>;
  /** Short plain-English labels for wires, by graph edge id. */
  labels: Record<string, string>;
}

export interface StepText {
  title: string;
  what: string;
  why: string;
}

export interface LessonExample {
  id: string;
  label: string;
  /** Who this is and what is happening, in a sentence or two. */
  story: string;
  kind: 'VIRTUAL' | 'ECOM' | 'BNPL' | 'SETTLEMENT' | 'A2A' | 'AML' | 'DISPUTE';
  /** The diagram this example is walked through, when it is not the lesson's own (chapter 6 has two). */
  graph?: GraphKey;
  payload: BankingPayload;
  /** For an online payment that is challenged: whether the customer types the code. */
  otpCompletes?: boolean;
  /** For a settlement record: whether the difference in the records is a real mistake (and not rounding dust). */
  realError?: boolean;
  /** A rule change that changes this payment's story, and what to look for. */
  suggestion?: { rules: Partial<BankRules>; text: string };
}

export interface Lesson {
  id: ProcessId;
  title: string;
  subtitle: string;
  /** The lesson's own diagram. An example may walk another one (see LessonExample.graph). */
  graph: GraphKey;
  /** The chapter number in the Academy, 1 to 6, strictly in the order of the course. */
  chapter: 1 | 2 | 3 | 4 | 5 | 6;
  accent: string;
  /** The desks that take part, in the order a payment meets them. */
  desks: StationId[];
  intro: string[];
  /** Words for each box. A box that two of the lesson's diagrams share by id is keyed `<graph>:<id>` for the diagram that is not the lesson's own. */
  steps: Record<string, StepText>;
  layout: LessonLayout;
  /** The layout of the lesson's other diagrams, by graph. */
  layouts?: Partial<Record<GraphKey, LessonLayout>>;
  examples: LessonExample[];
  /** The dials this process owns. */
  knobs: Array<keyof BankRules>;
  /** The KPI rows that move when those dials move. */
  focusRows: string[];
  takeaways: string[];
}

// Example payments

const TS = 1_800_000_000_000;

const payment = (over: Partial<BankingPayload> = {}): BankingPayload => ({
  txId: 'tx_lesson',
  amount: 4800,
  channel: 'ECOMMERCE',
  cardType: 'DEBIT',
  rawCvv: '123',
  clientTimestamp: TS,
  riskScore: 12,
  isFraud: false,
  availableBalance: 90_000,
  creditLimit: 0,
  ...over,
});

const virtual = (ageSec: number, over: Partial<BankingPayload> = {}, typed = '482'): BankingPayload =>
  payment({
    cardType: 'VIRTUAL_DPAN',
    rawCvv: typed,
    virtualCard: { dpan: '5120 4471 0928 3316', vaultEntry: { fpanLast4: '4242', status: 'ACTIVE', fundingSource: 'DEBIT', expectedDcvv: '482', dcvvIssuedAt: TS - ageSec * 1000 } },
    ...over,
  });

const settlement = (legs: [number | null, number | null, number | null], presentments = 1): BankingPayload =>
  payment({ amount: 12_500, settlement: { ledgerAmount: legs[0], clearingAmount: legs[1], switchAmount: legs[2], clearingPresentments: presentments } });

const bnpl = (score: number, downPct: number, over: Partial<BankingPayload> = {}): BankingPayload => {
  const amount = over.amount ?? 24_000;
  return payment({ amount, bnpl: { underwritingScore: score, downPaymentMinor: Math.ceil((amount * downPct) / 100) }, ...over });
};

// Process A: virtual card tokenization and dynamic CVV

const LESSON_A: Lesson = {
  id: 'A',
  title: 'Virtual Card Tokenisation & dCVV Masking',
  subtitle: 'Virtual Cards Gate → Token Vault → dCVV → Ledger',
  graph: 'virtual',
  chapter: 1,
  accent: '#a3e635',
  desks: ['GATE_VIRTUAL', 'SEC_VAULT', 'SEC_DCVV', 'LEDGER_DEBIT'],
  intro: [
    'A virtual card is a stand-in. The 16-digit number the shopper types (the DPAN) means nothing on its own: only the bank’s Token Vault knows which real card, and which account, it points to. That is tokenisation.',
    'Its security code changes every few minutes (a dynamic CVV, or dCVV). A criminal who copies the number and the code gets a few minutes at best. The bank must check that the code is the right one and still fresh, and it must do that before it spends any effort on the ledger.',
  ],
  steps: {
    n_start: {
      title: 'The payment reaches the Virtual Cards Gate',
      what: 'The checkout sends the virtual card number, the code the shopper typed, the amount and a timestamp.',
      why: 'Everything the bank will ever know about this payment is in this one message, so the gate’s only job is to take it in and pass it on.',
    },
    n_vault: {
      title: 'Token Vault: who does this number point to?',
      what: 'The vault looks the virtual number up and returns the real card’s last four digits, whether the token is active, which account funds it (debit or credit) and the code it expects right now.',
      why: 'If the number is not in the vault there is nothing to check against, so the payment is declined here. No other desk is troubled.',
    },
    n_dcvv: {
      title: 'dCVV check: right code, and fresh enough?',
      what: 'Two tests. Does the typed code equal the one the vault expects? And is the gap between when the code was issued and when the payment was made inside the validity window?',
      why: 'A code that is correct but old is the signature of a replay: someone captured it earlier and is using it again.',
    },
    n_xor_dcvv: {
      title: 'Decision: is the dCVV good?',
      what: 'An exclusive choice (XOR). Only a VALID code goes on to the ledger. Anything else, expired or wrong, is declined.',
      why: 'Never ask “is there money?” about a request you already know is bad. It wastes the ledger’s time and can place a hold on a fraudster’s behalf.',
    },
    n_ledger: {
      title: 'Core Ledger: is there money?',
      what: 'The vault told us which account funds the card. A debit card is checked against the available balance; a credit card against the open credit line. If the money is there, the ledger places a hold.',
      why: 'The same check on a different account type goes to a different desk, which is why a virtual card can land on either ledger desk on the map.',
    },
    n_xor_ledger: {
      title: 'Decision: did the ledger say yes?',
      what: 'SUFFICIENT sends the payment to Approved. Anything else is declined for funds.',
      why: 'Notice what is different from the previous decision: this one is about the customer’s money, not about trust. The two kinds of decline are counted separately on the Operations dashboard.',
    },
    n_end_approved: { title: 'Approved', what: 'The hold is in place and the shop is told yes. Tonight this payment joins the clearing file.', why: 'Approval is not the end of the story: the night cycle (Process D) checks that three records agree.' },
    n_end_declined: { title: 'Declined', what: 'The shop is told no, with no hold placed.', why: 'The reason (unknown card, bad code, expired code, no funds) decides whether a good customer was lost to a rule or simply could not pay.' },
  },
  layout: {
    width: 1120,
    height: 400,
    nodes: {
      n_start: { x: 80, y: 170 },
      n_vault: { x: 250, y: 170 },
      n_dcvv: { x: 430, y: 170 },
      n_xor_dcvv: { x: 590, y: 170 },
      n_ledger: { x: 788, y: 170 },
      n_xor_ledger: { x: 920, y: 170 },
      n_end_approved: { x: 1010, y: 70 },
      n_end_declined: { x: 1010, y: 270 },
    },
    synthetic: [],
    syntheticEdges: [],
    routes: {
      e3: { fromSide: 'b', toSide: 'b', via: [[250, 350], [1010, 350]], labelAt: [630, 350] },
      e6: { fromSide: 'b', toSide: 'l', via: [[590, 290]], toDy: -4 },
      e9: { toSide: 'l', toDy: 8 },
    },
    labels: { e3: 'unknown card number', e5: 'valid code', e6: 'expired or wrong', e8: 'funds ok', e9: 'not enough' },
  },
  examples: [
    {
      id: 'fresh',
      label: 'An ordinary purchase',
      story: 'A shopper pays $48.00 with a virtual debit card, using a code that is 12 seconds old. Their account holds $900.',
      kind: 'VIRTUAL',
      payload: virtual(12),
    },
    {
      id: 'slow',
      label: 'A slow typist',
      story: 'The same shopper gets distracted and submits after 83 seconds. The code is right, but old.',
      kind: 'VIRTUAL',
      payload: virtual(83),
      suggestion: { rules: { dcvvWindowSec: 90 }, text: 'Lengthen the window to 90 s and this customer gets through. Then ask who else it lets through.' },
    },
    {
      id: 'replay',
      label: 'A replayed code (fraud)',
      story: 'A criminal captured a number and its code in a data leak and uses them two and a half minutes later.',
      kind: 'VIRTUAL',
      payload: virtual(150, { isFraud: true, amount: 21_000 }),
      suggestion: { rules: { dcvvWindowSec: 150 }, text: 'A very long window waves this fraud straight through. That is the price of kindness to slow typists.' },
    },
    {
      id: 'wrong',
      label: 'A mistyped code',
      story: 'The shopper types 428 instead of 482.',
      kind: 'VIRTUAL',
      payload: virtual(10, {}, '428'),
    },
    {
      id: 'unknown',
      label: 'A number the vault has never seen',
      story: 'Someone guesses virtual card numbers. This one does not exist.',
      kind: 'VIRTUAL',
      payload: virtual(10, { isFraud: true, virtualCard: { dpan: '5120 0000 0000 0001', vaultEntry: null } }),
    },
    {
      id: 'broke',
      label: 'Right code, not enough money',
      story: 'Everything about the card is fine, but the account behind it holds only $20.00.',
      kind: 'VIRTUAL',
      payload: virtual(12, { availableBalance: 2000 }),
    },
  ],
  knobs: ['dcvvWindowSec'],
  focusRows: ['dcvvExpired', 'friction', 'fraudSlipped', 'fraudLoss', 'approvedRate', 'net'],
  takeaways: [
    'Check trust before you check money. A bad code never reaches the ledger.',
    'A validity window is a trade: longer is kinder to slow typists and easier for anyone replaying a stolen code.',
    'The vault answers “which account funds this?”, and that decides which ledger desk does the money check.',
  ],
};

// Process B: 3-D Secure risk engine

const LESSON_B: Lesson = {
  id: 'B',
  title: '3-D Secure 2.x Risk Engine (Frictionless vs Challenge OTP)',
  subtitle: 'E-Commerce Gate → 3DS Risk Desk → (customer’s phone) → Ledger',
  graph: 'ecom',
  chapter: 2,
  accent: '#a78bfa',
  desks: ['GATE_ECOM', 'SEC_3DS', 'LEDGER_DEBIT'],
  intro: [
    'Every online card payment is scored for risk, 0 to 100, from signals like the device, the shipping address and how the customer behaves. 3-D Secure 2 turns that score into one of three treatments.',
    'Frictionless: the score is low enough that nothing is asked of the customer. Challenge: the bank sends a one-time code to the cardholder’s phone, and some customers give up. Reject: the score is so high that the payment is declined outright. Two dials decide where the lines fall, and every position of them is a trade between fraud and lost customers.',
  ],
  steps: {
    n_start: {
      title: 'The payment reaches the E-Commerce Gate',
      what: 'The checkout sends the card, the amount and the risk score the merchant’s device checks produced.',
      why: 'The gate takes the payment in. The risk score is already on it; the bank’s job is to decide what to do about it.',
    },
    n_3ds: {
      title: '3DS Risk Desk: which treatment?',
      what: 'Below the frictionless line: FRICTIONLESS. At or above the reject line: REJECT. In between: CHALLENGE, unless the customer has already completed one, in which case it is CHALLENGE_PASSED (or CHALLENGE_FAILED if they walked away).',
      why: 'Authenticated payments shift the liability for fraud to the card issuer’s side. That is the bank’s reason to want them, and the customer’s reason to dislike the extra step.',
    },
    n_xor_3ds: {
      title: 'Decision: which way now?',
      what: 'An authenticated payment (frictionless or challenge passed) goes to the ledger. A fresh challenge ends this run at “Send to OTP”. Everything else, rejects and failed challenges, is declined.',
      why: 'The diagram has no loop in it. A challenge sends the customer away, and when they come back the same diagram runs again with the answer.',
    },
    n_end_challenge: {
      title: 'Send to OTP',
      what: 'The bank texts a one-time code to the cardholder’s phone and waits.',
      why: 'The customer chooses what happens next: they type the code, or they close the tab. That choice was made before they arrived; the bank never knows which until it sees it.',
    },
    syn_phone: {
      title: 'The customer’s phone',
      what: 'A one-time code arrives by SMS or in the banking app. The customer types it into the checkout page, or closes the page and the sale is gone.',
      why: 'The bank cannot see which will happen. Everything it learns comes back as the payment returns with the challenge marked COMPLETED or ABANDONED.',
    },
    n_ledger: {
      title: 'Core Ledger: is there money?',
      what: 'Debit cards are checked against the available balance, credit cards against the open credit line.',
      why: 'Authentication says the person is probably the cardholder. It says nothing about whether the account can cover the price.',
    },
    n_xor_ledger: { title: 'Decision: did the ledger say yes?', what: 'SUFFICIENT is approved. Anything else is declined for funds.', why: 'Only payments that have passed the risk treatment ever reach this question.' },
    n_end_approved: { title: 'Approved', what: 'The hold is placed and the shop is told yes.', why: 'If this payment was fraud, the bank has just agreed to repay it. That is the cost the risk lines exist to avoid.' },
    n_end_declined: { title: 'Declined', what: 'The shop is told no.', why: 'A decline is only a good outcome if the payment was fraud. For a genuine customer it is a lost sale and a bad experience.' },
  },
  layout: {
    width: 1120,
    height: 420,
    nodes: {
      n_start: { x: 80, y: 150 },
      n_3ds: { x: 260, y: 150 },
      n_xor_3ds: { x: 440, y: 150 },
      n_ledger: { x: 640, y: 80 },
      n_xor_ledger: { x: 810, y: 80 },
      n_end_approved: { x: 1000, y: 50 },
      n_end_declined: { x: 1000, y: 190 },
      n_end_challenge: { x: 640, y: 270 },
    },
    synthetic: [{ id: 'syn_phone', kind: 'phone', x: 360, y: 350, label: 'Customer’s phone', sub: 'one-time code', place: 'CUSTOMER_OTP' }],
    syntheticEdges: [
      { id: 'syn_sent', from: 'n_end_challenge', to: 'syn_phone', label: 'code sent' },
      { id: 'syn_back', from: 'syn_phone', to: 'n_3ds', label: 'code typed: the diagram runs again' },
    ],
    routes: {
      e4: { fromSide: 'b', toSide: 'l', labelAt: [530, 236] },
      e5: { fromSide: 'b', toSide: 'l', via: [[440, 320], [905, 320], [905, 190]], toDy: 8, labelAt: [760, 320] },
      e8: { toSide: 'l', toDy: 8 },
      syn_sent: { fromSide: 'b', toSide: 'r', via: [[640, 350]] },
      syn_back: { fromSide: 'l', toSide: 'b', via: [[260, 350]], labelAt: [260, 262] },
    },
    labels: { e3: 'authenticated', e4: 'needs a challenge', e5: 'rejected, or challenge failed', e7: 'funds ok', e8: 'not enough' },
  },
  examples: [
    {
      id: 'calm',
      label: 'A calm, ordinary payment',
      story: 'A regular customer on their usual phone. Risk score 12.',
      kind: 'ECOM',
      payload: payment({ riskScore: 12 }),
    },
    {
      id: 'borderline',
      label: 'A borderline payment, customer types the code',
      story: 'A new device and a new shipping address. Risk score 52. The cardholder gets the SMS and types it.',
      kind: 'ECOM',
      payload: payment({ riskScore: 52 }),
      otpCompletes: true,
      suggestion: { rules: { frictionlessBelow: 60 }, text: 'Raise the frictionless line to 60 and this customer is never asked. Fewer interruptions, but who else is waved through?' },
    },
    {
      id: 'walkaway',
      label: 'A borderline payment, customer gives up',
      story: 'Same score of 52, but the shopper is on a train, sees the SMS prompt and closes the page.',
      kind: 'ECOM',
      payload: payment({ riskScore: 52 }),
      otpCompletes: false,
      suggestion: { rules: { frictionlessBelow: 60 }, text: 'With the frictionless line at 60 this sale would not have been lost. Check the “Good customers turned away” row.' },
    },
    {
      id: 'stealth',
      label: 'Fraud that looks calm',
      story: 'A criminal with a stolen card and a clean-looking device. Risk score 34: below the frictionless line.',
      kind: 'ECOM',
      payload: payment({ riskScore: 34, isFraud: true, amount: 18_500 }),
      suggestion: { rules: { frictionlessBelow: 30 }, text: 'Lower the frictionless line to 30 and this payment is challenged, which a fraudster with only a card number usually cannot pass.' },
    },
    {
      id: 'ring',
      label: 'Fraud that gets challenged',
      story: 'Risk score 66. The thief has the card number but not the phone.',
      kind: 'ECOM',
      payload: payment({ riskScore: 66, isFraud: true, amount: 21_000 }),
      otpCompletes: false,
    },
    {
      id: 'traveller',
      label: 'A genuine customer who looks risky',
      story: 'A customer travelling abroad on a hotel Wi-Fi. Risk score 74. Nothing is wrong, but it looks wrong.',
      kind: 'ECOM',
      payload: payment({ riskScore: 74 }),
      otpCompletes: true,
      suggestion: { rules: { rejectAtOrAbove: 70 }, text: 'Pull the reject line down to 70 and this genuine customer is refused without even being asked.' },
    },
  ],
  knobs: ['frictionlessBelow', 'rejectAtOrAbove'],
  focusRows: ['fraudSlipped', 'fraudLoss', 'friction', 'challengeRate', 'otpAbandon', 'wait', 'net'],
  takeaways: [
    'Every risk line trades fraud against lost customers. There is no setting that has neither.',
    'A challenge is not free: some good customers walk away, and it adds work at the 3DS desk.',
    'Fraud that scores low is never challenged. The only defence against it is a higher frictionless bar, which costs friction for everyone.',
  ],
};

// Process C: Buy Now Pay Later

const LESSON_C: Lesson = {
  id: 'C',
  title: 'BNPL Pay-in-4 Underwriting & Card Fallback',
  subtitle: 'E-Commerce Gate → Pay-in-4 Desk → Ledger (down payment, or full-price fallback)',
  graph: 'bnpl',
  chapter: 3,
  accent: '#f472b6',
  desks: ['GATE_ECOM', 'BNPL', 'LEDGER_DEBIT', 'LEDGER_CREDIT'],
  intro: [
    'Pay-in-4 lets a shopper pay a quarter of the price now and the rest in three instalments. The bank pays the merchant in full, so it is lending the other three quarters. It earns a fee on each plan and loses money on the customers who never pay.',
    'An underwriter reads the customer’s score and the size of the down payment. If both clear the bar, the plan is offered, and only the first instalment is taken from their card today. If not, the sale is not lost: it falls back to an ordinary card payment of the full price.',
  ],
  steps: {
    n_start: { title: 'The application reaches the E-Commerce Gate', what: 'The checkout sends the basket, the linked card, the customer’s underwriting score and the down payment they chose.', why: 'The gate takes it in; underwriting is the very next stop.' },
    n_bnpl: {
      title: 'Pay-in-4 Desk: can we offer a plan?',
      what: 'Two tests: is the score at or above the minimum, and is the down payment at least the minimum share of the basket? If both pass, the plan is ELIGIBLE and the first instalment is worked out. Nothing is debited yet.',
      why: 'Underwriting comes first so that a customer who cannot be offered a plan is never charged a down payment they did not expect.',
    },
    n_xor_plan: {
      title: 'Decision: plan approved?',
      what: 'ELIGIBLE goes to collect the down payment. Anything else goes to the fallback: pay the full price on the card.',
      why: 'The default branch is what keeps the sale. Without it, an ineligible customer’s cart would simply be lost.',
    },
    n_ledger_dp: {
      title: 'Ledger: collect the down payment',
      what: 'This ledger check is set to debit only the first instalment, a quarter of the basket, from the linked card.',
      why: 'If the card cannot cover even that, the answer is “down payment declined”, not a silent switch to the full price. The customer asked for a plan.',
    },
    n_ledger_card: {
      title: 'Ledger: charge the full price',
      what: 'The same desk, set to check the whole amount. A debit card must hold it; a credit card must have it in open credit.',
      why: 'This is the fallback. It is an ordinary purchase from here on, with ordinary interchange and no bad-debt risk.',
    },
    n_xor_funds: {
      title: 'Decision: did the card cover it?',
      what: 'Four outcomes: plan approved, card fallback approved, down payment declined, or card declined. The wire taken depends on both the ledger’s answer and whether a plan was approved.',
      why: 'The four end states are reported separately so that the bank can see how many plans it wrote and how many sales it kept by falling back.',
    },
    n_end_bnpl: { title: 'Approved: Pay-in-4', what: 'The plan is live. One quarter is collected, three more are due.', why: 'This is the revenue (a merchant fee) and the risk (the unpaid quarters) in one outcome.' },
    n_end_card: { title: 'Approved: card fallback', what: 'The customer pays the full price today.', why: 'The sale is kept without the credit risk.' },
    n_end_dp_declined: { title: 'Declined: down payment', what: 'The plan was approved but the first instalment could not be taken.', why: 'No money moved and no plan exists.' },
    n_end_card_declined: { title: 'Declined: card', what: 'No plan, and the card could not cover the full price either.', why: 'The sale is lost.' },
  },
  layout: {
    width: 1160,
    height: 380,
    nodes: {
      n_start: { x: 80, y: 190 },
      n_bnpl: { x: 250, y: 190 },
      n_xor_plan: { x: 420, y: 190 },
      n_ledger_dp: { x: 600, y: 100 },
      n_ledger_card: { x: 600, y: 290 },
      n_xor_funds: { x: 790, y: 190 },
      n_end_bnpl: { x: 1040, y: 50 },
      n_end_card: { x: 1040, y: 150 },
      n_end_dp_declined: { x: 1040, y: 245 },
      n_end_card_declined: { x: 1040, y: 335 },
    },
    synthetic: [],
    syntheticEdges: [],
    routes: {
      e3: { fromSide: 't', toSide: 'l', labelAt: [440, 118] },
      e4: { fromSide: 'b', toSide: 'l', labelAt: [440, 270] },
    },
    labels: { e3: 'plan approved', e4: 'fall back to card', e7: 'plan + funds', e8: 'funds (no plan)', e9: 'plan, no funds', e10: 'no funds' },
  },
  examples: [
    {
      id: 'strong',
      label: 'A strong application',
      story: 'Score 710, $240 basket, 25% down. The linked debit card holds $900.',
      kind: 'BNPL',
      payload: bnpl(710, 25),
      suggestion: { rules: { bnplMinScore: 720 }, text: 'Raise the minimum score to 720 and even this good customer falls back to paying in full.' },
    },
    {
      id: 'weak',
      label: 'A weak score',
      story: 'Score 570. The customer would be a plan the bank would probably regret.',
      kind: 'BNPL',
      payload: bnpl(570, 25),
      suggestion: { rules: { bnplMinScore: 560 }, text: 'Drop the minimum to 560 and this plan is written. Watch the “Expected Pay-in-4 bad debt” row.' },
    },
    {
      id: 'lowdown',
      label: 'A down payment that is too small',
      story: 'Score 700, but the customer chose to put down only 20%.',
      kind: 'BNPL',
      payload: bnpl(700, 20),
      suggestion: { rules: { bnplMinDownPct: 20 }, text: 'Lower the minimum down payment to 20% and this plan goes ahead.' },
    },
    {
      id: 'dpfail',
      label: 'Approved, but the card cannot pay the first instalment',
      story: 'Score 710, but the linked card holds only $30 and the down payment is $60.',
      kind: 'BNPL',
      payload: bnpl(710, 25, { availableBalance: 3000 }),
    },
    {
      id: 'bothfail',
      label: 'No plan, and the card cannot pay in full',
      story: 'Score 540 and a card holding $100 against a $240 basket.',
      kind: 'BNPL',
      payload: bnpl(540, 25, { availableBalance: 10_000 }),
    },
  ],
  knobs: ['bnplMinScore', 'bnplMinDownPct'],
  focusRows: ['bnplPlans', 'bnplLoss', 'approvedRate', 'approvedCents', 'net'],
  takeaways: [
    'Underwrite first, charge second. Nobody pays a down payment for a plan they were not offered.',
    'A decline from underwriting is not a lost sale: the default branch falls back to the full price.',
    'A lower score line writes more plans and more bad debt. The break-even is where the fee covers the expected loss.',
  ],
};

// Process D: end-of-day reconciliation

const LESSON_D: Lesson = {
  id: 'D',
  title: 'EOD 3-Way Reconciliation & Suspense Accounting',
  subtitle: 'Batch Clearing → Visa Settlement → 3-Way Reconciliation → Suspense Account',
  graph: 'settle',
  chapter: 4,
  accent: '#fbbf24',
  desks: ['EOD_BATCH', 'EOD_VISA', 'RECON', 'SUSPENSE'],
  intro: [
    'Approving a payment during the day only promises money. Overnight, three independent records of that payment have to agree: the bank’s own ledger, the card scheme’s clearing file (what Visa was asked to settle) and the acquirer’s settlement report (what the merchant’s bank says it received).',
    'Most records agree to the cent. Some differ by rounding dust. A few are real mistakes: a wrong amount, a missing record, a payment presented twice. A real break must never be dropped or forced to match. It is parked in the suspense account until someone works out what happened.',
  ],
  steps: {
    syn_batch: { title: 'Batch Clearing (23:00)', what: 'Every payment approved today is gathered into the clearing file.', why: 'One file a night is how banks hand over thousands of payments at once.' },
    syn_visa: { title: 'Visa Settlement', what: 'The clearing file goes to the card scheme, which sends back its own record of what it will settle.', why: 'This is the second of the three records. It is the scheme’s version, not the bank’s.' },
    n_start: { title: 'The record reaches the reconciliation desk', what: 'The record carries the three amounts: ledger, scheme clearing and acquirer report.', why: 'From here on the question is only whether they agree.' },
    n_recon: {
      title: '3-Way Reconciliation: do the records agree?',
      what: 'The desk takes the largest and smallest of the three amounts. If a leg is missing, it is a missing-leg break. If the scheme presented the payment twice, it is a duplicate. If the gap is within the tolerance, it is a match; otherwise an amount break.',
      why: 'The tolerance exists because real systems round differently. It is the most dangerous dial in the bank: too tight and dust becomes work; too loose and real errors are matched away.',
    },
    n_xor_recon: { title: 'Decision: matched?', what: 'A match is settled. Each kind of break goes down its own wire, with its own reason code.', why: 'Keeping the three kinds of break apart tells the person who investigates it where to start looking.' },
    n_end_settled: { title: 'Settled', what: 'The records agree. The payment is done.', why: 'This is the outcome nearly every record should have.' },
    n_end_amount: { title: 'Suspense: amount variance', what: 'The legs differ by more than the tolerance.', why: 'Only the variance is parked, not the whole payment: the rest agreed.' },
    n_end_missing: { title: 'Suspense: missing leg', what: 'One of the three records does not exist.', why: 'With a leg missing there is nothing to compare, so the whole amount is parked.' },
    n_end_dup: { title: 'Suspense: duplicate', what: 'The scheme presented the same payment twice.', why: 'Settling both would pay the merchant twice. The whole amount is parked until the duplicate is reversed.' },
    syn_suspense: { title: 'Suspense account', what: 'A holding account. Every item sits here until an ops clerk, working only in business hours, finds the cause and clears it.', why: 'Money that is not explained must not be forgotten. A suspense balance that keeps growing is a warning that the night’s rules are wrong or the day team is overloaded.' },
    syn_cleared: { title: 'Cleared', what: 'The clerk found the cause and posted the correction.', why: 'Each cleared item costs a person’s time, which is why false breaks are expensive.' },
  },
  layout: {
    width: 1120,
    height: 400,
    nodes: {
      n_start: { x: 355, y: 190 },
      n_recon: { x: 510, y: 190 },
      n_xor_recon: { x: 650, y: 190 },
      n_end_settled: { x: 835, y: 60 },
      n_end_amount: { x: 835, y: 150 },
      n_end_missing: { x: 835, y: 240 },
      n_end_dup: { x: 835, y: 330 },
    },
    synthetic: [
      { id: 'syn_batch', kind: 'system', x: 80, y: 190, label: 'Batch clearing', sub: '23:00', place: 'EOD_BATCH' },
      { id: 'syn_visa', kind: 'system', x: 225, y: 190, label: 'Visa settlement', sub: 'scheme file', place: 'EOD_VISA' },
      { id: 'syn_suspense', kind: 'account', x: 1030, y: 240, label: 'Suspense account', sub: 'until cleared', place: 'SUSPENSE' },
      { id: 'syn_cleared', kind: 'end', x: 1030, y: 345, label: 'Cleared', place: 'OUT_SETTLED' },
    ],
    syntheticEdges: [
      { id: 'syn_b2v', from: 'syn_batch', to: 'syn_visa' },
      { id: 'syn_v2s', from: 'syn_visa', to: 'n_start' },
      { id: 'syn_a2s', from: 'n_end_amount', to: 'syn_suspense' },
      { id: 'syn_m2s', from: 'n_end_missing', to: 'syn_suspense' },
      { id: 'syn_d2s', from: 'n_end_dup', to: 'syn_suspense' },
      { id: 'syn_s2c', from: 'syn_suspense', to: 'syn_cleared', label: 'next working day' },
    ],
    routes: {
      syn_a2s: { toSide: 'l', toDy: -14 },
      syn_m2s: { toSide: 'l', toDy: 0 },
      syn_d2s: { toSide: 'l', toDy: 14 },
      syn_s2c: { fromSide: 'b', toSide: 't' },
    },
    labels: { e3: 'matched', e4: 'amount differs', e5: 'a leg is missing', e6: 'presented twice' },
  },
  examples: [
    {
      id: 'clean',
      label: 'Three records that agree',
      story: 'A $125.00 payment. The ledger, the scheme and the acquirer all say $125.00.',
      kind: 'SETTLEMENT',
      payload: settlement([12_500, 12_500, 12_500]),
    },
    {
      id: 'dust',
      label: 'Rounding dust',
      story: 'The scheme converted a foreign amount and rounded to $125.04. A 4¢ difference that is nobody’s mistake.',
      kind: 'SETTLEMENT',
      payload: settlement([12_500, 12_504, 12_500]),
      suggestion: { rules: { reconToleranceCents: 0 }, text: 'Set the tolerance to 0 and this harmless difference becomes a break. Multiply that by hundreds of records.' },
    },
    {
      id: 'variance',
      label: 'A real amount error',
      story: 'The scheme file says $133.20. Somebody keyed the wrong amount. A real $8.20 error.',
      kind: 'SETTLEMENT',
      realError: true,
      payload: settlement([12_500, 13_320, 12_500]),
      suggestion: { rules: { reconToleranceCents: 1000 }, text: 'Open the tolerance to $10 and this genuine error is matched away. No one will ever look at it.' },
    },
    {
      id: 'missing',
      label: 'A record is missing',
      story: 'The acquirer’s report never mentioned this payment.',
      kind: 'SETTLEMENT',
      realError: true,
      payload: settlement([12_500, 12_500, null]),
    },
    {
      id: 'duplicate',
      label: 'Presented twice',
      story: 'The scheme file listed this payment twice.',
      kind: 'SETTLEMENT',
      realError: true,
      payload: settlement([12_500, 12_500, 12_500], 2),
    },
  ],
  knobs: ['reconToleranceCents'],
  focusRows: ['falseBreaks', 'leakedCount', 'leakage', 'suspense', 'reconBacklog', 'net'],
  takeaways: [
    'Never drop a break and never force it to match: park it in suspense with a reason.',
    'The tolerance is the line between rounding dust and a real error. Too tight floods the suspense account and overruns the night team. Too loose hides mistakes.',
    'The suspense account is cleared by people, in business hours. Its balance is a measure of how well the night’s rules fit the data.',
  ],
};

export const LESSONS: Record<ProcessId, Lesson> = { A: LESSON_A, B: LESSON_B, C: LESSON_C, D: LESSON_D, E: LESSON_E, F: LESSON_F };

/** The chapters in course order. */
export const LESSON_LIST: readonly Lesson[] = [LESSON_A, LESSON_B, LESSON_C, LESSON_D, LESSON_E, LESSON_F];

export const exampleOf = (lesson: Lesson, exampleId: string): LessonExample | undefined => lesson.examples.find((e) => e.id === exampleId);

/** The diagram an example is walked through: its own, else the lesson's. */
export const graphKeyOf = (lesson: Lesson, example: LessonExample | undefined): GraphKey => example?.graph ?? lesson.graph;

/** How a diagram of the lesson is laid out on the page. */
export const layoutFor = (lesson: Lesson, graph: GraphKey): LessonLayout => lesson.layouts?.[graph] ?? lesson.layout;

/** The words for one box of one diagram of the lesson. */
export function stepTextFor(lesson: Lesson, graph: GraphKey, nodeId: string): StepText | undefined {
  return (graph === lesson.graph ? undefined : lesson.steps[`${graph}:${nodeId}`]) ?? lesson.steps[nodeId];
}

/** The short name of each process, for buttons. */
export const PROCESS_SHORT: Record<ProcessId, string> = {
  A: 'Virtual Card & dCVV',
  B: '3DS Risk Engine',
  C: 'BNPL Pay-in-4',
  D: 'EOD Reconciliation',
  E: 'Instant A2A Transfers',
  F: 'AML & Chargebacks',
};
