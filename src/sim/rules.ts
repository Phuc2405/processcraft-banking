/**
 * The bank's policy dials. These are the numbers a risk or operations manager actually gets to turn,
 * and each one lands on a node setting in one of the four process diagrams, so the same
 * ProcessRunner that grades the Build Lab runs the bank.
 */

export interface BankRules {
  /** Virtual card: how long a dynamic CVV stays valid, in seconds. (dCVV Verifier: validityWindowMs) */
  dcvvWindowSec: number;
  /** 3DS: risk scores below this skip the challenge. (3DS Risk Evaluator: frictionlessBelow) */
  frictionlessBelow: number;
  /** 3DS: risk scores at or above this are rejected outright. (3DS Risk Evaluator: rejectAtOrAbove) */
  rejectAtOrAbove: number;
  /** BNPL: lowest underwriting score that gets a Pay-in-4 plan. (BNPL Underwriter: minScore) */
  bnplMinScore: number;
  /** BNPL: smallest down payment, as a share of the basket. (BNPL Underwriter: minDownPaymentPct) */
  bnplMinDownPct: number;
  /** Reconciliation: the biggest gap between the three records still treated as a match, in cents. (Recon Desk: toleranceMinor) */
  reconToleranceCents: number;
}

export const DEFAULT_RULES: BankRules = {
  dcvvWindowSec: 60,
  frictionlessBelow: 40,
  rejectAtOrAbove: 80,
  bnplMinScore: 600,
  bnplMinDownPct: 25,
  reconToleranceCents: 5,
};

export interface RuleMeta {
  key: keyof BankRules;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  help: string;
}

export const RULE_META: Record<keyof BankRules, RuleMeta> = {
  dcvvWindowSec: {
    key: 'dcvvWindowSec',
    label: 'dCVV validity window',
    unit: 's',
    min: 20,
    max: 150,
    step: 5,
    help: 'Longer is kinder to slow typists and easier for anyone replaying a stolen code.',
  },
  frictionlessBelow: {
    key: 'frictionlessBelow',
    label: 'Frictionless below risk',
    unit: '',
    min: 10,
    max: 90,
    step: 5,
    help: 'Higher means fewer OTP prompts for good customers, and more risky payments waved through unchallenged.',
  },
  rejectAtOrAbove: {
    key: 'rejectAtOrAbove',
    label: 'Reject at or above risk',
    unit: '',
    min: 40,
    max: 100,
    step: 5,
    help: 'Lower rejects more fraud outright, and starts rejecting genuine customers who simply look unusual.',
  },
  bnplMinScore: {
    key: 'bnplMinScore',
    label: 'BNPL minimum score',
    unit: '',
    min: 400,
    max: 800,
    step: 10,
    help: 'Lower approves more plans and takes on more customers who may not pay the remaining instalments.',
  },
  bnplMinDownPct: {
    key: 'bnplMinDownPct',
    label: 'BNPL minimum down payment',
    unit: '%',
    min: 10,
    max: 50,
    step: 5,
    help: 'Pay-in-4 collects 25% today. A higher floor sends customers who chose 25% back to a normal card.',
  },
  reconToleranceCents: {
    key: 'reconToleranceCents',
    label: 'Reconciliation tolerance',
    unit: '¢',
    min: 0,
    max: 1000,
    step: 5,
    help: 'Too tight and rounding noise floods the suspense account. Too loose and real errors are matched away.',
  },
};

export const RULE_KEYS = Object.keys(RULE_META) as Array<keyof BankRules>;

/** Pulls every dial inside its allowed range, and keeps the frictionless line below the reject line. */
export function clampRules(input: Partial<BankRules>): BankRules {
  const out = { ...DEFAULT_RULES };
  for (const key of RULE_KEYS) {
    const raw = input[key];
    const meta = RULE_META[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = Math.min(meta.max, Math.max(meta.min, Math.round(raw)));
  }
  if (out.frictionlessBelow >= out.rejectAtOrAbove) out.frictionlessBelow = Math.max(RULE_META.frictionlessBelow.min, out.rejectAtOrAbove - 5);
  return out;
}

export const rulesEqual = (a: BankRules, b: BankRules): boolean => RULE_KEYS.every((k) => a[k] === b[k]);

export function changedRules(from: BankRules, to: BankRules): Array<keyof BankRules> {
  return RULE_KEYS.filter((k) => from[k] !== to[k]);
}

export const formatRule = (key: keyof BankRules, value: number): string => {
  const unit = RULE_META[key].unit;
  return unit === '%' || unit === 's' ? `${value}${unit}` : unit === '¢' ? `${value}¢` : String(value);
};
