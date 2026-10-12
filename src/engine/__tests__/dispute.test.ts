import { describe, expect, it } from 'vitest';
import type { DisputeContext } from '../../types/processLearning';
import { DEFAULT_FILING_WINDOW_DAYS, DISPUTE_STAGES, STAGE_LABEL, advanceDispute, liabilityFor, transition } from '../dispute';

const dispute = (over: Partial<DisputeContext> = {}): DisputeContext => ({ stage: 'NEW', reason: 'GOODS_NOT_RECEIVED', daysSinceTransaction: 30, merchantEvidence: 'NONE', ...over });

describe('the four stages', () => {
  it('run in the order the card schemes use', () => {
    expect(DISPUTE_STAGES).toEqual(['RETRIEVAL_REQUEST', 'FIRST_CHARGEBACK', 'REPRESENTMENT', 'PRE_ARBITRATION']);
  });

  it('every stage and result has a label for the UI', () => {
    for (const k of [...DISPUTE_STAGES, 'NEW', 'RESOLVED_CARDHOLDER', 'RESOLVED_MERCHANT', 'NONE'] as const) expect(STAGE_LABEL[k]).toBeTruthy();
  });
});

describe('transitions', () => {
  it.each([
    ['NEW', 'NONE', 'RETRIEVAL_REQUEST'],
    ['NEW', 'COMPELLING', 'RETRIEVAL_REQUEST'],
    ['RETRIEVAL_REQUEST', 'NONE', 'FIRST_CHARGEBACK'],
    ['RETRIEVAL_REQUEST', 'WEAK', 'FIRST_CHARGEBACK'],
    ['RETRIEVAL_REQUEST', 'COMPELLING', 'RESOLVED_MERCHANT'],
    ['FIRST_CHARGEBACK', 'NONE', 'RESOLVED_CARDHOLDER'],
    ['FIRST_CHARGEBACK', 'WEAK', 'REPRESENTMENT'],
    ['FIRST_CHARGEBACK', 'COMPELLING', 'REPRESENTMENT'],
    ['REPRESENTMENT', 'COMPELLING', 'RESOLVED_MERCHANT'],
    ['REPRESENTMENT', 'WEAK', 'PRE_ARBITRATION'],
    ['REPRESENTMENT', 'NONE', 'RESOLVED_CARDHOLDER'],
    ['PRE_ARBITRATION', 'COMPELLING', 'RESOLVED_MERCHANT'],
    ['PRE_ARBITRATION', 'NONE', 'RESOLVED_CARDHOLDER'],
    ['PRE_ARBITRATION', 'WEAK', 'PRE_ARBITRATION'],
  ] as const)('%s with %s evidence goes to %s', (stage, evidence, next) => {
    expect(transition(stage, evidence)).toBe(next);
  });
});

describe('liability', () => {
  it('shifts to the issuer only for an authenticated purchase disputed as fraud', () => {
    expect(liabilityFor('FRAUD', true)).toBe('ISSUER');
    expect(liabilityFor('FRAUD', false)).toBe('MERCHANT');
    expect(liabilityFor('FRAUD', undefined)).toBe('MERCHANT');
    expect(liabilityFor('GOODS_NOT_RECEIVED', true)).toBe('MERCHANT');
    expect(liabilityFor('DUPLICATE_CHARGE', true)).toBe('MERCHANT');
  });

  it('stops the dispute: the scheme allows no chargeback against an authenticated purchase', () => {
    const step = advanceDispute(dispute({ reason: 'FRAUD' }), true);
    expect(step).toMatchObject({ liability: 'ISSUER', next: 'NONE', window: 'OPEN' });
    expect(step.why).toMatch(/3-D Secure/);
  });

  it('lets a fraud claim on an unauthenticated purchase begin', () => {
    expect(advanceDispute(dispute({ reason: 'FRAUD' }), false)).toMatchObject({ liability: 'MERCHANT', next: 'RETRIEVAL_REQUEST' });
  });
});

describe('the filing window', () => {
  it('closes after 120 days by default, on the 121st', () => {
    expect(DEFAULT_FILING_WINDOW_DAYS).toBe(120);
    expect(advanceDispute(dispute({ daysSinceTransaction: 120 }), false).window).toBe('OPEN');
    expect(advanceDispute(dispute({ daysSinceTransaction: 121 }), false)).toMatchObject({ window: 'EXPIRED', next: 'NONE' });
  });

  it('can be moved by configuration', () => {
    expect(advanceDispute(dispute({ daysSinceTransaction: 100 }), false, 90).window).toBe('EXPIRED');
    expect(advanceDispute(dispute({ daysSinceTransaction: 100 }), false, 180).window).toBe('OPEN');
  });

  it('applies only to a claim still being brought; a filed case is not time-barred by a long dispute', () => {
    for (const stage of ['FIRST_CHARGEBACK', 'REPRESENTMENT', 'PRE_ARBITRATION'] as const) {
      expect(advanceDispute(dispute({ stage, daysSinceTransaction: 400, merchantEvidence: 'WEAK' }), false).window).toBe('OPEN');
    }
    expect(advanceDispute(dispute({ stage: 'RETRIEVAL_REQUEST', daysSinceTransaction: 400 }), false).window).toBe('EXPIRED');
  });

  it('beats liability: a dead claim is dead whoever would have paid', () => {
    const step = advanceDispute(dispute({ reason: 'FRAUD', daysSinceTransaction: 200 }), true);
    expect(step).toMatchObject({ window: 'EXPIRED', liability: 'ISSUER', next: 'NONE' });
    expect(step.why).toMatch(/time-barred/);
  });
});

describe('a whole dispute, stage by stage', () => {
  it('runs from a new claim to a pre-arbitration escalation', () => {
    const path: string[] = [];
    let stage: DisputeContext['stage'] = 'NEW';
    const answers = ['NONE', 'NONE', 'WEAK', 'WEAK'] as const;
    for (const evidence of answers) {
      const step = advanceDispute(dispute({ stage, merchantEvidence: evidence }), false);
      path.push(step.next);
      if (step.next === 'NONE' || step.next === 'RESOLVED_CARDHOLDER' || step.next === 'RESOLVED_MERCHANT') break;
      stage = step.next;
    }
    expect(path).toEqual(['RETRIEVAL_REQUEST', 'FIRST_CHARGEBACK', 'REPRESENTMENT', 'PRE_ARBITRATION']);
  });
});
