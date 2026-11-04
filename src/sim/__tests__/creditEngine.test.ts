import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocateWaterfall, assessDti, closeTermDepositEarly, creditScore, debtGroup, DTI_LIMIT_PCT, isNonPerforming, PROVISION_PCT, SCORE_RANGE, specificProvision } from '../creditEngine';

const cents = fc.integer({ min: 0, max: 100_000_000 });

describe('the debt recovery waterfall', () => {
  it('fills penalty, then interest, then principal', () => {
    const debt = { penaltyCents: 2_500, interestCents: 4_000, principalCents: 30_000 };
    expect(allocateWaterfall(5_000, debt)).toMatchObject({ toPenalty: 2_500, toInterest: 2_500, toPrincipal: 0, surplus: 0 });
    expect(allocateWaterfall(12_000, debt)).toMatchObject({ toPenalty: 2_500, toInterest: 4_000, toPrincipal: 5_500, surplus: 0 });
    expect(allocateWaterfall(50_000, debt)).toMatchObject({ toPrincipal: 30_000, surplus: 13_500, remaining: { penaltyCents: 0, interestCents: 0, principalCents: 0 } });
    expect(allocateWaterfall(-5, debt)).toMatchObject({ toPenalty: 0, surplus: 0 });
  });

  it('never loses a cent, and never pays a later bucket while an earlier one is owed', () => {
    fc.assert(
      fc.property(cents, cents, cents, cents, (pay, penaltyCents, interestCents, principalCents) => {
        const w = allocateWaterfall(pay, { penaltyCents, interestCents, principalCents });
        expect(w.toPenalty + w.toInterest + w.toPrincipal + w.surplus).toBe(pay);
        if (w.toInterest > 0) expect(w.remaining.penaltyCents).toBe(0);
        if (w.toPrincipal > 0) expect(w.remaining.interestCents).toBe(0);
        if (w.surplus > 0) expect(w.remaining.principalCents).toBe(0);
      }),
    );
  });
});

describe('debt-to-income', () => {
  it('bands the ratio, and refuses only above the limit', () => {
    expect(assessDti(300_000, 60_000, 10_000)).toEqual({ dtiPct: 23.3, band: 'HEALTHY', approved: true });
    expect(assessDti(200_000, 72_000, 8_000)).toEqual({ dtiPct: 40, band: 'WATCH', approved: true });
    expect(assessDti(200_000, 90_000, 0)).toEqual({ dtiPct: DTI_LIMIT_PCT, band: 'WATCH', approved: true });
    expect(assessDti(200_000, 72_000, 24_000)).toEqual({ dtiPct: 48, band: 'HIGH_RISK', approved: false });
    expect(assessDti(0, 0, 100).approved).toBe(false);
  });
});

describe('debt groups and provisions', () => {
  it('moves through the five groups at the guide’s thresholds', () => {
    expect([0, 9, 10, 89, 90, 179, 180, 359, 360, 1000].map(debtGroup)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(isNonPerforming(2)).toBe(false);
    expect(isNonPerforming(3)).toBe(true);
    expect(PROVISION_PCT).toEqual({ 1: 0, 2: 5, 3: 20, 4: 50, 5: 100 });
  });

  it('provides only on what the collateral does not cover', () => {
    expect(specificProvision(100_000, 0, 3)).toBe(20_000);
    expect(specificProvision(100_000, 60_000, 3)).toBe(8_000);
    expect(specificProvision(100_000, 200_000, 5)).toBe(0);
  });

  it('never gets better with more lateness, and stays in range', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2000 }), fc.integer({ min: 0, max: 500 }), (days, more) => {
        expect(debtGroup(days + more)).toBeGreaterThanOrEqual(debtGroup(days));
        const s = creditScore(720, days, 30);
        expect(s).toBeLessThanOrEqual(SCORE_RANGE.max);
        expect(s).toBeGreaterThanOrEqual(SCORE_RANGE.min);
        expect(creditScore(720, days + more, 30)).toBeLessThanOrEqual(s);
      }),
    );
  });
});

describe('early term deposit closure', () => {
  it('recalculates from the contract rate down to the demand rate', () => {
    expect(closeTermDepositEarly(1_000_000, 6, 180)).toEqual({ accruedCents: 29_589, paidCents: 493, forfeitedCents: 29_096 });
  });

  it('accounts for all the accrued interest, and never pays more than was accrued', () => {
    fc.assert(
      fc.property(cents, fc.double({ min: 0, max: 15, noNaN: true }), fc.integer({ min: 0, max: 3650 }), (p, rate, days) => {
        const c = closeTermDepositEarly(p, rate, days);
        expect(c.paidCents + c.forfeitedCents).toBe(c.accruedCents);
        expect(c.paidCents).toBeLessThanOrEqual(c.accruedCents);
        expect(c.forfeitedCents).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});
