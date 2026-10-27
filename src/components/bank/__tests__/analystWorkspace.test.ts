import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setActiveLocale } from '../../../i18n/locale';
import {
  addToTally,
  buildTaskCase,
  CHALLENGE,
  CHALLENGE_GRADES,
  challengeBonus,
  challengeGrade,
  challengePoints,
  EMPTY_TALLY,
  gradeTaskCase,
  RANDOM_TASK,
  ROLE_STATION,
  STAFF_DRILLS,
  STAFF_ROLES,
  STAFF_SCENES,
  STAFF_TASKS,
  TASK_SCENES,
  taskDeck,
  DESK_INCIDENTS,
  GLOBAL_INCIDENTS,
  INCIDENT,
  INCIDENT_DRILL,
  INCIDENT_IDS,
  incidentClockRate,
  incidentRole,
  incidentSlaSeconds,
  maskedFields,
  rollIncident,
  startIncident,
  BADGE_RULES,
  BADGES,
  CAREER_RANKS,
  careerStanding,
  EMPTY_CAREER,
  recordCareerDecision,
  type CareerDecision,
  type CareerProgress,
  type StaffDecisionResult,
} from '../../../sim/staffRoleplay';
import { CAREER_KEY, decodeCareer, memoryStorage } from '../../../store/bankPersistence';
import { createBankStore, EMPTY_SHIFT } from '../../../store/bankStore';
import { bundleProblems, hasVietnamese } from '../../../utils/i18nHelper';
import { analystWorkspaceMessages, PERSONAS, type AnalystWorkspaceKey } from '../analystWorkspace.messages';
import { AnalystWorkspaceView, BadgeDrawer, BadgeUnlockModal, CareerCard, ChallengeScorecard, MASK, clockText, ConsequenceOverlay, consequenceKey, SOP_STEPS, personaFor, riskKey, sopKeys, SwitchDeskDialog, type AnalystWorkspaceViewProps, type WorkspaceMode } from '../AnalystWorkspaceModal';

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

  it('gives every drill the same 3-step procedure in both registers and its own risk & benefit cards', () => {
    for (const role of STAFF_ROLES) {
      for (const drill of STAFF_DRILLS) {
        const std = sopKeys(role, drill, 'standard');
        const exp = sopKeys(role, drill, 'expert');
        expect(std).toHaveLength(SOP_STEPS);
        expect(exp).toHaveLength(SOP_STEPS);
        expect(std.map((key) => key.replace('_sopStd_', '_step_'))).toEqual(exp.map((key) => key.replace('_sopExp_', '_step_')));
        for (const key of [...std, ...exp]) expect(has(key), key).toBe(true);
        std.forEach((key, i) => expect(msgs[key].en, key).not.toBe(msgs[exp[i]!].en));
        for (const kind of ['approve', 'reject', 'benefit'] as const)
          for (const mode of ['standard', 'expert'] as const) expect(has(riskKey(role, drill, kind, mode)), `${role} ${drill} ${kind} ${mode}`).toBe(true);
      }
      expect(sopKeys(role, RANDOM_TASK, 'expert')).toHaveLength(3 * SOP_STEPS);
      expect(sopKeys(role, RANDOM_TASK, 'standard')).toHaveLength(3 * SOP_STEPS);
      expect(Object.keys(msgs).some((key) => key === `task_${role}_1_sop`)).toBe(false);
      const benefits = STAFF_DRILLS.map((d) => msgs[riskKey(role, d, 'benefit', 'expert')].en);
      expect(new Set(benefits).size, role).toBe(3);
    }
    expect(riskKey('aml', undefined, 'approve', 'expert')).toBe('risk_aml_approveExp');
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
    expect(consequenceKey({ role: 'aml', drill: 2, result: r('APPROVE', false) }, 'expert')).toBe('risk_aml_t2_approveExp');
    expect(consequenceKey({ role: 'swift', drill: 3, result: r('REJECT', true) }, 'standard')).toBe('risk_swift_t3_benefitStd');
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
    const store = createBankStore({ storage: null, seed: 2026, incidentRandom: () => 1 });
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

describe('Time-Attack Challenge Mode', () => {
  it('runs a strict 3-minute shift scored +100, up to +50 under 15 s, −50 per error', () => {
    expect(CHALLENGE.durationSec).toBe(180);
    expect(challengePoints(true, 0)).toBe(150);
    expect(challengePoints(true, 7.5)).toBe(125);
    expect(challengePoints(true, 15)).toBe(100);
    expect(challengePoints(true, 40)).toBe(100);
    expect(challengePoints(false, 1)).toBe(-50);
    expect(challengeBonus(-3)).toBe(50);
  });

  it('keeps a net tally and grades the shift S to F on accuracy and volume', () => {
    let t = EMPTY_TALLY;
    for (let i = 0; i < 12; i++) t = addToTally(t, true, 5);
    expect(t).toMatchObject({ reviews: 12, correct: 12, bonusXp: 12 * 33, penaltyXp: 0, xp: 12 * 133 });
    expect(challengeGrade(t)).toBe('S');
    t = addToTally(t, false, 2);
    expect(t.xp).toBe(12 * 133 - 50);
    expect(challengeGrade(t)).toBe('A');
    expect(challengeGrade({ reviews: 6, correct: 5 })).toBe('B');
    expect(challengeGrade({ reviews: 3, correct: 2 })).toBe('C');
    expect(challengeGrade({ reviews: 20, correct: 10 })).toBe('F');
    expect(challengeGrade({ reviews: 2, correct: 2 })).toBe('F');
    expect(challengeGrade(EMPTY_TALLY)).toBe('F');
    for (const g of CHALLENGE_GRADES) expect(has(`grade_${g}`), g).toBe(true);
  });

  it('keeps the challenge in the store: strict clock, scorecard at 00:00, cleared on leaving or switching desk', () => {
    const store = createBankStore({ storage: null, seed: 2026, incidentRandom: () => 1 });
    store.getState().openStaffDesk(ROLE_STATION.fds);
    store.getState().startChallenge(1_000);
    expect(store.getState().staffChallenge?.endsAt).toBe(1_000 + 180_000);
    store.getState().recordChallenge(true, 3, 5_000);
    store.getState().recordChallenge(false, 3, 9_000);
    store.getState().tickChallenge(180_999);
    expect(store.getState().staffChallengeResult).toBeNull();
    store.getState().recordChallenge(true, 1, 181_000);
    expect(store.getState().staffChallenge?.tally).toMatchObject({ reviews: 2, correct: 1, xp: 140 - 50 });
    store.getState().tickChallenge(181_000);
    expect(store.getState().staffChallenge).toBeNull();
    expect(store.getState().staffChallengeResult).toMatchObject({ reviews: 2, xp: 90 });
    store.getState().dismissChallengeResult();
    store.getState().startChallenge(0);
    store.getState().switchStaffDesk(ROLE_STATION.aml);
    expect(store.getState().staffChallenge).toBeNull();
    store.getState().startChallenge(0);
    store.getState().closeStaffDesk();
    expect(store.getState().staffChallenge).toBeNull();
  });

  it('formats the countdown', () => {
    expect(clockText(180)).toBe('03:00');
    expect(clockText(166.2)).toBe('02:47');
    expect(clockText(0)).toBe('00:00');
    expect(clockText(-4)).toBe('00:00');
  });

  it('opens a scorecard with cases, accuracy, net XP and the grade in both languages', () => {
    const tally = { reviews: 10, correct: 9, xp: 1040, bonusXp: 190, penaltyXp: 50 };
    for (const lang of ['en', 'vi'] as const) {
      const m = (key: AnalystWorkspaceKey, values?: Record<string, string | number>): string => {
        let text: string = msgs[key][lang];
        for (const [k, v] of Object.entries(values ?? {})) text = text.replace(`{${k}}`, String(v));
        return text;
      };
      const out = renderToStaticMarkup(createElement(ChallengeScorecard, { tally, m, onAgain: () => undefined, onClose: () => undefined }));
      expect(out).toContain('data-grade="A"');
      expect(out).toMatch(/data-testid="workspace-scorecard-reviewed"[^>]*>10</);
      expect(out).toMatch(/data-testid="workspace-scorecard-accuracy"[^>]*>90%</);
      expect(out).toMatch(/data-testid="workspace-scorecard-xp"[^>]*>1040</);
      for (const key of ['scorecardTitle', 'scReviewed', 'scAccuracy', 'scNetXp', 'scGrade', 'grade_A', 'scPlayAgain'] as const) expect(out, `${lang} ${key}`).toContain(esc(msgs[key][lang]));
    }
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
    const timed = renderToStaticMarkup(createElement(ConsequenceOverlay, { consequence: { role: 'aml', errors: 0, points: 142, bonus: 42, result: { ok: true, packetId: 'p', decision: 'REJECT', expected: 'REJECT', correct: true, statusCode: 'X' } }, mode: 'standard', m }));
    expect(timed).toContain('+142 XP');
    expect(timed).toContain('+42 speed bonus');
    const lost = renderToStaticMarkup(createElement(ConsequenceOverlay, { consequence: { role: 'aml', errors: 1, points: -50, bonus: 0, result: { ok: true, packetId: 'p', decision: 'APPROVE', expected: 'REJECT', correct: false, statusCode: 'X' } }, mode: 'standard', m }));
    expect(lost).toContain('−50 XP');
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
  const view = (role: (typeof STAFF_ROLES)[number], task: (typeof STAFF_TASKS)[number], initialMode: WorkspaceMode = 'standard'): string =>
    renderToStaticMarkup(createElement(AnalystWorkspaceView, { desk: ROLE_STATION[role], cases: taskDeck(role, task, 0), shift: EMPTY_SHIFT, initialMode, task, canAdvance: true, ...handlers }));

  it('shows all 3 steps in both modes, plain in Standard and formal in Expert, with the task\'s own risk cards', () => {
    for (const role of STAFF_ROLES)
      for (const task of STAFF_TASKS) {
        const drill = taskDeck(role, task, 0)[0]!.drill!;
        const std = view(role, task, 'standard');
        expect(std).toContain('data-sop="standard"');
        for (const key of sopKeys(role, task, 'standard')) expect(std).toContain(esc(msgs[key].en));
        expect(std.match(/>Step \d</g)?.length, `${role} ${task}`).toBe((task === RANDOM_TASK ? 3 : 1) * SOP_STEPS);
        for (const key of sopKeys(role, task, 'expert')) expect(std).not.toContain(esc(msgs[key].en));
        expect(std).toContain(esc(msgs[riskKey(role, drill, 'approve', 'standard')].en));
        const exp = view(role, task, 'expert');
        expect(exp).toContain('data-sop="expert"');
        for (const key of sopKeys(role, task, 'expert')) expect(exp).toContain(esc(msgs[key].en));
        for (const kind of ['approve', 'reject', 'benefit'] as const) expect(exp, `${role} ${task} ${kind}`).toContain(esc(msgs[riskKey(role, drill, kind, 'expert')].en));
      }
  });

  it('draws the desk and task pickers, the task card and its SOP for every role and task', () => {
    for (const role of STAFF_ROLES)
      for (const task of STAFF_TASKS) {
        const out = view(role, task);
        for (const id of ['workspace-challenge', 'workspace-role-select', 'workspace-task-select', 'workspace-task', 'workspace-sop', 'workspace-scenario', 'workspace-language', 'workspace-mode']) expect(out, `${role} ${task} ${id}`).toContain(`data-testid="${id}"`);
        expect(out).toContain(`data-task="${task}"`);
        for (const key of sopKeys(role, task)) expect(out).toContain(esc(msgs[key].en));
        expect(out.includes('data-testid="workspace-drill"')).toBe(task === RANDOM_TASK);
        expect(out).not.toContain('data-testid="workspace-switch-dialog"');
        expect(out.includes('data-testid="workspace-amount"')).toBe(taskDeck(role, task, 0)[0]!.amountCents > 0);
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

describe('Incident Mode', () => {
  const view = (incident: (typeof INCIDENT_IDS)[number] | null, role: (typeof STAFF_ROLES)[number] = 'aml', incidentMode = true): string =>
    renderToStaticMarkup(
      createElement(AnalystWorkspaceView, { desk: ROLE_STATION[role], cases: taskDeck(role, 1, 0, 4, incident), shift: EMPTY_SHIFT, initialMode: 'standard', task: 1, canAdvance: true, incidentMode, incident: startIncident(incident), ...handlers }),
    );

  it('catalogues 25 incidents: 4 bank-wide and 3 per desk, each surging a distinct drill', () => {
    expect(INCIDENT_IDS).toHaveLength(25);
    expect(new Set(INCIDENT_IDS).size).toBe(25);
    for (const id of GLOBAL_INCIDENTS) expect(incidentRole(id)).toBeNull();
    for (const role of STAFF_ROLES) {
      expect(DESK_INCIDENTS[role].map((id) => incidentRole(id))).toEqual([role, role, role]);
      expect(DESK_INCIDENTS[role].map((id) => INCIDENT_DRILL[id]).sort()).toEqual([1, 2, 3]);
    }
  });

  it('has a title, phenomenon, rule and alert for every incident in both languages', () => {
    for (const id of INCIDENT_IDS)
      for (const part of ['title', 'phenomenon', 'rule', 'alert']) {
        const key = `incident_${id}_${part}`;
        expect(has(key), key).toBe(true);
        expect(hasVietnamese(msgs[key as AnalystWorkspaceKey].vi), key).toBe(true);
      }
  });

  it("rolls an incident 25% of the time, from the global pool or the desk's own", () => {
    expect(rollIncident('fds', () => INCIDENT.chance)).toBeNull();
    const seq = [0.1, 0.99];
    expect(rollIncident('fds', () => seq.shift()!)).toBe(DESK_INCIDENTS.fds[2]);
    const seq2 = [0, 0];
    expect(rollIncident('fds', () => seq2.shift()!)).toBe('AUDIT_DAY');
  });

  it('bends the SLA, the clock and the card under the bank-wide incidents', () => {
    expect(incidentSlaSeconds('NETWORK_LATENCY')).toBe(21);
    expect(incidentSlaSeconds(null)).toBe(30);
    expect(incidentClockRate('POWER_GRID_FAILOVER')).toBe(1.5);
    for (const role of STAFF_ROLES)
      for (const c of taskDeck(role, 4, 0, 12)) {
        const hidden = maskedFields(c, 'CORRUPTED_PAYLOAD');
        expect(hidden.size).toBeGreaterThanOrEqual(1);
        expect(hidden.size).toBeLessThan(c.fields.length);
        expect(maskedFields(c, 'AUDIT_DAY').size).toBe(0);
      }
  });

  it("floods the desk with the incident's drill, mostly breaching cases, and leaves other desks alone", () => {
    const deck = taskDeck('aml', 1, 0, 40, 'AML_SMURF_WAVE');
    expect(deck.every((c) => c.drill === 2 && c.incident === 'AML_SMURF_WAVE')).toBe(true);
    expect(deck.filter((c) => c.expected === 'REJECT').length).toBeGreaterThan(30);
    expect(taskDeck('fds', 1, 0, 4, 'AML_SMURF_WAVE')).toEqual(taskDeck('fds', 1, 0, 4));
  });

  it('charges 3x XP and compliance for errors under audit, and drops the speed bonus', () => {
    expect(challengePoints(true, 0, { speedBonus: false, penaltyMult: 3 })).toBe(CHALLENGE.base);
    expect(challengePoints(false, 0, { speedBonus: false, penaltyMult: 3 })).toBe(-CHALLENGE.penalty * 3);

    const seq = [0, 0];
    const store = createBankStore({ storage: null, seed: 2026, incidentRandom: () => seq.shift() ?? 1 });
    store.getState().openStaffDesk(ROLE_STATION.aml);
    store.getState().setIncidentMode(true);
    expect(store.getState().staffIncident).toMatchObject({ id: 'AUDIT_DAY', compliance: 100 });
    // A bank-wide crisis serves all three drills (the Random task) in the emergency queue.
    const head = buildTaskCase('aml', RANDOM_TASK, 0, 'AUDIT_DAY');
    store.getState().staffTrain(head.id, head.expected === 'APPROVE' ? 'REJECT' : 'APPROVE', 2, 30);
    expect(store.getState().staffShift.aml?.xp).toBe(-300);
    expect(store.getState().staffIncident).toMatchObject({ compliance: 100 - INCIDENT.auditComplianceDrop, reviews: 1 });

    store.getState().setIncidentMode(false);
    expect(store.getState()).toMatchObject({ staffIncidentMode: false, staffIncident: null });
    store.getState().closeStaffDesk();
  });

  it('defaults Incident Mode off, always opens a crisis when switched on, and clears on close', () => {
    const store = createBankStore({ storage: null, seed: 2026, incidentRandom: () => 0 });
    expect(store.getState().staffIncidentMode).toBe(false);
    store.getState().openStaffDesk(ROLE_STATION.swift);
    expect(store.getState().staffIncident).toBeNull();
    store.getState().setIncidentMode(true);
    expect(store.getState().staffIncident?.id).toBe('AUDIT_DAY');
    store.getState().closeStaffDesk();
    expect(store.getState().staffIncident).toBeNull();
  });

  it('draws the glowing toggle, the banner, masked fields and the flicker', () => {
    const on = view(null);
    expect(on).toContain('data-testid="workspace-incident-toggle"');
    expect(on).toContain('pc-incident-glow');
    expect(on).toContain(esc(msgs.incidentToggleHint.en));
    expect(on).not.toContain('data-testid="workspace-incident"');
    expect(view(null, 'aml', false)).toContain(esc(msgs.incidentToggleOff.en));

    const audit = view('AUDIT_DAY');
    expect(audit).toContain('data-incident="AUDIT_DAY"');
    expect(audit).toContain(esc(msgs.incident_AUDIT_DAY_alert.en));
    expect(audit).toContain('data-testid="workspace-incident-compliance"');

    expect(view('CORRUPTED_PAYLOAD')).toContain(MASK);
    expect(view('POWER_GRID_FAILOVER')).toContain('data-testid="workspace-power-flicker"');
    expect(view('NETWORK_LATENCY')).toContain('SLA 21s');
    expect(view('AML_SANCTION_FLASH_UPDATE')).toContain('data-testid="workspace-incident-case"');
  });
});

describe('career progression and badges', () => {
  const mEn = (key: AnalystWorkspaceKey, values?: Record<string, string | number>): string => {
    let text: string = msgs[key].en;
    for (const [name, v] of Object.entries(values ?? {})) text = text.split(`{${name}}`).join(String(v));
    return text;
  };
  const decide = (over: Partial<CareerDecision> = {}): CareerDecision => ({ role: 'fds', drill: 1, expected: 'APPROVE', decision: 'APPROVE', correct: true, latencySec: 10, expert: false, xp: 100, ...over });
  const run = (c: CareerProgress, ds: CareerDecision[]): { career: CareerProgress; unlocked: string[] } =>
    ds.reduce<{ career: CareerProgress; unlocked: string[] }>(
      (acc, d) => {
        const r = recordCareerDecision(acc.career, d);
        return { career: r.career, unlocked: [...acc.unlocked, ...r.unlocked] };
      },
      { career: c, unlocked: [] },
    );
  const times = <T,>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

  it('maps lifetime XP onto levels and the four ranks at the spec boundaries', () => {
    expect(careerStanding(0)).toMatchObject({ rank: 'intern', level: 1, nextRankXp: 1_501 });
    expect(careerStanding(1_500)).toMatchObject({ rank: 'intern', level: 5 });
    expect(careerStanding(1_501)).toMatchObject({ rank: 'junior', level: 6 });
    expect(careerStanding(5_000)).toMatchObject({ rank: 'junior', level: 15 });
    expect(careerStanding(5_001)).toMatchObject({ rank: 'senior', level: 16 });
    expect(careerStanding(15_000)).toMatchObject({ rank: 'senior', level: 30 });
    expect(careerStanding(15_001)).toMatchObject({ rank: 'cro', level: 31, nextRankXp: null, rankProgress: 1 });
    expect(careerStanding(25_001).level).toBe(41);
    let last = 0;
    for (let xp = 0; xp <= 20_000; xp += 50) {
      const lv = careerStanding(xp).level;
      expect(lv).toBeGreaterThanOrEqual(last);
      last = lv;
    }
  });

  it('checks badges only at the end of a 10-review shift', () => {
    const fast = run(EMPTY_CAREER, times(9, () => decide({ latencySec: 2 })));
    expect(fast.unlocked).toEqual([]);
    const done = recordCareerDecision(fast.career, decide({ latencySec: 2 }));
    expect(done.unlocked).toEqual(['slaMaster']);
    expect(done.career).toMatchObject({ xp: 1_000, badges: ['slaMaster'], shift: { reviews: 0 } });
    expect(run(EMPTY_CAREER, times(10, () => decide({ latencySec: BADGE_RULES.slaAvgSec }))).unlocked).toEqual([]);
  });

  it('awards eKYC Hawk-Eye for 10 correct eKYC reviews in a row, and resets on a miss', () => {
    expect(run(EMPTY_CAREER, times(10, () => decide({ role: 'ekyc' }))).unlocked).toContain('ekycHawkEye');
    const broken = run(EMPTY_CAREER, times(10, (i) => decide({ role: 'ekyc', correct: i !== 4, decision: i === 4 ? 'REJECT' : 'APPROVE' })));
    expect(broken.unlocked).not.toContain('ekycHawkEye');
    expect(broken.career.ekycStreak).toBe(5);
  });

  it('awards AML Iron Shield for 5 structuring or OFAC blocks in a row within one shift', () => {
    const block = (drill: 1 | 2 | 3): CareerDecision => decide({ role: 'aml', drill, expected: 'REJECT', decision: 'REJECT' });
    const ok = run(EMPTY_CAREER, [...times(5, (i) => block(i % 2 === 0 ? 1 : 2)), ...times(5, () => decide({ role: 'aml' }))]);
    expect(ok.unlocked).toContain('amlIronShield');
    const funnel = run(EMPTY_CAREER, [...times(5, () => block(3)), ...times(5, () => decide({ role: 'aml' }))]);
    expect(funnel.unlocked).not.toContain('amlIronShield');
    const missed = run(EMPTY_CAREER, [...times(4, () => block(2)), decide({ role: 'aml', drill: 2, expected: 'REJECT', correct: false }), ...times(4, () => block(2)), decide({ role: 'aml' })]);
    expect(missed.unlocked).not.toContain('amlIronShield');
  });

  it('awards Perfect Auditor after 3 perfect Expert shifts in a row', () => {
    const shift = (expert: boolean, perfect = true): CareerDecision[] => times(10, (i) => decide({ expert, correct: perfect || i > 0 }));
    expect(run(EMPTY_CAREER, [...shift(true), ...shift(true), ...shift(true)]).unlocked).toContain('perfectAuditor');
    expect(run(EMPTY_CAREER, [...shift(true), ...shift(false), ...shift(true), ...shift(true)]).unlocked).not.toContain('perfectAuditor');
    expect(run(EMPTY_CAREER, [...shift(true), ...shift(true, false), ...shift(true)]).unlocked).not.toContain('perfectAuditor');
    const twice = run(EMPTY_CAREER, times(6, () => shift(true)).flat());
    expect(twice.career.badges.filter((b) => b === 'perfectAuditor')).toHaveLength(1);
  });

  it('books career XP from the store, queues unlocks and persists them in storage', () => {
    const storage = memoryStorage();
    const store = createBankStore({ storage, seed: 2026, incidentRandom: () => 1 });
    store.getState().openStaffDesk(ROLE_STATION.ekyc);
    for (let i = 0; i < 10; i++) {
      const head = buildTaskCase('ekyc', 1, i);
      store.getState().staffTrain(head.id, head.expected, 1, 30, true);
    }
    const { career, badgeUnlocks } = store.getState();
    expect(career.xp).toBe(store.getState().staffShift.ekyc?.xp);
    expect(badgeUnlocks).toEqual(expect.arrayContaining(['ekycHawkEye', 'slaMaster']));
    expect(decodeCareer(storage.getItem(CAREER_KEY)).badges).toEqual(career.badges);
    store.getState().dismissBadgeUnlock();
    expect(store.getState().badgeUnlocks).toHaveLength(badgeUnlocks.length - 1);
    expect(createBankStore({ storage, seed: 2026 }).getState().career.badges).toEqual(career.badges);
    store.getState().closeStaffDesk();
  });

  it('distrusts what storage hands back', () => {
    expect(decodeCareer('not json')).toEqual(EMPTY_CAREER);
    expect(decodeCareer(JSON.stringify({ xp: -5, badges: ['slaMaster', 'hacked'], ekycStreak: 'x' }))).toMatchObject({ xp: 0, badges: ['slaMaster'], ekycStreak: 0 });
  });

  it('has rank titles, badge names, requirements, progress and toasts in both languages', () => {
    for (const r of CAREER_RANKS) expect(hasVietnamese(msgs[`rank_${r.id}` as AnalystWorkspaceKey].vi), r.id).toBe(true);
    for (const b of BADGES)
      for (const part of ['name', 'req', 'progress', 'toast']) {
        const key = `badge_${b}_${part}`;
        expect(has(key), key).toBe(true);
      }
  });

  it('draws the career card, the badges button, the collection and the unlock celebration', () => {
    const career: CareerProgress = { ...EMPTY_CAREER, xp: 6_200, badges: ['slaMaster'] };
    const out = renderToStaticMarkup(
      createElement(AnalystWorkspaceView, { desk: ROLE_STATION.aml, cases: taskDeck('aml', 1, 0), shift: EMPTY_SHIFT, initialMode: 'standard', task: 1, canAdvance: true, career, badgeUnlocks: ['slaMaster'], ...handlers }),
    );
    expect(out).toContain('data-rank="senior"');
    expect(out).toContain(esc(msgs.rank_senior.en));
    expect(out).toContain('data-testid="workspace-badges"');
    expect(out).toContain(esc(msgs.badgesButton.en));
    expect(out).toContain('data-testid="workspace-unlock"');
    expect(out).toContain('pc-badge-glow');

    const card = renderToStaticMarkup(createElement(CareerCard, { career: { ...EMPTY_CAREER, xp: 20_000 }, m: mEn }));
    expect(card).toContain(esc(msgs.rank_cro.en));
    expect(card).toContain('Top rank reached');

    const drawer = renderToStaticMarkup(createElement(BadgeDrawer, { career, m: mEn, onClose: () => undefined }));
    expect(drawer.match(/data-badge=/g)).toHaveLength(4);
    expect(drawer.match(/data-unlocked="true"/g)).toHaveLength(1);
    for (const b of BADGES) expect(drawer).toContain(esc(msgs[`badge_${b}_name` as AnalystWorkspaceKey].en));

    const toast = renderToStaticMarkup(createElement(BadgeUnlockModal, { badge: 'amlIronShield', m: mEn, onClose: () => undefined }));
    expect(toast).toContain(esc(mEn('badge_amlIronShield_toast', { target: BADGE_RULES.amlBlocks })));
  });
});
