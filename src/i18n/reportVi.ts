/** Vietnamese for the End-of-Day report: the P&L line names, the tiles, the glossary tooltips, the decline labels and groups, and the coach's tips. reportSummary.ts and reportGlossary.ts stay in English. */

import type { DeclineReason } from '../sim/types';
import { activeLocale } from './localeCore';

const vi = (): boolean => activeLocale() === 'vi';

/** Report labels (P&L lines, stat tiles, hero cards, decline groups) in Vietnamese, keyed by the English label. */
const LABEL_VI: Readonly<Record<string, string>> = {
  // P&L lines
  'Card interchange': 'Phí trao đổi thẻ (Interchange)',
  'Pay-in-4 merchant fees': 'Phí cửa hàng cho trả góp 4 kỳ',
  'Instant-transfer fees': 'Phí chuyển khoản tức thì',
  'Fraud the bank repaid': 'Gian lận ngân hàng phải hoàn trả',
  'Expected Pay-in-4 bad debt': 'Nợ xấu trả góp 4 kỳ dự kiến',
  'Real errors matched away': 'Lỗi thật bị khớp mất',
  'Clearing the suspense account': 'Chi phí xử lý tài khoản treo',
  'Good customers lost': 'Khách tốt bị mất',
  'Temporary cover': 'Nhân sự hỗ trợ tạm thời',
  'Day result': 'Kết quả trong ngày',
  // Stat tiles
  Payments: 'Giao dịch',
  Approved: 'Được chấp thuận',
  'Fraud approved': 'Gian lận được chấp thuận',
  'Pay-in-4 plans': 'Kế hoạch trả góp 4 kỳ',
  'Instant transfers': 'Chuyển khoản tức thì',
  'Sidewalk ATM': 'ATM vỉa hè',
  '3DS challenged': 'Bị thử thách 3DS',
  'Average wait': 'Thời gian chờ trung bình',
  'Matched overnight': 'Khớp trong đêm',
  'Suspense account': 'Tài khoản treo',
  // Hero cards and charts
  'Capital & P&L': 'Vốn & Lãi lỗ',
  'Settlement & volume': 'Quyết toán & khối lượng',
  'Customer base & churn': 'Tệp khách hàng & rời bỏ',
  'Top revenue drain': 'Khoản thất thoát lớn nhất',
  'Revenue vs losses': 'Doanh thu so với tổn thất',
  'Decline breakdown': 'Phân tích từ chối',
  'Gross revenue': 'Tổng doanh thu',
  'Losses & write-offs': 'Tổn thất & xóa sổ',
  // Decline groups
  'Not enough money': 'Không đủ tiền',
  'OTP abandoned': 'Bỏ dở OTP',
  'Risk & security blocks': 'Chặn do rủi ro & bảo mật',
  'ATM & branch cash': 'ATM & tiền mặt tại quầy',
  'Identity & compliance': 'Định danh & tuân thủ',
  'Queues & errors': 'Hàng chờ & lỗi',
};

const GLOSSARY_VI: Readonly<Record<string, string>> = {
  'Card interchange': 'Phí ngân hàng phát hành thu từ cửa hàng trên các giao dịch thẻ.',
  'Pay-in-4 merchant fees': 'Phần cửa hàng trả cho ngân hàng để khách được chia một lần mua thành bốn kỳ.',
  'Instant-transfer fees': 'Khoản phí nhỏ ngân hàng thu để chuyển tiền thẳng giữa hai tài khoản trong vài giây.',
  'Fraud the bank repaid': 'Tiền ngân hàng phải trả lại khách cho các giao dịch gian lận mà nó đã duyệt.',
  'Expected Pay-in-4 bad debt': 'Phần các kế hoạch trả góp hôm nay mà ngân hàng dự kiến một số khách sẽ không trả hết.',
  'Real errors matched away': 'Lỗi thật trong bản ghi mà biên sai số đối soát coi như làm tròn, nên không ai truy theo.',
  'Clearing the suspense account': 'Sổ treo tạm thời được xử lý khi ca đối soát đêm khớp tiền mặt thực tế và giao dịch lỗi.',
  'Good customers lost': 'Doanh thu hợp lệ bị bỏ lỡ do ma sát xác thực 3DS quá mức hoặc từ chối nhầm.',
  'Temporary cover': 'Chi phí ngân hàng trả cho nhân sự bổ sung đặt trong ngày để giải tỏa hàng chờ.',
  'Day result': 'Mọi thứ ngân hàng thu được hôm nay trừ mọi thứ bị mất hoặc phải chi ra.',
  Payments: 'Mọi giao dịch đến hôm nay: chạm thẻ, thanh toán trực tuyến, chuyển khoản và rút tiền ATM.',
  Approved: 'Tỷ lệ giao dịch ngân hàng đồng ý, và giá trị của chúng.',
  'Fraud approved': 'Giao dịch gian lận lọt qua kiểm tra của ngân hàng, trên tổng số lần gian lận.',
  'Pay-in-4 plans': 'Các lần mua ngân hàng đồng ý chia thành bốn kỳ không lãi.',
  'Instant transfers': 'Lệnh chuyển tài khoản-tới-tài khoản (pacs.008) đã giải phóng, trên tổng số lệnh đến.',
  'Sidewalk ATM': 'Số lần rút tiền ATM đã nhả tiền, trên tổng số phiên, và số lần bị kẹt.',
  '3DS challenged': 'Giao dịch trực tuyến mà khách phải nhập mã một lần để chứng minh là chính mình.',
  'Average wait': 'Trung bình khách phải chờ trong hàng bao lâu trước khi quầy xử lý giao dịch.',
  'Matched overnight': 'Bản ghi ca đêm đã khớp giữa sổ cái, tổ chức thẻ và ngân hàng của cửa hàng.',
  'Suspense account': 'Tiền nằm trong sổ treo tạm thời lúc nửa đêm, và số mục trong đó.',
  'Capital & P&L': 'Kết quả hôm nay, và quỹ dự trữ của ngân hàng (tiền của chính nó, dùng để hấp thụ tổn thất) trước và sau đó.',
  'Settlement & volume': 'Tỷ lệ giao dịch được duyệt, và số tiền các giao dịch đó đã chuyển.',
  'Customer base & churn': 'Khách có tài khoản, khách mới tham gia hôm nay, và khách tốt bỏ đi sau khi bị từ chối.',
  'Top revenue drain': 'Dòng tổn thất duy nhất khiến ngân hàng mất nhiều nhất hôm nay.',
  'Revenue vs losses': 'Mọi thứ thu được hôm nay so với mọi thứ bị mất hoặc xóa sổ; phần chênh là kết quả trong ngày.',
  'Decline breakdown': 'Lý do giao dịch bị từ chối hôm nay, gom theo tiền, bỏ dở OTP, chặn rủi ro, định danh, tiền mặt và hàng chờ.',
};

const DECLINE_LABEL_VI: Readonly<Record<DeclineReason, string>> = {
  FUNDS: 'Tài khoản không đủ số dư',
  DCVV_EXPIRED: 'dCVV hết hạn',
  DCVV_MISMATCH: 'Sai dCVV',
  UNKNOWN_DPAN: 'Thẻ ảo không xác định',
  THREE_DS_REJECT: '3DS từ chối',
  OTP_ABANDONED: 'Không nhập OTP',
  DOWN_PAYMENT: 'Từ chối khoản trả trước',
  PIN_LOCKED: 'Khóa PIN ATM, giữ thẻ',
  A2A_INVALID: 'Thông điệp chuyển khoản bị từ chối',
  ATM_JAM: 'Kẹt bộ nhả tiền ATM',
  TIMEOUT: 'Khách bỏ đi vì chờ lâu',
  PROCESS_ERROR: 'Lỗi xử lý',
  EKYC_LIVENESS_FAILED: 'eKYC không xác minh được danh tính',
  BIOMETRIC_AUTH_REQUIRED: 'FacePay không khớp khuôn mặt',
  FDS_HIGH_RISK_DEVICE: 'FDS: thiết bị rủi ro cao',
  AML_SANCTION_MATCH: 'Trùng danh sách cấm vận',
  AML_STR_BLOCKED: 'Bị chặn sau khi rà soát STR',
  QR_PAYLOAD_INVALID: 'Mã VietQR không hợp lệ',
  SWIFT_INVALID: 'Điện SWIFT bị từ chối',
  TELLER_VAULT_LIMIT: 'Vượt hạn mức tiền mặt tại quầy',
  TELLER_SUSPECT_NOTE: 'Tiền nghi giả tại quầy',
  DISPUTE_REJECTED: 'Khiếu nại bị từ chối',
};

const DECLINE_GLOSSARY_VI: Readonly<Record<DeclineReason, string>> = {
  FUNDS: 'Tài khoản hoặc hạn mức tín dụng không đủ để chi trả giao dịch.',
  DCVV_EXPIRED: 'Mã bảo mật xoay vòng 3 chữ số (dCVV) trên thẻ ảo đã hết hạn trước khi giao dịch hoàn tất.',
  DCVV_MISMATCH: 'Mã bảo mật xoay vòng được nhập không khớp với mã thẻ ảo đang hiển thị.',
  UNKNOWN_DPAN: 'Số thẻ ảo không thuộc thẻ nào trong kho token của ngân hàng.',
  THREE_DS_REJECT: 'Bộ máy rủi ro chấm giao dịch trực tuyến quá có khả năng là gian lận và từ chối thẳng.',
  OTP_ABANDONED: 'Khách được yêu cầu nhập mã SMS một lần và không bao giờ nhập.',
  DOWN_PAYMENT: 'Không trừ được kỳ đầu tiên trong bốn kỳ trả góp từ thẻ của khách.',
  PIN_LOCKED: 'Nhập sai PIN ba lần ở ATM, nên máy kết thúc phiên và giữ thẻ.',
  A2A_INVALID: 'Thông điệp chuyển khoản liên ngân hàng sai định dạng, nên bị từ chối trước khi tiền di chuyển.',
  ATM_JAM: 'Tiền giấy bị kẹt trong khay ATM; tiền đã trừ được đưa vào tài khoản treo chờ kiểm toán.',
  TIMEOUT: 'Khách bỏ đi vì chờ trong hàng trước khi quầy kịp phục vụ.',
  PROCESS_ERROR: 'Chính sơ đồ quy trình bị lỗi trên giao dịch này (không nên xảy ra với các sơ đồ có sẵn).',
  EKYC_LIVENESS_FAILED: 'Ảnh selfie không qua kiểm tra người thật, không khớp ảnh CCCD, thẻ có dấu hiệu giả, hoặc Cơ sở dữ liệu quốc gia về dân cư không khớp, nên không mở tài khoản.',
  BIOMETRIC_AUTH_REQUIRED: 'Giao dịch chuyển tiền trên $400 (10 triệu VND) cần xác thực khuôn mặt FacePay, và khuôn mặt không khớp hoặc chưa đăng ký sinh trắc học.',
  FDS_HIGH_RISK_DEVICE: 'Hệ thống phát hiện gian lận (FDS) chấm thiết bị quá rủi ro: IP bất thường, điện thoại đã root/jailbreak, hoặc dồn dập tấn công dò BIN.',
  AML_SANCTION_MATCH: 'Tên trùng danh sách cấm vận OFAC; chuyên viên đã xác nhận và tiền bị phong tỏa.',
  AML_STR_BLOCKED: 'Giao dịch bị giữ chờ chuyên viên AML, người xác định hoạt động đáng ngờ, lập Báo cáo giao dịch đáng ngờ (STR) và chặn giao dịch.',
  QR_PAYLOAD_INVALID: 'Chuỗi VietQR sai mã CRC, sai định dạng thẻ EMVCo, hoặc số tiền trong mã không khớp giao dịch.',
  SWIFT_INVALID: 'Điện pacs.008 quốc tế vi phạm quy tắc định dạng ISO 20022 (EndToEndId, mã BIC, loại tiền hoặc số tiền).',
  TELLER_VAULT_LIMIT: 'Ngăn kéo tiền của giao dịch viên không đủ tiền mặt cho lần rút; khách được hẹn quay lại sau khi tiếp quỹ.',
  TELLER_SUSPECT_NOTE: 'Máy đếm tiền gắn cờ tiền nghi giả; số seri đã được ghi lại và giao dịch nộp tiền bị từ chối.',
  DISPUTE_REJECTED: 'Khiếu nại nộp quá thời hạn, hoặc bằng chứng (chứng từ của cửa hàng, nhật ký ATM, ngân hàng thụ hưởng) không có lợi cho khách.',
};

/** A report label in the active language. */
export const reportLabel = (en: string): string => (vi() ? (LABEL_VI[en] ?? en) : en);

/** The tooltip under a report label, in the active language. `en` is the English tooltip from reportGlossary.ts. */
export const reportGloss = (label: string, en: string): string => (vi() ? (GLOSSARY_VI[label] ?? en) : en);

/** A decline reason's label in the active language. `en` is the English label from kpis.ts. */
export const declineLabel = (reason: DeclineReason, en: string): string => (vi() ? DECLINE_LABEL_VI[reason] : en);

/** A decline reason's tooltip in the active language. */
export const declineGloss = (reason: DeclineReason, en: string): string => (vi() ? DECLINE_GLOSSARY_VI[reason] : en);

const DECLINE_BY_EN_LOWER: Readonly<Record<string, string>> = {
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
  'ekyc identity not proven': 'eKYC không xác minh được danh tính',
  'facepay face match failed': 'facePay không khớp khuôn mặt',
  'fds high-risk device': 'fDS: thiết bị rủi ro cao',
  'sanctions list match': 'trùng danh sách cấm vận',
  'blocked after str review': 'bị chặn sau khi rà soát STR',
  'vietqr payload invalid': 'mã VietQR không hợp lệ',
  'swift message rejected': 'điện SWIFT bị từ chối',
  'teller vault cash limit': 'vượt hạn mức tiền mặt tại quầy',
  'suspect notes at the counter': 'tiền nghi giả tại quầy',
  'dispute claim rejected': 'khiếu nại bị từ chối',
};

const TIP_RULES: ReadonlyArray<readonly [RegExp, (m: RegExpExecArray) => string]> = [
  [/^(\d+) fraud payments slipped through, costing (\$[\d,.]+)\. Consider tightening the 3DS risk thresholds before Day (\d+)\.$/, (m) => `${m[1]} giao dịch gian lận đã lọt qua, gây thiệt hại ${m[2]}. Hãy cân nhắc siết ngưỡng rủi ro 3DS trước Ngày ${m[3]}.`],
  [/^(\d+) customers gave up waiting in a queue\. The desks were short of hands, not short of rules: look at the queues and call in cover\.$/, (m) => `${m[1]} khách bỏ đi vì chờ trong hàng. Các quầy thiếu người, không thiếu quy tắc: hãy xem hàng chờ và gọi thêm người hỗ trợ.`],
  [/^The biggest reason customers were turned away, apart from money, was “(.+)” \((\d+)\)\.$/, (m) => `Lý do lớn nhất khiến khách bị từ chối, ngoài chuyện tiền, là “${DECLINE_BY_EN_LOWER[m[1]!.toLowerCase()] ?? m[1]}” (${m[2]}).`],
  [/^(\d+) records were flagged as breaks when they were only rounding dust\. Each one took a person’s time\.$/, (m) => `${m[1]} bản ghi bị gắn cờ sai lệch dù chỉ là sai số làm tròn. Mỗi bản ghi tốn thời gian của một người.`],
  [/^(\d+) real errors worth (\$[\d,.]+) were matched away by the tolerance and nobody will look at them\.$/, (m) => `${m[1]} lỗi thật trị giá ${m[2]} đã bị biên sai số khớp mất và sẽ không ai xem lại.`],
  [/^The night team left (\d+) records unreconciled at midnight\. They roll into tomorrow night\.$/, (m) => `Ca đêm còn ${m[1]} bản ghi chưa đối soát lúc nửa đêm. Chúng được chuyển sang đêm mai.`],
  [/^Expected bad debt on Pay-in-4 plans \((\$[\d,.]+)\) is eating most of the fee earned \((\$[\d,.]+)\)\.$/, (m) => `Nợ xấu dự kiến của các kế hoạch trả góp 4 kỳ (${m[1]}) đang ăn gần hết phí thu được (${m[2]}).`],
  [/^(\d+) instant transfers were turned back because the bank-to-bank message was malformed\. No money moved, and the sender has to start again\.$/, (m) => `${m[1]} lệnh chuyển khoản tức thì bị trả về vì thông điệp liên ngân hàng sai định dạng. Không tiền nào di chuyển, và người gửi phải làm lại.`],
  [/^(\d+) sidewalk ATM withdrawals? jammed after the customer was debited \((\$[\d,.]+)\)\. The money waited in the suspense account until the cash count cleared it\.$/, (m) => `${m[1]} lần rút tiền ở ATM vỉa hè bị kẹt sau khi khách đã bị trừ tiền (${m[2]}). Tiền nằm ở tài khoản treo cho tới khi kiểm đếm tiền mặt xử lý.`],
];

const TIP_EXACT: Readonly<Record<string, string>> = {
  'Someone finished the day exhausted. Tired people slow down and slip, which lengthens queues. Temporary cover is cheap next to that.': 'Có người kết thúc ngày trong tình trạng kiệt sức. Người mệt làm chậm và dễ sai, khiến hàng chờ dài ra. Thuê người hỗ trợ tạm thời rẻ hơn nhiều.',
  'A clean day: nothing cost the bank much. Try tightening a rule in the Rule Lab and see whether you can beat it.': 'Một ngày sạch: không có gì khiến ngân hàng tốn nhiều. Hãy thử siết một quy tắc trong Phòng thử quy tắc và xem bạn có làm tốt hơn không.',
};

/** A coach tip or the takeaway, in the active language. */
export function tipText(text: string): string {
  if (!vi()) return text;
  const exact = TIP_EXACT[text];
  if (exact) return exact;
  for (const [re, build] of TIP_RULES) {
    const m = re.exec(text);
    if (m) return build(m);
  }
  return text;
}
