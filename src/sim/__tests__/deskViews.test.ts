import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setActiveLocale } from '../../i18n/locale';
import { badgeOfState, DECISIONS, deskBadge, DESK_FILTERS, EDD_SLA_MIN, HISTORY_CAP, HISTORY_PAGE, inDeskFilter, isResolved, overHistoryCap, typologyCases, type CaseRecord, type CaseState, type ReviewCase } from '../amlReview';
import { createAmlStore } from '../../store/amlStore';
import { amlDecisionMessages } from '../../components/ops/amlDecision.messages';
import { DEFAULT_DESK_VIEW, deskList, DeskListControls, HistoryFooter, StateBadge } from '../../components/ops/AmlReview';
import { AppFooter, AUTHOR_URL } from '../../components/shell/AuthorLink';
import { creditsMessages } from '../../components/shell/credits.messages';
import { FEEDBACK_EMAIL, feedbackMailto } from '../../components/shell/FeedbackModal';
import { KnowledgeDisclaimer } from '../../components/knowledge/KnowledgeBaseModal';
import { bundleProblems } from '../../utils/i18nHelper';

const msgs = amlDecisionMessages.messages;
const en = ((key: keyof typeof msgs, v?: Record<string, string | number>) => Object.entries(v ?? {}).reduce((t, [k, x]) => t.split(`{${k}}`).join(String(x)), msgs[key].en)) as Parameters<typeof StateBadge>[0]['m'];
const rec = (state: CaseState, extra: Partial<CaseRecord> = {}): CaseRecord => ({ state, path: 'FREEZE', decidedAt: 0, fineCents: 0, points: 0, escalation: 'NONE', eddDue: null, eddUploadAt: null, blacklisted: false, tipOffs: 0, fiuDue: null, ...extra });
const base = typologyCases(7, 1)[0]!;

afterEach(() => setActiveLocale('en'));

describe('the seven badges, from where a case truly stands', () => {
  it('tells documents in from awaiting documents, late from overdue, and the FIU stages apart', () => {
    const c: ReviewCase = { ...base, id: 'B-1', laundering: false, edd: { kind: 'VAT_INVOICE', genuine: true, uploadAfterMin: 120 } };
    const r = DECISIONS.REQUEST_EDD.apply(c, 0).record;
    expect(deskBadge(r, 60)).toBe('PENDING_EDD');
    expect(deskBadge(r, 120)).toBe('EDD_DOCS');
    expect(deskBadge(rec('EDD_LATE_DOCS'), 0)).toBe('EDD_LATE_DOCS');
    expect(deskBadge(rec('EDD_EXPIRED'), 0)).toBe('EDD_EXPIRED');
    expect(deskBadge(rec('SAR_FILED'), 0)).toBe('SAR_FILED');
    expect(deskBadge(rec('SEIZED'), 0)).toBe('SEIZED');
    for (const s of ['RELEASED', 'TEMP_RELEASED', 'EDD_CLEARED'] as const) expect(badgeOfState(s)).toBe('DONE');
    expect(deskBadge(undefined, 0)).toBe('OPEN');
    const labels = { PENDING_EDD: '⏳ Chờ chứng từ (SLA 24h)', EDD_DOCS: '📄 Đã có chứng từ (Chờ thẩm định)', EDD_LATE_DOCS: '📄 Đã có chứng từ (Nộp trễ)', EDD_EXPIRED: '⌛ Quá hạn EDD - Chưa có chứng từ', SAR_FILED: '🏛️ Đã gửi SAR (Chờ FIU)', SEIZED: '🏛️ Đã tịch thu (FIU)', DONE: '✅ Đã giải phóng / Hoàn tất' };
    for (const [b, vi] of Object.entries(labels)) expect(msgs[`state_${b}` as keyof typeof msgs].vi, b).toBe(vi);
    const html = renderToStaticMarkup(createElement(StateBadge, { record: r, now: 120, m: en }));
    expect(html).toContain('data-state="EDD_DOCS"');
  });
});

describe('the desk’s filters, sort and history', () => {
  const items = [
    { id: 'open', r: undefined, t: 5 },
    { id: 'wait', r: rec('PENDING_EDD', { eddDue: 9999, eddUploadAt: 9000 }), t: 4 },
    { id: 'docs', r: rec('PENDING_EDD', { eddDue: 9999, eddUploadAt: 10 }), t: 3 },
    { id: 'late', r: rec('EDD_LATE_DOCS'), t: 2 },
    { id: 'over', r: rec('EDD_EXPIRED'), t: 1 },
    { id: 'sar', r: rec('SAR_FILED'), t: 6 },
    { id: 'done', r: rec('RELEASED'), t: 7 },
  ];
  const view = (filter: (typeof DESK_FILTERS)[number], sort: 'NEWEST' | 'OLDEST' = 'NEWEST') => deskList(items, { ...DEFAULT_DESK_VIEW, filter, sort }, (x) => x.r, (x) => x.t, 100).shown.map((x) => x.id);

  it('opens on “needs action”, newest first, hiding what is resolved', () => {
    expect(DEFAULT_DESK_VIEW).toEqual({ filter: 'ACTION', sort: 'NEWEST', page: 0 });
    expect(view('ACTION')).toEqual(['open', 'wait', 'docs', 'late', 'over']);
    expect(view('ACTION', 'OLDEST')).toEqual(['over', 'late', 'docs', 'wait', 'open']);
    expect(view('DOCS')).toEqual(['docs', 'late']);
    expect(view('WAITING')).toEqual(['wait']);
    expect(view('OVERDUE')).toEqual(['late', 'over']);
    expect(view('SAR')).toEqual(['sar']);
    expect(view('HISTORY')).toEqual(['done']);
    expect(deskList(items, DEFAULT_DESK_VIEW, (x) => x.r, (x) => x.t, 100).counts).toMatchObject({ ACTION: 5, DOCS: 2, WAITING: 1, OVERDUE: 2, SAR: 1, HISTORY: 1 });
  });

  it('pages the history 10 at a time, and notes the 200-case cap', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `h${i}`, r: rec('RELEASED'), t: i }));
    const page = (p: number) => deskList(many, { filter: 'HISTORY', sort: 'NEWEST', page: p }, (x) => x.r, (x) => x.t, 0);
    expect(page(0).pages).toBe(3);
    expect(page(0).shown.map((x) => x.id)).toEqual(Array.from({ length: HISTORY_PAGE }, (_, i) => `h${24 - i}`));
    expect(page(2).shown).toHaveLength(5);
    expect(page(9).shown).toHaveLength(5);
    const footer = renderToStaticMarkup(createElement(HistoryFooter, { view: { filter: 'HISTORY', sort: 'NEWEST', page: 0 }, onView: () => undefined, pages: 3, m: en }));
    expect(footer).toContain('data-testid="aml-history-note"');
    expect(msgs.historyNote.vi).toBe('💡 LƯU Ý HIỆU NĂNG: Để đảm bảo trải nghiệm giả lập mượt mà, hệ thống tự động lưu tối đa 200 cảnh báo mới nhất.');
    const controls = renderToStaticMarkup(createElement(DeskListControls, { view: DEFAULT_DESK_VIEW, onView: () => undefined, counts: { ACTION: 1, DOCS: 0, WAITING: 0, OVERDUE: 0, SAR: 0, HISTORY: 0 }, m: en }));
    for (const f of DESK_FILTERS) expect(controls).toContain(`data-testid="aml-filter-${f}"`);
    expect(controls).toContain('data-testid="aml-sort"');
    expect(msgs.filter_ACTION.vi).toBe('⚡ Cần xử lý');
    expect(msgs.sort_NEWEST.vi).toBe('Mới nhất ➔ Cũ nhất');
    expect(bundleProblems(amlDecisionMessages)).toEqual([]);
  });

  it('every case is in “needs action”, the SAR list or the history, never two of them', () => {
    const states: CaseState[] = ['OPEN', 'RELEASED', 'FROZEN', 'ESCALATED', 'TEMP_RELEASED', 'PENDING_EDD', 'EDD_CLEARED', 'EDD_REJECTED', 'EDD_EXPIRED', 'EDD_LATE_DOCS', 'SAR_FILED', 'SEIZED', 'SAR_REJECTED'];
    fc.assert(
      fc.property(fc.constantFrom(...states), fc.boolean(), (s, docs) => {
        const r = rec(s, s === 'PENDING_EDD' ? { eddDue: 100, eddUploadAt: docs ? 10 : 50 } : {});
        const now = docs ? 20 : 20;
        const homes = (['ACTION', 'SAR', 'HISTORY'] as const).filter((f) => inDeskFilter(f, r, now));
        expect(homes).toHaveLength(1);
        expect(isResolved(r)).toBe(homes[0] === 'HISTORY');
      }),
    );
  });
});

describe('the 200-case rolling history', () => {
  it('prunes only resolved cases, oldest first, above the cap', () => {
    const reviews: Record<string, CaseRecord> = {};
    for (let i = 0; i < HISTORY_CAP + 5; i++) reviews[`done-${i}`] = rec('RELEASED', { decidedAt: i });
    for (let i = 0; i < 30; i++) reviews[`active-${i}`] = rec('PENDING_EDD', { decidedAt: -1 });
    expect(overHistoryCap(reviews)).toEqual(['done-0', 'done-1', 'done-2', 'done-3', 'done-4']);
    expect(overHistoryCap({ a: rec('RELEASED') })).toEqual([]);
  });

  it('keeps the store at 200 resolved cases, never pruning active work, and never brings a pruned case back', () => {
    const store = createAmlStore();
    const c = (i: number): ReviewCase => ({ ...base, id: `P-${i}`, laundering: false });
    store.getState().decide({ ...base, id: 'ACTIVE', laundering: false, edd: { kind: 'VAT_INVOICE', genuine: true, uploadAfterMin: EDD_SLA_MIN * 9 } }, 'REQUEST_EDD', 0);
    for (let i = 0; i < HISTORY_CAP + 3; i++) store.getState().decide(c(i), 'FALSE_POSITIVE', 10 + i);
    const reviews = store.getState().reviews;
    expect(Object.values(reviews).filter(isResolved)).toHaveLength(HISTORY_CAP);
    expect(reviews.ACTIVE?.state).toBe('PENDING_EDD');
    expect(reviews['P-0']).toBeUndefined();
    expect(store.getState().pruned).toMatchObject({ 'P-0': true, 'P-1': true, 'P-2': true });
    store.getState().keepAlerts(1, [{ id: 'P-0', kind: 'LARGE_VALUE', minute: 0, amountCents: 1, count: 1, txIds: [], scenario: '', riskScore: 1, approved: 0 }], []);
    expect(store.getState().alerts['P-0']).toBeUndefined();
  });
});

describe('the author’s credit and the feedback form', () => {
  it('credits the author in the footer and the Knowledge Base, by language, linked to LinkedIn', () => {
    expect(AUTHOR_URL).toBe('https://www.linkedin.com/in/pnthienphuc2405/');
    const en = renderToStaticMarkup(createElement(AppFooter));
    expect(en).toContain('ProcessCraft Banking • Concept and Design by');
    expect(en).toContain('Felix Pham');
    expect(en).toContain(`href="${AUTHOR_URL}"`);
    expect(en).toContain('target="_blank"');
    setActiveLocale('vi');
    expect(renderToStaticMarkup(createElement(AppFooter))).toContain('Ý tưởng và thiết kế bởi');
    expect(renderToStaticMarkup(createElement(AppFooter))).toContain('Phúc Phạm');
    const kb = renderToStaticMarkup(createElement(KnowledgeDisclaimer));
    expect(kb).toContain('Kiến thức mô phỏng phục vụ học tập và có thể không hoàn toàn phản ánh chính xác theo thời gian thực. Nếu có điểm cần điều chỉnh, ');
    expect(kb).toContain(' rất mong nhận được đóng góp từ bạn để cập nhật hoàn thiện hơn!');
    // The name is the link, in the middle of the sentence.
    expect(kb).toMatch(/điều chỉnh, <a [^>]*data-testid="author-link"[^>]*>Phúc Phạm<\/a> rất mong/);
    expect(kb).toContain('Phúc Phạm');
    expect(creditsMessages.messages.kbDisclaimer.en).toBe('Simulated knowledge for learning purposes, which may not fully reflect real-time conditions. If anything needs adjusting, {author} would love to hear from you to keep improving it!');
    expect(bundleProblems(creditsMessages)).toEqual([]);
  });

  it('builds the mailto: the author’s address, the fixed subject, the message encoded', () => {
    const url = feedbackMailto('  Nút lọc & sắp xếp?  ', 'kindBug', 'vi');
    expect(url.startsWith(`mailto:${FEEDBACK_EMAIL}?subject=ProcessCraft%20Banking%20Feedback&body=`)).toBe(true);
    const body = decodeURIComponent(url.split('&body=')[1]!);
    expect(body).toContain('[Bug]');
    expect(body).toContain('Nút lọc & sắp xếp?');
    expect(body).toContain('VI');
    expect(url).not.toMatch(/[ &]sắp/);
  });
});
