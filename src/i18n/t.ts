/** `t('English text')`: the text in the active language. */

import { activeLocale } from './localeCore';
import { VI_DICTIONARY } from './viDictionary';

export function t(en: string): string {
  return activeLocale() === 'vi' ? (VI_DICTIONARY[en] ?? en) : en;
}
