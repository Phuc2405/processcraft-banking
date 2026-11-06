import type { CSSProperties } from 'react';
import { routingRules } from '../../engine/plan/routingRules';
import { feedText } from '../../i18n/feedVi';
import { useLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { cashStationTip, type CashStationId, type CashStationTipModel } from '../../sim/cashStationTip';
import type { CitAccountId } from '../../sim/citEngine';
import { DESK_HEAT, deskHeat } from '../../sim/deskHeat';
import { GUIDED_FLOWS, stepStatus, stepStatusLabel, stepText, type StepStatus } from '../../sim/guidedFlows';
import { cardKind, cardStep, type CardPlace } from '../../sim/hoverCard';
import { formatMoney } from '../../sim/kpis';
import type { ExternalId, StationId } from '../../sim/topology';
import { activeFlowOf, activeScopeOf, bankStore, dataDepthOf, useBankStore } from '../../store/bankStore';
import type { FlowId } from '../../types/viewport';
import { useMessages } from '../../utils/i18nHelper';
import { citMessages } from '../ops/cit.messages';
import { useCit } from '../ops/CitPanel';
import { analystWorkspaceMessages } from './analystWorkspace.messages';
import { acronymsIn } from './codeGlossary';
import { stationTooltipMessages } from './stationTooltip.messages';
import { subProcessTitle } from './subProcessTitle';
import { useDeskStatusLine } from './useSimulation';
import { useTerms } from './useTerms';

/**
 * THE hover card, for every place on both maps (sim/hoverCard.ts): the 2D cards wrap it in their CSS hover tip, the 3D office in its one
 * Html overlay (office/StationTooltip3D). One card per place under the pointer, never two: while a flow is lit and the place plays a step in
 * it, a context banner (📌 the sub-process, 👉 the step) sits on top of a divider; under it, always, the place's own metrics.
 */
export function StationTooltip({ place, className = '', style }: { place: CardPlace; className?: string; style?: CSSProperties }) {
  const flow = useBankStore(activeFlowOf);
  const inScope = useBankStore((s) => place === 'LOADING_BAY' || (activeScopeOf(s)?.places.has(place) ?? false));
  const ctx = cardStep(flow, place, inScope);
  const kind = cardKind(place);
  return (
    <span
      role="tooltip"
      className={`block w-[264px] rounded-lg border bg-slate-900 px-2.5 py-2 text-left shadow-[0_10px_30px_rgba(0,0,0,0.7)] ${className}`}
      style={{ borderColor: flow && ctx ? `${GUIDED_FLOWS[flow].accent}aa` : kind === 'cash' ? 'rgb(250 204 21 / 0.6)' : 'rgb(100 116 139)', ...style }}
      data-testid="station-card"
      data-place={place}
      data-kind={kind}
      data-context={ctx ? 'step' : 'idle'}
    >
      {flow && ctx && <StepBanner flow={flow} index={ctx.index} number={ctx.number} total={ctx.total} />}
      {kind === 'cash' ? <CashMetrics id={place as CashStationId} /> : kind === 'desk' ? <DeskMetrics id={place as StationId} /> : <ExternalMetrics id={place as ExternalId} />}
    </span>
  );
}

const BADGE: Record<StepStatus, string> = {
  upcoming: 'bg-slate-700/80 text-slate-200 ring-slate-500/50',
  'in-progress': 'bg-sky-400/15 text-sky-200 ring-sky-400/60 animate-pulse',
  completed: 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/50',
};

/** The top of the card while a flow is lit: the sub-process the menu names, and this place's step in it (and whether the learner's payment has passed it). */
function StepBanner({ flow, index, number, total }: { flow: FlowId; index: number; number: number; total: number }) {
  const m = useMessages(stationTooltipMessages);
  const locale = useLocale();
  const subProcess = useBankStore((s) => s.subProcess);
  const depth = useBankStore(dataDepthOf);
  // Only the parts of the trace this banner shows, so it redraws when the payment moves, not on every beat.
  const at = useBankStore((s) => (s.presetTrace ? `${s.presetTrace.id}:${s.presetTrace.at}:${s.presetTrace.done}` : ''));
  const status = stepStatus(flow, index, at ? bankStore.getState().presetTrace : null);
  const step = GUIDED_FLOWS[flow].steps[index]!;
  return (
    <span className="mb-1.5 block border-b border-slate-700/50 pb-1.5" data-card="context" data-step={number} data-status={status}>
      <span className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold leading-snug" style={{ color: GUIDED_FLOWS[flow].accent }} data-tip="process">
          {m('process')}: {subProcessTitle({ flow, subProcess }, locale)}
        </span>
        <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold ring-1 ${BADGE[status]}`} data-testid="station-card-status">
          {stepStatusLabel(status)}
        </span>
      </span>
      <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-100" data-tip="step">
        <span className="font-semibold tabular-nums">
          {m('step')} {number}/{total}:
        </span>{' '}
        {stepText(flow, step).summary[depth]}
      </span>
    </span>
  );
}

/** A desk's metrics: its name and acronyms, what it does, the rules it routes by, its queue and status, and any congestion or alert. */
function DeskMetrics({ id }: { id: StationId }) {
  const terms = useTerms();
  const locale = useLocale();
  const m = useMessages(stationTooltipMessages);
  const wm = useMessages(analystWorkspaceMessages);
  const { status, line } = useDeskStatusLine(id);
  const sv = useBankStore((s) => s.view.stations[id]);
  const rules = routingRules(id);
  const heat = deskHeat(id, sv);
  const alert = sv.alerts[0] ?? null;
  const caption = terms.caption(id);
  return (
    <span className="block" data-card="metrics">
      <span className="block text-[12.5px] font-semibold leading-snug text-slate-50" data-tip="title">
        {terms.stationTitle(id)}
      </span>
      {caption && <span className="block text-[10.5px] leading-snug text-sky-300/90">{caption}</span>}
      {acronymsIn(terms.stationTitle(id), locale).map((a) => (
        <span key={a.key} className="block text-[11px] font-medium leading-snug text-sky-200" data-testid="station-card-acronym">
          {a.label}: {a.full}
        </span>
      ))}
      <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-300" data-tip="definition">
        {terms.tip(id)}
      </span>
      {(rules.pass.length > 0 || rules.decline.length > 0) && (
        <span className="mt-1 block space-y-0.5 text-[11px] leading-snug">
          {rules.pass.length > 0 && (
            <span className="block">
              <span className="font-semibold text-emerald-300">{m('passes')}: </span>
              <span className="text-slate-200">{rules.pass.map((l) => t(l)).join(' · ')}</span>
            </span>
          )}
          {rules.decline.length > 0 && (
            <span className="block">
              <span className="font-semibold text-rose-300">{m('declines')}: </span>
              <span className="text-slate-200">{rules.decline.map((l) => t(l)).join(' · ')}</span>
            </span>
          )}
        </span>
      )}
      <span className="mt-1 inline-block rounded bg-slate-800 px-1.5 py-px text-[10.5px] font-semibold text-slate-200" data-tip="status" data-desk-status={status.status}>
        {line}
      </span>
      {heat && <span className="mt-0.5 block text-[10.5px] leading-snug text-amber-200">{wm(`heat_${heat}`, { warn: DESK_HEAT.warnAt, crit: DESK_HEAT.critAbove })}</span>}
      {alert && <span className="mt-0.5 block text-[10.5px] leading-snug text-rose-200">⚠ {feedText(alert.text)}</span>}
    </span>
  );
}

/** A channel or an outcome (OTP, approved, declined, settled): what it is and its tally so far. */
function ExternalMetrics({ id }: { id: ExternalId }) {
  const terms = useTerms();
  const m = useMessages(stationTooltipMessages);
  const count = useBankStore((s) => s.view.externals[id]);
  return (
    <span className="block" data-card="metrics">
      <span className="block text-[12.5px] font-semibold leading-snug text-slate-50" data-tip="title">
        {terms.place(id)}
      </span>
      <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-300" data-tip="definition">
        {terms.externalTip(id)}
      </span>
      <span className="mt-1 inline-block rounded bg-slate-800 px-1.5 py-px text-[10.5px] font-semibold tabular-nums text-slate-200" data-tip="status">
        {m('total')}: {count.count.toLocaleString()} · {formatMoney(count.cents, true)}
      </span>
    </span>
  );
}

/** The GL line's label (cit.messages): Vault 1111, Unfit 1112, In transit 1131. */
const ACCOUNT_KEY: Partial<Record<CitAccountId, 'vault' | 'unfit' | 'transit'>> = { VAULT: 'vault', UNFIT: 'unfit', TRANSIT: 'transit' };

/** The vault's or the bay's metrics: what it is, its cash state now (and the run, if any), and its balances today. */
function CashMetrics({ id }: { id: CashStationId }) {
  const terms = useTerms();
  const m = useMessages(citMessages);
  const model = cashStationTip(id, useCit());
  const title = id === 'MAIN_CASH_VAULT' ? terms.stationTitle('MAIN_CASH_VAULT') : m('bay');
  const description = id === 'MAIN_CASH_VAULT' ? terms.tip('MAIN_CASH_VAULT') : m('bayHint');
  return <CashMetricsView model={model} title={title} description={description} label={(k) => m(k)} />;
}

type CashLabel = (key: CashStationTipModel['status'] | 'vault' | 'unfit' | 'transit' | 'tipBalances' | 'tipRun') => string;

/** The cash metrics from their model and words (no store reads). */
export function CashMetricsView({ model, title, description, label }: { model: CashStationTipModel; title: string; description: string; label: CashLabel }) {
  return (
    <span className="block" data-card="metrics" data-status={model.status}>
      <span className="block text-[12.5px] font-semibold leading-snug text-slate-50" data-tip="title">
        {model.icon} {title}
      </span>
      <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-300" data-tip="definition">
        {description}
      </span>
      <span className="mt-1 inline-block rounded bg-slate-800 px-1.5 py-px text-[10.5px] font-semibold text-yellow-200" data-tip="status">
        {label(model.status)}
        {model.run && ` · ${label('tipRun')} ${model.run.id} · 🔐 ${model.run.seal}`}
      </span>
      <span className="mt-1.5 block text-[9.5px] font-semibold uppercase tracking-wide text-slate-500">{label('tipBalances')}</span>
      <span className="block space-y-px" data-tip="balances">
        {model.balances.map((b) => (
          <span key={b.account} className="flex justify-between gap-2 font-mono text-[11px] tabular-nums" data-account={b.account}>
            <span className="text-slate-400">{label(ACCOUNT_KEY[b.account] ?? 'vault')}</span>
            <span className="font-bold text-amber-200">{formatMoney(b.cents)}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
