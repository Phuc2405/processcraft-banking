import { lessonAnchor, type LessonKey } from '../../data/subProcessLessons';
import { uiStore } from '../../store/uiStore';
import { useMessages } from '../../utils/i18nHelper';
import { subProcessInfoMessages } from './subProcessInfo.messages';

/** The 📖 of a sub-process: opens its lesson in the Knowledge Base (data/subProcessLessons.ts). One button for the top menu and the drawer. */
export function LessonLink({ lessonKey, className = '' }: { lessonKey: LessonKey; className?: string }) {
  const m = useMessages(subProcessInfoMessages);
  const anchor = lessonAnchor(lessonKey);
  return (
    <button type="button" onClick={() => uiStore.getState().openKnowledge(anchor)} aria-label={m('lesson')} title={m('lesson')} data-testid="subprocess-lesson" data-anchor={anchor} className={`grid shrink-0 place-items-center transition hover:brightness-125 ${className}`}>
      <span aria-hidden="true">📖</span>
    </button>
  );
}
