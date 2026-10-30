/** The two vocabularies of the Living Bank. */

import { activeLocale, pick, type Localized } from '../i18n/localeCore';
import { STATION_BRAND, stationBrandMessages } from '../i18n/stationBrand.messages';
import { message } from '../i18n/messageCore';
import { DEPARTMENTS, STATIONS, type DepartmentId, type ExternalId, type PlaceId, type StationId, isStation } from './topology';

export type TermMode = 'expert' | 'beginner';

export const TERM_MODES: readonly TermMode[] = ['expert', 'beginner'];

export const isTermMode = (v: unknown): v is TermMode => v === 'expert' || v === 'beginner';

/** A name for narrow places (a desk card) is `short`; `plain` is the full name used in headings and tooltips. */
export interface Term {
  plain: string;
  short: string;
  /** One sentence, written for someone who has never worked in a bank. */
  tip: string;
}

export interface ExternalTerm extends Term {
  /** The small line under the name on the map. */
  sub: string;
}

interface TermBook {
  modeLabel: Record<TermMode, string>;
  modeHint: Record<TermMode, string>;
  stations: Record<StationId, Term>;
  departments: Record<DepartmentId, Term>;
  externals: Record<ExternalId, ExternalTerm>;
  /** Jargon in free text and what a beginner is told instead. Longest phrases are matched first. */
  glossary: ReadonlyArray<readonly [string, string]>;
  /** Curated phrases that are already in their final plain form. They are matched whole and returned as written. */
  keep: readonly string[];
}

const EN: TermBook = {
  modeLabel: { expert: 'Fintech Expert', beginner: 'Concept Explorer' },
  modeHint: {
    expert: 'Use the names a payments team uses: Token Vault, dCVV, 3DS, EOD reconciliation.',
    beginner: 'Concept Explorer: plain English for every desk, with a one-sentence explanation when you hover.',
  },
  stations: {
    GATE_VIRTUAL: {
      plain: 'Virtual Card Entrance',
      short: 'Virtual Card Entrance',
      tip: 'This is the front door for payments made with a disposable virtual card number.',
    },
    GATE_POS: {
      plain: 'Shop Card Reader Entrance',
      short: 'Shop Card Reader Entrance',
      tip: 'This is where payments tapped or swiped on a shop’s card reader come in.',
    },
    GATE_ECOM: {
      plain: 'Online Shopping Entrance',
      short: 'Online Shopping Entrance',
      tip: 'This is where online checkouts, including Buy Now Pay Later requests, come in.',
    },
    SEC_VAULT: {
      plain: 'Virtual Card Masking Vault (Hides Real Card Number)',
      short: 'Virtual Card Masking Vault',
      tip: 'It swaps the fake virtual card number for the real card behind it, so shops never see the real number.',
    },
    SEC_DCVV: {
      plain: 'Dynamic Security Code Check (Rotates Every Minute)',
      short: 'Dynamic Security Code Check',
      tip: 'It checks that the 3-digit security code matches and is still fresh, because the code changes every minute.',
    },
    SEC_3DS: {
      plain: 'Fraud & SMS OTP Check',
      short: 'Fraud & SMS OTP Check',
      tip: 'It scores how risky an online payment looks, then waves it through, texts the customer a code, or blocks it.',
    },
    LEDGER_DEBIT: {
      plain: 'Everyday Account Balance Check',
      short: 'Everyday Account Balance Check',
      tip: 'It checks the customer has enough money in their everyday account and sets that amount aside for this payment.',
    },
    LEDGER_CREDIT: {
      plain: 'Credit Card Limit Check',
      short: 'Credit Card Limit Check',
      tip: 'It checks the credit card still has room under its limit and sets that amount aside for this payment.',
    },
    BNPL: {
      plain: 'BNPL Pay-in-4 Instalments',
      short: 'BNPL Pay-in-4 Instalments',
      tip: 'It decides whether the customer may pay in four equal parts instead of all at once.',
    },
    EOD_BATCH: {
      plain: 'Nightly Payment Bundling',
      short: 'Nightly Payment Bundling',
      tip: 'At 23:00 it bundles every payment approved today into one file to send to Visa.',
    },
    EOD_VISA: {
      plain: 'Visa Money Handover',
      short: 'Visa Money Handover',
      tip: 'It swaps the day’s file with Visa and agrees how much money changes hands.',
    },
    RECON: {
      plain: 'Night Bookkeeping & Ledger Balance',
      short: 'Night Bookkeeping & Ledger Balance',
      tip: 'It compares three sets of records for every payment and flags the ones that disagree.',
    },
    SUSPENSE: {
      plain: 'Holding Box for Mismatched Money',
      short: 'Holding Box for Mismatched Money',
      tip: 'Money that does not match waits here until a clerk finds out why.',
    },
    GATE_A2A: {
      plain: 'Instant Bank Transfer Entrance',
      short: 'Instant Transfer Entrance',
      tip: 'This is where instant bank-to-bank transfers, such as a QR bill split or the rent, come in and get checked before any money moves.',
    },
    GATE_ATM: {
      plain: 'Cash Machine Card & PIN Slot',
      short: 'Cash Machine Card & PIN',
      tip: 'The card slot and keypad of the cash machine on the pavement, where three wrong PINs in a row make the machine keep the card.',
    },
    ATM_CASH: {
      plain: 'Cash Machine Note Dispenser',
      short: 'Cash Machine Notes',
      tip: 'It counts the notes out and takes the money from the account, and if the notes jam the money waits in the holding box until the cash count proves what happened.',
    },
    GATE_EKYC: {
      plain: 'Online Account Opening (ID & Selfie Check)',
      short: 'Online Account Opening',
      tip: 'A new customer scans their ID card and takes a selfie; the bank checks the face is real and matches the card before opening an account.',
    },
    GATE_QR: {
      plain: 'QR Code Payment Entrance',
      short: 'QR Code Payments',
      tip: 'Where payments made by scanning a VietQR code come in; the bank reads the code and checks it has not been tampered with.',
    },
    TELLER_CASH: {
      plain: 'Branch Cash Counter',
      short: 'Branch Cash Counter',
      tip: 'A teller counts cash in and out by hand, checks for fake notes, and reports any cash over $10,000.',
    },
    SEC_FACEPAY: {
      plain: 'Face Check for Big Transfers',
      short: 'Face Check (FacePay)',
      tip: 'Any transfer over $400 needs a quick face scan, so a thief with the phone still cannot send the money.',
    },
    SEC_FDS: {
      plain: 'Suspicious Device Detector',
      short: 'Suspicious Device Detector',
      tip: 'It looks at the phone or computer behind a payment (odd location, hacked phone, number-guessing bursts) and stops the risky ones.',
    },
    AML_DESK: {
      plain: 'Money Laundering & Sanctions Review',
      short: 'Money Laundering Review',
      tip: 'Compliance officers look at payments the system held as suspicious, report them to the regulator, and freeze money linked to sanctioned people.',
    },
    DISPUTE_DESK: {
      plain: 'Complaints & Refund Claims Desk',
      short: 'Refund Claims Desk',
      tip: 'Specialists decide customer claims: a card charge they did not make, a transfer to return, or an ATM that short-changed them.',
    },
    GATE_SWIFT: {
      plain: 'International Transfer Gateway (SWIFT)',
      short: 'International Transfers',
      tip: 'Where money sent overseas leaves the bank, as a standard SWIFT message converted into the other country’s currency.',
    },
  },
  departments: {
    GATES: { plain: 'Payment Entrances', short: 'Payment Entrances', tip: 'Where every payment enters the bank: virtual cards, shop card readers, online checkouts and instant transfers.' },
    SECURITY: { plain: 'Security & Identity Checks', short: 'Security & Identity Checks', tip: 'Where the bank checks that the card and the person using it are genuine.' },
    LEDGER: { plain: 'Account Balance & Credit Check', short: 'Account Balance & Credit Check', tip: 'Where the bank confirms the funds are available and sets them aside.' },
    BNPL: { plain: 'BNPL Pay-in-4 Instalments', short: 'BNPL Pay-in-4 Instalments', tip: 'Where the bank decides who may split a purchase into four payments.' },
    EOD: { plain: 'Night Bookkeeping Department', short: 'Night Bookkeeping Department', tip: 'The night shift that checks every record agrees and parks the ones that do not.' },
    ATM: { plain: 'Sidewalk Cash Machine', short: 'Sidewalk Cash Machine', tip: 'The two blue cash machines on the pavement outside the branch.' },
    ENTRANCE: { plain: 'Front Door & Identity Checks', short: 'Front Door & Identity', tip: 'Where new customers are identified, QR payments arrive, cash is handled at the counter, and big transfers need a face scan.' },
    COMPLIANCE: { plain: 'Fraud & Money Laundering Watch', short: 'Fraud & Laundering Watch', tip: 'Where risky devices are stopped and suspicious money is reviewed and reported.' },
    BACKOFFICE: { plain: 'Claims & Overseas Transfers', short: 'Claims & Overseas', tip: 'Where customer refund claims are decided and money is sent abroad.' },
  },
  externals: {
    CUSTOMER_OTP: {
      plain: 'Customer’s phone (text-message code)',
      short: 'Customer’s phone',
      sub: 'waiting for the SMS code',
      tip: 'The customer receives a one-time code by text message and enters it to prove their identity.',
    },
    OUT_APPROVED: { plain: 'Approved', short: 'Approved', sub: 'waits for tonight', tip: 'Payments the bank said yes to, waiting for tonight’s bookkeeping.' },
    OUT_DECLINED: { plain: 'Declined', short: 'Declined', sub: 'today', tip: 'Payments the bank said no to today.' },
    OUT_SETTLED: { plain: 'Money moved & confirmed', short: 'Money moved', sub: 'tonight’s run', tip: 'Payments whose records all match, so the funds have actually moved.' },
  },
  glossary: [
    // Titles and phrases that read well only as a whole. Longest match wins, so these beat the single words inside them.
    ['virtual card tokenisation & dynamic cvv flow', 'Virtual Card & Token Vault'],
    ['virtual card tokenisation & dcvv masking', 'Virtual Card & Token Vault'],
    ['virtual card tokenisation', 'Virtual Card & Token Vault'],
    ['virtual card tokenisation', 'Virtual Card & Token Vault'],
    ['3-d secure 2.x risk engine (challenge vs frictionless)', '3DS Identity & Risk Check'],
    ['3-d secure 2.x risk engine (frictionless vs challenge otp)', '3DS Identity & Risk Check'],
    ['3-d secure 2.x risk engine', '3DS Identity & Risk Check'],
    ['3-d secure risk engine', '3DS Identity & Risk Check'],
    ['3ds risk engine', '3DS Identity & Risk Check'],
    ['bnpl pay-in-4 underwriting & card fallback', 'BNPL Pay-in-4 Instalments'],
    ['bnpl pay-in-4 underwriting', 'BNPL Pay-in-4 Instalments'],
    ['bnpl pay-in-4 instalments', 'BNPL Pay-in-4 Instalments'],
    ['bnpl pay-in-4', 'BNPL Pay-in-4 Instalments'],
    ['eod 3-way reconciliation & suspense accounting', 'Night Books Match & Holding Box'],
    ['eod 3-way reconciliation & suspense account handling', 'Night Books Match & Holding Box'],
    ['night books match & holding box', 'Night Books Match & Holding Box'],
    ['instant account-to-account transfers (a2a & pacs.008)', 'Instant Bank-to-Bank Transfers'],
    ['instant account-to-account transfers', 'Instant Bank-to-Bank Transfers'],
    ['instant a2a transfers', 'Instant Bank-to-Bank Transfers'],
    ['aml screening & chargeback dispute resolution', 'Suspicious-Money Checks & Refund Disputes'],
    ['aml & chargebacks', 'Suspicious-Money Checks & Refund Disputes'],
    ['3-d secure 2.x', 'the extra identity check'],
    ['3-d secure', 'the extra identity check'],
    ['3ds', 'extra identity check'],
    ['token vault', 'virtual card masking vault'],
    ['tokenization', 'card masking'],
    ['tokenisation', 'card masking'],
    ['dynamic cvv', 'dynamic security code'],
    ['dcvv', 'dynamic security code'],
    ['cvv', 'security code'],
    ['dpan', 'virtual card number'],
    ['fpan', 'real card number'],
    ['otp', 'one-time SMS code'],
    ['casa', 'everyday account'],
    ['bnpl', 'Buy Now Pay Later'],
    ['pay-in-4', '4-split payment'],
    ['underwriting', 'approval check'],
    ['3-way reconciliation', 'night bookkeeping match'],
    ['reconciliation', 'night bookkeeping match'],
    ['suspense account', 'holding box for mismatched money'],
    ['suspense', 'holding box'],
    ['settlement', 'money handover'],
    ['acquirer', 'shop’s bank'],
    ['issuer', 'customer’s bank'],
    ['frictionless', 'no-hassle'],
    ['liability shift', 'who pays if it is fraud'],
    ['eod', 'end-of-day'],
    ['pos', 'shop card reader'],
    // The Academy's vocabulary
    ['iso 20022', 'the modern bank-message standard'],
    ['pacs.008', 'bank-to-bank payment message'],
    ['endtoendid', 'payment reference'],
    ['rtgs', 'big-payment system'],
    ['a2a', 'bank-to-bank'],
    ['aml', 'anti-money-laundering'],
    ['ofac', 'sanctions list'],
    ['politically exposed person', 'public-office holder'],
    ['pep', 'public-office holder'],
    ['structuring', 'splitting deposits to dodge reporting'],
    ['liquidity', 'cash on hand'],
    ['fx', 'foreign-currency'],
    ['chargeback', 'forced refund'],
    ['representment', 'merchant’s reply'],
    ['pre-arbitration', 'last warning before the card network decides'],
    ['retrieval request', 'receipt request'],
    ['double-entry', 'two-sided bookkeeping'],
  ],
  keep: [
    'Virtual Card & Token Vault',
    '3DS Identity & Risk Check',
    'BNPL Pay-in-4 Instalments',
    'Night Books Match & Holding Box',
    'Instant Bank-to-Bank Transfers',
    'Suspicious-Money Checks & Refund Disputes',
  ],
};

const VI: TermBook = {
  modeLabel: { expert: 'Chuyên gia Fintech', beginner: 'Khám phá khái niệm' },
  modeHint: {
    expert: 'Dùng thuật ngữ của đội ngũ thanh toán: Token Vault, dCVV, 3DS, đối soát EOD.',
    beginner: 'Khám phá khái niệm: tên dễ hiểu cho mọi quầy, kèm một câu giải thích khi bạn rê chuột.',
  },
  stations: {
    GATE_VIRTUAL: {
      plain: 'Cổng vào thẻ ảo',
      short: 'Cổng vào thẻ ảo',
      tip: 'Đây là cửa vào cho các giao dịch dùng số thẻ ảo dùng một lần.',
    },
    GATE_POS: {
      plain: 'Cổng vào máy quẹt thẻ tại cửa hàng',
      short: 'Cổng vào máy POS',
      tip: 'Đây là nơi các giao dịch chạm hoặc quẹt trên máy đọc thẻ của cửa hàng đi vào.',
    },
    GATE_ECOM: {
      plain: 'Cổng vào mua sắm trực tuyến',
      short: 'Cổng vào mua sắm online',
      tip: 'Đây là nơi các đơn thanh toán trực tuyến, kể cả yêu cầu Mua trước Trả sau, đi vào.',
    },
    SEC_VAULT: {
      plain: 'Kho che giấu thẻ ảo (giấu số thẻ thật)',
      short: 'Kho che giấu thẻ ảo',
      tip: 'Nó đổi số thẻ ảo giả thành thẻ thật đằng sau, để cửa hàng không bao giờ thấy số thật.',
    },
    SEC_DCVV: {
      plain: 'Kiểm tra mã bảo mật động (đổi mỗi phút)',
      short: 'Kiểm tra mã bảo mật động',
      tip: 'Nó kiểm tra mã bảo mật 3 chữ số khớp và còn mới, vì mã thay đổi mỗi phút.',
    },
    SEC_3DS: {
      plain: 'Kiểm tra gian lận & mã OTP qua SMS',
      short: 'Kiểm tra gian lận & OTP',
      tip: 'Nó chấm điểm mức rủi ro của giao dịch trực tuyến, rồi cho qua, nhắn mã cho khách, hoặc chặn lại.',
    },
    LEDGER_DEBIT: {
      plain: 'Kiểm tra số dư tài khoản thanh toán',
      short: 'Kiểm tra số dư tài khoản',
      tip: 'Nó kiểm tra khách có đủ tiền trong tài khoản thanh toán và khoanh giữ số tiền đó cho giao dịch này.',
    },
    LEDGER_CREDIT: {
      plain: 'Kiểm tra hạn mức thẻ tín dụng',
      short: 'Kiểm tra hạn mức tín dụng',
      tip: 'Nó kiểm tra thẻ tín dụng còn đủ hạn mức và khoanh giữ số tiền đó cho giao dịch này.',
    },
    BNPL: {
      plain: 'Mua trước Trả sau 4 kỳ',
      short: 'Mua trước Trả sau 4 kỳ',
      tip: 'Nó quyết định khách có được trả làm bốn phần bằng nhau thay vì trả một lần.',
    },
    EOD_BATCH: {
      plain: 'Gom giao dịch ban đêm',
      short: 'Gom giao dịch ban đêm',
      tip: 'Lúc 23:00 nó gom mọi giao dịch được duyệt hôm nay vào một tệp để gửi Visa.',
    },
    EOD_VISA: {
      plain: 'Bàn giao tiền với Visa',
      short: 'Bàn giao tiền với Visa',
      tip: 'Nó trao đổi tệp của ngày với Visa và thống nhất số tiền chuyển giao.',
    },
    RECON: {
      plain: 'Đối chiếu sổ sách ban đêm',
      short: 'Đối chiếu sổ sách đêm',
      tip: 'Nó so sánh ba bộ hồ sơ cho từng giao dịch và đánh dấu những giao dịch không khớp.',
    },
    SUSPENSE: {
      plain: 'Két giữ tiền lệch',
      short: 'Két giữ tiền lệch',
      tip: 'Tiền không khớp nằm chờ ở đây cho tới khi nhân viên tìm ra nguyên nhân.',
    },
    GATE_A2A: {
      plain: 'Cổng vào chuyển khoản tức thì',
      short: 'Cổng chuyển khoản tức thì',
      tip: 'Đây là nơi chuyển khoản tức thì giữa các ngân hàng, như chia hóa đơn qua QR hay trả tiền nhà, đi vào và được kiểm tra trước khi tiền dịch chuyển.',
    },
    GATE_ATM: {
      plain: 'Khe thẻ & bàn phím PIN của máy ATM',
      short: 'Thẻ & PIN máy ATM',
      tip: 'Khe thẻ và bàn phím của máy ATM ngoài vỉa hè, nơi nhập sai PIN ba lần liên tiếp thì máy sẽ nuốt thẻ.',
    },
    ATM_CASH: {
      plain: 'Bộ nhả tiền của máy ATM',
      short: 'Bộ nhả tiền ATM',
      tip: 'Nó đếm tiền ra và trừ tiền trong tài khoản; nếu tiền bị kẹt, khoản tiền nằm chờ trong két tiền lệch cho tới khi kiểm quỹ chứng minh điều gì đã xảy ra.',
    },
    GATE_EKYC: {
      plain: 'Mở tài khoản trực tuyến (kiểm tra CCCD & selfie)',
      short: 'Mở tài khoản trực tuyến',
      tip: 'Khách mới quét CCCD và chụp selfie; ngân hàng kiểm tra khuôn mặt là người thật và khớp với thẻ trước khi mở tài khoản.',
    },
    GATE_QR: {
      plain: 'Cổng thanh toán mã QR',
      short: 'Thanh toán mã QR',
      tip: 'Nơi các giao dịch quét mã VietQR đi vào; ngân hàng đọc mã và kiểm tra mã chưa bị chỉnh sửa.',
    },
    TELLER_CASH: {
      plain: 'Quầy giao dịch tiền mặt',
      short: 'Quầy tiền mặt',
      tip: 'Giao dịch viên đếm tiền nộp và rút, kiểm tra tiền giả, và báo cáo mọi giao dịch tiền mặt trên $10,000.',
    },
    SEC_FACEPAY: {
      plain: 'Xác thực khuôn mặt cho giao dịch lớn',
      short: 'Xác thực khuôn mặt (FacePay)',
      tip: 'Mọi giao dịch chuyển tiền trên $400 cần quét khuôn mặt nhanh, nên kẻ gian dù cầm điện thoại cũng không chuyển được tiền.',
    },
    SEC_FDS: {
      plain: 'Bộ phát hiện thiết bị đáng ngờ',
      short: 'Phát hiện thiết bị đáng ngờ',
      tip: 'Nó xem điện thoại hay máy tính đứng sau giao dịch (vị trí lạ, máy bị bẻ khóa, dò số thẻ dồn dập) và chặn những giao dịch rủi ro.',
    },
    AML_DESK: {
      plain: 'Rà soát rửa tiền & cấm vận',
      short: 'Rà soát rửa tiền',
      tip: 'Chuyên viên tuân thủ xem các giao dịch bị hệ thống giữ lại vì đáng ngờ, báo cáo cơ quan quản lý và phong tỏa tiền liên quan tới người bị cấm vận.',
    },
    DISPUTE_DESK: {
      plain: 'Quầy khiếu nại & đòi tiền',
      short: 'Quầy khiếu nại',
      tip: 'Chuyên viên giải quyết khiếu nại của khách: giao dịch thẻ khách không thực hiện, lệnh chuyển cần hoàn trả, hoặc ATM trả thiếu tiền.',
    },
    GATE_SWIFT: {
      plain: 'Cổng chuyển tiền quốc tế (SWIFT)',
      short: 'Chuyển tiền quốc tế',
      tip: 'Nơi tiền gửi ra nước ngoài rời ngân hàng, dưới dạng điện SWIFT chuẩn và được quy đổi sang tiền tệ của nước nhận.',
    },
  },
  departments: {
    GATES: { plain: 'Các cổng thanh toán', short: 'Các cổng thanh toán', tip: 'Nơi mọi giao dịch đi vào ngân hàng: thẻ ảo, máy quẹt thẻ, thanh toán trực tuyến và chuyển khoản tức thì.' },
    SECURITY: { plain: 'Kiểm tra bảo mật & danh tính', short: 'Bảo mật & danh tính', tip: 'Nơi ngân hàng kiểm tra thẻ và người dùng thẻ là thật.' },
    LEDGER: { plain: 'Kiểm tra số dư & tín dụng', short: 'Số dư & tín dụng', tip: 'Nơi ngân hàng kiểm tra tiền thật sự có và khoanh giữ lại.' },
    BNPL: { plain: 'Mua trước Trả sau 4 kỳ', short: 'Mua trước Trả sau 4 kỳ', tip: 'Nơi ngân hàng quyết định ai được chia một giao dịch thành bốn kỳ thanh toán.' },
    EOD: { plain: 'Phòng sổ sách ca đêm', short: 'Phòng sổ sách ca đêm', tip: 'Ca đêm kiểm tra mọi hồ sơ khớp nhau và treo lại những hồ sơ không khớp.' },
    ATM: { plain: 'Máy ATM vỉa hè', short: 'Máy ATM vỉa hè', tip: 'Hai máy ATM màu xanh trên vỉa hè trước chi nhánh.' },
    ENTRANCE: { plain: 'Cửa vào & kiểm tra danh tính', short: 'Cửa vào & danh tính', tip: 'Nơi khách mới được định danh, giao dịch QR đi vào, tiền mặt được xử lý tại quầy và giao dịch lớn cần quét khuôn mặt.' },
    COMPLIANCE: { plain: 'Giám sát gian lận & rửa tiền', short: 'Giám sát gian lận & rửa tiền', tip: 'Nơi thiết bị rủi ro bị chặn và tiền đáng ngờ được rà soát, báo cáo.' },
    BACKOFFICE: { plain: 'Khiếu nại & chuyển tiền quốc tế', short: 'Khiếu nại & quốc tế', tip: 'Nơi giải quyết khiếu nại đòi tiền của khách và gửi tiền ra nước ngoài.' },
  },
  externals: {
    CUSTOMER_OTP: {
      plain: 'Điện thoại của khách (mã SMS)',
      short: 'Điện thoại của khách',
      sub: 'đang chờ mã SMS',
      tip: 'Khách nhận tin nhắn có mã và nhập vào để chứng minh đúng là mình.',
    },
    OUT_APPROVED: { plain: 'Đã duyệt', short: 'Đã duyệt', sub: 'chờ tới đêm nay', tip: 'Các giao dịch ngân hàng đã đồng ý, đang chờ đối chiếu sổ sách đêm nay.' },
    OUT_DECLINED: { plain: 'Từ chối', short: 'Từ chối', sub: 'hôm nay', tip: 'Các giao dịch ngân hàng đã từ chối hôm nay.' },
    OUT_SETTLED: { plain: 'Tiền đã chuyển & xác nhận', short: 'Tiền đã chuyển', sub: 'ca chạy đêm nay', tip: 'Các giao dịch có mọi hồ sơ khớp nhau, nên tiền đã thật sự dịch chuyển.' },
  },
  glossary: [
    ['virtual card tokenisation & dynamic cvv flow', 'Thẻ ảo & Kho token'],
    ['virtual card tokenisation & dcvv masking', 'Thẻ ảo & Kho token'],
    ['virtual card tokenisation', 'Thẻ ảo & Kho token'],
    ['virtual card tokenisation', 'Thẻ ảo & Kho token'],
    ['3-d secure 2.x risk engine (challenge vs frictionless)', 'Kiểm tra danh tính & rủi ro 3DS'],
    ['3-d secure 2.x risk engine (frictionless vs challenge otp)', 'Kiểm tra danh tính & rủi ro 3DS'],
    ['3-d secure 2.x risk engine', 'Kiểm tra danh tính & rủi ro 3DS'],
    ['3-d secure risk engine', 'Kiểm tra danh tính & rủi ro 3DS'],
    ['3ds risk engine', 'Kiểm tra danh tính & rủi ro 3DS'],
    ['bnpl pay-in-4 underwriting & card fallback', 'Mua trước Trả sau 4 kỳ'],
    ['bnpl pay-in-4 underwriting', 'Mua trước Trả sau 4 kỳ'],
    ['bnpl pay-in-4 instalments', 'Mua trước Trả sau 4 kỳ'],
    ['bnpl pay-in-4', 'Mua trước Trả sau 4 kỳ'],
    ['eod 3-way reconciliation & suspense accounting', 'Đối chiếu sổ đêm & Két tiền lệch'],
    ['eod 3-way reconciliation & suspense account handling', 'Đối chiếu sổ đêm & Két tiền lệch'],
    ['instant account-to-account transfers (a2a & pacs.008)', 'Chuyển khoản tức thì liên ngân hàng'],
    ['instant account-to-account transfers', 'Chuyển khoản tức thì liên ngân hàng'],
    ['instant a2a transfers', 'Chuyển khoản tức thì liên ngân hàng'],
    ['aml screening & chargeback dispute resolution', 'Kiểm tra tiền đáng ngờ & Khiếu nại hoàn tiền'],
    ['aml & chargebacks', 'Kiểm tra tiền đáng ngờ & Khiếu nại hoàn tiền'],
    ['3-d secure 2.x', 'bước xác minh danh tính bổ sung'],
    ['3-d secure', 'bước xác minh danh tính bổ sung'],
    ['3ds', 'xác minh danh tính bổ sung'],
    ['token vault', 'kho che giấu thẻ ảo'],
    ['tokenization', 'che giấu số thẻ'],
    ['tokenisation', 'che giấu số thẻ'],
    ['dynamic cvv', 'mã bảo mật động'],
    ['dcvv', 'mã bảo mật động'],
    ['cvv', 'mã bảo mật'],
    ['dpan', 'số thẻ ảo'],
    ['fpan', 'số thẻ thật'],
    ['otp', 'mã SMS dùng một lần'],
    ['casa', 'tài khoản thanh toán'],
    ['bnpl', 'Mua trước Trả sau'],
    ['pay-in-4', 'trả làm 4 kỳ'],
    ['underwriting', 'thẩm định duyệt'],
    ['3-way reconciliation', 'đối chiếu sổ đêm 3 bên'],
    ['reconciliation', 'đối chiếu sổ đêm'],
    ['suspense account', 'két giữ tiền lệch'],
    ['suspense', 'két tiền lệch'],
    ['settlement', 'bàn giao tiền'],
    ['acquirer', 'ngân hàng của cửa hàng'],
    ['issuer', 'ngân hàng của khách'],
    ['frictionless', 'không phiền hà'],
    ['liability shift', 'ai chịu nếu là gian lận'],
    ['eod', 'cuối ngày'],
    ['pos', 'máy quẹt thẻ'],
    ['iso 20022', 'chuẩn thông điệp ngân hàng hiện đại'],
    ['pacs.008', 'thông điệp thanh toán liên ngân hàng'],
    ['endtoendid', 'mã tham chiếu giao dịch'],
    ['rtgs', 'hệ thống thanh toán giá trị cao'],
    ['a2a', 'liên ngân hàng'],
    ['aml', 'phòng chống rửa tiền'],
    ['ofac', 'danh sách cấm vận'],
    ['politically exposed person', 'người giữ chức vụ công'],
    ['pep', 'người giữ chức vụ công'],
    ['structuring', 'chia nhỏ tiền nộp để né báo cáo'],
    ['fx', 'ngoại tệ'],
    ['chargeback', 'hoàn tiền bắt buộc'],
    ['representment', 'phản hồi của cửa hàng'],
    ['pre-arbitration', 'cảnh báo cuối trước khi tổ chức thẻ phân xử'],
    ['retrieval request', 'yêu cầu xuất trình hóa đơn'],
    ['double-entry', 'ghi sổ kép'],
  ],
  keep: [
    'Thẻ ảo & Kho token',
    'Kiểm tra danh tính & rủi ro 3DS',
    'Mua trước Trả sau 4 kỳ',
    'Đối chiếu sổ đêm & Két tiền lệch',
    'Chuyển khoản tức thì liên ngân hàng',
    'Kiểm tra tiền đáng ngờ & Khiếu nại hoàn tiền',
  ],
};

export const TERMS: Localized<TermBook> = { en: EN, vi: VI };

const book = (): TermBook => pick(TERMS);

// Names

export const modeLabel = (mode: TermMode): string => book().modeLabel[mode];
export const modeHint = (mode: TermMode): string => book().modeHint[mode];

/** The professional (Fintech Expert) names in Vietnamese. */
const EXPERT_STATION_VI: Readonly<Record<StationId, { name: string; blurb: string }>> = {
  GATE_VIRTUAL: { name: 'Cổng thẻ ảo', blurb: 'Nhận các giao dịch thanh toán bằng số thẻ ảo kèm CVV động.' },
  GATE_POS: { name: 'Cổng POS', blurb: 'Nhận giao dịch chip-và-PIN và chạm thẻ từ máy POS tại cửa hàng.' },
  GATE_ECOM: { name: 'Cổng thương mại điện tử', blurb: 'Nhận giao dịch thẻ trực tuyến và hồ sơ trả góp 4 kỳ từ website cửa hàng.' },
  SEC_VAULT: { name: 'Token Vault', blurb: 'Chuyển số thẻ ảo (DPAN) về thẻ thật và tài khoản cấp vốn cho nó.' },
  SEC_DCVV: { name: 'Xác minh dCVV', blurb: 'Kiểm tra mã bảo mật luân phiên khớp và còn trong cửa sổ hiệu lực.' },
  SEC_3DS: { name: 'Bàn rủi ro 3DS', blurb: 'Chấm điểm mỗi giao dịch trực tuyến và chọn xác thực liền mạch, thử thách (OTP) hay từ chối.' },
  LEDGER_DEBIT: { name: 'Ghi nợ CASA', blurb: 'Kiểm tra số dư khả dụng trên tài khoản thanh toán, tiết kiệm và ví trả trước, rồi khoanh giữ.' },
  LEDGER_CREDIT: { name: 'Hạn mức tín dụng tuần hoàn', blurb: 'Kiểm tra hạn mức còn lại so với hạn mức thẻ tín dụng, rồi khoanh giữ.' },
  BNPL: { name: 'Thẩm định trả góp 4 kỳ', blurb: 'Đọc điểm thẩm định của khách và quyết định có đưa ra kế hoạch bốn kỳ hay không.' },
  EOD_BATCH: { name: 'Bù trừ theo lô', blurb: 'Lúc 23:00 gom mọi giao dịch được duyệt trong ngày vào tệp bù trừ.' },
  EOD_VISA: { name: 'Quyết toán Visa', blurb: 'Trao đổi tệp bù trừ với tổ chức thẻ và thống nhất vị thế quyết toán ròng.' },
  RECON: { name: 'Đối soát 3 bên', blurb: 'Khớp bút toán sổ cái, tệp bù trừ của tổ chức thẻ và báo cáo của ngân hàng thanh toán, từng bản ghi một.' },
  SUSPENSE: { name: 'Tài khoản treo', blurb: 'Giữ mọi bản ghi không khớp cho tới khi nhân viên vận hành tìm ra nguyên nhân và xử lý.' },
  GATE_A2A: { name: 'Cổng chuyển tiền nhanh (A2A)', blurb: 'Nhận chuyển khoản tức thì (chia hóa đơn QR, tiền thuê, liên ngân hàng) dạng thông điệp pacs.008 và kiểm tra định dạng trước khi động tới tiền.' },
  GATE_ATM: { name: 'Thẻ & PIN ATM', blurb: 'Đầu đọc thẻ và bàn phím PIN của ATM vỉa hè. Khách có ba lần thử; sai lần thứ ba máy khóa phiên và giữ thẻ.' },
  ATM_CASH: { name: 'Bộ nhả tiền ATM', blurb: 'Kiểm tra số dư, đếm tiền ra và trừ tài khoản. Nếu kẹt tiền khi khách đã bị trừ, khoản tiền được treo cho tới khi kiểm quỹ chứng minh điều gì đã xảy ra.' },
  GATE_EKYC: { name: 'Cổng eKYC & Mở tài khoản', blurb: 'Mở tài khoản từ xa: OCR đọc CCCD, kiểm tra người thật (liveness) và đối chiếu ảnh selfie với Cơ sở dữ liệu quốc gia về dân cư trước khi tài khoản được tạo.' },
  GATE_QR: { name: 'Cổng Thanh toán QR Code Napas247', blurb: 'Đọc chuỗi VietQR (thẻ EMVCo TLV, tĩnh hoặc động), kiểm tra CRC và ánh xạ giao dịch sang thông điệp chuyển mạch Napas247 trước khi sàng lọc.' },
  TELLER_CASH: { name: 'Quầy Giao dịch viên Nộp/Rút tiền mặt', blurb: 'Giao dịch viên kiểm đếm tiền nộp và rút theo quỹ két, ghi số seri tiền nghi vấn và lập báo cáo CTR cho mọi giao dịch tiền mặt trên $10,000.' },
  SEC_FACEPAY: { name: 'Xác thực Sinh trắc học FacePay', blurb: 'Mọi giao dịch chuyển tiền trên $400 (10 triệu VND) phải được xác thực bằng khuôn mặt, đối chiếu với sinh trắc học đã đăng ký khi mở tài khoản.' },
  SEC_FDS: { name: 'Hệ thống FDS & Dấu chân Thiết bị', blurb: 'Hệ thống phát hiện gian lận chấm điểm thiết bị và hành vi: IP bất thường, điện thoại đã root/jailbreak, tấn công dò BIN. Đồng thời chạy sàng lọc AML tự động.' },
  AML_DESK: { name: 'Bàn tra soát AML & Danh sách đen', blurb: 'Chuyên viên tuân thủ rà soát các giao dịch bị giữ: lập STR hoặc giải phóng, và xác nhận các trường hợp trùng danh sách cấm vận OFAC/PEP trước khi phong tỏa tiền.' },
  DISPUTE_DESK: { name: 'Quầy Tra soát Khiếu nại & Đòi tiền', blurb: 'Chuyên viên xử lý khiếu nại của khách: tra soát thẻ (chargeback), hoàn trả pacs.004 và lệch tiền ATM, trong thời hạn của tổ chức thẻ.' },
  GATE_SWIFT: { name: 'Cổng Chuyển tiền Quốc tế SWIFT / ISO 20022', blurb: 'Đọc điện chuyển tiền quốc tế pacs.008 (mã BIC, EndToEndId, số tiền quyết toán và loại tiền) và quy đổi ngoại tệ trước khi sàng lọc.' },
};

const EXPERT_DEPARTMENT_VI: Readonly<Record<DepartmentId, { name: string; blurb: string }>> = {
  GATES: { name: 'Cổng tiếp nhận', blurb: 'Nơi giao dịch đi vào ngân hàng: thẻ ảo, máy POS, thanh toán trực tuyến và chuyển khoản tức thì.' },
  SECURITY: { name: 'Bảo mật & Kho rủi ro 3DS', blurb: 'Tra cứu thẻ ảo, kiểm tra CVV động và quyết định ai phải chứng minh danh tính.' },
  LEDGER: { name: 'Sổ cái ngân hàng lõi', blurb: 'Kiểm tra tiền có đủ và khoanh giữ: tài khoản ghi nợ và hạn mức tín dụng tuần hoàn.' },
  BNPL: { name: 'Bàn trả góp 4 kỳ BNPL', blurb: 'Thẩm định hồ sơ Mua trước Trả sau và đặt khoản trả trước.' },
  EOD: { name: 'Bàn đối soát cuối ngày & tài khoản treo', blurb: 'Chu kỳ đêm: bù trừ theo lô, quyết toán Visa, đối soát 3 bên, và tài khoản treo cho những gì không khớp.' },
  ATM: { name: 'ATM vỉa hè', blurb: 'Hai buồng ATM màu xanh trên vỉa hè trước chi nhánh: buồng thẻ và PIN, rồi buồng tiền mặt. Nếu kẹt tiền sau khi khách bị trừ, khoản tiền vào thẳng tài khoản treo.' },
  ENTRANCE: { name: 'Cổng vào & Xác thực', blurb: 'Nơi khách hàng mới và tiền mặt gặp ngân hàng: mở tài khoản eKYC, cổng VietQR, quầy giao dịch viên và xác thực sinh trắc học FacePay cho giao dịch giá trị cao.' },
  COMPLIANCE: { name: 'Phát hiện Gian lận & Tuân thủ AML', blurb: 'FDS chấm điểm mọi thiết bị và hành vi; chuyên viên AML rà soát hoạt động đáng ngờ và xác nhận các trường hợp trùng cấm vận.' },
  BACKOFFICE: { name: 'Khiếu nại & Quốc tế', blurb: 'Chuyển tiền quốc tế SWIFT theo ISO 20022, và các chuyên viên giải quyết tra soát thẻ, hoàn trả pacs.004 và lệch tiền ATM.' },
};

const vi = (): boolean => activeLocale() === 'vi';

/** A market-branded desk's copy (same in both vocabularies), or null. */
function brand(id: StationId, part: 'title' | 'short' | 'caption' | 'tip'): string | null {
  const key = STATION_BRAND[id];
  return key ? message(stationBrandMessages, `${key}_${part}`) : null;
}

/** The name on a desk card. */
export function stationName(id: StationId, mode: TermMode): string {
  return brand(id, 'short') ?? (mode === 'beginner' ? book().stations[id].short : vi() ? EXPERT_STATION_VI[id].name : STATIONS[id].name);
}

/** The full name, for headings and tooltips. */
export function stationTitle(id: StationId, mode: TermMode): string {
  return brand(id, 'title') ?? (mode === 'beginner' ? book().stations[id].plain : vi() ? EXPERT_STATION_VI[id].name : STATIONS[id].name);
}

/** The one-sentence "what is this" for a desk. */
export function stationTip(id: StationId, mode: TermMode): string {
  return brand(id, 'tip') ?? (mode === 'beginner' ? book().stations[id].tip : vi() ? EXPERT_STATION_VI[id].blurb : STATIONS[id].blurb);
}

/** The brand caption under a market-branded desk's name, or null. */
export const stationCaption = (id: StationId): string | null => brand(id, 'caption');

export function departmentName(id: DepartmentId, mode: TermMode): string {
  return mode === 'beginner' ? book().departments[id].short : vi() ? EXPERT_DEPARTMENT_VI[id].name : DEPARTMENTS[id].name;
}

export const departmentTitle = departmentName;

export function departmentTip(id: DepartmentId, mode: TermMode): string {
  return mode === 'beginner' ? book().departments[id].tip : vi() ? EXPERT_DEPARTMENT_VI[id].blurb : DEPARTMENTS[id].blurb;
}

const EXPERT_EXTERNAL: Record<ExternalId, ExternalTerm> = {
  CUSTOMER_OTP: { plain: 'Customer’s phone', short: 'Customer’s phone', sub: 'on the phone now', tip: 'The customer receives the OTP and types it in to complete the 3DS challenge.' },
  OUT_APPROVED: { plain: 'Approved', short: 'Approved', sub: 'waits for tonight', tip: 'Authorised payments, waiting for tonight’s batch clearing.' },
  OUT_DECLINED: { plain: 'Declined', short: 'Declined', sub: 'today', tip: 'Payments declined today, for risk or for funds.' },
  OUT_SETTLED: { plain: 'Settled & cleared', short: 'Settled & cleared', sub: 'tonight’s run', tip: 'Payments whose three records matched in tonight’s reconciliation.' },
};

const EXPERT_EXTERNAL_VI: Record<ExternalId, ExternalTerm> = {
  CUSTOMER_OTP: { plain: 'Điện thoại của khách', short: 'Điện thoại của khách', sub: 'đang trên điện thoại', tip: 'Khách nhận OTP và nhập vào để hoàn tất thử thách 3DS.' },
  OUT_APPROVED: { plain: 'Đã duyệt', short: 'Đã duyệt', sub: 'chờ tới đêm nay', tip: 'Các giao dịch đã cấp phép, chờ bù trừ theo lô đêm nay.' },
  OUT_DECLINED: { plain: 'Từ chối', short: 'Từ chối', sub: 'hôm nay', tip: 'Các giao dịch bị từ chối hôm nay, do rủi ro hoặc do thiếu tiền.' },
  OUT_SETTLED: { plain: 'Đã quyết toán & bù trừ', short: 'Đã quyết toán', sub: 'ca chạy đêm nay', tip: 'Các giao dịch có ba bản ghi khớp nhau trong lần đối soát đêm nay.' },
};

const externalTerm = (id: ExternalId, mode: TermMode): ExternalTerm => (mode === 'beginner' ? book().externals[id] : vi() ? EXPERT_EXTERNAL_VI[id] : EXPERT_EXTERNAL[id]);

export const externalLabel = (id: ExternalId, mode: TermMode): string => externalTerm(id, mode).short;
export const externalSub = (id: ExternalId, mode: TermMode): string => externalTerm(id, mode).sub;
export const externalTip = (id: ExternalId, mode: TermMode): string => externalTerm(id, mode).tip;

/** Any place on the map, by its full name. */
export const placeTitle = (id: PlaceId, mode: TermMode): string => (isStation(id) ? stationTitle(id, mode) : externalTerm(id, mode).plain);

/** Any place on the map, by its one-sentence tooltip. */
export const placeTip = (id: PlaceId, mode: TermMode): string => (isStation(id) ? stationTip(id, mode) : externalTip(id, mode));

// Free text

interface Compiled {
  re: RegExp;
  map: Map<string, string>;
  /** Lower-cased phrases that are already final: matched whole, returned as the text had them. */
  keep: Set<string>;
}

const compiled = new WeakMap<TermBook, Compiled>();

function glossaryFor(b: TermBook): Compiled {
  const hit = compiled.get(b);
  if (hit) return hit;
  const map = new Map(b.glossary.map(([from, to]) => [from.toLowerCase(), to] as const));
  // The expert names of the desks and departments are jargon too, wherever a sentence mentions one.
  for (const id of Object.keys(STATIONS) as StationId[]) {
    const key = STATIONS[id].name.toLowerCase();
    if (!map.has(key)) map.set(key, b.stations[id].short);
  }
  for (const id of Object.keys(DEPARTMENTS) as DepartmentId[]) {
    const key = DEPARTMENTS[id].name.toLowerCase();
    if (!map.has(key)) map.set(key, b.departments[id].short);
  }
  // Names that are already plain must pass through a second time untouched.
  const keep = new Set<string>();
  const plainNames = [
    ...Object.values(b.stations).flatMap((t) => [t.plain, t.short]),
    ...Object.values(b.departments).flatMap((t) => [t.plain, t.short]),
    ...Object.values(b.externals).flatMap((t) => [t.plain, t.short]),
    ...b.keep,
  ];
  for (const name of plainNames) {
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, name);
    if (map.get(key) === name) keep.add(key);
  }
  const keys = [...map.keys()].sort((a, c) => c.length - a.length);
  const escaped = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Whole words only: "pos" must not match inside "position", and "otp" not inside "footprint".
  const re = new RegExp(`(?<![A-Za-z0-9])(?:(an?)\\s+)?(?:${escaped.join('|')})(?![A-Za-z0-9])`, 'gi');
  const out = { re, map, keep };
  compiled.set(b, out);
  return out;
}

/** "a" or "an" for the word that follows it: "an everyday account", "a one-time code". */
function articleFor(word: string): 'a' | 'an' {
  if (/^(one\b|uni|use)/i.test(word)) return 'a';
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/** Folds a phrase that has landed twice in a row into one. */
export function foldRepeats(text: string): string {
  if (!text || !/[A-Za-z]/.test(text)) return text;
  const parts = text.split(/(\s+)/);
  const words: Array<{ at: number; key: string }> = [];
  for (let i = 0; i < parts.length; i += 2) {
    const raw = parts[i] ?? '';
    words.push({ at: i, key: raw.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '') });
  }
  const drop = new Set<number>();
  for (let n = 6; n >= 1; n--) {
    for (let w = 0; w + 2 * n <= words.length; w++) {
      let same = true;
      let letters = false;
      for (let k = 0; k < n; k++) {
        const first = words[w + k]!;
        const second = words[w + n + k]!;
        if (drop.has(first.at) || drop.has(second.at) || first.key === '' || first.key !== second.key) {
          same = false;
          break;
        }
        if (/[a-z]/.test(first.key)) letters = true;
      }
      if (!same || !letters) continue;
      // Keep the first copy (it has the capital letter) and drop the second, handing any closing punctuation back to the first.
      const lastKept = words[w + n - 1]!.at;
      const lastDropped = words[w + 2 * n - 1]!.at;
      const trail = /[^A-Za-z0-9]+$/.exec(parts[lastDropped] ?? '')?.[0] ?? '';
      if (trail !== '' && !/[^A-Za-z0-9]$/.test(parts[lastKept] ?? '')) parts[lastKept] = `${parts[lastKept] ?? ''}${trail}`;
      for (let k = 0; k < n; k++) drop.add(words[w + n + k]!.at);
    }
  }
  if (drop.size === 0) return text;
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0 && drop.has(i)) {
      out.pop(); // the space in front of the dropped word
      continue;
    }
    out.push(parts[i] ?? '');
  }
  return out.join('');
}

/** Swaps payment jargon for plain words, in one pass so a replacement is never replaced again. */
export function plainText(text: string): string {
  if (!text) return text;
  const { re, map, keep } = glossaryFor(book());
  const swapped = text.replace(re, (match, article: string | undefined, offset: number, whole: string) => {
    const jargon = article ? match.slice(match.search(/\s/)).trim() : match;
    const key = jargon.toLowerCase();
    const plain = map.get(key);
    if (plain === undefined) return match;
    // Already a curated plain name: leave it exactly as it was written.
    if (keep.has(key)) return match;
    if (article) {
      const fixed = articleFor(plain);
      return `${article.charAt(0) === 'A' ? fixed.charAt(0).toUpperCase() + fixed.slice(1) : fixed} ${plain}`;
    }
    const before = whole.slice(0, offset);
    const startsSentence = before.trim().length === 0 || /[.!?:]\s+$/.test(before);
    return startsSentence ? plain.charAt(0).toUpperCase() + plain.slice(1) : plain;
  });
  return foldRepeats(swapped);
}

/** Text as the chosen vocabulary would say it. Expert text is returned untouched. */
export const termText = (text: string, mode: TermMode): string => (mode === 'beginner' ? plainText(text) : text);
