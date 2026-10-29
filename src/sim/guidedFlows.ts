/** The four guided flows of the Beginner scope. */

import type { DataDepth, FlowId, ViewportSettings } from '../types/viewport';
import { edgeId, isStation, STATIONS, WIRES, type DepartmentId, type PlaceId } from './topology';
import type { PacketTrace } from './types';
import { activeLocale } from '../i18n/localeCore';

export type FlowNodeId =
  | 'pos_terminal'
  | 'casa_desk'
  | 'auth_engine'
  | 'web_checkout'
  | 'token_vault'
  | 'fraud_desk'
  | 'otp_service'
  | 'cdm_kiosk'
  | 'cash_sorter'
  | 'batch_processor'
  | 'clearing_house'
  | 'settlement_desk'
  | 'reconciliation_desk'
  // Phase 8
  | 'ekyc_gate'
  | 'aml_screen'
  | 'casa_posting'
  | 'teller_counter'
  | 'qr_gateway'
  | 'facepay'
  | 'fds_engine'
  | 'swift_gateway'
  | 'dispute_desk';

/** The flow-to-node contract, exactly as the brief names it. */
export const GUIDED_FLOW_NODES: Readonly<Record<FlowId, readonly FlowNodeId[]>> = {
  1: ['pos_terminal', 'casa_desk', 'auth_engine'],
  2: ['web_checkout', 'token_vault', 'fraud_desk', 'otp_service', 'auth_engine'],
  3: ['cdm_kiosk', 'cash_sorter', 'casa_desk'],
  4: ['batch_processor', 'clearing_house', 'settlement_desk', 'reconciliation_desk'],
  5: ['ekyc_gate', 'aml_screen', 'casa_posting'],
  6: ['teller_counter', 'aml_screen', 'casa_posting'],
  7: ['qr_gateway', 'facepay', 'fds_engine', 'aml_screen', 'casa_posting'],
  8: ['swift_gateway', 'facepay', 'fds_engine', 'aml_screen', 'casa_posting', 'dispute_desk'],
};

export interface FlowStep {
  node: FlowNodeId;
  /** The places on the map that play this part, in the order a payment meets them. */
  places: readonly PlaceId[];
  /** What the step is called in a preview card. */
  name: string;
  /** One line: what happens here. Standard (plain English) and Expert wording. */
  summary: Record<DataDepth, string>;
}

export interface FlowDef {
  id: FlowId;
  /** "01" */
  code: string;
  title: string;
  accent: string;
  /** One sentence for the flow bar's tooltip. */
  blurb: string;
  steps: readonly FlowStep[];
}

const step = (node: FlowNodeId, places: readonly PlaceId[], name: string, standard: string, expert: string): FlowStep => ({ node, places, name, summary: { standard, expert } });

export const GUIDED_FLOWS: Readonly<Record<FlowId, FlowDef>> = {
  1: {
    id: 1,
    code: '01',
    title: 'In-Store POS',
    accent: '#a3e635',
    blurb: 'A card tapped at a shop terminal: the bank checks the account and answers in well under a second.',
    steps: [
      step('pos_terminal', ['GATE_POS'], 'POS Terminal Gate', 'The shop terminal sends the tap or swipe to the bank.', 'Receives the ISO 8583 0100 authorisation request from the acquirer.'),
      step('casa_desk', ['LEDGER_DEBIT'], 'Debit CASA', 'Checks there is enough money and locks the amount for the shop.', 'Available-balance check, then an authorisation hold: Dr CASA Hold / Cr Card Clearing Payable.'),
      step('auth_engine', ['OUT_APPROVED', 'OUT_DECLINED'], 'Authorisation Answer', 'The terminal shows Approved or Declined.', 'Returns the 0110 response: RC 00 approved, or RC 51 insufficient funds.'),
    ],
  },
  2: {
    id: 2,
    code: '02',
    title: 'Web & 3DS',
    accent: '#a78bfa',
    blurb: 'An online checkout: a tokenised card with a dynamic code, or a 3DS risk check that may text the customer a code.',
    steps: [
      step('web_checkout', ['GATE_VIRTUAL', 'GATE_ECOM'], 'Web Checkout Gate', 'A website or app sends the card payment to the bank.', 'Card-not-present authorisation in: a DPAN with dCVV, or a PAN with a 3DS AReq.'),
      step('token_vault', ['SEC_VAULT', 'SEC_DCVV'], 'Token Vault & dCVV', 'Swaps the stand-in card number for the real one and checks the one-time code.', 'Detokenises DPAN → FPAN and validates the dynamic CVV inside its time window.'),
      step('fraud_desk', ['SEC_3DS'], '3DS Risk Desk', 'Scores the risk: low risk goes straight through, medium risk gets a code.', 'Risk-based authentication: frictionless below the threshold, challenge in the band, reject above it.'),
      step('otp_service', ['CUSTOMER_OTP'], 'SMS One-Time Code', 'The customer types the code from their phone, or gives up.', 'OTP challenge (CReq/CRes). A completed challenge moves fraud liability to the issuer.'),
      step('auth_engine', ['LEDGER_DEBIT', 'LEDGER_CREDIT', 'OUT_APPROVED', 'OUT_DECLINED'], 'Authorisation Engine', 'Checks the money is there, locks it, and answers the website.', 'Funds check and auth hold on the CASA or credit line, then the 0110 response code.'),
    ],
  },
  3: {
    id: 3,
    code: '03',
    title: 'Automated Cash Deposit',
    accent: '#38bdf8',
    blurb: 'Cash paid in at the sidewalk cash deposit machine: notes counted, account credited on the spot.',
    steps: [
      step('cdm_kiosk', ['GATE_ATM'], 'Cash Deposit Machine', 'The customer inserts their card and types the PIN.', 'Card read and PIN verified at the CDM (three tries before the card is kept).'),
      step('cash_sorter', ['ATM_CASH'], 'Note Validator & Cassette', 'The machine counts the notes and checks they are real.', 'Note validation and count; the cash joins the machine cassette (GL 1015 ATM Cash).'),
      step('casa_desk', ['LEDGER_DEBIT', 'OUT_APPROVED'], 'Customer CASA', 'The money appears in the customer’s account straight away.', 'Posting: Dr 1015 ATM Cash in Machines / Cr 2010 Customer CASA.'),
    ],
  },
  4: {
    id: 4,
    code: '04',
    title: 'Overnight EOD',
    accent: '#fbbf24',
    blurb: 'The night cycle: everything approved today is cleared with Visa, settled and reconciled before morning.',
    steps: [
      step('batch_processor', ['OUT_APPROVED'], 'Approved Today', 'Every card payment approved today waits for tonight’s run.', 'Authorised-but-unsettled holds queue for the 23:00 batch cut-off.'),
      step('clearing_house', ['EOD_BATCH'], 'Batch Clearing', 'At 23:00 the day’s payments are packed into one clearing file.', 'Builds the clearing (presentment) file from the day’s authorisations.'),
      step('settlement_desk', ['EOD_VISA'], 'Visa Settlement', 'Visa works out who owes whom and the money moves.', 'Scheme net settlement; holds are captured: Dr Customer / Cr CASA Hold.'),
      step('reconciliation_desk', ['RECON', 'SUSPENSE', 'OUT_SETTLED'], '3-Way Reconciliation', 'Three records must agree; anything odd waits in a holding account.', 'Ledger vs clearing vs switch match; breaks post to RECON_SUSPENSE until cleared.'),
    ],
  },
  5: {
    id: 5,
    code: '05',
    title: 'eKYC Onboarding',
    accent: '#2dd4bf',
    blurb: 'A new customer opens an account from their phone: ID scan, selfie, citizen-database check, then a sanctions screen.',
    steps: [
      step('ekyc_gate', ['GATE_EKYC'], 'eKYC & Identity', 'The app reads the ID card and checks the selfie is a real, matching face.', 'OCR of the CCCD, passive liveness, face match to the chip photo, and C06 citizen-database lookup; a failure is EKYC_LIVENESS_FAILED.'),
      step('aml_screen', ['AML_DESK'], 'AML & Sanctions', 'A name on a sanctions list, or a politically exposed person, is checked by an analyst.', 'OFAC/PEP fuzzy match (Jaro-Winkler ≥ 85 is AML_SANCTION_MATCH); a PEP is held as STR_PENDING for review.'),
      step('casa_posting', ['LEDGER_DEBIT', 'OUT_APPROVED', 'OUT_DECLINED'], 'Account Opened', 'The account opens and the first deposit lands in it.', 'Core banking opens the CASA: Dr 1410 Instant Settlement / Cr 2010 Customer CASA for the opening deposit.'),
    ],
  },
  6: {
    id: 6,
    code: '06',
    title: 'Teller Cash & CTR',
    accent: '#84cc16',
    blurb: 'Cash over the branch counter: notes counted, fakes caught, and every cash transaction over $10,000 reported.',
    steps: [
      step('teller_counter', ['TELLER_CASH'], 'Teller Counter', 'The teller counts the notes, checks for fakes and that the till has enough cash.', 'Note count against the till (GL 1012), suspect serials recorded (TELLER_SUSPECT_NOTE), CTR filed at $10,000 or more.'),
      step('aml_screen', ['AML_DESK'], 'AML Review', 'Cash split into pieces just under the reporting line is held for an analyst.', 'Structuring (smurfing) detection: deposits ≥ 80% of the CTR line that sum past it are STR_PENDING.'),
      step('casa_posting', ['LEDGER_DEBIT', 'OUT_APPROVED', 'OUT_DECLINED'], 'Customer CASA', 'The account is credited, or debited for the cash handed over.', 'Dr 1012 Teller Vault Cash / Cr 2010 Customer CASA for a deposit; the reverse for a withdrawal.'),
    ],
  },
  7: {
    id: 7,
    code: '07',
    title: 'VietQR & FacePay',
    accent: '#06b6d4',
    blurb: 'A QR payment through Napas247: the code is checked, a big one needs a face scan, and the device is scored for fraud.',
    steps: [
      step('qr_gateway', ['GATE_QR'], 'Napas247 QR Gateway', 'The bank reads the scanned QR code and checks it has not been altered.', 'EMVCo TLV parse (tag 38 Napas GUID + BIN, tag 54 amount), CRC-16 check of tag 63, mapped to an ISO 8583 0200.'),
      step('facepay', ['SEC_FACEPAY'], 'FacePay Biometrics', 'Over $400, the customer must scan their face.', 'Transfers over 10M VND need a face match ≥ 85% with liveness ≥ 80, or BIOMETRIC_AUTH_REQUIRED.'),
      step('fds_engine', ['SEC_FDS'], 'FDS & Device Fingerprint', 'The phone behind the payment is checked for signs of fraud.', 'IP anomaly, root/jailbreak and BIN-velocity signals; a score ≥ 70 is FDS_HIGH_RISK_DEVICE. The automated AML screen runs here too.'),
      step('aml_screen', ['AML_DESK'], 'AML Review', 'A flagged payment waits for an analyst; most go straight on.', 'STR_PENDING items are reviewed and released or blocked (AML_STR_BLOCKED).'),
      step('casa_posting', ['LEDGER_DEBIT', 'OUT_APPROVED', 'OUT_DECLINED'], 'Customer CASA', 'The money leaves the account and reaches the shop at once.', 'Dr 2010 Customer CASA / Cr 1410 Instant Payments Settlement.'),
    ],
  },
  8: {
    id: 8,
    code: '08',
    title: 'SWIFT & Disputes',
    accent: '#fb923c',
    blurb: 'Money sent abroad in ISO 20022, screened for sanctions, and the claims desk that handles returns and chargebacks.',
    steps: [
      step('swift_gateway', ['GATE_SWIFT'], 'SWIFT / ISO 20022 Gateway', 'The transfer is written in the international format and converted to the other currency.', 'pacs.008 validation (EndToEndId, DbtrAgt/CdtrAgt BICs, IntrBkSttlmAmt + currency) and FX conversion.'),
      step('facepay', ['SEC_FACEPAY'], 'FacePay Biometrics', 'A transfer this size needs the customer’s face.', 'Over 10M VND: face match ≥ 85%, liveness ≥ 80, or BIOMETRIC_AUTH_REQUIRED.'),
      step('fds_engine', ['SEC_FDS'], 'FDS & AML Screen', 'The device is scored and the beneficiary screened against sanctions lists.', 'Device score ≥ 70 is FDS_HIGH_RISK_DEVICE; a large cross-border payment is STR_PENDING; a sanctions hit is frozen.'),
      step('aml_screen', ['AML_DESK'], 'AML & Sanctions Review', 'An analyst confirms a sanctions match or releases a held payment.', 'OFAC match confirmed → AML_SANCTION_MATCH, funds to 2510 AML Restrained Funds; otherwise STR filed or released.'),
      step('casa_posting', ['LEDGER_DEBIT', 'OUT_APPROVED', 'OUT_DECLINED'], 'Customer CASA', 'The customer is debited and the bank abroad is paid.', 'Dr 2010 Customer CASA / Cr 1430 Correspondent Nostro (SWIFT).'),
      step('dispute_desk', ['DISPUTE_DESK'], 'Disputes & Returns', 'If something went wrong, a specialist decides the claim and refunds the customer.', 'pacs.004 payment return, card chargeback (120-day SLA) or ATM mismatch from the electronic journal.'),
    ],
  },
};

/** The flow and step a logical node plays in, for a flow that uses it. */
const nodePlaces = (flow: FlowId, node: FlowNodeId): readonly PlaceId[] => GUIDED_FLOWS[flow].steps.find((s) => s.node === node)?.places ?? [];

const PLACES_CACHE = new Map<FlowId, ReadonlySet<PlaceId>>();
/** Every place the flow lights. */
export function flowPlaces(flow: FlowId): ReadonlySet<PlaceId> {
  let set = PLACES_CACHE.get(flow);
  if (!set) {
    set = new Set(GUIDED_FLOWS[flow].steps.flatMap((s) => s.places));
    PLACES_CACHE.set(flow, set);
  }
  return set;
}

const isFlowNode = (id: string): id is FlowNodeId => Object.values(GUIDED_FLOW_NODES).some((nodes) => (nodes as readonly string[]).includes(id));

/** Whether a node stays lit. */
export function isNodeFocused(nodeId: string, viewport: ViewportSettings): boolean {
  if (viewport.scope !== 'beginner' || viewport.activeFlow === null) return true;
  const flow = viewport.activeFlow;
  if (isFlowNode(nodeId)) return GUIDED_FLOW_NODES[flow].includes(nodeId) && nodePlaces(flow, nodeId).length > 0;
  return flowPlaces(flow).has(nodeId as PlaceId);
}

export interface FlowScope {
  places: ReadonlySet<PlaceId>;
  departments: ReadonlySet<DepartmentId>;
  /** Wire ids whose two ends are both lit. */
  wires: ReadonlySet<string>;
}

const SCOPE_CACHE = new Map<FlowId, FlowScope>();
export function flowScope(flow: FlowId): FlowScope {
  const cached = SCOPE_CACHE.get(flow);
  if (cached) return cached;
  const places = flowPlaces(flow);
  const departments = new Set<DepartmentId>();
  for (const p of places) if (isStation(p)) departments.add(STATIONS[p].department);
  const wires = new Set(WIRES.filter(([a, b]) => places.has(a) && places.has(b)).map(([a, b]) => edgeId(a, b)));
  const scope = { places, departments, wires };
  SCOPE_CACHE.set(flow, scope);
  return scope;
}

export type StepStatus = 'upcoming' | 'in-progress' | 'completed';

export const STEP_STATUS_LABEL: Record<StepStatus, string> = { upcoming: 'Upcoming', 'in-progress': 'In Progress', completed: 'Completed' };

/** Where the learner's last preset payment is along a flow. */
export function stepStatus(flow: FlowId, index: number, trace: PacketTrace | null): StepStatus {
  const s = GUIDED_FLOWS[flow].steps[index];
  if (!s || !trace) return 'upcoming';
  const current = trace.done ? null : (trace.route[trace.at] ?? null);
  if (current && s.places.includes(current)) return 'in-progress';
  const passed = trace.route.slice(0, trace.at);
  return passed.some((p) => s.places.includes(p)) ? 'completed' : 'upcoming';
}

/** The step a place plays in a flow, for the hover preview: its number (1-based), the total, and the step. */
export function stepAt(flow: FlowId, place: PlaceId): { number: number; total: number; step: FlowStep } | null {
  const steps = GUIDED_FLOWS[flow].steps;
  const i = steps.findIndex((s) => s.places.includes(place));
  const found = steps[i];
  return found ? { number: i + 1, total: steps.length, step: found } : null;
}

// Language

interface FlowWords {
  title: string;
  blurb: string;
  /** Per step, in the order of GUIDED_FLOWS[id].steps. */
  steps: ReadonlyArray<{ name: string; standard: string; expert: string }>;
}

const FLOW_VI: Readonly<Record<FlowId, FlowWords>> = {
  1: {
    title: 'POS tại cửa hàng',
    blurb: 'Một lần chạm thẻ tại máy POS: ngân hàng kiểm tra tài khoản và trả lời trong chưa đầy một giây.',
    steps: [
      { name: 'Cổng máy POS', standard: 'Máy POS của cửa hàng gửi lần chạm hoặc quẹt thẻ tới ngân hàng.', expert: 'Nhận yêu cầu cấp phép ISO 8583 0100 từ ngân hàng thanh toán.' },
      { name: 'Tài khoản thanh toán (CASA)', standard: 'Kiểm tra có đủ tiền và khoanh giữ số tiền cho cửa hàng.', expert: 'Kiểm tra số dư khả dụng, rồi khoanh giữ cấp phép: Nợ Khoanh giữ CASA / Có Phải trả bù trừ thẻ.' },
      { name: 'Phản hồi cấp phép', standard: 'Máy POS hiển thị Chấp thuận hoặc Từ chối.', expert: 'Trả về phản hồi 0110: RC 00 chấp thuận, hoặc RC 51 không đủ số dư.' },
    ],
  },
  2: {
    title: 'Web & 3DS',
    blurb: 'Một lần thanh toán trực tuyến: thẻ đã mã hóa kèm mã động, hoặc kiểm tra rủi ro 3DS có thể nhắn mã cho khách.',
    steps: [
      { name: 'Cổng thanh toán web', standard: 'Website hoặc ứng dụng gửi giao dịch thẻ tới ngân hàng.', expert: 'Yêu cầu cấp phép không xuất trình thẻ: DPAN kèm dCVV, hoặc PAN kèm 3DS AReq.' },
      { name: 'Kho token & dCVV', standard: 'Đổi số thẻ thay thế thành số thật và kiểm tra mã dùng một lần.', expert: 'Giải mã token DPAN → FPAN và xác thực CVV động trong cửa sổ thời gian.' },
      { name: 'Bàn rủi ro 3DS', standard: 'Chấm điểm rủi ro: rủi ro thấp đi thẳng, rủi ro trung bình nhận mã.', expert: 'Xác thực dựa trên rủi ro: xác thực liền mạch dưới ngưỡng, thử thách trong dải, từ chối trên ngưỡng.' },
      { name: 'Mã SMS dùng một lần', standard: 'Khách nhập mã từ điện thoại, hoặc bỏ cuộc.', expert: 'Thử thách OTP (CReq/CRes). Thử thách hoàn tất chuyển trách nhiệm gian lận sang ngân hàng phát hành.' },
      { name: 'Bộ máy cấp phép', standard: 'Kiểm tra tiền có đủ, khoanh giữ và trả lời website.', expert: 'Kiểm tra số dư và khoanh giữ trên CASA hoặc hạn mức tín dụng, rồi trả mã phản hồi 0110.' },
    ],
  },
  3: {
    title: 'Nộp tiền mặt qua ATM/CDM',
    blurb: 'Nộp tiền mặt tại máy nộp tiền trên vỉa hè: đếm tiền, ghi có vào tài khoản ngay tại chỗ.',
    steps: [
      { name: 'Máy nộp tiền mặt', standard: 'Khách đưa thẻ vào và nhập PIN.', expert: 'Đọc thẻ và xác minh PIN tại CDM (ba lần thử trước khi máy giữ thẻ).' },
      { name: 'Bộ kiểm tiền & hộp tiền', standard: 'Máy đếm tiền và kiểm tra tiền thật.', expert: 'Kiểm tra và đếm tiền; tiền mặt vào hộp tiền của máy (TK 1015 Tiền mặt ATM).' },
      { name: 'Tài khoản thanh toán của khách', standard: 'Tiền hiện ngay trong tài khoản của khách.', expert: 'Bút toán: Nợ 1015 Quỹ tiền mặt trong ATM / Có 2010 Tài khoản thanh toán của khách.' },
    ],
  },
  4: {
    title: 'Cuối ngày qua đêm',
    blurb: 'Chu kỳ ban đêm: mọi giao dịch được duyệt hôm nay được bù trừ với Visa, quyết toán và đối soát trước sáng mai.',
    steps: [
      { name: 'Đã duyệt hôm nay', standard: 'Mọi giao dịch thẻ được duyệt hôm nay chờ ca chạy đêm.', expert: 'Các khoản khoanh giữ đã cấp phép nhưng chưa quyết toán xếp hàng chờ giờ chốt lô 23:00.' },
      { name: 'Bù trừ theo lô', standard: 'Lúc 23:00 các giao dịch trong ngày được đóng gói vào một tệp bù trừ.', expert: 'Tạo tệp bù trừ (presentment) từ các lần cấp phép trong ngày.' },
      { name: 'Quyết toán Visa', standard: 'Visa tính ai nợ ai và tiền dịch chuyển.', expert: 'Quyết toán ròng của tổ chức thẻ; khoản khoanh giữ được ghi nhận: Nợ Khách hàng / Có Khoanh giữ CASA.' },
      { name: 'Đối soát 3 bên', standard: 'Ba bản ghi phải khớp; điều gì bất thường chờ trong tài khoản treo.', expert: 'Khớp sổ cái với tệp bù trừ và bộ chuyển mạch; sai lệch ghi vào RECON_SUSPENSE cho tới khi xử lý.' },
    ],
  },
  5: {
    title: 'Mở tài khoản eKYC',
    blurb: 'Khách mới mở tài khoản trên điện thoại: quét CCCD, chụp selfie, đối chiếu cơ sở dữ liệu dân cư, rồi sàng lọc cấm vận.',
    steps: [
      { name: 'Cổng eKYC & Định danh', standard: 'Ứng dụng đọc CCCD và kiểm tra ảnh selfie là người thật, khớp khuôn mặt.', expert: 'OCR CCCD, kiểm tra liveness thụ động, đối chiếu khuôn mặt với ảnh trong chip và tra cứu CSDL dân cư C06; thất bại là EKYC_LIVENESS_FAILED.' },
      { name: 'AML & Cấm vận', standard: 'Tên trong danh sách cấm vận, hoặc người có ảnh hưởng chính trị, được chuyên viên kiểm tra.', expert: 'So khớp mờ OFAC/PEP (Jaro-Winkler ≥ 85 là AML_SANCTION_MATCH); PEP bị giữ ở trạng thái STR_PENDING để rà soát.' },
      { name: 'Mở tài khoản', standard: 'Tài khoản được mở và khoản tiền gửi đầu tiên vào ngay.', expert: 'Ngân hàng lõi mở CASA: Nợ 1410 Quyết toán tức thì / Có 2010 Tài khoản của khách cho khoản tiền gửi mở tài khoản.' },
    ],
  },
  6: {
    title: 'Tiền mặt tại quầy & CTR',
    blurb: 'Tiền mặt qua quầy chi nhánh: đếm tiền, phát hiện tiền giả, và báo cáo mọi giao dịch tiền mặt trên $10,000.',
    steps: [
      { name: 'Quầy giao dịch viên', standard: 'Giao dịch viên đếm tiền, kiểm tra tiền giả và xem ngăn kéo có đủ tiền không.', expert: 'Đếm tiền theo quỹ quầy (TK 1012), ghi số seri tiền nghi giả (TELLER_SUSPECT_NOTE), lập CTR từ $10,000 trở lên.' },
      { name: 'Rà soát AML', standard: 'Tiền mặt bị chia nhỏ ngay dưới ngưỡng báo cáo được giữ lại cho chuyên viên.', expert: 'Phát hiện chia nhỏ giao dịch (smurfing): các lần nộp ≥ 80% ngưỡng CTR mà tổng vượt ngưỡng sẽ là STR_PENDING.' },
      { name: 'Tài khoản thanh toán của khách', standard: 'Tài khoản được ghi có, hoặc ghi nợ số tiền mặt đã chi.', expert: 'Nợ 1012 Quỹ tiền mặt tại quầy / Có 2010 Tài khoản của khách khi nộp; ngược lại khi rút.' },
    ],
  },
  7: {
    title: 'VietQR & FacePay',
    blurb: 'Thanh toán QR qua Napas247: mã được kiểm tra, giao dịch lớn cần quét khuôn mặt, và thiết bị được chấm điểm gian lận.',
    steps: [
      { name: 'Cổng QR Napas247', standard: 'Ngân hàng đọc mã QR đã quét và kiểm tra mã chưa bị sửa.', expert: 'Đọc EMVCo TLV (thẻ 38 GUID Napas + BIN, thẻ 54 số tiền), kiểm tra CRC-16 của thẻ 63, ánh xạ sang ISO 8583 0200.' },
      { name: 'Sinh trắc học FacePay', standard: 'Trên $400, khách phải quét khuôn mặt.', expert: 'Giao dịch trên 10 triệu VND cần khớp khuôn mặt ≥ 85% và liveness ≥ 80, nếu không là BIOMETRIC_AUTH_REQUIRED.' },
      { name: 'FDS & Dấu chân thiết bị', standard: 'Điện thoại đứng sau giao dịch được kiểm tra dấu hiệu gian lận.', expert: 'Tín hiệu IP bất thường, root/jailbreak và tần suất BIN; điểm ≥ 70 là FDS_HIGH_RISK_DEVICE. Sàng lọc AML tự động cũng chạy tại đây.' },
      { name: 'Rà soát AML', standard: 'Giao dịch bị gắn cờ chờ chuyên viên; phần lớn đi thẳng.', expert: 'Các mục STR_PENDING được rà soát rồi giải phóng hoặc chặn (AML_STR_BLOCKED).' },
      { name: 'Tài khoản thanh toán của khách', standard: 'Tiền rời tài khoản và tới cửa hàng ngay lập tức.', expert: 'Nợ 2010 Tài khoản của khách / Có 1410 Quyết toán thanh toán tức thì.' },
    ],
  },
  8: {
    title: 'SWIFT & Khiếu nại',
    blurb: 'Tiền gửi ra nước ngoài theo ISO 20022, sàng lọc cấm vận, và quầy khiếu nại xử lý hoàn trả và tra soát.',
    steps: [
      { name: 'Cổng SWIFT / ISO 20022', standard: 'Lệnh chuyển được viết theo định dạng quốc tế và quy đổi sang tiền tệ nước nhận.', expert: 'Kiểm tra pacs.008 (EndToEndId, mã BIC DbtrAgt/CdtrAgt, IntrBkSttlmAmt + loại tiền) và quy đổi ngoại tệ.' },
      { name: 'Sinh trắc học FacePay', standard: 'Giao dịch cỡ này cần khuôn mặt của khách.', expert: 'Trên 10 triệu VND: khớp khuôn mặt ≥ 85%, liveness ≥ 80, nếu không là BIOMETRIC_AUTH_REQUIRED.' },
      { name: 'FDS & Sàng lọc AML', standard: 'Thiết bị được chấm điểm và người thụ hưởng được đối chiếu danh sách cấm vận.', expert: 'Điểm thiết bị ≥ 70 là FDS_HIGH_RISK_DEVICE; chuyển tiền quốc tế lớn là STR_PENDING; trùng cấm vận bị phong tỏa.' },
      { name: 'Rà soát AML & Cấm vận', standard: 'Chuyên viên xác nhận trùng cấm vận hoặc giải phóng giao dịch bị giữ.', expert: 'Xác nhận trùng OFAC → AML_SANCTION_MATCH, tiền chuyển vào 2510 Tiền bị phong tỏa AML; nếu không thì lập STR hoặc giải phóng.' },
      { name: 'Tài khoản thanh toán của khách', standard: 'Khách bị ghi nợ và ngân hàng nước ngoài được thanh toán.', expert: 'Nợ 2010 Tài khoản của khách / Có 1430 Nostro tại ngân hàng đại lý (SWIFT).' },
      { name: 'Khiếu nại & Hoàn trả', standard: 'Nếu có sự cố, chuyên viên quyết định khiếu nại và hoàn tiền cho khách.', expert: 'Hoàn trả pacs.004, tra soát thẻ (thời hạn 120 ngày) hoặc lệch tiền ATM theo nhật ký điện tử.' },
    ],
  },
};

/** A flow's title and tooltip in the active language. */
export function flowText(id: FlowId): { title: string; blurb: string } {
  if (activeLocale() !== 'vi') return { title: GUIDED_FLOWS[id].title, blurb: GUIDED_FLOWS[id].blurb };
  return { title: FLOW_VI[id].title, blurb: FLOW_VI[id].blurb };
}

/** A step's name and one-line summaries in the active language. */
export function stepText(flow: FlowId, step: FlowStep): { name: string; summary: Record<DataDepth, string> } {
  if (activeLocale() !== 'vi') return { name: step.name, summary: step.summary };
  const i = GUIDED_FLOWS[flow].steps.indexOf(step);
  const w = FLOW_VI[flow].steps[i];
  return w ? { name: w.name, summary: { standard: w.standard, expert: w.expert } } : { name: step.name, summary: step.summary };
}

const STEP_STATUS_VI: Record<StepStatus, string> = { upcoming: 'Sắp tới', 'in-progress': 'Đang diễn ra', completed: 'Hoàn thành' };

/** The label of a step status in the active language. */
export const stepStatusLabel = (s: StepStatus): string => (activeLocale() === 'vi' ? STEP_STATUS_VI : STEP_STATUS_LABEL)[s];
