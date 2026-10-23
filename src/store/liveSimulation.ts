/**
 * What the canvas shows while a transaction travels through the diagram.
 *
 * Everything here is a pure function of the runner's tokens and the events of the latest step, so it
 * can be tested without React. The store calls these after each step and publishes the result;
 * components only read it.
 *
 *   TokenLook      what a token looks like (glowing card, Pay-in-4 split badge, settlement folder)
 *   EdgeTraffic    tokens that took a wire in the latest step, so the wire can animate them
 *   NodeRuntime    per-desk state: busy, queueing, congested, frozen, alarmed, or dropping a token
 */

import { tr } from '../i18n/locale';
import type { RunEvent, StepResult } from '../engine/processRunner';
import type { CardType, Id, NodeType, SimulationToken, TokenState } from '../types/processLearning';

// ─────────────────────────────────────────────────────────────────────────────
// Token looks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * - CARD         a debit, credit, prepaid or virtual card payment: a glowing chip card
 * - BNPL         a Pay-in-4 application that has not been turned down: a badge split in four
 * - SETTLEMENT   an end-of-day record being reconciled: a document folder
 * - TRANSFER     an instant account-to-account transfer: a lightning-bolt badge
 * - CASH         a sidewalk ATM withdrawal: a banknote
 */
export type TokenKind = 'CARD' | 'BNPL' | 'SETTLEMENT' | 'TRANSFER' | 'CASH';

export interface TokenLook {
  kind: TokenKind;
  cardType: CardType;
  /** For tooltips and screen readers. */
  label: string;
}

export interface TokenChip {
  tokenId: Id;
  look: TokenLook;
}

const CARD_LABEL: Record<CardType, string> = {
  DEBIT: 'Debit card payment',
  CREDIT: 'Credit card payment',
  PREPAID: 'Prepaid card payment',
  VIRTUAL_DPAN: 'Virtual card payment',
};

/**
 * A token's look follows what it is right now, not what it started as. A Pay-in-4 application is a
 * split badge until the underwriter says no; from then on it is a plain card payment, which is what
 * the fallback path will charge.
 */
export function lookOfToken(token: Pick<SimulationToken, 'payload' | 'derived'>): TokenLook {
  const { payload, derived } = token;
  if (payload.settlement) return { kind: 'SETTLEMENT', cardType: payload.cardType, label: 'Settlement record' };
  if (payload.a2a) return { kind: 'TRANSFER', cardType: payload.cardType, label: 'Instant account-to-account transfer' };
  if (payload.channel === 'ATM') return { kind: 'CASH', cardType: payload.cardType, label: 'ATM cash withdrawal' };
  if (payload.bnpl && derived.bnplDecision !== 'INELIGIBLE') {
    return {
      kind: 'BNPL',
      cardType: payload.cardType,
      label: derived.bnplDecision === 'ELIGIBLE' ? 'Pay-in-4 plan (approved)' : 'Pay-in-4 application',
    };
  }
  return { kind: 'CARD', cardType: payload.cardType, label: CARD_LABEL[payload.cardType] };
}

const lookKey = (l: TokenLook): string => `${l.kind}:${l.cardType}`;

// ─────────────────────────────────────────────────────────────────────────────
// Desk state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a workstation is doing right now. When several apply, the later one wins:
 * IDLE, QUEUED, PROCESSING, WAITING, DONE, FAULTED, FROZEN.
 */
export type NodeRunStatus = 'IDLE' | 'QUEUED' | 'PROCESSING' | 'WAITING' | 'DONE' | 'FAULTED' | 'FROZEN';

// A join that has just parked a token did run this tick, but what the learner needs to see is that it is holding.
const STATUS_RANK: Record<NodeRunStatus, number> = { IDLE: 0, QUEUED: 1, PROCESSING: 2, WAITING: 3, DONE: 4, FAULTED: 5, FROZEN: 6 };

/**
 * - FRAUD_SLIP    a fraudulent payment was approved
 * - RECON_BREAK   the recon desk found the three records disagree (shown on the desk)
 * - BREAK_SLIP    a payment with a reconciliation break was settled as approved
 */
export type AlarmKind = 'FRAUD_SLIP' | 'RECON_BREAK' | 'BREAK_SLIP';

export interface NodeAlarm {
  kind: AlarmKind;
  text: string;
  tokenId: Id;
  /** The tick it was raised, so a new alarm restarts the animation. */
  tick: number;
}

export interface DroppedMarker {
  tokenId: Id;
  look: TokenLook;
  reason: string;
  tick: number;
}

export interface NodeRuntime {
  status: NodeRunStatus;
  /** Tokens standing at this node: waiting for their turn, or parked at a join. */
  queue: number;
  /** Tokens waiting for their turn (queue without those parked at a join). */
  waiting: number;
  /** Waiting tokens, plus one if the desk ran in the latest tick. What the desk is being asked to carry. */
  load: number;
  /** How many tokens the desk can carry at once. Infinity for joins and End events. */
  capacity: number;
  /** load > capacity. */
  congested: boolean;
  /** Tokens standing here now. */
  chips: TokenChip[];
  /** The token this desk worked on in the latest tick, shown at the desk until it leaves. */
  worked: TokenChip | null;
  workedAtTick: number | null;
  /** How many times this node has run in the current simulation. */
  visits: number;
  lastDurationMs: number | null;
  /** Set while an AND join holds tokens. */
  joinWaiting: { arrived: number; expected: number } | null;
  note: string | null;
  /** Stays until the simulation is reset. */
  alarm: NodeAlarm | null;
  /** A token that stopped here for good (dead end, unhandled error, no matching branch). Stays until reset. */
  dropped: DroppedMarker | null;
}

export const IDLE_RUNTIME: NodeRuntime = Object.freeze({
  status: 'IDLE',
  queue: 0,
  waiting: 0,
  load: 0,
  capacity: 1,
  congested: false,
  chips: [],
  worked: null,
  workedAtTick: null,
  visits: 0,
  lastDurationMs: null,
  joinWaiting: null,
  note: null,
  alarm: null,
  dropped: null,
});

/**
 * How many tokens a desk can carry at once. A task or decision handles one transaction at a time, so
 * two arriving together queue up. An AND gateway is where parallel branches are meant to meet, and an
 * End event just collects, so neither can be congested.
 */
export function capacityOf(type: NodeType): number {
  switch (type) {
    case 'GATEWAY_AND':
    case 'EVENT_END':
      return Number.POSITIVE_INFINITY;
    case 'EVENT_START':
    case 'TASK':
    case 'GATEWAY_XOR':
      return 1;
  }
}

export interface ActiveToken {
  tokenId: Id;
  parentTokenId: Id | null;
  /** The node the token is standing at (about to run it, parked at it, or finished at it). */
  nodeId: Id | null;
  /** The edge it last travelled along. */
  edgeId: Id | null;
  state: TokenState;
  elapsedMs: number;
  look: TokenLook;
}

export function deriveActiveTokens(tokens: readonly SimulationToken[]): ActiveToken[] {
  return tokens.map((t) => ({
    tokenId: t.id,
    parentTokenId: t.parentTokenId,
    nodeId: t.currentNodeId,
    edgeId: t.currentEdgeId,
    state: t.state,
    elapsedMs: t.elapsedMs,
    look: lookOfToken(t),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Wires
// ─────────────────────────────────────────────────────────────────────────────

export interface EdgeTraffic {
  tokenId: Id;
  look: TokenLook;
  tick: number;
}

/** The tokens that took a wire in the latest step, by wire. */
export function deriveEdgeTraffic(events: readonly RunEvent[], tokens: readonly SimulationToken[], tick: number): Record<Id, EdgeTraffic[]> {
  const byId = new Map(tokens.map((t) => [t.id, t]));
  const traffic: Record<Id, EdgeTraffic[]> = {};
  for (const e of events) {
    if (e.type !== 'EDGE_TAKEN') continue;
    const token = byId.get(e.tokenId);
    if (!token) continue;
    (traffic[e.edgeId] ??= []).push({ tokenId: e.tokenId, look: lookOfToken(token), tick });
  }
  return traffic;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alarms
// ─────────────────────────────────────────────────────────────────────────────

const pretty = (s: string): string => s.replace(/^BREAK_/, '').replace(/_/g, ' ').toLowerCase();

/** Alarms raised by the events of one step: a break found by the recon desk, or fraud / a break approved at an End event. */
export function detectAlarms(events: readonly RunEvent[], tokens: readonly SimulationToken[], tick: number): Array<{ nodeId: Id; alarm: NodeAlarm }> {
  const byId = new Map(tokens.map((t) => [t.id, t]));
  const found: Array<{ nodeId: Id; alarm: NodeAlarm }> = [];
  for (const e of events) {
    if (e.type === 'NODE_EXECUTED') {
      const status = e.step.factsWritten.reconStatus;
      if (typeof status === 'string' && status.startsWith('BREAK')) {
        found.push({ nodeId: e.nodeId, alarm: { kind: 'RECON_BREAK', text: tr({ en: `Break: ${pretty(status)}`, vi: `Sai lệch: ${pretty(status)}` }), tokenId: e.tokenId, tick } });
      }
    } else if (e.type === 'TOKEN_COMPLETED' && e.outcome === 'APPROVED') {
      const token = byId.get(e.tokenId);
      if (!token) continue;
      if (token.payload.isFraud) {
        found.push({ nodeId: e.nodeId, alarm: { kind: 'FRAUD_SLIP', text: tr({ en: 'Fraud slipped through', vi: 'Gian lận đã lọt qua' }), tokenId: e.tokenId, tick } });
      } else if (typeof token.derived.reconStatus === 'string' && token.derived.reconStatus.startsWith('BREAK')) {
        found.push({ nodeId: e.nodeId, alarm: { kind: 'BREAK_SLIP', text: tr({ en: 'Break settled as approved', vi: 'Sai lệch bị quyết toán như chấp thuận' }), tokenId: e.tokenId, tick } });
      }
    }
  }
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// Desk state, per step
// ─────────────────────────────────────────────────────────────────────────────

export interface RuntimeNode {
  id: Id;
  type: NodeType;
}

const sameChips = (a: readonly TokenChip[], b: readonly TokenChip[]): boolean =>
  a.length === b.length && a.every((c, i) => c.tokenId === b[i]?.tokenId && lookKey(c.look) === lookKey(b[i]!.look));

const sameRuntime = (a: NodeRuntime, b: NodeRuntime): boolean =>
  a.status === b.status &&
  a.queue === b.queue &&
  a.waiting === b.waiting &&
  a.load === b.load &&
  a.congested === b.congested &&
  a.visits === b.visits &&
  a.lastDurationMs === b.lastDurationMs &&
  a.note === b.note &&
  a.workedAtTick === b.workedAtTick &&
  a.worked?.tokenId === b.worked?.tokenId &&
  a.alarm?.tick === b.alarm?.tick &&
  a.alarm?.kind === b.alarm?.kind &&
  a.dropped?.tick === b.dropped?.tick &&
  a.joinWaiting?.arrived === b.joinWaiting?.arrived &&
  a.joinWaiting?.expected === b.joinWaiting?.expected &&
  sameChips(a.chips, b.chips);

/**
 * Turns the runner's tokens and the events of the step just taken into per-desk display state.
 * A desk that is unchanged keeps its previous object, so components can skip re-rendering.
 */
export function deriveNodeRuntime(
  nodes: readonly RuntimeNode[],
  tokens: readonly SimulationToken[],
  previous: Readonly<Record<Id, NodeRuntime>>,
  step: StepResult | null,
  tick: number,
): Record<Id, NodeRuntime> {
  const events = step?.events ?? [];
  const byId = new Map(tokens.map((t) => [t.id, t]));
  const chipOf = (t: SimulationToken): TokenChip => ({ tokenId: t.id, look: lookOfToken(t) });

  const next: Record<Id, NodeRuntime> = {};
  const raise = (id: Id, status: NodeRunStatus): void => {
    const r = next[id];
    if (r && STATUS_RANK[status] > STATUS_RANK[r.status]) r.status = status;
  };

  for (const n of nodes) {
    const before = previous[n.id] ?? IDLE_RUNTIME;
    next[n.id] = {
      ...before,
      status: 'IDLE',
      queue: 0,
      waiting: 0,
      load: 0,
      capacity: capacityOf(n.type),
      congested: false,
      chips: [],
      worked: null,
      workedAtTick: null,
      note: null,
    };
  }

  for (const t of tokens) {
    const id = t.currentNodeId;
    const r = id ? next[id] : undefined;
    if (!id || !r) continue;
    if (t.state === 'ACTIVE') {
      r.queue++;
      r.waiting++;
      r.chips.push(chipOf(t));
      raise(id, 'QUEUED');
    } else if (t.state === 'WAITING_JOIN') {
      r.queue++;
      r.chips.push(chipOf(t));
      raise(id, 'WAITING');
    } else if (t.state === 'EXCEPTION' || t.state === 'DEADLOCKED') {
      raise(id, 'FAULTED');
      r.note = t.exception?.message ?? null;
    } else if (t.state === 'COMPLETED' && t.finalOutcome !== null) {
      raise(id, 'DONE');
    }
  }

  const ranHere = new Set<Id>();
  if (step?.step) {
    const ran = next[step.step.nodeId];
    if (ran) {
      ranHere.add(step.step.nodeId);
      ran.visits++;
      ran.lastDurationMs = step.step.durationMs;
      raise(step.step.nodeId, 'PROCESSING');
      if (step.step.note) ran.note = step.step.note;
      const worker = step.tokenId ? byId.get(step.tokenId) : undefined;
      if (worker) {
        ran.worked = chipOf(worker);
        ran.workedAtTick = tick;
      }
    }
  }

  for (const e of events) {
    if (e.type === 'JOIN_WAITING') {
      const r = next[e.nodeId];
      if (r) r.joinWaiting = { arrived: e.arrived, expected: e.expected };
    } else if (e.type === 'JOIN_RELEASED') {
      const r = next[e.nodeId];
      if (r) r.joinWaiting = null;
    }
  }

  // A join that never completes freezes. Any other token that stops for good is dropped where it stopped.
  const frozenNow = new Map<Id, string>();
  for (const e of events) {
    if (e.type === 'ANOMALY' && e.anomaly.type === 'DEADLOCK' && e.anomaly.nodeId) frozenNow.set(e.anomaly.nodeId, e.anomaly.message);
  }
  for (const n of nodes) {
    const r = next[n.id];
    if (!r) continue;
    const message = frozenNow.get(n.id);
    if (message !== undefined || previous[n.id]?.status === 'FROZEN') {
      r.status = 'FROZEN';
      r.note = message ?? previous[n.id]?.note ?? null;
    }
  }
  for (const e of events) {
    if (e.type !== 'TOKEN_FAULTED' || frozenNow.has(e.exception.nodeId)) continue;
    const r = next[e.exception.nodeId];
    if (!r) continue;
    const token = byId.get(e.tokenId);
    r.dropped = {
      tokenId: e.tokenId,
      look: token ? lookOfToken(token) : { kind: 'CARD', cardType: 'DEBIT', label: 'Payment' },
      reason: e.exception.message,
      tick,
    };
  }

  for (const { nodeId, alarm } of detectAlarms(events, tokens, tick)) {
    const r = next[nodeId];
    // A payment that got through is worse than a break that was merely found, so it takes over the desk's alarm.
    if (r && (r.alarm === null || alarm.kind !== 'RECON_BREAK')) r.alarm = alarm;
  }

  for (const n of nodes) {
    const r = next[n.id];
    if (!r) continue;
    r.load = r.waiting + (ranHere.has(n.id) ? 1 : 0);
    r.congested = r.load > r.capacity;
    const prev = previous[n.id];
    if (prev && sameRuntime(prev, r)) next[n.id] = prev;
  }
  return next;
}
