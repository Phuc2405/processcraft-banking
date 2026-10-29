/** The end-of-day audit report: what an internal auditor would ask of the day, in one CSV file. 1. */

import type { ChaosTag, ChaosView } from '../engine/chaos';
import { trialBalance } from '../engine/ledger';
import type { GLEntry } from '../types/processLearning';
import { formatClock } from './clock';
import { clockWithSeconds } from './reportSummary';
import { scenarioLabelEn } from './scenarios';
import type { DayReport, TxRecord } from './types';

export type AuditFlag = 'FRAUD_APPROVED' | 'FRAUD_BLOCKED' | 'CHAOS_DECLINE' | 'TIMEOUT' | 'BOT' | 'MISAPPROVED' | 'SUSPENSE' | 'DISPUTED' | 'HIGH_VALUE';

export interface AuditRow {
  time: string;
  txId: string;
  id: string;
  channel: string;
  scenario: string;
  amountCents: number;
  status: TxRecord['status'];
  responseCode: string;
  decline: string;
  chaos: ChaosTag | '';
  flags: AuditFlag[];
}

export interface AuditSummary {
  day: number;
  payments: number;
  approved: number;
  declined: number;
  approvalRatePct: number;
  approvedCents: number;
  fraudAttempts: number;
  fraudBlocked: number;
  fraudSlipped: number;
  fraudLossCents: number;
  ledgerLines: number;
  totalDebitsCents: number;
  totalCreditsCents: number;
  ledgerBalanced: boolean;
  suspenseCents: number;
  suspenseItems: number;
  reconBacklog: number;
  nightDone: string;
  disputesRaised: number;
  disputedCents: number;
  avgFatiguePct: number;
  maxFatiguePct: number;
}

export interface AuditReport {
  summary: AuditSummary;
  chaos: ChaosView | null;
  rows: AuditRow[];
  exceptions: AuditRow[];
}

/** Payments at or above this amount are flagged for sampling. */
export const HIGH_VALUE_CENTS = 1_000_000;

const CHAOS_DECLINES: ReadonlySet<ChaosTag> = new Set<ChaosTag>(['POS_OUTAGE', 'HSM_FAILURE', 'TIMEOUT_504']);

/** The audit flags one payment raises. */
export function flagsFor(t: TxRecord, disputed: ReadonlySet<string>): AuditFlag[] {
  const flags: AuditFlag[] = [];
  if (t.isFraud) flags.push(t.status === 'APPROVED' ? 'FRAUD_APPROVED' : 'FRAUD_BLOCKED');
  if (t.chaos && CHAOS_DECLINES.has(t.chaos)) flags.push('CHAOS_DECLINE');
  if (t.decline === 'TIMEOUT') flags.push('TIMEOUT');
  if (t.chaos === 'BOT' || t.chaos === 'MISAPPROVED') flags.push('BOT');
  if (t.chaos === 'MISAPPROVED') flags.push('MISAPPROVED');
  if (t.recon === 'SUSPENDED') flags.push('SUSPENSE');
  if (disputed.has(t.id)) flags.push('DISPUTED');
  if (t.amountCents >= HIGH_VALUE_CENTS) flags.push('HIGH_VALUE');
  return flags;
}

const isException = (r: AuditRow): boolean => r.flags.some((f) => f !== 'FRAUD_BLOCKED' && f !== 'BOT') || r.flags.includes('MISAPPROVED');

/** Builds the audit from the day's report, its transaction log, its ledger and what Chaos Monkey did. */
export function buildAudit(report: DayReport, log: readonly TxRecord[], ledger: readonly GLEntry[], chaos: ChaosView | null, disputedIds: readonly string[] = []): AuditReport {
  const disputed = new Set(disputedIds);
  const k = report.kpis;
  const tb = trialBalance(ledger);
  const payments = k.approved + k.declined;
  const rows: AuditRow[] = [...log]
    .sort((a, b) => a.minute - b.minute || (a.txId < b.txId ? -1 : 1))
    .map((t) => ({
      time: clockWithSeconds(t.minute),
      txId: t.txId,
      id: t.id,
      channel: t.deposit ? 'CASH_DEPOSIT' : t.kind,
      scenario: scenarioLabelEn(t.scenario),
      amountCents: t.amountCents,
      status: t.status,
      responseCode: t.responseCode ?? (t.status === 'APPROVED' ? '00' : ''),
      decline: t.decline ?? '',
      chaos: t.chaos ?? '',
      flags: flagsFor(t, disputed),
    }));
  const summary: AuditSummary = {
    day: report.day,
    payments,
    approved: k.approved,
    declined: k.declined,
    approvalRatePct: payments > 0 ? Math.round((k.approved / payments) * 1000) / 10 : 0,
    approvedCents: k.approvedCents,
    fraudAttempts: k.fraudAttempts,
    fraudBlocked: k.fraudBlocked,
    fraudSlipped: k.fraudSlipped,
    fraudLossCents: k.fraudLossCents,
    ledgerLines: ledger.length,
    totalDebitsCents: tb.totalDebits,
    totalCreditsCents: tb.totalCredits,
    ledgerBalanced: tb.balanced,
    suspenseCents: report.close.suspenseCents,
    suspenseItems: report.close.suspenseItems,
    reconBacklog: report.close.reconBacklog,
    nightDone: report.close.nightDoneMinute === null ? 'NOT FINISHED' : formatClock(report.close.nightDoneMinute),
    disputesRaised: k.disputesRaised ?? 0,
    disputedCents: k.disputedCents ?? 0,
    avgFatiguePct: Math.round(report.close.avgFatigue),
    maxFatiguePct: Math.round(report.close.maxFatigue),
  };
  return { summary, chaos, rows, exceptions: rows.filter(isException) };
}

const cell = (v: string | number | boolean): string => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dollars = (cents: number): string => (cents / 100).toFixed(2);

export const AUDIT_ROW_HEADER = ['Time', 'Transaction ID', 'Packet ID', 'Channel', 'Scenario', 'Amount (AUD)', 'Status', 'ISO Response Code', 'Decline Reason', 'Chaos Event', 'Audit Flags'] as const;

const rowCells = (r: AuditRow): Array<string | number> => [r.time, r.txId, r.id, r.channel, r.scenario, dollars(r.amountCents), r.status, r.responseCode, r.decline, r.chaos, r.flags.join(' | ')];

/** The audit as a CSV file: four sections separated by blank lines, UTF-8 with a BOM so spreadsheets read it right. */
export function auditCsv(a: AuditReport): string {
  const s = a.summary;
  const lines: Array<Array<string | number | boolean>> = [
    ['ProcessCraft Banking: End-of-Day Audit Report'],
    ['Day', s.day],
    [],
    ['SECTION 1: SUMMARY'],
    ['Metric', 'Value'],
    ['Customer payments', s.payments],
    ['Approved', s.approved],
    ['Declined', s.declined],
    ['Approval rate (%)', s.approvalRatePct.toFixed(1)],
    ['Approved value (AUD)', dollars(s.approvedCents)],
    ['Fraud attempts', s.fraudAttempts],
    ['Fraud blocked', s.fraudBlocked],
    ['Fraud approved', s.fraudSlipped],
    ['Fraud loss (AUD)', dollars(s.fraudLossCents)],
    ['GL lines posted', s.ledgerLines],
    ['Total debits (AUD)', dollars(s.totalDebitsCents)],
    ['Total credits (AUD)', dollars(s.totalCreditsCents)],
    ['Trial balance', s.ledgerBalanced ? 'BALANCED' : 'OUT OF BALANCE'],
    ['Suspense account (AUD)', dollars(s.suspenseCents)],
    ['Suspense items', s.suspenseItems],
    ['Unreconciled records rolled to tomorrow', s.reconBacklog],
    ['Night cycle finished', s.nightDone],
    ['Chargebacks raised from the ledger', s.disputesRaised],
    ['Chargeback value reversed (AUD)', dollars(s.disputedCents)],
    ['Average staff fatigue (%)', s.avgFatiguePct],
    ['Peak staff fatigue (%)', s.maxFatiguePct],
    [],
    ['SECTION 2: CHAOS MONKEY'],
  ];
  if (!a.chaos || !a.chaos.active) {
    lines.push(['No faults were injected and no scenario was scripted for this day.']);
  } else {
    const c = a.chaos;
    lines.push(
      ['Item', 'Value'],
      ['Scripted scenario', c.scenario],
      ['POS station outage', c.config.posOutage ? 'ON' : 'OFF'],
      ['3DS HSM failure', c.config.hsmFailure ? 'ON' : 'OFF'],
      ['Network congestion', c.config.congestion || c.scenario === 'FLASH_SURGE' ? 'ON' : 'OFF'],
      ['Staff fatigue spike', c.config.fatigueSpike ? 'ON' : 'OFF'],
      ['Flash-sale extra customers', c.stats.surgeCustomers],
      ['Botnet attempts', c.stats.botAttempts],
      ['Botnet attempts blocked', c.stats.botBlocked],
      ['Botnet attempts approved', c.stats.botApproved],
      ['Fatigue mis-approvals', c.stats.misApprovals],
      ['Velocity alerts', c.stats.velocityAlerts],
      ['POS outage declines (RC 91)', c.stats.posOutageDeclines],
      ['HSM failure declines (RC 96)', c.stats.hsmDeclines],
      ['504 gateway timeouts', c.stats.timeouts504],
      ['Recovered by status inquiry', c.stats.inquiriesRecovered],
      ['Timed out after inquiry (RC 68)', c.stats.inquiriesFailed],
      ['Added latency (seconds)', Math.round(c.stats.addedLatencyMs / 1000)],
    );
  }
  lines.push([], ['SECTION 3: EXCEPTIONS FOR SAMPLING', `${a.exceptions.length} payments`], [...AUDIT_ROW_HEADER], ...a.exceptions.map(rowCells));
  lines.push([], ['SECTION 4: FULL AUDIT TRAIL', `${a.rows.length} payments`], [...AUDIT_ROW_HEADER], ...a.rows.map(rowCells));
  return `﻿${lines.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

export const auditFileName = (day: number): string => `processcraft-day-${day}-audit-report.csv`;
