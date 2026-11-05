/**
 * The scenario a sub-process sheet's "▶ Run this scenario" button plays (SubProcessInfoDrawer). Every sheet has one (Strategy):
 *   - a CIT child sheet runs its CIT dispatch (the van, the crew, the vault);
 *   - a sub-group's sheet runs that group's headline button (its happy path, the first the dock shows);
 *   - a flow's sheet runs the flow's primary preset (what "Simulate this Flow" sends);
 *   - the AML domain runs the sanctions hold, the CIT domain hands over to its four dispatch buttons (no single run).
 * Pure: the drawer turns the answer into a call to runDemo or dispatchCitDemo.
 */

import { citDemoOfKey, isInfoKey, type InfoKey } from '../data/subProcessKeys';
import type { CitDemo } from './citEngine';
import type { DemoActionId } from './demoActions';
import { groupMembers, isDemoGroupId } from './demoGroups';
import { PRIMARY_PRESET } from './presets';
import { isPaymentFlow, type FlowId } from '../types/viewport';

export type SheetDemo = { kind: 'cit'; demo: CitDemo } | { kind: 'action'; id: DemoActionId };

/** Domains with no demo group of their own, and the scenario that shows them best. */
const DOMAIN_DEMO: Readonly<Partial<Record<InfoKey, DemoActionId>>> = { 'aml-sanctions': 'swift-sanction' };

export function sheetDemo(key: InfoKey): SheetDemo | null {
  if (!isInfoKey(key)) return null;
  const cit = citDemoOfKey(key);
  if (cit) return { kind: 'cit', demo: cit };
  const domain = DOMAIN_DEMO[key];
  if (domain) return { kind: 'action', id: domain };
  if (key.startsWith('flow-')) {
    // Flow 09 has no single run: its sheet hands over to the four CIT dispatch buttons.
    const flow = Number(key.slice(5)) as FlowId;
    return isPaymentFlow(flow) ? { kind: 'action', id: PRIMARY_PRESET[flow] } : null;
  }
  if (isDemoGroupId(key)) {
    const first = groupMembers(key)[0];
    return first ? { kind: 'action', id: first.def.id as DemoActionId } : null;
  }
  return null;
}
