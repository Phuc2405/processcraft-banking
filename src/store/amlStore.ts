/**
 * The AML desk's case book for the session: the monitoring alerts closed as false positives or reported, and the what-if review
 * (sim/amlReview.ts): every case's decision, its state and consequences, the branch escalations waiting to be answered, and any
 * tipping-off. Each ledger effect is booked to the core ledger and the audit trail through the bank store, and each penalty,
 * reward and follow-up is raised at once as a feedback toast (notificationStore, Location B).
 *
 * Nothing here is wiped at the day's rollover: a pending EDD keeps its SLA on the bank's clock, a freeze stays frozen, a SAR
 * stays on the blacklist, and the monitoring alerts of past days are kept (with their payments) until they are resolved.
 */

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Localized } from '../i18n/locale';
import { scanForAml, type AmlAlert, type SarActivity } from '../sim/amlMonitor';
import { DECISIONS, disciplinedOutcome, eddDecision, outcomeEvent, type DeskStep, HISTORY_CAP, overHistoryCap, eddUploaded, ESCALATION_DELAY_S, expireEdd, fiuDirective, lateDocs, resolveEscalation, sarRef, tipOff, type AmlFeedback, type EddAction, type AmlPath, type CaseRecord, type LedgerCommand, type Outcome, type ReviewCase } from '../sim/amlReview';
import { formatMoney } from '../sim/kpis';
import type { StaffScene } from '../sim/staffRoleplay';
import type { TxRecord } from '../sim/types';
import { message } from '../utils/i18nHelper';
import { amlDecisionMessages } from '../components/ops/amlDecision.messages';
import { bankStore, type ComplianceStatus } from './bankStore';
import { notificationStore, type Notice } from './notificationStore';
import { disciplineAfter, FRESH_DISCIPLINE, type Discipline, type DisciplineEvent } from '../engine/penaltyEngine';
import { calculateReward } from '../engine/rewardEngine';
import { uiStore } from './uiStore';

export type AmlCase =
  | { status: 'SAR_FILED'; reference: string; activity: SarActivity; subject: string; narrative: string; day: number; filedMinute: number }
  | { status: 'CLOSED_FALSE_POSITIVE'; day: number; closedMinute: number };

/** A branch escalation waiting to be answered: the case, and when the customer turns up (epoch ms). */
export interface PendingEscalation {
  caseId: string;
  dueAt: number;
}

/** A monitoring alert kept past its day: the alert, the day it fired, and the payments behind it (the day's log is gone by then). */
export interface KeptAlert {
  alert: AmlAlert;
  day: number;
  rows: readonly TxRecord[];
}

export interface AmlState {
  cases: Readonly<Record<string, AmlCase>>;
  fileSar(alertId: string, c: Extract<AmlCase, { status: 'SAR_FILED' }>): void;
  closeFalsePositive(alertId: string, day: number, minute: number): void;
  reopen(alertId: string): void;
  /** The what-if review: each case's record. */
  reviews: Readonly<Record<string, CaseRecord>>;
  /** Every case decided, by id: what the bank's clock follows up on (EDD timeouts, the FIU's directives), with or without the desk open. */
  decided: Readonly<Record<string, ReviewCase>>;
  /** The EDD cases whose proof of funds has arrived and been announced (the document toast is raised once). */
  docsAnnounced: Readonly<Record<string, true>>;
  /** The desk's discipline: normal or debuffed, the rehabilitation streak, and the correct cases' rewards (penaltyEngine.ts). */
  discipline: Discipline;
  /** The cases whose SOP hint was opened: their reward is halved whenever it is paid (rewardEngine.ts). */
  hintsUsed: Readonly<Record<string, true>>;
  /** The cases whose SOP hint is showing right now. */
  hintsShown: Readonly<Record<string, true>>;
  /** Shows or hides a case's SOP hint; showing it the first time marks it used (and halves the case's reward). */
  toggleHint(caseId: string): void;
  /** Resolved cases pruned from the history (over HISTORY_CAP, oldest first): their ids only, so a regenerated case never comes back as open. */
  pruned: Readonly<Record<string, true>>;
  escalations: readonly PendingEscalation[];
  /** The last tipping-off violation, until dismissed. */
  violation: string | null;
  /** Every monitoring alert seen, by id: they stay on the desk across the night. */
  alerts: Readonly<Record<string, KeptAlert>>;
  /** Keeps the alerts of a day (only the ones not kept yet). */
  keepAlerts(day: number, alerts: readonly AmlAlert[], log: readonly TxRecord[]): void;
  /** Takes one of the four paths on a case at the bank's minute `now` (counted from day 1, 00:00). */
  decide(c: ReviewCase, path: AmlPath, now: number, at?: number): Outcome | null;
  /** Answers a branch escalation: keep the account frozen, or release the money. */
  answerEscalation(c: ReviewCase, keep: boolean): void;
  /** An EDD decision on the case's timeline: release, report a SAR, refuse, or unlock with no documents. */
  judgeEdd(c: ReviewCase, action: EddAction, now: number): void;
  /** The bank's clock moved on: EDD cases out of time are frozen, and the FIU's directives that are due come back. */
  tick(cases: readonly ReviewCase[], now: number): void;
  /** Tells the customer why their account is locked after a SAR: a criminal tipping-off. */
  tipOff(c: ReviewCase): void;
  dismissViolation(): void;
  resetReview(): void;
}

/** The roleplay scene a typology's journals are filed under. */
const SCENE: Readonly<Record<ReviewCase['typology'], StaffScene>> = { STRUCTURING: 'aml_STRUCTURING', LARGE_VALUE: 'aml_LARGE_CROSS_BORDER', MONEY_MULE: 'aml_NONE', SYNTHETIC_ID: 'aml_NONE', VELOCITY_BURST: 'aml_NONE' };

/** Whether a step was the right call on the truth the desk could not see: laundered money held back, a legitimate customer let through. */
const rightCall = (c: ReviewCase, released: boolean): boolean => (c.laundering ? !released : released);

/** Books an outcome's commands: each journal to the core ledger and a row to the audit trail. */
function book(c: ReviewCase, commands: readonly LedgerCommand[], compliance: ComplianceStatus): void {
  for (const cmd of commands) {
    const released = cmd.kind === 'RELEASE' || cmd.kind === 'RELEASE_HELD' || cmd.kind === 'RELEASE_FROZEN';
    // A fine: its own amount, and always a breach.
    const fine = cmd.kind === 'FINE';
    bankStore.getState().bookAmlCommand({ caseId: c.id, amountCents: fine ? cmd.lines[0]!.dr : c.amountCents, scene: SCENE[c.typology], statusCode: cmd.statusCode, lines: cmd.lines, approve: released, compliance: fine ? 'SOP_BREACH' : compliance });
  }
}

type MsgKey = keyof typeof amlDecisionMessages.messages;
const both = (key: MsgKey, params?: Record<string, string | number>): Localized<string> => ({ en: message(amlDecisionMessages, key, params, 'en'), vi: message(amlDecisionMessages, key, params, 'vi') });

/** The feedback toast for an outcome (Location B): the penalty tiers in red, the FIU's seizure in green, the EDD outcomes and the follow-ups. */
export function feedbackNotice(c: ReviewCase, out: Outcome, feedback: AmlFeedback, ref: string = sarRef(c)): Omit<Notice, 'id'> {
  const fine = out.commands.find((x) => x.kind === 'FINE');
  const posted = fine ? both('finePosted', { amount: formatMoney(fine.lines[0]!.dr), id: c.id }) : undefined;
  const amount = formatMoney(c.amountCents);
  const base = { source: c.id, deferred: false };
  switch (feedback) {
    case 'LEAK':
      return { ...base, tone: 'danger', icon: '🚨', title: both('leakToast'), body: posted };
    case 'WRONG_FREEZE':
      return { ...base, tone: 'danger', icon: '⚠️', title: both('toastWrongFreeze'), body: posted };
    case 'SAR_SUBMITTED':
      return { ...base, tone: 'info', icon: '📨', title: both('toastSarSubmitted', { ref, id: c.id }), body: both('sarSubmittedBody', { day: Math.floor((out.record.fiuDue ?? 0) / 1440) + 1 }) };
    case 'FIU_SEIZED':
      return { ...base, tone: 'success', icon: '🏛️', title: both('toastFiuSeized', { ref, amount }), body: both('seizePosted', { amount }), deferred: true };
    case 'FIU_REJECTED':
      return { ...base, tone: 'danger', icon: '⚠️', title: both('toastWrongSar', { ref, name: c.subject }), body: posted, deferred: true };
    case 'EDD_APPROVED':
      return { ...base, tone: 'success', icon: '✅', title: both('toastEddApproved', { name: c.subject }), body: both('eddApprovedPosted', { amount }) };
    case 'EDD_REFUSED':
      return { ...base, tone: 'warning', icon: '🚫', title: both('toastEddRefused'), body: both('eddRefusedPosted', { amount }) };
    case 'EDD_EXPIRED':
      return { ...base, tone: 'warning', icon: '⏰', title: both('toastEddExpired', { subject: c.subject, id: c.id }), body: both('eddExpiredPosted', { amount }), deferred: true, onOpen: openCase(c) };
    case 'EDD_LATE_DOCS':
      return { ...base, tone: 'warning', icon: '📄', title: both('toastEddLate', { name: c.subject, id: c.id }), deferred: true, onOpen: openCase(c) };
    case 'EDD_FALSE_SAR':
      return { ...base, tone: 'danger', icon: '⚠️', title: both('toastEddFalseSar', { name: c.subject }), body: posted };
    case 'EDD_UNLOCK_BREACH':
      return { ...base, tone: 'danger', icon: '🔓', title: both('toastEddUnlock'), body: posted };
  }
}

/** A toast's click: the AML desk, open on the case. */
const openCase = (c: ReviewCase) => (): void => uiStore.getState().openAmlCase(c.id);

/** The customer's proof of funds has arrived: a toast that opens the AML desk on the case. */
export const docArrivedNotice = (c: ReviewCase): Omit<Notice, 'id'> => ({
  tone: 'info',
  icon: '📄',
  title: both('toastDocArrived', { name: c.subject, id: c.id }),
  deferred: true,
  source: c.id,
  onOpen: () => uiStore.getState().openAmlCase(c.id),
});

/** Raises an outcome's toast, if it has one (a SAR's reference is the one filed, when it was filed through the form). */
const notify = (c: ReviewCase, out: Outcome, ref?: string): void => {
  if (out.feedback) notificationStore.getState().push(feedbackNotice(c, out, out.feedback, ref));
};

/** The book of an outcome: a step judged right or wrong on the truth (a fine is always a breach). */
const verdict = (c: ReviewCase, released: boolean): ComplianceStatus => (rightCall(c, released) ? 'COMPLIANT' : 'SOP_BREACH');

export function createAmlStore(): StoreApi<AmlState> {
  return createStore<AmlState>()((set, get) => {
    /** Records a case, then keeps the resolved history within HISTORY_CAP: the oldest resolved cases are dropped; active work never is. */
    const put = (id: string, r: CaseRecord): void => {
      set((s) => ({ reviews: { ...s.reviews, [id]: r } }));
      const drop = overHistoryCap(get().reviews, HISTORY_CAP);
      if (!drop.length) return;
      set((s) => {
        const without = <T,>(o: Readonly<Record<string, T>>): Record<string, T> => Object.fromEntries(Object.entries(o).filter(([k]) => !drop.includes(k)));
        // Tombstones are ids only, and capped themselves.
        const pruned = Object.fromEntries([...Object.keys(s.pruned), ...drop].slice(-HISTORY_CAP * 20).map((k) => [k, true as const]));
        return { reviews: without(s.reviews), decided: without(s.decided), alerts: without(s.alerts), cases: without(s.cases), docsAnnounced: without(s.docsAnnounced), pruned };
      });
    };
    /** The discipline after an event (the reward rule from the reward engine). */
    const discipline = (e: DisciplineEvent | null): void => {
      if (e) set((s) => ({ discipline: disciplineAfter(s.discipline, e, calculateReward) }));
    };
    /** One step of a case, through the discipline: the outcome shaped (penalties doubled and no points while debuffed), recorded and
     *  booked, then the discipline moved on by what it revealed. */
    const settle = (c: ReviewCase, prev: CaseRecord | undefined, raw: Outcome, step: DeskStep, compliance: ComplianceStatus): Outcome => {
      const out = disciplinedOutcome(prev, raw, get().discipline.mode === 'DEBUFFED');
      put(c.id, out.record);
      book(c, out.commands, compliance);
      const e = outcomeEvent(c, out, step);
      discipline(e && (e.kind === 'TRUE_POSITIVE' || e.kind === 'CORRECT') ? { ...e, hintUsed: get().hintsUsed[c.id] === true } : e);
      return out;
    };
    return {
      discipline: FRESH_DISCIPLINE,
      hintsUsed: {},
      hintsShown: {},
      toggleHint: (caseId) =>
        set((s) => {
          if (s.hintsShown[caseId]) {
            const hintsShown = { ...s.hintsShown };
            delete hintsShown[caseId];
            return { hintsShown };
          }
          return { hintsShown: { ...s.hintsShown, [caseId]: true }, hintsUsed: s.hintsUsed[caseId] ? s.hintsUsed : { ...s.hintsUsed, [caseId]: true } };
        }),
      cases: {},
      fileSar: (alertId, c) => set((s) => ({ cases: { ...s.cases, [alertId]: c } })),
      closeFalsePositive: (alertId, day, minute) => set((s) => ({ cases: { ...s.cases, [alertId]: { status: 'CLOSED_FALSE_POSITIVE', day, closedMinute: minute } } })),
      reopen: (alertId) =>
        set((s) => {
          const next = { ...s.cases };
          delete next[alertId];
          const reviews = { ...s.reviews };
          delete reviews[alertId];
          return { cases: next, reviews };
        }),
      reviews: {},
      decided: {},
      docsAnnounced: {},
      pruned: {},
      escalations: [],
      violation: null,
      alerts: {},
      keepAlerts: (day, alerts, log) => {
        const { alerts: have, pruned } = get();
        // A pruned alert stays gone, even while its day's log still has it.
        const fresh = alerts.filter((a) => !have[a.id] && !pruned[a.id]);
        if (!fresh.length) return;
        const byId = new Map(log.map((t) => [t.id, t]));
        const kept = Object.fromEntries(fresh.map((a) => [a.id, { alert: a, day, rows: a.txIds.map((id) => byId.get(id)).filter((t): t is TxRecord => t !== undefined) }]));
        set((s) => ({ alerts: { ...s.alerts, ...kept } }));
      },
      decide: (c, path, now, at = Date.now()) => {
        if (get().reviews[c.id]) return null;
        set((s) => ({ decided: { ...s.decided, [c.id]: c } }));
        // An EDD request only holds the money: whether it was the right call is judged when the proof is.
        const out = settle(c, undefined, DECISIONS[path].apply(c, now), { kind: 'PATH', path }, path === 'REQUEST_EDD' ? 'UNVERIFIED' : verdict(c, path === 'FALSE_POSITIVE'));
        if (out.escalates) set((s) => ({ escalations: [...s.escalations, { caseId: c.id, dueAt: at + ESCALATION_DELAY_S * 1000 }] }));
        const filed = get().cases[c.id];
        notify(c, out, filed?.status === 'SAR_FILED' ? filed.reference : undefined);
        return out;
      },
      answerEscalation: (c, keep) => {
        const r = get().reviews[c.id];
        set((s) => ({ escalations: s.escalations.filter((e) => e.caseId !== c.id) }));
        if (!r) return;
        const out = settle(c, r, resolveEscalation(c, r, keep), { kind: 'ESCALATION' }, verdict(c, !keep));
        notify(c, out);
      },
      judgeEdd: (c, action, now) => {
        const r = get().reviews[c.id];
        if (!r) return;
        const raw = eddDecision(c, r, action, now);
        if (raw.record === r) return;
        const out = settle(c, r, raw, { kind: 'EDD', action }, action === 'UNLOCK' ? 'SOP_BREACH' : verdict(c, action === 'RELEASE'));
        // Approving a forged proof is still an approval: its toast first, then the audit's.
        if (action === 'RELEASE' && out.feedback === 'LEAK') notificationStore.getState().push(feedbackNotice(c, out, 'EDD_APPROVED'));
        notify(c, out);
      },
      tick: (cases, now) => {
        for (const c of cases) {
          const r = get().reviews[c.id];
          if (!r) continue;
          // The proof of funds came in while the SLA runs: announce it once.
          if (eddUploaded(r, now) && !get().docsAnnounced[c.id]) {
            set((s) => ({ docsAnnounced: { ...s.docsAnnounced, [c.id]: true } }));
            notificationStore.getState().push(docArrivedNotice(c));
          }
          const step = r.state === 'PENDING_EDD' ? expireEdd : r.state === 'EDD_EXPIRED' ? lateDocs : r.state === 'SAR_FILED' ? fiuDirective : null;
          if (!step) continue;
          const raw = step(c, r, now);
          if (raw.record === r) continue;
          const out = settle(c, r, raw, { kind: 'FOLLOW_UP' }, r.state === 'SAR_FILED' ? verdict(c, false) : 'SLA_BREACH');
          const filed = get().cases[c.id];
          notify(c, out, filed?.status === 'SAR_FILED' ? filed.reference : undefined);
        }
      },
      tipOff: (c) => {
        const r = get().reviews[c.id];
        if (!r || r.state !== 'SAR_FILED') return;
        put(c.id, tipOff(r));
        set({ violation: c.id });
        // Tipping-off debuffs the desk at once.
        discipline({ kind: 'TIP_OFF' });
        bankStore.getState().bookAmlCommand({ caseId: c.id, amountCents: 0, scene: SCENE[c.typology], statusCode: 'TIPPING_OFF_VIOLATION', lines: [], approve: false, compliance: 'SOP_BREACH' });
      },
      dismissViolation: () => set({ violation: null }),
      resetReview: () => set({ discipline: FRESH_DISCIPLINE, hintsUsed: {}, hintsShown: {}, reviews: {}, decided: {}, docsAnnounced: {}, pruned: {}, escalations: [], violation: null, alerts: {} }),
    };
  });
}

export const amlStore = createAmlStore();

bankStore.subscribe((s, prev) => {
  // The bank's clock moved: the EDD timeouts and the FIU's directives come due whether or not the desk is open.
  if (s.view.minute !== prev.view.minute || s.view.day !== prev.view.day) {
    const aml = amlStore.getState();
    const waiting = Object.values(aml.decided).filter((c) => {
      const st = aml.reviews[c.id]?.state;
      return st === 'PENDING_EDD' || st === 'EDD_EXPIRED' || st === 'SAR_FILED';
    });
    if (waiting.length) aml.tick(waiting, (s.view.day - 1) * 1440 + s.view.minute);
  }
  // The day's log is cleared at the rollover: keep the day's alerts (and their payments) when the day ends, whether or not the desk was open.
  if (!s.view.dayOver || prev.view.dayOver) return;
  const log = s.sim.transactionLog();
  amlStore.getState().keepAlerts(s.view.day, scanForAml(log), log);
});

export function useAmlStore<T>(selector: (state: AmlState) => T): T {
  return useStore(amlStore, selector);
}
