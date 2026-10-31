/**
 * The Knowledge Base's retail tab: 11 guides, one per retail theme. Each guide is a plain intro (Basic), a legal and technical
 * foundation (Advanced), and the retail queue scenarios it covers. The SOP steps, triggers and the approve / reject risks are
 * not repeated here: they are the queue's own copy (analystWorkspace.messages.ts `retail_<id>_*`), so the guide and the case
 * the learner works can never disagree. A Registry: one entry per guide, looked up by its anchor.
 */

import type { Localized } from '../i18n/locale';
import { RETAIL_SCENARIOS, type RetailScenarioId } from '../sim/staffRoleplay';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

export interface RetailGuide {
  /** Every retail anchor starts with `retail`, which is how a link finds the retail tab. */
  id: `retail-${string}`;
  title: Localized<string>;
  /** Basic (Cơ bản): what it is and why it matters, in plain words. */
  intro: Localized<string>;
  /** Advanced (Chuyên sâu): the rules and the accounting behind it. */
  foundation: Localized<string>;
  /** The queue scenarios it covers: their SOPs and decision trees are drawn from the queue's copy. */
  scenarios: readonly RetailScenarioId[];
  keywords: readonly string[];
}

export const RETAIL_GUIDES: readonly RetailGuide[] = [
  {
    id: 'retail-fees',
    title: L('1. Annual card fees & account maintenance charges', '1. Phí thường niên thẻ & phí duy trì tài khoản'),
    intro: L(
      'Cards and accounts carry yearly or monthly fees. If the balance is short, the fee can still be taken, pushing the account into an agreed overdraft, but never beyond the overdraft limit.',
      'Thẻ và tài khoản có phí thường niên hoặc phí duy trì hằng tháng. Nếu số dư không đủ, phí vẫn có thể được thu và làm tài khoản thấu chi trong hạn mức đã thỏa thuận, nhưng không bao giờ vượt hạn mức thấu chi.',
    ),
    foundation: L(
      'Fees must be on the published tariff and in the customer’s contract. The covered part is Dr 2011 CASA, the shortfall Dr 1310 Overdraft receivables, against Cr 4510 Fee income. A fee that would breach the limit is held, not forced through.',
      'Phí phải có trong biểu phí công bố và hợp đồng với khách hàng. Phần số dư đủ trả ghi Nợ 2011 CASA, phần thiếu ghi Nợ 1310 Phải thu thấu chi, đối ứng Có 4510 Thu phí. Khoản phí làm vượt hạn mức thì tạm giữ, không ép thu.',
    ),
    scenarios: ['ANNUAL_FEE'],
    keywords: ['phi thuong nien', 'annual fee', 'maintenance fee', 'phi duy tri', 'overdraft', 'thau chi', 'so du am'],
  },
  {
    id: 'retail-autopay',
    title: L('2. Utility Bill Pay & Direct Debit: NSF penalties', '2. Ủy nhiệm thu tự động & phí không đủ số dư (NSF)'),
    intro: L(
      'A direct debit pays a bill automatically on its due date. If the account cannot cover the bill, the payment is returned unpaid and a small NSF (non-sufficient funds) fee is charged.',
      'Ủy nhiệm thu tự động thanh toán hóa đơn vào ngày đến hạn. Nếu tài khoản không đủ tiền, lệnh bị trả lại không thanh toán và khách hàng chịu một khoản phí nhỏ do không đủ số dư (NSF).',
    ),
    foundation: L(
      'A collection is executed only on available funds under the customer’s mandate: paid as Dr 2011 / Cr 2460 Biller payable; returned unpaid with the NSF fee Dr 2011 (or 1310) / Cr 4520 Penalty income. Never pay a bill partly out of an unauthorised overdraft.',
      'Lệnh thu chỉ được thực hiện khi đủ số dư theo ủy quyền của khách hàng: thanh toán ghi Nợ 2011 / Có 2460 Phải trả nhà cung cấp; trả lại kèm phí NSF ghi Nợ 2011 (hoặc 1310) / Có 4520 Thu phạt. Không thanh toán một phần hóa đơn bằng thấu chi chưa được cấp.',
    ),
    scenarios: ['AUTO_PAY'],
    keywords: ['auto pay', 'direct debit', 'uy nhiem thu', 'nsf', 'khong du so du', 'hoa don', 'bill'],
  },
  {
    id: 'retail-rewards',
    title: L('3. POS cashback & loyalty points redemption', '3. Hoàn tiền POS & đổi điểm thưởng'),
    intro: L(
      'Card spending earns cashback (1–5% by merchant category) or points. Cash-like spending (ATM, money transfer, gambling-type codes) and reversed purchases earn nothing, and points can pay a fee only when the balance covers it.',
      'Chi tiêu bằng thẻ được hoàn tiền (1–5% theo nhóm ngành hàng) hoặc tích điểm. Giao dịch tương đương tiền mặt (rút ATM, chuyển tiền, các mã ngành loại trừ) và giao dịch đã hoàn trả không được thưởng; điểm chỉ dùng trả phí khi đủ số điểm.',
    ),
    foundation: L(
      'The reward is the bank’s cost: Dr 5410 Rewards expense / Cr 2011 CASA (cashback) or Cr 2450 Loyalty liability (points). Redeeming points against a fee is Dr 2450 / Cr 4510. Eligibility is by MCC and settlement status, never by the amount alone.',
      'Tiền thưởng là chi phí của ngân hàng: Nợ 5410 Chi phí khuyến mại / Có 2011 CASA (hoàn tiền) hoặc Có 2450 Nợ phải trả điểm thưởng (tích điểm). Dùng điểm trả phí ghi Nợ 2450 / Có 4510. Điều kiện hưởng dựa trên mã MCC và trạng thái quyết toán, không chỉ dựa vào số tiền.',
    ),
    scenarios: ['CASHBACK', 'POINTS_WAIVER'],
    keywords: ['cashback', 'hoan tien', 'loyalty', 'diem thuong', 'mcc', 'rewards', 'doi diem'],
  },
  {
    id: 'retail-atm',
    title: L('4. ATM domestic interbank fees (NAPAS), cash jams & low cassettes', '4. Phí ATM liên ngân hàng, kẹt tiền & cảnh báo hết tiền'),
    intro: L(
      'Withdrawing at another bank’s ATM costs a network fee on top of the cash. If the machine jams, the money goes to a holding (suspense) account until the cash count shows what happened. When a cassette runs low, the ATM still pays out but raises a refill alert.',
      'Rút tiền tại ATM ngân hàng khác phải trả thêm phí mạng lưới. Nếu máy kẹt tiền, số tiền được chuyển vào tài khoản treo cho đến khi kiểm quỹ xác định sự việc. Khi hộp tiền sắp hết, ATM vẫn chi tiền nhưng phát cảnh báo tiếp quỹ.',
    ),
    foundation: L(
      'Interbank: Dr 2011 (cash + fee), Dr 5420 Switch fee expense / Cr 1510 Interbank settlement, Cr 4510 Fee income. A jam refund goes through ATM settlement suspense: Dr 1910 / Cr 2011 once the electronic journal shows the notes were retracted. In this simulator the ATM suspense account is 1910 (2930 is frozen AML funds).',
      'Liên ngân hàng: Nợ 2011 (tiền rút + phí), Nợ 5420 Chi phí chuyển mạch / Có 1510 Thanh toán liên ngân hàng, Có 4510 Thu phí. Hoàn tiền kẹt máy đi qua tài khoản treo ATM: Nợ 1910 / Có 2011 khi nhật ký điện tử xác nhận tiền đã bị thu hồi. Trong mô phỏng này tài khoản treo ATM là 1910 (2930 là tiền phong tỏa AML).',
    ),
    scenarios: ['ATM_INTERBANK', 'ATM_JAM', 'ATM_LOW_CASH', 'CARD_CAPTURED'],
    keywords: ['atm', 'napas', 'switch fee', 'phi lien ngan hang', 'ket tien', 'cash jam', 'suspense', 'tai khoan treo', 'het tien', 'cassette'],
  },
  {
    id: 'retail-waterfall',
    title: L('5. BNPL & credit debt recovery waterfall', '5. Thu hồi nợ BNPL & thứ tự cấn trừ (waterfall)'),
    intro: L(
      'When a borrower pays part of an overdue debt, the money is applied in a fixed order: first late penalty fees, then overdue interest, and only then the principal.',
      'Khi khách hàng trả một phần khoản nợ quá hạn, tiền được phân bổ theo thứ tự cố định: trước hết là phí phạt trễ hạn, sau đó lãi quá hạn, cuối cùng mới đến nợ gốc.',
    ),
    foundation: L(
      'The waterfall is a Strategy the allocator must follow: Dr 2011 / Cr 4530 Late penalty income, Cr 4110 Interest income, Cr 1320 Loan principal, in that order. A principal-first allocation understates income and misreports the ageing of the debt.',
      'Thứ tự cấn trừ là quy tắc bắt buộc: Nợ 2011 / Có 4530 Thu phạt trễ hạn, Có 4110 Thu lãi, Có 1320 Nợ gốc, đúng thứ tự đó. Phân bổ gốc trước làm thu nhập bị ghi nhận thấp và phản ánh sai tuổi nợ.',
    ),
    scenarios: ['DEBT_WATERFALL'],
    keywords: ['bnpl', 'waterfall', 'thu hoi no', 'can tru', 'phi phat', 'lai qua han', 'no goc', 'debt recovery'],
  },
  {
    id: 'retail-term-deposit',
    title: L('6. Term deposit early settlement, pledges & auto-liquidation', '6. Tất toán tiền gửi trước hạn, cầm cố & tự động cấn trừ'),
    intro: L(
      'Withdrawing a term deposit early loses the contract rate: interest is recalculated at the demand rate (0.1% a year). A deposit can also secure an overdraft (pledged, up to 90% loan-to-value) and is used to repay it only once the overdraft is 90 days overdue.',
      'Rút tiền gửi có kỳ hạn trước hạn sẽ mất lãi suất hợp đồng: lãi được tính lại theo lãi suất không kỳ hạn (0,1%/năm). Tiền gửi cũng có thể cầm cố cho khoản thấu chi (tối đa 90% giá trị) và chỉ được cấn trừ khi khoản thấu chi quá hạn từ 90 ngày.',
    ),
    foundation: L(
      'Early break: Dr 2021 Term deposit, Dr 5110 Interest expense (demand rate) / Cr 2011. Pledge: Dr 2021 / Cr 2022 Pledged TD. Set-off on default: Dr 2022 / Cr 1310 Overdraft receivables, Cr 2011 for the surplus. Setting off before default breaches the pledge terms.',
      'Tất toán trước hạn: Nợ 2021 Tiền gửi có kỳ hạn, Nợ 5110 Chi phí lãi (lãi không kỳ hạn) / Có 2011. Cầm cố: Nợ 2021 / Có 2022 Tiền gửi cầm cố. Cấn trừ khi vỡ nợ: Nợ 2022 / Có 1310 Phải thu thấu chi, Có 2011 phần dư. Cấn trừ trước khi vỡ nợ là vi phạm điều khoản cầm cố.',
    ),
    scenarios: ['TD_EARLY_BREAK', 'TD_PLEDGE', 'TD_LIQUIDATION'],
    keywords: ['term deposit', 'tien gui co ky han', 'tat toan truoc han', 'early break', 'cam co', 'pledge', 'ltv', 'can tru'],
  },
  {
    id: 'retail-wallet-qr',
    title: L('7. e-Wallet & Dynamic QR (MoMo / VietQR)', '7. Ví điện tử & thanh toán tức thời VietQR'),
    intro: L(
      'Topping up or cashing out a wallet (MoMo, ZaloPay, Apple Pay) moves money between the bank account and the wallet provider. A dynamic VietQR payment settles in seconds, so the payee name must match before it is sent.',
      'Nạp hoặc rút tiền ví điện tử (MoMo, ZaloPay, Apple Pay) chuyển tiền giữa tài khoản ngân hàng và đơn vị ví. Thanh toán VietQR động được quyết toán trong vài giây, nên tên người nhận phải khớp trước khi chuyển.',
    ),
    foundation: L(
      'Wallet top-up: Dr 2011 / Cr 2410 Wallet settlement (reversed for a cash-out), within the daily cap and only to a wallet in the account holder’s own name. Instant QR: Dr 2011 / Cr 1510, after the CRC check and a name lookup that matches the QR merchant.',
      'Nạp ví: Nợ 2011 / Có 2410 Thanh toán ví điện tử (ngược lại khi rút ví), trong hạn mức ngày và chỉ tới ví đứng tên chính chủ. QR tức thời: Nợ 2011 / Có 1510, sau khi kiểm tra mã CRC và tra cứu tên khớp với đơn vị trên mã QR.',
    ),
    scenarios: ['WALLET', 'RTP_QR'],
    keywords: ['vi dien tu', 'momo', 'zalopay', 'apple pay', 'vietqr', 'qr', 'instant payment', 'thanh toan tuc thoi', 'wallet'],
  },
  {
    id: 'retail-eod-recon',
    title: L('8. EOD interbank reconciliation breaks & clearing suspense', '8. Lệch đối soát liên ngân hàng cuối ngày & tài khoản treo bù trừ'),
    intro: L(
      'Every night the bank compares its books with the payment network’s settlement file. A payment the bank debited but the network never settled is a break: it is parked in a holding account and investigated.',
      'Mỗi đêm ngân hàng đối chiếu sổ sách với file quyết toán của mạng thanh toán. Khoản ngân hàng đã trừ tiền nhưng mạng chưa quyết toán là một khoản lệch: được treo vào tài khoản chờ và điều tra.',
    ),
    foundation: L(
      'Match the core postings against pacs.002 and the the domestic switch (NAPAS) EOD file: only ACSC items listed are settled. A break is Dr 1510 / Cr 2912 Clearing suspense, then refunded or re-sent; 2912 must drain to zero, and ageing items are escalated.',
      'Đối chiếu bút toán core với pacs.002 và file quyết toán cuối ngày của NAPAS: chỉ giao dịch ACSC có trong file mới là đã quyết toán. Khoản lệch ghi Nợ 1510 / Có 2912 Treo bù trừ, sau đó hoàn tiền hoặc chuyển lại; TK 2912 phải về 0 và khoản treo lâu ngày phải báo cáo cấp trên.',
    ),
    scenarios: ['CLEARING_BREAK'],
    keywords: ['eod', 'reconciliation', 'doi soat', 'clearing suspense', 'treo bu tru', 'napas', 'pacs.002', 'lech'],
  },
  {
    id: 'retail-npl',
    title: L('9. NPL debt classification (5 groups) & loss provisioning', '9. Phân loại nợ (5 nhóm) & trích lập dự phòng rủi ro'),
    intro: L(
      'Each month loans are sorted into five groups by how late they are, from group 1 (on time) to group 5 (likely lost). Groups 3 to 5 are non-performing loans (NPLs), and the bank sets money aside for them.',
      'Hằng tháng các khoản vay được xếp vào năm nhóm theo mức độ quá hạn, từ nhóm 1 (đúng hạn) đến nhóm 5 (có khả năng mất vốn). Nhóm 3 đến 5 là nợ xấu (NPL) và ngân hàng phải trích lập dự phòng.',
    ),
    foundation: L(
      'Circular 11/2021/TT-NHNN: group 1 under 10 days past due, 2 from 10, 3 from 90, 4 from 180, 5 from 360 days; specific provision 0 / 5 / 20 / 50 / 100% of the outstanding net of eligible collateral, plus a 0.75% general provision. Posting: Dr 5610 Provisioning expense / Cr 1290 Credit loss allowance (a contra-asset that nets against the loans). Basel II links the same idea to expected loss (PD × LGD × EAD).',
      'Thông tư 11/2021/TT-NHNN: nhóm 1 quá hạn dưới 10 ngày, nhóm 2 từ 10 ngày, nhóm 3 từ 90, nhóm 4 từ 180, nhóm 5 từ 360 ngày; dự phòng cụ thể 0 / 5 / 20 / 50 / 100% dư nợ sau khi trừ giá trị tài sản bảo đảm được khấu trừ, cộng dự phòng chung 0,75%. Hạch toán: Nợ 5610 Chi phí dự phòng / Có 1290 Dự phòng rủi ro tín dụng (tài khoản điều chỉnh giảm khoản cho vay). Basel II gắn cùng ý tưởng với tổn thất dự kiến (PD × LGD × EAD).',
    ),
    scenarios: ['NPL_PROVISION'],
    keywords: ['npl', 'no xau', 'phan loai no', 'nhom no', 'du phong', 'provision', 'basel', '11/2021', 'trich lap'],
  },
  {
    id: 'retail-fx',
    title: L('10. FX spread & volatility spikes: holding SWIFT messages', '10. Chênh lệch tỷ giá & biến động mạnh: tạm giữ điện SWIFT'),
    intro: L(
      'The bank earns a small spread on every currency exchange. If the rate jumps by more than 2% between the customer’s order and the payment, the SWIFT message is held and the customer gets a new quote.',
      'Ngân hàng thu một khoản chênh lệch nhỏ trên mỗi giao dịch đổi ngoại tệ. Nếu tỷ giá biến động quá 2% giữa lúc khách đặt lệnh và lúc thanh toán, điện SWIFT bị tạm giữ và khách hàng được báo giá lại.',
    ),
    foundation: L(
      'The deal rate includes the spread (booked as fee income); at release it is compared with treasury’s live rate. Beyond ±2% the MT103 is held (volatility breach) and re-confirmed; inside the band it goes out as Dr 2011 / Cr 1520 Nostro. Paying out at a stale rate is an open FX loss.',
      'Tỷ giá giao dịch đã gồm chênh lệch (ghi nhận thu phí); khi giải phóng điện được so với tỷ giá trực tuyến của Nguồn vốn. Vượt ±2% thì tạm giữ MT103 (vượt ngưỡng biến động) và xác nhận lại; trong ngưỡng thì chuyển đi với bút toán Nợ 2011 / Có 1520 Nostro. Thanh toán theo tỷ giá đã lỗi thời là chịu lỗ tỷ giá.',
    ),
    scenarios: ['FX_VOLATILITY'],
    keywords: ['fx', 'ty gia', 'spread', 'chenh lech ty gia', 'volatility', 'bien dong', 'swift', 'mt103', 'ngoai te'],
  },
  {
    id: 'retail-ekyc-risk',
    title: L('11. Retail eKYC & customer risk profiling', '11. eKYC khách hàng cá nhân & xếp hạng rủi ro'),
    intro: L(
      'Opening an account online (eKYC) checks the ID document and the customer’s face. The bank then rates the customer low, medium or high risk, which decides how closely it watches them.',
      'Mở tài khoản trực tuyến (eKYC) kiểm tra giấy tờ tùy thân và khuôn mặt khách hàng. Sau đó ngân hàng xếp khách hàng vào mức rủi ro thấp, trung bình hoặc cao, từ đó quyết định mức độ theo dõi.',
    ),
    foundation: L(
      'eKYC account opening is allowed under the State Bank’s rules (Circular 16/2020/TT-NHNN onwards): chip-ID reading, face matching and liveness. The risk rating follows the risk-based approach: a PEP, a FATF high-risk country or a score of 70+ is high risk, needing senior approval, EDD and a 6-monthly review.',
      'Mở tài khoản bằng eKYC được phép theo quy định của Ngân hàng Nhà nước (từ Thông tư 16/2020/TT-NHNN): đọc chip CCCD, đối chiếu khuôn mặt và kiểm tra người thật. Xếp hạng rủi ro theo tiếp cận dựa trên rủi ro: PEP, quốc gia rủi ro cao theo FATF hoặc điểm từ 70 là rủi ro cao, cần lãnh đạo phê duyệt, EDD và rà soát 6 tháng một lần.',
    ),
    scenarios: ['EKYC_RISK'],
    keywords: ['ekyc', 'kyc', 'risk profiling', 'xep hang rui ro', 'pep', 'cccd', 'chip', 'liveness', 'mo tai khoan'],
  },
];

/** The teller counter: the twelfth topic of the catalog, with no queue scenario of its own. */
export const TELLER_GUIDE: RetailGuide = {
  id: 'retail-teller-vault',
  title: L('12. OTC teller cash & the $50,000 till limit', '12. Tiền mặt tại quầy & hạn mức ngăn kéo $50,000'),
  intro: L(
    'Cash paid in at the counter goes into the teller’s till and credits the customer. Once a till goes over its limit, the surplus goes to the vault before the next customer is served.',
    'Tiền mặt nộp tại quầy vào ngăn kéo của giao dịch viên và ghi có cho khách. Khi ngăn kéo vượt hạn mức, phần dư được chuyển về kho quỹ trước khi phục vụ khách tiếp theo.',
  ),
  foundation: L(
    'Deposit: Dr 1011 (till) / Cr 2010 on the retail book. The transfer is Dr 1011 (vault) / Cr 1011 (till), so the GL total does not change. Cash is moved under dual control, and the limit is the bank’s own policy rather than a statutory figure.',
    'Nộp tiền: Nợ 1011 (ngăn kéo) / Có 2010 trên sổ bán lẻ. Chuyển kho: Nợ 1011 (kho) / Có 1011 (ngăn kéo), nên tổng TK không đổi. Tiền được chuyển theo kiểm soát kép, và hạn mức là chính sách của ngân hàng chứ không phải con số luật định.',
  ),
  scenarios: [],
  keywords: ['teller', 'giao dich vien', 'till limit', 'han muc ngan keo', 'vault', 'kho quy', 'dual control', 'kiem soat kep'],
};

/** The whole catalog the retail tab shows, in order. */
export const RETAIL_TOPICS: readonly RetailGuide[] = [...RETAIL_GUIDES, TELLER_GUIDE];

/** Every retail queue scenario a guide covers (the guides between them cover them all). */
export const GUIDED_SCENARIOS: ReadonlySet<RetailScenarioId> = new Set(RETAIL_GUIDES.flatMap((g) => g.scenarios));
export const UNGUIDED_SCENARIOS: readonly RetailScenarioId[] = RETAIL_SCENARIOS.filter((id) => !GUIDED_SCENARIOS.has(id));
