/**
 * What can go wrong at each box of each process: the "fail cases" that Spotlight and the guided walkthrough show next to
 * the explanation of the step. They are short on purpose. Each one names a thing that really happens in a bank and says
 * what it costs.
 *
 * Keyed by process, then by the same box ids the lessons use (nodes of the process graph, and the synthetic boxes).
 */

import { pick, type Localized } from '../i18n/locale';
import type { ProcessId } from './learning';

type FailBook = Record<ProcessId, Record<string, string[]>>;

const EN: FailBook = {
  A: {
    n_start: [
      'The checkout sends a malformed message (no timestamp, or a negative amount). Nothing downstream can be trusted, so the payment has to be refused here.',
      'The same request arrives twice because the shopper double-clicked. Without a duplicate check, two payments are made.',
    ],
    n_vault: [
      'The virtual number is not in the vault (a guessed number, or a card that was cancelled). The payment is declined here and nothing else is troubled.',
      'The vault is slow or down. Every virtual-card checkout in the bank queues behind it.',
      'A token was leaked in a data breach. If it is still active, the thief can try it until the dCVV stops them.',
    ],
    n_dcvv: [
      'The code is right but old (a slow typist, or a replay of a captured code). The window is a trade-off between the two.',
      'The code is wrong (a typo, or a guess). Repeated wrong codes on one card are the signature of a guessing attack.',
      'The bank’s clock and the shop’s clock drift apart, so good codes look stale.',
    ],
    n_xor_dcvv: [
      'The rule is written wrongly and a bad code slips through to the ledger: a hold is placed on a payment nobody should have trusted.',
      'The “everything else” wire is missing, so an unexpected code status leaves the payment stuck with nowhere to go.',
    ],
    n_ledger: [
      'The customer has less than the amount. The payment is declined for funds, which is not the bank’s fault and not a fraud signal.',
      'Two payments arrive at the same moment for one balance. Without a hold, both could be approved and the account goes negative.',
      'The ledger is slow at month end, and checkouts time out.',
    ],
    n_xor_ledger: [
      'Treating “not enough funds” as fraud. Honest customers get flagged, and the fraud numbers look worse than they are.',
    ],
    n_end_approved: [
      'The payment was approved but was fraud. The bank now repays it: this is the cost the earlier checks exist to prevent.',
      'The approval is never sent into tonight’s batch, so the money never moves.',
    ],
    n_end_declined: [
      'A good customer was turned away by a rule (an expired code). That is a lost sale and an unhappy customer.',
      'The decline reason is lost, so the team cannot tell fraud declines from funds declines.',
    ],
  },
  B: {
    n_start: [
      'The risk score is missing or out of range. A rule that reads it cannot decide, and the payment has no valid path.',
      'The checkout does not send the data 3DS needs (device, address). The bank has to guess, and it guesses cautiously.',
    ],
    n_3ds: [
      'The frictionless line is set too high. Fraud walks in without being asked for anything.',
      'The frictionless line is set too low. Everybody is challenged, and honest customers give up at the code screen.',
      'The reject line is too low. Good customers are refused outright, with no chance to prove who they are.',
    ],
    n_xor_3ds: [
      'The three ranges overlap or leave a gap. A score that matches nothing has no wire to take.',
      'The default wire is missing, so an unusual score is a stuck payment.',
    ],
    n_end_challenge: [
      'The code is sent to a phone number that is out of date. The real customer never gets it.',
      'SMS arrives late. By the time it is typed, the shopper has left.',
    ],
    syn_phone: [
      'The customer abandons the code screen. That is a lost sale that nobody declined.',
      'A fraudster who has stolen the phone, or SIM-swapped it, types the code. A one-time code only proves possession of the phone.',
      'The customer is travelling and the SMS cannot reach them.',
    ],
    n_ledger: [
      'Passing 3DS makes the payment trusted, not funded. The customer may still have too little money.',
    ],
    n_xor_ledger: [
      'A challenged payment that completed is wrongly sent back to the beginning and challenged a second time.',
    ],
    n_end_approved: [
      'A fraudulent payment that was authenticated: when 3DS passed, the fraud liability shifts to the card issuer. The bank pays.',
      'A fraudulent payment that skipped 3DS: the liability stays with the merchant.',
    ],
    n_end_declined: [
      'A genuine customer was rejected on risk. They may never come back.',
      'Declines caused by the risk score are counted with funds declines, so the team cannot see which dial to turn.',
    ],
  },
  C: {
    n_start: [
      'The basket and the plan do not agree (the down payment is more than the price). The application is rejected before anyone looks at the score.',
      'Applications are submitted again and again until one is approved (a “shopping around” attack on the score line).',
    ],
    n_bnpl: [
      'The minimum score is set too low. The bank approves people who will not pay the last three instalments.',
      'The minimum score is too high. Good customers are pushed out of the plan, and the shop loses its higher basket sizes.',
      'The score is stale. The customer’s circumstances changed since it was calculated.',
    ],
    n_xor_plan: [
      'The failed-approval wire is missing. A customer who is turned down for the plan simply drops out of the checkout and the sale is lost.',
      'The wire sends rejected applicants to a decline when the card could have covered the full price.',
    ],
    n_ledger_dp: [
      'The customer cannot cover even the down payment. The plan was approved but nothing can be collected, and no plan exists.',
      'The down payment is taken but the later instalments fail because the card has expired or the account is empty.',
    ],
    n_ledger_card: [
      'The card cannot cover the full price either. The sale is lost twice: once to the score, once to the funds.',
    ],
    n_xor_funds: [
      'Declines for funds are mixed with declines for credit risk, so nobody can tell whether the problem is the score or the customer’s money.',
    ],
    n_end_bnpl: [
      'The bank carries the risk of three unpaid instalments. A wave of missed payments is a loss the shop’s fee may not cover.',
    ],
    n_end_card: [
      'A fallback customer who is nudged back to full-price payment may still abandon the cart at the card screen.',
    ],
    n_end_dp_declined: [
      'The customer sees “declined” on a plan they were just told they qualified for. The experience is confusing.',
    ],
    n_end_card_declined: [
      'The sale is lost. This is the one outcome where nothing could have been saved by a rule.',
    ],
  },
  D: {
    syn_batch: [
      'The batch runs while some payments are still being processed. Items are missing from tonight’s file and show up as breaks.',
      'The batch fails halfway and nobody notices. Tomorrow morning thousands of approved payments have not been sent.',
    ],
    syn_visa: [
      'The scheme file arrives late, or corrupt. The bank cannot match anything until it is fixed.',
      'The scheme presents the same payment twice. Without a duplicate check, the merchant is paid twice.',
    ],
    n_start: [
      'A record arrives with a leg missing. There is nothing to compare, so the whole payment becomes a break.',
    ],
    n_recon: [
      'The tolerance is too tight. Rounding dust floods the suspense account and buries the real errors.',
      'The tolerance is too loose. A real mistake is matched away, and nobody ever looks at it.',
      'Two currencies are compared without conversion. Every foreign payment looks like a break.',
    ],
    n_xor_recon: [
      'Different kinds of break are sent down one wire, so the clerk does not know where to start looking.',
      'A break is forced to match to keep the dashboard green. The error is still there; it is just hidden.',
    ],
    n_end_settled: [
      'A real error inside the tolerance is settled by mistake. It will not be noticed until a customer or an auditor finds it.',
    ],
    n_end_amount: [
      'The variance is parked, but nobody owns it. It ages in the suspense account.',
    ],
    n_end_missing: [
      'The missing record never arrives. The payment stays parked until someone chases the scheme.',
    ],
    n_end_dup: [
      'The duplicate is paid out before the reversal. Money has left the bank.',
    ],
    syn_suspense: [
      'The suspense balance keeps growing. The night’s rules do not fit the data, or the day team is overloaded.',
      'An item is parked without a reason code, so the investigator starts from nothing.',
    ],
    syn_cleared: [
      'The correction is posted to the wrong account. The break is cleared, but the books are now wrong in a new place.',
    ],
  },
  E: {
    n_start: [
      'The app sends the message twice because the customer tapped twice. Without a duplicate check the money goes twice, and an instant transfer cannot be recalled.',
      'The message arrives in an old format. The gateway cannot read it, and the transfer is refused before any rule runs.',
    ],
    n_gateway: [
      'The EndToEndId is missing. The payment cannot be traced between the two banks, so it must be refused.',
      'A bank code is cut off. The receiving bank cannot be found, and a transfer sent anyway would go nowhere or to the wrong place.',
      'The settled amount and the instructed amount disagree. One of them is wrong, and either way one side of the books would not balance.',
    ],
    n_xor_valid: [
      'The rule is written the wrong way round and flawed messages go on to the ledger: a debit is made for a payment the receiving bank will bounce.',
      'The “everything else” wire is missing, so a message with an unexpected flaw is stuck with nowhere to go.',
    ],
    n_ledger: [
      'Two transfers arrive at the same moment for one balance. Without the money set aside at once, both could go through.',
      'The ledger is slow when everyone is paid at once, and instant transfers queue behind it. Instant stops feeling instant.',
    ],
    n_xor_funds: ['Counting “not enough money” as a bad message. The app’s developers are blamed for a customer’s empty account.'],
    n_end_approved: [
      'The transfer was authorised by a fraudster using a stolen login. Instant means final: the money is already gone and the customer expects the bank to explain.',
      'A released transfer is never reported to the receiving bank, and the money leaves with no one to receive it.',
    ],
    n_end_invalid: ['The rejection reason is vague. The developer cannot tell which field was wrong and keeps resubmitting the same bad message.'],
    n_end_declined: ['The customer is told “failed” without being told why, and tries again, and again.'],
  },
  F: {
    n_start: [
      'The customer’s profile is out of date: the date of birth or nationality on file is wrong, so a good customer looks like someone else and a bad one looks clean.',
      'The watchlists are a week old. A newly sanctioned person passes straight through.',
    ],
    n_aml: [
      'The match threshold is too low. Every customer with a common name is a hit, and the analysts drown in false positives.',
      'The threshold is too high. A sanctioned person with a spelling variant slips through.',
      'Deposits are split across several accounts. Looking at one account at a time hides the pattern.',
    ],
    n_xor_hit: [
      'A clean customer is sent to Case Investigation. An analyst’s time is wasted and a good customer waits.',
      'Structuring is checked before name hits, and a sanctioned person who also splits deposits is reported but never investigated.',
    ],
    n_case: [
      'The verdict rests on the name alone. Two different people with the same name are treated as one.',
      'The audit log has no identity check, so nothing can be proved either way. The honest answer is inconclusive, not a guess.',
      'The analyst trusts a document the customer supplied rather than one the bank verified.',
    ],
    n_xor_verdict: [
      'A false positive is blocked. A long-standing VIP is frozen, and the bank’s relationship with them is damaged.',
      'A true sanctions match is released because the rule treated every true match the same as a politically exposed person.',
    ],
    n_end_released: ['The payment was released even though the customer’s profile had not been refreshed. The screening was right, but of old information.'],
    n_end_cleared: ['The reason for clearing is not written down. At the next audit nobody can say why a name that looks like a sanctioned one was let through.'],
    n_end_sar: ['The report is filed late, or the customer is told they are being reported. Both are offences in their own right.'],
    n_end_sanctions: ['The payment is blocked but the account is not frozen, so the customer tries again by another route.'],
    n_end_edd: ['The source-of-funds request sits unanswered. The customer is left waiting with no deadline.'],
    n_end_escalate: ['The escalation has no owner. The payment waits in a queue nobody works.'],
    n_3ds: [
      'The evaluator does not run before the dispute desk. The desk cannot see the authentication, so a purchase that shifted liability to the issuer is wrongly charged back to the merchant.',
      'The risk score was recorded when the purchase was made, but the challenge result was lost. An authenticated purchase looks unauthenticated.',
    ],
    n_desk: [
      'The filing window is counted from the wrong date. A claim that is in time is refused, or one that is out of time goes through.',
      'The reason is mis-recorded as fraud when it was a duplicate charge, and the liability shift is applied to the wrong kind of claim.',
    ],
    n_xor_gate: [
      'The liability is checked before the window. A claim that is out of time is argued about for weeks before anyone notices it is dead.',
      'An authenticated purchase is charged back to the merchant anyway, and the merchant, rightly, disputes it.',
    ],
    n_xor_stage: ['A stage is skipped. The first chargeback is filed without asking the merchant for the receipt, and a legitimate sale is reversed.'],
    n_xor_result: ['The result is booked to the wrong party, so the loss lands on a customer or a merchant who did nothing wrong.'],
    n_end_retrieval: ['The request goes to the wrong contact at the merchant, and the days pass.'],
    n_end_filed: ['The chargeback is filed with the wrong reason code and the scheme rejects it.'],
    n_end_represent: ['The merchant’s evidence is accepted without being read, because the queue is long.'],
    n_end_prearb: ['The case is escalated past the deadline. The right to escalate is lost.'],
    n_end_refunded: ['The cardholder is refunded twice: once provisionally and once at the end.'],
    n_end_absorbed: ['The bank absorbs a loss it could have recovered, because the authentication was not recorded properly.'],
    n_end_merchant: ['The provisional credit is taken back from the cardholder without telling them, and they dispute the bank’s statement.'],
    n_end_barred: ['A customer who was in time is told they were too late, because the clock started on the wrong day.'],
  },

};

const VI: FailBook = {
  A: {
    n_start: [
      'Trang thanh toán gửi thông điệp sai định dạng (thiếu dấu thời gian, hoặc số tiền âm). Không bước nào phía sau đáng tin, nên giao dịch phải bị từ chối ngay tại đây.',
      'Cùng một yêu cầu đến hai lần vì người mua bấm đúp. Không có kiểm tra trùng lặp, hai giao dịch sẽ được thực hiện.',
    ],
    n_vault: [
      'Số ảo không có trong kho token (số đoán bừa, hoặc thẻ đã bị hủy). Giao dịch bị từ chối ở đây và không làm phiền bước nào khác.',
      'Kho token chậm hoặc ngừng hoạt động. Mọi giao dịch thẻ ảo trong ngân hàng phải xếp hàng chờ nó.',
      'Một token bị lộ trong vụ rò rỉ dữ liệu. Nếu nó vẫn còn hiệu lực, kẻ gian có thể thử cho tới khi dCVV chặn lại.',
    ],
    n_dcvv: [
      'Mã đúng nhưng đã cũ (người gõ chậm, hoặc phát lại mã bị bắt được). Cửa sổ thời gian là sự đánh đổi giữa hai trường hợp đó.',
      'Mã sai (gõ nhầm, hoặc đoán). Nhiều mã sai liên tiếp trên một thẻ là dấu hiệu của tấn công dò mã.',
      'Đồng hồ của ngân hàng và của cửa hàng lệch nhau, nên mã đúng trông như đã hết hạn.',
    ],
    n_xor_dcvv: [
      'Quy tắc viết sai và một mã lỗi lọt tới sổ cái: tiền bị khoanh giữ cho một giao dịch lẽ ra không ai được tin.',
      'Thiếu nhánh “mọi trường hợp khác”, nên một trạng thái mã bất ngờ làm giao dịch bị kẹt, không có lối đi.',
    ],
    n_ledger: [
      'Khách hàng có ít tiền hơn số cần trả. Giao dịch bị từ chối do thiếu tiền, đó không phải lỗi của ngân hàng và không phải dấu hiệu gian lận.',
      'Hai giao dịch đến cùng lúc trên một số dư. Không có khoanh giữ, cả hai có thể được duyệt và tài khoản bị âm.',
      'Sổ cái chậm vào cuối tháng, và các giao dịch bị quá thời gian.',
    ],
    n_xor_ledger: [
      'Coi “không đủ tiền” là gian lận. Khách hàng trung thực bị gắn cờ, và số liệu gian lận trông tệ hơn thực tế.',
    ],
    n_end_approved: [
      'Giao dịch được duyệt nhưng là gian lận. Giờ ngân hàng phải hoàn tiền: đây chính là chi phí mà các bước kiểm tra trước đó tồn tại để ngăn chặn.',
      'Giao dịch đã duyệt không bao giờ được đưa vào lô đêm nay, nên tiền không bao giờ dịch chuyển.',
    ],
    n_end_declined: [
      'Một khách hàng tốt bị từ chối bởi một quy tắc (mã hết hạn). Đó là một đơn hàng mất và một khách hàng không vui.',
      'Lý do từ chối bị mất, nên đội ngũ không phân biệt được từ chối do gian lận với từ chối do thiếu tiền.',
    ],
  },
  B: {
    n_start: [
      'Điểm rủi ro bị thiếu hoặc nằm ngoài khoảng. Quy tắc đọc nó không quyết định được, và giao dịch không có lối đi hợp lệ.',
      'Trang thanh toán không gửi dữ liệu mà 3DS cần (thiết bị, địa chỉ). Ngân hàng phải đoán, và nó đoán một cách thận trọng.',
    ],
    n_3ds: [
      'Ngưỡng không ma sát đặt quá cao. Gian lận đi thẳng vào mà không bị hỏi gì.',
      'Ngưỡng không ma sát đặt quá thấp. Ai cũng bị thử thách, và khách thật bỏ cuộc ở màn hình nhập mã.',
      'Ngưỡng từ chối quá thấp. Khách tốt bị từ chối thẳng, không có cơ hội chứng minh danh tính.',
    ],
    n_xor_3ds: [
      'Ba khoảng điểm chồng lên nhau hoặc để hở. Một điểm không khớp khoảng nào thì không có nhánh để đi.',
      'Thiếu nhánh mặc định, nên một điểm số bất thường thành giao dịch bị kẹt.',
    ],
    n_end_challenge: [
      'Mã được gửi tới số điện thoại đã cũ. Khách thật không bao giờ nhận được.',
      'SMS đến muộn. Lúc mã được nhập thì người mua đã bỏ đi.',
    ],
    syn_phone: [
      'Khách bỏ dở màn hình nhập mã. Đó là một đơn hàng mất mà không ai từ chối.',
      'Kẻ gian đã trộm điện thoại, hoặc chiếm SIM, nhập mã. Mã một lần chỉ chứng minh việc đang cầm điện thoại.',
      'Khách đang đi du lịch và SMS không tới được.',
    ],
    n_ledger: [
      'Qua 3DS làm giao dịch đáng tin, chứ không làm nó đủ tiền. Khách vẫn có thể không đủ số dư.',
    ],
    n_xor_ledger: [
      'Một giao dịch đã hoàn tất thử thách bị gửi nhầm về điểm đầu và bị thử thách lần thứ hai.',
    ],
    n_end_approved: [
      'Giao dịch gian lận đã được xác thực: khi 3DS thành công, trách nhiệm gian lận chuyển sang ngân hàng phát hành. Ngân hàng phải trả.',
      'Giao dịch gian lận bỏ qua 3DS: trách nhiệm vẫn thuộc về cửa hàng.',
    ],
    n_end_declined: [
      'Một khách thật bị từ chối vì rủi ro. Họ có thể không bao giờ quay lại.',
      'Từ chối do điểm rủi ro bị đếm chung với từ chối do thiếu tiền, nên đội ngũ không biết nên vặn núm nào.',
    ],
  },
  C: {
    n_start: [
      'Giỏ hàng và kế hoạch không khớp (khoản trả trước lớn hơn giá). Hồ sơ bị từ chối trước khi ai xem điểm.',
      'Hồ sơ được nộp đi nộp lại cho tới khi một lần được duyệt (tấn công “dò ngưỡng” vào mức điểm).',
    ],
    n_bnpl: [
      'Điểm tối thiểu đặt quá thấp. Ngân hàng duyệt cho người sẽ không trả ba kỳ cuối.',
      'Điểm tối thiểu quá cao. Khách tốt bị loại khỏi kế hoạch, và cửa hàng mất những giỏ hàng giá trị lớn hơn.',
      'Điểm đã cũ. Hoàn cảnh của khách đã thay đổi kể từ khi điểm được tính.',
    ],
    n_xor_plan: [
      'Thiếu nhánh cho trường hợp không được duyệt. Khách bị từ chối trả góp đơn giản là rời trang thanh toán và đơn hàng bị mất.',
      'Nhánh đưa người bị từ chối vào kết cục từ chối trong khi thẻ có thể trả đủ giá.',
    ],
    n_ledger_dp: [
      'Khách không đủ tiền ngay cả cho khoản trả trước. Kế hoạch được duyệt nhưng không thu được gì, và không có kế hoạch nào tồn tại.',
      'Khoản trả trước đã thu nhưng các kỳ sau thất bại vì thẻ hết hạn hoặc tài khoản trống.',
    ],
    n_ledger_card: [
      'Thẻ cũng không trả đủ giá. Đơn hàng mất hai lần: một lần vì điểm, một lần vì tiền.',
    ],
    n_xor_funds: [
      'Từ chối do thiếu tiền bị lẫn với từ chối do rủi ro tín dụng, nên không ai biết vấn đề là ở điểm hay ở tiền của khách.',
    ],
    n_end_bnpl: [
      'Ngân hàng gánh rủi ro ba kỳ chưa trả. Một làn sóng trễ hạn là khoản lỗ mà phí của cửa hàng có thể không bù đủ.',
    ],
    n_end_card: [
      'Khách được chuyển về trả đủ giá vẫn có thể bỏ giỏ hàng ở màn hình thẻ.',
    ],
    n_end_dp_declined: [
      'Khách thấy chữ “từ chối” cho một kế hoạch mà họ vừa được báo là đủ điều kiện. Trải nghiệm gây khó hiểu.',
    ],
    n_end_card_declined: [
      'Đơn hàng bị mất. Đây là kết cục duy nhất mà không quy tắc nào cứu được.',
    ],
  },
  D: {
    syn_batch: [
      'Lô chạy khi vài giao dịch vẫn đang xử lý. Các mục bị thiếu trong tệp đêm nay và hiện thành sai lệch.',
      'Lô hỏng giữa chừng và không ai để ý. Sáng mai hàng nghìn giao dịch đã duyệt vẫn chưa được gửi đi.',
    ],
    syn_visa: [
      'Tệp của tổ chức thẻ đến muộn hoặc bị lỗi. Ngân hàng không đối soát được gì cho tới khi sửa xong.',
      'Tổ chức thẻ trình cùng một giao dịch hai lần. Không có kiểm tra trùng lặp, cửa hàng được trả hai lần.',
    ],
    n_start: [
      'Một bản ghi đến thiếu một vế. Không có gì để so sánh, nên cả giao dịch trở thành sai lệch.',
    ],
    n_recon: [
      'Biên sai số quá chặt. Sai số làm tròn tràn vào tài khoản treo và chôn vùi các lỗi thật.',
      'Biên sai số quá lỏng. Một lỗi thật bị khớp mất, và không ai xem lại nó.',
      'Hai loại tiền được so mà không quy đổi. Mọi giao dịch ngoại tệ trông như sai lệch.',
    ],
    n_xor_recon: [
      'Các loại sai lệch khác nhau bị đưa vào một nhánh, nên nhân viên không biết bắt đầu tìm từ đâu.',
      'Một sai lệch bị ép cho khớp để bảng điều khiển xanh. Lỗi vẫn còn đó; chỉ bị giấu đi.',
    ],
    n_end_settled: [
      'Một lỗi thật nằm trong biên sai số bị quyết toán nhầm. Nó sẽ không bị phát hiện cho tới khi khách hàng hoặc kiểm toán viên tìm ra.',
    ],
    n_end_amount: [
      'Khoản chênh được treo lại nhưng không ai phụ trách. Nó cứ nằm lâu trong tài khoản treo.',
    ],
    n_end_missing: [
      'Bản ghi thiếu không bao giờ đến. Giao dịch nằm treo cho tới khi có người hỏi tổ chức thẻ.',
    ],
    n_end_dup: [
      'Khoản trùng lặp được chi trả trước khi đảo bút toán. Tiền đã rời ngân hàng.',
    ],
    syn_suspense: [
      'Số dư tài khoản treo cứ tăng. Quy tắc ca đêm không phù hợp với dữ liệu, hoặc đội ca ngày đang quá tải.',
      'Một mục được treo mà không có mã lý do, nên điều tra viên bắt đầu từ con số không.',
    ],
    syn_cleared: [
      'Bút toán điều chỉnh ghi nhầm tài khoản. Sai lệch được xử lý, nhưng sổ sách giờ sai ở chỗ khác.',
    ],
  },
  E: {
    n_start: [
      'Ứng dụng gửi thông điệp hai lần vì khách bấm hai lần. Không có kiểm tra trùng lặp, tiền đi hai lần, và chuyển khoản tức thì không thể thu hồi.',
      'Thông điệp đến theo định dạng cũ. Cổng không đọc được và lệnh chuyển bị từ chối trước khi quy tắc nào chạy.',
    ],
    n_gateway: [
      'Thiếu EndToEndId. Giao dịch không thể truy vết giữa hai ngân hàng, nên phải bị từ chối.',
      'Mã ngân hàng bị cắt cụt. Không tìm được ngân hàng nhận, và nếu vẫn gửi thì tiền sẽ không đi đâu hoặc đi sai chỗ.',
      'Số tiền quyết toán và số tiền chỉ thị không khớp. Một trong hai sai, và dù thế nào một bên sổ sách cũng không cân.',
    ],
    n_xor_valid: [
      'Quy tắc viết ngược và thông điệp lỗi đi tiếp tới sổ cái: ghi nợ cho một giao dịch mà ngân hàng nhận sẽ trả về.',
      'Thiếu nhánh “mọi trường hợp khác”, nên thông điệp có lỗi bất ngờ bị kẹt, không có lối đi.',
    ],
    n_ledger: [
      'Hai lệnh chuyển đến cùng lúc trên một số dư. Không trích giữ tiền ngay, cả hai có thể cùng đi.',
      'Sổ cái chậm khi mọi người cùng được trả lương, và chuyển khoản tức thì phải xếp hàng. Tức thì không còn tức thì.',
    ],
    n_xor_funds: ['Coi “không đủ tiền” là thông điệp lỗi. Lập trình viên ứng dụng bị đổ lỗi cho tài khoản trống của khách.'],
    n_end_approved: [
      'Lệnh chuyển được kẻ gian ủy quyền bằng thông tin đăng nhập bị trộm. Tức thì nghĩa là không thể đảo: tiền đã đi và khách mong ngân hàng giải thích.',
      'Lệnh chuyển đã giải phóng không được báo cho ngân hàng nhận, và tiền rời đi mà không ai nhận.',
    ],
    n_end_invalid: ['Lý do từ chối mơ hồ. Lập trình viên không biết trường nào sai và cứ gửi lại cùng một thông điệp lỗi.'],
    n_end_declined: ['Khách bị báo “thất bại” mà không biết vì sao, và thử lại, rồi lại thử.'],
  },
  F: {
    n_start: [
      'Hồ sơ khách hàng đã cũ: ngày sinh hoặc quốc tịch lưu trữ bị sai, nên khách tốt trông giống người khác còn kẻ xấu trông trong sạch.',
      'Danh sách theo dõi đã cũ một tuần. Người mới bị cấm vận đi thẳng qua.',
    ],
    n_aml: [
      'Ngưỡng trùng khớp quá thấp. Mọi khách có tên phổ biến đều bị cảnh báo, và chuyên viên chìm trong cảnh báo sai.',
      'Ngưỡng quá cao. Người bị cấm vận với tên viết khác đi lọt qua.',
      'Tiền nộp được chia ra nhiều tài khoản. Xem từng tài khoản một sẽ không thấy được mẫu hình.',
    ],
    n_xor_hit: [
      'Một khách trong sạch bị đưa vào Điều tra hồ sơ. Thời gian chuyên viên bị lãng phí và khách tốt phải chờ.',
      'Chia nhỏ giao dịch được kiểm tra trước trùng tên, và người bị cấm vận đồng thời chia nhỏ tiền nộp bị báo cáo nhưng không bao giờ được điều tra.',
    ],
    n_case: [
      'Kết luận chỉ dựa vào tên. Hai người khác nhau trùng tên bị coi là một.',
      'Nhật ký kiểm toán không có kiểm tra danh tính, nên không chứng minh được gì. Câu trả lời trung thực là chưa kết luận được, không phải đoán.',
      'Chuyên viên tin vào giấy tờ do khách cung cấp thay vì giấy tờ ngân hàng đã xác minh.',
    ],
    n_xor_verdict: [
      'Một cảnh báo sai bị chặn. Một khách VIP lâu năm bị phong tỏa, và quan hệ với ngân hàng bị tổn hại.',
      'Một trường hợp trùng cấm vận thật được giải phóng vì quy tắc coi mọi trùng khớp thật như người có ảnh hưởng chính trị.',
    ],
    n_end_released: ['Giao dịch được giải phóng dù hồ sơ khách hàng chưa được cập nhật. Sàng lọc đúng, nhưng trên thông tin cũ.'],
    n_end_cleared: ['Lý do giải tỏa không được ghi lại. Ở lần kiểm toán sau không ai nói được vì sao một cái tên giống người bị cấm vận lại được cho qua.'],
    n_end_sar: ['Báo cáo nộp muộn, hoặc khách hàng bị báo rằng họ đang bị báo cáo. Cả hai đều là vi phạm.'],
    n_end_sanctions: ['Giao dịch bị chặn nhưng tài khoản không bị phong tỏa, nên khách thử lại bằng đường khác.'],
    n_end_edd: ['Yêu cầu giải trình nguồn tiền không được trả lời. Khách phải chờ mà không có thời hạn.'],
    n_end_escalate: ['Hồ sơ chuyển cấp không có người phụ trách. Giao dịch nằm trong hàng chờ không ai xử lý.'],
    n_3ds: [
      'Bộ đánh giá không chạy trước quầy tra soát. Quầy không thấy kết quả xác thực, nên một giao dịch đã chuyển trách nhiệm sang ngân hàng phát hành bị tra soát nhầm sang cửa hàng.',
      'Điểm rủi ro được ghi lúc mua, nhưng kết quả thử thách bị mất. Giao dịch đã xác thực trông như chưa xác thực.',
    ],
    n_desk: [
      'Thời hạn khiếu nại được tính từ sai ngày. Khiếu nại còn hạn bị từ chối, hoặc khiếu nại quá hạn lại được chấp nhận.',
      'Lý do bị ghi nhầm là gian lận trong khi thực ra là trừ tiền trùng, và quy tắc chuyển trách nhiệm bị áp dụng cho sai loại khiếu nại.',
    ],
    n_xor_gate: [
      'Trách nhiệm được kiểm tra trước thời hạn. Một khiếu nại quá hạn bị tranh cãi nhiều tuần trước khi ai đó nhận ra nó đã hết hiệu lực.',
      'Giao dịch đã xác thực vẫn bị tra soát sang cửa hàng, và cửa hàng khiếu nại lại, hoàn toàn có lý.',
    ],
    n_xor_stage: ['Một giai đoạn bị bỏ qua. Tra soát lần đầu được nộp mà không yêu cầu cửa hàng xuất trình hóa đơn, và một giao dịch hợp pháp bị đảo.'],
    n_xor_result: ['Kết quả được ghi cho sai bên, nên tổn thất rơi vào khách hàng hoặc cửa hàng không làm gì sai.'],
    n_end_retrieval: ['Yêu cầu được gửi nhầm đầu mối của cửa hàng, và ngày tháng cứ trôi qua.'],
    n_end_filed: ['Tra soát được nộp với sai mã lý do và tổ chức thẻ từ chối.'],
    n_end_represent: ['Bằng chứng của cửa hàng được chấp nhận mà không được đọc, vì hàng chờ quá dài.'],
    n_end_prearb: ['Vụ việc được chuyển cấp sau thời hạn. Quyền chuyển cấp bị mất.'],
    n_end_refunded: ['Chủ thẻ được hoàn tiền hai lần: một lần tạm thời và một lần lúc kết thúc.'],
    n_end_absorbed: ['Ngân hàng tự chịu một khoản lỗ lẽ ra thu hồi được, vì kết quả xác thực không được ghi đúng.'],
    n_end_merchant: ['Khoản ghi có tạm thời bị thu lại từ chủ thẻ mà không báo trước, và họ khiếu nại sao kê của ngân hàng.'],
    n_end_barred: ['Khách còn trong hạn bị báo là quá hạn, vì đồng hồ bắt đầu tính từ sai ngày.'],
  },
};

export const FAIL_CASES: Localized<FailBook> = { en: EN, vi: VI };

/** What can go wrong at one box of one process. An empty list when the box has nothing to say. */
export function failCasesFor(process: ProcessId, nodeId: string): string[] {
  return pick(FAIL_CASES)[process][nodeId] ?? [];
}
