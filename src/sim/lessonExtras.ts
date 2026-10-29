/** What sits under every Academy lesson: its key terms (flip-cards inline, and a door to the Flashcards tab filtered to the chapter) and "Explore Deeper", two or three advanced topics to read up on next. */

import { pick, type Localized } from '../i18n/localeCore';

export interface KeyTerm {
  term: string;
  definition: string;
}

export interface DeeperTopic {
  title: string;
  /** One sentence on what it is and why it matters next. */
  blurb: string;
}

export interface LessonExtras {
  keyTerms: readonly KeyTerm[];
  exploreDeeper: readonly DeeperTopic[];
}

const kt = (term: string, definition: string): KeyTerm => ({ term, definition });
const dt = (title: string, blurb: string): DeeperTopic => ({ title, blurb });

const EN: Readonly<Record<string, LessonExtras>> = {
  '1.1': {
    keyTerms: [kt('POS terminal', 'The card reader at the counter that turns a tap into an authorisation request.'), kt('Authorisation Request (0100)', 'The ISO 8583 message that asks the issuer whether a card may pay this amount.'), kt('Acquirer', 'The merchant’s bank, which forwards the request to the card network.')],
    exploreDeeper: [dt('EMV Chip Tokenisation', 'How the chip produces a one-time cryptogram so a copied card number cannot be replayed.'), dt('PCI-DSS Terminal Compliance', 'The security standard every terminal and merchant system must meet to handle card data.'), dt('ISO 8583 Bitmaps', 'How the primary and secondary bitmaps say which of the 128 data elements a message carries.')],
  },
  '1.2': {
    keyTerms: [kt('Available balance', 'The account balance minus every hold already placed on it.'), kt('Authorisation hold', 'Money set aside for a purchase that has been approved but not yet settled.'), kt('DR 1110 / CR 2110', 'The double-entry posting of a debit-card hold: the hold is an asset, the amount owed to the scheme a liability.')],
    exploreDeeper: [dt('Hold Expiry Rules', 'Why card schemes let an uncaptured hold lapse after a few days, and how hotels and fuel pumps extend it.'), dt('Partial Authorisation', 'Approving only part of the amount when the balance is short, used at fuel pumps and on prepaid cards.')],
  },
  '1.3': {
    keyTerms: [kt('Authorisation Response (0110)', 'The issuer’s answer to an 0100, carrying the response code in field 39.'), kt('Response code 00', 'Approved: the hold is in place and the merchant can hand over the goods.'), kt('Reversal (0400)', 'A message that cancels an approval the terminal never received, so the hold is released.')],
    exploreDeeper: [dt('Stand-In Processing (STIP)', 'How the scheme answers on the issuer’s behalf when the issuer is unreachable.'), dt('Offline EMV Approvals', 'When a chip card can approve a small purchase without going online at all.')],
  },
  '1.4': {
    keyTerms: [kt('RC 51', 'The decline sent when the available balance is below the amount.'), kt('RC 61', 'The decline sent when a daily spending or withdrawal limit is used up.'), kt('Overdraft', 'An agreed limit that lets an account go below zero, for a fee or interest.')],
    exploreDeeper: [dt('Decline Reason Analytics', 'How issuers group decline codes to find friction that is costing genuine sales.'), dt('Account Updater Services', 'How schemes refresh expired card details so subscriptions do not decline.')],
  },
  '2.1': {
    keyTerms: [kt('Card-not-present (CNP)', 'A payment where the card is not physically shown, such as an online checkout.'), kt('Payment gateway', 'The service that takes a website’s checkout data and turns it into a card-network message.'), kt('Device fingerprint', 'Signals about the phone or browser that help tell a regular customer from a stranger.')],
    exploreDeeper: [dt('Strong Customer Authentication (SCA)', 'The European rule that most online payments need two independent factors.'), dt('Network Tokens for Merchants', 'Card-on-file tokens issued by the scheme so stored cards survive reissue and theft.')],
  },
  '2.2': {
    keyTerms: [kt('DPAN', 'The device or digital card number the merchant sees in place of the real one.'), kt('FPAN', 'The funding card number that only the issuer’s vault knows.'), kt('Dynamic CVV (dCVV)', 'A security code that changes every few minutes, so a stolen number is useless on its own.')],
    exploreDeeper: [dt('Hardware Security Modules (HSM)', 'The tamper-proof devices that hold the keys used to check cryptograms and codes.'), dt('Token Service Providers', 'How Visa VTS and Mastercard MDES issue and manage tokens for wallets and merchants.'), dt('Format-Preserving Encryption', 'Encrypting a card number so the result still looks like a card number.')],
  },
  '2.3': {
    keyTerms: [kt('Risk score', 'A number from device, location, amount and history that says how unusual a payment looks.'), kt('Frictionless flow', 'Low-risk payments that pass 3DS without asking the customer anything.'), kt('Challenge flow', 'Medium-risk payments where the customer must prove who they are.')],
    exploreDeeper: [dt('EMV 3DS 2.2 Data Elements', 'The 150-odd fields a merchant can send so the issuer can approve without a challenge.'), dt('Transaction Risk Analysis Exemptions', 'When an acquirer with low fraud rates can skip the challenge under SCA rules.')],
  },
  '2.4': {
    keyTerms: [kt('OTP', 'A one-time password sent to the customer’s phone for this payment only.'), kt('Liability shift', 'After a completed 3DS challenge, fraud losses move from the merchant to the issuer.'), kt('SIM swap', 'A fraud where the criminal takes over the victim’s phone number to receive codes.')],
    exploreDeeper: [dt('Passkeys and FIDO2', 'Device-bound cryptographic logins that replace SMS codes.'), dt('Out-of-Band Authentication', 'Approving a payment in the banking app instead of typing a code.')],
  },
  '3.1': {
    keyTerms: [kt('Card testing', 'A bot trying many small payments to learn which stolen cards still work.'), kt('Velocity rule', 'A limit on how many attempts a card, device or merchant may make in a short window.'), kt('Alert fatigue', 'When too many alerts make analysts approve without looking.')],
    exploreDeeper: [dt('BIN Attacks', 'How fraudsters generate valid card numbers from a bank’s card range.'), dt('Bot Mitigation and CAPTCHA', 'How merchants slow automated checkouts without hurting real customers.')],
  },
  '3.2': {
    keyTerms: [kt('Threshold', 'The score at which a decision changes: pass, challenge or reject.'), kt('False positive', 'A genuine customer flagged as fraud.'), kt('Emulator', 'Software pretending to be a phone, often used by bots.')],
    exploreDeeper: [dt('Machine-Learning Fraud Models', 'How gradient-boosted models score payments from hundreds of features.'), dt('Champion-Challenger Testing', 'Running a new rule beside the old one to compare fraud caught and sales lost.')],
  },
  '3.3': {
    keyTerms: [kt('RC 59', 'The decline sent when the score is above the reject threshold.'), kt('Pattern store', 'The record of devices and cards seen in an attack, used to stop the next one sooner.'), kt('5010 Fraud Loss Expense', 'The account where fraud the bank must absorb is written off.')],
    exploreDeeper: [dt('Consortium Fraud Data', 'How banks share confirmed fraud signals across institutions.'), dt('Card Reissue Strategy', 'When it is cheaper to replace a compromised card than to monitor it.')],
  },
  '4.1': {
    keyTerms: [kt('BNPL', 'Buy now, pay later: a purchase split into instalments, usually four.'), kt('Plan request', 'The merchant’s request to the lender to offer instalments for this basket.'), kt('Underwriting queue', 'Where a plan request waits for a credit decision.')],
    exploreDeeper: [dt('Responsible Lending Obligations', 'The rules that make a lender check a customer can afford to repay.'), dt('Merchant Discount Economics of BNPL', 'Why merchants pay higher fees for BNPL than for cards.')],
  },
  '4.2': {
    keyTerms: [kt('Underwriting score', 'A credit score that says how likely the customer is to repay.'), kt('Down payment', 'The first instalment, collected at checkout.'), kt('Exposure limit', 'The most BNPL debt the lender will let one customer hold.')],
    exploreDeeper: [dt('Comprehensive Credit Reporting', 'How positive repayment data improves credit decisions.'), dt('Probability of Default Models', 'How lenders estimate the chance a borrower will not repay.')],
  },
  '4.3': {
    keyTerms: [kt('1310 BNPL Receivable', 'The instalments still owed to the bank after it paid the merchant in full.'), kt('Late fee', 'A charge when an instalment payment fails.'), kt('Collections', 'The process of recovering missed payments.')],
    exploreDeeper: [dt('Expected Credit Loss (IFRS 9)', 'How lenders book provisions for loans that may not be repaid.'), dt('Receivables Securitisation', 'Selling pools of instalment receivables to investors to fund more lending.')],
  },
  '5.1': {
    keyTerms: [kt('pacs.008', 'The ISO 20022 message for a customer credit transfer between banks.'), kt('pacs.002', 'The status report that says whether a transfer was accepted or rejected.'), kt('PayID', 'An alias such as a phone number or email that points to an account on the NPP.')],
    exploreDeeper: [dt('NPP Overlay Services', 'How Osko and PayTo build on the New Payments Platform.'), dt('Confirmation of Payee', 'Checking the account name matches before an instant transfer is sent.'), dt('ISO 20022 Migration (CBPR+)', 'The move of cross-border SWIFT payments to structured XML.')],
  },
  '5.2': {
    keyTerms: [kt('CDM', 'A cash deposit machine that only takes notes in.'), kt('Card retention', 'The machine keeping a card after too many wrong PINs.'), kt('RC 91', 'Issuer or switch inoperative: the machine cannot reach the bank.')],
    exploreDeeper: [dt('Cash Recycling Machines', 'Machines that pay deposited notes back out, cutting cash logistics.'), dt('ATM Network Monitoring', 'How banks watch machine health, cash levels and fault codes in real time.')],
  },
  '5.3': {
    keyTerms: [kt('Note validation', 'Checking each note’s security features to reject counterfeits.'), kt('Cassette', 'The locked box inside the machine that holds the notes.'), kt('1015 ATM Cash', 'The account for cash sitting in the bank’s machines.')],
    exploreDeeper: [dt('Cash-in-Transit Planning', 'Scheduling armoured collections so machines neither overflow nor run dry.'), dt('Liquidity Forecasting', 'Predicting cash demand by day, season and location.')],
  },
  '5.4': {
    keyTerms: [kt('Immediate credit', 'Making deposited money available before the notes are physically counted.'), kt('DR 1015 / CR 2010', 'The posting that moves value from machine cash to the customer’s account.'), kt('Cassette reconciliation', 'Comparing the physical count with the machine log.')],
    exploreDeeper: [dt('Deposit Holds and Funds Availability', 'When banks may delay access to deposited funds.'), dt('Shortage and Overage Handling', 'How branches investigate and book cash count differences.')],
  },
  '6.1': {
    keyTerms: [kt('Batch close', 'The terminal sending the day’s approved sales to the acquirer.'), kt('Hold expiry', 'An uncaptured hold dropping off after a few days.'), kt('End of day (EOD)', 'The night run that turns promises into real money movements.')],
    exploreDeeper: [dt('Real-Time vs Batch Processing', 'Why card payments still settle in batches while transfers settle instantly.'), dt('Cut-Off Times', 'How the processing day boundary decides which sales settle when.')],
  },
  '6.2': {
    keyTerms: [kt('Clearing', 'Exchanging the final details of each sale between issuer and acquirer.'), kt('Presentment', 'The acquirer’s claim for a sale, matched to the earlier authorisation.'), kt('Clearing file', 'The batch of presentments the scheme sends each night.')],
    exploreDeeper: [dt('Visa Base II and Mastercard IPM', 'The clearing file formats used by the two biggest schemes.'), dt('Incremental Authorisation', 'Raising a hold after the first approval, for tips and hotel stays.')],
  },
  '6.3': {
    keyTerms: [kt('Settlement', 'The actual movement of money between banks.'), kt('Netting', 'Adding up every bank’s payables and receivables into one amount each.'), kt('Nostro account', 'The bank’s own account used to pay and receive settlement.')],
    exploreDeeper: [dt('Exchange Settlement Accounts', 'The accounts banks hold at the central bank to settle with each other.'), dt('Settlement Risk (Herstatt Risk)', 'The risk that one side pays and the other does not.')],
  },
  '6.4': {
    keyTerms: [kt('3-way reconciliation', 'Comparing the ledger, the clearing file and the switch log for every payment.'), kt('Break', 'A record that does not match between the sources.'), kt('1910 Suspense', 'The holding account for breaks until a person finds the cause.')],
    exploreDeeper: [dt('Automated Matching Engines', 'How rules and fuzzy matching clear most breaks without a person.'), dt('Aged Suspense Reporting', 'Why regulators watch how long items sit in suspense.'), dt('SOX Controls over Reconciliation', 'The control evidence auditors expect for every reconciliation.')],
  },
};

const VI: Readonly<Record<string, LessonExtras>> = {
  '1.1': {
    keyTerms: [kt('Máy POS', 'Máy đọc thẻ tại quầy biến một lần chạm thẻ thành yêu cầu cấp phép.'), kt('Yêu cầu cấp phép (0100)', 'Bản tin ISO 8583 hỏi ngân hàng phát hành xem thẻ có được thanh toán số tiền này không.'), kt('Ngân hàng thanh toán (Acquirer)', 'Ngân hàng của cửa hàng, chuyển yêu cầu tới mạng lưới thẻ.')],
    exploreDeeper: [dt('Mã hóa thẻ chip EMV', 'Chip tạo mã mật mã dùng một lần như thế nào để số thẻ bị sao chép không thể dùng lại.'), dt('Tuân thủ PCI-DSS cho máy POS', 'Tiêu chuẩn bảo mật mọi máy POS và hệ thống cửa hàng phải đạt để xử lý dữ liệu thẻ.'), dt('Bitmap trong ISO 8583', 'Bitmap chính và phụ cho biết bản tin mang những trường nào trong 128 trường dữ liệu.')],
  },
  '1.2': {
    keyTerms: [kt('Số dư khả dụng', 'Số dư tài khoản trừ mọi khoản đang khoanh giữ.'), kt('Khoanh giữ cấp phép', 'Tiền được giữ lại cho giao dịch đã duyệt nhưng chưa quyết toán.'), kt('Nợ 1110 / Có 2110', 'Bút toán kép của khoản khoanh giữ thẻ ghi nợ: khoản giữ là tài sản, khoản phải trả tổ chức thẻ là nợ phải trả.')],
    exploreDeeper: [dt('Quy tắc hết hạn khoanh giữ', 'Vì sao tổ chức thẻ cho khoản khoanh giữ chưa ghi nhận tự hết hạn sau vài ngày, và khách sạn, trạm xăng gia hạn ra sao.'), dt('Cấp phép một phần', 'Chỉ duyệt một phần số tiền khi số dư thiếu, dùng ở trạm xăng và thẻ trả trước.')],
  },
  '1.3': {
    keyTerms: [kt('Phản hồi cấp phép (0110)', 'Câu trả lời của ngân hàng phát hành cho bản tin 0100, mang mã phản hồi ở trường 39.'), kt('Mã phản hồi 00', 'Chấp thuận: tiền đã được khoanh giữ và cửa hàng có thể giao hàng.'), kt('Lệnh đảo (0400)', 'Bản tin hủy một lần chấp thuận mà máy POS không nhận được, để giải tỏa khoản khoanh giữ.')],
    exploreDeeper: [dt('Xử lý thay thế (STIP)', 'Tổ chức thẻ trả lời thay ngân hàng phát hành khi không liên lạc được.'), dt('Chấp thuận EMV ngoại tuyến', 'Khi thẻ chip có thể tự duyệt giao dịch nhỏ mà không cần kết nối.')],
  },
  '1.4': {
    keyTerms: [kt('RC 51', 'Mã từ chối khi số dư khả dụng thấp hơn số tiền.'), kt('RC 61', 'Mã từ chối khi hạn mức chi tiêu hoặc rút tiền trong ngày đã hết.'), kt('Thấu chi', 'Hạn mức thỏa thuận cho phép tài khoản xuống dưới 0, có tính phí hoặc lãi.')],
    exploreDeeper: [dt('Phân tích lý do từ chối', 'Ngân hàng phát hành nhóm các mã từ chối để tìm điểm ma sát đang làm mất doanh số thật.'), dt('Dịch vụ cập nhật tài khoản', 'Tổ chức thẻ làm mới thông tin thẻ hết hạn để các gói đăng ký không bị từ chối.')],
  },
  '2.1': {
    keyTerms: [kt('Không xuất trình thẻ (CNP)', 'Giao dịch mà thẻ không được xuất trình trực tiếp, như thanh toán trực tuyến.'), kt('Cổng thanh toán', 'Dịch vụ nhận dữ liệu thanh toán của website và chuyển thành bản tin mạng lưới thẻ.'), kt('Dấu vân tay thiết bị', 'Tín hiệu về điện thoại hoặc trình duyệt giúp phân biệt khách quen với người lạ.')],
    exploreDeeper: [dt('Xác thực khách hàng mạnh (SCA)', 'Quy định châu Âu yêu cầu phần lớn giao dịch trực tuyến có hai yếu tố độc lập.'), dt('Network Token cho cửa hàng', 'Token thẻ lưu sẵn do tổ chức thẻ cấp để thẻ lưu trữ vẫn dùng được khi thẻ được phát hành lại hay bị đánh cắp.')],
  },
  '2.2': {
    keyTerms: [kt('DPAN', 'Số thẻ thiết bị hoặc số thẻ số mà cửa hàng thấy thay cho số thật.'), kt('FPAN', 'Số thẻ gốc mà chỉ kho token của ngân hàng phát hành biết.'), kt('CVV động (dCVV)', 'Mã bảo mật thay đổi vài phút một lần, nên số thẻ bị đánh cắp vô dụng nếu chỉ có số.')],
    exploreDeeper: [dt('Thiết bị bảo mật phần cứng (HSM)', 'Thiết bị chống can thiệp lưu khóa dùng để kiểm tra mã mật mã và mã bảo mật.'), dt('Nhà cung cấp dịch vụ token', 'Visa VTS và Mastercard MDES phát hành, quản lý token cho ví và cửa hàng như thế nào.'), dt('Mã hóa giữ nguyên định dạng', 'Mã hóa số thẻ mà kết quả vẫn trông như một số thẻ.')],
  },
  '2.3': {
    keyTerms: [kt('Điểm rủi ro', 'Con số từ thiết bị, vị trí, số tiền và lịch sử cho biết giao dịch bất thường đến đâu.'), kt('Luồng xác thực liền mạch', 'Giao dịch rủi ro thấp qua 3DS mà không hỏi khách gì.'), kt('Luồng thử thách', 'Giao dịch rủi ro trung bình mà khách phải chứng minh danh tính.')],
    exploreDeeper: [dt('Các trường dữ liệu EMV 3DS 2.2', 'Khoảng 150 trường cửa hàng có thể gửi để ngân hàng phát hành duyệt không cần thử thách.'), dt('Miễn trừ phân tích rủi ro giao dịch', 'Khi ngân hàng thanh toán có tỷ lệ gian lận thấp được bỏ qua thử thách theo quy định SCA.')],
  },
  '2.4': {
    keyTerms: [kt('OTP', 'Mật khẩu một lần gửi tới điện thoại khách chỉ cho giao dịch này.'), kt('Chuyển trách nhiệm', 'Sau khi hoàn tất thử thách 3DS, tổn thất gian lận chuyển từ cửa hàng sang ngân hàng phát hành.'), kt('Chiếm đoạt SIM', 'Hình thức gian lận khi tội phạm chiếm số điện thoại của nạn nhân để nhận mã.')],
    exploreDeeper: [dt('Passkey và FIDO2', 'Đăng nhập mật mã gắn với thiết bị thay thế mã SMS.'), dt('Xác thực ngoài kênh', 'Duyệt giao dịch trong ứng dụng ngân hàng thay vì nhập mã.')],
  },
  '3.1': {
    keyTerms: [kt('Dò thẻ', 'Bot thử nhiều giao dịch nhỏ để biết thẻ bị đánh cắp nào còn dùng được.'), kt('Quy tắc tần suất', 'Giới hạn số lần thử của một thẻ, thiết bị hoặc cửa hàng trong khoảng thời gian ngắn.'), kt('Mệt mỏi vì cảnh báo', 'Khi quá nhiều cảnh báo khiến chuyên viên duyệt mà không xem.')],
    exploreDeeper: [dt('Tấn công BIN', 'Kẻ gian tạo số thẻ hợp lệ từ dải số thẻ của ngân hàng như thế nào.'), dt('Chống bot và CAPTCHA', 'Cửa hàng làm chậm thanh toán tự động mà không làm phiền khách thật.')],
  },
  '3.2': {
    keyTerms: [kt('Ngưỡng', 'Mức điểm mà quyết định thay đổi: cho qua, thử thách hay từ chối.'), kt('Cảnh báo sai', 'Khách thật bị gắn cờ là gian lận.'), kt('Trình giả lập', 'Phần mềm giả làm điện thoại, thường được bot sử dụng.')],
    exploreDeeper: [dt('Mô hình học máy phát hiện gian lận', 'Mô hình gradient boosting chấm điểm giao dịch từ hàng trăm đặc trưng.'), dt('Kiểm thử Champion-Challenger', 'Chạy quy tắc mới song song quy tắc cũ để so gian lận bắt được và doanh số mất đi.')],
  },
  '3.3': {
    keyTerms: [kt('RC 59', 'Mã từ chối khi điểm vượt ngưỡng từ chối.'), kt('Kho mẫu hình', 'Bản ghi thiết bị và thẻ đã thấy trong một vụ tấn công, giúp chặn vụ sau sớm hơn.'), kt('5010 Chi phí tổn thất gian lận', 'Tài khoản ghi nhận gian lận mà ngân hàng phải tự chịu.')],
    exploreDeeper: [dt('Dữ liệu gian lận liên minh', 'Các ngân hàng chia sẻ tín hiệu gian lận đã xác nhận với nhau.'), dt('Chiến lược phát hành lại thẻ', 'Khi nào thay thẻ bị lộ rẻ hơn tiếp tục theo dõi nó.')],
  },
  '4.1': {
    keyTerms: [kt('BNPL', 'Mua trước trả sau: giao dịch được chia thành các kỳ, thường là bốn.'), kt('Yêu cầu kế hoạch', 'Yêu cầu của cửa hàng gửi bên cho vay để đưa ra trả góp cho giỏ hàng này.'), kt('Hàng chờ thẩm định', 'Nơi yêu cầu kế hoạch chờ quyết định tín dụng.')],
    exploreDeeper: [dt('Nghĩa vụ cho vay có trách nhiệm', 'Quy định buộc bên cho vay kiểm tra khả năng trả nợ của khách.'), dt('Kinh tế phí chiết khấu của BNPL', 'Vì sao cửa hàng trả phí BNPL cao hơn phí thẻ.')],
  },
  '4.2': {
    keyTerms: [kt('Điểm thẩm định', 'Điểm tín dụng cho biết khả năng khách trả được nợ.'), kt('Khoản trả trước', 'Kỳ đầu tiên, thu ngay khi thanh toán.'), kt('Hạn mức dư nợ', 'Mức dư nợ BNPL tối đa bên cho vay cho phép một khách nắm giữ.')],
    exploreDeeper: [dt('Báo cáo tín dụng toàn diện', 'Dữ liệu trả nợ tích cực giúp quyết định tín dụng tốt hơn.'), dt('Mô hình xác suất vỡ nợ', 'Bên cho vay ước tính khả năng người vay không trả nợ.')],
  },
  '4.3': {
    keyTerms: [kt('1310 Phải thu BNPL', 'Các kỳ trả góp khách còn nợ ngân hàng sau khi ngân hàng đã trả đủ cho cửa hàng.'), kt('Phí trễ hạn', 'Khoản phí khi một kỳ thanh toán thất bại.'), kt('Thu hồi nợ', 'Quy trình thu hồi các khoản trễ hạn.')],
    exploreDeeper: [dt('Tổn thất tín dụng dự kiến (IFRS 9)', 'Bên cho vay trích lập dự phòng cho các khoản vay có thể không thu hồi được.'), dt('Chứng khoán hóa khoản phải thu', 'Bán các nhóm khoản phải thu trả góp cho nhà đầu tư để có vốn cho vay thêm.')],
  },
  '5.1': {
    keyTerms: [kt('pacs.008', 'Thông điệp ISO 20022 cho lệnh chuyển khoản khách hàng giữa các ngân hàng.'), kt('pacs.002', 'Báo cáo trạng thái cho biết lệnh chuyển được chấp nhận hay bị từ chối.'), kt('PayID', 'Bí danh như số điện thoại hoặc email trỏ tới một tài khoản trên NPP.')],
    exploreDeeper: [dt('Dịch vụ lớp phủ NPP', 'Osko và PayTo được xây trên Nền tảng Thanh toán Mới như thế nào.'), dt('Xác nhận người nhận', 'Kiểm tra tên tài khoản khớp trước khi gửi chuyển khoản tức thì.'), dt('Chuyển đổi ISO 20022 (CBPR+)', 'Việc chuyển thanh toán xuyên biên giới SWIFT sang XML có cấu trúc.')],
  },
  '5.2': {
    keyTerms: [kt('CDM', 'Máy nộp tiền mặt chỉ nhận tiền vào.'), kt('Giữ thẻ', 'Máy giữ lại thẻ sau quá nhiều lần nhập sai PIN.'), kt('RC 91', 'Ngân hàng phát hành hoặc bộ chuyển mạch ngừng hoạt động: máy không kết nối được ngân hàng.')],
    exploreDeeper: [dt('Máy tái chế tiền mặt', 'Máy trả lại chính những tờ tiền đã nộp, giảm chi phí hậu cần tiền mặt.'), dt('Giám sát mạng lưới ATM', 'Ngân hàng theo dõi tình trạng máy, lượng tiền và mã lỗi theo thời gian thực.')],
  },
  '5.3': {
    keyTerms: [kt('Kiểm tra tiền', 'Kiểm tra các đặc điểm bảo an của từng tờ tiền để loại tiền giả.'), kt('Hộp tiền (cassette)', 'Hộp có khóa bên trong máy chứa tiền giấy.'), kt('1015 Tiền mặt ATM', 'Tài khoản ghi nhận tiền mặt nằm trong máy của ngân hàng.')],
    exploreDeeper: [dt('Lập kế hoạch vận chuyển tiền', 'Lên lịch xe chở tiền để máy không bị đầy hoặc cạn tiền.'), dt('Dự báo thanh khoản', 'Dự báo nhu cầu tiền mặt theo ngày, mùa và địa điểm.')],
  },
  '5.4': {
    keyTerms: [kt('Ghi có ngay', 'Cho phép dùng tiền nộp trước khi tiền giấy được kiểm đếm thực tế.'), kt('Nợ 1015 / Có 2010', 'Bút toán chuyển giá trị từ tiền mặt trong máy sang tài khoản khách.'), kt('Đối soát hộp tiền', 'So số đếm thực tế với nhật ký của máy.')],
    exploreDeeper: [dt('Tạm giữ tiền nộp và thời hạn khả dụng', 'Khi nào ngân hàng được trì hoãn quyền sử dụng tiền đã nộp.'), dt('Xử lý thừa thiếu tiền mặt', 'Chi nhánh điều tra và hạch toán chênh lệch kiểm đếm tiền mặt.')],
  },
  '6.1': {
    keyTerms: [kt('Chốt lô', 'Máy POS gửi các giao dịch được duyệt trong ngày tới ngân hàng thanh toán.'), kt('Khoanh giữ hết hạn', 'Khoản khoanh giữ chưa được ghi nhận tự hết sau vài ngày.'), kt('Cuối ngày (EOD)', 'Ca chạy đêm biến lời hứa thành dịch chuyển tiền thật.')],
    exploreDeeper: [dt('Xử lý thời gian thực và theo lô', 'Vì sao thanh toán thẻ vẫn quyết toán theo lô còn chuyển khoản thì tức thì.'), dt('Giờ chốt giao dịch', 'Ranh giới ngày xử lý quyết định giao dịch nào quyết toán khi nào.')],
  },
  '6.2': {
    keyTerms: [kt('Bù trừ', 'Trao đổi chi tiết cuối cùng của mỗi giao dịch giữa ngân hàng phát hành và ngân hàng thanh toán.'), kt('Bản trình (presentment)', 'Yêu cầu thanh toán của ngân hàng thanh toán cho một giao dịch, được khớp với lần cấp phép trước đó.'), kt('Tệp bù trừ', 'Lô bản trình tổ chức thẻ gửi mỗi đêm.')],
    exploreDeeper: [dt('Visa Base II và Mastercard IPM', 'Định dạng tệp bù trừ của hai tổ chức thẻ lớn nhất.'), dt('Cấp phép bổ sung', 'Tăng khoản khoanh giữ sau lần duyệt đầu, cho tiền tip và lưu trú khách sạn.')],
  },
  '6.3': {
    keyTerms: [kt('Quyết toán', 'Việc tiền thật sự dịch chuyển giữa các ngân hàng.'), kt('Bù trừ ròng', 'Cộng các khoản phải trả và phải thu của mỗi ngân hàng thành một con số.'), kt('Tài khoản Nostro', 'Tài khoản riêng của ngân hàng dùng để chi trả và nhận tiền quyết toán.')],
    exploreDeeper: [dt('Tài khoản quyết toán tại Ngân hàng Trung ương', 'Tài khoản các ngân hàng mở tại ngân hàng trung ương để quyết toán với nhau.'), dt('Rủi ro quyết toán (Herstatt)', 'Rủi ro một bên đã trả còn bên kia thì không.')],
  },
  '6.4': {
    keyTerms: [kt('Đối soát 3 bên', 'So sánh sổ cái, tệp bù trừ và nhật ký bộ chuyển mạch cho từng giao dịch.'), kt('Sai lệch (break)', 'Bản ghi không khớp giữa các nguồn.'), kt('1910 Tài khoản treo', 'Tài khoản giữ các sai lệch cho tới khi có người tìm ra nguyên nhân.')],
    exploreDeeper: [dt('Công cụ khớp tự động', 'Quy tắc và khớp mờ xử lý phần lớn sai lệch mà không cần người.'), dt('Báo cáo tuổi tài khoản treo', 'Vì sao cơ quan quản lý theo dõi các mục nằm trong tài khoản treo bao lâu.'), dt('Kiểm soát SOX đối với đối soát', 'Bằng chứng kiểm soát mà kiểm toán viên yêu cầu cho mỗi lần đối soát.')],
  },
};

export const LESSON_EXTRAS: Localized<Readonly<Record<string, LessonExtras>>> = { en: EN, vi: VI };

const EMPTY: LessonExtras = { keyTerms: [], exploreDeeper: [] };

/** The key terms and deeper topics of a lesson, in the active language. */
export const extrasFor = (levelId: string): LessonExtras => pick(LESSON_EXTRAS)[levelId] ?? EMPTY;
