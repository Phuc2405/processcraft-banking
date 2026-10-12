/**
 * Evaluator and grader.
 *
 *   validateGraph()      static checks on a learner's diagram, before anything runs
 *   evaluateChallenge()  runs every test in a level, scores the result, and explains each failure
 *
 * How a diagram is graded
 *   1. validateGraph() looks for structural problems: no start event, bad ports or edges, conditions
 *      that do not parse or that read hidden variables, node settings out of range, palette and
 *      budget violations, tampered starter nodes, unreachable nodes.
 *   2. Each TestCase runs on a fresh ProcessRunner. A test passes only if every check holds:
 *        - no token faulted (no exception, no deadlock),
 *        - the transaction ended with the expected outcome (and reason code, when the test sets one),
 *        - it finished within maxLatencyMs,
 *        - its path visited every required capability and none of the forbidden ones.
 *   3. correctnessScore = weighted share of passed tests, minus the level's penalty for each distinct
 *      ERROR anomaly. The level is passed when correctnessScore >= passMark.
 *   4. efficiencyScore compares nodes placed and average latency with the level's benchmark. It is
 *      only scored once the level is passed.
 *   5. Every failed test gets a plain-English explanation in feedbackLogs. Hidden tests are explained
 *      without their decision trace or facts, and their execution traces are withheld (a trace
 *      carries the payload), unless revealHidden is set.
 *
 * The evaluator is pure: it does not mutate the graph or the level.
 */

import { CONDITION_VARIABLES, NODE_CATALOG } from '../data/seedChallenges';
import type {
  BankingCapability,
  ChallengeLevel,
  ConditionVariable,
  DetectedAnomaly,
  EvaluationResult,
  ExecutionStep,
  FeedbackLog,
  Id,
  NodeDefinition,
  ProcessGraph,
  ProcessNode,
  SimulationToken,
  TestCase,
  TestCaseResult,
  TestFailureReason,
  TokenExceptionCode,
} from '../types/processLearning';
import { checkExpression } from './expression';
import { ProcessRunner, type RunResult, type UnsetFactRead } from './processRunner';

export interface EvaluateOptions {
  catalog?: readonly NodeDefinition[];
  conditionVariables?: readonly ConditionVariable[];
  /** Injected for deterministic results in tests. */
  now?: () => Date;
  newId?: () => string;
  /** Show payload-specific detail in feedback for hidden tests. For authoring tools only. */
  revealHidden?: boolean;
}

type AnomalyDraft = Omit<DetectedAnomaly, 'severity'>;

// ─────────────────────────────────────────────────────────────────────────────
// Static validation
// ─────────────────────────────────────────────────────────────────────────────

const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );

const effectiveConfig = (node: ProcessNode, def: NodeDefinition | undefined): Record<string, unknown> => ({
  ...Object.fromEntries((def?.configSchema ?? []).map((c) => [c.key, c.defaultValue])),
  ...node.configParams,
});

/** Starter nodes the learner may keep for free: locked, and identical to the level's starter node. */
function freeStarterNodeIds(graph: ProcessGraph, level: ChallengeLevel, defs: Map<Id, NodeDefinition>): Set<Id> {
  const free = new Set<Id>();
  const starter = level.starterGraph?.nodes.filter((n) => n.locked) ?? [];
  for (const s of starter) {
    const n = graph.nodes.find((x) => x.id === s.id);
    if (
      n &&
      n.locked &&
      n.definitionId === s.definitionId &&
      stableJson(effectiveConfig(n, defs.get(n.definitionId))) === stableJson(effectiveConfig(s, defs.get(s.definitionId)))
    ) {
      free.add(n.id);
    }
  }
  return free;
}

export function validateGraph(graph: ProcessGraph, level: ChallengeLevel, options: EvaluateOptions = {}): DetectedAnomaly[] {
  const catalog = options.catalog ?? NODE_CATALOG;
  const variables = options.conditionVariables ?? CONDITION_VARIABLES;
  const defs = new Map(catalog.map((d) => [d.id, d]));
  const found: DetectedAnomaly[] = [];

  const error = (type: DetectedAnomaly['type'], d: Omit<AnomalyDraft, 'type'>): void => {
    found.push({ type, severity: 'ERROR', ...d });
  };
  const warn = (type: DetectedAnomaly['type'], d: Omit<AnomalyDraft, 'type'>): void => {
    found.push({ type, severity: 'WARNING', ...d });
  };

  // ── identity ──
  const nodeIds = new Set<Id>();
  for (const n of graph.nodes) {
    if (nodeIds.has(n.id)) error('INVALID_STRUCTURE', { nodeId: n.id, message: `Two nodes share the id '${n.id}'.` });
    nodeIds.add(n.id);
  }
  const edgeIds = new Set<Id>();
  for (const e of graph.edges) {
    if (edgeIds.has(e.id)) error('INVALID_STRUCTURE', { edgeId: e.id, message: `Two edges share the id '${e.id}'.` });
    edgeIds.add(e.id);
  }
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const typeOf = (n: ProcessNode) => defs.get(n.definitionId)?.type ?? n.type;

  // ── start event ──
  const starts = graph.nodes.filter((n) => typeOf(n) === 'EVENT_START');
  if (starts.length === 0) {
    error('MISSING_START_EVENT', { message: 'The diagram has no Start event. Every transaction needs somewhere to enter.' });
  } else if (starts.length > 1) {
    error('INVALID_STRUCTURE', { message: `The diagram has ${starts.length} Start events. Use exactly one.` });
  }

  // ── nodes: definition, palette, starter nodes, config ──
  const free = freeStarterNodeIds(graph, level, defs);
  const counts = new Map<Id, number>();
  let placed = 0;

  for (const s of level.starterGraph?.nodes.filter((n) => n.locked) ?? []) {
    const n = nodeById.get(s.id);
    if (!n) {
      error('INVALID_STRUCTURE', { nodeId: s.id, message: `The starter node '${s.label}' was removed. It is locked and must stay.` });
    } else if (!free.has(n.id)) {
      error('INVALID_STRUCTURE', { nodeId: n.id, message: `The starter node '${s.label}' is locked, but it was changed.` });
    }
  }

  for (const n of graph.nodes) {
    const def = defs.get(n.definitionId);
    if (n.locked && !free.has(n.id) && !level.starterGraph?.nodes.some((s) => s.id === n.id && s.locked)) {
      error('INVALID_STRUCTURE', { nodeId: n.id, message: `'${n.label}' is marked locked, but it is not one of this level's starter nodes.` });
    }
    if (!def) {
      error('PALETTE_VIOLATION', { nodeId: n.id, message: `'${n.label}' was not built from any known node type (${n.definitionId}).` });
      continue;
    }
    if (def.type !== n.type || def.bankingCapability !== n.bankingCapability) {
      error('INVALID_STRUCTURE', { nodeId: n.id, message: `'${n.label}' does not behave like its node type '${def.label}'.` });
    }

    if (!free.has(n.id)) {
      placed++;
      counts.set(def.id, (counts.get(def.id) ?? 0) + 1);
    }

    for (const c of def.configSchema) {
      const v = n.configParams[c.key];
      if (v === undefined) {
        if (c.required) error('INVALID_CONFIG', { nodeId: n.id, message: `'${n.label}' needs a value for '${c.label}'.` });
        continue;
      }
      const label = `'${c.label}' on '${n.label}'`;
      if (c.type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) error('INVALID_CONFIG', { nodeId: n.id, message: `${label} must be a number.` });
        else if ((c.min !== undefined && v < c.min) || (c.max !== undefined && v > c.max)) {
          error('INVALID_CONFIG', { nodeId: n.id, message: `${label} must be between ${c.min ?? '-∞'} and ${c.max ?? '∞'} (got ${v}).` });
        }
      } else if (c.type === 'boolean') {
        if (typeof v !== 'boolean') error('INVALID_CONFIG', { nodeId: n.id, message: `${label} must be true or false.` });
      } else if (c.type === 'enum') {
        if (typeof v !== 'string' || !(c.options ?? []).includes(v)) {
          error('INVALID_CONFIG', { nodeId: n.id, message: `${label} must be one of ${(c.options ?? []).join(', ')} (got ${JSON.stringify(v)}).` });
        }
      } else if (typeof v !== 'string') {
        error('INVALID_CONFIG', { nodeId: n.id, message: `${label} must be text.` });
      }
    }
    const known = new Set(def.configSchema.map((c) => c.key));
    for (const key of Object.keys(n.configParams)) {
      if (!known.has(key)) warn('INVALID_CONFIG', { nodeId: n.id, message: `'${n.label}' has a setting '${key}' that this node does not use.` });
    }
    if (def.bankingCapability === 'THREE_DS_EVALUATOR') {
      const lo = n.configParams.frictionlessBelow;
      const hi = n.configParams.rejectAtOrAbove;
      if (typeof lo === 'number' && typeof hi === 'number' && lo > hi) {
        error('INVALID_CONFIG', {
          nodeId: n.id,
          message: `'${n.label}': the frictionless line (${lo}) is above the reject line (${hi}), so the bands overlap.`,
        });
      }
    }
  }

  for (const [defId, count] of counts) {
    const entry = level.allowedNodePalette.entries.find((e) => e.nodeDefinitionId === defId);
    const name = defs.get(defId)?.label ?? defId;
    if (!entry) error('PALETTE_VIOLATION', { message: `'${name}' is not available on this level.` });
    else if (entry.maxCount !== null && count > entry.maxCount) {
      error('PALETTE_VIOLATION', { message: `This level allows ${entry.maxCount} '${name}' node${entry.maxCount === 1 ? '' : 's'}, but the diagram uses ${count}.` });
    }
  }
  const budget = level.allowedNodePalette.totalNodeBudget;
  if (budget !== null && placed > budget) {
    error('PALETTE_VIOLATION', { message: `This level allows ${budget} nodes, but the diagram uses ${placed}.` });
  }

  // ── edges ──
  const portUse = new Map<string, number>();
  for (const e of graph.edges) {
    const from = nodeById.get(e.sourceNodeId);
    const to = nodeById.get(e.targetNodeId);
    if (!from || !to) {
      error('INVALID_STRUCTURE', { edgeId: e.id, message: `Edge ${e.id} connects to a node that is not in the diagram.` });
      continue;
    }
    const outPort = from.outputPorts.find((p) => p.id === e.sourcePortId);
    const inPort = to.inputPorts.find((p) => p.id === e.targetPortId);
    if (!outPort) error('INVALID_STRUCTURE', { edgeId: e.id, nodeId: from.id, message: `Edge ${e.id} leaves '${from.label}' from a port it does not have ('${e.sourcePortId}').` });
    if (!inPort) error('INVALID_STRUCTURE', { edgeId: e.id, nodeId: to.id, message: `Edge ${e.id} enters '${to.label}' at a port it does not have ('${e.targetPortId}').` });
    for (const [key, port, node] of [
      [`${from.id}:${e.sourcePortId}`, outPort, from],
      [`${to.id}:${e.targetPortId}`, inPort, to],
    ] as const) {
      const used = (portUse.get(key) ?? 0) + 1;
      portUse.set(key, used);
      if (port && used === port.maxEdges + 1) {
        error('INVALID_STRUCTURE', { nodeId: node.id, message: `The '${port.label}' port on '${node.label}' takes at most ${port.maxEdges} connection${port.maxEdges === 1 ? '' : 's'}.` });
      }
    }

    if (e.conditionExpression !== undefined) {
      if (typeOf(from) !== 'GATEWAY_XOR') {
        warn('INVALID_EXPRESSION', { edgeId: e.id, nodeId: from.id, message: `Edge ${e.id} has a condition, but only edges leaving a Decision (XOR) gateway use one. It is ignored.` });
      } else {
        const check = checkExpression(e.conditionExpression, variables);
        for (const msg of check.errors) {
          error('INVALID_EXPRESSION', { edgeId: e.id, nodeId: from.id, message: `Condition "${e.conditionExpression}" on edge ${e.id} after '${from.label}': ${msg}` });
        }
      }
    }
  }

  for (const n of graph.nodes.filter((x) => typeOf(x) === 'GATEWAY_XOR')) {
    const out = graph.edges.filter((e) => e.sourceNodeId === n.id);
    if (out.filter((e) => e.isDefault).length > 1) {
      error('INVALID_STRUCTURE', { nodeId: n.id, message: `The decision '${n.label}' has more than one default edge. Choose one.` });
    }
    if (out.length > 1 && out.some((e) => !e.isDefault && e.conditionExpression === undefined)) {
      warn('INVALID_STRUCTURE', { nodeId: n.id, message: `An edge out of the decision '${n.label}' has no condition and is not the default, so it is always taken when reached.` });
    }
  }

  // ── reachability ──
  const reached = new Set<Id>();
  const queue = starts.map((s) => s.id);
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (reached.has(id)) continue;
    reached.add(id);
    for (const e of graph.edges) if (e.sourceNodeId === id) queue.push(e.targetNodeId);
  }
  if (starts.length > 0) {
    for (const n of graph.nodes) {
      if (!reached.has(n.id)) warn('UNREACHABLE_NODE', { nodeId: n.id, message: `'${n.label}' cannot be reached from the Start event, so it never runs.` });
    }
  }

  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// Judging one test
// ─────────────────────────────────────────────────────────────────────────────

function judge(test: TestCase, run: RunResult): TestFailureReason[] {
  const reasons: TestFailureReason[] = [];
  const faulted = run.tokens.some((t) => t.state === 'EXCEPTION');
  const stuck = run.tokens.some((t) => t.state === 'DEADLOCKED');
  if (faulted) reasons.push('EXCEPTION');
  if (stuck) reasons.push('DEADLOCK');

  const explainedByFault = run.outcome === 'NO_OUTCOME' && (faulted || stuck);
  if (run.outcome !== test.expectedOutcome && !explainedByFault) reasons.push('WRONG_OUTCOME');
  if (run.outcome === test.expectedOutcome && test.expectedReasonCode !== undefined && run.reasonCode !== test.expectedReasonCode) {
    reasons.push('WRONG_REASON_CODE');
  }
  if (run.outcome !== 'NO_OUTCOME' && run.latencyMs > test.maxLatencyMs) reasons.push('LATENCY_EXCEEDED');
  if ((test.requiredCapabilities ?? []).some((c) => !run.visitedCapabilities.includes(c))) reasons.push('MISSING_REQUIRED_CAPABILITY');
  if ((test.forbiddenCapabilities ?? []).some((c) => run.visitedCapabilities.includes(c))) reasons.push('FORBIDDEN_CAPABILITY_VISITED');
  return reasons;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostics
// ─────────────────────────────────────────────────────────────────────────────

interface ExplainContext {
  graph: ProcessGraph;
  catalog: readonly NodeDefinition[];
  /** False for hidden tests: no payload-specific detail. */
  reveal: boolean;
}

const labelOf = (graph: ProcessGraph, id: Id): string => graph.nodes.find((n) => n.id === id)?.label ?? id;
const capabilityLabel = (catalog: readonly NodeDefinition[], cap: BankingCapability): string =>
  catalog.find((d) => d.bankingCapability === cap)?.label ?? cap;

/** The steps a token took, including everything its ancestors did before it. */
function pathSteps(run: RunResult, tokenId: Id | null): ExecutionStep[] {
  const byId = new Map(run.tokens.map((t) => [t.id, t]));
  const chain: SimulationToken[] = [];
  for (let cur = tokenId ? byId.get(tokenId) : undefined; cur; cur = cur.parentTokenId ? byId.get(cur.parentTokenId) : undefined) {
    chain.unshift(cur);
  }
  return chain.flatMap((t) => t.executionPathHistory);
}

const describePath = (graph: ProcessGraph, steps: ExecutionStep[]): string =>
  steps.map((s) => labelOf(graph, s.nodeId)).join(' → ');

const FAULT_ADVICE: Partial<Record<TokenExceptionCode, string>> = {
  TOKEN_NOT_FOUND: "Connect the Token Vault's error port to an End event (for example Declined) so unknown tokens are handled instead of stalling.",
  NO_MATCHING_BRANCH: 'Mark one outgoing edge as the default, so every case lands somewhere.',
  INVALID_EXPRESSION: 'Fix the condition on that edge.',
  INVALID_CONFIG: "Check that node's settings.",
  STEP_LIMIT_EXCEEDED: 'Give the loop an exit, or take it out. Every path should end at an End event.',
};

function explainFailure(test: TestCase, run: RunResult, reasons: TestFailureReason[], ctx: ExplainContext): FeedbackLog[] {
  const logs: FeedbackLog[] = [];
  const tag = `${test.name}${test.hidden ? ' (hidden test)' : ''}:`;
  const add = (message: string, nodeId?: Id): void => {
    logs.push({ level: 'ERROR', testCaseId: test.id, message: `${tag} ${message}`, ...(nodeId !== undefined ? { nodeId } : {}) });
  };
  const decider = pathSteps(run, run.decidingTokenId);

  // Faults: one explanation per distinct problem, however many tokens hit it.
  const seen = new Set<string>();
  for (const t of run.tokens) {
    if ((t.state !== 'EXCEPTION' && t.state !== 'DEADLOCKED') || !t.exception) continue;
    const key = `${t.exception.code}|${t.exception.nodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { code, nodeId, message } = t.exception;
    const nodeType = ctx.catalog.find((d) => d.id === ctx.graph.nodes.find((n) => n.id === nodeId)?.definitionId)?.type;
    const advice =
      code === 'DEAD_END'
        ? nodeType === 'GATEWAY_AND'
          ? 'Make sure every branch into the join is taken on every path, or do not use a join here.'
          : 'Connect it to the next step, or to an End event.'
        : FAULT_ADVICE[code];
    const sentence = /[.!?]$/.test(message) ? message : `${message}.`;
    add(`${sentence} ${advice ?? ''}`.trim(), nodeId);
  }

  if (reasons.includes('WRONG_OUTCOME')) {
    if (run.outcome === 'NO_OUTCOME') {
      add(`Expected ${test.expectedOutcome}, but no path reached an End event.`);
    } else {
      const last = decider[decider.length - 1];
      let msg = `Expected ${test.expectedOutcome} but the transaction ended ${run.outcome} at '${last ? labelOf(ctx.graph, last.nodeId) : 'an End event'}'.`;
      if (ctx.reveal) {
        msg += ` Path: ${describePath(ctx.graph, decider)}.`;
        const decision = [...decider].reverse().find((s) => ctx.graph.nodes.find((n) => n.id === s.nodeId)?.type === 'GATEWAY_XOR' && s.note);
        if (decision) msg += ` Last decision, '${labelOf(ctx.graph, decision.nodeId)}': ${decision.note}`;
      }
      add(msg, last?.nodeId);
    }
  }

  if (reasons.includes('WRONG_REASON_CODE')) {
    const last = decider[decider.length - 1];
    add(
      ctx.reveal
        ? `The reason code is '${run.reasonCode ?? '(none)'}' but this case belongs in '${test.expectedReasonCode}'. Check the reason code on the End event '${last ? labelOf(ctx.graph, last.nodeId) : '?'}', or route this case to a different End event.`
        : 'The outcome is right but the reason code on the End event is wrong. Different kinds of break go to different queues.',
      last?.nodeId,
    );
  }

  if (reasons.includes('LATENCY_EXCEEDED')) {
    const slow = [...decider].filter((s) => s.durationMs > 0).sort((a, b) => b.durationMs - a.durationMs).slice(0, 3);
    add(
      `It took ${run.latencyMs} ms but this case must finish within ${test.maxLatencyMs} ms.` +
        (slow.length ? ` Slowest steps: ${slow.map((s) => `${labelOf(ctx.graph, s.nodeId)} (${s.durationMs} ms)`).join(', ')}.` : '') +
        ' Remove steps this case does not need.',
    );
  }

  for (const cap of test.requiredCapabilities ?? []) {
    if (!run.visitedCapabilities.includes(cap)) {
      add(`This case has to pass through the ${capabilityLabel(ctx.catalog, cap)}, but your diagram skipped it.`);
    }
  }
  for (const cap of test.forbiddenCapabilities ?? []) {
    if (run.visitedCapabilities.includes(cap)) {
      const hit = run.tokens.flatMap((t) => t.executionPathHistory).find((s) => s.capability === cap);
      add(
        `This case must not reach the ${capabilityLabel(ctx.catalog, cap)}, but it did. Stop it earlier: a request that is already decided should not trigger that check.`,
        hit?.nodeId,
      );
    }
  }

  if (!ctx.reveal && test.tags?.length) {
    logs.push({ level: 'HINT', testCaseId: test.id, message: `${tag} this hidden test covers: ${test.tags.join(', ')}.` });
  }
  return logs;
}

function dedupeAnomalies(list: DetectedAnomaly[]): DetectedAnomaly[] {
  const byKey = new Map<string, { anomaly: DetectedAnomaly; extra: number }>();
  for (const a of list) {
    const key = a.testCaseId === undefined
      ? `${a.type}|${a.nodeId ?? ''}|${a.edgeId ?? ''}|${a.message}`
      : `${a.type}|${a.nodeId ?? ''}|${a.edgeId ?? ''}`;
    const hit = byKey.get(key);
    if (hit) hit.extra++;
    else byKey.set(key, { anomaly: a, extra: 0 });
  }
  return [...byKey.values()].map(({ anomaly, extra }) =>
    extra > 0 ? { ...anomaly, message: `${anomaly.message} (also in ${extra} other test${extra === 1 ? '' : 's'})` } : anomaly,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// evaluateChallenge
// ─────────────────────────────────────────────────────────────────────────────

export function evaluateChallenge(graph: ProcessGraph, level: ChallengeLevel, options: EvaluateOptions = {}): EvaluationResult {
  const catalog = options.catalog ?? NODE_CATALOG;
  const variables = options.conditionVariables ?? CONDITION_VARIABLES;
  const evaluatedAt = (options.now ?? (() => new Date()))();
  const defs = new Map(catalog.map((d) => [d.id, d]));

  const staticFindings = validateGraph(graph, level, options);
  const runtimeAnomalies: DetectedAnomaly[] = [];
  const testResults: TestCaseResult[] = [];
  const testLogs: FeedbackLog[] = [];
  const unsetReads: UnsetFactRead[] = [];
  const passedLatencies: number[] = [];
  let passedWeight = 0;
  let totalWeight = 0;

  for (const test of level.testSuite) {
    const run = new ProcessRunner(graph, test, {
      runnerConfig: level.runnerConfig,
      catalog,
      conditionVariables: variables,
    }).runToCompletion();

    const reasons = judge(test, run);
    const weight = test.weight ?? 1;
    totalWeight += weight;
    const passed = reasons.length === 0;
    if (passed) {
      passedWeight += weight;
      passedLatencies.push(run.latencyMs);
    }

    runtimeAnomalies.push(...run.anomalies);
    for (const u of run.unsetFactReads) {
      if (!unsetReads.some((x) => x.edgeId === u.edgeId && x.fact === u.fact)) unsetReads.push(u);
    }

    const leaked = run.outcome === 'APPROVED' && test.inputPayload.isFraud;
    if (leaked) {
      const lastStep = pathSteps(run, run.decidingTokenId).at(-1);
      runtimeAnomalies.push({
        type: 'FRAUD_LEAKAGE',
        severity: 'ERROR',
        testCaseId: test.id,
        ...(lastStep ? { nodeId: lastStep.nodeId } : {}),
        message: 'A fraudulent transaction was approved. Catch it with the risk score before it reaches an Approved end.',
      });
    }

    testResults.push({
      testCaseId: test.id,
      passed,
      expectedOutcome: test.expectedOutcome,
      actualOutcome: run.outcome,
      actualReasonCode: run.reasonCode,
      latencyMs: run.latencyMs,
      failureReasons: reasons,
      // A trace carries the payload, so a hidden test's trace is withheld unless an authoring tool asks.
      tokens: test.hidden && options.revealHidden !== true ? [] : run.tokens,
    });

    if (!passed) {
      testLogs.push(...explainFailure(test, run, reasons, { graph, catalog, reveal: !test.hidden || options.revealHidden === true }));
      if (leaked) {
        testLogs.push({ level: 'ERROR', testCaseId: test.id, message: `${test.name}${test.hidden ? ' (hidden test)' : ''}: this was a fraudulent transaction and your diagram approved it.` });
      }
    }
  }

  // ── scores ──
  const anomalies = dedupeAnomalies([...staticFindings, ...runtimeAnomalies]);
  const errorCount = anomalies.filter((a) => a.severity === 'ERROR').length;
  const passCount = testResults.filter((r) => r.passed).length;
  const failCount = testResults.length - passCount;
  const base = totalWeight > 0 ? Math.round((100 * passedWeight) / totalWeight) : 0;
  const correctnessScore = Math.max(0, Math.min(100, base - errorCount * level.scoring.anomalyPenaltyPoints));
  const passed = correctnessScore >= level.scoring.passMark;

  const free = freeStarterNodeIds(graph, level, defs);
  const nodesUsed = graph.nodes.filter((n) => !free.has(n.id)).length;
  const avgLatency = passedLatencies.length ? passedLatencies.reduce((a, b) => a + b, 0) / passedLatencies.length : 0;
  const bench = level.scoring.efficiency;
  const nodeRatio = Math.min(1, bench.optimalNodeCount / Math.max(1, nodesUsed));
  const latencyRatio = avgLatency > 0 ? Math.min(1, bench.optimalAvgLatencyMs / avgLatency) : 1;
  const weightSum = bench.nodeCountWeight + bench.latencyWeight || 1;
  const efficiencyScore = passed
    ? Math.round((100 * (bench.nodeCountWeight * nodeRatio + bench.latencyWeight * latencyRatio)) / weightSum)
    : 0;

  // ── feedback ──
  const logs: FeedbackLog[] = [];
  logs.push({
    level: 'INFO',
    message:
      `Passed ${passCount} of ${testResults.length} tests. Correctness ${correctnessScore}/100` +
      (errorCount > 0 ? ` (${errorCount} problem${errorCount === 1 ? '' : 's'} cost ${errorCount * level.scoring.anomalyPenaltyPoints} points)` : '') +
      (passed ? `. Level passed. Efficiency ${efficiencyScore}/100.` : `. Level not passed yet; you need ${level.scoring.passMark}.`),
  });
  for (const a of staticFindings) {
    logs.push({ level: a.severity === 'ERROR' ? 'ERROR' : 'WARN', message: a.message, ...(a.nodeId !== undefined ? { nodeId: a.nodeId } : {}) });
  }
  logs.push(...testLogs);
  for (const u of unsetReads) {
    const producer = variables.find((v) => v.name === u.fact)?.producedBy;
    logs.push({
      level: 'WARN',
      nodeId: u.nodeId,
      message:
        `The decision '${labelOf(graph, u.nodeId)}' (edge ${u.edgeId}) reads '${u.fact}', but nothing on that path has set it yet` +
        (producer ? `; it comes from the ${capabilityLabel(catalog, producer)}. Put that step before this decision.` : '.'),
    });
  }
  if (passed) {
    if (nodesUsed > bench.optimalNodeCount) {
      logs.push({ level: 'HINT', message: `Your diagram uses ${nodesUsed} nodes; the benchmark is ${bench.optimalNodeCount}. Look for a node you can remove.` });
    }
    if (avgLatency > bench.optimalAvgLatencyMs * 1.005) {
      logs.push({ level: 'HINT', message: `Average latency is ${avgLatency.toFixed(1)} ms against a benchmark of ${bench.optimalAvgLatencyMs} ms. Look for checks that run on requests that are already decided.` });
    }
  } else {
    logs.push({ level: 'INFO', message: 'Efficiency is scored once all tests pass.' });
  }

  return {
    id: options.newId?.() ?? `eval_${level.id}_${evaluatedAt.getTime().toString(36)}`,
    challengeId: level.id,
    graphId: graph.id,
    evaluatedAt: evaluatedAt.toISOString(),
    passed,
    passCount,
    failCount,
    correctnessScore,
    efficiencyScore,
    detectedAnomalies: anomalies,
    feedbackLogs: logs,
    testResults,
  };
}
