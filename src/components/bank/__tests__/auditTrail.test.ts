import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildTaskCase, EMPTY_TALLY, RETAIL_TASK, ROLE_STATION, taskDeck, WIRE_FEE_CENTS } from '../../../sim/staffRoleplay';
import { AUDIT_LOG_CAP, auditActionOf, complianceOf, createBankStore, EMPTY_SHIFT, type AuditEntry } from '../../../store/bankStore';
import { analystWorkspaceMessages } from '../analystWorkspace.messages';
import {
  AnalystWorkspaceView,
  AUDIT_CSV_COLUMNS,
  AUDIT_DISCLAIMER,
  auditCsv,
  AuditExportDialog,
  AuditReport,
  auditReportNo,
  auditSummary,
  ChallengeScorecard,
  ledgerEntryCode,
  nfc,
  type AnalystWorkspaceViewProps,
} from '../AnalystWorkspaceModal';

const msgs = analystWorkspaceMessages.messages;
type Key = keyof typeof msgs;
const tr =
  (locale: 'en' | 'vi') =>
  (key: Key, values?: Record<string, string | number>): string => {
    let text: string = msgs[key][locale];
    for (const [name, v] of Object.entries(values ?? {})) text = text.split(`{${name}}`).join(String(v));
    return text;
  };
const en = tr('en') as Parameters<typeof AuditReport>[0]['m'];
const vi = tr('vi') as Parameters<typeof AuditReport>[0]['m'];
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Midday UTC, so the local date is the 27th in every time zone a CI runner uses.
const AT = new Date('2026-10-27T12:00:00.000Z');

/** A store with a fixed clock and no incidents, at `desk`, after deciding `n` cases of `task` (each with its own verdict, or `wrong`). */
function worked(role: Parameters<typeof buildTaskCase>[0], task: Parameters<typeof buildTaskCase>[1], n: number, opts: { wrong?: boolean; latency?: number } = {}) {
  const store = createBankStore({ storage: null, seed: 2026, incidentRandom: () => 1, now: () => AT });
  store.getState().openStaffDesk(ROLE_STATION[role]);
  store.getState().setStaffTask(task);
  for (let i = 0; i < n; i++) {
    const head = buildTaskCase(role, task, store.getState().staffTaskSeq);
    const d = opts.wrong ? (head.expected === 'APPROVE' ? 'REJECT' : 'APPROVE') : head.expected;
    store.getState().staffTrain(head.id, d, opts.latency ?? 4, 30);
  }
  return store;
}

describe('the audit trail in the store', () => {
  it('records every training decision with time, desk, case, action, SLA, journal and compliance', () => {
    const store = worked('swift', 2, 3);
    const log = store.getState().auditLog;
    expect(log.map((e) => e.seq)).toEqual([1, 2, 3]);
    const first = log[0]!;
    const head = buildTaskCase('swift', 2, 0);
    expect(first).toMatchObject({ at: AT.toISOString(), station: 'GATE_SWIFT', role: 'swift', caseId: head.id, amountCents: head.amountCents, latencySec: 4, slaSec: 30, compliance: 'COMPLIANT', expert: false, assisted: false });
    if (first.action === 'APPROVE') expect(first.lines.find((l) => l.gl === 'WIRE_FEE_INCOME')?.cr).toBe(WIRE_FEE_CENTS);
  });

  it('marks freezes, SOP breaches and SLA breaches', () => {
    const freeze = worked('aml', 1, 12).getState().auditLog.filter((e) => e.action === 'FREEZE');
    expect(freeze.length).toBeGreaterThan(0);
    for (const e of freeze) expect(e.lines.some((l) => l.gl === 'FROZEN_ASSETS')).toBe(true);
    expect(worked('ekyc', 1, 3, { wrong: true }).getState().auditLog.every((e) => e.compliance === 'SOP_BREACH')).toBe(true);
    expect(worked('ekyc', 1, 3, { latency: 45 }).getState().auditLog.every((e) => e.compliance === 'SLA_BREACH')).toBe(true);
    expect(complianceOf(true, 30, 30)).toBe('COMPLIANT');
    expect(auditActionOf({ decision: 'REJECT', journal: undefined })).toBe('REJECT');
  });

  it('records retail and live-queue decisions too, and keeps at most AUDIT_LOG_CAP rows', () => {
    expect(worked('cashier', RETAIL_TASK, 2).getState().auditLog.every((e) => e.caseId.startsWith('RT-CASHIER-'))).toBe(true);
    const store = createBankStore({ storage: null, seed: 2026, incidentRandom: () => 1, now: () => AT });
    store.getState().openStaffDesk('BNPL');
    for (let guard = 0; guard < 400 && !store.getState().auditLog.length; guard++) {
      const head = (store.getState().pendingQueueMap.BNPL ?? [])[0];
      if (head) store.getState().staffDecide(head.id, head.expected, 5, 30);
      else store.getState().step();
    }
    expect(store.getState().auditLog[0]).toMatchObject({ station: 'BNPL', role: 'bnpl', compliance: 'COMPLIANT' });
    expect(AUDIT_LOG_CAP).toBeGreaterThanOrEqual(500);
  });
});

describe('the CSV export', () => {
  const log = (): AuditEntry[] => [...worked('swift', 2, 2).getState().auditLog, ...worked('dispute', RETAIL_TASK, 6).getState().auditLog.filter((e) => e.lines.length === 0).slice(0, 1)];

  it('writes the required columns in the current language, one CRLF row per decision', () => {
    const rows = auditCsv(log(), en).split('\r\n');
    expect(rows[0]).toBe('Timestamp,Channel/Desk ID,Case ID,Action taken,SLA time (s),SLA limit (s),Debit/Credit ledger entry,Amount,Status code,Compliance status');
    expect(rows).toHaveLength(log().length + 1);
    expect(auditCsv(log(), vi).split('\r\n')[0]).toBe(AUDIT_CSV_COLUMNS.map((key) => msgs[key].vi).join(','));
    const cells = rows[1]!.split(',');
    expect(cells[0]).toBe(AT.toISOString());
    expect(cells[1]).toBe('GATE_SWIFT');
    expect(cells[4]).toBe('4.0');
  });

  it('codes the Debit/Credit legs of every posting, and memo-only decisions', () => {
    const lines = [
      { gl: 'CASA' as const, dr: 10_000, cr: 0 },
      { gl: 'NOSTRO' as const, dr: 0, cr: 7_500 },
      { gl: 'WIRE_FEE_INCOME' as const, dr: 0, cr: 2_500 },
    ];
    expect(ledgerEntryCode(lines, 'MEMO')).toBe('Dr 2011 / Cr 1520 / Cr 4540');
    expect(ledgerEntryCode([], 'MEMO')).toBe('MEMO');
    expect(auditCsv(log(), en)).toContain(msgs.auditMemo.en);
  });

  it('quotes cells that need it', () => {
    const e = { ...log()[0]!, statusCode: 'A, "B"' };
    expect(auditCsv([e], en).split('\r\n')[1]).toContain('"A, ""B"""');
  });
});

describe('the printable audit report', () => {
  it('lays out the NHNN-style header, numbered sections, summary, detailed log and sign-off blocks', () => {
    const entries = [...worked('ekyc', 1, 2).getState().auditLog, ...worked('ekyc', 1, 1, { wrong: true }).getState().auditLog];
    const out = renderToStaticMarkup(createElement(AuditReport, { log: entries, m: vi, issued: AT }));
    for (const key of ['rptNation', 'rptMotto', 'rptTitle', 'rptSec1', 'rptSec2', 'rptSec3', 'rptSec4', 'rptPrepared', 'rptReviewed', 'rptHead'] as const) expect(out, key).toContain(esc(msgs[key].vi));
    expect(out).toContain(esc(vi('rptDate', { d: '27', mo: '10', y: 2026 })));
    expect(out).toContain(auditReportNo(entries, AT));
    expect(auditReportNo(entries, AT)).toBe('AT-20261027-0003');
    expect(out.match(/data-seq=/g)).toHaveLength(3);
    expect(out).toContain('data-compliance="SOP_BREACH"');
    expect(out).toContain(esc(vi('rptConclusionIssues', { n: 1 })));
    expect(auditSummary(entries)).toMatchObject({ total: 3, compliance: { COMPLIANT: 2, SLA_BREACH: 0, SOP_BREACH: 1 }, ratePct: 66.7 });
  });

  it('carries the one-line English simulation disclaimer under the regulatory reference, in both languages', () => {
    for (const m of [en, vi]) {
      const out = renderToStaticMarkup(createElement(AuditReport, { log: worked('ekyc', 1, 1).getState().auditLog, m, issued: AT }));
      expect(out).toContain(AUDIT_DISCLAIMER);
      expect(out.indexOf('data-testid="audit-disclaimer"')).toBeGreaterThan(out.indexOf(esc(m('rptBasis'))));
      expect(out.indexOf('data-testid="audit-disclaimer"')).toBeLessThan(out.indexOf(esc(m('rptSec1'))));
    }
  });

  it('prints in a system sans-serif with Vietnamese in Unicode Form C, so accents never split off their letters', () => {
    const decomposed = (key: Key, values?: Record<string, string | number>): string => vi(key, values).normalize('NFD');
    const out = renderToStaticMarkup(createElement(AuditReport, { log: worked('ekyc', 1, 1).getState().auditLog, m: decomposed as typeof vi, issued: AT }));
    expect(out).not.toMatch(/[\u0300-\u036f]/);
    expect(out).toContain(esc(msgs.rptSec3.vi.normalize('NFC')));
    expect(out).toMatch(/font-family:Arial, Helvetica, sans-serif/);
    expect(out).not.toContain('font-serif');
    expect(nfc('Khối'.normalize('NFD'))).toBe('Khối');
    expect(auditCsv(worked('ekyc', 1, 1).getState().auditLog, decomposed as typeof vi)).not.toMatch(/[\u0300-\u036f]/);
  });

  it('right-aligns the numeric columns of the detailed log and keeps each Dr/Cr leg on one line', () => {
    const out = renderToStaticMarkup(createElement(AuditReport, { log: worked('ekyc', 1, 1).getState().auditLog, m: en, issued: AT }));
    const table = out.slice(out.indexOf('data-testid="audit-table"'));
    expect(table.match(/<col /g)).toHaveLength(AUDIT_CSV_COLUMNS.length + 1);
    for (const key of ['auditColSla', 'auditColSlaLimit', 'auditColAmount'] as const) expect(table).toMatch(new RegExp(`text-right" title="[^"]*">${esc(msgs[key].en).replace(/[()]/g, '\\$&')}<`));
  });

  it('titles every log cell with its column and full value, for hover on truncated text', () => {
    const log = worked('ekyc', 1, 1).getState().auditLog;
    const out = renderToStaticMarkup(createElement(AuditReport, { log, m: en, issued: AT }));
    expect(out).toContain(`title="${esc(`${msgs.auditColCase.en}: ${log[0]!.caseId}`)}"`);
    expect(out).toContain(`title="${esc(`${msgs.auditColStatus.en}: ${log[0]!.statusCode}`)}"`);
    expect(out).toMatch(new RegExp(`title="${esc(msgs.auditColAmount.en)}: \\$`));
  });

  it('says so when every decision complied, and when there is nothing to report', () => {
    const ok = renderToStaticMarkup(createElement(AuditReport, { log: worked('ekyc', 1, 2).getState().auditLog, m: en, issued: AT }));
    expect(ok).toContain(esc(msgs.rptConclusionOk.en));
    const empty = renderToStaticMarkup(createElement(AuditReport, { log: [], m: en, issued: AT }));
    expect(empty).toContain(esc(msgs.auditEmpty.en));
    expect(auditSummary([])).toMatchObject({ total: 0, ratePct: 0, avgSlaSec: 0 });
  });
});

describe('the export actions', () => {
  const handlers: Pick<AnalystWorkspaceViewProps, 'onClose' | 'onAdvance' | 'onDecide' | 'onTaskChange' | 'onSwitchRole'> = {
    onClose: () => undefined,
    onAdvance: () => undefined,
    onDecide: () => ({ result: { ok: false, packetId: '', decision: 'APPROVE' as const, expected: null, correct: false, statusCode: '' }, errors: 0 }),
    onTaskChange: () => undefined,
    onSwitchRole: () => undefined,
  };

  it('puts Export audit log in the workspace header with the row count', () => {
    const auditLog = worked('ekyc', 1, 3).getState().auditLog;
    const out = renderToStaticMarkup(createElement(AnalystWorkspaceView, { desk: ROLE_STATION.ekyc, cases: taskDeck('ekyc', 1, 3, 4), shift: EMPTY_SHIFT, initialMode: 'standard', task: 1, canAdvance: true, auditLog, ...handlers }));
    const header = out.slice(out.indexOf('<header'), out.indexOf('</header>'));
    expect(header).toContain('data-testid="workspace-audit-open"');
    expect(header).toContain(esc(msgs.auditExport.en));
  });

  it('offers it on the shift completion scorecard', () => {
    const out = renderToStaticMarkup(createElement(ChallengeScorecard, { tally: EMPTY_TALLY, m: en, onAgain: () => undefined, onClose: () => undefined, onExport: () => undefined }));
    expect(out).toContain('data-testid="workspace-scorecard-export"');
    expect(renderToStaticMarkup(createElement(ChallengeScorecard, { tally: EMPTY_TALLY, m: en, onAgain: () => undefined, onClose: () => undefined }))).not.toContain('workspace-scorecard-export');
  });

  it('opens a dialog with the CSV and Print / PDF actions and a report preview', () => {
    const log = worked('ekyc', 1, 2).getState().auditLog;
    const out = renderToStaticMarkup(createElement(AuditExportDialog, { log, m: vi, onClose: () => undefined, issued: AT }));
    expect(out).toContain('data-testid="workspace-audit-csv"');
    expect(out).toContain('data-testid="workspace-audit-print"');
    expect(out).toContain(esc(msgs.auditCsv.vi));
    expect(out).toContain(esc(msgs.auditPrint.vi));
    expect(out).toContain('data-testid="audit-report"');
    expect(out).toContain('@media print');
    // The preview scrolls in its own capped viewport, inside a dialog that never outgrows the workspace.
    expect(out).toMatch(/class="bk-scroll [^"]*max-h-\[calc\(100vh-200px\)\][^"]*overflow-y-auto[^"]*"[^>]*data-testid="workspace-audit-preview"/);
    expect(out).toMatch(/class="flex max-h-full [^"]*" data-testid="workspace-audit"|data-testid="workspace-audit" class="flex max-h-full/);
    const none = renderToStaticMarkup(createElement(AuditExportDialog, { log: [], m: en, onClose: () => undefined, issued: AT }));
    expect(none).toMatch(/data-testid="workspace-audit-csv"[^>]*disabled=""|disabled=""[^>]*data-testid="workspace-audit-csv"/);
  });
});
