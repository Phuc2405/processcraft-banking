/**
 * Who comes to a staffed counter when a human-driven demo runs (the teller's cash counter, the disputes desk, the Savings Desk, the
 * Savings & Collateral Desk and the Pay-in-4 appraisal counter): customers walk in, queue and are served in turn, while an officer stands in on the case. Every one of them follows the
 * same pattern: spawn, walk the path to the counter, the counter works the case (with a status over their head), done, walk away. A pure timeline on seconds since the demo began, read the same way by the
 * 2D map and the 3D office. It only draws people: the simulation, its KPIs and its seeded days never see it.
 */

import { actorStatus, type ActorStatus } from './actorStatus';
import type { PresetId } from './presets';
import type { OpsActionId } from './retailOps';

export type VisitDesk = 'TELLER_CASH' | 'DISPUTE_DESK' | 'SAVINGS_DESK' | 'COLLATERAL_VAULT' | 'BNPL';
export const VISIT_DESKS: readonly VisitDesk[] = ['TELLER_CASH', 'DISPUTE_DESK', 'SAVINGS_DESK', 'COLLATERAL_VAULT', 'BNPL'];
/** The counters whose own staff are already seated there all day: the case customer walks up to them, no officer walks in. */
export const SEATED_DESKS: readonly VisitDesk[] = ['TELLER_CASH', 'DISPUTE_DESK'];

export type VisitWork = 'cash' | 'dispute' | 'close' | 'lock' | 'liquidate' | 'appraise' | 'refuse';

/** A demo button that can bring people in: a core preset or a retail-book action. */
export type VisitAction = PresetId | OpsActionId;

export interface DeskVisitStep {
  desk: VisitDesk;
  customers: number;
  officer: boolean;
  /** Seconds after the demo begins that this desk's people set off. */
  delay: number;
  work: VisitWork;
}

/** The demos that bring people in, desk by desk, following each action's route. */
export const DESK_VISITS: Readonly<Partial<Record<VisitAction, readonly DeskVisitStep[]>>> = {
  // Quầy Tiền mặt & CTR (Flow 06): the case customer walks up to the teller's case window, is served for the 8-second case stay, and leaves.
  'teller-12k': [{ desk: 'TELLER_CASH', customers: 1, officer: false, delay: 0, work: 'cash' }],
  'teller-smurf': [{ desk: 'TELLER_CASH', customers: 1, officer: false, delay: 0, work: 'cash' }],
  'teller-51': [{ desk: 'TELLER_CASH', customers: 1, officer: false, delay: 0, work: 'refuse' }],
  'teller-frozen': [{ desk: 'TELLER_CASH', customers: 1, officer: false, delay: 0, work: 'refuse' }],
  'teller-deposit-5000': [{ desk: 'TELLER_CASH', customers: 1, officer: false, delay: 0, work: 'cash' }],
  'teller-exceed-limit': [{ desk: 'TELLER_CASH', customers: 1, officer: false, delay: 0, work: 'cash' }],
  'teller-counterfeit': [{ desk: 'TELLER_CASH', customers: 1, officer: false, delay: 0, work: 'refuse' }],
  // Quầy Tra soát / Khiếu nại (Flow 08).
  'claim-return': [{ desk: 'DISPUTE_DESK', customers: 1, officer: false, delay: 0, work: 'dispute' }],
  'claim-rejected': [{ desk: 'DISPUTE_DESK', customers: 1, officer: false, delay: 0, work: 'refuse' }],
  'td-break-10k': [{ desk: 'SAVINGS_DESK', customers: 3, officer: true, delay: 0, work: 'close' }],
  'td-mature-close': [{ desk: 'SAVINGS_DESK', customers: 2, officer: true, delay: 0, work: 'close' }],
  'td-break-pledged': [{ desk: 'SAVINGS_DESK', customers: 2, officer: true, delay: 0, work: 'refuse' }],
  'td-break-id-mismatch': [{ desk: 'SAVINGS_DESK', customers: 2, officer: true, delay: 0, work: 'refuse' }],
  'collateral-lock': [
    { desk: 'COLLATERAL_VAULT', customers: 2, officer: true, delay: 0, work: 'lock' },
    { desk: 'SAVINGS_DESK', customers: 1, officer: false, delay: 5, work: 'lock' },
  ],
  'collateral-liquidate': [
    { desk: 'COLLATERAL_VAULT', customers: 2, officer: true, delay: 0, work: 'liquidate' },
    { desk: 'SAVINGS_DESK', customers: 2, officer: false, delay: 5, work: 'liquidate' },
  ],
  'collateral-release': [
    { desk: 'COLLATERAL_VAULT', customers: 2, officer: true, delay: 0, work: 'close' },
    { desk: 'SAVINGS_DESK', customers: 1, officer: false, delay: 5, work: 'close' },
  ],
  'collateral-shortfall': [
    { desk: 'COLLATERAL_VAULT', customers: 2, officer: true, delay: 0, work: 'liquidate' },
    { desk: 'SAVINGS_DESK', customers: 1, officer: false, delay: 5, work: 'liquidate' },
  ],
  // The Pay-in-4 appraisal counter (Quầy thẩm định): the applicant sits down with the credit officer while the file is scored.
  'bnpl-approve-400': [{ desk: 'BNPL', customers: 2, officer: true, delay: 0, work: 'appraise' }],
  'bnpl-decline-dti': [{ desk: 'BNPL', customers: 2, officer: true, delay: 0, work: 'refuse' }],
  'bnpl-decline-cic': [{ desk: 'BNPL', customers: 2, officer: true, delay: 0, work: 'refuse' }],
};

export type Pt = readonly [number, number];

/** A desk's walking routes in one view's coordinates (the 2D stage's pixels, or the 3D floor's metres). */
export interface VisitGeometry {
  /** Units per second on foot. */
  speed: number;
  /** Where the customer in place `place` of the line stands (0 is at the counter). */
  slot(place: number): Pt;
  /** The way in to place `place`, ending on its slot. */
  walkIn(place: number): readonly Pt[];
  /** The way out from the counter, starting on slot 0. */
  walkOut: readonly Pt[];
  /** The officer's way in, ending where they stand beside the desk. */
  officerIn: readonly Pt[];
}

export type VisitPhase = 'walk' | 'queue' | 'transact' | 'leave';

/** What the label over a visitor's head says (actorStatus.ts: the same words as every other actor's). */
export const statusOfPhase = (phase: VisitPhase): ActorStatus => actorStatus('visit', phase)!;

export interface VisitFigure {
  /** Stable across frames: `c0`, `c1`… for customers, `officer` for the officer. */
  key: string;
  role: 'customer' | 'officer';
  /** Null while not on the map: not yet set off, or already gone. */
  phase: VisitPhase | null;
  at: Pt;
  /** The direction they are moving (or, standing still, facing), as [dx, dy]. */
  heading: Pt;
}

/**
 * Seconds between customers setting off, at the counter, and stepping up one place. The first customer is the demo's own case: they
 * stay at the counter for `serveCase`, long enough for the payment to be worked while they are there, so the counter is seen at work.
 */
export const VISIT_PACE = { stagger: 1.8, serve: 4.5, serveCase: 8, stepUp: 0.9 } as const;
const serveTime = (i: number): number => (i === 0 ? VISIT_PACE.serveCase : VISIT_PACE.serve);

const pathLength = (path: readonly Pt[]): number => {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  return n;
};

/** The point `d` along a path, and the direction of travel there. */
function along(path: readonly Pt[], d: number): { at: Pt; heading: Pt } {
  let left = Math.max(0, d);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= len || i === path.length - 1) {
      const u = len === 0 ? 0 : Math.min(1, left / len);
      return { at: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], heading: [b[0] - a[0], b[1] - a[1]] };
    }
    left -= len;
  }
  return { at: path[path.length - 1] ?? [0, 0], heading: [0, 1] };
}

interface CustomerTimes {
  set: number;
  arrive: number;
  serve: number;
  done: number;
  gone: number;
}

/** When each customer sets off, reaches the line, reaches the counter, is finished and has gone. */
function customerTimes(step: DeskVisitStep, geo: VisitGeometry): CustomerTimes[] {
  const out: CustomerTimes[] = [];
  const leave = pathLength(geo.walkOut) / geo.speed;
  for (let i = 0; i < step.customers; i++) {
    const set = step.delay + i * VISIT_PACE.stagger;
    const arrive = set + pathLength(geo.walkIn(i)) / geo.speed;
    const prev = out[i - 1];
    // They need the counter free and their own walk up the line done.
    const serve = Math.max(arrive + i * VISIT_PACE.stepUp, prev ? prev.done + VISIT_PACE.stepUp : 0);
    const done = serve + serveTime(i);
    out.push({ set, arrive, serve, done, gone: done + leave });
  }
  return out;
}

/** When the last person of this step has gone. */
export function visitDuration(step: DeskVisitStep, geo: VisitGeometry): number {
  const times = customerTimes(step, geo);
  const lastDone = times[times.length - 1]?.done ?? step.delay;
  const gone = times[times.length - 1]?.gone ?? step.delay;
  if (!step.officer) return gone;
  const walk = pathLength(geo.officerIn) / geo.speed;
  return Math.max(gone, Math.max(lastDone, step.delay + walk) + walk);
}

/** Everyone in this step at `t` seconds since the demo began. */
export function visitFrame(step: DeskVisitStep, geo: VisitGeometry, t: number): VisitFigure[] {
  const times = customerTimes(step, geo);
  const figures: VisitFigure[] = times.map((c, i): VisitFigure => {
    const key = `c${i}`;
    const hidden: VisitFigure = { key, role: 'customer', phase: null, at: geo.slot(i), heading: [0, -1] };
    if (t < c.set || t >= c.gone) return hidden;
    if (t < c.arrive) return { key, role: 'customer', phase: 'walk', ...along(geo.walkIn(i), (t - c.set) * geo.speed) };
    if (t >= c.done) return { key, role: 'customer', phase: 'leave', ...along(geo.walkOut, (t - c.done) * geo.speed) };
    // In line: one place further up for everyone ahead who has finished, stepping up from where they stood.
    const ahead = times.slice(0, i);
    const place = ahead.filter((a) => t < a.done).length;
    const since = Math.min(t - c.arrive, ...ahead.filter((a) => t >= a.done).map((a) => t - a.done));
    const from = geo.slot(place + 1);
    const to = geo.slot(place);
    const moved = i > 0 && place < i && since < VISIT_PACE.stepUp;
    if (moved) {
      const u = since / VISIT_PACE.stepUp;
      return { key, role: 'customer', phase: 'walk', at: [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u], heading: [to[0] - from[0], to[1] - from[1]] };
    }
    const standing = place < i ? to : geo.slot(i);
    return { key, role: 'customer', phase: place === 0 && t >= c.serve ? 'transact' : 'queue', at: standing, heading: [0, -1] };
  });
  if (step.officer) {
    const walk = pathLength(geo.officerIn) / geo.speed;
    const start = step.delay;
    const lastDone = times[times.length - 1]?.done ?? start;
    const out = Math.max(lastDone, start + walk);
    const back = [...geo.officerIn].reverse();
    const spot = geo.officerIn[geo.officerIn.length - 1] ?? ([0, 0] as Pt);
    const key = 'officer';
    if (t < start || t >= out + walk) figures.push({ key, role: 'officer', phase: null, at: spot, heading: [0, -1] });
    else if (t < start + walk) figures.push({ key, role: 'officer', phase: 'walk', ...along(geo.officerIn, (t - start) * geo.speed) });
    else if (t >= out) figures.push({ key, role: 'officer', phase: 'leave', ...along(back, (t - out) * geo.speed) });
    else {
      const last = geo.officerIn[geo.officerIn.length - 2] ?? spot;
      figures.push({ key, role: 'officer', phase: times.some((c) => t >= c.serve && t < c.done) ? 'transact' : 'queue', at: spot, heading: [spot[0] - last[0], spot[1] - last[1]] });
    }
  }
  return figures;
}

// Walk-in customers through the working day

/**
 * The Savings Desk and the Savings & Collateral Desk have no channel in the seeded day (their cases are demo-only, CREDIT_OPS), so without
 * this nobody ever came to them unless a demo button was pressed. While the bank plays through opening hours, a depositor walks up
 * to the Savings Desk every `every` minutes, and a borrower is shown into the vault with its officer. Pure: drawn only, never posted,
 * so the simulation, its KPIs and its seeded days stay exactly as they were.
 */
export interface AmbientVisitSlot {
  desk: Extract<VisitDesk, 'SAVINGS_DESK' | 'COLLATERAL_VAULT'>;
  /** Bank minutes between walk-ins. */
  every: number;
  /** Bank minutes after opening that the first one walks in. */
  offset: number;
  officer: boolean;
  /** What the walk-in's business is, in turn. */
  works: readonly VisitWork[];
}

export const AMBIENT_VISITS: readonly AmbientVisitSlot[] = [
  { desk: 'SAVINGS_DESK', every: 30, offset: 10, officer: false, works: ['close', 'close', 'lock'] },
  { desk: 'COLLATERAL_VAULT', every: 45, offset: 25, officer: true, works: ['lock', 'close', 'liquidate'] },
];

/** The walk-ins due when the clock moves from `from` (exclusive) to `to` (inclusive), within opening hours [open, close). One per desk at most: a jump of hours is not a crowd. */
export function ambientVisitsDue(from: number, to: number, open: number, close: number): DeskVisitStep[] {
  if (to <= from) return [];
  const out: DeskVisitStep[] = [];
  for (const slot of AMBIENT_VISITS) {
    const first = open + slot.offset;
    // The last walk-in time in (from, to], if any.
    const hi = Math.min(to, close - 1);
    if (hi < first) continue;
    const k = Math.floor((hi - first) / slot.every);
    const at = first + k * slot.every;
    if (at <= from || at > hi) continue;
    out.push({ desk: slot.desk, customers: 1 + (k % 2), officer: slot.officer, delay: 0, work: slot.works[k % slot.works.length]! });
  }
  return out;
}

/** How many of a step's customers are on their way in or in line (waiting), and at the counter (processing), at `t`. The officer is staff, never counted. */
export function visitCounts(step: DeskVisitStep, geo: VisitGeometry, t: number): { waiting: number; processing: number } {
  let waiting = 0;
  let processing = 0;
  for (const f of visitFrame(step, geo, t)) {
    if (f.role !== 'customer' || !f.phase || f.phase === 'leave') continue;
    if (f.phase === 'transact') processing++;
    else waiting++;
  }
  return { waiting, processing };
}
