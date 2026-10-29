import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatDelta, formatKpi, formatMoney, type KpiComparisonRow } from '../../sim/kpis';
import { factLabel, factValue } from '../../i18n/factsVi';
import { tr } from '../../i18n/locale';
import { kpiHelp, kpiLabel, noticeText, ruleHelp, ruleLabel } from '../../i18n/simVi';
import { t } from '../../i18n/t';
import { LESSON_LIST, type Lesson, type LessonExample, type ProcessId } from '../../sim/learning';
import { lessonOf, processShort } from '../../sim/learningVi';
import { eventText } from '../../sim/traffic';
import { formatRule, RULE_KEYS, RULE_META, rulesEqual, type BankRules } from '../../sim/rules';
import { buildWalkthrough, type StepTone, type WalkFact } from '../../sim/walkthrough';
import { useBankStore } from '../../store/bankStore';
import type { TokenLook } from '../../store/liveSimulation';
import { modelsForProcess } from '../../data/mentalModels';
import { MentalModelCard } from '../education/MentalModelCard';
import { ProcessDiagram } from './ProcessDiagram';
import { useTerms } from './useTerms';

const TONE_BOX: Record<StepTone, string> = {
  neutral: 'border-slate-700 bg-slate-900/70',
  good: 'border-emerald-400/40 bg-emerald-400/10',
  bad: 'border-rose-400/40 bg-rose-400/10',
  warn: 'border-amber-400/40 bg-amber-400/10',
};
const TONE_TEXT: Record<StepTone, string> = { neutral: 'text-slate-200', good: 'text-emerald-200', bad: 'text-rose-200', warn: 'text-amber-200' };
const TONE_DOT: Record<StepTone, string> = { neutral: 'bg-slate-500', good: 'bg-emerald-400', bad: 'bg-rose-400', warn: 'bg-amber-400' };

function tokenFor(example: LessonExample): TokenLook {
  const p = example.payload;
  switch (example.kind) {
    case 'VIRTUAL':
      return { kind: 'CARD', cardType: 'VIRTUAL_DPAN', label: t('Virtual card payment') };
    case 'BNPL':
      return { kind: 'BNPL', cardType: p.cardType, label: t('Pay-in-4 application') };
    case 'SETTLEMENT':
      return { kind: 'SETTLEMENT', cardType: p.cardType, label: t('Settlement record') };
    default:
      return { kind: 'CARD', cardType: p.cardType, label: t('Online card payment') };
  }
}

// Small parts

function Facts({ facts }: { facts: readonly WalkFact[] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="mt-2 flex flex-wrap gap-1.5">
      {facts.map((f) => (
        <div key={f.label} className="rounded-md bg-slate-950/60 px-2 py-1 text-[13px] ring-1 ring-slate-700/70">
          <dt className="inline text-slate-400">{factLabel(f.label)}: </dt>
          <dd className="inline font-semibold text-slate-100">{factValue(f.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Panel({ title, aside, children, testId }: { title: string; aside?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3.5" data-testid={testId}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

// Rules

function Dial({ ruleKey, accent }: { ruleKey: keyof BankRules; accent: string }) {
  const draft = useBankStore((s) => s.draftRules[ruleKey]);
  const bank = useBankStore((s) => s.view.rules[ruleKey]);
  const setDraftRule = useBankStore((s) => s.setDraftRule);
  const meta = RULE_META[ruleKey];
  const changed = draft !== bank;
  const pos = (v: number): number => ((v - meta.min) / (meta.max - meta.min)) * 100;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3" data-testid={`dial-${ruleKey}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`dial-input-${ruleKey}`} className="text-[14.5px] font-semibold text-slate-100">
          {ruleLabel(ruleKey)}
        </label>
        <span className={`rounded-md px-1.5 py-0.5 text-[15px] font-bold tabular-nums ${changed ? 'bg-sky-400/15 text-sky-200' : 'text-slate-200'}`} data-testid={`dial-value-${ruleKey}`}>
          {formatRule(ruleKey, draft)}
        </span>
      </div>
      <div className="relative mt-2.5">
        <input
          id={`dial-input-${ruleKey}`}
          type="range"
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={draft}
          onChange={(e) => setDraftRule(ruleKey, Number(e.target.value))}
          className="bk-range w-full"
          style={{ accentColor: accent }}
          data-testid={`dial-input-${ruleKey}`}
        />
        {changed && (
          <div className="pointer-events-none absolute -bottom-1 h-2 w-px bg-slate-400" style={{ left: `calc(${pos(bank)}% * 0.96 + 2%)` }} title={tr({ en: `The bank runs ${formatRule(ruleKey, bank)}`, vi: `Ngân hàng đang chạy ${formatRule(ruleKey, bank)}` })} />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-slate-500">
        <span>{formatRule(ruleKey, meta.min)}</span>
        <span>{changed ? tr({ en: `bank runs ${formatRule(ruleKey, bank)}`, vi: `ngân hàng đang chạy ${formatRule(ruleKey, bank)}` }) : t('as the bank runs it')}</span>
        <span>{formatRule(ruleKey, meta.max)}</span>
      </div>
      <p className="mt-1.5 text-[13.5px] leading-normal text-slate-400">{ruleHelp(ruleKey)}</p>
    </div>
  );
}

// Impact on tomorrow

const VERDICT_TEXT = { better: 'text-emerald-300', worse: 'text-rose-300', same: 'text-slate-500' } as const;
const VERDICT_PILL = { better: 'bg-emerald-400/15 text-emerald-200', worse: 'bg-rose-400/15 text-rose-200', same: 'bg-slate-800 text-slate-400' } as const;

function ImpactRow({ row, focus }: { row: KpiComparisonRow; focus: boolean }) {
  const { def } = row;
  return (
    <tr className={focus ? 'bg-slate-800/40' : ''} data-testid={`impact-${def.id}`} data-verdict={row.verdict}>
      <td className="py-1.5 pl-2 pr-2 align-top">
        <div className="text-[14px] font-medium text-slate-100" title={kpiHelp(def)}>
          {kpiLabel(def)}
        </div>
      </td>
      <td className="whitespace-nowrap px-1 py-1.5 text-right text-[14px] tabular-nums text-slate-400">{formatKpi(row.before, def.format)}</td>
      <td className="whitespace-nowrap px-1 py-1.5 text-right text-[14px] font-semibold tabular-nums text-slate-100">{formatKpi(row.after, def.format)}</td>
      <td className="whitespace-nowrap py-1.5 pl-1 pr-2 text-right">
        <span className={`inline-block rounded px-1.5 py-0.5 text-[13px] font-semibold tabular-nums ${VERDICT_PILL[row.verdict]}`}>{formatDelta(row.delta, def.format)}</span>
      </td>
    </tr>
  );
}

function Impact({ lesson, horizon, setHorizon }: { lesson: Lesson; horizon: 1 | 5; setHorizon: (h: 1 | 5) => void }) {
  const draft = useBankStore((s) => s.draftRules);
  const bank = useBankStore((s) => s.view.rules);
  const comparison = useBankStore((s) => s.comparison);
  const status = useBankStore((s) => s.comparisonStatus);
  const day = useBankStore((s) => s.view.day);

  const untouched = rulesEqual(draft, bank);
  const fresh = comparison !== null && rulesEqual(comparison.tweakedRules, draft) && comparison.count === horizon;
  const tomorrow = day + 1;

  let body: ReactNode;
  if (untouched) {
    body = (
      <p className="rounded-xl border border-dashed border-slate-700 px-3 py-4 text-center text-[14.5px] text-slate-400">
        {tr({
          en: `Move a dial. The bank plays ${horizon === 1 ? 'tomorrow' : 'the next five days'} twice, once with today’s rules and once with yours, and shows you what changed.`,
          vi: `Xoay một nút chỉnh. Ngân hàng chạy ${horizon === 1 ? 'ngày mai' : 'năm ngày tới'} hai lần, một lần với quy tắc hôm nay và một lần với quy tắc của bạn, rồi cho bạn thấy điều gì thay đổi.`,
        })}
      </p>
    );
  } else if (!fresh) {
    body = (
      <p className="rounded-xl border border-slate-800 px-3 py-4 text-center text-[14.5px] text-sky-200" role="status" data-testid="impact-running">
        <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400" />
        {status === 'running'
          ? tr({ en: `Playing ${horizon === 1 ? `day ${tomorrow}` : `days ${tomorrow}–${tomorrow + 4}`} twice…`, vi: `Đang chạy ${horizon === 1 ? `ngày ${tomorrow}` : `các ngày ${tomorrow}–${tomorrow + 4}`} hai lần…` })
          : t('Getting ready to play it out…')}
      </p>
    );
  } else if (comparison) {
    const focusRows = lesson.focusRows.map((id) => comparison.rows.find((r) => r.def.id === id)).filter((r): r is KpiComparisonRow => r !== undefined);
    const others = comparison.rows.filter((r) => !lesson.focusRows.includes(r.def.id) && r.verdict !== 'same');
    const net = comparison.rows.find((r) => r.def.id === 'net');
    const first = comparison.days[0];
    body = (
      <div data-testid="impact-table-wrap">
        {net && (
          <div className={`mb-2.5 rounded-xl border px-3 py-2.5 ${net.verdict === 'better' ? 'border-emerald-400/35 bg-emerald-400/10' : net.verdict === 'worse' ? 'border-rose-400/35 bg-rose-400/10' : 'border-slate-700 bg-slate-900/60'}`} data-testid="impact-net" data-verdict={net.verdict}>
            <div className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-400">{comparison.count === 1
                ? tr({ en: `Day ${comparison.startDay} profit & loss`, vi: `Lãi lỗ ngày ${comparison.startDay}` })
                : tr({ en: `Days ${comparison.startDay}–${comparison.startDay + comparison.count - 1} profit & loss`, vi: `Lãi lỗ các ngày ${comparison.startDay}–${comparison.startDay + comparison.count - 1}` })}</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className={`text-[22px] font-bold leading-none tabular-nums ${VERDICT_TEXT[net.verdict]}`}>{net.delta === 0 ? t('No change') : `${net.delta > 0 ? '+' : '−'}${formatMoney(Math.abs(net.delta))}`}</span>
              <span className="text-[13.5px] text-slate-400">
                {formatMoney(net.before)} → {formatMoney(net.after)}
              </span>
            </div>
          </div>
        )}
        {first && comparison.count === 1 && (
          <p className="mb-2 text-[13.5px] leading-normal text-slate-400">
            <span className="font-semibold text-slate-300">{eventText(first.event).title}.</span> {eventText(first.event).blurb}
          </p>
        )}
        {comparison.count > 1 && <p className="mb-2 text-[13.5px] leading-normal text-slate-400">{comparison.days.map((d) => tr({ en: `Day ${d.day}: ${eventText(d.event).title}`, vi: `Ngày ${d.day}: ${eventText(d.event).title}` })).join(' · ')}</p>}
        <table className="w-full table-fixed border-separate border-spacing-0 text-left" data-testid="impact-table">
          <colgroup>
            <col />
            <col className="w-[70px]" />
            <col className="w-[70px]" />
            <col className="w-[76px]" />
          </colgroup>
          <thead className="text-[12px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="pb-1 pl-2 font-medium">{t('What the manager watches')}</th>
              <th className="pb-1 text-right font-medium">{t('Today’s rules')}</th>
              <th className="pb-1 text-right font-medium">{t('Your rules')}</th>
              <th className="pb-1 pr-2 text-right font-medium">{t('Change')}</th>
            </tr>
          </thead>
          <tbody>
            {focusRows.map((r) => (
              <ImpactRow key={r.def.id} row={r} focus />
            ))}
          </tbody>
        </table>
        {others.length > 0 && (
          <>
            <div className="mb-1 mt-3 text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">{t('Also moved')}</div>
            <table className="w-full table-fixed border-separate border-spacing-0 text-left">
              <colgroup>
                <col />
                <col className="w-[70px]" />
                <col className="w-[70px]" />
                <col className="w-[76px]" />
              </colgroup>
              <tbody>
                {others.slice(0, 6).map((r) => (
                  <ImpactRow key={r.def.id} row={r} focus={false} />
                ))}
              </tbody>
            </table>
          </>
        )}
        <p className="mt-2.5 text-[13px] leading-normal text-slate-500">{t('Same customers, same staff, same night. Only your rule differs, so every change above is down to it.')}</p>
      </div>
    );
  }

  return (
    <Panel
      title={t('What happens to tomorrow?')}
      testId="impact-panel"
      aside={
        <div className="flex rounded-md bg-slate-800 p-0.5" role="group" aria-label={t('How far ahead to look')}>
          {([1, 5] as const).map((h) => (
            <button key={h} type="button" onClick={() => setHorizon(h)} aria-pressed={horizon === h} data-testid={`horizon-${h}`} className={`whitespace-nowrap rounded px-2 py-1 text-[13px] font-semibold transition ${horizon === h ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-100'}`}>
              {h === 1 ? t('Tomorrow') : t('5 days')}
            </button>
          ))}
        </div>
      }
    >
      {body}
    </Panel>
  );
}

// The hub

const STEP_MS = 1700;

function Lessonview({ lesson }: { lesson: Lesson }) {
  const draft = useBankStore((s) => s.draftRules);
  const setDraftRule = useBankStore((s) => s.setDraftRule);
  const select = useBankStore((s) => s.select);
  const closeHub = useBankStore((s) => s.closeHub);
  const terms = useTerms();
  const [exampleId, setExampleId] = useState(lesson.examples[0]?.id ?? '');
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [runKey, setRunKey] = useState(0);
  const [showAllDials, setShowAllDials] = useState(false);

  const example = lesson.examples.find((e) => e.id === exampleId) ?? (lesson.examples[0] as LessonExample);
  const walk = useMemo(() => buildWalkthrough(lesson.id, example.id, draft), [lesson.id, example.id, draft]);
  const token = useMemo(() => tokenFor(example), [example]);
  const last = walk.steps.length - 1;
  const step = walk.steps[Math.min(active, last)];

  // Start the story over whenever the payment, or the route it takes under the dials, changes.
  const signature = `${example.id}|${walk.steps.map((s) => s.nodeId).join('>')}|${walk.verdict.headline}`;
  const lastSignature = useRef(signature);
  useEffect(() => {
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    setActive(0);
    setPlaying(true);
    setRunKey((k) => k + 1);
  }, [signature]);

  useEffect(() => {
    if (!playing) return;
    if (active >= last) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setActive((a) => Math.min(last, a + 1)), STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, active, last]);

  const go = (i: number): void => {
    setPlaying(false);
    setActive(Math.max(0, Math.min(last, i)));
    setRunKey((k) => k + 1);
  };
  const replay = (): void => {
    setActive(0);
    setPlaying(true);
    setRunKey((k) => k + 1);
  };

  const dialKeys = RULE_KEYS.filter((k) => lesson.knobs.includes(k));
  const otherKeys = RULE_KEYS.filter((k) => !lesson.knobs.includes(k));
  const suggestion = example.suggestion;
  const suggestionApplied = suggestion ? (Object.entries(suggestion.rules) as Array<[keyof BankRules, number]>).every(([k, v]) => draft[k] === v) : false;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_392px] gap-0">
      {/* ── Left: the story ─────────────────────────────────────────────── */}
      <div className="min-h-0 space-y-4 overflow-y-auto p-5" data-testid="hub-left">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: lesson.accent }}>
            {tr({ en: `Chapter ${lesson.chapter}`, vi: `Chương ${lesson.chapter}` })} · {terms.t(lesson.subtitle)}
          </div>
          <h2 className="mt-1 text-[21px] font-bold leading-tight text-slate-50" data-testid="hub-title">
            {terms.t(lesson.title)}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">{t('On the map')}</span>
            {lesson.desks.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  closeHub();
                  select({ kind: 'station', id: d });
                }}
                className="rounded-full bg-slate-800 px-2.5 py-1 text-[13px] font-medium text-slate-200 transition hover:bg-slate-700"
                title={t('Close this and look at the desk on the map')}
              >
                {terms.station(d)}
              </button>
            ))}
          </div>
        </div>

        <Panel title={t('Pick a payment')} testId="example-picker">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Example payments')}>
            {lesson.examples.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setExampleId(e.id)}
                aria-pressed={e.id === example.id}
                data-testid={`example-${e.id}`}
                className={`rounded-lg px-2.5 py-1.5 text-left text-[14px] font-medium leading-tight transition ${e.id === example.id ? 'text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
                style={e.id === example.id ? { background: lesson.accent } : undefined}
              >
                {e.label}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[14.5px] leading-relaxed text-slate-200" data-testid="example-story">
            {terms.t(example.story)}
          </p>
          <dl className="mt-2 flex flex-wrap gap-1.5" aria-label={t('What the payment carries')}>
            {walk.carries.map((f) => (
              <div key={f.label} className="rounded-md bg-slate-950/60 px-2 py-1 text-[13px] ring-1 ring-slate-700/70">
                <dt className="inline text-slate-500">{factLabel(f.label)}: </dt>
                <dd className="inline font-semibold text-slate-100">{factValue(f.value)}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <section className="rounded-2xl border border-slate-800 bg-[#080c16] p-3" aria-label={t('Process diagram')}>
          <ProcessDiagram lesson={lesson} walk={walk} active={Math.min(active, last)} onSelectStep={go} token={token} runKey={`${runKey}`} />
          <div className="mt-2 flex items-center gap-3 border-t border-slate-800 pt-2.5">
            <div className="flex items-center gap-1">
              <button type="button" onClick={replay} aria-label={t('Replay from the start')} title={t('Replay from the start')} data-testid="hub-replay" className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800 text-slate-200 transition hover:bg-slate-700">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5V5h2.5" />
                </svg>
              </button>
              <button type="button" onClick={() => go(active - 1)} disabled={active <= 0} aria-label={t('Previous step')} data-testid="hub-prev" className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800 text-slate-200 transition hover:bg-slate-700 disabled:opacity-35">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 3L5 8l5 5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => (playing ? setPlaying(false) : active >= last ? replay() : setPlaying(true))}
                aria-label={playing ? t('Pause') : t('Play')}
                data-testid="hub-play"
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-950 transition hover:brightness-110"
                style={{ background: lesson.accent }}
              >
                {playing ? (
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <rect x="3.5" y="2.5" width="3" height="11" rx="0.8" />
                    <rect x="9.5" y="2.5" width="3" height="11" rx="0.8" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M4 2.5v11l9-5.5z" />
                  </svg>
                )}
              </button>
              <button type="button" onClick={() => go(active + 1)} disabled={active >= last} aria-label={t('Next step')} data-testid="hub-next" className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800 text-slate-200 transition hover:bg-slate-700 disabled:opacity-35">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 3l5 5-5 5" />
                </svg>
              </button>
            </div>
            <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-1" aria-label={t('Steps')}>
              {walk.steps.map((s, i) => (
                <li key={`${s.nodeId}-${i}`}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-label={tr({ en: `Step ${i + 1}: ${s.title}`, vi: `Bước ${i + 1}: ${s.title}` })}
                    aria-current={i === active ? 'step' : undefined}
                    title={s.title}
                    data-testid={`hub-step-${i}`}
                    className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12.5px] font-bold tabular-nums transition ${i === active ? 'scale-110 text-slate-950' : i < active ? 'bg-slate-700 text-slate-200' : 'bg-slate-800/70 text-slate-500'}`}
                    style={i === active ? { background: lesson.accent } : undefined}
                  >
                    {i + 1}
                  </button>
                </li>
              ))}
            </ol>
            <span className="shrink-0 text-[13px] tabular-nums text-slate-500" data-testid="hub-progress">
              {tr({ en: `Step ${Math.min(active, last) + 1} of ${walk.steps.length}`, vi: `Bước ${Math.min(active, last) + 1}/${walk.steps.length}` })}
            </span>
          </div>
        </section>

        {step && (
          <section className={`rounded-2xl border p-4 ${TONE_BOX[step.tone]}`} aria-live="polite" data-testid="hub-step-card" data-step={step.index} data-node={step.nodeId}>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${TONE_DOT[step.tone]}`} />
              <span className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-400">
                {tr({ en: `Step ${step.index + 1}`, vi: `Bước ${step.index + 1}` })}
                {step.pass === 2 && tr({ en: ' · the diagram runs again', vi: ' · sơ đồ chạy lại' })}
              </span>
            </div>
            <h3 className="mt-1 text-[18px] font-bold text-slate-50" data-testid="hub-step-title">
              {terms.t(step.title)}
            </h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-slate-200">{terms.t(step.what)}</p>
            <div className={`mt-3 rounded-xl border border-white/10 bg-slate-950/50 p-3 text-[15px] leading-relaxed ${TONE_TEXT[step.tone]}`} data-testid="hub-step-happened">
              <div className="mb-0.5 text-[12px] font-semibold uppercase tracking-wider text-slate-400">{t('For this payment')}</div>
              {terms.t(step.happened)}
              <Facts facts={step.facts} />
            </div>
            {step.why && (
              <p className="mt-3 text-[14.5px] leading-relaxed text-slate-300">
                <span className="font-semibold text-slate-100">{t('Why it matters: ')}</span>
                {terms.t(step.why)}
              </p>
            )}
            {step.fails.length > 0 && (
              <div className="mt-3 text-[14.5px] leading-relaxed text-slate-300" data-testid="hub-step-fails">
                <span className="font-semibold text-slate-100">{t('What can go wrong: ')}</span>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 marker:text-rose-400">
                  {step.fails.map((f) => (
                    <li key={f}>{terms.t(f)}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <section className={`rounded-2xl border px-4 py-3 ${TONE_BOX[walk.verdict.tone]}`} data-testid="hub-verdict" data-outcome={walk.verdict.outcome}>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">{t('How it ends')}</div>
          <div className={`text-[18px] font-bold ${TONE_TEXT[walk.verdict.tone]}`}>{terms.t(walk.verdict.headline)}</div>
          <p className="mt-0.5 text-[14.5px] leading-normal text-slate-300">{terms.t(walk.verdict.detail)}</p>
        </section>

        <Panel title={t('The idea')} testId="hub-idea">
          <div className="max-w-[80ch] space-y-2 text-[15px] leading-relaxed text-slate-300">
            {lesson.intro.map((p) => (
              <p key={p.slice(0, 24)}>{terms.t(p)}</p>
            ))}
          </div>
          {terms.beginner && (
            <div className="mt-3 space-y-2.5" data-testid="hub-pictures">
              {modelsForProcess(lesson.id).map((m) => (
                <MentalModelCard key={m.id} model={m} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title={t('Take away')}>
          <ul className="space-y-1.5 text-[14.5px] leading-relaxed text-slate-300">
            {lesson.takeaways.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: lesson.accent }} />
                {terms.t(t)}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* ── Right: experiment ───────────────────────────────────────────── */}
      <div className="min-h-0 space-y-4 overflow-y-auto border-l border-slate-800 bg-slate-950/60 p-4" data-testid="hub-right">
        <Panel title={t('Tweak the rules')} testId="dials">
          <div className="space-y-2.5">
            {dialKeys.map((k) => (
              <Dial key={k} ruleKey={k} accent={lesson.accent} />
            ))}
          </div>
          {dialKeys.length === 0 && (
            <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-[14px] leading-normal text-slate-400" data-testid="dials-none">
              {t('This chapter is about the order things happen in, not a number you can turn. Play the examples on the left to see which path each payment takes; the bank’s other dials are below if you want to try them.')}
            </p>
          )}
          {suggestion && (
            <div className="mt-3 rounded-xl border border-sky-400/25 bg-sky-400/5 p-3" data-testid="suggestion">
              <div className="text-[12.5px] font-semibold uppercase tracking-wider text-sky-300">{tr({ en: `Try this for “${example.label}”`, vi: `Thử điều này cho “${example.label}”` })}</div>
              <p className="mt-1 text-[14px] leading-normal text-slate-200">{terms.t(suggestion.text)}</p>
              <button
                type="button"
                disabled={suggestionApplied}
                onClick={() => {
                  for (const [k, v] of Object.entries(suggestion.rules) as Array<[keyof BankRules, number]>) setDraftRule(k, v);
                }}
                data-testid="suggestion-apply"
                className="mt-2 rounded-lg bg-sky-500 px-3 py-1.5 text-[14px] font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-default disabled:bg-slate-700 disabled:text-slate-400"
              >
                {suggestionApplied
                  ? t('Dialled in')
                  : tr({
                      en: `Set ${(Object.entries(suggestion.rules) as Array<[keyof BankRules, number]>).map(([k, v]) => `${ruleLabel(k)} to ${formatRule(k, v)}`).join(', ')}`,
                      vi: `Đặt ${(Object.entries(suggestion.rules) as Array<[keyof BankRules, number]>).map(([k, v]) => `${ruleLabel(k)} thành ${formatRule(k, v)}`).join(', ')}`,
                    })}
              </button>
            </div>
          )}
          <button type="button" onClick={() => setShowAllDials((v) => !v)} className="mt-3 text-[13.5px] font-medium text-slate-400 transition hover:text-slate-100" aria-expanded={showAllDials}>
            {showAllDials ? t('Hide the other dials') : t('Show all of the bank’s dials')}
          </button>
          {showAllDials && (
            <div className="mt-2 space-y-2.5">
              {otherKeys.map((k) => (
                <Dial key={k} ruleKey={k} accent="#94a3b8" />
              ))}
            </div>
          )}
        </Panel>
        <HubImpact lesson={lesson} />
      </div>
    </div>
  );
}

function HubImpact({ lesson }: { lesson: Lesson }) {
  const [horizon, setHorizon] = useState<1 | 5>(1);
  const draft = useBankStore((s) => s.draftRules);
  const bank = useBankStore((s) => s.view.rules);
  const runComparison = useBankStore((s) => s.runComparison);
  const applyDraft = useBankStore((s) => s.applyDraft);
  const resetDraft = useBankStore((s) => s.resetDraft);
  const dayOver = useBankStore((s) => s.view.dayOver);
  const notice = useBankStore((s) => s.notice);
  const dismissNotice = useBankStore((s) => s.dismissNotice);
  const same = rulesEqual(draft, bank);

  // Play tomorrow again a moment after the last time a dial moved.
  useEffect(() => {
    if (same) return;
    const t = window.setTimeout(() => runComparison(horizon), 420);
    return () => window.clearTimeout(t);
  }, [draft, bank, horizon, same, runComparison]);

  return (
    <>
      <Impact lesson={lesson} horizon={horizon} setHorizon={setHorizon} />
      <div className="sticky bottom-0 -mx-1 space-y-2 rounded-2xl border border-slate-800 bg-slate-950/95 p-3" data-testid="hub-actions">
        {notice && (
          <div className="flex items-start justify-between gap-2 rounded-lg bg-emerald-400/10 px-2.5 py-1.5 text-[14px] text-emerald-100" role="status" data-testid="hub-notice">
            <span>{noticeText(notice.message)}</span>
            <button type="button" onClick={dismissNotice} className="text-emerald-300/80 hover:text-emerald-100" aria-label={t('Dismiss')}>
              ×
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={applyDraft} disabled={same} data-testid="hub-apply" className="flex-1 rounded-lg bg-lime-400 px-3 py-2 text-[14.5px] font-bold text-slate-950 transition hover:bg-lime-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">
            {t('Apply to the bank')}
          </button>
          <button type="button" onClick={resetDraft} disabled={same} data-testid="hub-reset" className="rounded-lg bg-slate-800 px-3 py-2 text-[14.5px] font-medium text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
            {t('Put back')}
          </button>
        </div>
        <p className="text-[13px] leading-normal text-slate-500">{dayOver ? t('The day is over. New rules start with the next day.') : t('New rules apply to customers who arrive from now on. Anyone already in the bank keeps the old rules.')}</p>
      </div>
    </>
  );
}

export function LearningHub() {
  const open = useBankStore((s) => s.hubOpen);
  const process = useBankStore((s) => s.hubProcess);
  const setHubProcess = useBankStore((s) => s.setHubProcess);
  const closeHub = useBankStore((s) => s.closeHub);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (returnTo.current instanceof HTMLElement) returnTo.current.focus();
    };
  }, [open]);

  if (!open) return null;
  const lesson = lessonOf(process);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onMouseDown={(e) => e.target === e.currentTarget && closeHub()} data-testid="learning-hub-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={tr({ en: `Rule Lab, chapter ${lesson.chapter}: ${lesson.title}`, vi: `Phòng thử quy tắc, chương ${lesson.chapter}: ${lesson.title}` })}
        tabIndex={-1}
        onKeyDown={(e) => e.key === 'Escape' && closeHub()}
        className="flex h-[min(900px,calc(100vh-32px))] w-[min(1380px,100%)] flex-col overflow-hidden rounded-3xl border border-slate-700 bg-[#070b14] shadow-2xl outline-none"
        data-testid="learning-hub"
        data-process={process}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950 px-5 py-3">
          <div className="mr-2">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">{t('Academy')}</div>
            <div className="text-[16px] font-bold text-slate-100">{t('Rule Lab')}</div>
          </div>
          <nav className="flex min-w-0 flex-1 gap-1.5" aria-label={t('Chapters')}>
            {LESSON_LIST.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setHubProcess(l.id as ProcessId)}
                aria-current={l.id === process ? 'page' : undefined}
                data-testid={`hub-tab-${l.id}`}
                className={`flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left transition ${l.id === process ? 'bg-slate-800 ring-1 ring-slate-600' : 'hover:bg-slate-900'}`}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[14px] font-black tabular-nums text-slate-950" style={{ background: l.accent }}>
                  {l.chapter}
                </span>
                <span className={`min-w-0 truncate text-[14.5px] font-semibold ${l.id === process ? 'text-slate-50' : 'text-slate-400'}`} title={processShort(l.id as ProcessId)}>
                  {processShort(l.id as ProcessId)}
                </span>
              </button>
            ))}
          </nav>
          <button type="button" onClick={closeHub} aria-label={t('Close the Learning Hub')} data-testid="hub-close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          </button>
        </header>
        <Lessonview key={lesson.id} lesson={lesson} />
      </div>
    </div>
  );
}

