import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../data/seedChallenges';
import { referenceGraph, removeEdges, nodeOf } from '../../engine/__tests__/graphHelpers';
import { createLabTourStore, isBlocked, isFinished, LAB_TOUR_PLAYBACK_MS, quizAt, type LabTourHost } from '../labTourStore';
import { createWorkflowStore } from '../workflowStore';
import type { ChallengeLevel, ProcessGraph } from '../../types/processLearning';

const byNumber = (n: number): ChallengeLevel => LEVELS.find((l) => l.levelNumber === n)!;

/** A host standing in for the Build Lab: a level and the learner's diagram on it. */
function host(levelNumber: number, learner?: () => ProcessGraph): LabTourHost {
  const level = byNumber(levelNumber);
  return { levelId: () => level.id, learnerGraph: learner ?? (() => referenceGraph(level)) };
}

/** Answer every question correctly and walk to the end. */
function walkToEnd(store: ReturnType<typeof createLabTourStore>): void {
  store.getState().begin();
  let guard = 200;
  while (!isFinished(store.getState()) && guard-- > 0) {
    const s = store.getState();
    const q = quizAt(s, s.index);
    if (q && s.answers[s.index] === undefined) s.answer(q.correct);
    store.getState().next();
  }
}

describe('opening the tour', () => {
  it('starts closed', () => {
    const store = createLabTourStore(host(5));
    expect(store.getState().phase).toBe('closed');
    expect(store.getState().tour).toBeNull();
    expect(store.getState().canvas).toBeNull();
  });

  it('opens on the level’s featured payment, on the intro card', () => {
    const store = createLabTourStore(host(7));
    expect(store.getState().open('example')).toBe(true);
    const s = store.getState();
    expect(s.phase).toBe('intro');
    expect(s.levelId).toBe(byNumber(7).id);
    expect(s.testId).toBe('L7-T05');
    expect(s.tour?.source).toBe('example');
    expect(s.index).toBe(0);
    expect(s.refusal).toBeNull();
  });

  it('gives the tour its own canvas, locked to a quarter of the normal speed', () => {
    const store = createLabTourStore(host(5));
    store.getState().open('example');
    const canvas = store.getState().canvas!;
    expect(canvas.getState().playbackMs).toBe(LAB_TOUR_PLAYBACK_MS);
    expect(LAB_TOUR_PLAYBACK_MS).toBe(900 * 4);
    expect(canvas.getState().isRunning).toBe(false);
  });

  it('never touches the learner’s canvas', () => {
    const learner = createWorkflowStore({ initialLevelId: byNumber(5).id });
    const before = JSON.stringify([learner.getState().nodes, learner.getState().edges]);
    const store = createLabTourStore({ levelId: () => learner.getState().level.id, learnerGraph: () => learner.getState().getProcessGraph() });
    store.getState().open('example');
    walkToEnd(store);
    store.getState().exit();
    expect(JSON.stringify([learner.getState().nodes, learner.getState().edges])).toBe(before);
    expect(learner.getState().spotlight).toBeNull();
    expect(learner.getState().playbackMs).toBe(900);
    expect(learner.getState().simulation).toBeNull();
  });

  it('walks the learner’s own diagram when asked', () => {
    const level = byNumber(5);
    const store = createLabTourStore(host(5, () => structuredClone(level.starterGraph!)));
    store.getState().open('mine');
    expect(store.getState().tour?.source).toBe('mine');
    // The starter graph has Start and Approved but no wires between them, so the payment stops at once.
    expect(store.getState().tour?.problem).not.toBeNull();
    expect(store.getState().tour?.verdict.outcome).toBe('NO_OUTCOME');
  });

  it('walks a finished diagram of the learner’s without a problem', () => {
    const store = createLabTourStore(host(5, () => referenceGraph(byNumber(5))));
    store.getState().open('mine');
    expect(store.getState().tour?.problem).toBeNull();
    expect(store.getState().tour?.verdict.matchesExpected).toBe(true);
  });

  it('refuses a level it cannot find', () => {
    const store = createLabTourStore({ levelId: () => 'lvl_nope', learnerGraph: () => referenceGraph(byNumber(5)) });
    expect(store.getState().open('example')).toBe(false);
    expect(store.getState().refusal).toMatch(/lvl_nope/);
    expect(store.getState().tour).toBeNull();
    store.getState().begin();
    expect(store.getState().phase).toBe('intro');
  });

  it('can be reopened after leaving, from the top', () => {
    const store = createLabTourStore(host(5));
    store.getState().open('example');
    store.getState().begin();
    store.getState().exit();
    expect(store.getState().phase).toBe('closed');
    store.getState().open('example');
    expect(store.getState().phase).toBe('intro');
    expect(store.getState().index).toBe(0);
    expect(store.getState().answers).toEqual({});
  });
});

describe('stepping', () => {
  it('begin moves from the intro card to the first box', () => {
    const store = createLabTourStore(host(5));
    store.getState().open('example');
    store.getState().begin();
    expect(store.getState().phase).toBe('touring');
    expect(store.getState().index).toBe(0);
    expect(store.getState().auto).toBe(false);
  });

  it('keeps the token one box behind the card: the card is for the box the token has just reached', () => {
    const store = createLabTourStore(host(5));
    store.getState().open('example');
    store.getState().begin();
    const s0 = store.getState();
    const c0 = s0.canvas!.getState();
    expect(c0.currentTick).toBe(0);
    expect(c0.activeTokens[0]?.nodeId).toBe(s0.tour!.steps[0]!.nodeId);

    // Step 1 is a task, so no question blocks it.
    s0.next();
    const s1 = store.getState();
    expect(s1.index).toBe(1);
    expect(s1.canvas!.getState().currentTick).toBe(1);
    expect(s1.canvas!.getState().activeTokens[0]?.nodeId).toBe(s1.tour!.steps[1]!.nodeId);
    expect(s1.canvas!.getState().activeTokens[0]?.edgeId).toBe(s1.tour!.steps[1]!.viaEdgeId);
    expect(s1.canvas!.getState().isRunning).toBe(false);
  });

  it('lights the box on the card and dims the rest', () => {
    const store = createLabTourStore(host(5));
    store.getState().open('example');
    store.getState().begin();
    store.getState().next();
    const s = store.getState();
    const light = s.canvas!.getState().spotlight!;
    expect(light.nodes[s.tour!.steps[1]!.nodeId]).toBe('current');
    expect(light.nodes[s.tour!.steps[0]!.nodeId]).toBe('seen');
    expect(Object.values(light.nodes).filter((v) => v === 'current')).toHaveLength(1);
  });

  it('cannot go back before the first box', () => {
    const store = createLabTourStore(host(5));
    store.getState().open('example');
    store.getState().begin();
    store.getState().prev();
    expect(store.getState().index).toBe(0);
  });

  it('Previous puts the token and the spotlight back where they were', () => {
    const store = createLabTourStore(host(5));
    store.getState().open('example');
    store.getState().begin();
    store.getState().next();
    const at1 = {
      tick: store.getState().canvas!.getState().currentTick,
      node: store.getState().canvas!.getState().activeTokens[0]?.nodeId,
      light: JSON.stringify(store.getState().canvas!.getState().spotlight),
    };
    store.getState().next();
    store.getState().prev();
    const back = store.getState();
    expect(back.index).toBe(1);
    expect(back.canvas!.getState().currentTick).toBe(at1.tick);
    expect(back.canvas!.getState().activeTokens[0]?.nodeId).toBe(at1.node);
    expect(JSON.stringify(back.canvas!.getState().spotlight)).toBe(at1.light);
  });

  it('every box the card visits is where the token is', () => {
    for (const n of [1, 2, 5, 6, 7, 8, 9, 10]) {
      const store = createLabTourStore(host(n));
      store.getState().open('example');
      store.getState().begin();
      let guard = 200;
      while (!isFinished(store.getState()) && guard-- > 0) {
        const s = store.getState();
        if (s.index < s.tour!.steps.length) {
          expect(s.canvas!.getState().activeTokens[0]?.nodeId, `level ${n} step ${s.index}`).toBe(s.tour!.steps[s.index]!.nodeId);
        }
        const q = quizAt(s, s.index);
        if (q) s.answer(q.correct);
        store.getState().next();
      }
      expect(isFinished(store.getState())).toBe(true);
    }
  });

  it('finishes the run on the last Next and posts the ledger', () => {
    const store = createLabTourStore(host(5));
    store.getState().open('example');
    walkToEnd(store);
    const s = store.getState();
    expect(isFinished(s)).toBe(true);
    const c = s.canvas!.getState();
    expect(c.simulation?.finished).toBe(true);
    expect(c.simulation?.matchesExpected).toBe(true);
    expect(c.ledgerEntries.length).toBe(s.tour!.ledger.length);
    expect(Object.values(c.spotlight!.nodes).every((v) => v === 'seen' || v === 'off')).toBe(true);
  });

  it('does not run past the verdict', () => {
    const store = createLabTourStore(host(5));
    store.getState().open('example');
    walkToEnd(store);
    const at = store.getState().index;
    store.getState().next();
    expect(store.getState().index).toBe(at);
  });

  it('jumps to any box it has already been allowed to reach', () => {
    const store = createLabTourStore(host(5));
    store.getState().open('example');
    walkToEnd(store);
    store.getState().go(2);
    expect(store.getState().index).toBe(2);
    expect(store.getState().canvas!.getState().currentTick).toBe(2);
    store.getState().go(-4);
    expect(store.getState().index).toBe(0);
    store.getState().go(999);
    expect(store.getState().index).toBe(store.getState().tour!.steps.length);
  });
});

describe('the questions', () => {
  function toFirstQuestion(levelNumber: number) {
    const store = createLabTourStore(host(levelNumber));
    store.getState().open('example');
    store.getState().begin();
    let guard = 100;
    while (!isBlocked(store.getState()) && guard-- > 0) store.getState().next();
    return store;
  }

  it('holds the token at a decision until the learner answers', () => {
    const store = toFirstQuestion(5);
    const s = store.getState();
    expect(isBlocked(s)).toBe(true);
    const at = s.index;
    s.next();
    expect(store.getState().index).toBe(at);
    s.go(at + 3);
    expect(store.getState().index).toBe(at);
  });

  it('lets the learner on after an answer, right or wrong', () => {
    for (const wrong of [false, true]) {
      const store = toFirstQuestion(5);
      const s = store.getState();
      const q = quizAt(s, s.index)!;
      const pick = wrong ? (q.correct + 1) % q.options.length : q.correct;
      s.answer(pick);
      expect(store.getState().answers[s.index]).toEqual({ picked: pick, correct: !wrong });
      expect(isBlocked(store.getState())).toBe(false);
      store.getState().next();
      expect(store.getState().index).toBe(s.index + 1);
    }
  });

  it('takes the first answer only', () => {
    const store = toFirstQuestion(5);
    const s = store.getState();
    const q = quizAt(s, s.index)!;
    s.answer(q.correct);
    s.answer((q.correct + 1) % q.options.length);
    expect(store.getState().answers[s.index]?.correct).toBe(true);
  });

  it('ignores an option that does not exist', () => {
    const store = toFirstQuestion(5);
    store.getState().answer(99);
    store.getState().answer(-1);
    store.getState().answer(1.5);
    expect(store.getState().answers).toEqual({});
  });

  it('remembers answers when the learner goes back, and does not ask twice', () => {
    const store = toFirstQuestion(5);
    const asked = store.getState().index;
    const q = quizAt(store.getState(), asked)!;
    store.getState().answer(q.correct);
    store.getState().next();
    store.getState().prev();
    expect(store.getState().index).toBe(asked);
    expect(store.getState().answers[asked]?.correct).toBe(true);
    expect(isBlocked(store.getState())).toBe(false);
  });

  it('lets the learner jump back freely but not forward past an open question', () => {
    const store = toFirstQuestion(6);
    const at = store.getState().index;
    store.getState().go(0);
    expect(store.getState().index).toBe(0);
    store.getState().go(at + 5);
    expect(store.getState().index).toBe(at);
  });

  it('is only blocked while touring', () => {
    const store = createLabTourStore(host(5));
    store.getState().open('example');
    expect(isBlocked(store.getState())).toBe(false);
  });
});

describe('auto-play', () => {
  it('starts off, turns on and off, and stops when the learner steps by hand', () => {
    const store = createLabTourStore(host(5));
    store.getState().open('example');
    store.getState().begin();
    store.getState().setAuto(true);
    expect(store.getState().auto).toBe(true);
    store.getState().setAuto(false);
    expect(store.getState().auto).toBe(false);

    store.getState().setAuto(true);
    store.getState().next();
    expect(store.getState().auto).toBe(true);
    store.getState().prev();
    expect(store.getState().auto).toBe(false);
  });

  it('plays again from the top when started on the verdict', () => {
    const store = createLabTourStore(host(5));
    store.getState().open('example');
    walkToEnd(store);
    store.getState().setAuto(true);
    expect(store.getState().auto).toBe(true);
    expect(store.getState().index).toBe(0);
  });

  it('is off before the tour begins', () => {
    const store = createLabTourStore(host(5));
    store.getState().open('example');
    store.getState().setAuto(true);
    expect(store.getState().auto).toBe(false);
  });
});

describe('choosing the payment', () => {
  it('rebuilds the tour and the canvas for another test, keeping the phase', () => {
    const store = createLabTourStore(host(6));
    store.getState().open('example');
    const first = store.getState().canvas;
    const other = byNumber(6).testSuite.find((t) => !t.hidden && t.id !== store.getState().testId)!;
    store.getState().setTest(other.id);
    const s = store.getState();
    expect(s.testId).toBe(other.id);
    expect(s.tour?.testId).toBe(other.id);
    expect(s.canvas).not.toBe(first);
    expect(s.phase).toBe('intro');
    expect(s.index).toBe(0);
  });

  it('refuses a hidden test and an unknown one', () => {
    const level = byNumber(6);
    const hidden = level.testSuite.find((t) => t.hidden);
    const store = createLabTourStore(host(6));
    store.getState().open('example');
    const was = store.getState().testId;
    if (hidden) store.getState().setTest(hidden.id);
    store.getState().setTest('nope');
    expect(store.getState().testId).toBe(was);
  });
});

describe('a diagram that gets stuck', () => {
  function stuck(): ProcessGraph {
    const level = byNumber(6);
    const graph = referenceGraph(level);
    const start = graph.nodes.find((n) => n.type === 'EVENT_START')!;
    const first = graph.edges.find((e) => e.sourceNodeId === start.id)!;
    const second = nodeOf(graph, first.targetNodeId);
    removeEdges(graph, ...graph.edges.filter((e) => e.sourceNodeId === second.id).map((e) => e.id));
    return graph;
  }

  it('walks as far as the payment gets, then shows the problem on the verdict', () => {
    const store = createLabTourStore(host(6, stuck));
    store.getState().open('mine');
    const tour = store.getState().tour!;
    expect(tour.problem).not.toBeNull();
    expect(tour.steps.length).toBeGreaterThan(0);
    walkToEnd(store);
    expect(isFinished(store.getState())).toBe(true);
    expect(store.getState().tour?.verdict.matchesExpected).toBe(false);
  });

  it('will not begin when nothing at all can be walked', () => {
    const level = byNumber(6);
    const graph = referenceGraph(level);
    const start = graph.nodes.find((n) => n.type === 'EVENT_START')!;
    removeEdges(graph, ...graph.edges.filter((e) => e.sourceNodeId === start.id).map((e) => e.id));
    const store = createLabTourStore(host(6, () => graph));
    store.getState().open('mine');
    // The Start event alone is one step, so the tour can begin; it simply ends there.
    expect(store.getState().tour?.problem).not.toBeNull();
    store.getState().begin();
    walkToEnd(store);
    expect(isFinished(store.getState())).toBe(true);
  });
});
