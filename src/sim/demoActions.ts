/**
 * Every button of the bottom dock in one registry (a Factory over the two sources: the core presets and the retail
 * operations), so the dock, Ctrl+K and the tests all see one list and one way to decide what is available. Each button sits in
 * exactly one child sub-group of its flow (demoGroups.ts): a flow's buttons are its groups' buttons, in menu order.
 */

import { activeLocale, pick } from '../i18n/localeCore';
import type { FlowId } from '../types/viewport';
import { demoGroup, demoGroupsIn, groupMembers, type DemoGroupId, type GroupMember } from './demoGroups';
import { presetById, presetText, type PresetId, type PresetVariant } from './presets';
import { opsActionById, type OpsActionId } from './retailOps';
import { FLOW_IDS } from '../types/viewport';

export type DemoActionId = PresetId | OpsActionId;

export interface DemoAction {
  id: DemoActionId;
  flow: FlowId;
  /** The child sub-group of its flow the button belongs to. */
  group: DemoGroupId;
  icon: string;
  variant: PresetVariant;
  label(): string;
  hint(): string;
  /** The element id tests and the walkthroughs find the button by. */
  testId: string;
}

function toAction(m: GroupMember): DemoAction {
  if (m.source === 'preset') {
    const p = m.def;
    return { id: p.id, flow: p.flow, group: p.group, icon: p.icon, variant: p.variant, label: () => presetText(p).label, hint: () => presetText(p).hint, testId: `preset-${p.id}` };
  }
  const a = m.def;
  return { id: a.id, flow: demoGroup(a.sub).flow, group: a.sub, icon: a.icon, variant: a.variant, label: () => pick(a.label, activeLocale()), hint: () => pick(a.hint, activeLocale()), testId: `ops-action-${a.id}` };
}

/** One group's buttons. */
export const demoActionsInGroup = (group: DemoGroupId): DemoAction[] => groupMembers(group).map(toAction);

/** A flow's dock: every one of its groups' buttons; with a group of that flow chosen, only that group's. */
export function demoActionsFor(flow: FlowId, group: DemoGroupId | null = null): DemoAction[] {
  if (group && demoGroup(group).flow === flow) return demoActionsInGroup(group);
  return demoGroupsIn(flow).flatMap((g) => demoActionsInGroup(g.id));
}

export const ALL_DEMO_ACTIONS: readonly DemoAction[] = FLOW_IDS.flatMap((f) => demoActionsFor(f));

export const demoActionById = (id: DemoActionId): DemoAction => {
  const p = presetById(id);
  return toAction(p ? { source: 'preset', def: p } : { source: 'ops', def: opsActionById(id as OpsActionId) });
};

/** Why a button cannot run now: only a day that is over stops a button (the bank takes no more payments until the next day starts). The sensor drill is not a payment, so even that does not. Shift windows are the scheduler's business (demoSchedule.ts). */
export function demoBlocked(id: DemoActionId, view: { dayOver: boolean; minute: number }): 'dayOver' | null {
  if (id === 'cassette-low' || id === 'cassette-refill') return null;
  return view.dayOver ? 'dayOver' : null;
}

