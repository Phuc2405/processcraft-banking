/**
 * The Phase 1/4 retail operations book: six sub-processes, their one-click demo actions and the journals they post. Each
 * sub-process lives inside one of the eight guided flows (OPS_SUBPROCESSES): it adds buttons and paths to that flow, no flow of its own.
 *
 * It is a book of its own, on purpose. Its GL numbers are the ones the retail operations brief names (1113, 1950, 2930 ATM
 * Suspense, 3510...), and several of them mean something else on the charts that already exist: on the core ledger 2930 is
 * frozen AML funds and 4510 / 4520 are the other way round. OPS_ACCOUNTS records each account's core-ledger counterpart, and
 * the Knowledge Base prints that crosswalk. No React here: the dock, the Knowledge Base and the tests read the same rules.
 */

import type { Localized } from '../i18n/locale';
import type { Outcome } from '../types/processLearning';
import type { FlowId } from '../types/viewport';
import type { ChapterId } from './academyCatalog';
import { CTR_THRESHOLD_CENTS } from './amlEngine';
import { flowScope, type FlowScope } from './guidedFlows';
import type { PresetId } from './presets';
import { GL_CODE, type GlAccount } from './staffRoleplay';
import { edgeId, isStation, STATIONS, WIRES, type DepartmentId, type PlaceId } from './topology';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

export type OpsSide = 'asset' | 'liability' | 'income';

export const OPS_ACCOUNTS = [
  { id: 'CASH_ATM', code: '1011', side: 'asset', core: 'ATM_CASH', name: L('Cash · ATM cassettes', 'Tiền mặt · Hộp tiền ATM'), plain: L('The notes loaded in the ATMs. Same GL as the vault and the till: 1011 is split by where the cash physically is.', 'Tiền giấy trong các máy ATM. Cùng TK với kho quỹ và ngăn kéo: 1011 được chia theo nơi tiền thực sự nằm.') },
  { id: 'CASH_TILL', code: '1011', side: 'asset', core: 'TILL_CASH', name: L('Vault Cash · teller till', 'Tiền mặt kho quỹ · Ngăn kéo giao dịch viên'), plain: L('The notes in the teller’s drawer, limited to $50,000.', 'Tiền trong ngăn kéo của giao dịch viên, tối đa $50,000.') },
  { id: 'CASH_VAULT', code: '1011', side: 'asset', core: 'VAULT_CASH', name: L('Vault Cash · main vault', 'Tiền mặt kho quỹ · Kho chính'), plain: L('The branch’s strong room, which feeds the ATMs and takes a till’s surplus.', 'Kho tiền của chi nhánh, cấp tiền cho ATM và nhận phần dư của ngăn kéo.') },
  { id: 'INTERBANK', code: '1113', side: 'asset', core: 'INTERBANK_SETTLEMENT', name: L('Interbank Settlement', 'Thanh toán liên ngân hàng'), plain: L('The bank’s settlement position: a credit here is value sent to another bank.', 'Vị thế quyết toán của ngân hàng: ghi Có là giá trị đã chuyển sang ngân hàng khác.') },
  { id: 'OVERDRAFT', code: '1310', side: 'asset', core: 'OVERDRAFT_RECV', name: L('Overdraft Receivable', 'Phải thu thấu chi'), plain: L('What customers owe when their balance went below zero. It is what a negative CASA balance really is on the bank’s books.', 'Khoản khách nợ khi số dư xuống dưới 0. Đây chính là số dư CASA âm trên sổ của ngân hàng.') },
  { id: 'WALLET_SETTLEMENT', code: '1950', side: 'liability', core: 'WALLET_SETTLEMENT', name: L('Wallet Settlement', 'Quyết toán ví điện tử'), plain: L('What the bank owes wallet providers for the top-ups it has taken, until they are settled.', 'Khoản ngân hàng phải trả đơn vị ví cho các lần nạp đã nhận, cho đến khi quyết toán.') },
  { id: 'CASA', code: '2010', side: 'liability', core: 'CASA', name: L('Customer CASA', 'Tài khoản thanh toán của khách'), plain: L('What the bank owes customers in their current and savings accounts. A debit is money leaving a customer.', 'Khoản ngân hàng nợ khách trên tài khoản thanh toán và tiết kiệm. Ghi Nợ là tiền rời khỏi khách.') },
  { id: 'ATM_SUSPENSE', code: '2930', side: 'liability', core: 'ATM_SUSPENSE', name: L('ATM Suspense', 'Treo ATM'), plain: L('Money taken from a customer when the machine failed: parked until the cash count settles who is owed it. It must drain to zero.', 'Tiền đã trừ của khách khi máy gặp lỗi: treo lại cho đến khi kiểm quỹ xác định ai được nhận. Phải về 0.') },
  { id: 'NAPAS_FEE', code: '3510', side: 'liability', core: 'SWITCH_FEE_EXPENSE', name: L('Domestic Switch Fee Payable (NAPAS)', 'Phí NAPAS phải trả'), plain: L('The switch’s share of an interbank ATM fee: collected from the customer and owed to the domestic switch (NAPAS) until tonight’s settlement.', 'Phần phí của chuyển mạch trong phí ATM liên ngân hàng: thu từ khách và phải trả NAPAS đến khi quyết toán đêm nay.') },
  { id: 'NSF_INCOME', code: '4510', side: 'income', core: 'PENALTY_INCOME', name: L('NSF Fee Income', 'Thu phí không đủ số dư (NSF)'), plain: L('The fee charged when a payment is returned unpaid for lack of funds.', 'Phí thu khi lệnh thanh toán bị trả lại do không đủ số dư.') },
  { id: 'FEE_INCOME', code: '4520', side: 'income', core: 'FEE_INCOME', name: L('ATM & Card Fee Income', 'Thu phí ATM & thẻ'), plain: L('The bank’s own fee income: its share of ATM fees, and annual, issuance and lock fees on cards.', 'Thu nhập phí của ngân hàng: phần phí ATM được giữ lại, phí thường niên, phát hành và khóa thẻ.') },
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
  | 'bill-water-250'
  | 'wallet-cashin-100'
  | 'qr-45'
  | 'atm-withdraw-100'
  | 'atm-jam-200'
  | 'cassette-low'
  | 'teller-deposit-5000'
  | 'teller-exceed-limit'
  | 'fee-annual-45'
  | 'fee-card-10';

export type OpsStatus = 'APPROVED' | 'DECLINED' | 'HELD' | 'ALERT' | 'BLOCKED';

export type OpsSubProcessId = 'bill-pay' | 'wallet-qr' | 'atm-napas' | 'cassette-jam' | 'teller-vault' | 'card-fees';

/** The six sub-processes and the guided flow each one is taught inside. */
export const OPS_SUBPROCESSES: readonly { id: OpsSubProcessId; flow: FlowId; title: Localized<string> }[] = [
  { id: 'bill-pay', flow: 1, title: L('Utility Bill Pay & Direct Debit', 'Thanh toán hóa đơn & Ủy nhiệm thu') },
  { id: 'wallet-qr', flow: 7, title: L('e-Wallet & Dynamic QR (MoMo / VietQR)', 'Ví điện tử & VietQR') },
  { id: 'atm-napas', flow: 3, title: L('ATM Cash & Domestic Interbank Fee (NAPAS)', 'Rút tiền ATM & Phí NAPAS') },
  { id: 'cassette-jam', flow: 3, title: L('ATM Cassette Alert & Cash Jam (GL 2930)', 'Cảnh báo hộp tiền ATM & Kẹt tiền (TK 2930)') },
  { id: 'teller-vault', flow: 6, title: L('OTC Teller Cash Vault ($50,000 Limit)', 'Kho quỹ tiền mặt tại quầy (hạn mức $50,000)') },
  { id: 'card-fees', flow: 1, title: L('Card Annual/Issuance Fees', 'Phí thường niên/phát hành thẻ') },
];
/** The Academy chapter each sub-process is taught in: the Academy stays at six chapters. One place to change the mapping. */
export const OPS_SUB_CHAPTER: Readonly<Record<OpsSubProcessId, ChapterId>> = { 'bill-pay': 2, 'card-fees': 2, 'wallet-qr': 4, 'atm-napas': 5, 'cassette-jam': 5, 'teller-vault': 5 };

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
    id: 'bill-water-250',
    sub: 'bill-pay',
    icon: '▲',
    variant: 'danger',
    label: L('Pay $250 Water Bill (Declined 51 NSF)', 'Trả $250 tiền nước (Từ chối 51 NSF)'),
    hint: L('The account holds $120: the bill is returned unpaid and only the $15 NSF fee posts (4510).', 'Tài khoản có $120: hóa đơn bị trả lại, chỉ ghi nhận phí NSF $15 (4510).'),
    route: ['GATE_POS', 'LEDGER_DEBIT', 'OUT_DECLINED'],
    customerCents: 12_000,
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
    id: 'qr-45',
    sub: 'wallet-qr',
    icon: '▶',
    variant: 'primary',
    label: L('Scan $45 VietQR Payment (Approved 00)', 'Quét VietQR trả $45 (Chấp thuận 00)'),
    hint: L('Instant RTP: pacs.008 out, pacs.002 ACSC back, inside the 5-second SLA.', 'RTP tức thời: pacs.008 đi, pacs.002 ACSC về, trong SLA 5 giây.'),
    route: ['GATE_QR', 'SEC_FDS', 'LEDGER_DEBIT', 'OUT_APPROVED'],
    customerCents: 60_000,
  },
  {
    id: 'atm-withdraw-100',
    sub: 'atm-napas',
    icon: '▶',
    variant: 'success',
    label: L('Withdraw $100 Cash (Approved 00)', 'Rút $100 tiền mặt (Chấp thuận 00)'),
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
    label: L('Trigger Low Cassette Alert (<15%)', 'Kích hoạt cảnh báo hộp tiền thấp (<15%)'),
    hint: L('A sensor drill: no money moves, a warning badge appears on the ATM until the CIT refill.', 'Diễn tập cảm biến: tiền không dịch chuyển, huy hiệu cảnh báo hiện trên ATM đến khi tiếp quỹ CIT.'),
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
];

export const opsActionsFor = (sub: OpsSubProcessId): OpsActionDef[] => OPS_ACTIONS.filter((a) => a.sub === sub);
export const opsSubProcessesIn = (flow: FlowId): (typeof OPS_SUBPROCESSES)[number][] => OPS_SUBPROCESSES.filter((s) => s.flow === flow);
export const opsFlowOf = (a: OpsActionDef): FlowId => opsSubProcess(a.sub).flow;

const SUB_SCOPE = new Map<OpsSubProcessId, FlowScope>();
/** What a sub-process lights: only the desks its own payments cross, and the wires between them. */
export function opsScope(sub: OpsSubProcessId): FlowScope {
  const cached = SUB_SCOPE.get(sub);
  if (cached) return cached;
  const places = new Set<PlaceId>(opsActionsFor(sub).flatMap((a) => a.route));
  const departments = new Set<DepartmentId>();
  for (const p of places) if (isStation(p)) departments.add(STATIONS[p].department);
  const scope: FlowScope = { places, departments, wires: new Set(WIRES.filter(([a, b]) => places.has(a) && places.has(b)).map(([a, b]) => edgeId(a, b))) };
  SUB_SCOPE.set(sub, scope);
  return scope;
}

/** What the map lights: the chosen sub-process, else the flow. */
export const focusScope = (flow: FlowId, sub: OpsSubProcessId | null): FlowScope => (sub && opsSubProcess(sub).flow === flow ? opsScope(sub) : flowScope(flow));
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
  vaultPrompt: VaultPrompt | null;
}

export const OPS_JOURNAL_CAP = 40;

export const openingBook = (): OpsBook => ({ balances: { ...OPS_OPENING }, journal: [], posted: 0, tickets: [], cassetteDrill: false, vaultPrompt: null });

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
export const opsNatural = (id: OpsAccountId, debitPositive: number): number => (opsAccount(id).side === 'asset' ? debitPositive : 0 - debitPositive);

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
    case 'bill-water-250': {
      const bill = 25_000;
      if (available >= bill) return plainPayment(book, def, at, bill, 'INTERBANK', L('Bill paid.', 'Đã thanh toán hóa đơn.'));
      const fee = OPS_LIMITS.nsfFeeCents;
      const posted = post(book, id, at, [dr('CASA', fee), cr('NSF_INCOME', fee)]);
      return { book: posted.book, outcome: { action: id, status: 'DECLINED', rc: '51', message: L('Insufficient funds: the $250 bill is returned unpaid and the $15 NSF fee is charged.', 'Không đủ số dư: hóa đơn $250 bị trả lại và thu phí NSF $15.'), journal: posted.journal, customer: { before: available, after: available - fee } } };
    }
    case 'wallet-cashin-100':
      return plainPayment(book, def, at, 10_000, 'WALLET_SETTLEMENT', L('Wallet topped up: the bank now owes the wallet provider $100 until settlement.', 'Đã nạp ví: ngân hàng phải trả đơn vị ví $100 đến khi quyết toán.'));
    case 'qr-45': {
      const paid = plainPayment(book, def, at, 4_500, 'INTERBANK', L('Cleared instantly: pacs.002 ACSC came back and the shop has its money.', 'Bù trừ tức thời: pacs.002 ACSC đã về và cửa hàng đã nhận tiền.'));
      const elapsedMs = def.route.length * OPS_LIMITS.stepMs;
      return { book: paid.book, outcome: { ...paid.outcome, clearing: { elapsedMs, slaMs: OPS_LIMITS.rtpSlaMs, withinSla: elapsedMs <= OPS_LIMITS.rtpSlaMs } } };
    }
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
  'claim-return': { cents: 30_000, to: { dir: 'in', account: 'INTERBANK' }, yes: L('Money sent to the wrong account comes back from the other bank and is credited to the customer.', 'Tiền chuyển nhầm được ngân hàng kia trả lại và ghi có cho khách.'), no: REFUSED },
};

/** A core preset on the retail book. `outcome` is what the bank's own rules decided, so the two books never disagree. */
export function applyPresetJournal(book: OpsBook, id: Exclude<PresetId, 'eod'>, outcome: Outcome, at: string): { book: OpsBook; outcome: OpsOutcome } {
  const def = PRESET_RETAIL[id];
  const status: OpsStatus = outcome === 'APPROVED' ? 'APPROVED' : outcome === 'DECLINED' ? 'DECLINED' : 'HELD';
  const rc = status === 'HELD' || (status === 'DECLINED' && def.rc !== '51') || (status === 'APPROVED' && def.rc === '51') ? undefined : def.rc;
  const refused = (message: Localized<string>): { book: OpsBook; outcome: OpsOutcome } => ({ book, outcome: { action: id, status, message, journal: null, ...(rc ? { rc } : {}) } });
  if (status !== 'APPROVED' || !def.to) return refused(status === 'APPROVED' ? def.yes : def.no);
  if (def.to.account === 'CASH_VAULT' && book.balances.CASH_VAULT < def.cents) return { book, outcome: { action: id, status: 'BLOCKED', message: L('The vault cannot cover this withdrawal on the retail book: reset the book, or take in more cash first.', 'Kho quỹ không đủ chi khoản rút này trên sổ bán lẻ: hãy đặt lại sổ hoặc nhận thêm tiền mặt trước.'), journal: null } };
  const lines = def.to.dir === 'out' ? [dr('CASA', def.cents), cr(def.to.account, def.cents)] : [dr(def.to.account, def.cents), cr('CASA', def.cents)];
  const posted = post(book, id, at, lines);
  return { book: posted.book, outcome: { action: id, status, message: def.yes, journal: posted.journal, ...(rc ? { rc } : {}) } };
}

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
  return { balances: b.balances as OpsBook['balances'], journal: b.journal, posted: b.posted, tickets: b.tickets, cassetteDrill: b.cassetteDrill === true, vaultPrompt: b.vaultPrompt ?? null };
}
