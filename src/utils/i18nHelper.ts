/** The i18n SDK: the one import a feature needs for language. import { defineMessages, useMessages, useI18n } from '../utils/i18nHelper'. */

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
import { format, message, PLACEHOLDER, type MessageBundle, type Values } from '../i18n/messageCore';

export { defineMessages, format, message, registeredBundles, type MessageBundle, type Values } from '../i18n/messageCore';

export { DEFAULT_LOCALE, LOCALES, LOCALE_KEY, activeLocale, isLocale, localeStore, pick, setActiveLocale, t, tr, useLocale };
export type { Locale, Localized };

// Language metadata (one place for what a language picker shows)

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

// Language detection (for guards and tests)

/** Letters only Vietnamese uses: ă â đ ê ô ơ ư and every tone-marked vowel (U+1EA0–U+1EF9, plus ĩ ũ). */
const VIETNAMESE = /[ăâđêôơưĂÂĐÊÔƠƯĩũĨŨ\u1EA0-\u1EF9]/;

/** True when the text contains Vietnamese. The i18n tests use it to prove English screens, exports and data stay English. */
export const hasVietnamese = (text: string): boolean => VIETNAMESE.test(text);

// Values and plurals

/** Fills `{name}` placeholders with React nodes (a <kbd>, a link, a bold word), so the sentence stays ONE translatable string and each language puts the node where its grammar wants it. */
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

// Message bundles

export type Translate<K extends string> = (key: K, values?: Values) => string;

/** A translator for one bundle, bound to the active language. Re-renders the component when the language changes. */
export function useMessages<K extends string>(bundle: MessageBundle<K>): Translate<K> {
  const locale = useLocale();
  return useCallback((key, values) => message(bundle, key, values, locale), [bundle, locale]);
}

/** What is wrong with a bundle, as readable lines (empty when it is fine). */
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

// The hook for everything else

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
