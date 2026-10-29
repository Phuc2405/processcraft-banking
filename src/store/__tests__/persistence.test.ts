import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEVELS, NODE_CATALOG, REFERENCE_SOLUTIONS } from '../../data/seedChallenges';
import { evaluateChallenge } from '../../engine/evaluator';
import { level } from '../../engine/__tests__/graphHelpers';
import type { Id, ProcessGraph } from '../../types/processLearning';
import {
  ACTIVE_LEVEL_KEY,
  browserStorage,
  decodeDiagram,
  diagramBody,
  diagramKey,
  encodeDiagram,
  memoryStorage,
  pristineBody,
  type KeyValueStorage,
} from '../persistence';
import { fromProcessGraph, toProcessGraph } from '../graphConversion';
import { createWorkflowStore, type WorkflowStore } from '../workflowStore';

const L1 = level(1);
const L2 = level(2);
const L3 = level(3);
const NOW = () => new Date('2026-10-10T03:00:00Z');
const DELAY = 400;

const open = (storage: KeyValueStorage | null, over: Parameters<typeof createWorkflowStore>[0] = {}): WorkflowStore =>
  createWorkflowStore({ now: NOW, storage, autosaveDelayMs: DELAY, ...over });

const referenceOf = (levelId: Id): ProcessGraph => structuredClone(REFERENCE_SOLUTIONS.find((r) => r.challengeId === levelId)!.graph);
const saved = (storage: ReturnType<typeof memoryStorage>, levelId: Id) => {
  const raw = storage.getItem(diagramKey(levelId));
  return raw === null ? null : (JSON.parse(raw) as { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>>; savedAt: string });
};
const passes = (store: WorkflowStore): number => evaluateChallenge(store.getState().getProcessGraph(), store.getState().level).correctnessScore;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// Encoding and decoding

describe('encode and decode', () => {
  it.each(REFERENCE_SOLUTIONS.map((r) => [r.challengeId, r] as const))('%s: a saved reference solution comes back as the same graph', (_id, ref) => {
    const lvl = LEVELS.find((l) => l.id === ref.challengeId)!;
    const { nodes, edges } = fromProcessGraph(ref.graph);
    const raw = encodeDiagram({ level: lvl, nodes, edges }, '2026-10-10T03:00:00Z');

    const restored = decodeDiagram(raw, lvl, NODE_CATALOG)!;

    expect(restored.dropped).toBe(0);
    expect(restored.savedAt).toBe('2026-10-10T03:00:00Z');
    const byId = <T extends { id: string }>(list: T[]): T[] => [...list].sort((a, b) => a.id.localeCompare(b.id));
    const expected = toProcessGraph(nodes, edges, { id: 'x', name: 'x' });
    expect(byId(restored.graph.nodes)).toEqual(byId(expected.nodes));
    expect(restored.graph.edges).toEqual(ref.graph.edges);
    expect(evaluateChallenge(restored.graph, lvl).correctnessScore).toBe(100);
  });

  it('keeps what the learner typed: custom conditions, default flags, priorities, labels, settings and positions', () => {
    const ref = referenceOf(L3.id);
    ref.edges.find((e) => e.id === 'e3')!.conditionExpression = "reconStatus == 'MATCHED' && amount < 100000";
    ref.edges.find((e) => e.id === 'e3')!.label = 'clean';
    const { nodes, edges } = fromProcessGraph(ref);
    const restored = decodeDiagram(encodeDiagram({ level: L3, nodes, edges }, 'x'), L3, NODE_CATALOG)!;

    const e3 = restored.graph.edges.find((e) => e.id === 'e3')!;
    expect(e3).toMatchObject({ conditionExpression: "reconStatus == 'MATCHED' && amount < 100000", priority: 1, label: 'clean' });
    expect(restored.graph.nodes.find((n) => n.id === 'n_recon')!.configParams.toleranceMinor).toBe(5);
    expect(restored.graph.nodes.every((n) => n.position !== undefined)).toBe(true);
  });

  it.each([
    ['nothing stored', null],
    ['text that is not JSON', '{not json'],
    ['a different format version', JSON.stringify({ version: 99, levelId: L1.id, nodes: [], edges: [] })],
    ['an entry for another level', JSON.stringify({ version: 1, levelId: L2.id, nodes: [], edges: [] })],
    ['nodes that are not a list', JSON.stringify({ version: 1, levelId: L1.id, nodes: 'x', edges: [] })],
    ['a bare number', '42'],
  ])('%s is ignored, not an error', (_name, raw) => {
    expect(decodeDiagram(raw, L1, NODE_CATALOG)).toBeNull();
  });

  it('rebuilds nodes from the catalog, so a tampered saved entry cannot invent ports, types or capabilities', () => {
    const raw = JSON.stringify({
      version: 1,
      levelId: L3.id,
      nodes: [
        {
          id: 'n_x',
          definitionId: 'nd_recon_desk',
          type: 'EVENT_END',
          label: 'My recon',
          bankingCapability: 'TOKEN_VAULT',
          inputPorts: [],
          outputPorts: [{ id: 'bogus', label: 'x', direction: 'OUT', role: 'FLOW', maxEdges: 99 }],
          configParams: { toleranceMinor: 5, notASetting: 1 },
          position: { x: 10, y: 20 },
        },
      ],
      edges: [],
    });

    const n = decodeDiagram(raw, L3, NODE_CATALOG)!.graph.nodes[0]!;

    expect(n).toMatchObject({ type: 'TASK', bankingCapability: 'RECON_DESK', label: 'My recon', position: { x: 10, y: 20 } });
    expect(n.outputPorts.map((p) => p.id)).toEqual(['out']);
    expect(n.inputPorts.map((p) => p.id)).toEqual(['in']);
    expect(n.configParams).toEqual({ toleranceMinor: 5 });
  });

  it('drops what cannot be restored and counts it: unknown node types, duplicate ids, wires to nowhere or to missing ports', () => {
    const raw = JSON.stringify({
      version: 1,
      levelId: L3.id,
      nodes: [
        { id: 'a', definitionId: 'nd_start_payment', position: { x: 0, y: 0 } },
        { id: 'b', definitionId: 'nd_removed_in_a_later_release' },
        { id: 'a', definitionId: 'nd_recon_desk' },
        { id: 'c', definitionId: 'nd_recon_desk', configParams: { toleranceMinor: 'five' } },
        'garbage',
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'c', targetPortId: 'in' },
        { id: 'e2', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
        { id: 'e3', sourceNodeId: 'a', sourcePortId: 'nope', targetNodeId: 'c', targetPortId: 'in' },
        { id: 'e1', sourceNodeId: 'c', sourcePortId: 'out', targetNodeId: 'a', targetPortId: 'in' },
        { id: 'e5' },
      ],
    });

    const r = decodeDiagram(raw, L3, NODE_CATALOG)!;

    expect(r.graph.nodes.map((n) => n.id)).toEqual(['a', 'c']);
    expect(r.graph.edges.map((e) => e.id)).toEqual(['e1']);
    expect(r.dropped).toBe(7); // 3 nodes (unknown type, duplicate id, garbage) + 4 edges
    expect(r.graph.nodes.find((n) => n.id === 'c')!.configParams.toleranceMinor).toBe(0); // 'five' falls back to the default
  });

  it('locked starter nodes always come from the level: edits to them are ignored, and missing ones come back', () => {
    const { nodes, edges } = fromProcessGraph(referenceOf(L1.id));
    const doc = JSON.parse(encodeDiagram({ level: L1, nodes, edges }, 'x')) as { nodes: Array<Record<string, any>> };
    doc.nodes.find((n) => n.id === 'n_end_approved')!.configParams.outcome = 'DECLINED';
    doc.nodes.find((n) => n.id === 'n_end_approved')!.position = { x: 5, y: 6 };
    doc.nodes = doc.nodes.filter((n) => n.id !== 'n_end_declined');

    const r = decodeDiagram(JSON.stringify(doc), L1, NODE_CATALOG)!;

    const approved = r.graph.nodes.find((n) => n.id === 'n_end_approved')!;
    expect(approved).toMatchObject({ locked: true, configParams: { outcome: 'APPROVED' }, position: { x: 5, y: 6 } });
    expect(r.graph.nodes.find((n) => n.id === 'n_end_declined')).toMatchObject({ locked: true });
    expect(r.dropped).toBe(0);
  });

  it('an untouched level has the same body as the starter, and moving a node changes it', () => {
    const { nodes, edges } = fromProcessGraph(L1.starterGraph!);
    expect(diagramBody({ level: L1, nodes, edges })).toBe(pristineBody(L1));
    const moved = nodes.map((n, i) => (i === 0 ? { ...n, position: { x: n.position.x + 14, y: n.position.y } } : n));
    expect(diagramBody({ level: L1, nodes: moved, edges })).not.toBe(pristineBody(L1));
  });
});

// Autosave

describe('autosave', () => {
  it('writes an edit after the delay, not before, and reports pending then saved', () => {
    const storage = memoryStorage();
    const store = open(storage);
    expect(store.getState().saveStatus).toBe('pristine');

    store.getState().addNode('nd_token_vault', { x: 300, y: 100 });
    expect(store.getState().saveStatus).toBe('pending');
    vi.advanceTimersByTime(DELAY - 1);
    expect(saved(storage, L1.id)).toBeNull();

    vi.advanceTimersByTime(1);
    expect(store.getState().saveStatus).toBe('saved');
    expect(store.getState().lastSavedAt).toBe('2026-10-10T03:00:00.000Z');
    expect(saved(storage, L1.id)!.nodes.map((n) => n.id)).toContain('n_token_vault_1');
  });

  it('a burst of edits is one write (dragging a node changes the diagram every frame)', () => {
    const storage = memoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const store = open(storage);
    setItem.mockClear();

    store.getState().addNode('nd_token_vault', { x: 300, y: 100 });
    for (let x = 0; x < 20; x++) {
      vi.advanceTimersByTime(16);
      store.getState().onNodesChange([{ id: 'n_token_vault_1', type: 'position', position: { x: 300 + x * 14, y: 100 }, dragging: true }]);
    }
    vi.advanceTimersByTime(DELAY);

    const diagramWrites = setItem.mock.calls.filter(([k]) => k === diagramKey(L1.id));
    expect(diagramWrites).toHaveLength(1);
    expect(saved(storage, L1.id)!.nodes.find((n) => n.id === 'n_token_vault_1')!.position).toEqual({ x: 300 + 19 * 14, y: 100 });
  });

  it('selecting or panning is not an edit: nothing is scheduled', () => {
    const storage = memoryStorage();
    const store = open(storage);
    store.getState().onNodesChange([{ id: 'n_start', type: 'select', selected: true }]);
    store.getState().onNodesChange([{ id: 'n_start', type: 'dimensions', dimensions: { width: 220, height: 64 } }]);
    expect(store.getState().saveStatus).toBe('pristine');
    vi.advanceTimersByTime(DELAY * 3);
    expect(storage.dump()[diagramKey(L1.id)]).toBeUndefined();
  });

  it('saves the whole diagram: nodes, wires, and the custom condition on each wire', () => {
    const storage = memoryStorage();
    const store = open(storage, { initialLevelId: L3.id });
    store.getState().loadGraph(referenceOf(L3.id));
    store.getState().updateEdge('e4', { conditionExpression: "reconStatus == 'BREAK_AMOUNT' && amount > 0" });
    vi.advanceTimersByTime(DELAY);

    const doc = saved(storage, L3.id)!;
    expect(doc.nodes).toHaveLength(7);
    expect(doc.edges).toHaveLength(6);
    expect(doc.edges.find((e) => e.id === 'e4')!.conditionExpression).toBe("reconStatus == 'BREAK_AMOUNT' && amount > 0");
    expect(doc.nodes.find((n) => n.id === 'n_recon')!.configParams).toEqual({ toleranceMinor: 5 });
  });

  it('an untouched starter is never written, and deleting your work removes the entry again', () => {
    const storage = memoryStorage();
    const store = open(storage);
    vi.advanceTimersByTime(DELAY * 2);
    expect(storage.getItem(diagramKey(L1.id))).toBeNull();

    store.getState().addNode('nd_token_vault', { x: 300, y: 100 });
    vi.advanceTimersByTime(DELAY);
    expect(storage.getItem(diagramKey(L1.id))).not.toBeNull();

    store.getState().removeNode('n_token_vault_1');
    vi.advanceTimersByTime(DELAY);
    expect(storage.getItem(diagramKey(L1.id))).toBeNull();
    expect(store.getState().saveStatus).toBe('pristine');
  });

  it('flushSave writes straight away, for when the page is being closed', () => {
    const storage = memoryStorage();
    const store = open(storage);
    store.getState().addNode('nd_token_vault', { x: 300, y: 100 });
    expect(storage.getItem(diagramKey(L1.id))).toBeNull();

    store.getState().flushSave();

    expect(storage.getItem(diagramKey(L1.id))).not.toBeNull();
    expect(store.getState().saveStatus).toBe('saved');
    vi.advanceTimersByTime(DELAY * 2); // the cancelled timer does not write again
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('flushSave with nothing waiting does nothing', () => {
    const storage = memoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const store = open(storage);
    setItem.mockClear();
    store.getState().flushSave();
    expect(setItem).not.toHaveBeenCalled();
  });
});

// Restore on open and on level switch

describe('restoring', () => {
  it('a new session (a page reload) gets the diagram back, with a notice, and it still grades', () => {
    const storage = memoryStorage();
    const first = open(storage, { initialLevelId: L3.id });
    first.getState().loadGraph(referenceOf(L3.id));
    first.getState().updateEdge('e3', { label: 'clean match' });
    vi.advanceTimersByTime(DELAY);

    const second = open(storage, { initialLevelId: L3.id });

    const s = second.getState();
    expect(s.nodes).toHaveLength(7);
    expect(s.edges).toHaveLength(6);
    expect(s.edges.find((e) => e.id === 'e3')!.data?.label).toBe('clean match');
    expect(s.saveStatus).toBe('saved');
    expect(s.lastSavedAt).toBe('2026-10-10T03:00:00.000Z');
    expect(s.notice).toMatchObject({ kind: 'info' });
    expect(s.notice!.message).toContain('Restored your saved diagram for Level 3');
    expect(passes(second)).toBe(100);
    expect(s.isEvaluationStale).toBe(false);
    expect(s.lastEvaluationResult).toBeNull(); // grades are not saved: press Submit again
  });

  it('reopens the level that was open last, unless told otherwise', () => {
    const storage = memoryStorage();
    const first = open(storage);
    first.getState().loadChallenge(L2.id);
    expect(storage.getItem(ACTIVE_LEVEL_KEY)).toBe(L2.id);

    expect(open(storage).getState().level.id).toBe(L2.id);
    expect(open(storage, { initialLevelId: L1.id }).getState().level.id).toBe(L1.id);
  });

  it('ignores a remembered level that no longer exists', () => {
    const storage = memoryStorage({ [ACTIVE_LEVEL_KEY]: 'lvl_removed' });
    expect(open(storage).getState().level.id).toBe(LEVELS[0]!.id);
  });

  it('each level has its own slot: switching saves the level you leave at once, and brings the other back', () => {
    const storage = memoryStorage();
    const store = open(storage);
    store.getState().addNode('nd_token_vault', { x: 300, y: 100 });
    // No timer has fired. Switching must not lose the edit.
    store.getState().loadChallenge(L2.id);
    expect(saved(storage, L1.id)!.nodes.map((n) => n.id)).toContain('n_token_vault_1');
    expect(store.getState().nodes).toHaveLength(0);
    expect(store.getState().notice).toBeNull(); // nothing saved for level 2, so nothing was restored

    store.getState().addNode('nd_start_payment', { x: 40, y: 100 });
    store.getState().loadChallenge(L1.id);
    expect(store.getState().nodes.map((n) => n.id).sort()).toEqual(['n_end_approved', 'n_end_declined', 'n_start', 'n_token_vault_1']);
    expect(store.getState().notice!.message).toContain('Level 1');

    store.getState().loadChallenge(L2.id);
    expect(store.getState().nodes.map((n) => n.id)).toEqual(['n_start_payment_1']);

    vi.advanceTimersByTime(DELAY * 3); // nothing left waiting: the late timers do not write the wrong level's graph
    expect(saved(storage, L1.id)!.nodes).toHaveLength(4);
    expect(saved(storage, L2.id)!.nodes).toHaveLength(1);
  });

  it('opening a level resets the playback and grading state that belonged to the old diagram', () => {
    const storage = memoryStorage();
    const store = open(storage);
    store.getState().loadGraph(referenceOf(L1.id));
    store.getState().runEvaluation();
    store.getState().startSimulation('L1-T1');
    vi.advanceTimersByTime(DELAY);

    store.getState().loadChallenge(L1.id);

    expect(store.getState().lastEvaluationResult).toBeNull();
    expect(store.getState().simulation).toBeNull();
    expect(store.getState().isRunning).toBe(false);
    expect(store.getState().nodes).toHaveLength(8);
  });

  it('survives a corrupt entry: starts from the starter graph and carries on saving', () => {
    const storage = memoryStorage({ [diagramKey(L1.id)]: '{"version":1,"levelId":"x"' });
    const store = open(storage);
    expect(store.getState().nodes).toHaveLength(3);
    expect(store.getState().notice).toBeNull();

    store.getState().addNode('nd_token_vault', { x: 300, y: 100 });
    vi.advanceTimersByTime(DELAY);
    expect(saved(storage, L1.id)!.nodes).toHaveLength(4);
  });

  it('says so when pieces had to be left out', () => {
    const { nodes, edges } = fromProcessGraph(referenceOf(L1.id));
    const doc = JSON.parse(encodeDiagram({ level: L1, nodes, edges }, 'x')) as { nodes: Array<Record<string, unknown>> };
    doc.nodes.push({ id: 'ghost', definitionId: 'nd_from_the_future' });
    const store = open(memoryStorage({ [diagramKey(L1.id)]: JSON.stringify(doc) }));
    expect(store.getState().notice!.message).toContain('1 piece could not be restored and was left out');
  });
});

// Reset to starter

describe('resetToStarter', () => {
  it('clears the saved entry and returns the level to its starter graph', () => {
    const storage = memoryStorage();
    const store = open(storage);
    store.getState().loadGraph(referenceOf(L1.id));
    store.getState().runEvaluation();
    vi.advanceTimersByTime(DELAY);
    expect(storage.getItem(diagramKey(L1.id))).not.toBeNull();
    const epoch = store.getState().canvasEpoch;

    store.getState().resetToStarter();

    const s = store.getState();
    expect(storage.getItem(diagramKey(L1.id))).toBeNull();
    expect(s.nodes.map((n) => n.id).sort()).toEqual(['n_end_approved', 'n_end_declined', 'n_start']);
    expect(s.edges).toHaveLength(0);
    expect(s.saveStatus).toBe('pristine');
    expect(s.lastSavedAt).toBeNull();
    expect(s.lastEvaluationResult).toBeNull();
    expect(s.canvasEpoch).toBe(epoch + 1);
    expect(s.notice!.message).toContain('starter graph');
    // and a reload agrees
    expect(open(storage).getState().nodes).toHaveLength(3);
  });

  it('drops an edit that was still waiting, and does not write the starter back', () => {
    const storage = memoryStorage();
    const store = open(storage);
    store.getState().addNode('nd_token_vault', { x: 300, y: 100 });
    expect(store.getState().saveStatus).toBe('pending');

    store.getState().resetToStarter();
    vi.advanceTimersByTime(DELAY * 3);

    expect(storage.getItem(diagramKey(L1.id))).toBeNull();
    expect(store.getState().nodes).toHaveLength(3);
    expect(store.getState().saveStatus).toBe('pristine');
  });

  it('only touches the level you are on', () => {
    const storage = memoryStorage();
    const store = open(storage);
    store.getState().addNode('nd_token_vault', { x: 300, y: 100 });
    store.getState().loadChallenge(L2.id);
    store.getState().addNode('nd_start_payment', { x: 40, y: 100 });
    vi.advanceTimersByTime(DELAY);

    store.getState().resetToStarter();

    expect(storage.getItem(diagramKey(L2.id))).toBeNull();
    expect(storage.getItem(diagramKey(L1.id))).not.toBeNull();
    expect(store.getState().level.id).toBe(L2.id);
  });

  it('works on a blank-canvas level, and stops a running playback', () => {
    const storage = memoryStorage();
    const store = open(storage, { initialLevelId: L3.id });
    store.getState().loadGraph(referenceOf(L3.id));
    store.getState().startSimulation('L3-T1');
    expect(store.getState().isRunning).toBe(true);

    store.getState().resetToStarter();

    expect(store.getState().nodes).toHaveLength(0);
    expect(store.getState().isRunning).toBe(false);
    expect(store.getState().simulation).toBeNull();
    expect(store.getState().activeTokens).toEqual([]);
  });

  it('after a reset, new work is saved again', () => {
    const storage = memoryStorage();
    const store = open(storage);
    store.getState().addNode('nd_token_vault', { x: 300, y: 100 });
    vi.advanceTimersByTime(DELAY);
    store.getState().resetToStarter();

    store.getState().addNode('nd_dcvv_verifier', { x: 500, y: 100 });
    vi.advanceTimersByTime(DELAY);

    expect(saved(storage, L1.id)!.nodes.map((n) => n.id)).toContain('n_dcvv_verifier_1');
    expect(saved(storage, L1.id)!.nodes.map((n) => n.id)).not.toContain('n_token_vault_1');
  });
});

// When storage misbehaves

describe('storage that is missing or failing', () => {
  it('with no storage the app still works and says it is not saving', () => {
    const store = open(null);
    expect(store.getState().saveStatus).toBe('unavailable');
    store.getState().addNode('nd_token_vault', { x: 300, y: 100 });
    vi.advanceTimersByTime(DELAY);
    expect(store.getState().saveStatus).toBe('unavailable');
    expect(store.getState().nodes).toHaveLength(4);
    expect(() => store.getState().resetToStarter()).not.toThrow();
    expect(store.getState().nodes).toHaveLength(3);
  });

  it('a full or blocked storage reports an error, keeps the diagram, and recovers when writes work again', () => {
    const storage = memoryStorage();
    const store = open(storage);
    let broken = true;
    const real = storage.setItem.bind(storage);
    vi.spyOn(storage, 'setItem').mockImplementation((k, v) => {
      if (broken) throw new DOMException('quota', 'QuotaExceededError');
      real(k, v);
    });

    store.getState().addNode('nd_token_vault', { x: 300, y: 100 });
    vi.advanceTimersByTime(DELAY);
    expect(store.getState().saveStatus).toBe('error');
    expect(store.getState().nodes).toHaveLength(4);

    broken = false;
    store.getState().addNode('nd_dcvv_verifier', { x: 500, y: 100 });
    vi.advanceTimersByTime(DELAY);
    expect(store.getState().saveStatus).toBe('saved');
    expect(saved(storage, L1.id)!.nodes).toHaveLength(5);
  });

  it('reads that throw are treated as "nothing saved"', () => {
    const storage: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const store = open(storage);
    expect(store.getState().nodes).toHaveLength(3);
    expect(store.getState().saveStatus).toBe('pristine');
  });

  it('browserStorage is null where there is no window (as in these tests)', () => {
    expect(browserStorage()).toBeNull();
  });
});
