/**
 * What the Inspector teaches about one place, in both vocabularies: a "Think of it like" picture for every desk, gate and hardware
 * endpoint (and the CIT Loading Bay), and the Expert view's technical deep-dive (message fields, ledger and locking, regulatory hooks).
 * The four richest pictures stay in data/mentalModels.ts; every other place gets its own short picture here. GL numbers are this
 * simulator's chart of accounts.
 */

import { pick, type Locale, type Localized } from '../i18n/localeCore';
import { DEPARTMENTS, STATIONS, type StationId } from '../sim/topology';
import { modelCopy, modelForStation, type ModelPart } from './mentalModels';

/** A desk, gate or machine, or the CIT Loading Bay (which has no StationId). */
export type KnowledgePlace = StationId | 'BAY';

interface OwnPicture {
  glyph: string;
  copy: Localized<{ title: string; hook: string }>;
}

const P = (glyph: string, en: [string, string], vi: [string, string]): OwnPicture => ({ glyph, copy: { en: { title: en[0], hook: en[1] }, vi: { title: vi[0], hook: vi[1] } } });

/** The places the four mental models do not already picture. */
const OWN_PICTURES: Readonly<Partial<Record<KnowledgePlace, OwnPicture>>> = {
  GATE_POS: P(
    '🛎️',
    ['The shop’s doorbell to the bank', 'Tapping a card rings the bank’s doorbell from the shop: the terminal passes a sealed note (the card’s chip data) through the door and waits a second for a yes or no.'],
    ['Chuông cửa của cửa hàng gọi ngân hàng', 'Chạm thẻ là bấm chuông cửa ngân hàng từ cửa hàng: máy POS đưa một mảnh giấy niêm phong (dữ liệu chip thẻ) qua khe cửa và chờ một giây để nghe “được” hay “không”.'],
  ),
  BNPL: P(
    '🍕',
    ['Splitting a pizza into four slices', 'The shop gets the whole pizza paid today; you eat one slice now and pay for the other three over the next weeks, but only if the bank thinks you can afford them.'],
    ['Chia chiếc pizza thành bốn miếng', 'Cửa hàng được trả đủ cả chiếc pizza ngay hôm nay; bạn trả miếng đầu bây giờ và ba miếng còn lại trong vài tuần tới, nhưng chỉ khi ngân hàng thấy bạn đủ khả năng trả.'],
  ),
  GATE_A2A: P(
    '📬',
    ['An express letter between two banks', 'An instant transfer is a letter in a strict, standard envelope: the gate checks the address and the form are right before anyone opens the safe.'],
    ['Lá thư hỏa tốc giữa hai ngân hàng', 'Chuyển khoản tức thì là một lá thư trong phong bì chuẩn rất nghiêm ngặt: cổng kiểm tra địa chỉ và mẫu thư đúng trước khi ai đó mở két tiền.'],
  ),
  GATE_ATM: P(
    '🔑',
    ['A door with a keypad lock', 'The card is your key and the PIN is the door code. Three wrong codes and the door keeps the key, so a thief cannot keep guessing.'],
    ['Cánh cửa có khóa bàn phím', 'Thẻ là chìa khóa, mã PIN là mật mã cửa. Nhập sai ba lần, cửa giữ luôn chìa khóa, để kẻ gian không thể đoán mãi.'],
  ),
  ATM_CASH: P(
    '🥤',
    ['A vending machine that checks your account first', 'Before a single note drops, the machine asks the bank whether you have the money and whether today’s limit allows it. If notes jam after your account is charged, the money waits in a lost-and-found box until the machine is counted.'],
    ['Máy bán hàng tự động hỏi tài khoản trước', 'Trước khi nhả tờ tiền nào, máy hỏi ngân hàng bạn có đủ tiền và hạn mức hôm nay còn cho phép không. Nếu kẹt tiền sau khi đã trừ tài khoản, khoản tiền nằm trong “hộp đồ thất lạc” cho tới khi máy được kiểm quỹ.'],
  ),
  GATE_EKYC: P(
    '🛂',
    ['Passport control, but on your phone', 'Like a border officer, the app reads your ID card’s chip, checks the face in front of it is real and alive, and compares it with the national register before letting you in.'],
    ['Quầy kiểm tra hộ chiếu, ngay trên điện thoại', 'Như cán bộ cửa khẩu, ứng dụng đọc chip CCCD, kiểm tra khuôn mặt trước camera là người thật đang sống, và đối chiếu với cơ sở dữ liệu dân cư trước khi cho bạn “nhập cảnh”.'],
  ),
  GATE_QR: P(
    '🏷️',
    ['A price tag that knows where the money goes', 'A VietQR code is a sticker holding the shop’s account and, sometimes, the amount. The gate reads it and checks its checksum so a smudged or forged sticker is caught before any money moves.'],
    ['Nhãn giá biết tiền phải đi đâu', 'Mã VietQR là một nhãn dán chứa tài khoản của cửa hàng và đôi khi cả số tiền. Cổng đọc nhãn và kiểm tra mã kiểm (CRC), để nhãn bị mờ hay giả bị phát hiện trước khi tiền di chuyển.'],
  ),
  TELLER_CASH: P(
    '🧮',
    ['A shop till with a strict cashier', 'The teller counts every note twice, checks the fakes under a lamp, keeps the drawer under its limit, and writes down every large cash deal for the regulator.'],
    ['Quầy thu ngân với một thu ngân rất kỹ tính', 'Giao dịch viên đếm mỗi tờ tiền hai lần, soi tiền giả dưới đèn, giữ ngăn kéo dưới hạn mức, và ghi lại mọi giao dịch tiền mặt lớn để báo cáo cơ quan quản lý.'],
  ),
  SEC_FACEPAY: P(
    '🪞',
    ['A mirror that only opens for your face', 'For a big transfer, a password is not enough: the bank holds up a mirror and only lets the money go if the face in it matches the one you enrolled with.'],
    ['Tấm gương chỉ mở với khuôn mặt bạn', 'Với khoản chuyển lớn, mật khẩu là chưa đủ: ngân hàng đưa lên một tấm gương và chỉ cho tiền đi khi khuôn mặt trong gương khớp với khuôn mặt bạn đã đăng ký.'],
  ),
  SEC_FDS: P(
    '🕵️',
    ['A store detective watching the aisles', 'It does not stop every shopper; it watches for odd behaviour (a phone that has been tampered with, a strange location, a hundred card numbers tried in a minute) and flags only those.'],
    ['Nhân viên an ninh quan sát các dãy hàng', 'Họ không chặn mọi khách; họ để ý hành vi lạ (điện thoại bị can thiệp, vị trí bất thường, hàng trăm số thẻ bị thử trong một phút) và chỉ gắn cờ những trường hợp đó.'],
  ),
  AML_DESK: P(
    '🔎',
    ['Customs inspecting the flagged suitcases', 'Most bags pass straight through. The ones the scanner flags are opened by an officer, who either clears them or files a report, and never tells the traveller why.'],
    ['Hải quan mở những chiếc vali bị gắn cờ', 'Phần lớn hành lý đi thẳng. Những chiếc máy soi gắn cờ được cán bộ mở ra kiểm tra: cho qua hoặc lập báo cáo, và không bao giờ nói lý do cho hành khách.'],
  ),
  DISPUTE_DESK: P(
    '🧾',
    ['A returns desk with a strict deadline', 'Bring the receipt in time and the desk claims your money back from the shop’s bank; miss the scheme’s deadline and the claim is closed.'],
    ['Quầy đổi trả có hạn chót nghiêm ngặt', 'Mang hóa đơn tới kịp thời, quầy sẽ đòi lại tiền từ ngân hàng của cửa hàng; trễ hạn của tổ chức thẻ thì yêu cầu bị đóng.'],
  ),
  GATE_SWIFT: P(
    '✈️',
    ['An international courier with a tracking number', 'Money abroad travels like a parcel through partner banks: each one reads the same tracking number (UETR), changes the currency if needed, and checks the parcel against sanctions lists.'],
    ['Dịch vụ chuyển phát quốc tế có mã vận đơn', 'Tiền ra nước ngoài đi như một kiện hàng qua các ngân hàng đối tác: mỗi nơi đọc cùng một mã vận đơn (UETR), đổi ngoại tệ nếu cần và đối chiếu kiện hàng với danh sách cấm vận.'],
  ),
  SAVINGS_DESK: P(
    '🐷',
    ['A piggy bank with a time lock', 'Wait until the lock opens and you get the promised interest; break it early and you only get the small everyday rate.'],
    ['Con heo đất có khóa hẹn giờ', 'Chờ đến lúc khóa mở, bạn nhận đủ lãi đã hứa; đập heo sớm thì chỉ được lãi suất không kỳ hạn rất thấp.'],
  ),
  COLLATERAL_VAULT: P(
    '💍',
    ['A pawnshop that keeps your ring safe', 'Your savings are the ring you leave as a guarantee: they stay yours and frozen while the loan is paid, and the bank takes them only if the loan goes bad.'],
    ['Tiệm cầm đồ giữ chiếc nhẫn của bạn', 'Khoản tiết kiệm là chiếc nhẫn bạn để lại làm bảo đảm: vẫn là của bạn và bị phong tỏa khi khoản vay còn được trả, ngân hàng chỉ lấy khi khoản vay thành nợ xấu.'],
  ),
  STP_ENGINE: P(
    '🏭',
    ['A self-checkout lane', 'Simple, clean cases scan through on their own in milliseconds; anything unusual lights the lamp and a member of staff comes over.'],
    ['Làn tự thanh toán ở siêu thị', 'Hồ sơ đơn giản, sạch sẽ tự quét qua trong vài mili giây; hồ sơ bất thường làm đèn sáng và một nhân viên sẽ tới xử lý.'],
  ),
  MAIN_CASH_VAULT: P(
    '🏰',
    ['The castle’s treasury with two keys', 'All the branch’s paper money sleeps here. The door needs two people with two different keys, and every bag in or out is counted by both.'],
    ['Kho báu của lâu đài cần hai chìa khóa', 'Toàn bộ tiền giấy của chi nhánh “ngủ” ở đây. Cửa cần hai người với hai chìa khóa khác nhau, và mỗi túi tiền ra vào đều được cả hai cùng đếm.'],
  ),
  BAY: P(
    '🚚',
    ['A loading dock with a sealed-parcel check', 'Cash arrives and leaves in sealed bags, like parcels at a warehouse dock: two people check every seal number against the paperwork before the van is loaded or unloaded.'],
    ['Bến bốc hàng kiểm tra kiện niêm phong', 'Tiền mặt đến và đi trong túi niêm phong, như kiện hàng ở bến kho: hai người đối chiếu từng số niêm phong với giấy tờ trước khi xe được chất hoặc dỡ hàng.'],
  ),
};

/** The one "Think of it like" card of a place: its own picture, or the mental model it belongs to (with the model's parts). */
export interface PlacePicture {
  glyph: string;
  accent: string;
  title: string;
  hook: string;
  /** The banking topic, for a mental model. */
  topic?: string;
  parts?: readonly ModelPart[];
  watchOut?: string;
}

const BAY_ACCENT = '#facc15';
const accentOf = (place: KnowledgePlace): string => (place === 'BAY' ? BAY_ACCENT : DEPARTMENTS[STATIONS[place].department].accent);

/** Every place has one: a mental model where one exists, else its own picture. */
export function placePicture(place: KnowledgePlace, locale: Locale): PlacePicture | null {
  const model = place === 'BAY' ? null : modelForStation(place);
  if (model) {
    const c = modelCopy(model.id);
    return { glyph: model.glyph, accent: model.accent, title: c.title, hook: c.hook, topic: c.topic, parts: c.parts, watchOut: c.watchOut };
  }
  const own = OWN_PICTURES[place];
  if (!own) return null;
  const c = pick(own.copy, locale);
  return { glyph: own.glyph, accent: accentOf(place), title: c.title, hook: c.hook };
}

// The Expert view's technical deep-dive

export type DeepDiveAspect = 'message' | 'ledger' | 'compliance';
export const DEEP_DIVE_ASPECTS: readonly DeepDiveAspect[] = ['message', 'ledger', 'compliance'];

type DeepDive = Readonly<Record<DeepDiveAspect, Localized<string>>>;
const D = (message: [string, string], ledger: [string, string], compliance: [string, string]): DeepDive => ({
  message: { en: message[0], vi: message[1] },
  ledger: { en: ledger[0], vi: ledger[1] },
  compliance: { en: compliance[0], vi: compliance[1] },
});

/** Per place: the message and its fields, the posting and how the balance is locked, and the rule or regulator behind it. */
const DEEP_DIVES: Readonly<Record<KnowledgePlace, DeepDive>> = {
  GATE_VIRTUAL: D(
    ['ISO 8583 MTI 0100 carrying a DPAN in DE2, the token cryptogram in DE55 or the e-commerce field, DE11 STAN and DE37 RRN for matching; the reply 0110 returns DE38 auth code and DE39 RC.', 'ISO 8583 MTI 0100 mang DPAN ở DE2, mật mã token ở DE55 hoặc trường thương mại điện tử, DE11 STAN và DE37 RRN để đối chiếu; phản hồi 0110 trả DE38 mã cấp phép và DE39 RC.'],
    ['No posting at the gate: it only routes. Idempotency key = DE11 STAN + DE7 transmission time + DE32 acquirer ID, so a resent 0100 is answered from the first result, never authorised twice.', 'Cổng không hạch toán, chỉ định tuyến. Khóa chống trùng = DE11 STAN + DE7 thời điểm truyền + DE32 mã ngân hàng thanh toán, nên một 0100 gửi lại được trả lời bằng kết quả cũ, không bao giờ cấp phép hai lần.'],
    ['EMVCo Payment Tokenisation: the token is domain-restricted (device, merchant). PCI DSS keeps the FPAN out of this zone entirely.', 'Chuẩn EMVCo Payment Tokenisation: token bị giới hạn phạm vi (thiết bị, cửa hàng). PCI DSS giữ FPAN hoàn toàn ngoài vùng này.'],
  ),
  GATE_POS: D(
    ['ISO 8583 0100/0110: DE3 processing code 00 (purchase), DE4 amount, DE22 entry mode (05 chip, 07 contactless), DE41 terminal ID, DE42 merchant ID, DE18 MCC, DE55 EMV data with the ARQC; the issuer answers with an ARPC and DE39.', 'ISO 8583 0100/0110: DE3 mã xử lý 00 (mua hàng), DE4 số tiền, DE22 phương thức nhập (05 chip, 07 chạm), DE41 mã thiết bị, DE42 mã cửa hàng, DE18 MCC, DE55 dữ liệu EMV kèm ARQC; ngân hàng phát hành trả ARPC và DE39.'],
    ['A late or missing 0110 (RC 68 or a timeout) makes the acquirer send a 0400/0420 reversal, which releases any hold the issuer placed. The MDR is taken from the merchant at settlement, not here.', 'Phản hồi 0110 trễ hoặc mất (RC 68 hay hết giờ) khiến ngân hàng thanh toán gửi lệnh đảo 0400/0420, giải phóng khoản khoanh giữ đã đặt. MDR được trừ của cửa hàng khi quyết toán, không phải tại đây.'],
    ['EMV chip and PIN cuts counterfeit fraud; PIN blocks (DE52) are ISO 9564 and only ever decrypted in an HSM. PCI PTS governs the terminal.', 'Chip EMV và PIN giảm gian lận thẻ giả; khối PIN (DE52) theo ISO 9564 và chỉ được giải mã trong HSM. PCI PTS quản lý thiết bị đầu cuối.'],
  ),
  GATE_ECOM: D(
    ['Card-not-present 0100: the entry mode (DE22) and the e-commerce indicator mark it CNP; a 3DS result travels as the ECI and CAVV. Instalment requests are routed to BNPL instead of the ledger.', 'Giao dịch 0100 không xuất trình thẻ: phương thức nhập (DE22) và chỉ báo thương mại điện tử đánh dấu CNP; kết quả 3DS đi kèm dưới dạng ECI và CAVV. Yêu cầu trả góp được chuyển sang BNPL thay vì sổ cái.'],
    ['Routes only. A merchant retry with the same order reference is de-duplicated before it reaches the hold logic.', 'Chỉ định tuyến. Lần thử lại của cửa hàng với cùng mã đơn hàng được loại trùng trước khi tới bước khoanh giữ.'],
    ['Without a completed 3DS the fraud liability stays with the merchant; with it, liability shifts to the issuer. PCI DSS applies to any PAN it sees.', 'Không hoàn tất 3DS thì trách nhiệm gian lận thuộc cửa hàng; hoàn tất thì trách nhiệm chuyển sang ngân hàng phát hành. PCI DSS áp dụng cho mọi PAN cổng này nhìn thấy.'],
  ),
  SEC_VAULT: D(
    ['Detokenisation call: DPAN in, FPAN plus funding account out, with the token’s status (active, suspended, deleted) and domain checks.', 'Lệnh giải token: DPAN vào, FPAN và tài khoản cấp vốn ra, kèm trạng thái token (hoạt động, tạm ngưng, đã xóa) và kiểm tra phạm vi.'],
    ['Read-only on the token map; a suspended token answers RC 05 or RC 62 before any balance is touched.', 'Chỉ đọc bảng ánh xạ token; token bị tạm ngưng trả RC 05 hoặc RC 62 trước khi động tới số dư.'],
    ['The vault is the PCI DSS cardholder-data environment: keys in an HSM, access logged, FPAN never returned to the merchant.', 'Kho token là vùng dữ liệu chủ thẻ theo PCI DSS: khóa trong HSM, mọi truy cập được ghi log, FPAN không bao giờ trả về cửa hàng.'],
  ),
  SEC_DCVV: D(
    ['The dCVV is recomputed in the HSM from the card key and the time window (or transaction counter) and compared with the value sent; a stale code fails.', 'dCVV được tính lại trong HSM từ khóa thẻ và cửa sổ thời gian (hoặc bộ đếm giao dịch) rồi so với giá trị gửi lên; mã quá hạn sẽ thất bại.'],
    ['No posting. A mismatch declines with RC 05 or RC 82 (CVV failure) and counts toward the card’s velocity limit.', 'Không hạch toán. Sai mã bị từ chối với RC 05 hoặc RC 82 (lỗi CVV) và được tính vào giới hạn tần suất của thẻ.'],
    ['PCI DSS forbids storing a CVV after authorisation, which is why a dynamic one is checked and discarded.', 'PCI DSS cấm lưu CVV sau khi cấp phép, vì thế mã động chỉ được kiểm tra rồi bỏ đi.'],
  ),
  SEC_3DS: D(
    ['EMV 3DS 2.x: AReq/ARes carry the risk data; a challenge runs CReq/CRes with the OTP; the result returns as the ECI (Visa 05 authenticated, 06 attempted) and a CAVV in the authorisation.', 'EMV 3DS 2.x: AReq/ARes mang dữ liệu rủi ro; thử thách chạy CReq/CRes với OTP; kết quả trả về dưới dạng ECI (Visa 05 đã xác thực, 06 đã thử) và CAVV trong lệnh cấp phép.'],
    ['No posting. Repeated wrong OTPs lock the card for online use (this simulator answers RC 75); a challenge that expires ends as not authenticated (RC 05).', 'Không hạch toán. Nhập sai OTP nhiều lần sẽ khóa thẻ cho giao dịch trực tuyến (mô phỏng này trả RC 75); thử thách hết hạn kết thúc ở trạng thái chưa xác thực (RC 05).'],
    ['Strong customer authentication: SBV Decision 2345/QĐ-NHNN requires stronger authentication for online payments; a completed challenge shifts fraud liability to the issuer.', 'Xác thực mạnh: Quyết định 2345/QĐ-NHNN yêu cầu xác thực mạnh hơn cho thanh toán trực tuyến; thử thách hoàn tất chuyển trách nhiệm gian lận sang ngân hàng phát hành.'],
  ),
  LEDGER_DEBIT: D(
    ['Reads DE3 (00 purchase, 01 cash withdrawal) and DE4 amount, and writes DE39: 00 approved, 51 insufficient funds, 61 exceeds the daily withdrawal limit, 62 restricted card.', 'Đọc DE3 (00 mua hàng, 01 rút tiền mặt) và DE4 số tiền, rồi ghi DE39: 00 chấp thuận, 51 không đủ số dư, 61 vượt hạn mức rút ngày, 62 thẻ bị hạn chế.'],
    ['Pessimistic row lock (SELECT … FOR UPDATE) on the account row, then: available = ledger − holds; check the amount and the daily velocity counter; place a memo hold (Dr CASA Hold / Cr Card Settlement Payable); commit. The lock is held for milliseconds only.', 'Khóa dòng bi quan (SELECT … FOR UPDATE) trên tài khoản, rồi: khả dụng = số dư sổ cái − khoanh giữ; kiểm tra số tiền và bộ đếm hạn mức ngày; đặt khoanh giữ (Nợ Khoanh giữ CASA / Có Phải trả quyết toán thẻ); commit. Khóa chỉ giữ trong vài mili giây.'],
    ['Double-entry: every hold has its reversal path (expiry or a 0400). Daily limits per card follow the issuer’s published terms; SBV Circular 18/2024/TT-NHNN governs card operations.', 'Bút toán kép: mỗi khoản khoanh giữ có đường đảo (hết hạn hoặc lệnh 0400). Hạn mức ngày theo điều khoản ngân hàng công bố; Thông tư 18/2024/TT-NHNN điều chỉnh hoạt động thẻ.'],
  ),
  LEDGER_CREDIT: D(
    ['Same 0100/0110 exchange as the debit ledger, against open-to-buy instead of a balance; DE39 = 51 (or 65 for velocity) when the limit is used up.', 'Cùng cặp 0100/0110 như sổ ghi nợ, nhưng so với hạn mức còn lại thay vì số dư; DE39 = 51 (hoặc 65 cho tần suất) khi đã dùng hết hạn mức.'],
    ['Open-to-buy = credit limit − (statement balance + unbilled + holds), computed under the same row lock; the hold becomes a billed transaction at settlement.', 'Hạn mức còn lại = hạn mức tín dụng − (dư nợ sao kê + chưa sao kê + khoanh giữ), tính dưới cùng khóa dòng; khoản khoanh giữ thành giao dịch được ghi nợ khi quyết toán.'],
    ['Credit exposure is classified by debt group (SBV Circular 11/2021/TT-NHNN) and reported to CIC; Basel II credit-risk weights apply to the limit.', 'Dư nợ được phân nhóm nợ (Thông tư 11/2021/TT-NHNN) và báo cáo CIC; trọng số rủi ro tín dụng Basel II áp dụng trên hạn mức.'],
  ),
  BNPL: D(
    ['An instalment request from the e-commerce gate with the basket amount and the customer ID; the decision returns an approve or decline (RC 05 above the DTI cut-off) to the merchant.', 'Yêu cầu trả góp từ cổng thương mại điện tử kèm giá trị giỏ hàng và mã khách; quyết định trả về chấp thuận hoặc từ chối (RC 05 khi vượt ngưỡng DTI) cho cửa hàng.'],
    ['On approval the merchant is paid in full and the remaining three instalments are booked on loan account 1320; repayments are applied penalty, then interest, then principal.', 'Khi duyệt, cửa hàng nhận đủ tiền và ba kỳ còn lại được ghi vào TK cho vay 1320; khoản trả nợ được cấn trừ theo thứ tự phạt, lãi, rồi gốc.'],
    ['Affordability: DTI above 45% is refused, above 36% is watched. Expected credit loss under IFRS 9 is provisioned from day one; overdue loans migrate debt groups and are reported to CIC.', 'Khả năng chi trả: DTI trên 45% bị từ chối, trên 36% được theo dõi. Tổn thất tín dụng dự kiến theo IFRS 9 được trích lập ngay từ đầu; khoản quá hạn chuyển nhóm nợ và báo cáo CIC.'],
  ),
  EOD_BATCH: D(
    ['At the 23:00 cut-off the day’s approved authorisations are matched to the merchants’ presentments (by RRN, auth code and amount) and written into the clearing file.', 'Tại giờ chốt 23:00, các lần cấp phép được duyệt trong ngày được khớp với chứng từ của cửa hàng (theo RRN, mã cấp phép và số tiền) và ghi vào tệp bù trừ.'],
    ['Batch job with a business-date lock: postings stamped after cut-off roll to the next business date. A failed batch restarts from its last checkpoint, never from zero.', 'Tác vụ theo lô có khóa ngày nghiệp vụ: bút toán sau giờ chốt chuyển sang ngày nghiệp vụ kế tiếp. Lô lỗi chạy lại từ điểm kiểm tra cuối, không chạy lại từ đầu.'],
    ['Card-scheme clearing timeframes: a presentment arriving too late can be charged back. The audit trail of every file is retained for inspection.', 'Thời hạn bù trừ của tổ chức thẻ: chứng từ đến quá trễ có thể bị đòi bồi hoàn. Dấu vết kiểm toán của mọi tệp được lưu để thanh tra.'],
  ),
  EOD_VISA: D(
    ['The scheme settles the net position of all issuers and acquirers for the day; the bank receives its settlement report with interchange and scheme fees.', 'Tổ chức thẻ quyết toán vị thế ròng của mọi ngân hàng phát hành và thanh toán trong ngày; ngân hàng nhận báo cáo quyết toán kèm phí chuyển mạch và phí tổ chức thẻ.'],
    ['Holds become real postings: Dr Customer / Cr CASA Hold, and the net amount moves through the settlement (Nostro) account.', 'Khoản khoanh giữ thành bút toán thật: Nợ Khách hàng / Có Khoanh giữ CASA, và số ròng đi qua tài khoản quyết toán (Nostro).'],
    ['Settlement risk is intraday liquidity risk: the bank must fund its net debit position on time (SBV liquidity ratios, Basel III LCR).', 'Rủi ro quyết toán là rủi ro thanh khoản trong ngày: ngân hàng phải cấp đủ vốn cho vị thế nợ ròng đúng hạn (tỷ lệ thanh khoản của NHNN, LCR theo Basel III).'],
  ),
  RECON: D(
    ['Three-way match on RRN, STAN, auth code, amount and date between the core ledger, the scheme clearing file and the switch’s report.', 'Đối soát 3 bên theo RRN, STAN, mã cấp phép, số tiền và ngày giữa sổ cái lõi, tệp bù trừ của tổ chức thẻ và báo cáo của bộ chuyển mạch.'],
    ['A break is never forced to match: it is posted to suspense with a reason code and an owner, and aged daily until it is resolved.', 'Sai lệch không bao giờ bị ép cho khớp: được ghi vào tài khoản treo kèm mã lý do và người phụ trách, và được theo dõi tuổi nợ hằng ngày tới khi xử lý xong.'],
    ['Reconciliation is a key operational-risk control under Basel II (SBV Circular 41/2016/TT-NHNN capital adequacy); unreconciled items are an audit finding.', 'Đối soát là kiểm soát rủi ro hoạt động trọng yếu theo Basel II (Thông tư 41/2016/TT-NHNN về an toàn vốn); khoản chưa đối soát là phát hiện kiểm toán.'],
  ),
  SUSPENSE: D(
    ['Holds the unmatched records with their original references (RRN, STAN, file name) so the break can be traced back to its source message.', 'Giữ các bản ghi không khớp kèm tham chiếu gốc (RRN, STAN, tên tệp) để truy ngược sai lệch về thông điệp nguồn.'],
    ['Every item is posted in and out by double entry and aged in buckets (0–7, 8–30, 30+ days); clearing it reverses into the right customer or income account.', 'Mỗi khoản vào và ra đều bằng bút toán kép và được phân nhóm tuổi (0–7, 8–30, trên 30 ngày); khi xử lý xong được đảo về đúng tài khoản khách hoặc thu nhập.'],
    ['A suspense balance must not be left open: old items are escalated and may need provisioning, and they are reviewed by internal audit.', 'Số dư treo không được để tồn đọng: khoản lâu ngày phải báo cáo cấp trên và có thể phải trích lập dự phòng, và được kiểm toán nội bộ rà soát.'],
  ),
  GATE_A2A: D(
    ['ISO 20022 pacs.008 (FI-to-FI customer credit transfer) in, pacs.002 status report out; the EndToEndId and UETR travel unchanged to the end.', 'ISO 20022 pacs.008 (chuyển khoản khách hàng giữa các tổ chức) vào, báo cáo trạng thái pacs.002 ra; EndToEndId và UETR đi nguyên vẹn tới cuối.'],
    ['Schema validation happens before any balance is locked; a duplicate message ID is rejected, never posted twice.', 'Kiểm tra cấu trúc diễn ra trước khi khóa bất kỳ số dư nào; mã thông điệp trùng bị từ chối, không bao giờ hạch toán hai lần.'],
    ['Instant payments still pass sanctions and AML screening (Law on AML 14/2022/QH15); NAPAS 247 sets the round-the-clock SLA.', 'Thanh toán tức thì vẫn qua sàng lọc cấm vận và AML (Luật Phòng, chống rửa tiền 14/2022/QH15); NAPAS 247 đặt SLA hoạt động liên tục.'],
  ),
  GATE_ATM: D(
    ['ISO 8583 0200 financial request from the ATM: DE3 01xxxx (cash withdrawal) or 21xxxx (deposit), DE41 terminal ID, DE52 encrypted PIN block, DE35 track-2 or DE55 chip data.', 'ISO 8583 0200 yêu cầu tài chính từ ATM: DE3 01xxxx (rút tiền) hoặc 21xxxx (nộp tiền), DE41 mã máy, DE52 khối PIN mã hóa, DE35 dữ liệu track-2 hoặc DE55 dữ liệu chip.'],
    ['The PIN is translated in the HSM from the terminal key (TPK) to the switch key (ZPK) and verified; a wrong PIN answers RC 55, and the third wrong try RC 75 with the card retained.', 'PIN được chuyển khóa trong HSM từ khóa thiết bị (TPK) sang khóa chuyển mạch (ZPK) rồi xác minh; sai PIN trả RC 55, sai lần thứ ba trả RC 75 và giữ thẻ.'],
    ['ISO 9564 PIN security and PCI PIN requirements: the clear PIN never exists outside the HSM or the encrypting PIN pad.', 'Bảo mật PIN theo ISO 9564 và yêu cầu PCI PIN: PIN dạng rõ không bao giờ tồn tại ngoài HSM hoặc bàn phím mã hóa PIN.'],
  ),
  ATM_CASH: D(
    ['Answers the 0200 with a 0210: DE39 00 dispenses, 51 insufficient funds, 61 exceeds the daily withdrawal limit, 65 too many withdrawals. A dispense fault sends a 0420 reversal advice.', 'Trả lời 0200 bằng 0210: DE39 00 thì nhả tiền, 51 không đủ số dư, 61 vượt hạn mức rút ngày, 65 vượt số lần rút. Lỗi nhả tiền gửi thông báo đảo 0420.'],
    ['Withdrawal: Dr 2010 $101.65 / Cr 1011 $100 + Cr 4520 $1.10 + Cr 3510 $0.55. A jam after the debit parks the amount in 2930 ATM suspense until the cassette count proves what was dispensed.', 'Rút tiền: Nợ 2010 $101.65 / Có 1011 $100 + Có 4520 $1.10 + Có 3510 $0.55. Kẹt tiền sau khi trừ tài khoản thì treo khoản tiền ở TK 2930 cho tới khi kiểm đếm hộp tiền chứng minh số đã nhả.'],
    ['Cassette level below 15% raises a CIT refill; cash-in-machine is counted under dual control, and NAPAS interchange is settled at EOD.', 'Hộp tiền dưới 15% phát cảnh báo tiếp quỹ CIT; tiền trong máy được kiểm đếm theo kiểm soát kép, và phí chuyển mạch NAPAS được quyết toán cuối ngày.'],
  ),
  GATE_EKYC: D(
    ['OCR of the CCCD, an NFC read of its chip (ICAO 9303) to get the signed photo, passive liveness on the selfie, then a match against the national population database (C06).', 'OCR CCCD, đọc chip qua NFC (ICAO 9303) để lấy ảnh có chữ ký số, kiểm tra liveness thụ động trên selfie, rồi đối chiếu với Cơ sở dữ liệu quốc gia về dân cư (C06).'],
    ['The CASA is created only after every check passes; the opening deposit posts Dr 1410 Instant Settlement / Cr 2010 Customer CASA.', 'CASA chỉ được tạo sau khi mọi bước kiểm tra đạt; khoản nộp mở tài khoản hạch toán Nợ 1410 Quyết toán tức thì / Có 2010 CASA của khách.'],
    ['SBV Circular 17/2024/TT-NHNN on remote account opening (biometrics and chip-based ID required); customer due diligence under the Law on AML 2022.', 'Thông tư 17/2024/TT-NHNN về mở tài khoản từ xa (bắt buộc sinh trắc học và CCCD gắn chip); nhận biết khách hàng theo Luật Phòng, chống rửa tiền 2022.'],
  ),
  GATE_QR: D(
    ['Parses the EMVCo QR TLV: tag 01 = 11 static or 12 dynamic, tag 38 NAPAS account info, tag 53 = 704 (VND), tag 54 amount, tag 63 CRC-16/CCITT checksum. A bad CRC is refused before anything else.', 'Phân tích TLV của QR EMVCo: thẻ 01 = 11 tĩnh hoặc 12 động, thẻ 38 thông tin tài khoản NAPAS, thẻ 53 = 704 (VND), thẻ 54 số tiền, thẻ 63 mã kiểm CRC-16/CCITT. CRC sai bị từ chối trước mọi bước khác.'],
    ['The decoded payment becomes a NAPAS 247 transfer; the payer’s account is locked and debited only after screening passes.', 'Giao dịch đã giải mã trở thành lệnh chuyển NAPAS 247; tài khoản người trả chỉ bị khóa và ghi nợ sau khi sàng lọc đạt.'],
    ['VietQR follows the NAPAS and EMVCo merchant-presented QR standard; device risk (rooted phones) is checked by the FDS.', 'VietQR theo chuẩn QR do cửa hàng hiển thị của NAPAS và EMVCo; rủi ro thiết bị (điện thoại đã root) được FDS kiểm tra.'],
  ),
  TELLER_CASH: D(
    ['A teller transaction carries the till ID, teller ID, denominations and any suspect-note serials; cash at or above $10,000 raises a CTR record.', 'Giao dịch quầy mang mã ngăn kéo, mã giao dịch viên, mệnh giá và số seri tiền nghi vấn; tiền mặt từ $10,000 trở lên tạo bản ghi CTR.'],
    ['Deposit: Dr 1012 Teller Till / Cr 2010 Customer CASA (reverse for a withdrawal). A till over $50,000 locks the counter until the surplus goes to the vault: Dr vault / Cr till.', 'Nộp tiền: Nợ 1012 Quỹ tại quầy / Có 2010 CASA của khách (ngược lại khi rút). Ngăn kéo vượt $50,000 sẽ khóa quầy tới khi phần dư chuyển về kho: Nợ kho / Có ngăn kéo.'],
    ['Large-cash reporting: $10,000 in this simulator (AUSTRAC TTR style); in Vietnam the threshold is VND 400 million (Decision 11/2023/QĐ-TTg). Structuring below it is an STR trigger.', 'Báo cáo tiền mặt lớn: $10,000 trong mô phỏng này (theo kiểu TTR của AUSTRAC); tại Việt Nam ngưỡng là 400 triệu đồng (Quyết định 11/2023/QĐ-TTg). Chia nhỏ dưới ngưỡng là dấu hiệu phải lập STR.'],
  ),
  SEC_FACEPAY: D(
    ['A face match score against the template enrolled at onboarding, with a liveness check; the transfer carries the verification result to the core.', 'Điểm so khớp khuôn mặt với mẫu đã đăng ký khi mở tài khoản, kèm kiểm tra liveness; lệnh chuyển mang kết quả xác thực về hệ thống lõi.'],
    ['No posting until the face check passes; a failure ends the transfer before any balance is locked.', 'Không hạch toán cho tới khi xác thực khuôn mặt đạt; thất bại sẽ dừng lệnh chuyển trước khi khóa số dư.'],
    ['SBV Decision 2345/QĐ-NHNN: biometric authentication for an online transfer above VND 10 million, or above VND 20 million in a day.', 'Quyết định 2345/QĐ-NHNN: xác thực sinh trắc học cho giao dịch chuyển tiền trực tuyến trên 10 triệu đồng, hoặc tổng trên 20 triệu đồng trong ngày.'],
  ),
  SEC_FDS: D(
    ['Scores each event on device fingerprint, IP and geolocation, velocity and BIN-attack patterns; a high score holds the payment or forces a challenge.', 'Chấm điểm mỗi sự kiện theo dấu chân thiết bị, IP và vị trí, tần suất và mẫu tấn công dò BIN; điểm cao sẽ giữ giao dịch hoặc buộc xác thực thêm.'],
    ['Decisions are recorded with their rule IDs so a held payment can be released or declined later without re-scoring.', 'Mỗi quyết định được lưu kèm mã quy tắc để giao dịch bị giữ có thể được giải phóng hoặc từ chối sau mà không cần chấm điểm lại.'],
    ['Runs automated AML screening (Law on AML 2022, Circular 09/2023/TT-NHNN) alongside fraud rules; alerts go to the AML desk.', 'Chạy sàng lọc AML tự động (Luật Phòng, chống rửa tiền 2022, Thông tư 09/2023/TT-NHNN) song song với quy tắc gian lận; cảnh báo chuyển tới bàn AML.'],
  ),
  AML_DESK: D(
    ['Reviews the case file: the screening hit (OFAC/PEP, fuzzy-match score), the customer profile and the transaction pattern.', 'Rà soát hồ sơ: kết quả sàng lọc (OFAC/PEP, điểm so khớp mờ), hồ sơ khách hàng và mẫu giao dịch.'],
    ['A confirmed sanctions match freezes the funds on the account; a released case continues to posting. Every decision is logged with its maker and checker.', 'Trùng khớp cấm vận được xác nhận sẽ phong tỏa tiền trên tài khoản; hồ sơ được giải phóng tiếp tục hạch toán. Mọi quyết định được ghi log kèm người lập và người duyệt.'],
    ['STR to the FIU within the legal deadline (Law on AML 14/2022/QH15, Decree 19/2023/NĐ-CP); tipping off the customer is prohibited.', 'Gửi STR tới cơ quan FIU trong thời hạn luật định (Luật 14/2022/QH15, Nghị định 19/2023/NĐ-CP); nghiêm cấm tiết lộ cho khách hàng.'],
  ),
  DISPUTE_DESK: D(
    ['Card disputes raise a chargeback with the scheme’s reason code; account-to-account returns use ISO 20022 pacs.004 referencing the original UETR.', 'Khiếu nại thẻ tạo chargeback với mã lý do của tổ chức thẻ; hoàn trả giữa tài khoản dùng ISO 20022 pacs.004 tham chiếu UETR gốc.'],
    ['A provisional credit may be posted to the customer while the claim is open, and reversed if the claim is lost.', 'Có thể ghi có tạm thời cho khách khi khiếu nại đang mở, và đảo lại nếu khiếu nại thất bại.'],
    ['Scheme deadlines (Visa and Mastercard allow about 120 days for most reasons); a late claim is rejected. Complaint handling follows SBV consumer-protection rules.', 'Thời hạn của tổ chức thẻ (Visa và Mastercard cho khoảng 120 ngày với đa số lý do); khiếu nại trễ bị từ chối. Xử lý khiếu nại theo quy định bảo vệ người tiêu dùng của NHNN.'],
  ),
  GATE_SWIFT: D(
    ['ISO 20022 pacs.008 (replacing MT103): sender and receiver BIC, UETR, interbank settlement amount and currency, charge bearer (DEBT, CRED, SHAR).', 'ISO 20022 pacs.008 (thay MT103): BIC bên gửi và nhận, UETR, số tiền và loại tiền quyết toán liên ngân hàng, bên chịu phí (DEBT, CRED, SHAR).'],
    ['FX conversion at the booked rate, then the payment settles through the Nostro account at the correspondent bank.', 'Quy đổi ngoại tệ theo tỷ giá đã chốt, rồi thanh toán qua tài khoản Nostro tại ngân hàng đại lý.'],
    ['Sanctions screening (OFAC, UN) before release; foreign-exchange rules of the SBV apply to outward remittances.', 'Sàng lọc cấm vận (OFAC, Liên Hợp Quốc) trước khi chuyển; quy định quản lý ngoại hối của NHNN áp dụng cho chuyển tiền ra nước ngoài.'],
  ),
  SAVINGS_DESK: D(
    ['A closure request with the deposit ID, the maturity date and the contract rate; the desk recomputes interest at the actual closing date.', 'Yêu cầu tất toán kèm mã sổ, ngày đáo hạn và lãi suất hợp đồng; quầy tính lại tiền lãi theo ngày tất toán thực tế.'],
    ['Early closure reverses the accrued interest above the demand rate (Dr interest payable / Cr interest expense) before paying out.', 'Tất toán trước hạn đảo phần lãi dự chi vượt lãi không kỳ hạn (Nợ lãi phải trả / Có chi phí lãi) trước khi chi trả.'],
    ['SBV Circular 48/2018/TT-NHNN: an early withdrawal earns no more than the lowest demand-deposit rate.', 'Thông tư 48/2018/TT-NHNN: rút trước hạn được hưởng lãi không vượt quá lãi suất không kỳ hạn thấp nhất.'],
  ),
  COLLATERAL_VAULT: D(
    ['A pledge record links the deposit to the loan; a default event triggers enforcement in the set-off order.', 'Hồ sơ cầm cố liên kết khoản tiền gửi với khoản vay; sự kiện vỡ nợ kích hoạt xử lý theo thứ tự cấn trừ.'],
    ['Pledging moves the funds Dr 2021 / Cr 2022 (frozen, not spent); enforcement applies them to penalty, interest, then principal.', 'Cầm cố chuyển tiền Nợ 2021 / Có 2022 (phong tỏa, không chi); khi xử lý, tiền được cấn trừ vào phạt, lãi, rồi gốc.'],
    ['Secured transactions under Decree 21/2021/NĐ-CP; LTV limits and debt-group classification (Circular 11/2021/TT-NHNN) set the provision.', 'Giao dịch bảo đảm theo Nghị định 21/2021/NĐ-CP; giới hạn LTV và phân nhóm nợ (Thông tư 11/2021/TT-NHNN) quyết định mức dự phòng.'],
  ),
  STP_ENGINE: D(
    ['Rules engine on the case payload: eKYC status, DTI, CIC debt group, limits and AML score, decided in milliseconds.', 'Bộ máy quy tắc chạy trên dữ liệu hồ sơ: trạng thái eKYC, DTI, nhóm nợ CIC, hạn mức và điểm AML, quyết định trong vài mili giây.'],
    ['Posts straight to the ledger under the same row locks as a human desk, with an idempotency key so a retried case is never booked twice.', 'Hạch toán thẳng vào sổ cái dưới cùng khóa dòng như quầy thủ công, kèm khóa chống trùng để hồ sơ thử lại không bao giờ bị ghi hai lần.'],
    ['Anything outside the rules falls back to a human (four-eyes); every automated decision keeps its rule trail for audit.', 'Mọi trường hợp ngoài quy tắc quay về con người (kiểm soát 4 mắt); mỗi quyết định tự động giữ dấu vết quy tắc để kiểm toán.'],
  ),
  MAIN_CASH_VAULT: D(
    ['Every movement is a vault slip naming the counterpart (teller, ATM, CIT van), denominations and the two custodians.', 'Mỗi lần xuất nhập là một phiếu kho ghi đối tượng (quầy, ATM, xe CIT), mệnh giá và hai thủ quỹ.'],
    ['Fit notes (TK 1111), unfit notes (TK 1112) and cash in transit (TK 1131); vault and till transfers are pure balance-sheet moves.', 'Tiền đủ tiêu chuẩn (TK 1111), không đủ tiêu chuẩn (TK 1112) và tiền đang chuyển (TK 1131); điều chuyển giữa kho và quầy chỉ là chuyển trong bảng cân đối.'],
    ['Dual control on every opening and count, a vault limit, and unfit notes returned to the SBV.', 'Kiểm soát kép mỗi lần mở kho và kiểm đếm, có hạn mức tồn quỹ, và tiền không đủ tiêu chuẩn được nộp về NHNN.'],
  ),
  BAY: D(
    ['A CIT order with its run ID, seal ID, amount, direction (in or out) and the two custodians’ names.', 'Lệnh CIT kèm mã chuyến, số niêm phong, số tiền, chiều (vào hay ra) và tên hai thủ quỹ áp tải.'],
    ['While on the road the cash sits in TK 1131 cash in transit; it lands in the vault or the counterpart only when the seal is verified.', 'Trong lúc trên đường, tiền nằm ở TK 1131 tiền đang chuyển; chỉ vào kho hoặc tới đối tác khi niêm phong đã được xác minh.'],
    ['Four-eyes seal check on arrival; a broken or mismatched seal needs a written record and a recount under dual control.', 'Kiểm tra niêm phong 4 mắt khi xe đến; niêm phong rách hoặc sai lệch phải lập biên bản và kiểm đếm lại dưới kiểm soát kép.'],
  ),
};

export const deepDive = (place: KnowledgePlace, aspect: DeepDiveAspect, locale: Locale): string => pick(DEEP_DIVES[place][aspect], locale);

/** All of a place's deep-dive text, for the acronym notes. */
export const deepDiveText = (place: KnowledgePlace, locale: Locale): string => DEEP_DIVE_ASPECTS.map((a) => deepDive(place, a, locale)).join(' ');
