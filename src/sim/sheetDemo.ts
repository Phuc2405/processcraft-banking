/**
 * The scenario a sub-process sheet's "▶ Run this scenario" button plays (SubProcessInfoDrawer). Every sheet has one (Strategy):
 *   - a CIT child sheet runs its CIT dispatch (the van, the crew, the vault);
 *   - a sub-group's sheet runs that group's headline button (its happy path, the first the dock shows);
 *   - a parent flow's sheet (Flows 01-09) runs nothing: it lists its child sub-processes (childSheetsOf), whose sheets carry the runs;
 *   - the AML domain runs the sanctions hold.
 * Pure: the drawer turns the answer into a call to runDemo or dispatchCitDemo.
 */

import { citDemoOfKey, CIT_INFO_KEYS, isInfoKey, type InfoKey } from '../data/subProcessKeys';
import type { CitDemo } from './citEngine';
import type { DemoActionId } from './demoActions';
import { demoGroupsIn, groupMembers, isDemoGroupId } from './demoGroups';
import { CIT_FLOW, type FlowId } from '../types/viewport';

export type SheetDemo = { kind: 'cit'; demo: CitDemo } | { kind: 'action'; id: DemoActionId };

/** Domains with no demo group of their own, and the scenario that shows them best. */
const DOMAIN_DEMO: Readonly<Partial<Record<InfoKey, DemoActionId>>> = { 'aml-sanctions': 'swift-sanction' };

export function sheetDemo(key: InfoKey): SheetDemo | null {
  if (!isInfoKey(key)) return null;
  const cit = citDemoOfKey(key);
  if (cit) return { kind: 'cit', demo: cit };
  const domain = DOMAIN_DEMO[key];
  if (domain) return { kind: 'action', id: domain };
  // A parent flow's sheet has no run of its own: a demo runs only from a child sub-process sheet.
  if (key.startsWith('flow-')) return null;
  if (isDemoGroupId(key)) {
    const first = groupMembers(key)[0];
    return first ? { kind: 'action', id: first.def.id as DemoActionId } : null;
  }
  return null;
}

/** A parent flow sheet's children, the sheets that carry the runs: Flow 09's four CIT sub-processes, else the flow's demo groups with a sheet of their own. */
export function childSheetsOf(flow: FlowId): InfoKey[] {
  if (flow === CIT_FLOW) return Object.values(CIT_INFO_KEYS);
  return demoGroupsIn(flow)
    .map((g) => g.id as string)
    .filter(isInfoKey);
}
