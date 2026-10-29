/**
 * Languages the learner-facing text can be shown in, for the app's components: everything in localeCore.ts (the language
 * store, `pick`, `tr`), plus `useLocale()`, which re-renders a component when the language changes, and the page's `lang`
 * attribute kept in step with the language picked.
 */

import { useSyncExternalStore } from 'react';
import { localeStore, type Locale } from './localeCore';

export * from './localeCore';

function applyDocumentLang(locale: Locale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

applyDocumentLang(localeStore.getState().locale);
localeStore.subscribe((s, prev) => {
  if (s.locale !== prev.locale) applyDocumentLang(s.locale);
});

/** The current language, re-rendering the caller when it changes. */
// The live locale is also the server snapshot: the language is never "initial" when something renders (tests, previews).
const currentLocale = (): Locale => localeStore.getState().locale;
export const useLocale = (): Locale => useSyncExternalStore(localeStore.subscribe, currentLocale, currentLocale);
