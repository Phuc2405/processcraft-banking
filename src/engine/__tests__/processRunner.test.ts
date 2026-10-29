import { describe, expect, it } from 'vitest';
import { CONDITION_VARIABLES, REFERENCE_SOLUTIONS } from '../../data/seedChallenges';
import type { BankingPayload, DerivedFacts, Id, ProcessGraph, RunnerConfig } from '../../types/processLearning';
import { checkExpression, evaluateExpression, ExpressionError, parseExpression } from '../expression';
import { ProcessRunner, type RunEvent } from '../processRunner';
import {
  adHocTest,
  DEF,
  graphOf,
  level,
  makeEdge,
  makeNode,
  payloadFrom,
  referenceGraph,
  testById,
} from './graphHelpers';

const L1 = level(1);
const L2 = level(2);
const L3 = level(3);

const start = () => makeNode(DEF.START, 'start');
const end = (outcome = 'APPROVED') => makeNode(DEF.END, 'end', 'End', { outcome });

/** start -> one node -> End(APPROVED). Returns the facts the node derived. */
function runNode(
  definitionId: Id,
  payload: BankingPayload,
  config: Record<string, string | number | boolean> = {},
): DerivedFacts {
  const g = graphOf(
    [start(), makeNode(definitionId, 'n', undefined, config), end()],
    [makeEdge('e1', ['start', 'out'], ['n', 'in']), makeEdge('e2', ['n', 'out'], ['end', 'in'])],
  );
  const run = new ProcessRunner(g, adHocTest(payload)).runToCompletion();
  expect(run.anomalies).toEqual([]);
  return run.tokens[0]!.derived;
}

const withAge = (p: BankingPayload, ageMs: number): BankingPayload => {
  p.virtualCard!.vaultEntry!.dcvvIssuedAt = p.clientTimestamp - ageMs;
  return p;
};

// Stepping

describe('step() and runToCompletion()', () => {
  const makeRunner = (testId: Id) => new ProcessRunner(referenceGraph(L1), testById(L1, testId), { runnerConfig: L1.runnerConfig });

  it('one step runs one node and says what it did', () => {
    const runner = makeRunner('L1-T1');
    const first = runner.step();

    expect(first.done).toBe(false);
    expect(first.tokenId).toBe('tok_1');
    expect(first.step!.nodeId).toBe('n_start');
    expect(first.events.map((e) => e.type)).toEqual(['NODE_EXECUTED', 'EDGE_TAKEN']);

    const second = runner.step();
    expect(second.step!.nodeId).toBe('n_vault');
    expect(second.step!.capability).toBe('TOKEN_VAULT');
    expect(second.step!.factsWritten.fpanLast4).toBe('4821');
    expect(second.step!.viaEdgeId).toBe('e1');
  });

  it('stepping to the end gives the same result as runToCompletion()', () => {
    const stepped = makeRunner('L1-T1');
    let steps = 0;
    while (!stepped.step().done) steps++;
    const a = stepped.result();
    const b = makeRunner('L1-T1').runToCompletion();

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.totalSteps).toBe(7); // start, vault, dCVV, decision, ledger, decision, end
    expect(steps + 1).toBe(7);
    expect(a.outcome).toBe('APPROVED');
  });

  it('a finished runner does nothing when stepped again', () => {
    const runner = makeRunner('L1-T2');
    runner.runToCompletion();
    expect(runner.isDone).toBe(true);
    expect(runner.step()).toEqual({ done: true, tokenId: null, step: null, events: [] });
  });

  it('events say why each edge was taken: condition, default, or error port', () => {
    const reasons = (testId: Id): Record<string, string> => {
      const runner = makeRunner(testId);
      runner.runToCompletion();
      return Object.fromEntries(
        runner.events.filter((e): e is Extract<RunEvent, { type: 'EDGE_TAKEN' }> => e.type === 'EDGE_TAKEN').map((e) => [e.edgeId, e.reason]),
      );
    };

    expect(reasons('L1-T1')).toMatchObject({ e1: 'FLOW', e5: 'CONDITION', e8: 'CONDITION' });
    expect(reasons('L1-T2')).toMatchObject({ e6: 'DEFAULT' }); // expired dCVV falls to the default
    expect(reasons('L1-T4')).toMatchObject({ e3: 'ERROR_PORT' }); // unknown DPAN leaves by the error port
  });

  it('never mutates the test payload, and freezes the copy tokens carry', () => {
    const test = testById(L1, 'L1-T1');
    const before = JSON.stringify(test);
    const run = new ProcessRunner(referenceGraph(L1), test, { runnerConfig: L1.runnerConfig }).runToCompletion();
    expect(JSON.stringify(test)).toBe(before);
    expect(Object.isFrozen(run.tokens[0]!.payload)).toBe(true);
    expect(Object.isFrozen(run.tokens[0]!.payload.virtualCard)).toBe(true);
  });
});

// AND gateway

describe('AND gateway', () => {
  const forkJoin = (): ProcessGraph =>
    graphOf(
      [
        start(),
        makeNode(DEF.AND, 'fork', 'Fork'),
        makeNode(DEF.THREE_DS, '3ds'),
        makeNode(DEF.LEDGER, 'ledger'),
        makeNode(DEF.AND, 'join', 'Join'),
        end(),
      ],
      [
        makeEdge('e1', ['start', 'out'], ['fork', 'in_1']),
        makeEdge('e2', ['fork', 'out_1'], ['3ds', 'in']),
        makeEdge('e3', ['fork', 'out_2'], ['ledger', 'in']),
        makeEdge('e4', ['3ds', 'out'], ['join', 'in_1']),
        makeEdge('e5', ['ledger', 'out'], ['join', 'in_2']),
        makeEdge('e6', ['join', 'out_1'], ['end', 'in']),
      ],
    );

  it('forks into one token per branch and joins at the slowest branch', () => {
    const runner = new ProcessRunner(forkJoin(), adHocTest(testById(L2, 'L2-T01').inputPayload));
    const run = runner.runToCompletion();

    expect(run.anomalies).toEqual([]);
    expect(run.outcome).toBe('APPROVED');
    // fork 1 ms, then the slower branch: 3DS 45 ms, then the join step 1 ms.
    expect(run.latencyMs).toBe(47);
    expect(run.tokens.map((t) => t.state)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED']);
    expect(run.tokens).toHaveLength(4); // original, two branches, merged
    expect(run.tokens.filter((t) => t.finalOutcome !== null)).toHaveLength(1); // only the merged token ends

    const forked = runner.events.find((e) => e.type === 'TOKEN_FORKED');
    expect(forked && forked.type === 'TOKEN_FORKED' && forked.childTokenIds).toHaveLength(2);
    const waits = runner.events.filter((e): e is Extract<RunEvent, { type: 'JOIN_WAITING' }> => e.type === 'JOIN_WAITING');
    expect(waits.map((w) => [w.arrived, w.expected])).toEqual([[1, 2], [2, 2]]);
    const released = runner.events.find((e) => e.type === 'JOIN_RELEASED');
    expect(released && released.type === 'JOIN_RELEASED' && released.elapsedMs).toBe(47);
  });

  it('the faster branch arrives at the join first (time order, not creation order)', () => {
    const runner = new ProcessRunner(forkJoin(), adHocTest(testById(L2, 'L2-T01').inputPayload));
    runner.runToCompletion();
    const firstWait = runner.events.find((e) => e.type === 'JOIN_WAITING');
    const waiting = runner.tokens.find((t) => firstWait && firstWait.type === 'JOIN_WAITING' && t.id === firstWait.tokenId)!;
    expect(waiting.executionPathHistory.some((s) => s.capability === 'CORE_LEDGER_CHECK')).toBe(true); // 25 ms branch
  });

  it('merges the facts from both branches', () => {
    const run = new ProcessRunner(forkJoin(), adHocTest(testById(L2, 'L2-T01').inputPayload)).runToCompletion();
    const merged = run.tokens[run.tokens.length - 1]!;
    expect(merged.derived.authenticated).toBe(true); // from the 3DS branch
    expect(merged.derived.ledgerDecision).toBe('SUFFICIENT'); // from the ledger branch
  });

  it('a join that one branch never reaches deadlocks, and names the missing branch', () => {
    const g = graphOf(
      [start(), makeNode(DEF.THREE_DS, '3ds'), makeNode(DEF.LEDGER, 'ledger'), makeNode(DEF.AND, 'join', 'Join'), end()],
      [
        makeEdge('e1', ['start', 'out'], ['3ds', 'in']),
        makeEdge('e2', ['3ds', 'out'], ['join', 'in_1']),
        makeEdge('e3', ['ledger', 'out'], ['join', 'in_2']), // nothing ever reaches 'ledger'
        makeEdge('e4', ['join', 'out_1'], ['end', 'in']),
      ],
    );
    const run = new ProcessRunner(g, adHocTest(testById(L2, 'L2-T01').inputPayload)).runToCompletion();

    expect(run.outcome).toBe('NO_OUTCOME');
    const deadlock = run.anomalies.find((a) => a.type === 'DEADLOCK')!;
    expect(deadlock.nodeId).toBe('join');
    expect(deadlock.message).toContain("'Core Ledger Check' (edge e3)");
    expect(run.tokens.some((t) => t.state === 'DEADLOCKED')).toBe(true);
  });

  it('a token that splits forever is stopped by the token limit', () => {
    // m (XOR) -> f (AND fork) -> { End, back to m }: every lap adds two tokens.
    const g = graphOf(
      [start(), makeNode(DEF.XOR, 'm', 'Merge'), makeNode(DEF.AND, 'f', 'Splitter'), end()],
      [
        makeEdge('e1', ['start', 'out'], ['m', 'in_1']),
        makeEdge('e2', ['m', 'out_1'], ['f', 'in_1']),
        makeEdge('e3', ['f', 'out_1'], ['end', 'in']),
        makeEdge('e4', ['f', 'out_2'], ['m', 'in_2']),
      ],
    );
    const run = new ProcessRunner(g, adHocTest(testById(L2, 'L2-T01').inputPayload)).runToCompletion();
    const loop = run.anomalies.find((a) => a.type === 'INFINITE_LOOP')!;
    expect(loop.message).toContain('keeps splitting');
    expect(run.tokens.length).toBeLessThanOrEqual(L2.runnerConfig.maxTokensPerTest + 2);
  });
});

// Anomalies

describe('anomaly detection', () => {
  const payload = testById(L2, 'L2-T01').inputPayload;

  it('a node with nowhere to go is a dead end', () => {
    const g = graphOf([start(), makeNode(DEF.LEDGER, 'ledger', 'Ledger')], [makeEdge('e1', ['start', 'out'], ['ledger', 'in'])]);
    const run = new ProcessRunner(g, adHocTest(payload)).runToCompletion();
    const a = run.anomalies.find((x) => x.type === 'DEAD_END')!;
    expect(a.nodeId).toBe('ledger');
    expect(run.tokens[0]!.state).toBe('DEADLOCKED');
    expect(run.tokens[0]!.exception!.code).toBe('DEAD_END');
  });

  it('a decision with no matching branch and no default is reported', () => {
    const g = graphOf(
      [start(), makeNode(DEF.XOR, 'x', 'Decide'), end()],
      [makeEdge('e1', ['start', 'out'], ['x', 'in_1']), makeEdge('e2', ['x', 'out_1'], ['end', 'in'], { when: 'riskScore > 1000' })],
    );
    const run = new ProcessRunner(g, adHocTest(payload)).runToCompletion();
    expect(run.anomalies.map((a) => a.type)).toEqual(['NO_MATCHING_BRANCH']);
    expect(run.tokens[0]!.state).toBe('EXCEPTION');
    expect(run.tokens[0]!.exception!.code).toBe('NO_MATCHING_BRANCH');
  });

  it('an unknown DPAN with no error edge is an unhandled exception that names the node', () => {
    const g = graphOf(
      [start(), makeNode(DEF.VAULT, 'v', 'Vault'), end()],
      [makeEdge('e1', ['start', 'out'], ['v', 'in']), makeEdge('e2', ['v', 'out'], ['end', 'in'])],
    );
    const run = new ProcessRunner(g, adHocTest(testById(L1, 'L1-T4').inputPayload)).runToCompletion();
    const a = run.anomalies.find((x) => x.type === 'UNHANDLED_EXCEPTION')!;
    expect(a.nodeId).toBe('v');
    expect(a.message).toContain('no mapping in the token vault');
    expect(a.message).not.toMatch(/\d{4}/); // no card digits in an error message
  });

  it('a condition that does not parse faults the token instead of guessing', () => {
    const g = graphOf(
      [start(), makeNode(DEF.XOR, 'x', 'Decide'), end()],
      [makeEdge('e1', ['start', 'out'], ['x', 'in_1']), makeEdge('e2', ['x', 'out_1'], ['end', 'in'], { when: 'riskScore = 40' })],
    );
    const run = new ProcessRunner(g, adHocTest(payload)).runToCompletion();
    const a = run.anomalies.find((x) => x.type === 'INVALID_EXPRESSION')!;
    expect(a.edgeId).toBe('e2');
    expect(a.message).toContain("Use '==' (two equals signs)");
  });

  it('a cycle is cut off at the step limit and the busiest node is named', () => {
    const cfg: RunnerConfig = { maxStepsPerToken: 10, maxTokensPerTest: 4, outcomePrecedence: ['DECLINED', 'APPROVED'] };
    const g = graphOf(
      [start(), makeNode(DEF.XOR, 'a', 'Ping'), makeNode(DEF.XOR, 'b', 'Pong')],
      [
        makeEdge('e1', ['start', 'out'], ['a', 'in_1']),
        makeEdge('e2', ['a', 'out_1'], ['b', 'in_1']),
        makeEdge('e3', ['b', 'out_1'], ['a', 'in_2']),
      ],
    );
    const run = new ProcessRunner(g, adHocTest(payload), { runnerConfig: cfg }).runToCompletion();
    const loop = run.anomalies.find((a) => a.type === 'INFINITE_LOOP')!;
    expect(run.totalSteps).toBe(10);
    expect(loop.message).toContain('over 10 steps');
    expect(loop.message).toMatch(/visiting '(Ping|Pong)' 5 times/);
    expect(run.tokens[0]!.exception!.code).toBe('STEP_LIMIT_EXCEEDED');
  });

  it('a diagram with no start event reports it and runs nothing', () => {
    const run = new ProcessRunner(graphOf([end()], []), adHocTest(payload)).runToCompletion();
    expect(run.anomalies.map((a) => a.type)).toEqual(['MISSING_START_EVENT']);
    expect(run.tokens).toEqual([]);
    expect(run.outcome).toBe('NO_OUTCOME');
  });

  it('reports a decision that reads a fact nothing has set yet', () => {
    const g = graphOf(
      [start(), makeNode(DEF.XOR, 'x', 'Decide'), end()],
      [
        makeEdge('e1', ['start', 'out'], ['x', 'in_1']),
        makeEdge('e2', ['x', 'out_1'], ['end', 'in'], { when: "dcvvStatus == 'VALID'" }),
        makeEdge('e3', ['x', 'out_2'], ['end', 'in'], { isDefault: true }),
      ],
    );
    const run = new ProcessRunner(g, adHocTest(payload)).runToCompletion();
    expect(run.unsetFactReads).toEqual([{ nodeId: 'x', edgeId: 'e2', fact: 'dcvvStatus' }]);
    expect(run.tokens[0]!.executionPathHistory[1]!.note).toContain('dcvvStatus = not set');
  });
});

// Capability handlers

describe('capability: TOKEN_VAULT', () => {
  it('maps a DPAN to its card and funding account', () => {
    const d = runNode(DEF.VAULT, payloadFrom(L1, 'L1-T1'));
    expect(d).toMatchObject({ tokenStatus: 'RESOLVED', fundingSource: 'DEBIT', fpanLast4: '4821' });
  });

  it('reports a suspended token without raising', () => {
    const p = payloadFrom(L1, 'L1-T1');
    p.virtualCard!.vaultEntry!.status = 'SUSPENDED';
    expect(runNode(DEF.VAULT, p).tokenStatus).toBe('SUSPENDED');
  });

  it('passes a physical card straight through', () => {
    const d = runNode(DEF.VAULT, payloadFrom(L2, 'L2-T01'));
    expect(d).toMatchObject({ tokenStatus: 'NOT_APPLICABLE', fundingSource: 'CREDIT' });
    expect(d.fpanLast4).toBeUndefined();
  });
});

describe('capability: DCVV_VERIFIER', () => {
  it('is valid up to and including the window, expired one millisecond after', () => {
    expect(runNode(DEF.DCVV, withAge(payloadFrom(L1, 'L1-T1'), 60000)).dcvvStatus).toBe('VALID');
    expect(runNode(DEF.DCVV, withAge(payloadFrom(L1, 'L1-T1'), 60001)).dcvvStatus).toBe('EXPIRED');
  });

  it('follows the configured window', () => {
    const p = () => withAge(payloadFrom(L1, 'L1-T1'), 58000);
    expect(runNode(DEF.DCVV, p(), { validityWindowMs: 30000 }).dcvvStatus).toBe('EXPIRED');
    expect(runNode(DEF.DCVV, p(), { validityWindowMs: 120000 }).dcvvStatus).toBe('VALID');
  });

  it('a wrong code is a mismatch, even on a fresh token', () => {
    expect(runNode(DEF.DCVV, payloadFrom(L1, 'L1-T3')).dcvvStatus).toBe('MISMATCH');
  });

  it('a request stamped before the dCVV existed is a mismatch', () => {
    expect(runNode(DEF.DCVV, withAge(payloadFrom(L1, 'L1-T1'), -1)).dcvvStatus).toBe('MISMATCH');
  });

  it('does not apply to physical cards', () => {
    expect(runNode(DEF.DCVV, payloadFrom(L2, 'L2-T01')).dcvvStatus).toBe('NOT_APPLICABLE');
  });
});

describe('capability: THREE_DS_EVALUATOR', () => {
  const at = (risk: number, status?: 'NOT_STARTED' | 'COMPLETED' | 'ABANDONED', cfg = {}) =>
    runNode(
      DEF.THREE_DS,
      { ...payloadFrom(L2, 'L2-T01'), riskScore: risk, ...(status ? { challenge: { status, method: 'OTP' as const } } : {}) },
      cfg,
    );

  it('splits the risk bands at 40 and 80 by default', () => {
    expect(at(39)).toMatchObject({ threeDsPath: 'FRICTIONLESS', authenticated: true, liabilityShift: 'ISSUER' });
    expect(at(40, 'NOT_STARTED')).toMatchObject({ threeDsPath: 'CHALLENGE', authenticated: false, liabilityShift: 'MERCHANT' });
    expect(at(79, 'NOT_STARTED').threeDsPath).toBe('CHALLENGE');
    expect(at(80).threeDsPath).toBe('REJECT');
  });

  it('reads the result of a finished challenge', () => {
    expect(at(65, 'COMPLETED')).toMatchObject({ threeDsPath: 'CHALLENGE_PASSED', authenticated: true, liabilityShift: 'ISSUER' });
    expect(at(65, 'ABANDONED')).toMatchObject({ threeDsPath: 'CHALLENGE_FAILED', authenticated: false });
  });

  it('a completed challenge cannot override a reject', () => {
    expect(at(85, 'COMPLETED').threeDsPath).toBe('REJECT');
  });

  it('follows the configured thresholds', () => {
    const cfg = { frictionlessBelow: 20, rejectAtOrAbove: 50 };
    expect(at(19, undefined, cfg).threeDsPath).toBe('FRICTIONLESS');
    expect(at(25, undefined, cfg).threeDsPath).toBe('CHALLENGE');
    expect(at(50, undefined, cfg).threeDsPath).toBe('REJECT');
  });
});

describe('capability: CORE_LEDGER_CHECK', () => {
  const debit = (amount: number, availableBalance: number) => ({ ...payloadFrom(L2, 'L2-T10'), amount, availableBalance });

  it('approves up to the available balance and places a hold for the amount', () => {
    expect(runNode(DEF.LEDGER, debit(5000, 5000))).toMatchObject({ ledgerDecision: 'SUFFICIENT', authHoldMinor: 5000 });
  });

  it('declines one cent over the balance, with no hold', () => {
    const d = runNode(DEF.LEDGER, debit(5001, 5000));
    expect(d.ledgerDecision).toBe('INSUFFICIENT_FUNDS');
    expect(d.authHoldMinor).toBeUndefined();
  });

  it('credit is limited by the lower of available credit and the limit', () => {
    const credit = { ...payloadFrom(L2, 'L2-T01'), amount: 6000, availableBalance: 10000, creditLimit: 5000 };
    expect(runNode(DEF.LEDGER, credit)).toMatchObject({ ledgerDecision: 'OVER_LIMIT' });
    expect(runNode(DEF.LEDGER, { ...credit, amount: 5000 })).toMatchObject({ ledgerDecision: 'SUFFICIENT', authHoldMinor: 5000 });
  });

  it('judges a virtual card by the account behind it, once the vault has resolved it', () => {
    const p = payloadFrom(L1, 'L1-T1', { amount: 5000, availableBalance: 100000, creditLimit: 4000 });
    p.virtualCard!.vaultEntry!.fundingSource = 'CREDIT';
    const g = graphOf(
      [start(), makeNode(DEF.VAULT, 'v'), makeNode(DEF.LEDGER, 'l'), end()],
      [makeEdge('e1', ['start', 'out'], ['v', 'in']), makeEdge('e2', ['v', 'out'], ['l', 'in']), makeEdge('e3', ['l', 'out'], ['end', 'in'])],
    );
    const run = new ProcessRunner(g, adHocTest(p)).runToCompletion();
    expect(run.tokens[0]!.derived.ledgerDecision).toBe('OVER_LIMIT'); // credit limit 4000 < amount 5000
  });
});

describe('capability: CORE_LEDGER_CHECK, amount to check', () => {
  const L4 = level(4);
  /** start -> [BNPL underwriter] -> ledger(config) -> End. Returns the facts and the ledger's trace note. */
  function runLedger(payload: BankingPayload, config: Record<string, string>, withUnderwriter: boolean) {
    const nodes = [start(), ...(withUnderwriter ? [makeNode(DEF.BNPL, 'u')] : []), makeNode(DEF.LEDGER, 'l', undefined, config), end()];
    const chain = ['start', ...(withUnderwriter ? ['u'] : []), 'l', 'end'];
    const edges = chain.slice(0, -1).map((id, i) => makeEdge(`e${i}`, [id, i === 0 ? 'out' : 'out'], [chain[i + 1]!, 'in']));
    const run = new ProcessRunner(graphOf(nodes, edges), adHocTest(payload)).runToCompletion();
    const token = run.tokens[0]!;
    return { facts: token.derived, note: token.executionPathHistory.find((s) => s.nodeId === 'l')!.note ?? '' };
  }

  it('defaults to the full amount, so Levels 1 to 3 behave as before', () => {
    const p = payloadFrom(L4, 'L4-T3'); // $900.00 purchase, $300.00 in the account
    const { facts } = runLedger(p, {}, true);
    expect(facts.ledgerDecision).toBe('INSUFFICIENT_FUNDS');
  });

  it('first-instalment mode debits only the down payment the underwriter approved', () => {
    const p = payloadFrom(L4, 'L4-T3');
    const { facts, note } = runLedger(p, { amountToCheck: 'FIRST_INSTALMENT' }, true);
    expect(facts).toMatchObject({ ledgerDecision: 'SUFFICIENT', authHoldMinor: 22500 });
    expect(note).toContain('Down payment of $225.00');
  });

  it('first-instalment mode on a credit card is judged against spendable credit', () => {
    const { facts } = runLedger(payloadFrom(L4, 'L4-T5'), { amountToCheck: 'FIRST_INSTALMENT' }, true);
    expect(facts.ledgerDecision).toBe('OVER_LIMIT'); // $150.00 down payment, $120.00 of credit left
    expect(facts.authHoldMinor).toBeUndefined();
  });

  it('first-instalment mode with no approved plan debits nothing and says why', () => {
    // Underwriter not run at all.
    const none = runLedger(payloadFrom(L4, 'L4-T3'), { amountToCheck: 'FIRST_INSTALMENT' }, false);
    expect(none.facts.ledgerDecision).toBe('INSUFFICIENT_FUNDS');
    expect(none.facts.authHoldMinor).toBeUndefined();
    expect(none.note).toContain('no Pay-in-4 plan was approved');
    // Underwriter ran and said no (score 599).
    const ineligible = runLedger(payloadFrom(L4, 'L4-T6'), { amountToCheck: 'FIRST_INSTALMENT' }, true);
    expect(ineligible.facts.bnplDecision).toBe('INELIGIBLE');
    expect(ineligible.facts.ledgerDecision).toBe('INSUFFICIENT_FUNDS');
  });
});

describe('capability: RECON_DESK', () => {
  const recon = (id: Id, cfg = {}) => runNode(DEF.RECON, payloadFrom(L3, id), cfg);

  it('matches within tolerance, inclusive', () => {
    expect(recon('L3-T4', { toleranceMinor: 5 })).toMatchObject({ reconStatus: 'MATCHED', reconVarianceMinor: 5 });
    expect(recon('L3-T4', { toleranceMinor: 4 })).toMatchObject({ reconStatus: 'BREAK_AMOUNT', reconVarianceMinor: 5 });
  });

  it('classifies a missing leg and a duplicate presentment', () => {
    expect(recon('L3-T7').reconStatus).toBe('BREAK_MISSING_LEG');
    expect(recon('L3-T8').reconStatus).toBe('BREAK_MISSING_LEG');
    expect(recon('L3-T9').reconStatus).toBe('BREAK_DUPLICATE');
  });

  it('an exact match needs no tolerance', () => {
    expect(recon('L3-T1')).toMatchObject({ reconStatus: 'MATCHED', reconVarianceMinor: 0 });
  });
});

describe('capability: BNPL_UNDERWRITER', () => {
  const apply = (amount: number, score: number, downPaymentMinor: number, cfg = {}) =>
    runNode(DEF.BNPL, { ...payloadFrom(L2, 'L2-T01'), amount, bnpl: { underwritingScore: score, downPaymentMinor } }, cfg);

  it('approves a Pay-in-4 and collects instalment 1', () => {
    expect(apply(10000, 720, 2500)).toMatchObject({
      bnplDecision: 'ELIGIBLE',
      underwritingScore: 720,
      downPaymentPct: 25,
      installment1Minor: 2500,
      installmentAmountMinor: 2500,
    });
  });

  it('rounds the remaining instalments up', () => {
    expect(apply(10000, 720, 3000).installmentAmountMinor).toBe(2334); // 7000 / 3
  });

  it('one cent short of the 25% down payment is ineligible, with no instalment collected', () => {
    const d = apply(10000, 720, 2499);
    expect(d.bnplDecision).toBe('INELIGIBLE');
    expect(d.installment1Minor).toBeUndefined();
  });

  it('the 25% check is exact for amounts that are not round', () => {
    expect(apply(10001, 720, 2501).bnplDecision).toBe('ELIGIBLE'); // 25.0% of 100.01 is 25.0025
    expect(apply(10001, 720, 2500).bnplDecision).toBe('INELIGIBLE');
  });

  it('a low score is ineligible, and the minimum is configurable', () => {
    expect(apply(10000, 599, 2500).bnplDecision).toBe('INELIGIBLE');
    expect(apply(10000, 650, 2500, { minScore: 700 }).bnplDecision).toBe('INELIGIBLE');
    expect(apply(10000, 650, 2500, { minScore: 600 }).bnplDecision).toBe('ELIGIBLE');
  });

  it('no application on the transaction is ineligible', () => {
    expect(runNode(DEF.BNPL, payloadFrom(L2, 'L2-T01')).bnplDecision).toBe('INELIGIBLE');
  });
});

// Expressions

describe('expressions: evaluation', () => {
  const run = (src: string, scope: Record<string, string | number | boolean | undefined> = {}) =>
    evaluateExpression(parseExpression(src), scope);

  it('evaluates the documented examples', () => {
    expect(run('riskScore < 40', { riskScore: 39 }).value).toBe(true);
    expect(run('riskScore < 40', { riskScore: 40 }).value).toBe(false);
    expect(run('isVirtual == true', { isVirtual: true }).value).toBe(true);
    expect(run("dcvvStatus == 'VALID' && riskScore < 80", { dcvvStatus: 'VALID', riskScore: 79 }).value).toBe(true);
    expect(run('amount >= 100.5', { amount: 100.5 }).value).toBe(true);
    expect(run('dcvvStatus == "VALID"', { dcvvStatus: 'VALID' }).value).toBe(true); // double quotes too
  });

  it('&& binds tighter than ||, and ! binds tighter than ==', () => {
    expect(run('true || false && false').value).toBe(true);
    expect(run('(true || false) && false').value).toBe(false);
    expect(run('!authenticated == true', { authenticated: false }).value).toBe(true);
  });

  it('an unset fact equals nothing, fails ordering, counts as false, and is reported', () => {
    const eq = run("dcvvStatus == 'VALID'");
    expect(eq).toEqual({ value: false, unset: ['dcvvStatus'] });
    expect(run("dcvvStatus != 'VALID'").value).toBe(true);
    expect(run('riskScore < 40').value).toBe(false);
    expect(run('authenticated').value).toBe(false);
  });

  it('refuses to compare across types at run time', () => {
    expect(() => run("riskScore == 'high'", { riskScore: 5 })).toThrow(ExpressionError);
    expect(() => run('riskScore', { riskScore: 5 })).toThrow('must evaluate to true or false');
  });
});

describe('expressions: parsing and checking', () => {
  const problems = (src: string): string[] => checkExpression(src, CONDITION_VARIABLES).errors;
  const parseError = (src: string): string => {
    try {
      parseExpression(src);
    } catch (e) {
      return (e as Error).message;
    }
    return '';
  };

  it('explains common syntax slips in plain words', () => {
    expect(parseError('riskScore = 40')).toContain("Use '==' (two equals signs)");
    expect(parseError('riskScore < 40 and amount > 5')).toContain("Use '&&' instead of the word 'and'");
    expect(parseError('riskScore < 40 or amount > 5')).toContain("Use '||' instead of the word 'or'");
    expect(parseError('a & b')).toContain("Use '&&' for AND");
    expect(parseError("dcvvStatus == 'VALID")).toContain('missing its closing');
    expect(parseError('(riskScore < 40')).toContain("Missing a closing ')'");
    expect(parseError('riskScore <')).toContain('ends too early');
    expect(parseError('   ')).toContain('empty');
  });

  it('suggests the variable you probably meant', () => {
    expect(problems('riskScor < 40')).toEqual(["Unknown variable 'riskScor'. Did you mean 'riskScore'?"]);
    expect(problems('DcvvStatus == "VALID"')).toEqual(["Unknown variable 'DcvvStatus'. Did you mean 'dcvvStatus'?"]);
    expect(problems('not authenticated')).toEqual(["Use '!' instead of the word 'not'"]);
  });

  it('rejects variables the learner may not read, with the reason', () => {
    expect(problems("rawCvv == '123'")[0]).toContain("'rawCvv' cannot be used in conditions. PCI data");
    expect(problems('isFraud == true')[0]).toContain("'isFraud' cannot be used in conditions. Ground-truth label");
  });

  it('catches type mistakes before anything runs', () => {
    expect(problems("riskScore == 'high'")).toEqual(["Cannot compare a number with a string using '=='"]);
    expect(problems("authenticated == 'true'")).toEqual(["Cannot compare a boolean with a string using '=='"]);
    expect(problems("riskScore < 'high'")[0]).toContain("'<' needs number values");
    expect(problems('riskScore && authenticated')[0]).toContain("'&&' needs boolean values");
    expect(problems('riskScore')[0]).toContain('A condition must be true or false');
  });

  it('catches enum values that can never match, and suggests the right case', () => {
    expect(problems("dcvvStatus == 'valid'")[0]).toContain("will never match. Did you mean 'VALID'?");
    expect(problems("dcvvStatus == 'GOOD'")[0]).toContain('can only be VALID, EXPIRED, MISMATCH, NOT_APPLICABLE');
  });

  it('accepts every condition used by the reference solutions', () => {
    const conditions = REFERENCE_SOLUTIONS.flatMap((r) => r.graph.edges.map((e) => e.conditionExpression)).filter(
      (c): c is string => c !== undefined,
    );
    expect(conditions.length).toBeGreaterThan(8);
    for (const c of conditions) expect(problems(c), c).toEqual([]);
  });
});
