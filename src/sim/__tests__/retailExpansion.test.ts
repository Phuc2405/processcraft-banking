import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import * as P from '../../engine/postings';
import type { PostingKind } from '../../types/processLearning';
import { memoVi } from '../memoVi';
import { GL_ACCOUNTS, gradeTaskCase, nplGroupOf, NPL_GROUPS, provisionCents, RETAIL_SOP, RETAIL_TASK, taskDeck, type RetailScenarioId, type StaffCase, type StaffRoleId } from '../staffRoleplay';

const deck = (role: StaffRoleId, id: RetailScenarioId): StaffCase[] => taskDeck(role, RETAIL_TASK, 0, 400).filter((c) => c.retail?.id === id);
const field = (c: StaffCase, key: string) => c.fields.find((f) => f.key === key)!;
const val = (c: StaffCase, key: string): number => {
  const v = field(c, key).value;
  if (v.t === 'money') return v.cents;
  if (v.t === 'num' || v.t === 'pct') return v.v;
  throw new Error(key);
};

describe('NPL debt classification and provisioning (SBV, 5 groups)', () => {
  it('groups a loan by days past due, at 0 / 5 / 20 / 50 / 100%', () => {
    expect([0, 9, 10, 89, 90, 179, 180, 359, 360, 900].map((d) => nplGroupOf(d).group)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(NPL_GROUPS.map((g) => g.ratePct)).toEqual([0, 5, 20, 50, 100]);
    fc.assert(
      fc.property(fc.nat(2_000), fc.nat(10_000_000), (dpd, o) => {
        expect(provisionCents(o, nplGroupOf(dpd))).toBeLessThanOrEqual(o);
      }),
    );
  });

  it('posts Dr 5610 / Cr 1290; a breach understates the group and is re-posted at the right rate', () => {
    const cases = deck('bnpl', 'NPL_PROVISION');
    expect(new Set(cases.map((c) => c.expected))).toEqual(new Set(['APPROVE', 'REJECT']));
    for (const c of cases) {
      const right = provisionCents(val(c, 'loanOutstanding'), nplGroupOf(val(c, 'daysPastDue')));
      const posted = gradeTaskCase(c, 'REJECT').journal?.lines ?? [];
      // Rejecting always books the right provision; approving books the proposal, which is right exactly when the case is clean.
      expect(posted.find((l) => l.gl === 'LOAN_LOSS_ALLOWANCE')?.cr ?? 0).toBe(right);
      expect(val(c, 'proposedProvision') === right).toBe(c.expected === 'APPROVE');
      expect(c.fields.some((f) => f.flag)).toBe(c.expected === 'REJECT');
    }
    expect(GL_ACCOUNTS.filter((a) => a.id === 'PROVISION_EXPENSE' || a.id === 'LOAN_LOSS_ALLOWANCE').map((a) => a.code)).toEqual(['1290', '5610']);
  });
});

describe('FX volatility spike and eKYC risk profiling', () => {
  it('holds the SWIFT message exactly when the live rate moved more than ±2% from the booked one', () => {
    const cases = deck('swift', 'FX_VOLATILITY');
    expect(cases.length).toBeGreaterThan(5);
    for (const c of cases) expect(Math.abs(val(c, 'rateMove')) > RETAIL_SOP.fxVolatilityPct).toBe(c.expected === 'REJECT');
    const ok = cases.find((c) => c.expected === 'APPROVE')!;
    expect(gradeTaskCase(ok, 'APPROVE').journal!.lines.map((l) => l.gl)).toEqual(['CASA', 'NOSTRO']);
  });

  it('rejects a low or medium tier whenever a PEP, a high-risk country or a 70+ score says high risk', () => {
    const cases = deck('ekyc', 'EKYC_RISK');
    for (const c of cases) {
      const v = (key: string) => field(c, key).value;
      const pep = v('pepScreening').t === 'msg' && (v('pepScreening') as { key: string }).key === 'pepMatch';
      const country = (v('countryRisk') as { key: string }).key === 'countryHigh';
      const high = pep || country || val(c, 'riskScore') >= RETAIL_SOP.highRiskScore;
      expect(high).toBe(c.expected === 'REJECT');
    }
  });
});

describe('the system ledger in Vietnamese', () => {
  const samples: Partial<Record<PostingKind, P.Draft>> = {};
  for (const d of [
    P.authHold('CREDIT', 12_000),
    P.holdRelease('DEBIT', 500),
    P.capture('DEBIT', 500),
    P.settle(500),
    P.bnplFinancing(9_000, 3_000),
    P.parkInSuspense(500, 'The legs disagree.'),
    P.fxDifference('LOSS', 20),
    P.clearSuspense(500),
    P.a2aPayment('RTGS', 500),
    P.a2aQueued(500),
    P.paymentExecuted(500),
    P.amlRestrain(500, 'A sanctions match was confirmed.'),
    P.amlRelease(500),
    P.provisionalCredit(500),
    P.disputeRecovery(500),
    P.disputeReversal(500),
    P.chargebackReversal(500),
    P.issuerLoss(500),
    P.atmDispense(500),
    P.atmJam(500),
    P.atmRefund(500),
    P.atmDeposit(500),
    P.tellerDeposit(500),
    P.tellerWithdrawal(500),
    P.swiftRemittance(500, 'USD'),
    P.atmMismatchRefund(500),
    P.paymentReturn(500),
    P.openingDeposit(500),
  ])
    samples[d.kind] = d;

  it('rewrites every posting kind in Vietnamese banking terms, with its amount, and no English left', () => {
    const entries = P.toEntries(Object.values(samples), 'T1', 0);
    expect(new Set(entries.map((e) => e.kind)).size).toBe(28);
    for (const e of entries) {
      const vi = memoVi(e);
      expect(vi, e.kind).toMatch(/[ạảãàáâậầấẩẫăặằắẳẵđêệềếểễôộồốổỗơợờớởỡưựừứửữ]/);
      expect(vi, e.kind).not.toMatch(/\b(The|the bank|customer|is|and)\b/);
      expect(vi, e.kind).toContain(e.memo.match(/\$[\d,]+\.\d{2}/)![0]);
    }
    const hold = entries.find((e) => e.kind === 'AUTH_HOLD')!;
    expect(memoVi(hold)).toContain('Tạm giữ');
    expect(memoVi(entries.find((e) => e.kind === 'BNPL_FINANCING')!)).toContain('Ngân hàng thanh toán toàn bộ cho đơn vị chấp nhận thẻ');
    expect(memoVi(entries.find((e) => e.kind === 'AML_RESTRAIN')!)).toContain('cấm vận');
  });
});
