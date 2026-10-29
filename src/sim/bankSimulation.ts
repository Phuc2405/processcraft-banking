/** The living bank. */

import { formatAud } from '../engine/capabilities';
import { emptyBook, groupByTransaction, post, trialBalance, type LedgerBook } from '../engine/ledger';
import { atmDeposit, atmDispense, atmJam, atmRefund, chargebackReversal, clearSuspense, toEntries } from '../engine/postings';
import {
  ALERT_FATIGUE_PER_BOT,
  BOT_AMOUNT_CENTS,
  BOTS_PER_BEAT,
  chaosActive,
  cleanChaos,
  CONGESTION_LATENCY_MS,
  congestionOn,
  congestionOutcome,
  emptyChaosStats,
  FATIGUE_SPIKE_LEVEL,
  HSM_CHANNELS,
  misApprovalChance,
  NO_CHAOS,
  scenarioForDay,
  SURGE_MULTIPLIER,
  type ChaosConfig,
  type ChaosScenario,
  type ChaosTag,
  type ChaosStats,
  type ChaosView,
} from '../engine/chaos';
import type { CardType, DerivedFacts, GLEntry } from '../types/processLearning';
import { BEATS_PER_DAY, DAY_END, DAY_START, EOD_START, beatIndexAt, beatMinutesAt, formatClock, phaseAt, type Phase } from './clock';
import { A2A_FEE_CENTS, BNPL_FEE_RATE, bnplDefaultRate, COVER_COST_CENTS, emptyKpis, INTERCHANGE_RATE, pnl } from './kpis';
import { closeBook, openingBook } from './bankBook';
import { describeWork, IDLE_TEXT } from './narration';
import { buildGraphs, planCheckout, planSettlement, type BankGraphs } from './processes';
import { clamp, hashSeed, Rng } from './prng';
import { clampRules, DEFAULT_RULES, type BankRules } from './rules';
import { BOT_SCENARIO_ID, scenarioLabelEn } from './scenarios';
import { isExtendedKind } from './amlEngine';
import { declineResponseCode } from './isoMessages';
import {
  DAY_START_FATIGUE,
  fatigueChange,
  isNightStation,
  MAX_COVER_PER_STATION,
  mistakeChance,
  NIGHT_START_FATIGUE,
  NIGHT_STATIONS,
  nightFatigueFactor,
  nightPoolFor,
  nightRotaFor,
  OVERNIGHT_KEEP,
  productivityFor,
  rosterFor,
  seatAt,
  staminaRecovery,
  workerSeed,
  type WorkerSeed,
} from './roster';
import { isAutomatedNode } from './nodeKind';
import { edgeId, EXTERNAL_IDS, SERVICE_ORDER, STATION_IDS, STATIONS, type ExternalId, type PlaceId, type StationId } from './topology';
import { eventForDay, generateDay, keyedUnit, makeCustomer, makeSettlement, workingBeatIndex, type DayTraffic } from './traffic';
import { QR_SCANNED_LABEL_EN } from '../i18n/stationBrand.messages';
import { buildStaffCase, NOSTRO_OPENING_CENTS, roleForStation, RP_COUNTERS, statusCodeFor, type StaffCase, type StaffDecision, type StaffDecisionResult } from './staffRoleplay';
import type {
  PacketTrace,
  AlertView,
  RoutePlan,
  TxRecord,
  NightShiftMember,
  NightShiftReport,
  BankView,
  CarryRecord,
  CarryState,
  CheckoutKind,
  Customer,
  DayKpis,
  DayReport,
  DeclineReason,
  FeedEntry,
  Move,
  Packet,
  PacketKind,
  PlaceCount,
  QueueItemView,
  Severity,
  Stop,
  StationStats,
  StationStatus,
  StationView,
  SuspenseItem,
  WorkerView,
} from './types';

// Tuning

/** How many of the latest ledger lines the screen is sent each beat. The trial balance covers all of them. */
const LEDGER_RECENT = 40;

/** How long a customer will wait at the checkout, in total, before they give up. Minutes. */
export const PATIENCE: Record<CheckoutKind, number> = { POS: 15, ECOM: 25, VIRTUAL: 20, BNPL: 45, A2A: 15, ATM: 8, ONBOARD: 30, QR: 12, TELLER: 40, SWIFT: 60, DISPUTE: 240 };

/** Declines that are down to how the bank is set up, not to the customer. */
const FRICTION: ReadonlySet<DeclineReason> = new Set<DeclineReason>(['DCVV_EXPIRED', 'THREE_DS_REJECT', 'OTP_ABANDONED', 'ATM_JAM', 'TIMEOUT', 'EKYC_LIVENESS_FAILED', 'BIOMETRIC_AUTH_REQUIRED', 'FDS_HIGH_RISK_DEVICE']);

/** The loss the bank books when a money-mule account gets through onboarding (it opens no money of its own). */
export const MULE_ACCOUNT_LOSS_CENTS = 50_000;

/** Cash in the branch vault behind the teller counter when the day opens. */
export const TELLER_VAULT_OPENING_CENTS = 25_000_000;

const MAX_MOVES = 28;
const FEED_LIMIT = 240;
const STREAM_LIMIT = 40;
const HISTORY_LIMIT = 40;
const QUEUE_SPARK_LENGTH = 60;
const QUEUE_VIEW_LIMIT = 40;
const ALERT_LIMIT = 60;

export const isCustomerStation = (id: StationId): boolean => id !== 'EOD_BATCH' && id !== 'EOD_VISA' && id !== 'RECON' && id !== 'SUSPENSE';

// State

interface WorkerState {
  seed: WorkerSeed;
  fatigue: number;
  /** Minutes into the current beat at which they are free. Above the beat length means they are still on the last item. */
  freeAt: number;
  busyMin: number;
  busyShare: number;
  items: number;
  activity: string | null;
  activityTick: number;
  temp: boolean;
}

interface StationState {
  id: StationId;
  queue: Packet[];
  workers: WorkerState[];
  counters: Record<string, number>;
  processed: number;
  waitSum: number;
  waitCount: number;
  peakQueue: number;
  errors: number;
  history: number[];
  working: { kind: PacketKind; cardType: CardType } | null;
  servedBeat: number;
  arrivalsBeat: number;
  utilisation: number;
  stream: FeedEntry[];
}

export interface BankSimOptions {
  seed: number;
  day?: number;
  rules?: Partial<BankRules>;
  /** What yesterday left behind: the suspense account and records the night team did not finish. */
  carry?: CarryState;
  history?: DayReport[];
  /** Temporary cover already booked for the day, by desk. */
  cover?: Partial<Record<StationId, number>>;
  /** Skip everything only a screen needs (feed, moves, wording). Several times faster. */
  headless?: boolean;
  /** Chaos Monkey faults and the scripted day 2 / day 3 scenarios. Off unless given. */
  chaos?: Partial<ChaosConfig>;
}

/** The result of disputing a payment from the ledger. */
export interface DisputeResult {
  ok: boolean;
  /** The amount reversed to the customer, when ok. */
  amountCents: number;
  /** Why the dispute could not be raised, when not ok. */
  reason: 'UNKNOWN' | 'NOT_A_CARD_PURCHASE' | 'ALREADY_DISPUTED' | 'DAY_OVER' | null;
  /** The id the reversal lines were posted under. */
  txId: string | null;
}

interface ApprovedRecord {
  txId: string;
  cardType: CardType;
  heldCents: number;
  scenario: string;
}

const bump = (st: StationState, key: string, n = 1): void => {
  st.counters[key] = (st.counters[key] ?? 0) + n;
};

const firstName = (w: WorkerState): string => w.seed.name.split(' ')[0] ?? w.seed.name;


export class BankSimulation {
  readonly seed: number;
  readonly headless: boolean;
  day: number;
  minute = DAY_START;
  tick = 0;
  dayOver = false;

  private rulesNow: BankRules;
  private graphs: BankGraphs;
  private traffic!: DayTraffic;
  private stations!: Record<StationId, StationState>;
  private kpis!: DayKpis;
  private feed: FeedEntry[] = [];
  private feedSerial = 0;
  private eventAlerts: AlertView[] = [];
  private alertSerial = 0;
  private alertThrottle = new Map<string, number>();
  private liveAlertIds = new Set<string>();
  private approved: ApprovedRecord[] = [];
  /** Today's general ledger: every payment that finishes posts its lines here, and they always balance. */
  private book: LedgerBook = emptyBook();
  private otpWaiting: Packet[] = [];
  private beatMoves: Move[] = [];
  private moveSerial = 0;
  private nightStarted = false;
  /** Everyone on the night team's books, and how tired each of them is (index for index). */
  private nightPool: WorkerSeed[] = [];
  private nightFatigue: number[] = [];
  /** Pool indices with tonight off. */
  private restingTonight: number[] = [];
  /** How many records the night team had to work when the night cycle began. */
  private nightRecords = 0;
  /** Every customer payment that finished today, in the order it finished (one small record each; see transactionLog). */
  private txLog: TxRecord[] = [];
  private txById = new Map<string, TxRecord>();
  /** The minute the night team cleared the last record, or null while records remain. */
  private nightDone: number | null = null;
  private settled: PlaceCount = { count: 0, cents: 0 };
  private history: DayReport[];
  private finalReport: DayReport | null = null;
  private takenNames = new Set<string>();
  private lastPhase: Phase | null = null;
  /** Packet id (without the tx_ prefix) to the scenario label, so a ledger line can say what the money was for. */
  private labels = new Map<string, string>();
  /** Payments the learner sent with a preset action today, by id, so the inspector can follow them along their route. */
  private scripted = new Map<string, Packet>();
  /** Generated customers kept out of the building during a solo run (see step). */
  private heldBack: Customer[] = [];
  /** Chaos Monkey: the faults switched on, today's scripted scenario and what they did. */
  private chaosConfig: ChaosConfig = { ...NO_CHAOS };
  private chaosScenario: ChaosScenario = 'NONE';
  private chaosStats: ChaosStats = emptyChaosStats();
  private chaosSerial = 0;
  /** Bot attempts since the last velocity alert, and the hour that alert covered. */
  private botsThisHour = 0;
  private velocityHour = -1;
  /** Payments already disputed from the ledger today, by transaction id. */
  private disputed = new Set<string>();
  /** What Chaos Monkey did to each payment it touched today, by packet id. */
  private chaosTags = new Map<string, ChaosTag>();

  constructor(options: BankSimOptions) {
    this.seed = options.seed;
    this.day = Math.max(1, Math.floor(options.day ?? 1));
    this.headless = options.headless === true;
    this.rulesNow = clampRules({ ...DEFAULT_RULES, ...options.rules });
    this.graphs = buildGraphs(this.rulesNow);
    this.history = [...(options.history ?? [])].slice(-HISTORY_LIMIT);

    const roster = rosterFor(this.seed);
    this.stations = {} as Record<StationId, StationState>;
    for (const id of STATION_IDS) {
      for (const w of roster[id]) this.takenNames.add(w.name);
      this.stations[id] = {
        id,
        queue: [],
        workers: roster[id].map((seed) => ({
          seed,
          fatigue: STATIONS[id].automated ? 0 : isNightStation(id) ? NIGHT_START_FATIGUE : DAY_START_FATIGUE,
          freeAt: 0,
          busyMin: 0,
          busyShare: 0,
          items: 0,
          activity: null,
          activityTick: -99,
          temp: false,
        })),
        counters: {},
        processed: 0,
        waitSum: 0,
        waitCount: 0,
        peakQueue: 0,
        errors: 0,
        history: [],
        working: null,
        servedBeat: 0,
        arrivalsBeat: 0,
        utilisation: 0,
        stream: [],
      };
    }
    this.nightPool = nightPoolFor(this.seed);
    this.nightFatigue = this.nightPool.map(() => NIGHT_START_FATIGUE);
    this.seatNightCrew();
    this.chaosConfig = cleanChaos({ ...NO_CHAOS, ...options.chaos });
    if (options.carry) this.restore(options.carry);
    this.beginDay(options.cover);
  }

  // Public controls

  get rules(): BankRules {
    return this.rulesNow;
  }

  get event() {
    return this.traffic.event;
  }

  /** Changes the bank's policy. It applies to customers who arrive from now on; payments already in the building keep the route they were given. */
  setRules(next: Partial<BankRules>): void {
    const rules = clampRules({ ...this.rulesNow, ...next });
    this.rulesNow = rules;
    this.graphs = buildGraphs(rules);
  }

  /** The Chaos Monkey settings in force. */
  get chaos(): ChaosConfig {
    return { ...this.chaosConfig };
  }

  /** Switches Chaos Monkey faults on or off. */
  setChaos(next: Partial<ChaosConfig>): void {
    const before = this.chaosConfig;
    this.chaosConfig = cleanChaos({ ...before, ...next });
    if (this.headless) return;
    const changed = (Object.keys(this.chaosConfig) as Array<keyof ChaosConfig>).filter((k) => k !== 'scriptedDays' && this.chaosConfig[k] !== before[k]);
    for (const k of changed) {
      const on = this.chaosConfig[k];
      const what = { posOutage: 'POS station outage', hsmFailure: '3DS HSM cryptography failure', congestion: 'Network congestion', fatigueSpike: 'Staff fatigue spike' }[k as Exclude<keyof ChaosConfig, 'scriptedDays'>];
      this.log(on ? 'crit' : 'ok', null, on ? `Chaos Monkey: ${what} injected.` : `Chaos Monkey: ${what} cleared.`, { notable: true });
    }
  }

  /** Books a temporary worker on a desk for the rest of the day. Costs money. Returns false when the desk cannot take another. */
  addCover(id: StationId): boolean {
    const st = this.stations[id];
    const covers = st.workers.filter((w) => w.temp).length;
    if (this.dayOver || STATIONS[id].automated || covers >= MAX_COVER_PER_STATION) return false;
    const seed = workerSeed(this.seed, id, st.workers.length + covers, this.takenNames, true);
    st.workers.push({ seed, fatigue: 0, freeAt: 0, busyMin: 0, busyShare: 0, items: 0, activity: null, activityTick: -99, temp: true });
    this.kpis.coverCostCents += COVER_COST_CENTS;
    this.log('info', id, `${seed.name.replace(' (cover)', '')} joins ${STATIONS[id].name} as temporary cover.`, { notable: true });
    return true;
  }

  /** Moves the bank forward by one beat. */
  step(options: { admit?: boolean } = {}): void {
    if (this.dayOver) return;
    const phase = phaseAt(this.minute);
    const bm = beatMinutesAt(this.minute);
    const start = this.minute;

    this.tick++;
    this.beatMoves = [];
    for (const st of Object.values(this.stations)) {
      st.servedBeat = 0;
      st.arrivalsBeat = 0;
      st.working = null;
    }
    this.announce(phase, start);

    if (this.chaosConfig.fatigueSpike) this.spikeFatigue();
    if (phase === 'WORKING') {
      const arriving = [...(this.traffic.beats[workingBeatIndex(start)] ?? []), ...this.chaosArrivals(start)];
      if (options.admit === false) this.heldBack.push(...arriving);
      else {
        // Customers held back during a solo run walk in now, as if they had just arrived.
        const late = this.heldBack.splice(0).map((c) => ({ ...c, minute: start }));
        for (const customer of [...late, ...arriving]) this.admit(customer);
      }
    }
    this.releasePhones(start, bm);
    if (phase === 'EOD' && !this.nightStarted) this.startNight(start);

    for (const id of SERVICE_ORDER) this.serve(this.stations[id], phase, start, bm);

    if (phase === 'WORKING' || phase === 'AFTER_HOURS') this.expireWaiting(start + bm);
    this.endBeat(phase, bm);

    this.minute += bm;
    if (this.minute >= DAY_END) this.closeDay();
  }

  /** Plays on until the clock reaches `minute` (or the day ends). */
  /** Sends one scripted customer into the bank now (a preset action: "Swipe $20", "Deposit $200 cash"). */
  inject(customer: Customer): string | null {
    if (this.dayOver) return null;
    // Their own block of serials (9001 up), so they never share an id with the day's generated customers.
    const id = `d${this.day}-${9001 + this.scripted.size}`;
    const p = this.admit({ ...customer, id, minute: this.minute, payload: { ...customer.payload, txId: `tx_${id}` } });
    this.scripted.set(p.id, p);
    return p.id;
  }

  /** Where a payment sent with inject() is now, or null for an id this bank does not know (another day, or a replay). */
  traceOf(id: string): PacketTrace | null {
    const p = this.scripted.get(id);
    if (!p) return null;
    const record = this.txById.get(p.id) ?? null;
    const stops = p.plan.stops;
    const done = record !== null;
    const at = done ? stops.length : Math.min(p.stopIndex, stops.length - 1);
    const facts: Partial<DerivedFacts> = {};
    for (let i = 0; i < Math.min(at, stops.length); i++) Object.assign(facts, stops[i]!.facts);
    const { outcome, reasonCode, decline, latencyMs, heldCents, threeDs, passes } = p.plan;
    return {
      id: p.id,
      kind: p.kind,
      scenario: p.scenario,
      cardType: p.cardType,
      amountCents: p.amountCents,
      riskScore: p.riskScore,
      bornMinute: p.bornMinute,
      route: stops.map((s) => s.place),
      stops: stops.map((s) => ({ place: s.place, label: s.label, note: s.note })),
      at,
      done,
      plan: { outcome, reasonCode, decline, latencyMs, heldCents, threeDs, passes },
      facts,
      record,
      ledger: this.book.entries.filter((e) => e.txId === p.id || e.txId.startsWith(`${p.id}~`) || e.txId.startsWith(`${p.id}-`)),
    };
  }

  stepUntil(minute: number): void {
    while (!this.dayOver && this.minute < minute) this.step();
  }

  /** Plays the rest of the day and returns its report. */
  runToEndOfDay(): DayReport {
    while (!this.dayOver) this.step();
    return this.finalReport ?? this.buildReport();
  }

  /** Starts the next day with the queues, the suspense account and the tired staff as they were left. */
  nextDay(): void {
    if (!this.dayOver) this.runToEndOfDay();
    this.day++;
    this.scripted.clear();
    this.heldBack = [];
    // The night team first: whoever worked last night keeps some of their tiredness, whoever had the night off comes back rested.
    const worked = new Map<string, number>();
    for (const id of NIGHT_STATIONS) for (const w of this.stations[id].workers) if (!w.temp) worked.set(w.seed.id, w.fatigue);
    this.nightPool.forEach((m, i) => {
      const f = worked.get(m.id);
      this.nightFatigue[i] = f === undefined ? NIGHT_START_FATIGUE : Math.max(NIGHT_START_FATIGUE, f * OVERNIGHT_KEEP);
    });
    this.seatNightCrew();
    for (const st of Object.values(this.stations)) {
      st.workers = st.workers.filter((w) => !w.temp);
      if (isNightStation(st.id)) continue;
      for (const w of st.workers) {
        if (STATIONS[st.id].automated) continue;
        w.fatigue = isNightStation(st.id) ? Math.max(NIGHT_START_FATIGUE, w.fatigue * OVERNIGHT_KEEP) : Math.max(DAY_START_FATIGUE, w.fatigue * OVERNIGHT_KEEP);
      }
    }
    this.beginDay();
  }

  carryState(): CarryState {
    const suspense: SuspenseItem[] = this.stations.SUSPENSE.queue.map((p) => ({
      id: p.id,
      amountCents: p.plan.suspenseCents,
      reason: p.plan.reasonCode ?? 'UNMATCHED',
      day: p.suspenseDay ?? p.bornDay,
      ...(p.kind === 'ATM' ? { source: 'ATM' as const, scenario: p.scenario } : {}),
    }));
    const backlog: CarryRecord[] = [];
    for (const place of ['EOD_BATCH', 'EOD_VISA', 'RECON'] as const) {
      for (const p of this.stations[place].queue) {
        backlog.push({ txId: p.id, cardType: p.cardType, amountCents: p.amountCents, heldCents: p.heldCents ?? p.amountCents, bornDay: p.bornDay, scenario: p.scenario, place });
      }
    }
    return { suspense, backlog };
  }

  /** The report so far: final once the day is over. */
  report(): DayReport {
    return this.finalReport ?? this.buildReport();
  }

  get progress(): number {
    return Math.min(1, beatIndexAt(this.minute) / BEATS_PER_DAY);
  }

  // Starting a day

  private beginDay(cover?: Partial<Record<StationId, number>>): void {
    this.minute = DAY_START;
    this.dayOver = false;
    this.finalReport = null;
    this.traffic = generateDay(this.seed, this.day);
    this.kpis = emptyKpis();
    this.approved = [];
    this.book = emptyBook();
    this.otpWaiting = [];
    this.beatMoves = [];
    this.nightStarted = false;
    this.settled = { count: 0, cents: 0 };
    this.eventAlerts = [];
    this.alertThrottle.clear();
    this.liveAlertIds.clear();
    this.lastPhase = null;
    this.nightDone = null;
    this.labels.clear();
    this.txLog = [];
    this.txById.clear();
    this.chaosScenario = scenarioForDay(this.day, this.chaosConfig.scriptedDays);
    this.chaosStats = emptyChaosStats();
    this.chaosSerial = 0;
    this.botsThisHour = 0;
    this.velocityHour = -1;
    this.disputed.clear();
    this.chaosTags.clear();

    for (const st of Object.values(this.stations)) {
      // Whatever is still queued from yesterday starts the new day at the front of the line.
      for (const p of st.queue) {
        p.queuedAtMinute = DAY_START;
        this.remember(p);
      }
      st.counters = {};
      st.processed = 0;
      st.waitSum = 0;
      st.waitCount = 0;
      st.peakQueue = st.queue.length;
      st.errors = 0;
      st.history = [];
      st.utilisation = 0;
      st.stream = [];
      for (const w of st.workers) {
        w.items = 0;
        w.freeAt = 0;
        w.busyMin = 0;
        w.busyShare = 0;
        w.activity = null;
      }
    }
    if (cover) {
      for (const [id, n] of Object.entries(cover) as Array<[StationId, number]>) {
        for (let i = 0; i < Math.min(n, MAX_COVER_PER_STATION); i++) this.addCover(id);
      }
    }
    const e = this.traffic.event;
    this.log('info', null, `Day ${this.day}: ${e.title}. ${e.blurb}`, { notable: true });
    if (this.chaosScenario === 'FLASH_SURGE') {
      this.log('crit', null, `Day ${this.day} scenario: FLASH SALE. Expect ${SURGE_MULTIPLIER}x the usual customers, a congested network and 504 gateway timeouts. Status inquiries will chase every timed-out payment.`, { notable: true });
    } else if (this.chaosScenario === 'BOTNET') {
      this.log('crit', null, `Day ${this.day} scenario: BOTNET ATTACK. A botnet is testing stolen cards with $1 online payments. Every alert tires the fraud desk; above 70% fatigue they start waving bots through.`, { notable: true });
    }
  }

  private restore(carry: CarryState): void {
    for (const item of carry.suspense) {
      const p = this.suspensePacket(item);
      this.insert(this.stations.SUSPENSE.queue, p);
    }
    const stage: Record<CarryRecord['place'], number> = { EOD_BATCH: 0, EOD_VISA: 1, RECON: 2 };
    for (const rec of carry.backlog) {
      const p = this.settlementPacket(rec.txId, rec.cardType, rec.heldCents, rec.bornDay, rec.scenario ?? '');
      p.stopIndex = stage[rec.place];
      this.insert(this.stations[rec.place].queue, p);
    }
  }

  // Packets

  private insert(queue: Packet[], p: Packet): void {
    let i = queue.length;
    while (i > 0 && queue[i - 1]!.queuedAtMinute > p.queuedAtMinute) i--;
    queue.splice(i, 0, p);
  }

  /** Remembers what a packet was for, so the ledger drawer can title its lines. */
  private remember(p: Packet): void {
    const label = scenarioLabelEn(p.scenario);
    if (label) this.labels.set(p.id.replace(/^tx_/, ''), label);
  }

  /** What a payment is, for a log line: "🛒 Supermarket Groceries ($62.80)", or the amount for a night-cycle record. */
  private what(p: Packet): string {
    return scenarioLabelEn(p.scenario) || formatAud(p.amountCents);
  }

  /** The scenario label for a ledger transaction id such as "d1-0007", "tx_d1-0007", "d1-0007~2" or "d1-7003-RF". */
  labelForTx(txId: string): string {
    return this.labels.get(txId.replace(/^tx_/, '').replace(/~\d+$/, '').replace(/-(CLR|RF)$/, '')) ?? '';
  }

  private settlementPacket(txId: string, cardType: CardType, heldCents: number, bornDay: number, scenario = ''): Packet {
    const glitch = eventForDay(this.seed, bornDay).breaks;
    const { payload, truth } = makeSettlement(this.seed, bornDay, txId, cardType, heldCents, glitch);
    return {
      id: txId,
      kind: 'SETTLEMENT',
      scenario,
      cardType,
      amountCents: heldCents,
      riskScore: 0,
      score: 0,
      isFraud: false,
      plan: planSettlement(payload, this.graphs),
      stopIndex: 0,
      queuedAtMinute: EOD_START,
      waitedMin: 0,
      bornMinute: EOD_START,
      bornDay,
      readyAtMinute: 0,
      truth,
      heldCents,
    };
  }

  private suspensePacket(item: SuspenseItem): Packet {
    const atm = item.source === 'ATM';
    const stop = (place: 'SUSPENSE' | 'OUT_SETTLED', kind: Stop['kind'], label: string): Stop => ({
      place,
      kind,
      nodeId: null,
      label,
      capability: place === 'SUSPENSE' ? 'RECON_DESK' : null,
      durationMs: 0,
      note:
        place === 'SUSPENSE'
          ? atm
            ? 'The dispenser jammed after the customer was debited: parked in suspense until the cash count proves the notes never came out.'
            : `Posted to suspense: ${item.reason}.`
          : atm
            ? 'The cash count agreed the notes never came out, so the customer was refunded.'
            : 'An ops clerk investigated and cleared the item.',
      facts: {},
      weight: place === 'SUSPENSE' ? 1 : 0,
    });
    return {
      id: item.id,
      kind: atm ? 'ATM' : 'SETTLEMENT',
      scenario: item.scenario ?? '',
      cardType: 'DEBIT',
      amountCents: item.amountCents,
      riskScore: 0,
      score: 0,
      isFraud: false,
      plan: {
        stops: [stop('SUSPENSE', 'WORK', 'Suspense account'), stop('OUT_SETTLED', 'OUTCOME', atm ? 'Refunded' : 'Cleared from suspense')],
        outcome: 'ROUTED_TO_SUSPENSE',
        reasonCode: item.reason,
        decline: null,
        latencyMs: 0,
        passes: 1,
        heldCents: 0,
        suspenseCents: item.amountCents,
        threeDs: null,
        bnpl: null,
        recon: null,
        broken: false,
        ledger: [],
      },
      stopIndex: 0,
      queuedAtMinute: DAY_START,
      waitedMin: 0,
      bornMinute: DAY_START,
      bornDay: item.day,
      readyAtMinute: 0,
      suspenseDay: item.day,
    };
  }

  private admit(incoming: Customer): Packet {
    const customer = this.chaosTriage(incoming);
    const plan = planCheckout(customer, this.graphs);
    const { payload } = customer;
    const p: Packet = {
      id: customer.id,
      kind: customer.kind,
      scenario: customer.scenario,
      cardType: payload.cardType,
      amountCents: payload.amount,
      riskScore: payload.riskScore,
      score: payload.bnpl?.underwritingScore ?? 0,
      isFraud: payload.isFraud,
      plan,
      stopIndex: 0,
      queuedAtMinute: customer.minute,
      waitedMin: 0,
      bornMinute: customer.minute,
      bornDay: this.day,
      readyAtMinute: 0,
      ...(customer.ext ? { ext: customer.ext } : {}),
    };
    const k = this.kpis;
    k.arrivals++;
    k.byKind[customer.kind]++;
    if (p.isFraud) k.fraudAttempts++;
    if (customer.kind === 'BNPL') k.bnpl.applications++;
    if (customer.kind === 'VIRTUAL') k.virtual.checkouts++;
    if (customer.kind === 'A2A') k.a2a.transfers++;
    if (customer.kind === 'ATM') k.atm.sessions++;
    this.remember(p);
    if (isExtendedKind(customer.kind)) this.countScreens(plan);

    if (customer.scenario === BOT_SCENARIO_ID) p.bot = true;

    const gate = plan.stops[0]?.place;
    const st = gate && gate in this.stations ? this.stations[gate as StationId] : this.stations.GATE_ECOM;
    st.arrivalsBeat++;
    bump(st, 'arrived');
    if (this.chaosFault(p, st)) return p;
    this.insert(st.queue, p);
    return p;
  }

  // Chaos Monkey

  /** One independent random stream per payment and purpose, so chaos never shifts the draws of the day's own traffic. */
  private chaosDraw(id: string, purpose: string): number {
    return new Rng(hashSeed(this.seed, this.day, id, 'chaos', purpose)).next();
  }

  /** The flash sale's extra customers and the botnet's bots for the beat starting at `start`. */
  private chaosArrivals(start: number): Customer[] {
    const out: Customer[] = [];
    if (this.chaosScenario === 'FLASH_SURGE') {
      const base = this.traffic.beats[workingBeatIndex(start)] ?? [];
      for (const c of base) {
        if (c.kind === 'ATM' || c.kind === 'A2A' || isExtendedKind(c.kind)) continue;
        for (let k = 1; k < SURGE_MULTIPLIER; k++) {
          const id = `d${this.day}-${20001 + this.chaosSerial++}`;
          this.chaosTags.set(id, 'SURGE');
          out.push({ ...c, id, payload: { ...c.payload, txId: `tx_${id}` } });
        }
      }
      this.chaosStats.surgeCustomers += out.length;
    }
    if (this.chaosScenario === 'BOTNET') {
      const hour = Math.floor(start / 60);
      if (this.velocityHour < 0) this.velocityHour = hour;
      if (hour !== this.velocityHour) {
        this.velocityAlert(this.velocityHour);
        this.velocityHour = hour;
      }
      for (let i = 0; i < BOTS_PER_BEAT; i++) {
        const id = `d${this.day}-${40001 + this.chaosSerial++}`;
        this.chaosTags.set(id, 'BOT');
        const minute = start + Math.min(4, Math.floor(this.chaosDraw(id, 'minute') * 5));
        const base = makeCustomer(this.seed, this.day, id, 'ECOM', minute, this.traffic.event);
        const risk = 82 + Math.floor(this.chaosDraw(id, 'risk') * 16);
        out.push({ ...base, scenario: BOT_SCENARIO_ID, otpCompletes: false, payload: { ...base.payload, txId: `tx_${id}`, amount: BOT_AMOUNT_CENTS, isFraud: true, riskScore: risk } });
      }
      this.chaosStats.botAttempts += BOTS_PER_BEAT;
      this.botsThisHour += BOTS_PER_BEAT;
      // Every alert the fraud desk reviews wears its analysts down.
      for (const w of this.stations.SEC_3DS.workers) {
        if (!STATIONS.SEC_3DS.automated) w.fatigue = clamp(w.fatigue + ALERT_FATIGUE_PER_BOT * BOTS_PER_BEAT, 0, 100);
      }
    }
    return out;
  }

  /** The hourly velocity alert of the botnet day. */
  private velocityAlert(hour: number): void {
    if (this.botsThisHour === 0) return;
    this.chaosStats.velocityAlerts++;
    const text = `Velocity alert ${String(hour).padStart(2, '0')}:00-${String(hour + 1).padStart(2, '0')}:00: ${this.botsThisHour} card-testing attempts of $1.00 from rotating devices. Fraud desk fatigue ${Math.round(this.analystFatigue())}%.`;
    this.log('crit', 'SEC_3DS', text, { notable: true });
    this.pushAlert('SEC_3DS', 'crit', text, `velocity:${this.day}:${hour}`);
    this.botsThisHour = 0;
  }

  /** The mean fatigue of the people on the 3DS fraud desk. */
  private analystFatigue(): number {
    const people = this.stations.SEC_3DS.workers;
    return people.length > 0 ? people.reduce((n, w) => n + w.fatigue, 0) / people.length : 0;
  }

  /** A tired fraud desk sometimes clears a bot as if it were a regular: it then takes the frictionless path. */
  private chaosTriage(c: Customer): Customer {
    if (c.scenario !== BOT_SCENARIO_ID) return c;
    if (this.chaosDraw(c.id, 'misapprove') >= misApprovalChance(this.analystFatigue())) return c;
    this.chaosStats.misApprovals++;
    this.chaosTags.set(c.id, 'MISAPPROVED');
    if (!this.headless && this.throttle('misapprove', 15)) {
      this.log('crit', 'SEC_3DS', `A fatigued analyst (fatigue ${Math.round(this.analystFatigue())}%) cleared a $1.00 bot attempt as low risk. The stolen card is now confirmed live.`, { packetId: c.id, notable: true });
    }
    return { ...c, payload: { ...c.payload, riskScore: Math.max(0, this.rulesNow.frictionlessBelow - 5) } };
  }

  /** Applies the faults that stop a payment at the door. */
  private chaosFault(p: Packet, st: StationState): boolean {
    const c = this.chaosConfig;
    const decline = (reason: 'PROCESS_ERROR' | 'TIMEOUT', counter: keyof ChaosStats, message: string, key: string, tag: ChaosTag): true => {
      (this.chaosStats[counter] as number)++;
      this.chaosTags.set(p.id, tag);
      st.errors++;
      bump(st, 'chaos');
      this.finishCheckout(p, reason);
      if (!this.headless && this.throttle(key, 10)) {
        this.log('crit', st.id, message, { packetId: p.id, notable: true });
        this.pushAlert(st.id, 'crit', message, `${key}:${Math.floor(this.minute / 10)}`);
      }
      return true;
    };
    if (c.posOutage && p.kind === 'POS') {
      return decline('PROCESS_ERROR', 'posOutageDeclines', `POS station outage: ${this.what(p)} could not reach the switch (RC 91 Issuer or Switch Inoperative).`, 'chaos-pos', 'POS_OUTAGE');
    }
    if (c.hsmFailure && p.kind !== 'SETTLEMENT' && HSM_CHANNELS.has(p.kind)) {
      return decline('PROCESS_ERROR', 'hsmDeclines', `3DS HSM failure: no cryptogram could be signed for ${this.what(p)} (RC 96 System Malfunction).`, 'chaos-hsm', 'HSM_FAILURE');
    }
    if (congestionOn(c, this.chaosScenario)) {
      this.chaosStats.addedLatencyMs += CONGESTION_LATENCY_MS;
      p.extraLatencyMs = (p.extraLatencyMs ?? 0) + CONGESTION_LATENCY_MS;
      const outcome = congestionOutcome(this.chaosDraw(p.id, 'timeout'), this.chaosDraw(p.id, 'inquiry'));
      if (outcome === 'CLEAR') return false;
      this.chaosStats.timeouts504++;
      if (outcome === 'RECOVERED') {
        this.chaosStats.inquiriesRecovered++;
        if (!this.chaosTags.has(p.id)) this.chaosTags.set(p.id, 'INQUIRY_RECOVERED');
        p.extraLatencyMs += CONGESTION_LATENCY_MS;
        if (!this.headless && this.throttle('chaos-inquiry', 12)) {
          this.log('warn', st.id, `504 Gateway Timeout on ${this.what(p)}. An automatic status inquiry found the request alive, so it carries on.`, { packetId: p.id, notable: true });
        }
        return false;
      }
      return decline('TIMEOUT', 'inquiriesFailed', `504 Gateway Timeout on ${this.what(p)} and the status inquiry got no answer: declined RC 68 (Response Received Too Late) and reversed.`, 'chaos-timeout', 'TIMEOUT_504');
    }
    return false;
  }

  /** Keeps everyone on shift at or above the spike level while the fatigue spike is on. */
  private spikeFatigue(): void {
    for (const st of Object.values(this.stations)) {
      if (STATIONS[st.id].automated) continue;
      for (const w of st.workers) w.fatigue = Math.max(w.fatigue, FATIGUE_SPIKE_LEVEL);
    }
  }

  /** What Chaos Monkey is doing today, for the screen. */
  chaosView(): ChaosView {
    return { scenario: this.chaosScenario, config: { ...this.chaosConfig }, stats: { ...this.chaosStats }, active: chaosActive(this.chaosConfig, this.chaosScenario) };
  }

  // Disputes raised from the ledger

  /** Raises a cardholder dispute on a card purchase from the live ledger. */
  disputeTransaction(txId: string): DisputeResult {
    const fail = (reason: DisputeResult['reason']): DisputeResult => ({ ok: false, amountCents: 0, reason, txId: null });
    if (this.dayOver) return fail('DAY_OVER');
    const base = txId.replace(/-CB$/, '');
    const lines = this.book.entries.filter((e) => e.txId === base);
    if (lines.length === 0) return fail('UNKNOWN');
    if (this.disputed.has(base)) return fail('ALREADY_DISPUTED');
    const amount = lines.filter((e) => e.creditAccount === 'CARD_CLEARING_PAYABLE').reduce((n, e) => n + e.amount, 0);
    if (amount <= 0) return fail('NOT_A_CARD_PURCHASE');
    const id = `${base}-CB`;
    this.disputed.add(base);
    this.postLines(toEntries([chargebackReversal(amount)], id, 0));
    this.kpis.disputesRaised = (this.kpis.disputesRaised ?? 0) + 1;
    this.kpis.disputedCents = (this.kpis.disputedCents ?? 0) + amount;
    if (!this.headless) {
      const label = this.labelForTx(base);
      this.log('warn', 'LEDGER_DEBIT', `Chargeback raised on ${label || base}: ${formatAud(amount)} reversed from the merchant payout pool (2110) back to the customer’s account (2010).`, { packetId: base, notable: true });
    }
    return { ok: true, amountCents: amount, reason: null, txId: id };
  }

  /** True when a payment has already been disputed today. */
  isDisputed(txId: string): boolean {
    return this.disputed.has(txId.replace(/-CB$/, ''));
  }

  private releasePhones(start: number, bm: number): void {
    if (this.otpWaiting.length === 0) return;
    const ready = this.otpWaiting.filter((p) => p.readyAtMinute < start + bm).sort((a, b) => a.readyAtMinute - b.readyAtMinute);
    if (ready.length === 0) return;
    this.otpWaiting = this.otpWaiting.filter((p) => p.readyAtMinute >= start + bm);
    for (const p of ready) {
      const at = Math.max(start, p.readyAtMinute);
      const stop = p.plan.stops[p.stopIndex];
      this.addMove(p, 'CUSTOMER_OTP', stop?.place ?? 'SEC_3DS', clamp((at - start) / bm, 0, 0.9));
      p.queuedAtMinute = at;
      this.insert(this.stations.SEC_3DS.queue, p);
    }
  }

  // The night cycle

  private startNight(start: number): void {
    this.nightStarted = true;
    for (const rec of this.approved) {
      const p = this.settlementPacket(rec.txId, rec.cardType, rec.heldCents, this.day, rec.scenario);
      this.remember(p);
      p.queuedAtMinute = start;
      this.stations.EOD_BATCH.queue.push(p);
    }
    this.nightRecords = this.backlog();
    const carried = this.backlog() - this.approved.length;
    const total = this.approved.reduce((sum, r) => sum + r.heldCents, 0);
    this.log(
      'info',
      'EOD_BATCH',
      `Night cycle begins. ${this.approved.length} approved payments (${formatAud(total)}) go into batch clearing${carried > 0 ? `, on top of ${carried} records still unreconciled from yesterday` : ''}.`,
      { notable: true },
    );
    for (let i = 0; i < Math.min(8, this.approved.length); i++) {
      this.addMoveRaw('SETTLEMENT-' + i, 'OUT_APPROVED', 'EOD_BATCH', 'SETTLEMENT', 'DEBIT', i / 10);
    }
  }

  /** Seats tonight's night crew from the pool, by the rota for the day the bank is on. */
  private seatNightCrew(): void {
    const rota = nightRotaFor(this.day, this.nightPool.length);
    for (const id of NIGHT_STATIONS) {
      this.stations[id].workers = rota.seats[id].map((i) => ({
        seed: seatAt(this.nightPool[i] as WorkerSeed, id),
        fatigue: this.nightFatigue[i] ?? NIGHT_START_FATIGUE,
        freeAt: 0,
        busyMin: 0,
        busyShare: 0,
        items: 0,
        activity: null,
        activityTick: -99,
        temp: false,
      }));
    }
    this.restingTonight = rota.resting;
  }

  private backlog(): number {
    return this.stations.EOD_BATCH.queue.length + this.stations.EOD_VISA.queue.length + this.stations.RECON.queue.length;
  }

  // Serving a desk

  private isStaffed(id: StationId, phase: Phase): boolean {
    if (isNightStation(id)) return phase === 'EOD';
    if (id === 'SUSPENSE') return phase === 'WORKING';
    return true;
  }

  private serve(st: StationState, phase: Phase, beatStart: number, bm: number): void {
    for (const w of st.workers) w.busyMin = 0;
    // A desk the learner has taken over in the Staff Roleplay Workspace: its own staff stand down and the queue waits for them.
    if (!this.isStaffed(st.id, phase) || st.id === this.staffOverride) {
      for (const w of st.workers) w.freeAt = 0;
      return;
    }
    const queue = st.queue;
    let guard = 0;
    while (queue.length > 0 && guard++ < 50_000) {
      const head = queue[0]!;
      const ready = Math.max(0, head.queuedAtMinute - beatStart);
      let best: WorkerState | null = null;
      let bestStart = Infinity;
      for (const w of st.workers) {
        const s = Math.max(w.freeAt, ready);
        // When two people are free at once the one who has done less so far takes it, so the load is shared.
        if (s < bestStart - 1e-9 || (Math.abs(s - bestStart) <= 1e-9 && best !== null && w.items < best.items)) {
          best = w;
          bestStart = s;
        }
      }
      if (!best || bestStart >= bm - 1e-9) break;
      queue.shift();
      this.work(st, best, head, beatStart, bestStart, bm);
    }
    for (const w of st.workers) {
      w.busyShare = clamp(w.busyMin / bm, 0, 1);
      w.freeAt = Math.max(0, w.freeAt - bm);
    }
  }

  private work(st: StationState, w: WorkerState, p: Packet, beatStart: number, startOffset: number, bm: number): void {
    const def = STATIONS[st.id];
    const stop = p.plan.stops[p.stopIndex]!;
    const previous = p.plan.stops[p.stopIndex - 1];
    // The second visit to the 3DS desk (customer back from their phone) only needs the code checked.
    const weight = previous?.kind === 'OTP' ? 0.5 : stop.weight;
    const rate = productivityFor(w.fatigue) * w.seed.pace;
    const cost = (def.minutesPerItem * weight) / rate;
    const done = startOffset + cost;
    w.freeAt = done;
    w.busyMin += Math.max(0, Math.min(done, bm) - startOffset);

    const waited = Math.max(0, beatStart + startOffset - p.queuedAtMinute);
    p.waitedMin += waited;
    st.waitSum += waited;
    st.waitCount++;

    // A worn-out person sometimes fumbles an item and has to do it again.
    if (p.reworkedStop !== p.stopIndex && keyedUnit(this.seed, this.day, p.id, st.id, p.stopIndex, 'slip') < mistakeChance(w.fatigue)) {
      p.reworkedStop = p.stopIndex;
      p.queuedAtMinute = beatStart + done;
      this.insert(st.queue, p);
      st.errors++;
      this.kpis.reworks++;
      this.log('warn', st.id, `${firstName(w)} (fatigue ${Math.round(w.fatigue)}%) fumbled ${p.kind === 'SETTLEMENT' ? 'a record' : this.what(p)} and has to redo it.`, {
        worker: w.seed.name,
        packetId: p.id,
        notable: this.throttle(`rework:${st.id}`, 20),
      });
      return;
    }

    st.processed++;
    w.items++;
    st.servedBeat++;
    st.working = { kind: p.kind, cardType: p.cardType };
    this.record(st, p, stop);

    if (!this.headless) {
      const text = describeWork(st.id, p, stop, previous);
      w.activity = text;
      w.activityTick = this.tick;
      this.log('info', st.id, text, { worker: w.seed.name, packetId: p.id, notable: false });
    }

    p.stopIndex++;
    this.advance(p, beatStart, done, bm);
  }

  /** Books what the desk learned from the item: counters on the desk and the day's numbers. */
  private record(st: StationState, p: Packet, stop: Stop): void {
    const k = this.kpis;
    const f = stop.facts;
    const sample = (key: string, probability: number): boolean => keyedUnit(this.seed, this.day, p.id, key) < probability;

    if (stop.check || stop.screen) {
      this.recordCheckpoint(st, p, stop);
      return;
    }

    switch (st.id) {
      case 'GATE_A2A':
        if (f.a2aValid === false) {
          bump(st, 'rejected');
          st.errors++;
          if (sample('a2a-bad', 0.5)) this.log('warn', st.id, `Rejected the pacs.008 for ${this.what(p)}: ${stop.note}`, { packetId: p.id, notable: true });
        } else {
          bump(st, 'validated');
          bump(st, f.a2aRail === 'RTGS' ? 'rtgs' : 'instant');
        }
        break;

      case 'GATE_ATM':
        if (f.atmPin === 'VERIFIED') {
          bump(st, 'verified');
          bump(st, 'retries', Math.max(0, stop.weight - 1));
        } else {
          bump(st, 'locked');
          st.errors++;
          this.log(p.isFraud ? 'ok' : 'warn', st.id, p.isFraud ? `Locked out a card thief at the sidewalk ATM after three wrong PINs (${this.what(p)}). The machine kept the card.` : `Three wrong PINs at the sidewalk ATM (${this.what(p)}): the session is locked and the card is kept.`, { packetId: p.id, notable: true });
        }
        break;

      case 'ATM_CASH':
        if (f.atmDispense === 'DEPOSITED') {
          bump(st, 'deposited');
          bump(st, 'depositedCents', p.amountCents);
          this.postLines(toEntries([atmDeposit(p.amountCents)], p.id, 0));
        } else if (f.atmDispense === 'DISPENSED') {
          bump(st, 'dispensed');
          bump(st, 'dispensedCents', p.amountCents);
          this.postLines(toEntries([atmDispense(p.amountCents)], p.id, 0));
        } else if (f.atmDispense === 'JAMMED') {
          // The customer has been debited and nothing came out. The debit goes straight into the suspense account.
          bump(st, 'jams');
          bump(st, 'jamCents', p.amountCents);
          st.errors++;
          p.suspenseDay = this.day;
          this.postLines(toEntries([atmJam(p.amountCents)], p.id, 0));
          this.finishCheckout(p, 'ATM_JAM');
          const text = `ATM jam: ${this.what(p)}. The customer was debited but got no cash, so ${formatAud(p.amountCents)} goes straight to the suspense account.`;
          this.log('crit', st.id, text, { packetId: p.id, notable: true });
          this.pushAlert(st.id, 'crit', text, `jam:${p.id}`);
        } else if (f.ledgerDecision === 'INSUFFICIENT_FUNDS') {
          bump(st, 'noFunds');
          st.errors++;
        }
        break;

      case 'SEC_VAULT':
        if (f.tokenStatus) bump(st, 'resolved');
        else {
          bump(st, 'unknown');
          st.errors++;
          k.virtual.unknown++;
        }
        break;

      case 'SEC_DCVV':
        if (f.dcvvStatus === 'VALID') bump(st, 'valid');
        else if (f.dcvvStatus === 'EXPIRED') {
          bump(st, 'expired');
          st.errors++;
          k.virtual.expired++;
          if (sample('dcvv', 0.25)) this.log('warn', st.id, `A dynamic CVV arrived too late: ${stop.note}`, { packetId: p.id, notable: true });
        } else if (f.dcvvStatus === 'MISMATCH') {
          bump(st, 'mismatch');
          st.errors++;
          k.virtual.mismatch++;
        }
        break;

      case 'SEC_3DS': {
        const path = f.threeDsPath;
        if (path === 'FRICTIONLESS') {
          bump(st, 'frictionless');
          k.threeDs.frictionless++;
        } else if (path === 'CHALLENGE') {
          bump(st, 'challenged');
          k.threeDs.challenged++;
          if (sample('challenge', 0.1)) this.log('info', st.id, `Risk ${p.riskScore} on ${this.what(p)}: one-time code sent to the customer.`, { packetId: p.id, notable: true });
        } else if (path === 'CHALLENGE_PASSED') {
          bump(st, 'passed');
          k.threeDs.passed++;
        } else if (path === 'CHALLENGE_FAILED') {
          bump(st, 'abandoned');
          st.errors++;
          k.threeDs.abandoned++;
        } else if (path === 'REJECT') {
          bump(st, 'rejected');
          st.errors++;
          k.threeDs.rejected++;
          if (p.isFraud ? sample('reject', 0.3) : true) {
            this.log(p.isFraud ? 'ok' : 'warn', st.id, p.isFraud ? `Rejected a suspicious payment, ${this.what(p)} (risk ${p.riskScore}).` : `Rejected a payment from a genuine customer, ${this.what(p)} (risk ${p.riskScore}).`, {
              packetId: p.id,
              notable: true,
            });
          }
        }
        break;
      }

      case 'LEDGER_DEBIT':
      case 'LEDGER_CREDIT':
        if (f.ledgerDecision === 'SUFFICIENT') {
          bump(st, 'approved');
          bump(st, 'heldCents', f.authHoldMinor ?? 0);
        } else {
          bump(st, 'declined');
          st.errors++;
        }
        break;

      case 'BNPL':
        if (f.bnplDecision === 'ELIGIBLE') {
          bump(st, 'plans');
          if (sample('plan', 0.12)) this.log('ok', st.id, `Pay-in-4 plan approved for ${this.what(p)}: score ${p.score}, ${formatAud(f.installment1Minor ?? 0)} due today.`, { packetId: p.id, notable: true });
        } else bump(st, 'fallback');
        break;

      case 'EOD_BATCH':
        bump(st, 'batched');
        bump(st, 'batchCents', p.amountCents);
        break;

      case 'EOD_VISA':
        bump(st, 'presented');
        bump(st, 'netCents', p.amountCents);
        break;

      case 'RECON': {
        const r = k.recon;
        r.records++;
        const truth = p.truth;
        const tx = this.txById.get(p.id.startsWith('tx_') ? p.id.slice(3) : p.id);
        if (tx) tx.recon = f.reconStatus === 'MATCHED' ? 'YES' : 'SUSPENDED';
        if (f.reconStatus === 'MATCHED') {
          r.matched++;
          bump(st, 'matched');
          if (truth?.trueKind === 'AMOUNT') {
            // A real error, hidden because the gap was inside the tolerance.
            r.leakageCents += truth.trueVarianceCents;
            r.leakedCount++;
            bump(st, 'leaked');
            this.log('warn', st.id, `A real ${formatAud(truth.trueVarianceCents)} difference on ${p.id.slice(-6)} was inside the tolerance and matched away.`, { packetId: p.id, notable: sample('leak', 0.5) });
          }
        } else {
          if (f.reconStatus === 'BREAK_AMOUNT') r.breakAmount++;
          else if (f.reconStatus === 'BREAK_MISSING_LEG') r.breakMissing++;
          else if (f.reconStatus === 'BREAK_DUPLICATE') r.breakDuplicate++;
          bump(st, 'breaks');
          st.errors++;
          r.suspenseAddedCents += p.plan.suspenseCents;
          p.suspenseDay = this.day;
          if (truth?.trueKind === 'NOISE') {
            r.falseBreaks++;
            bump(st, 'falseBreaks');
          }
          if (p.plan.suspenseCents >= 20_000 || sample('break', 0.12)) {
            this.log('warn', st.id, `Break on ${p.id.slice(-6)}: ${stop.note} ${formatAud(p.plan.suspenseCents)} goes to suspense.`, { packetId: p.id, notable: true });
          }
        }
        break;
      }

      case 'SUSPENSE': {
        if (p.kind === 'ATM') {
          // The cash count shows the notes never came out: the parked money goes back to the customer.
          this.postLines(toEntries([atmRefund(p.plan.suspenseCents)], `${p.id}-RF`, 0));
          bump(st, 'cleared');
          bump(st, 'clearedCents', p.plan.suspenseCents);
          bump(st, 'refunded', p.plan.suspenseCents);
          k.suspenseClearedCents += p.plan.suspenseCents;
          k.suspenseClearedItems++;
          k.atm.refundedCents += p.plan.suspenseCents;
          const jammed = this.txById.get(p.id);
          if (jammed) jammed.recon = 'YES';
          this.log('ok', st.id, `Refunded ${formatAud(p.plan.suspenseCents)} to the customer: the ATM cash count proved the notes never came out (${this.what(p)}).`, { packetId: p.id, notable: true });
          break;
        }
        // The clerk pays the parked money out to the scheme: what went into the suspense account comes out again.
        const parked = p.plan.ledger.filter((e) => e.kind === 'SUSPENSE_BREAK' && e.creditAccount === 'RECON_SUSPENSE').reduce((n, e) => n + e.amount, 0);
        const amount = p.plan.ledger.length > 0 ? parked : p.plan.suspenseCents;
        this.postLines(toEntries([clearSuspense(amount)], `${p.id}-CLR`, 0));
        bump(st, 'cleared');
        bump(st, 'clearedCents', p.plan.suspenseCents);
        k.suspenseClearedCents += p.plan.suspenseCents;
        k.suspenseClearedItems++;
        if (sample('clear', 0.2)) this.log('ok', st.id, `Cleared ${formatAud(p.plan.suspenseCents)} from suspense (${p.plan.reasonCode ?? 'unmatched'}).`, { packetId: p.id, notable: true });
        break;
      }

      default:
        break;
    }
  }

  /** Phase 8: what a checkpoint decided, on the desk's counters, with a log line for the moments that matter. */
  private recordCheckpoint(st: StationState, p: Packet, stop: Stop): void {
    const c = stop.check;
    const screen = stop.screen;
    if (screen) {
      bump(st, 'screened');
      if (screen.verdict === 'STR_PENDING') bump(st, 'strFlags');
      if (screen.verdict === 'SANCTION_MATCH') bump(st, 'sanctionHits');
      if (screen.ctr) bump(st, 'ctr');
    }
    if (!c) return;
    switch (c.at) {
      case 'EKYC':
        bump(st, 'scans');
        bump(st, 'ocrSum', c.ocrMatchPct);
        if (c.verdict !== 'LIVENESS_FAILED') bump(st, 'livePass');
        if (c.verdict === 'VERIFIED') bump(st, 'verified');
        else {
          bump(st, 'rejected');
          bump(st, c.verdict === 'FAKE_ID' ? 'fakeId' : c.verdict === 'LIVENESS_FAILED' ? 'liveness' : c.verdict === 'FACE_MISMATCH' ? 'faceMismatch' : 'citizenDb');
          st.errors++;
          if (p.isFraud || keyedUnit(this.seed, this.day, p.id, 'ekyc') < 0.3) this.log(p.isFraud ? 'ok' : 'warn', st.id, `EKYC_LIVENESS_FAILED on ${this.what(p)}: no account opened.`, { packetId: p.id, notable: true });
        }
        break;
      case 'QR':
        if (c.verdict === 'PARSED') {
          bump(st, 'parsed');
          bump(st, c.mode === 'DYNAMIC' ? 'dynamic' : 'static');
        } else {
          bump(st, 'invalid');
          st.errors++;
        }
        break;
      case 'SWIFT':
        if (c.verdict === 'VALID') {
          bump(st, 'valid');
          bump(st, 'sentCents', p.amountCents);
        } else {
          bump(st, 'invalid');
          st.errors++;
        }
        break;
      case 'FACEPAY':
        bump(st, 'checks');
        if (c.verdict === 'MATCHED') bump(st, 'matched');
        else {
          bump(st, c.verdict === 'NOT_ENROLLED' ? 'notEnrolled' : 'failed');
          st.errors++;
          if (p.isFraud) this.log('ok', st.id, `BIOMETRIC_AUTH_REQUIRED stopped ${this.what(p)}: the face did not match the account holder.`, { packetId: p.id, notable: true });
        }
        break;
      case 'FDS':
        bump(st, 'scored');
        for (const sig of c.signals) bump(st, `sig${sig}`);
        if (c.verdict === 'HIGH_RISK') {
          bump(st, 'blocked');
          st.errors++;
          if (p.isFraud ? keyedUnit(this.seed, this.day, p.id, 'fds') < 0.5 : true) this.log(p.isFraud ? 'ok' : 'warn', st.id, `FDS_HIGH_RISK_DEVICE on ${this.what(p)}: device score ${c.score}.`, { packetId: p.id, notable: true });
        }
        break;
      case 'TELLER':
        bump(st, c.direction === 'IN' ? 'deposits' : 'withdrawals');
        if (c.verdict === 'COUNTED') bump(st, c.direction === 'IN' ? 'vaultIn' : 'vaultOut', p.amountCents);
        else if (c.verdict === 'SUSPECT_NOTES') {
          bump(st, 'suspectSerials', c.suspectSerials);
          st.errors++;
          this.log('warn', st.id, `${c.suspectSerials} suspect notes in ${this.what(p)}: serials recorded, deposit refused.`, { packetId: p.id, notable: true });
        } else {
          bump(st, 'vaultLimit');
          st.errors++;
        }
        break;
      case 'AML_REVIEW':
        bump(st, 'reviewed');
        // From the moment the payment was flagged into this queue to the analyst's decision.
        bump(st, 'reviewMin', Math.max(0, this.minute - p.queuedAtMinute) + STATIONS.AML_DESK.minutesPerItem * stop.weight);
        if (c.verdict === 'RELEASED') bump(st, 'released');
        else if (c.verdict === 'STR_FILED_RELEASED') {
          bump(st, 'released');
          bump(st, 'strFiled');
        } else if (c.verdict === 'BLOCKED_STR') {
          bump(st, 'strFiled');
          bump(st, 'blocked');
          this.log('ok', st.id, `STR filed and ${this.what(p)} blocked after analyst review.`, { packetId: p.id, notable: true });
        } else {
          bump(st, 'sanctions');
          bump(st, 'blocked');
          const text = `AML_SANCTION_MATCH confirmed on ${this.what(p)}: funds frozen and the regulator notified.`;
          this.log('crit', st.id, text, { packetId: p.id, notable: true });
          this.pushAlert(st.id, 'crit', text, `sanction:${p.id}`);
        }
        break;
      case 'DISPUTE':
        bump(st, 'claims');
        bump(st, c.type === 'CHARGEBACK' ? 'chargebacks' : c.type === 'PACS004_RETURN' ? 'returns' : 'atmClaims');
        if (c.verdict === 'REFUND') {
          bump(st, 'refunds');
          bump(st, 'refundCents', p.amountCents);
        } else bump(st, c.verdict === 'REJECTED_SLA' ? 'lateClaims' : 'rejected');
        break;
      case 'POSTING':
        if (c.verdict === 'NO_FUNDS') {
          bump(st, 'declined');
          st.errors++;
        } else bump(st, 'posted');
        break;
      case 'AML_SCREEN':
        break;
    }
  }

  /** The packet has finished at a desk and now goes to its next stop. */
  private advance(p: Packet, beatStart: number, doneOffset: number, bm: number): void {
    const stops = p.plan.stops;
    const previous = stops[p.stopIndex - 1]!;
    const next = stops[p.stopIndex];
    const when = beatStart + doneOffset;
    if (!next) {
      this.finish(p);
      return;
    }
    this.addMove(p, previous.place, next.place, clamp(doneOffset / bm, 0, 0.9));

    switch (next.kind) {
      case 'OUTCOME':
        this.finish(p);
        return;
      case 'OTP': {
        const walksAway = p.plan.stops[p.stopIndex + 1]?.facts.threeDsPath === 'CHALLENGE_FAILED';
        const u = keyedUnit(this.seed, this.day, p.id, 'otp');
        p.readyAtMinute = when + (walksAway ? 8 + 4 * u : 1 + 3 * u);
        this.otpWaiting.push(p);
        return;
      }
      default: {
        p.queuedAtMinute = when;
        this.insert(this.stations[next.place as StationId].queue, p);
      }
    }
  }

  // How a payment ends

  /** Writes lines into today's ledger, stamped with the bank's clock rather than the run's virtual time. */
  private postLines(lines: readonly GLEntry[]): void {
    if (lines.length === 0) return;
    const timestamp = this.day * 86_400_000 + Math.round(this.minute) * 60_000;
    post(this.book, lines.map((e) => ({ ...e, timestamp })));
  }

  /** A route plan is worked out once per kind of payment, so its lines carry the id of the example payment it was run with. */
  private bookedAs(p: Packet): GLEntry[] {
    const seen = new Map<string, string>();
    const counts = new Map<string, number>();
    return p.plan.ledger.map((e) => {
      let tx = seen.get(e.txId);
      if (tx === undefined) {
        tx = seen.size === 0 ? p.id : `${p.id}~${seen.size + 1}`;
        seen.set(e.txId, tx);
      }
      const n = (counts.get(tx) ?? 0) + 1;
      counts.set(tx, n);
      return { ...e, txId: tx, id: `GL-${tx}-${String(n).padStart(2, '0')}` };
    });
  }

  private finish(p: Packet): void {
    this.postLines(this.bookedAs(p));
    // A jammed withdrawal was counted when the dispenser failed; reaching the end of its route means the refund went out.
    if (p.kind === 'SETTLEMENT' || (p.kind === 'ATM' && p.plan.outcome === 'ROUTED_TO_SUSPENSE')) {
      this.settled.count++;
      this.settled.cents += p.plan.suspenseCents > 0 ? p.plan.suspenseCents : p.amountCents;
      return;
    }
    this.finishCheckout(p, p.plan.outcome === 'APPROVED' ? null : (p.plan.decline ?? 'PROCESS_ERROR'));
  }

  /** Records a finished customer payment for the Master Transactions export. Called once per payment, from finishCheckout. */
  private recordTx(p: Packet, decline: DeclineReason | null, feeCents: number): void {
    const serial = Number(/-(\d+)$/.exec(p.id)?.[1] ?? this.txLog.length + 1);
    const card = p.kind !== 'A2A' && p.kind !== 'ATM' && !isExtendedKind(p.kind);
    const rec: TxRecord = {
      id: p.id,
      txId: `TX-${p.bornDay}${String(serial).padStart(4, '0')}`,
      // The simulation counts arrivals to the minute; the seconds are drawn from the seed so the log reads like a real one.
      minute: Math.floor(p.bornMinute) + Math.min(0.999, keyedUnit(this.seed, p.bornDay, p.id, 'second')),
      kind: p.kind,
      cardType: p.cardType,
      scenario: p.scenario,
      amountCents: p.amountCents,
      feeCents,
      status: decline === null ? 'APPROVED' : decline === 'ATM_JAM' ? 'JAMMED' : 'DECLINED',
      decline,
      isFraud: p.isFraud,
      // A card payment waits for tonight's reconciliation; a jammed withdrawal's money is parked in suspense.
      recon: decline === 'ATM_JAM' ? 'SUSPENDED' : decline === null && card ? 'NO' : 'N/A',
      ...(p.plan.reasonCode === 'CASH_DEPOSITED' ? { deposit: true as const } : {}),
      ...(this.chaosTags.has(p.id) ? { chaos: this.chaosTags.get(p.id) as ChaosTag } : {}),
      responseCode: this.responseCodeOf(p, decline),
    };
    this.txLog.push(rec);
    this.txById.set(p.id, rec);
  }

  /** The ISO response code a finished payment got. A POS outage answers 91 rather than the generic 96. */
  private responseCodeOf(p: Packet, decline: DeclineReason | null): string {
    if (decline === null) return p.kind === 'A2A' || p.kind === 'SWIFT' ? 'ACSC' : '00';
    if (this.chaosTags.get(p.id) === 'POS_OUTAGE') return '91';
    return declineResponseCode(decline)[0];
  }

  /** Every customer payment that finished today, oldest first. Read only when the learner exports it. */
  transactionLog(): readonly TxRecord[] {
    return this.txLog;
  }

  private finishCheckout(p: Packet, decline: DeclineReason | null): void {
    if (p.bot) {
      if (decline === null) this.chaosStats.botApproved++;
      else this.chaosStats.botBlocked++;
    }
    const k = this.kpis;
    const plan = p.plan;
    const amount = p.amountCents;
    let fee = 0;
    this.finishCheckoutInner(p, decline, k, plan, amount, (cents) => {
      fee = cents;
    });
    this.recordTx(p, decline, fee);
  }

  private finishCheckoutInner(p: Packet, decline: DeclineReason | null, k: DayKpis, plan: RoutePlan, amount: number, earned: (cents: number) => void): void {
    k.finished++;
    k.latencySumMs += plan.latencyMs + (p.extraLatencyMs ?? 0);
    k.waitSumMin += p.waitedMin;

    if (decline === null) {
      k.approved++;
      k.approvedCents += amount;
      if (p.kind === 'BNPL') {
        if (plan.bnpl === 'ELIGIBLE') k.bnpl.plans++;
        else k.bnpl.fallbackApproved++;
      }
      if (p.kind === 'A2A') k.a2a.released++;
      if (p.kind === 'ATM' && plan.reasonCode !== 'CASH_DEPOSITED') {
        k.atm.dispensed++;
        k.atm.dispensedCents += amount;
      }
      if (isExtendedKind(p.kind)) this.countExtendedFinish(p, null);
      if (p.isFraud) {
        k.fraudSlipped++;
        k.fraudLossCents += amount;
        const place = this.lastWorkPlace(p);
        if (p.kind === 'ONBOARD') {
          // An account opens no money, but a mule account will be used to move stolen funds: book the expected loss.
          k.fraudLossCents += MULE_ACCOUNT_LOSS_CENTS;
          const text = `Fraud approved: ${this.what(p)} passed eKYC and AML screening. A mule account is now open.`;
          this.log('crit', place, text, { packetId: p.id, notable: true });
          this.pushAlert(place, 'crit', text, `fraud:${p.id}`);
          return;
        }
        const how = p.kind === 'QR' ? 'through a VietQR payment' : p.kind === 'SWIFT' ? 'as a SWIFT remittance abroad' : p.kind === 'TELLER' ? 'over the teller counter' : p.kind === 'DISPUTE' ? 'as a refund on a false claim' : p.kind === 'POS' ? 'at a shop terminal' : p.kind === 'ATM' ? 'at the sidewalk ATM with a PIN the thief had watched' : p.kind === 'A2A' ? 'as an instant transfer to a new payee' : plan.threeDs === 'FRICTIONLESS' ? `through the frictionless path (risk ${p.riskScore})` : plan.threeDs === 'CHALLENGE_PASSED' ? 'after the fraudster passed the OTP challenge' : p.kind === 'VIRTUAL' ? 'with a replayed dynamic CVV' : p.kind === 'BNPL' ? 'on a synthetic identity' : '';
        const text = `Fraud approved: ${this.what(p)} ${how}. The bank will have to repay it.`.replace(/ \./, '.');
        this.log('crit', place, text, { packetId: p.id, notable: true });
        this.pushAlert(place, 'crit', text, `fraud:${p.id}`);
      } else if (p.kind === 'BNPL' && plan.bnpl === 'ELIGIBLE') {
        const financed = Math.max(0, amount - plan.heldCents);
        k.bnpl.basketCents += amount;
        earned(Math.round(amount * BNPL_FEE_RATE));
        k.bnpl.financedCents += financed;
        k.bnpl.expectedLossCents += Math.round(financed * bnplDefaultRate(p.score));
      } else if (p.kind === 'A2A') {
        k.a2a.feeCents += A2A_FEE_CENTS;
        earned(A2A_FEE_CENTS);
      } else if (p.kind === 'ATM' || isExtendedKind(p.kind)) {
        // Cash from the bank's own machine earns nothing: it is a service to the customer. The Phase 8 channels carry no fee here.
      } else {
        k.genuineCardCents += amount;
        earned(Math.round(amount * INTERCHANGE_RATE));
      }
      // Card payments go into tonight's clearing file.
      if (p.kind !== 'A2A' && p.kind !== 'ATM' && !isExtendedKind(p.kind)) this.approved.push({ txId: `tx_${p.id}`, cardType: p.cardType, heldCents: plan.heldCents, scenario: p.scenario });
      return;
    }

    k.declined++;
    k.declinedCents += amount;
    k.declines[decline]++;
    if (isExtendedKind(p.kind)) this.countExtendedFinish(p, decline);
    if (decline === 'A2A_INVALID') k.a2a.invalid++;
    if (decline === 'PIN_LOCKED') k.atm.pinLocked++;
    if (decline === 'ATM_JAM') {
      k.atm.jams++;
      k.atm.jamCents += amount;
    }
    if (p.kind === 'BNPL' && decline !== 'TIMEOUT') {
      if (plan.bnpl === 'ELIGIBLE') k.bnpl.downPaymentDeclined++;
      else k.bnpl.cardDeclined++;
    }
    if (p.isFraud) {
      k.fraudBlocked++;
      if (amount >= 30_000 || keyedUnit(this.seed, this.day, p.id, 'blocked') < 0.1) {
        this.log('ok', this.lastWorkPlace(p), `Stopped a fraudulent payment, ${this.what(p)} (${decline.replace(/_/g, ' ').toLowerCase()}).`, { packetId: p.id, notable: true });
      }
    } else if (FRICTION.has(decline)) {
      k.frictionLostCount++;
      k.frictionLostCents += amount;
    }
  }

  /** Phase 8: the automated screen's findings, counted once when the customer arrives (CTRs and STR holds). */
  private countScreens(plan: RoutePlan): void {
    const x = this.kpis.ext;
    for (const s of plan.stops) {
      if (!s.screen) continue;
      if (s.screen.ctr) x.ctrFiled++;
      if (s.screen.verdict === 'STR_PENDING') x.strHeld++;
    }
  }

  /** Phase 8: the channel's own numbers, once a customer is finished. */
  private countExtendedFinish(p: Packet, decline: DeclineReason | null): void {
    const x = this.kpis.ext;
    const checks = p.plan.stops.map((s) => s.check).filter((c): c is NonNullable<typeof c> => c !== undefined);
    for (const c of checks) {
      if (c.at === 'FACEPAY') {
        x.biometricChecks++;
        if (c.verdict !== 'MATCHED') x.biometricFailed++;
      }
      if (c.at === 'AML_REVIEW' && (c.verdict === 'STR_FILED_RELEASED' || c.verdict === 'BLOCKED_STR')) x.strFiled++;
    }
    if (decline === 'EKYC_LIVENESS_FAILED') x.ekycRejected++;
    if (decline === 'FDS_HIGH_RISK_DEVICE') x.fdsBlocked++;
    if (decline === 'AML_SANCTION_MATCH') x.sanctionsBlocked++;
    if (p.kind === 'DISPUTE' && decline !== null && decline !== 'TIMEOUT') x.disputesRejected++;
    if (decline !== null) return;
    switch (p.kind) {
      case 'ONBOARD':
        x.accountsOpened++;
        break;
      case 'QR':
        x.qrPaid++;
        break;
      case 'SWIFT':
        x.swiftSent++;
        x.swiftCents += p.amountCents;
        break;
      case 'TELLER':
        if (p.plan.reasonCode === 'TELLER_DEPOSIT') x.tellerDeposits++;
        else x.tellerWithdrawals++;
        break;
      case 'DISPUTE':
        x.disputesRefunded++;
        x.refundedCents += p.amountCents;
        break;
      default:
        break;
    }
  }

  private lastWorkPlace(p: Packet): PlaceId {
    for (let i = Math.min(p.stopIndex, p.plan.stops.length) - 1; i >= 0; i--) {
      const stop = p.plan.stops[i]!;
      if (stop.kind === 'WORK' || stop.kind === 'GATE') return stop.place;
    }
    return 'GATE_ECOM';
  }

  /** Customers who have waited longer than they will give up and leave. */
  private expireWaiting(now: number): void {
    for (const id of STATION_IDS) {
      if (!isCustomerStation(id)) continue;
      const st = this.stations[id];
      for (let i = st.queue.length - 1; i >= 0; i--) {
        const p = st.queue[i]!;
        if (p.kind === 'SETTLEMENT') continue;
        const total = p.waitedMin + Math.max(0, now - p.queuedAtMinute);
        if (total <= PATIENCE[p.kind]) continue;
        st.queue.splice(i, 1);
        p.waitedMin = total;
        st.errors++;
        bump(st, 'timedOut');
        this.finishCheckout(p, 'TIMEOUT');
        if (this.throttle(`timeout:${id}`, 10)) {
          const text = `${p.kind === 'POS' ? 'A shopper' : 'A customer'} gave up after ${Math.round(total)} minutes in the queue at ${STATIONS[id].name}: ${this.what(p)} lost.`;
          this.log('crit', id, text, { packetId: p.id, notable: true });
          this.pushAlert(id, 'warn', text, `timeout:${id}:${Math.floor(now / 10)}`);
        }
      }
    }
  }

  // End of a beat

  private endBeat(phase: Phase, bm: number): void {
    for (const st of Object.values(this.stations)) {
      const night = isNightStation(st.id);
      const present = night ? phase === 'EOD' : phase === 'PRE_OPEN' || phase === 'WORKING';
      let busy = 0;
      for (const w of st.workers) busy += w.busyShare;
      // A quiet desk (load under STAMINA_RECOVERY.belowLoad) lets the people on shift recover their stamina.
      const recovery = staminaRecovery(bm, st.workers.length > 0 ? busy / st.workers.length : 0);
      for (const w of st.workers) {
        if (STATIONS[st.id].automated) continue;
        // By night the drop follows the load (see nightFatigueFactor): the busier the person, the faster they tire.
        const factor = night ? nightFatigueFactor(w.busyShare) : 1;
        if (present) w.fatigue = clamp(w.fatigue + fatigueChange(bm, w.busyShare) * factor - recovery, 0, 100);
        else if (w.busyMin > 0) w.fatigue = clamp(w.fatigue + 0.13 * w.busyMin * factor, 0, 100);
      }
      st.utilisation = st.workers.length > 0 ? busy / st.workers.length : 0;
      st.peakQueue = Math.max(st.peakQueue, st.queue.length);
      st.history.push(st.queue.length);
      if (st.history.length > QUEUE_SPARK_LENGTH) st.history.shift();
    }
    if (phase === 'EOD' && this.nightDone === null && this.nightStarted && this.backlog() === 0) this.nightDone = this.minute + bm;
    if (!this.headless) this.announceAlerts();
  }

  private announce(phase: Phase, start: number): void {
    if (this.headless || phase === this.lastPhase) return;
    this.lastPhase = phase;
    if (phase === 'WORKING') this.log('info', null, `${formatClock(start)} The doors open. Customers are arriving.`, { notable: true });
    else if (phase === 'AFTER_HOURS') {
      const waiting = this.inFlight();
      this.log('info', null, `${formatClock(start)} No new customers. ${waiting > 0 ? `${waiting} payments are still being worked.` : 'Every queue is clear.'}`, { notable: true });
    }
  }

  private closeDay(): void {
    if (this.chaosScenario === 'BOTNET' && this.velocityHour >= 0) this.velocityAlert(this.velocityHour);
    this.minute = DAY_END;
    this.dayOver = true;
    const report = this.buildReport();
    this.finalReport = report;
    this.history.push(report);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    if (!this.headless) {
      const left = report.close.reconBacklog;
      this.log(
        left > 0 ? 'warn' : 'ok',
        'RECON',
        left > 0
          ? `Midnight. ${left} records were not reconciled and roll into tomorrow night. Suspense account: ${formatAud(report.close.suspenseCents)}.`
          : `Midnight. Every record was reconciled. Suspense account: ${formatAud(report.close.suspenseCents)}.`,
        { notable: true },
      );
    }
  }

  private buildReport(): DayReport {
    const susp = this.suspenseTotals();
    const workers = Object.values(this.stations).flatMap((st) => st.workers);
    const fatigue = workers.map((w) => w.fatigue);
    return {
      day: this.day,
      event: this.traffic.event,
      rules: { ...this.rulesNow },
      kpis: structuredClone(this.kpis),
      close: {
        suspenseCents: susp.cents,
        suspenseItems: susp.items,
        reconBacklog: this.backlog(),
        nightDoneMinute: this.nightDone,
        avgFatigue: fatigue.length > 0 ? fatigue.reduce((a, b) => a + b, 0) / fatigue.length : 0,
        maxFatigue: fatigue.length > 0 ? Math.max(...fatigue) : 0,
      },
      nightShift: this.nightShiftReport(),
      book: closeBook(openingBook(this.history.filter((r) => r.day < this.day).at(-1), (r) => pnl(r.kpis).netCents), this.kpis, pnl(this.kpis).netCents),
    };
  }

  /** Who worked tonight's shift, how tired they finished, and how much of the night's work got done. */
  private nightShiftReport(): NightShiftReport {
    const crew: NightShiftMember[] = NIGHT_STATIONS.flatMap((id) =>
      this.stations[id].workers.map((w) => ({
        id: w.seed.id,
        name: w.seed.name,
        station: id,
        role: w.seed.role,
        temp: w.temp,
        fatigue: Math.round(w.fatigue),
        productivity: Math.round(productivityFor(w.fatigue) * 100) / 100,
        items: w.items,
      })),
    );
    const left = this.backlog();
    const records = Math.max(this.nightRecords, left);
    return {
      crew,
      resting: this.restingTonight.map((i) => this.nightPool[i]?.name ?? '').filter(Boolean),
      records,
      left,
      completion: records === 0 ? 1 : Math.round(((records - left) / records) * 1000) / 1000,
      finishedAt: this.nightDone,
    };
  }

  // Feed and alerts

  private log(severity: Severity, place: PlaceId | null, text: string, opts: { worker?: string; packetId?: string; notable?: boolean } = {}): void {
    if (this.headless) return;
    const entry: FeedEntry = {
      id: ++this.feedSerial,
      day: this.day,
      minute: this.minute,
      place,
      severity,
      text,
      worker: opts.worker ?? null,
      packetId: opts.packetId ?? null,
      notable: opts.notable === true,
    };
    if (entry.notable) {
      this.feed.push(entry);
      if (this.feed.length > FEED_LIMIT) this.feed.shift();
    }
    if (place && place in this.stations) {
      const stream = this.stations[place as StationId].stream;
      stream.push(entry);
      if (stream.length > STREAM_LIMIT) stream.shift();
    }
  }

  /** True at most once in `minutes` of bank time per key, so a burst of the same problem is reported once. */
  private throttle(key: string, minutes: number): boolean {
    const last = this.alertThrottle.get(key);
    if (last !== undefined && this.minute - last < minutes) return false;
    this.alertThrottle.set(key, this.minute);
    return true;
  }

  private pushAlert(station: PlaceId | null, severity: Severity, text: string, id?: string): void {
    if (this.headless) return;
    this.eventAlerts.push({
      id: id ?? `a${++this.alertSerial}`,
      station: station && station in this.stations ? (station as StationId) : null,
      severity,
      text,
      day: this.day,
      minute: this.minute,
      live: false,
    });
    if (this.eventAlerts.length > ALERT_LIMIT) this.eventAlerts.shift();
  }

  /** Alerts that describe how a desk is right now. They come and go as the desk's state does. */
  private stateAlerts(): AlertView[] {
    const out: AlertView[] = [];
    const now = this.minute;
    const phase = phaseAt(Math.min(now, DAY_END - 1));
    const add = (station: StationId, severity: Severity, id: string, text: string): void => {
      out.push({ id, station, severity, text, day: this.day, minute: now, live: true });
    };

    for (const id of STATION_IDS) {
      const st = this.stations[id];
      const q = st.queue.length;

      if (isCustomerStation(id) && q > 0) {
        const head = st.queue[0]!;
        const oldest = head.waitedMin + Math.max(0, now - head.queuedAtMinute);
        const cap = this.capacity(st);
        if (oldest >= 15 || (oldest >= 8 && q >= cap * 2)) {
          // An automated node's queue is a server bottleneck, not a line of people: it is labelled as such.
          const text = isAutomatedNode(id)
            ? `Server Overload / Saturated Capacity: ${q} requests queued, the oldest for ${Math.round(oldest)} min${oldest >= 15 ? '. Requests are about to time out.' : '. The thread pool cannot keep up.'}`
            : `${q} waiting, the oldest for ${Math.round(oldest)} min${oldest >= 15 ? '. Customers are about to give up.' : '. A queue is building.'}`;
          add(id, oldest >= 15 ? 'crit' : 'warn', `queue:${id}`, text);
        }
      }

      if (id === 'RECON' && phase === 'EOD') {
        const left = this.backlog();
        const rate = st.workers.reduce((sum, w) => sum + productivityFor(w.fatigue) * w.seed.pace, 0) / STATIONS.RECON.minutesPerItem;
        const minutesLeft = DAY_END - now;
        const canDo = rate * minutesLeft;
        if (left > canDo * 1.02 && left > 20) {
          add(id, left > canDo * 1.4 ? 'crit' : 'warn', 'night:behind', `${left} records left and ${minutesLeft} minutes to go. At this pace about ${Math.round(left - canDo)} will not be reconciled by midnight.`);
        }
      }

      if (id === 'SUSPENSE') {
        const s = this.suspenseTotals();
        if (s.items >= 25 || s.oldestDays >= 3) {
          add(id, s.items >= 60 || s.oldestDays >= 5 ? 'crit' : 'warn', 'suspense:pile', `${s.items} items worth ${formatAud(s.cents)} in suspense, the oldest ${s.oldestDays} day${s.oldestDays === 1 ? '' : 's'} old.`);
        }
      }

      for (const w of st.workers) {
        if (w.fatigue >= 65) {
          add(id, w.fatigue >= 85 ? 'crit' : 'warn', `fatigue:${w.seed.id}`, `${w.seed.name} is ${w.fatigue >= 85 ? 'exhausted' : 'wearing out'} (fatigue ${Math.round(w.fatigue)}%), working at ${Math.round(productivityFor(w.fatigue) * 100)}% of normal pace.`);
        }
      }
    }
    return out;
  }

  /** Writes a line to the feed the moment a state alert first appears. */
  private announceAlerts(): void {
    const live = this.stateAlerts();
    const ids = new Set(live.map((a) => a.id));
    for (const a of live) {
      if (!this.liveAlertIds.has(a.id) && a.severity !== 'info') this.log(a.severity, a.station, a.text, { notable: true });
    }
    this.liveAlertIds = ids;
  }

  // Moves (what the screen animates)

  private addMove(p: Packet, from: PlaceId, to: PlaceId, at: number): void {
    if (this.headless || from === to) return;
    this.addMoveRaw(p.id, from, to, p.kind, p.cardType, at, scenarioLabelEn(p.scenario), p.amountCents);
  }

  private addMoveRaw(packetId: string, from: PlaceId, to: PlaceId, kind: PacketKind, cardType: CardType, at: number, scenario = '', amountCents = 0): void {
    if (this.headless) return;
    this.beatMoves.push({ key: `${this.tick}:${this.moveSerial++}`, packetId, edge: edgeId(from, to), from, to, kind, cardType, scenario, amountCents, at });
  }

  // Reading the bank

  private inFlight(): number {
    let n = this.otpWaiting.length;
    for (const st of Object.values(this.stations)) n += st.queue.length;
    return n;
  }

  private capacity(st: StationState): number {
    const per5 = 5 / STATIONS[st.id].minutesPerItem;
    return st.workers.reduce((sum, w) => sum + per5 * productivityFor(w.fatigue) * w.seed.pace, 0);
  }

  private suspenseTotals(): { cents: number; items: number; oldestDays: number } {
    const q = this.stations.SUSPENSE.queue;
    let cents = 0;
    let oldest = this.day;
    for (const p of q) {
      cents += p.plan.suspenseCents;
      oldest = Math.min(oldest, p.suspenseDay ?? p.bornDay);
    }
    return { cents, items: q.length, oldestDays: q.length > 0 ? this.day - oldest : 0 };
  }

  private workerView(st: StationState, w: WorkerState, phase: Phase): WorkerView {
    const recent = w.activity !== null && this.tick - w.activityTick <= 1;
    const lateEvening = phase === 'EOD' || (phase === 'AFTER_HOURS' && this.minute >= 18 * 60);
    let activity: string;
    let working = false;
    if (recent && w.activity) {
      activity = w.activity;
      working = true;
    } else if (STATIONS[st.id].automated) {
      activity = IDLE_TEXT[st.id];
    } else if (isNightStation(st.id) && phase !== 'EOD') {
      activity = 'Off shift until 22:30';
    } else if (st.id === 'SUSPENSE' && phase !== 'WORKING') {
      activity = st.queue.length > 0 ? `Desk closed. ${st.queue.length} items wait for tomorrow` : 'Desk closed until 09:00';
    } else if (isCustomerStation(st.id) && lateEvening && st.queue.length === 0) {
      activity = 'Off shift until 08:00';
    } else if (phase === 'PRE_OPEN') {
      activity = 'Morning briefing and systems check';
    } else {
      activity = IDLE_TEXT[st.id];
    }
    return {
      id: w.seed.id,
      name: w.seed.name,
      role: w.seed.role,
      station: st.id,
      fatigue: Math.round(w.fatigue),
      productivity: Math.round(productivityFor(w.fatigue) * 100) / 100,
      itemsToday: w.items,
      activity,
      working,
      temp: w.temp,
      machine: STATIONS[st.id].automated === true,
      shift: w.seed.shift,
      profile: w.seed.profile,
    };
  }

  private statLines(st: StationState): StationStats['lines'] {
    const c = (key: string): number => st.counters[key] ?? 0;
    const n = (key: string): string => String(c(key));
    const money = (key: string): string => formatAud(c(key));
    switch (st.id) {
      case 'GATE_VIRTUAL':
      case 'GATE_POS':
      case 'GATE_ECOM':
        return [{ label: 'Arrived today', value: n('arrived') }];
      case 'GATE_A2A':
        return [
          { label: 'Arrived today', value: n('arrived') },
          { label: 'Well-formed pacs.008', value: n('validated') },
          { label: 'Rejected as malformed', value: n('rejected'), tone: c('rejected') > 0 ? 'warn' : undefined },
        ];
      case 'GATE_ATM':
        return [
          { label: 'Cards inserted', value: n('arrived') },
          { label: 'PIN accepted', value: n('verified') },
          { label: 'Needed a retry', value: n('retries') },
          { label: 'Locked, card kept', value: n('locked'), tone: c('locked') > 0 ? 'warn' : undefined },
        ];
      case 'ATM_CASH':
        return [
          { label: 'Cash paid out', value: `${n('dispensed')} · ${money('dispensedCents')}` },
          { label: 'Dispenser jams', value: n('jams'), tone: c('jams') > 0 ? 'crit' : undefined },
          { label: 'Parked in suspense', value: money('jamCents'), tone: c('jams') > 0 ? 'warn' : undefined },
          { label: 'Not enough money', value: n('noFunds') },
        ];
      case 'SEC_VAULT':
        return [
          { label: 'Cards resolved', value: n('resolved') },
          { label: 'Unknown card numbers', value: n('unknown'), tone: c('unknown') > 0 ? 'warn' : undefined },
        ];
      case 'SEC_DCVV':
        return [
          { label: 'Valid', value: n('valid') },
          { label: 'Expired', value: n('expired'), tone: c('expired') > 0 ? 'warn' : undefined },
          { label: 'Wrong code', value: n('mismatch'), tone: c('mismatch') > 0 ? 'warn' : undefined },
        ];
      case 'SEC_3DS': {
        const decided = c('frictionless') + c('challenged') + c('rejected');
        return [
          { label: 'Frictionless', value: n('frictionless') },
          { label: 'Challenged (OTP)', value: `${n('challenged')}${decided > 0 ? ` · ${Math.round((c('challenged') / decided) * 100)}%` : ''}` },
          { label: 'Customer walked away', value: n('abandoned'), tone: c('abandoned') > 0 ? 'warn' : undefined },
          { label: 'Rejected', value: n('rejected'), tone: c('rejected') > 0 ? 'warn' : undefined },
        ];
      }
      case 'LEDGER_DEBIT':
      case 'LEDGER_CREDIT':
        return [
          { label: 'Holds placed', value: n('approved') },
          { label: 'Held today', value: money('heldCents') },
          { label: st.id === 'LEDGER_CREDIT' ? 'Over the limit' : 'Not enough funds', value: n('declined'), tone: c('declined') > 0 ? 'warn' : undefined },
          ...(st.id === 'LEDGER_DEBIT' ? [{ label: 'Direct postings', value: n('posted'), tip: 'posted' }] : []),
        ];
      case 'BNPL':
        return [
          { label: 'Plans approved', value: n('plans') },
          { label: 'Fell back to a card', value: n('fallback') },
          { label: 'Financed today', value: formatAud(this.kpis.bnpl.financedCents) },
          { label: 'Expected bad debt', value: formatAud(this.kpis.bnpl.expectedLossCents), tone: this.kpis.bnpl.expectedLossCents > 0 ? 'warn' : undefined },
        ];
      case 'EOD_BATCH':
        return [
          { label: 'Records batched', value: n('batched') },
          { label: 'Clearing file', value: money('batchCents') },
        ];
      case 'EOD_VISA':
        return [
          { label: 'Presented to Visa', value: n('presented') },
          { label: 'Net settlement', value: money('netCents') },
        ];
      case 'RECON':
        return [
          { label: 'Matched', value: n('matched') },
          { label: 'Breaks', value: n('breaks'), tone: c('breaks') > 0 ? 'warn' : undefined },
          { label: 'False breaks (dust)', value: n('falseBreaks'), tone: c('falseBreaks') > 0 ? 'warn' : undefined },
          { label: 'Errors matched away', value: n('leaked'), tone: c('leaked') > 0 ? 'crit' : undefined },
        ];
      case 'SUSPENSE': {
        const s = this.suspenseTotals();
        return [
          { label: 'Open items', value: String(s.items), tone: s.items >= 25 ? 'warn' : undefined },
          { label: 'Balance', value: formatAud(s.cents) },
          { label: 'Oldest', value: s.items > 0 ? `${s.oldestDays} day${s.oldestDays === 1 ? '' : 's'}` : '—' },
          { label: 'Cleared today', value: `${n('cleared')} · ${money('clearedCents')}` },
        ];
      }
      default:
        return this.extendedLines(st);
    }
  }

  /** Phase 8 desks: the live metrics the brief names, each with its own tip key. */
  private extendedLines(st: StationState): StationStats['lines'] {
    const c = (key: string): number => st.counters[key] ?? 0;
    const n = (key: string): string => String(c(key));
    const pctOf = (part: number, whole: number): string => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : '—');
    const warn = (key: string, tone: Severity = 'warn'): Severity | undefined => (c(key) > 0 ? tone : undefined);
    switch (st.id) {
      case 'GATE_EKYC':
        return [
          { label: 'OCR matching', value: c('scans') > 0 ? `${Math.round(c('ocrSum') / c('scans'))}%` : '—', tip: 'ocr' },
          { label: 'Face liveness pass rate', value: pctOf(c('livePass'), c('scans')), tip: 'liveness' },
          { label: 'Fake ID detection rate', value: pctOf(c('fakeId'), c('scans')), tone: warn('fakeId'), tip: 'fakeId' },
          { label: 'Citizen database mismatches', value: n('citizenDb'), tone: warn('citizenDb'), tip: 'citizenDb' },
          { label: 'Accounts opened', value: n('verified'), tip: 'opened' },
        ];
      case 'GATE_QR':
        return [
          { label: QR_SCANNED_LABEL_EN, value: n('dynamic'), tip: 'qrParsed' },
          { label: 'Rejected (CRC / format)', value: n('invalid'), tone: warn('invalid'), tip: 'qrInvalid' },
          { label: 'Mapped to ISO 8583', value: n('parsed'), tip: 'iso8583' },
        ];
      case 'TELLER_CASH': {
        const waitingIn = st.queue.filter((p) => {
          const ck = p.plan.stops[p.stopIndex]?.check;
          return ck?.at === 'TELLER' && ck.direction === 'IN';
        }).length;
        const vault = TELLER_VAULT_OPENING_CENTS + c('vaultIn') - c('vaultOut');
        return [
          { label: 'Deposit / withdrawal queue', value: `${waitingIn} / ${st.queue.length - waitingIn}`, tip: 'tellerQueue' },
          { label: 'Vault cash balance', value: formatAud(vault), tone: vault < 2_500_000 ? 'warn' : undefined, tip: 'vault' },
          { label: 'Suspect note serials', value: n('suspectSerials'), tone: warn('suspectSerials'), tip: 'serials' },
          { label: 'CTR filed (over $10,000)', value: n('ctr'), tip: 'ctr' },
          { label: 'Over the till limit', value: n('vaultLimit'), tone: warn('vaultLimit'), tip: 'tillLimit' },
        ];
      }
      case 'SEC_FACEPAY':
        return [
          { label: 'Biometric checks (over $400)', value: n('checks'), tip: 'faceChecks' },
          { label: 'Face match rate', value: pctOf(c('matched'), c('checks')), tip: 'faceMatch' },
          { label: 'BIOMETRIC_AUTH_REQUIRED', value: n('failed'), tone: warn('failed'), tip: 'faceFailed' },
          { label: 'No face enrolled', value: n('notEnrolled'), tone: warn('notEnrolled'), tip: 'faceEnrol' },
        ];
      case 'SEC_FDS':
        return [
          { label: 'Devices scored', value: n('scored'), tip: 'fdsScored' },
          { label: 'FDS_HIGH_RISK_DEVICE', value: n('blocked'), tone: warn('blocked'), tip: 'fdsBlocked' },
          { label: 'IP anomalies', value: n('sigIP'), tip: 'fdsIp' },
          { label: 'Rooted / jailbroken', value: n('sigROOT'), tip: 'fdsRoot' },
          { label: 'BIN attack bursts', value: n('sigBIN'), tone: warn('sigBIN'), tip: 'fdsBin' },
          { label: 'STR flags raised', value: n('strFlags'), tip: 'strFlag' },
        ];
      case 'AML_DESK':
        return [
          { label: 'STR flagged (reviewed)', value: n('reviewed'), tip: 'strFlagged' },
          { label: 'Suspicious ratio', value: pctOf(c('strFiled'), c('reviewed')), tip: 'suspiciousRatio' },
          { label: 'Review latency (min)', value: c('reviewed') > 0 ? String(Math.round(c('reviewMin') / c('reviewed'))) : '—', tip: 'reviewLatency' },
          { label: 'Sanctions matches (OFAC/PEP)', value: n('sanctions'), tone: warn('sanctions', 'crit'), tip: 'sanctions' },
          { label: 'Released to the ledger', value: n('released'), tip: 'released' },
        ];
      case 'DISPUTE_DESK':
        return [
          { label: 'Claims worked (CB / pacs.004 / ATM)', value: `${n('claims')} (${n('chargebacks')} / ${n('returns')} / ${n('atmClaims')})`, tip: 'claims' },
          { label: 'Refunded', value: `${n('refunds')} · ${formatAud(c('refundCents'))}`, tip: 'refunds' },
          { label: 'Past the SLA', value: n('lateClaims'), tone: warn('lateClaims'), tip: 'sla' },
          { label: 'Rejected on evidence', value: n('rejected'), tip: 'evidence' },
        ];
      case 'GATE_SWIFT':
        return [
          { label: 'pacs.008 validated', value: n('valid'), tip: 'pacs008' },
          { label: 'Rejected as malformed', value: n('invalid'), tone: warn('invalid'), tip: 'swiftInvalid' },
          { label: 'Sent abroad (AUD)', value: formatAud(c('sentCents')), tip: 'swiftValue' },
        ];
      default:
        return [];
    }
  }

  private queueItem(p: Packet): QueueItemView {
    const waited = p.waitedMin + Math.max(0, this.minute - p.queuedAtMinute);
    const stop = p.plan.stops[p.stopIndex];
    let detail: string;
    if (p.kind === 'SETTLEMENT') detail = p.plan.suspenseCents > 0 && stop?.place === 'SUSPENSE' ? `${p.plan.reasonCode ?? 'break'}` : `record …${p.id.slice(-6)}`;
    else if (p.kind === 'ATM' && stop?.place === 'SUSPENSE') detail = 'ATM jam, refund due';
    else if (stop?.place === 'GATE_ATM') detail = 'at the keypad';
    else if (stop?.place === 'ATM_CASH') detail = 'cash bay';
    else if (stop?.place === 'SEC_3DS') detail = `risk ${p.riskScore}`;
    else if (stop?.place === 'BNPL') detail = `score ${p.score}`;
    else if (stop?.place === 'AML_DESK') detail = 'STR_PENDING';
    else if (p.kind === 'ONBOARD') detail = 'new account';
    else if (p.kind === 'QR') detail = 'VietQR';
    else if (p.kind === 'SWIFT') detail = 'SWIFT pacs.008';
    else if (p.kind === 'TELLER') detail = stop?.check?.at === 'TELLER' && stop.check.direction === 'OUT' ? 'cash out' : 'cash in';
    else if (p.kind === 'DISPUTE') detail = 'claim';
    else detail = p.kind === 'POS' ? 'card present' : p.kind === 'VIRTUAL' ? 'virtual card' : p.kind === 'BNPL' ? 'Pay-in-4' : p.kind === 'A2A' ? 'instant transfer' : 'online';
    return { id: p.id, kind: p.kind, scenario: scenarioLabelEn(p.scenario), cardType: p.cardType, amountCents: p.amountCents, waitedMin: Math.max(0, Math.round(waited * 10) / 10), detail };
  }

  private stationView(st: StationState, phase: Phase, alerts: AlertView[]): StationView {
    const mine = alerts.filter((a) => a.station === st.id);
    const q = st.queue.length;
    const cap = this.capacity(st);
    // A past event (a fraud that got through, a customer who gave up) stays on the alert list all day, but it is not a desk in trouble now.
    const crit = mine.some((a) => a.severity === 'crit' && a.live);
    const congested = mine.some((a) => a.id === `queue:${st.id}`) || (isNightStation(st.id) && phase === 'EOD' && q > cap * 6);
    const busy = st.servedBeat > 0 || st.workers.some((w) => w.busyShare > 0.05);
    const status: StationStatus = crit ? 'ALERT' : congested ? 'CONGESTED' : busy ? 'BUSY' : 'IDLE';
    return {
      id: st.id,
      queueLength: q,
      queue: st.queue.slice(0, QUEUE_VIEW_LIMIT).map((p) => this.queueItem(p)),
      status,
      stats: {
        processedToday: st.processed,
        avgWaitMin: st.waitCount > 0 ? Math.round((st.waitSum / st.waitCount) * 10) / 10 : 0,
        peakQueue: st.peakQueue,
        errorsToday: st.errors,
        capacityPerBeat: Math.round(cap * 10) / 10,
        utilisation: Math.round(st.utilisation * 100) / 100,
        lines: [...this.statLines(st), ...this.roleplayLines(st)],
      },
      workers: st.workers.map((w) => this.workerView(st, w, phase)),
      history: [...st.history],
      working: st.working,
      alerts: mine,
      stream: [...st.stream].reverse().slice(0, 24),
      arrivals: st.arrivalsBeat,
      served: st.servedBeat,
    };
  }

  // Staff Roleplay Workspace (Phase 8 Step 2)

  /** The roleplay desk whose staff stand down while the learner works it, or null. */
  private staffOverride: StationId | null = null;

  setStaffOverride(id: StationId | null): void {
    this.staffOverride = id && roleForStation(id) ? id : null;
  }

  private deskContext(): { vaultCents: number; nostroCents: number; bnplMinScore: number } {
    const teller = this.stations.TELLER_CASH.counters;
    const swift = this.stations.GATE_SWIFT.counters;
    return {
      vaultCents: TELLER_VAULT_OPENING_CENTS + (teller.vaultIn ?? 0) - (teller.vaultOut ?? 0),
      nostroCents: NOSTRO_OPENING_CENTS - (swift.sentCents ?? 0),
      bnplMinScore: this.rules.bnplMinScore,
    };
  }

  /** The reviews waiting at a roleplay desk, head of the queue first. Empty for any other desk. */
  staffCases(id: StationId, limit = 8): StaffCase[] {
    const role = roleForStation(id);
    if (!role) return [];
    const ctx = this.deskContext();
    const out: StaffCase[] = [];
    for (const p of this.stations[id].queue) {
      const waited = p.waitedMin + Math.max(0, this.minute - p.queuedAtMinute);
      const c = buildStaffCase(role, p, ctx, Math.round(waited * 10) / 10);
      if (c) out.push(c);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** The learner decides one queued review. */
  staffDecide(id: StationId, packetId: string, decision: StaffDecision, latencySec: number): StaffDecisionResult {
    const role = roleForStation(id);
    const st = this.stations[id];
    const at = st.queue.findIndex((q) => q.id === packetId);
    const p = at >= 0 ? st.queue[at] : undefined;
    const c = role && p ? buildStaffCase(role, p, this.deskContext()) : null;
    if (!role || !p || !c || this.dayOver) return { ok: false, packetId, decision, expected: null, correct: false, statusCode: 'NOT_PENDING' };
    st.queue.splice(at, 1);
    const stop = p.plan.stops[p.stopIndex]!;
    const waited = Math.max(0, this.minute - p.queuedAtMinute);
    p.waitedMin += waited;
    st.waitSum += waited;
    st.waitCount++;
    st.processed++;
    st.servedBeat++;
    this.record(st, p, stop);
    const correct = decision === c.expected;
    bump(st, RP_COUNTERS.reviews);
    if (correct) bump(st, RP_COUNTERS.correct);
    bump(st, RP_COUNTERS.latency, Math.max(0, Math.round(latencySec)));
    p.stopIndex++;
    this.advance(p, this.minute, 0, beatMinutesAt(Math.min(this.minute, DAY_END - 1)));
    return { ok: true, packetId, decision, expected: c.expected, correct, statusCode: statusCodeFor(role, decision, p) };
  }

  private roleplayLines(st: StationState): StationStats['lines'] {
    const reviews = st.counters[RP_COUNTERS.reviews] ?? 0;
    if (reviews === 0) return [];
    const correct = st.counters[RP_COUNTERS.correct] ?? 0;
    const acc = Math.round((correct / reviews) * 1000) / 10;
    return [
      { label: 'Roleplay reviews', value: String(reviews), tip: 'rpReviews' },
      { label: 'Roleplay accuracy', value: `${acc}%`, tone: acc < 90 ? 'warn' : 'ok', tip: 'rpAccuracy' },
      { label: 'Roleplay review latency (s)', value: String(Math.round((st.counters[RP_COUNTERS.latency] ?? 0) / reviews)), tip: 'rpLatency' },
    ];
  }

  /** A plain-object picture of the bank right now, for the screen. */
  snapshot(): BankView {
    const phase = phaseAt(Math.min(this.minute, DAY_END - 1));
    const alerts = [...this.stateAlerts(), ...this.eventAlerts].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.minute - a.minute);
    const stations = {} as Record<StationId, StationView>;
    for (const id of STATION_IDS) {
      stations[id] = this.stationView(this.stations[id], phase, alerts);
    }
    const phoneCents = this.otpWaiting.reduce((sum, p) => sum + p.amountCents, 0);
    const externals = {} as Record<ExternalId, PlaceCount>;
    for (const id of EXTERNAL_IDS) externals[id] = { count: 0, cents: 0 };
    externals.CUSTOMER_OTP = { count: this.otpWaiting.length, cents: phoneCents };
    externals.OUT_APPROVED = { count: this.kpis.approved, cents: this.kpis.approvedCents };
    externals.OUT_DECLINED = { count: this.kpis.declined, cents: this.kpis.declinedCents };
    externals.OUT_SETTLED = { ...this.settled };

    const s = this.suspenseTotals();
    return {
      day: this.day,
      minute: this.minute,
      phase,
      beat: beatIndexAt(this.minute),
      tick: this.tick,
      dayOver: this.dayOver,
      event: this.traffic.event,
      rules: { ...this.rulesNow },
      stations,
      externals,
      moves: sampleMoves(this.beatMoves, MAX_MOVES),
      kpis: structuredClone(this.kpis),
      feed: [...this.feed].reverse().slice(0, 80),
      alerts: alerts.slice(0, 30),
      inFlight: this.inFlight(),
      suspense: { cents: s.cents, items: s.items, oldestDays: s.oldestDays },
      ledger: {
        recent: this.book.entries.slice(-LEDGER_RECENT).reverse(),
        lines: this.book.entries.length,
        payments: groupByTransaction(this.book.entries).size,
        trial: trialBalance(this.book.entries),
        scenarios: this.recentScenarios(),
      },
      history: [...this.history],
      chaos: this.chaosView(),
      disputed: [...this.disputed],
    };
  }

  private recentScenarios(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.book.entries.slice(-LEDGER_RECENT)) {
      if (e.txId in out) continue;
      const label = this.labelForTx(e.txId);
      if (label) out[e.txId] = label;
    }
    return out;
  }

  /** Every line posted to today's ledger so far, oldest first. The screen gets only the latest few (see `snapshot().ledger`). */
  get ledgerEntries(): readonly GLEntry[] {
    return this.book.entries;
  }

  /** Today's profit and loss so far. */
  get netCents(): number {
    return pnl(this.kpis).netCents;
  }
}

const severityRank = (s: Severity): number => (s === 'crit' ? 3 : s === 'warn' ? 2 : s === 'ok' ? 1 : 0);

/** Keeps at most `max` moves, spread evenly through the beat so the picture does not lose its shape. */
export function sampleMoves(moves: readonly Move[], max: number): Move[] {
  if (moves.length <= max) return [...moves];
  const out: Move[] = [];
  const step = moves.length / max;
  for (let i = 0; i < max; i++) out.push(moves[Math.floor(i * step)]!);
  return out;
}

