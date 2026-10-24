import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setActiveLocale } from '../../../i18n/locale';
import {
  buildTaskCase,
  gradeTaskCase,
  RANDOM_TASK,
  ROLE_STATION,
  STAFF_DRILLS,
  STAFF_ROLES,
  STAFF_SCENES,
  STAFF_TASKS,
  TASK_SCENES,
  taskDeck,
  type StaffDecisionResult,
} from '../../../sim/staffRoleplay';
import { createBankStore, EMPTY_SHIFT } from '../../../store/bankStore';
import { bundleProblems, hasVietnamese } from '../../../utils/i18nHelper';
import { analystWorkspaceMessages, PERSONAS, type AnalystWorkspaceKey } from '../analystWorkspace.messages';
import { AnalystWorkspaceView, ConsequenceOverlay, consequenceKey, personaFor, sopKeys, SwitchDeskDialog, type AnalystWorkspaceViewProps, type WorkspaceMode } from '../AnalystWorkspaceModal';

const msgs = analystWorkspaceMessages.messages;
const has = (key: string): boolean => key in msgs;
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

afterEach(() => setActiveLocale('en'));

describe('workspace copy covers every role, scene, field and mode', () => {
  it('passes the bundle checks', () => {
    expect(bundleProblems(analystWorkspaceMessages)).toEqual([]);
  });

  it('has a story and a Standard and Expert trigger for every scene', () => {
    for (const scene of [...STAFF_SCENES, ...TASK_SCENES]) for (const part of ['story', 'triggerStd', 'triggerExp']) expect(has(`scene_${scene}_${part}`), `${scene} ${part}`).toBe(true);
  });

  it('has briefs, a regulatory reference, all 4 task titles and SOPs and the risk/benefit triple in both modes for every role', () => {
    for (const role of STAFF_ROLES) {
      for (const key of [`role_${role}_title`, `role_${role}_brief`, `role_${role}_briefStd`, `role_${role}_reg`]) expect(has(key), key).toBe(true);
      for (const task of STAFF_TASKS) {
        expect(has(`task_${role}_${task}_title`), `${role} task ${task}`).toBe(true);
        for (const key of sopKeys(role, task)) expect(has(key), key).toBe(true);
      }
      expect(sopKeys(role, RANDOM_TASK)).toHaveLength(3);
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

  it('labels every field and value a task case can show', () => {
    for (const role of STAFF_ROLES)
      for (const task of STAFF_TASKS)
        for (const c of taskDeck(role, task, 0, 12))
          for (const f of c.fields) {
            expect(has(`field_${f.key}`), f.key).toBe(true);
            if (f.value.t === 'msg') expect(has(`val_${f.value.key}`), f.value.key).toBe(true);
          }
  });

  it('keeps the switch-desk copy exactly as specified', () => {
    expect(msgs.switchTitle).toEqual({ en: 'Switch Desk?', vi: 'Chuyển quầy làm việc?' });
    expect(msgs.switchMessage.vi).toBe('Chuyển sang quầy mới sẽ kết thúc ca hiện tại và đặt lại tiến trình về Nhiệm vụ 1. Bạn có chắc chắn muốn chuyển?');
    expect(msgs.switchCancel).toEqual({ en: 'Cancel', vi: 'Hủy' });
    expect(msgs.switchConfirm).toEqual({ en: 'Confirm Switch', vi: 'Xác nhận chuyển' });
  });

  it('explains the benefit when right and the risk taken when wrong', () => {
    const r = (decision: 'APPROVE' | 'REJECT', correct: boolean): StaffDecisionResult => ({ ok: true, packetId: 'x', decision, expected: correct ? decision : decision === 'APPROVE' ? 'REJECT' : 'APPROVE', correct, statusCode: 'X' });
    expect(consequenceKey({ role: 'aml', result: r('APPROVE', true) }, 'standard')).toBe('risk_aml_benefitStd');
    expect(consequenceKey({ role: 'aml', result: r('APPROVE', false) }, 'expert')).toBe('risk_aml_approveExp');
    expect(consequenceKey({ role: 'fds', result: r('REJECT', false) }, 'standard')).toBe('risk_fds_rejectStd');
  });
});

describe('the 28-task matrix', () => {
  it('builds stable, English-only cases for all 7 roles × 4 tasks, mixing breaches and clean cases', () => {
    for (const role of STAFF_ROLES)
      for (const task of STAFF_TASKS) {
        const deck = taskDeck(role, task, 0, 40);
        expect(taskDeck(role, task, 0, 40)).toEqual(deck);
        expect(new Set(deck.map((c) => c.id)).size).toBe(40);
        expect(new Set(deck.map((c) => c.expected)).size, `${role} ${task}`).toBe(2);
        for (const c of deck) {
          expect(c.role).toBe(role);
          expect(c.station).toBe(ROLE_STATION[role]);
          if (task !== RANDOM_TASK) expect(c.drill).toBe(task);
          expect(c.scene).toBe(`task_${role}_${c.drill}`);
          expect(hasVietnamese(JSON.stringify(c))).toBe(false);
        }
        if (task === RANDOM_TASK) expect(new Set(deck.map((c) => c.drill))).toEqual(new Set(STAFF_DRILLS));
      }
  });

  it('flags a breach exactly on the cases the SOP rejects', () => {
    for (const role of STAFF_ROLES)
      for (const c of taskDeck(role, RANDOM_TASK, 0, 60)) {
        const flagged = c.fields.some((f) => f.flag);
        expect(flagged, c.id).toBe(c.expected === 'REJECT');
      }
  });

  it('grades a decision against the SOP with a drill-specific status code', () => {
    const c = taskDeck('fds', 2, 0, 30).find((x) => x.expected === 'REJECT')!;
    expect(gradeTaskCase(c, 'REJECT')).toMatchObject({ ok: true, correct: true, statusCode: 'FDS_BIN_ATTACK' });
    expect(gradeTaskCase(c, 'APPROVE')).toMatchObject({ correct: false, statusCode: 'FDS_CLEAR' });
  });

  it('switches tasks instantly, guards desk switches behind the store action and books training on the shift', () => {
    const store = createBankStore({ storage: null, seed: 2026 });
    store.getState().openStaffDesk(ROLE_STATION.aml);
    expect(store.getState().staffTask).toBe(1);
    const head = buildTaskCase('aml', 1, 0);
    const r = store.getState().staffTrain(head.id, head.expected, 4, 30);
    expect(r.correct).toBe(true);
    expect(store.getState().staffShift.aml).toMatchObject({ reviews: 1, correct: 1, xp: 100 });
    expect(store.getState().staffTaskSeq).toBe(1);
    expect(store.getState().staffTrain(head.id, 'APPROVE', 1, 30).ok).toBe(false);

    store.getState().setStaffTask(3);
    expect(store.getState()).toMatchObject({ staffTask: 3, staffTaskSeq: 0, staffDesk: ROLE_STATION.aml });
    expect(store.getState().staffShift.aml?.reviews).toBe(1);

    store.getState().switchStaffDesk(ROLE_STATION.swift);
    expect(store.getState()).toMatchObject({ staffDesk: ROLE_STATION.swift, staffTask: 1, staffTaskSeq: 0, staffShift: {} });
    store.getState().closeStaffDesk();
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

const handlers: Pick<AnalystWorkspaceViewProps, 'onClose' | 'onAdvance' | 'onDecide' | 'onTaskChange' | 'onSwitchRole'> = {
  onClose: () => undefined,
  onAdvance: () => undefined,
  onDecide: () => ({ result: { ok: false, packetId: '', decision: 'APPROVE' as const, expected: null, correct: false, statusCode: '' }, errors: 0 }),
  onTaskChange: () => undefined,
  onSwitchRole: () => undefined,
};

describe('the task workspace on screen', () => {
  const view = (role: (typeof STAFF_ROLES)[number], task: (typeof STAFF_TASKS)[number]): string =>
    renderToStaticMarkup(createElement(AnalystWorkspaceView, { desk: ROLE_STATION[role], cases: taskDeck(role, task, 0), shift: EMPTY_SHIFT, initialMode: 'standard', task, canAdvance: true, ...handlers }));

  it('draws the desk and task pickers, the task card and its SOP for every role and task', () => {
    for (const role of STAFF_ROLES)
      for (const task of STAFF_TASKS) {
        const out = view(role, task);
        for (const id of ['workspace-role-select', 'workspace-task-select', 'workspace-task', 'workspace-sop', 'workspace-scenario', 'workspace-language', 'workspace-mode']) expect(out, `${role} ${task} ${id}`).toContain(`data-testid="${id}"`);
        expect(out).toContain(`data-task="${task}"`);
        for (const key of sopKeys(role, task)) expect(out).toContain(esc(msgs[key].en));
        expect(out.includes('data-testid="workspace-drill"')).toBe(task === RANDOM_TASK);
        expect(out).not.toContain('data-testid="workspace-switch-dialog"');
      }
  });

  it('lists all 7 desks and all 4 tasks in the pickers, in Vietnamese too', () => {
    setActiveLocale('vi');
    const out = view('cashier', 2);
    for (const role of STAFF_ROLES) expect(out).toContain(esc(msgs[`role_${role}_title` as AnalystWorkspaceKey].vi));
    for (const task of STAFF_TASKS) expect(out).toContain(esc(`Nhiệm vụ ${task}: ${msgs[`task_cashier_${task}_title` as AnalystWorkspaceKey].vi}`));
    expect(out).toContain(esc(msgs.scene_task_cashier_2_triggerStd.vi));
  });

  it('renders the switch guard with both actions in each language', () => {
    const m = (lang: 'en' | 'vi') => (key: AnalystWorkspaceKey, values?: Record<string, string | number>): string => {
      let text: string = msgs[key][lang];
      for (const [k, v] of Object.entries(values ?? {})) text = text.replace(`{${k}}`, String(v));
      return text;
    };
    for (const lang of ['en', 'vi'] as const) {
      const out = renderToStaticMarkup(createElement(SwitchDeskDialog, { target: 'swift', m: m(lang), onCancel: () => undefined, onConfirm: () => undefined }));
      for (const key of ['switchTitle', 'switchMessage', 'switchCancel', 'switchConfirm'] as const) expect(out).toContain(esc(msgs[key][lang]));
      expect(out).toContain('data-testid="workspace-switch-confirm"');
    }
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
        task: 1,
        canAdvance: true,
        ...handlers,
      }),
    );
  };

  it('draws the mode toggle, the SOP label and the 4-part scenario card in Standard mode', () => {
    initialMode = 'standard';
    const out = html();
    for (const id of ['workspace-language', 'workspace-language-en', 'workspace-language-vi', 'workspace-mode-standard', 'workspace-mode-expert', 'workspace-sop-title', 'workspace-sop-note', 'workspace-persona', 'workspace-trigger', 'workspace-fields', 'workspace-risk', 'workspace-shift']) expect(out, id).toContain(`data-testid="${id}"`);
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
