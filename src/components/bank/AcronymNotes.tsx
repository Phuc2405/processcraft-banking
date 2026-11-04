import { pick, useLocale } from '../../i18n/locale';
import { useMessages } from '../../utils/i18nHelper';
import { acronymsIn } from './codeGlossary';
import { codeGlossaryMessages } from './codeGlossary.messages';
import { SectionTitle } from './ui';

/** The Inspector's plain-language notes: each acronym in a description, expanded, with its Vietnamese name and the rule behind it. Nothing shows when the text has none. */
export function AcronymNotes({ text }: { text: string }) {
  const locale = useLocale();
  const m = useMessages(codeGlossaryMessages);
  const found = acronymsIn(text, locale);
  if (found.length === 0) return null;
  return (
    <section data-testid="acronym-notes">
      <SectionTitle>{m('acronymsExplained')}</SectionTitle>
      <dl className="space-y-1.5">
        {found.map((a) => (
          <div key={a.key} className="rounded-lg border border-slate-800 bg-slate-900/50 px-2.5 py-1.5 text-[12px] leading-snug" data-acronym={a.key}>
            <dt className="font-semibold text-slate-100">
              <span className="font-mono text-sky-200">{a.label}</span> · {a.full}
            </dt>
            <dd className="mt-0.5 text-sky-200/80">{a.vi}</dd>
            <dd className="mt-0.5 text-slate-300">{pick(a.rule, locale)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
