import { defineMessages } from '../../utils/i18nHelper';

/** The bank map's legend: what each line, shape and wire word means. */
export const mapLegendMessages = defineMessages('mapLegend', {
  button: { en: '🗺️ Map legend', vi: '🗺️ Chú giải sơ đồ' },
  buttonHint: { en: 'What the lines, diamonds and wire labels on the map mean.', vi: 'Ý nghĩa của các đường nối, hình thoi và nhãn trên sơ đồ.' },
  title: { en: 'Map legend', vi: 'Chú giải sơ đồ' },
  close: { en: 'Hide legend', vi: 'Ẩn chú giải' },
  linesTitle: { en: 'Lines and shapes', vi: 'Đường nối và hình khối' },
  lineReject: { en: 'Red dashed line: rejection, fraud, AML or exception routing', vi: 'Đường đỏ nét đứt: luồng từ chối, gian lận, AML hoặc ngoại lệ' },
  lineApprove: { en: 'Solid line (glows blue when busy): approved, standard operational execution', vi: 'Đường liền (sáng xanh khi có giao dịch): luồng được duyệt, vận hành chuẩn' },
  lineNight: { en: 'Solid amber line: the night cycle (end-of-day batch, settlement, reconciliation)', vi: 'Đường liền màu hổ phách: chu trình đêm (lô cuối ngày, quyết toán, đối soát)' },
  lineOtp: { en: 'Violet dotted line: the customer’s one-time password (OTP) challenge', vi: 'Đường tím chấm: bước xác thực mật khẩu một lần (OTP) của khách hàng' },
  gateway: { en: 'XOR gateway (diamond): exclusive join, each payment arrives by exactly one of its lines and leaves by the one trunk', vi: 'Cổng XOR (hình thoi): hợp nhất loại trừ, mỗi giao dịch đến bằng đúng một nhánh và đi tiếp theo một trục duy nhất' },
  frame: { en: 'Tinted frame: a department, the subsystem boundary its desks belong to', vi: 'Khung tô màu: một phòng ban, ranh giới phân hệ chứa các quầy của nó' },
  hoverTip: { en: 'Point at a desk or a line to light only its own paths.', vi: 'Rê chuột lên một quầy hoặc một đường nối để chỉ làm sáng các luồng của nó.' },
  termsTitle: { en: 'Words on the wires', vi: 'Thuật ngữ trên đường nối' },
  term_CTR: { en: 'Cash Transaction Report: large cash moves are reported to the regulator', vi: 'Báo cáo giao dịch tiền mặt giá trị lớn gửi cơ quan quản lý' },
  term_STR: { en: 'Suspicious Transaction Report: a flagged payment goes to the AML desk', vi: 'Báo cáo giao dịch đáng ngờ: giao dịch bị gắn cờ chuyển sang quầy AML' },
  term_clean: { en: 'No fraud signal: the payment goes straight on to the ledger', vi: 'Không có dấu hiệu gian lận: giao dịch đi thẳng vào sổ cái' },
  term_released: { en: 'The AML review cleared a held payment, which now posts', vi: 'Quầy AML đã giải tỏa giao dịch bị giữ, giao dịch được hạch toán' },
  term_refund: { en: 'An accepted dispute credits the customer back', vi: 'Khiếu nại được chấp nhận, tiền được hoàn lại cho khách' },
  term_matched: { en: 'Reconciliation agrees with the network’s file: settled', vi: 'Đối soát khớp với tệp của tổ chức mạng: đã quyết toán' },
  term_break: { en: 'Reconciliation disagrees: the difference waits in Suspense', vi: 'Đối soát lệch: khoản chênh lệch chờ ở tài khoản treo' },
});

export type MapLegendKey = keyof typeof mapLegendMessages.messages;
