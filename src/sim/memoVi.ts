/**
 * The system ledger's memos in Vietnamese. The engine writes each line's memo in English (engine/postings.ts); this rebuilds it
 * in professional Vietnamese banking terms from the line's kind, accounts and amount, so the "Sổ cái hệ thống" column reads
 * natively. One template per posting kind: the Record makes the compiler insist on every kind.
 */

import { formatAud } from '../engine/money';
import type { GLEntry, PostingKind } from '../types/processLearning';
import { accountName } from './plainLanguage';

/** The free-text reasons the engine passes to a suspense break or an AML restraint, in Vietnamese. */
const REASONS_VI: ReadonlyArray<readonly [string, string]> = [
  ['The legs disagree by', 'Các vế đối soát lệch nhau'],
  ['The legs disagree.', 'Các vế đối soát không khớp.'],
  ['The bank booked this payment but a record is missing at the scheme or acquirer.', 'Ngân hàng đã hạch toán giao dịch nhưng thiếu bản ghi tại tổ chức thẻ hoặc ngân hàng thanh toán.'],
  ['The scheme cleared a payment the bank never booked.', 'Tổ chức thẻ đã bù trừ một giao dịch mà ngân hàng chưa hạch toán.'],
  ['The scheme presented the same payment again.', 'Tổ chức thẻ xuất trình trùng một giao dịch.'],
  ['The item was sent to suspense.', 'Khoản mục được chuyển vào tài khoản treo.'],
  ['A name matched a watchlist, so the payment was held.', 'Tên khách hàng trùng danh sách theo dõi nên giao dịch bị tạm giữ.'],
  ['A sanctions match was confirmed.', 'Đã xác nhận trùng danh sách cấm vận.'],
  ['A structuring pattern was reported.', 'Đã báo cáo dấu hiệu chia nhỏ giao dịch.'],
  ['The case is escalated for review.', 'Hồ sơ được chuyển cấp trên xem xét.'],
  ['Sanctions match confirmed.', 'Đã xác nhận trùng danh sách cấm vận.'],
  ['STR filed.', 'Đã gửi báo cáo giao dịch đáng ngờ (STR).'],
];

/** The reason at the head of an English memo, in Vietnamese (empty when there is none). */
export function reasonVi(memo: string): string {
  const hit = REASONS_VI.find(([en]) => memo.startsWith(en));
  return hit ? `${hit[1]} ` : '';
}

const name = (id: GLEntry['debitAccount']): string => accountName(id, 'vi');

const MEMO_VI: Readonly<Record<PostingKind, (e: GLEntry, amount: string) => string>> = {
  AUTH_HOLD: (e, a) => `Tạm giữ (phong tỏa) ${a} trên ${name(e.debitAccount)}; ngân hàng ghi nhận khoản phải trả tổ chức thẻ tương ứng.`,
  HOLD_RELEASE: (e, a) => `Giao dịch không hoàn tất: giải tỏa khoản tạm giữ ${a} trên ${name(e.creditAccount)} và hủy khoản phải trả tổ chức thẻ.`,
  CAPTURE: (_e, a) => `Ngày quyết toán: khoản tạm giữ ${a} được ghi nợ chính thức vào tài khoản khách hàng.`,
  SETTLEMENT: (_e, a) => `Ngân hàng thanh toán ${a} cho tổ chức thẻ; tất toán khoản phải trả.`,
  BNPL_FINANCING: (e, a) => {
    const inst = /instalments of (\$[\d,.]+)/.exec(e.memo)?.[1];
    return `Ngân hàng thanh toán toàn bộ cho đơn vị chấp nhận thẻ và ghi nhận khoản phải thu ${a} từ khách hàng${inst ? `, chia thành ba kỳ trả góp mỗi kỳ ${inst}` : ''}.`;
  },
  SUSPENSE_BREAK: (e, a) =>
    e.debitAccount === 'RECON_SUSPENSE'
      ? `${reasonVi(e.memo)}Ghi nhận ${a} vào tài khoản treo như một khoản đòi chưa được hạch toán.`
      : `${reasonVi(e.memo)}Chuyển ${a} vào tài khoản treo cho đến khi bộ phận vận hành tìm ra nguyên nhân.`,
  FX_VARIANCE: (e, a) =>
    e.debitAccount === 'FX_LOSS_SUSPENSE'
      ? `Tổ chức thẻ quyết toán cao hơn số đã hạch toán ${a} theo tỷ giá: lỗ chênh lệch tỷ giá, treo tại tài khoản lỗ tỷ giá.`
      : `Tổ chức thẻ quyết toán thấp hơn số đã hạch toán ${a} theo tỷ giá: lãi chênh lệch tỷ giá, treo tại tài khoản lãi tỷ giá.`,
  SUSPENSE_CLEARED: (_e, a) => `Bộ phận vận hành đã xác định nguyên nhân, ${a} được thanh toán với tổ chức thẻ; tất toán khoản treo.`,
  A2A_PAYMENT: (e, a) => `Ghi nợ khách hàng ${a}; tài khoản thanh toán ${e.creditAccount === 'A2A_RTGS_SETTLEMENT' ? 'liên ngân hàng giá trị cao (RTGS)' : 'chuyển tiền nhanh'} của ngân hàng chi trả.`,
  A2A_QUEUED: (_e, a) => `Ghi nợ khách hàng ${a} nhưng lệnh đang chờ tại cổng thanh toán; tiền nằm ở tài khoản phải trả chờ xử lý.`,
  PAYMENT_EXECUTED: (_e, a) => `Lệnh được giải phóng: ghi nợ khách hàng ${a} và chuyển sang bù trừ đi.`,
  AML_RESTRAIN: (e, a) => `${reasonVi(e.memo)}Phong tỏa ${a} tại tài khoản tiền bị phong tỏa (AML).`,
  AML_RELEASE: (_e, a) => `Bộ phận tuân thủ xác nhận trùng tên là sai: giải tỏa ${a} về tài khoản khách hàng.`,
  PROVISIONAL_CREDIT: (_e, a) => `Tra soát lần đầu: ghi có tạm thời ${a} cho chủ thẻ; ngân hàng sẽ đòi lại từ tổ chức thẻ.`,
  DISPUTE_RECOVERY: (_e, a) => `Chủ thẻ thắng tra soát: tổ chức thẻ hoàn ${a} cho ngân hàng; tất toán khoản phải thu.`,
  DISPUTE_REVERSAL: (_e, a) => `Đơn vị chấp nhận thẻ thắng tra soát: thu hồi ${a} đã ghi có tạm thời cho chủ thẻ.`,
  CHARGEBACK_REVERSAL: (_e, a) => `Bồi hoàn (chargeback): ${a} phải trả đơn vị chấp nhận thẻ được hoàn về tài khoản chủ thẻ.`,
  ISSUER_LOSS: (_e, a) => `Trách nhiệm thuộc ngân hàng phát hành: hoàn ${a} cho chủ thẻ và ghi nhận tổn thất.`,
  ATM_DISPENSE: (_e, a) => `ATM chi ${a} tiền mặt: ghi nợ khách hàng và giảm tiền mặt trong máy tương ứng.`,
  ATM_JAM: (_e, a) => `Máy ATM bị kẹt tiền: khách hàng đã bị ghi nợ ${a} nhưng không nhận được tiền; chuyển ${a} vào tài khoản treo chờ kiểm quỹ.`,
  ATM_REFUND: (_e, a) => `Kết quả kiểm quỹ cho thấy tiền chưa ra khỏi máy: hoàn ${a} từ tài khoản treo cho khách hàng.`,
  ATM_DEPOSIT: (_e, a) => `ATM nhận ${a} tiền mặt vào hộp tiền: tăng tiền mặt trong máy và ghi có tài khoản khách hàng.`,
  TELLER_DEPOSIT: (_e, a) => `Giao dịch viên thu ${a} tiền mặt vào quỹ: tăng tiền mặt chi nhánh và ghi có tài khoản khách hàng.`,
  TELLER_WITHDRAWAL: (_e, a) => `Giao dịch viên chi ${a} tiền mặt: ghi nợ khách hàng và giảm tiền mặt chi nhánh tương ứng.`,
  SWIFT_REMITTANCE: (e, a) => {
    const ccy = /pays it out in ([A-Z]{3})/.exec(e.memo)?.[1];
    return `Ghi nợ khách hàng ${a}; ngân hàng đại lý (nostro) chi trả cho người thụ hưởng${ccy ? ` bằng ${ccy}` : ''}.`;
  },
  ATM_MISMATCH_REFUND: (_e, a) => `Nhật ký điện tử ATM cho thấy khách chưa nhận tiền: hoàn ${a} cho khách hàng và khôi phục tiền mặt trong máy.`,
  PAYMENT_RETURN: (_e, a) => `pacs.004: ngân hàng nhận hoàn trả ${a}, ghi có lại cho khách hàng.`,
  OPENING_DEPOSIT: (_e, a) => `Khoản nộp mở tài khoản ${a} về qua kênh chuyển tiền nhanh, ghi có cho khách hàng.`,
};

/** A system ledger line's memo in Vietnamese. */
export const memoVi = (e: GLEntry): string => MEMO_VI[e.kind](e, formatAud(e.amount));
