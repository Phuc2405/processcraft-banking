/** Banking capability handlers: the business logic behind each TASK node. */

import { tr } from '../i18n/localeCore';
import type {
  BankingCapability,
  BankingPayload,
  ConfigValue,
  DerivedFacts,
  FundingSource,
  Id,
  MinorUnits,
  SettlementContext,
  TokenExceptionCode,
} from '../types/processLearning';
import { investigate, screen } from './aml';
import { advanceDispute } from './dispute';
import { gateway } from './iso20022';
import { formatAud } from './money';

export interface CapabilityContext {
  nodeId: Id;
  nodeLabel: string;
  payload: Readonly<BankingPayload>;
  derived: Readonly<DerivedFacts>;
  /** Node configuration with catalog defaults already applied. */
  config: Readonly<Record<string, ConfigValue>>;
}

export type CapabilityResult =
  | { ok: true; facts: Partial<DerivedFacts>; note?: string }
  | { ok: false; code: TokenExceptionCode; message: string };

export type CapabilityHandler = (ctx: CapabilityContext) => CapabilityResult;

const ok = (facts: Partial<DerivedFacts>, note?: string): CapabilityResult =>
  note === undefined ? { ok: true, facts } : { ok: true, facts, note };

export { formatAud };

/** Card numbers never appear in traces or feedback in full. */
const maskPan = (pan: string): string => `****${pan.slice(-4)}`;

const num = (config: Readonly<Record<string, ConfigValue>>, key: string): number => Number(config[key]);


/** Maps a DPAN to the real card (FPAN) and the account that funds it. */
const tokenVault: CapabilityHandler = ({ payload }) => {
  if (payload.cardType !== 'VIRTUAL_DPAN') {
    return ok(
      { tokenStatus: 'NOT_APPLICABLE', fundingSource: payload.cardType },
      'Not a virtual card, so there is no token to resolve.',
    );
  }
  const card = payload.virtualCard;
  const entry = card?.vaultEntry;
  if (!card || !entry) {
    return {
      ok: false,
      code: 'TOKEN_NOT_FOUND',
      message: card
        ? tr({ en: 'The DPAN presented has no mapping in the token vault', vi: 'DPAN được xuất trình không có ánh xạ trong kho token' })
        : tr({ en: 'No DPAN was presented to look up', vi: 'Không có DPAN nào được xuất trình để tra cứu' }),
    };
  }
  return ok(
    {
      tokenStatus: entry.status === 'ACTIVE' ? 'RESOLVED' : 'SUSPENDED',
      fundingSource: entry.fundingSource,
      fpanLast4: entry.fpanLast4,
    },
    `DPAN ${maskPan(card.dpan)} maps to card ending ${entry.fpanLast4}, funded by ${entry.fundingSource}; token is ${entry.status}.`,
  );
};

/** Checks the dynamic CVV matches and was generated inside the validity window. */
const dcvvVerifier: CapabilityHandler = ({ payload, config }) => {
  if (payload.cardType !== 'VIRTUAL_DPAN') {
    return ok({ dcvvStatus: 'NOT_APPLICABLE' }, 'Not a virtual card, so there is no dynamic CVV.');
  }
  const windowMs = num(config, 'validityWindowMs');
  const entry = payload.virtualCard?.vaultEntry;
  if (!entry) {
    return ok({ dcvvStatus: 'MISMATCH' }, 'No vault entry to compare the dCVV against (run the Token Vault first).');
  }
  if (payload.rawCvv !== entry.expectedDcvv) {
    return ok({ dcvvStatus: 'MISMATCH' }, 'The CVV entered does not match the current dCVV.');
  }
  const ageMs = payload.clientTimestamp - entry.dcvvIssuedAt;
  const age = `${(ageMs / 1000).toFixed(1)} s old, window ${(windowMs / 1000).toFixed(0)} s`;
  if (ageMs < 0) {
    return ok({ dcvvStatus: 'MISMATCH' }, `The request is timestamped before the dCVV was issued (${age}).`);
  }
  return ok(
    { dcvvStatus: ageMs > windowMs ? 'EXPIRED' : 'VALID' },
    `dCVV matches and is ${age}: ${ageMs > windowMs ? 'expired' : 'valid'}.`,
  );
};

/** Picks the 3DS path from the risk score against the configured thresholds, and reads a finished challenge. */
const threeDsEvaluator: CapabilityHandler = ({ payload, config }) => {
  const frictionlessBelow = num(config, 'frictionlessBelow');
  const rejectAtOrAbove = num(config, 'rejectAtOrAbove');
  const risk = payload.riskScore;

  let path: NonNullable<DerivedFacts['threeDsPath']>;
  let why: string;
  if (risk >= rejectAtOrAbove) {
    path = 'REJECT';
    why = `risk ${risk} is at or above the reject line (${rejectAtOrAbove})`;
  } else if (risk < frictionlessBelow) {
    path = 'FRICTIONLESS';
    why = `risk ${risk} is below ${frictionlessBelow}`;
  } else {
    const status = payload.challenge?.status ?? 'NOT_STARTED';
    if (status === 'COMPLETED') {
      path = 'CHALLENGE_PASSED';
      why = `risk ${risk} needs a challenge and it was completed`;
    } else if (status === 'NOT_STARTED') {
      path = 'CHALLENGE';
      why = `risk ${risk} needs a challenge and none has been done yet`;
    } else {
      path = 'CHALLENGE_FAILED';
      why = `risk ${risk} needs a challenge and it ended ${status}`;
    }
  }
  const authenticated = path === 'FRICTIONLESS' || path === 'CHALLENGE_PASSED';
  return ok(
    { threeDsPath: path, authenticated, liabilityShift: authenticated ? 'ISSUER' : 'MERCHANT' },
    `${path}: ${why}.`,
  );
};

/** Checks the funding account can cover the amount and, if so, places an authorization hold. */
const coreLedgerCheck: CapabilityHandler = ({ payload, derived, config }) => {
  const source: FundingSource =
    derived.fundingSource ?? (payload.cardType === 'VIRTUAL_DPAN' ? 'DEBIT' : payload.cardType);
  const sourceNote =
    derived.fundingSource === undefined && payload.cardType === 'VIRTUAL_DPAN'
      ? ' The funding source is unknown (the Token Vault has not run), so it is treated as debit.'
      : '';

  // What is being debited: the whole purchase, or only the Pay-in-4 down payment (instalment 1).
  let amount = payload.amount;
  let what = formatAud(amount);
  if (config.amountToCheck === 'FIRST_INSTALMENT') {
    if (derived.installment1Minor === undefined) {
      return ok(
        { ledgerDecision: 'INSUFFICIENT_FUNDS' },
        'This check is set to debit the first instalment, but no Pay-in-4 plan was approved on this path, so there is no down payment to debit. Nothing was held.',
      );
    }
    amount = derived.installment1Minor;
    what = `Down payment of ${formatAud(amount)}`;
  }

  if (source === 'CREDIT') {
    const spendable = Math.min(payload.availableBalance, payload.creditLimit);
    if (amount > spendable) {
      return ok(
        { ledgerDecision: 'OVER_LIMIT' },
        `${what} exceeds the spendable credit of ${formatAud(spendable)} (available ${formatAud(payload.availableBalance)}, limit ${formatAud(payload.creditLimit)}).${sourceNote}`,
      );
    }
    return ok(
      { ledgerDecision: 'SUFFICIENT', authHoldMinor: amount },
      `${what} is within spendable credit of ${formatAud(spendable)}. Hold of ${formatAud(amount)} placed.${sourceNote}`,
    );
  }
  if (amount > payload.availableBalance) {
    return ok(
      { ledgerDecision: 'INSUFFICIENT_FUNDS' },
      `${what} exceeds the available balance of ${formatAud(payload.availableBalance)}.${sourceNote}`,
    );
  }
  return ok(
    { ledgerDecision: 'SUFFICIENT', authHoldMinor: amount },
    `${what} is within the available balance of ${formatAud(payload.availableBalance)}. Hold of ${formatAud(amount)} placed.${sourceNote}`,
  );
};

/** Matches the ledger posting, scheme clearing record and acquirer settlement, and classifies any break. */
const reconDesk: CapabilityHandler = ({ payload, config }) => {
  const s = payload.settlement;
  const missing: string[] = [];
  if (!s || s.ledgerAmount === null) missing.push('core ledger');
  if (!s || s.clearingAmount === null) missing.push('scheme clearing file');
  if (!s || s.switchAmount === null) missing.push('acquirer settlement report');
  if (!s || missing.length > 0) {
    return ok({ reconStatus: 'BREAK_MISSING_LEG' }, `Break: no record in the ${missing.join(' and ')}.`);
  }
  const legs = [s.ledgerAmount!, s.clearingAmount!, s.switchAmount!];
  const variance = Math.max(...legs) - Math.min(...legs);
  if (s.clearingPresentments > 1) {
    return ok(
      { reconStatus: 'BREAK_DUPLICATE', reconVarianceMinor: variance },
      `Break: the clearing file presented this transaction ${s.clearingPresentments} times.`,
    );
  }
  const tolerance = num(config, 'toleranceMinor');
  if (variance <= tolerance) {
    return ok(
      { reconStatus: 'MATCHED', reconVarianceMinor: variance },
      `Matched: the legs differ by ${formatAud(variance)}, within the ${formatAud(tolerance)} tolerance.`,
    );
  }
  const fx = classifyFx(s, tolerance);
  if (fx.explained) {
    return ok(
      { reconStatus: 'BREAK_AMOUNT', reconVarianceMinor: variance, reconCause: 'FX_RATE', fxDirection: fx.direction },
      `Break: the legs differ by ${formatAud(variance)}. ${fx.why} That is a foreign-exchange ${fx.direction === 'LOSS' ? 'loss' : 'gain'}, not an error.`,
    );
  }
  return ok(
    { reconStatus: 'BREAK_AMOUNT', reconVarianceMinor: variance, reconCause: 'UNEXPLAINED' },
    `Break: the legs differ by ${formatAud(variance)}, more than the ${formatAud(tolerance)} tolerance.${fx.why ? ` ${fx.why}` : ''}`,
  );
};

/** A foreign-currency purchase is booked at one exchange rate and settled by the scheme at another, so the legs differ by the foreign amount times the difference between the two rates. */
function classifyFx(s: SettlementContext, tolerance: MinorUnits): { explained: boolean; direction: 'GAIN' | 'LOSS'; why: string } {
  const fx = s.fx;
  const direction = (s.clearingAmount ?? 0) > (s.ledgerAmount ?? 0) ? 'LOSS' : 'GAIN';
  if (!fx || s.ledgerAmount === null || s.clearingAmount === null || s.switchAmount === null) return { explained: false, direction, why: '' };
  const expected = Math.round((fx.foreignAmountMinor * (fx.settledRateMicro - fx.bookedRateMicro)) / 1_000_000);
  const actual = s.clearingAmount - s.ledgerAmount;
  const rates = `${fx.currency} booked at ${(fx.bookedRateMicro / 1_000_000).toFixed(4)}, settled at ${(fx.settledRateMicro / 1_000_000).toFixed(4)}: that moves the amount by ${formatAud(Math.abs(expected))}.`;
  if (Math.abs(s.clearingAmount - s.switchAmount) > tolerance) return { explained: false, direction, why: `The clearing file and the switch report also disagree with each other, so the rate alone does not explain it. (${rates})` };
  if (Math.abs(actual - expected) > tolerance) return { explained: false, direction, why: `The rate difference does not explain the gap. (${rates})` };
  return { explained: true, direction, why: `The rates explain it: ${rates}` };
}

/** Decides Pay-in-4 eligibility and, when eligible, works out instalment 1 (the down payment). A ledger check set to "first instalment" does the debit. */
const bnplUnderwriter: CapabilityHandler = ({ payload, config }) => {
  const application = payload.bnpl;
  if (!application) {
    return ok(
      { bnplDecision: 'INELIGIBLE', underwritingScore: 0, downPaymentPct: 0 },
      'No BNPL application on this transaction.',
    );
  }
  const minScore = num(config, 'minScore');
  const minPct = num(config, 'minDownPaymentPct');
  const { underwritingScore, downPaymentMinor } = application;
  const pct = payload.amount > 0 ? (downPaymentMinor / payload.amount) * 100 : 0;
  const scoreOk = underwritingScore >= minScore;
  // Integer comparison, so 25% of $100.01 is not decided by float rounding.
  const downOk = payload.amount > 0 && downPaymentMinor * 100 >= payload.amount * minPct;
  const base = { underwritingScore, downPaymentPct: Math.round(pct * 100) / 100 };

  if (!scoreOk || !downOk) {
    const reasons = [
      !scoreOk ? `score ${underwritingScore} is below ${minScore}` : null,
      !downOk ? `down payment is ${base.downPaymentPct}% of the amount, below ${minPct}%` : null,
    ].filter(Boolean);
    return ok({ ...base, bnplDecision: 'INELIGIBLE' }, `Ineligible: ${reasons.join(' and ')}.`);
  }
  const collected = Math.min(downPaymentMinor, payload.amount);
  const remaining = payload.amount - collected;
  return ok(
    {
      ...base,
      bnplDecision: 'ELIGIBLE',
      installment1Minor: collected,
      installmentAmountMinor: Math.ceil(remaining / 3),
    },
    `Eligible: score ${underwritingScore}, down payment ${base.downPaymentPct}%. Instalment 1 of ${formatAud(collected)} is due now; 3 more of ${formatAud(Math.ceil(remaining / 3))}. It is not debited until a ledger check collects it.`,
  );
};

/** The A2A payment gateway. */
const a2aGateway: CapabilityHandler = ({ payload, config }) => {
  const result = gateway(payload, {
    instantLimitMinor: num(config, 'instantLimitMinor'),
    queueCapacity: num(config, 'queueCapacity'),
    priorityReserveMinor: num(config, 'priorityReserveMinor'),
  });
  if (!result) {
    return ok(
      { a2aValid: false, a2aRail: 'INSTANT', a2aPriority: 'NORMAL', a2aQueue: 'OPEN', a2aLiquidity: 'SHORTFALL' },
      'No pacs.008 message arrived with this payment, so there is nothing to validate or route.',
    );
  }
  const a = payload.a2a!;
  const checks = result.valid ? 'pacs.008 is well formed' : `pacs.008 is invalid (${result.issues.map((i) => i.field).join(', ')})`;
  const rail = `${result.rail}: ${formatAud(payload.amount)} against an instant limit of ${formatAud(num(config, 'instantLimitMinor'))}`;
  const queue = `queue ${a.queueDepth} of ${num(config, 'queueCapacity')} ${result.queue === 'CONGESTED' ? '(congested)' : '(open)'}`;
  const liquidity = `${result.priority === 'PRIORITY' ? 'priority payments may use all' : 'ordinary payments may use only what is above the reserve:'} ${formatAud(result.usableLiquidityMinor)} of ${formatAud(a.liquidityAvailableMinor)}`;
  return ok(
    { a2aValid: result.valid, a2aRail: result.rail, a2aPriority: result.priority, a2aQueue: result.queue, a2aLiquidity: result.liquidity },
    `${checks}. Rail ${rail}. ${result.priority} (purpose ${a.purposeCode}). ${queue}. Liquidity ${result.liquidity}: ${liquidity}.`,
  );
};

/** Screens the customer against the sanctions and PEP lists and looks for structuring in recent cash deposits. */
const amlScreening: CapabilityHandler = ({ payload, config }) => {
  const aml = payload.aml;
  if (!aml) {
    return ok({ amlStatus: 'CLEAR', amlMatchScore: 0, amlList: 'NONE', amlStructuring: false }, 'No customer profile came with this payment, so nothing could be screened.');
  }
  const r = screen(aml, {
    matchThreshold: num(config, 'matchThreshold'),
    reportingThresholdMinor: num(config, 'reportingThresholdMinor'),
    minStructuringDeposits: num(config, 'minStructuringDeposits'),
  });
  const parts: string[] = [];
  parts.push(
    r.best
      ? `Closest name on the lists: '${r.best.entry.name}' (${r.best.entry.list}), score ${r.score} against a threshold of ${num(config, 'matchThreshold')}: ${r.list === 'NONE' ? 'no hit' : 'HIT'}.`
      : 'The watchlists are empty, so there is no name to match.',
  );
  parts.push(
    r.structuring.suspected
      ? `Structuring: ${r.structuring.nearThreshold.length} cash deposits just under ${formatAud(num(config, 'reportingThresholdMinor'))} total ${formatAud(r.structuring.total)}.`
      : 'No structuring pattern in the cash deposits.',
  );
  return ok({ amlStatus: r.status, amlMatchScore: r.score, amlList: r.list, amlStructuring: r.structuring.suspected }, parts.join(' '));
};

/** Compares the customer with the person on the list, using only identity evidence from the audit log. */
const caseInvestigation: CapabilityHandler = ({ payload }) => {
  const aml = payload.aml;
  if (!aml) return ok({ caseVerdict: 'INCONCLUSIVE', caseEvidenceCount: 0 }, 'There is no customer profile to investigate.');
  const best = screen(aml, { matchThreshold: 0, reportingThresholdMinor: 1, minStructuringDeposits: 1 }).best;
  const r = investigate(aml.customer, best?.entry ?? null, aml.auditLog);
  return ok({ caseVerdict: r.verdict, caseEvidenceCount: r.evidence.length }, `${r.verdict.replace('_', ' ')}. ${r.reasons.join(' ')}`);
};

/** Moves a card dispute through its stages and works out who is liable. */
const chargebackDesk: CapabilityHandler = ({ payload, derived, config }) => {
  const d = payload.dispute;
  if (!d) {
    return ok({ disputeWindow: 'OPEN', disputeLiability: 'MERCHANT', disputeNext: 'NONE' }, 'There is no dispute case on this payment.');
  }
  const step = advanceDispute(d, derived.authenticated, num(config, 'filingWindowDays'));
  const blind = derived.authenticated === undefined ? ' The 3DS Risk Evaluator has not run on this path, so the desk cannot see whether the purchase was authenticated and treats it as not.' : '';
  return ok({ disputeWindow: step.window, disputeLiability: step.liability, disputeNext: step.next }, `${step.why}${blind}`);
};

export const CAPABILITY_HANDLERS: Readonly<Record<BankingCapability, CapabilityHandler>> = {
  TOKEN_VAULT: tokenVault,
  DCVV_VERIFIER: dcvvVerifier,
  THREE_DS_EVALUATOR: threeDsEvaluator,
  CORE_LEDGER_CHECK: coreLedgerCheck,
  RECON_DESK: reconDesk,
  BNPL_UNDERWRITER: bnplUnderwriter,
  A2A_GATEWAY: a2aGateway,
  AML_SCREENING: amlScreening,
  CASE_INVESTIGATION: caseInvestigation,
  CHARGEBACK_DESK: chargebackDesk,
};
