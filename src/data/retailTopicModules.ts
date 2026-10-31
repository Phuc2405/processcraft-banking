/**
 * The Knowledge Base's retail catalog, one article per topic: each of the 11 guides plus the teller counter, with its message
 * flow, step-by-step cards, red flags and regulations. The topics the simulator's retail book runs reuse their lessons
 * (retailOpsKnowledge.ts); the others are written here, and their Dr/Cr journals come from the queue's own cases. The laws cited
 * are references to check against the current text, not legal advice. Pure data, both languages.
 */

import type { Localized } from '../i18n/locale';
import { gradeTaskCase, RETAIL_DESK, retailDeck, STAFF_ROLES, type LedgerLine, type RetailScenarioId } from '../sim/staffRoleplay';
import { OPS_LESSONS, type OpsDiagram } from './retailOpsKnowledge';
import { applyPresetJournal, openingBook, opsSubProcess, type OpsSubProcessId } from '../sim/retailOps';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

export interface TopicModule {
  /** The anchor of this part of the article. */
  id: string;
  /** Set when a topic has several parts. */
  heading?: Localized<string>;
  summary?: Localized<string>;
  iso: readonly { hop: string; message: string; meaning: Localized<string> }[];
  sop: readonly Localized<string>[];
  redFlags: readonly Localized<string>[];
  rules: readonly { source: Localized<string>; rule: Localized<string> }[];
  /** The journals on the retail book; a queue scenario's own journals are drawn from its cases. */
  diagrams: readonly OpsDiagram[];
  keywords: readonly string[];
}

const fromLesson = (sub: OpsSubProcessId, withHeading: boolean): TopicModule => {
  const l = OPS_LESSONS.find((x) => x.sub === sub)!;
  return { id: l.id, ...(withHeading ? { heading: opsSubProcess(sub).title } : {}), summary: l.summary, iso: l.iso, sop: l.sop, redFlags: l.redFlags, rules: l.rules, diagrams: l.diagrams, keywords: l.keywords };
};

const written = (id: string, m: Omit<TopicModule, 'id' | 'diagrams'> & { diagrams?: readonly OpsDiagram[] }): TopicModule => ({ id, diagrams: [], ...m });

/** A topic's parts, by its guide's anchor. */
export const TOPIC_MODULES: Readonly<Record<string, readonly TopicModule[]>> = {
  'retail-fees': [fromLesson('card-fees', false)],
  'retail-autopay': [fromLesson('bill-pay', false)],
  'retail-atm': [fromLesson('atm-napas', true), fromLesson('cassette-jam', true)],
  'retail-wallet-qr': [fromLesson('wallet-qr', false)],
  'retail-teller-vault': [fromLesson('teller-vault', false)],
  'retail-rewards': [
    written('retail-rewards-detail', {
      iso: [
        { hop: 'Terminal → Issuer', message: 'ISO 8583 0200', meaning: L('Field 18 carries the merchant category code (MCC) that decides the reward rate.', 'Trường 18 chứa mã ngành hàng (MCC) quyết định tỷ lệ thưởng.') },
        { hop: 'Issuer → Terminal', message: 'ISO 8583 0210', meaning: L('RC 00: the purchase is approved. No reward yet.', 'RC 00: giao dịch được duyệt. Chưa có thưởng.') },
        { hop: 'Scheme → Issuer', message: 'Clearing file', meaning: L('The purchase settles, which is when it qualifies for a reward.', 'Giao dịch được quyết toán, đây là lúc đủ điều kiện nhận thưởng.') },
        { hop: 'Rewards engine → Core', message: 'Reward batch posting', meaning: L('Cashback or points are credited, and a later reversal claws them back.', 'Hoàn tiền hoặc điểm được ghi có, giao dịch bị đảo sau đó sẽ thu hồi lại.') },
      ],
      sop: [
        L('Read the MCC and check the category earns a reward.', 'Đọc mã MCC và kiểm tra ngành hàng có được thưởng.'),
        L('Exclude cash-like spending: ATM, money transfers and excluded codes.', 'Loại giao dịch tương đương tiền mặt: rút ATM, chuyển tiền và các mã loại trừ.'),
        L('Check the purchase has settled and has not been reversed.', 'Kiểm tra giao dịch đã quyết toán và chưa bị đảo.'),
        L('Apply the rate and the period cap, then post the reward.', 'Áp dụng tỷ lệ và hạn mức kỳ, rồi ghi nhận thưởng.'),
        L('For a redemption, check the points cover the fee before posting.', 'Khi đổi điểm, kiểm tra đủ điểm trả phí trước khi ghi nhận.'),
      ],
      redFlags: [
        L('Reward farming: many small purchases refunded soon after.', 'Trục lợi thưởng: nhiều giao dịch nhỏ rồi hoàn trả ngay sau đó.'),
        L('A merchant’s MCC that does not match what it sells.', 'Mã MCC của cửa hàng không khớp với mặt hàng kinh doanh.'),
        L('Points moved between accounts just before a large redemption.', 'Điểm được chuyển giữa các tài khoản ngay trước lần đổi lớn.'),
      ],
      rules: [
        { source: L('SBV Circular 18/2024/TT-NHNN', 'Thông tư 18/2024/TT-NHNN'), rule: L('Card terms given to the holder must be clear, including what a programme offers.', 'Điều khoản thẻ cung cấp cho chủ thẻ phải rõ ràng, gồm cả nội dung chương trình ưu đãi.') },
        { source: L('IFRS 15 / AASB 15', 'IFRS 15 / AASB 15'), rule: L('Unused points are a liability: the promise to reward has not yet been met.', 'Điểm chưa dùng là nợ phải trả: nghĩa vụ thưởng chưa được thực hiện.') },
        { source: L('Banking Code of Practice (ABA)', 'Bộ quy tắc ngân hàng (ABA)'), rule: L('In Australia, subscribing banks commit to fair, clear communication about their products. APRA does not set reward rules.', 'Tại Úc, các ngân hàng tham gia cam kết truyền thông công bằng, rõ ràng về sản phẩm. APRA không đặt quy định về thưởng.') },
      ],
      keywords: ['mcc', '0200', 'rewards batch', 'ifrs 15', 'loyalty liability'],
    }),
  ],
  'retail-waterfall': [
    written('retail-waterfall-detail', {
      iso: [
        { hop: 'Payer bank → Bank', message: 'ISO 20022 pacs.008', meaning: L('The borrower’s part-payment arrives, with the loan as its reference.', 'Khoản trả một phần của khách đến, kèm mã khoản vay làm tham chiếu.') },
        { hop: 'Core → Loan system', message: 'Repayment instruction', meaning: L('The loan system splits the amount in the fixed order.', 'Hệ thống cho vay phân bổ số tiền theo thứ tự cố định.') },
        { hop: 'Loan system → Core', message: 'Allocation posting', meaning: L('One journal per bucket: penalty, interest, principal.', 'Một bút toán cho mỗi nhóm: phạt, lãi, gốc.') },
        { hop: 'Core → Credit bureau', message: 'Monthly credit report', meaning: L('The updated debt age goes to the credit bureau (CIC in Vietnam).', 'Tuổi nợ mới được gửi tới trung tâm tín dụng (CIC tại Việt Nam).') },
      ],
      sop: [
        L('Identify the loan and read what is owed in each bucket.', 'Xác định khoản vay và đọc số nợ của từng nhóm.'),
        L('Allocate to late penalties first.', 'Phân bổ vào phí phạt trễ hạn trước.'),
        L('Allocate what is left to overdue interest.', 'Phân bổ phần còn lại vào lãi quá hạn.'),
        L('Allocate the rest to principal, and post each part separately.', 'Phân bổ phần còn lại vào gốc, ghi nhận từng phần riêng.'),
        L('Update the debt’s age and send the customer the breakdown.', 'Cập nhật tuổi nợ và gửi khách bản phân bổ.'),
      ],
      redFlags: [
        L('Principal paid before penalties and interest: income is understated.', 'Trả gốc trước phạt và lãi: thu nhập bị ghi thấp.'),
        L('A manual allocation with no supervisor’s approval.', 'Phân bổ thủ công không có phê duyệt của kiểm soát viên.'),
        L('A debt’s age reset by a very small payment.', 'Tuổi nợ được đặt lại bằng một khoản trả rất nhỏ.'),
      ],
      rules: [
        { source: L('SBV Circular 39/2016/TT-NHNN', 'Thông tư 39/2016/TT-NHNN'), rule: L('Lending terms in Vietnam, including the order of recovery agreed in the contract.', 'Điều kiện cho vay tại Việt Nam, gồm thứ tự thu hồi đã thỏa thuận trong hợp đồng.') },
        { source: L('APRA APS 220', 'APRA APS 220'), rule: L('Credit risk management in Australia: arrears must be identified and reported soundly.', 'Quản lý rủi ro tín dụng tại Úc: nợ quá hạn phải được xác định và báo cáo đúng.') },
        { source: L('National Credit Code (ASIC)', 'Bộ luật Tín dụng Quốc gia (ASIC)'), rule: L('Australian consumer credit rules on default and hardship, which ASIC rather than APRA enforces.', 'Quy định tín dụng tiêu dùng của Úc về vỡ nợ và khó khăn tài chính, do ASIC thực thi thay vì APRA.') },
      ],
      keywords: ['allocation', 'part-payment', 'cic', 'aps 220', 'arrears'],
    }),
  ],
  'retail-term-deposit': [
    written('retail-term-deposit-detail', {
      iso: [
        { hop: 'Teller / App → Core', message: 'Deposit servicing request', meaning: L('An early break, a pledge or a release, naming the deposit.', 'Yêu cầu tất toán sớm, cầm cố hoặc giải chấp, ghi rõ khoản tiền gửi.') },
        { hop: 'Core → Collateral system', message: 'Lien update', meaning: L('Marks the deposit as pledged, or releases it.', 'Đánh dấu khoản tiền gửi đã cầm cố, hoặc giải chấp.') },
        { hop: 'Core → Customer', message: 'Statement / notification', meaning: L('The recalculated interest and the amount paid out.', 'Tiền lãi tính lại và số tiền chi trả.') },
      ],
      sop: [
        L('Confirm the holder’s identity and read the deposit’s terms.', 'Xác minh chủ tiền gửi và đọc điều khoản khoản tiền gửi.'),
        L('Check for a pledge: a pledged deposit cannot be broken.', 'Kiểm tra cầm cố: khoản đã cầm cố không được tất toán.'),
        L('Recalculate early-break interest at the demand rate.', 'Tính lại lãi tất toán sớm theo lãi suất không kỳ hạn.'),
        L('For a set-off, confirm the overdraft is 90 days overdue.', 'Khi cấn trừ, xác nhận thấu chi đã quá hạn 90 ngày.'),
        L('Post the journal and return any surplus to the customer.', 'Ghi bút toán và trả phần dư cho khách.'),
      ],
      redFlags: [
        L('A pledged deposit released with the loan still open.', 'Khoản cầm cố được giải chấp khi khoản vay còn dư nợ.'),
        L('A break requested by someone other than the holder.', 'Yêu cầu tất toán từ người không phải chủ tiền gửi.'),
        L('A large break straight after a change of contact details.', 'Tất toán lớn ngay sau khi đổi thông tin liên hệ.'),
      ],
      rules: [
        { source: L('SBV Circulars 48/2018 & 49/2018/TT-NHNN', 'Thông tư 48/2018 & 49/2018/TT-NHNN'), rule: L('Savings and term deposits in Vietnam, including interest on early withdrawal.', 'Tiền gửi tiết kiệm và có kỳ hạn tại Việt Nam, gồm lãi khi rút trước hạn.') },
        { source: L('APRA APS 210', 'APRA APS 210'), rule: L('Liquidity in Australia: banks must plan for deposits leaving early.', 'Thanh khoản tại Úc: ngân hàng phải tính đến việc tiền gửi rút sớm.') },
        { source: L('Banking Code of Practice (ABA)', 'Bộ quy tắc ngân hàng (ABA)'), rule: L('Clear information on term deposit terms for customers of subscribing Australian banks.', 'Thông tin rõ ràng về điều khoản tiền gửi có kỳ hạn cho khách của các ngân hàng Úc tham gia.') },
      ],
      keywords: ['lien', 'early withdrawal', 'rut truoc han', 'aps 210', 'collateral'],
    }),
  ],
  'retail-eod-recon': [
    written('retail-eod-recon-detail', {
      iso: [
        { hop: 'Bank → Domestic switch', message: 'ISO 20022 pacs.008', meaning: L('The day’s outgoing instant payments.', 'Các lệnh chuyển tức thời trong ngày.') },
        { hop: 'Domestic switch → Bank', message: 'ISO 20022 pacs.002', meaning: L('Status per payment: ACSC is settled, RJCT is rejected.', 'Trạng thái từng lệnh: ACSC đã quyết toán, RJCT bị từ chối.') },
        { hop: 'Domestic switch → Bank', message: 'EOD settlement file', meaning: L('The switch’s list of what it settled tonight.', 'Danh sách chuyển mạch đã quyết toán đêm nay.') },
        { hop: 'Central bank → Bank', message: 'ISO 20022 camt.053', meaning: L('The settlement account’s statement, which the net position must match.', 'Sao kê tài khoản quyết toán, vị thế ròng phải khớp với sao kê này.') },
      ],
      sop: [
        L('Load the core postings, the switch file and the statement.', 'Nạp bút toán core, tệp của chuyển mạch và sao kê.'),
        L('Match on reference and amount, line by line.', 'Khớp theo mã tham chiếu và số tiền, từng dòng.'),
        L('Park any item that does not match in clearing suspense.', 'Treo khoản không khớp vào tài khoản treo bù trừ.'),
        L('Investigate: refund the customer or re-send the payment.', 'Điều tra: hoàn tiền cho khách hoặc chuyển lại lệnh.'),
        L('Clear suspense to zero, and escalate what is ageing.', 'Đưa tài khoản treo về 0 và báo cáo các khoản treo lâu ngày.'),
      ],
      redFlags: [
        L('A suspense balance that grows from day to day.', 'Số dư tài khoản treo tăng dần qua các ngày.'),
        L('A break cleared with no evidence attached.', 'Khoản lệch được xử lý mà không có bằng chứng.'),
        L('The same person posting and approving a clearing entry.', 'Cùng một người ghi và duyệt bút toán xử lý.'),
      ],
      rules: [
        { source: L('Decree 52/2024/ND-CP', 'Nghị định 52/2024/NĐ-CP'), rule: L('Vietnam’s framework for non-cash payments and the systems that carry them.', 'Khung quy định về thanh toán không dùng tiền mặt và các hệ thống liên quan tại Việt Nam.') },
        { source: L('SBV Circular 13/2018/TT-NHNN', 'Thông tư 13/2018/TT-NHNN'), rule: L('Internal control systems for Vietnamese banks, including separation of duties.', 'Hệ thống kiểm soát nội bộ của ngân hàng Việt Nam, gồm tách biệt nhiệm vụ.') },
        { source: L('APRA CPS 230', 'APRA CPS 230'), rule: L('Operational risk in Australia: payments and settlement are critical operations.', 'Rủi ro hoạt động tại Úc: thanh toán và quyết toán là hoạt động trọng yếu.') },
      ],
      keywords: ['camt.053', 'acsc', 'rjct', 'break', 'cps 230', 'settlement file'],
    }),
  ],
  'retail-npl': [
    written('retail-npl-detail', {
      iso: [
        { hop: 'Core → Risk system', message: 'Month-end loan file', meaning: L('Every loan’s balance and days past due.', 'Số dư và số ngày quá hạn của từng khoản vay.') },
        { hop: 'Credit bureau → Bank', message: 'CIC group report', meaning: L('The group other banks gave the same customer: the bank must use the worse one.', 'Nhóm nợ ngân hàng khác xếp cho cùng khách hàng: ngân hàng phải dùng nhóm xấu hơn.') },
        { hop: 'Risk system → Core', message: 'Provision batch posting', meaning: L('The month’s change in provisions.', 'Thay đổi dự phòng trong tháng.') },
        { hop: 'Bank → Regulator', message: 'Statutory return', meaning: L('The classified book goes to the regulator.', 'Danh mục đã phân loại được gửi tới cơ quan quản lý.') },
      ],
      sop: [
        L('Read each loan’s days past due at month end.', 'Đọc số ngày quá hạn của từng khoản vay vào cuối tháng.'),
        L('Assign the group, and align it with the credit bureau’s.', 'Xếp nhóm và đồng bộ với nhóm của trung tâm tín dụng.'),
        L('Net off eligible collateral from the balance.', 'Trừ giá trị tài sản bảo đảm đủ điều kiện khỏi dư nợ.'),
        L('Apply the group’s rate, plus the general provision.', 'Áp dụng tỷ lệ của nhóm, cộng dự phòng chung.'),
        L('Post the change and report the classified book.', 'Ghi nhận phần thay đổi và báo cáo danh mục đã phân loại.'),
      ],
      redFlags: [
        L('Evergreening: a new loan that repays an overdue one.', 'Đảo nợ: khoản vay mới để trả khoản quá hạn.'),
        L('A group better than the one the credit bureau reports.', 'Nhóm nợ tốt hơn nhóm trung tâm tín dụng báo cáo.'),
        L('Collateral valued at an old or inflated price.', 'Tài sản bảo đảm định giá cũ hoặc bị thổi giá.'),
      ],
      rules: [
        { source: L('SBV Circular 31/2024/TT-NHNN', 'Thông tư 31/2024/TT-NHNN'), rule: L('Debt classification in Vietnam, in force from July 2024 and following on from Circular 11/2021.', 'Phân loại nợ tại Việt Nam, hiệu lực từ tháng 7/2024, kế tiếp Thông tư 11/2021.') },
        { source: L('Decree 86/2024/ND-CP', 'Nghị định 86/2024/NĐ-CP'), rule: L('Provisioning rates and how provisions are used in Vietnam.', 'Tỷ lệ trích lập và việc sử dụng dự phòng tại Việt Nam.') },
        { source: L('APRA APS 220 · AASB 9', 'APRA APS 220 · AASB 9'), rule: L('In Australia, credit risk management and forward-looking expected credit loss provisions.', 'Tại Úc, quản lý rủi ro tín dụng và dự phòng tổn thất tín dụng dự kiến.') },
      ],
      keywords: ['31/2024', '86/2024', 'evergreening', 'dao no', 'cic', 'aps 220', 'aasb 9', 'ecl'],
    }),
  ],
  'retail-fx': [
    written('retail-fx-detail', {
      iso: [
        { hop: 'Treasury → Payments', message: 'Live rate feed', meaning: L('The rate the deal is compared with at release.', 'Tỷ giá dùng để so với giao dịch khi giải phóng điện.') },
        { hop: 'Bank → Correspondent', message: 'SWIFT MT103 / pacs.008', meaning: L('The customer’s transfer, with the agreed amount and rate.', 'Lệnh chuyển của khách, kèm số tiền và tỷ giá đã thỏa thuận.') },
        { hop: 'Correspondent → Bank', message: 'pacs.002 / gpi status', meaning: L('Whether the payment was accepted, and where it is.', 'Lệnh có được chấp nhận không và đang ở đâu.') },
        { hop: 'Correspondent → Bank', message: 'MT950 / camt.053', meaning: L('The nostro statement used for reconciliation.', 'Sao kê nostro dùng để đối soát.') },
      ],
      sop: [
        L('Quote the deal rate, including the spread.', 'Báo tỷ giá giao dịch, đã gồm chênh lệch.'),
        L('At release, compare it with the live rate.', 'Khi giải phóng điện, so với tỷ giá trực tuyến.'),
        L('Over ±2%: hold the message and quote the customer again.', 'Vượt ±2%: giữ điện và báo giá lại cho khách.'),
        L('Inside the band: send it and post the journal.', 'Trong ngưỡng: gửi điện và ghi bút toán.'),
        L('Reconcile the nostro against the correspondent’s statement.', 'Đối soát nostro với sao kê của ngân hàng đại lý.'),
      ],
      redFlags: [
        L('A customer pushing for release during a rate spike.', 'Khách hối thúc giải phóng điện khi tỷ giá biến động mạnh.'),
        L('A rate manually overridden with no treasury approval.', 'Tỷ giá bị sửa tay mà không có phê duyệt của Nguồn vốn.'),
        L('Payments priced far from the market, which may hide value transfer.', 'Lệnh có tỷ giá xa thị trường, có thể che giấu chuyển giá trị.'),
      ],
      rules: [
        { source: L('Foreign Exchange Ordinance 2005 (amended 2013)', 'Pháp lệnh Ngoại hối 2005 (sửa đổi 2013)'), rule: L('Foreign exchange and outward transfers in Vietnam, with supporting documents.', 'Hoạt động ngoại hối và chuyển tiền ra nước ngoài tại Việt Nam, kèm chứng từ.') },
        { source: L('APRA APS 116', 'APRA APS 116'), rule: L('Capital for market risk in Australia, including FX positions.', 'Vốn cho rủi ro thị trường tại Úc, gồm trạng thái ngoại hối.') },
        { source: L('AUSTRAC AML/CTF Act 2006', 'Luật AML/CTF 2006 của AUSTRAC'), rule: L('Australian banks report international funds transfer instructions to AUSTRAC.', 'Ngân hàng Úc báo cáo lệnh chuyển tiền quốc tế cho AUSTRAC.') },
      ],
      keywords: ['pacs.008', 'gpi', 'mt950', 'nostro', 'aps 116', 'ifti'],
    }),
  ],
  'retail-ekyc-risk': [
    written('retail-ekyc-risk-detail', {
      iso: [
        { hop: 'App → Bank', message: 'NFC chip read + selfie', meaning: L('The ID’s chip data and a liveness video.', 'Dữ liệu chip trên giấy tờ và video kiểm tra người thật.') },
        { hop: 'Bank → Population database', message: 'C06 lookup', meaning: L('The ID is checked against the national record.', 'Giấy tờ được đối chiếu với cơ sở dữ liệu dân cư.') },
        { hop: 'Bank → Screening', message: 'Sanctions / PEP match', meaning: L('The name is screened, and a hit goes to an analyst.', 'Tên được sàng lọc, trùng khớp chuyển cho chuyên viên.') },
        { hop: 'Bank → Core', message: 'Account opening', meaning: L('The account opens with its risk rating.', 'Tài khoản được mở kèm xếp hạng rủi ro.') },
      ],
      sop: [
        L('Read the chip and match it with the typed details.', 'Đọc chip và khớp với thông tin đã nhập.'),
        L('Run the liveness check, and match the face with the chip’s photo.', 'Kiểm tra người thật và khớp khuôn mặt với ảnh trong chip.'),
        L('Screen the name against sanctions and PEP lists.', 'Sàng lọc tên theo danh sách cấm vận và PEP.'),
        L('Score the risk: a PEP, a high-risk country or 70+ is high risk.', 'Chấm điểm rủi ro: PEP, quốc gia rủi ro cao hoặc từ 70 là rủi ro cao.'),
        L('High risk: senior approval, EDD and a 6-monthly review.', 'Rủi ro cao: lãnh đạo phê duyệt, EDD và rà soát 6 tháng một lần.'),
      ],
      redFlags: [
        L('A replayed video, or a face that fails liveness.', 'Video phát lại, hoặc khuôn mặt không qua kiểm tra người thật.'),
        L('Many accounts opened from one device.', 'Nhiều tài khoản được mở từ cùng một thiết bị.'),
        L('A new account that quickly sends everything it receives onward: a possible mule.', 'Tài khoản mới nhanh chóng chuyển đi mọi khoản nhận được: có thể là tài khoản trung gian.'),
      ],
      rules: [
        { source: L('SBV Circular 17/2024/TT-NHNN', 'Thông tư 17/2024/TT-NHNN'), rule: L('Opening payment accounts in Vietnam, including remote identification.', 'Mở tài khoản thanh toán tại Việt Nam, gồm định danh từ xa.') },
        { source: L('AML Law 14/2022/QH15', 'Luật PCRT 14/2022/QH15'), rule: L('Customer identification and risk classification in Vietnam.', 'Nhận biết khách hàng và phân loại rủi ro tại Việt Nam.') },
        { source: L('AUSTRAC AML/CTF Act · APRA CPS 234', 'Luật AML/CTF của AUSTRAC · APRA CPS 234'), rule: L('In Australia, AUSTRAC sets the identification rules and APRA requires the data to be secured.', 'Tại Úc, AUSTRAC đặt quy định định danh và APRA yêu cầu bảo mật dữ liệu.') },
      ],
      // The review itself posts nothing; what moves money is the account's first deposit.
      diagrams: [{ title: L('The new account’s first $50 arrives', 'Khoản $50 đầu tiên của tài khoản mới'), lines: applyPresetJournal(openingBook(), 'ekyc-open', 'APPROVED', 'D1 00:00:00').outcome.journal?.lines ?? [] }],
      keywords: ['nfc', 'c06', 'liveness', 'mule', 'tai khoan trung gian', 'cps 234', 'edd'],
    }),
  ],
};

/** The teller counter has no queue scenario, so its flow and decision tree are written here. */
export const TELLER_FLOW: readonly Localized<string>[] = [
  L('Count the notes and post the deposit.', 'Đếm tiền và ghi nhận khoản nộp.'),
  L('Check the till against its $50,000 limit.', 'Kiểm tra ngăn kéo so với hạn mức $50,000.'),
  L('Over the limit: stop, and transfer the surplus to the vault under dual control.', 'Vượt hạn mức: dừng lại và chuyển phần dư về kho quỹ theo kiểm soát kép.'),
];

export const TELLER_DECISION = {
  right: L('Transfer first, then serve: the till goes back to its float and the cash is protected.', 'Chuyển trước, phục vụ sau: ngăn kéo về mức quỹ đầu ca và tiền được bảo vệ.'),
  wrongApprove: L('Keep serving over the limit: cash stays exposed, and an audit finds a breach.', 'Tiếp tục phục vụ khi vượt hạn mức: tiền vẫn gặp rủi ro và kiểm toán ghi nhận vi phạm.'),
  wrongReject: L('Refuse the deposit: the customer is turned away when a vault transfer would have solved it.', 'Từ chối khoản nộp: khách bị từ chối trong khi chuyển kho quỹ là giải quyết được.'),
};

/** The lines a queue scenario's approval and refusal post on the core ledger, from one of its own cases. */
export function scenarioJournals(scenario: RetailScenarioId): { approve: readonly LedgerLine[]; reject: readonly LedgerLine[] } {
  const role = STAFF_ROLES.find((r) => RETAIL_DESK[r].includes(scenario))!;
  const c = retailDeck(role, 0, 1, scenario)[0]!;
  return { approve: gradeTaskCase(c, 'APPROVE').journal?.lines ?? [], reject: gradeTaskCase(c, 'REJECT').journal?.lines ?? [] };
}
