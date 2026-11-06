import { useState, type ReactNode } from 'react';
import { regDocById } from '../../data/regulatoryRegistry';
import { ACTORS, glLine, subProcessInfo, type ActorId, type InfoKey, type SubProcessInfo } from '../../data/subProcessRegistry';
import { demoActionById } from '../../sim/demoActions';
import { childSheetsOf, sheetDemo } from '../../sim/sheetDemo';
import { ScenarioPicker } from '../bank/ScenarioPicker';
import type { FlowId } from '../../types/viewport';
import { runDemoAnytime } from '../bank/retailOpsActions';
import { GUIDED_FLOWS } from '../../sim/guidedFlows';
import { isStation } from '../../sim/topology';
import { bankStore, useBankStore } from '../../store/bankStore';
import { uiStore } from '../../store/uiStore';
import { pick, useLocale, useMessages } from '../../utils/i18nHelper';
import { CitRunButton, SbvCaseToggle, useCit } from './CitPanel';
import { RunOrCancel, useDemoLocked } from '../bank/DemoSession';
import { SBV_CASE_SHEETS } from '../../data/subProcessCitSheets';
import { useCitStore } from '../../store/citStore';
import { citMessages } from './cit.messages';
import { slaTelemetry, type SlaTelemetry } from '../../sim/sheetTelemetry';
import { subProcessInfoMessages } from './subProcessInfo.messages';
import { LessonLink } from './LessonLink';

/** The right-side sub-process fact sheet, hosted by the inspector drawer (selection kind 'subprocess'). Content: data/subProcessRegistry.ts. */

const MODE_TONE = { STP: 'bg-violet-500/20 text-violet-100 ring-violet-400/60', MANUAL: 'bg-amber-500/15 text-amber-100 ring-amber-400/60', HYBRID: 'bg-sky-500/15 text-sky-100 ring-sky-400/60' } as const;

function Section({ title, children, testId }: { title: string; children: ReactNode; testId: string }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-sm" data-testid={`spi-${testId}`}>
      <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">{title}</h3>
      {children}
    </section>
  );
}

const Bullets = ({ items, tone }: { items: readonly string[]; tone: string }) => (
  <ul className="space-y-1 text-[12.5px] leading-snug text-slate-200">
    {items.map((t, i) => (
      <li key={i} className="flex gap-2">
        <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
        <span>{t}</span>
      </li>
    ))}
  </ul>
);

/**
 * The sheet's "▶ Run this scenario", for a sheet with one demo case: the 📖 lesson on the far left and the action centred on the
 * same line. A CIT child dispatches its run (CitRunButton holds its lock); any other sheet runs its scenario at any hour
 * (runDemoAnytime). While a demo runs, the button is "Hủy demo".
 */
function RunScenario({ infoKey }: { infoKey: InfoKey }) {
  const m = useMessages(subProcessInfoMessages);
  const demo = sheetDemo(infoKey);
  const dayOver = useBankStore((s) => s.view.dayOver);
  if (!demo) return null;
  if (demo.kind === 'cit') return <CitRunButton kind={demo.demo} />;
  const action = demoActionById(demo.id);
  return (
    <div className="space-y-2 rounded-xl border border-violet-300/30 bg-violet-400/[0.07] p-2.5 backdrop-blur-sm" data-testid="spi-run-scenario" data-demo={demo.id}>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2" data-testid="spi-single-case">
        <LessonLink lessonKey={infoKey} className="h-7 w-7 rounded-md bg-white/10 text-[13px] ring-1 ring-white/15" />
        <div className="flex justify-center">
          <RunOrCancel>
            <button
              type="button"
              onClick={() => runDemoAnytime(demo.id)}
              title={action.hint()}
              data-testid="spi-run"
              className="whitespace-nowrap rounded-lg bg-gradient-to-r from-violet-300 to-sky-400 px-3.5 py-1.5 text-[12.5px] font-bold text-slate-950 shadow-lg shadow-violet-500/20 transition hover:brightness-110"
            >
              {m('runScenario')}
            </button>
          </RunOrCancel>
        </div>
        <span className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="text-[11px] leading-snug text-slate-400">
        {action.icon} {action.label()}
        {dayOver ? ` · ${m('runNextDay')}` : ''}
      </p>
    </div>
  );
}

/**
 * A parent flow sheet's sub-process selector (Flows 01-09): the dock's dropdown pattern listing the flow's child sheets. Picking one
 * opens its sheet, where the run button is; it only navigates, so it stays open while a demo runs.
 */
function ChildSheetPicker({ flow }: { flow: FlowId }) {
  const m = useMessages(subProcessInfoMessages);
  const locale = useLocale();
  const children = childSheetsOf(flow);
  if (children.length === 0) return null;
  const items = children.map((k) => {
    const c = subProcessInfo(k);
    return { id: k, icon: c.icon, label: pick(c.title, locale), hint: pick(c.overview, locale), dot: 'bg-sky-400' };
  });
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5" data-testid="spi-child-picker" data-flow={flow}>
      <ScenarioPicker items={items} picked="" onPick={(k) => bankStore.getState().select({ kind: 'subprocess', key: k as InfoKey })} label={m('pickChild')} testId="spi-child" direction="down" placeholder />
    </div>
  );
}

/** The drawer for the live store: closes and navigates through the bank. */
export function SubProcessInfoDrawer({ infoKey }: { infoKey: InfoKey }) {
  const str = useBankStore((s) => s.view.stp.rate);
  const stations = useBankStore((s) => s.view.stations);
  const cit = useCit();
  const sbvCase = useCitStore((s) => s.sbvCase);
  // The SBV sheet follows its toggle: all six sections are the picked case's own (deposit or withdrawal).
  const info = infoKey === '09-cit-sbv' ? SBV_CASE_SHEETS[sbvCase] : subProcessInfo(infoKey);
  return <SubProcessInfoView info={info} liveStr={str} liveSla={slaTelemetry(info, { stations }, cit)} />;
}

/** The SLA tile's live line: the desk's wait and queue, or where the CIT run in flight is. */
function SlaLive({ live }: { live: SlaTelemetry }) {
  const m = useMessages(subProcessInfoMessages);
  const cm = useMessages(citMessages);
  if (!live) return null;
  const text = live.kind === 'desk' ? m('slaWait', { min: String(live.waitMin), queue: String(live.queue) }) : live.status === 'IDLE' ? m('slaIdle') : m('slaCit', { status: cm(`status_${live.status}`) });
  return (
    <div className="text-[10.5px] text-violet-200" data-testid="spi-sla-live" data-kind={live.kind}>
      {m('slaLive')}: {text}
    </div>
  );
}

export function SubProcessInfoView({ info, liveStr, liveSla = null }: { info: SubProcessInfo; liveStr: number; liveSla?: SlaTelemetry }) {
  const m = useMessages(subProcessInfoMessages);
  const locale = useLocale();
  const [actor, setActor] = useState<ActorId | null>(null);
  const accent = GUIDED_FLOWS[info.flow].accent;
  const go = (key: InfoKey): void => bankStore.getState().select({ kind: 'subprocess', key });
  const showOnMap = (): void => {
    const bank = bankStore.getState();
    bank.focusAcademyStep({ flow: info.flow, place: info.place });
    if (isStation(info.place)) bank.select({ kind: 'station', id: info.place });
  };
  const duty = actor ? info.actors.find((a) => a.id === actor) : null;
  // Reading stays open during a demo; only "show on map" (it switches the lit flow) waits for the run to end.
  const locked = useDemoLocked();
  // A sheet with one demo case carries its 📖 on the run row, so the header shows it only for the others.
  const singleCase = sheetDemo(info.key) !== null;
  // A parent flow sheet (Flows 01-09): the process title and its sub-process selector, never a run button.
  const parent = info.key.startsWith('flow-');
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-slate-900/70 to-slate-950/80 backdrop-blur-xl" data-testid="subprocess-drawer" data-key={info.key} data-mode={info.mode}>
      <header className="shrink-0 border-b border-white/10 p-3.5" style={{ background: `linear-gradient(180deg, ${accent}26, transparent)` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-slate-950/70 px-1.5 py-0.5 font-mono text-[11px] font-bold ring-1 ring-white/15" style={{ color: accent }} data-testid="spi-code">
                {info.code}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${MODE_TONE[info.mode]}`} title={m(`modeHint_${info.mode}`)} data-testid="spi-mode">
                {m(`mode_${info.mode}`)}
              </span>
              <span className="text-[10.5px] font-semibold text-slate-400">
                {GUIDED_FLOWS[info.flow].code} · {m(parent ? 'labelParent' : 'label')}
              </span>
            </div>
            <div className="mt-1 flex items-start gap-1.5">
              <h2 className="min-w-0 text-[16px] font-bold leading-tight text-slate-50" data-testid="inspector-title">
                <span aria-hidden="true">{info.icon}</span> {pick(info.title, locale)}
              </h2>
              {!singleCase && <LessonLink lessonKey={info.key} className="h-6 w-6 rounded-md bg-white/10 text-[13px] ring-1 ring-white/15" />}
            </div>
          </div>
          <button type="button" onClick={() => bankStore.getState().clearSelection()} aria-label={m('close')} title={m('close')} data-testid="spi-close" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white">
            ✕
          </button>
        </div>
      </header>
      <div className="bk-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-3" data-testid="inspector-body">
        {parent ? <ChildSheetPicker flow={info.flow} /> : <RunScenario infoKey={info.key} />}
        {info.key === '09-cit-sbv' && <SbvCaseToggle />}
        <Section title={m('overview')} testId="overview">
          <p className="text-[12.5px] leading-relaxed text-slate-200">{pick(info.overview, locale)}</p>
          <button type="button" onClick={showOnMap} disabled={locked} title={locked ? m('showOnMapLocked') : undefined} data-testid="spi-show" className="mt-2 rounded-lg bg-white/10 px-2.5 py-1 text-[11.5px] font-semibold text-slate-100 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40">
            📍 {m('showOnMap')}
          </button>
        </Section>
        <Section title={m('actors')} testId="actors">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={m('actorsHint')}>
            {info.actors.map((a) => (
              <button key={a.id} type="button" aria-pressed={actor === a.id} onClick={() => setActor(actor === a.id ? null : a.id)} title={pick(a.duty, locale)} data-testid={`spi-actor-${a.id}`} className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 transition ${actor === a.id ? 'bg-white/20 text-white ring-white/40' : 'bg-white/5 text-slate-200 ring-white/15 hover:bg-white/10'}`}>
                {ACTORS[a.id].icon} {pick(ACTORS[a.id].name, locale)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-slate-300" data-testid="spi-duty">
            {duty ? pick(duty.duty, locale) : m('actorsHint')}
          </p>
        </Section>
        <Section title={m('steps')} testId="steps">
          <ol className="space-y-1 text-[12.5px] leading-snug text-slate-200">
            {info.steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10.5px] font-bold text-slate-950" style={{ background: accent }}>
                  {i + 1}
                </span>
                <span>{pick(s, locale)}</span>
              </li>
            ))}
          </ol>
        </Section>
        <Section title={m('impact')} testId="impact">
          <Bullets items={info.impact.map((x) => pick(x, locale))} tone="bg-emerald-400" />
        </Section>
        <Section title={m('risks')} testId="risks">
          <Bullets items={info.risks.map((x) => pick(x, locale))} tone="bg-rose-400" />
        </Section>
        <Section title={m('gl')} testId="gl">
          <ul className="space-y-0.5 font-mono text-[11.5px] tabular-nums" title={m('bookHint')}>
            {info.gl.map((ref, i) => {
              const g = glLine(ref, locale);
              const debit = ref.side === 'dr';
              return (
                <li key={i} className={`flex min-w-0 items-baseline gap-2 ${debit ? '' : 'pl-4'} ${g.code === '1131' ? 'rounded bg-amber-400/10 ring-1 ring-amber-300/50' : ''}`} data-code={g.code} data-side={ref.side} data-book={g.book}>
                  <span className={`shrink-0 font-bold ${debit ? 'text-sky-300' : 'text-amber-300'}`}>{debit ? m('dr') : m('cr')}</span>
                  <span className="shrink-0 text-slate-300">TK {g.code}</span>
                  <span className="min-w-0 flex-1 truncate font-sans text-slate-200">{g.name}</span>
                  <span className="shrink-0 rounded bg-white/5 px-1 font-sans text-[9.5px] uppercase text-slate-400">{m(`book_${g.book}`)}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {info.legal.map((id) => {
              const doc = regDocById(id)!;
              return (
                <button key={id} type="button" onClick={() => uiStore.getState().openKnowledge(`legal-${id}`)} title={`${pick(doc.title, locale)} · ${m('legalHint')}`} data-testid={`spi-legal-${id}`} className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-semibold text-indigo-100 ring-1 ring-indigo-400/40 hover:bg-indigo-500/25">
                  ⚖️ {pick(doc.number, locale)}
                </button>
              );
            })}
          </div>
        </Section>
        <Section title={m('kpi')} testId="kpi">
          <div className="grid grid-cols-2 gap-1.5 text-center">
            <div className="rounded-lg bg-white/5 px-2 py-1.5" data-testid="spi-sla">
              <div className="text-[9.5px] uppercase tracking-wide text-slate-400">{m('sla')}</div>
              <div className="text-[12px] font-semibold text-slate-100">{pick(info.kpi.sla, locale)}</div>
              <SlaLive live={liveSla} />
            </div>
            <div className="rounded-lg bg-white/5 px-2 py-1.5" data-testid="spi-str">
              <div className="text-[9.5px] uppercase tracking-wide text-slate-400">{m('strTarget')}</div>
              <div className="text-[12px] font-semibold text-slate-100">{info.kpi.strPct === null ? m('noStr') : `≥ ${info.kpi.strPct}%`}</div>
              {info.kpi.strPct !== null && info.mode !== 'MANUAL' && (
                <div className="text-[10.5px] text-violet-200">
                  {m('strLive')}: {Math.round(liveStr * 100)}%
                </div>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug text-slate-400">{pick(info.kpi.note, locale)}</p>
        </Section>
        {info.related.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1" data-testid="spi-related">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{m('related')}</span>
            {info.related.map((k) => {
              const r = subProcessInfo(k);
              return (
                <button key={k} type="button" onClick={() => go(k)} data-testid={`spi-go-${k}`} className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-200 ring-1 ring-white/15 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">
                  {r.icon} {r.code}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
