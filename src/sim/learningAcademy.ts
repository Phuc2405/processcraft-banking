/** Academy chapters 5 and 6. */

import { ACADEMY_LEVELS } from '../data/academyLevels';
import type { A2aContext, BankingPayload } from '../types/processLearning';
import type { Lesson, LessonExample } from './learning';

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

// Chapter 5: instant account-to-account transfers

/** A pacs.008 credit transfer from the customer's banking app. `message` overrides the fields of the message. */
const transfer = (amount: number, message: Partial<A2aContext> = {}, funds = amount * 4, over: Partial<BankingPayload> = {}): BankingPayload =>
  payment({
    amount,
    channel: 'IN_APP',
    cardType: 'DEBIT',
    rawCvv: '',
    riskScore: 6,
    availableBalance: funds,
    a2a: {
      endToEndId: 'QR-0412-882913',
      debtorAgent: 'NOVAAU2S',
      creditorAgent: 'HRBRAU3MXXX',
      interbankSettlementAmount: amount,
      currency: 'AUD',
      purposeCode: 'OTHR',
      queueDepth: 12,
      liquidityAvailableMinor: 90_000_000,
      ...message,
    },
    ...over,
  });

export const LESSON_E: Lesson = {
  id: 'E',
  title: 'Instant Account-to-Account Transfers (A2A & pacs.008)',
  subtitle: 'A2A Transfer Gate → Debit CASA ledger → Released',
  graph: 'a2a',
  chapter: 5,
  accent: '#22d3ee',
  desks: ['GATE_A2A', 'LEDGER_DEBIT'],
  intro: [
    'An instant transfer moves money from one bank account straight to another, in seconds, with no card in between. The customer’s banking app sends the bank a message in the ISO 20022 format, a pacs.008 “customer credit transfer”, and the money is gone from the account the moment the bank agrees.',
    'That makes the front door strict. A card payment that goes wrong can be disputed afterwards; an instant transfer that goes wrong cannot be called back. So the A2A gate reads the message field by field before the money is touched, and only a well-formed message ever reaches the ledger.',
  ],
  steps: {
    n_start: {
      title: 'The transfer reaches the A2A Gate',
      what: 'The customer’s banking app sends a pacs.008 message. It carries a reference the sender chose (the EndToEndId), the sending bank and the receiving bank (each a BIC code), the amount and the currency.',
      why: 'Everything the bank will do with this transfer is read from this one message, so the first job is to take it in whole.',
    },
    n_gateway: {
      title: 'A2A Gateway: is the message well formed?',
      what: 'The gateway checks the message field by field. The EndToEndId must be there and no longer than 35 characters. Both bank codes must be 8 or 11 characters. The amount the banks will settle must equal the amount the customer asked to send.',
      why: 'A message that fails any check cannot be traced, routed or settled. Refusing it at the door costs nothing; finding the flaw after the money has moved costs a lot.',
    },
    n_xor_valid: {
      title: 'Decision: is the message valid?',
      what: 'An exclusive choice (XOR). A message with any flaw is rejected on the spot. A clean one goes on to the ledger.',
      why: 'The valid check comes before the money check, for the same reason trust comes before money on a card: never look at an account on behalf of a request you already know is bad.',
    },
    n_ledger: {
      title: 'Core Ledger: is there money?',
      what: 'The transfer comes out of the customer’s everyday account, so the debit ledger checks the available balance. If the money is there it is set aside at once.',
      why: 'There is no “hold and settle later” with an instant transfer: setting the money aside is the debit.',
    },
    n_xor_funds: {
      title: 'Decision: did the ledger say yes?',
      what: 'SUFFICIENT releases the transfer. Anything else declines it for funds.',
      why: 'A decline for funds is not a fraud signal. It is counted separately from a rejected message, because the fix for each is different.',
    },
    n_end_approved: {
      title: 'Released',
      what: 'The money leaves the account and the receiving bank is told yes. The bank earns a small fee on the transfer.',
      why: 'Instant means final. This is why a fraudulent transfer is so costly: there is no night cycle to catch it before the money is gone.',
    },
    n_end_invalid: {
      title: 'Rejected: invalid message',
      what: 'The sending app is told the message was refused, with the name of the field at fault. No money was touched.',
      why: 'The reason is specific on purpose. “Invalid” alone sends a developer hunting; “EndToEndId is missing” sends them to one line of code.',
    },
    n_end_declined: {
      title: 'Declined',
      what: 'The customer is told there is not enough money. The message was fine, so nothing is wrong with the app.',
      why: 'The customer’s balance is not the bank’s fault, and nothing the bank’s rules could change.',
    },
  },
  layout: {
    width: 1120,
    height: 380,
    nodes: {
      n_start: { x: 76, y: 190 },
      n_gateway: { x: 250, y: 190 },
      n_xor_valid: { x: 430, y: 190 },
      n_ledger: { x: 630, y: 190 },
      n_xor_funds: { x: 810, y: 190 },
      n_end_invalid: { x: 630, y: 62 },
      n_end_approved: { x: 1000, y: 110 },
      n_end_declined: { x: 1000, y: 280 },
    },
    synthetic: [],
    syntheticEdges: [],
    routes: {
      e3: { fromSide: 't', toSide: 'l', labelAt: [452, 96] },
      e5: {},
      e7: { toSide: 'l', toDy: 0 },
    },
    labels: { e3: 'message has a flaw', e4: 'well formed', e6: 'funds ok', e7: 'not enough' },
  },
  examples: [
    {
      id: 'split',
      label: 'A QR bill split',
      story: 'Mia scans a QR code at dinner and sends her $18.50 share to a friend at another bank. Her account holds $640.00.',
      kind: 'A2A',
      payload: transfer(1850, { endToEndId: 'QR-0412-882913' }, 64_000),
    },
    {
      id: 'rent',
      label: 'The apartment rent',
      story: 'On the first of the month, Tom sends $850.00 of rent to his landlord’s bank. His account holds $3,200.00.',
      kind: 'A2A',
      payload: transfer(85_000, { endToEndId: 'RENT-OCT-0007', creditorAgent: 'WSTPAU2S' }, 320_000),
    },
    {
      id: 'noref',
      label: 'A message with no reference',
      story: 'A bug in a partner app sends the transfer without an EndToEndId. The customer’s account is fine.',
      kind: 'A2A',
      payload: transfer(4200, { endToEndId: '' }, 100_000),
    },
    {
      id: 'shortbic',
      label: 'A cut-off bank code',
      story: 'The receiving bank’s code arrives as “HRBR”, four characters, when a BIC has eight or eleven.',
      kind: 'A2A',
      payload: transfer(4200, { creditorAgent: 'HRBR' }, 100_000),
    },
    {
      id: 'mismatch',
      label: 'Amounts that disagree',
      story: 'The customer asked to send $42.00, but the message says the banks will settle $37.00.',
      kind: 'A2A',
      payload: transfer(4200, { interbankSettlementAmount: 3700 }, 100_000),
    },
    {
      id: 'broke',
      label: 'A perfect message, not enough money',
      story: 'Everything about the message is right, but the account holds $60.00 and the rent is $850.00.',
      kind: 'A2A',
      payload: transfer(85_000, { endToEndId: 'RENT-OCT-0008' }, 6000),
    },
  ],
  knobs: [],
  focusRows: ['a2aReleased', 'approvedRate', 'net'],
  takeaways: [
    'Check the message before you check the money. A flawed pacs.008 is refused at the door.',
    'Instant means final: the same transfer that is convenient for a customer is irreversible for a victim of fraud.',
    'Reject reasons name the field at fault, so the sender can fix the right thing.',
  ],
};

// Chapter 6: AML screening and chargeback disputes

/** One of the Build Lab's own test payloads, so the Academy and the Lab never disagree about an example. */
function caseFrom(levelNumber: 9 | 10, testId: string): BankingPayload {
  const found = ACADEMY_LEVELS.find((l) => l.levelNumber === levelNumber)?.testSuite.find((t) => t.id === testId);
  if (!found) throw new Error(`Academy case ${testId} is missing`);
  return structuredClone(found.inputPayload);
}

const aml = (id: string, label: string, story: string, testId: string): LessonExample => ({ id, label: `AML: ${label}`, story, kind: 'AML', graph: 'aml', payload: caseFrom(9, testId) });
const dispute = (id: string, label: string, story: string, testId: string): LessonExample => ({ id, label: `Dispute: ${label}`, story, kind: 'DISPUTE', graph: 'dispute', payload: caseFrom(10, testId) });

export const LESSON_F: Lesson = {
  id: 'F',
  title: 'AML Screening & Chargeback Dispute Resolution',
  subtitle: 'Fraud & Identity Desk (AML screening, case investigation) → Night Desk (chargeback disputes)',
  graph: 'aml',
  chapter: 6,
  accent: '#fb7185',
  desks: ['SEC_3DS', 'RECON'],
  intro: [
    'Two things can go wrong long after a payment looks fine. The first is who the money is for: a bank is bound by law to screen its customers against sanctions lists and lists of politically exposed people, and to notice cash deposits split into pieces just under the reporting line. That is anti-money-laundering (AML) screening. A name that matches is a lead, not a verdict: screening is fuzzy, so a long-standing customer can look like a sanctioned stranger with a similar name.',
    'The second is what happens when a cardholder says “that was not me” or “it never arrived”. The card schemes run disputes as a four-stage cycle: a retrieval request, a first chargeback, the merchant’s representment, and pre-arbitration. A filing window limits how long a claim can be brought, and one rule decides who pays for fraud: if the purchase was authenticated with 3-D Secure, the liability has shifted to the issuer. In this bank the screening and the 3DS check are done at the fraud and identity desk, and the dispute desk sits with the night team.',
  ],
  steps: {
    // ── Part one: AML ──
    n_start: {
      title: 'An outward payment is about to leave',
      what: 'A customer is sending $25,000.00 out of the bank. Before it goes, the bank looks at who is sending it. The payment arrives with a profile of the customer, the watchlists to compare them with, their recent cash deposits and the audit log of what the bank has verified about them.',
      why: 'A payment is released only once the bank is satisfied about the person behind it, and the check has to happen before the money leaves.',
    },
    n_aml: {
      title: 'AML Screening: any name hit, any structuring?',
      what: 'The screening engine compares the customer’s name with every name on the sanctions (OFAC) and politically-exposed-person lists and keeps the best score. A score at or above the threshold is a hit. It also looks at the recent cash deposits for several that sit just under the reporting line.',
      why: 'Name matching is fuzzy on purpose: it must catch “Volkanoff” when the list says “Volkanov”. The price is that it also flags innocent people with similar names.',
    },
    n_xor_hit: {
      title: 'Decision: is there a name hit?',
      what: 'A name hit goes to investigation. With no name hit but a structuring pattern, the bank files a report. With neither, the payment is released.',
      why: 'Only real leads are investigated. An investigation costs an analyst’s time and keeps the customer waiting, so a clean customer must never be sent to one.',
    },
    n_case: {
      title: 'Case Investigation: is it really the same person?',
      what: 'The analyst opens the customer’s audit log and compares the date of birth and nationality the bank verified (from a passport or a scanned licence) with those of the person on the list.',
      why: 'The verdict rests on evidence the bank checked itself, not on the name. Without any verified identity check the honest answer is “inconclusive”, not “guilty”.',
    },
    n_xor_verdict: {
      title: 'Decision: what did the investigation find?',
      what: 'A false positive is released. A true match on a sanctions list is blocked. A true match on a PEP list asks for the source of the funds. Anything else is escalated.',
      why: 'Three different verdicts need three different responses. Treating them all as “block” loses good customers; treating them all as “release” breaks the law.',
    },
    n_end_released: { title: 'Payment released', what: 'No name hit and no structuring. The payment goes on to the ledger.', why: 'Most payments end here. The best screening is the kind a clean customer never notices.' },
    n_end_cleared: { title: 'Cleared: false positive', what: 'The name was a near-miss, and the audit log proves it is a different person. The payment is released and the audit trail keeps the reason.', why: 'This is the outcome that keeps a VIP customer. Freezing them would have been a mistake and a headline.' },
    n_end_sar: { title: 'Report: structuring', what: 'The deposits were split to stay under the reporting line. The payment is parked and a suspicious activity report is filed.', why: 'Structuring is a crime in itself, even when each deposit is small and the money is clean.' },
    n_end_sanctions: { title: 'Blocked: sanctions', what: 'The investigation matched the customer to a sanctioned person. The payment is refused.', why: 'Dealing with a sanctioned person is illegal. This is the one outcome that must never be missed.' },
    n_end_edd: { title: 'Ask: source of funds', what: 'A politically exposed person is not forbidden, only risky. The bank asks where the money comes from before it goes.', why: 'Enhanced due diligence is how a bank manages a high-risk customer it is allowed to serve.' },
    n_end_escalate: { title: 'Escalate: enhanced due diligence', what: 'The log has nothing to prove or rule out a match. A senior analyst takes over and the payment waits.', why: 'When evidence runs out, the safe answer is to ask for more, not to guess.' },

    // ── Part two: the dispute ──
    'dispute:n_start': {
      title: 'A cardholder disputes a charge',
      what: 'The cardholder tells the bank that a purchase was not theirs, or never arrived, or was charged twice. The claim arrives with where it stands in the dispute cycle, the reason, how many days ago the purchase was, and how strong the merchant’s answer is.',
      why: 'Every claim starts with facts, and two of them decide most outcomes: whether it is still in time, and whether the purchase was authenticated.',
    },
    n_3ds: {
      title: '3DS Risk Evaluator: was the purchase authenticated?',
      what: 'The dispute desk cannot see how the purchase was approved. The 3DS evaluator re-reads the original purchase, and if it was frictionless or the customer completed the challenge, it marks it authenticated.',
      why: 'Run this first. If the evaluator has not run, the desk cannot see the authentication and treats every purchase as not authenticated.',
    },
    n_desk: {
      title: 'Dispute & Chargeback Desk: what comes next?',
      what: 'The desk knows the stages and the filing window. It works out whether the window is open, who is liable if the claim is for fraud, and what the next move in the cycle is.',
      why: 'These three facts decide everything that follows, and none of them can be read off the payment alone.',
    },
    n_xor_gate: {
      title: 'Decision: can the claim go ahead?',
      what: 'An expired window ends the claim. An authenticated fraud purchase ends it too, with the bank absorbing the loss. Anything else carries on to the stage.',
      why: 'The window is checked before the liability: a claim that is out of time is dead whoever would have paid.',
    },
    n_xor_stage: {
      title: 'Decision: which stage is this?',
      what: 'A new claim asks the merchant for the receipt. A retrieval with no answer becomes a first chargeback. A merchant who fights back moves it to representment. Anything later is decided at the next decision.',
      why: 'A decision has only four exits and a dispute has eight outcomes, so the diagram chains two decisions to cover them all.',
    },
    n_xor_result: {
      title: 'Decision: who wins?',
      what: 'Pre-arbitration escalates a case the bank does not accept. A resolved case ends with the cardholder refunded or with the merchant winning.',
      why: 'The last decision settles who bears the loss, and that is what the bank will book.',
    },
    n_end_retrieval: { title: 'Ask the merchant for the receipt', what: 'A new claim starts with a request for the paperwork. Nobody is out of pocket yet.', why: 'Most disputes end here, when the merchant proves delivery.' },
    n_end_filed: { title: 'First chargeback filed', what: 'The merchant sent nothing, so the bank takes the money back and credits the cardholder at once.', why: 'The cardholder is made whole first. Who ends up paying is decided in the next stages.' },
    n_end_represent: { title: 'Representment under review', what: 'The merchant has answered with evidence, and the bank must decide whether it is good enough.', why: 'A weak answer can still be an answer, and it moves the case forward.' },
    n_end_prearb: { title: 'Escalated to pre-arbitration', what: 'The bank does not accept the merchant’s answer. It escalates before the scheme itself has to rule.', why: 'Arbitration is costly for everyone, so pre-arbitration is the last chance to settle.' },
    n_end_refunded: { title: 'Cardholder refunded', what: 'The cardholder keeps the credit. The loss falls on the merchant.', why: 'The merchant gave no answer, or none good enough.' },
    n_end_absorbed: { title: 'Issuer absorbs the loss', what: 'The purchase was authenticated, so the merchant did everything the scheme asks. The bank refunds the cardholder and takes the loss itself.', why: 'This is the liability shift in action, and the reason a bank is wary of a frictionless approval on a risky purchase.' },
    n_end_merchant: { title: 'Merchant won', what: 'The evidence was compelling. The provisional credit is taken back from the cardholder.', why: 'A chargeback is not automatic. A merchant with proof of delivery keeps the sale.' },
    n_end_barred: { title: 'Time-barred', what: 'The claim was brought after the filing window closed. It is refused, whoever would have paid.', why: 'The window protects merchants from claims that can never be checked. It applies to bringing a claim, not to a case that was filed in time.' },
  },
  layout: {
    width: 1160,
    height: 450,
    nodes: {
      n_start: { x: 66, y: 200 },
      n_aml: { x: 230, y: 200 },
      n_xor_hit: { x: 410, y: 200 },
      n_case: { x: 590, y: 105 },
      n_xor_verdict: { x: 770, y: 105 },
      n_end_cleared: { x: 990, y: 28 },
      n_end_sanctions: { x: 990, y: 92 },
      n_end_edd: { x: 990, y: 156 },
      n_end_escalate: { x: 990, y: 220 },
      n_end_sar: { x: 590, y: 318 },
      n_end_released: { x: 590, y: 396 },
    },
    synthetic: [],
    syntheticEdges: [],
    routes: {
      e3: { fromSide: 't', toSide: 'l', labelAt: [425, 112] },
      e4: { fromSide: 'b', toSide: 'l', fromDx: -8, labelAt: [388, 300] },
      e5: { fromSide: 'b', toSide: 'l', fromDx: 8, labelAt: [440, 388] },
      e7: { fromSide: 't', toSide: 'l' },
      e8: { fromSide: 'r', toSide: 'l', fromDy: -6 },
      e9: { fromSide: 'r', toSide: 'l', fromDy: 6 },
      e10: { fromSide: 'b', toSide: 'l' },
    },
    labels: { e3: 'name hit', e4: 'structuring', e5: 'clean', e7: 'false positive', e8: 'sanctions match', e9: 'PEP match', e10: 'inconclusive' },
  },
  layouts: {
    dispute: {
      width: 1160,
      height: 470,
      nodes: {
        n_start: { x: 60, y: 220 },
        n_3ds: { x: 220, y: 220 },
        n_desk: { x: 410, y: 220 },
        n_xor_gate: { x: 570, y: 220 },
        n_end_barred: { x: 690, y: 36 },
        n_end_absorbed: { x: 690, y: 100 },
        n_xor_stage: { x: 720, y: 220 },
        n_end_retrieval: { x: 960, y: 128 },
        n_end_filed: { x: 960, y: 190 },
        n_end_represent: { x: 960, y: 252 },
        n_xor_result: { x: 720, y: 350 },
        n_end_prearb: { x: 960, y: 322 },
        n_end_refunded: { x: 960, y: 384 },
        n_end_merchant: { x: 960, y: 440 },
      },
      synthetic: [],
      syntheticEdges: [],
      routes: {
        e4: { fromSide: 't', toSide: 'l', fromDx: -6, labelAt: [575, 36] },
        e5: { fromSide: 't', toSide: 'l', fromDx: 6, labelAt: [566, 120] },
        e7: { fromSide: 't', toSide: 'l' },
        e8: { fromSide: 'r', toSide: 'l', fromDy: -6 },
        e9: { fromSide: 'r', toSide: 'l', fromDy: 6 },
        e10: { fromSide: 'b', toSide: 't' },
        e11: { fromSide: 'r', toSide: 'l', fromDy: -6 },
        e12: { fromSide: 'r', toSide: 'l', fromDy: 6 },
        e13: { fromSide: 'b', toSide: 'l' },
      },
      labels: {
        e4: 'window has closed',
        e5: 'authenticated: issuer pays',
        e7: 'new claim',
        e8: 'merchant silent',
        e9: 'merchant fights back',
        e11: 'bank rejects the answer',
        e12: 'cardholder wins',
        e13: 'merchant wins',
      },
    },
  },
  examples: [
    aml('clear', 'an ordinary customer', 'Linh Tran sends $25,000.00. No name on any list resembles hers, and her cash deposits are ordinary.', 'L9-T01'),
    aml('structuring', 'deposits just under the line', 'Four cash deposits of $9,000.00 to $9,800.00 in three days, each just under the $10,000.00 reporting line. No name on any list.', 'L9-T03'),
    aml('vip', 'a VIP who only sounds like a sanctioned man', 'Dmitri Volkanoff, a long-standing Australian client born in 1974, scores very close to the sanctioned Dmitri Volkanov, born in Russia in 1962. His passport was checked in branch.', 'L9-T04'),
    aml('sanctions', 'a true sanctions match', 'Same name, same date of birth, same nationality, verified from a passport.', 'L9-T05'),
    aml('inconclusive', 'the same name, but nothing to compare', 'A customer with the sanctioned name but no identity check on file, so there is nothing to prove or rule out a match.', 'L9-T06'),
    aml('pep', 'a politically exposed person', 'Helena Marques Duarte, on the PEP list, with the same date of birth and nationality, checked from her passport.', 'L9-T07'),
    dispute('new', 'a new claim', 'The cardholder says a $189.00 order never arrived. Nobody has acted on the claim yet, 25 days after the purchase.', 'L10-T01'),
    dispute('silent', 'the merchant sent nothing', 'The bank asked for the receipt. The merchant has sent nothing back.', 'L10-T02'),
    dispute('proof', 'the merchant proves delivery', 'The merchant answers the receipt request with a signed proof of delivery.', 'L10-T03'),
    dispute('fight', 'the merchant fights back', 'After the first chargeback, the merchant sends a weak answer. It is still an answer.', 'L10-T05'),
    dispute('shift', 'fraud on an authenticated purchase', 'The cardholder says a frictionless purchase was fraud. The purchase was authenticated with 3-D Secure.', 'L10-T09'),
    dispute('late', 'too late', 'The cardholder brings a claim 150 days after the purchase, long after the window closed.', 'L10-T12'),
  ],
  knobs: [],
  focusRows: ['suspense', 'net'],
  takeaways: [
    'A screening hit is a lead, not a verdict. Investigate real leads, and only those, using evidence the bank verified itself.',
    'Sanctions, politically exposed people, structuring and inconclusive cases each get a different response.',
    'A dispute is a cycle with a clock: check the window first, then who is liable, then the stage.',
    'Authenticating a purchase with 3-D Secure shifts the fraud liability to the issuer.',
  ],
};
