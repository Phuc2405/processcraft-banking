/** Message bundles and placeholders, the pure core of the i18n SDK (utils/i18nHelper.ts re-exports all of this and adds the React side: useMessages, formatNodes). */

import { activeLocale, pick, type Locale, type Localized } from './localeCore';

export type Values = Readonly<Record<string, string | number>>;

export const PLACEHOLDER = /\{([A-Za-z_][\w]*)\}/g;

/** Fills `{name}` placeholders. A placeholder with no value is left as written, so a missing value is visible, not blank. */
export function format(template: string, values?: Values): string {
  if (!values) return template;
  return template.replace(PLACEHOLDER, (hit, name: string) => (name in values ? String(values[name]) : hit));
}

export interface MessageBundle<K extends string = string> {
  readonly id: string;
  readonly messages: Readonly<Record<K, Localized<string>>>;
}

const BUNDLES = new Map<string, MessageBundle>();

/** Declares the copy of a feature. */
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
