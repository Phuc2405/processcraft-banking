import { useMessages } from '../../utils/i18nHelper';
import { creditsMessages } from './credits.messages';

/** The author's LinkedIn profile. */
export const AUTHOR_URL = 'https://www.linkedin.com/in/pnthienphuc2405/';

/** The author's name in the current language ("Phúc Phạm" / "Felix Pham"), linked to LinkedIn in a new tab. */
export function AuthorLink({ className = '' }: { className?: string }) {
  const m = useMessages(creditsMessages);
  return (
    <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" title={m('authorHint')} data-testid="author-link" className={`font-semibold text-sky-300 underline-offset-2 hover:underline ${className}`}>
      {m('author')}
    </a>
  );
}

/** The app's discreet footer: "ProcessCraft Banking • Built by Felix Pham". */
export function AppFooter() {
  const m = useMessages(creditsMessages);
  return (
    <footer className="shrink-0 border-t border-slate-800/80 bg-[#060912] px-4 py-1 text-center text-[11px] text-slate-500" data-testid="app-footer">
      ProcessCraft Banking • {m('builtBy')} <AuthorLink />
    </footer>
  );
}
