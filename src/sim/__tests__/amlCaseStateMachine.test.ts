import { describe, expect, it } from 'vitest';
import {
  AML_PATHS,
  DECISIONS,
  EDD_SLA_MIN,
  eddDecision,
  expireEdd,
  fiuDirective,
  lateDocs,
  resolveEscalation,
  typologyCases,
  type CaseRecord,
  type CaseState,
  type EddAction,
  type ReviewCase,
} from '../amlReview';

/**
 * The AML case is a state machine (State): CaseState is its one state, and DECISIONS / EDD_STRATEGIES / the clock steps are its
 * transitions, each guarded by the state it starts from. This pins the machine: every transition the desk can reach, from every
 * typology on many seeds at every point of the EDD and FIU clocks, must be an edge of the graph below, and every edge must be reached.
 */
const GRAPH: Readonly<Record<CaseState, readonly CaseState[]>> = {
  OPEN: ['RELEASED', 'FROZEN', 'ESCALATED', 'PENDING_EDD', 'SAR_FILED'],
  ESCALATED: ['FROZEN', 'TEMP_RELEASED'],
  PENDING_EDD: ['EDD_CLEARED', 'EDD_REJECTED', 'EDD_EXPIRED', 'SAR_FILED', 'SAR_REJECTED'],
  EDD_EXPIRED: ['EDD_LATE_DOCS', 'EDD_CLEARED', 'SAR_FILED'],
  EDD_LATE_DOCS: ['EDD_CLEARED', 'EDD_REJECTED', 'SAR_FILED'],
  SAR_FILED: ['SEIZED', 'SAR_REJECTED'],
  RELEASED: [],
  FROZEN: [],
  TEMP_RELEASED: [],
  EDD_CLEARED: [],
  EDD_REJECTED: [],
  SEIZED: [],
  SAR_REJECTED: [],
};

const EDD_ACTIONS: readonly EddAction[] = ['RELEASE', 'SAR', 'REFUSE', 'UNLOCK'];

/** Every move one case can make from record `r`: the branch escalation, each EDD action, and the clock steps, at each moment that matters. */
function moves(c: ReviewCase, r: CaseRecord): CaseRecord[] {
  const times = [r.decidedAt, r.eddUploadAt, r.eddDue, r.eddDue === null ? null : r.eddDue + 1, r.fiuDue, r.decidedAt + 10 * EDD_SLA_MIN].filter((t): t is number => t !== null);
  const out = [resolveEscalation(c, r, true), resolveEscalation(c, r, false)];
  for (const t of times) {
    out.push(expireEdd(c, r, t), lateDocs(c, r, t), fiuDirective(c, r, t));
    for (const a of EDD_ACTIONS) out.push(eddDecision(c, r, a, t));
  }
  return out.map((o) => o.record);
}

describe('the AML case state machine', () => {
  const seen = new Set<string>();
  const illegal: string[] = [];
  for (let seed = 1; seed <= 40; seed++) {
    for (const c of typologyCases(seed, 1)) {
      for (const path of AML_PATHS) {
        const first = DECISIONS[path].apply(c, 0).record;
        const queue: CaseRecord[] = [first];
        const visited = new Set<string>();
        record('OPEN', first.state);
        while (queue.length > 0) {
          const r = queue.shift()!;
          const key = JSON.stringify(r);
          if (visited.has(key)) continue;
          visited.add(key);
          for (const next of moves(c, r)) {
            if (next.state === r.state) continue;
            record(r.state, next.state);
            queue.push(next);
          }
        }
      }
    }
  }
  function record(from: CaseState, to: CaseState): void {
    const edge = `${from}->${to}`;
    seen.add(edge);
    if (!GRAPH[from].includes(to)) illegal.push(edge);
  }

  it('moves only along the declared transitions', () => {
    expect([...new Set(illegal)]).toEqual([]);
  });

  it('reaches every declared transition', () => {
    const declared = (Object.keys(GRAPH) as CaseState[]).flatMap((from) => GRAPH[from].map((to) => `${from}->${to}`));
    expect(declared.filter((e) => !seen.has(e))).toEqual([]);
  });

  it('never leaves a final state', () => {
    const finals = (Object.keys(GRAPH) as CaseState[]).filter((s) => GRAPH[s].length === 0);
    expect([...seen].filter((e) => finals.includes(e.split('->')[0] as CaseState))).toEqual([]);
  });
});
