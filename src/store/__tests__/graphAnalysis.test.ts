import { describe, expect, it } from 'vitest';
import { CONDITION_VARIABLES, REFERENCE_SOLUTIONS } from '../../data/seedChallenges';
import { checkExpression } from '../../engine/expression';
import { factsNotYetSet, upstreamCapabilities } from '../graphAnalysis';
import { fromProcessGraph } from '../graphConversion';

const l1 = fromProcessGraph(REFERENCE_SOLUTIONS[0]!.graph);

describe('upstreamCapabilities', () => {
  it('collects every desk that runs before a node', () => {
    expect([...upstreamCapabilities(l1.nodes, l1.edges, 'n_xor_dcvv')].sort()).toEqual(['DCVV_VERIFIER', 'TOKEN_VAULT']);
    expect([...upstreamCapabilities(l1.nodes, l1.edges, 'n_xor_ledger')].sort()).toEqual(['CORE_LEDGER_CHECK', 'DCVV_VERIFIER', 'TOKEN_VAULT']);
  });

  it('is empty at the start, and never includes the node itself', () => {
    expect(upstreamCapabilities(l1.nodes, l1.edges, 'n_start').size).toBe(0);
    expect(upstreamCapabilities(l1.nodes, l1.edges, 'n_vault').has('TOKEN_VAULT')).toBe(false);
  });

  it('terminates on a loop', () => {
    const looped = [...l1.edges, { ...l1.edges[0]!, id: 'loop', source: 'n_ledger', target: 'n_vault', sourceHandle: 'out', targetHandle: 'in' }];
    const caps = upstreamCapabilities(l1.nodes, looped, 'n_xor_dcvv');
    expect(caps.has('CORE_LEDGER_CHECK')).toBe(true);
  });
});

describe('factsNotYetSet', () => {
  it('flags a fact whose producer is not upstream, and only that one', () => {
    const upstream = upstreamCapabilities(l1.nodes, l1.edges, 'n_xor_dcvv');
    const check = checkExpression("dcvvStatus == 'VALID' && ledgerDecision == 'SUFFICIENT' && riskScore < 50", CONDITION_VARIABLES);
    expect(check.errors).toEqual([]);
    expect(factsNotYetSet(check.identifiers, CONDITION_VARIABLES, upstream)).toEqual([{ name: 'ledgerDecision', producedBy: 'CORE_LEDGER_CHECK' }]);
  });

  it('never warns about payload fields', () => {
    expect(factsNotYetSet(['amount', 'riskScore', 'isVirtual'], CONDITION_VARIABLES, new Set())).toEqual([]);
  });

  it('reports a repeated name once', () => {
    expect(factsNotYetSet(['dcvvStatus', 'dcvvStatus'], CONDITION_VARIABLES, new Set())).toHaveLength(1);
  });
});
