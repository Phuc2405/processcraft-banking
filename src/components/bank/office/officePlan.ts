// Frozen 3D floor plan (pre-Phase 1A 2D geometry). 2D layout changes must not move 3D rooms.

import type { DepartmentId, PlaceId } from '../../../sim/topology';
import { buildWires, CARD, R, type DeptBox, type PlaceBox, type RouteSpec, type Wire } from '../layout';

const card = (cx: number, cy: number): PlaceBox => ({ cx, cy, ...CARD });

export const OFFICE_PLACE_BOX: Record<PlaceId, PlaceBox> = {
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

export const OFFICE_DEPT_BOX: Record<DepartmentId, DeptBox> = {
  GATES: { x: 10, y: 36, w: 180, h: 550 },
  SECURITY: { x: 208, y: 36, w: 384, h: 396 },
  LEDGER: { x: 688, y: 160, w: 184, h: 280 },
  BNPL: { x: 208, y: 460, w: 184, h: 140 },
  EOD: { x: 10, y: 646, w: 1060, h: 140 },
  ATM: { x: 480, y: 826, w: 400, h: 142 },
};

const OFFICE_ROUTES: Record<string, RouteSpec> = {
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

export const OFFICE_WIRES: Wire[] = buildWires(OFFICE_PLACE_BOX, OFFICE_ROUTES);

const BY_ID = new Map(OFFICE_WIRES.map((w) => [w.id, w]));
export const officeWireById = (id: string): Wire | undefined => BY_ID.get(id);
