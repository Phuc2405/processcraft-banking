import { formatClock } from '../../sim/clock';
import { CIT_STRATEGIES, sbvMode, sbvReasonOf, verifySeal, type CitSnapshot } from '../../sim/citEngine';
import { bayLog, bayVehicle, citVanId } from '../../sim/citRoute';
import { formatMoney } from '../../sim/kpis';
import { bankStore } from '../../store/bankStore';
import { useCitStore } from '../../store/citStore';
import { pick, useLocale, useMessages } from '../../utils/i18nHelper';
import { SectionTitle } from '../bank/ui';
import { useTerms } from '../bank/useTerms';
import { PlaceKnowledge } from '../education/PlaceKnowledge';
import { citMessages } from './cit.messages';
import { CitDemoPicker, SbvBadge, useCit } from './CitPanel';

/**
 * The Loading Bay inspector (selection kind 'bay'), opened by clicking the bay on either map: the vehicle now, the van on the run,
 * its 4-eye seal and custodians, and today's CIT run log. Everything is derived from the CIT snapshot, like the bay itself.
 */
export const LoadingBayPanel = () => <LoadingBayView cit={useCit()} van3d={useCitStore((s) => s.van)} />;

export function LoadingBayView({ cit, van3d }: { cit: CitSnapshot; van3d: boolean }) {
  const m = useMessages(citMessages);
  const locale = useLocale();
  const { state, run } = bayVehicle(cit);
  const shown = run ?? cit.active?.run ?? null;
  const seal = shown ? verifySeal(shown.order) : null;
  const log = bayLog(cit);
  const expert = !useTerms().beginner;
  return (
    <>
      <header className="shrink-0 border-b border-slate-800 p-3.5" style={{ background: 'linear-gradient(180deg, #facc151f, transparent)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-yellow-300">{m('baySub')}</div>
            <h2 className="mt-0.5 text-[16px] font-bold leading-tight text-slate-50" data-testid="inspector-title">
              🚚 {m('bay')}
            </h2>
          </div>
          <button type="button" onClick={() => bankStore.getState().clearSelection()} aria-label="✕" data-testid="inspector-close" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-800 hover:text-slate-100">
            ✕
          </button>
        </div>
      </header>
      <div className="bk-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3.5" data-testid="loading-bay-panel" data-vehicle={state}>
        <section className="grid grid-cols-2 gap-1.5 text-[12px]">
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-1.5">
            <div className="text-[9.5px] uppercase tracking-wide text-slate-500">{m('bayVehicle')}</div>
            <div className="font-semibold text-slate-100" data-testid="bay-vehicle">
              {m(`bayState_${state}`)}
              {state === 'IDLE' && van3d ? ` · ${m('status_LEAVING')}` : ''}
            </div>
            {run && <div className="text-[11px] text-sky-200">{m(`status_${run.status}`)}</div>}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-1.5">
            <div className="text-[9.5px] uppercase tracking-wide text-slate-500">{m('bayVan')}</div>
            <div className="font-mono font-semibold text-slate-100" data-testid="bay-van-id">
              {(shown && citVanId(shown.order)) ?? m('bayNoVan')}
            </div>
            {shown && <div className="font-mono text-[11px] text-slate-400">{shown.order.id}</div>}
          </div>
        </section>
        {shown && seal && (
          <section className={`rounded-lg border px-2.5 py-2 text-[12px] ${seal.ok ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-rose-400/60 bg-rose-500/15'}`} data-testid="bay-seal" data-ok={seal.ok}>
            <div className="font-bold text-slate-50">
              🔐 {m('baySeal')}: <span className="font-mono">{shown.order.sealId}</span> {seal.ok ? '✓' : '⚠'}
            </div>
            <div className="text-slate-300" data-testid="bay-custodians">
              {m('bayCustodians')}: {shown.order.custodians.join(' · ')}
            </div>
            {shown.order.scenario === 'SBV' && (
              <div className="mt-1">
                <SbvBadge mode={sbvMode(shown.order.direction)} reason={sbvReasonOf(shown.order)} forced={shown.order.forced} />
              </div>
            )}
          </section>
        )}
        <CitDemoPicker direction="down" />
        <PlaceKnowledge place="BAY" text={m('bay')} expert={expert} />
        <section>
          <SectionTitle>{m('bayLog')}</SectionTitle>
          {log.length === 0 ? (
            <p className="text-[12px] text-slate-500">{m('bayNoLog')}</p>
          ) : (
            <ul className="space-y-1 text-[11.5px]" data-testid="bay-log">
              {log.map(({ planned, run: r }) => {
                const o = planned.order;
                return (
                  <li key={o.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-900/50 px-2 py-1 text-slate-300" data-run={o.id} data-status={r.status}>
                    <span className="min-w-0 truncate">
                      {formatClock(planned.start)} {CIT_STRATEGIES[o.scenario].icon} {pick(CIT_STRATEGIES[o.scenario].label, locale)}
                      <span className="ml-1 font-mono text-[10.5px] text-slate-500">{citVanId(o) ?? m('onFoot')}</span>
                      {o.forced && (
                        <span className="ml-1 text-[10px] font-bold text-amber-200" data-testid="bay-log-forced" title={m('sbvForcedHint')}>
                          ⚠ {m('sbvForced')}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="font-mono tabular-nums text-slate-100">{formatMoney(o.amountCents + o.unfitSurrenderCents)}</span>
                      <span className={`ml-1.5 text-[10.5px] font-semibold ${r.status === 'SETTLED' ? 'text-emerald-300' : 'text-sky-300'}`}>{m(`status_${r.status}`)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
