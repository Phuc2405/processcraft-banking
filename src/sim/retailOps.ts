/**
 * The Phase 1/4 retail operations book: twelve sub-processes, their one-click demo actions and the journals they post. Each
 * sub-process lives inside one of the eight guided flows (OPS_SUBPROCESSES) as one of its child sub-groups (demoGroups.ts, which
 * also holds the core presets' groups): it adds buttons and paths to that flow, no flow of its own.
 *
 * It is a book of its own, on purpose. Its GL numbers are the ones the retail operations brief names (1113, 1950, 2930 ATM
 * Suspense, 3510...), and several of them mean something else on the charts that already exist: on the core ledger 2930 is
 * frozen AML funds and 4510 / 4520 are the other way round. OPS_ACCOUNTS records each account's core-ledger counterpart, and
 * the Knowledge Base prints that crosswalk. No React here: the dock, the Knowledge Base and the tests read the same rules.
 */

import type { Localized } from '../i18n/locale';
import type { DebtBuckets, WaterfallResult } from './creditEngine';
import type { Outcome } from '../types/processLearning';
import type { FlowId } from '../types/viewport';
import type { ChapterId } from './academyCatalog';
import { CTR_THRESHOLD_CENTS } from './amlEngine';
import { allocateWaterfall, assessDti, closeTermDepositEarly, creditScore, debtGroup, DEMAND_RATE_PCT, DTI_LIMIT_PCT, PROVISION_PCT, specificProvision } from './creditEngine';
import type { PresetId } from './presets';
import { GL_CODE, type GlAccount } from './staffRoleplay';
import type { PlaceId } from './topology';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

export type OpsSide = 'asset' | 'liability' | 'income' | 'expense';

export const OPS_ACCOUNTS = [
  { id: 'CASH_ATM', code: '1011', side: 'asset', core: 'ATM_CASH', name: L('Cash · ATM cassettes', 'Tiền mặt · Hộp tiền ATM'), plain: L('The notes loaded in the ATMs. Same GL as the vault and the till: 1011 is split by where the cash physically is.', 'Tiền giấy trong các máy ATM. Cùng TK với kho quỹ và ngăn kéo: 1011 được chia theo nơi tiền thực sự nằm.') },
  { id: 'CASH_TILL', code: '1011', side: 'asset', core: 'TILL_CASH', name: L('Vault Cash · teller till', 'Tiền mặt kho quỹ · Ngăn kéo giao dịch viên'), plain: L('The notes in the teller’s drawer, limited to $50,000.', 'Tiền trong ngăn kéo của giao dịch viên, tối đa $50,000.') },
  { id: 'CASH_VAULT', code: '1011', side: 'asset', core: 'VAULT_CASH', name: L('Vault Cash · main vault', 'Tiền mặt kho quỹ · Kho chính'), plain: L('The branch’s strong room, which feeds the ATMs and takes a till’s surplus.', 'Kho tiền của chi nhánh, cấp tiền cho ATM và nhận phần dư của ngăn kéo.') },
  { id: 'INTERBANK', code: '1113', side: 'asset', core: 'INTERBANK_SETTLEMENT', name: L('Interbank Settlement', 'Thanh toán liên ngân hàng'), plain: L('The bank’s settlement position: a credit here is value sent to another bank.', 'Vị thế quyết toán của ngân hàng: ghi Có là giá trị đã chuyển sang ngân hàng khác.') },
  { id: 'OVERDRAFT', code: '1310', side: 'asset', core: 'OVERDRAFT_RECV', name: L('Card & Overdraft Receivable', 'Phải thu thẻ & thấu chi'), plain: L('What customers owe on cards and when their balance went below zero. It is what a negative CASA balance really is on the bank’s books.', 'Khoản khách nợ trên thẻ và khi số dư xuống dưới 0. Đây chính là số dư CASA âm trên sổ của ngân hàng.') },
  { id: 'LOAN', code: '1320', side: 'asset', core: 'LOAN_PRINCIPAL', name: L('Loan & Instalment Principal', 'Nợ gốc vay & trả góp'), plain: L('The principal still owed on loans and Pay-in-4 plans.', 'Nợ gốc còn lại của khoản vay và trả góp 4 kỳ.') },
  { id: 'ALLOWANCE', code: '1290', side: 'asset', core: 'LOAN_LOSS_ALLOWANCE', name: L('Credit Loss Allowance', 'Dự phòng rủi ro tín dụng'), plain: L('A contra-asset: what the bank expects to lose, netted against its loans. A credit raises it.', 'Tài khoản điều chỉnh giảm tài sản: khoản ngân hàng dự kiến mất, trừ vào dư nợ. Ghi Có làm tăng dự phòng.') },
  { id: 'WALLET_SETTLEMENT', code: '1950', side: 'liability', core: 'WALLET_SETTLEMENT', name: L('Wallet Settlement', 'Quyết toán ví điện tử'), plain: L('What the bank owes wallet providers for the top-ups it has taken, until they are settled.', 'Khoản ngân hàng phải trả đơn vị ví cho các lần nạp đã nhận, cho đến khi quyết toán.') },
  { id: 'CASA', code: '2010', side: 'liability', core: 'CASA', name: L('Customer CASA', 'Tài khoản thanh toán của khách'), plain: L('What the bank owes customers in their current and savings accounts. A debit is money leaving a customer.', 'Khoản ngân hàng nợ khách trên tài khoản thanh toán và tiết kiệm. Ghi Nợ là tiền rời khỏi khách.') },
  { id: 'TERM_DEPOSIT', code: '2021', side: 'liability', core: 'TERM_DEPOSIT', name: L('Term Deposits', 'Tiền gửi có kỳ hạn'), plain: L('What the bank owes customers on fixed-term savings.', 'Khoản ngân hàng nợ khách trên tiền gửi có kỳ hạn.') },
  { id: 'TD_PLEDGED', code: '2022', side: 'liability', core: 'TD_PLEDGED', name: L('Pledged Deposits (Collateral)', 'Tiền gửi cầm cố (TSĐB)'), plain: L('Savings locked as collateral: still the customer’s money, but it cannot be withdrawn.', 'Tiền gửi bị phong tỏa làm tài sản bảo đảm: vẫn là tiền của khách nhưng không rút được.') },
  { id: 'ACCRUED_INTEREST', code: '2023', side: 'liability', core: 'TERM_DEPOSIT', name: L('Accrued Interest Payable', 'Lãi dự trả'), plain: L('Interest the bank has recognised on deposits but not paid yet.', 'Tiền lãi ngân hàng đã ghi nhận trên tiền gửi nhưng chưa trả.') },
  { id: 'ATM_SUSPENSE', code: '2930', side: 'liability', core: 'ATM_SUSPENSE', name: L('ATM Suspense', 'Treo ATM'), plain: L('Money taken from a customer when the machine failed: parked until the cash count settles who is owed it. It must drain to zero.', 'Tiền đã trừ của khách khi máy gặp lỗi: treo lại cho đến khi kiểm quỹ xác định ai được nhận. Phải về 0.') },
  { id: 'NAPAS_FEE', code: '3510', side: 'liability', core: 'SWITCH_FEE_EXPENSE', name: L('Domestic Switch Fee Payable (NAPAS)', 'Phí NAPAS phải trả'), plain: L('The switch’s share of an interbank ATM fee: collected from the customer and owed to the domestic switch (NAPAS) until tonight’s settlement.', 'Phần phí của chuyển mạch trong phí ATM liên ngân hàng: thu từ khách và phải trả NAPAS đến khi quyết toán đêm nay.') },
  { id: 'NSF_INCOME', code: '4510', side: 'income', core: 'PENALTY_INCOME', name: L('NSF & Late Fee Income', 'Thu phí NSF & phạt trễ hạn'), plain: L('Fees for a payment returned for lack of funds, and penalties for paying late.', 'Phí khi lệnh bị trả lại do không đủ số dư, và phí phạt khi trả trễ hạn.') },
  { id: 'INTEREST_INCOME', code: '4110', side: 'income', core: 'INTEREST_INCOME', name: L('Interest Income', 'Thu lãi'), plain: L('Interest earned on loans and cards, including overdue interest.', 'Tiền lãi thu từ khoản vay và thẻ, gồm cả lãi quá hạn.') },
  { id: 'FEE_INCOME', code: '4520', side: 'income', core: 'FEE_INCOME', name: L('ATM & Card Fee Income', 'Thu phí ATM & thẻ'), plain: L('The bank’s own fee income: its share of ATM fees, and annual, issuance and lock fees on cards.', 'Thu nhập phí của ngân hàng: phần phí ATM được giữ lại, phí thường niên, phát hành và khóa thẻ.') },
  { id: 'INTEREST_EXPENSE', code: '5110', side: 'expense', core: 'INTEREST_EXPENSE', name: L('Interest Expense', 'Chi phí lãi'), plain: L('Interest the bank pays on deposits. Closing a deposit early reverses part of it.', 'Tiền lãi ngân hàng trả trên tiền gửi. Tất toán sớm sẽ đảo một phần.') },
  { id: 'PROVISION_EXPENSE', code: '5610', side: 'expense', core: 'PROVISION_EXPENSE', name: L('Provisioning Expense', 'Chi phí dự phòng'), plain: L('The charge to profit when expected credit losses rise.', 'Khoản trừ vào lợi nhuận khi tổn thất tín dụng dự kiến tăng.') },
] as const satisfies readonly { id: string; code: string; side: OpsSide; core: GlAccount; name: Localized<string>; plain: Localized<string> }[];

export type OpsAccountId = (typeof OPS_ACCOUNTS)[number]['id'];
export const OPS_ACCOUNT_IDS: readonly OpsAccountId[] = OPS_ACCOUNTS.map((a) => a.id);
export const opsAccount = (id: OpsAccountId): (typeof OPS_ACCOUNTS)[number] => OPS_ACCOUNTS.find((a) => a.id === id)!;
/** The account's number on the core ledger, for the crosswalk. */
export const coreCodeOf = (id: OpsAccountId): string => GL_CODE[opsAccount(id).core];

/** The cash desk limits and tariffs (the simulator's own: a real bank sets them in its policy and published tariff). */
export const OPS_LIMITS = {
  tillLimitCents: 5_000_000,
  tillFloatCents: 2_500_000,
  cassetteCapacityCents: 2_000_000,
  /** Under this share of capacity, a cassette raises the refill alert. */
  cassetteLowPct: 15,
  /** What the sensor drill reports. */
  cassetteDrillPct: 12,
  nsfFeeCents: 1_500,
  atmFeeCents: 110,
  napasFeeCents: 55,
  rtpSlaMs: 5_000,
  /** The simulated clearing time per hop of an instant payment. */
  stepMs: 600,
} as const;

const OPENING: Readonly<Partial<Record<OpsAccountId, number>>> = {
  CASH_ATM: 1_600_000,
  CASH_TILL: OPS_LIMITS.tillFloatCents,
  CASH_VAULT: 20_000_000,
  INTERBANK: 30_000_000,
  LOAN: 20_000_000,
  TERM_DEPOSIT: -30_000_000,
  ACCRUED_INTEREST: -1_000_000,
};

/** Debit-positive opening balances: customer deposits are the balancing figure, so the book starts square. */
export const OPS_OPENING: Readonly<Record<OpsAccountId, number>> = (() => {
  const b = Object.fromEntries(OPS_ACCOUNT_IDS.map((id) => [id, OPENING[id] ?? 0])) as Record<OpsAccountId, number>;
  b.CASA = -OPS_ACCOUNT_IDS.reduce((sum, id) => sum + b[id], 0);
  return b;
})();

export interface OpsLine {
  account: OpsAccountId;
  dr: number;
  cr: number;
}

export type OpsActionId =
  | 'bill-electric-85'
  | 'wallet-cashin-100'
  | 'atm-withdraw-100'
  | 'atm-jam-200'
  | 'cassette-low'
  | 'cassette-refill'
  | 'teller-deposit-5000'
  | 'teller-exceed-limit'
  | 'fee-annual-45'
  | 'fee-card-10'
  | 'autopay-loan-250'
  | 'autopay-nsf-250'
  | 'bnpl-approve-400'
  | 'bnpl-decline-dti'
  | 'card-late-fee'
  | 'waterfall-120'
  | 'waterfall-50'
  | 'risk-migrate-95dpd'
  | 'td-break-10k'
  | 'collateral-lock'
  | 'collateral-liquidate'
  // The decline and edge cases added so that every sub-process shows both sides of its decision.
  | 'bill-nsf-51'
  | 'bill-timeout-68'
  | 'fee-collect-fail'
  | 'fee-annual-waived'
  | 'wallet-name-mismatch'
  | 'bnpl-decline-cic'
  | 'waterfall-nsf'
  | 'risk-migrate-group5'
  | 'risk-cure'
  | 'teller-counterfeit'
  | 'td-mature-close'
  | 'td-break-pledged'
  | 'td-break-id-mismatch'
  | 'collateral-shortfall'
  | 'collateral-release';

export type OpsStatus = 'APPROVED' | 'DECLINED' | 'HELD' | 'ALERT' | 'BLOCKED';

export type OpsSubProcessId = 'bill-pay' | 'wallet-qr' | 'atm-napas' | 'cassette-jam' | 'teller-vault' | 'card-fees' | 'bnpl-credit' | 'debt-waterfall' | 'credit-risk' | 'term-deposit' | 'collateral' | 'auto-pay';

/** The twelve sub-processes and the guided flow each one is taught inside. */
export const OPS_SUBPROCESSES: readonly { id: OpsSubProcessId; flow: FlowId; title: Localized<string> }[] = [
  { id: 'bill-pay', flow: 1, title: L('Utility Bill Pay & Direct Debit', 'Thanh toán hóa đơn & Ủy nhiệm thu') },
  { id: 'wallet-qr', flow: 7, title: L('e-Wallet & Dynamic QR (MoMo / VietQR)', 'Ví điện tử & VietQR') },
  { id: 'atm-napas', flow: 3, title: L('ATM Cash Withdrawal/Deposit & Interbank Fees', 'Giao dịch Rút/Nộp tiền ATM & Phí liên ngân hàng') },
  { id: 'cassette-jam', flow: 3, title: L('ATM Cassette Alert & Cash Jam (GL 2930)', 'Cảnh báo hộp tiền ATM & Kẹt tiền (TK 2930)') },
  { id: 'teller-vault', flow: 6, title: L('OTC Teller Cash Vault ($50,000 Limit)', 'Kho quỹ tiền mặt tại quầy (hạn mức $50,000)') },
  { id: 'card-fees', flow: 1, title: L('Card Annual/Issuance Fees', 'Phí thường niên/phát hành thẻ') },
  { id: 'auto-pay', flow: 1, title: L('Loan Auto-Pay & NSF Penalty', 'Tự động trích nợ vay & Phạt NSF') },
  { id: 'bnpl-credit', flow: 2, title: L('Pay-in-4 Appraisal Counter (BNPL) & Retail Credit', 'Quầy thẩm định trả góp (BNPL) & Tín dụng bán lẻ') },
  { id: 'debt-waterfall', flow: 2, title: L('Debt Recovery Waterfall', 'Thứ tự thu hồi nợ (Waterfall)') },
  { id: 'credit-risk', flow: 2, title: L('Credit Risk & Debt Group Migration', 'Rủi ro tín dụng & Chuyển nhóm nợ') },
  { id: 'term-deposit', flow: 6, title: L('Term Deposit Closure (Early / At Maturity)', 'Tất toán tiết kiệm (Trước hạn / Đúng hạn)') },
  { id: 'collateral', flow: 6, title: L('Collateral Lock & Liquidation', 'Phong tỏa & Xử lý TSĐB') },
];
/** The Academy chapter each sub-process is taught in: the Academy stays at six chapters. One place to change the mapping. */
export const OPS_SUB_CHAPTER: Readonly<Record<OpsSubProcessId, ChapterId>> = { 'bill-pay': 2, 'card-fees': 2, 'wallet-qr': 4, 'atm-napas': 5, 'cassette-jam': 5, 'teller-vault': 5, 'auto-pay': 2, 'debt-waterfall': 2, 'bnpl-credit': 4, 'credit-risk': 4, 'term-deposit': 5, 'collateral': 5 };

export const opsSubProcess = (id: OpsSubProcessId): (typeof OPS_SUBPROCESSES)[number] => OPS_SUBPROCESSES.find((s) => s.id === id)!;

export interface OpsActionDef {
  id: OpsActionId;
  sub: OpsSubProcessId;
  icon: string;
  label: Localized<string>;
  hint: Localized<string>;
  variant: 'success' | 'danger' | 'warning' | 'primary';
  /** The desks the action's payment travels through, in order: what its sub-process lights. */
  route: readonly PlaceId[];
  /** The scripted customer's available balance, so a click always shows the case it names whatever was clicked before. */
  customerCents?: number;
}

export const OPS_ACTIONS: readonly OpsActionDef[] = [
  {
    id: 'bill-electric-85',
    sub: 'bill-pay',
    icon: '▶',
    variant: 'success',
    label: L('Pay $85 Electric Bill (Approved 00)', 'Trả $85 tiền điện (Chấp thuận 00)'),
    hint: L('The account holds $900: Dr 2010 CASA / Cr 1113 Interbank.', 'Tài khoản có $900: Nợ 2010 CASA / Có 1113 Liên ngân hàng.'),
    route: ['GATE_POS', 'LEDGER_DEBIT', 'OUT_APPROVED'],
    customerCents: 90_000,
  },
  {
    id: 'wallet-cashin-100',
    sub: 'wallet-qr',
    icon: '▶',
    variant: 'success',
    label: L('Cash-in $100 MoMo Wallet (Approved 00)', 'Nạp $100 vào ví MoMo (Chấp thuận 00)'),
    hint: L('Own-name linked account: Dr 2010 CASA / Cr 1950 Wallet Settlement.', 'Tài khoản liên kết chính chủ: Nợ 2010 CASA / Có 1950 Quyết toán ví.'),
    route: ['GATE_A2A', 'LEDGER_DEBIT', 'OUT_APPROVED'],
    customerCents: 60_000,
  },
  {
    id: 'atm-withdraw-100',
    sub: 'atm-napas',
    icon: '▶',
    variant: 'success',
    label: L('Withdraw $100 Cash at ATM (Approved 00)', 'Rút $100 tiền mặt ATM (Chấp thuận 00)'),
    hint: L('Dr 2010 $101.65 / Cr 1011 $100 + Cr 4520 $1.10 + Cr 3510 $0.55.', 'Nợ 2010 $101.65 / Có 1011 $100 + Có 4520 $1.10 + Có 3510 $0.55.'),
    route: ['GATE_ATM', 'ATM_CASH', 'LEDGER_DEBIT', 'OUT_APPROVED', 'EOD_BATCH'],
    customerCents: 60_000,
  },
  {
    id: 'atm-jam-200',
    sub: 'cassette-jam',
    icon: '▲',
    variant: 'danger',
    label: L('Simulate $200 ATM Cash Jam', 'Mô phỏng kẹt $200 tại ATM'),
    hint: L('The dispenser fails after the debit: $200 goes to TK 2930 ATM Suspense and an EOD ticket opens.', 'Máy lỗi sau khi đã trừ tiền: $200 vào TK 2930 Treo ATM và mở phiếu đối soát cuối ngày.'),
    route: ['GATE_ATM', 'ATM_CASH', 'SUSPENSE', 'RECON', 'OUT_SETTLED'],
    customerCents: 60_000,
  },
  {
    id: 'cassette-low',
    sub: 'cassette-jam',
    icon: '🔔',
    variant: 'warning',
    label: L('Trigger Low Cassette Alert (<15%)', 'Báo động hộp tiền ATM sắp hết (dưới 15%)'),
    hint: L('A sensor drill: no money moves, a warning badge appears on the ATM until the CIT refill.', 'Diễn tập cảm biến: tiền không dịch chuyển, huy hiệu cảnh báo hiện trên ATM đến khi tiếp quỹ CIT.'),
    route: ['ATM_CASH'],
  },
  {
    id: 'cassette-refill',
    sub: 'cassette-jam',
    icon: '🚚',
    variant: 'success',
    label: L('CIT Cassette Refill (Approved)', 'Tiếp quỹ ATM qua CIT (Hoàn tất)'),
    hint: L('The cash-in-transit crew tops the cassettes back up to capacity from the vault: Dr 1011 ATM cassettes / Cr 1011 main vault. The alert clears.', 'Đội vận chuyển tiền (CIT) nạp đầy lại hộp tiền từ kho quỹ: Nợ 1011 Hộp tiền ATM / Có 1011 Kho chính. Cảnh báo được gỡ.'),
    route: ['ATM_CASH'],
  },
  {
    id: 'teller-deposit-5000',
    sub: 'teller-vault',
    icon: '▶',
    variant: 'success',
    label: L('Deposit $5,000 Cash at Counter', 'Nộp $5,000 tiền mặt tại quầy'),
    hint: L('Dr 1011 Vault Cash (till) / Cr 2010 CASA. A till pushed over $50,000 forces a vault transfer.', 'Nợ 1011 Tiền mặt kho quỹ (ngăn kéo) / Có 2010 CASA. Ngăn kéo vượt $50,000 buộc phải chuyển kho quỹ.'),
    route: ['TELLER_CASH', 'LEDGER_DEBIT', 'OUT_APPROVED'],
  },
  {
    id: 'teller-exceed-limit',
    sub: 'teller-vault',
    icon: '⚠️',
    variant: 'warning',
    label: L('Exceed Teller Till Limit ($50,000)', 'Vượt hạn mức ngăn kéo ($50,000)'),
    hint: L('A deposit that takes the till $2,500 over its limit: the counter locks until the surplus goes to the vault.', 'Khoản nộp làm ngăn kéo vượt hạn mức $2,500: quầy bị khóa đến khi phần dư chuyển về kho quỹ.'),
    route: ['TELLER_CASH', 'LEDGER_DEBIT', 'OUT_APPROVED'],
  },
  {
    id: 'fee-annual-45',
    sub: 'card-fees',
    icon: '▶',
    variant: 'primary',
    label: L('Charge $45 Annual Card Fee', 'Thu $45 phí thường niên thẻ'),
    hint: L('The account holds $20: the balance goes to -$25, booked as TK 1310 Overdraft.', 'Tài khoản có $20: số dư xuống -$25, ghi nhận vào TK 1310 Thấu chi.'),
    route: ['GATE_POS', 'LEDGER_DEBIT', 'OUT_APPROVED'],
    customerCents: 2_000,
  },
  {
    id: 'fee-card-10',
    sub: 'card-fees',
    icon: '▶',
    variant: 'success',
    label: L('Charge $10 Card Lock/Issuance Fee', 'Thu $10 phí khóa/phát hành thẻ'),
    hint: L('Dr 2010 CASA / Cr 4520 Card Fee Income.', 'Nợ 2010 CASA / Có 4520 Thu phí thẻ.'),
    route: ['GATE_POS', 'LEDGER_DEBIT', 'OUT_APPROVED'],
    customerCents: 60_000,
  },
  {
    id: 'autopay-loan-250',
    sub: 'auto-pay',
    icon: '▶',
    variant: 'success',
    label: L('Auto-Pay $250 Loan Instalment (Approved 00)', 'Tự động trích $250 trả góp (Chấp thuận 00)'),
    hint: L('The account holds $900: Dr 2010 CASA / Cr 1320 Loan Principal.', 'Tài khoản có $900: Nợ 2010 CASA / Có 1320 Nợ gốc.'),
    route: ['LEDGER_DEBIT', 'OUT_APPROVED'],
    customerCents: 90_000,
  },
  {
    id: 'autopay-nsf-250',
    sub: 'auto-pay',
    icon: '▲',
    variant: 'danger',
    label: L('Auto-Pay $250 Instalment (Declined 51 - Insufficient Funds)', 'Tự động trích $250 (Từ chối 51 - Không đủ số dư)'),
    hint: L('The account holds $120: the instalment stays unpaid and the $15 NSF fee posts (4510).', 'Tài khoản có $120: kỳ trả góp chưa thu được và ghi nhận phí NSF $15 (4510).'),
    route: ['LEDGER_DEBIT', 'OUT_DECLINED'],
    customerCents: 12_000,
  },
  {
    id: 'bnpl-approve-400',
    sub: 'bnpl-credit',
    icon: '▶',
    variant: 'success',
    label: L('Approve $400 Pay-in-4 (DTI 23%)', 'Duyệt trả góp 4 kỳ $400 (Nợ/Thu nhập 23%)'),
    hint: L('Income $3,000, DTI 23%: the shop is paid in full, $100 down, and $300 stays on 1320.', 'Thu nhập $3,000, DTI 23%: cửa hàng nhận đủ, khách trả trước $100, $300 còn lại ở TK 1320.'),
    route: ['GATE_ECOM', 'BNPL', 'LEDGER_DEBIT', 'OUT_APPROVED'],
    customerCents: 90_000,
  },
  {
    id: 'bnpl-decline-dti',
    sub: 'bnpl-credit',
    icon: '▲',
    variant: 'danger',
    label: L('Refuse Pay-in-4 (DTI 48% > 45%)', 'Từ chối trả góp (Nợ/Thu nhập 48% vượt 45%)'),
    hint: L('Debt service would take 48% of income: over the 45% limit, so nothing posts.', 'Nghĩa vụ trả nợ chiếm 48% thu nhập: vượt ngưỡng 45% nên không ghi nhận gì.'),
    route: ['GATE_ECOM', 'BNPL', 'LEDGER_CREDIT', 'OUT_DECLINED'],
  },
  {
    id: 'card-late-fee',
    sub: 'bnpl-credit',
    icon: '▶',
    variant: 'warning',
    label: L('Charge $42 Card Late Fee & Interest', 'Thu $42 phạt trễ hạn & lãi thẻ'),
    hint: L('Dr 1310 Card Receivable / Cr 4510 $25 Late Fee + Cr 4110 $17 Overdue Interest.', 'Nợ 1310 Phải thu thẻ / Có 4510 $25 Phạt trễ hạn + Có 4110 $17 Lãi quá hạn.'),
    route: ['BNPL', 'LEDGER_CREDIT', 'OUT_APPROVED'],
  },
  {
    id: 'waterfall-120',
    sub: 'debt-waterfall',
    icon: '▶',
    variant: 'primary',
    label: L('Repay $120: Penalty → Interest → Principal', 'Trả $120: Phạt → Lãi → Gốc'),
    hint: L('On a debt of $25 penalty, $40 interest and $300 principal: $55 reaches the principal.', 'Với khoản nợ phạt $25, lãi $40, gốc $300: $55 được trả vào gốc.'),
    route: ['BNPL', 'LEDGER_DEBIT', 'OUT_APPROVED'],
    customerCents: 60_000,
  },
  {
    id: 'waterfall-50',
    sub: 'debt-waterfall',
    icon: '▶',
    variant: 'warning',
    label: L('Repay $50: Principal Untouched', 'Trả $50: Chưa đụng đến gốc'),
    hint: L('The same debt: $25 clears the penalty, $25 goes to interest, and nothing reaches the principal.', 'Cùng khoản nợ: $25 trả hết phạt, $25 vào lãi, chưa có gì vào gốc.'),
    route: ['BNPL', 'LEDGER_DEBIT', 'OUT_APPROVED'],
    customerCents: 60_000,
  },
  {
    id: 'risk-migrate-95dpd',
    sub: 'credit-risk',
    icon: '⚠️',
    variant: 'warning',
    label: L('Migrate Loan at 95 Days Late (Group 3)', 'Chuyển nhóm khoản vay trễ 95 ngày (Nhóm 3)'),
    hint: L('A $1,000 unsecured loan moves from group 1 to non-performing group 3: Dr 5610 / Cr 1290 at 20%.', 'Khoản vay $1,000 không TSĐB chuyển từ nhóm 1 sang nợ xấu nhóm 3: Nợ 5610 / Có 1290 mức 20%.'),
    route: ['BNPL', 'LEDGER_CREDIT', 'OUT_APPROVED'],
  },
  {
    id: 'td-break-10k',
    sub: 'term-deposit',
    icon: '▶',
    variant: 'primary',
    label: L('Close $10,000 Term Deposit Early', 'Tất toán sớm tiết kiệm $10,000'),
    hint: L('After 180 days at 6%: interest falls to the 0.1% demand rate, and the rest is reversed.', 'Sau 180 ngày ở mức 6%: lãi giảm về mức không kỳ hạn 0,1%, phần còn lại được đảo.'),
    route: ['SAVINGS_DESK', 'LEDGER_DEBIT', 'OUT_APPROVED'],
  },
  {
    id: 'collateral-lock',
    sub: 'collateral',
    icon: '🔒',
    variant: 'warning',
    label: L('Lock $5,000 Collateral on Default', 'Phong tỏa $5,000 TSĐB khi vỡ nợ'),
    hint: L('A default freezes the pledged savings: Dr 2021 Term Deposits / Cr 2022 Pledged.', 'Vỡ nợ làm phong tỏa tiền gửi cầm cố: Nợ 2021 Tiền gửi / Có 2022 Cầm cố.'),
    route: ['COLLATERAL_VAULT', 'SAVINGS_DESK', 'LEDGER_DEBIT', 'OUT_APPROVED'],
  },
  {
    id: 'collateral-liquidate',
    sub: 'collateral',
    icon: '▶',
    variant: 'danger',
    label: L('Liquidate Collateral to Clear Bad Debt', 'Xử lý TSĐB để thu hồi nợ xấu'),
    hint: L('The locked $5,000 pays the $4,500 debt in waterfall order, and $500 goes back to the customer.', '$5,000 đã phong tỏa trả khoản nợ $4,500 theo thứ tự cấn trừ, $500 trả lại khách.'),
    route: ['COLLATERAL_VAULT', 'SAVINGS_DESK', 'LEDGER_DEBIT', 'OUT_APPROVED'],
  },
  {
    id: 'collateral-release',
    sub: 'collateral',
    icon: '🔓',
    variant: 'success',
    label: L('Release $5,000 Collateral on Full Repayment', 'Giải chấp $5,000 TSĐB khi tất toán khoản vay'),
    hint: L('The loan is repaid in full, so the pledge is lifted: Dr 2022 Pledged / Cr 2021 Term Deposits. The savings are free to withdraw again.', 'Khoản vay đã trả hết nên giải chấp: Nợ 2022 Cầm cố / Có 2021 Tiền gửi. Tiền gửi được rút lại bình thường.'),
    route: ['COLLATERAL_VAULT', 'SAVINGS_DESK', 'LEDGER_DEBIT', 'OUT_APPROVED'],
  },
  {
    id: 'bill-nsf-51',
    sub: 'bill-pay',
    icon: '▲',
    variant: 'danger',
    label: L('Pay $85 Electric Bill (Declined 51 - Insufficient Funds)', 'Trả $85 tiền điện (Từ chối 51 - Không đủ số dư)'),
    hint: L('The account holds $40: the direct debit is returned unpaid, nothing reaches the biller, and the $15 NSF fee posts (4510).', 'Tài khoản chỉ có $40: lệnh ủy nhiệm thu bị trả lại, nhà cung cấp không nhận được tiền, và ghi nhận phí NSF $15 (4510).'),
    route: ['GATE_POS', 'LEDGER_DEBIT', 'OUT_DECLINED'],
    customerCents: 4_000,
  },
  {
    id: 'bill-timeout-68',
    sub: 'bill-pay',
    icon: '⌛',
    variant: 'danger',
    label: L('Pay $85 Electric Bill (Declined 68 - Biller Timeout)', 'Trả $85 tiền điện (Từ chối 68 - Nhà cung cấp không phản hồi)'),
    hint: L('The biller’s system does not answer in time: the hold is released (auto-reversal), the customer keeps the money and may pay again.', 'Hệ thống nhà cung cấp không phản hồi kịp: khoản tạm giữ được giải phóng (tự động đảo), khách giữ nguyên tiền và có thể thanh toán lại.'),
    route: ['GATE_POS', 'LEDGER_DEBIT', 'OUT_DECLINED'],
    customerCents: 90_000,
  },
  {
    id: 'fee-collect-fail',
    sub: 'card-fees',
    icon: '▲',
    variant: 'danger',
    label: L('Collect $45 Annual Fee (Declined 51 - Insufficient Funds)', 'Thu $45 phí thường niên (Từ chối 51 - Không đủ số dư)'),
    hint: L('A debit card with $0 and no overdraft line: the fee cannot be collected, it is tracked off-book and retried, and the card renewal waits.', 'Thẻ ghi nợ có $0 và không có hạn mức thấu chi: không thu được phí, phí được theo dõi ngoại bảng để thu lại sau, và việc gia hạn thẻ bị treo.'),
    route: ['GATE_POS', 'LEDGER_DEBIT', 'OUT_DECLINED'],
    customerCents: 0,
  },
  {
    id: 'fee-annual-waived',
    sub: 'card-fees',
    icon: '⚡',
    variant: 'success',
    label: L('Annual Fee, Premium Cardholder (Waived)', 'Phí thường niên, chủ thẻ hạng cao (Miễn phí)'),
    hint: L('$12,000 spent on the card this year: the $45 annual fee is waived, so no fee income posts and the balance is untouched.', 'Chi tiêu $12,000 qua thẻ trong năm: miễn $45 phí thường niên, nên không ghi nhận thu phí và số dư giữ nguyên.'),
    route: ['GATE_POS', 'LEDGER_DEBIT', 'OUT_APPROVED'],
    customerCents: 60_000,
  },
  {
    id: 'wallet-name-mismatch',
    sub: 'wallet-qr',
    icon: '⛔',
    variant: 'danger',
    label: L('Cash-in MoMo Wallet (Declined - Not Own-name Account)', 'Nạp ví MoMo (Từ chối - Tài khoản không chính chủ)'),
    hint: L('The wallet is linked to someone else’s account: a wallet may only be funded from its holder’s own account, so the top-up is refused.', 'Ví liên kết với tài khoản của người khác: ví chỉ được nạp từ tài khoản chính chủ của chủ ví, nên lệnh nạp bị từ chối.'),
    route: ['GATE_A2A', 'OUT_DECLINED'],
    customerCents: 60_000,
  },
  {
    id: 'bnpl-decline-cic',
    sub: 'bnpl-credit',
    icon: '▲',
    variant: 'danger',
    label: L('Refuse Pay-in-4 (Bad Debt on Credit Bureau - CIC Group 3)', 'Từ chối trả góp (Nợ xấu trên CIC - Nhóm 3)'),
    hint: L('The DTI is fine, but the credit bureau shows a loan in non-performing group 3 at another bank: refused, nothing posts.', 'DTI đạt, nhưng CIC cho thấy khách có khoản vay nợ xấu nhóm 3 tại ngân hàng khác: từ chối, không ghi nhận gì.'),
    route: ['GATE_ECOM', 'BNPL', 'LEDGER_CREDIT', 'OUT_DECLINED'],
  },
  {
    id: 'waterfall-nsf',
    sub: 'debt-waterfall',
    icon: '▲',
    variant: 'danger',
    label: L('Repay $120 (Declined 51 - Debt Becomes Overdue)', 'Trả nợ $120 (Từ chối 51 - Khoản nợ chuyển quá hạn)'),
    hint: L('The account holds $30 on the due date: nothing is collected, the debt turns overdue and a $25 late penalty is added (Dr 1310 / Cr 4510).', 'Tài khoản chỉ có $30 vào ngày đến hạn: không thu được gì, khoản nợ chuyển quá hạn và cộng thêm phạt trễ hạn $25 (Nợ 1310 / Có 4510).'),
    route: ['BNPL', 'LEDGER_DEBIT', 'OUT_DECLINED'],
    customerCents: 3_000,
  },
  {
    id: 'risk-migrate-group5',
    sub: 'credit-risk',
    icon: '⛔',
    variant: 'danger',
    label: L('Migrate Loan at 400 Days Late (Group 5 - Loss)', 'Chuyển nhóm khoản vay trễ 400 ngày (Nhóm 5 - Có khả năng mất vốn)'),
    hint: L('Over 360 days past due: the $1,000 unsecured loan is group 5 and provided at 100% (Dr 5610 / Cr 1290).', 'Quá hạn trên 360 ngày: khoản vay $1,000 không TSĐB vào nhóm 5, trích lập dự phòng 100% (Nợ 5610 / Có 1290).'),
    route: ['BNPL', 'LEDGER_CREDIT', 'OUT_APPROVED'],
  },
  {
    id: 'risk-cure',
    sub: 'credit-risk',
    icon: '▶',
    variant: 'success',
    label: L('Overdue Loan Repaid in Full (Back to Group 1)', 'Khách trả hết nợ quá hạn (Quay về Nhóm 1)'),
    hint: L('The customer clears every overdue amount: the specific provision is released back to profit (Dr 1290 / Cr 5610).', 'Khách trả hết toàn bộ nợ quá hạn: hoàn nhập dự phòng cụ thể vào lợi nhuận (Nợ 1290 / Có 5610).'),
    route: ['BNPL', 'LEDGER_CREDIT', 'OUT_APPROVED'],
  },
  {
    id: 'teller-counterfeit',
    sub: 'teller-vault',
    icon: '⛔',
    variant: 'danger',
    label: L('Deposit $2,000 Cash (Refused - Counterfeit Notes)', 'Nộp $2,000 tiền mặt (Từ chối - Phát hiện tiền giả)'),
    hint: L('The note counter flags 2 suspect notes: the serials are recorded, the notes are held for the counterfeit report, and nothing is credited.', 'Máy đếm tiền phát hiện 2 tờ nghi giả: ghi lại số sê-ri, tạm giữ để lập biên bản tiền giả, và không ghi có cho khách.'),
    route: ['TELLER_CASH', 'OUT_DECLINED'],
  },
  {
    id: 'td-mature-close',
    sub: 'term-deposit',
    icon: '▶',
    variant: 'success',
    label: L('Close $10,000 Term Deposit at Maturity (Full Interest)', 'Tất toán đúng hạn tiết kiệm $10,000 (Hưởng đủ lãi)'),
    hint: L('180 days at 6%, held to maturity: the customer gets the principal and every cent of the accrued interest.', 'Gửi 180 ngày lãi suất 6%, tất toán đúng hạn: khách nhận đủ gốc và toàn bộ tiền lãi đã dự chi.'),
    route: ['SAVINGS_DESK', 'LEDGER_DEBIT', 'OUT_APPROVED'],
  },
  {
    id: 'td-break-pledged',
    sub: 'term-deposit',
    icon: '🔒',
    variant: 'danger',
    label: L('Close Term Deposit (Refused - Pledged as Collateral)', 'Tất toán tiết kiệm (Từ chối - Sổ đang cầm cố)'),
    hint: L('The savings book secures a loan: it cannot be closed until the loan is repaid or the lien is released. Nothing posts.', 'Sổ tiết kiệm đang bảo đảm cho khoản vay: không thể tất toán đến khi trả hết nợ hoặc giải chấp. Không ghi nhận gì.'),
    route: ['SAVINGS_DESK', 'LEDGER_DEBIT', 'OUT_DECLINED'],
  },
  {
    id: 'td-break-id-mismatch',
    sub: 'term-deposit',
    icon: '🪪',
    variant: 'danger',
    label: L('Close Term Deposit (Refused - ID/Signature Mismatch)', 'Tất toán tiết kiệm (Từ chối - Sai giấy tờ/chữ ký)'),
    hint: L('The ID card and the specimen signature do not match the depositor on file: the teller refuses to pay out to protect the real owner.', 'CCCD và chữ ký mẫu không khớp với người gửi tiền trong hồ sơ: giao dịch viên từ chối chi trả để bảo vệ chủ sở hữu thật.'),
    route: ['SAVINGS_DESK', 'LEDGER_DEBIT', 'OUT_DECLINED'],
  },
  {
    id: 'collateral-shortfall',
    sub: 'collateral',
    icon: '⚠️',
    variant: 'danger',
    label: L('Liquidate Collateral (Shortfall - Debt Not Fully Recovered)', 'Xử lý TSĐB (Thiếu hụt - Không thu hồi đủ nợ)'),
    hint: L('Only $3,000 of pledged savings against a $4,500 debt: the waterfall clears the penalty and interest, and $1,500 of principal stays unrecovered.', 'Chỉ có $3,000 tiền gửi cầm cố cho khoản nợ $4,500: thứ tự cấn trừ trả hết phạt và lãi, còn $1,500 nợ gốc chưa thu hồi được.'),
    route: ['COLLATERAL_VAULT', 'SAVINGS_DESK', 'LEDGER_DEBIT', 'OUT_APPROVED'],
  },
];

export const opsActionsFor = (sub: OpsSubProcessId): OpsActionDef[] => OPS_ACTIONS.filter((a) => a.sub === sub);
export const opsSubProcessesIn = (flow: FlowId): (typeof OPS_SUBPROCESSES)[number][] => OPS_SUBPROCESSES.filter((s) => s.flow === flow);
export const opsFlowOf = (a: OpsActionDef): FlowId => opsSubProcess(a.sub).flow;

export const opsActionById = (id: OpsActionId): OpsActionDef => OPS_ACTIONS.find((a) => a.id === id)!;

export interface OpsJournal {
  id: string;
  /** What posted it: a demo action or one of the follow-ups (a vault transfer, a refill, a ticket closed). */
  source: OpsActionId | PresetId | 'vault-transfer' | 'cassette-refill' | 'ticket-refund' | 'ticket-dispensed';
  /** The bank's time: "D3 14:05:30". */
  at: string;
  lines: readonly OpsLine[];
}

export interface ReconTicket {
  id: string;
  amountCents: number;
  openedAt: string;
  status: 'OPEN' | 'REFUNDED' | 'DISPENSED';
}

/** The till has gone over its limit: the transfer is due, and the counter is locked until it is done. */
export interface VaultPrompt {
  tillCents: number;
  surplusCents: number;
}

export interface OpsBook {
  /** Debit-positive per account, in cents: always sums to zero. */
  balances: Record<OpsAccountId, number>;
  /** The latest journals, newest first (at most OPS_JOURNAL_CAP). */
  journal: OpsJournal[];
  /** Journals posted since opening: numbers the next one. */
  posted: number;
  tickets: ReconTicket[];
  /** The low-cassette sensor drill is running. */
  cassetteDrill: boolean;
  /** Savings frozen as collateral, waiting for liquidation or release. */
  collateralLockedCents: number;
  vaultPrompt: VaultPrompt | null;
}

export const OPS_JOURNAL_CAP = 40;

export const openingBook = (): OpsBook => ({ balances: { ...OPS_OPENING }, journal: [], posted: 0, tickets: [], cassetteDrill: false, collateralLockedCents: 0, vaultPrompt: null });

/** What one click did, for the result card. */
export interface OpsOutcome {
  action: OpsJournal['source'];
  status: OpsStatus;
  /** ISO 8583 response code, when the action is a payment. */
  rc?: string;
  message: Localized<string>;
  journal: OpsJournal | null;
  /** The scripted customer's available balance before and after. */
  customer?: { before: number; after: number };
  /** The clearing time of an instant payment, against its SLA. */
  clearing?: { elapsedMs: number; slaMs: number; withinSla: boolean };
  /** A deposit at or over the cash reporting line. */
  ctrRequired?: boolean;
  /** The calculation behind the entry, one line each (the allocation, DTI, the recalculated interest). */
  facts?: readonly Localized<string>[];
}

const dr = (account: OpsAccountId, cents: number): OpsLine => ({ account, dr: cents, cr: 0 });
const cr = (account: OpsAccountId, cents: number): OpsLine => ({ account, dr: 0, cr: cents });

export const opsJournalBalanced = (lines: readonly OpsLine[]): boolean => lines.reduce((s, l) => s + l.dr - l.cr, 0) === 0;

function post(book: OpsBook, source: OpsJournal['source'], at: string, lines: readonly OpsLine[]): { book: OpsBook; journal: OpsJournal } {
  if (!opsJournalBalanced(lines)) throw new Error(`Unbalanced retail ops journal: ${source}`);
  const balances = { ...book.balances };
  for (const l of lines) balances[l.account] += l.dr - l.cr;
  const journal: OpsJournal = { id: `OPS-${String(book.posted + 1).padStart(6, '0')}`, source, at, lines };
  return { journal, book: { ...book, balances, journal: [journal, ...book.journal].slice(0, OPS_JOURNAL_CAP), posted: book.posted + 1 } };
}

/** The share of capacity left in the ATM cassettes, and whether it should alert. The sensor drill reports its own level. */
export function cassetteStatus(book: OpsBook): { pct: number; low: boolean; drill: boolean } {
  const actual = Math.round((book.balances.CASH_ATM / OPS_LIMITS.cassetteCapacityCents) * 100);
  const pct = book.cassetteDrill ? Math.min(actual, OPS_LIMITS.cassetteDrillPct) : actual;
  return { pct, low: pct < OPS_LIMITS.cassetteLowPct, drill: book.cassetteDrill };
}

/** The balance a statement prints: debit-natural for assets, credit-natural for the rest. */
export const opsNatural = (id: OpsAccountId, debitPositive: number): number => (opsAccount(id).side === 'asset' || opsAccount(id).side === 'expense' ? debitPositive : 0 - debitPositive);

/** The trial balance over all accounts, and whether suspense and the journal agree. */
export function opsTrial(book: OpsBook): { debits: number; credits: number; balanced: boolean; suspenseOpenCents: number } {
  const debits = OPS_ACCOUNT_IDS.reduce((s, id) => s + Math.max(0, book.balances[id]), 0);
  const credits = OPS_ACCOUNT_IDS.reduce((s, id) => s + Math.max(0, -book.balances[id]), 0);
  return { debits, credits, balanced: debits === credits, suspenseOpenCents: opsNatural('ATM_SUSPENSE', book.balances.ATM_SUSPENSE) };
}

const blocked = (action: OpsActionId, book: OpsBook, message: Localized<string>, rc?: string): { book: OpsBook; outcome: OpsOutcome } => ({
  book,
  outcome: { action, status: 'BLOCKED', message, journal: null, ...(rc ? { rc } : {}) },
});

const COUNTER_LOCKED = L('The counter is locked: move the till’s surplus to the vault first.', 'Quầy đang khóa: hãy chuyển phần dư của ngăn kéo về kho quỹ trước.');

const money = (cents: number): string => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The debt in the waterfall demonstrations. */
export const DEMO_DEBT: DebtBuckets = { penaltyCents: 2_500, interestCents: 4_000, principalCents: 30_000 };
const COLLATERAL_CENTS = 500_000;
/** The defaulted overdraft the collateral pays off. */
const DEFAULTED_DEBT: DebtBuckets = { penaltyCents: 20_000, interestCents: 30_000, principalCents: 400_000 };

/** The credits a waterfall allocation posts, one per bucket that received money. */
const waterfallCredits = (w: WaterfallResult): OpsLine[] => [...(w.toPenalty > 0 ? [cr('NSF_INCOME', w.toPenalty)] : []), ...(w.toInterest > 0 ? [cr('INTEREST_INCOME', w.toInterest)] : []), ...(w.toPrincipal > 0 ? [cr('LOAN', w.toPrincipal)] : [])];

function repayDebt(book: OpsBook, def: OpsActionDef, at: string, paymentCents: number): { book: OpsBook; outcome: OpsOutcome } {
  const w = allocateWaterfall(paymentCents, DEMO_DEBT);
  const before = def.customerCents ?? 0;
  const posted = post(book, def.id, at, [dr('CASA', paymentCents), ...waterfallCredits(w)]);
  const owed = w.remaining.penaltyCents + w.remaining.interestCents + w.remaining.principalCents;
  return {
    book: posted.book,
    outcome: {
      action: def.id,
      status: 'APPROVED',
      rc: '00',
      message: L(`The ${money(paymentCents)} is allocated in the fixed order, and ${money(owed)} is still owed.`, `${money(paymentCents)} được phân bổ theo thứ tự cố định, còn nợ ${money(owed)}.`),
      journal: posted.journal,
      customer: { before, after: before - paymentCents },
      facts: [L(`Penalty ${money(w.toPenalty)}, interest ${money(w.toInterest)}, principal ${money(w.toPrincipal)}.`, `Phạt ${money(w.toPenalty)}, lãi ${money(w.toInterest)}, gốc ${money(w.toPrincipal)}.`)],
    },
  };
}

/** A customer-paid debit that needs no special rule. */
function plainPayment(book: OpsBook, def: OpsActionDef, at: string, cents: number, credit: OpsAccountId, message: Localized<string>): { book: OpsBook; outcome: OpsOutcome } {
  const before = def.customerCents ?? 0;
  const posted = post(book, def.id, at, [dr('CASA', cents), cr(credit, cents)]);
  return { book: posted.book, outcome: { action: def.id, status: 'APPROVED', rc: '00', message, journal: posted.journal, customer: { before, after: before - cents } } };
}

function tillDeposit(book: OpsBook, def: OpsActionDef, at: string, cents: number, message: Localized<string>): { book: OpsBook; outcome: OpsOutcome } {
  if (book.vaultPrompt) return blocked(def.id, book, COUNTER_LOCKED);
  const posted = post(book, def.id, at, [dr('CASH_TILL', cents), cr('CASA', cents)]);
  const till = posted.book.balances.CASH_TILL;
  const over = till > OPS_LIMITS.tillLimitCents;
  const next: OpsBook = over ? { ...posted.book, vaultPrompt: { tillCents: till, surplusCents: till - OPS_LIMITS.tillFloatCents } } : posted.book;
  return {
    book: next,
    outcome: {
      action: def.id,
      status: over ? 'ALERT' : 'APPROVED',
      rc: '00',
      message: over ? L('The deposit is booked, but the till is over its $50,000 limit: a vault transfer is now mandatory.', 'Khoản nộp đã ghi nhận, nhưng ngăn kéo đã vượt hạn mức $50,000: bắt buộc phải chuyển kho quỹ.') : message,
      journal: posted.journal,
      ...(cents >= CTR_THRESHOLD_CENTS ? { ctrRequired: true } : {}),
    },
  };
}

/** Runs one demo action on the book: the decision, the journal and what the desk does next. Pure. */
export function runOpsAction(book: OpsBook, id: OpsActionId, at: string): { book: OpsBook; outcome: OpsOutcome } {
  const def = opsActionById(id);
  const available = def.customerCents ?? 0;
  switch (id) {
    case 'bill-electric-85':
      return plainPayment(book, def, at, 8_500, 'INTERBANK', L('Bill paid: the customer is debited and the money goes to the biller’s bank.', 'Đã thanh toán hóa đơn: khách bị ghi nợ và tiền chuyển sang ngân hàng của nhà cung cấp.'));
    case 'wallet-cashin-100':
      return plainPayment(book, def, at, 10_000, 'WALLET_SETTLEMENT', L('Wallet topped up: the bank now owes the wallet provider $100 until settlement.', 'Đã nạp ví: ngân hàng phải trả đơn vị ví $100 đến khi quyết toán.'));
    case 'atm-withdraw-100': {
      const cash = 10_000;
      if (book.balances.CASH_ATM < cash) return blocked(id, book, L('The cassette cannot cover $100: run the CIT refill. An ATM never pays out part of a withdrawal.', 'Hộp tiền không đủ $100: hãy tiếp quỹ CIT. ATM không bao giờ chi một phần số tiền rút.'), '91');
      const total = cash + OPS_LIMITS.atmFeeCents + OPS_LIMITS.napasFeeCents;
      const posted = post(book, id, at, [dr('CASA', total), cr('CASH_ATM', cash), cr('FEE_INCOME', OPS_LIMITS.atmFeeCents), cr('NAPAS_FEE', OPS_LIMITS.napasFeeCents)]);
      return { book: posted.book, outcome: { action: id, status: 'APPROVED', rc: '00', message: L('Cash paid: the bank keeps $1.10 and owes the domestic switch (NAPAS) $0.55 until tonight’s settlement.', 'Đã chi tiền: ngân hàng giữ $1.10 và phải trả NAPAS $0.55 đến khi quyết toán đêm nay.'), journal: posted.journal, customer: { before: available, after: available - total } } };
    }
    case 'atm-jam-200': {
      const jam = 20_000;
      const posted = post(book, id, at, [dr('CASA', jam), cr('ATM_SUSPENSE', jam)]);
      const ticket: ReconTicket = { id: `RECON-${posted.journal.id.slice(4)}`, amountCents: jam, openedAt: at, status: 'OPEN' };
      return { book: { ...posted.book, tickets: [ticket, ...posted.book.tickets] }, outcome: { action: id, status: 'HELD', message: L('Dispenser fault: $200 is parked in TK 2930 and an EOD reconciliation ticket is open.', 'Lỗi nhả tiền: $200 được treo ở TK 2930 và đã mở phiếu đối soát cuối ngày.'), journal: posted.journal, customer: { before: available, after: available - jam } } };
    }
    case 'cassette-low':
      return { book: { ...book, cassetteDrill: true }, outcome: { action: id, status: 'ALERT', message: L('Sensor drill: the cassette reports under 15%, and the ATM shows a warning until the CIT refill. No money moved.', 'Diễn tập cảm biến: hộp tiền báo dưới 15%, ATM hiển thị cảnh báo đến khi tiếp quỹ CIT. Tiền không dịch chuyển.'), journal: null } };
    case 'cassette-refill': {
      const refill = refillCassette(book, at);
      return {
        book: refill.book,
        outcome: {
          action: id,
          status: 'APPROVED',
          rc: '00',
          message: refill.journal
            ? L('CIT refill done: the cassettes are back to capacity from the vault, and the low-cash alert has cleared.', 'Đã tiếp quỹ CIT: hộp tiền được nạp đầy lại từ kho quỹ, và cảnh báo sắp hết tiền đã được gỡ.')
            : L('The cassettes are already full: nothing to move, and no alert is open.', 'Hộp tiền đã đầy: không cần chuyển tiền, và không có cảnh báo nào.'),
          journal: refill.journal,
        },
      };
    }
    case 'teller-deposit-5000':
      return tillDeposit(book, def, at, 500_000, L('Cash counted and credited to the customer.', 'Đã đếm tiền và ghi có cho khách.'));
    case 'teller-exceed-limit':
      return tillDeposit(book, def, at, Math.max(1, OPS_LIMITS.tillLimitCents - book.balances.CASH_TILL + 250_000), L('Cash counted and credited to the customer.', 'Đã đếm tiền và ghi có cho khách.'));
    case 'fee-annual-45': {
      const fee = 4_500;
      const covered = Math.min(available, fee);
      const shortfall = fee - covered;
      const lines = [...(covered > 0 ? [dr('CASA', covered)] : []), ...(shortfall > 0 ? [dr('OVERDRAFT', shortfall)] : []), cr('FEE_INCOME', fee)];
      const posted = post(book, id, at, lines);
      return { book: posted.book, outcome: { action: id, status: 'APPROVED', message: L('Fee posted: the balance covered $20, and the other $25 became an overdraft, so the statement shows -$25.', 'Đã ghi nhận phí: số dư trả được $20, $25 còn lại thành thấu chi nên sao kê hiển thị -$25.'), journal: posted.journal, customer: { before: available, after: available - fee } } };
    }
    case 'fee-card-10':
      return plainPayment(book, def, at, 1_000, 'FEE_INCOME', L('Fee posted to card fee income.', 'Đã ghi nhận phí vào thu phí thẻ.'));
    case 'autopay-loan-250':
      return plainPayment(book, def, at, 25_000, 'LOAN', L('Instalment collected under the customer’s mandate: the loan principal falls.', 'Đã thu kỳ trả góp theo ủy quyền của khách: nợ gốc giảm.'));
    case 'autopay-nsf-250': {
      const fee = OPS_LIMITS.nsfFeeCents;
      const posted = post(book, id, at, [dr('CASA', fee), cr('NSF_INCOME', fee)]);
      return { book: posted.book, outcome: { action: id, status: 'DECLINED', rc: '51', message: L('Insufficient funds: the $250 instalment stays unpaid, starts to age, and the $15 NSF fee is charged.', 'Không đủ số dư: kỳ trả góp $250 chưa thu được, bắt đầu quá hạn, và thu phí NSF $15.'), journal: posted.journal, customer: { before: available, after: available - fee } } };
    }
    case 'bnpl-approve-400': {
      const dti = assessDti(300_000, 60_000, 10_000);
      const posted = post(book, id, at, [dr('CASA', 10_000), dr('LOAN', 30_000), cr('INTERBANK', 40_000)]);
      return { book: posted.book, outcome: { action: id, status: 'APPROVED', rc: '00', message: L('Approved: the shop is paid $400 now, the customer pays $100 today, and the bank is owed the other $300.', 'Đã duyệt: cửa hàng nhận $400 ngay, khách trả $100 hôm nay, ngân hàng được nợ $300 còn lại.'), journal: posted.journal, customer: { before: available, after: available - 10_000 }, facts: [L(`DTI ${dti.dtiPct}%: $700 of monthly debt on $3,000 of income.`, `DTI ${dti.dtiPct}%: $700 nợ mỗi tháng trên $3,000 thu nhập.`), L(`Credit score ${creditScore(720, 0, dti.dtiPct)}, no late payments.`, `Điểm tín dụng ${creditScore(720, 0, dti.dtiPct)}, không có trễ hạn.`)] } };
    }
    case 'bnpl-decline-dti': {
      const dti = assessDti(200_000, 72_000, 24_000);
      return { book, outcome: { action: id, status: 'DECLINED', rc: '05', message: L(`Refused: debt service would be over the ${DTI_LIMIT_PCT}% limit, so no credit is extended and nothing posts.`, `Từ chối: nghĩa vụ trả nợ vượt ngưỡng ${DTI_LIMIT_PCT}%, nên không cấp tín dụng và không ghi nhận gì.`), journal: null, facts: [L(`DTI ${dti.dtiPct}%: $960 of monthly debt on $2,000 of income.`, `DTI ${dti.dtiPct}%: $960 nợ mỗi tháng trên $2,000 thu nhập.`), L(`Credit score falls to ${creditScore(640, 0, dti.dtiPct)}.`, `Điểm tín dụng giảm còn ${creditScore(640, 0, dti.dtiPct)}.`)] } };
    }
    case 'card-late-fee': {
      const posted = post(book, id, at, [dr('OVERDRAFT', 4_200), cr('NSF_INCOME', 2_500), cr('INTEREST_INCOME', 1_700)]);
      return { book: posted.book, outcome: { action: id, status: 'APPROVED', message: L('The missed payment adds a $25 late fee and $17 of overdue interest to what the cardholder owes.', 'Kỳ trả trễ cộng thêm $25 phí phạt và $17 lãi quá hạn vào khoản chủ thẻ phải trả.'), journal: posted.journal } };
    }
    case 'waterfall-120':
      return repayDebt(book, def, at, 12_000);
    case 'waterfall-50':
      return repayDebt(book, def, at, 5_000);
    case 'risk-migrate-95dpd': {
      const group = debtGroup(95);
      const provision = specificProvision(100_000, 0, group);
      const posted = post(book, id, at, [dr('PROVISION_EXPENSE', provision), cr('ALLOWANCE', provision)]);
      return { book: posted.book, outcome: { action: id, status: 'ALERT', message: L(`At 95 days past due the loan moves from group 1 to non-performing group ${group}, and ${PROVISION_PCT[group]}% is provided.`, `Quá hạn 95 ngày, khoản vay chuyển từ nhóm 1 sang nợ xấu nhóm ${group}, trích lập ${PROVISION_PCT[group]}%.`), journal: posted.journal, facts: [L(`Credit score falls from 720 to ${creditScore(720, 95, 30)}.`, `Điểm tín dụng giảm từ 720 xuống ${creditScore(720, 95, 30)}.`), L('Any other loans of this customer follow it to the same group.', 'Các khoản vay khác của khách này cũng chuyển theo cùng nhóm.')] } };
    }
    case 'td-break-10k': {
      const principal = 1_000_000;
      const c = closeTermDepositEarly(principal, 6, 180);
      const posted = post(book, id, at, [dr('TERM_DEPOSIT', principal), dr('ACCRUED_INTEREST', c.accruedCents), cr('CASA', principal + c.paidCents), cr('INTEREST_EXPENSE', c.forfeitedCents)]);
      return { book: posted.book, outcome: { action: id, status: 'APPROVED', rc: '00', message: L(`Closed early: the customer gets the $10,000 and interest at the ${DEMAND_RATE_PCT}% demand rate.`, `Tất toán sớm: khách nhận $10,000 và lãi theo mức không kỳ hạn ${DEMAND_RATE_PCT}%.`), journal: posted.journal, facts: [L(`Accrued at 6% for 180 days: ${money(c.accruedCents)}. Paid at ${DEMAND_RATE_PCT}%: ${money(c.paidCents)}.`, `Đã dự chi ở mức 6% trong 180 ngày: ${money(c.accruedCents)}. Trả ở mức ${DEMAND_RATE_PCT}%: ${money(c.paidCents)}.`), L(`The early withdrawal penalty is the ${money(c.forfeitedCents)} of interest given up.`, `Phạt rút trước hạn là ${money(c.forfeitedCents)} tiền lãi bị mất.`)] } };
    }
    case 'collateral-lock': {
      if (book.collateralLockedCents > 0) return blocked(id, book, L('This collateral is already locked: liquidate it first.', 'TSĐB này đã bị phong tỏa: hãy xử lý trước.'));
      const posted = post(book, id, at, [dr('TERM_DEPOSIT', COLLATERAL_CENTS), cr('TD_PLEDGED', COLLATERAL_CENTS)]);
      return { book: { ...posted.book, collateralLockedCents: COLLATERAL_CENTS }, outcome: { action: id, status: 'HELD', message: L('The overdraft has defaulted, so $5,000 of pledged savings is frozen. It stays the customer’s money until it is liquidated.', 'Thấu chi đã vỡ nợ nên $5,000 tiền gửi cầm cố bị phong tỏa. Tiền vẫn là của khách đến khi được xử lý.'), journal: posted.journal } };
    }
    case 'collateral-release': {
      // A pledge frozen on default is lifted once the debt is cured; with none frozen, the demo shows the whole life of a performing
      // loan's pledge: taken at drawdown, released on the final repayment.
      const locked = book.collateralLockedCents;
      const lines = locked > 0 ? [dr('TD_PLEDGED', locked), cr('TERM_DEPOSIT', locked)] : [dr('TERM_DEPOSIT', COLLATERAL_CENTS), cr('TD_PLEDGED', COLLATERAL_CENTS), dr('TD_PLEDGED', COLLATERAL_CENTS), cr('TERM_DEPOSIT', COLLATERAL_CENTS)];
      const posted = post(book, id, at, lines);
      return {
        book: { ...posted.book, collateralLockedCents: 0 },
        outcome: {
          action: id,
          status: 'APPROVED',
          rc: '00',
          message: L('The loan is repaid in full, so the $5,000 pledge is released: the savings book is back in the customer’s free use.', 'Khoản vay đã trả hết nên $5,000 TSĐB được giải chấp: sổ tiết kiệm trở lại quyền sử dụng tự do của khách.'),
          journal: posted.journal,
        },
      };
    }
    case 'collateral-liquidate': {
      if (book.collateralLockedCents <= 0) return blocked(id, book, L('Nothing is locked yet: lock the collateral first.', 'Chưa có gì bị phong tỏa: hãy phong tỏa TSĐB trước.'));
      const w = allocateWaterfall(book.collateralLockedCents, DEFAULTED_DEBT);
      const release = Math.min(specificProvision(DEFAULTED_DEBT.principalCents, 0, 3), Math.max(0, opsNatural('ALLOWANCE', book.balances.ALLOWANCE) * -1));
      const posted = post(book, id, at, [dr('TD_PLEDGED', book.collateralLockedCents), ...waterfallCredits(w), ...(w.surplus > 0 ? [cr('CASA', w.surplus)] : []), ...(release > 0 ? [dr('ALLOWANCE', release), cr('PROVISION_EXPENSE', release)] : [])]);
      return { book: { ...posted.book, collateralLockedCents: 0 }, outcome: { action: id, status: 'APPROVED', rc: '00', message: L('The collateral clears the bad debt in waterfall order, and what is left goes back to the customer.', 'TSĐB tất toán nợ xấu theo thứ tự cấn trừ, phần dư trả lại khách.'), journal: posted.journal, facts: [L(`Penalty ${money(w.toPenalty)}, interest ${money(w.toInterest)}, principal ${money(w.toPrincipal)}, returned ${money(w.surplus)}.`, `Phạt ${money(w.toPenalty)}, lãi ${money(w.toInterest)}, gốc ${money(w.toPrincipal)}, trả lại ${money(w.surplus)}.`), ...(release > 0 ? [L(`The ${money(release)} provision is released back to profit.`, `Hoàn nhập dự phòng ${money(release)} vào lợi nhuận.`)] : [])] } };
    }
    case 'bill-nsf-51': {
      const fee = OPS_LIMITS.nsfFeeCents;
      const posted = post(book, id, at, [dr('CASA', fee), cr('NSF_INCOME', fee)]);
      return { book: posted.book, outcome: { action: id, status: 'DECLINED', rc: '51', message: L('Insufficient funds: the $85 bill is returned unpaid to the biller, and the $15 NSF fee is charged.', 'Không đủ số dư: hóa đơn $85 bị trả lại cho nhà cung cấp, và thu phí NSF $15.'), journal: posted.journal, customer: { before: available, after: available - fee }, facts: [L('The biller is told the payment failed and will retry or suspend the service.', 'Nhà cung cấp được báo thanh toán thất bại và sẽ thu lại hoặc tạm ngừng dịch vụ.')] } };
    }
    case 'bill-timeout-68':
      return { book, outcome: { action: id, status: 'DECLINED', rc: '68', message: L('No answer from the biller in time (RC 68): the hold is reversed automatically, nothing posts, and the customer may pay again.', 'Nhà cung cấp không phản hồi kịp (RC 68): khoản tạm giữ được tự động đảo, không ghi nhận gì, và khách có thể thanh toán lại.'), journal: null, customer: { before: available, after: available }, facts: [L('An unanswered request is never booked: the bank checks the status before anyone retries, so the bill is never paid twice.', 'Yêu cầu không có phản hồi thì không hạch toán: ngân hàng tra soát trạng thái trước khi thử lại, nên hóa đơn không bao giờ bị trả hai lần.')] } };
    case 'fee-collect-fail':
      return { book, outcome: { action: id, status: 'DECLINED', rc: '51', message: L('The fee cannot be collected: no balance and no overdraft line. It is tracked off the books and retried, and the card renewal waits.', 'Không thu được phí: không có số dư và không có hạn mức thấu chi. Phí được theo dõi ngoại bảng để thu lại, và việc gia hạn thẻ bị treo.'), journal: null, customer: { before: available, after: available }, facts: [L('A debit card may not be pushed below zero for a fee without an overdraft agreement.', 'Không được trừ phí làm thẻ ghi nợ âm tiền nếu không có thỏa thuận thấu chi.')] } };
    case 'fee-annual-waived':
      return { book, outcome: { action: id, status: 'APPROVED', rc: '00', message: L('Fee waived for the premium spending tier: no fee is charged, so nothing posts to fee income and the balance is untouched.', 'Miễn phí cho hạng chi tiêu cao: không thu phí, nên không ghi nhận thu phí và số dư giữ nguyên.'), journal: null, customer: { before: available, after: available }, facts: [L('A waived fee was never earned: booking it as income and writing it off would overstate both revenue and expenses.', 'Phí được miễn chưa từng phát sinh thu nhập: ghi thu rồi xóa sẽ thổi phồng cả doanh thu lẫn chi phí.')] } };
    case 'wallet-name-mismatch':
      return { book, outcome: { action: id, status: 'DECLINED', rc: '57', message: L('Refused: the wallet holder and the account holder are different people, and a wallet may only be funded from its holder’s own account.', 'Từ chối: chủ ví và chủ tài khoản là hai người khác nhau, mà ví chỉ được nạp từ tài khoản chính chủ.'), journal: null, customer: { before: available, after: available } } };
    case 'bnpl-decline-cic': {
      const dti = assessDti(300_000, 60_000, 10_000);
      return { book, outcome: { action: id, status: 'DECLINED', rc: '05', message: L('Refused: the credit bureau (CIC) shows a non-performing loan elsewhere, so no new credit is extended whatever the DTI.', 'Từ chối: CIC cho thấy khách đang có nợ xấu ở nơi khác, nên không cấp tín dụng mới dù DTI đạt.'), journal: null, facts: [L(`DTI ${dti.dtiPct}%, under the ${DTI_LIMIT_PCT}% limit.`, `DTI ${dti.dtiPct}%, dưới ngưỡng ${DTI_LIMIT_PCT}%.`), L(`Credit score ${creditScore(720, 120, dti.dtiPct)} with a group 3 loan on the bureau report.`, `Điểm tín dụng ${creditScore(720, 120, dti.dtiPct)} với khoản vay nhóm 3 trên báo cáo CIC.`)] } };
    }
    case 'waterfall-nsf': {
      const penalty = DEMO_DEBT.penaltyCents;
      const posted = post(book, id, at, [dr('OVERDRAFT', penalty), cr('NSF_INCOME', penalty)]);
      return { book: posted.book, outcome: { action: id, status: 'DECLINED', rc: '51', message: L('Nothing collected on the due date: the instalment turns overdue and a $25 late penalty is added to the debt.', 'Không thu được gì vào ngày đến hạn: kỳ trả nợ chuyển quá hạn và cộng thêm phạt trễ hạn $25 vào khoản nợ.'), journal: posted.journal, customer: { before: available, after: available }, facts: [L('From 10 days past due the loan moves to group 2 (special mention); from 91 days it is non-performing.', 'Quá hạn từ 10 ngày khoản vay chuyển nhóm 2 (cần chú ý); từ 91 ngày trở thành nợ xấu.')] } };
    }
    case 'risk-migrate-group5': {
      const group = debtGroup(400);
      const provision = specificProvision(100_000, 0, group);
      const posted = post(book, id, at, [dr('PROVISION_EXPENSE', provision), cr('ALLOWANCE', provision)]);
      return { book: posted.book, outcome: { action: id, status: 'ALERT', message: L(`At 400 days past due the loan is group ${group} (loss), and ${PROVISION_PCT[group]}% is provided.`, `Quá hạn 400 ngày, khoản vay vào nhóm ${group} (có khả năng mất vốn), trích lập ${PROVISION_PCT[group]}%.`), journal: posted.journal, facts: [L('A fully provided loan may later be written off against the allowance, but the bank keeps chasing the debt off the books.', 'Khoản vay đã trích lập đủ có thể được xử lý bằng dự phòng, nhưng ngân hàng vẫn tiếp tục theo dõi thu hồi ngoại bảng.')] } };
    }
    case 'risk-cure': {
      const provision = specificProvision(100_000, 0, 3);
      const posted = post(book, id, at, [dr('ALLOWANCE', provision), cr('PROVISION_EXPENSE', provision)]);
      return { book: posted.book, outcome: { action: id, status: 'APPROVED', rc: '00', message: L('Every overdue amount is repaid: the loan goes back to group 1 and its specific provision is released to profit.', 'Toàn bộ nợ quá hạn đã được trả: khoản vay quay về nhóm 1 và dự phòng cụ thể được hoàn nhập vào lợi nhuận.'), journal: posted.journal, facts: [L(`${money(provision)} released (the 20% held for group 3).`, `Hoàn nhập ${money(provision)} (mức 20% đã trích cho nhóm 3).`)] } };
    }
    case 'teller-counterfeit':
      if (book.vaultPrompt) return blocked(id, book, COUNTER_LOCKED);
      return { book, outcome: { action: id, status: 'DECLINED', message: L('Two suspect notes: the serials are recorded, the notes are held for the counterfeit report, and nothing is credited.', 'Hai tờ nghi giả: ghi lại số sê-ri, tạm giữ để lập biên bản tiền giả, và không ghi có cho khách.'), journal: null, facts: [L('Suspect notes are never handed back: they go to the central bank for assessment.', 'Tiền nghi giả không được trả lại khách: chuyển cho Ngân hàng Nhà nước giám định.')] } };
    case 'td-mature-close': {
      const principal = 1_000_000;
      const c = closeTermDepositEarly(principal, 6, 180);
      const posted = post(book, id, at, [dr('TERM_DEPOSIT', principal), dr('ACCRUED_INTEREST', c.accruedCents), cr('CASA', principal + c.accruedCents)]);
      return { book: posted.book, outcome: { action: id, status: 'APPROVED', rc: '00', message: L('Closed at maturity: the customer gets the $10,000 and all the interest accrued at 6%.', 'Tất toán đúng hạn: khách nhận $10,000 và toàn bộ lãi đã dự chi ở mức 6%.'), journal: posted.journal, facts: [L(`Accrued interest paid in full: ${money(c.accruedCents)}. No penalty.`, `Trả đủ lãi đã dự chi: ${money(c.accruedCents)}. Không bị phạt.`)] } };
    }
    case 'td-break-pledged':
      return { book, outcome: { action: id, status: 'DECLINED', rc: '62', message: L('Refused: the savings book is pledged for a loan, so it cannot be closed until the loan is repaid or the lien is released.', 'Từ chối: sổ tiết kiệm đang cầm cố cho khoản vay, nên không thể tất toán đến khi trả hết nợ hoặc giải chấp.'), journal: null } };
    case 'td-break-id-mismatch':
      return { book, outcome: { action: id, status: 'DECLINED', message: L('Refused: the ID and signature do not match the depositor on file, so nothing is paid out.', 'Từ chối: giấy tờ tùy thân và chữ ký không khớp với người gửi trong hồ sơ, nên không chi trả.'), journal: null, facts: [L('Only the depositor, or someone holding a notarised power of attorney, may close a savings book.', 'Chỉ chủ sổ, hoặc người được ủy quyền có công chứng, mới được tất toán sổ tiết kiệm.')] } };
    case 'collateral-shortfall': {
      const pledged = 300_000;
      const w = allocateWaterfall(pledged, DEFAULTED_DEBT);
      const posted = post(book, id, at, [dr('TERM_DEPOSIT', pledged), ...waterfallCredits(w)]);
      const left = w.remaining.penaltyCents + w.remaining.interestCents + w.remaining.principalCents;
      return { book: posted.book, outcome: { action: id, status: 'ALERT', message: L(`The collateral is not enough: ${money(pledged)} is applied in waterfall order, and ${money(left)} of the debt is still unrecovered.`, `TSĐB không đủ: ${money(pledged)} được cấn trừ theo thứ tự, còn ${money(left)} nợ chưa thu hồi được.`), journal: posted.journal, facts: [L(`Penalty ${money(w.toPenalty)}, interest ${money(w.toInterest)}, principal ${money(w.toPrincipal)}.`, `Phạt ${money(w.toPenalty)}, lãi ${money(w.toInterest)}, gốc ${money(w.toPrincipal)}.`), L('The shortfall stays a bad debt, covered by the provision already made.', 'Phần thiếu hụt vẫn là nợ xấu, được bù đắp bằng dự phòng đã trích.')] } };
    }
  }
}

/** The mandatory till-to-vault transfer: everything above the float goes to the vault, and the counter unlocks. */
export function transferToVault(book: OpsBook, at: string): { book: OpsBook; journal: OpsJournal | null } {
  const surplus = book.balances.CASH_TILL - OPS_LIMITS.tillFloatCents;
  if (!book.vaultPrompt || surplus <= 0) return { book: { ...book, vaultPrompt: null }, journal: null };
  const posted = post(book, 'vault-transfer', at, [dr('CASH_VAULT', surplus), cr('CASH_TILL', surplus)]);
  return { book: { ...posted.book, vaultPrompt: null }, journal: posted.journal };
}

/** The CIT refill: tops the cassettes up from the vault (as far as the vault can) and ends the sensor drill. */
export function refillCassette(book: OpsBook, at: string): { book: OpsBook; journal: OpsJournal | null } {
  const wanted = Math.max(0, OPS_LIMITS.cassetteCapacityCents - book.balances.CASH_ATM);
  const moved = Math.min(wanted, Math.max(0, book.balances.CASH_VAULT));
  if (moved <= 0) return { book: { ...book, cassetteDrill: false }, journal: null };
  const posted = post(book, 'cassette-refill', at, [dr('CASH_ATM', moved), cr('CASH_VAULT', moved)]);
  return { book: { ...posted.book, cassetteDrill: false }, journal: posted.journal };
}

/** Closes a jam's ticket on the cash count: the notes stayed in the machine (refund the customer), or the customer took them (they leave the cassette). */
export function resolveTicket(book: OpsBook, ticketId: string, finding: 'REFUNDED' | 'DISPENSED', at: string): { book: OpsBook; journal: OpsJournal | null } {
  const ticket = book.tickets.find((t) => t.id === ticketId);
  if (!ticket || ticket.status !== 'OPEN') return { book, journal: null };
  const lines = finding === 'REFUNDED' ? [dr('ATM_SUSPENSE', ticket.amountCents), cr('CASA', ticket.amountCents)] : [dr('ATM_SUSPENSE', ticket.amountCents), cr('CASH_ATM', ticket.amountCents)];
  const posted = post(book, finding === 'REFUNDED' ? 'ticket-refund' : 'ticket-dispensed', at, lines);
  return { book: { ...posted.book, tickets: posted.book.tickets.map((t) => (t.id === ticketId ? { ...t, status: finding } : t)) }, journal: posted.journal };
}

interface PresetRetail {
  cents: number;
  /** Money in (credit the customer) or out (debit the customer) when the payment goes through, against this account. */
  to?: { dir: 'in' | 'out'; account: OpsAccountId };
  rc?: string;
  yes: Localized<string>;
  no: Localized<string>;
}

const REFUSED = L('The bank refused this payment before any money moved, so the retail book has nothing to post.', 'Ngân hàng đã từ chối giao dịch trước khi tiền dịch chuyển nên sổ bán lẻ không có gì để ghi.');

/** What each core preset means to the retail book: the same payment, in plain words and on this book's accounts. */
const PRESET_RETAIL: Readonly<Record<Exclude<PresetId, 'eod'>, PresetRetail>> = {
  'pos-20': { cents: 2_000, rc: '00', to: { dir: 'out', account: 'INTERBANK' }, yes: L('A $20 card purchase: the customer pays and the money goes to the shop’s bank.', 'Mua hàng $20 bằng thẻ: khách trả tiền và tiền chuyển sang ngân hàng của cửa hàng.'), no: REFUSED },
  'pos-500': { cents: 50_000, rc: '51', yes: L('A $500 card purchase went through.', 'Giao dịch mua $500 bằng thẻ đã thành công.'), no: L('The account holds only $120, so the $500 purchase is declined with RC 51. No money moves.', 'Tài khoản chỉ có $120 nên giao dịch $500 bị từ chối với RC 51. Tiền không dịch chuyển.') },
  'token-45': { cents: 4_500, rc: '00', to: { dir: 'out', account: 'INTERBANK' }, yes: L('A $45 online payment with a stand-in card number: to the customer it is an ordinary debit.', 'Thanh toán trực tuyến $45 bằng số thẻ thay thế: với khách đây là khoản ghi nợ bình thường.'), no: REFUSED },
  'otp-250': { cents: 25_000, rc: '00', to: { dir: 'out', account: 'INTERBANK' }, yes: L('A $250 online payment, confirmed with a texted code, then debited.', 'Thanh toán trực tuyến $250, xác nhận bằng mã nhắn tin, rồi ghi nợ.'), no: REFUSED },
  'cdm-200': { cents: 20_000, rc: '00', to: { dir: 'in', account: 'CASH_ATM' }, yes: L('$200 in notes went into the machine, so the cash rises and the customer is credited.', '$200 tiền giấy vào máy nên tiền mặt tăng và khách được ghi có.'), no: REFUSED },
  'ekyc-open': { cents: 5_000, to: { dir: 'in', account: 'INTERBANK' }, yes: L('A new account opens, and its first $50 arrives from another bank.', 'Tài khoản mới được mở, và $50 đầu tiên đến từ ngân hàng khác.'), no: REFUSED },
  'ekyc-deepfake': { cents: 5_000, yes: L('The account opened.', 'Tài khoản đã được mở.'), no: L('The selfie is not a live face, so no account opens and no money moves.', 'Ảnh selfie không phải người thật nên không mở tài khoản và tiền không dịch chuyển.') },
  'teller-12k': { cents: 1_200_000, to: { dir: 'out', account: 'CASH_VAULT' }, yes: L('A $12,000 cash withdrawal, paid from the vault under dual control. It is over the reporting line, so a cash report is filed.', 'Rút $12,000 tiền mặt, chi từ kho quỹ theo kiểm soát kép. Số tiền vượt ngưỡng báo cáo nên lập báo cáo tiền mặt.'), no: REFUSED },
  'teller-smurf': { cents: 930_000, to: { dir: 'in', account: 'CASH_TILL' }, yes: L('A $9,300 cash deposit goes into the till and credits the customer.', 'Khoản nộp $9,300 tiền mặt vào ngăn kéo và ghi có cho khách.'), no: L('The third deposit just under $10,000 this week looks like structuring, so it is held for an analyst before it reaches the retail book.', 'Lần nộp thứ ba ngay dưới $10,000 trong tuần có dấu hiệu chia nhỏ nên bị giữ cho chuyên viên trước khi vào sổ bán lẻ.') },
  'qr-780': { cents: 78_000, rc: '00', to: { dir: 'out', account: 'INTERBANK' }, yes: L('A $780 VietQR payment, confirmed by face, cleared to the shop’s bank at once.', 'Thanh toán VietQR $780, xác nhận bằng khuôn mặt, được bù trừ ngay sang ngân hàng của cửa hàng.'), no: REFUSED },
  'qr-rooted': { cents: 12_000, yes: L('The payment went through.', 'Giao dịch đã thành công.'), no: L('A jailbroken phone on a foreign VPN scores as high risk, so the payment stops before any money moves.', 'Điện thoại đã jailbreak dùng VPN nước ngoài bị chấm rủi ro cao nên giao dịch dừng trước khi tiền dịch chuyển.') },
  'swift-6800': { cents: 680_000, to: { dir: 'out', account: 'INTERBANK' }, yes: L('$6,800 of tuition leaves the account and goes abroad through the correspondent bank.', '$6,800 học phí rời tài khoản và chuyển ra nước ngoài qua ngân hàng đại lý.'), no: REFUSED },
  'swift-sanction': { cents: 300_000, yes: L('The payment went through.', 'Giao dịch đã thành công.'), no: L('The sender matches a sanctions list. The money is frozen on the core ledger (see the inspector), not on this book.', 'Người gửi trùng danh sách cấm vận. Tiền bị phong tỏa trên sổ cái lõi (xem bảng kiểm tra), không phải trên sổ này.') },
  'claim-rejected': { cents: 30_000, yes: L('The money came back.', 'Tiền đã được hoàn.'), no: L('The wrong beneficiary has already spent the money: the claim is rejected and nothing posts. The customer may take it to court.', 'Người nhận nhầm đã tiêu hết tiền: yêu cầu tra soát bị từ chối và không ghi nhận gì. Khách có thể khởi kiện.') },
  'claim-return': { cents: 30_000, to: { dir: 'in', account: 'INTERBANK' }, yes: L('Money sent to the wrong account comes back from the other bank and is credited to the customer.', 'Tiền chuyển nhầm được ngân hàng kia trả lại và ghi có cho khách.'), no: REFUSED },
  'token-51': { cents: 18_000, rc: '51', yes: L('The $180 token payment went through.', 'Thanh toán token $180 đã thành công.'), no: L('The token is valid but the funding account holds $120, so the $180 payment is declined with RC 51. No money moves.', 'Token hợp lệ nhưng tài khoản nguồn chỉ có $120 nên giao dịch $180 bị từ chối với RC 51. Tiền không dịch chuyển.') },
  'otp-locked': { cents: 25_000, rc: '75', yes: L('The payment went through.', 'Giao dịch đã thành công.'), no: L('Three wrong OTPs lock the card for online payments (RC 75). Nothing was authorised, so nothing posts.', 'Sai OTP ba lần nên thẻ bị khóa giao dịch trực tuyến (RC 75). Không có gì được cấp phép nên không ghi nhận gì.') },
  '3ds-timeout': { cents: 25_000, rc: '05', yes: L('The payment went through.', 'Giao dịch đã thành công.'), no: L('The 3DS session timed out before the customer was authenticated (RC 05). No money moves.', 'Phiên 3DS hết hạn trước khi xác thực được khách (RC 05). Tiền không dịch chuyển.') },
  'atm-51': { cents: 30_000, rc: '51', yes: L('$300 was dispensed.', 'Đã nhả $300.'), no: L('The account holds $120, so the $300 withdrawal is declined with RC 51 and the cassette is untouched.', 'Tài khoản chỉ có $120 nên lệnh rút $300 bị từ chối với RC 51 và hộp tiền không đổi.') },
  'atm-61': { cents: 50_000, rc: '61', yes: L('$500 was dispensed.', 'Đã nhả $500.'), no: L('The card has used $1,800 of its $2,000 daily limit, so $500 more is declined with RC 61. The limit resets tomorrow.', 'Thẻ đã dùng $1,800 trong hạn mức ngày $2,000 nên thêm $500 bị từ chối với RC 61. Hạn mức được đặt lại vào ngày mai.') },
  'teller-51': { cents: 200_000, rc: '51', yes: L('$2,000 was paid out at the counter.', 'Đã chi $2,000 tại quầy.'), no: L('The account holds $800, so the $2,000 counter withdrawal is refused (RC 51) and no cash leaves the till.', 'Tài khoản chỉ có $800 nên lệnh rút $2,000 tại quầy bị từ chối (RC 51) và không có tiền rời ngăn kéo.') },
  'teller-frozen': { cents: 300_000, rc: '62', yes: L('$3,000 was paid out at the counter.', 'Đã chi $3,000 tại quầy.'), no: L('A freeze order is on the account, so the teller refuses to pay out (RC 62) whatever the balance.', 'Tài khoản có lệnh phong tỏa nên giao dịch viên từ chối chi tiền (RC 62) dù số dư còn.') },
  'swift-reject': { cents: 150_000, rc: 'RJCT', yes: L('The transfer went abroad.', 'Lệnh chuyển đã ra nước ngoài.'), no: L('The beneficiary BIC is malformed: the gateway answers pacs.002 RJCT and the money never leaves the account.', 'Mã BIC thụ hưởng sai định dạng: cổng SWIFT trả pacs.002 RJCT và tiền không rời tài khoản.') },
};

/** A core preset on the retail book. `outcome` is what the bank's own rules decided, so the two books never disagree. */
export function applyPresetJournal(book: OpsBook, id: Exclude<PresetId, 'eod'>, outcome: Outcome, at: string): { book: OpsBook; outcome: OpsOutcome } {
  const def = PRESET_RETAIL[id];
  const status: OpsStatus = outcome === 'APPROVED' ? 'APPROVED' : outcome === 'DECLINED' ? 'DECLINED' : 'HELD';
  // A response code shows only when it is the answer the payment got: an approval's 00, or a refusal's own code.
  const rc = (status === 'APPROVED' && def.rc === '00') || (status === 'DECLINED' && def.rc !== undefined && def.rc !== '00') ? def.rc : undefined;
  const refused = (message: Localized<string>): { book: OpsBook; outcome: OpsOutcome } => ({ book, outcome: { action: id, status, message, journal: null, ...(rc ? { rc } : {}) } });
  if (status !== 'APPROVED' || !def.to) return refused(status === 'APPROVED' ? def.yes : def.no);
  if (def.to.account === 'CASH_VAULT' && book.balances.CASH_VAULT < def.cents) return { book, outcome: { action: id, status: 'BLOCKED', message: L('The vault cannot cover this withdrawal on the retail book: reset the book, or take in more cash first.', 'Kho quỹ không đủ chi khoản rút này trên sổ bán lẻ: hãy đặt lại sổ hoặc nhận thêm tiền mặt trước.'), journal: null } };
  const lines = def.to.dir === 'out' ? [dr('CASA', def.cents), cr(def.to.account, def.cents)] : [dr(def.to.account, def.cents), cr('CASA', def.cents)];
  const posted = post(book, id, at, lines);
  // An instant VietQR payment is timed against the 5-second real-time payment SLA.
  const clearing = id === 'qr-780' ? { elapsedMs: QR_HOPS * OPS_LIMITS.stepMs, slaMs: OPS_LIMITS.rtpSlaMs, withinSla: QR_HOPS * OPS_LIMITS.stepMs <= OPS_LIMITS.rtpSlaMs } : null;
  return { book: posted.book, outcome: { action: id, status, message: def.yes, journal: posted.journal, ...(rc ? { rc } : {}), ...(clearing ? { clearing } : {}) } };
}

/** The hops of a VietQR payment the clearing clock counts: QR gate, FacePay, FDS, ledger, approval. */
const QR_HOPS = 5;

/** The journal a core preset posts on a fresh book when the bank approves it: what the Knowledge Base draws for it. */
export const examplePresetJournal = (id: Exclude<PresetId, 'eod'>): readonly OpsLine[] => applyPresetJournal(openingBook(), id, 'APPROVED', 'D1 00:00:00').outcome.journal?.lines ?? [];

/** The night's settlement: what is owed to NAPAS and the wallet providers is paid out of the interbank position, and those accounts return to zero. */
export function settleEod(book: OpsBook, at: string): { book: OpsBook; outcome: OpsOutcome } {
  const napas = opsNatural('NAPAS_FEE', book.balances.NAPAS_FEE);
  const wallets = opsNatural('WALLET_SETTLEMENT', book.balances.WALLET_SETTLEMENT);
  if (napas + wallets <= 0) return { book, outcome: { action: 'eod', status: 'APPROVED', message: L('The night cycle runs: nothing is owed to the domestic switch (NAPAS) or the wallet providers on this book tonight.', 'Chu kỳ đêm đang chạy: đêm nay sổ này không còn khoản phải trả NAPAS hay đơn vị ví.'), journal: null } };
  const lines = [...(napas > 0 ? [dr('NAPAS_FEE', napas)] : []), ...(wallets > 0 ? [dr('WALLET_SETTLEMENT', wallets)] : []), cr('INTERBANK', napas + wallets)];
  const posted = post(book, 'eod', at, lines);
  return { book: posted.book, outcome: { action: 'eod', status: 'APPROVED', message: L('The night cycle pays the domestic switch (NAPAS) its fees and settles the wallet top-ups.', 'Chu kỳ đêm trả phí cho NAPAS và quyết toán các khoản nạp ví.'), journal: posted.journal } };
}

/** The journal an action posts on a fresh book: what the Knowledge Base draws, so the article and the desk cannot disagree. */
export function exampleJournal(id: OpsActionId): readonly OpsLine[] {
  return runOpsAction(openingBook(), id, 'D1 00:00:00').outcome.journal?.lines ?? [];
}

/** The liquidation journal, on a book with its collateral locked. */
export const exampleLiquidation = (): readonly OpsLine[] => runOpsAction(runOpsAction(openingBook(), 'collateral-lock', 'D1 00:00:00').book, 'collateral-liquidate', 'D1 00:00:00').outcome.journal?.lines ?? [];

/** The journals of the follow-ups, on a book that needs them. */
export const exampleVaultTransfer = (): readonly OpsLine[] => {
  const over = runOpsAction(openingBook(), 'teller-exceed-limit', 'D1 00:00:00').book;
  return transferToVault(over, 'D1 00:00:00').journal?.lines ?? [];
};
export const exampleTicketClose = (finding: 'REFUNDED' | 'DISPENSED'): readonly OpsLine[] => {
  const jammed = runOpsAction(openingBook(), 'atm-jam-200', 'D1 00:00:00').book;
  return resolveTicket(jammed, jammed.tickets[0]!.id, finding, 'D1 00:00:00').journal?.lines ?? [];
};

/** A saved book read back: anything that does not look like a book of today's accounts is dropped rather than trusted. */
export function decodeBook(raw: unknown): OpsBook | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Partial<OpsBook>;
  if (typeof b.balances !== 'object' || b.balances === null || !Array.isArray(b.journal) || !Array.isArray(b.tickets) || typeof b.posted !== 'number') return null;
  const balances = b.balances as Record<string, unknown>;
  if (!OPS_ACCOUNT_IDS.every((id) => Number.isInteger(balances[id]))) return null;
  if (OPS_ACCOUNT_IDS.reduce((s, id) => s + (balances[id] as number), 0) !== 0) return null;
  return { balances: b.balances as OpsBook['balances'], journal: b.journal, posted: b.posted, tickets: b.tickets, cassetteDrill: b.cassetteDrill === true, collateralLockedCents: typeof b.collateralLockedCents === 'number' ? b.collateralLockedCents : 0, vaultPrompt: b.vaultPrompt ?? null };
}
