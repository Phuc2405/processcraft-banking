import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildRetailCase, buildTaskCase, RETAIL_TASK, ROLE_STATION, type StaffRoleId } from '../../../sim/staffRoleplay';
import { AUDIT_LOG_KEY, decodeAuditLog, memoryStorage, RETAIL_LEDGER_KEY } from '../../../store/bankPersistence';
import { AUDIT_LOG_CAP, createBankStore, recoverAuditLog } from '../../../store/bankStore';
import { analystWorkspaceMessages, type AnalystWorkspaceKey } from '../analystWorkspace.messages';
import { AuditExportDialog, AuditReport, auditScopeLog, auditSummary } from '../AnalystWorkspaceModal';

const msgs = analystWorkspaceMessages.messages;
const en = ((key: AnalystWorkspaceKey, values?: Record<string, string | number>): string => {
  let text: string = msgs[key].en;
  for (const [name, v] of Object.entries(values ?? {})) text = text.split(`{${name}}`).join(String(v));
  return text;
}) as Parameters<typeof AuditReport>[0]['m'];
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const AT = new Date('2026-10-27T12:00:00.000Z');

type Store = ReturnType<typeof createBankStore>;
const store = (storage = memoryStorage()): Store => createBankStore({ storage, seed: 2026, incidentRandom: () => 1, now: () => AT });

/** Decides `n` cases of `task` at `role`'s desk, each with its own verdict. */
function work(s: Store, role: StaffRoleId, task: Parameters<typeof buildTaskCase>[1], n: number): void {
  s.getState().openStaffDesk(ROLE_STATION[role]);
  s.getState().setStaffTask(task);
  for (let i = 0; i < n; i++) {
    const seq = s.getState().staffTaskSeq;
    const head = task === RETAIL_TASK ? buildRetailCase(role, seq) : buildTaskCase(role, task, seq);
    s.getState().staffTrain(head.id, head.expected, 3, 30);
  }
}

describe('the audit trail stays in step with the ledger', () => {
  it('writes an audit row, with the same time, for every journal a decision posts', () => {
    const s = store();
    work(s, 'swift', 2, 4);
    work(s, 'dispute', RETAIL_TASK, 4);
    const { retailLedger, auditLog } = s.getState();
    expect(retailLedger.posted).toBeGreaterThan(0);
    for (const j of retailLedger.journal) {
      const row = auditLog.find((e) => e.caseId === j.caseId);
      expect(row, j.caseId).toBeDefined();
      expect(row!.at).toBe(j.at);
      expect(row!.lines).toEqual(j.lines);
    }
    expect(auditLog).toHaveLength(8);
  });

  it('survives a reload like the ledger does, and the reload opens a new shift', () => {
    const storage = memoryStorage();
    const first = store(storage);
    work(first, 'swift', 2, 3);
    expect(first.getState().auditLog.every((e) => e.shift === 1)).toBe(true);
    const second = store(storage);
    expect(second.getState().auditLog.map((e) => e.caseId)).toEqual(first.getState().auditLog.map((e) => e.caseId));
    expect(second.getState().auditShift).toBe(2);
    work(second, 'swift', 2, 1);
    expect(second.getState().auditLog.at(-1)).toMatchObject({ seq: 4, shift: 2 });
  });

  it('starts a new shift when the learner switches desk', () => {
    const s = store();
    work(s, 'swift', 2, 1);
    s.getState().switchStaffDesk(ROLE_STATION.aml);
    expect(s.getState().auditShift).toBe(2);
  });

  it('rebuilds the rows of ledger journals saved before the trail was, marked restored and not graded', () => {
    const storage = memoryStorage();
    work(store(storage), 'swift', 2, 3);
    storage.removeItem(AUDIT_LOG_KEY);
    const reloaded = store(storage);
    const log = reloaded.getState().auditLog;
    const journal = reloaded.getState().retailLedger.journal;
    expect(log).toHaveLength(journal.length);
    expect(log.every((e) => e.compliance === 'UNVERIFIED' && e.shift === 0)).toBe(true);
    expect(log.map((e) => e.seq)).toEqual(log.map((_, i) => i + 1));
    expect(log.map((e) => e.caseId)).toEqual([...journal].reverse().map((j) => j.caseId));
    // Recovered once, then saved: a second reload does not duplicate them.
    expect(store(storage).getState().auditLog).toHaveLength(journal.length);
    expect(recoverAuditLog(log, { journal })).toHaveLength(log.length);
  });

  it('keeps restored rows out of the compliance rate and shows no timing for them', () => {
    const storage = memoryStorage();
    work(store(storage), 'swift', 2, 2);
    storage.removeItem(AUDIT_LOG_KEY);
    const s = store(storage);
    work(s, 'swift', 2, 1);
    const sum = auditSummary(s.getState().auditLog);
    expect(sum.compliance.UNVERIFIED).toBe(2);
    expect(sum.ratePct).toBe(100);
    const out = renderToStaticMarkup(createElement(AuditReport, { log: s.getState().auditLog, m: en, issued: AT }));
    expect(out).toContain(esc(msgs.auditCompliance_UNVERIFIED.en));
    expect(out).toContain('>—<');
  });

  it('drops a saved row that does not decode instead of guessing it', () => {
    const s = store();
    work(s, 'swift', 2, 1);
    const good = s.getState().auditLog[0]!;
    const raw = JSON.stringify([good, { ...good, role: 'nobody' }, { ...good, lines: [{ gl: 'CASA', dr: 5, cr: 0 }] }, 42]);
    expect(decodeAuditLog(raw, AUDIT_LOG_CAP)).toEqual([good]);
    expect(decodeAuditLog('not json', AUDIT_LOG_CAP)).toEqual([]);
    expect(RETAIL_LEDGER_KEY).not.toBe(AUDIT_LOG_KEY);
  });
});

describe('the report scope: Current Shift or All Shifts History', () => {
  const twoShifts = () => {
    const storage = memoryStorage();
    work(store(storage), 'swift', 2, 3);
    const s = store(storage);
    work(s, 'swift', 2, 2);
    return s.getState();
  };

  it('filters to the shift in progress, or covers every recorded decision', () => {
    const { auditLog, auditShift } = twoShifts();
    expect(auditScopeLog(auditLog, 'shift', auditShift)).toHaveLength(2);
    expect(auditScopeLog(auditLog, 'all', auditShift)).toHaveLength(5);
  });

  it('opens on the current shift, with both counts, and the whole history fills Sections II and III', () => {
    const { auditLog, auditShift } = twoShifts();
    const shiftView = renderToStaticMarkup(createElement(AuditExportDialog, { log: auditLog, m: en, onClose: () => undefined, issued: AT, shift: auditShift }));
    expect(shiftView).toContain('data-testid="workspace-audit-scope" data-scope="shift"');
    expect(shiftView).toContain(esc(msgs.auditScopeShift.en));
    expect(shiftView).toContain(esc(msgs.auditScopeAll.en));
    expect(shiftView.match(/data-seq=/g)).toHaveLength(2);
    const all = renderToStaticMarkup(createElement(AuditExportDialog, { log: auditLog, m: en, onClose: () => undefined, issued: AT, shift: auditShift, initialScope: 'all' }));
    expect(all.match(/data-seq=/g)).toHaveLength(5);
    expect(all).toContain(`data-entries="5"`);
  });

  it('opens on the whole history when the current shift has nothing yet, so the report is not blank', () => {
    const storage = memoryStorage();
    work(store(storage), 'swift', 2, 3);
    const { auditLog, auditShift } = store(storage).getState();
    const out = renderToStaticMarkup(createElement(AuditExportDialog, { log: auditLog, m: en, onClose: () => undefined, issued: AT, shift: auditShift }));
    expect(out).toContain('data-scope="all"');
    expect(out.match(/data-seq=/g)).toHaveLength(3);
    const empty = renderToStaticMarkup(createElement(AuditExportDialog, { log: auditLog, m: en, onClose: () => undefined, issued: AT, shift: auditShift, initialScope: 'shift' }));
    expect(empty).toContain(esc(en('auditScopeShiftEmpty', { n: 3 })));
  });
});
