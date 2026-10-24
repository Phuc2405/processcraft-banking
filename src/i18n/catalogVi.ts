/**
 * Vietnamese for the Build Lab's node catalog: each node type's name and description, its ports, its settings, and the
 * descriptions of the facts a condition can read.
 *
 * The catalog stays English (definitions are saved with the canvas and the grader matches on them). These accessors give
 * the learner-facing text in the active language. Node, port and setting labels the learner did not type are recognised
 * by their English text; anything else is shown as written.
 */

import { activeLocale } from './locale';

const vi = (): boolean => activeLocale() === 'vi';

const NODE_VI: Readonly<Record<string, { label: string; description: string }>> = {
  nd_start_payment: { label: 'Yêu cầu thanh toán', description: 'Nơi mọi giao dịch đi vào quy trình của bạn. Một sơ đồ cần đúng một điểm này.' },
  nd_end_outcome: { label: 'Kết thúc: Kết quả', description: 'Kết thúc giao dịch với kết quả bạn chọn. Dùng một sự kiện cho mỗi kết quả riêng để mỗi nhánh dễ đọc.' },
  nd_gateway_xor: { label: 'Quyết định (XOR)', description: 'Gửi giao dịch xuống đúng một nhánh. Các cạnh được thử theo thứ tự ưu tiên; điều kiện đúng đầu tiên thắng. Đánh dấu một cạnh là mặc định để không gì lọt qua.' },
  nd_gateway_and: { label: 'Song song (AND)', description: 'Tách: gửi giao dịch xuống mọi nhánh ra cùng lúc. Gộp: chờ tới khi có token đến trên mọi nhánh vào đã nối. Nếu một nhánh không bao giờ tới, điểm gộp bị kẹt.' },
  nd_token_vault: { label: 'Tra cứu kho token', description: 'Chuyển số thẻ ảo (DPAN) thành thẻ thật (FPAN) và tài khoản nguồn. DPAN không xác định sẽ phát sinh TOKEN_NOT_FOUND, nên hãy nối cổng lỗi. Thẻ không phải thẻ ảo đi thẳng qua.' },
  nd_dcvv_verifier: { label: 'Bộ xác minh dCVV', description: 'So CVV động với giá trị kho mong đợi và kiểm tra nó được tạo trong cửa sổ hiệu lực. Ghi dcvvStatus: VALID, EXPIRED hoặc MISMATCH.' },
  nd_three_ds_evaluator: { label: 'Bộ đánh giá rủi ro 3DS', description: 'Chấm điểm giao dịch theo chính sách 3DS của ngân hàng phát hành và chọn nhánh: xác thực liền mạch, thử thách (OTP), hoặc từ chối. Nó cũng đọc kết quả thử thách đã hoàn tất khi yêu cầu quay lại.' },
  nd_core_ledger_check: { label: 'Kiểm tra sổ cái lõi', description: 'Kiểm tra tài khoản nguồn đủ chi trả số tiền. Thẻ ghi nợ và trả trước so với số dư khả dụng. Thẻ tín dụng so với mức thấp hơn giữa tín dụng khả dụng và hạn mức. Có thể kiểm tra toàn bộ giá mua, hoặc chỉ khoản trả trước của trả góp 4 kỳ.' },
  nd_recon_desk: { label: 'Quầy đối soát (3 bên)', description: 'Khớp bút toán sổ cái lõi, tệp bù trừ của tổ chức thẻ và báo cáo quyết toán của ngân hàng thanh toán. Ghi reconStatus: MATCHED, BREAK_AMOUNT, BREAK_MISSING_LEG hoặc BREAK_DUPLICATE. Với sai lệch số tiền, nó cũng cho biết chênh lệch tỷ giá có giải thích được không (reconCause, fxDirection).' },
  nd_bnpl_underwriter: { label: 'Bộ thẩm định BNPL', description: 'Quyết định có thể đề nghị kế hoạch trả góp 4 kỳ không: điểm thẩm định phải đạt mức tối thiểu và khoản trả trước phải đủ tỷ lệ yêu cầu. Nó tính khoản trả trước nhưng không trừ tiền. Việc đó do Kiểm tra sổ cái lõi đặt ở kỳ đầu tiên làm.' },
  nd_start_a2a: { label: 'Kênh tiếp nhận A2A', description: 'Nơi giao dịch tài khoản-tới-tài khoản đi vào ngân hàng, dưới dạng thông điệp ISO 20022 pacs.008. Nó đứng cạnh Yêu cầu thanh toán thẻ và làm cùng việc: một sơ đồ cần đúng một điểm bắt đầu.' },
  nd_a2a_gateway: { label: 'Cổng thanh toán A2A', description: 'Đọc thông điệp pacs.008 (EndToEndId, DebtorAgent, CreditorAgent, InterbankSettlementAmount) và trạng thái của cổng. Ghi năm dữ kiện: a2aValid, a2aRail (tức thì hoặc RTGS), a2aPriority (chi lương là ưu tiên), a2aQueue và a2aLiquidity. Nó không quyết định gì: bạn định tuyến theo các dữ kiện.' },
  nd_aml_screening: { label: 'Sàng lọc AML', description: 'So tên khách với danh sách cấm vận (OFAC) và danh sách người có ảnh hưởng chính trị, và tìm dấu hiệu chia nhỏ giao dịch: nhiều lần nộp tiền mặt ngay dưới ngưỡng báo cáo. Ghi amlStatus, amlMatchScore, amlList và amlStructuring. Trùng tên là đầu mối, không phải phán quyết: so khớp mờ tạo ra cảnh báo sai.' },
  nd_case_investigation: { label: 'Điều tra vụ việc', description: 'Mở nhật ký kiểm toán của khách và so giấy tờ danh tính đã xác minh (ngày sinh, quốc tịch) với người trong danh sách. Ghi caseVerdict: FALSE_POSITIVE, TRUE_MATCH hoặc INCONCLUSIVE. Nó chậm và tốn thời gian chuyên viên, nên chỉ gửi các lần trùng tên thật.' },
  nd_chargeback_desk: { label: 'Quầy khiếu nại & tra soát', description: 'Đưa khiếu nại thẻ qua RETRIEVAL_REQUEST, FIRST_CHARGEBACK, REPRESENTMENT và PRE_ARBITRATION, và xác định ai chịu trách nhiệm. Nó đọc authenticated từ Bộ đánh giá rủi ro 3DS, nên hãy chạy bộ đó trước. Ghi disputeWindow, disputeLiability và disputeNext.' },
};

/** Node-type labels by their English text, for labels that appear inside messages and on placed nodes. */
const NODE_LABEL_VI: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries({
    'Payment Request': 'nd_start_payment',
    'End: Outcome': 'nd_end_outcome',
    'Decision (XOR)': 'nd_gateway_xor',
    'Parallel (AND)': 'nd_gateway_and',
    'Token Vault Lookup': 'nd_token_vault',
    'dCVV Verifier': 'nd_dcvv_verifier',
    '3DS Risk Evaluator': 'nd_three_ds_evaluator',
    'Core Ledger Check': 'nd_core_ledger_check',
    'Recon Desk (3-Way)': 'nd_recon_desk',
    'BNPL Underwriter': 'nd_bnpl_underwriter',
    'A2A Inflow Channel': 'nd_start_a2a',
    'A2A Payment Gateway': 'nd_a2a_gateway',
    'AML Screening': 'nd_aml_screening',
    'Case Investigation': 'nd_case_investigation',
    'Dispute & Chargeback Desk': 'nd_chargeback_desk',
  }).map(([en, id]) => [en, NODE_VI[id]!.label]),
);

const PORT_VI: Readonly<Record<string, string>> = {
  In: 'Vào',
  Next: 'Tiếp',
  'On error': 'Khi lỗi',
  'Branch 1': 'Nhánh 1',
  'Branch 2': 'Nhánh 2',
  'Branch 3': 'Nhánh 3',
  'Branch 4': 'Nhánh 4',
};

const CONFIG_VI: Readonly<Record<string, { label: string; description: string }>> = {
  outcome: { label: 'Kết quả', description: 'Kết quả báo cho chủ thẻ, cửa hàng, hoặc hàng chờ vận hành.' },
  reasonCode: { label: 'Mã lý do', description: 'Không bắt buộc. Một số cấp độ kiểm tra nó, ví dụ để gửi sai lệch tới đúng hàng chờ treo.' },
  validityWindowMs: { label: 'Cửa sổ hiệu lực (ms)', description: 'dCVV còn hiệu lực bao lâu sau khi được tạo. Chính sách của chương trình này là 60 giây.' },
  frictionlessBelow: { label: 'Xác thực liền mạch khi rủi ro dưới', description: 'Điểm rủi ro dưới giá trị này được bỏ qua thử thách.' },
  rejectAtOrAbove: { label: 'Từ chối khi rủi ro từ', description: 'Điểm rủi ro bằng hoặc trên giá trị này bị từ chối thẳng, kể cả khi đã hoàn tất thử thách.' },
  amountToCheck: { label: 'Số tiền cần kiểm tra', description: 'FULL_AMOUNT kiểm tra toàn bộ giá mua. FIRST_INSTALMENT chỉ kiểm tra khoản trả trước của trả góp 4 kỳ, và cần một Bộ thẩm định BNPL đã duyệt kế hoạch trước đó trên cùng nhánh.' },
  toleranceMinor: { label: 'Biên sai số (cent)', description: 'Khoảng chênh lớn nhất giữa các vế vẫn được coi là khớp. Bao gồm sai số làm tròn và tỷ giá.' },
  minScore: { label: 'Điểm tối thiểu (0-1000)', description: 'Điểm thẩm định dưới mức này không đủ điều kiện.' },
  minDownPaymentPct: { label: 'Trả trước tối thiểu (%)', description: 'Tỷ lệ số tiền phải trả trước. Trả góp 4 kỳ dùng 25%.' },
  instantLimitMinor: { label: 'Hạn mức kênh tức thì (cent)', description: 'Giao dịch đơn lẻ lớn nhất mà kênh tức thì chở. Lớn hơn thì đi qua RTGS.' },
  queueCapacity: { label: 'Sức chứa hàng chờ (thông điệp)', description: 'Khi đã có chừng này thông điệp đang chờ, cổng được coi là nghẽn.' },
  priorityReserveMinor: { label: 'Dự trữ ưu tiên (cent)', description: 'Thanh khoản giữ lại cho giao dịch ưu tiên. Giao dịch thường chỉ dùng được phần trên mức này.' },
  matchThreshold: { label: 'Ngưỡng trùng tên (0-100)', description: 'Một tên đạt ít nhất điểm này so với danh sách được coi là trùng. Thấp hơn thì bắt được nhiều hơn và gắn cờ nhiều người vô tội hơn.' },
  reportingThresholdMinor: { label: 'Ngưỡng báo cáo tiền mặt (cent)', description: 'Các lần nộp tiền mặt bằng hoặc trên mức này được báo cáo tự động. Chia nhỏ giao dịch là tách chúng để nằm ngay dưới mức đó.' },
  minStructuringDeposits: { label: 'Số lần nộp tạo thành mẫu hình', description: 'Bao nhiêu lần nộp ngay dưới ngưỡng, cộng lại vượt ngưỡng, thì bị coi là chia nhỏ giao dịch.' },
  filingWindowDays: { label: 'Thời hạn khiếu nại (ngày)', description: 'Bao lâu sau giao dịch vẫn có thể khiếu nại. Các tổ chức thẻ dùng 120 ngày.' },
};

const CONFIG_LABEL_VI: Readonly<Record<string, string>> = {
  Outcome: 'Kết quả',
  'Reason code': 'Mã lý do',
  'Validity window (ms)': 'Cửa sổ hiệu lực (ms)',
  'Frictionless below risk': 'Xác thực liền mạch khi rủi ro dưới',
  'Reject at or above risk': 'Từ chối khi rủi ro từ',
  'Amount to check': 'Số tiền cần kiểm tra',
  'Tolerance (cents)': 'Biên sai số (cent)',
  'Minimum score (0-1000)': 'Điểm tối thiểu (0-1000)',
  'Minimum down payment (%)': 'Trả trước tối thiểu (%)',
  'Instant rail limit (cents)': 'Hạn mức kênh tức thì (cent)',
  'Queue capacity (messages)': 'Sức chứa hàng chờ (thông điệp)',
  'Priority reserve (cents)': 'Dự trữ ưu tiên (cent)',
  'Name-match threshold (0-100)': 'Ngưỡng trùng tên (0-100)',
  'Cash reporting threshold (cents)': 'Ngưỡng báo cáo tiền mặt (cent)',
  'Deposits that make a pattern': 'Số lần nộp tạo thành mẫu hình',
  'Filing window (days)': 'Thời hạn khiếu nại (ngày)',
};

const VARIABLE_VI: Readonly<Record<string, string>> = {
  amount: 'Số tiền giao dịch tính bằng cent.',
  channel: 'Nơi giao dịch được khởi tạo.',
  cardType: 'Loại thẻ được xuất trình.',
  riskScore: 'Rủi ro gian lận, 0 đến 100, càng cao càng rủi ro.',
  availableBalance: 'Số tiền có thể chi tính bằng cent.',
  creditLimit: 'Hạn mức tín dụng quay vòng tính bằng cent (0 nếu không phải thẻ tín dụng).',
  clientTimestamp: 'Thời điểm ứng dụng gửi yêu cầu, epoch ms.',
  rawCvv: 'Dữ liệu PCI. Logic định tuyến không bao giờ được đọc CVV gốc. Hãy dùng dcvvStatus.',
  isFraud: 'Nhãn sự thật dùng để chấm điểm. Ngân hàng không quan sát được nó, nên điều kiện không được dùng. Hãy bắt gian lận qua riskScore.',
  isVirtual: 'True khi cardType là VIRTUAL_DPAN. Có sẵn từ đầu.',
  tokenStatus: 'Kết quả tra cứu kho.',
  fundingSource: 'Loại tài khoản đứng sau thẻ hoặc DPAN.',
  fpanLast4: 'Bốn số cuối của số thẻ thật đứng sau DPAN.',
  dcvvStatus: 'Kết quả kiểm tra CVV động.',
  threeDsPath: 'Nhánh do bộ đánh giá rủi ro 3DS chọn.',
  authenticated: 'True với FRICTIONLESS hoặc CHALLENGE_PASSED.',
  liabilityShift: 'Bên chịu trách nhiệm gian lận cho giao dịch này.',
  ledgerDecision: 'Kết quả kiểm tra tiền.',
  authHoldMinor: 'Số tiền khoanh giữ trên tài khoản nguồn, tính bằng cent. Chỉ được đặt khi đủ tiền.',
  reconStatus: 'Kết quả khớp 3 bên.',
  reconVarianceMinor: 'Chênh lệch lớn nhất giữa ba vế, tính bằng cent.',
  underwritingScore: 'Điểm thẩm định BNPL, 0 đến 1000.',
  downPaymentPct: 'Khoản trả trước theo phần trăm số tiền.',
  bnplDecision: 'Có thể đề nghị kế hoạch trả góp 4 kỳ không.',
  installment1Minor: 'Kỳ trả góp đầu tiên thu khi thanh toán, tính bằng cent. Chỉ được đặt khi đủ điều kiện.',
  installmentAmountMinor: 'Mỗi kỳ trong ba kỳ còn lại, tính bằng cent. Chỉ được đặt khi đủ điều kiện.',
  recentAttempts: 'Số lần thử thanh toán trên thẻ này trong 10 phút qua, tính cả lần này. Một loạt dồn dập là dấu hiệu của dò thẻ.',
  reconCause: 'Đặt cho sai lệch số tiền: FX_RATE khi chênh lệch tỷ giá giải thích được khoản chênh, ngược lại là UNEXPLAINED.',
  fxDirection: 'Chênh lệch tỷ giá nghiêng về phía nào với ngân hàng. LOSS khi tổ chức thẻ quyết toán nhiều hơn số đã ghi sổ.',
  a2aValid: 'True khi thông điệp pacs.008 qua mọi kiểm tra định dạng.',
  a2aRail: 'Kênh phù hợp với số tiền: tức thì tới hạn mức, RTGS khi vượt.',
  a2aPriority: 'PRIORITY cho chi lương (mã mục đích SALA), NORMAL cho mọi thứ khác.',
  a2aQueue: 'CONGESTED khi hàng chờ của cổng đã đạt sức chứa.',
  a2aLiquidity: 'Thanh khoản mà giao dịch này được dùng có đủ không. Giao dịch ưu tiên được dùng khoản dự trữ; giao dịch thường thì không.',
  amlStatus: 'Phát hiện nghiêm trọng nhất: trùng cấm vận, rồi trùng PEP, rồi chia nhỏ giao dịch, rồi sạch.',
  amlMatchScore: 'Điểm trùng tên tốt nhất trên mọi danh sách, 0 đến 100.',
  amlList: 'Danh sách chứa lần trùng tốt nhất, khi nó đạt ngưỡng.',
  amlStructuring: 'True khi các lần nộp tiền mặt cho thấy mẫu hình chia nhỏ giao dịch.',
  caseVerdict: 'Khách có phải người trong danh sách không, theo nhật ký kiểm toán.',
  caseEvidenceCount: 'Bao nhiêu sự kiện xác minh danh tính trong nhật ký kiểm toán so được.',
  disputeWindow: 'Khiếu nại còn được nộp không. Một vụ đã nộp thì vẫn OPEN.',
  disputeLiability: 'Ai chịu tổn thất. Ngân hàng phát hành, khi khiếu nại gian lận nằm trên giao dịch đã xác thực bằng 3-D Secure.',
  disputeNext: 'Khiếu nại đi tiếp tới đâu. NONE nghĩa là tổ chức thẻ không cho phép hành động nào.',
};

/** A node type's name. `en` is the catalog's English label. */
export const nodeDefLabel = (id: string, en: string): string => (vi() ? (NODE_VI[id]?.label ?? en) : en);

/** A node type's description. */
export const nodeDefDescription = (id: string, en: string): string => (vi() ? (NODE_VI[id]?.description ?? en) : en);

/** A node-type label found by its English text (inside a message, or on a placed node). */
export const nodeLabelText = (en: string): string => (vi() ? (NODE_LABEL_VI[en] ?? en) : en);

/** A port's label. */
export const portLabel = (en: string): string => (vi() ? (PORT_VI[en] ?? en) : en);

/** A setting's label. `key` is the setting's key, `en` its English label. */
export const configLabel = (key: string, en: string): string => (vi() ? (CONFIG_VI[key]?.label ?? CONFIG_LABEL_VI[en] ?? en) : en);

/** A setting's description. */
export const configDescription = (key: string, en: string): string => (vi() ? (CONFIG_VI[key]?.description ?? en) : en);

/** A setting's label found by its English text (inside a message). */
export const configLabelText = (en: string): string => (vi() ? (CONFIG_LABEL_VI[en] ?? en) : en);

/** What a condition variable means. */
export const variableDescription = (name: string, en: string): string => (vi() ? (VARIABLE_VI[name] ?? en) : en);
