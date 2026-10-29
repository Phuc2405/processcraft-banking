import { describe, expect, it } from 'vitest';
import { LEVELS, REFERENCE_SOLUTIONS } from '../../data/seedChallenges';
import type { ChallengeLevel, EvaluationResult } from '../../types/processLearning';
import { evaluateChallenge } from '../evaluator';
import {
  DEF,
  edgeOf,
  level,
  makeEdge,
  makeNode,
  nodeOf,
  referenceGraph,
  removeEdges,
  removeNodes,
} from './graphHelpers';

const FIXED = { now: () => new Date('2026-10-10T03:00:00Z'), newId: () => 'eval_fixed' };

const failedIds = (r: EvaluationResult): string[] => r.testResults.filter((t) => !t.passed).map((t) => t.testCaseId);
const feedback = (r: EvaluationResult): string => r.feedbackLogs.map((l) => l.message).join('\n');
const anomalyTypes = (r: EvaluationResult): string[] => r.detectedAnomalies.map((a) => a.type);

// The three reference solutions

describe('reference solutions', () => {
  it.each(LEVELS.map((l) => [`Level ${l.levelNumber}: ${l.title}`, l] as const))(
    '%s scores 100/100',
    (_name, lvl) => {
      const ref = REFERENCE_SOLUTIONS.find((r) => r.challengeId === lvl.id)!;
      const result = evaluateChallenge(ref.graph, lvl);

      expect(result.passed).toBe(true);
      expect(result.correctnessScore).toBe(100);
      expect(result.efficiencyScore).toBe(100);
      expect(result.passCount).toBe(lvl.testSuite.length);
      expect(result.failCount).toBe(0);
      expect(result.detectedAnomalies.filter((a) => a.severity === 'ERROR')).toEqual([]);
      expect(result.feedbackLogs.filter((l) => l.level === 'ERROR' || l.level === 'WARN')).toEqual([]);
      expect(result.challengeId).toBe(lvl.id);
      expect(result.graphId).toBe(ref.graph.id);
    },
  );

  it.each(LEVELS.map((l) => [`Level ${l.levelNumber}`, l] as const))(
    '%s: every test ends with the outcome it expects, inside its latency limit',
    (_name, lvl) => {
      const result = evaluateChallenge(REFERENCE_SOLUTIONS.find((r) => r.challengeId === lvl.id)!.graph, lvl);
      for (const t of lvl.testSuite) {
        const r = result.testResults.find((x) => x.testCaseId === t.id)!;
        expect(r.actualOutcome, t.id).toBe(t.expectedOutcome);
        expect(r.latencyMs, t.id).toBeLessThanOrEqual(t.maxLatencyMs);
        expect(r.failureReasons, t.id).toEqual([]);
      }
    },
  );

  it('records a replayable trace for every test: ordered, timestamped steps ending at an End event', () => {
    const lvl = level(2);
    const result = evaluateChallenge(referenceGraph(lvl), lvl);
    const visible = result.testResults.filter((r) => !lvl.testSuite.find((t) => t.id === r.testCaseId)!.hidden);
    expect(visible.length).toBe(7); // L2-T08 to T10 are hidden and carry no trace
    for (const r of visible) {
      expect(r.tokens.length).toBeGreaterThan(0);
      const token = r.tokens[0]!;
      expect(token.executionPathHistory[0]!.nodeId).toBe('n_start');
      expect(token.state).toBe('COMPLETED');
      expect(token.finalOutcome).toBe(r.actualOutcome);
      let clock = 0;
      token.executionPathHistory.forEach((step, i) => {
        expect(step.seq).toBe(i + 1);
        expect(step.enteredAtMs).toBeGreaterThanOrEqual(clock);
        clock = step.enteredAtMs + step.durationMs;
      });
      expect(clock).toBe(token.elapsedMs);
    }
  });

  it('explains each decision in the trace, so a replay can say why a branch was taken', () => {
    const lvl = level(1);
    const result = evaluateChallenge(referenceGraph(lvl), lvl);
    const expired = result.testResults.find((r) => r.testCaseId === 'L1-T2')!;
    const decision = expired.tokens[0]!.executionPathHistory.find((s) => s.nodeId === 'n_xor_dcvv')!;
    expect(decision.note).toContain("dcvvStatus = 'EXPIRED'");
    expect(decision.note).toContain('default edge e6');
  });

  it('does not mutate the graph or the level, and is deterministic', () => {
    const lvl = level(1);
    const graph = referenceGraph(lvl);
    const graphBefore = JSON.stringify(graph);
    const levelBefore = JSON.stringify(lvl);
    const a = evaluateChallenge(graph, lvl, FIXED);
    const b = evaluateChallenge(graph, lvl, FIXED);
    expect(JSON.stringify(graph)).toBe(graphBefore);
    expect(JSON.stringify(lvl)).toBe(levelBefore);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// Flawed diagrams: they must fail, and say why

describe('flawed diagrams: Level 1', () => {
  it('missing dCVV check: fails with diagnostics that name the skipped step and the wrong outcome', () => {
    const lvl = level(1);
    const g = referenceGraph(lvl);
    removeNodes(g, 'n_dcvv', 'n_xor_dcvv');
    g.edges.push(makeEdge('x1', ['n_vault', 'out'], ['n_ledger', 'in']));

    const r = evaluateChallenge(g, lvl);

    expect(r.passed).toBe(false);
    expect(failedIds(r)).toEqual(['L1-T1', 'L1-T2', 'L1-T3']);
    expect(r.passCount).toBe(2);
    expect(r.failCount).toBe(3);
    expect(r.correctnessScore).toBe(40); // 2 of 5 tests, no anomalies
    expect(r.efficiencyScore).toBe(0); // only scored once the level passes

    const text = feedback(r);
    expect(text).toContain('has to pass through the dCVV Verifier, but your diagram skipped it');
    expect(text).toContain('Expired dCVV (61 s old): Expected DECLINED but the transaction ended APPROVED');
    expect(text).toContain('must not reach the Core Ledger Check');
    expect(text).toContain('Path: Payment Request → Token Vault Lookup → Core Ledger Check');
  });

  it('vault error port left unwired: reports an unhandled exception and costs 10 points', () => {
    const lvl = level(1);
    const g = referenceGraph(lvl);
    removeEdges(g, 'e3');

    const r = evaluateChallenge(g, lvl);

    expect(failedIds(r)).toEqual(['L1-T4']);
    expect(r.testResults.find((t) => t.testCaseId === 'L1-T4')!.failureReasons).toContain('EXCEPTION');
    const anomaly = r.detectedAnomalies.find((a) => a.type === 'UNHANDLED_EXCEPTION')!;
    expect(anomaly.severity).toBe('ERROR');
    expect(anomaly.nodeId).toBe('n_vault');
    expect(r.correctnessScore).toBe(70); // 4 of 5 = 80, minus 10 for one distinct anomaly
    expect(feedback(r)).toContain("Connect the Token Vault's error port to an End event");
  });

  it('explains a hidden test without revealing its inputs', () => {
    const lvl = level(1);
    const g = referenceGraph(lvl);
    removeEdges(g, 'e3');

    const r = evaluateChallenge(g, lvl);
    const lines = r.feedbackLogs.filter((l) => l.testCaseId === 'L1-T4').map((l) => l.message);

    expect(lines.length).toBeGreaterThan(0);
    const text = lines.join('\n');
    expect(text).toContain('(hidden test)');
    expect(text).toContain('this hidden test covers: exception');
    expect(text).toContain('Unknown DPAN (no vault mapping) (hidden test)'); // the name is always shown
    expect(text).not.toContain('5412759999990000'); // the DPAN
    expect(text).not.toContain('****'); // no card digits, not even masked
    expect(text).not.toContain('Path:');
    expect(text).not.toContain('The vault has no record of this DPAN'); // the description is withheld
    // The trace carries the payload, so it is withheld too.
    expect(r.testResults.find((t) => t.testCaseId === 'L1-T4')!.tokens).toEqual([]);
    expect(evaluateChallenge(g, lvl, { revealHidden: true }).testResults.find((t) => t.testCaseId === 'L1-T4')!.tokens.length).toBeGreaterThan(0);
  });

  it('reveals hidden-test detail only when an authoring tool asks for it', () => {
    const lvl = level(1);
    const g = referenceGraph(lvl);
    // Funds check always says yes: the hidden insufficient-funds test (L1-T5) now ends APPROVED.
    removeEdges(g, 'e8', 'e9');
    g.edges.push(makeEdge('x1', ['n_ledger', 'out'], ['n_end_approved', 'in']));
    removeNodes(g, 'n_xor_ledger');

    const hidden = evaluateChallenge(g, lvl);
    const shown = evaluateChallenge(g, lvl, { revealHidden: true });

    expect(failedIds(hidden)).toEqual(['L1-T5']);
    expect(feedback(hidden)).not.toContain('Path:');
    expect(feedback(shown)).toContain('Path: Payment Request');
  });

  it('a valid-looking but bloated diagram passes with a lower efficiency score and a hint', () => {
    const lvl = level(1);
    const g = referenceGraph(lvl);
    // An extra pass-through decision between the ledger check and the funds decision.
    removeEdges(g, 'e7');
    g.nodes.push(makeNode(DEF.XOR, 'n_pad', 'Pass-through'));
    g.edges.push(
      makeEdge('x1', ['n_ledger', 'out'], ['n_pad', 'in_1']),
      makeEdge('x2', ['n_pad', 'out_1'], ['n_xor_ledger', 'in_1']),
    );

    const r = evaluateChallenge(g, lvl);

    expect(r.passed).toBe(true);
    expect(r.correctnessScore).toBe(100);
    // nodes: 5 / 6 = 0.8333. latency: benchmark 29.6 ms vs 30.0 ms measured = 0.9867. Equal weights.
    expect(r.efficiencyScore).toBe(91);
    expect(feedback(r)).toContain('uses 6 nodes; the benchmark is 5');
  });
});

describe('flawed diagrams: Level 2', () => {
  it('AND join starved by an early decline: reports a deadlock and names the branch that never arrives', () => {
    const lvl = level(2);
    const g = referenceGraph(lvl);
    removeNodes(g, 'n_xor_ledger', 'n_end_challenge');
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

    const r = evaluateChallenge(g, lvl);

    expect(r.passed).toBe(false);
    expect(anomalyTypes(r)).toContain('DEADLOCK');
    const deadlock = r.detectedAnomalies.find((a) => a.type === 'DEADLOCK')!;
    expect(deadlock.severity).toBe('ERROR');
    expect(deadlock.nodeId).toBe('n_join');
    expect(deadlock.message).toContain("'3DS path?' (edge f5)"); // the branch that never arrives
    // Every non-authenticated test deadlocks; the authenticated happy paths still pass.
    expect(failedIds(r)).toEqual(['L2-T03', 'L2-T04', 'L2-T06', 'L2-T07', 'L2-T08', 'L2-T09', 'L2-T10']);
    expect(r.testResults.find((t) => t.testCaseId === 'L2-T03')!.failureReasons).toContain('DEADLOCK');
    expect(feedback(r)).toContain('Make sure every branch into the join is taken on every path');
    expect(r.correctnessScore).toBe(20); // 3 of 10 = 30, minus 10
  });

  it('a condition that reads the hidden fraud label is rejected before simulation', () => {
    const lvl = level(2);
    const g = referenceGraph(lvl);
    edgeOf(g, 'e3').conditionExpression = 'authenticated == true && isFraud == false';

    const r = evaluateChallenge(g, lvl);

    const found = r.detectedAnomalies.find((a) => a.type === 'INVALID_EXPRESSION' && a.edgeId === 'e3')!;
    expect(found.severity).toBe('ERROR');
    expect(found.message).toContain("'isFraud' cannot be used in conditions");
    expect(r.passed).toBe(false);
  });

  it('approving everything leaks fraud, and says so', () => {
    const lvl = level(2);
    const g = referenceGraph(lvl);
    g.edges = [makeEdge('x1', ['n_start', 'out'], ['n_end_approved', 'in'])];
    g.nodes = g.nodes.filter((n) => ['n_start', 'n_end_approved'].includes(n.id));

    const r = evaluateChallenge(g, lvl);

    expect(anomalyTypes(r)).toContain('FRAUD_LEAKAGE');
    expect(feedback(r)).toContain('this was a fraudulent transaction and your diagram approved it');
    expect(r.passed).toBe(false);
  });

  it('a mistyped condition suggests the fix', () => {
    const lvl = level(2);
    const g = referenceGraph(lvl);
    edgeOf(g, 'e3').conditionExpression = 'authenticatd == true';
    edgeOf(g, 'e4').conditionExpression = "threeDsPath == 'challenge'";

    const r = evaluateChallenge(g, lvl);
    const text = r.detectedAnomalies.map((a) => a.message).join('\n');

    expect(text).toContain("Did you mean 'authenticated'?");
    expect(text).toContain("Did you mean 'CHALLENGE'?");
  });
});

describe('flawed diagrams: Level 3', () => {
  it('"retry until it matches": the loop is reported once, and the circling node is named', () => {
    const lvl = level(3);
    const g = referenceGraph(lvl);
    removeEdges(g, 'e4', 'e5', 'e6');
    removeNodes(g, 'n_end_amount', 'n_end_missing', 'n_end_dup');
    g.edges.push(makeEdge('x1', ['n_xor_recon', 'out_2'], ['n_recon', 'in'], { isDefault: true }));

    const r = evaluateChallenge(g, lvl);

    const loops = r.detectedAnomalies.filter((a) => a.type === 'INFINITE_LOOP');
    expect(loops).toHaveLength(1); // five break tests, one distinct bug
    expect(loops[0]!.message).toContain('also in 4 other tests');
    expect(failedIds(r)).toEqual(['L3-T5', 'L3-T6', 'L3-T7', 'L3-T8', 'L3-T9']);
    expect(feedback(r)).toContain('The transaction kept circling');
    expect(feedback(r)).toContain("visiting 'Recon Desk (3-Way)'");
    expect(r.correctnessScore).toBe(34); // 4 of 9 = 44, minus 10
  });

  it('tolerance left at the default 0: fails the two tolerance tests and shows the facts the decision saw', () => {
    const lvl = level(3);
    const g = referenceGraph(lvl);
    nodeOf(g, 'n_recon').configParams.toleranceMinor = 0;

    const r = evaluateChallenge(g, lvl);

    expect(failedIds(r)).toEqual(['L3-T3', 'L3-T4']);
    expect(r.detectedAnomalies).toEqual([]);
    expect(r.correctnessScore).toBe(78); // 7 of 9
    const text = feedback(r);
    expect(text).toContain('2c rounding gap, inside tolerance: Expected APPROVED but the transaction ended ROUTED_TO_SUSPENSE');
    expect(text).toContain("reconStatus = 'BREAK_AMOUNT'");
  });

  it('wrong reason code: the outcome is right but the queue is wrong', () => {
    const lvl = level(3);
    const g = referenceGraph(lvl);
    nodeOf(g, 'n_end_missing').configParams.reasonCode = 'SUSP_AMOUNT_VARIANCE';

    const r = evaluateChallenge(g, lvl);

    expect(failedIds(r)).toEqual(['L3-T7', 'L3-T8']);
    expect(r.testResults.find((t) => t.testCaseId === 'L3-T7')!.failureReasons).toEqual(['WRONG_REASON_CODE']);
    expect(feedback(r)).toContain("The reason code is 'SUSP_AMOUNT_VARIANCE' but this case belongs in 'SUSP_MISSING_LEG'");
  });

  it('a decision that reads a fact before its producer has run is flagged', () => {
    const lvl = level(3);
    const g = referenceGraph(lvl);
    // Start goes straight to the decision: it reads reconStatus before any Recon Desk has run.
    removeEdges(g, 'e1', 'e2');
    g.edges.push(makeEdge('x1', ['n_start', 'out'], ['n_xor_recon', 'in_1']));

    const r = evaluateChallenge(g, lvl);
    const warn = r.feedbackLogs.find((l) => l.level === 'WARN' && l.message.includes("reads 'reconStatus'"))!;

    expect(warn).toBeDefined();
    expect(warn.message).toContain('it comes from the Recon Desk (3-Way). Put that step before this decision.');
  });

  it('weights count: a failed heavy test costs more than a failed light one', () => {
    const base = level(3);
    const weighted: ChallengeLevel = structuredClone(base);
    weighted.testSuite.find((t) => t.id === 'L3-T3')!.weight = 3;
    const g = referenceGraph(base);
    nodeOf(g, 'n_recon').configParams.toleranceMinor = 0; // fails L3-T3 (weight 3) and L3-T4 (weight 1)

    const r = evaluateChallenge(g, weighted);

    expect(r.correctnessScore).toBe(64); // passed weight 7 of 11
  });
});

describe('flawed diagrams and variations: Level 4', () => {
  it('debiting the full price on the Pay-in-4 path turns away the customer the plan exists for', () => {
    const lvl = level(4);
    const g = referenceGraph(lvl);
    nodeOf(g, 'n_ledger_dp').configParams.amountToCheck = 'FULL_AMOUNT';

    const r = evaluateChallenge(g, lvl);

    expect(r.passed).toBe(false);
    expect(failedIds(r)).toEqual(['L4-T3']); // $225.00 down payment would fit, $900.00 does not
    expect(r.testResults.find((t) => t.testCaseId === 'L4-T3')!.failureReasons).toEqual(['WRONG_OUTCOME']);
    expect(r.correctnessScore).toBe(88); // 7 of 8
  });

  it('one shared decline: the outcome is right but the reason code is wrong', () => {
    const lvl = level(4);
    const g = referenceGraph(lvl);
    removeNodes(g, 'n_end_dp_declined');
    g.edges.push(makeEdge('x1', ['n_xor_funds', 'out_3'], ['n_end_card_declined', 'in'], { when: "bnplDecision == 'ELIGIBLE'", priority: 3 }));

    const r = evaluateChallenge(g, lvl);

    expect(failedIds(r)).toEqual(['L4-T4', 'L4-T5']);
    expect(r.testResults.find((t) => t.testCaseId === 'L4-T4')!.failureReasons).toEqual(['WRONG_REASON_CODE']);
    expect(feedback(r)).toContain("The reason code is 'CARD_DECLINED' but this case belongs in 'DOWN_PAYMENT_DECLINED'");
  });

  it('the fallback check set to the first instalment has nothing to debit, so every fallback is declined', () => {
    const lvl = level(4);
    const g = referenceGraph(lvl);
    nodeOf(g, 'n_ledger_card').configParams.amountToCheck = 'FIRST_INSTALMENT';

    const r = evaluateChallenge(g, lvl);

    expect(failedIds(r)).toEqual(['L4-T6', 'L4-T7']); // the hard decline still lands in the right place
    const trace = r.testResults.find((t) => t.testCaseId === 'L4-T6')!.tokens[0]!;
    expect(trace.executionPathHistory.find((s) => s.nodeId === 'n_ledger_card')!.note).toContain('no Pay-in-4 plan was approved');
  });

  it('sending everyone down the Pay-in-4 path leaves no fallback: low scores are declined at the down payment', () => {
    const lvl = level(4);
    const g = referenceGraph(lvl);
    edgeOf(g, 'e3').conditionExpression = 'amount > 0';

    const r = evaluateChallenge(g, lvl);

    // L4-T8 (the hard decline) still lands on CARD_DECLINED by luck of the default branch; the two approvals are lost.
    expect(failedIds(r)).toEqual(['L4-T6', 'L4-T7']);
    expect(r.testResults.find((t) => t.testCaseId === 'L4-T6')!.actualOutcome).toBe('DECLINED');
  });

  it('a minimum score of 700 turns away customers the programme should accept', () => {
    const lvl = level(4);
    const g = referenceGraph(lvl);
    nodeOf(g, 'n_bnpl').configParams.minScore = 700;

    const r = evaluateChallenge(g, lvl);

    expect(failedIds(r)).toEqual(['L4-T2', 'L4-T3', 'L4-T5']);
  });

  it('a separate decision after each ledger check also passes, but costs a node', () => {
    const lvl = level(4);
    const g = referenceGraph(lvl);
    removeNodes(g, 'n_xor_funds');
    g.nodes.push(makeNode(DEF.XOR, 'n_xor_dp', 'Down payment ok?'), makeNode(DEF.XOR, 'n_xor_card', 'Card ok?'));
    g.edges.push(
      makeEdge('y1', ['n_ledger_dp', 'out'], ['n_xor_dp', 'in_1']),
      makeEdge('y2', ['n_xor_dp', 'out_1'], ['n_end_bnpl', 'in'], { when: "ledgerDecision == 'SUFFICIENT'", priority: 1 }),
      makeEdge('y3', ['n_xor_dp', 'out_2'], ['n_end_dp_declined', 'in'], { isDefault: true }),
      makeEdge('y4', ['n_ledger_card', 'out'], ['n_xor_card', 'in_1']),
      makeEdge('y5', ['n_xor_card', 'out_1'], ['n_end_card', 'in'], { when: "ledgerDecision == 'SUFFICIENT'", priority: 1 }),
      makeEdge('y6', ['n_xor_card', 'out_2'], ['n_end_card_declined', 'in'], { isDefault: true }),
    );

    const r = evaluateChallenge(g, lvl);

    expect(r.passed).toBe(true);
    expect(r.correctnessScore).toBe(100);
    expect(r.efficiencyScore).toBeLessThan(100); // 11 nodes against a benchmark of 10
    expect(r.efficiencyScore).toBeGreaterThan(90);
    expect(feedback(r)).toContain('benchmark is 10');
  });

  it('routing on the score instead of the decision also passes, because the checkout always offers 25%', () => {
    const lvl = level(4);
    const g = referenceGraph(lvl);
    edgeOf(g, 'e3').conditionExpression = 'underwritingScore >= 600';

    const r = evaluateChallenge(g, lvl);

    expect(r.correctnessScore).toBe(100);
  });
});

describe('structural problems', () => {
  it('no start event: nothing can run, and the feedback says so', () => {
    const lvl = level(3);
    const g = referenceGraph(lvl);
    removeNodes(g, 'n_start');

    const r = evaluateChallenge(g, lvl);

    expect(anomalyTypes(r)).toContain('MISSING_START_EVENT');
    expect(r.passCount).toBe(0);
    expect(r.testResults.every((t) => t.actualOutcome === 'NO_OUTCOME')).toBe(true);
    expect(feedback(r)).toContain('The diagram has no Start event');
  });

  it('exceeding the palette is a violation that stops the level passing, even if every test passes', () => {
    const lvl = level(3);
    const g = referenceGraph(lvl);
    for (let i = 0; i < 5; i++) g.nodes.push(makeNode(DEF.END, `extra_${i}`, `Extra ${i}`, { outcome: 'DECLINED' }));

    const r = evaluateChallenge(g, lvl);

    expect(r.passCount).toBe(lvl.testSuite.length);
    const violations = r.detectedAnomalies.filter((a) => a.type === 'PALETTE_VIOLATION');
    expect(violations).toHaveLength(2); // too many End nodes, and over the node budget
    expect(r.correctnessScore).toBe(80);
    expect(r.passed).toBe(false);
    // The strays are also unreachable, but that only warns.
    expect(r.detectedAnomalies.filter((a) => a.type === 'UNREACHABLE_NODE').every((a) => a.severity === 'WARNING')).toBe(true);
  });

  it('a locked starter node cannot be edited to change what the level means', () => {
    const lvl = level(1);
    const g = referenceGraph(lvl);
    nodeOf(g, 'n_end_approved').configParams.outcome = 'DECLINED';

    const r = evaluateChallenge(g, lvl);

    const tampered = r.detectedAnomalies.find((a) => a.type === 'INVALID_STRUCTURE')!;
    expect(tampered.message).toContain('is locked, but it was changed');
    expect(r.passed).toBe(false);
  });

  it('a locked starter node cannot be deleted', () => {
    const lvl = level(1);
    const g = referenceGraph(lvl);
    removeNodes(g, 'n_end_declined');

    const r = evaluateChallenge(g, lvl);

    expect(r.detectedAnomalies.some((a) => a.message.includes('was removed. It is locked and must stay.'))).toBe(true);
    expect(r.passed).toBe(false);
  });

  it('marking your own nodes as locked does not get them out of the budget', () => {
    const lvl = level(2);
    const g = referenceGraph(lvl);
    for (let i = 0; i < 6; i++) {
      const n = makeNode(DEF.XOR, `pad_${i}`);
      n.locked = true;
      g.nodes.push(n);
    }

    const r = evaluateChallenge(g, lvl);

    expect(r.detectedAnomalies.some((a) => a.type === 'INVALID_STRUCTURE' && a.message.includes('not one of this level'))).toBe(true);
    expect(anomalyTypes(r)).toContain('PALETTE_VIOLATION');
    expect(r.passed).toBe(false);
  });

  it('out-of-range node settings are reported', () => {
    const lvl = level(1);
    const g = referenceGraph(lvl);
    nodeOf(g, 'n_dcvv').configParams.validityWindowMs = 1; // minimum is 5000

    const r = evaluateChallenge(g, lvl);

    expect(r.detectedAnomalies.some((a) => a.type === 'INVALID_CONFIG' && a.message.includes('must be between 5000'))).toBe(true);
    expect(r.passed).toBe(false);
  });

  it('an edge that leaves a port the node does not have is reported', () => {
    const lvl = level(1);
    const g = referenceGraph(lvl);
    edgeOf(g, 'e2').sourcePortId = 'nope';

    const r = evaluateChallenge(g, lvl);

    expect(r.detectedAnomalies.some((a) => a.type === 'INVALID_STRUCTURE' && a.edgeId === 'e2')).toBe(true);
    expect(r.passed).toBe(false);
  });

  it('a result for a level that has no failures carries no failure feedback and no stale reasons', () => {
    const lvl = level(2);
    const r = evaluateChallenge(referenceGraph(lvl), lvl);
    expect(r.testResults.every((t) => t.failureReasons.length === 0)).toBe(true);
    expect(r.feedbackLogs[0]!.message).toBe('Passed 10 of 10 tests. Correctness 100/100. Level passed. Efficiency 100/100.');
  });
});
