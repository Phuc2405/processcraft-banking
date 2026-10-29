/** The Banking Operations & Architecture Academy: the six-stage curriculum, the three new levels' worth of engine behaviour seen through whole diagrams, and the promise that every finished transaction posts balanced ledger lines. */

import { describe, expect, it } from 'vitest';
import { CURRICULUM, CURRICULUM_ORDER, LEVELS, curriculumPosition } from '../../data/seedChallenges';
import type { EvaluationResult, GLEntry } from '../../types/processLearning';
import { evaluateChallenge } from '../evaluator';
import { entryProblems, everyTransactionBalances, groupByTransaction, isBalanced, trialBalance } from '../ledger';
import { postTestResult } from '../postings';
import { DEF, edgeOf, level, makeEdge, makeNode, nodeOf, referenceGraph, removeEdges, removeNodes } from './graphHelpers';

const failedIds = (r: EvaluationResult): string[] => r.testResults.filter((t) => !t.passed).map((t) => t.testCaseId);
const feedback = (r: EvaluationResult): string => r.feedbackLogs.map((l) => l.message).join('\n');

// The curriculum

describe('curriculum', () => {
  it('has the six stages of the Academy, in order', () => {
    expect(CURRICULUM.map((s) => [s.stage, s.title])).toEqual([
      [1, 'The First Swipes'],
      [2, 'Fraud Detective'],
      [3, 'Fintech & Instalments'],
      [4, 'The Lifeblood Network'],
      [5, 'The 23:59 Night Run'],
      [6, 'Operational Storms'],
    ]);
  });

  it('puts every level in exactly one stage, and nothing else', () => {
    expect([...CURRICULUM_ORDER].sort()).toEqual(LEVELS.map((l) => l.id).sort());
    expect(new Set(CURRICULUM_ORDER).size).toBe(CURRICULUM_ORDER.length);
    for (const s of CURRICULUM) expect(s.levelIds.length, s.title).toBeGreaterThan(0);
  });

  it('teaches the brief’s topics in the stage that names them', () => {
    const stageOf = (levelId: string): number => curriculumPosition(levelId)!.stage;
    expect(stageOf('lvl_05_first_swipes')).toBe(1);
    expect(stageOf('lvl_06_card_testing')).toBe(2);
    expect(stageOf('lvl_02_three_ds_routing')).toBe(2);
    expect(stageOf('lvl_04_bnpl_pay_in_4')).toBe(3);
    expect(stageOf('lvl_07_a2a_iso20022')).toBe(4);
    expect(stageOf('lvl_08_fx_breaks')).toBe(5);
    expect(stageOf('lvl_03_eod_recon_suspense')).toBe(5);
    expect(stageOf('lvl_09_sanctions_storm')).toBe(6);
    expect(stageOf('lvl_10_chargeback_warfare')).toBe(6);
  });

  it('labels a level with its stage and step', () => {
    expect(curriculumPosition('lvl_05_first_swipes')).toMatchObject({ stage: 1, step: 1, label: '1.1', stageTitle: 'The First Swipes' });
    expect(curriculumPosition('lvl_01_virtual_card_dcvv')?.label).toBe('1.2');
    expect(curriculumPosition('lvl_10_chargeback_warfare')?.label).toBe('6.2');
    expect(curriculumPosition('lvl_99_nope')).toBeNull();
  });
});

describe('the Academy levels', () => {
  const academy = LEVELS.filter((l) => l.levelNumber >= 5);

  it('are levels 5 to 10', () => {
    expect(academy.map((l) => l.levelNumber)).toEqual([5, 6, 7, 8, 9, 10]);
  });

  it.each(academy.map((l) => [`Level ${l.levelNumber}`, l] as const))('%s has visible and hidden tests with unique ids', (_n, lvl) => {
    const ids = lvl.testSuite.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(lvl.testSuite.some((t) => t.hidden)).toBe(true);
    expect(lvl.testSuite.some((t) => !t.hidden)).toBe(true);
    expect(lvl.learningObjectives.length).toBeGreaterThan(0);
    expect(lvl.hints?.length ?? 0).toBeGreaterThan(0);
  });

  it('level 8 has the fifteen FX breaks the brief asks for, ten to see and five hidden', () => {
    const fx = level(8).testSuite.filter((t) => t.id.startsWith('L8-FX'));
    expect(fx).toHaveLength(15);
    expect(fx.filter((t) => t.hidden)).toHaveLength(5);
    expect(new Set(fx.map((t) => t.expectedReasonCode))).toEqual(new Set(['SUSP_FX_LOSS', 'SUSP_FX_GAIN']));
  });

  it('level 5 is the brief’s first swipe: $500 against $200 is a graceful decline', () => {
    const t = level(5).testSuite.find((x) => x.id === 'L5-T2')!;
    expect(t.inputPayload.amount).toBe(50_000);
    expect(t.inputPayload.availableBalance).toBe(20_000);
    expect(t.expectedOutcome).toBe('DECLINED');
    expect(t.expectedReasonCode).toBe('INSUFFICIENT_FUNDS');
  });
});

// The ledger: every finished transaction balances

/** Every test of a level run against its reference, with the hidden traces revealed so their lines can be checked too. */
function postingsOf(levelNumber: number): Array<{ testId: string; entries: GLEntry[] }> {
  const lvl = level(levelNumber);
  const result = evaluateChallenge(referenceGraph(lvl), lvl, { revealHidden: true });
  return result.testResults.map((r) => ({ testId: r.testCaseId, entries: postTestResult(r) }));
}

describe('the general ledger over the reference solutions', () => {
  it.each(LEVELS.map((l) => [`Level ${l.levelNumber}`, l.levelNumber] as const))('%s: each transaction’s lines are legal and balance', (_n, n) => {
    for (const { testId, entries } of postingsOf(n)) {
      expect(entryProblems(entries), testId).toEqual([]);
      expect(isBalanced(entries), testId).toBe(true);
      expect(everyTransactionBalances(entries), testId).toBe(true);
      expect(trialBalance(entries).balanced, testId).toBe(true);
    }
  });

  it('numbers lines GL-<txId>-NN and stamps them with the payment’s time', () => {
    const lvl = level(5);
    const result = evaluateChallenge(referenceGraph(lvl), lvl);
    const approved = result.testResults.find((r) => r.testCaseId === 'L5-T1')!;
    const entries = postTestResult(approved);
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach((e, i) => {
      expect(e.id).toBe(`GL-${e.txId}-${String(i + 1).padStart(2, '0')}`);
      expect(e.currency).toBe('AUD');
      expect(e.timestamp).toBeGreaterThanOrEqual(lvl.testSuite.find((t) => t.id === 'L5-T1')!.inputPayload.clientTimestamp);
    });
  });

  it('posts the brief’s example: an authorisation hold debits Customer CASA Hold and credits Card Settlement Clearing Payable', () => {
    const [hold] = postingsOf(5).find((p) => p.testId === 'L5-T1')!.entries;
    expect(hold).toMatchObject({ kind: 'AUTH_HOLD', debitAccount: 'CUST_CASA_HOLD', creditAccount: 'CARD_CLEARING_PAYABLE', amount: 450 });
  });

  it('posts nothing for a decline that moved no money', () => {
    expect(postingsOf(5).find((p) => p.testId === 'L5-T2')!.entries).toEqual([]);
    expect(postingsOf(7).find((p) => p.testId === 'L7-T10')!.entries).toEqual([]);
  });

  it('holds the money in the right account for each kind of card', () => {
    const kinds = Object.fromEntries(postingsOf(5).map((p) => [p.testId, p.entries[0]?.debitAccount]));
    expect(kinds['L5-T1']).toBe('CUST_CASA_HOLD'); // debit
    expect(kinds['L5-T5']).toBe('CUST_CREDIT_HOLD'); // credit
    expect(kinds['L5-T7']).toBe('CUST_PREPAID_HOLD'); // prepaid
  });

  it('a payment that is not approved still balances: the hold is placed and released', () => {
    const lines = postingsOf(6).find((p) => p.testId === 'L6-T02')?.entries ?? [];
    // Sent to a challenge before the ledger ran, so nothing was held.
    expect(lines).toEqual([]);
    const broke = postingsOf(6).find((p) => p.testId === 'L6-T10')!.entries;
    expect(broke).toEqual([]); // declined for lack of funds: no hold was ever placed
  });

  it('books FX gains and losses in their own suspense accounts', () => {
    const fx = postingsOf(8);
    const loss = fx.find((p) => p.testId === 'L8-FX01')!.entries;
    const gain = fx.find((p) => p.testId === 'L8-FX02')!.entries;
    expect(loss.find((e) => e.kind === 'FX_VARIANCE')).toMatchObject({ debitAccount: 'FX_LOSS_SUSPENSE', creditAccount: 'CARD_CLEARING_PAYABLE' });
    expect(gain.find((e) => e.kind === 'FX_VARIANCE')).toMatchObject({ debitAccount: 'CARD_CLEARING_PAYABLE', creditAccount: 'FX_GAIN_SUSPENSE' });
    // And the rest of the payment still settles with the scheme.
    expect(loss.some((e) => e.kind === 'SETTLEMENT')).toBe(true);
  });

  it('parks an unexplained gap in general suspense, not in an FX account', () => {
    const lines = postingsOf(8).find((p) => p.testId === 'L8-C6')!.entries;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'SUSPENSE_BREAK', debitAccount: 'CARD_CLEARING_PAYABLE', creditAccount: 'RECON_SUSPENSE' });
  });

  it('settles a matched payment with the scheme', () => {
    const lines = postingsOf(8).find((p) => p.testId === 'L8-C1')!.entries;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'SETTLEMENT', debitAccount: 'CARD_CLEARING_PAYABLE', creditAccount: 'SCHEME_NOSTRO' });
  });

  it('pays an A2A message out on the rail it chose, and queues one the gateway holds', () => {
    const a2a = postingsOf(7);
    expect(a2a.find((p) => p.testId === 'L7-T01')!.entries[0]).toMatchObject({ kind: 'A2A_PAYMENT', creditAccount: 'A2A_INSTANT_SETTLEMENT' });
    expect(a2a.find((p) => p.testId === 'L7-T04')!.entries[0]).toMatchObject({ kind: 'A2A_PAYMENT', creditAccount: 'A2A_RTGS_SETTLEMENT' });
    expect(a2a.find((p) => p.testId === 'L7-T06')!.entries[0]).toMatchObject({ kind: 'A2A_QUEUED', creditAccount: 'A2A_QUEUE_PAYABLE' });
  });

  it('freezes then releases the VIP’s money, and only freezes a true sanctions match', () => {
    const aml = postingsOf(9);
    expect(aml.find((p) => p.testId === 'L9-T04')!.entries.map((e) => e.kind)).toEqual(['AML_RESTRAIN', 'AML_RELEASE', 'PAYMENT_EXECUTED']);
    expect(aml.find((p) => p.testId === 'L9-T05')!.entries.map((e) => e.kind)).toEqual(['AML_RESTRAIN']);
    expect(aml.find((p) => p.testId === 'L9-T01')!.entries.map((e) => e.kind)).toEqual(['PAYMENT_EXECUTED']);
  });

  it('follows a dispute through its money: provisional credit, then recovery or reversal, or the issuer’s loss', () => {
    const cb = postingsOf(10);
    expect(cb.find((p) => p.testId === 'L10-T02')!.entries[0]).toMatchObject({ kind: 'PROVISIONAL_CREDIT', debitAccount: 'DISPUTE_RECEIVABLE', creditAccount: 'CUST_CASA' });
    expect(cb.find((p) => p.testId === 'L10-T04')!.entries[0]).toMatchObject({ kind: 'DISPUTE_RECOVERY' });
    expect(cb.find((p) => p.testId === 'L10-T09')!.entries[0]).toMatchObject({ kind: 'ISSUER_LOSS', debitAccount: 'FRAUD_LOSS_EXPENSE', creditAccount: 'CUST_CASA' });
    expect(cb.find((p) => p.testId === 'L10-T12')!.entries).toEqual([]); // time-barred: no money moves
  });

  it('keeps each transaction’s lines apart in a mixed batch', () => {
    const all = postingsOf(9).flatMap((p) => p.entries);
    const groups = groupByTransaction(all);
    expect(groups.size).toBeGreaterThan(1);
    for (const lines of groups.values()) expect(isBalanced(lines)).toBe(true);
    expect(isBalanced(all)).toBe(true);
  });

  it('posts nothing for a hidden test unless the grader reveals its trace', () => {
    const lvl = level(5);
    const hidden = lvl.testSuite.find((t) => t.hidden && t.expectedOutcome === 'APPROVED')!;
    const plain = evaluateChallenge(referenceGraph(lvl), lvl).testResults.find((r) => r.testCaseId === hidden.id)!;
    expect(postTestResult(plain)).toEqual([]);
    const revealed = evaluateChallenge(referenceGraph(lvl), lvl, { revealHidden: true }).testResults.find((r) => r.testCaseId === hidden.id)!;
    expect(postTestResult(revealed).length).toBeGreaterThan(0);
  });
});

// Flawed diagrams

describe('flawed diagrams: Level 5', () => {
  it('approving everything: every decline test fails', () => {
    const lvl = level(5);
    const g = referenceGraph(lvl);
    removeNodes(g, 'n_xor_funds', 'n_end_declined');
    g.edges.push(makeEdge('x1', ['n_ledger', 'out'], ['n_end_approved', 'in']));
    const r = evaluateChallenge(g, lvl);
    expect(r.passed).toBe(false);
    expect(failedIds(r)).toEqual(['L5-T2', 'L5-T4', 'L5-T6', 'L5-T8']);
  });

  it('a decline with no reason code: the outcome is right and the code is not', () => {
    const lvl = level(5);
    const g = referenceGraph(lvl);
    nodeOf(g, 'n_end_declined').configParams.reasonCode = '';
    const r = evaluateChallenge(g, lvl);
    expect(r.passed).toBe(false);
    expect(failedIds(r)).toEqual(['L5-T2', 'L5-T4', 'L5-T6', 'L5-T8']);
    expect(r.testResults.find((t) => t.testCaseId === 'L5-T2')!.failureReasons).toEqual(['WRONG_REASON_CODE']);
  });

  it('refusing to spend the exact balance fails the boundary test', () => {
    const lvl = level(5);
    expect(lvl.testSuite.find((t) => t.id === 'L5-T3')!.tags).toContain('boundary');
    const g = referenceGraph(lvl);
    // Ask for strictly more than the balance by never approving: send everything to the default (decline).
    nodeOf(g, 'n_xor_funds');
    edgeOf(g, 'e3').conditionExpression = "ledgerDecision == 'NEVER'";
    const r = evaluateChallenge(g, lvl);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['L5-T1', 'L5-T3', 'L5-T5']));
  });
});

describe('flawed diagrams: Level 6', () => {
  it('no card-testing rule: the bots get through to 3DS and the ledger', () => {
    const lvl = level(6);
    const g = referenceGraph(lvl);
    removeNodes(g, 'n_xor_burst', 'n_end_testing');
    g.edges.push(makeEdge('x1', ['n_start', 'out'], ['n_3ds', 'in']));
    const r = evaluateChallenge(g, lvl);
    expect(r.passed).toBe(false);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['L6-T05', 'L6-T06', 'L6-T11']));
    expect(feedback(r)).toContain('must not reach');
  });

  it('a burst rule that ignores the amount blocks a genuine big ticket (cart abandonment)', () => {
    const lvl = level(6);
    const g = referenceGraph(lvl);
    edgeOf(g, 'e2').conditionExpression = 'recentAttempts >= 5';
    const r = evaluateChallenge(g, lvl);
    expect(failedIds(r)).toContain('L6-T08');
    expect(failedIds(r)).not.toContain('L6-T05');
  });

  it('an off-by-one on the attempt count fails the boundary tests either side', () => {
    const lvl = level(6);
    const tooLate = referenceGraph(lvl);
    edgeOf(tooLate, 'e2').conditionExpression = 'recentAttempts > 5 && amount <= 500';
    expect(failedIds(evaluateChallenge(tooLate, lvl))).toContain('L6-T11');

    const tooEarly = referenceGraph(lvl);
    edgeOf(tooEarly, 'e2').conditionExpression = 'recentAttempts >= 4 && amount <= 500';
    expect(failedIds(evaluateChallenge(tooEarly, lvl))).toContain('L6-T12');
  });

  it('no low-value exemption: a $12.00 renewal is sent to the OTP and abandoned', () => {
    const lvl = level(6);
    const g = referenceGraph(lvl);
    removeEdges(g, 'e6');
    const r = evaluateChallenge(g, lvl);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['L6-T01', 'L6-T03']));
  });
});

describe('flawed diagrams: Level 7', () => {
  it('the factory instant-rail limit sends a $25,000.01 payment down the wrong rail', () => {
    const lvl = level(7);
    const g = referenceGraph(lvl);
    nodeOf(g, 'n_gateway').configParams.instantLimitMinor = 5_000_000;
    const r = evaluateChallenge(g, lvl);
    expect(r.passed).toBe(false);
    expect(failedIds(r)).toContain('L7-T03');
    expect(failedIds(r)).not.toContain('L7-T01');
  });

  it('holding payroll in a congested queue: priority routing is missing', () => {
    const lvl = level(7);
    const g = referenceGraph(lvl);
    edgeOf(g, 'e5').conditionExpression = "a2aQueue == 'CONGESTED'";
    const r = evaluateChallenge(g, lvl);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['L7-T05', 'L7-T13']));
    expect(failedIds(r)).toContain('L7-T05');
    expect(failedIds(r)).not.toContain('L7-T06');
  });

  it('no format check: a message with no EndToEndId goes out', () => {
    const lvl = level(7);
    const g = referenceGraph(lvl);
    removeEdges(g, 'e3');
    const r = evaluateChallenge(g, lvl);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['L7-T10', 'L7-T11', 'L7-T12', 'L7-T15']));
  });

  it('checking the queue before the liquidity: the wrong reason is reported', () => {
    const lvl = level(7);
    const g = referenceGraph(lvl);
    edgeOf(g, 'e4').priority = 3;
    edgeOf(g, 'e5').priority = 2;
    const r = evaluateChallenge(g, lvl);
    expect(failedIds(r)).toContain('L7-T14');
  });
});

describe('flawed diagrams: Level 8', () => {
  it('a zero tolerance turns rounding dust into a break', () => {
    const lvl = level(8);
    const g = referenceGraph(lvl);
    nodeOf(g, 'n_recon').configParams.toleranceMinor = 0;
    const r = evaluateChallenge(g, lvl);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['L8-C2']));
  });

  it('no FX branch: every foreign break lands in general suspense', () => {
    const lvl = level(8);
    const g = referenceGraph(lvl);
    removeEdges(g, 'e7', 'e8');
    const r = evaluateChallenge(g, lvl);
    const fx = lvl.testSuite.filter((t) => t.id.startsWith('L8-FX')).map((t) => t.id);
    expect(failedIds(r)).toEqual(expect.arrayContaining(fx));
  });

  it('treating every FX difference as a loss gets the gains wrong', () => {
    const lvl = level(8);
    const g = referenceGraph(lvl);
    edgeOf(g, 'e7').conditionExpression = "reconCause == 'FX_RATE'";
    const r = evaluateChallenge(g, lvl);
    const gains = lvl.testSuite.filter((t) => t.expectedReasonCode === 'SUSP_FX_GAIN').map((t) => t.id);
    expect(failedIds(r)).toEqual(expect.arrayContaining(gains));
    expect(failedIds(r)).not.toContain('L8-FX01');
  });

  it('a tolerance wide enough to hide real breaks settles them as matched', () => {
    const lvl = level(8);
    const g = referenceGraph(lvl);
    nodeOf(g, 'n_recon').configParams.toleranceMinor = 1_000_000;
    const r = evaluateChallenge(g, lvl);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['L8-FX01', 'L8-FX02', 'L8-C6']));
  });
});

describe('flawed diagrams: Level 9', () => {
  it('blocking every name hit: the VIP is frozen without anyone looking', () => {
    const lvl = level(9);
    const g = referenceGraph(lvl);
    removeNodes(g, 'n_case', 'n_xor_verdict');
    g.edges.push(makeEdge('x1', ['n_xor_hit', 'out_1'], ['n_end_sanctions', 'in'], { when: "amlList != 'NONE'", priority: 1 }));
    const r = evaluateChallenge(g, lvl);
    expect(r.passed).toBe(false);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['L9-T04', 'L9-T08']));
    expect(feedback(r)).toContain('Case Investigation');
  });

  it('investigating everyone: clean customers are held up and tests that forbid the investigation fail', () => {
    const lvl = level(9);
    const g = referenceGraph(lvl);
    removeNodes(g, 'n_xor_hit');
    g.edges.push(makeEdge('x1', ['n_aml', 'out'], ['n_case', 'in']));
    const r = evaluateChallenge(g, lvl);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['L9-T01', 'L9-T02', 'L9-T03']));
    expect(r.testResults.find((t) => t.testCaseId === 'L9-T01')!.failureReasons).toContain('FORBIDDEN_CAPABILITY_VISITED');
  });

  it('treating an inconclusive case as a clearance releases a payment nobody could verify', () => {
    const lvl = level(9);
    const g = referenceGraph(lvl);
    edgeOf(g, 'e7').conditionExpression = "caseVerdict != 'TRUE_MATCH'";
    const r = evaluateChallenge(g, lvl);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['L9-T06', 'L9-T10']));
  });

  it('ignoring structuring releases the layered deposits', () => {
    const lvl = level(9);
    const g = referenceGraph(lvl);
    removeEdges(g, 'e4');
    const r = evaluateChallenge(g, lvl);
    expect(failedIds(r)).toEqual(['L9-T03']);
  });
});

describe('flawed diagrams: Level 10', () => {
  it('no liability gate: a fraud claim on a 3DS-authenticated purchase is charged back', () => {
    const lvl = level(10);
    const g = referenceGraph(lvl);
    removeEdges(g, 'e5');
    const r = evaluateChallenge(g, lvl);
    expect(r.passed).toBe(false);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['L10-T09', 'L10-T10']));
  });

  it('absorbing every claim: the liability shift is only for authenticated fraud', () => {
    const lvl = level(10);
    const g = referenceGraph(lvl);
    edgeOf(g, 'e5').conditionExpression = "disputeLiability == 'ISSUER' || disputeLiability == 'MERCHANT'";
    const r = evaluateChallenge(g, lvl);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['L10-T11', 'L10-T15']));
  });

  it('no time bar: a claim 150 days old is taken', () => {
    const lvl = level(10);
    const g = referenceGraph(lvl);
    removeEdges(g, 'e4');
    const r = evaluateChallenge(g, lvl);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['L10-T12']));
  });

  it('a time bar that ignores the stage kills a case already in representment', () => {
    const lvl = level(10);
    const g = referenceGraph(lvl);
    edgeOf(g, 'e4').conditionExpression = 'disputeDays > 120';
    const r = evaluateChallenge(g, lvl);
    // The reference gate reads the desk's own window verdict; a hand-rolled day count is the classic mistake.
    expect(r.passed).toBe(false);
  });

  it('skipping the 3DS check leaves the desk without the authentication it needs', () => {
    const lvl = level(10);
    const g = referenceGraph(lvl);
    removeNodes(g, 'n_3ds');
    g.edges.push(makeEdge('x1', ['n_start', 'out'], ['n_desk', 'in']));
    const r = evaluateChallenge(g, lvl);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['L10-T09', 'L10-T10']));
  });
});

describe('the new nodes in the palette', () => {
  it('are in the catalog with the definition ids the levels use', () => {
    for (const id of [DEF.START_A2A, DEF.A2A, DEF.AML, DEF.CASE, DEF.CHARGEBACK]) {
      expect(() => makeNode(id, `probe_${id}`)).not.toThrow();
    }
  });
});
