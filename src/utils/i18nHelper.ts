/**
 * The i18n SDK: the one import a feature needs for language.
 *
 *   import { defineMessages, useMessages, useI18n } from '../utils/i18nHelper';
 *
 * Pick the tool by what the text is:
 *
 *   Component copy        defineMessages + useMessages   Typed keys, both languages required by the compiler, checked by test.
 *   A fixed English label t('Close')                     Vietnamese lives in i18n/viDictionary.ts, a test checks every key.
 *   A label with values   tf('Day {n}', { n })           Same dictionary, `{name}` placeholders.
 *   Counts                plural(n, { one, other })      Vietnamese has no plural, so it always takes `other`.
 *   Big tables            Localized<T> + pick()          One entry per language, the compiler lists what is missing.
 *   Simulation output     English only                   The simulation, the stores and the exports write canonical English.
 *                                                        Screens translate at display (feedText, localizeScenarioText, noteText).
 *
 * The rule behind the last row: never call a translator while WRITING state. Text that is stored in the language of the
 * moment comes out half and half after a language switch ("Debiting Chia hóa đơn qua QR from the account…").
 *
 * Example, a new feature panel:
 *
 *   // refundPanel.messages.ts
 *   export const refund = defineMessages('refund', {
 *     title: { en: 'Refund a payment', vi: 'Hoàn tiền giao dịch' },
 *     done:  { en: 'Refunded {amount}', vi: 'Đã hoàn {amount}' },
 *   });
 *
 *   // RefundPanel.tsx
 *   const m = useMessages(refund);
 *   return <h2>{m('title')}</h2>;
 */

import { Fragment, createElement, useCallback, useMemo, type ReactNode } from 'react';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_KEY,
  activeLocale,
  isLocale,
  localeStore,
  pick,
  setActiveLocale,
  tr,
  useLocale,
  type Locale,
  type Localized,
} from '../i18n/locale';
import { t } from '../i18n/t';

export { DEFAULT_LOCALE, LOCALES, LOCALE_KEY, activeLocale, isLocale, localeStore, pick, setActiveLocale, t, tr, useLocale };
export type { Locale, Localized };

// ─────────────────────────────────────────────────────────────────────────────
// Language metadata (one place for what a language picker shows)
// ─────────────────────────────────────────────────────────────────────────────

export interface LocaleMeta {
  id: Locale;
  flag: string;
  /** "EN" / "VI": the short label on a toggle. */
  short: string;
  /** The language's own name, which is what a picker should show. */
  native: string;
}

export const LOCALE_META: Readonly<Record<Locale, LocaleMeta>> = {
  en: { id: 'en', flag: '🇬🇧', short: 'EN', native: 'English' },
  vi: { id: 'vi', flag: '🇻🇳', short: 'VI', native: 'Tiếng Việt' },
};

/** The languages in picker order. */
export const LOCALE_OPTIONS: readonly LocaleMeta[] = LOCALES.map((id) => LOCALE_META[id]);

// ─────────────────────────────────────────────────────────────────────────────
// Language detection (for guards and tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Letters only Vietnamese uses: ă â đ ê ô ơ ư and every tone-marked vowel (U+1EA0–U+1EF9, plus ĩ ũ). Letters Vietnamese
 * shares with French or Spanish (é, è, à…) are left out on purpose, so "café" is not mistaken for Vietnamese.
 */
const VIETNAMESE = /[ăâđêôơưĂÂĐÊÔƠƯĩũĨŨ\u1EA0-\u1EF9]/;

/** True when the text contains Vietnamese. The i18n tests use it to prove English screens, exports and data stay English. */
export const hasVietnamese = (text: string): boolean => VIETNAMESE.test(text);

// ─────────────────────────────────────────────────────────────────────────────
// Values and plurals
// ─────────────────────────────────────────────────────────────────────────────

export type Values = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{([A-Za-z_][\w]*)\}/g;

/** Fills `{name}` placeholders. A placeholder with no value is left as written, so a missing value is visible, not blank. */
export function format(template: string, values?: Values): string {
  if (!values) return template;
  return template.replace(PLACEHOLDER, (hit, name: string) => (name in values ? String(values[name]) : hit));
}

/**
 * Fills `{name}` placeholders with React nodes (a <kbd>, a link, a bold word), so the sentence stays ONE translatable string
 * and each language puts the node where its grammar wants it: 'Press {key} to skip' / 'Nhấn {key} để bỏ qua'.
 */
export function formatNodes(template: string, nodes: Readonly<Record<string, ReactNode>>): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of template.matchAll(PLACEHOLDER)) {
    const at = m.index ?? 0;
    if (at > last) out.push(template.slice(last, at));
    const name = m[1] as string;
    out.push(name in nodes ? createElement(Fragment, { key: n++ }, nodes[name]) : m[0]);
    last = at + m[0].length;
  }
  if (last < template.length) out.push(template.slice(last));
  return out;
}

/** The placeholder names in a template, sorted. */
export const placeholdersOf = (template: string): string[] => [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1] as string))].sort();

/** A fixed label with values: `tf('Day {n}', { n: 3 })`. The Vietnamese entry in viDictionary keeps the same placeholders. */
export const tf = (en: string, values?: Values): string => format(t(en), values);

/** English separates one from many; Vietnamese does not, so it always takes `other`. */
export function plural<T>(n: number, forms: { one: T; other: T }, locale: Locale = activeLocale()): T {
  return locale === 'en' && n === 1 ? forms.one : forms.other;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message bundles
// ─────────────────────────────────────────────────────────────────────────────

export interface MessageBundle<K extends string = string> {
  readonly id: string;
  readonly messages: Readonly<Record<K, Localized<string>>>;
}

const BUNDLES = new Map<string, MessageBundle>();

/**
 * Declares the copy of a feature. Every key needs every language (the compiler checks it), and the bundle is registered so the
 * i18n test can check its placeholders and spot an untranslated entry. Define bundles at module level, never inside a component.
 */
export function defineMessages<K extends string>(id: string, messages: Readonly<Record<K, Localized<string>>>): MessageBundle<K> {
  const bundle: MessageBundle<K> = { id, messages };
  BUNDLES.set(id, bundle as MessageBundle);
  return bundle;
}

/** Every bundle defined so far. */
export const registeredBundles = (): readonly MessageBundle[] => [...BUNDLES.values()];

/** One message in a language (the active one by default). */
export function message<K extends string>(bundle: MessageBundle<K>, key: K, values?: Values, locale: Locale = activeLocale()): string {
  const entry = bundle.messages[key];
  return format(pick(entry, locale), values);
}

export type Translate<K extends string> = (key: K, values?: Values) => string;

/** A translator for one bundle, bound to the active language. Re-renders the component when the language changes. */
export function useMessages<K extends string>(bundle: MessageBundle<K>): Translate<K> {
  const locale = useLocale();
  return useCallback((key, values) => message(bundle, key, values, locale), [bundle, locale]);
}

/**
 * What is wrong with a bundle, as readable lines (empty when it is fine). A language left empty, a placeholder one language
 * has and another does not, and a Vietnamese entry that is just the English copied over, unless `same` lists the key.
 */
export function bundleProblems(bundle: MessageBundle, same: readonly string[] = []): string[] {
  const problems: string[] = [];
  for (const [key, entry] of Object.entries(bundle.messages) as Array<[string, Localized<string>]>) {
    const where = `${bundle.id}.${key}`;
    for (const locale of LOCALES) if (!entry[locale]?.trim()) problems.push(`${where}: empty ${locale}`);
    const base = placeholdersOf(entry[DEFAULT_LOCALE] ?? '').join(',');
    for (const locale of LOCALES) if (placeholdersOf(entry[locale] ?? '').join(',') !== base) problems.push(`${where}: ${locale} placeholders differ from ${DEFAULT_LOCALE}`);
    if (entry.vi === entry.en && !same.includes(key)) problems.push(`${where}: vi is the same as en`);
  }
  return problems;
}

// ─────────────────────────────────────────────────────────────────────────────
// The hook for everything else
// ─────────────────────────────────────────────────────────────────────────────

export interface I18n {
  locale: Locale;
  isVi: boolean;
  setLocale(locale: Locale): void;
  toggle(): void;
  t: typeof t;
  tf: typeof tf;
  tr: typeof tr;
  plural<T>(n: number, forms: { one: T; other: T }): T;
}

/** Language state and the translators in one hook, for components that need more than one bundle. */
export function useI18n(): I18n {
  const locale = useLocale();
  return useMemo<I18n>(
    () => ({
      locale,
      isVi: locale === 'vi',
      setLocale: (next) => setActiveLocale(next),
      toggle: () => localeStore.getState().toggle(),
      t,
      tf,
      tr,
      plural: (n, forms) => plural(n, forms, locale),
    }),
    [locale],
  );
}
