/**
 * Vietnamese for the bank's dials, the manager's KPIs and the short notices the bank store raises.
 *
 * RULE_META and KPI_DEFS stay English (tests, saved games and the comparison engine key on them). The screen reads the
 * label and help text through these accessors instead.
 */

import type { KpiRowDef } from '../sim/kpis';
import { RULE_META, type BankRules } from '../sim/rules';
import { activeLocale } from './locale';

const RULE_VI: Readonly<Record<keyof BankRules, { label: string; help: string }>> = {
  dcvvWindowSec: { label: 'Thời hạn hiệu lực dCVV', help: 'Dài hơn thì dễ chịu với người gõ chậm, nhưng cũng dễ hơn cho kẻ dùng lại mã bị đánh cắp.' },
  frictionlessBelow: { label: 'Không ma sát khi rủi ro dưới', help: 'Cao hơn nghĩa là ít lời nhắc OTP hơn cho khách tốt, và nhiều giao dịch rủi ro được cho qua mà không bị thử thách.' },
  rejectAtOrAbove: { label: 'Từ chối khi rủi ro từ', help: 'Thấp hơn chặn được nhiều gian lận hơn, nhưng bắt đầu từ chối cả khách thật chỉ vì trông bất thường.' },
  bnplMinScore: { label: 'Điểm tối thiểu BNPL', help: 'Thấp hơn duyệt nhiều kế hoạch hơn và nhận thêm khách có thể không trả các kỳ còn lại.' },
  bnplMinDownPct: { label: 'Trả trước tối thiểu BNPL', help: 'Trả góp 4 kỳ thu 25% hôm nay. Mức sàn cao hơn sẽ đẩy khách chọn 25% về thanh toán thẻ thông thường.' },
  reconToleranceCents: { label: 'Biên sai số đối soát', help: 'Quá chặt thì sai số làm tròn tràn vào tài khoản treo. Quá lỏng thì lỗi thật bị khớp mất.' },
};

export function ruleLabel(key: keyof BankRules): string {
  return activeLocale() === 'vi' ? RULE_VI[key].label : RULE_META[key].label;
}

export function ruleHelp(key: keyof BankRules): string {
  return activeLocale() === 'vi' ? RULE_VI[key].help : RULE_META[key].help;
}

const KPI_VI: Readonly<Record<string, { label: string; help: string }>> = {
  net: { label: 'Lãi lỗ trong ngày', help: 'Phí thu được, trừ gian lận, nợ xấu trả góp 4 kỳ, sai lệch bị bỏ sót, thiện chí mất đi và chi phí xử lý tài khoản treo.' },
  approvedRate: { label: 'Tỷ lệ chấp thuận', help: 'Tỷ lệ giao dịch ngân hàng đồng ý trên tổng số.' },
  approvedCents: { label: 'Giá trị được chấp thuận', help: 'Giá trị mọi giao dịch được duyệt hôm nay.' },
  fraudSlipped: { label: 'Gian lận được chấp thuận', help: 'Số giao dịch gian lận mà ngân hàng đã đồng ý.' },
  fraudLoss: { label: 'Tổn thất gian lận', help: 'Giá trị số gian lận đó. Ngân hàng phải hoàn trả.' },
  friction: { label: 'Khách tốt bị từ chối', help: 'Khách thật bị mất vì mã hết hạn, bỏ dở OTP, bị 3DS từ chối hoặc chờ quá lâu.' },
  frictionCents: { label: 'Doanh số mất do ma sát', help: 'Giá trị các giao dịch bị mất đó.' },
  challengeRate: { label: 'Tỷ lệ thử thách 3DS', help: 'Tỷ lệ giao dịch trực tuyến bị chuyển sang điện thoại khách để nhập mã một lần.' },
  otpAbandon: { label: 'Tỷ lệ bỏ dở OTP', help: 'Tỷ lệ khách bị thử thách nhưng không bao giờ nhập mã.' },
  dcvvExpired: { label: 'Từ chối do dCVV hết hạn', help: 'Giao dịch thẻ ảo bị từ chối vì mã đã quá cũ.' },
  bnplPlans: { label: 'Kế hoạch trả góp 4 kỳ được duyệt', help: 'Số khách nhận được kế hoạch trả góp bốn kỳ.' },
  bnplLoss: { label: 'Nợ xấu trả góp 4 kỳ dự kiến', help: 'Số tiền ngân hàng dự kiến không thu được từ các kế hoạch đó.' },
  a2aReleased: { label: 'Chuyển khoản tức thì đã giải phóng', help: 'Lệnh chuyển tài khoản-tới-tài khoản đã qua kiểm tra pacs.008 và sổ cái.' },
  atmJams: { label: 'Kẹt ATM', help: 'Lần rút tiền mà khách đã bị trừ tiền nhưng tiền không ra. Tiền nằm ở tài khoản treo cho tới khi kiểm đếm tiền mặt xử lý.' },
  wait: { label: 'Thời gian chờ trung bình', help: 'Số phút một giao dịch nằm trong hàng chờ.' },
  falseBreaks: { label: 'Sai lệch giả', help: 'Bản ghi bị gắn cờ sai lệch nhưng chỉ là sai số làm tròn. Thời gian nhân viên bị lãng phí.' },
  leakedCount: { label: 'Lỗi thật bị khớp mất', help: 'Lỗi thật trong bản ghi mà biên sai số đã cho qua như khớp.' },
  leakage: { label: 'Giá trị lỗi bị khớp mất', help: 'Số tiền trong các lỗi đó.' },
  suspense: { label: 'Số dư tài khoản treo cuối ngày', help: 'Tiền nằm trong tài khoản treo, chưa được giải thích.' },
  reconBacklog: { label: 'Chưa đối soát lúc nửa đêm', help: 'Bản ghi ca đêm chưa kịp xử lý. Chúng được chuyển sang đêm mai.' },
  fatigue: { label: 'Mức mệt mỏi nhân viên cuối ngày', help: 'Độ mệt trung bình của cả đội khi ngày kết thúc.' },
};

export function kpiLabel(def: Pick<KpiRowDef, 'id' | 'label'>): string {
  return activeLocale() === 'vi' ? (KPI_VI[def.id]?.label ?? def.label) : def.label;
}

export function kpiHelp(def: Pick<KpiRowDef, 'id' | 'help'>): string {
  return activeLocale() === 'vi' ? (KPI_VI[def.id]?.help ?? def.help) : def.help;
}

const NOTICE_EXACT: Readonly<Record<string, string>> = {
  'Jumped to 23:00. The EOD night cycle is starting: batch clearing, Visa settlement, then reconciliation.': 'Đã nhảy tới 23:00. Chu kỳ cuối ngày bắt đầu: bù trừ theo lô, quyết toán Visa, rồi đối soát.',
  'The bank is back on day 1.': 'Ngân hàng đã quay về ngày 1.',
  'The bank is already running these rules.': 'Ngân hàng đang chạy đúng các quy tắc này.',
  'New rules saved. They start with the next day.': 'Đã lưu quy tắc mới. Chúng bắt đầu từ ngày tiếp theo.',
  'New rules are live. They apply to customers who arrive from now on.': 'Quy tắc mới đã có hiệu lực. Chúng áp dụng cho khách đến từ bây giờ.',
};

const NOTICE_RULES: ReadonlyArray<readonly [RegExp, (m: RegExpExecArray) => string]> = [
  [/^Welcome back\. The bank is on day (\d+)\.$/, (m) => `Chào mừng trở lại. Ngân hàng đang ở ngày ${m[1]}.`],
  [/^Day (\d+) is back at the 08:00 briefing\. The same customers will arrive\.$/, (m) => `Ngày ${m[1]} đã quay về buổi giao ban 08:00. Những khách hàng cũ sẽ lại đến.`],
  [/^(.+) cannot take any more temporary cover today\.$/, (m) => `${m[1]} không thể nhận thêm người hỗ trợ tạm thời hôm nay.`],
];

/** A bank-store notice in the active language. */
export function noticeText(message: string): string {
  if (activeLocale() !== 'vi') return message;
  const exact = NOTICE_EXACT[message];
  if (exact) return exact;
  for (const [re, build] of NOTICE_RULES) {
    const m = re.exec(message);
    if (m) return build(m);
  }
  return message;
}
