/**
 * Small builders shared by the engine tests. Not a test file itself.
 */

import { LEVELS, NODE_CATALOG, REFERENCE_SOLUTIONS } from '../../data/seedChallenges';
import type {
  BankingPayload,
  ChallengeLevel,
  ConfigValue,
  Id,
  ProcessEdge,
  ProcessGraph,
  ProcessNode,
  TestCase,
} from '../../types/processLearning';

/** Node definition ids, so tests read as intent rather than strings. */
export const DEF = {
  START: 'nd_start_payment',
  END: 'nd_end_outcome',
  XOR: 'nd_gateway_xor',
  AND: 'nd_gateway_and',
  VAULT: 'nd_token_vault',
  DCVV: 'nd_dcvv_verifier',
  THREE_DS: 'nd_three_ds_evaluator',
  LEDGER: 'nd_core_ledger_check',
  RECON: 'nd_recon_desk',
  BNPL: 'nd_bnpl_underwriter',
  START_A2A: 'nd_start_a2a',
  A2A: 'nd_a2a_gateway',
  AML: 'nd_aml_screening',
  CASE: 'nd_case_investigation',
  CHARGEBACK: 'nd_chargeback_desk',
} as const;

/** Levels by number, 1 to 10. */
export const level = (n: number): ChallengeLevel => {
  const found = LEVELS.find((l) => l.levelNumber === n);
  if (!found) throw new Error(`No level ${n}`);
  return found;
};

export function testById(lvl: ChallengeLevel, id: Id): TestCase {
  const t = lvl.testSuite.find((x) => x.id === id);
  if (!t) throw new Error(`No test ${id} in ${lvl.id}`);
  return t;
}

/** A private copy of a level's reference graph, safe to break. */
export function referenceGraph(lvl: ChallengeLevel): ProcessGraph {
  const ref = REFERENCE_SOLUTIONS.find((r) => r.challengeId === lvl.id);
  if (!ref) throw new Error(`No reference solution for ${lvl.id}`);
  return structuredClone(ref.graph);
}

export function makeNode(
  definitionId: Id,
  id: Id,
  label?: string,
  config: Record<string, ConfigValue> = {},
): ProcessNode {
  const d = NODE_CATALOG.find((x) => x.id === definitionId);
  if (!d) throw new Error(`Unknown node definition ${definitionId}`);
  return {
    id,
    definitionId,
    type: d.type,
    label: label ?? d.label,
    bankingCapability: d.bankingCapability,
    inputPorts: d.inputPorts.map((p) => ({ ...p })),
    outputPorts: d.outputPorts.map((p) => ({ ...p })),
    configParams: { ...Object.fromEntries(d.configSchema.map((c) => [c.key, c.defaultValue])), ...config },
  };
}

export function makeEdge(
  id: Id,
  from: [nodeId: Id, portId: Id],
  to: [nodeId: Id, portId: Id],
  opts: { when?: string; isDefault?: boolean; priority?: number } = {},
): ProcessEdge {
  return {
    id,
    sourceNodeId: from[0],
    sourcePortId: from[1],
    targetNodeId: to[0],
    targetPortId: to[1],
    ...(opts.when !== undefined ? { conditionExpression: opts.when } : {}),
    ...(opts.isDefault ? { isDefault: true } : {}),
    ...(opts.priority !== undefined ? { priority: opts.priority } : {}),
  };
}

export const graphOf = (nodes: ProcessNode[], edges: ProcessEdge[], id: Id = 'g_test'): ProcessGraph => ({
  id,
  name: id,
  nodes,
  edges,
});

export function removeNodes(graph: ProcessGraph, ...ids: Id[]): void {
  graph.nodes = graph.nodes.filter((n) => !ids.includes(n.id));
  graph.edges = graph.edges.filter((e) => !ids.includes(e.sourceNodeId) && !ids.includes(e.targetNodeId));
}

export function removeEdges(graph: ProcessGraph, ...ids: Id[]): void {
  graph.edges = graph.edges.filter((e) => !ids.includes(e.id));
}

export function nodeOf(graph: ProcessGraph, id: Id): ProcessNode {
  const n = graph.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`No node ${id}`);
  return n;
}

export function edgeOf(graph: ProcessGraph, id: Id): ProcessEdge {
  const e = graph.edges.find((x) => x.id === id);
  if (!e) throw new Error(`No edge ${id}`);
  return e;
}

/** Wraps a payload in an ad-hoc test case for runner-level tests. */
export function adHocTest(payload: BankingPayload, over: Partial<TestCase> = {}): TestCase {
  return {
    id: 'ADHOC',
    name: 'ad hoc',
    inputPayload: payload,
    expectedOutcome: 'APPROVED',
    maxLatencyMs: 10_000,
    ...over,
  };
}

/** A copy of a seed test's payload with some fields changed. */
export function payloadFrom(lvl: ChallengeLevel, testId: Id, over: Partial<BankingPayload> = {}): BankingPayload {
  return { ...structuredClone(testById(lvl, testId).inputPayload), ...over };
}
