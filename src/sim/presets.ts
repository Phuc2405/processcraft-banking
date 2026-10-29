/** The preset actions of the guided flows: one click sends a scripted customer into the live bank ("Swipe $20"), or, for the night flow, runs the clock to 23:00. */

import type { BankingPayload, CardType } from '../types/processLearning';
import type { FlowId } from '../types/viewport';
import type { BankRules } from './rules';
import type { CheckoutKind, Customer, ExtendedContext } from './types';
import { scenarioById } from './scenarios';
import { audToVnd, buildVietQr } from './amlEngine';
import { activeLocale } from '../i18n/localeCore';

export type PresetVariant = 'success' | 'danger' | 'primary' | 'warning';

export type PresetId =
  | 'pos-20'
  | 'pos-500'
  | 'token-45'
  | 'otp-250'
  | 'cdm-200'
  | 'eod'
  | 'ekyc-open'
  | 'ekyc-deepfake'
  | 'teller-12k'
  | 'teller-smurf'
  | 'qr-780'
  | 'qr-rooted'
  | 'swift-6800'
  | 'swift-sanction'
  | 'claim-return';

export interface PresetDef {
  id: PresetId;
  flow: FlowId;
  icon: string;
  label: string;
  variant: PresetVariant;
  /** What the learner should watch for, for the button's tooltip. */
  hint: string;
  /** The scenario the payment is (see PRESET_SCENARIOS), or null for an action that is not a payment. */
  scenario: string | null;
}

export const PRESETS: readonly PresetDef[] = [
  { id: 'pos-20', flow: 1, icon: '▶', label: 'Swipe $20 (Approved 00)', variant: 'success', hint: 'A debit card with plenty in the account: watch the hold placed at Debit CASA and RC 00 come back.', scenario: 'preset-pos-20' },
  { id: 'pos-500', flow: 1, icon: '⚠', label: 'Swipe $500 (Declined 51 NSF)', variant: 'danger', hint: 'The account holds $120: the funds check fails and the terminal gets RC 51, insufficient funds.', scenario: 'preset-pos-500' },
  { id: 'token-45', flow: 2, icon: '▶', label: 'Token Checkout ($45)', variant: 'primary', hint: 'A virtual card number with a fresh dynamic CVV: the vault swaps the token, the code checks out, the payment is approved.', scenario: 'preset-token-45' },
  { id: 'otp-250', flow: 2, icon: '🔒', label: '3DS OTP Challenge ($250)', variant: 'warning', hint: 'A risk score inside the challenge band: the customer is texted a code, types it, and the payment goes through.', scenario: 'preset-3ds-250' },
  { id: 'cdm-200', flow: 3, icon: '▶', label: 'Deposit $200 Cash', variant: 'success', hint: 'Card and PIN at the machine, $200 in notes counted, and the account credited on the spot.', scenario: 'preset-cdm-200' },
  { id: 'eod', flow: 4, icon: '▶', label: 'Trigger Overnight EOD', variant: 'primary', hint: 'Runs the clock to 23:00 and plays the night cycle: batch clearing, Visa settlement, 3-way reconciliation.', scenario: null },
  { id: 'ekyc-open', flow: 5, icon: '▶', label: 'Open an Account (eKYC)', variant: 'success', hint: 'A clean CCCD scan and a live selfie: identity verified, sanctions screen clean, account opened with a $50 deposit.', scenario: 'preset-ekyc-open' },
  { id: 'ekyc-deepfake', flow: 5, icon: '⚠', label: 'Deepfake Selfie (EKYC_LIVENESS_FAILED)', variant: 'danger', hint: 'A replayed video instead of a live face: the liveness check fails and no account is opened.', scenario: 'preset-ekyc-deepfake' },
  { id: 'teller-12k', flow: 6, icon: '▶', label: 'Withdraw $12,000 Cash (CTR)', variant: 'primary', hint: 'Over the $10,000 line: the teller pays it out and a Cash Transaction Report is filed automatically.', scenario: 'preset-teller-12k' },
  { id: 'teller-smurf', flow: 6, icon: '🔍', label: 'Split Cash Deposit (STR)', variant: 'warning', hint: 'The third deposit just under $10,000 this week: held as STR_PENDING, then an analyst files an STR and releases it.', scenario: 'preset-teller-smurf' },
  { id: 'qr-780', flow: 7, icon: '▶', label: 'Pay $780 by VietQR (FacePay)', variant: 'success', hint: 'A dynamic VietQR over $400: CRC checks out, the face matches, the device is clean, and Napas247 settles it.', scenario: 'preset-qr-780' },
  { id: 'qr-rooted', flow: 7, icon: '⚠', label: 'Rooted Phone (FDS_HIGH_RISK_DEVICE)', variant: 'danger', hint: 'A jailbroken phone on a foreign VPN: the FDS scores it over 70 and stops the payment.', scenario: 'preset-qr-rooted' },
  { id: 'swift-6800', flow: 8, icon: '▶', label: 'Send $6,800 Tuition (SWIFT)', variant: 'primary', hint: 'A well-formed pacs.008 in USD: FacePay, a clean FDS and sanctions screen, then the correspondent bank pays it.', scenario: 'preset-swift-6800' },
  { id: 'swift-sanction', flow: 8, icon: '🛑', label: 'Sanctioned Name (AML_SANCTION_MATCH)', variant: 'danger', hint: 'The sender matches the OFAC list: the payment is frozen and an analyst confirms the hit.', scenario: 'preset-swift-sanction' },
  { id: 'claim-return', flow: 8, icon: '↩', label: 'Claim a pacs.004 Return', variant: 'warning', hint: 'Money sent to the wrong account: the disputes desk confirms the funds are recoverable and refunds the customer.', scenario: 'preset-claim-return' },
];

export const presetsFor = (flow: FlowId): PresetDef[] => PRESETS.filter((p) => p.flow === flow);
/** The preset that shows a guided flow at its clearest, which is what "Simulate this Flow" sends. */
export const PRIMARY_PRESET: Readonly<Record<FlowId, PresetId>> = { 1: 'pos-20', 2: 'token-45', 3: 'cdm-200', 4: 'eod', 5: 'ekyc-open', 6: 'teller-12k', 7: 'qr-780', 8: 'swift-6800' };
export const presetById = (id: string): PresetDef | undefined => PRESETS.find((p) => p.id === id);

/** A fixed moment the virtual card's code is checked against; the dynamic CVV is issued a few seconds before it. */
const TS = 1_800_000_000_000;

function payload(amount: number, over: Partial<BankingPayload>): BankingPayload {
  return {
    txId: 'tx_preset',
    amount,
    channel: 'POS',
    cardType: 'DEBIT' as CardType,
    rawCvv: '',
    clientTimestamp: TS,
    riskScore: 8,
    isFraud: false,
    availableBalance: 90_000,
    creditLimit: 0,
    ...over,
  };
}

/** The 3DS score halfway into today's challenge band, so the customer is always asked for a code, whatever the dials say. */
export function challengeScore(rules: BankRules): number {
  return Math.round((rules.frictionlessBelow + rules.rejectAtOrAbove - 1) / 2);
}

/** The scripted customer behind a payment preset, or null for the night-cycle action. */
export function presetCustomer(id: PresetId, rules: BankRules): Customer | null {
  const def = presetById(id);
  const scenario = def?.scenario ? scenarioById(def.scenario) : null;
  if (!def || !scenario) return null;
  const amount = scenario.amountCents;
  const make = (kind: CheckoutKind, p: BankingPayload, extra: Partial<Customer> = {}): Customer => ({ id: 'preset', kind, scenario: scenario.id, minute: 0, payload: p, otpCompletes: true, ...extra });
  switch (id) {
    case 'pos-20':
      return make('POS', payload(amount, { channel: 'POS', availableBalance: 90_000 }));
    case 'pos-500':
      return make('POS', payload(amount, { channel: 'POS', availableBalance: 12_000 }));
    case 'token-45':
      return make(
        'VIRTUAL',
        payload(amount, {
          channel: 'ECOMMERCE',
          cardType: 'VIRTUAL_DPAN',
          rawCvv: '482',
          virtualCard: { dpan: '5120 4471 0928 3316', vaultEntry: { fpanLast4: '4242', status: 'ACTIVE', fundingSource: 'DEBIT', expectedDcvv: '482', dcvvIssuedAt: TS - 6_000 } },
        }),
      );
    case 'otp-250':
      return make('ECOM', payload(amount, { channel: 'ECOMMERCE', rawCvv: '123', riskScore: challengeScore(rules) }), { otpCompletes: true });
    case 'cdm-200':
      return make('ATM', payload(amount, { channel: 'ATM', availableBalance: 40_000 }), { atm: { wrongPins: 0, knowsPin: true, jams: false, deposit: true } });
    case 'eod':
      return null;
    case 'ekyc-open':
    case 'ekyc-deepfake': {
      const fake = id === 'ekyc-deepfake';
      return make('ONBOARD', payload(amount, { channel: 'IN_APP', availableBalance: amount }), {
        ext: { subject: SUBJECT, identity: { ocrMatchPct: 98, livenessScore: fake ? 41 : 95, faceMatchPct: 96, citizenDbMatch: true, tamperScore: 6 } },
      });
    }
    case 'teller-12k':
    case 'teller-smurf': {
      const smurf = id === 'teller-smurf';
      const cash: NonNullable<ExtendedContext['cash']> = smurf
        ? { direction: 'IN', suspectSerials: 0, tillCents: 1_500_000, recentCashCents: [940_000, 910_000] }
        : { direction: 'OUT', suspectSerials: 0, tillCents: 1_800_000, recentCashCents: [] };
      return make('TELLER', payload(amount, { channel: 'POS', availableBalance: 4_000_000 }), { ext: { subject: SUBJECT, cash } });
    }
    case 'qr-780':
    case 'qr-rooted': {
      const rooted = id === 'qr-rooted';
      return make('QR', payload(amount, { channel: 'IN_APP', availableBalance: 400_000 }), {
        ext: {
          subject: SUBJECT,
          qr: { payload: buildVietQr({ bin: '970436', account: '10293847', amountVnd: audToVnd(amount) }) },
          biometric: { enrolled: true, faceMatchPct: 97, livenessScore: 95 },
          device: rooted ? { ipAnomaly: true, jailbroken: true, binVelocity: 0, newDevice: true } : CLEAN_DEVICE,
        },
      });
    }
    case 'swift-6800':
    case 'swift-sanction':
      return make('SWIFT', payload(amount, { channel: 'IN_APP', availableBalance: 3_000_000 }), {
        ext: {
          subject: id === 'swift-sanction' ? { name: 'Viktor Volkanov', pep: false } : SUBJECT,
          biometric: { enrolled: true, faceMatchPct: 96, livenessScore: 94 },
          device: CLEAN_DEVICE,
          swift: { endToEndId: 'SWIFT-PRESET-000001', debtorAgent: 'NOVAAU2SXXX', creditorAgent: 'CHASUS33XXX', foreignMinor: Math.round(amount / 1.52), currency: 'USD', fxRate: 1.52, country: 'US' },
        },
      });
    case 'claim-return':
      return make('DISPUTE', payload(amount, { channel: 'IN_APP', availableBalance: 90_000 }), {
        ext: { subject: SUBJECT, dispute: { type: 'PACS004_RETURN', ageDays: 2, merchantEvidence: false, journalShowsDispensed: false, fundsRecoverable: true } },
      });
  }
}

/** The customer every Phase 8 preset is, unless the preset is about the name. */
const SUBJECT = { name: 'Lan Nguyen', pep: false } as const;
const CLEAN_DEVICE = { ipAnomaly: false, jailbroken: false, binVelocity: 0, newDevice: false } as const;

const PRESET_VI: Readonly<Record<PresetId, { label: string; hint: string }>> = {
  'pos-20': { label: 'Quẹt $20 (Chấp thuận 00)', hint: 'Thẻ ghi nợ, tài khoản dư dả: xem khoản khoanh giữ tại CASA và RC 00 trả về.' },
  'pos-500': { label: 'Quẹt $500 (Từ chối 51 không đủ số dư)', hint: 'Tài khoản có $120: kiểm tra số dư thất bại và máy POS nhận RC 51, không đủ số dư.' },
  'token-45': { label: 'Thanh toán bằng token ($45)', hint: 'Số thẻ ảo kèm CVV động còn mới: kho token đổi số, mã hợp lệ, giao dịch được duyệt.' },
  'otp-250': { label: 'Thử thách OTP 3DS ($250)', hint: 'Điểm rủi ro nằm trong dải thử thách: khách nhận mã qua tin nhắn, nhập mã, và giao dịch được duyệt.' },
  'cdm-200': { label: 'Nộp $200 tiền mặt', hint: 'Thẻ và PIN tại máy, $200 tiền giấy được đếm, và tài khoản được ghi có ngay tại chỗ.' },
  eod: { label: 'Chạy cuối ngày qua đêm', hint: 'Chạy đồng hồ tới 23:00 và phát chu kỳ ban đêm: bù trừ theo lô, quyết toán Visa, đối soát 3 bên.' },
  'ekyc-open': { label: 'Mở tài khoản (eKYC)', hint: 'CCCD rõ nét và ảnh selfie người thật: xác minh danh tính, sàng lọc cấm vận sạch, mở tài khoản với $50 tiền gửi.' },
  'ekyc-deepfake': { label: 'Selfie deepfake (EKYC_LIVENESS_FAILED)', hint: 'Một video phát lại thay cho khuôn mặt thật: không qua kiểm tra người thật và không mở tài khoản.' },
  'teller-12k': { label: 'Rút $12,000 tiền mặt (CTR)', hint: 'Vượt ngưỡng $10,000: giao dịch viên chi tiền và báo cáo giao dịch tiền mặt (CTR) được lập tự động.' },
  'teller-smurf': { label: 'Nộp tiền mặt chia nhỏ (STR)', hint: 'Lần nộp thứ ba ngay dưới $10,000 trong tuần: bị giữ ở trạng thái STR_PENDING, rồi chuyên viên lập STR và giải phóng.' },
  'qr-780': { label: 'Trả $780 bằng VietQR (FacePay)', hint: 'VietQR động trên $400: CRC hợp lệ, khuôn mặt khớp, thiết bị sạch, và Napas247 quyết toán.' },
  'qr-rooted': { label: 'Điện thoại đã root (FDS_HIGH_RISK_DEVICE)', hint: 'Điện thoại đã jailbreak dùng VPN nước ngoài: FDS chấm trên 70 và chặn giao dịch.' },
  'swift-6800': { label: 'Gửi $6,800 học phí (SWIFT)', hint: 'Điện pacs.008 đúng định dạng bằng USD: FacePay, FDS và sàng lọc cấm vận sạch, rồi ngân hàng đại lý thanh toán.' },
  'swift-sanction': { label: 'Tên trong danh sách cấm vận (AML_SANCTION_MATCH)', hint: 'Người gửi trùng danh sách OFAC: giao dịch bị phong tỏa và chuyên viên xác nhận.' },
  'claim-return': { label: 'Khiếu nại hoàn trả pacs.004', hint: 'Tiền chuyển nhầm tài khoản: quầy khiếu nại xác nhận tiền thu hồi được và hoàn cho khách.' },
};

/** A preset's button label and tooltip in the active language. */
export function presetText(p: PresetDef): { label: string; hint: string } {
  return activeLocale() === 'vi' ? PRESET_VI[p.id] : { label: p.label, hint: p.hint };
}
