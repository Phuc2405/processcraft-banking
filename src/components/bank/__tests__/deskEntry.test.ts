import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AUTOMATED_NODES, HUMAN_NODES } from '../../../sim/nodeKind';
import { buildTaskCase, deskEntry, isAutomatedDesk, isExceptionCase, ROLE_STATION, STAFF_ROLES, taskDeck, type StaffRoleId } from '../../../sim/staffRoleplay';
import { EMPTY_SHIFT } from '../../../store/bankStore';
import { analystWorkspaceMessages, type AnalystWorkspaceKey } from '../analystWorkspace.messages';
import { AnalystWorkspaceView, DeskKindBadge, type AnalystWorkspaceViewProps } from '../AnalystWorkspaceModal';
import { DeskEntryButton } from '../Inspector';

const msgs = analystWorkspaceMessages.messages;
const tr =
  (locale: 'en' | 'vi') =>
  (key: AnalystWorkspaceKey, values?: Record<string, string | number>): string => {
    let text: string = msgs[key][locale];
    for (const [name, v] of Object.entries(values ?? {})) text = text.split(`{${name}}`).join(String(v));
    return text;
  };
const en = tr('en');
const vi = tr('vi');
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const AUTOMATED: readonly StaffRoleId[] = ['ekyc', 'fds', 'swift'];
const HUMAN: readonly StaffRoleId[] = ['aml', 'dispute', 'bnpl', 'cashier'];

describe('desk type', () => {
  it('splits the seven desks into automated systems and staffed desks, as the map does', () => {
    expect(STAFF_ROLES.filter(isAutomatedDesk)).toEqual(AUTOMATED);
    expect(STAFF_ROLES.filter((r) => !isAutomatedDesk(r))).toEqual(HUMAN);
    for (const r of AUTOMATED) expect(AUTOMATED_NODES as readonly string[]).toContain(ROLE_STATION[r]);
    for (const r of HUMAN) expect(HUMAN_NODES as readonly string[]).toContain(ROLE_STATION[r]);
  });

  it('enters a human desk as a shift, and a system as monitoring until it holds flagged cases', () => {
    for (const r of HUMAN) for (const n of [0, 3]) expect(deskEntry(r, n)).toBe('roleplay');
    for (const r of AUTOMATED) {
      expect(deskEntry(r, 0)).toBe('monitor');
      expect(deskEntry(r, 2)).toBe('exceptions');
    }
  });

  it('counts a case as an exception when the right answer is to refuse it or a field breaches the SOP', () => {
    const fields = buildTaskCase('fds', 1, 0).fields.map((f) => ({ ...f, flag: false }));
    expect(isExceptionCase({ expected: 'APPROVE', fields })).toBe(false);
    expect(isExceptionCase({ expected: 'REJECT', fields })).toBe(true);
    expect(isExceptionCase({ expected: 'APPROVE', fields: [{ ...fields[0]!, flag: true }] })).toBe(true);
  });
});

describe('the desk entry button', () => {
  const html = (entry: Parameters<typeof DeskEntryButton>[0]['entry'], exceptions: number, ws = en) =>
    renderToStaticMarkup(createElement(DeskEntryButton, { entry, exceptions, disabled: false, onOpen: () => undefined, ws: ws as Parameters<typeof DeskEntryButton>[0]['ws'] }));

  it('keeps Enter Staff Roleplay on a human desk', () => {
    const out = html('roleplay', 0, vi);
    expect(out).toContain(esc(msgs.enterRoleplay.vi));
    expect(out).toContain('data-entry="roleplay"');
  });

  it('reads System Monitor on a quiet system, and Review Exception Cases with the count when it holds flagged cases', () => {
    expect(html('monitor', 0, vi)).toContain(esc(msgs.enterMonitor.vi));
    const out = html('exceptions', 3, vi);
    expect(out).toContain(esc(msgs.enterExceptions.vi));
    expect(out).toContain('data-testid="enter-roleplay-exceptions">3<');
    expect(out).toContain(esc(vi('enterExceptionsHint', { n: 3 })));
    expect(out).not.toContain(esc(msgs.enterRoleplay.vi));
  });
});

describe('the workspace sub-header badge', () => {
  it('names a system desk a server cluster and a human desk a staffed counter', () => {
    const m = vi as Parameters<typeof DeskKindBadge>[0]['m'];
    for (const r of AUTOMATED) expect(renderToStaticMarkup(createElement(DeskKindBadge, { role: r, m }))).toContain(esc(msgs.deskKindAutomated.vi));
    for (const r of HUMAN) expect(renderToStaticMarkup(createElement(DeskKindBadge, { role: r, m }))).toContain(esc(msgs.deskKindHuman.vi));
  });

  it('sits in the workspace header', () => {
    const handlers: Pick<AnalystWorkspaceViewProps, 'onClose' | 'onAdvance' | 'onDecide' | 'onTaskChange' | 'onSwitchRole'> = {
      onClose: () => undefined,
      onAdvance: () => undefined,
      onDecide: () => ({ result: { ok: false, packetId: '', decision: 'APPROVE' as const, expected: null, correct: false, statusCode: '' }, errors: 0 }),
      onTaskChange: () => undefined,
      onSwitchRole: () => undefined,
    };
    const out = renderToStaticMarkup(createElement(AnalystWorkspaceView, { desk: ROLE_STATION.swift, cases: taskDeck('swift', 1, 0, 4), shift: EMPTY_SHIFT, initialMode: 'standard', task: 1, canAdvance: true, ...handlers }));
    const header = out.slice(out.indexOf('<header'), out.indexOf('</header>'));
    expect(header).toContain('data-testid="workspace-desk-kind" data-automated="true"');
    expect(header).toContain(esc(msgs.deskKindAutomated.en));
  });
});
