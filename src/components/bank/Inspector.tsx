import { memo, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { formatClock } from '../../sim/clock';
import { modelForStation } from '../../data/mentalModels';
import { COVER_COST_CENTS, formatMoney } from '../../sim/kpis';
import { LESSONS, type ProcessId } from '../../sim/learning';
import { MAX_COVER_PER_STATION, mistakeChance } from '../../sim/roster';
import { DEPARTMENTS, STATIONS, type DepartmentId, type StationId } from '../../sim/topology';
import type { FeedEntry, StationView, WorkerView } from '../../sim/types';
import { clampInspectorWidth, INSPECTOR_WIDTH } from '../../store/bankPersistence';
import { processesAt, useBankStore, type Selection } from '../../store/bankStore';
import { WorkstationGraphic } from '../canvas/nodes/WorkstationGraphic';
import { MentalModelCard } from '../education/MentalModelCard';
import { useTerms } from './useTerms';
import { FatigueBar, fatigueLook, KIND_LABEL, PacketGlyph, RUN_STATUS, SEVERITY_BOX, SEVERITY_DOT, SEVERITY_TEXT, SectionTitle, Sparkline, Stat, STATUS_DOT_CLASS, STATUS_LABEL, STATUS_TEXT_CLASS, WorkerFace, waitText } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Shared pieces
// ─────────────────────────────────────────────────────────────────────────────

function ExploreButtons({ processes }: { processes: readonly ProcessId[] }) {
  const startSpotlight = useBankStore((s) => s.startSpotlight);
  const terms = useTerms();
  if (processes.length === 0) return null;
  return (
    <section data-testid="explore-section">
      <SectionTitle>Learn how this works</SectionTitle>
      <div className="space-y-1.5">
        {processes.map((p) => {
          const lesson = LESSONS[p];
          return (
            <button
              key={p}
              type="button"
              onClick={() => startSpotlight(p)}
              data-testid={`explore-${p}`}
              className="group flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/70 p-2.5 text-left transition hover:border-slate-500 hover:bg-slate-900"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[14px] font-black text-slate-950" style={{ background: lesson.accent }}>
                {lesson.chapter}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wide" style={{ color: lesson.accent }}>
                  Chapter {lesson.chapter} · Learn &amp; explore
                </span>
                <span className="block text-[12.5px] font-medium leading-snug text-slate-100">{terms.t(lesson.title)}</span>
              </span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-200" aria-hidden="true">
                <path d="M6 3l5 5-5 5" />
              </svg>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StreamList({ entries, empty }: { entries: readonly FeedEntry[]; empty: string }) {
  const terms = useTerms();
  if (entries.length === 0) return <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-[12px] text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-1" data-testid="activity-stream">
      {entries.map((f) => (
        <li key={f.id} className="flex items-start gap-2 text-[12px] leading-snug">
          <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[f.severity]}`} />
          <span className="min-w-0">
            <span className="mr-1.5 font-mono text-[10px] text-slate-500">{formatClock(f.minute)}</span>
            <span className={SEVERITY_TEXT[f.severity]}>{terms.t(f.text)}</span>
            {f.worker && <span className="ml-1 text-[10.5px] text-slate-500">· {f.worker}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StaffRow({ worker, onOpen, selected }: { worker: WorkerView; onOpen: () => void; selected?: boolean }) {
  const look = fatigueLook(worker.fatigue);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`staff-${worker.id}`}
      className={`flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition hover:border-slate-500 ${selected ? 'border-sky-400/60 bg-sky-400/5' : 'border-slate-800 bg-slate-900/50'}`}
    >
      <WorkerFace profile={worker.profile} fatigue={worker.fatigue} size={34} temp={worker.temp} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12.5px] font-semibold text-slate-100">
            {worker.name}
            {worker.temp && <span className="ml-1.5 rounded bg-sky-400/15 px-1 text-[9.5px] font-bold uppercase tracking-wide text-sky-300">cover</span>}
          </span>
          <span className={`shrink-0 text-[10.5px] font-medium ${look.text}`}>{look.label}</span>
        </span>
        <FatigueBar fatigue={worker.fatigue} className="mt-1" />
        <span className="mt-1 block truncate text-[11px] text-slate-400" title={worker.activity}>
          {worker.activity}
        </span>
      </span>
    </button>
  );
}

function MiniHeader({ title, subtitle, accent, onBack, backLabel, children }: { title: string; subtitle: string; accent: string; onBack?: () => void; backLabel?: string; children?: ReactNode }) {
  const clear = useBankStore((s) => s.clearSelection);
  return (
    <header className="shrink-0 border-b border-slate-800 p-3.5" style={{ background: `linear-gradient(180deg, ${accent}1f, transparent)` }}>
      {onBack && (
        <button type="button" onClick={onBack} className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-400 transition hover:text-slate-100" data-testid="inspector-back">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3L5 8l5 5" />
          </svg>
          {backLabel}
        </button>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
            {subtitle}
          </div>
          <h2 className="mt-0.5 text-[16px] font-bold leading-tight text-slate-50" data-testid="inspector-title">
            {title}
          </h2>
        </div>
        <button type="button" onClick={clear} aria-label="Close the inspector" data-testid="inspector-close" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-800 hover:text-white">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
          </svg>
        </button>
      </div>
      {children}
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Department
// ─────────────────────────────────────────────────────────────────────────────

function DepartmentPanel({ id }: { id: DepartmentId }) {
  const terms = useTerms();
  const dept = DEPARTMENTS[id];
  // Only this department's desks: nothing else on the bank's screen can make this panel redraw.
  const own = useBankStore(useShallow((s) => dept.stations.map((st) => s.view.stations[st])));
  const select = useBankStore((s) => s.select);
  const waiting = own.reduce((n, s) => n + s.queueLength, 0);
  const processed = own.reduce((n, s) => n + s.stats.processedToday, 0);
  const workers = own.flatMap((s) => s.workers);
  const alerts = own.flatMap((s) => s.alerts);
  const avgFatigue = workers.length > 0 ? workers.reduce((n, w) => n + w.fatigue, 0) / workers.length : 0;
  const processes = [...new Set(dept.stations.flatMap((st) => processesAt(st)))].sort() as ProcessId[];
  const stream = own
    .flatMap((s) => s.stream)
    .sort((a, b) => b.id - a.id)
    .slice(0, 12);

  return (
    <>
      <MiniHeader title={terms.departmentTitle(id)} subtitle="Department" accent={dept.accent} />
      <div className="bk-scroll min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-3.5" data-testid="inspector-body">
        <p className="text-[12.5px] leading-relaxed text-slate-300">{terms.departmentTip(id)}</p>
        <div className="grid grid-cols-4 gap-1.5">
          <Stat label="Waiting" value={waiting} tone={waiting > 12 ? 'warn' : 'info'} />
          <Stat label="Done" value={processed.toLocaleString()} />
          <Stat label="Staff" value={workers.length} />
          <Stat label="Tired" value={`${Math.round(avgFatigue)}%`} tone={avgFatigue >= 60 ? 'warn' : 'info'} hint="Average fatigue across the team" />
        </div>

        {alerts.length > 0 && (
          <section>
            <SectionTitle>Error alerts</SectionTitle>
            <div className="space-y-1.5">
              {alerts.slice(0, 5).map((a) => (
                <div key={a.id} className={`rounded-lg border px-2.5 py-1.5 text-[12px] ${SEVERITY_BOX[a.severity]}`}>
                  {terms.t(a.text)}
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionTitle>Workstations</SectionTitle>
          <div className="space-y-1.5">
            {own.map((sv) => {
              return (
                <button
                  key={sv.id}
                  type="button"
                  onClick={() => select({ kind: 'station', id: sv.id })}
                  data-testid={`dept-station-${sv.id}`}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-2.5 text-left transition hover:border-slate-500"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[sv.status]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-slate-100" title={terms.stationTitle(sv.id)}>
                      {terms.station(sv.id)}
                    </span>
                    <span className={`block text-[11px] ${STATUS_TEXT_CLASS[sv.status]}`}>
                      {STATUS_LABEL[sv.status]} · {sv.workers.length} on duty
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[17px] font-bold leading-none tabular-nums text-slate-100">{sv.queueLength}</span>
                    <span className="text-[9.5px] uppercase tracking-wide text-slate-500">waiting</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <SectionTitle>The team</SectionTitle>
          <div className="space-y-1.5">
            {workers.map((w) => (
              <StaffRow key={w.id} worker={w} onOpen={() => select({ kind: 'worker', station: w.station, workerId: w.id })} />
            ))}
          </div>
        </section>

        <ExploreButtons processes={processes} />

        <section>
          <SectionTitle>Live activity</SectionTitle>
          <StreamList entries={stream} empty="Nothing has happened here yet today." />
        </section>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Station
// ─────────────────────────────────────────────────────────────────────────────

function QueueList({ sv }: { sv: StationView }) {
  if (sv.queue.length === 0) return <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-[12px] text-slate-500">No one is waiting.</p>;
  const shown = sv.queue.slice(0, 8);
  return (
    <ul className="space-y-1" data-testid="queue-list">
      {shown.map((q) => (
        <li key={q.id} className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-1.5">
          <PacketGlyph kind={q.kind} cardType={q.cardType} width={26} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-slate-100" title={q.scenario || undefined}>
              {q.scenario || `${KIND_LABEL[q.kind]} · ${formatMoney(q.amountCents)}`}
            </span>
            <span className="block truncate text-[11px] text-slate-400">{q.detail}</span>
          </span>
          <span className={`shrink-0 text-[11px] font-medium tabular-nums ${q.waitedMin >= 10 ? 'text-amber-300' : 'text-slate-400'}`}>{waitText(q.waitedMin)}</span>
        </li>
      ))}
      {sv.queue.length < sv.queueLength && <li className="px-1 text-[11px] text-slate-500">…and {sv.queueLength - sv.queue.length} more behind them</li>}
    </ul>
  );
}

function StationPanel({ id }: { id: StationId }) {
  const terms = useTerms();
  const sv = useBankStore((s) => s.view.stations[id]);
  const phase = useBankStore((s) => s.view.phase);
  const select = useBankStore((s) => s.select);
  const addCover = useBankStore((s) => s.addCover);
  const dayOver = useBankStore((s) => s.view.dayOver);
  const def = STATIONS[id];
  const dept = DEPARTMENTS[def.department];
  const first = sv.workers[0];
  const covers = sv.workers.filter((w) => w.temp).length;
  const canCover = !dayOver && covers < MAX_COVER_PER_STATION;
  const stats = sv.stats;

  return (
    <>
      <MiniHeader
        title={terms.stationTitle(id)}
        subtitle={terms.departmentTitle(def.department)}
        accent={dept.accent}
        onBack={() => select({ kind: 'department', id: def.department })}
        backLabel={terms.departmentTitle(def.department)}
      />
      <div className="bk-scroll min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-3.5" data-testid="inspector-body" data-station={id}>
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
          <WorkstationGraphic capability={def.capability ?? 'CORE_LEDGER_CHECK'} status={RUN_STATUS[sv.status]} className="h-[66px] w-[88px] shrink-0" {...(first ? { profile: first.profile } : {})} />
          <div className="min-w-0 flex-1">
            <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${STATUS_TEXT_CLASS[sv.status]}`}>
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASS[sv.status]}`} />
              <span data-testid="inspector-status">{STATUS_LABEL[sv.status]}</span>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-slate-300" data-testid="station-tip">
              {terms.tip(id)}
            </p>
          </div>
        </div>

        {terms.beginner && modelForStation(id) && <MentalModelCard model={modelForStation(id)!} />}

        <ExploreButtons processes={processesAt(id)} />

        {sv.alerts.length > 0 && (
          <section data-testid="station-alerts">
            <SectionTitle>Error alerts</SectionTitle>
            <div className="space-y-1.5">
              {sv.alerts.map((a) => (
                <div key={a.id} className={`rounded-lg border px-2.5 py-1.5 text-[12px] leading-snug ${SEVERITY_BOX[a.severity]}`}>
                  <span className="mr-1.5 font-mono text-[10px] opacity-70">{formatClock(a.minute)}</span>
                  {terms.t(a.text)}
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionTitle>Live stats</SectionTitle>
          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Waiting" value={sv.queueLength} tone={sv.status === 'CONGESTED' || sv.status === 'ALERT' ? 'warn' : 'info'} />
            <Stat label="Done today" value={stats.processedToday.toLocaleString()} />
            <Stat label="Avg wait" value={waitText(stats.avgWaitMin)} tone={stats.avgWaitMin >= 6 ? 'warn' : 'info'} />
            <Stat label="Peak queue" value={stats.peakQueue} />
            <Stat label="Errors" value={stats.errorsToday} tone={stats.errorsToday > 0 ? 'warn' : 'info'} hint="Slips by tired staff that had to be redone" />
            <Stat label="Capacity" value={stats.capacityPerBeat >= 100 ? '100+' : stats.capacityPerBeat.toFixed(stats.capacityPerBeat < 10 ? 1 : 0)} hint="Items per five minutes, given who is on and how tired they are" />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex justify-between text-[10.5px] text-slate-500">
                <span>Staff busy</span>
                <span className="tabular-nums">{Math.round(stats.utilisation * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className={`h-full rounded-full transition-[width] duration-500 ${stats.utilisation > 0.9 ? 'bg-amber-400' : 'bg-sky-400'}`} style={{ width: `${Math.round(stats.utilisation * 100)}%` }} />
              </div>
            </div>
            <div className="text-right">
              <Sparkline values={sv.history} width={110} height={26} label={`${terms.stationTitle(id)} queue length over the last ${sv.history.length} beats`} />
              <div className="text-[9.5px] uppercase tracking-wide text-slate-500">queue, recent beats</div>
            </div>
          </div>
          {stats.lines.length > 0 && (
            <dl className="mt-2 divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-900/40 text-[12px]" data-testid="station-lines">
              {stats.lines.map((l) => (
                <div key={l.label} className="flex items-center justify-between px-2.5 py-1.5">
                  <dt className="text-slate-400">{terms.t(l.label)}</dt>
                  <dd className={`font-medium tabular-nums ${SEVERITY_TEXT[l.tone ?? 'info']}`}>{l.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section>
          <SectionTitle aside={<span className="text-[10px] text-slate-500">{sv.queueLength} in line</span>}>Pending queue</SectionTitle>
          <QueueList sv={sv} />
        </section>

        <section>
          <SectionTitle aside={<span className="text-[10px] text-slate-500">{sv.workers.length} on duty</span>}>Staff</SectionTitle>
          <div className="space-y-1.5">
            {sv.workers.map((w) => (
              <StaffRow key={w.id} worker={w} onOpen={() => select({ kind: 'worker', station: id, workerId: w.id })} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => addCover(id)}
            disabled={!canCover}
            data-testid="call-cover"
            className="mt-2 w-full rounded-lg border border-dashed border-sky-400/40 px-3 py-2 text-[12px] font-medium text-sky-200 transition hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500 disabled:hover:bg-transparent"
          >
            {canCover ? `Call in temporary cover · ${formatMoney(COVER_COST_CENTS)} for the day` : dayOver ? 'The day is over' : 'No more cover available here today'}
          </button>
          {phase !== 'WORKING' && phase !== 'EOD' && canCover && <p className="mt-1 text-[11px] text-slate-500">Cover helps whenever this desk is busy.</p>}
        </section>

        <section>
          <SectionTitle>Live activity</SectionTitle>
          <StreamList entries={sv.stream.slice(0, 14)} empty="Nothing has happened at this desk yet today." />
        </section>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker
// ─────────────────────────────────────────────────────────────────────────────

function WorkerPanel({ station, workerId }: { station: StationId; workerId: string }) {
  const terms = useTerms();
  const select = useBankStore((s) => s.select);
  const worker = useBankStore((s) => s.view.stations[station].workers.find((w) => w.id === workerId));
  const queueLength = useBankStore((s) => s.view.stations[station].queueLength);
  const stream = useBankStore((s) => s.view.stations[station].stream);
  const everyone = useBankStore(useShallow((s) => s.view.stations[station].workers));
  const def = STATIONS[station];
  const dept = DEPARTMENTS[def.department];

  if (!worker) {
    return (
      <>
        <MiniHeader title="No longer on duty" subtitle="Worker" accent={dept.accent} onBack={() => select({ kind: 'station', id: station })} backLabel={terms.station(station)} />
        <div className="p-4 text-[12.5px] text-slate-400">This person has gone home. Temporary cover only works the day it is booked.</div>
      </>
    );
  }

  const look = fatigueLook(worker.fatigue);
  const slip = mistakeChance(worker.fatigue);
  const mine = stream.filter((f) => f.worker === worker.name).slice(0, 10);
  const colleagues = everyone.filter((w) => w.id !== worker.id);

  return (
    <>
      <MiniHeader title={worker.name} subtitle={worker.role} accent={dept.accent} onBack={() => select({ kind: 'station', id: station })} backLabel={terms.station(station)} />
      <div className="bk-scroll min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-3.5" data-testid="inspector-body" data-worker={worker.id}>
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <WorkstationGraphic capability={def.capability ?? 'CORE_LEDGER_CHECK'} status={worker.working ? 'PROCESSING' : 'IDLE'} className="h-[66px] w-[88px] shrink-0" profile={worker.profile} />
          <div className="min-w-0 flex-1 text-[12px] leading-snug text-slate-300">
            <div className="font-semibold text-slate-100">{terms.stationTitle(station)}</div>
            <div className="text-slate-400">Shift {worker.shift}</div>
            {worker.temp && <div className="mt-1 inline-block rounded bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-300">Temporary cover</div>}
          </div>
        </div>

        <section>
          <SectionTitle>Right now</SectionTitle>
          <div className={`rounded-xl border p-3 text-[13px] leading-snug ${worker.working ? 'border-emerald-400/30 bg-emerald-400/5 text-emerald-50' : 'border-slate-800 bg-slate-900/50 text-slate-300'}`} data-testid="worker-activity">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide">
              <span className={`h-1.5 w-1.5 rounded-full ${worker.working ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`} />
              <span className={worker.working ? 'text-emerald-300' : 'text-slate-400'}>{worker.working ? 'Working' : 'Waiting for work'}</span>
            </div>
            {worker.activity}
          </div>
        </section>

        <section>
          <SectionTitle aside={<span className={`text-[11px] font-semibold ${look.text}`}>{look.label}</span>}>Fatigue</SectionTitle>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[26px] font-bold leading-none tabular-nums text-slate-50" data-testid="worker-fatigue">
                {Math.round(worker.fatigue)}
                <span className="text-[13px] font-medium text-slate-500"> / 100</span>
              </span>
              <span className="text-right text-[11.5px] text-slate-400">
                Working at <span className="font-semibold text-slate-100">{Math.round(worker.productivity * 100)}%</span>
                <br />
                of a fresh person’s pace
              </span>
            </div>
            <FatigueBar fatigue={worker.fatigue} className="mt-2.5 !h-2" />
            <div className="mt-1 flex justify-between text-[9.5px] text-slate-500">
              <span>fresh</span>
              <span style={{ marginLeft: '28%' }}>slips begin at 60</span>
              <span>spent</span>
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-slate-400">
              {slip > 0
                ? `Tired enough to make mistakes: about ${(slip * 100).toFixed(0)} in every 100 items go wrong and have to be done again, which makes the queue longer still.`
                : worker.fatigue >= 35
                  ? 'Slowing down a little. Mistakes only start above 60.'
                  : 'Fresh. Working at full pace.'}
            </p>
          </div>
        </section>

        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Items today" value={worker.itemsToday} />
          <Stat label="Pace" value={`${Math.round(worker.productivity * 100)}%`} tone={worker.productivity < 0.8 ? 'warn' : 'info'} />
          <Stat label="Desk queue" value={queueLength} tone={queueLength > 10 ? 'warn' : 'info'} />
        </div>

        <ExploreButtons processes={processesAt(station)} />

        {colleagues.length > 0 && (
          <section>
            <SectionTitle>Others at this desk</SectionTitle>
            <div className="space-y-1.5">
              {colleagues.map((w) => (
                <StaffRow key={w.id} worker={w} onOpen={() => select({ kind: 'worker', station, workerId: w.id })} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionTitle>Their recent work</SectionTitle>
          <StreamList entries={mine} empty="Nothing yet." />
        </section>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The drawer
// ─────────────────────────────────────────────────────────────────────────────

/** How long the drawer takes to slide in or out. The content stays mounted until it has gone, so it never slides out empty. */
const SLIDE_MS = 200;

/**
 * The inspector drawer. It floats over the right edge of the map instead of sitting beside it, so opening or closing it never
 * changes the size of the map or the 3D scene (which would make every desk lay itself out again). It slides on the compositor
 * (a transform, with `will-change`) and uses a plain semi-opaque background: no blur over the animated scene.
 *
 * This component subscribes only to the selection. The panels inside subscribe to their own slice of the bank, and only while
 * they are on screen, so the clock ticking does nothing here while the drawer is shut.
 */
function InspectorDrawer() {
  const selection = useBankStore((s) => s.selection);
  const open = selection.kind !== 'none';
  const [shown, setShown] = useState<Selection>(selection);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setShown(selection);
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), SLIDE_MS);
    return () => clearTimeout(t);
  }, [open, selection]);

  const content = open ? selection : shown;
  const stored = useBankStore((s) => s.inspectorWidth);
  const setWidth = useBankStore((s) => s.setInspectorWidth);
  // While the edge is being dragged the width lives here, and is saved once when the pointer is let go.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const grab = useRef<{ x: number; width: number } | null>(null);
  const width = dragWidth ?? stored;

  const onGrab = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    grab.current = { x: e.clientX, width };
    setDragWidth(width);
  };
  const onDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const g = grab.current;
    if (!g) return;
    // The handle is on the left edge: moving the pointer left makes the drawer wider.
    setDragWidth(clampInspectorWidth(g.width + (g.x - e.clientX)));
  };
  const onLetGo = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!grab.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    grab.current = null;
    if (dragWidth !== null) setWidth(dragWidth);
    setDragWidth(null);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const by = e.key === 'ArrowLeft' ? 16 : e.key === 'ArrowRight' ? -16 : e.key === 'Home' ? INSPECTOR_WIDTH.max - width : e.key === 'End' ? INSPECTOR_WIDTH.min - width : 0;
    if (by === 0) return;
    e.preventDefault();
    setWidth(width + by);
  };

  return (
    <aside
      className={`absolute bottom-0 right-0 top-0 z-40 flex max-w-full flex-col border-l border-slate-800 bg-slate-900/95 shadow-2xl ease-out will-change-transform ${dragWidth === null ? 'transition-transform duration-200' : ''} ${open ? 'translate-x-0' : 'pointer-events-none translate-x-full'}`}
      style={{ width }}
      aria-label="Inspector"
      aria-hidden={!open}
      data-testid="inspector"
      data-kind={selection.kind}
      data-open={open}
      data-width={width}
      // The drawer floats over the map or the 3D office. Wheel and pointer events that start in it stay in it, so scrolling the
      // drawer never zooms or pans the scene underneath.
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the inspector"
        aria-valuemin={INSPECTOR_WIDTH.min}
        aria-valuemax={INSPECTOR_WIDTH.max}
        aria-valuenow={width}
        tabIndex={open ? 0 : -1}
        title="Drag to make the inspector wider or narrower"
        data-testid="inspector-resize"
        onPointerDown={onGrab}
        onPointerMove={onDrag}
        onPointerUp={onLetGo}
        onPointerCancel={onLetGo}
        onKeyDown={onKey}
        className="group absolute -left-1.5 bottom-0 top-0 z-10 w-3 cursor-col-resize touch-none outline-none"
      >
        <span className={`absolute bottom-0 left-1/2 top-0 w-[3px] -translate-x-1/2 rounded-full transition-colors ${dragWidth !== null ? 'bg-sky-400' : 'bg-transparent group-hover:bg-sky-400/60 group-focus-visible:bg-sky-400'}`} />
      </div>
      {(open || mounted) && content.kind === 'department' && <DepartmentPanel id={content.id} />}
      {(open || mounted) && content.kind === 'station' && <StationPanel id={content.id} />}
      {(open || mounted) && content.kind === 'worker' && <WorkerPanel station={content.station} workerId={content.workerId} />}
    </aside>
  );
}

export const Inspector = memo(InspectorDrawer);
