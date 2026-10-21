/**
 * Vietnamese for the ten Build Lab levels: the title, the brief, the goals, the hints, every test's name and description,
 * and the labels of the locked boxes the starter canvases come with.
 *
 * The levels themselves stay English (the grader, the saved canvases and the tests key on them). `localChallenge` returns a
 * copy with the Vietnamese laid over the English, and `canvasLabel` translates a box's label as the canvas draws it.
 * Reason codes, outcome names, field names and conditions are code and stay as they are in both languages.
 */

import type { ChallengeLevel, Id } from '../types/processLearning';
import { activeLocale, type Locale } from './locale';

interface LevelText {
  title: string;
  problemDescription: string;
  learningObjectives: readonly string[];
  hints: readonly string[];
  tests: Readonly<Record<Id, { name: string; description?: string }>>;
}

const FX_LOSS = 'Tổ chức thẻ quyết toán nhiều hơn số ngân hàng đã ghi sổ, và chênh lệch tỷ giá giải thích được điều đó.';
const FX_GAIN = 'Tổ chức thẻ quyết toán ít hơn số ngân hàng đã ghi sổ, và chênh lệch tỷ giá giải thích được điều đó.';

const LEVEL_VI: Readonly<Record<Id, LevelText>> = {
  lvl_01_virtual_card_dcvv: {
    title: 'Tiếp nhận thẻ ảo & CVV động',
    problemDescription:
      'Ngân hàng của bạn đang ra mắt **thẻ ảo**. Khi thanh toán, ứng dụng của khách hiển thị một **CVV động (dCVV)** luôn thay đổi và chỉ có hiệu lực trong **60 giây** sau khi được tạo.\n\nHãy thiết kế luồng cấp phép cho một giao dịch thẻ ảo.\n\n**Quy tắc**\n1. Tra DPAN được xuất trình trong **kho token**. Một DPAN không có ánh xạ là một ngoại lệ kỹ thuật. Nó phải được xử lý, không được để treo.\n2. **Xác minh dCVV.** Nó phải khớp với giá trị kho mong đợi và phải nằm trong cửa sổ hiệu lực.\n3. Một yêu cầu không qua kiểm tra dCVV bị **từ chối trước khi kiểm tra tiền**. Đừng bao giờ kiểm tra sổ cái cho một yêu cầu bạn đã biết là xấu.\n4. Yêu cầu hợp lệ đi tới **sổ cái lõi**. Chấp thuận khi đủ tiền, nếu không thì từ chối.\n\nCác sự kiện kết thúc Chấp thuận và Từ chối đã có sẵn trên canvas.',
    learningObjectives: [
      'Đặt một nút TASK cho mỗi năng lực ngân hàng và nối chúng theo thứ tự hợp lý',
      'Định tuyến theo một dữ kiện suy ra (dcvvStatus) bằng cổng XOR và một nhánh mặc định',
      'Xử lý ngoại lệ kỹ thuật qua cổng lỗi của một tác vụ',
      'Thất bại sớm: dừng trước một bước kiểm tra tốn kém phía sau khi một bước rẻ đã thất bại',
    ],
    hints: [
      'Cổng XOR cần một cạnh mặc định. Điều gì nên xảy ra với mọi thứ không rõ ràng là OK?',
      'dcvvStatus chỉ được đặt sau khi Bộ xác minh dCVV đã chạy.',
      'Kho token có hai cổng ra. Chỉ một trong số đó là đường bình thường.',
    ],
    tests: {
      'L1-T1': { name: 'DPAN hợp lệ, dCVV dùng ở giây 58', description: 'DPAN đã ánh xạ, dCVV đúng, vẫn trong cửa sổ 60 giây, đủ tiền.' },
      'L1-T2': { name: 'dCVV hết hạn (61 giây)', description: 'dCVV đúng nhưng quá cửa sổ một giây. Từ chối trước khi chạm vào sổ cái.' },
      'L1-T3': { name: 'Sai CVV trên token mới', description: 'Token mới 12 giây nhưng khách nhập 137, không phải 482.' },
      'L1-T4': { name: 'DPAN không xác định (không có ánh xạ trong kho)', description: 'Kho không có bản ghi DPAN này. Lần tra cứu phát sinh ngoại lệ mà sơ đồ của bạn phải bắt.' },
      'L1-T5': { name: 'dCVV hợp lệ, không đủ tiền', description: 'Token và dCVV ổn, nhưng tài khoản nguồn không đủ cho lần mua.' },
    },
  },
  lvl_02_three_ds_routing: {
    title: 'Định tuyến theo rủi ro 3DS 2.x',
    problemDescription:
      'Giao dịch không xuất trình thẻ đi qua **3-D Secure 2.x**. Thay vì thử thách mọi người, ngân hàng phát hành định tuyến theo rủi ro để khách tốt không bị chậm.\n\n**Chính sách của ngân hàng phát hành**\n\n| Điểm rủi ro | Nhánh | Kết quả |\n|---|---|---|\n| dưới 40 | Không ma sát | Đi tiếp tới kiểm tra tiền |\n| 40 đến 79, chưa thử thách | Thử thách | Trả lời **CHALLENGE_REQUIRED** để khách được chuyển tới màn hình OTP |\n| 40 đến 79, đã hoàn tất thử thách | Đã xác thực | Đi tiếp tới kiểm tra tiền |\n| 40 đến 79, thử thách bị bỏ dở, quá hạn hoặc thất bại | Rơi rụng | **Từ chối** |\n| 80 trở lên | Từ chối | **Từ chối**, kể cả khi đã hoàn tất thử thách |\n\n**Ngoài ra**\n- Yêu cầu bị từ chối hoặc rơi rụng không được chạm vào sổ cái lõi.\n- Yêu cầu đã xác thực chỉ được chấp thuận nếu kiểm tra sổ cái cho thấy đủ tiền.\n- Ngân hàng không thấy được giao dịch có thật sự gian lận không. Bạn bắt gian lận qua điểm rủi ro, nên điều kiện không được đọc `isFraud`.\n\nTrong thực tế, mỗi yêu cầu được đánh giá hai lần: một lần trước thử thách và một lần sau. Ở đây, mỗi bài kiểm tra là một trong hai lần đó.',
    learningObjectives: [
      'Định tuyến một giao dịch tới ba kết quả khác nhau bằng một cổng XOR',
      'Dùng độ ưu tiên và một cạnh mặc định để mọi trường hợp đều có nơi đến',
      'Hiểu vì sao thiết kế song song (AND) lãng phí công khi phần lớn yêu cầu bị từ chối sớm',
      'Hiểu chuyển dịch trách nhiệm là hệ quả của việc xác thực',
    ],
    hints: [
      'Bộ đánh giá rủi ro 3DS ghi cả threeDsPath và một cờ authenticated đơn giản. Cái nào dễ đưa vào điều kiện hơn?',
      'Ba kết quả cần ba sự kiện kết thúc, mỗi cái được cấu hình một kết quả khác nhau.',
      'Xem các bài kiểm tra được đánh dấu không được chạm vào sổ cái trước khi bạn nghĩ tới cổng AND.',
    ],
    tests: {
      'L2-T01': { name: 'Không ma sát: rủi ro thấp' },
      'L2-T02': { name: 'Không ma sát: đỉnh của dải (rủi ro 39)' },
      'L2-T03': { name: 'Thử thách: đáy của dải (rủi ro 40)' },
      'L2-T04': { name: 'Thử thách: rủi ro trung bình, lượt đầu' },
      'L2-T05': { name: 'Đã hoàn tất thử thách: nhập OTP đúng', description: 'Chủ thẻ quay lại sau thử thách với OTP thành công.' },
      'L2-T06': { name: 'Rơi rụng thử thách: chủ thẻ bỏ dở', description: 'Màn hình OTP bị đóng mà không nhập mã.' },
      'L2-T07': { name: 'Rơi rụng thử thách: OTP hết hạn', description: 'Mã được gửi tới điện thoại của chủ thẻ thật, nên không ai nhập. Đây là dáng vẻ của kẻ gian chỉ có số thẻ: chấp thuận nó là để lọt gian lận.' },
      'L2-T08': { name: 'Bắt gian lận: rủi ro rất cao', description: 'Thẻ bị đánh cắp, 6 lần thử thất bại từ cùng một thiết bị trong 10 phút. Không làm việc với sổ cái cho yêu cầu bị từ chối.' },
      'L2-T09': { name: 'Bắt gian lận: OTP đã hoàn tất không thể vượt qua lệnh từ chối', description: 'Gian lận đổi SIM. OTP đã hoàn tất, nhưng điểm rủi ro vượt ngưỡng từ chối.' },
      'L2-T10': { name: 'Không ma sát nhưng không đủ tiền', description: 'Xác thực ổn. Chỉ là tài khoản không đủ chi trả.' },
    },
  },
  lvl_03_eod_recon_suspense: {
    title: 'Đối soát 3 bên cuối ngày & Tài khoản treo',
    problemDescription:
      'Cuối ngày, ngân hàng phải chứng minh mọi giao dịch thẻ khớp nhau trên **ba bản ghi độc lập**:\n\n1. bút toán **sổ cái lõi**\n2. **tệp bù trừ của tổ chức thẻ**\n3. **báo cáo quyết toán của ngân hàng thanh toán / bộ chuyển mạch**\n\nCác mục khớp được **quyết toán** (kết quả APPROVED). Các mục không khớp là **sai lệch**. Một sai lệch không bao giờ được quyết toán âm thầm hay bị bỏ qua. Nó được đưa vào **tài khoản treo** kèm mã lý do để đúng hàng chờ vận hành truy theo.\n\n**Quy tắc**\n- Sai số làm tròn và tỷ giá luôn có. Coi các vế là khớp nếu chênh lệch lớn nhất giữa chúng **từ 5 cent trở xuống**. Biên sai số của Quầy đối soát mặc định là 0, nên bạn phải đặt nó.\n- Định tuyến sai lệch tới **ROUTED_TO_SUSPENSE** với đúng mã lý do:\n\n| Sai lệch | Mã lý do |\n|---|---|\n| Đủ các vế nhưng số tiền chênh vượt biên sai số | `SUSP_AMOUNT_VARIANCE` |\n| Thiếu một trong ba vế | `SUSP_MISSING_LEG` |\n| Tệp bù trừ trình mục này nhiều hơn một lần | `SUSP_DUPLICATE` |\n\nBắt đầu từ canvas trống. Bạn quyết định cần bao nhiêu sự kiện kết thúc.',
    learningObjectives: [
      'Cấu hình một nút (biên sai số) thay vì chỉ nối dây cho nó',
      'Phân biệt quyết toán với xử lý ngoại lệ và định tuyến mỗi loại sai lệch tới hàng chờ treo riêng',
      'Bao phủ mọi giá trị của một trạng thái bằng các nhánh rõ ràng, để không mục nào lọt qua',
      'Giải thích vì sao sai lệch được treo thay vì chấp thuận hay từ chối',
    ],
    hints: [
      'reconStatus có đúng bốn giá trị. Bạn có thể cho mỗi giá trị một nhánh không?',
      'Hai kết quả khác nhau đều là "một sự kiện kết thúc". Điều làm chúng khác nhau là cấu hình.',
      'Nếu một bài kiểm tra sai lệch thất bại dù đúng kết quả, hãy kiểm tra mã lý do trên sự kiện kết thúc.',
    ],
    tests: {
      'L3-T1': { name: 'Khớp chính xác 3 bên' },
      'L3-T2': { name: 'Khớp chính xác với số tiền lớn', description: 'Chỉ riêng quy mô không phải lý do để treo một mục.' },
      'L3-T3': { name: 'Chênh làm tròn 2c, trong biên sai số', description: 'Báo cáo chuyển mạch thấp hơn hai vế còn lại 2 cent.' },
      'L3-T4': { name: 'Chênh 5c, đúng bằng biên sai số' },
      'L3-T5': { name: 'Chênh 10c, ngoài biên sai số' },
      'L3-T6': { name: 'Đảo chữ số ($250.00 so với $205.00)' },
      'L3-T7': { name: 'Đã cấp phép, chưa từng bù trừ', description: 'Sổ cái và chuyển mạch có nó, nhưng tệp bù trừ của tổ chức thẻ thì không.' },
      'L3-T8': { name: 'Đã bù trừ nhưng chưa từng ghi sổ cái' },
      'L3-T9': { name: 'Trình trùng lặp', description: 'Tệp bù trừ trình cùng một giao dịch hai lần.' },
    },
  },
  lvl_04_bnpl_pay_in_4: {
    title: 'Thẩm định BNPL trả góp 4 kỳ & Định tuyến dự phòng',
    problemDescription:
      'Một cửa hàng thương mại điện tử đang thêm **Mua trước trả sau (trả góp 4 kỳ)** khi thanh toán. Khách trả **25% hôm nay** và phần còn lại trong **ba kỳ tiếp theo**. Ngân hàng thẩm định kế hoạch theo thời gian thực và không bao giờ được mất một đơn hàng mà nó vẫn có thể nhận bằng thẻ thông thường.\n\n**Quy tắc**\n1. Mọi giao dịch đi tới **Bộ thẩm định BNPL** trước. Nó đọc `underwritingScore` của khách và khoản trả trước được đề nghị, rồi ghi `bnplDecision`: `ELIGIBLE` hoặc `INELIGIBLE`. Chương trình cần **điểm từ 600 trở lên** và **khoản trả trước 25%**. Mặc định của nút đã khớp điều đó.\n2. **ELIGIBLE: thu khoản trả trước.** Chỉ trừ kỳ đầu tiên (25%) từ thẻ liên kết bằng một **Kiểm tra sổ cái lõi**. Đủ tiền: chấp thuận với lý do `BNPL_PAY_IN_4`. Không đủ: từ chối với lý do `DOWN_PAYMENT_DECLINED`. **Không** chuyển sang thẻ ở đây. Một thẻ không trả nổi 25% thì cũng không trả nổi 100%.\n3. **INELIGIBLE: đừng bỏ giỏ hàng.** Chuyển sang **cấp phép thẻ tiêu chuẩn** cho **toàn bộ số tiền** (ghi nợ hoặc tín dụng). Đủ tiền: chấp thuận với lý do `CARD_FALLBACK`. Không đủ: từ chối với lý do `CARD_DECLINED`.\n\n| Sự kiện kết thúc | Kết quả | Mã lý do |\n|---|---|---|\n| Trả góp 4 kỳ được duyệt | APPROVED | `BNPL_PAY_IN_4` |\n| Dự phòng bằng thẻ được duyệt | APPROVED | `CARD_FALLBACK` |\n| Trả trước thất bại | DECLINED | `DOWN_PAYMENT_DECLINED` |\n| Dự phòng bằng thẻ thất bại | DECLINED | `CARD_DECLINED` |\n\nHai trong số này kết thúc ở APPROVED và hai ở DECLINED, nên **mã lý do** là thứ phân biệt các nhánh.\n\n**Bộ thẩm định BNPL tính ra kế hoạch nhưng không trừ tiền.** Kiểm tra sổ cái lõi có một thiết lập, **Số tiền cần kiểm tra**: toàn bộ giá mua, hoặc chỉ kỳ đầu tiên. Bắt đầu từ canvas trống.',
    learningObjectives: [
      'Định tuyến theo quyết định thẩm định và giữ một nhánh dự phòng cho khách không đủ điều kiện',
      'Cấu hình cùng một năng lực theo hai cách cho hai việc khác nhau (trả trước và cấp phép toàn bộ)',
      'Phân biệt các kết quả bằng mã lý do khi nhiều nhánh có chung loại kết quả',
      'Gộp hai nhánh vào một quyết định bằng cách đọc hai dữ kiện cùng lúc',
    ],
    hints: [
      'bnplDecision do Bộ thẩm định BNPL đặt. Đặt quyết định đọc nó ngay sau bộ thẩm định.',
      'Chọn một Kiểm tra sổ cái lõi sẽ hiện thiết lập "Số tiền cần kiểm tra". Khoản trả trước không phải là toàn bộ giá.',
      'Một bài kiểm tra đúng kết quả nhưng sai mã lý do nghĩa là đúng nhánh nhưng kết thúc ở sai sự kiện kết thúc.',
      'Cả hai kiểm tra sổ cái có thể đổ vào một cổng XOR (nó có hai cổng vào) nếu điều kiện đọc cả ledgerDecision và bnplDecision.',
    ],
    tests: {
      'L4-T1': { name: 'Điểm cao, thẻ ghi nợ dư tiền', description: 'Điểm 742 cho giỏ hàng $240.00. Khoản trả trước $60.00 dễ dàng được đáp ứng.' },
      'L4-T2': { name: 'Điểm đúng 600, thẻ tín dụng', description: 'Điểm tối thiểu đủ điều kiện. Thẻ tín dụng được kiểm tra theo mức thấp hơn giữa tín dụng khả dụng và hạn mức.' },
      'L4-T3': { name: 'Đủ khoản trả trước, không đủ giá đầy đủ', description: 'Giỏ hàng $900.00 trên thẻ ghi nợ có $300.00. Trả góp 4 kỳ tồn tại cho đúng khách này: chỉ kỳ đầu $225.00 bị trừ hôm nay.' },
      'L4-T4': { name: 'Trừ trả trước thất bại: thẻ ghi nợ thiếu tiền', description: 'Được duyệt kế hoạch, nhưng thẻ có $80.00 và kỳ hôm nay là $100.00. Không trả nổi 25% thì không trả nổi 100%, nên đây là từ chối, không phải dự phòng.' },
      'L4-T5': { name: 'Trừ trả trước thất bại: vượt hạn mức tín dụng', description: 'Điểm 655 đủ điều kiện, nhưng chỉ còn $120.00 tín dụng và khoản trả trước là $150.00.' },
      'L4-T6': { name: 'Điểm 599 chuyển sang thẻ tín dụng', description: 'Thiếu một điểm so với mức tối thiểu. Giỏ hàng không bị bỏ: toàn bộ $350.00 được cấp phép trên thẻ tín dụng.' },
      'L4-T7': { name: 'Điểm thấp chuyển sang thẻ ghi nợ', description: 'Điểm 410. Cấp phép thẻ tiêu chuẩn cho toàn bộ $129.00.' },
      'L4-T8': { name: 'Từ chối cứng: điểm thấp và thẻ không đủ chi trả', description: 'Điểm 520, nên không có kế hoạch. Cấp phép dự phòng $850.00 vượt $400.00 tín dụng còn lại.' },
    },
  },
  lvl_05_first_swipes: {
    title: 'Những lần quẹt thẻ đầu tiên',
    problemDescription:
      'Một khách chạm thẻ ở quầy thu ngân. Trong vòng một giây ngân hàng phải trả lời một câu hỏi: **tiền có ở đó không?** Nếu có, giao dịch được chấp thuận và ngân hàng **khoanh giữ** số tiền. Nếu không, máy phải hiện một thông báo **từ chối** rõ ràng, và không được khoanh giữ gì.\n\n**Quy tắc**\n1. Hỏi **Kiểm tra sổ cái lõi**. Nó so số tiền với số khách có thể chi và ghi `ledgerDecision`.\n2. `SUFFICIENT` nghĩa là **chấp thuận**.\n3. Mọi thứ khác nghĩa là **từ chối**. Thêm một sự kiện kết thúc, đặt kết quả là **Từ chối**, và nhập `INSUFFICIENT_FUNDS` vào thiết lập **Mã lý do** của nó.\n\nMột lần từ chối có mã lý do là **từ chối có lịch sự**: khách được biết lý do và có thể thử thẻ khác. Từ chối không mã, hoặc giao dịch bị treo, là trải nghiệm tệ.\n\nSự kiện bắt đầu và sự kiện kết thúc Chấp thuận đã có sẵn trên canvas.',
    learningObjectives: [
      'Theo một giao dịch từ quầy thu ngân tới quyết định: bắt đầu, kiểm tra, quyết định, kết thúc',
      'Dùng cổng XOR với cạnh mặc định, để mọi giao dịch đều có nơi đến',
      'Đọc dữ kiện mà kiểm tra sổ cái đã ghi (ledgerDecision) trong điều kiện của cạnh',
      'Đặt mã lý do trên sự kiện kết thúc để lần từ chối tự giải thích',
    ],
    hints: [
      'Kéo một Kiểm tra sổ cái lõi, một Quyết định (XOR) và một sự kiện kết thúc lên canvas, rồi nối sự kiện bắt đầu với bước kiểm tra, và bước kiểm tra với quyết định.',
      'ledgerDecision chỉ được đặt sau khi Kiểm tra sổ cái lõi đã chạy. Đặt quyết định ngay sau nó.',
      "Nhấp vào cạnh đi từ quyết định tới Chấp thuận và nhập điều kiện: ledgerDecision == 'SUFFICIENT'. Đánh dấu cạnh còn lại là mặc định.",
      'Một bài kiểm tra đúng kết quả nhưng sai mã lý do nghĩa là sự kiện kết thúc Từ chối chưa có mã lý do.',
    ],
    tests: {
      'L5-T1': { name: 'Một ly cà phê trên tài khoản dư dả', description: 'Một ly flat white $4.50, tài khoản có $120.00.' },
      'L5-T2': { name: 'Quẹt $500.00 khi tài khoản có $200.00', description: 'Khách quẹt nhiều hơn số mình có. Máy phải hiện "Từ chối: không đủ số dư" và không được khoanh giữ gì. Đây là từ chối có lịch sự: lý do rõ ràng, không lỗi, không giao dịch dở dang.' },
      'L5-T3': { name: 'Chi đúng bằng số dư', description: '$200.00 trên số dư $200.00. Đủ là đủ.' },
      'L5-T4': { name: 'Thừa một cent' },
      'L5-T5': { name: 'Thẻ tín dụng, còn nhiều tín dụng', description: 'Lần mua $1,200.00 với $3,000.00 tín dụng khả dụng.' },
      'L5-T6': { name: 'Thẻ tín dụng, không đủ tín dụng', description: 'Lần mua $1,500.00 với $1,200.00 tín dụng khả dụng.' },
      'L5-T7': { name: 'Thẻ trả trước có số dư nhỏ' },
      'L5-T8': { name: 'Một tài khoản trống' },
    },
  },
  lvl_06_card_testing: {
    title: 'Dò thẻ lúc nửa đêm',
    problemDescription:
      'Mỗi đêm khoảng nửa đêm, bot chạy qua danh sách số thẻ bị đánh cắp bằng **các giao dịch rất nhỏ** ($1, $0.50) để tìm thẻ nào còn sống. Đây là **dò thẻ**. Ngân hàng muốn chặn nó **mà không bắt khách thật phải vượt rào**. Mỗi thử thách OTP không cần thiết là một khách có thể bỏ giỏ hàng.\n\n**Chính sách**\n\n| Tình huống | Kết quả |\n|---|---|\n| **Dò thẻ**: 5 lần thử trở lên trên thẻ trong 10 phút (`recentAttempts >= 5`) **và** số tiền từ $5.00 trở xuống | **Từ chối** với lý do `CARD_TESTING`. Làm việc này **trước khi** tốn một lần gọi 3DS hay kiểm tra sổ cái. |\n| Đã xác thực bằng 3DS (không ma sát, hoặc đã hoàn tất thử thách) | Kiểm tra tiền |\n| Trong dải thử thách, và **dưới $30.00** | **Miễn trừ giá trị thấp**: không thử thách, đi tới kiểm tra tiền |\n| Trong dải thử thách, **từ $30.00 trở lên** | **CHALLENGE_REQUIRED** |\n| Mọi thứ khác (bị từ chối, hoặc thử thách thất bại) | **Từ chối** |\n\nSau kiểm tra tiền: chấp thuận nếu `SUFFICIENT`, nếu không thì từ chối.\n\n**Vì sao quy tắc dồn dập đi trước.** Giao dịch dò thẻ có giá trị nhỏ, đúng thứ mà miễn trừ giá trị thấp cho qua không cần thử thách. Không có quy tắc dồn dập, miễn trừ trở thành bạn thân của kẻ gian. Và một bot có điểm rủi ro thấp 18 thì điểm rủi ro hoàn toàn không bắt được.\n\nSự kiện bắt đầu đã có trên canvas. Bạn dựng phần còn lại, kể cả các sự kiện kết thúc.',
    learningObjectives: [
      'Kết hợp hai điều kiện bằng && để mô tả một mẫu hình (nhiều lần thử và số tiền nhỏ)',
      'Đặt bước kiểm tra rẻ trước bước tốn kém, và chặn lưu lượng xấu từ sớm',
      'Áp dụng miễn trừ giá trị thấp để giảm ma sát cho khách mà không mở lỗ hổng',
      'Cân nhắc gian lận bị bắt với khách bị mất, và thấy vì sao chỉ điểm rủi ro là không đủ',
    ],
    hints: [
      'recentAttempts là trường của payload, có sẵn từ đầu. Quyết định dựa trên nó không cần nút nào phía trước, nên nó có thể là việc đầu tiên sơ đồ làm.',
      'Kết hợp hai phép thử trong một điều kiện: recentAttempts >= 5 && amount <= 500. Số tiền tính bằng cent.',
      'Bộ đánh giá rủi ro 3DS ghi threeDsPath. CHALLENGE nghĩa là "trong dải và chưa bị thử thách". Hai cạnh của bạn có thể dẫn tới cùng một Kiểm tra sổ cái lõi.',
      'Thứ tự quan trọng. Ở cổng XOR, điều kiện đúng đầu tiên thắng, nên hãy đặt quy tắc cụ thể nhất lên trước.',
    ],
    tests: {
      'L6-T01': { name: 'Khách thật: gia hạn $12.00 lúc 00:12, rủi ro 52', description: 'Một gói thuê bao gia hạn qua đêm. Điểm rủi ro trong dải thử thách, nhưng $12.00 dưới mức miễn trừ giá trị thấp, nên khách không nên bị thử thách.' },
      'L6-T02': { name: 'Khách thật: mua $85.00, rủi ro 55', description: 'Vượt mức miễn trừ, nên khách này được chuyển tới màn hình OTP.' },
      'L6-T03': { name: 'Biên: $29.99 được miễn trừ' },
      'L6-T04': { name: 'Biên: $30.00 không được miễn trừ' },
      'L6-T05': { name: 'Dò thẻ: $1.00 mười bốn lần trong mười phút', description: 'Một bot đang kiểm tra số thẻ bị đánh cắp nào còn sống. Chặn nó trước khi tốn một lần gọi 3DS, và không gửi OTP cho chủ thẻ thật lúc nửa đêm.' },
      'L6-T06': { name: 'Dò thẻ trông sạch: $0.50, lần thử thứ sáu, rủi ro 18', description: 'Riêng điểm rủi ro bỏ sót trường hợp này. Mẫu hình thì không.' },
      'L6-T07': { name: 'Thử lại không phải dồn dập: $40.00, lần thử thứ ba, rủi ro 22', description: 'Một khách có hai lần thanh toán đầu thất bại vì gõ sai.' },
      'L6-T08': { name: 'Nhiều lần thử nhưng giá trị lớn: $400.00, tám lần thử, rủi ro 30', description: 'Dò thẻ là tiền nhỏ. Giao dịch lớn có nhiều lần thử được xử lý như mọi giao dịch khác.' },
      'L6-T09': { name: 'Ngưỡng từ chối vẫn giữ: $10.00 ở rủi ro 85', description: 'Miễn trừ chỉ áp dụng trong dải thử thách. Từ rủi ro 80 trở lên yêu cầu bị từ chối dù số tiền bao nhiêu.' },
      'L6-T10': { name: 'Được miễn trừ nhưng hết tiền: $20.00 khi có $15.00' },
      'L6-T11': { name: 'Biên: lần thử $5.00 thứ năm là dồn dập' },
      'L6-T12': { name: 'Biên: lần thử $5.00 thứ tư thì không' },
      'L6-T13': { name: 'Biên: $5.01 không phải giao dịch siêu nhỏ' },
    },
  },
  lvl_07_a2a_iso20022: {
    title: 'Mạng lưới huyết mạch: A2A & ISO 20022',
    problemDescription:
      'Giao dịch tài khoản-tới-tài khoản (**A2A**) chuyển tiền thẳng từ tài khoản ngân hàng này sang tài khoản khác: lương, hóa đơn, mua nhà. Chúng đến dưới dạng thông điệp **ISO 20022 pacs.008**. Bốn trường quan trọng: **EndToEndId** (mã tham chiếu của giao dịch), **DebtorAgent** và **CreditorAgent** (hai ngân hàng, theo BIC), và **InterbankSettlementAmount**.\n\n**Cổng thanh toán A2A** của ngân hàng đứng trước hai kênh. **Kênh tức thì** nhận giao dịch tới một hạn mức trong vài giây. **RTGS** (quyết toán tổng tức thời, tại ngân hàng trung ương) nhận mọi thứ lớn hơn. Cổng có một **hàng chờ** và một ngân sách **thanh khoản** hằng ngày, một phần ngân sách đó được giữ lại cho chi lương.\n\n**Chính sách**\n\n| Kiểm tra, theo thứ tự này | Kết quả | Mã lý do |\n|---|---|---|\n| Thông điệp không hợp lệ (thiếu EndToEndId, BIC sai, số tiền không khớp) | **DECLINED** | `INVALID_MESSAGE` |\n| Không đủ thanh khoản cho giao dịch này | **ROUTED_TO_SUSPENSE** (giữ trong hàng chờ của cổng) | `HELD_LIQUIDITY` |\n| Hàng chờ nghẽn, và giao dịch **không** ưu tiên | **ROUTED_TO_SUSPENSE** | `HELD_CONGESTION` |\n| Ngoài ra, số tiền trong hạn mức tức thì | **APPROVED** trên kênh tức thì | `RAIL_INSTANT` |\n| Còn lại | **APPROVED** qua RTGS | `RAIL_RTGS` |\n\n**Thiết lập.** Kênh tức thì chở giao dịch tới **$25,000.00**. Mặc định của nút cổng là $50,000.00, nên bạn phải đổi nó. Sức chứa hàng chờ (50) và khoản dự trữ ưu tiên ($100,000.00) đã khớp chính sách.\n\n**Định tuyến ưu tiên.** Chi lương (mã mục đích `SALA`) là ưu tiên. Nó bỏ qua hàng chờ nghẽn và được dùng khoản dự trữ. Cổng tự tính điều đó và ghi `a2aPriority`, `a2aQueue` và `a2aLiquidity`. Việc của bạn là định tuyến theo chúng.\n\nGiao dịch "bị giữ" không bị từ chối. Chúng chờ trong hàng của cổng và đi khi hàng chờ thông hoặc thanh khoản về, vì vậy kết quả là ROUTED_TO_SUSPENSE chứ không phải DECLINED. Sự kiện bắt đầu đã có trên canvas.',
    learningObjectives: [
      'Đọc bốn trường pacs.008 mà cổng kiểm tra, và biết mỗi trường dùng để làm gì',
      'Chọn giữa kênh tức thì và RTGS theo số tiền, với một thiết lập bạn tự đổi',
      'Giữ một giao dịch thay vì từ chối, và phân biệt giao dịch bị giữ với giao dịch bị khước từ',
      'Định tuyến chi lương ưu tiên: vượt hàng chờ nghẽn và dùng khoản dự trữ',
    ],
    hints: [
      'Chọn Cổng thanh toán A2A để xem thiết lập. Số tiền tính bằng cent, nên $25,000.00 là 2500000.',
      'Cổng ghi năm dữ kiện và không quyết định gì. Đặt một Quyết định (XOR) ngay sau nó và định tuyến theo chúng.',
      'Thứ tự các kiểm tra chính là chính sách. Đặt vấn đề nghiêm trọng nhất lên cạnh đầu tiên: thông điệp không hợp lệ.',
      "Hàng chờ nghẽn chỉ quan trọng với giao dịch không ưu tiên: a2aQueue == 'CONGESTED' && a2aPriority == 'NORMAL'.",
      'Hai sự kiện kết thúc đều có thể là APPROVED. Mã lý do, RAIL_INSTANT hoặc RAIL_RTGS, là thứ phân biệt chúng.',
    ],
    tests: {
      'L7-T01': { name: 'Hóa đơn nhà cung cấp: $1,250.00', description: 'Giao dịch nhỏ, hàng chờ thông và dư thanh khoản. Nó đi kênh tức thì.' },
      'L7-T02': { name: 'Biên: đúng $25,000.00 vẫn là tức thì' },
      'L7-T03': { name: 'Biên: $25,000.01 đi qua RTGS' },
      'L7-T04': { name: 'Thanh toán bất động sản: $320,000.00' },
      'L7-T05': { name: 'Chi lương vào hàng chờ nghẽn: $180,000.00', description: 'Hàng chờ đầy (50 đang chờ). Chi lương là ưu tiên, nên nó bỏ qua hàng chờ và được giải phóng qua RTGS.' },
      'L7-T06': { name: 'Giao dịch thường vào hàng chờ nghẽn: $12,000.00', description: 'Cùng hàng chờ đầy. Giao dịch không ưu tiên phải chờ tới lượt.' },
      'L7-T07': { name: 'Giao dịch thường vượt trần thanh khoản: $75,000.00', description: 'Thanh khoản $150,000.00, trong đó $100,000.00 dành cho giao dịch ưu tiên. Giao dịch thường chỉ dùng được $50,000.00.' },
      'L7-T08': { name: 'Chi lương được dùng khoản dự trữ: $75,000.00', description: 'Cùng vị thế thanh khoản. Chi lương được rút toàn bộ.' },
      'L7-T09': { name: 'Ngay cả chi lương cũng không tạo ra thanh khoản: $400,000.00 so với $250,000.00' },
      'L7-T10': { name: 'Không có EndToEndId', description: 'Thiếu EndToEndId thì không ai truy được giao dịch, nên cổng từ chối thông điệp.' },
      'L7-T11': { name: 'Mã định danh ngân hàng không phải BIC' },
      'L7-T12': { name: 'InterbankSettlementAmount khác với lệnh' },
      'L7-T13': { name: 'Chi lương nhỏ trong hàng chờ nghẽn: $4,200.00', description: 'Ưu tiên cũng bỏ qua hàng chờ trên kênh tức thì.' },
      'L7-T14': { name: 'Vừa nghẽn vừa thiếu thanh khoản: thanh khoản được báo trước' },
      'L7-T15': { name: 'Thông điệp không hợp lệ bị từ chối kể cả khi hàng chờ đầy' },
    },
  },
  lvl_08_fx_breaks: {
    title: 'Chuyến chạy đêm 23:59: Sai lệch tỷ giá',
    problemDescription:
      'Bây giờ là 23:59. Lượt chạy cuối ngày tạo ra một danh sách dài các sai lệch, và **mười lăm trong số đó là giao dịch mua bằng ngoại tệ**. Khách trả bằng đô la; ngân hàng ghi sổ cấp phép ở một tỷ giá và tổ chức thẻ quyết toán ở tỷ giá khác. Các vế không khớp, nhưng **không ai làm sai**: tỷ giá đã thay đổi.\n\nĐổ những mục đó vào tài khoản treo chung sẽ chôn một vấn đề thật dưới mười lăm mục vô hại. Chênh lệch tỷ giá thuộc về **tài khoản treo lãi và lỗ tỷ giá** riêng, nơi bộ phận ngân quỹ ghi nhận chúng.\n\n**Quy tắc**\n- Đặt biên sai số của Quầy đối soát để các vế chênh trong **2 cent** được coi là khớp.\n- Quầy đối soát giờ cũng ghi **`reconCause`** cho sai lệch số tiền: `FX_RATE` khi số ngoại tệ nhân với mức thay đổi tỷ giá giải thích được khoản chênh, ngược lại là `UNEXPLAINED`. Khi là `FX_RATE`, **`fxDirection`** cho biết `LOSS` (tổ chức thẻ quyết toán nhiều hơn số đã ghi) hoặc `GAIN`.\n\n| Kết quả | Sự kiện kết thúc |\n|---|---|\n| Khớp | Đã quyết toán |\n| Sai lệch số tiền do tỷ giá, lỗ | `SUSP_FX_LOSS` |\n| Sai lệch số tiền do tỷ giá, lãi | `SUSP_FX_GAIN` |\n| Sai lệch số tiền **không** do tỷ giá | `SUSP_AMOUNT_VARIANCE` |\n| Thiếu một vế | `SUSP_MISSING_LEG` |\n| Bị trình hai lần | `SUSP_DUPLICATE` |\n\nSự kiện bắt đầu và cả sáu sự kiện kết thúc đã có trên canvas, đã được cấu hình. Bạn nối phần định tuyến.',
    learningObjectives: [
      'Giải thích vì sao giao dịch ngoại tệ có thể sai lệch khi quyết toán mà không ai sai',
      'Nối hai quyết định: trước là loại sai lệch, sau là nguyên nhân',
      'Giữ các ngoại lệ thật luôn hiển hiện bằng cách đưa chênh lệch có giải thích vào tài khoản riêng',
      'Bao phủ mọi giá trị của một trạng thái để không gì bị quyết toán âm thầm hay bỏ qua',
    ],
    hints: [
      'Biên sai số của Quầy đối soát mặc định là 0. Đặt nó trước khi kiểm tra bất cứ gì.',
      'Trước tiên phân loại theo reconStatus (khớp, thiếu vế, trùng lặp). Gửi BREAK_AMOUNT tới quyết định thứ hai đọc reconCause và fxDirection.',
      'Một quyết định có bốn cổng ra. Dùng cạnh mặc định cho nhánh cuối.',
      'Nếu một sai lệch nội địa rơi vào tài khoản tỷ giá, hãy kiểm tra điều kiện tỷ giá của bạn có đọc reconCause chứ không chỉ fxDirection.',
    ],
    tests: {
      'L8-FX01': { name: 'Sai lệch tỷ giá 01: lỗ USD', description: `USD 250.00, ghi sổ ở 1.5320, quyết toán ở 1.5415. ${FX_LOSS}` },
      'L8-FX02': { name: 'Sai lệch tỷ giá 02: lãi USD', description: `USD 89.90, ghi sổ ở 1.5410, quyết toán ở 1.5280. ${FX_GAIN}` },
      'L8-FX03': { name: 'Sai lệch tỷ giá 03: lỗ EUR', description: `EUR 120.00, ghi sổ ở 1.6680, quyết toán ở 1.6795. ${FX_LOSS}` },
      'L8-FX04': { name: 'Sai lệch tỷ giá 04: lãi EUR', description: `EUR 450.50, ghi sổ ở 1.6790, quyết toán ở 1.6642. ${FX_GAIN}` },
      'L8-FX05': { name: 'Sai lệch tỷ giá 05: lỗ GBP', description: `GBP 99.00, ghi sổ ở 1.9850, quyết toán ở 2.0010. ${FX_LOSS}` },
      'L8-FX06': { name: 'Sai lệch tỷ giá 06: lãi GBP', description: `GBP 1500.00, ghi sổ ở 2.0120, quyết toán ở 1.9980. ${FX_GAIN}` },
      'L8-FX07': { name: 'Sai lệch tỷ giá 07: lỗ NZD', description: `NZD 330.00, ghi sổ ở 0.9120, quyết toán ở 0.9185. ${FX_LOSS}` },
      'L8-FX08': { name: 'Sai lệch tỷ giá 08: lãi NZD', description: `NZD 54.00, ghi sổ ở 0.9210, quyết toán ở 0.9070. ${FX_GAIN}` },
      'L8-FX09': { name: 'Sai lệch tỷ giá 09: lỗ SGD', description: `SGD 210.00, ghi sổ ở 1.1490, quyết toán ở 1.1580. ${FX_LOSS}` },
      'L8-FX10': { name: 'Sai lệch tỷ giá 10: lãi CAD', description: `CAD 78.00, ghi sổ ở 1.1050, quyết toán ở 1.0935. ${FX_GAIN}` },
      'L8-FX11': { name: 'Sai lệch tỷ giá 11: lỗ CHF', description: `CHF 640.00, ghi sổ ở 1.7200, quyết toán ở 1.7310. ${FX_LOSS}` },
      'L8-FX12': { name: 'Sai lệch tỷ giá 12: lỗ USD', description: `USD 3000.00, ghi sổ ở 1.5350, quyết toán ở 1.5440. ${FX_LOSS}` },
      'L8-FX13': { name: 'Sai lệch tỷ giá 13: lỗ EUR', description: `EUR 25.00, ghi sổ ở 1.6900, quyết toán ở 1.7050. ${FX_LOSS}` },
      'L8-FX14': { name: 'Sai lệch tỷ giá 14: lãi GBP', description: `GBP 77.77, ghi sổ ở 2.0300, quyết toán ở 2.0180. ${FX_GAIN}` },
      'L8-FX15': { name: 'Sai lệch tỷ giá 15: lãi USD', description: `USD 19.99, ghi sổ ở 1.5480, quyết toán ở 1.5360. ${FX_GAIN}` },
      'L8-C1': { name: 'Khớp chính xác ba bên' },
      'L8-C2': { name: 'Chênh làm tròn 1c không phải sai lệch', description: 'Các vế chênh trong 2 cent được coi là khớp.' },
      'L8-C3': { name: 'Giao dịch ngoại tệ khi tỷ giá gần như không đổi', description: 'EUR 30.00, ghi sổ ở 1.6800 và quyết toán ở 1.6801: các vế khớp tới từng cent.' },
      'L8-C4': { name: 'Đã cấp phép, chưa từng bù trừ' },
      'L8-C5': { name: 'Trình trùng lặp' },
      'L8-C6': { name: 'Đảo chữ số trên giao dịch nội địa', description: 'Ghi sổ $250.00, bù trừ $205.00. Không có ngoại tệ, nên không gì giải thích được: tài khoản treo chung, không phải tỷ giá.' },
      'L8-C7': { name: 'Giao dịch ngoại tệ có sai lệch mà tỷ giá không giải thích được', description: 'USD 100.00 lẽ ra chỉ đổi $1.00 theo tỷ giá. Khoản chênh là $3.50: tổ chức thẻ còn cộng thêm phí. Phần đó không phải tỷ giá.' },
      'L8-C8': { name: 'Giao dịch ngoại tệ khi bù trừ và chuyển mạch không khớp', description: 'Tệp bù trừ thay đổi theo tỷ giá. Báo cáo chuyển mạch thì không. Tỷ giá không thể giải thích sự bất đồng giữa hai báo cáo.' },
    },
  },
  lvl_09_sanctions_storm: {
    title: 'Bão cấm vận: Khách VIP bị cảnh báo nhầm',
    problemDescription:
      'Mọi giao dịch chuyển ra đều được sàng lọc rủi ro **chống rửa tiền (AML)**. Ba điều khiến ngân hàng lo ngại: khách có tên trong **danh sách cấm vận (OFAC)**, khách là **người có ảnh hưởng chính trị (PEP)**, và khách **chia nhỏ giao dịch**, tách tiền mặt thành các lần nộp ngay dưới ngưỡng báo cáo để né nó.\n\nViệc so khớp tên là **mờ**. "Dmitri Volkanoff" và "Dmitri Volkanov" là hai người khác nhau có tên giống nhau, và bộ máy sàng lọc vẫn sẽ gắn cờ họ. Một lần trùng là **đầu mối, không phải phán quyết**. Đóng băng mọi khách VIP bị trùng là mất khách tốt nhất. Thả tất cả là vi phạm pháp luật.\n\nNút **Sàng lọc AML** ghi `amlList` (`OFAC`, `PEP` hoặc `NONE`) cho lần trùng tên và `amlStructuring` cho mẫu hình nộp tiền. Nút **Điều tra vụ việc** mở nhật ký kiểm toán, so ngày sinh và quốc tịch **đã xác minh** của khách với người trong danh sách, và ghi `caseVerdict`.\n\n**Chính sách**\n\n| Phát hiện | Kết quả |\n|---|---|\n| Trùng tên (`amlList` khác `NONE`) | **Điều tra** trước khi quyết định. |\n| Đã điều tra, `FALSE_POSITIVE` | Giải phóng: `CLEARED_FALSE_POSITIVE` |\n| Đã điều tra, `TRUE_MATCH` với danh sách **cấm vận** | Chặn: `SANCTIONS_BLOCK` |\n| Đã điều tra, `TRUE_MATCH` với danh sách **PEP** | Yêu cầu giải trình nguồn tiền: `EDD_SOURCE_OF_FUNDS` |\n| Đã điều tra, `INCONCLUSIVE` | Chuyển cấp: `EDD_ESCALATION` |\n| Không trùng tên, nhưng có **chia nhỏ giao dịch** | Báo cáo: `SAR_STRUCTURING` |\n| Không trùng tên, không chia nhỏ | Giải phóng: `PAYMENT_RELEASED` |\n\n**Đừng điều tra thứ không phải đầu mối.** Mỗi cuộc điều tra tốn thời gian chuyên viên và bắt khách phải chờ. Bài kiểm tra nào đưa khách trong sạch vào Điều tra vụ việc sẽ thất bại.\n\nSự kiện bắt đầu và cả sáu sự kiện kết thúc đã có trên canvas, đã được cấu hình.',
    learningObjectives: [
      'Phân biệt một lần trùng khi sàng lọc (đầu mối) với một lần trùng đã xác nhận (phán quyết)',
      'Chỉ gửi các lần trùng tên thật vào cuộc điều tra tốn kém',
      'Giải phóng khách VIP gọn gàng khi bằng chứng cho thấy cảnh báo sai, và giữ dấu vết kiểm toán',
      'Xử lý khác nhau các trường hợp cấm vận, PEP, chia nhỏ giao dịch và chưa kết luận',
    ],
    hints: [
      "amlList là NONE khi không tên nào đạt ngưỡng. Điều kiện như amlList != 'NONE' nghĩa là \"có trùng tên\".",
      'Kiểm tra trùng tên trước khi kiểm tra chia nhỏ giao dịch, và chỉ gửi các lần trùng tên tới Điều tra vụ việc.',
      'caseVerdict có ba giá trị. Sau cuộc điều tra, dùng một quyết định với một nhánh cho mỗi giá trị, và đọc amlList để phân biệt trùng cấm vận với trùng PEP.',
      'Nếu một khách trong sạch làm thất bại bài kiểm tra, hãy xem sơ đồ có đưa họ qua Điều tra vụ việc không.',
    ],
    tests: {
      'L9-T01': { name: 'Một khách bình thường', description: 'Không có tên trong danh sách nào, không có khoản nộp bất thường. Đừng phí một cuộc điều tra cho trường hợp này.' },
      'L9-T02': { name: 'Nộp tiền mặt không phải chia nhỏ', description: 'Ba lần nộp $2,000.00 tiền mặt trong ba ngày. Thấp hơn ngưỡng nhiều, không hề sát ngưỡng.' },
      'L9-T03': { name: 'Chia nhỏ: bốn lần nộp tiền mặt ngay dưới $10,000.00', description: '$9,000.00, $9,400.00, $9,800.00 và $9,200.00 trong ba ngày: $37,400.00 chia thành nhiều phần, mỗi phần dưới ngưỡng báo cáo.' },
      'L9-T04': { name: 'Khách VIP: trùng cấm vận nhưng không phải ông ấy', description: 'Dmitri Volkanoff, khách VIP lâu năm và công dân Úc sinh năm 1974, đạt điểm 90+ so với Dmitri Volkanov bị cấm vận (sinh năm 1962, Nga). Bộ phận tuân thủ phải xem nhật ký kiểm toán, tìm lần kiểm tra hộ chiếu, và giải phóng giao dịch gọn gàng.' },
      'L9-T05': { name: 'Trùng cấm vận thật', description: 'Cùng tên, cùng ngày sinh, cùng quốc tịch, đã xác minh qua hộ chiếu.' },
      'L9-T06': { name: 'Trùng tên mà không có bằng chứng danh tính', description: 'Nhật ký kiểm toán không có gì được giấy tờ xác minh. Riêng hồ sơ không chứng minh được bên nào, nên trường hợp này được chuyển cấp, không đoán.' },
      'L9-T07': { name: 'Một người có ảnh hưởng chính trị thật', description: 'PEP không bị cấm, nhưng ngân hàng phải hỏi tiền từ đâu ra (thẩm định tăng cường).' },
      'L9-T08': { name: 'Trùng PEP nhưng là người khác' },
      'L9-T09': { name: 'Tên tương tự nhưng không trùng', description: 'Điểm thấp hơn ngưỡng nhiều. Không cần điều tra.' },
      'L9-T10': { name: 'Tín hiệu lẫn lộn: ngày sinh khớp, quốc tịch không', description: 'Không đủ để giải tỏa, cũng không đủ để chặn.' },
      'L9-T11': { name: 'Chỉ hai lần nộp ngay dưới ngưỡng' },
      'L9-T12': { name: 'Các lần nộp bằng hoặc trên ngưỡng vẫn được báo cáo', description: 'Ba lần nộp tiền mặt từ $10,000.00 trở lên được báo cáo tự động. Đó không phải chia nhỏ giao dịch.' },
    },
  },
  lvl_10_chargeback_warfare: {
    title: 'Cuộc chiến tra soát hoàn tiền',
    problemDescription:
      'Một chủ thẻ khiếu nại một giao dịch. Các tổ chức thẻ xử lý khiếu nại theo **chu trình bốn giai đoạn**:\n\n1. **RETRIEVAL_REQUEST**: "cho tôi xem hóa đơn." Ngân hàng yêu cầu cửa hàng xuất trình chứng từ.\n2. **FIRST_CHARGEBACK**: "tôi đang lấy lại tiền." Chủ thẻ được ghi có ngay.\n3. **REPRESENTMENT**: cửa hàng phản công bằng bằng chứng.\n4. **PRE_ARBITRATION**: ngân hàng không chấp nhận câu trả lời và chuyển cấp trước khi tổ chức thẻ phải phân xử.\n\nVà một quy tắc quyết định ai trả. Nếu giao dịch đã được **xác thực bằng 3-D Secure**, **trách nhiệm gian lận chuyển sang ngân hàng phát hành**: cửa hàng đã làm đủ mọi điều tổ chức thẻ yêu cầu, nên tổ chức thẻ không cho phép tra soát gian lận đối với cửa hàng. **Ngân hàng hoàn tiền cho chủ thẻ và tự chịu tổn thất**.\n\n**Quầy khiếu nại & tra soát** biết các giai đoạn và thời hạn khiếu nại. Nó **không** biết giao dịch có được xác thực không trừ khi **Bộ đánh giá rủi ro 3DS** đã chạy trước (nó đọc `authenticated`). Chạy bộ đánh giá 3DS trên giao dịch gốc, rồi mới tới quầy.\n\nQuầy ghi `disputeWindow`, `disputeLiability` và `disputeNext`. Định tuyến theo chúng:\n\n| Phát hiện | Sự kiện kết thúc |\n|---|---|\n| `disputeWindow` là `EXPIRED` | Hết thời hiệu |\n| `disputeLiability` là `ISSUER` | Ngân hàng phát hành chịu tổn thất |\n| `disputeNext` là `RETRIEVAL_REQUEST` | Yêu cầu cửa hàng xuất trình hóa đơn |\n| `FIRST_CHARGEBACK` | Đã nộp tra soát lần đầu |\n| `REPRESENTMENT` | Đang xem xét phản hồi của cửa hàng |\n| `PRE_ARBITRATION` | Đã chuyển lên tiền trọng tài |\n| `RESOLVED_CARDHOLDER` | Chủ thẻ được hoàn tiền |\n| `RESOLVED_MERCHANT` | Cửa hàng thắng |\n\nMột khiếu nại quá hạn là hết hiệu lực **dù ai** lẽ ra phải trả, nên hãy kiểm tra thời hạn trước trách nhiệm. Sự kiện bắt đầu và cả tám sự kiện kết thúc đã có trên canvas.',
    learningObjectives: [
      'Đưa một khiếu nại qua RETRIEVAL_REQUEST, FIRST_CHARGEBACK, REPRESENTMENT và PRE_ARBITRATION',
      'Giải thích vì sao xác thực 3-D Secure chuyển trách nhiệm gian lận sang ngân hàng phát hành',
      'Chạy một năng lực để năng lực khác đọc được những gì nó ghi (3DS trước quầy khiếu nại)',
      'Nối chuỗi quyết định để bao phủ nhiều nhánh hơn số cổng của một cổng XOR',
    ],
    hints: [
      'Quầy cần authenticated. Đặt Bộ đánh giá rủi ro 3DS trước nó, dù đây là khiếu nại chứ không phải giao dịch mua.',
      'Một quyết định có bốn cổng ra và bạn có tám kết quả. Nối chuỗi quyết định: cạnh mặc định của cái này dẫn tới cái tiếp theo.',
      'Kiểm tra thời hạn khiếu nại trước, rồi trách nhiệm, rồi disputeNext.',
      'Nếu khiếu nại gian lận trên giao dịch đã xác thực đi vào nhánh tra soát, nghĩa là quầy không thấy được việc xác thực. Hãy kiểm tra thứ tự nối dây.',
    ],
    tests: {
      'L10-T01': { name: 'Khiếu nại mới: hàng chưa bao giờ đến', description: 'Chưa ai xử lý, nên bước đầu tiên là yêu cầu cửa hàng xuất trình chứng từ.' },
      'L10-T02': { name: 'Yêu cầu chứng từ: cửa hàng không gửi gì', description: 'Cửa hàng không xuất trình hóa đơn, nên ngân hàng lấy lại tiền bằng tra soát lần đầu.' },
      'L10-T03': { name: 'Yêu cầu chứng từ: cửa hàng chứng minh đã giao', description: 'Một bằng chứng giao hàng có chữ ký. Cửa hàng thắng trước khi có tra soát nào được nộp.' },
      'L10-T04': { name: 'Tra soát lần đầu: cửa hàng im lặng', description: 'Không trả lời kịp hạn, nên chủ thẻ thắng mặc định và ngân hàng được tổ chức thẻ hoàn tiền.' },
      'L10-T05': { name: 'Tra soát lần đầu: cửa hàng phản công', description: 'Một câu trả lời yếu vẫn là câu trả lời: giờ đây là phản hồi của cửa hàng để ngân hàng xem xét.' },
      'L10-T06': { name: 'Phản hồi của cửa hàng: bằng chứng yếu, chuyển cấp', description: 'Ngân hàng không chấp nhận câu trả lời của cửa hàng, nên nó lên tiền trọng tài.' },
      'L10-T07': { name: 'Phản hồi của cửa hàng: bằng chứng thuyết phục, cửa hàng thắng', description: 'Khoản ghi có tạm thời bị thu lại từ chủ thẻ.' },
      'L10-T08': { name: 'Tiền trọng tài: cửa hàng bỏ cuộc' },
      'L10-T09': { name: 'Chuyển dịch trách nhiệm: khiếu nại gian lận trên giao dịch không ma sát', description: 'Chủ thẻ nói họ chưa bao giờ thực hiện giao dịch $189.00. Nhưng 3-D Secure đã xác thực nó (rủi ro 12, không ma sát), nên trách nhiệm gian lận chuyển sang ngân hàng phát hành. Tổ chức thẻ không cho phép tra soát với cửa hàng. Ngân hàng hoàn tiền cho chủ thẻ và ghi nhận tổn thất.' },
      'L10-T10': { name: 'Chuyển dịch trách nhiệm: khiếu nại gian lận sau thử thách đã hoàn tất', description: 'Rủi ro 55, chủ thẻ đã nhập OTP. Đó cũng là xác thực.' },
      'L10-T11': { name: 'Không chuyển dịch trách nhiệm: khiếu nại gian lận trên giao dịch chưa xác thực', description: 'Rủi ro 65 và chưa từng có thử thách (cửa hàng bỏ qua 3DS). Cửa hàng vẫn chịu trách nhiệm, nên khiếu nại bắt đầu đi theo nhánh tra soát.' },
      'L10-T12': { name: 'Quá muộn: 150 ngày sau giao dịch' },
      'L10-T13': { name: 'Khiếu nại hết hiệu lực là hết, dù ai lẽ ra phải trả', description: 'Khiếu nại gian lận trên giao dịch đã xác thực, trễ 200 ngày. Hết thời hiệu được xét trước trách nhiệm.' },
      'L10-T14': { name: 'Vụ việc dài vẫn còn hiệu lực: phản hồi của cửa hàng vào ngày 300', description: 'Thời hạn khiếu nại áp dụng cho việc đưa ra khiếu nại. Một vụ đã nộp đúng hạn không trở thành hết thời hiệu về sau.' },
      'L10-T15': { name: 'Chuyển dịch chỉ dành cho gian lận: trừ tiền trùng trên giao dịch đã xác thực' },
      'L10-T16': { name: 'Tiền trọng tài với câu trả lời yếu vẫn ở tiền trọng tài' },
    },
  },
};

/** Labels of the boxes the starter canvases and the reference solutions put on the canvas. */
const CANVAS_LABEL_VI: Readonly<Record<string, string>> = {
  'Payment Request': 'Yêu cầu thanh toán',
  Approved: 'Chấp thuận',
  Declined: 'Từ chối',
  'A2A Inflow Channel': 'Kênh tiếp nhận A2A',
  Settled: 'Đã quyết toán',
  'Suspense: unexplained variance': 'Treo: chênh lệch không giải thích được',
  'Suspense: missing leg': 'Treo: thiếu vế',
  'Suspense: duplicate': 'Treo: trùng lặp',
  'FX loss suspense': 'Treo lỗ tỷ giá',
  'FX gain suspense': 'Treo lãi tỷ giá',
  'Payment released': 'Đã giải phóng giao dịch',
  'Cleared: false positive': 'Giải tỏa: cảnh báo sai',
  'Report: structuring': 'Báo cáo: chia nhỏ giao dịch',
  'Blocked: sanctions': 'Bị chặn: cấm vận',
  'Ask: source of funds': 'Yêu cầu: nguồn tiền',
  'Escalate: enhanced due diligence': 'Chuyển cấp: thẩm định tăng cường',
  'Ask the merchant for the receipt': 'Yêu cầu cửa hàng xuất trình hóa đơn',
  'First chargeback filed': 'Đã nộp tra soát lần đầu',
  'Representment under review': 'Đang xem xét phản hồi của cửa hàng',
  'Escalated to pre-arbitration': 'Đã chuyển lên tiền trọng tài',
  'Cardholder refunded': 'Chủ thẻ được hoàn tiền',
  'Issuer absorbs the loss': 'Ngân hàng phát hành chịu tổn thất',
  'Merchant won': 'Cửa hàng thắng',
  'Time-barred': 'Hết thời hiệu',
};

/** A box label on the Build Lab canvas, in the active language. Labels the learner typed are shown as typed. */
export const canvasLabel = (label: string, locale: Locale = activeLocale()): string => (locale === 'vi' ? (CANVAS_LABEL_VI[label] ?? label) : label);

/** The level with its learner-facing text in the given language. Everything the grader reads is left untouched. */
export function localChallenge(level: ChallengeLevel, locale: Locale = activeLocale()): ChallengeLevel {
  if (locale !== 'vi') return level;
  const text = LEVEL_VI[level.id];
  if (!text) return level;
  return {
    ...level,
    title: text.title,
    problemDescription: text.problemDescription,
    learningObjectives: [...text.learningObjectives],
    hints: [...text.hints],
    testSuite: level.testSuite.map((tc) => {
      const vi = text.tests[tc.id];
      if (!vi) return tc;
      return { ...tc, name: vi.name, ...(tc.description !== undefined ? { description: vi.description ?? tc.description } : {}) };
    }),
  };
}

/** The Vietnamese table, for the coverage test. */
export const CHALLENGE_VI_IDS: readonly Id[] = Object.keys(LEVEL_VI);

/** A test's Vietnamese name and description, for the coverage test. */
export const challengeTestVi = (levelId: Id, testId: Id): { name: string; description?: string } | undefined => LEVEL_VI[levelId]?.tests[testId];

const STAGE_VI: Readonly<Record<number, { title: string; blurb: string }>> = {
  1: { title: 'Những lần quẹt thẻ đầu tiên', blurb: 'Một thẻ được chạm. Tài khoản có trả được không? Học các bước kiểm tra cơ bản và cách từ chối có lịch sự.' },
  2: { title: 'Thám tử gian lận', blurb: 'Gian lận và rủi ro 3-D Secure. Chặn kẻ gian lúc nửa đêm mà không làm khách trung thực bỏ đi.' },
  3: { title: 'Fintech & Trả góp', blurb: 'Vòng đời BNPL trả góp 4 kỳ: thẩm định khách, và chuyển sang tín dụng quay vòng khi câu trả lời là không.' },
  4: { title: 'Mạng lưới huyết mạch', blurb: 'Thanh toán tài khoản-tới-tài khoản và ISO 20022: kênh tức thì hay RTGS, hàng chờ của cổng, và trần thanh khoản.' },
  5: { title: 'Chuyến chạy đêm 23:59', blurb: 'Cuối ngày: đối soát sổ sách, và đưa lãi lỗ tỷ giá vào đúng tài khoản treo.' },
  6: { title: 'Bão vận hành', blurb: 'Sàng lọc AML và cuộc chiến tra soát: giải phóng khách VIP bị gắn cờ nhầm, và thắng hoặc chịu một khiếu nại theo đúng luật.' },
};

/** A curriculum stage's title and one-line blurb in the active language. */
export function stageText(stage: { stage: number; title: string; blurb: string }, locale: Locale = activeLocale()): { title: string; blurb: string } {
  return locale === 'vi' ? (STAGE_VI[stage.stage] ?? stage) : { title: stage.title, blurb: stage.blurb };
}
