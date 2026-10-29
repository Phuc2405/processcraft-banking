/** Everything the guided walkthrough says that is not about a particular payment. */

import { pick, type Localized } from '../i18n/localeCore';
import type { ProcessId } from '../sim/learning';

export interface Scene {
  /** The chapter heading on the opening card. */
  chapter: string;
  /** Two or three sentences that put the learner in the story before the token moves. */
  scene: string;
  /** What to watch for while the token travels. */
  lookFor: string[];
}

export interface WalkUi {
  tour: string;
  chapter: string;
  thisRun: string;
  lookFor: string;
  example: string;
  start: string;
  startHint: string;
  stepOf: (n: number, total: number) => string;
  whatHappens: string;
  forThisPayment: string;
  takeaway: string;
  canGoWrong: string;
  thinkOfItLike: string;
  previous: string;
  next: string;
  autoPlay: string;
  pause: string;
  resume: string;
  replay: string;
  exit: string;
  ruleLab: string;
  speedLocked: string;
  quizTitle: string;
  quizAsk: string;
  quizLocked: string;
  correct: string;
  notQuite: string;
  rightAnswer: string;
  tourDone: string;
  score: (right: number, total: number) => string;
  noQuestions: string;
}

interface WalkBook {
  scenes: Record<ProcessId, Scene>;
  ui: WalkUi;
}

const EN: WalkBook = {
  scenes: {
    A: {
      chapter: 'The virtual card: a number that is not the card',
      scene:
        'Customer An has just bought a shirt online. She did not type her real card number: she used a virtual card from her banking app, a stand-in number that works for a few minutes. The shop’s checkout now sends that number and its security code to the bank. In a few seconds the bank must decide whether this really is An.',
      lookFor: ['Where the real card hides.', 'Why the security code is checked before anyone looks at her money.', 'What a slow typist and a thief have in common.'],
    },
    B: {
      chapter: 'The gatekeeper: friction only where it pays',
      scene:
        'Customer An is buying a bag online with her everyday card. The checkout sends the payment with a risk score, a number from 0 (calm) to 100 (alarming). The bank has a split second to decide: wave her through, stop her and send a code to her phone, or turn her away at the door.',
      lookFor: ['Who is waved through without a single question.', 'What happens on the customer’s phone.', 'Who pays if a payment that passed this check turns out to be fraud.'],
    },
    C: {
      chapter: 'Pay in four: trust, with a plan B',
      scene:
        'Customer An wants a jacket but would rather pay for it in four parts. She applies for Buy Now Pay Later at checkout. The bank has to decide whether to trust her with a plan, and what to do with the sale if the answer is no.',
      lookFor: ['The two tests a plan must pass.', 'How a “no” can still keep the sale.', 'How a plan can be approved and still fail.'],
    },
    D: {
      chapter: 'The night run: do three sets of books agree?',
      scene:
        'It is 23:00. The shops are closed, and every payment approved today is waiting at the Approved box. Tonight the bank must prove that three independent sets of records agree about every one of them, and park the ones that do not.',
      lookFor: ['The three records, and who keeps each.', 'What counts as dust and what counts as a real break.', 'Why a mismatch is parked, never forced to match.'],
    },
    E: {
      chapter: 'The instant transfer: no card, no second chances',
      scene:
        'Mia is at dinner. She scans a QR code on the bill and taps send: $18.50 to a friend who banks somewhere else. There is no card and no night cycle to fix a mistake: the moment the bank says yes, the money is gone. So the bank reads the message her app sent, line by line, before it even looks at her balance.',
      lookFor: ['The fields the gateway insists on.', 'Why a flawed message never reaches the ledger.', 'What “instant” takes away from the bank.'],
    },
    F: {
      chapter: 'After the payment: who is it for, and who pays if it goes wrong?',
      scene:
        'This chapter has two stories. In the first, a long-standing customer sends $25,000.00 and the screening engine thinks his name looks like a sanctioned man’s. In the second, a cardholder says a purchase was not hers. Pick an example that starts with “AML:” or “Dispute:” to walk one or the other through the real diagram.',
      lookFor: ['The difference between a lead and a verdict.', 'Which evidence the analyst trusts.', 'Why the filing window is checked before the liability.'],
    },
  },
  ui: {
    tour: 'Learn & Explore',
    chapter: 'Chapter',
    thisRun: 'This run',
    lookFor: 'Look out for',
    example: 'Example payment',
    start: 'Start the tour',
    startHint: 'The token sets off. It stops at every desk to explain, and at every decision to ask you a question.',
    stepOf: (n, total) => `Step ${n} of ${total}`,
    whatHappens: 'What is happening here?',
    forThisPayment: 'For this payment',
    takeaway: 'Key takeaway',
    canGoWrong: 'What can go wrong',
    thinkOfItLike: 'Think of it like',
    previous: 'Previous step',
    next: 'Next step',
    autoPlay: 'Auto-play',
    pause: 'Pause',
    resume: 'Resume',
    replay: 'Replay',
    exit: 'Exit tutorial',
    ruleLab: 'Open rule lab',
    speedLocked: 'Speed locked to 0.25×',
    quizTitle: 'Quick check',
    quizAsk: 'Answer to let the token carry on.',
    quizLocked: 'Answer the question to move on.',
    correct: 'Correct!',
    notQuite: 'Not quite.',
    rightAnswer: 'The answer',
    tourDone: 'End of the tour',
    score: (right, total) => `Quick checks: ${right} of ${total} right`,
    noQuestions: 'No quick checks in this run',
  },
};

const VI: WalkBook = {
  scenes: {
    A: {
      chapter: 'Thẻ ảo: một con số không phải là thẻ thật',
      scene:
        'Khách hàng An vừa mua một chiếc áo trên mạng. Cô không nhập số thẻ thật mà dùng thẻ ảo từ ứng dụng ngân hàng, một số thay thế chỉ có hiệu lực vài phút. Trang thanh toán của cửa hàng gửi số đó cùng mã bảo mật về ngân hàng. Trong vài giây, ngân hàng phải quyết định đây có thật là An hay không.',
      lookFor: ['Thẻ thật được cất giấu ở đâu.', 'Vì sao mã bảo mật được kiểm tra trước khi ai đó nhìn vào số dư của cô.', 'Người gõ chậm và kẻ gian có điểm gì chung.'],
    },
    B: {
      chapter: 'Người gác cổng: chỉ gây phiền khi đáng',
      scene:
        'Khách hàng An mua một chiếc túi trên mạng bằng thẻ thường ngày. Trang thanh toán gửi giao dịch kèm điểm rủi ro, từ 0 (bình thường) đến 100 (báo động). Ngân hàng có một tích tắc để quyết định: cho qua luôn, chặn lại và gửi mã về điện thoại, hay từ chối ngay tại cửa.',
      lookFor: ['Ai được cho qua mà không phải trả lời câu hỏi nào.', 'Điều gì xảy ra trên điện thoại của khách.', 'Ai chịu thiệt nếu giao dịch đã qua bước kiểm tra này hóa ra là gian lận.'],
    },
    C: {
      chapter: 'Trả làm bốn kỳ: tin tưởng, nhưng có phương án B',
      scene:
        'Khách hàng An muốn mua áo khoác nhưng muốn trả làm bốn lần. Cô đăng ký Mua trước Trả sau ngay tại trang thanh toán. Ngân hàng phải quyết định có tin cô với một kế hoạch trả góp hay không, và làm gì với đơn hàng nếu câu trả lời là không.',
      lookFor: ['Hai bài kiểm tra mà một kế hoạch phải vượt qua.', 'Một lời “không” vẫn có thể giữ được đơn hàng như thế nào.', 'Một kế hoạch được duyệt vẫn có thể thất bại ra sao.'],
    },
    D: {
      chapter: 'Ca đêm: ba bộ sổ có khớp nhau không?',
      scene:
        'Bây giờ là 23:00. Các cửa hàng đã đóng cửa, và mọi giao dịch được duyệt hôm nay đang chờ ở ô Đã duyệt. Đêm nay ngân hàng phải chứng minh ba bộ hồ sơ độc lập khớp nhau cho từng giao dịch, và đưa những giao dịch không khớp vào tài khoản treo.',
      lookFor: ['Ba bộ hồ sơ, và ai giữ từng bộ.', 'Đâu là sai số vụn vặt và đâu là sai lệch thật.', 'Vì sao giao dịch lệch được treo lại, không bao giờ bị ép cho khớp.'],
    },
    E: {
      chapter: 'Chuyển khoản tức thì: không thẻ, không có cơ hội thứ hai',
      scene:
        'Mia đang ăn tối. Cô quét mã QR trên hóa đơn và bấm gửi: $18.50 cho một người bạn dùng ngân hàng khác. Không có thẻ và không có chu kỳ đêm để sửa sai: ngay khi ngân hàng đồng ý, tiền đã đi. Vì vậy ngân hàng đọc từng dòng thông điệp mà ứng dụng của cô gửi đi, trước cả khi nhìn vào số dư.',
      lookFor: ['Những trường mà cổng thanh toán bắt buộc phải có.', 'Vì sao một thông điệp lỗi không bao giờ chạm tới sổ cái.', '“Tức thì” lấy đi điều gì của ngân hàng.'],
    },
    F: {
      chapter: 'Sau giao dịch: tiền này dành cho ai, và ai chịu nếu có sự cố?',
      scene:
        'Chương này có hai câu chuyện. Trong câu chuyện thứ nhất, một khách hàng lâu năm chuyển $25,000.00 và hệ thống sàng lọc cho rằng tên anh giống một người trong danh sách cấm vận. Trong câu chuyện thứ hai, một chủ thẻ nói rằng một giao dịch không phải do cô thực hiện. Chọn ví dụ bắt đầu bằng “AML:” hoặc “Dispute:” để đi qua sơ đồ thật.',
      lookFor: ['Khác biệt giữa một nghi vấn và một kết luận.', 'Chuyên viên tin vào bằng chứng nào.', 'Vì sao thời hạn khiếu nại được kiểm tra trước trách nhiệm.'],
    },
  },
  ui: {
    tour: 'Học & Khám phá',
    chapter: 'Chương',
    thisRun: 'Lần chạy này',
    lookFor: 'Hãy chú ý',
    example: 'Giao dịch mẫu',
    start: 'Bắt đầu tham quan',
    startHint: 'Mã giao dịch bắt đầu di chuyển. Nó dừng ở mỗi quầy để giải thích, và ở mỗi điểm quyết định để hỏi bạn một câu.',
    stepOf: (n, total) => `Bước ${n} / ${total}`,
    whatHappens: 'Chuyện gì đang diễn ra ở đây?',
    forThisPayment: 'Với giao dịch này',
    takeaway: 'Điều cần nhớ',
    canGoWrong: 'Điều gì có thể sai',
    thinkOfItLike: 'Hãy hình dung như',
    previous: 'Bước trước',
    next: 'Bước tiếp',
    autoPlay: 'Tự chạy',
    pause: 'Tạm dừng',
    resume: 'Tiếp tục',
    replay: 'Chạy lại',
    exit: 'Thoát hướng dẫn',
    ruleLab: 'Mở phòng thử quy tắc',
    speedLocked: 'Tốc độ khóa ở 0.25×',
    quizTitle: 'Kiểm tra nhanh',
    quizAsk: 'Trả lời để mã giao dịch đi tiếp.',
    quizLocked: 'Trả lời câu hỏi để đi tiếp.',
    correct: 'Chính xác!',
    notQuite: 'Chưa đúng.',
    rightAnswer: 'Đáp án',
    tourDone: 'Kết thúc chuyến tham quan',
    score: (right, total) => `Kiểm tra nhanh: đúng ${right} / ${total}`,
    noQuestions: 'Lần chạy này không có câu hỏi kiểm tra',
  },
};

export const WALK_COPY: Localized<WalkBook> = { en: EN, vi: VI };

export const walkUi = (): WalkUi => pick(WALK_COPY).ui;
export const sceneOf = (process: ProcessId): Scene => pick(WALK_COPY).scenes[process];
