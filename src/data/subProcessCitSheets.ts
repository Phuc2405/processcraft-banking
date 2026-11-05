/**
 * The four CIT child sub-processes under Flow 09 (the flow's own sheet `flow-9` is their parent): one sheet per demo the learner
 * can run (CIT_INFO_KEYS maps them). The GL lines are the CIT book's, so each sheet covers exactly what its demo posts.
 */

import { cr, dr, L, type SubProcessInfo } from './subProcessModel';
import type { CitInfoKey } from './subProcessKeys';
import type { SbvMode } from '../sim/citEngine';

/** What every CIT run shares: the custodians, the core ledger, Circular 01/2014 and the internal-control circular. */
const CUSTODIANS = { id: 'cit', duty: L('Two custodians carry and sign for the sealed cash (4-eye); the guard escorts.', 'Hai thủ quỹ áp tải và ký nhận tiền niêm phong (4 mắt); bảo vệ hộ tống.') } as const;
const LEDGER = { id: 'ledger', duty: L('Posts the dispatch and the receipt; TK 1131 must net to zero.', 'Hạch toán xuất và nhập quỹ; TK 1131 phải về 0.') } as const;
const LEGAL = ['circ-01-2014', 'circ-13-2018'] as const;
const LOCK = L('One run at a time: the next dispatch waits until this one is SETTLED and the van has left the bay.', 'Mỗi lần một chuyến: lệnh tiếp theo chờ chuyến này tất toán và xe rời sảnh.');

const sheet = (key: CitInfoKey, s: Omit<SubProcessInfo, 'key' | 'flow' | 'legal' | 'related' | 'place'> & { legal?: readonly string[] }): SubProcessInfo => ({
  ...s,
  key,
  flow: 9,
  legal: s.legal ?? LEGAL,
  related: ['flow-9', ...(['09-cit-atm', '09-cit-doorstep', '09-cit-sbv', '09-cit-teller-vault'] as const).filter((k) => k !== key)],
  place: 'MAIN_CASH_VAULT',
});

export const CIT_SHEETS: readonly SubProcessInfo[] = [
  sheet('09-cit-atm', {
    code: '09-CIT-ATM',
    icon: '🏧',
    mode: 'HYBRID',
    title: L('ATM/CDM Replenishment', 'Tiếp quỹ & Rút hộc tiền ATM / CDM'),
    overview: L(
      'The ATM monitor raises the run: cash under the minimum, or a CDM deposit cassette nearly full. The van carries sealed cassettes from the vault to the machine (Dr 1131 / Cr 1111) and loads them (Dr 1113 / Cr 1131); a full CDM cassette comes back the other way and is sorted fit / unfit at the vault.',
      'Hệ thống giám sát ATM kích hoạt chuyến: tiền dưới mức tối thiểu, hoặc hộc tiền nộp CDM gần đầy. Xe chở hộc tiền niêm phong từ kho ra máy (Nợ 1131 / Có 1111) và nạp vào máy (Nợ 1113 / Có 1131); hộc CDM đầy được rút về theo chiều ngược lại và phân loại Fit / Unfit tại kho.',
    ),
    actors: [
      { id: 'switch', duty: L('The ATM monitor flags low cash or a full CDM cassette.', 'Hệ thống giám sát ATM báo tiền thấp hoặc hộc CDM đầy.') },
      CUSTODIANS,
      { id: 'teller', duty: L('The vault keeper issues the cassettes and sorts what comes back.', 'Thủ kho xuất hộc tiền và phân loại tiền rút về.') },
      LEDGER,
    ],
    steps: [
      L('Trigger: ATM cash under $10,000, or the CDM cassette ≥ 95% full.', 'Kích hoạt: tiền ATM dưới $10,000, hoặc hộc CDM đầy ≥ 95%.'),
      L('Dispatch: Dr 1131 / Cr 1111 vault; the cassettes are sealed and both custodians sign.', 'Xuất quỹ: Nợ 1131 / Có 1111 kho; hộc tiền được niêm phong, hai thủ quỹ cùng ký.'),
      L('At the machine: seal checked, cassettes swapped, the counter reconciled.', 'Tại máy: kiểm niêm phong, thay hộc tiền, đối chiếu bộ đếm.'),
      L('Loaded: Dr 1113 ATM / Cr 1131; a CDM pickup posts Dr 1111 fit + Dr 1112 unfit / Cr 1131.', 'Nạp xong: Nợ 1113 ATM / Có 1131; rút hộc CDM ghi Nợ 1111 Fit + Nợ 1112 Unfit / Có 1131.'),
    ],
    impact: [L('Machines stay stocked, so customers are never turned away for cash.', 'Máy luôn đủ tiền, khách không bị từ chối rút tiền.'), LOCK],
    risks: [L('Unfit notes loaded into an ATM cause jams and complaints.', 'Nạp tiền không đủ tiêu chuẩn vào ATM gây kẹt tiền và khiếu nại.'), L('A cassette swapped without reconciling the counter hides a shortage.', 'Thay hộc tiền mà không đối chiếu bộ đếm sẽ che giấu thiếu hụt.')],
    gl: [dr('cit', 'TRANSIT'), cr('cit', 'VAULT'), dr('cit', 'ATM'), cr('cit', 'TRANSIT'), cr('cit', 'ATM'), dr('cit', 'VAULT'), dr('cit', 'UNFIT')],
    kpi: { sla: L('Machine back in service ≤ 65 min from dispatch', 'Máy hoạt động lại ≤ 65 phút từ lúc xuất phát'), strPct: null, note: L('Track cash-out minutes per ATM and unfit notes found in cassettes.', 'Theo dõi số phút hết tiền mỗi ATM và tiền Unfit trong hộc.') },
  }),
  sheet('09-cit-doorstep', {
    code: '09-CIT-DOOR',
    icon: '🏬',
    mode: 'MANUAL',
    title: L('Corporate Cash Pickup', 'Thu tiền mặt tận nơi cho Doanh nghiệp'),
    overview: L(
      'The van collects a retailer’s day takings in a sealed bag. The client is credited provisionally on pickup (Dr 1131 / Cr 4211); the vault counts the bag, sorts fit from unfit notes, and a shortfall reverses part of the credit, so the client is paid only for what was counted.',
      'Xe thu tiền doanh thu trong ngày của nhà bán lẻ trong túi niêm phong. Khách được ghi Có tạm tính khi nhận túi (Nợ 1131 / Có 4211); kho kiểm đếm, phân loại Fit / Unfit, phần thiếu được ghi đảo, nên khách chỉ được ghi Có số tiền thực đếm.',
    ),
    actors: [
      { id: 'merchant', duty: L('Hands over the sealed bag and the declared amount.', 'Bàn giao túi niêm phong và số tiền kê khai.') },
      CUSTODIANS,
      { id: 'teller', duty: L('Counts the bag at the vault and minutes any shortfall.', 'Kiểm đếm túi tại kho và lập biên bản nếu thiếu.') },
      LEDGER,
    ],
    steps: [
      L('Scheduled pickup at the client; the seal number goes on the manifest.', 'Thu theo lịch tại khách hàng; số niêm phong ghi trên bảng kê.'),
      L('Pickup: Dr 1131 / Cr 4211 provisional credit to the client.', 'Nhận túi: Nợ 1131 / Có 4211 ghi Có tạm tính cho khách.'),
      L('Arrival: two custodians check the seal; a broken seal is minuted and counted in full.', 'Về kho: hai thủ quỹ kiểm niêm phong; niêm phong rách phải lập biên bản và đếm toàn bộ.'),
      L('Count: Dr 1111 fit + Dr 1112 unfit, Dr 4211 any shortfall / Cr 1131.', 'Kiểm đếm: Nợ 1111 Fit + Nợ 1112 Unfit, Nợ 4211 phần thiếu / Có 1131.'),
    ],
    impact: [L('Retailers bank their takings the same day without carrying cash.', 'Doanh nghiệp nộp doanh thu trong ngày mà không phải tự vận chuyển tiền.'), LOCK],
    risks: [L('Crediting the declared amount instead of the counted one pays out cash that never arrived.', 'Ghi Có theo số kê khai thay vì số thực đếm là trả tiền chưa từng nhận.'), L('Large cash deposits must still pass AML and CTR screening.', 'Tiền mặt lớn vẫn phải qua sàng lọc AML và báo cáo CTR.')],
    gl: [dr('cit', 'TRANSIT'), cr('cit', 'CORP'), dr('cit', 'VAULT'), dr('cit', 'UNFIT'), dr('cit', 'CORP'), cr('cit', 'TRANSIT')],
    legal: [...LEGAL, 'law-14-2022'],
    kpi: { sla: L('Pickup → client credited ≤ 65 min (+15 min seal incident)', 'Nhận túi → ghi Có khách ≤ 65 phút (+15 phút sự cố niêm phong)'), strPct: null, note: L('Track shortfall rate per client and seal incidents.', 'Theo dõi tỷ lệ thiếu tiền mỗi khách và sự cố niêm phong.') },
  }),
  sheet('09-cit-sbv', {
    code: '09-CIT-SBV',
    icon: '🏦',
    mode: 'MANUAL',
    title: L('SBV Vault Operations', 'Nộp / Rút tiền mặt tại Ngân hàng Nhà nước (SBV)'),
    overview: L(
      'The State Bank of Vietnam (SBV) is the central bank: it issues the currency and holds the commercial banks’ settlement accounts. ProcessCraft is a commercial bank with its account at the SBV (TK 1121). The vault keeps its cash between a floor and a ceiling. A surplus goes to the State Bank with the unfit notes (Dr 1131 / Cr 1111 and Cr 1112, then Dr 1121 / Cr 1131); before a holiday the bank draws cash the other way (Dr 1131 / Cr 1121, then Dr 1111 / Cr 1131).',
      'Ngân hàng Nhà nước Việt Nam (NHNN, SBV) là ngân hàng trung ương: phát hành tiền và giữ tài khoản thanh toán của các ngân hàng thương mại. ProcessCraft là ngân hàng thương mại có tài khoản tại NHNN (TK 1121). Kho giữ tồn quỹ giữa mức sàn và mức trần. Tiền thừa được nộp NHNN cùng tiền không đủ tiêu chuẩn (Nợ 1131 / Có 1111 và Có 1112, rồi Nợ 1121 / Có 1131); trước dịp lễ ngân hàng rút tiền theo chiều ngược lại (Nợ 1131 / Có 1121, rồi Nợ 1111 / Có 1131).',
    ),
    actors: [
      { id: 'sbv', duty: L('Receives surplus and unfit notes; supplies holiday cash.', 'Nhận tiền thừa và tiền không đủ tiêu chuẩn; cấp tiền dịp lễ.') },
      CUSTODIANS,
      { id: 'ops', duty: L('Treasury sizes the run against the vault limits.', 'Ngân quỹ xác định số tiền theo hạn mức tồn quỹ.') },
      LEDGER,
    ],
    steps: [
      L('Deposit to the SBV when vault cash is over its $5.2M ceiling, or unfit notes (TK 1112) reach $10,000.', 'Nộp tiền về NHNN khi tồn quỹ vượt mức trần $5.2M, hoặc tiền không đủ tiêu chuẩn (TK 1112) đạt từ $10,000.'),
      L('Withdraw from the SBV when vault cash is under its $1M floor, or as a cash buffer before a holiday / Lunar New Year (Tet).', 'Rút tiền từ NHNN khi tồn quỹ dưới mức sàn $1M, hoặc để dự phòng tiền mặt trước dịp Lễ / Tết.'),
      L('Deposit: Dr 1131 / Cr 1111 surplus and Cr 1112 unfit notes.', 'Nộp: Nợ 1131 / Có 1111 tiền thừa và Có 1112 tiền không đủ tiêu chuẩn.'),
      L('At the SBV: counted and receipted, Dr 1121 / Cr 1131.', 'Tại NHNN: kiểm đếm và ký nhận, Nợ 1121 / Có 1131.'),
      L('Withdrawal: Dr 1131 / Cr 1121, then Dr 1111 / Cr 1131 at the vault.', 'Rút: Nợ 1131 / Có 1121, rồi Nợ 1111 / Có 1131 tại kho.'),
    ],
    impact: [L('Idle cash earns nothing and costs insurance: the SBV run keeps the vault lean.', 'Tiền nhàn rỗi không sinh lời và tốn phí bảo hiểm: chuyến NHNN giữ tồn quỹ hợp lý.'), LOCK],
    risks: [L('Unfit notes kept in the vault can slip back into circulation.', 'Tiền Unfit giữ lại trong kho có thể quay lại lưu thông.'), L('A holiday run sized too small leaves ATMs empty over the break.', 'Rút tiền dịp lễ quá ít khiến ATM hết tiền trong kỳ nghỉ.')],
    gl: [dr('cit', 'TRANSIT'), cr('cit', 'VAULT'), cr('cit', 'UNFIT'), dr('cit', 'SBV'), cr('cit', 'TRANSIT'), cr('cit', 'SBV'), dr('cit', 'VAULT')],
    kpi: { sla: L('Dispatch → receipted at the SBV ≤ 65 min', 'Xuất phát → NHNN ký nhận ≤ 65 phút'), strPct: null, note: L('Target: vault inside its band at every close; 1112 surrendered weekly.', 'Mục tiêu: tồn quỹ trong hạn mức mỗi cuối ngày; nộp 1112 hằng tuần.') },
  }),
  sheet('09-cit-teller-vault', {
    code: '09-CIT-TELLER',
    icon: '🗄️',
    mode: 'MANUAL',
    title: L('Teller Vault Balancing & Cash Fitness Sorting', 'Điều chuyển & Phân loại tiền quầy'),
    overview: L(
      'Cash moves between the tellers’ tills and the vault on foot, under dual control: a till over its float sends the surplus back (Dr 1131 / Cr 1111 till), and the vault counts it, keeping fit notes in 1111 and moving torn or soiled ones to 1112 to await the SBV.',
      'Tiền di chuyển giữa ngăn kéo GDV và kho bằng đường nội bộ, có kiểm soát kép: ngăn kéo vượt định mức nộp phần dư về kho (Nợ 1131 / Có 1111 quầy), kho kiểm đếm, giữ tiền Fit ở 1111 và chuyển tiền rách, bẩn sang 1112 chờ nộp NHNN.',
    ),
    actors: [
      { id: 'teller', duty: L('Counts the till surplus and hands it over with the slip.', 'Kiểm đếm tiền dư ngăn kéo và bàn giao kèm phiếu.') },
      CUSTODIANS,
      LEDGER,
    ],
    steps: [
      L('Trigger: the till is over its float (the $50,000 till cap is never exceeded).', 'Kích hoạt: ngăn kéo vượt định mức (không bao giờ vượt hạn mức $50,000).'),
      L('Hand-over: Dr 1131 / Cr 1111 till, both signatures on the slip.', 'Bàn giao: Nợ 1131 / Có 1111 quầy, hai chữ ký trên phiếu.'),
      L('Sort at the vault: fit notes stay in circulation, unfit notes are set aside.', 'Phân loại tại kho: tiền Fit tiếp tục lưu thông, tiền Unfit được tách riêng.'),
      L('Receipt: Dr 1111 vault (fit) + Dr 1112 (unfit) / Cr 1131.', 'Nhập kho: Nợ 1111 kho (Fit) + Nợ 1112 (Unfit) / Có 1131.'),
    ],
    impact: [L('A lean till caps the loss from a robbery or a miscount.', 'Ngăn kéo gọn nhẹ giới hạn tổn thất khi bị cướp hoặc đếm sai.'), LOCK],
    risks: [L('A single-person transfer breaks dual control.', 'Chuyển tiền một người vi phạm kiểm soát kép.'), L('Unfit notes paid back out at the counter.', 'Tiền Unfit bị chi trả lại tại quầy.')],
    gl: [dr('cit', 'TRANSIT'), cr('cit', 'TILL'), dr('cit', 'VAULT'), dr('cit', 'UNFIT'), cr('cit', 'TRANSIT')],
    kpi: { sla: L('Surplus in the vault before the next customer is served', 'Tiền dư vào kho trước khi phục vụ khách tiếp theo'), strPct: null, note: L('Track unfit share per till and till-over-float minutes.', 'Theo dõi tỷ lệ Unfit mỗi ngăn kéo và số phút vượt định mức.') },
  }),
];

/** Who is who in an SBV run: the central bank and the commercial bank that banks with it. */
export const SBV_DOMAIN = {
  centralBank: L('State Bank of Vietnam (SBV): the central bank. It issues the currency and holds the commercial banks’ settlement accounts.', 'Ngân hàng Nhà nước Việt Nam (NHNN, SBV): ngân hàng trung ương, phát hành tiền và giữ tài khoản thanh toán của các ngân hàng thương mại.'),
  commercialBank: L('ProcessCraft Bank: a commercial bank. It keeps its own vault and its settlement account at the SBV (TK 1121).', 'Ngân hàng ProcessCraft: ngân hàng thương mại, tự quản lý kho quỹ và có tài khoản thanh toán tại NHNN (TK 1121).'),
} as const;

const SBV_BASE = CIT_SHEETS.find((c) => c.key === '09-cit-sbv')!;

/**
 * The SBV sheet for one case of the drawer's toggle (🟢 Nộp tiền / 🔴 Rút tiền): all six sections (overview, SOP, impact, risks,
 * GL & legal, KPI) are that case's own. The code, actors and links stay the parent sheet's.
 */
export const SBV_CASE_SHEETS: Readonly<Record<SbvMode, SubProcessInfo>> = {
  DEPOSIT: {
    ...SBV_BASE,
    overview: L(
      'Deposit case: ProcessCraft, a commercial bank, carries its surplus cash and its unfit notes to the State Bank of Vietnam, the central bank, which credits the bank’s settlement account (TK 1121). The vault comes back inside its band and the unfit notes leave circulation.',
      'Case Nộp tiền: ProcessCraft (ngân hàng thương mại) vận chuyển tiền thừa và tiền không đủ tiêu chuẩn lưu thông đến Ngân hàng Nhà nước (ngân hàng trung ương), NHNN ghi Có tài khoản thanh toán của ngân hàng (TK 1121). Tồn quỹ trở về trong hạn mức và tiền rách nát được rút khỏi lưu thông.',
    ),
    steps: [
      L('Trigger: vault cash over its $5.2M ceiling, or unfit notes (TK 1112) at $10,000 or more.', 'Kích hoạt: tồn quỹ vượt mức trần $5.2M, hoặc tiền không đủ tiêu chuẩn (TK 1112) từ $10,000.'),
      L('Treasury sizes the run; the notes are counted, bundled by denomination and sealed under dual control.', 'Ngân quỹ xác định số tiền; tiền được kiểm đếm, đóng bó theo mệnh giá và niêm phong dưới kiểm soát kép.'),
      L('Dispatch: Dr 1131 / Cr 1111 surplus and Cr 1112 unfit notes; both custodians sign the manifest.', 'Xuất quỹ: Nợ 1131 / Có 1111 tiền thừa và Có 1112 tiền không đủ tiêu chuẩn; hai thủ quỹ ký bảng kê.'),
      L('At the SBV: the seal is checked, the cash counted and receipted.', 'Tại NHNN: kiểm niêm phong, kiểm đếm và ký nhận.'),
      L('Settled: Dr 1121 deposit at the SBV / Cr 1131; TK 1131 back to zero.', 'Tất toán: Nợ 1121 tiền gửi tại NHNN / Có 1131; TK 1131 về 0.'),
    ],
    impact: [
      L('Idle cash moves to the central bank, where it counts for the bank’s reserves instead of costing vault insurance.', 'Tiền nhàn rỗi chuyển về ngân hàng trung ương, được tính vào dự trữ thay vì tốn phí bảo hiểm kho.'),
      L('Unfit notes leave circulation, so the counters and ATMs only pay out fit cash.', 'Tiền không đủ tiêu chuẩn được rút khỏi lưu thông, quầy và ATM chỉ chi tiền đủ tiêu chuẩn.'),
      SBV_BASE.impact[1]!,
    ],
    risks: [
      L('A deposit that leaves the vault under its floor makes tomorrow’s withdrawals short.', 'Nộp quá tay khiến tồn quỹ dưới mức sàn, ngày mai thiếu tiền chi trả.'),
      L('Unfit notes kept back slip into circulation and draw an SBV finding.', 'Giữ lại tiền không đủ tiêu chuẩn khiến chúng quay lại lưu thông và bị NHNN lập biên bản.'),
      L('A seal broken in transit must be minuted and the bag counted in full at the SBV.', 'Niêm phong rách trên đường phải lập biên bản và kiểm đếm toàn bộ tại NHNN.'),
    ],
    gl: [dr('cit', 'TRANSIT'), cr('cit', 'VAULT'), cr('cit', 'UNFIT'), dr('cit', 'SBV'), cr('cit', 'TRANSIT')],
    kpi: {
      sla: L('Dispatch → receipted at the SBV ≤ 65 min', 'Xuất phát → NHNN ký nhận ≤ 65 phút'),
      strPct: null,
      note: L('Target: vault inside its band at every close; TK 1112 surrendered at least weekly.', 'Mục tiêu: tồn quỹ trong hạn mức mỗi cuối ngày; TK 1112 nộp ít nhất hằng tuần.'),
    },
  },
  WITHDRAW: {
    ...SBV_BASE,
    overview: L(
      'Withdrawal case: ProcessCraft, a commercial bank, draws cash from its settlement account at the State Bank of Vietnam, the central bank, when the vault falls under its floor or ahead of a holiday / Tet. The SBV debits TK 1121 and the van brings the cash back to the vault.',
      'Case Rút tiền: ProcessCraft (ngân hàng thương mại) rút tiền mặt từ tài khoản thanh toán tại Ngân hàng Nhà nước (ngân hàng trung ương) khi tồn quỹ dưới mức sàn hoặc trước dịp Lễ / Tết. NHNN ghi Nợ TK 1121 và xe chở tiền về kho.',
    ),
    steps: [
      L('Trigger: vault cash under its $1M floor, or a cash buffer before a holiday / Lunar New Year (Tet).', 'Kích hoạt: tồn quỹ dưới mức sàn $1M, hoặc dự phòng tiền mặt trước dịp Lễ / Tết.'),
      L('Treasury books the withdrawal with the SBV by denomination, against the TK 1121 balance.', 'Ngân quỹ đăng ký rút tiền với NHNN theo cơ cấu mệnh giá, trong số dư TK 1121.'),
      L('At the SBV: the cash is counted and sealed; Dr 1131 / Cr 1121.', 'Tại NHNN: kiểm đếm và niêm phong; Nợ 1131 / Có 1121.'),
      L('Back at the vault: two custodians check the seal and count the bags.', 'Về kho: hai thủ quỹ kiểm niêm phong và kiểm đếm.'),
      L('Settled: Dr 1111 vault / Cr 1131; TK 1131 back to zero.', 'Tất toán: Nợ 1111 kho / Có 1131; TK 1131 về 0.'),
    ],
    impact: [
      L('The counters and ATMs keep paying out through a holiday rush.', 'Quầy và ATM vẫn chi trả đủ trong cao điểm dịp lễ.'),
      L('A vault back over its floor keeps the branch inside the SBV’s liquidity rules.', 'Tồn quỹ trở lại trên mức sàn giữ chi nhánh trong quy định thanh khoản của NHNN.'),
      SBV_BASE.impact[1]!,
    ],
    risks: [
      L('A holiday run sized too small leaves ATMs empty over the break.', 'Rút tiền dịp lễ quá ít khiến ATM hết tiền trong kỳ nghỉ.'),
      L('Over-withdrawing parks cash in the vault, raising insurance and robbery exposure.', 'Rút quá nhiều làm tồn quỹ cao, tăng phí bảo hiểm và rủi ro mất cướp.'),
      L('Cash on the road is the most exposed: armoured van, escort and sealed bags are mandatory.', 'Tiền trên đường là khâu rủi ro nhất: bắt buộc xe chuyên dùng, hộ tống và túi niêm phong.'),
    ],
    gl: [dr('cit', 'TRANSIT'), cr('cit', 'SBV'), dr('cit', 'VAULT'), cr('cit', 'TRANSIT')],
    kpi: {
      sla: L('Booking → cash in the vault ≤ 65 min on the day', 'Đăng ký → tiền nhập kho ≤ 65 phút trong ngày'),
      strPct: null,
      note: L('Target: no ATM cash-out over the holiday; vault back over its floor before opening.', 'Mục tiêu: không ATM nào hết tiền dịp lễ; tồn quỹ trên mức sàn trước giờ mở cửa.'),
    },
  },
};
