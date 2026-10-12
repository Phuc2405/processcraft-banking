/**
 * "What would tomorrow look like if I changed this rule?"
 *
 * The same customers, the same tonight's records and the same people are run through the bank twice:
 * once with the rules as they are, once with the tweak. Traffic never depends on the rules (see traffic.ts),
 * so every difference in the numbers is down to the rule.
 */

import { BankSimulation, type BankSimOptions } from './bankSimulation';
import { compareReports, type KpiComparisonRow } from './kpis';
import { changedRules, clampRules, RULE_KEYS, type BankRules } from './rules';
import type { CarryState, DayEvent, DayKpis, DayReport, StationId } from './types';

/** Plays one whole day without drawing anything. */
export function simulateDay(options: BankSimOptions): DayReport {
  return new BankSimulation({ ...options, headless: true }).runToEndOfDay();
}

export interface DayPair {
  day: number;
  event: DayEvent;
  before: DayReport;
  after: DayReport;
}

export interface Comparison {
  startDay: number;
  count: number;
  changed: Array<keyof BankRules>;
  baseRules: BankRules;
  tweakedRules: BankRules;
  days: DayPair[];
  /** One day's report when count is 1, otherwise the days added together (and the last day's closing state). */
  before: DayReport;
  after: DayReport;
  rows: KpiComparisonRow[];
}

export interface CompareArgs {
  seed: number;
  /** The first day to play. "Tomorrow" is today + 1. */
  startDay: number;
  /** How many days to play, one after another. */
  count?: number;
  baseRules: BankRules;
  tweakedRules: Partial<BankRules>;
  /** What the first of those days inherits: the suspense account and the records the night team did not finish. */
  carry?: CarryState;
  /** Temporary cover to book on the first day only (the other days are not covered). */
  cover?: Partial<Record<StationId, number>>;
}

function addDeep<T>(a: T, b: T): T {
  if (typeof a === 'number' && typeof b === 'number') return (a + b) as T;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(a as object)) out[key] = addDeep((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]);
    return out as T;
  }
  return a;
}

/** Adds several days' numbers together. The closing state is that of the last day. */
export function sumReports(reports: readonly DayReport[]): DayReport {
  const first = reports[0];
  const last = reports[reports.length - 1];
  if (!first || !last) throw new Error('Nothing to add up');
  let kpis: DayKpis = structuredClone(first.kpis);
  for (const r of reports.slice(1)) kpis = addDeep(kpis, r.kpis);
  return { day: first.day, event: first.event, rules: first.rules, kpis, close: last.close, ...(last.nightShift ? { nightShift: last.nightShift } : {}), ...(first.book && last.book ? { book: { ...last.book, reservesStartCents: first.book.reservesStartCents, customersStart: first.book.customersStart, signups: reports.reduce((n, r) => n + (r.book?.signups ?? 0), 0), churned: reports.reduce((n, r) => n + (r.book?.churned ?? 0), 0) } } : {}) };
}

function playDays(seed: number, startDay: number, count: number, rules: BankRules, carry: CarryState | undefined, cover: CompareArgs['cover']): DayReport[] {
  const sim = new BankSimulation({ seed, day: startDay, rules, ...(carry ? { carry } : {}), ...(cover ? { cover } : {}), headless: true });
  const out: DayReport[] = [];
  for (let i = 0; i < count; i++) {
    out.push(sim.runToEndOfDay());
    if (i < count - 1) sim.nextDay();
  }
  return out;
}

const memo = new Map<string, DayReport[]>();

/** Plays `count` days from `startDay` under both rule sets and lines the numbers up. */
export function compareDays(args: CompareArgs): Comparison {
  const count = Math.max(1, Math.min(10, Math.floor(args.count ?? 1)));
  const tweaked = clampRules({ ...args.baseRules, ...args.tweakedRules });
  const key = (rules: BankRules): string =>
    JSON.stringify([args.seed, args.startDay, count, RULE_KEYS.map((k) => rules[k]), args.carry?.suspense.length ?? 0, args.carry?.backlog.length ?? 0, args.cover ?? null]);

  const run = (rules: BankRules): DayReport[] => {
    const k = key(rules);
    const cached = memo.get(k);
    if (cached) return cached;
    const reports = playDays(args.seed, args.startDay, count, rules, args.carry, args.cover);
    if (memo.size >= 12) memo.delete(memo.keys().next().value as string);
    memo.set(k, reports);
    return reports;
  };

  const beforeDays = run(args.baseRules);
  const changed = changedRules(args.baseRules, tweaked);
  const afterDays = changed.length === 0 ? beforeDays : run(tweaked);
  const days: DayPair[] = beforeDays.map((before, i) => ({ day: before.day, event: before.event, before, after: afterDays[i]! }));
  const before = sumReports(beforeDays);
  const after = sumReports(afterDays);
  return { startDay: args.startDay, count, changed, baseRules: args.baseRules, tweakedRules: tweaked, days, before, after, rows: compareReports(before, after) };
}
