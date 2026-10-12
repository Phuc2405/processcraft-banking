/**
 * The Academy levels (5 to 10). Levels 1 to 4 are in seedChallenges.ts; this file adds six more and seedChallenges.ts
 * puts all ten into teaching order.
 *
 *   5   The First Swipes                    a funds check and a graceful decline
 *   6   Card-Testing at Midnight            stop a burst of micro-payments without challenging genuine customers
 *   7   A2A Payments & ISO 20022            instant versus RTGS, the gateway queue, the liquidity cap, payroll priority
 *   8   The 23:59 Night Run: FX Breaks      fifteen foreign-exchange breaks to the FX gain and loss suspense accounts
 *   9   Sanctions Storm                     a VIP flagged by a false-positive sanctions hit
 *   10  Chargeback Warfare                  the dispute cycle, and who pays when 3-D Secure was used
 *
 * Money is integer cents (AUD): 8950 means $89.50.
 */

import type {
  A2aContext,
  AmlContext,
  AuditEvent,
  BankingPayload,
  ChallengeLevel,
  DisputeContext,
  Id,
  Outcome,
  ProcessGraph,
  ReferenceSolution,
  SettlementContext,
  TestCase,
  WatchlistEntry,
} from '../types/processLearning';
import {
  A2A,
  AML,
  CASE,
  CHARGEBACK,
  END,
  LEDGER,
  RECON,
  STANDARD_RUNNER,
  START,
  START_A2A,
  THREE_DS,
  XOR,
  makeEdge,
  makeNode,
  payload,
  settlement,
} from './seedKit';

/** A locked, pre-configured End event for starter graphs that hand the learner the endings and ask for the routing. */
const lockedEnd = (id: Id, label: string, outcome: Outcome, reasonCode: string, x: number, y: number) =>
  makeNode(END, id, label, { outcome, reasonCode }, { locked: true, x, y });

// ─────────────────────────────────────────────────────────────────────────────
// Level 5: The First Swipes
// ─────────────────────────────────────────────────────────────────────────────

const swipe = (txId: Id, amount: number, availableBalance: number, over: Partial<BankingPayload> = {}): BankingPayload =>
  payload({ txId, amount, channel: 'POS', cardType: 'DEBIT', riskScore: 6, availableBalance, creditLimit: 0, ...over });

const L5_TESTS: TestCase[] = [
  {
    id: 'L5-T1',
    name: 'A coffee on a healthy account',
    description: 'A $4.50 flat white, $120.00 in the account.',
    inputPayload: swipe('TX-L5-001', 450, 12000),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 60,
    requiredCapabilities: ['CORE_LEDGER_CHECK'],
    tags: ['happy-path'],
  },
  {
    id: 'L5-T2',
    name: 'Swipe $500.00 with $200.00 in the account',
    description:
      'The customer swipes for more than they have. The terminal must say "Declined: insufficient funds" and nothing must be held. This is a graceful decline: a clear reason, no crash, no half-finished payment.',
    inputPayload: swipe('TX-L5-002', 50000, 20000),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'INSUFFICIENT_FUNDS',
    maxLatencyMs: 60,
    requiredCapabilities: ['CORE_LEDGER_CHECK'],
    tags: ['decline', 'graceful'],
  },
  {
    id: 'L5-T3',
    name: 'Spending the exact balance',
    description: '$200.00 on a $200.00 balance. Enough is enough.',
    inputPayload: swipe('TX-L5-003', 20000, 20000),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 60,
    requiredCapabilities: ['CORE_LEDGER_CHECK'],
    tags: ['boundary'],
  },
  {
    id: 'L5-T4',
    name: 'One cent too many',
    inputPayload: swipe('TX-L5-004', 20001, 20000),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'INSUFFICIENT_FUNDS',
    maxLatencyMs: 60,
    requiredCapabilities: ['CORE_LEDGER_CHECK'],
    tags: ['decline', 'boundary'],
  },
  {
    id: 'L5-T5',
    name: 'Credit card, plenty of credit left',
    description: 'A $1,200.00 purchase with $3,000.00 of credit available.',
    inputPayload: swipe('TX-L5-005', 120000, 300000, { cardType: 'CREDIT', creditLimit: 500000 }),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 60,
    requiredCapabilities: ['CORE_LEDGER_CHECK'],
    tags: ['credit'],
  },
  {
    id: 'L5-T6',
    name: 'Credit card, not enough credit left',
    description: 'A $1,500.00 purchase with $1,200.00 of credit available.',
    inputPayload: swipe('TX-L5-006', 150000, 120000, { cardType: 'CREDIT', creditLimit: 500000 }),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'INSUFFICIENT_FUNDS',
    maxLatencyMs: 60,
    requiredCapabilities: ['CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['credit', 'decline'],
  },
  {
    id: 'L5-T7',
    name: 'Prepaid card with a small balance',
    inputPayload: swipe('TX-L5-007', 2500, 10000, { cardType: 'PREPAID' }),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 60,
    requiredCapabilities: ['CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['prepaid'],
  },
  {
    id: 'L5-T8',
    name: 'An empty account',
    inputPayload: swipe('TX-L5-008', 100, 0),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'INSUFFICIENT_FUNDS',
    maxLatencyMs: 60,
    requiredCapabilities: ['CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['decline'],
  },
];

const L5_STARTER: ProcessGraph = {
  id: 'g_l5_starter',
  name: 'Level 5 starter',
  challengeId: 'lvl_05_first_swipes',
  nodes: [
    makeNode(START, 'n_start', undefined, {}, { locked: true, x: 40, y: 200 }),
    makeNode(END, 'n_end_approved', 'Approved', { outcome: 'APPROVED' }, { locked: true, x: 900, y: 100 }),
  ],
  edges: [],
};

const LEVEL_5: ChallengeLevel = {
  id: 'lvl_05_first_swipes',
  levelNumber: 5,
  title: 'The First Swipes',
  domain: 'PAYMENTS',
  difficulty: 'BEGINNER',
  estimatedMinutes: 10,
  problemDescription: [
    'A customer taps their card at a till. Within a second the bank has to answer one question: **is the money there?** If it is, the sale is approved and the bank places a **hold** on the funds. If it is not, the till must show a clear **decline**, and nothing must be held.',
    '',
    '**Rules**',
    '1. Ask the **Core Ledger Check**. It compares the amount with what the customer can spend and writes `ledgerDecision`.',
    '2. `SUFFICIENT` means **approve**.',
    '3. Anything else means **decline**. Add an End event, set its outcome to **Declined**, and type `INSUFFICIENT_FUNDS` into its **Reason code** setting.',
    '',
    'A decline that carries a reason code is a **graceful decline**: the customer is told why and can try another card. A decline with no code, or a payment that hangs, is a bad experience.',
    '',
    'The start event and the Approved end event are already on the canvas.',
  ].join('\n'),
  learningObjectives: [
    'Follow one payment from the till to a decision: start, check, decision, end',
    'Use an XOR gateway with a default edge, so every payment lands somewhere',
    'Read a fact the ledger check wrote (ledgerDecision) in an edge condition',
    'Set a reason code on an end event so a decline explains itself',
  ],
  allowedNodePalette: {
    entries: [
      { nodeDefinitionId: LEDGER, maxCount: 1 },
      { nodeDefinitionId: XOR, maxCount: 1 },
      { nodeDefinitionId: END, maxCount: 1 },
    ],
    totalNodeBudget: 3,
  },
  starterGraph: L5_STARTER,
  testSuite: L5_TESTS,
  scoring: {
    passMark: 100,
    anomalyPenaltyPoints: 10,
    efficiency: { optimalNodeCount: 3, optimalAvgLatencyMs: 26, nodeCountWeight: 0.5, latencyWeight: 0.5 },
  },
  runnerConfig: STANDARD_RUNNER,
  hints: [
    'Drag a Core Ledger Check, a Decision (XOR) and an End event onto the canvas, then connect the start event to the check, and the check to the decision.',
    'ledgerDecision is only set after the Core Ledger Check has run. Put the decision straight after it.',
    'Click the edge that leaves the decision toward Approved and type a condition: ledgerDecision == \'SUFFICIENT\'. Mark the other edge as the default.',
    'A test that expects the right outcome but fails on the reason code means the Declined end event has no reason code yet.',
  ],
};

const L5_REFERENCE: ProcessGraph = {
  id: 'g_ref_l5',
  name: 'Level 5 reference',
  challengeId: LEVEL_5.id,
  nodes: [
    makeNode(START, 'n_start', undefined, {}, { locked: true, x: 40, y: 200 }),
    makeNode(LEDGER, 'n_ledger', 'Are the funds there?'),
    makeNode(XOR, 'n_xor_funds', 'Funds ok?'),
    makeNode(END, 'n_end_approved', 'Approved', { outcome: 'APPROVED' }, { locked: true, x: 900, y: 100 }),
    makeNode(END, 'n_end_declined', 'Declined: insufficient funds', { outcome: 'DECLINED', reasonCode: 'INSUFFICIENT_FUNDS' }),
  ],
  edges: [
    makeEdge('e1', ['n_start', 'out'], ['n_ledger', 'in']),
    makeEdge('e2', ['n_ledger', 'out'], ['n_xor_funds', 'in_1']),
    makeEdge('e3', ['n_xor_funds', 'out_1'], ['n_end_approved', 'in'], { when: "ledgerDecision == 'SUFFICIENT'", priority: 1 }),
    makeEdge('e4', ['n_xor_funds', 'out_2'], ['n_end_declined', 'in'], { isDefault: true }),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Level 6: Card-Testing at Midnight
// ─────────────────────────────────────────────────────────────────────────────

/** 2026-10-10 00:12 in Sydney (UTC+10), the hour card-testing bots like. */
const MIDNIGHT = Date.UTC(2026, 9, 9, 14, 12, 0);

const night = (txId: Id, amount: number, riskScore: number, recentAttempts: number, over: Partial<BankingPayload> = {}): BankingPayload =>
  payload({
    txId,
    amount,
    channel: 'ECOMMERCE',
    cardType: 'DEBIT',
    clientTimestamp: MIDNIGHT,
    riskScore,
    recentAttempts,
    availableBalance: 250000,
    creditLimit: 0,
    ...over,
  });

const L6_TESTS: TestCase[] = [
  {
    id: 'L6-T01',
    name: 'Genuine: $12.00 renewal at 00:12, risk 52',
    description: 'A subscription renews overnight. The risk score is in the challenge band, but $12.00 is under the low-value exemption, so the customer should not be challenged.',
    inputPayload: night('TX-L6-001', 1200, 52, 1),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK'],
    tags: ['genuine', 'exemption'],
  },
  {
    id: 'L6-T02',
    name: 'Genuine: $85.00 purchase, risk 55',
    description: 'Over the exemption, so this customer is sent to the OTP screen.',
    inputPayload: night('TX-L6-002', 8500, 55, 1),
    expectedOutcome: 'CHALLENGE_REQUIRED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR'],
    forbiddenCapabilities: ['CORE_LEDGER_CHECK'],
    tags: ['genuine', 'challenge'],
  },
  {
    id: 'L6-T03',
    name: 'Boundary: $29.99 is exempt',
    inputPayload: night('TX-L6-003', 2999, 61, 1),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK'],
    tags: ['exemption', 'boundary'],
  },
  {
    id: 'L6-T04',
    name: 'Boundary: $30.00 is not exempt',
    inputPayload: night('TX-L6-004', 3000, 61, 1),
    expectedOutcome: 'CHALLENGE_REQUIRED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR'],
    forbiddenCapabilities: ['CORE_LEDGER_CHECK'],
    tags: ['exemption', 'boundary'],
  },
  {
    id: 'L6-T05',
    name: 'Card-testing: $1.00 fourteen times in ten minutes',
    description: 'A bot is checking which stolen card numbers are live. Block it before spending a 3DS call on it, and without sending the real cardholder an OTP at midnight.',
    inputPayload: night('TX-L6-005', 100, 74, 14, { isFraud: true }),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'CARD_TESTING',
    maxLatencyMs: 20,
    forbiddenCapabilities: ['THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK'],
    tags: ['card-testing'],
  },
  {
    id: 'L6-T06',
    name: 'Card-testing that looks clean: $0.50, sixth attempt, risk 18',
    description: 'The risk score alone misses this one. The pattern does not.',
    inputPayload: night('TX-L6-006', 50, 18, 6, { isFraud: true }),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'CARD_TESTING',
    maxLatencyMs: 20,
    forbiddenCapabilities: ['THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['card-testing'],
  },
  {
    id: 'L6-T07',
    name: 'A retry is not a burst: $40.00, third attempt, risk 22',
    description: 'A customer whose first two payment attempts failed on a typo.',
    inputPayload: night('TX-L6-007', 4000, 22, 3),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK'],
    tags: ['genuine', 'retry'],
  },
  {
    id: 'L6-T08',
    name: 'Many attempts, but a big ticket: $400.00, eight attempts, risk 30',
    description: 'Card-testing is small money. A large payment with many attempts is handled like any other.',
    inputPayload: night('TX-L6-008', 40000, 30, 8),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['burst', 'big-ticket'],
  },
  {
    id: 'L6-T09',
    name: 'The reject line still holds: $10.00 at risk 85',
    description: 'The exemption covers the challenge band only. At risk 80 or more the request is declined whatever the amount.',
    inputPayload: night('TX-L6-009', 1000, 85, 1, { isFraud: true }),
    expectedOutcome: 'DECLINED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR'],
    forbiddenCapabilities: ['CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['fraud'],
  },
  {
    id: 'L6-T10',
    name: 'Exempt but broke: $20.00 with $15.00 available',
    inputPayload: night('TX-L6-010', 2000, 55, 1, { availableBalance: 1500 }),
    expectedOutcome: 'DECLINED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['funds'],
  },
  {
    id: 'L6-T11',
    name: 'Boundary: the fifth $5.00 attempt is a burst',
    inputPayload: night('TX-L6-011', 500, 20, 5, { isFraud: true }),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'CARD_TESTING',
    maxLatencyMs: 20,
    forbiddenCapabilities: ['THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['card-testing', 'boundary'],
  },
  {
    id: 'L6-T12',
    name: 'Boundary: the fourth $5.00 attempt is not',
    inputPayload: night('TX-L6-012', 500, 20, 4),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['card-testing', 'boundary'],
  },
  {
    id: 'L6-T13',
    name: 'Boundary: $5.01 is not micro',
    inputPayload: night('TX-L6-013', 501, 20, 9),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 120,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK'],
    hidden: true,
    tags: ['card-testing', 'boundary'],
  },
];

const L6_STARTER: ProcessGraph = {
  id: 'g_l6_starter',
  name: 'Level 6 starter',
  challengeId: 'lvl_06_card_testing',
  nodes: [makeNode(START, 'n_start', undefined, {}, { locked: true, x: 40, y: 220 })],
  edges: [],
};

const LEVEL_6: ChallengeLevel = {
  id: 'lvl_06_card_testing',
  levelNumber: 6,
  title: 'Card-Testing at Midnight',
  domain: 'PAYMENTS',
  difficulty: 'INTERMEDIATE',
  estimatedMinutes: 25,
  problemDescription: [
    'Every night around midnight, bots run through lists of stolen card numbers with **tiny payments** ($1, $0.50) to find out which cards are live. This is **card-testing**. The bank wants to stop it **without making genuine customers jump through hoops**. Every unnecessary OTP challenge is a customer who may abandon their cart.',
    '',
    '**Policy**',
    '',
    '| Situation | Result |',
    '|---|---|',
    '| **Card-testing**: 5 or more attempts on the card in 10 minutes (`recentAttempts >= 5`) **and** an amount of $5.00 or less | **Decline** with reason `CARD_TESTING`. Do it **before** a 3DS call or a ledger check is spent on it. |',
    '| Authenticated by 3DS (frictionless, or a completed challenge) | Funds check |',
    '| In the challenge band, and **under $30.00** | **Low-value exemption**: no challenge, go to the funds check |',
    '| In the challenge band, **$30.00 or more** | **CHALLENGE_REQUIRED** |',
    '| Anything else (rejected, or a failed challenge) | **Decline** |',
    '',
    'After the funds check: approve if `SUFFICIENT`, otherwise decline.',
    '',
    '**Why the burst rule comes first.** Card-testing payments are small, which is exactly what the low-value exemption lets through without a challenge. Without the burst rule, the exemption becomes the fraudster\'s best friend. And a bot that scores a low risk of 18 is not caught by a risk score at all.',
    '',
    'The start event is on the canvas. You build the rest, including the End events.',
  ].join('\n'),
  learningObjectives: [
    'Combine two conditions with && to describe a pattern (many attempts and a small amount)',
    'Put a cheap check in front of an expensive one, and stop bad traffic early',
    'Apply the low-value exemption to cut customer friction without opening a hole',
    'Weigh fraud caught against customers lost, and see why a risk score alone is not enough',
  ],
  allowedNodePalette: {
    entries: [
      { nodeDefinitionId: THREE_DS, maxCount: 1 },
      { nodeDefinitionId: LEDGER, maxCount: 1 },
      { nodeDefinitionId: XOR, maxCount: 4 },
      { nodeDefinitionId: END, maxCount: 5 },
    ],
    totalNodeBudget: 11,
  },
  starterGraph: L6_STARTER,
  testSuite: L6_TESTS,
  scoring: {
    passMark: 100,
    anomalyPenaltyPoints: 10,
    efficiency: { optimalNodeCount: 9, optimalAvgLatencyMs: 51, nodeCountWeight: 0.5, latencyWeight: 0.5 },
  },
  runnerConfig: STANDARD_RUNNER,
  hints: [
    'recentAttempts is a payload field, available from the start. A decision on it needs no node before it, so it can be the very first thing your diagram does.',
    'Combine two tests in one condition: recentAttempts >= 5 && amount <= 500. Amounts are in cents.',
    'The 3DS Risk Evaluator writes threeDsPath. CHALLENGE means "in the band and not yet challenged". Two of your edges can lead to the same Core Ledger Check.',
    'Order matters. At an XOR gateway the first true condition wins, so put the most specific rule first.',
  ],
};

const L6_REFERENCE: ProcessGraph = {
  id: 'g_ref_l6',
  name: 'Level 6 reference',
  challengeId: LEVEL_6.id,
  nodes: [
    makeNode(START, 'n_start', undefined, {}, { locked: true, x: 40, y: 220 }),
    makeNode(XOR, 'n_xor_burst', 'Card-testing?'),
    makeNode(THREE_DS, 'n_3ds'),
    makeNode(XOR, 'n_xor_route', '3DS route'),
    makeNode(LEDGER, 'n_ledger'),
    makeNode(XOR, 'n_xor_funds', 'Funds ok?'),
    makeNode(END, 'n_end_approved', 'Approved', { outcome: 'APPROVED' }),
    makeNode(END, 'n_end_challenge', 'Send to OTP', { outcome: 'CHALLENGE_REQUIRED' }),
    makeNode(END, 'n_end_declined', 'Declined', { outcome: 'DECLINED' }),
    makeNode(END, 'n_end_testing', 'Blocked: card-testing', { outcome: 'DECLINED', reasonCode: 'CARD_TESTING' }),
  ],
  edges: [
    makeEdge('e1', ['n_start', 'out'], ['n_xor_burst', 'in_1']),
    makeEdge('e2', ['n_xor_burst', 'out_1'], ['n_end_testing', 'in'], { when: 'recentAttempts >= 5 && amount <= 500', priority: 1, label: 'burst of micro-payments' }),
    makeEdge('e3', ['n_xor_burst', 'out_2'], ['n_3ds', 'in'], { isDefault: true }),
    makeEdge('e4', ['n_3ds', 'out'], ['n_xor_route', 'in_1']),
    makeEdge('e5', ['n_xor_route', 'out_1'], ['n_ledger', 'in'], { when: 'authenticated == true', priority: 1 }),
    makeEdge('e6', ['n_xor_route', 'out_2'], ['n_ledger', 'in'], { when: "threeDsPath == 'CHALLENGE' && amount < 3000", priority: 2, label: 'low-value exemption' }),
    makeEdge('e7', ['n_xor_route', 'out_3'], ['n_end_challenge', 'in'], { when: "threeDsPath == 'CHALLENGE'", priority: 3 }),
    makeEdge('e8', ['n_xor_route', 'out_4'], ['n_end_declined', 'in'], { isDefault: true }),
    makeEdge('e9', ['n_ledger', 'out'], ['n_xor_funds', 'in_1']),
    makeEdge('e10', ['n_xor_funds', 'out_1'], ['n_end_approved', 'in'], { when: "ledgerDecision == 'SUFFICIENT'", priority: 1 }),
    makeEdge('e11', ['n_xor_funds', 'out_2'], ['n_end_declined', 'in'], { isDefault: true }),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Level 7: A2A Payments & ISO 20022
// ─────────────────────────────────────────────────────────────────────────────

const A2A_BASE: A2aContext = {
  endToEndId: 'INV-2026-000417',
  debtorAgent: 'NOVAAU2S',
  creditorAgent: 'HRBRAU3MXXX',
  interbankSettlementAmount: 0,
  currency: 'AUD',
  purposeCode: 'SUPP',
  queueDepth: 12,
  liquidityAvailableMinor: 90_000_000,
};

/** An account-to-account payment arriving as a pacs.008. `ctx` overrides the message or the gateway state. */
const transfer = (txId: Id, amount: number, ctx: Partial<A2aContext> = {}): BankingPayload =>
  payload({
    txId,
    amount,
    channel: 'IN_APP',
    cardType: 'DEBIT',
    riskScore: 5,
    availableBalance: amount * 4,
    creditLimit: 0,
    a2a: { ...A2A_BASE, interbankSettlementAmount: amount, ...ctx },
  });

const L7_TESTS: TestCase[] = [
  {
    id: 'L7-T01',
    name: 'Supplier invoice: $1,250.00',
    description: 'A small payment, an open queue and plenty of liquidity. It goes on the instant rail.',
    inputPayload: transfer('TX-L7-001', 125_000),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'RAIL_INSTANT',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    tags: ['instant'],
  },
  {
    id: 'L7-T02',
    name: 'Boundary: exactly $25,000.00 is still instant',
    inputPayload: transfer('TX-L7-002', 2_500_000),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'RAIL_INSTANT',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    tags: ['instant', 'boundary'],
  },
  {
    id: 'L7-T03',
    name: 'Boundary: $25,000.01 goes by RTGS',
    inputPayload: transfer('TX-L7-003', 2_500_001),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'RAIL_RTGS',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    tags: ['rtgs', 'boundary'],
  },
  {
    id: 'L7-T04',
    name: 'Property settlement: $320,000.00',
    inputPayload: transfer('TX-L7-004', 32_000_000),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'RAIL_RTGS',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    tags: ['rtgs'],
  },
  {
    id: 'L7-T05',
    name: 'Payroll into a congested queue: $180,000.00',
    description: 'The queue is full (50 waiting). Payroll is priority, so it skips the queue and is released by RTGS.',
    inputPayload: transfer('TX-L7-005', 18_000_000, { purposeCode: 'SALA', queueDepth: 50 }),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'RAIL_RTGS',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    tags: ['payroll', 'priority'],
  },
  {
    id: 'L7-T06',
    name: 'An ordinary payment into a congested queue: $12,000.00',
    description: 'The same full queue. A non-priority payment waits its turn.',
    inputPayload: transfer('TX-L7-006', 1_200_000, { queueDepth: 50 }),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'HELD_CONGESTION',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    tags: ['queue'],
  },
  {
    id: 'L7-T07',
    name: 'Ordinary payment over the liquidity cap: $75,000.00',
    description: '$150,000.00 of liquidity, of which $100,000.00 is reserved for priority payments. An ordinary payment can use $50,000.00.',
    inputPayload: transfer('TX-L7-007', 7_500_000, { liquidityAvailableMinor: 15_000_000 }),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'HELD_LIQUIDITY',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    tags: ['liquidity'],
  },
  {
    id: 'L7-T08',
    name: 'Payroll may use the reserve: $75,000.00',
    description: 'The same liquidity position. Payroll can draw on all of it.',
    inputPayload: transfer('TX-L7-008', 7_500_000, { liquidityAvailableMinor: 15_000_000, purposeCode: 'SALA' }),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'RAIL_RTGS',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    tags: ['payroll', 'priority', 'liquidity'],
  },
  {
    id: 'L7-T09',
    name: 'Even payroll cannot create liquidity: $400,000.00 against $250,000.00',
    inputPayload: transfer('TX-L7-009', 40_000_000, { liquidityAvailableMinor: 25_000_000, purposeCode: 'SALA' }),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'HELD_LIQUIDITY',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    hidden: true,
    tags: ['payroll', 'liquidity'],
  },
  {
    id: 'L7-T10',
    name: 'No EndToEndId',
    description: 'Without an EndToEndId nobody can trace the payment, so the gateway rejects the message.',
    inputPayload: transfer('TX-L7-010', 450_000, { endToEndId: '' }),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'INVALID_MESSAGE',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    tags: ['validation'],
  },
  {
    id: 'L7-T11',
    name: 'A bank identifier that is not a BIC',
    inputPayload: transfer('TX-L7-011', 450_000, { creditorAgent: 'HRBR' }),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'INVALID_MESSAGE',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    hidden: true,
    tags: ['validation'],
  },
  {
    id: 'L7-T12',
    name: 'InterbankSettlementAmount differs from the instruction',
    inputPayload: transfer('TX-L7-012', 450_000, { interbankSettlementAmount: 405_000 }),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'INVALID_MESSAGE',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    hidden: true,
    tags: ['validation'],
  },
  {
    id: 'L7-T13',
    name: 'Small payroll in a congested queue: $4,200.00',
    description: 'Priority skips the queue on the instant rail too.',
    inputPayload: transfer('TX-L7-013', 420_000, { purposeCode: 'SALA', queueDepth: 80 }),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'RAIL_INSTANT',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    hidden: true,
    tags: ['payroll', 'priority'],
  },
  {
    id: 'L7-T14',
    name: 'Congested and short of liquidity: liquidity is reported first',
    inputPayload: transfer('TX-L7-014', 7_500_000, { liquidityAvailableMinor: 15_000_000, queueDepth: 50 }),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'HELD_LIQUIDITY',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    hidden: true,
    tags: ['liquidity', 'queue'],
  },
  {
    id: 'L7-T15',
    name: 'An invalid message is rejected even when the queue is full',
    inputPayload: transfer('TX-L7-015', 450_000, { endToEndId: '', queueDepth: 50 }),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'INVALID_MESSAGE',
    maxLatencyMs: 80,
    requiredCapabilities: ['A2A_GATEWAY'],
    hidden: true,
    tags: ['validation', 'queue'],
  },
];

const L7_STARTER: ProcessGraph = {
  id: 'g_l7_starter',
  name: 'Level 7 starter',
  challengeId: 'lvl_07_a2a_iso20022',
  nodes: [makeNode(START_A2A, 'n_start', undefined, {}, { locked: true, x: 40, y: 220 })],
  edges: [],
};

const LEVEL_7: ChallengeLevel = {
  id: 'lvl_07_a2a_iso20022',
  levelNumber: 7,
  title: 'The Lifeblood Network: A2A & ISO 20022',
  domain: 'PAYMENTS',
  difficulty: 'ADVANCED',
  estimatedMinutes: 30,
  problemDescription: [
    'Account-to-account (**A2A**) payments move money straight from one bank account to another: payroll, invoices, house purchases. They arrive as **ISO 20022 pacs.008** messages. Four fields matter: the **EndToEndId** (the payment\'s reference), the **DebtorAgent** and **CreditorAgent** (the two banks, by BIC), and the **InterbankSettlementAmount**.',
    '',
    'Your bank\'s **A2A Payment Gateway** sits in front of two rails. The **instant rail** takes payments up to a limit in seconds. **RTGS** (real-time gross settlement, at the central bank) takes anything larger. The gateway has a **queue** and a daily **liquidity** budget, and some of that budget is held back for payroll.',
    '',
    '**Policy**',
    '',
    '| Check, in this order | Result | Reason code |',
    '|---|---|---|',
    '| Message invalid (missing EndToEndId, bad BIC, amount mismatch) | **DECLINED** | `INVALID_MESSAGE` |',
    '| Not enough liquidity for this payment | **ROUTED_TO_SUSPENSE** (held in the gateway queue) | `HELD_LIQUIDITY` |',
    '| Queue congested, and the payment is **not** priority | **ROUTED_TO_SUSPENSE** | `HELD_CONGESTION` |',
    '| Otherwise, amount within the instant limit | **APPROVED** on the instant rail | `RAIL_INSTANT` |',
    '| Otherwise | **APPROVED** by RTGS | `RAIL_RTGS` |',
    '',
    '**Settings.** The instant rail carries payments up to **$25,000.00**. The gateway node\'s default is $50,000.00, so you must change it. The queue capacity (50) and the priority reserve ($100,000.00) already match the policy.',
    '',
    '**Priority routing.** Payroll (purpose code `SALA`) is priority. It skips the congestion queue and may use the reserve. The gateway works that out for you and writes `a2aPriority`, `a2aQueue` and `a2aLiquidity`. Your job is to route on them.',
    '',
    '"Held" payments are not rejected. They wait in the gateway queue and go out when the queue clears or liquidity arrives, which is why the outcome is ROUTED_TO_SUSPENSE and not DECLINED. The start event is on the canvas.',
  ].join('\n'),
  learningObjectives: [
    'Read the four pacs.008 fields the gateway checks, and know what each one is for',
    'Choose between the instant rail and RTGS on the amount, with a setting you change yourself',
    'Hold a payment instead of rejecting it, and tell a held payment from a refused one',
    'Route payroll with priority: past the congestion queue and into the reserve',
  ],
  allowedNodePalette: {
    entries: [
      { nodeDefinitionId: A2A, maxCount: 1 },
      { nodeDefinitionId: XOR, maxCount: 3 },
      { nodeDefinitionId: END, maxCount: 6 },
    ],
    totalNodeBudget: 9,
  },
  starterGraph: L7_STARTER,
  testSuite: L7_TESTS,
  scoring: {
    passMark: 100,
    anomalyPenaltyPoints: 10,
    efficiency: { optimalNodeCount: 8, optimalAvgLatencyMs: 32, nodeCountWeight: 0.5, latencyWeight: 0.5 },
  },
  runnerConfig: STANDARD_RUNNER,
  hints: [
    'Select the A2A Payment Gateway to see its settings. Amounts are in cents, so $25,000.00 is 2500000.',
    'The gateway writes five facts and decides nothing. Put a Decision (XOR) straight after it and route on them.',
    'The order of the checks is the policy. Put the most serious problem on the first edge: an invalid message.',
    'A congested queue only matters for a payment that is not priority: a2aQueue == \'CONGESTED\' && a2aPriority == \'NORMAL\'.',
    'Two End events can both be APPROVED. The reason code, RAIL_INSTANT or RAIL_RTGS, is what tells them apart.',
  ],
};

const L7_REFERENCE: ProcessGraph = {
  id: 'g_ref_l7',
  name: 'Level 7 reference',
  challengeId: LEVEL_7.id,
  nodes: [
    makeNode(START_A2A, 'n_start', undefined, {}, { locked: true, x: 40, y: 220 }),
    makeNode(A2A, 'n_gateway', undefined, { instantLimitMinor: 2_500_000 }),
    makeNode(XOR, 'n_xor_checks', 'Can it go?'),
    makeNode(XOR, 'n_xor_rail', 'Which rail?'),
    makeNode(END, 'n_end_invalid', 'Rejected: invalid message', { outcome: 'DECLINED', reasonCode: 'INVALID_MESSAGE' }),
    makeNode(END, 'n_end_liquidity', 'Held: liquidity', { outcome: 'ROUTED_TO_SUSPENSE', reasonCode: 'HELD_LIQUIDITY' }),
    makeNode(END, 'n_end_congestion', 'Held: congestion', { outcome: 'ROUTED_TO_SUSPENSE', reasonCode: 'HELD_CONGESTION' }),
    makeNode(END, 'n_end_instant', 'Released: instant rail', { outcome: 'APPROVED', reasonCode: 'RAIL_INSTANT' }),
    makeNode(END, 'n_end_rtgs', 'Released: RTGS', { outcome: 'APPROVED', reasonCode: 'RAIL_RTGS' }),
  ],
  edges: [
    makeEdge('e1', ['n_start', 'out'], ['n_gateway', 'in']),
    makeEdge('e2', ['n_gateway', 'out'], ['n_xor_checks', 'in_1']),
    makeEdge('e3', ['n_xor_checks', 'out_1'], ['n_end_invalid', 'in'], { when: 'a2aValid == false', priority: 1 }),
    makeEdge('e4', ['n_xor_checks', 'out_2'], ['n_end_liquidity', 'in'], { when: "a2aLiquidity == 'SHORTFALL'", priority: 2 }),
    makeEdge('e5', ['n_xor_checks', 'out_3'], ['n_end_congestion', 'in'], { when: "a2aQueue == 'CONGESTED' && a2aPriority == 'NORMAL'", priority: 3 }),
    makeEdge('e6', ['n_xor_checks', 'out_4'], ['n_xor_rail', 'in_1'], { isDefault: true }),
    makeEdge('e7', ['n_xor_rail', 'out_1'], ['n_end_instant', 'in'], { when: "a2aRail == 'INSTANT'", priority: 1 }),
    makeEdge('e8', ['n_xor_rail', 'out_2'], ['n_end_rtgs', 'in'], { isDefault: true }),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Level 8: The 23:59 Night Run, FX Breaks
// ─────────────────────────────────────────────────────────────────────────────

/** AUD cents for a foreign amount (in the foreign currency's cents) at a micro-AUD rate, rounded to the cent. */
export const audLeg = (foreignMinor: number, rateMicro: number): number => Math.round((foreignMinor * rateMicro) / 1_000_000);

const reconPayload = (txId: Id, amount: number, s: SettlementContext): BankingPayload =>
  payload({ txId, amount, channel: 'POS', cardType: 'DEBIT', riskScore: 5, availableBalance: 0, settlement: s });

/** A foreign purchase booked at one rate and settled by the scheme at another. Clearing and switch agree on the settled amount. */
export function fxPurchase(txId: Id, currency: string, foreignMinor: number, bookedRateMicro: number, settledRateMicro: number): BankingPayload {
  const ledger = audLeg(foreignMinor, bookedRateMicro);
  const settled = audLeg(foreignMinor, settledRateMicro);
  return reconPayload(txId, ledger, { ...settlement(ledger, settled, settled), fx: { currency, foreignAmountMinor: foreignMinor, bookedRateMicro, settledRateMicro } });
}

/** Fifteen foreign-currency purchases whose scheme rate moved between the authorisation and the settlement. */
const FX_BREAKS: ReadonlyArray<readonly [currency: string, foreignMinor: number, booked: number, settled: number]> = [
  ['USD', 25_000, 1_532_000, 1_541_500],
  ['USD', 8_990, 1_541_000, 1_528_000],
  ['EUR', 12_000, 1_668_000, 1_679_500],
  ['EUR', 45_050, 1_679_000, 1_664_200],
  ['GBP', 9_900, 1_985_000, 2_001_000],
  ['GBP', 150_000, 2_012_000, 1_998_000],
  ['NZD', 33_000, 912_000, 918_500],
  ['NZD', 5_400, 921_000, 907_000],
  ['SGD', 21_000, 1_149_000, 1_158_000],
  ['CAD', 7_800, 1_105_000, 1_093_500],
  ['CHF', 64_000, 1_720_000, 1_731_000],
  ['USD', 300_000, 1_535_000, 1_544_000],
  ['EUR', 2_500, 1_690_000, 1_705_000],
  ['GBP', 7_777, 2_030_000, 2_018_000],
  ['USD', 1_999, 1_548_000, 1_536_000],
];

const fxTests = (): TestCase[] =>
  FX_BREAKS.map(([currency, foreignMinor, booked, settled], i) => {
    const n = String(i + 1).padStart(2, '0');
    const loss = settled > booked;
    const p = fxPurchase(`TX-L8-FX${n}`, currency, foreignMinor, booked, settled);
    const rates = `${currency} ${(foreignMinor / 100).toFixed(2)}, booked at ${(booked / 1e6).toFixed(4)}, settled at ${(settled / 1e6).toFixed(4)}.`;
    return {
      id: `L8-FX${n}`,
      name: `FX break ${n}: ${currency} ${loss ? 'loss' : 'gain'}`,
      description: `${rates} The scheme settled for ${loss ? 'more' : 'less'} than the bank booked, and the rate difference explains it.`,
      inputPayload: p,
      expectedOutcome: 'ROUTED_TO_SUSPENSE' as const,
      expectedReasonCode: loss ? 'SUSP_FX_LOSS' : 'SUSP_FX_GAIN',
      maxLatencyMs: 200,
      requiredCapabilities: ['RECON_DESK' as const],
      ...(i >= 10 ? { hidden: true } : {}),
      tags: ['fx', loss ? 'loss' : 'gain'],
    };
  });

const L8_TESTS: TestCase[] = [
  ...fxTests(),
  {
    id: 'L8-C1',
    name: 'Exact three-way match',
    inputPayload: reconPayload('TX-L8-C01', 12_000, settlement(12_000, 12_000, 12_000)),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    tags: ['match'],
  },
  {
    id: 'L8-C2',
    name: 'A 1c rounding gap is not a break',
    description: 'Legs within 2 cents match.',
    inputPayload: reconPayload('TX-L8-C02', 4_500, settlement(4_500, 4_501, 4_501)),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    tags: ['tolerance'],
  },
  {
    id: 'L8-C3',
    name: 'FX purchase where the rate barely moved',
    description: 'EUR 30.00, booked at 1.6800 and settled at 1.6801: the legs agree to the cent.',
    inputPayload: fxPurchase('TX-L8-C03', 'EUR', 3_000, 1_680_000, 1_680_100),
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    tags: ['match', 'fx'],
  },
  {
    id: 'L8-C4',
    name: 'Authorised, never cleared',
    inputPayload: reconPayload('TX-L8-C04', 18_000, settlement(18_000, null, 18_000)),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'SUSP_MISSING_LEG',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    tags: ['break', 'missing-leg'],
  },
  {
    id: 'L8-C5',
    name: 'Duplicate presentment',
    inputPayload: reconPayload('TX-L8-C05', 9_900, settlement(9_900, 9_900, 9_900, 2)),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'SUSP_DUPLICATE',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    tags: ['break', 'duplicate'],
  },
  {
    id: 'L8-C6',
    name: 'Transposed digits on a domestic purchase',
    description: '$250.00 booked, $205.00 cleared. There is no foreign currency, so nothing explains it: general suspense, not FX.',
    inputPayload: reconPayload('TX-L8-C06', 25_000, settlement(25_000, 20_500, 25_000)),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'SUSP_AMOUNT_VARIANCE',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    tags: ['break', 'unexplained'],
  },
  {
    id: 'L8-C7',
    name: 'Foreign purchase with a break the rates do not explain',
    description: 'USD 100.00 should move by $1.00 with the rates. The gap is $3.50: the scheme also added a fee. That part is not FX.',
    inputPayload: (() => {
      const ledger = audLeg(10_000, 1_530_000);
      const cleared = ledger + 350;
      return reconPayload('TX-L8-C07', ledger, { ...settlement(ledger, cleared, cleared), fx: { currency: 'USD', foreignAmountMinor: 10_000, bookedRateMicro: 1_530_000, settledRateMicro: 1_540_000 } });
    })(),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'SUSP_AMOUNT_VARIANCE',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    hidden: true,
    tags: ['break', 'unexplained', 'fx'],
  },
  {
    id: 'L8-C8',
    name: 'Foreign purchase where clearing and switch disagree',
    description: 'The clearing file moved by the rate. The switch report did not. The rate cannot explain a disagreement between two reports.',
    inputPayload: (() => {
      const ledger = audLeg(10_000, 1_530_000);
      const cleared = audLeg(10_000, 1_540_000);
      return reconPayload('TX-L8-C08', ledger, { ...settlement(ledger, cleared, cleared - 50), fx: { currency: 'USD', foreignAmountMinor: 10_000, bookedRateMicro: 1_530_000, settledRateMicro: 1_540_000 } });
    })(),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'SUSP_AMOUNT_VARIANCE',
    maxLatencyMs: 200,
    requiredCapabilities: ['RECON_DESK'],
    hidden: true,
    tags: ['break', 'unexplained', 'fx'],
  },
];

const L8_STARTER: ProcessGraph = {
  id: 'g_l8_starter',
  name: 'Level 8 starter',
  challengeId: 'lvl_08_fx_breaks',
  nodes: [
    makeNode(START, 'n_start', undefined, {}, { locked: true, x: 40, y: 330 }),
    lockedEnd('n_end_settled', 'Settled', 'APPROVED', '', 1000, 20),
    lockedEnd('n_end_variance', 'Suspense: unexplained variance', 'ROUTED_TO_SUSPENSE', 'SUSP_AMOUNT_VARIANCE', 1000, 150),
    lockedEnd('n_end_missing', 'Suspense: missing leg', 'ROUTED_TO_SUSPENSE', 'SUSP_MISSING_LEG', 1000, 280),
    lockedEnd('n_end_dup', 'Suspense: duplicate', 'ROUTED_TO_SUSPENSE', 'SUSP_DUPLICATE', 1000, 410),
    lockedEnd('n_end_fx_loss', 'FX loss suspense', 'ROUTED_TO_SUSPENSE', 'SUSP_FX_LOSS', 1000, 540),
    lockedEnd('n_end_fx_gain', 'FX gain suspense', 'ROUTED_TO_SUSPENSE', 'SUSP_FX_GAIN', 1000, 670),
  ],
  edges: [],
};

const LEVEL_8: ChallengeLevel = {
  id: 'lvl_08_fx_breaks',
  levelNumber: 8,
  title: 'The 23:59 Night Run: FX Breaks',
  domain: 'PAYMENTS',
  difficulty: 'ADVANCED',
  estimatedMinutes: 30,
  problemDescription: [
    'It is 23:59. The end-of-day run has produced a long list of breaks, and **fifteen of them are foreign-currency purchases**. A customer paid in dollars; the bank booked the authorisation at one exchange rate and the card scheme settled at another. The legs disagree, but **nobody made a mistake**: the exchange rate moved.',
    '',
    'Dumping those into the general suspense account would bury a real problem under fifteen harmless ones. FX differences belong in their own **FX gain and loss suspense accounts**, where treasury recognises them.',
    '',
    '**Rules**',
    '- Set the Recon Desk tolerance so legs within **2 cents** match.',
    '- The Recon Desk now also writes **`reconCause`** on an amount break: `FX_RATE` when the foreign amount times the change in rate explains the gap, otherwise `UNEXPLAINED`. When it is `FX_RATE`, **`fxDirection`** says `LOSS` (the scheme settled for more than was booked) or `GAIN`.',
    '',
    '| Result | End event |',
    '|---|---|',
    '| Matched | Settled |',
    '| Amount break explained by FX, a loss | `SUSP_FX_LOSS` |',
    '| Amount break explained by FX, a gain | `SUSP_FX_GAIN` |',
    '| Amount break **not** explained by FX | `SUSP_AMOUNT_VARIANCE` |',
    '| A leg is missing | `SUSP_MISSING_LEG` |',
    '| Presented twice | `SUSP_DUPLICATE` |',
    '',
    'The start event and all six End events are on the canvas, already configured. You wire the routing.',
  ].join('\n'),
  learningObjectives: [
    'Explain why a foreign-currency purchase can break at settlement without anyone being wrong',
    'Chain two decisions: first the kind of break, then its cause',
    'Keep real exceptions visible by sending explained differences to their own account',
    'Cover every value of a status so nothing is silently settled or dropped',
  ],
  allowedNodePalette: {
    entries: [
      { nodeDefinitionId: RECON, maxCount: 1 },
      { nodeDefinitionId: XOR, maxCount: 3 },
    ],
    totalNodeBudget: 5,
  },
  starterGraph: L8_STARTER,
  testSuite: L8_TESTS,
  scoring: {
    passMark: 100,
    anomalyPenaltyPoints: 10,
    efficiency: { optimalNodeCount: 3, optimalAvgLatencyMs: 122, nodeCountWeight: 0.5, latencyWeight: 0.5 },
  },
  runnerConfig: STANDARD_RUNNER,
  hints: [
    'The Recon Desk\'s tolerance defaults to 0. Set it before you test anything.',
    'First sort by reconStatus (matched, missing leg, duplicate). Send BREAK_AMOUNT to a second decision that reads reconCause and fxDirection.',
    'A decision has four output ports. Use the default edge for the last branch.',
    'If a domestic break lands in an FX account, check that your FX condition reads reconCause, not only fxDirection.',
  ],
};

const L8_REFERENCE: ProcessGraph = {
  id: 'g_ref_l8',
  name: 'Level 8 reference',
  challengeId: LEVEL_8.id,
  nodes: [
    ...L8_STARTER.nodes,
    makeNode(RECON, 'n_recon', undefined, { toleranceMinor: 2 }),
    makeNode(XOR, 'n_xor_status', 'Matched?'),
    makeNode(XOR, 'n_xor_cause', 'Why the gap?'),
  ],
  edges: [
    makeEdge('e1', ['n_start', 'out'], ['n_recon', 'in']),
    makeEdge('e2', ['n_recon', 'out'], ['n_xor_status', 'in_1']),
    makeEdge('e3', ['n_xor_status', 'out_1'], ['n_end_settled', 'in'], { when: "reconStatus == 'MATCHED'", priority: 1 }),
    makeEdge('e4', ['n_xor_status', 'out_2'], ['n_end_missing', 'in'], { when: "reconStatus == 'BREAK_MISSING_LEG'", priority: 2 }),
    makeEdge('e5', ['n_xor_status', 'out_3'], ['n_end_dup', 'in'], { when: "reconStatus == 'BREAK_DUPLICATE'", priority: 3 }),
    makeEdge('e6', ['n_xor_status', 'out_4'], ['n_xor_cause', 'in_1'], { isDefault: true, label: 'amount break' }),
    makeEdge('e7', ['n_xor_cause', 'out_1'], ['n_end_fx_loss', 'in'], { when: "reconCause == 'FX_RATE' && fxDirection == 'LOSS'", priority: 1 }),
    makeEdge('e8', ['n_xor_cause', 'out_2'], ['n_end_fx_gain', 'in'], { when: "reconCause == 'FX_RATE' && fxDirection == 'GAIN'", priority: 2 }),
    makeEdge('e9', ['n_xor_cause', 'out_3'], ['n_end_variance', 'in'], { isDefault: true }),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Level 9: Sanctions Storm
// ─────────────────────────────────────────────────────────────────────────────

// All of these people are invented.
const OFAC_VOLKANOV: WatchlistEntry = { list: 'OFAC', name: 'Dmitri Volkanov', dateOfBirth: '1962-04-11', country: 'RU' };
const PEP_DUARTE: WatchlistEntry = { list: 'PEP', name: 'Helena Marques Duarte', dateOfBirth: '1958-09-30', country: 'PT' };
const LISTS: WatchlistEntry[] = [OFAC_VOLKANOV, PEP_DUARTE, { list: 'OFAC', name: 'Rashid Al-Tamimi', dateOfBirth: '1970-01-23', country: 'SY' }];

const DAY = 86_400_000;
const AUDIT_T = Date.UTC(2024, 2, 5, 1, 0, 0);

const kycEvent = (dateOfBirth: string, nationality: string, kind: AuditEvent['kind'] = 'KYC_VERIFIED'): AuditEvent => ({
  at: AUDIT_T,
  kind,
  detail: kind === 'KYC_VERIFIED' ? `Passport checked in branch, ${nationality}, born ${dateOfBirth}` : `Driver licence scanned, ${nationality}, born ${dateOfBirth}`,
  dateOfBirth,
  nationality,
});
const OPENED: AuditEvent = { at: AUDIT_T - 400 * DAY, kind: 'ACCOUNT_OPENED', detail: 'Account opened online' };
const SCREENED: AuditEvent = { at: AUDIT_T + DAY, kind: 'SCREENING_RUN', detail: 'Nightly screening: no hit at the time' };

const amlCtx = (name: string, dateOfBirth: string, nationality: string, over: Partial<AmlContext> = {}): AmlContext => ({
  customer: { name, dateOfBirth, nationality, vip: false },
  watchlist: LISTS,
  cashDeposits: [],
  lookbackDays: 3,
  auditLog: [OPENED, SCREENED],
  ...over,
});

/** An outward transfer of $25,000.00 by a customer, with the screening context. */
const outward = (txId: Id, aml: AmlContext, amount = 2_500_000): BankingPayload =>
  payload({ txId, amount, channel: 'IN_APP', cardType: 'DEBIT', riskScore: 8, availableBalance: amount * 3, creditLimit: 0, aml });

const L9_TESTS: TestCase[] = [
  {
    id: 'L9-T01',
    name: 'An ordinary customer',
    description: 'No name on any list, no unusual deposits. Do not waste an investigation on this.',
    inputPayload: outward('TX-L9-001', amlCtx('Linh Tran', '1990-06-15', 'AU')),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'PAYMENT_RELEASED',
    maxLatencyMs: 120,
    requiredCapabilities: ['AML_SCREENING'],
    forbiddenCapabilities: ['CASE_INVESTIGATION'],
    tags: ['clear'],
  },
  {
    id: 'L9-T02',
    name: 'Cash deposits that are not structuring',
    description: 'Three $2,000.00 cash deposits in three days. Well under the line, and nowhere near it.',
    inputPayload: outward('TX-L9-002', amlCtx('Linh Tran', '1990-06-15', 'AU', { cashDeposits: [200_000, 200_000, 200_000] })),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'PAYMENT_RELEASED',
    maxLatencyMs: 120,
    requiredCapabilities: ['AML_SCREENING'],
    forbiddenCapabilities: ['CASE_INVESTIGATION'],
    tags: ['clear', 'deposits'],
  },
  {
    id: 'L9-T03',
    name: 'Structuring: four cash deposits just under $10,000.00',
    description: '$9,000.00, $9,400.00, $9,800.00 and $9,200.00 in three days: $37,400.00 in pieces, each below the reporting line.',
    inputPayload: outward('TX-L9-003', amlCtx('Linh Tran', '1990-06-15', 'AU', { cashDeposits: [900_000, 940_000, 980_000, 920_000] })),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'SAR_STRUCTURING',
    maxLatencyMs: 120,
    requiredCapabilities: ['AML_SCREENING'],
    forbiddenCapabilities: ['CASE_INVESTIGATION'],
    tags: ['structuring'],
  },
  {
    id: 'L9-T04',
    name: 'The VIP: a sanctions hit that is not him',
    description:
      'Dmitri Volkanoff, a long-standing VIP client and Australian citizen born in 1974, scores 90+ against the sanctioned Dmitri Volkanov (born 1962, Russia). Compliance must look at the audit log, find the passport check, and release the payment cleanly.',
    inputPayload: outward('TX-L9-004', { ...amlCtx('Dmitri Volkanoff', '1974-08-19', 'AU', { auditLog: [OPENED, kycEvent('1974-08-19', 'AU'), SCREENED] }), customer: { name: 'Dmitri Volkanoff', dateOfBirth: '1974-08-19', nationality: 'AU', vip: true } }),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'CLEARED_FALSE_POSITIVE',
    maxLatencyMs: 400,
    requiredCapabilities: ['AML_SCREENING', 'CASE_INVESTIGATION'],
    tags: ['false-positive', 'vip'],
  },
  {
    id: 'L9-T05',
    name: 'A true sanctions match',
    description: 'Same name, same date of birth, same nationality, verified from a passport.',
    inputPayload: outward('TX-L9-005', amlCtx('Dmitri Volkanov', '1962-04-11', 'RU', { auditLog: [OPENED, kycEvent('1962-04-11', 'RU')] })),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'SANCTIONS_BLOCK',
    maxLatencyMs: 400,
    requiredCapabilities: ['AML_SCREENING', 'CASE_INVESTIGATION'],
    tags: ['sanctions'],
  },
  {
    id: 'L9-T06',
    name: 'A name hit and no identity evidence',
    description: 'The audit log holds nothing a document verified. The profile alone is not proof either way, so this is escalated, not guessed.',
    inputPayload: outward('TX-L9-006', amlCtx('Dmitri Volkanov', '1980-02-02', 'AU', { auditLog: [OPENED, SCREENED] })),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'EDD_ESCALATION',
    maxLatencyMs: 400,
    requiredCapabilities: ['AML_SCREENING', 'CASE_INVESTIGATION'],
    tags: ['inconclusive'],
  },
  {
    id: 'L9-T07',
    name: 'A genuine politically exposed person',
    description: 'A PEP is not forbidden, but the bank must ask where the money comes from (enhanced due diligence).',
    inputPayload: outward('TX-L9-007', amlCtx('Helena Marques Duarte', '1958-09-30', 'PT', { auditLog: [OPENED, kycEvent('1958-09-30', 'PT')] })),
    expectedOutcome: 'CHALLENGE_REQUIRED',
    expectedReasonCode: 'EDD_SOURCE_OF_FUNDS',
    maxLatencyMs: 400,
    requiredCapabilities: ['AML_SCREENING', 'CASE_INVESTIGATION'],
    tags: ['pep'],
  },
  {
    id: 'L9-T08',
    name: 'A PEP hit that is a different person',
    inputPayload: outward('TX-L9-008', amlCtx('Helena Marquez Duarte', '1988-12-04', 'ES', { auditLog: [OPENED, kycEvent('1988-12-04', 'ES', 'ID_DOCUMENT_SCANNED')] })),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'CLEARED_FALSE_POSITIVE',
    maxLatencyMs: 400,
    requiredCapabilities: ['AML_SCREENING', 'CASE_INVESTIGATION'],
    hidden: true,
    tags: ['false-positive', 'pep'],
  },
  {
    id: 'L9-T09',
    name: 'A similar name that is not a hit',
    description: 'Scores well under the threshold. No investigation needed.',
    inputPayload: outward('TX-L9-009', amlCtx('David Volkman', '1975-05-05', 'AU', { auditLog: [OPENED, kycEvent('1975-05-05', 'AU')] })),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'PAYMENT_RELEASED',
    maxLatencyMs: 120,
    requiredCapabilities: ['AML_SCREENING'],
    forbiddenCapabilities: ['CASE_INVESTIGATION'],
    hidden: true,
    tags: ['clear', 'near-miss'],
  },
  {
    id: 'L9-T10',
    name: 'Mixed signals: the date of birth matches, the nationality does not',
    description: 'Not enough to clear him and not enough to block him.',
    inputPayload: outward('TX-L9-010', amlCtx('Dmitri Volkanov', '1962-04-11', 'DE', { auditLog: [OPENED, kycEvent('1962-04-11', 'DE')] })),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'EDD_ESCALATION',
    maxLatencyMs: 400,
    requiredCapabilities: ['AML_SCREENING', 'CASE_INVESTIGATION'],
    hidden: true,
    tags: ['inconclusive'],
  },
  {
    id: 'L9-T11',
    name: 'Only two deposits just under the line',
    inputPayload: outward('TX-L9-011', amlCtx('Linh Tran', '1990-06-15', 'AU', { cashDeposits: [900_000, 950_000, 100_000] })),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'PAYMENT_RELEASED',
    maxLatencyMs: 120,
    requiredCapabilities: ['AML_SCREENING'],
    forbiddenCapabilities: ['CASE_INVESTIGATION'],
    hidden: true,
    tags: ['deposits', 'boundary'],
  },
  {
    id: 'L9-T12',
    name: 'Deposits at or over the line are reported anyway',
    description: 'Three cash deposits of $10,000.00 or more are reported automatically. That is not structuring.',
    inputPayload: outward('TX-L9-012', amlCtx('Linh Tran', '1990-06-15', 'AU', { cashDeposits: [1_000_000, 1_200_000, 1_500_000] })),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'PAYMENT_RELEASED',
    maxLatencyMs: 120,
    requiredCapabilities: ['AML_SCREENING'],
    forbiddenCapabilities: ['CASE_INVESTIGATION'],
    hidden: true,
    tags: ['deposits', 'boundary'],
  },
];

const L9_STARTER: ProcessGraph = {
  id: 'g_l9_starter',
  name: 'Level 9 starter',
  challengeId: 'lvl_09_sanctions_storm',
  nodes: [
    makeNode(START, 'n_start', undefined, {}, { locked: true, x: 40, y: 300 }),
    lockedEnd('n_end_released', 'Payment released', 'APPROVED', 'PAYMENT_RELEASED', 1000, 20),
    lockedEnd('n_end_cleared', 'Cleared: false positive', 'APPROVED', 'CLEARED_FALSE_POSITIVE', 1000, 150),
    lockedEnd('n_end_sar', 'Report: structuring', 'ROUTED_TO_SUSPENSE', 'SAR_STRUCTURING', 1000, 280),
    lockedEnd('n_end_sanctions', 'Blocked: sanctions', 'DECLINED', 'SANCTIONS_BLOCK', 1000, 410),
    lockedEnd('n_end_edd', 'Ask: source of funds', 'CHALLENGE_REQUIRED', 'EDD_SOURCE_OF_FUNDS', 1000, 540),
    lockedEnd('n_end_escalate', 'Escalate: enhanced due diligence', 'ROUTED_TO_SUSPENSE', 'EDD_ESCALATION', 1000, 670),
  ],
  edges: [],
};

const LEVEL_9: ChallengeLevel = {
  id: 'lvl_09_sanctions_storm',
  levelNumber: 9,
  title: 'Sanctions Storm: The False-Positive VIP',
  domain: 'PAYMENTS',
  difficulty: 'ADVANCED',
  estimatedMinutes: 35,
  problemDescription: [
    'Every outward payment is screened for **anti-money-laundering (AML)** risk. Three things worry a bank: a customer who is on a **sanctions list (OFAC)**, a customer who is a **politically exposed person (PEP)**, and a customer who is **structuring**, splitting cash into deposits just under the reporting line to avoid it.',
    '',
    'Name matching is **fuzzy**. "Dmitri Volkanoff" and "Dmitri Volkanov" are different people with similar names, and the screening engine will flag them anyway. A hit is a **lead, not a verdict**. Freeze every VIP who scores a hit and you lose your best customers. Release everyone and you break the law.',
    '',
    'The **AML Screening** node writes `amlList` (`OFAC`, `PEP` or `NONE`) for a name hit and `amlStructuring` for the deposit pattern. The **Case Investigation** node opens the audit log, compares the customer\'s **verified** date of birth and nationality with the listed person, and writes `caseVerdict`.',
    '',
    '**Policy**',
    '',
    '| Finding | Result |',
    '|---|---|',
    '| A name hit (`amlList` is not `NONE`) | **Investigate** before deciding. |',
    '| Investigated, `FALSE_POSITIVE` | Release: `CLEARED_FALSE_POSITIVE` |',
    '| Investigated, `TRUE_MATCH` on a **sanctions** list | Block: `SANCTIONS_BLOCK` |',
    '| Investigated, `TRUE_MATCH` on a **PEP** list | Ask for source of funds: `EDD_SOURCE_OF_FUNDS` |',
    '| Investigated, `INCONCLUSIVE` | Escalate: `EDD_ESCALATION` |',
    '| No name hit, but **structuring** | Report: `SAR_STRUCTURING` |',
    '| No name hit, no structuring | Release: `PAYMENT_RELEASED` |',
    '',
    '**Do not investigate what is not a lead.** An investigation costs analyst time and keeps a customer waiting. Tests that send a clean customer to Case Investigation fail.',
    '',
    'The start event and all six End events are on the canvas, already configured.',
  ].join('\n'),
  learningObjectives: [
    'Tell a screening hit (a lead) from a confirmed match (a verdict)',
    'Send only real name hits to an expensive investigation',
    'Release a VIP cleanly when the evidence shows a false positive, and keep the audit trail',
    'Treat sanctions, PEP, structuring and inconclusive cases differently',
  ],
  allowedNodePalette: {
    entries: [
      { nodeDefinitionId: AML, maxCount: 1 },
      { nodeDefinitionId: CASE, maxCount: 1 },
      { nodeDefinitionId: XOR, maxCount: 3 },
    ],
    totalNodeBudget: 5,
  },
  starterGraph: L9_STARTER,
  testSuite: L9_TESTS,
  scoring: {
    passMark: 100,
    anomalyPenaltyPoints: 10,
    efficiency: { optimalNodeCount: 4, optimalAvgLatencyMs: 132, nodeCountWeight: 0.5, latencyWeight: 0.5 },
  },
  runnerConfig: STANDARD_RUNNER,
  hints: [
    'amlList is NONE when no name reached the threshold. A condition like amlList != \'NONE\' means "a name hit".',
    'Check for a name hit before you check for structuring, and send only name hits on to Case Investigation.',
    'caseVerdict has three values. After the investigation, use one decision with a branch for each, and read amlList to tell a sanctions match from a PEP match.',
    'If a clean customer fails a test, look at whether the diagram sent them through Case Investigation.',
  ],
};

const L9_REFERENCE: ProcessGraph = {
  id: 'g_ref_l9',
  name: 'Level 9 reference',
  challengeId: LEVEL_9.id,
  nodes: [
    ...L9_STARTER.nodes,
    makeNode(AML, 'n_aml'),
    makeNode(XOR, 'n_xor_hit', 'Name hit?'),
    makeNode(CASE, 'n_case', 'Investigate the audit log'),
    makeNode(XOR, 'n_xor_verdict', 'Who is it?'),
  ],
  edges: [
    makeEdge('e1', ['n_start', 'out'], ['n_aml', 'in']),
    makeEdge('e2', ['n_aml', 'out'], ['n_xor_hit', 'in_1']),
    makeEdge('e3', ['n_xor_hit', 'out_1'], ['n_case', 'in'], { when: "amlList != 'NONE'", priority: 1, label: 'name hit' }),
    makeEdge('e4', ['n_xor_hit', 'out_2'], ['n_end_sar', 'in'], { when: 'amlStructuring == true', priority: 2 }),
    makeEdge('e5', ['n_xor_hit', 'out_3'], ['n_end_released', 'in'], { isDefault: true }),
    makeEdge('e6', ['n_case', 'out'], ['n_xor_verdict', 'in_1']),
    makeEdge('e7', ['n_xor_verdict', 'out_1'], ['n_end_cleared', 'in'], { when: "caseVerdict == 'FALSE_POSITIVE'", priority: 1 }),
    makeEdge('e8', ['n_xor_verdict', 'out_2'], ['n_end_sanctions', 'in'], { when: "caseVerdict == 'TRUE_MATCH' && amlList == 'OFAC'", priority: 2 }),
    makeEdge('e9', ['n_xor_verdict', 'out_3'], ['n_end_edd', 'in'], { when: "caseVerdict == 'TRUE_MATCH' && amlList == 'PEP'", priority: 3 }),
    makeEdge('e10', ['n_xor_verdict', 'out_4'], ['n_end_escalate', 'in'], { isDefault: true }),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Level 10: Chargeback Warfare
// ─────────────────────────────────────────────────────────────────────────────

const claim = (
  txId: Id,
  d: Partial<DisputeContext>,
  riskScore: number,
  over: Partial<BankingPayload> = {},
): BankingPayload =>
  payload({
    txId,
    amount: 18_900,
    channel: 'ECOMMERCE',
    cardType: 'CREDIT',
    riskScore,
    availableBalance: 400_000,
    creditLimit: 500_000,
    dispute: { stage: 'NEW', reason: 'GOODS_NOT_RECEIVED', daysSinceTransaction: 25, merchantEvidence: 'NONE', ...d },
    ...over,
  });

const L10_TESTS: TestCase[] = [
  {
    id: 'L10-T01',
    name: 'A new claim: goods never arrived',
    description: 'Nobody has acted on it yet, so the first move is to ask the merchant for the paperwork.',
    inputPayload: claim('TX-L10-001', {}, 20),
    expectedOutcome: 'CHALLENGE_REQUIRED',
    expectedReasonCode: 'RETRIEVAL_REQUESTED',
    maxLatencyMs: 200,
    requiredCapabilities: ['CHARGEBACK_DESK'],
    tags: ['retrieval'],
  },
  {
    id: 'L10-T02',
    name: 'Retrieval request: the merchant sent nothing',
    description: 'The merchant did not produce a receipt, so the bank takes the money back with a first chargeback.',
    inputPayload: claim('TX-L10-002', { stage: 'RETRIEVAL_REQUEST', merchantEvidence: 'NONE' }, 20),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'CHARGEBACK_FILED',
    maxLatencyMs: 200,
    requiredCapabilities: ['CHARGEBACK_DESK'],
    tags: ['first-chargeback'],
  },
  {
    id: 'L10-T03',
    name: 'Retrieval request: the merchant proves delivery',
    description: 'A signed proof of delivery. The merchant wins before any chargeback is filed.',
    inputPayload: claim('TX-L10-003', { stage: 'RETRIEVAL_REQUEST', merchantEvidence: 'COMPELLING' }, 20),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'MERCHANT_WON',
    maxLatencyMs: 200,
    requiredCapabilities: ['CHARGEBACK_DESK'],
    tags: ['merchant-wins'],
  },
  {
    id: 'L10-T04',
    name: 'First chargeback: the merchant stays silent',
    description: 'No answer in time, so the cardholder wins by default and the bank is refunded by the scheme.',
    inputPayload: claim('TX-L10-004', { stage: 'FIRST_CHARGEBACK', merchantEvidence: 'NONE' }, 20),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'CARDHOLDER_REFUNDED',
    maxLatencyMs: 200,
    requiredCapabilities: ['CHARGEBACK_DESK'],
    tags: ['cardholder-wins'],
  },
  {
    id: 'L10-T05',
    name: 'First chargeback: the merchant fights back',
    description: 'A weak answer is still an answer: this is now a representment for the bank to review.',
    inputPayload: claim('TX-L10-005', { stage: 'FIRST_CHARGEBACK', merchantEvidence: 'WEAK' }, 20),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'REPRESENTMENT_REVIEW',
    maxLatencyMs: 200,
    requiredCapabilities: ['CHARGEBACK_DESK'],
    tags: ['representment'],
  },
  {
    id: 'L10-T06',
    name: 'Representment: weak evidence, escalate',
    description: 'The bank does not accept the merchant\'s answer, so it goes to pre-arbitration.',
    inputPayload: claim('TX-L10-006', { stage: 'REPRESENTMENT', merchantEvidence: 'WEAK' }, 20),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'PRE_ARB_ESCALATED',
    maxLatencyMs: 200,
    requiredCapabilities: ['CHARGEBACK_DESK'],
    tags: ['pre-arbitration'],
  },
  {
    id: 'L10-T07',
    name: 'Representment: compelling evidence, the merchant wins',
    description: 'The provisional credit is taken back from the cardholder.',
    inputPayload: claim('TX-L10-007', { stage: 'REPRESENTMENT', merchantEvidence: 'COMPELLING' }, 20),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'MERCHANT_WON',
    maxLatencyMs: 200,
    requiredCapabilities: ['CHARGEBACK_DESK'],
    tags: ['merchant-wins'],
  },
  {
    id: 'L10-T08',
    name: 'Pre-arbitration: the merchant gives up',
    inputPayload: claim('TX-L10-008', { stage: 'PRE_ARBITRATION', merchantEvidence: 'NONE' }, 20),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'CARDHOLDER_REFUNDED',
    maxLatencyMs: 200,
    requiredCapabilities: ['CHARGEBACK_DESK'],
    hidden: true,
    tags: ['cardholder-wins'],
  },
  {
    id: 'L10-T09',
    name: 'Liability shift: fraud claim on a frictionless purchase',
    description:
      'The cardholder says they never made the $189.00 purchase. But 3-D Secure authenticated it (risk 12, frictionless), so liability for fraud shifted to the issuer. The scheme will not allow a chargeback against the merchant. The bank refunds the cardholder and books the loss.',
    inputPayload: claim('TX-L10-009', { reason: 'FRAUD' }, 12),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'ISSUER_ABSORBS',
    maxLatencyMs: 200,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CHARGEBACK_DESK'],
    tags: ['liability-shift'],
  },
  {
    id: 'L10-T10',
    name: 'Liability shift: fraud claim after a completed challenge',
    description: 'Risk 55, the cardholder entered the OTP. That is authentication too.',
    inputPayload: claim('TX-L10-010', { reason: 'FRAUD' }, 55, { challenge: { status: 'COMPLETED', method: 'OTP' } }),
    expectedOutcome: 'APPROVED',
    expectedReasonCode: 'ISSUER_ABSORBS',
    maxLatencyMs: 200,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CHARGEBACK_DESK'],
    tags: ['liability-shift'],
  },
  {
    id: 'L10-T11',
    name: 'No liability shift: fraud claim on an unauthenticated purchase',
    description: 'Risk 65 and no challenge was ever done (the merchant skipped 3DS). The merchant stays liable, so the claim starts down the dispute path.',
    inputPayload: claim('TX-L10-011', { reason: 'FRAUD' }, 65, { challenge: { status: 'NOT_STARTED', method: 'OTP' } }),
    expectedOutcome: 'CHALLENGE_REQUIRED',
    expectedReasonCode: 'RETRIEVAL_REQUESTED',
    maxLatencyMs: 200,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CHARGEBACK_DESK'],
    tags: ['no-liability-shift'],
  },
  {
    id: 'L10-T12',
    name: 'Too late: 150 days after the purchase',
    inputPayload: claim('TX-L10-012', { daysSinceTransaction: 150 }, 20),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'TIME_BARRED',
    maxLatencyMs: 200,
    requiredCapabilities: ['CHARGEBACK_DESK'],
    tags: ['time-barred'],
  },
  {
    id: 'L10-T13',
    name: 'A dead claim is dead whoever would have paid',
    description: 'A fraud claim on an authenticated purchase, 200 days late. Time-barred comes before liability.',
    inputPayload: claim('TX-L10-013', { reason: 'FRAUD', daysSinceTransaction: 200 }, 12),
    expectedOutcome: 'DECLINED',
    expectedReasonCode: 'TIME_BARRED',
    maxLatencyMs: 200,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CHARGEBACK_DESK'],
    hidden: true,
    tags: ['time-barred', 'liability-shift'],
  },
  {
    id: 'L10-T14',
    name: 'A long case is still alive: representment on day 300',
    description: 'The filing window applies to bringing a claim. A case that was filed in time is not time-barred later.',
    inputPayload: claim('TX-L10-014', { stage: 'REPRESENTMENT', daysSinceTransaction: 300, merchantEvidence: 'WEAK' }, 20),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'PRE_ARB_ESCALATED',
    maxLatencyMs: 200,
    requiredCapabilities: ['CHARGEBACK_DESK'],
    hidden: true,
    tags: ['time-barred', 'boundary'],
  },
  {
    id: 'L10-T15',
    name: 'The shift is for fraud only: a duplicate charge on an authenticated purchase',
    inputPayload: claim('TX-L10-015', { reason: 'DUPLICATE_CHARGE' }, 12),
    expectedOutcome: 'CHALLENGE_REQUIRED',
    expectedReasonCode: 'RETRIEVAL_REQUESTED',
    maxLatencyMs: 200,
    requiredCapabilities: ['THREE_DS_EVALUATOR', 'CHARGEBACK_DESK'],
    hidden: true,
    tags: ['liability-shift', 'boundary'],
  },
  {
    id: 'L10-T16',
    name: 'Pre-arbitration with a weak answer stays at pre-arbitration',
    inputPayload: claim('TX-L10-016', { stage: 'PRE_ARBITRATION', merchantEvidence: 'WEAK' }, 20),
    expectedOutcome: 'ROUTED_TO_SUSPENSE',
    expectedReasonCode: 'PRE_ARB_ESCALATED',
    maxLatencyMs: 200,
    requiredCapabilities: ['CHARGEBACK_DESK'],
    hidden: true,
    tags: ['pre-arbitration'],
  },
];

const L10_STARTER: ProcessGraph = {
  id: 'g_l10_starter',
  name: 'Level 10 starter',
  challengeId: 'lvl_10_chargeback_warfare',
  nodes: [
    makeNode(START, 'n_start', undefined, {}, { locked: true, x: 40, y: 340 }),
    lockedEnd('n_end_retrieval', 'Ask the merchant for the receipt', 'CHALLENGE_REQUIRED', 'RETRIEVAL_REQUESTED', 1100, 0),
    lockedEnd('n_end_filed', 'First chargeback filed', 'ROUTED_TO_SUSPENSE', 'CHARGEBACK_FILED', 1100, 120),
    lockedEnd('n_end_represent', 'Representment under review', 'ROUTED_TO_SUSPENSE', 'REPRESENTMENT_REVIEW', 1100, 240),
    lockedEnd('n_end_prearb', 'Escalated to pre-arbitration', 'ROUTED_TO_SUSPENSE', 'PRE_ARB_ESCALATED', 1100, 360),
    lockedEnd('n_end_refunded', 'Cardholder refunded', 'APPROVED', 'CARDHOLDER_REFUNDED', 1100, 480),
    lockedEnd('n_end_absorbed', 'Issuer absorbs the loss', 'APPROVED', 'ISSUER_ABSORBS', 1100, 600),
    lockedEnd('n_end_merchant', 'Merchant won', 'DECLINED', 'MERCHANT_WON', 1100, 720),
    lockedEnd('n_end_barred', 'Time-barred', 'DECLINED', 'TIME_BARRED', 1100, 840),
  ],
  edges: [],
};

const LEVEL_10: ChallengeLevel = {
  id: 'lvl_10_chargeback_warfare',
  levelNumber: 10,
  title: 'Chargeback Warfare',
  domain: 'PAYMENTS',
  difficulty: 'ADVANCED',
  estimatedMinutes: 40,
  problemDescription: [
    'A cardholder disputes a purchase. The card schemes run disputes as a **four-stage cycle**:',
    '',
    '1. **RETRIEVAL_REQUEST**: "show me the receipt." The bank asks the merchant for the paperwork.',
    '2. **FIRST_CHARGEBACK**: "I am taking the money back." The cardholder is credited at once.',
    '3. **REPRESENTMENT**: the merchant fights back with evidence.',
    '4. **PRE_ARBITRATION**: the bank does not accept the answer and escalates before the scheme has to rule.',
    '',
    'And one rule decides who pays. If the purchase was **authenticated with 3-D Secure**, the **liability for fraud shifted to the issuer**: the merchant did everything the scheme asks, so the scheme will not allow a fraud chargeback against it. The **bank refunds the cardholder and absorbs the loss**.',
    '',
    'The **Dispute & Chargeback Desk** knows the stages and the filing window. It does **not** know whether the purchase was authenticated unless the **3DS Risk Evaluator** has run first (it reads `authenticated`). Run the 3DS evaluator on the original purchase, then the desk.',
    '',
    'The desk writes `disputeWindow`, `disputeLiability` and `disputeNext`. Route on them:',
    '',
    '| Finding | End event |',
    '|---|---|',
    '| `disputeWindow` is `EXPIRED` | Time-barred |',
    '| `disputeLiability` is `ISSUER` | Issuer absorbs the loss |',
    '| `disputeNext` is `RETRIEVAL_REQUEST` | Ask the merchant for the receipt |',
    '| `FIRST_CHARGEBACK` | First chargeback filed |',
    '| `REPRESENTMENT` | Representment under review |',
    '| `PRE_ARBITRATION` | Escalated to pre-arbitration |',
    '| `RESOLVED_CARDHOLDER` | Cardholder refunded |',
    '| `RESOLVED_MERCHANT` | Merchant won |',
    '',
    'A claim that is out of time is dead **whoever** would have paid, so check the window before the liability. The start event and all eight End events are on the canvas.',
  ].join('\n'),
  learningObjectives: [
    'Walk a dispute through RETRIEVAL_REQUEST, FIRST_CHARGEBACK, REPRESENTMENT and PRE_ARBITRATION',
    'Explain why 3-D Secure authentication moves the liability for fraud to the issuer',
    'Run one capability so that another can read what it wrote (3DS before the dispute desk)',
    'Chain decisions to cover more branches than one gateway has ports',
  ],
  allowedNodePalette: {
    entries: [
      { nodeDefinitionId: THREE_DS, maxCount: 1 },
      { nodeDefinitionId: CHARGEBACK, maxCount: 1 },
      { nodeDefinitionId: XOR, maxCount: 4 },
    ],
    totalNodeBudget: 6,
  },
  starterGraph: L10_STARTER,
  testSuite: L10_TESTS,
  scoring: {
    passMark: 100,
    anomalyPenaltyPoints: 10,
    efficiency: { optimalNodeCount: 5, optimalAvgLatencyMs: 128, nodeCountWeight: 0.5, latencyWeight: 0.5 },
  },
  runnerConfig: STANDARD_RUNNER,
  hints: [
    'The desk needs authenticated. Put the 3DS Risk Evaluator before it, even though this is a dispute and not a purchase.',
    'A decision has four output ports and you have eight results. Chain decisions: the default edge of one leads to the next.',
    'Check the filing window first, then the liability, then disputeNext.',
    'If a fraud claim on an authenticated purchase goes down the chargeback path, the desk could not see the authentication. Check the wiring order.',
  ],
};

const L10_REFERENCE: ProcessGraph = {
  id: 'g_ref_l10',
  name: 'Level 10 reference',
  challengeId: LEVEL_10.id,
  nodes: [
    ...L10_STARTER.nodes,
    makeNode(THREE_DS, 'n_3ds', '3DS: was it authenticated?'),
    makeNode(CHARGEBACK, 'n_desk'),
    makeNode(XOR, 'n_xor_gate', 'Can it proceed?'),
    makeNode(XOR, 'n_xor_stage', 'Which stage?'),
    makeNode(XOR, 'n_xor_result', 'Who wins?'),
  ],
  edges: [
    makeEdge('e1', ['n_start', 'out'], ['n_3ds', 'in']),
    makeEdge('e2', ['n_3ds', 'out'], ['n_desk', 'in']),
    makeEdge('e3', ['n_desk', 'out'], ['n_xor_gate', 'in_1']),
    makeEdge('e4', ['n_xor_gate', 'out_1'], ['n_end_barred', 'in'], { when: "disputeWindow == 'EXPIRED'", priority: 1 }),
    makeEdge('e5', ['n_xor_gate', 'out_2'], ['n_end_absorbed', 'in'], { when: "disputeLiability == 'ISSUER'", priority: 2 }),
    makeEdge('e6', ['n_xor_gate', 'out_3'], ['n_xor_stage', 'in_1'], { isDefault: true }),
    makeEdge('e7', ['n_xor_stage', 'out_1'], ['n_end_retrieval', 'in'], { when: "disputeNext == 'RETRIEVAL_REQUEST'", priority: 1 }),
    makeEdge('e8', ['n_xor_stage', 'out_2'], ['n_end_filed', 'in'], { when: "disputeNext == 'FIRST_CHARGEBACK'", priority: 2 }),
    makeEdge('e9', ['n_xor_stage', 'out_3'], ['n_end_represent', 'in'], { when: "disputeNext == 'REPRESENTMENT'", priority: 3 }),
    makeEdge('e10', ['n_xor_stage', 'out_4'], ['n_xor_result', 'in_1'], { isDefault: true }),
    makeEdge('e11', ['n_xor_result', 'out_1'], ['n_end_prearb', 'in'], { when: "disputeNext == 'PRE_ARBITRATION'", priority: 1 }),
    makeEdge('e12', ['n_xor_result', 'out_2'], ['n_end_refunded', 'in'], { when: "disputeNext == 'RESOLVED_CARDHOLDER'", priority: 2 }),
    makeEdge('e13', ['n_xor_result', 'out_3'], ['n_end_merchant', 'in'], { isDefault: true }),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export const ACADEMY_LEVELS: ChallengeLevel[] = [LEVEL_5, LEVEL_6, LEVEL_7, LEVEL_8, LEVEL_9, LEVEL_10];

/** Server-side only. */
export const ACADEMY_REFERENCES: ReferenceSolution[] = [
  {
    challengeId: LEVEL_5.id,
    graph: L5_REFERENCE,
    notes: 'Ledger check, then one XOR: SUFFICIENT goes to Approved, the default goes to Declined with the reason code INSUFFICIENT_FUNDS.',
  },
  {
    challengeId: LEVEL_6.id,
    graph: L6_REFERENCE,
    notes:
      'The burst rule is the first thing the diagram does: recentAttempts and amount are payload fields, so no node is needed to read them and no 3DS call is spent on a bot. Then 3DS, a route XOR where the low-value exemption sends a small challenge-band payment to the same ledger check as an authenticated one, and a funds XOR.',
  },
  {
    challengeId: LEVEL_7.id,
    graph: L7_REFERENCE,
    notes:
      'Gateway with the instant limit set to $25,000.00, then a checks XOR in the order invalid, liquidity, congestion-for-ordinary-payments, and a rail XOR. Priority needs no extra node: the gateway already lets payroll past the queue and into the reserve, so the same facts route it.',
  },
  {
    challengeId: LEVEL_8.id,
    graph: L8_REFERENCE,
    notes: 'Recon desk with a 2c tolerance. One XOR on reconStatus; its default (an amount break) leads to a second XOR on reconCause and fxDirection: FX loss, FX gain, or unexplained variance.',
  },
  {
    challengeId: LEVEL_9.id,
    graph: L9_REFERENCE,
    notes:
      'AML screening, then a XOR that sends only name hits to Case Investigation (structuring to a report, everything else released). After the investigation a second XOR reads caseVerdict, with amlList to tell a sanctions match from a PEP match; the default is escalation.',
  },
  {
    challengeId: LEVEL_10.id,
    graph: L10_REFERENCE,
    notes:
      '3DS first, so the desk can see authentication. Three XORs chain eight results: the window and the liability first (a dead claim is dead whoever would have paid), then the stage, then the result.',
  },
];
