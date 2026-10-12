import { describe, expect, it } from 'vitest';
import type { AmlContext, AuditEvent, WatchlistEntry } from '../../types/processLearning';
import { bestWatchlistMatch, detectStructuring, editDistance, investigate, nameSimilarity, normalizeName, screen } from '../aml';

const POLICY = { matchThreshold: 85, reportingThresholdMinor: 1_000_000, minStructuringDeposits: 3 };
const T = 1_700_000_000_000;

const OFAC: WatchlistEntry = { list: 'OFAC', name: 'Aleksandr Petrov', dateOfBirth: '1962-04-11', country: 'RU' };
const PEP: WatchlistEntry = { list: 'PEP', name: 'Maria Santos Oliveira', dateOfBirth: '1958-09-30', country: 'BR' };

describe('names', () => {
  it('normalises accents, case and punctuation', () => {
    expect(normalizeName('  Nguyễn  Văn-An ')).toBe('nguyen van an');
    expect(normalizeName('Đặng Thị Hồng')).toBe('dang thi hong');
    expect(normalizeName("O'Brien, Séan")).toBe('o brien sean');
  });

  it('measures edit distance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('same', 'same')).toBe(0);
  });

  it('scores identical names 100, whatever the order or accents', () => {
    expect(nameSimilarity('Aleksandr Petrov', 'aleksandr petrov')).toBe(100);
    expect(nameSimilarity('Petrov Aleksandr', 'Aleksandr Petrov')).toBe(100);
    expect(nameSimilarity('Nguyễn Văn An', 'Nguyen Van An')).toBe(100);
  });

  it('scores a transliteration high and a different person low', () => {
    expect(nameSimilarity('Alexander Petrov', 'Aleksandr Petrov')).toBeGreaterThanOrEqual(85);
    // Jaro-Winkler is generous to unrelated names (they share letters), but it stays far below the 85 line.
    expect(nameSimilarity('Alexander Petrov', 'Maria Santos Oliveira')).toBeLessThan(60);
    expect(nameSimilarity('Alexander Petrov', 'Aleksei Petrenko')).toBeLessThan(85);
  });

  it('treats an initial as a partial match and an extra word as a penalty', () => {
    const initial = nameSimilarity('A. Petrov', 'Aleksandr Petrov');
    expect(initial).toBeGreaterThan(40);
    expect(initial).toBeLessThan(85);
    expect(nameSimilarity('Aleksandr Ivanovich Petrov', 'Aleksandr Petrov')).toBeLessThan(100);
  });

  it('scores an empty name 0', () => {
    expect(nameSimilarity('', 'Aleksandr Petrov')).toBe(0);
  });

  it('finds the closest name, and prefers the sanctions list on a tie', () => {
    expect(bestWatchlistMatch('Alexander Petrov', [PEP, OFAC])?.entry).toBe(OFAC);
    expect(bestWatchlistMatch('Anyone', [])).toBeNull();
    const twin: WatchlistEntry = { ...PEP, name: OFAC.name };
    expect(bestWatchlistMatch(OFAC.name, [twin, OFAC])?.entry.list).toBe('OFAC');
    expect(bestWatchlistMatch(OFAC.name, [OFAC, twin])?.entry.list).toBe('OFAC');
  });
});

describe('structuring', () => {
  it('flags several deposits just under the line whose total is over it', () => {
    const r = detectStructuring([900_000, 920_000, 950_000, 910_000], 1_000_000, 3);
    expect(r.suspected).toBe(true);
    expect(r.nearThreshold).toHaveLength(4);
    expect(r.total).toBe(3_680_000);
  });

  it('does not flag deposits that are small, or too few', () => {
    expect(detectStructuring([200_000, 200_000, 200_000, 200_000, 200_000], 1_000_000, 3).suspected).toBe(false);
    expect(detectStructuring([900_000, 950_000], 1_000_000, 3).suspected).toBe(false);
  });

  it('does not count a deposit at or over the line: that one is reported anyway', () => {
    expect(detectStructuring([1_000_000, 1_200_000, 950_000, 900_000], 1_000_000, 3).nearThreshold).toEqual([950_000, 900_000]);
  });

  it('counts exactly 80% of the line as just under it', () => {
    expect(detectStructuring([800_000, 800_000, 800_000], 1_000_000, 3).suspected).toBe(true);
    expect(detectStructuring([799_999, 800_000, 800_000], 1_000_000, 3).suspected).toBe(false);
  });
});

const ctx = (over: Partial<AmlContext> = {}): AmlContext => ({
  customer: { name: 'Alexander Petrov', dateOfBirth: '1971-03-02', nationality: 'AU', vip: true },
  watchlist: [OFAC, PEP],
  cashDeposits: [],
  lookbackDays: 3,
  auditLog: [],
  ...over,
});

describe('screening', () => {
  it('reports a sanctions hit before anything else', () => {
    const r = screen(ctx({ cashDeposits: [900_000, 920_000, 950_000] }), POLICY);
    expect(r).toMatchObject({ status: 'SANCTION_HIT', list: 'OFAC' });
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.structuring.suspected).toBe(true);
  });

  it('reports a PEP hit, then structuring, then clear', () => {
    expect(screen(ctx({ customer: { name: 'Maria Santos Oliveira', dateOfBirth: '1958-09-30', nationality: 'BR', vip: false } }), POLICY).status).toBe('PEP_HIT');
    expect(screen(ctx({ customer: { name: 'Linh Tran', dateOfBirth: '1990-01-01', nationality: 'AU', vip: false }, cashDeposits: [900_000, 920_000, 950_000] }), POLICY).status).toBe('STRUCTURING');
    const clear = screen(ctx({ customer: { name: 'Linh Tran', dateOfBirth: '1990-01-01', nationality: 'AU', vip: false } }), POLICY);
    expect(clear).toMatchObject({ status: 'CLEAR', list: 'NONE' });
  });

  it('moves the threshold with the policy', () => {
    expect(screen(ctx(), { ...POLICY, matchThreshold: 99 }).status).toBe('CLEAR');
    expect(screen(ctx(), { ...POLICY, matchThreshold: 70 }).status).toBe('SANCTION_HIT');
  });

  it('copes with empty watchlists', () => {
    expect(screen(ctx({ watchlist: [] }), POLICY)).toMatchObject({ status: 'CLEAR', score: 0, best: null });
  });
});

const kyc = (over: Partial<AuditEvent> = {}): AuditEvent => ({ at: T, kind: 'KYC_VERIFIED', detail: 'Passport checked', dateOfBirth: '1971-03-02', nationality: 'AU', ...over });

describe('investigation', () => {
  const customer = ctx().customer;

  it('clears a different date of birth and nationality as a false positive', () => {
    const r = investigate(customer, OFAC, [kyc()]);
    expect(r.verdict).toBe('FALSE_POSITIVE');
    expect(r.evidence).toHaveLength(1);
    expect(r.reasons.join(' ')).toMatch(/1971-03-02 against 1962-04-11/);
  });

  it('confirms a match when the verified date of birth agrees and the nationality does not disagree', () => {
    expect(investigate(customer, OFAC, [kyc({ dateOfBirth: '1962-04-11', nationality: 'RU' })]).verdict).toBe('TRUE_MATCH');
    expect(investigate(customer, OFAC, [kyc({ dateOfBirth: '1962-04-11', nationality: undefined })]).verdict).toBe('TRUE_MATCH');
  });

  it('will not decide without identity evidence, whatever the profile says', () => {
    const r = investigate(customer, OFAC, [{ at: T, kind: 'ACCOUNT_OPENED', detail: 'Opened online' }, { at: T, kind: 'SCREENING_RUN', detail: 'Clean' }]);
    expect(r.verdict).toBe('INCONCLUSIVE');
    expect(r.evidence).toHaveLength(0);
    expect(investigate(customer, OFAC, []).verdict).toBe('INCONCLUSIVE');
  });

  it('escalates mixed signals and conflicting documents', () => {
    expect(investigate(customer, OFAC, [kyc({ dateOfBirth: '1962-04-11', nationality: 'AU' })]).verdict).toBe('INCONCLUSIVE');
    expect(investigate(customer, OFAC, [kyc({ dateOfBirth: '1971-03-02', nationality: 'RU' })]).verdict).toBe('INCONCLUSIVE');
    const r = investigate(customer, OFAC, [kyc(), kyc({ kind: 'ID_DOCUMENT_SCANNED', dateOfBirth: '1962-04-11' })]);
    expect(r.verdict).toBe('INCONCLUSIVE');
    expect(r.reasons.join(' ')).toMatch(/disagree/);
  });

  it('ignores events that carry no identity data, and says so when the profile disagrees with the document', () => {
    const r = investigate({ ...customer, dateOfBirth: '1980-01-01' }, OFAC, [kyc(), { at: T, kind: 'ADDRESS_VERIFIED', detail: 'Utility bill' }]);
    expect(r.evidence).toHaveLength(1);
    expect(r.reasons.join(' ')).toMatch(/profile says 1980-01-01 but the verified document says 1971-03-02/);
  });

  it('has nothing to compare when nobody was listed', () => {
    expect(investigate(customer, null, [kyc()]).verdict).toBe('INCONCLUSIVE');
  });
});
