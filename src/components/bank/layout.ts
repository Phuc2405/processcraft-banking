/**
 * Where everything sits on the bank map, and the wires between the desks.
 *
 * The map is drawn on a fixed stage (STAGE.width by STAGE.height) that the screen scales to fit, so every
 * number here is in stage units. Wires are routed by hand as right-angle runs with rounded corners:
 * a handful of channels are reserved between the columns so that no two wires share a vertical run.
 */

import { edgeId, WIRES, type DepartmentId, type PlaceId } from '../../sim/topology';

/**
 * The branch itself is the BUILDING (the old stage). The pavement outside, with the sidewalk ATM and the right-hand gutter that
 * its wires run up, is the extra STAGE area around it.
 */
export const BUILDING = { width: 1080, height: 810 } as const;
export const STAGE = { width: 1120, height: 980 } as const;

export const CARD = { w: 160, h: 92 } as const;

export interface PlaceBox {
  /** Centre. */
  cx: number;
  cy: number;
  w: number;
  h: number;
}

const card = (cx: number, cy: number): PlaceBox => ({ cx, cy, ...CARD });

export const PLACE_BOX: Record<PlaceId, PlaceBox> = {
  GATE_VIRTUAL: card(100, 118),
  GATE_POS: card(100, 250),
  GATE_A2A: card(100, 382),
  GATE_ECOM: card(100, 514),
  SEC_VAULT: card(300, 118),
  SEC_DCVV: card(500, 118),
  SEC_3DS: card(300, 374),
  BNPL: card(300, 542),
  // The two ledger desks sit 48 units apart (not 38), so their borders, badges and staff never crowd each other.
  LEDGER_DEBIT: card(780, 240),
  LEDGER_CREDIT: card(780, 380),
  EOD_BATCH: card(100, 728),
  EOD_VISA: card(320, 728),
  RECON: card(540, 728),
  SUSPENSE: card(760, 728),
  GATE_ATM: card(580, 890),
  ATM_CASH: card(780, 890),
  CUSTOMER_OTP: { cx: 500, cy: 312, w: 150, h: 62 },
  OUT_DECLINED: { cx: 1000, cy: 150, w: 110, h: 100 },
  OUT_APPROVED: { cx: 1000, cy: 354, w: 110, h: 100 },
  OUT_SETTLED: { cx: 985, cy: 728, w: 110, h: 92 },
};

export interface DeptBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DEPT_BOX: Record<DepartmentId, DeptBox> = {
  GATES: { x: 10, y: 36, w: 180, h: 550 },
  SECURITY: { x: 208, y: 36, w: 384, h: 396 },
  LEDGER: { x: 688, y: 160, w: 184, h: 280 },
  BNPL: { x: 208, y: 460, w: 184, h: 140 },
  EOD: { x: 10, y: 646, w: 1060, h: 140 },
  ATM: { x: 480, y: 826, w: 400, h: 142 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Wires
// ─────────────────────────────────────────────────────────────────────────────

type Side = 'l' | 'r' | 't' | 'b';
type Port = readonly [Side, number?];
type Pt = readonly [number, number];

interface RouteSpec {
  from: Port;
  to: Port;
  /** Where the vertical run of a horizontal-vertical-horizontal wire goes. */
  bendX?: number;
  /** Every corner between the two ends, for the wires that go the long way round. */
  via?: readonly Pt[];
  labelAt?: Pt;
  /** Wires too short to carry their words leave them off. */
  quiet?: boolean;
}

const R = (from: Port, to: Port, extra: Partial<RouteSpec> = {}): RouteSpec => ({ from, to, ...extra });

const ROUTES: Record<string, RouteSpec> = {
  // Virtual cards
  'GATE_VIRTUAL>SEC_VAULT': R(['r'], ['l']),
  'SEC_VAULT>SEC_DCVV': R(['r'], ['l']),
  'SEC_VAULT>OUT_DECLINED': R(['t', 60], ['t', -15], { via: [[360, 8], [985, 8]], labelAt: [450, 8] }),
  'SEC_DCVV>LEDGER_DEBIT': R(['r', -10], ['l', -32], { bendX: 616 }),
  'SEC_DCVV>LEDGER_CREDIT': R(['r', 10], ['l', -32], { bendX: 628 }),
  'SEC_DCVV>OUT_DECLINED': R(['t', 60], ['t', 15], { via: [[560, 20], [1015, 20]], labelAt: [650, 20] }),
  // Card present
  'GATE_POS>LEDGER_DEBIT': R(['r'], ['l', 6], { labelAt: [250, 242] }),
  'GATE_POS>LEDGER_CREDIT': R(['r', 8], ['l', -12], { bendX: 640 }),
  // Instant account-to-account transfers: out of the A2A gate, up the channel between the columns, along the open corridor
  // above the card-present wire, and straight into the top of the debit CASA ledger. A malformed message takes the lane above.
  'GATE_A2A>LEDGER_DEBIT': R(['r', -10], ['t', -8], { via: [[196, 372], [196, 190], [772, 190]], labelAt: [470, 190] }),
  'GATE_A2A>OUT_DECLINED': R(['r', 10], ['l', 22], { via: [[204, 392], [204, 172]], labelAt: [800, 172] }),
  // Online
  'GATE_ECOM>SEC_3DS': R(['r', -14], ['l'], { bendX: 200 }),
  'GATE_ECOM>BNPL': R(['r', 14], ['l'], { bendX: 204 }),
  'SEC_3DS>CUSTOMER_OTP': R(['r', -30], ['l', -10], { bendX: 407, quiet: true }),
  'CUSTOMER_OTP>SEC_3DS': R(['l', 10], ['r', -14], { bendX: 396, quiet: true }),
  'SEC_3DS>LEDGER_DEBIT': R(['r', 4], ['l', 8], { bendX: 652 }),
  'SEC_3DS>LEDGER_CREDIT': R(['r', 20], ['l', 8], { bendX: 664 }),
  'SEC_3DS>OUT_DECLINED': R(['b', 50], ['r', 0], { via: [[350, 446], [1066, 446], [1066, 150]], labelAt: [460, 446] }),
  // Pay-in-4
  'BNPL>LEDGER_DEBIT': R(['r', -14], ['l', 28], { bendX: 676, labelAt: [520, 528] }),
  'BNPL>LEDGER_CREDIT': R(['r', 6], ['l', 28], { bendX: 684 }),
  // Ledger
  'LEDGER_DEBIT>OUT_APPROVED': R(['r', 10], ['l', -14], { bendX: 905 }),
  'LEDGER_DEBIT>OUT_DECLINED': R(['r', -10], ['l', -10], { bendX: 895 }),
  'LEDGER_CREDIT>OUT_APPROVED': R(['r', -10], ['l', 10]),
  'LEDGER_CREDIT>OUT_DECLINED': R(['r', 10], ['l', 15], { bendX: 925 }),
  // Night cycle
  'OUT_APPROVED>EOD_BATCH': R(['b'], ['t'], { via: [[1000, 604], [100, 604]], labelAt: [560, 604] }),
  'EOD_BATCH>EOD_VISA': R(['r'], ['l']),
  'EOD_VISA>RECON': R(['r'], ['l']),
  'RECON>OUT_SETTLED': R(['t'], ['t'], { via: [[540, 664], [985, 664]], labelAt: [760, 664] }),
  'RECON>SUSPENSE': R(['r'], ['l']),
  'SUSPENSE>OUT_SETTLED': R(['r'], ['l']),
  // The sidewalk ATM. A jam goes straight up into the suspense account. Declines join the lane the 3DS rejections already take up the
  // right-hand margin; cash paid out gets a lane of its own beside it.
  'GATE_ATM>ATM_CASH': R(['r'], ['l'], { quiet: true }),
  'GATE_ATM>OUT_DECLINED': R(['b', -30], ['r'], { via: [[550, 956], [1066, 956], [1066, 150]], labelAt: [680, 956] }),
  'ATM_CASH>OUT_DECLINED': R(['b', 30], ['r'], { via: [[810, 946], [1066, 946], [1066, 150]], quiet: true }),
  'ATM_CASH>OUT_APPROVED': R(['r', -10], ['r', 30], { via: [[1090, 880], [1090, 384]], labelAt: [970, 880] }),
  'ATM_CASH>SUSPENSE': R(['t'], ['b', 20]),
};

function anchor(place: PlaceId, [side, d = 0]: Port): Pt {
  const b = PLACE_BOX[place];
  switch (side) {
    case 'l':
      return [b.cx - b.w / 2, b.cy + d];
    case 'r':
      return [b.cx + b.w / 2, b.cy + d];
    case 't':
      return [b.cx + d, b.cy - b.h / 2];
    case 'b':
      return [b.cx + d, b.cy + b.h / 2];
  }
}

function pointsOf(from: PlaceId, to: PlaceId, spec: RouteSpec): Pt[] {
  const a = anchor(from, spec.from);
  const b = anchor(to, spec.to);
  if (spec.via) return [a, ...spec.via, b];
  if (a[1] === b[1] || a[0] === b[0]) return [a, b];
  if (spec.bendX !== undefined) return [a, [spec.bendX, a[1]], [spec.bendX, b[1]], b];
  // An L: leave along the side the wire starts on.
  return spec.from[0] === 'l' || spec.from[0] === 'r' ? [a, [b[0], a[1]], b] : [a, [a[0], b[1]], b];
}

/** A right-angle run through `points`, with each corner rounded. */
export function roundedPath(points: readonly Pt[], radius = 12): string {
  const first = points[0];
  if (!first) return '';
  let d = `M${first[0]} ${first[1]}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1] as Pt;
    const here = points[i] as Pt;
    const next = points[i + 1];
    if (!next) {
      d += `L${here[0]} ${here[1]}`;
      continue;
    }
    const lenIn = Math.hypot(here[0] - prev[0], here[1] - prev[1]);
    const lenOut = Math.hypot(next[0] - here[0], next[1] - here[1]);
    const r = Math.min(radius, lenIn / 2, lenOut / 2);
    const inX = Math.sign(here[0] - prev[0]);
    const inY = Math.sign(here[1] - prev[1]);
    const outX = Math.sign(next[0] - here[0]);
    const outY = Math.sign(next[1] - here[1]);
    d += `L${here[0] - inX * r} ${here[1] - inY * r}Q${here[0]} ${here[1]} ${here[0] + outX * r} ${here[1] + outY * r}`;
  }
  return d;
}

export interface Wire {
  id: string;
  from: PlaceId;
  to: PlaceId;
  label: string | null;
  path: string;
  points: Pt[];
  labelAt: Pt;
  showLabel: boolean;
}

function midOfLongestRun(points: readonly Pt[]): Pt {
  let best: Pt = points[0] ?? [0, 0];
  let bestLen = -1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > bestLen) {
      bestLen = len;
      best = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }
  }
  return best;
}

export const BANK_WIRES: Wire[] = WIRES.map(([from, to, label]) => {
  const id = edgeId(from, to);
  const spec = ROUTES[id];
  if (!spec) throw new Error(`No route drawn for the wire ${id}`);
  const points = pointsOf(from, to, spec);
  return { id, from, to, label: label ?? null, path: roundedPath(points), points, labelAt: spec.labelAt ?? midOfLongestRun(points), showLabel: !spec.quiet };
});

const BY_ID = new Map(BANK_WIRES.map((w) => [w.id, w]));

export const wireById = (id: string): Wire | undefined => BY_ID.get(id);

/** The path a packet takes along a wire, or null if the wire is not on the map. */
export const pathOfWire = (id: string): string | null => BY_ID.get(id)?.path ?? null;

// ─────────────────────────────────────────────────────────────────────────────
// Where a desk's description opens
// ─────────────────────────────────────────────────────────────────────────────

/** The size of a desk description, in stage units (it is drawn at this size whatever the zoom). */
export const HOVER_TIP = { w: 236, h: 84, gap: 6 } as const;

export type TipSide = 'below' | 'above' | 'right' | 'left';

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const rectOf = (b: PlaceBox): Rect => ({ x0: b.cx - b.w / 2, y0: b.cy - b.h / 2, x1: b.cx + b.w / 2, y1: b.cy + b.h / 2 });
const area = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** The rectangle a description would cover on each side of a desk. */
export function tipRect(place: PlaceId, side: TipSide): Rect {
  const b = rectOf(PLACE_BOX[place]);
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const { w, h, gap } = HOVER_TIP;
  switch (side) {
    case 'below':
      return { x0: cx - w / 2, y0: b.y1 + gap, x1: cx + w / 2, y1: b.y1 + gap + h };
    case 'above':
      return { x0: cx - w / 2, y0: b.y0 - gap - h, x1: cx + w / 2, y1: b.y0 - gap };
    case 'right':
      return { x0: b.x1 + gap, y0: cy - h / 2, x1: b.x1 + gap + w, y1: cy + h / 2 };
    case 'left':
      return { x0: b.x0 - gap - w, y0: cy - h / 2, x1: b.x0 - gap, y1: cy + h / 2 };
  }
}

/**
 * The side a desk's description opens on: the first of below, above, right, left where it stays on the stage and covers no
 * other desk or tally; failing that, the side that covers least. Worked out once, from the layout.
 */
export function tipSideFor(place: PlaceId): TipSide {
  const others = (Object.keys(PLACE_BOX) as PlaceId[]).filter((p) => p !== place).map((p) => rectOf(PLACE_BOX[p]));
  let best: TipSide = 'below';
  let bestCost = Infinity;
  for (const side of ['below', 'above', 'right', 'left'] as const) {
    const r = tipRect(place, side);
    const outside = r.x0 < 0 || r.y0 < 0 || r.x1 > STAGE.width || r.y1 > STAGE.height;
    const cost = (outside ? 1e7 : 0) + others.reduce((n, o) => n + area(r, o), 0);
    if (cost === 0) return side;
    if (cost < bestCost) {
      best = side;
      bestCost = cost;
    }
  }
  return best;
}

export const TIP_SIDE: Readonly<Record<PlaceId, TipSide>> = Object.fromEntries((Object.keys(PLACE_BOX) as PlaceId[]).map((p) => [p, tipSideFor(p)])) as Record<PlaceId, TipSide>;
