import { defineMessages } from '../../utils/i18nHelper';

/**
 * The inspector's hybrid tips: one standard definition per metric, plus an example of what that metric means at this kind of
 * desk (keys `<metric>_<family>`, families from sim/nodeKind.ts). Both languages are required for every key.
 */
export const tipMessages = defineMessages('inspectorTips', {
  atThisDesk: { en: 'At this desk', vi: 'Tại quầy này' },

  // ── Live stats ──────────────────────────────────────────────────────────────
  queue: { en: 'Items waiting for a free worker at this desk right now, oldest first.', vi: 'Số mục đang chờ một người hoặc tiến trình rảnh tại quầy này, mục cũ nhất đứng đầu.' },
  queue_gateway: { en: 'API requests from terminals, checkouts and banking apps that have arrived but not been parsed yet.', vi: 'Các yêu cầu API từ máy POS, trang thanh toán và ứng dụng ngân hàng đã đến nhưng chưa được đọc.' },
  queue_token: { en: 'Card tokens waiting to be looked up in the vault and their dynamic codes checked.', vi: 'Các token thẻ chờ tra cứu trong kho và kiểm tra mã động.' },
  queue_risk: { en: 'Online payments waiting for a risk score, some of them about to be sent a one-time code.', vi: 'Các giao dịch trực tuyến chờ chấm điểm rủi ro, một số sắp được gửi mã một lần.' },
  queue_casa: { en: 'Debits waiting for a balance check and a hold on the customer’s account.', vi: 'Các lệnh ghi nợ chờ kiểm tra số dư và khoanh giữ trên tài khoản khách.' },
  queue_credit: { en: 'Credit card purchases waiting for a check against the card’s limit.', vi: 'Các giao dịch thẻ tín dụng chờ kiểm tra hạn mức.' },
  queue_atm: { en: 'Customers at the machine: a card being read, a PIN being typed, notes being counted.', vi: 'Khách tại máy: thẻ đang được đọc, PIN đang được nhập, tiền đang được đếm.' },
  queue_bnpl: { en: 'Pay-in-4 applications waiting for an underwriter to review them by hand.', vi: 'Hồ sơ trả góp 4 kỳ chờ chuyên viên thẩm định xem xét thủ công.' },
  queue_clearing: { en: 'The day’s approved payments waiting to be batched, settled with Visa or matched across the three records.', vi: 'Các giao dịch được duyệt trong ngày chờ đóng lô, quyết toán với Visa hoặc đối chiếu ba bản ghi.' },
  queue_suspense: { en: 'Unmatched records parked in the holding box until someone investigates them.', vi: 'Các bản ghi lệch nằm trong tài khoản treo cho tới khi có người điều tra.' },

  done: { en: 'Items this desk finished successfully today, since the day began.', vi: 'Số mục quầy này đã xử lý xong trong hôm nay, tính từ đầu ngày.' },
  avgWait: {
    en: 'Average minutes an item waited here before work started. It follows Little’s Law: Wait ≈ Queue ÷ Throughput, so a longer queue or a slower desk both raise it.',
    vi: 'Số phút trung bình một mục phải chờ trước khi được xử lý. Theo định luật Little: Thời gian chờ ≈ Hàng chờ ÷ Thông lượng, nên hàng chờ dài hơn hoặc quầy chậm hơn đều làm nó tăng.',
  },
  peak: { en: 'The longest the queue has been during this shift.', vi: 'Độ dài lớn nhất của hàng chờ trong ca này.' },
  errors: { en: 'Items that went wrong here and had to be redone. They rise with load or fatigue above 60.', vi: 'Số mục bị lỗi tại đây và phải làm lại. Chúng tăng khi tải hoặc độ mệt vượt 60.' },
  errors_gateway: { en: 'A malformed message or a dropped connection that has to be resent.', vi: 'Một thông điệp sai định dạng hoặc kết nối bị rớt phải gửi lại.' },
  errors_token: { en: 'A dCVV that expired before it was checked, or a vault lookup that timed out.', vi: 'Một mã dCVV hết hạn trước khi được kiểm tra, hoặc tra cứu kho bị quá thời gian.' },
  errors_risk: { en: 'An OTP challenge that timed out, or a score that had to be recalculated.', vi: 'Một thử thách OTP quá thời gian, hoặc điểm rủi ro phải tính lại.' },
  errors_casa: { en: 'A hold placed for the wrong amount, or insufficient funds misread and rechecked.', vi: 'Một khoản khoanh giữ sai số tiền, hoặc số dư không đủ bị đọc sai và phải kiểm tra lại.' },
  errors_credit: { en: 'A limit check that read a stale balance and had to run again.', vi: 'Một lần kiểm tra hạn mức đọc số dư cũ và phải chạy lại.' },
  errors_atm: { en: 'A note jam, a card read failure or a wrong PIN entry.', vi: 'Kẹt tiền, lỗi đọc thẻ hoặc nhập sai PIN.' },
  errors_bnpl: { en: 'A credit score decision that had to be reviewed again.', vi: 'Một quyết định chấm điểm tín dụng phải xem xét lại.' },
  errors_clearing: { en: 'A ledger mismatch between the batch, the Visa file and the switch.', vi: 'Sai lệch sổ cái giữa lô bù trừ, tệp Visa và bộ chuyển mạch.' },
  errors_suspense: { en: 'A record matched to the wrong entry and reopened.', vi: 'Một bản ghi bị khớp nhầm bút toán và phải mở lại.' },
  capacityMachine: {
    en: 'Maximum throughput: the sum over running threads of base speed × load factor. Shown as requests per five-minute beat.',
    vi: 'Thông lượng tối đa: tổng trên các luồng đang chạy của tốc độ cơ sở × hệ số tải. Tính theo số yêu cầu mỗi nhịp năm phút.',
  },
  capacityHuman: {
    en: 'Maximum throughput: the sum over people on duty of base speed × stamina. Shown as items per five-minute beat.',
    vi: 'Thông lượng tối đa: tổng trên số người đang trực của tốc độ cơ sở × sức bền. Tính theo số mục mỗi nhịp năm phút.',
  },
  utilisationMachine: { en: 'Share of the last beat the threads spent processing rather than idle. Near 100% the queue starts to grow.', vi: 'Tỷ lệ thời gian trong nhịp vừa qua các luồng bận xử lý thay vì rảnh. Gần 100% thì hàng chờ bắt đầu dài ra.' },
  utilisationHuman: { en: 'Share of the last beat the staff spent working rather than waiting. Near 100% the queue starts to grow.', vi: 'Tỷ lệ thời gian trong nhịp vừa qua nhân sự bận làm việc thay vì chờ. Gần 100% thì hàng chờ bắt đầu dài ra.' },
  sparkline: { en: 'Queue depth over the most recent beats: a rising line means work is arriving faster than it is finished.', vi: 'Độ dài hàng chờ qua các nhịp gần đây: đường đi lên nghĩa là việc đến nhanh hơn việc được làm xong.' },
  lines: { en: 'Counters only this desk keeps: what it holds on the ledger, or how its checks came out today.', vi: 'Các bộ đếm riêng của quầy này: khoản đang giữ trên sổ cái, hoặc kết quả các lần kiểm tra hôm nay.' },
  pending: { en: 'The live first-in, first-out list of payloads waiting here, with how long each has waited.', vi: 'Danh sách vào trước ra trước của các giao dịch đang chờ tại đây, kèm thời gian mỗi mục đã chờ.' },

  // ── Worker ──────────────────────────────────────────────────────────────────
  load: { en: 'CPU / thread load, 0–100. Above 60 the thread starts dropping requests, which come back as retries.', vi: 'Mức tải CPU / luồng, 0–100. Trên 60 luồng bắt đầu rớt yêu cầu, và chúng quay lại thành lượt chạy lại.' },
  fatigue: { en: 'Accumulated fatigue, 0–100. Above 60 mistakes start at random and each one has to be redone.', vi: 'Độ mệt tích lũy, 0–100. Trên 60 lỗi bắt đầu xuất hiện ngẫu nhiên và mỗi lỗi phải làm lại.' },
  paceMachine: { en: 'Throughput right now as a share of the thread’s full bandwidth.', vi: 'Thông lượng hiện tại so với băng thông tối đa của luồng.' },
  paceHuman: { en: 'Working speed right now as a share of a fresh person’s pace.', vi: 'Tốc độ làm việc hiện tại so với nhịp của một người còn khỏe.' },
  itemsMachine: { en: 'Requests this thread completed on its own today.', vi: 'Số yêu cầu luồng này tự xử lý xong trong hôm nay.' },
  itemsHuman: { en: 'Items this person completed on their own today.', vi: 'Số mục người này tự xử lý xong trong hôm nay.' },
  deskQueue: { en: 'How many items are waiting at the desk this worker is assigned to.', vi: 'Số mục đang chờ tại quầy mà người hoặc luồng này phụ trách.' },
});
