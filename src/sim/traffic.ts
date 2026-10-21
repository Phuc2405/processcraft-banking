/**
 * Who walks into the bank today, and what tonight's records look like.
 *
 * Everything here is a pure function of (seed, day) and never of the bank's rules, so "tomorrow with
 * the old rules" and "tomorrow with the new rules" see exactly the same customers. That is what makes
 * a what-if fair.
 *
 * The numbers are chosen so the trade-offs the four processes teach are real:
 *   - most genuine customers score low on 3DS risk, a few look unusual; most fraud scores high, some hides low
 *   - fraudsters replay an old dynamic CVV; customers type it fresh but sometimes slowly
 *   - most Pay-in-4 customers put down 25%, and weak scores are more likely to default
 *   - most settlement records agree to the cent, some differ by rounding dust, a few are real breaks
 */

import type { A2aContext, BankingPayload, CardType, FundingSource, Id, MinorUnits } from '../types/processLearning';
import { clamp, hashSeed, Rng } from './prng';
import { WORK_END, WORK_START, beatMinutes } from './clock';
import { scenariosFor } from './scenarios';
import type { AtmSession, CheckoutKind, Customer, DayEvent, DayEventId, SettlementTruth } from './types';
import { activeLocale } from '../i18n/locale';

// ─────────────────────────────────────────────────────────────────────────────
// Days and their events
// ─────────────────────────────────────────────────────────────────────────────

export const DAY_EVENTS: Record<DayEventId, DayEvent> = {
  NORMAL: {
    id: 'NORMAL',
    title: 'An ordinary day',
    blurb: 'Steady traffic with a lunchtime peak. Nothing unusual is expected.',
    watch: 'A good day to learn the baseline. Which desk is busiest at lunch?',
    volume: 1,
    mix: {},
    fraud: {},
    breaks: 1,
  },
  PROMO: {
    id: 'PROMO',
    title: 'Flash sale',
    blurb: 'A big retailer is running a flash sale. Online checkouts and Pay-in-4 applications will surge.',
    watch: 'The 3DS Risk Desk and the Pay-in-4 desk will be short of hands. Watch the queues, and the tired staff behind them.',
    // Tuned so the surge lands where `watch` says: the 3DS desk ends the day worn out (the Debit CASA desk has three clerks).
    volume: 1.25,
    mix: { ECOM: 1.9, BNPL: 2.4, VIRTUAL: 1.2, POS: 0.9, ATM: 0.8 },
    fraud: {},
    breaks: 1.2,
  },
  FRAUD_RING: {
    id: 'FRAUD_RING',
    title: 'Fraud ring active',
    blurb: 'Fraud intelligence reports a ring testing stolen card numbers online and replaying captured one-time codes.',
    watch: 'How much fraud slips through on the frictionless path, and what does tightening the 3DS line cost your genuine customers?',
    volume: 1,
    mix: {},
    fraud: { ECOM: 6, VIRTUAL: 4, BNPL: 2.5, A2A: 5, ATM: 3 },
    breaks: 1,
  },
  VISA_GLITCH: {
    id: 'VISA_GLITCH',
    title: 'Visa file glitch',
    blurb: 'The card scheme has warned of a faulty clearing file tonight: missing legs and doubled presentments are likely.',
    watch: 'The reconciliation desk and the suspense account. Is the night team keeping up, and who clears the pile tomorrow?',
    volume: 1,
    mix: {},
    fraud: {},
    breaks: 5,
  },
  PAYDAY: {
    id: 'PAYDAY',
    title: 'Payday',
    blurb: 'Salaries landed overnight. Card swipes are up, balances are healthy, and fewer people need to split a bill.',
    watch: 'Shop-floor volume on the POS gate and the debit ledger. Declines for funds should fall.',
    volume: 1.3,
    mix: { POS: 1.35, ECOM: 1.1, BNPL: 0.6, VIRTUAL: 1, A2A: 1.4, ATM: 1.5 },
    fraud: {},
    breaks: 1,
  },
};

const RANDOM_EVENTS: ReadonlyArray<readonly [DayEventId, number]> = [
  ['NORMAL', 46],
  ['PROMO', 17],
  ['FRAUD_RING', 14],
  ['VISA_GLITCH', 12],
  ['PAYDAY', 11],
];

/**
 * Day 1 is an ordinary day so a learner sees the baseline. Day 2 is a flash sale so they meet a queue early.
 * After that the calendar is random but fixed by the seed, and never has two special days in a row.
 */
const eventCache = new Map<string, DayEvent>();

export function eventForDay(seed: number, day: number): DayEvent {
  if (day <= 1) return DAY_EVENTS.NORMAL;
  if (day === 2) return DAY_EVENTS.PROMO;
  const key = `${seed}:${day}`;
  const cached = eventCache.get(key);
  if (cached) return cached;
  const previous = eventForDay(seed, day - 1).id;
  const rng = new Rng(hashSeed(seed, 'event', day));
  const pool = previous === 'NORMAL' ? RANDOM_EVENTS : RANDOM_EVENTS.filter(([id]) => id === 'NORMAL');
  const event = DAY_EVENTS[rng.weighted(pool)];
  if (eventCache.size > 500) eventCache.clear();
  eventCache.set(key, event);
  return event;
}

// ─────────────────────────────────────────────────────────────────────────────
// Arrivals through the working day
// ─────────────────────────────────────────────────────────────────────────────

/** Customers per working beat at intensity 1, on an ordinary day. */
const BASE_RATE = { POS: 3.0, ECOM: 2.5, VIRTUAL: 1.3, BNPL: 1.1 } as const;

/**
 * The A2A gate and the sidewalk ATM arrived after the four card channels. They draw from their own random stream, so
 * adding them left every card customer of every seeded day exactly as it was.
 */
const EXTRA_RATE = { A2A: 0.6, ATM: 1.0 } as const;

/** Share of attempts that are fraud on an ordinary day. Fraud is mostly a card-not-present problem. */
const FRAUD_RATE: Record<CheckoutKind, number> = { POS: 0.001, ECOM: 0.04, VIRTUAL: 0.03, BNPL: 0.01, A2A: 0.012, ATM: 0.008 };

export const WORKING_BEATS = (WORK_END - WORK_START) / beatMinutes('WORKING');

/** How busy the high street is, 1 on average: a morning ramp, a lunch peak and an after-work bump. */
function shape(minute: number): number {
  const hour = minute / 60;
  const bump = (centre: number, width: number): number => Math.exp(-0.5 * ((hour - centre) / width) ** 2);
  return 0.45 + 0.2 * bump(10.3, 0.9) + 0.75 * bump(12.8, 1.15) + 0.4 * bump(16.4, 1.0);
}

const NORMALISER = (() => {
  let sum = 0;
  for (let i = 0; i < WORKING_BEATS; i++) sum += shape(WORK_START + i * beatMinutes('WORKING') + 2.5);
  return sum / WORKING_BEATS;
})();

export const intensityAt = (minute: number): number => shape(minute) / NORMALISER;

export const workingBeatIndex = (minute: number): number => Math.floor((minute - WORK_START) / beatMinutes('WORKING'));

export interface DayTraffic {
  day: number;
  event: DayEvent;
  customers: Customer[];
  /** Customers grouped by the working beat they arrive in. */
  beats: Customer[][];
}

const EPOCH_2026 = Date.UTC(2026, 0, 5, 0, 0, 0);

export function generateDay(seed: number, day: number): DayTraffic {
  const event = eventForDay(seed, day);
  const arrivals = new Rng(hashSeed(seed, 'arrivals', day));
  const beats: Customer[][] = Array.from({ length: WORKING_BEATS }, () => []);
  const customers: Customer[] = [];
  let serial = 0;

  for (let b = 0; b < WORKING_BEATS; b++) {
    const beatStart = WORK_START + b * beatMinutes('WORKING');
    const intensity = intensityAt(beatStart + 2.5);
    for (const kind of ['POS', 'ECOM', 'VIRTUAL', 'BNPL'] as const) {
      const lambda = BASE_RATE[kind] * event.volume * (event.mix[kind] ?? 1) * intensity;
      const n = arrivals.poisson(lambda);
      for (let i = 0; i < n; i++) {
        serial++;
        const minute = beatStart + Math.min(4, Math.floor(arrivals.next() * 5));
        const id = `d${day}-${String(serial).padStart(4, '0')}`;
        const customer = makeCustomer(seed, day, id, kind, minute, event);
        beats[b]!.push(customer);
        customers.push(customer);
      }
    }
  }

  // The newer channels, from a stream of their own. Their ids start at 5001 and 7001 so they never collide with a card customer.
  const extras = new Rng(hashSeed(seed, 'arrivals-extra', day));
  const serials = { A2A: 5000, ATM: 7000 };
  for (let b = 0; b < WORKING_BEATS; b++) {
    const beatStart = WORK_START + b * beatMinutes('WORKING');
    const intensity = intensityAt(beatStart + 2.5);
    for (const kind of ['A2A', 'ATM'] as const) {
      const lambda = EXTRA_RATE[kind] * event.volume * (event.mix[kind] ?? 1) * intensity;
      const n = extras.poisson(lambda);
      for (let i = 0; i < n; i++) {
        const serial = ++serials[kind];
        const minute = beatStart + Math.min(4, Math.floor(extras.next() * 5));
        const customer = makeCustomer(seed, day, `d${day}-${serial}`, kind, minute, event);
        beats[b]!.push(customer);
        customers.push(customer);
      }
    }
  }
  return { day, event, customers, beats };
}

// ─────────────────────────────────────────────────────────────────────────────
// One customer
// ─────────────────────────────────────────────────────────────────────────────

const cents = (dollars: number): MinorUnits => Math.max(100, Math.round(dollars * 100));

interface AmountSpec {
  median: number;
  sigma: number;
  min: number;
  max: number;
}

type CardKind = keyof typeof BASE_RATE;

const AMOUNT: Record<CardKind, { genuine: AmountSpec; fraud: AmountSpec }> = {
  POS: { genuine: { median: 28, sigma: 0.85, min: 2, max: 900 }, fraud: { median: 150, sigma: 0.7, min: 30, max: 1200 } },
  ECOM: { genuine: { median: 62, sigma: 0.9, min: 4, max: 1500 }, fraud: { median: 140, sigma: 0.8, min: 20, max: 2000 } },
  VIRTUAL: { genuine: { median: 45, sigma: 0.9, min: 3, max: 900 }, fraud: { median: 120, sigma: 0.8, min: 20, max: 1500 } },
  BNPL: { genuine: { median: 240, sigma: 0.55, min: 80, max: 1500 }, fraud: { median: 380, sigma: 0.5, min: 150, max: 2000 } },
};

function amountFor(rng: Rng, kind: CardKind, fraud: boolean): MinorUnits {
  const spec = AMOUNT[kind][fraud ? 'fraud' : 'genuine'];
  return cents(clamp(rng.lognormal(spec.median, spec.sigma), spec.min, spec.max));
}

/**
 * What the customer was doing, and so how much it cost. Picked from a stream of its own (keyed on the customer) so choosing
 * a scenario never moves any other draw about that customer.
 */
function scenarioFor(seed: number, day: number, id: Id, kind: CheckoutKind, fraud: boolean): { id: string; amount: MinorUnits } {
  const options = scenariosFor(kind, fraud);
  const pool = options.length > 0 ? options : scenariosFor(kind, !fraud);
  const chosen = new Rng(hashSeed(seed, 'scenario', day, id)).weighted(pool.map(([sc, w]) => [sc, w] as const));
  return { id: chosen.id, amount: chosen.amountCents };
}

function fundsFor(rng: Rng, card: FundingSource, event: DayEvent, fraud: boolean): { availableBalance: MinorUnits; creditLimit: MinorUnits } {
  const rich = event.id === 'PAYDAY' ? 1.8 : 1;
  switch (card) {
    case 'DEBIT': {
      const low = rng.chance(fraud ? 0.01 : event.id === 'PAYDAY' ? 0.025 : 0.05);
      return { availableBalance: cents(low ? rng.lognormal(35, 1) : rng.lognormal(1100 * rich, 1)), creditLimit: 0 };
    }
    case 'CREDIT': {
      const available = cents(rng.lognormal(2200 * rich, 0.9));
      const used = cents(rng.lognormal(900, 0.9));
      const limit = Math.max(available, Math.round((available + used) / 10000) * 10000);
      return { availableBalance: available, creditLimit: limit };
    }
    case 'PREPAID':
      return { availableBalance: cents(rng.lognormal(110 * rich, 1)), creditLimit: 0 };
  }
}

const fundingMix: ReadonlyArray<readonly [FundingSource, number]> = [
  ['DEBIT', 55],
  ['CREDIT', 35],
  ['PREPAID', 10],
];

const digits = (rng: Rng, n: number): string => Array.from({ length: n }, () => String(rng.int(0, 9))).join('');

/** Risk the 3DS engine would score. Genuine customers mostly look ordinary; fraud mostly looks risky, but some hides. */
function riskScoreFor(rng: Rng, fraud: boolean): number {
  let raw: number;
  if (fraud) {
    const roll = rng.next();
    raw = roll < 0.25 ? rng.normal(35, 12) : roll < 0.8 ? rng.normal(65, 12) : rng.normal(88, 6);
  } else {
    raw = rng.chance(0.85) ? rng.normal(20, 10) : rng.normal(50, 15);
  }
  return Math.round(clamp(raw, 0, 100));
}

export function makeCustomer(seed: number, day: number, id: Id, kind: CheckoutKind, minute: number, event: DayEvent): Customer {
  const rng = new Rng(hashSeed(seed, 'customer', day, id));
  const fraudRate = clamp(FRAUD_RATE[kind] * (event.fraud[kind] ?? 1), 0, 0.5);
  const fraud = rng.chance(fraudRate);
  // The old random amount is still drawn, and thrown away, so every other draw about this customer (funds, risk, OTP,
  // dCVV) falls exactly where it did before the scenarios existed.
  if (kind !== 'A2A' && kind !== 'ATM') amountFor(rng, kind, fraud);
  const scenario = scenarioFor(seed, day, id, kind, fraud);
  const amount = scenario.amount;
  const clientTimestamp = EPOCH_2026 + (day - 1) * 86_400_000 + minute * 60_000 + rng.int(0, 299) * 1000;
  const common = { txId: `tx_${id}`, amount, clientTimestamp, isFraud: fraud };

  switch (kind) {
    case 'POS': {
      const funding = rng.weighted(fundingMix);
      const payload: BankingPayload = {
        ...common,
        channel: 'POS',
        cardType: funding,
        rawCvv: '',
        riskScore: Math.round(clamp(rng.normal(12, 8), 0, 100)),
        ...fundsFor(rng, funding, event, fraud),
      };
      return { id, kind, scenario: scenario.id, minute, payload, otpCompletes: true };
    }

    case 'ECOM': {
      const funding = rng.weighted<FundingSource>([
        ['DEBIT', 45],
        ['CREDIT', 45],
        ['PREPAID', 10],
      ]);
      const payload: BankingPayload = {
        ...common,
        channel: rng.weighted<BankingPayload['channel']>([
          ['ECOMMERCE', 70],
          ['MOBILE_WALLET', 15],
          ['IN_APP', 15],
        ]),
        cardType: funding,
        rawCvv: digits(rng, 3),
        riskScore: riskScoreFor(rng, fraud),
        ...fundsFor(rng, funding, event, fraud),
        challenge: { status: 'NOT_STARTED', method: 'OTP' },
      };
      // A genuine customer almost always types the code. A fraudster holding only a card number almost never can.
      const otpCompletes = fraud ? rng.chance(0.12) : rng.chance(0.88);
      return { id, kind, scenario: scenario.id, minute, payload, otpCompletes };
    }

    case 'VIRTUAL': {
      const funding = rng.weighted<FundingSource>([
        ['DEBIT', 70],
        ['CREDIT', 25],
        ['PREPAID', 5],
      ]);
      const unknown = rng.chance(fraud ? 0.06 : 0.003);
      const mismatch = rng.chance(fraud ? 0.3 : 0.007);
      const expected = digits(rng, 3);
      let typed = expected;
      if (mismatch) {
        do typed = digits(rng, 3);
        while (typed === expected);
      }
      // How old the code is when it arrives. Customers use it within a minute or so; a replayed code has been sitting around.
      const ageSec = fraud ? rng.lognormal(75, 0.7) : rng.lognormal(22, 0.6);
      const payload: BankingPayload = {
        ...common,
        channel: rng.weighted<BankingPayload['channel']>([
          ['ECOMMERCE', 60],
          ['MOBILE_WALLET', 25],
          ['IN_APP', 15],
        ]),
        cardType: 'VIRTUAL_DPAN',
        rawCvv: typed,
        riskScore: Math.round(clamp(fraud ? rng.normal(55, 20) : rng.normal(18, 10), 0, 100)),
        ...fundsFor(rng, funding, event, fraud),
        virtualCard: {
          dpan: `5${digits(rng, 15)}`,
          vaultEntry: unknown
            ? null
            : {
                fpanLast4: digits(rng, 4),
                status: 'ACTIVE',
                fundingSource: funding,
                expectedDcvv: expected,
                dcvvIssuedAt: clientTimestamp - Math.round(ageSec * 1000),
              },
        },
      };
      return { id, kind, scenario: scenario.id, minute, payload, otpCompletes: true };
    }

    case 'BNPL': {
      const funding = rng.weighted<FundingSource>([
        ['DEBIT', 50],
        ['CREDIT', 50],
      ]);
      // Synthetic identities look good on paper but a little worse than real customers on the score.
      const score = Math.round(clamp(fraud ? rng.normal(585, 90) : rng.normal(645, 110), 200, 950));
      const pct = rng.weighted<number>([
        [20, 8],
        [25, 74],
        [30, 12],
        [50, 6],
      ]);
      const payload: BankingPayload = {
        ...common,
        channel: 'ECOMMERCE',
        cardType: funding,
        rawCvv: digits(rng, 3),
        riskScore: riskScoreFor(rng, fraud),
        ...fundsFor(rng, funding, event, fraud),
        bnpl: { underwritingScore: score, downPaymentMinor: Math.ceil((amount * pct) / 100) },
      };
      return { id, kind, scenario: scenario.id, minute, payload, otpCompletes: true };
    }

    case 'A2A': {
      // A message occasionally arrives malformed: a missing EndToEndId, a truncated BIC, or an amount that disagrees with itself.
      const flaw = rng.chance(fraud ? 0.03 : 0.012) ? rng.weighted<'e2e' | 'bic' | 'amount'>([['e2e', 40], ['bic', 35], ['amount', 25]]) : null;
      const a2a: A2aContext = {
        endToEndId: flaw === 'e2e' ? '' : `${amount < 5000 ? 'QR' : 'TFR'}-${day}-${digits(rng, 6)}`,
        debtorAgent: 'NOVAAU2S',
        creditorAgent: flaw === 'bic' ? 'HRBR' : rng.weighted<string>([['HRBRAU3MXXX', 45], ['WSTPAU2S', 30], ['CBAAAU2S', 25]]),
        interbankSettlementAmount: flaw === 'amount' ? Math.max(1, amount - 500) : amount,
        currency: 'AUD',
        purposeCode: 'OTHR',
        queueDepth: Math.round(clamp(rng.normal(12, 5), 0, 30)),
        liquidityAvailableMinor: 90_000_000,
      };
      const payload: BankingPayload = {
        ...common,
        channel: 'IN_APP',
        cardType: 'DEBIT',
        rawCvv: '',
        riskScore: Math.round(clamp(fraud ? rng.normal(45, 15) : rng.normal(8, 5), 0, 100)),
        ...fundsFor(rng, 'DEBIT', event, fraud),
        a2a,
      };
      return { id, kind, scenario: scenario.id, minute, payload, otpCompletes: true };
    }

    case 'ATM': {
      // A thief holding a stolen card mostly cannot guess the PIN, but one in five has watched it being typed.
      const knowsPin = fraud ? rng.chance(0.2) : rng.chance(0.997);
      const wrongPins = knowsPin
        ? rng.weighted<number>(fraud ? [[0, 55], [1, 30], [2, 15]] : [[0, 92], [1, 5.5], [2, 2.5]])
        : 3;
      const atm: AtmSession = { wrongPins, knowsPin, jams: rng.chance(0.03) };
      const payload: BankingPayload = {
        ...common,
        channel: 'ATM',
        cardType: 'DEBIT',
        rawCvv: '',
        riskScore: 0,
        ...fundsFor(rng, 'DEBIT', event, fraud),
      };
      return { id, kind, scenario: scenario.id, atm, minute, payload, otpCompletes: true };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tonight's settlement records
// ─────────────────────────────────────────────────────────────────────────────

/** Chance that a record's three legs differ by a few cents of rounding or FX dust, and how big the dust is. */
const NOISE_RATE = 0.22;
const NOISE_CENTS: ReadonlyArray<readonly [number, number]> = [
  [1, 30],
  [2, 25],
  [3, 18],
  [4, 12],
  [5, 8],
  [6, 4],
  [8, 3],
];
const AMOUNT_BREAK_RATE = 0.022;
const MISSING_BREAK_RATE = 0.009;
const DUPLICATE_BREAK_RATE = 0.005;

export interface SettlementRecord {
  payload: BankingPayload;
  truth: SettlementTruth;
}

/**
 * The three records for one approved payment. What the legs say is decided by the seed, the day it was
 * approved and its id, so it is the same whichever rules are in force.
 */
export function makeSettlement(seed: number, bornDay: number, txId: Id, cardType: CardType, heldCents: MinorUnits, glitch: number): SettlementRecord {
  const rng = new Rng(hashSeed(seed, 'settle', bornDay, txId));
  const roll = rng.next();
  const amountBreak = AMOUNT_BREAK_RATE * glitch;
  const missingBreak = MISSING_BREAK_RATE * glitch;
  const duplicateBreak = DUPLICATE_BREAK_RATE * glitch;

  let ledgerAmount: MinorUnits | null = heldCents;
  let clearingAmount: MinorUnits | null = heldCents;
  let switchAmount: MinorUnits | null = heldCents;
  let presentments = 1;
  let truth: SettlementTruth = { trueKind: 'NONE', trueVarianceCents: 0 };

  if (roll < amountBreak) {
    const error = Math.round(clamp(rng.lognormal(600, 1.2), 10, 50_000));
    const sign = rng.chance(0.5) ? 1 : -1;
    // One leg is wrong: the scheme's clearing record, or the acquirer's.
    if (rng.chance(0.6)) clearingAmount = Math.max(1, heldCents + sign * error);
    else switchAmount = Math.max(1, heldCents + sign * error);
    const legs = [ledgerAmount, clearingAmount, switchAmount];
    truth = { trueKind: 'AMOUNT', trueVarianceCents: Math.max(...legs) - Math.min(...legs) };
  } else if (roll < amountBreak + missingBreak) {
    const leg = rng.int(0, 2);
    if (leg === 0) ledgerAmount = null;
    else if (leg === 1) clearingAmount = null;
    else switchAmount = null;
    truth = { trueKind: 'MISSING', trueVarianceCents: heldCents };
  } else if (roll < amountBreak + missingBreak + duplicateBreak) {
    presentments = 2;
    truth = { trueKind: 'DUPLICATE', trueVarianceCents: heldCents };
  } else if (roll < amountBreak + missingBreak + duplicateBreak + NOISE_RATE) {
    const dust = rng.weighted(NOISE_CENTS);
    clearingAmount = Math.max(1, heldCents + (rng.chance(0.5) ? dust : -dust));
    if (rng.chance(0.3)) switchAmount = Math.max(1, heldCents + (rng.chance(0.5) ? 1 : 0));
    const legs = [ledgerAmount, clearingAmount, switchAmount];
    truth = { trueKind: 'NOISE', trueVarianceCents: Math.max(...legs) - Math.min(...legs) };
  }

  const payload: BankingPayload = {
    txId,
    amount: heldCents,
    channel: 'ECOMMERCE',
    cardType,
    rawCvv: '',
    clientTimestamp: EPOCH_2026 + (bornDay - 1) * 86_400_000,
    riskScore: 0,
    isFraud: false,
    availableBalance: 0,
    creditLimit: 0,
    settlement: { ledgerAmount, clearingAmount, switchAmount, clearingPresentments: presentments },
  };
  return { payload, truth };
}

/** A 0-1 number fixed by the parts, for decisions that must not shift when the rules change (mistakes, OTP delays). */
export function keyedUnit(...parts: Array<string | number>): number {
  return hashSeed(...parts) / 4294967296;
}


const EVENT_VI: Readonly<Record<DayEventId, { title: string; blurb: string; watch: string }>> = {
  NORMAL: {
    title: 'Một ngày bình thường',
    blurb: 'Lưu lượng ổn định với cao điểm buổi trưa. Không có gì bất thường.',
    watch: 'Một ngày tốt để nắm mức cơ sở. Quầy nào bận nhất vào giờ trưa?',
  },
  PROMO: {
    title: 'Flash sale',
    blurb: 'Một nhà bán lẻ lớn đang chạy flash sale. Thanh toán trực tuyến và hồ sơ trả góp 4 kỳ sẽ tăng vọt.',
    watch: 'Bàn rủi ro 3DS và quầy trả góp 4 kỳ sẽ thiếu người. Hãy theo dõi hàng chờ và những nhân viên mệt mỏi phía sau.',
  },
  FRAUD_RING: {
    title: 'Đường dây gian lận hoạt động',
    blurb: 'Bộ phận tình báo gian lận báo có một đường dây đang thử số thẻ bị đánh cắp trên mạng và dùng lại mã một lần đã bị bắt được.',
    watch: 'Bao nhiêu gian lận lọt qua luồng không ma sát, và siết ngưỡng 3DS sẽ khiến khách hàng thật trả giá thế nào?',
  },
  VISA_GLITCH: {
    title: 'Lỗi tệp Visa',
    blurb: 'Tổ chức thẻ cảnh báo tệp bù trừ tối nay bị lỗi: dễ có bản ghi thiếu vế và bản trình bị nhân đôi.',
    watch: 'Quầy đối soát và tài khoản treo. Ca đêm có theo kịp không, và ai xử lý đống tồn đọng ngày mai?',
  },
  PAYDAY: {
    title: 'Ngày nhận lương',
    blurb: 'Lương đã về qua đêm. Lượng quẹt thẻ tăng, số dư dồi dào, ít người cần chia hóa đơn.',
    watch: 'Lưu lượng tại cổng POS và sổ cái ghi nợ. Số từ chối do thiếu tiền sẽ giảm.',
  },
};

/** A day event's title, briefing and "watch" line in the active language. */
export function eventText(e: DayEvent): { title: string; blurb: string; watch: string } {
  return activeLocale() === 'vi' ? (EVENT_VI[e.id] ?? e) : { title: e.title, blurb: e.blurb, watch: e.watch };
}
