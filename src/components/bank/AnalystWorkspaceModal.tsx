import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AML_POLICY, CTR_THRESHOLD_CENTS, DISPUTE_SLA_DAYS, EKYC_POLICY, FDS_POLICY } from '../../sim/amlEngine';
import { formatMoney } from '../../sim/kpis';
import { localizeScenarioText } from '../../sim/scenarios';
import { ROLE_ICON, roleForStation, SHIFT_TARGET, STAFF_SLA_SECONDS, STAFF_SOP, type StaffCase, type StaffDecision, type StaffField, type StaffRoleId } from '../../sim/staffRoleplay';
import { DEPARTMENTS, STATIONS } from '../../sim/topology';
import { EMPTY_SHIFT, useBankStore } from '../../store/bankStore';
import { useLocale, useMessages, type Translate } from '../../utils/i18nHelper';
import { analystWorkspaceMessages, type AnalystWorkspaceKey } from './analystWorkspace.messages';
import { useTerms } from './useTerms';

/**
 * Phase 8 Step 2: the Staff Roleplay Workspace. Three columns: the mission brief and SOP matrix (A), the payload card of the
 * review at the head of the desk's queue (B), and the decision buttons with the shift objective (C). Decisions go through
 * useBankStore.staffDecide, which works the packet in the simulation and books the desk's roleplay metrics.
 */

type M = Translate<AnalystWorkspaceKey>;
type Values = Record<string, string | number>;

const money = (cents: number): string => formatMoney(cents);

/** The numbers each role's SOP lines quote, read from the engine's policies so the cheat sheet never drifts. */
function sopValues(role: StaffRoleId, bnplMinScore: number): Values {
  switch (role) {
    case 'aml':
      return { sanction: AML_POLICY.sanctionMatchAt, velocity: STAFF_SOP.amlVelocityBlockAt, xb: money(AML_POLICY.largeCrossBorderCents) };
    case 'dispute':
      return { cb: DISPUTE_SLA_DAYS.CHARGEBACK, ret: DISPUTE_SLA_DAYS.PACS004_RETURN, atm: DISPUTE_SLA_DAYS.ATM_MISMATCH };
    case 'bnpl':
      return { min: bnplMinScore, dti: STAFF_SOP.bnplDtiMaxPct, missed: STAFF_SOP.bnplMaxMissed };
    case 'cashier':
      return { ctr: money(CTR_THRESHOLD_CENTS) };
    case 'ekyc':
      return { face: EKYC_POLICY.faceMatchMin, live: EKYC_POLICY.livenessMin, ocr: EKYC_POLICY.ocrMinPct, tamper: EKYC_POLICY.tamperMax };
    case 'fds':
      return { ip: FDS_POLICY.ip, root: FDS_POLICY.root, bin: FDS_POLICY.bin, nd: FDS_POLICY.newDevice, high: FDS_POLICY.highRiskAt };
    case 'swift':
      return {};
  }
}

const SOP_KEYS: Readonly<Record<StaffRoleId, readonly AnalystWorkspaceKey[]>> = {
  aml: ['sop_aml_1', 'sop_aml_2', 'sop_aml_3', 'sop_aml_4'],
  dispute: ['sop_dispute_1', 'sop_dispute_2', 'sop_dispute_3', 'sop_dispute_4'],
  bnpl: ['sop_bnpl_1', 'sop_bnpl_2', 'sop_bnpl_3', 'sop_bnpl_4'],
  cashier: ['sop_cashier_1', 'sop_cashier_2', 'sop_cashier_3', 'sop_cashier_4'],
  ekyc: ['sop_ekyc_1', 'sop_ekyc_2', 'sop_ekyc_3', 'sop_ekyc_4'],
  fds: ['sop_fds_1', 'sop_fds_2', 'sop_fds_3'],
  swift: ['sop_swift_1', 'sop_swift_2', 'sop_swift_3', 'sop_swift_4'],
};

function fieldText(f: StaffField, m: M, locale: ReturnType<typeof useLocale>): string {
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
      return m(`val_${v.key}` as AnalystWorkspaceKey);
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

function MissionPanel({ role, m, bnplMinScore, deskName }: { role: StaffRoleId; m: M; bnplMinScore: number; deskName: string }) {
  const values = sopValues(role, bnplMinScore);
  return (
    <section className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/50 p-3.5" data-testid="workspace-mission">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{m('missionBrief')}</div>
        <h3 className="mt-1 flex items-center gap-2 text-[15px] font-bold text-slate-50" data-testid="workspace-role">
          <span aria-hidden="true">{ROLE_ICON[role]}</span>
          {m(`role_${role}_title` as AnalystWorkspaceKey)}
        </h3>
        <div className="text-[11px] text-sky-300/90">{deskName}</div>
        <p className="mt-2 text-[12px] leading-snug text-slate-300">{m(`role_${role}_brief` as AnalystWorkspaceKey)}</p>
        <div className="mt-2 inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200" data-testid="workspace-sla">
          {m('slaTarget', { sec: STAFF_SLA_SECONDS })}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{m('sopTitle')}</div>
        <ol className="space-y-1.5" data-testid="workspace-sop">
          {SOP_KEYS[role].map((key, i) => (
            <li key={key} className="flex gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-1.5 text-[12px] leading-snug text-slate-200">
              <span className="font-mono text-[10px] text-slate-500">{i + 1}</span>
              <span>{m(key, values)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function PayloadPanel({ current, queued, elapsed, m, onAdvance, canAdvance }: { current: StaffCase | null; queued: number; elapsed: number; m: M; onAdvance: () => void; canAdvance: boolean }) {
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
  const left = STAFF_SLA_SECONDS - elapsed;
  const late = left < 0;
  return (
    <section className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/50 p-3.5" data-testid="workspace-payload" data-case={current.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{m('payloadTitle')}</div>
          <div className="mt-1 truncate text-[14px] font-semibold text-slate-50">{localizeScenarioText(current.scenario, locale) || current.id}</div>
          <div className="font-mono text-[10.5px] text-slate-500">
            {current.id} · {m('waited', { min: current.waitedMin })}
            {queued > 0 && ` · ${m('queueAhead', { n: queued })}`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{m('amount')}</div>
          <div className="text-[16px] font-bold tabular-nums text-slate-50">{money(current.amountCents)}</div>
          <div className={`mt-0.5 text-[11px] font-semibold tabular-nums ${late ? 'text-rose-300' : left < 10 ? 'text-amber-300' : 'text-emerald-300'}`} data-testid="workspace-timer" data-late={late || undefined}>
            {late ? m('slaBreached') : m('slaTimer', { sec: Math.ceil(left) })}
          </div>
        </div>
      </div>
      <dl className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950/40 text-[12.5px]" data-testid="workspace-fields">
        {current.fields.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-3 px-3 py-2" data-field={f.key} data-flag={f.flag || undefined}>
            <dt className="text-slate-400">{m(`field_${f.key}` as AnalystWorkspaceKey)}</dt>
            <dd className={`flex items-center gap-1.5 text-right font-medium tabular-nums ${f.flag ? 'text-rose-300' : 'text-slate-100'}`}>
              {f.flag && (
                <span className="rounded bg-rose-500/15 px-1 py-px text-[9.5px] font-bold uppercase tracking-wide text-rose-300" title={m('breach')}>
                  ⚠
                </span>
              )}
              <span className="break-all">{fieldText(f, m, locale)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DecisionPanel({ role, current, onDecide, m }: { role: StaffRoleId; current: StaffCase | null; onDecide: (d: StaffDecision) => void; m: M }) {
  const shift = useBankStore((s) => s.staffShift[role]) ?? EMPTY_SHIFT;
  const accuracy = shift.reviews > 0 ? (shift.correct / shift.reviews) * 100 : 0;
  const met = shift.reviews >= SHIFT_TARGET.reviews && accuracy > SHIFT_TARGET.accuracyPct;
  const progress = Math.min(1, shift.reviews / SHIFT_TARGET.reviews);
  const last = shift.last;
  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3.5" data-testid="workspace-decision">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{m('actionsTitle')}</div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        <button type="button" disabled={!current} onClick={() => onDecide('APPROVE')} data-testid="workspace-approve" className="rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-3 py-2.5 text-[13px] font-bold text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40">
          {m('approve')}
        </button>
        <button type="button" disabled={!current} onClick={() => onDecide('REJECT')} data-testid="workspace-reject" className="rounded-xl border border-rose-400/50 bg-rose-500/15 px-3 py-2.5 text-[13px] font-bold text-rose-100 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40">
          {m('reject')}
        </button>
      </div>
      {last && (
        <div className={`rounded-lg border px-2.5 py-2 text-[12px] leading-snug ${last.correct ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100' : 'border-rose-500/40 bg-rose-500/10 text-rose-100'}`} data-testid="workspace-feedback" data-correct={last.correct}>
          <div className="font-semibold">{last.correct ? m('correct') : m('incorrect', { expected: m(last.expected === 'REJECT' ? 'expectedREJECT' : 'expectedAPPROVE') })}</div>
          <div className="mt-0.5 font-mono text-[10.5px] opacity-80">{m('statusCode', { code: last.statusCode })}</div>
        </div>
      )}
      <div className="mt-auto rounded-xl border border-slate-800 bg-slate-950/50 p-2.5" data-testid="workspace-shift" data-met={met || undefined}>
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <span>{m('shiftTitle')}</span>
        </div>
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
    </section>
  );
}

export function AnalystWorkspaceModal() {
  const desk = useBankStore((s) => s.staffDesk);
  const cases = useBankStore((s) => (s.staffDesk ? s.pendingQueueMap[s.staffDesk] : undefined));
  const close = useBankStore((s) => s.closeStaffDesk);
  const decide = useBankStore((s) => s.staffDecide);
  const step = useBankStore((s) => s.step);
  const dayOver = useBankStore((s) => s.view.dayOver);
  const bnplMinScore = useBankStore((s) => s.sim.rules.bnplMinScore);
  const terms = useTerms();
  const m = useMessages(analystWorkspaceMessages);
  const role = desk ? roleForStation(desk) : null;
  const current = cases?.[0] ?? null;
  const elapsed = useCaseTimer(current?.id ?? null);
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;

  const onDecide = useCallback(
    (d: StaffDecision) => {
      if (current) decide(current.id, d, elapsedRef.current, STAFF_SLA_SECONDS);
    },
    [current, decide],
  );

  useEffect(() => {
    if (!desk) return;
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'a' || e.key === 'A') onDecide('APPROVE');
      else if (e.key === 'r' || e.key === 'R') onDecide('REJECT');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [desk, close, onDecide]);

  const accent = useMemo(() => (desk ? DEPARTMENTS[STATIONS[desk].department].accent : '#38bdf8'), [desk]);
  if (!desk || !role) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && close()} data-testid="analyst-workspace-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="analyst-workspace-title" data-testid="analyst-workspace" data-station={desk} data-role={role} className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl" style={{ boxShadow: `0 0 0 1px ${accent}33, 0 24px 60px rgba(0,0,0,0.55)` }}>
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-2.5">
          <div className="min-w-0">
            <h2 id="analyst-workspace-title" className="text-[14px] font-bold text-slate-50">
              {m('title')}
            </h2>
            <p className="text-[11px] text-slate-500">
              {m('paused')} · {m('keysHint')}
            </p>
          </div>
          <button type="button" onClick={close} data-testid="workspace-close" className="rounded-lg border border-slate-700 px-3 py-1.5 text-[12px] font-medium text-slate-200 transition hover:bg-slate-800">
            {m('close')}
          </button>
        </header>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(250px,300px)_1fr_minmax(230px,270px)] lg:overflow-hidden">
          <MissionPanel role={role} m={m} bnplMinScore={bnplMinScore} deskName={terms.stationTitle(desk)} />
          <PayloadPanel current={current} queued={Math.max(0, (cases?.length ?? 0) - 1)} elapsed={elapsed} m={m} onAdvance={step} canAdvance={!dayOver} />
          <DecisionPanel role={role} current={current} onDecide={onDecide} m={m} />
        </div>
      </div>
    </div>
  );
}
