/**
 * `t('English text')`: the text in the active language. English is the key; the Vietnamese lives in viDictionary.ts. A text
 * with no Vietnamese entry falls back to the English, and the i18n test fails for it, so a missing translation is caught in CI.
 *
 * Use it for fixed labels. Text with values in it uses `tr({ en: `…${x}`, vi: `…${x}` })` from locale.ts instead.
 */

import { activeLocale } from './localeCore';
import { VI_DICTIONARY } from './viDictionary';

export function t(en: string): string {
  return activeLocale() === 'vi' ? (VI_DICTIONARY[en] ?? en) : en;
}
