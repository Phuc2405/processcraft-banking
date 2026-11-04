/** The preset actions of the guided flows: one click sends a scripted customer into the live bank ("Swipe $20"), or, for the night flow, runs the clock to 23:00. */

import type { BankingPayload, CardType } from '../types/processLearning';
import type { FlowId } from '../types/viewport';
import type { BankRules } from './rules';
import type { CheckoutKind, Customer, DeclineReason, ExtendedContext } from './types';
import { opsActionById, type OpsActionId } from './retailOps';
import { scenarioById } from './scenarios';
import { audToVnd, buildVietQr } from './amlEngine';
import { activeLocale } from '../i18n/localeCore';
import type { DemoGroupId } from './demoGroups';

export type PresetVariant = 'success' | 'danger' | 'primary' | 'warning';

export type PresetId =
  | 'pos-20'
  | 'pos-500'
  | 'token-45'
  | 'otp-250'
  | 'token-51'
  | 'otp-locked'
  | '3ds-timeout'
  | 'cdm-200'
  | 'atm-51'
  | 'atm-61'
  | 'eod'
  | 'ekyc-open'
  | 'ekyc-deepfake'
  | 'teller-12k'
  | 'teller-smurf'
  | 'teller-51'
  | 'teller-frozen'
  | 'qr-780'
  | 'qr-rooted'
  | 'swift-6800'
  | 'swift-reject'
  | 'swift-sanction'
  | 'claim-return'
  | 'claim-rejected';

export interface PresetDef {
  id: PresetId;
  flow: FlowId;
  /** The child sub-group of its flow the button sits in (demoGroups.ts): a core group, or a retail sub-process with the same mechanics. */
  group: DemoGroupId;
  icon: string;
  label: string;
  variant: PresetVariant;
  /** What the learner should watch for, for the button's tooltip. */
  hint: string;
  /** The scenario the payment is (see PRESET_SCENARIOS), or null for an action that is not a payment. */
  scenario: string | null;
}

export const PRESETS: readonly PresetDef[] = [
  { id: 'pos-20', flow: 1, group: 'card-auth', icon: '▶', label: 'Swipe $20 (Approved 00)', variant: 'success', hint: 'A debit card with plenty in the account: watch the hold placed at Debit CASA and RC 00 come back.', scenario: 'preset-pos-20' },
  { id: 'pos-500', flow: 1, group: 'card-auth', icon: '⚠', label: 'Swipe $500 (Declined 51 - Insufficient Funds)', variant: 'danger', hint: 'The account holds $120: the funds check fails and the terminal gets RC 51, insufficient funds.', scenario: 'preset-pos-500' },
  { id: 'token-45', flow: 2, group: 'token-3ds', icon: '▶', label: 'Token Checkout $45 (Approved 00)', variant: 'success', hint: 'A virtual card number with a fresh dynamic CVV: the vault swaps the token, the code checks out, the payment is approved.', scenario: 'preset-token-45' },
  { id: 'otp-250', flow: 2, group: 'token-3ds', icon: '🔒', label: '3DS OTP Challenge $250 (Approved 00)', variant: 'primary', hint: 'A risk score inside the challenge band: the customer is texted a code, types it, and the payment goes through.', scenario: 'preset-3ds-250' },
  { id: 'token-51', flow: 2, group: 'token-3ds', icon: '⚠', label: 'Token Payment (Declined 51 - Insufficient Funds)', variant: 'danger', hint: 'The token and its dynamic CVV are valid, but the funding account holds $120 against a $180 basket: RC 51.', scenario: 'preset-token-51' },
  { id: 'otp-locked', flow: 2, group: 'token-3ds', icon: '⛔', label: 'Wrong OTP 3 Times (Card Locked)', variant: 'danger', hint: 'Three wrong one-time codes in the 3DS challenge: the issuer locks the card for online payments (RC 75).', scenario: 'preset-3ds-locked' },
  { id: '3ds-timeout', flow: 2, group: 'token-3ds', icon: '⌛', label: '3DS Session Timeout', variant: 'warning', hint: 'The challenge screen expires before a code is typed: the customer is not authenticated and the payment is refused (RC 05).', scenario: 'preset-3ds-timeout' },
  { id: 'cdm-200', flow: 3, group: 'atm-napas', icon: '▶', label: 'Deposit $200 Cash at CDM (Approved 00)', variant: 'success', hint: 'Card and PIN at the machine, $200 in notes counted, and the account credited on the spot.', scenario: 'preset-cdm-200' },
  { id: 'atm-51', flow: 3, group: 'atm-napas', icon: '⚠', label: 'ATM Withdrawal (Declined 51 - Insufficient Funds)', variant: 'danger', hint: 'The account holds $120 and the customer asks for $300: nothing is dispensed and the ATM shows RC 51.', scenario: 'preset-atm-51' },
  { id: 'atm-61', flow: 3, group: 'atm-napas', icon: '⚠', label: 'ATM Withdrawal (Declined 61 - Daily Limit Exceeded)', variant: 'danger', hint: '$1,800 already taken today on a $2,000 daily limit: another $500 is refused with RC 61, although the money is there.', scenario: 'preset-atm-61' },
  { id: 'eod', flow: 4, group: 'eod-batch', icon: '▶', label: 'Trigger Overnight EOD', variant: 'primary', hint: 'Runs the clock to 23:00 and plays the night cycle: batch clearing, Visa settlement, 3-way reconciliation.', scenario: null },
  { id: 'ekyc-open', flow: 5, group: 'ekyc-onboard', icon: '▶', label: 'Open an Account (eKYC)', variant: 'success', hint: 'A clean CCCD scan and a live selfie: identity verified, sanctions screen clean, account opened with a $50 deposit.', scenario: 'preset-ekyc-open' },
  { id: 'ekyc-deepfake', flow: 5, group: 'ekyc-onboard', icon: '⚠', label: 'Deepfake Selfie (EKYC_LIVENESS_FAILED)', variant: 'danger', hint: 'A replayed video instead of a live face: the liveness check fails and no account is opened.', scenario: 'preset-ekyc-deepfake' },
  { id: 'teller-12k', flow: 6, group: 'cash-ctr', icon: '▶', label: 'Withdraw $12,000 Cash (CTR Filed)', variant: 'primary', hint: 'Over the $10,000 line: the teller pays it out and a Cash Transaction Report is filed automatically.', scenario: 'preset-teller-12k' },
  { id: 'teller-smurf', flow: 6, group: 'cash-ctr', icon: '🔍', label: 'Split Cash Deposit (Smurfing, STR Review)', variant: 'warning', hint: 'The third deposit just under $10,000 this week: held as STR_PENDING, then an analyst files an STR and releases it.', scenario: 'preset-teller-smurf' },
  { id: 'teller-51', flow: 6, group: 'cash-ctr', icon: '⚠', label: 'Counter Withdrawal (Declined 51 - Insufficient Funds)', variant: 'danger', hint: 'The customer asks the teller for $2,000 on an account holding $800: the posting fails and no cash leaves the till.', scenario: 'preset-teller-51' },
  { id: 'teller-frozen', flow: 6, group: 'cash-ctr', icon: '🧊', label: 'Counter Withdrawal (Declined - Account Frozen)', variant: 'danger', hint: 'A freeze order is on the account: the teller refuses the $3,000 withdrawal whatever the balance (RC 62).', scenario: 'preset-teller-frozen' },
  { id: 'qr-780', flow: 7, group: 'wallet-qr', icon: '▶', label: 'Scan VietQR / FacePay (Approved 00)', variant: 'success', hint: 'A dynamic VietQR for $780: CRC checks out, the payment is over $400 so the face is matched, the device is clean, and Napas247 settles it inside the 5-second SLA.', scenario: 'preset-qr-780' },
  { id: 'qr-rooted', flow: 7, group: 'wallet-qr', icon: '⚠', label: 'Rooted Phone (FDS_HIGH_RISK_DEVICE)', variant: 'danger', hint: 'A jailbroken phone on a foreign VPN: the FDS scores it over 70 and stops the payment.', scenario: 'preset-qr-rooted' },
  { id: 'swift-6800', flow: 8, group: 'swift-remit', icon: '▶', label: 'SWIFT pacs.008 Transfer ($6,800 Study Abroad / Personal Remittance)', variant: 'primary', hint: 'A well-formed pacs.008 in USD: FacePay, a clean FDS and sanctions screen, then the correspondent bank pays it.', scenario: 'preset-swift-6800' },
  { id: 'swift-reject', flow: 8, group: 'swift-remit', icon: '✖', label: 'SWIFT Rejection pacs.002 (Invalid BIC/IBAN)', variant: 'danger', hint: 'The beneficiary bank’s BIC is malformed: the gateway answers with a pacs.002 RJCT before any money leaves the account.', scenario: 'preset-swift-reject' },
  { id: 'swift-sanction', flow: 8, group: 'swift-remit', icon: '🛑', label: 'SWIFT Sanction Hold (OFAC/AML Risk)', variant: 'danger', hint: 'The sender matches the OFAC list: the payment is frozen (AML_SANCTION_MATCH) and an analyst confirms the hit.', scenario: 'preset-swift-sanction' },
  { id: 'claim-return', flow: 8, group: 'disputes', icon: '↩', label: 'Claim a pacs.004 Return (Refunded)', variant: 'success', hint: 'Money sent to the wrong account: the disputes desk confirms the funds are recoverable and refunds the customer.', scenario: 'preset-claim-return' },
  { id: 'claim-rejected', flow: 8, group: 'disputes', icon: '✖', label: 'Claim a Return (Rejected - Funds Already Withdrawn)', variant: 'danger', hint: 'The wrong beneficiary has already spent the money and refuses to return it: the claim is rejected (DISPUTE_REJECTED) and the customer is pointed to the legal route.', scenario: 'preset-claim-rejected' },
];

export const presetsFor = (flow: FlowId): PresetDef[] => PRESETS.filter((p) => p.flow === flow);
/** The preset that shows a guided flow at its clearest, which is what "Simulate this Flow" sends. */
export const PRIMARY_PRESET: Readonly<Record<FlowId, PresetId>> = { 1: 'pos-20', 2: 'token-45', 3: 'cdm-200', 4: 'eod', 5: 'ekyc-open', 6: 'teller-12k', 7: 'qr-780', 8: 'swift-6800' };
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

/** The scripted customer behind a payment preset, or null for the night-cycle action. */
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
    case 'token-51':
      return make(
        'VIRTUAL',
        payload(amount, {
          channel: 'ECOMMERCE',
          cardType: 'VIRTUAL_DPAN',
          rawCvv: '482',
          availableBalance: 12_000,
          virtualCard: { dpan: '5120 4471 0928 3316', vaultEntry: { fpanLast4: '4242', status: 'ACTIVE', fundingSource: 'DEBIT', expectedDcvv: '482', dcvvIssuedAt: TS - 6_000 } },
        }),
      );
    case 'otp-250':
      return make('ECOM', payload(amount, { channel: 'ECOMMERCE', rawCvv: '123', riskScore: challengeScore(rules) }), { otpCompletes: true });
    case 'otp-locked':
    case '3ds-timeout':
      return make('ECOM', payload(amount, { channel: 'ECOMMERCE', rawCvv: '123', riskScore: challengeScore(rules) }), { otpCompletes: false, otpResult: id === 'otp-locked' ? 'FAILED' : 'TIMED_OUT' });
    case 'cdm-200':
      return make('ATM', payload(amount, { channel: 'ATM', availableBalance: 40_000 }), { atm: { wrongPins: 0, knowsPin: true, jams: false, deposit: true } });
    case 'atm-51':
      return make('ATM', payload(amount, { channel: 'ATM', availableBalance: 12_000 }), { atm: { wrongPins: 0, knowsPin: true, jams: false } });
    case 'atm-61':
      return make('ATM', payload(amount, { channel: 'ATM', availableBalance: 900_000 }), { atm: { wrongPins: 0, knowsPin: true, jams: false, dailyUsedCents: 180_000 } });
    case 'eod':
      return null;
    case 'ekyc-open':
    case 'ekyc-deepfake': {
      const fake = id === 'ekyc-deepfake';
      return make('ONBOARD', payload(amount, { channel: 'IN_APP', availableBalance: amount }), {
        ext: { subject: SUBJECT, identity: { ocrMatchPct: 98, livenessScore: fake ? 41 : 95, faceMatchPct: 96, citizenDbMatch: true, tamperScore: 6 } },
      });
    }
    case 'teller-12k':
    case 'teller-smurf': {
      const smurf = id === 'teller-smurf';
      const cash: NonNullable<ExtendedContext['cash']> = smurf
        ? { direction: 'IN', suspectSerials: 0, tillCents: 1_500_000, recentCashCents: [940_000, 910_000] }
        : { direction: 'OUT', suspectSerials: 0, tillCents: 1_800_000, recentCashCents: [] };
      return make('TELLER', payload(amount, { channel: 'POS', availableBalance: 4_000_000 }), { ext: { subject: SUBJECT, cash } });
    }
    case 'teller-51':
    case 'teller-frozen': {
      const frozen = id === 'teller-frozen';
      const cash: NonNullable<ExtendedContext['cash']> = { direction: 'OUT', suspectSerials: 0, tillCents: 1_800_000, recentCashCents: [] };
      return make('TELLER', payload(amount, { channel: 'POS', availableBalance: frozen ? 4_000_000 : 80_000 }), { ext: { subject: SUBJECT, cash, ...(frozen ? { accountFrozen: true } : {}) } });
    }
    case 'qr-780':
    case 'qr-rooted': {
      const rooted = id === 'qr-rooted';
      return make('QR', payload(amount, { channel: 'IN_APP', availableBalance: 400_000 }), {
        ext: {
          subject: SUBJECT,
          qr: { payload: buildVietQr({ bin: '970436', account: '10293847', amountVnd: audToVnd(amount) }) },
          biometric: { enrolled: true, faceMatchPct: 97, livenessScore: 95 },
          device: rooted ? { ipAnomaly: true, jailbroken: true, binVelocity: 0, newDevice: true } : CLEAN_DEVICE,
        },
      });
    }
    case 'swift-6800':
    case 'swift-reject':
    case 'swift-sanction':
      return make('SWIFT', payload(amount, { channel: 'IN_APP', availableBalance: 3_000_000 }), {
        ext: {
          subject: id === 'swift-sanction' ? { name: 'Viktor Volkanov', pep: false } : SUBJECT,
          biometric: { enrolled: true, faceMatchPct: 96, livenessScore: 94 },
          device: CLEAN_DEVICE,
          // The rejection's beneficiary bank code is one character short of a BIC: the gateway answers pacs.002 RJCT.
          swift: { endToEndId: 'SWIFT-PRESET-000001', debtorAgent: 'NOVAAU2SXXX', creditorAgent: id === 'swift-reject' ? 'CHASUS3' : 'CHASUS33XXX', foreignMinor: Math.round(amount / 1.52), currency: 'USD', fxRate: 1.52, country: 'US' },
        },
      });
    case 'claim-return':
    case 'claim-rejected':
      return make('DISPUTE', payload(amount, { channel: 'IN_APP', availableBalance: 90_000 }), {
        ext: { subject: SUBJECT, dispute: { type: 'PACS004_RETURN', ageDays: 2, merchantEvidence: false, journalShowsDispensed: false, fundsRecoverable: id === 'claim-return' } },
      });
  }
}

/** The scenario each retail demo's payment runs as. */
const OPS_SCENARIO: Readonly<Partial<Record<OpsActionId, string>>> = {
  'autopay-loan-250': 'preset-autopay-ok',
  'autopay-nsf-250': 'preset-autopay-nsf',
  'bnpl-approve-400': 'preset-bnpl-approve',
  'bnpl-decline-dti': 'preset-bnpl-dti',
  'card-late-fee': 'preset-card-late-fee',
  'waterfall-120': 'preset-waterfall-120',
  'waterfall-50': 'preset-waterfall-50',
  'risk-migrate-95dpd': 'preset-risk-migrate',
  'td-break-10k': 'preset-td-break',
  'collateral-lock': 'preset-collateral-lock',
  'collateral-liquidate': 'preset-collateral-liquidate',
  'bill-electric-85': 'preset-bill-electric',
  'wallet-cashin-100': 'preset-wallet-cashin',
  'atm-withdraw-100': 'preset-atm-withdraw',
  'atm-jam-200': 'preset-atm-jam',
  'teller-deposit-5000': 'preset-teller-deposit',
  'teller-exceed-limit': 'preset-teller-over-limit',
  'fee-annual-45': 'preset-fee-annual',
  'fee-card-10': 'preset-fee-card',
  'bill-nsf-51': 'preset-bill-nsf',
  'bill-timeout-68': 'preset-bill-timeout',
  'fee-collect-fail': 'preset-fee-collect-fail',
  'wallet-name-mismatch': 'preset-wallet-name-mismatch',
  'bnpl-decline-cic': 'preset-bnpl-cic',
  'waterfall-nsf': 'preset-waterfall-nsf',
  'risk-migrate-group5': 'preset-risk-group5',
  'risk-cure': 'preset-risk-cure',
  'teller-counterfeit': 'preset-teller-counterfeit',
  'td-mature-close': 'preset-td-mature',
  'td-break-pledged': 'preset-td-pledged',
  'td-break-id-mismatch': 'preset-td-id-mismatch',
  'collateral-shortfall': 'preset-collateral-shortfall',
  'collateral-release': 'preset-collateral-release',
};

/** A credit or savings operation: it walks the desks the book's decision crosses, and the decision itself comes from the book. */
const CREDIT_OPS: Readonly<Partial<Record<OpsActionId, { decline: DeclineReason | null; note: string }>>> = {
  'autopay-loan-250': { decline: null, note: 'Instalment collected under the mandate.' },
  'autopay-nsf-250': { decline: 'FUNDS', note: 'The account cannot cover the instalment: NSF.' },
  'bnpl-decline-dti': { decline: 'CREDIT_RISK', note: 'Debt service over 45% of income: refused.' },
  'card-late-fee': { decline: null, note: 'Late fee and overdue interest added to the card.' },
  'waterfall-120': { decline: null, note: 'Repayment allocated: penalty, interest, principal.' },
  'waterfall-50': { decline: null, note: 'Repayment allocated: penalty, interest, principal.' },
  'risk-migrate-95dpd': { decline: null, note: 'Moved to non-performing group 3 and provided for.' },
  'td-break-10k': { decline: null, note: 'Interest recalculated down to the demand rate.' },
  'collateral-lock': { decline: null, note: 'Pledged savings frozen on default.' },
  'collateral-liquidate': { decline: null, note: 'Collateral applied to the bad debt.' },
  'collateral-release': { decline: null, note: 'Loan repaid in full: the pledged savings are released.' },
  'bill-nsf-51': { decline: 'FUNDS', note: 'The account cannot cover the bill: the direct debit is returned (RC 51).' },
  'bill-timeout-68': { decline: 'TIMEOUT', note: 'The biller did not answer in time: the hold is reversed (RC 68).' },
  'fee-collect-fail': { decline: 'FUNDS', note: 'No balance and no overdraft line: the fee is not collected (RC 51).' },
  'wallet-name-mismatch': { decline: 'A2A_INVALID', note: 'The wallet is not linked to its holder’s own account: refused.' },
  'bnpl-decline-cic': { decline: 'CREDIT_RISK', note: 'Bad debt on the credit bureau (CIC group 3): refused.' },
  'waterfall-nsf': { decline: 'FUNDS', note: 'Nothing collected on the due date: the debt turns overdue.' },
  'risk-migrate-group5': { decline: null, note: 'Moved to loss group 5 and provided at 100%.' },
  'risk-cure': { decline: null, note: 'Overdue repaid in full: back to group 1, provision released.' },
  'td-mature-close': { decline: null, note: 'Closed at maturity with the full interest.' },
  'td-break-pledged': { decline: 'ACCOUNT_FROZEN', note: 'The savings book is pledged as collateral: it cannot be closed.' },
  'td-break-id-mismatch': { decline: 'PROCESS_ERROR', note: 'ID and signature do not match the depositor: nothing is paid out.' },
  'collateral-shortfall': { decline: null, note: 'Collateral applied, but a shortfall of the debt stays unrecovered.' },
};

/**
 * The scripted customer behind a retail demo: what the Inspector follows through the live bank. Null for the sensor alert,
 * which is not a payment. The bank has no fee channel, so a card fee runs as an authorisation of the fee's amount on a funded account.
 * A credit operation carries the scenario's amount, not `postedCents`: a returned $250 instalment posts only its $15 NSF fee, but $250 is what was declined.
 */
export function opsCustomer(id: OpsActionId, postedCents?: number): Customer | null {
  const scenarioId = OPS_SCENARIO[id];
  const scenario = scenarioId ? scenarioById(scenarioId) : null;
  if (!scenario) return null;
  const amount = postedCents ?? scenario.amountCents;
  const make = (kind: CheckoutKind, p: BankingPayload, extra: Partial<Customer> = {}): Customer => ({ id: 'preset', kind, scenario: scenario.id, minute: 0, payload: p, otpCompletes: true, ...extra });
  const credit = CREDIT_OPS[id];
  if (credit) return make('CREDIT_OPS', payload(scenario.amountCents, { channel: 'IN_APP', availableBalance: opsActionById(id).customerCents ?? 90_000 }), { ext: { subject: SUBJECT, creditOps: { route: opsActionById(id).route, label: scenario.title, note: credit.note, decline: credit.decline } } });
  switch (id) {
    case 'bnpl-approve-400':
      return make('BNPL', payload(scenario.amountCents, { channel: 'ECOMMERCE', availableBalance: 90_000, rawCvv: '123', bnpl: { underwritingScore: 720, downPaymentMinor: 10_000 } }));
    case 'bill-electric-85':
      return make('POS', payload(scenario.amountCents, { channel: 'POS', availableBalance: 90_000 }));
    case 'fee-annual-45':
    case 'fee-card-10':
      return make('POS', payload(scenario.amountCents, { channel: 'POS', availableBalance: 90_000 }));
    case 'wallet-cashin-100':
      return make(
        'A2A',
        payload(scenario.amountCents, {
          channel: 'IN_APP',
          availableBalance: 60_000,
          a2a: { endToEndId: 'WALLET-MOMO-000001', debtorAgent: 'NOVAAU2S', creditorAgent: 'HRBRAU3MXXX', interbankSettlementAmount: scenario.amountCents, currency: 'AUD', purposeCode: 'OTHR', queueDepth: 12, liquidityAvailableMinor: 90_000_000 },
        }),
      );
    case 'atm-withdraw-100':
      return make('ATM', payload(scenario.amountCents, { channel: 'ATM', availableBalance: 60_000 }), { atm: { wrongPins: 0, knowsPin: true, jams: false, deposit: false } });
    case 'atm-jam-200':
      return make('ATM', payload(scenario.amountCents, { channel: 'ATM', availableBalance: 60_000 }), { atm: { wrongPins: 0, knowsPin: true, jams: true, deposit: false } });
    case 'teller-deposit-5000':
    case 'teller-exceed-limit':
      return make('TELLER', payload(amount, { channel: 'POS', availableBalance: 4_000_000 }), { ext: { subject: SUBJECT, cash: { direction: 'IN', suspectSerials: 0, tillCents: 1_500_000, recentCashCents: [] } } });
    case 'teller-counterfeit':
      return make('TELLER', payload(scenario.amountCents, { channel: 'POS', availableBalance: 4_000_000 }), { ext: { subject: SUBJECT, cash: { direction: 'IN', suspectSerials: 2, tillCents: 1_500_000, recentCashCents: [] } } });
    default:
      return null;
  }
}

/** The customer every Phase 8 preset is, unless the preset is about the name. */
const SUBJECT = { name: 'Lan Nguyen', pep: false } as const;
const CLEAN_DEVICE = { ipAnomaly: false, jailbroken: false, binVelocity: 0, newDevice: false } as const;

const PRESET_VI: Readonly<Record<PresetId, { label: string; hint: string }>> = {
  'pos-20': { label: 'Quẹt thẻ $20 (Chấp thuận 00)', hint: 'Thẻ ghi nợ, tài khoản dư dả: xem khoản khoanh giữ tại CASA và RC 00 trả về.' },
  'pos-500': { label: 'Quẹt thẻ $500 (Từ chối 51 - Không đủ số dư)', hint: 'Tài khoản có $120: kiểm tra số dư thất bại và máy POS nhận RC 51, không đủ số dư.' },
  'token-45': { label: 'Thanh toán thẻ số hóa (Token) $45 (Chấp thuận 00)', hint: 'Số thẻ ảo kèm CVV động còn mới: kho token đổi số, mã hợp lệ, giao dịch được duyệt.' },
  'otp-250': { label: 'Xác thực mã OTP (3DS) $250 (Chấp thuận 00)', hint: 'Điểm rủi ro nằm trong dải thử thách: khách nhận mã qua tin nhắn, nhập mã, và giao dịch được duyệt.' },
  'token-51': { label: 'Thanh toán thẻ số hóa (Từ chối 51 - Không đủ số dư)', hint: 'Token và CVV động hợp lệ, nhưng tài khoản nguồn chỉ có $120 cho giỏ hàng $180: RC 51.' },
  'otp-locked': { label: 'Nhập sai OTP quá 3 lần (Khóa thẻ)', hint: 'Nhập sai mã OTP ba lần trong phiên 3DS: ngân hàng phát hành khóa thẻ cho giao dịch trực tuyến (RC 75).' },
  '3ds-timeout': { label: 'Hết thời gian xác thực 3DS (Từ chối 05)', hint: 'Màn hình xác thực hết hạn trước khi khách nhập mã: không xác thực được khách nên giao dịch bị từ chối (RC 05).' },
  'cdm-200': { label: 'Nộp $200 tiền mặt tại máy nộp tiền CDM (Chấp thuận 00)', hint: 'Thẻ và PIN tại máy, $200 tiền giấy được đếm, và tài khoản được ghi có ngay tại chỗ.' },
  'atm-51': { label: 'Rút tiền ATM (Từ chối 51 - Không đủ số dư)', hint: 'Tài khoản có $120 mà khách rút $300: máy không nhả tiền và hiển thị RC 51.' },
  'atm-61': { label: 'Rút tiền ATM (Từ chối 61 - Vượt hạn mức ngày)', hint: 'Đã rút $1,800 trong ngày với hạn mức $2,000: lần rút $500 tiếp theo bị từ chối với RC 61 dù tài khoản đủ tiền.' },
  eod: { label: 'Chạy xử lý cuối ngày (EOD)', hint: 'Chạy đồng hồ tới 23:00 và phát chu kỳ ban đêm: bù trừ theo lô, quyết toán Visa, đối soát 3 bên.' },
  'ekyc-open': { label: 'Mở tài khoản (eKYC)', hint: 'CCCD rõ nét và ảnh selfie người thật: xác minh danh tính, sàng lọc cấm vận sạch, mở tài khoản với $50 tiền gửi.' },
  'ekyc-deepfake': { label: 'Ảnh selfie giả mạo - Deepfake (Từ chối: không phải người thật)', hint: 'Một video phát lại thay cho khuôn mặt thật: không qua kiểm tra người thật và không mở tài khoản.' },
  'teller-12k': { label: 'Rút $12,000 tiền mặt (Báo cáo giao dịch giá trị lớn - CTR)', hint: 'Vượt ngưỡng $10,000: giao dịch viên chi tiền và báo cáo giao dịch tiền mặt (CTR) được lập tự động.' },
  'teller-smurf': { label: 'Nộp tiền mặt chia nhỏ (Nghi vấn rửa tiền - Rà soát STR)', hint: 'Lần nộp thứ ba ngay dưới $10,000 trong tuần: bị giữ ở trạng thái STR_PENDING, rồi chuyên viên lập STR và giải phóng.' },
  'teller-51': { label: 'Rút tiền tại quầy (Từ chối 51 - Không đủ số dư)', hint: 'Khách rút $2,000 tại quầy trong khi tài khoản có $800: hạch toán thất bại và không có tiền rời ngăn kéo.' },
  'teller-frozen': { label: 'Rút tiền tại quầy (Từ chối - Tài khoản đang bị Phong tỏa)', hint: 'Tài khoản có lệnh phong tỏa: giao dịch viên từ chối khoản rút $3,000 dù số dư còn (RC 62).' },
  'qr-780': { label: 'Quét VietQR / FacePay (Chấp thuận 00)', hint: 'VietQR động $780: CRC hợp lệ, giao dịch trên $400 nên cần khớp khuôn mặt, thiết bị sạch, và Napas247 quyết toán trong SLA 5 giây.' },
  'qr-rooted': { label: 'Điện thoại đã bẻ khóa/root (Từ chối: thiết bị rủi ro cao)', hint: 'Điện thoại đã jailbreak dùng VPN nước ngoài: FDS chấm trên 70 và chặn giao dịch.' },
  'swift-6800': { label: 'Chuyển tiền quốc tế SWIFT $6,800 (Du học / Chuyển tiền cá nhân)', hint: 'Điện pacs.008 đúng định dạng bằng USD: FacePay, FDS và sàng lọc cấm vận sạch, rồi ngân hàng đại lý thanh toán.' },
  'swift-reject': { label: 'Lệnh SWIFT bị trả về (Sai mã BIC/IBAN ngân hàng nhận)', hint: 'Mã BIC của ngân hàng thụ hưởng sai định dạng: cổng SWIFT trả pacs.002 RJCT trước khi tiền rời tài khoản.' },
  'swift-sanction': { label: 'Tạm dừng kiểm tra Cấm vận SWIFT (AML/OFAC)', hint: 'Người gửi trùng tên trong danh sách cấm vận OFAC: lệnh chuyển tiền bị tạm giữ (mã AML_SANCTION_MATCH) để chuyên viên AML xác minh.' },
  'claim-return': { label: 'Tra soát chuyển nhầm pacs.004 (Đã hoàn tiền)', hint: 'Tiền chuyển nhầm tài khoản: quầy tra soát xác nhận tiền thu hồi được và hoàn cho khách.' },
  'claim-rejected': { label: 'Tra soát chuyển nhầm (Từ chối - Người nhận đã rút tiền)', hint: 'Người nhận nhầm đã tiêu hết tiền và không đồng ý hoàn trả: yêu cầu tra soát bị từ chối (DISPUTE_REJECTED), khách được hướng dẫn khởi kiện theo pháp luật.' },
};

/** A preset's button label and tooltip in a given language. */
export const presetTextIn = (p: PresetDef, locale: 'en' | 'vi'): { label: string; hint: string } => (locale === 'vi' ? PRESET_VI[p.id] : { label: p.label, hint: p.hint });

/** A preset's button label and tooltip in the active language. */
export const presetText = (p: PresetDef): { label: string; hint: string } => presetTextIn(p, activeLocale());
