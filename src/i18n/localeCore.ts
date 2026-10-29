/**
 * Languages the learner-facing text can be shown in: English and Vietnamese.
 *
 * Every table of learner-facing words in the app (the plain-English terms, the mental models, the stage briefings, the quiz
 * questions, the button labels, the lessons) is typed `Localized<...>`, which means "one entry per language in LOCALES".
 * Adding a third language is: add it to LOCALES, run `npm run typecheck`, fill in every table the compiler lists.
 *
 * The chosen language lives in a small Zustand store (`localeStore`) and is remembered in this browser. `pick()` reads the
 * store, so plain functions get the right words; `useLocale()` (locale.ts) re-renders a component when the language
 * changes, and the app root is keyed by the locale so every `pick()` reader below it redraws in the new language.
 *
 * This is the pure core, free of React and the page: the simulation reads its words through it. locale.ts adds the React
 * hook and keeps the page's `lang` attribute in step, and re-exports all of this.
 */

import { createStore } from 'zustand/vanilla';

export const LOCALES = ['en', 'vi'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** One value of `T` for every language. */
export type Localized<T> = Record<Locale, T>;

export const isLocale = (v: unknown): v is Locale => (LOCALES as readonly unknown[]).includes(v);

export const LOCALE_KEY = 'processcraft:v1:locale';

function readSaved(): Locale {
  try {
    const v = typeof window === 'undefined' ? null : window.localStorage.getItem(LOCALE_KEY);
    return isLocale(v) ? v : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function save(locale: Locale): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Remembering the language is a nicety.
  }
}

export interface LocaleState {
  locale: Locale;
  setLocale(locale: Locale): void;
  toggle(): void;
}

export const localeStore = createStore<LocaleState>((set, get) => ({
  locale: readSaved(),
  setLocale: (locale) => {
    const next = isLocale(locale) ? locale : DEFAULT_LOCALE;
    if (next === get().locale) return;
    save(next);
    set({ locale: next });
  },
  toggle: () => get().setLocale(get().locale === 'en' ? 'vi' : 'en'),
}));

export const activeLocale = (): Locale => localeStore.getState().locale;

/** Switches the language for the whole app. */
export function setActiveLocale(locale: Locale): void {
  localeStore.getState().setLocale(locale);
}

/** The entry for a language, falling back to English when a table has not been translated yet. */
export function pick<T>(table: Localized<T>, locale: Locale = activeLocale()): T {
  return table[locale] ?? table[DEFAULT_LOCALE];
}

/** Inline two-language text for components: `tr({ en: 'Close', vi: 'Đóng' })`. */
export function tr(text: Localized<string>, locale: Locale = activeLocale()): string {
  return pick(text, locale);
}
