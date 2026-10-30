import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  alertCase,
  amlScorecard,
  auditRate,
  DECISIONS,
  EDD_SLA_MIN,
  eddUploaded,
  expireEdd,
  LEAK,
  profileFor,
  REWARD,
  resolveEscalation,
  reviewEdd,
  roll,
  tipOff,
  TYPOLOGY_FACTORIES,
  typologyCases,
  volumeMultiple,
  EXTREME_MULTIPLE,
  type CaseRecord,
  type ReviewCase,
} from '../amlReview';
import { buildTaskCase, GL_ACCOUNTS, OPENING_BALANCES, openingLedger, postJournal, TILL_CEILING_CENTS, TILL_FLOAT_CENTS, TILL_FLOOR_CENTS, vaultReplenishment, VAULT_OPENING_CENTS } from '../staffRoleplay';
import { createAmlStore } from '../../store/amlStore';
import { bankStore } from '../../store/bankStore';
import { notificationStore } from '../../store/notificationStore';
import { amlDecisionMessages } from '../../components/ops/amlDecision.messages';
import { bundleProblems } from '../../utils/i18nHelper';
import { AmlScorecardView, CaseActions, KycContextCard, StateBadge } from '../../components/ops/AmlReview';

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sumsToZero = (lines: readonly { dr: number; cr: number }[]): boolean => lines.reduce((s, l) => s + l.dr - l.cr, 0) === 0;
const caseOf = (laundering: boolean, id = laundering ? 'X-dirty' : 'X-clean'): ReviewCase => ({ ...typologyCases(7, 1)[0]!, id, laundering });

describe('the three AML typologies (Factory)', () => {
  it('makes a structuring, a money-mule and a synthetic-identity case each day, the same for the same seed and day', () => {
    const cases = typologyCases(7, 3);
    expect(cases.map((c) => c.typology)).toEqual(['STRUCTURING', 'MONEY_MULE', 'SYNTHETIC_ID']);
    expect(typologyCases(7, 3)).toEqual(cases);
    expect(TYPOLOGY_FACTORIES).toHaveLength(3);
    const [st, mm, si] = cases;
    // Smurfing: five deposits of $2,100, just under the line, within 15 minutes.
    expect(st!.txs).toHaveLength(5);
    expect(st!.txs.every((t) => t.amountCents === 210_000)).toBe(true);
    expect(st!.txs[4]!.minute - st!.txs[0]!.minute).toBeLessThanOrEqual(15);
    expect(st!.amountCents).toBe(1_050_000);
    // Mule: many in, one out, within the hour; synthetic: in and drained within minutes.
    expect(mm!.txs.filter((t) => t.what === 'INBOUND').length).toBeGreaterThan(3);
    expect(mm!.txs.at(-1)!.what).toBe('OUTBOUND');
    expect(si!.txs.at(-1)!.minute - si!.txs[0]!.minute).toBeLessThan(15);
    for (const c of cases) for (const key of c.indicators) expect(key in amlDecisionMessages.messages, key).toBe(true);
  });

  it('makes some of them legitimate lookalikes, so freezing everything is not a free answer', () => {
    const all = Array.from({ length: 40 }, (_, d) => typologyCases(11, d + 1)).flat();
    expect(all.some((c) => c.laundering)).toBe(true);
    expect(all.some((c) => !c.laundering)).toBe(true);
  });
});

describe('the four decision paths (Strategy) and what follows from each', () => {
  it('releases on a false positive, freezes into 2930, holds for EDD in 2912, and silently freezes and blacklists on a SAR: every journal balanced', () => {
    const c = caseOf(true);
    const fp = DECISIONS.FALSE_POSITIVE.apply(c, 600);
    expect(fp.record.state).toBe('RELEASED');
    expect(fp.commands[0]!.lines).toEqual([{ gl: 'CASA', dr: c.amountCents, cr: 0 }, { gl: 'INTERBANK_SETTLEMENT', dr: 0, cr: c.amountCents }]);
    const fz = DECISIONS.FREEZE.apply(c, 600);
    // A correct freeze on real laundering: frozen, no customer at the branch.
    expect(fz.record).toMatchObject({ state: 'FROZEN', escalation: 'NONE' });
    expect(fz.escalates).toBe(false);
    // A legitimate customer frozen comes to the branch.
    expect(DECISIONS.FREEZE.apply(caseOf(false), 600)).toMatchObject({ escalates: true, record: { state: 'ESCALATED', escalation: 'PENDING' } });
    expect(fz.commands[0]!.lines.find((l) => l.gl === 'FROZEN_ASSETS')?.cr).toBe(c.amountCents);
    const edd = DECISIONS.REQUEST_EDD.apply(c, 600);
    expect(edd.record).toMatchObject({ state: 'PENDING_EDD', eddDue: 600 + EDD_SLA_MIN });
    expect(edd.commands[0]!.statusCode).toBe('PENDING_EDD');
    const sar = DECISIONS.FILE_SAR.apply(c, 600);
    expect(sar.record).toMatchObject({ state: 'SAR_FILED', blacklisted: true });
    expect(sar.escalates).toBe(false);
    for (const out of [fp, fz, edd, sar]) for (const cmd of out.commands) expect(sumsToZero(cmd.lines)).toBe(true);
  });

  it('fines a false negative only when the money was laundering: the audit finds every one (the fourth quadrant), the same on every replay', () => {
    expect(DECISIONS.FALSE_POSITIVE.apply(caseOf(false), 0).leak).toBe(false);
    // Smurfing (structuring) and mules: always found.
    expect(auditRate({ typology: 'STRUCTURING' })).toBe(1);
    expect(auditRate({ typology: 'MONEY_MULE' })).toBe(1);
    const obvious = Array.from({ length: 200 }, (_, i) => caseOf(true, `D-${i}`));
    expect(obvious.every((c) => DECISIONS.FALSE_POSITIVE.apply(c, 0).leak)).toBe(true);
    // The rest: 80%.
    const synth = typologyCases(7, 1).find((c) => c.typology === 'SYNTHETIC_ID')!;
    const dirty = Array.from({ length: 400 }, (_, i) => ({ ...synth, id: `S-${i}`, laundering: true }));
    const leaks = dirty.filter((c) => DECISIONS.FALSE_POSITIVE.apply(c, 0).leak);
    expect(leaks).toHaveLength(dirty.length);
    const one = DECISIONS.FALSE_POSITIVE.apply(leaks[0]!, 0);
    expect(one.record).toMatchObject({ fineCents: LEAK.fineCents, points: -LEAK.points });
    // The fine is posted with the release: Dr 5510 regulatory penalty expense, balanced.
    expect(one.commands.map((c) => c.kind)).toEqual(['RELEASE', 'FINE']);
    const fine = one.commands[1]!;
    expect(fine.lines).toEqual([{ gl: 'REGULATORY_PENALTY_EXPENSE', dr: LEAK.fineCents, cr: 0 }, { gl: 'INTERBANK_SETTLEMENT', dr: 0, cr: LEAK.fineCents }]);
    expect(DECISIONS.FALSE_POSITIVE.apply(caseOf(false), 0).commands.map((c) => c.kind)).toEqual(['RELEASE']);
    expect(DECISIONS.FALSE_POSITIVE.apply(leaks[0]!, 0)).toEqual(one);
    expect(roll('a', 1)).toBe(roll('a', 1));
  });

  it('answers the branch escalation: kept frozen, or released (and a dirty release may be found later)', () => {
    const c = caseOf(false);
    const r = DECISIONS.FREEZE.apply(c, 0).record;
    expect(resolveEscalation(c, r, true).record).toMatchObject({ state: 'FROZEN', escalation: 'KEPT' });
    const released = resolveEscalation(c, r, false);
    expect(released.record).toMatchObject({ state: 'TEMP_RELEASED', escalation: 'RELEASED' });
    expect(released.commands[0]!.kind).toBe('RELEASE_FROZEN');
    // Answered once only.
    expect(resolveEscalation(c, released.record, true).commands).toEqual([]);
  });

  it('runs EDD on the 24-hour SLA: no decision before the proof arrives, approve or reject after, refused when the SLA runs out', () => {
    const late = { ...caseOf(false), edd: { kind: 'VAT_INVOICE' as const, genuine: true, uploadAfterMin: EDD_SLA_MIN + 60 } };
    const r = DECISIONS.REQUEST_EDD.apply(late, 0).record;
    expect(eddUploaded(r, 600)).toBe(false);
    expect(reviewEdd(late, r, true, 600).record).toBe(r);
    const expired = expireEdd(late, r, EDD_SLA_MIN);
    expect(expired.record.state).toBe('EDD_EXPIRED');
    // Out of time: overdue, the hold simply continues in 2912 (a memo to the audit trail), with an alert.
    expect(expired.commands).toEqual([{ kind: 'MEMO', statusCode: 'EDD_SLA_EXPIRED', lines: [] }]);
    expect(expired.feedback).toBe('EDD_EXPIRED');
    const ontime = { ...late, edd: { ...late.edd, uploadAfterMin: 120 } };
    const r2 = DECISIONS.REQUEST_EDD.apply(ontime, 0).record;
    expect(eddUploaded(r2, 120)).toBe(true);
    expect(reviewEdd(ontime, r2, true, 120).record.state).toBe('EDD_CLEARED');
    expect(reviewEdd(ontime, r2, false, 120).record.state).toBe('EDD_REJECTED');
    expect(expireEdd(ontime, r2, EDD_SLA_MIN).record).toBe(r2);
  });
});

describe('the after-action scorecard', () => {
  const cases = [caseOf(false, 'L1'), caseOf(false, 'L2'), caseOf(true, 'B1')];
  const rec = (state: CaseRecord['state'], extra: Partial<CaseRecord> = {}): CaseRecord => ({ state, path: 'FREEZE', decidedAt: 0, fineCents: 0, points: 0, escalation: 'NONE', eddDue: null, eddUploadAt: null, blacklisted: false, tipOffs: 0, fiuDue: null, ...extra });

  it('measures over-freezing, friction and penalties, and grades from A+ to F', () => {
    // Starts from a B; the valid SAR's +15 lifts it.
    expect(amlScorecard(cases, {}).grade).toBe('B');
    const perfect = amlScorecard(cases, { L1: rec('RELEASED'), L2: rec('EDD_CLEARED'), B1: rec('SEIZED', { points: REWARD.validSar + REWARD.seizure }) });
    // Face value on 10,000: the base 8,500 plus the seizure's +15.
    expect(perfect).toMatchObject({ decided: 3, falsePositiveRate: 0, frictionIndex: 0, penaltiesCents: 0, score: 8515, grade: 'B' });
    expect(amlScorecard(cases, { B1: rec('SEIZED', { points: 1000 }) }).grade).toBe('A+');
    const harsh = amlScorecard(cases, { L1: rec('FROZEN', { escalation: 'KEPT' }), L2: rec('SAR_FILED'), B1: rec('RELEASED', { fineCents: LEAK.fineCents, points: -LEAK.points }) });
    expect(harsh.falsePositiveRate).toBe(100);
    expect(harsh.frictionIndex).toBe(1);
    expect(harsh.penaltiesCents).toBe(LEAK.fineCents);
    // 8,500 − 10 (the leak) − 100 (every legitimate customer held) − 3 (one complaint).
    expect(harsh.score).toBe(8500 - 10 - 100 - 3);
    expect(amlScorecard(cases, { B1: rec('RELEASED', { points: -4000 }) }).grade).toBe('F');
  });

  it('caps the grade at D after a tipping-off, whatever else', () => {
    const r = tipOff(rec('SAR_FILED'));
    expect(r.tipOffs).toBe(1);
    expect(amlScorecard(cases, { L1: rec('RELEASED'), L2: rec('RELEASED'), B1: r })).toMatchObject({ tipOffs: 1 });
    expect(['D', 'F']).toContain(amlScorecard(cases, { L1: rec('RELEASED'), L2: rec('RELEASED'), B1: r }).grade);
  });

  it('never leaves its bounds, whatever was decided', () => {
    const states: CaseRecord['state'][] = ['RELEASED', 'FROZEN', 'ESCALATED', 'TEMP_RELEASED', 'PENDING_EDD', 'EDD_CLEARED', 'EDD_REJECTED', 'EDD_EXPIRED', 'SAR_FILED'];
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.boolean(), fc.constantFrom(...states), fc.nat(3), fc.boolean()), { minLength: 1, maxLength: 12 }), (picks) => {
        const cs = picks.map(([dirty], i) => caseOf(dirty, `P${i}`));
        const records = Object.fromEntries(picks.map(([, state, tips, fined], i) => [`P${i}`, rec(state, { tipOffs: tips, ...(fined ? { fineCents: LEAK.fineCents, points: -LEAK.points } : {}) })]));
        const s = amlScorecard(cs, records);
        expect(s.falsePositiveRate).toBeGreaterThanOrEqual(0);
        expect(s.falsePositiveRate).toBeLessThanOrEqual(100);
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(10_000);
        expect(s.pct).toBeLessThanOrEqual(100);
        if (s.tipOffs > 0) expect(['D', 'F']).toContain(s.grade);
      }),
    );
  });

  it('renders the four metrics and the rating', () => {
    const out = renderToStaticMarkup(createElement(AmlScorecardView, { cases: [] }));
    for (const id of ['aml-score-fpr', 'aml-score-friction', 'aml-score-penalties', 'aml-score-rating']) expect(out).toContain(`data-testid="${id}"`);
    expect(bundleProblems(amlDecisionMessages)).toEqual([]);
    expect(amlDecisionMessages.messages.escalationText.vi).toBe('Khách hàng {name} đang có mặt tại Chi nhánh #01 gào thét, dọa kiện Ngân hàng vì bị khóa tiền mua hàng khẩn cấp!');
    expect(amlDecisionMessages.messages.violation.vi).toBe('VIOLATION: Tipping-off is illegal! (Tiết lộ thông tin báo cáo rửa tiền là vi phạm pháp luật hình sự)');
  });
});

describe('the desk’s case book: decisions booked to the core ledger and the audit trail', () => {
  it('books each path’s journal and a row, queues the branch escalation, and flags a tipping-off', () => {
    const store = createAmlStore();
    const before = bankStore.getState().auditLog.length;
    const [st, mm, si] = typologyCases(5, 2);
    // A legitimate customer frozen is at the branch ten seconds later; a correct freeze raises no complaint.
    store.getState().decide({ ...st!, id: 'ST-LEGIT', laundering: false }, 'FREEZE', 600, 1_000);
    expect(store.getState().escalations).toEqual([{ caseId: 'ST-LEGIT', dueAt: 11_000 }]);
    store.getState().answerEscalation({ ...st!, id: 'ST-LEGIT', laundering: false }, true);
    const before2 = bankStore.getState().auditLog.length;
    store.getState().decide(st!, 'FREEZE', 600, 1_000);
    expect(store.getState().reviews[st!.id]!.state).toBe(st!.laundering ? 'FROZEN' : 'ESCALATED');
    // One decision per case.
    expect(store.getState().decide(st!, 'FALSE_POSITIVE', 600)).toBeNull();
    store.getState().answerEscalation(st!, true);
    expect(store.getState().escalations).toEqual([]);
    store.getState().decide(mm!, 'FILE_SAR', 610);
    store.getState().tipOff(mm!);
    expect(store.getState().violation).toBe(mm!.id);
    expect(store.getState().reviews[mm!.id]!.tipOffs).toBe(1);
    store.getState().decide(si!, 'REQUEST_EDD', 620);
    void before;
    const rows = bankStore.getState().auditLog.slice(before2);
    expect(rows.map((r) => r.statusCode)).toEqual(['AML_FROZEN', 'SAR_FILED_FIU', 'TIPPING_OFF_VIOLATION', 'PENDING_EDD']);
    expect(rows[0]!.action).toBe('FREEZE');
    expect(rows[2]!.compliance).toBe('SOP_BREACH');
    expect(rows.every((r) => r.station === 'AML_DESK' && r.role === 'aml')).toBe(true);
    expect(bankStore.getState().retailLedger.journal[0]!.statusCode).toBe('PENDING_EDD');
  });

  it('raises the leak at once and posts the $50,000 fine to 5510 the moment laundered money is let through', () => {
    const store = createAmlStore();
    notificationStore.getState().clear();
    const before = bankStore.getState().auditLog.length;
    const c = { ...caseOf(true), id: 'LEAK-1' };
    expect(store.getState().decide(c, 'FALSE_POSITIVE', 600)!.leak).toBe(true);
    // The red toast, in Location B's queue at once.
    expect(notificationStore.getState().queue).toMatchObject([{ tone: 'danger', source: 'LEAK-1', deferred: false }]);
    expect(notificationStore.getState().queue[0]!.body?.en).toContain('$50,000');
    const rows = bankStore.getState().auditLog.slice(before);
    expect(rows).toHaveLength(2);
    expect(rows.at(-1)).toMatchObject({ statusCode: 'AML_AUDIT_FINE', amountCents: LEAK.fineCents, compliance: 'SOP_BREACH' });
    expect(bankStore.getState().retailLedger.journal[0]!.lines.some((l) => l.gl === 'REGULATORY_PENALTY_EXPENSE' && l.dr === LEAK.fineCents)).toBe(true);
    // The live scorecard carries the fine and the points.
    const card = amlScorecard([c], store.getState().reviews);
    expect(card.penaltiesCents).toBe(LEAK.fineCents);
    expect(amlDecisionMessages.messages.leakToast.vi).toBe('🚨 PHÁT HIỆN LỌT TỘI PHẠM RỬA TIỀN! Kiểm toán Ngân hàng Nhà nước vừa phát hiện đây là tài khoản Money Mule/Rửa tiền thật. Ngân hàng bị phạt $50,000 và trừ 10 điểm Tuân thủ!');
  });

  it('turns a monitoring alert into a case the same four paths apply to (Adapter)', () => {
    const c = alertCase({ id: 'LV-d1-5003', kind: 'LARGE_VALUE', minute: 600, amountCents: 1_250_000, count: 1, txIds: ['d1-5003'], scenario: 'x', riskScore: 70, approved: 1 }, []);
    expect(c).toMatchObject({ typology: 'LARGE_VALUE', amountCents: 1_250_000, laundering: false });
  });
});

describe('the branch vault (1010) and the teller till (1012)', () => {
  it('opens the vault with $50,000 and the till with $25,000, the books still square', () => {
    expect(GL_ACCOUNTS.find((a) => a.id === 'VAULT_CASH')?.code).toBe('1010');
    expect(OPENING_BALANCES.VAULT_CASH).toBe(VAULT_OPENING_CENTS);
    expect(VAULT_OPENING_CENTS).toBe(5_000_000);
    expect(OPENING_BALANCES.TILL_CASH).toBe(TILL_FLOAT_CENTS);
    expect(TILL_FLOAT_CENTS).toBe(2_500_000);
    expect(Object.values(OPENING_BALANCES).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('tops the till up from the vault when it runs low, sweeps the surplus back when it holds too much, and leaves it alone between', () => {
    const l = openingLedger();
    expect(vaultReplenishment(l)).toBeNull();
    const low = { ...l, balances: { ...l.balances, TILL_CASH: TILL_FLOOR_CENTS - 1 } };
    const up = vaultReplenishment(low)!;
    expect(up.statusCode).toBe('VAULT_TO_TILL');
    expect(postJournal(low, up).balances.TILL_CASH).toBe(TILL_FLOAT_CENTS);
    expect(postJournal(low, up).balances.VAULT_CASH).toBe(VAULT_OPENING_CENTS - (TILL_FLOAT_CENTS - TILL_FLOOR_CENTS + 1));
    const high = { ...l, balances: { ...l.balances, TILL_CASH: TILL_CEILING_CENTS + 1 } };
    const sweep = vaultReplenishment(high)!;
    expect(sweep.statusCode).toBe('TILL_TO_VAULT');
    expect(postJournal(high, sweep).balances.TILL_CASH).toBe(TILL_FLOAT_CENTS);
    for (const j of [up, sweep]) expect(sumsToZero(j.lines)).toBe(true);
  });
});

describe('eKYC’s explicit outcome', () => {
  it('names the failure in the inspector: document mismatch, or a liveness (spoofing) fail', () => {
    const verdicts = (task: 1 | 2 | 3) =>
      Array.from({ length: 20 }, (_, i) => buildTaskCase('ekyc', task, i)).map((c) => {
        const f = c.fields.find((x) => x.key === 'ekycVerdict')!;
        return { expected: c.expected, key: f.value.t === 'msg' ? f.value.key : '' };
      });
    for (const v of verdicts(1)) expect(v.key).toBe(v.expected === 'REJECT' ? 'ekycVerdictDocument' : 'ekycVerdictVerified');
    for (const v of verdicts(3)) expect(v.key).toBe(v.expected === 'REJECT' ? 'ekycVerdictLiveness' : 'ekycVerdictVerified');
  });
});

describe('the AML panel’s badges and SOP card', () => {
  const msgs = amlDecisionMessages.messages;
  it('labels each state in one short badge, with its icon', () => {
    expect(msgs.state_OPEN.vi).toBe('⏳ Đang mở');
    expect(msgs.state_ESCALATED.vi).toBe('🔒 Phong tỏa (Chi nhánh)');
    expect(msgs.state_TEMP_RELEASED.vi).toBe('🔓 Đã giải phóng');
    expect(msgs.state_SAR_FILED.vi).toBe('🏛️ Đã gửi SAR (Chờ FIU)');
    expect(msgs.state_SEIZED.vi).toBe('🏛️ Đã tịch thu (FIU)');
    expect(msgs.state_PENDING_EDD.vi).toBe('⏳ Chờ chứng từ (SLA 24h)');
    for (const [key, v] of Object.entries(msgs)) if (key.startsWith('state_')) expect(v.vi.length, key).toBeLessThanOrEqual(36);
    const badge = renderToStaticMarkup(createElement(StateBadge, { state: 'ESCALATED', m: (key: string) => msgs[key as keyof typeof msgs].en }));
    expect(badge).toContain('whitespace-nowrap');
  });

  it('gives every case a KYC baseline: a launderer’s account is thin and the money dwarfs it, a legitimate lookalike’s fits', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), fc.boolean(), fc.constantFrom('STRUCTURING', 'MONEY_MULE', 'SYNTHETIC_ID', 'LARGE_VALUE', 'VELOCITY_BURST') as fc.Arbitrary<ReviewCase['typology']>, (id, dirty, t) => {
        const p = profileFor(id, dirty, t);
        expect(profileFor(id, dirty, t)).toEqual(p);
        if (dirty) expect(p).toMatchObject({ kyc: 'BASIC_EKYC' });
        if (dirty) expect(p.tenureDays).toBeLessThan(60);
        else expect(p.tenureDays).toBeGreaterThanOrEqual(365);
        if (!dirty) expect(['FIXED_PARTNERS', 'REGULAR_PAYROLL']).toContain(p.history);
      }),
    );
    const dirty = typologyCases(7, 1).filter((c) => c.laundering);
    expect(dirty.length).toBeGreaterThan(0);
    for (const c of dirty) expect(volumeMultiple(c)).toBeGreaterThan(EXTREME_MULTIPLE);
  });

  it('shows the KYC context card above the risk facts, with the extreme red flag when the money dwarfs a normal month', () => {
    const [c] = typologyCases(7, 1);
    const thin = { ...c!, amountCents: 1_050_000, profile: { segment: 'STUDENT', tenureDays: 5, avgMonthlyCents: 80_000, kyc: 'BASIC_EKYC', history: 'UNKNOWN_SENDERS' } as const };
    // The KYC card holds the profile; the red-flag analysis is the hint, under the paths' heading once opened.
    expect(renderToStaticMarkup(createElement(KycContextCard, { c: thin }))).not.toContain('data-testid="aml-kyc-multiple"');
    expect(renderToStaticMarkup(createElement(CaseActions, { c: thin, now: 0 }))).not.toContain('data-testid="aml-kyc-multiple"');
    const kyc = renderToStaticMarkup(createElement(KycContextCard, { c: thin }));
    expect(kyc).toContain('data-extreme="true"');
    const out = renderToStaticMarkup(createElement(CaseActions, { c: thin, now: 0, showHint: true }));
    // The hint flags the extreme case; the KYC card shows the profile.
    expect(out).toContain(esc(msgs.kycExtreme.en));
    expect(kyc).toContain(esc(msgs.seg_STUDENT.en));
    expect(kyc).toContain(esc(msgs.kyc_BASIC_EKYC.en));
    const fit = renderToStaticMarkup(createElement(KycContextCard, { c: { ...thin, profile: { segment: 'IMPORT_EXPORT', tenureDays: 1460, avgMonthlyCents: 15_000_000, kyc: 'FULL_CDD', history: 'FIXED_PARTNERS' } } }));
    expect(fit).toContain('data-extreme="false"');
    expect(fit).not.toContain(esc(msgs.kycExtreme.en));
    expect(msgs.kycTitle.vi).toBe('Hồ sơ chủ tài khoản & Ngữ cảnh (Customer KYC Context)');
  });

  it('puts the SOP lesson above the four paths: this pattern’s red flags against a legitimate lookalike, and each path’s trade-off', () => {
    for (const c of [...typologyCases(7, 1), alertCase({ id: 'LV-x', kind: 'LARGE_VALUE', minute: 0, amountCents: 1, count: 1, txIds: [], scenario: '', riskScore: 1, approved: 0 }, [])]) {
      // The SOP lesson is always shown (it is not the hint), above the hint button and the paths.
      const out = renderToStaticMarkup(createElement(CaseActions, { c, now: 0 }));
      expect(out.indexOf('data-testid="aml-sop"')).toBeLessThan(out.indexOf('data-testid="aml-hint-toggle"'));
      // The hint button sits next to the heading, on the same row.
      expect(out.indexOf(esc(msgs.choosePath.en))).toBeLessThan(out.indexOf('data-testid="aml-hint-toggle"'));
      expect(out).toMatch(/<div class="flex flex-wrap items-center gap-2"><h4[^>]*>[^<]*<\/h4><button[^>]*data-testid="aml-hint-toggle"/);
      const hinted = renderToStaticMarkup(createElement(CaseActions, { c, now: 0, showHint: true }));
      // The hint sits right below the heading, above the paths.
      expect(hinted.indexOf(esc(msgs.choosePath.en))).toBeLessThan(hinted.indexOf('data-testid="aml-kyc-multiple"'));
      expect(hinted.indexOf('data-testid="aml-kyc-multiple"')).toBeLessThan(hinted.indexOf('data-testid="aml-path-FALSE_POSITIVE"'));
      expect(out.indexOf('data-testid="aml-sop"')).toBeLessThan(out.indexOf('data-testid="aml-path-FALSE_POSITIVE"'));
      expect(out).toContain(esc(msgs[`sop_${c.typology}_dirty` as keyof typeof msgs].en));
      expect(out).toContain(esc(msgs[`sop_${c.typology}_clean` as keyof typeof msgs].en));
      for (const path of ['FALSE_POSITIVE', 'FREEZE', 'REQUEST_EDD', 'FILE_SAR']) expect(out).toContain(esc(msgs[`tradeoff_${path}` as keyof typeof msgs].en));
    }
    expect(msgs.sopTitle.vi).toContain('Gợi ý SOP & Bài học Nghiệp vụ');
    expect(msgs.hintShow.vi).toBe('💡 Xem gợi ý (-50% thưởng)');
  });
});
