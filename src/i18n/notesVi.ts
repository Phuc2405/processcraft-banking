/** Vietnamese for the sentences the process engine and the walkthrough builder write about one payment. */

import { activeLocale } from './localeCore';

type Rule = readonly [RegExp, (m: RegExpExecArray) => string];

const EXACT: Readonly<Record<string, string>> = {
  // Walkthrough: how the last box of a diagram reads
  'The money leaves the account and the receiving bank is told yes. This cannot be called back.': 'Tiền rời tài khoản và ngân hàng nhận được báo đồng ý. Không thể gọi lại.',
  'The message is refused at the door, with the field at fault named. No money was touched.': 'Thông điệp bị từ chối ngay tại cửa, kèm tên trường bị lỗi. Không động tới tiền.',
  'The message was fine, but the account does not hold enough. The transfer is declined.': 'Thông điệp ổn, nhưng tài khoản không đủ tiền. Lệnh chuyển bị từ chối.',
  'No name hit and no structuring. The payment is released.': 'Không trùng tên và không chia nhỏ. Giao dịch được giải phóng.',
  'The name was a near-miss and the audit log proves it. The payment is released, and the reason is kept for the auditors.': 'Cái tên chỉ suýt trùng và nhật ký kiểm toán chứng minh điều đó. Giao dịch được giải phóng, lý do được lưu cho kiểm toán viên.',
  'No name hit, but the deposits were split to stay under the reporting line. A report is filed and the payment is parked.': 'Không trùng tên, nhưng tiền nộp đã bị chia nhỏ để nằm dưới ngưỡng báo cáo. Báo cáo được nộp và giao dịch bị treo.',
  'The investigation found a true match on a sanctions list. The payment is blocked.': 'Cuộc điều tra tìm thấy trùng thật với danh sách cấm vận. Giao dịch bị chặn.',
  'A true match on a politically-exposed-person list. The payment waits until the customer explains where the money comes from.': 'Trùng thật với danh sách người có ảnh hưởng chính trị. Giao dịch chờ cho tới khi khách giải trình nguồn tiền.',
  'The log could neither prove nor rule out a match. A senior analyst takes over and the payment waits.': 'Nhật ký không chứng minh cũng không loại trừ được việc trùng. Một chuyên viên cấp cao tiếp nhận và giao dịch phải chờ.',
  'A new claim. The bank asks the merchant for the receipt before anyone is out of pocket.': 'Một khiếu nại mới. Ngân hàng yêu cầu cửa hàng xuất trình hóa đơn trước khi ai đó mất tiền.',
  'The merchant sent nothing, so the bank files the first chargeback and credits the cardholder.': 'Cửa hàng không gửi gì, nên ngân hàng nộp tra soát lần đầu và ghi có cho chủ thẻ.',
  'The merchant has answered, and the bank reviews whether the evidence is good enough.': 'Cửa hàng đã phản hồi, và ngân hàng xem xét bằng chứng có đủ thuyết phục không.',
  'The bank rejects the merchant’s answer and escalates to pre-arbitration.': 'Ngân hàng bác phản hồi của cửa hàng và chuyển lên tiền trọng tài.',
  'The cardholder keeps the refund. The loss falls on the merchant.': 'Chủ thẻ giữ khoản hoàn tiền. Tổn thất thuộc về cửa hàng.',
  'The purchase was authenticated, so the liability for fraud sits with the issuer. The bank refunds the cardholder and takes the loss.': 'Giao dịch đã được xác thực, nên trách nhiệm gian lận thuộc ngân hàng phát hành. Ngân hàng hoàn tiền cho chủ thẻ và tự chịu tổn thất.',
  'The merchant’s evidence was compelling. The credit is taken back from the cardholder.': 'Bằng chứng của cửa hàng thuyết phục. Khoản ghi có bị thu lại từ chủ thẻ.',
  'The claim was brought after the filing window closed. It is refused, whoever would have paid.': 'Khiếu nại được đưa ra sau khi thời hạn đã đóng. Nó bị từ chối, dù ai lẽ ra phải trả.',
  'This payment was fraud, and the bank has just agreed to repay it.': 'Giao dịch này là gian lận, và ngân hàng vừa đồng ý hoàn trả nó.',
  'This payment was fraud, and the bank stopped it.': 'Giao dịch này là gian lận, và ngân hàng đã chặn được.',
  'The hold is in place and the shop is told yes.': 'Tiền đã được khoanh giữ và cửa hàng được báo đồng ý.',
  'The shop is told no.': 'Cửa hàng được báo không.',
  'This run ends here: the customer is sent to their phone. The diagram will run again when they come back.': 'Lần chạy này dừng ở đây: khách được chuyển sang điện thoại. Sơ đồ sẽ chạy lại khi họ quay về.',
  'Settled. But there was a real mistake in these records, and the tolerance matched it away. Nobody will ever look at it.': 'Đã quyết toán. Nhưng các bản ghi này có một lỗi thật, và biên sai số đã khớp mất nó. Sẽ không ai xem lại.',
  'Settled. The records agree within the tolerance.': 'Đã quyết toán. Các bản ghi khớp trong biên sai số.',
  'Parked in suspense, though the difference was only rounding dust. Someone will spend time on nothing.': 'Bị treo, dù khoản chênh chỉ là sai số làm tròn. Sẽ có người mất thời gian vô ích.',
  'The vault has never issued this virtual card number. It raises an error, and the error wire takes the payment straight to Declined.': 'Kho chưa từng phát hành số thẻ ảo này. Nó báo lỗi, và nhánh lỗi đưa giao dịch thẳng tới Từ chối.',
  'The scheme has no clearing record for this payment.': 'Tổ chức thẻ không có bản ghi bù trừ nào cho giao dịch này.',
  'On the next working day an ops clerk investigates and clears the item.': 'Ngày làm việc tiếp theo, nhân viên vận hành điều tra và xử lý mục này.',
  'The customer types the code. The payment comes back marked “challenge completed”.': 'Khách nhập mã. Giao dịch quay lại với đánh dấu “đã hoàn tất thử thách”.',
  'The customer never types the code. The payment comes back marked “challenge abandoned”.': 'Khách không bao giờ nhập mã. Giao dịch quay lại với đánh dấu “bỏ dở thử thách”.',
  'The record arrives with its three amounts.': 'Bản ghi đến kèm ba số tiền của nó.',
  // Walkthrough verdicts
  Released: 'Đã giải phóng',
  'The transfer is final: the money has left the account and the bank earns a small fee. There is no night cycle to catch a mistake.': 'Lệnh chuyển là cuối cùng: tiền đã rời tài khoản và ngân hàng hưởng một khoản phí nhỏ. Không có chu kỳ đêm nào bắt được sai sót.',
  'Rejected: invalid message': 'Từ chối: thông điệp không hợp lệ',
  'Refused at the door, before any money was touched. The sending app is told which field to fix.': 'Bị từ chối ngay tại cửa, trước khi động tới tiền. Ứng dụng gửi được báo trường nào cần sửa.',
  'Declined: not enough money': 'Từ chối: không đủ tiền',
  'The message was fine. The customer’s balance is not the bank’s fault, and nothing the bank’s rules could change.': 'Thông điệp ổn. Số dư của khách không phải lỗi của ngân hàng, và không quy tắc nào của ngân hàng thay đổi được.',
  'A clean customer, and the best screening is the kind they never notice.': 'Một khách trong sạch, và sàng lọc tốt nhất là loại họ không bao giờ nhận ra.',
  'Cleared: false positive': 'Giải tỏa: cảnh báo sai',
  'The name looked like a sanctioned person’s, and the bank’s own evidence proved it was not. The customer is kept and the audit trail says why.': 'Cái tên trông giống người bị cấm vận, và bằng chứng của chính ngân hàng chứng minh không phải. Khách được giữ lại và dấu vết kiểm toán ghi rõ lý do.',
  'Reported: structuring': 'Đã báo cáo: chia nhỏ giao dịch',
  'Splitting deposits to stay under the reporting line is an offence in itself, even when the money is clean.': 'Chia nhỏ tiền nộp để nằm dưới ngưỡng báo cáo tự nó là vi phạm, kể cả khi tiền sạch.',
  'Blocked: sanctions match': 'Bị chặn: trùng cấm vận',
  'A confirmed match on a sanctions list. Dealing with a sanctioned person is illegal, so the payment stops here.': 'Trùng xác nhận với danh sách cấm vận. Giao dịch với người bị cấm vận là bất hợp pháp, nên giao dịch dừng tại đây.',
  'Held: source of funds requested': 'Tạm giữ: yêu cầu giải trình nguồn tiền',
  'A politically exposed person is risky, not forbidden. The bank asks where the money comes from.': 'Người có ảnh hưởng chính trị là rủi ro, không bị cấm. Ngân hàng hỏi tiền từ đâu ra.',
  'Escalated: enhanced due diligence': 'Chuyển cấp: thẩm định tăng cường',
  'The evidence could neither prove nor rule out a match, so a senior analyst takes over.': 'Bằng chứng không chứng minh cũng không loại trừ được việc trùng, nên một chuyên viên cấp cao tiếp nhận.',
  'Receipt requested from the merchant': 'Đã yêu cầu cửa hàng xuất trình hóa đơn',
  'The first move on a new claim. Most disputes end here, when the merchant proves delivery.': 'Bước đầu tiên với khiếu nại mới. Phần lớn khiếu nại kết thúc ở đây, khi cửa hàng chứng minh đã giao hàng.',
  'First chargeback filed': 'Đã nộp tra soát lần đầu',
  'The cardholder is credited at once. Who ends up paying is decided in the next stages.': 'Chủ thẻ được ghi có ngay. Ai cuối cùng phải trả sẽ được quyết ở các giai đoạn sau.',
  'Representment under review': 'Đang xem xét phản hồi của cửa hàng',
  'The merchant has fought back, and the bank decides whether the evidence is enough.': 'Cửa hàng đã phản hồi, và ngân hàng quyết định bằng chứng có đủ không.',
  'Escalated to pre-arbitration': 'Đã chuyển lên tiền trọng tài',
  'The last chance to settle before the card scheme has to rule.': 'Cơ hội cuối để thương lượng trước khi tổ chức thẻ phải phân xử.',
  'Cardholder refunded': 'Chủ thẻ được hoàn tiền',
  'The loss falls on the merchant, who gave no answer or none good enough.': 'Tổn thất thuộc về cửa hàng, vì không phản hồi hoặc phản hồi không đủ thuyết phục.',
  'Issuer absorbs the loss': 'Ngân hàng phát hành tự chịu tổn thất',
  'The purchase was authenticated with 3-D Secure, so the liability for fraud shifted to the issuer. The merchant did everything the scheme asks.': 'Giao dịch đã được xác thực bằng 3-D Secure, nên trách nhiệm gian lận chuyển sang ngân hàng phát hành. Cửa hàng đã làm đủ mọi điều tổ chức thẻ yêu cầu.',
  'Merchant won': 'Cửa hàng thắng',
  'Compelling evidence keeps the sale, and the cardholder’s provisional credit is taken back.': 'Bằng chứng thuyết phục giữ được đơn hàng, và khoản ghi có tạm thời của chủ thẻ bị thu lại.',
  'Time-barred': 'Hết thời hiệu',
  'A claim that is out of time is dead, whoever would have paid.': 'Khiếu nại quá hạn là hết hiệu lực, dù ai lẽ ra phải trả.',
  Screened: 'Đã sàng lọc',
  'Dispute decided': 'Đã phân xử khiếu nại',
  Settled: 'Đã quyết toán',
  'A real mistake, caught. It costs a clerk’s time, which is what the suspense account is for.': 'Một lỗi thật, đã bị bắt. Nó tốn thời gian của một nhân viên, và tài khoản treo tồn tại chính vì việc đó.',
  'The difference was only dust. This is a false break: work for no reason.': 'Khoản chênh chỉ là sai số vụn. Đây là sai lệch giả: tốn công vô ích.',
  'The records disagreed, but the tolerance was wide enough to match the mistake away.': 'Các bản ghi không khớp, nhưng biên sai số đủ rộng để khớp mất lỗi.',
  'The three records agree within the tolerance.': 'Ba bản ghi khớp nhau trong biên sai số.',
  'Approved: Pay-in-4': 'Đã duyệt: trả góp 4 kỳ',
  'Approved: paid in full by card': 'Đã duyệt: trả đủ bằng thẻ',
  Approved: 'Đã duyệt',
  'A plan is live: the bank earns a fee and carries the risk of the unpaid instalments.': 'Kế hoạch đã chạy: ngân hàng hưởng phí và gánh rủi ro các kỳ chưa trả.',
  'A genuine sale, approved.': 'Một giao dịch thật, đã được duyệt.',
  'A genuine customer was turned away by a rule. That is a lost sale and an unhappy customer.': 'Một khách thật bị quy tắc từ chối. Đó là một đơn hàng mất và một khách hàng không vui.',
  'The customer could not pay, or the card was not valid. Nothing the bank’s rules could have done differently.': 'Khách không trả được, hoặc thẻ không hợp lệ. Quy tắc của ngân hàng không thể làm khác được.',
  // Engine notes
  'Not a virtual card, so there is no token to resolve.': 'Không phải thẻ ảo, nên không có token để tra cứu.',
  'Not a virtual card, so there is no dynamic CVV.': 'Không phải thẻ ảo, nên không có CVV động.',
  'No vault entry to compare the dCVV against (run the Token Vault first).': 'Không có bản ghi trong kho để so dCVV (hãy chạy Kho token trước).',
  'The CVV entered does not match the current dCVV.': 'CVV được nhập không khớp với dCVV hiện hành.',
  'This check is set to debit the first instalment, but no Pay-in-4 plan was approved on this path, so there is no down payment to debit. Nothing was held.': 'Lần kiểm tra này được đặt để trừ kỳ đầu, nhưng không có kế hoạch trả 4 kỳ nào được duyệt trên nhánh này, nên không có khoản trả trước để trừ. Không khoanh giữ gì.',
  'No pacs.008 message arrived with this payment, so there is nothing to validate or route.': 'Không có thông điệp pacs.008 nào đi kèm giao dịch này, nên không có gì để kiểm tra hay định tuyến.',
  'No customer profile came with this payment, so nothing could be screened.': 'Không có hồ sơ khách hàng đi kèm giao dịch này, nên không sàng lọc được gì.',
  'The watchlists are empty, so there is no name to match.': 'Danh sách theo dõi trống, nên không có tên nào để so.',
  'No structuring pattern in the cash deposits.': 'Không có dấu hiệu chia nhỏ trong các lần nộp tiền mặt.',
  'There is no customer profile to investigate.': 'Không có hồ sơ khách hàng để điều tra.',
  'There is no dispute case on this payment.': 'Giao dịch này không có vụ khiếu nại nào.',
  'The 3DS Risk Evaluator has not run on this path, so the desk cannot see whether the purchase was authenticated and treats it as not.': 'Bộ đánh giá rủi ro 3DS chưa chạy trên nhánh này, nên quầy không thấy giao dịch có được xác thực không và coi là chưa.',
  'The funding source is unknown (the Token Vault has not run), so it is treated as debit.': 'Không rõ nguồn tiền (Kho token chưa chạy), nên được coi là ghi nợ.',
  'A new claim starts with a retrieval request: ask the merchant for the receipt before taking the money back.': 'Khiếu nại mới bắt đầu bằng yêu cầu chứng từ: yêu cầu cửa hàng xuất trình hóa đơn trước khi thu hồi tiền.',
  'The purchase was authenticated with 3-D Secure, so liability for fraud shifted to the issuer. The scheme does not allow a chargeback; the bank absorbs the loss.': 'Giao dịch đã được xác thực bằng 3-D Secure, nên trách nhiệm gian lận chuyển sang ngân hàng phát hành. Tổ chức thẻ không cho phép tra soát; ngân hàng tự chịu tổn thất.',
  'The audit log holds no verified identity document, so nothing independent can be compared with the listed person.': 'Nhật ký kiểm toán không có giấy tờ danh tính đã xác minh nào, nên không có gì độc lập để so với người trong danh sách.',
  'The verified documents disagree with each other, so the record cannot be trusted either way.': 'Các giấy tờ đã xác minh mâu thuẫn nhau, nên không thể tin bản ghi theo hướng nào.',
  'Not a settlement record, so there is nothing to reconcile.': 'Không phải bản ghi quyết toán, nên không có gì để đối soát.',
};

const STAGE_VI: Readonly<Record<string, string>> = {
  'retrieval request': 'yêu cầu chứng từ',
  'first chargeback': 'tra soát lần đầu',
  representment: 'phản hồi của cửa hàng',
  'pre arbitration': 'tiền trọng tài',
  'resolved cardholder': 'chủ thẻ thắng',
  'resolved merchant': 'cửa hàng thắng',
  none: 'không có bước tiếp',
};
const EVIDENCE_VI: Readonly<Record<string, string>> = { none: 'không có', weak: 'yếu', compelling: 'thuyết phục' };
const VERDICT_VI: Readonly<Record<string, string>> = { 'FALSE POSITIVE': 'CẢNH BÁO SAI', 'TRUE MATCH': 'TRÙNG THẬT', INCONCLUSIVE: 'CHƯA KẾT LUẬN' };
const MATCH_VI: Readonly<Record<string, string>> = { match: 'khớp', mismatch: 'không khớp', unknown: 'không rõ' };
const PATH_VI: Readonly<Record<string, string>> = { FRICTIONLESS: 'KHÔNG MA SÁT', CHALLENGE: 'THỬ THÁCH', CHALLENGE_PASSED: 'ĐÃ QUA THỬ THÁCH', CHALLENGE_FAILED: 'THỬ THÁCH THẤT BẠI', REJECT: 'TỪ CHỐI' };
const LEG_VI: Readonly<Record<string, string>> = { 'core ledger': 'sổ cái lõi', 'scheme clearing file': 'tệp bù trừ của tổ chức thẻ', 'acquirer settlement report': 'báo cáo quyết toán của ngân hàng thanh toán' };
const legs = (s: string): string =>
  s
    .split(' and ')
    .map((x) => LEG_VI[x] ?? x)
    .join(' và ');
const what = (s: string): string => s.replace(/^Down payment of /, 'Khoản trả trước ');

const RULES: readonly Rule[] = [
  // Engine
  [/^DPAN (\S+) maps to card ending (\d+), funded by (\w+); token is (\w+)\.$/, (m) => `DPAN ${m[1]} trỏ tới thẻ đuôi ${m[2]}, nguồn tiền ${m[3] === 'DEBIT' ? 'ghi nợ' : m[3] === 'CREDIT' ? 'tín dụng' : 'trả trước'}; token ${m[4] === 'ACTIVE' ? 'đang hoạt động' : 'bị tạm ngưng'}.`],
  [/^dCVV matches and is ([\d.]+) s old, window (\d+) s: (expired|valid)\.$/, (m) => `dCVV khớp và đã được ${m[1]} giây, cửa sổ ${m[2]} giây: ${m[3] === 'valid' ? 'hợp lệ' : 'hết hạn'}.`],
  [/^The request is timestamped before the dCVV was issued \(([\d.-]+) s old, window (\d+) s\)\.$/, (m) => `Yêu cầu có dấu thời gian trước khi dCVV được cấp (${m[1]} giây, cửa sổ ${m[2]} giây).`],
  [/^(\w+): risk (\d+) is at or above the reject line \((\d+)\)\.$/, (m) => `${PATH_VI[m[1]!] ?? m[1]}: rủi ro ${m[2]} bằng hoặc trên ngưỡng từ chối (${m[3]}).`],
  [/^(\w+): risk (\d+) is below (\d+)\.$/, (m) => `${PATH_VI[m[1]!] ?? m[1]}: rủi ro ${m[2]} dưới ${m[3]}.`],
  [/^(\w+): risk (\d+) needs a challenge and it was completed\.$/, (m) => `${PATH_VI[m[1]!] ?? m[1]}: rủi ro ${m[2]} cần thử thách và đã hoàn tất.`],
  [/^(\w+): risk (\d+) needs a challenge and none has been done yet\.$/, (m) => `${PATH_VI[m[1]!] ?? m[1]}: rủi ro ${m[2]} cần thử thách và chưa có thử thách nào.`],
  [/^(\w+): risk (\d+) needs a challenge and it ended (\w+)\.$/, (m) => `${PATH_VI[m[1]!] ?? m[1]}: rủi ro ${m[2]} cần thử thách và đã kết thúc ở trạng thái ${m[3]}.`],
  [/^(.+?) exceeds the spendable credit of (\$[\d,.]+) \(available (\$[\d,.]+), limit (\$[\d,.]+)\)\.$/, (m) => `${what(m[1]!)} vượt hạn mức có thể chi ${m[2]} (khả dụng ${m[3]}, hạn mức ${m[4]}).`],
  [/^(.+?) is within spendable credit of (\$[\d,.]+)\. Hold of (\$[\d,.]+) placed\.$/, (m) => `${what(m[1]!)} nằm trong hạn mức có thể chi ${m[2]}. Đã khoanh giữ ${m[3]}.`],
  [/^(.+?) exceeds the available balance of (\$[\d,.]+)\.$/, (m) => `${what(m[1]!)} vượt số dư khả dụng ${m[2]}.`],
  [/^(.+?) is within the available balance of (\$[\d,.]+)\. Hold of (\$[\d,.]+) placed\.$/, (m) => `${what(m[1]!)} nằm trong số dư khả dụng ${m[2]}. Đã khoanh giữ ${m[3]}.`],
  [/^Break: no record in the (.+)\.$/, (m) => `Sai lệch: không có bản ghi trong ${legs(m[1]!)}.`],
  [/^Break: the clearing file presented this transaction (\d+) times\.$/, (m) => `Sai lệch: tệp bù trừ trình giao dịch này ${m[1]} lần.`],
  [/^Matched: the legs differ by (\$[\d,.]+), within the (\$[\d,.]+) tolerance\.$/, (m) => `Khớp: các vế chênh ${m[1]}, trong biên sai số ${m[2]}.`],
  [/^Break: the legs differ by (\$[\d,.]+)\. (.+) That is a foreign-exchange (loss|gain), not an error\.$/, (m) => `Sai lệch: các vế chênh ${m[1]}. ${noteSentence(m[2]!)} Đó là ${m[3] === 'loss' ? 'lỗ' : 'lãi'} tỷ giá, không phải lỗi.`],
  [/^Break: the legs differ by (\$[\d,.]+), more than the (\$[\d,.]+) tolerance\.(.*)$/, (m) => `Sai lệch: các vế chênh ${m[1]}, nhiều hơn biên sai số ${m[2]}.${m[3] ? ` ${noteText(m[3].trim())}` : ''}`],
  [/^The rates explain it: (\w+) booked at ([\d.]+), settled at ([\d.]+): that moves the amount by (\$[\d,.]+)\.$/, (m) => `Tỷ giá giải thích được: ${m[1]} ghi sổ ở ${m[2]}, quyết toán ở ${m[3]}: làm số tiền thay đổi ${m[4]}.`],
  [/^Ineligible: (.+)\.$/, (m) => `Không đủ điều kiện: ${m[1]!.replace(/score (\d+) is below (\d+)/, 'điểm $1 dưới $2').replace(/down payment is (\d+)% of the amount, below (\d+)%/, 'khoản trả trước là $1% số tiền, dưới $2%').replace(' and ', ' và ')}.`],
  [/^Eligible: score (\d+), down payment (\d+)%\. Instalment 1 of (\$[\d,.]+) is due now; 3 more of (\$[\d,.]+)\. It is not debited until a ledger check collects it\.$/, (m) => `Đủ điều kiện: điểm ${m[1]}, trả trước ${m[2]}%. Kỳ 1 ${m[3]} đến hạn ngay; thêm 3 kỳ mỗi kỳ ${m[4]}. Chưa trừ tiền cho tới khi một lần kiểm tra sổ cái thu nó.`],
  [/^pacs\.008 is (well formed|invalid \((.+)\))\. Rail (\w+): (\$[\d,.]+) against an instant limit of (\$[\d,.]+)\. (\w+) \(purpose (\w+)\)\. queue (\d+) of (\d+) \((congested|open)\)\. Liquidity (\w+): (priority payments may use all|ordinary payments may use only what is above the reserve:) (\$[\d,.]+) of (\$[\d,.]+)\.$/, (m) =>
    `pacs.008 ${m[1] === 'well formed' ? 'đúng định dạng' : `không hợp lệ (${m[2]})`}. Kênh ${m[3]}: ${m[4]} so với hạn mức tức thì ${m[5]}. ${m[6] === 'PRIORITY' ? 'ƯU TIÊN' : 'THƯỜNG'} (mục đích ${m[7]}). Hàng chờ ${m[8]}/${m[9]} (${m[10] === 'congested' ? 'nghẽn' : 'thông'}). Thanh khoản ${m[11]}: ${m[12] === 'priority payments may use all' ? 'lệnh ưu tiên được dùng toàn bộ' : 'lệnh thường chỉ được dùng phần trên mức dự trữ:'} ${m[13]} trên ${m[14]}.`],
  [/^Closest name on the lists: '(.+)' \((\w+)\), score (\d+) against a threshold of (\d+): (no hit|HIT)\.$/, (m) => `Tên gần nhất trong danh sách: '${m[1]}' (${m[2]}), điểm ${m[3]} so với ngưỡng ${m[4]}: ${m[5] === 'HIT' ? 'TRÙNG' : 'không trùng'}.`],
  [/^Structuring: (\d+) cash deposits just under (\$[\d,.]+) total (\$[\d,.]+)\.$/, (m) => `Chia nhỏ giao dịch: ${m[1]} lần nộp tiền mặt ngay dưới ${m[2]}, tổng ${m[3]}.`],
  [/^(FALSE POSITIVE|TRUE MATCH|INCONCLUSIVE)\.$/, (m) => `${VERDICT_VI[m[1]!]}.`],
  [/^(\d+) verified identity (event|events) in the audit log\.$/, (m) => `${m[1]} sự kiện xác minh danh tính trong nhật ký kiểm toán.`],
  [/^The profile says (.+) but the verified document says (.+); the document wins\.$/, (m) => `Hồ sơ ghi ${m[1]} nhưng giấy tờ đã xác minh ghi ${m[2]}; giấy tờ được tin.`],
  [/^Date of birth (.+) against (.+) on the list: (\w+)\.$/, (m) => `Ngày sinh ${m[1]} so với ${m[2]} trong danh sách: ${MATCH_VI[m[3]!] ?? m[3]}.`],
  [/^Nationality (.+) against (.+) on the list: (\w+)\.$/, (m) => `Quốc tịch ${m[1]} so với ${m[2]} trong danh sách: ${MATCH_VI[m[3]!] ?? m[3]}.`],
  [/^The purchase is (\d+) days old and the filing window is (\d+) days, so the claim is time-barred\.$/, (m) => `Giao dịch đã ${m[1]} ngày và thời hạn khiếu nại là ${m[2]} ngày, nên khiếu nại đã hết thời hiệu.`],
  [/^At (.+) the merchant's answer is (\w+), so the case moves to (.+)\.$/, (m) => `Ở giai đoạn ${STAGE_VI[m[1]!] ?? m[1]}, phản hồi của cửa hàng ${EVIDENCE_VI[m[2]!] ?? m[2]}, nên vụ việc chuyển sang ${STAGE_VI[m[3]!] ?? m[3]}.`],
  // Walkthrough
  [/^A (\$[\d,.]+) transfer arrives as a pacs\.008 message\.$/, (m) => `Một lệnh chuyển ${m[1]} đến dưới dạng thông điệp pacs.008.`],
  [/^A (\$[\d,.]+) payment is about to leave, sent by (.+)\.$/, (m) => `Một khoản thanh toán ${m[1]} sắp rời ngân hàng, do ${m[2] === 'a customer' ? 'một khách hàng' : m[2]} gửi.`],
  [/^The cardholder disputes a (\$[\d,.]+) purchase\.$/, (m) => `Chủ thẻ khiếu nại một giao dịch ${m[1]}.`],
  [/^A (\$[\d,.]+) payment arrives\.$/, (m) => `Một giao dịch ${m[1]} đến.`],
  [/^This (\$[\d,.]+) payment is added to tonight’s clearing file\.$/, (m) => `Giao dịch ${m[1]} này được thêm vào tệp bù trừ đêm nay.`],
  [/^The scheme’s own record says (\$[\d,.]+), presented (\d+) times\.$/, (m) => `Bản ghi riêng của tổ chức thẻ ghi ${m[1]}, được trình ${m[2]} lần.`],
  [/^The scheme’s own record says (\$[\d,.]+)\.$/, (m) => `Bản ghi riêng của tổ chức thẻ ghi ${m[1]}.`],
  [/^(\$[\d,.]+) is parked in the suspense account \((.+)\)\.$/, (m) => `${m[1]} được treo vào tài khoản treo (${REASON_VI[m[2]!] ?? m[2]}).`],
  [/^(\$[\d,.]+) is parked in the suspense account\.$/, (m) => `${m[1]} được treo vào tài khoản treo.`],
  [/^Parked in suspense \((.+)\)\. A real mistake, correctly kept out of the settled pile\.$/, (m) => `Bị treo (${REASON_VI[m[1]!] ?? m[1]}). Một lỗi thật, được giữ ngoài nhóm đã quyết toán một cách đúng đắn.`],
  [/^Parked in suspense: (.+)$/, (m) => `Bị treo: ${REASON_VI[m[1]!] ?? m[1]}`],
  [/^Declined: (.+)$/, (m) => `Từ chối: ${DECLINE_VI[m[1]!.toLowerCase()] ?? m[1]}`],
  [/^Nothing else matched, so it took the default wire “(.+)”\.$/, (m) => `Không điều kiện nào khác khớp, nên nó đi nhánh mặc định “${m[1]}”.`],
  [/^Nothing else matched, so it took the default wire this wire\.$/, () => 'Không điều kiện nào khác khớp, nên nó đi nhánh mặc định này.'],
  [/^The rule (\(.+\) )?is true, so it took “(.+)”\.$/, (m) => `Quy tắc ${m[1] ?? ''}đúng, nên nó đi nhánh “${m[2]}”.`],
  [/^The rule (\(.+\) )?is true, so it took this wire\.$/, (m) => `Quy tắc ${m[1] ?? ''}đúng, nên nó đi nhánh này.`],
];

const REASON_VI: Readonly<Record<string, string>> = { 'amount variance': 'chênh lệch số tiền', 'missing leg': 'thiếu vế', duplicate: 'trùng lặp', unmatched: 'không khớp' };

const DECLINE_VI: Readonly<Record<string, string>> = {
  'not enough money': 'không đủ tiền',
  'expired dcvv': 'dCVV hết hạn',
  'wrong dcvv': 'sai dCVV',
  'unknown virtual card': 'thẻ ảo không xác định',
  '3ds rejected': '3DS từ chối',
  'otp never typed': 'không nhập OTP',
  'down payment declined': 'từ chối khoản trả trước',
  'atm pin locked, card kept': 'khóa PIN ATM, giữ thẻ',
  'transfer message rejected': 'thông điệp chuyển khoản bị từ chối',
  'atm dispenser jammed': 'kẹt bộ nhả tiền ATM',
  'customer gave up waiting': 'khách bỏ đi vì chờ lâu',
  'process error': 'lỗi xử lý',
};

/** One sentence (or a whole note matched as one), translated, or as written. */
function noteSentence(s: string): string {
  const exact = EXACT[s];
  if (exact) return exact;
  for (const [re, build] of RULES) {
    const m = re.exec(s);
    if (m) return build(m);
  }
  return s;
}

/** A note from the engine or the walkthrough, in the active language. */
export function noteText(text: string): string {
  if (activeLocale() !== 'vi' || !text) return text;
  const whole = noteSentence(text);
  if (whole !== text) return whole;
  // Several sentences: translate each. Split after a full stop that is followed by a space and a capital, a digit or a quote.
  const parts = text.split(/(?<=\.)\s+(?=[A-Z0-9'“(])/);
  if (parts.length < 2) return text;
  return parts.map(noteSentence).join(' ');
}

/** The Build Lab's alarm badges ("Break: amount mismatch", "Fraud slipped through"). The runner stores English; this shows it in the active language. */
export function alarmText(text: string): string {
  if (activeLocale() !== 'vi' || !text) return text;
  if (text === 'Fraud slipped through') return 'Gian lận đã lọt qua';
  if (text === 'Break settled as approved') return 'Sai lệch bị quyết toán như chấp thuận';
  const m = /^Break: (.+)$/.exec(text);
  return m ? `Sai lệch: ${m[1]}` : text;
}
