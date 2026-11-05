/**
 * The Knowledge Base's CIT & vault article: vault management, cash in transit, the four scenarios and their GL legs, cash fitness
 * sorting and the 4-eye controls of SBV Circular 01/2014/TT-NHNN. The account and journal tables are built from the engine, so the
 * article never drifts from the simulation.
 */

import type { Localized } from '../i18n/locale';
import { citAccount, CIT_ACCOUNTS, CIT_LIMITS, CIT_STRATEGIES, citOrder, dispatchEntry, receiptEntry, type CitEntry, type CitOrderInput } from '../sim/citEngine';
import { formatMoney } from '../sim/kpis';
import type { KbTable } from './amlKnowledge';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

export interface CitSection {
  /** Every CIT anchor starts with `cit-`, which is how a link finds the CIT tab. */
  id: `cit-${string}`;
  title: Localized<string>;
  paragraphs: readonly Localized<string>[];
  advanced: readonly Localized<string>[];
  table?: KbTable;
  rule?: Localized<string>;
  level?: 'advanced';
  flow?: readonly Localized<string>[];
}

const ROLE: Readonly<Record<(typeof CIT_ACCOUNTS)[number]['id'], Localized<string>>> = {
  VAULT: L('The branch strong room. Credited when cash leaves, debited when counted cash comes in.', 'Kho tiền chi nhánh. Ghi Có khi tiền xuất, ghi Nợ khi tiền đã kiểm đếm nhập kho.'),
  HQ_VAULT: L('The central vault: the same GL 1111, at another location.', 'Kho trung tâm: cùng TK 1111, tại địa điểm khác.'),
  TILL: L('The tellers’ working cash: the same GL 1111, in the counter tills. Surplus goes back to the vault and is sorted fit / unfit.', 'Quỹ nghiệp vụ của giao dịch viên: cùng TK 1111, trong ngăn kéo quầy. Tiền dư nộp về kho và được phân loại Fit / Unfit.'),
  UNFIT: L('Torn, soiled or mutilated notes sorted out at the count, held until they are surrendered to the SBV.', 'Tiền rách, bẩn, biến dạng được phân loại khi kiểm đếm, giữ đến khi nộp NHNN.'),
  ATM: L('The cash loaded in ATM and CDM cassettes.', 'Tiền trong hộp tiền ATM và CDM.'),
  SBV: L('The bank’s account at the State Bank: where surplus cash is deposited and holiday cash is drawn from.', 'Tài khoản của ngân hàng tại NHNN: nơi nộp tiền thừa và rút tiền dự phòng dịp lễ.'),
  TRANSIT: L('Cash on the road. Every run debits it on dispatch and credits it on delivery: it must be back to zero once the run is settled.', 'Tiền trên đường. Mỗi chuyến ghi Nợ khi xuất và ghi Có khi giao nhận: phải về 0 khi chuyến được tất toán.'),
  CORP: L('A corporate client’s deposit, credited provisionally on pickup and trued up to the count.', 'Tiền gửi của khách hàng DN, ghi Có tạm tính khi nhận túi và điều chỉnh theo kết quả kiểm đếm.'),
};

const ACCOUNTS: KbTable = {
  columns: [L('Account', 'Tài khoản'), L('Name', 'Tên'), L('Role in CIT', 'Vai trò trong CIT')],
  rows: CIT_ACCOUNTS.map((a) => [L(`TK ${a.code}`, `TK ${a.code}`), a.name, ROLE[a.id]]),
};

const leg = (e: CitEntry): Localized<string> => {
  const side = (vi: boolean) => e.lines.map((l) => `${l.dr > 0 ? (vi ? 'Nợ' : 'Dr') : vi ? 'Có' : 'Cr'} ${citAccount(l.account).code}`).join(' / ');
  return L(side(false), side(true));
};

const EXAMPLES: ReadonlyArray<{ input: CitOrderInput; trigger: Localized<string> }> = [
  { input: { scenario: 'ATM_CDM', direction: 'OUT', amountCents: 5_000_000 }, trigger: L(`ATM cash under ${formatMoney(CIT_LIMITS.atmMinCents)}, or a CDM cassette full`, `Tiền ATM dưới ${formatMoney(CIT_LIMITS.atmMinCents)}, hoặc hộp tiền CDM đầy`) },
  { input: { scenario: 'BRANCH_BALANCING', direction: 'OUT', amountCents: 200_000_000 }, trigger: L(`Branch vault over ${formatMoney(CIT_LIMITS.branchMaxCents)} at end of day, or a branch in deficit`, `Tồn quỹ chi nhánh vượt ${formatMoney(CIT_LIMITS.branchMaxCents)} cuối ngày, hoặc chi nhánh thiếu quỹ`) },
  { input: { scenario: 'DOORSTEP', direction: 'IN', amountCents: 30_000_000 }, trigger: L('Corporate bulk cash pickup (WinMart, Go!)', 'Thu tiền mặt số lượng lớn tại DN (WinMart, Go!)') },
  { input: { scenario: 'SBV', direction: 'OUT', amountCents: 80_000_000 }, trigger: L('Deposit surplus cash at the SBV', 'Nộp tiền thừa vào NHNN') },
  { input: { scenario: 'SBV', direction: 'IN', amountCents: 150_000_000 }, trigger: L('Withdraw cash before a holiday', 'Rút tiền mặt dự phòng trước dịp lễ') },
  { input: { scenario: 'TELLER', direction: 'IN', amountCents: 4_500_000, unfitBp: 250 }, trigger: L('Teller till over its float: surplus back to the vault, sorted', 'Ngăn kéo GDV vượt định mức: nộp dư về kho, phân loại') },
];

const SCENARIOS: KbTable = {
  columns: [L('Scenario', 'Nghiệp vụ'), L('Trigger', 'Điều kiện'), L('Dispatch', 'Xuất / nhận túi'), L('Delivery (count passed)', 'Giao nhận (kiểm đếm đạt)')],
  rows: EXAMPLES.map(({ input, trigger }) => {
    const o = citOrder(input);
    const s = CIT_STRATEGIES[o.scenario];
    return [L(`${s.icon} ${s.label.en} (${o.direction})`, `${s.icon} ${s.label.vi} (${o.direction === 'OUT' ? 'xuất' : 'nhập'})`), trigger, leg(dispatchEntry(o)), leg(receiptEntry(o))];
  }),
};

/** The CIT legal basis: the article's footer and the CIT flashcards. */
export const CIT_REF = L('SBV Circular 01/2014/TT-NHNN (cash receipt, storage and transport)', 'Thông tư 01/2014/TT-NHNN (giao nhận, bảo quản, vận chuyển tiền mặt)');

export const CIT_ARTICLE = {
  id: 'cit-vault',
  basis: CIT_REF,
  title: L('Vault management, cash in transit (CIT) and Circular 01/2014/TT-NHNN', 'Nghiệp vụ Quản lý Kho quỹ, Vận chuyển tiền mặt (CIT) & Tuân thủ Thông tư 01/2014/TT-NHNN'),
  intro: L(
    'Cash is the one asset a bank can lose by walking out of the door. Vault management keeps the right amount in the right place (the vault, the ATMs, HQ, the central bank); cash in transit moves it in sealed bags under dual control; and every step has a GL entry, so the books always say where the cash physically is.',
    'Tiền mặt là tài sản duy nhất ngân hàng có thể mất chỉ bằng một bước ra khỏi cửa. Quản lý kho quỹ giữ đúng lượng tiền ở đúng nơi (kho, ATM, Hội sở, NHNN); vận chuyển tiền mặt (CIT) di chuyển tiền trong túi niêm phong dưới sự kiểm soát hai người; và mỗi bước đều có bút toán, nên sổ sách luôn cho biết tiền thực sự đang ở đâu.',
  ),
  sections: [
    {
      id: 'cit-concept',
      title: L('1. The CIT lifecycle', '1. Vòng đời một chuyến CIT'),
      paragraphs: [
        L('A run is a state machine. EN_ROUTE: the cash leaves its source and sits in 1131 Cash in transit. ARRIVED: the receiving custodians check the seal against the manifest. IN_COUNT: the bag is opened and counted, and notes are sorted fit or unfit. DELIVERED: the count passes and the destination is debited, clearing 1131. SETTLED: transit is back to zero and the run is closed.', 'Mỗi chuyến là một máy trạng thái. EN_ROUTE: tiền rời nguồn và nằm ở TK 1131 Tiền đang chuyển. ARRIVED: thủ quỹ nơi nhận đối chiếu niêm phong với bảng kê. IN_COUNT: mở túi kiểm đếm, phân loại tiền đủ và không đủ tiêu chuẩn. DELIVERED: kiểm đếm đạt, ghi Nợ nơi nhận và tất toán 1131. SETTLED: tiền đang chuyển về 0 và chuyến được đóng.'),
        L('On the map, the Central Cash Vault card has gold cash lines to the teller, the ATM and the CIT loading bay under it: a 💵 glides OUT of the vault while cash leaves it (Cr 1111, orange) and IN while cash comes back (Dr 1111, gold). In 3D the vault is the great round steel door: it glows, its wheel spins, and cash streams between it and the teller, the ATM or the van. Click the door (or the card) for the live balances, the run, its seal and its journal.', 'Trên bản đồ, thẻ KHO QUỸ TRUNG TÂM có các đường tiền màu vàng nối tới quầy GDV, ATM và sảnh xe CIT bên dưới: biểu tượng 💵 chạy RA khỏi kho khi xuất tiền (Có 1111, màu cam) và chạy VÀO khi nhập tiền (Nợ 1111, màu vàng). Trong 3D, kho là cánh cửa thép tròn: cửa phát sáng, vô lăng quay và dòng tiền chạy giữa cửa kho với quầy GDV, ATM hoặc xe CIT. Bấm vào cửa (hoặc thẻ) để xem số dư, chuyến đang chạy, niêm phong và bút toán.'),
        L('One run at a time: a dispatch locks every CIT button until its run is SETTLED and the 3D van has left the bay and despawned. The lock releases the moment both are true.', 'Mỗi lần một chuyến: lệnh điều xe khóa mọi nút CIT cho đến khi chuyến được tất toán (SETTLED) và xe trong 3D đã rời sảnh, biến mất. Khóa mở ngay khi cả hai điều kiện đạt.'),
      ],
      advanced: [L('State pattern: each state owns its guard (the seal check at ARRIVED, the 1131 check before SETTLED) and its posting (dispatch on EN_ROUTE, receipt on DELIVERED), so a run can never post twice or skip the count.', 'Mẫu State: mỗi trạng thái giữ điều kiện chuyển (kiểm niêm phong tại ARRIVED, kiểm 1131 trước SETTLED) và bút toán của nó (xuất quỹ tại EN_ROUTE, nhập quỹ tại DELIVERED), nên một chuyến không bao giờ hạch toán hai lần hay bỏ qua kiểm đếm.')],
      flow: [L('EN_ROUTE: Dr 1131', 'EN_ROUTE: Nợ 1131'), L('ARRIVED: 4-eye seal check', 'ARRIVED: kiểm niêm phong 4 mắt'), L('IN_COUNT: count & sort', 'IN_COUNT: kiểm đếm & phân loại'), L('DELIVERED: Cr 1131', 'DELIVERED: Có 1131'), L('SETTLED: 1131 = 0', 'SETTLED: 1131 = 0')],
      rule: L('1131 is a bridge, never a home: every run that settles leaves it at zero.', 'TK 1131 là cầu nối, không phải nơi lưu trú: mọi chuyến đã tất toán đều đưa nó về 0.'),
    },
    {
      id: 'cit-accounts',
      title: L('2. The accounts', '2. Hệ thống tài khoản'),
      paragraphs: [L('The CIT book is the simulator’s own, with the account numbers of the CIT brief; 1111 is split by location (branch vault, HQ vault).', 'Sổ CIT là sổ riêng của mô phỏng, theo số hiệu tài khoản của đề bài CIT; TK 1111 được chia theo địa điểm (kho chi nhánh, kho trung tâm).')],
      advanced: [L('On the SBV chart of accounts for credit institutions the same ideas carry other numbers (cash at the unit, cash at ATMs, unfit cash awaiting processing, cash in transit, deposits at the SBV); the structure of the entries is the same.', 'Trong hệ thống tài khoản kế toán của tổ chức tín dụng do NHNN ban hành, các khái niệm này mang số hiệu khác (tiền mặt tại đơn vị, tiền mặt tại ATM, tiền không đủ tiêu chuẩn lưu thông chờ xử lý, tiền đang vận chuyển, tiền gửi tại NHNN); cấu trúc bút toán là như nhau.')],
      table: ACCOUNTS,
    },
    {
      id: 'cit-scenarios',
      title: L('3. The four scenarios and their entries', '3. Bốn nghiệp vụ và bút toán'),
      paragraphs: [
        L('Each scenario is one strategy: where the cash comes from, where it goes, and whether the vault sorts it on arrival. The legs are always the same shape: Dr 1131 / Cr source on dispatch, Dr destination / Cr 1131 on delivery.', 'Mỗi nghiệp vụ là một chiến lược: tiền đi từ đâu, đến đâu, và kho có phân loại khi nhận không. Hai vế luôn cùng dạng: Nợ 1131 / Có nguồn khi xuất, Nợ nơi nhận / Có 1131 khi giao nhận.'),
        L('Doorstep banking credits the client provisionally (Cr 4211) when the sealed bag is picked up; the count trues it up. A shortfall reverses part of the credit (Dr 4211), so the client is credited only with what was counted.', 'Thu tiền tận nơi ghi Có tạm tính cho khách (Có 4211) khi nhận túi niêm phong; kết quả kiểm đếm điều chỉnh lại. Nếu thiếu, phần thiếu được ghi đảo (Nợ 4211), nên khách chỉ được ghi Có số tiền thực đếm.'),
      ],
      advanced: [L('An SBV deposit can carry the unfit notes too: Dr 1131 / Cr 1111 and Cr 1112 on dispatch, Dr 1121 / Cr 1131 on delivery.', 'Khi nộp NHNN có thể nộp kèm tiền không đủ tiêu chuẩn: Nợ 1131 / Có 1111 và Có 1112 khi xuất, Nợ 1121 / Có 1131 khi giao nhận.')],
      table: SCENARIOS,
    },
    {
      id: 'cit-fitness',
      title: L('4. Cash fitness sorting', '4. Kiểm đếm & phân loại tiền tại kho'),
      paragraphs: [L('Cash coming back to the vault (CDM cassettes, corporate pickups) is counted and sorted. Notes fit for circulation stay in 1111 and go back out; torn, soiled or mutilated notes go to 1112 and wait to be surrendered to the State Bank. They must never be loaded into an ATM.', 'Tiền về kho (hộp tiền CDM, tiền thu tại DN) được kiểm đếm và phân loại. Tiền đủ tiêu chuẩn lưu thông ở lại TK 1111 và tiếp tục lưu thông; tiền rách, bẩn, biến dạng chuyển sang TK 1112 chờ nộp NHNN. Tuyệt đối không nạp vào ATM.')],
      advanced: [L(`In the simulator the unfit share of a count is drawn per run, in whole $10 notes; once 1112 holds ${formatMoney(CIT_LIMITS.unfitSurrenderCents)} or more it goes with the next SBV deposit.`, `Trong mô phỏng, tỷ lệ tiền không đủ tiêu chuẩn được sinh cho từng chuyến, theo tờ $10 nguyên; khi TK 1112 đạt từ ${formatMoney(CIT_LIMITS.unfitSurrenderCents)} trở lên sẽ được nộp kèm chuyến nộp NHNN tiếp theo.`)],
      rule: L('Fit stays in 1111; unfit goes to 1112 and only ever leaves for the SBV.', 'Tiền đủ tiêu chuẩn ở lại 1111; tiền không đủ tiêu chuẩn vào 1112 và chỉ rời kho để nộp NHNN.'),
    },
    {
      id: 'cit-controls',
      title: L('5. 4-eye controls and the seal', '5. Nguyên tắc 4 mắt và niêm phong'),
      paragraphs: [
        L('No one person ever handles cash alone. A bag is sealed with a numbered tamper-evident seal written on the manifest; on arrival two different custodians check the number and the seal’s condition and both sign. A wrong or broken seal stops the run: the incident is minuted and the bag is counted in full under dual control with the sender’s representative.', 'Không ai được một mình xử lý tiền mặt. Túi tiền được niêm phong bằng niêm phong có số seri ghi trên bảng kê; khi đến, hai thủ quỹ khác nhau đối chiếu số và tình trạng niêm phong, cùng ký nhận. Niêm phong sai hoặc rách làm dừng chuyến: lập biên bản và kiểm đếm toàn bộ dưới sự kiểm soát hai người, có đại diện bên giao.'),
      ],
      advanced: [L('The simulator enforces it in the state machine: ARRIVED → IN_COUNT is refused when the two custodians are the same person, and when the seal does not match until the incident is minuted.', 'Mô phỏng áp dụng trong máy trạng thái: ARRIVED → IN_COUNT bị từ chối khi hai thủ quỹ là cùng một người, và khi niêm phong không khớp cho đến khi lập biên bản.')],
      flow: [L('Seal number on the manifest', 'Số niêm phong trên bảng kê'), L('Custodian 1 checks', 'Thủ quỹ 1 kiểm tra'), L('Custodian 2 checks', 'Thủ quỹ 2 kiểm tra'), L('Both sign', 'Cả hai ký nhận'), L('Mismatch: minute, full count', 'Không khớp: lập biên bản, đếm toàn bộ')],
      rule: L('Two keys, two signatures, one seal number: that is the 4-eye principle.', 'Hai chìa khóa, hai chữ ký, một số niêm phong: đó là nguyên tắc 4 mắt.'),
      level: 'advanced',
    },
  ] satisfies readonly CitSection[],
} as const;
