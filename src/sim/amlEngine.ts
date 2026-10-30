/** Phase 8: the checkpoint interceptor for the extended channels. onboarding eKYC ──────────────────────────────────────────────▶ AML screen ─▶ CASA (account opened) VietQR QR gateway ─▶ FacePay (> $400) ─▶ FDS (+ AML screen) ─▶ AML desk? ─▶ CASA SWIFT ISO 20022 gateway ─▶ FacePay (> $400) ─▶ FDS (+ AML screen) ─▶ AML desk? ─▶ CASA teller cash teller counter (+ AML screen, CTR) ─▶ AML desk? ─▶ CASA claim disputes desk ─▶ CASA (refund) or declined Every checkpoint is a pure function of the customer, so a day can be replayed exactly and the tests read the same verdicts the map shows. */

import { nameSimilarity } from '../engine/aml';
import { BIC_PATTERN } from '../engine/iso20022';
import { formatAud } from '../engine/money';
import { a2aPayment, amlRestrain, atmMismatchRefund, openingDeposit, paymentReturn, provisionalCredit, swiftRemittance, tellerDeposit, tellerWithdrawal, toEntries, type Draft } from '../engine/postings';
import type { GLEntry, MinorUnits, WatchlistEntry } from '../types/processLearning';
import type { PlaceId } from './topology';
import type {
  AmlSubject,
  BiometricContext,
  CashContext,
  Checkpoint,
  Customer,
  DeclineReason,
  DeviceContext,
  DisputeClaim,
  ExtendedKind,
  IdentityContext,
  RoutePlan,
  Stop,
  SwiftContext,
} from './types';

// Policy

/** VND per AUD used to show a VietQR amount. $400 is 10,000,000 VND, the FacePay line. */
export const VND_PER_AUD = 25_000;

/** Transfers above this need a FacePay match (the 10M VND rule for online transfers). */
export const BIOMETRIC_THRESHOLD_CENTS: MinorUnits = 40_000;

/** Cash at or above this files a Cash Transaction Report. The same line as the AML desk's large-value rule. */
export const CTR_THRESHOLD_CENTS: MinorUnits = 1_000_000;

/** eKYC thresholds: each one failed is a reason to refuse the account. */
export const EKYC_POLICY = { ocrMinPct: 90, livenessMin: 80, faceMatchMin: 85, tamperMax: 60 } as const;

/** FacePay thresholds for a high-value transfer. */
export const FACEPAY_POLICY = { faceMatchMin: 85, livenessMin: 80 } as const;

/** FDS device score: one weight per signal, a payment at or over `highRiskAt` is stopped. */
export const FDS_POLICY = { ip: 35, root: 40, bin: 45, newDevice: 10, binVelocityAt: 5, highRiskAt: 70 } as const;

/** AML screening. The name score is 0-100 (engine/aml.ts); a cross-border payment this large is held for review. */
export const AML_POLICY = { sanctionMatchAt: 85, largeCrossBorderCents: 1_000_000, structuringMinDeposits: 2 } as const;

/** Claim time limits, in days. A chargeback has the scheme's 120 days; a pacs.004 return and an ATM claim are shorter. */
export const DISPUTE_SLA_DAYS: Readonly<Record<DisputeClaim['type'], number>> = { CHARGEBACK: 120, PACS004_RETURN: 14, ATM_MISMATCH: 60 };

/** The bank's own copy of the consolidated sanctions list the screen matches names against. */
export const SANCTIONS_LIST: readonly WatchlistEntry[] = [
  { list: 'OFAC', name: 'Viktor Volkanov', dateOfBirth: '1968-03-11', country: 'RU' },
  { list: 'OFAC', name: 'Rashid Al-Tamimi', dateOfBirth: '1970-01-23', country: 'SY' },
  { list: 'OFAC', name: 'Kim Chol Su', dateOfBirth: '1975-07-02', country: 'KP' },
  { list: 'OFAC', name: 'Hassan Reza Moradi', dateOfBirth: '1972-11-30', country: 'IR' },
];

// eKYC

/** The first failed check names the verdict: a fake card, then liveness, then the face, then the citizen database. */
export function checkEkyc(id: IdentityContext): Extract<Checkpoint, { at: 'EKYC' }> {
  const base = { at: 'EKYC' as const, ocrMatchPct: id.ocrMatchPct, livenessScore: id.livenessScore, faceMatchPct: id.faceMatchPct };
  if (id.tamperScore > EKYC_POLICY.tamperMax || id.ocrMatchPct < EKYC_POLICY.ocrMinPct) return { ...base, verdict: 'FAKE_ID' };
  if (id.livenessScore < EKYC_POLICY.livenessMin) return { ...base, verdict: 'LIVENESS_FAILED' };
  if (id.faceMatchPct < EKYC_POLICY.faceMatchMin) return { ...base, verdict: 'FACE_MISMATCH' };
  if (!id.citizenDbMatch) return { ...base, verdict: 'CITIZEN_DB_MISMATCH' };
  return { ...base, verdict: 'VERIFIED' };
}

// FacePay

export const needsBiometric = (amountCents: MinorUnits): boolean => amountCents > BIOMETRIC_THRESHOLD_CENTS;

export function checkFacePay(b: BiometricContext): Extract<Checkpoint, { at: 'FACEPAY' }> {
  if (!b.enrolled) return { at: 'FACEPAY', verdict: 'NOT_ENROLLED', faceMatchPct: 0 };
  const ok = b.faceMatchPct >= FACEPAY_POLICY.faceMatchMin && b.livenessScore >= FACEPAY_POLICY.livenessMin;
  return { at: 'FACEPAY', verdict: ok ? 'MATCHED' : 'FAILED', faceMatchPct: b.faceMatchPct };
}

// FDS

/** Scores the device fingerprint. Signals add up, capped at 100. */
export function scoreDevice(d: DeviceContext): Extract<Checkpoint, { at: 'FDS' }> {
  const signals: Array<'IP' | 'ROOT' | 'BIN' | 'NEW_DEVICE'> = [];
  let score = 0;
  if (d.ipAnomaly) {
    signals.push('IP');
    score += FDS_POLICY.ip;
  }
  if (d.jailbroken) {
    signals.push('ROOT');
    score += FDS_POLICY.root;
  }
  if (d.binVelocity >= FDS_POLICY.binVelocityAt) {
    signals.push('BIN');
    score += FDS_POLICY.bin;
  }
  if (d.newDevice) {
    signals.push('NEW_DEVICE');
    score += FDS_POLICY.newDevice;
  }
  score = Math.min(100, score);
  return { at: 'FDS', verdict: score >= FDS_POLICY.highRiskAt ? 'HIGH_RISK' : 'CLEAR', score, signals };
}

// AML screening and review

export interface AmlScreenInput {
  subject: AmlSubject;
  amountCents: MinorUnits;
  cash?: CashContext;
  crossBorder?: boolean;
}

/** The best sanctions score for a name, 0-100. */
export const sanctionsScore = (name: string): number => SANCTIONS_LIST.reduce((best, e) => Math.max(best, nameSimilarity(name, e.name)), 0);

/** Cash split into pieces under the CTR line whose sum crosses it (smurfing). */
export function isStructuring(amountCents: MinorUnits, recent: readonly MinorUnits[]): boolean {
  const floor = CTR_THRESHOLD_CENTS * 0.8;
  const near = [...recent, amountCents].filter((c) => c >= floor && c < CTR_THRESHOLD_CENTS);
  return near.length >= AML_POLICY.structuringMinDeposits && near.reduce((n, c) => n + c, 0) >= CTR_THRESHOLD_CENTS;
}

/** The automated screen: a sanctions hit is frozen at once, a PEP, structuring or a large cross-border payment is held as STR_PENDING for an analyst, anything else is clean. */
export function screenAml(input: AmlScreenInput): Extract<Checkpoint, { at: 'AML_SCREEN' }> {
  const score = sanctionsScore(input.subject.name);
  const ctr = input.cash !== undefined && input.amountCents >= CTR_THRESHOLD_CENTS;
  if (score >= AML_POLICY.sanctionMatchAt) return { at: 'AML_SCREEN', verdict: 'SANCTION_MATCH', reason: 'OFAC', ctr, score };
  if (input.subject.pep) return { at: 'AML_SCREEN', verdict: 'STR_PENDING', reason: 'PEP', ctr, score };
  if (input.cash && input.cash.direction === 'IN' && isStructuring(input.amountCents, input.cash.recentCashCents)) return { at: 'AML_SCREEN', verdict: 'STR_PENDING', reason: 'STRUCTURING', ctr, score };
  if (input.crossBorder && input.amountCents >= AML_POLICY.largeCrossBorderCents) return { at: 'AML_SCREEN', verdict: 'STR_PENDING', reason: 'LARGE_CROSS_BORDER', ctr, score };
  return { at: 'AML_SCREEN', verdict: 'CLEAN', reason: 'NONE', ctr, score };
}

/** What the analyst decides about a held payment. */
export function reviewAml(screen: Extract<Checkpoint, { at: 'AML_SCREEN' }>, isFraud: boolean): Extract<Checkpoint, { at: 'AML_REVIEW' }> {
  if (screen.verdict === 'SANCTION_MATCH') return { at: 'AML_REVIEW', verdict: 'BLOCKED_SANCTION', reason: 'OFAC' };
  if (isFraud) return { at: 'AML_REVIEW', verdict: 'BLOCKED_STR', reason: screen.reason };
  return { at: 'AML_REVIEW', verdict: screen.reason === 'STRUCTURING' ? 'STR_FILED_RELEASED' : 'RELEASED', reason: screen.reason };
}

// Teller cash

export function checkTellerCash(cash: CashContext, amountCents: MinorUnits): Extract<Checkpoint, { at: 'TELLER' }> {
  const ctr = amountCents >= CTR_THRESHOLD_CENTS;
  const base = { at: 'TELLER' as const, direction: cash.direction, suspectSerials: cash.suspectSerials, ctr };
  if (cash.direction === 'IN' && cash.suspectSerials > 0) return { ...base, verdict: 'SUSPECT_NOTES' };
  if (cash.direction === 'OUT' && amountCents > cash.tillCents) return { ...base, verdict: 'VAULT_LIMIT' };
  return { ...base, verdict: 'COUNTED' };
}

// VietQR (EMVCo merchant-presented QR, Napas247)

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as EMVCo QR uses for tag 63. Upper-case hex, 4 digits. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const tlv = (tag: string, value: string): string => `${tag}${String(value.length).padStart(2, '0')}${value}`;

/** The Napas AID inside tag 38 of every VietQR. */
export const NAPAS_GUID = 'A000000727';

export interface VietQrSpec {
  /** 6-digit Napas BIN of the beneficiary bank. */
  bin: string;
  account: string;
  /** Dynamic QR carries the amount (tag 54, in VND); a static one lets the payer type it. */
  amountVnd?: number;
}

/** Builds a VietQR string with a correct CRC. */
export function buildVietQr(spec: VietQrSpec): string {
  const beneficiary = tlv('00', spec.bin) + tlv('01', spec.account);
  const merchant = tlv('00', NAPAS_GUID) + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
  const body =
    tlv('00', '01') +
    tlv('01', spec.amountVnd !== undefined ? '12' : '11') +
    tlv('38', merchant) +
    tlv('53', '704') +
    (spec.amountVnd !== undefined ? tlv('54', String(spec.amountVnd)) : '') +
    tlv('58', 'VN') +
    '6304';
  return body + crc16(body);
}

/** Reads a TLV string into tag → value. Null when a length runs past the end. */
export function readTlv(text: string): Map<string, string> | null {
  const out = new Map<string, string>();
  let i = 0;
  while (i < text.length) {
    if (i + 4 > text.length) return null;
    const tag = text.slice(i, i + 2);
    const len = Number(text.slice(i + 2, i + 4));
    if (!Number.isInteger(len) || i + 4 + len > text.length) return null;
    out.set(tag, text.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return out;
}

export interface VietQrParse {
  valid: boolean;
  mode: 'STATIC' | 'DYNAMIC' | null;
  issue: 'CRC' | 'FORMAT' | 'AMOUNT' | null;
  amountVnd: number | null;
  bin: string | null;
  /** The ISO 8583 fields the Napas247 switch message is built from. */
  iso8583: { mti: '0200'; processingCode: '912020'; amountVnd: number | null; currency: '704'; acquirerBin: string | null } | null;
}

/** Parses a VietQR payload: CRC first (anything after 6304), then the EMVCo tags, then the amount against what the customer is paying. */
export function parseVietQr(payload: string, instructedVnd: number): VietQrParse {
  const bad = (issue: VietQrParse['issue']): VietQrParse => ({ valid: false, mode: null, issue, amountVnd: null, bin: null, iso8583: null });
  const at = payload.lastIndexOf('6304');
  if (at < 0 || payload.length !== at + 8) return bad('FORMAT');
  if (crc16(payload.slice(0, at + 4)) !== payload.slice(at + 4).toUpperCase()) return bad('CRC');
  const tags = readTlv(payload);
  const merchant = tags?.get('38');
  const sub = merchant ? readTlv(merchant) : null;
  const beneficiary = sub?.get('01') ? readTlv(sub.get('01')!) : null;
  if (!tags || tags.get('00') !== '01' || tags.get('53') !== '704' || sub?.get('00') !== NAPAS_GUID || !beneficiary?.get('00')) return bad('FORMAT');
  const mode = tags.get('01') === '12' ? 'DYNAMIC' : tags.get('01') === '11' ? 'STATIC' : null;
  if (!mode) return bad('FORMAT');
  const amountVnd = tags.has('54') ? Number(tags.get('54')) : null;
  if (mode === 'DYNAMIC' && amountVnd !== instructedVnd) return { ...bad('AMOUNT'), mode };
  const bin = beneficiary.get('00')!;
  return { valid: true, mode, issue: null, amountVnd: amountVnd ?? instructedVnd, bin, iso8583: { mti: '0200', processingCode: '912020', amountVnd: amountVnd ?? instructedVnd, currency: '704', acquirerBin: bin } };
}

export const audToVnd = (cents: MinorUnits): number => Math.round((cents / 100) * VND_PER_AUD);

// SWIFT / ISO 20022

/** The first field of the pacs.008 that breaks a format rule, or null when it is well formed. */
export function checkSwift(m: SwiftContext): Extract<Checkpoint, { at: 'SWIFT' }> {
  const field =
    m.endToEndId.trim() === '' || m.endToEndId.length > 35
      ? 'EndToEndId'
      : !BIC_PATTERN.test(m.debtorAgent)
        ? 'DebtorAgent'
        : !BIC_PATTERN.test(m.creditorAgent)
          ? 'CreditorAgent'
          : !/^[A-Z]{3}$/.test(m.currency) || m.currency === 'AUD'
            ? 'Currency'
            : m.foreignMinor <= 0
              ? 'InterbankSettlementAmount'
              : null;
  return { at: 'SWIFT', verdict: field ? 'INVALID' : 'VALID', currency: m.currency, field };
}

// Disputes

export function resolveDispute(c: DisputeClaim): Extract<Checkpoint, { at: 'DISPUTE' }> {
  const base = { at: 'DISPUTE' as const, type: c.type };
  if (c.ageDays > DISPUTE_SLA_DAYS[c.type]) return { ...base, verdict: 'REJECTED_SLA' };
  const upheld = c.type === 'CHARGEBACK' ? !c.merchantEvidence : c.type === 'ATM_MISMATCH' ? !c.journalShowsDispensed : c.fundsRecoverable;
  return { ...base, verdict: upheld ? 'REFUND' : 'REJECTED_EVIDENCE' };
}

// Route planning

export const EXTENDED_KINDS: readonly ExtendedKind[] = ['ONBOARD', 'QR', 'TELLER', 'SWIFT', 'DISPUTE'];
export const isExtendedKind = (kind: string): kind is ExtendedKind => (EXTENDED_KINDS as readonly string[]).includes(kind);

/** Virtual milliseconds each checkpoint costs, for the latency KPI. */
const MS = { EKYC: 2400, QR: 150, SWIFT: 600, FACEPAY: 1100, FDS: 90, AML_REVIEW: 0, TELLER: 0, DISPUTE: 0, POSTING: 120 } as const;

const stop = (place: PlaceId, kind: Stop['kind'], label: string, note: string, check: Checkpoint | undefined, weight: number, durationMs: number): Stop => ({
  place,
  kind,
  nodeId: null,
  label,
  capability: null,
  durationMs,
  note,
  facts: {},
  weight,
  ...(check ? { check } : {}),
});

const end = (place: 'OUT_APPROVED' | 'OUT_DECLINED', label: string, note: string): Stop => stop(place, 'OUTCOME', label, note, undefined, 0, 0);

function plan(stops: Stop[], outcome: 'APPROVED' | 'DECLINED', reasonCode: string, decline: DeclineReason | null, drafts: readonly Draft[]): RoutePlan {
  return {
    stops,
    outcome,
    reasonCode,
    decline,
    latencyMs: stops.reduce((n, x) => n + x.durationMs, 0),
    passes: 1,
    heldCents: 0,
    suspenseCents: 0,
    threeDs: null,
    bnpl: null,
    recon: null,
    broken: false,
    ledger: drafts.length > 0 ? toEntries(drafts, 'tx_ext', 0) : ([] as GLEntry[]),
  };
}

const AML_SCREEN_NOTE: Record<Extract<Checkpoint, { at: 'AML_SCREEN' }>['reason'], string> = {
  NONE: 'Screened clean.',
  PEP: 'Politically exposed person: held as STR_PENDING for an analyst.',
  STRUCTURING: 'Cash split under the CTR line: held as STR_PENDING for an analyst.',
  LARGE_CROSS_BORDER: 'Large cross-border payment: held as STR_PENDING for an analyst.',
  OFAC: 'Name matches the sanctions list: AML_SANCTION_MATCH, funds frozen.',
};

/** The tail every money movement shares once it is past its channel's own checks. */
function screenedTail(
  c: Customer,
  screen: Extract<Checkpoint, { at: 'AML_SCREEN' }>,
  posting: { check: Extract<Checkpoint, { at: 'POSTING' }>; drafts: readonly Draft[]; label: string; note: string; reason: string },
  carry: Stop[],
): RoutePlan {
  const amount = c.payload.amount;
  const ledger = stop('LEDGER_DEBIT', 'WORK', 'Core CASA posting', posting.note, posting.check, 0.5, MS.POSTING);
  if (screen.verdict === 'CLEAN') {
    if (posting.check.verdict === 'NO_FUNDS') return plan([...carry, ledger, end('OUT_DECLINED', 'Declined', 'Not enough money in the account.')], 'DECLINED', 'INSUFFICIENT_FUNDS', 'FUNDS', []);
    return plan([...carry, ledger, end('OUT_APPROVED', posting.label, posting.note)], 'APPROVED', posting.reason, null, posting.drafts);
  }
  const review = reviewAml(screen, c.payload.isFraud);
  const note = AML_SCREEN_NOTE[screen.reason];
  if (review.verdict === 'BLOCKED_SANCTION' || review.verdict === 'BLOCKED_STR') {
    const sanction = review.verdict === 'BLOCKED_SANCTION';
    const desk = stop('AML_DESK', 'WORK', 'AML analyst review', sanction ? 'Analyst confirmed the sanctions match: the funds stay frozen and the regulator is told.' : 'Analyst confirmed the activity is suspicious: STR filed and the payment blocked.', review, sanction ? 0.5 : 1, MS.AML_REVIEW);
    // Money already in the bank (an account balance) is frozen in 2510.
    const drafts = c.kind === 'ONBOARD' || c.kind === 'TELLER' ? [] : [amlRestrain(amount, sanction ? 'Sanctions match confirmed.' : 'STR filed.')];
    return plan([...carry, desk, end('OUT_DECLINED', 'Blocked', note)], 'DECLINED', sanction ? 'AML_SANCTION_MATCH' : 'STR_BLOCKED', sanction ? 'AML_SANCTION_MATCH' : 'AML_STR_BLOCKED', drafts);
  }
  const desk = stop('AML_DESK', 'WORK', 'AML analyst review', review.verdict === 'STR_FILED_RELEASED' ? 'Analyst filed an STR for the regulator and released the payment.' : 'Analyst cleared the alert as a false positive and released the payment.', review, 1, MS.AML_REVIEW);
  if (posting.check.verdict === 'NO_FUNDS') return plan([...carry, desk, ledger, end('OUT_DECLINED', 'Declined', 'Not enough money in the account.')], 'DECLINED', 'INSUFFICIENT_FUNDS', 'FUNDS', []);
  return plan([...carry, desk, ledger, end('OUT_APPROVED', posting.label, posting.note)], 'APPROVED', posting.reason, null, posting.drafts);
}

const funded = (c: Customer): boolean => c.payload.availableBalance >= c.payload.amount;

function planOnboard(c: Customer): RoutePlan {
  const ext = c.ext!;
  const ekyc = checkEkyc(ext.identity!);
  const gate = stop('GATE_EKYC', 'GATE', 'eKYC: OCR, liveness, face match', `OCR ${ekyc.ocrMatchPct}%, liveness ${ekyc.livenessScore}, face match ${ekyc.faceMatchPct}%.`, ekyc, 1, MS.EKYC);
  if (ekyc.verdict !== 'VERIFIED') return plan([gate, end('OUT_DECLINED', 'Account refused', 'EKYC_LIVENESS_FAILED: the identity could not be proven.')], 'DECLINED', 'EKYC_LIVENESS_FAILED', 'EKYC_LIVENESS_FAILED', []);
  const screen = screenAml({ subject: ext.subject, amountCents: 0 });
  gate.screen = screen;
  const amount = c.payload.amount;
  return screenedTail(
    c,
    screen,
    { check: { at: 'POSTING', verdict: 'ACCOUNT_OPENED' }, drafts: [openingDeposit(amount)], label: 'Account opened', note: `Core banking opened the CASA account, credited the ${formatAud(amount)} opening deposit and enrolled the face for FacePay.`, reason: 'ACCOUNT_OPENED' },
    [gate],
  );
}

/** The digital money movements (QR, SWIFT): FacePay over the line, then the FDS with the automated AML screen. */
function planDigital(c: Customer, gate: Stop, crossBorder: boolean, drafts: readonly Draft[], label: string, note: string): RoutePlan {
  const ext = c.ext!;
  const stops: Stop[] = [gate];
  if (needsBiometric(c.payload.amount)) {
    const face = checkFacePay(ext.biometric ?? { enrolled: false, faceMatchPct: 0, livenessScore: 0 });
    const s = stop('SEC_FACEPAY', 'WORK', 'FacePay biometric authorisation', face.verdict === 'MATCHED' ? `Face match ${face.faceMatchPct}%: authorised.` : face.verdict === 'NOT_ENROLLED' ? 'No face enrolled: BIOMETRIC_AUTH_REQUIRED.' : `Face match ${face.faceMatchPct}%: BIOMETRIC_AUTH_REQUIRED.`, face, 1, MS.FACEPAY);
    stops.push(s);
    if (face.verdict !== 'MATCHED') return plan([...stops, end('OUT_DECLINED', 'Declined', 'BIOMETRIC_AUTH_REQUIRED: the transfer was over $400 and the face did not match.')], 'DECLINED', 'BIOMETRIC_AUTH_REQUIRED', 'BIOMETRIC_AUTH_REQUIRED', []);
  }
  const fds = scoreDevice(ext.device!);
  const fdsStop = stop('SEC_FDS', 'WORK', 'FDS device and pattern score', `Device score ${fds.score}${fds.signals.length > 0 ? ` (${fds.signals.join(', ')})` : ''}.`, fds, 1, MS.FDS);
  stops.push(fdsStop);
  if (fds.verdict === 'HIGH_RISK') return plan([...stops, end('OUT_DECLINED', 'Declined', 'FDS_HIGH_RISK_DEVICE: the device fingerprint scored too high.')], 'DECLINED', 'FDS_HIGH_RISK_DEVICE', 'FDS_HIGH_RISK_DEVICE', []);
  const screen = screenAml({ subject: ext.subject, amountCents: c.payload.amount, crossBorder });
  // The FDS runs the automated screen in the same call; its verdict rides on the FDS stop for the desk counters.
  fdsStop.screen = screen;
  const posting = funded(c) ? ({ at: 'POSTING', verdict: 'DEBITED' } as const) : ({ at: 'POSTING', verdict: 'NO_FUNDS' } as const);
  return screenedTail(c, screen, { check: posting, drafts, label, note, reason: crossBorder ? 'SWIFT_SENT' : 'QR_PAID' }, stops);
}

function planQr(c: Customer): RoutePlan {
  const amount = c.payload.amount;
  const parsed = parseVietQr(c.ext!.qr!.payload, audToVnd(amount));
  const check: Extract<Checkpoint, { at: 'QR' }> = { at: 'QR', verdict: parsed.valid ? 'PARSED' : 'INVALID', mode: parsed.mode, issue: parsed.issue };
  const gate = stop(
    'GATE_QR',
    'GATE',
    'VietQR parse (Napas247)',
    parsed.valid ? `${parsed.mode === 'DYNAMIC' ? 'Dynamic' : 'Static'} VietQR to BIN ${parsed.bin}, ${parsed.amountVnd?.toLocaleString('en-AU')} VND, mapped to ISO 8583 0200.` : `VietQR refused: ${parsed.issue === 'CRC' ? 'the CRC does not match' : parsed.issue === 'AMOUNT' ? 'the amount in the QR disagrees with the payment' : 'the EMVCo tags are malformed'}.`,
    check,
    1,
    MS.QR,
  );
  if (!parsed.valid) return plan([gate, end('OUT_DECLINED', 'Declined', 'QR_PAYLOAD_INVALID.')], 'DECLINED', 'QR_PAYLOAD_INVALID', 'QR_PAYLOAD_INVALID', []);
  return planDigital(c, gate, false, [a2aPayment('INSTANT', amount)], 'Paid', `The customer was debited ${formatAud(amount)} and Napas247 settled it instantly.`);
}

function planSwift(c: Customer): RoutePlan {
  const sw = c.ext!.swift!;
  const amount = c.payload.amount;
  const check = checkSwift(sw);
  const gate = stop('GATE_SWIFT', 'GATE', 'pacs.008 validation and FX', check.verdict === 'VALID' ? `pacs.008 to ${sw.creditorAgent} in ${sw.currency}, converted to ${formatAud(amount)}.` : `pacs.008 rejected: ${check.field} breaks the ISO 20022 format.`, check, 1, MS.SWIFT);
  if (check.verdict === 'INVALID') return plan([gate, end('OUT_DECLINED', 'Rejected', 'SWIFT_INVALID: the pacs.008 is malformed.')], 'DECLINED', 'SWIFT_INVALID', 'SWIFT_INVALID', []);
  return planDigital(c, gate, true, [swiftRemittance(amount, sw.currency)], 'Sent', `The customer was debited ${formatAud(amount)} and the correspondent bank was instructed.`);
}

function planTeller(c: Customer): RoutePlan {
  const ext = c.ext!;
  const cash = ext.cash!;
  const amount = c.payload.amount;
  const teller = checkTellerCash(cash, amount);
  const counter = stop(
    'TELLER_CASH',
    'GATE',
    cash.direction === 'IN' ? 'Teller cash deposit' : 'Teller cash withdrawal',
    teller.verdict === 'SUSPECT_NOTES'
      ? `${teller.suspectSerials} suspect note${teller.suspectSerials === 1 ? '' : 's'} found: serials recorded, the deposit is refused.`
      : teller.verdict === 'VAULT_LIMIT'
        ? `The till holds ${formatAud(cash.tillCents)}, less than the ${formatAud(amount)} asked for.`
        : `Counted ${formatAud(amount)} ${cash.direction === 'IN' ? 'in' : 'out'}${teller.ctr ? '; CTR filed (over $10,000)' : ''}.`,
    teller,
    1,
    MS.TELLER,
  );
  if (teller.verdict === 'SUSPECT_NOTES') return plan([counter, end('OUT_DECLINED', 'Refused', 'TELLER_SUSPECT_NOTE: the notes are held for the counterfeit report.')], 'DECLINED', 'TELLER_SUSPECT_NOTE', 'TELLER_SUSPECT_NOTE', []);
  if (teller.verdict === 'VAULT_LIMIT') return plan([counter, end('OUT_DECLINED', 'Declined', 'TELLER_VAULT_LIMIT: not enough cash at the counter.')], 'DECLINED', 'TELLER_VAULT_LIMIT', 'TELLER_VAULT_LIMIT', []);
  const screen = screenAml({ subject: ext.subject, amountCents: amount, cash });
  counter.screen = screen;
  const deposit = cash.direction === 'IN';
  const posting = deposit || funded(c) ? ({ at: 'POSTING', verdict: deposit ? 'CREDITED' : 'DEBITED' } as const) : ({ at: 'POSTING', verdict: 'NO_FUNDS' } as const);
  return screenedTail(
    c,
    screen,
    {
      check: posting,
      drafts: [deposit ? tellerDeposit(amount) : tellerWithdrawal(amount)],
      label: deposit ? 'Credited' : 'Cash paid out',
      note: deposit ? `The customer's account was credited ${formatAud(amount)}.` : `The customer was debited ${formatAud(amount)} and took the cash.`,
      reason: deposit ? 'TELLER_DEPOSIT' : 'TELLER_WITHDRAWAL',
    },
    [counter],
  );
}

function planDispute(c: Customer): RoutePlan {
  const claim = c.ext!.dispute!;
  const amount = c.payload.amount;
  const verdict = resolveDispute(claim);
  const label = claim.type === 'CHARGEBACK' ? 'Chargeback claim' : claim.type === 'PACS004_RETURN' ? 'pacs.004 return' : 'ATM mismatch claim';
  const desk = stop(
    'DISPUTE_DESK',
    'GATE',
    label,
    verdict.verdict === 'REFUND'
      ? 'Claim upheld: the customer is refunded.'
      : verdict.verdict === 'REJECTED_SLA'
        ? `Claim filed after ${claim.ageDays} days, past the ${DISPUTE_SLA_DAYS[claim.type]}-day limit.`
        : claim.type === 'CHARGEBACK'
          ? 'The merchant’s evidence holds: chargeback rejected.'
          : claim.type === 'ATM_MISMATCH'
            ? 'The electronic journal shows the notes were taken: claim rejected.'
            : 'The beneficiary bank cannot return the funds: claim rejected.',
    verdict,
    1,
    MS.DISPUTE,
  );
  if (verdict.verdict !== 'REFUND') return plan([desk, end('OUT_DECLINED', 'Claim rejected', 'DISPUTE_REJECTED.')], 'DECLINED', 'DISPUTE_REJECTED', 'DISPUTE_REJECTED', []);
  const draft = claim.type === 'CHARGEBACK' ? provisionalCredit(amount) : claim.type === 'ATM_MISMATCH' ? atmMismatchRefund(amount) : paymentReturn(amount);
  const ledger = stop('LEDGER_DEBIT', 'WORK', 'Core CASA posting', `Refund of ${formatAud(amount)} credited to the customer.`, { at: 'POSTING', verdict: 'REFUNDED' }, 0.5, MS.POSTING);
  return plan([desk, ledger, end('OUT_APPROVED', 'Refunded', `Refund of ${formatAud(amount)} credited to the customer.`)], 'APPROVED', claim.type === 'PACS004_RETURN' ? 'PACS004_RETURNED' : 'DISPUTE_REFUNDED', null, [draft]);
}

/** Plans a Phase 8 customer. Every hop is a wire on the map (the tests check it with routeIsWired). */
export function planExtended(c: Customer): RoutePlan {
  switch (c.kind as ExtendedKind) {
    case 'ONBOARD':
      return planOnboard(c);
    case 'QR':
      return planQr(c);
    case 'SWIFT':
      return planSwift(c);
    case 'TELLER':
      return planTeller(c);
    case 'DISPUTE':
      return planDispute(c);
  }
}

