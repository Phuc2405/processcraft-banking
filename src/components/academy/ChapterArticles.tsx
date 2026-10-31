import { pick, useLocale } from '../../i18n/locale';
import { chapterArticles } from '../../data/retailOpsKnowledge';
import type { ChapterId } from '../../sim/academyCatalog';
import { uiStore } from '../../store/uiStore';
import { useMessages } from '../../utils/i18nHelper';
import { retailOpsMessages } from '../bank/retailOps.messages';

/** The Knowledge Base articles a chapter draws on: the Academy keeps its six chapters and points to the reference material from inside them. */
export function ChapterArticles({ chapter }: { chapter: ChapterId }) {
  const m = useMessages(retailOpsMessages);
  const locale = useLocale();
  const articles = chapterArticles(chapter);
  if (!articles.length) return null;
  return (
    <nav aria-label={m('relatedArticles')} className="rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-2" data-testid={`chapter-articles-${chapter}`}>
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">📖 {m('relatedArticles')}</div>
      <ul className="mt-1 space-y-0.5">
        {articles.map((a) => (
          <li key={a.anchor}>
            <button type="button" onClick={() => uiStore.getState().openKnowledge(a.anchor)} data-article={a.anchor} className="text-left text-[12px] text-sky-300 hover:underline">
              {pick(a.title, locale)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
