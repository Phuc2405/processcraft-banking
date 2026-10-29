/** The plan behind Spotlight ("Learn & Explore"): where on the bank map each step of a lesson happens, and the wires a single walkthrough token rides to get there. */

import { activeLocale } from '../i18n/localeCore';
import { LESSONS, type ProcessId } from './learning';
import { DEFAULT_RULES, type BankRules } from './rules';
import { STATIONS, WIRES, edgeId, isStation, type DepartmentId, type PlaceId, type StationId } from './topology';
import { buildWalkthrough, type WalkStep, type Walkthrough } from './walkthrough';

export interface SpotStep {
  step: WalkStep;
  /** The desk (or tally) on the map where this step happens. */
  place: PlaceId;
  /** The places the token passes through to get here from the previous step, both ends included. One place means it stays. */
  route: PlaceId[];
}

export interface SpotPlan {
  process: ProcessId;
  exampleId: string;
  walk: Walkthrough;
  /** Where the token starts, if it comes from somewhere other than its first desk (the night cycle starts at Approved). */
  origin: PlaceId | null;
  steps: SpotStep[];
}

/** The example each process opens on: the one that shows the process doing its job in the most interesting way. */
export const SPOTLIGHT_DEFAULT_EXAMPLE: Record<ProcessId, string> = {
  A: 'fresh',
  B: 'borderline',
  C: 'strong',
  D: 'variance',
  E: 'split',
  F: 'vip',
};

/** Where a payment ends up, by the last box of its path. */
const END_PLACE: Record<string, PlaceId> = {
  n_end_approved: 'OUT_APPROVED',
  n_end_bnpl: 'OUT_APPROVED',
  n_end_card: 'OUT_APPROVED',
  n_end_declined: 'OUT_DECLINED',
  n_end_dp_declined: 'OUT_DECLINED',
  n_end_card_declined: 'OUT_DECLINED',
  n_end_settled: 'OUT_SETTLED',
  n_end_amount: 'SUSPENSE',
  n_end_missing: 'SUSPENSE',
  n_end_dup: 'SUSPENSE',
  // Chapter 5: instant transfers
  n_end_invalid: 'OUT_DECLINED',
  // Chapter 6, part one: AML. A released payment goes on to the ledger and out as approved; a report or an escalation is parked.
  n_end_released: 'OUT_APPROVED',
  n_end_cleared: 'OUT_APPROVED',
  n_end_sar: 'SUSPENSE',
  n_end_sanctions: 'OUT_DECLINED',
  n_end_edd: 'CUSTOMER_OTP',
  n_end_escalate: 'SUSPENSE',
  // Chapter 6, part two: a dispute ends in the night desk's books (settled or parked).
  n_end_retrieval: 'SUSPENSE',
  n_end_filed: 'SUSPENSE',
  n_end_represent: 'SUSPENSE',
  n_end_prearb: 'SUSPENSE',
  n_end_refunded: 'OUT_SETTLED',
  n_end_absorbed: 'OUT_SETTLED',
  n_end_merchant: 'OUT_SETTLED',
  n_end_barred: 'OUT_SETTLED',
};

/** Boxes whose desk the diagram does not name. */
const PLACE_OVERRIDE: Partial<Record<ProcessId, Record<string, PlaceId>>> = {
  D: { n_start: 'RECON' },
};

/** Where the token starts when the story begins somewhere other than the first desk. */
const ORIGIN: Partial<Record<ProcessId, PlaceId>> = { D: 'OUT_APPROVED' };

// Finding a way along the wires

const NEXT = new Map<PlaceId, PlaceId[]>();
for (const [from, to] of WIRES) NEXT.set(from, [...(NEXT.get(from) ?? []), to]);

/** The shortest chain of wires from one place to another, both ends included. A straight hop when none exists. */
export function routeBetween(from: PlaceId, to: PlaceId): PlaceId[] {
  if (from === to) return [from];
  const prev = new Map<PlaceId, PlaceId>();
  const seen = new Set<PlaceId>([from]);
  const queue: PlaceId[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i] as PlaceId;
    for (const next of NEXT.get(here) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, here);
      if (next === to) {
        const chain: PlaceId[] = [to];
        for (let at: PlaceId | undefined = prev.get(to); at !== undefined; at = prev.get(at)) chain.unshift(at);
        return chain;
      }
      queue.push(next);
    }
  }
  return [from, to];
}

/** The wire ids a route rides, in order. */
export function wiresOfRoute(route: readonly PlaceId[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < route.length; i++) out.push(edgeId(route[i - 1] as PlaceId, route[i] as PlaceId));
  return out;
}

// The plan

function resolvePlace(process: ProcessId, step: WalkStep, previous: PlaceId | null): PlaceId {
  if (step.place) return step.place;
  const override = PLACE_OVERRIDE[process]?.[step.nodeId];
  if (override) return override;
  const end = END_PLACE[step.nodeId];
  if (end) return end;
  if (previous) return previous;
  const first = LESSONS[process].desks[0];
  if (!first) throw new Error(`Process ${process} has no desks`);
  return first;
}

const planCache = new Map<string, SpotPlan>();

export function spotPlan(process: ProcessId, exampleId: string, rules: Partial<BankRules> = DEFAULT_RULES): SpotPlan {
  // The plan carries the words of the lesson, so each language has its own.
  const key = `${activeLocale()}|${process}|${exampleId}|${JSON.stringify(rules)}`;
  const hit = planCache.get(key);
  if (hit) return hit;

  const walk = buildWalkthrough(process, exampleId, rules);
  const origin = ORIGIN[process] ?? null;
  const steps: SpotStep[] = [];
  let previous: PlaceId | null = origin;
  for (const step of walk.steps) {
    const place = resolvePlace(process, step, previous);
    const route = previous ? routeBetween(previous, place) : [place];
    steps.push({ step, place, route });
    previous = place;
  }
  const plan: SpotPlan = { process, exampleId: walk.exampleId, walk, origin, steps };
  if (planCache.size > 400) planCache.clear();
  planCache.set(key, plan);
  return plan;
}

// What stays lit

export interface SpotScope {
  /** Every desk and tally the process uses. Everything else on the map is dimmed. */
  places: ReadonlySet<PlaceId>;
  /** The wires some example of the process rides. */
  wires: ReadonlySet<string>;
  stations: readonly StationId[];
  departments: ReadonlySet<DepartmentId>;
}

const scopeCache = new Map<ProcessId, SpotScope>();

/** The part of the map a process uses: the desks that take part, the tallies it ends in, and the wires its examples ride. */
export function spotScope(process: ProcessId): SpotScope {
  const hit = scopeCache.get(process);
  if (hit) return hit;
  const places = new Set<PlaceId>();
  const wires = new Set<string>();
  for (const def of Object.values(STATIONS)) if (def.processes.includes(process)) places.add(def.id);
  for (const example of LESSONS[process].examples) {
    const plan = spotPlan(process, example.id);
    for (const s of plan.steps) {
      places.add(s.place);
      for (const w of wiresOfRoute(s.route)) wires.add(w);
    }
  }
  const stations = [...places].filter(isStation);
  const departments = new Set<DepartmentId>(stations.map((id) => STATIONS[id].department));
  const scope: SpotScope = { places, wires, stations, departments };
  scopeCache.set(process, scope);
  return scope;
}

/** What the token has already passed by the time it reaches step `index`: the places and the wires. */
export function trailUpTo(plan: SpotPlan, index: number): { places: Set<PlaceId>; wires: Set<string> } {
  const places = new Set<PlaceId>();
  const wires = new Set<string>();
  if (plan.origin) places.add(plan.origin);
  for (let i = 0; i <= Math.min(index, plan.steps.length - 1); i++) {
    const s = plan.steps[i] as SpotStep;
    for (const p of s.route) places.add(p);
    for (const w of wiresOfRoute(s.route)) wires.add(w);
  }
  return { places, wires };
}
