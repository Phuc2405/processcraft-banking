/**
 * ProcessCraft Banking: the curriculum.
 *
 *   LEVELS                10 challenge levels, in the order they were written (levels 1-4 first, then the Academy levels).
 *   CURRICULUM            the same levels in teaching order, grouped into six stages
 *   REFERENCE_SOLUTIONS   one known-good graph per level (server-side only)
 *
 * The node catalog and the condition variables live in nodeCatalog.ts, the helpers for writing levels in seedKit.ts, and
 * levels 5-10 in academyLevels.ts. They are re-exported here so everything that reads seed data still imports it from this file.
 *
 * Money is integer cents (AUD): 8950 means $89.50.
 */

import type {
  BankingPayload,
  ChallengeLevel,
  Id,
  ProcessGraph,
  ReferenceSolution,
  SettlementContext,
  TestCase,
} from '../types/processLearning';
import { ACADEMY_LEVELS, ACADEMY_REFERENCES } from './academyLevels';
import { CONDITION_VARIABLES, NODE_CATALOG } from './nodeCatalog';
import {
  AND,
  BNPL,
  DCVV,
  END,
  LEDGER,
  RECON,
  STANDARD_RUNNER,
  START,
  THREE_DS,
  VAULT,
  XOR,
  makeEdge,
  makeNode,
  payload,
  settlement,
  virtualCard,
} from './seedKit';

export { CONDITION_VARIABLES, NODE_CATALOG };

// ─────────────────────────────────────────────────────────────────────────────
// Level 1: Virtual Card & Dynamic CVV Ingestion
// ─────────────────────────────────────────────────────────────────────────────

const L1_TESTS: TestCase[] = [
  {
    id: 'L1-T1',
    name: 'Valid DPAN, dCVV used at 58 s',
    description: 'Mapped DPAN, correct dCVV, still inside the 60-second window, enough funds.',
    inputPayload: payload({
      txId: 'TX-L1-001',
      amount: 8950,
      cardType: 'VIRTUAL_DPAN',
      rawCvv: '482',
      riskScore: 12,
      availableBalance: 125000,
      virtualCard: virtualCard('5412750000004821', 58000),
    }),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 80,
    requiredCapabilities: ['TOKEN_VAULT', 'DCVV_VERIFIER', 'CORE_LEDGER_CHECK'],
    tags: ['happy-path', 'boundary'],
  },
  {
    id: 'L1-T2',
    name: 'Expired dCVV (61 s old)',
    description: 'The dCVV is correct but one second past the window. Decline before touching the ledger.',
    inputPayload: payload({
      txId: 'TX-L1-002',
      amount: 8950,
      cardType: 'VIRTUAL_DPAN',
      rawCvv: '482',
      riskScore: 12,
      availableBalance: 125000,
      virtualCard: virtualCard('5412750000004821', 61000),
    }),
    expectedOutcome: 'DECLINED',
    maxLatencyMs: 80,
    requiredCapabilities: ['DCVV_VERIFIER'],
    forbiddenCapabilities: ['CORE_LEDGER_CHECK'],
    tags: ['expiry', 'boundary'],
  },
  {
    id: 'L1-T3',
    name: 'Wrong CVV on a fresh token',
    description: 'Token is 12 s old but the customer typed 137, not 482.',
    inputPayload: payload({
      txId: 'TX-L1-003',
      amount: 15900,
      cardType: 'VIRTUAL_DPAN',
      rawCvv: '137',
      riskScore: 18,
      availableBalance: 125000,
      virtualCard: virtualCard('5412750000004821', 12000),
    }),
    expectedOutcome: 'DECLINED',
    maxLatencyMs: 80,
    requiredCapabilities: ['DCVV_VERIFIER'],
    forbiddenCapabilities: ['CORE_LEDGER_CHECK'],
    tags: ['mismatch'],
  },
  {
    id: 'L1-T4',
    name: 'Unknown DPAN (no vault mapping)',
    description: 'The vault has no record of this DPAN. The lookup raises an exception that your diagram must catch.',
    inputPayload: payload({
      txId: 'TX-L1-004',
      amount: 4200,
      cardType: 'VIRTUAL_DPAN',
      rawCvv: '482',
      riskScore: 35,
      availableBalance: 125000,
      virtualCard: virtualCard('5412759999990000', null),
    }),
    expectedOutcome: 'DECLINED',
    maxLatencyMs: 80,
    requiredCapabilities: ['TOKEN_VAULT'],
    forbiddenCapabilities: ['DCVV_VERIFIER', 'CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['exception'],
  },
  {
    id: 'L1-T5',
    name: 'Valid dCVV, insufficient funds',
    description: 'The token and dCVV are fine, but the funding account cannot cover the purchase.',
    inputPayload: payload({
      txId: 'TX-L1-005',
      amount: 48000,
      cardType: 'VIRTUAL_DPAN',
      rawCvv: '482',
      riskScore: 14,
      availableBalance: 21000,
      virtualCard: virtualCard('5412750000004821', 20000),
    }),
    expectedOutcome: 'DECLINED',
    maxLatencyMs: 80,
    requiredCapabilities: ['CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['funds'],
  },
];

const L1_STARTER: ProcessGraph = {
  id: 'g_l1_starter',
  name: 'Level 1 starter',
  challengeId: 'lvl_01_virtual_card_dcvv',
  nodes: [
    makeNode(START, 'n_start', undefined, {}, { locked: true, x: 40, y: 200 }),
    makeNode(END, 'n_end_approved', 'Approved', { outcome: 'APPROVED' }, { locked: true, x: 900, y: 100 }),
    makeNode(END, 'n_end_declined', 'Declined', { outcome: 'DECLINED' }, { locked: true, x: 900, y: 320 }),
  ],
  edges: [],
};

const LEVEL_1: ChallengeLevel = {
  id: 'lvl_01_virtual_card_dcvv',
  levelNumber: 1,
  title: 'Virtual Card & Dynamic CVV Ingestion',
  domain: 'PAYMENTS',
  difficulty: 'BEGINNER',
  estimatedMinutes: 15,
  problemDescription: [
    'Your bank is launching **virtual cards**. At checkout the customer\'s app shows a **dynamic CVV (dCVV)** that rotates and is only valid for **60 seconds** after it is generated.',
    '',
    'Design the authorisation flow for a virtual-card payment.',
    '',
    '**Rules**',
    '1. Look up the presented DPAN in the **token vault**. A DPAN with no mapping is a technical exception. It must be handled, not left to stall.',
    '2. **Verify the dCVV.** It must match what the vault expects and it must be inside the validity window.',
    '3. A request that fails the dCVV check is **declined before any funds are checked**. Never place a ledger check on a request you already know is bad.',
    '4. A request that passes goes to the **core ledger**. Approve when funds are sufficient, otherwise decline.',
    '',
    'The Approved and Declined end events are already on the canvas.',
  ].join('\n'),
  learningObjectives: [
    'Place a TASK node for each banking capability and wire them in a sensible order',
    'Route on a derived fact (dcvvStatus) with an XOR gateway and a default branch',
    'Handle a technical exception through a task\'s error port',
    'Fail fast: stop before an expensive downstream check once a cheap one has failed',
  ],
  allowedNodePalette: {
    entries: [
      { nodeDefinitionId: VAULT, maxCount: 1 },
      { nodeDefinitionId: DCVV, maxCount: 1 },
      { nodeDefinitionId: LEDGER, maxCount: 1 },
      { nodeDefinitionId: XOR, maxCount: 3 },
    ],
    totalNodeBudget: 8,
  },
  starterGraph: L1_STARTER,
  testSuite: L1_TESTS,
  scoring: {
    passMark: 100,
    anomalyPenaltyPoints: 10,
    efficiency: { optimalNodeCount: 5, optimalAvgLatencyMs: 29.6, nodeCountWeight: 0.5, latencyWeight: 0.5 },
  },
  runnerConfig: STANDARD_RUNNER,
  hints: [
    'An XOR gateway needs a default edge. What should happen to anything that is not clearly OK?',
    'dcvvStatus is only set after the dCVV Verifier has run.',
    'The Token Vault has two output ports. Only one of them is the normal path.',
  ],
};

const L1_REFERENCE: ProcessGraph = {
  id: 'g_ref_l1',
  name: 'Level 1 reference',
  challengeId: LEVEL_1.id,
  nodes: [
    ...L1_STARTER.nodes,
    makeNode(VAULT, 'n_vault'),
    makeNode(DCVV, 'n_dcvv'),
    makeNode(XOR, 'n_xor_dcvv', 'dCVV ok?'),
    makeNode(LEDGER, 'n_ledger'),
    makeNode(XOR, 'n_xor_ledger', 'Funds ok?'),
  ],
  edges: [
    makeEdge('e1', ['n_start', 'out'], ['n_vault', 'in']),
    makeEdge('e2', ['n_vault', 'out'], ['n_dcvv', 'in']),
    makeEdge('e3', ['n_vault', 'error'], ['n_end_declined', 'in'], { label: 'unknown DPAN' }),
    makeEdge('e4', ['n_dcvv', 'out'], ['n_xor_dcvv', 'in_1']),
    makeEdge('e5', ['n_xor_dcvv', 'out_1'], ['n_ledger', 'in'], { when: "dcvvStatus == 'VALID'", priority: 1 }),
    makeEdge('e6', ['n_xor_dcvv', 'out_2'], ['n_end_declined', 'in'], { isDefault: true }),
    makeEdge('e7', ['n_ledger', 'out'], ['n_xor_ledger', 'in_1']),
    makeEdge('e8', ['n_xor_ledger', 'out_1'], ['n_end_approved', 'in'], { when: "ledgerDecision == 'SUFFICIENT'", priority: 1 }),
    makeEdge('e9', ['n_xor_ledger', 'out_2'], ['n_end_declined', 'in'], { isDefault: true }),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Level 2: 3DS 2.x Risk-Based Routing
// ─────────────────────────────────────────────────────────────────────────────

const card = (over: Partial<BankingPayload> & Pick<BankingPayload, 'txId'>): BankingPayload =>
  payload({ cardType: 'CREDIT', availableBalance: 250000, creditLimit: 500000, ...over });

const L2_TESTS: TestCase[] = [
  {
    id: 'L2-T01',
    name: 'Frictionless: low risk',
    inputPayload: card({ txId: 'TX-L2-001', amount: 12900, riskScore: 12 }),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK'],
    tags: ['frictionless'],
  },
  {
    id: 'L2-T02',
    name: 'Frictionless: top of the band (risk 39)',
    inputPayload: card({ txId: 'TX-L2-002', amount: 34900, riskScore: 39 }),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK'],
    tags: ['frictionless', 'boundary'],
  },
  {
    id: 'L2-T03',
    name: 'Challenge: bottom of the band (risk 40)',
    inputPayload: card({ txId: 'TX-L2-003', amount: 21000, riskScore: 40, challenge: { status: 'NOT_STARTED', method: 'OTP' } }),
    expectedOutcome: 'CHALLENGE_REQUIRED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR'],
    forbiddenCapabilities: ['CORE_LEDGER_CHECK'],
    tags: ['challenge', 'boundary'],
  },
  {
    id: 'L2-T04',
    name: 'Challenge: mid risk, first pass',
    inputPayload: card({ txId: 'TX-L2-004', amount: 56000, riskScore: 65, challenge: { status: 'NOT_STARTED', method: 'OTP' } }),
    expectedOutcome: 'CHALLENGE_REQUIRED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR'],
    forbiddenCapabilities: ['CORE_LEDGER_CHECK'],
    tags: ['challenge'],
  },
  {
    id: 'L2-T05',
    name: 'Challenge completed: OTP entered correctly',
    description: 'The cardholder comes back after the challenge with a successful OTP.',
    inputPayload: card({ txId: 'TX-L2-005', amount: 56000, riskScore: 58, challenge: { status: 'COMPLETED', method: 'OTP' } }),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK'],
    tags: ['challenge', 'completed'],
  },
  {
    id: 'L2-T06',
    name: 'Challenge drop-off: cardholder abandons',
    description: 'The OTP screen was closed without entering a code.',
    inputPayload: card({ txId: 'TX-L2-006', amount: 78000, riskScore: 62, challenge: { status: 'ABANDONED', method: 'OTP' } }),
    expectedOutcome: 'DECLINED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR'],
    forbiddenCapabilities: ['CORE_LEDGER_CHECK'],
    tags: ['challenge', 'drop-off'],
  },
  {
    id: 'L2-T07',
    name: 'Challenge drop-off: OTP times out',
    description: 'The code went to the real cardholder\'s phone, so nobody entered it. This is what a fraudster with only the card number looks like: approving it would be a fraud slip.',
    inputPayload: card({
      txId: 'TX-L2-007',
      amount: 31000,
      riskScore: 71,
      channel: 'MOBILE_WALLET',
      isFraud: true,
      challenge: { status: 'TIMED_OUT', method: 'OTP' },
    }),
    expectedOutcome: 'DECLINED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR'],
    forbiddenCapabilities: ['CORE_LEDGER_CHECK'],
    tags: ['challenge', 'drop-off'],
  },
  {
    id: 'L2-T08',
    name: 'Fraud catch: very high risk',
    description: 'Stolen card, 6 failed attempts from the same device in 10 minutes. No ledger work on a rejected request.',
    inputPayload: card({ txId: 'TX-L2-008', amount: 189900, riskScore: 91, isFraud: true }),
    expectedOutcome: 'DECLINED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR'],
    forbiddenCapabilities: ['CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['fraud'],
  },
  {
    id: 'L2-T09',
    name: 'Fraud catch: completed OTP cannot override a reject',
    description: 'SIM-swap fraud. The OTP was completed, but the risk score is over the reject line.',
    inputPayload: card({
      txId: 'TX-L2-009',
      amount: 99900,
      riskScore: 84,
      isFraud: true,
      challenge: { status: 'COMPLETED', method: 'OTP' },
    }),
    expectedOutcome: 'DECLINED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR'],
    forbiddenCapabilities: ['CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['fraud', 'boundary'],
  },
  {
    id: 'L2-T10',
    name: 'Frictionless but insufficient funds',
    description: 'Authentication is fine. The account just cannot cover it.',
    inputPayload: payload({ txId: 'TX-L2-010', amount: 15000, cardType: 'DEBIT', riskScore: 20, availableBalance: 3000, creditLimit: 0 }),
    expectedOutcome: 'DECLINED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['funds'],
  },
];

const LEVEL_2: ChallengeLevel = {
  id: 'lvl_02_three_ds_routing',
  levelNumber: 2,
  title: '3DS 2.x Risk-Based Routing',
  domain: 'PAYMENTS',
  difficulty: 'INTERMEDIATE',
  estimatedMinutes: 25,
  problemDescription: [
    'Card-not-present payments go through **3-D Secure 2.x**. Instead of challenging everyone, the issuer routes by risk so good customers are not slowed down.',
    '',
    '**Issuer policy**',
    '',
    '| Risk score | Path | Result |',
    '|---|---|---|',
    '| below 40 | Frictionless | Go on to the funds check |',
    '| 40 to 79, challenge not yet done | Challenge | Reply **CHALLENGE_REQUIRED** so the customer is sent to the OTP screen |',
    '| 40 to 79, challenge completed | Authenticated | Go on to the funds check |',
    '| 40 to 79, challenge abandoned, timed out or failed | Drop-off | **Decline** |',
    '| 80 or above | Reject | **Decline**, even if a challenge was completed |',
    '',
    '**Also**',
    '- Rejected and dropped-off requests must not touch the core ledger.',
    '- Authenticated requests are approved only if the ledger check shows enough funds.',
    '- The bank cannot see whether a transaction is really fraud. You catch fraud through the risk score, so conditions may not read `isFraud`.',
    '',
    'Each request is evaluated twice in real life: once before the challenge and once after. Here, each test is one of those evaluations.',
  ].join('\n'),
  learningObjectives: [
    'Route a payment into three different outcomes with one XOR gateway',
    'Use priorities and a default edge so every case lands somewhere',
    'Understand why a parallel (AND) design wastes work when most requests are rejected early',
    'Read liability shift as a consequence of authentication',
  ],
  allowedNodePalette: {
    entries: [
      { nodeDefinitionId: THREE_DS, maxCount: 1 },
      { nodeDefinitionId: LEDGER, maxCount: 1 },
      { nodeDefinitionId: XOR, maxCount: 3 },
      { nodeDefinitionId: AND, maxCount: 2 },
      { nodeDefinitionId: START, maxCount: 1 },
      { nodeDefinitionId: END, maxCount: 4 },
    ],
    totalNodeBudget: 12,
  },
  testSuite: L2_TESTS,
  scoring: {
    passMark: 100,
    anomalyPenaltyPoints: 10,
    efficiency: { optimalNodeCount: 8, optimalAvgLatencyMs: 56.4, nodeCountWeight: 0.5, latencyWeight: 0.5 },
  },
  runnerConfig: STANDARD_RUNNER,
  hints: [
    'The 3DS Risk Evaluator writes both threeDsPath and a simple authenticated flag. Which is easier to put in a condition?',
    'Three outcomes need three End events, each configured with a different outcome.',
    'Look at the tests marked as not allowed to touch the ledger before you reach for an AND gateway.',
  ],
};

const L2_REFERENCE: ProcessGraph = {
  id: 'g_ref_l2',
  name: 'Level 2 reference',
  challengeId: LEVEL_2.id,
  nodes: [
    makeNode(START, 'n_start'),
    makeNode(THREE_DS, 'n_3ds'),
    makeNode(XOR, 'n_xor_3ds', '3DS path?'),
    makeNode(LEDGER, 'n_ledger'),
    makeNode(XOR, 'n_xor_ledger', 'Funds ok?'),
    makeNode(END, 'n_end_approved', 'Approved', { outcome: 'APPROVED' }),
    makeNode(END, 'n_end_challenge', 'Send to OTP', { outcome: 'CHALLENGE_REQUIRED' }),
    makeNode(END, 'n_end_declined', 'Declined', { outcome: 'DECLINED' }),
  ],
  edges: [
    makeEdge('e1', ['n_start', 'out'], ['n_3ds', 'in']),
    makeEdge('e2', ['n_3ds', 'out'], ['n_xor_3ds', 'in_1']),
    makeEdge('e3', ['n_xor_3ds', 'out_1'], ['n_ledger', 'in'], { when: 'authenticated == true', priority: 1 }),
    makeEdge('e4', ['n_xor_3ds', 'out_2'], ['n_end_challenge', 'in'], { when: "threeDsPath == 'CHALLENGE'", priority: 2 }),
    makeEdge('e5', ['n_xor_3ds', 'out_3'], ['n_end_declined', 'in'], { isDefault: true }),
    makeEdge('e6', ['n_ledger', 'out'], ['n_xor_ledger', 'in_1']),
    makeEdge('e7', ['n_xor_ledger', 'out_1'], ['n_end_approved', 'in'], { when: "ledgerDecision == 'SUFFICIENT'", priority: 1 }),
    makeEdge('e8', ['n_xor_ledger', 'out_2'], ['n_end_declined', 'in'], { isDefault: true }),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Level 3: EOD 3-Way Reconciliation & Suspense Account
// ─────────────────────────────────────────────────────────────────────────────

const recon = (txId: Id, amount: number, s: SettlementContext): BankingPayload =>
  payload({
    txId,
    amount,
    channel: 'POS',
    cardType: 'DEBIT',
    riskScore: 5,
    availableBalance: 0,
    settlement: s,
  });

const L3_TESTS: TestCase[] = [
  {
    id: 'L3-T1',
    name: 'Exact 3-way match',
    inputPayload: recon('TX-L3-001', 12000, settlement(12000, 12000, 12000)),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    tags: ['match'],
  },
  {
    id: 'L3-T2',
    name: 'Exact match on a large amount',
    description: 'Size alone is not a reason to park an item.',
    inputPayload: recon('TX-L3-002', 985000, settlement(985000, 985000, 985000)),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    tags: ['match'],
  },
  {
    id: 'L3-T3',
    name: '2c rounding gap, inside tolerance',
    description: 'Switch report is 2 cents under the other two legs.',
    inputPayload: recon('TX-L3-003', 4500, settlement(4500, 4500, 4498)),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    tags: ['tolerance'],
  },
  {
    id: 'L3-T4',
    name: '5c gap, exactly at tolerance',
    inputPayload: recon('TX-L3-004', 7000, settlement(7000, 7005, 7000)),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    tags: ['tolerance', 'boundary'],
  },
  {
    id: 'L3-T5',
    name: '10c gap, outside tolerance',
    inputPayload: recon('TX-L3-005', 3000, settlement(3000, 3010, 3000)),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'SUSP_AMOUNT_VARIANCE',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    tags: ['break', 'boundary'],
  },
  {
    id: 'L3-T6',
    name: 'Transposed digits ($250.00 vs $205.00)',
    inputPayload: recon('TX-L3-006', 25000, settlement(25000, 20500, 25000)),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'SUSP_AMOUNT_VARIANCE',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    tags: ['break'],
  },
  {
    id: 'L3-T7',
    name: 'Authorised, never cleared',
    description: 'The ledger and switch have it, but the scheme clearing file does not.',
    inputPayload: recon('TX-L3-007', 18000, settlement(18000, null, 18000)),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'SUSP_MISSING_LEG',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    tags: ['break', 'missing-leg'],
  },
  {
    id: 'L3-T8',
    name: 'Cleared but never posted to the ledger',
    inputPayload: recon('TX-L3-008', 6400, settlement(null, 6400, 6400)),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'SUSP_MISSING_LEG',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    hidden: true,
    tags: ['break', 'missing-leg'],
  },
  {
    id: 'L3-T9',
    name: 'Duplicate presentment',
    description: 'The clearing file presented the same transaction twice.',
    inputPayload: recon('TX-L3-009', 9900, settlement(9900, 9900, 9900, 2)),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'SUSP_DUPLICATE',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    hidden: true,
    tags: ['break', 'duplicate'],
  },
];

const LEVEL_3: ChallengeLevel = {
  id: 'lvl_03_eod_recon_suspense',
  levelNumber: 3,
  title: 'EOD 3-Way Reconciliation & Suspense Account',
  domain: 'PAYMENTS',
  difficulty: 'ADVANCED',
  estimatedMinutes: 30,
  problemDescription: [
    'At end of day the bank must prove that every card transaction agrees across **three independent records**:',
    '',
    '1. the **core ledger** posting',
    '2. the **card-scheme clearing file**',
    '3. the **acquirer / switch settlement report**',
    '',
    'Items that agree are **settled** (outcome APPROVED). Items that do not agree are **breaks**. A break must never be silently settled or dropped. It is parked in a **suspense account** with a reason code so the right ops queue can chase it.',
    '',
    '**Rules**',
    '- Rounding and FX noise happen. Treat legs as matching if the biggest gap between them is **5 cents or less**. The Recon Desk\'s tolerance setting defaults to 0, so you must set it.',
    '- Route breaks to **ROUTED_TO_SUSPENSE** with the right reason code:',
    '',
    '| Break | Reason code |',
    '|---|---|',
    '| Legs present but amounts differ beyond tolerance | `SUSP_AMOUNT_VARIANCE` |',
    '| One of the three legs is missing | `SUSP_MISSING_LEG` |',
    '| Clearing file presented the item more than once | `SUSP_DUPLICATE` |',
    '',
    'Start from a blank canvas. You decide how many End events you need.',
  ].join('\n'),
  learningObjectives: [
    'Configure a node (tolerance) instead of only wiring it',
    'Distinguish settlement from exception handling and route each break type to its own suspense queue',
    'Cover every value of a status with explicit branches, so no item can fall through',
    'Explain why a break is parked rather than approved or declined',
  ],
  allowedNodePalette: {
    entries: [
      { nodeDefinitionId: START, maxCount: 1 },
      { nodeDefinitionId: END, maxCount: 5 },
      { nodeDefinitionId: XOR, maxCount: 2 },
      { nodeDefinitionId: RECON, maxCount: 1 },
      { nodeDefinitionId: AND, maxCount: 2 },
      { nodeDefinitionId: LEDGER, maxCount: 1 },
    ],
    totalNodeBudget: 11,
  },
  testSuite: L3_TESTS,
  scoring: {
    passMark: 100,
    anomalyPenaltyPoints: 10,
    efficiency: { optimalNodeCount: 7, optimalAvgLatencyMs: 121, nodeCountWeight: 0.5, latencyWeight: 0.5 },
  },
  runnerConfig: STANDARD_RUNNER,
  hints: [
    'reconStatus has exactly four values. Can you give each one a branch?',
    'Two different outcomes are both "an End event". What makes them different is their configuration.',
    'If a break test fails with the right outcome, check the reason code on the End event.',
  ],
};

const L3_REFERENCE: ProcessGraph = {
  id: 'g_ref_l3',
  name: 'Level 3 reference',
  challengeId: LEVEL_3.id,
  nodes: [
    makeNode(START, 'n_start'),
    makeNode(RECON, 'n_recon', undefined, { toleranceMinor: 5 }),
    makeNode(XOR, 'n_xor_recon', 'Matched?'),
    makeNode(END, 'n_end_settled', 'Settled', { outcome: 'APPROVED' }),
    makeNode(END, 'n_end_amount', 'Suspense: variance', { outcome: 'ROUTED_TO_SUSPENSE', reasonCode: 'SUSP_AMOUNT_VARIANCE' }),
    makeNode(END, 'n_end_missing', 'Suspense: missing leg', { outcome: 'ROUTED_TO_SUSPENSE', reasonCode: 'SUSP_MISSING_LEG' }),
    makeNode(END, 'n_end_dup', 'Suspense: duplicate', { outcome: 'ROUTED_TO_SUSPENSE', reasonCode: 'SUSP_DUPLICATE' }),
  ],
  edges: [
    makeEdge('e1', ['n_start', 'out'], ['n_recon', 'in']),
    makeEdge('e2', ['n_recon', 'out'], ['n_xor_recon', 'in_1']),
    makeEdge('e3', ['n_xor_recon', 'out_1'], ['n_end_settled', 'in'], { when: "reconStatus == 'MATCHED'", priority: 1 }),
    makeEdge('e4', ['n_xor_recon', 'out_2'], ['n_end_amount', 'in'], { when: "reconStatus == 'BREAK_AMOUNT'", priority: 2 }),
    makeEdge('e5', ['n_xor_recon', 'out_3'], ['n_end_missing', 'in'], { when: "reconStatus == 'BREAK_MISSING_LEG'", priority: 3 }),
    makeEdge('e6', ['n_xor_recon', 'out_4'], ['n_end_dup', 'in'], { when: "reconStatus == 'BREAK_DUPLICATE'", priority: 4 }),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Level 4: BNPL Pay-in-4 Underwriting & Fallback Routing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A checkout with a Pay-in-4 application. The checkout always offers the standard 25% down payment,
 * rounded up to the cent. `funding` is the linked card: its type and what it can spend.
 */
const bnplCart = (
  txId: Id,
  amount: number,
  underwritingScore: number,
  funding: Pick<BankingPayload, 'cardType' | 'availableBalance' | 'creditLimit'>,
): BankingPayload =>
  payload({
    txId,
    amount,
    channel: 'ECOMMERCE',
    riskScore: 15,
    ...funding,
    bnpl: { underwritingScore, downPaymentMinor: Math.ceil(amount / 4) },
  });

const debitCard = (availableBalance: number): Pick<BankingPayload, 'cardType' | 'availableBalance' | 'creditLimit'> => ({
  cardType: 'DEBIT',
  availableBalance,
  creditLimit: 0,
});
const creditCard = (
  availableBalance: number,
  creditLimit: number,
): Pick<BankingPayload, 'cardType' | 'availableBalance' | 'creditLimit'> => ({ cardType: 'CREDIT', availableBalance, creditLimit });

const L4_TESTS: TestCase[] = [
  {
    id: 'L4-T1',
    name: 'Strong score, debit card well funded',
    description: 'Score 742 on a $240.00 basket. The $60.00 down payment is easily covered.',
    inputPayload: bnplCart('TX-L4-001', 24000, 742, debitCard(150000)),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'BNPL_PAY_IN_4',
    maxLatencyMs: 160,
    requiredCapabilities: ['BNPL_UNDERWRITER', 'CORE_LEDGER_CHECK'],
    tags: ['bnpl', 'happy-path'],
  },
  {
    id: 'L4-T2',
    name: 'Score exactly 600, credit card',
    description: 'The minimum score qualifies. Credit cards are checked against the lower of available credit and the limit.',
    inputPayload: bnplCart('TX-L4-002', 18000, 600, creditCard(300000, 500000)),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'BNPL_PAY_IN_4',
    maxLatencyMs: 160,
    requiredCapabilities: ['BNPL_UNDERWRITER', 'CORE_LEDGER_CHECK'],
    tags: ['bnpl', 'boundary'],
  },
  {
    id: 'L4-T3',
    name: 'Down payment fits, full price does not',
    description:
      'A $900.00 basket on a debit card holding $300.00. Pay-in-4 exists for this customer: only the $225.00 first instalment is debited today.',
    inputPayload: bnplCart('TX-L4-003', 90000, 688, debitCard(30000)),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'BNPL_PAY_IN_4',
    maxLatencyMs: 160,
    requiredCapabilities: ['BNPL_UNDERWRITER', 'CORE_LEDGER_CHECK'],
    tags: ['bnpl', 'down-payment'],
  },
  {
    id: 'L4-T4',
    name: 'Down payment debit fails: debit card short',
    description:
      'Approved for the plan, but the card holds $80.00 and today\'s instalment is $100.00. If it cannot cover 25% it cannot cover 100%, so this is a decline, not a fallback.',
    inputPayload: bnplCart('TX-L4-004', 40000, 710, debitCard(8000)),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'DOWN_PAYMENT_DECLINED',
    maxLatencyMs: 160,
    requiredCapabilities: ['BNPL_UNDERWRITER', 'CORE_LEDGER_CHECK'],
    tags: ['down-payment', 'decline'],
  },
  {
    id: 'L4-T5',
    name: 'Down payment debit fails: over the credit limit',
    description: 'Score 655 qualifies, but only $120.00 of credit is left and the down payment is $150.00.',
    inputPayload: bnplCart('TX-L4-005', 60000, 655, creditCard(12000, 20000)),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'DOWN_PAYMENT_DECLINED',
    maxLatencyMs: 160,
    requiredCapabilities: ['BNPL_UNDERWRITER', 'CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['down-payment', 'decline', 'credit'],
  },
  {
    id: 'L4-T6',
    name: 'Score 599 falls back to the credit card',
    description: 'One point under the minimum. The cart is not dropped: the full $350.00 is authorised on the credit card.',
    inputPayload: bnplCart('TX-L4-006', 35000, 599, creditCard(250000, 500000)),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'CARD_FALLBACK',
    maxLatencyMs: 160,
    requiredCapabilities: ['BNPL_UNDERWRITER', 'CORE_LEDGER_CHECK'],
    tags: ['fallback', 'boundary'],
  },
  {
    id: 'L4-T7',
    name: 'Low score falls back to the debit card',
    description: 'Score 410. Standard card authorisation for the full $129.00.',
    inputPayload: bnplCart('TX-L4-007', 12900, 410, debitCard(50000)),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'CARD_FALLBACK',
    maxLatencyMs: 160,
    requiredCapabilities: ['BNPL_UNDERWRITER', 'CORE_LEDGER_CHECK'],
    tags: ['fallback'],
  },
  {
    id: 'L4-T8',
    name: 'Hard decline: low score and the card cannot cover it',
    description: 'Score 520, so no plan. The fallback card authorisation of $850.00 is over the $400.00 of credit left.',
    inputPayload: bnplCart('TX-L4-008', 85000, 520, creditCard(40000, 500000)),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'CARD_DECLINED',
    maxLatencyMs: 160,
    requiredCapabilities: ['BNPL_UNDERWRITER', 'CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['fallback', 'decline', 'hard-decline'],
  },
];

const LEVEL_4: ChallengeLevel = {
  id: 'lvl_04_bnpl_pay_in_4',
  levelNumber: 4,
  title: 'BNPL Pay-in-4 Underwriting & Fallback Routing',
  domain: 'PAYMENTS',
  difficulty: 'ADVANCED',
  estimatedMinutes: 35,
  problemDescription: [
    'An e-commerce merchant is adding **Buy Now, Pay Later (Pay-in-4)** at checkout. The customer pays **25% today** and the rest in **three further instalments**. The bank underwrites the plan in real time and must never lose a sale that it could still take on a normal card.',
    '',
    '**Rules**',
    '1. Every payment goes to the **BNPL Underwriter** first. It reads the customer\'s `underwritingScore` and the down payment on offer, and writes `bnplDecision`: `ELIGIBLE` or `INELIGIBLE`. The programme needs **a score of 600 or more** and **a 25% down payment**. The node\'s defaults already match that.',
    '2. **ELIGIBLE: take the down payment.** Debit only the first instalment (25%) from the linked card with a **Core Ledger Check**. Funds fine: approve with reason `BNPL_PAY_IN_4`. Not enough: decline with reason `DOWN_PAYMENT_DECLINED`. Do **not** fall back to the card here. A card that cannot cover 25% cannot cover 100%.',
    '3. **INELIGIBLE: do not drop the cart.** Fall back to a **standard card authorisation** for the **full amount** (debit or credit). Funds fine: approve with reason `CARD_FALLBACK`. Not enough: decline with reason `CARD_DECLINED`.',
    '',
    '| End event | Outcome | Reason code |',
    '|---|---|---|',
    '| Pay-in-4 approved | APPROVED | `BNPL_PAY_IN_4` |',
    '| Card fallback approved | APPROVED | `CARD_FALLBACK` |',
    '| Down payment failed | DECLINED | `DOWN_PAYMENT_DECLINED` |',
    '| Card fallback failed | DECLINED | `CARD_DECLINED` |',
    '',
    'Two of these end in APPROVED and two in DECLINED, so the **reason code** is what tells the paths apart.',
    '',
    'The **BNPL Underwriter works out the plan but does not debit anything.** The Core Ledger Check has a setting, **Amount to check**: the full purchase, or only the first instalment. Start from a blank canvas.',
  ].join('\n'),
  learningObjectives: [
    'Route on an underwriting decision and keep a fallback path for customers who do not qualify',
    'Configure the same capability two ways for two different jobs (down payment versus full authorisation)',
    'Tell outcomes apart with reason codes when several paths share an outcome type',
    'Merge two branches into one decision by reading two facts together',
  ],
  allowedNodePalette: {
    entries: [
      { nodeDefinitionId: START, maxCount: 1 },
      { nodeDefinitionId: END, maxCount: 5 },
      { nodeDefinitionId: XOR, maxCount: 3 },
      { nodeDefinitionId: BNPL, maxCount: 1 },
      { nodeDefinitionId: LEDGER, maxCount: 2 },
    ],
    totalNodeBudget: 12,
  },
  testSuite: L4_TESTS,
  scoring: {
    passMark: 100,
    anomalyPenaltyPoints: 10,
    efficiency: { optimalNodeCount: 10, optimalAvgLatencyMs: 117, nodeCountWeight: 0.5, latencyWeight: 0.5 },
  },
  runnerConfig: STANDARD_RUNNER,
  hints: [
    'bnplDecision is set by the BNPL Underwriter. Put the decision that reads it straight after the underwriter.',
    'Selecting a Core Ledger Check shows its "Amount to check" setting. The down payment is not the full price.',
    'A test that expects the right outcome but fails on the reason code means the right path ended at the wrong End event.',
    'Both ledger checks can feed one XOR gateway (it has two input ports) if its conditions read ledgerDecision and bnplDecision together.',
  ],
};

const L4_REFERENCE: ProcessGraph = {
  id: 'g_ref_l4',
  name: 'Level 4 reference',
  challengeId: LEVEL_4.id,
  nodes: [
    makeNode(START, 'n_start'),
    makeNode(BNPL, 'n_bnpl', 'Pay-in-4 underwriting'),
    makeNode(XOR, 'n_xor_plan', 'Plan approved?'),
    makeNode(LEDGER, 'n_ledger_dp', 'Debit down payment', { amountToCheck: 'FIRST_INSTALMENT' }),
    makeNode(LEDGER, 'n_ledger_card', 'Card authorisation (full price)'),
    makeNode(XOR, 'n_xor_funds', 'Funds ok?'),
    makeNode(END, 'n_end_bnpl', 'Approved: Pay-in-4', { outcome: 'APPROVED', reasonCode: 'BNPL_PAY_IN_4' }),
    makeNode(END, 'n_end_card', 'Approved: card fallback', { outcome: 'APPROVED', reasonCode: 'CARD_FALLBACK' }),
    makeNode(END, 'n_end_dp_declined', 'Declined: down payment', { outcome: 'DECLINED', reasonCode: 'DOWN_PAYMENT_DECLINED' }),
    makeNode(END, 'n_end_card_declined', 'Declined: card', { outcome: 'DECLINED', reasonCode: 'CARD_DECLINED' }),
  ],
  edges: [
    makeEdge('e1', ['n_start', 'out'], ['n_bnpl', 'in']),
    makeEdge('e2', ['n_bnpl', 'out'], ['n_xor_plan', 'in_1']),
    makeEdge('e3', ['n_xor_plan', 'out_1'], ['n_ledger_dp', 'in'], { when: "bnplDecision == 'ELIGIBLE'", priority: 1, label: 'plan approved' }),
    makeEdge('e4', ['n_xor_plan', 'out_2'], ['n_ledger_card', 'in'], { isDefault: true, label: 'fall back to card' }),
    makeEdge('e5', ['n_ledger_dp', 'out'], ['n_xor_funds', 'in_1']),
    makeEdge('e6', ['n_ledger_card', 'out'], ['n_xor_funds', 'in_2']),
    makeEdge('e7', ['n_xor_funds', 'out_1'], ['n_end_bnpl', 'in'], { when: "ledgerDecision == 'SUFFICIENT' && bnplDecision == 'ELIGIBLE'", priority: 1 }),
    makeEdge('e8', ['n_xor_funds', 'out_2'], ['n_end_card', 'in'], { when: "ledgerDecision == 'SUFFICIENT'", priority: 2 }),
    makeEdge('e9', ['n_xor_funds', 'out_3'], ['n_end_dp_declined', 'in'], { when: "bnplDecision == 'ELIGIBLE'", priority: 3 }),
    makeEdge('e10', ['n_xor_funds', 'out_4'], ['n_end_card_declined', 'in'], { isDefault: true }),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export const LEVELS: ChallengeLevel[] = [LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4, ...ACADEMY_LEVELS];

// ─────────────────────────────────────────────────────────────────────────────
// Curriculum: the six stages of the Banking Operations & Architecture Academy
// ─────────────────────────────────────────────────────────────────────────────

export interface CurriculumStage {
  /** 1-based position in the Academy. */
  stage: number;
  title: string;
  /** One sentence a learner reads before they open the stage. */
  blurb: string;
  /** The levels that teach it, in order. Every level appears in exactly one stage. */
  levelIds: readonly Id[];
}

export const CURRICULUM: readonly CurriculumStage[] = [
  {
    stage: 1,
    title: 'The First Swipes',
    blurb: 'A card is tapped. Can the account pay? Learn the basic checks and how to decline gracefully.',
    levelIds: ['lvl_05_first_swipes', LEVEL_1.id],
  },
  {
    stage: 2,
    title: 'Fraud Detective',
    blurb: 'Fraud and 3-D Secure risk. Stop the thieves at midnight without chasing honest customers away.',
    levelIds: [LEVEL_2.id, 'lvl_06_card_testing'],
  },
  {
    stage: 3,
    title: 'Fintech & Instalments',
    blurb: 'BNPL pay-in-4 lifecycle: underwrite the customer, and fall back to revolving credit when the answer is no.',
    levelIds: [LEVEL_4.id],
  },
  {
    stage: 4,
    title: 'The Lifeblood Network',
    blurb: 'Account-to-account payments and ISO 20022: instant rail or RTGS, the gateway queue, and the liquidity cap.',
    levelIds: ['lvl_07_a2a_iso20022'],
  },
  {
    stage: 5,
    title: 'The 23:59 Night Run',
    blurb: 'End of day: reconcile the books, and send FX gains and losses to the right suspense accounts.',
    levelIds: [LEVEL_3.id, 'lvl_08_fx_breaks'],
  },
  {
    stage: 6,
    title: 'Operational Storms',
    blurb: 'AML screening and chargeback warfare: release a VIP wrongly flagged, and win or absorb a dispute by the rules.',
    levelIds: ['lvl_09_sanctions_storm', 'lvl_10_chargeback_warfare'],
  },
];

export interface CurriculumPosition {
  stage: number;
  /** 1-based step inside the stage. */
  step: number;
  stageTitle: string;
  /** "3.1": stage, dot, step. */
  label: string;
}

/** Where a level sits in the Academy, or null for a level that is not in the curriculum. */
export function curriculumPosition(levelId: Id): CurriculumPosition | null {
  for (const s of CURRICULUM) {
    const i = s.levelIds.indexOf(levelId);
    if (i >= 0) return { stage: s.stage, step: i + 1, stageTitle: s.title, label: `${s.stage}.${i + 1}` };
  }
  return null;
}

/** Every level id in teaching order. */
export const CURRICULUM_ORDER: readonly Id[] = CURRICULUM.flatMap((s) => s.levelIds);

/** Server-side only. */
export const REFERENCE_SOLUTIONS: ReferenceSolution[] = [
  {
    challengeId: LEVEL_1.id,
    graph: L1_REFERENCE,
    notes: 'Vault, then dCVV, then ledger. Each check has an XOR with a default decline. Vault error port goes straight to Declined.',
  },
  {
    challengeId: LEVEL_2.id,
    graph: L2_REFERENCE,
    notes: 'Sequential: 3DS first, ledger only for authenticated requests. An AND fork of 3DS and ledger is faster on the happy path but fails every no-ledger test.',
  },
  {
    challengeId: LEVEL_3.id,
    graph: L3_REFERENCE,
    notes: 'Recon desk with 5c tolerance, then one XOR branch per reconStatus value, each to its own End event.',
  },
  {
    challengeId: LEVEL_4.id,
    graph: L4_REFERENCE,
    notes:
      'Underwriter, then an XOR on bnplDecision. ELIGIBLE goes to a ledger check set to FIRST_INSTALMENT, anything else to a full-amount ledger check. Both feed one XOR that reads ledgerDecision and bnplDecision together: 4 branches to 4 End events. 10 nodes; separate post-ledger XORs also pass, at 11.',
  },
  ...ACADEMY_REFERENCES,
];
