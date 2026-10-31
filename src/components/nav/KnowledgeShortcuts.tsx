import { uiStore } from '../../store/uiStore';
import { FeedbackButton } from '../shell/FeedbackModal';
import { useMessages } from '../../utils/i18nHelper';
import { knowledgeShortcutsMessages } from './knowledgeShortcuts.messages';

const BUTTON = 'whitespace-nowrap rounded-lg border px-2 py-1 text-[12.5px] font-semibold transition';

/** The header's way into the Knowledge Base (its tabs reach the retail guides), and the feedback form. */
export function KnowledgeShortcuts() {
  const m = useMessages(knowledgeShortcutsMessages);
  return (
    <div className="flex items-center gap-1.5" data-testid="kb-shortcuts">
      <button type="button" title={m('libraryHint')} data-testid="kb-open-library" onClick={() => uiStore.getState().openKnowledge(null, 'core')} className={`${BUTTON} border-slate-600 text-slate-100 hover:bg-slate-800`}>
        {m('library')}
      </button>
      <FeedbackButton />
    </div>
  );
}
