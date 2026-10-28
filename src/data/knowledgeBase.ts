/**
 * The Knowledge Base: long-form articles that sit beside the Academy. The first one explains the workspace's core ledger:
 * double entry, every GL account the desks post to, operational versus intermediate accounts, and worked journal flows.
 *
 * The account tables are not written here: the article reads GL_ACCOUNTS, so a new account appears in it automatically.
 * Prose comes in both languages ({ en, vi } pairs). Pure data.
 */

import type { Localized } from '../i18n/locale';
import { AML_POLICY, BIOMETRIC_THRESHOLD_CENTS, CTR_THRESHOLD_CENTS, DISPUTE_SLA_DAYS } from '../sim/amlEngine';
import {
  buildRetailCase,
  buildTaskCase,
  crisisJournalLines,
  crisisPool,
  crisisTask,
  GL_ACCOUNTS,
  GL_CODE,
  GL_SIDE,
  gradeTaskCase,
  HOLDING_ACCOUNTS,
  STAFF_DRILLS,
  STAFF_ROLES,
  type GlAccount,
  type GlSide,
  type LedgerLine,
  type StaffDecision,
  type StaffRoleId,
} from '../sim/staffRoleplay';

export type ArticleId = 'core-ledger';

/** A ledger line in a worked example: which account, on which side. */
export interface FlowLine {
  gl: GlAccount;
  side: 'dr' | 'cr';
  /** In cents; the flow's sample amount when absent. */
  amount?: number;
}

export interface FlowStep {
  text: Localized<string>;
  lines: readonly FlowLine[];
  /** An alternative outcome: it replaces the step before it rather than following it. */
  instead?: boolean;
}

export interface ArticleFlow {
  id: string;
  title: Localized<string>;
  summary: Localized<string>;
  /** The case's amount in cents, from the simulator's own drills. */
  sample: number;
  /** The intermediate accounts whose balance the Advanced view follows step by step. */
  watch: readonly GlAccount[];
  steps: readonly FlowStep[];
}

export interface ArticleSection {
  /** Anchor id: search results and the ledger legend jump straight to it. */
  id: string;
  title: Localized<string>;
  paragraphs: readonly Localized<string>[];
  /** What the Advanced view adds to the section, before its deeper tables. */
  advanced: readonly Localized<string>[];
  /** Extra search words, in both languages, beyond the title. */
  keywords: readonly string[];
}

const L = (en: string, vi: string): Localized<string> => ({ en, vi });
const dr = (gl: GlAccount, amount?: number): FlowLine => ({ gl, side: 'dr', ...(amount === undefined ? {} : { amount }) });
const cr = (gl: GlAccount, amount?: number): FlowLine => ({ gl, side: 'cr', ...(amount === undefined ? {} : { amount }) });

/**
 * Accounts that hold money in between: the holding accounts (suspense, dispute, frozen, pledged) plus the two that carry money
 * to and from other banks. Everything else is an operational account: where money finally lives.
 */
export const INTERMEDIATE_ACCOUNTS: readonly GlAccount[] = [...HOLDING_ACCOUNTS, 'NOSTRO', 'INTERBANK_SETTLEMENT'];
export const isIntermediate = (gl: GlAccount): boolean => INTERMEDIATE_ACCOUNTS.includes(gl);

/** What each intermediate account is for, in a sentence a beginner can follow. */
export const INTERMEDIATE_ROLE: Readonly<Partial<Record<GlAccount, Localized<string>>>> = {
  ATM_SUSPENSE: L(
    'Parks money when an ATM and the core ledger disagree (a cash jam, a timeout) until the cash count settles who is right.',
    'Treo tiền khi máy ATM và sổ cái lõi không khớp (kẹt tiền, quá thời gian) cho đến khi kiểm quỹ xác định bên nào đúng.',
  ),
  CLEARING_SUSPENSE: L(
    'Parks interbank amounts that could not be matched or confirmed yet, for example during a network outage.',
    'Treo các khoản liên ngân hàng chưa khớp hoặc chưa được xác nhận, ví dụ khi mạng gặp sự cố.',
  ),
  DISPUTE_ACCOUNT: L(
    'Records money the bank has advanced to a customer during a dispute and expects to recover through a chargeback.',
    'Ghi nhận khoản ngân hàng đã tạm ứng cho khách trong lúc tranh chấp và chờ thu hồi qua bồi hoàn (chargeback).',
  ),
  FROZEN_ASSETS: L(
    'Holds customer money blocked by AML, fraud or sanctions checks until an investigation releases or confiscates it.',
    'Giữ tiền của khách bị phong tỏa do kiểm tra AML, gian lận hoặc cấm vận cho đến khi điều tra giải tỏa hoặc tịch thu.',
  ),
  TD_PLEDGED: L(
    'Savings locked as security for a loan (a lien): still the customer’s money, but it cannot be withdrawn.',
    'Tiền tiết kiệm bị phong tỏa làm tài sản bảo đảm cho khoản vay: vẫn là tiền của khách nhưng không rút được.',
  ),
  NOSTRO: L(
    'The bank’s own account at a foreign correspondent bank: international transfers are paid out of it.',
    'Tài khoản của chính ngân hàng mở tại ngân hàng đại lý nước ngoài: các lệnh chuyển tiền quốc tế được chi từ đây.',
  ),
  INTERBANK_SETTLEMENT: L(
    'What other banks owe us, or we owe them, until the national switch (NAPAS) settles the day’s payments.',
    'Khoản các ngân hàng khác nợ ta hoặc ta nợ họ, cho đến khi hệ thống chuyển mạch quốc gia (NAPAS) quyết toán.',
  ),
};

export const SIDE_TITLE: Readonly<Record<GlSide, Localized<string>>> = {
  asset: L('Assets', 'Tài sản'),
  liability: L('Liabilities', 'Nợ phải trả'),
  equity: L('Equity', 'Vốn chủ sở hữu'),
  income: L('Income', 'Thu nhập'),
  expense: L('Expenses', 'Chi phí'),
};

/** How a debit and a credit move each side. */
export const SIDE_RULE: Readonly<Record<GlSide, { dr: Localized<string>; cr: Localized<string> }>> = {
  asset: { dr: L('increases', 'tăng'), cr: L('decreases', 'giảm') },
  expense: { dr: L('increases', 'tăng'), cr: L('decreases', 'giảm') },
  liability: { dr: L('decreases', 'giảm'), cr: L('increases', 'tăng') },
  equity: { dr: L('decreases', 'giảm'), cr: L('increases', 'tăng') },
  income: { dr: L('decreases', 'giảm'), cr: L('increases', 'tăng') },
};

export const GL_SIDES: readonly GlSide[] = ['asset', 'liability', 'equity', 'income', 'expense'];
export const accountsOn = (side: GlSide): (typeof GL_ACCOUNTS)[number][] => GL_ACCOUNTS.filter((a) => a.side === side);

export const CORE_LEDGER_ARTICLE = {
  id: 'core-ledger' as ArticleId,
  title: L('Core ledger mechanics: double entry, accounts and flows', 'Cơ chế Sổ cái lõi: bút toán kép, tài khoản và dòng hạch toán'),
  intro: L(
    'Every decision at a desk that moves money is written into the core ledger as a journal. This guide explains the rules every journal obeys, every account the desks post to, and how money travels through the in-between accounts in real cases.',
    'Mọi quyết định tại quầy có làm dịch chuyển tiền đều được ghi vào sổ cái lõi dưới dạng một bút toán. Bài này giải thích các nguyên tắc mà mọi bút toán tuân theo, từng tài khoản mà các quầy hạch toán, và cách tiền đi qua các tài khoản trung gian trong tình huống thực tế.',
  ),
  sections: [
    {
      id: 'double-entry',
      title: L('1. Double-entry bookkeeping', '1. Nguyên tắc bút toán kép'),
      paragraphs: [
        L(
          'The balance sheet always obeys one equation: Assets = Liabilities + Equity. Income and expenses are the year’s result, which ends up in equity, so while the year is open the check reads Assets = Liabilities + Equity + (Income − Expenses).',
          'Bảng cân đối luôn tuân theo một phương trình: Tài sản = Nợ phải trả + Vốn chủ sở hữu. Thu nhập và chi phí tạo nên kết quả kinh doanh, cuối cùng được kết chuyển vào vốn, nên trong kỳ phép kiểm tra là Tài sản = Nợ phải trả + Vốn + (Thu nhập − Chi phí).',
        ),
        L(
          'Every journal has at least one debit (Dr) and one credit (Cr), and its debits always equal its credits. That is why the equation can never break: each journal moves both sides by the same amount.',
          'Mỗi bút toán có ít nhất một dòng Nợ (Dr) và một dòng Có (Cr), và tổng Nợ luôn bằng tổng Có. Vì vậy phương trình không bao giờ bị phá vỡ: mỗi bút toán làm hai vế thay đổi cùng một số tiền.',
        ),
        L(
          'A debit is not "money out" and a credit is not "money in". What they do depends on the account: a debit increases an asset or expense and decreases a liability, equity or income; a credit does the opposite. A customer’s deposit is the bank’s liability (the bank owes it back), so paying a customer is a credit to 2011 CASA.',
          'Ghi Nợ không có nghĩa là "tiền ra" và ghi Có không có nghĩa là "tiền vào". Tác động tùy loại tài khoản: ghi Nợ làm tăng tài sản hoặc chi phí và giảm nợ phải trả, vốn hoặc thu nhập; ghi Có thì ngược lại. Tiền gửi của khách là nợ phải trả của ngân hàng (ngân hàng phải hoàn trả), nên trả tiền cho khách là ghi Có tài khoản 2011 CASA.',
        ),
      ],
      advanced: [
        L(
          'The core ledger stores every balance debit-positive: a debit adds to it, a credit subtracts. Assets and expenses therefore carry positive balances and liabilities, equity and income negative ones, and the whole ledger always sums to exactly zero. That single sum is the trial balance the sheet checks after every journal.',
          'Sổ cái lõi lưu mọi số dư theo quy ước dương bên Nợ: ghi Nợ cộng vào, ghi Có trừ đi. Vì vậy tài sản và chi phí mang số dư dương, còn nợ phải trả, vốn và thu nhập mang số dư âm, và toàn bộ sổ cái luôn có tổng đúng bằng 0. Tổng duy nhất đó chính là bảng cân đối thử mà sổ kiểm tra sau mỗi bút toán.',
        ),
        L(
          'A posted journal is never edited or deleted. A mistake is corrected by a reversal (the same lines with debit and credit swapped, which cancels the original) followed by the correct journal, so the audit trail keeps every step.',
          'Bút toán đã hạch toán không bao giờ được sửa hoặc xóa. Sai sót được điều chỉnh bằng bút toán đảo (các dòng y hệt nhưng đổi bên Nợ và Có, triệt tiêu bút toán gốc), sau đó hạch toán lại bút toán đúng, để nhật ký kiểm toán giữ lại mọi bước.',
        ),
        L(
          'At the close of a period, income and expense accounts are closed into equity (retained earnings): each is debited or credited back to zero against equity, which is how the open-year check above becomes the plain Assets = Liabilities + Equity again.',
          'Khi khóa sổ cuối kỳ, các tài khoản thu nhập và chi phí được kết chuyển vào vốn (lợi nhuận giữ lại): mỗi tài khoản được ghi Nợ hoặc Có về 0 đối ứng với vốn, nhờ đó phép kiểm tra trong kỳ ở trên trở lại dạng Tài sản = Nợ phải trả + Vốn.',
        ),
      ],
      keywords: ['double entry', 'but toan kep', 'debit', 'credit', 'no co', 'ghi no', 'ghi co', 'accounting equation', 'phuong trinh ke toan', 'balance sheet', 'can doi so cai', 'bang can doi', 'trial balance', 'can doi thu', 'reversal', 'but toan dao', 'closing', 'ket chuyen'],
    },
    {
      id: 'accounts',
      title: L('2. The chart of accounts', '2. Hệ thống tài khoản'),
      paragraphs: [
        L(
          'The first digit of a GL number tells you its group: 1 assets, 2 liabilities, 3 equity, 4 income, 5 expenses. The table below lists every account the desks post to, read straight from the ledger.',
          'Chữ số đầu của số hiệu tài khoản GL cho biết nhóm: 1 tài sản, 2 nợ phải trả, 3 vốn, 4 thu nhập, 5 chi phí. Bảng dưới đây liệt kê mọi tài khoản mà các quầy hạch toán, lấy trực tiếp từ sổ cái.',
        ),
      ],
      advanced: [
        L(
          'Beyond the five groups, a bank sorts its accounts by the job they do. Operational accounts hold money where it finally lives; risk and suspense accounts hold it while a fact is missing. The taxonomy below places every account in exactly one family, and the table adds when each account is posted and its typical journal.',
          'Ngoài năm nhóm, ngân hàng còn phân loại tài khoản theo chức năng. Tài khoản nghiệp vụ giữ tiền ở nơi nó nằm sau cùng; tài khoản rủi ro và tài khoản treo giữ tiền trong lúc còn thiếu thông tin. Bảng phân loại dưới đây xếp mỗi tài khoản vào đúng một họ, và bảng tài khoản bổ sung thời điểm hạch toán cùng bút toán điển hình.',
        ),
      ],
      keywords: ['chart of accounts', 'he thong tai khoan', 'gl', 'general ledger', 'so cai', 'account code', 'so hieu tai khoan', 'taxonomy', 'phan loai'],
    },
    {
      id: 'intermediate',
      title: L('3. Operational accounts and intermediate accounts', '3. Tài khoản nghiệp vụ và tài khoản trung gian'),
      paragraphs: [
        L(
          'Operational accounts are where money finally lives: customer deposits, cash, loans, fee income. Intermediate accounts hold money in between, while the bank waits for a fact it does not have yet: the ATM cash count, the other bank’s confirmation, the outcome of a dispute or an investigation.',
          'Tài khoản nghiệp vụ là nơi tiền nằm sau cùng: tiền gửi của khách, tiền mặt, dư nợ cho vay, thu nhập phí. Tài khoản trung gian giữ tiền tạm thời trong lúc ngân hàng chờ một thông tin chưa có: kết quả kiểm quỹ ATM, xác nhận của ngân hàng khác, kết quả tranh chấp hoặc điều tra.',
        ),
        L(
          'A healthy intermediate account drains back to zero. Money that stays in suspense for days is a warning sign that an operations team has to chase, which is why the balance sheet tags these accounts.',
          'Một tài khoản trung gian lành mạnh sẽ trở về số dư bằng 0. Tiền nằm trong tài khoản treo nhiều ngày là dấu hiệu cảnh báo mà bộ phận vận hành phải xử lý, nên bảng cân đối gắn nhãn riêng cho các tài khoản này.',
        ),
      ],
      advanced: [
        L(
          'Each buffer below has a journal that fills it, a journal that drains it, and a control that stops money from being forgotten inside it. Read the fill and the drain together: they are mirror images, which is why the buffer returns to zero.',
          'Mỗi tài khoản đệm dưới đây có một bút toán làm tăng, một bút toán làm giảm và một biện pháp kiểm soát để tiền không bị bỏ quên bên trong. Hãy đọc bút toán tăng và giảm cùng nhau: chúng là hình ảnh đối xứng, nên tài khoản treo hoặc phong tỏa trở về 0. Nostro là ngoại lệ: tài khoản này luôn được duy trì số dư, trong một hạn mức.',
        ),
      ],
      keywords: ['suspense', 'tai khoan treo', 'nostro', 'dispute', 'tranh chap', 'chargeback', 'boi hoan', 'frozen', 'phong toa', 'collateral', 'tai san bao dam', 'hold', 'intermediate', 'trung gian', 'buffer', 'tai khoan dem'],
    },
    {
      id: 'flows',
      title: L('4. Worked journal flows in detail', '4. Ví dụ dòng hạch toán chi tiết'),
      paragraphs: [
        L(
          'Each example below follows one case from start to finish, journal by journal. Watch the intermediate account: it fills up, then drains back to zero.',
          'Mỗi ví dụ dưới đây theo dõi một tình huống từ đầu đến cuối, từng bút toán một. Hãy để ý tài khoản trung gian: tiền đi vào, rồi trở về 0.',
        ),
      ],
      advanced: [
        L(
          'In the Advanced view every line carries a sample amount from the simulator, and each step shows the balance of the watched intermediate account after it posts. A step marked "instead" replaces the step before it, so its balance is worked from the step before that.',
          'Ở chế độ Chuyên sâu, mỗi dòng có số tiền mẫu lấy từ trình mô phỏng, và mỗi bước hiển thị số dư của tài khoản trung gian đang theo dõi sau khi hạch toán. Bước được đánh dấu "thay thế" thay cho bước ngay trước nó, nên số dư được tính từ bước trước đó nữa.',
        ),
      ],
      keywords: ['atm jam', 'ket tien', 'refund', 'hoan tien', 'card dispute', 'tranh chap the', 'journal flow', 'dong hach toan', 'crisis', 'su co', 'swift', 'international transfer', 'chuyen tien quoc te', 'pacs.004', 'return'],
    },
    {
      id: 'glossary',
      title: L('5. Acronyms and account codes', '5. Từ viết tắt và mã hiệu tài khoản'),
      paragraphs: [L('The acronyms you meet on the desks, the ledger and the audit report.', 'Các từ viết tắt bạn gặp tại quầy, trong sổ cái và báo cáo kiểm toán.')],
      advanced: [
        L(
          'The lookup table maps each acronym to the GL accounts it moves and the desk that handles it, so a code in the audit report can be traced back to the rule behind it.',
          'Bảng tra cứu nối mỗi từ viết tắt với các tài khoản GL mà nó làm thay đổi và quầy xử lý nó, để từ một mã trong báo cáo kiểm toán có thể lần ngược về quy định phía sau.',
        ),
      ],
      keywords: ['acronym', 'tu viet tat', 'glossary', 'thuat ngu', 'lookup', 'tra cuu', 'ma hieu'],
    },
  ] as const satisfies readonly ArticleSection[],
  flows: [
    {
      id: 'flow-atm-jam',
      title: L('ATM cash jam refund', 'Hoàn tiền ATM bị kẹt'),
      summary: L('The ATM debited the customer but the notes jammed inside the machine.', 'ATM đã trừ tiền của khách nhưng tiền bị kẹt trong máy.'),
      sample: 14_000,
      watch: ['ATM_SUSPENSE'],
      steps: [
        { text: L('The withdrawal posts: the customer’s balance goes down and the ATM’s cash goes down.', 'Lệnh rút tiền được hạch toán: số dư của khách giảm và tiền mặt trong ATM giảm.'), lines: [dr('CASA'), cr('ATM_CASH')] },
        {
          text: L('The electronic journal shows the notes were retracted. The dispute desk refunds the customer and parks the amount in ATM suspense.', 'Nhật ký điện tử cho thấy tiền đã bị thu hồi vào máy. Quầy tra soát hoàn tiền cho khách và treo số tiền vào tài khoản treo ATM.'),
          lines: [dr('ATM_SUSPENSE'), cr('CASA')],
        },
        { text: L('At replenishment the cash count finds the surplus notes. The cash goes back on the books and suspense drains to zero.', 'Khi tiếp quỹ, kiểm đếm phát hiện số tiền thừa. Tiền mặt được ghi nhận lại và tài khoản treo trở về 0.'), lines: [dr('ATM_CASH'), cr('ATM_SUSPENSE')] },
      ],
    },
    {
      id: 'flow-swift',
      title: L('International SWIFT transfer and return', 'Chuyển tiền quốc tế SWIFT và hoàn trả'),
      summary: L('A customer wires money abroad; the beneficiary bank sends it back because the account is closed.', 'Khách chuyển tiền ra nước ngoài; ngân hàng thụ hưởng trả lại vì tài khoản đã đóng.'),
      sample: 2_070_000,
      watch: ['CLEARING_SUSPENSE'],
      steps: [
        {
          text: L(
            'The pacs.008 passes screening and is sent. The customer pays the amount plus the wire fee; the amount leaves the bank’s nostro at the correspondent and the fee is earned.',
            'Lệnh pacs.008 qua kiểm tra và được gửi đi. Khách trả số tiền chuyển cộng phí chuyển tiền; số tiền rời tài khoản nostro của ngân hàng tại ngân hàng đại lý và phí được ghi nhận thu nhập.',
          ),
          lines: [dr('CASA', 2_072_500), cr('NOSTRO'), cr('WIRE_FEE_INCOME', 2_500)],
        },
        {
          text: L(
            'The beneficiary bank returns the funds (pacs.004). The money is back in the nostro, but it waits in interbank suspense until the return is matched to the original order.',
            'Ngân hàng thụ hưởng hoàn trả tiền (pacs.004). Tiền đã về lại tài khoản nostro nhưng được treo ở tài khoản treo liên ngân hàng cho đến khi khớp được với lệnh gốc.',
          ),
          lines: [dr('NOSTRO'), cr('CLEARING_SUSPENSE')],
        },
        {
          text: L('Matched: the customer gets the amount back and suspense drains to zero. The wire fee stays earned, since the bank did send the payment.', 'Đã khớp: khách nhận lại số tiền và tài khoản treo trở về 0. Phí chuyển tiền vẫn được giữ vì ngân hàng đã thực hiện lệnh.'),
          lines: [dr('CLEARING_SUSPENSE'), cr('CASA')],
        },
      ],
    },
    {
      id: 'flow-dispute',
      title: L('Card dispute and chargeback', 'Tranh chấp thẻ và bồi hoàn'),
      summary: L('A customer says a merchant charged them for goods that never arrived.', 'Khách cho biết người bán đã trừ tiền nhưng không giao hàng.'),
      sample: 7_500,
      watch: ['DISPUTE_ACCOUNT'],
      steps: [
        { text: L('The dispute desk accepts the claim and gives the customer a provisional credit.', 'Quầy tra soát chấp nhận khiếu nại và tạm ứng tiền cho khách.'), lines: [dr('DISPUTE_ACCOUNT'), cr('CASA')] },
        {
          text: L('The chargeback is won: the merchant’s bank pays back through interbank settlement, and the dispute receivable clears.', 'Bồi hoàn thành công: ngân hàng của người bán hoàn trả qua thanh toán liên ngân hàng, khoản phải thu tranh chấp được tất toán.'),
          lines: [dr('INTERBANK_SETTLEMENT'), cr('DISPUTE_ACCOUNT')],
        },
        { text: L('If the chargeback were lost instead, the provisional credit is taken back from the customer.', 'Nếu bồi hoàn thất bại, khoản tạm ứng sẽ được thu lại từ tài khoản của khách.'), lines: [dr('CASA'), cr('DISPUTE_ACCOUNT')], instead: true },
      ],
    },
    {
      id: 'flow-crisis',
      title: L('Crisis hold and outage suspense', 'Phong tỏa khi có sự cố và treo do mất kết nối'),
      summary: L('What the Emergency Crisis Queue posts when you refuse or approve during an incident.', 'Những gì Hàng chờ Cứu hộ hạch toán khi bạn từ chối hoặc phê duyệt trong lúc có sự cố.'),
      sample: 21_400,
      watch: ['FROZEN_ASSETS', 'CLEARING_SUSPENSE'],
      steps: [
        { text: L('Refused at AML, FDS or SWIFT: the money is frozen pending investigation.', 'Từ chối tại quầy AML, FDS hoặc SWIFT: tiền bị phong tỏa chờ điều tra.'), lines: [dr('CASA'), cr('FROZEN_ASSETS')] },
        { text: L('The investigation clears the customer: the hold is released back to their account.', 'Điều tra xác nhận khách hàng trong sạch: tiền được giải tỏa về tài khoản.'), lines: [dr('FROZEN_ASSETS'), cr('CASA')] },
        {
          text: L('Approved during a network or power outage: the other bank cannot confirm yet, so the payment waits in interbank suspense.', 'Phê duyệt khi mạng hoặc điện gặp sự cố: ngân hàng bên kia chưa thể xác nhận, nên khoản thanh toán được treo ở tài khoản treo liên ngân hàng.'),
          lines: [dr('CASA'), cr('CLEARING_SUSPENSE')],
        },
        { text: L('The link comes back and the payment is confirmed: suspense drains into settlement.', 'Kết nối phục hồi và khoản thanh toán được xác nhận: tài khoản treo chuyển sang thanh toán bù trừ.'), lines: [dr('CLEARING_SUSPENSE'), cr('INTERBANK_SETTLEMENT')] },
      ],
    },
  ] as const satisfies readonly ArticleFlow[],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Advanced view: formulas, the account taxonomy, buffer mechanics and the acronym lookup
// ─────────────────────────────────────────────────────────────────────────────

/** Section 1: the equations and rules every journal obeys, each with what it means. */
export const LEDGER_FORMULAS: readonly { formula: Localized<string>; meaning: Localized<string> }[] = [
  { formula: L('Σ Debits = Σ Credits', 'Σ Nợ = Σ Có'), meaning: L('Holds for every single journal, so it holds for the whole ledger.', 'Đúng với từng bút toán, nên đúng với toàn bộ sổ cái.') },
  { formula: L('Assets = Liabilities + Equity', 'Tài sản = Nợ phải trả + Vốn chủ sở hữu'), meaning: L('The balance sheet equation after the period is closed.', 'Phương trình bảng cân đối sau khi khóa sổ cuối kỳ.') },
  {
    formula: L('Assets + Expenses = Liabilities + Equity + Income', 'Tài sản + Chi phí = Nợ phải trả + Vốn + Thu nhập'),
    meaning: L('The same equation while the period is open: debit-normal groups on the left, credit-normal on the right.', 'Cùng phương trình khi kỳ còn mở: nhóm dư Nợ bên trái, nhóm dư Có bên phải.'),
  },
  { formula: L('Σ debit-positive balances = 0', 'Σ số dư (dương bên Nợ) = 0'), meaning: L('The trial balance the core ledger checks after every posting.', 'Bảng cân đối thử mà sổ cái lõi kiểm tra sau mỗi lần hạch toán.') },
  { formula: L('Reversal = original with Dr ⇄ Cr', 'Bút toán đảo = bút toán gốc đổi Nợ ⇄ Có'), meaning: L('How an error is corrected without deleting anything.', 'Cách điều chỉnh sai sót mà không xóa bất cứ thứ gì.') },
  { formula: L('Net result = Income − Expenses → Equity', 'Kết quả = Thu nhập − Chi phí → Vốn'), meaning: L('The closing journal at the end of the period.', 'Bút toán kết chuyển khi khóa sổ cuối kỳ.') },
];

export type GlFamily = 'cash' | 'lending' | 'interbank' | 'buffer' | 'deposits' | 'payables' | 'capital' | 'income' | 'expense';

/** Section 2: every account in one family, by the job it does. A test checks that the families cover the ledger exactly once. */
export const GL_TAXONOMY: readonly { id: GlFamily; title: Localized<string>; note: Localized<string>; risk: boolean; accounts: readonly GlAccount[] }[] = [
  { id: 'cash', title: L('Cash and liquidity', 'Tiền mặt và thanh khoản'), note: L('Physical notes in machines and tills.', 'Tiền mặt trong máy ATM và tại quầy.'), risk: false, accounts: ['ATM_CASH', 'TILL_CASH'] },
  { id: 'lending', title: L('Lending', 'Cho vay'), note: L('Money customers owe the bank.', 'Khoản khách hàng nợ ngân hàng.'), risk: false, accounts: ['OVERDRAFT_RECV', 'LOAN_PRINCIPAL'] },
  { id: 'interbank', title: L('Interbank and correspondent', 'Liên ngân hàng và ngân hàng đại lý'), note: L('Positions with NAPAS and foreign correspondents.', 'Vị thế với NAPAS và ngân hàng đại lý nước ngoài.'), risk: false, accounts: ['INTERBANK_SETTLEMENT', 'NOSTRO'] },
  {
    id: 'buffer',
    title: L('Risk, suspense and hold buffers', 'Tài khoản đệm rủi ro, treo và phong tỏa'),
    note: L('Money waiting for a fact: a count, a confirmation, a ruling. Should drain to zero.', 'Tiền chờ thông tin: kết quả kiểm đếm, xác nhận, phán quyết. Cần trở về 0.'),
    risk: true,
    accounts: ['ATM_SUSPENSE', 'DISPUTE_ACCOUNT', 'CLEARING_SUSPENSE', 'FROZEN_ASSETS', 'TD_PLEDGED'],
  },
  { id: 'deposits', title: L('Customer deposits', 'Tiền gửi của khách hàng'), note: L('What the bank owes its customers.', 'Khoản ngân hàng nợ khách hàng.'), risk: false, accounts: ['CASA', 'TERM_DEPOSIT'] },
  { id: 'payables', title: L('Payables', 'Các khoản phải trả'), note: L('Money owed to wallets, billers and loyalty members.', 'Khoản phải trả cho ví điện tử, nhà cung cấp hóa đơn và hội viên tích điểm.'), risk: false, accounts: ['WALLET_SETTLEMENT', 'LOYALTY_LIABILITY', 'BILLER_PAYABLE'] },
  { id: 'capital', title: L('Capital', 'Vốn'), note: L('The owners’ stake.', 'Phần vốn của chủ sở hữu.'), risk: false, accounts: ['EQUITY'] },
  { id: 'income', title: L('Income', 'Thu nhập'), note: L('Interest, fees and penalties earned.', 'Lãi, phí và tiền phạt thu được.'), risk: false, accounts: ['INTEREST_INCOME', 'FEE_INCOME', 'PENALTY_INCOME', 'LATE_PENALTY_INCOME', 'WIRE_FEE_INCOME'] },
  { id: 'expense', title: L('Expenses', 'Chi phí'), note: L('Interest paid, rewards and network fees.', 'Lãi trả, chi phí thưởng và phí mạng lưới.'), risk: false, accounts: ['INTEREST_EXPENSE', 'REWARDS_EXPENSE', 'SWITCH_FEE_EXPENSE'] },
];

/** A journal in the buffer mechanics: its debit and credit accounts. */
export type BufferJournal = { dr: readonly GlAccount[]; cr: readonly GlAccount[] };

/** Section 3: how each buffer fills, drains and is kept from growing stale. */
export const BUFFER_MECHANICS: readonly { gl: GlAccount; fill: Localized<string>; fillJournal: BufferJournal; drain: Localized<string>; drainJournal: BufferJournal; control: Localized<string> }[] = [
  {
    gl: 'NOSTRO',
    fill: L('Funds arrive at the correspondent: an incoming wire or a return.', 'Tiền về tài khoản tại ngân hàng đại lý: lệnh chuyển đến hoặc lệnh hoàn trả.'),
    fillJournal: { dr: ['NOSTRO'], cr: ['CLEARING_SUSPENSE'] },
    drain: L('An outgoing SWIFT payment is paid out of it.', 'Lệnh thanh toán SWIFT đi được chi từ tài khoản này.'),
    drainJournal: { dr: ['CASA'], cr: ['NOSTRO', 'WIRE_FEE_INCOME'] },
    control: L(
      'Reconciled every day against the correspondent’s statement (MT950 / camt.053); the balance must stay within the limit, or payments wait (the Nostro crunch crisis).',
      'Đối chiếu hằng ngày với sao kê của ngân hàng đại lý (MT950 / camt.053); số dư phải nằm trong hạn mức, nếu không lệnh sẽ phải chờ (sự cố Vượt hạn mức Nostro).',
    ),
  },
  {
    gl: 'ATM_SUSPENSE',
    fill: L('A jammed or timed-out withdrawal is refunded before the cash is counted.', 'Lệnh rút tiền bị kẹt hoặc quá thời gian được hoàn cho khách trước khi kiểm đếm.'),
    fillJournal: { dr: ['ATM_SUSPENSE'], cr: ['CASA'] },
    drain: L('The replenishment count finds the notes and puts them back on the books.', 'Kiểm đếm khi tiếp quỹ tìm thấy tiền và ghi nhận lại vào sổ.'),
    drainJournal: { dr: ['ATM_CASH'], cr: ['ATM_SUSPENSE'] },
    control: L('Cleared at the next cash count; a balance left after the count is a real shortage and goes to investigation.', 'Được xử lý ở lần kiểm quỹ kế tiếp; số dư còn lại sau kiểm quỹ là thiếu hụt thật và được chuyển điều tra.'),
  },
  {
    gl: 'DISPUTE_ACCOUNT',
    fill: L('The dispute desk gives the customer a provisional credit.', 'Quầy tra soát tạm ứng tiền cho khách.'),
    fillJournal: { dr: ['DISPUTE_ACCOUNT'], cr: ['CASA'] },
    drain: L('The chargeback is won (the merchant’s bank pays) or lost (the credit is taken back).', 'Bồi hoàn thành công (ngân hàng người bán trả tiền) hoặc thất bại (thu lại khoản tạm ứng).'),
    drainJournal: { dr: ['INTERBANK_SETTLEMENT'], cr: ['DISPUTE_ACCOUNT'] },
    control: L('Every open claim is tracked against the card scheme’s chargeback deadlines; a claim past them is written off.', 'Mỗi khiếu nại đang mở được theo dõi theo thời hạn bồi hoàn của tổ chức thẻ; khiếu nại quá hạn bị xóa sổ.'),
  },
  {
    gl: 'FROZEN_ASSETS',
    fill: L('AML, FDS or SWIFT refuses a payment during a crisis: the money is held, not returned.', 'Quầy AML, FDS hoặc SWIFT từ chối giao dịch khi có sự cố: tiền bị giữ lại, không trả về.'),
    fillJournal: { dr: ['CASA'], cr: ['FROZEN_ASSETS'] },
    drain: L('The investigation releases the money to the customer, or a court order confiscates it.', 'Điều tra giải tỏa tiền về cho khách, hoặc lệnh của tòa án tịch thu số tiền.'),
    drainJournal: { dr: ['FROZEN_ASSETS'], cr: ['CASA'] },
    control: L(
      'Each hold is backed by an STR or a sanctions match on file; it is a liability, because the money still belongs to someone. Savings pledged as loan collateral sit apart, in 2022.',
      'Mỗi khoản phong tỏa phải có báo cáo STR hoặc kết quả trùng danh sách cấm vận lưu hồ sơ; đây là nợ phải trả vì tiền vẫn thuộc về một người nào đó. Tiền gửi cầm cố cho khoản vay được theo dõi riêng ở tài khoản 2022.',
    ),
  },
];

/** Where a GL group is reported: the balance sheet (a position) or the income statement (the period's result). */
export type Statement = 'balance' | 'income';
export const statementOf = (gl: GlAccount): Statement => (GL_SIDE[gl] === 'income' || GL_SIDE[gl] === 'expense' ? 'income' : 'balance');
/** A line's effect on its account: up or down, by the account's own direction. */
export const lineRaises = (line: FlowLine): boolean => (line.side === 'dr') === (GL_SIDE[line.gl] === 'asset' || GL_SIDE[line.gl] === 'expense');
/** The side an account's balance normally sits on. */
export const normalSide = (gl: GlAccount): 'dr' | 'cr' => (GL_SIDE[gl] === 'asset' || GL_SIDE[gl] === 'expense' ? 'dr' : 'cr');

/**
 * Section 3 (Advanced): the thresholds behind the desks. The simulator's own lines come from its policy constants (an amount
 * in cents, or days); the Vietnamese rules are quoted with their source and should be checked against the current SBV texts.
 */
export const REGULATORY_RULES: readonly { id: string; rule: Localized<string>; cents?: number; days?: number; source: Localized<string> }[] = [
  {
    id: 'ctr',
    rule: L('Cash at or above this files a Cash Transaction Report (CTR) at the teller and AML desks.', 'Tiền mặt từ mức này trở lên phải lập Báo cáo giao dịch tiền mặt (CTR) tại quầy giao dịch viên và quầy AML.'),
    cents: CTR_THRESHOLD_CENTS,
    source: L('Simulator policy (amlEngine)', 'Chính sách của trình mô phỏng (amlEngine)'),
  },
  {
    id: 'cross-border',
    rule: L('A cross-border payment this large is held for AML review before SWIFT sends it.', 'Lệnh chuyển tiền quốc tế từ mức này bị giữ lại để AML rà soát trước khi gửi qua SWIFT.'),
    cents: AML_POLICY.largeCrossBorderCents,
    source: L('Simulator policy (amlEngine)', 'Chính sách của trình mô phỏng (amlEngine)'),
  },
  {
    id: 'biometric',
    rule: L('An online transfer above this needs a FacePay biometric match (the 10 million VND rule).', 'Giao dịch chuyển tiền trực tuyến trên mức này phải xác thực sinh trắc học FacePay (quy định 10 triệu đồng).'),
    cents: BIOMETRIC_THRESHOLD_CENTS,
    source: L('Simulator policy, after SBV Decision 2345/QD-NHNN', 'Chính sách của trình mô phỏng, theo Quyết định 2345/QĐ-NHNN'),
  },
  {
    id: 'chargeback',
    rule: L('A card chargeback must be raised within this many days of the transaction.', 'Yêu cầu bồi hoàn thẻ phải được gửi trong số ngày này kể từ ngày giao dịch.'),
    days: DISPUTE_SLA_DAYS.CHARGEBACK,
    source: L('Simulator policy, after the card schemes’ rules', 'Chính sách của trình mô phỏng, theo quy định của tổ chức thẻ'),
  },
  {
    id: 'vn-large-value',
    rule: L(
      'In Vietnam, a cash transaction of 400,000,000 VND or more in one day is a large-value transaction the bank reports to the SBV.',
      'Tại Việt Nam, giao dịch tiền mặt từ 400.000.000 đồng trở lên trong một ngày là giao dịch có giá trị lớn mà ngân hàng phải báo cáo Ngân hàng Nhà nước.',
    ),
    source: L('Decision 11/2023/QD-TTg', 'Quyết định 11/2023/QĐ-TTg'),
  },
  {
    id: 'vn-wire',
    rule: L('An international electronic transfer of USD 1,000 or more (or its equivalent) is reported to the SBV.', 'Giao dịch chuyển tiền điện tử quốc tế từ 1.000 USD (hoặc tương đương) trở lên phải báo cáo Ngân hàng Nhà nước.'),
    source: L('Circular 09/2023/TT-NHNN', 'Thông tư 09/2023/TT-NHNN'),
  },
  {
    id: 'vn-records',
    rule: L('Customer identification records and transaction documents are kept for at least five years.', 'Hồ sơ nhận biết khách hàng và chứng từ giao dịch được lưu trữ tối thiểu năm năm.'),
    source: L('Law on Anti-Money Laundering 2022 (14/2022/QH15)', 'Luật Phòng, chống rửa tiền 2022 (14/2022/QH15)'),
  },
];

/** Section 3 (Advanced): the internal controls that keep the buffers honest, in the order a day runs them. */
export const INTERNAL_CONTROLS: readonly { id: string; title: Localized<string>; detail: Localized<string> }[] = [
  {
    id: 'screening-list',
    title: L('Refresh the screening lists', 'Cập nhật danh sách sàng lọc'),
    detail: L('The sanctions and watch lists are loaded before the first payment is screened; an emergency update re-screens open cases.', 'Danh sách cấm vận và danh sách theo dõi được nạp trước khi sàng lọc giao dịch đầu tiên; bản cập nhật khẩn sẽ sàng lọc lại các hồ sơ đang mở.'),
  },
  {
    id: 'maker-checker',
    title: L('Maker-checker (four eyes)', 'Kiểm soát hai lớp (maker-checker)'),
    detail: L('Whoever keys a posting over the desk limit never approves it: a second officer checks it against the evidence first.', 'Người lập bút toán vượt hạn mức quầy không được tự phê duyệt: một cán bộ thứ hai đối chiếu với chứng từ trước.'),
  },
  {
    id: 'segregation',
    title: L('Segregation of duties', 'Phân tách nhiệm vụ'),
    detail: L('The teller who counts the cash, the officer who posts it and the one who reconciles the vault are different people.', 'Người kiểm đếm tiền mặt, người hạch toán và người đối chiếu kho quỹ là những người khác nhau.'),
  },
  {
    id: 'reconciliation',
    title: L('Daily reconciliation', 'Đối chiếu hằng ngày'),
    detail: L('Every night the ledger is matched against the card network’s files, the correspondent’s nostro statement and the ATM cash counts.', 'Mỗi đêm sổ cái được đối chiếu với tệp của tổ chức thẻ, sao kê nostro của ngân hàng đại lý và kết quả kiểm quỹ ATM.'),
  },
  {
    id: 'suspense-aging',
    title: L('Suspense ageing review', 'Rà soát tuổi nợ tài khoản treo'),
    detail: L('Each item left in 1910 or 2912 at the close is listed with its age and an owner; items that do not clear are escalated.', 'Mỗi khoản còn lại trong 1910 hoặc 2912 khi khóa sổ được liệt kê kèm số ngày tồn và người phụ trách; khoản không xử lý được sẽ được báo cáo cấp trên.'),
  },
  {
    id: 'trail',
    title: L('An audit trail that is never edited', 'Nhật ký kiểm toán không bị chỉnh sửa'),
    detail: L('Corrections are reversals and new journals, so the auditor can replay every decision with its time, desk and outcome.', 'Mọi điều chỉnh đều bằng bút toán đảo và bút toán mới, nên kiểm toán viên có thể xem lại từng quyết định cùng thời điểm, quầy và kết quả.'),
  },
];

/** Section 5: the accounts each acronym moves, and the desk that handles it (if one does). */
export const ACRONYM_GL: Readonly<Record<string, { gls: readonly GlAccount[]; role?: StaffRoleId }>> = {
  CTR: { gls: ['TILL_CASH', 'CASA'], role: 'cashier' },
  STR: { gls: ['FROZEN_ASSETS', 'CASA'], role: 'aml' },
  SWIFT: { gls: ['NOSTRO', 'WIRE_FEE_INCOME', 'CLEARING_SUSPENSE'], role: 'swift' },
  BNPL: { gls: ['LOAN_PRINCIPAL', 'INTERBANK_SETTLEMENT', 'INTEREST_INCOME', 'LATE_PENALTY_INCOME'], role: 'bnpl' },
  DTI: { gls: ['LOAN_PRINCIPAL', 'OVERDRAFT_RECV'], role: 'bnpl' },
  MDR: { gls: ['FEE_INCOME', 'INTERBANK_SETTLEMENT'] },
  POS: { gls: ['CASA', 'INTERBANK_SETTLEMENT'], role: 'fds' },
  EKYC: { gls: ['CASA', 'OVERDRAFT_RECV', 'FEE_INCOME'], role: 'ekyc' },
  EOD: { gls: ['INTERBANK_SETTLEMENT', 'CLEARING_SUSPENSE', 'ATM_SUSPENSE'] },
  ATM: { gls: ['ATM_CASH', 'ATM_SUSPENSE'] },
  NAPAS: { gls: ['INTERBANK_SETTLEMENT'] },
  NOSTRO: { gls: ['NOSTRO'], role: 'swift' },
  CHARGEBACK: { gls: ['DISPUTE_ACCOUNT', 'INTERBANK_SETTLEMENT'], role: 'dispute' },
  CASA: { gls: ['CASA'] },
  SUSPENSE: { gls: ['ATM_SUSPENSE', 'CLEARING_SUSPENSE'] },
  AML: { gls: ['FROZEN_ASSETS'], role: 'aml' },
  FDS: { gls: ['CASA', 'INTERBANK_SETTLEMENT'], role: 'fds' },
};

/** The balance of `gl` after a flow's steps, in the account's own direction (credit-positive for liabilities). */
export function flowBalances(flow: ArticleFlow, gl: GlAccount): number[] {
  const sign = GL_SIDE[gl] === 'asset' || GL_SIDE[gl] === 'expense' ? 1 : -1;
  const after: number[] = [];
  flow.steps.forEach((st, i) => {
    const before = i === 0 ? 0 : st.instead ? (i >= 2 ? after[i - 2]! : 0) : after[i - 1]!;
    const delta = st.lines.filter((l) => l.gl === gl).reduce((n, l) => n + (l.side === 'dr' ? 1 : -1) * flowAmount(flow, l), 0);
    after.push(before + sign * delta);
  });
  return after;
}

/** A line's amount in cents: its own, or the flow's sample amount. */
export const flowAmount = (flow: ArticleFlow, line: FlowLine): number => line.amount ?? flow.sample;

export type ArticleSectionId = (typeof CORE_LEDGER_ARTICLE.sections)[number]['id'];

// ─────────────────────────────────────────────────────────────────────────────
// Where each account is used, read from the simulator's own postings
// ─────────────────────────────────────────────────────────────────────────────

/** What posts to an account: the scenes (a drill, a retail scenario, or the crisis queue) and its most frequent journal. */
export interface GlUsage {
  /** Up to three scene ids, routine ones most frequent first ("retail_ATM_JAM", "task_dispute_1"), then "crisis" if the emergency queue posts here too. */
  scenes: string[];
  /** The account's most frequent journal, debits first ("Dr 1910 / Cr 2011"), or null if no desk decision posts to it. */
  entry: string | null;
}

const entryOf = (lines: readonly LedgerLine[]): string =>
  [...lines.filter((l) => l.dr > 0), ...lines.filter((l) => l.cr > 0)].map((l) => `${l.dr > 0 ? 'Dr' : 'Cr'} ${GL_CODE[l.gl]}`).join(' / ');

let usage: Readonly<Record<GlAccount, GlUsage>> | null = null;

/**
 * Every account's usage, found by deciding every drill and retail scenario of every desk both ways (and every crisis of the
 * emergency queue), and counting the journals. Nothing here is written by hand, so it follows the simulator when it changes.
 */
export function glUsage(): Readonly<Record<GlAccount, GlUsage>> {
  if (usage) return usage;
  // The crisis queue is counted apart: it replays every crisis per desk, so it would outweigh the routine postings.
  const scenes = new Map<GlAccount, Map<string, number>>();
  const entries = new Map<GlAccount, Map<string, number>>();
  const crisisEntries = new Map<GlAccount, Map<string, number>>();
  const bump = (m: Map<GlAccount, Map<string, number>>, gl: GlAccount, key: string): void => {
    const inner = m.get(gl) ?? new Map<string, number>();
    inner.set(key, (inner.get(key) ?? 0) + 1);
    m.set(gl, inner);
  };
  const record = (scene: string, lines: readonly LedgerLine[]): void => {
    if (!lines.length) return;
    const entry = entryOf(lines);
    for (const gl of new Set(lines.map((l) => l.gl))) {
      if (scene === 'crisis') bump(crisisEntries, gl, entry);
      else {
        bump(scenes, gl, scene);
        bump(entries, gl, entry);
      }
    }
  };
  const decisions: StaffDecision[] = ['APPROVE', 'REJECT'];
  for (const role of STAFF_ROLES) {
    for (let seq = 0; seq < 24; seq++) {
      for (const c of [...STAFF_DRILLS.map((d) => buildTaskCase(role, d, seq)), buildRetailCase(role, seq)]) for (const d of decisions) record(c.scene, gradeTaskCase(c, d).journal?.lines ?? []);
      for (const id of crisisPool(role)) {
        const c = buildTaskCase(role, crisisTask(id), seq, id);
        for (const d of decisions) record('crisis', crisisJournalLines(c, d, id));
      }
    }
  }
  const top = (m: Map<string, number> | undefined, n: number): string[] => [...(m ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k]) => k);
  usage = Object.fromEntries(
    GL_ACCOUNTS.map((a) => {
      const crisis = crisisEntries.has(a.id);
      return [a.id, { scenes: [...top(scenes.get(a.id), crisis ? 2 : 3), ...(crisis ? ['crisis'] : [])], entry: top(entries.get(a.id), 1)[0] ?? top(crisisEntries.get(a.id), 1)[0] ?? null }];
    }),
  ) as Record<GlAccount, GlUsage>;
  return usage;
}
