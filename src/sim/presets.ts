/**
 * The preset actions of the guided flows: one click sends a scripted customer into the live bank ("Swipe $20"), or, for the
 * night flow, runs the clock to 23:00. A scripted customer takes the same desks, queues and ledger postings as everyone
 * else; its payload is simply chosen so the outcome is the one on the button, under whatever rules the bank runs now.
 */

import type { BankingPayload, CardType } from '../types/processLearning';
import type { FlowId } from '../types/viewport';
import type { BankRules } from './rules';
import type { CheckoutKind, Customer } from './types';
import { scenarioById } from './scenarios';

export type PresetVariant = 'success' | 'danger' | 'primary' | 'warning';

export type PresetId = 'pos-20' | 'pos-500' | 'token-45' | 'otp-250' | 'cdm-200' | 'eod';

export interface PresetDef {
  id: PresetId;
  flow: FlowId;
  icon: string;
  label: string;
  variant: PresetVariant;
  /** What the learner should watch for, for the button's tooltip. */
  hint: string;
  /** The scenario the payment is (see PRESET_SCENARIOS), or null for an action that is not a payment. */
  scenario: string | null;
}

export const PRESETS: readonly PresetDef[] = [
  { id: 'pos-20', flow: 1, icon: '▶', label: 'Swipe $20 (Approved 00)', variant: 'success', hint: 'A debit card with plenty in the account: watch the hold placed at Debit CASA and RC 00 come back.', scenario: 'preset-pos-20' },
  { id: 'pos-500', flow: 1, icon: '⚠', label: 'Swipe $500 (Declined 51 NSF)', variant: 'danger', hint: 'The account holds $120: the funds check fails and the terminal gets RC 51, insufficient funds.', scenario: 'preset-pos-500' },
  { id: 'token-45', flow: 2, icon: '▶', label: 'Token Checkout ($45)', variant: 'primary', hint: 'A virtual card number with a fresh dynamic CVV: the vault swaps the token, the code checks out, the payment is approved.', scenario: 'preset-token-45' },
  { id: 'otp-250', flow: 2, icon: '🔒', label: '3DS OTP Challenge ($250)', variant: 'warning', hint: 'A risk score inside the challenge band: the customer is texted a code, types it, and the payment goes through.', scenario: 'preset-3ds-250' },
  { id: 'cdm-200', flow: 3, icon: '▶', label: 'Deposit $200 Cash', variant: 'success', hint: 'Card and PIN at the machine, $200 in notes counted, and the account credited on the spot.', scenario: 'preset-cdm-200' },
  { id: 'eod', flow: 4, icon: '▶', label: 'Trigger Overnight EOD', variant: 'primary', hint: 'Runs the clock to 23:00 and plays the night cycle: batch clearing, Visa settlement, 3-way reconciliation.', scenario: null },
];

export const presetsFor = (flow: FlowId): PresetDef[] => PRESETS.filter((p) => p.flow === flow);
/** The preset that shows a guided flow at its clearest, which is what "Simulate this Flow" sends. */
export const PRIMARY_PRESET: Readonly<Record<FlowId, PresetId>> = { 1: 'pos-20', 2: 'token-45', 3: 'cdm-200', 4: 'eod' };
export const presetById = (id: string): PresetDef | undefined => PRESETS.find((p) => p.id === id);

/** A fixed moment the virtual card's code is checked against; the dynamic CVV is issued a few seconds before it. */
const TS = 1_800_000_000_000;

function payload(amount: number, over: Partial<BankingPayload>): BankingPayload {
  return {
    txId: 'tx_preset',
    amount,
    channel: 'POS',
    cardType: 'DEBIT' as CardType,
    rawCvv: '',
    clientTimestamp: TS,
    riskScore: 8,
    isFraud: false,
    availableBalance: 90_000,
    creditLimit: 0,
    ...over,
  };
}

/** The 3DS score halfway into today's challenge band, so the customer is always asked for a code, whatever the dials say. */
export function challengeScore(rules: BankRules): number {
  return Math.round((rules.frictionlessBelow + rules.rejectAtOrAbove - 1) / 2);
}

/**
 * The scripted customer behind a payment preset, or null for the night-cycle action. Its id and arrival minute are set by
 * the bank when it is sent in (BankSimulation.inject).
 */
export function presetCustomer(id: PresetId, rules: BankRules): Customer | null {
  const def = presetById(id);
  const scenario = def?.scenario ? scenarioById(def.scenario) : null;
  if (!def || !scenario) return null;
  const amount = scenario.amountCents;
  const make = (kind: CheckoutKind, p: BankingPayload, extra: Partial<Customer> = {}): Customer => ({ id: 'preset', kind, scenario: scenario.id, minute: 0, payload: p, otpCompletes: true, ...extra });
  switch (id) {
    case 'pos-20':
      return make('POS', payload(amount, { channel: 'POS', availableBalance: 90_000 }));
    case 'pos-500':
      return make('POS', payload(amount, { channel: 'POS', availableBalance: 12_000 }));
    case 'token-45':
      return make(
        'VIRTUAL',
        payload(amount, {
          channel: 'ECOMMERCE',
          cardType: 'VIRTUAL_DPAN',
          rawCvv: '482',
          virtualCard: { dpan: '5120 4471 0928 3316', vaultEntry: { fpanLast4: '4242', status: 'ACTIVE', fundingSource: 'DEBIT', expectedDcvv: '482', dcvvIssuedAt: TS - 6_000 } },
        }),
      );
    case 'otp-250':
      return make('ECOM', payload(amount, { channel: 'ECOMMERCE', rawCvv: '123', riskScore: challengeScore(rules) }), { otpCompletes: true });
    case 'cdm-200':
      return make('ATM', payload(amount, { channel: 'ATM', availableBalance: 40_000 }), { atm: { wrongPins: 0, knowsPin: true, jams: false, deposit: true } });
    case 'eod':
      return null;
  }
}
