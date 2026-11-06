/**
 * The map's stroke colours, and the one rule that keeps them apart: two wires of different colours never run on top of each other.
 * Pure, so the whole map is checked without a DOM.
 *
 * Every wire is drawn in one tone (wireTone, gatewayTone, gold for the cash lines). `separateLanes` walks the strokes in order and,
 * where a run of one tone lies closer than LANE_GAP to a parallel run of another, slides that run sideways to the nearest clear lane.
 * Only an inner run of a right-angle wire moves, so its ends stay on their ports and the runs either side just grow or shrink.
 * A stroke's `key` says in which scenarios it is lit (the flows and sub-processes whose route it is): two wires of one tone but
 * different keys are drawn in different colours whenever one is lit and the other is not, so they are kept apart too. Strokes on one
 * `bus` (a gateway's feeders merging into its trunk) may share a line: that bus is drawn on purpose.
 */

import type { Pt } from '../../types/geometry';

/** The colour family a stroke is drawn in on the 2D map. */
export type WireTone = 'route' | 'decline' | 'night' | 'otp' | 'vault' | 'cash';

/** The tone of a routed wire, from its two ends (BankMap colours it from this). */
export function wireTone(to: string, from: string): WireTone {
  if (to === 'OUT_DECLINED') return 'decline';
  if (from === 'OUT_APPROVED' || from.startsWith('EOD_') || from === 'RECON' || from === 'SUSPENSE' || to === 'OUT_SETTLED') return 'night';
  if (to === 'CUSTOMER_OTP' || from === 'CUSTOMER_OTP') return 'otp';
  if (from === 'COLLATERAL_VAULT' || from === 'MAIN_CASH_VAULT') return 'vault';
  return 'route';
}

/** A collector gateway's trunk takes the tone of the wires it collects. */
export const GATEWAY_TONE = { reject: 'decline', approve: 'route', night: 'night' } as const satisfies Record<string, WireTone>;

/** The least distance, centre to centre, between parallel runs of different tones (strokes are 2-3.6 px wide). */
export const LANE_GAP = 10;
/** Runs of one tone are kept at least this far apart when one is moved (so a moved run never merges into a bus by chance). */
const SAME_TONE_GAP = 3;
/** Parallel runs that share less than this much length only touch at a corner: not an overlap. */
const MIN_OVERLAP = 2;
/** The furthest a run is slid looking for a clear lane. */
const MAX_SHIFT = 40;

export interface Stroke {
  id: string;
  tone: WireTone;
  points: readonly Pt[];
  /** Placed already (a gateway trunk, a wire of an earlier pass): others make room for it, it never moves. */
  fixed?: boolean;
  /** Which scenarios light it, as a signature: strokes of one tone and one key look alike in every scenario. Absent: by tone only. */
  key?: string;
  /** The gateway bus it runs on, if any: strokes of one bus may share a line. */
  bus?: string;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Run {
  id: string;
  tone: WireTone;
  key?: string;
  bus?: string;
  /** 'h': along x at y = `at`; 'v': along y at x = `at`. */
  axis: 'h' | 'v';
  at: number;
  lo: number;
  hi: number;
}

type StrokeLike = Pick<Stroke, 'id' | 'tone' | 'points' | 'key' | 'bus'>;

function runOf(s: Omit<StrokeLike, 'points'>, a: Pt, b: Pt): Run | null {
  const { id, tone, key, bus } = s;
  if (a[1] === b[1] && a[0] !== b[0]) return { id, tone, key, bus, axis: 'h', at: a[1], lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]) };
  if (a[0] === b[0] && a[1] !== b[1]) return { id, tone, key, bus, axis: 'v', at: a[0], lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]) };
  return null;
}

const runsOf = (s: StrokeLike): Run[] => s.points.slice(1).flatMap((b, i) => runOf(s, s.points[i]!, b) ?? []);

const shared = (a: Run, b: Run): number => Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo);

/** Whether two runs can ever be drawn in different colours: another tone, or one tone lit in different scenarios. One bus never. */
const differ = (r: Run, q: Run): boolean => !(r.bus !== undefined && r.bus === q.bus) && (r.tone !== q.tone || (r.key !== undefined && q.key !== undefined && r.key !== q.key));

/** Whether run `r` sits too close to `q` (another stroke's): closer than LANE_GAP to one it can differ from, or on top of a look-alike. */
const crowds = (r: Run, q: Run, strict: boolean): boolean =>
  q.id !== r.id && q.axis === r.axis && shared(r, q) > MIN_OVERLAP && Math.abs(r.at - q.at) < (differ(r, q) ? LANE_GAP : strict ? SAME_TONE_GAP : 0);

const crossesBox = (r: Run, b: Box): boolean => (r.axis === 'h' ? r.at > b.y0 && r.at < b.y1 && r.hi > b.x0 && r.lo < b.x1 : r.at > b.x0 && r.at < b.x1 && r.hi > b.y0 && r.lo < b.y1);

/**
 * The strokes with every crowded inner run slid to the nearest clear lane (fixed strokes and runs already clear come back as given).
 * Strokes are placed in order, so a later stroke makes room for an earlier one. `obstacles` are the cards a moved run must not cross.
 */
export function separateLanes(strokes: readonly Stroke[], obstacles: readonly Box[] = []): Map<string, Pt[]> {
  const placed: Run[] = strokes.filter((s) => s.fixed).flatMap(runsOf);
  const out = new Map<string, Pt[]>();
  for (const s of strokes) {
    if (s.fixed) continue;
    const pts: [number, number][] = s.points.map(([x, y]) => [x, y]);
    // An inner run only (never the first or last, whose end is a port), and only between two runs at right angles to it.
    for (let i = 1; i < pts.length - 2; i++) {
      const run = runOf(s, pts[i]!, pts[i + 1]!);
      if (!run || !placed.some((q) => crowds(run, q, false))) continue;
      const before = runOf(s, pts[i - 1]!, pts[i]!);
      const after = runOf(s, pts[i + 1]!, pts[i + 2]!);
      if (!before || !after || before.axis === run.axis || after.axis === run.axis) continue;
      const clear = (at: number): boolean => {
        const moved = { ...run, at };
        return !placed.some((q) => crowds(moved, q, true)) && !obstacles.some((b) => crossesBox(moved, b));
      };
      const shift = Array.from({ length: MAX_SHIFT }, (_, k) => k + 1)
        .flatMap((d) => [-d, d])
        .find((d) => clear(run.at + d));
      if (shift === undefined) continue;
      const k = run.axis === 'h' ? 1 : 0;
      pts[i]![k] += shift;
      pts[i + 1]![k] += shift;
    }
    placed.push(...runsOf({ ...s, points: pts }));
    out.set(s.id, pts);
  }
  return out;
}

/** Every place two strokes that can differ in colour run on top of each other (closer than LANE_GAP along a shared length): empty on a clean map. */
export function laneConflicts(strokes: readonly StrokeLike[]): { a: string; b: string; axis: 'h' | 'v'; at: [number, number] }[] {
  const runs = strokes.flatMap(runsOf);
  const out: { a: string; b: string; axis: 'h' | 'v'; at: [number, number] }[] = [];
  runs.forEach((r, i) => {
    for (const q of runs.slice(i + 1)) if (differ(r, q) && crowds(r, q, false)) out.push({ a: r.id, b: q.id, axis: r.axis, at: [r.at, q.at] });
  });
  return out;
}
