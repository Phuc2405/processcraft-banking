import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { DECISIONS, EDD_ACTIONS_AT, EDD_MATRIX, EDD_SLA_MIN, eddDecision, eddTimeline, expireEdd, fiuDirective, lateDocs, LEAK, typologyCases, type CaseRecord, type ReviewCase } from '../amlReview';
import { nextRetailSeq, RETAIL_DESK, retailDeck } from '../staffRoleplay';
import { createAmlStore } from '../../store/amlStore';
import { bankStore } from '../../store/bankStore';
import { notificationStore } from '../../store/notificationStore';
import { createUiStore } from '../../store/uiStore';
import { amlDecisionMessages } from '../../components/ops/amlDecision.messages';
import { EddPanel } from '../../components/ops/AmlReview';
import { RetailFocusChips, TreasuryCheck } from '../../components/bank/AnalystWorkspaceModal';
import { analystWorkspaceMessages } from '../../components/bank/analystWorkspace.messages';
import { KnowledgeShortcuts } from '../../components/nav/KnowledgeShortcuts';
import { bundleProblems } from '../../utils/i18nHelper';

const msgs = amlDecisionMessages.messages;
const en = ((key: keyof typeof msgs, v?: Record<string, string | number>) => Object.entries(v ?? {}).reduce((t, [k, x]) => t.split(`{${k}}`).join(String(x)), msgs[key].en)) as Parameters<typeof EddPanel>[0]['m'];
const base = typologyCases(7, 1)[0]!;
/** A case whose customer sends proof `after` minutes after the request (null: never). */
const caseWith = (laundering: boolean, after: number | null, id = `E-${laundering}-${after}`): ReviewCase => ({ ...base, id, laundering, edd: { kind: 'VAT_INVOICE', genuine: !laundering, uploadAfterMin: after } });
const requested = (c: ReviewCase): CaseRecord => DECISIONS.REQUEST_EDD.apply(c, 0).record;
/** The case's record once the SLA has run out (and late documents, if any, arrived by `now`). */
function overdue(c: ReviewCase, now: number): CaseRecord {
  const r = expireEdd(c, requested(c), EDD_SLA_MIN).record;
  return lateDocs(c, r, now).record;
}
const sum = (lines: readonly { dr: number; cr: number }[]): number => lines.reduce((s, l) => s + l.dr - l.cr, 0);

describe('the EDD timeline: on time, late, stalling', () => {
  it('places a case on its timeline and offers only the decisions that point allows', () => {
    const onTime = caseWith(false, 120);
    expect(eddTimeline(requested(onTime), 60)).toBe('WAITING');
    expect(eddTimeline(requested(onTime), 120)).toBe('ON_TIME');
    const late = caseWith(false, EDD_SLA_MIN + 300);
    expect(eddTimeline(overdue(late, EDD_SLA_MIN + 10), EDD_SLA_MIN + 10)).toBe('STALLING');
    expect(eddTimeline(overdue(late, EDD_SLA_MIN + 300), EDD_SLA_MIN + 300)).toBe('LATE');
    expect(eddTimeline(overdue(caseWith(true, null), 99_999), 99_999)).toBe('STALLING');
    expect(EDD_ACTIONS_AT).toEqual({ WAITING: [], ON_TIME: ['RELEASE', 'SAR', 'REFUSE'], LATE: ['RELEASE', 'SAR', 'REFUSE'], STALLING: ['SAR', 'UNLOCK'] });
    // Nothing is decided before the proof, and no unlock while documents are in.
    expect(eddDecision(onTime, requested(onTime), 'RELEASE', 60).commands).toEqual([]);
    expect(eddDecision(onTime, requested(onTime), 'UNLOCK', 120).commands).toEqual([]);
  });

  it('on time or late: a valid release earns +5 (2912 → 2011); a forged release is the $50,000 leak', () => {
    for (const after of [120, EDD_SLA_MIN + 300]) {
      const now = after;
      const valid = caseWith(false, after);
      const rv = after < EDD_SLA_MIN ? requested(valid) : overdue(valid, now);
      const ok = eddDecision(valid, rv, 'RELEASE', now);
      expect(ok).toMatchObject({ feedback: 'EDD_APPROVED', record: { state: 'EDD_CLEARED', points: EDD_MATRIX.validReleasePoints, fineCents: 0 } });
      expect(ok.commands[0]!.lines).toEqual([{ gl: 'CLEARING_SUSPENSE', dr: valid.amountCents, cr: 0 }, { gl: 'CASA', dr: 0, cr: valid.amountCents }]);
      const forged = caseWith(true, after);
      const rf = after < EDD_SLA_MIN ? requested(forged) : overdue(forged, now);
      expect(eddDecision(forged, rf, 'RELEASE', now)).toMatchObject({ feedback: 'LEAK', record: { fineCents: LEAK.fineCents, points: -LEAK.points } });
    }
  });

  it('on time or late: a SAR on forged documents freezes to 2930 and earns +15 at the FIU; on valid ones it is a false filing at once', () => {
    for (const after of [120, EDD_SLA_MIN + 300]) {
      const forged = caseWith(true, after);
      const rf = after < EDD_SLA_MIN ? requested(forged) : overdue(forged, after);
      const sar = eddDecision(forged, rf, 'SAR', after);
      expect(sar).toMatchObject({ feedback: 'SAR_SUBMITTED', record: { state: 'SAR_FILED', points: 0, fiuReward: EDD_MATRIX.forgedSarReward } });
      expect(sar.commands[0]!.lines.map((l) => l.gl)).toEqual(['CLEARING_SUSPENSE', 'FROZEN_ASSETS']);
      expect(fiuDirective(forged, sar.record, sar.record.fiuDue!).record).toMatchObject({ state: 'SEIZED', points: 15 });
      const valid = caseWith(false, after);
      const rv = after < EDD_SLA_MIN ? requested(valid) : overdue(valid, after);
      const wrong = eddDecision(valid, rv, 'SAR', after);
      expect(wrong).toMatchObject({ feedback: 'EDD_FALSE_SAR', record: { state: 'SAR_REJECTED', fineCents: 3_000_000, points: -15, friction: 1 } });
      expect(wrong.commands.map((x) => x.kind)).toEqual(['RETURN_HELD', 'FINE']);
    }
  });

  it('stalling: a SAR earns +10 at the FIU’s seizure; unlocking with no documents is a $50,000, −20 breach', () => {
    const c = caseWith(true, null);
    const r = overdue(c, 99_999);
    expect(r.state).toBe('EDD_EXPIRED');
    const sar = eddDecision(c, r, 'SAR', 99_999);
    expect(sar.record).toMatchObject({ state: 'SAR_FILED', fiuReward: EDD_MATRIX.stallSarReward });
    expect(fiuDirective(c, sar.record, sar.record.fiuDue!).record).toMatchObject({ state: 'SEIZED', points: 10 });
    const unlock = eddDecision(c, r, 'UNLOCK', 99_999);
    expect(unlock).toMatchObject({ feedback: 'EDD_UNLOCK_BREACH', record: { fineCents: 5_000_000, points: -20 } });
    expect(unlock.commands.map((x) => x.statusCode)).toEqual(['EDD_CLEARED', 'AML_UNLOCK_NO_DOCS_FINE']);
  });

  it('keeps every EDD journal balanced, whatever the truth, the timing and the decision', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.option(fc.integer({ min: 0, max: 4000 }), { nil: null }), fc.constantFrom('RELEASE', 'SAR', 'REFUSE', 'UNLOCK' as const), (dirty, after, action) => {
        const c = caseWith(dirty, after);
        const now = 5000;
        const r = after !== null && after <= EDD_SLA_MIN ? requested(c) : overdue(c, now);
        for (const cmd of eddDecision(c, r, action, now).commands) expect(sum(cmd.lines)).toBe(0);
      }),
    );
  });

  it('generates stalling customers only among launderers', () => {
    const cases = Array.from({ length: 60 }, (_, d) => typologyCases(3, d + 1)).flat();
    const never = cases.filter((c) => c.edd.uploadAfterMin === null);
    expect(never.length).toBeGreaterThan(0);
    expect(never.every((c) => c.laundering)).toBe(true);
    expect(cases.some((c) => c.edd.uploadAfterMin !== null && c.edd.uploadAfterMin > EDD_SLA_MIN)).toBe(true);
  });
});

describe('the EDD timeline through the store and on screen', () => {
  beforeEach(() => notificationStore.getState().clear());

  it('raises the late-documents toast once, opening the desk on the case, and badges it “late documents”', () => {
    const store = createAmlStore();
    const c = caseWith(false, EDD_SLA_MIN + 200, 'LATE-1');
    store.getState().decide(c, 'REQUEST_EDD', 0);
    store.getState().tick([c], EDD_SLA_MIN);
    expect(store.getState().reviews['LATE-1']!.state).toBe('EDD_EXPIRED');
    store.getState().tick([c], EDD_SLA_MIN + 200);
    store.getState().tick([c], EDD_SLA_MIN + 300);
    expect(store.getState().reviews['LATE-1']!.state).toBe('EDD_LATE_DOCS');
    const late = notificationStore.getState().queue.filter((n) => n.title.vi.startsWith('📄 CHỨNG TỪ NỘP TRỄ HẠN'));
    expect(late).toHaveLength(1);
    expect(late[0]!.title.vi).toBe(`📄 CHỨNG TỪ NỘP TRỄ HẠN: Khách hàng ${c.subject} vừa nộp chứng từ bổ sung cho Case #LATE-1 (Đã quá hạn SLA 24h)!`);
    expect(msgs.state_EDD_LATE_DOCS.vi).toBe('📄 Đã có chứng từ (Nộp trễ)');
    expect(msgs.state_EDD_EXPIRED.vi).toBe('⌛ Quá hạn EDD - Chưa có chứng từ');
    store.getState().judgeEdd(c, 'RELEASE', EDD_SLA_MIN + 300);
    expect(store.getState().reviews['LATE-1']).toMatchObject({ state: 'EDD_CLEARED', points: 5 });
  });

  it('draws the stalling case with its two exact buttons, and the documents case with three', () => {
    const c = caseWith(true, null);
    const stall = renderToStaticMarkup(createElement(EddPanel, { c, record: overdue(c, 9999), now: 9999, m: en }));
    expect(stall).toContain('data-timeline="STALLING"');
    expect(msgs.eddSarStall.vi).toBe('🚨 Lập Báo cáo SAR (Cố tình không nộp / Nghi vấn)');
    expect(msgs.eddUnlock.vi).toBe('🔓 Tự ý Mở khóa (Duyệt khi KHÔNG có chứng từ)');
    expect(stall).toContain('data-testid="aml-edd-sar"');
    expect(stall).toContain('data-testid="aml-edd-unlock"');
    expect(stall).not.toContain('data-testid="aml-edd-approve"');
    const docs = renderToStaticMarkup(createElement(EddPanel, { c: caseWith(false, 60), record: requested(caseWith(false, 60)), now: 60, m: en }));
    for (const id of ['approve', 'sar', 'reject']) expect(docs).toContain(`data-testid="aml-edd-${id}"`);
    expect(bundleProblems(amlDecisionMessages)).toEqual([]);
  });

  it('keeps the bank clock following an overdue case, with the desk closed', () => {
    const c = caseWith(false, EDD_SLA_MIN + 100, 'CLOCK-1');
    const store = createAmlStore();
    store.getState().decide(c, 'REQUEST_EDD', 0);
    store.getState().tick([c], EDD_SLA_MIN + 5);
    expect(store.getState().reviews['CLOCK-1']!.state).toBe('EDD_EXPIRED');
    expect(bankStore.getState().auditLog.at(-1)).toMatchObject({ statusCode: 'EDD_SLA_EXPIRED', caseId: 'CLOCK-1' });
  });
});

describe('the SWIFT desk’s FX hold, the retail filter and the header shortcuts', () => {
  it('filters Task 5 to one scenario: only its cases, in order', () => {
    const deck = retailDeck('swift', 0, 6, 'FX_VOLATILITY');
    expect(deck.every((c) => c.retail?.id === 'FX_VOLATILITY')).toBe(true);
    expect(new Set(deck.map((c) => c.id)).size).toBe(6);
    expect(retailDeck('swift', nextRetailSeq('swift', 0, 'FX_VOLATILITY'), 1, 'FX_VOLATILITY')[0]!.id).toBe(deck[0]!.id);
    // A scenario the desk does not work leaves the queue as it is.
    expect(nextRetailSeq('swift', 3, 'NPL_PROVISION')).toBe(3);
    expect(analystWorkspaceMessages.messages.retail_FX_VOLATILITY_title.vi).toBe('🚨 TẠM GIỮ ĐIỆN SWIFT (FX Volatility > ±2%)');
  });

  it('moves the store to the filtered scenario and keeps it there after each decision', () => {
    const s = bankStore.getState();
    s.openStaffDesk('GATE_SWIFT');
    bankStore.getState().setStaffTask(5);
    bankStore.getState().setRetailFocus('FX_VOLATILITY');
    const seq = bankStore.getState().staffTaskSeq;
    expect(seq).toBe(nextRetailSeq('swift', 0, 'FX_VOLATILITY'));
    bankStore.getState().setStaffTask(1);
    expect(bankStore.getState().retailFocus).toBeNull();
    bankStore.getState().closeStaffDesk();
  });

  it('shows the SWIFT hold chip first, and the Treasury check holding a >±2% move and releasing within the band', () => {
    const m = ((key: string, v?: Record<string, string | number>) => Object.entries(v ?? {}).reduce((t, [k, x]) => t.split(`{${k}}`).join(String(x)), analystWorkspaceMessages.messages[key as keyof typeof analystWorkspaceMessages.messages].en)) as Parameters<typeof TreasuryCheck>[0]['m'];
    const chips = renderToStaticMarkup(createElement(RetailFocusChips, { role: 'swift', m }));
    const order = RETAIL_DESK.swift.map((id) => chips.indexOf(`retail-focus-${id}`));
    expect(order[RETAIL_DESK.swift.indexOf('FX_VOLATILITY')]).toBe(Math.min(...order));
    const deck = retailDeck('swift', 0, 20, 'FX_VOLATILITY');
    for (const c of [deck.find((x) => x.expected === 'REJECT')!, deck.find((x) => x.expected === 'APPROVE')!]) {
      const html = renderToStaticMarkup(createElement(TreasuryCheck, { current: c, m, initiallyConfirmed: true }));
      expect(html).toContain(`data-beyond="${c.expected === 'REJECT'}"`);
    }
    expect(renderToStaticMarkup(createElement(TreasuryCheck, { current: deck[0]!, m }))).toContain('data-testid="workspace-treasury-call"');
  });

  it('keeps the library in the header, and the retail tab one click inside it', () => {
    const html = renderToStaticMarkup(createElement(KnowledgeShortcuts));
    // Only the library stays in the header (its tabs reach the retail guides), with the feedback button.
    expect(html).not.toContain('data-testid="kb-open-retail"');
    expect(html).toContain('data-testid="kb-open-library"');
    expect(html).toContain('data-testid="feedback-open"');
    const ui = createUiStore({ storage: null });
    ui.getState().openKnowledge(null, 'retail');
    expect(ui.getState()).toMatchObject({ overlay: 'knowledge', knowledgeTab: 'retail' });
  });
});
