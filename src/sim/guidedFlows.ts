/**
 * The four guided flows of the Beginner scope. Each one lights a short path through the Living Bank and dims the rest,
 * so a newcomer follows one payment story at a time:
 *
 *   01  In-Store POS      a card tapped in a shop: POS gate → Debit CASA → the authorisation answer
 *   02  Web & 3DS         an online checkout: token vault and dCVV, or the 3DS risk desk and an SMS code
 *   03  CDM Cash-In       cash paid in at the sidewalk machine, credited to the account straight away
 *   04  Overnight EOD     the night cycle: batch clearing, Visa settlement, 3-way reconciliation
 *
 * Every flow is written twice: as the logical nodes of the brief (pos_terminal, casa_desk, auth_engine, ...) and as the real
 * places on the map that play each part. Pure data and pure functions, so the 2D map, the 3D office and the tests share them.
 */

import type { DataDepth, FlowId, ViewportSettings } from '../types/viewport';
import { edgeId, isStation, STATIONS, WIRES, type DepartmentId, type PlaceId } from './topology';
import type { PacketTrace } from './types';

export type FlowNodeId =
  | 'pos_terminal'
  | 'casa_desk'
  | 'auth_engine'
  | 'web_checkout'
  | 'token_vault'
  | 'fraud_desk'
  | 'otp_service'
  | 'cdm_kiosk'
  | 'cash_sorter'
  | 'batch_processor'
  | 'clearing_house'
  | 'settlement_desk'
  | 'reconciliation_desk';

/** The flow-to-node contract, exactly as the brief names it. */
export const GUIDED_FLOW_NODES: Readonly<Record<FlowId, readonly FlowNodeId[]>> = {
  1: ['pos_terminal', 'casa_desk', 'auth_engine'],
  2: ['web_checkout', 'token_vault', 'fraud_desk', 'otp_service', 'auth_engine'],
  3: ['cdm_kiosk', 'cash_sorter', 'casa_desk'],
  4: ['batch_processor', 'clearing_house', 'settlement_desk', 'reconciliation_desk'],
};

export interface FlowStep {
  node: FlowNodeId;
  /** The places on the map that play this part, in the order a payment meets them. */
  places: readonly PlaceId[];
  /** What the step is called in a preview card. */
  name: string;
  /** One line: what happens here. Standard (plain English) and Expert wording. */
  summary: Record<DataDepth, string>;
}

export interface FlowDef {
  id: FlowId;
  /** "01" */
  code: string;
  title: string;
  accent: string;
  /** One sentence for the flow bar's tooltip. */
  blurb: string;
  steps: readonly FlowStep[];
}

const step = (node: FlowNodeId, places: readonly PlaceId[], name: string, standard: string, expert: string): FlowStep => ({ node, places, name, summary: { standard, expert } });

export const GUIDED_FLOWS: Readonly<Record<FlowId, FlowDef>> = {
  1: {
    id: 1,
    code: '01',
    title: 'In-Store POS',
    accent: '#a3e635',
    blurb: 'A card tapped at a shop terminal: the bank checks the account and answers in well under a second.',
    steps: [
      step('pos_terminal', ['GATE_POS'], 'POS Terminal Gate', 'The shop terminal sends the tap or swipe to the bank.', 'Receives the ISO 8583 0100 authorisation request from the acquirer.'),
      step('casa_desk', ['LEDGER_DEBIT'], 'Debit CASA', 'Checks there is enough money and locks the amount for the shop.', 'Available-balance check, then an authorisation hold: Dr CASA Hold / Cr Card Clearing Payable.'),
      step('auth_engine', ['OUT_APPROVED', 'OUT_DECLINED'], 'Authorisation Answer', 'The terminal shows Approved or Declined.', 'Returns the 0110 response: RC 00 approved, or RC 51 insufficient funds.'),
    ],
  },
  2: {
    id: 2,
    code: '02',
    title: 'Web & 3DS',
    accent: '#a78bfa',
    blurb: 'An online checkout: a tokenised card with a dynamic code, or a 3DS risk check that may text the customer a code.',
    steps: [
      step('web_checkout', ['GATE_VIRTUAL', 'GATE_ECOM'], 'Web Checkout Gate', 'A website or app sends the card payment to the bank.', 'Card-not-present authorisation in: a DPAN with dCVV, or a PAN with a 3DS AReq.'),
      step('token_vault', ['SEC_VAULT', 'SEC_DCVV'], 'Token Vault & dCVV', 'Swaps the stand-in card number for the real one and checks the one-time code.', 'Detokenises DPAN → FPAN and validates the dynamic CVV inside its time window.'),
      step('fraud_desk', ['SEC_3DS'], '3DS Risk Desk', 'Scores the risk: low risk goes straight through, medium risk gets a code.', 'Risk-based authentication: frictionless below the threshold, challenge in the band, reject above it.'),
      step('otp_service', ['CUSTOMER_OTP'], 'SMS One-Time Code', 'The customer types the code from their phone, or gives up.', 'OTP challenge (CReq/CRes). A completed challenge moves fraud liability to the issuer.'),
      step('auth_engine', ['LEDGER_DEBIT', 'LEDGER_CREDIT', 'OUT_APPROVED', 'OUT_DECLINED'], 'Authorisation Engine', 'Checks the money is there, locks it, and answers the website.', 'Funds check and auth hold on the CASA or credit line, then the 0110 response code.'),
    ],
  },
  3: {
    id: 3,
    code: '03',
    title: 'CDM Cash-In',
    accent: '#38bdf8',
    blurb: 'Cash paid in at the sidewalk cash deposit machine: notes counted, account credited on the spot.',
    steps: [
      step('cdm_kiosk', ['GATE_ATM'], 'Cash Deposit Machine', 'The customer inserts their card and types the PIN.', 'Card read and PIN verified at the CDM (three tries before the card is kept).'),
      step('cash_sorter', ['ATM_CASH'], 'Note Validator & Cassette', 'The machine counts the notes and checks they are real.', 'Note validation and count; the cash joins the machine cassette (GL 1015 ATM Cash).'),
      step('casa_desk', ['LEDGER_DEBIT', 'OUT_APPROVED'], 'Customer CASA', 'The money appears in the customer’s account straight away.', 'Posting: Dr 1015 ATM Cash in Machines / Cr 2010 Customer CASA.'),
    ],
  },
  4: {
    id: 4,
    code: '04',
    title: 'Overnight EOD',
    accent: '#fbbf24',
    blurb: 'The night cycle: everything approved today is cleared with Visa, settled and reconciled before morning.',
    steps: [
      step('batch_processor', ['OUT_APPROVED'], 'Approved Today', 'Every card payment approved today waits for tonight’s run.', 'Authorised-but-unsettled holds queue for the 23:00 batch cut-off.'),
      step('clearing_house', ['EOD_BATCH'], 'Batch Clearing', 'At 23:00 the day’s payments are packed into one clearing file.', 'Builds the clearing (presentment) file from the day’s authorisations.'),
      step('settlement_desk', ['EOD_VISA'], 'Visa Settlement', 'Visa works out who owes whom and the money moves.', 'Scheme net settlement; holds are captured: Dr Customer / Cr CASA Hold.'),
      step('reconciliation_desk', ['RECON', 'SUSPENSE', 'OUT_SETTLED'], '3-Way Reconciliation', 'Three records must agree; anything odd waits in a holding account.', 'Ledger vs clearing vs switch match; breaks post to RECON_SUSPENSE until cleared.'),
    ],
  },
};

/** The flow and step a logical node plays in, for a flow that uses it. */
const nodePlaces = (flow: FlowId, node: FlowNodeId): readonly PlaceId[] => GUIDED_FLOWS[flow].steps.find((s) => s.node === node)?.places ?? [];

const PLACES_CACHE = new Map<FlowId, ReadonlySet<PlaceId>>();
/** Every place the flow lights. */
export function flowPlaces(flow: FlowId): ReadonlySet<PlaceId> {
  let set = PLACES_CACHE.get(flow);
  if (!set) {
    set = new Set(GUIDED_FLOWS[flow].steps.flatMap((s) => s.places));
    PLACES_CACHE.set(flow, set);
  }
  return set;
}

const isFlowNode = (id: string): id is FlowNodeId => Object.values(GUIDED_FLOW_NODES).some((nodes) => (nodes as readonly string[]).includes(id));

/**
 * Whether a node stays lit. Everything is lit in the Advanced scope. In the Beginner scope a node is lit when the active flow
 * uses it. `nodeId` may be a logical node of the brief ("casa_desk") or a place on the map ("LEDGER_DEBIT").
 */
export function isNodeFocused(nodeId: string, viewport: ViewportSettings): boolean {
  if (viewport.scope !== 'beginner' || viewport.activeFlow === null) return true;
  const flow = viewport.activeFlow;
  if (isFlowNode(nodeId)) return GUIDED_FLOW_NODES[flow].includes(nodeId) && nodePlaces(flow, nodeId).length > 0;
  return flowPlaces(flow).has(nodeId as PlaceId);
}

export interface FlowScope {
  places: ReadonlySet<PlaceId>;
  departments: ReadonlySet<DepartmentId>;
  /** Wire ids whose two ends are both lit. */
  wires: ReadonlySet<string>;
}

const SCOPE_CACHE = new Map<FlowId, FlowScope>();
export function flowScope(flow: FlowId): FlowScope {
  const cached = SCOPE_CACHE.get(flow);
  if (cached) return cached;
  const places = flowPlaces(flow);
  const departments = new Set<DepartmentId>();
  for (const p of places) if (isStation(p)) departments.add(STATIONS[p].department);
  const wires = new Set(WIRES.filter(([a, b]) => places.has(a) && places.has(b)).map(([a, b]) => edgeId(a, b)));
  const scope = { places, departments, wires };
  SCOPE_CACHE.set(flow, scope);
  return scope;
}

export type StepStatus = 'upcoming' | 'in-progress' | 'completed';

export const STEP_STATUS_LABEL: Record<StepStatus, string> = { upcoming: 'Upcoming', 'in-progress': 'In Progress', completed: 'Completed' };

/**
 * Where the learner's last preset payment is along a flow. With no payment on the way (or one from another flow) every
 * step is upcoming. A step is in progress while the payment is at one of its places and completed once it has passed one.
 */
export function stepStatus(flow: FlowId, index: number, trace: PacketTrace | null): StepStatus {
  const s = GUIDED_FLOWS[flow].steps[index];
  if (!s || !trace) return 'upcoming';
  const current = trace.done ? null : (trace.route[trace.at] ?? null);
  if (current && s.places.includes(current)) return 'in-progress';
  const passed = trace.route.slice(0, trace.at);
  return passed.some((p) => s.places.includes(p)) ? 'completed' : 'upcoming';
}

/** The step a place plays in a flow, for the hover preview: its number (1-based), the total, and the step. */
export function stepAt(flow: FlowId, place: PlaceId): { number: number; total: number; step: FlowStep } | null {
  const steps = GUIDED_FLOWS[flow].steps;
  const i = steps.findIndex((s) => s.places.includes(place));
  const found = steps[i];
  return found ? { number: i + 1, total: steps.length, step: found } : null;
}
