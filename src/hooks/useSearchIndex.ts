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

export type SearchCategory = 'station' | 'lesson' | 'gl';

export type SearchAction = { kind: 'place'; place: PlaceId } | { kind: 'lesson'; level: LevelId };

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

export const SEARCH_CATEGORIES: readonly SearchCategory[] = ['station', 'lesson', 'gl'];
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
  AML_RESTRAINED_FUNDS: 'GATE_A2A',
  ATM_CASH: 'ATM_CASH',
  DISPUTE_RECEIVABLE: 'RECON',
  FRAUD_LOSS_EXPENSE: 'SEC_3DS',
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

export function searchIndex(index: readonly SearchEntry[], query: string, limit: number = SEARCH_LIMIT): SearchResult {
  const groups: SearchGroups = { station: [], lesson: [], gl: [] };
  const best: Record<SearchCategory, number> = { station: 0, lesson: 0, gl: 0 };
  const q = fold(query);
  if (!q) return { groups, order: [] };
  const numeric = /^\d+$/.test(q);
  const ranked = index
    .map((e, i) => {
      const base = scoreEntry(e, q);
      // A bare number is a GL code first.
      return { e, i, s: base > 0 && numeric && e.category === 'gl' ? base + 5 : base };
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
