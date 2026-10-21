/**
 * Real-world context for every payment: not "a $62.80 POS swipe" but "🛒 Supermarket Groceries ($62.80)".
 *
 * Each channel has a short catalogue of everyday scenarios. A scenario fixes what the customer was doing and exactly how
 * much it cost, so the badge on a moving packet, the line in the inspector log and the title of a ledger entry all say the
 * same recognisable thing. The scenarios named in the brief come first in each list; the extra ones (marked `extra`) fill
 * the gaps the brief left (Pay-in-4 baskets, and the expensive purchases a fraudster makes) so every packet has a story.
 *
 * Everything is a pure function of the scenario id, so a packet only has to carry the id.
 */

import { formatAud } from '../engine/money';
import type { MinorUnits } from '../types/processLearning';
import type { CheckoutKind } from './types';

export interface Scenario {
  id: string;
  kind: CheckoutKind;
  emoji: string;
  title: string;
  amountCents: MinorUnits;
  /** Relative chance among genuine customers of the same channel. 0 means a fraudster's purchase only. */
  weight: number;
  /** Relative chance among fraud attempts of the same channel. */
  fraudWeight: number;
  /** Not one of the scenarios named in the brief. */
  extra?: boolean;
}

const s = (kind: CheckoutKind, id: string, emoji: string, title: string, dollars: number, weight: number, fraudWeight = 0, extra = false): Scenario => ({
  id,
  kind,
  emoji,
  title,
  amountCents: Math.round(dollars * 100),
  weight,
  fraudWeight,
  ...(extra ? { extra: true } : {}),
});

export const SCENARIOS: readonly Scenario[] = [
  // POS: card present in a shop, a station or a cafe.
  s('POS', 'pos-cafe', '☕', 'Corner Cafe Tap', 4.5, 45),
  s('POS', 'pos-grocery', '🛒', 'Supermarket Groceries', 62.8, 35),
  s('POS', 'pos-subway', '🚇', 'Subway Transit Gate', 2.75, 20),
  s('POS', 'pos-electronics', '📺', 'Electronics Superstore', 389, 0, 60, true),
  s('POS', 'pos-jeweller', '💍', 'City Jeweller', 640, 0, 40, true),

  // E-commerce: card not present, on a website or in an app.
  s('ECOM', 'ecom-fashion', '👗', 'Online Fashion Boutique', 120, 55),
  s('ECOM', 'ecom-games', '🎮', 'Digital Game Pass', 14.99, 45),
  s('ECOM', 'ecom-phones', '📱', 'Phone Reseller Bundle', 649, 0, 55, true),
  s('ECOM', 'ecom-giftcards', '🎁', 'Gift Card Marketplace', 250, 0, 45, true),

  // Virtual cards: a one-time masked number, for a trial or a subscription.
  s('VIRTUAL', 'virt-trial', '🔒', '1-Time Masked Card for Trial', 1, 70),
  s('VIRTUAL', 'virt-subscription', '🔒', 'Masked Card for App Subscription', 9.99, 30, 0, true),
  s('VIRTUAL', 'virt-tickets', '🎟️', 'Resale Tickets via Masked Card', 320, 0, 100, true),

  // Pay-in-4: a bigger basket split into four instalments.
  s('BNPL', 'bnpl-sofa', '🛋️', 'Sofa on Pay-in-4', 480, 35, 0, true),
  s('BNPL', 'bnpl-headphones', '🎧', 'Headphones on Pay-in-4', 240, 40, 0, true),
  s('BNPL', 'bnpl-ebike', '🚲', 'E-Bike on Pay-in-4', 900, 25, 55, true),
  s('BNPL', 'bnpl-laptop', '💻', 'Laptop on Pay-in-4', 1450, 0, 45, true),

  // A2A: an instant account-to-account transfer.
  s('A2A', 'a2a-split', '⚡', 'QR Bill Split', 18.5, 70),
  s('A2A', 'a2a-rent', '🏠', 'Apartment Rent Transfer', 850, 30),
  s('A2A', 'a2a-invoice', '🧾', 'Urgent Invoice to a New Payee', 1400, 0, 100, true),

  // ATM: cash from the machine on the pavement. The $100 note-pair is the one in the brief.
  s('ATM', 'atm-100', '🏧', 'Sidewalk ATM Cash Out', 100, 70),
  s('ATM', 'atm-50', '🏧', 'Sidewalk ATM Quick Cash', 50, 15, 0, true),
  s('ATM', 'atm-200', '🏧', 'Sidewalk ATM Weekend Cash', 200, 15, 0, true),
  s('ATM', 'atm-max', '🏧', 'Sidewalk ATM Maximum Withdrawal', 1000, 0, 100, true),
];

/**
 * The payments the learner sends with the preset action buttons of the guided flows. They are looked up by id like any other
 * scenario, but are not in SCENARIOS, so the daily traffic never draws them and every generated day stays exactly as it was.
 */
export const PRESET_SCENARIOS: readonly Scenario[] = [
  s('POS', 'preset-pos-20', '🎯', 'Practice Swipe', 20, 0, 0, true),
  s('POS', 'preset-pos-500', '🎯', 'Practice Swipe, Big Basket', 500, 0, 0, true),
  s('VIRTUAL', 'preset-token-45', '🎯', 'Practice Token Checkout', 45, 0, 0, true),
  s('ECOM', 'preset-3ds-250', '🎯', 'Practice 3DS Checkout', 250, 0, 0, true),
  s('ATM', 'preset-cdm-200', '🎯', 'Practice Cash Deposit', 200, 0, 0, true),
];

/** The botnet's card-testing attempt on day 3 (Chaos Monkey). Not in SCENARIOS, so ordinary days never draw it. */
export const BOT_SCENARIO_ID = 'chaos-bot-card-test';
export const CHAOS_SCENARIOS: readonly Scenario[] = [s('ECOM', BOT_SCENARIO_ID, '🤖', 'Botnet $1 Card Test', 1, 0, 0, true)];

const BY_ID: ReadonlyMap<string, Scenario> = new Map([...SCENARIOS, ...PRESET_SCENARIOS, ...CHAOS_SCENARIOS].map((x) => [x.id, x]));

export const scenarioById = (id: string | null | undefined): Scenario | null => (id ? (BY_ID.get(id) ?? null) : null);

/** "☕ Corner Cafe Tap ($4.50)": the one-line form used in badges, logs and ledger titles. */
export function scenarioLabel(scenario: Scenario | string | null | undefined): string {
  const x = typeof scenario === 'string' ? scenarioById(scenario) : scenario;
  return x ? `${x.emoji} ${x.title} (${formatAud(x.amountCents)})` : '';
}

/** "☕ Corner Cafe Tap": the same without the price, for tight spaces where the amount is already shown. */
export function scenarioShort(scenario: Scenario | string | null | undefined): string {
  const x = typeof scenario === 'string' ? scenarioById(scenario) : scenario;
  return x ? `${x.emoji} ${x.title}` : '';
}

/** The scenarios a channel can draw from, genuine customers or fraudsters. */
export function scenariosFor(kind: CheckoutKind, fraud: boolean): Array<readonly [Scenario, number]> {
  return SCENARIOS.filter((x) => x.kind === kind)
    .map((x) => [x, fraud ? x.fraudWeight : x.weight] as const)
    .filter(([, w]) => w > 0);
}
