import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { carriesOver, DECISIONS, EDD_SLA_MIN, fiuDirective, fiuDueAt, FREEZE_QUADRANTS, GRADE_BANDS, LEAK, quadrantOf, resolveEscalation, reviewEdd, REWARD, sarRef, typologyCases, WRONG_FREEZE, WRONG_SAR, type CaseRecord, type ReviewCase } from '../amlReview';
import { GL_ACCOUNTS } from '../staffRoleplay';
import { createAmlStore } from '../../store/amlStore';
import { bankStore } from '../../store/bankStore';
import { DEFAULT_SOD_TOP, NOTICE_GAP, NOTICE_MAX, NOTICE_STAGGER_MS, NOTICE_TTL_MS, noticeTop, notificationStore, pumpNotices, type Notice, type NoticeQueue } from '../../store/notificationStore';
import { createUiStore, knowledgeTabOf } from '../../store/uiStore';
import { amlDecisionMessages } from '../../components/ops/amlDecision.messages';
import { AmlArticle, KnowledgeTabs, RetailArticle } from '../../components/knowledge/KnowledgeBaseModal';
import { CaseActions } from '../../components/ops/AmlReview';
import { RETAIL_GUIDES, UNGUIDED_SCENARIOS } from '../../data/retailKnowledge';
import { buildSearchIndex, searchIndex } from '../../hooks/useSearchIndex';
import { uiStore } from '../../store/uiStore';
import { knowledgeBaseMessages } from '../../components/knowledge/knowledgeBase.messages';
import { AML_ARTICLE, AML_DECISION_MATRIX } from '../../data/amlKnowledge';
import { bundleProblems } from '../../utils/i18nHelper';

const base = typologyCases(7, 1)[0]!;
const caseOf = (laundering: boolean, id = laundering ? 'T-dirty' : 'T-clean'): ReviewCase => ({ ...base, id, laundering });
const sum = (lines: readonly { dr: number; cr: number }[]): number => lines.reduce((s, l) => s + l.dr - l.cr, 0);
const msgs = amlDecisionMessages.messages;

describe('the freeze/release matrix, the penalty tiers and the FIU’s answer', () => {
  it('fines a legitimate customer’s freeze at once: $20,000 to 5510, −15 points, and the customer at the branch', () => {
    const out = DECISIONS.FREEZE.apply(caseOf(false), 600);
    expect(out).toMatchObject({ feedback: 'WRONG_FREEZE', escalates: true });
    expect(out.record).toMatchObject({ fineCents: WRONG_FREEZE.fineCents, points: -WRONG_FREEZE.points, escalation: 'PENDING' });
    expect(out.commands.map((c) => c.kind)).toEqual(['FREEZE', 'FINE']);
    expect(out.commands[1]!.lines).toEqual([{ gl: 'REGULATORY_PENALTY_EXPENSE', dr: 2_000_000, cr: 0 }, { gl: 'INTERBANK_SETTLEMENT', dr: 0, cr: 2_000_000 }]);
    // Freezing real laundering costs nothing.
    const right = DECISIONS.FREEZE.apply(caseOf(true), 600);
    expect(right.feedback).toBeUndefined();
    expect(right.record.fineCents).toBe(0);
  });

  it('files a SAR silently with nothing granted or charged: no points, the FIU’s answer due in 1–2 days', () => {
    for (const dirty of [true, false]) {
      const out = DECISIONS.FILE_SAR.apply(caseOf(dirty), 600);
      expect(out).toMatchObject({ feedback: 'SAR_SUBMITTED', record: { state: 'SAR_FILED', fineCents: 0, points: 0, blacklisted: true } });
      expect(out.record.fiuDue).toBe(fiuDueAt(caseOf(dirty), 600));
      expect(out.commands.map((c) => c.kind)).toEqual(['FREEZE']);
    }
    expect(sarRef(caseOf(true))).toMatch(/^SAR-\d{4}$/);
  });

  it('has the FIU seize a valid SAR’s money (2930 → 2110, +15), and reject a false one (money back, $30,000, −20)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 10 }), fc.nat(20_000), (id, at) => {
        const due = fiuDueAt({ id }, at);
        expect(due - at).toBeGreaterThanOrEqual(1440);
        expect(due - at).toBeLessThan(2880);
      }),
    );
    const c = caseOf(true);
    const r = DECISIONS.FILE_SAR.apply(c, 600).record;
    expect(fiuDirective(c, r, r.fiuDue! - 1).record).toBe(r);
    const out = fiuDirective(c, r, r.fiuDue!);
    expect(out).toMatchObject({ feedback: 'FIU_SEIZED', record: { state: 'SEIZED', points: 15, fiuDue: null } });
    expect(out.commands[0]!.lines).toEqual([{ gl: 'FROZEN_ASSETS', dr: c.amountCents, cr: 0 }, { gl: 'GOV_ASSET_RECOVERY', dr: 0, cr: c.amountCents }]);
    expect(GL_ACCOUNTS.find((a) => a.id === 'GOV_ASSET_RECOVERY')).toMatchObject({ code: '2110', side: 'liability' });
    expect(fiuDirective(c, out.record, r.fiuDue! + 9999).commands).toEqual([]);
    const legit = caseOf(false);
    const r2 = DECISIONS.FILE_SAR.apply(legit, 600).record;
    const no = fiuDirective(legit, r2, r2.fiuDue!);
    expect(no).toMatchObject({ feedback: 'FIU_REJECTED', record: { state: 'SAR_REJECTED', fineCents: WRONG_SAR.fineCents, points: -WRONG_SAR.points, blacklisted: false } });
    expect(no.commands.map((x) => x.kind)).toEqual(['UNFREEZE', 'FINE']);
    expect(no.commands[0]!.lines).toEqual([{ gl: 'FROZEN_ASSETS', dr: legit.amountCents, cr: 0 }, { gl: 'CASA', dr: 0, cr: legit.amountCents }]);
  });

  it('puts every settled hold or release in one of the four quadrants, and fines exactly the two wrong ones at once', () => {
    const cases = { dirty: caseOf(true), clean: caseOf(false) };
    const frozen = (c: ReviewCase) => resolveEscalation(c, DECISIONS.FREEZE.apply(c, 0).record, true);
    const released = (c: ReviewCase) => DECISIONS.FALSE_POSITIVE.apply(c, 0);
    expect(quadrantOf(cases.dirty, frozen(cases.dirty).record)).toBe('VALID_FREEZE');
    expect(quadrantOf(cases.clean, DECISIONS.FREEZE.apply(cases.clean, 0).record)).toBe('WRONG_FREEZE');
    expect(quadrantOf(cases.clean, released(cases.clean).record)).toBe('VALID_RELEASE');
    expect(quadrantOf(cases.dirty, released(cases.dirty).record)).toBe('LEAK');
    expect(DECISIONS.FREEZE.apply(cases.dirty, 0).record.fineCents).toBe(0);
    expect(DECISIONS.FREEZE.apply(cases.clean, 0).record.fineCents).toBe(WRONG_FREEZE.fineCents);
    expect(released(cases.clean).record.fineCents).toBe(0);
    expect(released(cases.dirty).record.fineCents).toBe(LEAK.fineCents);
    // A SAR waits for the FIU; an open case is in no quadrant.
    expect(quadrantOf(cases.dirty, DECISIONS.FILE_SAR.apply(cases.dirty, 0).record)).toBeNull();
    expect(quadrantOf(cases.dirty, undefined)).toBeNull();
    expect(FREEZE_QUADRANTS).toHaveLength(4);
    for (const q of FREEZE_QUADRANTS) expect(msgs[`quad_${q}` as keyof typeof msgs].vi.length).toBeGreaterThan(10);
  });

  it('releases an approved EDD back to CASA, and returns a refused one: each with its toast', () => {
    const c = { ...caseOf(false), edd: { kind: 'VAT_INVOICE' as const, genuine: true, uploadAfterMin: 60 } };
    const r = DECISIONS.REQUEST_EDD.apply(c, 0).record;
    const ok = reviewEdd(c, r, true, 60);
    expect(ok).toMatchObject({ feedback: 'EDD_APPROVED', record: { state: 'EDD_CLEARED' } });
    expect(ok.commands[0]!.lines).toEqual([{ gl: 'CLEARING_SUSPENSE', dr: c.amountCents, cr: 0 }, { gl: 'CASA', dr: 0, cr: c.amountCents }]);
    expect(reviewEdd(c, r, false, 60)).toMatchObject({ feedback: 'EDD_REFUSED', record: { state: 'EDD_REJECTED' } });
    expect(msgs.toastEddApproved.vi).toBe('✅ ĐÃ GIẢI PHÓNG GIAO DỊCH: Đã duyệt chứng từ EDD cho {name}. Giải tỏa số tiền về tài khoản CASA thành công!');
    expect(msgs.toastEddRefused.vi).toBe('🚫 ĐÃ TỪ CHỐI & HOÀN TRẢ: Không chấp nhận chứng từ EDD. Giao dịch đã bị từ chối và hoàn tiền về cho khách hàng!');
  });

  it('balances every journal of every path, on either truth', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.constantFrom(...(['FALSE_POSITIVE', 'FREEZE', 'REQUEST_EDD', 'FILE_SAR'] as const)), fc.string({ minLength: 1, maxLength: 8 }), (dirty, path, id) => {
        for (const cmd of DECISIONS[path].apply(caseOf(dirty, id), 0).commands) expect(sum(cmd.lines)).toBe(0);
      }),
    );
  });

  it('lets the FIU’s seizure lift the grade, and each penalty tier pull it down', () => {
    expect(GRADE_BANDS.find(([min]) => 85 >= min)![1]).toBe('B');
    expect(LEAK.points).toBe(10);
    expect([WRONG_FREEZE.points, WRONG_SAR.points]).toEqual([15, 20]);
    expect(REWARD.validSar + REWARD.seizure).toBe(15);
    expect(msgs.toastFiuSeized.vi).toBe(
      '🏛️ THÔNG BÁO TỪ CỤC PHÒNG CHỐNG RỬA TIỀN (FIU): Tiếp nhận Báo cáo SAR #{ref}. Cơ quan công an ra Quyết định Tịch thu số tiền {amount} vào Quỹ Thu hồi Tài sản Nhà nước. Ngân hàng được thưởng +15 Điểm Tuân thủ!',
    );
    expect(msgs.state_SAR_FILED.vi).toBe('🏛️ Đã gửi SAR (Chờ FIU)');
    expect(bundleProblems(amlDecisionMessages)).toEqual([]);
  });
});

describe('the desk’s toasts and follow-ups through the store', () => {
  beforeEach(() => notificationStore.getState().clear());

  it('acknowledges a SAR at once, then raises the FIU’s green seizure banner when it is due (booked 2930 → 2110)', () => {
    const store = createAmlStore();
    const c = { ...caseOf(true), id: 'SAR-OK' };
    store.getState().decide(c, 'FILE_SAR', 600);
    expect(notificationStore.getState().queue).toMatchObject([{ tone: 'info', source: 'SAR-OK', deferred: false }]);
    const due = store.getState().reviews['SAR-OK']!.fiuDue!;
    store.getState().tick([c], due - 1);
    expect(store.getState().reviews['SAR-OK']!.state).toBe('SAR_FILED');
    store.getState().tick([c], due);
    expect(store.getState().reviews['SAR-OK']!.state).toBe('SEIZED');
    const banner = notificationStore.getState().queue.at(-1)!;
    expect(banner).toMatchObject({ tone: 'success', deferred: true, source: 'SAR-OK' });
    expect(banner.title.vi).toContain(`#${sarRef(c)}`);
    expect(banner.title.vi).toContain('$10,500');
    expect(bankStore.getState().auditLog.at(-1)).toMatchObject({ statusCode: 'FIU_SEIZED', caseId: 'SAR-OK' });
  });

  it('raises a red toast at once for a wrongful freeze, and when the FIU rejects a false SAR, with each fine posted', () => {
    const store = createAmlStore();
    store.getState().decide({ ...caseOf(false), id: 'WF' }, 'FREEZE', 600);
    const ws = { ...caseOf(false), id: 'WS' };
    store.getState().decide(ws, 'FILE_SAR', 600);
    store.getState().tick([ws], store.getState().reviews.WS!.fiuDue!);
    const q = notificationStore.getState().queue;
    expect(q.map((n) => [n.tone, n.source])).toEqual([
      ['danger', 'WF'],
      ['info', 'WS'],
      ['danger', 'WS'],
    ]);
    expect(q[0]!.body?.en).toContain('$20,000');
    expect(q[2]!.body?.en).toContain('$30,000');
    expect(store.getState().reviews.WS!.state).toBe('SAR_REJECTED');
    expect(bankStore.getState().auditLog.slice(-1)[0]).toMatchObject({ statusCode: 'AML_WRONG_SAR_FINE', amountCents: WRONG_SAR.fineCents, compliance: 'SOP_BREACH' });
  });

  it('toasts the EDD outcome, and announces the customer’s documents once, a click opening the AML desk on the case', () => {
    const store = createAmlStore();
    const c = { ...caseOf(false), id: 'DOC-1', edd: { kind: 'VAT_INVOICE' as const, genuine: true, uploadAfterMin: 90 } };
    store.getState().decide(c, 'REQUEST_EDD', 600);
    store.getState().tick([c], 689);
    expect(notificationStore.getState().queue).toHaveLength(0);
    store.getState().tick([c], 690);
    store.getState().tick([c], 700);
    const docs = notificationStore.getState().queue;
    expect(docs).toHaveLength(1);
    expect(docs[0]!.title.vi).toBe('📄 CHỨNG TỪ MỚI: Khách hàng ' + c.subject + ' vừa nộp bổ sung chứng từ nguồn tiền cho Case #DOC-1. Click để mở Bàn AML xem ngay!');
    docs[0]!.onOpen!();
    expect(uiStore.getState()).toMatchObject({ overlay: 'aml', amlFocus: 'DOC-1' });
    uiStore.getState().clearAmlFocus();
    uiStore.getState().close();
    store.getState().judgeEdd(c, 'RELEASE', 700);
    expect(notificationStore.getState().queue.at(-1)).toMatchObject({ tone: 'success', source: 'DOC-1' });
    expect(notificationStore.getState().queue.at(-1)!.title.vi).toContain(c.subject);
  });

  it('sends the view back to the list when the EDD proof is approved or rejected, so the screen is never left blank', () => {
    const c = { ...caseOf(false), id: 'EDD-UI', edd: { kind: 'VAT_INVOICE' as const, genuine: true, uploadAfterMin: 0 } };
    const html = renderToStaticMarkup(createElement(CaseActions, { c, now: 0, onResolved: () => undefined }));
    expect(html).toContain('data-testid="aml-paths"');
    // The approve / reject handlers call onResolved (exercised through the store: judging settles the case).
    const store = createAmlStore();
    store.getState().decide(c, 'REQUEST_EDD', 0);
    store.getState().judgeEdd(c, 'REFUSE', 0);
    expect(store.getState().reviews['EDD-UI']!.state).toBe('EDD_REJECTED');
    expect(carriesOver(store.getState().reviews['EDD-UI'])).toBe(false);
  });

  it('keeps an EDD’s SLA across the night: out of time on the next day, frozen silently with an alert', () => {
    const store = createAmlStore();
    const c = { ...caseOf(true), id: 'EDD-N', edd: { kind: 'VAT_INVOICE' as const, genuine: false, uploadAfterMin: EDD_SLA_MIN + 500 } };
    store.getState().decide(c, 'REQUEST_EDD', 20 * 60);
    // Day 2, 19:59: still pending; 20:00: expired.
    store.getState().tick([c], 1440 + 20 * 60 - 1);
    expect(store.getState().reviews['EDD-N']!.state).toBe('PENDING_EDD');
    store.getState().tick([c], 1440 + 20 * 60);
    expect(store.getState().reviews['EDD-N']!.state).toBe('EDD_EXPIRED');
    expect(notificationStore.getState().queue.at(-1)).toMatchObject({ tone: 'warning', deferred: true });
    expect(bankStore.getState().auditLog.at(-1)).toMatchObject({ statusCode: 'EDD_SLA_EXPIRED' });
  });
});

describe('cases across the day’s rollover', () => {
  const rec = (state: CaseRecord['state']): CaseRecord => ({ state, path: 'FREEZE', decidedAt: 0, fineCents: 0, points: 0, escalation: 'NONE', eddDue: null, eddUploadAt: null, blacklisted: false, tipOffs: 0, fiuDue: null });

  it('carries the open, pending, frozen and reported cases over; the settled ones stay behind', () => {
    expect(carriesOver(undefined)).toBe(true);
    for (const s of ['PENDING_EDD', 'ESCALATED', 'FROZEN', 'EDD_EXPIRED', 'SAR_FILED', 'SEIZED'] as const) expect(carriesOver(rec(s)), s).toBe(true);
    for (const s of ['RELEASED', 'TEMP_RELEASED', 'EDD_CLEARED', 'EDD_REJECTED'] as const) expect(carriesOver(rec(s)), s).toBe(false);
    // A case keeps the day it turned up on.
    expect(typologyCases(7, 4).every((c) => c.day === 4)).toBe(true);
  });

  it('keeps each monitoring alert once, with its day and its payments', () => {
    const store = createAmlStore();
    const alert = { id: 'LV-d1-1', kind: 'LARGE_VALUE' as const, minute: 600, amountCents: 1_250_000, count: 1, txIds: ['t1'], scenario: 'x', riskScore: 70, approved: 1 };
    const log = [{ id: 't1', minute: 600, amountCents: 1_250_000 }] as never[];
    store.getState().keepAlerts(1, [alert], log);
    store.getState().keepAlerts(2, [alert], []);
    expect(store.getState().alerts['LV-d1-1']).toMatchObject({ day: 1, rows: [{ id: 't1' }] });
  });
});

describe('Location A and Location B', () => {
  const n = (id: number, deferred = false): Notice => ({ id, tone: 'info', icon: 'i', title: { en: `${id}`, vi: `${id}.` }, deferred });
  const q = (queue: Notice[]): NoticeQueue => ({ queue, shown: [], lastAt: -Infinity });

  it('puts Location B right under the start-of-day banner while it shows, and where it stood once it has gone', () => {
    expect(noticeTop({ open: true, top: 80, bottom: 260 })).toBe(260 + NOTICE_GAP);
    expect(noticeTop({ open: false, top: 80, bottom: 260 })).toBe(80);
    expect(notificationStore.getState().sod).toMatchObject({ open: false, top: DEFAULT_SOD_TOP });
  });

  it('brings the toasts in one at a time, a beat apart, at most three, and fades each out after its time', () => {
    let s = pumpNotices(q([n(1), n(2), n(3), n(4)]), 0, false);
    expect(s.shown.map((x) => x.id)).toEqual([1]);
    s = pumpNotices(s, NOTICE_STAGGER_MS - 1, false);
    expect(s.shown).toHaveLength(1);
    for (let t = NOTICE_STAGGER_MS; t <= 4 * NOTICE_STAGGER_MS; t += NOTICE_STAGGER_MS) s = pumpNotices(s, t, false);
    expect(s.shown.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(s.shown.length).toBeLessThanOrEqual(NOTICE_MAX);
    s = pumpNotices(s, NOTICE_TTL_MS + 1, false);
    expect(s.shown.map((x) => x.id)).not.toContain(1);
    expect(s.shown.map((x) => x.id)).toContain(4);
  });

  it('holds the ones that arrived on their own until the start-of-day banner has gone; the learner’s own feedback shows at once', () => {
    let s = pumpNotices(q([n(1, true), n(2)]), 0, true);
    expect(s.shown.map((x) => x.id)).toEqual([2]);
    s = pumpNotices(s, NOTICE_STAGGER_MS, true);
    expect(s.shown.map((x) => x.id)).toEqual([2]);
    s = pumpNotices(s, 2 * NOTICE_STAGGER_MS, false);
    expect(s.shown.map((x) => x.id)).toEqual([2, 1]);
  });
});

describe('the Knowledge Base’s tabs', () => {
  it('opens on the tab of wherever it was opened from, and closing returns there', () => {
    const ui = createUiStore({ storage: null });
    ui.getState().open('aml');
    ui.getState().openKnowledge(null, 'aml');
    expect(ui.getState()).toMatchObject({ overlay: 'knowledge', knowledgeTab: 'aml' });
    ui.getState().setKnowledgeTab('core');
    expect(ui.getState().knowledgeTab).toBe('core');
    ui.getState().closeKnowledge();
    expect(ui.getState().overlay).toBe('aml');
    // From the ledger (no overlay open): the core ledger tab; an anchor finds its own tab.
    ui.getState().close();
    ui.getState().openKnowledge('core-ledger');
    expect(ui.getState().knowledgeTab).toBe('core');
    ui.getState().closeKnowledge();
    expect(ui.getState().overlay).toBe('none');
    expect(knowledgeTabOf('aml-rules')).toBe('aml');
    expect(knowledgeTabOf('gl-NOSTRO')).toBe('core');
  });

  it('renders the tab bar and the AML article: the 3 stages, the 3 patterns, the legal rules, golden rules and comparison tables', () => {
    const tabs = renderToStaticMarkup(createElement(KnowledgeTabs, { tab: 'aml', onTab: () => undefined }));
    expect(tabs).toContain('data-testid="kb-tab-core"');
    expect(tabs).toMatch(/data-testid="kb-tab-aml"[^>]*|aria-selected="true"[^>]*data-testid="kb-tab-aml"/);
    expect(knowledgeBaseMessages.messages.tabCore.vi).toContain('Sổ cái lõi');
    expect(knowledgeBaseMessages.messages.tabAml.vi).toContain('Tuân thủ AML');
    const out = renderToStaticMarkup(createElement(AmlArticle, { view: 'advanced' }));
    for (const id of ['aml-stages', 'aml-typologies', 'aml-rules']) expect(out).toContain(`data-section="${id}"`);
    const titles = AML_ARTICLE.sections.map((s) => s.title.vi);
    for (const t of ['1. 3 Giai đoạn Rửa tiền', '2. 3 Mẫu hình Gian lận AML', '3. Quy định Pháp lý & Tuân thủ']) expect(titles).toContain(t);
    expect(out.split('data-testid="kb-golden-rule"').length - 1).toBe(AML_ARTICLE.sections.length);
    // Basic hides the legal foundations; Advanced shows them.
    const basic = renderToStaticMarkup(createElement(AmlArticle, { view: 'basic' }));
    expect(basic).toContain('data-section="aml-concepts"');
    expect(basic).not.toContain('data-section="aml-legal"');
    expect(out).toContain('data-section="aml-legal"');
    for (const law of ['14/2022/QH15', '19/2023', '09/2023/TT-NHNN', '400,000,000']) expect(out).toContain(law);
    expect(out).toContain('data-testid="kb-flow-aml-redflags"');
    expect(out).toContain('data-testid="kb-table-aml-rules"');
    expect(out).toContain('data-advanced="aml-rules"');
    // The matrix is the engine's own numbers.
    expect(AML_DECISION_MATRIX.rows.map((r) => r[2]!.en)).toEqual(['0', '−15', '0', '−10', '+15', '−20']);
    for (const s of AML_ARTICLE.sections) for (const p of [s.title, ...s.paragraphs, ...s.advanced]) expect(p.vi, s.id).not.toBe(p.en);
    expect(bundleProblems(knowledgeBaseMessages)).toEqual([]);
  });
});

describe('the bank’s clock follows up without the desk', () => {
  it('remembers every decided case, so the follow-ups do not need the panel open', () => {
    const store = createAmlStore();
    const c = { ...caseOf(true), id: 'MEM-1' };
    store.getState().decide(c, 'FILE_SAR', 600);
    expect(store.getState().decided['MEM-1']).toEqual(c);
  });
});

describe('the retail tab and the search', () => {
  it('covers the 11 retail themes and every queue scenario, on both levels, with an SOP flow and a decision tree each', () => {
    expect(RETAIL_GUIDES).toHaveLength(11);
    expect(UNGUIDED_SCENARIOS).toEqual([]);
    const basic = renderToStaticMarkup(createElement(RetailArticle, { view: 'basic' }));
    const advanced = renderToStaticMarkup(createElement(RetailArticle, { view: 'advanced' }));
    const scenarios = RETAIL_GUIDES.flatMap((g) => g.scenarios).length;
    for (const html of [basic, advanced]) {
      expect(html.split('data-testid="kb-sop-flow"').length - 1).toBe(scenarios);
      expect(html.split('data-testid="kb-decision-tree"').length - 1).toBe(scenarios);
      // Every step and risk resolved to real copy, not a missing key.
      expect(html).not.toMatch(/retail_[A-Z_]+_(sop|title)|risk_retail_|scene_retail_/);
    }
    expect(basic).not.toContain('data-advanced="retail-npl"');
    expect(advanced).toContain('data-advanced="retail-npl"');
    expect(advanced).toContain('11/2021/TT-NHNN');
    expect(knowledgeBaseMessages.messages.tabRetail.vi).toContain('Nghiệp vụ bán lẻ');
  });

  it('finds the AML sections, the retail guides and the retail SOPs in Ctrl+K, each opening its own tab', () => {
    const index = buildSearchIndex('expert', 'vi');
    const hit = (q: string) => searchIndex(index, q).groups.kb.map((e) => e.action);
    expect(hit('no xau')).toContainEqual({ kind: 'knowledge', anchor: 'retail-npl' });
    expect(hit('tipping')).toContainEqual({ kind: 'knowledge', anchor: 'aml-rules' });
    expect(hit('vietqr')).toContainEqual({ kind: 'knowledge', anchor: 'retail-wallet-qr' });
    expect(hit('MT103')).toContainEqual({ kind: 'knowledge', anchor: 'retail-fx' });
    const ui = createUiStore({ storage: null });
    ui.getState().openKnowledge('retail-npl');
    expect(ui.getState().knowledgeTab).toBe('retail');
    ui.getState().openKnowledge('aml-legal');
    expect(ui.getState().knowledgeTab).toBe('aml');
  });
});
