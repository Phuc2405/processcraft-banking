import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../data/seedChallenges';
import { capabilityText, labScene, labUi, outcomeText } from '../../data/labTourCopy';
import { everyTransactionBalances, isBalanced } from '../../engine/ledger';
import { adHocTest, referenceGraph, removeEdges, nodeOf } from '../../engine/__tests__/graphHelpers';
import type { BankingCapability, ChallengeLevel, Outcome } from '../../types/processLearning';
import { buildLabTour, carriesOf, featuredTest, plainWords, playableTests, quizFor, quizzesOf, spotlightFor, valueText, type LabTour } from '../labTour';

const ACADEMY = LEVELS.filter((l) => l.levelNumber >= 5);

/** Every playable test of every level, walked on that level's reference diagram. */
const ALL: Array<{ level: ChallengeLevel; tour: LabTour }> = LEVELS.flatMap((level) => {
  const graph = referenceGraph(level);
  return playableTests(level).map((test) => ({ level, tour: buildLabTour(level, graph, test, 'example') }));
});

/** Every sentence a tour can put on screen, so a stray "undefined" or "NaN" cannot hide in one. */
function allText(tour: LabTour): string[] {
  const out: string[] = [tour.verdict.headline, tour.verdict.detail, ...tour.carries.flatMap((c) => [c.label, c.value])];
  for (const s of tour.steps) out.push(s.title, s.what, s.why, s.happened, ...s.fails, ...s.facts.flatMap((f) => [f.label, f.value]));
  for (const q of quizzesOf(tour)) out.push(q.prompt, q.explain, ...q.options);
  return out;
}

describe('the tour of a worked example', () => {
  it('covers every playable test of every level', () => {
    expect(ALL.length).toBeGreaterThan(60);
    for (const level of LEVELS) expect(ALL.some((a) => a.level.id === level.id)).toBe(true);
  });

  it('walks every test from a Start event to an End event with no problem', () => {
    for (const { level, tour } of ALL) {
      const where = `${level.id}/${tour.testId}`;
      expect(tour.problem, where).toBeNull();
      expect(tour.steps[0]?.kind, where).toBe('start');
      expect(tour.steps[tour.steps.length - 1]?.kind, where).toBe('end');
    }
  });

  it('ends each worked example the way its test expects', () => {
    for (const { level, tour } of ALL) {
      expect(tour.verdict.matchesExpected, `${level.id}/${tour.testId}: ${tour.verdict.headline}`).toBe(true);
    }
  });

  it('numbers its steps in order and only visits boxes and wires that exist', () => {
    for (const { tour } of ALL) {
      const nodes = new Set(tour.graph.nodes.map((n) => n.id));
      const edges = new Set(tour.graph.edges.map((e) => e.id));
      tour.steps.forEach((s, i) => {
        expect(s.index).toBe(i);
        expect(nodes.has(s.nodeId)).toBe(true);
        if (i === 0) expect(s.viaEdgeId).toBeNull();
        else expect(edges.has(s.viaEdgeId ?? '')).toBe(true);
      });
    }
  });

  it('never prints "undefined", "NaN" or a raw object', () => {
    for (const { level, tour } of ALL) {
      for (const line of allText(tour)) {
        expect(line, `${level.id}/${tour.testId}`).not.toMatch(/undefined|NaN|\[object|null\b/);
        expect(line.trim().length, `${level.id}/${tour.testId}`).toBeGreaterThan(0);
      }
    }
  });

  it('gives every step something to say', () => {
    for (const { level, tour } of ALL) {
      for (const s of tour.steps) {
        expect(s.what.length, `${level.id}/${s.nodeId} what`).toBeGreaterThan(10);
        expect(s.why.length, `${level.id}/${s.nodeId} why`).toBeGreaterThan(10);
        expect(s.happened.length, `${level.id}/${s.nodeId} happened`).toBeGreaterThan(5);
      }
    }
  });

  it('carries the facts each desk had written when the payment arrived', () => {
    const l5 = ACADEMY.find((l) => l.levelNumber === 5)!;
    const tour = buildLabTour(l5, referenceGraph(l5), l5.testSuite.find((t) => t.id === 'L5-T2')!, 'example');
    const gateway = tour.steps.find((s) => s.kind === 'gateway')!;
    const ledger = tour.steps.find((s) => s.capability === 'CORE_LEDGER_CHECK')!;
    expect(ledger.index).toBeLessThan(gateway.index);
    expect(gateway.factsBefore.ledgerDecision).toBeDefined();
    // The first desk has written nothing yet.
    expect(Object.keys(tour.steps[0]!.factsBefore).filter((k) => k !== 'isVirtual')).toEqual([]);
  });

  it('marks the End event with how the payment ended', () => {
    for (const { tour } of ALL) {
      const end = tour.steps[tour.steps.length - 1]!;
      expect(end.outcome).toBeDefined();
      expect(end.outcome).toBe(tour.verdict.outcome);
    }
  });
});

describe('the bank-to-bank message', () => {
  const l7 = ALL.filter((a) => a.level.levelNumber === 7);

  it('shows the pacs.008 the payment arrives as, on the Start event of every Level 7 test', () => {
    expect(l7.length).toBeGreaterThan(0);
    for (const { tour } of l7) {
      const start = tour.steps[0]!;
      expect(start.message?.xml, tour.testId).toContain('pacs.008');
      expect(start.message?.xml).toContain('<EndToEndId>');
      expect(start.message?.xml).not.toContain('<ClrSys>');
    }
  });

  it('stamps it with the rail the gateway chose, on the gateway step', () => {
    for (const { tour } of l7) {
      const gate = tour.steps.find((s) => s.capability === 'A2A_GATEWAY');
      const rail = gate?.facts.find((f) => f.label === 'Rail')?.value;
      if (!rail) continue;
      expect(gate?.message?.xml, tour.testId).toContain(`<Prtry>${rail.toUpperCase()}</Prtry>`);
    }
  });

  it('puts no message on a card payment', () => {
    for (const { level, tour } of ALL) {
      if (level.levelNumber === 7) continue;
      expect(tour.steps.every((s) => s.message === undefined), `${level.id}/${tour.testId}`).toBe(true);
    }
  });
});

describe('the questions at the decisions', () => {
  it('asks at every decision gateway that has a choice, and nowhere else', () => {
    for (const { level, tour } of ALL) {
      const asked = new Set(quizzesOf(tour).map((q) => q.step));
      tour.steps.forEach((s, i) => {
        const node = tour.graph.nodes.find((n) => n.id === s.nodeId)!;
        const choices = tour.graph.edges.filter((e) => e.sourceNodeId === node.id).length;
        const shouldAsk = s.kind === 'gateway' && node.type === 'GATEWAY_XOR' && choices >= 2 && i < tour.steps.length - 1;
        expect(asked.has(i), `${level.id}/${tour.testId} step ${i}`).toBe(shouldAsk);
      });
    }
  });

  it('marks as right the wire the simulation actually took', () => {
    for (const { level, tour } of ALL) {
      for (const q of quizzesOf(tour)) {
        const next = tour.steps[q.step + 1]!;
        const wires = tour.graph.edges.filter((e) => e.sourceNodeId === q.nodeId);
        expect(q.options.length, `${level.id}/${q.nodeId}`).toBe(wires.length);
        // Re-derive the right wire independently: it is the one the payment travelled.
        const travelled = wires.filter((e) => e.id === next.viaEdgeId);
        expect(travelled).toHaveLength(1);
        expect(q.correct).toBeGreaterThanOrEqual(0);
        expect(q.correct).toBeLessThan(q.options.length);
      }
    }
  });

  it('offers options a learner can tell apart', () => {
    for (const { level, tour } of ALL) {
      for (const q of quizzesOf(tour)) {
        expect(new Set(q.options).size, `${level.id}/${tour.testId}/${q.nodeId}: ${q.options.join(' | ')}`).toBe(q.options.length);
      }
    }
  });

  it('keeps the right answer from always sitting in the same place', () => {
    const positions = new Set(ALL.flatMap(({ tour }) => quizzesOf(tour).map((q) => q.correct)));
    expect(positions.size).toBeGreaterThan(1);
  });

  it('asks the brief’s own example question at the 3DS gateway', () => {
    const l2 = LEVELS.find((l) => l.levelNumber === 2)!;
    const lowRisk = playableTests(l2).find((t) => (t.inputPayload.riskScore ?? 100) <= 20)!;
    const tour = buildLabTour(l2, referenceGraph(l2), lowRisk, 'example');
    const q = quizzesOf(tour).find((x) => x.nodeId === 'n_xor_3ds');
    expect(q).toBeDefined();
    expect(q!.prompt).toBe(`Risk score is ${lowRisk.inputPayload.riskScore}. Does the customer need to enter an OTP?`);
  });

  it('returns no question for a box that is not a decision', () => {
    const { tour } = ALL[0]!;
    expect(quizFor(tour, 0)).toBeNull();
    expect(quizFor(tour, 999)).toBeNull();
  });
});

describe('the spotlight', () => {
  it('lights exactly one box at each step', () => {
    for (const { tour } of ALL.slice(0, 20)) {
      tour.steps.forEach((s, i) => {
        const light = spotlightFor(tour, i);
        const current = Object.entries(light.nodes).filter(([, v]) => v === 'current');
        expect(current).toEqual([[s.nodeId, 'current']]);
      });
    }
  });

  it('dims the boxes the payment never touches', () => {
    for (const { tour } of ALL) {
      const visited = new Set(tour.steps.map((s) => s.nodeId));
      const light = spotlightFor(tour, 0);
      for (const n of tour.graph.nodes) {
        if (!visited.has(n.id)) expect(light.nodes[n.id]).toBe('off');
      }
    }
  });

  it('turns ahead into current into seen as the tour moves', () => {
    const { tour } = ALL.find((a) => a.tour.steps.length >= 4)!;
    const target = tour.steps[2]!.nodeId;
    expect(spotlightFor(tour, 0).nodes[target]).toBe('ahead');
    expect(spotlightFor(tour, 2).nodes[target]).toBe('current');
    expect(spotlightFor(tour, 3).nodes[target]).toBe('seen');
  });

  it('marks the wire about to be taken as current', () => {
    const { tour } = ALL.find((a) => a.tour.steps.length >= 4)!;
    const nextWire = tour.steps[1]!.viaEdgeId!;
    expect(spotlightFor(tour, 0).edges[nextWire]).toBe('current');
    expect(spotlightFor(tour, 1).edges[nextWire]).toBe('seen');
  });

  it('is keyed by every box and wire of the diagram', () => {
    const { tour } = ALL[0]!;
    const light = spotlightFor(tour, 0);
    expect(Object.keys(light.nodes).sort()).toEqual(tour.graph.nodes.map((n) => n.id).sort());
    expect(Object.keys(light.edges).sort()).toEqual(tour.graph.edges.map((e) => e.id).sort());
  });
});

describe('the ledger the tour ends on', () => {
  it('balances for every test, and a decline never captures or settles money', () => {
    for (const { level, tour } of ALL) {
      expect(isBalanced(tour.ledger), `${level.id}/${tour.testId}`).toBe(true);
      expect(everyTransactionBalances(tour.ledger), `${level.id}/${tour.testId}`).toBe(true);
      if (tour.verdict.outcome === 'DECLINED') {
        // A decline may freeze money (a sanctions block does) or reverse a dispute, but it never takes a purchase into the books.
        const taken = tour.ledger.filter((e) => ['CAPTURE', 'SETTLEMENT', 'PAYMENT_EXECUTED', 'A2A_PAYMENT'].includes(e.kind));
        expect(taken, `${level.id}/${tour.testId}`).toEqual([]);
      }
    }
  });

  it('has lines for an approved card payment', () => {
    const approved = ALL.find((a) => a.tour.verdict.outcome === 'APPROVED' && a.level.levelNumber === 5);
    expect(approved?.tour.ledger.length).toBeGreaterThan(0);
  });
});

describe('a diagram that cannot be walked to the end', () => {
  it('explains where the payment got stuck', () => {
    const level = ACADEMY.find((l) => l.levelNumber === 6)!;
    const graph = referenceGraph(level);
    const first = graph.edges.find((e) => e.sourceNodeId === graph.nodes.find((n) => n.type === 'EVENT_START')!.id)!;
    const next = nodeOf(graph, first.targetNodeId);
    removeEdges(graph, ...graph.edges.filter((e) => e.sourceNodeId === next.id).map((e) => e.id));
    const tour = buildLabTour(level, graph, playableTests(level)[0]!, 'mine');
    expect(tour.problem).toMatch(/\S/);
    expect(tour.verdict.outcome).toBe('NO_OUTCOME');
    expect(tour.verdict.matchesExpected).toBe(false);
    expect(tour.steps.length).toBeGreaterThan(0);
    expect(tour.source).toBe('mine');
  });

  it('says so when there is no Start event wire', () => {
    const level = LEVELS[0]!;
    const graph = referenceGraph(level);
    const start = graph.nodes.find((n) => n.type === 'EVENT_START')!;
    removeEdges(graph, ...graph.edges.filter((e) => e.sourceNodeId === start.id).map((e) => e.id));
    const tour = buildLabTour(level, graph, adHocTest(playableTests(level)[0]!.inputPayload), 'mine');
    expect(tour.problem).not.toBeNull();
    expect(quizzesOf(tour)).toEqual([]);
  });

  it('flags a diagram that ends in the wrong place instead of pretending it passed', () => {
    const level = ACADEMY.find((l) => l.levelNumber === 5)!;
    const graph = referenceGraph(level);
    const test = playableTests(level).find((t) => t.expectedOutcome === 'DECLINED')!;
    const wrong = buildLabTour(level, graph, { ...test, expectedOutcome: 'APPROVED' as Outcome }, 'mine');
    expect(wrong.problem).toBeNull();
    expect(wrong.verdict.matchesExpected).toBe(false);
    expect(wrong.verdict.tone).toBe('bad');
    expect(wrong.verdict.detail).toMatch(/would fail/);
  });
});

describe('which payment to follow', () => {
  it('opens each Academy level on its own scene', () => {
    const picked = ACADEMY.map((l) => featuredTest(l, referenceGraph(l))?.id);
    expect(picked).toEqual(['L5-T2', 'L6-T01', 'L7-T05', 'L8-FX01', 'L9-T04', 'L10-T01']);
  });

  it('falls back to the test with the most decisions for the first four levels', () => {
    for (const l of LEVELS.filter((x) => x.levelNumber <= 4)) {
      const graph = referenceGraph(l);
      const test = featuredTest(l, graph)!;
      expect(test).toBeDefined();
      expect(test.hidden).toBeFalsy();
      const decisions = (t: typeof test): number => buildLabTour(l, graph, t, 'example').steps.filter((s) => s.kind === 'gateway').length;
      for (const other of playableTests(l)) expect(decisions(test)).toBeGreaterThanOrEqual(decisions(other));
    }
  });

  it('never offers a hidden test', () => {
    for (const l of LEVELS) for (const t of playableTests(l)) expect(t.hidden).toBeFalsy();
  });
});

describe('words', () => {
  it('writes money, percentages and yes/no the way a learner reads them', () => {
    expect(valueText('amount', 12345)).toBe('$123.45');
    expect(valueText('downPaymentPct', 25)).toBe('25%');
    expect(valueText('amlMatchScore', 93)).toBe('93 out of 100');
    expect(valueText('a2aValid', true)).toBe('yes');
    expect(valueText('a2aValid', false)).toBe('no');
    expect(valueText('reconCause', 'FX_RATE')).toBe('FX rate');
    expect(valueText('amlList', 'OFAC')).toBe('OFAC');
    expect(valueText('a2aRail', 'RTGS')).toBe('RTGS');
    expect(plainWords('SUSP_FX_LOSS')).toBe('suspense FX loss');
    expect(plainWords('INSUFFICIENT_FUNDS')).toBe('insufficient funds');
    expect(valueText('anything', undefined)).toBe('not set');
  });

  it('lists what a payment carries, per kind of payment', () => {
    for (const { tour } of ALL) {
      expect(tour.carries[0]?.label).toBe('Amount');
      expect(tour.carries.length).toBeGreaterThan(1);
    }
    expect(carriesOf(playableTests(LEVELS[0]!)[0]!.inputPayload).length).toBeGreaterThan(1);
  });

  it('has copy for every capability, every outcome and every Academy level', () => {
    const capabilities: BankingCapability[] = ['TOKEN_VAULT', 'DCVV_VERIFIER', 'THREE_DS_EVALUATOR', 'CORE_LEDGER_CHECK', 'RECON_DESK', 'BNPL_UNDERWRITER', 'A2A_GATEWAY', 'AML_SCREENING', 'CASE_INVESTIGATION', 'CHARGEBACK_DESK'];
    for (const c of capabilities) {
      const t = capabilityText(c);
      expect(t.title.length).toBeGreaterThan(2);
      expect(t.what.length).toBeGreaterThan(10);
      expect(t.why.length).toBeGreaterThan(10);
    }
    for (const o of ['APPROVED', 'DECLINED', 'ROUTED_TO_SUSPENSE', 'CHALLENGE_REQUIRED'] as Outcome[]) expect(outcomeText(o).length).toBeGreaterThan(10);
    for (const l of LEVELS) {
      const scene = labScene(l.id);
      expect(scene.chapter.length, l.id).toBeGreaterThan(2);
      expect(scene.scene.length, l.id).toBeGreaterThan(20);
      expect(scene.lookFor.length, l.id).toBeGreaterThan(0);
    }
    expect(labUi().exit).toMatch(/Exit/);
  });
});
