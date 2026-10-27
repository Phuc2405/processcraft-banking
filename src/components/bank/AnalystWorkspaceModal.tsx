import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
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
  incidentClockRate,
  incidentRole,
  incidentRules,
  incidentSlaSeconds,
  isAutomatedDesk,
  maskedFields,
  type ActiveIncident,
  RANDOM_TASK,
  RETAIL_DESK,
  RETAIL_TASK,
  WORKSPACE_TASKS,
  GL_ACCOUNTS,
  GL_CODE,
  ATM_FLEET_LOW_CENTS,
  caseJournalLines,
  ledgerSummary,
  naturalBalance,
  openingLedger,
  retailKpis,
  type GlAccount,
  type GlSide,
  type JournalEntry,
  type LedgerLine,
  type RetailKpis,
  type RetailLedger,
  type RetailScenarioId,
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
import { bankStore, EMPTY_SHIFT, useBankStore, type AuditEntry, type ShiftProgress } from '../../store/bankStore';
import { uiStore, useUiStore } from '../../store/uiStore';
import { play, reviewSound } from '../../utils/audioFX';
import { useLocale, useMessages, type Locale, type Translate } from '../../utils/i18nHelper';
import { analystWorkspaceMessages, PERSONAS, type AnalystWorkspaceKey } from './analystWorkspace.messages';
import { InfoTip } from './InfoTip';
import { LanguageToggle } from '../shell/LanguageToggle';
import { useTerms } from './useTerms';
import { glossText, useGlossary, type Glossary, type ViewMode } from './codeGlossary';

/**
 * Phase 8 Step 2: the Staff Roleplay Workspace, a scenario-driven review desk in two registers.
 *
 *   ⌂  Header: desk picker (switching desks asks first, then restarts at Task 1), task picker (instant), language, complexity.
 *   A  Mission brief, regulatory reference (Expert), the current task of the 28-task matrix (or the retail queue) and its SOP.
 *   B  The 4-part scenario card: persona & story, trigger context, highlighted payload tags, risk & benefit analysis.
 *   C  Approve / Reject, a 2-second consequence overlay (+XP or an error), and the shift objective.
 *
 * Decisions go through useBankStore.staffTrain, which grades the task case against its SOP and books the shift. A retail-operations
 * decision also posts its double-entry journal to the core ledger, shown in the 📒 balance sheet.
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

/** One block of a task's SOP: a drill of the matrix, or a retail scenario of the desk. */
export interface SopGroup {
  drill?: StaffDrillNo;
  retail?: RetailScenarioId;
  keys: AnalystWorkspaceKey[];
}

/** The SOP a task shows, grouped by drill (or by retail scenario): the same 3-step procedure per group in either register. */
export function sopGroups(role: StaffRoleId, task: StaffTaskNo, mode: WorkspaceMode = 'standard'): SopGroup[] {
  const register = mode === 'expert' ? 'sopExp' : 'sopStd';
  const steps = (prefix: string): AnalystWorkspaceKey[] => Array.from({ length: SOP_STEPS }, (_, i) => k(`${prefix}_${register}_${i + 1}`));
  if (task === RETAIL_TASK) return RETAIL_DESK[role].map((retail) => ({ retail, keys: steps(`retail_${retail}`) }));
  const drills: readonly StaffDrillNo[] = task === RANDOM_TASK ? STAFF_DRILLS : [task as StaffDrillNo];
  return drills.map((drill) => ({ drill, keys: steps(`task_${role}_${drill}`) }));
}

/** Every SOP line a task shows in a mode, in order. */
export const sopKeys = (role: StaffRoleId, task: StaffTaskNo, mode: WorkspaceMode = 'standard'): AnalystWorkspaceKey[] => sopGroups(role, task, mode).flatMap((g) => g.keys);

export type RiskKind = 'approve' | 'reject' | 'benefit';

/** A risk/benefit card: specific to the retail scenario or the drill on training cases, the desk's generic card on live-queue cases. */
export const riskKey = (role: StaffRoleId, drill: StaffDrillNo | undefined, kind: RiskKind, mode: WorkspaceMode, retail?: RetailScenarioId): AnalystWorkspaceKey =>
  k(retail ? `risk_retail_${retail}_${kind}${suffix(mode)}` : drill ? `risk_${role}_t${drill}_${kind}${suffix(mode)}` : `risk_${role}_${kind}${suffix(mode)}`);

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

/** The Basic / Advanced view of the ledger and the audit report: plain words, or the exact codes with their meaning on hover. */
export function ViewModeToggle({ view, onChange, testId }: { view: ViewMode; onChange: (view: ViewMode) => void; testId: string }) {
  const { g } = useGlossary();
  const option = (value: ViewMode, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={view === value}
      onClick={() => onChange(value)}
      title={g(value === 'basic' ? 'viewBasicHint' : 'viewAdvancedHint')}
      data-testid={`${testId}-${value}`}
      className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition ${view === value ? (value === 'advanced' ? 'bg-violet-500 text-white' : 'bg-sky-400 text-slate-950') : 'text-slate-300 hover:bg-slate-800'}`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex shrink-0 items-center gap-1.5" data-testid={testId} data-view={view}>
      <span className="whitespace-nowrap text-[11px] font-semibold text-slate-400">{g('viewLabel')}:</span>
      <div role="radiogroup" aria-label={g('viewLabel')} className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
        {option('basic', g('viewBasic'))}
        {option('advanced', g('viewAdvanced'))}
      </div>
    </div>
  );
}

/** A raw code that never breaks mid-word and explains itself on hover (when the glossary knows it). */
function Code({ code, gl, className = '' }: { code: string; gl: Glossary; className?: string }) {
  const meaning = gl.explain(code);
  return (
    <span className={`whitespace-nowrap ${meaning ? 'cursor-help' : ''} ${className}`} title={meaning ? `${code}: ${meaning}` : undefined} data-code={code}>
      {code}
    </span>
  );
}

/** The audit preview's zoom steps: 75% to 150%. */
export const PREVIEW_ZOOMS = [0.75, 0.9, 1, 1.1, 1.25, 1.5] as const;
export const nextZoom = (z: number, dir: 1 | -1): number => {
  const i = PREVIEW_ZOOMS.findIndex((s) => Math.abs(s - z) < 1e-6);
  return PREVIEW_ZOOMS[Math.min(PREVIEW_ZOOMS.length - 1, Math.max(0, (i < 0 ? 2 : i) + dir))]!;
};

function ZoomBar({ zoom, onZoom, testId }: { zoom: number; onZoom: (z: number) => void; testId: string }) {
  const { g } = useGlossary();
  const btn = 'whitespace-nowrap rounded-md border border-slate-600 bg-slate-900 px-2.5 py-1 text-[11.5px] font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div role="toolbar" aria-label={g('zoomLabel')} className="flex shrink-0 items-center gap-1.5" data-testid={testId} data-zoom={zoom}>
      <button type="button" onClick={() => onZoom(nextZoom(zoom, -1))} disabled={zoom <= PREVIEW_ZOOMS[0]} data-testid={`${testId}-out`} className={btn}>
        {g('zoomOut')}
      </button>
      <button type="button" onClick={() => onZoom(1)} title={g('zoomResetHint')} aria-live="polite" data-testid={`${testId}-reset`} className={`${btn} min-w-[4.5rem] tabular-nums`}>
        🔍 {Math.round(zoom * 100)}%
      </button>
      <button type="button" onClick={() => onZoom(nextZoom(zoom, 1))} disabled={zoom >= PREVIEW_ZOOMS[PREVIEW_ZOOMS.length - 1]!} data-testid={`${testId}-in`} className={btn}>
        {g('zoomIn')}
      </button>
    </div>
  );
}

/** Select: the preview's text can be highlighted and copied. Pan: a left-button drag scrolls the preview instead. */
export type PointerMode = 'select' | 'pan';

function PointerModeToggle({ mode, onChange, testId }: { mode: PointerMode; onChange: (mode: PointerMode) => void; testId: string }) {
  const { g } = useGlossary();
  const option = (value: PointerMode, label: string, hint: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      onClick={() => onChange(value)}
      title={hint}
      data-testid={`${testId}-${value}`}
      className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition ${mode === value ? 'bg-sky-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
    >
      {label}
    </button>
  );
  return (
    <div role="radiogroup" aria-label={g('pointerLabel')} className="flex shrink-0 rounded-lg border border-slate-700 bg-slate-900 p-0.5" data-testid={testId} data-mode={mode}>
      {option('select', g('pointerSelect'), g('pointerSelectHint'))}
      {option('pan', g('pointerPan'), g('pointerPanHint'))}
    </div>
  );
}

/** Where a drag that started at `from` (pointer and scroll offset) leaves the scroll offset: the content follows the pointer. */
export const dragScrollTo = (from: { x: number; y: number; left: number; top: number }, x: number, y: number): { left: number; top: number } => ({
  left: from.left - (x - from.x),
  top: from.top - (y - from.y),
});

/**
 * Left-button drag-to-scroll on a native scroll container, while `enabled`. It moves scrollLeft/scrollTop only, so the wheel,
 * two-finger touchpad scrolling and the scrollbars keep working in both modes. Returns whether a drag is in progress.
 */
function useDragScroll(ref: RefObject<HTMLElement>, enabled: boolean): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let from: { x: number; y: number; left: number; top: number; id: number } | null = null;
    const down = (e: PointerEvent): void => {
      // Mouse and pen only, left button only; touch already scrolls natively.
      if (e.button !== 0 || e.pointerType === 'touch') return;
      from = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, id: e.pointerId };
      el.setPointerCapture(e.pointerId);
      setDragging(true);
      e.preventDefault();
    };
    const move = (e: PointerEvent): void => {
      if (!from || e.pointerId !== from.id) return;
      const to = dragScrollTo(from, e.clientX, e.clientY);
      el.scrollLeft = to.left;
      el.scrollTop = to.top;
    };
    const up = (e: PointerEvent): void => {
      if (!from || e.pointerId !== from.id) return;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      from = null;
      setDragging(false);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setDragging(false);
    };
  }, [ref, enabled]);
  return dragging;
}

/**
 * Scales a fixed-width page with `transform: scale()`. A transform does not change layout, so the outer box takes the scaled
 * size (measured from the page) and the scrolling viewport around it scrolls exactly as far as the visible page reaches.
 */
function ZoomFrame({ zoom, width, children }: { zoom: number; width: number; children: ReactNode }) {
  const page = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const el = page.current;
    if (!el) return;
    setHeight(el.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="mx-auto transition-[width,height] duration-150 ease-out" style={{ width: width * zoom, height: height === null ? undefined : height * zoom }} data-testid="zoom-frame">
      <div ref={page} className="transition-transform duration-150 ease-out" style={{ width, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel A
// ─────────────────────────────────────────────────────────────────────────────

function MissionPanel({ role, task, mode, m, deskName, sla = STAFF_SLA_SECONDS }: { role: StaffRoleId; task: StaffTaskNo; mode: WorkspaceMode; m: M; deskName: string; sla?: number }) {
  const expert = mode === 'expert';
  const gl = useGlossary();
  return (
    <section className="flex min-h-0 min-w-[240px] flex-col gap-3 overflow-y-auto whitespace-normal break-normal rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 [overflow-wrap:break-word]" data-testid="workspace-mission">
      <div>
        <Kicker>{m('missionBrief')}</Kicker>
        <h3 className="mt-1 flex items-center gap-2 text-[15px] font-bold text-slate-50" data-testid="workspace-role">
          <span aria-hidden="true">{ROLE_ICON[role]}</span>
          {m(k(`role_${role}_title`))}
        </h3>
        <div className="text-[11px] text-sky-300/90">{deskName}</div>
        <p className="mt-2 text-[12px] leading-snug text-slate-300" title={gl.gloss(m(k(expert ? `role_${role}_brief` : `role_${role}_briefStd`)))} data-testid="workspace-brief">
          {m(k(expert ? `role_${role}_brief` : `role_${role}_briefStd`))}
        </p>
        <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${expert ? 'border-rose-400/40 bg-rose-400/10 text-rose-200' : 'border-amber-400/40 bg-amber-400/10 text-amber-200'}`} data-testid="workspace-sla">
          {m(expert ? 'slaTargetExp' : 'slaTarget', { sec: sla })}
        </div>
        {expert && (
          <div className="mt-2 rounded-lg border border-violet-400/30 bg-violet-500/10 px-2.5 py-1.5" data-testid="workspace-reg">
            <Kicker>{m('regTitle')}</Kicker>
            <p className="mt-0.5 font-mono text-[10.5px] leading-snug text-violet-200" title={gl.gloss(m(k(`role_${role}_reg`)))}>
              {m(k(`role_${role}_reg`))}
            </p>
          </div>
        )}
      </div>
      <div className="rounded-lg border border-sky-400/30 bg-sky-400/[0.06] px-2.5 py-2" data-testid="workspace-task" data-task={task}>
        <Kicker>{m('taskTitle')}</Kicker>
        <div className="mt-0.5 text-[13px] font-semibold text-sky-100">{m('taskOption', { n: task, title: m(taskTitleKey(role, task)) })}</div>
        {task === RANDOM_TASK && <p className="mt-1 text-[11px] leading-snug text-slate-400">{m('taskRandomNote')}</p>}
        {task === RETAIL_TASK && <p className="mt-1 text-[11px] leading-snug text-slate-400">{m('taskRetailNote')}</p>}
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
            <div key={g.retail ?? g.drill} data-drill={g.drill} data-retail={g.retail}>
              {task === RANDOM_TASK && g.drill && <div className="mb-1 text-[11px] font-semibold text-sky-200">{m('taskOption', { n: g.drill, title: m(taskTitleKey(role, g.drill)) })}</div>}
              {g.retail && <div className="mb-1 text-[11px] font-semibold text-emerald-200">{m(k(`retail_${g.retail}_title`))}</div>}
              <ol className="space-y-1.5">
                {g.keys.map((key, i) => (
                  <li key={key} title={gl.gloss(m(key))} className={`rounded-lg border bg-slate-950/50 px-2.5 py-1.5 leading-snug text-slate-200 ${expert ? 'border-violet-400/20 text-[11.5px]' : 'border-sky-400/20 text-[12px]'}`}>
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
// Decision Support Engine / Risk Advisory
// ─────────────────────────────────────────────────────────────────────────────

export type AdviceAction = 'approve' | 'reject' | 'freeze' | 'escalate';
export const ADVICE_ACTIONS: readonly AdviceAction[] = ['approve', 'reject', 'freeze', 'escalate'];

export interface AdviceDriver {
  /** `driver_<name>` in analystWorkspace.messages.ts. */
  key: AnalystWorkspaceKey;
  tone: 'breach' | 'alert' | 'info';
  /** The payload field a generic driver names. */
  field?: string;
  /** The ledger account a posting driver names. */
  gl?: GlAccount;
  n?: number;
}

export interface Advice {
  action: AdviceAction;
  /** 0-100: how much of the case's evidence the engine could verify and that points the same way. */
  confidence: number;
  /** The 2-3 strongest signals, breaches first. */
  drivers: AdviceDriver[];
}

/** Below this confidence the engine will not recommend an approval: it escalates for a manual check. */
export const ESCALATE_BELOW_PCT = 70;
const ADVICE_DRIVERS = { min: 2, max: 3 } as const;

const linesFor = (c: StaffCase, d: StaffDecision): readonly LedgerLine[] => (c.retail ? (d === 'APPROVE' ? c.retail.approve : c.retail.reject) : caseJournalLines(c, d));

/**
 * The engine's read of a case, from what the card itself shows: a visible SOP breach is decisive (reject, or freeze when the
 * rejection moves the funds to frozen assets); otherwise confidence is the share of fields verified clean, an operational alert
 * counting half and a field hidden by an incident not at all, and below ESCALATE_BELOW_PCT the engine escalates.
 */
export function adviseCase(c: StaffCase, masked: ReadonlySet<string> = NONE_MASKED): Advice {
  const visible = c.fields.filter((f) => !masked.has(f.key));
  const hidden = c.fields.length - visible.length;
  const breaches = visible.filter((f) => f.flag);
  const alerts = visible.filter((f) => f.alert && !f.flag);
  if (breaches.length) {
    const action: AdviceAction = linesFor(c, 'REJECT').some((l) => l.gl === 'FROZEN_ASSETS') ? 'freeze' : 'reject';
    return { action, confidence: Math.max(ESCALATE_BELOW_PCT, 100 - 10 * hidden), drivers: adviceDrivers(c, breaches, alerts, hidden, action) };
  }
  const confidence = Math.round((100 * (visible.length - 0.5 * alerts.length)) / Math.max(1, c.fields.length));
  const action: AdviceAction = confidence < ESCALATE_BELOW_PCT ? 'escalate' : 'approve';
  return { action, confidence, drivers: adviceDrivers(c, breaches, alerts, hidden, action) };
}

function adviceDrivers(c: StaffCase, breaches: readonly StaffField[], alerts: readonly StaffField[], hidden: number, action: AdviceAction): AdviceDriver[] {
  const out: AdviceDriver[] = [];
  const add = (d: AdviceDriver): void => {
    if (!out.some((x) => x.key === d.key && x.field === d.field)) out.push(d);
  };
  const flagged = (key: string): boolean => breaches.some((f) => f.key === key);
  const s = c.scene;
  // Named drivers first: the scenario-level signals an analyst would call out.
  if (s === 'retail_ATM_LOW_CASH' && (alerts.length || flagged('cassetteCash'))) add({ key: 'driver_atmCassetteLow', tone: flagged('cassetteCash') ? 'breach' : 'alert' });
  if (s === 'retail_AUTO_PAY' && breaches.length) add({ key: 'driver_nsfPenalty', tone: 'breach' });
  if (s === 'retail_DEBT_WATERFALL') add(breaches.length ? { key: 'driver_waterfallBroken', tone: 'breach' } : { key: 'driver_waterfall', tone: 'info' });
  if (s === 'retail_CLEARING_BREAK' && !breaches.length) add({ key: 'driver_clearingBreak', tone: 'alert' });
  if ((s === 'task_aml_2' || s === 'aml_STRUCTURING') && breaches.length) add({ key: 'driver_ctrEvasion', tone: 'breach' });
  if (action === 'freeze') add({ key: 'driver_freeze', tone: 'breach' });
  if (hidden) add({ key: 'driver_hidden', tone: 'alert', n: hidden });
  for (const f of breaches) add({ key: 'driver_breach', tone: 'breach', field: f.key });
  for (const f of alerts) add({ key: 'driver_alert', tone: 'alert', field: f.key });
  if (s === 'retail_ATM_JAM' && !breaches.length) add({ key: 'driver_atmSuspense', tone: 'info' });
  if (s === 'retail_TD_EARLY_BREAK') add({ key: 'driver_demandRate', tone: 'info' });
  if (s === 'retail_TD_PLEDGE' || s === 'retail_TD_LIQUIDATION') add({ key: 'driver_collateral', tone: 'info' });
  if (c.role === 'swift' && !c.retail && !breaches.length) add({ key: 'driver_nostro', tone: 'info' });
  if (!breaches.length && !hidden && !alerts.length) add({ key: 'driver_clean', tone: 'info' });
  // Fill up with the ledger impact of the recommended action.
  if (out.length < ADVICE_DRIVERS.min) {
    const lines = linesFor(c, action === 'approve' || action === 'escalate' ? 'APPROVE' : 'REJECT');
    const counter = lines.find((l) => l.gl !== 'CASA' && l.gl !== 'OVERDRAFT_RECV') ?? lines[0];
    add(counter ? { key: 'driver_posting', tone: 'info', gl: counter.gl } : { key: 'driver_memo', tone: 'info' });
  }
  return out.slice(0, ADVICE_DRIVERS.max);
}

const ACTION_TONE: Readonly<Record<AdviceAction, string>> = {
  approve: 'border-emerald-400/70 bg-emerald-500/20 text-emerald-100',
  reject: 'border-rose-400/70 bg-rose-500/20 text-rose-100',
  freeze: 'border-sky-300/70 bg-sky-500/20 text-sky-100',
  escalate: 'border-amber-400/70 bg-amber-400/20 text-amber-100',
};
const ACTION_ICON: Readonly<Record<AdviceAction, string>> = { approve: '✅', reject: '⛔', freeze: '🔒', escalate: '↗️' };
const DRIVER_TONE = { breach: ['⚠', 'text-rose-200'], alert: ['🔔', 'text-amber-200'], info: ['ℹ', 'text-sky-200'] } as const;

export function confidenceBand(pct: number): 'High' | 'Medium' | 'Low' {
  return pct >= 90 ? 'High' : pct >= ESCALATE_BELOW_PCT ? 'Medium' : 'Low';
}

/**
 * The advisory card. It starts collapsed in both modes, so the learner weighs the case first; the 👁️ toggle shows and hides
 * it. In Expert mode showing it forfeits the case's combo bonus.
 */
export function AdvisoryCard({
  current,
  masked = NONE_MASKED,
  mode,
  revealed,
  onReveal,
  onHide = () => undefined,
  m,
}: {
  current: StaffCase;
  masked?: ReadonlySet<string>;
  mode: WorkspaceMode;
  revealed: boolean;
  onReveal: () => void;
  onHide?: () => void;
  m: M;
}) {
  const head = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-[11px] font-bold text-violet-200">{m('dseTitle')}</span>
      <span className="flex items-center gap-2">
        <span className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-500">{m('dseAdvisoryNote')}</span>
        {revealed && (
          <button type="button" onClick={onHide} aria-expanded="true" data-testid="workspace-dse-hide" className="rounded-md border border-slate-600 px-2 py-0.5 text-[10.5px] font-semibold text-slate-300 transition hover:bg-slate-800">
            {m('dseHide')}
          </button>
        )}
      </span>
    </div>
  );
  if (!revealed) {
    return (
      <div className="rounded-lg border border-violet-400/30 bg-violet-500/[0.06] px-3 py-2" data-testid="workspace-dse" data-revealed="false">
        {head}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onReveal} aria-expanded="false" data-testid="workspace-dse-reveal" className="rounded-lg border border-violet-400/50 bg-violet-500/15 px-2.5 py-1 text-[11.5px] font-semibold text-violet-100 transition hover:bg-violet-500/25">
            {m('dseShow')}
          </button>
          <span className="text-[10.5px] text-slate-400">{m(mode === 'expert' ? 'dseRevealNote' : 'dseCollapsedNote')}</span>
        </div>
      </div>
    );
  }
  const advice = adviseCase(current, masked);
  return <AdviceBody advice={advice} head={head} mode={mode} m={m} />;
}

function AdviceBody({ advice, head, mode, m }: { advice: Advice; head: ReactNode; mode: WorkspaceMode; m: M }) {
  const gl = useGlossary();
  const band = confidenceBand(advice.confidence);
  const bar = band === 'High' ? 'bg-emerald-400' : band === 'Medium' ? 'bg-sky-400' : 'bg-amber-400';
  return (
    <div className="rounded-lg border border-violet-400/30 bg-violet-500/[0.06] px-3 py-2" data-testid="workspace-dse" data-revealed="true" data-action={advice.action} data-confidence={advice.confidence} data-mode={mode}>
      {head}
      <div className="mt-1.5 flex items-center gap-2">
        <span className="flex shrink-0 items-center text-[10.5px] text-slate-400">
          {m('dseConfidence')}
          <InfoTip label={m('dseConfidence')} text={m('dseConfidenceTip', { min: ESCALATE_BELOW_PCT })} testId="workspace-tip-dse" />
        </span>
        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800" role="meter" aria-label={m('dseConfidence')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={advice.confidence}>
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${advice.confidence}%` }} />
        </div>
        <span className="shrink-0 text-[13px] font-black tabular-nums text-slate-50" data-testid="workspace-dse-confidence">
          {advice.confidence}%
        </span>
        <span className="shrink-0 text-[10px] font-semibold text-slate-400">{m(k(`dseBand${band}`))}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[10.5px] text-slate-400">{m('dseRecommendation')}:</span>
        {ADVICE_ACTIONS.map((a) => (
          <span
            key={a}
            title={m(k(`dseActionTip_${a}`))}
            data-action={a}
            data-recommended={a === advice.action || undefined}
            className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${a === advice.action ? ACTION_TONE[a] : 'border-slate-700 text-slate-500'}`}
          >
            {a === advice.action && <span aria-hidden="true">{ACTION_ICON[a]} </span>}
            {m(k(`dseAction_${a}`))}
          </span>
        ))}
      </div>
      <div className="mt-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{m('dseDrivers')}</div>
        <ul className="mt-0.5 space-y-0.5" data-testid="workspace-dse-drivers">
          {advice.drivers.map((d, i) => (
            <li key={`${d.key}-${d.field ?? d.gl ?? i}`} className={`flex items-baseline gap-1.5 text-[11.5px] leading-snug ${DRIVER_TONE[d.tone][1]}`} data-driver={d.key} data-tone={d.tone}>
              <span aria-hidden="true">{DRIVER_TONE[d.tone][0]}</span>
              {(() => {
                const text = m(d.key, { field: d.field ? m(k(`field_${d.field}`)) : '', account: d.gl ? `${GL_CODE[d.gl]} ${m(k(`gl_${d.gl}`))}` : '', n: d.n ?? 0 });
                return (
                  <span className="min-w-0 text-slate-200" title={gl.gloss(text)}>
                    {text}
                  </span>
                );
              })()}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel B: the 4-part scenario card
// ─────────────────────────────────────────────────────────────────────────────

/** What CORRUPTED_PAYLOAD leaves of a field's value. */
export const MASK = '██████';
const NONE_MASKED: ReadonlySet<string> = new Set();

function PayloadTag({ field, mode, m, locale, masked = false }: { field: StaffField; mode: WorkspaceMode; m: M; locale: Locale; masked?: boolean }) {
  const label = m(k(`field_${field.key}`));
  if (masked) {
    return (
      <div className="flex min-w-0 flex-col rounded-lg border border-dashed border-slate-500/60 bg-slate-800/60 px-2.5 py-1.5" data-field={field.key} data-masked="true">
        <span className="text-[10.5px] text-slate-400">{label}</span>
        <span className="mt-0.5 font-mono text-[13px] font-semibold tracking-tight text-slate-500" title={m('incidentMasked')} aria-label={m('incidentMasked')}>
          {MASK}
        </span>
      </div>
    );
  }
  const alert = field.alert && !field.flag;
  const value = fieldText(field, m, locale);
  const meaning = field.value.t === 'code' ? glossText(value, locale) : undefined;
  return (
    <div
      className={`flex min-w-0 flex-col rounded-lg border px-2.5 py-1.5 ${field.flag ? 'border-rose-400/60 bg-rose-500/10' : alert ? 'border-amber-400/60 bg-amber-400/10' : 'border-sky-400/25 bg-sky-400/[0.06]'}`}
      data-field={field.key}
      data-flag={field.flag || undefined}
      data-alert={alert || undefined}
    >
      <span className="flex items-center text-[10.5px] text-slate-400">
        {label}
        <InfoTip label={label} text={m(k(`tip_${field.key}_${mode === 'standard' ? 'std' : 'exp'}`))} testId={`workspace-tip-${field.key}`} />
      </span>
      <span title={meaning} className={`mt-0.5 flex min-w-0 items-center gap-1 break-words text-[13px] font-semibold tabular-nums [overflow-wrap:anywhere] ${field.flag ? 'text-rose-200' : alert ? 'text-amber-100' : 'text-slate-50'}`}>
        {field.flag && (
          <span aria-label={m('breach')} title={m('breach')}>
            ⚠
          </span>
        )}
        {alert && (
          <span aria-label={m('alertLabel')} title={m('alertLabel')}>
            🔔
          </span>
        )}
        <span className="min-w-0">{value}</span>
      </span>
    </div>
  );
}

function ScenarioCard({
  current,
  queued,
  elapsed,
  mode,
  m,
  onAdvance,
  canAdvance,
  showDrill,
  sla = STAFF_SLA_SECONDS,
  masked = NONE_MASKED,
  adviceRevealed = false,
  onRevealAdvice = () => undefined,
  onHideAdvice = () => undefined,
}: {
  current: StaffCase | null;
  queued: number;
  elapsed: number;
  mode: WorkspaceMode;
  m: M;
  onAdvance: () => void;
  canAdvance: boolean;
  showDrill: boolean;
  sla?: number;
  masked?: ReadonlySet<string>;
  /** The advisory card is open for this case (it starts collapsed). */
  adviceRevealed?: boolean;
  onRevealAdvice?: () => void;
  onHideAdvice?: () => void;
}) {
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
  const left = sla - elapsed;
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
            <span className="whitespace-nowrap">{current.id}</span> · {current.scenario && `${localizeScenarioText(current.scenario, locale)} · `}
            {m('waited', { min: current.waitedMin })}
            {queued > 0 && ` · ${m('queueAhead', { n: queued })}`}
          </div>
          {showDrill && current.drill && (
            <span className="mt-1 inline-flex rounded-full border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-violet-200" data-testid="workspace-drill" data-drill={current.drill}>
              {m('taskDrillTag', { n: current.drill })}
            </span>
          )}
          {current.retail && (
            <span className="ml-1 mt-1 inline-flex rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-200" data-testid="workspace-retail" data-retail={current.retail.id}>
              {m('retailTag', { title: m(k(`retail_${current.retail.id}_title`)) })}
            </span>
          )}
          {current.incident && (
            <span className="ml-1 mt-1 inline-flex rounded-full border border-rose-400/50 bg-rose-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-rose-200" data-testid="workspace-incident-case" data-incident={current.incident}>
              {m('incidentSurgeTag')}
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
        <p className="mt-0.5 text-[12px] leading-snug text-amber-50/90" title={glossText(m(k(`scene_${current.scene}_trigger${s}`)), locale)}>
          {m(k(`scene_${current.scene}_trigger${s}`))}
        </p>
      </div>

      {/* 3. Highlighted payload tags */}
      <div>
        <Kicker>{m('payloadTitle')}</Kicker>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3" data-testid="workspace-fields">
          {current.fields.map((f) => (
            <PayloadTag key={f.key} field={f} mode={mode} m={m} locale={locale} masked={masked.has(f.key)} />
          ))}
        </div>
      </div>

      {/* Decision Support Engine / Risk Advisory */}
      <AdvisoryCard current={current} masked={masked} mode={mode} revealed={adviceRevealed} onReveal={onRevealAdvice} onHide={onHideAdvice} m={m} />

      {/* 4. Risk & benefit analysis */}
      <div data-testid="workspace-risk">
        <div className="text-[11px] font-bold text-slate-200">{m('riskTitle')}</div>
        <div className="mt-1.5 grid gap-1.5 md:grid-cols-3">
          <RiskBox tone="rose" title={m('falseApproveTitle')} text={m(riskKey(current.role, current.drill, 'approve', mode, current.retail?.id))} testId="risk-false-approve" />
          <RiskBox tone="amber" title={m('falseRejectTitle')} text={m(riskKey(current.role, current.drill, 'reject', mode, current.retail?.id))} testId="risk-false-reject" />
          <RiskBox tone="emerald" title={m('benefitTitle')} text={m(riskKey(current.role, current.drill, 'benefit', mode, current.retail?.id))} testId="risk-benefit" />
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
  const gl = useGlossary();
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${RISK_TONE[tone]}`} title={gl.gloss(text)} data-testid={testId}>
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
  /** The drill (or retail scenario) of the decided case, so the overlay quotes that task's card. */
  drill?: StaffDrillNo;
  retail?: RetailScenarioId;
  errors: number;
  /** Challenge Mode only: the XP this decision scored and the speed bonus inside it. */
  points?: number;
  bonus?: number;
  /** Shift XP this decision booked (combo multiplier included) and the streak after it. */
  xp?: number;
  combo?: number;
  /** Expert mode: the advice was revealed, so the combo bonus was forfeited. */
  assisted?: boolean;
}

/** What the overlay explains: the benefit when right, the risk the learner just took when wrong. */
export function consequenceKey(c: Pick<Consequence, 'result' | 'role' | 'drill' | 'retail'>, mode: WorkspaceMode): AnalystWorkspaceKey {
  return riskKey(c.role, c.drill, c.result.correct ? 'benefit' : c.result.decision === 'APPROVE' ? 'approve' : 'reject', mode, c.retail);
}

export function ConsequenceOverlay({ consequence, mode, m }: { consequence: Consequence; mode: WorkspaceMode; m: M }) {
  const { result } = consequence;
  const ok = result.correct;
  const locale = useLocale();
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
      {ok && consequence.assisted && consequence.points === undefined && (
        <div className="text-[11.5px] font-semibold text-violet-200" data-testid="workspace-consequence-assisted">
          {m('dseAssisted')}
        </div>
      )}
      {consequence.combo !== undefined &&
        (ok ? (
          !consequence.assisted &&
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
      {!ok && consequence.points === undefined && (consequence.xp ?? 0) < 0 && (
        <div className="text-[12px] font-bold text-rose-200" data-testid="workspace-audit-penalty">
          {m('incidentAuditPenalty', { xp: Math.abs(consequence.xp ?? 0) })}
        </div>
      )}
      {consequence.points !== undefined && !!consequence.bonus && <div className="text-[11px] font-semibold text-amber-200">{m('overlayBonus', { bonus: consequence.bonus })}</div>}
      <div className="font-mono text-[10.5px] text-slate-400" title={glossText(result.statusCode, locale)}>
        {m('statusCode', { code: result.statusCode })}
      </div>
      {result.journal && (
        <div className="w-full rounded-lg border border-slate-600/70 bg-slate-950/70 px-2 py-1.5 text-left" data-testid="workspace-consequence-journal">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{m('overlayJournal')}</div>
          <JournalLines lines={result.journal.lines} m={m} compact />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Core ledger: journal lines, the four KPIs and the balance sheet
// ─────────────────────────────────────────────────────────────────────────────

/** A journal's Debit and Credit lines, debits first; a decision that moves no money shows the memo note. */
export function JournalLines({ lines, m, compact = false }: { lines: readonly LedgerLine[]; m: M; compact?: boolean }) {
  if (lines.length === 0) return <p className="mt-0.5 text-[10.5px] italic text-slate-400">{m('ledgerMemo')}</p>;
  return (
    <ul className={`mt-0.5 space-y-0.5 font-mono tabular-nums ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
      {lines.map((l, i) => (
        <li key={`${l.gl}-${i}`} className={`flex items-baseline gap-1.5 ${l.cr ? 'pl-3' : ''}`} data-gl={l.gl} data-side={l.dr ? 'dr' : 'cr'}>
          <span className={`shrink-0 font-bold ${l.dr ? 'text-sky-300' : 'text-amber-300'}`} title={m(l.dr ? 'labelDebit' : 'labelCredit')}>
            {m(l.dr ? 'ledgerDr' : 'ledgerCr')}
          </span>
          <span className="shrink-0 whitespace-nowrap text-slate-500" title={`${GL_CODE[l.gl]}: ${m(k(`gl_${l.gl}`))}`}>
            {GL_CODE[l.gl]}
          </span>
          <span className="min-w-0 flex-1 truncate font-sans text-slate-200">{m(k(`gl_${l.gl}`))}</span>
          <span className="shrink-0 text-slate-50">{money(l.dr || l.cr)}</span>
        </li>
      ))}
    </ul>
  );
}

function KpiTiles({ kpis, m, compact = false }: { kpis: RetailKpis; m: M; compact?: boolean }) {
  const tile = (key: AnalystWorkspaceKey, cents: number, testId: string, warn = false) => (
    <div className={`min-w-0 rounded-lg border px-2 py-1 ${warn ? 'border-amber-400/60 bg-amber-400/10' : 'border-slate-700 bg-slate-950/60'}`} data-testid={testId} data-warn={warn || undefined}>
      <div className="truncate text-[9.5px] font-semibold uppercase tracking-wider text-slate-400" title={m(key)}>
        {m(key)}
      </div>
      <div className={`truncate font-bold tabular-nums ${compact ? 'text-[12px]' : 'text-[15px]'} ${warn ? 'text-amber-100' : 'text-slate-50'}`} title={`${m(key)}: ${money(cents)}`}>
        {money(cents)}
      </div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {tile('kpiFeeIncome', kpis.feeIncome, 'ledger-kpi-fees')}
      {tile('kpiAtmCash', kpis.atmCash, 'ledger-kpi-atm', kpis.atmLow)}
      {tile('kpiSuspense', kpis.suspense, 'ledger-kpi-suspense')}
      {tile('kpiOverdraft', kpis.overdraft, 'ledger-kpi-overdraft')}
    </div>
  );
}

/** The header card's four live figures, compact in the header and full-size on the balance sheet. */
function LedgerMetrics({ kpis, m, compact = false }: { kpis: RetailKpis; m: M; compact?: boolean }) {
  const metric = (label: AnalystWorkspaceKey, cents: number, testId: string, tone: string) => (
    <div className={compact ? 'min-w-0' : 'min-w-0 rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1'} data-testid={testId}>
      <div className={`truncate font-semibold uppercase tracking-wider text-slate-400 ${compact ? 'text-[8.5px]' : 'text-[9.5px]'}`} title={m(label)}>
        {m(label)}
      </div>
      <div className={`truncate font-bold tabular-nums ${compact ? 'text-[11.5px]' : 'text-[15px]'} ${tone}`} title={`${m(label)}: ${money(cents)}`}>
        {compact ? formatMoney(cents, true) : money(cents)}
      </div>
    </div>
  );
  return (
    <div className={`grid gap-x-3 gap-y-1 ${compact ? 'grid-cols-4' : 'grid-cols-2 gap-1.5'}`}>
      {metric('ledgerCardVolume', kpis.settledVolume, 'ledger-card-volume', 'text-slate-50')}
      {metric('labelNetRevenue', kpis.netRevenue, 'ledger-card-revenue', kpis.netRevenue < 0 ? 'text-rose-200' : 'text-emerald-200')}
      {metric('ledgerCardSuspense', kpis.suspense, 'ledger-card-suspense', kpis.suspense > 0 ? 'text-amber-200' : 'text-slate-50')}
      {metric('ledgerCardFrozen', kpis.frozenCollateral, 'ledger-card-frozen', 'text-sky-200')}
    </div>
  );
}

/** The "Core Ledger Balance Sheet" card in the workspace header: live figures, and the full sheet on click. */
export function CoreLedgerCard({ kpis, onOpen, m }: { kpis: RetailKpis; onOpen: () => void; m: M }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={m('ledgerCardHint')}
      data-testid="workspace-ledger-open"
      data-warn={kpis.atmLow || undefined}
      className={`min-w-[17rem] shrink-0 rounded-xl border px-2.5 py-1 text-left transition ${kpis.atmLow ? 'border-amber-400/60 bg-amber-400/10' : 'border-emerald-400/40 bg-gradient-to-r from-emerald-500/10 to-slate-900 hover:border-emerald-300/70'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">{m('ledgerCardTitle')}</span>
        <span className="text-[10px] text-slate-400" aria-hidden="true">
          📒 →
        </span>
      </div>
      <LedgerMetrics kpis={kpis} m={m} compact />
    </button>
  );
}

/** What a journal is about: its retail scenario, its matrix task, or the desk for a live-queue review. */
export function journalTitleKey(j: Pick<JournalEntry, 'role' | 'scene'>): AnalystWorkspaceKey {
  if (j.scene.startsWith('retail_')) return k(`${j.scene}_title`);
  if (j.scene.startsWith('task_')) return k(`${j.scene}_title`);
  return k(`role_${j.role}_title`);
}

/** Generic labels for the accounts that hold funds or face a correspondent. */
const GL_TAG: Partial<Record<GlAccount, AnalystWorkspaceKey>> = {
  ATM_SUSPENSE: 'labelSuspense',
  CLEARING_SUSPENSE: 'labelSuspense',
  NOSTRO: 'labelNostro',
  TD_PLEDGED: 'labelCollateral',
  FROZEN_ASSETS: 'labelFrozen',
  DISPUTE_ACCOUNT: 'labelDispute',
};

/** The retail queue's live view of the books, under the decision buttons. */
function LedgerStrip({ ledger, m, onOpen }: { ledger: RetailLedger; m: M; onOpen: () => void }) {
  const kpis = retailKpis(ledger);
  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.06] p-2" data-testid="workspace-ledger-strip">
      <div className="mb-1 flex items-center justify-between">
        <Kicker>{m('ledgerStrip')}</Kicker>
        <button type="button" onClick={onOpen} className="text-[10.5px] font-semibold text-emerald-200 underline-offset-2 hover:underline">
          {m('ledgerOpen')}
        </button>
      </div>
      <KpiTiles kpis={kpis} m={m} compact />
      {kpis.atmLow && <p className="mt-1 text-[10.5px] font-semibold text-amber-200">{m('kpiAtmLow', { min: money(ATM_FLEET_LOW_CENTS) })}</p>}
    </div>
  );
}

/** One posted journal in full: who, which case, which channel/desk, when, and every Debit/Credit line by GL account. */
export function JournalDetail({ j, m, view = 'advanced' }: { j: JournalEntry; m: M; view?: ViewMode }) {
  const gl = useGlossary();
  const basic = view === 'basic';
  const customer = personaFor(j.caseId).name;
  const desk = j.station ?? ROLE_STATION[j.role];
  const dr = j.lines.reduce((s, l) => s + l.dr, 0);
  const cr = j.lines.reduce((s, l) => s + l.cr, 0);
  /** A coded field: plain words in Basic view, the raw code (meaning appended to the hover) in Advanced view. */
  const field = (label: string, value: string, mono = false, coded = false) => {
    const meaning = coded ? gl.explain(value) : undefined;
    const shown = coded && basic ? (meaning ?? value) : value;
    return (
      <div className="flex min-w-0 items-baseline gap-1.5">
        <dt className="shrink-0 whitespace-nowrap text-slate-500">{label}:</dt>
        <dd className={`min-w-0 truncate whitespace-nowrap text-slate-200 ${mono && !(coded && basic) ? 'font-mono' : ''}`} title={`${label}: ${value}${meaning ? ` (${meaning})` : ''}`}>
          {shown}
        </dd>
      </div>
    );
  };
  return (
    <li className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2" data-case={j.caseId} data-station={desk}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[11.5px] font-semibold text-slate-100" title={m(journalTitleKey(j))}>
          {m(journalTitleKey(j))}
        </span>
        <span className={`shrink-0 text-[10px] font-bold ${j.decision === 'APPROVE' ? 'text-emerald-300' : 'text-rose-300'}`} title={`${j.caseId}: ${m(j.decision === 'APPROVE' ? 'approve' : 'reject')} · ${j.statusCode}`}>
          {m(j.decision === 'APPROVE' ? 'approve' : 'reject')}
        </span>
      </div>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10.5px]" data-testid="ledger-journal-meta">
        {field(m('ledgerColCustomer'), customer)}
        {field(m('auditColCase'), j.caseId, true)}
        {field(m('auditColDesk'), desk, true, true)}
        {field(m('auditColTime'), j.at ? auditTime(j.at) : '—', true)}
        {field(m('auditColStatus'), j.statusCode, true, true)}
      </dl>
      {j.lines.length === 0 ? (
        <p className="mt-1 text-[10.5px] italic text-slate-400">{m('ledgerMemo')}</p>
      ) : (
        <table className="mt-1.5 w-full table-fixed border-collapse font-mono text-[10.5px] tabular-nums" aria-label={m('ledgerJournalDetail')} data-testid="ledger-journal-lines">
          <colgroup>
            <col className="w-8" />
            <col />
            <col className="w-[5.5rem]" />
            <col className="w-[5.5rem]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-700 text-[9.5px] uppercase tracking-wider text-slate-500">
              <th className="py-0.5 pr-1 text-left font-semibold" />
              <th className="py-0.5 pr-1 text-left font-semibold">{m('ledgerColGl')}</th>
              <th className="py-0.5 pl-1 text-right font-semibold">{m('labelDebit')}</th>
              <th className="py-0.5 pl-1 text-right font-semibold">{m('labelCredit')}</th>
            </tr>
          </thead>
          <tbody>
            {j.lines.map((l, i) => (
              <tr key={`${l.gl}-${i}`} className="border-b border-slate-800/70" data-gl={l.gl} data-side={l.dr ? 'dr' : 'cr'}>
                <td className={`py-0.5 pr-1 font-bold ${l.dr ? 'text-sky-300' : 'text-amber-300'}`} title={m(l.dr ? 'labelDebit' : 'labelCredit')}>
                  {m(l.dr ? 'ledgerDr' : 'ledgerCr')}
                </td>
                <td className={`truncate whitespace-nowrap py-0.5 pr-1 ${l.cr ? 'pl-2' : ''}`} title={`${GL_CODE[l.gl]} ${m(k(`gl_${l.gl}`))} · ${gl.line(l)}`}>
                  {basic ? (
                    <span className="font-sans text-slate-200">{gl.line(l)}</span>
                  ) : (
                    <>
                      <span className="text-slate-400">{GL_CODE[l.gl]}</span> <span className="font-sans text-slate-200">{m(k(`gl_${l.gl}`))}</span>
                    </>
                  )}
                </td>
                <td className="truncate py-0.5 pl-1 text-right text-slate-50" title={l.dr ? `${m('labelDebit')} ${GL_CODE[l.gl]}: ${money(l.dr)}` : undefined}>
                  {l.dr ? money(l.dr) : ''}
                </td>
                <td className="truncate py-0.5 pl-1 text-right text-slate-50" title={l.cr ? `${m('labelCredit')} ${GL_CODE[l.gl]}: ${money(l.cr)}` : undefined}>
                  {l.cr ? money(l.cr) : ''}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold text-slate-100">
              <td />
              <td className="py-0.5 pr-1 font-sans text-[10px] uppercase tracking-wider text-slate-400">{m('ledgerTotal')}</td>
              <td className="truncate py-0.5 pl-1 text-right" title={`${m('ledgerTotal')} ${m('labelDebit')}: ${money(dr)}`}>
                {money(dr)}
              </td>
              <td className="truncate py-0.5 pl-1 text-right" title={`${m('ledgerTotal')} ${m('labelCredit')}: ${money(cr)}`}>
                {money(cr)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </li>
  );
}

const SHEET_SIDES: readonly { side: GlSide; title: AnalystWorkspaceKey }[] = [
  { side: 'asset', title: 'ledgerAssets' },
  { side: 'liability', title: 'ledgerLiabilities' },
  { side: 'equity', title: 'ledgerEquity' },
  { side: 'income', title: 'ledgerIncome' },
  { side: 'expense', title: 'ledgerExpense' },
];

/** The workspace's core ledger: the four KPIs, the balance sheet and P&L by account, the balance check and the latest journals. */
export function CoreLedgerSheet({ ledger, m, onClose, onReset, initialView = 'basic' }: { ledger: RetailLedger; m: M; onClose: () => void; onReset: () => void; initialView?: ViewMode }) {
  const [view, setView] = useState<ViewMode>(initialView);
  const basic = view === 'basic';
  const gl = useGlossary();
  const sum = ledgerSummary(ledger);
  const kpis = retailKpis(ledger);
  const totals: Readonly<Record<GlSide, number>> = { asset: sum.assets, liability: sum.liabilities, equity: sum.equity, income: sum.income, expense: sum.expense };
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()} data-testid="workspace-ledger-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="workspace-ledger-title" data-testid="workspace-ledger" className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-emerald-400/40 bg-slate-900 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-5 py-3">
          <div className="min-w-0">
            <h3 id="workspace-ledger-title" className="text-[17px] font-extrabold text-emerald-100">
              {m('ledgerTitle')}
            </h3>
            <p className="mt-0.5 text-[12px] text-slate-400">
              {m('ledgerSubtitle')} · {m('ledgerPosted', { n: ledger.posted })}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <ViewModeToggle view={view} onChange={setView} testId="workspace-ledger-view" />
            <button type="button" onClick={onReset} data-testid="workspace-ledger-reset" className="rounded-lg border border-slate-600 px-3 py-1.5 text-[12px] font-medium text-slate-300 transition hover:bg-slate-800">
              {m('ledgerReset')}
            </button>
            <button type="button" onClick={onClose} autoFocus data-testid="workspace-ledger-close" className="rounded-lg border border-emerald-400/60 bg-emerald-400 px-3 py-1.5 text-[12px] font-bold text-slate-950 transition hover:bg-emerald-300">
              {m('ledgerClose')}
            </button>
          </div>
        </div>
        <div className="bk-scroll grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
          <div className="min-w-0 space-y-3">
            <LedgerMetrics kpis={kpis} m={m} />
            <KpiTiles kpis={kpis} m={m} />
            {kpis.atmLow && (
              <p className="rounded-lg border border-amber-400/50 bg-amber-400/10 px-2.5 py-1.5 text-[12px] font-semibold text-amber-100" data-testid="ledger-atm-low">
                {m('kpiAtmLow', { min: money(ATM_FLEET_LOW_CENTS) })}
              </p>
            )}
            {(() => {
              const check = sum.balanced ? m('ledgerBalanced', { a: money(sum.assets), b: money(sum.liabilities + sum.equity + sum.net) }) : m('ledgerUnbalanced', { diff: money(sum.assets - sum.liabilities - sum.equity - sum.net) });
              return (
                <div className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold tabular-nums ${sum.balanced ? 'bg-emerald-500/15 text-emerald-200' : 'bg-rose-500/20 text-rose-100'}`} title={check} data-testid="ledger-balanced" data-balanced={sum.balanced}>
                  {check}
                </div>
              );
            })()}
            <div className="grid gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
              {SHEET_SIDES.map(({ side, title }) => (
                <section key={side} className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50 p-2.5" data-testid={`ledger-side-${side}`}>
                  <div className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate" title={m(title)}>
                      <Kicker>{m(title)}</Kicker>
                    </span>
                    <span className="shrink-0 text-[12px] font-bold tabular-nums text-slate-100" title={`${m(title)}: ${money(totals[side])}`}>
                      {money(totals[side])}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-[11.5px] tabular-nums">
                    {GL_ACCOUNTS.filter((a) => a.side === side).map((a) => {
                      const name = `${a.code} ${m(k(`gl_${a.id}`))}`;
                      const label = basic ? gl.glPlain(a.id) : m(k(`gl_${a.id}`));
                      const amount = money(naturalBalance(a.id, ledger.balances[a.id]));
                      return (
                        <li key={a.id} className="flex min-w-0 items-baseline gap-1.5 overflow-hidden" data-gl={a.id}>
                          {/* The code and name share one ellipsised label; the full account name is on hover. */}
                          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={name}>
                            {!basic && <span className="font-mono text-[10.5px] text-slate-500">{a.code}</span>} <span className="text-slate-300">{label}</span>
                          </span>
                          {GL_TAG[a.id] && (
                            <span className="max-w-[5.5rem] shrink-0 truncate rounded bg-slate-800 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400" title={m(GL_TAG[a.id]!)}>
                              {m(GL_TAG[a.id]!)}
                            </span>
                          )}
                          <span className="shrink-0 whitespace-nowrap text-right font-semibold text-slate-50" title={`${name}: ${amount}`}>
                            {amount}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              <section className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/50 p-2.5">
                <Kicker>{m('labelNetRevenue')}</Kicker>
                <div className={`mt-1 truncate text-[18px] font-black tabular-nums ${sum.net < 0 ? 'text-rose-200' : 'text-emerald-200'}`} title={`${m('labelNetRevenue')}: ${money(sum.net)}`} data-testid="ledger-net">
                  {money(sum.net)}
                </div>
              </section>
            </div>
          </div>
          <div>
            <Kicker>{m('ledgerJournal')}</Kicker>
            {ledger.journal.length === 0 ? (
              <p className="mt-1 text-[12px] text-slate-400">{m('ledgerEmpty')}</p>
            ) : (
              <ol className="mt-1 space-y-2" data-testid="ledger-journal" data-view={view}>
                {ledger.journal.map((j, i) => (
                  <JournalDetail key={`${j.caseId}-${i}`} j={j} m={m} view={view} />
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit trail export: CSV and the printable (PDF) audit report
// ─────────────────────────────────────────────────────────────────────────────

/** The journal's Debit/Credit account codes, e.g. "Dr 2011 / Cr 1520 / Cr 4540"; `memo` when nothing posted. */
export function ledgerEntryCode(lines: readonly LedgerLine[], memo: string): string {
  return lines.length ? lines.map((l) => `${l.dr ? 'Dr' : 'Cr'} ${GL_CODE[l.gl]}`).join(' / ') : memo;
}

const AUDIT_ACTION_KEY: Readonly<Record<AuditEntry['action'], AnalystWorkspaceKey>> = { APPROVE: 'dseAction_approve', REJECT: 'dseAction_reject', FREEZE: 'dseAction_freeze' };
export const auditActionLabel = (a: AuditEntry['action'], m: M): string => m(AUDIT_ACTION_KEY[a]);
export const complianceLabel = (c: AuditEntry['compliance'], m: M): string => m(k(`auditCompliance_${c}`));

const pad2 = (n: number): string => String(n).padStart(2, '0');
/** "27/10/2026 14:05:09", the day-first form both languages use on the report. */
export function auditTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const decimal = (cents: number): string => (cents / 100).toFixed(2);

export const AUDIT_CSV_COLUMNS: readonly AnalystWorkspaceKey[] = [
  'auditColTime',
  'auditColDesk',
  'auditColCase',
  'auditColAction',
  'auditColSla',
  'auditColSlaLimit',
  'auditColLedger',
  'auditColAmount',
  'auditColStatus',
  'auditColCompliance',
];

/**
 * Vietnamese text in Unicode Form C: each accented letter as one precomposed code point. Decomposed text (a base letter plus
 * combining marks) prints with gaps in many PDF fonts ("Khô ́ i"), so everything the report and the CSV render goes through this.
 */
export const nfc = (text: string): string => text.normalize('NFC');
const nfcMessages = (m: M): M => ((key, values) => nfc(m(key, values))) as M;

/** The audit trail as CSV (RFC 4180, CRLF rows), headers and labels in the current language, timestamps in ISO 8601. */
export function auditCsv(log: readonly AuditEntry[], tm: M): string {
  const m = nfcMessages(tm);
  const rows = log.map((e) => [
    e.at,
    e.station,
    e.caseId,
    auditActionLabel(e.action, m),
    e.latencySec.toFixed(1),
    e.slaSec,
    ledgerEntryCode(e.lines, m('auditMemo')),
    decimal(e.amountCents),
    e.statusCode,
    complianceLabel(e.compliance, m),
  ]);
  return [AUDIT_CSV_COLUMNS.map((key) => m(key)), ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** Hands the browser a file to save; the BOM lets spreadsheet apps read the Vietnamese labels as UTF-8. */
function downloadFile(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const stamp = (d: Date): string => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
export const auditReportNo = (log: readonly AuditEntry[], issued: Date): string => `AT-${stamp(issued)}-${String(log.length).padStart(4, '0')}`;

export interface AuditSummary {
  total: number;
  actions: Readonly<Record<AuditEntry['action'], number>>;
  compliance: Readonly<Record<AuditEntry['compliance'], number>>;
  /** Share of decisions that were compliant, 0-100. */
  ratePct: number;
  avgSlaSec: number;
}

export function auditSummary(log: readonly AuditEntry[]): AuditSummary {
  const count = <T extends string>(keys: readonly T[], of: (e: AuditEntry) => T): Record<T, number> => Object.fromEntries(keys.map((key) => [key, log.filter((e) => of(e) === key).length])) as Record<T, number>;
  const compliance = count(['COMPLIANT', 'SLA_BREACH', 'SOP_BREACH'] as const, (e) => e.compliance);
  return {
    total: log.length,
    actions: count(['APPROVE', 'REJECT', 'FREEZE'] as const, (e) => e.action),
    compliance,
    ratePct: log.length ? Math.round((1000 * compliance.COMPLIANT) / log.length) / 10 : 0,
    avgSlaSec: log.length ? Math.round((10 * log.reduce((s, e) => s + e.latencySec, 0)) / log.length) / 10 : 0,
  };
}

/** The report's one-line simulation disclaimer: English in both languages by design, so it reads the same to any reviewer. */
export const AUDIT_DISCLAIMER = 'DISCLAIMER: This is a simulated training artifact generated for educational purposes and does not constitute an official banking or regulatory audit document.';

/** System sans-serif fonts carry every precomposed Vietnamese letter; no letter-spacing or synthesized styles to split the marks. */
const REPORT_FONT = 'Arial, Helvetica, sans-serif';

const PRINT_CSS = `.pc-audit-print{display:none}
.pc-audit-report,.pc-audit-report *{font-family:${REPORT_FONT}!important;letter-spacing:normal!important;font-synthesis:none}
@media print{
  @page{size:A4 landscape;margin:14mm}
  body>*:not(.pc-audit-print){display:none!important}
  .pc-audit-print{display:block!important;background:#fff;color:#000}
}`;

/**
 * Section III's columns: starting widths (the table lays out automatically, so a code column grows to fit its longest code
 * rather than breaking it), and which columns are numeric (right-aligned).
 */
const AUDIT_TABLE_COLS: readonly { key: AnalystWorkspaceKey; width: string; numeric?: boolean }[] = [
  { key: 'rptColNo', width: '3.5%', numeric: true },
  { key: 'auditColTime', width: '11%' },
  { key: 'auditColDesk', width: '9%' },
  { key: 'auditColCase', width: '10%' },
  { key: 'auditColAction', width: '7%' },
  { key: 'auditColSla', width: '7%', numeric: true },
  { key: 'auditColSlaLimit', width: '7%', numeric: true },
  { key: 'auditColLedger', width: '16.5%' },
  { key: 'auditColAmount', width: '9%', numeric: true },
  { key: 'auditColStatus', width: '10%' },
  { key: 'auditColCompliance', width: '10%' },
];

/** The official audit report: national motto header, numbered sections, summary, the detailed log and sign-off blocks. */
export function AuditReport({ log, m: tm, issued, view = 'advanced' }: { log: readonly AuditEntry[]; m: M; issued: Date; view?: ViewMode }) {
  const m = nfcMessages(tm);
  const gl = useGlossary();
  const basic = view === 'basic';
  const plain = (code: string): string => nfc(gl.plain(code));
  const sum = auditSummary(log);
  const desks = [...new Set(log.map((e) => e.role))].map((r) => m(k(`role_${r}_title`))).join(', ') || '—';
  const issues = sum.compliance.SLA_BREACH + sum.compliance.SOP_BREACH;
  const cell = 'border border-black px-2 py-1 align-top';
  const num = `${cell} whitespace-nowrap px-3 text-right tabular-nums`;
  /** A code cell: one unbroken line in Advanced view (meaning on hover), plain words that may wrap in Basic view. */
  const coded = (code: string) => (basic ? plain(code) : <Code code={code} gl={gl} />);
  const row = (label: string, value: string | number) => (
    <tr>
      <td className={cell} title={label}>
        {label}
      </td>
      <td className={num} title={`${label}: ${value}`}>
        {value}
      </td>
    </tr>
  );
  return (
    <article
      className="pc-audit-report bg-white text-[12px] leading-snug text-black"
      style={{ fontFamily: REPORT_FONT, letterSpacing: 'normal', fontSynthesis: 'none' }}
      data-testid="audit-report"
      data-entries={log.length}
      data-view={view}
    >
      <header className="grid grid-cols-2 gap-4 text-center">
        <div>
          <div className="font-bold uppercase">{m('rptBank')}</div>
          <div className="font-bold">{m('rptUnit')}</div>
          <div className="mx-auto mt-0.5 w-24 border-t border-black" />
          <div className="mt-1">{m('rptNo', { no: auditReportNo(log, issued) })}</div>
        </div>
        <div>
          <div className="font-bold uppercase">{m('rptNation')}</div>
          <div className="font-bold">{m('rptMotto')}</div>
          <div className="mx-auto mt-0.5 w-40 border-t border-black" />
          <div className="mt-1 italic">{m('rptDate', { d: pad2(issued.getDate()), mo: pad2(issued.getMonth() + 1), y: issued.getFullYear() })}</div>
        </div>
      </header>
      <h1 className="mt-5 text-center text-[16px] font-bold uppercase">{m('rptTitle')}</h1>
      <p className="text-center italic">{m('rptSubtitle')}</p>
      <p className="mt-1 text-center text-[10.5px] italic">{m('rptBasis')}</p>
      <p className="mx-auto mt-1.5 w-fit border border-black px-2 py-0.5 text-center text-[10.5px] font-bold" role="note" data-testid="audit-disclaimer">
        {AUDIT_DISCLAIMER}
      </p>

      <h2 className="mt-4 font-bold uppercase">{m('rptSec1')}</h2>
      <ul className="ml-4 list-disc">
        <li>{m('rptPeriod', { from: log.length ? auditTime(log[0]!.at) : '—', to: log.length ? auditTime(log[log.length - 1]!.at) : '—' })}</li>
        <li>{m('rptDesks', { desks })}</li>
        <li>{m('rptEntries', { n: sum.total })}</li>
      </ul>

      <h2 className="mt-3 font-bold uppercase">{m('rptSec2')}</h2>
      <table className="mt-1 w-full max-w-md border-collapse" data-testid="audit-summary">
        <tbody>
          {row(auditActionLabel('APPROVE', m), sum.actions.APPROVE)}
          {row(auditActionLabel('REJECT', m), sum.actions.REJECT)}
          {row(auditActionLabel('FREEZE', m), sum.actions.FREEZE)}
          {row(complianceLabel('COMPLIANT', m), sum.compliance.COMPLIANT)}
          {row(complianceLabel('SLA_BREACH', m), sum.compliance.SLA_BREACH)}
          {row(complianceLabel('SOP_BREACH', m), sum.compliance.SOP_BREACH)}
          {row(m('rptRate'), `${sum.ratePct}%`)}
          {row(m('rptAvgSla'), `${sum.avgSlaSec}s`)}
        </tbody>
      </table>

      <h2 className="mt-3 font-bold uppercase">{m('rptSec3')}</h2>
      {log.length === 0 ? (
        <p className="italic">{m('auditEmpty')}</p>
      ) : (
        <table className="mt-1 w-full min-w-[960px] table-auto border-collapse text-[10.5px]" data-testid="audit-table">
          <colgroup>
            {AUDIT_TABLE_COLS.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-gray-100">
              {AUDIT_TABLE_COLS.map((c) => (
                <th key={c.key} className={`${cell} break-normal font-bold ${c.numeric ? 'px-3 text-right' : 'text-left'}`} title={m(c.key)}>
                  {m(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {log.map((e) => (
              <tr key={e.seq} data-seq={e.seq} data-compliance={e.compliance} style={{ breakInside: 'avoid' }}>
                <td className={num} title={`${m('rptColNo')} ${e.seq}`}>
                  {e.seq}
                </td>
                <td className={`${cell} whitespace-nowrap`} title={`${m('auditColTime')}: ${auditTime(e.at)}`}>
                  {auditTime(e.at)}
                </td>
                <td className={`${cell} ${basic ? '' : 'whitespace-nowrap'}`} title={`${m('auditColDesk')}: ${e.station}`}>
                  {coded(e.station)}
                </td>
                <td className={`${cell} whitespace-nowrap`} title={`${m('auditColCase')}: ${e.caseId}`}>
                  {e.caseId}
                </td>
                <td className={cell} title={`${m('auditColAction')}: ${auditActionLabel(e.action, m)}`}>
                  {auditActionLabel(e.action, m)}
                </td>
                <td className={num} title={`${m('auditColSla')}: ${e.latencySec.toFixed(1)}`}>
                  {e.latencySec.toFixed(1)}
                </td>
                <td className={num} title={`${m('auditColSlaLimit')}: ${e.slaSec}`}>
                  {e.slaSec}
                </td>
                <td className={cell} title={`${m('auditColLedger')}: ${ledgerEntryCode(e.lines, m('auditMemo'))}`}>
                  {/* One Dr/Cr leg per line, never split inside a leg. */}
                  {e.lines.length
                    ? e.lines.map((l, i) =>
                        basic ? (
                          <span key={`${l.gl}-${i}`} className="block">
                            {nfc(gl.line(l))}
                          </span>
                        ) : (
                          <span key={`${l.gl}-${i}`} className="block cursor-help whitespace-nowrap" title={nfc(`${l.dr ? m('labelDebit') : m('labelCredit')} ${GL_CODE[l.gl]}: ${m(k(`gl_${l.gl}`))}`)}>
                            {`${l.dr ? 'Dr' : 'Cr'} ${GL_CODE[l.gl]}`}
                          </span>
                        ),
                      )
                    : m('auditMemo')}
                </td>
                <td className={num} title={`${m('auditColAmount')}: ${money(e.amountCents)}`}>
                  {money(e.amountCents)}
                </td>
                <td className={`${cell} ${basic ? '' : 'whitespace-nowrap'}`} title={`${m('auditColStatus')}: ${e.statusCode}`}>
                  {coded(e.statusCode)}
                </td>
                <td className={`${cell} ${e.compliance === 'COMPLIANT' ? '' : 'font-bold'}`} title={`${m('auditColCompliance')}: ${complianceLabel(e.compliance, m)}`}>
                  {complianceLabel(e.compliance, m)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mt-3 font-bold uppercase">{m('rptSec4')}</h2>
      <p>{issues ? m('rptConclusionIssues', { n: issues }) : m('rptConclusionOk')}</p>
      <div className="mt-6 grid grid-cols-3 gap-4 text-center" style={{ breakInside: 'avoid' }}>
        {(['rptPrepared', 'rptReviewed', 'rptHead'] as const).map((key) => (
          <div key={key}>
            <div className="font-bold">{m(key)}</div>
            <div className="italic">{m('rptSign')}</div>
            <div className="h-16" />
          </div>
        ))}
      </div>
    </article>
  );
}

/** Export actions and a preview of the printed report. The print copy is portalled to <body> so only it reaches the page. */
/** The report page's width in the preview, close to A4 landscape at 96 dpi. */
const REPORT_PAGE_PX = 1100;

export function AuditExportDialog({ log, m, onClose, issued = new Date(), initialView = 'basic' }: { log: readonly AuditEntry[]; m: M; onClose: () => void; issued?: Date; initialView?: ViewMode }) {
  const [view, setView] = useState<ViewMode>(initialView);
  const [zoom, setZoom] = useState(1);
  const [pointer, setPointer] = useState<PointerMode>('select');
  const preview = useRef<HTMLDivElement>(null);
  const dragging = useDragScroll(preview, pointer === 'pan');
  const csv = (): void => downloadFile(`audit-trail-${stamp(issued)}-${pad2(issued.getHours())}${pad2(issued.getMinutes())}.csv`, auditCsv(log, m), 'text/csv;charset=utf-8');
  const report = <AuditReport log={log} m={m} issued={issued} view={view} />;
  return (
    <div className="absolute inset-0 z-40 grid place-items-center overflow-hidden bg-slate-950/80 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()} data-testid="workspace-audit-backdrop">
      <style>{PRINT_CSS}</style>
      {typeof document !== 'undefined' && createPortal(<div className="pc-audit-print">{report}</div>, document.body)}
      <div role="dialog" aria-modal="true" aria-labelledby="workspace-audit-title" data-testid="workspace-audit" className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-600 bg-slate-900 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-5 py-3">
          <div className="min-w-0">
            <h3 id="workspace-audit-title" className="text-[17px] font-extrabold text-slate-50">
              {m('auditTitle')}
            </h3>
            <p className="mt-0.5 text-[12px] text-slate-400">{m('auditSubtitle', { n: log.length })}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={csv} disabled={!log.length} data-testid="workspace-audit-csv" className="rounded-lg border border-emerald-400/60 bg-emerald-500/15 px-3 py-1.5 text-[12px] font-bold text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40">
              {m('auditCsv')}
            </button>
            <button type="button" onClick={() => window.print()} disabled={!log.length} data-testid="workspace-audit-print" className="rounded-lg border border-sky-400/60 bg-sky-500/15 px-3 py-1.5 text-[12px] font-bold text-sky-100 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40">
              {m('auditPrint')}
            </button>
            <button type="button" onClick={onClose} autoFocus data-testid="workspace-audit-close" className="rounded-lg border border-slate-600 px-3 py-1.5 text-[12px] font-medium text-slate-200 transition hover:bg-slate-800">
              {m('auditClose')}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/80 px-5 py-2" data-testid="workspace-audit-controls">
          <ViewModeToggle view={view} onChange={setView} testId="workspace-audit-view" />
          <div className="flex flex-wrap items-center gap-2">
            <PointerModeToggle mode={pointer} onChange={setPointer} testId="workspace-audit-pointer" />
            <ZoomBar zoom={zoom} onZoom={setZoom} testId="workspace-audit-zoom" />
          </div>
        </div>
        {/* The preview scrolls on its own, capped below the viewport, so no section is cut off at any zoom or screen size. */}
        <div
          ref={preview}
          className={`bk-scroll min-h-0 max-h-[calc(100vh-200px)] flex-1 overflow-x-auto overflow-y-auto bg-slate-700/40 p-4 ${pointer === 'pan' ? `select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}` : 'select-text'}`}
          tabIndex={0}
          aria-label={m('auditTitle')}
          data-testid="workspace-audit-preview"
          data-pointer={pointer}
        >
          <ZoomFrame zoom={zoom} width={REPORT_PAGE_PX}>
            <div className="rounded bg-white p-8 shadow-lg">{report}</div>
          </ZoomFrame>
        </div>
      </div>
    </div>
  );
}

function AuditButton({ count, onOpen, m }: { count: number; onOpen: () => void; m: M }) {
  return (
    <button type="button" onClick={onOpen} title={m('auditButtonHint')} data-testid="workspace-audit-open" className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-[12px] font-semibold text-slate-100 transition hover:bg-slate-800">
      {m('auditExport')}
      <span className="rounded-full bg-slate-700 px-1.5 text-[10.5px] font-bold tabular-nums text-slate-200" title={m('auditSubtitle', { n: count })}>
        {count}
      </span>
    </button>
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
export function ChallengeScorecard({ tally, m, onAgain, onClose, onExport }: { tally: ChallengeTally; m: M; onAgain: () => void; onClose: () => void; onExport?: () => void }) {
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
          {onExport && (
            <button type="button" onClick={onExport} data-testid="workspace-scorecard-export" className="mr-auto rounded-lg border border-slate-600 px-3 py-1.5 text-[12px] font-medium text-slate-200 transition hover:bg-slate-800">
              {m('auditExport')}
            </button>
          )}
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
// Incident Mode: toggle, live-incident banner, power-failover flicker
// ─────────────────────────────────────────────────────────────────────────────

export function IncidentToggle({ on, onToggle, m }: { on: boolean; onToggle: () => void; m: M }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      title={m('incidentToggleHint')}
      data-testid="workspace-incident-toggle"
      data-on={on || undefined}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold tracking-wide transition ${on ? 'pc-incident-glow border-rose-400 bg-gradient-to-r from-rose-500/20 to-amber-400/15 text-amber-100' : 'border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
    >
      <span aria-hidden="true">[</span>
      <span aria-hidden="true" className={on ? 'animate-pulse text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.9)]' : 'grayscale'} data-testid="workspace-incident-badge">
        ⚡
      </span>
      {m(on ? 'incidentToggleOn' : 'incidentToggleOff')}
      <span aria-hidden="true">]</span>
    </button>
  );
}

export function IncidentBanner({ incident, reviews, sla, m }: { incident: ActiveIncident; reviews: number; sla: number; m: M }) {
  const id = incident.id;
  const audit = id === 'AUDIT_DAY';
  const rate = incidentClockRate(id);
  const left = SHIFT_TARGET.reviews - (reviews % SHIFT_TARGET.reviews);
  return (
    <div
      role="alert"
      data-testid="workspace-incident"
      data-incident={id}
      className={`flex flex-wrap items-start gap-x-4 gap-y-1.5 border-b px-4 py-2 ${audit ? 'border-rose-500/70 bg-rose-950/70' : 'border-amber-400/50 bg-gradient-to-r from-rose-950/60 via-amber-950/40 to-slate-950'}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-black tracking-wider ${audit ? 'animate-pulse bg-rose-600 text-white shadow-[0_0_16px_rgba(244,63,94,0.8)]' : 'bg-amber-400 text-slate-950'}`} data-testid="workspace-incident-alert">
            {m(k(`incident_${id}_alert`))}
          </span>
          <span className="text-[13px] font-bold text-slate-50">{m(k(`incident_${id}_title`))}</span>
          <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">{m(incidentRole(id) ? 'incidentScopeDesk' : 'incidentScopeGlobal')}</span>
        </div>
        <div className="mt-1 grid gap-x-4 gap-y-0.5 text-[11.5px] leading-snug md:grid-cols-2">
          <p className="text-slate-300">
            <span className="font-semibold text-amber-200">{m('incidentPhenomenon')}: </span>
            {m(k(`incident_${id}_phenomenon`))}
          </p>
          <p className="text-slate-200" data-testid="workspace-incident-rule">
            <span className="font-semibold text-rose-200">{m('incidentRule')}: </span>
            {m(k(`incident_${id}_rule`))}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] font-semibold tabular-nums">
        {audit && (
          <span className={`rounded-full px-2 py-0.5 ${incident.compliance < 70 ? 'bg-rose-500/25 text-rose-100' : 'bg-emerald-500/15 text-emerald-200'}`} data-testid="workspace-incident-compliance" data-compliance={incident.compliance}>
            {m('incidentCompliance', { pct: incident.compliance })}
          </span>
        )}
        {sla !== STAFF_SLA_SECONDS && <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-rose-100">{m('incidentSlaCut', { sec: sla })}</span>}
        {rate !== 1 && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-amber-100">{m('incidentClockFast', { rate })}</span>}
        <span className="text-[10.5px] font-normal text-slate-400">{m('incidentShiftLeft', { n: left })}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Career rank card, badge collection and the unlock celebration
// ─────────────────────────────────────────────────────────────────────────────

export function CareerCard({ career, m }: { career: CareerProgress; m: M }) {
  const st = careerStanding(career.xp);
  const next = CAREER_RANKS[CAREER_RANKS.findIndex((r) => r.id === st.rank) + 1];
  return (
    <div className="flex min-w-[13rem] shrink-0 items-center gap-2.5 rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-400/10 to-slate-900 px-2.5 py-1.5" title={m('careerHint')} data-testid="workspace-career" data-rank={st.rank} data-level={st.level}>
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

function PowerFlicker() {
  return <div className="pc-flicker pointer-events-none absolute inset-0 z-[24] rounded-2xl bg-amber-200/40 mix-blend-overlay" aria-hidden="true" data-testid="workspace-power-flicker" />;
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
  ledger = null,
  onOpenLedger = () => undefined,
}: {
  shift: ShiftProgress;
  current: StaffCase | null;
  onDecide: (d: StaffDecision) => void;
  consequence: Consequence | null;
  mode: WorkspaceMode;
  m: M;
  challenge: { tally: ChallengeTally; remainingSec: number } | null;
  /** The core ledger, shown on the retail queue only. */
  ledger?: RetailLedger | null;
  onOpenLedger?: () => void;
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
      {ledger && <LedgerStrip ledger={ledger} m={m} onOpen={onOpenLedger} />}
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

const PICKER = 'min-w-[11rem] max-w-[16rem] shrink-0 truncate rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[12px] font-semibold text-slate-100 transition hover:border-slate-500 focus:border-sky-400 focus:outline-none';

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
      {WORKSPACE_TASKS.map((n) => (
        <option key={n} value={n}>
          {`🎯 ${m('taskOption', { n, title: m(taskTitleKey(role, n)) })}`}
        </option>
      ))}
    </select>
  );
}

/** What kind of desk this is: a server-run system or a staffed counter. */
export function DeskKindBadge({ role, m }: { role: StaffRoleId; m: M }) {
  const automated = isAutomatedDesk(role);
  return (
    <span
      className={`mt-0.5 inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${automated ? 'border-sky-400/40 bg-sky-400/10 text-sky-200' : 'border-amber-400/40 bg-amber-400/10 text-amber-200'}`}
      data-testid="workspace-desk-kind"
      data-automated={automated}
    >
      {m(automated ? 'deskKindAutomated' : 'deskKindHuman')}
    </span>
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
  /** Decides the head case; returns the result, the role's error count, and the XP booked and streak after it. `assisted`: Expert advice was revealed. */
  onDecide: (caseId: string, decision: StaffDecision, latencySec: number, expert: boolean, assisted?: boolean) => { result: StaffDecisionResult; errors: number; xp?: number; combo?: number };
  /** Instant: another task at the same desk. */
  onTaskChange: (task: StaffTaskNo) => void;
  /** Called only after the learner confirmed the switch dialog. */
  onSwitchRole: (role: StaffRoleId) => void;
  /** The Time-Attack challenge, held by the caller so it outlives remounts. */
  challenge?: ChallengeState;
  challengeControls?: ChallengeControls;
  /** Incident Mode (on by default) and the crisis event running at this desk. */
  incidentMode?: boolean;
  incident?: ActiveIncident | null;
  onToggleIncidentMode?: () => void;
  /** Lifetime career (XP, badges) and the badges waiting for their celebration. */
  career?: CareerProgress;
  badgeUnlocks?: readonly BadgeId[];
  onDismissBadgeUnlock?: () => void;
  /** The retail core ledger and its reset. */
  ledger?: RetailLedger;
  onResetLedger?: () => void;
  /** The session's audit trail, for the export. */
  auditLog?: readonly AuditEntry[];
}

const NO_CHALLENGE: ChallengeState = { run: null, finished: null };
const NO_UNLOCKS: readonly BadgeId[] = [];
const OPENING_LEDGER = openingLedger();
const NO_AUDIT: readonly AuditEntry[] = [];
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
  incidentMode = true,
  incident = null,
  onToggleIncidentMode = () => undefined,
  career = EMPTY_CAREER,
  badgeUnlocks = NO_UNLOCKS,
  onDismissBadgeUnlock = () => undefined,
  ledger = OPENING_LEDGER,
  onResetLedger = () => undefined,
  auditLog = NO_AUDIT,
}: AnalystWorkspaceViewProps) {
  const [badgesOpen, setBadgesOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  /** The case whose advice the learner revealed in Expert mode. */
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  /** The Decision Support card starts collapsed; Standard mode keeps the learner's choice, Expert mode asks again per case. */
  const [isCollapsed, setIsCollapsed] = useState(true);
  const unlock = badgeUnlocks[0] ?? null;
  const terms = useTerms();
  const m = useMessages(analystWorkspaceMessages);
  const [mode, setMode] = useState<WorkspaceMode>(initialMode);
  const [consequence, setConsequence] = useState<Consequence | null>(null);
  const [pendingRole, setPendingRole] = useState<StaffRoleId | null>(null);
  const remainingSec = useCountdown(challenge.run, cc.tick);
  const role = roleForStation(desk);
  const current = cases[0] ?? null;
  const incidentId = incident?.id ?? null;
  const sla = incidentSlaSeconds(incidentId);
  const masked = useMemo(() => (current ? maskedFields(current, incidentId) : NONE_MASKED), [current, incidentId]);
  const elapsed = useCaseTimer(consequence ? null : (current?.id ?? null)) * incidentClockRate(incidentId);
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;

  useEffect(() => {
    if (!consequence) return;
    const t = window.setTimeout(() => setConsequence(null), CONSEQUENCE_MS);
    return () => window.clearTimeout(t);
  }, [consequence]);

  const decide = useCallback(
    (d: StaffDecision) => {
      if (!current || !role || consequence || pendingRole || challenge.finished || unlock || badgesOpen || ledgerOpen || auditOpen) return;
      const latency = elapsedRef.current;
      const assisted = mode === 'expert' && revealedFor === current.id;
      const { result, errors, xp, combo } = onDecide(current.id, d, latency, mode === 'expert', assisted);
      if (!result.ok) return;
      const streak = combo ?? (result.correct ? (shift.comboCount ?? 0) + 1 : 0);
      if (uiStore.getState().soundOn) play(reviewSound(result.correct, streak));
      if (challenge.run) {
        const rules = incidentRules(incidentId);
        cc.record(result.correct, latency);
        setConsequence({ result, role, drill: current.drill, retail: current.retail?.id, errors, xp, combo: streak, assisted, points: challengePoints(result.correct, latency, rules), bonus: result.correct ? challengeBonus(latency, rules) : 0 });
      } else setConsequence({ result, role, drill: current.drill, retail: current.retail?.id, errors, xp, combo: streak, assisted });
    },
    [current, role, consequence, pendingRole, onDecide, challenge, cc, shift.comboCount, incidentId, mode, unlock, badgesOpen, ledgerOpen, auditOpen, revealedFor],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.key === 'Escape') {
        if (unlock) onDismissBadgeUnlock();
        else if (auditOpen) setAuditOpen(false);
        else if (ledgerOpen) setLedgerOpen(false);
        else if (badgesOpen) setBadgesOpen(false);
        else if (challenge.finished) cc.dismiss();
        else if (pendingRole) setPendingRole(null);
        else onClose();
      } else if (pendingRole || challenge.finished || unlock || badgesOpen || ledgerOpen || auditOpen) return;
      else if (e.key === 'a' || e.key === 'A') decide('APPROVE');
      else if (e.key === 'r' || e.key === 'R') decide('REJECT');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, decide, pendingRole, challenge, cc, unlock, badgesOpen, ledgerOpen, auditOpen, onDismissBadgeUnlock]);

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
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="analyst-workspace-title"
        data-testid="analyst-workspace"
        data-station={desk}
        data-role={role}
        data-mode={mode}
        data-challenge={challenge.run ? 'running' : undefined}
        data-combo-tier={tier}
        data-incident={incidentId ?? undefined}
        className={`relative flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border bg-slate-950 shadow-2xl transition-shadow duration-500 ${incidentId === 'AUDIT_DAY' ? 'border-rose-500/80' : tier === 'zone' ? 'border-amber-300/80' : 'border-slate-700'}`}
        style={{ boxShadow: glow }}
      >
        {/* Two wrapping rows that never overlap: identity and pickers first, then the toolbar; every item keeps its own width. */}
        <header className="relative z-20 flex flex-col gap-2 border-b border-slate-800 bg-slate-950 px-4 py-2.5" data-testid="workspace-header">
          <div className="flex flex-wrap items-center gap-3">
            <CareerCard career={career} m={m} />
            <div className="min-w-[13rem] max-w-[22rem] flex-1 basis-[13rem]">
              <h2 id="analyst-workspace-title" className="whitespace-normal break-normal text-[14px] font-bold leading-tight text-slate-50">
                {m('title')}
              </h2>
              <DeskKindBadge role={role} m={m} />
              <p className="whitespace-normal break-normal text-[11px] leading-snug text-slate-500">
                {m('paused')} · {m('keysHint')}
              </p>
            </div>
            <div className="relative z-10 flex flex-wrap items-center gap-3" data-testid="workspace-pickers">
              <RolePicker role={role} onPick={pickRole} m={m} />
              <TaskPicker role={role} task={task} onPick={onTaskChange} m={m} />
            </div>
            <button type="button" onClick={onClose} data-testid="workspace-close" className="ml-auto shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-[12px] font-medium text-slate-200 transition hover:bg-slate-800">
              {m('close')}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3" data-testid="workspace-toolbar">
            <IncidentToggle on={incidentMode} onToggle={onToggleIncidentMode} m={m} />
            <BadgesButton unlocked={career.badges.length} onOpen={() => setBadgesOpen(true)} m={m} />
            <CoreLedgerCard kpis={retailKpis(ledger)} onOpen={() => setLedgerOpen(true)} m={m} />
            <AuditButton count={auditLog.length} onOpen={() => setAuditOpen(true)} m={m} />
            <div className="flex items-center gap-3 sm:ml-auto">
              <SoundToggle m={m} />
              <LanguageToggle variant="globe" testId="workspace-language" />
              <ModeToggle mode={mode} onChange={setMode} m={m} />
              <ChallengeToggle running={challenge.run !== null} remainingSec={remainingSec} onStart={cc.start} onStop={cc.stop} m={m} />
            </div>
          </div>
        </header>
        {incident && <IncidentBanner incident={incident} reviews={shift.reviews} sla={sla} m={m} />}
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(250px,300px)_minmax(0,1fr)_minmax(230px,270px)] lg:overflow-hidden">
          <MissionPanel role={role} task={task} mode={mode} m={m} deskName={terms.stationTitle(desk)} sla={sla} />
          <ScenarioCard
            current={current}
            queued={Math.max(0, cases.length - 1)}
            elapsed={elapsed}
            mode={mode}
            m={m}
            onAdvance={onAdvance}
            canAdvance={canAdvance}
            showDrill={task === RANDOM_TASK}
            sla={sla}
            masked={masked}
            adviceRevealed={current !== null && !isCollapsed && (mode === 'standard' || revealedFor === current.id)}
            onRevealAdvice={() => {
              if (!current) return;
              setIsCollapsed(false);
              if (mode === 'expert') setRevealedFor(current.id);
            }}
            onHideAdvice={() => setIsCollapsed(true)}
          />
          <DecisionPanel
            shift={shift}
            current={current}
            onDecide={decide}
            consequence={consequence}
            mode={mode}
            m={m}
            challenge={challenge.run ? { tally: challenge.run.tally, remainingSec } : null}
            ledger={task === RETAIL_TASK ? ledger : null}
            onOpenLedger={() => setLedgerOpen(true)}
          />
        </div>
        {incidentId === 'POWER_GRID_FAILOVER' && <PowerFlicker />}
        {consequence && !consequence.result.correct && <SopViolationPulse m={m} />}
        {challenge.finished && <ChallengeScorecard tally={challenge.finished} m={m} onAgain={cc.start} onClose={cc.dismiss} onExport={() => setAuditOpen(true)} />}
        {auditOpen && <AuditExportDialog log={auditLog} m={m} onClose={() => setAuditOpen(false)} initialView={mode === 'expert' ? 'advanced' : 'basic'} />}
        {badgesOpen && <BadgeDrawer career={career} m={m} onClose={() => setBadgesOpen(false)} />}
        {ledgerOpen && <CoreLedgerSheet ledger={ledger} m={m} onClose={() => setLedgerOpen(false)} onReset={onResetLedger} initialView={mode === 'expert' ? 'advanced' : 'basic'} />}
        {unlock && <BadgeUnlockModal key={unlock} badge={unlock} m={m} onClose={onDismissBadgeUnlock} />}
        {pendingRole && <SwitchDeskDialog target={pendingRole} m={m} onCancel={() => setPendingRole(null)} onConfirm={confirmSwitch} />}
      </div>
    </div>
  );
}

/** The store-connected modal: open while `staffDesk` is set. Cases come from the 28-task matrix or the desk's retail queue. */
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
  const ledger = useBankStore((s) => s.retailLedger);
  const resetLedger = useBankStore((s) => s.resetRetailLedger);
  const auditLog = useBankStore((s) => s.auditLog);
  const setTask = useBankStore((s) => s.setStaffTask);
  const switchDesk = useBankStore((s) => s.switchStaffDesk);
  const step = useBankStore((s) => s.step);
  const dayOver = useBankStore((s) => s.view.dayOver);
  const termMode = useBankStore((s) => s.termMode);
  const incidentMode = useBankStore((s) => s.staffIncidentMode);
  const incident = useBankStore((s) => s.staffIncident);
  const setIncidentMode = useBankStore((s) => s.setIncidentMode);
  const incidentId = incident?.id ?? null;
  const cases = useMemo(() => (role ? taskDeck(role, task, seq, 4, incidentId) : []), [role, task, seq, incidentId]);
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
    (caseId, decision, latencySec, expert, assisted) => {
      const before = role ? (bankStore.getState().staffShift[role] ?? EMPTY_SHIFT) : EMPTY_SHIFT;
      const result = train(caseId, decision, latencySec, incidentSlaSeconds(bankStore.getState().staffIncident?.id), expert, assisted);
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
      incidentMode={incidentMode}
      incident={incident}
      onToggleIncidentMode={() => setIncidentMode(!incidentMode)}
      career={career}
      badgeUnlocks={badgeUnlocks}
      onDismissBadgeUnlock={dismissBadgeUnlock}
      ledger={ledger}
      onResetLedger={resetLedger}
      auditLog={auditLog}
    />
  );
}
