/** The six Learning Hub / guided-tour lessons in Vietnamese. */

import { activeLocale, type Locale } from '../i18n/localeCore';
import { LESSONS, PROCESS_SHORT, type GraphKey, type Lesson, type LessonLayout, type ProcessId, type StepText } from './learning';

interface LessonWords {
  title: string;
  subtitle: string;
  intro: string[];
  steps: Record<string, StepText>;
  /** Wire labels by graph, then by edge id. */
  labels: Partial<Record<GraphKey, Record<string, string>>>;
  /** Synthetic boxes by id. */
  synthetic?: Record<string, { label: string; sub?: string }>;
  /** Synthetic wires by id. */
  syntheticEdges?: Record<string, string>;
  examples: Record<string, { label: string; story: string; suggestion?: string }>;
  takeaways: string[];
}

const SHORT_VI: Record<ProcessId, string> = {
  A: 'Thẻ ảo & dCVV',
  B: 'Bộ máy rủi ro 3DS',
  C: 'BNPL trả góp 4 kỳ',
  D: 'Đối soát cuối ngày',
  E: 'Chuyển khoản tức thì A2A',
  F: 'AML & Tra soát',
};

const VI: Record<ProcessId, LessonWords> = {
  A: {
    title: 'Mã hóa thẻ ảo (Tokenization) & Mã CVV động',
    subtitle: 'Cổng thẻ ảo → Kho token → dCVV → Sổ cái',
    intro: [
      'Thẻ ảo là một số thay thế. Dãy 16 chữ số người mua nhập (DPAN) tự nó không có ý nghĩa: chỉ Kho token của ngân hàng biết nó trỏ tới thẻ thật nào, và tài khoản nào. Đó là mã hóa thẻ (tokenization).',
      'Mã bảo mật của nó thay đổi vài phút một lần (CVV động, hay dCVV). Kẻ gian sao chép được số và mã thì cùng lắm chỉ có vài phút. Ngân hàng phải kiểm tra mã đúng và còn mới, và phải làm việc đó trước khi tốn công vào sổ cái.',
    ],
    steps: {
      n_start: { title: 'Giao dịch tới Cổng thẻ ảo', what: 'Trang thanh toán gửi số thẻ ảo, mã người mua đã nhập, số tiền và dấu thời gian.', why: 'Mọi điều ngân hàng sẽ biết về giao dịch này nằm trong một thông điệp duy nhất, nên việc của cổng chỉ là nhận vào và chuyển tiếp.' },
      n_vault: { title: 'Kho token: số này trỏ tới ai?', what: 'Kho tra cứu số ảo và trả về bốn số cuối của thẻ thật, token còn hoạt động không, tài khoản nào cấp vốn (ghi nợ hay tín dụng) và mã mà nó đang mong đợi.', why: 'Nếu số không có trong kho thì không có gì để đối chiếu, nên giao dịch bị từ chối ngay tại đây. Không làm phiền quầy nào khác.' },
      n_dcvv: { title: 'Kiểm tra dCVV: đúng mã, và đủ mới?', what: 'Hai phép thử. Mã đã nhập có bằng mã kho mong đợi không? Và khoảng thời gian từ khi mã được cấp tới khi thanh toán có nằm trong cửa sổ hiệu lực không?', why: 'Một mã đúng nhưng cũ là dấu hiệu của tấn công phát lại: ai đó đã bắt được mã trước đó và đang dùng lại.' },
      n_xor_dcvv: { title: 'Quyết định: dCVV có hợp lệ không?', what: 'Một lựa chọn loại trừ (XOR). Chỉ mã VALID mới đi tiếp tới sổ cái. Mọi trường hợp khác, hết hạn hoặc sai, đều bị từ chối.', why: 'Đừng bao giờ hỏi “có tiền không?” cho một yêu cầu bạn đã biết là xấu. Nó lãng phí thời gian của sổ cái và có thể khoanh giữ tiền giúp kẻ gian.' },
      n_ledger: { title: 'Sổ cái lõi: có tiền không?', what: 'Kho đã cho biết tài khoản nào cấp vốn cho thẻ. Thẻ ghi nợ được kiểm tra với số dư khả dụng; thẻ tín dụng với hạn mức còn lại. Nếu đủ tiền, sổ cái khoanh giữ.', why: 'Cùng một phép kiểm tra trên loại tài khoản khác đi tới quầy khác, vì thế thẻ ảo có thể rơi vào một trong hai quầy sổ cái trên bản đồ.' },
      n_xor_ledger: { title: 'Quyết định: sổ cái có đồng ý không?', what: 'SUFFICIENT đưa giao dịch tới Đã duyệt. Mọi trường hợp khác bị từ chối do thiếu tiền.', why: 'Hãy để ý điểm khác với quyết định trước: lần này là về tiền của khách, không phải về lòng tin. Hai loại từ chối được đếm riêng trên bảng điều hành.' },
      n_end_approved: { title: 'Đã duyệt', what: 'Tiền đã được khoanh giữ và cửa hàng được báo đồng ý. Đêm nay giao dịch này vào tệp bù trừ.', why: 'Duyệt chưa phải là hết chuyện: chu kỳ đêm (Quy trình D) kiểm tra ba bản ghi có khớp nhau không.' },
      n_end_declined: { title: 'Từ chối', what: 'Cửa hàng được báo không, không có khoản khoanh giữ nào.', why: 'Lý do (thẻ không xác định, mã sai, mã hết hạn, thiếu tiền) cho biết một khách tốt bị mất vì quy tắc hay đơn giản là không trả được.' },
    },
    labels: { virtual: { e3: 'số thẻ không xác định', e5: 'mã hợp lệ', e6: 'hết hạn hoặc sai', e8: 'đủ tiền', e9: 'không đủ' } },
    examples: {
      fresh: { label: 'Một giao dịch bình thường', story: 'Người mua trả $48.00 bằng thẻ ghi nợ ảo, với mã mới 12 giây. Tài khoản có $900.' },
      slow: { label: 'Người gõ chậm', story: 'Cũng người mua đó bị phân tâm và gửi sau 83 giây. Mã đúng, nhưng đã cũ.', suggestion: 'Kéo dài cửa sổ lên 90 giây và khách này qua được. Rồi hãy hỏi nó còn cho ai khác qua.' },
      replay: { label: 'Mã bị phát lại (gian lận)', story: 'Kẻ gian lấy được số thẻ và mã trong một vụ rò rỉ dữ liệu và dùng chúng hai phút rưỡi sau.', suggestion: 'Cửa sổ quá dài cho vụ gian lận này đi thẳng. Đó là cái giá của sự dễ dãi với người gõ chậm.' },
      wrong: { label: 'Gõ nhầm mã', story: 'Người mua gõ 428 thay vì 482.' },
      unknown: { label: 'Một số kho chưa từng thấy', story: 'Ai đó đoán số thẻ ảo. Số này không tồn tại.' },
      broke: { label: 'Đúng mã, không đủ tiền', story: 'Mọi thứ về thẻ đều ổn, nhưng tài khoản phía sau chỉ có $20.00.' },
    },
    takeaways: [
      'Kiểm tra lòng tin trước khi kiểm tra tiền. Mã xấu không bao giờ tới sổ cái.',
      'Cửa sổ hiệu lực là một sự đánh đổi: dài hơn thì dễ chịu với người gõ chậm và dễ dàng cho kẻ phát lại mã bị đánh cắp.',
      'Kho trả lời “tài khoản nào cấp vốn cho thẻ này?”, và câu trả lời quyết định quầy sổ cái nào kiểm tra tiền.',
    ],
  },
  B: {
    title: 'Bộ máy rủi ro 3-D Secure 2.x: Xác thực liền mạch (Frictionless 3DS) vs Thử thách OTP (Challenge Flow)',
    subtitle: 'Cổng thương mại điện tử → Bàn rủi ro 3DS → (điện thoại của khách) → Sổ cái',
    intro: [
      'Mỗi giao dịch thẻ trực tuyến được chấm điểm rủi ro từ 0 tới 100, dựa trên tín hiệu như thiết bị, địa chỉ giao hàng và hành vi của khách. 3-D Secure 2 biến điểm số đó thành một trong ba cách xử lý.',
      'Xác thực liền mạch: điểm đủ thấp để không cần hỏi khách điều gì. Thử thách: ngân hàng gửi mã một lần tới điện thoại chủ thẻ, và một số khách bỏ cuộc. Từ chối: điểm quá cao nên giao dịch bị từ chối ngay. Hai núm điều chỉnh quyết định các ngưỡng nằm đâu, và mọi vị trí của chúng đều là sự đánh đổi giữa gian lận và khách bị mất.',
    ],
    steps: {
      n_start: { title: 'Giao dịch tới Cổng thương mại điện tử', what: 'Trang thanh toán gửi thẻ, số tiền và điểm rủi ro từ các phép kiểm tra thiết bị của cửa hàng.', why: 'Cổng nhận giao dịch vào. Điểm rủi ro đã có sẵn; việc của ngân hàng là quyết định xử lý thế nào.' },
      n_3ds: { title: 'Bàn rủi ro 3DS: xử lý theo cách nào?', what: 'Dưới ngưỡng xác thực liền mạch: FRICTIONLESS. Từ ngưỡng từ chối trở lên: REJECT. Ở giữa: CHALLENGE, trừ khi khách đã hoàn tất một lần, khi đó là CHALLENGE_PASSED (hoặc CHALLENGE_FAILED nếu họ bỏ đi).', why: 'Giao dịch đã xác thực chuyển trách nhiệm gian lận sang phía ngân hàng phát hành. Đó là lý do ngân hàng muốn có chúng, và là lý do khách không thích bước thêm này.' },
      n_xor_3ds: { title: 'Quyết định: giờ đi hướng nào?', what: 'Giao dịch đã xác thực (xác thực liền mạch hoặc đã qua thử thách) đi tới sổ cái. Một thử thách mới kết thúc lần chạy này ở “Gửi OTP”. Mọi trường hợp khác, bị từ chối hoặc thử thách thất bại, đều bị từ chối.', why: 'Sơ đồ không có vòng lặp. Thử thách đưa khách đi, và khi họ quay lại thì cùng sơ đồ chạy lại với câu trả lời.' },
      n_end_challenge: { title: 'Gửi OTP', what: 'Ngân hàng nhắn mã một lần tới điện thoại chủ thẻ và chờ.', why: 'Khách quyết định điều xảy ra tiếp theo: nhập mã, hoặc đóng tab. Lựa chọn đó đã có từ trước khi họ tới; ngân hàng không biết cho tới khi thấy nó.' },
      syn_phone: { title: 'Điện thoại của khách', what: 'Mã một lần đến qua SMS hoặc trong ứng dụng ngân hàng. Khách nhập vào trang thanh toán, hoặc đóng trang và đơn hàng mất.', why: 'Ngân hàng không thấy được điều nào sẽ xảy ra. Mọi điều nó biết đến khi giao dịch quay lại với thử thách được đánh dấu COMPLETED hay ABANDONED.' },
      n_ledger: { title: 'Sổ cái lõi: có tiền không?', what: 'Thẻ ghi nợ được kiểm tra với số dư khả dụng, thẻ tín dụng với hạn mức còn lại.', why: 'Xác thực cho biết người đó có lẽ là chủ thẻ. Nó không nói gì về việc tài khoản có đủ trả không.' },
      n_xor_ledger: { title: 'Quyết định: sổ cái có đồng ý không?', what: 'SUFFICIENT được duyệt. Mọi trường hợp khác bị từ chối do thiếu tiền.', why: 'Chỉ những giao dịch đã qua bước xử lý rủi ro mới tới được câu hỏi này.' },
      n_end_approved: { title: 'Đã duyệt', what: 'Tiền được khoanh giữ và cửa hàng được báo đồng ý.', why: 'Nếu giao dịch này là gian lận, ngân hàng vừa đồng ý hoàn trả nó. Đó là cái giá mà các ngưỡng rủi ro tồn tại để tránh.' },
      n_end_declined: { title: 'Từ chối', what: 'Cửa hàng được báo không.', why: 'Từ chối chỉ là kết quả tốt nếu giao dịch là gian lận. Với khách thật, đó là mất một đơn hàng và một trải nghiệm tồi.' },
    },
    labels: { ecom: { e3: 'đã xác thực', e4: 'cần thử thách', e5: 'bị từ chối, hoặc thử thách thất bại', e7: 'đủ tiền', e8: 'không đủ' } },
    synthetic: { syn_phone: { label: 'Điện thoại của khách', sub: 'mã một lần' } },
    syntheticEdges: { syn_sent: 'đã gửi mã', syn_back: 'đã nhập mã: sơ đồ chạy lại' },
    examples: {
      calm: { label: 'Một giao dịch bình thường, êm ả', story: 'Một khách quen trên chiếc điện thoại quen thuộc. Điểm rủi ro 12.' },
      borderline: { label: 'Giao dịch sát ngưỡng, khách nhập mã', story: 'Thiết bị mới và địa chỉ giao hàng mới. Điểm rủi ro 52. Chủ thẻ nhận SMS và nhập mã.', suggestion: 'Nâng ngưỡng xác thực liền mạch lên 60 và khách này không bao giờ bị hỏi. Ít gián đoạn hơn, nhưng còn ai khác được cho qua?' },
      walkaway: { label: 'Giao dịch sát ngưỡng, khách bỏ cuộc', story: 'Cũng điểm 52, nhưng người mua đang trên tàu, thấy yêu cầu SMS và đóng trang.', suggestion: 'Với ngưỡng xác thực liền mạch ở 60, đơn hàng này đã không bị mất. Hãy xem dòng “Khách tốt bị mất”.' },
      stealth: { label: 'Gian lận trông êm ả', story: 'Kẻ gian với thẻ bị đánh cắp và thiết bị trông sạch sẽ. Điểm rủi ro 34: dưới ngưỡng xác thực liền mạch.', suggestion: 'Hạ ngưỡng xác thực liền mạch xuống 30 và giao dịch này bị thử thách, điều mà kẻ gian chỉ có số thẻ thường không vượt qua được.' },
      ring: { label: 'Gian lận bị thử thách', story: 'Điểm rủi ro 66. Kẻ trộm có số thẻ nhưng không có điện thoại.' },
      traveller: { label: 'Khách thật trông có vẻ rủi ro', story: 'Một khách đang du lịch nước ngoài dùng Wi-Fi khách sạn. Điểm rủi ro 74. Không có gì sai, nhưng trông thì có vẻ sai.', suggestion: 'Kéo ngưỡng từ chối xuống 70 và khách thật này bị từ chối mà không được hỏi gì.' },
    },
    takeaways: [
      'Mỗi ngưỡng rủi ro đánh đổi gian lận với khách bị mất. Không có cách đặt nào tránh được cả hai.',
      'Thử thách không miễn phí: một số khách tốt bỏ đi, và nó tạo thêm việc cho bàn 3DS.',
      'Gian lận có điểm thấp không bao giờ bị thử thách. Cách duy nhất chống lại nó là nâng ngưỡng xác thực liền mạch, và mọi người đều phải chịu thêm ma sát.',
    ],
  },
  C: {
    title: 'Thẩm định BNPL trả góp 4 kỳ & phương án thẻ dự phòng',
    subtitle: 'Cổng thương mại điện tử → Quầy trả góp 4 kỳ → Sổ cái (khoản trả trước, hoặc trả đủ bằng thẻ)',
    intro: [
      'Trả góp 4 kỳ cho người mua trả một phần tư giá ngay và phần còn lại trong ba kỳ. Ngân hàng trả đủ cho cửa hàng, nên thực chất đang cho vay ba phần tư còn lại. Ngân hàng hưởng phí trên mỗi kế hoạch và mất tiền với những khách không bao giờ trả.',
      'Chuyên viên thẩm định đọc điểm của khách và mức trả trước. Nếu cả hai vượt ngưỡng, kế hoạch được đưa ra, và hôm nay chỉ kỳ đầu tiên bị trừ vào thẻ. Nếu không, đơn hàng không mất: nó chuyển sang thanh toán thẻ thông thường với đủ giá.',
    ],
    steps: {
      n_start: { title: 'Hồ sơ tới Cổng thương mại điện tử', what: 'Trang thanh toán gửi giỏ hàng, thẻ liên kết, điểm thẩm định của khách và khoản trả trước họ chọn.', why: 'Cổng nhận vào; thẩm định là điểm dừng ngay sau.' },
      n_bnpl: { title: 'Quầy trả góp 4 kỳ: có đưa ra kế hoạch không?', what: 'Hai phép thử: điểm có bằng hoặc trên mức tối thiểu, và khoản trả trước có ít nhất bằng tỷ lệ tối thiểu của giỏ hàng? Nếu cả hai đạt, kế hoạch là ELIGIBLE và kỳ đầu tiên được tính. Chưa trừ tiền gì.', why: 'Thẩm định đi trước để một khách không được đưa ra kế hoạch không bao giờ bị trừ khoản trả trước mà họ không ngờ tới.' },
      n_xor_plan: { title: 'Quyết định: kế hoạch được duyệt?', what: 'ELIGIBLE đi tới thu khoản trả trước. Mọi trường hợp khác đi tới phương án dự phòng: trả đủ giá bằng thẻ.', why: 'Nhánh mặc định là thứ giữ lại đơn hàng. Không có nó, giỏ hàng của khách không đủ điều kiện sẽ đơn giản là mất.' },
      n_ledger_dp: { title: 'Sổ cái: thu khoản trả trước', what: 'Lần kiểm tra sổ cái này chỉ trừ kỳ đầu tiên, một phần tư giỏ hàng, từ thẻ liên kết.', why: 'Nếu thẻ không đủ trả cả khoản đó, câu trả lời là “từ chối khoản trả trước”, không âm thầm chuyển sang trả đủ giá. Khách đã yêu cầu trả góp.' },
      n_ledger_card: { title: 'Sổ cái: trừ đủ giá', what: 'Cùng quầy đó, đặt để kiểm tra toàn bộ số tiền. Thẻ ghi nợ phải đủ số dư; thẻ tín dụng phải đủ hạn mức còn lại.', why: 'Đây là phương án dự phòng. Từ đây nó là một giao dịch mua bình thường, với interchange bình thường và không có rủi ro nợ xấu.' },
      n_xor_funds: { title: 'Quyết định: thẻ có đủ trả không?', what: 'Bốn kết cục: duyệt kế hoạch, duyệt thẻ dự phòng, từ chối khoản trả trước, hoặc từ chối thẻ. Nhánh được chọn phụ thuộc cả câu trả lời của sổ cái và việc kế hoạch có được duyệt hay không.', why: 'Bốn trạng thái kết thúc được báo cáo riêng để ngân hàng thấy đã viết bao nhiêu kế hoạch và giữ được bao nhiêu đơn hàng nhờ dự phòng.' },
      n_end_bnpl: { title: 'Đã duyệt: trả góp 4 kỳ', what: 'Kế hoạch bắt đầu. Một phần tư đã thu, ba phần còn lại sẽ đến hạn.', why: 'Đây là doanh thu (phí cửa hàng) và rủi ro (các phần chưa trả) trong cùng một kết cục.' },
      n_end_card: { title: 'Đã duyệt: thẻ dự phòng', what: 'Khách trả đủ giá ngay hôm nay.', why: 'Giữ được đơn hàng mà không có rủi ro tín dụng.' },
      n_end_dp_declined: { title: 'Từ chối: khoản trả trước', what: 'Kế hoạch được duyệt nhưng không thu được kỳ đầu tiên.', why: 'Không có tiền nào dịch chuyển và không có kế hoạch nào tồn tại.' },
      n_end_card_declined: { title: 'Từ chối: thẻ', what: 'Không có kế hoạch, và thẻ cũng không đủ trả toàn bộ giá.', why: 'Đơn hàng bị mất.' },
    },
    labels: { bnpl: { e3: 'duyệt kế hoạch', e4: 'chuyển sang thẻ', e7: 'kế hoạch + đủ tiền', e8: 'đủ tiền (không kế hoạch)', e9: 'kế hoạch, thiếu tiền', e10: 'thiếu tiền' } },
    examples: {
      strong: { label: 'Một hồ sơ tốt', story: 'Điểm 710, giỏ hàng $240, trả trước 25%. Thẻ ghi nợ liên kết có $900.', suggestion: 'Nâng điểm tối thiểu lên 720 và ngay cả khách tốt này cũng phải trả đủ.' },
      weak: { label: 'Điểm yếu', story: 'Điểm 570. Đây là kế hoạch ngân hàng có lẽ sẽ hối tiếc.', suggestion: 'Hạ mức tối thiểu xuống 560 và kế hoạch này được viết. Hãy xem dòng “Nợ xấu trả góp 4 kỳ dự kiến”.' },
      lowdown: { label: 'Khoản trả trước quá nhỏ', story: 'Điểm 700, nhưng khách chỉ chọn trả trước 20%.', suggestion: 'Hạ mức trả trước tối thiểu xuống 20% và kế hoạch này được thực hiện.' },
      dpfail: { label: 'Được duyệt, nhưng thẻ không trả nổi kỳ đầu', story: 'Điểm 710, nhưng thẻ liên kết chỉ có $30 trong khi khoản trả trước là $60.' },
      bothfail: { label: 'Không có kế hoạch, thẻ cũng không trả đủ', story: 'Điểm 540 và thẻ có $100 cho giỏ hàng $240.' },
    },
    takeaways: [
      'Thẩm định trước, thu tiền sau. Không ai phải trả trước cho một kế hoạch không được đưa ra.',
      'Bị thẩm định từ chối không có nghĩa là mất đơn hàng: nhánh mặc định chuyển sang trả đủ giá.',
      'Ngưỡng điểm thấp hơn viết được nhiều kế hoạch hơn và nhiều nợ xấu hơn. Điểm hòa vốn là nơi phí bù được tổn thất dự kiến.',
    ],
  },
  D: {
    title: 'Đối soát 3 bên cuối ngày & kế toán tài khoản treo',
    subtitle: 'Bù trừ theo lô → Quyết toán Visa → Đối soát 3 bên → Tài khoản treo',
    intro: [
      'Duyệt một giao dịch trong ngày chỉ là hứa trả tiền. Qua đêm, ba bản ghi độc lập về giao dịch đó phải khớp nhau: sổ cái của chính ngân hàng, tệp bù trừ của tổ chức thẻ (Visa được yêu cầu quyết toán bao nhiêu) và báo cáo quyết toán của ngân hàng thanh toán (ngân hàng của cửa hàng nói đã nhận bao nhiêu).',
      'Phần lớn bản ghi khớp tới từng cent. Một số lệch do làm tròn. Một vài là lỗi thật: sai số tiền, thiếu bản ghi, giao dịch bị trình hai lần. Một sai lệch thật không bao giờ được bỏ qua hay ép cho khớp. Nó được treo trong tài khoản treo cho tới khi có người tìm ra điều đã xảy ra.',
    ],
    steps: {
      syn_batch: { title: 'Bù trừ theo lô (23:00)', what: 'Mọi giao dịch được duyệt hôm nay được gom vào tệp bù trừ.', why: 'Mỗi đêm một tệp là cách các ngân hàng bàn giao hàng nghìn giao dịch cùng lúc.' },
      syn_visa: { title: 'Quyết toán Visa', what: 'Tệp bù trừ được gửi tới tổ chức thẻ, nơi trả về bản ghi riêng về những gì nó sẽ quyết toán.', why: 'Đây là bản ghi thứ hai trong ba bản ghi. Đó là phiên bản của tổ chức thẻ, không phải của ngân hàng.' },
      n_start: { title: 'Bản ghi tới quầy đối soát', what: 'Bản ghi mang ba số tiền: sổ cái, bù trừ của tổ chức thẻ và báo cáo của ngân hàng thanh toán.', why: 'Từ đây câu hỏi chỉ là chúng có khớp nhau không.' },
      n_recon: { title: 'Đối soát 3 bên: các bản ghi có khớp không?', what: 'Quầy lấy số lớn nhất và nhỏ nhất trong ba số tiền. Nếu thiếu một vế, đó là sai lệch thiếu vế. Nếu tổ chức thẻ trình giao dịch hai lần, đó là trùng lặp. Nếu chênh lệch trong biên sai số, đó là khớp; nếu không thì là sai lệch số tiền.', why: 'Biên sai số tồn tại vì các hệ thống thật làm tròn khác nhau. Đây là núm điều chỉnh nguy hiểm nhất của ngân hàng: quá chặt thì sai số vụn thành việc; quá lỏng thì lỗi thật bị khớp mất.' },
      n_xor_recon: { title: 'Quyết định: khớp không?', what: 'Khớp thì được quyết toán. Mỗi loại sai lệch đi theo nhánh riêng, với mã lý do riêng.', why: 'Tách riêng ba loại sai lệch giúp người điều tra biết bắt đầu tìm từ đâu.' },
      n_end_settled: { title: 'Đã quyết toán', what: 'Các bản ghi khớp. Giao dịch hoàn tất.', why: 'Đây là kết cục mà gần như mọi bản ghi đều nên có.' },
      n_end_amount: { title: 'Treo: chênh lệch số tiền', what: 'Các vế lệch nhau nhiều hơn biên sai số.', why: 'Chỉ khoản chênh được treo, không phải cả giao dịch: phần còn lại đã khớp.' },
      n_end_missing: { title: 'Treo: thiếu vế', what: 'Một trong ba bản ghi không tồn tại.', why: 'Thiếu một vế thì không có gì để so, nên toàn bộ số tiền được treo.' },
      n_end_dup: { title: 'Treo: trùng lặp', what: 'Tổ chức thẻ trình cùng một giao dịch hai lần.', why: 'Quyết toán cả hai sẽ trả cửa hàng hai lần. Toàn bộ số tiền được treo cho tới khi bản trùng bị đảo.' },
      syn_suspense: { title: 'Tài khoản treo', what: 'Một tài khoản tạm giữ. Mọi mục nằm đây cho tới khi nhân viên vận hành, chỉ làm trong giờ hành chính, tìm ra nguyên nhân và xử lý.', why: 'Tiền chưa được giải thích không được phép bị quên. Số dư tài khoản treo cứ tăng là cảnh báo rằng quy tắc ca đêm sai hoặc đội ca ngày quá tải.' },
      syn_cleared: { title: 'Đã xử lý', what: 'Nhân viên đã tìm ra nguyên nhân và ghi bút toán điều chỉnh.', why: 'Mỗi mục được xử lý tốn thời gian của một người, vì thế sai lệch giả rất đắt.' },
    },
    labels: { settle: { e3: 'khớp', e4: 'số tiền lệch', e5: 'thiếu một vế', e6: 'bị trình hai lần' } },
    synthetic: { syn_batch: { label: 'Bù trừ theo lô', sub: '23:00' }, syn_visa: { label: 'Quyết toán Visa', sub: 'tệp tổ chức thẻ' }, syn_suspense: { label: 'Tài khoản treo', sub: 'tới khi xử lý' }, syn_cleared: { label: 'Đã xử lý' } },
    syntheticEdges: { syn_s2c: 'ngày làm việc tiếp theo' },
    examples: {
      clean: { label: 'Ba bản ghi khớp nhau', story: 'Một giao dịch $125.00. Sổ cái, tổ chức thẻ và ngân hàng thanh toán đều ghi $125.00.' },
      dust: { label: 'Sai số làm tròn', story: 'Tổ chức thẻ quy đổi một khoản ngoại tệ và làm tròn thành $125.04. Chênh 4¢ không phải lỗi của ai.', suggestion: 'Đặt biên sai số về 0 và khoản chênh vô hại này thành sai lệch. Nhân lên hàng trăm bản ghi.' },
      variance: { label: 'Một lỗi số tiền thật', story: 'Tệp của tổ chức thẻ ghi $133.20. Ai đó đã nhập sai số tiền. Một lỗi thật $8.20.', suggestion: 'Nới biên sai số lên $10 và lỗi thật này bị khớp mất. Sẽ không ai xem lại nó.' },
      missing: { label: 'Thiếu một bản ghi', story: 'Báo cáo của ngân hàng thanh toán không hề nhắc tới giao dịch này.' },
      duplicate: { label: 'Bị trình hai lần', story: 'Tệp của tổ chức thẻ liệt kê giao dịch này hai lần.' },
    },
    takeaways: [
      'Không bao giờ bỏ qua sai lệch và không bao giờ ép nó khớp: treo nó vào tài khoản treo kèm lý do.',
      'Biên sai số là ranh giới giữa sai số làm tròn và lỗi thật. Quá chặt làm ngập tài khoản treo và quá tải ca đêm. Quá lỏng thì giấu lỗi.',
      'Tài khoản treo được xử lý bởi con người, trong giờ hành chính. Số dư của nó đo mức độ phù hợp của quy tắc ca đêm với dữ liệu.',
    ],
  },
  E: {
    title: 'Chuyển khoản tức thì tài khoản sang tài khoản (A2A & pacs.008)',
    subtitle: 'Cổng chuyển tiền nhanh (A2A) → Sổ cái ghi nợ CASA → Giải phóng',
    intro: [
      'Chuyển khoản tức thì đưa tiền từ tài khoản này thẳng sang tài khoản khác trong vài giây, không có thẻ ở giữa. Ứng dụng ngân hàng của khách gửi cho ngân hàng một thông điệp theo chuẩn ISO 20022, pacs.008 “chuyển khoản khách hàng”, và tiền rời tài khoản ngay khi ngân hàng đồng ý.',
      'Vì thế cửa vào phải chặt. Giao dịch thẻ có vấn đề còn có thể khiếu nại sau; chuyển khoản tức thì có vấn đề thì không thể gọi lại. Nên cổng A2A đọc từng trường của thông điệp trước khi động tới tiền, và chỉ thông điệp đúng định dạng mới tới được sổ cái.',
    ],
    steps: {
      n_start: { title: 'Lệnh chuyển tới Cổng A2A', what: 'Ứng dụng ngân hàng của khách gửi thông điệp pacs.008. Nó mang mã tham chiếu do người gửi chọn (EndToEndId), ngân hàng gửi và ngân hàng nhận (mỗi bên một mã BIC), số tiền và loại tiền.', why: 'Mọi việc ngân hàng làm với lệnh chuyển này đều đọc từ một thông điệp duy nhất, nên việc đầu tiên là nhận trọn vẹn nó.' },
      n_gateway: { title: 'Cổng A2A: thông điệp có đúng định dạng không?', what: 'Cổng kiểm tra từng trường. EndToEndId phải có và không dài quá 35 ký tự. Hai mã ngân hàng phải có 8 hoặc 11 ký tự. Số tiền hai ngân hàng sẽ quyết toán phải bằng số tiền khách yêu cầu gửi.', why: 'Thông điệp trượt bất kỳ phép kiểm tra nào thì không thể truy vết, định tuyến hay quyết toán. Từ chối ngay tại cửa không tốn gì; tìm ra lỗi sau khi tiền đã đi thì tốn rất nhiều.' },
      n_xor_valid: { title: 'Quyết định: thông điệp có hợp lệ không?', what: 'Một lựa chọn loại trừ (XOR). Thông điệp có lỗi bị từ chối ngay. Thông điệp sạch đi tiếp tới sổ cái.', why: 'Kiểm tra hợp lệ đi trước kiểm tra tiền, cùng lý do lòng tin đi trước tiền với thẻ: đừng bao giờ xem một tài khoản cho một yêu cầu bạn đã biết là xấu.' },
      n_ledger: { title: 'Sổ cái lõi: có tiền không?', what: 'Lệnh chuyển lấy tiền từ tài khoản thanh toán của khách, nên sổ cái ghi nợ kiểm tra số dư khả dụng. Nếu đủ, tiền được trích giữ ngay.', why: 'Chuyển khoản tức thì không có “khoanh giữ rồi quyết toán sau”: trích giữ tiền chính là ghi nợ.' },
      n_xor_funds: { title: 'Quyết định: sổ cái có đồng ý không?', what: 'SUFFICIENT giải phóng lệnh chuyển. Mọi trường hợp khác bị từ chối do thiếu tiền.', why: 'Từ chối do thiếu tiền không phải tín hiệu gian lận. Nó được đếm riêng với thông điệp bị từ chối, vì cách khắc phục mỗi loại khác nhau.' },
      n_end_approved: { title: 'Đã giải phóng', what: 'Tiền rời tài khoản và ngân hàng nhận được báo đồng ý. Ngân hàng hưởng một khoản phí nhỏ.', why: 'Tức thì nghĩa là cuối cùng. Vì thế chuyển khoản gian lận rất tốn kém: không có chu kỳ đêm nào bắt được nó trước khi tiền đi mất.' },
      n_end_invalid: { title: 'Từ chối: thông điệp không hợp lệ', what: 'Ứng dụng gửi được báo thông điệp bị từ chối, kèm tên trường bị lỗi. Không động tới tiền.', why: 'Lý do được ghi cụ thể có chủ đích. Chỉ “không hợp lệ” khiến lập trình viên phải mò; “thiếu EndToEndId” dẫn họ tới đúng một dòng code.' },
      n_end_declined: { title: 'Từ chối', what: 'Khách được báo không đủ tiền. Thông điệp vẫn ổn, nên ứng dụng không có lỗi gì.', why: 'Số dư của khách không phải lỗi của ngân hàng, và không quy tắc nào của ngân hàng thay đổi được điều đó.' },
    },
    labels: { a2a: { e3: 'thông điệp có lỗi', e4: 'đúng định dạng', e6: 'đủ tiền', e7: 'không đủ' } },
    examples: {
      split: { label: 'Chia hóa đơn qua QR', story: 'Mia quét mã QR ở bữa tối và gửi phần $18.50 của mình cho một người bạn ở ngân hàng khác. Tài khoản của cô có $640.00.' },
      rent: { label: 'Tiền thuê căn hộ', story: 'Ngày đầu tháng, Tom gửi $850.00 tiền thuê nhà tới ngân hàng của chủ nhà. Tài khoản của anh có $3,200.00.' },
      noref: { label: 'Thông điệp không có mã tham chiếu', story: 'Một lỗi trong ứng dụng đối tác gửi lệnh chuyển mà không có EndToEndId. Tài khoản của khách vẫn ổn.' },
      shortbic: { label: 'Mã ngân hàng bị cắt cụt', story: 'Mã ngân hàng nhận đến dưới dạng “HRBR”, bốn ký tự, trong khi BIC có tám hoặc mười một.' },
      mismatch: { label: 'Số tiền không khớp nhau', story: 'Khách yêu cầu gửi $42.00, nhưng thông điệp ghi hai ngân hàng sẽ quyết toán $37.00.' },
      broke: { label: 'Thông điệp hoàn hảo, không đủ tiền', story: 'Mọi thứ trong thông điệp đều đúng, nhưng tài khoản có $60.00 còn tiền thuê nhà là $850.00.' },
    },
    takeaways: [
      'Kiểm tra thông điệp trước khi kiểm tra tiền. pacs.008 có lỗi bị từ chối ngay tại cửa.',
      'Tức thì nghĩa là cuối cùng: cùng một lệnh chuyển tiện lợi cho khách lại không thể đảo ngược với nạn nhân gian lận.',
      'Lý do từ chối nêu tên trường bị lỗi, để người gửi sửa đúng chỗ.',
    ],
  },
  F: {
    title: 'Sàng lọc AML & Giải quyết khiếu nại tra soát',
    subtitle: 'Bàn gian lận & danh tính (sàng lọc AML, điều tra hồ sơ) → Bàn ca đêm (khiếu nại tra soát)',
    intro: [
      'Có hai điều có thể sai rất lâu sau khi giao dịch trông ổn. Thứ nhất là tiền dành cho ai: luật buộc ngân hàng sàng lọc khách hàng với danh sách cấm vận và danh sách người có ảnh hưởng chính trị, và phải nhận ra các lần nộp tiền mặt bị chia nhỏ ngay dưới ngưỡng báo cáo. Đó là sàng lọc phòng chống rửa tiền (AML). Trùng tên là manh mối, không phải phán quyết: sàng lọc là so khớp mờ, nên một khách lâu năm có thể trông giống một người lạ bị cấm vận có tên tương tự.',
      'Thứ hai là điều xảy ra khi chủ thẻ nói “không phải tôi” hay “hàng không bao giờ đến”. Tổ chức thẻ xử lý khiếu nại theo chu kỳ bốn giai đoạn: yêu cầu chứng từ, tra soát lần đầu, phản hồi của cửa hàng, và tiền trọng tài. Thời hạn khiếu nại giới hạn bao lâu một khiếu nại còn được đưa ra, và một quy tắc quyết định ai trả cho gian lận: nếu giao dịch đã được xác thực bằng 3-D Secure, trách nhiệm đã chuyển sang ngân hàng phát hành. Ở ngân hàng này, sàng lọc và kiểm tra 3DS do bàn gian lận & danh tính làm, còn bàn khiếu nại thuộc đội ca đêm.',
    ],
    steps: {
      n_start: { title: 'Một khoản thanh toán sắp rời ngân hàng', what: 'Một khách đang gửi $25,000.00 ra khỏi ngân hàng. Trước khi tiền đi, ngân hàng xem ai là người gửi. Giao dịch đến kèm hồ sơ khách, các danh sách theo dõi để so sánh, các lần nộp tiền mặt gần đây và nhật ký kiểm toán những gì ngân hàng đã xác minh về họ.', why: 'Giao dịch chỉ được giải phóng khi ngân hàng yên tâm về người đứng sau, và việc kiểm tra phải xảy ra trước khi tiền rời đi.' },
      n_aml: { title: 'Sàng lọc AML: có trùng tên, có chia nhỏ không?', what: 'Hệ thống sàng lọc so tên khách với mọi tên trên danh sách cấm vận (OFAC) và danh sách người có ảnh hưởng chính trị và giữ điểm cao nhất. Điểm bằng hoặc trên ngưỡng là trùng. Nó cũng xem các lần nộp tiền mặt gần đây để tìm những lần nằm ngay dưới ngưỡng báo cáo.', why: 'So tên được làm mờ có chủ đích: nó phải bắt được “Volkanoff” khi danh sách ghi “Volkanov”. Cái giá là nó cũng gắn cờ người vô tội có tên tương tự.' },
      n_xor_hit: { title: 'Quyết định: có trùng tên không?', what: 'Trùng tên thì chuyển sang điều tra. Không trùng tên nhưng có dấu hiệu chia nhỏ thì ngân hàng lập báo cáo. Không có cả hai thì giao dịch được giải phóng.', why: 'Chỉ manh mối thật mới được điều tra. Điều tra tốn thời gian chuyên viên và bắt khách chờ, nên khách trong sạch không bao giờ được đưa vào.' },
      n_case: { title: 'Điều tra hồ sơ: có thật là cùng một người?', what: 'Chuyên viên mở nhật ký kiểm toán của khách và so ngày sinh, quốc tịch mà ngân hàng đã xác minh (từ hộ chiếu hoặc bằng lái được quét) với người trong danh sách.', why: 'Kết luận dựa trên bằng chứng ngân hàng tự kiểm tra, không dựa vào cái tên. Không có xác minh danh tính nào thì câu trả lời trung thực là “chưa kết luận được”, không phải “có tội”.' },
      n_xor_verdict: { title: 'Quyết định: cuộc điều tra tìm thấy gì?', what: 'Cảnh báo sai được giải phóng. Trùng thật với danh sách cấm vận bị chặn. Trùng thật với danh sách PEP thì yêu cầu giải trình nguồn tiền. Mọi trường hợp khác được chuyển cấp.', why: 'Ba kết luận khác nhau cần ba phản ứng khác nhau. Coi tất cả là “chặn” thì mất khách tốt; coi tất cả là “giải phóng” thì vi phạm pháp luật.' },
      n_end_released: { title: 'Giao dịch được giải phóng', what: 'Không trùng tên và không chia nhỏ. Giao dịch đi tiếp tới sổ cái.', why: 'Phần lớn giao dịch kết thúc ở đây. Sàng lọc tốt nhất là loại mà khách trong sạch không bao giờ nhận ra.' },
      n_end_cleared: { title: 'Giải tỏa: cảnh báo sai', what: 'Cái tên chỉ suýt trùng, và nhật ký kiểm toán chứng minh đây là người khác. Giao dịch được giải phóng và dấu vết kiểm toán giữ lại lý do.', why: 'Đây là kết cục giữ được một khách VIP. Phong tỏa họ sẽ là sai lầm và thành tin tức.' },
      n_end_sar: { title: 'Báo cáo: chia nhỏ giao dịch', what: 'Các lần nộp đã bị chia nhỏ để nằm dưới ngưỡng báo cáo. Giao dịch bị treo và báo cáo giao dịch đáng ngờ được nộp.', why: 'Chia nhỏ giao dịch tự nó là tội, kể cả khi mỗi lần nộp đều nhỏ và tiền là sạch.' },
      n_end_sanctions: { title: 'Bị chặn: cấm vận', what: 'Cuộc điều tra xác định khách trùng với một người bị cấm vận. Giao dịch bị từ chối.', why: 'Giao dịch với người bị cấm vận là bất hợp pháp. Đây là kết cục không bao giờ được bỏ lỡ.' },
      n_end_edd: { title: 'Yêu cầu: nguồn tiền', what: 'Người có ảnh hưởng chính trị không bị cấm, chỉ rủi ro. Ngân hàng hỏi tiền từ đâu ra trước khi cho đi.', why: 'Thẩm định tăng cường là cách ngân hàng quản lý một khách rủi ro cao mà nó vẫn được phép phục vụ.' },
      n_end_escalate: { title: 'Chuyển cấp: thẩm định tăng cường', what: 'Nhật ký không có gì để chứng minh hay loại trừ việc trùng. Một chuyên viên cấp cao tiếp nhận và giao dịch phải chờ.', why: 'Khi hết bằng chứng, câu trả lời an toàn là xin thêm, không phải đoán.' },
      'dispute:n_start': { title: 'Một chủ thẻ khiếu nại một khoản trừ tiền', what: 'Chủ thẻ báo ngân hàng rằng một giao dịch không phải của họ, hoặc hàng không bao giờ đến, hoặc bị trừ hai lần. Khiếu nại đến kèm giai đoạn hiện tại trong chu kỳ, lý do, giao dịch cách đây bao nhiêu ngày, và phản hồi của cửa hàng mạnh đến đâu.', why: 'Mọi khiếu nại bắt đầu bằng dữ kiện, và hai trong số đó quyết định hầu hết kết cục: còn trong hạn không, và giao dịch có được xác thực không.' },
      n_3ds: { title: 'Bộ đánh giá rủi ro 3DS: giao dịch có được xác thực không?', what: 'Bàn khiếu nại không thấy giao dịch đã được duyệt thế nào. Bộ đánh giá 3DS đọc lại giao dịch gốc, và nếu nó xác thực liền mạch hoặc khách đã hoàn tất thử thách, nó đánh dấu là đã xác thực.', why: 'Chạy bước này trước. Nếu bộ đánh giá chưa chạy, bàn khiếu nại không thấy kết quả xác thực và coi mọi giao dịch là chưa xác thực.' },
      n_desk: { title: 'Bàn khiếu nại & tra soát: bước tiếp theo là gì?', what: 'Bàn nắm các giai đoạn và thời hạn khiếu nại. Nó xác định thời hạn còn mở không, ai chịu trách nhiệm nếu khiếu nại là gian lận, và bước tiếp theo trong chu kỳ là gì.', why: 'Ba dữ kiện này quyết định mọi thứ sau đó, và không cái nào đọc được từ riêng giao dịch.' },
      n_xor_gate: { title: 'Quyết định: khiếu nại có tiếp tục được không?', what: 'Hết thời hạn thì khiếu nại chấm dứt. Giao dịch gian lận đã xác thực cũng chấm dứt, ngân hàng tự chịu tổn thất. Mọi trường hợp khác đi tiếp tới giai đoạn.', why: 'Thời hạn được kiểm tra trước trách nhiệm: khiếu nại quá hạn thì hết hiệu lực dù ai lẽ ra phải trả.' },
      n_xor_stage: { title: 'Quyết định: đây là giai đoạn nào?', what: 'Khiếu nại mới thì yêu cầu cửa hàng xuất trình hóa đơn. Yêu cầu chứng từ không được trả lời trở thành tra soát lần đầu. Cửa hàng phản hồi thì chuyển sang giai đoạn representment. Mọi giai đoạn sau được quyết ở điểm quyết định tiếp theo.', why: 'Một điểm quyết định chỉ có bốn lối ra còn khiếu nại có tám kết cục, nên sơ đồ nối hai điểm quyết định để bao quát hết.' },
      n_xor_result: { title: 'Quyết định: ai thắng?', what: 'Tiền trọng tài chuyển cấp vụ việc mà ngân hàng không chấp nhận. Vụ việc đã giải quyết kết thúc bằng việc chủ thẻ được hoàn tiền hoặc cửa hàng thắng.', why: 'Điểm quyết định cuối cùng xác định ai chịu tổn thất, và đó là điều ngân hàng sẽ hạch toán.' },
      n_end_retrieval: { title: 'Yêu cầu cửa hàng xuất trình hóa đơn', what: 'Khiếu nại mới bắt đầu bằng yêu cầu chứng từ. Chưa ai mất tiền.', why: 'Phần lớn khiếu nại kết thúc ở đây, khi cửa hàng chứng minh đã giao hàng.' },
      n_end_filed: { title: 'Đã nộp tra soát lần đầu', what: 'Cửa hàng không gửi gì, nên ngân hàng thu hồi tiền và ghi có ngay cho chủ thẻ.', why: 'Chủ thẻ được bù đắp trước. Ai cuối cùng phải trả sẽ được quyết ở các giai đoạn sau.' },
      n_end_represent: { title: 'Đang xem xét phản hồi của cửa hàng', what: 'Cửa hàng đã phản hồi bằng bằng chứng, và ngân hàng phải quyết định nó có đủ thuyết phục không.', why: 'Một phản hồi yếu vẫn là phản hồi, và nó đẩy vụ việc tiến lên.' },
      n_end_prearb: { title: 'Chuyển lên tiền trọng tài', what: 'Ngân hàng không chấp nhận phản hồi của cửa hàng. Nó chuyển cấp trước khi chính tổ chức thẻ phải phân xử.', why: 'Trọng tài tốn kém cho mọi bên, nên tiền trọng tài là cơ hội cuối để thương lượng.' },
      n_end_refunded: { title: 'Chủ thẻ được hoàn tiền', what: 'Chủ thẻ giữ khoản ghi có. Tổn thất thuộc về cửa hàng.', why: 'Cửa hàng không phản hồi, hoặc phản hồi không đủ thuyết phục.' },
      n_end_absorbed: { title: 'Ngân hàng phát hành tự chịu tổn thất', what: 'Giao dịch đã được xác thực, nên cửa hàng đã làm đủ mọi điều tổ chức thẻ yêu cầu. Ngân hàng hoàn tiền cho chủ thẻ và tự chịu tổn thất.', why: 'Đây là chuyển trách nhiệm trên thực tế, và là lý do ngân hàng dè chừng việc duyệt xác thực liền mạch cho giao dịch rủi ro.' },
      n_end_merchant: { title: 'Cửa hàng thắng', what: 'Bằng chứng thuyết phục. Khoản ghi có tạm thời bị thu lại từ chủ thẻ.', why: 'Tra soát không tự động. Cửa hàng có bằng chứng giao hàng sẽ giữ được đơn hàng.' },
      n_end_barred: { title: 'Hết thời hiệu', what: 'Khiếu nại được đưa ra sau khi thời hạn đã đóng. Nó bị từ chối, dù ai lẽ ra phải trả.', why: 'Thời hạn bảo vệ cửa hàng khỏi những khiếu nại không bao giờ kiểm chứng được. Nó áp dụng cho việc đưa ra khiếu nại, không cho vụ việc đã được nộp đúng hạn.' },
    },
    labels: {
      aml: { e3: 'trùng tên', e4: 'chia nhỏ', e5: 'trong sạch', e7: 'cảnh báo sai', e8: 'trùng cấm vận', e9: 'trùng PEP', e10: 'chưa kết luận' },
      dispute: { e4: 'đã hết thời hạn', e5: 'đã xác thực: ngân hàng phát hành trả', e7: 'khiếu nại mới', e8: 'cửa hàng im lặng', e9: 'cửa hàng phản hồi', e11: 'ngân hàng bác phản hồi', e12: 'chủ thẻ thắng', e13: 'cửa hàng thắng' },
    },
    examples: {
      clear: { label: 'AML: một khách bình thường', story: 'Linh Trần gửi $25,000.00. Không cái tên nào trong danh sách giống tên cô, và các lần nộp tiền mặt của cô đều bình thường.' },
      structuring: { label: 'AML: tiền nộp ngay dưới ngưỡng', story: 'Bốn lần nộp tiền mặt từ $9,000.00 tới $9,800.00 trong ba ngày, mỗi lần ngay dưới ngưỡng báo cáo $10,000.00. Không trùng tên nào trong danh sách.' },
      vip: { label: 'AML: khách VIP chỉ có tên nghe giống người bị cấm vận', story: 'Dmitri Volkanoff, khách hàng Úc lâu năm sinh năm 1974, có điểm rất sát với Dmitri Volkanov bị cấm vận, sinh tại Nga năm 1962. Hộ chiếu của ông đã được kiểm tra tại chi nhánh.' },
      sanctions: { label: 'AML: trùng cấm vận thật', story: 'Cùng tên, cùng ngày sinh, cùng quốc tịch, được xác minh từ hộ chiếu.' },
      inconclusive: { label: 'AML: cùng tên, nhưng không có gì để so', story: 'Một khách mang tên người bị cấm vận nhưng hồ sơ không có xác minh danh tính, nên không có gì để chứng minh hay loại trừ việc trùng.' },
      pep: { label: 'AML: một người có ảnh hưởng chính trị', story: 'Helena Marques Duarte, có trong danh sách PEP, cùng ngày sinh và quốc tịch, được kiểm tra từ hộ chiếu.' },
      new: { label: 'Khiếu nại: một khiếu nại mới', story: 'Chủ thẻ nói đơn hàng $189.00 không bao giờ đến. Chưa ai xử lý khiếu nại, 25 ngày sau khi mua.' },
      silent: { label: 'Khiếu nại: cửa hàng không gửi gì', story: 'Ngân hàng đã yêu cầu hóa đơn. Cửa hàng không gửi lại gì.' },
      proof: { label: 'Khiếu nại: cửa hàng chứng minh đã giao hàng', story: 'Cửa hàng trả lời yêu cầu chứng từ bằng biên nhận giao hàng có chữ ký.' },
      fight: { label: 'Khiếu nại: cửa hàng phản hồi', story: 'Sau tra soát lần đầu, cửa hàng gửi một phản hồi yếu. Nhưng vẫn là phản hồi.' },
      shift: { label: 'Khiếu nại: gian lận trên giao dịch đã xác thực', story: 'Chủ thẻ nói một giao dịch xác thực liền mạch là gian lận. Giao dịch đã được xác thực bằng 3-D Secure.' },
      late: { label: 'Khiếu nại: quá muộn', story: 'Chủ thẻ đưa ra khiếu nại 150 ngày sau khi mua, rất lâu sau khi thời hạn đã đóng.' },
    },
    takeaways: [
      'Kết quả sàng lọc là manh mối, không phải phán quyết. Chỉ điều tra manh mối thật, bằng bằng chứng ngân hàng tự xác minh.',
      'Cấm vận, người có ảnh hưởng chính trị, chia nhỏ giao dịch và trường hợp chưa kết luận, mỗi loại cần một phản ứng khác nhau.',
      'Khiếu nại là một chu kỳ có đồng hồ: kiểm tra thời hạn trước, rồi ai chịu trách nhiệm, rồi đến giai đoạn.',
      'Xác thực giao dịch bằng 3-D Secure chuyển trách nhiệm gian lận sang ngân hàng phát hành.',
    ],
  },
};

const cache = new Map<string, Lesson>();

function relabel(layout: LessonLayout, graph: GraphKey, w: LessonWords): LessonLayout {
  const labels = w.labels[graph];
  return {
    ...layout,
    labels: labels ? { ...layout.labels, ...labels } : layout.labels,
    synthetic: layout.synthetic.map((s) => {
      const x = w.synthetic?.[s.id];
      if (!x) return s;
      const next = { ...s, label: x.label };
      if (x.sub !== undefined) next.sub = x.sub;
      return next;
    }),
    syntheticEdges: layout.syntheticEdges.map((e) => (w.syntheticEdges?.[e.id] ? { ...e, label: w.syntheticEdges[e.id]! } : e)),
  };
}

/** A lesson with every word in `locale` (the active language by default). Ids, layouts, payloads and dials are unchanged. */
export function localLesson(lesson: Lesson, locale: Locale = activeLocale()): Lesson {
  if (locale !== 'vi') return lesson;
  const hit = cache.get(lesson.id);
  if (hit) return hit;
  const w = VI[lesson.id];
  const layouts: Lesson['layouts'] = lesson.layouts ? (Object.fromEntries(Object.entries(lesson.layouts).map(([g, lay]) => [g, relabel(lay as LessonLayout, g as GraphKey, w)])) as Lesson['layouts']) : undefined;
  const out: Lesson = {
    ...lesson,
    title: w.title,
    subtitle: w.subtitle,
    intro: w.intro,
    steps: { ...lesson.steps, ...w.steps },
    layout: relabel(lesson.layout, lesson.graph, w),
    ...(layouts ? { layouts } : {}),
    examples: lesson.examples.map((e) => {
      const x = w.examples[e.id];
      if (!x) return e;
      return { ...e, label: x.label, story: x.story, ...(e.suggestion && x.suggestion ? { suggestion: { ...e.suggestion, text: x.suggestion } } : {}) };
    }),
    takeaways: w.takeaways,
  };
  cache.set(lesson.id, out);
  return out;
}

/** The lesson of a process, in the active language. */
export const lessonOf = (p: ProcessId): Lesson => localLesson(LESSONS[p]);

/** A lesson's title and subtitle in the active language. */
export const lessonText = (p: ProcessId): { title: string; subtitle: string } => {
  const l = lessonOf(p);
  return { title: l.title, subtitle: l.subtitle };
};

/** The short name of a process, for buttons, in the active language. */
export const processShort = (p: ProcessId): string => (activeLocale() === 'vi' ? SHORT_VI[p] : PROCESS_SHORT[p]);
