import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setActiveLocale } from '../../../i18n/locale';
import { ROLE_STATION, STAFF_ROLES, STAFF_SCENES, type StaffDecisionResult } from '../../../sim/staffRoleplay';
import { createBankStore, EMPTY_SHIFT } from '../../../store/bankStore';
import { bundleProblems, hasVietnamese } from '../../../utils/i18nHelper';
import { analystWorkspaceMessages, PERSONAS, type AnalystWorkspaceKey } from '../analystWorkspace.messages';
import { AnalystWorkspaceView, ConsequenceOverlay, consequenceKey, personaFor, sopKeys, type WorkspaceMode } from '../AnalystWorkspaceModal';

const msgs = analystWorkspaceMessages.messages;
const has = (key: string): boolean => key in msgs;
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

afterEach(() => setActiveLocale('en'));

describe('workspace copy covers every role, scene, field and mode', () => {
  it('passes the bundle checks', () => {
    expect(bundleProblems(analystWorkspaceMessages)).toEqual([]);
  });

  it('has a story and a Standard and Expert trigger for every scene', () => {
    for (const scene of STAFF_SCENES) for (const part of ['story', 'triggerStd', 'triggerExp']) expect(has(`scene_${scene}_${part}`), `${scene} ${part}`).toBe(true);
  });

  it('has briefs, a regulatory reference, both SOP matrices and the risk/benefit triple in both modes for every role', () => {
    for (const role of STAFF_ROLES) {
      for (const key of [`role_${role}_title`, `role_${role}_brief`, `role_${role}_briefStd`, `role_${role}_reg`]) expect(has(key), key).toBe(true);
      for (const mode of ['standard', 'expert'] as const) for (const key of sopKeys(role, mode)) expect(has(key), key).toBe(true);
      for (const kind of ['approve', 'reject', 'benefit']) for (const s of ['Std', 'Exp']) expect(has(`risk_${role}_${kind}${s}`), `${role} ${kind}${s}`).toBe(true);
    }
  });

  it('gives every payload field a Standard and an Expert tooltip, and every persona a job', () => {
    const fields = Object.keys(msgs).filter((key) => key.startsWith('field_')).map((key) => key.slice('field_'.length));
    expect(fields.length).toBeGreaterThanOrEqual(30);
    for (const f of fields) for (const s of ['std', 'exp']) expect(has(`tip_${f}_${s}`), `${f} ${s}`).toBe(true);
    PERSONAS.forEach((p, i) => {
      expect(has(`persona_${i}_job`)).toBe(true);
      expect(hasVietnamese(p.name)).toBe(false);
    });
    expect(personaFor('tx-1')).toEqual(personaFor('tx-1'));
  });

  it('explains the benefit when right and the risk taken when wrong', () => {
    const r = (decision: 'APPROVE' | 'REJECT', correct: boolean): StaffDecisionResult => ({ ok: true, packetId: 'x', decision, expected: correct ? decision : decision === 'APPROVE' ? 'REJECT' : 'APPROVE', correct, statusCode: 'X' });
    expect(consequenceKey({ role: 'aml', result: r('APPROVE', true) }, 'standard')).toBe('risk_aml_benefitStd');
    expect(consequenceKey({ role: 'aml', result: r('APPROVE', false) }, 'expert')).toBe('risk_aml_approveExp');
    expect(consequenceKey({ role: 'fds', result: r('REJECT', false) }, 'standard')).toBe('risk_fds_rejectStd');
  });
});

describe('the consequence overlay', () => {
  const m = (key: AnalystWorkspaceKey, values?: Record<string, string | number>): string => {
    let text: string = msgs[key].en;
    for (const [k, v] of Object.entries(values ?? {})) text = text.replace(`{${k}}`, String(v));
    return text;
  };
  it('awards XP on a correct call and counts the error on a wrong one', () => {
    const ok = renderToStaticMarkup(createElement(ConsequenceOverlay, { consequence: { role: 'bnpl', errors: 0, result: { ok: true, packetId: 'p', decision: 'APPROVE', expected: 'APPROVE', correct: true, statusCode: 'BNPL_APPROVED' } }, mode: 'standard', m }));
    expect(ok).toContain('✅ ACCURATE CALL!');
    expect(ok).toContain('+100 XP');
    const bad = renderToStaticMarkup(createElement(ConsequenceOverlay, { consequence: { role: 'bnpl', errors: 2, result: { ok: true, packetId: 'p', decision: 'APPROVE', expected: 'REJECT', correct: false, statusCode: 'BNPL_APPROVED' } }, mode: 'expert', m }));
    expect(bad).toContain('❌ AGAINST THE SOP!');
    expect(bad).toContain('Error #2 this shift');
    expect(bad).toContain(esc(msgs.risk_bnpl_approveExp.en));
  });
});

describe('the workspace on screen', () => {
  const store = createBankStore({ storage: null, seed: 2026 });
  beforeAll(() => {
    store.getState().openStaffDesk(ROLE_STATION.bnpl);
    for (let i = 0; i < 400 && !(store.getState().pendingQueueMap.BNPL ?? []).length; i++) store.getState().step();
  });

  let initialMode: WorkspaceMode = 'standard';
  const html = (): string => {
    const s = store.getState();
    const cases = s.pendingQueueMap.BNPL ?? [];
    expect(cases.length).toBeGreaterThan(0);
    return renderToStaticMarkup(
      createElement(AnalystWorkspaceView, {
        desk: 'BNPL',
        cases,
        shift: EMPTY_SHIFT,
        initialMode,
        bnplMinScore: s.sim.rules.bnplMinScore,
        canAdvance: true,
        onClose: () => undefined,
        onAdvance: () => undefined,
        onDecide: () => ({ result: { ok: false, packetId: '', decision: 'APPROVE' as const, expected: null, correct: false, statusCode: '' }, errors: 0 }),
      }),
    );
  };

  it('draws the mode toggle, the SOP label and the 4-part scenario card in Standard mode', () => {
    initialMode = 'standard';
    const out = html();
    for (const id of ['workspace-mode-standard', 'workspace-mode-expert', 'workspace-sop-title', 'workspace-sop-note', 'workspace-persona', 'workspace-trigger', 'workspace-fields', 'workspace-risk', 'workspace-shift']) expect(out, id).toContain(`data-testid="${id}"`);
    expect(out).toContain('data-mode="standard"');
    expect(out).toContain(esc(msgs.sopTitle.en));
    expect(out).toContain(esc(msgs.scene_bnpl_apply_triggerStd.en));
    expect(out).toContain(esc(msgs.risk_bnpl_benefitStd.en));
    expect(out).not.toContain('data-testid="workspace-reg"');
  });

  it('switches to the Expert register with regulatory references', () => {
    initialMode = 'expert';
    const out = html();
    expect(out).toContain('data-mode="expert"');
    expect(out).toContain('data-testid="workspace-reg"');
    expect(out).toContain(esc(msgs.scene_bnpl_apply_triggerExp.en));
    expect(out).toContain(esc(msgs.risk_bnpl_approveExp.en));
  });

  it('draws the whole card in Vietnamese', () => {
    initialMode = 'standard';
    setActiveLocale('vi');
    const out = html();
    for (const key of ['triggerTitle', 'riskTitle', 'falseApproveTitle', 'falseRejectTitle', 'benefitTitle', 'sopTitle', 'sopNote'] as const) expect(out, key).toContain(esc(msgs[key].vi));
    expect(out).toContain(esc(msgs.scene_bnpl_apply_triggerStd.vi));
    expect(out).not.toContain(esc(msgs.riskTitle.en));
  });
});
