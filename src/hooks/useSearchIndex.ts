import { useMemo } from 'react';
import { CHART_OF_ACCOUNTS, ACCOUNT_IDS } from '../engine/ledger';
import { activeLocale, useLocale, type Locale } from '../i18n/locale';
import { ACADEMY_LEVELS, localLevel, type LevelId } from '../sim/academyCatalog';
import { extrasFor } from '../sim/lessonExtras';
import { accountName } from '../sim/plainLanguage';
import { termsFor } from '../components/bank/useTerms';
import { DEPARTMENTS, EXTERNAL_IDS, STATIONS, STATION_IDS, type PlaceId } from '../sim/topology';
import type { TermMode } from '../sim/terms';
import type { AccountId } from '../types/processLearning';
import { useBankStore } from '../store/bankStore';
import { CORE_LEDGER_ARTICLE, isIntermediate } from '../data/knowledgeBase';
import { AML_ARTICLE } from '../data/amlKnowledge';
import { RETAIL_TOPICS } from '../data/retailKnowledge';
import { TOPIC_MODULES } from '../data/retailTopicModules';
import { pick } from '../i18n/locale';
import { GL_ACCOUNTS } from '../sim/staffRoleplay';
import { lessonSearchText, opsLessonAnchor, OPS_FLASHCARDS, OPS_LESSONS, OPS_QUIZ } from '../data/retailOpsKnowledge';
import { coreCodeOf, OPS_ACCOUNTS, OPS_ACTIONS, OPS_SUB_CHAPTER, OPS_SUBPROCESSES, opsFlowOf, opsSubProcess, type OpsActionId, type OpsSubProcessId } from '../sim/retailOps';
import type { ChapterId } from '../sim/academyCatalog';
import { message } from '../utils/i18nHelper';
import { analystWorkspaceMessages, type AnalystWorkspaceKey } from '../components/bank/analystWorkspace.messages';
import { glossaryTerms, glPlain } from '../components/bank/codeGlossary';

export type SearchCategory = 'station' | 'lesson' | 'gl' | 'kb' | 'ops';

/** `knowledge` opens the Knowledge Base at an anchor: a section id, `gl-<ID>` for a ledger account or `term-<KEY>` for an acronym. */
export type SearchAction = { kind: 'place'; place: PlaceId } | { kind: 'lesson'; level: LevelId } | { kind: 'knowledge'; anchor: string } | { kind: 'sub'; sub: OpsSubProcessId } | { kind: 'opsAction'; action: OpsActionId } | { kind: 'quiz'; chapter: ChapterId };

export interface SearchEntry {
  id: string;
  category: SearchCategory;
  label: string;
  /** Secondary line (department, chapter, account group). */
  detail: string;
  /** Extra matchable text, already folded. */
  keys: string;
  action: SearchAction;
}

export type SearchGroups = Record<SearchCategory, SearchEntry[]>;

export const SEARCH_CATEGORIES: readonly SearchCategory[] = ['station', 'lesson', 'gl', 'kb', 'ops'];
export const SEARCH_LIMIT = 6;

// The desk on the map where each GL account is posted.
export const GL_PLACE: Readonly<Record<AccountId, PlaceId>> = {
  CUST_CASA: 'LEDGER_DEBIT',
  CUST_CASA_HOLD: 'LEDGER_DEBIT',
  CUST_PREPAID_HOLD: 'LEDGER_DEBIT',
  PREPAID_WALLET: 'LEDGER_DEBIT',
  CUST_CREDIT_HOLD: 'LEDGER_CREDIT',
  CARD_RECEIVABLE: 'LEDGER_CREDIT',
  CARD_CLEARING_PAYABLE: 'EOD_BATCH',
  SCHEME_NOSTRO: 'EOD_VISA',
  RECON_SUSPENSE: 'SUSPENSE',
  FX_GAIN_SUSPENSE: 'SUSPENSE',
  FX_LOSS_SUSPENSE: 'SUSPENSE',
  BNPL_RECEIVABLE: 'BNPL',
  A2A_INSTANT_SETTLEMENT: 'GATE_A2A',
  A2A_RTGS_SETTLEMENT: 'GATE_A2A',
  A2A_QUEUE_PAYABLE: 'GATE_A2A',
  OUTWARD_PAYMENTS_CLEARING: 'GATE_A2A',
  AML_RESTRAINED_FUNDS: 'AML_DESK',
  ATM_CASH: 'ATM_CASH',
  DISPUTE_RECEIVABLE: 'DISPUTE_DESK',
  FRAUD_LOSS_EXPENSE: 'SEC_3DS',
  TELLER_VAULT_CASH: 'TELLER_CASH',
  SWIFT_NOSTRO: 'GATE_SWIFT',
};

/** Lower-case, accent-free, single-spaced (so "tiền" matches "tien"). */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const MODES: readonly TermMode[] = ['expert', 'beginner'];

export function buildSearchIndex(mode: TermMode, locale: Locale = activeLocale()): SearchEntry[] {
  const shown = termsFor(mode);
  const out: SearchEntry[] = [];

  for (const id of STATION_IDS) {
    const def = STATIONS[id];
    const names = MODES.flatMap((m) => {
      const t = termsFor(m);
      return [t.station(id), t.stationTitle(id), t.department(def.department)];
    });
    out.push({
      id: `station:${id}`,
      category: 'station',
      label: shown.stationTitle(id),
      detail: shown.departmentTitle(def.department),
      keys: fold([id.replace(/_/g, ' '), def.name, DEPARTMENTS[def.department].name, ...names].join(' | ')),
      action: { kind: 'place', place: id },
    });
  }
  for (const id of EXTERNAL_IDS) {
    out.push({
      id: `station:${id}`,
      category: 'station',
      label: shown.external(id),
      detail: shown.externalSub(id),
      keys: fold([id.replace(/_/g, ' '), ...MODES.map((m) => termsFor(m).external(id))].join(' | ')),
      action: { kind: 'place', place: id },
    });
  }

  out.push(citEntry(locale));

  for (const raw of ACADEMY_LEVELS) {
    const level = localLevel(raw, locale);
    out.push({
      id: `lesson:${raw.id}`,
      category: 'lesson',
      label: `${raw.id} ${level.title}`,
      detail: level.goal,
      keys: fold([raw.title, level.title].join(' | ')),
      action: { kind: 'lesson', level: raw.id },
    });
    for (const [i, kt] of extrasFor(raw.id).keyTerms.entries()) {
      out.push({
        id: `term:${raw.id}:${i}`,
        category: 'lesson',
        label: kt.term,
        detail: `${raw.id} ${level.title}`,
        keys: fold(kt.definition),
        action: { kind: 'lesson', level: raw.id },
      });
    }
  }

  for (const id of ACCOUNT_IDS) {
    const acc = CHART_OF_ACCOUNTS[id];
    const local = accountName(id, locale);
    out.push({
      id: `gl:${id}`,
      category: 'gl',
      label: `${acc.code} ${local}`,
      detail: shown.place(GL_PLACE[id]),
      keys: fold([acc.code, acc.name, local, id.replace(/_/g, ' ')].join(' | ')),
      action: { kind: 'place', place: GL_PLACE[id] },
    });
  }
  out.push(...knowledgeEntries(locale), ...retailOpsEntries(locale));
  return out;
}

const LOCALES_BOTH: readonly Locale[] = ['en', 'vi'];

/** The armoured cash van of the 3D office, in both languages. */
export const CIT_NAME: Readonly<Record<Locale, string>> = { en: 'Cash Transporter (CIT)', vi: 'Xe chở tiền (CIT)' };
const CIT_DETAIL: Readonly<Record<Locale, string>> = { en: 'Cash-in-Transit van: brings cash to the vault and the teller', vi: 'Xe vận chuyển tiền (Cash-in-Transit): đưa tiền về kho quỹ và quầy thu ngân' };

/** The cash van (it is not a desk): found by CIT, cash-in-transit or its Vietnamese name, it shows the teller's cash desk it delivers to. */
export function citEntry(locale: Locale): SearchEntry {
  const words = ['CIT', 'Cash-in-Transit', 'cash in transit', 'cash transporter', 'armoured van', 'armored truck', 'cash van', 'xe chở tiền', 'xe vận chuyển tiền', 'vận chuyển tiền'];
  return {
    id: 'station:CIT_VAN',
    category: 'station',
    label: pick(CIT_NAME, locale),
    detail: pick(CIT_DETAIL, locale),
    keys: fold([...words, ...LOCALES_BOTH.map((l) => pick(CIT_NAME, l)), ...LOCALES_BOTH.map((l) => pick(CIT_DETAIL, l))].join(' | ')),
    action: { kind: 'place', place: 'TELLER_CASH' },
  };
}

/**
 * The Knowledge Base in the search: the core ledger article's sections, the AML article's sections, the 11 retail guides and
 * every retail scenario's SOP, every account the workspace ledger posts to (by GL number and by name in both languages), and
 * every acronym of the code glossary. Each one opens the Knowledge Base on its tab, at its anchor.
 */
export function knowledgeEntries(locale: Locale): SearchEntry[] {
  const out: SearchEntry[] = [];
  const article = pick(CORE_LEDGER_ARTICLE.title, locale);
  for (const sec of CORE_LEDGER_ARTICLE.sections) {
    out.push({
      id: `kb:section:${sec.id}`,
      category: 'kb',
      label: pick(sec.title, locale),
      detail: article,
      keys: fold([...LOCALES_BOTH.map((l) => pick(sec.title, l)), ...sec.keywords].join(' | ')),
      action: { kind: 'knowledge', anchor: sec.id },
    });
  }
  const aml = pick(AML_ARTICLE.title, locale);
  for (const sec of AML_ARTICLE.sections) {
    out.push({
      id: `kb:section:${sec.id}`,
      category: 'kb',
      label: pick(sec.title, locale),
      detail: aml,
      keys: fold([...LOCALES_BOTH.flatMap((l) => [pick(sec.title, l), sec.rule ? pick(sec.rule, l) : '']), ...sec.keywords].join(' | ')),
      action: { kind: 'knowledge', anchor: sec.id },
    });
  }
  const aw = (key: string, l: Locale): string => message(analystWorkspaceMessages, key as AnalystWorkspaceKey, undefined, l);
  for (const g of RETAIL_TOPICS) {
    out.push({
      id: `kb:section:${g.id}`,
      category: 'kb',
      label: pick(g.title, locale),
      detail: pick(g.intro, locale),
      keys: fold([...LOCALES_BOTH.map((l) => pick(g.title, l)), ...g.keywords, ...(TOPIC_MODULES[g.id] ?? []).flatMap((mod) => [...mod.keywords, ...mod.iso.map((i) => i.message), ...mod.rules.flatMap((r) => [r.source.en, r.source.vi])])].join(' | ')),
      action: { kind: 'knowledge', anchor: g.id },
    });
    // Each scenario's SOP: found by its title or by any of its steps, in either language.
    for (const id of g.scenarios) {
      const sop = LOCALES_BOTH.flatMap((l) => [aw(`retail_${id}_title`, l), ...[1, 2, 3].flatMap((n) => [aw(`retail_${id}_sopStd_${n}`, l), aw(`retail_${id}_sopExp_${n}`, l)])]);
      out.push({
        id: `kb:sop:${id}`,
        category: 'kb',
        label: `SOP · ${aw(`retail_${id}_title`, locale)}`,
        detail: pick(g.title, locale),
        keys: fold([id.replace(/_/g, ' '), ...sop].join(' | ')),
        action: { kind: 'knowledge', anchor: g.id },
      });
    }
  }
  for (const acc of GL_ACCOUNTS) {
    const names = LOCALES_BOTH.flatMap((l) => [message(analystWorkspaceMessages, `gl_${acc.id}` as AnalystWorkspaceKey, undefined, l), glPlain(acc.id, l)]);
    out.push({
      id: `kb:gl:${acc.id}`,
      category: 'kb',
      label: `${acc.code} ${message(analystWorkspaceMessages, `gl_${acc.id}` as AnalystWorkspaceKey, undefined, locale)}`,
      detail: glPlain(acc.id, locale),
      keys: fold([acc.code, acc.id.replace(/_/g, ' '), ...names, isIntermediate(acc.id) ? 'intermediate trung gian' : ''].join(' | ')),
      action: { kind: 'knowledge', anchor: `gl-${acc.id}` },
    });
  }
  const meanings = new Map(glossaryTerms('vi').map((t) => [t.key, t.meaning]));
  for (const t of glossaryTerms(locale)) {
    out.push({
      id: `kb:term:${t.key}`,
      category: 'kb',
      label: t.label,
      detail: t.meaning,
      keys: fold([t.key, t.meaning, meanings.get(t.key) ?? ''].join(' | ')),
      action: { kind: 'knowledge', anchor: `term-${t.key}` },
    });
  }
  return out;
}

/**
 * The Phase 1/4 retail operations: each sub-process (which lights its guided flow), demo action (which runs it), account of its
 * book, lesson, flashcard and quiz question.
 */
export function retailOpsEntries(locale: Locale): SearchEntry[] {
  const out: SearchEntry[] = [];
  const both = (v: { en: string; vi: string }): string => `${v.en} | ${v.vi}`;
  for (const s of OPS_SUBPROCESSES) {
    out.push({ id: `ops:sub:${s.id}`, category: 'ops', label: pick(s.title, locale), detail: pick({ en: 'Sub-process: highlight its path', vi: 'Quy trình con: làm nổi đường đi' }, locale), keys: fold(both(s.title)), action: { kind: 'sub', sub: s.id } });
  }
  for (const a of OPS_ACTIONS) {
    out.push({ id: `ops:action:${a.id}`, category: 'ops', label: `${a.icon} ${pick(a.label, locale)}`, detail: pick(a.hint, locale), keys: fold([both(a.label), both(a.hint), `flow ${opsFlowOf(a)}`, both(opsSubProcess(a.sub).title)].join(' | ')), action: { kind: 'opsAction', action: a.id } });
  }
  for (const acc of OPS_ACCOUNTS) {
    out.push({ id: `ops:gl:${acc.id}`, category: 'ops', label: `${acc.code} ${pick(acc.name, locale)}`, detail: pick(acc.plain, locale), keys: fold([acc.code, `tk ${acc.code}`, acc.id.replace(/_/g, ' '), both(acc.name), both(acc.plain), coreCodeOf(acc.id)].join(' | ')), action: { kind: 'knowledge', anchor: `retail-ops-gl-${acc.id}` } });
  }
  for (const l of OPS_LESSONS) {
    const title = opsSubProcess(l.sub).title;
    out.push({ id: `ops:lesson:${l.sub}`, category: 'ops', label: `📖 ${pick(title, locale)}`, detail: pick(l.summary, locale), keys: fold([both(title), lessonSearchText(l)].join(' | ')), action: { kind: 'knowledge', anchor: opsLessonAnchor(l.sub) } });
  }
  for (const c of OPS_FLASHCARDS) {
    out.push({ id: `ops:flash:${c.id}`, category: 'ops', label: `🃏 ${pick(c.front, locale)}`, detail: pick(c.rule, locale), keys: fold([both(c.front), both(c.rule), both(c.reference), 'flashcard the ghi nho'].join(' | ')), action: { kind: 'knowledge', anchor: `flash-${c.id}` } });
  }
  for (const q of OPS_QUIZ) {
    out.push({ id: `ops:quiz:${q.id}`, category: 'ops', label: `❓ ${pick(q.question, locale)}`, detail: pick(opsSubProcess(q.sub).title, locale), keys: fold([both(q.question), ...q.options.map((o) => both(o.text)), 'quiz trac nghiem'].join(' | ')), action: { kind: 'quiz', chapter: OPS_SUB_CHAPTER[q.sub] } });
  }
  return out;
}

/** 0 = no match; higher is better. */
export function scoreEntry(e: SearchEntry, q: string): number {
  const label = fold(e.label);
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.split(/[\s\-/&(),.]+/).some((w) => w.startsWith(q))) return 60;
  if (label.includes(q)) return 40;
  if (e.keys.includes(q)) return 20;
  const words = q.split(' ');
  return words.length > 1 && words.every((w) => label.includes(w) || e.keys.includes(w)) ? 10 : 0;
}

export interface SearchResult {
  groups: SearchGroups;
  /** Non-empty groups, best top hit first (ties keep SEARCH_CATEGORIES order). */
  order: SearchCategory[];
}

/** A GL account number typed with its usual prefix ("GL 1011", "TK 1011", "tài khoản 1011", "#1011"): the number alone. */
const GL_PREFIX = /^(?:gl|tk|so tk|tai khoan|so hieu|so hieu tk|account|acct|acc|#)\s*[#:.-]?\s*(\d{1,4})$/;
export const glCodeQuery = (folded: string): string => GL_PREFIX.exec(folded)?.[1] ?? folded;

export function searchIndex(index: readonly SearchEntry[], query: string, limit: number = SEARCH_LIMIT): SearchResult {
  const groups: SearchGroups = { station: [], lesson: [], gl: [], kb: [], ops: [] };
  const best: Record<SearchCategory, number> = { station: 0, lesson: 0, gl: 0, kb: 0, ops: 0 };
  const q = glCodeQuery(fold(query));
  if (!q) return { groups, order: [] };
  const numeric = /^\d+$/.test(q);
  const ranked = index
    .map((e, i) => {
      const base = scoreEntry(e, q);
      // A bare number is a GL code first: the core ledger's account (Knowledge Base) ahead of the map's posting desk.
      return { e, i, s: base > 0 && numeric && (e.category === 'gl' || e.category === 'kb' || e.category === 'ops') ? base + (e.category === 'kb' ? 6 : e.category === 'gl' ? 5 : 4) : base };
    })
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i);
  for (const { e, s } of ranked) {
    if (groups[e.category].length >= limit) continue;
    groups[e.category].push(e);
    best[e.category] = Math.max(best[e.category], s);
  }
  const order = SEARCH_CATEGORIES.filter((c) => groups[c].length > 0).sort((a, b) => best[b] - best[a]);
  return { groups, order };
}

/** Categorised live results for `query`, rebuilt when the language or vocabulary changes. */
export function useSearchIndex(query: string): SearchResult & { flat: SearchEntry[] } {
  const locale = useLocale();
  const mode = useBankStore((s) => s.termMode);
  const index = useMemo(() => buildSearchIndex(mode, locale), [mode, locale]);
  return useMemo(() => {
    const r = searchIndex(index, query);
    return { ...r, flat: r.order.flatMap((c) => r.groups[c]) };
  }, [index, query]);
}
