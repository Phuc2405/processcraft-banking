/**
 * Vietnamese for the label/value pairs a walkthrough step shows ("Account holds: $120.00", "dCVV: VALID").
 *
 * The plan keeps the English labels, because the walkthrough quizzes look facts up by label. The screen translates them as it
 * draws them, through `factLabel` and `factValue`. Codes that a banker reads as codes (VALID, FRICTIONLESS, RTP) stay as they are
 * unless a plain word exists for them.
 */

import { activeLocale } from './locale';

const LABEL_VI: Readonly<Record<string, string>> = {
  Amount: 'Số tiền',
  'Virtual card': 'Thẻ ảo',
  'Code typed': 'Mã đã nhập',
  'Code age': 'Tuổi của mã',
  'Account holds': 'Số dư tài khoản',
  Card: 'Thẻ',
  'Risk score': 'Điểm rủi ro',
  Score: 'Điểm',
  'Down payment': 'Trả trước',
  'Card holds': 'Hạn mức thẻ còn',
  Reference: 'Mã tham chiếu',
  'Sending bank': 'Ngân hàng gửi',
  'Receiving bank': 'Ngân hàng nhận',
  'Banks will settle': 'Các ngân hàng sẽ quyết toán',
  Customer: 'Khách hàng',
  Born: 'Ngày sinh',
  Nationality: 'Quốc tịch',
  'Cash deposits': 'Nộp tiền mặt',
  'Identity checks on file': 'Lần xác minh danh tính đã lưu',
  Claim: 'Khiếu nại',
  Stage: 'Giai đoạn',
  'Days since purchase': 'Số ngày từ khi mua',
  'Merchant evidence': 'Bằng chứng của cửa hàng',
  'Bank ledger': 'Sổ cái ngân hàng',
  'Scheme clearing': 'Bù trừ của tổ chức thẻ',
  'Acquirer report': 'Báo cáo ngân hàng thanh toán',
  Presented: 'Số lần trình',
  Token: 'Token',
  'Funded by': 'Nguồn tiền',
  'Real card ends': 'Thẻ thật có đuôi',
  dCVV: 'dCVV',
  '3DS path': 'Nhánh 3DS',
  'Fraud liability': 'Trách nhiệm gian lận',
  Ledger: 'Sổ cái',
  'Hold placed': 'Đã khoanh giữ',
  Reconciliation: 'Đối soát',
  'Largest gap': 'Chênh lệch lớn nhất',
  Underwriting: 'Thẩm định',
  Message: 'Thông điệp',
  Rail: 'Kênh thanh toán',
  Screening: 'Sàng lọc',
  'Best name match': 'Điểm trùng tên cao nhất',
  'On list': 'Trong danh sách',
  Structuring: 'Chia nhỏ giao dịch',
  'Case verdict': 'Kết luận vụ việc',
  'Identity checks found': 'Số lần xác minh tìm thấy',
  Authenticated: 'Đã xác thực',
  'Filing window': 'Thời hạn khiếu nại',
  Liable: 'Bên chịu trách nhiệm',
  'Next move': 'Bước tiếp theo',
  'First instalment': 'Kỳ trả đầu tiên',
  'Then 3 of': 'Sau đó 3 kỳ mỗi kỳ',
};

const VALUE_VI: Readonly<Record<string, string>> = {
  missing: 'thiếu',
  none: 'không có',
  issuer: 'ngân hàng phát hành',
  merchant: 'cửa hàng',
  'the issuer': 'ngân hàng phát hành',
  'the merchant': 'cửa hàng',
  'well formed': 'đúng định dạng',
  'has a flaw': 'có lỗi',
  suspected: 'nghi vấn',
  yes: 'có',
  no: 'không',
  open: 'còn hạn',
  expired: 'đã hết hạn',
  'not mine (fraud)': 'không phải tôi (gian lận)',
  'never arrived': 'chưa bao giờ nhận được',
  'charged twice': 'bị trừ tiền hai lần',
  'new claim': 'khiếu nại mới',
  'retrieval request': 'yêu cầu chứng từ',
  'first chargeback': 'tra soát lần đầu',
  representment: 'phản hồi của cửa hàng',
  'pre-arbitration': 'tiền trọng tài',
  'pre arbitration': 'tiền trọng tài',
  'resolved cardholder': 'chủ thẻ thắng',
  'resolved merchant': 'cửa hàng thắng',
  weak: 'yếu',
  compelling: 'thuyết phục',
  'false positive': 'cảnh báo sai',
  'true match': 'trùng thật',
  inconclusive: 'chưa kết luận',
  'amount variance': 'chênh lệch số tiền',
  'missing leg': 'thiếu vế',
  duplicate: 'trùng lặp',
  ACTIVE: 'ĐANG HOẠT ĐỘNG',
  SUSPENDED: 'TẠM NGƯNG',
  DEBIT: 'GHI NỢ',
  CREDIT: 'TÍN DỤNG',
  PREPAID: 'TRẢ TRƯỚC',
  VALID: 'HỢP LỆ',
  EXPIRED: 'HẾT HẠN',
  MISMATCH: 'KHÔNG KHỚP',
  APPROVED: 'CHẤP THUẬN',
  DECLINED: 'TỪ CHỐI',
  INSUFFICIENT: 'KHÔNG ĐỦ',
  SUFFICIENT: 'ĐỦ',
  MATCHED: 'KHỚP',
  BREAK: 'SAI LỆCH',
  ELIGIBLE: 'ĐỦ ĐIỀU KIỆN',
  INELIGIBLE: 'KHÔNG ĐỦ ĐIỀU KIỆN',
  CLEAR: 'SẠCH',
  HIT: 'TRÙNG',
  FRICTIONLESS: 'KHÔNG MA SÁT',
  CHALLENGE: 'THỬ THÁCH',
  REJECT: 'TỪ CHỐI',
};

export function factLabel(label: string): string {
  return activeLocale() === 'vi' ? (LABEL_VI[label] ?? label) : label;
}

export function factValue(value: string): string {
  if (activeLocale() !== 'vi') return value;
  const exact = VALUE_VI[value];
  if (exact) return exact;
  let m = /^(\d+) in (\d+) days$/.exec(value);
  if (m) return `${m[1]} lần trong ${m[2]} ngày`;
  m = /^(\d+) times$/.exec(value);
  if (m) return `${m[1]} lần`;
  m = /^(\d+) s$/.exec(value);
  if (m) return `${m[1]} giây`;
  return value;
}
