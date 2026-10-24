/**
 * Real-world context for every payment: not "a $62.80 POS swipe" but "🛒 Supermarket Groceries ($62.80)".
 *
 * Each channel has a short catalogue of everyday scenarios. A scenario fixes what the customer was doing and exactly how
 * much it cost, so the badge on a moving packet, the line in the inspector log and the title of a ledger entry all say the
 * same recognisable thing. The scenarios named in the brief come first in each list; the extra ones (marked `extra`) fill
 * the gaps the brief left (Pay-in-4 baskets, and the expensive purchases a fraudster makes) so every packet has a story.
 *
 * Everything is a pure function of the scenario id, so a packet only has to carry the id.
 */

import { formatAud } from '../engine/money';
import { activeLocale, type Locale } from '../i18n/locale';
import type { MinorUnits } from '../types/processLearning';
import type { CheckoutKind } from './types';

export interface Scenario {
  id: string;
  kind: CheckoutKind;
  emoji: string;
  title: string;
  amountCents: MinorUnits;
  /** Relative chance among genuine customers of the same channel. 0 means a fraudster's purchase only. */
  weight: number;
  /** Relative chance among fraud attempts of the same channel. */
  fraudWeight: number;
  /** Not one of the scenarios named in the brief. */
  extra?: boolean;
}

const s = (kind: CheckoutKind, id: string, emoji: string, title: string, dollars: number, weight: number, fraudWeight = 0, extra = false): Scenario => ({
  id,
  kind,
  emoji,
  title,
  amountCents: Math.round(dollars * 100),
  weight,
  fraudWeight,
  ...(extra ? { extra: true } : {}),
});

export const SCENARIOS: readonly Scenario[] = [
  // POS: card present in a shop, a station or a cafe.
  s('POS', 'pos-cafe', '☕', 'Corner Cafe Tap', 4.5, 45),
  s('POS', 'pos-grocery', '🛒', 'Supermarket Groceries', 62.8, 35),
  s('POS', 'pos-subway', '🚇', 'Subway Transit Gate', 2.75, 20),
  s('POS', 'pos-electronics', '📺', 'Electronics Superstore', 389, 0, 60, true),
  s('POS', 'pos-jeweller', '💍', 'City Jeweller', 640, 0, 40, true),

  // E-commerce: card not present, on a website or in an app.
  s('ECOM', 'ecom-fashion', '👗', 'Online Fashion Boutique', 120, 55),
  s('ECOM', 'ecom-games', '🎮', 'Digital Game Pass', 14.99, 45),
  s('ECOM', 'ecom-phones', '📱', 'Phone Reseller Bundle', 649, 0, 55, true),
  s('ECOM', 'ecom-giftcards', '🎁', 'Gift Card Marketplace', 250, 0, 45, true),

  // Virtual cards: a one-time masked number, for a trial or a subscription.
  s('VIRTUAL', 'virt-trial', '🔒', '1-Time Masked Card for Trial', 1, 70),
  s('VIRTUAL', 'virt-subscription', '🔒', 'Masked Card for App Subscription', 9.99, 30, 0, true),
  s('VIRTUAL', 'virt-tickets', '🎟️', 'Resale Tickets via Masked Card', 320, 0, 100, true),

  // Pay-in-4: a bigger basket split into four instalments.
  s('BNPL', 'bnpl-sofa', '🛋️', 'Sofa on Pay-in-4', 480, 35, 0, true),
  s('BNPL', 'bnpl-headphones', '🎧', 'Headphones on Pay-in-4', 240, 40, 0, true),
  s('BNPL', 'bnpl-ebike', '🚲', 'E-Bike on Pay-in-4', 900, 25, 55, true),
  s('BNPL', 'bnpl-laptop', '💻', 'Laptop on Pay-in-4', 1450, 0, 45, true),

  // A2A: an instant account-to-account transfer.
  s('A2A', 'a2a-split', '⚡', 'QR Bill Split', 18.5, 70),
  s('A2A', 'a2a-rent', '🏠', 'Apartment Rent Transfer', 850, 30),
  s('A2A', 'a2a-invoice', '🧾', 'Urgent Invoice to a New Payee', 1400, 0, 100, true),

  // ATM: cash from the machine on the pavement. The $100 note-pair is the one in the brief.
  s('ATM', 'atm-100', '🏧', 'Sidewalk ATM Cash Out', 100, 70),
  s('ATM', 'atm-50', '🏧', 'Sidewalk ATM Quick Cash', 50, 15, 0, true),
  s('ATM', 'atm-200', '🏧', 'Sidewalk ATM Weekend Cash', 200, 15, 0, true),
  s('ATM', 'atm-max', '🏧', 'Sidewalk ATM Maximum Withdrawal', 1000, 0, 100, true),

  // Phase 8 (none of these is in the original brief, so all are marked extra). eKYC onboarding: the price is the opening deposit.
  s('ONBOARD', 'ekyc-student', '🪪', 'Student Account via eKYC', 50, 55, 0, true),
  s('ONBOARD', 'ekyc-freelancer', '🪪', 'Freelancer Account via eKYC', 200, 45, 0, true),
  s('ONBOARD', 'ekyc-mule', '🎭', 'Money-Mule Account Attempt', 20, 0, 100, true),
  // VietQR through Napas247: small everyday payments, and a few over the $400 FacePay line.
  s('QR', 'qr-street-food', '🍜', 'VietQR Street Food', 3.2, 45, 0, true),
  s('QR', 'qr-market', '🧺', 'VietQR Market Stall', 18, 30, 0, true),
  s('QR', 'qr-phone-shop', '📱', 'VietQR Phone Shop', 780, 12, 0, true),
  s('QR', 'qr-room-rent', '🏠', 'VietQR Room Rent', 520, 13, 0, true),
  s('QR', 'qr-scam-merchant', '⚠️', 'VietQR to a Scam Merchant', 650, 0, 70, true),
  s('QR', 'qr-bin-burst', '🤖', 'VietQR BIN Attack Burst', 1.5, 0, 30, true),
  // The teller counter. Cash at or over $10,000 files a CTR.
  s('TELLER', 'teller-deposit', '💵', 'Teller Cash Deposit', 1500, 40, 0, true),
  s('TELLER', 'teller-withdrawal', '💵', 'Teller Cash Withdrawal', 800, 35, 0, true),
  s('TELLER', 'teller-takings', '🏪', 'Shop Takings Deposit', 4200, 15, 0, true),
  s('TELLER', 'teller-large-cash', '🏦', 'Large Cash Withdrawal', 12000, 10, 0, true),
  s('TELLER', 'teller-split-cash', '🧩', 'Split Cash Deposit', 9200, 0, 60, true),
  s('TELLER', 'teller-counterfeit', '🔍', 'Deposit with Counterfeit Notes', 2000, 0, 40, true),
  // Outward SWIFT remittances.
  s('SWIFT', 'swift-tuition', '🎓', 'Overseas Tuition Fee', 6800, 40, 0, true),
  s('SWIFT', 'swift-family', '👪', 'Family Remittance Home', 650, 45, 0, true),
  s('SWIFT', 'swift-supplier', '🚢', 'Supplier Invoice Abroad', 14500, 15, 0, true),
  s('SWIFT', 'swift-bec', '📧', 'Business Email Compromise Transfer', 22000, 0, 100, true),
  // Claims at the disputes desk.
  s('DISPUTE', 'claim-chargeback', '🧾', 'Card Charge Not Recognised', 240, 45, 0, true),
  s('DISPUTE', 'claim-wrong-account', '↩️', 'Transfer Sent to Wrong Account', 300, 30, 0, true),
  s('DISPUTE', 'claim-atm-short', '🏧', 'ATM Short-Changed', 200, 25, 0, true),
  s('DISPUTE', 'claim-friendly-fraud', '🎣', 'Friendly-Fraud Chargeback', 480, 0, 100, true),
];

/**
 * The payments the learner sends with the preset action buttons of the guided flows. They are looked up by id like any other
 * scenario, but are not in SCENARIOS, so the daily traffic never draws them and every generated day stays exactly as it was.
 */
export const PRESET_SCENARIOS: readonly Scenario[] = [
  s('POS', 'preset-pos-20', '🎯', 'Practice Swipe', 20, 0, 0, true),
  s('POS', 'preset-pos-500', '🎯', 'Practice Swipe, Big Basket', 500, 0, 0, true),
  s('VIRTUAL', 'preset-token-45', '🎯', 'Practice Token Checkout', 45, 0, 0, true),
  s('ECOM', 'preset-3ds-250', '🎯', 'Practice 3DS Checkout', 250, 0, 0, true),
  s('ATM', 'preset-cdm-200', '🎯', 'Practice Cash Deposit', 200, 0, 0, true),
  s('ONBOARD', 'preset-ekyc-open', '🎯', 'Practice eKYC Account', 50, 0, 0, true),
  s('ONBOARD', 'preset-ekyc-deepfake', '🎯', 'Practice Deepfake Selfie', 50, 0, 0, true),
  s('TELLER', 'preset-teller-12k', '🎯', 'Practice Large Cash Withdrawal', 12_000, 0, 0, true),
  s('TELLER', 'preset-teller-smurf', '🎯', 'Practice Split Cash Deposit', 9_300, 0, 0, true),
  s('QR', 'preset-qr-780', '🎯', 'Practice VietQR Payment', 780, 0, 0, true),
  s('QR', 'preset-qr-rooted', '🎯', 'Practice VietQR on a Rooted Phone', 120, 0, 0, true),
  s('SWIFT', 'preset-swift-6800', '🎯', 'Practice SWIFT Tuition', 6_800, 0, 0, true),
  s('SWIFT', 'preset-swift-sanction', '🎯', 'Practice SWIFT to a Listed Name', 3_000, 0, 0, true),
  s('DISPUTE', 'preset-claim-return', '🎯', 'Practice pacs.004 Return', 300, 0, 0, true),
];

/** The botnet's card-testing attempt on day 3 (Chaos Monkey). Not in SCENARIOS, so ordinary days never draw it. */
export const BOT_SCENARIO_ID = 'chaos-bot-card-test';
/** The large transfer the AML desk can send in to see its >$10,000 rule fire. */
export const AML_TEST_SCENARIO_ID = 'aml-large-transfer';
export const CHAOS_SCENARIOS: readonly Scenario[] = [s('ECOM', BOT_SCENARIO_ID, '🤖', 'Botnet $1 Card Test', 1, 0, 0, true), s('A2A', AML_TEST_SCENARIO_ID, '🏢', 'Large Business Transfer', 12_500, 0, 0, true)];

const BY_ID: ReadonlyMap<string, Scenario> = new Map([...SCENARIOS, ...PRESET_SCENARIOS, ...CHAOS_SCENARIOS].map((x) => [x.id, x]));

export const scenarioById = (id: string | null | undefined): Scenario | null => (id ? (BY_ID.get(id) ?? null) : null);

/** The Vietnamese name of every scenario, keyed by its English title. */
export const SCENARIO_TITLE_VI: Readonly<Record<string, string>> = {
  'Corner Cafe Tap': 'Chạm thẻ ở quán cà phê',
  'Supermarket Groceries': 'Đi chợ siêu thị',
  'Subway Transit Gate': 'Cổng tàu điện ngầm',
  'Electronics Superstore': 'Siêu thị điện máy',
  'City Jeweller': 'Tiệm trang sức trung tâm',
  'Online Fashion Boutique': 'Cửa hàng thời trang trực tuyến',
  'Digital Game Pass': 'Gói trò chơi điện tử',
  'Phone Reseller Bundle': 'Gói điện thoại bán lại',
  'Gift Card Marketplace': 'Chợ thẻ quà tặng',
  '1-Time Masked Card for Trial': 'Thẻ ẩn danh dùng một lần cho bản dùng thử',
  'Masked Card for App Subscription': 'Thẻ ẩn danh cho gói đăng ký ứng dụng',
  'Resale Tickets via Masked Card': 'Vé bán lại qua thẻ ẩn danh',
  'Sofa on Pay-in-4': 'Ghế sofa trả góp 4 kỳ',
  'Headphones on Pay-in-4': 'Tai nghe trả góp 4 kỳ',
  'E-Bike on Pay-in-4': 'Xe đạp điện trả góp 4 kỳ',
  'Laptop on Pay-in-4': 'Máy tính xách tay trả góp 4 kỳ',
  'QR Bill Split': 'Chia hóa đơn qua QR',
  'Apartment Rent Transfer': 'Chuyển tiền thuê căn hộ',
  'Urgent Invoice to a New Payee': 'Hóa đơn gấp cho người nhận mới',
  'Sidewalk ATM Cash Out': 'Rút tiền ATM vỉa hè',
  'Sidewalk ATM Quick Cash': 'Rút nhanh ATM vỉa hè',
  'Sidewalk ATM Weekend Cash': 'Rút tiền cuối tuần ATM vỉa hè',
  'Sidewalk ATM Maximum Withdrawal': 'Rút tối đa ATM vỉa hè',
  'Practice Swipe': 'Quẹt thẻ luyện tập',
  'Practice Swipe, Big Basket': 'Quẹt thẻ luyện tập, giỏ hàng lớn',
  'Practice Token Checkout': 'Thanh toán token luyện tập',
  'Practice 3DS Checkout': 'Thanh toán 3DS luyện tập',
  'Practice Cash Deposit': 'Nộp tiền mặt luyện tập',
  'Practice eKYC Account': 'Mở tài khoản eKYC luyện tập',
  'Practice Deepfake Selfie': 'Selfie deepfake luyện tập',
  'Practice Large Cash Withdrawal': 'Rút tiền mặt lớn luyện tập',
  'Practice Split Cash Deposit': 'Nộp tiền mặt chia nhỏ luyện tập',
  'Practice VietQR Payment': 'Thanh toán VietQR luyện tập',
  'Practice VietQR on a Rooted Phone': 'VietQR trên điện thoại đã root luyện tập',
  'Practice SWIFT Tuition': 'Học phí SWIFT luyện tập',
  'Practice SWIFT to a Listed Name': 'SWIFT tới tên bị cấm vận luyện tập',
  'Practice pacs.004 Return': 'Hoàn trả pacs.004 luyện tập',
  'Botnet $1 Card Test': 'Botnet dò thẻ $1',
  'Large Business Transfer': 'Chuyển khoản doanh nghiệp lớn',
  'Student Account via eKYC': 'Mở tài khoản sinh viên qua eKYC',
  'Freelancer Account via eKYC': 'Mở tài khoản người làm tự do qua eKYC',
  'Money-Mule Account Attempt': 'Mở tài khoản "nuôi" để rửa tiền',
  'VietQR Street Food': 'VietQR quán ăn vỉa hè',
  'VietQR Market Stall': 'VietQR sạp chợ',
  'VietQR Phone Shop': 'VietQR cửa hàng điện thoại',
  'VietQR Room Rent': 'VietQR tiền thuê phòng',
  'VietQR to a Scam Merchant': 'VietQR tới cửa hàng lừa đảo',
  'VietQR BIN Attack Burst': 'VietQR tấn công dò BIN',
  'Teller Cash Deposit': 'Nộp tiền mặt qua giao dịch viên',
  'Teller Cash Withdrawal': 'Rút tiền mặt qua giao dịch viên',
  'Shop Takings Deposit': 'Nộp doanh thu cửa hàng',
  'Large Cash Withdrawal': 'Rút tiền mặt lớn',
  'Split Cash Deposit': 'Nộp tiền mặt chia nhỏ',
  'Deposit with Counterfeit Notes': 'Nộp tiền có lẫn tiền giả',
  'Overseas Tuition Fee': 'Học phí du học',
  'Family Remittance Home': 'Chuyển tiền về cho gia đình',
  'Supplier Invoice Abroad': 'Thanh toán nhà cung cấp nước ngoài',
  'Business Email Compromise Transfer': 'Chuyển tiền do email doanh nghiệp bị giả mạo',
  'Card Charge Not Recognised': 'Giao dịch thẻ không nhận ra',
  'Transfer Sent to Wrong Account': 'Chuyển nhầm tài khoản',
  'ATM Short-Changed': 'ATM trả thiếu tiền',
  'Friendly-Fraud Chargeback': 'Tra soát gian lận "thân thiện"',
};

/** A scenario's title in English: the canonical text the simulation, the exports and the stores keep. Never depends on the language. */
export const scenarioTitleEn = (x: Scenario): string => x.title;

/** "☕ Corner Cafe Tap ($4.50)" in English, whatever language is on screen. Simulation and export code writes this and nothing else. */
export function scenarioLabelEn(scenario: Scenario | string | null | undefined): string {
  const x = typeof scenario === 'string' ? scenarioById(scenario) : scenario;
  return x ? `${x.emoji} ${x.title} (${formatAud(x.amountCents)})` : '';
}

/** "☕ Corner Cafe Tap" in English: the same without the price. */
export function scenarioShortEn(scenario: Scenario | string | null | undefined): string {
  const x = typeof scenario === 'string' ? scenarioById(scenario) : scenario;
  return x ? `${x.emoji} ${x.title}` : '';
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One find-all pattern per direction. Longest title first, so "Practice Swipe, Big Basket" is never cut short by "Practice Swipe". */
function titleSwapper(table: ReadonlyMap<string, string>): (text: string) => string {
  const keys = [...table.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(keys.map(escapeRe).join('|'), 'g');
  return (text) => text.replace(re, (hit) => table.get(hit) ?? hit);
}

const EN_TO_VI = new Map(Object.entries(SCENARIO_TITLE_VI));
const VI_TO_EN = new Map(Object.entries(SCENARIO_TITLE_VI).map(([en, vi]) => [vi, en] as const));
const swapToVi = titleSwapper(EN_TO_VI);
const swapToEn = titleSwapper(VI_TO_EN);

/**
 * Shows the scenario names inside a piece of simulation text in the chosen language. The simulation writes English
 * ("Debiting 💬 QR Bill Split ($18.50) from the account…"), so this is the single place the names change language.
 * It works both ways: Vietnamese names found in English text are put back, so a line can never come out half and half.
 */
export function localizeScenarioText(text: string, locale: Locale = activeLocale()): string {
  if (!text) return text;
  return locale === 'vi' ? swapToVi(text) : swapToEn(text);
}

/** A scenario's title in the active language. */
export const scenarioTitle = (x: Scenario): string => localizeScenarioText(x.title);

/** "☕ Corner Cafe Tap ($4.50)": the one-line form used in badges, logs and ledger titles, in the active language. */
export const scenarioLabel = (scenario: Scenario | string | null | undefined): string => localizeScenarioText(scenarioLabelEn(scenario));

/** "☕ Corner Cafe Tap": the same without the price, for tight spaces where the amount is already shown. */
export const scenarioShort = (scenario: Scenario | string | null | undefined): string => localizeScenarioText(scenarioShortEn(scenario));

/** The scenarios a channel can draw from, genuine customers or fraudsters. */
export function scenariosFor(kind: CheckoutKind, fraud: boolean): Array<readonly [Scenario, number]> {
  return SCENARIOS.filter((x) => x.kind === kind)
    .map((x) => [x, fraud ? x.fraudWeight : x.weight] as const)
    .filter(([, w]) => w > 0);
}
