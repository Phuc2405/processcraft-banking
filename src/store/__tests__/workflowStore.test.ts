import { describe, expect, it } from 'vitest';
import { LEVELS, REFERENCE_SOLUTIONS } from '../../data/seedChallenges';
import { evaluateChallenge } from '../../engine/evaluator';
import { DEF, graphOf, level, makeEdge, makeNode } from '../../engine/__tests__/graphHelpers';
import type { ChallengeLevel, Id, ProcessGraph } from '../../types/processLearning';
import { findFreeSpot, fromProcessGraph, NODE_FOOTPRINT, toProcessEdge, toProcessGraph } from '../graphConversion';
import {
  checkConnection,
  computePaletteUsage,
  createWorkflowStore,
  paletteBlockReason,
  type WorkflowStore,
} from '../workflowStore';
import { NODE_CATALOG } from '../../data/seedChallenges';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const FIXED_NOW = () => new Date('2026-10-10T03:00:00Z');
const newStore = (config: Parameters<typeof createWorkflowStore>[0] = {}): WorkflowStore =>
  createWorkflowStore({ now: FIXED_NOW, ...config });

/** Layout and bookkeeping that legitimately differ after a trip through React Flow. */
function normalise(g: ProcessGraph): unknown {
  const copy = structuredClone(g) as Partial<ProcessGraph> & { nodes: Array<Record<string, unknown>> };
  delete copy.updatedAt;
  for (const n of copy.nodes) delete n.position;
  return copy;
}

/** Wires two nodes the way a learner's drag does: through React Flow's onConnect. */
function wire(store: WorkflowStore, from: [Id, Id], to: [Id, Id]): void {
  const ok = store.getState().onConnect({ source: from[0], sourceHandle: from[1], target: to[0], targetHandle: to[1] });
  expect(ok, `${from.join('.')} → ${to.join('.')}`).toBe(true);
}

const edgeFrom = (store: WorkflowStore, nodeId: Id, handle: Id) =>
  store.getState().edges.find((e) => e.source === nodeId && e.sourceHandle === handle);

function runToEnd(store: WorkflowStore, testId: Id): void {
  expect(store.getState().startSimulation(testId)).toBe(true);
  for (let i = 0; i < 400 && !store.getState().simulation?.finished; i++) store.getState().stepSimulation();
  expect(store.getState().simulation?.finished).toBe(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// React Flow → ProcessGraph
// ─────────────────────────────────────────────────────────────────────────────

describe('conversion to the pure ProcessGraph', () => {
  it.each(REFERENCE_SOLUTIONS.map((r) => [r.challengeId, r] as const))(
    '%s: reference solution survives the trip through React Flow unchanged',
    (_id, ref) => {
      const lvl = LEVELS.find((l) => l.id === ref.challengeId)!;
      const store = newStore();
      store.getState().loadChallenge(lvl.id);
      store.getState().loadGraph(ref.graph);

      const back = store.getState().getProcessGraph();
      expect(normalise(back)).toEqual(normalise({ ...ref.graph, id: back.id, name: back.name }));
      expect(back.challengeId).toBe(lvl.id);
      expect(back.updatedAt).toBe('2026-10-10T03:00:00.000Z');
    },
  );

  it.each(REFERENCE_SOLUTIONS.map((r) => [r.challengeId, r] as const))(
    '%s: the converted graph still scores 100/100',
    (_id, ref) => {
      const lvl = LEVELS.find((l) => l.id === ref.challengeId)!;
      const store = newStore();
      store.getState().loadChallenge(lvl.id);
      store.getState().loadGraph(ref.graph);

      const direct = evaluateChallenge(ref.graph, lvl);
      const viaStore = store.getState().runEvaluation();

      expect(viaStore.passed).toBe(true);
      expect(viaStore.correctnessScore).toBe(100);
      expect(viaStore.efficiencyScore).toBe(100);
      expect(viaStore.passCount).toBe(direct.passCount);
      expect(viaStore.failCount).toBe(0);
      expect(viaStore.detectedAnomalies.filter((a) => a.severity === 'ERROR')).toEqual([]);
      expect(store.getState().lastEvaluationResult).toBe(viaStore);
    },
  );

  it('produces plain JSON: no undefined keys, no shared references with the store', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_01_virtual_card_dcvv');
    store.getState().loadGraph(REFERENCE_SOLUTIONS[0]!.graph);

    const g = store.getState().getProcessGraph();
    expect(JSON.parse(JSON.stringify(g))).toStrictEqual(g);

    // Editing the returned graph must not reach back into the canvas.
    g.nodes[0]!.label = 'tampered';
    g.nodes[0]!.configParams.outcome = 'APPROVED';
    expect(store.getState().nodes[0]!.data.node.label).not.toBe('tampered');
  });

  it('never writes into the seed data', () => {
    const before = structuredClone(LEVELS[0]!.starterGraph);
    const store = newStore();
    store.getState().loadChallenge('lvl_01_virtual_card_dcvv');
    store.getState().addNode(DEF.VAULT, { x: 10, y: 10 });
    store.getState().onNodesChange([{ type: 'position', id: 'n_start', position: { x: 999, y: 999 } }]);
    expect(LEVELS[0]!.starterGraph).toEqual(before);
  });

  it('resolves an unnamed handle only when the node has one port on that side', () => {
    const g = graphOf(
      [makeNode(DEF.START, 's'), makeNode(DEF.VAULT, 'v'), makeNode(DEF.XOR, 'x')],
      [makeEdge('e1', ['s', 'out'], ['v', 'in'])],
    );
    const { nodes, edges } = fromProcessGraph(g);
    const byId = new Map(nodes.map((n) => [n.id, n]));

    const unnamed = { ...edges[0]!, sourceHandle: null, targetHandle: null };
    expect(toProcessEdge(unnamed, byId)).toMatchObject({ sourcePortId: 'out', targetPortId: 'in' });

    // The XOR has two inputs, so there is nothing safe to guess. The evaluator must see the problem.
    const ambiguous = { ...edges[0]!, target: 'x', targetHandle: null };
    expect(toProcessEdge(ambiguous, byId).targetPortId).toBe('');
    const graph = toProcessGraph(nodes, [ambiguous], { id: 'g', name: 'g' });
    const result = evaluateChallenge(graph, level(1));
    expect(result.detectedAnomalies.some((a) => a.type === 'INVALID_STRUCTURE' && a.edgeId === 'e1')).toBe(true);
  });

  it('gives positions to graphs that have none, and keeps the ones they have', () => {
    const { nodes } = fromProcessGraph(REFERENCE_SOLUTIONS[0]!.graph);
    expect(nodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(true);
    const start = nodes.find((n) => n.id === 'n_start')!;
    expect(start.position).toEqual({ x: 40, y: 200 });
    const spots = new Set(nodes.map((n) => `${n.position.x},${n.position.y}`));
    expect(spots.size).toBe(nodes.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Building a diagram the way a learner does
// ─────────────────────────────────────────────────────────────────────────────

describe('building Level 1 with drag, wire and type', () => {
  function buildLevel1(store: WorkflowStore): void {
    const s = store.getState();
    s.loadChallenge('lvl_01_virtual_card_dcvv');
    const vault = s.addNode(DEF.VAULT, { x: 240, y: 200 })!;
    const dcvv = s.addNode(DEF.DCVV, { x: 480, y: 200 })!;
    const xor1 = s.addNode(DEF.XOR, { x: 700, y: 200 })!;
    const ledger = s.addNode(DEF.LEDGER, { x: 880, y: 120 })!;
    const xor2 = s.addNode(DEF.XOR, { x: 1100, y: 120 })!;
    expect([vault, dcvv, xor1, ledger, xor2].every(Boolean)).toBe(true);

    wire(store, ['n_start', 'out'], [vault, 'in']);
    wire(store, [vault, 'out'], [dcvv, 'in']);
    wire(store, [vault, 'error'], ['n_end_declined', 'in']);
    wire(store, [dcvv, 'out'], [xor1, 'in_1']);
    wire(store, [xor1, 'out_1'], [ledger, 'in']);
    wire(store, [xor1, 'out_2'], ['n_end_declined', 'in']);
    wire(store, [ledger, 'out'], [xor2, 'in_1']);
    wire(store, [xor2, 'out_1'], ['n_end_approved', 'in']);
    wire(store, [xor2, 'out_2'], ['n_end_declined', 'in']);

    const set = store.getState().updateEdge;
    set(edgeFrom(store, xor1, 'out_1')!.id, { conditionExpression: "dcvvStatus == 'VALID'" });
    set(edgeFrom(store, xor1, 'out_2')!.id, { isDefault: true });
    set(edgeFrom(store, xor2, 'out_1')!.id, { conditionExpression: "ledgerDecision == 'SUFFICIENT'" });
    set(edgeFrom(store, xor2, 'out_2')!.id, { isDefault: true });
  }

  it('grades 100/100 with the same score as the reference solution', () => {
    const store = newStore();
    buildLevel1(store);
    // Starter nodes can be dragged without breaking the "unchanged starter node" rule.
    store.getState().onNodesChange([{ type: 'position', id: 'n_start', position: { x: 10, y: 10 } }]);

    const result = store.getState().runEvaluation();
    expect(result.detectedAnomalies.filter((a) => a.severity === 'ERROR')).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.correctnessScore).toBe(100);
    expect(result.efficiencyScore).toBe(100);
  });

  it('the pure graph carries what was typed: ports, conditions, defaults, priorities', () => {
    const store = newStore();
    buildLevel1(store);
    const g = store.getState().getProcessGraph();

    const xor1 = g.nodes.find((n) => n.definitionId === DEF.XOR)!;
    const leaving = g.edges.filter((e) => e.sourceNodeId === xor1.id).sort((a, b) => a.sourcePortId.localeCompare(b.sourcePortId));
    expect(leaving).toHaveLength(2);
    expect(leaving[0]).toMatchObject({ sourcePortId: 'out_1', targetPortId: 'in', conditionExpression: "dcvvStatus == 'VALID'", priority: 1 });
    expect(leaving[1]).toMatchObject({ sourcePortId: 'out_2', targetNodeId: 'n_end_declined', isDefault: true, priority: 2 });
    expect(leaving[1]).not.toHaveProperty('conditionExpression');

    const starter = g.nodes.filter((n) => n.locked).map((n) => n.id);
    expect(starter.sort()).toEqual(['n_end_approved', 'n_end_declined', 'n_start']);
  });

  it('a wrong diagram fails with a diagnosis, not an exception', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_01_virtual_card_dcvv');
    const result = store.getState().runEvaluation();
    expect(result.passed).toBe(false);
    expect(result.correctnessScore).toBeLessThan(100);
    expect(result.feedbackLogs.length).toBeGreaterThan(0);
  });

  it('typing a different condition changes the grade (the edit really reaches the engine)', () => {
    const store = newStore();
    buildLevel1(store);
    const xor1 = store.getState().nodes.find((n) => n.data.node.definitionId === DEF.XOR)!.id;
    store.getState().updateEdge(edgeFrom(store, xor1, 'out_1')!.id, { conditionExpression: "dcvvStatus == 'EXPIRED'" });
    expect(store.getState().isEvaluationStale).toBe(true);
    expect(store.getState().runEvaluation().passed).toBe(false);
    expect(store.getState().isEvaluationStale).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Palette rules
// ─────────────────────────────────────────────────────────────────────────────

describe('palette limits', () => {
  it('lists only what the level allows, and starter nodes are free', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_01_virtual_card_dcvv');
    const usage = computePaletteUsage(store.getState().level, store.getState().nodes);
    expect(usage.placed).toBe(0);
    expect(usage.budget).toBe(8);
    expect(usage.rows.map((r) => r.definitionId)).toEqual([DEF.VAULT, DEF.DCVV, DEF.LEDGER, DEF.XOR]);
    expect(usage.rows.find((r) => r.definitionId === DEF.XOR)).toMatchObject({ used: 0, max: 3, remaining: 3 });
  });

  it('refuses a node type the level does not offer', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_01_virtual_card_dcvv');
    expect(store.getState().addNode(DEF.AND, { x: 0, y: 0 })).toBeNull();
    expect(store.getState().notice?.message).toMatch(/not available on this level/);
    expect(store.getState().nodes).toHaveLength(3);
  });

  it('refuses a fourth XOR (cap 3) and a second Token Vault (cap 1)', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_01_virtual_card_dcvv');
    for (let i = 0; i < 3; i++) expect(store.getState().addNode(DEF.XOR, { x: i * 50, y: 0 })).not.toBeNull();
    expect(store.getState().addNode(DEF.XOR, { x: 0, y: 0 })).toBeNull();
    expect(store.getState().notice?.message).toMatch(/allows 3 'Decision \(XOR\)' nodes/);

    expect(store.getState().addNode(DEF.VAULT, { x: 0, y: 0 })).not.toBeNull();
    expect(store.getState().addNode(DEF.VAULT, { x: 0, y: 0 })).toBeNull();
    expect(store.getState().notice?.message).toMatch(/allows 1 'Token Vault Lookup' node\./);
  });

  it('enforces the total budget separately from per-type caps', () => {
    const tight: ChallengeLevel = {
      ...structuredClone(level(1)),
      id: 'lvl_tight',
      allowedNodePalette: { entries: [{ nodeDefinitionId: DEF.XOR, maxCount: null }], totalNodeBudget: 2 },
    };
    const store = newStore({ levels: [tight] });
    expect(store.getState().addNode(DEF.XOR, { x: 0, y: 0 })).not.toBeNull();
    expect(store.getState().addNode(DEF.XOR, { x: 0, y: 0 })).not.toBeNull();
    expect(store.getState().addNode(DEF.XOR, { x: 0, y: 0 })).toBeNull();
    expect(store.getState().notice?.message).toMatch(/budget/i);
    expect(computePaletteUsage(tight, store.getState().nodes).rows[0]).toMatchObject({ used: 2, max: null, remaining: 0 });
    expect(paletteBlockReason(tight, NODE_CATALOG, store.getState().nodes, DEF.XOR)).toMatch(/budget/i);
  });

  it('frees a slot when a node is deleted', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_01_virtual_card_dcvv');
    const id = store.getState().addNode(DEF.VAULT, { x: 0, y: 0 })!;
    expect(store.getState().addNode(DEF.VAULT, { x: 0, y: 0 })).toBeNull();
    expect(store.getState().removeNode(id)).toBe(true);
    expect(store.getState().addNode(DEF.VAULT, { x: 0, y: 0 })).not.toBeNull();
  });

  it('gives each new node a unique id, a copy of the default config, and selects it', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_02_three_ds_routing');
    const a = store.getState().addNode(DEF.END, { x: 0, y: 0 })!;
    const b = store.getState().addNode(DEF.END, { x: 100, y: 0 })!;
    expect(a).not.toBe(b);
    const nodes = store.getState().nodes;
    expect(nodes.filter((n) => n.selected).map((n) => n.id)).toEqual([b]);
    expect(nodes.find((n) => n.id === a)!.data.node.configParams).toEqual({ outcome: 'DECLINED', reasonCode: '' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Locked starter nodes
// ─────────────────────────────────────────────────────────────────────────────

describe('locked starter nodes', () => {
  it('cannot be deleted by React Flow, by removeNode, or edited', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_01_virtual_card_dcvv');

    store.getState().onNodesChange([{ type: 'remove', id: 'n_end_approved' }]);
    expect(store.getState().nodes.some((n) => n.id === 'n_end_approved')).toBe(true);
    expect(store.getState().notice?.kind).toBe('warn');

    expect(store.getState().removeNode('n_start')).toBe(false);
    expect(store.getState().updateNodeConfig('n_end_approved', 'outcome', 'DECLINED')).toBe(false);
    expect(store.getState().updateNodeLabel('n_end_approved', 'Hacked')).toBe(false);

    const g = store.getState().getProcessGraph();
    expect(g.nodes.find((n) => n.id === 'n_end_approved')).toMatchObject({ label: 'Approved', configParams: { outcome: 'APPROVED' }, locked: true });
    expect(store.getState().nodes.find((n) => n.id === 'n_start')!.deletable).toBe(false);
  });

  it('may still be dragged', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_01_virtual_card_dcvv');
    store.getState().onNodesChange([{ type: 'position', id: 'n_start', position: { x: 5, y: 6 } }]);
    expect(store.getState().getProcessGraph().nodes.find((n) => n.id === 'n_start')!.position).toEqual({ x: 5, y: 6 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wiring rules
// ─────────────────────────────────────────────────────────────────────────────

describe('wiring', () => {
  const fresh = () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_01_virtual_card_dcvv');
    const vault = store.getState().addNode(DEF.VAULT, { x: 200, y: 200 })!;
    const xor = store.getState().addNode(DEF.XOR, { x: 400, y: 200 })!;
    return { store, vault, xor };
  };

  it('accepts output → input and refuses everything else with a reason', () => {
    const { store, vault, xor } = fresh();
    const check = (c: Parameters<typeof checkConnection>[2]) => checkConnection(store.getState().nodes, store.getState().edges, c);

    expect(check({ source: 'n_start', sourceHandle: 'out', target: vault, targetHandle: 'in' }).ok).toBe(true);
    expect(check({ source: vault, sourceHandle: 'out', target: vault, targetHandle: 'in' })).toMatchObject({ ok: false, reason: expect.stringMatching(/itself/) });
    expect(check({ source: vault, sourceHandle: 'in', target: xor, targetHandle: 'in_1' })).toMatchObject({ ok: false, reason: expect.stringMatching(/output handle/) });
    expect(check({ source: vault, sourceHandle: 'out', target: xor, targetHandle: 'out_1' })).toMatchObject({ ok: false, reason: expect.stringMatching(/input handle/) });
    expect(check({ source: 'n_end_approved', sourceHandle: 'in', target: vault, targetHandle: 'in' }).ok).toBe(false);
    expect(check({ source: 'ghost', sourceHandle: 'out', target: vault, targetHandle: 'in' }).ok).toBe(false);
    expect(check({ source: vault, sourceHandle: 'nope', target: xor, targetHandle: 'in_1' }).ok).toBe(false);
  });

  it('allows one wire per output port, and merges into an input up to its limit', () => {
    const { store, vault, xor } = fresh();
    wire(store, [vault, 'out'], [xor, 'in_1']);
    expect(store.getState().onConnect({ source: vault, sourceHandle: 'out', target: xor, targetHandle: 'in_2' })).toBe(false);
    expect(store.getState().notice?.message).toMatch(/already has a connection/);

    // XOR input in_1 takes exactly one wire.
    wire(store, [vault, 'error'], [xor, 'in_2']);
    expect(store.getState().canConnect({ source: 'n_start', sourceHandle: 'out', target: xor, targetHandle: 'in_1' })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/is full/),
    });

    // An End event's input takes many.
    wire(store, [xor, 'out_1'], ['n_end_declined', 'in']);
    wire(store, [xor, 'out_2'], ['n_end_declined', 'in']);
    expect(store.getState().edges.filter((e) => e.target === 'n_end_declined')).toHaveLength(2);
  });

  it('numbers XOR branches in the order they were drawn, leaving other edges unnumbered', () => {
    const { store, vault, xor } = fresh();
    wire(store, [vault, 'out'], [xor, 'in_1']);
    wire(store, [xor, 'out_2'], ['n_end_declined', 'in']);
    wire(store, [xor, 'out_1'], ['n_end_approved', 'in']);
    const g = store.getState().getProcessGraph();
    expect(g.edges.find((e) => e.sourcePortId === 'out' )!.priority).toBeUndefined();
    expect(g.edges.find((e) => e.sourcePortId === 'out_2')!.priority).toBe(1);
    expect(g.edges.find((e) => e.sourcePortId === 'out_1')!.priority).toBe(2);
  });

  it('selects a freshly drawn XOR branch so its condition editor opens', () => {
    const { store, vault, xor } = fresh();
    wire(store, [vault, 'out'], [xor, 'in_1']);
    expect(store.getState().edges.filter((e) => e.selected)).toHaveLength(0);
    wire(store, [xor, 'out_1'], ['n_end_approved', 'in']);
    expect(store.getState().edges.filter((e) => e.selected).map((e) => e.sourceHandle)).toEqual(['out_1']);
  });

  it('deleting a node takes its wires with it', () => {
    const { store, vault, xor } = fresh();
    wire(store, [vault, 'out'], [xor, 'in_1']);
    wire(store, ['n_start', 'out'], [vault, 'in']);
    store.getState().onNodesChange([{ type: 'remove', id: vault }]);
    expect(store.getState().edges).toHaveLength(0);
    expect(store.getState().nodes.some((n) => n.id === vault)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge conditions
// ─────────────────────────────────────────────────────────────────────────────

describe('edge conditions', () => {
  function xorWithTwoBranches() {
    const store = newStore();
    store.getState().loadChallenge('lvl_01_virtual_card_dcvv');
    const xor = store.getState().addNode(DEF.XOR, { x: 400, y: 200 })!;
    const vault = store.getState().addNode(DEF.VAULT, { x: 200, y: 200 })!;
    wire(store, [xor, 'out_1'], ['n_end_approved', 'in']);
    wire(store, [xor, 'out_2'], ['n_end_declined', 'in']);
    wire(store, [vault, 'out'], ['n_end_declined', 'in']);
    return { store, xor, vault, a: edgeFrom(store, xor, 'out_1')!.id, b: edgeFrom(store, xor, 'out_2')!.id, plain: edgeFrom(store, vault, 'out')!.id };
  }

  it('keeps one default per gateway: promoting an edge demotes the old default', () => {
    const { store, a, b } = xorWithTwoBranches();
    store.getState().updateEdge(a, { isDefault: true });
    store.getState().updateEdge(b, { isDefault: true });
    const d = (id: Id) => store.getState().edges.find((e) => e.id === id)!.data;
    expect(d(a)?.isDefault).toBeUndefined();
    expect(d(b)?.isDefault).toBe(true);
  });

  it('a default has no condition, and writing a condition makes it a normal branch', () => {
    const { store, a } = xorWithTwoBranches();
    store.getState().updateEdge(a, { conditionExpression: 'riskScore < 40' });
    store.getState().updateEdge(a, { isDefault: true });
    expect(store.getState().edges.find((e) => e.id === a)!.data).toMatchObject({ isDefault: true });
    expect(store.getState().edges.find((e) => e.id === a)!.data).not.toHaveProperty('conditionExpression');

    store.getState().updateEdge(a, { conditionExpression: 'riskScore < 40' });
    const data = store.getState().edges.find((e) => e.id === a)!.data!;
    expect(data.conditionExpression).toBe('riskScore < 40');
    expect(data.isDefault).toBeUndefined();
  });

  it('clears a condition when the text is emptied, and the graph then omits the key', () => {
    const { store, a } = xorWithTwoBranches();
    store.getState().updateEdge(a, { conditionExpression: 'riskScore < 40' });
    store.getState().updateEdge(a, { conditionExpression: '   ' });
    expect(store.getState().getProcessGraph().edges.find((e) => e.id === a)).not.toHaveProperty('conditionExpression');
  });

  it('ignores conditions on edges that do not leave an XOR, but keeps their label', () => {
    const { store, plain } = xorWithTwoBranches();
    store.getState().updateEdge(plain, { conditionExpression: 'riskScore < 40', isDefault: true, priority: 9, label: 'unknown DPAN' });
    const e = store.getState().getProcessGraph().edges.find((x) => x.id === plain)!;
    expect(e.label).toBe('unknown DPAN');
    expect(e).not.toHaveProperty('conditionExpression');
    expect(e).not.toHaveProperty('isDefault');
    expect(e).not.toHaveProperty('priority');
  });

  it('lets the learner reorder branches with priority', () => {
    const { store, a, b } = xorWithTwoBranches();
    store.getState().updateEdge(a, { priority: 5 });
    store.getState().updateEdge(b, { priority: 2 });
    const g = store.getState().getProcessGraph();
    expect(g.edges.find((e) => e.id === a)!.priority).toBe(5);
    expect(g.edges.find((e) => e.id === b)!.priority).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Node settings
// ─────────────────────────────────────────────────────────────────────────────

describe('node settings', () => {
  it('writes known settings, rejects unknown keys, and the evaluator sees the value', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_02_three_ds_routing');
    const id = store.getState().addNode(DEF.THREE_DS, { x: 0, y: 0 })!;
    expect(store.getState().updateNodeConfig(id, 'frictionlessBelow', 25)).toBe(true);
    expect(store.getState().updateNodeConfig(id, 'notASetting', 1)).toBe(false);
    expect(store.getState().getProcessGraph().nodes.find((n) => n.id === id)!.configParams.frictionlessBelow).toBe(25);
  });

  it('keeps the evaluator in charge of what a legal value is', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_02_three_ds_routing');
    const id = store.getState().addNode(DEF.THREE_DS, { x: 0, y: 0 })!;
    store.getState().updateNodeConfig(id, 'frictionlessBelow', 90);
    store.getState().updateNodeConfig(id, 'rejectAtOrAbove', 10);
    const result = store.getState().runEvaluation();
    expect(result.detectedAnomalies.some((a) => a.type === 'INVALID_CONFIG' && a.nodeId === id)).toBe(true);
  });

  it('renames a node, falling back to the catalog name for an empty label', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_01_virtual_card_dcvv');
    const id = store.getState().addNode(DEF.XOR, { x: 0, y: 0 })!;
    store.getState().updateNodeLabel(id, 'dCVV ok?');
    expect(store.getState().nodes.find((n) => n.id === id)!.data.node.label).toBe('dCVV ok?');
    store.getState().updateNodeLabel(id, '  ');
    expect(store.getState().nodes.find((n) => n.id === id)!.data.node.label).toBe('Decision (XOR)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stale state
// ─────────────────────────────────────────────────────────────────────────────

describe('stale results', () => {
  it('layout-only changes keep the grade and the playback; structural changes drop both', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_01_virtual_card_dcvv');
    store.getState().loadGraph(REFERENCE_SOLUTIONS[0]!.graph);
    store.getState().runEvaluation();
    expect(store.getState().startSimulation('L1-T1')).toBe(true);
    store.getState().stepSimulation();

    store.getState().onNodesChange([
      { type: 'position', id: 'n_vault', position: { x: 1, y: 2 } },
      { type: 'select', id: 'n_vault', selected: true },
      { type: 'dimensions', id: 'n_vault', dimensions: { width: 200, height: 100 } },
    ]);
    expect(store.getState().isEvaluationStale).toBe(false);
    expect(store.getState().simulation).not.toBeNull();
    expect(store.getState().currentTick).toBe(1);

    store.getState().updateEdge('e8', { conditionExpression: "ledgerDecision == 'INSUFFICIENT_FUNDS'" });
    expect(store.getState().isEvaluationStale).toBe(true);
    expect(store.getState().simulation).toBeNull();
    expect(store.getState().isRunning).toBe(false);
    expect(store.getState().activeTokens).toEqual([]);
    // The old grade is kept on screen (flagged stale) rather than vanishing.
    expect(store.getState().lastEvaluationResult).not.toBeNull();
  });

  it('loading another level wipes grade, playback and notices', () => {
    const store = newStore();
    store.getState().loadGraph(REFERENCE_SOLUTIONS[0]!.graph);
    store.getState().runEvaluation();
    store.getState().startSimulation('L1-T1');
    expect(store.getState().loadChallenge('lvl_03_eod_recon_suspense')).toBe(true);
    const s = store.getState();
    expect(s.level.id).toBe('lvl_03_eod_recon_suspense');
    expect(s.nodes).toEqual([]);
    expect(s.lastEvaluationResult).toBeNull();
    expect(s.simulation).toBeNull();
    expect(s.selectedTestId).toBe('L3-T1');
    expect(store.getState().loadChallenge('nope')).toBe(false);
    expect(store.getState().level.id).toBe('lvl_03_eod_recon_suspense');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Playback
// ─────────────────────────────────────────────────────────────────────────────

describe('playback', () => {
  it('shows the token at the start event before the first step, then moves it along the first wire', () => {
    const store = newStore();
    store.getState().loadGraph(REFERENCE_SOLUTIONS[0]!.graph);
    store.getState().startSimulation('L1-T1');

    let s = store.getState();
    expect(s.isRunning).toBe(true);
    expect(s.currentTick).toBe(0);
    expect(s.activeTokens).toHaveLength(1);
    expect(s.nodeRuntime.n_start).toMatchObject({ status: 'QUEUED', queue: 1 });

    s.stepSimulation();
    s = store.getState();
    expect(s.currentTick).toBe(1);
    expect(s.nodeRuntime.n_start).toMatchObject({ status: 'PROCESSING', visits: 1, queue: 0 });
    expect(s.nodeRuntime.n_vault).toMatchObject({ status: 'QUEUED', queue: 1 });
    expect(s.activeEdgeIds).toEqual(['e1']);
    expect(s.playbackLog.some((l) => l.text.includes("'Payment Request' → 'Token Vault Lookup'"))).toBe(true);

    s.stepSimulation();
    s = store.getState();
    expect(s.nodeRuntime.n_vault).toMatchObject({ status: 'PROCESSING', visits: 1, lastDurationMs: 12 });
    expect(s.traversedEdgeIds).toEqual(['e1', 'e2']);
  });

  it.each(LEVELS.map((l) => [l.id, l] as const))('%s: every visible test plays through to the expected outcome', (_id, lvl) => {
    const ref = REFERENCE_SOLUTIONS.find((r) => r.challengeId === lvl.id)!;
    const store = newStore();
    store.getState().loadChallenge(lvl.id);
    store.getState().loadGraph(ref.graph);
    const visible = lvl.testSuite.filter((t) => !t.hidden);
    expect(visible.length).toBeGreaterThan(0);

    for (const t of visible) {
      runToEnd(store, t.id);
      const sim = store.getState().simulation!;
      expect(sim.outcome, t.id).toBe(t.expectedOutcome);
      expect(sim.matchesExpected, t.id).toBe(true);
      expect(store.getState().isRunning).toBe(false);
      const endRuntimes = Object.values(store.getState().nodeRuntime).filter((r) => r.status === 'DONE');
      expect(endRuntimes.length, t.id).toBeGreaterThan(0);
    }
  });

  it('never replays a hidden test, which would show its payload', () => {
    const store = newStore();
    store.getState().loadGraph(REFERENCE_SOLUTIONS[0]!.graph);
    expect(store.getState().startSimulation('L1-T5')).toBe(false);
    expect(store.getState().simulation).toBeNull();
    expect(store.getState().notice?.message).toMatch(/Hidden tests/);
    store.getState().selectTest('L1-T5');
    expect(store.getState().selectedTestId).not.toBe('L1-T5');
  });

  it('shows a fork, a waiting join and its release', () => {
    const g: ProcessGraph = graphOf(
      [
        makeNode(DEF.START, 'n_start'),
        makeNode(DEF.AND, 'n_fork', 'Fork'),
        makeNode(DEF.VAULT, 'n_vault'),
        makeNode(DEF.DCVV, 'n_dcvv'),
        makeNode(DEF.AND, 'n_join', 'Join'),
        makeNode(DEF.END, 'n_end', 'Approved', { outcome: 'APPROVED' }),
      ],
      [
        makeEdge('e1', ['n_start', 'out'], ['n_fork', 'in_1']),
        makeEdge('e2', ['n_fork', 'out_1'], ['n_vault', 'in']),
        makeEdge('e3', ['n_fork', 'out_2'], ['n_dcvv', 'in']),
        makeEdge('e4', ['n_vault', 'out'], ['n_join', 'in_1']),
        makeEdge('e5', ['n_dcvv', 'out'], ['n_join', 'in_2']),
        makeEdge('e6', ['n_join', 'out_1'], ['n_end', 'in']),
      ],
    );
    const store = newStore();
    store.getState().loadGraph(g);
    store.getState().startSimulation('L1-T1');

    const seen = { forked: false, waiting: false, released: false };
    for (let i = 0; i < 40 && !store.getState().simulation?.finished; i++) {
      store.getState().stepSimulation();
      const s = store.getState();
      if (s.activeTokens.filter((t) => t.state === 'ACTIVE').length === 2) seen.forked = true;
      if (s.nodeRuntime.n_join?.status === 'WAITING' && s.nodeRuntime.n_join.joinWaiting?.arrived === 1 && s.nodeRuntime.n_join.joinWaiting.expected === 2) seen.waiting = true;
      if (s.playbackLog.some((l) => l.kind === 'join' && l.text.includes('released'))) seen.released = true;
    }
    expect(seen).toEqual({ forked: true, waiting: true, released: true });
    expect(store.getState().nodeRuntime.n_join?.joinWaiting).toBeNull();
    expect(store.getState().nodeRuntime.n_end?.status).toBe('DONE');
  });

  it('shows a stuck join as a fault instead of hanging', () => {
    const g: ProcessGraph = graphOf(
      [
        makeNode(DEF.START, 'n_start'),
        makeNode(DEF.VAULT, 'n_vault'),
        makeNode(DEF.AND, 'n_join', 'Join'),
        makeNode(DEF.END, 'n_end', 'Approved', { outcome: 'APPROVED' }),
      ],
      [
        makeEdge('e1', ['n_start', 'out'], ['n_vault', 'in']),
        makeEdge('e2', ['n_vault', 'out'], ['n_join', 'in_1']),
        // The vault's error port only fires on an unknown DPAN, so this second branch never delivers.
        makeEdge('e3', ['n_vault', 'error'], ['n_join', 'in_2']),
        makeEdge('e4', ['n_join', 'out_1'], ['n_end', 'in']),
      ],
    );
    const store = newStore();
    store.getState().loadGraph(g);
    runToEnd(store, 'L1-T1');
    const sim = store.getState().simulation!;
    expect(sim.matchesExpected).toBe(false);
    expect(sim.anomalies.some((a) => a.type === 'DEADLOCK')).toBe(true);
    expect(store.getState().nodeRuntime.n_join?.status).toBe('FROZEN');
  });

  it('pause and resume only act on a live run', () => {
    const store = newStore();
    store.getState().loadGraph(REFERENCE_SOLUTIONS[0]!.graph);
    store.getState().resumeSimulation();
    expect(store.getState().isRunning).toBe(false);

    store.getState().startSimulation('L1-T1');
    store.getState().pauseSimulation();
    expect(store.getState().isRunning).toBe(false);
    store.getState().resumeSimulation();
    expect(store.getState().isRunning).toBe(true);

    store.getState().resetSimulation();
    expect(store.getState().simulation).toBeNull();
    expect(store.getState().activeTokens).toEqual([]);
    expect(store.getState().nodeRuntime).toEqual({});
  });

  it('"step" with no run loaded starts one paused', () => {
    const store = newStore();
    store.getState().loadGraph(REFERENCE_SOLUTIONS[0]!.graph);
    store.getState().stepSimulation();
    expect(store.getState().simulation).not.toBeNull();
    expect(store.getState().isRunning).toBe(false);
    expect(store.getState().currentTick).toBe(0);
  });

  it('a diagram with no Start event finishes immediately with a clear anomaly', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_02_three_ds_routing');
    expect(store.getState().startSimulation('L2-T01')).toBe(true);
    expect(store.getState().simulation?.finished).toBe(true);
    expect(store.getState().isRunning).toBe(false);
    expect(store.getState().simulation?.anomalies.some((a) => a.type === 'MISSING_START_EVENT')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Click-to-add placement
// ─────────────────────────────────────────────────────────────────────────────

describe('findFreeSpot', () => {
  const size = NODE_FOOTPRINT.task;
  const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
    a.x < b.x + size.width && b.x < a.x + size.width && a.y < b.y + size.height && b.y < a.y + size.height;

  it('uses the exact spot when it is free', () => {
    expect(findFreeSpot([], { x: 300, y: 200 }, size)).toEqual({ x: 300, y: 200 });
  });

  it('slides to a gap when the spot is taken, and keeps doing so for each new node', () => {
    const store = newStore();
    store.getState().loadChallenge('lvl_02_three_ds_routing');
    const around = { x: 300, y: 200 };
    const placed: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 6; i++) {
      const spot = findFreeSpot(store.getState().nodes, around, size);
      expect(placed.some((p) => overlaps(p, spot)), `node ${i} overlaps an earlier one`).toBe(false);
      placed.push(spot);
      store.getState().addNode(i % 2 ? DEF.XOR : DEF.END, spot);
    }
    expect(new Set(placed.map((p) => `${p.x},${p.y}`)).size).toBe(6);
  });
});
