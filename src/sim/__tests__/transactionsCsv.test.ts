import { describe, expect, it } from 'vitest';
import { BankSimulation } from '../bankSimulation';
import { DECLINE_REASONS, pct, pnl } from '../kpis';
import { approvalRateText, CHANNEL_TYPE, clockWithSeconds, reportCsv, transactionsCsv, transactionsFileName, TX_CSV_HEADER } from '../reportSummary';
import type { DayReport, TxRecord } from '../types';

/** A tiny CSV reader that understands quoted cells. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i] as string;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && src[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += c;
  }
  return rows;
}

function playDay(seed = 2026, day = 1): { sim: BankSimulation; report: DayReport; log: readonly TxRecord[] } {
  const sim = new BankSimulation({ seed, day, headless: true });
  const report = sim.runToEndOfDay();
  return { sim, report, log: sim.transactionLog() };
}

describe('the approval rate in the Day Report CSV', () => {
  it('is approved ÷ payments × 100 to one decimal, not multiplied twice', () => {
    expect(approvalRateText(862, 914)).toBe('94.3');
    expect(approvalRateText(0, 0)).toBe('0.0');
    expect(approvalRateText(5, 5)).toBe('100.0');
  });

  it('is written that way into the Operations section, with % as the unit', () => {
    const { report } = playDay();
    const row = parseCsv(reportCsv(report)).find((r) => r[0] === 'Operations' && r[1] === 'Approval rate');
    expect(row?.[2]).toBe(pct(report.kpis.approved, report.kpis.arrivals).toFixed(1));
    expect(row?.[3]).toBe('%');
    expect(Number(row?.[2])).toBeGreaterThan(0);
    expect(Number(row?.[2])).toBeLessThanOrEqual(100);
    expect(row?.[2]).toMatch(/^\d{1,3}\.\d$/);
  });
});

describe('the Master Transactions log', () => {
  it('has one record per customer payment that finished today, and the approvals and declines match the report', () => {
    const { report, log } = playDay();
    const k = report.kpis;
    expect(log.length).toBe(k.finished);
    expect(log.length).toBeGreaterThan(500);
    expect(log.filter((t) => t.status === 'APPROVED')).toHaveLength(k.approved);
    expect(log.filter((t) => t.status !== 'APPROVED')).toHaveLength(k.declined);
    expect(log.filter((t) => t.status === 'JAMMED')).toHaveLength(k.atm.jams);
    for (const reason of DECLINE_REASONS) expect(log.filter((t) => t.decline === reason), reason).toHaveLength(k.declines[reason]);
    expect(log.filter((t) => t.isFraud)).toHaveLength(k.fraudSlipped + k.fraudBlocked);
    expect(new Set(log.map((t) => t.txId)).size).toBe(log.length);
  });

  it('adds up to the revenue of the P&L (to within the rounding of each row)', () => {
    const { report, log } = playDay();
    const fees = log.reduce((n, t) => n + t.feeCents, 0);
    const earning = log.filter((t) => t.feeCents > 0).length;
    expect(Math.abs(fees - pnl(report.kpis).revenueCents)).toBeLessThanOrEqual(earning);
    for (const t of log) {
      if (t.status !== 'APPROVED' || t.isFraud || t.kind === 'ATM') expect(t.feeCents, t.txId).toBe(0);
    }
  });

  it('marks how each payment was reconciled overnight', () => {
    const { report, log } = playDay();
    const k = report.kpis;
    for (const t of log) {
      if (t.status === 'DECLINED') expect(t.recon, t.txId).toBe('N/A');
      if (t.status === 'APPROVED' && (t.kind === 'A2A' || t.kind === 'ATM')) expect(t.recon, t.txId).toBe('N/A');
      if (t.status === 'APPROVED' && t.kind !== 'A2A' && t.kind !== 'ATM') expect(['YES', 'NO', 'SUSPENDED'], t.txId).toContain(t.recon);
    }
    // Day 1 carries nothing from the night before, so every record the night team worked is one of today's payments.
    expect(log.filter((t) => t.recon === 'YES' && t.status === 'APPROVED')).toHaveLength(k.recon.matched);
    expect(log.filter((t) => t.recon === 'SUSPENDED' && t.status === 'APPROVED')).toHaveLength(k.recon.breakAmount + k.recon.breakMissing + k.recon.breakDuplicate);
    if (report.close.reconBacklog === 0) expect(log.filter((t) => t.recon === 'NO')).toHaveLength(0);
  });

  it('starts empty each day', () => {
    const { sim } = playDay();
    expect(sim.transactionLog().length).toBeGreaterThan(0);
    sim.nextDay();
    expect(sim.transactionLog()).toHaveLength(0);
  });
});

describe('the Master Transactions CSV', () => {
  it('has the standard columns, a BOM, CRLF lines and one row per payment, oldest first', () => {
    const { log } = playDay();
    const csv = transactionsCsv(log);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([...TX_CSV_HEADER]);
    expect(rows[0]?.slice(0, 9)).toEqual(['Timestamp', 'Transaction_ID', 'Channel_Type', 'Amount_AUD', 'Fee_Earned_AUD', 'Status', 'Decline_Reason', 'Is_Fraud', 'Overnight_Reconciled']);
    const body = rows.slice(1);
    expect(body).toHaveLength(log.length);
    for (const r of body) expect(r, r.join('|')).toHaveLength(TX_CSV_HEADER.length);
    const times = body.map((r) => r[0] as string);
    expect([...times].sort()).toEqual(times);
    // Arrivals are counted to the minute; the seconds are spread across it, the same way every time.
    expect(new Set(times.map((t) => t.slice(-2))).size).toBeGreaterThan(30);
    expect(transactionsCsv(playDay().log)).toBe(csv);
    expect(transactionsFileName(1)).toBe('processcraft-day-1-transactions.csv');
  });

  it('formats every field the way a bank file would', () => {
    const { log } = playDay();
    const body = parseCsv(transactionsCsv(log)).slice(1);
    for (const [time, id, channel, amount, fee, status, reason, fraud, recon] of body) {
      expect(time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(id).toMatch(/^TX-1\d{4}$/);
      expect(['CARD_PAYMENT', 'PAY_IN_4', 'INSTANT_A2A', 'ATM_WITHDRAWAL']).toContain(channel);
      expect(amount).toMatch(/^\d+\.\d{2}$/);
      expect(fee).toMatch(/^\d+\.\d{2}$/);
      expect(['APPROVED', 'DECLINED', 'JAMMED']).toContain(status);
      if (status === 'APPROVED') expect(reason).toBe('');
      else expect((DECLINE_REASONS as readonly string[]).includes(reason as string)).toBe(true);
      if (status === 'JAMMED') expect(reason).toBe('ATM_JAM');
      expect(['YES', 'NO']).toContain(fraud);
      expect(['YES', 'NO', 'SUSPENDED', 'N/A']).toContain(recon);
    }
    const amounts = body.reduce((n, r) => n + Math.round(Number(r[3]) * 100), 0);
    expect(amounts).toBe(log.reduce((n, t) => n + t.amountCents, 0));
  });

  it('maps every channel to a standard channel type', () => {
    expect(CHANNEL_TYPE).toEqual({ POS: 'CARD_PAYMENT', ECOM: 'CARD_PAYMENT', VIRTUAL: 'CARD_PAYMENT', BNPL: 'PAY_IN_4', A2A: 'INSTANT_A2A', ATM: 'ATM_WITHDRAWAL' });
  });

  it('writes the time of day with seconds', () => {
    expect(clockWithSeconds(8 * 60 + 14 + 22 / 60)).toBe('08:14:22');
    expect(clockWithSeconds(23 * 60 + 59.999)).toBe('24:00:00');
    expect(clockWithSeconds(9 * 60)).toBe('09:00:00');
  });

  it('is quick: a whole day’s file takes a moment, and only when asked for', () => {
    const { log } = playDay();
    const t = performance.now();
    transactionsCsv(log);
    expect(performance.now() - t).toBeLessThan(200);
  });
});
