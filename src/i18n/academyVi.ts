/** The Academy in Vietnamese: the 22 four-section lessons, the level titles and goals, the chapter and track names. */

import type { EdgeCase, LessonContent } from '../sim/academyLessons';

const CUSTOMER = 'Khách hàng';
const TERMINAL = 'Máy POS & Bộ chuyển mạch';
const CORE = 'Ngân hàng lõi (Core Banking)';
const SCHEME = 'Tổ chức thẻ';
const RISK = 'Gian lận & Rủi ro';
const VAULT = 'Kho Token';
const LEDGER = 'Sổ cái tổng hợp';
const OPS = 'Vận hành';
const MERCHANT = 'Cửa hàng';
const RAIL = 'Cổng thanh toán';
const CDM = 'Máy nộp tiền (CDM)';
const CREDIT = 'Tín dụng & Thẩm định';

const TIMEOUT: EdgeCase = { code: '68', title: 'Quá thời gian phản hồi mạng', detail: 'Câu trả lời không quay về kịp. Máy hỏi lại hoặc gửi lệnh đảo, nên khách không bao giờ bị trừ tiền hai lần.' };
const FROZEN: EdgeCase = { code: '62', title: 'Thẻ bị khóa', detail: 'Khách đã tự khóa thẻ trong ứng dụng. Ngân hàng từ chối trước cả khi xem số dư.' };
const NSF: EdgeCase = { code: '51', title: 'Không đủ số dư', detail: 'Số dư khả dụng (số dư trừ các khoản đang khoanh giữ) thấp hơn số tiền giao dịch.' };

export const LESSON_CONTENT_VI: Readonly<Record<string, LessonContent>> = {
  // ── Chương 1 · Lần quẹt đầu tiên ─────────────────────────────────────────────
  '1.1': {
    realWorldScenario: 'Mua một ly flat white $5 ở quán cà phê tại Brisbane bằng cách chạm thẻ Visa Debit không tiếp xúc vào máy POS trên quầy.',
    stepByStepFlow: [
      { actor: CUSTOMER, action: 'Chạm điện thoại hoặc thẻ vào máy POS.' },
      { actor: TERMINAL, action: 'Máy đọc chip thẻ, tạo Yêu cầu cấp phép ISO 8583 (0100) và gửi tới ngân hàng thanh toán (acquirer).' },
      { actor: SCHEME, action: 'Acquirer chuyển bản tin 0100 qua mạng Visa tới ngân hàng đã phát hành thẻ.' },
      { actor: CORE, action: 'Ngân hàng phát hành nhận yêu cầu. Chưa có tiền nào dịch chuyển: quán cà phê mới chỉ đang hỏi.' },
    ],
    whyItMatters: 'Tách câu hỏi (“thẻ này có trả được $5 không?”) khỏi việc chuyển tiền giúp hàng triệu lần chạm thẻ nhận câu trả lời có/không trong chưa đầy một giây, còn phần chuyển tiền chậm hơn được để dành cho ban đêm.',
    edgeCasesAndErrors: [
      { code: null, title: 'Không đọc được thẻ', detail: 'Thẻ bị cong hoặc chạm quá nhẹ khiến máy không gửi yêu cầu. Khách chỉ cần chạm lại.' },
      { code: '14', title: 'Số thẻ không hợp lệ', detail: 'Số thẻ không thuộc thẻ nào do ngân hàng phát hành.' },
      TIMEOUT,
    ],
  },
  '1.2': {
    realWorldScenario: 'Yêu cầu $5 của quán cà phê tới ngân hàng. Khách hàng có $50 trong tài khoản thanh toán.',
    stepByStepFlow: [
      { actor: CORE, action: 'Kiểm tra thẻ đang hoạt động và không bị khóa, rồi xác minh mã PIN hoặc mã mật mã của giao dịch không tiếp xúc.' },
      { actor: CORE, action: 'Tính số dư khả dụng: số dư tài khoản trừ đi các khoản đã khoanh giữ.' },
      { actor: CORE, action: 'Khoanh giữ cấp phép $5 trên tài khoản thanh toán (CASA) để số tiền không thể bị tiêu hai lần.' },
      { actor: LEDGER, action: 'Ghi bút toán khoanh giữ: Nợ 1110 / Có 2110. Số dư của khách vẫn là $50; số dư khả dụng còn $45.' },
    ],
    whyItMatters: 'Khoanh giữ tiền đảm bảo cửa hàng chắc chắn được trả mà không cần quyết toán ngay, giúp tiết kiệm băng thông mạng và giữ bộ chuyển mạch nhanh vào giờ cao điểm.',
    edgeCasesAndErrors: [NSF, FROZEN, { code: '75', title: 'Nhập sai PIN quá số lần', detail: 'Ba lần nhập sai PIN sẽ khóa thẻ cho tới khi khách đặt lại.' }],
  },
  '1.3': {
    realWorldScenario: 'Tiền đủ, nên máy POS kêu bíp xanh và nhân viên pha chế trao ly cà phê.',
    stepByStepFlow: [
      { actor: CORE, action: 'Tạo Phản hồi cấp phép (0110) với mã phản hồi 00 (Chấp thuận) và mã cấp phép.' },
      { actor: SCHEME, action: 'Phản hồi đi ngược qua Visa và acquirer về máy POS của quán.' },
      { actor: TERMINAL, action: 'Hiển thị Chấp thuận và in hóa đơn. Quán thêm giao dịch vào lô bán hàng hôm nay.' },
    ],
    whyItMatters: 'Cấp phép là một lời hứa, chưa phải là thanh toán. Quán có thể yên tâm giao hàng vì ngân hàng đã khoanh giữ tiền.',
    edgeCasesAndErrors: [
      { code: '68', title: 'Phản hồi chấp thuận bị thất lạc', detail: 'Ngân hàng đã duyệt nhưng máy POS không nhận được. Máy gửi lệnh đảo (0400) để giải tỏa khoản khoanh giữ.' },
      { code: null, title: 'Chạm thẻ trùng', detail: 'Cùng một thẻ chạm hai lần trong vài giây bị bước kiểm tra trùng lặp phát hiện, nên chỉ có một khoản khoanh giữ.' },
    ],
  },
  '1.4': {
    realWorldScenario: 'Cùng khách hàng đó thử trả bữa trưa $60 nhưng chỉ còn $45 khả dụng sau khoản khoanh giữ cà phê.',
    stepByStepFlow: [
      { actor: CORE, action: 'Phát hiện số dư khả dụng ($45) thấp hơn số tiền ($60).' },
      { actor: CORE, action: 'Trả về bản tin 0110 với RC 51 (Không đủ số dư). Không khoanh giữ và không ghi gì vào sổ cái.' },
      { actor: TERMINAL, action: 'Hiển thị Từ chối. Khách có thể thử thẻ khác hoặc số tiền nhỏ hơn.' },
    ],
    whyItMatters: 'Từ chối rõ ràng bảo vệ cả hai bên: khách không rơi vào khoản thấu chi ngoài ý muốn, và ngân hàng không cho vay khoản tiền chưa từng đồng ý cho vay.',
    edgeCasesAndErrors: [NSF, FROZEN, { code: '61', title: 'Vượt hạn mức giao dịch ngày', detail: 'Tiền vẫn còn, nhưng hạn mức chi tiêu trong ngày của thẻ đã dùng hết.' }],
  },

  // ── Chương 2 · Thẻ ảo & định tuyến 3DS ──────────────────────────────────────
  '2.1': {
    realWorldScenario: 'Đặt mua đôi giày thể thao $89 trên mạng bằng thẻ ảo đã lưu trong ứng dụng mua sắm.',
    stepByStepFlow: [
      { actor: CUSTOMER, action: 'Bấm Thanh toán trên trang thanh toán. Không có thẻ vật lý và không có PIN.' },
      { actor: MERCHANT, action: 'Cửa hàng trực tuyến gửi token thẻ, CVV động và dữ liệu thiết bị tới cổng thanh toán của mình.' },
      { actor: TERMINAL, action: 'Cổng thanh toán chuyển thành bản tin 0100 đánh dấu giao dịch không xuất trình thẻ (thương mại điện tử) và gửi tới ngân hàng.' },
    ],
    whyItMatters: 'Giao dịch không xuất trình thẻ chiếm phần lớn gian lận, vì ai nắm được dãy số cũng có thể thử. Đánh dấu kênh giao dịch cho phép ngân hàng chỉ áp dụng kiểm tra chặt hơn ở nơi cần thiết.',
    edgeCasesAndErrors: [
      { code: null, title: 'Bỏ dở thanh toán', detail: 'Khách đóng tab trước khi yêu cầu được gửi. Không có gì tới ngân hàng.' },
      TIMEOUT,
    ],
  },
  '2.2': {
    realWorldScenario: 'Cửa hàng giày không bao giờ thấy số thẻ thật, chỉ thấy một token thay thế.',
    stepByStepFlow: [
      { actor: VAULT, action: 'Tra cứu token (DPAN) và đổi thành số thẻ thật (FPAN).' },
      { actor: VAULT, action: 'Kiểm tra CVV động, mã thay đổi vài phút một lần, so với giá trị mong đợi.' },
      { actor: CORE, action: 'Tiếp tục xử lý với số thẻ thật, y như một chiếc thẻ được cầm trên tay.' },
    ],
    whyItMatters: 'Nếu cửa hàng bị tấn công, kẻ gian chỉ lấy được những token không dùng được ở đâu khác. Ngân hàng giữ cho nơi duy nhất lưu số thẻ thật luôn nhỏ gọn và được bảo vệ nghiêm ngặt.',
    edgeCasesAndErrors: [
      { code: '14', title: 'Token không xác định', detail: 'Token không trỏ tới thẻ nào trong kho.' },
      { code: 'N7', title: 'CVV động hết hạn hoặc sai', detail: 'Mã được chép từ ảnh chụp màn hình cũ hoặc bị gõ sai.' },
    ],
  },
  '2.3': {
    realWorldScenario: 'Đơn hàng $89 đến từ một điện thoại mới ở bang khác lúc 2 giờ sáng, nên ngân hàng xem xét kỹ hơn.',
    stepByStepFlow: [
      { actor: RISK, action: 'Chấm điểm giao dịch dựa trên thiết bị, vị trí, số tiền và lịch sử của khách.' },
      { actor: RISK, action: 'Rủi ro thấp: cho đi thẳng (3DS xác thực liền mạch).' },
      { actor: RISK, action: 'Rủi ro trung bình: yêu cầu khách chứng minh danh tính (thử thách 3DS).' },
      { actor: RISK, action: 'Rủi ro cao: từ chối mà không hỏi.' },
    ],
    whyItMatters: 'Yêu cầu tất cả mọi người chứng minh sẽ mất doanh số; không hỏi ai thì mời gian lận vào. Định tuyến theo rủi ro giữ cho phần lớn giao dịch suôn sẻ và chỉ tạo ma sát ở nơi có nguy hiểm.',
    edgeCasesAndErrors: [
      { code: '59', title: 'Nghi ngờ gian lận', detail: 'Điểm đủ cao để từ chối ngay.' },
      { code: null, title: 'Cảnh báo sai', detail: 'Một khách thật đang du lịch nước ngoài bị thử thách hoặc bị chặn. Quy tắc tốt giữ cho chuyện này hiếm khi xảy ra.' },
    ],
  },
  '2.4': {
    realWorldScenario: 'Khách nhận mã SMS 6 chữ số và nhập vào cửa sổ thanh toán.',
    stepByStepFlow: [
      { actor: RISK, action: 'Gửi mật khẩu một lần (OTP) tới số điện thoại đã đăng ký.' },
      { actor: CUSTOMER, action: 'Nhập mã vào màn hình 3DS trong thời gian cho phép.' },
      { actor: CORE, action: 'Mã đúng: giao dịch được cấp phép và khoanh giữ tiền, như ở chương 1.' },
    ],
    whyItMatters: 'Thử thách hoàn tất chứng minh chủ thẻ có mặt, nên nếu sau này giao dịch hóa ra gian lận thì trách nhiệm chuyển khỏi cửa hàng. Cửa hàng chấp nhận chút phiền hà để đổi lấy sự bảo vệ đó.',
    edgeCasesAndErrors: [
      { code: '05', title: 'Không hoàn tất thử thách', detail: 'Khách đóng cửa sổ hoặc mã hết hạn. Ngân hàng trả lời Không chấp thuận (Do Not Honour).' },
      { code: null, title: 'Chiếm đoạt SIM', detail: 'Kẻ gian đã chiếm số điện thoại nhận được mã. Vì vậy các ngân hàng bổ sung kiểm tra thiết bị.' },
    ],
  },

  // ── Chương 3 · Dò thẻ & phát hiện gian lận ──────────────────────────────────
  '3.1': {
    realWorldScenario: 'Một con bot thử 40 giao dịch $1 trong hai phút trên trang quyên góp từ thiện, mỗi lần với một thẻ bị đánh cắp khác nhau.',
    stepByStepFlow: [
      { actor: MERCHANT, action: 'Trang quyên góp nhận một loạt giao dịch rất nhỏ từ cùng một thiết bị.' },
      { actor: RISK, action: 'Quy tắc tần suất (velocity) đếm số lần thử theo thẻ, theo thiết bị và theo cửa hàng trong một khoảng thời gian ngắn.' },
      { actor: RISK, action: 'Khi số đếm vượt ngưỡng, mẫu hình bị gắn cờ là dò thẻ.' },
    ],
    whyItMatters: 'Kẻ dò thẻ dùng giao dịch nhỏ để tìm thẻ bị đánh cắp nào còn hoạt động, rồi chi tiêu lớn ở nơi khác. Chặn bước dò là chặn luôn vụ gian lận lớn hơn theo sau.',
    edgeCasesAndErrors: [
      { code: '59', title: 'Vượt ngưỡng tần suất', detail: 'Quá nhiều lần thử trong khoảng thời gian; các lần sau bị từ chối vì nghi ngờ gian lận.' },
      { code: null, title: 'Mệt mỏi vì cảnh báo', detail: 'Quá nhiều cảnh báo khiến chuyên viên bắt đầu duyệt mà không xem. Quy tắc phải được tinh chỉnh, không chỉ thêm vào.' },
    ],
  },
  '3.2': {
    realWorldScenario: 'Một khoản quyên góp $1 đến từ thiết bị quen; khoản khác từ một trình giả lập mới tinh, không có lịch sử.',
    stepByStepFlow: [
      { actor: RISK, action: 'Cho mỗi lần thử một điểm rủi ro dựa trên thiết bị, tốc độ, số tiền và hành vi trước đây.' },
      { actor: RISK, action: 'So điểm với các ngưỡng cho qua, thử thách và từ chối.' },
      { actor: CORE, action: 'Thực hiện quyết định: cấp phép, gửi thử thách 3DS, hoặc từ chối.' },
    ],
    whyItMatters: 'Một điểm số duy nhất cho phép một chính sách bao quát hàng nghìn tín hiệu. Ngân hàng tinh chỉnh các ngưỡng để cân bằng tổn thất gian lận với doanh số thật bị mất.',
    edgeCasesAndErrors: [
      { code: '59', title: 'Điểm vượt ngưỡng từ chối', detail: 'Bị từ chối vì nghi ngờ gian lận.' },
      { code: '05', title: 'Thử thách thất bại', detail: 'Lần thử bị thử thách và con bot không trả lời được.' },
    ],
  },
  '3.3': {
    realWorldScenario: 'Lần thử tiếp theo của con bot bị chặn và thẻ bị đánh cắp được gắn cờ trước khi bị dùng mua máy tính xách tay $900.',
    stepByStepFlow: [
      { actor: CORE, action: 'Trả lời từ chối cho cửa hàng. Không khoanh giữ gì trên tài khoản.' },
      { actor: RISK, action: 'Ghi thiết bị và thẻ vào kho mẫu hình để quy tắc lần sau kích hoạt sớm hơn.' },
      { actor: OPS, action: 'Liên hệ chủ thẻ thật và thay thẻ nếu xác nhận bị đánh cắp.' },
    ],
    whyItMatters: 'Mỗi lần chặn được đều dạy cho hệ thống. Đưa mẫu hình quay lại là điều biến một lần bắt được thành sự bảo vệ lâu dài.',
    edgeCasesAndErrors: [
      FROZEN,
      { code: null, title: 'Gian lận đã lọt qua', detail: 'Một giao dịch gian lận đã duyệt sau đó bị tra soát hoàn tiền; tổn thất được ghi vào 5010.' },
    ],
  },

  // ── Chương 4 · BNPL & duyệt trả góp ─────────────────────────────────────────
  '4.1': {
    realWorldScenario: 'Mua tai nghe $400 và chọn Trả 4 kỳ tại trang thanh toán thay vì trả một lần.',
    stepByStepFlow: [
      { actor: CUSTOMER, action: 'Chọn Trả 4 kỳ trên trang thanh toán.' },
      { actor: MERCHANT, action: 'Cửa hàng gửi yêu cầu kế hoạch (số tiền, khách hàng, cửa hàng) tới bộ phận BNPL của ngân hàng.' },
      { actor: CREDIT, action: 'Yêu cầu được xếp hàng chờ thẩm định. Nó không đi qua mạng lưới thẻ.' },
    ],
    whyItMatters: 'BNPL là một khoản vay nhỏ. Ngân hàng phải quyết định có cho vay hay không, nên yêu cầu đi tới bộ phận tín dụng, không phải bước kiểm tra số dư đơn giản.',
    edgeCasesAndErrors: [{ code: null, title: 'Cửa hàng chưa đăng ký', detail: 'Cửa hàng không cung cấp BNPL, nên tùy chọn này không bao giờ hiện ra.' }, TIMEOUT],
  },
  '4.2': {
    realWorldScenario: 'Bộ phận BNPL xem lịch sử trả nợ của người mua tai nghe trước khi đồng ý.',
    stepByStepFlow: [
      { actor: CREDIT, action: 'Đọc điểm thẩm định của khách và các khoản BNPL hiện có.' },
      { actor: CREDIT, action: 'Quyết định có thể đưa ra bốn kỳ trả góp $100 hay không.' },
      { actor: CREDIT, action: 'Đặt khoản trả trước: thường là kỳ đầu tiên, thu ngay hôm nay.' },
    ],
    whyItMatters: 'Quy định cho vay có trách nhiệm yêu cầu ngân hàng kiểm tra khả năng trả nợ của khách. Điểm tốt cũng giữ tổn thất nợ xấu của ngân hàng ở mức thấp.',
    edgeCasesAndErrors: [
      { code: null, title: 'Thẩm định từ chối', detail: 'Điểm quá thấp; khách được đề nghị thanh toán bằng thẻ thay thế.' },
      { code: null, title: 'Quá nhiều kế hoạch đang mở', detail: 'Dư nợ BNPL hiện có đã chạm hạn mức.' },
    ],
  },
  '4.3': {
    realWorldScenario: 'Kỳ đầu $100 được thu hôm nay; ba kỳ còn lại tiếp theo mỗi hai tuần.',
    stepByStepFlow: [
      { actor: CORE, action: 'Thu kỳ đầu tiên từ tài khoản thanh toán hoặc hạn mức tín dụng.' },
      { actor: LEDGER, action: 'Ghi nhận $300 còn lại là khoản khách nợ: 1310.' },
      { actor: MERCHANT, action: 'Cửa hàng được trả đủ; ngân hàng gánh phần rủi ro còn lại.' },
    ],
    whyItMatters: 'Cửa hàng nhận tiền ngay và trả phí để có doanh số cao hơn; ngân hàng hưởng khoản phí đó và nhận rủi ro thu hồi nợ.',
    edgeCasesAndErrors: [
      { ...NSF, detail: 'Không thu được khoản trả trước; kế hoạch chuyển về thanh toán bằng thẻ.' },
      { code: null, title: 'Trễ một kỳ trả góp', detail: 'Một kỳ sau thất bại, phí trễ hạn được tính và quy trình thu hồi nợ bắt đầu.' },
    ],
  },

  // ── Chương 5 · Chuyển tiền nhanh tài khoản (A2A) & ISO 20022 ─────────────────────────────────
  '5.1': {
    realWorldScenario: 'Một người bạn chuyển $120 tiền vé xem hòa nhạc qua PayID, và tiền đến trong vài giây.',
    stepByStepFlow: [
      { actor: RAIL, action: 'Nhận thông điệp chuyển khoản pacs.008 trên kênh thanh toán tức thì.' },
      { actor: RAIL, action: 'Kiểm tra XML: các trường bắt buộc, tài khoản hợp lệ, số tiền và loại tiền.' },
      { actor: CORE, action: 'Ghi có vào tài khoản và trả lời bằng trạng thái pacs.002 (đã chấp nhận).' },
    ],
    whyItMatters: 'Thông điệp ISO 20022 mang dữ liệu phong phú, có cấu trúc (ai, vì sao, số hóa đơn), nên giao dịch có thể được kiểm tra và đối soát tự động thay vì bằng tay.',
    edgeCasesAndErrors: [
      { code: null, title: 'RJCT: thông điệp không hợp lệ', detail: 'Bản tin pacs.008 sai định dạng bị từ chối (FF01) trước khi tiền dịch chuyển.' },
      { code: null, title: 'Tài khoản đã đóng', detail: 'Tài khoản nhận không còn tồn tại; khoản tiền được trả lại người gửi.' },
    ],
  },
  '5.2': {
    realWorldScenario: 'Chủ một doanh nghiệp nhỏ nộp $500 doanh thu cuối tuần tại máy nộp tiền mặt trên vỉa hè.',
    stepByStepFlow: [
      { actor: CUSTOMER, action: 'Đưa thẻ vào và nhập PIN tại máy CDM.' },
      { actor: CDM, action: 'Gửi yêu cầu cấp phép để xác nhận thẻ và tài khoản.' },
      { actor: CUSTOMER, action: 'Đưa tiền giấy vào khe của máy.' },
    ],
    whyItMatters: 'Máy nộp tiền cho phép ngân hàng nhận tiền mặt 24/7 mà không cần giao dịch viên, giảm chi phí chi nhánh và giữ dòng tiền mặt quay về ngân hàng.',
    edgeCasesAndErrors: [
      { code: '75', title: 'Nhập sai PIN quá số lần', detail: 'Thẻ bị giữ lại hoặc bị khóa sau quá nhiều lần nhập sai PIN.' },
      { code: '91', title: 'Máy mất kết nối', detail: 'CDM không kết nối được ngân hàng và từ chối nhận tiền.' },
    ],
  },
  '5.3': {
    realWorldScenario: 'Máy đếm $500 và phát hiện một tờ tiền bị rách.',
    stepByStepFlow: [
      { actor: CDM, action: 'Đếm và kiểm tra thật giả từng tờ tiền.' },
      { actor: CDM, action: 'Trả lại các tờ bị từ chối và hiển thị tổng số được chấp nhận để khách xác nhận.' },
      { actor: LEDGER, action: 'Tiền mặt được chấp nhận vào hộp tiền của máy, ghi nhận ở 1015.' },
    ],
    whyItMatters: 'Tiền mặt trong máy là tiền của ngân hàng nhưng không thể cho vay. Theo dõi chặt chẽ giúp bộ phận ngân quỹ lên kế hoạch thanh khoản và các chuyến vận chuyển tiền.',
    edgeCasesAndErrors: [
      { code: '96', title: 'Kẹt bộ nhả hoặc bộ nhận tiền', detail: 'Máy bị kẹt giữa lúc đếm; khoản nộp được giữ lại để kiểm tra thủ công.' },
      { code: null, title: 'Tiền giả', detail: 'Tờ tiền bị giữ lại và báo cáo, không được ghi có.' },
    ],
  },
  '5.4': {
    realWorldScenario: 'Ứng dụng của chủ doanh nghiệp hiện +$500 trước khi họ kịp đi bộ về xe.',
    stepByStepFlow: [
      { actor: CORE, action: 'Ghi có vào tài khoản của khách ngay lập tức.' },
      { actor: LEDGER, action: 'Một bút toán chuyển giá trị từ tiền mặt trong máy sang khách hàng: Nợ 1015 / Có 2010.' },
      { actor: OPS, action: 'Hộp tiền được rút và kiểm đếm sau; mọi chênh lệch đều được điều tra.' },
    ],
    whyItMatters: 'Ghi có tức thì tạo lòng tin và giữ khách hàng dùng các kênh tự phục vụ chi phí thấp thay vì giao dịch viên.',
    edgeCasesAndErrors: [
      { code: null, title: 'Lệch khi đối soát hộp tiền', detail: 'Số đếm thực tế khác nhật ký của máy; khoản chênh được đưa vào 1910 cho tới khi xử lý xong.' },
    ],
  },

  // ── Chương 6 · Bù trừ & quyết toán cuối ngày ────────────────────────────────
  '6.1': {
    realWorldScenario: 'Đến 11 giờ đêm quán cà phê có 380 lần chạm thẻ được duyệt trong ngày, tất cả vẫn chỉ là lời hứa.',
    stepByStepFlow: [
      { actor: CORE, action: 'Mỗi lần duyệt trong ngày đều để lại một khoản khoanh giữ trên tài khoản khách.' },
      { actor: MERCHANT, action: 'Mỗi máy POS chốt lô và gửi tới acquirer.' },
      { actor: OPS, action: 'Ca chạy đêm được lên lịch để gom tất cả cùng một lúc.' },
    ],
    whyItMatters: 'Chuyển tiền theo lô mỗi ngày một lần rẻ hơn rất nhiều so với chuyển theo từng lần chạm, và cho mọi bên một con số rõ ràng mỗi ngày để thống nhất.',
    edgeCasesAndErrors: [
      { code: null, title: 'Khoản khoanh giữ hết hạn', detail: 'Khoản khoanh giữ không bao giờ được xử lý sẽ tự hết sau vài ngày và tiền khả dụng trở lại.' },
    ],
  },
  '6.2': {
    realWorldScenario: 'Lúc 23:00 ngân hàng đóng gói các giao dịch thẻ trong ngày vào một tệp bù trừ.',
    stepByStepFlow: [
      { actor: OPS, action: 'Bộ xử lý lô thu thập mọi bản trình (presentment) đã bù trừ từ tổ chức thẻ.' },
      { actor: SCHEME, action: 'Visa trao đổi tệp bù trừ giữa các ngân hàng phát hành và ngân hàng thanh toán.' },
      { actor: CORE, action: 'Mỗi bản trình được khớp với khoản khoanh giữ cấp phép trước đó.' },
    ],
    whyItMatters: 'Bù trừ xác nhận số tiền cuối cùng của mỗi giao dịch (tiền tip và giao hàng từng phần có thể làm thay đổi) trước khi tiền thật sự dịch chuyển.',
    edgeCasesAndErrors: [
      { code: null, title: 'Bản trình không có cấp phép', detail: 'Một giao dịch đến mà ngân hàng chưa từng duyệt; đây là ứng viên tra soát hoàn tiền.' },
      { code: null, title: 'Số tiền khác khoản khoanh giữ', detail: 'Tiền tip làm thay đổi tổng; khoản khoanh giữ được điều chỉnh theo số tiền bù trừ.' },
    ],
  },
  '6.3': {
    realWorldScenario: 'Visa tính ra ngân hàng nợ ròng $1.2 triệu cho toàn bộ giao dịch mua của khách hàng hôm nay.',
    stepByStepFlow: [
      { actor: SCHEME, action: 'Bù trừ ròng các khoản phải trả và phải thu của mỗi ngân hàng thành một con số duy nhất.' },
      { actor: LEDGER, action: 'Chuyển mỗi khoản khoanh giữ thành bút toán thật: Nợ 2010 / Có 1110 cho khách hàng.' },
      { actor: LEDGER, action: 'Thanh toán cho tổ chức thẻ: Nợ 2110 / Có 1210 cho số tiền ròng.' },
    ],
    whyItMatters: 'Bù trừ ròng nghĩa là mỗi ngân hàng chỉ một lần chuyển thay vì hàng triệu lần, giảm mạnh nhu cầu thanh khoản và rủi ro quyết toán trên toàn mạng lưới.',
    edgeCasesAndErrors: [
      { code: null, title: 'Tệp quyết toán đến muộn', detail: 'Tệp của tổ chức thẻ đến muộn; các bút toán phải chờ và số dư buổi sáng chỉ là tạm tính.' },
      { code: null, title: 'Không đủ tiền quyết toán', detail: 'Tài khoản nostro của ngân hàng bị thiếu; bộ phận ngân quỹ phải bổ sung trước hạn chót.' },
    ],
  },
  '6.4': {
    realWorldScenario: 'Sáng hôm sau một chuyên viên vận hành thấy hai giao dịch không khớp giữa sổ cái và bộ chuyển mạch.',
    stepByStepFlow: [
      { actor: OPS, action: 'So sánh ba bản ghi: sổ cái, tệp bù trừ và nhật ký bộ chuyển mạch.' },
      { actor: OPS, action: 'Các mục khớp được đánh dấu đã quyết toán.' },
      { actor: LEDGER, action: 'Các sai lệch được treo ở 1910 cho tới khi có người tìm ra nguyên nhân và xử lý.' },
    ],
    whyItMatters: 'Đối soát là cách ngân hàng chứng minh sổ sách đúng. Sai lệch không được giải thích là nơi lỗi và gian lận ẩn náu, nên cơ quan quản lý yêu cầu xử lý nhanh.',
    edgeCasesAndErrors: [
      { code: '68', title: 'Quá thời gian để lại “bóng ma”', detail: 'Một giao dịch quá thời gian đã được ngân hàng duyệt nhưng không tới được máy POS; đối soát tìm ra và đảo nó.' },
      { code: null, title: 'Bản ghi bù trừ bị trùng', detail: 'Cùng một giao dịch được bù trừ hai lần; một bản bị đảo.' },
    ],
  },
};

/** Vietnamese title and goal of every Academy level, keyed by level id ("2.3"). */
export const LEVEL_TEXT_VI: Readonly<Record<string, { title: string; goal: string }>> = {
  '1.1': { title: 'Chạm thẻ tại máy POS', goal: 'Một lần chạm thẻ trở thành thông điệp gửi tới ngân hàng. Chưa có gì được chi: cửa hàng mới chỉ đang hỏi.' },
  '1.2': { title: 'Kiểm tra và khoanh giữ tiền', goal: 'Ngân hàng xem số dư khả dụng và, nếu đủ, khoanh giữ số tiền đó cho cửa hàng.' },
  '1.3': { title: 'Chấp thuận', goal: 'Đủ tiền: máy POS nhận được chấp thuận và khách cầm ly cà phê ra về.' },
  '1.4': { title: 'Từ chối do không đủ số dư', goal: 'Không đủ tiền (NSF, mã phản hồi 51): cùng một quầy trả lời Từ chối và không khoanh giữ gì.' },
  '2.1': { title: 'Đơn thanh toán đến', goal: 'Giao dịch trực tuyến không có thẻ trong tay, nên ngân hàng phải cẩn thận hơn về việc ai đang thật sự trả tiền.' },
  '2.2': { title: 'Mã hóa thẻ và dCVV', goal: 'Cửa hàng chỉ thấy số thẻ thay thế. Kho token đổi nó thành số thật và kiểm tra mã bảo mật thay đổi liên tục.' },
  '2.3': { title: 'Định tuyến rủi ro 3DS', goal: 'Rủi ro thấp đi thẳng, rủi ro trung bình phải chứng minh, rủi ro cao bị từ chối.' },
  '2.4': { title: 'Thử thách OTP', goal: 'Khách nhập mã được nhắn tới điện thoại. Thử thách hoàn tất chuyển trách nhiệm gian lận sang ngân hàng.' },
  '3.1': { title: 'Phát hiện dò thẻ', goal: 'Kẻ dò thẻ bắn ra nhiều giao dịch rất nhỏ để tìm thẻ còn sống. Quy tắc tần suất đếm số lần thử trên mỗi thẻ trong khoảng thời gian ngắn.' },
  '3.2': { title: 'Chấm điểm rủi ro', goal: 'Mỗi lần thử nhận điểm rủi ro từ thiết bị, tốc độ và lịch sử. Điểm quyết định cho qua, thử thách hay từ chối.' },
  '3.3': { title: 'Chặn và từ chối', goal: 'Lần thử bị từ chối kết thúc ở ô Từ chối, không khoanh giữ trên tài khoản, và mẫu hình được lưu cho quy tắc lần sau.' },
  '4.1': { title: 'Yêu cầu kế hoạch trả góp', goal: 'Tại trang thanh toán khách chọn Trả 4 kỳ thay vì trả một lần. Yêu cầu đi tới thẩm định, không qua mạng lưới thẻ.' },
  '4.2': { title: 'Thẩm định', goal: 'Quầy đọc điểm thẩm định của khách và quyết định có đưa ra kế hoạch bốn kỳ hay không, cùng khoản trả trước.' },
  '4.3': { title: 'Kiểm tra tín dụng và trả trước', goal: 'Kỳ đầu được thu từ tài khoản hoặc hạn mức tín dụng. Nếu bước kiểm tra từ chối, thẻ là phương án dự phòng.' },
  '5.1': { title: 'Giao dịch nhận tiền chuyển khoản nhanh (Incoming Transfer)', goal: 'Chuyển khoản liên ngân hàng đến dưới dạng thông điệp pacs.008. Cổng kiểm tra thông điệp đúng định dạng trước khi tiền dịch chuyển.' },
  '5.2': { title: 'Nộp tiền mặt tự động (ATM/CDM Deposit)', goal: 'Khách đưa thẻ và PIN vào máy trên vỉa hè để nộp tiền mặt vào tài khoản.' },
  '5.3': { title: 'Kiểm đếm và thanh khoản', goal: 'Máy đếm và kiểm tra tiền. Tiền mặt vào hộp tiền của máy, cũng là tiền mặt của ngân hàng ngoài đường phố.' },
  '5.4': { title: 'Ghi có vào tài khoản', goal: 'Tài khoản được ghi có ngay khi tiền mặt còn nằm trong máy: một bút toán chuyển tiền từ quỹ tiền mặt sang khách hàng.' },
  '6.1': { title: 'Đã duyệt trong ngày', goal: 'Mọi giao dịch được duyệt trong ngày chỉ là lời hứa. Chúng chờ ca chạy đêm.' },
  '6.2': { title: 'Bù trừ theo lô', goal: 'Lúc 23:00 các giao dịch trong ngày được đóng gói vào một tệp bù trừ.' },
  '6.3': { title: 'Quyết toán với tổ chức thẻ', goal: 'Visa bù trừ ròng xem ai nợ ai, tiền dịch chuyển, và các khoản khoanh giữ thành bút toán thật trong sổ cái.' },
  '6.4': { title: 'Đối soát 3 bên', goal: 'Sổ cái, tệp bù trừ và bộ chuyển mạch phải khớp nhau. Khớp thì quyết toán; lệch thì chờ trong tài khoản treo để người xử lý.' },
};

/** Vietnamese chapter titles and topics, keyed by chapter id. */
export const CHAPTER_TEXT_VI: Readonly<Record<number, { title: string; topic: string }>> = {
  1: { title: 'Lần quẹt đầu tiên', topic: 'Luồng POS & từ chối do không đủ số dư' },
  2: { title: 'Thẻ ảo & định tuyến 3DS', topic: 'Thanh toán web, mã hóa thẻ, OTP' },
  3: { title: 'Dò thẻ & phát hiện gian lận', topic: 'Quy tắc tần suất, điểm rủi ro' },
  4: { title: 'BNPL & duyệt trả góp', topic: 'Thẩm định & kiểm tra tín dụng' },
  5: { title: 'Chuyển tiền nhanh tài khoản (Account-to-Account / A2A) & ISO 20022', topic: 'Nộp tiền CDM & thanh khoản' },
  6: { title: 'Bù trừ & quyết toán cuối ngày', topic: 'Bút toán sổ cái ngân hàng lõi' },
};

/** Vietnamese knowledge-track names, keyed by track id. */
export const TRACK_TEXT_VI: Readonly<Record<number, { title: string; blurb: string }>> = {
  1: { title: 'Nền tảng', blurb: 'Thẻ, tài khoản, những chiếc máy khách hàng chạm vào và các mã mà ngân hàng trả lời.' },
  2: { title: 'Vận hành', blurb: 'Một giao dịch thẻ được cấp phép, bảo mật, thanh toán, đảo và khiếu nại như thế nào.' },
  3: { title: 'Chuyên sâu', blurb: 'Chuyển khoản tức thì, thanh khoản tiền mặt, chuẩn thông điệp, sổ cái, và cách ngân hàng giữ an toàn, minh bạch.' },
};

/** Vietnamese glossary (the same entries are the flashcards), keyed by glossary id. */
export const GLOSSARY_VI: Readonly<Record<string, { term: string; definition: string }>> = {
  'card-types': { term: 'Thẻ tín dụng, thẻ ghi nợ và thẻ trả trước', definition: 'Thẻ tín dụng chi tiêu tiền của ngân hàng trong một hạn mức và trả lại sau. Thẻ ghi nợ chi tiêu ngay tiền của chính bạn trong tài khoản CASA. Thẻ trả trước chỉ chi được số tiền đã nạp sẵn.' },
  casa: { term: 'Tài khoản CASA', definition: 'Tài khoản vãng lai và tiết kiệm (Current Account and Savings Account). Phần vãng lai giữ tiền ra vào hằng ngày; phần tiết kiệm sinh lãi. Thẻ ghi nợ rút từ đây, và một giao dịch được duyệt trước tiên sẽ khoanh giữ số tiền.' },
  overdraft: { term: 'Hạn mức thấu chi', definition: 'Hạn mức được thỏa thuận cho phép tài khoản vãng lai xuống dưới 0, có tính phí hoặc lãi. Số dư khả dụng bằng số dư cộng hạn mức chưa dùng, trừ các khoản đang khoanh giữ.' },
  stations: { term: 'POS, CDM và CRM', definition: 'POS là máy bán hàng nơi cửa hàng nhận thẻ. CDM (máy nộp tiền) chỉ nhận tiền vào. CRM (máy tái chế tiền) nhận tiền vào và trả chính những tờ tiền đó cho khách tiếp theo.' },
  'iso-response-codes': { term: 'Mã phản hồi ISO 00, 51, 05', definition: 'Câu trả lời ngân hàng gửi lại trong trường 39 của bản tin ISO 8583. 00 là chấp thuận, 51 là không đủ số dư, và 05 là “không chấp thuận”, một lời từ chối chung của ngân hàng phát hành, ví dụ vì rủi ro.' },
  ekyc: { term: 'eKYC', definition: 'Định danh khách hàng điện tử: ngân hàng xác minh khách hàng mới từ xa, thường bằng ảnh giấy tờ tùy thân, ảnh selfie có kiểm tra người thật và đối chiếu với cơ sở dữ liệu chính thức, nên không cần tới chi nhánh.' },
  'qr-codes': { term: 'Mã QR tĩnh và động', definition: 'Mã QR tĩnh là một mã cố định của cửa hàng, khách tự nhập số tiền. Mã QR động được tạo cho một giao dịch, chứa số tiền và mã tham chiếu, thường có hạn dùng, nên khó bị lạm dụng hơn.' },
  'virtual-card': { term: 'Thẻ ảo và CVV động', definition: 'Thẻ ảo là số thẻ không có phôi nhựa, dùng cho mua sắm trực tuyến. CVV động (dCVV) thay đổi vài phút một lần, nên số thẻ bị đánh cắp vô dụng nếu không có mã hiện hành.' },
  'four-party': { term: 'Mô hình thanh toán bốn bên', definition: 'Bốn bên tham gia một giao dịch thẻ: chủ thẻ, cửa hàng, ngân hàng phát hành (ngân hàng của chủ thẻ) và ngân hàng thanh toán (ngân hàng của cửa hàng). Tổ chức thẻ như Visa đứng giữa các ngân hàng và đặt ra quy tắc.' },
  'auth-capture': { term: 'Cấp phép và ghi nhận', definition: 'Cấp phép: ngân hàng phát hành kiểm tra giao dịch và khoanh giữ tiền, nhưng chưa có gì dịch chuyển. Ghi nhận (capture): cửa hàng yêu cầu số tiền đã khoanh giữ, và quyết toán sau đó mới chuyển tiền. Khoản khoanh giữ không được ghi nhận sẽ được giải tỏa.' },
  tokenization: { term: 'Mã hóa thẻ (Tokenization)', definition: 'Số thẻ thật được thay bằng một token chỉ dùng được cho một thiết bị hoặc một cửa hàng. Cửa hàng không bao giờ thấy số thật, token bị đánh cắp vô dụng ở nơi khác, và kho token ánh xạ ngược về thẻ thật.' },
  'three-ds': { term: 'Định tuyến rủi ro 3DS 2.0 và OTP', definition: 'Ngân hàng phát hành chấm điểm mỗi giao dịch trực tuyến từ dữ liệu thiết bị và hành vi. Rủi ro thấp đi thẳng theo luồng xác thực liền mạch, rủi ro trung bình bị thử thách như mật khẩu một lần (OTP), rủi ro cao bị từ chối. Thử thách hoàn tất thường chuyển trách nhiệm gian lận sang ngân hàng phát hành.' },
  'mdr-interchange': { term: 'Phí MDR và phân chia phí interchange', definition: 'Phí chiết khấu thương mại (MDR) là phí cửa hàng trả cho ngân hàng thanh toán trên mỗi giao dịch thẻ. Nó được chia thành interchange (cho ngân hàng phát hành), phí tổ chức thẻ (cho mạng lưới) và biên lợi nhuận của ngân hàng thanh toán. Minh họa với tỷ lệ giả định: 2.0% của $100 là $2.00 = $1.20 + $0.10 + $0.70.' },
  'refund-void': { term: 'Hoàn tiền và hủy giao dịch', definition: 'Hủy (void) hủy bỏ giao dịch trước khi quyết toán: khoản khoanh giữ được giải tỏa và khách thường không bị trừ tiền. Hoàn tiền (refund) trả tiền lại sau khi quyết toán, dưới dạng một khoản ghi có mới có thể mất vài ngày mới hiện.' },
  chargeback: { term: 'Khiếu nại và tra soát hoàn tiền', definition: 'Chủ thẻ khiếu nại một giao dịch với ngân hàng phát hành. Ngân hàng phát hành có thể đòi lại tiền từ ngân hàng thanh toán (chargeback), và cửa hàng có thể phản hồi bằng bằng chứng. Cửa hàng thua phải mất số tiền và thường thêm một khoản phí.' },
  bnpl: { term: 'Thẩm định BNPL trả 4 kỳ', definition: 'Mua trước Trả sau chia giao dịch thành bốn kỳ bằng nhau: kỳ đầu khi thanh toán, các kỳ sau khoảng hai tuần một lần. Trong vài giây, bộ phận thẩm định đọc điểm và lịch sử của khách để quyết định có đưa ra kế hoạch hay không và hạn mức bao nhiêu.' },
  'a2a-instant': { term: 'Chuyển khoản tức thì tài khoản sang tài khoản', definition: 'Tiền đi từ tài khoản ngân hàng này sang tài khoản khác không qua mạng lưới thẻ, và quyết toán trong vài giây (tại Úc qua NPP, thường dùng PayID). Đã quyết toán là cuối cùng: không thể đòi lại như tra soát thẻ.' },
  'cdm-liquidity': { term: 'Nộp tiền CDM và thanh khoản', definition: 'Tiền mặt nộp vào được ghi có cho khách ngay, trong khi tiền giấy nằm trong hộp tiền của máy cho tới khi được thu gom. Ngân hàng theo dõi lượng tiền mặt so với sổ cái để máy không bị đầy hoặc cạn tiền.' },
  'iso-20022': { term: 'Thông điệp XML ISO 20022', definition: 'Chuẩn thông điệp thanh toán XML có cấu trúc và phong phú hơn, có chỗ cho tên, địa chỉ, mục đích và thông tin chuyển tiền. pacs.008 là lệnh chuyển khoản khách hàng giữa các ngân hàng, và pacs.002 báo trạng thái của nó.' },
  'double-entry': { term: 'Bút toán kép trên sổ cái', definition: 'Mọi bút toán trên sổ cái tổng hợp đều có một bút Nợ và một bút Có cùng số tiền, nên sổ sách luôn cân. Ví dụ trong mô phỏng: Nợ 1110-Khoanh giữ tài khoản thanh toán $20.00 | Có 2110-Quỹ chờ quyết toán $20.00.' },
  alm: { term: 'ALM', definition: 'Quản lý tài sản nợ - tài sản có: cân đối những gì ngân hàng cho vay và đầu tư (tài sản) với nguồn vốn (nợ phải trả), để có thể chi trả khi đến hạn và không bị tổn hại khi lãi suất biến động.' },
  nim: { term: 'NIM', definition: 'Biên lãi ròng: thu nhập lãi trừ chi phí lãi, chia cho tài sản sinh lãi bình quân. Nó cho thấy ngân hàng kiếm được bao nhiêu từ chênh lệch giữa lãi cho vay và lãi huy động.' },
  basel: { term: 'Hệ số an toàn vốn Basel', definition: 'Basel III yêu cầu ngân hàng giữ vốn tối thiểu so với tài sản có rủi ro: ít nhất 4.5% vốn cổ phần phổ thông, 6% vốn cấp 1 và 8% tổng vốn, cộng thêm 2.5% đệm bảo toàn vốn.' },
  'bank-run': { term: 'Kiểm tra sức chịu đựng rút tiền ồ ạt', definition: 'Rút tiền ồ ạt là khi nhiều người gửi tiền rút cùng lúc. Kiểm tra sức chịu đựng giả định một phần tiền gửi rời đi và xem tài sản thanh khoản còn đủ bù đắp, ví dụ hệ số khả năng chi trả (LCR) giữ ở mức từ 100% trở lên trong 30 ngày.' },
  aml: { term: 'Phòng chống rửa tiền trong ba bước', definition: '1) KYC: nhận biết khách hàng khi họ mở tài khoản. 2) Giám sát: theo dõi giao dịch theo quy tắc, như nhiều giao dịch sát dưới một ngưỡng. 3) Báo cáo: gửi báo cáo giao dịch đáng ngờ (SAR) cho cơ quan quản lý, tại Úc là báo cáo vấn đề đáng ngờ cho AUSTRAC, mà không báo động cho khách hàng.' },
};

type Four = readonly [string, string, string, string];

/** Vietnamese chapter quizzes: prompt, options and explanation, keyed by question id. The right answer index never changes. */
export const QUIZ_VI: Readonly<Record<string, { prompt: string; options: Four; explanation: string }>> = {
  '1-a': { prompt: 'Máy POS gửi yêu cầu cấp phép $20. Ngay lúc đó ngân hàng làm gì với số tiền?', options: ['Trả cho cửa hàng', 'Khoanh giữ, chưa dịch chuyển', 'Không làm gì cho tới cuối ngày', 'Thu phí rồi hoàn lại sau'], explanation: 'Cấp phép kiểm tra số dư và khoanh giữ. Tiền chỉ dịch chuyển sau, lúc quyết toán.' },
  '1-b': { prompt: 'Mã phản hồi nào nghĩa là không đủ số dư?', options: ['00', '05', '14', '51'], explanation: '51 là không đủ số dư. 00 là chấp thuận và 05 là “không chấp thuận” chung.' },
  '1-c': { prompt: 'Máy nào nhận tiền vào và trả chính những tờ tiền đó cho khách tiếp theo?', options: ['Máy POS', 'CDM', 'CRM', 'Máy đọc QR'], explanation: 'CRM tái chế tiền mặt. CDM chỉ nhận tiền nộp.' },
  '1-d': { prompt: 'Tài khoản vãng lai có $50, hạn mức thấu chi $200 và không có khoản khoanh giữ. Số dư khả dụng là bao nhiêu?', options: ['$50', '$150', '$200', '$250'], explanation: 'Số dư khả dụng là số dư cộng hạn mức thấu chi chưa dùng, trừ khoản khoanh giữ: $50 + $200 = $250.' },
  '2-a': { prompt: 'Vì sao mã QR động an toàn hơn mã tĩnh?', options: ['Nó được in to hơn', 'Nó được tạo cho một giao dịch, kèm số tiền và mã tham chiếu', 'Ngân hàng không bao giờ thấy nó', 'Nó không bao giờ hết hạn'], explanation: 'Mã động gắn với một giao dịch, nên không thể dùng lại cho số tiền khác.' },
  '2-b': { prompt: 'CVV động bảo vệ trước điều gì?', options: ['Số thẻ bị đánh cắp được dùng một mình', 'Cửa hàng trừ tiền hai lần', 'Giao dịch bị từ chối', 'Máy POS chậm'], explanation: 'Mã thay đổi vài phút một lần, nên chỉ có số thẻ thì không dùng được.' },
  '2-c': { prompt: 'eKYC cho phép ngân hàng làm gì?', options: ['Bỏ qua kiểm tra danh tính', 'Xác minh danh tính khách mới từ xa, ví dụ bằng ảnh giấy tờ và selfie', 'Duyệt mọi giao dịch', 'Mở tài khoản cho bất kỳ ai'], explanation: 'eKYC thay việc đến chi nhánh bằng xác minh danh tính từ xa.' },
  '3-a': { prompt: 'Trong mô hình bốn bên, ai là ngân hàng phát hành?', options: ['Ngân hàng của cửa hàng', 'Tổ chức thẻ', 'Ngân hàng của chủ thẻ', 'Cửa hàng'], explanation: 'Ngân hàng phát hành là ngân hàng của chủ thẻ. Ngân hàng thanh toán là ngân hàng của cửa hàng.' },
  '3-b': { prompt: 'Theo 3DS 2.0, giao dịch trực tuyến rủi ro trung bình sẽ ra sao?', options: ['Đi thẳng', 'Khách bị thử thách, ví dụ bằng OTP', 'Luôn bị từ chối', 'Chờ lô ban đêm'], explanation: 'Rủi ro thấp được xác thực liền mạch, rủi ro trung bình bị thử thách, rủi ro cao bị từ chối.' },
  '3-c': { prompt: 'Mã hóa thẻ đạt được điều gì?', options: ['Cửa hàng thấy số thẻ thật', 'Token bị đánh cắp vô dụng ngoài thiết bị hoặc cửa hàng của nó', 'Giao dịch quyết toán tức thì', 'Không còn phí'], explanation: 'Token thay thế thẻ và chỉ hoạt động ở nơi nó được phát hành.' },
  '3-d': { prompt: 'Khác biệt giữa cấp phép và ghi nhận là gì?', options: ['Chúng là cùng một bước', 'Cấp phép khoanh giữ tiền; ghi nhận yêu cầu số tiền đó cho cửa hàng', 'Ghi nhận diễn ra trước', 'Cấp phép chuyển tiền'], explanation: 'Cấp phép khoanh giữ tiền. Ghi nhận yêu cầu số tiền đã khoanh giữ và quyết toán mới chuyển tiền.' },
  '4-a': { prompt: 'Cửa hàng trả 2.0% MDR cho giao dịch $100. Ai nhận phần interchange?', options: ['Ngân hàng thanh toán', 'Ngân hàng phát hành', 'Khách hàng', 'Cửa hàng'], explanation: 'Interchange thuộc về ngân hàng phát hành. Tổ chức thẻ lấy phí của mình và ngân hàng thanh toán giữ phần còn lại.' },
  '4-b': { prompt: 'Một giao dịch bị hủy trước khi quyết toán. Đó gọi là gì?', options: ['Hủy (void)', 'Hoàn tiền (refund)', 'Tra soát (chargeback)', 'Phản hồi của cửa hàng (representment)'], explanation: 'Hủy là trước quyết toán. Hoàn tiền là trả lại tiền sau quyết toán.' },
  '4-c': { prompt: 'Ai khởi xướng một vụ tra soát hoàn tiền?', options: ['Cửa hàng', 'Chủ thẻ, bằng cách khiếu nại với ngân hàng phát hành', 'Nhân viên ngân hàng thanh toán', 'Tổ chức thẻ tự làm'], explanation: 'Chủ thẻ khiếu nại với ngân hàng phát hành, ngân hàng này sau đó có thể đòi lại tiền từ ngân hàng thanh toán.' },
  '4-d': { prompt: 'Trong giao dịch trả 4 kỳ, bộ phận thẩm định quyết định điều gì?', options: ['Cửa hàng nào được trả', 'Có đưa ra kế hoạch hay không và hạn mức bao nhiêu', 'Mã PIN của thẻ', 'Ngày quyết toán'], explanation: 'Thẩm định đọc điểm và lịch sử của khách và quyết định có đưa ra các kỳ trả góp hay không.' },
  '5-a': { prompt: 'Điều gì đúng với chuyển khoản tức thì A2A sau khi đã quyết toán?', options: ['Có thể tra soát hoàn tiền', 'Đó là kết quả cuối cùng', 'Chờ lô ban đêm', 'Cần có thẻ'], explanation: 'Chuyển khoản tức thì là cuối cùng sau khi quyết toán. Không có tra soát kiểu thẻ.' },
  '5-b': { prompt: 'ISO 20022 bổ sung gì so với bản tin ISO 8583 trường cố định?', options: ['Bản tin nhỏ hơn', 'Dữ liệu XML có cấu trúc phong phú hơn', 'Không có số tài khoản', 'Quyết toán chậm hơn'], explanation: 'ISO 20022 mang dữ liệu có cấu trúc như tên, địa chỉ và mục đích bằng XML.' },
  '5-c': { prompt: 'Sau khi nộp tiền ở CDM, tiền mặt ở đâu?', options: ['Đã ở trụ sở ngân hàng', 'Trong hộp tiền của máy, trong khi khách đã được ghi có', 'Trả lại cho khách', 'Bị tiêu hủy'], explanation: 'Tài khoản được ghi có ngay, nhưng tiền giấy nằm trong máy cho tới khi được thu gom.' },
  '6-a': { prompt: 'Một bút toán $20 được ghi vào sổ cái tổng hợp. Điều nào đúng?', options: ['Chỉ ghi một bút Nợ', 'Ghi một bút Nợ và một bút Có, mỗi bút $20', 'Hai bút Nợ $10', 'Sổ cái được cập nhật vào năm sau'], explanation: 'Bút toán kép luôn ghi Nợ và Có bằng nhau, nên sổ sách cân.' },
  '6-b': { prompt: 'Biên lãi ròng (NIM) được tính thế nào?', options: ['Thu nhập lãi trừ chi phí lãi, chia cho tài sản sinh lãi bình quân', 'Phí chia cho tiền gửi', 'Tài sản chia cho nợ phải trả', 'Chi phí lãi chia cho phí'], explanation: 'NIM so sánh lãi ngân hàng thu và trả với tài sản sinh lãi.' },
  '6-c': { prompt: 'Theo Basel III, hệ số tổng vốn tối thiểu trước các khoản đệm là bao nhiêu?', options: ['2%', '4.5%', '8%', '20%'], explanation: 'Tổng vốn phải ít nhất 8% tài sản có rủi ro, trong đó 4.5% vốn cổ phần phổ thông và 6% vốn cấp 1.' },
  '6-d': { prompt: 'Kiểm tra sức chịu đựng rút tiền ồ ạt kiểm tra điều gì?', options: ['Máy ATM có sạch không', 'Tài sản thanh khoản có đủ bù một làn sóng rút tiền đột ngột', 'Khách gõ PIN nhanh thế nào', 'Phí có công bằng không'], explanation: 'Nó giả định một phần tiền gửi rời đi và kiểm tra đệm thanh khoản vẫn đủ bù.' },
  '6-e': { prompt: 'Thứ tự đúng của ba bước AML là gì?', options: ['Báo cáo, giám sát, nhận biết khách hàng', 'Giám sát, nhận biết khách hàng, báo cáo', 'Nhận biết khách hàng, giám sát, báo cáo', 'Nhận biết khách hàng, báo cáo, giám sát'], explanation: 'KYC khi khách gia nhập, giám sát trong lúc họ giao dịch, và báo cáo giao dịch đáng ngờ khi có điều bất thường.' },
};
