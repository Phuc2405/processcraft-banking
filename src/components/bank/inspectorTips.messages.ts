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
  queue_ekyc: { en: 'Account applications waiting for OCR, the liveness check and the citizen-database match.', vi: 'Hồ sơ mở tài khoản chờ OCR, kiểm tra người thật và đối chiếu cơ sở dữ liệu dân cư.' },
  queue_qr: { en: 'Scanned VietQR payloads waiting to be parsed and mapped to a Napas247 message.', vi: 'Các chuỗi VietQR đã quét chờ được đọc và ánh xạ sang thông điệp Napas247.' },
  queue_teller: { en: 'Customers at the counter with cash to pay in or take out, oldest first.', vi: 'Khách tại quầy cần nộp hoặc rút tiền mặt, ai đến trước phục vụ trước.' },
  queue_biometric: { en: 'Transfers over $400 waiting for the customer’s face scan.', vi: 'Các giao dịch trên $400 chờ khách quét khuôn mặt.' },
  queue_fds: { en: 'Payments waiting for a device and pattern score before they may continue.', vi: 'Các giao dịch chờ chấm điểm thiết bị và hành vi trước khi được đi tiếp.' },
  queue_aml: { en: 'Payments held as STR_PENDING, or frozen on a sanctions hit, waiting for an analyst.', vi: 'Các giao dịch bị giữ ở trạng thái STR_PENDING, hoặc bị phong tỏa do trùng cấm vận, chờ chuyên viên.' },
  queue_dispute: { en: 'Customer claims (chargebacks, pacs.004 returns, ATM mismatches) waiting for a specialist.', vi: 'Khiếu nại của khách (tra soát thẻ, hoàn trả pacs.004, lệch tiền ATM) chờ chuyên viên.' },
  queue_swift: { en: 'Outward pacs.008 remittances waiting for format checks and FX conversion.', vi: 'Các điện chuyển tiền đi pacs.008 chờ kiểm tra định dạng và quy đổi ngoại tệ.' },

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
  errors_ekyc: { en: 'An application refused: forged ID, failed liveness, a face that does not match, or no citizen record.', vi: 'Một hồ sơ bị từ chối: giấy tờ giả, không qua kiểm tra người thật, khuôn mặt không khớp, hoặc không có hồ sơ công dân.' },
  errors_qr: { en: 'A QR whose CRC fails, whose EMVCo tags are malformed, or whose amount disagrees.', vi: 'Một mã QR sai CRC, sai định dạng thẻ EMVCo, hoặc số tiền không khớp.' },
  errors_teller: { en: 'Suspect notes found in a deposit, or a withdrawal larger than the cash in the till.', vi: 'Phát hiện tiền nghi giả khi nộp, hoặc lần rút lớn hơn tiền mặt trong ngăn kéo.' },
  errors_biometric: { en: 'A face that did not match, or a customer with no face enrolled: BIOMETRIC_AUTH_REQUIRED.', vi: 'Khuôn mặt không khớp, hoặc khách chưa đăng ký khuôn mặt: BIOMETRIC_AUTH_REQUIRED.' },
  errors_fds: { en: 'A device scored high-risk and stopped: FDS_HIGH_RISK_DEVICE.', vi: 'Một thiết bị bị chấm rủi ro cao và bị chặn: FDS_HIGH_RISK_DEVICE.' },
  errors_aml: { en: 'A review reopened after a wrong decision, which costs an analyst a second pass.', vi: 'Một lần rà soát phải mở lại do quyết định sai, khiến chuyên viên phải xem lần hai.' },
  errors_dispute: { en: 'A claim decided against the wrong evidence and reworked.', vi: 'Một khiếu nại được quyết định dựa trên bằng chứng sai và phải làm lại.' },
  errors_swift: { en: 'A pacs.008 rejected for a missing EndToEndId, a truncated BIC or a bad currency.', vi: 'Một điện pacs.008 bị từ chối do thiếu EndToEndId, mã BIC bị cắt hoặc loại tiền sai.' },
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

  // ── Phase 8 desk metrics (stats line `tip` → `line_<tip>`) ─────────────────
  line_posted: { en: 'Money the extended flows moved straight on the CASA ledger: accounts opened, QR and SWIFT debits, teller cash and refunds.', vi: 'Tiền các luồng mở rộng hạch toán thẳng trên sổ cái CASA: mở tài khoản, ghi nợ QR và SWIFT, tiền mặt tại quầy và hoàn tiền.' },
  line_ocr: {
    en: 'Biometric matching starts with OCR: the CCCD’s name, number and date of birth are read and compared with what the customer typed. Below 90% the card is treated as fake.',
    vi: 'Đối chiếu sinh trắc học bắt đầu bằng OCR: họ tên, số và ngày sinh trên CCCD được đọc và so với thông tin khách nhập. Dưới 90% thẻ bị coi là giả.',
  },
  line_liveness: {
    en: 'Liveness detection proves a live person is in front of the camera, not a printed photo, a replayed video or a deepfake. A score under 80 fails.',
    vi: 'Kiểm tra người thật (liveness) chứng minh có người thật trước camera, không phải ảnh in, video phát lại hay deepfake. Điểm dưới 80 là không đạt.',
  },
  line_fakeId: { en: 'Share of scans where tamper signals (fonts, hologram, MRZ checksum) or a poor OCR match marked the card as forged.', vi: 'Tỷ lệ lượt quét mà dấu hiệu chỉnh sửa (phông chữ, tem ba chiều, mã MRZ) hoặc OCR kém cho thấy thẻ bị làm giả.' },
  line_citizenDb: {
    en: 'National Citizen Database validation: the CCCD number, name and date of birth must exist in the government register (C06) before an account can open.',
    vi: 'Đối chiếu Cơ sở dữ liệu quốc gia về dân cư: số CCCD, họ tên và ngày sinh phải có trong hệ thống của Bộ Công an (C06) thì mới được mở tài khoản.',
  },
  line_opened: { en: 'Applications that passed every check and the AML screen, so core banking opened the CASA and enrolled the face for FacePay.', vi: 'Hồ sơ qua mọi bước kiểm tra và sàng lọc AML, nên ngân hàng lõi mở tài khoản CASA và đăng ký khuôn mặt cho FacePay.' },
  line_qrParsed: {
    en: 'VietQR is EMVCo TLV: tag 38 holds the Napas GUID, BIN and account, tag 54 the amount on a dynamic QR, tag 63 a CRC-16 over the rest.',
    vi: 'VietQR theo chuẩn EMVCo TLV: thẻ 38 chứa GUID Napas, mã BIN và số tài khoản, thẻ 54 là số tiền của QR động, thẻ 63 là CRC-16 của phần còn lại.',
  },
  line_qrInvalid: { en: 'Payloads refused before any money moved: a CRC mismatch means the code was altered or damaged.', vi: 'Các chuỗi bị từ chối trước khi tiền di chuyển: sai CRC nghĩa là mã đã bị sửa hoặc hỏng.' },
  line_iso8583: {
    en: 'Napas247 still switches card-style messages: each QR becomes an ISO 8583 0200 with field 3 (processing code), field 4 (amount) and field 49 = 704 (VND).',
    vi: 'Napas247 vẫn chuyển mạch theo thông điệp kiểu thẻ: mỗi QR thành một ISO 8583 0200 với trường 3 (mã xử lý), trường 4 (số tiền) và trường 49 = 704 (VND).',
  },
  line_tellerQueue: { en: 'Customers waiting at the counter, split into cash deposits and cash withdrawals.', vi: 'Khách đang chờ tại quầy, chia theo nộp tiền mặt và rút tiền mặt.' },
  line_vault: {
    en: 'Physical vault balancing: opening cash plus deposits minus withdrawals must equal the notes counted at close (GL 1012). A gap is a cash shortage.',
    vi: 'Cân quỹ két: tiền đầu ngày cộng tiền nộp trừ tiền rút phải bằng số tiền đếm lúc đóng quầy (TK 1012). Chênh lệch là thiếu quỹ.',
  },
  line_serials: { en: 'Serial numbers of notes the counting machine flagged as suspect (UV, magnetic ink, counterfeit list), kept for the police report.', vi: 'Số seri của các tờ tiền máy đếm gắn cờ nghi giả (tia UV, mực từ, danh sách tiền giả), được lưu để báo cáo công an.' },
  line_ctr: {
    en: 'Large Cash Transaction Reporting: any cash deposit or withdrawal of $10,000 or more is reported automatically (a CTR), suspicious or not.',
    vi: 'Báo cáo giao dịch tiền mặt lớn: mọi lần nộp hoặc rút tiền mặt từ $10,000 trở lên được tự động báo cáo (CTR), dù có đáng ngờ hay không.',
  },
  line_tillLimit: { en: 'Withdrawals larger than the cash in the teller’s till; the customer waits for a vault top-up.', vi: 'Các lần rút lớn hơn tiền mặt trong ngăn kéo của giao dịch viên; khách chờ tiếp quỹ từ két.' },
  line_faceChecks: { en: 'Transfers over $400 (10M VND) must be authorised by a face scan matched against the biometrics enrolled at onboarding.', vi: 'Giao dịch chuyển tiền trên $400 (10 triệu VND) phải được xác thực bằng quét khuôn mặt, đối chiếu với sinh trắc học đã đăng ký khi mở tài khoản.' },
  line_faceMatch: { en: 'Biometric matching threshold: a face match of 85% or more with a liveness score of 80 or more authorises the transfer.', vi: 'Ngưỡng đối chiếu sinh trắc học: khớp khuôn mặt từ 85% trở lên và điểm người thật từ 80 trở lên thì giao dịch được xác thực.' },
  line_faceFailed: { en: 'Transfers stopped because the face did not match: typical of a thief who has the phone and the PIN but not the face.', vi: 'Giao dịch bị chặn vì khuôn mặt không khớp: điển hình của kẻ gian có điện thoại và mã PIN nhưng không có khuôn mặt.' },
  line_faceEnrol: { en: 'Customers who never enrolled a face cannot send over $400 until they do.', vi: 'Khách chưa đăng ký khuôn mặt không thể chuyển trên $400 cho tới khi đăng ký.' },
  line_fdsScored: {
    en: 'Device fingerprinting: the FDS combines IP, device ID, root/jailbreak checks and velocity into one score. At 70 or more the payment is stopped.',
    vi: 'Dấu vân tay thiết bị: FDS gộp IP, mã thiết bị, kiểm tra root/jailbreak và tần suất thành một điểm. Từ 70 trở lên giao dịch bị chặn.',
  },
  line_fdsBlocked: { en: 'Payments stopped as FDS_HIGH_RISK_DEVICE before any money moved.', vi: 'Các giao dịch bị chặn với mã FDS_HIGH_RISK_DEVICE trước khi tiền di chuyển.' },
  line_fdsIp: { en: 'The IP’s location or network disagreed with the customer’s history: a VPN, a hosting range or another country (+35).', vi: 'Vị trí hoặc mạng của IP khác lịch sử của khách: VPN, dải máy chủ thuê hoặc quốc gia khác (+35).' },
  line_fdsRoot: { en: 'The app’s integrity check found a rooted or jailbroken phone, where malware can read the screen (+40).', vi: 'Kiểm tra toàn vẹn ứng dụng phát hiện điện thoại đã root hoặc jailbreak, nơi mã độc có thể đọc màn hình (+40).' },
  line_fdsBin: { en: 'Five or more attempts from one card BIN in five minutes: a BIN attack enumerating card numbers (+45).', vi: 'Từ năm lần thử trở lên từ cùng một mã BIN trong năm phút: tấn công dò BIN để đoán số thẻ (+45).' },
  line_strFlag: { en: 'Payments the automated AML screen held as STR_PENDING (PEP, structuring, large cross-border) and sent to the analysts.', vi: 'Các giao dịch bộ sàng lọc AML tự động giữ ở trạng thái STR_PENDING (PEP, chia nhỏ, chuyển tiền quốc tế lớn) và chuyển cho chuyên viên.' },
  line_strFlagged: {
    en: 'Held payments an analyst has reviewed. A Suspicious Transaction Report (STR, called a SAR in some countries) goes to the regulator when one is confirmed.',
    vi: 'Các giao dịch bị giữ đã được chuyên viên rà soát. Báo cáo giao dịch đáng ngờ (STR, nơi khác gọi là SAR) được gửi cơ quan quản lý khi xác nhận.',
  },
  line_suspiciousRatio: { en: 'Share of reviewed alerts that ended in an STR. A low ratio means the screen raises many false positives.', vi: 'Tỷ lệ cảnh báo đã rà soát dẫn tới lập STR. Tỷ lệ thấp nghĩa là bộ sàng lọc đưa ra nhiều cảnh báo nhầm.' },
  line_reviewLatency: { en: 'Average minutes from the moment a payment is flagged to the analyst’s decision. Held money is frozen for that long.', vi: 'Số phút trung bình từ lúc giao dịch bị gắn cờ tới khi chuyên viên quyết định. Tiền bị giữ trong suốt thời gian đó.' },
  line_sanctions: {
    en: 'OFAC sanctions and PEP screening: names are fuzzy-matched (Jaro-Winkler) against the lists. A match of 85 or more is frozen as AML_SANCTION_MATCH.',
    vi: 'Sàng lọc cấm vận OFAC và PEP: tên được so khớp mờ (Jaro-Winkler) với danh sách. Khớp từ 85 trở lên bị phong tỏa với mã AML_SANCTION_MATCH.',
  },
  line_released: { en: 'Alerts cleared as false positives (or released with an STR on file) and passed to the CASA ledger.', vi: 'Các cảnh báo được xác định là nhầm (hoặc giải phóng kèm STR đã lập) và chuyển sang sổ cái CASA.' },
  line_claims: { en: 'Claims worked today by type: card chargebacks (CB), pacs.004 payment returns, and ATM cash mismatches.', vi: 'Số khiếu nại xử lý hôm nay theo loại: tra soát thẻ (CB), hoàn trả pacs.004 và lệch tiền ATM.' },
  line_refunds: { en: 'Claims upheld and credited back to the customer’s CASA account.', vi: 'Các khiếu nại được chấp nhận và ghi có lại vào tài khoản CASA của khách.' },
  line_sla: {
    en: 'Chargeback SLA rules: card claims must be raised within 120 days, a pacs.004 return within 14 and an ATM claim within 60. Late claims are rejected.',
    vi: 'Quy tắc thời hạn tra soát: khiếu nại thẻ phải nộp trong 120 ngày, hoàn trả pacs.004 trong 14 ngày và khiếu nại ATM trong 60 ngày. Nộp trễ bị từ chối.',
  },
  line_evidence: { en: 'Claims rejected because the merchant’s proof, the ATM electronic journal or the beneficiary bank went against the customer.', vi: 'Khiếu nại bị từ chối vì chứng từ của cửa hàng, nhật ký điện tử ATM hoặc ngân hàng thụ hưởng bất lợi cho khách.' },
  line_pacs008: {
    en: 'ISO 20022 is XML: a pacs.008 carries GrpHdr (message id), CdtTrfTxInf with PmtId/EndToEndId, IntrBkSttlmAmt with its currency, and the DbtrAgt/CdtrAgt BICs.',
    vi: 'ISO 20022 là XML: pacs.008 gồm GrpHdr (mã điện), CdtTrfTxInf với PmtId/EndToEndId, IntrBkSttlmAmt kèm loại tiền, và mã BIC của DbtrAgt/CdtrAgt.',
  },
  line_swiftInvalid: { en: 'Messages refused before any money moved. A refund of a settled transfer travels back as a pacs.004 payment return.', vi: 'Các điện bị từ chối trước khi tiền di chuyển. Khoản đã quyết toán khi hoàn lại sẽ đi ngược dưới dạng điện hoàn trả pacs.004.' },
  line_swiftValue: { en: 'AUD value sent abroad today through the correspondent nostro accounts (GL 1430), after FX conversion.', vi: 'Giá trị AUD gửi ra nước ngoài hôm nay qua tài khoản nostro tại ngân hàng đại lý (TK 1430), sau khi quy đổi ngoại tệ.' },

  // ── Worker ──────────────────────────────────────────────────────────────────
  load: { en: 'CPU / thread load, 0–100. Above 60 the thread starts dropping requests, which come back as retries.', vi: 'Mức tải CPU / luồng, 0–100. Trên 60 luồng bắt đầu rớt yêu cầu, và chúng quay lại thành lượt chạy lại.' },
  fatigue: { en: 'Accumulated fatigue, 0–100. Above 60 mistakes start at random and each one has to be redone.', vi: 'Độ mệt tích lũy, 0–100. Trên 60 lỗi bắt đầu xuất hiện ngẫu nhiên và mỗi lỗi phải làm lại.' },
  paceMachine: { en: 'Throughput right now as a share of the thread’s full bandwidth.', vi: 'Thông lượng hiện tại so với băng thông tối đa của luồng.' },
  paceHuman: { en: 'Working speed right now as a share of a fresh person’s pace.', vi: 'Tốc độ làm việc hiện tại so với nhịp của một người còn khỏe.' },
  itemsMachine: { en: 'Requests this thread completed on its own today.', vi: 'Số yêu cầu luồng này tự xử lý xong trong hôm nay.' },
  itemsHuman: { en: 'Items this person completed on their own today.', vi: 'Số mục người này tự xử lý xong trong hôm nay.' },
  deskQueue: { en: 'How many items are waiting at the desk this worker is assigned to.', vi: 'Số mục đang chờ tại quầy mà người hoặc luồng này phụ trách.' },
});
