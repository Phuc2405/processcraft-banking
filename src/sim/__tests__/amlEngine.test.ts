import { afterEach, describe, expect, it } from 'vitest';
import { setActiveLocale } from '../../i18n/locale';
import { feedText } from '../../i18n/feedVi';
import { trialBalance } from '../../engine/ledger';
import {
  AML_POLICY,
  audToVnd,
  BIOMETRIC_THRESHOLD_CENTS,
  buildVietQr,
  checkEkyc,
  checkFacePay,
  checkSwift,
  checkTellerCash,
  crc16,
  CTR_THRESHOLD_CENTS,
  isStructuring,
  needsBiometric,
  parseVietQr,
  planExtended,
  resolveDispute,
  reviewAml,
  sanctionsScore,
  scoreDevice,
  screenAml,
} from '../amlEngine';
import { BankSimulation } from '../bankSimulation';
import { describeWork } from '../narration';
import { GUIDED_FLOWS, flowScope } from '../guidedFlows';
import { PRESETS, presetCustomer } from '../presets';
import { planCheckout, routeIsWired } from '../processes';
import { DEFAULT_RULES } from '../rules';
import { STATIONS } from '../topology';
import { generateDay } from '../traffic';
import type { Customer, Packet, StationView } from '../types';
import { hasVietnamese } from '../../utils/i18nHelper';

afterEach(() => setActiveLocale('en'));

const CLEAN_ID = { ocrMatchPct: 97, livenessScore: 94, faceMatchPct: 95, citizenDbMatch: true, tamperScore: 8 };
const CLEAN_DEVICE = { ipAnomaly: false, jailbroken: false, binVelocity: 0, newDevice: false };

describe('eKYC', () => {
  it('verifies a clean identity and names the first failed check otherwise', () => {
    expect(checkEkyc(CLEAN_ID).verdict).toBe('VERIFIED');
    expect(checkEkyc({ ...CLEAN_ID, tamperScore: 80 }).verdict).toBe('FAKE_ID');
    expect(checkEkyc({ ...CLEAN_ID, ocrMatchPct: 70 }).verdict).toBe('FAKE_ID');
    expect(checkEkyc({ ...CLEAN_ID, livenessScore: 40 }).verdict).toBe('LIVENESS_FAILED');
    expect(checkEkyc({ ...CLEAN_ID, faceMatchPct: 60 }).verdict).toBe('FACE_MISMATCH');
    expect(checkEkyc({ ...CLEAN_ID, citizenDbMatch: false }).verdict).toBe('CITIZEN_DB_MISMATCH');
  });
});

describe('FacePay and the FDS', () => {
  it('asks for a face only over $400 (10M VND)', () => {
    expect(needsBiometric(BIOMETRIC_THRESHOLD_CENTS)).toBe(false);
    expect(needsBiometric(BIOMETRIC_THRESHOLD_CENTS + 1)).toBe(true);
    expect(audToVnd(BIOMETRIC_THRESHOLD_CENTS)).toBe(10_000_000);
  });

  it('matches a live, enrolled face and refuses the rest', () => {
    expect(checkFacePay({ enrolled: true, faceMatchPct: 96, livenessScore: 92 }).verdict).toBe('MATCHED');
    expect(checkFacePay({ enrolled: true, faceMatchPct: 60, livenessScore: 92 }).verdict).toBe('FAILED');
    expect(checkFacePay({ enrolled: false, faceMatchPct: 99, livenessScore: 99 }).verdict).toBe('NOT_ENROLLED');
  });

  it('adds up device signals and stops at 70', () => {
    expect(scoreDevice(CLEAN_DEVICE)).toMatchObject({ verdict: 'CLEAR', score: 0, signals: [] });
    expect(scoreDevice({ ...CLEAN_DEVICE, ipAnomaly: true, newDevice: true })).toMatchObject({ verdict: 'CLEAR', score: 45 });
    expect(scoreDevice({ ...CLEAN_DEVICE, ipAnomaly: true, jailbroken: true })).toMatchObject({ verdict: 'HIGH_RISK', score: 75, signals: ['IP', 'ROOT'] });
    expect(scoreDevice({ ...CLEAN_DEVICE, binVelocity: 9, ipAnomaly: true }).verdict).toBe('HIGH_RISK');
  });
});

describe('AML screening', () => {
  const subject = { name: 'Lan Nguyen', pep: false };

  it('matches listed names, including close transliterations, and leaves ordinary names alone', () => {
    expect(sanctionsScore('Viktor Volkanov')).toBe(100);
    expect(sanctionsScore('Victor Volkanoff')).toBeGreaterThanOrEqual(AML_POLICY.sanctionMatchAt);
    expect(sanctionsScore('Lan Nguyen')).toBeLessThan(AML_POLICY.sanctionMatchAt);
  });

  it('freezes a sanctions hit, holds a PEP, structuring or a large cross-border payment, and passes the rest', () => {
    expect(screenAml({ subject: { name: 'Viktor Volkanov', pep: false }, amountCents: 5_000 })).toMatchObject({ verdict: 'SANCTION_MATCH', reason: 'OFAC' });
    expect(screenAml({ subject: { ...subject, pep: true }, amountCents: 5_000 })).toMatchObject({ verdict: 'STR_PENDING', reason: 'PEP' });
    expect(screenAml({ subject, amountCents: 1_500_000, crossBorder: true })).toMatchObject({ verdict: 'STR_PENDING', reason: 'LARGE_CROSS_BORDER' });
    const cash = { direction: 'IN' as const, suspectSerials: 0, tillCents: 0, recentCashCents: [940_000, 910_000] };
    expect(screenAml({ subject, amountCents: 930_000, cash })).toMatchObject({ verdict: 'STR_PENDING', reason: 'STRUCTURING', ctr: false });
    expect(screenAml({ subject, amountCents: 1_200_000, cash: { ...cash, recentCashCents: [] } })).toMatchObject({ verdict: 'CLEAN', ctr: true });
    expect(screenAml({ subject, amountCents: 5_000 })).toMatchObject({ verdict: 'CLEAN', ctr: false });
  });

  it('spots cash split just under the CTR line', () => {
    expect(isStructuring(950_000, [900_000])).toBe(true);
    expect(isStructuring(950_000, [])).toBe(false);
    expect(isStructuring(CTR_THRESHOLD_CENTS, [950_000])).toBe(false);
  });

  it('keeps a sanctions match blocked, blocks confirmed fraud with an STR, and releases genuine customers', () => {
    const held = screenAml({ subject: { ...subject, pep: true }, amountCents: 5_000 });
    expect(reviewAml(held, false).verdict).toBe('RELEASED');
    expect(reviewAml(held, true).verdict).toBe('BLOCKED_STR');
    expect(reviewAml({ ...held, reason: 'STRUCTURING' }, false).verdict).toBe('STR_FILED_RELEASED');
    expect(reviewAml(screenAml({ subject: { name: 'Viktor Volkanov', pep: false }, amountCents: 1 }), false).verdict).toBe('BLOCKED_SANCTION');
  });
});

describe('VietQR', () => {
  it('computes the CRC-16/CCITT-FALSE check value', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('parses a dynamic and a static QR, and maps it to an ISO 8583 0200', () => {
    const amount = audToVnd(78_000);
    const dyn = parseVietQr(buildVietQr({ bin: '970436', account: '10293847', amountVnd: amount }), amount);
    expect(dyn).toMatchObject({ valid: true, mode: 'DYNAMIC', bin: '970436', amountVnd: amount, iso8583: { mti: '0200', currency: '704' } });
    expect(parseVietQr(buildVietQr({ bin: '970415', account: '555' }), 1234)).toMatchObject({ valid: true, mode: 'STATIC', amountVnd: 1234 });
  });

  it('refuses a damaged CRC, a wrong amount and broken tags', () => {
    const qr = buildVietQr({ bin: '970436', account: '1', amountVnd: 500_000 });
    const flipped = qr.slice(0, -1) + (qr.endsWith('0') ? '1' : '0');
    expect(parseVietQr(flipped, 500_000).issue).toBe('CRC');
    expect(parseVietQr(qr, 499_000).issue).toBe('AMOUNT');
    expect(parseVietQr('hello', 1).issue).toBe('FORMAT');
  });
});

describe('teller, SWIFT and disputes', () => {
  it('counts cash, refuses suspect notes and withdrawals over the till', () => {
    const base = { suspectSerials: 0, tillCents: 1_000_000, recentCashCents: [] };
    expect(checkTellerCash({ ...base, direction: 'IN' }, 1_200_000)).toMatchObject({ verdict: 'COUNTED', ctr: true });
    expect(checkTellerCash({ ...base, direction: 'IN', suspectSerials: 2 }, 50_000).verdict).toBe('SUSPECT_NOTES');
    expect(checkTellerCash({ ...base, direction: 'OUT' }, 1_200_000).verdict).toBe('VAULT_LIMIT');
  });

  it('validates the pacs.008 fields', () => {
    const ok = { endToEndId: 'E2E-1', debtorAgent: 'NOVAAU2SXXX', creditorAgent: 'CHASUS33XXX', foreignMinor: 100, currency: 'USD', fxRate: 1.5, country: 'US' };
    expect(checkSwift(ok).verdict).toBe('VALID');
    expect(checkSwift({ ...ok, creditorAgent: 'CHAS' })).toMatchObject({ verdict: 'INVALID', field: 'CreditorAgent' });
    expect(checkSwift({ ...ok, endToEndId: '' }).field).toBe('EndToEndId');
    expect(checkSwift({ ...ok, currency: 'AUD' }).field).toBe('Currency');
  });

  it('applies each claim type’s time limit and evidence rule', () => {
    const claim = { ageDays: 5, merchantEvidence: false, journalShowsDispensed: false, fundsRecoverable: true };
    expect(resolveDispute({ ...claim, type: 'CHARGEBACK' }).verdict).toBe('REFUND');
    expect(resolveDispute({ ...claim, type: 'CHARGEBACK', merchantEvidence: true }).verdict).toBe('REJECTED_EVIDENCE');
    expect(resolveDispute({ ...claim, type: 'CHARGEBACK', ageDays: 121 }).verdict).toBe('REJECTED_SLA');
    expect(resolveDispute({ ...claim, type: 'PACS004_RETURN', ageDays: 15 }).verdict).toBe('REJECTED_SLA');
    expect(resolveDispute({ ...claim, type: 'ATM_MISMATCH', journalShowsDispensed: true }).verdict).toBe('REJECTED_EVIDENCE');
  });
});

describe('the interceptor routes', () => {
  const plan = (id: Parameters<typeof presetCustomer>[0]) => planCheckout(presetCustomer(id, DEFAULT_RULES)!, {} as never);
  const places = (id: Parameters<typeof presetCustomer>[0]) => plan(id).stops.map((s) => s.place);

  it('plays every Phase 8 preset to the outcome on its button, along wires that exist', () => {
    const want: Record<string, [string, string | null]> = {
      'ekyc-open': ['APPROVED', null],
      'ekyc-deepfake': ['DECLINED', 'EKYC_LIVENESS_FAILED'],
      'teller-12k': ['APPROVED', null],
      'teller-smurf': ['APPROVED', null],
      'qr-780': ['APPROVED', null],
      'qr-rooted': ['DECLINED', 'FDS_HIGH_RISK_DEVICE'],
      'swift-6800': ['APPROVED', null],
      'swift-sanction': ['DECLINED', 'AML_SANCTION_MATCH'],
      'claim-return': ['APPROVED', null],
    };
    for (const [id, [outcome, decline]] of Object.entries(want)) {
      const p = plan(id as never);
      expect(p.outcome, id).toBe(outcome);
      expect(p.decline, id).toBe(decline);
      expect(routeIsWired(p.stops), id).toBe(true);
    }
  });

  it('chains biometrics, then the FDS, then the ledger, and only stops at the AML desk when something was flagged', () => {
    expect(places('qr-780')).toEqual(['GATE_QR', 'SEC_FACEPAY', 'SEC_FDS', 'LEDGER_DEBIT', 'OUT_APPROVED']);
    expect(places('teller-smurf')).toEqual(['TELLER_CASH', 'AML_DESK', 'LEDGER_DEBIT', 'OUT_APPROVED']);
    expect(places('swift-sanction')).toEqual(['GATE_SWIFT', 'SEC_FACEPAY', 'SEC_FDS', 'AML_DESK', 'OUT_DECLINED']);
    expect(places('ekyc-deepfake')).toEqual(['GATE_EKYC', 'OUT_DECLINED']);
    expect(places('claim-return')).toEqual(['DISPUTE_DESK', 'LEDGER_DEBIT', 'OUT_APPROVED']);
  });

  it('writes STR_PENDING on a held payment and files the CTR on large cash', () => {
    const smurf = plan('teller-smurf');
    expect(smurf.stops[0]?.screen).toMatchObject({ verdict: 'STR_PENDING', reason: 'STRUCTURING' });
    expect(smurf.stops[1]?.check).toMatchObject({ at: 'AML_REVIEW', verdict: 'STR_FILED_RELEASED' });
    expect(plan('teller-12k').stops[0]?.check).toMatchObject({ at: 'TELLER', ctr: true, direction: 'OUT' });
  });

  it('posts balanced lines: the QR to the instant rail, SWIFT to the nostro, a frozen sanctions hit to 2510', () => {
    expect(plan('qr-780').ledger.map((e) => [e.debitAccount, e.creditAccount])).toEqual([['CUST_CASA', 'A2A_INSTANT_SETTLEMENT']]);
    expect(plan('swift-6800').ledger.map((e) => e.creditAccount)).toEqual(['SWIFT_NOSTRO']);
    expect(plan('swift-sanction').ledger.map((e) => e.creditAccount)).toEqual(['AML_RESTRAINED_FUNDS']);
    expect(plan('teller-12k').ledger.map((e) => [e.debitAccount, e.creditAccount])).toEqual([['CUST_CASA', 'TELLER_VAULT_CASH']]);
    expect(plan('claim-return').ledger.map((e) => e.kind)).toEqual(['PAYMENT_RETURN']);
    expect(plan('ekyc-deepfake').ledger).toEqual([]);
    const lines = PRESETS.flatMap((p) => (p.scenario && presetCustomer(p.id, DEFAULT_RULES)?.ext ? plan(p.id).ledger : []));
    expect(lines.length).toBeGreaterThan(5);
    expect(trialBalance(lines).balanced).toBe(true);
  });

  it('routes every generated Phase 8 customer of several days along wired hops, with the reason codes of the brief', () => {
    const reasons = new Set<string>();
    for (const day of [1, 2, 3, 4, 5]) {
      for (const c of generateDay(11, day).customers) {
        if (!c.ext) continue;
        const p = planExtended(c);
        expect(routeIsWired(p.stops), `${c.id} ${p.stops.map((s) => s.place).join('>')}`).toBe(true);
        expect(p.broken).toBe(false);
        if (p.decline) reasons.add(p.decline);
      }
    }
    for (const r of ['EKYC_LIVENESS_FAILED', 'FDS_HIGH_RISK_DEVICE']) expect(reasons, r).toContain(r);
    expect(reasons.has('PROCESS_ERROR')).toBe(false);
  });
});

describe('the extended flows on the living bank', () => {
  const sim = new BankSimulation({ seed: 7, day: 1, headless: true });
  const report = sim.runToEndOfDay();
  const view = sim.snapshot();
  const line = (sv: StationView, label: string): string | undefined => sv.stats.lines.find((l) => l.label === label)?.value;

  it('serves every new desk and keeps the books balanced', () => {
    for (const id of ['GATE_EKYC', 'GATE_QR', 'TELLER_CASH', 'SEC_FACEPAY', 'SEC_FDS', 'DISPUTE_DESK', 'GATE_SWIFT'] as const) expect(view.stations[id].stats.processedToday, id).toBeGreaterThan(0);
    expect(view.ledger.trial.balanced).toBe(true);
    const x = report.kpis.ext;
    expect(x.accountsOpened + x.qrPaid + x.swiftSent + x.tellerDeposits + x.tellerWithdrawals).toBeGreaterThan(50);
  });

  it('shows the brief’s live metrics, each with its own tip', () => {
    const ekyc = view.stations.GATE_EKYC;
    expect(line(ekyc, 'OCR matching')).toMatch(/^\d+%$/);
    expect(line(ekyc, 'Face liveness pass rate')).toMatch(/%$/);
    expect(line(ekyc, 'Fake ID detection rate')).toMatch(/%$/);
    expect(line(view.stations.TELLER_CASH, 'Vault cash balance')).toMatch(/^\$/);
    expect(line(view.stations.AML_DESK, 'Suspicious ratio')).toBeDefined();
    expect(line(view.stations.AML_DESK, 'Review latency (min)')).toBeDefined();
    for (const id of ['GATE_EKYC', 'GATE_QR', 'TELLER_CASH', 'SEC_FACEPAY', 'SEC_FDS', 'AML_DESK', 'DISPUTE_DESK', 'GATE_SWIFT'] as const) {
      expect(view.stations[id].stats.lines.length, id).toBeGreaterThan(2);
      for (const l of view.stations[id].stats.lines) expect(l.tip, `${id} ${l.label}`).toBeTruthy();
    }
  });

  it('keeps the human desks human and staffed', () => {
    for (const id of ['TELLER_CASH', 'AML_DESK', 'DISPUTE_DESK'] as const) {
      expect(STATIONS[id].staff).toBeGreaterThan(1);
      expect(view.stations[id].workers.every((w) => !w.machine)).toBe(true);
    }
  });
});

describe('guided flows 05-08', () => {
  it('lights a wired path for every extended flow', () => {
    for (const id of [5, 6, 7, 8] as const) {
      const f = GUIDED_FLOWS[id];
      expect(f.code).toBe(`0${id}`);
      expect(flowScope(id).wires.size, f.title).toBeGreaterThan(2);
      expect(PRESETS.some((p) => p.flow === id)).toBe(true);
    }
  });
});

describe('Vietnamese activity lines for the checkpoints', () => {
  it('rebuilds every checkpoint line in Vietnamese', () => {
    const presetIds = ['ekyc-open', 'ekyc-deepfake', 'teller-12k', 'teller-smurf', 'qr-780', 'qr-rooted', 'swift-6800', 'swift-sanction', 'claim-return'] as const;
    const lines: string[] = [];
    for (const id of presetIds) {
      const c = presetCustomer(id, DEFAULT_RULES) as Customer;
      const p = planCheckout(c, {} as never);
      const packet = { id: 'x', kind: c.kind, scenario: c.scenario, amountCents: c.payload.amount, plan: p } as unknown as Packet;
      p.stops.forEach((s, i) => {
        if (s.kind !== 'OUTCOME') lines.push(describeWork(s.place as never, packet, s, p.stops[i - 1]));
      });
    }
    setActiveLocale('vi');
    for (const en of lines) {
      const vi = feedText(en);
      expect(vi, en).not.toBe(en);
      expect(hasVietnamese(vi), vi).toBe(true);
    }
  });
});
