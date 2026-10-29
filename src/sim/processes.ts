/** The bank's processes are the four reference diagrams from the Build Lab, with the bank's policy dials (BankRules) written into their node settings. */

import { ACADEMY_REFERENCES } from '../data/academyLevels';
import { LEVELS, NODE_CATALOG, REFERENCE_SOLUTIONS } from '../data/seedChallenges';
import { dispense, verifyPin } from '../engine/atm';
import { formatAud } from '../engine/money';
import { postTestResult } from '../engine/postings';
import { ProcessRunner, type RunResult } from '../engine/processRunner';
import type {
  BankingPayload,
  ConfigValue,
  DerivedFacts,
  ExecutionStep,
  Id,
  Outcome,
  ProcessEdge,
  ProcessGraph,
  ProcessNode,
  TestCase,
} from '../types/processLearning';
import { planExtended } from './amlEngine';
import type { BankRules } from './rules';
import { hasWire, type PlaceId, type StationId } from './topology';
import type { Customer, DeclineReason, RoutePlan, Stop } from './types';

// Graphs

export interface BankGraphs {
  virtual: ProcessGraph;
  ecom: ProcessGraph;
  pos: ProcessGraph;
  bnpl: ProcessGraph;
  a2a: ProcessGraph;
  settle: ProcessGraph;
  /** Academy chapter 6, part one: the Build Lab's Level 9 reference. The bank's floor does not run it; the Academy walks it. */
  aml: ProcessGraph;
  /** Academy chapter 6, part two: the Build Lab's Level 10 reference. */
  dispute: ProcessGraph;
}

function reference(levelNumber: 1 | 2 | 3 | 4): ProcessGraph {
  const level = LEVELS[levelNumber - 1];
  const found = level && REFERENCE_SOLUTIONS.find((r) => r.challengeId === level.id);
  if (!found) throw new Error(`No reference solution for level ${levelNumber}`);
  return structuredClone(found.graph);
}

/** A reference diagram of one of the Build Lab's Academy levels (5 to 10). */
function academyReference(challengeId: string): ProcessGraph {
  const found = ACADEMY_REFERENCES.find((r) => r.challengeId === challengeId);
  if (!found) throw new Error(`No reference solution for ${challengeId}`);
  return structuredClone(found.graph);
}

function configure(graph: ProcessGraph, nodeId: Id, params: Record<string, ConfigValue>): void {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Node ${nodeId} is not in ${graph.name}`);
  Object.assign(node.configParams, params);
}

const definition = (id: Id) => {
  const d = NODE_CATALOG.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown node definition ${id}`);
  return d;
};

function node(definitionId: Id, id: Id, label?: string, config: Record<string, ConfigValue> = {}): ProcessNode {
  const d = definition(definitionId);
  return {
    id,
    definitionId,
    type: d.type,
    label: label ?? d.label,
    bankingCapability: d.bankingCapability,
    inputPorts: d.inputPorts.map((p) => ({ ...p })),
    outputPorts: d.outputPorts.map((p) => ({ ...p })),
    configParams: { ...Object.fromEntries(d.configSchema.map((c) => [c.key, c.defaultValue])), ...config },
  };
}

function wire(id: Id, from: [Id, Id], to: [Id, Id], extra: Partial<ProcessEdge> = {}): ProcessEdge {
  return { id, sourceNodeId: from[0], sourcePortId: from[1], targetNodeId: to[0], targetPortId: to[1], ...extra };
}

/** Card present: chip and PIN or tap. No 3DS, no dCVV, only the money check. */
function posGraph(): ProcessGraph {
  return {
    id: 'g_bank_pos',
    name: 'POS swipe',
    nodes: [
      node('nd_start_payment', 'n_start', 'Card swiped'),
      node('nd_core_ledger_check', 'n_ledger'),
      node('nd_gateway_xor', 'n_xor', 'Funds ok?'),
      node('nd_end_outcome', 'n_end_approved', 'Approved', { outcome: 'APPROVED' }),
      node('nd_end_outcome', 'n_end_declined', 'Declined', { outcome: 'DECLINED' }),
    ],
    edges: [
      wire('e1', ['n_start', 'out'], ['n_ledger', 'in']),
      wire('e2', ['n_ledger', 'out'], ['n_xor', 'in_1']),
      wire('e3', ['n_xor', 'out_1'], ['n_end_approved', 'in'], { conditionExpression: "ledgerDecision == 'SUFFICIENT'", priority: 1 }),
      wire('e4', ['n_xor', 'out_2'], ['n_end_declined', 'in'], { isDefault: true }),
    ],
  };
}

/** An instant account-to-account transfer: the gateway reads the pacs.008, a malformed message is refused at the door, and a well-formed one goes to the debit ledger, which must find the money. */
function a2aGraph(): ProcessGraph {
  return {
    id: 'g_bank_a2a',
    name: 'A2A transfer',
    nodes: [
      node('nd_start_a2a', 'n_start', 'Transfer received'),
      node('nd_a2a_gateway', 'n_gateway', undefined, { instantLimitMinor: 2_500_000 }),
      node('nd_gateway_xor', 'n_xor_valid', 'Message valid?'),
      node('nd_core_ledger_check', 'n_ledger'),
      node('nd_gateway_xor', 'n_xor_funds', 'Funds ok?'),
      node('nd_end_outcome', 'n_end_invalid', 'Rejected: invalid message', { outcome: 'DECLINED', reasonCode: 'INVALID_MESSAGE' }),
      node('nd_end_outcome', 'n_end_approved', 'Released', { outcome: 'APPROVED', reasonCode: 'RAIL_INSTANT' }),
      node('nd_end_outcome', 'n_end_declined', 'Declined', { outcome: 'DECLINED' }),
    ],
    edges: [
      wire('e1', ['n_start', 'out'], ['n_gateway', 'in']),
      wire('e2', ['n_gateway', 'out'], ['n_xor_valid', 'in_1']),
      wire('e3', ['n_xor_valid', 'out_1'], ['n_end_invalid', 'in'], { conditionExpression: 'a2aValid == false', priority: 1 }),
      wire('e4', ['n_xor_valid', 'out_2'], ['n_ledger', 'in'], { isDefault: true }),
      wire('e5', ['n_ledger', 'out'], ['n_xor_funds', 'in_1']),
      wire('e6', ['n_xor_funds', 'out_1'], ['n_end_approved', 'in'], { conditionExpression: "ledgerDecision == 'SUFFICIENT'", priority: 1 }),
      wire('e7', ['n_xor_funds', 'out_2'], ['n_end_declined', 'in'], { isDefault: true }),
    ],
  };
}

/** The reference diagrams, with the bank's dials written into them. */
export function buildGraphs(rules: BankRules): BankGraphs {
  const virtual = reference(1);
  configure(virtual, 'n_dcvv', { validityWindowMs: rules.dcvvWindowSec * 1000 });

  const ecom = reference(2);
  configure(ecom, 'n_3ds', { frictionlessBelow: rules.frictionlessBelow, rejectAtOrAbove: rules.rejectAtOrAbove });

  const bnpl = reference(4);
  configure(bnpl, 'n_bnpl', { minScore: rules.bnplMinScore, minDownPaymentPct: rules.bnplMinDownPct });

  const settle = reference(3);
  configure(settle, 'n_recon', { toleranceMinor: rules.reconToleranceCents });

  return { virtual, ecom, pos: posGraph(), bnpl, a2a: a2aGraph(), settle, aml: academyReference('lvl_09_sanctions_storm'), dispute: academyReference('lvl_10_chargeback_warfare') };
}

// Running a graph

export function testCaseFor(payload: BankingPayload): TestCase {
  return { id: payload.txId, name: payload.txId, inputPayload: payload, expectedOutcome: 'APPROVED', maxLatencyMs: Number.MAX_SAFE_INTEGER };
}

export function runGraph(graph: ProcessGraph, payload: BankingPayload): RunResult {
  return new ProcessRunner(graph, testCaseFor(payload)).runToCompletion();
}

/** The steps of the token whose outcome counted (or, if none finished, the last token to run). */
export function decidingPath(result: RunResult): ExecutionStep[] {
  const token = result.tokens.find((t) => t.id === result.decidingTokenId) ?? result.tokens[result.tokens.length - 1];
  return token ? token.executionPathHistory : [];
}

// From a run to a route across the map

const ledgerPlace = (payload: BankingPayload, derived: DerivedFacts): StationId => {
  const source = derived.fundingSource ?? (payload.cardType === 'VIRTUAL_DPAN' ? 'DEBIT' : payload.cardType);
  return source === 'CREDIT' ? 'LEDGER_CREDIT' : 'LEDGER_DEBIT';
};

export function taskPlace(capability: NonNullable<ProcessNode['bankingCapability']>, payload: BankingPayload, derived: DerivedFacts): StationId {
  switch (capability) {
    case 'TOKEN_VAULT':
      return 'SEC_VAULT';
    case 'DCVV_VERIFIER':
      return 'SEC_DCVV';
    case 'THREE_DS_EVALUATOR':
      return 'SEC_3DS';
    case 'CORE_LEDGER_CHECK':
      return ledgerPlace(payload, derived);
    case 'BNPL_UNDERWRITER':
      return 'BNPL';
    case 'RECON_DESK':
      return 'RECON';
    case 'A2A_GATEWAY':
      return 'GATE_A2A';
    // AML screening and the dispute desks are Academy chapters only; they have no desk on the bank's floor yet.
    case 'AML_SCREENING':
    case 'CASE_INVESTIGATION':
      return 'SEC_3DS';
    case 'CHARGEBACK_DESK':
      return 'RECON';
  }
}

interface Walked {
  stops: Stop[];
  facts: DerivedFacts;
  latencyMs: number;
  result: RunResult;
}

/** Turns the nodes a token ran into stops at desks. Gateways and End events are decisions, not desks. */
function walk(graph: ProcessGraph, payload: BankingPayload, gate: PlaceId | null, skipStart = false): Walked {
  const result = runGraph(graph, payload);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const stops: Stop[] = [];
  const facts: DerivedFacts = { isVirtual: payload.cardType === 'VIRTUAL_DPAN' };

  for (const step of decidingPath(result)) {
    const n = byId.get(step.nodeId);
    if (!n) continue;
    if (n.type === 'EVENT_START') {
      if (gate && !skipStart) {
        stops.push({ place: gate, kind: 'GATE', nodeId: n.id, label: n.label, capability: null, durationMs: step.durationMs, note: 'The payment arrives.', facts: {}, weight: 1 });
      }
      continue;
    }
    if (n.type !== 'TASK' || !n.bankingCapability) continue;
    Object.assign(facts, step.factsWritten);
    const place = taskPlace(n.bankingCapability, payload, facts);
    stops.push({
      place,
      kind: 'WORK',
      nodeId: n.id,
      label: n.label,
      capability: n.bankingCapability,
      durationMs: step.durationMs,
      note: step.note ?? '',
      facts: { ...step.factsWritten },
      weight: 1,
    });
  }
  return { stops, facts, latencyMs: result.latencyMs, result };
}

/** The lines the run posts: those of the token that decided it. */
const ledgerOf = (result: RunResult) => postTestResult({ actualOutcome: result.outcome, tokens: [...result.tokens] });

const outcomePlace = (outcome: Outcome | 'NO_OUTCOME'): PlaceId => (outcome === 'APPROVED' ? 'OUT_APPROVED' : 'OUT_DECLINED');

function outcomeStop(outcome: Outcome | 'NO_OUTCOME', reason: string | null): Stop {
  const place = outcomePlace(outcome);
  return {
    place,
    kind: 'OUTCOME',
    nodeId: null,
    label: outcome === 'APPROVED' ? 'Approved' : 'Declined',
    capability: null,
    durationMs: 0,
    note: reason ? `Ended: ${outcome.toLowerCase().replace(/_/g, ' ')} (${reason}).` : `Ended: ${outcome.toLowerCase().replace(/_/g, ' ')}.`,
    facts: {},
    weight: 0,
  };
}

function finish(
  stops: Stop[],
  result: RunResult,
  facts: DerivedFacts,
  extra: { latencyMs: number; passes: number; decline: (outcome: Outcome | 'NO_OUTCOME') => DeclineReason | null },
): RoutePlan {
  const outcome = result.outcome === 'NO_OUTCOME' ? 'DECLINED' : result.outcome;
  const broken = result.outcome === 'NO_OUTCOME' || result.anomalies.length > 0;
  const all = [...stops, outcomeStop(result.outcome, result.reasonCode)];
  // The wire a payment takes between two stops has to exist on the map. The bundled diagrams never break this.
  const decline = outcome === 'APPROVED' ? null : (extra.decline(result.outcome) ?? (broken ? 'PROCESS_ERROR' : 'FUNDS'));
  return {
    stops: all,
    outcome,
    reasonCode: result.reasonCode,
    decline,
    latencyMs: extra.latencyMs,
    passes: extra.passes,
    heldCents: facts.authHoldMinor ?? 0,
    suspenseCents: 0,
    threeDs: facts.threeDsPath ?? null,
    bnpl: facts.bnplDecision ?? null,
    recon: facts.reconStatus ?? null,
    broken,
    ledger: ledgerOf(result),
  };
}

/** A route is valid when every hop is a wire on the map. Used by the tests, and cheap enough to keep as a guard. */
export function routeIsWired(stops: readonly Stop[]): boolean {
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    if (a.place !== b.place && !hasWire(a.place, b.place)) return false;
  }
  return true;
}

/** A person at the sidewalk machine: three tries at the PIN, then the notes (or a jam, or no money). Plain data, no diagram. */
function planAtm(customer: Customer): RoutePlan {
  const { payload } = customer;
  const session = customer.atm ?? { wrongPins: 0, knowsPin: true, jams: false };
  const amount = payload.amount;
  const pin = verifyPin(session.wrongPins, session.knowsPin);
  const step = (place: 'GATE_ATM' | 'ATM_CASH' | 'SUSPENSE', label: string, note: string, facts: Stop['facts'], weight: number, durationMs: number): Stop => ({
    place,
    kind: 'WORK',
    nodeId: null,
    label,
    capability: place === 'SUSPENSE' ? 'RECON_DESK' : null,
    durationMs,
    note,
    facts,
    weight,
  });
  const end = (place: 'OUT_APPROVED' | 'OUT_DECLINED' | 'OUT_SETTLED', label: string, note: string): Stop => ({ place, kind: 'OUTCOME', nodeId: null, label, capability: null, durationMs: 0, note, facts: {}, weight: 0 });
  const plan = (stops: Stop[], extra: Partial<RoutePlan> & Pick<RoutePlan, 'outcome' | 'reasonCode' | 'decline'>): RoutePlan => ({
    stops,
    latencyMs: stops.reduce((n, x) => n + x.durationMs, 0),
    passes: 1,
    heldCents: 0,
    suspenseCents: 0,
    threeDs: null,
    bnpl: null,
    recon: null,
    broken: false,
    ledger: [],
    ...extra,
  });

  const pinStop: Stop = { ...step('GATE_ATM', 'PIN verification', pin.note, { atmPin: pin.outcome }, pin.tries, 1800 * pin.tries), kind: 'GATE' };
  if (pin.outcome === 'LOCKED') {
    return plan([pinStop, end('OUT_DECLINED', 'Card kept', 'The machine locked the session and kept the card.')], { outcome: 'DECLINED', reasonCode: 'PIN_LOCKED', decline: 'PIN_LOCKED' });
  }

  if (session.deposit) {
    // Cash in: the machine counts and validates the notes, keeps them in its cassette and credits the account straight away.
    const intake = step('ATM_CASH', 'Cash intake', `The note validator counted ${formatAud(amount)} and accepted every note.`, { atmDispense: 'DEPOSITED' }, 1, 3200);
    return plan([pinStop, intake, end('OUT_APPROVED', 'Credited', `The customer's account was credited ${formatAud(amount)}.`)], { outcome: 'APPROVED', reasonCode: 'CASH_DEPOSITED', decline: null });
  }

  if (payload.availableBalance < amount) {
    const cash = step('ATM_CASH', 'Cash dispense', `Balance ${formatAud(payload.availableBalance)} is less than the ${formatAud(amount)} requested, so nothing is dispensed.`, { ledgerDecision: 'INSUFFICIENT_FUNDS' }, 0.5, 900);
    return plan([pinStop, cash, end('OUT_DECLINED', 'Declined', 'Not enough money in the account.')], { outcome: 'DECLINED', reasonCode: 'INSUFFICIENT_FUNDS', decline: 'FUNDS' });
  }

  const out = dispense(amount, session.jams);
  if (out.outcome === 'JAMMED') {
    const cash = step('ATM_CASH', 'Cash dispense', out.note, { ledgerDecision: 'SUFFICIENT', atmDispense: 'JAMMED' }, 1.5, 4200);
    const parked = step('SUSPENSE', 'Suspense account', `The customer was debited ${formatAud(amount)} but got no cash: parked in suspense until the ATM cash count proves the notes never came out.`, {}, 1, 0);
    return plan([pinStop, cash, parked, end('OUT_SETTLED', 'Refunded', 'The cash count agreed the notes never came out, so the customer was refunded.')], {
      outcome: 'ROUTED_TO_SUSPENSE',
      reasonCode: 'ATM_JAM',
      decline: null,
      suspenseCents: amount,
    });
  }
  if (out.outcome === 'REFUSED') {
    const cash = step('ATM_CASH', 'Cash dispense', out.note, { atmDispense: 'REFUSED' }, 0.5, 900);
    return plan([pinStop, cash, end('OUT_DECLINED', 'Declined', out.note)], { outcome: 'DECLINED', reasonCode: 'AMOUNT_NOT_PAYABLE', decline: 'PROCESS_ERROR' });
  }
  const cash = step('ATM_CASH', 'Cash dispense', out.note, { ledgerDecision: 'SUFFICIENT', atmDispense: 'DISPENSED' }, 1, 3000);
  return plan([pinStop, cash, end('OUT_APPROVED', 'Cash out', `${out.note} The customer was debited ${formatAud(amount)}.`)], { outcome: 'APPROVED', reasonCode: 'CASH_DISPENSED', decline: null });
}

export function planCheckout(customer: Customer, graphs: BankGraphs): RoutePlan {
  const { payload } = customer;

  switch (customer.kind) {
    case 'VIRTUAL': {
      const w = walk(graphs.virtual, payload, 'GATE_VIRTUAL');
      return finish(w.stops, w.result, w.facts, {
        latencyMs: w.latencyMs,
        passes: 1,
        decline: () => {
          if (w.facts.tokenStatus === undefined) return 'UNKNOWN_DPAN';
          if (w.facts.dcvvStatus === 'EXPIRED') return 'DCVV_EXPIRED';
          if (w.facts.dcvvStatus === 'MISMATCH') return 'DCVV_MISMATCH';
          return 'FUNDS';
        },
      });
    }

    case 'POS': {
      const w = walk(graphs.pos, payload, 'GATE_POS');
      return finish(w.stops, w.result, w.facts, { latencyMs: w.latencyMs, passes: 1, decline: () => 'FUNDS' });
    }

    case 'A2A': {
      // The first node of the diagram is the gateway itself, so the transfer arrives at the A2A gate and is worked there.
      const w = walk(graphs.a2a, payload, null);
      if (w.stops[0]) w.stops[0].kind = 'GATE';
      return finish(w.stops, w.result, w.facts, { latencyMs: w.latencyMs, passes: 1, decline: () => (w.facts.a2aValid === false ? 'A2A_INVALID' : 'FUNDS') });
    }

    case 'ATM':
      return planAtm(customer);

    case 'ONBOARD':
    case 'QR':
    case 'TELLER':
    case 'SWIFT':
    case 'DISPUTE':
      return planExtended(customer);

    case 'BNPL': {
      const w = walk(graphs.bnpl, payload, 'GATE_ECOM');
      return finish(w.stops, w.result, w.facts, {
        latencyMs: w.latencyMs,
        passes: 1,
        decline: () => (w.facts.bnplDecision === 'ELIGIBLE' ? 'DOWN_PAYMENT' : 'FUNDS'),
      });
    }

    case 'ECOM': {
      const first = walk(graphs.ecom, payload, 'GATE_ECOM');
      if (first.result.outcome !== 'CHALLENGE_REQUIRED') {
        return finish(first.stops, first.result, first.facts, {
          latencyMs: first.latencyMs,
          passes: 1,
          decline: () => (first.facts.threeDsPath === 'REJECT' ? 'THREE_DS_REJECT' : 'FUNDS'),
        });
      }
      // The customer is sent to their phone for a one-time code, then comes back and the diagram runs again.
      const otpDone = customer.otpCompletes;
      const returned: BankingPayload = { ...payload, challenge: { status: otpDone ? 'COMPLETED' : 'ABANDONED', method: 'OTP' } };
      const second = walk(graphs.ecom, returned, 'GATE_ECOM', true);
      const otp: Stop = {
        place: 'CUSTOMER_OTP',
        kind: 'OTP',
        nodeId: null,
        label: otpDone ? 'Customer enters the OTP' : 'Customer walks away',
        capability: null,
        durationMs: 0,
        note: otpDone ? 'The customer typed the one-time code from their phone.' : 'The customer never entered the one-time code.',
        facts: {},
        weight: 0,
      };
      const facts: DerivedFacts = { ...first.facts, ...second.facts };
      return finish([...first.stops, otp, ...second.stops], second.result, facts, {
        latencyMs: first.latencyMs + second.latencyMs,
        passes: 2,
        decline: () => {
          if (second.facts.threeDsPath === 'REJECT') return 'THREE_DS_REJECT';
          if (second.facts.threeDsPath === 'CHALLENGE_FAILED') return 'OTP_ABANDONED';
          return 'FUNDS';
        },
      });
    }
  }
}

/** One night-cycle record: batch clearing, Visa settlement, then the recon desk's verdict (and the suspense account on a break). */
export function planSettlement(payload: BankingPayload, graphs: BankGraphs): RoutePlan {
  const w = walk(graphs.settle, payload, null);
  const system = (place: StationId, label: string, note: string): Stop => ({ place, kind: 'SYSTEM', nodeId: null, label, capability: null, durationMs: 0, note, facts: {}, weight: 1 });
  const stops: Stop[] = [
    system('EOD_BATCH', 'Batch clearing', 'Added to tonight’s clearing file.'),
    system('EOD_VISA', 'Visa settlement', 'Presented to the card scheme and agreed in the net settlement.'),
    ...w.stops,
  ];
  const recon = w.facts.reconStatus ?? null;
  const matched = recon === 'MATCHED';
  const reconStop = stops.find((s) => s.place === 'RECON');
  const variance = reconStop?.facts.reconVarianceMinor ?? 0;
  const suspenseCents = matched ? 0 : recon === 'BREAK_AMOUNT' ? variance : payload.amount;

  // A break takes real work: someone has to classify it and post the suspense entry.
  if (reconStop && !matched) reconStop.weight = 4;

  if (!matched) {
    stops.push({
      place: 'SUSPENSE',
      kind: 'WORK',
      nodeId: null,
      label: 'Suspense account',
      capability: 'RECON_DESK',
      durationMs: 0,
      note: `Posted to suspense: ${w.result.reasonCode ?? 'unmatched'}.`,
      facts: {},
      weight: 1,
    });
  }
  stops.push({
    place: 'OUT_SETTLED',
    kind: 'OUTCOME',
    nodeId: null,
    label: matched ? 'Settled' : 'Cleared from suspense',
    capability: null,
    durationMs: 0,
    note: matched ? 'Settled.' : 'An ops clerk investigated and cleared the item.',
    facts: {},
    weight: 0,
  });

  return {
    stops,
    outcome: matched ? 'APPROVED' : 'ROUTED_TO_SUSPENSE',
    reasonCode: w.result.reasonCode,
    decline: null,
    latencyMs: w.latencyMs,
    passes: 1,
    heldCents: 0,
    suspenseCents,
    threeDs: null,
    bnpl: null,
    recon,
    broken: w.result.outcome === 'NO_OUTCOME' || w.result.anomalies.length > 0,
    ledger: ledgerOf(w.result),
  };
}
