/**
 * ProcessRunner: a discrete-event interpreter for ProcessGraph.
 *
 * One runner executes one graph against one TestCase. It is deterministic: the same graph and test
 * always produce the same tokens, trace and result.
 *
 * Driving it
 *   step()            runs exactly one node for one token and reports what happened as events.
 *                     Use it for animated playback: each StepResult says which token ran which node,
 *                     which edge it took, and any fork, join, completion or fault.
 *   runToCompletion() steps until nothing can move. Use it for grading.
 *
 * Time is virtual. Each node costs its catalog baseLatencyMs. The runner always advances the token
 * with the smallest virtual clock, so parallel branches interleave in time order, and an AND join
 * releases at the clock of its slowest branch.
 *
 * Tokens
 *   - A token starts at the EVENT_START node and runs the node it is at, then moves along an edge.
 *   - TASK nodes run a capability handler. A raised exception leaves by the node's error port if one
 *     is wired, otherwise the token faults (EXCEPTION).
 *   - XOR gateways try edges in priority order. First true condition wins, then the default edge,
 *     otherwise the token faults (NO_MATCHING_BRANCH).
 *   - AND gateways with one incoming edge fork: the parent is retired and one child runs per
 *     outgoing edge. AND gateways with several incoming edges join: tokens wait until every incoming
 *     edge has delivered one, then a single merged token continues.
 *   - EVENT_END completes the token with the node's configured outcome and reason code.
 *
 * Anomalies recorded (all severity ERROR)
 *   DEAD_END            token is at a node with nowhere to go                 -> token DEADLOCKED
 *   DEADLOCK            AND join that some incoming branch never reaches      -> tokens DEADLOCKED
 *   INFINITE_LOOP       too many steps for one token, in total, or too many tokens -> token EXCEPTION
 *   UNHANDLED_EXCEPTION a capability raised and no error port is wired        -> token EXCEPTION
 *   NO_MATCHING_BRANCH  XOR with no matching edge and no default              -> token EXCEPTION
 *   INVALID_EXPRESSION  a condition does not parse, type-check or evaluate    -> token EXCEPTION
 *   INVALID_CONFIG      a node cannot run with its configuration              -> token EXCEPTION
 *
 * The runner reports what happened. It does not decide whether that is what the test wanted;
 * that is the evaluator's job.
 */

import { CONDITION_VARIABLES, NODE_CATALOG } from '../data/seedChallenges';
import type {
  BankingCapability,
  ConditionVariable,
  ConfigValue,
  DerivedFacts,
  DetectedAnomaly,
  ExecutionStep,
  Id,
  NodeDefinition,
  NodeType,
  Outcome,
  ProcessEdge,
  ProcessGraph,
  ProcessNode,
  RunnerConfig,
  SimulationToken,
  TestCase,
  TokenException,
  TokenExceptionCode,
} from '../types/processLearning';
import { CAPABILITY_HANDLERS } from './capabilities';
import {
  checkExpression,
  collectIdentifiers,
  evaluateExpression,
  ExpressionError,
  parseExpression,
  type Ast,
  type Scalar,
} from './expression';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface RunnerOptions {
  /** Loop and parallelism guards, and how to pick an outcome when parallel branches disagree. */
  runnerConfig?: RunnerConfig;
  /** Node definitions: source of truth for each node's type, capability, latency and config defaults. */
  catalog?: readonly NodeDefinition[];
  /** Names edge conditions may use. */
  conditionVariables?: readonly ConditionVariable[];
}

export const DEFAULT_RUNNER_CONFIG: RunnerConfig = {
  maxStepsPerToken: 30,
  maxTokensPerTest: 12,
  outcomePrecedence: ['DECLINED', 'ROUTED_TO_SUSPENSE', 'CHALLENGE_REQUIRED', 'APPROVED'],
};

export type EdgeReason = 'FLOW' | 'FORK' | 'CONDITION' | 'DEFAULT' | 'ERROR_PORT';

export type RunEvent =
  | { type: 'TOKEN_SPAWNED'; tokenId: Id; parentTokenId: Id | null; nodeId: Id; atMs: number }
  | { type: 'NODE_EXECUTED'; tokenId: Id; nodeId: Id; step: ExecutionStep }
  | { type: 'EDGE_TAKEN'; tokenId: Id; edgeId: Id; fromNodeId: Id; toNodeId: Id; reason: EdgeReason }
  | { type: 'TOKEN_FORKED'; tokenId: Id; nodeId: Id; childTokenIds: Id[] }
  | { type: 'JOIN_WAITING'; tokenId: Id; nodeId: Id; arrived: number; expected: number }
  | { type: 'JOIN_RELEASED'; nodeId: Id; mergedTokenId: Id; sourceTokenIds: Id[]; elapsedMs: number }
  | { type: 'TOKEN_COMPLETED'; tokenId: Id; nodeId: Id; outcome: Outcome; reasonCode: string | null }
  | { type: 'TOKEN_FAULTED'; tokenId: Id; state: 'EXCEPTION' | 'DEADLOCKED'; exception: TokenException }
  | { type: 'ANOMALY'; anomaly: DetectedAnomaly };

export interface StepResult {
  /** True once nothing can move any more (the run is finalised). */
  done: boolean;
  /** The token that ran. Null if the run was already done. */
  tokenId: Id | null;
  /** The trace entry written for this step. Null when the token was stopped by a guard before running. */
  step: ExecutionStep | null;
  /** Everything that happened during this step, in order. */
  events: RunEvent[];
}

/** An edge condition that read a fact no node had produced yet on that path. */
export interface UnsetFactRead {
  nodeId: Id;
  edgeId: Id;
  fact: string;
}

export interface RunResult {
  testCaseId: Id;
  /** Every token the run produced, including retired fork parents and merged join tokens. */
  tokens: SimulationToken[];
  outcome: Outcome | 'NO_OUTCOME';
  reasonCode: string | null;
  /** The completed token whose outcome won. Null when no token completed. */
  decidingTokenId: Id | null;
  /** Critical-path virtual time: the largest clock among completed tokens. */
  latencyMs: number;
  totalSteps: number;
  visitedCapabilities: BankingCapability[];
  anomalies: DetectedAnomaly[];
  unsetFactReads: UnsetFactRead[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

const OUTCOMES: readonly Outcome[] = ['APPROVED', 'DECLINED', 'ROUTED_TO_SUSPENSE', 'CHALLENGE_REQUIRED'];

type Compiled = { ok: true; ast: Ast } | { ok: false; error: string };

interface NodeKind {
  type: NodeType;
  capability: BankingCapability | null;
  latencyMs: number;
  config: Record<string, ConfigValue>;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const compareEdges = (a: ProcessEdge, b: ProcessEdge): number => {
  const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
  const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
  if (pa !== pb) return pa - pb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

const formatFact = (v: Scalar | undefined): string =>
  v === undefined ? 'not set' : typeof v === 'string' ? `'${v}'` : String(v);

// ─────────────────────────────────────────────────────────────────────────────
// ProcessRunner
// ─────────────────────────────────────────────────────────────────────────────

export class ProcessRunner {
  private readonly graph: ProcessGraph;
  private readonly testCase: TestCase;
  private readonly cfg: RunnerConfig;
  private readonly maxTotalSteps: number;

  private readonly nodes = new Map<Id, ProcessNode>();
  private readonly outEdges = new Map<Id, ProcessEdge[]>();
  private readonly inEdges = new Map<Id, ProcessEdge[]>();
  private readonly definitions = new Map<Id, NodeDefinition>();
  private readonly variables: readonly ConditionVariable[];
  private readonly visibleVariables: readonly ConditionVariable[];
  private readonly kinds = new Map<Id, NodeKind>();
  private readonly compiled = new Map<Id, Compiled>();

  private readonly allTokens: SimulationToken[] = [];
  private ready: SimulationToken[] = [];
  /** join node id -> incoming edge id -> tokens that arrived by that edge and are waiting. */
  private readonly waiting = new Map<Id, Map<Id, SimulationToken[]>>();
  private readonly eventLog: RunEvent[] = [];
  private readonly anomalyLog: DetectedAnomaly[] = [];
  private readonly unsetReads: UnsetFactRead[] = [];
  private pending: RunEvent[] = [];

  private tokenCounter = 0;
  private stepsExecuted = 0;
  private finished = false;

  constructor(graph: ProcessGraph, testCase: TestCase, options: RunnerOptions = {}) {
    this.graph = graph;
    this.testCase = testCase;
    this.cfg = options.runnerConfig ?? DEFAULT_RUNNER_CONFIG;
    this.maxTotalSteps = this.cfg.maxStepsPerToken * this.cfg.maxTokensPerTest;
    this.variables = options.conditionVariables ?? CONDITION_VARIABLES;
    this.visibleVariables = this.variables.filter((v) => v.learnerVisible);
    for (const d of options.catalog ?? NODE_CATALOG) this.definitions.set(d.id, d);

    for (const n of graph.nodes) this.nodes.set(n.id, n);
    const addTo = (map: Map<Id, ProcessEdge[]>, key: Id, edge: ProcessEdge): void => {
      const list = map.get(key);
      if (list) list.push(edge);
      else map.set(key, [edge]);
    };
    for (const e of graph.edges) {
      // Edges that point at missing nodes are ignored here. The evaluator reports them as INVALID_STRUCTURE.
      if (!this.nodes.has(e.sourceNodeId) || !this.nodes.has(e.targetNodeId)) continue;
      addTo(this.outEdges, e.sourceNodeId, e);
      addTo(this.inEdges, e.targetNodeId, e);
    }
    for (const list of this.outEdges.values()) list.sort(compareEdges);
    for (const list of this.inEdges.values()) list.sort(compareEdges);

    this.spawnRoot();
  }

  // ── public API ─────────────────────────────────────────────────────────────

  get isDone(): boolean {
    return this.finished;
  }

  get tokens(): readonly SimulationToken[] {
    return this.allTokens;
  }

  /** Every event since the run began. */
  get events(): readonly RunEvent[] {
    return this.eventLog;
  }

  /** Runs one node for one token. */
  step(): StepResult {
    this.pending = [];
    if (this.finished) return { done: true, tokenId: null, step: null, events: [] };

    const token = this.takeNext();
    const step = token ? this.execute(token) : null;
    if (this.ready.length === 0) this.finalize();
    return { done: this.finished, tokenId: token?.id ?? null, step, events: this.pending };
  }

  runToCompletion(): RunResult {
    // Every step either executes a node (bounded by maxTotalSteps) or stops a token, so this ends.
    const guard = this.maxTotalSteps * 4 + this.cfg.maxTokensPerTest + 16;
    for (let i = 0; i < guard && !this.finished; i++) this.step();
    if (!this.finished) this.finalize();
    return this.result();
  }

  /** The result so far. Final once isDone is true. */
  result(): RunResult {
    const completed = this.allTokens.filter((t) => t.state === 'COMPLETED' && t.finalOutcome !== null);
    let outcome: Outcome | 'NO_OUTCOME' = 'NO_OUTCOME';
    let deciding: SimulationToken | null = null;
    for (const o of this.cfg.outcomePrecedence) {
      const hit = completed.find((t) => t.finalOutcome === o);
      if (hit) {
        outcome = o;
        deciding = hit;
        break;
      }
    }
    const visited = new Set<BankingCapability>();
    for (const t of this.allTokens) {
      for (const s of t.executionPathHistory) if (s.capability) visited.add(s.capability);
    }
    return {
      testCaseId: this.testCase.id,
      tokens: this.allTokens,
      outcome,
      reasonCode: deciding?.finalReasonCode ?? null,
      decidingTokenId: deciding?.id ?? null,
      latencyMs: completed.length ? Math.max(...completed.map((t) => t.elapsedMs)) : 0,
      totalSteps: this.stepsExecuted,
      visitedCapabilities: [...visited],
      anomalies: this.anomalyLog,
      unsetFactReads: this.unsetReads,
    };
  }

  // ── setup ──────────────────────────────────────────────────────────────────

  private spawnRoot(): void {
    const start = this.graph.nodes.find((n) => this.kindOf(n).type === 'EVENT_START');
    if (!start) {
      this.addAnomaly('MISSING_START_EVENT', 'The diagram has no Start event, so nothing can run.');
      this.finalize();
      return;
    }
    const payload = deepFreeze(structuredClone(this.testCase.inputPayload));
    const root = this.newToken({
      currentNodeId: start.id,
      payload,
      derived: { isVirtual: payload.cardType === 'VIRTUAL_DPAN' },
    });
    this.emit({ type: 'TOKEN_SPAWNED', tokenId: root.id, parentTokenId: null, nodeId: start.id, atMs: 0 });
    this.ready.push(root);
  }

  private newToken(over: Partial<SimulationToken> & Pick<SimulationToken, 'payload' | 'derived'>): SimulationToken {
    const token: SimulationToken = {
      id: `tok_${++this.tokenCounter}`,
      parentTokenId: null,
      joinGroupId: null,
      currentEdgeId: null,
      currentNodeId: null,
      state: 'ACTIVE',
      executionPathHistory: [],
      elapsedMs: 0,
      exception: null,
      finalOutcome: null,
      finalReasonCode: null,
      ...over,
    };
    this.allTokens.push(token);
    return token;
  }

  // ── node metadata ──────────────────────────────────────────────────────────

  /** Type, capability, latency and config come from the catalog when the node's definition is known. */
  private kindOf(node: ProcessNode): NodeKind {
    const cached = this.kinds.get(node.id);
    if (cached) return cached;
    const def = this.definitions.get(node.definitionId);
    const defaults = Object.fromEntries((def?.configSchema ?? []).map((c) => [c.key, c.defaultValue]));
    const kind: NodeKind = {
      type: def?.type ?? node.type,
      capability: def ? def.bankingCapability : node.bankingCapability,
      latencyMs: def?.baseLatencyMs ?? 0,
      config: { ...defaults, ...node.configParams },
    };
    this.kinds.set(node.id, kind);
    return kind;
  }

  private portRole(node: ProcessNode, edge: ProcessEdge): 'FLOW' | 'ERROR' {
    const port = node.outputPorts.find((p) => p.id === edge.sourcePortId);
    return port ? port.role : edge.sourcePortId === 'error' ? 'ERROR' : 'FLOW';
  }

  private flowEdges(node: ProcessNode): ProcessEdge[] {
    return (this.outEdges.get(node.id) ?? []).filter((e) => this.portRole(node, e) === 'FLOW');
  }

  private errorEdge(node: ProcessNode): ProcessEdge | undefined {
    return (this.outEdges.get(node.id) ?? []).find((e) => this.portRole(node, e) === 'ERROR');
  }

  private labelOf(nodeId: Id): string {
    return this.nodes.get(nodeId)?.label ?? nodeId;
  }

  // ── scheduling ─────────────────────────────────────────────────────────────

  /** Removes and returns the ready token with the smallest virtual clock (ties: oldest first). */
  private takeNext(): SimulationToken | null {
    if (this.ready.length === 0) return null;
    let best = 0;
    for (let i = 1; i < this.ready.length; i++) {
      if (this.ready[i]!.elapsedMs < this.ready[best]!.elapsedMs) best = i;
    }
    return this.ready.splice(best, 1)[0]!;
  }

  // ── events and anomalies ───────────────────────────────────────────────────

  private emit(event: RunEvent): void {
    this.eventLog.push(event);
    this.pending.push(event);
  }

  private addAnomaly(
    type: DetectedAnomaly['type'],
    message: string,
    where: { nodeId?: Id; edgeId?: Id } = {},
  ): void {
    const anomaly: DetectedAnomaly = {
      type,
      severity: 'ERROR',
      testCaseId: this.testCase.id,
      message,
      ...(where.nodeId !== undefined ? { nodeId: where.nodeId } : {}),
      ...(where.edgeId !== undefined ? { edgeId: where.edgeId } : {}),
    };
    this.anomalyLog.push(anomaly);
    this.emit({ type: 'ANOMALY', anomaly });
  }

  private fault(
    token: SimulationToken,
    state: 'EXCEPTION' | 'DEADLOCKED',
    code: TokenExceptionCode,
    nodeId: Id,
    message: string,
  ): void {
    token.state = state;
    token.exception = { code, nodeId, message };
    this.emit({ type: 'TOKEN_FAULTED', tokenId: token.id, state, exception: token.exception });
  }

  private deadEnd(token: SimulationToken, node: ProcessNode, message: string): void {
    this.fault(token, 'DEADLOCKED', 'DEAD_END', node.id, message);
    this.addAnomaly('DEAD_END', message, { nodeId: node.id });
  }

  // ── execution ──────────────────────────────────────────────────────────────

  private execute(token: SimulationToken): ExecutionStep | null {
    const node = token.currentNodeId !== null ? this.nodes.get(token.currentNodeId) : undefined;
    if (!node) {
      const where = token.currentNodeId ?? '(unknown)';
      this.fault(token, 'DEADLOCKED', 'DEAD_END', where, `The token is on '${where}', which is not in the diagram.`);
      this.addAnomaly('DEAD_END', `The token is on '${where}', which is not in the diagram.`);
      return null;
    }

    if (token.executionPathHistory.length >= this.cfg.maxStepsPerToken || this.stepsExecuted >= this.maxTotalSteps) {
      const message = this.describeLoop(token, node);
      this.fault(token, 'EXCEPTION', 'STEP_LIMIT_EXCEEDED', node.id, message);
      this.addAnomaly('INFINITE_LOOP', message, { nodeId: node.id });
      return null;
    }

    const kind = this.kindOf(node);
    const step: ExecutionStep = {
      seq: token.executionPathHistory.length + 1,
      nodeId: node.id,
      capability: kind.capability,
      viaEdgeId: token.currentEdgeId,
      enteredAtMs: token.elapsedMs,
      durationMs: kind.latencyMs,
      factsWritten: {},
    };
    token.executionPathHistory.push(step);
    this.stepsExecuted++;
    token.elapsedMs += kind.latencyMs;

    switch (kind.type) {
      case 'EVENT_START':
        this.log(token, step);
        this.advance(token, node, false);
        break;
      case 'TASK':
        this.runTask(token, node, kind, step);
        break;
      case 'GATEWAY_XOR':
        this.runXor(token, node, step);
        break;
      case 'GATEWAY_AND':
        this.runAnd(token, node, step);
        break;
      case 'EVENT_END':
        this.runEnd(token, node, kind, step);
        break;
    }
    return step;
  }

  private log(token: SimulationToken, step: ExecutionStep): void {
    this.emit({ type: 'NODE_EXECUTED', tokenId: token.id, nodeId: step.nodeId, step });
  }

  /** Moves a token along an edge. It will run the target node on a later step. */
  private move(token: SimulationToken, edge: ProcessEdge, reason: EdgeReason): void {
    token.currentEdgeId = edge.id;
    token.currentNodeId = edge.targetNodeId;
    this.emit({
      type: 'EDGE_TAKEN',
      tokenId: token.id,
      edgeId: edge.id,
      fromNodeId: edge.sourceNodeId,
      toNodeId: edge.targetNodeId,
      reason,
    });
    this.ready.push(token);
  }

  /** Leaves a non-XOR node by its normal edges: continue, fork (AND only), or dead-end. */
  private advance(token: SimulationToken, node: ProcessNode, isAnd: boolean): void {
    const edges = this.flowEdges(node);
    if (edges.length === 0) {
      this.deadEnd(token, node, `'${node.label}' has no outgoing edge, so the transaction stops there.`);
    } else if (edges.length === 1 || !isAnd) {
      this.move(token, edges[0]!, 'FLOW');
    } else {
      this.fork(token, node, edges);
    }
  }

  private fork(token: SimulationToken, node: ProcessNode, edges: ProcessEdge[]): void {
    if (this.allTokens.length + edges.length > this.cfg.maxTokensPerTest) {
      const message = `'${node.label}' keeps splitting the transaction: more than ${this.cfg.maxTokensPerTest} parallel tokens.`;
      this.fault(token, 'EXCEPTION', 'STEP_LIMIT_EXCEEDED', node.id, message);
      this.addAnomaly('INFINITE_LOOP', message, { nodeId: node.id });
      return;
    }
    token.state = 'COMPLETED'; // retired: its children carry on
    const groupId = `grp_${token.id}`;
    const children = edges.map((edge) => {
      const child = this.newToken({
        parentTokenId: token.id,
        joinGroupId: groupId,
        payload: token.payload,
        derived: { ...token.derived },
        elapsedMs: token.elapsedMs,
      });
      this.emit({ type: 'TOKEN_SPAWNED', tokenId: child.id, parentTokenId: token.id, nodeId: node.id, atMs: child.elapsedMs });
      this.move(child, edge, 'FORK');
      return child;
    });
    this.emit({ type: 'TOKEN_FORKED', tokenId: token.id, nodeId: node.id, childTokenIds: children.map((c) => c.id) });
  }

  // ── node types ─────────────────────────────────────────────────────────────

  private runTask(token: SimulationToken, node: ProcessNode, kind: NodeKind, step: ExecutionStep): void {
    const handler = kind.capability ? CAPABILITY_HANDLERS[kind.capability] : undefined;
    if (!handler) {
      const message = `'${node.label}' is a task with no banking capability, so it has nothing to run.`;
      step.note = message;
      this.log(token, step);
      this.fault(token, 'EXCEPTION', 'INVALID_CONFIG', node.id, message);
      this.addAnomaly('INVALID_CONFIG', message, { nodeId: node.id });
      return;
    }

    const result = handler({
      nodeId: node.id,
      nodeLabel: node.label,
      payload: token.payload,
      derived: token.derived,
      config: kind.config,
    });

    if (!result.ok) {
      const handledBy = this.errorEdge(node);
      step.note = handledBy
        ? `Raised ${result.code}: ${result.message}. Handled by the error port.`
        : `Raised ${result.code}: ${result.message}. Nothing is connected to the error port.`;
      this.log(token, step);
      if (handledBy) {
        this.move(token, handledBy, 'ERROR_PORT');
      } else {
        this.fault(token, 'EXCEPTION', result.code, node.id, `${node.label}: ${result.message}`);
        this.addAnomaly('UNHANDLED_EXCEPTION', `${node.label}: ${result.message} (${result.code}), and its error port is not connected.`, {
          nodeId: node.id,
        });
      }
      return;
    }

    Object.assign(token.derived, result.facts);
    step.factsWritten = result.facts;
    if (result.note !== undefined) step.note = result.note;
    this.log(token, step);
    this.advance(token, node, false);
  }

  private compile(edge: ProcessEdge): Compiled {
    const cached = this.compiled.get(edge.id);
    if (cached) return cached;
    let compiled: Compiled;
    try {
      const src = edge.conditionExpression ?? '';
      const check = checkExpression(src, this.variables);
      compiled = check.errors.length > 0 ? { ok: false, error: check.errors.join('; ') } : { ok: true, ast: parseExpression(src) };
    } catch (e) {
      if (!(e instanceof ExpressionError)) throw e;
      compiled = { ok: false, error: e.message };
    }
    this.compiled.set(edge.id, compiled);
    return compiled;
  }

  /** The facts an expression can see: visible payload fields and every derived fact set so far. */
  private scopeOf(token: SimulationToken): Record<string, Scalar | undefined> {
    const scope: Record<string, Scalar | undefined> = {};
    for (const v of this.visibleVariables) {
      const source = (v.source === 'PAYLOAD' ? token.payload : token.derived) as unknown as Record<string, Scalar | undefined>;
      scope[v.name] = source[v.name];
    }
    return scope;
  }

  private runXor(token: SimulationToken, node: ProcessNode, step: ExecutionStep): void {
    const edges = this.flowEdges(node);
    if (edges.length === 0) {
      this.log(token, step);
      this.deadEnd(token, node, `The decision '${node.label}' has no outgoing edges, so the transaction stops there.`);
      return;
    }

    const asts = new Map<Id, Ast>();
    for (const edge of edges) {
      if (edge.conditionExpression === undefined) continue;
      const compiled = this.compile(edge);
      if (!compiled.ok) {
        const message = `Condition on edge ${edge.id} out of '${node.label}' is not valid: ${compiled.error}`;
        step.note = message;
        this.log(token, step);
        this.fault(token, 'EXCEPTION', 'INVALID_EXPRESSION', node.id, message);
        this.addAnomaly('INVALID_EXPRESSION', message, { nodeId: node.id, edgeId: edge.id });
        return;
      }
      asts.set(edge.id, compiled.ast);
    }

    const scope = this.scopeOf(token);
    const read = new Set<string>();
    for (const ast of asts.values()) collectIdentifiers(ast).forEach((id) => read.add(id));
    const seen = [...read].map((id) => `${id} = ${formatFact(scope[id])}`);

    let chosen: ProcessEdge | undefined;
    let reason: EdgeReason = 'CONDITION';
    try {
      for (const edge of edges) {
        if (edge.isDefault) continue;
        const ast = asts.get(edge.id);
        if (!ast) {
          chosen = edge;
          reason = 'FLOW';
          break;
        }
        const r = evaluateExpression(ast, scope);
        for (const fact of r.unset) {
          if (!this.unsetReads.some((u) => u.edgeId === edge.id && u.fact === fact)) {
            this.unsetReads.push({ nodeId: node.id, edgeId: edge.id, fact });
          }
        }
        if (r.value) {
          chosen = edge;
          break;
        }
      }
    } catch (e) {
      if (!(e instanceof ExpressionError)) throw e;
      const message = `A condition out of '${node.label}' could not be evaluated: ${e.message}`;
      step.note = message;
      this.log(token, step);
      this.fault(token, 'EXCEPTION', 'INVALID_EXPRESSION', node.id, message);
      this.addAnomaly('INVALID_EXPRESSION', message, { nodeId: node.id });
      return;
    }

    if (!chosen) {
      chosen = edges.find((e) => e.isDefault);
      reason = 'DEFAULT';
    }
    const facts = seen.length ? `${seen.join(', ')}. ` : '';
    if (!chosen) {
      const message = `No branch out of '${node.label}' matched and it has no default edge.`;
      step.note = `${facts}${message}`;
      this.log(token, step);
      this.fault(token, 'EXCEPTION', 'NO_MATCHING_BRANCH', node.id, message);
      this.addAnomaly('NO_MATCHING_BRANCH', message, { nodeId: node.id });
      return;
    }

    step.note =
      reason === 'DEFAULT'
        ? `${facts}No condition matched, so it took the default edge ${chosen.id}.`
        : chosen.conditionExpression !== undefined
          ? `${facts}Took ${chosen.id} because ${chosen.conditionExpression}.`
          : `${facts}Took ${chosen.id} (no condition).`;
    this.log(token, step);
    this.move(token, chosen, reason);
  }

  private runAnd(token: SimulationToken, node: ProcessNode, step: ExecutionStep): void {
    const incoming = this.inEdges.get(node.id) ?? [];
    if (incoming.length < 2) {
      if (this.flowEdges(node).length > 1) step.note = 'Fork: every outgoing branch starts now.';
      this.log(token, step);
      this.advance(token, node, true);
      return;
    }

    // Join: wait here until every incoming edge has delivered a token.
    const byEdge = this.waiting.get(node.id) ?? new Map<Id, SimulationToken[]>();
    this.waiting.set(node.id, byEdge);
    const viaEdge = token.currentEdgeId ?? '(none)';
    byEdge.set(viaEdge, [...(byEdge.get(viaEdge) ?? []), token]);
    token.state = 'WAITING_JOIN';

    const arrived = incoming.filter((e) => (byEdge.get(e.id)?.length ?? 0) > 0).length;
    step.note = `Join: ${arrived} of ${incoming.length} incoming branches have arrived.`;
    this.log(token, step);
    this.emit({ type: 'JOIN_WAITING', tokenId: token.id, nodeId: node.id, arrived, expected: incoming.length });
    if (arrived < incoming.length) return;

    const sources = incoming.map((e) => byEdge.get(e.id)!.shift()!);
    const elapsedMs = Math.max(...sources.map((t) => t.elapsedMs));
    const merged = this.newToken({
      parentTokenId: sources[0]!.id,
      payload: sources[0]!.payload,
      derived: Object.assign({}, ...sources.map((t) => t.derived)) as DerivedFacts,
      currentNodeId: node.id,
      elapsedMs,
    });
    merged.executionPathHistory.push({
      seq: 1,
      nodeId: node.id,
      capability: null,
      viaEdgeId: null,
      enteredAtMs: elapsedMs,
      durationMs: 0,
      factsWritten: {},
      note: `Joined ${sources.length} branches. Waited for the slowest, at ${elapsedMs} ms.`,
    });
    for (const t of sources) t.state = 'COMPLETED'; // retired into the merged token
    this.emit({ type: 'JOIN_RELEASED', nodeId: node.id, mergedTokenId: merged.id, sourceTokenIds: sources.map((t) => t.id), elapsedMs });
    this.emit({ type: 'TOKEN_SPAWNED', tokenId: merged.id, parentTokenId: sources[0]!.id, nodeId: node.id, atMs: elapsedMs });
    this.advance(merged, node, true);
  }

  private runEnd(token: SimulationToken, node: ProcessNode, kind: NodeKind, step: ExecutionStep): void {
    const outcome = kind.config.outcome;
    if (typeof outcome !== 'string' || !OUTCOMES.includes(outcome as Outcome)) {
      const message = `The end event '${node.label}' has no valid outcome (got ${JSON.stringify(outcome)}).`;
      step.note = message;
      this.log(token, step);
      this.fault(token, 'EXCEPTION', 'INVALID_CONFIG', node.id, message);
      this.addAnomaly('INVALID_CONFIG', message, { nodeId: node.id });
      return;
    }
    const reason = typeof kind.config.reasonCode === 'string' && kind.config.reasonCode !== '' ? kind.config.reasonCode : null;
    token.state = 'COMPLETED';
    token.finalOutcome = outcome as Outcome;
    token.finalReasonCode = reason;
    step.note = reason ? `Ended with ${outcome} (reason code ${reason}).` : `Ended with ${outcome}.`;
    this.log(token, step);
    this.emit({ type: 'TOKEN_COMPLETED', tokenId: token.id, nodeId: node.id, outcome: outcome as Outcome, reasonCode: reason });
  }

  // ── finishing ──────────────────────────────────────────────────────────────

  /** Nothing can move. Anything still waiting at a join is stuck for good. */
  private finalize(): void {
    if (this.finished) return;
    for (const [nodeId, byEdge] of this.waiting) {
      const stuck = [...byEdge.values()].flat().filter((t) => t.state === 'WAITING_JOIN');
      if (stuck.length === 0) continue;
      const incoming = this.inEdges.get(nodeId) ?? [];
      const missing = incoming.filter((e) => (byEdge.get(e.id)?.length ?? 0) === 0);
      const from = missing.map((e) => `'${this.labelOf(e.sourceNodeId)}' (edge ${e.id})`).join(' and ');
      const message =
        `The parallel join '${this.labelOf(nodeId)}' is waiting for a branch from ${from}, and it never arrives. ` +
        `An AND join needs a token on every incoming edge.`;
      for (const t of stuck) this.fault(t, 'DEADLOCKED', 'DEAD_END', nodeId, message);
      this.addAnomaly('DEADLOCK', message, { nodeId });
    }
    this.finished = true;
  }

  private describeLoop(token: SimulationToken, node: ProcessNode): string {
    const visits = new Map<Id, number>();
    for (const s of token.executionPathHistory) visits.set(s.nodeId, (visits.get(s.nodeId) ?? 0) + 1);
    let topId = node.id;
    let top = 0;
    for (const [id, count] of visits) {
      if (count > top) {
        top = count;
        topId = id;
      }
    }
    return (
      `The transaction kept circling: it ran over ${token.executionPathHistory.length} steps without finishing, ` +
      `visiting '${this.labelOf(topId)}' ${top} times.`
    );
  }
}
