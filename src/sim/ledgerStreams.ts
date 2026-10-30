/**
 * The two streams the workspace's ledger and audit trail show: the system's own entries (the bank simulation's background
 * traffic, as of the bank's clock now) and the player's (journals and decisions posted by hand in the Staff Roleplay
 * Workspace). A filter picks one stream or both. No React here: the dialogs and the tests read the same rules.
 */

import { formatClock } from './clock';
import type { StationId } from './topology';
import type { TxRecord } from './types';

export type StreamFilter = 'all' | 'system' | 'player';
export const STREAM_FILTERS: readonly StreamFilter[] = ['all', 'system', 'player'];

export const showsSystem = (f: StreamFilter): boolean => f !== 'player';
export const showsPlayer = (f: StreamFilter): boolean => f !== 'system';

/** The bank's time for a row: "D3 14:05:30" (day, then the clock with seconds). */
export function simStamp(day: number, minute: number): string {
  const secs = Math.round((minute - Math.floor(minute)) * 60) % 60;
  return `D${day} ${formatClock(Math.floor(minute))}:${String(secs).padStart(2, '0')}`;
}

/** What the system's engine decided, as an audit action code. AUTO_HOLD: an ATM that jammed after the debit, its money held in suspense until the cash count. */
export type SystemActionCode = 'AUTO_APPROVE' | 'AUTO_REJECT' | 'AUTO_HOLD';

/** One decision the system's engine took on a payment, as an entry of the audit trail's system stream (System Automated Audit Trail). */
export interface SystemAuditEntry {
  /** The bank's time: "D3 14:05:30". */
  at: string;
  minute: number;
  /** The engine (desk) that took the decision: the payment's gateway or machine. */
  engine: StationId;
  txId: string;
  channel: TxRecord['kind'];
  code: SystemActionCode;
  /** The decision on the workspace's scale: approved, rejected, or held (frozen in suspense). */
  action: 'APPROVE' | 'REJECT' | 'FREEZE';
  /** The engine answers within its own time, always within SLA. Its SOP is the bank's rules: breached when it let a fraud through. */
  compliance: 'COMPLIANT' | 'SOP_BREACH';
  amountCents: number;
  responseCode: string;
  scenario: string;
}

/** The engine that decides each channel's payments: its gateway, machine or (for the channels with a desk) that desk. */
export const SYSTEM_ENGINE: Readonly<Record<TxRecord['kind'], StationId>> = {
  POS: 'GATE_POS',
  ECOM: 'GATE_ECOM',
  VIRTUAL: 'GATE_VIRTUAL',
  BNPL: 'BNPL',
  A2A: 'GATE_A2A',
  ATM: 'ATM_CASH',
  ONBOARD: 'GATE_EKYC',
  QR: 'GATE_QR',
  TELLER: 'TELLER_CASH',
  SWIFT: 'GATE_SWIFT',
  DISPUTE: 'DISPUTE_DESK',
  SETTLEMENT: 'EOD_BATCH',
};

const CODE: Readonly<Record<TxRecord['status'], { code: SystemActionCode; action: SystemAuditEntry['action'] }>> = {
  APPROVED: { code: 'AUTO_APPROVE', action: 'APPROVE' },
  DECLINED: { code: 'AUTO_REJECT', action: 'REJECT' },
  JAMMED: { code: 'AUTO_HOLD', action: 'FREEZE' },
};

/** The system stream of the audit trail: every decision the engine took on a payment finished up to `minute` of today, oldest first (the point-in-time view). */
export function systemAuditTrail(log: readonly TxRecord[], day: number, minute: number): SystemAuditEntry[] {
  return log
    .filter((t) => t.minute <= minute)
    .map((t) => ({
      at: simStamp(day, t.minute),
      minute: t.minute,
      engine: SYSTEM_ENGINE[t.kind],
      txId: t.txId,
      channel: t.kind,
      ...CODE[t.status],
      compliance: t.status === 'APPROVED' && t.isFraud ? 'SOP_BREACH' : 'COMPLIANT',
      amountCents: t.amountCents,
      responseCode: t.responseCode ?? (t.status === 'APPROVED' ? '00' : '—'),
      scenario: t.scenario,
    }));
}

/** What each stream holds under a filter, and their counts (for the toggle's badges). */
export function streamCounts(system: number, player: number): Readonly<Record<StreamFilter, number>> {
  return { all: system + player, system, player };
}
