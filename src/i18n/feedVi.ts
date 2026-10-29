/** The Living Bank's feed, alerts and desk activity lines in Vietnamese. */

import { activeLocale } from './localeCore';
import { localizeScenarioText } from '../sim/scenarios';
import { dayScenarios } from './dayScenarios';

type Rule = readonly [RegExp, (m: RegExpExecArray) => string];

/** "☕ Corner Cafe Tap ($4.50)" → "☕ Chạm thẻ ở quán cà phê ($4.50)". Longest name first, and it never leaves a half-translated name. */
const scenarios = (text: string): string => localizeScenarioText(text, 'vi');

const DECLINE_VI: Readonly<Record<string, string>> = {
  funds: 'không đủ tiền',
  'dcvv expired': 'dCVV hết hạn',
  'dcvv mismatch': 'dCVV không khớp',
  'unknown dpan': 'DPAN không xác định',
  'three ds reject': '3DS từ chối',
  'otp abandoned': 'bỏ dở OTP',
  'down payment': 'không thu được khoản trả trước',
  'pin locked': 'khóa do sai PIN',
  'a2a invalid': 'thông điệp A2A lỗi',
  'atm jam': 'kẹt ATM',
  timeout: 'quá thời gian',
  'process error': 'lỗi xử lý',
  'ekyc liveness failed': 'eKYC không xác minh được danh tính',
  'biometric auth required': 'facePay không khớp khuôn mặt',
  'fds high risk device': 'fDS: thiết bị rủi ro cao',
  'aml sanction match': 'trùng danh sách cấm vận',
  'aml str blocked': 'bị chặn sau khi rà soát STR',
  'qr payload invalid': 'mã VietQR không hợp lệ',
  'swift invalid': 'điện SWIFT bị từ chối',
  'teller vault limit': 'vượt hạn mức tiền mặt tại quầy',
  'teller suspect note': 'tiền nghi giả tại quầy',
  'dispute rejected': 'khiếu nại bị từ chối',
};

const THREE_DS_VI: Readonly<Record<string, string>> = {
  'frictionless, waved through': 'xác thực liền mạch, cho qua',
  'sending a one-time code to the customer': 'gửi mã một lần cho khách',
  'code entered, authenticated': 'đã nhập mã, xác thực thành công',
  'no code entered, authentication failed': 'không nhập mã, xác thực thất bại',
  'too risky, rejected': 'rủi ro quá cao, từ chối',
  scoring: 'đang chấm điểm',
};

const CARD_VI: Readonly<Record<string, string>> = { 'debit card': 'thẻ ghi nợ', 'credit card': 'thẻ tín dụng', 'prepaid card': 'thẻ trả trước', 'virtual card': 'thẻ ảo' };

const CHAOS_VI: Readonly<Record<string, string>> = {
  'POS station outage': 'Sự cố trạm POS',
  '3DS HSM cryptography failure': 'Lỗi mật mã HSM của 3DS',
  'Network congestion': 'Nghẽn mạng',
  'Staff fatigue spike': 'Nhân viên kiệt sức đột ngột',
};

/** Notes that desks attach to a step, and sentences that are a template of their own. */
const NOTE_VI: Readonly<Record<string, string>> = {
  'The payment arrives.': 'Giao dịch đến.',
  'Settled.': 'Đã quyết toán.',
  'An ops clerk investigated and cleared the item.': 'Nhân viên vận hành đã điều tra và xử lý mục này.',
  'The customer typed the one-time code from their phone.': 'Khách đã nhập mã một lần từ điện thoại.',
  'The customer never entered the one-time code.': 'Khách không bao giờ nhập mã một lần.',
  'The cash count agreed the notes never came out, so the customer was refunded.': 'Kiểm quỹ xác nhận tiền chưa từng ra khỏi máy, nên khách đã được hoàn tiền.',
  'Every queue is clear.': 'Mọi hàng chờ đã trống.',
};

/** Phase 8 checkpoint verdicts (narration.ts), English → Vietnamese. Reason codes stay as written. */
const CHECK_VI: Readonly<Record<string, string>> = {
  'identity verified': 'đã xác minh danh tính',
  'liveness failed': 'không qua kiểm tra người thật',
  'face does not match the CCCD': 'khuôn mặt không khớp CCCD',
  'fake ID suspected': 'nghi giấy tờ giả',
  'not found in the National Citizen Database': 'không có trong Cơ sở dữ liệu quốc gia về dân cư',
  'dynamic QR, CRC ok, mapped to ISO 8583 0200': 'QR động, CRC hợp lệ, ánh xạ sang ISO 8583 0200',
  'static QR, CRC ok, mapped to ISO 8583 0200': 'QR tĩnh, CRC hợp lệ, ánh xạ sang ISO 8583 0200',
  'CRC mismatch, refused': 'sai CRC, từ chối',
  'amount disagrees, refused': 'số tiền không khớp, từ chối',
  'malformed EMVCo tags, refused': 'thẻ EMVCo sai định dạng, từ chối',
  'well formed, FX converted': 'đúng định dạng, đã quy đổi ngoại tệ',
  authorised: 'đã xác thực',
  'no face enrolled, BIOMETRIC_AUTH_REQUIRED': 'chưa đăng ký khuôn mặt, BIOMETRIC_AUTH_REQUIRED',
  BIOMETRIC_AUTH_REQUIRED: 'BIOMETRIC_AUTH_REQUIRED',
  clear: 'an toàn',
  FDS_HIGH_RISK_DEVICE: 'FDS_HIGH_RISK_DEVICE',
  clean: 'sạch',
  'STR_PENDING, PEP': 'STR_PENDING, người có ảnh hưởng chính trị (PEP)',
  'STR_PENDING, structuring': 'STR_PENDING, chia nhỏ giao dịch',
  'STR_PENDING, large cross-border': 'STR_PENDING, chuyển tiền quốc tế lớn',
  AML_SANCTION_MATCH: 'AML_SANCTION_MATCH',
  counted: 'đã kiểm đếm',
  'counted, CTR filed': 'đã kiểm đếm, đã lập CTR',
  'not enough cash in the till': 'không đủ tiền mặt trong ngăn kéo',
  'no reason': 'không lý do',
  PEP: 'PEP',
  structuring: 'chia nhỏ giao dịch',
  'large cross-border': 'chuyển tiền quốc tế lớn',
  'OFAC match': 'trùng OFAC',
  'false positive, released': 'cảnh báo nhầm, giải phóng',
  'STR filed, released': 'đã lập STR, giải phóng',
  'STR filed, blocked': 'đã lập STR, chặn giao dịch',
  'sanctions match confirmed, funds frozen': 'xác nhận trùng cấm vận, phong tỏa tiền',
  chargeback: 'tra soát thẻ (chargeback)',
  'pacs.004 return': 'hoàn trả pacs.004',
  'ATM mismatch': 'lệch tiền ATM',
  'upheld, refund': 'chấp nhận, hoàn tiền',
  'past the time limit, rejected': 'quá thời hạn, từ chối',
  'evidence against the customer, rejected': 'bằng chứng bất lợi cho khách, từ chối',
  'account opened': 'đã mở tài khoản',
  debited: 'đã ghi nợ',
  credited: 'đã ghi có',
  'refund credited': 'đã ghi có hoàn tiền',
  'not enough money, declined': 'không đủ tiền, từ chối',
};

const cv = (s: string): string => CHECK_VI[s] ?? s;
/** "…; AML screen clean" → "…; sàng lọc AML sạch". */
const screenVi = (tail: string | undefined): string => (tail ? `; sàng lọc AML ${cv(tail)}` : '');

const lower = (s: string): string => s.toLowerCase();

/** "not eligible, score 471 is below 600 and down payment is 20% of the amount, below 25%." in Vietnamese. */
const ineligibleVi = (reason: string): string =>
  reason
    .replace(/^not eligible, /, 'không đủ điều kiện, ')
    .replace(/score (\d+) is below (\d+)/, 'điểm $1 dưới $2')
    .replace(/down payment is (\d+)% of the amount, below (\d+)%/, 'khoản trả trước là $1% số tiền, dưới $2%')
    .replace(/ and /, ' và ');

const RULES: readonly Rule[] = [
  // Chaos Monkey
  [/^Chaos Monkey: (.+) injected\.$/, (m) => `Chaos Monkey: đã gây ${lower(CHAOS_VI[m[1]!] ?? m[1]!)}.`],
  [/^Chaos Monkey: (.+) cleared\.$/, (m) => `Chaos Monkey: đã khắc phục ${lower(CHAOS_VI[m[1]!] ?? m[1]!)}.`],
  [/^Day (\d+) scenario: FLASH SALE\. Expect (\d+)x the usual customers.*$/, (m) => `Kịch bản ngày ${m[1]}: ${dayScenarios.messages.flashTitle.vi}. Dự kiến gấp ${m[2]} lần lượng khách thường ngày, mạng nghẽn và lỗi 504. Truy vấn trạng thái sẽ xử lý mọi giao dịch quá thời gian.`],
  [/^Day (\d+) scenario: BOTNET ATTACK\..*$/, (m) => `Kịch bản ngày ${m[1]}: ${dayScenarios.messages.botnetTitle.vi}. Một botnet đang dò thẻ bị đánh cắp bằng giao dịch trực tuyến $1. Mỗi cảnh báo làm đội gian lận mệt thêm; trên 70% mệt mỏi họ bắt đầu cho bot lọt qua.`],
  [/^Velocity alert (\d\d:\d\d-\d\d:\d\d): (\d+) card-testing attempts of \$1\.00 from rotating devices\. Fraud desk fatigue (\d+)%\.$/, (m) => `Cảnh báo tần suất ${m[1]}: ${m[2]} lượt dò thẻ $1.00 từ các thiết bị luân phiên. Mức mệt mỏi của đội gian lận ${m[3]}%.`],
  [/^A fatigued analyst \(fatigue (\d+)%\) cleared a \$1\.00 bot attempt as low risk\. The stolen card is now confirmed live\.$/, (m) => `Một chuyên viên kiệt sức (mệt mỏi ${m[1]}%) đã duyệt một lượt bot $1.00 là rủi ro thấp. Thẻ bị đánh cắp giờ đã được xác nhận còn hoạt động.`],
  [/^POS station outage: (.+) could not reach the switch \(RC 91 Issuer or Switch Inoperative\)\.$/, (m) => `Sự cố trạm POS: ${m[1]} không kết nối được bộ chuyển mạch (RC 91 Ngân hàng phát hành hoặc bộ chuyển mạch ngừng hoạt động).`],
  [/^3DS HSM failure: no cryptogram could be signed for (.+) \(RC 96 System Malfunction\)\.$/, (m) => `Lỗi HSM của 3DS: không ký được mã mật mã cho ${m[1]} (RC 96 Lỗi hệ thống).`],
  [/^504 Gateway Timeout on (.+)\. An automatic status inquiry found the request alive, so it carries on\.$/, (m) => `Lỗi 504 Gateway Timeout với ${m[1]}. Truy vấn trạng thái tự động thấy yêu cầu vẫn còn, nên giao dịch tiếp tục.`],
  [/^504 Gateway Timeout on (.+) and the status inquiry got no answer: declined RC 68 \(Response Received Too Late\) and reversed\.$/, (m) => `Lỗi 504 Gateway Timeout với ${m[1]} và truy vấn trạng thái không có phản hồi: từ chối RC 68 (Quá thời gian phản hồi mạng) và đảo giao dịch.`],
  [/^Chargeback raised on (.+): (\$[\d,.]+) reversed from the merchant payout pool \(2110\) back to the customer’s account \(2010\)\.$/, (m) => `Đã mở tra soát cho ${m[1]}: ${m[2]} được đảo từ quỹ chờ quyết toán trả cửa hàng (2110) về tài khoản của khách (2010).`],

  // The day
  [/^Day (\d+): (.+?)\. (.+)$/, (m) => `Ngày ${m[1]}: ${m[2]}. ${m[3]}`],
  [/^(\d\d:\d\d) The doors open\. Customers are arriving\.$/, (m) => `${m[1]} Ngân hàng mở cửa. Khách hàng đang đến.`],
  [/^(\d\d:\d\d) The branch closes\. The ATMs, card gateways and online transfers run on through the night\. (\d+) payments are still being worked\.$/, (m) => `${m[1]} Chi nhánh đóng cửa. ATM, cổng thanh toán thẻ và chuyển khoản trực tuyến vẫn chạy suốt đêm. ${m[2]} giao dịch vẫn đang được xử lý.`],
  [/^(\d\d:\d\d) The branch closes\. The ATMs, card gateways and online transfers run on through the night\. Every queue is clear\.$/, (m) => `${m[1]} Chi nhánh đóng cửa. ATM, cổng thanh toán thẻ và chuyển khoản trực tuyến vẫn chạy suốt đêm. Mọi hàng chờ đã trống.`],
  [/^Night cycle begins\. (\d+) approved payments \((\$[\d,.]+)\) go into batch clearing, on top of (\d+) records still unreconciled from yesterday\.$/, (m) => `Chu kỳ đêm bắt đầu. ${m[1]} giao dịch đã duyệt (${m[2]}) được đưa vào bù trừ theo lô, cộng thêm ${m[3]} bản ghi chưa đối soát từ hôm qua.`],
  [/^Night cycle begins\. (\d+) approved payments \((\$[\d,.]+)\) go into batch clearing\.$/, (m) => `Chu kỳ đêm bắt đầu. ${m[1]} giao dịch đã duyệt (${m[2]}) được đưa vào bù trừ theo lô.`],
  [/^Midnight\. (\d+) records were not reconciled and roll into tomorrow night\. Suspense account: (\$[\d,.]+)\.$/, (m) => `Nửa đêm. ${m[1]} bản ghi chưa được đối soát và chuyển sang đêm mai. Tài khoản treo: ${m[2]}.`],
  [/^Midnight\. Every record was reconciled\. Suspense account: (\$[\d,.]+)\.$/, (m) => `Nửa đêm. Mọi bản ghi đã được đối soát. Tài khoản treo: ${m[1]}.`],
  [/^(.+) joins (.+) as temporary cover\.$/, (m) => `${m[1]} tham gia ${m[2]} với vai trò hỗ trợ tạm thời.`],

  // People and queues
  [/^(.+) \(fatigue (\d+)%\) fumbled a record and has to redo it\.$/, (m) => `${m[1]} (mệt mỏi ${m[2]}%) xử lý hỏng một bản ghi và phải làm lại.`],
  [/^(.+) \(fatigue (\d+)%\) fumbled (.+) and has to redo it\.$/, (m) => `${m[1]} (mệt mỏi ${m[2]}%) xử lý hỏng ${m[3]} và phải làm lại.`],
  [/^Server Overload \/ Saturated Capacity: (\d+) requests queued, the oldest for (\d+) min\. Requests are about to time out\.$/, (m) => `Quá tải máy chủ: ${m[1]} yêu cầu đang xếp hàng, lâu nhất ${m[2]} phút. Yêu cầu sắp hết thời gian chờ.`],
  [/^Server Overload \/ Saturated Capacity: (\d+) requests queued, the oldest for (\d+) min\. The thread pool cannot keep up\.$/, (m) => `Quá tải máy chủ: ${m[1]} yêu cầu đang xếp hàng, lâu nhất ${m[2]} phút. Nhóm luồng xử lý không theo kịp.`],
  [/^(\d+) waiting, the oldest for (\d+) min\. Customers are about to give up\.$/, (m) => `${m[1]} người đang chờ, lâu nhất ${m[2]} phút. Khách sắp bỏ đi.`],
  [/^(\d+) waiting, the oldest for (\d+) min\. A queue is building\.$/, (m) => `${m[1]} người đang chờ, lâu nhất ${m[2]} phút. Hàng chờ đang dài ra.`],
  [/^(\d+) records left and (\d+) minutes to go\. At this pace about (-?\d+) will not be reconciled by midnight\.$/, (m) => `Còn ${m[1]} bản ghi và ${m[2]} phút. Với tốc độ này khoảng ${m[3]} bản ghi sẽ không được đối soát trước nửa đêm.`],
  [/^(\d+) items worth (\$[\d,.]+) in suspense, the oldest (\d+) days? old\.$/, (m) => `${m[1]} mục trị giá ${m[2]} trong tài khoản treo, lâu nhất ${m[3]} ngày.`],
  [/^(.+) is exhausted \(fatigue (\d+)%\), working at (\d+)% of normal pace\.$/, (m) => `${m[1]} đã kiệt sức (mệt mỏi ${m[2]}%), làm việc ở ${m[3]}% tốc độ bình thường.`],
  [/^(.+) is wearing out \(fatigue (\d+)%\), working at (\d+)% of normal pace\.$/, (m) => `${m[1]} đang mệt dần (mệt mỏi ${m[2]}%), làm việc ở ${m[3]}% tốc độ bình thường.`],
  [/^A shopper gave up after (\d+) minutes in the queue at (.+): (.+) lost\.$/, (m) => `Một người mua bỏ đi sau ${m[1]} phút chờ tại ${m[2]}: mất ${m[3]}.`],
  [/^A customer gave up after (\d+) minutes in the queue at (.+): (.+) lost\.$/, (m) => `Một khách hàng bỏ đi sau ${m[1]} phút chờ tại ${m[2]}: mất ${m[3]}.`],

  // Desks
  [/^Rejected the pacs\.008 for (.+?): the message is malformed, so the money is never touched$/, (m) => `Đã từ chối pacs.008 của ${m[1]}: thông điệp sai định dạng, nên tiền không bị động tới`],
  [/^Rejected the pacs\.008 for (.+?): (.+)$/, (m) => `Đã từ chối pacs.008 của ${m[1]}: ${m[2]}`],
  [/^Validated the pacs\.008 for (.+): well formed, released on the (\w+) rail$/, (m) => `Đã xác thực pacs.008 của ${m[1]}: đúng định dạng, giải phóng trên kênh ${m[2] === 'rtgs' ? 'RTGS' : 'tức thì'}`],
  [/^Locked out a card thief at the sidewalk ATM after three wrong PINs \((.+)\)\. The machine kept the card\.$/, (m) => `Đã chặn kẻ trộm thẻ tại ATM vỉa hè sau ba lần nhập sai PIN (${m[1]}). Máy đã giữ thẻ.`],
  [/^Three wrong PINs at the sidewalk ATM \((.+)\): the session is locked and the card is kept\.$/, (m) => `Ba lần sai PIN tại ATM vỉa hè (${m[1]}): phiên bị khóa và thẻ bị giữ.`],
  [/^ATM jam: (.+)\. The customer was debited but got no cash, so (\$[\d,.]+) goes straight to the suspense account\.$/, (m) => `Kẹt ATM: ${m[1]}. Khách đã bị trừ tiền nhưng không nhận được tiền mặt, nên ${m[2]} được đưa thẳng vào tài khoản treo.`],
  [/^A dynamic CVV arrived too late: (.+)$/, (m) => `CVV động đến quá muộn: ${m[1]}`],
  [/^Risk (\d+) on (.+): one-time code sent to the customer\.$/, (m) => `Rủi ro ${m[1]} với ${m[2]}: đã gửi mã một lần cho khách.`],
  [/^Rejected a suspicious payment, (.+) \(risk (\d+)\)\.$/, (m) => `Đã từ chối một giao dịch đáng ngờ, ${m[1]} (rủi ro ${m[2]}).`],
  [/^Rejected a payment from a genuine customer, (.+) \(risk (\d+)\)\.$/, (m) => `Đã từ chối giao dịch của một khách thật, ${m[1]} (rủi ro ${m[2]}).`],
  [/^Pay-in-4 plan approved for (.+): score (\d+), (\$[\d,.]+) due today\.$/, (m) => `Đã duyệt kế hoạch trả 4 kỳ cho ${m[1]}: điểm ${m[2]}, hôm nay phải trả ${m[3]}.`],
  [/^A real (\$[\d,.]+) difference on (.+) was inside the tolerance and matched away\.$/, (m) => `Một khoản chênh thật ${m[1]} ở ${m[2]} nằm trong biên sai số và đã bị khớp mất.`],
  [/^Break on (.+?): (.+) (\$[\d,.]+) goes to suspense\.$/, (m) => `Sai lệch ở ${m[1]}: ${m[2]} ${m[3]} được đưa vào tài khoản treo.`],
  [/^Refunded (\$[\d,.]+) to the customer: the ATM cash count proved the notes never came out \((.+)\)\.$/, (m) => `Đã hoàn ${m[1]} cho khách: kiểm quỹ ATM chứng minh tiền chưa từng ra khỏi máy (${m[2]}).`],
  [/^Cleared (\$[\d,.]+) from suspense \((.+)\)\.$/, (m) => `Đã xử lý ${m[1]} khỏi tài khoản treo (${m[2]}).`],
  [/^Fraud approved: (.+?) at a shop terminal\. The bank will have to repay it\.$/, (m) => `Gian lận lọt qua: ${m[1]} tại máy POS cửa hàng. Ngân hàng sẽ phải hoàn trả.`],
  [/^Fraud approved: (.+?) at the sidewalk ATM with a PIN the thief had watched\. The bank will have to repay it\.$/, (m) => `Gian lận lọt qua: ${m[1]} tại ATM vỉa hè với mã PIN kẻ gian đã nhìn trộm. Ngân hàng sẽ phải hoàn trả.`],
  [/^Fraud approved: (.+?) as an instant transfer to a new payee\. The bank will have to repay it\.$/, (m) => `Gian lận lọt qua: ${m[1]} qua chuyển khoản tức thì tới người nhận mới. Ngân hàng sẽ phải hoàn trả.`],
  [/^Fraud approved: (.+?) through the frictionless path \(risk (\d+)\)\. The bank will have to repay it\.$/, (m) => `Gian lận lọt qua: ${m[1]} qua luồng xác thực liền mạch (rủi ro ${m[2]}). Ngân hàng sẽ phải hoàn trả.`],
  [/^Fraud approved: (.+?) after the fraudster passed the OTP challenge\. The bank will have to repay it\.$/, (m) => `Gian lận lọt qua: ${m[1]} sau khi kẻ gian vượt qua thử thách OTP. Ngân hàng sẽ phải hoàn trả.`],
  [/^Fraud approved: (.+?) with a replayed dynamic CVV\. The bank will have to repay it\.$/, (m) => `Gian lận lọt qua: ${m[1]} với CVV động bị dùng lại. Ngân hàng sẽ phải hoàn trả.`],
  [/^Fraud approved: (.+?) on a synthetic identity\. The bank will have to repay it\.$/, (m) => `Gian lận lọt qua: ${m[1]} bằng danh tính giả mạo. Ngân hàng sẽ phải hoàn trả.`],
  [/^Fraud approved: (.+?)\. The bank will have to repay it\.$/, (m) => `Gian lận lọt qua: ${m[1]}. Ngân hàng sẽ phải hoàn trả.`],
  [/^Stopped a fraudulent payment, (.+) \((.+)\)\.$/, (m) => `Đã chặn một giao dịch gian lận, ${m[1]} (${DECLINE_VI[m[2]!] ?? m[2]}).`],

  // Phase 8 checkpoints (narration.ts describeCheckpoint)
  [/^eKYC for (.+): OCR (\d+)%, liveness (\d+), face match (\d+)%: (.+)$/, (m) => `eKYC cho ${m[1]}: OCR ${m[2]}%, người thật ${m[3]}, khớp khuôn mặt ${m[4]}%: ${cv(m[5]!)}`],
  [/^Parsing the VietQR for (.+?): (.+)$/, (m) => `Đang đọc VietQR của ${m[1]}: ${cv(m[2]!)}`],
  [/^Validating the pacs\.008 for (.+) \((\w{3})\): well formed, FX converted$/, (m) => `Đang xác thực pacs.008 của ${m[1]} (${m[2]}): đúng định dạng, đã quy đổi ngoại tệ`],
  [/^Validating the pacs\.008 for (.+) \((\w{3})\): (\w+) is invalid, rejected$/, (m) => `Đang xác thực pacs.008 của ${m[1]} (${m[2]}): ${m[3]} không hợp lệ, từ chối`],
  [/^FacePay check on (.+?): face match (\d+)%, (.+)$/, (m) => `Kiểm tra FacePay cho ${m[1]}: khớp khuôn mặt ${m[2]}%, ${cv(m[3]!)}`],
  [/^Scoring the device behind (.+?): score (\d+)((?: \([A-Z_, ]+\))?), (clear|FDS_HIGH_RISK_DEVICE)(?:; AML screen (.+))?$/, (m) => `Đang chấm thiết bị của ${m[1]}: điểm ${m[2]}${m[3]}, ${cv(m[4]!)}${screenVi(m[5])}`],
  [/^Counting (.+) (in|out): (.+?)(?:; AML screen (.+))?$/, (m) => `Đang kiểm đếm ${m[1]} ${m[2] === 'in' ? 'nộp vào' : 'chi ra'}: ${/^(\d+) suspect notes, serials recorded$/.test(m[3]!) ? `${m[3]!.split(' ')[0]} tờ nghi giả, đã ghi số seri` : cv(m[3]!)}${screenVi(m[4])}`],
  [/^Reviewing (.+) \((PEP|structuring|large cross-border|OFAC match|no reason)\): (.+)$/, (m) => `Đang rà soát ${m[1]} (${cv(m[2]!)}): ${cv(m[3]!)}`],
  [/^Working the (chargeback|pacs\.004 return|ATM mismatch) claim for (.+?): (.+)$/, (m) => `Đang xử lý khiếu nại ${cv(m[1]!)} cho ${m[2]}: ${cv(m[3]!)}`],
  [/^Posting (.+) on the CASA ledger: (.+)$/, (m) => `Đang hạch toán ${m[1]} trên sổ cái CASA: ${cv(m[2]!)}`],
  [/^Screening (.+?): (.+)$/, (m) => `Đang sàng lọc ${m[1]}: ${cv(m[2]!)}`],
  [/^Working on (.+)$/, (m) => `Đang xử lý ${m[1]}`],

  // What a worker is doing (narration.ts)
  [/^Receiving (.+) paid with a virtual card$/, (m) => `Đang nhận ${m[1]} thanh toán bằng thẻ ảo`],
  [/^Receiving (.+) from a shop terminal$/, (m) => `Đang nhận ${m[1]} từ máy POS cửa hàng`],
  [/^Receiving (.+): a Pay-in-4 application$/, (m) => `Đang nhận ${m[1]}: một hồ sơ trả góp 4 kỳ`],
  [/^Receiving (.+) paid online by (.+)$/, (m) => `Đang nhận ${m[1]} thanh toán trực tuyến bằng ${CARD_VI[m[2]!] ?? m[2]}`],
  [/^ATM, (.+?)\. (.+)$/, (m) => `ATM, ${m[1]}. ${m[2]}`],
  [/^Resolving a virtual card to ···(.+), funded by (\w+)$/, (m) => `Đang tìm thẻ thật của thẻ ảo ···${m[1]}, nguồn tiền ${({ debit: 'ghi nợ', credit: 'tín dụng', prepaid: 'trả trước' } as Record<string, string>)[m[2]!] ?? m[2]}`],
  [/^No match in the vault for this virtual card number: unknown DPAN$/, () => 'Không tìm thấy số thẻ ảo này trong kho: DPAN không xác định'],
  [/^Checking the dynamic CVV on (.+?): (.+)$/, (m) => `Đang kiểm tra CVV động của ${m[1]}: ${m[2]}`],
  [/^Customer returned from their phone \(risk (\d+)\): (.+)$/, (m) => `Khách quay lại từ điện thoại (rủi ro ${m[1]}): ${THREE_DS_VI[m[2]!] ?? m[2]}`],
  [/^Reviewing risk score (\d+) on (.+) \((.+?)\): (.+)$/, (m) => `Đang xem điểm rủi ro ${m[1]} của ${m[2]} (${CARD_VI[m[3]!] ?? m[3]}): ${THREE_DS_VI[m[4]!] ?? m[4]}`],
  [/^Debiting (.+) from the account: enough, transfer released$/, (m) => `Đang trừ ${m[1]} khỏi tài khoản: đủ tiền, lệnh chuyển được giải phóng`],
  [/^Checking (.+) against the balance: not enough, transfer declined$/, (m) => `Đang kiểm tra ${m[1]} so với số dư: không đủ, lệnh chuyển bị từ chối`],
  [/^Checking the (\$[\d,.]+) down payment on (.+) against the (balance|credit line): enough, hold placed$/, (m) => `Đang kiểm tra khoản trả trước ${m[1]} của ${m[2]} so với ${m[3] === 'balance' ? 'số dư' : 'hạn mức tín dụng'}: đủ, đã khoanh giữ`],
  [/^Checking (.+) against the (balance|credit line): enough, hold placed$/, (m) => `Đang kiểm tra ${m[1]} so với ${m[2] === 'balance' ? 'số dư' : 'hạn mức tín dụng'}: đủ, đã khoanh giữ`],
  [/^Checking (.+) against the (balance|credit line): over the limit, declined$/, (m) => `Đang kiểm tra ${m[1]} so với ${m[2] === 'balance' ? 'số dư' : 'hạn mức tín dụng'}: vượt hạn mức, từ chối`],
  [/^Checking (.+) against the (balance|credit line): not enough, declined$/, (m) => `Đang kiểm tra ${m[1]} so với ${m[2] === 'balance' ? 'số dư' : 'hạn mức tín dụng'}: không đủ, từ chối`],
  [/^Underwriting (.+) \(score (\d+)\): plan approved, (\$[\d,.]+) due today$/, (m) => `Đang thẩm định ${m[1]} (điểm ${m[2]}): duyệt kế hoạch, hôm nay phải trả ${m[3]}`],
  [/^Underwriting (.+) \(score (\d+)\): (.+) Falling back to a normal card payment$/, (m) => `Đang thẩm định ${m[1]} (điểm ${m[2]}): ${ineligibleVi(m[3]!)} Chuyển sang thanh toán thẻ thông thường`],
  [/^Desk closed\. (\d+) items wait for tomorrow$/, (m) => `Quầy đã đóng. ${m[1]} mục chờ tới ngày mai`],
  [/^Adding (.+) \((\$[\d,.]+)\) to tonight’s clearing file$/, (m) => `Đang thêm ${m[1]} (${m[2]}) vào tệp bù trừ đêm nay`],
  [/^Presenting (.+) \((\$[\d,.]+)\) to Visa and agreeing the net settlement$/, (m) => `Đang trình ${m[1]} (${m[2]}) cho Visa và thống nhất quyết toán ròng`],
  [/^Matching Visa clearing batch vs GL and acquirer report for (.+) \((\$[\d,.]+)\): (.+)$/, (m) => `Đang khớp lô bù trừ Visa với sổ cái và báo cáo ngân hàng thanh toán cho ${m[1]} (${m[2]}): ${({ matched: 'khớp', 'amount break': 'lệch số tiền', 'a leg is missing': 'thiếu một vế', 'presented twice': 'bị trình hai lần', checked: 'đã kiểm tra' } as Record<string, string>)[m[3]!] ?? m[3]}`],
  [/^Refunding the ATM jam (.+) \((.+)\): the cash count shows the notes never came out$/, (m) => `Đang hoàn tiền kẹt ATM ${m[1]} (${m[2]}): kiểm quỹ cho thấy tiền chưa từng ra khỏi máy`],
  [/^Investigating suspense item (.+) \((\$[\d,.]+)\): (.+)$/, (m) => `Đang điều tra mục treo ${m[1]} (${m[2]}): ${m[3]}`],
];

/** What a desk is doing while idle, in Vietnamese. */
const IDLE_VI: Readonly<Record<string, string>> = {
  'Watching the virtual-card feed': 'Đang theo dõi luồng thẻ ảo',
  'Watching the terminal feed': 'Đang theo dõi luồng máy POS',
  'Watching the checkout feed': 'Đang theo dõi luồng thanh toán',
  'Waiting for the next virtual card to resolve': 'Đang chờ thẻ ảo tiếp theo để tra cứu',
  'Waiting for the next dCVV to check': 'Đang chờ dCVV tiếp theo để kiểm tra',
  'Waiting for the next payment to score': 'Đang chờ giao dịch tiếp theo để chấm điểm',
  'Waiting for the next debit hold': 'Đang chờ khoản khoanh giữ ghi nợ tiếp theo',
  'Waiting for the next credit check': 'Đang chờ lượt kiểm tra tín dụng tiếp theo',
  'Waiting for the next application': 'Đang chờ hồ sơ tiếp theo',
  'Standing by for the 23:00 batch': 'Đang chờ lô 23:00',
  'Standing by for the clearing file': 'Đang chờ tệp bù trừ',
  'Standing by for tonight’s records': 'Đang chờ bản ghi đêm nay',
  'Nothing waiting in suspense': 'Không có gì chờ trong tài khoản treo',
  'Watching the instant-payment feed': 'Đang theo dõi luồng thanh toán tức thì',
  'Waiting for the next card at the sidewalk ATM': 'Đang chờ thẻ tiếp theo tại ATM vỉa hè',
  'Cash cassettes loaded, waiting for a withdrawal': 'Hộp tiền đã nạp, đang chờ lượt rút',
  'Waiting for the next CCCD scan and selfie': 'Đang chờ lượt quét CCCD và ảnh selfie tiếp theo',
  'Watching the Napas247 QR feed': 'Đang theo dõi luồng QR Napas247',
  'Till balanced, waiting for the next customer': 'Két quầy đã cân, đang chờ khách tiếp theo',
  'Waiting for the next high-value transfer': 'Đang chờ giao dịch giá trị cao tiếp theo',
  'Scoring device fingerprints in real time': 'Đang chấm dấu vân tay thiết bị theo thời gian thực',
  'No alerts waiting for review': 'Không có cảnh báo chờ rà soát',
  'No claims waiting': 'Không có khiếu nại đang chờ',
  'Watching the SWIFT inbound and outbound queues': 'Đang theo dõi hàng chờ SWIFT đi và đến',
  'Morning briefing and systems check': 'Giao ban buổi sáng và kiểm tra hệ thống',
  'Off shift until 22:30': 'Nghỉ ca tới 22:30',
  'Off shift until 08:30': 'Nghỉ ca tới 08:30',
  'Desk closed until 09:00': 'Quầy đóng tới 09:00',
};

/** One line of the feed, an alert or a desk's activity, in the active language. */
export function feedText(text: string): string {
  if (!text) return text;
  // English: the simulation already writes English, so only a scenario name that arrived in Vietnamese needs putting back.
  if (activeLocale() !== 'vi') return localizeScenarioText(text, 'en');
  if (NOTE_VI[text]) return NOTE_VI[text]!;
  if (IDLE_VI[text]) return IDLE_VI[text]!;
  const source = scenarios(text);
  for (const [re, build] of RULES) {
    const m = re.exec(source);
    if (m) return build(m);
  }
  return source;
}
