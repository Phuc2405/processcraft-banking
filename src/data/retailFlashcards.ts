/**
 * The Retail Banking Flashcards (Thẻ ghi nhớ Nghiệp vụ Bán lẻ), shown in the Knowledge Base's flashcard tab and the Academy.
 * Front: a term or question. Back: the expanded term, the core banking rule and the Dr/Cr journal. Journals come from the
 * retail book's own examples, so a card can never disagree with what the demo posts.
 */

import type { Localized } from '../i18n/localeCore';
import { exampleJournal, exampleLiquidation, type OpsActionId, type OpsLine, type OpsSubProcessId } from '../sim/retailOps';
import { codeGlossaryMessages } from '../components/bank/codeGlossary.messages';
import { ACRONYM_DETAILS, AUDITED_ACRONYMS } from './acronyms';
import { FLASHCARD_DETAIL } from './flashcardDetails';
import type { OpsFlashcard } from './retailOpsKnowledge';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

/** A retail card always names the full term on its back. */
export type RetailFlashcard = OpsFlashcard & { term: Localized<string> };

/** A credit card swipe spends the bank's money: what the cardholder owes rises, and the merchant's bank is paid. */
const CARD_SWIPE_85: readonly OpsLine[] = [
  { account: 'OVERDRAFT', dr: 8_500, cr: 0 },
  { account: 'INTERBANK', dr: 0, cr: 8_500 },
];

const TOPIC_CARDS: readonly RetailFlashcard[] = [
  {
    id: 'retail-bnpl',
    sub: 'bnpl-credit',
    front: L('How does a $400 BNPL Pay-in-4 pay out?', 'BNPL trả góp 4 kỳ $400 chi trả thế nào?'),
    term: L('Buy Now, Pay Later: four equal instalments', 'Mua trước trả sau: bốn kỳ bằng nhau'),
    lines: exampleJournal('bnpl-approve-400'),
    rule: L('The shop gets the full $400 now. The customer pays $100 at checkout and owes the other $300 on 1320.', 'Cửa hàng nhận đủ $400 ngay. Khách trả $100 khi thanh toán và nợ $300 còn lại tại TK 1320.'),
    reference: L('SBV Circular 39/2016/TT-NHNN', 'Thông tư 39/2016/TT-NHNN'),
  },
  {
    id: 'retail-card-swipe',
    sub: 'card-fees',
    front: L('A credit card is swiped for $85. Whose money moves?', 'Quẹt thẻ tín dụng $85. Tiền của ai dịch chuyển?'),
    term: L('Credit card purchase on the card receivable', 'Giao dịch thẻ tín dụng trên khoản phải thu thẻ'),
    lines: CARD_SWIPE_85,
    rule: L('The bank’s. The customer’s CASA is untouched: what they owe on 1310 rises until the statement is paid.', 'Của ngân hàng. CASA của khách không đổi: khoản phải trả tại TK 1310 tăng đến khi thanh toán sao kê.'),
    reference: L('SBV Circular 18/2024/TT-NHNN', 'Thông tư 18/2024/TT-NHNN'),
  },
  {
    id: 'retail-card-annual-fee',
    sub: 'card-fees',
    front: L('A $45 annual card fee meets a $20 balance. What posts?', 'Phí thường niên $45 gặp số dư $20. Ghi nhận gì?'),
    term: L('Card annual fee, part-funded by overdraft', 'Phí thường niên thẻ, một phần bằng thấu chi'),
    lines: exampleJournal('fee-annual-45'),
    rule: L('The fee is income in full: $20 comes from CASA and the $25 shortfall becomes an overdraft on 1310.', 'Toàn bộ phí là thu nhập: $20 từ CASA và $25 còn thiếu thành thấu chi tại TK 1310.'),
    reference: L('SBV Circular 18/2024/TT-NHNN', 'Thông tư 18/2024/TT-NHNN'),
  },
  {
    id: 'retail-card-late-fee',
    sub: 'bnpl-credit',
    front: L('A card payment is missed. What do the late fee and interest do?', 'Trễ một kỳ thẻ. Phí trễ hạn và lãi tác động thế nào?'),
    term: L('Card late-payment fee and overdue interest', 'Phí trễ hạn thẻ và lãi quá hạn'),
    lines: exampleJournal('card-late-fee'),
    rule: L('Both raise what the cardholder owes on 1310: $25 fee income on 4510 and $17 interest income on 4110.', 'Cả hai làm tăng khoản chủ thẻ phải trả tại TK 1310: thu phí $25 tại 4510 và thu lãi $17 tại 4110.'),
    reference: L('SBV Circular 18/2024/TT-NHNN', 'Thông tư 18/2024/TT-NHNN'),
  },
  {
    id: 'retail-waterfall',
    sub: 'debt-waterfall',
    front: L('What is the Debt Recovery Waterfall order?', 'Thứ tự cấn trừ nợ Waterfall là gì?'),
    term: L('Debt Recovery Waterfall: penalty, then interest, then principal', 'Thứ tự thu hồi nợ: phạt, rồi lãi, rồi gốc'),
    lines: exampleJournal('waterfall-120'),
    rule: L('A payment clears penalty first, then interest, and only then principal. $120 covers $25 + $40 + $55.', 'Khoản trả xử lý phạt trước, rồi đến lãi, sau cùng mới đến gốc. $120 chia thành $25 + $40 + $55.'),
    reference: L('SBV Circular 39/2016/TT-NHNN', 'Thông tư 39/2016/TT-NHNN'),
  },
  {
    id: 'retail-dti',
    sub: 'bnpl-credit',
    front: L('Monthly debt service would be 48% of income. Approve?', 'Nghĩa vụ trả nợ sẽ là 48% thu nhập. Có duyệt không?'),
    term: L('Debt-to-Income above the 45% limit', 'Tỷ lệ nợ trên thu nhập vượt ngưỡng 45%'),
    lines: [],
    rule: L('No. Above 45% is refused with RC 05 and nothing posts; between 36% and 45% goes on a watch list.', 'Không. Trên 45% bị từ chối với RC 05 và không ghi nhận gì; từ 36% đến 45% vào danh sách theo dõi.'),
    reference: L('Simulator policy · APS 220', 'Chính sách mô phỏng · APS 220'),
  },
  {
    id: 'retail-td-break',
    sub: 'term-deposit',
    front: L('What is the early term deposit withdrawal rule?', 'Quy tắc rút tiết kiệm trước hạn là gì?'),
    term: L('Early Term Deposit Closure and interest recalculation', 'Tất toán tiết kiệm trước hạn và tính lại lãi'),
    lines: exampleJournal('td-break-10k'),
    rule: L('The whole deposit falls to the 0.1% demand rate. $10,000 after 180 days earns $4.93, and the other $290.96 accrued is reversed.', 'Toàn bộ tiền gửi về mức không kỳ hạn 0,1%. $10,000 sau 180 ngày được $4.93, $290.96 đã dự chi còn lại được đảo.'),
    reference: L('SBV Circular 49/2018/TT-NHNN', 'Thông tư 49/2018/TT-NHNN'),
  },
  {
    id: 'retail-collateral-lock',
    sub: 'collateral',
    front: L('How is collateral locked when a loan defaults?', 'Khóa tài sản bảo đảm thế nào khi khoản vay vỡ nợ?'),
    term: L('Collateral Lock on pledged savings', 'Phong tỏa tài sản bảo đảm (TSĐB)'),
    lines: exampleJournal('collateral-lock'),
    rule: L('No cash moves. The savings move from 2021 to 2022 and cannot be withdrawn until the lien is released or enforced.', 'Tiền mặt không dịch chuyển. Tiền gửi chuyển từ TK 2021 sang 2022 và không rút được đến khi giải tỏa hoặc xử lý.'),
    reference: L('Civil Code 2015', 'Bộ luật Dân sự 2015'),
  },
  {
    id: 'retail-collateral-liquidate',
    sub: 'collateral',
    front: L('$5,000 of pledged savings meets a $4,500 bad debt. Who gets what?', '$5,000 tiền gửi cầm cố gặp khoản nợ xấu $4,500. Ai nhận gì?'),
    term: L('Collateral Liquidation in waterfall order', 'Xử lý tài sản bảo đảm theo thứ tự cấn trừ'),
    lines: exampleLiquidation(),
    rule: L('The debt is cleared as penalty $200, interest $300, principal $4,000, and the $500 surplus goes back to the customer.', 'Nợ được xử lý theo phạt $200, lãi $300, gốc $4,000, và $500 dư trả lại cho khách.'),
    reference: L('Civil Code 2015', 'Bộ luật Dân sự 2015'),
  },
  {
    id: 'retail-autopay',
    sub: 'auto-pay',
    front: L('An auto-pay loan instalment of $250 is covered. What posts?', 'Kỳ tự động trích nợ vay $250 đủ tiền. Ghi nhận gì?'),
    term: L('Auto-Pay Direct Debit under a standing mandate', 'Tự động trích nợ theo ủy quyền'),
    lines: exampleJournal('autopay-loan-250'),
    rule: L('The mandate lets the bank collect on the due date: CASA falls and the loan on 1320 falls by the same amount.', 'Ủy quyền cho phép ngân hàng thu đúng hạn: CASA giảm và dư nợ tại TK 1320 giảm cùng số tiền.'),
    reference: L('SBV Circular 39/2016/TT-NHNN', 'Thông tư 39/2016/TT-NHNN'),
  },
  {
    id: 'retail-autopay-nsf',
    sub: 'auto-pay',
    front: L('What is the NSF penalty on a failed auto-pay?', 'Phạt NSF khi tự động trích nợ thất bại là gì?'),
    term: L('Non-Sufficient Funds fee on a returned debit', 'Phí không đủ số dư cho lệnh bị trả lại'),
    lines: exampleJournal('autopay-nsf-250'),
    rule: L('RC 51: the instalment is not paid. Only the $15 fee posts, and the instalment starts counting days past due.', 'RC 51: kỳ trả không thu được. Chỉ ghi phí $15, và kỳ trả bắt đầu tính ngày quá hạn.'),
    reference: L('SBV Circular 39/2016/TT-NHNN', 'Thông tư 39/2016/TT-NHNN'),
  },
];

/** Which sub-process teaches each audited acronym, and the demo journal that shows it posting. No journal means nothing posts for it. */
const ACRONYM_CARD: Readonly<Record<(typeof AUDITED_ACRONYMS)[number], { sub: OpsSubProcessId; journal?: OpsActionId }>> = {
  TSDB: { sub: 'collateral', journal: 'collateral-lock' },
  NSF: { sub: 'auto-pay', journal: 'autopay-nsf-250' },
  DTI: { sub: 'bnpl-credit' },
  BNPL: { sub: 'bnpl-credit', journal: 'bnpl-approve-400' },
  '3DS': { sub: 'card-fees' },
  SWIFT: { sub: 'wallet-qr' },
  POS: { sub: 'bill-pay', journal: 'bill-electric-85' },
  ATM: { sub: 'atm-napas', journal: 'atm-withdraw-100' },
  CIT: { sub: 'cassette-jam' },
  AML: { sub: 'teller-vault' },
  KYC: { sub: 'wallet-qr' },
  EKYC: { sub: 'wallet-qr' },
  OTP: { sub: 'card-fees' },
  GL: { sub: 'teller-vault', journal: 'teller-deposit-5000' },
  SOP: { sub: 'teller-vault' },
  ACH: { sub: 'bill-pay', journal: 'bill-electric-85' },
};

const SPELLING: Readonly<Record<string, string>> = { TSDB: 'TSĐB', EKYC: 'eKYC' };

/** The glossary's one-line meaning of an acronym: the card's core definition, with the longer banking rule kept for tier 3. */
const meaningOf = (key: string): Localized<string> | undefined => (codeGlossaryMessages.messages as Readonly<Record<string, Localized<string>>>)[`term_${key}`];

const ACRONYM_CARDS: readonly RetailFlashcard[] = AUDITED_ACRONYMS.map((key) => {
  const d = ACRONYM_DETAILS[key]!;
  const meaning = meaningOf(key);
  const { sub, journal } = ACRONYM_CARD[key];
  const label = SPELLING[key] ?? key;
  return {
    id: `retail-term-${key.toLowerCase()}`,
    sub,
    // English stays plain ASCII: the Vietnamese abbreviation TSĐB is written TSDB on the English side.
    front: L(`What is ${key === 'TSDB' ? 'TSDB (collateral)' : label}?`, `${label} là gì?`),
    term: d.name,
    lines: journal ? exampleJournal(journal) : [],
    rule: meaning ?? d.rule,
    ...(meaning ? { detail: d.rule } : {}),
    reference: L('Knowledge Base glossary', 'Thuật ngữ trong Thư viện kiến thức'),
  };
});

export const RETAIL_FLASHCARDS: readonly RetailFlashcard[] = [...TOPIC_CARDS.map((c) => (FLASHCARD_DETAIL[c.id] ? { ...c, detail: FLASHCARD_DETAIL[c.id] } : c)), ...ACRONYM_CARDS];
