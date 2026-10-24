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
export const BUILDING = { width: 1080, height: 1180 } as const;
// 2D stage (Phase 1A compact grid: EOD moved under the outcome column; Phase 8 adds the extended-flows band below it).
export const STAGE = { width: 1320, height: 1264 } as const;

// Right-side clusters (Flows 3 and 4): `right` px of extra free space so the zoom toolbar never covers them and the camera
// never parks against the edge. Triggered by an edge within `band` of the stage's right side, or a centre past `centre`.
export const EDGE_PAD = { right: 120, band: 240, centre: 0.55 } as const;
export const needsRightPad = (r: { x0: number; x1: number }): boolean => r.x1 >= STAGE.width - EDGE_PAD.band || (r.x0 + r.x1) / 2 >= STAGE.width * EDGE_PAD.centre;

export const CARD = { w: 160, h: 92 } as const;

/** Phase 8: the y of the extended band's first row on the 2D stage. */
export const BAND_ROW_2D = 1012;

export interface PlaceBox {
  /** Centre. */
  cx: number;
  cy: number;
  w: number;
  h: number;
}

const card = (cx: number, cy: number): PlaceBox => ({ cx, cy, ...CARD });

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8: the extended-flows band (shared by the 2D map and the 3D office)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Two rows of four, under the rest of the bank:
 *
 *   SWIFT      eKYC      VietQR     FDS          ← row 1 (y = r1)
 *   Disputes   Teller    FacePay    AML desk     ← row 2 (y = r1 + 140)
 *
 * Every ledger-bound wire joins one trunk at x 884 that climbs to the right side of the Debit CASA card; every decline joins a
 * lane above row 1 or below row 2 and leaves by `decline` (a gutter on the 2D map, the existing right-hand lane in 3D).
 * Lanes above row 1, top to bottom: declines, eKYC → CASA, SWIFT → FDS. Between the rows: eKYC → AML, SWIFT → FacePay.
 * Below row 2: teller → AML, the ledger lane, declines.
 */
export const BAND = { cols: [100, 300, 500, 700] as const, rowGap: 140, trunk: 884 } as const;

const bandCard = (cx: number, cy: number): PlaceBox => ({ cx, cy, w: 160, h: 92 });

export function bandBoxes(r1: number): Pick<Record<PlaceId, PlaceBox>, 'GATE_SWIFT' | 'DISPUTE_DESK' | 'GATE_EKYC' | 'TELLER_CASH' | 'GATE_QR' | 'SEC_FACEPAY' | 'SEC_FDS' | 'AML_DESK'> {
  const [c1, c2, c3, c4] = BAND.cols;
  const r2 = r1 + BAND.rowGap;
  return {
    GATE_SWIFT: bandCard(c1, r1),
    DISPUTE_DESK: bandCard(c1, r2),
    GATE_EKYC: bandCard(c2, r1),
    TELLER_CASH: bandCard(c2, r2),
    GATE_QR: bandCard(c3, r1),
    SEC_FACEPAY: bandCard(c3, r2),
    SEC_FDS: bandCard(c4, r1),
    AML_DESK: bandCard(c4, r2),
  };
}

export function bandDepts(r1: number): Pick<Record<DepartmentId, DeptBox>, 'BACKOFFICE' | 'ENTRANCE' | 'COMPLIANCE'> {
  const y = r1 - 82;
  const h = BAND.rowGap + 138;
  return {
    BACKOFFICE: { x: 10, y, w: 180, h },
    ENTRANCE: { x: 208, y, w: 384, h },
    COMPLIANCE: { x: 608, y, w: 184, h },
  };
}

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
  // Night cycle: 2x2 snake under the outcomes (Approved ↓ Batch → Visa ↓ Recon → Suspense, both ↓ Settled).
  EOD_BATCH: card(1000, 548),
  EOD_VISA: card(1210, 548),
  SUSPENSE: card(1000, 680),
  RECON: card(1210, 680),
  GATE_ATM: card(580, 700),
  ATM_CASH: card(780, 700),
  CUSTOMER_OTP: { cx: 500, cy: 312, w: 150, h: 62 },
  OUT_DECLINED: { cx: 1000, cy: 150, w: 110, h: 100 },
  OUT_APPROVED: { cx: 1000, cy: 354, w: 110, h: 100 },
  OUT_SETTLED: { cx: 1105, cy: 802, w: 110, h: 92 },
  ...bandBoxes(BAND_ROW_2D),
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
  EOD: { x: 910, y: 466, w: 390, h: 416 },
  ATM: { x: 480, y: 626, w: 400, h: 142 },
  ...bandDepts(BAND_ROW_2D),
};

// ─────────────────────────────────────────────────────────────────────────────
// Wires
// ─────────────────────────────────────────────────────────────────────────────

type Side = 'l' | 'r' | 't' | 'b';
type Port = readonly [Side, number?];
type Pt = readonly [number, number];

export interface RouteSpec {
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

export const R = (from: Port, to: Port, extra: Partial<RouteSpec> = {}): RouteSpec => ({ from, to, ...extra });

/** How a decline leaves the band from a lane at `y`: the corners after the lane, and the port it enters Declined by. */
export type DeclineTail = (y: number) => { via: readonly Pt[]; to: Port };

export function bandRoutes(r1: number, decline: DeclineTail): Record<string, RouteSpec> {
  const r2 = r1 + BAND.rowGap;
  const T = BAND.trunk;
  const LD = r1 - 116;
  const LE = r1 - 104;
  const LS = r1 - 92;
  const M1 = r1 + 66;
  const M2 = r1 + 78;
  const B1 = r2 + 64;
  const B2 = r2 + 76;
  const B3 = r2 + 88;
  const out = (fromX: number, lane: number, from: Port): RouteSpec => {
    const tail = decline(lane);
    return R(from, tail.to, { via: [[fromX, lane], ...tail.via], quiet: true });
  };
  return {
    'GATE_EKYC>LEDGER_DEBIT': R(['t', 40], ['r', 40], { via: [[340, LE], [T, LE], [T, 280]], labelAt: [420, LE] }),
    'GATE_EKYC>AML_DESK': R(['b', 40], ['l', -15], { via: [[340, M1], [604, M1], [604, r2 - 15]], labelAt: [470, M1] }),
    'GATE_EKYC>OUT_DECLINED': out(270, LD, ['t', -30]),
    'GATE_QR>SEC_FACEPAY': R(['b'], ['t'], { labelAt: [540, r1 + 60] }),
    'GATE_QR>SEC_FDS': R(['r'], ['l'], { quiet: true }),
    'GATE_QR>OUT_DECLINED': out(500, LD, ['t']),
    'GATE_SWIFT>SEC_FACEPAY': R(['r', 20], ['l', -10], { via: [[196, r1 + 20], [196, M2], [410, M2], [410, r2 - 10]], labelAt: [300, M2] }),
    'GATE_SWIFT>SEC_FDS': R(['t', 30], ['t', -10], { via: [[130, LS], [690, LS]], quiet: true }),
    'GATE_SWIFT>OUT_DECLINED': out(70, LD, ['t', -30]),
    'SEC_FACEPAY>SEC_FDS': R(['r', 10], ['l', 20], { via: [[596, r2 + 10], [596, r1 + 20]], quiet: true }),
    'SEC_FACEPAY>OUT_DECLINED': out(500, B3, ['b']),
    'SEC_FDS>AML_DESK': R(['b'], ['t'], { labelAt: [740, r1 + 70] }),
    'SEC_FDS>LEDGER_DEBIT': R(['r'], ['r', 20], { via: [[T, r1], [T, 260]], labelAt: [832, r1] }),
    'SEC_FDS>OUT_DECLINED': out(730, LD, ['t', 30]),
    'TELLER_CASH>AML_DESK': R(['b', 30], ['b', -60], { via: [[330, B1], [640, B1]], labelAt: [480, B1] }),
    'TELLER_CASH>LEDGER_DEBIT': R(['b', -10], ['r', 40], { via: [[290, B2], [T, B2], [T, 280]], quiet: true }),
    'TELLER_CASH>OUT_DECLINED': out(260, B3, ['b', -40]),
    'AML_DESK>LEDGER_DEBIT': R(['r'], ['r', 30], { via: [[T, r2], [T, 270]], labelAt: [832, r2] }),
    'AML_DESK>OUT_DECLINED': out(740, B3, ['b', 40]),
    'DISPUTE_DESK>LEDGER_DEBIT': R(['b', 20], ['r', 40], { via: [[120, B2], [T, B2], [T, 280]], labelAt: [190, B2] }),
    'DISPUTE_DESK>OUT_DECLINED': out(80, B3, ['b', -20]),
  };
}

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
  'OUT_APPROVED>EOD_BATCH': R(['b'], ['t'], { labelAt: [1000, 428] }),
  'EOD_BATCH>EOD_VISA': R(['r'], ['l']),
  'EOD_VISA>RECON': R(['b'], ['t']),
  'RECON>OUT_SETTLED': R(['b'], ['r']),
  'RECON>SUSPENSE': R(['l'], ['r']),
  'SUSPENSE>OUT_SETTLED': R(['b'], ['l']),
  // Sidewalk ATM. Declines join the 3DS lane (y 446); cash paid out takes its own lane (y 455) into Approved.
  'GATE_ATM>ATM_CASH': R(['r'], ['l'], { quiet: true }),
  'GATE_ATM>OUT_DECLINED': R(['t', -30], ['r'], { via: [[550, 446], [1066, 446], [1066, 150]], labelAt: [640, 446] }),
  'ATM_CASH>OUT_DECLINED': R(['t', -30], ['r'], { via: [[750, 446], [1066, 446], [1066, 150]], quiet: true }),
  'ATM_CASH>OUT_APPROVED': R(['t', 40], ['b', -35], { via: [[820, 455], [965, 455]], labelAt: [820, 560] }),
  'ATM_CASH>SUSPENSE': R(['r'], ['l'], { bendX: 890 }),
  // Phase 8 band: declines climb the right-hand gutter and enter Declined from above.
  ...bandRoutes(BAND_ROW_2D, (y) => ({ via: [[1305, y], [1305, 32], [1040, 32]], to: ['t', 40] })),
};

function anchor(b: PlaceBox, [side, d = 0]: Port): Pt {
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

function pointsOf(boxes: Record<PlaceId, PlaceBox>, from: PlaceId, to: PlaceId, spec: RouteSpec): Pt[] {
  const a = anchor(boxes[from], spec.from);
  const b = anchor(boxes[to], spec.to);
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

/** Routes every topology wire over a given floor plan (shared by the 2D map and the frozen 3D plan). */
export function buildWires(boxes: Record<PlaceId, PlaceBox>, routes: Record<string, RouteSpec>): Wire[] {
  return WIRES.map(([from, to, label]) => {
    const id = edgeId(from, to);
    const spec = routes[id];
    if (!spec) throw new Error(`No route drawn for the wire ${id}`);
    const points = pointsOf(boxes, from, to, spec);
    return { id, from, to, label: label ?? null, path: roundedPath(points), points, labelAt: spec.labelAt ?? midOfLongestRun(points), showLabel: !spec.quiet };
  });
}

export const BANK_WIRES: Wire[] = buildWires(PLACE_BOX, ROUTES);

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
