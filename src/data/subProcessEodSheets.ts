/**
 * Flow 04's EOD sheet, in its two cases (the suspense switch, store/eodCaseStore.ts): the standard close, and the suspense close,
 * where a reconciliation break is parked in TK 1910 / TK 2912 and balanced back to $0.00 before the day is closed. The suspense case
 * rewrites the five teaching sections (overview, SOP steps, risks, the Nợ / Có entries, KPI & SLA); the code, actors and links stay
 * the flow sheet's.
 */

import { FLOW_SHEETS } from './subProcessFlowSheets';
import { cr, dr, L, type SubProcessInfo } from './subProcessModel';

const BASE = FLOW_SHEETS.find((s) => s.key === 'flow-4')!;

const SUSPENSE: SubProcessInfo = {
  ...BASE,
  title: L('EOD batch & suspense account clearing (TK 1910 / 2912)', 'Xử lý cuối ngày & Tất toán tài khoản treo (TK 1910 / 2912)'),
  overview: L(
    'Suspense close: at 23:00 the day’s approvals are packed into the clearing file and settled with the scheme, but tonight one item does not match in the 3-way reconciliation. It is parked in suspense (TK 1910 for a ledger break, TK 2912 for an interbank clearing break), investigated, and cleared, so both suspense accounts are back to $0.00 before the day is closed.',
    'Khóa sổ có tài khoản treo: lúc 23:00 các giao dịch được duyệt trong ngày được đóng file bù trừ và quyết toán với tổ chức thẻ, nhưng đêm nay một khoản không khớp khi đối soát 3 bên. Khoản này được đưa vào tài khoản treo (TK 1910 cho lệch sổ cái, TK 2912 cho lệch bù trừ liên ngân hàng), điều tra và tất toán, để cả hai tài khoản treo về $0.00 trước khi khóa sổ.',
  ),
  steps: [
    BASE.steps[0]!,
    BASE.steps[1]!,
    BASE.steps[2]!,
    L('3-way match finds a break: Dr 1910 reconciliation suspense / Cr 2011 CASA for a ledger break; Dr 1510 interbank settlement / Cr 2912 clearing suspense for a NAPAS file break.', 'Đối soát 3 bên phát hiện lệch: Nợ 1910 Treo đối soát / Có 2011 CASA nếu lệch sổ cái; Nợ 1510 Thanh toán liên ngân hàng / Có 2912 Treo bù trừ nếu lệch file NAPAS.'),
    L('Investigate each item: match it to the switch log or pacs.002, or raise a return.', 'Điều tra từng khoản: đối chiếu nhật ký chuyển mạch hoặc pacs.002, hoặc lập yêu cầu hoàn trả.'),
    L('Clear: Dr 2011 CASA / Cr 1910 and Dr 2912 / Cr 1510, so both suspense accounts are back to $0.00.', 'Tất toán: Nợ 2011 CASA / Có 1910 và Nợ 2912 / Có 1510, đưa cả hai tài khoản treo về $0.00.'),
    L('Close the day only when TK 1910 and TK 2912 read $0.00; any item left is listed with its age and an owner.', 'Chỉ khóa sổ khi TK 1910 và TK 2912 bằng $0.00; khoản còn lại được liệt kê kèm số ngày tồn và người phụ trách.'),
  ],
  risks: [
    L('A suspense balance left at the close hides a real loss or a customer owed money.', 'Số dư treo còn lại khi khóa sổ có thể che giấu tổn thất thật hoặc khoản nợ khách hàng.'),
    L('Ageing items in TK 1910 / 2912 draw an audit finding and a capital charge.', 'Khoản treo quá hạn tại TK 1910 / 2912 bị kiểm toán lập biên bản và phải trích vốn.'),
    L('Clearing a break against the wrong account double-pays the customer or the scheme.', 'Tất toán khoản lệch sai tài khoản dẫn tới trả trùng cho khách hoặc tổ chức thẻ.'),
    BASE.risks[0]!,
  ],
  gl: [
    dr('recon', 'RECON_SUSPENSE'),
    cr('recon', 'CASA'),
    dr('recon', 'INTERBANK_SETTLEMENT'),
    cr('recon', 'CLEARING_SUSPENSE'),
    dr('recon', 'CASA'),
    cr('recon', 'RECON_SUSPENSE'),
    dr('recon', 'CLEARING_SUSPENSE'),
    cr('recon', 'INTERBANK_SETTLEMENT'),
  ],
  kpi: {
    sla: L('Breaks cleared before day close · TK 1910 / 2912 = $0.00', 'Xử lý lệch trước khi khóa sổ · TK 1910 / 2912 = $0.00'),
    strPct: 92,
    note: L('Share of the day’s records auto-matched; every break is worked to zero before the close.', 'Tỷ lệ bản ghi tự khớp trong ngày; mọi khoản lệch được xử lý về 0 trước khi khóa sổ.'),
  },
  place: 'SUSPENSE',
};

/** Flow 04's sheet for the suspense switch's position. */
export const eodSheet = (suspense: boolean): SubProcessInfo => (suspense ? SUSPENSE : BASE);
