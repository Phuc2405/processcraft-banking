import { useMemo, useState } from 'react';
import { formatClock } from '../../sim/clock';
import { formatMoney } from '../../sim/kpis';
import {
  advance,
  citAccount,
  citAt,
  citOrder,
  CIT_STATUSES,
  CIT_STRATEGIES,
  countCash,
  logIncident,
  startRun,
  verifySeal,
  type CitDirection,
  type CitLine,
  type CitRun,
  type CitScenario,
  type CitSnapshot,
} from '../../sim/citEngine';
import { useBankStore } from '../../store/bankStore';
import { pick, useLocale, useMessages } from '../../utils/i18nHelper';
import { SectionTitle } from '../bank/ui';
import { citMessages } from './cit.messages';

/** The live CIT snapshot at the bank's clock: derived, never stored, so a paused or replayed day shows exactly what it posted. */
export function useCit(): CitSnapshot {
  const day = useBankStore((s) => s.view.day);
  const minute = useBankStore((s) => s.view.minute);
  return useMemo(() => citAt(day, minute), [day, minute]);
}

/** A CIT journal: Dr lines first, Cr indented, the 1131 counter-entries ringed. */
export function CitLines({ lines, testId }: { lines: readonly CitLine[]; testId?: string }) {
  const m = useMessages(citMessages);
  const locale = useLocale();
  return (
    <ul className="space-y-0.5 font-mono text-[11.5px] tabular-nums" data-testid={testId}>
      {lines.map((l, i) => {
        const a = citAccount(l.account);
        const debit = l.dr > 0;
        const transit = l.account === 'TRANSIT';
        return (
          <li key={i} className={`flex min-w-0 items-baseline gap-2 rounded px-1 ${debit ? '' : 'pl-4'} ${transit ? 'bg-amber-400/10 ring-1 ring-amber-300/60' : ''}`} data-account={l.account} data-side={debit ? 'dr' : 'cr'} data-code={a.code}>
            <span className={`shrink-0 font-bold ${debit ? 'text-sky-300' : 'text-amber-300'}`}>{debit ? m('dr') : m('cr')}</span>
            <span className={`shrink-0 ${transit ? 'font-bold text-amber-200' : 'text-slate-400'}`}>{a.code}</span>
            <span className="min-w-0 flex-1 truncate font-sans text-slate-200">{pick(a.name, locale)}</span>
            <span className="shrink-0 text-slate-100">{formatMoney(debit ? l.dr : l.cr)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Stepper({ run }: { run: CitRun }) {
  const m = useMessages(citMessages);
  const at = CIT_STATUSES.indexOf(run.status);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[10.5px] font-semibold" data-testid="cit-stepper" data-status={run.status}>
      {CIT_STATUSES.map((s, i) => (
        <li key={s} className={`rounded-full px-1.5 py-0.5 ${i < at ? 'bg-emerald-500/20 text-emerald-200' : i === at ? (run.blocked ? 'bg-rose-500/25 text-rose-100 ring-1 ring-rose-400' : 'bg-sky-500/25 text-sky-100 ring-1 ring-sky-400') : 'bg-slate-800 text-slate-500'}`} aria-current={i === at ? 'step' : undefined}>
          {m(`status_${s}`)}
        </li>
      ))}
    </ol>
  );
}

function SealBadge({ run }: { run: CitRun }) {
  const m = useMessages(citMessages);
  const s = verifySeal(run.order);
  const [a, b] = run.order.custodians;
  const tone = s.ok ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-100' : run.incident ? 'border-amber-400/50 bg-amber-500/10 text-amber-100' : 'border-rose-400/60 bg-rose-500/15 text-rose-100';
  return (
    <div className={`rounded-lg border px-2 py-1 text-[11.5px] leading-snug ${tone}`} data-testid="cit-seal" data-ok={s.ok}>
      <div className="font-bold">🔐 {s.ok ? m('sealOk', { seal: run.order.sealId }) : m('sealBad', { seal: run.order.presentedSealId })}</div>
      <div className="opacity-80">{run.incident ? m('sealIncident') : m('sealBy', { a, b })}</div>
    </div>
  );
}

/** One run: what, why, where it is in its lifecycle, the seal and its journal so far. */
function RunCard({ run, start }: { run: CitRun; start?: number }) {
  const m = useMessages(citMessages);
  const locale = useLocale();
  const o = run.order;
  const strat = CIT_STRATEGIES[o.scenario];
  const c = countCash(o);
  const counted = CIT_STATUSES.indexOf(run.status) >= CIT_STATUSES.indexOf('DELIVERED');
  return (
    <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-2.5" data-testid="cit-run" data-scenario={o.scenario} data-direction={o.direction}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-[12.5px] font-bold text-slate-100">
          {strat.icon} {pick(strat.label, locale)}
          {o.client ? ` · ${o.client}` : ''}
        </div>
        <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-slate-200">
          {start !== undefined ? `${formatClock(start)} · ` : ''}
          {formatMoney(o.amountCents + o.unfitSurrenderCents)}
        </span>
      </div>
      <div className="text-[11px] text-slate-400">
        {m('trigger')}: {pick(o.trigger, locale)}
      </div>
      <Stepper run={run} />
      {run.blocked && (
        <div className="text-[11px] font-semibold text-rose-200" data-testid="cit-block">
          ⚠ {m(`block_${run.blocked}`)}
        </div>
      )}
      <SealBadge run={run} />
      {counted && (c.unfitCents > 0 || c.shortCents > 0) && <div className="text-[11px] text-slate-300">{m('count', { fit: formatMoney(c.fitCents), unfit: formatMoney(c.unfitCents), short: formatMoney(c.shortCents) })}</div>}
      <div>
        <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{m('journal')}</div>
        {run.entries.length ? (
          <div className="space-y-1.5">
            {run.entries.map((e, i) => (
              <div key={i}>
                <div className="text-[10.5px] text-slate-500">
                  {m(`status_${e.status}`)} · {pick(e.memo, locale)}
                </div>
                <CitLines lines={e.lines} testId={`cit-journal-${e.status}`} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-slate-500">{m('noJournal')}</div>
        )}
      </div>
    </div>
  );
}

/** The inspector's CIT section for the vault: balances, the active run and the day's runs. */
export const CitInspector = () => <CitInspectorView cit={useCit()} />;

export function CitInspectorView({ cit }: { cit: CitSnapshot }) {
  const m = useMessages(citMessages);
  const locale = useLocale();
  const started = cit.runs.filter((r) => r.run);
  return (
    <section data-testid="cit-inspector" data-flow={cit.vaultFlow ?? 'none'}>
      <SectionTitle>{m('title')}</SectionTitle>
      <div className="mb-2 grid grid-cols-3 gap-1.5 text-center">
        {(
          [
            ['vault', cit.book.VAULT],
            ['transit', cit.book.TRANSIT],
            ['unfit', cit.book.UNFIT],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className={`rounded-lg border px-1.5 py-1 ${k === 'transit' && v > 0 ? 'border-amber-400/60 bg-amber-500/10' : 'border-slate-800 bg-slate-900/50'}`} data-testid={`cit-bal-${k}`}>
            <div className="text-[9.5px] uppercase tracking-wide text-slate-500">{m(k)}</div>
            <div className="font-mono text-[11.5px] tabular-nums text-slate-100">{formatMoney(v)}</div>
          </div>
        ))}
      </div>
      {cit.active ? <RunCard run={cit.active.run} start={cit.active.planned.start} /> : <p className="text-[12px] text-slate-500">{m('noRuns')}</p>}
      {started.length > 1 && (
        <ul className="mt-2 space-y-0.5 text-[11.5px]" data-testid="cit-runs">
          <li className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{m('today')}</li>
          {started.map(({ planned, run }) => (
            <li key={planned.order.id} className="flex items-center justify-between gap-2 text-slate-300">
              <span className="min-w-0 truncate">
                {formatClock(planned.start)} {CIT_STRATEGIES[planned.order.scenario].icon} {pick(CIT_STRATEGIES[planned.order.scenario].label, locale)}
              </span>
              <span className={`shrink-0 text-[10.5px] font-semibold ${run!.status === 'SETTLED' ? 'text-emerald-300' : 'text-sky-300'}`}>{m(`status_${run!.status}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const DRILLS: ReadonlyArray<{ scenario: CitScenario; direction: CitDirection; amountCents: number; client?: string; unfitBp?: number; unfitSurrenderCents?: number }> = [
  { scenario: 'ATM_CDM', direction: 'OUT', amountCents: 5_000_000 },
  { scenario: 'BRANCH_BALANCING', direction: 'OUT', amountCents: 200_000_000 },
  { scenario: 'DOORSTEP', direction: 'IN', amountCents: 30_000_000, client: 'WinMart', unfitBp: 150 },
  { scenario: 'SBV', direction: 'OUT', amountCents: 80_000_000, unfitSurrenderCents: 1_500_000 },
  { scenario: 'SBV', direction: 'IN', amountCents: 150_000_000 },
];

/** The Knowledge Base drill: one run stepped through the state machine by hand. */
export function CitDrill() {
  const m = useMessages(citMessages);
  const locale = useLocale();
  const [pickIx, setPick] = useState(0);
  const [tampered, setTampered] = useState(false);
  const fresh = (ix: number, t: boolean): CitRun => {
    const d = DRILLS[ix]!;
    return startRun(citOrder({ ...d, sealId: 'SEAL-0425117', ...(t ? { presentedSealId: 'SEAL-0425117-X' } : {}), custodians: ['Nguyễn Văn An', 'Trần Thị Bình'] }));
  };
  const [run, setRun] = useState(() => fresh(0, false));
  const restart = (ix: number, t: boolean): void => {
    setPick(ix);
    setTampered(t);
    setRun(fresh(ix, t));
  };
  return (
    <section className="mt-6 rounded-xl border border-sky-400/30 bg-sky-950/20 p-3" data-testid="cit-drill">
      <h3 className="text-[17px] font-bold text-slate-50">{m('drillTitle')}</h3>
      <p className="mt-1 text-[14px] text-slate-300">{m('drillIntro')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={pickIx} onChange={(e) => restart(Number(e.target.value), tampered)} data-testid="cit-drill-scenario" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[13px] text-slate-100">
          {DRILLS.map((d, i) => (
            <option key={i} value={i}>
              {CIT_STRATEGIES[d.scenario].icon} {pick(CIT_STRATEGIES[d.scenario].label, locale)} ({d.direction})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-[13px] text-slate-300">
          <input type="checkbox" checked={tampered} onChange={(e) => restart(pickIx, e.target.checked)} data-testid="cit-drill-tamper" />
          {m('drillTamper')}
        </label>
      </div>
      <div className="mt-3">
        <RunCard run={run} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {run.status !== 'SETTLED' && (
          <button type="button" onClick={() => setRun(advance(run))} data-testid="cit-drill-next" className="rounded-lg bg-sky-500 px-3 py-1.5 text-[13px] font-bold text-slate-950 hover:bg-sky-400">
            {m('drillNext')}
          </button>
        )}
        {run.blocked === 'SEAL_MISMATCH' && (
          <button type="button" onClick={() => setRun(advance(logIncident(run)))} data-testid="cit-drill-incident" className="rounded-lg bg-amber-400 px-3 py-1.5 text-[13px] font-bold text-slate-950 hover:bg-amber-300">
            {m('drillIncident')}
          </button>
        )}
        <button type="button" onClick={() => restart(pickIx, tampered)} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800">
          {m('drillReset')}
        </button>
      </div>
      {run.status === 'SETTLED' && <p className="mt-2 text-[13px] font-semibold text-emerald-300">{m('drillDone')}</p>}
    </section>
  );
}
