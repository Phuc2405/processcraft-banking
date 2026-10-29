import { describe, expect, it } from 'vitest';
import { LEVELS, REFERENCE_SOLUTIONS } from '../../data/seedChallenges';
import { DEF, edgeOf, graphOf, level, makeEdge, makeNode, nodeOf, referenceGraph } from '../../engine/__tests__/graphHelpers';
import type { Id, ProcessGraph } from '../../types/processLearning';
import { capacityOf, lookOfToken } from '../liveSimulation';
import { createWorkflowStore, DEFAULT_PLAYBACK_MS, type WorkflowStore } from '../workflowStore';

const FIXED_NOW = () => new Date('2026-10-10T03:00:00Z');
const open = (graph: ProcessGraph, levelId?: Id): WorkflowStore => {
  const store = createWorkflowStore({ now: FIXED_NOW, ...(levelId ? { initialLevelId: levelId } : {}) });
  store.getState().loadGraph(graph);
  return store;
};

/** Starts a replay and steps to the end, calling `each` after every step (and once before the first). */
function play(store: WorkflowStore, testId: Id, each: (tick: number) => void = () => undefined): void {
  expect(store.getState().startSimulation(testId)).toBe(true);
  each(0);
  for (let i = 0; i < 200 && !store.getState().simulation?.finished; i++) {
    store.getState().stepSimulation();
    each(store.getState().currentTick);
  }
  expect(store.getState().simulation?.finished).toBe(true);
}

const L1 = level(1);
const L2 = level(2);
const L3 = level(3);
const L4 = level(4);

// What tokens look like

describe('token looks', () => {
  const token = (over: Record<string, unknown>, derived: Record<string, unknown> = {}) =>
    ({ payload: { cardType: 'CREDIT', ...over }, derived }) as unknown as Parameters<typeof lookOfToken>[0];

  it('a card payment is a card, named for the kind of card', () => {
    expect(lookOfToken(token({ cardType: 'DEBIT' }))).toMatchObject({ kind: 'CARD', cardType: 'DEBIT', label: 'Debit card payment' });
    expect(lookOfToken(token({ cardType: 'CREDIT' }))).toMatchObject({ kind: 'CARD', label: 'Credit card payment' });
    expect(lookOfToken(token({ cardType: 'VIRTUAL_DPAN' }))).toMatchObject({ kind: 'CARD', label: 'Virtual card payment' });
  });

  it('a settlement record is a document folder', () => {
    expect(lookOfToken(token({ settlement: { ledgerAmount: 1, clearingAmount: 1, switchAmount: 1, clearingPresentments: 1 } })).kind).toBe('SETTLEMENT');
  });

  it('a Pay-in-4 application is a split badge until the underwriter says no, then it is a card', () => {
    const bnpl = { underwritingScore: 700, downPaymentMinor: 100 };
    expect(lookOfToken(token({ bnpl }))).toMatchObject({ kind: 'BNPL', label: 'Pay-in-4 application' });
    expect(lookOfToken(token({ bnpl }, { bnplDecision: 'ELIGIBLE' }))).toMatchObject({ kind: 'BNPL', label: 'Pay-in-4 plan (approved)' });
    expect(lookOfToken(token({ bnpl }, { bnplDecision: 'INELIGIBLE' }))).toMatchObject({ kind: 'CARD', cardType: 'CREDIT' });
  });

  it('only joins and End events can never be congested', () => {
    expect(capacityOf('TASK')).toBe(1);
    expect(capacityOf('GATEWAY_XOR')).toBe(1);
    expect(capacityOf('EVENT_START')).toBe(1);
    expect(capacityOf('GATEWAY_AND')).toBe(Number.POSITIVE_INFINITY);
    expect(capacityOf('EVENT_END')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('tokens on the wires', () => {
  /** [edge, look kind, look label] for every wire taken, in order. */
  function trafficOf(store: WorkflowStore, testId: Id): Array<[Id, string, string]> {
    const seen: Array<[Id, string, string]> = [];
    play(store, testId, () => {
      for (const [edgeId, items] of Object.entries(store.getState().edgeTraffic)) for (const t of items) seen.push([edgeId, t.look.kind, t.look.label]);
    });
    return seen;
  }

  it('each step reports who took which wire, and clears when nothing moved', () => {
    const store = open(referenceGraph(L1));
    store.getState().startSimulation('L1-T1');
    expect(store.getState().edgeTraffic).toEqual({});
    store.getState().stepSimulation();
    expect(store.getState().edgeTraffic).toEqual({ e1: [{ tokenId: 'tok_1', look: expect.objectContaining({ kind: 'CARD', cardType: 'VIRTUAL_DPAN' }), tick: 1 }] });
    expect(store.getState().activeEdgeIds).toEqual(['e1']);
    play(store, 'L1-T1');
    expect(store.getState().edgeTraffic).toEqual({}); // the last step ends the run: nothing is on a wire
  });

  it('Level 3 payments travel as settlement folders', () => {
    const seen = trafficOf(open(referenceGraph(L3), L3.id), 'L3-T1');
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen.map(([, kind]) => kind))).toEqual(new Set(['SETTLEMENT']));
  });

  it('a Pay-in-4 plan keeps its split badge all the way to the down payment', () => {
    const seen = trafficOf(open(referenceGraph(L4), L4.id), 'L4-T1');
    expect(seen.map(([e, kind]) => `${e}:${kind}`)).toEqual(['e1:BNPL', 'e2:BNPL', 'e3:BNPL', 'e5:BNPL', 'e7:BNPL']);
    expect(seen[1]![2]).toBe('Pay-in-4 plan (approved)');
  });

  it('a turned-down application turns into a card on the way out of the underwriter, and stays one', () => {
    const seen = trafficOf(open(referenceGraph(L4), L4.id), 'L4-T6');
    expect(seen.map(([e, kind]) => `${e}:${kind}`)).toEqual(['e1:BNPL', 'e2:CARD', 'e4:CARD', 'e6:CARD', 'e8:CARD']);
  });
});

// Desks at work

describe('desks at work', () => {
  it('the desk that ran shows the token it worked on until the token leaves; the next desk shows it waiting', () => {
    const store = open(referenceGraph(L1));
    store.getState().startSimulation('L1-T1');
    store.getState().stepSimulation();
    let s = store.getState().nodeRuntime;
    expect(s.n_start).toMatchObject({ status: 'PROCESSING', workedAtTick: 1, worked: { tokenId: 'tok_1' } });
    expect(s.n_vault?.chips.map((c) => c.tokenId)).toEqual(['tok_1']);
    expect(s.n_vault?.worked).toBeNull();

    store.getState().stepSimulation();
    s = store.getState().nodeRuntime;
    expect(s.n_start?.worked).toBeNull();
    expect(s.n_start?.chips).toEqual([]);
    expect(s.n_vault).toMatchObject({ status: 'PROCESSING', workedAtTick: 2, load: 1, congested: false });
  });

  it('desks that did nothing keep the very same object, so React can skip them', () => {
    const store = open(referenceGraph(L1));
    store.getState().startSimulation('L1-T1');
    store.getState().stepSimulation();
    const before = store.getState().nodeRuntime;
    store.getState().stepSimulation();
    const after = store.getState().nodeRuntime;
    expect(after.n_end_approved).toBe(before.n_end_approved);
    expect(after.n_ledger).toBe(before.n_ledger);
    expect(after.n_vault).not.toBe(before.n_vault);
  });

  it('playback speed can be changed, within reason', () => {
    const store = open(referenceGraph(L1));
    expect(store.getState().playbackMs).toBe(DEFAULT_PLAYBACK_MS);
    store.getState().setPlaybackMs(225);
    expect(store.getState().playbackMs).toBe(225);
    store.getState().setPlaybackMs(Number.NaN);
    store.getState().setPlaybackMs(10);
    expect(store.getState().playbackMs).toBe(225);
  });
});

// Queue congestion

describe('queue congestion', () => {
  // Fork the payment into two parallel branches that both land on the same ledger desk.
  const pileUp = (): ProcessGraph =>
    graphOf(
      [
        makeNode(DEF.START, 'n_start'),
        makeNode(DEF.AND, 'n_fork', 'Fork'),
        makeNode(DEF.LEDGER, 'n_ledger'),
        makeNode(DEF.END, 'n_end', 'Approved', { outcome: 'APPROVED' }),
      ],
      [
        makeEdge('e1', ['n_start', 'out'], ['n_fork', 'in_1']),
        makeEdge('e2', ['n_fork', 'out_1'], ['n_ledger', 'in']),
        makeEdge('e3', ['n_fork', 'out_2'], ['n_ledger', 'in']),
        makeEdge('e4', ['n_ledger', 'out'], ['n_end', 'in']),
      ],
    );

  it('two payments arriving at a one-at-a-time desk make it congested, until the line clears', () => {
    const store = open(pileUp());
    const trace: Array<{ tick: number; load: number; congested: boolean; chips: number }> = [];
    play(store, 'L1-T1', (tick) => {
      const r = store.getState().nodeRuntime.n_ledger;
      if (r) trace.push({ tick, load: r.load, congested: r.congested, chips: r.chips.length });
    });

    const congested = trace.filter((t) => t.congested);
    expect(congested.length).toBeGreaterThanOrEqual(2);
    expect(congested[0]).toMatchObject({ load: 2, chips: 2 }); // both tokens standing there
    expect(Math.max(...trace.map((t) => t.load))).toBe(2);
    expect(trace.at(-1)!.congested).toBe(false); // and it clears
    expect(store.getState().nodeRuntime.n_ledger?.capacity).toBe(1);
  });

  it('a join is meant to hold tokens, and an End event collects them: neither is ever congested', () => {
    const store = open(
      graphOf(
        [
          makeNode(DEF.START, 'n_start'),
          makeNode(DEF.AND, 'n_fork', 'Fork'),
          makeNode(DEF.AND, 'n_join', 'Join'),
          makeNode(DEF.END, 'n_end', 'Approved', { outcome: 'APPROVED' }),
        ],
        [
          makeEdge('e1', ['n_start', 'out'], ['n_fork', 'in_1']),
          makeEdge('e2', ['n_fork', 'out_1'], ['n_join', 'in_1']),
          makeEdge('e3', ['n_fork', 'out_2'], ['n_join', 'in_2']),
          makeEdge('e4', ['n_join', 'out_1'], ['n_end', 'in']),
        ],
      ),
    );
    let ever = false;
    play(store, 'L1-T1', () => {
      ever ||= Object.values(store.getState().nodeRuntime).some((r) => r.congested);
    });
    expect(ever).toBe(false);
  });
});

// Deadlock and dropped transactions

describe('deadlock: a frozen join', () => {
  function starvedJoin(): ProcessGraph {
    const g = referenceGraph(L2);
    g.nodes = g.nodes.filter((n) => !['n_xor_ledger', 'n_end_challenge'].includes(n.id));
    g.edges = [];
    g.nodes.push(makeNode(DEF.AND, 'n_fork', 'Fork'), makeNode(DEF.AND, 'n_join', 'Join'));
    g.edges.push(
      makeEdge('f1', ['n_start', 'out'], ['n_fork', 'in_1']),
      makeEdge('f2', ['n_fork', 'out_1'], ['n_3ds', 'in']),
      makeEdge('f3', ['n_fork', 'out_2'], ['n_ledger', 'in']),
      makeEdge('f4', ['n_3ds', 'out'], ['n_xor_3ds', 'in_1']),
      makeEdge('f5', ['n_xor_3ds', 'out_1'], ['n_join', 'in_1'], { when: 'authenticated == true', priority: 1 }),
      makeEdge('f6', ['n_xor_3ds', 'out_2'], ['n_end_declined', 'in'], { isDefault: true }),
      makeEdge('f7', ['n_ledger', 'out'], ['n_join', 'in_2']),
      makeEdge('f8', ['n_join', 'out_1'], ['n_end_approved', 'in']),
    );
    return g;
  }

  it('a join waiting for a branch that never comes freezes, and says what it is waiting for', () => {
    const store = open(starvedJoin(), L2.id);
    let sawWaiting = false;
    play(store, 'L2-T03', () => {
      sawWaiting ||= store.getState().nodeRuntime.n_join?.status === 'WAITING';
    });

    const join = store.getState().nodeRuntime.n_join!;
    expect(sawWaiting).toBe(true); // it waited first, then froze when nothing else could move
    expect(join.status).toBe('FROZEN');
    expect(join.note).toContain("waiting for a branch from '3DS path?'");
    expect(join.dropped).toBeNull();
    // The token that reached an End event is not frozen, and nothing else is.
    expect(Object.entries(store.getState().nodeRuntime).filter(([, r]) => r.status === 'FROZEN').map(([id]) => id)).toEqual(['n_join']);
  });

  it('the frozen state stays until the simulation is reset', () => {
    const store = open(starvedJoin(), L2.id);
    play(store, 'L2-T03');
    expect(store.getState().nodeRuntime.n_join?.status).toBe('FROZEN');
    store.getState().resetSimulation();
    expect(store.getState().nodeRuntime).toEqual({});
  });
});

describe('dropped transactions', () => {
  it('a token that reaches a desk with nowhere to go is dropped there, and the desk remembers it', () => {
    const store = open(
      graphOf(
        [makeNode(DEF.START, 'n_start'), makeNode(DEF.VAULT, 'n_vault'), makeNode(DEF.END, 'n_end', 'Approved', { outcome: 'APPROVED' })],
        [makeEdge('e1', ['n_start', 'out'], ['n_vault', 'in'])],
      ),
    );
    play(store, 'L1-T1');

    const vault = store.getState().nodeRuntime.n_vault!;
    expect(vault.status).toBe('FAULTED');
    expect(vault.dropped).toMatchObject({ tokenId: 'tok_1', look: { kind: 'CARD', cardType: 'VIRTUAL_DPAN' } });
    expect(vault.dropped!.reason).toContain('has no outgoing edge');
    expect(vault.dropped!.tick).toBe(store.getState().currentTick);
    expect(store.getState().nodeRuntime.n_start?.dropped).toBeNull();
  });

  it('a decision with no matching branch drops the token at the decision', () => {
    const store = open(
      graphOf(
        [makeNode(DEF.START, 'n_start'), makeNode(DEF.XOR, 'n_xor', 'Cheap?'), makeNode(DEF.END, 'n_end', 'Approved', { outcome: 'APPROVED' })],
        [
          makeEdge('e1', ['n_start', 'out'], ['n_xor', 'in_1']),
          makeEdge('e2', ['n_xor', 'out_1'], ['n_end', 'in'], { when: 'amount < 100', priority: 1 }),
        ],
      ),
    );
    play(store, 'L1-T1');
    expect(store.getState().nodeRuntime.n_xor).toMatchObject({ status: 'FAULTED', dropped: { tokenId: 'tok_1' } });
    expect(store.getState().nodeRuntime.n_xor?.dropped?.reason).toContain('No branch');
  });

  it('a Pay-in-4 application dropped before the underwriter decides is still a split badge', () => {
    const g = referenceGraph(L4);
    g.edges = g.edges.filter((e) => e.id !== 'e2'); // underwriter has nowhere to send the plan
    const store = open(g, L4.id);
    play(store, 'L4-T1');
    // the underwriter has just approved the plan, so the dropped token is the approved plan
    expect(store.getState().nodeRuntime.n_bnpl?.dropped?.look).toMatchObject({ kind: 'BNPL' });
  });

  it('a run that ends normally drops nothing, and clearing the simulation clears the markers', () => {
    const store = open(referenceGraph(L1));
    play(store, 'L1-T2');
    expect(Object.values(store.getState().nodeRuntime).every((r) => r.dropped === null)).toBe(true);

    const broken = open(graphOf([makeNode(DEF.START, 'n_start')], []));
    play(broken, 'L1-T1');
    expect(broken.getState().nodeRuntime.n_start?.dropped).not.toBeNull();
    broken.getState().resetSimulation();
    expect(broken.getState().nodeRuntime).toEqual({});
  });
});

// Alarms: fraud slips and reconciliation breaks

describe('alarms', () => {
  it('the recon desk raises an alarm when the three records disagree, and stays quiet when they match', () => {
    const store = open(referenceGraph(L3), L3.id);
    play(store, 'L3-T1');
    expect(store.getState().nodeRuntime.n_recon?.alarm).toBeNull();

    play(store, 'L3-T5'); // a 10c gap, outside the 5c tolerance
    const alarm = store.getState().nodeRuntime.n_recon?.alarm;
    expect(alarm).toMatchObject({ kind: 'RECON_BREAK', text: 'Break: amount' });
    expect(store.getState().nodeRuntime.n_end_amount?.alarm).toBeNull(); // routed to suspense: nothing slipped
    expect(store.getState().playbackLog.some((l) => l.text.startsWith('ALARM'))).toBe(false); // a found break is not a slip
  });

  it.each([
    ['L3-T5', 'Break: amount'],
    ['L3-T7', 'Break: missing leg'],
  ])('%s: names the kind of break', (testId, text) => {
    const store = open(referenceGraph(L3), L3.id);
    play(store, testId);
    expect(store.getState().nodeRuntime.n_recon?.alarm?.text).toBe(text);
  });

  it('a break that is settled as approved slips through: alarm at the End event and in the log', () => {
    const g = referenceGraph(L3);
    edgeOf(g, 'e4').targetNodeId = 'n_end_settled';
    const store = open(g, L3.id);
    play(store, 'L3-T5');

    const end = store.getState().nodeRuntime.n_end_settled!;
    expect(end.alarm).toMatchObject({ kind: 'BREAK_SLIP', text: 'Break settled as approved' });
    expect(store.getState().nodeRuntime.n_recon?.alarm?.kind).toBe('RECON_BREAK'); // the desk still reports what it found
    expect(store.getState().playbackLog.some((l) => l.kind === 'anomaly' && l.text === 'ALARM: Break settled as approved.')).toBe(true);
  });

  it('approving a fraudulent payment is a fraud slip, shown at the Approved end', () => {
    const g = referenceGraph(L2);
    g.edges = [makeEdge('x1', ['n_start', 'out'], ['n_end_approved', 'in'])];
    g.nodes = g.nodes.filter((n) => ['n_start', 'n_end_approved'].includes(n.id));
    const store = open(g, L2.id);

    play(store, 'L2-T07'); // the OTP that was never entered is a fraud attempt

    expect(store.getState().nodeRuntime.n_end_approved?.alarm).toMatchObject({ kind: 'FRAUD_SLIP', text: 'Fraud slipped through' });
    expect(store.getState().playbackLog.some((l) => l.text === 'ALARM: Fraud slipped through.')).toBe(true);

    play(store, 'L2-T01'); // an honest payment approved is fine
    expect(store.getState().nodeRuntime.n_end_approved?.alarm).toBeNull();
  });

  it('declining the fraud attempt raises no alarm', () => {
    const store = open(referenceGraph(L2), L2.id);
    play(store, 'L2-T07');
    expect(Object.values(store.getState().nodeRuntime).every((r) => r.alarm === null)).toBe(true);
  });
});

// Correct diagrams stay calm

describe('a correct diagram never looks like a problem', () => {
  it.each(LEVELS.map((l) => [l.id, l] as const))('%s: no congestion, freeze, drop or slip in any visible replay', (_id, lvl) => {
    const store = open(structuredClone(REFERENCE_SOLUTIONS.find((r) => r.challengeId === lvl.id)!.graph), lvl.id);
    for (const t of lvl.testSuite.filter((x) => !x.hidden)) {
      play(store, t.id, () => {
        for (const [id, r] of Object.entries(store.getState().nodeRuntime)) {
          const where = `${lvl.id} ${t.id} ${id}`;
          expect(r.congested, where).toBe(false);
          expect(r.status === 'FROZEN' || r.status === 'FAULTED', where).toBe(false);
          expect(r.dropped, where).toBeNull();
          // A recon desk may report a break it found, and that is its only alarm.
          if (r.alarm) expect(r.alarm.kind, where).toBe('RECON_BREAK');
        }
      });
    }
  });

  it('only a recon desk ever raises the break alarm in a correct Level 3 diagram', () => {
    const g = referenceGraph(L3);
    const store = open(g, L3.id);
    play(store, 'L3-T6');
    const alarmed = Object.entries(store.getState().nodeRuntime).filter(([, r]) => r.alarm);
    expect(alarmed.map(([id]) => id)).toEqual([nodeOf(g, 'n_recon').id]);
  });
});
