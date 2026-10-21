/**
 * The Fintech Cheat Sheet: every Academy lesson, the ISO response codes and the chart of GL accounts in one Markdown file,
 * in the language the learner has chosen. Built only when the learner presses Export.
 */

import { CHART_OF_ACCOUNTS, ACCOUNT_IDS } from '../engine/ledger';
import { activeLocale, pick, type Locale, type Localized } from '../i18n/locale';
import type { AccountType } from '../types/processLearning';
import { ACADEMY_CHAPTERS, localChapter } from './academyCatalog';
import { LESSON_EXTRAS } from './lessonExtras';
import { accountName, GL_PLAIN_BOOK, RC_BOOK } from './plainLanguage';

interface SheetWords {
  title: string;
  intro: string;
  contents: string;
  lessons: string;
  chapter: (n: number, title: string) => string;
  topic: string;
  goal: string;
  scenario: string;
  flow: string;
  why: string;
  edges: string;
  keyTerms: string;
  deeper: string;
  ops: string;
  codes: string;
  codesIntro: string;
  code: string;
  beginner: string;
  expert: string;
  accounts: string;
  accountsIntro: string;
  accountCode: string;
  accountName: string;
  plain: string;
  type: string;
  normal: string;
  description: string;
  footer: (date: string) => string;
  types: Record<AccountType, string>;
  sides: Record<'DEBIT' | 'CREDIT', string>;
}

const WORDS: Localized<SheetWords> = {
  en: {
    title: 'ProcessCraft Banking: Fintech Cheat Sheet',
    intro: 'Every Academy lesson in four sections, the ISO 8583 response codes the course teaches, and the chart of general-ledger accounts the simulator posts to.',
    contents: 'Contents',
    lessons: 'Lessons',
    chapter: (n, title) => `Chapter ${n}: ${title}`,
    topic: 'Topic',
    goal: 'Goal',
    scenario: '📌 Real-World Scenario',
    flow: '🔄 Step-by-Step Operational Flow',
    why: '🧠 Why It Matters',
    edges: '⚠️ Edge Cases & Real-World Failures',
    keyTerms: '📇 Key Terms',
    deeper: '🔭 Explore Deeper',
    ops: 'Ops',
    codes: 'ISO 8583 Response Codes',
    codesIntro: 'Field 39 of the authorisation response. Beginner names are what the Beginner View shows.',
    code: 'Code',
    beginner: 'Beginner name',
    expert: 'ISO meaning',
    accounts: 'General Ledger Accounts',
    accountsIntro: 'The chart of accounts behind every double-entry posting in the simulator.',
    accountCode: 'Code',
    accountName: 'Account',
    plain: 'Beginner name',
    type: 'Type',
    normal: 'Normal side',
    description: 'What it holds',
    footer: (date) => `Exported from ProcessCraft Banking on ${date}.`,
    types: { ASSET: 'Asset', LIABILITY: 'Liability', INCOME: 'Income', EXPENSE: 'Expense' },
    sides: { DEBIT: 'Debit', CREDIT: 'Credit' },
  },
  vi: {
    title: 'ProcessCraft Banking: Sổ tay tóm tắt Fintech',
    intro: 'Toàn bộ bài học Academy theo bốn phần, các mã phản hồi ISO 8583 trong khóa học, và hệ thống tài khoản sổ cái mà mô phỏng hạch toán vào.',
    contents: 'Mục lục',
    lessons: 'Bài học',
    chapter: (n, title) => `Chương ${n}: ${title}`,
    topic: 'Chủ đề',
    goal: 'Mục tiêu',
    scenario: '📌 Tình huống thực tế',
    flow: '🔄 Quy trình nghiệp vụ từng bước',
    why: '🧠 Vì sao quan trọng',
    edges: '⚠️ Tình huống biên & lỗi thực tế',
    keyTerms: '📇 Thuật ngữ chính',
    deeper: '🔭 Tìm hiểu sâu hơn',
    ops: 'Vận hành',
    codes: 'Mã phản hồi ISO 8583',
    codesIntro: 'Trường 39 của phản hồi cấp phép. Tên cho người mới là tên hiển thị ở Chế độ người mới.',
    code: 'Mã',
    beginner: 'Tên cho người mới',
    expert: 'Ý nghĩa ISO',
    accounts: 'Tài khoản sổ cái tổng hợp',
    accountsIntro: 'Hệ thống tài khoản đứng sau mọi bút toán kép trong mô phỏng.',
    accountCode: 'Mã',
    accountName: 'Tài khoản',
    plain: 'Tên cho người mới',
    type: 'Loại',
    normal: 'Số dư thông thường',
    description: 'Nội dung',
    footer: (date) => `Xuất từ ProcessCraft Banking ngày ${date}.`,
    types: { ASSET: 'Tài sản', LIABILITY: 'Nợ phải trả', INCOME: 'Thu nhập', EXPENSE: 'Chi phí' },
    sides: { DEBIT: 'Nợ', CREDIT: 'Có' },
  },
};

/** Vietnamese account descriptions; the English ones come from the chart of accounts. */
const ACCOUNT_DESC_VI: Readonly<Record<string, string>> = {
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
};

const esc = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const anchor = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-');

/** The whole cheat sheet as Markdown, in `locale` (the active language by default). */
export function cheatSheetMarkdown(locale: Locale = activeLocale(), today: Date = new Date()): string {
  const w = pick(WORDS, locale);
  const extras = pick(LESSON_EXTRAS, locale);
  const rc = pick(RC_BOOK, locale);
  const gl = pick(GL_PLAIN_BOOK, locale);
  const chapters = ACADEMY_CHAPTERS.map((c) => localChapter(c, locale));
  const out: string[] = [];

  out.push(`# ${w.title}`, '', w.intro, '', `## ${w.contents}`, '');
  for (const c of chapters) out.push(`- [${w.chapter(c.id, c.title)}](#${anchor(w.chapter(c.id, c.title))})`);
  out.push(`- [${w.codes}](#${anchor(w.codes)})`, `- [${w.accounts}](#${anchor(w.accounts)})`, '');

  out.push(`## ${w.lessons}`, '');
  for (const c of chapters) {
    out.push(`### ${w.chapter(c.id, c.title)}`, '', `*${w.topic}: ${c.topic}*`, '');
    for (const l of c.levels) {
      out.push(`#### ${l.id} ${l.title}`, '', `**${w.goal}:** ${l.goal}`, '');
      out.push(`**${w.scenario}**`, '', l.realWorldScenario, '');
      out.push(`**${w.flow}**`, '');
      l.stepByStepFlow.forEach((s, i) => out.push(`${i + 1}. **${s.actor}:** ${s.action}`));
      out.push('', `**${w.why}**`, '', l.whyItMatters, '', `**${w.edges}**`, '');
      for (const e of l.edgeCasesAndErrors) out.push(`- \`${e.code !== null ? `RC ${e.code}` : w.ops}\` **${e.title}.** ${e.detail}`);
      const x = extras[l.id];
      if (x && x.keyTerms.length > 0) {
        out.push('', `**${w.keyTerms}**`, '');
        for (const t of x.keyTerms) out.push(`- **${t.term}:** ${t.definition}`);
      }
      if (x && x.exploreDeeper.length > 0) {
        out.push('', `**${w.deeper}**`, '');
        for (const d of x.exploreDeeper) out.push(`- **${d.title}:** ${d.blurb}`);
      }
      out.push('');
    }
  }

  out.push(`## ${w.codes}`, '', w.codesIntro, '', `| ${w.code} | ${w.beginner} | ${w.expert} |`, '| --- | --- | --- |');
  for (const [code, label] of Object.entries(rc)) out.push(`| ${code} | ${esc(label.plain)} | ${esc(label.expert)} |`);
  out.push('');

  out.push(`## ${w.accounts}`, '', w.accountsIntro, '', `| ${w.accountCode} | ${w.accountName} | ${w.plain} | ${w.type} | ${w.normal} | ${w.description} |`, '| --- | --- | --- | --- | --- | --- |');
  const accounts = [...ACCOUNT_IDS].sort((a, b) => CHART_OF_ACCOUNTS[a].code.localeCompare(CHART_OF_ACCOUNTS[b].code));
  for (const id of accounts) {
    const a = CHART_OF_ACCOUNTS[id];
    const desc = locale === 'vi' ? (ACCOUNT_DESC_VI[a.code] ?? a.description) : a.description;
    out.push(`| ${a.code} | ${esc(accountName(id, locale))} | ${esc(gl[a.code] ?? '')} | ${w.types[a.type]} | ${w.sides[a.normal]} | ${esc(desc)} |`);
  }
  out.push('', '---', '', `*${w.footer(today.toISOString().slice(0, 10))}*`, '');
  return out.join('\n');
}

export const cheatSheetFileName = (locale: Locale = activeLocale()): string => `processcraft-fintech-cheat-sheet-${locale}.md`;

/** Saves the cheat sheet in the browser. A no-op outside a browser. */
export function downloadCheatSheet(locale: Locale = activeLocale()): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([cheatSheetMarkdown(locale)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cheatSheetFileName(locale);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
