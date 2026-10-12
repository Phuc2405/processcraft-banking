/**
 * Shared types for the living bank. Everything here is plain data (no classes, no Maps), so a
 * snapshot of the bank can be handed to React, saved, or compared without surprises.
 * Money is integer cents, as everywhere else in the project.
 */

import type { TrialBalance } from '../engine/ledger';
import type { BankingCapability, BankingPayload, CardType, DerivedFacts, GLEntry, Id, MinorUnits, Outcome } from '../types/processLearning';
import type { Phase } from './clock';
import type { BankRules } from './rules';
import type { DepartmentId, ExternalId, PlaceId, StationId } from './topology';

export type CheckoutKind = 'VIRTUAL' | 'POS' | 'ECOM' | 'BNPL' | 'A2A' | 'ATM';
export type PacketKind = CheckoutKind | 'SETTLEMENT';

// ─────────────────────────────────────────────────────────────────────────────
// A day's customers
// ─────────────────────────────────────────────────────────────────────────────

export type DayEventId = 'NORMAL' | 'PROMO' | 'FRAUD_RING' | 'VISA_GLITCH' | 'PAYDAY';

export interface DayEvent {
  id: DayEventId;
  title: string;
  /** What is going on, in the words of the morning briefing. */
  blurb: string;
  /** What a good operations manager should be watching. */
  watch: string;
  volume: number;
  /** Extra multiplier on how many of each kind of checkout arrive. */
  mix: Partial<Record<CheckoutKind, number>>;
  /** Extra multiplier on how many attempts of each kind are fraud. */
  fraud: Partial<Record<CheckoutKind, number>>;
  /** Multiplier on how many tonight's records are real breaks. */
  breaks: number;
}

/** What happens at the sidewalk machine, decided in advance from the seed so tomorrow can be replayed under other rules. */
export interface AtmSession {
  /** Wrong PINs typed before the right one (or, for a customer who does not know it, before the machine gives up). */
  wrongPins: number;
  /** Whether the person at the keypad knows the PIN at all. A thief with a stolen card usually does not. */
  knowsPin: boolean;
  /** Whether the dispenser jams on this withdrawal. */
  jams: boolean;
}

export interface Customer {
  id: Id;
  kind: CheckoutKind;
  /** What they were doing, from the scenario catalogue: "☕ Corner Cafe Tap". */
  scenario: string;
  /** Set for ATM withdrawals. */
  atm?: AtmSession;
  /** Minute of the day they arrive. */
  minute: number;
  payload: BankingPayload;
  /** Whether they will type the OTP if they are asked to. Decided in advance so tomorrow can be replayed under other rules. */
  otpCompletes: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// A payment's route, worked out by running the real process diagram
// ─────────────────────────────────────────────────────────────────────────────

export type StopKind = 'GATE' | 'WORK' | 'OTP' | 'SYSTEM' | 'OUTCOME';

export interface Stop {
  place: PlaceId;
  kind: StopKind;
  /** The node in the process diagram that ran here. Null for steps the diagram does not model. */
  nodeId: Id | null;
  label: string;
  capability: BankingCapability | null;
  /** Virtual milliseconds the node cost in the runner. */
  durationMs: number;
  /** The runner's plain-English note for this step. */
  note: string;
  facts: Partial<DerivedFacts>;
  /** How many multiples of the desk's normal time this item takes. */
  weight: number;
}

/** Why a payment was declined, in the bank's own categories. */
export type DeclineReason =
  | 'FUNDS'
  | 'DCVV_EXPIRED'
  | 'DCVV_MISMATCH'
  | 'UNKNOWN_DPAN'
  | 'THREE_DS_REJECT'
  | 'OTP_ABANDONED'
  | 'DOWN_PAYMENT'
  | 'PIN_LOCKED'
  | 'A2A_INVALID'
  | 'ATM_JAM'
  | 'TIMEOUT'
  | 'PROCESS_ERROR';

export interface RoutePlan {
  stops: Stop[];
  outcome: Outcome;
  reasonCode: string | null;
  decline: DeclineReason | null;
  /** Virtual time the diagram spent, all passes included. */
  latencyMs: number;
  /** How many times the diagram was run for this payment (2 when a 3DS challenge sent the customer away and back). */
  passes: number;
  /** Cents the ledger held on this path (the full amount, or only the Pay-in-4 down payment). */
  heldCents: MinorUnits;
  /** For a settlement record the recon desk could not match: the amount that goes into the suspense account. */
  suspenseCents: MinorUnits;
  threeDs: DerivedFacts['threeDsPath'] | null;
  bnpl: DerivedFacts['bnplDecision'] | null;
  recon: DerivedFacts['reconStatus'] | null;
  /** A model of the process diagram itself failing (should never happen with the bundled diagrams). */
  broken: boolean;
  /**
   * The general-ledger lines this payment posts when it finishes, read off the run by the same rules the Build Lab uses
   * (engine/postings.ts). Empty for a payment that moved no money. They always balance.
   */
  ledger: GLEntry[];
}

export interface SettlementTruth {
  /** The honest size of the error in the records, in cents. 0 when the three records agree exactly. */
  trueVarianceCents: number;
  /** What kind of error was really there. NOISE is rounding or FX dust, not a real mistake. */
  trueKind: 'NONE' | 'NOISE' | 'AMOUNT' | 'MISSING' | 'DUPLICATE';
}

// ─────────────────────────────────────────────────────────────────────────────
// Packets (what is moving through the bank right now)
// ─────────────────────────────────────────────────────────────────────────────

export interface Packet {
  id: Id;
  kind: PacketKind;
  /** The scenario id (see scenarios.ts) of the purchase, transfer or withdrawal this packet is. Empty for night-cycle records. */
  scenario: string;
  cardType: CardType;
  amountCents: MinorUnits;
  riskScore: number;
  /** BNPL underwriting score, or 0. */
  score: number;
  isFraud: boolean;
  plan: RoutePlan;
  /** Index into plan.stops of the stop the packet is at (or waiting for). */
  stopIndex: number;
  /** The minute of the day it joined (or will be able to start at) the current queue. */
  queuedAtMinute: number;
  /** Bank minutes spent waiting in queues so far, not counting the current one. */
  waitedMin: number;
  /** The minute it first arrived at the bank (or when the night cycle created it). */
  bornMinute: number;
  bornDay: number;
  /** For customers on their phone: minute they will have typed the code. */
  readyAtMinute: number;
  /** For settlement records. */
  truth?: SettlementTruth;
  /** For settlement records: the amount the ledger held at checkout, and the card it was on. */
  heldCents?: MinorUnits;
  /** The stop index a tired worker already fumbled once, so the redo is not fumbled again. */
  reworkedStop?: number;
  /** For a record in the suspense account: the day it landed there. */
  suspenseDay?: number;
  /** For an ATM jam: the customer was debited, the notes never came out, and the money is waiting here to be refunded. */
  jam?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// People
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerProfileSeed {
  skin: string;
  hair: string;
  shirt: string;
}

export interface WorkerView {
  id: Id;
  name: string;
  role: string;
  station: StationId;
  /** 0 fresh, 100 spent. */
  fatigue: number;
  /** 0-1: how much of a fresh person's pace they have left. */
  productivity: number;
  itemsToday: number;
  /** What they are doing, in words. */
  activity: string;
  working: boolean;
  temp: boolean;
  /** A machine (the sidewalk ATM), not a person: it never tires and has no one to cover for it. */
  machine: boolean;
  shift: string;
  profile: WorkerProfileSeed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read model for the UI
// ─────────────────────────────────────────────────────────────────────────────

export type Severity = 'info' | 'ok' | 'warn' | 'crit';

export interface FeedEntry {
  id: number;
  day: number;
  minute: number;
  place: PlaceId | null;
  severity: Severity;
  text: string;
  worker: string | null;
  packetId: Id | null;
  /** Worth showing in the bank-wide feed, not only in the desk's own stream. */
  notable: boolean;
}

export interface AlertView {
  id: string;
  station: StationId | null;
  severity: Severity;
  text: string;
  day: number;
  minute: number;
  /** State alerts clear themselves; event alerts stay for the rest of the day. */
  live: boolean;
}

export interface QueueItemView {
  id: Id;
  kind: PacketKind;
  /** "🛒 Supermarket Groceries ($62.80)", or an empty string for a night-cycle record. */
  scenario: string;
  cardType: CardType;
  amountCents: MinorUnits;
  waitedMin: number;
  /** One line about what it is waiting for, e.g. "risk 72". */
  detail: string;
}

export type StationStatus = 'IDLE' | 'BUSY' | 'CONGESTED' | 'ALERT';

export interface StationStats {
  processedToday: number;
  avgWaitMin: number;
  peakQueue: number;
  errorsToday: number;
  /** Items per beat the desk can clear right now, given who is on and how tired they are. */
  capacityPerBeat: number;
  /** 0-1 share of staff time spent working in the last beat. */
  utilisation: number;
  /** Station-specific lines, e.g. "Challenged: 14". */
  lines: Array<{ label: string; value: string; tone?: Severity }>;
}

export interface StationView {
  id: StationId;
  queueLength: number;
  queue: QueueItemView[];
  status: StationStatus;
  stats: StationStats;
  workers: WorkerView[];
  /** Queue length at the end of each recent beat, oldest first. */
  history: number[];
  /** The packet worked on most recently this beat, for the avatar's animation. */
  working: { kind: PacketKind; cardType: CardType } | null;
  /** New customers who arrived at this desk in the latest beat (gates only). */
  arrivals: number;
  /** Packets that left this desk in the latest beat. */
  served: number;
  alerts: AlertView[];
  /** Latest activity at this desk, newest first. */
  stream: FeedEntry[];
}

export interface PlaceCount {
  count: number;
  cents: MinorUnits;
}

export interface Move {
  /** Unique within a beat. */
  key: string;
  packetId: Id;
  edge: string;
  from: PlaceId;
  to: PlaceId;
  kind: PacketKind;
  cardType: CardType;
  /** "🛒 Supermarket Groceries ($62.80)" for a checkout, an empty string for a night-cycle record. */
  scenario: string;
  amountCents: MinorUnits;
  /** Where in the beat (0-1) the hop starts, so a payment crossing three desks hops in order. */
  at: number;
}

export interface DayKpis {
  arrivals: number;
  byKind: Record<CheckoutKind, number>;
  approved: number;
  declined: number;
  approvedCents: MinorUnits;
  declinedCents: MinorUnits;
  /** Approved card sales from genuine customers (Pay-in-4 baskets are counted under bnpl). */
  genuineCardCents: MinorUnits;
  declines: Record<DeclineReason, number>;
  fraudAttempts: number;
  fraudBlocked: number;
  fraudSlipped: number;
  fraudLossCents: MinorUnits;
  /** Genuine customers turned away by the security rules (expired dCVV, OTP walk-away, rejected). */
  frictionLostCount: number;
  frictionLostCents: MinorUnits;
  threeDs: { frictionless: number; challenged: number; passed: number; abandoned: number; rejected: number };
  virtual: { checkouts: number; expired: number; mismatch: number; unknown: number };
  a2a: {
    transfers: number;
    released: number;
    /** Messages the gateway refused as malformed. */
    invalid: number;
    /** The flat fee the bank earned on genuine transfers it released. */
    feeCents: MinorUnits;
  };
  atm: {
    sessions: number;
    dispensed: number;
    dispensedCents: MinorUnits;
    /** Sessions locked by three wrong PINs. */
    pinLocked: number;
    /** Withdrawals where the dispenser jammed after the customer was debited. */
    jams: number;
    jamCents: MinorUnits;
    /** Jammed money paid back to the customer after the cash count. */
    refundedCents: MinorUnits;
  };
  bnpl: {
    applications: number;
    plans: number;
    fallbackApproved: number;
    downPaymentDeclined: number;
    cardDeclined: number;
    /** Baskets of approved genuine plans (fee income is a share of this). */
    basketCents: MinorUnits;
    /** The part of those baskets the bank is owed in instalments 2 to 4. */
    financedCents: MinorUnits;
    expectedLossCents: MinorUnits;
  };
  /** Sum over finished payments, for averages. */
  latencySumMs: number;
  waitSumMin: number;
  finished: number;
  recon: {
    records: number;
    matched: number;
    breakAmount: number;
    breakMissing: number;
    breakDuplicate: number;
    /** Breaks raised for pure rounding noise: investigation time spent on nothing. */
    falseBreaks: number;
    /** Real errors the tolerance let through as a match, and how many. */
    leakageCents: MinorUnits;
    leakedCount: number;
    suspenseAddedCents: MinorUnits;
  };
  suspenseClearedCents: MinorUnits;
  suspenseClearedItems: number;
  /** Mistakes by tired staff that had to be redone. */
  reworks: number;
  /** Cost of temporary cover called in today, in cents. */
  coverCostCents: MinorUnits;
}

export interface SuspenseItem {
  id: Id;
  amountCents: MinorUnits;
  reason: string;
  /** Day it landed in suspense. */
  day: number;
  /** Where it came from. A card-settlement break is paid to the scheme when it clears; an ATM jam is refunded to the customer. */
  source?: 'ATM';
  /** For an ATM jam: the scenario of the withdrawal, so the refund can still say what it was for. */
  scenario?: string;
}

/** A settlement record still waiting in the night pipeline when a day closed. Enough to rebuild it exactly. */
export interface CarryRecord {
  txId: Id;
  cardType: CardType;
  amountCents: MinorUnits;
  heldCents: MinorUnits;
  /** The day the payment was approved (its settlement draws are keyed on this). */
  bornDay: number;
  /** The scenario of the purchase this record settles, so the night cycle can still say what it was. */
  scenario?: string;
  place: 'EOD_BATCH' | 'EOD_VISA' | 'RECON';
}

/** Everything one day hands to the next. */
export interface CarryState {
  suspense: SuspenseItem[];
  backlog: CarryRecord[];
}

/** How a payment's money was reconciled overnight. N/A: nothing to reconcile (a decline), or it settles on its own rail (A2A, ATM cash). */
export type TxReconStatus = 'YES' | 'NO' | 'SUSPENDED' | 'N/A';

/** One customer payment of the day, as the Master Transactions export lists it. Recorded when the payment finishes. */
export interface TxRecord {
  /** The packet id ("d1-0492"), the same id the ledger drawer shows. */
  id: Id;
  /** "TX-10492": the day number followed by the payment's serial. */
  txId: string;
  /** Minute of the day it arrived, with a fraction for the seconds. */
  minute: number;
  kind: PacketKind;
  cardType: CardType;
  scenario: string;
  amountCents: MinorUnits;
  /** What the bank earned on it: interchange, the Pay-in-4 merchant fee or the instant-transfer fee. 0 for declines, fraud and ATM cash. */
  feeCents: MinorUnits;
  status: 'APPROVED' | 'DECLINED' | 'JAMMED';
  decline: DeclineReason | null;
  isFraud: boolean;
  recon: TxReconStatus;
}

/** One person of a night shift, as the day report shows them. */
export interface NightShiftMember {
  id: Id;
  name: string;
  station: StationId;
  role: string;
  /** Booked as temporary cover for the night. */
  temp: boolean;
  /** 0 fresh, 100 spent, when the shift ended. */
  fatigue: number;
  /** 0-1: how much of a fresh person's pace they had left. */
  productivity: number;
  /** Records they worked tonight. */
  items: number;
}

/** The night shift (batch clearing, Visa settlement, reconciliation) of one day. */
export interface NightShiftReport {
  crew: NightShiftMember[];
  /** The night team members who had the night off under the rota. */
  resting: string[];
  /** Records the night had to work (tonight's approved payments plus anything carried from last night). */
  records: number;
  /** Records still unworked at midnight. */
  left: number;
  /** 0-1: share of the night's records worked. */
  completion: number;
  /** The minute the last record was cleared, or null if the night ran out of time. */
  finishedAt: number | null;
}

export interface DayReport {
  day: number;
  event: DayEvent;
  rules: BankRules;
  kpis: DayKpis;
  /** State of the bank when the day closed. */
  close: {
    suspenseCents: MinorUnits;
    suspenseItems: number;
    reconBacklog: number;
    /** The minute the night team cleared the last record, or null if records were left at midnight. */
    nightDoneMinute: number | null;
    avgFatigue: number;
    maxFatigue: number;
  };
  /** Who worked the night shift and how it went. Missing from reports saved by earlier versions. */
  nightShift?: NightShiftReport;
  /** The bank's reserves and customer base at the start and end of the day (see sim/bankBook.ts). Missing from older saves. */
  book?: {
    reservesStartCents: number;
    reservesEndCents: number;
    customersStart: number;
    signups: number;
    churned: number;
    customersEnd: number;
  };
}

/** Today's general ledger as the drawer shows it: the latest lines, and the trial balance over all of them. */
export interface LedgerView {
  /** The most recent lines posted today, newest first. */
  recent: GLEntry[];
  /** Every line posted today, and how many different payments they belong to. */
  lines: number;
  payments: number;
  trial: TrialBalance;
  /** Scenario label for each payment id that appears in `recent`: "🏧 Sidewalk ATM Cash Out ($100.00)". */
  scenarios: Record<string, string>;
}

export interface BankView {
  day: number;
  minute: number;
  phase: Phase;
  beat: number;
  /** Increases by one every beat, so the UI can tell a new beat's moves from the last one's. */
  tick: number;
  dayOver: boolean;
  event: DayEvent;
  rules: BankRules;
  stations: Record<StationId, StationView>;
  externals: Record<ExternalId, PlaceCount>;
  /** Payments sitting on a customer's phone, waiting for the OTP. */
  moves: Move[];
  kpis: DayKpis;
  feed: FeedEntry[];
  alerts: AlertView[];
  inFlight: number;
  suspense: { cents: MinorUnits; items: number; oldestDays: number };
  ledger: LedgerView;
  history: DayReport[];
}

export type { DepartmentId, ExternalId, PlaceId, StationId };
