import { describe, expect, it } from 'vitest';
import { BankSimulation } from '../bankSimulation';
import { churnFor, closeBook, openingBook, signupsFor, STARTING_CUSTOMERS, STARTING_RESERVES_CENTS } from '../bankBook';
import { DECLINE_REASONS, pnl } from '../kpis';
import { CSV_HEADER, DECLINE_GROUPS, declineGroups, pnlLines, reportCsv, reportFileName, revenueVsLosses, signedMoney, takeaway, topDrain } from '../reportSummary';
import { sumReports, simulateDay } from '../whatIf';
import type { DayReport } from '../types';

const day1 = (): DayReport => simulateDay({ seed: 2026, day: 1, rules: {}, cover: {} });

/** A tiny CSV reader that understands quoted cells, for checking the export. */
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

describe('the bank’s running books', () => {
  it('opens day 1 with $100,000.00 in reserves and the starting customer base', () => {
    const r = day1();
    expect(r.book).toBeDefined();
    expect(r.book?.reservesStartCents).toBe(STARTING_RESERVES_CENTS);
    expect(r.book?.reservesEndCents).toBe(STARTING_RESERVES_CENTS + pnl(r.kpis).netCents);
    expect(r.book?.customersStart).toBe(STARTING_CUSTOMERS);
    expect(r.book?.churned).toBe(r.kpis.frictionLostCount);
    expect(r.book?.signups).toBe(signupsFor(r.kpis));
    expect(r.book?.customersEnd).toBe(STARTING_CUSTOMERS + signupsFor(r.kpis) - churnFor(r.kpis));
  });

  it('carries the reserves and customers from one day into the next, and across a reload', () => {
    const sim = new BankSimulation({ seed: 2026, day: 1, headless: true });
    const reports: DayReport[] = [];
    for (let d = 0; d < 4; d++) {
      reports.push(sim.runToEndOfDay());
      sim.nextDay();
    }
    for (let i = 1; i < reports.length; i++) {
      expect(reports[i]?.book?.reservesStartCents).toBe(reports[i - 1]?.book?.reservesEndCents);
      expect(reports[i]?.book?.customersStart).toBe(reports[i - 1]?.book?.customersEnd);
    }
    const reloaded = new BankSimulation({ seed: 2026, day: 5, history: reports, headless: true }).runToEndOfDay();
    expect(reloaded.book?.reservesStartCents).toBe(reports[3]?.book?.reservesEndCents);
  });

  it('rebuilds the opening books from an older saved report that has none', () => {
    const r = day1();
    const { book: _drop, ...old } = r;
    const opening = openingBook(old as DayReport, (x) => pnl(x.kpis).netCents);
    expect(opening.reservesCents).toBe(r.book?.reservesEndCents);
    expect(opening.customers).toBe(r.book?.customersEnd);
    expect(openingBook(undefined, () => 0)).toEqual({ reservesCents: STARTING_RESERVES_CENTS, customers: STARTING_CUSTOMERS });
    expect(closeBook({ reservesCents: 0, customers: 3 }, { ...r.kpis, approved: 0, frictionLostCount: 99 }, -5).customersEnd).toBe(0);
  });

  it('adds several days up into one book in the what-if comparison', () => {
    const sim = new BankSimulation({ seed: 7, day: 1, headless: true });
    const a = sim.runToEndOfDay();
    sim.nextDay();
    const b = sim.runToEndOfDay();
    const sum = sumReports([a, b]);
    expect(sum.book?.reservesStartCents).toBe(a.book?.reservesStartCents);
    expect(sum.book?.reservesEndCents).toBe(b.book?.reservesEndCents);
    expect(sum.book?.signups).toBe((a.book?.signups ?? 0) + (b.book?.signups ?? 0));
  });
});

describe('the overview', () => {
  it('splits the P&L into revenue and losses that add up to the day’s result', () => {
    const r = day1();
    const bal = revenueVsLosses(r);
    expect(bal.revenueCents - bal.lossCents).toBe(pnl(r.kpis).netCents);
    expect(bal.netCents).toBe(pnl(r.kpis).netCents);
    expect(pnlLines(r).at(-1)).toMatchObject({ label: 'Day result', kind: 'net', cents: pnl(r.kpis).netCents });
  });

  it('names the biggest loss as the top revenue drain', () => {
    const r = day1();
    const drain = topDrain(r);
    const losses = pnlLines(r).filter((l) => l.kind === 'loss');
    expect(drain?.cents).toBe(Math.max(...losses.map((l) => l.cents)));
    expect(drain?.share).toBeGreaterThan(0);
    expect(drain?.share).toBeLessThanOrEqual(1);
    const clean = { ...r, kpis: { ...r.kpis, fraudLossCents: 0, frictionLostCount: 0, suspenseClearedItems: 0, coverCostCents: 0, bnpl: { ...r.kpis.bnpl, expectedLossCents: 0 }, recon: { ...r.kpis.recon, leakageCents: 0 } } };
    expect(topDrain(clean)).toBeNull();
  });

  it('puts every decline reason in exactly one group, and the groups add up to all declines', () => {
    const seen = DECLINE_GROUPS.flatMap((g) => g.reasons);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual([...DECLINE_REASONS].sort());
    const r = day1();
    const groups = declineGroups(r);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(DECLINE_REASONS.reduce((n, reason) => n + r.kpis.declines[reason], 0));
    expect(groups.reduce((n, g) => n + g.share, 0)).toBeCloseTo(1, 9);
  });

  it('leads with the costliest problem and links it to its chapter (fraud → Chapter 2)', () => {
    const r = day1();
    const fraud = { ...r, kpis: { ...r.kpis, fraudSlipped: 7, fraudLossCents: 624_000 } };
    const t = takeaway(fraud);
    expect(t.process).toBe('B');
    expect(t.text).toBe('7 fraud payments slipped through, costing $6,240.00. Consider tightening the 3DS risk thresholds before Day 2.');
  });

  it('writes money with its sign', () => {
    expect(signedMoney(-453_166)).toBe('-$4,531.66');
    expect(signedMoney(120_000)).toBe('+$1,200.00');
  });
});

describe('the CSV export', () => {
  it('has a header, a byte-order mark, CRLF lines and five cells on every row', () => {
    const r = day1();
    const csv = reportCsv(r);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([...CSV_HEADER]);
    for (const row of rows) expect(row, row.join('|')).toHaveLength(5);
    expect(reportFileName(r)).toBe('processcraft-day-1-report.csv');
  });

  it('contains every P&L line, every decline reason of the day and the operational stats, matching the report', () => {
    const r = day1();
    const rows = parseCsv(reportCsv(r));
    const find = (section: string, item: string): string[] | undefined => rows.find((row) => row[0] === section && row[1] === item);
    for (const l of pnlLines(r)) {
      const row = find('Profit & loss', l.label);
      expect(row, l.label).toBeDefined();
      expect(Number(row?.[2])).toBeCloseTo((l.kind === 'loss' ? -l.cents : l.cents) / 100, 2);
    }
    expect(Number(find('Profit & loss', 'Day result')?.[2])).toBeCloseTo(pnl(r.kpis).netCents / 100, 2);
    const declined = DECLINE_REASONS.filter((reason) => r.kpis.declines[reason] > 0);
    expect(rows.filter((row) => row[0] === 'Declines')).toHaveLength(declined.length);
    expect(Number(find('Operations', 'Payments')?.[2])).toBe(r.kpis.arrivals);
    expect(Number(find('Capital', 'Reserves at end of day')?.[2])).toBeCloseTo((r.book?.reservesEndCents ?? 0) / 100, 2);
    expect(Number(find('Customers', 'Churned (friction or false declines)')?.[2])).toBe(r.kpis.frictionLostCount);
    expect(rows.filter((row) => row[0] === 'Night shift').length).toBeGreaterThan(3);
    expect(find('Takeaway', 'Recommendation')?.[2]).toBe(takeaway(r).text);
  });

  it('quotes cells that contain commas, quotes or line breaks', () => {
    const r = day1();
    const odd = { ...r, event: { ...r.event, title: 'Sale, "big" one', blurb: 'line one\nline two' } };
    const rows = parseCsv(reportCsv(odd));
    expect(rows.find((row) => row[1] === 'Event')).toEqual(['Report', 'Event', 'Sale, "big" one', '', 'line one\nline two']);
  });
});
