/**
 * The Academy's Course Catalog: one card per chapter, strictly in the order a learner should take them.
 *
 *   Chapter 1  Virtual Card Tokenization & dCVV Masking
 *   Chapter 2  3-D Secure 2.x Risk Engine (Frictionless vs Challenge OTP)
 *   Chapter 3  BNPL Pay-in-4 Underwriting & Card Fallback
 *   Chapter 4  EOD 3-Way Reconciliation & Suspense Accounting
 *   Chapter 5  Instant Account-to-Account Transfers (A2A & pacs.008)
 *   Chapter 6  AML Screening & Chargeback Dispute Resolution
 *
 * The lessons themselves (learning.ts) own the title, the accent colour and the stories. This file adds what only the catalog
 * needs: a difficulty tag, a one-line explanation a complete beginner can read, and the length of the tour, which is counted from
 * the real plans (a chapter's "estimated steps" is the fewest and most desks-and-decisions its examples take, not a guess).
 */

import { activeLocale } from '../i18n/locale';
import { LESSON_LIST, type ProcessId } from './learning';
import { spotPlan } from './spotlightPlan';

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export interface Chapter {
  id: ProcessId;
  /** 1 to 6, strictly progressive. */
  number: number;
  title: string;
  difficulty: Difficulty;
  /** One sentence for someone who has never worked in a bank. */
  layman: string;
  accent: string;
  /** The fewest and most steps a tour of this chapter takes, depending on the example chosen. */
  steps: { min: number; max: number };
  /** How many worked examples the chapter offers. */
  examples: number;
}

/** What the tag on the card means, for the tooltip. */
export const DIFFICULTY_HINT: Record<Difficulty, string> = {
  Beginner: 'No banking background needed',
  Intermediate: 'Builds on the earlier chapters',
  Advanced: 'Several decisions and many moving parts',
};

const DIFFICULTY: Record<ProcessId, Difficulty> = {
  A: 'Beginner',
  B: 'Intermediate',
  C: 'Intermediate',
  D: 'Advanced',
  E: 'Intermediate',
  F: 'Advanced',
};

/** One line each, in plain words. (The glossary leaves these alone: they contain no jargon.) */
const LAYMAN: Record<ProcessId, string> = {
  A: 'A throwaway card number for one shop, with a security code that changes every minute so a stolen copy is useless.',
  B: 'How the bank decides whether to let an online payment through quietly or to ask the customer for a text-message code.',
  C: 'Splitting a purchase into four payments: who gets the plan, and what happens when the check says no.',
  D: 'The night shift that checks every record agrees, and the holding box where the odd ones out wait for a human.',
  E: 'Sending money straight from one bank account to another in seconds, with one strict check before any money moves.',
  F: 'Spotting suspicious money, and settling who pays when a customer says “that charge is not mine”.',
};

const LAYMAN_VI: Record<ProcessId, string> = {
  A: 'Một số thẻ dùng một lần cho một cửa hàng, với mã bảo mật đổi mỗi phút nên bản sao bị đánh cắp cũng vô dụng.',
  B: 'Cách ngân hàng quyết định cho một giao dịch trực tuyến đi qua lặng lẽ hay yêu cầu khách nhập mã gửi qua tin nhắn.',
  C: 'Chia một lần mua thành bốn kỳ trả: ai được duyệt kế hoạch, và điều gì xảy ra khi kết quả thẩm định là không.',
  D: 'Ca đêm kiểm tra mọi bản ghi có khớp nhau không, và chiếc hộp chờ nơi những bản ghi lệch đợi con người xử lý.',
  E: 'Chuyển tiền thẳng từ tài khoản ngân hàng này sang tài khoản khác trong vài giây, với một bước kiểm tra nghiêm ngặt trước khi tiền di chuyển.',
  F: 'Phát hiện dòng tiền đáng ngờ, và phân xử ai phải trả khi khách nói “giao dịch này không phải của tôi”.',
};

const DIFFICULTY_VI: Record<Difficulty, { label: string; hint: string }> = {
  Beginner: { label: 'Cơ bản', hint: 'Không cần kiến thức ngân hàng' },
  Intermediate: { label: 'Trung cấp', hint: 'Dựa trên các chương trước' },
  Advanced: { label: 'Nâng cao', hint: 'Nhiều quyết định và nhiều phần chuyển động' },
};

/** The difficulty tag in the active language. */
export const difficultyText = (d: Difficulty): string => (activeLocale() === 'vi' ? DIFFICULTY_VI[d].label : d);

/** The difficulty tooltip in the active language. */
export const difficultyHint = (d: Difficulty): string => (activeLocale() === 'vi' ? DIFFICULTY_VI[d].hint : DIFFICULTY_HINT[d]);

/** The one-line plain explanation in the active language. */
export const laymanText = (c: Pick<Chapter, 'id' | 'layman'>): string => (activeLocale() === 'vi' ? LAYMAN_VI[c.id] : c.layman);

const cache: { list: readonly Chapter[] | null } = { list: null };

/** The six chapters, in order. */
export function chapters(): readonly Chapter[] {
  if (cache.list) return cache.list;
  cache.list = LESSON_LIST.map((lesson) => {
    const counts = lesson.examples.map((e) => spotPlan(lesson.id, e.id).steps.length);
    return {
      id: lesson.id,
      number: lesson.chapter,
      title: lesson.title,
      difficulty: DIFFICULTY[lesson.id],
      layman: LAYMAN[lesson.id],
      accent: lesson.accent,
      steps: { min: Math.min(...counts), max: Math.max(...counts) },
      examples: lesson.examples.length,
    };
  }).sort((a, b) => a.number - b.number);
  return cache.list;
}

export const chapterOf = (id: ProcessId): Chapter => {
  const found = chapters().find((c) => c.id === id);
  if (!found) throw new Error(`No chapter ${id}`);
  return found;
};

/** "6 steps" or "5 to 10 steps". */
export function stepsText(c: Pick<Chapter, 'steps'>): string {
  const { min, max } = c.steps;
  const unit = activeLocale() === 'vi' ? 'bước' : 'steps';
  return min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`;
}
