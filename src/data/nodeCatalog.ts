/**
 * The palette's building blocks and the names an edge condition may use.
 *
 *   NODE_CATALOG          node definitions the palette draws from
 *   CONDITION_VARIABLES   names usable in edge conditions, and which are off limits
 */

import type { ConditionVariable, Id, NodeDefinition, Outcome, Port } from '../types/processLearning';

// ─────────────────────────────────────────────────────────────────────────────
// Port templates
// ─────────────────────────────────────────────────────────────────────────────

const inPort = (id: Id = 'in', maxEdges = 4): Port => ({
  id,
  label: 'In',
  direction: 'IN',
  role: 'FLOW',
  maxEdges,
});
const outPort = (id: Id = 'out', label = 'Next'): Port => ({
  id,
  label,
  direction: 'OUT',
  role: 'FLOW',
  maxEdges: 1,
});
const errorPort = (): Port => ({
  id: 'error',
  label: 'On error',
  direction: 'OUT',
  role: 'ERROR',
  maxEdges: 1,
});

const OUTCOMES: Outcome[] = ['APPROVED', 'DECLINED', 'ROUTED_TO_SUSPENSE', 'CHALLENGE_REQUIRED'];

// ─────────────────────────────────────────────────────────────────────────────
// Node catalog
// ─────────────────────────────────────────────────────────────────────────────

export const NODE_CATALOG: NodeDefinition[] = [
  // 1. Start event
  {
    id: 'nd_start_payment',
    type: 'EVENT_START',
    bankingCapability: null,
    label: 'Payment Request',
    description: 'Where every transaction enters your process. A diagram needs exactly one.',
    inputPorts: [],
    outputPorts: [outPort('out')],
    portPolicy: { minIn: 0, maxIn: 0, minOut: 1, maxOut: 1 },
    configSchema: [],
    baseLatencyMs: 0,
    readsFacts: [],
    writesFacts: ['isVirtual'],
    raises: [],
  },

  // 2. End event
  {
    id: 'nd_end_outcome',
    type: 'EVENT_END',
    bankingCapability: null,
    label: 'End: Outcome',
    description:
      'Finishes the transaction with the outcome you choose. Use one per distinct result so each path is easy to read.',
    inputPorts: [inPort('in', 8)],
    outputPorts: [],
    portPolicy: { minIn: 1, maxIn: 1, minOut: 0, maxOut: 0 },
    configSchema: [
      {
        key: 'outcome',
        label: 'Outcome',
        type: 'enum',
        defaultValue: 'DECLINED',
        options: OUTCOMES,
        required: true,
        description: 'The result reported to the cardholder, merchant, or ops queue.',
      },
      {
        key: 'reasonCode',
        label: 'Reason code',
        type: 'string',
        defaultValue: '',
        description: 'Optional. Some levels check it, for example to send breaks to the right suspense queue.',
      },
    ],
    baseLatencyMs: 0,
    readsFacts: [],
    writesFacts: [],
    raises: [],
  },

  // 3. XOR gateway
  {
    id: 'nd_gateway_xor',
    type: 'GATEWAY_XOR',
    bankingCapability: null,
    label: 'Decision (XOR)',
    description:
      'Sends the transaction down exactly one branch. Edges are tried in priority order; the first true condition wins. Mark one edge as default so nothing can fall through.',
    inputPorts: [inPort('in_1', 1), inPort('in_2', 1)],
    outputPorts: [outPort('out_1', 'Branch 1'), outPort('out_2', 'Branch 2'), outPort('out_3', 'Branch 3'), outPort('out_4', 'Branch 4')],
    portPolicy: { minIn: 1, maxIn: 4, minOut: 1, maxOut: 6 },
    configSchema: [],
    baseLatencyMs: 1,
    readsFacts: ['any condition variable'],
    writesFacts: [],
    raises: ['NO_MATCHING_BRANCH', 'INVALID_EXPRESSION'],
  },

  // 4. AND gateway
  {
    id: 'nd_gateway_and',
    type: 'GATEWAY_AND',
    bankingCapability: null,
    label: 'Parallel (AND)',
    description:
      'Fork: sends the transaction down every outgoing branch at once. Join: waits until a token has arrived on every connected incoming branch. If one branch never arrives, the join deadlocks.',
    inputPorts: [inPort('in_1', 1), inPort('in_2', 1)],
    outputPorts: [outPort('out_1', 'Branch 1'), outPort('out_2', 'Branch 2'), outPort('out_3', 'Branch 3'), outPort('out_4', 'Branch 4')],
    portPolicy: { minIn: 1, maxIn: 4, minOut: 1, maxOut: 6 },
    configSchema: [],
    baseLatencyMs: 1,
    readsFacts: [],
    writesFacts: [],
    raises: [],
  },

  // 5. Token vault
  {
    id: 'nd_token_vault',
    type: 'TASK',
    bankingCapability: 'TOKEN_VAULT',
    label: 'Token Vault Lookup',
    description:
      'Resolves a virtual card number (DPAN) to the real card (FPAN) and its funding account. An unknown DPAN raises TOKEN_NOT_FOUND, so wire the error port. Non-virtual cards pass straight through.',
    inputPorts: [inPort('in')],
    outputPorts: [outPort('out'), errorPort()],
    portPolicy: { minIn: 1, maxIn: 1, minOut: 1, maxOut: 2 },
    configSchema: [],
    baseLatencyMs: 12,
    readsFacts: ['cardType'],
    writesFacts: ['tokenStatus', 'fundingSource', 'fpanLast4'],
    raises: ['TOKEN_NOT_FOUND'],
  },

  // 6. dCVV verifier
  {
    id: 'nd_dcvv_verifier',
    type: 'TASK',
    bankingCapability: 'DCVV_VERIFIER',
    label: 'dCVV Verifier',
    description:
      'Checks the dynamic CVV against the value the vault expects and checks it was generated within the validity window. Writes dcvvStatus: VALID, EXPIRED or MISMATCH.',
    inputPorts: [inPort('in')],
    outputPorts: [outPort('out')],
    portPolicy: { minIn: 1, maxIn: 1, minOut: 1, maxOut: 1 },
    configSchema: [
      {
        key: 'validityWindowMs',
        label: 'Validity window (ms)',
        type: 'number',
        defaultValue: 60000,
        min: 5000,
        max: 300000,
        description: 'How long a dCVV stays valid after it is generated. Policy for this programme is 60 seconds.',
      },
    ],
    baseLatencyMs: 8,
    readsFacts: ['rawCvv', 'clientTimestamp'],
    writesFacts: ['dcvvStatus'],
    raises: [],
  },

  // 7. 3DS evaluator
  {
    id: 'nd_three_ds_evaluator',
    type: 'TASK',
    bankingCapability: 'THREE_DS_EVALUATOR',
    label: '3DS Risk Evaluator',
    description:
      'Scores the transaction against the issuer 3DS policy and picks a path: frictionless, challenge (OTP), or reject. It also reads the result of a completed challenge when the request comes back.',
    inputPorts: [inPort('in')],
    outputPorts: [outPort('out')],
    portPolicy: { minIn: 1, maxIn: 1, minOut: 1, maxOut: 1 },
    configSchema: [
      {
        key: 'frictionlessBelow',
        label: 'Frictionless below risk',
        type: 'number',
        defaultValue: 40,
        min: 0,
        max: 100,
        description: 'Risk scores under this value skip the challenge.',
      },
      {
        key: 'rejectAtOrAbove',
        label: 'Reject at or above risk',
        type: 'number',
        defaultValue: 80,
        min: 0,
        max: 100,
        description: 'Risk scores at or over this value are rejected outright, even if a challenge was completed.',
      },
    ],
    baseLatencyMs: 45,
    readsFacts: ['riskScore'],
    writesFacts: ['threeDsPath', 'authenticated', 'liabilityShift'],
    raises: [],
  },

  // 8. Core ledger check
  {
    id: 'nd_core_ledger_check',
    type: 'TASK',
    bankingCapability: 'CORE_LEDGER_CHECK',
    label: 'Core Ledger Check',
    description:
      'Checks the funding account has enough to cover the amount. Debit and prepaid compare against available balance. Credit compares against the lower of available credit and the credit limit. Can check the whole purchase, or only the Pay-in-4 down payment.',
    inputPorts: [inPort('in')],
    outputPorts: [outPort('out')],
    portPolicy: { minIn: 1, maxIn: 1, minOut: 1, maxOut: 1 },
    configSchema: [
      {
        key: 'amountToCheck',
        label: 'Amount to check',
        type: 'enum',
        defaultValue: 'FULL_AMOUNT',
        options: ['FULL_AMOUNT', 'FIRST_INSTALMENT'],
        description:
          'FULL_AMOUNT checks the whole purchase. FIRST_INSTALMENT checks only the Pay-in-4 down payment, and needs a BNPL Underwriter to have approved a plan earlier on the same path.',
      },
    ],
    baseLatencyMs: 25,
    readsFacts: ['amount', 'cardType', 'fundingSource', 'availableBalance', 'creditLimit', 'installment1Minor'],
    writesFacts: ['ledgerDecision', 'authHoldMinor'],
    raises: [],
  },

  // 9. Recon desk
  {
    id: 'nd_recon_desk',
    type: 'TASK',
    bankingCapability: 'RECON_DESK',
    label: 'Recon Desk (3-Way)',
    description:
      'Matches the core ledger posting, the scheme clearing file, and the acquirer settlement report. Writes reconStatus: MATCHED, BREAK_AMOUNT, BREAK_MISSING_LEG or BREAK_DUPLICATE. For an amount break it also says whether a foreign-exchange rate difference explains it (reconCause, fxDirection).',
    inputPorts: [inPort('in')],
    outputPorts: [outPort('out')],
    portPolicy: { minIn: 1, maxIn: 1, minOut: 1, maxOut: 1 },
    configSchema: [
      {
        key: 'toleranceMinor',
        label: 'Tolerance (cents)',
        type: 'number',
        defaultValue: 0,
        min: 0,
        max: 1000,
        description: 'The largest gap between legs still treated as a match. Covers rounding and FX noise.',
      },
    ],
    baseLatencyMs: 120,
    readsFacts: [],
    writesFacts: ['reconStatus', 'reconVarianceMinor', 'reconCause', 'fxDirection'],
    raises: [],
  },

  // 10. BNPL underwriter
  {
    id: 'nd_bnpl_underwriter',
    type: 'TASK',
    bankingCapability: 'BNPL_UNDERWRITER',
    label: 'BNPL Underwriter',
    description:
      'Decides whether a Pay-in-4 plan can be offered: the underwriting score must reach the minimum and the down payment must cover the required share of the amount. It works out the down payment but does not debit it. A Core Ledger Check set to the first instalment does that.',
    inputPorts: [inPort('in')],
    outputPorts: [outPort('out')],
    portPolicy: { minIn: 1, maxIn: 1, minOut: 1, maxOut: 1 },
    configSchema: [
      {
        key: 'minScore',
        label: 'Minimum score (0-1000)',
        type: 'number',
        defaultValue: 600,
        min: 0,
        max: 1000,
        description: 'Underwriting scores below this are ineligible.',
      },
      {
        key: 'minDownPaymentPct',
        label: 'Minimum down payment (%)',
        type: 'number',
        defaultValue: 25,
        min: 0,
        max: 100,
        description: 'Share of the amount that must be paid up front. Pay-in-4 uses 25%.',
      },
    ],
    baseLatencyMs: 90,
    readsFacts: ['amount'],
    writesFacts: ['underwritingScore', 'downPaymentPct', 'bnplDecision', 'installment1Minor', 'installmentAmountMinor'],
    raises: [],
  },

  // 11. A2A start event
  {
    id: 'nd_start_a2a',
    type: 'EVENT_START',
    bankingCapability: null,
    label: 'A2A Inflow Channel',
    description:
      'Where an account-to-account payment enters the bank, as an ISO 20022 pacs.008 message. It sits beside the card Payment Request and does the same job: a diagram needs exactly one start.',
    inputPorts: [],
    outputPorts: [outPort('out')],
    portPolicy: { minIn: 0, maxIn: 0, minOut: 1, maxOut: 1 },
    configSchema: [],
    baseLatencyMs: 0,
    readsFacts: [],
    writesFacts: ['isVirtual'],
    raises: [],
  },

  // 12. A2A gateway
  {
    id: 'nd_a2a_gateway',
    type: 'TASK',
    bankingCapability: 'A2A_GATEWAY',
    label: 'A2A Payment Gateway',
    description:
      'Reads the pacs.008 message (EndToEndId, DebtorAgent, CreditorAgent, InterbankSettlementAmount) and the state of the gateway. Writes five facts: a2aValid, a2aRail (instant or RTGS), a2aPriority (payroll is priority), a2aQueue and a2aLiquidity. It decides nothing: you route on the facts.',
    inputPorts: [inPort('in')],
    outputPorts: [outPort('out')],
    portPolicy: { minIn: 1, maxIn: 1, minOut: 1, maxOut: 1 },
    configSchema: [
      {
        key: 'instantLimitMinor',
        label: 'Instant rail limit (cents)',
        type: 'number',
        defaultValue: 5000000,
        min: 100000,
        max: 100000000,
        description: 'The largest single payment the instant rail carries. Anything bigger goes by RTGS.',
      },
      {
        key: 'queueCapacity',
        label: 'Queue capacity (messages)',
        type: 'number',
        defaultValue: 50,
        min: 1,
        max: 1000,
        description: 'When this many messages are already waiting, the gateway counts as congested.',
      },
      {
        key: 'priorityReserveMinor',
        label: 'Priority reserve (cents)',
        type: 'number',
        defaultValue: 10000000,
        min: 0,
        max: 1000000000,
        description: 'Liquidity kept back for priority payments. Ordinary payments can only use what is above it.',
      },
    ],
    baseLatencyMs: 30,
    readsFacts: ['amount'],
    writesFacts: ['a2aValid', 'a2aRail', 'a2aPriority', 'a2aQueue', 'a2aLiquidity'],
    raises: [],
  },

  // 13. AML screening
  {
    id: 'nd_aml_screening',
    type: 'TASK',
    bankingCapability: 'AML_SCREENING',
    label: 'AML Screening',
    description:
      'Matches the customer’s name against the sanctions (OFAC) and politically-exposed-person lists, and looks for structuring: several cash deposits just under the reporting threshold. Writes amlStatus, amlMatchScore, amlList and amlStructuring. A name hit is a lead, not a verdict: fuzzy matching produces false positives.',
    inputPorts: [inPort('in')],
    outputPorts: [outPort('out')],
    portPolicy: { minIn: 1, maxIn: 1, minOut: 1, maxOut: 1 },
    configSchema: [
      {
        key: 'matchThreshold',
        label: 'Name-match threshold (0-100)',
        type: 'number',
        defaultValue: 85,
        min: 50,
        max: 100,
        description: 'A name scoring at least this against a list counts as a hit. Lower catches more and flags more innocent people.',
      },
      {
        key: 'reportingThresholdMinor',
        label: 'Cash reporting threshold (cents)',
        type: 'number',
        defaultValue: 1000000,
        min: 100000,
        max: 100000000,
        description: 'Cash deposits at or above this are reported automatically. Structuring is splitting them to stay just under it.',
      },
      {
        key: 'minStructuringDeposits',
        label: 'Deposits that make a pattern',
        type: 'number',
        defaultValue: 3,
        min: 2,
        max: 10,
        description: 'How many deposits just under the threshold, together over it, count as structuring.',
      },
    ],
    baseLatencyMs: 60,
    readsFacts: [],
    writesFacts: ['amlStatus', 'amlMatchScore', 'amlList', 'amlStructuring'],
    raises: [],
  },

  // 14. Case investigation
  {
    id: 'nd_case_investigation',
    type: 'TASK',
    bankingCapability: 'CASE_INVESTIGATION',
    label: 'Case Investigation',
    description:
      'Opens the customer’s audit log and compares the verified identity documents (date of birth, nationality) with the person on the list. Writes caseVerdict: FALSE_POSITIVE, TRUE_MATCH or INCONCLUSIVE. It is slow and costs analyst time, so only send it real name hits.',
    inputPorts: [inPort('in')],
    outputPorts: [outPort('out')],
    portPolicy: { minIn: 1, maxIn: 1, minOut: 1, maxOut: 1 },
    configSchema: [],
    baseLatencyMs: 140,
    readsFacts: ['amlList'],
    writesFacts: ['caseVerdict', 'caseEvidenceCount'],
    raises: [],
  },

  // 15. Chargeback desk
  {
    id: 'nd_chargeback_desk',
    type: 'TASK',
    bankingCapability: 'CHARGEBACK_DESK',
    label: 'Dispute & Chargeback Desk',
    description:
      'Moves a card dispute through RETRIEVAL_REQUEST, FIRST_CHARGEBACK, REPRESENTMENT and PRE_ARBITRATION, and works out who is liable. It reads authenticated from the 3DS Risk Evaluator, so run that first. Writes disputeWindow, disputeLiability and disputeNext.',
    inputPorts: [inPort('in')],
    outputPorts: [outPort('out')],
    portPolicy: { minIn: 1, maxIn: 1, minOut: 1, maxOut: 1 },
    configSchema: [
      {
        key: 'filingWindowDays',
        label: 'Filing window (days)',
        type: 'number',
        defaultValue: 120,
        min: 30,
        max: 540,
        description: 'How long after the purchase a claim can still be filed. The card schemes use 120 days.',
      },
    ],
    baseLatencyMs: 80,
    readsFacts: ['authenticated'],
    writesFacts: ['disputeWindow', 'disputeLiability', 'disputeNext'],
    raises: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Condition variables (what edge conditions may reference)
// ─────────────────────────────────────────────────────────────────────────────

export const CONDITION_VARIABLES: ConditionVariable[] = [
  { name: 'amount', type: 'number', source: 'PAYLOAD', producedBy: null, learnerVisible: true, description: 'Transaction amount in cents.' },
  { name: 'channel', type: 'string', source: 'PAYLOAD', producedBy: null, allowedValues: ['POS', 'ECOMMERCE', 'MOBILE_WALLET', 'IN_APP'], learnerVisible: true, description: 'Where the payment was initiated.' },
  { name: 'cardType', type: 'string', source: 'PAYLOAD', producedBy: null, allowedValues: ['DEBIT', 'CREDIT', 'PREPAID', 'VIRTUAL_DPAN'], learnerVisible: true, description: 'Type of card presented.' },
  { name: 'riskScore', type: 'number', source: 'PAYLOAD', producedBy: null, learnerVisible: true, description: 'Fraud risk, 0 to 100, higher is riskier.' },
  { name: 'availableBalance', type: 'number', source: 'PAYLOAD', producedBy: null, learnerVisible: true, description: 'Spendable funds in cents.' },
  { name: 'creditLimit', type: 'number', source: 'PAYLOAD', producedBy: null, learnerVisible: true, description: 'Revolving credit limit in cents (0 for non-credit).' },
  { name: 'clientTimestamp', type: 'number', source: 'PAYLOAD', producedBy: null, learnerVisible: true, description: 'When the client submitted the request, epoch ms.' },
  { name: 'rawCvv', type: 'string', source: 'PAYLOAD', producedBy: null, learnerVisible: false, description: 'PCI data. Routing logic must never inspect a raw CVV. Use dcvvStatus instead.' },
  { name: 'isFraud', type: 'boolean', source: 'PAYLOAD', producedBy: null, learnerVisible: false, description: 'Ground-truth label for grading. The bank cannot observe it, so conditions may not use it. Catch fraud through riskScore.' },
  { name: 'isVirtual', type: 'boolean', source: 'DERIVED', producedBy: null, learnerVisible: true, description: 'True when cardType is VIRTUAL_DPAN. Available from the start.' },
  { name: 'tokenStatus', type: 'string', source: 'DERIVED', producedBy: 'TOKEN_VAULT', allowedValues: ['RESOLVED', 'SUSPENDED', 'NOT_APPLICABLE'], learnerVisible: true, description: 'Outcome of the vault lookup.' },
  { name: 'fundingSource', type: 'string', source: 'DERIVED', producedBy: 'TOKEN_VAULT', allowedValues: ['DEBIT', 'CREDIT', 'PREPAID'], learnerVisible: true, description: 'Account type behind the card or DPAN.' },
  { name: 'fpanLast4', type: 'string', source: 'DERIVED', producedBy: 'TOKEN_VAULT', learnerVisible: true, description: 'Last four digits of the real card number behind a DPAN.' },
  { name: 'dcvvStatus', type: 'string', source: 'DERIVED', producedBy: 'DCVV_VERIFIER', allowedValues: ['VALID', 'EXPIRED', 'MISMATCH', 'NOT_APPLICABLE'], learnerVisible: true, description: 'Result of the dynamic CVV check.' },
  { name: 'threeDsPath', type: 'string', source: 'DERIVED', producedBy: 'THREE_DS_EVALUATOR', allowedValues: ['FRICTIONLESS', 'CHALLENGE', 'CHALLENGE_PASSED', 'CHALLENGE_FAILED', 'REJECT'], learnerVisible: true, description: 'Path chosen by the 3DS risk evaluator.' },
  { name: 'authenticated', type: 'boolean', source: 'DERIVED', producedBy: 'THREE_DS_EVALUATOR', learnerVisible: true, description: 'True for FRICTIONLESS or CHALLENGE_PASSED.' },
  { name: 'liabilityShift', type: 'string', source: 'DERIVED', producedBy: 'THREE_DS_EVALUATOR', allowedValues: ['ISSUER', 'MERCHANT'], learnerVisible: true, description: 'Who carries fraud liability for this transaction.' },
  { name: 'ledgerDecision', type: 'string', source: 'DERIVED', producedBy: 'CORE_LEDGER_CHECK', allowedValues: ['SUFFICIENT', 'INSUFFICIENT_FUNDS', 'OVER_LIMIT'], learnerVisible: true, description: 'Result of the funds check.' },
  { name: 'authHoldMinor', type: 'number', source: 'DERIVED', producedBy: 'CORE_LEDGER_CHECK', learnerVisible: true, description: 'Amount held on the funding account, in cents. Only set when funds are sufficient.' },
  { name: 'reconStatus', type: 'string', source: 'DERIVED', producedBy: 'RECON_DESK', allowedValues: ['MATCHED', 'BREAK_AMOUNT', 'BREAK_MISSING_LEG', 'BREAK_DUPLICATE'], learnerVisible: true, description: 'Result of the 3-way match.' },
  { name: 'reconVarianceMinor', type: 'number', source: 'DERIVED', producedBy: 'RECON_DESK', learnerVisible: true, description: 'Largest gap between the three legs, in cents.' },
  { name: 'underwritingScore', type: 'number', source: 'DERIVED', producedBy: 'BNPL_UNDERWRITER', learnerVisible: true, description: 'BNPL underwriting score, 0 to 1000.' },
  { name: 'downPaymentPct', type: 'number', source: 'DERIVED', producedBy: 'BNPL_UNDERWRITER', learnerVisible: true, description: 'Down payment as a percentage of the amount.' },
  { name: 'bnplDecision', type: 'string', source: 'DERIVED', producedBy: 'BNPL_UNDERWRITER', allowedValues: ['ELIGIBLE', 'INELIGIBLE'], learnerVisible: true, description: 'Whether a Pay-in-4 plan can be offered.' },
  { name: 'installment1Minor', type: 'number', source: 'DERIVED', producedBy: 'BNPL_UNDERWRITER', learnerVisible: true, description: 'First Pay-in-4 instalment collected at checkout, in cents. Only set when eligible.' },
  { name: 'installmentAmountMinor', type: 'number', source: 'DERIVED', producedBy: 'BNPL_UNDERWRITER', learnerVisible: true, description: 'Each of the three remaining instalments, in cents. Only set when eligible.' },
  { name: 'recentAttempts', type: 'number', source: 'PAYLOAD', producedBy: null, learnerVisible: true, description: 'Payment attempts on this card in the last 10 minutes, this one included. A burst of them is the signature of card-testing.' },
  { name: 'reconCause', type: 'string', source: 'DERIVED', producedBy: 'RECON_DESK', allowedValues: ['FX_RATE', 'UNEXPLAINED'], learnerVisible: true, description: 'Set on an amount break: FX_RATE when the exchange-rate difference explains the gap, otherwise UNEXPLAINED.' },
  { name: 'fxDirection', type: 'string', source: 'DERIVED', producedBy: 'RECON_DESK', allowedValues: ['GAIN', 'LOSS'], learnerVisible: true, description: 'Which way an FX difference went for the bank. LOSS when the scheme settled for more than was booked.' },
  { name: 'a2aValid', type: 'boolean', source: 'DERIVED', producedBy: 'A2A_GATEWAY', learnerVisible: true, description: 'True when the pacs.008 message passes every format check.' },
  { name: 'a2aRail', type: 'string', source: 'DERIVED', producedBy: 'A2A_GATEWAY', allowedValues: ['INSTANT', 'RTGS'], learnerVisible: true, description: 'The rail that suits the amount: instant up to the limit, RTGS above it.' },
  { name: 'a2aPriority', type: 'string', source: 'DERIVED', producedBy: 'A2A_GATEWAY', allowedValues: ['PRIORITY', 'NORMAL'], learnerVisible: true, description: 'PRIORITY for payroll (purpose code SALA), NORMAL for everything else.' },
  { name: 'a2aQueue', type: 'string', source: 'DERIVED', producedBy: 'A2A_GATEWAY', allowedValues: ['OPEN', 'CONGESTED'], learnerVisible: true, description: 'CONGESTED when the gateway queue has reached its capacity.' },
  { name: 'a2aLiquidity', type: 'string', source: 'DERIVED', producedBy: 'A2A_GATEWAY', allowedValues: ['SUFFICIENT', 'SHORTFALL'], learnerVisible: true, description: 'Whether the liquidity this payment may draw on covers it. Priority payments may use the reserve; ordinary ones may not.' },
  { name: 'amlStatus', type: 'string', source: 'DERIVED', producedBy: 'AML_SCREENING', allowedValues: ['CLEAR', 'STRUCTURING', 'PEP_HIT', 'SANCTION_HIT'], learnerVisible: true, description: 'The most serious finding: a sanctions hit, then a PEP hit, then structuring, then clear.' },
  { name: 'amlMatchScore', type: 'number', source: 'DERIVED', producedBy: 'AML_SCREENING', learnerVisible: true, description: 'The best name-match score on any list, 0 to 100.' },
  { name: 'amlList', type: 'string', source: 'DERIVED', producedBy: 'AML_SCREENING', allowedValues: ['NONE', 'OFAC', 'PEP'], learnerVisible: true, description: 'The list the best match is on, when it reached the threshold.' },
  { name: 'amlStructuring', type: 'boolean', source: 'DERIVED', producedBy: 'AML_SCREENING', learnerVisible: true, description: 'True when the cash deposits show a structuring pattern.' },
  { name: 'caseVerdict', type: 'string', source: 'DERIVED', producedBy: 'CASE_INVESTIGATION', allowedValues: ['FALSE_POSITIVE', 'TRUE_MATCH', 'INCONCLUSIVE'], learnerVisible: true, description: 'Whether the customer is the person on the list, from the audit log.' },
  { name: 'caseEvidenceCount', type: 'number', source: 'DERIVED', producedBy: 'CASE_INVESTIGATION', learnerVisible: true, description: 'How many verified identity events in the audit log could be compared.' },
  { name: 'disputeWindow', type: 'string', source: 'DERIVED', producedBy: 'CHARGEBACK_DESK', allowedValues: ['OPEN', 'EXPIRED'], learnerVisible: true, description: 'Whether the claim can still be filed. A case that has already been filed stays OPEN.' },
  { name: 'disputeLiability', type: 'string', source: 'DERIVED', producedBy: 'CHARGEBACK_DESK', allowedValues: ['ISSUER', 'MERCHANT'], learnerVisible: true, description: 'Who carries the loss. The issuer, when a fraud claim is on a purchase that was authenticated with 3-D Secure.' },
  { name: 'disputeNext', type: 'string', source: 'DERIVED', producedBy: 'CHARGEBACK_DESK', allowedValues: ['RETRIEVAL_REQUEST', 'FIRST_CHARGEBACK', 'REPRESENTMENT', 'PRE_ARBITRATION', 'RESOLVED_CARDHOLDER', 'RESOLVED_MERCHANT', 'NONE'], learnerVisible: true, description: 'Where the dispute goes next. NONE means the scheme allows no action.' },
];

