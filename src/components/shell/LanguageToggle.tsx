import { LOCALE_OPTIONS, localeStore, useLocale, useMessages } from '../../utils/i18nHelper';
import { languageMessages } from './languageToggle.messages';

/**
 * [🇬🇧 EN | 🇻🇳 VI]: the language of every lesson, panel and label. Remembered in this browser. The app redraws in the new
 * language at once (App keys its tree by the locale).
 *
 * `variant="globe"` is the compact [🌐 EN | VI] form for dialogs. `testId` names the group; the buttons are `${testId}-en` and `-vi`.
 */
export function LanguageToggle({ variant = 'flags', testId = 'language' }: { variant?: 'flags' | 'globe'; testId?: string }) {
  const locale = useLocale();
  const m = useMessages(languageMessages);
  const globe = variant === 'globe';
  return (
    <div
      className={`relative flex items-center ${globe ? 'gap-1.5 rounded-full bg-slate-950/70 py-0.5 pl-2.5 pr-0.5 ring-1 ring-sky-400/50' : 'rounded-lg bg-slate-900 p-0.5 ring-1 ring-slate-700'}`}
      role="group"
      aria-label={m('label')}
      data-testid={testId === 'language' ? 'language-toggle' : testId}
      data-locale={locale}
    >
      {globe && (
        <span className="text-[13px]" aria-hidden="true">
          🌐
        </span>
      )}
      <div className="relative grid grid-cols-2">
        <span aria-hidden="true" className="absolute bottom-0 left-0 top-0 w-1/2 rounded-md bg-sky-500 shadow transition-transform duration-200 ease-out" style={{ transform: `translateX(${locale === 'vi' ? 100 : 0}%)` }} />
        {LOCALE_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            lang={o.id}
            onClick={() => localeStore.getState().setLocale(o.id)}
            aria-pressed={locale === o.id}
            title={o.native}
            data-testid={`${testId}-${o.id}`}
            className={`relative z-10 flex items-center justify-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11.5px] font-bold transition-colors ${locale === o.id ? 'text-slate-950' : 'text-slate-300 hover:text-white'}`}
          >
            {!globe && <span aria-hidden="true">{o.flag}</span>}
            {o.short}
          </button>
        ))}
      </div>
    </div>
  );
}
