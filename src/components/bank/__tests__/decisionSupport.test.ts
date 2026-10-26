import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setActiveLocale } from '../../../i18n/locale';
import {
  buildTaskCase,
  comboXp,
  RETAIL_TASK,
  ROLE_STATION,
  STAFF_ROLES,
  STAFF_XP_PER_CORRECT,
  taskDeck,
  WORKSPACE_TASKS,
  type StaffCase,
} from '../../../sim/staffRoleplay';
import { bookCombo, createBankStore, EMPTY_SHIFT } from '../../../store/bankStore';
import { analystWorkspaceMessages } from '../analystWorkspace.messages';
import { ADVICE_ACTIONS, adviseCase, AnalystWorkspaceView, confidenceBand, ConsequenceOverlay, ESCALATE_BELOW_PCT, type AnalystWorkspaceViewProps, type WorkspaceMode } from '../AnalystWorkspaceModal';

const msgs = analystWorkspaceMessages.messages;
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const m = ((key: keyof typeof msgs, values?: Record<string, string | number>): string => {
  let text: string = msgs[key].en;
  for (const [name, v] of Object.entries(values ?? {})) text = text.split(`{${name}}`).join(String(v));
  return text;
}) as Parameters<typeof ConsequenceOverlay>[0]['m'];

afterEach(() => setActiveLocale('en'));

const allCases = (): StaffCase[] => STAFF_ROLES.flatMap((r) => WORKSPACE_TASKS.flatMap((t) => taskDeck(r, t, 0, 40)));
const retailOf = (role: (typeof STAFF_ROLES)[number], id: string, expected: 'APPROVE' | 'REJECT', pred: (c: StaffCase) => boolean = () => true): StaffCase =>
  taskDeck(role, RETAIL_TASK, 0, 300).find((c) => c.retail?.id === id && c.expected === expected && pred(c))!;
const drivers = (c: StaffCase, masked?: ReadonlySet<string>): string[] => adviseCase(c, masked).drivers.map((d) => d.key);

describe('Decision Support Engine: recommendations', () => {
  it('recommends the SOP verdict on every unmasked training and retail case, with 2-3 drivers', () => {
    for (const c of allCases()) {
      const a = adviseCase(c);
      if (c.expected === 'APPROVE') expect(a.action, c.id).toBe('approve');
      else expect(['reject', 'freeze'], c.id).toContain(a.action);
      expect(a.confidence).toBeGreaterThanOrEqual(ESCALATE_BELOW_PCT);
      expect(a.confidence).toBeLessThanOrEqual(100);
      expect(a.drivers.length, c.id).toBeGreaterThanOrEqual(2);
      expect(a.drivers.length, c.id).toBeLessThanOrEqual(3);
      for (const d of a.drivers) expect(d.key in msgs, d.key).toBe(true);
    }
  });

  it('is fully confident on clean cases and discounts an operational alert by half a field', () => {
    const clean = taskDeck('ekyc', 1, 0, 40).find((c) => c.expected === 'APPROVE')!;
    expect(adviseCase(clean)).toMatchObject({ action: 'approve', confidence: 100 });
    const low = retailOf('cashier', 'ATM_LOW_CASH', 'APPROVE', (c) => c.fields.some((f) => f.alert));
    expect(adviseCase(low)).toMatchObject({ action: 'approve', confidence: Math.round((100 * (low.fields.length - 0.5)) / low.fields.length) });
    expect(confidenceBand(100)).toBe('High');
    expect(confidenceBand(80)).toBe('Medium');
    expect(confidenceBand(50)).toBe('Low');
  });

  it('recommends Freeze only where rejecting moves the funds into frozen assets', () => {
    for (const drill of [1, 3] as const) expect(adviseCase(taskDeck('aml', drill, 0, 40).find((c) => c.expected === 'REJECT')!).action).toBe('freeze');
    expect(adviseCase(taskDeck('aml', 2, 0, 40).find((c) => c.expected === 'REJECT')!).action).toBe('reject');
    for (const c of allCases()) if (c.role !== 'aml') expect(adviseCase(c).action).not.toBe('freeze');
  });

  it('escalates when an incident hides too much of a clean case to approve it', () => {
    const c = taskDeck('fds', 1, 0, 40).find((x) => x.expected === 'APPROVE' && x.fields.length === 3)!;
    const hideTwo = new Set(c.fields.slice(0, 2).map((f) => f.key));
    const a = adviseCase(c, hideTwo);
    expect(a.action).toBe('escalate');
    expect(a.confidence).toBeLessThan(ESCALATE_BELOW_PCT);
    expect(a.drivers[0]).toMatchObject({ key: 'driver_hidden', n: 2 });
    // A visible breach stays decisive even with a field hidden.
    const hit = taskDeck('fds', 1, 0, 40).find((x) => x.expected === 'REJECT')!;
    const other = hit.fields.find((f) => !f.flag)!.key;
    expect(adviseCase(hit, new Set([other]))).toMatchObject({ action: 'reject', confidence: 90 });
  });
});

describe('Decision Support Engine: key risk drivers', () => {
  it('names the scenario-level drivers an analyst would call out', () => {
    expect(drivers(retailOf('cashier', 'ATM_LOW_CASH', 'APPROVE', (c) => c.fields.some((f) => f.alert)))[0]).toBe('driver_atmCassetteLow');
    expect(drivers(retailOf('ekyc', 'AUTO_PAY', 'REJECT'))[0]).toBe('driver_nsfPenalty');
    expect(drivers(retailOf('bnpl', 'DEBT_WATERFALL', 'APPROVE'))).toContain('driver_waterfall');
    expect(drivers(retailOf('bnpl', 'DEBT_WATERFALL', 'REJECT'))[0]).toBe('driver_waterfallBroken');
    expect(drivers(retailOf('swift', 'CLEARING_BREAK', 'APPROVE'))[0]).toBe('driver_clearingBreak');
    expect(drivers(taskDeck('aml', 2, 0, 40).find((c) => c.expected === 'REJECT')!)[0]).toBe('driver_ctrEvasion');
    expect(drivers(taskDeck('aml', 1, 0, 40).find((c) => c.expected === 'REJECT')!)).toContain('driver_freeze');
  });

  it('falls back to the breached fields, then the ledger impact', () => {
    const hit = taskDeck('fds', 2, 0, 40).find((c) => c.expected === 'REJECT')!;
    const a = adviseCase(hit);
    expect(a.drivers.every((d) => d.key === 'driver_breach')).toBe(true);
    expect(a.drivers.map((d) => d.field)).toEqual(hit.fields.filter((f) => f.flag).map((f) => f.key).slice(0, 3));
    const wire = taskDeck('swift', 2, 0, 40).find((c) => c.expected === 'APPROVE')!;
    expect(drivers(wire)).toEqual(['driver_nostro', 'driver_clean']);
    const card = retailOf('dispute', 'CARD_CAPTURED', 'APPROVE');
    expect(drivers(card)).toEqual(['driver_clean', 'driver_memo']);
  });
});

describe('Decision Support Engine: the card and Expert-mode reveal', () => {
  const handlers: Pick<AnalystWorkspaceViewProps, 'onClose' | 'onAdvance' | 'onDecide' | 'onTaskChange' | 'onSwitchRole'> = {
    onClose: () => undefined,
    onAdvance: () => undefined,
    onDecide: () => ({ result: { ok: false, packetId: '', decision: 'APPROVE' as const, expected: null, correct: false, statusCode: '' }, errors: 0 }),
    onTaskChange: () => undefined,
    onSwitchRole: () => undefined,
  };
  const view = (cases: StaffCase[], initialMode: WorkspaceMode): string =>
    renderToStaticMarkup(createElement(AnalystWorkspaceView, { desk: ROLE_STATION[cases[0]!.role], cases, shift: EMPTY_SHIFT, initialMode, task: 1, canAdvance: true, ...handlers }));

  it('shows the full advisory in Standard mode, with all four actions and the recommended one marked', () => {
    const cases = taskDeck('aml', 1, 0, 40).filter((c) => c.expected === 'REJECT').slice(0, 4);
    const out = view(cases, 'standard');
    expect(out).toContain('data-testid="workspace-dse" data-revealed="true" data-action="freeze"');
    for (const a of ADVICE_ACTIONS) expect(out).toContain(esc(msgs[`dseAction_${a}`].en));
    expect(out).toMatch(/data-action="freeze" data-recommended="true"/);
    expect(out).toContain(esc(msgs.dseTitle.en));
    expect(out).toContain('data-testid="workspace-dse-confidence"');
  });

  it('folds the advice behind a reveal button in Expert mode', () => {
    const out = view(taskDeck('cashier', 1, 0, 4), 'expert');
    expect(out).toContain('data-testid="workspace-dse" data-revealed="false"');
    expect(out).toContain('data-testid="workspace-dse-reveal"');
    expect(out).not.toContain('data-testid="workspace-dse-confidence"');
    expect(out).toContain(esc(msgs.dseRevealNote.en));
  });

  it('speaks Vietnamese: Duyệt / Từ chối / Phong tỏa / Chuyển luồng', () => {
    setActiveLocale('vi');
    const out = view(taskDeck('swift', 2, 0, 4), 'standard');
    for (const a of ADVICE_ACTIONS) expect(out).toContain(esc(msgs[`dseAction_${a}`].vi));
    expect(['Duyệt', 'Từ chối', 'Phong tỏa', 'Chuyển luồng']).toEqual(ADVICE_ACTIONS.map((a) => msgs[`dseAction_${a}`].vi));
    expect(out).toContain(esc(msgs.dseTitle.vi));
  });
});

describe('Decision Support Engine: forfeiting the combo bonus', () => {
  it('books an assisted decision at 1.0x, keeping the streak', () => {
    const prev = { ...EMPTY_SHIFT, comboCount: 4 };
    expect(bookCombo(prev, true)).toEqual({ comboCount: 5, xp: comboXp(5) });
    expect(bookCombo(prev, true, true)).toEqual({ comboCount: 5, xp: STAFF_XP_PER_CORRECT });
    expect(bookCombo(prev, false, true)).toEqual({ comboCount: 0, xp: 0 });
  });

  it('passes the reveal through the store', () => {
    const store = createBankStore({ storage: null, seed: 2026, incidentRandom: () => 1 });
    store.getState().openStaffDesk(ROLE_STATION.ekyc);
    for (let i = 0; i < 5; i++) {
      const head = buildTaskCase('ekyc', 1, store.getState().staffTaskSeq);
      store.getState().staffTrain(head.id, head.expected, 2, 30, true, i === 4);
    }
    const shift = store.getState().staffShift.ekyc!;
    expect(shift.comboCount).toBe(5);
    expect(shift.xp).toBe(comboXp(1) + comboXp(2) + comboXp(3) + comboXp(4) + STAFF_XP_PER_CORRECT);
  });

  it('tells the learner on the overlay, instead of the combo line', () => {
    const c = taskDeck('ekyc', 1, 0, 40).find((x) => x.expected === 'APPROVE')!;
    const result = { ok: true, packetId: c.id, decision: 'APPROVE' as const, expected: 'APPROVE' as const, correct: true, statusCode: 'EKYC_VERIFIED' };
    const assisted = renderToStaticMarkup(createElement(ConsequenceOverlay, { consequence: { result, role: 'ekyc', drill: 1, errors: 0, xp: 100, combo: 5, assisted: true }, mode: 'expert', m }));
    expect(assisted).toContain('data-testid="workspace-consequence-assisted"');
    expect(assisted).not.toContain('data-testid="workspace-consequence-combo"');
    const plain = renderToStaticMarkup(createElement(ConsequenceOverlay, { consequence: { result, role: 'ekyc', drill: 1, errors: 0, xp: 200, combo: 5 }, mode: 'expert', m }));
    expect(plain).toContain('data-testid="workspace-consequence-combo"');
  });
});
