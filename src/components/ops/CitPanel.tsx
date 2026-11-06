import { useMemo, useState } from 'react';
import { formatClock } from '../../sim/clock';
import { formatMoney } from '../../sim/kpis';
import {
  advance,
  citAccount,
  citAt,
  CIT_DEMOS,
  citOrder,
  CIT_STATUSES,
  CIT_STRATEGIES,
  countCash,
  isHolidayEve,
  logIncident,
  sbvCasePlan,
  sbvMode,
  sbvReasonOf,
  startRun,
  verifySeal,
  type CitDemo,
  type CitDirection,
  type CitManual,
  type CitLine,
  type CitRun,
  type CitScenario,
  type CitSnapshot,
  type SbvMode,
  type SbvReason,
} from '../../sim/citEngine';
import { useBankStore } from '../../store/bankStore';
import { citStore, useCitStore } from '../../store/citStore';
import { citDemoBlock, dispatchCitDemo, type CitDemoBlock } from './citActions';
import { pick, useLocale, useMessages } from '../../utils/i18nHelper';
import { SectionTitle } from '../bank/ui';
import { ScenarioPicker } from '../bank/ScenarioPicker';
import { RunOrCancel } from '../bank/DemoSession';
import { LessonLink } from './LessonLink';
import { CIT_INFO_KEYS } from '../../data/subProcessKeys';
import { citMessages } from './cit.messages';

/** The live CIT snapshot at the bank's clock: derived, never stored, so a paused or replayed day shows exactly what it posted. */
export function useCit(): CitSnapshot {
  const day = useBankStore((s) => s.view.day);
  const minute = useBankStore((s) => s.view.minute);
  const manual = useCitStore((s) => (s.day === day ? s.manual : NONE));
  return useMemo(() => citAt(day, minute, manual), [day, minute, manual]);
}

const NONE: readonly CitManual[] = [];

export const DEMO_ICON: Readonly<Record<CitDemo, string>> = { ATM: '🏧', DOORSTEP: '🏬', SBV: '🏦', TELLER: '🗄️' };

/** Where the locked run is, for the busy badge: its state, RETURNING (settled, van driving home) or LEAVING (the 3D van still pulling off the bay). */
export type CitLockStage = NonNullable<CitSnapshot['lock']>['stage'] | 'LEAVING';

/** The one dispatch lock as every CIT control reads it (Observer of the bank, CIT and 3D-van stores). */
export function useCitLock(): { block: CitDemoBlock; stage: CitLockStage | null; van: boolean } {
  const cit = useCit();
  const leaving = useCitStore((s) => s.van);
  const block = citDemoBlock(cit, leaving);
  // A till rebalance is walked across the floor: no van is ever in transit for it.
  const van = cit.lock ? CIT_STRATEGIES[cit.lock.run.order.scenario].van : true;
  return { block, stage: block === 'busy' ? (cit.lock?.stage ?? 'LEAVING') : null, van };
}

/** 🟢 Nộp tiền về NHNN or 🔴 Rút tiền từ NHNN, and why: on an SBV run's card, its sheet and its dock button. */
export function SbvBadge({ mode, reason, forced = false }: { mode: SbvMode; reason: SbvReason; forced?: boolean }) {
  const m = useMessages(citMessages);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span data-testid="sbv-badge" data-mode={mode} data-reason={reason} title={m(`sbvWhy_${reason}`)} className={`inline-flex flex-wrap items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${mode === 'DEPOSIT' ? 'bg-emerald-500/15 text-emerald-100 ring-emerald-400/60' : 'bg-rose-500/15 text-rose-100 ring-rose-400/60'}`}>
        {m(`sbv_${mode}`)}
        <span className="font-semibold opacity-80">· {m(`sbvWhy_${reason}`)}</span>
      </span>
      {forced && <SbvForcedBadge />}
    </span>
  );
}

/** The run card's tag for a deposit forced from a vault at or under its floor (CitOrder.forced): a demo, not a live rule. */
export function SbvForcedBadge() {
  const m = useMessages(citMessages);
  return (
    <span data-testid="sbv-forced" title={m('sbvForcedHint')} className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10.5px] font-bold text-amber-100 ring-1 ring-amber-400/70">
      ⚠ {m('sbvForced')}
    </span>
  );
}

/** What the next SBV run would do against the live book, in the case picked on the sheet's toggle (citEngine.sbvCasePlan, as the dispatch). */
export function useSbvNext(): { mode: SbvMode; reason: SbvReason; forced: boolean } {
  const cit = useCit();
  const day = useBankStore((s) => s.view.day);
  const mode = useCitStore((s) => s.sbvCase);
  const t = sbvCasePlan(cit.book, isHolidayEve(day), mode);
  return { mode: sbvMode(t.direction), reason: t.reason, forced: t.forced === true };
}

/** The SBV sheet's case switch: 🟢 Case Nộp Tiền ↔ 🔴 Case Rút Tiền. The six sections and the next dispatch follow it. Open during a demo: it only changes what is read (a run already dispatched keeps its own case). */
export function SbvCaseToggle() {
  const m = useMessages(citMessages);
  const mode = useCitStore((s) => s.sbvCase);
  const on = mode === 'WITHDRAW';
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2" role="group" aria-label={m('sbvCase')} data-testid="sbv-toggle" data-mode={mode}>
      <span className={`text-[11.5px] font-bold ${on ? 'text-slate-500' : 'text-emerald-200'}`}>{m('sbvCase_DEPOSIT')}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={m('sbvCase')}
        onClick={() => citStore.getState().setSbvCase(on ? 'DEPOSIT' : 'WITHDRAW')}
        data-testid="sbv-toggle-switch"
        className={`relative h-5 w-10 shrink-0 rounded-full ring-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${on ? 'bg-rose-500/60 ring-rose-300/60' : 'bg-emerald-500/60 ring-emerald-300/60'}`}
      >
        <span aria-hidden="true" className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
      <span className={`text-[11.5px] font-bold ${on ? 'text-rose-200' : 'text-slate-500'}`}>{m('sbvCase_WITHDRAW')}</span>
    </div>
  );
}

/** "🚚 CIT van in transit… · <where it is>": shown wherever a CIT dispatch is locked; a till rebalance (no van) reads "🗄️ Till rebalance in progress…" alone. */
export function CitBusyBadge({ stage, paused = false, van = true }: { stage: CitLockStage | null; paused?: boolean; van?: boolean }) {
  const m = useMessages(citMessages);
  if (!van)
    return (
      <span role="status" title={m('tillBusy')} data-testid="cit-demo-busy" data-van="false" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-cyan-400/15 px-2 py-0.5 text-[11px] font-bold text-cyan-100 ring-1 ring-cyan-300/50 backdrop-blur-sm">
        🗄️ {m('tillBusy')}
      </span>
    );
  return (
    <span role="status" title={paused ? m('demoSolo') : m('demoBlock_busy')} data-testid="cit-demo-busy" data-stage={stage ?? undefined} className="inline-flex animate-pulse items-center gap-1 whitespace-nowrap rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-bold text-amber-200 ring-1 ring-amber-300/50 backdrop-blur-sm">
      🚚 {m('demoBusy')}
      {stage && <span className="font-semibold text-amber-100/80">· {m(`status_${stage}`)}</span>}
    </span>
  );
}

/**
 * The drawer's "▶ Run this scenario" for one CIT sub-process (a single demo case): the 📖 lesson on the far left and the action
 * centred on the same line. It dispatches its demo under the one CIT lock, and turns into "Hủy demo" while a demo runs.
 */
export function CitRunButton({ kind }: { kind: CitDemo }) {
  const m = useMessages(citMessages);
  const { block, stage, van } = useCitLock();
  const paused = useBankStore((s) => !s.playing);
  return (
    <div className="space-y-2 rounded-xl border border-cyan-300/30 bg-cyan-400/[0.07] p-2.5 backdrop-blur-sm" data-testid="cit-run-scenario" data-kind={kind} data-block={block ?? 'none'}>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2" data-testid="spi-single-case">
        <LessonLink lessonKey={CIT_INFO_KEYS[kind]} className="h-7 w-7 rounded-md bg-white/10 text-[13px] ring-1 ring-white/15" />
        <div className="flex justify-center">
          <RunOrCancel>
            <button
              type="button"
              onClick={() => dispatchCitDemo(kind)}
              disabled={block !== null}
              title={block ? m(`demoBlock_${block}`) : m(`demoHint_${kind}`)}
              data-testid={`cit-run-${kind}`}
              className="whitespace-nowrap rounded-lg bg-gradient-to-r from-cyan-300 to-sky-400 px-3.5 py-1.5 text-[12.5px] font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {m('runScenario')}
            </button>
          </RunOrCancel>
        </div>
        <span className="h-7 w-7" aria-hidden="true" />
      </div>
      {block === 'busy' && (
        <div className="flex justify-center">
          <CitBusyBadge stage={stage} paused={paused} van={van} />
        </div>
      )}
      {kind === 'SBV' && <SbvNextBadge />}
      <p className="text-[11px] leading-snug text-slate-400">{m(`demoHint_${kind}`)}</p>
    </div>
  );
}

function SbvNextBadge() {
  const m = useMessages(citMessages);
  const next = useSbvNext();
  return (
    <span className="flex w-full items-center gap-1.5 text-[10.5px] text-slate-400">
      {m('sbvNext')}: <SbvBadge {...next} />
    </span>
  );
}

/** The bottom dock's button while a CIT child sheet is picked: that child's own run, under the one dispatch lock. */
export function CitDockButton({ kind }: { kind: CitDemo }) {
  const m = useMessages(citMessages);
  const { block, stage, van } = useCitLock();
  const sbv = useSbvNext();
  const hint = kind === 'SBV' ? `${m(`demoHint_${kind}`)} · ${m(`sbv_${sbv.mode}`)} (${m(`sbvWhy_${sbv.reason}`)})` : m(`demoHint_${kind}`);
  return (
    <>
      <RunOrCancel>
        <button type="button" onClick={() => dispatchCitDemo(kind)} disabled={block !== null} title={block ? m(`demoBlock_${block}`) : hint} data-sbv={kind === 'SBV' ? sbv.mode : undefined} data-testid={`dock-cit-${kind}`} className="whitespace-nowrap rounded-lg bg-cyan-400 px-3 py-1.5 text-[12px] font-bold text-cyan-950 shadow transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">
          <span aria-hidden="true">{DEMO_ICON[kind]}</span> {m(`dock_${kind}`)}
        </button>
      </RunOrCancel>
      {block === 'busy' && <CitBusyBadge stage={stage} van={van} />}
    </>
  );
}

/**
 * The CIT demo scenario picker: the dock's dropdown pattern (ScenarioPicker) listing the four CIT sub-processes, and one Run
 * button for the picked one, under the one CIT lock. On the Flow 09 sheet, in the vault's and the bay's inspectors and in the dock.
 */
export function CitDemoPicker({ direction = 'up' }: { direction?: 'up' | 'down' }) {
  const m = useMessages(citMessages);
  const { block, stage, van } = useCitLock();
  const [picked, setPicked] = useState<CitDemo>('ATM');
  const items = CIT_DEMOS.map((kind) => ({ id: kind, icon: DEMO_ICON[kind], label: m(`demoOption_${kind}`), hint: m(`demoHint_${kind}`), dot: 'bg-cyan-400' }));
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label={m('demoGroup')} data-testid="cit-demo-picker" data-block={block ?? 'none'} data-picked={picked}>
      <ScenarioPicker items={items} picked={picked} onPick={(id) => setPicked(id as CitDemo)} label={m('pickScenario')} testId="cit-demo" direction={direction}>
        <RunOrCancel>
          <button type="button" onClick={() => dispatchCitDemo(picked)} disabled={block !== null} title={block ? m(`demoBlock_${block}`) : m(`demoHint_${picked}`)} data-testid="cit-demo-run" className="shrink-0 whitespace-nowrap rounded-lg bg-cyan-400 px-3 py-1.5 text-[12px] font-bold text-cyan-950 shadow transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">
            {m('runScenario')}
          </button>
        </RunOrCancel>
      </ScenarioPicker>
      {block === 'busy' && <CitBusyBadge stage={stage} van={van} />}
    </div>
  );
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
      {o.scenario === 'SBV' && <SbvBadge mode={sbvMode(o.direction)} reason={sbvReasonOf(o)} forced={o.forced} />}
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
export const CitInspector = () => <CitInspectorView cit={useCit()} demos />;

export function CitInspectorView({ cit, demos = false }: { cit: CitSnapshot; demos?: boolean }) {
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
      {demos && (
        <div className="mb-2">
          <CitDemoPicker direction="down" />
        </div>
      )}
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
