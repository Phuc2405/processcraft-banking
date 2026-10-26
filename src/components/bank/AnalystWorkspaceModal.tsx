import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatMoney } from '../../sim/kpis';
import { localizeScenarioText } from '../../sim/scenarios';
import {
  BADGE_ICON,
  BADGE_RULES,
  BADGES,
  careerStanding,
  CAREER_RANKS,
  EMPTY_CAREER,
  type BadgeId,
  type CareerProgress,
  CHALLENGE,
  challengeBonus,
  challengeGrade,
  challengePoints,
  comboMultiplier,
  comboTier,
  RANDOM_TASK,
  tallyAccuracy,
  type ChallengeGrade,
  type ChallengeTally,
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
import { uiStore, useUiStore } from '../../store/uiStore';
import { play, reviewSound } from '../../utils/audioFX';
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

/** Steps in every task procedure. Both modes show all of them: Standard in plain words, Expert with citations and metrics. */
export const SOP_STEPS = 3;

/** The SOP a task shows, grouped by drill: the same 3-step procedure per drill in either register. */
export function sopGroups(role: StaffRoleId, task: StaffTaskNo, mode: WorkspaceMode = 'standard'): { drill: StaffDrillNo; keys: AnalystWorkspaceKey[] }[] {
  const drills: readonly StaffDrillNo[] = task === RANDOM_TASK ? STAFF_DRILLS : [task as StaffDrillNo];
  const register = mode === 'expert' ? 'sopExp' : 'sopStd';
  return drills.map((drill) => ({ drill, keys: Array.from({ length: SOP_STEPS }, (_, i) => k(`task_${role}_${drill}_${register}_${i + 1}`)) }));
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
        <div className="space-y-2" data-testid="workspace-sop" data-sop={mode}>
          <div className={`text-[10.5px] font-semibold uppercase tracking-wider ${expert ? 'text-violet-300' : 'text-sky-300'}`}>{m(expert ? 'sopExpTitle' : 'sopStdTitle')}</div>
          {sopGroups(role, task, mode).map((g) => (
            <div key={g.drill} data-drill={g.drill}>
              {task === RANDOM_TASK && <div className="mb-1 text-[11px] font-semibold text-sky-200">{m('taskOption', { n: g.drill, title: m(taskTitleKey(role, g.drill)) })}</div>}
              <ol className="space-y-1.5">
                {g.keys.map((key, i) => (
                  <li key={key} className={`rounded-lg border bg-slate-950/50 px-2.5 py-1.5 leading-snug text-slate-200 ${expert ? 'border-violet-400/20 text-[11.5px]' : 'border-sky-400/20 text-[12px]'}`}>
                    <div className={`font-mono text-[10px] font-semibold uppercase ${expert ? 'text-violet-300' : 'text-sky-300'}`}>{m('sopStep', { n: i + 1 })}</div>
                    {m(key)}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
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
          {current.amountCents > 0 && (
            <>
              <Kicker>{m('amount')}</Kicker>
              <div className="text-[16px] font-bold tabular-nums text-slate-50" data-testid="workspace-amount">
                {money(current.amountCents)}
              </div>
            </>
          )}
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
  /** Challenge Mode only: the XP this decision scored and the speed bonus inside it. */
  points?: number;
  bonus?: number;
  /** Shift XP this decision booked (combo multiplier included) and the streak after it. */
  xp?: number;
  combo?: number;
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
        {consequence.points !== undefined
          ? m('overlayPoints', { pts: consequence.points > 0 ? `+${consequence.points}` : `−${Math.abs(consequence.points)}` })
          : ok
            ? m('overlayXp', { xp: consequence.xp ?? STAFF_XP_PER_CORRECT })
            : m('overlayError', { n: consequence.errors })}
      </div>
      {consequence.combo !== undefined &&
        (ok ? (
          comboMultiplier(consequence.combo) > 1 && (
            <div className="text-[11.5px] font-bold text-orange-200" data-testid="workspace-consequence-combo">
              {m('overlayCombo', { mult: `x${comboMultiplier(consequence.combo).toFixed(1)}` })}
            </div>
          )
        ) : (
          <div className="text-[11.5px] font-semibold text-rose-200" data-testid="workspace-combo-broken">
            {m('comboBroken')}
          </div>
        ))}
      {consequence.points !== undefined && !!consequence.bonus && <div className="text-[11px] font-semibold text-amber-200">{m('overlayBonus', { bonus: consequence.bonus })}</div>}
      <div className="font-mono text-[10.5px] text-slate-400">{m('statusCode', { code: result.statusCode })}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Time-Attack Challenge Mode
// ─────────────────────────────────────────────────────────────────────────────

/** "02:47" for a number of seconds left. */
export function clockText(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const pctText = (t: ChallengeTally): string => (t.reviews > 0 ? `${Math.round(tallyAccuracy(t) * 10) / 10}%` : '—');
const RULE_VALUES = { base: CHALLENGE.base, bonus: CHALLENGE.bonusMax, window: CHALLENGE.bonusWindowSec, penalty: CHALLENGE.penalty, min: CHALLENGE.durationSec / 60 };

export interface ChallengeState {
  run: { endsAt: number; tally: ChallengeTally } | null;
  finished: ChallengeTally | null;
}

export interface ChallengeControls {
  start: () => void;
  stop: () => void;
  record: (correct: boolean, latencySec: number) => void;
  /** Called on every clock tick while a run is live; ends it at 00:00. */
  tick: () => void;
  dismiss: () => void;
}

/** Seconds left on a running challenge, ticking 4 times a second. */
function useCountdown(run: ChallengeState['run'], tick: () => void): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!run) return;
    setNow(Date.now());
    const t = window.setInterval(() => {
      setNow(Date.now());
      tick();
    }, 250);
    return () => window.clearInterval(t);
  }, [run, tick]);
  return run ? Math.max(0, (run.endsAt - now) / 1000) : CHALLENGE.durationSec;
}

function ChallengeToggle({ running, remainingSec, onStart, onStop, m }: { running: boolean; remainingSec: number; onStart: () => void; onStop: () => void; m: M }) {
  const urgent = running && remainingSec <= 30;
  return (
    <button
      type="button"
      aria-pressed={running}
      onClick={running ? onStop : onStart}
      title={m('challengeHint', RULE_VALUES)}
      data-testid="workspace-challenge"
      data-running={running || undefined}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold tabular-nums transition ${running ? (urgent ? 'border-rose-400/70 bg-rose-500/20 text-rose-100' : 'border-amber-400/70 bg-amber-400/15 text-amber-100') : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'}`}
    >
      {running ? (
        <>
          <span aria-label={m('challengeTimerLabel')} data-testid="workspace-challenge-clock">
            ⏱️ {clockText(remainingSec)}
          </span>
          <span className="text-[11px] opacity-80">{m('challengeStop')}</span>
        </>
      ) : (
        m('challengeToggle')
      )}
    </button>
  );
}

function ChallengeStrip({ tally, remainingSec, m }: { tally: ChallengeTally; remainingSec: number; m: M }) {
  const urgent = remainingSec <= 30;
  return (
    <div className={`rounded-xl border p-2.5 ${urgent ? 'border-rose-400/60 bg-rose-500/10' : 'border-amber-400/50 bg-amber-400/[0.08]'}`} data-testid="workspace-challenge-strip">
      <div className="flex items-center justify-between">
        <Kicker>{m('challengeTitle')}</Kicker>
        <span className={`text-[18px] font-black tabular-nums ${urgent ? 'animate-pulse text-rose-200' : 'text-amber-100'}`} role="timer" aria-label={m('challengeTimerLabel')}>
          {clockText(remainingSec)}
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className={`text-[16px] font-bold tabular-nums ${tally.xp < 0 ? 'text-rose-200' : 'text-amber-200'}`} data-testid="workspace-challenge-score">
          {m('challengeScore', { xp: tally.xp })}
        </span>
        <span className="text-[11px] tabular-nums text-slate-300">{m('challengeLive', { n: tally.reviews, acc: pctText(tally) })}</span>
      </div>
      <div className="mt-1 text-[10.5px] text-slate-400">{m('challengeRules', RULE_VALUES)}</div>
    </div>
  );
}

const GRADE_TONE: Readonly<Record<ChallengeGrade, string>> = {
  S: 'border-amber-300 bg-amber-300/15 text-amber-200',
  A: 'border-emerald-400 bg-emerald-400/15 text-emerald-200',
  B: 'border-sky-400 bg-sky-400/15 text-sky-200',
  C: 'border-orange-400 bg-orange-400/15 text-orange-200',
  F: 'border-rose-500 bg-rose-500/15 text-rose-200',
};

/** The end-of-shift recap a challenge opens at 00:00. */
export function ChallengeScorecard({ tally, m, onAgain, onClose }: { tally: ChallengeTally; m: M; onAgain: () => void; onClose: () => void }) {
  const grade = challengeGrade(tally);
  const stat = (label: string, value: string, testId: string) => (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 text-[20px] font-black tabular-nums text-slate-50" data-testid={testId}>
        {value}
      </div>
    </div>
  );
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" data-testid="workspace-scorecard-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="workspace-scorecard-title" data-testid="workspace-scorecard" data-grade={grade} className="w-full max-w-lg rounded-2xl border border-slate-600 bg-slate-900 p-5 shadow-2xl">
        <h3 id="workspace-scorecard-title" className="text-[17px] font-extrabold text-slate-50">
          {m('scorecardTitle')}
        </h3>
        <p className="mt-0.5 text-[12px] text-slate-400">{m('scorecardSubtitle', { min: CHALLENGE.durationSec / 60 })}</p>
        <div className="mt-4 flex items-center gap-4">
          <div className={`grid h-20 w-20 shrink-0 place-items-center rounded-2xl border-2 text-[44px] font-black ${GRADE_TONE[grade]}`} data-testid="workspace-scorecard-grade" aria-label={`${m('scGrade')}: ${grade}`}>
            {grade}
          </div>
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{m('scGrade')}</div>
            <p className="mt-0.5 text-[13px] leading-snug text-slate-100">{m(k(`grade_${grade}`))}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {stat(m('scReviewed'), String(tally.reviews), 'workspace-scorecard-reviewed')}
          {stat(m('scAccuracy'), pctText(tally), 'workspace-scorecard-accuracy')}
          {stat(m('scNetXp'), String(tally.xp), 'workspace-scorecard-xp')}
        </div>
        <p className="mt-3 text-[11.5px] tabular-nums text-slate-300">{m('scBreakdown', { correct: tally.correct, wrong: tally.reviews - tally.correct, bonus: tally.bonusXp, penalty: tally.penaltyXp })}</p>
        <p className="mt-1 text-[10.5px] text-slate-500">{m('scGradeBands')}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} data-testid="workspace-scorecard-close" className="rounded-lg border border-slate-600 px-3 py-1.5 text-[12px] font-medium text-slate-200 transition hover:bg-slate-800">
            {m('scClose')}
          </button>
          <button type="button" onClick={onAgain} autoFocus data-testid="workspace-scorecard-again" className="rounded-lg border border-amber-400/60 bg-amber-400 px-3 py-1.5 text-[12px] font-bold text-slate-950 transition hover:bg-amber-300">
            {m('scPlayAgain')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Combo multiplier, SOP-violation pulse, sound toggle
// ─────────────────────────────────────────────────────────────────────────────

export function ComboBadge({ combo, m }: { combo: number; m: M }) {
  const tier = comboTier(combo);
  if (tier === 'none') {
    return combo > 0 ? (
      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-300" title={m('comboHint')} data-testid="workspace-combo" data-tier={tier} data-combo={combo}>
        {m('comboStreak', { n: combo })}
      </span>
    ) : null;
  }
  const zone = tier === 'zone';
  return (
    <div
      role="status"
      aria-live="polite"
      title={m('comboHint')}
      data-testid="workspace-combo"
      data-tier={tier}
      data-combo={combo}
      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] font-extrabold tracking-wide ${zone ? 'animate-pulse border-amber-300 bg-amber-400/20 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.55)]' : 'border-orange-400/60 bg-orange-500/15 text-orange-200'}`}
    >
      <span>{m(zone ? 'comboZone' : 'comboHot')}</span>
      <span className="text-[10.5px] font-semibold tabular-nums opacity-80">{m('comboStreak', { n: combo })}</span>
    </div>
  );
}

export function SopViolationPulse({ m }: { m: M }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[25] grid place-items-start justify-center rounded-2xl ring-4 ring-inset ring-rose-500/80" data-testid="workspace-sop-violation">
      <div className="absolute inset-0 animate-pulse rounded-2xl bg-rose-600/20" aria-hidden="true" />
      <div role="alert" className="relative mt-16 rounded-xl border-2 border-rose-400 bg-rose-950/95 px-5 py-2 text-[15px] font-black tracking-wider text-rose-100 shadow-[0_0_30px_rgba(244,63,94,0.6)]">
        {m('sopViolation')}
      </div>
    </div>
  );
}

function SoundToggle({ m }: { m: M }) {
  const on = useUiStore((s) => s.soundOn);
  const label = m(on ? 'soundOn' : 'soundOff');
  return (
    <button type="button" aria-pressed={on} aria-label={label} title={label} onClick={() => uiStore.getState().setSoundOn(!on)} data-testid="workspace-sound" data-on={on || undefined} className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[13px] transition hover:bg-slate-800">
      <span aria-hidden="true">{on ? '🔊' : '🔇'}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Career rank card, badge collection and the unlock celebration
// ─────────────────────────────────────────────────────────────────────────────

export function CareerCard({ career, m }: { career: CareerProgress; m: M }) {
  const st = careerStanding(career.xp);
  const next = CAREER_RANKS[CAREER_RANKS.findIndex((r) => r.id === st.rank) + 1];
  return (
    <div className="flex min-w-[13rem] items-center gap-2.5 rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-400/10 to-slate-900 px-2.5 py-1.5" title={m('careerHint')} data-testid="workspace-career" data-rank={st.rank} data-level={st.level}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-[20px] ring-1 ring-amber-400/50" aria-hidden="true">
        {st.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="rounded bg-amber-400 px-1.5 text-[10.5px] font-black tabular-nums text-slate-950" data-testid="workspace-career-level">
            {m('careerLevel', { n: st.level })}
          </span>
          <span className="truncate text-[12px] font-bold text-amber-100" data-testid="workspace-career-rank">
            {m(k(`rank_${st.rank}`))}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-label={m('careerKicker')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(st.rankProgress * 100)}>
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-[width] duration-500" style={{ width: `${Math.round(st.rankProgress * 100)}%` }} />
        </div>
        <div className="mt-0.5 text-[10px] tabular-nums text-slate-400" data-testid="workspace-career-next">
          {st.nextRankXp !== null && next ? m('careerNext', { xp: st.xp.toLocaleString('en-US'), next: st.nextRankXp.toLocaleString('en-US'), rank: m(k(`rank_${next.id}`)) }) : m('careerTop', { xp: st.xp.toLocaleString('en-US') })}
        </div>
      </div>
    </div>
  );
}

/** How far the learner is toward a badge, as `{n}` against its target. */
export function badgeProgress(id: BadgeId, c: CareerProgress): { n: number | string; target: number } {
  switch (id) {
    case 'ekycHawkEye':
      return { n: Math.min(c.ekycStreak, BADGE_RULES.ekycStreak), target: BADGE_RULES.ekycStreak };
    case 'amlIronShield':
      return { n: Math.min(c.shift.amlBlockBest, BADGE_RULES.amlBlocks), target: BADGE_RULES.amlBlocks };
    case 'slaMaster':
      return { n: c.shift.reviews > 0 ? (c.shift.latencySumSec / c.shift.reviews).toFixed(1) : '—', target: BADGE_RULES.slaAvgSec };
    case 'perfectAuditor':
      return { n: Math.min(c.perfectExpertShifts, BADGE_RULES.auditorShifts), target: BADGE_RULES.auditorShifts };
  }
}

const badgeTarget = (id: BadgeId): number => ({ ekycHawkEye: BADGE_RULES.ekycStreak, amlIronShield: BADGE_RULES.amlBlocks, slaMaster: BADGE_RULES.slaAvgSec, perfectAuditor: BADGE_RULES.auditorShifts })[id];

function BadgesButton({ unlocked, onOpen, m }: { unlocked: number; onOpen: () => void; m: M }) {
  return (
    <button type="button" onClick={onOpen} data-testid="workspace-badges" className="flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5 text-[12px] font-semibold text-amber-100 transition hover:bg-amber-400/20">
      {m('badgesButton')}
      <span className="rounded-full bg-amber-400 px-1.5 text-[10.5px] font-black tabular-nums text-slate-950">
        {unlocked}/{BADGES.length}
      </span>
    </button>
  );
}

export function BadgeDrawer({ career, m, onClose }: { career: CareerProgress; m: M; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()} data-testid="workspace-badges-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="workspace-badges-title" data-testid="workspace-badges-drawer" className="w-full max-w-2xl rounded-2xl border border-amber-400/40 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="workspace-badges-title" className="text-[17px] font-extrabold text-amber-100">
              {m('badgesTitle')}
            </h3>
            <p className="mt-0.5 text-[12px] text-slate-400">{m('badgesCount', { n: career.badges.length, total: BADGES.length })}</p>
          </div>
          <button type="button" onClick={onClose} autoFocus data-testid="workspace-badges-close" className="rounded-lg border border-slate-600 px-3 py-1.5 text-[12px] font-medium text-slate-200 transition hover:bg-slate-800">
            {m('badgesClose')}
          </button>
        </div>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {BADGES.map((id) => {
            const on = career.badges.includes(id);
            const p = badgeProgress(id, career);
            return (
              <div key={id} data-badge={id} data-unlocked={on || undefined} className={`flex gap-3 rounded-xl border p-3 ${on ? 'border-amber-300/70 bg-amber-400/10 shadow-[0_0_18px_rgba(251,191,36,0.25)]' : 'border-slate-700 bg-slate-950/60'}`}>
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-[26px] ${on ? 'bg-amber-400/20 ring-2 ring-amber-300' : 'bg-slate-800 opacity-50 grayscale'}`} aria-hidden="true">
                  {BADGE_ICON[id]}
                </span>
                <div className="min-w-0">
                  <div className={`text-[13.5px] font-bold ${on ? 'text-amber-100' : 'text-slate-300'}`}>{m(k(`badge_${id}_name`))}</div>
                  <div className={`text-[10.5px] font-semibold ${on ? 'text-emerald-300' : 'text-slate-500'}`}>{m(on ? 'badgeUnlocked' : 'badgeLocked')}</div>
                  <p className="mt-1 text-[11.5px] leading-snug text-slate-300">{m(k(`badge_${id}_req`), { target: p.target })}</p>
                  {!on && <p className="mt-1 text-[10.5px] tabular-nums text-sky-300">{m(k(`badge_${id}_progress`), p)}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function BadgeUnlockModal({ badge, m, onClose }: { badge: BadgeId; m: M; onClose: () => void }) {
  const target = badgeTarget(badge);
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/85 p-4 backdrop-blur-sm" data-testid="workspace-unlock-backdrop">
      <div role="alertdialog" aria-modal="true" aria-labelledby="workspace-unlock-title" aria-describedby="workspace-unlock-message" data-testid="workspace-unlock" data-badge={badge} className="w-full max-w-sm rounded-2xl border-2 border-amber-300/80 bg-gradient-to-b from-amber-950/80 to-slate-900 p-6 text-center shadow-[0_0_60px_rgba(251,191,36,0.35)]">
        <div className="text-[12px] font-black uppercase tracking-[0.2em] text-amber-300">{m('unlockKicker')}</div>
        <div className="pc-badge-glow mx-auto mt-4 grid h-24 w-24 place-items-center rounded-full bg-amber-400/20 text-[52px] ring-4 ring-amber-300" aria-hidden="true">
          {BADGE_ICON[badge]}
        </div>
        <h3 id="workspace-unlock-title" className="mt-4 text-[20px] font-extrabold text-amber-50">
          {m(k(`badge_${badge}_name`))}
        </h3>
        <p id="workspace-unlock-message" className="mt-2 text-[12.5px] leading-snug text-slate-200">
          {m(k(`badge_${badge}_toast`), { target })}
        </p>
        <button type="button" onClick={onClose} autoFocus data-testid="workspace-unlock-close" className="mt-5 rounded-lg border border-amber-400/60 bg-amber-400 px-4 py-1.5 text-[13px] font-bold text-slate-950 transition hover:bg-amber-300">
          {m('unlockClose')}
        </button>
      </div>
    </div>
  );
}

function DecisionPanel({
  shift,
  current,
  onDecide,
  consequence,
  mode,
  m,
  challenge,
}: {
  shift: ShiftProgress;
  current: StaffCase | null;
  onDecide: (d: StaffDecision) => void;
  consequence: Consequence | null;
  mode: WorkspaceMode;
  m: M;
  challenge: { tally: ChallengeTally; remainingSec: number } | null;
}) {
  const accuracy = shift.reviews > 0 ? (shift.correct / shift.reviews) * 100 : 0;
  const met = shift.reviews >= SHIFT_TARGET.reviews && accuracy > SHIFT_TARGET.accuracyPct;
  const progress = Math.min(1, shift.reviews / SHIFT_TARGET.reviews);
  const locked = !current || consequence !== null;
  return (
    <section className="relative flex min-h-0 flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3.5" data-testid="workspace-decision">
      <div className="flex items-center justify-between">
        <Kicker>{m('actionsTitle')}</Kicker>
        <div className={`flex gap-1.5 text-[11px] font-semibold tabular-nums ${challenge ? 'hidden' : ''}`}>
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-amber-200" data-testid="workspace-xp">
            {m('xpTotal', { xp: shift.xp })}
          </span>
          <span className={`rounded-full px-2 py-0.5 ${shift.errors > 0 ? 'bg-rose-500/15 text-rose-200' : 'bg-slate-800 text-slate-400'}`} data-testid="workspace-errors">
            {m('errorsTotal', { n: shift.errors })}
          </span>
        </div>
      </div>
      {challenge && <ChallengeStrip tally={challenge.tally} remainingSec={challenge.remainingSec} m={m} />}
      <ComboBadge combo={shift.comboCount ?? 0} m={m} />
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
  /** Decides the head case; returns the result, the role's error count, and the XP booked and streak after it. */
  onDecide: (caseId: string, decision: StaffDecision, latencySec: number, expert: boolean) => { result: StaffDecisionResult; errors: number; xp?: number; combo?: number };
  /** Instant: another task at the same desk. */
  onTaskChange: (task: StaffTaskNo) => void;
  /** Called only after the learner confirmed the switch dialog. */
  onSwitchRole: (role: StaffRoleId) => void;
  /** The Time-Attack challenge, held by the caller so it outlives remounts. */
  challenge?: ChallengeState;
  challengeControls?: ChallengeControls;
  /** Lifetime career (XP, badges) and the badges waiting for their celebration. */
  career?: CareerProgress;
  badgeUnlocks?: readonly BadgeId[];
  onDismissBadgeUnlock?: () => void;
}

const NO_CHALLENGE: ChallengeState = { run: null, finished: null };
const NO_UNLOCKS: readonly BadgeId[] = [];
const NO_CONTROLS: ChallengeControls = { start: () => undefined, stop: () => undefined, record: () => undefined, tick: () => undefined, dismiss: () => undefined };

/** The workspace itself, driven by props (the store-connected modal below feeds it). */
export function AnalystWorkspaceView({
  desk,
  cases,
  shift,
  initialMode,
  task,
  canAdvance,
  onClose,
  onAdvance,
  onDecide,
  onTaskChange,
  onSwitchRole,
  challenge = NO_CHALLENGE,
  challengeControls: cc = NO_CONTROLS,
  career = EMPTY_CAREER,
  badgeUnlocks = NO_UNLOCKS,
  onDismissBadgeUnlock = () => undefined,
}: AnalystWorkspaceViewProps) {
  const [badgesOpen, setBadgesOpen] = useState(false);
  const unlock = badgeUnlocks[0] ?? null;
  const terms = useTerms();
  const m = useMessages(analystWorkspaceMessages);
  const [mode, setMode] = useState<WorkspaceMode>(initialMode);
  const [consequence, setConsequence] = useState<Consequence | null>(null);
  const [pendingRole, setPendingRole] = useState<StaffRoleId | null>(null);
  const remainingSec = useCountdown(challenge.run, cc.tick);
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
      if (!current || !role || consequence || pendingRole || challenge.finished || unlock || badgesOpen) return;
      const latency = elapsedRef.current;
      const { result, errors, xp, combo } = onDecide(current.id, d, latency, mode === 'expert');
      if (!result.ok) return;
      const streak = combo ?? (result.correct ? (shift.comboCount ?? 0) + 1 : 0);
      if (uiStore.getState().soundOn) play(reviewSound(result.correct, streak));
      if (challenge.run) {
        cc.record(result.correct, latency);
        setConsequence({ result, role, drill: current.drill, errors, xp, combo: streak, points: challengePoints(result.correct, latency), bonus: result.correct ? challengeBonus(latency) : 0 });
      } else setConsequence({ result, role, drill: current.drill, errors, xp, combo: streak });
    },
    [current, role, consequence, pendingRole, onDecide, challenge, cc, shift.comboCount, mode, unlock, badgesOpen],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.key === 'Escape') {
        if (unlock) onDismissBadgeUnlock();
        else if (badgesOpen) setBadgesOpen(false);
        else if (challenge.finished) cc.dismiss();
        else if (pendingRole) setPendingRole(null);
        else onClose();
      } else if (pendingRole || challenge.finished || unlock || badgesOpen) return;
      else if (e.key === 'a' || e.key === 'A') decide('APPROVE');
      else if (e.key === 'r' || e.key === 'R') decide('REJECT');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, decide, pendingRole, challenge, cc, unlock, badgesOpen, onDismissBadgeUnlock]);

  useEffect(() => {
    if (unlock && uiStore.getState().soundOn) play('badgeUnlock');
  }, [unlock]);

  const pickRole = (next: StaffRoleId): void => setPendingRole(next === role ? null : next);
  const confirmSwitch = (): void => {
    if (!pendingRole) return;
    const next = pendingRole;
    setPendingRole(null);
    setConsequence(null);
    onSwitchRole(next);
  };

  const accent = useMemo(() => DEPARTMENTS[STATIONS[desk].department].accent, [desk]);
  const tier = comboTier(shift.comboCount ?? 0);
  if (!role) return null;
  const glow = tier === 'zone' ? '0 0 0 2px rgba(251,191,36,0.85), 0 0 36px rgba(251,191,36,0.45), 0 24px 60px rgba(0,0,0,0.55)' : `0 0 0 1px ${accent}33, 0 24px 60px rgba(0,0,0,0.55)`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()} data-testid="analyst-workspace-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="analyst-workspace-title" data-testid="analyst-workspace" data-station={desk} data-role={role} data-mode={mode} data-challenge={challenge.run ? 'running' : undefined} data-combo-tier={tier} className={`relative flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border bg-slate-950 shadow-2xl transition-shadow duration-500 ${tier === 'zone' ? 'border-amber-300/80' : 'border-slate-700'}`} style={{ boxShadow: glow }}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-2.5 xl:flex-nowrap">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 xl:flex-nowrap">
            <CareerCard career={career} m={m} />
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
            <BadgesButton unlocked={career.badges.length} onOpen={() => setBadgesOpen(true)} m={m} />
            <SoundToggle m={m} />
            <LanguageToggle variant="globe" testId="workspace-language" />
            <ModeToggle mode={mode} onChange={setMode} m={m} />
            <ChallengeToggle running={challenge.run !== null} remainingSec={remainingSec} onStart={cc.start} onStop={cc.stop} m={m} />
            <button type="button" onClick={onClose} data-testid="workspace-close" className="rounded-lg border border-slate-700 px-3 py-1.5 text-[12px] font-medium text-slate-200 transition hover:bg-slate-800">
              {m('close')}
            </button>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(250px,300px)_1fr_minmax(230px,270px)] lg:overflow-hidden">
          <MissionPanel role={role} task={task} mode={mode} m={m} deskName={terms.stationTitle(desk)} />
          <ScenarioCard current={current} queued={Math.max(0, cases.length - 1)} elapsed={elapsed} mode={mode} m={m} onAdvance={onAdvance} canAdvance={canAdvance} showDrill={task === RANDOM_TASK} />
          <DecisionPanel shift={shift} current={current} onDecide={decide} consequence={consequence} mode={mode} m={m} challenge={challenge.run ? { tally: challenge.run.tally, remainingSec } : null} />
        </div>
        {consequence && !consequence.result.correct && <SopViolationPulse m={m} />}
        {challenge.finished && <ChallengeScorecard tally={challenge.finished} m={m} onAgain={cc.start} onClose={cc.dismiss} />}
        {badgesOpen && <BadgeDrawer career={career} m={m} onClose={() => setBadgesOpen(false)} />}
        {unlock && <BadgeUnlockModal key={unlock} badge={unlock} m={m} onClose={onDismissBadgeUnlock} />}
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
  const career = useBankStore((s) => s.career);
  const badgeUnlocks = useBankStore((s) => s.badgeUnlocks);
  const dismissBadgeUnlock = useBankStore((s) => s.dismissBadgeUnlock);
  const setTask = useBankStore((s) => s.setStaffTask);
  const switchDesk = useBankStore((s) => s.switchStaffDesk);
  const step = useBankStore((s) => s.step);
  const dayOver = useBankStore((s) => s.view.dayOver);
  const termMode = useBankStore((s) => s.termMode);
  const cases = useMemo(() => (role ? taskDeck(role, task, seq) : []), [role, task, seq]);
  const run = useBankStore((s) => s.staffChallenge);
  const finished = useBankStore((s) => s.staffChallengeResult);
  const challenge = useMemo<ChallengeState>(() => ({ run, finished }), [run, finished]);
  const startChallenge = useBankStore((s) => s.startChallenge);
  const stopChallenge = useBankStore((s) => s.stopChallenge);
  const recordChallenge = useBankStore((s) => s.recordChallenge);
  const tickChallenge = useBankStore((s) => s.tickChallenge);
  const dismissChallenge = useBankStore((s) => s.dismissChallengeResult);
  const challengeControls = useMemo<ChallengeControls>(
    () => ({ start: () => startChallenge(), stop: stopChallenge, record: (c, l) => recordChallenge(c, l), tick: () => tickChallenge(), dismiss: dismissChallenge }),
    [startChallenge, stopChallenge, recordChallenge, tickChallenge, dismissChallenge],
  );

  const onDecide = useCallback<AnalystWorkspaceViewProps['onDecide']>(
    (caseId, decision, latencySec, expert) => {
      const before = role ? (bankStore.getState().staffShift[role] ?? EMPTY_SHIFT) : EMPTY_SHIFT;
      const result = train(caseId, decision, latencySec, STAFF_SLA_SECONDS, expert);
      const after = role ? (bankStore.getState().staffShift[role] ?? EMPTY_SHIFT) : EMPTY_SHIFT;
      return { result, errors: after.errors, xp: after.xp - before.xp, combo: after.comboCount };
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
      challenge={challenge}
      challengeControls={challengeControls}
      career={career}
      badgeUnlocks={badgeUnlocks}
      onDismissBadgeUnlock={dismissBadgeUnlock}
    />
  );
}
