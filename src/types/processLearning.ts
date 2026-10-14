/**
 * ProcessCraft Banking: metamodel (data layer only, no UI, no engine logic).
 *
 * Sections
 *   0. Shared primitives
 *   1. Process Graph        (what the learner builds)
 *   2. Node catalog         (what the learner builds it from)
 *   3. Execution & tokens   (what the simulator moves through the graph)
 *   4. Learning & challenge (levels, test cases, grading)
 *
 * Conventions
 *   - Money is always integer minor units (cents, AUD). Never floats.
 *   - Time is epoch milliseconds. Simulated latency is virtual milliseconds.
 *   - Every entity is plain JSON (no classes, no Dates, no Maps) so it can be
 *     stored, diffed, and sent to a server-side grader unchanged.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 0. Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

export type Id = string;
export type MinorUnits = number;
export type EpochMs = number;
export type ConfigValue = string | number | boolean;

export type CardType = 'DEBIT' | 'CREDIT' | 'PREPAID' | 'VIRTUAL_DPAN';
/** The account type that actually pays for a transaction (a DPAN resolves to one of these). */
export type FundingSource = Exclude<CardType, 'VIRTUAL_DPAN'>;
export type PaymentChannel = 'POS' | 'ECOMMERCE' | 'MOBILE_WALLET' | 'IN_APP' | 'ATM';

/** The only four ways a test run can end. Each EVENT_END node is configured with one. */
export type Outcome = 'APPROVED' | 'DECLINED' | 'ROUTED_TO_SUSPENSE' | 'CHALLENGE_REQUIRED';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Process Graph (what the learner builds)
// ─────────────────────────────────────────────────────────────────────────────

export type NodeType = 'EVENT_START' | 'TASK' | 'GATEWAY_XOR' | 'GATEWAY_AND' | 'EVENT_END';

/** Which banking function a TASK node performs. Null for events and gateways. */
export type BankingCapability =
  | 'DCVV_VERIFIER'
  | 'TOKEN_VAULT'
  | 'THREE_DS_EVALUATOR'
  | 'CORE_LEDGER_CHECK'
  | 'RECON_DESK'
  | 'BNPL_UNDERWRITER'
  | 'A2A_GATEWAY'
  | 'AML_SCREENING'
  | 'CASE_INVESTIGATION'
  | 'CHARGEBACK_DESK';

export type PortDirection = 'IN' | 'OUT';
/** FLOW ports carry the normal path. ERROR ports catch technical exceptions (BPMN boundary error). */
export type PortRole = 'FLOW' | 'ERROR';

export interface Port {
  /** Unique within its node, e.g. "in", "out", "error", "out_2". */
  id: Id;
  label: string;
  direction: PortDirection;
  role: PortRole;
  /** How many edges may attach to this port. OUT ports are normally 1, IN ports may merge several. */
  maxEdges: number;
}

export interface ProcessNode {
  id: Id;
  /** Which catalog entry this node was spawned from (used for palette budget counting). */
  definitionId: Id;
  type: NodeType;
  label: string;
  /** Non-null only when type === 'TASK'. */
  bankingCapability: BankingCapability | null;
  inputPorts: Port[];
  outputPorts: Port[];
  /** Learner-editable settings, validated against NodeDefinition.configSchema. */
  configParams: Record<string, ConfigValue>;
  /** Canvas position. Layout only; never read by the simulator. */
  position?: { x: number; y: number };
  /** Starter-graph nodes the learner may not delete. They do not count against the palette budget. */
  locked?: boolean;
}

/**
 * Condition grammar (evaluated against ExpressionContext, see section 3):
 *   expr    := or
 *   or      := and ('||' and)*
 *   and     := cmp ('&&' cmp)*
 *   cmp     := unary (('==' | '!=' | '<' | '<=' | '>' | '>=') unary)?
 *   unary   := '!' unary | primary
 *   primary := number | 'string' | true | false | identifier | '(' expr ')'
 * Examples: "riskScore < 40", "isVirtual == true", "dcvvStatus == 'VALID' && riskScore < 80"
 */
export interface ProcessEdge {
  id: Id;
  sourceNodeId: Id;
  sourcePortId: Id;
  targetNodeId: Id;
  targetPortId: Id;
  /**
   * Only evaluated when the source node is a GATEWAY_XOR; edges leaving any other node type are always taken.
   * At an XOR, edges are tried in priority order. An edge matches when its condition is true, or when it has
   * no condition and is not the default edge (so a lone unconditional edge simply passes the token through).
   * The default edge is used only when nothing else matched.
   */
  conditionExpression?: string;
  /** XOR fallback: taken when no conditional edge matches. At most one per gateway. */
  isDefault?: boolean;
  /** XOR evaluation order, ascending. Ties are broken by edge id. */
  priority?: number;
  label?: string;
}

export interface ProcessGraph {
  id: Id;
  name: string;
  /** Set when the graph is a learner's attempt at a specific level. */
  challengeId?: Id;
  nodes: ProcessNode[];
  edges: ProcessEdge[];
  /** ISO 8601. */
  updatedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Node catalog (the palette's building blocks)
// ─────────────────────────────────────────────────────────────────────────────

export type ConfigParamType = 'number' | 'string' | 'boolean' | 'enum';

export interface ConfigParamDef {
  key: string;
  label: string;
  type: ConfigParamType;
  defaultValue: ConfigValue;
  description: string;
  required?: boolean;
  /** number params */
  min?: number;
  max?: number;
  /** enum params */
  options?: string[];
}

export type TokenExceptionCode =
  | 'TOKEN_NOT_FOUND'
  | 'NO_MATCHING_BRANCH'
  | 'INVALID_EXPRESSION'
  | 'INVALID_CONFIG'
  | 'STEP_LIMIT_EXCEEDED'
  | 'DEAD_END';

export interface PortPolicy {
  minIn: number;
  maxIn: number;
  minOut: number;
  maxOut: number;
}

export interface NodeDefinition {
  id: Id;
  type: NodeType;
  bankingCapability: BankingCapability | null;
  label: string;
  /** Learner-facing explanation shown in the palette. */
  description: string;
  /** Port templates copied onto each placed node. Unconnected ports are ignored by the simulator. */
  inputPorts: Port[];
  outputPorts: Port[];
  portPolicy: PortPolicy;
  configSchema: ConfigParamDef[];
  /** Virtual time this node costs. Parallel branches cost max(), not sum(). */
  baseLatencyMs: number;
  /** Fact names (payload or derived) the node reads. Documentation for learners and the validator. */
  readsFacts: string[];
  /** Derived fact names the node writes. These become usable in edge conditions downstream. */
  writesFacts: string[];
  /** Technical exceptions this node can raise. They leave through its ERROR port if wired. */
  raises: TokenExceptionCode[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Execution & token engine
// ─────────────────────────────────────────────────────────────────────────────

export type ChallengeStatus = 'NOT_STARTED' | 'COMPLETED' | 'FAILED' | 'ABANDONED' | 'TIMED_OUT';

/** What the token vault would return for a DPAN. Null on VirtualCardContext means "no mapping". */
export interface TokenVaultEntry {
  fpanLast4: string;
  status: 'ACTIVE' | 'SUSPENDED';
  fundingSource: FundingSource;
  /** The dynamic CVV the vault expects for the current rotation. */
  expectedDcvv: string;
  /** When the current dCVV was generated. Age = clientTimestamp - dcvvIssuedAt. */
  dcvvIssuedAt: EpochMs;
}

export interface VirtualCardContext {
  dpan: string;
  vaultEntry: TokenVaultEntry | null;
}

export interface ThreeDsContext {
  status: ChallengeStatus;
  method: 'OTP' | 'BIOMETRIC';
}

/** The three legs of an end-of-day reconciliation. Null means the leg is absent. */
export interface SettlementContext {
  /** Core ledger posting. */
  ledgerAmount: MinorUnits | null;
  /** Card-scheme clearing file. */
  clearingAmount: MinorUnits | null;
  /** Acquirer / switch settlement report. */
  switchAmount: MinorUnits | null;
  /** How many times the clearing file presented this transaction (normally 1). */
  clearingPresentments: number;
  /**
   * Set when the purchase was made in a foreign currency. The ledger booked the purchase at one exchange rate and the
   * scheme settled it at another, so a gap between the legs may be a rate difference rather than an error.
   */
  fx?: FxContext;
}

/**
 * Rates are integers (micro-AUD per one unit of the foreign currency), so no float ever touches money:
 * 1_534_800 means 1 USD = 1.5348 AUD.
 */
export interface FxContext {
  /** ISO 4217, e.g. 'USD'. */
  currency: string;
  /** The purchase in the foreign currency's minor units. */
  foreignAmountMinor: MinorUnits;
  /** Rate the core ledger used when it booked the authorisation. */
  bookedRateMicro: number;
  /** Rate the scheme used when it settled. */
  settledRateMicro: number;
}

export interface BnplContext {
  /** 0 to 1000. */
  underwritingScore: number;
  downPaymentMinor: MinorUnits;
}

/**
 * The ISO 20022 pacs.008 (FIToFICustomerCreditTransfer) fields an account-to-account payment arrives with, plus the state
 * of the gateway at the moment it arrives. The instructed amount is the payload's own `amount`.
 */
export interface A2aContext {
  /** EndToEndId: the reference the debtor gave the payment; it survives every hop. 1 to 35 characters. */
  endToEndId: string;
  /** DebtorAgent: BIC of the sending bank. */
  debtorAgent: string;
  /** CreditorAgent: BIC of the receiving bank. */
  creditorAgent: string;
  /** InterbankSettlementAmount in minor units. Must equal the instructed amount. */
  interbankSettlementAmount: MinorUnits;
  /** ISO 4217 currency of the settlement amount. */
  currency: string;
  /** ISO 20022 external purpose code: SALA (salary / payroll), SUPP (supplier), TAXS (tax), OTHR (other). */
  purposeCode: 'SALA' | 'SUPP' | 'TAXS' | 'OTHR';
  /** Messages already waiting at the gateway. */
  queueDepth: number;
  /** Intraday liquidity left in the settlement account, in minor units. */
  liquidityAvailableMinor: MinorUnits;
}

export type WatchlistKind = 'OFAC' | 'PEP';

/** A person on a sanctions list (OFAC) or a list of politically exposed persons (PEP), as the list publishes them. */
export interface WatchlistEntry {
  list: WatchlistKind;
  name: string;
  /** ISO date, YYYY-MM-DD. */
  dateOfBirth: string;
  /** ISO 3166 alpha-2. */
  country: string;
}

export type AuditEventKind =
  | 'ACCOUNT_OPENED'
  | 'KYC_VERIFIED'
  | 'ID_DOCUMENT_SCANNED'
  | 'ADDRESS_VERIFIED'
  | 'SCREENING_RUN'
  | 'RISK_REVIEW';

/** One line of the customer's audit log. Identity events carry the date of birth and nationality they verified. */
export interface AuditEvent {
  at: EpochMs;
  kind: AuditEventKind;
  detail: string;
  dateOfBirth?: string;
  nationality?: string;
}

export interface CustomerProfile {
  name: string;
  /** ISO date. */
  dateOfBirth: string;
  /** ISO 3166 alpha-2. */
  nationality: string;
  vip: boolean;
}

export interface AmlContext {
  customer: CustomerProfile;
  /** The shortlist the name-matching engine compares the customer against. */
  watchlist: WatchlistEntry[];
  /** Amounts of the customer's recent cash deposits, one per deposit, in minor units. */
  cashDeposits: MinorUnits[];
  /** How many days those deposits span. */
  lookbackDays: number;
  /** What the bank has on file about the customer. */
  auditLog: AuditEvent[];
}

export type DisputeReason = 'FRAUD' | 'GOODS_NOT_RECEIVED' | 'DUPLICATE_CHARGE';

/** The four stages of the card-scheme dispute cycle, in order. NEW is a claim nobody has acted on yet. */
export type DisputeStage = 'RETRIEVAL_REQUEST' | 'FIRST_CHARGEBACK' | 'REPRESENTMENT' | 'PRE_ARBITRATION';

/** How strong the merchant's answer to the current stage is. */
export type MerchantEvidence = 'NONE' | 'WEAK' | 'COMPELLING';

export interface DisputeContext {
  stage: DisputeStage | 'NEW';
  reason: DisputeReason;
  /** Days between the original purchase and today. */
  daysSinceTransaction: number;
  merchantEvidence: MerchantEvidence;
}

/** What the dispute desk says should happen next. NONE means the scheme allows no action. */
export type DisputeNext = DisputeStage | 'RESOLVED_CARDHOLDER' | 'RESOLVED_MERCHANT' | 'NONE';

/**
 * The transaction a token carries. The first ten fields are the core spec.
 * The four optional context blocks hold the extra world state a capability
 * node needs (vault lookup, 3DS challenge result, settlement legs, BNPL
 * application). Edge conditions can only read the flat core fields and
 * DerivedFacts, never these blocks.
 */
export interface BankingPayload {
  txId: Id;
  /** Minor units. */
  amount: MinorUnits;
  channel: PaymentChannel;
  cardType: CardType;
  /** What the cardholder typed. Sensitive: edge conditions may not read it. */
  rawCvv: string;
  clientTimestamp: EpochMs;
  /** 0 to 100, higher is riskier. */
  riskScore: number;
  /** Ground-truth label used for grading. Not observable by the bank, so edge conditions may not read it. */
  isFraud: boolean;
  /** Spendable funds in minor units: DDA balance, prepaid stored value, or open-to-buy on credit. */
  availableBalance: MinorUnits;
  /** Total revolving limit. Zero for non-credit cards. */
  creditLimit: MinorUnits;
  /** Payment attempts on this card in the last 10 minutes, this one included. Absent means unknown. */
  recentAttempts?: number;

  virtualCard?: VirtualCardContext;
  challenge?: ThreeDsContext;
  settlement?: SettlementContext;
  bnpl?: BnplContext;
  a2a?: A2aContext;
  aml?: AmlContext;
  dispute?: DisputeContext;
}

/** Facts written by capability nodes as the token moves. All optional until some node produces them. */
export interface DerivedFacts {
  /** Built in. Set when the token is created: cardType === 'VIRTUAL_DPAN'. */
  isVirtual?: boolean;
  tokenStatus?: 'RESOLVED' | 'SUSPENDED' | 'NOT_APPLICABLE';
  fundingSource?: FundingSource;
  /** Last four digits of the real card number (FPAN) a DPAN maps to. Never the full number. */
  fpanLast4?: string;
  dcvvStatus?: 'VALID' | 'EXPIRED' | 'MISMATCH' | 'NOT_APPLICABLE';
  threeDsPath?: 'FRICTIONLESS' | 'CHALLENGE' | 'CHALLENGE_PASSED' | 'CHALLENGE_FAILED' | 'REJECT';
  /** True for FRICTIONLESS or CHALLENGE_PASSED. */
  authenticated?: boolean;
  /** ISSUER when the cardholder was authenticated (liability shifts to the issuer), otherwise MERCHANT. */
  liabilityShift?: 'ISSUER' | 'MERCHANT';
  ledgerDecision?: 'SUFFICIENT' | 'INSUFFICIENT_FUNDS' | 'OVER_LIMIT';
  /** Amount held on the funding account. Set only when the ledger check is SUFFICIENT. */
  authHoldMinor?: MinorUnits;
  reconStatus?: 'MATCHED' | 'BREAK_AMOUNT' | 'BREAK_MISSING_LEG' | 'BREAK_DUPLICATE';
  /** max leg minus min leg, in minor units. */
  reconVarianceMinor?: MinorUnits;
  underwritingScore?: number;
  downPaymentPct?: number;
  bnplDecision?: 'ELIGIBLE' | 'INELIGIBLE';
  /** Pay-in-4 first instalment collected at checkout (the down payment). Set only when ELIGIBLE. */
  installment1Minor?: MinorUnits;
  /** Each of the three remaining instalments. Set only when ELIGIBLE. */
  installmentAmountMinor?: MinorUnits;

  /** Set only when a gap between the legs is classified: FX_RATE when the exchange-rate difference explains it. */
  reconCause?: 'FX_RATE' | 'UNEXPLAINED';
  /** Which way an FX difference went for the bank: LOSS when the scheme settled for more than was booked. */
  fxDirection?: 'GAIN' | 'LOSS';

  /** True when the pacs.008 message passes every format check. */
  a2aValid?: boolean;
  a2aRail?: 'INSTANT' | 'RTGS';
  a2aPriority?: 'PRIORITY' | 'NORMAL';
  a2aQueue?: 'OPEN' | 'CONGESTED';
  a2aLiquidity?: 'SUFFICIENT' | 'SHORTFALL';

  /** The sidewalk ATM. PIN: verified, or locked after three wrong tries. Dispense: notes out, jammed after the debit, or refused. */
  atmPin?: 'VERIFIED' | 'LOCKED';
  atmDispense?: 'DISPENSED' | 'JAMMED' | 'REFUSED' | 'DEPOSITED';

  amlStatus?: 'CLEAR' | 'STRUCTURING' | 'PEP_HIT' | 'SANCTION_HIT';
  /** Best name-match score against the watchlists, 0 to 100. */
  amlMatchScore?: number;
  /** The list the best match is on, when it reached the threshold. */
  amlList?: 'NONE' | 'OFAC' | 'PEP';
  amlStructuring?: boolean;
  caseVerdict?: 'FALSE_POSITIVE' | 'TRUE_MATCH' | 'INCONCLUSIVE';
  /** Identity checks in the audit log that could be compared with the listed person. */
  caseEvidenceCount?: number;

  disputeWindow?: 'OPEN' | 'EXPIRED';
  disputeLiability?: 'ISSUER' | 'MERCHANT';
  disputeNext?: DisputeNext;
}

/** Everything an edge condition can see: flat payload fields plus derived facts. */
export type ExpressionContext = Omit<
  BankingPayload,
  'virtualCard' | 'challenge' | 'settlement' | 'bnpl' | 'a2a' | 'aml' | 'dispute'
> &
  DerivedFacts;

/** Describes one name usable in conditions. Drives editor autocomplete and the expression validator. */
export interface ConditionVariable {
  name: string;
  type: 'number' | 'string' | 'boolean';
  source: 'PAYLOAD' | 'DERIVED';
  /** The capability that must run before this fact exists. Null for payload fields and built-ins. */
  producedBy: BankingCapability | null;
  allowedValues?: string[];
  /** False means the validator rejects it (PCI data, or the fraud ground-truth label). */
  learnerVisible: boolean;
  description: string;
}

export type TokenState = 'ACTIVE' | 'WAITING_JOIN' | 'COMPLETED' | 'DEADLOCKED' | 'EXCEPTION';

export interface TokenException {
  code: TokenExceptionCode;
  nodeId: Id;
  message: string;
}

/** One hop in a token's journey. */
export interface ExecutionStep {
  seq: number;
  nodeId: Id;
  capability: BankingCapability | null;
  /** The edge the token arrived by. Null at the start event. */
  viaEdgeId: Id | null;
  /** Token's virtual clock when it entered the node. */
  enteredAtMs: number;
  durationMs: number;
  factsWritten: Partial<DerivedFacts>;
  note?: string;
}

/**
 * A token is one unit of work moving through the graph. An AND fork retires the
 * parent (state COMPLETED, finalOutcome null) and spawns one child per branch
 * (parentTokenId set); an AND join waits for all siblings, then continues as
 * one token whose clock is the max of its branches.
 *
 * Location: currentNodeId is the node the token is at (about to run it, waiting
 * at it, or finished at it). currentEdgeId is the edge it last travelled along,
 * and is null before its first move.
 */
export interface SimulationToken {
  id: Id;
  parentTokenId: Id | null;
  /** Shared by tokens produced by the same AND fork, so the join knows who to wait for. */
  joinGroupId: Id | null;
  currentEdgeId: Id | null;
  currentNodeId: Id | null;
  state: TokenState;
  payload: BankingPayload;
  derived: DerivedFacts;
  executionPathHistory: ExecutionStep[];
  /** Virtual clock: sum of node latencies along this token's critical path. */
  elapsedMs: number;
  exception: TokenException | null;
  /** Set when the token reaches an EVENT_END. */
  finalOutcome: Outcome | null;
  finalReasonCode: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Learning & challenge system
// ─────────────────────────────────────────────────────────────────────────────

export type ChallengeDomain = 'PAYMENTS';
export type Difficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface PaletteEntry {
  nodeDefinitionId: Id;
  /** Max copies the learner may place. Null means unlimited. */
  maxCount: number | null;
}

export interface NodePalette {
  entries: PaletteEntry[];
  /** Cap on learner-placed nodes. Locked starter nodes are not counted. Null means no cap. */
  totalNodeBudget: number | null;
}

export interface TestCase {
  id: Id;
  name: string;
  description?: string;
  inputPayload: BankingPayload;
  expectedOutcome: Outcome;
  /** Must match the EVENT_END node's reasonCode when set. Used for suspense-queue routing. */
  expectedReasonCode?: string;
  /** Pass only if the token's elapsedMs is at most this (virtual ms). */
  maxLatencyMs: number;
  /** The token's path must include all of these capabilities. */
  requiredCapabilities?: BankingCapability[];
  /** The token's path must include none of these capabilities. */
  forbiddenCapabilities?: BankingCapability[];
  /** Relative weight in correctnessScore. Defaults to 1. */
  weight?: number;
  /** Hidden tests show only their name until run, which discourages hard-coding the visible cases. */
  hidden?: boolean;
  tags?: string[];
}

export interface RunnerConfig {
  /** A token that takes more hops than this is flagged as an infinite loop. */
  maxStepsPerToken: number;
  maxTokensPerTest: number;
  /**
   * When parallel branches end with different outcomes, the one listed first wins
   * (most restrictive first).
   */
  outcomePrecedence: Outcome[];
}

/**
 * correctnessScore = round(100 * sum(weight of passed tests) / sum(weight of all tests))
 *                    minus anomalyPenaltyPoints per distinct ERROR anomaly, clamped to 0..100.
 *                    "Distinct" means one per (type, node, edge): the same bug hit by six tests costs once.
 * efficiencyScore  = round(100 * (nodeCountWeight * min(1, optimalNodeCount / nodesUsed)
 *                                + latencyWeight  * min(1, optimalAvgLatencyMs / avgLatencyMs)))
 *                    avgLatencyMs is the mean over passing tests. Scored only once the level is passed,
 *                    otherwise 0, so a broken one-node diagram cannot look efficient.
 * The level is passed when correctnessScore >= passMark.
 */
export interface ScoringConfig {
  passMark: number;
  anomalyPenaltyPoints: number;
  efficiency: {
    /** Learner-placed nodes in the reference solution. */
    optimalNodeCount: number;
    optimalAvgLatencyMs: number;
    nodeCountWeight: number;
    latencyWeight: number;
  };
}

export interface ChallengeLevel {
  id: Id;
  levelNumber: number;
  title: string;
  domain: ChallengeDomain;
  difficulty: Difficulty;
  estimatedMinutes: number;
  /** Markdown. */
  problemDescription: string;
  learningObjectives: string[];
  allowedNodePalette: NodePalette;
  starterGraph?: ProcessGraph;
  testSuite: TestCase[];
  scoring: ScoringConfig;
  runnerConfig: RunnerConfig;
  hints?: string[];
}

/** Authoring and server-side only. Used to validate test suites and set efficiency baselines. Never ship to the client. */
export interface ReferenceSolution {
  challengeId: Id;
  graph: ProcessGraph;
  notes: string;
}

export type AnomalyType =
  | 'DEADLOCK'
  | 'INFINITE_LOOP'
  | 'UNHANDLED_EXCEPTION'
  | 'NO_MATCHING_BRANCH'
  | 'DEAD_END'
  | 'UNREACHABLE_NODE'
  | 'MISSING_START_EVENT'
  | 'INVALID_EXPRESSION'
  | 'INVALID_CONFIG'
  | 'INVALID_STRUCTURE'
  | 'PALETTE_VIOLATION'
  | 'FRAUD_LEAKAGE';

export interface DetectedAnomaly {
  type: AnomalyType;
  /** ERROR anomalies cost correctness points. WARNING anomalies are reported only. */
  severity: 'ERROR' | 'WARNING';
  nodeId?: Id;
  edgeId?: Id;
  testCaseId?: Id;
  message: string;
}

export interface FeedbackLog {
  level: 'INFO' | 'HINT' | 'WARN' | 'ERROR';
  message: string;
  testCaseId?: Id;
  nodeId?: Id;
}

export type TestFailureReason =
  | 'WRONG_OUTCOME'
  | 'WRONG_REASON_CODE'
  | 'LATENCY_EXCEEDED'
  | 'MISSING_REQUIRED_CAPABILITY'
  | 'FORBIDDEN_CAPABILITY_VISITED'
  | 'DEADLOCK'
  | 'EXCEPTION';

export interface TestCaseResult {
  testCaseId: Id;
  passed: boolean;
  expectedOutcome: Outcome;
  /** NO_OUTCOME when no token reached an end event. */
  actualOutcome: Outcome | 'NO_OUTCOME';
  actualReasonCode: string | null;
  latencyMs: number;
  failureReasons: TestFailureReason[];
  /**
   * Final state of every token the run produced, including full path history, for replay in the UI.
   * Empty for hidden tests (a trace carries the payload) unless the grader was asked to reveal them.
   */
  tokens: SimulationToken[];
}

export interface EvaluationResult {
  id: Id;
  challengeId: Id;
  graphId: Id;
  /** ISO 8601. */
  evaluatedAt: string;
  passed: boolean;
  passCount: number;
  failCount: number;
  /** 0 to 100. */
  correctnessScore: number;
  /** 0 to 100. */
  efficiencyScore: number;
  detectedAnomalies: DetectedAnomaly[];
  feedbackLogs: FeedbackLog[];
  testResults: TestCaseResult[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Core banking: the general ledger
// ─────────────────────────────────────────────────────────────────────────────

export type AccountType = 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE';

/** The chart of accounts. The descriptions and normal sides live in src/engine/ledger.ts. */
export type AccountId =
  | 'CUST_CASA'
  | 'CUST_CASA_HOLD'
  | 'CUST_CREDIT_HOLD'
  | 'CUST_PREPAID_HOLD'
  | 'CARD_RECEIVABLE'
  | 'PREPAID_WALLET'
  | 'CARD_CLEARING_PAYABLE'
  | 'SCHEME_NOSTRO'
  | 'RECON_SUSPENSE'
  | 'FX_GAIN_SUSPENSE'
  | 'FX_LOSS_SUSPENSE'
  | 'BNPL_RECEIVABLE'
  | 'A2A_INSTANT_SETTLEMENT'
  | 'A2A_RTGS_SETTLEMENT'
  | 'A2A_QUEUE_PAYABLE'
  | 'ATM_CASH'
  | 'AML_RESTRAINED_FUNDS'
  | 'OUTWARD_PAYMENTS_CLEARING'
  | 'DISPUTE_RECEIVABLE'
  | 'FRAUD_LOSS_EXPENSE';

/** Why an entry was posted. Lets the ledger drawer group and explain entries. */
export type PostingKind =
  | 'AUTH_HOLD'
  | 'HOLD_RELEASE'
  | 'BNPL_FINANCING'
  | 'CAPTURE'
  | 'SETTLEMENT'
  | 'SUSPENSE_BREAK'
  | 'FX_VARIANCE'
  | 'SUSPENSE_CLEARED'
  | 'A2A_PAYMENT'
  | 'A2A_QUEUED'
  | 'PAYMENT_EXECUTED'
  | 'AML_RESTRAIN'
  | 'AML_RELEASE'
  | 'PROVISIONAL_CREDIT'
  | 'DISPUTE_RECOVERY'
  | 'DISPUTE_REVERSAL'
  | 'ISSUER_LOSS'
  | 'ATM_DISPENSE'
  | 'ATM_JAM'
  | 'ATM_REFUND'
  | 'ATM_DEPOSIT';

/**
 * One line of the general ledger. Double entry means every line debits one account and credits another by the same
 * amount, so any set of lines balances by construction. `amount` is a positive integer in minor units.
 */
export interface GLEntry {
  id: Id;
  txId: Id;
  timestamp: EpochMs;
  debitAccount: AccountId;
  creditAccount: AccountId;
  amount: MinorUnits;
  currency: string;
  kind: PostingKind;
  /** One plain-English line saying what this entry records. */
  memo: string;
}
