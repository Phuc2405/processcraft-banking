/** Small, pure questions about the learner's diagram that the editor UI asks while they work. */

import type { BankingCapability, ConditionVariable, Id } from '../types/processLearning';
import type { ProcessFlowEdge, ProcessFlowNode } from './graphConversion';

/** Every banking capability that runs somewhere before `nodeId` on at least one path from any node that feeds it. */
export function upstreamCapabilities(
  nodes: readonly ProcessFlowNode[],
  edges: readonly ProcessFlowEdge[],
  nodeId: Id,
): Set<BankingCapability> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const feeders = new Map<Id, Id[]>();
  for (const e of edges) {
    const list = feeders.get(e.target);
    if (list) list.push(e.source);
    else feeders.set(e.target, [e.source]);
  }

  const found = new Set<BankingCapability>();
  const seen = new Set<Id>([nodeId]);
  const stack: Id[] = [nodeId];
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    for (const from of feeders.get(id) ?? []) {
      if (seen.has(from)) continue;
      seen.add(from);
      const capability = byId.get(from)?.data.node.bankingCapability;
      if (capability) found.add(capability);
      stack.push(from);
    }
  }
  return found;
}

export interface UnsetFactWarning {
  name: string;
  producedBy: BankingCapability;
}

/** Names in a condition whose producing node is not upstream, so the fact would still be unset when the condition runs. */
export function factsNotYetSet(
  identifiers: readonly string[],
  variables: readonly ConditionVariable[],
  upstream: ReadonlySet<BankingCapability>,
): UnsetFactWarning[] {
  const warnings: UnsetFactWarning[] = [];
  for (const name of new Set(identifiers)) {
    const v = variables.find((x) => x.name === name);
    if (v?.producedBy && !upstream.has(v.producedBy)) warnings.push({ name, producedBy: v.producedBy });
  }
  return warnings;
}
