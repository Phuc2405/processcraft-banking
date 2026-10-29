/** Beginner View vocabulary for the Academy and the ledgers: GL account codes and response codes in plain words, in English and Vietnamese. */

import { CHART_OF_ACCOUNTS } from '../engine/ledger';
import { activeLocale, pick, type Locale, type Localized } from '../i18n/localeCore';
import type { AccountId } from '../types/processLearning';
import type { TermMode } from './terms';

const GL_PLAIN_EN: Readonly<Record<string, string>> = {
  '1015': 'Cash Inside ATMs',
  '1012': 'Cash at the Branch Counter',
  '1430': 'Bank’s Accounts Abroad',
  '1110': 'Pending Debit Card Hold',
  '1120': 'Pending Card Hold',
  '1130': 'Pending Prepaid Hold',
  '1150': 'Money Owed on Credit Cards',
  '1210': 'Bank’s Account at Visa',
  '1310': 'BNPL Payments Still Due',
  '1410': 'Instant Transfer Account',
  '1420': 'Central Bank Account',
  '1510': 'Disputed Money to Recover',
  '1910': 'Network Error Hold',
  '1920': 'Currency Loss Hold',
  '2010': 'Customer Bank Balance',
  '2020': 'Prepaid Wallet Money',
  '2110': 'Merchant Payout Pool',
  '2410': 'Transfers Waiting to Send',
  '2420': 'Outgoing Payments in Transit',
  '2510': 'Frozen Suspicious Money',
  '2920': 'Currency Gain Hold',
  '5010': 'Fraud Losses',
};

/** Vietnamese account names. The seven the course leans on most use the bank's exact wording. */
const GL_NAME_VI: Readonly<Record<string, string>> = {
  '1015': 'Quỹ tiền mặt tồn trong cây ATM/CDM',
  '1012': 'Quỹ tiền mặt tại quầy giao dịch',
  '1430': 'Tài khoản Nostro tại ngân hàng đại lý (SWIFT)',
  '1110': 'Khoanh giữ tài khoản thanh toán khả dụng',
  '1120': 'Tạm khóa hạn mức thẻ tín dụng',
  '1130': 'Khoanh giữ ví trả trước',
  '1150': 'Phải thu thẻ tín dụng',
  '1210': 'Tài khoản Nostro quyết toán với tổ chức thẻ',
  '1310': 'Dư nợ cho vay Mua trước trả sau (BNPL)',
  '1410': 'Tài khoản quyết toán thanh toán tức thì',
  '1420': 'Tài khoản quyết toán RTGS tại Ngân hàng Trung ương',
  '1510': 'Phải thu tra soát từ tổ chức thẻ',
  '1910': 'Tài khoản treo tra soát sai lệch (Chờ xử lý lỗi mạng)',
  '1920': 'Tài khoản treo lỗ chênh lệch tỷ giá',
  '2010': 'Tài khoản thanh toán tiền gửi khả dụng',
  '2020': 'Số dư ví trả trước',
  '2110': 'Quỹ chờ quyết toán trả cửa hàng/Tổ chức thẻ',
  '2410': 'Phải trả hàng chờ cổng A2A',
  '2420': 'Bù trừ thanh toán đi',
  '2510': 'Tiền bị phong tỏa do nghi vấn rửa tiền (AML)',
  '2920': 'Tài khoản treo lãi chênh lệch tỷ giá',
  '5010': 'Chi phí tổn thất gian lận',
};

/** Plain names for every GL account, keyed by its four-digit code, per language. */
export const GL_PLAIN_BOOK: Localized<Readonly<Record<string, string>>> = { en: GL_PLAIN_EN, vi: GL_NAME_VI };

/** Plain names for every GL account in the active language. */
export const GL_PLAIN: Readonly<Record<string, string>> = new Proxy({} as Record<string, string>, {
  get: (_t, key) => (typeof key === 'string' ? pick(GL_PLAIN_BOOK)[key] : undefined),
  has: (_t, key) => typeof key === 'string' && key in pick(GL_PLAIN_BOOK),
  ownKeys: () => Object.keys(pick(GL_PLAIN_BOOK)),
  getOwnPropertyDescriptor: (_t, key) => (typeof key === 'string' && key in pick(GL_PLAIN_BOOK) ? { enumerable: true, configurable: true, value: pick(GL_PLAIN_BOOK)[key] } : undefined),
});

export interface ResponseCodeLabel {
  /** The plain title a beginner sees. */
  plain: string;
  /** The ISO 8583 wording an expert sees. */
  expert: string;
}

const RC_EN: Readonly<Record<string, ResponseCodeLabel>> = {
  '00': { plain: 'Approved', expert: 'Approved' },
  '05': { plain: 'Bank Said No', expert: 'Do Not Honour' },
  '14': { plain: 'Card Number Not Recognised', expert: 'Invalid Card Number' },
  '51': { plain: 'Insufficient Balance', expert: 'Insufficient Funds' },
  '59': { plain: 'Looks Like Fraud', expert: 'Suspected Fraud' },
  '61': { plain: 'Daily Limit Reached', expert: 'Exceeds Withdrawal Limit' },
  '62': { plain: 'Card Frozen by User', expert: 'Restricted Card' },
  '68': { plain: 'Network Lag', expert: 'Response Received Too Late' },
  '75': { plain: 'Too Many Wrong PINs', expert: 'PIN Tries Exceeded' },
  '91': { plain: 'Bank Unreachable', expert: 'Issuer or Switch Inoperative' },
  '96': { plain: 'System Fault', expert: 'System Malfunction' },
  N7: { plain: 'Security Code Wrong', expert: 'CVV2 Failure' },
};

const RC_VI: Readonly<Record<string, ResponseCodeLabel>> = {
  '00': { plain: 'Chấp thuận', expert: 'Chấp thuận (Approved)' },
  '05': { plain: 'Ngân hàng từ chối', expert: 'Không chấp thuận (Do Not Honour)' },
  '14': { plain: 'Số thẻ không được nhận diện', expert: 'Số thẻ không hợp lệ (Invalid Card Number)' },
  '51': { plain: 'Tài khoản không đủ số dư', expert: 'Tài khoản không đủ số dư (Insufficient Funds)' },
  '59': { plain: 'Nghi ngờ gian lận', expert: 'Nghi ngờ gian lận (Suspected Fraud)' },
  '61': { plain: 'Vượt hạn mức giao dịch ngày', expert: 'Vượt hạn mức giao dịch ngày (Exceeds Withdrawal Limit)' },
  '62': { plain: 'Thẻ bị khóa bởi chủ thẻ', expert: 'Thẻ bị khóa bởi chủ thẻ (Restricted Card)' },
  '68': { plain: 'Lỗi quá thời gian phản hồi mạng', expert: 'Lỗi quá thời gian phản hồi mạng (Network Timeout)' },
  '75': { plain: 'Nhập sai PIN quá số lần', expert: 'Nhập sai PIN quá số lần (PIN Tries Exceeded)' },
  '91': { plain: 'Không kết nối được ngân hàng', expert: 'Ngân hàng phát hành hoặc bộ chuyển mạch ngừng hoạt động (Issuer or Switch Inoperative)' },
  '96': { plain: 'Lỗi hệ thống', expert: 'Lỗi hệ thống (System Malfunction)' },
  N7: { plain: 'Sai mã bảo mật', expert: 'Sai mã CVV2 (CVV2 Failure)' },
};

export const RC_BOOK: Localized<Readonly<Record<string, ResponseCodeLabel>>> = { en: RC_EN, vi: RC_VI };

/** Plain titles for the response codes the course teaches, in the active language (a Proxy, like GL_PLAIN). */
export const RC_PLAIN: Readonly<Record<string, ResponseCodeLabel>> = new Proxy({} as Record<string, ResponseCodeLabel>, {
  get: (_t, key) => (typeof key === 'string' ? pick(RC_BOOK)[key] : undefined),
  has: (_t, key) => typeof key === 'string' && key in pick(RC_BOOK),
  ownKeys: () => Object.keys(pick(RC_BOOK)),
  getOwnPropertyDescriptor: (_t, key) => (typeof key === 'string' && key in pick(RC_BOOK) ? { enumerable: true, configurable: true, value: pick(RC_BOOK)[key] } : undefined),
});

const FALLBACK: Localized<{ code: (c: string) => string; codeLower: (c: string) => string }> = {
  en: { code: (c) => `Code ${c}`, codeLower: (c) => `code ${c}` },
  vi: { code: (c) => `Mã ${c}`, codeLower: (c) => `mã ${c}` },
};

/** The professional name of an account in the active language: the chart's English name, or the Vietnamese name. */
export function accountName(id: AccountId, locale: Locale = activeLocale()): string {
  const def = CHART_OF_ACCOUNTS[id];
  return locale === 'vi' ? (GL_NAME_VI[def.code] ?? def.name) : def.name;
}

/** "1120-Customer Credit Line Hold" or "1120-Tạm khóa hạn mức thẻ tín dụng". */
export const accountLabel = (id: AccountId, locale: Locale = activeLocale()): string => `${CHART_OF_ACCOUNTS[id].code}-${accountName(id, locale)}`;

/** The name of a GL account for the chosen view. Unknown codes are returned as given. */
export function glName(code: string, mode: TermMode, locale: Locale = activeLocale()): string {
  if (mode === 'beginner') return pick(GL_PLAIN_BOOK, locale)[code] ?? code;
  const account = Object.values(CHART_OF_ACCOUNTS).find((a) => a.code === code);
  return account ? `${code}-${accountName(account.id, locale)}` : code;
}

/** The label of a response code for the chosen view: "RC 51 Insufficient Funds" or "Insufficient Balance". */
export function rcLabel(code: string, mode: TermMode, locale: Locale = activeLocale()): string {
  const known = pick(RC_BOOK, locale)[code];
  if (mode === 'beginner') return known?.plain ?? pick(FALLBACK, locale).code(code);
  return known ? `RC ${code} ${known.expert}` : `RC ${code}`;
}

const RC_PATTERN = /\bRC ?([0-9]{2}|N7)\b/g;
/** A bare four-digit number; only known GL codes are swapped (message types like 0100 are left alone). */
const GL_PATTERN = /(?<![$\d.,])\b([0-9]{4})\b(?![.,]?\d)/g;

/** Free text for the chosen view. */
export function plainText(text: string, mode: TermMode, locale: Locale = activeLocale()): string {
  if (mode === 'expert') return text;
  const rc = pick(RC_BOOK, locale);
  const gl = pick(GL_PLAIN_BOOK, locale);
  return text.replace(RC_PATTERN, (_m, code: string) => rc[code]?.plain ?? pick(FALLBACK, locale).codeLower(code)).replace(GL_PATTERN, (m, code: string) => gl[code] ?? m);
}

/** Vietnamese account descriptions by GL code; the English ones come from the chart of accounts. */
export const ACCOUNT_DESC_VI_BY_CODE: Readonly<Record<string, string>> = {
  '2010': 'Số tiền ngân hàng nợ khách hàng trong tài khoản thanh toán và tiết kiệm. Ghi Nợ ở đây là tiền rời khỏi khách hàng.',
  '1110': 'Tiền được giữ trên tài khoản thanh toán của khách cho giao dịch thẻ đã cấp phép nhưng chưa quyết toán.',
  '1120': 'Hạn mức thẻ tín dụng được giữ cho giao dịch đã cấp phép nhưng chưa quyết toán.',
  '1130': 'Giá trị trên thẻ trả trước được giữ cho giao dịch đã cấp phép nhưng chưa quyết toán.',
  '1150': 'Số tiền chủ thẻ tín dụng nợ ngân hàng. Giao dịch mua làm tăng khoản này khi quyết toán.',
  '2020': 'Số tiền ngân hàng nợ khách hàng đã nạp vào thẻ trả trước.',
  '2110': 'Số tiền ngân hàng nợ tổ chức thẻ cho các giao dịch đã cấp phép mà chưa thanh toán.',
  '1210': 'Tài khoản tiền của ngân hàng dùng để quyết toán với tổ chức thẻ. Ghi Có ở đây là tiền chi ra.',
  '1910': 'Nơi giữ các mục không khớp lúc cuối ngày. Không mục nào nằm lại lâu: nhân viên vận hành tìm nguyên nhân và xử lý.',
  '2920': 'Chênh lệch tỷ giá có lợi cho ngân hàng, chờ bộ phận ngân quỹ ghi nhận.',
  '1920': 'Chênh lệch tỷ giá bất lợi cho ngân hàng, chờ bộ phận ngân quỹ ghi nhận.',
  '1310': 'Ba kỳ trả góp còn lại khách sẽ trả, sau khi ngân hàng đã trả đủ cho cửa hàng.',
  '1410': 'Tài khoản quyết toán của ngân hàng trên kênh thanh toán tức thì. Ghi Có ở đây là giá trị đã gửi đi.',
  '1420': 'Tài khoản quyết toán của ngân hàng tại ngân hàng trung ương cho thanh toán giá trị cao. Ghi Có ở đây là giá trị đã gửi đi.',
  '1015': 'Tiền mặt nạp trong máy ATM của ngân hàng. Ghi Có ở đây là tiền đã ra khỏi máy, phải khớp với số trừ của khách.',
  '2410': 'Tiền của khách cho các lệnh đang chờ trong hàng đợi cổng thanh toán và chưa được giải phóng.',
  '2510': 'Tiền của khách bị phong tỏa trong lúc bộ phận tuân thủ xem xét. Tiền vẫn thuộc về khách nhưng không được dùng.',
  '2420': 'Các khoản ngân hàng đã giải phóng cho khách nhưng chưa quyết toán với ngân hàng nhận.',
  '1510': 'Tiền ngân hàng đã ứng trước cho chủ thẻ và dự kiến đòi lại từ tổ chức thẻ qua tra soát.',
  '5010': 'Gian lận ngân hàng phải tự chịu vì không ai khác có trách nhiệm: không thể tra soát.',
  '1012': 'Tiền mặt trong két và ngăn kéo của giao dịch viên tại chi nhánh. Ghi Có ở đây là tiền mặt đã chi qua quầy.',
  '1430': 'Tài khoản của ngân hàng tại các ngân hàng đại lý ở nước ngoài, dùng để chi trả chuyển tiền quốc tế. Ghi Có ở đây là giá trị đã gửi ra nước ngoài.',
};

/** What an account is for, in the given language (the English is the chart of accounts' own description). */
export function accountDescription(id: AccountId, locale: Locale = activeLocale()): string {
  const def = CHART_OF_ACCOUNTS[id];
  return locale === 'vi' ? (ACCOUNT_DESC_VI_BY_CODE[def.code] ?? def.description) : def.description;
}
