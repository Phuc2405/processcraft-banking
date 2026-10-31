/**
 * The Knowledge Base's Phase 1/4 content: a lesson per retail sub-process, the flashcards and the practice quiz. Every Dr/Cr
 * diagram is read from the simulator's own journals (sim/retailOps.ts), so the article and the desk can never disagree. The
 * dollar tariffs and the till and cassette limits are the simulator's; the laws cited are references to check against the
 * current text, not legal advice. Pure data, both languages.
 */

import type { Localized } from '../i18n/locale';
import type { ChapterId } from '../sim/academyCatalog';
import { exampleJournal, exampleTicketClose, exampleVaultTransfer, OPS_SUB_CHAPTER, opsSubProcess, OPS_SUBPROCESSES, type OpsLine, type OpsSubProcessId } from '../sim/retailOps';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

export interface OpsDiagram {
  title: Localized<string>;
  lines: readonly OpsLine[];
}

export interface OpsLesson {
  /** Starts with `retail`, which is how a link finds the retail tab. */
  id: `retail-ops-${OpsSubProcessId}`;
  sub: OpsSubProcessId;
  summary: Localized<string>;
  /** The message flow, hop by hop. */
  iso: readonly { hop: string; message: string; meaning: Localized<string> }[];
  rules: readonly { source: Localized<string>; rule: Localized<string> }[];
  sop: readonly Localized<string>[];
  redFlags: readonly Localized<string>[];
  diagrams: readonly OpsDiagram[];
  keywords: readonly string[];
}

export const opsLessonAnchor = (sub: OpsSubProcessId): OpsLesson['id'] => `retail-ops-${sub}`;

export const OPS_LESSONS: readonly OpsLesson[] = [
  {
    id: 'retail-ops-bill-pay',
    sub: 'bill-pay',
    summary: L(
      'A utility bill is paid at a shop terminal or collected by direct debit on its due date. The bank pays only out of available funds: if the balance is short the bill is returned unpaid, the biller gets nothing, and the customer pays an NSF fee.',
      'Hóa đơn tiện ích được trả qua máy tại cửa hàng hoặc thu bằng ủy nhiệm thu vào ngày đến hạn. Ngân hàng chỉ thanh toán từ số dư khả dụng: nếu thiếu tiền, hóa đơn bị trả lại, nhà cung cấp không nhận được gì và khách chịu phí NSF.',
    ),
    iso: [
      { hop: 'Terminal → Bank', message: 'ISO 8583 0200', meaning: L('Financial request with the biller code and the bill reference.', 'Yêu cầu tài chính kèm mã nhà cung cấp và mã hóa đơn.') },
      { hop: 'Biller → Bank', message: 'ISO 20022 pain.008', meaning: L('A direct debit collection, checked against the mandate on file.', 'Lệnh ủy nhiệm thu, đối chiếu với ủy quyền đã đăng ký.') },
      { hop: 'Bank → Terminal', message: 'ISO 8583 0210', meaning: L('RC 00 paid, or RC 51 insufficient funds.', 'RC 00 đã thanh toán, hoặc RC 51 không đủ số dư.') },
      { hop: 'Bank → Biller', message: 'ISO 20022 pacs.002 / pacs.004', meaning: L('Payment status, and the return of a collection that could not be paid.', 'Trạng thái thanh toán và trả lại lệnh thu không thực hiện được.') },
    ],
    rules: [
      { source: L('Decree 52/2024/ND-CP', 'Nghị định 52/2024/NĐ-CP'), rule: L('Vietnam’s decree on non-cash payments: payment services run on the customer’s instruction or authorisation.', 'Nghị định về thanh toán không dùng tiền mặt: dịch vụ thanh toán thực hiện theo lệnh hoặc ủy quyền của khách hàng.') },
      { source: L('SBV Circular 17/2024/TT-NHNN', 'Thông tư 17/2024/TT-NHNN'), rule: L('Payment accounts: opening, using and debiting them, including debits the holder has authorised.', 'Tài khoản thanh toán: mở, sử dụng và trích nợ, bao gồm các khoản chủ tài khoản đã ủy quyền.') },
      { source: L('AusPayNet BECS Procedures', 'AusPayNet BECS Procedures'), rule: L('In Australia, a direct debit runs under a request the customer has signed, and an unpaid item is returned.', 'Tại Úc, ghi nợ trực tiếp thực hiện theo yêu cầu khách đã ký, và khoản không thanh toán được sẽ bị trả lại.') },
    ],
    sop: [
      L('Read the biller code and reference; check the mandate if it is a direct debit.', 'Đọc mã nhà cung cấp và mã hóa đơn; kiểm tra ủy quyền nếu là ủy nhiệm thu.'),
      L('Compare the bill with the available balance, not the ledger balance.', 'So hóa đơn với số dư khả dụng, không phải số dư sổ cái.'),
      L('Covered: post Dr 2010 / Cr 1113 and answer RC 00.', 'Đủ tiền: ghi Nợ 2010 / Có 1113 và trả RC 00.'),
      L('Short: post nothing for the bill, charge the tariff NSF fee and answer RC 51.', 'Thiếu tiền: không ghi hóa đơn, thu phí NSF theo biểu phí và trả RC 51.'),
      L('Tell the biller the item was returned, so the customer’s bill is not marked as paid.', 'Báo nhà cung cấp lệnh đã bị trả lại để hóa đơn của khách không bị ghi là đã trả.'),
    ],
    redFlags: [
      L('A bill paid in part out of an overdraft nobody agreed to.', 'Hóa đơn được trả một phần bằng khoản thấu chi chưa được thỏa thuận.'),
      L('A collection with no mandate, or from a biller the customer never named.', 'Lệnh thu không có ủy quyền, hoặc từ nhà cung cấp khách chưa từng đăng ký.'),
      L('The same bill reference presented twice.', 'Cùng một mã hóa đơn được trình hai lần.'),
    ],
    diagrams: [
      { title: L('$85 electric bill, paid (RC 00)', 'Hóa đơn điện $85, đã thanh toán (RC 00)'), lines: exampleJournal('bill-electric-85') },
      { title: L('$250 water bill, returned (RC 51): only the NSF fee posts', 'Hóa đơn nước $250, bị trả lại (RC 51): chỉ ghi nhận phí NSF'), lines: exampleJournal('bill-water-250') },
    ],
    keywords: ['bill pay', 'thanh toan hoa don', 'direct debit', 'uy nhiem thu', 'nsf', 'rc 51', 'pain.008', 'utility', 'tien dien', 'tien nuoc'],
  },
  {
    id: 'retail-ops-wallet-qr',
    sub: 'wallet-qr',
    summary: L(
      'A wallet top-up moves money from the bank account to a wallet provider such as MoMo, ZaloPay or Apple Pay, and the bank owes the provider until settlement. A dynamic VietQR payment clears in seconds and cannot be recalled, so its checks all happen before the money moves.',
      'Nạp ví chuyển tiền từ tài khoản ngân hàng sang đơn vị ví như MoMo, ZaloPay hay Apple Pay, và ngân hàng phải trả đơn vị ví đến khi quyết toán. Thanh toán VietQR động được bù trừ trong vài giây và không thể thu hồi, nên mọi kiểm tra phải diễn ra trước khi tiền dịch chuyển.',
    ),
    iso: [
      { hop: 'Wallet → Bank', message: 'Linked-account API', meaning: L('The provider’s debit instruction on the own-name linked account.', 'Lệnh trích nợ của đơn vị ví trên tài khoản liên kết chính chủ.') },
      { hop: 'App → Bank', message: 'EMVCo QR (TLV)', meaning: L('Tag 38 holds the NAPAS GUID and BIN, tag 54 the amount, tag 63 the CRC-16.', 'Thẻ 38 chứa GUID NAPAS và BIN, thẻ 54 số tiền, thẻ 63 CRC-16.') },
      { hop: 'Bank → Domestic switch', message: 'ISO 20022 pacs.008', meaning: L('The credit transfer to the shop’s bank.', 'Lệnh chuyển tiền tới ngân hàng của cửa hàng.') },
      { hop: 'Domestic switch → Bank', message: 'ISO 20022 pacs.002 (ACSC)', meaning: L('Settled: the clearing time stops here and is measured against the 5-second SLA.', 'Đã quyết toán: thời gian bù trừ dừng tại đây và được đo theo SLA 5 giây.') },
    ],
    rules: [
      { source: L('SBV Circular 40/2024/TT-NHNN', 'Thông tư 40/2024/TT-NHNN'), rule: L('Payment intermediaries in Vietnam: wallets are linked to the holder’s own account, with monthly transaction limits.', 'Dịch vụ trung gian thanh toán tại Việt Nam: ví liên kết với tài khoản chính chủ và có hạn mức giao dịch theo tháng.') },
      { source: L('SBV standard TCCS 03:2018', 'TCCS 03:2018/NHNN'), rule: L('The State Bank’s QR code standard for payments, which VietQR follows on the EMVCo format.', 'Tiêu chuẩn mã QR thanh toán của Ngân hàng Nhà nước, VietQR tuân theo định dạng EMVCo.') },
      { source: L('APRA APS 610', 'APRA APS 610'), rule: L('In Australia, APRA supervises large purchased payment facilities (stored value).', 'Tại Úc, APRA giám sát các tiện ích thanh toán trả trước quy mô lớn (giá trị lưu trữ).') },
    ],
    sop: [
      L('Wallet: confirm the wallet is in the account holder’s own name and inside the cap.', 'Ví: xác nhận ví đứng tên chủ tài khoản và trong hạn mức.'),
      L('Wallet: post Dr 2010 / Cr 1950 and confirm to the provider.', 'Ví: ghi Nợ 2010 / Có 1950 và xác nhận cho đơn vị ví.'),
      L('QR: check the CRC, then look up the name and show it to the customer before sending.', 'QR: kiểm tra CRC, tra cứu tên và hiển thị cho khách trước khi gửi.'),
      L('QR: run the real-time fraud score, then post Dr 2010 / Cr 1113 and send pacs.008.', 'QR: chấm điểm gian lận thời gian thực, rồi ghi Nợ 2010 / Có 1113 và gửi pacs.008.'),
      L('QR: record the pacs.002 time against the SLA; a missed SLA goes to reconciliation.', 'QR: ghi nhận thời điểm pacs.002 theo SLA; quá SLA thì chuyển đối soát.'),
    ],
    redFlags: [
      L('A wallet whose name does not match the account holder.', 'Ví có tên không khớp với chủ tài khoản.'),
      L('A QR whose CRC fails, or a merchant name different from the shop in front of the customer.', 'QR sai CRC, hoặc tên đơn vị khác với cửa hàng khách đang đứng trước.'),
      L('Many small top-ups in a row followed by a cash-out: possible layering.', 'Nhiều lần nạp nhỏ liên tiếp rồi rút ra: có thể là giai đoạn phân tán tiền.'),
    ],
    diagrams: [
      { title: L('$100 MoMo cash-in', 'Nạp $100 vào ví MoMo'), lines: exampleJournal('wallet-cashin-100') },
      { title: L('$45 VietQR, cleared within the SLA', 'VietQR $45, bù trừ trong SLA'), lines: exampleJournal('qr-45') },
    ],
    keywords: ['wallet', 'vi dien tu', 'momo', 'zalopay', 'apple pay', 'vietqr', 'qr', 'rtp', 'instant', 'sla', 'pacs.008', 'pacs.002', 'crc', 'nap vi'],
  },
  {
    id: 'retail-ops-atm-napas',
    sub: 'atm-napas',
    summary: L(
      'A withdrawal over the the domestic switch (NAPAS) network costs the customer the cash plus a fee, and that fee has two owners: part is the bank’s income, and part is only collected on behalf of the switch and owed to it until tonight’s settlement.',
      'Rút tiền qua mạng NAPAS khiến khách trả tiền rút cộng phí, và phí này có hai chủ: một phần là thu nhập của ngân hàng, phần còn lại chỉ thu hộ chuyển mạch và phải trả đến khi quyết toán đêm nay.',
    ),
    iso: [
      { hop: 'ATM → Domestic switch', message: 'ISO 8583 0200', meaning: L('The cash withdrawal request (processing code 01), routed by BIN.', 'Yêu cầu rút tiền (mã xử lý 01), định tuyến theo BIN.') },
      { hop: 'Domestic switch → Issuer', message: 'ISO 8583 0200', meaning: L('The issuer checks the PIN result, the balance and the limits.', 'Ngân hàng phát hành kiểm tra kết quả PIN, số dư và hạn mức.') },
      { hop: 'Issuer → ATM', message: 'ISO 8583 0210', meaning: L('RC 00, and the machine dispenses.', 'RC 00, và máy nhả tiền.') },
      { hop: 'Domestic switch → Bank', message: 'EOD settlement file', meaning: L('The night’s net position, which also drains TK 3510.', 'Vị thế ròng trong đêm, đồng thời tất toán TK 3510.') },
    ],
    rules: [
      { source: L('SBV Circular 36/2012/TT-NHNN', 'Thông tư 36/2012/TT-NHNN'), rule: L('Installing, managing, operating and securing ATMs in Vietnam, including continuity of service.', 'Trang bị, quản lý, vận hành và bảo đảm an toàn ATM tại Việt Nam, gồm cả tính liên tục của dịch vụ.') },
      { source: L('SBV Circular 18/2024/TT-NHNN', 'Thông tư 18/2024/TT-NHNN'), rule: L('Bank card operations: the card terms and the fees charged must be disclosed to the holder.', 'Hoạt động thẻ ngân hàng: điều khoản thẻ và các loại phí phải được công bố cho chủ thẻ.') },
      { source: L('APRA CPS 230', 'APRA CPS 230'), rule: L('Operational risk in Australia: critical services such as payments and their service providers must be managed.', 'Rủi ro hoạt động tại Úc: các dịch vụ trọng yếu như thanh toán và đơn vị cung cấp phải được quản lý.') },
    ],
    sop: [
      L('Verify the card and PIN, and route over the switch.', 'Xác minh thẻ và PIN, định tuyến qua chuyển mạch.'),
      L('Check the balance covers the cash and the fee together.', 'Kiểm tra số dư đủ trả cả tiền rút và phí.'),
      L('Check the cassette can pay the full amount: never dispense part of it.', 'Kiểm tra hộp tiền trả đủ số tiền: không bao giờ nhả một phần.'),
      L('Post Dr 2010 for the total, against Cr 1011, Cr 4520 and Cr 3510.', 'Ghi Nợ 2010 toàn bộ, đối ứng Có 1011, Có 4520 và Có 3510.'),
      L('At EOD, match the switch’s file and pay the 3510 balance: Dr 3510 / Cr 1113.', 'Cuối ngày, khớp tệp của chuyển mạch và trả số dư 3510: Nợ 3510 / Có 1113.'),
    ],
    redFlags: [
      L('The whole fee booked as income: the bank then overstates income and understates what it owes the domestic switch (NAPAS).', 'Ghi toàn bộ phí vào thu nhập: ngân hàng ghi cao thu nhập và ghi thấp khoản phải trả NAPAS.'),
      L('TK 3510 still carrying a balance after settlement.', 'TK 3510 vẫn còn số dư sau quyết toán.'),
      L('Repeated withdrawals just under the daily limit at distant ATMs.', 'Rút liên tiếp ngay dưới hạn mức ngày tại các ATM ở xa nhau.'),
    ],
    diagrams: [{ title: L('$100 withdrawal: cash + $1.10 bank fee + $0.55 domestic switch fee (NAPAS)', 'Rút $100: tiền mặt + $1.10 phí ngân hàng + $0.55 phí NAPAS'), lines: exampleJournal('atm-withdraw-100') }],
    keywords: ['atm', 'napas', 'switch fee', 'phi chuyen mach', 'rut tien', 'withdrawal', '0200', '0210', 'interbank fee', 'phi lien ngan hang'],
  },
  {
    id: 'retail-ops-cassette-jam',
    sub: 'cassette-jam',
    summary: L(
      'If the dispenser fails after the debit, the customer has paid and has no cash. The money goes to TK 2930 ATM Suspense, a ticket opens for the end-of-day reconciliation, and the machine’s cash count decides the outcome. Separately, a cassette under 15% raises a refill alert for the cash-in-transit crew.',
      'Nếu máy lỗi sau khi đã trừ tiền, khách đã trả tiền nhưng không nhận được. Số tiền vào TK 2930 Treo ATM, phiếu đối soát cuối ngày được mở, và kết quả kiểm quỹ của máy sẽ quyết định. Ngoài ra, hộp tiền dưới 15% phát cảnh báo tiếp quỹ cho đội vận chuyển tiền.',
    ),
    iso: [
      { hop: 'ATM → Bank', message: 'ISO 8583 0420', meaning: L('A reversal advice: the dispense did not complete.', 'Thông báo đảo: việc nhả tiền không hoàn tất.') },
      { hop: 'Bank → ATM', message: 'ISO 8583 0430', meaning: L('The advice is acknowledged.', 'Xác nhận đã nhận thông báo.') },
      { hop: 'ATM → Ops', message: 'Electronic journal (EJ)', meaning: L('The machine’s record of every note, read at the cash count.', 'Bản ghi từng tờ tiền của máy, được đọc khi kiểm quỹ.') },
      { hop: 'ATM → CIT', message: 'Device status / refill order', meaning: L('The sensor’s low-cassette status becomes a replenishment order.', 'Trạng thái hộp tiền thấp từ cảm biến trở thành lệnh tiếp quỹ.') },
    ],
    rules: [
      { source: L('SBV Circular 36/2012/TT-NHNN', 'Thông tư 36/2012/TT-NHNN'), rule: L('ATM operators must keep machines in service and deal with customer complaints about them.', 'Đơn vị vận hành ATM phải duy trì máy hoạt động và giải quyết khiếu nại của khách liên quan đến máy.') },
      { source: L('SBV Circular 01/2014/TT-NHNN', 'Thông tư 01/2014/TT-NHNN'), rule: L('Receiving, storing and transporting cash and valuables in Vietnam, under dual control.', 'Giao nhận, bảo quản, vận chuyển tiền mặt và tài sản quý tại Việt Nam, theo kiểm soát kép.') },
      { source: L('APRA CPS 230', 'APRA CPS 230'), rule: L('Third parties such as cash-in-transit firms sit inside the bank’s operational risk management.', 'Bên thứ ba như đơn vị vận chuyển tiền nằm trong phạm vi quản lý rủi ro hoạt động của ngân hàng.') },
    ],
    sop: [
      L('On a dispense fault, post Dr 2010 / Cr 2930: never leave the amount with the customer or the ATM.', 'Khi lỗi nhả tiền, ghi Nợ 2010 / Có 2930: không để số tiền ở khách hay ATM.'),
      L('Open an EOD reconciliation ticket with the terminal, the amount and the time.', 'Mở phiếu đối soát cuối ngày ghi rõ máy, số tiền và thời gian.'),
      L('Read the electronic journal and count the cassette and the reject bin.', 'Đọc nhật ký điện tử và đếm hộp tiền cùng hộp tiền loại.'),
      L('Notes retained: refund, Dr 2930 / Cr 2010. Notes taken: Dr 2930 / Cr 1011.', 'Tiền còn trong máy: hoàn tiền, Nợ 2930 / Có 2010. Khách đã nhận: Nợ 2930 / Có 1011.'),
      L('Under 15%: order the CIT refill, Dr 1011 ATM / Cr 1011 vault, under dual control.', 'Dưới 15%: lập lệnh tiếp quỹ CIT, Nợ 1011 ATM / Có 1011 kho, theo kiểm soát kép.'),
    ],
    redFlags: [
      L('TK 2930 carrying a balance past the end of day.', 'TK 2930 còn số dư sau cuối ngày.'),
      L('A refund made before the cash count: the customer could be paid twice.', 'Hoàn tiền trước khi kiểm quỹ: khách có thể được trả hai lần.'),
      L('Many jams on one machine: a fault, or a cash-trapping device fitted to it.', 'Nhiều lần kẹt tiền trên một máy: lỗi thiết bị, hoặc có thiết bị bẫy tiền gắn vào máy.'),
    ],
    diagrams: [
      { title: L('$200 jam: parked in suspense', 'Kẹt $200: treo vào tài khoản treo'), lines: exampleJournal('atm-jam-200') },
      { title: L('Ticket closed: notes stayed in the machine, refund', 'Đóng phiếu: tiền còn trong máy, hoàn tiền'), lines: exampleTicketClose('REFUNDED') },
      { title: L('Ticket closed: the customer took the notes', 'Đóng phiếu: khách đã nhận tiền'), lines: exampleTicketClose('DISPENSED') },
    ],
    keywords: ['cash jam', 'ket tien', 'cassette', 'hop tien', 'suspense', 'tai khoan treo', '2930', 'cit', 'tiep quy', 'low cash', 'reconciliation', 'doi soat', '0420', 'reversal'],
  },
  {
    id: 'retail-ops-teller-vault',
    sub: 'teller-vault',
    summary: L(
      'Cash paid in at the counter goes into the teller’s till and credits the customer. A till is limited to $50,000 because cash in a drawer is exposed: once it goes over, the surplus must go to the vault under dual control before the teller serves anyone else.',
      'Tiền mặt nộp tại quầy vào ngăn kéo của giao dịch viên và được ghi có cho khách. Ngăn kéo giới hạn ở $50,000 vì tiền trong ngăn kéo dễ gặp rủi ro: khi vượt hạn mức, phần dư phải chuyển về kho quỹ theo kiểm soát kép trước khi phục vụ khách tiếp theo.',
    ),
    iso: [
      { hop: 'Teller → Core', message: 'Core teller posting', meaning: L('A branch transaction, with the teller’s ID and the supervisor’s approval when one is required.', 'Giao dịch chi nhánh kèm mã giao dịch viên và phê duyệt của kiểm soát viên khi cần.') },
      { hop: 'Teller → Vault', message: 'Vault transfer slip', meaning: L('Two people count and sign the surplus across.', 'Hai người cùng đếm và ký nhận phần dư.') },
      { hop: 'Core → AML', message: 'Large-cash report', meaning: L('Cash at or over the reporting line is reported automatically.', 'Tiền mặt từ ngưỡng báo cáo trở lên được báo cáo tự động.') },
    ],
    rules: [
      { source: L('SBV Circular 01/2014/TT-NHNN', 'Thông tư 01/2014/TT-NHNN'), rule: L('Cash in Vietnamese banks is received, stored and moved under dual control.', 'Tiền mặt tại ngân hàng Việt Nam được giao nhận, bảo quản, vận chuyển theo kiểm soát kép.') },
      { source: L('AML Law 14/2022/QH15 · Decision 11/2023/QD-TTg', 'Luật PCRT 14/2022/QH15 · QĐ 11/2023/QĐ-TTg'), rule: L('Large cash transactions (from VND 400 million) are reported to the State Bank.', 'Giao dịch tiền mặt lớn (từ 400 triệu đồng) phải báo cáo Ngân hàng Nhà nước.') },
      { source: L('AUSTRAC AML/CTF Act 2006', 'AUSTRAC AML/CTF Act 2006'), rule: L('In Australia, physical cash of AUD 10,000 or more needs a threshold transaction report.', 'Tại Úc, tiền mặt từ 10.000 AUD phải lập báo cáo giao dịch vượt ngưỡng.') },
      { source: L('Bank policy', 'Chính sách ngân hàng'), rule: L('The $50,000 till limit and the $25,000 float are this simulator’s internal policy, not a statutory figure.', 'Hạn mức ngăn kéo $50,000 và mức quỹ đầu ca $25,000 là chính sách nội bộ của mô phỏng này, không phải con số luật định.') },
    ],
    sop: [
      L('Count the notes in front of the customer and check for fakes.', 'Đếm tiền trước mặt khách và kiểm tra tiền giả.'),
      L('Post Dr 1011 (till) / Cr 2010, and print the receipt.', 'Ghi Nợ 1011 (ngăn kéo) / Có 2010 và in biên lai.'),
      L('At or over the reporting line, file the cash report.', 'Từ ngưỡng báo cáo trở lên, lập báo cáo tiền mặt.'),
      L('Till over $50,000: stop serving, and call the vault custodian.', 'Ngăn kéo vượt $50,000: ngừng phục vụ và gọi thủ kho.'),
      L('Both count the surplus above the float: Dr 1011 (vault) / Cr 1011 (till).', 'Hai người cùng đếm phần dư trên mức quỹ: Nợ 1011 (kho) / Có 1011 (ngăn kéo).'),
    ],
    redFlags: [
      L('A till over its limit for long, or transfers split to stay under it.', 'Ngăn kéo vượt hạn mức lâu, hoặc chia nhỏ để nằm dưới hạn mức.'),
      L('A vault transfer signed by one person.', 'Phiếu chuyển kho quỹ chỉ một người ký.'),
      L('Deposits repeatedly just under the reporting line: possible structuring.', 'Các lần nộp liên tục ngay dưới ngưỡng báo cáo: có thể là chia nhỏ giao dịch.'),
    ],
    diagrams: [
      { title: L('$5,000 deposit at the counter', 'Nộp $5,000 tại quầy'), lines: exampleJournal('teller-deposit-5000') },
      { title: L('Mandatory vault transfer: surplus above the $25,000 float', 'Chuyển kho quỹ bắt buộc: phần dư trên mức quỹ $25,000'), lines: exampleVaultTransfer() },
    ],
    keywords: ['teller', 'giao dich vien', 'till limit', 'han muc ngan keo', 'vault', 'kho quy', 'dual control', 'kiem soat kep', 'cash deposit', 'nop tien', '50,000', '50000'],
  },
  {
    id: 'retail-ops-card-fees',
    sub: 'card-fees',
    summary: L(
      'Annual, issuance and card lock fees are taken from the account. If the balance is too small for a fee the customer owes under their contract, the shortfall becomes an overdraft: the statement shows a negative balance, and the bank’s books show a receivable on TK 1310.',
      'Phí thường niên, phát hành và khóa thẻ được trích từ tài khoản. Nếu số dư không đủ trả khoản phí theo hợp đồng, phần thiếu trở thành thấu chi: sao kê hiển thị số dư âm, còn sổ ngân hàng ghi nhận khoản phải thu tại TK 1310.',
    ),
    iso: [
      { hop: 'Card system → Core', message: 'Fee batch posting', meaning: L('The card system sends each fee due with the tariff code.', 'Hệ thống thẻ gửi từng khoản phí đến hạn kèm mã biểu phí.') },
      { hop: 'App → Card system', message: 'Card status update', meaning: L('The lock request changes the card’s status; authorisations then answer RC 62 (restricted card).', 'Yêu cầu khóa đổi trạng thái thẻ; các lần cấp phép sau đó trả RC 62 (thẻ bị hạn chế).') },
      { hop: 'Core → Customer', message: 'Statement / notification', meaning: L('The fee and any overdraft are shown to the customer.', 'Khoản phí và thấu chi được thông báo cho khách.') },
    ],
    rules: [
      { source: L('SBV Circular 18/2024/TT-NHNN', 'Thông tư 18/2024/TT-NHNN'), rule: L('Card fees must be disclosed, and a card can be locked or unlocked under the card contract.', 'Phí thẻ phải được công bố, và thẻ có thể được khóa hoặc mở theo hợp đồng thẻ.') },
      { source: L('SBV Circular 39/2016/TT-NHNN', 'Thông tư 39/2016/TT-NHNN'), rule: L('An overdraft on a payment account is a form of lending, so it runs under an agreed limit.', 'Thấu chi trên tài khoản thanh toán là một hình thức cho vay, nên thực hiện trong hạn mức đã thỏa thuận.') },
      { source: L('Banking Code of Practice (ABA)', 'Banking Code of Practice (ABA)'), rule: L('Australian banks that subscribe commit to clear information about fees and to helping customers in difficulty.', 'Các ngân hàng Úc tham gia cam kết cung cấp thông tin rõ ràng về phí và hỗ trợ khách gặp khó khăn.') },
    ],
    sop: [
      L('Check the fee is on the published tariff and the customer’s contract.', 'Kiểm tra phí có trong biểu phí công bố và hợp đồng của khách.'),
      L('Take what the balance covers: Dr 2010.', 'Thu phần số dư đủ trả: Nợ 2010.'),
      L('Book the rest as the overdraft: Dr 1310, within the agreed limit.', 'Ghi phần còn lại vào thấu chi: Nợ 1310, trong hạn mức đã thỏa thuận.'),
      L('Credit the whole fee to income: Cr 4520.', 'Ghi Có toàn bộ phí vào thu nhập: Có 4520.'),
      L('A fee that would breach the limit is held, not forced through; notify the customer either way.', 'Khoản phí làm vượt hạn mức thì tạm giữ, không ép thu; luôn thông báo cho khách.'),
    ],
    redFlags: [
      L('A fee that is not on the tariff, or was charged twice in the period.', 'Khoản phí không có trong biểu phí, hoặc bị thu hai lần trong kỳ.'),
      L('A negative balance with no overdraft booked on TK 1310.', 'Số dư âm nhưng không ghi nhận thấu chi tại TK 1310.'),
      L('A lock fee charged on a card reported stolen, which may be against the tariff’s terms.', 'Thu phí khóa thẻ với thẻ báo mất cắp, có thể trái với điều kiện của biểu phí.'),
    ],
    diagrams: [
      { title: L('$45 annual fee on a $20 balance: the statement shows -$25', 'Phí thường niên $45 với số dư $20: sao kê hiển thị -$25'), lines: exampleJournal('fee-annual-45') },
      { title: L('$10 card lock / issuance fee', 'Phí khóa / phát hành thẻ $10'), lines: exampleJournal('fee-card-10') },
    ],
    keywords: ['annual fee', 'phi thuong nien', 'card lock', 'khoa the', 'issuance', 'phat hanh the', 'overdraft', 'thau chi', 'so du am', 'negative balance', '1310', 'rc 62'],
  },
];

export interface OpsFlashcard {
  id: string;
  sub: OpsSubProcessId;
  front: Localized<string>;
  lines: readonly OpsLine[];
  rule: Localized<string>;
  reference: Localized<string>;
}

export const OPS_FLASHCARDS: readonly OpsFlashcard[] = [
  { id: 'electric', sub: 'bill-pay', front: L('A customer with $900 pays an $85 electric bill at the shop terminal. What posts?', 'Khách có $900 trả hóa đơn điện $85 tại máy ở cửa hàng. Ghi nhận thế nào?'), lines: exampleJournal('bill-electric-85'), rule: L('Covered by available funds: RC 00, and the money goes to the biller’s bank.', 'Đủ số dư khả dụng: RC 00, và tiền chuyển sang ngân hàng của nhà cung cấp.'), reference: L('Decree 52/2024/ND-CP', 'Nghị định 52/2024/NĐ-CP') },
  { id: 'nsf', sub: 'bill-pay', front: L('A $250 water bill arrives on an account holding $120. What posts?', 'Hóa đơn nước $250 đến khi tài khoản có $120. Ghi nhận thế nào?'), lines: exampleJournal('bill-water-250'), rule: L('RC 51: the bill is returned unpaid, nothing reaches the biller, and only the $15 NSF fee posts.', 'RC 51: hóa đơn bị trả lại, nhà cung cấp không nhận gì, chỉ ghi nhận phí NSF $15.'), reference: L('SBV Circular 17/2024/TT-NHNN', 'Thông tư 17/2024/TT-NHNN') },
  { id: 'momo', sub: 'wallet-qr', front: L('A customer tops up their MoMo wallet with $100. What does the bank owe, and to whom?', 'Khách nạp $100 vào ví MoMo. Ngân hàng phải trả gì, cho ai?'), lines: exampleJournal('wallet-cashin-100'), rule: L('The bank owes the wallet provider until settlement. The wallet must be in the holder’s own name.', 'Ngân hàng phải trả đơn vị ví đến khi quyết toán. Ví phải đứng tên chính chủ.'), reference: L('SBV Circular 40/2024/TT-NHNN', 'Thông tư 40/2024/TT-NHNN') },
  { id: 'vietqr', sub: 'wallet-qr', front: L('A $45 dynamic VietQR is scanned. What must happen, and how fast?', 'Quét VietQR động $45. Điều gì phải xảy ra, và nhanh đến đâu?'), lines: exampleJournal('qr-45'), rule: L('CRC and name check, fraud score, then pacs.008 and pacs.002 ACSC within the 5-second SLA.', 'Kiểm tra CRC và tên, chấm điểm gian lận, rồi pacs.008 và pacs.002 ACSC trong SLA 5 giây.'), reference: L('SBV standard TCCS 03:2018', 'TCCS 03:2018/NHNN') },
  { id: 'crc', sub: 'wallet-qr', front: L('A scanned QR fails its CRC-16 check. Should the bank send it?', 'Mã QR quét sai CRC-16. Ngân hàng có gửi không?'), lines: [], rule: L('No: the code may have been altered. Nothing posts, and the payment is refused before any money moves.', 'Không: mã có thể đã bị sửa. Không ghi nhận gì, giao dịch bị từ chối trước khi tiền dịch chuyển.'), reference: L('SBV standard TCCS 03:2018', 'TCCS 03:2018/NHNN') },
  { id: 'atm', sub: 'atm-napas', front: L('A $100 withdrawal over the domestic switch (NAPAS): who gets what from the $101.65?', 'Rút $100 qua NAPAS: ai nhận phần nào trong $101.65?'), lines: exampleJournal('atm-withdraw-100'), rule: L('$100 is the cash, $1.10 is the bank’s income, and $0.55 is only held for the domestic switch (NAPAS).', '$100 là tiền mặt, $1.10 là thu nhập của ngân hàng, $0.55 chỉ giữ hộ NAPAS.'), reference: L('SBV Circular 36/2012/TT-NHNN', 'Thông tư 36/2012/TT-NHNN') },
  { id: 'partial', sub: 'atm-napas', front: L('The cassette holds $60 and the customer asks for $100. What does the ATM do?', 'Hộp tiền còn $60 và khách rút $100. ATM làm gì?'), lines: [], rule: L('It refuses: an ATM never pays out part of a withdrawal. Nothing posts, and the cassette is refilled.', 'Từ chối: ATM không bao giờ chi một phần. Không ghi nhận gì, và hộp tiền được tiếp quỹ.'), reference: L('SBV Circular 36/2012/TT-NHNN', 'Thông tư 36/2012/TT-NHNN') },
  { id: 'jam', sub: 'cassette-jam', front: L('$200 is debited, then the dispenser jams. Where does the money go?', '$200 đã bị trừ rồi máy kẹt tiền. Số tiền đi đâu?'), lines: exampleJournal('atm-jam-200'), rule: L('To TK 2930 ATM Suspense, with an EOD ticket: it belongs to nobody until the cash count.', 'Vào TK 2930 Treo ATM kèm phiếu cuối ngày: chưa thuộc về ai đến khi kiểm quỹ.'), reference: L('SBV Circular 36/2012/TT-NHNN', 'Thông tư 36/2012/TT-NHNN') },
  { id: 'refund', sub: 'cassette-jam', front: L('The cash count shows the $200 stayed in the machine. How is the ticket closed?', 'Kiểm quỹ cho thấy $200 còn trong máy. Đóng phiếu thế nào?'), lines: exampleTicketClose('REFUNDED'), rule: L('Refund the customer from suspense. TK 2930 goes back to zero.', 'Hoàn tiền cho khách từ tài khoản treo. TK 2930 về 0.'), reference: L('SBV Circular 36/2012/TT-NHNN', 'Thông tư 36/2012/TT-NHNN') },
  { id: 'taken', sub: 'cassette-jam', front: L('The electronic journal shows the customer did take the $200. How is the ticket closed?', 'Nhật ký điện tử cho thấy khách đã nhận $200. Đóng phiếu thế nào?'), lines: exampleTicketClose('DISPENSED'), rule: L('The notes have left the machine: suspense clears against the ATM’s cash, with no refund.', 'Tiền đã rời máy: tài khoản treo tất toán với tiền mặt ATM, không hoàn tiền.'), reference: L('SBV Circular 36/2012/TT-NHNN', 'Thông tư 36/2012/TT-NHNN') },
  { id: 'low', sub: 'cassette-jam', front: L('A cassette reports 12% remaining. Does the ATM stop?', 'Hộp tiền báo còn 12%. ATM có dừng không?'), lines: [], rule: L('No: under 15% raises a CIT refill alert while the ATM keeps paying what it can cover. An alert posts no journal.', 'Không: dưới 15% phát cảnh báo tiếp quỹ CIT, ATM vẫn chi khi còn đủ tiền. Cảnh báo không ghi bút toán.'), reference: L('SBV Circular 01/2014/TT-NHNN', 'Thông tư 01/2014/TT-NHNN') },
  { id: 'deposit', sub: 'teller-vault', front: L('A customer pays in $5,000 at the counter. What posts?', 'Khách nộp $5,000 tại quầy. Ghi nhận thế nào?'), lines: exampleJournal('teller-deposit-5000'), rule: L('The cash rises and the bank owes the customer more. Both sides are in the same currency and amount.', 'Tiền mặt tăng và ngân hàng nợ khách nhiều hơn. Hai vế cùng loại tiền và số tiền.'), reference: L('SBV Circular 01/2014/TT-NHNN', 'Thông tư 01/2014/TT-NHNN') },
  { id: 'till', sub: 'teller-vault', front: L('A deposit takes the till to $52,500. What must happen next?', 'Khoản nộp đưa ngăn kéo lên $52,500. Việc tiếp theo là gì?'), lines: exampleVaultTransfer(), rule: L('The counter locks. Two people move everything above the $25,000 float to the vault. The GL total of 1011 is unchanged.', 'Quầy bị khóa. Hai người chuyển phần trên mức $25,000 về kho quỹ. Tổng TK 1011 không đổi.'), reference: L('SBV Circular 01/2014/TT-NHNN', 'Thông tư 01/2014/TT-NHNN') },
  { id: 'annual', sub: 'card-fees', front: L('A $45 annual fee hits an account holding $20. What does the bank’s book show?', 'Phí thường niên $45 đến khi tài khoản có $20. Sổ ngân hàng ghi gì?'), lines: exampleJournal('fee-annual-45'), rule: L('$20 from CASA and $25 as an overdraft on 1310: the statement shows -$25.', '$20 từ CASA và $25 thấu chi tại 1310: sao kê hiển thị -$25.'), reference: L('SBV Circular 39/2016/TT-NHNN', 'Thông tư 39/2016/TT-NHNN') },
  { id: 'lock', sub: 'card-fees', front: L('A customer pays the $10 card lock fee from a healthy balance. What posts?', 'Khách trả phí khóa thẻ $10 từ số dư đủ. Ghi nhận thế nào?'), lines: exampleJournal('fee-card-10'), rule: L('A simple fee. After the lock, authorisations answer RC 62, restricted card.', 'Khoản phí đơn giản. Sau khi khóa, các lần cấp phép trả RC 62, thẻ bị hạn chế.'), reference: L('SBV Circular 18/2024/TT-NHNN', 'Thông tư 18/2024/TT-NHNN') },
];

export interface OpsQuizOption {
  text: Localized<string>;
  /** Why this option is right or wrong. */
  why: Localized<string>;
}

export interface OpsQuizQuestion {
  id: string;
  sub: OpsSubProcessId;
  question: Localized<string>;
  options: readonly OpsQuizOption[];
  correct: number;
}

const opt = (enText: string, viText: string, enWhy: string, viWhy: string): OpsQuizOption => ({ text: L(enText, viText), why: L(enWhy, viWhy) });

export const OPS_QUIZ: readonly OpsQuizQuestion[] = [
  {
    id: 'nsf-posting',
    sub: 'bill-pay',
    question: L('A $250 bill is returned for lack of funds on a $120 balance. What posts?', 'Hóa đơn $250 bị trả lại do thiếu tiền với số dư $120. Ghi nhận thế nào?'),
    correct: 1,
    options: [
      opt('Dr 2010 $250 / Cr 1113 $250', 'Nợ 2010 $250 / Có 1113 $250', 'That pays the bill, which RC 51 refused.', 'Bút toán này trả hóa đơn, điều mà RC 51 đã từ chối.'),
      opt('Dr 2010 $15 / Cr 4510 $15', 'Nợ 2010 $15 / Có 4510 $15', 'Right: the bill never moves, and only the NSF fee posts.', 'Đúng: hóa đơn không dịch chuyển, chỉ ghi nhận phí NSF.'),
      opt('Dr 2010 $120 / Cr 1113 $120', 'Nợ 2010 $120 / Có 1113 $120', 'A partial payment: the bank does not part-pay a bill.', 'Thanh toán một phần: ngân hàng không trả một phần hóa đơn.'),
      opt('Nothing posts at all', 'Không ghi nhận gì', 'The tariff’s NSF fee is still charged.', 'Phí NSF theo biểu phí vẫn được thu.'),
    ],
  },
  {
    id: 'rc-code',
    sub: 'bill-pay',
    question: L('Which response code tells the terminal the balance was too low?', 'Mã phản hồi nào báo cho máy biết số dư quá thấp?'),
    correct: 2,
    options: [
      opt('00', '00', '00 means approved.', '00 nghĩa là chấp thuận.'),
      opt('91', '91', '91 means the issuer or switch is unavailable.', '91 nghĩa là ngân hàng phát hành hoặc chuyển mạch không sẵn sàng.'),
      opt('51', '51', 'Right: 51 is insufficient funds.', 'Đúng: 51 là không đủ số dư.'),
      opt('62', '62', '62 is a restricted card, as after a card lock.', '62 là thẻ bị hạn chế, như sau khi khóa thẻ.'),
    ],
  },
  {
    id: 'wallet-account',
    sub: 'wallet-qr',
    question: L('Which account takes the credit when a customer tops up a wallet?', 'Tài khoản nào ghi Có khi khách nạp ví?'),
    correct: 0,
    options: [
      opt('1950 Wallet Settlement', '1950 Quyết toán ví', 'Right: the bank owes the provider until settlement.', 'Đúng: ngân hàng phải trả đơn vị ví đến khi quyết toán.'),
      opt('1113 Interbank', '1113 Liên ngân hàng', 'That is for payments sent to another bank, like a QR.', 'Đó là khoản chuyển sang ngân hàng khác, như QR.'),
      opt('4520 Fee income', '4520 Thu phí', 'A top-up is the customer’s money, not the bank’s income.', 'Tiền nạp là của khách, không phải thu nhập của ngân hàng.'),
      opt('2930 ATM Suspense', '2930 Treo ATM', 'Nothing has failed, so nothing needs parking.', 'Không có lỗi nên không cần treo.'),
    ],
  },
  {
    id: 'qr-sla',
    sub: 'wallet-qr',
    question: L('In this simulator, what is the instant VietQR clearing SLA?', 'Trong mô phỏng này, SLA bù trừ VietQR tức thời là bao nhiêu?'),
    correct: 1,
    options: [
      opt('End of day', 'Cuối ngày', 'That is batch settlement, not real-time payment.', 'Đó là quyết toán theo lô, không phải thanh toán tức thời.'),
      opt('5 seconds or less', 'Tối đa 5 giây', 'Right: pacs.002 ACSC must return within 5 seconds.', 'Đúng: pacs.002 ACSC phải về trong 5 giây.'),
      opt('30 minutes', '30 phút', 'Far too slow for a customer standing at a till.', 'Quá chậm với khách đang đứng tại quầy thu ngân.'),
      opt('T+1', 'T+1', 'T+1 is next-day settlement, not instant.', 'T+1 là quyết toán ngày hôm sau, không phải tức thời.'),
    ],
  },
  {
    id: 'atm-total',
    sub: 'atm-napas',
    question: L('How much is debited from CASA for a $100 withdrawal here?', 'Rút $100 tại đây thì CASA bị ghi nợ bao nhiêu?'),
    correct: 3,
    options: [
      opt('$100.00', '$100.00', 'That leaves out both fees.', 'Thiếu cả hai khoản phí.'),
      opt('$100.55', '$100.55', 'That leaves out the bank’s own $1.10 fee.', 'Thiếu phí $1.10 của ngân hàng.'),
      opt('$101.10', '$101.10', 'That leaves out the $0.55 domestic switch fee (NAPAS).', 'Thiếu phí NAPAS $0.55.'),
      opt('$101.65', '$101.65', 'Right: $100 + $1.10 + $0.55.', 'Đúng: $100 + $1.10 + $0.55.'),
    ],
  },
  {
    id: 'napas-owner',
    sub: 'atm-napas',
    question: L('Why is the $0.55 credited to 3510 rather than to fee income?', 'Vì sao $0.55 ghi Có vào 3510 thay vì thu phí?'),
    correct: 0,
    options: [
      opt('It is owed to the domestic switch (NAPAS), not earned by the bank', 'Đó là khoản phải trả NAPAS, không phải thu nhập', 'Right: it is held only until tonight’s settlement.', 'Đúng: chỉ giữ hộ đến khi quyết toán đêm nay.'),
      opt('It is the customer’s deposit', 'Đó là tiền gửi của khách', 'The customer has already paid it away.', 'Khách đã trả khoản này rồi.'),
      opt('It is a fine for an AML breach', 'Đó là tiền phạt AML', 'No AML rule is involved in an ATM fee.', 'Phí ATM không liên quan quy định AML.'),
      opt('It covers the cash itself', 'Đó là tiền mặt', 'The cash is the $100 credited to 1011.', 'Tiền mặt là $100 ghi Có vào 1011.'),
    ],
  },
  {
    id: 'jam-entry',
    sub: 'cassette-jam',
    question: L('$200 is debited and the dispenser jams. Which entry is right?', '$200 đã trừ và máy kẹt tiền. Bút toán nào đúng?'),
    correct: 2,
    options: [
      opt('Dr 2010 / Cr 1011', 'Nợ 2010 / Có 1011', 'This says the notes left the machine, which nobody knows yet.', 'Bút toán này nói tiền đã rời máy, điều chưa ai biết.'),
      opt('No entry until the customer complains', 'Không ghi cho đến khi khách khiếu nại', 'The debit has happened, so the book must show where the money is.', 'Đã trừ tiền nên sổ phải cho thấy tiền đang ở đâu.'),
      opt('Dr 2010 / Cr 2930', 'Nợ 2010 / Có 2930', 'Right: it waits in suspense, with a ticket, for the cash count.', 'Đúng: tiền chờ ở tài khoản treo, kèm phiếu, đến khi kiểm quỹ.'),
      opt('Dr 4520 / Cr 2010', 'Nợ 4520 / Có 2010', 'A jam is not a fee reversal.', 'Kẹt tiền không phải đảo phí.'),
    ],
  },
  {
    id: 'jam-refund-timing',
    sub: 'cassette-jam',
    question: L('When should a jammed customer be refunded?', 'Khi nào hoàn tiền cho khách bị kẹt tiền?'),
    correct: 1,
    options: [
      opt('Immediately, before any check', 'Ngay lập tức, trước mọi kiểm tra', 'If the notes were taken, the customer is paid twice.', 'Nếu khách đã nhận tiền, họ sẽ được trả hai lần.'),
      opt('Once the cash count and the journal show the notes stayed', 'Khi kiểm quỹ và nhật ký cho thấy tiền còn trong máy', 'Right: evidence first, then Dr 2930 / Cr 2010.', 'Đúng: có bằng chứng trước, rồi Nợ 2930 / Có 2010.'),
      opt('Never: the jam is the customer’s loss', 'Không bao giờ: khách tự chịu', 'The customer did not get the cash and is owed it.', 'Khách chưa nhận tiền và phải được hoàn.'),
      opt('At the end of the financial year', 'Cuối năm tài chính', 'TK 2930 must clear at reconciliation, far sooner.', 'TK 2930 phải tất toán khi đối soát, sớm hơn nhiều.'),
    ],
  },
  {
    id: 'cassette-alert',
    sub: 'cassette-jam',
    question: L('What does the low-cassette alert at under 15% do?', 'Cảnh báo hộp tiền thấp dưới 15% có tác dụng gì?'),
    correct: 3,
    options: [
      opt('Declines every withdrawal', 'Từ chối mọi giao dịch rút', 'The ATM still pays whatever it can cover.', 'ATM vẫn chi khi còn đủ tiền.'),
      opt('Posts Dr 1011 / Cr 2930', 'Ghi Nợ 1011 / Có 2930', 'An alert moves no money and posts nothing.', 'Cảnh báo không dịch chuyển tiền và không ghi bút toán.'),
      opt('Refunds the last customer', 'Hoàn tiền khách gần nhất', 'A low level has nothing to do with past payments.', 'Mức tiền thấp không liên quan giao dịch trước.'),
      opt('Calls for a CIT refill and flags the ATM', 'Yêu cầu tiếp quỹ CIT và gắn cờ ATM', 'Right: a warning badge shows until the refill.', 'Đúng: huy hiệu cảnh báo hiện đến khi tiếp quỹ.'),
    ],
  },
  {
    id: 'till-limit',
    sub: 'teller-vault',
    question: L('A till goes over $50,000. What is the correct step?', 'Ngăn kéo vượt $50,000. Bước đúng là gì?'),
    correct: 0,
    options: [
      opt('Stop serving and transfer the surplus to the vault under dual control', 'Ngừng phục vụ và chuyển phần dư về kho quỹ theo kiểm soát kép', 'Right: the transfer is mandatory and comes first.', 'Đúng: việc chuyển là bắt buộc và phải làm trước.'),
      opt('Finish the queue and transfer at closing', 'Phục vụ hết khách rồi chuyển lúc đóng cửa', 'The till stays exposed all day.', 'Ngăn kéo chịu rủi ro suốt ngày.'),
      opt('Give the surplus to another teller without a record', 'Đưa phần dư cho giao dịch viên khác, không ghi nhận', 'Unrecorded cash breaks dual control.', 'Tiền không ghi nhận vi phạm kiểm soát kép.'),
      opt('Refuse all deposits for the day', 'Từ chối nộp tiền cả ngày', 'The transfer solves it: the counter reopens.', 'Chuyển kho quỹ giải quyết được: quầy mở lại.'),
    ],
  },
  {
    id: 'till-gl',
    sub: 'teller-vault',
    question: L('Does a till-to-vault transfer change total cash in TK 1011?', 'Chuyển từ ngăn kéo về kho quỹ có làm đổi tổng tiền trong TK 1011 không?'),
    correct: 2,
    options: [
      opt('Yes, it rises', 'Có, tăng lên', 'No new cash has entered the bank.', 'Không có tiền mới vào ngân hàng.'),
      opt('Yes, it falls', 'Có, giảm đi', 'No cash has left the bank.', 'Không có tiền rời ngân hàng.'),
      opt('No: it only changes where the cash is', 'Không: chỉ đổi nơi để tiền', 'Right: Dr 1011 (vault) / Cr 1011 (till) nets to zero.', 'Đúng: Nợ 1011 (kho) / Có 1011 (ngăn kéo) có tổng bằng 0.'),
      opt('It depends on the customer’s balance', 'Tùy số dư của khách', 'No customer is involved in the transfer.', 'Việc chuyển không liên quan đến khách.'),
    ],
  },
  {
    id: 'overdraft-split',
    sub: 'card-fees',
    question: L('A $45 fee hits a $20 balance. How do the debits split?', 'Phí $45 đến khi số dư $20. Vế Nợ chia thế nào?'),
    correct: 1,
    options: [
      opt('Dr 2010 $45', 'Nợ 2010 $45', 'A liability cannot honestly go below zero: the shortfall is a receivable.', 'Nợ phải trả không thể âm thực sự: phần thiếu là khoản phải thu.'),
      opt('Dr 2010 $20 and Dr 1310 $25', 'Nợ 2010 $20 và Nợ 1310 $25', 'Right: the customer’s balance runs out, and the rest is owed to the bank.', 'Đúng: số dư của khách hết, phần còn lại khách nợ ngân hàng.'),
      opt('Dr 1310 $45', 'Nợ 1310 $45', 'The $20 balance has to be used first.', 'Phải dùng số dư $20 trước.'),
      opt('Dr 2010 $20, and the $25 is written off', 'Nợ 2010 $20, xóa $25', 'A fee on the contract is owed, not written off.', 'Phí theo hợp đồng là khoản phải trả, không bị xóa.'),
    ],
  },
];

/** The Vietnamese and English sentences a lesson can be found by, in addition to its keywords. */
export const lessonSearchText = (l: OpsLesson): string =>
  [l.summary.en, l.summary.vi, ...l.keywords, ...l.iso.flatMap((i) => [i.message, i.meaning.en, i.meaning.vi]), ...l.rules.flatMap((r) => [r.source.en, r.source.vi, r.rule.en, r.rule.vi]), ...l.sop.flatMap((s) => [s.en, s.vi]), ...l.redFlags.flatMap((r) => [r.en, r.vi])].join(' | ');

/** The older retail guides that belong to the same chapters as the sub-processes. */
const GUIDE_CHAPTER: readonly { anchor: string; chapter: ChapterId; title: Localized<string> }[] = [
  { anchor: 'retail-fees', chapter: 2, title: L('Annual card fees & account maintenance charges', 'Phí thường niên thẻ & phí duy trì tài khoản') },
  { anchor: 'retail-autopay', chapter: 2, title: L('Utility Bill Pay & Direct Debit: NSF penalties', 'Ủy nhiệm thu tự động & phí không đủ số dư (NSF)') },
  { anchor: 'retail-waterfall', chapter: 2, title: L('BNPL & credit debt recovery waterfall', 'Thu hồi nợ BNPL & thứ tự cấn trừ (waterfall)') },
  { anchor: 'retail-wallet-qr', chapter: 4, title: L('e-Wallet & Dynamic QR (MoMo / VietQR)', 'Ví điện tử & thanh toán tức thời VietQR') },
  { anchor: 'retail-atm', chapter: 5, title: L('ATM domestic interbank fees (NAPAS), cash jams & low cassettes', 'Phí ATM liên ngân hàng, kẹt tiền & cảnh báo hết tiền') },
];

/** The reference articles a chapter of the Academy points to. */
export const chapterArticles = (chapter: ChapterId): readonly { anchor: string; title: Localized<string> }[] => [
  ...OPS_SUBPROCESSES.filter((s) => OPS_SUB_CHAPTER[s.id] === chapter).map((s) => ({ anchor: opsLessonAnchor(s.id), title: opsSubProcess(s.id).title })),
  ...GUIDE_CHAPTER.filter((g) => g.chapter === chapter),
];
