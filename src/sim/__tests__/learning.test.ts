import { describe, expect, it } from 'vitest';

import { KPI_ROWS } from '../kpis';
import { exampleOf, graphKeyOf, layoutFor, LESSON_LIST, LESSONS, stepTextFor, type GraphKey, type Lesson, type ProcessId } from '../learning';
import { DEFAULT_RULES, RULE_KEYS } from '../rules';
import { STATIONS } from '../topology';
import { buildWalkthrough, lessonGraph, wireLabel } from '../walkthrough';

/** Every diagram a lesson draws: its own, and any a single example swaps in (chapter 6 has two). */
const graphsOf = (lesson: Lesson): GraphKey[] => [...new Set<GraphKey>([lesson.graph, ...lesson.examples.map((e) => graphKeyOf(lesson, e))])];

const ids = (lesson: Lesson, key: GraphKey = lesson.graph): { nodes: Set<string>; edges: Map<string, { from: string; to: string }> } => {
  const graph = lessonGraph(lesson, key);
  const layout = layoutFor(lesson, key);
  const nodes = new Set<string>([...graph.nodes.map((n) => n.id), ...layout.synthetic.map((s) => s.id)]);
  const edges = new Map<string, { from: string; to: string }>();
  for (const e of graph.edges) edges.set(e.id, { from: e.sourceNodeId, to: e.targetNodeId });
  for (const e of layout.syntheticEdges) edges.set(e.id, { from: e.from, to: e.to });
  return { nodes, edges };
};

describe('lessons: what is on the page', () => {
  it('has the six chapters of the Course Catalog, strictly in order, under the titles of the brief', () => {
    expect(LESSON_LIST.map((l) => l.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(LESSON_LIST.map((l) => l.chapter)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(LESSONS.A.title).toBe('Virtual Card Tokenisation & dCVV Masking');
    expect(LESSONS.B.title).toBe('3-D Secure 2.x Risk Engine (Frictionless vs Challenge OTP)');
    expect(LESSONS.C.title).toBe('BNPL Pay-in-4 Underwriting & Card Fallback');
    expect(LESSONS.D.title).toBe('EOD 3-Way Reconciliation & Suspense Accounting');
    expect(LESSONS.E.title).toBe('Instant Account-to-Account Transfers (A2A & pacs.008)');
    expect(LESSONS.F.title).toBe('AML Screening & Chargeback Dispute Resolution');
  });

  it('numbers nothing but the chapter: no subtitle repeats an old "Level N"', () => {
    for (const l of LESSON_LIST) expect(l.subtitle, l.id).not.toMatch(/level\s*\d/i);
  });

  for (const lesson of LESSON_LIST) {
    describe(`process ${lesson.id}`, () => {
      it('places every box of every diagram it draws and explains it', () => {
        for (const key of graphsOf(lesson)) {
          const graph = lessonGraph(lesson, key);
          const layout = layoutFor(lesson, key);
          for (const n of graph.nodes) {
            expect(layout.nodes[n.id], `${key}: position of ${n.id}`).toBeDefined();
            expect(stepTextFor(lesson, key, n.id), `${key}: text for ${n.id}`).toBeDefined();
          }
          for (const s of layout.synthetic) expect(stepTextFor(lesson, key, s.id), `${key}: text for ${s.id}`).toBeDefined();
          // Nothing in the layout that is not on the diagram.
          const known = ids(lesson, key).nodes;
          for (const id of Object.keys(layout.nodes)) expect(known.has(id), `${key}: layout names ${id}`).toBe(true);
        }
        // Nothing explained that is on no diagram. A text key is a bare box id, or "<diagram>:<box id>" where two diagrams share a box id.
        const everyBox = new Set(graphsOf(lesson).flatMap((key) => [...ids(lesson, key).nodes].map((id) => `${key}:${id}`)));
        const bare = new Set([...everyBox].map((k) => k.slice(k.indexOf(':') + 1)));
        for (const id of Object.keys(lesson.steps)) {
          const ok = id.includes(':') ? everyBox.has(id) : bare.has(id);
          expect(ok, `text names ${id}`).toBe(true);
        }
      });

      it('keeps every box inside the drawing', () => {
        for (const key of graphsOf(lesson)) {
          const layout = layoutFor(lesson, key);
          const all = [...Object.entries(layout.nodes), ...layout.synthetic.map((s) => [s.id, s] as const)];
          for (const [id, p] of all) {
            expect(p.x, `${key}/${id}.x`).toBeGreaterThan(30);
            expect(p.x, `${key}/${id}.x`).toBeLessThan(layout.width - 30);
            expect(p.y, `${key}/${id}.y`).toBeGreaterThan(20);
            expect(p.y, `${key}/${id}.y`).toBeLessThan(layout.height - 20);
          }
        }
      });

      it('only routes and labels wires that exist', () => {
        for (const key of graphsOf(lesson)) {
          const layout = layoutFor(lesson, key);
          const { nodes, edges } = ids(lesson, key);
          for (const id of Object.keys(layout.routes)) expect(edges.has(id), `${key}: route for ${id}`).toBe(true);
          for (const id of Object.keys(layout.labels)) expect(edges.has(id), `${key}: label for ${id}`).toBe(true);
          for (const e of layout.syntheticEdges) {
            expect(nodes.has(e.from), `${e.id} from`).toBe(true);
            expect(nodes.has(e.to), `${e.id} to`).toBe(true);
          }
        }
      });

      it('names dials, desks and KPI rows that exist', () => {
        for (const k of lesson.knobs) expect(RULE_KEYS).toContain(k);
        // The lesson is a chapter: it names the Academy's desks, and every desk it names lists the chapter back.
        const rowIds = KPI_ROWS.map((r) => r.id);
        for (const r of lesson.focusRows) expect(rowIds).toContain(r);
        for (const d of lesson.desks) expect(STATIONS[d].processes, `${d} should take part in process ${lesson.id}`).toContain(lesson.id);
        expect(lesson.intro.length).toBeGreaterThan(0);
        expect(lesson.takeaways.length).toBeGreaterThanOrEqual(3);
      });

      it('has examples with unique ids and a suggestion that changes the story', () => {
        expect(new Set(lesson.examples.map((e) => e.id)).size).toBe(lesson.examples.length);
        for (const ex of lesson.examples) {
          if (!ex.suggestion) continue;
          const before = buildWalkthrough(lesson.id, ex.id, DEFAULT_RULES);
          const after = buildWalkthrough(lesson.id, ex.id, { ...DEFAULT_RULES, ...ex.suggestion.rules });
          expect(after.verdict.headline + after.steps.length, `${lesson.id}/${ex.id} suggestion should change the story`).not.toBe(before.verdict.headline + before.steps.length);
        }
      });
    });
  }
});

describe('walkthroughs: the real diagram decides', () => {
  const expectations: Array<[ProcessId, string, string, string]> = [
    ['A', 'fresh', 'APPROVED', 'Approved'],
    ['A', 'slow', 'DECLINED', 'Declined: expired dCVV'],
    ['A', 'replay', 'DECLINED', 'Declined: expired dCVV'],
    ['A', 'wrong', 'DECLINED', 'Declined: wrong dCVV'],
    ['A', 'unknown', 'DECLINED', 'Declined: unknown virtual card'],
    ['A', 'broke', 'DECLINED', 'Declined: not enough money'],
    ['B', 'calm', 'APPROVED', 'Approved'],
    ['B', 'borderline', 'APPROVED', 'Approved'],
    ['B', 'walkaway', 'DECLINED', 'Declined: OTP never typed'],
    ['B', 'stealth', 'APPROVED', 'Approved'],
    ['B', 'ring', 'DECLINED', 'Declined: OTP never typed'],
    ['B', 'traveller', 'APPROVED', 'Approved'],
    ['C', 'strong', 'APPROVED', 'Approved: Pay-in-4'],
    ['C', 'weak', 'APPROVED', 'Approved: paid in full by card'],
    ['C', 'lowdown', 'APPROVED', 'Approved: paid in full by card'],
    ['C', 'dpfail', 'DECLINED', 'Declined: down payment declined'],
    ['C', 'bothfail', 'DECLINED', 'Declined: not enough money'],
    ['D', 'clean', 'APPROVED', 'Settled'],
    ['D', 'dust', 'APPROVED', 'Settled'],
    ['D', 'variance', 'ROUTED_TO_SUSPENSE', 'Parked in suspense: amount variance'],
    ['D', 'missing', 'ROUTED_TO_SUSPENSE', 'Parked in suspense: missing leg'],
    ['D', 'duplicate', 'ROUTED_TO_SUSPENSE', 'Parked in suspense: duplicate'],
    ['E', 'split', 'APPROVED', 'Released'],
    ['E', 'rent', 'APPROVED', 'Released'],
    ['E', 'noref', 'DECLINED', 'Rejected: invalid message'],
    ['E', 'shortbic', 'DECLINED', 'Rejected: invalid message'],
    ['E', 'mismatch', 'DECLINED', 'Rejected: invalid message'],
    ['E', 'broke', 'DECLINED', 'Declined: not enough money'],
    ['F', 'clear', 'APPROVED', 'Released'],
    ['F', 'structuring', 'ROUTED_TO_SUSPENSE', 'Reported: structuring'],
    ['F', 'vip', 'APPROVED', 'Cleared: false positive'],
    ['F', 'sanctions', 'DECLINED', 'Blocked: sanctions match'],
    ['F', 'inconclusive', 'ROUTED_TO_SUSPENSE', 'Escalated: enhanced due diligence'],
    ['F', 'pep', 'ROUTED_TO_SUSPENSE', 'Held: source of funds requested'],
    ['F', 'new', 'ROUTED_TO_SUSPENSE', 'Receipt requested from the merchant'],
    ['F', 'silent', 'ROUTED_TO_SUSPENSE', 'First chargeback filed'],
    ['F', 'proof', 'DECLINED', 'Merchant won'],
    ['F', 'fight', 'ROUTED_TO_SUSPENSE', 'Representment under review'],
    ['F', 'shift', 'APPROVED', 'Issuer absorbs the loss'],
    ['F', 'late', 'DECLINED', 'Time-barred'],
  ];

  it('covers every example', () => {
    const covered = new Set(expectations.map(([p, e]) => `${p}/${e}`));
    for (const l of LESSON_LIST) for (const e of l.examples) expect(covered.has(`${l.id}/${e.id}`), `${l.id}/${e.id}`).toBe(true);
  });

  for (const [process, example, outcome, headline] of expectations) {
    it(`${process}/${example}: ${headline}`, () => {
      const w = buildWalkthrough(process, example);
      expect(w.broken).toBe(false);
      expect(w.verdict.outcome).toBe(outcome);
      expect(w.verdict.headline).toBe(headline);
      expect(w.carries.length).toBeGreaterThan(1);
    });
  }

  it('B: a borderline payment goes to the phone and comes back, then the diagram runs a second time', () => {
    const w = buildWalkthrough('B', 'borderline');
    const nodes = w.steps.map((s) => s.nodeId);
    expect(nodes).toEqual(['n_start', 'n_3ds', 'n_xor_3ds', 'n_end_challenge', 'syn_phone', 'n_3ds', 'n_xor_3ds', 'n_ledger', 'n_xor_ledger', 'n_end_approved']);
    expect(w.steps.map((s) => s.pass)).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
    const back = w.steps[5]!;
    expect(back.viaEdgeId).toBe('syn_back');
    expect(back.facts.find((f) => f.label === '3DS path')?.value).toBe('CHALLENGE_PASSED');
  });

  it('B: the customer who walks away ends in a decline after the second pass', () => {
    const w = buildWalkthrough('B', 'walkaway');
    expect(w.steps.map((s) => s.nodeId)).toEqual(['n_start', 'n_3ds', 'n_xor_3ds', 'n_end_challenge', 'syn_phone', 'n_3ds', 'n_xor_3ds', 'n_end_declined']);
    expect(w.steps.find((s) => s.nodeId === 'syn_phone')?.tone).toBe('bad');
  });

  it('B: raising the frictionless line removes the phone from the story', () => {
    const w = buildWalkthrough('B', 'borderline', { frictionlessBelow: 60 });
    expect(w.steps.some((s) => s.nodeId === 'syn_phone')).toBe(false);
    expect(w.verdict.outcome).toBe('APPROVED');
    expect(w.rules.frictionlessBelow).toBe(60);
  });

  it('B: a rule that is too loose is shown as the bank paying for fraud', () => {
    const w = buildWalkthrough('B', 'stealth');
    expect(w.verdict.tone).toBe('bad');
    expect(w.verdict.detail).toMatch(/fraud/);
    expect(buildWalkthrough('B', 'stealth', { frictionlessBelow: 30 }).verdict.tone).toBe('good');
  });

  it('D: the suspense account follows a break, and the tolerance decides what is a break', () => {
    const variance = buildWalkthrough('D', 'variance');
    expect(variance.steps.map((s) => s.nodeId)).toEqual(['syn_batch', 'syn_visa', 'n_start', 'n_recon', 'n_xor_recon', 'n_end_amount', 'syn_suspense', 'syn_cleared']);
    expect(variance.steps.find((s) => s.nodeId === 'syn_suspense')?.happened).toMatch(/\$8\.20/);

    expect(buildWalkthrough('D', 'dust').verdict.headline).toBe('Settled');
    expect(buildWalkthrough('D', 'dust', { reconToleranceCents: 0 }).verdict.headline).toBe('Parked in suspense: amount variance');
    // A tolerance wide enough to swallow a real mistake.
    const leaked = buildWalkthrough('D', 'variance', { reconToleranceCents: 1000 });
    expect(leaked.verdict.headline).toBe('Settled');
    expect(leaked.verdict.tone).toBe('bad');
  });

  it('A: a longer window lets the slow typist through, and a very long one lets the replay through', () => {
    expect(buildWalkthrough('A', 'slow', { dcvvWindowSec: 90 }).verdict.outcome).toBe('APPROVED');
    const replay = buildWalkthrough('A', 'replay', { dcvvWindowSec: 150 });
    expect(replay.verdict.outcome).toBe('APPROVED');
    expect(replay.verdict.tone).toBe('bad');
  });

  it('C: the underwriter’s two tests move the story between plan, fallback and decline', () => {
    expect(buildWalkthrough('C', 'strong', { bnplMinScore: 720 }).verdict.headline).toBe('Approved: paid in full by card');
    expect(buildWalkthrough('C', 'weak', { bnplMinScore: 560 }).verdict.headline).toBe('Approved: Pay-in-4');
    expect(buildWalkthrough('C', 'lowdown', { bnplMinDownPct: 20 }).verdict.headline).toBe('Approved: Pay-in-4');
  });

  it('E: an instant transfer has no card step: the message is checked, then the ledger, and a malformed one never reaches the ledger', () => {
    expect(buildWalkthrough('E', 'split').steps.map((s) => s.nodeId)).toEqual(['n_start', 'n_gateway', 'n_xor_valid', 'n_ledger', 'n_xor_funds', 'n_end_approved']);
    const bad = buildWalkthrough('E', 'noref').steps.map((s) => s.nodeId);
    expect(bad).toEqual(['n_start', 'n_gateway', 'n_xor_valid', 'n_end_invalid']);
    expect(bad).not.toContain('n_ledger');
  });

  it('F: the one chapter has two diagrams, and each example is walked on the right one', () => {
    const aml = buildWalkthrough('F', 'sanctions');
    const dispute = buildWalkthrough('F', 'proof');
    expect(aml.steps.some((s) => s.nodeId === 'n_aml')).toBe(true);
    expect(dispute.steps.some((s) => s.nodeId === 'n_desk')).toBe(true);
    expect(graphKeyOf(LESSONS.F, exampleOf(LESSONS.F, 'sanctions'))).toBe('aml');
    expect(graphKeyOf(LESSONS.F, exampleOf(LESSONS.F, 'proof'))).toBe('dispute');
    expect(layoutFor(LESSONS.F, 'aml')).toBe(LESSONS.F.layout);
    expect(layoutFor(LESSONS.F, 'dispute')).not.toBe(LESSONS.F.layout);
  });

  it('every wire a step arrives by is a real wire that leaves the previous step', () => {
    for (const lesson of LESSON_LIST) {
      for (const ex of lesson.examples) {
        const { edges } = ids(lesson, graphKeyOf(lesson, exampleOf(lesson, ex.id)));
        const variants = [DEFAULT_RULES, ...(ex.suggestion ? [{ ...DEFAULT_RULES, ...ex.suggestion.rules }] : [])];
        for (const rules of variants) {
          const w = buildWalkthrough(lesson.id, ex.id, rules);
          w.steps.forEach((step, i) => {
            const where = `${lesson.id}/${ex.id} step ${i} (${step.nodeId})`;
            if (i === 0) {
              expect(step.viaEdgeId, where).toBeNull();
              return;
            }
            expect(step.viaEdgeId, where).not.toBeNull();
            const edge = edges.get(step.viaEdgeId as string);
            expect(edge, `${where}: wire ${step.viaEdgeId}`).toBeDefined();
            expect(edge?.from, `${where}: wire starts at the previous step`).toBe(w.steps[i - 1]?.nodeId);
            expect(edge?.to, `${where}: wire ends at this step`).toBe(step.nodeId);
          });
        }
      }
    }
  });

  it('describes each decision in words, with no wire ids in them', () => {
    for (const lesson of LESSON_LIST) {
      for (const ex of lesson.examples) {
        const w = buildWalkthrough(lesson.id, ex.id);
        for (const s of w.steps) {
          expect(s.title.length, `${lesson.id}/${ex.id}/${s.nodeId} title`).toBeGreaterThan(0);
          expect(s.what.length).toBeGreaterThan(0);
          expect(s.happened.length, `${lesson.id}/${ex.id}/${s.nodeId} happened`).toBeGreaterThan(0);
          expect(s.happened, `${lesson.id}/${ex.id}/${s.nodeId}`).not.toMatch(/\be\d+\b/);
        }
      }
    }
  });

  it('labels wires from the lesson first and the diagram second', () => {
    const lesson = LESSONS.C;
    const graph = lessonGraph(lesson);
    expect(wireLabel(lesson, graph.edges.find((e) => e.id === 'e3')!)).toBe('plan approved');
    expect(wireLabel(lesson, graph.edges.find((e) => e.id === 'e7')!)).toBe('plan + funds');
    expect(wireLabel(lesson, graph.edges.find((e) => e.id === 'e1')!)).toBeUndefined();
  });

  it('is repeatable: the same inputs give the same story', () => {
    expect(buildWalkthrough('B', 'borderline')).toEqual(buildWalkthrough('B', 'borderline'));
  });
});
