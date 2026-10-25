import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatMoney } from '../../sim/kpis';
import { localizeScenarioText } from '../../sim/scenarios';
import {
  RANDOM_TASK,
  ROLE_ICON,
  ROLE_STATION,
  roleForStation,
  SHIFT_TARGET,
  STAFF_DRILLS,
  STAFF_ROLES,
  STAFF_SLA_SECONDS,
  STAFF_TASKS,
  STAFF_XP_PER_CORRECT,
  taskDeck,
  type StaffCase,
  type StaffDecision,
  type StaffDecisionResult,
  type StaffDrillNo,
  type StaffField,
  type StaffRoleId,
  type StaffTaskNo,
} from '../../sim/staffRoleplay';
import { DEPARTMENTS, STATIONS, type StationId } from '../../sim/topology';
import { bankStore, EMPTY_SHIFT, useBankStore, type ShiftProgress } from '../../store/bankStore';
import { useLocale, useMessages, type Locale, type Translate } from '../../utils/i18nHelper';
import { analystWorkspaceMessages, PERSONAS, type AnalystWorkspaceKey } from './analystWorkspace.messages';
import { InfoTip } from './InfoTip';
import { LanguageToggle } from '../shell/LanguageToggle';
import { useTerms } from './useTerms';

/**
 * Phase 8 Step 2: the Staff Roleplay Workspace, a scenario-driven review desk in two registers.
 *
 *   ⌂  Header: desk picker (switching desks asks first, then restarts at Task 1), task picker (instant), language, complexity.
 *   A  Mission brief, regulatory reference (Expert), the current task of the 28-task matrix and its SOP.
 *   B  The 4-part scenario card: persona & story, trigger context, highlighted payload tags, risk & benefit analysis.
 *   C  Approve / Reject, a 2-second consequence overlay (+XP or an error), and the shift objective.
 *
 * Decisions go through useBankStore.staffTrain, which grades the task case against its SOP and books the shift.
 */

export type WorkspaceMode = 'standard' | 'expert';
type M = Translate<AnalystWorkspaceKey>;

/** How long the consequence overlay stays up. */
export const CONSEQUENCE_MS = 2000;

const money = (cents: number): string => formatMoney(cents);
const k = (key: string): AnalystWorkspaceKey => key as AnalystWorkspaceKey;
const suffix = (mode: WorkspaceMode): 'Std' | 'Exp' => (mode === 'standard' ? 'Std' : 'Exp');

/** Steps in each Expert compliance procedure. */
export const EXPERT_SOP_STEPS = 3;

/** The SOP a task shows, grouped by drill: one plain rule per drill in Standard, a 3-step procedure per drill in Expert. */
export function sopGroups(role: StaffRoleId, task: StaffTaskNo, mode: WorkspaceMode = 'standard'): { drill: StaffDrillNo; keys: AnalystWorkspaceKey[] }[] {
  const drills: readonly StaffDrillNo[] = task === RANDOM_TASK ? STAFF_DRILLS : [task as StaffDrillNo];
  return drills.map((drill) => ({
    drill,
    keys: mode === 'expert' ? Array.from({ length: EXPERT_SOP_STEPS }, (_, i) => k(`task_${role}_${drill}_sopExp_${i + 1}`)) : [k(`task_${role}_${drill}_sop`)],
  }));
}

/** Every SOP line a task shows in a mode, in order. */
export const sopKeys = (role: StaffRoleId, task: StaffTaskNo, mode: WorkspaceMode = 'standard'): AnalystWorkspaceKey[] => sopGroups(role, task, mode).flatMap((g) => g.keys);

export type RiskKind = 'approve' | 'reject' | 'benefit';

/** A risk/benefit card: specific to the drill on task-matrix cases, the desk's generic card on live-queue cases. */
export const riskKey = (role: StaffRoleId, drill: StaffDrillNo | undefined, kind: RiskKind, mode: WorkspaceMode): AnalystWorkspaceKey =>
  k(drill ? `risk_${role}_t${drill}_${kind}${suffix(mode)}` : `risk_${role}_${kind}${suffix(mode)}`);

/** Every task's title key for a role, in order. */
export const taskTitleKey = (role: StaffRoleId, task: StaffTaskNo): AnalystWorkspaceKey => k(`task_${role}_${task}_title`);

/** A stable persona per case. */
export function personaFor(caseId: string): { avatar: string; name: string; index: number } {
  let h = 0;
  for (let i = 0; i < caseId.length; i++) h = (h * 31 + caseId.charCodeAt(i)) >>> 0;
  const index = h % PERSONAS.length;
  return { ...PERSONAS[index]!, index };
}

function fieldText(f: StaffField, m: M, locale: Locale): string {
  const v = f.value;
  switch (v.t) {
    case 'pct':
      return `${v.v}%`;
    case 'num':
      return v.v.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-AU');
    case 'money':
      return money(v.cents);
    case 'bool':
      return v.v ? m('yes') : m('no');
    case 'code':
      return f.key === 'merchant' ? localizeScenarioText(v.v, locale) : v.v;
    case 'msg':
      return m(k(`val_${v.key}`));
  }
}

/** Real seconds since the case reached the head of the desk. */
function useCaseTimer(caseId: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  const started = useRef<{ id: string | null; at: number }>({ id: null, at: Date.now() });
  if (started.current.id !== caseId) started.current = { id: caseId, at: Date.now() };
  useEffect(() => {
    if (!caseId) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [caseId]);
  return Math.max(0, (now - started.current.at) / 1000);
}

function Kicker({ children }: { children: ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode toggle
// ─────────────────────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange, m }: { mode: WorkspaceMode; onChange: (mode: WorkspaceMode) => void; m: M }) {
  const option = (value: WorkspaceMode, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      onClick={() => onChange(value)}
      data-testid={`workspace-mode-${value}`}
      className={`rounded-md px-3 py-1 text-[12px] font-semibold transition ${mode === value ? (value === 'expert' ? 'bg-violet-500 text-white' : 'bg-sky-400 text-slate-950') : 'text-slate-300 hover:bg-slate-800'}`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:inline">{m('modeLabel')}</span>
      <div role="radiogroup" aria-label={m('modeLabel')} className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5" data-testid="workspace-mode" data-mode={mode} title={m(mode === 'standard' ? 'modeStandardHint' : 'modeExpertHint')}>
        {option('standard', m('modeStandard'))}
        {option('expert', m('modeExpert'))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel A
// ─────────────────────────────────────────────────────────────────────────────

function MissionPanel({ role, task, mode, m, deskName }: { role: StaffRoleId; task: StaffTaskNo; mode: WorkspaceMode; m: M; deskName: string }) {
  const expert = mode === 'expert';
  return (
    <section className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/50 p-3.5" data-testid="workspace-mission">
      <div>
        <Kicker>{m('missionBrief')}</Kicker>
        <h3 className="mt-1 flex items-center gap-2 text-[15px] font-bold text-slate-50" data-testid="workspace-role">
          <span aria-hidden="true">{ROLE_ICON[role]}</span>
          {m(k(`role_${role}_title`))}
        </h3>
        <div className="text-[11px] text-sky-300/90">{deskName}</div>
        <p className="mt-2 text-[12px] leading-snug text-slate-300" data-testid="workspace-brief">
          {m(k(expert ? `role_${role}_brief` : `role_${role}_briefStd`))}
        </p>
        <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${expert ? 'border-rose-400/40 bg-rose-400/10 text-rose-200' : 'border-amber-400/40 bg-amber-400/10 text-amber-200'}`} data-testid="workspace-sla">
          {m(expert ? 'slaTargetExp' : 'slaTarget', { sec: STAFF_SLA_SECONDS })}
        </div>
        {expert && (
          <div className="mt-2 rounded-lg border border-violet-400/30 bg-violet-500/10 px-2.5 py-1.5" data-testid="workspace-reg">
            <Kicker>{m('regTitle')}</Kicker>
            <p className="mt-0.5 font-mono text-[10.5px] leading-snug text-violet-200">{m(k(`role_${role}_reg`))}</p>
          </div>
        )}
      </div>
      <div className="rounded-lg border border-sky-400/30 bg-sky-400/[0.06] px-2.5 py-2" data-testid="workspace-task" data-task={task}>
        <Kicker>{m('taskTitle')}</Kicker>
        <div className="mt-0.5 text-[13px] font-semibold text-sky-100">{m('taskOption', { n: task, title: m(taskTitleKey(role, task)) })}</div>
        {task === RANDOM_TASK && <p className="mt-1 text-[11px] leading-snug text-slate-400">{m('taskRandomNote')}</p>}
      </div>
      <div>
        <div className="text-[11px] font-bold tracking-wide text-amber-200" data-testid="workspace-sop-title">
          {m('sopTitle')}
        </div>
        <p className="mb-1.5 mt-0.5 text-[10.5px] italic leading-snug text-slate-500" data-testid="workspace-sop-note">
          {m('sopNote')}
        </p>
        {expert ? (
          <div className="space-y-2" data-testid="workspace-sop" data-sop="expert">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-violet-300">{m('sopExpTitle')}</div>
            {sopGroups(role, task, mode).map((g) => (
              <div key={g.drill} data-drill={g.drill}>
                {task === RANDOM_TASK && <div className="mb-1 text-[11px] font-semibold text-sky-200">{m('taskOption', { n: g.drill, title: m(taskTitleKey(role, g.drill)) })}</div>}
                <ol className="space-y-1.5">
                  {g.keys.map((key, i) => (
                    <li key={key} className="rounded-lg border border-violet-400/20 bg-slate-950/50 px-2.5 py-1.5 text-[11.5px] leading-snug text-slate-200">
                      <div className="font-mono text-[10px] font-semibold uppercase text-violet-300">{m('sopStep', { n: i + 1 })}</div>
                      {m(key)}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        ) : (
          <ol className="space-y-1.5" data-testid="workspace-sop" data-sop="standard">
            {sopKeys(role, task).map((key, i) => (
              <li key={key} className="flex gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-1.5 text-[12px] leading-snug text-slate-200">
                <span className="font-mono text-[10px] text-slate-500">{task === RANDOM_TASK ? STAFF_DRILLS[i] : task}</span>
                <span>{m(key)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel B: the 4-part scenario card
// ─────────────────────────────────────────────────────────────────────────────

function PayloadTag({ field, mode, m, locale }: { field: StaffField; mode: WorkspaceMode; m: M; locale: Locale }) {
  const label = m(k(`field_${field.key}`));
  return (
    <div
      className={`flex min-w-0 flex-col rounded-lg border px-2.5 py-1.5 ${field.flag ? 'border-rose-400/60 bg-rose-500/10' : 'border-sky-400/25 bg-sky-400/[0.06]'}`}
      data-field={field.key}
      data-flag={field.flag || undefined}
    >
      <span className="flex items-center text-[10.5px] text-slate-400">
        {label}
        <InfoTip label={label} text={m(k(`tip_${field.key}_${mode === 'standard' ? 'std' : 'exp'}`))} testId={`workspace-tip-${field.key}`} />
      </span>
      <span className={`mt-0.5 flex items-center gap-1 break-all text-[13px] font-semibold tabular-nums ${field.flag ? 'text-rose-200' : 'text-slate-50'}`}>
        {field.flag && (
          <span aria-label={m('breach')} title={m('breach')}>
            ⚠
          </span>
        )}
        {fieldText(field, m, locale)}
      </span>
    </div>
  );
}

function ScenarioCard({ current, queued, elapsed, mode, m, onAdvance, canAdvance, showDrill }: { current: StaffCase | null; queued: number; elapsed: number; mode: WorkspaceMode; m: M; onAdvance: () => void; canAdvance: boolean; showDrill: boolean }) {
  const locale = useLocale();
  if (!current) {
    return (
      <section className="grid min-h-[220px] place-items-center rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center" data-testid="workspace-empty">
        <div>
          <div className="text-[14px] font-semibold text-slate-200">{m('emptyQueue')}</div>
          <p className="mt-1 max-w-sm text-[12px] text-slate-400">{m('emptyHint')}</p>
          <button type="button" onClick={onAdvance} disabled={!canAdvance} data-testid="workspace-advance" className="mt-3 rounded-lg border border-sky-400/40 px-3 py-1.5 text-[12px] font-medium text-sky-200 transition hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-40">
            {m('advance')}
          </button>
        </div>
      </section>
    );
  }
  const persona = personaFor(current.id);
  const left = STAFF_SLA_SECONDS - elapsed;
  const late = left < 0;
  const s = suffix(mode);
  const story = m(k(`scene_${current.scene}_story`), { name: persona.name, amount: money(current.amountCents) });
  return (
    <section className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/50 p-3.5" data-testid="workspace-scenario" data-case={current.id} data-scene={current.scene} data-mode={mode}>
      {/* 1. Persona & storyline */}
      <div className="flex items-start gap-3" data-testid="workspace-persona">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-800 text-[26px] ring-1 ring-slate-700" aria-hidden="true">
          {persona.avatar}
        </span>
        <div className="min-w-0 flex-1">
          <Kicker>{m('personaTitle')}</Kicker>
          <div className="text-[13.5px] font-semibold text-slate-50">
            {persona.name} · <span className="font-normal text-slate-400">{m(k(`persona_${persona.index}_job`))}</span>
          </div>
          <p className="mt-1 text-[12.5px] leading-snug text-slate-200" data-testid="workspace-story">
            {story}
          </p>
          <div className="mt-1 font-mono text-[10.5px] text-slate-500">
            {current.id} · {current.scenario && `${localizeScenarioText(current.scenario, locale)} · `}
            {m('waited', { min: current.waitedMin })}
            {queued > 0 && ` · ${m('queueAhead', { n: queued })}`}
          </div>
          {showDrill && current.drill && (
            <span className="mt-1 inline-flex rounded-full border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-violet-200" data-testid="workspace-drill" data-drill={current.drill}>
              {m('taskDrillTag', { n: current.drill })}
            </span>
          )}
        </div>
        <div className="shrink-0 text-right">
          <Kicker>{m('amount')}</Kicker>
          <div className="text-[16px] font-bold tabular-nums text-slate-50">{money(current.amountCents)}</div>
          <div className={`mt-0.5 text-[11px] font-semibold tabular-nums ${late ? 'text-rose-300' : left < 10 ? 'text-amber-300' : 'text-emerald-300'}`} data-testid="workspace-timer" data-late={late || undefined}>
            {late ? m('slaBreached') : m('slaTimer', { sec: Math.ceil(left) })}
          </div>
        </div>
      </div>

      {/* 2. Trigger context */}
      <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.07] px-3 py-2" data-testid="workspace-trigger">
        <div className="text-[11px] font-bold text-amber-200">{m('triggerTitle')}</div>
        <p className="mt-0.5 text-[12px] leading-snug text-amber-50/90">{m(k(`scene_${current.scene}_trigger${s}`))}</p>
      </div>

      {/* 3. Highlighted payload tags */}
      <div>
        <Kicker>{m('payloadTitle')}</Kicker>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3" data-testid="workspace-fields">
          {current.fields.map((f) => (
            <PayloadTag key={f.key} field={f} mode={mode} m={m} locale={locale} />
          ))}
        </div>
      </div>

      {/* 4. Risk & benefit analysis */}
      <div data-testid="workspace-risk">
        <div className="text-[11px] font-bold text-slate-200">{m('riskTitle')}</div>
        <div className="mt-1.5 grid gap-1.5 md:grid-cols-3">
          <RiskBox tone="rose" title={m('falseApproveTitle')} text={m(riskKey(current.role, current.drill, 'approve', mode))} testId="risk-false-approve" />
          <RiskBox tone="amber" title={m('falseRejectTitle')} text={m(riskKey(current.role, current.drill, 'reject', mode))} testId="risk-false-reject" />
          <RiskBox tone="emerald" title={m('benefitTitle')} text={m(riskKey(current.role, current.drill, 'benefit', mode))} testId="risk-benefit" />
        </div>
      </div>
    </section>
  );
}

const RISK_TONE = {
  rose: 'border-rose-400/35 bg-rose-500/[0.08] text-rose-200',
  amber: 'border-amber-400/35 bg-amber-500/[0.08] text-amber-200',
  emerald: 'border-emerald-400/35 bg-emerald-500/[0.08] text-emerald-200',
} as const;

function RiskBox({ tone, title, text, testId }: { tone: keyof typeof RISK_TONE; title: string; text: string; testId: string }) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${RISK_TONE[tone]}`} data-testid={testId}>
      <div className="text-[10.5px] font-bold uppercase tracking-wide">{title}</div>
      <p className="mt-0.5 text-[11.5px] leading-snug text-slate-200">{text}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel C: decision, consequence overlay, shift objective
// ─────────────────────────────────────────────────────────────────────────────

interface Consequence {
  result: StaffDecisionResult;
  role: StaffRoleId;
  /** The drill of the decided case, so the overlay quotes that task's card. */
  drill?: StaffDrillNo;
  errors: number;
}

/** What the overlay explains: the benefit when right, the risk the learner just took when wrong. */
export function consequenceKey(c: Pick<Consequence, 'result' | 'role' | 'drill'>, mode: WorkspaceMode): AnalystWorkspaceKey {
  return riskKey(c.role, c.drill, c.result.correct ? 'benefit' : c.result.decision === 'APPROVE' ? 'approve' : 'reject', mode);
}

export function ConsequenceOverlay({ consequence, mode, m }: { consequence: Consequence; mode: WorkspaceMode; m: M }) {
  const { result } = consequence;
  const ok = result.correct;
  return (
    <div
      role="status"
      aria-live="assertive"
      data-testid="workspace-consequence"
      data-correct={ok}
      className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 text-center backdrop-blur-sm ${ok ? 'border-emerald-400/70 bg-emerald-950/90' : 'border-rose-400/70 bg-rose-950/90'}`}
    >
      <div className={`rounded-full px-3 py-1 text-[14px] font-extrabold tracking-wide ${ok ? 'bg-emerald-400 text-emerald-950' : 'bg-rose-400 text-rose-950'}`}>{m(ok ? 'overlayCorrect' : 'overlayWrong')}</div>
      <p className="text-[12.5px] leading-snug text-slate-100">{m(consequenceKey(consequence, mode))}</p>
      {!ok && result.expected && <p className="text-[11.5px] text-rose-200">{m('incorrect', { expected: m(result.expected === 'REJECT' ? 'expectedREJECT' : 'expectedAPPROVE') })}</p>}
      <div className={`text-[20px] font-black tabular-nums ${ok ? 'text-amber-300' : 'text-rose-300'}`} data-testid="workspace-consequence-score">
        {ok ? m('overlayXp', { xp: STAFF_XP_PER_CORRECT }) : m('overlayError', { n: consequence.errors })}
      </div>
      <div className="font-mono text-[10.5px] text-slate-400">{m('statusCode', { code: result.statusCode })}</div>
    </div>
  );
}

function DecisionPanel({ shift, current, onDecide, consequence, mode, m }: { shift: ShiftProgress; current: StaffCase | null; onDecide: (d: StaffDecision) => void; consequence: Consequence | null; mode: WorkspaceMode; m: M }) {
  const accuracy = shift.reviews > 0 ? (shift.correct / shift.reviews) * 100 : 0;
  const met = shift.reviews >= SHIFT_TARGET.reviews && accuracy > SHIFT_TARGET.accuracyPct;
  const progress = Math.min(1, shift.reviews / SHIFT_TARGET.reviews);
  const locked = !current || consequence !== null;
  return (
    <section className="relative flex min-h-0 flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3.5" data-testid="workspace-decision">
      <div className="flex items-center justify-between">
        <Kicker>{m('actionsTitle')}</Kicker>
        <div className="flex gap-1.5 text-[11px] font-semibold tabular-nums">
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-amber-200" data-testid="workspace-xp">
            {m('xpTotal', { xp: shift.xp })}
          </span>
          <span className={`rounded-full px-2 py-0.5 ${shift.errors > 0 ? 'bg-rose-500/15 text-rose-200' : 'bg-slate-800 text-slate-400'}`} data-testid="workspace-errors">
            {m('errorsTotal', { n: shift.errors })}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        <button type="button" disabled={locked} onClick={() => onDecide('APPROVE')} data-testid="workspace-approve" className="rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-3 py-2.5 text-[13px] font-bold text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40">
          {m('approve')}
        </button>
        <button type="button" disabled={locked} onClick={() => onDecide('REJECT')} data-testid="workspace-reject" className="rounded-xl border border-rose-400/50 bg-rose-500/15 px-3 py-2.5 text-[13px] font-bold text-rose-100 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40">
          {m('reject')}
        </button>
      </div>
      <div className="mt-auto rounded-xl border border-slate-800 bg-slate-950/50 p-2.5" data-testid="workspace-shift" data-met={met || undefined}>
        <Kicker>{m('shiftTitle')}</Kicker>
        <div className="mt-1 text-[11.5px] font-medium text-slate-300">{m('shiftTarget', { reviews: SHIFT_TARGET.reviews, acc: SHIFT_TARGET.accuracyPct })}</div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={SHIFT_TARGET.reviews} aria-valuenow={Math.min(shift.reviews, SHIFT_TARGET.reviews)}>
          <div className={`h-full rounded-full transition-[width] duration-500 ${met ? 'bg-emerald-400' : 'bg-sky-400'}`} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-[11px] tabular-nums text-slate-400">
          <span data-testid="workspace-reviews">{m('shiftReviews', { n: shift.reviews, target: SHIFT_TARGET.reviews })}</span>
          <span data-testid="workspace-accuracy" className={shift.reviews > 0 && accuracy <= SHIFT_TARGET.accuracyPct ? 'text-amber-300' : undefined}>
            {m('shiftAccuracy', { pct: shift.reviews > 0 ? `${Math.round(accuracy * 10) / 10}%` : '—' })}
          </span>
          {shift.reviews > 0 && <span>{m('shiftLatency', { sec: Math.round(shift.latencySumSec / shift.reviews) })}</span>}
        </div>
        {met && (
          <div className="mt-2 rounded-lg border border-emerald-400/60 bg-emerald-500/15 px-2 py-1.5 text-center text-[12px] font-bold tracking-wide text-emerald-200" data-testid="workspace-objective-met">
            {m('objectiveMet')}
          </div>
        )}
      </div>
      {consequence && <ConsequenceOverlay consequence={consequence} mode={mode} m={m} />}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header pickers and the desk-switch guard
// ─────────────────────────────────────────────────────────────────────────────

const PICKER = 'max-w-[14rem] truncate rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[12px] font-semibold text-slate-100 transition hover:border-slate-500 focus:border-sky-400 focus:outline-none';

function RolePicker({ role, onPick, m }: { role: StaffRoleId; onPick: (role: StaffRoleId) => void; m: M }) {
  return (
    <select aria-label={m('roleSelectLabel')} value={role} onChange={(e) => onPick(e.target.value as StaffRoleId)} data-testid="workspace-role-select" className={PICKER}>
      {STAFF_ROLES.map((r) => (
        <option key={r} value={r}>
          {`${ROLE_ICON[r]} ${m(k(`role_${r}_title`))}`}
        </option>
      ))}
    </select>
  );
}

function TaskPicker({ role, task, onPick, m }: { role: StaffRoleId; task: StaffTaskNo; onPick: (task: StaffTaskNo) => void; m: M }) {
  return (
    <select aria-label={m('taskSelectLabel')} value={task} onChange={(e) => onPick(Number(e.target.value) as StaffTaskNo)} data-testid="workspace-task-select" className={PICKER}>
      {STAFF_TASKS.map((n) => (
        <option key={n} value={n}>
          {`🎯 ${m('taskOption', { n, title: m(taskTitleKey(role, n)) })}`}
        </option>
      ))}
    </select>
  );
}

export function SwitchDeskDialog({ target, m, onCancel, onConfirm }: { target: StaffRoleId; m: M; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm" data-testid="workspace-switch-backdrop">
      <div role="alertdialog" aria-modal="true" aria-labelledby="workspace-switch-title" aria-describedby="workspace-switch-message" data-testid="workspace-switch-dialog" data-target={target} className="w-full max-w-md rounded-2xl border border-amber-400/40 bg-slate-900 p-5 shadow-2xl">
        <h3 id="workspace-switch-title" className="text-[15px] font-bold text-amber-100">
          {m('switchTitle')}
        </h3>
        <p id="workspace-switch-message" className="mt-2 text-[12.5px] leading-snug text-slate-200">
          {m('switchMessage')}
        </p>
        <p className="mt-2 text-[12px] font-semibold text-sky-200">
          {ROLE_ICON[target]} {m('switchTarget', { role: m(k(`role_${target}_title`)) })}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} data-testid="workspace-switch-cancel" className="rounded-lg border border-slate-600 px-3 py-1.5 text-[12px] font-medium text-slate-200 transition hover:bg-slate-800">
            {m('switchCancel')}
          </button>
          <button type="button" onClick={onConfirm} autoFocus data-testid="workspace-switch-confirm" className="rounded-lg border border-amber-400/60 bg-amber-400 px-3 py-1.5 text-[12px] font-bold text-slate-950 transition hover:bg-amber-300">
            {m('switchConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface AnalystWorkspaceViewProps {
  desk: StationId;
  cases: readonly StaffCase[];
  shift: ShiftProgress;
  initialMode: WorkspaceMode;
  task: StaffTaskNo;
  canAdvance: boolean;
  onClose: () => void;
  onAdvance: () => void;
  /** Decides the head case; returns the result and the role's error count after it. */
  onDecide: (caseId: string, decision: StaffDecision, latencySec: number) => { result: StaffDecisionResult; errors: number };
  /** Instant: another task at the same desk. */
  onTaskChange: (task: StaffTaskNo) => void;
  /** Called only after the learner confirmed the switch dialog. */
  onSwitchRole: (role: StaffRoleId) => void;
}

/** The workspace itself, driven by props (the store-connected modal below feeds it). */
export function AnalystWorkspaceView({ desk, cases, shift, initialMode, task, canAdvance, onClose, onAdvance, onDecide, onTaskChange, onSwitchRole }: AnalystWorkspaceViewProps) {
  const terms = useTerms();
  const m = useMessages(analystWorkspaceMessages);
  const [mode, setMode] = useState<WorkspaceMode>(initialMode);
  const [consequence, setConsequence] = useState<Consequence | null>(null);
  const [pendingRole, setPendingRole] = useState<StaffRoleId | null>(null);
  const role = roleForStation(desk);
  const current = cases[0] ?? null;
  const elapsed = useCaseTimer(consequence ? null : (current?.id ?? null));
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;

  useEffect(() => {
    if (!consequence) return;
    const t = window.setTimeout(() => setConsequence(null), CONSEQUENCE_MS);
    return () => window.clearTimeout(t);
  }, [consequence]);

  const decide = useCallback(
    (d: StaffDecision) => {
      if (!current || !role || consequence || pendingRole) return;
      const { result, errors } = onDecide(current.id, d, elapsedRef.current);
      if (result.ok) setConsequence({ result, role, drill: current.drill, errors });
    },
    [current, role, consequence, pendingRole, onDecide],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.key === 'Escape') {
        if (pendingRole) setPendingRole(null);
        else onClose();
      } else if (pendingRole) return;
      else if (e.key === 'a' || e.key === 'A') decide('APPROVE');
      else if (e.key === 'r' || e.key === 'R') decide('REJECT');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, decide, pendingRole]);

  const pickRole = (next: StaffRoleId): void => setPendingRole(next === role ? null : next);
  const confirmSwitch = (): void => {
    if (!pendingRole) return;
    const next = pendingRole;
    setPendingRole(null);
    setConsequence(null);
    onSwitchRole(next);
  };

  const accent = useMemo(() => DEPARTMENTS[STATIONS[desk].department].accent, [desk]);
  if (!role) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()} data-testid="analyst-workspace-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="analyst-workspace-title" data-testid="analyst-workspace" data-station={desk} data-role={role} data-mode={mode} className="relative flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl" style={{ boxShadow: `0 0 0 1px ${accent}33, 0 24px 60px rgba(0,0,0,0.55)` }}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-2.5 xl:flex-nowrap">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 xl:flex-nowrap">
            <div className="min-w-0 xl:max-w-[18rem]">
              <h2 id="analyst-workspace-title" className="text-[14px] font-bold text-slate-50">
                {m('title')}
              </h2>
              <p className="text-[11px] text-slate-500">
                {m('paused')} · {m('keysHint')}
              </p>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="workspace-pickers">
              <RolePicker role={role} onPick={pickRole} m={m} />
              <TaskPicker role={role} task={task} onPick={onTaskChange} m={m} />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <LanguageToggle variant="globe" testId="workspace-language" />
            <ModeToggle mode={mode} onChange={setMode} m={m} />
            <button type="button" onClick={onClose} data-testid="workspace-close" className="rounded-lg border border-slate-700 px-3 py-1.5 text-[12px] font-medium text-slate-200 transition hover:bg-slate-800">
              {m('close')}
            </button>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(250px,300px)_1fr_minmax(230px,270px)] lg:overflow-hidden">
          <MissionPanel role={role} task={task} mode={mode} m={m} deskName={terms.stationTitle(desk)} />
          <ScenarioCard current={current} queued={Math.max(0, cases.length - 1)} elapsed={elapsed} mode={mode} m={m} onAdvance={onAdvance} canAdvance={canAdvance} showDrill={task === RANDOM_TASK} />
          <DecisionPanel shift={shift} current={current} onDecide={decide} consequence={consequence} mode={mode} m={m} />
        </div>
        {pendingRole && <SwitchDeskDialog target={pendingRole} m={m} onCancel={() => setPendingRole(null)} onConfirm={confirmSwitch} />}
      </div>
    </div>
  );
}

/** The store-connected modal: open while `staffDesk` is set. Cases come from the 28-task matrix. */
export function AnalystWorkspaceModal() {
  const desk = useBankStore((s) => s.staffDesk);
  const role = desk ? roleForStation(desk) : null;
  const shift = useBankStore((s) => (role ? s.staffShift[role] : undefined)) ?? EMPTY_SHIFT;
  const task = useBankStore((s) => s.staffTask);
  const seq = useBankStore((s) => s.staffTaskSeq);
  const close = useBankStore((s) => s.closeStaffDesk);
  const train = useBankStore((s) => s.staffTrain);
  const setTask = useBankStore((s) => s.setStaffTask);
  const switchDesk = useBankStore((s) => s.switchStaffDesk);
  const step = useBankStore((s) => s.step);
  const dayOver = useBankStore((s) => s.view.dayOver);
  const termMode = useBankStore((s) => s.termMode);
  const cases = useMemo(() => (role ? taskDeck(role, task, seq) : []), [role, task, seq]);

  const onDecide = useCallback<AnalystWorkspaceViewProps['onDecide']>(
    (caseId, decision, latencySec) => {
      const result = train(caseId, decision, latencySec, STAFF_SLA_SECONDS);
      const errors = role ? (bankStore.getState().staffShift[role] ?? EMPTY_SHIFT).errors : 0;
      return { result, errors };
    },
    [train, role],
  );
  const onSwitchRole = useCallback((next: StaffRoleId) => switchDesk(ROLE_STATION[next]), [switchDesk]);

  if (!desk || !role) return null;
  return (
    <AnalystWorkspaceView
      key={desk}
      desk={desk}
      cases={cases}
      shift={shift}
      initialMode={termMode === 'expert' ? 'expert' : 'standard'}
      task={task}
      canAdvance={!dayOver}
      onClose={close}
      onAdvance={step}
      onDecide={onDecide}
      onTaskChange={setTask}
      onSwitchRole={onSwitchRole}
    />
  );
}
