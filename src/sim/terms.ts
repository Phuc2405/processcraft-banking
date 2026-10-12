/**
 * The two vocabularies of the Living Bank.
 *
 *   Fintech Expert   the names a payments team uses: Token Vault, dCVV, 3DS, CASA, EOD reconciliation, suspense.
 *   Concept Explorer the same desks in plain English, each with a one-sentence "what is this" tooltip.
 *                    (The stored id of this mode stays 'beginner', so saved preferences keep working.)
 *
 * Nothing here changes how the bank behaves. The simulation keeps its own ids and the expert names; the screen asks
 * this file what to call a thing (`stationName`) and what to say about it (`stationTip`). Free text that mentions
 * jargon (the feed, the lesson steps) goes through `termText`, which swaps the jargon for plain words in Concept Explorer mode.
 *
 * Two rules keep the plain words from tripping over themselves:
 *   - a curated name (a desk, a department, a chapter title) is never rewritten again: it is matched whole and left alone, and
 *   - if two replacements ever land side by side and repeat ("Virtual Card card masking"), the repeat is folded away.
 *
 * The words themselves sit in one `Localized` table so another language is a data change (see i18n/locale.ts).
 */

import { pick, type Localized } from '../i18n/locale';
import { DEPARTMENTS, STATIONS, type DepartmentId, type ExternalId, type PlaceId, type StationId, isStation } from './topology';

export type TermMode = 'expert' | 'beginner';

export const TERM_MODES: readonly TermMode[] = ['expert', 'beginner'];

export const isTermMode = (v: unknown): v is TermMode => v === 'expert' || v === 'beginner';

/** A name for narrow places (a desk card) is `short`; `plain` is the full name used in headings and tooltips. */
export interface Term {
  plain: string;
  short: string;
  /** One sentence, written for someone who has never worked in a bank. */
  tip: string;
}

export interface ExternalTerm extends Term {
  /** The small line under the name on the map. */
  sub: string;
}

interface TermBook {
  modeLabel: Record<TermMode, string>;
  modeHint: Record<TermMode, string>;
  stations: Record<StationId, Term>;
  departments: Record<DepartmentId, Term>;
  externals: Record<ExternalId, ExternalTerm>;
  /** Jargon in free text and what a beginner is told instead. Longest phrases are matched first. */
  glossary: ReadonlyArray<readonly [string, string]>;
  /** Curated phrases that are already in their final plain form. They are matched whole and returned as written. */
  keep: readonly string[];
}

const EN: TermBook = {
  modeLabel: { expert: 'Fintech Expert', beginner: 'Concept Explorer' },
  modeHint: {
    expert: 'Use the names a payments team uses: Token Vault, dCVV, 3DS, EOD reconciliation.',
    beginner: 'Concept Explorer: plain English for every desk, with a one-sentence explanation when you hover.',
  },
  stations: {
    GATE_VIRTUAL: {
      plain: 'Virtual Card Entrance',
      short: 'Virtual Card Entrance',
      tip: 'This is the front door for payments made with a disposable virtual card number.',
    },
    GATE_POS: {
      plain: 'Shop Card Reader Entrance',
      short: 'Shop Card Reader Entrance',
      tip: 'This is where payments tapped or swiped on a shop’s card reader come in.',
    },
    GATE_ECOM: {
      plain: 'Online Shopping Entrance',
      short: 'Online Shopping Entrance',
      tip: 'This is where online checkouts, including Buy Now Pay Later requests, come in.',
    },
    SEC_VAULT: {
      plain: 'Virtual Card Masking Vault (Hides Real Card Number)',
      short: 'Virtual Card Masking Vault',
      tip: 'It swaps the fake virtual card number for the real card behind it, so shops never see the real number.',
    },
    SEC_DCVV: {
      plain: 'Dynamic Security Code Check (Rotates Every Minute)',
      short: 'Dynamic Security Code Check',
      tip: 'It checks that the 3-digit security code matches and is still fresh, because the code changes every minute.',
    },
    SEC_3DS: {
      plain: 'Fraud & SMS OTP Check',
      short: 'Fraud & SMS OTP Check',
      tip: 'It scores how risky an online payment looks, then waves it through, texts the customer a code, or blocks it.',
    },
    LEDGER_DEBIT: {
      plain: 'Everyday Account Balance Check',
      short: 'Everyday Account Balance Check',
      tip: 'It checks the customer has enough money in their everyday account and sets that amount aside for this payment.',
    },
    LEDGER_CREDIT: {
      plain: 'Credit Card Limit Check',
      short: 'Credit Card Limit Check',
      tip: 'It checks the credit card still has room under its limit and sets that amount aside for this payment.',
    },
    BNPL: {
      plain: 'BNPL Pay-in-4 Installments',
      short: 'BNPL Pay-in-4 Installments',
      tip: 'It decides whether the customer may pay in four equal parts instead of all at once.',
    },
    EOD_BATCH: {
      plain: 'Nightly Payment Bundling',
      short: 'Nightly Payment Bundling',
      tip: 'At 23:00 it bundles every payment approved today into one file to send to Visa.',
    },
    EOD_VISA: {
      plain: 'Visa Money Handover',
      short: 'Visa Money Handover',
      tip: 'It swaps the day’s file with Visa and agrees how much money changes hands.',
    },
    RECON: {
      plain: 'Night Bookkeeping & Ledger Balance',
      short: 'Night Bookkeeping & Ledger Balance',
      tip: 'It compares three sets of records for every payment and flags the ones that disagree.',
    },
    SUSPENSE: {
      plain: 'Holding Box for Mismatched Money',
      short: 'Holding Box for Mismatched Money',
      tip: 'Money that does not match waits here until a clerk finds out why.',
    },
    GATE_A2A: {
      plain: 'Instant Bank Transfer Entrance',
      short: 'Instant Transfer Entrance',
      tip: 'This is where instant bank-to-bank transfers, such as a QR bill split or the rent, come in and get checked before any money moves.',
    },
    GATE_ATM: {
      plain: 'Cash Machine Card & PIN Slot',
      short: 'Cash Machine Card & PIN',
      tip: 'The card slot and keypad of the cash machine on the pavement, where three wrong PINs in a row make the machine keep the card.',
    },
    ATM_CASH: {
      plain: 'Cash Machine Note Dispenser',
      short: 'Cash Machine Notes',
      tip: 'It counts the notes out and takes the money from the account, and if the notes jam the money waits in the holding box until the cash count proves what happened.',
    },
  },
  departments: {
    GATES: { plain: 'Payment Entrances', short: 'Payment Entrances', tip: 'Where every payment enters the bank: virtual cards, shop card readers, online checkouts and instant transfers.' },
    SECURITY: { plain: 'Security & Identity Checks', short: 'Security & Identity Checks', tip: 'Where the bank checks that the card and the person using it are genuine.' },
    LEDGER: { plain: 'Account Balance & Credit Check', short: 'Account Balance & Credit Check', tip: 'Where the bank checks the money is really there and sets it aside.' },
    BNPL: { plain: 'BNPL Pay-in-4 Installments', short: 'BNPL Pay-in-4 Installments', tip: 'Where the bank decides who may split a purchase into four payments.' },
    EOD: { plain: 'Night Bookkeeping Department', short: 'Night Bookkeeping Department', tip: 'The night shift that checks every record agrees and parks the ones that do not.' },
    ATM: { plain: 'Sidewalk Cash Machine', short: 'Sidewalk Cash Machine', tip: 'The two blue cash machines on the pavement outside the branch.' },
  },
  externals: {
    CUSTOMER_OTP: {
      plain: 'Customer’s phone (text-message code)',
      short: 'Customer’s phone',
      sub: 'waiting for the SMS code',
      tip: 'The customer gets a text with a code and types it in to prove it is really them.',
    },
    OUT_APPROVED: { plain: 'Approved', short: 'Approved', sub: 'waits for tonight', tip: 'Payments the bank said yes to, waiting for tonight’s bookkeeping.' },
    OUT_DECLINED: { plain: 'Declined', short: 'Declined', sub: 'today', tip: 'Payments the bank said no to today.' },
    OUT_SETTLED: { plain: 'Money moved & confirmed', short: 'Money moved', sub: 'tonight’s run', tip: 'Payments whose records all agree, so the money has really moved.' },
  },
  glossary: [
    // Titles and phrases that read well only as a whole. Longest match wins, so these beat the single words inside them.
    ['virtual card tokenization & dynamic cvv flow', 'Virtual Card & Token Vault'],
    ['virtual card tokenization & dcvv masking', 'Virtual Card & Token Vault'],
    ['virtual card tokenization', 'Virtual Card & Token Vault'],
    ['virtual card tokenisation', 'Virtual Card & Token Vault'],
    ['3-d secure 2.x risk engine (challenge vs frictionless)', '3DS Identity & Risk Check'],
    ['3-d secure 2.x risk engine (frictionless vs challenge otp)', '3DS Identity & Risk Check'],
    ['3-d secure 2.x risk engine', '3DS Identity & Risk Check'],
    ['3-d secure risk engine', '3DS Identity & Risk Check'],
    ['3ds risk engine', '3DS Identity & Risk Check'],
    ['bnpl pay-in-4 underwriting & card fallback', 'BNPL Pay-in-4 Installments'],
    ['bnpl pay-in-4 underwriting', 'BNPL Pay-in-4 Installments'],
    ['bnpl pay-in-4 installments', 'BNPL Pay-in-4 Installments'],
    ['bnpl pay-in-4', 'BNPL Pay-in-4 Installments'],
    ['eod 3-way reconciliation & suspense accounting', 'Night Books Match & Holding Box'],
    ['eod 3-way reconciliation & suspense account handling', 'Night Books Match & Holding Box'],
    ['night books match & holding box', 'Night Books Match & Holding Box'],
    ['instant account-to-account transfers (a2a & pacs.008)', 'Instant Bank-to-Bank Transfers'],
    ['instant account-to-account transfers', 'Instant Bank-to-Bank Transfers'],
    ['instant a2a transfers', 'Instant Bank-to-Bank Transfers'],
    ['aml screening & chargeback dispute resolution', 'Suspicious-Money Checks & Refund Disputes'],
    ['aml & chargebacks', 'Suspicious-Money Checks & Refund Disputes'],
    ['3-d secure 2.x', 'the extra identity check'],
    ['3-d secure', 'the extra identity check'],
    ['3ds', 'extra identity check'],
    ['token vault', 'virtual card masking vault'],
    ['tokenization', 'card masking'],
    ['tokenisation', 'card masking'],
    ['dynamic cvv', 'dynamic security code'],
    ['dcvv', 'dynamic security code'],
    ['cvv', 'security code'],
    ['dpan', 'virtual card number'],
    ['fpan', 'real card number'],
    ['otp', 'one-time SMS code'],
    ['casa', 'everyday account'],
    ['bnpl', 'Buy Now Pay Later'],
    ['pay-in-4', '4-split payment'],
    ['underwriting', 'approval check'],
    ['3-way reconciliation', 'night bookkeeping match'],
    ['reconciliation', 'night bookkeeping match'],
    ['suspense account', 'holding box for mismatched money'],
    ['suspense', 'holding box'],
    ['settlement', 'money handover'],
    ['acquirer', 'shop’s bank'],
    ['issuer', 'customer’s bank'],
    ['frictionless', 'no-hassle'],
    ['liability shift', 'who pays if it is fraud'],
    ['eod', 'end-of-day'],
    ['pos', 'shop card reader'],
    // The Academy's vocabulary
    ['iso 20022', 'the modern bank-message standard'],
    ['pacs.008', 'bank-to-bank payment message'],
    ['endtoendid', 'payment reference'],
    ['rtgs', 'big-payment system'],
    ['a2a', 'bank-to-bank'],
    ['aml', 'anti-money-laundering'],
    ['ofac', 'sanctions list'],
    ['politically exposed person', 'public-office holder'],
    ['pep', 'public-office holder'],
    ['structuring', 'splitting deposits to dodge reporting'],
    ['liquidity', 'cash on hand'],
    ['fx', 'foreign-currency'],
    ['chargeback', 'forced refund'],
    ['representment', 'merchant’s reply'],
    ['pre-arbitration', 'last warning before the card network decides'],
    ['retrieval request', 'receipt request'],
    ['double-entry', 'two-sided bookkeeping'],
  ],
  keep: [
    'Virtual Card & Token Vault',
    '3DS Identity & Risk Check',
    'BNPL Pay-in-4 Installments',
    'Night Books Match & Holding Box',
    'Instant Bank-to-Bank Transfers',
    'Suspicious-Money Checks & Refund Disputes',
  ],
};

export const TERMS: Localized<TermBook> = { en: EN };

const book = (): TermBook => pick(TERMS);

// ─────────────────────────────────────────────────────────────────────────────
// Names
// ─────────────────────────────────────────────────────────────────────────────

export const modeLabel = (mode: TermMode): string => book().modeLabel[mode];
export const modeHint = (mode: TermMode): string => book().modeHint[mode];

/** The name on a desk card. */
export function stationName(id: StationId, mode: TermMode): string {
  return mode === 'beginner' ? book().stations[id].short : STATIONS[id].name;
}

/** The full name, for headings and tooltips. */
export function stationTitle(id: StationId, mode: TermMode): string {
  return mode === 'beginner' ? book().stations[id].plain : STATIONS[id].name;
}

/** The one-sentence "what is this" for a desk. */
export function stationTip(id: StationId, mode: TermMode): string {
  return mode === 'beginner' ? book().stations[id].tip : STATIONS[id].blurb;
}

export const stationBlurb = stationTip;

export function departmentName(id: DepartmentId, mode: TermMode): string {
  return mode === 'beginner' ? book().departments[id].short : DEPARTMENTS[id].name;
}

export const departmentTitle = departmentName;

export function departmentTip(id: DepartmentId, mode: TermMode): string {
  return mode === 'beginner' ? book().departments[id].tip : DEPARTMENTS[id].blurb;
}

const EXPERT_EXTERNAL: Record<ExternalId, ExternalTerm> = {
  CUSTOMER_OTP: { plain: 'Customer’s phone', short: 'Customer’s phone', sub: 'on the phone now', tip: 'The customer receives the OTP and types it in to complete the 3DS challenge.' },
  OUT_APPROVED: { plain: 'Approved', short: 'Approved', sub: 'waits for tonight', tip: 'Authorised payments, waiting for tonight’s batch clearing.' },
  OUT_DECLINED: { plain: 'Declined', short: 'Declined', sub: 'today', tip: 'Payments declined today, for risk or for funds.' },
  OUT_SETTLED: { plain: 'Settled & cleared', short: 'Settled & cleared', sub: 'tonight’s run', tip: 'Payments whose three records matched in tonight’s reconciliation.' },
};

const externalTerm = (id: ExternalId, mode: TermMode): ExternalTerm => (mode === 'beginner' ? book().externals[id] : EXPERT_EXTERNAL[id]);

export const externalLabel = (id: ExternalId, mode: TermMode): string => externalTerm(id, mode).short;
export const externalSub = (id: ExternalId, mode: TermMode): string => externalTerm(id, mode).sub;
export const externalTip = (id: ExternalId, mode: TermMode): string => externalTerm(id, mode).tip;

/** Any place on the map, by its full name. */
export const placeTitle = (id: PlaceId, mode: TermMode): string => (isStation(id) ? stationTitle(id, mode) : externalTerm(id, mode).plain);

/** Any place on the map, by its one-sentence tooltip. */
export const placeTip = (id: PlaceId, mode: TermMode): string => (isStation(id) ? stationTip(id, mode) : externalTip(id, mode));

// ─────────────────────────────────────────────────────────────────────────────
// Free text
// ─────────────────────────────────────────────────────────────────────────────

interface Compiled {
  re: RegExp;
  map: Map<string, string>;
  /** Lower-cased phrases that are already final: matched whole, returned as the text had them. */
  keep: Set<string>;
}

const compiled = new WeakMap<TermBook, Compiled>();

function glossaryFor(b: TermBook): Compiled {
  const hit = compiled.get(b);
  if (hit) return hit;
  const map = new Map(b.glossary.map(([from, to]) => [from.toLowerCase(), to] as const));
  // The expert names of the desks and departments are jargon too, wherever a sentence mentions one.
  // A hand-written glossary line wins: it reads naturally in the middle of a sentence ("holding box"), the desk name does not.
  for (const id of Object.keys(STATIONS) as StationId[]) {
    const key = STATIONS[id].name.toLowerCase();
    if (!map.has(key)) map.set(key, b.stations[id].short);
  }
  for (const id of Object.keys(DEPARTMENTS) as DepartmentId[]) {
    const key = DEPARTMENTS[id].name.toLowerCase();
    if (!map.has(key)) map.set(key, b.departments[id].short);
  }
  // Names that are already plain must pass through a second time untouched. They go in the table as themselves, so the
  // longest-match rule swallows them whole before the single words inside them ("Token Vault", "BNPL", "3DS") are looked at.
  const keep = new Set<string>();
  const plainNames = [
    ...Object.values(b.stations).flatMap((t) => [t.plain, t.short]),
    ...Object.values(b.departments).flatMap((t) => [t.plain, t.short]),
    ...Object.values(b.externals).flatMap((t) => [t.plain, t.short]),
    ...b.keep,
  ];
  for (const name of plainNames) {
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, name);
    if (map.get(key) === name) keep.add(key);
  }
  const keys = [...map.keys()].sort((a, c) => c.length - a.length);
  const escaped = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Whole words only: "pos" must not match inside "position", and "otp" not inside "footprint".
  // An optional "a"/"an" in front is part of the match, so the article can agree with the plain word that replaces the jargon.
  const re = new RegExp(`(?<![A-Za-z0-9])(?:(an?)\\s+)?(?:${escaped.join('|')})(?![A-Za-z0-9])`, 'gi');
  const out = { re, map, keep };
  compiled.set(b, out);
  return out;
}

/** "a" or "an" for the word that follows it: "an everyday account", "a one-time code". */
function articleFor(word: string): 'a' | 'an' {
  if (/^(one\b|uni|use)/i.test(word)) return 'a';
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/**
 * Folds a phrase that has landed twice in a row into one: "Virtual Card card masking" reads "Virtual Card masking",
 * "Buy Now Pay Later Buy Now Pay Later (4-split payment)" reads "Buy Now Pay Later (4-split payment)". Whole words only,
 * compared without case or punctuation, and only words that contain a letter (so "1 1" and "- -" are left alone).
 */
export function foldRepeats(text: string): string {
  if (!text || !/[A-Za-z]/.test(text)) return text;
  const parts = text.split(/(\s+)/);
  const words: Array<{ at: number; key: string }> = [];
  for (let i = 0; i < parts.length; i += 2) {
    const raw = parts[i] ?? '';
    words.push({ at: i, key: raw.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '') });
  }
  const drop = new Set<number>();
  for (let n = 6; n >= 1; n--) {
    for (let w = 0; w + 2 * n <= words.length; w++) {
      let same = true;
      let letters = false;
      for (let k = 0; k < n; k++) {
        const first = words[w + k]!;
        const second = words[w + n + k]!;
        if (drop.has(first.at) || drop.has(second.at) || first.key === '' || first.key !== second.key) {
          same = false;
          break;
        }
        if (/[a-z]/.test(first.key)) letters = true;
      }
      if (!same || !letters) continue;
      // Keep the first copy (it has the capital letter) and drop the second, handing any closing punctuation back to the first.
      const lastKept = words[w + n - 1]!.at;
      const lastDropped = words[w + 2 * n - 1]!.at;
      const trail = /[^A-Za-z0-9]+$/.exec(parts[lastDropped] ?? '')?.[0] ?? '';
      if (trail !== '' && !/[^A-Za-z0-9]$/.test(parts[lastKept] ?? '')) parts[lastKept] = `${parts[lastKept] ?? ''}${trail}`;
      for (let k = 0; k < n; k++) drop.add(words[w + n + k]!.at);
    }
  }
  if (drop.size === 0) return text;
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0 && drop.has(i)) {
      out.pop(); // the space in front of the dropped word
      continue;
    }
    out.push(parts[i] ?? '');
  }
  return out.join('');
}

/** Swaps payment jargon for plain words, in one pass so a replacement is never replaced again. */
export function plainText(text: string): string {
  if (!text) return text;
  const { re, map, keep } = glossaryFor(book());
  const swapped = text.replace(re, (match, article: string | undefined, offset: number, whole: string) => {
    const jargon = article ? match.slice(match.search(/\s/)).trim() : match;
    const key = jargon.toLowerCase();
    const plain = map.get(key);
    if (plain === undefined) return match;
    // Already a curated plain name: leave it exactly as it was written.
    if (keep.has(key)) return match;
    if (article) {
      const fixed = articleFor(plain);
      return `${article.charAt(0) === 'A' ? fixed.charAt(0).toUpperCase() + fixed.slice(1) : fixed} ${plain}`;
    }
    const before = whole.slice(0, offset);
    const startsSentence = before.trim().length === 0 || /[.!?:]\s+$/.test(before);
    return startsSentence ? plain.charAt(0).toUpperCase() + plain.slice(1) : plain;
  });
  return foldRepeats(swapped);
}

/** Text as the chosen vocabulary would say it. Expert text is returned untouched. */
export const termText = (text: string, mode: TermMode): string => (mode === 'beginner' ? plainText(text) : text);
