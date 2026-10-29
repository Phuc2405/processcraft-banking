/**
 * Bank store: the living bank on screen.
 *
 * The simulation (src/sim) is a plain class with no timers. This store owns one, hands the screen a fresh
 * BankView after every beat, and keeps everything else the screen needs: the clock controls, what is
 * selected for the inspector, the Learning Hub, the rules being tried out, and saving.
 *
 * Like the workflow store there are no timers in here. useBankClock() calls tickBeat() at the right pace
 * while `playing` is true, which keeps the store testable and the pace in one place.
 */

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { BankSimulation, type DisputeResult } from '../sim/bankSimulation';
import { cleanChaos, NO_CHAOS, type ChaosConfig } from '../engine/chaos';
import { LESSONS, type ProcessId } from '../sim/learning';
import { DAY_END, DAY_START, DEFAULT_SPEED_INDEX, EOD_START, SLOWEST_SPEED_INDEX, SPEEDS, WORK_END, WORK_START } from '../sim/clock';
import { clampRules, DEFAULT_RULES, rulesEqual, type BankRules } from '../sim/rules';
import { SPOTLIGHT_DEFAULT_EXAMPLE, spotPlan } from '../sim/spotlightPlan';
import type { TermMode } from '../sim/terms';
import { flowPlaces } from '../sim/guidedFlows';
import { STATIONS, type DepartmentId, type PlaceId, type StationId } from '../sim/topology';
import type { BankView, Customer, PacketTrace } from '../sim/types';
import { addToTally, advanceIncident, buildTaskCase, caseJournal, CHALLENGE, clampCrisisBatch, CRISIS_BATCH, crisisJournalLines, crisisOver, comboXp, STAFF_XP_PER_CORRECT, EMPTY_SHIFT_LOG, EMPTY_TALLY, gradeTaskCase, incidentErrorXp, incidentRules, openingLedger, postJournal, recordCareerDecision, rollCrisis, roleForStation, ROLE_STATION, startIncident, type ActiveIncident, type IncidentId, type BadgeId, type CareerProgress, type ChallengeTally, type LedgerLine, type RetailLedger, type StaffCase, type StaffDecision, type StaffDecisionResult, type StaffRoleId, type StaffTaskNo, workingTask } from '../sim/staffRoleplay';
import { presetById, presetCustomer, PRIMARY_PRESET, type PresetId } from '../sim/presets';
import type { DataDepth, Dimension, FlowId, Scope, ViewportSettings } from '../types/viewport';
import { quizFor } from '../sim/walkQuiz';
import { compareDays, type Comparison } from '../sim/whatIf';
import { browserStorage, clampInspectorWidth, clearBank, loadAuditLog, loadBank, loadCareer, loadPrefs, loadRetailLedger, saveAuditLog, saveCareer, saveRetailLedger, loadUiPrefs, saveBank, savePrefs, saveUiPrefs, type BankPrefs, type BankSaveResult, type KeyValueStorage, type LabelMode, type UiPrefs, type ViewMode } from './bankPersistence';

export type { ProcessId };
/** The six chapters of the Academy, in the order of the Course Catalog. */
export const PROCESS_IDS: readonly ProcessId[] = ['A', 'B', 'C', 'D', 'E', 'F'];

export type Selection =
  | { kind: 'none' }
  | { kind: 'department'; id: DepartmentId }
  | { kind: 'station'; id: StationId }
  | { kind: 'worker'; station: StationId; workerId: string }
  /** A payment the learner sent with a preset action, followed along its route. */
  | { kind: 'transaction'; id: string };

export type BankSaveStatus = 'unavailable' | 'pristine' | 'saved' | 'error';

export interface BankNotice {
  kind: 'info' | 'warn' | 'error';
  message: string;
}

export type ComparisonStatus = 'idle' | 'running' | 'done';

/** What the learner answered at a decision gateway: which option, and whether it was the right one. */
export interface QuizAnswer {
  picked: number;
  correct: boolean;
}

/**
 * Learn & Explore: a guided tour of one chapter, on the 2D map or in the 3D office (whichever the learner is looking at, and
 * they may switch between the two mid-tour). While it runs the clock is stopped and locked to the slowest speed, everything the
 * chapter does not use is dimmed, and one token walks the process from its first desk to its end.
 */
export interface SpotlightState {
  process: ProcessId;
  exampleId: string;
  /** Index of the step the token is at (or heading to). */
  step: number;
  /** True while the tour moves on by itself. */
  auto: boolean;
  /** True while the opening briefing ("Customer An has just bought…") is showing and the token has not set off. */
  intro: boolean;
  /** The answers given at decision gateways, by step index. */
  answers: Record<number, QuizAnswer>;
  /** Whether the bank clock was running when the tour began, so leaving the tour can start it again. */
  resume: boolean;
  /** The speed the learner had chosen before the tour locked it. */
  priorSpeed: number;
}

/** Where a tour was when the learner left it, so "Resume Walkthrough" can put them back at the same step. */
export interface LeftTour {
  process: ProcessId;
  exampleId: string;
  step: number;
  answers: Record<number, QuizAnswer>;
}

/** The seed every new bank starts with, so everyone's first week is the same lesson plan. */
export const DEFAULT_SEED = 2026;

/** One role's progress on today's shift objective in the Staff Roleplay Workspace. */
export interface ShiftProgress {
  reviews: number;
  correct: number;
  latencySumSec: number;
  slaBreaches: number;
  /** Decisions against the SOP. */
  errors: number;
  /** +STAFF_XP_PER_CORRECT × the combo multiplier for every decision that matches the SOP. */
  xp: number;
  /** Consecutive correct decisions; 0 after any SOP error. */
  comboCount: number;
  last: StaffDecisionResult | null;
}

/** Advances the streak and books XP at the new streak's multiplier; an error resets the streak. */
/** Books one decision on the streak. An `assisted` decision (Expert advice revealed) keeps the streak but earns the 1.0x base XP. */
export function bookCombo(prev: ShiftProgress, correct: boolean, assisted = false): Pick<ShiftProgress, 'xp' | 'comboCount'> {
  const comboCount = correct ? (prev.comboCount ?? 0) + 1 : 0;
  return { comboCount, xp: prev.xp + (correct ? (assisted ? STAFF_XP_PER_CORRECT : comboXp(comboCount)) : 0) };
}

export const EMPTY_SHIFT: ShiftProgress = { reviews: 0, correct: 0, latencySumSec: 0, slaBreaches: 0, errors: 0, xp: 0, comboCount: 0, last: null };

/** What the analyst did: an approval, a plain rejection, or a rejection whose journal froze the funds. */
export type AuditAction = 'APPROVE' | 'REJECT' | 'FREEZE';
/**
 * A decision against the SOP is an SOP breach; a right decision taken after the SLA is an SLA breach. UNVERIFIED marks a row
 * rebuilt from a ledger journal saved before the trail itself was saved: what was decided is known, how fast and against which
 * verdict is not, so it is never counted as compliant or as a breach.
 */
export type ComplianceStatus = 'COMPLIANT' | 'SLA_BREACH' | 'SOP_BREACH' | 'UNVERIFIED';

/** One row of the audit trail: every desk decision, training, retail or live queue. */
export interface AuditEntry {
  /** 1-based, in decision order. */
  seq: number;
  /** The shift the decision was taken in: a new one starts with every page load and every desk switch. 0: restored from the ledger. */
  shift: number;
  /** ISO 8601 timestamp of the decision. */
  at: string;
  station: StationId;
  role: StaffRoleId;
  caseId: string;
  action: AuditAction;
  expected: StaffDecision | null;
  amountCents: number;
  latencySec: number;
  slaSec: number;
  statusCode: string;
  /** The journal the decision posted (empty for a memo-only decision). */
  lines: LedgerLine[];
  compliance: ComplianceStatus;
  expert: boolean;
  /** Expert mode, Decision Support advice revealed. */
  assisted: boolean;
}

/** The audit trail keeps the latest decisions, across sessions (it is saved beside the ledger). */
export const AUDIT_LOG_CAP = 1_000;

export const auditActionOf = (r: Pick<StaffDecisionResult, 'decision' | 'journal'>): AuditAction =>
  r.decision === 'APPROVE' ? 'APPROVE' : r.journal?.lines.some((l) => l.gl === 'FROZEN_ASSETS' && l.cr > 0) ? 'FREEZE' : 'REJECT';

export const complianceOf = (correct: boolean, latencySec: number, slaSec: number): ComplianceStatus => (!correct ? 'SOP_BREACH' : latencySec > slaSec ? 'SLA_BREACH' : 'COMPLIANT');

/**
 * The saved trail plus a row for every saved ledger journal it does not have (books kept from before the trail was saved).
 * A recovered row carries what the journal knows (desk, case, decision, status, legs, time) and is marked UNVERIFIED, shift 0;
 * it goes in time order before the trail's own rows, and every row is renumbered so seq stays 1, 2, 3…
 */
export function recoverAuditLog(log: readonly AuditEntry[], ledger: Pick<RetailLedger, 'journal'>): AuditEntry[] {
  const known = new Set(log.map((e) => e.caseId));
  const missing = [...ledger.journal]
    .reverse()
    .filter((j) => !known.has(j.caseId))
    .map(
      (j): AuditEntry => ({
        seq: 0,
        shift: 0,
        at: j.at ?? new Date(0).toISOString(),
        station: j.station ?? ROLE_STATION[j.role],
        role: j.role,
        caseId: j.caseId,
        action: auditActionOf(j),
        expected: null,
        amountCents: j.lines.reduce((sum, l) => sum + l.dr, 0),
        latencySec: 0,
        slaSec: 0,
        statusCode: j.statusCode,
        lines: j.lines,
        compliance: 'UNVERIFIED',
        expert: false,
        assisted: false,
      }),
    );
  if (!missing.length) return [...log];
  return [...missing, ...log].slice(-AUDIT_LOG_CAP).map((e, i) => ({ ...e, seq: i + 1 }));
}

export interface BankState {
  sim: BankSimulation;
  view: BankView;
  seed: number;

  playing: boolean;
  speedIndex: number;

  /** Fintech Expert or Concept Explorer (plain-English) names for everything on the screen. */
  termMode: TermMode;
  /** The 2D blueprint map or the 3D isometric office. */
  viewMode: ViewMode;
  /** 3D only: floating name badges over every workstation, or only over the one under the pointer. */
  labelMode: LabelMode;
  /** The workstation (or tally) the pointer is over in the 3D office, or null. Its badge shows in either label mode. */
  hoverPlace: PlaceId | null;
  /** How wide the inspector drawer is, in pixels. */
  inspectorWidth: number;
  /** The guided tour in progress, if any. */
  spotlight: SpotlightState | null;
  /** The Academy's Course Catalog modal. */
  academyOpen: boolean;
  /** The step card of a tour folded away into a small badge, so the map can be seen whole. */
  walkCollapsed: boolean;
  /** The tour the learner last left with "Exit tutorial", until they resume it, start another or dismiss the offer. */
  leftTour: LeftTour | null;

  /** Beginner: one guided flow lit, the rest dimmed. Advanced: the whole Living Bank. */
  scope: Scope;
  /** The guided flow picked for the Beginner scope (kept while in Advanced, so switching back returns to it). */
  flow: FlowId;
  /** The payment the learner last sent with a preset action, and where it is now. */
  presetTxId: string | null;
  presetTrace: PacketTrace | null;
  /**
   * True while one preset payment plays out on its own: the clock runs, but the day's generated customers are held back and the
   * clock stops by itself the moment the payment is done. Pressing Play (Live Customers) or Pause ends it.
   */
  solo: boolean;
  /** The node the Academy split view is teaching right now: it pulses on the 2D map and in the 3D office, and the 3D camera goes to it. */
  focusPlace: PlaceId | null;

  selection: Selection;
  reportOpen: boolean;
  /** The Live Double-Entry Mini Ledger drawer over the map. */
  ledgerOpen: boolean;

  hubOpen: boolean;
  hubProcess: ProcessId;
  /** The rules being tried out in the Learning Hub. They only reach the bank when applied. */
  draftRules: BankRules;
  comparison: Comparison | null;
  comparisonStatus: ComparisonStatus;
  /** How many days the last comparison played. */
  comparisonDays: number;

  saveStatus: BankSaveStatus;
  lastSavedAt: string | null;
  notice: BankNotice | null;

  /** The desk the learner is working in the Staff Roleplay Workspace, or null. */
  staffDesk: StationId | null;
  /** Reviews waiting at the open roleplay desk (only that desk is filled). */
  pendingQueueMap: Partial<Record<StationId, StaffCase[]>>;
  /** Today's shift objective per role. */
  staffShift: Partial<Record<StaffRoleId, ShiftProgress>>;
  /** Opens the workspace at a roleplay desk and pauses the clock. Ignored for any other desk. */
  openStaffDesk(id: StationId): void;
  /** Closes the workspace; the clock resumes if it was running when the desk opened. */
  closeStaffDesk(): void;
  /** Decides one pending review at the open desk. */
  staffDecide(packetId: string, decision: StaffDecision, latencySec: number, slaSec: number): StaffDecisionResult;
  /** The task of the 28-task matrix the open desk is drilling, and how many of its cases are done. */
  staffTask: StaffTaskNo;
  staffTaskSeq: number;
  /** Switches task within the same desk, instantly; the shift carries on. */
  setStaffTask(task: StaffTaskNo): void;
  /** Moves to another roleplay desk after the learner confirmed: ends the shift and starts Task 1. */
  switchStaffDesk(id: StationId): void;
  /**
   * Decides the head case of the current task and books it on the shift and the career. `expert` is the workspace's complexity
   * mode; `assisted` means the learner revealed the Decision Support Engine's advice in Expert mode, which forfeits the combo bonus.
   */
  staffTrain(caseId: string, decision: StaffDecision, latencySec: number, slaSec: number, expert?: boolean, assisted?: boolean): StaffDecisionResult;
  /** Lifetime XP, badges and badge streaks, kept in storage. */
  career: CareerProgress;
  /** Badges unlocked at the last shift end, waiting for their celebration. */
  badgeUnlocks: BadgeId[];
  /** Closes the celebration for the first waiting badge. */
  dismissBadgeUnlock(): void;
  /** The double-entry core ledger every desk decision (training, retail or live queue) posts its journal to, kept in storage. */
  retailLedger: RetailLedger;
  /** Back to the opening balances, erasing every posted journal and the whole audit trail. */
  resetRetailLedger(): void;
  /** Every desk decision, oldest first, for the audit export (at most AUDIT_LOG_CAP). Saved, so it survives a reload like the ledger. */
  auditLog: AuditEntry[];
  /** The shift new decisions are recorded under (AuditEntry.shift). */
  auditShift: number;
  /** The running Time-Attack challenge (kept in the store so a language switch, which remounts the app, cannot reset it). */
  staffChallenge: { endsAt: number; tally: ChallengeTally } | null;
  /** The tally of the challenge that just ended, shown on the scorecard until dismissed. */
  staffChallengeResult: ChallengeTally | null;
  startChallenge(at?: number): void;
  stopChallenge(): void;
  /** Books a challenge decision; ignored once the clock has run out. */
  recordChallenge(correct: boolean, latencySec: number, at?: number): void;
  /** Ends the challenge when its clock has run out and opens the scorecard. */
  tickChallenge(at?: number): void;
  dismissChallengeResult(): void;
  /** Incident Mode: on by default; each new shift at a desk rolls a 25% chance of a crisis event. */
  staffIncidentMode: boolean;
  /** The crisis event running at the open desk, if any. */
  staffIncident: ActiveIncident | null;
  /** Switches Incident Mode; turning it on rolls for the open desk at once, turning it off ends any incident. */
  setIncidentMode(on: boolean): void;
  /** Cases one crisis lasts in the emergency queue (3, 5, 10 or a custom size; 1 makes it a mixed stream). */
  staffCrisisBatch: number;
  /** The mixed crisis stream: every case of the emergency queue brings a different crisis. */
  staffCrisisStream: boolean;
  setCrisisBatch(n: number): void;
  setCrisisStream(on: boolean): void;

  // Clock
  play(): void;
  pause(): void;
  toggle(): void;
  step(): void;
  /** Called by the clock hook once per beat. */
  tickBeat(): void;
  setSpeed(index: number): void;
  skipTo(minute: number): void;
  /** Runs the clock forward to 23:00 and keeps playing, so the night cycle can be watched. */
  jumpToEod(): void;
  skipToEndOfDay(): void;
  startNextDay(): void;
  resetBank(): void;
  /** Replays the day the bank is on from 07:00, as the staff arrive: same customers, same carry-over, today's report (if any) dropped. */
  resetDay(): void;
  /**
   * The time scrubber: puts the bank clock (and with it the queues, the KPIs and the ledger) at `minute` of today, forwards or
   * backwards. Forwards plays the day on to that time; backwards replays today from 07:00 up to it, with the same
   * customers. Reaching 24:00 closes the day as usual.
   */
  scrubTo(minute: number): void;

  // Operations
  addCover(station: StationId): void;

  // Looking
  setTermMode(mode: TermMode): void;
  setViewMode(mode: ViewMode): void;
  setLabelMode(mode: LabelMode): void;
  setHoverPlace(id: PlaceId | null): void;
  setInspectorWidth(px: number): void;
  select(selection: Selection): void;
  clearSelection(): void;
  dismissReport(): void;
  reopenReport(): void;

  // The viewport: scope, dimension (2D/3D), data depth and the guided flow
  setScope(scope: Scope): void;
  setDimension(dimension: Dimension): void;
  setDataDepth(depth: DataDepth): void;
  setActiveFlow(flow: FlowId): void;
  /**
   * The Academy split view picked a lesson step: one change that ends any chapter tour, lights `flow` in the Beginner scope (or,
   * with no flow, shows the whole bank in the Advanced scope) and marks `place` as the node in focus.
   */
  focusAcademyStep(target: { flow: FlowId | null; place: PlaceId | null }): void;
  clearAcademyFocus(): void;
  /**
   * One click of a preset action: sends the scripted customer into the bank and follows it in the inspector. When the bank was
   * paused, only that payment plays (a solo run) and the clock stops again once it is done; when the bank was already running
   * live, the payment simply joins the traffic.
   */
  runPreset(id: PresetId): void;
  /** Lights a guided flow on the map and plays its main preset payment (the "Simulate this Flow" deep link from the Academy). */
  triggerGuidedFlow(flow: FlowId): void;

  // Walkthrough card
  setWalkCollapsed(collapsed: boolean): void;
  /** Re-opens the tour left with "Exit tutorial" at the same chapter, example, step and answers. */
  resumeSpotlight(): void;
  dismissResume(): void;

  // Academy (the Course Catalog)
  openAcademy(): void;
  closeAcademy(): void;
  /** "Start Chapter": closes the catalog and begins the chapter's tour (dimmed map, speed locked to 0.25×, the Walkthrough Dock open). */
  startChapter(process: ProcessId, exampleId?: string): void;

  // Learn & Explore (the guided tour)
  startSpotlight(process: ProcessId, exampleId?: string): void;
  /** Leaves the opening briefing and sets the token off. */
  beginSpotlight(): void;
  spotlightGo(step: number): void;
  spotlightNext(): void;
  spotlightPrev(): void;
  /** Moves the tour to the first step that happens at a desk. */
  spotlightFocus(place: PlaceId): void;
  setSpotlightAuto(auto: boolean): void;
  setSpotlightExample(exampleId: string): void;
  /** Answers the question at the current decision gateway. Only the first answer to a question counts. */
  answerQuiz(optionIndex: number): void;
  exitSpotlight(): void;

  toggleLedger(): void;
  closeLedger(): void;

  // Learning Hub
  openHub(process: ProcessId): void;
  closeHub(): void;
  setHubProcess(process: ProcessId): void;
  setDraftRule<K extends keyof BankRules>(key: K, value: number): void;
  resetDraft(): void;
  applyDraft(): void;
  runComparison(days?: number): void;

  dismissNotice(): void;

  // Chaos Monkey and disputes
  /** The faults switched on, and whether day 2 and day 3 run their scripted scenarios. */
  chaos: ChaosConfig;
  /** Switches faults on or off. They apply to the running bank at once and to every replay of the day. */
  setChaos(next: Partial<ChaosConfig>): void;
  /** Raises a chargeback on a card purchase from the live ledger (2110 back to 2010). */
  disputeTransaction(txId: string): DisputeResult;
  /** Sends one hand-made customer into the bank now (the AML desk's test transfer). Returns its id, or null after closing time. */
  sendCustomer(customer: Customer): string | null;
}

export interface BankStoreOptions {
  storage?: KeyValueStorage | null;
  now?: () => Date;
  seed?: number;
  /** Chaos Monkey settings to start with. Off unless given. */
  chaos?: Partial<ChaosConfig>;
  /** The dice Incident Mode rolls with (Math.random unless given). */
  incidentRandom?: () => number;
}

/** The process each desk takes part in, first one being its main process. */
export function processesAt(station: StationId): ProcessId[] {
  return STATIONS[station].processes.length > 0 ? [...STATIONS[station].processes] : ['A', 'B'];
}

const clampSpeed = (i: number): number => Math.min(SPEEDS.length - 1, Math.max(0, Math.round(i)));

/** True when the token has reached a decision whose question has not been answered yet. */
export function quizPending(tour: SpotlightState | null, rules: BankRules): boolean {
  if (!tour || tour.intro) return false;
  const plan = spotPlan(tour.process, tour.exampleId, rules);
  return quizFor(plan, tour.step) !== null && tour.answers[tour.step] === undefined;
}

export function createBankStore(options: BankStoreOptions = {}): StoreApi<BankState> {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const now = options.now ?? (() => new Date());

  const saved = loadBank(storage);
  /** What the learner chose last time: Expert or Beginner words, 2D or 3D. */
  let prefs: BankPrefs = loadPrefs(storage);
  let ui: UiPrefs = loadUiPrefs(storage);
  const seed = saved?.seed ?? options.seed ?? DEFAULT_SEED;
  const initialChaos: ChaosConfig = cleanChaos({ ...NO_CHAOS, ...options.chaos });
  const makeSim = (): BankSimulation =>
    new BankSimulation({
      seed,
      day: saved?.day ?? 1,
      rules: saved?.rules ?? DEFAULT_RULES,
      chaos: initialChaos,
      ...(saved ? { carry: saved.carry, history: saved.history } : {}),
    });
  const sim = makeSim();

  const store = createStore<BankState>()((set, get) => {
    /** What the bank had been left with when today began. A reload during the day starts from this. */
    let startCarry = sim.carryState();
    /** A comparison asked for while another was running. */
    let waiting: number | null = null;

    /** The state changes that end a guided tour: the clock speed comes back, and (optionally) so does playing. */
    const endTour = (restorePlaying: boolean): Partial<BankState> => {
      const tour = get().spotlight;
      if (!tour) return {};
      return { spotlight: null, speedIndex: tour.priorSpeed, ...(restorePlaying ? { playing: tour.resume } : {}) };
    };
    /** Any control that works the clock first ends a tour: the tour owns the clock while it runs. */
    const leaveTour = (): void => {
      if (get().spotlight) set(endTour(false));
    };

    /** Writes the state at the start of the day the bank is on (or the next one, once today is over). */
    const persist = (): void => {
      const s = get();
      const dayOver = s.sim.dayOver;
      const result: BankSaveResult = saveBank(
        storage,
        {
          seed: s.seed,
          day: dayOver ? s.sim.day + 1 : s.sim.day,
          rules: s.sim.rules,
          history: s.view.history,
          carry: dayOver ? s.sim.carryState() : startCarry,
        },
        now,
      );
      set({ saveStatus: result, lastSavedAt: result === 'saved' ? now().toISOString() : s.lastSavedAt });
    };

    const refresh = (extra: Partial<BankState> = {}): void => {
      const s = get();
      const presetTxId = 'presetTxId' in extra ? (extra.presetTxId ?? null) : s.presetTxId;
      const presetTrace = presetTxId ? s.sim.traceOf(presetTxId) : null;
      const desk = 'staffDesk' in extra ? (extra.staffDesk ?? null) : s.staffDesk;
      s.sim.setStaffOverride(desk);
      const pendingQueueMap = desk ? { [desk]: s.sim.staffCases(desk) } : {};
      set({ view: s.sim.snapshot(), presetTrace, pendingQueueMap, ...extra, ...(presetTxId && !presetTrace ? { presetTxId: null } : {}) });
    };
    /** Whether the clock was running when the roleplay desk opened. */
    let staffResume = false;

    /** Appends a decision to the audit trail. */
    const audit = (log: readonly AuditEntry[], d: Pick<AuditEntry, 'station' | 'role' | 'caseId' | 'amountCents' | 'latencySec' | 'slaSec' | 'expert' | 'assisted'>, r: StaffDecisionResult, at: string): AuditEntry[] => {
      const entry: AuditEntry = {
        ...d,
        seq: (log[log.length - 1]?.seq ?? 0) + 1,
        shift: get().auditShift,
        at,
        latencySec: Math.max(0, d.latencySec),
        action: auditActionOf(r),
        expected: r.expected,
        statusCode: r.statusCode,
        lines: r.journal?.lines ?? [],
        compliance: complianceOf(r.correct, d.latencySec, d.slaSec),
      };
      return [...log, entry].slice(-AUDIT_LOG_CAP);
    };
    /**
     * The one way a decision reaches the books: its journal (if it moves money) is posted and its audit row is appended in the
     * same step, with the same timestamp, and both are saved. No path can post to the ledger without writing the trail.
     */
    const book = (
      s: Pick<BankState, 'retailLedger' | 'auditLog'>,
      d: Pick<AuditEntry, 'station' | 'role' | 'caseId' | 'amountCents' | 'latencySec' | 'slaSec' | 'expert' | 'assisted'>,
      r: StaffDecisionResult,
    ): Pick<BankState, 'retailLedger' | 'auditLog'> => {
      const at = now().toISOString();
      const retailLedger = r.journal ? postJournal(s.retailLedger, { ...r.journal, station: d.station, at }) : s.retailLedger;
      const auditLog = audit(s.auditLog, d, r, at);
      if (r.journal) saveRetailLedger(storage, retailLedger);
      saveAuditLog(storage, auditLog);
      return { retailLedger, auditLog };
    };
    const incidentRandom = options.incidentRandom ?? Math.random;
    /** The crisis a shift at `station` opens with while Incident Mode runs the emergency queue (never the one that just ended), or none. */
    const rollFor = (station: StationId | null, on = get().staffIncidentMode, previous: IncidentId | null = null): ActiveIncident | null => {
      const role = station ? roleForStation(station) : null;
      return on && role ? startIncident(rollCrisis(role, incidentRandom, previous)) : null;
    };

    const openingRetailLedger = loadRetailLedger(storage);
    const savedAuditLog = loadAuditLog(storage, AUDIT_LOG_CAP);
    const openingAuditLog = recoverAuditLog(savedAuditLog, openingRetailLedger);
    if (openingAuditLog.length !== savedAuditLog.length) saveAuditLog(storage, openingAuditLog);
    // Every page load opens a new shift, after the highest one on record.
    const openingShift = openingAuditLog.reduce((n, e) => Math.max(n, e.shift), 0) + 1;

    const closeDay = (): void => {
      set({ playing: false, solo: false });
      refresh({ reportOpen: true });
      persist();
    };

    /**
     * Today, rebuilt from what it started with (startCarry) and the rules the learner has now, so changing a dial and
     * replaying is a fair way to ask "what would this same day have looked like?". Today's own report goes; earlier ones stay.
     */
    const rebuildToday = (): BankSimulation => {
      const s = get();
      const day = s.sim.day;
      return new BankSimulation({
        seed: s.seed,
        day,
        rules: s.sim.rules,
        chaos: s.chaos,
        carry: startCarry,
        history: s.sim.snapshot().history.filter((r) => r.day < day),
      });
    };

    const advance = (beats: number, solo = false): void => {
      const { sim: bank } = get();
      for (let i = 0; i < beats && !bank.dayOver; i++) bank.step({ admit: !solo });
    };
    /** Beats a solo run has played, and the most it may play before it stops anyway. */
    let soloBeats = 0;
    const SOLO_BEAT_LIMIT = 120;

    return {
      sim,
      view: sim.snapshot(),
      seed,

      playing: false,
      speedIndex: DEFAULT_SPEED_INDEX,

      termMode: prefs.terms,
      viewMode: prefs.view,
      labelMode: ui.labels,
      hoverPlace: null,
      inspectorWidth: ui.inspectorWidth,
      spotlight: null,
      academyOpen: false,
      walkCollapsed: false,
      leftTour: null,

      scope: ui.scope,
      flow: ui.flow,
      presetTxId: null,
      presetTrace: null,
      solo: false,
      focusPlace: null,

      selection: { kind: 'none' },
      reportOpen: false,
      ledgerOpen: false,

      hubOpen: false,
      hubProcess: 'B',
      draftRules: { ...sim.rules },
      comparison: null,
      comparisonStatus: 'idle',
      comparisonDays: 1,

      saveStatus: storage ? (saved ? 'saved' : 'pristine') : 'unavailable',
      lastSavedAt: saved?.savedAt || null,
      notice: saved ? { kind: 'info', message: `Welcome back. The bank is on day ${saved.day}.` } : null,

      staffDesk: null,
      pendingQueueMap: {},
      staffShift: {},

      staffTask: 1,
      staffTaskSeq: 0,
      staffChallenge: null,
      staffChallengeResult: null,
      staffIncidentMode: false,
      staffIncident: null,
      staffCrisisBatch: CRISIS_BATCH.default,
      staffCrisisStream: false,
      setCrisisBatch: (n) => set({ staffCrisisBatch: clampCrisisBatch(n) }),
      setCrisisStream: (on) => set({ staffCrisisStream: on }),
      career: loadCareer(storage),
      badgeUnlocks: [],
      dismissBadgeUnlock: () => set({ badgeUnlocks: get().badgeUnlocks.slice(1) }),
      retailLedger: openingRetailLedger,
      auditLog: openingAuditLog,
      auditShift: openingShift,
      // The audit trail goes with the ledger: its rows are the history of the journals being erased.
      resetRetailLedger: () => {
        const retailLedger = openingLedger();
        saveRetailLedger(storage, retailLedger);
        saveAuditLog(storage, []);
        set({ retailLedger, auditLog: [] });
      },

      // On: the desk leaves its routine task for the emergency queue. Off: back to the task it was on, from its first case.
      setIncidentMode: (on) => set({ staffIncidentMode: on, staffIncident: on ? rollFor(get().staffDesk, true) : null, staffTaskSeq: 0 }),

      startChallenge: (at = Date.now()) => set({ staffChallenge: { endsAt: at + CHALLENGE.durationSec * 1000, tally: EMPTY_TALLY }, staffChallengeResult: null, staffIncident: rollFor(get().staffDesk) }),
      stopChallenge: () => set({ staffChallenge: null }),
      recordChallenge: (correct, latencySec, at = Date.now()) => {
        const run = get().staffChallenge;
        if (!run || at >= run.endsAt) return;
        set({ staffChallenge: { ...run, tally: addToTally(run.tally, correct, latencySec, incidentRules(get().staffIncident?.id)) } });
      },
      tickChallenge: (at = Date.now()) => {
        const run = get().staffChallenge;
        if (run && at >= run.endsAt) set({ staffChallenge: null, staffChallengeResult: run.tally });
      },
      dismissChallengeResult: () => set({ staffChallengeResult: null }),

      openStaffDesk: (id) => {
        if (!roleForStation(id)) return;
        const s = get();
        if (s.staffDesk === null) staffResume = s.playing;
        set({ playing: false, ...(s.staffDesk !== id ? { staffTask: 1 as StaffTaskNo, staffTaskSeq: 0, staffIncident: rollFor(id) } : {}) });
        refresh({ staffDesk: id });
      },

      setStaffTask: (task) => {
        if (get().staffTask === task) return;
        set({ staffTask: task, staffTaskSeq: 0 });
      },

      switchStaffDesk: (id) => {
        const s = get();
        if (!roleForStation(id) || !s.staffDesk || s.staffDesk === id) return;
        set({ staffShift: {}, staffTask: 1, staffTaskSeq: 0, staffChallenge: null, staffChallengeResult: null, staffIncident: rollFor(id), career: { ...s.career, shift: EMPTY_SHIFT_LOG }, auditShift: s.auditShift + 1 });
        refresh({ staffDesk: id });
      },

      staffTrain: (caseId, decision, latencySec, slaSec, expert = false, assisted = false) => {
        const s = get();
        const role = s.staffDesk ? roleForStation(s.staffDesk) : null;
        const incident = s.staffIncident;
        const crisis = s.staffIncidentMode && incident ? incident.id : null;
        const head = role ? buildTaskCase(role, workingTask(s.staffTask, s.staffIncidentMode, crisis), s.staffTaskSeq, incident?.id ?? null) : null;
        if (!role || !head || head.id !== caseId) return { ok: false, packetId: caseId, decision, expected: null, correct: false, statusCode: 'NO_CASE' };
        const graded = gradeTaskCase(head, decision);
        // In the emergency queue the money goes to the risk and holding accounts (1920 dispute, 2912 suspense, 2930 frozen).
        const result = crisis && graded.journal && !head.retail ? { ...graded, journal: { ...graded.journal, lines: crisisJournalLines(head, decision, crisis) } } : graded;
        const prev = s.staffShift[role] ?? EMPTY_SHIFT;
        const next: ShiftProgress = {
          reviews: prev.reviews + 1,
          correct: prev.correct + (result.correct ? 1 : 0),
          latencySumSec: prev.latencySumSec + Math.max(0, latencySec),
          slaBreaches: prev.slaBreaches + (latencySec > slaSec ? 1 : 0),
          errors: prev.errors + (result.correct ? 0 : 1),
          ...bookCombo(prev, result.correct, assisted),
          last: result,
        };
        if (!result.correct) next.xp -= incidentErrorXp(incident?.id);
        // A crisis lasts its batch of cases (every case in the mixed stream), then the next one rolls at once: the emergency
        // queue loops until Incident Mode is turned off.
        const advanced = incident && advanceIncident(incident, result.correct);
        const staffIncident = advanced && crisisOver(advanced, s.staffCrisisBatch, s.staffCrisisStream) ? rollFor(s.staffDesk, s.staffIncidentMode, advanced.id) : advanced;
        const { career, unlocked } = recordCareerDecision(s.career, { role, drill: head.drill, expected: result.expected, decision, correct: result.correct, latencySec, expert, xp: next.xp - prev.xp });
        saveCareer(storage, career);
        const { retailLedger, auditLog } = book(s, { station: head.station, role, caseId, amountCents: head.amountCents, latencySec, slaSec, expert, assisted }, result);
        set({ staffShift: { ...s.staffShift, [role]: next }, staffTaskSeq: s.staffTaskSeq + 1, staffIncident, career, retailLedger, auditLog, ...(unlocked.length ? { badgeUnlocks: [...s.badgeUnlocks, ...unlocked] } : {}) });
        return result;
      },

      closeStaffDesk: () => {
        const resume = staffResume && !get().sim.dayOver;
        staffResume = false;
        get().sim.setStaffOverride(null);
        set({ staffDesk: null, pendingQueueMap: {}, staffChallenge: null, staffChallengeResult: null, staffIncident: null, ...(resume ? { playing: true } : {}) });
      },

      staffDecide: (packetId, decision, latencySec, slaSec) => {
        const s = get();
        const desk = s.staffDesk;
        const role = desk ? roleForStation(desk) : null;
        if (!desk || !role) return { ok: false, packetId, decision, expected: null, correct: false, statusCode: 'NO_DESK' };
        const reviewed = s.pendingQueueMap[desk]?.find((c) => c.id === packetId);
        const decided = s.sim.staffDecide(desk, packetId, decision, latencySec);
        if (!decided.ok) return decided;
        // A live review posts the same journal its training twin would: the queue case carries the role, amount and fields.
        const result: StaffDecisionResult = reviewed ? { ...decided, journal: caseJournal(reviewed, decision, decided.statusCode) } : decided;
        const prev = s.staffShift[role] ?? EMPTY_SHIFT;
        const next: ShiftProgress = {
          reviews: prev.reviews + 1,
          correct: prev.correct + (result.correct ? 1 : 0),
          latencySumSec: prev.latencySumSec + Math.max(0, latencySec),
          slaBreaches: prev.slaBreaches + (latencySec > slaSec ? 1 : 0),
          errors: prev.errors + (result.correct ? 0 : 1),
          ...bookCombo(prev, result.correct),
          last: result,
        };
        const { retailLedger, auditLog } = book(s, { station: desk, role, caseId: packetId, amountCents: reviewed?.amountCents ?? 0, latencySec, slaSec, expert: false, assisted: false }, result);
        refresh({ staffShift: { ...s.staffShift, [role]: next }, retailLedger, auditLog });
        return result;
      },
      chaos: initialChaos,

      setChaos: (next) => {
        const s = get();
        const chaos = cleanChaos({ ...s.chaos, ...next });
        s.sim.setChaos(chaos);
        set({ chaos });
        refresh();
      },

      sendCustomer: (customer) => {
        const s = get();
        const id = s.sim.inject(customer);
        if (id) refresh();
        return id;
      },

      disputeTransaction: (txId) => {
        const s = get();
        const result = s.sim.disputeTransaction(txId);
        if (result.ok) refresh();
        return result;
      },

      play: () => {
        const s = get();
        if (s.sim.dayOver) return;
        set({ ...endTour(false), playing: true, solo: false });
      },
      pause: () => set({ playing: false, solo: false }),
      toggle: () => (get().playing ? get().pause() : get().play()),

      step: () => {
        const s = get();
        if (s.sim.dayOver) return;
        set({ ...endTour(false), playing: false, solo: false });
        advance(1);
        if (s.sim.dayOver) closeDay();
        else refresh();
      },

      tickBeat: () => {
        const s = get();
        if (!s.playing) return;
        advance(1, s.solo);
        if (s.sim.dayOver) {
          closeDay();
          return;
        }
        refresh();
        // A solo run ends by itself: the payment is done (or the guard ran out), so the clock stops and the result stays on screen.
        if (s.solo) {
          soloBeats++;
          const trace = get().presetTrace;
          if (!trace || trace.done || soloBeats >= SOLO_BEAT_LIMIT) set({ playing: false, solo: false });
        }
      },

      // A guided tour locks the speed to the slowest setting so nothing runs ahead of the explanation.
      setSpeed: (index) => {
        if (get().spotlight) return;
        set({ speedIndex: clampSpeed(index) });
      },

      skipTo: (minute) => {
        const s = get();
        if (s.sim.dayOver || minute <= s.sim.minute) return;
        leaveTour();
        s.sim.stepUntil(Math.min(minute, DAY_END));
        if (s.sim.dayOver) closeDay();
        else refresh();
      },

      jumpToEod: () => {
        const s = get();
        if (s.sim.dayOver || s.sim.minute >= EOD_START) return;
        leaveTour();
        s.sim.stepUntil(EOD_START);
        refresh({
          playing: true,
          solo: false,
          notice: { kind: 'info', message: 'Jumped to 23:00. The EOD night cycle is starting: batch clearing, Visa settlement, then reconciliation.' },
        });
      },

      skipToEndOfDay: () => {
        const s = get();
        if (s.sim.dayOver) return;
        leaveTour();
        s.sim.runToEndOfDay();
        closeDay();
      },

      startNextDay: () => {
        const s = get();
        s.sim.nextDay();
        startCarry = s.sim.carryState();
        set({ ...endTour(false), playing: false, solo: false, reportOpen: false, draftRules: { ...s.sim.rules }, comparison: null, comparisonStatus: 'idle', staffShift: {} });
        refresh();
        persist();
      },

      resetBank: () => {
        clearBank(storage);
        const fresh = new BankSimulation({ seed: get().seed, chaos: get().chaos });
        startCarry = fresh.carryState();
        set({
          ...endTour(false),
          sim: fresh,
          playing: false,
          solo: false,
          selection: { kind: 'none' },
          reportOpen: false,
          draftRules: { ...fresh.rules },
          comparison: null,
          comparisonStatus: 'idle',
          saveStatus: storage ? 'pristine' : 'unavailable',
          lastSavedAt: null,
          staffShift: {},
          notice: { kind: 'info', message: 'The bank is back on day 1.' },
        });
        refresh();
      },

      scrubTo: (target) => {
        const s = get();
        const minute = Math.max(DAY_START, Math.min(DAY_END, Math.round(target)));
        if (minute === s.sim.minute && !s.sim.dayOver) return;
        if (s.sim.dayOver && minute >= DAY_END) return;
        leaveTour();
        if (minute > s.sim.minute && !s.sim.dayOver) {
          s.sim.stepUntil(minute);
          if (s.sim.dayOver) closeDay();
          else refresh();
          return;
        }
        // Backwards: today again from the briefing, the same customers, up to the time asked for.
        const fresh = rebuildToday();
        fresh.stepUntil(minute);
        set({ sim: fresh, selection: { kind: 'none' }, reportOpen: false, comparison: null, comparisonStatus: 'idle' });
        if (fresh.dayOver) closeDay();
        else {
          refresh();
          persist();
        }
      },

      resetDay: () => {
        const s = get();
        const day = s.sim.day;
        const fresh = rebuildToday();
        leaveTour();
        set({
          sim: fresh,
          playing: false,
          solo: false,
          selection: { kind: 'none' },
          reportOpen: false,
          draftRules: { ...fresh.rules },
          comparison: null,
          comparisonStatus: 'idle',
          staffShift: {},
          notice: { kind: 'info', message: `Day ${day} is back at 07:00, as the staff arrive. The same customers will arrive.` },
        });
        refresh();
        persist();
      },

      addCover: (station) => {
        const s = get();
        if (!s.sim.addCover(station)) {
          set({ notice: { kind: 'warn', message: `${STATIONS[station].name} cannot take any more temporary cover today.` } });
          return;
        }
        refresh();
      },

      setTermMode: (mode) => {
        prefs = { ...prefs, terms: mode };
        savePrefs(storage, prefs);
        set({ termMode: mode });
      },

      setViewMode: (mode) => {
        // A tour works in both views, so switching between them carries on at the same step.
        prefs = { ...prefs, view: mode };
        savePrefs(storage, prefs);
        set({ viewMode: mode });
      },

      setLabelMode: (mode) => {
        ui = { ...ui, labels: mode };
        saveUiPrefs(storage, ui);
        set({ labelMode: mode });
      },

      setHoverPlace: (id) => {
        if (get().hoverPlace !== id) set({ hoverPlace: id });
      },

      setInspectorWidth: (px) => {
        const width = clampInspectorWidth(px);
        if (width === get().inspectorWidth) return;
        ui = { ...ui, inspectorWidth: width };
        saveUiPrefs(storage, ui);
        set({ inspectorWidth: width });
      },

      // While a tour runs, a click on the map takes the token to that desk; it does not open the inspector over the lesson.
      select: (selection) => {
        if (get().spotlight && selection.kind !== 'none') return;
        set({ selection });
      },
      clearSelection: () => set({ selection: { kind: 'none' } }),
      toggleLedger: () => set({ ledgerOpen: !get().ledgerOpen }),
      closeLedger: () => set({ ledgerOpen: false }),
      dismissReport: () => set({ reportOpen: false }),
      reopenReport: () => set({ reportOpen: get().sim.dayOver || get().view.history.length > 0 }),

      setScope: (scope) => {
        if (get().scope === scope) return;
        ui = { ...ui, scope };
        saveUiPrefs(storage, ui);
        set({ scope });
      },
      setDimension: (dimension) => get().setViewMode(dimension),
      setDataDepth: (depth) => get().setTermMode(depth === 'expert' ? 'expert' : 'beginner'),
      setActiveFlow: (flow) => {
        ui = { ...ui, flow, scope: 'beginner' };
        saveUiPrefs(storage, ui);
        set({ flow, scope: 'beginner' });
      },

      focusAcademyStep: ({ flow, place }) => {
        const s = get();
        const scope: Scope = flow === null ? 'advanced' : 'beginner';
        const next = flow ?? s.flow;
        if (scope !== s.scope || next !== s.flow) {
          ui = { ...ui, scope, flow: next };
          saveUiPrefs(storage, ui);
        }
        set({ ...endTour(false), scope, flow: next, focusPlace: place });
      },
      clearAcademyFocus: () => {
        if (get().focusPlace !== null) set({ focusPlace: null });
      },

      runPreset: (id) => {
        const def = presetById(id);
        const s = get();
        if (!def || s.sim.dayOver) return;
        if (id === 'eod') {
          if (s.sim.minute >= EOD_START) {
            set({ ...endTour(false), playing: true, solo: false });
            return;
          }
          s.jumpToEod();
          return;
        }
        const customer = presetCustomer(id, s.sim.rules);
        if (!customer) return;
        const txId = s.sim.inject(customer);
        if (!txId) return;
        // A paused bank plays this one payment on its own (a solo run); a bank that is already live just takes it in.
        const solo = !s.playing;
        soloBeats = 0;
        refresh({
          ...endTour(false),
          presetTxId: txId,
          playing: true,
          solo,
          speedIndex: Math.min(s.speedIndex, DEFAULT_SPEED_INDEX),
          selection: { kind: 'transaction', id: txId },
          ledgerOpen: false,
        });
      },

      triggerGuidedFlow: (flow) => {
        get().setActiveFlow(flow);
        get().runPreset(PRIMARY_PRESET[flow]);
      },

      setWalkCollapsed: (collapsed) => set({ walkCollapsed: collapsed }),
      resumeSpotlight: () => {
        const left = get().leftTour;
        if (!left) return;
        get().startSpotlight(left.process, left.exampleId);
        const tour = get().spotlight;
        if (!tour) return;
        const last = spotPlan(left.process, tour.exampleId, get().sim.rules).steps.length - 1;
        set({ spotlight: { ...tour, intro: false, step: Math.min(Math.max(0, left.step), last), answers: { ...left.answers } }, walkCollapsed: false });
      },
      dismissResume: () => set({ leftTour: null }),

      openAcademy: () => set({ academyOpen: true, hubOpen: false, ledgerOpen: false }),
      closeAcademy: () => set({ academyOpen: false }),
      startChapter: (process, exampleId) => {
        set({ academyOpen: false });
        get().startSpotlight(process, exampleId);
      },

      startSpotlight: (process, exampleId) => {
        const s = get();
        const wanted = exampleId && LESSONS[process].examples.some((e) => e.id === exampleId) ? exampleId : SPOTLIGHT_DEFAULT_EXAMPLE[process];
        const before = s.spotlight;
        set({
          spotlight: {
            process,
            exampleId: wanted,
            step: 0,
            auto: false,
            intro: true,
            answers: {},
            // Switching to another process mid-tour keeps what the learner had before the first tour began.
            resume: before ? before.resume : s.playing,
            priorSpeed: before ? before.priorSpeed : s.speedIndex,
          },
          speedIndex: SLOWEST_SPEED_INDEX,
          academyOpen: false,
          leftTour: null,
          walkCollapsed: false,
          hubOpen: false,
          ledgerOpen: false,
          playing: false,
          solo: false,
          selection: { kind: 'none' },
          reportOpen: false,
        });
      },

      beginSpotlight: () => {
        const tour = get().spotlight;
        if (tour?.intro) set({ spotlight: { ...tour, intro: false } });
      },

      spotlightGo: (target) => {
        const tour = get().spotlight;
        if (!tour || tour.intro) return;
        const plan = spotPlan(tour.process, tour.exampleId, get().sim.rules);
        const last = plan.steps.length - 1;
        let next = Math.min(last, Math.max(0, Math.round(target)));
        if (next > tour.step) {
          // The token cannot pass a decision the learner has not answered.
          for (let i = tour.step; i < next; i++) {
            if (quizFor(plan, i) !== null && tour.answers[i] === undefined) {
              next = i;
              break;
            }
          }
        }
        if (next !== tour.step) set({ spotlight: { ...tour, step: next } });
      },

      spotlightNext: () => {
        const tour = get().spotlight;
        if (tour) get().spotlightGo(tour.step + 1);
      },

      spotlightPrev: () => {
        const tour = get().spotlight;
        if (tour) get().spotlightGo(tour.step - 1);
      },

      spotlightFocus: (place) => {
        const tour = get().spotlight;
        if (!tour || tour.intro) return;
        const at = spotPlan(tour.process, tour.exampleId, get().sim.rules).steps.findIndex((st) => st.place === place);
        if (at < 0) return;
        get().spotlightGo(at);
        // A click on a desk of the story is a request to read about it: unfold the step details if they were folded away.
        if (get().walkCollapsed) set({ walkCollapsed: false });
      },

      setSpotlightAuto: (auto) => {
        const tour = get().spotlight;
        if (!tour) return;
        const last = spotPlan(tour.process, tour.exampleId, get().sim.rules).steps.length - 1;
        // Starting auto-play at the end plays the tour again from the beginning.
        const restart = auto && !tour.intro && tour.step >= last;
        set({ spotlight: { ...tour, auto, intro: false, ...(restart ? { step: 0, answers: {} } : {}) } });
      },

      setSpotlightExample: (exampleId) => {
        const tour = get().spotlight;
        if (!tour || !LESSONS[tour.process].examples.some((e) => e.id === exampleId)) return;
        set({ spotlight: { ...tour, exampleId, step: 0, auto: false, intro: true, answers: {} } });
      },

      answerQuiz: (optionIndex) => {
        const tour = get().spotlight;
        if (!tour || tour.intro || tour.answers[tour.step] !== undefined) return;
        const quiz = quizFor(spotPlan(tour.process, tour.exampleId, get().sim.rules), tour.step);
        if (!quiz || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= quiz.options.length) return;
        set({ spotlight: { ...tour, answers: { ...tour.answers, [tour.step]: { picked: optionIndex, correct: optionIndex === quiz.correct } } } });
      },

      exitSpotlight: () => {
        const tour = get().spotlight;
        if (!tour) return;
        set({ ...endTour(true), walkCollapsed: false, leftTour: { process: tour.process, exampleId: tour.exampleId, step: tour.intro ? 0 : tour.step, answers: tour.answers } });
      },

      openHub: (process) => set({ ...endTour(false), hubOpen: true, academyOpen: false, ledgerOpen: false, hubProcess: process, playing: false }),
      closeHub: () => set({ hubOpen: false }),
      setHubProcess: (process) => set({ hubProcess: process }),

      setDraftRule: (key, value) => {
        set({ draftRules: clampRules({ ...get().draftRules, [key]: value }) });
      },

      resetDraft: () => set({ draftRules: { ...get().sim.rules }, comparison: null, comparisonStatus: 'idle' }),

      applyDraft: () => {
        const s = get();
        if (rulesEqual(s.draftRules, s.sim.rules)) {
          set({ notice: { kind: 'info', message: 'The bank is already running these rules.' } });
          return;
        }
        s.sim.setRules(s.draftRules);
        refresh({
          notice: {
            kind: 'info',
            message: s.sim.dayOver ? 'New rules saved. They start with the next day.' : 'New rules are live. They apply to customers who arrive from now on.',
          },
        });
        persist();
      },

      runComparison: (days = 1) => {
        const s = get();
        if (s.comparisonStatus === 'running') {
          // A dial moved while the last run was still going. Run again when it finishes.
          waiting = days;
          return;
        }
        set({ comparisonStatus: 'running', comparisonDays: days });
        // Let the screen show "running" before the few hundred milliseconds of work begin.
        setTimeout(() => {
          const cur = get();
          const comparison = compareDays({
            seed: cur.seed,
            startDay: cur.sim.day + 1,
            count: days,
            baseRules: cur.sim.rules,
            tweakedRules: cur.draftRules,
            carry: cur.sim.carryState(),
          });
          set({ comparison, comparisonStatus: 'done' });
          const again = waiting;
          waiting = null;
          const latest = get();
          if (again !== null && !rulesEqual(latest.draftRules, comparison.tweakedRules)) latest.runComparison(again);
        }, 30);
      },

      dismissNotice: () => set({ notice: null }),
    };
  });

  return store;
}

// ─────────────────────────────────────────────────────────────────────────────

/** The app's bank. Day 2 (flash sale) and day 3 (botnet) run their scripted scenarios. */
export const bankStore = createBankStore({ chaos: { scriptedDays: true } });

export function useBankStore<T>(selector: (state: BankState) => T): T {
  return useStore(bankStore, selector);
}

/** The data depth is the vocabulary switch seen from the viewport: Expert words and raw messages, or plain English. */
export const dataDepthOf = (s: Pick<BankState, 'termMode'>): DataDepth => (s.termMode === 'expert' ? 'expert' : 'standard');

/** The guided flow in focus: only in the Beginner scope, and never while a chapter tour has the map. */
export const activeFlowOf = (s: Pick<BankState, 'scope' | 'flow' | 'spotlight'>): FlowId | null => (s.scope === 'beginner' && !s.spotlight ? s.flow : null);

/**
 * The node the Academy is teaching, if it should show: never during a chapter tour, and, when a guided flow is lit, only if the
 * flow uses it (a node the learner has dimmed by picking another flow is not pulsed through the fade).
 */
export const academyFocusOf = (s: Pick<BankState, 'scope' | 'flow' | 'spotlight' | 'focusPlace'>): PlaceId | null => {
  if (s.spotlight || s.focusPlace === null) return null;
  const flow = activeFlowOf(s);
  return flow !== null && !flowPlaces(flow).has(s.focusPlace) ? null : s.focusPlace;
};

/** The four viewport choices as one value (build it from narrow selectors; see useViewport). */
export const viewportOf = (s: BankState): ViewportSettings => ({ scope: s.scope, dimension: s.viewMode, dataDepth: dataDepthOf(s), activeFlow: activeFlowOf(s) });

/** Convenience for the clock and the day-skip buttons. */
export const SKIP_TARGETS = {
  open: WORK_START,
  close: WORK_END,
  night: EOD_START,
  midnight: DAY_END,
} as const;

