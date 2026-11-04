/**
 * When each demo button may run, and how the map draws it.
 *
 * Shift: digital and automated channels (cards, tokens, 3DS, ATMs, eKYC, QR and wallets, SWIFT, auto-pay and fees) run 24/7/365 and
 * are never held. Counter work (the teller, the savings and collateral desks, the disputes desk) needs staff, so it runs in the
 * day window, 09:00 to 17:00. The night batch (the EOD cycle and the debt-group migration it runs) belongs to the 23:00 slot.
 * Outside its window a shift-bound button asks first (see shiftQueueStore.ts): snap the clock to its slot, or wait for it.
 *
 * Mode: a button whose payment crosses a desk people walk up to is human-driven (customers and staff appear and queue); anything
 * else is a system flow, drawn only as packets along the wires between system nodes.
 */

import { DAY_END, EOD_START, formatClock, WORK_END, WORK_START } from './clock';
import type { DemoActionId } from './demoActions';
import { groupMembers, type DemoGroupId, type GroupMember } from './demoGroups';
import { memberPlaces } from './demoGroups';
import { presetById } from './presets';
import { opsActionById, type OpsActionId } from './retailOps';
import { STATIONS, type PlaceId } from './topology';

export type DemoShift = 'always' | 'day' | 'eod';
export type DemoMode = 'human' | 'system';

/** The groups worked at a staffed counter. */
const COUNTER_GROUPS: ReadonlySet<DemoGroupId> = new Set<DemoGroupId>(['cash-ctr', 'teller-vault', 'term-deposit', 'collateral', 'disputes']);
/** Single buttons worked at a staffed counter although their sub-process is otherwise digital: the Pay-in-4 appraisal counter (Quầy thẩm định). */
const COUNTER_ACTIONS: ReadonlySet<DemoActionId> = new Set<DemoActionId>(['bnpl-approve-400', 'bnpl-decline-dti', 'bnpl-decline-cic']);
/** The buttons that are the night batch itself, or a job it runs. */
const NIGHT_BATCH: ReadonlySet<DemoActionId> = new Set<DemoActionId>(['eod', 'risk-migrate-95dpd', 'risk-migrate-group5', 'risk-cure']);

/** When a day-counter button asked after closing time snaps back to: half an hour before the doors close, time to be served. */
export const COUNTER_LATE_SLOT = WORK_END - 30;

const groupOf = (id: DemoActionId): DemoGroupId => presetById(id)?.group ?? opsActionById(id as OpsActionId).sub;

export function shiftOf(id: DemoActionId): DemoShift {
  if (NIGHT_BATCH.has(id)) return 'eod';
  return COUNTER_GROUPS.has(groupOf(id)) || COUNTER_ACTIONS.has(id) ? 'day' : 'always';
}

/** Whether a shift's window is open at `minute` (minutes since midnight). */
export function inWindow(shift: DemoShift, minute: number): boolean {
  if (shift === 'day') return minute >= WORK_START && minute < WORK_END;
  if (shift === 'eod') return minute >= EOD_START && minute < DAY_END;
  return true;
}

export interface ShiftSnap {
  shift: Exclude<DemoShift, 'always'>;
  /** The minute the clock would move to, the same day. */
  target: number;
  /** Forward is a fast-forward; back replays the day from 07:00 up to the target. */
  direction: 'forward' | 'back';
  /** Why: before the counters open, after they close, or in the day when the button belongs to the night. */
  reason: 'beforeOpening' | 'afterClosing' | 'nightShift';
}

/** Where the clock would have to go for a button to run, or null when it can run now. */
export function shiftSnap(id: DemoActionId, minute: number): ShiftSnap | null {
  const shift = shiftOf(id);
  if (shift === 'always' || inWindow(shift, minute)) return null;
  if (shift === 'eod') return { shift, target: EOD_START, direction: 'forward', reason: 'nightShift' };
  return minute < WORK_START ? { shift, target: WORK_START, direction: 'forward', reason: 'beforeOpening' } : { shift, target: COUNTER_LATE_SLOT, direction: 'back', reason: 'afterClosing' };
}

export const slotLabel = (minute: number): string => formatClock(minute);

/** The desks people walk up to: the teller and the disputes desk, the savings and collateral desks, and the sidewalk machines. */
const HUMAN_DESKS: ReadonlySet<PlaceId> = new Set<PlaceId>(['TELLER_CASH', 'DISPUTE_DESK', 'SAVINGS_DESK', 'COLLATERAL_VAULT']);
const isHumanDesk = (p: PlaceId): boolean => HUMAN_DESKS.has(p) || (p in STATIONS && STATIONS[p as keyof typeof STATIONS].kind === 'ATM');

const memberOf = (id: DemoActionId): GroupMember => groupMembers(groupOf(id)).find((m) => m.def.id === id)!;

const MODES = new Map<DemoActionId, DemoMode>();
export function modeOf(id: DemoActionId): DemoMode {
  const hit = MODES.get(id);
  if (hit) return hit;
  // A sensor drill and the night batch never bring anyone in, whatever desk they light.
  const mode: DemoMode = id === 'cassette-low' || id === 'cassette-refill' || NIGHT_BATCH.has(id) ? 'system' : COUNTER_ACTIONS.has(id) || memberPlaces(memberOf(id)).some(isHumanDesk) ? 'human' : 'system';
  MODES.set(id, mode);
  return mode;
}
