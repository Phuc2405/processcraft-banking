/**
 * The third tier of a flashcard's back: the supplementary business rule or regulation behind the card, one short sentence. The back
 * reads top to bottom as (1) the full term and its core definition, (2) the GL journal, (3) this rule and the reference.
 */

import type { Localized } from '../i18n/localeCore';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

const LATE_INTEREST = L('Overdue interest may not exceed 150% of the contract rate, charged on the overdue principal only.', 'Lãi quá hạn không vượt quá 150% lãi suất trong hạn, chỉ tính trên dư nợ gốc quá hạn.');
const WATERFALL = L('The order is set in the loan contract and applies the same way to every repayment and to collateral proceeds.', 'Thứ tự được quy định trong hợp đồng và áp dụng như nhau cho mọi khoản trả và tiền xử lý TSĐB.');
const TD_EARLY = L('A partial withdrawal is allowed: only the part taken out falls to the demand rate, the rest keeps its term rate.', 'Được rút một phần: chỉ phần rút ra hưởng lãi không kỳ hạn, phần còn lại giữ lãi suất có kỳ hạn.');
const ENFORCE = L('The bank may enforce only after notifying the customer, and must return any surplus over the debt.', 'Ngân hàng chỉ được xử lý sau khi thông báo cho khách, và phải trả lại phần dư vượt khoản nợ.');
const NSF_AGEING = L('Past 10 days overdue the loan moves to group 2 (special mention); past 90 days it is non-performing.', 'Quá hạn trên 10 ngày khoản vay chuyển nhóm 2 (cần chú ý); quá 90 ngày thành nợ xấu.');

/** Keyed by card id: the retail topic cards (retail-*) and the operations cards. */
export const FLASHCARD_DETAIL: Readonly<Record<string, Localized<string>>> = {
  // Retail topic cards
  'retail-bnpl': L('Underwriting checks the credit score and DTI before approval; the shop pays the bank a merchant fee for the plan.', 'Thẩm định kiểm tra điểm tín dụng và DTI trước khi duyệt; cửa hàng trả ngân hàng phí cho gói trả góp.'),
  'retail-card-swipe': L('The interest-free period applies only when the full statement balance is paid by the due date.', 'Thời gian miễn lãi chỉ áp dụng khi trả đủ dư nợ sao kê trước ngày đến hạn.'),
  'retail-card-annual-fee': L('The resulting overdraft accrues interest, and the fee must appear in the bank’s published tariff.', 'Khoản thấu chi phát sinh bị tính lãi, và phí phải có trong biểu phí công bố của ngân hàng.'),
  'retail-card-late-fee': LATE_INTEREST,
  'retail-waterfall': WATERFALL,
  'retail-dti': L('Responsible lending (the NCCP Act in Australia) requires income and expenses to be verified before credit is given.', 'Cho vay có trách nhiệm (Đạo luật NCCP tại Úc) yêu cầu xác minh thu nhập và chi phí trước khi cấp tín dụng.'),
  'retail-td-break': TD_EARLY,
  'retail-collateral-lock': L('A lien is registered on the deposit: it lifts on repayment, or the bank enforces it after notice.', 'Quyền cầm giữ được đăng ký trên khoản tiền gửi: giải tỏa khi trả xong nợ, hoặc ngân hàng xử lý sau khi thông báo.'),
  'retail-collateral-liquidate': ENFORCE,
  'retail-autopay': L('The mandate fixes the amount and date; the customer may revoke it at any time before the next collection.', 'Ủy quyền ghi rõ số tiền và ngày thu; khách có thể hủy bất cứ lúc nào trước kỳ thu kế tiếp.'),
  'retail-autopay-nsf': NSF_AGEING,
  // Operations cards
  electric: L('A biller’s pull needs a standing mandate; a debit the customer never authorised is refunded on request.', 'Lệnh thu của nhà cung cấp cần ủy nhiệm thu còn hiệu lực; khoản trích khách không ủy quyền được hoàn khi khách yêu cầu.'),
  nsf: L('The NSF fee is fee income (4510), not a payment of the bill; repeated returns can make the biller cancel the mandate.', 'Phí NSF là thu nhập phí (4510), không phải trả hóa đơn; trả lại nhiều lần có thể khiến nhà cung cấp hủy ủy nhiệm thu.'),
  momo: L('Only a wallet linked to an own-name account may be topped up; the 1950 payable is settled to zero overnight.', 'Chỉ nạp vào ví liên kết tài khoản chính chủ; khoản phải trả 1950 được quyết toán về 0 trong đêm.'),
  vietqr: L('Over $400 (10M VND) a FacePay biometric match is mandatory; under it, the PIN or app login is enough.', 'Trên $400 (10 triệu VND) bắt buộc xác thực sinh trắc FacePay; dưới mức này, mã PIN hoặc đăng nhập ứng dụng là đủ.'),
  crc: L('CRC-16/CCITT covers the whole payload (tag 63): a single changed character makes it fail.', 'CRC-16/CCITT tính trên toàn bộ chuỗi (thẻ 63): chỉ một ký tự bị đổi là mã sai.'),
  atm: L('An on-us withdrawal at the bank’s own ATM carries no switch fee; only another bank’s card crosses NAPAS.', 'Rút tiền tại ATM của chính ngân hàng (on-us) không mất phí chuyển mạch; chỉ thẻ ngân hàng khác mới đi qua NAPAS.'),
  partial: L('The request is refused whole, the customer is sent to another machine, and a CIT refill is booked.', 'Yêu cầu bị từ chối toàn bộ, khách được hướng dẫn sang máy khác, và lệnh tiếp quỹ CIT được đặt.'),
  jam: L('Suspense must clear by the next cash count; a balance left ageing on 2930 is an audit finding.', 'Tài khoản treo phải được xử lý trước lần kiểm quỹ kế tiếp; số dư treo tồn đọng trên 2930 là phát hiện kiểm toán.'),
  refund: L('The ticket closes only when 2930 is back to zero, and the customer is told the outcome in writing.', 'Phiếu chỉ đóng khi TK 2930 về 0, và khách được thông báo kết quả bằng văn bản.'),
  taken: L('The electronic journal and the cassette count are the evidence a customer dispute is answered with.', 'Nhật ký điện tử và số kiểm đếm hộp tiền là bằng chứng để trả lời khiếu nại của khách.'),
  low: L('The refill moves notes from the vault to the cassette under dual control, so 1011’s total does not change.', 'Tiếp quỹ chuyển tiền từ kho sang hộp tiền theo kiểm soát kép, nên tổng TK 1011 không đổi.'),
  deposit: L('A deposit of $10,000 or more also files a CTR, and the notes are counted under dual control.', 'Khoản nộp từ $10,000 trở lên còn phải lập báo cáo CTR, và tiền được kiểm đếm theo kiểm soát kép.'),
  till: L('Dual control: the teller and a supervisor both sign the transfer, and the counter reopens once it posts.', 'Kiểm soát kép: giao dịch viên và kiểm soát viên cùng ký lệnh chuyển, quầy mở lại khi đã hạch toán.'),
  annual: L('An unarranged overdraft accrues interest at the overdraft rate until the customer pays it back.', 'Thấu chi ngoài thỏa thuận tính lãi theo lãi suất thấu chi đến khi khách hoàn trả.'),
  lock: L('A lock is reversible at the customer’s request; a card reported stolen is blocked for good and reissued.', 'Khóa thẻ có thể mở lại theo yêu cầu của khách; thẻ báo mất cắp bị chặn vĩnh viễn và phát hành lại.'),
  'autopay-nsf': NSF_AGEING,
  'bnpl-approve': L('The other three instalments fall due every two weeks, and each missed one adds a late fee.', 'Ba kỳ còn lại đến hạn mỗi hai tuần, và mỗi kỳ trễ phát sinh phí phạt.'),
  dti: L('The DTI counts every monthly debt payment, the new plan included, against verified income.', 'DTI tính mọi khoản trả nợ hằng tháng, kể cả khoản mới, trên thu nhập đã xác minh.'),
  'late-fee': LATE_INTEREST,
  waterfall: WATERFALL,
  migration: L('Groups: 1 current, 2 at 10–90 days, 3 at 91–180, 4 at 181–360, 5 beyond. Groups 3 to 5 are non-performing.', 'Nhóm 1 trong hạn, 2 quá hạn 10–90 ngày, 3 từ 91–180, 4 từ 181–360, 5 trên 360. Nhóm 3 đến 5 là nợ xấu.'),
  'td-early': TD_EARLY,
  collateral: ENFORCE,
};
