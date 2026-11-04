/**
 * The child sub-groups of the eight guided flows: every demo button of the bottom dock belongs to exactly one of them, so a flow's
 * buttons are always the sum of its sub-groups' buttons and nothing floats loose under a flow. Two sources feed the groups: the
 * retail operations book's sub-processes (retailOps.ts, which keep their lessons and journals) and the core groups below, which
 * hold the core presets (presets.ts). A preset may also join a retail sub-process when its mechanics are the same (the $200 CDM
 * deposit sits with the ATM withdrawals).
 */

import type { Localized } from '../i18n/localeCore';
import type { FlowId } from '../types/viewport';
import { flowScope, type FlowScope } from './guidedFlows';
import { planCheckout, buildGraphs } from './processes';
import { PRESETS, presetCustomer, type PresetDef } from './presets';
import { OPS_ACTIONS, opsSubProcess, type OpsActionDef, type OpsSubProcessId } from './retailOps';
import { DEFAULT_RULES } from './rules';
import { stpPlaces } from './stpEngine';
import { edgeId, isStation, STATIONS, WIRES, type DepartmentId, type PlaceId } from './topology';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

/** The groups that hold only core presets. */
export type CoreGroupId = 'card-auth' | 'token-3ds' | 'eod-batch' | 'ekyc-onboard' | 'cash-ctr' | 'swift-remit' | 'disputes';
export type DemoGroupId = OpsSubProcessId | CoreGroupId;

export interface DemoGroup {
  id: DemoGroupId;
  flow: FlowId;
  title: Localized<string>;
  /** 'ops' groups are retail sub-processes, with a lesson of their own in the Knowledge Base. */
  source: 'core' | 'ops';
}

const CORE_TITLES: Readonly<Record<CoreGroupId, { flow: FlowId; title: Localized<string> }>> = {
  'card-auth': { flow: 1, title: L('POS Card Authorisation (Approve / Decline)', 'Quẹt thẻ POS & Cấp phép giao dịch') },
  'token-3ds': { flow: 2, title: L('Tokenization & 3DS / OTP Authentication', 'Thanh toán thẻ số hóa (Token) & Xác thực 3DS / OTP') },
  'eod-batch': { flow: 4, title: L('Overnight EOD Batch & Reconciliation', 'Xử lý lô cuối ngày (EOD) & Đối soát') },
  'ekyc-onboard': { flow: 5, title: L('eKYC Digital Onboarding', 'Mở tài khoản trực tuyến eKYC') },
  'cash-ctr': { flow: 6, title: L('Large Cash Transactions (CTR) & Smurfing Review', 'Giao dịch tiền mặt giá trị lớn (CTR) & Rà soát chia nhỏ giao dịch') },
  'swift-remit': { flow: 8, title: L('SWIFT Cross-border Transfers (pacs.008)', 'Chuyển tiền quốc tế SWIFT (pacs.008)') },
  disputes: { flow: 8, title: L('Disputes & Payment Returns (pacs.004)', 'Tra soát & Hoàn trả giao dịch (pacs.004)') },
};

/** Every group, in menu order: each flow's groups together, the core group (its headline payments) first. */
const ORDER: readonly DemoGroupId[] = [
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
  'eod-batch',
  'ekyc-onboard',
  'cash-ctr',
  'teller-vault',
  'term-deposit',
  'collateral',
  'wallet-qr',
  'swift-remit',
  'disputes',
];

const isCore = (id: DemoGroupId): id is CoreGroupId => id in CORE_TITLES;

export const DEMO_GROUPS: readonly DemoGroup[] = ORDER.map((id): DemoGroup => {
  if (isCore(id)) return { id, ...CORE_TITLES[id], source: 'core' };
  const s = opsSubProcess(id);
  return { id, flow: s.flow, title: s.title, source: 'ops' };
}).sort((a, b) => a.flow - b.flow);

export const demoGroup = (id: DemoGroupId): DemoGroup => DEMO_GROUPS.find((g) => g.id === id)!;
/** A retail sub-process, with its own lesson and journals in the Knowledge Base. */
export const isOpsGroup = (id: DemoGroupId): id is OpsSubProcessId => !isCore(id);
export const isDemoGroupId = (id: string): id is DemoGroupId => DEMO_GROUPS.some((g) => g.id === id);
export const demoGroupsIn = (flow: FlowId): DemoGroup[] => DEMO_GROUPS.filter((g) => g.flow === flow);
/** Whether the menu lists a flow's groups at all: a flow with one group is that group, so a nested row would only repeat it. */
export const showsGroupsOf = (flow: FlowId): boolean => demoGroupsIn(flow).length > 1;

export type GroupMember = { source: 'preset'; def: PresetDef } | { source: 'ops'; def: OpsActionDef };

/** Happy paths first, then the warnings, then the failures; ties keep their book order. */
const VARIANT_RANK: Readonly<Record<PresetDef['variant'], number>> = { success: 0, primary: 1, warning: 2, danger: 3 };

const MEMBERS = new Map<DemoGroupId, readonly GroupMember[]>();
/** A group's buttons, in the order the dock shows them. */
export function groupMembers(id: DemoGroupId): readonly GroupMember[] {
  const hit = MEMBERS.get(id);
  if (hit) return hit;
  const all: GroupMember[] = [...PRESETS.filter((p) => p.group === id).map((def): GroupMember => ({ source: 'preset', def })), ...OPS_ACTIONS.filter((a) => a.sub === id).map((def): GroupMember => ({ source: 'ops', def }))];
  const ranked = all.map((m, i) => ({ m, i })).sort((a, b) => VARIANT_RANK[a.m.def.variant] - VARIANT_RANK[b.m.def.variant] || a.i - b.i).map((x) => x.m);
  MEMBERS.set(id, ranked);
  return ranked;
}

/** The desks a button's payment crosses: a retail action's route, or a preset's route under the default rules. */
export const memberPlaces = (m: GroupMember): readonly PlaceId[] => (m.source === 'ops' ? stpPlaces(m.def.id, m.def.route) : presetPlaces(m.def));

/** The desks a preset's payment crosses under the default rules (the night cycle, which is not a payment, lights its whole flow). */
function presetPlaces(def: PresetDef): readonly PlaceId[] {
  const customer = presetCustomer(def.id, DEFAULT_RULES);
  if (!customer) return [...flowScope(def.flow).places];
  return planCheckout(customer, graphs()).stops.map((s) => s.place);
}

let cachedGraphs: ReturnType<typeof buildGraphs> | null = null;
const graphs = (): ReturnType<typeof buildGraphs> => (cachedGraphs ??= buildGraphs(DEFAULT_RULES));

const SCOPES = new Map<DemoGroupId, FlowScope>();
/** What a group lights: only the desks its own payments cross, and the wires between them. */
export function groupScope(id: DemoGroupId): FlowScope {
  const cached = SCOPES.get(id);
  if (cached) return cached;
  const places = new Set<PlaceId>(groupMembers(id).flatMap(memberPlaces));
  const departments = new Set<DepartmentId>();
  for (const p of places) if (isStation(p)) departments.add(STATIONS[p].department);
  const scope: FlowScope = { places, departments, wires: new Set(WIRES.filter(([a, b]) => places.has(a) && places.has(b)).map(([a, b]) => edgeId(a, b))) };
  SCOPES.set(id, scope);
  return scope;
}

/** What the map lights: the chosen group, else the flow. */
export const focusScope = (flow: FlowId, group: DemoGroupId | null): FlowScope => (group && demoGroup(group).flow === flow ? groupScope(group) : flowScope(flow));
