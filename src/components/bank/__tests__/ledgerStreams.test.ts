import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { analystWorkspaceMessages, type AnalystWorkspaceKey } from '../analystWorkspace.messages';
import { AuditExportDialog, auditCsv, auditSummary, CoreLedgerSheet, type SystemLedger } from '../AnalystWorkspaceModal';
import { openingLedger } from '../../../sim/staffRoleplay';
import { showsPlayer, showsSystem, simStamp, streamCounts, systemAuditTrail } from '../../../sim/ledgerStreams';
import { memoryStorage } from '../../../store/bankPersistence';
import { createBankStore } from '../../../store/bankStore';

const msgs = analystWorkspaceMessages.messages;
const en = ((key: AnalystWorkspaceKey, values?: Record<string, string | number>): string => {
  let text: string = msgs[key].en;
  for (const [name, v] of Object.entries(values ?? {})) text = text.split(`{${name}}`).join(String(v));
  return text;
}) as Parameters<typeof CoreLedgerSheet>[0]['m'];

/** A bank played to `minute`, its system ledger as the workspace reads it. */
function bankAt(minute: number) {
  const store = createBankStore({ storage: memoryStorage(), seed: 2026 });
  store.setState({ playing: true });
  while (store.getState().view.minute < minute) store.getState().tickBeat();
  const v = store.getState().view;
  const system: SystemLedger = { recent: v.ledger.recent, lines: v.ledger.lines, totalDebits: v.ledger.trial.totalDebits, totalCredits: v.ledger.trial.totalCredits, at: simStamp(v.day, v.minute) };
  return { store, system };
}

describe('the two streams: the system’s own traffic and the player’s postings', () => {
  it('filters All, Automated and Player only', () => {
    expect([showsSystem('all'), showsPlayer('all')]).toEqual([true, true]);
    expect([showsSystem('system'), showsPlayer('system')]).toEqual([true, false]);
    expect([showsSystem('player'), showsPlayer('player')]).toEqual([false, true]);
    expect(streamCounts(40, 3)).toEqual({ all: 43, system: 40, player: 3 });
    expect(simStamp(3, 14 * 60 + 5.5)).toBe('D3 14:05:30');
  });

  it('keeps the system stream to the bank’s clock now: nothing finished after it, and more as the day goes on', () => {
    const { store } = bankAt(12 * 60);
    const sim = store.getState().sim;
    const now = systemAuditTrail(sim.transactionLog(), 1, 12 * 60);
    expect(now.length).toBeGreaterThan(0);
    expect(now.every((r) => r.minute <= 12 * 60)).toBe(true);
    expect(systemAuditTrail(sim.transactionLog(), 1, 10 * 60).length).toBeLessThan(now.length);
    // The system ledger moves on with every beat, with no action of the player's.
    const before = store.getState().view.ledger.lines;
    store.getState().tickBeat();
    expect(store.getState().view.ledger.lines).toBeGreaterThan(before);
  });
});

describe('the core ledger sheet’s filter', () => {
  const sheet = (stream: 'all' | 'system' | 'player', system: SystemLedger | null) => renderToStaticMarkup(createElement(CoreLedgerSheet, { ledger: openingLedger(), m: en, onClose: () => undefined, onReset: () => undefined, system, initialStream: stream }));

  it('keeps the balance sheet in every mode, and filters only the entries beside it', () => {
    const { system } = bankAt(11 * 60);
    for (const stream of ['all', 'system', 'player'] as const) {
      const out = sheet(stream, system);
      // The same balance sheet, left, whatever the filter.
      for (const side of ['asset', 'liability']) expect(out, stream).toContain(`data-testid="ledger-side-${side}"`);
      expect(out).toContain('data-testid="ledger-balanced"');
      expect(out).toContain('data-testid="ledger-net"');
      expect(out).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]');
      expect(out).toContain(`data-stream="${stream}"`);
    }
    const all = sheet('all', system);
    expect(all).toContain('data-testid="workspace-ledger-stream"');
    expect(all).toContain('data-source="player"');
    expect(all).toContain('data-testid="ledger-system"');
    const sys = sheet('system', system);
    expect(sys).toContain('data-testid="ledger-system-journal"');
    expect(sys).not.toContain('data-source="player"');
    expect(sys).toContain(en('ledgerSystemTitle', { at: system.at }));
    const player = sheet('player', system);
    expect(player).toContain('data-source="player"');
    expect(player).not.toContain('data-testid="ledger-system"');
    // Without a system stream (a test, a saved view) the sheet is the player's, with no filter.
    expect(sheet('all', null)).not.toContain('workspace-ledger-stream');
  });
});

describe('the audit trail export’s filter', () => {
  const dialog = (stream: 'all' | 'system' | 'player') => {
    const { store } = bankAt(10 * 60);
    const rows = systemAuditTrail(store.getState().sim.transactionLog(), 1, 10 * 60);
    return { rows, html: renderToStaticMarkup(createElement(AuditExportDialog, { log: [], m: en, onClose: () => undefined, system: rows, systemAt: 'D1 10:00:00', initialStream: stream })) };
  };

  it('adds the System Automated Audit Trail up to now, with each decision’s metadata, unless Player only', () => {
    const all = dialog('all');
    expect(all.html).toContain('data-testid="workspace-audit-stream"');
    expect(all.html).toContain('data-testid="audit-system-table"');
    expect(all.html).toContain(en('rptSystemTitle', { at: 'D1 10:00:00' }).replace(/&/g, '&amp;'));
    const first = all.rows[0]!;
    for (const v of [first.txId, first.engine, first.code, first.responseCode]) expect(all.html).toContain(v);
    expect(dialog('player').html).not.toContain('data-testid="audit-system"');
  });

  it('turns each payment into an automated decision: who decided, the action code, and whether the rules held', () => {
    const { rows } = dialog('all');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(['AUTO_APPROVE', 'AUTO_REJECT', 'AUTO_HOLD']).toContain(r.code);
      expect({ AUTO_APPROVE: 'APPROVE', AUTO_REJECT: 'REJECT', AUTO_HOLD: 'FREEZE' }[r.code]).toBe(r.action);
      expect(r.engine).toMatch(/^[A-Z0-9_]+$/);
    }
    const fraud = systemAuditTrail([{ id: 'd1-1', txId: 'TX-11', minute: 600, kind: 'ECOM', cardType: 'DEBIT', scenario: '', amountCents: 100, feeCents: 0, status: 'APPROVED', decline: null, isFraud: true, recon: 'N/A' } as never], 1, 700)[0]!;
    // A fraud the engine let through is a breach of the bank's rules.
    expect(fraud).toMatchObject({ code: 'AUTO_APPROVE', engine: 'GATE_ECOM', compliance: 'SOP_BREACH' });
  });

  it('sums Section II over the stream shown: the player’s decisions, the system’s, or both', () => {
    const { rows } = dialog('all');
    const system = auditSummary([], rows);
    expect(system.total).toBe(rows.length);
    expect(system.actions.APPROVE).toBe(rows.filter((r) => r.action === 'APPROVE').length);
    expect(system.actions.REJECT + system.actions.FREEZE + system.actions.APPROVE).toBe(rows.length);
    expect(system.compliance.COMPLIANT + system.compliance.SOP_BREACH).toBe(rows.length);
    // Player only: none of the system's.
    expect(auditSummary([]).total).toBe(0);
    const html = (stream: 'all' | 'system' | 'player') => dialog(stream).html;
    const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const approve = (out: string): number => Number(out.split(`title="${esc(en('dseAction_approve'))}: `)[1]?.split('"')[0]);
    expect(approve(html('system'))).toBe(system.actions.APPROVE);
    expect(approve(html('player'))).toBe(0);
    expect(approve(html('all'))).toBe(system.actions.APPROVE);
  });

  it('exports a Source column with the system’s rows, and the player-only CSV exactly as before', () => {
    const { rows } = dialog('all');
    const withSystem = auditCsv([], en, rows).split('\r\n');
    expect(withSystem[0]!.endsWith(`,${en('auditColSource')}`)).toBe(true);
    expect(withSystem).toHaveLength(rows.length + 1);
    expect(withSystem[1]!.endsWith(`,${en('auditSourceSystem')}`)).toBe(true);
    expect(auditCsv([], en)).not.toContain(en('auditColSource'));
  });
});

describe('naming and counting the automated stream', () => {
  it('calls the system stream Automated, robot and all, in the filter and the CSV', () => {
    expect(msgs.streamSystem).toEqual({ en: '🤖 Automated', vi: '🤖 Tự động' });
    expect(msgs.auditSourceSystem.en).toBe('🤖 Automated');
    for (const key of Object.keys(msgs) as AnalystWorkspaceKey[]) expect(msgs[key].en, key).not.toMatch(/System only/);
  });

  it('says in Section I how many decisions are recorded, and whose', () => {
    const { store } = bankAt(10 * 60);
    const rows = systemAuditTrail(store.getState().sim.transactionLog(), 1, 10 * 60);
    const report = (stream: 'all' | 'system' | 'player') => renderToStaticMarkup(createElement(AuditExportDialog, { log: [], m: en, onClose: () => undefined, system: rows, systemAt: 'D1 10:00:00', initialStream: stream }));
    const n = rows.length;
    expect(report('all')).toContain(en('rptEntriesAll', { n, a: n, u: 0 }));
    expect(en('rptEntriesAll', { n: 147, a: 146, u: 1 })).toBe('Decisions recorded: 147 (Automated: 146, User: 1)');
    expect(report('system')).toContain(en('rptEntriesAuto', { n, a: n }));
    expect(report('player')).toContain(en('rptEntriesUser', { n: 0, u: 0 }));
  });
});

describe('the reset', () => {
  it('erases only what the player posted by hand, never the system’s simulation ledger', () => {
    const { store } = bankAt(11 * 60);
    const lines = store.getState().view.ledger.lines;
    const trial = store.getState().view.ledger.trial;
    store.getState().resetRetailLedger();
    expect(store.getState().auditLog).toEqual([]);
    expect(store.getState().retailLedger.posted).toBe(0);
    expect(store.getState().view.ledger.lines).toBe(lines);
    expect(store.getState().view.ledger.trial).toEqual(trial);
    expect(msgs.ledgerResetWarning.vi).toContain('không làm ảnh hưởng đến dữ liệu sổ cái giả lập tự động của hệ thống');
  });
});
