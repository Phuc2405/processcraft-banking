import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DECLINE_GLOSSARY } from '../../../data/reportGlossary';
import { buildRetailCase, buildTaskCase, GL_ACCOUNTS, gradeTaskCase, openingLedger, RETAIL_TASK, ROLE_STATION, STAFF_DRILLS, STAFF_ROLES, type StaffDecision } from '../../../sim/staffRoleplay';
import { createBankStore } from '../../../store/bankStore';
import { bundleProblems } from '../../../utils/i18nHelper';
import { analystWorkspaceMessages } from '../analystWorkspace.messages';
import { AuditExportDialog, AuditReport, CoreLedgerSheet, dragScrollTo, nextZoom, PREVIEW_ZOOMS } from '../AnalystWorkspaceModal';
import { codeGlossaryMessages } from '../codeGlossary.messages';
import { codesIn, explainCode, glossText, glPlain, lineRaises, lineText } from '../codeGlossary';

const msgs = analystWorkspaceMessages.messages;
const g = codeGlossaryMessages.messages;
type Key = keyof typeof msgs;
const en = ((key: Key, values?: Record<string, string | number>): string => {
  let text: string = msgs[key].en;
  for (const [name, v] of Object.entries(values ?? {})) text = text.split(`{${name}}`).join(String(v));
  return text;
}) as Parameters<typeof AuditReport>[0]['m'];
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const AT = new Date('2026-10-27T12:00:00.000Z');

/** Every status code a desk decision can stamp: both answers on every drill and every retail scenario. */
function everyStatusCode(): Set<string> {
  const codes = new Set<string>(Object.keys(DECLINE_GLOSSARY));
  const decisions: StaffDecision[] = ['APPROVE', 'REJECT'];
  for (const role of STAFF_ROLES) {
    for (let seq = 0; seq < 40; seq++) {
      const cases = [...STAFF_DRILLS.map((d) => buildTaskCase(role, d, seq)), buildRetailCase(role, seq)];
      for (const c of cases) for (const d of decisions) codes.add(gradeTaskCase(c, d).statusCode);
    }
  }
  return codes;
}

/** Decisions at the dispute desk (memo-only refunds) and the SWIFT desk (wires that post Dr/Cr legs). */
function mixedLog() {
  const store = createBankStore({ storage: null, seed: 2026, incidentRandom: () => 1, now: () => AT });
  const work = (role: (typeof STAFF_ROLES)[number], task: Parameters<typeof buildTaskCase>[1], n: number): void => {
    store.getState().openStaffDesk(ROLE_STATION[role]);
    store.getState().setStaffTask(task);
    for (let i = 0; i < n; i++) {
      const seq = store.getState().staffTaskSeq;
      const head = task === RETAIL_TASK ? buildRetailCase(role, seq) : buildTaskCase(role, task, seq);
      store.getState().staffTrain(head.id, head.expected, 4, 30);
    }
  };
  work('dispute', RETAIL_TASK, 2);
  work('swift', 2, 3);
  return store.getState().auditLog;
}

describe('the code glossary', () => {
  it('passes the bundle checks', () => {
    expect(bundleProblems(codeGlossaryMessages)).toEqual([]);
  });

  it('explains every desk, every status code a decision can stamp and every GL account, in both languages', () => {
    for (const station of Object.values(ROLE_STATION)) expect(`desk_${station}` in g, station).toBe(true);
    const missing = [...everyStatusCode()].filter((code) => !(`status_${code}` in g));
    expect(missing).toEqual([]);
    for (const a of GL_ACCOUNTS) expect(`glPlain_${a.id}` in g, a.id).toBe(true);
  });

  it('gives the meanings the desks quote', () => {
    expect(explainCode('DISPUTE_DESK', 'vi')).toBe('Quầy Xử lý Tra soát & Tranh chấp Giao dịch');
    expect(explainCode('DISPUTE_REFUNDED', 'vi')).toBe('Đã hoàn tiền tra soát cho khách hàng thành công');
    expect(explainCode('CTR', 'vi')).toBe('Báo cáo giao dịch tiền mặt giá trị lớn (> $10,000)');
    expect(explainCode('STR', 'vi')).toBe('Báo cáo giao dịch nghi vấn rửa tiền / chia nhỏ khoản tiền');
    expect(explainCode('pacs.008', 'en')).toBe(g.term_PACS008.en);
    expect(explainCode('NOT_A_CODE', 'en')).toBeUndefined();
  });

  it('finds the codes inside a sentence, once each, and ignores words it does not know', () => {
    expect(codesIn('Held as STR_PENDING? File an STR, then a CTR. STR again.', 'en').map((c) => c.code)).toEqual(['STR', 'CTR']);
    expect(glossText('Every pacs.008 needs a valid BIC', 'en')).toBe(`pacs.008: ${g.term_PACS008.en}\nBIC: ${g.term_BIC.en}`);
    expect(glossText('A plain sentence', 'en')).toBeUndefined();
  });

  it('describes a journal line by whether it raises or lowers its account', () => {
    expect(lineRaises({ gl: 'CASA', dr: 100, cr: 0 })).toBe(false);
    expect(lineRaises({ gl: 'CASA', dr: 0, cr: 100 })).toBe(true);
    expect(lineRaises({ gl: 'ATM_CASH', dr: 100, cr: 0 })).toBe(true);
    expect(lineRaises({ gl: 'REWARDS_EXPENSE', dr: 100, cr: 0 })).toBe(true);
    expect(lineText({ gl: 'CASA', dr: 100, cr: 0 }, 'vi')).toBe(`${glPlain('CASA', 'vi')} ↓ giảm`);
  });
});

describe('Basic and Advanced views of the audit report', () => {
  const log = mixedLog();

  it('Advanced keeps the raw codes on one unbroken line, with their meaning on hover', () => {
    const out = renderToStaticMarkup(createElement(AuditReport, { log, m: en, issued: AT, view: 'advanced' }));
    const table = out.slice(out.lastIndexOf('<table', out.indexOf('data-testid="audit-table"')));
    expect(table).not.toContain('break-all');
    expect(table).toMatch(/table-auto/);
    expect(table).toContain(`<span class="whitespace-nowrap cursor-help " title="${esc(`DISPUTE_DESK: ${g.desk_DISPUTE_DESK.en}`)}" data-code="DISPUTE_DESK">DISPUTE_DESK</span>`);
    expect(table).toMatch(/whitespace-nowrap" title="Case ID: /);
    expect(table).toMatch(/>(Dr|Cr) \d{4}</);
  });

  it('Basic swaps desk IDs, status codes and Dr/Cr legs for plain words', () => {
    const out = renderToStaticMarkup(createElement(AuditReport, { log, m: en, issued: AT, view: 'basic' }));
    const table = out.slice(out.lastIndexOf('<table', out.indexOf('data-testid="audit-table"')));
    expect(out).toContain('data-view="basic"');
    expect(table).toContain(esc(g.desk_DISPUTE_DESK.en));
    expect(table).not.toContain('>DISPUTE_DESK<');
    expect(table).not.toMatch(/>(Dr|Cr) \d{4}</);
    expect(table).toMatch(/↑ increases|↓ decreases/);
  });

  it('opens in Basic view with a zoom toolbar over the preview', () => {
    const out = renderToStaticMarkup(createElement(AuditExportDialog, { log, m: en, onClose: () => undefined, issued: AT }));
    expect(out).toContain('data-testid="workspace-audit-view" data-view="basic"');
    expect(out).toContain('data-testid="workspace-audit-zoom" data-zoom="1"');
    for (const key of ['zoomOut', 'zoomIn'] as const) expect(out).toContain(esc(g[key].en));
    expect(out).toContain('🔍 100%');
    expect(out).toMatch(/transform:scale\(1\)/);
    expect(renderToStaticMarkup(createElement(AuditExportDialog, { log, m: en, onClose: () => undefined, issued: AT, initialView: 'advanced' }))).toContain('data-view="advanced"');
  });

  it('zooms in steps from 75% to 150% and stops at both ends', () => {
    expect(PREVIEW_ZOOMS[0]).toBe(0.75);
    expect(PREVIEW_ZOOMS[PREVIEW_ZOOMS.length - 1]).toBe(1.5);
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(1, -1)).toBe(0.9);
    expect(nextZoom(0.75, -1)).toBe(0.75);
    expect(nextZoom(1.5, 1)).toBe(1.5);
  });
});

describe('Select and Pan pointer modes of the audit preview', () => {
  it('opens in Select mode, with selectable text and the Pan option beside the zoom controls', () => {
    const out = renderToStaticMarkup(createElement(AuditExportDialog, { log: [], m: en, onClose: () => undefined, issued: AT }));
    expect(out).toContain('data-testid="workspace-audit-pointer" data-mode="select"');
    for (const key of ['pointerSelect', 'pointerPan'] as const) expect(out).toContain(esc(g[key].en));
    expect(out).toMatch(/aria-checked="true"[^>]*data-testid="workspace-audit-pointer-select"/);
    const preview = out.slice(out.lastIndexOf('<div', out.indexOf('data-testid="workspace-audit-preview"')));
    expect(preview).toMatch(/^<div class="bk-scroll [^"]*select-text"/);
    expect(preview).not.toContain('cursor-grab');
    const controls = out.slice(out.indexOf('data-testid="workspace-audit-controls"'));
    expect(controls.indexOf('workspace-audit-pointer')).toBeLessThan(controls.indexOf('workspace-audit-zoom'));
  });

  it('moves the scroll offset opposite to the drag, in both directions on both axes', () => {
    const from = { x: 100, y: 100, left: 300, top: 400 };
    expect(dragScrollTo(from, 160, 70)).toEqual({ left: 240, top: 430 });
    expect(dragScrollTo(from, 40, 180)).toEqual({ left: 360, top: 320 });
    expect(dragScrollTo(from, 100, 100)).toEqual({ left: 300, top: 400 });
  });
});

describe('Basic and Advanced views of the core ledger', () => {
  const sheet = (initialView: 'basic' | 'advanced') => renderToStaticMarkup(createElement(CoreLedgerSheet, { ledger: openingLedger(), m: en, onClose: () => undefined, onReset: () => undefined, initialView }));

  it('Basic names accounts in plain words and hides GL numbers; Advanced shows them', () => {
    const basic = sheet('basic');
    const nostro = basic.slice(basic.indexOf('data-gl="NOSTRO"'), basic.indexOf('</li>', basic.indexOf('data-gl="NOSTRO"')));
    expect(nostro).toContain(esc(g.glPlain_NOSTRO.en));
    expect(nostro).not.toContain('>1520<');
    const adv = sheet('advanced');
    const nostroAdv = adv.slice(adv.indexOf('data-gl="NOSTRO"'), adv.indexOf('</li>', adv.indexOf('data-gl="NOSTRO"')));
    expect(nostroAdv).toContain('>1520<');
    expect(nostroAdv).toContain(esc(msgs.gl_NOSTRO.en));
    expect(basic).toContain('data-testid="workspace-ledger-view"');
  });
});
