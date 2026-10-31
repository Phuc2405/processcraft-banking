/**
 * The Advanced view's deep dives: expert notes for each retail topic and the AML article's specialist sections. Each covers the
 * legal framework, edge cases, how the risk is scored, who settles with whom, and what the audit trail must show. Scoring models
 * and worked figures are illustrations for teaching, unless they name a simulator rule. Laws change: the references are starting
 * points to check against the current text, not legal advice. Pure data, both languages.
 */

import type { Localized } from '../i18n/locale';
import type { AmlSection } from './amlKnowledge';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

export interface RetailDeepDive {
  statute: Localized<string>;
  edgeCases: readonly Localized<string>[];
  riskScoring: Localized<string>;
  settlement: Localized<string>;
  audit: Localized<string>;
}

export const RETAIL_DEEP_DIVES: Readonly<Record<string, RetailDeepDive>> = {
  'retail-fees': {
    statute: L(
      'A fee needs a contractual basis and prior disclosure. In Vietnam, card terms fall under Circular 18/2024/TT-NHNN and an overdraft is lending under Circular 39/2016/TT-NHNN. In Australia, ASIC’s consumer credit regime and the Banking Code govern how fees and unarranged overdrafts are treated, while APRA looks at the prudential side through APS 220.',
      'Khoản phí cần có cơ sở hợp đồng và được công bố trước. Tại Việt Nam, điều khoản thẻ theo Thông tư 18/2024/TT-NHNN và thấu chi là cho vay theo Thông tư 39/2016/TT-NHNN. Tại Úc, chế độ tín dụng tiêu dùng của ASIC và Bộ quy tắc ngân hàng điều chỉnh phí và thấu chi ngoài thỏa thuận, còn APRA xem xét khía cạnh an toàn qua APS 220.',
    ),
    edgeCases: [
      L('A fee hits a dormant account: charging it could push a forgotten account into debt, so many banks stop fees at zero instead of creating an overdraft.', 'Phí vào tài khoản ngủ đông: thu phí có thể đẩy tài khoản bị bỏ quên vào nợ, nên nhiều ngân hàng dừng thu ở mức 0 thay vì tạo thấu chi.'),
      L('A fee is reversed after the overdraft interest has accrued: reverse the interest on that shortfall too, or the customer pays for the bank’s error.', 'Đảo phí sau khi đã phát sinh lãi thấu chi: phải đảo cả lãi trên phần thiếu đó, nếu không khách phải trả cho lỗi của ngân hàng.'),
      L('A card is closed mid-year: whether the annual fee is refunded pro rata depends on the contract, and the system must follow the version the customer signed.', 'Đóng thẻ giữa năm: việc hoàn phí thường niên theo tỷ lệ tùy hợp đồng, và hệ thống phải theo đúng phiên bản khách đã ký.'),
    ],
    riskScoring: L(
      'Watch conduct risk rather than fraud: track complaint rate per fee type, the share of fees that create a new overdraft, and the reversal rate. A sudden rise in any of them usually means a tariff or batch fault. An illustrative trigger is reversals above 2% of a batch, which pauses the next run.',
      'Theo dõi rủi ro ứng xử hơn là gian lận: tỷ lệ khiếu nại theo loại phí, tỷ lệ phí tạo thấu chi mới và tỷ lệ đảo phí. Tăng đột ngột thường là lỗi biểu phí hoặc lỗi lô. Ví dụ minh họa: đảo trên 2% của một lô thì dừng lần chạy tiếp theo.',
    ),
    settlement: L('No other party is involved: fees settle inside the bank’s own ledger, so income is recognised when earned. A multi-year fee is deferred and released over the period it covers.', 'Không có bên thứ ba: phí được ghi nhận trong sổ của ngân hàng, thu nhập ghi nhận khi phát sinh. Phí nhiều năm được phân bổ dần theo kỳ.'),
    audit: L('Keep the tariff version in force on the charge date, the batch ID, the balance before the charge, and who approved any waiver. Waivers above a set amount need a second approver.', 'Lưu phiên bản biểu phí có hiệu lực ngày thu, mã lô, số dư trước khi thu và người duyệt miễn phí. Miễn phí trên mức quy định cần người duyệt thứ hai.'),
  },
  'retail-autopay': {
    statute: L(
      'A collection is valid only under the payer’s authorisation. Vietnam’s Decree 52/2024/ND-CP and Circular 17/2024/TT-NHNN frame debits on payment accounts. In Australia, the BECS Procedures and the customer’s Direct Debit Request apply, and the customer’s bank must help with a claim for an unauthorised debit.',
      'Lệnh thu chỉ hợp lệ khi có ủy quyền của người trả. Nghị định 52/2024/NĐ-CP và Thông tư 17/2024/TT-NHNN là khung cho ghi nợ tài khoản thanh toán tại Việt Nam. Tại Úc, áp dụng Quy trình BECS và Yêu cầu ghi nợ trực tiếp của khách, và ngân hàng của khách phải hỗ trợ khiếu nại với khoản ghi nợ trái phép.',
    ),
    edgeCases: [
      L('Funds arrive later on the same day: a bank may retry once before the cut-off, and the NSF fee must not be charged twice for one bill.', 'Tiền về muộn trong ngày: ngân hàng có thể thử lại một lần trước giờ chốt, và không được thu phí NSF hai lần cho một hóa đơn.'),
      L('The bill exceeds the customer’s mandate cap: decline it as outside the mandate rather than as NSF, since the customer owes no penalty for it.', 'Hóa đơn vượt hạn mức ủy quyền: từ chối do ngoài ủy quyền chứ không phải NSF, vì khách không phải chịu phạt.'),
      L('The mandate was cancelled yesterday and the file was built earlier: the cancellation wins, and the item is returned as no authority.', 'Ủy quyền vừa hủy hôm qua nhưng tệp đã tạo trước đó: lệnh hủy được ưu tiên, khoản thu bị trả lại do không có thẩm quyền.'),
    ],
    riskScoring: L('Score billers, not just payers. Illustratively: return rate 40%, unauthorised-debit claims 40%, sudden amount spikes 20%. A biller scoring high is reviewed and may be moved to pre-funded collections.', 'Chấm điểm cả nhà cung cấp, không chỉ người trả. Ví dụ minh họa: tỷ lệ trả lại 40%, khiếu nại ghi nợ trái phép 40%, số tiền tăng đột biến 20%. Nhà cung cấp điểm cao được rà soát và có thể phải ký quỹ trước.'),
    settlement: L('The payer’s bank debits, then owes the biller’s bank until net settlement. A return reverses the position in the next cycle, so a biller credited early carries the risk of having that credit taken back.', 'Ngân hàng người trả ghi nợ rồi phải trả ngân hàng nhà cung cấp đến khi quyết toán ròng. Khoản trả lại đảo vị thế trong chu kỳ sau, nên nhà cung cấp được ghi có sớm chịu rủi ro bị thu hồi.'),
    audit: L('Link every debit to the mandate ID and its date, the file it came in, and the return reason code. Mandates are kept for as long as claims can arise after the last debit.', 'Liên kết mỗi khoản ghi nợ với mã và ngày ủy quyền, tệp đến và mã lý do trả lại. Ủy quyền được lưu đến hết thời gian có thể phát sinh khiếu nại sau lần ghi nợ cuối.'),
  },
  'retail-rewards': {
    statute: L('Rewards are a contractual promise and an accounting liability. IFRS 15 / AASB 15 treats unused points as deferred revenue or a provision, measured with expected breakage. Vietnam’s card rules and promotion law apply to how programmes are advertised. APRA sets no reward rules; Australian consumer law covers misleading offers.', 'Thưởng là cam kết hợp đồng và là nợ phải trả kế toán. IFRS 15 / AASB 15 ghi nhận điểm chưa dùng là doanh thu chưa thực hiện hoặc dự phòng, có tính đến tỷ lệ điểm không được dùng. Quy định thẻ và pháp luật khuyến mại Việt Nam điều chỉnh cách quảng bá. APRA không đặt quy định về thưởng; luật tiêu dùng Úc điều chỉnh quảng cáo gây hiểu nhầm.'),
    edgeCases: [
      L('A partial refund after the cashback was paid: claw back only the proportional reward, and never below zero without telling the customer.', 'Hoàn một phần sau khi đã trả hoàn tiền: chỉ thu hồi thưởng theo tỷ lệ, và không xuống dưới 0 nếu chưa báo khách.'),
      L('A merchant’s MCC changes mid-period: use the MCC on the settled transaction, not today’s value.', 'Mã MCC đổi giữa kỳ: dùng mã trên giao dịch đã quyết toán, không dùng giá trị hiện tại.'),
      L('Points are redeemed against a fee that is later waived: restore the points, not cash.', 'Đổi điểm trả phí rồi phí được miễn sau đó: hoàn lại điểm, không hoàn tiền.'),
    ],
    riskScoring: L('Flag abuse with a velocity score: refunds within 7 days of purchase, purchases at one merchant, and cards sharing a device. Hold rewards pending review above a threshold rather than cancelling them, so a genuine customer is not penalised.', 'Gắn cờ trục lợi bằng điểm tần suất: hoàn tiền trong 7 ngày, mua lặp lại tại một cửa hàng, nhiều thẻ chung thiết bị. Vượt ngưỡng thì tạm giữ thưởng để rà soát chứ không hủy, tránh ảnh hưởng khách thật.'),
    settlement: L('The interchange the bank earns from the scheme usually funds the reward, so a programme is priced on net interchange after scheme fees. A partner-funded offer creates a receivable from the partner until it pays.', 'Phí chuyển đổi ngân hàng nhận từ tổ chức thẻ thường tài trợ cho thưởng, nên chương trình được định giá trên phần ròng sau phí tổ chức thẻ. Ưu đãi do đối tác tài trợ tạo khoản phải thu từ đối tác đến khi trả.'),
    audit: L('Keep the programme rule version, each transaction’s earn calculation, and every manual adjustment with its reason. Reconcile the points sub-ledger to the 2450 liability every month.', 'Lưu phiên bản quy tắc chương trình, cách tính thưởng từng giao dịch và mọi điều chỉnh thủ công kèm lý do. Đối chiếu sổ phụ điểm với nợ phải trả 2450 hằng tháng.'),
  },
  'retail-atm': {
    statute: L('Vietnam’s Circular 36/2012/TT-NHNN covers ATM operation, security and complaint handling; Circular 01/2014/TT-NHNN covers cash handling and dual control. Australia’s ePayments Code (ASIC) sets liability for failed and unauthorised transactions, and APRA’s CPS 230 brings critical third parties such as switches and cash-in-transit firms inside operational risk management.', 'Thông tư 36/2012/TT-NHNN điều chỉnh vận hành, an ninh ATM và xử lý khiếu nại; Thông tư 01/2014/TT-NHNN điều chỉnh xử lý tiền mặt và kiểm soát kép. Bộ quy tắc ePayments của Úc (ASIC) quy định trách nhiệm với giao dịch lỗi và trái phép, và CPS 230 của APRA đưa bên thứ ba trọng yếu như chuyển mạch và vận chuyển tiền vào phạm vi quản lý rủi ro hoạt động.'),
    edgeCases: [
      L('A partial dispense: the journal shows $100 of $200 presented. Refund only the undelivered part, and record why the amounts differ.', 'Nhả thiếu: nhật ký cho thấy trình $100 trên $200. Chỉ hoàn phần chưa giao và ghi lý do chênh lệch.'),
      L('A retract after presenting: the customer did not take the notes in time. The notes go to the retract bin, which must be counted before any refund.', 'Thu hồi sau khi trình tiền: khách không lấy kịp. Tiền vào hộp thu hồi, phải đếm trước khi hoàn.'),
      L('A late reversal: the 0420 arrives after the switch’s cut-off. It settles in the next cycle, and the bank carries the gap in suspense overnight.', 'Đảo muộn: 0420 đến sau giờ chốt của chuyển mạch. Khoản này quyết toán chu kỳ sau, ngân hàng treo chênh lệch qua đêm.'),
    ],
    riskScoring: L('Forecast cash per machine from the same weekday’s history, and refill when predicted days of cover fall under a target. For fraud, score each machine on jam rate, failed PINs and retracts: a jam spike with few genuine faults suggests cash trapping, and a card-reader anomaly suggests skimming.', 'Dự báo tiền theo từng máy từ lịch sử cùng ngày trong tuần, tiếp quỹ khi số ngày đủ tiền dự kiến dưới mục tiêu. Về gian lận, chấm điểm mỗi máy theo tỷ lệ kẹt tiền, sai PIN và thu hồi: kẹt tiền tăng đột biến cho thấy bẫy tiền, bất thường đầu đọc thẻ cho thấy skimming.'),
    settlement: L('Four parties share one withdrawal: the card issuer debits its customer, the ATM owner pays out cash, the switch routes it, and the issuer owes the ATM owner the cash plus an interchange fee in net settlement. In this simulator’s tariff, the bank keeps $1.10 and owes the switch $0.55.', 'Bốn bên trong một lần rút: ngân hàng phát hành ghi nợ khách, chủ ATM chi tiền, chuyển mạch định tuyến, và ngân hàng phát hành trả chủ ATM tiền mặt cộng phí trong quyết toán ròng. Theo biểu phí mô phỏng, ngân hàng giữ $1.10 và trả chuyển mạch $0.55.'),
    audit: L('Keep the electronic journal, camera footage for the bank’s retention period, the cassette count signed by two people, and the suspense ticket from opening to close. Any cash difference over tolerance is escalated, not written off at the branch.', 'Lưu nhật ký điện tử, video camera theo thời hạn của ngân hàng, biên bản đếm hộp tiền có hai chữ ký và phiếu treo từ lúc mở đến lúc đóng. Chênh lệch tiền vượt ngưỡng phải báo cáo, không tự xử lý tại chi nhánh.'),
  },
  'retail-waterfall': {
    statute: L('The order of recovery comes from the contract and the lending rules: Circular 39/2016/TT-NHNN in Vietnam, and the National Credit Code in Australia, where a customer in hardship has a right to ask for a variation. APRA’s APS 220 requires sound arrears identification. Consumer protection can override an aggressive order.', 'Thứ tự thu hồi theo hợp đồng và quy định cho vay: Thông tư 39/2016/TT-NHNN tại Việt Nam, và Bộ luật Tín dụng Quốc gia tại Úc, nơi khách khó khăn có quyền đề nghị điều chỉnh. APS 220 của APRA yêu cầu xác định nợ quá hạn đúng đắn. Bảo vệ người tiêu dùng có thể hạn chế thứ tự thu quá chặt.'),
    edgeCases: [
      L('A payment exceeds everything owed: the surplus goes back to the customer rather than being kept as a credit on a closed loan.', 'Khoản trả vượt toàn bộ nợ: phần dư trả lại khách chứ không giữ trên khoản vay đã đóng.'),
      L('A payment is later returned unpaid: the whole allocation must be reversed in reverse order, and the debt’s age restored.', 'Khoản trả sau đó bị trả lại: toàn bộ phân bổ phải đảo ngược theo thứ tự ngược, và khôi phục tuổi nợ.'),
      L('A customer has several loans: the payment reference decides, and an unmarked payment follows the contract’s order, usually oldest first.', 'Khách có nhiều khoản vay: mã tham chiếu quyết định, khoản không ghi rõ theo thứ tự hợp đồng, thường là khoản cũ nhất trước.'),
    ],
    riskScoring: L('Collections are prioritised by a roll-rate score: the chance a debt moves to the next ageing bucket. Illustratively, expected loss = probability of rolling × balance × loss given default, and the highest values get the first contact.', 'Thu nợ ưu tiên theo điểm chuyển nhóm: khả năng khoản nợ sang nhóm tuổi nợ tiếp theo. Ví dụ minh họa, tổn thất dự kiến = xác suất chuyển nhóm × dư nợ × tỷ lệ tổn thất khi vỡ nợ, giá trị cao nhất được liên hệ trước.'),
    settlement: L('For BNPL, the bank has already paid the merchant in full, so instalments only repay the bank. A merchant refund must reduce the instalments first, and any amount already paid goes back to the customer.', 'Với BNPL, ngân hàng đã trả đủ cho cửa hàng, nên các kỳ chỉ trả lại ngân hàng. Khoản hoàn của cửa hàng phải giảm các kỳ trước, phần đã trả sẽ hoàn lại khách.'),
    audit: L('Show each allocation by bucket, the rule version applied, and who overrode it and why. Report accurately to the credit bureau, since a wrong age harms the customer’s record.', 'Hiển thị từng phân bổ theo nhóm, phiên bản quy tắc, ai điều chỉnh và lý do. Báo cáo chính xác cho trung tâm tín dụng, vì tuổi nợ sai làm hại hồ sơ của khách.'),
  },
  'retail-term-deposit': {
    statute: L('Vietnam’s Circulars 48/2018 and 49/2018/TT-NHNN cover savings and term deposits, including early withdrawal. Pledging touches the secured-transactions rules in the Civil Code and its decree. In Australia, the Banking Code covers disclosure, and APRA’s APS 210 treats early-withdrawable deposits as a liquidity outflow risk.', 'Thông tư 48/2018 và 49/2018/TT-NHNN điều chỉnh tiền gửi tiết kiệm và có kỳ hạn, gồm rút trước hạn. Cầm cố liên quan quy định giao dịch bảo đảm trong Bộ luật Dân sự và nghị định hướng dẫn. Tại Úc, Bộ quy tắc ngân hàng điều chỉnh công bố thông tin, và APS 210 của APRA xem tiền gửi rút sớm được là rủi ro dòng tiền ra.'),
    edgeCases: [
      L('The holder dies: the deposit freezes, and it is released only under the inheritance process, never on a family member’s request alone.', 'Chủ tiền gửi qua đời: khoản tiền bị phong tỏa, chỉ giải tỏa theo thủ tục thừa kế, không theo yêu cầu riêng của người nhà.'),
      L('A partial break: if the contract allows it, only the withdrawn part earns the demand rate, and the rest keeps the contract rate.', 'Rút một phần: nếu hợp đồng cho phép, chỉ phần rút hưởng lãi không kỳ hạn, phần còn lại giữ lãi hợp đồng.'),
      L('A deposit matures while pledged: it rolls over and stays pledged, so the interest may be released only if the pledge terms allow it.', 'Khoản đáo hạn khi đang cầm cố: tự tái tục và vẫn cầm cố, tiền lãi chỉ được giải phóng nếu điều khoản cho phép.'),
    ],
    riskScoring: L('Loan-to-value decides pledge risk: LTV = overdraft limit ÷ deposit value, capped at 90% in this simulator. In treasury, each deposit bucket gets a behavioural run-off rate, because contractual maturity overstates how long the money truly stays.', 'Tỷ lệ cho vay trên giá trị quyết định rủi ro cầm cố: LTV = hạn mức thấu chi ÷ giá trị tiền gửi, tối đa 90% trong mô phỏng này. Ở Nguồn vốn, mỗi nhóm tiền gửi có tỷ lệ rút theo hành vi, vì kỳ hạn hợp đồng thường cao hơn thời gian tiền thực sự ở lại.'),
    settlement: L('Internal transfers between the bank’s own books, with no outside party. Set-off is the one sensitive case: it extinguishes two debts at once, so the customer must be told exactly how it was calculated.', 'Chuyển nội bộ giữa các sổ của ngân hàng, không có bên ngoài. Cấn trừ là trường hợp nhạy cảm: xóa đồng thời hai khoản nợ, nên phải báo khách rõ cách tính.'),
    audit: L('Keep the signed pledge, the lien’s start and end, the recalculated interest working, and the 90-day default evidence before any set-off. Lien releases need a checker separate from the maker.', 'Lưu hợp đồng cầm cố đã ký, thời điểm phong tỏa và giải tỏa, bảng tính lãi và bằng chứng quá hạn 90 ngày trước khi cấn trừ. Giải tỏa cần người kiểm soát tách biệt người lập.'),
  },
  'retail-wallet-qr': {
    statute: L('Wallet providers in Vietnam are licensed under Circular 40/2024/TT-NHNN, with own-name linked accounts and transaction limits. QR codes follow TCCS 03:2018/NHNN on the EMVCo format. In Australia, APRA supervises larger purchased payment facilities (APS 610), ASIC licenses most others, and instant payments run on the NPP.', 'Đơn vị ví tại Việt Nam được cấp phép theo Thông tư 40/2024/TT-NHNN, với tài khoản liên kết chính chủ và hạn mức giao dịch. Mã QR theo TCCS 03:2018/NHNN trên định dạng EMVCo. Tại Úc, APRA giám sát các tiện ích thanh toán trả trước lớn (APS 610), ASIC cấp phép phần lớn đơn vị còn lại, và thanh toán tức thời chạy trên NPP.'),
    edgeCases: [
      L('A timeout: the bank debits, but no pacs.002 arrives inside the SLA. The payment is not failed; it stays pending until an investigation message or the EOD file settles it.', 'Quá thời gian: ngân hàng đã ghi nợ nhưng pacs.002 không về trong SLA. Giao dịch chưa thất bại; vẫn chờ đến khi điện tra soát hoặc tệp cuối ngày xác định.'),
      L('A QR scam overlay: the code is valid and the CRC passes, but it was stuck over the shop’s own. Only the name lookup shown to the customer can catch this.', 'QR dán đè: mã hợp lệ và CRC đúng nhưng được dán đè lên mã của cửa hàng. Chỉ tên hiển thị cho khách mới phát hiện được.'),
      L('A wallet top-up reversal after the money was spent: the provider, not the bank, holds the loss unless the contract says otherwise.', 'Đảo nạp ví sau khi tiền đã tiêu: đơn vị ví chịu tổn thất, trừ khi hợp đồng quy định khác.'),
    ],
    riskScoring: L('Payments must be scored in milliseconds. In this simulator a device score of 70 or more stops a payment, from IP anomalies, a rooted phone and BIN velocity. Real systems add a payee score, such as how new the account is and how many strangers paid it today, to catch mule accounts.', 'Giao dịch phải được chấm điểm trong mili giây. Trong mô phỏng, điểm thiết bị từ 70 sẽ chặn giao dịch, dựa trên IP bất thường, điện thoại đã root và tần suất BIN. Hệ thống thật thêm điểm người nhận, như tài khoản mới đến đâu và bao nhiêu người lạ đã chuyển hôm nay, để bắt tài khoản trung gian.'),
    settlement: L('The customer sees instant money, but the banks settle later: the switch computes net positions and settles them in cycles against pre-funded or central bank accounts. Until then, each bank carries the others’ credit risk, which is why participants have limits. Wallet money must be safeguarded, not used by the provider.', 'Khách thấy tiền đến ngay nhưng các ngân hàng quyết toán sau: chuyển mạch tính vị thế ròng và quyết toán theo chu kỳ trên tài khoản ký quỹ hoặc tại ngân hàng trung ương. Trong lúc đó mỗi ngân hàng chịu rủi ro tín dụng của bên kia, nên các bên có hạn mức. Tiền ví phải được bảo đảm, đơn vị ví không được sử dụng.'),
    audit: L('Keep the raw QR payload, the name shown, the customer’s confirmation, every message timestamp, and the fraud score with its model version. These settle a later scam claim about who authorised what.', 'Lưu chuỗi QR gốc, tên đã hiển thị, xác nhận của khách, thời điểm từng thông điệp và điểm gian lận kèm phiên bản mô hình. Đây là căn cứ khi có khiếu nại lừa đảo về việc ai đã cho phép.'),
  },
  'retail-eod-recon': {
    statute: L('Reconciliation is an internal control duty: Circular 13/2018/TT-NHNN in Vietnam, CPS 230 and CPS 220 in Australia. System-wide payment rules come from the switch’s own rulebook and Decree 52/2024/ND-CP. International standards for financial market infrastructures (PFMI) expect final settlement by the end of the value date.', 'Đối soát là nghĩa vụ kiểm soát nội bộ: Thông tư 13/2018/TT-NHNN tại Việt Nam, CPS 230 và CPS 220 tại Úc. Quy định toàn hệ thống đến từ quy tắc của chuyển mạch và Nghị định 52/2024/NĐ-CP. Chuẩn quốc tế về hạ tầng thị trường tài chính (PFMI) yêu cầu quyết toán cuối cùng trong ngày giá trị.'),
    edgeCases: [
      L('A timezone cut-off: a payment after the switch’s cut-off but before the bank’s appears in tomorrow’s file. Match it across days before calling it a break.', 'Lệch giờ chốt: giao dịch sau giờ chốt chuyển mạch nhưng trước giờ chốt ngân hàng xuất hiện trong tệp hôm sau. Khớp qua các ngày trước khi coi là lệch.'),
      L('A duplicate presentment: the same payment twice. Post once, park the second, and claim it back rather than netting it silently.', 'Trình trùng: cùng một giao dịch hai lần. Ghi một lần, treo lần thứ hai và đòi lại, không tự bù trừ.'),
      L('A many-to-one match: one settlement line covers many payments. Match on the batch total first, then within the batch.', 'Khớp nhiều-một: một dòng quyết toán gồm nhiều giao dịch. Khớp tổng lô trước, rồi khớp trong lô.'),
    ],
    riskScoring: L('Rank breaks by value × age, as an illustration, so a small old item can outrank a large new one. Age bands such as 1, 7 and 30 days set the escalation level, and items past the last band go to provisioning or write-off review.', 'Xếp hạng khoản lệch theo giá trị × tuổi, ví dụ minh họa, để khoản nhỏ cũ có thể ưu tiên hơn khoản lớn mới. Các mốc 1, 7 và 30 ngày quyết định cấp báo cáo, và khoản quá mốc cuối chuyển xem xét dự phòng hoặc xóa sổ.'),
    settlement: L('Three records must agree: the core ledger, the switch’s file and the settlement account’s statement. Net settlement reduces liquidity needs but leaves exposure until it completes; gross settlement (RTGS) ends exposure per payment but needs far more liquidity.', 'Ba bản ghi phải khớp: sổ cái lõi, tệp chuyển mạch và sao kê tài khoản quyết toán. Quyết toán ròng giảm nhu cầu thanh khoản nhưng còn rủi ro đến khi hoàn tất; quyết toán tổng (RTGS) chấm dứt rủi ro từng lệnh nhưng cần nhiều thanh khoản hơn.'),
    audit: L('Every match is logged as automatic or manual. A manual match needs a reason and a checker, and suspense is signed off daily by someone who did not post to it.', 'Mỗi lần khớp được ghi là tự động hay thủ công. Khớp thủ công cần lý do và người kiểm soát, tài khoản treo được người không ghi vào đó ký xác nhận hằng ngày.'),
  },
  'retail-npl': {
    statute: L('Vietnam’s debt classification moved to Circular 31/2024/TT-NHNN, with provisioning under Decree 86/2024/ND-CP, following on from Circular 11/2021. In Australia, APS 220 sets credit risk rules and AASB 9 requires forward-looking expected credit losses. Basel’s capital rules use the same risk ideas for a different purpose.', 'Phân loại nợ của Việt Nam chuyển sang Thông tư 31/2024/TT-NHNN, trích lập theo Nghị định 86/2024/NĐ-CP, kế tiếp Thông tư 11/2021. Tại Úc, APS 220 đặt quy định rủi ro tín dụng và AASB 9 yêu cầu dự phòng tổn thất tín dụng dự kiến. Quy định vốn Basel dùng cùng ý tưởng cho mục đích khác.'),
    edgeCases: [
      L('A restructured loan: it does not return to group 1 on the day it is restructured, and has to perform for a period first.', 'Khoản vay cơ cấu lại: không về nhóm 1 ngay ngày cơ cấu, phải trả đúng hạn một thời gian trước.'),
      L('Group contagion: one late loan can pull the customer’s other loans down to the worst group.', 'Lây lan nhóm: một khoản trễ có thể kéo các khoản khác của khách xuống nhóm xấu nhất.'),
      L('Collateral falls in value: the specific provision rises even when the customer has not missed another payment.', 'Tài sản bảo đảm giảm giá: dự phòng cụ thể tăng dù khách không trễ thêm kỳ nào.'),
    ],
    riskScoring: L('Expected loss = PD × LGD × EAD. Illustratively, a $100,000 loan with a 4% probability of default and 45% loss given default expects $1,800. IFRS 9 stages it: stage 1 takes 12-month losses, and stages 2 and 3 take lifetime losses once credit risk rises significantly or the loan is impaired.', 'Tổn thất dự kiến = PD × LGD × EAD. Ví dụ minh họa, khoản vay $100,000 có xác suất vỡ nợ 4% và tỷ lệ tổn thất 45% thì dự kiến mất $1,800. IFRS 9 chia giai đoạn: giai đoạn 1 tính tổn thất 12 tháng, giai đoạn 2 và 3 tính cả đời khi rủi ro tăng đáng kể hoặc khoản vay bị suy giảm.'),
    settlement: L('Nothing moves between banks: provisions are non-cash charges against profit, which cut capital. A sale of bad debt to an asset manager is the exception, and it realises the difference between the book value and the price.', 'Không có dòng tiền giữa các ngân hàng: dự phòng là chi phí phi tiền mặt trừ vào lợi nhuận và làm giảm vốn. Bán nợ xấu cho công ty quản lý tài sản là ngoại lệ, và ghi nhận chênh lệch giữa giá trị sổ sách và giá bán.'),
    audit: L('Keep the classification per loan per month, the bureau group used, the collateral valuation and its date, and every manual override with a credit officer’s reason. Regulators test for evergreening by tracing new loans to old arrears.', 'Lưu phân loại từng khoản theo tháng, nhóm từ trung tâm tín dụng, định giá tài sản và ngày định giá, và mọi điều chỉnh tay kèm lý do của cán bộ tín dụng. Cơ quan quản lý kiểm tra đảo nợ bằng cách truy vết khoản vay mới về nợ cũ.'),
  },
  'retail-fx': {
    statute: L('Vietnam’s Foreign Exchange Ordinance limits outward transfers to permitted purposes, with documents. Australia requires reporting international funds transfer instructions to AUSTRAC, and APRA’s APS 116 sets capital for FX positions. Both follow FATF’s wire transfer rule on carrying payer and payee details.', 'Pháp lệnh Ngoại hối của Việt Nam giới hạn chuyển tiền ra nước ngoài theo mục đích được phép, kèm chứng từ. Úc yêu cầu báo cáo lệnh chuyển tiền quốc tế cho AUSTRAC, và APS 116 của APRA đặt vốn cho trạng thái ngoại hối. Cả hai theo quy tắc FATF về thông tin người trả và người nhận.'),
    edgeCases: [
      L('A correspondent deducts its fee (SHA or BEN charges): the payee receives less than instructed. It is not a break if the charge option explains it.', 'Ngân hàng đại lý trừ phí (phí SHA hoặc BEN): người nhận nhận ít hơn lệnh. Không phải lệch nếu tùy chọn phí giải thích được.'),
      L('A return weeks later at a different rate: the customer bears or gains the difference only if the terms say so, and the journal must show it.', 'Hoàn tiền sau nhiều tuần với tỷ giá khác: khách chịu hoặc hưởng chênh lệch chỉ khi điều khoản quy định, và bút toán phải thể hiện.'),
      L('A currency holiday: the cut-off passes and value dates shift, so a quote that looks in-band may be stale.', 'Ngày nghỉ của loại tiền: qua giờ chốt và ngày giá trị dịch chuyển, báo giá trông như trong ngưỡng có thể đã cũ.'),
    ],
    riskScoring: L('Compare rates and purposes. A volatility hold in this simulator is ±2% from the live rate. Market risk measures the open position with value-at-risk, and compliance scores corridors by destination, purpose code and customer history, since unusual pricing can hide value transfer.', 'So sánh tỷ giá và mục đích. Mô phỏng này giữ điện khi lệch ±2% so với tỷ giá trực tuyến. Rủi ro thị trường đo trạng thái mở bằng VaR, và tuân thủ chấm điểm hành lang theo nơi nhận, mã mục đích và lịch sử khách, vì giá bất thường có thể che giấu chuyển giá trị.'),
    settlement: L('Serial or cover: in a serial payment each bank passes on the MT103 and settles with the next. In a cover payment the MT103 goes straight to the payee’s bank and an MT202 COV settles through correspondents. The cover must carry the original parties so that each bank can screen them. Herstatt risk is why two-currency trades settle together where possible.', 'Nối tiếp hoặc phủ: thanh toán nối tiếp, mỗi ngân hàng chuyển MT103 và quyết toán với bên kế tiếp. Thanh toán phủ, MT103 đi thẳng tới ngân hàng người nhận và MT202 COV quyết toán qua đại lý. Điện phủ phải mang thông tin các bên gốc để mọi ngân hàng sàng lọc. Rủi ro Herstatt là lý do giao dịch hai loại tiền nên quyết toán đồng thời.'),
    audit: L('Keep the quote and its timestamp, the rate source, the spread, the purpose document, and every release and hold decision. Nostro items are reconciled daily and aged.', 'Lưu báo giá và thời điểm, nguồn tỷ giá, chênh lệch, chứng từ mục đích và mọi quyết định giữ hoặc giải phóng. Khoản nostro được đối soát hằng ngày và theo dõi tuổi.'),
  },
  'retail-ekyc-risk': {
    statute: L('Remote account opening in Vietnam falls under Circular 17/2024/TT-NHNN, with the AML Law 14/2022/QH15 and its guidance setting identification and risk rating. Australia’s AML/CTF Act and Rules set customer identification, the Privacy Act covers biometric data, and APRA’s CPS 234 requires it to be secured.', 'Mở tài khoản từ xa tại Việt Nam theo Thông tư 17/2024/TT-NHNN, Luật PCRT 14/2022/QH15 và hướng dẫn đặt yêu cầu nhận biết và xếp hạng rủi ro. Luật AML/CTF của Úc đặt yêu cầu định danh, Luật Quyền riêng tư điều chỉnh dữ liệu sinh trắc học, và CPS 234 của APRA yêu cầu bảo mật dữ liệu đó.'),
    edgeCases: [
      L('An injected video: an attacker feeds a deepfake to the camera driver, so liveness must check the capture path as well as the face.', 'Chèn video: kẻ tấn công đưa deepfake vào trình điều khiển camera, nên kiểm tra người thật phải xét cả đường thu hình, không chỉ khuôn mặt.'),
      L('A name hit with a different date of birth: resolve it on secondary identifiers and record why, rather than clearing it on instinct.', 'Trùng tên nhưng khác ngày sinh: xác định bằng thông tin phụ và ghi lý do, không xử lý theo cảm tính.'),
      L('A genuine customer fails: an older ID or poor lighting. Offer a branch route rather than rejecting them outright.', 'Khách thật không qua: giấy tờ cũ hoặc thiếu sáng. Đề xuất đến chi nhánh thay vì từ chối thẳng.'),
    ],
    riskScoring: L('A customer risk score combines weighted factors. Illustratively: 30% geography, 25% occupation and source of funds, 25% product and channel, 20% PEP or adverse media, with overrides so that a PEP is always high. In this simulator 70 or more is high risk, and the rating sets the review cycle.', 'Điểm rủi ro khách kết hợp các yếu tố có trọng số. Ví dụ minh họa: 30% địa lý, 25% nghề nghiệp và nguồn tiền, 25% sản phẩm và kênh, 20% PEP hoặc tin bất lợi, với quy tắc ghi đè để PEP luôn là rủi ro cao. Trong mô phỏng, từ 70 là rủi ro cao, và xếp hạng quyết định chu kỳ rà soát.'),
    settlement: L('The first deposit is usually an instant transfer in, so the account’s first credit also confirms a real bank relationship. Holding the first withdrawal for a short time is a common defence against mule accounts.', 'Khoản nộp đầu thường là chuyển khoản tức thời, nên khoản ghi có đầu tiên cũng xác nhận quan hệ ngân hàng có thật. Giữ lần rút đầu trong thời gian ngắn là cách phòng tài khoản trung gian phổ biến.'),
    audit: L('Keep each check’s score and vendor version, the screening list’s date, the risk factors and override, and who approved a high-risk customer. Limit access to biometric data, and keep it only as long as the law allows.', 'Lưu điểm từng bước và phiên bản nhà cung cấp, ngày của danh sách sàng lọc, các yếu tố rủi ro và ghi đè, và người duyệt khách rủi ro cao. Hạn chế truy cập dữ liệu sinh trắc học và chỉ lưu trong thời hạn pháp luật cho phép.'),
  },
  'retail-teller-vault': {
    statute: L('Vietnam’s Circular 01/2014/TT-NHNN sets dual control for cash, and large cash transactions are reported under the AML Law and Decision 11/2023/QD-TTg. Australia’s threshold is AUD 10,000 of physical cash, reported to AUSTRAC. A till limit itself is internal policy, often tied to insurance cover and the branch’s risk rating.', 'Thông tư 01/2014/TT-NHNN đặt kiểm soát kép với tiền mặt, và giao dịch tiền mặt lớn được báo cáo theo Luật PCRT và Quyết định 11/2023/QĐ-TTg. Ngưỡng của Úc là 10.000 AUD tiền mặt, báo cáo AUSTRAC. Bản thân hạn mức ngăn kéo là chính sách nội bộ, thường gắn với mức bảo hiểm và xếp hạng rủi ro chi nhánh.'),
    edgeCases: [
      L('The till is over at closing: the end-of-day count finds a surplus. Book it to a cash-over account and investigate; it is never pocketed or used to offset a later shortage.', 'Thừa tiền cuối ngày: kiểm quỹ phát hiện dư. Ghi vào tài khoản thừa quỹ và điều tra; không giữ riêng hoặc bù cho khoản thiếu sau đó.'),
      L('A suspect note turns up after the customer left: the teller bears the loss until the note is traced, which is why notes are checked in front of the customer.', 'Tiền nghi giả phát hiện sau khi khách đi: giao dịch viên chịu đến khi truy được nguồn, vì vậy phải kiểm tiền trước mặt khách.'),
      L('The vault custodian is absent: the transfer waits for an authorised deputy, and the teller stops taking cash rather than breaching the limit.', 'Thủ kho vắng mặt: việc chuyển chờ người được ủy quyền, giao dịch viên ngừng nhận tiền thay vì vượt hạn mức.'),
    ],
    riskScoring: L('Score tellers’ cash patterns to find internal fraud: frequent small differences, reversals near closing, and overrides. Set till limits by forecast demand per hour, because a limit that is too low forces constant transfers and one that is too high raises robbery exposure.', 'Chấm điểm mẫu hình tiền của giao dịch viên để phát hiện gian lận nội bộ: chênh lệch nhỏ thường xuyên, đảo giao dịch gần giờ đóng và ghi đè. Đặt hạn mức theo nhu cầu dự báo mỗi giờ, vì quá thấp buộc phải chuyển liên tục còn quá cao tăng rủi ro cướp.'),
    settlement: L('Cash settles on the spot, with no interbank leg. The vault in turn is replenished from the central bank or a cash centre, and holding excess cash has a real cost because it earns nothing.', 'Tiền mặt quyết toán ngay, không có chặng liên ngân hàng. Kho quỹ được bổ sung từ ngân hàng trung ương hoặc trung tâm tiền mặt, và giữ thừa tiền có chi phí thật vì không sinh lời.'),
    audit: L('Every transfer has two signatures, the denominations, and the times. Till counts are unannounced from time to time, and the system logs any override of the lock with the supervisor’s ID.', 'Mỗi lần chuyển có hai chữ ký, mệnh giá và thời gian. Kiểm quỹ đột xuất định kỳ, và hệ thống ghi mọi lần vượt khóa kèm mã kiểm soát viên.'),
  },
};

/** The AML article's specialist sections, shown only in the Advanced view. */
export const AML_DEEP_SECTIONS: readonly AmlSection[] = [
  {
    id: 'aml-adv-framework',
    level: 'advanced',
    rule: L('Know which rule applies in which country, and follow the stricter one when a payment crosses both.', 'Biết quy định nào áp dụng ở nước nào, và theo quy định chặt hơn khi lệnh đi qua cả hai.'),
    title: L('Statutory framework: who requires what', 'Khung pháp lý: ai yêu cầu điều gì'),
    paragraphs: [
      L('AML rules are layered: FATF sets the global standards, each country writes them into law, a regulator supervises, and a financial intelligence unit receives the reports. The bank’s own programme then turns them into daily procedure.', 'Quy định AML có nhiều tầng: FATF đặt chuẩn toàn cầu, mỗi nước đưa vào luật, cơ quan quản lý giám sát, và đơn vị tình báo tài chính nhận báo cáo. Chương trình của ngân hàng biến chúng thành quy trình hằng ngày.'),
    ],
    advanced: [
      L('Vietnam was placed on FATF’s list of jurisdictions under increased monitoring in June 2023, which raises scrutiny of cross-border payments. Check its current status before relying on this.', 'Việt Nam được FATF đưa vào danh sách giám sát tăng cường từ tháng 6/2023, làm tăng mức kiểm tra thanh toán xuyên biên giới. Hãy kiểm tra tình trạng hiện tại trước khi sử dụng.'),
    ],
    table: {
      columns: [L('Duty', 'Nghĩa vụ'), L('Global standard', 'Chuẩn toàn cầu'), L('Vietnam', 'Việt Nam'), L('Australia', 'Úc')],
      rows: [
        [L('Law & supervisor', 'Luật & cơ quan giám sát'), L('FATF 40 Recommendations', '40 Khuyến nghị FATF'), L('AML Law 14/2022/QH15, Decree 19/2023, Circular 09/2023. State Bank', 'Luật PCRT 14/2022/QH15, Nghị định 19/2023, Thông tư 09/2023. NHNN'), L('AML/CTF Act 2006, amended 2024. AUSTRAC (APRA for prudential risk)', 'Luật AML/CTF 2006, sửa đổi 2024. AUSTRAC (APRA về an toàn)')],
        [L('Customer due diligence', 'Nhận biết khách hàng'), L('R.10, R.12 (PEPs)', 'R.10, R.12 (PEP)'), L('Identify, verify and risk-rate; enhanced measures for high risk', 'Nhận biết, xác minh, xếp hạng; biện pháp tăng cường với rủi ro cao'), L('Part A / Part B programme and customer identification rules', 'Chương trình phần A / B và quy định định danh')],
        [L('Suspicious report', 'Báo cáo đáng ngờ'), L('R.20', 'R.20'), L('STR to the State Bank’s AML unit, within the law’s time limit', 'STR gửi đơn vị PCRT của NHNN, trong thời hạn luật định'), L('SMR within 3 business days, 24 hours for terrorism financing', 'SMR trong 3 ngày làm việc, 24 giờ với tài trợ khủng bố')],
        [L('Large cash', 'Tiền mặt lớn'), L('R.20 and national choice', 'R.20 và lựa chọn của từng nước'), L('From VND 400 million (Decision 11/2023/QD-TTg)', 'Từ 400 triệu đồng (QĐ 11/2023/QĐ-TTg)'), L('TTR from AUD 10,000 within 10 business days', 'TTR từ 10.000 AUD trong 10 ngày làm việc')],
        [L('Wire transfers', 'Chuyển tiền điện tử'), L('R.16 travel rule (USD/EUR 1,000)', 'R.16 quy tắc đi kèm (1.000 USD/EUR)'), L('Payer and payee details travel with the payment', 'Thông tin người trả và người nhận đi kèm lệnh'), L('IFTI report within 10 business days', 'Báo cáo IFTI trong 10 ngày làm việc')],
        [L('Records', 'Lưu trữ'), L('R.11: at least 5 years', 'R.11: ít nhất 5 năm'), L('At least 5 years', 'Ít nhất 5 năm'), L('Generally 7 years', 'Thường là 7 năm')],
      ],
    },
    keywords: ['fatf', 'grey list', 'danh sach xam', 'austrac', 'smr', 'ttr', 'ifti', 'r.16', 'travel rule', '19/2023', '09/2023', '11/2023', 'khung phap ly'],
  },
  {
    id: 'aml-adv-scoring',
    level: 'advanced',
    rule: L('A score supports the decision: an override and a human reason outrank the arithmetic.', 'Điểm số hỗ trợ quyết định: quy tắc ghi đè và lý do của con người đứng trên phép tính.'),
    title: L('Risk scoring: customers and transactions', 'Chấm điểm rủi ro: khách hàng và giao dịch'),
    paragraphs: [
      L('Two scores work together. A customer risk score, set at onboarding and refreshed by events, says how closely to watch someone. A transaction score, computed for each payment, says whether this payment is unusual for that person.', 'Hai loại điểm phối hợp với nhau. Điểm rủi ro khách, đặt khi mở tài khoản và cập nhật theo sự kiện, cho biết cần theo dõi chặt đến đâu. Điểm giao dịch, tính cho từng lệnh, cho biết lệnh này có bất thường với người đó không.'),
    ],
    advanced: [
      L('Worked illustration: a customer’s score = 0.30 × geography + 0.25 × occupation and source of funds + 0.25 × product and channel + 0.20 × PEP or adverse media. With factor scores of 40, 60, 50 and 90, the result is 12 + 15 + 12.5 + 18 = 57.5: medium. Hard overrides sit above the sum, so a confirmed PEP or a FATF high-risk country is always high risk, whatever the arithmetic says. This simulator treats 70 or more as high risk.', 'Ví dụ minh họa: điểm khách = 0,30 × địa lý + 0,25 × nghề nghiệp và nguồn tiền + 0,25 × sản phẩm và kênh + 0,20 × PEP hoặc tin bất lợi. Với điểm thành phần 40, 60, 50 và 90, kết quả là 12 + 15 + 12,5 + 18 = 57,5: trung bình. Quy tắc ghi đè đứng trên tổng, nên PEP đã xác nhận hoặc quốc gia rủi ro cao của FATF luôn là rủi ro cao, bất kể phép tính. Mô phỏng này xem từ 70 là rủi ro cao.'),
      L('Transaction monitoring combines fixed rules (several deposits just under the reporting line, as this simulator’s structuring check looks for) with behaviour against the customer’s own baseline: a z-score of the amount, the number of new counterparties, and the speed with which money passes through. Pass-through is especially telling: above about 90% of credits leaving within a day suggests a mule.', 'Giám sát giao dịch kết hợp quy tắc cố định (nhiều lần nộp ngay dưới ngưỡng báo cáo, như kiểm tra chia nhỏ của mô phỏng) với hành vi so với mức thường của chính khách: điểm z của số tiền, số đối tác mới và tốc độ tiền đi qua. Tốc độ đi qua rất đáng chú ý: khoảng trên 90% tiền vào rời đi trong ngày cho thấy tài khoản trung gian.'),
      L('Tuning is a compliance decision. Lowering a threshold finds more but buries analysts, and most alerts in the industry are false positives. Above-the-line and below-the-line testing samples the alerts just over and under a threshold to prove it is in the right place, and any change is documented and approved.', 'Tinh chỉnh là quyết định tuân thủ. Hạ ngưỡng phát hiện nhiều hơn nhưng làm quá tải chuyên viên, và phần lớn cảnh báo trong ngành là dương tính giả. Kiểm thử trên và dưới ngưỡng lấy mẫu cảnh báo sát ngưỡng để chứng minh ngưỡng hợp lý, và mọi thay đổi phải được ghi lại và phê duyệt.'),
    ],
    keywords: ['risk score', 'cham diem', 'z-score', 'mule', 'false positive', 'duong tinh gia', 'above the line', 'tuning', 'tinh chinh', 'structuring'],
  },
  {
    id: 'aml-adv-screening',
    level: 'advanced',
    rule: L('Resolve a match on evidence, record why, and never release frozen funds on your own judgement.', 'Xử lý trùng khớp dựa trên bằng chứng, ghi lý do, và không tự giải tỏa tiền đã phong tỏa.'),
    title: L('Sanctions screening mechanics', 'Cơ chế sàng lọc cấm vận'),
    paragraphs: [
      L('Screening compares names against lists at onboarding, whenever a list changes, and on each payment. A match is a question rather than an answer: an analyst decides whether the person really is the one listed.', 'Sàng lọc so tên với danh sách khi mở tài khoản, khi danh sách thay đổi và trên từng lệnh. Trùng khớp là câu hỏi chứ chưa phải câu trả lời: chuyên viên quyết định người này có đúng là người trong danh sách không.'),
    ],
    advanced: [
      L('Names are normalised first (case, accents, word order, transliteration), then scored with fuzzy algorithms. This simulator flags at a Jaro-Winkler score of 85. Vietnamese names show why tuning matters: dropping tone marks makes many different people look identical, and “Nguyen” alone matches a large share of the population, so secondary identifiers such as date of birth and country must resolve the hit.', 'Tên được chuẩn hóa trước (hoa thường, dấu, thứ tự từ, phiên âm), rồi chấm bằng thuật toán mờ. Mô phỏng gắn cờ ở điểm Jaro-Winkler 85. Tên Việt cho thấy vì sao cần tinh chỉnh: bỏ dấu làm nhiều người khác nhau trông giống nhau, và riêng “Nguyễn” khớp phần lớn dân số, nên thông tin phụ như ngày sinh và quốc gia phải quyết định.'),
      L('Ownership matters as well as names. Under OFAC’s 50 Percent Rule, an entity owned 50% or more by sanctioned persons is blocked even if it is not listed. Terrorism and proliferation sanctions under UN resolutions and FATF R.6 and R.7 require freezing without delay, and the bank cannot release funds on its own judgement afterwards.', 'Quyền sở hữu cũng quan trọng như tên. Theo Quy tắc 50% của OFAC, pháp nhân do người bị cấm vận sở hữu từ 50% trở lên bị chặn dù không có tên trong danh sách. Cấm vận khủng bố và phổ biến vũ khí theo nghị quyết Liên Hợp Quốc và R.6, R.7 của FATF yêu cầu phong tỏa ngay, và ngân hàng không tự giải tỏa sau đó.'),
      L('Evasion to look for: stripping (removing a name or country from a message before it is passed on), a sudden new intermediary, misspelled names resubmitted after a rejection, and shell companies recently set up in a neighbouring jurisdiction.', 'Thủ đoạn lẩn tránh cần chú ý: xóa bỏ thông tin (bỏ tên hoặc quốc gia trong điện trước khi chuyển tiếp), bên trung gian mới đột ngột, tên viết sai gửi lại sau khi bị từ chối, và công ty vỏ bọc mới lập ở nước lân cận.'),
    ],
    keywords: ['jaro-winkler', 'fuzzy', 'ofac', '50 percent', 'quy tac 50', 'stripping', 'transliteration', 'phien am', 'r.6', 'freeze', 'phong toa'],
  },
  {
    id: 'aml-adv-settlement',
    level: 'advanced',
    rule: L('Every bank in the chain must be able to see who really paid and who is really being paid.', 'Mọi ngân hàng trong chuỗi phải thấy được ai thực sự trả và ai thực sự nhận.'),
    title: L('Multi-party settlement and correspondent risk', 'Quyết toán nhiều bên và rủi ro ngân hàng đại lý'),
    paragraphs: [
      L('A cross-border payment passes through several banks, and each one relies on the others’ controls. Laundering risk therefore travels along the chain, and a respondent’s failure can cost its correspondent the relationship.', 'Thanh toán xuyên biên giới đi qua nhiều ngân hàng, mỗi bên dựa vào kiểm soát của bên khác. Rủi ro rửa tiền vì thế đi theo chuỗi, và thất bại của ngân hàng đại diện có thể khiến đại lý chấm dứt quan hệ.'),
    ],
    advanced: [
      L('In a serial payment, each bank in the chain sees the full MT103 or pacs.008. In a cover payment, the customer’s message goes straight to the payee’s bank while a separate MT202 COV or pacs.009 COV settles through correspondents. The cover must carry the original payer and payee, or the intermediaries would be screening a payment they cannot see.', 'Trong thanh toán nối tiếp, mỗi ngân hàng trong chuỗi thấy toàn bộ MT103 hoặc pacs.008. Trong thanh toán phủ, điện của khách đi thẳng tới ngân hàng người nhận, còn MT202 COV hoặc pacs.009 COV riêng quyết toán qua đại lý. Điện phủ phải mang người trả và người nhận gốc, nếu không bên trung gian sàng lọc một lệnh mà họ không thấy.'),
      L('FATF R.13 requires extra diligence on correspondents: their ownership, their AML controls, and senior approval. Nesting is the classic risk, where an unknown bank reaches the correspondent through a respondent’s account. A shell bank with no physical presence must never be served. De-risking is the side effect, as banks exit whole corridors rather than manage them, which pushes customers to less visible channels.', 'R.13 của FATF yêu cầu thẩm định tăng cường với đại lý: sở hữu, kiểm soát AML và phê duyệt của lãnh đạo. Lồng ghép là rủi ro điển hình, khi một ngân hàng không rõ tiếp cận đại lý qua tài khoản của ngân hàng đại diện. Không bao giờ phục vụ ngân hàng vỏ bọc không có hiện diện thực. Phi rủi ro hóa là hệ quả phụ, khi ngân hàng rời bỏ cả hành lang thay vì quản lý, đẩy khách sang kênh khó giám sát hơn.'),
      L('Trade-based laundering hides value inside invoices: over- or under-pricing, invoicing the same shipment twice, or describing goods falsely. Compare the price with the market, the goods with the customer’s line of business, and the route with what is normal for those goods.', 'Rửa tiền qua thương mại giấu giá trị trong hóa đơn: khai giá cao hoặc thấp, lập hóa đơn hai lần cho một lô hàng, hoặc mô tả sai hàng hóa. So giá với thị trường, hàng hóa với ngành nghề của khách và tuyến đường với thông lệ của mặt hàng đó.'),
    ],
    keywords: ['serial', 'cover payment', 'mt202 cov', 'pacs.009', 'nesting', 'long ghep', 'shell bank', 'r.13', 'correspondent', 'dai ly', 'tbml', 'trade based', 'de-risking'],
  },
  {
    id: 'aml-adv-edge-cases',
    level: 'advanced',
    rule: L('Report on suspicion even when it is late, and never tell the customer.', 'Báo cáo khi có nghi ngờ dù đã muộn, và không bao giờ nói cho khách biết.'),
    title: L('Complex cases and how to handle them', 'Tình huống phức tạp và cách xử lý'),
    paragraphs: [L('Cases rarely match a textbook typology. These show the judgement an experienced analyst brings.', 'Tình huống hiếm khi đúng như sách. Những ví dụ này cho thấy nhận định của chuyên viên giàu kinh nghiệm.')],
    advanced: [],
    table: {
      columns: [L('Situation', 'Tình huống'), L('Trap', 'Cái bẫy'), L('What to do', 'Cách xử lý')],
      rows: [
        [L('A customer asks why their account is frozen', 'Khách hỏi vì sao tài khoản bị phong tỏa'), L('Explaining tips them off, which is an offence', 'Giải thích là báo trước, đây là hành vi vi phạm'), L('A neutral script: “a routine review”. Escalate the contact to compliance', 'Dùng lời chuẩn: “rà soát định kỳ”. Chuyển việc liên hệ cho tuân thủ')],
        [L('An elderly customer sends savings to a “police officer”', 'Khách lớn tuổi chuyển tiền tiết kiệm cho “công an”'), L('They are a victim, not a launderer; the receiving account is the mule', 'Họ là nạn nhân, không phải kẻ rửa tiền; tài khoản nhận mới là trung gian'), L('Stop the payment if you can, talk to the customer, report on the receiving account', 'Dừng lệnh nếu có thể, trao đổi với khách, báo cáo tài khoản nhận')],
        [L('Salary-sized deposits from many unrelated people', 'Các khoản như lương từ nhiều người không liên quan'), L('Looks like income; may be a funnel account', 'Trông như thu nhập; có thể là tài khoản gom tiền'), L('Check the employer’s records and the outflow pattern', 'Kiểm tra hồ sơ công ty và mẫu hình tiền ra')],
        [L('A PEP’s relative makes a normal purchase', 'Người thân của PEP mua hàng bình thường'), L('PEP status is not proof of wrongdoing', 'Là PEP không phải bằng chứng sai phạm'), L('Apply EDD and source-of-wealth checks, and do not refuse by reflex', 'Áp dụng EDD và kiểm tra nguồn tài sản, không từ chối theo phản xạ')],
        [L('A crypto exchange pays out to a customer', 'Sàn crypto trả tiền cho khách'), L('Source of funds stops at the exchange', 'Nguồn tiền dừng ở sàn'), L('Ask for the on-chain history and the exchange’s statement', 'Yêu cầu lịch sử trên chuỗi và sao kê của sàn')],
        [L('An alert was closed, then the same pattern repeats', 'Cảnh báo đã đóng, rồi mẫu hình lặp lại'), L('Each alert looks harmless on its own', 'Từng cảnh báo riêng lẻ trông vô hại'), L('Review them together: the sum may meet the suspicion test', 'Xem xét chung: tổng thể có thể đủ căn cứ nghi ngờ')],
        [L('A suspicion arises after the payment has gone', 'Nghi ngờ phát sinh sau khi lệnh đã đi'), L('It feels too late to report', 'Có vẻ đã quá muộn để báo cáo'), L('Report anyway: the duty rests on suspicion, not on whether money can be recovered', 'Vẫn báo cáo: nghĩa vụ dựa trên sự nghi ngờ, không phụ thuộc tiền có thu hồi được không')],
      ],
    },
    keywords: ['tipping off', 'bao truoc', 'scam', 'lua dao', 'funnel', 'gom tien', 'pep', 'crypto', 'source of wealth', 'edge case', 'tinh huong'],
  },
  {
    id: 'aml-adv-audit',
    level: 'advanced',
    rule: L('If it is not written down, it did not happen.', 'Không ghi lại thì coi như chưa xảy ra.'),
    title: L('Audit trail and the three lines of defence', 'Dấu vết kiểm toán và ba tuyến phòng thủ'),
    paragraphs: [
      L('If a decision is not recorded, a regulator treats it as not made. An audit trail must let a stranger rebuild, years later, what was known, who decided, and why.', 'Quyết định không được ghi lại thì cơ quan quản lý coi như chưa có. Dấu vết kiểm toán phải giúp một người ngoài dựng lại, nhiều năm sau, điều gì đã biết, ai quyết định và vì sao.'),
    ],
    advanced: [
      L('Each case needs the alert and its rule version, the evidence reviewed, the analyst’s reasoning in their own words, the approver, each timestamp, and the report’s reference number. A decision not to report needs a reason as much as a decision to report. Records are append-only: a correction adds a new entry and leaves the old one visible.', 'Mỗi hồ sơ cần cảnh báo và phiên bản quy tắc, bằng chứng đã xem, lập luận của chuyên viên, người duyệt, từng thời điểm và số tham chiếu báo cáo. Quyết định không báo cáo cũng cần lý do như quyết định báo cáo. Hồ sơ chỉ được thêm: sửa đổi tạo mục mới và giữ mục cũ.'),
      L('Three lines of defence separate the roles. The business owns the risk and does the first checks, compliance sets the policy and tests it, and internal audit independently tests both. The AML reporting officer must be able to file a report without the business’s permission, and maker-checker keeps one person from both raising and clearing an item.', 'Ba tuyến phòng thủ tách biệt vai trò. Kinh doanh sở hữu rủi ro và kiểm tra đầu tiên, tuân thủ đặt chính sách và kiểm thử, và kiểm toán nội bộ kiểm thử độc lập cả hai. Cán bộ báo cáo AML phải được gửi báo cáo mà không cần phép của kinh doanh, và cơ chế lập-kiểm soát ngăn một người vừa tạo vừa xử lý.'),
      L('Models are audited too. Scoring and screening systems need documented validation, data lineage from the core to the monitoring system, and a check that no transaction type is falling outside monitoring. Missing feeds are among the costliest findings: AUSTRAC’s large enforcement cases have turned on reports that automated systems failed to send.', 'Mô hình cũng phải được kiểm toán. Hệ thống chấm điểm và sàng lọc cần thẩm định có hồ sơ, truy vết dữ liệu từ core đến hệ thống giám sát và kiểm tra không có loại giao dịch nào nằm ngoài giám sát. Thiếu nguồn dữ liệu là một trong các phát hiện tốn kém nhất: các vụ cưỡng chế lớn của AUSTRAC xoay quanh báo cáo mà hệ thống tự động không gửi.'),
    ],
    flow: [
      L('Alert raised', 'Phát sinh cảnh báo'),
      L('L1 analyst reviews and writes reasons', 'Chuyên viên tuyến 1 xem xét và ghi lý do'),
      L('L2 / reporting officer decides', 'Tuyến 2 / cán bộ báo cáo quyết định'),
      L('Report filed, or closed with reasons', 'Gửi báo cáo, hoặc đóng kèm lý do'),
      L('Records kept for the retention period', 'Lưu hồ sơ đủ thời hạn'),
    ],
    keywords: ['audit trail', 'dau vet kiem toan', 'three lines', 'ba tuyen', 'maker checker', 'mlro', 'model validation', 'data lineage', 'retention', 'luu tru'],
  },
];
