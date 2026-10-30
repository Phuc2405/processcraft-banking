import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatClock } from '../../sim/clock';
import { formatMoney } from '../../sim/kpis';
import {
  AML_PATHS,
  amlScorecard,
  badgeOfState,
  DESK_FILTERS,
  deskBadge,
  EDD_ACTIONS_AT,
  HISTORY_PAGE,
  inDeskFilter,
  type DeskBadge,
  type DeskFilter,
  eddTimeline,
  EXTREME_MULTIPLE,
  quadrantOf,
  volumeMultiple,
  type EddAction,
  type EddTimeline,
  type AmlScorecard,
  type CaseRecord,
  type ReviewCase,
} from '../../sim/amlReview';
import { amlStore, useAmlStore } from '../../store/amlStore';
import { REHAB_STREAK } from '../../engine/penaltyEngine';
import { useMessages, type Translate } from '../../utils/i18nHelper';
import { amlDecisionMessages } from './amlDecision.messages';

/** The AML desk's what-if review: the four paths on a case, what follows from each, the branch escalation, EDD, tipping-off and the scorecard. */

type M = Translate<keyof typeof amlDecisionMessages.messages>;
type Key = keyof typeof amlDecisionMessages.messages;
const k = (key: string): Key => key as Key;

/** The bank's minute counted from day 1, 00:00: the clock EDD's 24 hours run on. */
export const bankNow = (day: number, minute: number): number => (day - 1) * 1440 + minute;

const BADGE_TONE: Readonly<Record<DeskBadge, string>> = {
  OPEN: 'bg-slate-800 text-slate-200',
  ESCALATED: 'bg-amber-500/20 text-amber-100',
  FROZEN: 'bg-sky-500/15 text-sky-200',
  PENDING_EDD: 'bg-violet-500/20 text-violet-100',
  EDD_DOCS: 'bg-sky-500/20 text-sky-100',
  EDD_LATE_DOCS: 'bg-amber-500/20 text-amber-100',
  EDD_EXPIRED: 'bg-rose-500/15 text-rose-200',
  SAR_FILED: 'bg-rose-500/20 text-rose-100',
  SEIZED: 'bg-sky-500/20 text-sky-100',
  EDD_REJECTED: 'bg-rose-500/15 text-rose-200',
  SAR_REJECTED: 'bg-amber-500/15 text-amber-200',
  DONE: 'bg-lime-500/15 text-lime-200',
};

/** A case's badge: where it truly stands now (documents in or not, overdue, at the FIU, resolved), one short line with its icon. */
export function StateBadge({
  record,
  state: given,
  now = 0,
  m,
}: {
  record?: CaseRecord | undefined;
  state?: CaseRecord['state'];
  /** The bank's minute: whether EDD documents are in. */ now?: number;
  m: M;
}) {
  const badge = record ? deskBadge(record, now) : badgeOfState(given ?? 'OPEN');
  return (
    <span
      className={`inline-block max-w-full truncate whitespace-nowrap rounded-full px-2 py-0.5 align-middle text-[11.5px] font-bold ${BADGE_TONE[badge]}`}
      title={m(k(`state_${badge}`))}
      data-testid="aml-case-state"
      data-state={badge}
    >
      {m(k(`state_${badge}`))}
    </span>
  );
}

export type DeskSort = 'NEWEST' | 'OLDEST';
export interface DeskView {
  filter: DeskFilter;
  sort: DeskSort;
  page: number;
}
export const DEFAULT_DESK_VIEW: DeskView = {
  filter: 'ACTION',
  sort: 'NEWEST',
  page: 0,
};

/** One desk list as the controls ask for it: filtered (needs action by default), sorted (newest first by default), and the history paged
 *  HISTORY_PAGE at a time. Also how many cases each filter holds. */
export function deskList<T>(
  items: readonly T[],
  view: DeskView,
  record: (x: T) => CaseRecord | undefined,
  when: (x: T) => number,
  now: number,
): { shown: T[]; counts: Record<DeskFilter, number>; pages: number } {
  const counts = Object.fromEntries(DESK_FILTERS.map((f) => [f, items.filter((x) => inDeskFilter(f, record(x), now)).length])) as Record<DeskFilter, number>;
  const sorted = items.filter((x) => inDeskFilter(view.filter, record(x), now)).sort((a, b) => (view.sort === 'NEWEST' ? when(b) - when(a) : when(a) - when(b)));
  if (view.filter !== 'HISTORY') return { shown: sorted, counts, pages: 1 };
  const pages = Math.max(1, Math.ceil(sorted.length / HISTORY_PAGE));
  const page = Math.min(view.page, pages - 1);
  return {
    shown: sorted.slice(page * HISTORY_PAGE, (page + 1) * HISTORY_PAGE),
    counts,
    pages,
  };
}

/** The list's controls: the filter chips with their counts, and the sort. */
export function DeskListControls({ view, onView, counts, m }: { view: DeskView; onView: (v: DeskView) => void; counts: Record<DeskFilter, number>; m: M }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="aml-desk-controls">
      <div className="flex flex-wrap gap-1" role="group" aria-label={m('filterLabel')}>
        {DESK_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={view.filter === f}
            data-testid={`aml-filter-${f}`}
            onClick={() => onView({ ...view, filter: f, page: 0 })}
            className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12.5px] font-semibold transition ${view.filter === f ? 'border-sky-300 bg-sky-500/20 text-sky-50' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
          >
            {m(k(`filter_${f}`))} <span className="tabular-nums opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>
      <span className="flex-1" />
      <label className="flex items-center gap-1.5 text-[12.5px] text-slate-400">
        {m('sortLabel')}
        <select
          value={view.sort}
          onChange={(e) => onView({ ...view, sort: e.target.value as DeskSort, page: 0 })}
          data-testid="aml-sort"
          className="rounded-md border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[12.5px] text-slate-100"
        >
          <option value="NEWEST">{m('sort_NEWEST')}</option>
          <option value="OLDEST">{m('sort_OLDEST')}</option>
        </select>
      </label>
    </div>
  );
}

/** Under the history: the pager, and the note on the 200-case cap. */
export function HistoryFooter({ view, onView, pages, m }: { view: DeskView; onView: (v: DeskView) => void; pages: number; m: M }) {
  if (view.filter !== 'HISTORY') return null;
  const page = Math.min(view.page, pages - 1);
  return (
    <div className="mt-2 space-y-1.5" data-testid="aml-history-footer">
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-[13px]">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => onView({ ...view, page: page - 1 })}
            className="rounded-md px-2 py-0.5 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800 disabled:opacity-40"
          >
            {m('pagePrev')}
          </button>
          <span className="tabular-nums text-slate-400">{m('pageOf', { page: page + 1, pages })}</span>
          <button
            type="button"
            disabled={page >= pages - 1}
            onClick={() => onView({ ...view, page: page + 1 })}
            className="rounded-md px-2 py-0.5 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800 disabled:opacity-40"
          >
            {m('pageNext')}
          </button>
        </div>
      )}
      <p className="text-center text-[12px] italic text-slate-500" data-testid="aml-history-note">
        {m('historyNote')}
      </p>
    </div>
  );
}

/** The hint: the case's money against a normal month for this customer, and whether that is an extreme red flag. */
export function RedFlagHint({ c, m }: { c: ReviewCase; m: M }) {
  const x = volumeMultiple(c);
  const extreme = x > EXTREME_MULTIPLE;
  return (
    <p
      className={`rounded-lg px-2.5 py-1.5 text-[13px] font-semibold ${extreme ? 'border border-rose-400/60 bg-rose-950/50 text-rose-100' : 'border border-slate-700 text-slate-300'}`}
      data-testid="aml-kyc-multiple"
    >
      {m('kycMultiple', { x })} · {extreme ? <b className="text-rose-300">🚩 {m('kycExtreme')}</b> : m('kycFits')}
    </p>
  );
}

/** [💡 Xem gợi ý (-50% thưởng)]: shows the case's red-flag analysis, at the price of half its reward. */
export function HintToggle({ caseId, m }: { caseId: string; m: M }) {
  const shown = useAmlStore((s) => s.hintsShown[caseId] === true);
  const used = useAmlStore((s) => s.hintsUsed[caseId] === true);
  return (
    <>
      <button
        type="button"
        onClick={() => amlStore.getState().toggleHint(caseId)}
        aria-pressed={shown}
        title={m('hintTip')}
        data-testid="aml-hint-toggle"
        className={`rounded-full border px-2.5 py-0.5 text-[12.5px] font-semibold transition ${shown ? 'border-amber-300 bg-amber-400/15 text-amber-50' : 'border-amber-400/50 text-amber-200 hover:bg-amber-500/10'}`}
      >
        {shown ? m('hintHide') : m('hintShow')}
      </button>
      {used && !shown && (
        <span className="text-[12px] font-semibold text-amber-300/90" data-testid="aml-hint-used">
          {m('hintUsedTag')}
        </span>
      )}
    </>
  );
}

const EDD_BUTTON: Readonly<Record<EddAction, string>> = {
  RELEASE: 'bg-lime-400 text-slate-950 hover:bg-lime-300',
  SAR: 'bg-rose-500 text-white hover:bg-rose-400',
  REFUSE: 'border border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700',
  UNLOCK: 'border border-amber-400/70 bg-amber-950 text-amber-100 hover:bg-amber-900',
};
const TIMELINE_TONE: Readonly<Record<EddTimeline, string>> = {
  WAITING: 'border-violet-400/50 bg-violet-500/10 text-violet-100',
  ON_TIME: 'border-lime-400/50 bg-lime-500/10 text-lime-100',
  LATE: 'border-amber-400/50 bg-amber-500/10 text-amber-100',
  STALLING: 'border-rose-400/50 bg-rose-500/10 text-rose-100',
};

/** An EDD case on its timeline (on time, late, stalling): where it stands, the proof if any, and the decisions open at this point. */
export function EddPanel({ c, record, now, m, onResolved }: { c: ReviewCase; record: CaseRecord; now: number; m: M; onResolved?: (() => void) | undefined }) {
  const t = eddTimeline(record, now);
  if (!t) return null;
  const docs = t === 'ON_TIME' || t === 'LATE';
  const label = (a: EddAction): string => (a === 'RELEASE' ? m('eddApprove') : a === 'REFUSE' ? m('eddReject') : a === 'UNLOCK' ? m('eddUnlock') : t === 'STALLING' ? m('eddSarStall') : m('eddSar'));
  const hint = (a: EddAction): string => m(k(a === 'SAR' && t === 'STALLING' ? 'eddHint_SAR_STALL' : `eddHint_${a}`));
  return (
    <div className="space-y-1.5" data-testid="aml-edd" data-timeline={t}>
      <p className={`inline-flex rounded-full border px-2.5 py-0.5 text-[12.5px] font-bold ${TIMELINE_TONE[t]}`} data-testid="aml-edd-timeline">
        {m(k(`timeline_${t}`))}
      </p>
      {t === 'WAITING' && (
        <>
          <p className="text-[13.5px] font-semibold tabular-nums text-violet-100" data-testid="aml-edd-countdown">
            ⏳ {m('eddCountdown', { left: hhmm((record.eddDue ?? now) - now) })}
          </p>
          <p className="text-[13.5px] italic text-slate-400">{m('eddWaiting')}</p>
        </>
      )}
      {docs && (
        <>
          <p className="text-[13.5px] text-slate-200">
            {m(t === 'LATE' ? 'eddLateUploaded' : 'eddUploaded', {
              doc: m(k(`edd_${c.edd.kind}`)),
            })}
          </p>
          <p className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-[13px] text-slate-200" data-testid="aml-edd-doc">
            {c.edd.genuine ? m('eddGenuine') : m('eddForged')}
          </p>
        </>
      )}
      {t === 'STALLING' && <p className="text-[13px] italic text-rose-200/90">{m('eddStallWait')}</p>}
      {EDD_ACTIONS_AT[t].length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {EDD_ACTIONS_AT[t].map((a) => (
            <button
              key={a}
              type="button"
              data-testid={`aml-edd-${a === 'RELEASE' ? 'approve' : a === 'REFUSE' ? 'reject' : a.toLowerCase()}`}
              onClick={() => {
                amlStore.getState().judgeEdd(c, a, now);
                onResolved?.();
              }}
              className={`rounded-lg px-3 py-1.5 text-left text-[13.5px] font-bold transition ${EDD_BUTTON[a]}`}
            >
              {label(a)}
              <span className="mt-0.5 block text-[12px] font-medium leading-snug opacity-80">{hint(a)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Where a settled hold or release sits in the freeze/release matrix (the four quadrants). */
export function QuadrantNote({ c, record, m }: { c: ReviewCase; record: CaseRecord; m: M }) {
  const q = quadrantOf(c, record);
  if (!q) return null;
  const bad = q === 'WRONG_FREEZE' || q === 'LEAK';
  return (
    <p
      className={`rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold ${bad ? 'border-rose-400/50 bg-rose-950/40 text-rose-100' : 'border-lime-400/40 bg-lime-950/30 text-lime-100'}`}
      data-testid="aml-quadrant"
      data-quadrant={q}
      title={m('quadTitle')}
    >
      {m(k(`quad_${q}`))}
    </p>
  );
}

const hhmm = (minutes: number): string => `${Math.floor(Math.max(0, minutes) / 60)}h ${String(Math.round(Math.max(0, minutes) % 60)).padStart(2, '0')}m`;

/** The four paths on an open case, or what became of it: its state, the ledger effect, any fine, and the follow-ups (EDD proof, tipping-off). */
export function CaseActions({
  c,
  now,
  onFileSar,
  onResolved,
  showHint = false,
}: {
  c: ReviewCase;
  now: number;
  /** The SAR path opens the SAR form first (it books the decision once filed). */
  onFileSar?: () => void;
  /** The EDD proof was approved or rejected: the case is settled, so the view goes back to its list. */
  onResolved?: () => void;
  /** Shows the SOP hint whatever the store says (a static render). */
  showHint?: boolean;
}) {
  const m = useMessages(amlDecisionMessages);
  const record = useAmlStore((s) => s.reviews[c.id]);
  const pending = useAmlStore((s) => s.escalations.some((e) => e.caseId === c.id));
  const hinted = useAmlStore((s) => s.hintsShown[c.id] === true) || showHint;
  if (!record) {
    return (
      <div className="space-y-2" data-testid="aml-paths">
        <SopGuide c={c} m={m} />
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-[13px] font-bold uppercase tracking-wider text-slate-400">{m('choosePath')}</h4>
          <HintToggle caseId={c.id} m={m} />
        </div>
        {hinted && <RedFlagHint c={c} m={m} />}
        <div className="grid gap-2 sm:grid-cols-2">
          {AML_PATHS.map((path) => (
            <button
              key={path}
              type="button"
              data-testid={`aml-path-${path}`}
              onClick={() => (path === 'FILE_SAR' && onFileSar ? onFileSar() : amlStore.getState().decide(c, path, now))}
              className={`rounded-xl border px-3 py-2 text-left transition ${path === 'FALSE_POSITIVE' ? 'border-slate-600 hover:bg-slate-800' : path === 'FILE_SAR' ? 'border-rose-400/60 hover:bg-rose-500/10' : 'border-amber-400/50 hover:bg-amber-500/10'}`}
            >
              <span className="block text-[14px] font-bold text-slate-50">{m(k(`path_${path}`))}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-400">
                {m(k(`pathHint_${path}`), {
                  amount: formatMoney(c.amountCents),
                })}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-950/50 p-3" data-testid="aml-outcome" data-path={record.path}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-bold text-slate-100">{m(k(`path_${record.path}`))}</span>
        <StateBadge record={record} now={now} m={m} />
      </div>
      <p className="font-mono text-[12.5px] text-slate-300">{m(k(`effect_${record.path}`))}</p>
      <QuadrantNote c={c} record={record} m={m} />
      {record.state === 'SAR_FILED' && record.fiuDue !== null && (
        <p className="text-[13px] font-semibold text-sky-200" data-testid="aml-fiu-pending">
          {m('fiuPending', { day: Math.floor(record.fiuDue / 1440) + 1 })}
        </p>
      )}
      {record.fineCents > 0 ? (
        <p className="rounded-lg border border-rose-400/50 bg-rose-950/40 px-2.5 py-1.5 text-[13.5px] font-semibold text-rose-100" data-testid="aml-leak">
          {m('leakFound', {
            fine: formatMoney(record.fineCents),
            points: -record.points,
          })}
        </p>
      ) : (
        (record.state === 'RELEASED' || record.state === 'EDD_CLEARED' || record.state === 'TEMP_RELEASED') && <p className="text-[13.5px] text-lime-200">{m('smooth')}</p>
      )}
      {pending && <p className="text-[13.5px] italic text-amber-200">{m('escalationPending')}</p>}
      <EddPanel c={c} record={record} now={now} m={m} onResolved={onResolved} />
      {record.state === 'SAR_FILED' && (
        <button
          type="button"
          data-testid="aml-tip-off"
          onClick={() => amlStore.getState().tipOff(c)}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-[13.5px] text-slate-200 hover:bg-slate-800"
        >
          {m('tipOffButton')}
        </button>
      )}
    </div>
  );
}

/** What to weigh before choosing (the case's own pattern, and each path's regulatory trade-off): the desk's SOP as a lesson, read from one table per typology. */
const SOP_GUIDE: Readonly<Record<ReviewCase['typology'], { dirty: Key; clean: Key }>> = {
  STRUCTURING: {
    dirty: 'sop_STRUCTURING_dirty',
    clean: 'sop_STRUCTURING_clean',
  },
  MONEY_MULE: { dirty: 'sop_MONEY_MULE_dirty', clean: 'sop_MONEY_MULE_clean' },
  SYNTHETIC_ID: {
    dirty: 'sop_SYNTHETIC_ID_dirty',
    clean: 'sop_SYNTHETIC_ID_clean',
  },
  LARGE_VALUE: {
    dirty: 'sop_LARGE_VALUE_dirty',
    clean: 'sop_LARGE_VALUE_clean',
  },
  VELOCITY_BURST: {
    dirty: 'sop_VELOCITY_BURST_dirty',
    clean: 'sop_VELOCITY_BURST_clean',
  },
};

const PATH_TONE: Readonly<Record<(typeof AML_PATHS)[number], string>> = {
  FALSE_POSITIVE: 'border-slate-500',
  FREEZE: 'border-amber-400',
  REQUEST_EDD: 'border-violet-400',
  FILE_SAR: 'border-rose-400',
};

export function SopGuide({ c, m }: { c: ReviewCase; m: M }) {
  const guide = SOP_GUIDE[c.typology];
  return (
    <details open className="group rounded-xl border border-sky-400/30 bg-sky-950/20 p-3" data-testid="aml-sop">
      <summary className="cursor-pointer list-none text-[14px] font-black text-sky-100 marker:hidden">
        {m('sopTitle')} <span className="text-[12px] font-semibold text-sky-300/70 group-open:hidden">▸</span>
      </summary>
      <div className="mt-2 space-y-3">
        <section>
          <h5 className="text-[12px] font-bold uppercase tracking-wider text-slate-400">{m('sopRedFlags')}</h5>
          <div className="mt-1 grid gap-2 md:grid-cols-2">
            <p className="rounded-lg border border-rose-400/30 bg-rose-950/20 px-2.5 py-1.5 text-[13px] leading-snug text-rose-50" data-testid="aml-sop-dirty">
              <b className="block text-[12px] text-rose-300">🚩 {m('sopDirty')}</b>
              {m(guide.dirty)}
            </p>
            <p className="rounded-lg border border-lime-400/30 bg-lime-950/20 px-2.5 py-1.5 text-[13px] leading-snug text-lime-50" data-testid="aml-sop-clean">
              <b className="block text-[12px] text-lime-300">✅ {m('sopClean')}</b>
              {m(guide.clean)}
            </p>
          </div>
        </section>
        <section>
          <h5 className="text-[12px] font-bold uppercase tracking-wider text-slate-400">{m('sopTradeoffs')}</h5>
          <ul className="mt-1 space-y-1" data-testid="aml-sop-tradeoffs">
            {AML_PATHS.map((path) => (
              <li key={path} className={`border-l-2 pl-2 text-[13px] leading-snug text-slate-200 ${PATH_TONE[path]}`}>
                <b className="text-slate-50">{m(k(`path_${path}`))}</b> · {m(k(`tradeoff_${path}`))}
              </li>
            ))}
          </ul>
        </section>
        <p className="text-[12.5px] italic text-sky-200/80">{m('sopRule')}</p>
      </div>
    </details>
  );
}

/** A case's time: the clock today, with its day in front when it was carried over from an earlier day. */
export function CaseTime({ c, today, minute, m }: { c: Pick<ReviewCase, 'day'>; today: number; minute: number; m: M }) {
  const time = formatClock(Math.floor(minute));
  if (c.day >= today) return <>{time}</>;
  return (
    <span title={m('carriedHint', { day: c.day })} data-testid="aml-carried" className="text-amber-200">
      ↩ {m('carriedTime', { day: c.day, time })}
    </span>
  );
}

/** The typology cases on the desk: today's so far, and the earlier days' still unresolved. The list, and the case under review. */
export function TypologyReview({ cases, now, today, focus = null }: { cases: readonly ReviewCase[]; now: number; today: number; /** A case to open on (a toast's click). */ focus?: string | null }) {
  const m = useMessages(amlDecisionMessages);
  const reviews = useAmlStore((s) => s.reviews);
  const [open, setOpen] = useState<string | null>(focus);
  const [view, setView] = useState<DeskView>(DEFAULT_DESK_VIEW);
  useEffect(() => {
    if (focus) setOpen(focus);
  }, [focus]);
  const list = useMemo(
    () =>
      deskList(
        cases,
        view,
        (x) => reviews[x.id],
        (x) => x.day * 1440 + x.minute,
        now,
      ),
    [cases, view, reviews, now],
  );
  const c = cases.find((x) => x.id === open) ?? null;
  if (c) {
    return (
      <section className="space-y-3" data-testid="aml-review-case" data-typology={c.typology}>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setOpen(null)} className="rounded-lg px-2.5 py-1 text-[13.5px] font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800">
            {m('back')}
          </button>
          <span className="text-[15px] font-bold text-slate-50">{m(k(`typo_${c.typology}`))}</span>
          <span className="font-mono text-[13px] text-slate-400">{c.id}</span>
          <StateBadge record={reviews[c.id]} now={now} m={m} />
          <span className="flex-1" />
          <span className="text-[14px] text-slate-300">
            {c.subject} · {m('moneyAtStake', { amount: formatMoney(c.amountCents) })}
          </span>
        </div>
        <KycContextCard c={c} />
        <CaseFacts c={c} m={m} />
        <CaseActions c={c} now={now} onResolved={() => setOpen(null)} />
      </section>
    );
  }
  return (
    <section className="space-y-3" data-testid="aml-review">
      <p className="text-[14px] leading-relaxed text-slate-300">{m('reviewIntro')}</p>
      {cases.length > 0 && <DeskListControls view={view} onView={setView} counts={list.counts} m={m} />}
      {cases.length === 0 || list.shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center text-[14px] text-slate-400" data-testid="aml-review-empty">
          {cases.length === 0 ? m('reviewNone') : m('filterEmpty')}
        </p>
      ) : (
        <table className="w-full table-fixed overflow-hidden rounded-xl border border-slate-800 text-left text-[14px]" data-testid="aml-review-list">
          <colgroup>
            <col className="w-[6.5rem]" />
            <col />
            <col className="w-[9rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-[4.25rem]" />
            <col className="w-[10.5rem]" />
            <col className="w-[7rem]" />
          </colgroup>
          <thead className="whitespace-nowrap bg-slate-950 text-[12px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">{m('colTime')}</th>
              <th className="px-3 py-2">{m('colTypology')}</th>
              <th className="px-3 py-2">{m('colSubject')}</th>
              <th className="px-3 py-2 text-right">{m('colAmount')}</th>
              <th className="px-3 py-2 text-right">{m('colRisk')}</th>
              <th className="px-3 py-2">{m('colState')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.shown.map((x) => (
              <tr key={x.id} className="border-t border-slate-800 text-slate-200" data-testid="aml-review-row" data-typology={x.typology}>
                <td className="truncate px-3 py-2 font-mono tabular-nums text-slate-400">
                  <CaseTime c={x} today={today} minute={x.minute} m={m} />
                </td>
                <td className="truncate px-3 py-2 font-semibold" title={m(k(`typo_${x.typology}`))}>
                  {m(k(`typo_${x.typology}`))}
                </td>
                <td className="truncate px-3 py-2" title={x.subject}>
                  {x.subject}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatMoney(x.amountCents)}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-rose-300">{x.riskScore}</td>
                <td className="px-3 py-2">
                  <StateBadge record={reviews[x.id]} now={now} m={m} />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setOpen(x.id)}
                    data-testid="aml-review-open"
                    className="whitespace-nowrap rounded-md bg-sky-500 px-2.5 py-1 text-[13.5px] font-bold text-sky-950 hover:bg-sky-400"
                  >
                    {m('investigate')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <HistoryFooter view={view} onView={setView} pages={list.pages} m={m} />
    </section>
  );
}

function CaseFacts({ c, m }: { c: ReviewCase; m: M }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <h4 className="text-[13px] font-bold uppercase tracking-wider text-slate-400">{m('redFlags')}</h4>
        <ul className="mt-1.5 space-y-1" data-testid="aml-indicators">
          {c.indicators.map((key) => (
            <li key={key} className="flex gap-2 text-[14px] text-slate-200">
              <span className="text-rose-300" aria-hidden="true">
                ▲
              </span>
              {m(k(key))}
            </li>
          ))}
        </ul>
      </div>
      <table className="w-full rounded-xl border border-slate-800 text-left text-[13.5px]">
        <thead className="bg-slate-950 text-[12px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-1.5">{m('colTime')}</th>
            <th className="px-3 py-1.5">{m('colWhat')}</th>
            <th className="px-3 py-1.5 text-right">{m('colAmount')}</th>
          </tr>
        </thead>
        <tbody>
          {c.txs.slice(0, 12).map((t, i) => (
            <tr key={i} className="border-t border-slate-800 text-slate-300">
              <td className="px-3 py-1 font-mono tabular-nums">{formatClock(Math.floor(t.minute))}</td>
              <td className="px-3 py-1">{m(k(`tx_${t.what}`))}</td>
              <td className="px-3 py-1 text-right font-mono tabular-nums">{formatMoney(t.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The customer at the branch, ESCALATION_DELAY_S after a freeze: keep the account frozen, or release it on the spot. */
export function EscalationPopup({ cases }: { cases: readonly ReviewCase[] }) {
  const m = useMessages(amlDecisionMessages);
  const escalations = useAmlStore((s) => s.escalations);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!escalations.length) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [escalations.length]);
  const due = escalations.find((e) => e.dueAt <= now);
  const c = due ? cases.find((x) => x.id === due.caseId) : undefined;
  if (!c) return null;
  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/70 p-4" data-testid="aml-escalation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="aml-escalation-title" className="w-full max-w-lg rounded-2xl border-2 border-amber-400 bg-amber-950 p-5 shadow-2xl">
        <h3 id="aml-escalation-title" className="text-[17px] font-black text-amber-50">
          {m('escalationTitle')}
        </h3>
        <p className="mt-2 text-[15px] leading-relaxed text-amber-100">{m('escalationText', { name: c.subject })}</p>
        <p className="mt-1.5 text-[13px] text-amber-200/80">{m('escalationHint')}</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            autoFocus
            data-testid="aml-escalation-keep"
            onClick={() => amlStore.getState().answerEscalation(c, true)}
            className="rounded-lg border border-slate-400 bg-slate-800 px-3 py-1.5 text-[14px] font-bold text-slate-50 hover:bg-slate-700"
          >
            {m('escalationKeep')}
          </button>
          <button
            type="button"
            data-testid="aml-escalation-release"
            onClick={() => amlStore.getState().answerEscalation(c, false)}
            className="rounded-lg bg-amber-400 px-3 py-1.5 text-[14px] font-bold text-slate-950 hover:bg-amber-300"
          >
            {m('escalationRelease')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Who the account holder is (KYC baseline), and how the case's money compares with it: the evidence to decide on. */
export function KycContextCard({ c }: { c: ReviewCase }) {
  const m = useMessages(amlDecisionMessages);
  const p = c.profile;
  const extreme = volumeMultiple(c) > EXTREME_MULTIPLE;
  const tenure = p.tenureDays < 365 ? m('kycTenureDays', { n: p.tenureDays }) : m('kycTenureYears', { n: Math.floor(p.tenureDays / 365) });
  const row = (label: string, value: string, testId: string, flag = false) => (
    <div className="min-w-0" data-testid={testId}>
      <dt className="text-[11.5px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`text-[14px] font-semibold ${flag ? 'text-rose-200' : 'text-slate-100'}`}>{value}</dd>
    </div>
  );
  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-3" data-testid="aml-kyc" data-extreme={extreme}>
      <h4 className="text-[13px] font-bold uppercase tracking-wider text-sky-300">👤 {m('kycTitle')}</h4>
      <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {row(m('kycSegment'), `${m(k(`seg_${p.segment}`))} (${tenure})`, 'aml-kyc-segment', p.tenureDays < 60)}
        {row(m('kycVolume'), m('kycPerMonth', { amount: formatMoney(p.avgMonthlyCents) }), 'aml-kyc-volume', extreme)}
        {row(m('kycLevel'), m(k(`kyc_${p.kyc}`)), 'aml-kyc-level', p.kyc === 'BASIC_EKYC')}
        {row(m('kycHistory'), m(k(`hist_${p.history}`)), 'aml-kyc-history', p.history === 'UNKNOWN_SENDERS' || p.history === 'NO_HISTORY')}
      </dl>
    </section>
  );
}

/** The tipping-off violation: a critical legal error, until acknowledged. */
export function ViolationBanner() {
  const m = useMessages(amlDecisionMessages);
  const violation = useAmlStore((s) => s.violation);
  if (!violation) return null;
  return (
    <div role="alert" className="mb-3 flex items-start gap-3 rounded-xl border-2 border-rose-500 bg-rose-950 px-4 py-3" data-testid="aml-violation">
      <span className="text-[22px]" aria-hidden="true">
        🚨
      </span>
      <p className="flex-1 text-[14.5px] font-black leading-snug text-rose-50">{m('violation')}</p>
      <button type="button" onClick={() => amlStore.getState().dismissViolation()} className="rounded-lg border border-rose-300 px-3 py-1 text-[13.5px] font-bold text-rose-50 hover:bg-rose-900">
        {m('violationDismiss')}
      </button>
    </div>
  );
}

const GRADE_KEY: Readonly<Record<AmlScorecard['grade'], Key>> = {
  'A+': 'grade_Aplus',
  A: 'grade_A',
  B: 'grade_B',
  C: 'grade_C',
  D: 'grade_D',
  F: 'grade_F',
};
const GRADE_TONE: Readonly<Record<AmlScorecard['grade'], string>> = {
  'A+': 'text-lime-300',
  A: 'text-lime-300',
  B: 'text-sky-300',
  C: 'text-amber-300',
  D: 'text-orange-300',
  F: 'text-rose-400',
};

/** One metric card: its label, its value (which fades in afresh when it changes), and the hint on hover. */
function MetricCard({ label, hint, value, testId, tone = 'text-slate-50', children }: { label: string; hint: string; value: string; testId: string; tone?: string; children?: ReactNode }) {
  return (
    <div className="group rounded-xl border border-slate-800 bg-slate-950/50 p-3 transition hover:border-slate-600 hover:bg-slate-900/70" title={hint} data-testid={testId}>
      <div className="text-[12px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div key={value} className={`mt-1 text-[24px] font-black tabular-nums ${tone} animate-[metric-in_400ms_ease-out]`} data-testid={`${testId}-value`}>
        {value}
      </div>
      {children ?? <div className="text-[12px] leading-snug text-slate-500">{hint}</div>}
    </div>
  );
}

/** While the desk is debuffed: the warning, and the rehabilitation streak toward 20. */
export function DebuffBanner({ m }: { m: M }) {
  const d = useAmlStore((s) => s.discipline);
  if (d.mode !== 'DEBUFFED') return null;
  return (
    <div
      role="alert"
      className="mb-3 rounded-xl border border-amber-400/70 bg-gradient-to-r from-rose-950/80 to-amber-950/70 px-4 py-2.5 shadow-[0_0_24px_rgba(251,146,60,0.25)]"
      data-testid="aml-debuff"
      data-streak={d.consecutiveCleanCases}
    >
      <p className="text-[14px] font-bold text-amber-50">⚠️ {m('debuffBanner', { n: d.consecutiveCleanCases })}</p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
        <div
          className="h-full rounded-full bg-amber-400 transition-[width] duration-500"
          style={{
            width: `${(100 * d.consecutiveCleanCases) / REHAB_STREAK}%`,
          }}
        />
      </div>
      <p className="mt-1 text-[12px] text-amber-100/80">{m('debuffWhy')}</p>
    </div>
  );
}

/** The after-action review in a 2x3 grid: false positive rate, complaints, fines, the rating with its progress to the next grade,
 *  correct cases and the bonus earned. A debuffed desk glows amber. */
export function AmlScorecardView({ cases }: { cases: readonly ReviewCase[] }) {
  const m = useMessages(amlDecisionMessages);
  const reviews = useAmlStore((s) => s.reviews);
  const d = useAmlStore((s) => s.discipline);
  const card = useMemo(
    () =>
      amlScorecard(cases, reviews, {
        debuffed: d.mode === 'DEBUFFED',
        kpiPoints: d.kpiPoints,
        totalCorrect: d.totalCorrect,
        bonusCents: d.bonusCents,
      }),
    [cases, reviews, d],
  );
  return (
    <section
      className={`space-y-3 rounded-2xl ${card.debuffed ? 'p-2 ring-1 ring-amber-400/50 shadow-[0_0_32px_rgba(244,63,94,0.18)]' : ''}`}
      data-testid="aml-scorecard"
      data-grade={card.grade}
      data-debuffed={card.debuffed}
    >
      <style>{'@keyframes metric-in { from { opacity: 0.2; transform: translateY(3px); } to { opacity: 1; transform: none; } }'}</style>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[17px] font-black text-slate-50">{m('scoreTitle')}</h3>
        <span className="text-[13px] text-slate-400">
          {m('scoreDecided', { n: card.decided })}
          {d.mode === 'NORMAL' && d.errors > 0 && <span className="ml-2 font-semibold text-amber-300">· {m('errorsSoFar', { n: d.errors })}</span>}
        </span>
      </div>
      <DebuffBanner m={m} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="aml-score-grid">
        <MetricCard label={m('scoreFpr')} hint={m('scoreFprHint')} value={`${card.falsePositiveRate}%`} testId="aml-score-fpr" />
        <MetricCard label={m('scoreFriction')} hint={m('scoreFrictionHint')} value={String(card.frictionIndex)} testId="aml-score-friction" />
        <MetricCard
          label={m('scorePenalties')}
          hint={m('scorePenaltiesHint')}
          value={formatMoney(card.penaltiesCents)}
          testId="aml-score-penalties"
          tone={card.penaltiesCents > 0 ? 'text-rose-200' : 'text-slate-50'}
        />
        <MetricCard label={m('scoreRating')} hint={m('scoreRatingHint')} value={card.grade} testId="aml-score-rating" tone={GRADE_TONE[card.grade]}>
          <div className="text-[12.5px] font-semibold text-slate-300">
            {m(GRADE_KEY[card.grade])} ·{' '}
            <span className="tabular-nums">
              {m('scoreOf', {
                score: card.score.toLocaleString('en-US'),
                pct: card.pct,
              })}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800" data-testid="aml-score-progress" data-progress={card.next ? Math.round(card.next.progress * 100) : 100}>
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${card.capped ? 'bg-amber-500' : 'bg-sky-400'}`}
              style={{
                width: `${card.next ? card.next.progress * 100 : 100}%`,
              }}
            />
          </div>
          <div className="mt-1 text-[12px] text-slate-400" data-testid="aml-score-next">
            {card.capped
              ? m('scoreCappedNote')
              : card.next
                ? m('scoreNext', {
                    short: card.next.short.toLocaleString('en-US'),
                    grade: card.next.grade,
                  })
                : m('scoreTop')}
          </div>
        </MetricCard>
        <MetricCard label={m('scoreCorrect')} hint={m('scoreCorrectHint')} value={String(card.totalCorrect)} testId="aml-score-correct" tone="text-lime-200" />
        <MetricCard label={m('scoreBonus')} hint={m('scoreBonusHint')} value={formatMoney(card.bonusCents)} testId="aml-score-bonus" tone={card.debuffed ? 'text-slate-500' : 'text-lime-200'} />
      </div>
      {card.tipOffs > 0 && <p className="text-[13.5px] font-semibold text-rose-200">{m('scoreTipOffs', { n: card.tipOffs })}</p>}
    </section>
  );
}
