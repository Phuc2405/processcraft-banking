import { GUIDED_FLOWS, stepAt, stepStatus, stepStatusLabel, stepText, type StepStatus } from '../../sim/guidedFlows';
import { tr } from '../../i18n/locale';
import type { PlaceId } from '../../sim/topology';
import { bankStore, dataDepthOf, useBankStore } from '../../store/bankStore';
import type { FlowId } from '../../types/viewport';
import { useTerms } from './useTerms';

/**
 * The step preview of a guided flow: what this desk does in the flow, which step it is, and whether the learner's last
 * preset payment has passed it yet. The 2D map shows it as a popover on hover; the 3D office floats it over the desk.
 */

const BADGE: Record<StepStatus, string> = {
  upcoming: 'bg-slate-700/80 text-slate-200 ring-slate-500/50',
  'in-progress': 'bg-sky-400/15 text-sky-200 ring-sky-400/60 animate-pulse',
  completed: 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/50',
};

export function StepPreviewBody({ flow, place }: { flow: FlowId; place: PlaceId }) {
  // Only the parts of the trace this card shows, so the card redraws when the payment moves, not on every beat.
  const at = useBankStore((s) => (s.presetTrace ? `${s.presetTrace.id}:${s.presetTrace.at}:${s.presetTrace.done}` : ''));
  const depth = useBankStore(dataDepthOf);
  const terms = useTerms();
  const found = stepAt(flow, place);
  if (!found) return null;
  const status = stepStatus(flow, found.number - 1, at ? bankStore.getState().presetTrace : null);
  const accent = GUIDED_FLOWS[flow].accent;
  return (
    <span className="block text-left" data-testid="step-preview" data-status={status} data-step={found.number}>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-wider tabular-nums" style={{ color: accent }}>
          {tr({ en: 'Step', vi: 'Bước' })} {found.number}/{found.total}
        </span>
        <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ring-1 ${BADGE[status]}`} data-testid="step-preview-status">
          {stepStatusLabel(status)}
        </span>
      </span>
      <span className="mt-0.5 block text-[12px] font-semibold leading-snug text-slate-50" data-testid="step-preview-name">
        {terms.place(place)}
      </span>
      <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-300">{stepText(flow, found.step).summary[depth]}</span>
    </span>
  );
}
