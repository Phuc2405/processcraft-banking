/**
 * Languages the learner-facing text can be shown in.
 *
 * Only English is written today. Every table of learner-facing words in the app (the plain-English
 * terms, the mental models, the stage briefings, the quiz questions, the button labels) is typed
 * `Localized<...>`, which means "one entry per language in LOCALES". To add Vietnamese later:
 *
 *   1. add 'vi' to LOCALES below,
 *   2. run `npm run typecheck`: the compiler lists every `Localized` table that still lacks a 'vi' entry,
 *   3. fill them in. Nothing else in the app changes, because components read their words through
 *      `pick()` and never hold a literal string of their own for learner-facing copy.
 */

export const LOCALES = ['en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** One value of `T` for every language. */
export type Localized<T> = Record<Locale, T>;

let active: Locale = DEFAULT_LOCALE;

export const activeLocale = (): Locale => active;

/** Switches the language. Nothing offers this to the learner yet; it exists so a second language is a data change. */
export function setActiveLocale(locale: Locale): void {
  active = (LOCALES as readonly string[]).includes(locale) ? locale : DEFAULT_LOCALE;
}

/** The entry for a language, falling back to English when a table has not been translated yet. */
export function pick<T>(table: Localized<T>, locale: Locale = active): T {
  return table[locale] ?? table[DEFAULT_LOCALE];
}
