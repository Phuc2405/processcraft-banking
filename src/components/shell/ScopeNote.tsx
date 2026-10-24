import { useMessages } from '../../utils/i18nHelper';
import { scopeNoteMessages } from './scopeNote.messages';

/** "ℹ️ Simulates ~80% of core real-world banking workflows…": a quiet footnote on how far the model goes. */
export function ScopeNote({ className = '', testId = 'scope-note' }: { className?: string; testId?: string }) {
  const m = useMessages(scopeNoteMessages);
  return (
    <p role="note" aria-label={m('label')} data-testid={testId} className={`flex items-start gap-1.5 text-[11px] leading-snug text-slate-500 ${className}`}>
      <span aria-hidden="true" className="shrink-0">
        ℹ️
      </span>
      <span>{m('text')}</span>
    </p>
  );
}
