import { useMemo } from 'react';
import { GL_SIDE, type GlAccount, type LedgerLine } from '../../sim/staffRoleplay';
import { message, useLocale, type Locale, type Values } from '../../utils/i18nHelper';
import { codeGlossaryMessages, type CodeGlossaryKey } from './codeGlossary.messages';

/**
 * Turns raw banking codes into plain language. `explain` knows desk IDs (DISPUTE_DESK), status codes (DISPUTE_REFUNDED) and
 * acronyms (CTR, pacs.008); `gloss` finds every such code inside a sentence and lists their meanings, for a hover title.
 * Codes the glossary does not know are left alone, so a lookup never invents a meaning.
 */

/** Basic: plain words instead of codes. Advanced: the exact codes, GL numbers and Dr/Cr legs, meanings on hover. */
export type ViewMode = 'basic' | 'advanced';

const MSGS = codeGlossaryMessages.messages;
const has = (key: string): key is CodeGlossaryKey => key in MSGS;
const say = (key: CodeGlossaryKey, locale: Locale, values?: Values): string => message(codeGlossaryMessages, key, values, locale);

/** "pacs.008" → "PACS008", "ISO 20022" → "ISO20022", "eKYC" → "EKYC"; underscores in status codes are kept. */
const termKey = (code: string): string => code.toUpperCase().replace(/[.\s-]/g, '');

/** The meaning of one code, or undefined when the glossary does not know it. */
export function explainCode(code: string, locale: Locale): string | undefined {
  for (const key of [`desk_${code}`, `status_${code}`, `term_${termKey(code)}`]) if (has(key)) return say(key, locale);
  return undefined;
}

/** Codes worth explaining inside free text: SCREAMING_SNAKE codes, short acronyms, and ISO 20022 message names. */
const CODE_IN_TEXT = /\b(?:ISO 20022|pacs\.\d{3}|e?KYC|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z]{2,6})\b/g;

/** Every known code in `text`, once each, with its meaning, in the order they appear. */
export function codesIn(text: string, locale: Locale): { code: string; meaning: string }[] {
  const seen = new Set<string>();
  const out: { code: string; meaning: string }[] = [];
  for (const [code] of text.matchAll(CODE_IN_TEXT)) {
    if (seen.has(code)) continue;
    seen.add(code);
    const meaning = explainCode(code, locale);
    if (meaning) out.push({ code, meaning });
  }
  return out;
}

/** A hover title listing the codes in `text` ("CTR: …\nSTR: …"), or undefined when it has none. */
export function glossText(text: string, locale: Locale): string | undefined {
  const found = codesIn(text, locale);
  return found.length ? found.map((f) => `${f.code}: ${f.meaning}`).join('\n') : undefined;
}

/** A GL account in everyday words ("Customer account balances" for CASA). */
export const glPlain = (gl: GlAccount, locale: Locale): string => say(`glPlain_${gl}` as CodeGlossaryKey, locale);

/** Whether a journal line raises its account: debits raise assets and expenses, credits raise everything else. */
export const lineRaises = (l: LedgerLine): boolean => {
  const debitNatural = GL_SIDE[l.gl] === 'asset' || GL_SIDE[l.gl] === 'expense';
  return debitNatural ? l.dr > 0 : l.cr > 0;
};

/** One journal line in plain words: "Customer account balances ↓ decreases". */
export const lineText = (l: LedgerLine, locale: Locale): string => say(lineRaises(l) ? 'moveUp' : 'moveDown', locale, { account: glPlain(l.gl, locale) });

export interface Glossary {
  locale: Locale;
  /** The glossary's own UI copy (view toggle, zoom). */
  g: (key: CodeGlossaryKey, values?: Values) => string;
  explain: (code: string) => string | undefined;
  gloss: (text: string) => string | undefined;
  /** A desk ID or status code in plain words, falling back to the code itself. */
  plain: (code: string) => string;
  glPlain: (gl: GlAccount) => string;
  line: (l: LedgerLine) => string;
}

/** The glossary bound to the active language. */
export function useGlossary(): Glossary {
  const locale = useLocale();
  return useMemo(
    () => ({
      locale,
      g: (key, values) => say(key, locale, values),
      explain: (code) => explainCode(code, locale),
      gloss: (text) => glossText(text, locale),
      plain: (code) => explainCode(code, locale) ?? code,
      glPlain: (gl) => glPlain(gl, locale),
      line: (l) => lineText(l, locale),
    }),
    [locale],
  );
}

/** How a term key is written on screen when it is not simply its upper-case key. */
const TERM_SPELLING: Readonly<Record<string, string>> = {
  PACS008: 'pacs.008',
  PACS004: 'pacs.004',
  ISO20022: 'ISO 20022',
  EKYC: 'eKYC',
  CHARGEBACK: 'Chargeback',
  NOSTRO: 'Nostro',
  SUSPENSE: 'Suspense',
  DR: 'Dr',
  CR: 'Cr',
};

export interface GlossaryTerm {
  /** The key after `term_` ("PACS008"): the anchor id of the term in the Knowledge Base. */
  key: string;
  /** As written on screen ("pacs.008"). */
  label: string;
  meaning: string;
}

/** Every acronym and term the glossary explains, in bundle order. */
export function glossaryTerms(locale: Locale): GlossaryTerm[] {
  return (Object.keys(MSGS) as CodeGlossaryKey[])
    .filter((k) => k.startsWith('term_'))
    .map((k) => {
      const key = k.slice('term_'.length);
      return { key, label: TERM_SPELLING[key] ?? key, meaning: say(k, locale) };
    });
}
