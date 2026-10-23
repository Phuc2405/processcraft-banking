/**
 * The Academy's study material: a glossary (the same entries are the flashcards) and a short quiz for every chapter.
 * Pure data and pure functions, shared by the store, the panel and the tests. The tracks that group these concepts live in
 * academyCatalog.ts; a track names its concepts by the `id` used here.
 */

import type { ChapterId } from './academyCatalog';
import { activeLocale, type Locale } from '../i18n/locale';
import { GLOSSARY_VI, QUIZ_VI } from '../i18n/academyVi';

export interface GlossaryEntry {
  /** Stable id, also what a track lists as one of its concepts. */
  id: string;
  chapter: ChapterId;
  term: string;
  /** One to three plain sentences. */
  definition: string;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  // Chapter 1: First Swipes
  { id: 'card-types', chapter: 1, term: 'Credit, debit and prepaid cards', definition: 'A credit card spends the bank’s money up to a limit and is repaid later. A debit card spends your own money from a CASA account straight away. A prepaid card spends only the amount loaded onto it beforehand.' },
  { id: 'casa', chapter: 1, term: 'CASA account', definition: 'Current Account and Savings Account. The current side holds day-to-day money in and out; the savings side earns interest. A debit card draws on it, and an approved payment first places a hold on the amount.' },
  { id: 'overdraft', chapter: 1, term: 'Overdraft facility', definition: 'An agreed limit that lets a current account go below zero, for a fee or interest. The available balance is the balance plus the unused limit, less any holds.' },
  { id: 'stations', chapter: 1, term: 'POS, CDM and CRM', definition: 'POS is the point-of-sale terminal where a shop takes a card. A CDM (cash deposit machine) only takes notes in. A CRM (cash recycling machine) takes notes in and pays the same notes out to the next customer.' },
  { id: 'iso-response-codes', chapter: 1, term: 'ISO response codes 00, 51, 05', definition: 'The answer the bank sends back in field 39 of an ISO 8583 message. 00 is approved, 51 is insufficient funds, and 05 is “do not honour”, a general decline by the issuer, for example on risk.' },

  // Chapter 2: Virtual Card & 3DS Routing
  { id: 'ekyc', chapter: 2, term: 'eKYC', definition: 'Electronic Know Your Customer: the bank checks who a new customer is remotely, usually with a photo of an ID document, a selfie with a liveness check and a match against official records, so no branch visit is needed.' },
  { id: 'qr-codes', chapter: 2, term: 'Static vs dynamic QR codes', definition: 'A static QR code is one fixed code for a merchant, so the customer types the amount. A dynamic QR code is made for one payment and carries its amount and reference, and it often expires, so it is harder to misuse.' },
  { id: 'virtual-card', chapter: 2, term: 'Virtual card and dynamic CVV', definition: 'A virtual card is a card number with no plastic, made for online use. Its dynamic CVV (dCVV) changes every few minutes, so a stolen number is of no use without the current code.' },

  // Chapter 3: Card-Testing & Fraud Detection
  { id: 'four-party', chapter: 3, term: 'Four-party payment model', definition: 'Four parties take part in a card payment: the cardholder, the merchant, the issuer (the cardholder’s bank) and the acquirer (the merchant’s bank). The card scheme, such as Visa, sits between the banks and sets the rules.' },
  { id: 'auth-capture', chapter: 3, term: 'Authorisation vs capture', definition: 'Authorisation: the issuer checks the payment and holds the money, but nothing moves. Capture: the merchant claims the held amount, and settlement later moves the money. A hold that is never captured is released.' },
  { id: 'tokenization', chapter: 3, term: 'Tokenization', definition: 'The real card number is swapped for a token that works only for one device or merchant. The shop never sees the real number, a stolen token is useless elsewhere, and the vault maps the token back to the real card.' },
  { id: 'three-ds', chapter: 3, term: '3DS 2.0 risk routing and OTP', definition: 'The issuer scores each online payment from device and behaviour data. Low risk goes through with no friction, medium risk gets a challenge such as a one-time password (OTP), high risk is declined. A completed challenge usually moves fraud liability to the issuer.' },

  // Chapter 4: BNPL & Installment Approvals
  { id: 'mdr-interchange', chapter: 4, term: 'MDR and interchange fee split', definition: 'The merchant discount rate (MDR) is the fee a merchant pays its acquirer on each card sale. It is split between interchange (to the issuer), scheme fees (to the network) and the acquirer’s margin. Illustration with made-up rates: 2.0% of $100 is $2.00 = $1.20 + $0.10 + $0.70.' },
  { id: 'refund-void', chapter: 4, term: 'Refund vs void', definition: 'A void cancels a payment before it settles: the hold is released and the customer is usually never charged. A refund returns money after settlement, as a new credit that can take days to show.' },
  { id: 'chargeback', chapter: 4, term: 'Dispute and chargeback', definition: 'The cardholder disputes a payment with the issuer. The issuer can take the money back from the acquirer (a chargeback), and the merchant can answer with evidence. A merchant who loses gives up the amount and usually a fee.' },
  { id: 'bnpl', chapter: 4, term: 'BNPL Pay-in-4 underwriting', definition: 'Buy now, pay later splits a purchase into four equal instalments: the first at checkout, the rest about every two weeks. In seconds, underwriting reads the customer’s score and history and decides whether to offer the plan and how large.' },

  // Chapter 5: Account-to-Account & ISO 20022
  { id: 'a2a-instant', chapter: 5, term: 'Instant account-to-account transfer', definition: 'Money moves from one bank account to another with no card network, and settles in seconds (in Australia, over the NPP, often addressed with a PayID). Once settled it is final: it cannot be pulled back like a card chargeback.' },
  { id: 'cdm-liquidity', chapter: 5, term: 'CDM cash-in and liquidity', definition: 'A cash deposit is credited to the customer at once, while the notes sit in the machine’s cassette until they are collected. The bank watches the cash held against the ledger so machines do not fill up or run dry.' },
  { id: 'iso-20022', chapter: 5, term: 'ISO 20022 XML messaging', definition: 'A richer, structured XML message standard for payments, with room for names, addresses, purpose and remittance details. pacs.008 is a customer credit transfer between banks, and pacs.002 reports its status.' },

  // Chapter 6: Overnight EOD Clearing & Settlement
  { id: 'double-entry', chapter: 6, term: 'Double-entry GL posting', definition: 'Every posting in the general ledger has a debit and a credit of the same amount, so the books always balance. Example from the simulator: DR 1110-Customer CASA Hold $20.00 | CR 2110-Card Clearing Payable $20.00.' },
  { id: 'alm', chapter: 6, term: 'ALM', definition: 'Asset-liability management: matching what the bank lends and invests (assets) against how it is funded (liabilities), so it can pay when money is due and is not hurt by interest-rate moves.' },
  { id: 'nim', chapter: 6, term: 'NIM', definition: 'Net interest margin: interest earned minus interest paid, divided by average earning assets. It shows how much the bank makes from the gap between lending and funding rates.' },
  { id: 'basel', chapter: 6, term: 'Basel capital adequacy', definition: 'Basel III makes a bank hold minimum capital against its risk-weighted assets: at least 4.5% common equity, 6% Tier 1 and 8% total capital, plus a 2.5% conservation buffer on top.' },
  { id: 'bank-run', chapter: 6, term: 'Bank run stress test', definition: 'A bank run is many depositors withdrawing at once. A stress test assumes a share of deposits leaves and checks that liquid assets still cover it, for example the liquidity coverage ratio (LCR) staying at or above 100% over 30 days.' },
  { id: 'aml', chapter: 6, term: 'AML in three steps', definition: '1) KYC: know the customer when they join. 2) Monitoring: watch transactions against rules, such as many payments just under a limit. 3) Reporting: send a suspicious activity report (SAR) to the regulator, in Australia a suspicious matter report to AUSTRAC, without tipping off the customer.' },
];

export const glossaryFor = (chapter: ChapterId): readonly GlossaryEntry[] => GLOSSARY.filter((g) => g.chapter === chapter);
export const glossaryEntry = (id: string): GlossaryEntry | null => GLOSSARY.find((g) => g.id === id) ?? null;

// ─────────────────────────────────────────────────────────────────────────────
// Quizzes
// ─────────────────────────────────────────────────────────────────────────────

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: readonly [string, string, string, string];
  /** Index into `options`. */
  answer: 0 | 1 | 2 | 3;
  explanation: string;
}

export const QUIZZES: Readonly<Record<ChapterId, readonly QuizQuestion[]>> = {
  1: [
    { id: '1-a', prompt: 'A terminal sends an authorisation request for $20. What does the bank do with the money at that moment?', options: ['Pays it to the shop', 'Sets it aside as a hold, without moving it', 'Nothing until the end of the day', 'Charges a fee and refunds it later'], answer: 1, explanation: 'Authorisation checks the balance and places a hold. The money only moves later, at settlement.' },
    { id: '1-b', prompt: 'Which response code means insufficient funds?', options: ['00', '05', '14', '51'], answer: 3, explanation: '51 is insufficient funds. 00 is approved and 05 is a general “do not honour”.' },
    { id: '1-c', prompt: 'Which machine takes notes in and pays the same notes out to the next customer?', options: ['POS terminal', 'CDM', 'CRM', 'QR reader'], answer: 2, explanation: 'A CRM recycles cash. A CDM only takes deposits.' },
    { id: '1-d', prompt: 'A current account has $50, a $200 overdraft limit and no holds. What is the available balance?', options: ['$50', '$150', '$200', '$250'], answer: 3, explanation: 'Available balance is the balance plus the unused overdraft limit, less holds: $50 + $200 = $250.' },
  ],
  2: [
    { id: '2-a', prompt: 'Why is a dynamic QR code safer than a static one?', options: ['It is printed larger', 'It is made for one payment, with its amount and reference', 'The bank never sees it', 'It never expires'], answer: 1, explanation: 'A dynamic code is tied to one payment, so it cannot be reused for another amount.' },
    { id: '2-b', prompt: 'What does a dynamic CVV protect against?', options: ['A stolen card number being used on its own', 'A shop charging twice', 'A declined payment', 'A slow terminal'], answer: 0, explanation: 'The code changes every few minutes, so the card number alone stops working.' },
    { id: '2-c', prompt: 'What does eKYC let a bank do?', options: ['Skip identity checks', 'Check a new customer’s identity remotely, for example with an ID photo and selfie', 'Approve every payment', 'Open accounts for anyone'], answer: 1, explanation: 'eKYC replaces the branch visit with a remote identity check.' },
  ],
  3: [
    { id: '3-a', prompt: 'In the four-party model, who is the issuer?', options: ['The merchant’s bank', 'The card scheme', 'The cardholder’s bank', 'The shop'], answer: 2, explanation: 'The issuer is the cardholder’s bank. The acquirer is the merchant’s bank.' },
    { id: '3-b', prompt: 'Under 3DS 2.0, what happens to a medium-risk online payment?', options: ['It goes straight through', 'The customer is challenged, for example with an OTP', 'It is always declined', 'It waits for the night batch'], answer: 1, explanation: 'Low risk is frictionless, medium risk is challenged, high risk is declined.' },
    { id: '3-c', prompt: 'What does tokenisation achieve?', options: ['The shop sees the real card number', 'A stolen token is useless outside its device or merchant', 'Payments settle instantly', 'Fees disappear'], answer: 1, explanation: 'The token stands in for the card and works only where it was issued for.' },
    { id: '3-d', prompt: 'What is the difference between authorisation and capture?', options: ['They are the same step', 'Authorisation holds the money; capture claims it for the merchant', 'Capture happens first', 'Authorisation moves the money'], answer: 1, explanation: 'Authorisation holds funds. Capture claims the held amount and settlement moves the money.' },
  ],
  4: [
    { id: '4-a', prompt: 'A merchant pays 2.0% MDR on a $100 sale. Who receives the interchange part?', options: ['The acquirer', 'The issuer', 'The customer', 'The merchant'], answer: 1, explanation: 'Interchange goes to the issuer. The scheme takes its fee and the acquirer keeps the rest.' },
    { id: '4-b', prompt: 'A payment is cancelled before it settles. What is that called?', options: ['A void', 'A refund', 'A chargeback', 'A representment'], answer: 0, explanation: 'A void cancels before settlement. A refund returns money after it.' },
    { id: '4-c', prompt: 'Who starts a chargeback?', options: ['The merchant', 'The cardholder, by disputing with their issuer', 'The acquirer’s staff', 'The scheme on its own'], answer: 1, explanation: 'The cardholder disputes with the issuer, who can then pull the money back from the acquirer.' },
    { id: '4-d', prompt: 'What does underwriting decide in a Pay-in-4 purchase?', options: ['Which shop is paid', 'Whether to offer the plan and how large', 'The card’s PIN', 'The settlement date'], answer: 1, explanation: 'Underwriting reads the customer’s score and history and decides whether to offer the instalments.' },
  ],
  5: [
    { id: '5-a', prompt: 'What is true of an instant A2A transfer once it has settled?', options: ['It can be charged back', 'It is final', 'It waits for the night batch', 'It needs a card'], answer: 1, explanation: 'Instant transfers are final once settled. There is no card-style chargeback.' },
    { id: '5-b', prompt: 'What does ISO 20022 add over fixed-field ISO 8583 messages?', options: ['Smaller messages', 'Richer structured XML data', 'No account numbers', 'Slower settlement'], answer: 1, explanation: 'ISO 20022 carries structured data such as names, addresses and purpose in XML.' },
    { id: '5-c', prompt: 'After a CDM cash deposit, where is the cash?', options: ['Already at the bank’s head office', 'In the machine’s cassette, while the customer is already credited', 'Returned to the customer', 'Destroyed'], answer: 1, explanation: 'The account is credited at once, but the notes stay in the machine until they are collected.' },
  ],
  6: [
    { id: '6-a', prompt: 'A $20 posting is made in the general ledger. Which is true?', options: ['Only a debit is recorded', 'A debit and a credit of $20 each are recorded', 'Two debits of $10', 'The ledger is updated the next year'], answer: 1, explanation: 'Double entry always records equal debits and credits, so the books balance.' },
    { id: '6-b', prompt: 'How is net interest margin (NIM) worked out?', options: ['Interest earned minus interest paid, divided by average earning assets', 'Fees divided by deposits', 'Assets divided by liabilities', 'Interest paid divided by fees'], answer: 0, explanation: 'NIM compares the interest the bank earns and pays with the assets it earns on.' },
    { id: '6-c', prompt: 'Under Basel III, what is the minimum total capital ratio, before buffers?', options: ['2%', '4.5%', '8%', '20%'], answer: 2, explanation: 'Total capital must be at least 8% of risk-weighted assets, with 4.5% common equity and 6% Tier 1 inside it.' },
    { id: '6-d', prompt: 'What does a bank-run stress test check?', options: ['Whether the ATMs are clean', 'Whether liquid assets cover a sudden wave of withdrawals', 'How fast customers type PINs', 'Whether fees are fair'], answer: 1, explanation: 'It assumes a share of deposits leaves and checks the liquidity buffer still covers it.' },
    { id: '6-e', prompt: 'What is the right order of the three AML steps?', options: ['Report, monitor, know the customer', 'Monitor, know the customer, report', 'Know the customer, monitor, report', 'Know the customer, report, monitor'], answer: 2, explanation: 'KYC when they join, monitoring while they bank, and a suspicious activity report when something looks wrong.' },
  ],
};

export const quizFor = (chapter: ChapterId): readonly QuizQuestion[] => QUIZZES[chapter];

export interface QuizResult {
  score: number;
  total: number;
  /** Ids of the questions answered wrongly or left blank. */
  missed: readonly string[];
}

/** Marks a quiz. `answers` maps a question id to the option index chosen. */
export function gradeQuiz(chapter: ChapterId, answers: Readonly<Record<string, number>>): QuizResult {
  const questions = quizFor(chapter);
  const missed = questions.filter((q) => answers[q.id] !== q.answer).map((q) => q.id);
  return { score: questions.length - missed.length, total: questions.length, missed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Language
// ─────────────────────────────────────────────────────────────────────────────

/** A glossary entry with its term and definition in the active language. */
export function localGlossary(entry: GlossaryEntry, locale: Locale = activeLocale()): GlossaryEntry {
  if (locale === 'en') return entry;
  const vi = GLOSSARY_VI[entry.id];
  return vi ? { ...entry, ...vi } : entry;
}

/** A quiz question with its prompt, options and explanation in the active language. The answer index is unchanged. */
export function localQuestion(q: QuizQuestion, locale: Locale = activeLocale()): QuizQuestion {
  if (locale === 'en') return q;
  const vi = QUIZ_VI[q.id];
  return vi ? { ...q, ...vi } : q;
}
