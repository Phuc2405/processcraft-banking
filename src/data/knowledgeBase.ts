/**
 * The Knowledge Base: long-form articles that sit beside the Academy. The first one explains the workspace's core ledger:
 * double entry, every GL account the desks post to, operational versus intermediate accounts, and worked journal flows.
 *
 * The account tables are not written here: the article reads GL_ACCOUNTS, so a new account appears in it automatically.
 * Prose comes in both languages ({ en, vi } pairs). Pure data.
 */

import type { Localized } from '../i18n/locale';
import {
  buildRetailCase,
  buildTaskCase,
  crisisJournalLines,
  crisisPool,
  crisisTask,
  GL_ACCOUNTS,
  GL_CODE,
  gradeTaskCase,
  HOLDING_ACCOUNTS,
  STAFF_DRILLS,
  STAFF_ROLES,
  type GlAccount,
  type GlSide,
  type LedgerLine,
  type StaffDecision,
} from '../sim/staffRoleplay';

export type ArticleId = 'core-ledger';

/** A ledger line in a worked example: which account, on which side. */
export interface FlowLine {
  gl: GlAccount;
  side: 'dr' | 'cr';
}

export interface FlowStep {
  text: Localized<string>;
  lines: readonly FlowLine[];
}

export interface ArticleFlow {
  id: string;
  title: Localized<string>;
  summary: Localized<string>;
  steps: readonly FlowStep[];
}

export interface ArticleSection {
  /** Anchor id: search results and the ledger legend jump straight to it. */
  id: string;
  title: Localized<string>;
  paragraphs: readonly Localized<string>[];
  /** Extra search words, in both languages, beyond the title. */
  keywords: readonly string[];
}

const L = (en: string, vi: string): Localized<string> => ({ en, vi });
const dr = (gl: GlAccount): FlowLine => ({ gl, side: 'dr' });
const cr = (gl: GlAccount): FlowLine => ({ gl, side: 'cr' });

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
      keywords: ['double entry', 'but toan kep', 'debit', 'credit', 'no co', 'ghi no', 'ghi co', 'accounting equation', 'phuong trinh ke toan', 'balance sheet', 'can doi so cai', 'bang can doi'],
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
      keywords: ['chart of accounts', 'he thong tai khoan', 'gl', 'general ledger', 'so cai', 'account code', 'so hieu tai khoan'],
    },
    {
      id: 'intermediate',
      title: L('3. Operational vs. intermediate accounts', '3. Tài khoản nghiệp vụ và tài khoản trung gian'),
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
      keywords: ['suspense', 'tai khoan treo', 'nostro', 'dispute', 'tranh chap', 'chargeback', 'boi hoan', 'frozen', 'phong toa', 'collateral', 'tai san bao dam', 'hold', 'intermediate', 'trung gian'],
    },
    {
      id: 'flows',
      title: L('4. Worked flows', '4. Ví dụ dòng hạch toán'),
      paragraphs: [
        L(
          'Each example below follows one case from start to finish, journal by journal. Watch the intermediate account: it fills up, then drains back to zero.',
          'Mỗi ví dụ dưới đây theo dõi một tình huống từ đầu đến cuối, từng bút toán một. Hãy để ý tài khoản trung gian: tiền đi vào, rồi trở về 0.',
        ),
      ],
      keywords: ['atm jam', 'ket tien', 'refund', 'hoan tien', 'card dispute', 'tranh chap the', 'journal flow', 'dong hach toan', 'crisis', 'su co'],
    },
    {
      id: 'glossary',
      title: L('5. Acronyms and codes', '5. Từ viết tắt và mã'),
      paragraphs: [L('The acronyms you meet on the desks, the ledger and the audit report.', 'Các từ viết tắt bạn gặp tại quầy, trong sổ cái và báo cáo kiểm toán.')],
      keywords: ['acronym', 'tu viet tat', 'glossary', 'thuat ngu'],
    },
  ] as const satisfies readonly ArticleSection[],
  flows: [
    {
      id: 'flow-atm-jam',
      title: L('ATM cash jam refund', 'Hoàn tiền ATM bị kẹt'),
      summary: L('The ATM debited the customer but the notes jammed inside the machine.', 'ATM đã trừ tiền của khách nhưng tiền bị kẹt trong máy.'),
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
      id: 'flow-dispute',
      title: L('Card dispute and chargeback', 'Tranh chấp thẻ và bồi hoàn'),
      summary: L('A customer says a merchant charged them for goods that never arrived.', 'Khách cho biết người bán đã trừ tiền nhưng không giao hàng.'),
      steps: [
        { text: L('The dispute desk accepts the claim and gives the customer a provisional credit.', 'Quầy tra soát chấp nhận khiếu nại và tạm ứng tiền cho khách.'), lines: [dr('DISPUTE_ACCOUNT'), cr('CASA')] },
        {
          text: L('The chargeback is won: the merchant’s bank pays back through interbank settlement, and the dispute receivable clears.', 'Bồi hoàn thành công: ngân hàng của người bán hoàn trả qua thanh toán liên ngân hàng, khoản phải thu tranh chấp được tất toán.'),
          lines: [dr('INTERBANK_SETTLEMENT'), cr('DISPUTE_ACCOUNT')],
        },
        { text: L('If the chargeback were lost instead, the provisional credit is taken back from the customer.', 'Nếu bồi hoàn thất bại, khoản tạm ứng sẽ được thu lại từ tài khoản của khách.'), lines: [dr('CASA'), cr('DISPUTE_ACCOUNT')] },
      ],
    },
    {
      id: 'flow-crisis',
      title: L('Crisis hold and outage suspense', 'Phong tỏa khi có sự cố và treo do mất kết nối'),
      summary: L('What the Emergency Crisis Queue posts when you refuse or approve during an incident.', 'Những gì Hàng chờ Cứu hộ hạch toán khi bạn từ chối hoặc phê duyệt trong lúc có sự cố.'),
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
