import { useLocale } from '../../i18n/locale';
import { useMessages } from '../../utils/i18nHelper';
import { runResultMessages } from './runResult.messages';
import { demoActionById } from '../../sim/demoActions';
import { bankStore, useBankStore } from '../../store/bankStore';
import { useChildFocusId } from '../../store/childFocusStore';
import { useDemoSession } from '../../store/demoSessionStore';
import { showLitInfo } from './retailOpsActions';

/** The last payment demo while the bank still holds its trace (running or finished), else null. */
export function useLastResult(): { id: string; name: string } | null {
  useLocale();
  const last = useDemoSession((s) => s.last);
  const traceId = useBankStore((s) => s.presetTrace?.id ?? null);
  if (last?.kind !== 'payment' || traceId !== last.id) return null;
  return { id: last.id, name: last.name?.() ?? '' };
}

const SEG = 'flex-1 whitespace-nowrap rounded-md px-2 py-1 text-[11.5px] font-semibold transition';

/**
 * The drawer's two views of the lit scenario: "📋 Process info" (its SOP sheet) and "📊 Run result" (the last demo's live result),
 * one click apart while a run is going or after it ended. Picking another scenario shows that scenario's sheet; the last result
 * stays one click away, and the toggle says it belongs to the most recent run whenever that was a different scenario.
 */
export function RunResultToggle({ view, txId, className = '' }: { view: 'sop' | 'result'; txId?: string; className?: string }) {
  const m = useMessages(runResultMessages);
  const result = useLastResult();
  const focused = useChildFocusId();
  // The result panel of any other payment (one picked on the map) is not the demo's: it has no SOP view to go back to.
  if (!result || (view === 'result' && txId !== result.id)) return null;
  const other = focused !== null && demoActionById(focused).label() !== result.name;
  return (
    <div className={`space-y-1 ${className}`} data-testid="run-result-toggle" data-view={view}>
      <div className="flex gap-1 rounded-lg bg-slate-950/60 p-0.5 ring-1 ring-white/10" role="group" aria-label={m('group')}>
        <button type="button" aria-pressed={view === 'sop'} onClick={() => view !== 'sop' && showLitInfo()} data-testid="show-sop" className={`${SEG} ${view === 'sop' ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'}`}>
          📋 {m('sop')}
        </button>
        <button type="button" aria-pressed={view === 'result'} onClick={() => view !== 'result' && bankStore.getState().select({ kind: 'transaction', id: result.id })} data-testid="show-result" className={`${SEG} ${view === 'result' ? 'bg-sky-500/25 text-sky-50' : 'text-slate-300 hover:bg-white/10'}`}>
          📊 {m('result')}
        </button>
      </div>
      {other && (
        <p className="text-[10.5px] leading-snug text-amber-200/90" data-testid="run-result-note">
          {m('lastRun', { name: result.name })}
        </p>
      )}
    </div>
  );
}
