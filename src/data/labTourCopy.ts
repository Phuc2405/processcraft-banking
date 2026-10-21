/**
 * Everything the Build Lab guided tour says that is not about one particular payment: the opening scene of every level,
 * what each kind of desk does, the headings, the button labels. One `Localized` table, so a second language is one more
 * entry and not a change to any component or to the code that builds a tour.
 *
 * The scenes of levels 1 to 4 are the same stories the Living Bank tells (see walkthroughCopy.ts), so they are not
 * written twice.
 */

import { pick, type Localized } from '../i18n/locale';
import type { BankingCapability, Id, Outcome } from '../types/processLearning';
import { sceneOf, WALK_COPY, type Scene, type WalkUi } from './walkthroughCopy';

export type { Scene };

/** What a desk or event says about itself when the token stops there. */
export interface StepText {
  title: string;
  /** What is happening here, in a few plain sentences. */
  what: string;
  /** The one thing to take away. */
  why: string;
  /** What can go wrong at this box. */
  fails: string[];
}

export interface LabUi extends WalkUi {
  /** The name of the tour, in the header of the opening card and the bar. */
  labTour: string;
  /** Where the diagram on screen comes from. */
  exampleSource: string;
  mineSource: string;
  /** On the opening card, when the learner's own diagram can be walked. */
  mineBlurb: string;
  /** Under the launcher, while the learner has placed nothing. */
  mineEmpty: string;
  /** Warning on the opening card of a worked example. */
  spoiler: string;
  /** Buttons that open the tour from the level brief. */
  launchTitle: string;
  launchBlurb: string;
  launchExample: string;
  launchMine: string;
  /** Shown when the learner's own diagram cannot be walked. */
  mineProblem: (why: string) => string;
  testLabel: string;
  levelOf: (label: string, title: string) => string;
  verdictTitle: string;
  /** The panel that lists the lines a payment posted to the ledger. */
  ledgerTitle: string;
  /** What kind of box a step is, shown beside its number. */
  kinds: Record<'start' | 'task' | 'gateway' | 'end', string>;
  /** Heading above the reason a diagram could not be walked to the end. */
  stuckTitle: string;
  /** Button on the closing card. */
  replayTour: string;
  /** Short name of the payment being followed, in the bar. */
  following: string;
  /** Headings above the XML message on the start and gateway cards of a bank-to-bank payment. */
  messageArrives: string;
  messageStamped: string;
  /** On the closing card: does the end the payment reached match what the test expects? */
  matchesTest: string;
  missesTest: string;
  /** Shown while the token is still travelling to the next box. */
  onItsWay: (title: string) => string;
  /** The stage and step of the level, shown on the opening card. */
  stageOf: (stage: number, title: string) => string;
}

export interface FactLabels {
  [fact: string]: string;
}

interface LabBook {
  ui: LabUi;
  scenes: Record<Id, Scene>;
  /** Fact name to the label shown on a step ("ledgerDecision" becomes "Ledger"). */
  facts: FactLabels;
  capabilities: Record<BankingCapability, StepText>;
  start: StepText;
  startA2a: StepText;
  gateway: StepText;
  end: StepText;
  /** One line of takeaway per outcome, shown on the End event. */
  outcomes: Record<Outcome, string>;
}

const EN: LabBook = {
  ui: {
    ...WALK_COPY.en.ui,
    labTour: 'Guided tour',
    exampleSource: 'Worked example: a model answer',
    mineSource: 'Your diagram',
    mineBlurb: 'The tour follows your own diagram, run exactly as the grader would run it.',
    mineEmpty: 'Place a desk on the canvas first, or tour the worked example.',
    spoiler: 'This tour follows a complete model answer to the level. If you would rather solve it yourself first, leave now and come back when you have tried.',
    launchTitle: 'Guided tour',
    launchBlurb: 'Follow one payment through the process, desk by desk, with a question at every decision.',
    launchExample: 'Tour the worked example',
    launchMine: 'Walk through my diagram',
    mineProblem: (why) => `Your diagram cannot be walked yet: ${why}`,
    testLabel: 'Payment',
    levelOf: (label, title) => `Level ${label}: ${title}`,
    verdictTitle: 'How it ended',
    ledgerTitle: 'What the books recorded',
    kinds: { start: 'Start event', task: 'Desk', gateway: 'Decision', end: 'End event' },
    stuckTitle: 'Where it got stuck',
    replayTour: 'Replay the tour',
    following: 'Following',
    messageArrives: 'The message as it arrives (pacs.008)',
    messageStamped: 'The same message, stamped with the rail',
    matchesTest: 'This is the end the test expects.',
    missesTest: 'This is not the end the test expects.',
    onItsWay: (title) => `On its way to “${title}”…`,
    stageOf: (stage, title) => `Stage ${stage}: ${title}`,
    start: 'Start the tour',
    startHint: 'The token sets off. It stops at every desk to explain, and at every decision to ask you a question.',
  },

  scenes: {
    lvl_05_first_swipes: {
      chapter: 'The first swipe: is the money there?',
      scene:
        'Customer An taps her card on a till. The jacket costs $500.00. In a second the bank must answer one question: can An pay for it? If yes, the bank puts a hold on the money and the till says approved. If not, the till must say so clearly, and the bank must not keep a hold on money that was never spent.',
      lookFor: ['The one fact the ledger check writes for the next decision.', 'Why a decision needs a default wire, even when you can name every case.', 'What a reason code does for a customer standing at the till.'],
    },
    lvl_06_card_testing: {
      chapter: 'Midnight: bots, and a customer who just wants to renew',
      scene:
        'It is 00:12. A bot has a list of stolen card numbers and is trying each one for $1.00, over and over, to find which still work. In the same minute An is renewing a $12.00 subscription. Both arrive at the same gate. The bank must stop the bot without making An fill in a one-time code, because every extra step sends a share of honest customers away.',
      lookFor: ['The two signs that mark a burst of card-testing.', 'Why the bot is stopped before the expensive checks.', 'Which payments are small enough to skip the code.'],
    },
    lvl_07_a2a_iso20022: {
      chapter: 'The lifeblood network: moving money between banks',
      scene:
        'Not every payment is a card. Here a company pays its suppliers and its staff straight from account to account. The instruction reaches the bank as a pacs.008 message, a standard envelope with the sender’s bank, the receiver’s bank, the amount and a reference that travels with the payment. The gateway reads it, checks it, and picks a rail: instant, or RTGS for big amounts.',
      lookFor: ['The four fields every message must carry.', 'Where the line between instant and RTGS falls.', 'Why payroll jumps the queue and the reserve.'],
    },
    lvl_08_fx_breaks: {
      chapter: 'The 23:59 night run: fifteen breaks and a currency',
      scene:
        'It is a minute to midnight and fifteen foreign-currency purchases will not reconcile. Each was booked in dollars at one exchange rate and settled by the card scheme at another. The gap is real money, but it is not a mistake: it is the exchange rate. The bank must park each gap in the right FX suspense account and tell a gain from a loss.',
      lookFor: ['What makes a gap an FX difference rather than an error.', 'Which way is a gain and which way is a loss.', 'The breaks that look like FX and are not.'],
    },
    lvl_09_sanctions_storm: {
      chapter: 'Sanctions storm: the VIP who is not on the list',
      scene:
        'A VIP client of fifteen years sends a large payment. The anti-money-laundering screen lights up: his name is a close match to someone on a sanctions list. If the bank freezes him, it loses its best customer. If it waves him through and he is the man on the list, it breaks the law. The way out is the audit log: a verified date of birth and nationality settle it.',
      lookFor: ['Why a screening hit is a lead, not a verdict.', 'Which facts the investigator trusts and which it ignores.', 'What the bank does when the evidence is not enough.'],
    },
    lvl_10_chargeback_warfare: {
      chapter: 'Chargeback warfare: who pays when a customer disputes?',
      scene:
        'An says the goods never arrived and asks her bank for her money back. That starts a dispute: the bank asks the shop for the receipt, takes the money back, the shop answers, and if neither side gives in the card scheme steps in. But before any of that, two questions decide who can win at all: is the claim still in time, and did the purchase pass the 3-D Secure check?',
      lookFor: ['The four stages of a dispute, in order.', 'Why a 3-D Secure purchase can move the loss onto the bank.', 'The one thing that makes a claim dead on arrival.'],
    },
  },

  facts: {
    tokenStatus: 'Token',
    fundingSource: 'Funded by',
    fpanLast4: 'Real card ends',
    dcvvStatus: 'dCVV',
    threeDsPath: '3DS path',
    authenticated: 'Authenticated',
    liabilityShift: 'Fraud liability',
    ledgerDecision: 'Ledger',
    authHoldMinor: 'Hold placed',
    reconStatus: 'Reconciliation',
    reconVarianceMinor: 'Largest gap',
    reconCause: 'Cause of the gap',
    fxDirection: 'FX difference',
    underwritingScore: 'Score',
    downPaymentPct: 'Down payment',
    bnplDecision: 'Underwriting',
    installment1Minor: 'First instalment',
    installmentAmountMinor: 'Then 3 of',
    a2aValid: 'Message valid',
    a2aRail: 'Rail',
    a2aPriority: 'Priority',
    a2aQueue: 'Queue',
    a2aLiquidity: 'Liquidity',
    amlStatus: 'Screening result',
    amlMatchScore: 'Best name match',
    amlList: 'List',
    amlStructuring: 'Structuring',
    caseVerdict: 'Verdict',
    caseEvidenceCount: 'Evidence items',
    disputeWindow: 'Filing window',
    disputeLiability: 'Liability',
    disputeNext: 'Next stage',
  },

  capabilities: {
    TOKEN_VAULT: {
      title: 'Token Vault: the real card behind the fake number',
      what: 'A virtual card number is a stand-in. The vault looks it up and finds the real card behind it, so the shop never sees the real number and the bank still knows whose money this is.',
      why: 'A number the vault has never issued is not a card at all: stop here, before any money is looked at.',
      fails: ['The number was never issued, so the vault raises an error. If nothing catches that error the payment is stuck.', 'The virtual card was suspended by its owner, and the payment should not go on.'],
    },
    DCVV_VERIFIER: {
      title: 'dCVV Verifier: a security code that expires',
      what: 'A dynamic CVV is a three-digit code that changes every minute. The desk compares the code typed with the one the vault expects, and checks that it is still fresh.',
      why: 'An old code and a wrong code are both a decline: a thief with last hour’s code gets nothing.',
      fails: ['A slow typist is declined at the edge of the window.', 'A window that is too long gives a thief time to use a stolen code.'],
    },
    THREE_DS_EVALUATOR: {
      title: '3-D Secure: friction only where it pays',
      what: 'The bank scores how risky the payment looks. A low score goes straight through, a middle score gets a one-time code on the customer’s phone, and a high score is turned away.',
      why: 'A payment that passes 3-D Secure shifts the fraud liability to the bank that approved it, so this check decides who pays if it turns out to be fraud.',
      fails: ['Challenge too many customers and honest ones abandon their baskets.', 'Challenge too few and fraud walks through.'],
    },
    CORE_LEDGER_CHECK: {
      title: 'Core Ledger Check: is the money there?',
      what: 'The core ledger is the bank’s official record of every balance. The desk compares the amount with what the customer can spend. If it is enough, it puts a hold on the money.',
      why: 'The check only writes a fact: sufficient or not. The decision to approve or decline is made by the next gateway.',
      fails: ['Checking the wrong amount: on a Pay-in-4 plan only the first instalment is due today.', 'Running it for a payment that will be declined for another reason wastes a call to the core system.'],
    },
    RECON_DESK: {
      title: 'Reconciliation Desk: do three sets of books agree?',
      what: 'The bank’s ledger, the card scheme’s clearing file and the shop’s bank each hold their own record of the payment. The desk lines the three up and allows a small tolerance for rounding.',
      why: 'A gap is never forced to match. It is parked in a suspense account until someone finds the cause.',
      fails: ['A tolerance too wide matches a real mistake away.', 'A tolerance too tight parks rounding dust and buries the team in false breaks.'],
    },
    BNPL_UNDERWRITER: {
      title: 'Underwriter: trust, with a plan B',
      what: 'Buy Now Pay Later lets the customer pay in four parts. The underwriter checks the customer’s score and down payment against the bank’s minimums before offering a plan.',
      why: 'A “no” does not have to lose the sale: the customer can still pay the full price by card.',
      fails: ['Approve too freely and instalments go unpaid.', 'Decline with no fallback and the sale is lost.'],
    },
    A2A_GATEWAY: {
      title: 'A2A Payment Gateway: read the message, pick the rail',
      what: 'The gateway reads the pacs.008 message and checks its format: the payment reference, both banks’ BICs and the settlement amount. It then picks the rail, looks at the queue, and checks that there is enough cash to send the payment.',
      why: 'A payment is only as good as its message. A bad message is rejected here, before it can reach the other bank.',
      fails: ['The instant-rail limit is set too high and a large payment goes down a rail that cannot carry it.', 'Payroll is held in the same queue as everything else and arrives late.'],
    },
    AML_SCREENING: {
      title: 'AML Screening: names, lists and patterns',
      what: 'The desk compares the customer’s name with sanctions and politically-exposed-person lists, allowing for spelling differences, and looks through recent cash deposits for a pattern of structuring.',
      why: 'A name hit is a lead, not a verdict. Someone has to look before the bank freezes a customer or lets one go.',
      fails: ['A threshold too low floods the team with false positives.', 'A threshold too high lets a real match slip through.'],
    },
    CASE_INVESTIGATION: {
      title: 'Case Investigation: what the audit log proves',
      what: 'The investigator opens the audit log and compares the verified date of birth and nationality with the person on the list. Unverified entries are ignored.',
      why: 'The evidence has three possible answers: not him, him, or not enough to say. The last one must not be rounded up to the first.',
      fails: ['Trusting an unverified entry clears a customer on a claim anyone could have typed.', 'Sending every customer here keeps honest ones waiting for nothing.'],
    },
    CHARGEBACK_DESK: {
      title: 'Disputes Desk: where is the case, and who pays?',
      what: 'The desk works out the stage of the dispute from the merchant’s evidence, whether the claim is still in time, and who carries the loss. A fraud claim on a purchase that passed 3-D Secure is the issuer’s loss.',
      why: 'Two things end a claim before it starts: it is too old, or the liability sits with the bank.',
      fails: ['Counting the days by hand instead of asking the desk.', 'Charging back a purchase the scheme says the bank must absorb.'],
    },
  },

  start: {
    title: 'The payment arrives',
    what: 'Every payment starts here. The token that will travel through the diagram carries the facts about this payment: the amount, the card, and anything else the bank already knows.',
    why: 'Facts that arrive with the payment can be read by any decision. Facts a desk writes can only be read after that desk has run.',
    fails: ['Nothing is wired to the start event, so the payment goes nowhere.'],
  },
  startA2a: {
    title: 'A pacs.008 message arrives',
    what: 'An account-to-account instruction reaches the bank as an ISO 20022 pacs.008 message. It names the sender’s bank, the receiver’s bank, the amount, and a reference that stays with the payment until it is delivered.',
    why: 'Because every bank reads the same message the same way, payments can cross from one bank to another without anyone retyping them.',
    fails: ['A field is missing or malformed, and the gateway has to reject the whole message.'],
  },
  gateway: {
    title: 'Decision: which wire does this payment take?',
    what: 'A decision gateway reads facts the earlier desks wrote and sends the payment down exactly one wire. It tries the wires in order and takes the first whose rule is true. If none is, it takes the default.',
    why: 'Order matters, and so does the default: without a default wire a payment nobody planned for has nowhere to go.',
    fails: ['Two rules are both true and the wrong one is listed first.', 'The rule reads a fact no desk has written yet, so it can never be true.'],
  },
  end: {
    title: 'The payment ends',
    what: 'An End event is where the journey stops and the bank reports the outcome. The outcome and its reason code decide what the customer is told and what the books record.',
    why: 'Every payment must end somewhere, with an outcome that someone can act on.',
    fails: ['A decline with no reason code leaves the customer guessing.'],
  },

  outcomes: {
    APPROVED: 'Approved: the money moves, and the books record it.',
    DECLINED: 'Declined: the customer is told no. Nothing should be left holding their money.',
    ROUTED_TO_SUSPENSE: 'Parked: the payment is held until a person or a later process decides.',
    CHALLENGE_REQUIRED: 'More information is needed before the bank can decide.',
  },
};

const VI: LabBook = {
  ui: {
    ...WALK_COPY.vi.ui,
    labTour: 'Tham quan có hướng dẫn',
    exampleSource: 'Ví dụ mẫu: một lời giải chuẩn',
    mineSource: 'Sơ đồ của bạn',
    mineBlurb: 'Chuyến tham quan đi theo chính sơ đồ của bạn, chạy đúng như cách hệ thống chấm điểm chạy.',
    mineEmpty: 'Hãy đặt một quầy lên sơ đồ trước, hoặc tham quan ví dụ mẫu.',
    spoiler: 'Chuyến tham quan này đi theo một lời giải hoàn chỉnh của cấp độ. Nếu bạn muốn tự giải trước, hãy rời đi và quay lại sau khi đã thử.',
    launchTitle: 'Tham quan có hướng dẫn',
    launchBlurb: 'Theo chân một giao dịch qua quy trình, từng quầy một, với một câu hỏi ở mỗi điểm quyết định.',
    launchExample: 'Tham quan ví dụ mẫu',
    launchMine: 'Đi qua sơ đồ của tôi',
    mineProblem: (why) => `Chưa thể đi qua sơ đồ của bạn: ${why}`,
    testLabel: 'Giao dịch',
    levelOf: (label, title) => `Cấp ${label}: ${title}`,
    verdictTitle: 'Kết cục',
    ledgerTitle: 'Sổ sách đã ghi gì',
    kinds: { start: 'Sự kiện bắt đầu', task: 'Quầy xử lý', gateway: 'Điểm quyết định', end: 'Sự kiện kết thúc' },
    stuckTitle: 'Bị kẹt ở đâu',
    replayTour: 'Xem lại chuyến tham quan',
    following: 'Đang theo dõi',
    messageArrives: 'Thông điệp khi đến (pacs.008)',
    messageStamped: 'Cùng thông điệp, đã được đóng dấu kênh thanh toán',
    matchesTest: 'Đây đúng là kết cục bài kiểm tra mong đợi.',
    missesTest: 'Đây không phải kết cục bài kiểm tra mong đợi.',
    onItsWay: (title) => `Đang đi tới “${title}”…`,
    stageOf: (stage, title) => `Giai đoạn ${stage}: ${title}`,
    start: 'Bắt đầu tham quan',
    startHint: 'Mã giao dịch bắt đầu di chuyển. Nó dừng ở mỗi quầy để giải thích, và ở mỗi điểm quyết định để hỏi bạn một câu.',
  },

  scenes: {
    lvl_05_first_swipes: {
      chapter: 'Lần quẹt đầu tiên: tiền có đủ không?',
      scene:
        'Khách hàng An chạm thẻ vào máy POS. Chiếc áo khoác giá $500.00. Trong một giây ngân hàng phải trả lời một câu hỏi: An có trả được không? Nếu có, ngân hàng khoanh giữ số tiền và máy báo đã duyệt. Nếu không, máy phải báo rõ ràng, và ngân hàng không được giữ khoanh tiền cho một khoản không hề được chi.',
      lookFor: ['Một dữ kiện duy nhất mà bước kiểm tra sổ cái ghi lại cho quyết định tiếp theo.', 'Vì sao điểm quyết định cần một nhánh mặc định, kể cả khi bạn kể tên được mọi trường hợp.', 'Mã lý do giúp gì cho khách hàng đang đứng ở quầy.'],
    },
    lvl_06_card_testing: {
      chapter: 'Nửa đêm: bot, và một khách chỉ muốn gia hạn dịch vụ',
      scene:
        'Bây giờ là 00:12. Một con bot có danh sách số thẻ bị đánh cắp và thử từng thẻ với $1.00, lặp đi lặp lại, để tìm thẻ nào còn dùng được. Cùng phút đó An đang gia hạn gói đăng ký $12.00. Cả hai cùng đến một cổng. Ngân hàng phải chặn con bot mà không bắt An nhập mã OTP, vì mỗi bước thêm vào làm một phần khách hàng thật bỏ đi.',
      lookFor: ['Hai dấu hiệu nhận biết một đợt dò thẻ.', 'Vì sao con bot bị chặn trước các bước kiểm tra tốn kém.', 'Những giao dịch nào đủ nhỏ để bỏ qua mã OTP.'],
    },
    lvl_07_a2a_iso20022: {
      chapter: 'Mạch máu của hệ thống: chuyển tiền giữa các ngân hàng',
      scene:
        'Không phải giao dịch nào cũng dùng thẻ. Ở đây một công ty trả tiền cho nhà cung cấp và nhân viên trực tiếp từ tài khoản sang tài khoản. Lệnh đến ngân hàng dưới dạng thông điệp pacs.008, một phong bì chuẩn ghi ngân hàng gửi, ngân hàng nhận, số tiền và mã tham chiếu đi kèm giao dịch. Cổng thanh toán đọc, kiểm tra và chọn kênh: tức thì, hoặc RTGS cho khoản lớn.',
      lookFor: ['Bốn trường mà mọi thông điệp phải có.', 'Ranh giới giữa kênh tức thì và RTGS nằm ở đâu.', 'Vì sao lương được ưu tiên vượt hàng chờ và quỹ dự trữ.'],
    },
    lvl_08_fx_breaks: {
      chapter: 'Ca đêm 23:59: mười lăm sai lệch và một đồng ngoại tệ',
      scene:
        'Còn một phút nữa là nửa đêm và mười lăm giao dịch ngoại tệ không đối soát được. Mỗi giao dịch được ghi bằng đô la theo một tỷ giá và được tổ chức thẻ quyết toán theo tỷ giá khác. Khoảng chênh là tiền thật, nhưng không phải lỗi: đó là tỷ giá. Ngân hàng phải đưa từng khoản chênh vào đúng tài khoản treo ngoại hối và phân biệt lãi với lỗ.',
      lookFor: ['Điều gì khiến một khoản chênh là chênh lệch tỷ giá thay vì lỗi.', 'Chiều nào là lãi và chiều nào là lỗ.', 'Những sai lệch trông giống tỷ giá nhưng không phải.'],
    },
    lvl_09_sanctions_storm: {
      chapter: 'Bão cấm vận: khách VIP không có trong danh sách',
      scene:
        'Một khách VIP mười lăm năm gửi một khoản thanh toán lớn. Hệ thống phòng chống rửa tiền bật cảnh báo: tên ông gần giống một người trong danh sách cấm vận. Nếu ngân hàng phong tỏa, họ mất khách hàng tốt nhất. Nếu cho qua mà ông đúng là người trong danh sách, ngân hàng vi phạm pháp luật. Lối thoát là nhật ký kiểm toán: ngày sinh và quốc tịch đã xác minh sẽ giải quyết vấn đề.',
      lookFor: ['Vì sao một kết quả trùng khớp sàng lọc chỉ là manh mối, không phải phán quyết.', 'Điều tra viên tin vào dữ kiện nào và bỏ qua dữ kiện nào.', 'Ngân hàng làm gì khi bằng chứng không đủ.'],
    },
    lvl_10_chargeback_warfare: {
      chapter: 'Cuộc chiến tra soát: ai trả tiền khi khách khiếu nại?',
      scene:
        'An nói hàng chưa bao giờ đến và yêu cầu ngân hàng hoàn tiền. Điều đó mở ra một vụ tra soát: ngân hàng yêu cầu cửa hàng xuất trình hóa đơn, thu hồi tiền, cửa hàng phản hồi, và nếu không bên nào nhượng bộ thì tổ chức thẻ sẽ phân xử. Nhưng trước hết, hai câu hỏi quyết định ai có thể thắng: khiếu nại còn trong hạn không, và giao dịch có qua kiểm tra 3-D Secure không?',
      lookFor: ['Bốn giai đoạn của một vụ tra soát, theo thứ tự.', 'Vì sao giao dịch đã qua 3-D Secure có thể chuyển tổn thất sang ngân hàng.', 'Một điều duy nhất khiến khiếu nại bị bác ngay từ đầu.'],
    },
  },

  facts: {
    tokenStatus: 'Token',
    fundingSource: 'Nguồn tiền',
    fpanLast4: 'Thẻ thật đuôi',
    dcvvStatus: 'dCVV',
    threeDsPath: 'Luồng 3DS',
    authenticated: 'Đã xác thực',
    liabilityShift: 'Trách nhiệm gian lận',
    ledgerDecision: 'Sổ cái',
    authHoldMinor: 'Số tiền khoanh giữ',
    reconStatus: 'Đối soát',
    reconVarianceMinor: 'Chênh lệch lớn nhất',
    reconCause: 'Nguyên nhân chênh lệch',
    fxDirection: 'Chênh lệch tỷ giá',
    underwritingScore: 'Điểm',
    downPaymentPct: 'Trả trước',
    bnplDecision: 'Thẩm định',
    installment1Minor: 'Kỳ đầu tiên',
    installmentAmountMinor: 'Sau đó 3 kỳ mỗi kỳ',
    a2aValid: 'Thông điệp hợp lệ',
    a2aRail: 'Kênh',
    a2aPriority: 'Ưu tiên',
    a2aQueue: 'Hàng chờ',
    a2aLiquidity: 'Thanh khoản',
    amlStatus: 'Kết quả sàng lọc',
    amlMatchScore: 'Mức trùng tên cao nhất',
    amlList: 'Danh sách',
    amlStructuring: 'Chia nhỏ giao dịch',
    caseVerdict: 'Kết luận',
    caseEvidenceCount: 'Số bằng chứng',
    disputeWindow: 'Thời hạn khiếu nại',
    disputeLiability: 'Trách nhiệm',
    disputeNext: 'Giai đoạn tiếp',
  },

  capabilities: {
    TOKEN_VAULT: {
      title: 'Kho Token: thẻ thật đằng sau số giả',
      what: 'Số thẻ ảo là số thay thế. Kho token tra cứu và tìm ra thẻ thật đằng sau nó, nên cửa hàng không bao giờ thấy số thật mà ngân hàng vẫn biết đây là tiền của ai.',
      why: 'Một số mà kho chưa từng phát hành thì không phải là thẻ: dừng ở đây, trước khi xem tới tiền.',
      fails: ['Số chưa từng được phát hành nên kho báo lỗi. Nếu không có gì bắt lỗi đó thì giao dịch bị kẹt.', 'Thẻ ảo đã bị chủ thẻ tạm ngưng, và giao dịch không nên tiếp tục.'],
    },
    DCVV_VERIFIER: {
      title: 'Bộ kiểm tra dCVV: mã bảo mật có hạn dùng',
      what: 'CVV động là mã ba chữ số thay đổi mỗi phút. Quầy so sánh mã được nhập với mã kho token mong đợi, và kiểm tra mã còn mới.',
      why: 'Mã cũ và mã sai đều bị từ chối: kẻ gian cầm mã của một giờ trước sẽ không được gì.',
      fails: ['Người gõ chậm bị từ chối ở sát mép cửa sổ thời gian.', 'Cửa sổ quá dài cho kẻ gian thời gian dùng mã bị đánh cắp.'],
    },
    THREE_DS_EVALUATOR: {
      title: '3-D Secure: chỉ gây phiền khi đáng',
      what: 'Ngân hàng chấm điểm mức rủi ro của giao dịch. Điểm thấp đi thẳng, điểm trung bình nhận mã OTP trên điện thoại khách, điểm cao bị từ chối.',
      why: 'Giao dịch qua 3-D Secure chuyển trách nhiệm gian lận sang ngân hàng đã duyệt, nên bước này quyết định ai chịu nếu hóa ra là gian lận.',
      fails: ['Thử thách quá nhiều khách thì khách thật bỏ giỏ hàng.', 'Thử thách quá ít thì gian lận lọt qua.'],
    },
    CORE_LEDGER_CHECK: {
      title: 'Kiểm tra sổ cái lõi: tiền có đủ không?',
      what: 'Sổ cái lõi là hồ sơ chính thức của ngân hàng về mọi số dư. Quầy so sánh số tiền với số khách được phép chi. Nếu đủ, nó khoanh giữ số tiền đó.',
      why: 'Bước kiểm tra chỉ ghi một dữ kiện: đủ hay không. Quyết định duyệt hay từ chối do điểm quyết định tiếp theo đưa ra.',
      fails: ['Kiểm tra sai số tiền: với kế hoạch trả 4 kỳ, hôm nay chỉ phải trả kỳ đầu.', 'Chạy kiểm tra cho một giao dịch sẽ bị từ chối vì lý do khác làm tốn một lần gọi hệ thống lõi.'],
    },
    RECON_DESK: {
      title: 'Quầy đối soát: ba bộ sổ có khớp không?',
      what: 'Sổ cái ngân hàng, tệp bù trừ của tổ chức thẻ và ngân hàng của cửa hàng mỗi bên giữ một bản ghi riêng về giao dịch. Quầy xếp ba bản ghi cạnh nhau và cho phép một biên sai số nhỏ do làm tròn.',
      why: 'Không bao giờ ép một khoản chênh cho khớp. Nó được đưa vào tài khoản treo cho tới khi có người tìm ra nguyên nhân.',
      fails: ['Biên sai số quá rộng làm một lỗi thật bị khớp mất.', 'Biên quá hẹp đưa cả sai số làm tròn vào tài khoản treo và nhấn chìm đội ngũ trong các sai lệch giả.'],
    },
    BNPL_UNDERWRITER: {
      title: 'Thẩm định: tin tưởng, nhưng có phương án B',
      what: 'Mua trước Trả sau cho khách trả làm bốn kỳ. Bộ phận thẩm định so điểm tín dụng và khoản trả trước của khách với mức tối thiểu của ngân hàng trước khi đưa ra kế hoạch.',
      why: 'Một lời “không” không nhất thiết làm mất đơn hàng: khách vẫn có thể trả đủ bằng thẻ.',
      fails: ['Duyệt quá dễ thì các kỳ trả góp không được thanh toán.', 'Từ chối mà không có phương án dự phòng thì mất đơn hàng.'],
    },
    A2A_GATEWAY: {
      title: 'Cổng thanh toán A2A: đọc thông điệp, chọn kênh',
      what: 'Cổng đọc thông điệp pacs.008 và kiểm tra định dạng: mã tham chiếu, mã BIC của hai ngân hàng và số tiền quyết toán. Sau đó nó chọn kênh, xem hàng chờ và kiểm tra có đủ tiền để gửi.',
      why: 'Một giao dịch chỉ tốt bằng thông điệp của nó. Thông điệp lỗi bị từ chối tại đây, trước khi tới ngân hàng bên kia.',
      fails: ['Hạn mức kênh tức thì đặt quá cao khiến khoản lớn đi vào kênh không chịu nổi.', 'Lương bị giữ chung hàng chờ với mọi thứ khác và đến muộn.'],
    },
    AML_SCREENING: {
      title: 'Sàng lọc AML: tên, danh sách và mẫu hình',
      what: 'Quầy so tên khách hàng với danh sách cấm vận và danh sách người có ảnh hưởng chính trị, có tính tới khác biệt chính tả, và xem các lần nộp tiền mặt gần đây để tìm dấu hiệu chia nhỏ giao dịch.',
      why: 'Trùng tên là manh mối, không phải phán quyết. Phải có người xem xét trước khi ngân hàng phong tỏa hay cho qua một khách hàng.',
      fails: ['Ngưỡng quá thấp làm đội ngũ ngập trong cảnh báo sai.', 'Ngưỡng quá cao để một trường hợp trùng thật lọt qua.'],
    },
    CASE_INVESTIGATION: {
      title: 'Điều tra hồ sơ: nhật ký kiểm toán chứng minh điều gì',
      what: 'Điều tra viên mở nhật ký kiểm toán và so ngày sinh, quốc tịch đã xác minh với người trong danh sách. Các mục chưa xác minh bị bỏ qua.',
      why: 'Bằng chứng có ba khả năng: không phải người đó, đúng người đó, hoặc chưa đủ để kết luận. Khả năng cuối không được làm tròn thành khả năng đầu.',
      fails: ['Tin vào mục chưa xác minh là giải tỏa khách hàng dựa trên một thông tin ai cũng có thể gõ vào.', 'Đưa mọi khách hàng vào đây khiến khách thật phải chờ vô ích.'],
    },
    CHARGEBACK_DESK: {
      title: 'Quầy tra soát: vụ việc đang ở đâu, và ai chịu?',
      what: 'Quầy xác định giai đoạn tra soát từ bằng chứng của cửa hàng, khiếu nại còn trong hạn không, và ai chịu tổn thất. Khiếu nại gian lận với giao dịch đã qua 3-D Secure là tổn thất của ngân hàng phát hành.',
      why: 'Hai điều chấm dứt khiếu nại trước khi bắt đầu: quá hạn, hoặc trách nhiệm thuộc về ngân hàng.',
      fails: ['Tự đếm ngày bằng tay thay vì hỏi quầy.', 'Tra soát một giao dịch mà tổ chức thẻ quy định ngân hàng phải tự chịu.'],
    },
  },

  start: {
    title: 'Giao dịch đến',
    what: 'Mọi giao dịch bắt đầu ở đây. Mã giao dịch đi qua sơ đồ mang theo các dữ kiện về giao dịch: số tiền, thẻ, và mọi điều ngân hàng đã biết.',
    why: 'Dữ kiện đến cùng giao dịch có thể được mọi điểm quyết định đọc. Dữ kiện do một quầy ghi chỉ đọc được sau khi quầy đó đã chạy.',
    fails: ['Không có gì nối với sự kiện bắt đầu, nên giao dịch không đi đâu cả.'],
  },
  startA2a: {
    title: 'Một thông điệp pacs.008 đến',
    what: 'Lệnh chuyển tài khoản sang tài khoản đến ngân hàng dưới dạng thông điệp ISO 20022 pacs.008. Nó ghi ngân hàng gửi, ngân hàng nhận, số tiền và mã tham chiếu đi cùng giao dịch cho tới khi được giao.',
    why: 'Vì mọi ngân hàng đọc cùng một thông điệp theo cùng một cách, giao dịch có thể đi từ ngân hàng này sang ngân hàng khác mà không ai phải gõ lại.',
    fails: ['Một trường bị thiếu hoặc sai định dạng, và cổng phải từ chối toàn bộ thông điệp.'],
  },
  gateway: {
    title: 'Quyết định: giao dịch này đi nhánh nào?',
    what: 'Điểm quyết định đọc các dữ kiện mà quầy trước đã ghi và đưa giao dịch vào đúng một nhánh. Nó thử các nhánh theo thứ tự và chọn nhánh đầu tiên có quy tắc đúng. Nếu không nhánh nào đúng, nó đi nhánh mặc định.',
    why: 'Thứ tự quan trọng, và nhánh mặc định cũng vậy: thiếu nhánh mặc định, một giao dịch ngoài dự tính không có chỗ để đi.',
    fails: ['Hai quy tắc cùng đúng và quy tắc sai được xếp trước.', 'Quy tắc đọc một dữ kiện chưa quầy nào ghi, nên không bao giờ đúng.'],
  },
  end: {
    title: 'Giao dịch kết thúc',
    what: 'Sự kiện kết thúc là nơi hành trình dừng lại và ngân hàng báo kết quả. Kết quả cùng mã lý do quyết định khách được báo gì và sổ sách ghi gì.',
    why: 'Mọi giao dịch phải kết thúc ở đâu đó, với một kết quả có thể hành động được.',
    fails: ['Từ chối mà không có mã lý do khiến khách phải đoán.'],
  },

  outcomes: {
    APPROVED: 'Đã duyệt: tiền dịch chuyển và sổ sách ghi nhận.',
    DECLINED: 'Từ chối: khách được báo không. Không được để lại khoản khoanh giữ nào trên tiền của họ.',
    ROUTED_TO_SUSPENSE: 'Treo lại: giao dịch được giữ cho tới khi một người hoặc một quy trình sau quyết định.',
    CHALLENGE_REQUIRED: 'Cần thêm thông tin trước khi ngân hàng có thể quyết định.',
  },
};

export const LAB_COPY: Localized<LabBook> = { en: EN, vi: VI };

const book = (): LabBook => pick(LAB_COPY);

export const labUi = (): LabUi => book().ui;

/** Levels 1 to 4 tell the same stories as the Living Bank's four lessons. */
const SHARED_SCENE: Readonly<Record<Id, 'A' | 'B' | 'C' | 'D'>> = {
  lvl_01_virtual_card_dcvv: 'A',
  lvl_02_three_ds_routing: 'B',
  lvl_03_eod_recon_suspense: 'D',
  lvl_04_bnpl_pay_in_4: 'C',
};

export function labScene(levelId: Id): Scene {
  const shared = SHARED_SCENE[levelId];
  if (shared) return sceneOf(shared);
  const own = book().scenes[levelId];
  if (!own) throw new Error(`The guided tour has no opening scene for ${levelId}`);
  return own;
}

export const factLabel = (fact: string): string => book().facts[fact] ?? fact.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

export const capabilityText = (c: BankingCapability): StepText => book().capabilities[c];
export const startText = (a2a: boolean): StepText => (a2a ? book().startA2a : book().start);
export const gatewayText = (): StepText => book().gateway;
export const endText = (): StepText => book().end;
export const outcomeText = (o: Outcome): string => book().outcomes[o];
