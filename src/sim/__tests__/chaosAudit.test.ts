import { describe, expect, it } from 'vitest';
import {
  BOT_AMOUNT_CENTS,
  CHAOS_TOGGLE_IDS,
  cleanChaos,
  congestionOutcome,
  CONGESTION_TIMEOUT_RATE,
  INQUIRY_RECOVERY_RATE,
  MAX_MISAPPROVAL_CHANCE,
  misApprovalChance,
  NO_CHAOS,
  scenarioForDay,
} from '../../engine/chaos';
import { isBalanced } from '../../engine/ledger';
import { AUDIT_ROW_HEADER, auditCsv, auditFileName, buildAudit, flagsFor, HIGH_VALUE_CENTS } from '../audit';
import { AML_THRESHOLD_CENTS, isBotBurst, sarProblems, sarReference, scanForAml, SAR_MIN_NARRATIVE, VELOCITY_MIN_COUNT } from '../amlMonitor';
import { BankSimulation } from '../bankSimulation';
import { BOT_SCENARIO_ID } from '../scenarios';
import type { TxRecord } from '../types';

const tx = (over: Partial<TxRecord>): TxRecord => ({
  id: 'd1-0001',
  txId: 'TX-10001',
  minute: 600,
  kind: 'ECOM',
  cardType: 'DEBIT',
  scenario: 'ecom-normal',
  amountCents: 4_500,
  feeCents: 0,
  status: 'APPROVED',
  decline: null,
  isFraud: false,
  recon: 'YES',
  ...over,
});

describe('Chaos Monkey rules', () => {
  it('scripts the flash sale on day 2 and the botnet on day 3, only when scripted days are on', () => {
    expect(scenarioForDay(1, true)).toBe('NONE');
    expect(scenarioForDay(2, true)).toBe('FLASH_SURGE');
    expect(scenarioForDay(3, true)).toBe('BOTNET');
    expect(scenarioForDay(4, true)).toBe('NONE');
    expect(scenarioForDay(2, false)).toBe('NONE');
    expect(scenarioForDay(3, false)).toBe('NONE');
  });

  it('turns two draws into a 504 outcome', () => {
    expect(congestionOutcome(CONGESTION_TIMEOUT_RATE, 0)).toBe('CLEAR');
    expect(congestionOutcome(0, INQUIRY_RECOVERY_RATE - 0.01)).toBe('RECOVERED');
    expect(congestionOutcome(0, INQUIRY_RECOVERY_RATE)).toBe('TIMED_OUT');
  });

  it('only lets a tired analyst wave a bot through, and caps the chance', () => {
    expect(misApprovalChance(0)).toBe(0);
    expect(misApprovalChance(70)).toBe(0);
    expect(misApprovalChance(85)).toBeCloseTo(MAX_MISAPPROVAL_CHANCE / 2, 5);
    expect(misApprovalChance(100)).toBe(MAX_MISAPPROVAL_CHANCE);
    expect(misApprovalChance(250)).toBe(MAX_MISAPPROVAL_CHANCE);
    expect(misApprovalChance(Number.NaN)).toBe(0);
  });

  it('cleans a stored config to booleans', () => {
    expect(cleanChaos(null)).toEqual(NO_CHAOS);
    expect(cleanChaos({ posOutage: true, hsmFailure: 'yes', congestion: 1, fatigueSpike: true, scriptedDays: true })).toEqual({ posOutage: true, hsmFailure: false, congestion: false, fatigueSpike: true, scriptedDays: true });
    expect(CHAOS_TOGGLE_IDS).toHaveLength(4);
  });
});

describe('Chaos Monkey in the simulation', () => {
  it('day 2 brings a 3x flash sale with 504 timeouts and status inquiries', () => {
    const sim = new BankSimulation({ seed: 11, day: 2, headless: true, chaos: { scriptedDays: true } });
    sim.runToEndOfDay();
    const { stats, scenario } = sim.chaosView();
    expect(scenario).toBe('FLASH_SURGE');
    expect(stats.surgeCustomers).toBeGreaterThan(0);
    expect(stats.timeouts504).toBeGreaterThan(0);
    expect(stats.inquiriesRecovered + stats.inquiriesFailed).toBe(stats.timeouts504);
    expect(stats.inquiriesRecovered).toBeGreaterThan(stats.inquiriesFailed);
    const failed = sim.transactionLog().filter((t) => t.chaos === 'TIMEOUT_504');
    expect(failed.length).toBe(stats.inquiriesFailed);
    expect(failed.every((t) => t.status === 'DECLINED' && t.responseCode === '68')).toBe(true);
  });

  it('day 3 brings a $1 botnet, mis-approvals by tired analysts and velocity alerts', () => {
    const sim = new BankSimulation({ seed: 11, day: 3, headless: true, chaos: { scriptedDays: true } });
    sim.runToEndOfDay();
    const { stats, scenario } = sim.chaosView();
    expect(scenario).toBe('BOTNET');
    expect(stats.botAttempts).toBeGreaterThan(0);
    expect(stats.botBlocked + stats.botApproved).toBe(stats.botAttempts);
    expect(stats.velocityAlerts).toBeGreaterThan(0);
    const bots = sim.transactionLog().filter((t) => t.scenario === BOT_SCENARIO_ID);
    expect(bots.length).toBe(stats.botAttempts);
    expect(bots.every((t) => t.amountCents === BOT_AMOUNT_CENTS && t.isFraud)).toBe(true);
    expect(bots.filter((t) => t.chaos === 'MISAPPROVED').length).toBe(stats.misApprovals);
  });

  it('the POS outage declines terminal payments with RC 91, and nothing else changes when it is off', () => {
    const quiet = new BankSimulation({ seed: 5, day: 1, headless: true });
    quiet.runToEndOfDay();
    expect(quiet.chaosView().active).toBe(false);
    expect(quiet.transactionLog().some((t) => t.chaos !== undefined)).toBe(false);

    const sim = new BankSimulation({ seed: 5, day: 1, headless: true, chaos: { posOutage: true } });
    sim.runToEndOfDay();
    const hit = sim.transactionLog().filter((t) => t.chaos === 'POS_OUTAGE');
    expect(hit.length).toBe(sim.chaosView().stats.posOutageDeclines);
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.every((t) => t.kind === 'POS' && t.status === 'DECLINED' && t.responseCode === '91')).toBe(true);
  });

  it('the 3DS HSM failure declines card-not-present payments with RC 96', () => {
    const sim = new BankSimulation({ seed: 5, day: 1, headless: true, chaos: { hsmFailure: true } });
    sim.runToEndOfDay();
    const hit = sim.transactionLog().filter((t) => t.chaos === 'HSM_FAILURE');
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.every((t) => (t.kind === 'ECOM' || t.kind === 'VIRTUAL' || t.kind === 'BNPL') && t.responseCode === '96')).toBe(true);
  });

  it('the same seed and chaos give the same day', () => {
    const run = (): string => {
      const sim = new BankSimulation({ seed: 21, day: 3, headless: true, chaos: { scriptedDays: true, congestion: true } });
      sim.runToEndOfDay();
      return JSON.stringify(sim.chaosView().stats);
    };
    expect(run()).toBe(run());
  });
});

describe('Disputes from the ledger', () => {
  it('reverses 2110 to 2010 once, keeps the books balanced, and counts it', () => {
    const sim = new BankSimulation({ seed: 3, day: 1, headless: true });
    sim.stepUntil(14 * 60);
    const card = sim.ledgerEntries.find((e) => e.creditAccount === 'CARD_CLEARING_PAYABLE');
    expect(card).toBeDefined();
    const base = card!.txId;
    const owed = sim.ledgerEntries.filter((e) => e.txId === base && e.creditAccount === 'CARD_CLEARING_PAYABLE').reduce((n, e) => n + e.amount, 0);
    const result = sim.disputeTransaction(base);
    expect(result).toEqual({ ok: true, amountCents: owed, reason: null, txId: `${base}-CB` });
    const reversal = sim.ledgerEntries.filter((e) => e.txId === `${base}-CB`);
    expect(reversal).toHaveLength(1);
    expect(reversal[0]).toMatchObject({ debitAccount: 'CARD_CLEARING_PAYABLE', creditAccount: 'CUST_CASA', amount: owed });
    expect(isBalanced(sim.ledgerEntries)).toBe(true);
    expect(sim.isDisputed(base)).toBe(true);
    expect(sim.disputeTransaction(base).reason).toBe('ALREADY_DISPUTED');
    expect(sim.disputeTransaction('nope').reason).toBe('UNKNOWN');
    expect(sim.snapshot().kpis.disputesRaised).toBe(1);
  });
});

describe('AML monitor', () => {
  it('flags payments over $10,000 and nothing at or under it', () => {
    const alerts = scanForAml([tx({ id: 'd1-0001', amountCents: AML_THRESHOLD_CENTS }), tx({ id: 'd1-0002', kind: 'A2A', amountCents: AML_THRESHOLD_CENTS + 1 })]);
    expect(alerts.map((a) => a.id)).toEqual(['LV-d1-0002']);
    expect(alerts[0]).toMatchObject({ kind: 'LARGE_VALUE', count: 1, approved: 1 });
  });

  it('flags a burst of small card-not-present payments inside one 5-minute window', () => {
    const burst = Array.from({ length: VELOCITY_MIN_COUNT }, (_, i) => tx({ id: `d3-${4001 + i}`, minute: 915 + i * 0.4, amountCents: 100, scenario: BOT_SCENARIO_ID, isFraud: true, status: 'DECLINED' }));
    const alerts = scanForAml(burst);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'VELOCITY_BURST', id: 'VB-d3-1515', count: VELOCITY_MIN_COUNT, approved: 0 });
    expect(isBotBurst(alerts[0]!, burst)).toBe(true);
    expect(scanForAml(burst.slice(1))).toHaveLength(0);
  });

  it('checks a SAR before filing and gives it a regulator reference', () => {
    const draft = { alertId: 'VB-d3-1515', subject: '', activity: 'CARD_TESTING' as const, narrative: 'short', noTipOff: false };
    expect(sarProblems(draft)).toEqual(['SUBJECT', 'NARRATIVE', 'TIP_OFF']);
    expect(sarProblems({ ...draft, subject: 'Botnet', narrative: 'x'.repeat(SAR_MIN_NARRATIVE), noTipOff: true })).toEqual([]);
    expect(sarReference('VB-d3-1515', 3)).toBe('SMR-2026-D3-VB1515');
    expect(sarReference('LV-d1-9001', 1)).toBe('SMR-2026-D1-LV9001');
  });
});

describe('End-of-day audit report', () => {
  it('flags what an auditor samples', () => {
    expect(flagsFor(tx({ isFraud: true }), new Set())).toEqual(['FRAUD_APPROVED']);
    expect(flagsFor(tx({ status: 'DECLINED', decline: 'TIMEOUT', chaos: 'TIMEOUT_504' }), new Set())).toEqual(expect.arrayContaining(['CHAOS_DECLINE', 'TIMEOUT']));
    expect(flagsFor(tx({ chaos: 'MISAPPROVED', isFraud: true }), new Set())).toEqual(expect.arrayContaining(['FRAUD_APPROVED', 'BOT', 'MISAPPROVED']));
    expect(flagsFor(tx({ amountCents: HIGH_VALUE_CENTS }), new Set(['d1-0001']))).toEqual(['DISPUTED', 'HIGH_VALUE']);
  });

  it('builds a balanced, four-section CSV from a played day', () => {
    const sim = new BankSimulation({ seed: 9, day: 3, headless: true, chaos: { scriptedDays: true } });
    const report = sim.runToEndOfDay();
    const audit = buildAudit(report, sim.transactionLog(), sim.ledgerEntries, sim.chaosView());
    expect(audit.summary.payments).toBe(sim.transactionLog().length);
    expect(audit.summary.approved + audit.summary.declined).toBeLessThanOrEqual(audit.summary.payments);
    expect(audit.summary.ledgerBalanced).toBe(true);
    expect(audit.summary.totalDebitsCents).toBe(audit.summary.totalCreditsCents);
    expect(audit.rows).toHaveLength(sim.transactionLog().length);
    expect(audit.exceptions.length).toBeGreaterThan(0);
    const csv = auditCsv(audit);
    expect(csv.startsWith('﻿')).toBe(true);
    for (const section of ['SECTION 1', 'SECTION 2', 'SECTION 3', 'SECTION 4']) expect(csv).toContain(section);
    expect(csv).toContain(AUDIT_ROW_HEADER.join(','));
    expect(auditFileName(3)).toBe('processcraft-day-3-audit-report.csv');
  });
});
