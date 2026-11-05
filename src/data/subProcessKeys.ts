/** The sub-process info drawer's keys and how a menu choice or a desk maps to one; the content is in subProcessRegistry.ts. */

import type { CitDemo } from '../sim/citEngine';
import { GUIDED_FLOWS } from '../sim/guidedFlows';
import type { DemoGroupId } from '../sim/demoGroups';
import type { PlaceId } from '../sim/topology';
import { FLOW_IDS, type FlowId } from '../types/viewport';

/**
 * Every sub-group the top menu lists (the groups of a flow with more than one) has a sheet of its own, keyed by its demo-group id;
 * a single-group flow's group is its flow, so it reads the flow's sheet. A test holds this list to demoGroups.
 */
export const GROUP_INFO_KEYS = [
  'card-auth',
  'bill-pay',
  'card-fees',
  'auto-pay',
  'token-3ds',
  'bnpl-credit',
  'debt-waterfall',
  'credit-risk',
  'atm-napas',
  'cassette-jam',
  'cash-ctr',
  'teller-vault',
  'term-deposit',
  'collateral',
  'swift-remit',
  'disputes',
] as const satisfies readonly DemoGroupId[];
export type GroupInfoKey = (typeof GROUP_INFO_KEYS)[number];

/** Cross-cutting domains with no demo group of their own. */
export type DomainKey = 'cit-vault' | 'aml-sanctions';

/** The CIT domain's four child sub-processes under Flow 06, one per demo the learner can run from its sheet. */
export const CIT_INFO_KEYS = { ATM: '06-cit-atm', DOORSTEP: '06-cit-doorstep', SBV: '06-cit-sbv', TELLER: '06-cit-teller-vault' } as const satisfies Record<CitDemo, string>;
export type CitInfoKey = (typeof CIT_INFO_KEYS)[CitDemo];
const CIT_CHILDREN = Object.entries(CIT_INFO_KEYS) as ReadonlyArray<[CitDemo, CitInfoKey]>;
/** The demo a CIT child sheet runs, or null for any other sheet. */
export const citDemoOfKey = (k: string): CitDemo | null => CIT_CHILDREN.find(([, v]) => v === k)?.[0] ?? null;

export type InfoKey = `flow-${FlowId}` | GroupInfoKey | DomainKey | CitInfoKey;

export const INFO_KEYS: readonly InfoKey[] = [...FLOW_IDS.map((f): InfoKey => `flow-${f}`), ...GROUP_INFO_KEYS, 'cit-vault', ...CIT_CHILDREN.map(([, k]) => k), 'aml-sanctions'];
export const isInfoKey = (k: unknown): k is InfoKey => typeof k === 'string' && (INFO_KEYS as readonly string[]).includes(k);

/** What the drawer shows for a menu choice: the sub-group's own sheet when it has one, else its flow's. */
export const infoKeyForChoice = (flow: FlowId, sub: string | null): InfoKey => (sub && isInfoKey(sub) ? sub : `flow-${flow}`);

const PLACE_INFO: Partial<Record<PlaceId, InfoKey>> = {
  COLLATERAL_VAULT: 'cit-vault',
  AML_DESK: 'aml-sanctions',
  SEC_3DS: 'token-3ds',
  SEC_VAULT: 'token-3ds',
  SEC_DCVV: 'token-3ds',
  CUSTOMER_OTP: 'token-3ds',
  BNPL: 'bnpl-credit',
  STP_ENGINE: 'bnpl-credit',
  ATM_CASH: 'atm-napas',
  TELLER_CASH: 'teller-vault',
  SAVINGS_DESK: 'term-deposit',
  DISPUTE_DESK: 'disputes',
  GATE_SWIFT: 'swift-remit',
};

/** The sheet for a desk on the map: its own, else the first guided flow that crosses it. */
export function infoKeyForPlace(place: PlaceId): InfoKey | null {
  const own = PLACE_INFO[place];
  if (own) return own;
  const flow = FLOW_IDS.find((f) => GUIDED_FLOWS[f].steps.some((s) => s.places.includes(place)));
  return flow ? `flow-${flow}` : null;
}
