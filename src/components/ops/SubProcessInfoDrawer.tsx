import { useState, type ReactNode } from 'react';
import { regDocById } from '../../data/regulatoryRegistry';
import { ACTORS, glLine, subProcessInfo, type ActorId, type InfoKey, type SubProcessInfo } from '../../data/subProcessRegistry';
import { GUIDED_FLOWS } from '../../sim/guidedFlows';
import { isStation } from '../../sim/topology';
import { bankStore, useBankStore } from '../../store/bankStore';
import { uiStore } from '../../store/uiStore';
import { pick, useLocale, useMessages } from '../../utils/i18nHelper';
import { CitDemoButtons } from './CitPanel';
import { subProcessInfoMessages } from './subProcessInfo.messages';

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

/** The drawer for the live store: closes and navigates through the bank. */
export function SubProcessInfoDrawer({ infoKey }: { infoKey: InfoKey }) {
  const str = useBankStore((s) => s.view.stp.rate);
  return <SubProcessInfoView info={subProcessInfo(infoKey)} liveStr={str} />;
}

export function SubProcessInfoView({ info, liveStr }: { info: SubProcessInfo; liveStr: number }) {
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
                {GUIDED_FLOWS[info.flow].code} · {m('label')}
              </span>
            </div>
            <h2 className="mt-1 text-[16px] font-bold leading-tight text-slate-50" data-testid="inspector-title">
              <span aria-hidden="true">{info.icon}</span> {pick(info.title, locale)}
            </h2>
          </div>
          <button type="button" onClick={() => bankStore.getState().clearSelection()} aria-label={m('close')} title={m('close')} data-testid="spi-close" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white">
            ✕
          </button>
        </div>
      </header>
      <div className="bk-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-3" data-testid="inspector-body">
        <Section title={m('overview')} testId="overview">
          <p className="text-[12.5px] leading-relaxed text-slate-200">{pick(info.overview, locale)}</p>
          <button type="button" onClick={showOnMap} data-testid="spi-show" className="mt-2 rounded-lg bg-white/10 px-2.5 py-1 text-[11.5px] font-semibold text-slate-100 hover:bg-white/15">
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
            <div className="rounded-lg bg-white/5 px-2 py-1.5">
              <div className="text-[9.5px] uppercase tracking-wide text-slate-400">{m('sla')}</div>
              <div className="text-[12px] font-semibold text-slate-100">{pick(info.kpi.sla, locale)}</div>
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
        {info.key === 'cit-vault' && <CitDemoButtons />}
        {info.related.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1" data-testid="spi-related">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{m('related')}</span>
            {info.related.map((k) => {
              const r = subProcessInfo(k);
              return (
                <button key={k} type="button" onClick={() => go(k)} data-testid={`spi-go-${k}`} className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-200 ring-1 ring-white/15 hover:bg-white/10">
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
