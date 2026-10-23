import { localeStore, useLocale, type Locale } from '../../i18n/locale';

/**
 * [🇬🇧 EN | 🇻🇳 VI]: the language of every lesson, panel and label. Remembered in this browser. The app redraws in the new
 * language at once (App keys its tree by the locale).
 */
export function LanguageToggle() {
  const locale = useLocale();
  const options: ReadonlyArray<{ id: Locale; flag: string; label: string; title: string }> = [
    { id: 'en', flag: '🇬🇧', label: 'EN', title: 'English' },
    { id: 'vi', flag: '🇻🇳', label: 'VI', title: 'Tiếng Việt' },
  ];
  return (
    <div className="relative grid grid-cols-2 rounded-lg bg-slate-900 p-0.5 ring-1 ring-slate-700" role="group" aria-label={locale === 'vi' ? 'Ngôn ngữ' : 'Language'} data-testid="language-toggle" data-locale={locale}>
      <span aria-hidden="true" className="absolute bottom-0.5 left-0.5 top-0.5 w-[calc(50%-2px)] rounded-md bg-sky-500 shadow transition-transform duration-200 ease-out" style={{ transform: `translateX(${locale === 'vi' ? 100 : 0}%)` }} />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          lang={o.id}
          onClick={() => localeStore.getState().setLocale(o.id)}
          aria-pressed={locale === o.id}
          title={o.title}
          data-testid={`language-${o.id}`}
          className={`relative z-10 flex items-center justify-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11.5px] font-bold transition-colors ${locale === o.id ? 'text-slate-950' : 'text-slate-300 hover:text-white'}`}
        >
          <span aria-hidden="true">{o.flag}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
}
