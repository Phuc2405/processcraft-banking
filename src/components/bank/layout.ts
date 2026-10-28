/**
 * Where everything sits on the bank map, and the wires between the desks.
 *
 * The map is drawn on a fixed stage (STAGE.width by STAGE.height) that the screen scales to fit, so every
 * number here is in stage units. Wires are routed by hand as right-angle runs with rounded corners:
 * a handful of channels are reserved between the columns so that no two wires share a vertical run.
 */

import { VI_DICTIONARY } from '../../i18n/viDictionary';
import { edgeId, WIRES, type DepartmentId, type PlaceId } from '../../sim/topology';

/**
 * The branch itself is the BUILDING (the old stage). The pavement outside, with the sidewalk ATM and the right-hand gutter that
 * its wires run up, is the extra STAGE area around it.
 */
export const BUILDING = { width: 1080, height: 1180 } as const;
// 2D stage (Phase 1A compact grid: EOD moved under the outcome column; Phase 8 adds the extended-flows band below it,
// raised flush under the processing grid once the ATM moved to the top-right).
export const STAGE = { width: 1352, height: 1000 } as const;

// Right-side clusters (Flows 3 and 4): `right` px of extra free space so the zoom toolbar never covers them and the camera
// never parks against the edge. Triggered by an edge within `band` of the stage's right side, or a centre past `centre`.
export const EDGE_PAD = { right: 120, band: 240, centre: 0.55 } as const;
export const needsRightPad = (r: { x0: number; x1: number }): boolean => r.x1 >= STAGE.width - EDGE_PAD.band || (r.x0 + r.x1) / 2 >= STAGE.width * EDGE_PAD.centre;

export const CARD = { w: 160, h: 92 } as const;

/** Phase 8: the y of the extended band's first row on the 2D stage. */
export const BAND_ROW_2D = 732;

/** 2D: the lowest decline lane (below band row 2). Higher band declines drop to it beside the trunk before the gutter. */
const BAND_FLOOR_2D = BAND_ROW_2D + 140 + 88;

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
  // Sidewalk ATM: top-right, beside the outcomes (Card & PIN next to Declined, cash notes next to Approved).
  GATE_ATM: card(1190, 150),
  ATM_CASH: card(1190, 354),
  CUSTOMER_OTP: { cx: 500, cy: 312, w: 150, h: 62 },
  OUT_DECLINED: { cx: 1000, cy: 150, w: 110, h: 100 },
  OUT_APPROVED: { cx: 1000, cy: 354, w: 110, h: 100 },
  OUT_SETTLED: { cx: 1105, cy: 830, w: 110, h: 92 },
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
  EOD: { x: 910, y: 466, w: 390, h: 444 },
  ATM: { x: 1094, y: 66, w: 192, h: 366 },
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

/**
 * How a decline leaves the band from a lane at `y`: the corners after the lane, and the port it enters Declined by. `slot`
 * (0-7) is the wire's own lane on every shared run, so a tail can keep the eight declines apart.
 */
export type DeclineTail = (y: number, slot: number) => { via: readonly Pt[]; to: Port };

/**
 * The band's declines in lane order, top lane first. Row 1 leaves upwards and row 2 downwards; within each row the desk
 * further right takes the lane nearer its cards. With every later run nested the same way, no decline crosses another.
 */
export const DECLINE_SLOT = { GATE_SWIFT: 0, GATE_EKYC: 1, GATE_QR: 2, SEC_FDS: 3, AML_DESK: 4, SEC_FACEPAY: 5, TELLER_CASH: 6, DISPUTE_DESK: 7 } as const;

/** `laneStep`: the gap between the row-1 declines' own lanes above the band (0 keeps them on one lane, as the 3D plan does). */
export function bandRoutes(r1: number, decline: DeclineTail, laneStep = 0): Record<string, RouteSpec> {
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
  /**
   * The ledger trunk's own lane and port per wire, when `laneStep` spreads them (the 2D map). A wire that joins the trunk
   * higher takes the lane nearer the Debit card and enters it lower, so the five green wires climb side by side and never cross.
   */
  const lane = (k: number): number => T - (4 - k) * laneStep;
  const port = (k: number): number => (laneStep ? 18 + (4 - k) * 6 : [40, 20, 30, 40, 40][k]!);
  /** Teller's approval runs just above the dispute desk's on the ledger lane below row 2. */
  const B2T = B2 - (laneStep ? 6 : 0);
  const out = (fromX: number, lane: number, from: Port, slot: number): RouteSpec => {
    const tail = decline(lane, slot);
    return R(from, tail.to, { via: [[fromX, lane], ...tail.via], quiet: true });
  };
  /** Row 1's departure lane for a slot: the SWIFT decline highest, the FDS one nearest the cards. */
  const up = (slot: number): number => LD - (DECLINE_SLOT.SEC_FDS - slot) * laneStep;
  /** Row 2's departure lane, which is also its floor lane: AML nearest the cards, disputes lowest. */
  const down = (slot: number): number => B3 + slot * laneStep;
  return {
    'GATE_EKYC>LEDGER_DEBIT': R(['t', 40], ['r', port(0)], { via: [[340, LE], [lane(0), LE], [lane(0), 240 + port(0)]], labelAt: [420, LE] }),
    'GATE_EKYC>AML_DESK': R(['b', 40], ['l', -15], { via: [[340, M1], [604, M1], [604, r2 - 15]], labelAt: [470, M1] }),
    'GATE_EKYC>OUT_DECLINED': out(270, up(DECLINE_SLOT.GATE_EKYC), ['t', -30], DECLINE_SLOT.GATE_EKYC),
    'GATE_QR>SEC_FACEPAY': R(['b'], ['t'], { labelAt: [540, r1 + 60] }),
    'GATE_QR>SEC_FDS': R(['r'], ['l'], { quiet: true }),
    'GATE_QR>OUT_DECLINED': out(500, up(DECLINE_SLOT.GATE_QR), ['t'], DECLINE_SLOT.GATE_QR),
    'GATE_SWIFT>SEC_FACEPAY': R(['r', 20], ['l', -10], { via: [[196, r1 + 20], [196, M2], [410, M2], [410, r2 - 10]], labelAt: [300, M2] }),
    'GATE_SWIFT>SEC_FDS': R(['t', 30], ['t', -10], { via: [[130, LS], [690, LS]], quiet: true }),
    'GATE_SWIFT>OUT_DECLINED': out(70, up(DECLINE_SLOT.GATE_SWIFT), ['t', -30], DECLINE_SLOT.GATE_SWIFT),
    'SEC_FACEPAY>SEC_FDS': R(['r', 10], ['l', 20], { via: [[596, r2 + 10], [596, r1 + 20]], quiet: true }),
    'SEC_FACEPAY>OUT_DECLINED': out(500, down(DECLINE_SLOT.SEC_FACEPAY), ['b'], DECLINE_SLOT.SEC_FACEPAY),
    'SEC_FDS>AML_DESK': R(['b'], ['t'], { labelAt: [740, r1 + 70] }),
    'SEC_FDS>LEDGER_DEBIT': R(['r'], ['r', port(1)], { via: [[lane(1), r1], [lane(1), 240 + port(1)]], labelAt: [832, r1] }),
    'SEC_FDS>OUT_DECLINED': out(730, up(DECLINE_SLOT.SEC_FDS), ['t', 30], DECLINE_SLOT.SEC_FDS),
    'TELLER_CASH>AML_DESK': R(['b', 30], ['b', -60], { via: [[330, B1], [640, B1]], labelAt: [480, B1] }),
    'TELLER_CASH>LEDGER_DEBIT': R(['b', -10], ['r', port(3)], { via: [[290, B2T], [lane(3), B2T], [lane(3), 240 + port(3)]], quiet: true }),
    'TELLER_CASH>OUT_DECLINED': out(260, down(DECLINE_SLOT.TELLER_CASH), ['b', -40], DECLINE_SLOT.TELLER_CASH),
    'AML_DESK>LEDGER_DEBIT': R(['r'], ['r', port(2)], { via: [[lane(2), r2], [lane(2), 240 + port(2)]], labelAt: [832, r2] }),
    'AML_DESK>OUT_DECLINED': out(740, down(DECLINE_SLOT.AML_DESK), ['b', 40], DECLINE_SLOT.AML_DESK),
    'DISPUTE_DESK>LEDGER_DEBIT': R(['b', 20], ['r', port(4)], { via: [[120, B2], [lane(4), B2], [lane(4), 240 + port(4)]], labelAt: [190, B2] }),
    'DISPUTE_DESK>OUT_DECLINED': out(80, down(DECLINE_SLOT.DISPUTE_DESK), ['b', -20], DECLINE_SLOT.DISPUTE_DESK),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BPMN collector gateways (2D map only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exclusive (XOR) join gateways: where several wires converge on one place, they end at a compact diamond and a single trunk
 * goes on. Local collectors sit right beside the desks they serve and cascade into the next one, so no run of parallel lanes is
 * left along the floor or the right-hand gutter:
 *
 *   GATEWAY_XOR_REJECT_ROW1     row 1's four declines (SWIFT, eKYC, VietQR, FDS) on their lanes above the band.
 *   GATEWAY_XOR_REJECT_ROW2_A   row 2 on the floor bus: the disputes decline joins the teller's under the teller desk,
 *   GATEWAY_XOR_REJECT_ROW2_B   then FacePay's under FacePay,
 *   GATEWAY_XOR_REJECT_ROW2_C   then the AML desk's under the AML desk.
 *   GATEWAY_XOR_REJECT_BAND     row 1's trunk and the floor bus, beside the ledger trunk; one trunk runs on to the gutter.
 *   GATEWAY_XOR_REJECT          the band's trunk and the online (3DS) decline, in the gutter; its trunk enters Declined.
 *   GATEWAY_XOR_APPROVE         the band's five clean approvals; its trunk enters Debit CASA from the right.
 *   GATEWAY_XOR_NIGHT           the two night handovers (matched, cleared); its trunk enters Settled.
 *
 * Gateways are drawn on the map, not modelled in the topology: every wire still runs from its desk to its place, through each
 * diamond on its way, so packets, tours and the simulation are unchanged. Each feeder meets its diamond at its own point.
 */
export type GatewayId =
  | 'GATEWAY_XOR_REJECT_ROW1'
  | 'GATEWAY_XOR_REJECT_ROW2_A'
  | 'GATEWAY_XOR_REJECT_ROW2_B'
  | 'GATEWAY_XOR_REJECT_ROW2_C'
  | 'GATEWAY_XOR_REJECT_BAND'
  | 'GATEWAY_XOR_REJECT'
  | 'GATEWAY_XOR_APPROVE'
  | 'GATEWAY_XOR_NIGHT';

/** Half a gateway's diamond: every gateway is the same compact size. */
export const GATEWAY_HALF = 10;

/** The floor bus under band row 2 that the row-2 declines drop onto. */
const FLOOR_BUS_2D = BAND_ROW_2D + BAND.rowGap + 110;

export const GATEWAY_AT: Readonly<Record<GatewayId, Pt>> = {
  // Centred on row 1's decline lanes (y 604-616), left of the ledger trunk.
  GATEWAY_XOR_REJECT_ROW1: [850, BAND_ROW_2D - 122],
  // Under the teller, FacePay and AML desks' bottom ports.
  GATEWAY_XOR_REJECT_ROW2_A: [BAND.cols[1] - 40, FLOOR_BUS_2D],
  GATEWAY_XOR_REJECT_ROW2_B: [BAND.cols[2], FLOOR_BUS_2D],
  GATEWAY_XOR_REJECT_ROW2_C: [BAND.cols[3] + 40, FLOOR_BUS_2D],
  // Just right of the ledger trunk's lanes, left of the night-cycle frame.
  GATEWAY_XOR_REJECT_BAND: [900, FLOOR_BUS_2D],
  GATEWAY_XOR_REJECT: [1324, 400],
  GATEWAY_XOR_APPROVE: [876, 500],
  GATEWAY_XOR_NIGHT: [1105, 752],
};

export interface Gateway {
  id: GatewayId;
  kind: 'reject' | 'approve' | 'night';
  cx: number;
  cy: number;
  /** Half the diamond's width (and height). */
  half: number;
  to: PlaceId;
  /** The wires it collects. */
  wires: readonly string[];
  /** The gateway its trunk feeds instead of a place (a local collector cascading into a bigger one). */
  into?: GatewayId;
  /** Its feeders run as one merged stroke on their last leg, into the diamond's corner, instead of a lane each. */
  merge?: boolean;
  /** The one trunk from the diamond's exit corner to the place (or to the next gateway's edge). */
  trunk: Pt[];
  path: string;
}

type GatewaySpec = Omit<Gateway, 'cx' | 'cy' | 'path' | 'trunk' | 'half'> & { trunk: readonly Pt[] };

const gw = (id: GatewayId): Pt => GATEWAY_AT[id];
const H = GATEWAY_HALF;
/** A collector on the floor bus feeding the next one along it: right corner to the next one's left corner. */
const busTrunk = (from: GatewayId, to: GatewayId): Pt[] => [
  [gw(from)[0] + H, FLOOR_BUS_2D],
  [gw(to)[0] - H, FLOOR_BUS_2D],
];

const GATEWAY_SPECS: readonly GatewaySpec[] = [
  {
    id: 'GATEWAY_XOR_REJECT_ROW1',
    kind: 'reject',
    to: 'OUT_DECLINED',
    wires: ['GATE_SWIFT>OUT_DECLINED', 'GATE_EKYC>OUT_DECLINED', 'GATE_QR>OUT_DECLINED', 'SEC_FDS>OUT_DECLINED'],
    into: 'GATEWAY_XOR_REJECT_BAND',
    merge: true,
    // Right to the decline drop beside the ledger trunk, then down into the band collector's top corner.
    trunk: [
      [gw('GATEWAY_XOR_REJECT_ROW1')[0] + H, gw('GATEWAY_XOR_REJECT_ROW1')[1]],
      [gw('GATEWAY_XOR_REJECT_BAND')[0], gw('GATEWAY_XOR_REJECT_ROW1')[1]],
      [gw('GATEWAY_XOR_REJECT_BAND')[0], FLOOR_BUS_2D - H],
    ],
  },
  { id: 'GATEWAY_XOR_REJECT_ROW2_A', kind: 'reject', to: 'OUT_DECLINED', wires: ['DISPUTE_DESK>OUT_DECLINED', 'TELLER_CASH>OUT_DECLINED'], into: 'GATEWAY_XOR_REJECT_ROW2_B', trunk: busTrunk('GATEWAY_XOR_REJECT_ROW2_A', 'GATEWAY_XOR_REJECT_ROW2_B') },
  { id: 'GATEWAY_XOR_REJECT_ROW2_B', kind: 'reject', to: 'OUT_DECLINED', wires: ['SEC_FACEPAY>OUT_DECLINED'], into: 'GATEWAY_XOR_REJECT_ROW2_C', trunk: busTrunk('GATEWAY_XOR_REJECT_ROW2_B', 'GATEWAY_XOR_REJECT_ROW2_C') },
  { id: 'GATEWAY_XOR_REJECT_ROW2_C', kind: 'reject', to: 'OUT_DECLINED', wires: ['AML_DESK>OUT_DECLINED'], into: 'GATEWAY_XOR_REJECT_BAND', trunk: busTrunk('GATEWAY_XOR_REJECT_ROW2_C', 'GATEWAY_XOR_REJECT_BAND') },
  {
    id: 'GATEWAY_XOR_REJECT_BAND',
    kind: 'reject',
    to: 'OUT_DECLINED',
    wires: [],
    into: 'GATEWAY_XOR_REJECT',
    // Right along the floor bus to the gutter, then up into the reject gateway's bottom corner.
    trunk: [
      [gw('GATEWAY_XOR_REJECT_BAND')[0] + H, FLOOR_BUS_2D],
      [gw('GATEWAY_XOR_REJECT')[0], FLOOR_BUS_2D],
      [gw('GATEWAY_XOR_REJECT')[0], gw('GATEWAY_XOR_REJECT')[1] + H],
    ],
  },
  {
    id: 'GATEWAY_XOR_REJECT',
    kind: 'reject',
    to: 'OUT_DECLINED',
    wires: ['SEC_3DS>OUT_DECLINED'],
    // Up the gutter from the top corner, along the top lane and down into Declined beside the virtual-card declines.
    trunk: [
      [gw('GATEWAY_XOR_REJECT')[0], gw('GATEWAY_XOR_REJECT')[1] - H],
      [gw('GATEWAY_XOR_REJECT')[0], 44],
      [PLACE_BOX.OUT_DECLINED.cx + 30, 44],
      [PLACE_BOX.OUT_DECLINED.cx + 30, PLACE_BOX.OUT_DECLINED.cy - PLACE_BOX.OUT_DECLINED.h / 2],
    ],
  },
  {
    id: 'GATEWAY_XOR_APPROVE',
    kind: 'approve',
    to: 'LEDGER_DEBIT',
    wires: ['GATE_EKYC>LEDGER_DEBIT', 'SEC_FDS>LEDGER_DEBIT', 'AML_DESK>LEDGER_DEBIT', 'TELLER_CASH>LEDGER_DEBIT', 'DISPUTE_DESK>LEDGER_DEBIT'],
    merge: true,
    trunk: [
      [gw('GATEWAY_XOR_APPROVE')[0], gw('GATEWAY_XOR_APPROVE')[1] - H],
      [gw('GATEWAY_XOR_APPROVE')[0], PLACE_BOX.LEDGER_DEBIT.cy + 24],
      [PLACE_BOX.LEDGER_DEBIT.cx + PLACE_BOX.LEDGER_DEBIT.w / 2, PLACE_BOX.LEDGER_DEBIT.cy + 24],
    ],
  },
  {
    id: 'GATEWAY_XOR_NIGHT',
    kind: 'night',
    to: 'OUT_SETTLED',
    wires: ['RECON>OUT_SETTLED', 'SUSPENSE>OUT_SETTLED'],
    trunk: [
      [gw('GATEWAY_XOR_NIGHT')[0], gw('GATEWAY_XOR_NIGHT')[1] + H],
      [PLACE_BOX.OUT_SETTLED.cx, PLACE_BOX.OUT_SETTLED.cy - PLACE_BOX.OUT_SETTLED.h / 2],
    ],
  },
];

export const GATEWAYS: readonly Gateway[] = GATEWAY_SPECS.map((g) => {
  const [cx, cy] = GATEWAY_AT[g.id];
  const trunk = [...g.trunk];
  return { ...g, cx, cy, half: H, trunk, path: roundedPath(trunk) };
});

const GATEWAY_BY_ID = new Map(GATEWAYS.map((g) => [g.id, g]));

/** Every wire a gateway's trunk carries: its own feeders and those of the collectors that cascade into it. */
export const gatewayCarries = (g: Gateway): readonly string[] => [...g.wires, ...GATEWAYS.filter((o) => o.into === g.id).flatMap(gatewayCarries)];

/** Drops a point that repeats the one before it (a lane that is already on the gateway's centre line). */
const dedupe = (points: readonly Pt[]): Pt[] => points.filter((p, i) => i === 0 || p[0] !== points[i - 1]![0] || p[1] !== points[i - 1]![1]);

/**
 * Re-routes a gateway's wires: each runs as before until its first leg that crosses the diamond's centre line, stops on the
 * diamond's edge there (the feeder that is drawn), passes through the centre under the diamond, and leaves by the trunk.
 */
function throughGateway(w: Wire, g: Gateway, cascade = false): Wire {
  const pts = [...w.points];
  for (let i = 1; i < pts.length; i++) {
    // A merging gateway pulls the approach leg onto its centre line (with the corner before it), so its feeders share one
    // stroke into the diamond's corner. A leg that starts at the desk itself keeps its own line.
    if (g.merge && !cascade && i > 1) {
      const [px, py] = pts[i - 1]!;
      const [qx, qy] = pts[i]!;
      const v = px === qx && Math.abs(px - g.cx) <= g.half && Math.min(py, qy) <= g.cy && Math.max(py, qy) >= g.cy;
      const h = py === qy && Math.abs(py - g.cy) <= g.half && Math.min(px, qx) <= g.cx && Math.max(px, qx) >= g.cx;
      if (v) pts.splice(i - 1, 2, [g.cx, py], [g.cx, qy]);
      else if (h) pts.splice(i - 1, 2, [px, g.cy], [qx, g.cy]);
    }
    const [ax, ay] = pts[i - 1]!;
    const [bx, by] = pts[i]!;
    const vertical = ax === bx && Math.abs(ax - g.cx) <= g.half && Math.min(ay, by) <= g.cy && Math.max(ay, by) >= g.cy;
    const horizontal = ay === by && Math.abs(ay - g.cy) <= g.half && Math.min(ax, bx) <= g.cx && Math.max(ax, bx) >= g.cx;
    if (!vertical && !horizontal) continue;
    // Where the leg meets the diamond's edge, on the side it comes from.
    const edge: Pt = vertical ? [ax, g.cy + Math.sign(ay - g.cy) * (g.half - Math.abs(ax - g.cx))] : [g.cx + Math.sign(ax - g.cx) * (g.half - Math.abs(ay - g.cy)), ay];
    const feeder = dedupe([...pts.slice(0, i), edge]);
    const inside: Pt[] = vertical ? [[ax, g.cy], [g.cx, g.cy]] : [[g.cx, ay], [g.cx, g.cy]];
    const points = dedupe([...feeder, ...inside, ...g.trunk]);
    // Past a second gateway the wire's own stroke is still the feeder into the first one.
    if (cascade) return { ...w, points, path: roundedPath(points) };
    // The base stroke runs from the diamond back to the desk, so merged dashed feeders keep the same dash phase and read as one.
    return { ...w, points, path: roundedPath(points), gateway: g.id, drawPoints: feeder, drawPath: roundedPath(feeder), strokePath: roundedPath([...feeder].reverse()) };
  }
  throw new Error(`The wire ${w.id} never reaches ${g.id}`);
}

function withGateways(wires: Wire[], gateways: readonly Gateway[]): Wire[] {
  const byWire = new Map(gateways.flatMap((g) => g.wires.map((id) => [id, g] as const)));
  return wires.map((w) => {
    const first = byWire.get(w.id);
    if (!first) return w;
    let out = throughGateway(w, first);
    // A cascading collector's trunk ends on the next gateway's edge: carry on through its centre and down its trunk.
    let next = first.into ? GATEWAY_BY_ID.get(first.into) : undefined;
    while (next) {
      out = throughGateway({ ...out, points: [...out.points, [next.cx, next.cy]] }, next, true);
      next = next.into ? GATEWAY_BY_ID.get(next.into) : undefined;
    }
    return out;
  });
}

/** The online (3DS) decline's lane up the gutter: inside the reject gateway's reach, beside the band's trunk. */
const ONLINE_DECLINE_X = GATEWAY_AT.GATEWAY_XOR_REJECT[0] - 8;

/** Declined's centre on the 2D map: the entry points are offsets from it. */
const PLACE_BOX_DECLINED_CX = PLACE_BOX.OUT_DECLINED.cx;

/**
 * The lanes the 2D map's declines run on, one per wire, `step` apart (2 px strokes, so a clear gap between neighbours).
 * Slots 0-7 are the band (DECLINE_SLOT); slot -1 is the online (3DS) decline. Nesting rules that keep them from crossing:
 * the trunk and the floor go outward with the slot, the gutter outward with the slot, and the top lane and the entry point
 * inward, so each wire turns inside the ones it meets.
 */
export const DECLINE_LANES = {
  step: 4,
  /** Row 1 drops beside the ledger trunk: FDS (slot 3) nearest it. */
  trunkX: (slot: number): number => 896 + (DECLINE_SLOT.SEC_FDS - slot) * 4,
  floorY: (slot: number): number => BAND_FLOOR_2D + slot * 4,
  gutterX: (slot: number): number => 1312 + slot * 4,
  topY: (slot: number): number => 60 - slot * 4,
  entryX: (slot: number): number => 1020 + (7 - slot) * 4,
} as const;

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
  // Its label sits under the vault cards, clear of the Balance & credit frame's title.
  'GATE_A2A>OUT_DECLINED': R(['r', 10], ['l', 22], { via: [[204, 392], [204, 172]], labelAt: [330, 172] }),
  // Online
  'GATE_ECOM>SEC_3DS': R(['r', -14], ['l'], { bendX: 200 }),
  'GATE_ECOM>BNPL': R(['r', 14], ['l'], { bendX: 204 }),
  // The code goes out on the upper channel and comes back on the lower one; the return bends nearer the phone, so the two
  // run side by side and never cross.
  'SEC_3DS>CUSTOMER_OTP': R(['r', -30], ['l', -22], { bendX: 396, quiet: true }),
  'CUSTOMER_OTP>SEC_3DS': R(['l', 18], ['r', -14], { bendX: 410, quiet: true }),
  'SEC_3DS>LEDGER_DEBIT': R(['r', 4], ['l', 14], { bendX: 652 }),
  'SEC_3DS>LEDGER_CREDIT': R(['r', 20], ['l', 8], { bendX: 664 }),
  // The online decline climbs the gutter just left of the band's trunk, into the reject gateway's left edge.
  'SEC_3DS>OUT_DECLINED': R(['b', 50], ['t', DECLINE_LANES.entryX(-1) - PLACE_BOX_DECLINED_CX], {
    via: [[350, 446], [ONLINE_DECLINE_X, 446], [ONLINE_DECLINE_X, DECLINE_LANES.topY(-1)], [DECLINE_LANES.entryX(-1), DECLINE_LANES.topY(-1)]],
    labelAt: [460, 446],
  }),
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
  'RECON>OUT_SETTLED': R(['b', -40], ['t'], { via: [[GATEWAY_AT.GATEWAY_XOR_NIGHT[0] + 65, GATEWAY_AT.GATEWAY_XOR_NIGHT[1]], GATEWAY_AT.GATEWAY_XOR_NIGHT], labelAt: [1170, 740] }),
  'RECON>SUSPENSE': R(['l'], ['r']),
  'SUSPENSE>OUT_SETTLED': R(['b', 40], ['t'], { via: [[GATEWAY_AT.GATEWAY_XOR_NIGHT[0] - 65, GATEWAY_AT.GATEWAY_XOR_NIGHT[1]], GATEWAY_AT.GATEWAY_XOR_NIGHT], labelAt: [1040, 740] }),
  // Sidewalk ATM (top-right). Card & PIN declines go straight left into Declined; cash paid out straight left into Approved;
  // a cash jam drops between the night-cycle columns into the top of Suspense.
  'GATE_ATM>ATM_CASH': R(['b'], ['t'], { quiet: true }),
  'GATE_ATM>OUT_DECLINED': R(['l', -20], ['r', -20], { quiet: true }),
  'ATM_CASH>OUT_DECLINED': R(['l', -30], ['r', 20], { via: [[1080, 324], [1080, 170]], quiet: true }),
  'ATM_CASH>OUT_APPROVED': R(['l', 10], ['r', 10], { quiet: true }),
  'ATM_CASH>SUSPENSE': R(['b', -70], ['t', 40], { via: [[1120, 614], [1040, 614]], quiet: true }),
  // Phase 8 band: declines drop beside the trunk to the floor lane and climb the right-hand gutter, each on its own lane of
  // every run (DECLINE_LANES), until the reject gateway collects them (GATEWAYS) and one trunk carries them into Declined.
  ...bandRoutes(
    BAND_ROW_2D,
    (y, slot) => {
      const g = DECLINE_LANES.gutterX(slot);
      const top = DECLINE_LANES.topY(slot);
      const floor = y < BAND_FLOOR_2D ? DECLINE_LANES.floorY(slot) : y;
      const tail: Pt[] = [[g, floor], [g, top], [DECLINE_LANES.entryX(slot), top]];
      return {
        via: y < BAND_FLOOR_2D ? [[DECLINE_LANES.trunkX(slot), y], [DECLINE_LANES.trunkX(slot), DECLINE_LANES.floorY(slot)], ...tail] : tail,
        to: ['t', DECLINE_LANES.entryX(slot) - PLACE_BOX_DECLINED_CX],
      };
    },
    DECLINE_LANES.step,
  ),
  // Row 2 drops straight onto the floor bus, where its collectors pick each decline up in turn (GATEWAYS).
  ...Object.fromEntries(
    ([['DISPUTE_DESK', -20], ['TELLER_CASH', -40], ['SEC_FACEPAY', 0], ['AML_DESK', 40]] as const).map(([desk, port]) => {
      const x = PLACE_BOX[desk].cx + port;
      return [`${desk}>OUT_DECLINED`, R(['b', port], ['t', 30], { via: [[x, FLOOR_BUS_2D], [1324, FLOOR_BUS_2D], [1324, 44], [PLACE_BOX.OUT_DECLINED.cx + 30, 44]], quiet: true })];
    }),
  ),
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
  /** The whole run, through any gateway: the path a packet flies along. */
  path: string;
  points: Pt[];
  labelAt: Pt;
  /** The point on the wire its label belongs to: the label itself, or where a callout's leader line meets the run. */
  labelAnchor?: Pt;
  showLabel: boolean;
  /** The gateway that collects this wire, if any: then only its feeder (`drawPath`) is drawn, and the gateway draws the trunk. */
  gateway?: GatewayId;
  /** What the map strokes: the feeder up to the gateway's edge, or the whole run. */
  drawPath: string;
  /** The same run drawn from its far end, for a feeder's dashed base stroke (absent: drawPath). */
  strokePath?: string;
  /** Its label shows only while the wire is pointed at or traced: decline conditions crowd the map otherwise. */
  revealOnly?: boolean;
  drawPoints: Pt[];
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
    const path = roundedPath(points);
    return { id, from, to, label: label ?? null, path, points, labelAt: spec.labelAt ?? midOfLongestRun(points), showLabel: !spec.quiet, drawPath: path, drawPoints: points };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Every wire's label, placed on its own run (2D map)
// ─────────────────────────────────────────────────────────────────────────────

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The label pill BankMap draws for `chars` characters at `at`: 5.4 px a character plus padding, 14 px tall. */
export const labelPill = (chars: number, [x, y]: Pt): Box => ({ x0: x - chars * 2.7 - 4, x1: x + chars * 2.7 + 4, y0: y - 7, y1: y + 7 });

/** A label's length in its longer language, so a spot that fits holds it in both. */
export const labelChars = (label: string): number => Math.max(label.length, (VI_DICTIONARY[label] ?? label).length);

/** The title chip each department frame carries in its top-left corner (up to two lines across the frame). */
export const deptTitleBox = (d: DeptBox): Box => ({ x0: d.x + 8, x1: d.x + d.w - 8, y0: d.y + 4, y1: d.y + 38 });

const hits = (a: Box, b: Box, gap = 0): boolean => a.x0 < b.x1 + gap && a.x1 > b.x0 - gap && a.y0 < b.y1 + gap && a.y1 > b.y0 - gap;

/**
 * Gives every labelled wire a visible label: at its route's own spot when that is clear, otherwise at the clear spot on its
 * drawn run nearest the run's middle (on the line first, then just beside it), and for a hop too short to hold its words, at
 * the nearest clear spot around it as a callout with a leader line. Clear means off every desk, department title, gateway and
 * label already placed, in both languages. Wires with the fewest spots are placed first.
 */
function placeLabels(wires: Wire[], routes: Record<string, RouteSpec>): Wire[] {
  const fixed: Box[] = [
    ...Object.values(PLACE_BOX).map((b) => ({ x0: b.cx - b.w / 2, y0: b.cy - b.h / 2, x1: b.cx + b.w / 2, y1: b.cy + b.h / 2 })),
    ...Object.values(DEPT_BOX).map(deptTitleBox),
    ...GATEWAYS.map((g) => ({ x0: g.cx - g.half, y0: g.cy - g.half, x1: g.cx + g.half, y1: g.cy + g.half })),
  ];
  const placed: Box[] = [];
  const free = (b: Box): boolean => b.x0 >= 2 && b.y0 >= 2 && b.x1 <= STAGE.width - 2 && b.y1 <= STAGE.height - 2 && !fixed.some((f) => hits(b, f, 1)) && !placed.some((p) => hits(b, p, 2));
  type Spot = { at: Pt; anchor: Pt; cost: number };
  /** Points along the drawn run, every `step` px. */
  const along = (w: Wire, step: number): { on: Pt; vertical: boolean }[] => {
    const out: { on: Pt; vertical: boolean }[] = [];
    for (let i = 1; i < w.drawPoints.length; i++) {
      const [ax, ay] = w.drawPoints[i - 1]!;
      const [bx, by] = w.drawPoints[i]!;
      const len = Math.hypot(bx - ax, by - ay);
      for (let d = 0; d <= len; d += step) out.push({ on: [ax + ((bx - ax) * d) / (len || 1), ay + ((by - ay) * d) / (len || 1)], vertical: ax === bx });
    }
    return out;
  };
  const spots = (w: Wire, chars: number): Spot[] => {
    const mid = midOfLongestRun(w.drawPoints);
    const side = chars * 2.7 + 4;
    const out: Spot[] = [];
    for (const { on, vertical } of along(w, 3)) {
      // On the line, then just beside it, then a little further off: a label beside a vertical run sits clear of it.
      const offsets = vertical ? [0, side + 3, -(side + 3), side + 12, -(side + 12)] : [0, 11, -11, 20, -20];
      offsets.forEach((off, k) => {
        const at: Pt = vertical ? [on[0] + off, on[1]] : [on[0], on[1] + off];
        out.push({ at, anchor: on, cost: Math.ceil(k / 2) * 90 + (vertical ? 25 : 0) + Math.hypot(at[0] - mid[0], at[1] - mid[1]) * 0.25 });
      });
    }
    return out.sort((a, b) => a.cost - b.cost);
  };
  /** A wire too short to hold its words: the nearest clear spot around it, joined to the run by a leader line. */
  const callouts = (w: Wire): Spot[] => {
    const out: Spot[] = [];
    for (const { on } of along(w, 6)) for (let dx = -180; dx <= 180; dx += 5) for (let dy = -100; dy <= 100; dy += 5) out.push({ at: [on[0] + dx, on[1] + dy], anchor: on, cost: Math.hypot(dx, dy) });
    return out.sort((a, b) => a.cost - b.cost);
  };
  const labelled = wires.filter((w) => w.label);
  const candidates = new Map(labelled.map((w) => [w.id, spots(w, labelChars(w.label!))]));
  const room = (w: Wire): number => candidates.get(w.id)!.filter((c) => free(labelPill(labelChars(w.label!), c.at))).length;
  // Wires whose own spot is given go first (it is a deliberate choice), then the ones with the least room.
  const rooms = new Map(labelled.map((w) => [w.id, room(w)]));
  const order = [...labelled].sort((a, b) => Number(!routes[a.id]?.labelAt) - Number(!routes[b.id]?.labelAt) || rooms.get(a.id)! - rooms.get(b.id)!);
  const at = new Map<string, Spot>();
  for (const w of order) {
    const chars = labelChars(w.label!);
    const own = routes[w.id]?.labelAt;
    const fits = (c: Spot): boolean => free(labelPill(chars, c.at));
    const spot = (own && free(labelPill(chars, own)) ? { at: own, anchor: own, cost: 0 } : undefined) ?? candidates.get(w.id)!.find(fits) ?? callouts(w).find(fits);
    if (!spot) throw new Error(`No room on the map for the label of ${w.id}`);
    placed.push(labelPill(chars, spot.at));
    at.set(w.id, spot);
  }
  return wires.map((w) => {
    const spot = at.get(w.id);
    return spot ? { ...w, labelAt: spot.at, labelAnchor: spot.anchor, showLabel: true, revealOnly: w.to === 'OUT_DECLINED' } : w;
  });
}

export const BANK_WIRES: Wire[] = placeLabels(withGateways(buildWires(PLACE_BOX, ROUTES), GATEWAYS), ROUTES);

const BY_ID = new Map(BANK_WIRES.map((w) => [w.id, w]));

export const wireById = (id: string): Wire | undefined => BY_ID.get(id);

/** The path a packet takes along a wire, or null if the wire is not on the map. */
export const pathOfWire = (id: string): string | null => BY_ID.get(id)?.path ?? null;

/** The wires touching `place` (its own, in and out), or null when nothing is pointed at: what hovering a node lights up. */
export function connectedWires(place: PlaceId | null, wires: readonly Wire[] = BANK_WIRES): ReadonlySet<string> | null {
  return place ? new Set(wires.filter((w) => w.from === place || w.to === place).map((w) => w.id)) : null;
}

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

/** The sides a description may open on, in order of preference: above the desk first. */
export const TIP_PREFERENCE: readonly TipSide[] = ['above', 'below', 'right', 'left'];

/**
 * The side a desk's description opens on: above the desk wherever it fits on the stage, otherwise the next side in
 * TIP_PREFERENCE that does (the top row opens below, the first column to the right). The description is opaque and drawn over
 * everything, so covering the desks around it is fine.
 */
export function tipSideFor(place: PlaceId): TipSide {
  const fits = (side: TipSide): boolean => {
    const r = tipRect(place, side);
    return r.x0 >= 0 && r.y0 >= 0 && r.x1 <= STAGE.width && r.y1 <= STAGE.height;
  };
  return TIP_PREFERENCE.find(fits) ?? 'below';
}

export const TIP_SIDE: Readonly<Record<PlaceId, TipSide>> = Object.fromEntries((Object.keys(PLACE_BOX) as PlaceId[]).map((p) => [p, tipSideFor(p)])) as Record<PlaceId, TipSide>;
