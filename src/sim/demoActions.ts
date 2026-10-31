/**
 * Every button of the bottom dock in one registry (a Factory over the two sources: the core presets and the retail
 * operations), so the dock, Ctrl+K and the tests all see one list and one way to decide what is available.
 */

import { activeLocale, pick } from '../i18n/localeCore';
import type { FlowId } from '../types/viewport';
import { EOD_START } from './clock';
import { presetById, presetsFor, presetText, type PresetId, type PresetVariant } from './presets';
import { opsActionById, opsActionsFor, OPS_ACTIONS, opsFlowOf, opsSubProcess, opsSubProcessesIn, type OpsActionId, type OpsSubProcessId } from './retailOps';
import { FLOW_IDS } from '../types/viewport';

export type DemoActionId = PresetId | OpsActionId;

export interface DemoAction {
  id: DemoActionId;
  flow: FlowId;
  /** The retail sub-process it belongs to; null for a core preset. */
  sub: OpsSubProcessId | null;
  icon: string;
  variant: PresetVariant;
  label(): string;
  hint(): string;
  /** The element id tests and the walkthroughs find the button by. */
  testId: string;
}

function presetAction(id: PresetId): DemoAction {
  const p = presetById(id)!;
  return { id, flow: p.flow, sub: null, icon: p.icon, variant: p.variant, label: () => presetText(p).label, hint: () => presetText(p).hint, testId: `preset-${id}` };
}

function opsAction(id: OpsActionId): DemoAction {
  const a = opsActionById(id);
  return { id, flow: opsFlowOf(a), sub: a.sub, icon: a.icon, variant: a.variant, label: () => pick(a.label, activeLocale()), hint: () => pick(a.hint, activeLocale()), testId: `ops-action-${id}` };
}

/** A flow's dock: its presets then its sub-processes' actions; with a sub-process chosen, only that sub-process's actions. */
export function demoActionsFor(flow: FlowId, sub: OpsSubProcessId | null = null): DemoAction[] {
  if (sub && opsSubProcess(sub).flow === flow) return opsActionsFor(sub).map((a) => opsAction(a.id));
  return [...presetsFor(flow).map((p) => presetAction(p.id)), ...opsSubProcessesIn(flow).flatMap((s) => opsActionsFor(s.id).map((a) => opsAction(a.id)))];
}

export const ALL_DEMO_ACTIONS: readonly DemoAction[] = FLOW_IDS.flatMap((f) => demoActionsFor(f));

export const demoActionById = (id: DemoActionId): DemoAction => (presetById(id) ? presetAction(id as PresetId) : opsAction(id as OpsActionId));

/** Why a button cannot run now: the day is over, or (for anything but the night cycle and a sensor drill) the branch is closed for the night. */
export function demoBlocked(id: DemoActionId, view: { dayOver: boolean; minute: number }): 'dayOver' | 'night' | null {
  if (id === 'cassette-low') return null;
  if (view.dayOver) return 'dayOver';
  return id !== 'eod' && view.minute >= EOD_START ? 'night' : null;
}

export const OPS_ACTION_IDS: readonly OpsActionId[] = OPS_ACTIONS.map((a) => a.id);
