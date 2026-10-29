/**
 * Turns one example payment into a step-by-step story for the Learning Hub.
 *
 * Nothing here decides anything. The payment is run through the same reference diagram the bank uses, with
 * the rules the learner has dialled in, and each node it visits becomes a step: the lesson's words say what
 * the node is for, the runner's own note says what it did to this payment.
 *
 * Two lessons visit boxes the diagram does not model. The 3DS challenge sends the customer to their phone and
 * back (the diagram then runs a second time), and the night cycle has a batch, a scheme file and a suspense
 * account around the reconciliation desk. Those appear as "synthetic" steps, with the same text structure.
 */

import { activeLocale } from '../i18n/localeCore';
import { noteText } from '../i18n/notesVi';
import { localLesson } from './learningVi';
import type { BankingPayload, DerivedFacts, ExecutionStep, Id, ProcessEdge, ProcessGraph, ProcessNode } from '../types/processLearning';
import { failCasesFor } from './failCases';
import { DECLINE_LABEL, formatMoney } from './kpis';
import { graphKeyOf, layoutFor, LESSONS, stepTextFor, type DiagramKind, type GraphKey, type Lesson, type LessonExample, type ProcessId, type StepText, type SyntheticNode } from './learning';
import { buildGraphs, decidingPath, planCheckout, planSettlement, runGraph, taskPlace } from './processes';
import { clampRules, DEFAULT_RULES, type BankRules } from './rules';
import type { PlaceId } from './topology';
import type { CheckoutKind, Customer } from './types';

export type StepTone = 'neutral' | 'good' | 'bad' | 'warn';

export interface WalkFact {
  label: string;
  value: string;
}

export interface WalkStep {
  index: number;
  /** The box on the diagram: a node of the process graph, or one of the lesson's synthetic boxes. */
  nodeId: string;
  /** The wire the payment came along. Null for the first step. */
  viaEdgeId: string | null;
  kind: DiagramKind;
  /** The desk on the bank map that does this work, if any. */
  place: PlaceId | null;
  /** 2 for the part after a 3DS challenge sent the customer away and back. */
  pass: 1 | 2;
  title: string;
  what: string;
  why: string;
  /** What this step did to this payment, from the runner. */
  happened: string;
  /** New things the bank learned at this step. */
  facts: WalkFact[];
  /** What can go wrong at this box (see failCases.ts). */
  fails: string[];
  tone: StepTone;
}

export interface WalkVerdict {
  /** ROUTED_TO_SUSPENSE also stands for any case that is held for a person to deal with: a report, a request for documents, a dispute still open. */
  outcome: 'APPROVED' | 'DECLINED' | 'ROUTED_TO_SUSPENSE';
  /** One short line: "Approved", "Declined: expired dCVV", "Parked in suspense: amount variance". */
  headline: string;
  /** What it means for the bank. */
  detail: string;
  tone: StepTone;
}

export interface Walkthrough {
  lessonId: ProcessId;
  exampleId: string;
  rules: BankRules;
  /** What the payment carries when it arrives. */
  carries: WalkFact[];
  steps: WalkStep[];
  verdict: WalkVerdict;
  /** True if the diagram itself failed (never, with the bundled diagrams). */
  broken: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

const lessonGraphs = new Map<string, ProcessGraph>();

/** The lesson's process diagram (or, for a chapter with two, the one named) with the bank's default dials. Its shape never depends on the rules. */
export function lessonGraph(lesson: Lesson, graphKey: GraphKey = lesson.graph): ProcessGraph {
  const key = `${lesson.id}|${graphKey}`;
  let graph = lessonGraphs.get(key);
  if (!graph) {
    graph = buildGraphs(DEFAULT_RULES)[graphKey];
    lessonGraphs.set(key, graph);
  }
  return graph;
}

/** The words on a wire: the lesson's own label, else the diagram's, else nothing. */
export function wireLabel(lesson: Lesson, edge: ProcessEdge, graphKey: GraphKey = lesson.graph): string | undefined {
  return layoutFor(lesson, graphKey).labels[edge.id] ?? edge.label ?? undefined;
}

const kindOfNode = (n: ProcessNode): DiagramKind => (n.type === 'EVENT_START' ? 'start' : n.type === 'EVENT_END' ? 'end' : n.type === 'TASK' ? 'task' : 'gateway');

const money = (cents: number): string => formatMoney(cents);

const cardName = (c: BankingPayload['cardType']): string => (c === 'VIRTUAL_DPAN' ? 'virtual card' : `${c.toLowerCase()} card`);

const DISPUTE_REASON_WORDS = { FRAUD: 'not mine (fraud)', GOODS_NOT_RECEIVED: 'never arrived', DUPLICATE_CHARGE: 'charged twice' } as const;
const DISPUTE_STAGE_WORDS = { NEW: 'new claim', RETRIEVAL_REQUEST: 'retrieval request', FIRST_CHARGEBACK: 'first chargeback', REPRESENTMENT: 'representment', PRE_ARBITRATION: 'pre-arbitration' } as const;

/** What the payment carries when it reaches the first desk. */
export function carriesOf(example: LessonExample): WalkFact[] {
  const p = example.payload;
  const out: WalkFact[] = [{ label: 'Amount', value: money(p.amount) }];
  switch (example.kind) {
    case 'VIRTUAL': {
      const vault = p.virtualCard?.vaultEntry;
      out.push({ label: 'Virtual card', value: p.virtualCard?.dpan ?? '—' });
      out.push({ label: 'Code typed', value: p.rawCvv });
      if (vault) out.push({ label: 'Code age', value: `${Math.round((p.clientTimestamp - vault.dcvvIssuedAt) / 1000)} s` });
      out.push({ label: 'Account holds', value: money(p.availableBalance) });
      break;
    }
    case 'ECOM':
      out.push({ label: 'Card', value: cardName(p.cardType) });
      out.push({ label: 'Risk score', value: String(p.riskScore) });
      out.push({ label: 'Account holds', value: money(p.availableBalance) });
      break;
    case 'BNPL':
      out.push({ label: 'Score', value: String(p.bnpl?.underwritingScore ?? '—') });
      if (p.bnpl) out.push({ label: 'Down payment', value: `${money(p.bnpl.downPaymentMinor)} (${Math.round((p.bnpl.downPaymentMinor / p.amount) * 100)}%)` });
      out.push({ label: 'Card holds', value: money(p.availableBalance) });
      break;
    case 'A2A': {
      const a = p.a2a;
      out.push({ label: 'Reference', value: a?.endToEndId ? a.endToEndId : 'missing' });
      out.push({ label: 'Sending bank', value: a?.debtorAgent ?? '—' });
      out.push({ label: 'Receiving bank', value: a?.creditorAgent ?? '—' });
      if (a && a.interbankSettlementAmount !== p.amount) out.push({ label: 'Banks will settle', value: money(a.interbankSettlementAmount) });
      out.push({ label: 'Account holds', value: money(p.availableBalance) });
      break;
    }
    case 'AML': {
      const a = p.aml;
      out.push({ label: 'Customer', value: a?.customer.name ?? '—' });
      out.push({ label: 'Born', value: a?.customer.dateOfBirth ?? '—' });
      out.push({ label: 'Nationality', value: a?.customer.nationality ?? '—' });
      out.push({ label: 'Cash deposits', value: a && a.cashDeposits.length > 0 ? `${a.cashDeposits.length} in ${a.lookbackDays} days` : 'none' });
      out.push({ label: 'Identity checks on file', value: String(a?.auditLog.filter((e) => e.dateOfBirth !== undefined).length ?? 0) });
      break;
    }
    case 'DISPUTE': {
      const d = p.dispute;
      out.push({ label: 'Claim', value: d ? DISPUTE_REASON_WORDS[d.reason] : '—' });
      out.push({ label: 'Stage', value: d ? DISPUTE_STAGE_WORDS[d.stage] : '—' });
      out.push({ label: 'Days since purchase', value: String(d?.daysSinceTransaction ?? '—') });
      out.push({ label: 'Merchant evidence', value: d ? d.merchantEvidence.toLowerCase() : '—' });
      break;
    }
    case 'SETTLEMENT': {
      const s = p.settlement;
      out.push({ label: 'Bank ledger', value: s?.ledgerAmount == null ? 'missing' : money(s.ledgerAmount) });
      out.push({ label: 'Scheme clearing', value: s?.clearingAmount == null ? 'missing' : money(s.clearingAmount) });
      out.push({ label: 'Acquirer report', value: s?.switchAmount == null ? 'missing' : money(s.switchAmount) });
      if ((s?.clearingPresentments ?? 1) > 1) out.push({ label: 'Presented', value: `${s?.clearingPresentments} times` });
      break;
    }
  }
  return out;
}

const REASON_WORDS: Record<string, string> = {
  SUSP_AMOUNT_VARIANCE: 'amount variance',
  SUSP_MISSING_LEG: 'missing leg',
  SUSP_DUPLICATE: 'duplicate',
};

/** The facts a step wrote, as short label/value pairs. */
function factsOf(written: Partial<DerivedFacts>): WalkFact[] {
  const out: WalkFact[] = [];
  const add = (label: string, value: string | number | boolean | undefined): void => {
    if (value !== undefined) out.push({ label, value: String(value) });
  };
  add('Token', written.tokenStatus);
  add('Funded by', written.fundingSource);
  add('Real card ends', written.fpanLast4);
  add('dCVV', written.dcvvStatus);
  add('3DS path', written.threeDsPath);
  if (written.liabilityShift !== undefined) add('Fraud liability', written.liabilityShift === 'ISSUER' ? 'issuer' : 'merchant');
  add('Ledger', written.ledgerDecision);
  if (written.authHoldMinor !== undefined) add('Hold placed', money(written.authHoldMinor));
  add('Reconciliation', written.reconStatus);
  if (written.reconVarianceMinor !== undefined) add('Largest gap', money(written.reconVarianceMinor));
  add('Underwriting', written.bnplDecision);
  if (written.a2aValid !== undefined) add('Message', written.a2aValid ? 'well formed' : 'has a flaw');
  add('Rail', written.a2aRail);
  add('Screening', written.amlStatus);
  add('Best name match', written.amlMatchScore);
  if (written.amlList !== undefined && written.amlList !== 'NONE') add('On list', written.amlList);
  if (written.amlStructuring !== undefined) add('Structuring', written.amlStructuring ? 'suspected' : 'none');
  add('Case verdict', written.caseVerdict?.replace('_', ' ').toLowerCase());
  add('Identity checks found', written.caseEvidenceCount);
  if (written.authenticated !== undefined) add('Authenticated', written.authenticated ? 'yes' : 'no');
  add('Filing window', written.disputeWindow?.toLowerCase());
  if (written.disputeLiability !== undefined) add('Liable', written.disputeLiability === 'ISSUER' ? 'the issuer' : 'the merchant');
  add('Next move', written.disputeNext?.replace(/_/g, ' ').toLowerCase());
  if (written.installment1Minor !== undefined) add('First instalment', money(written.installment1Minor));
  if (written.installmentAmountMinor !== undefined) add('Then 3 of', money(written.installmentAmountMinor));
  return out;
}

/** "dcvvStatus = 'VALID'." from the runner's gateway note, without the edge id that follows it. */
function gatewayReading(note: string | undefined): string {
  if (!note) return '';
  const cut = note.search(/\s(Took|No condition|Đi |Không điều kiện)/);
  return (cut === -1 ? note : note.slice(0, cut)).trim();
}

function describeWire(lesson: Lesson, graphKey: GraphKey, edge: ProcessEdge | undefined, note: string | undefined): string {
  const reading = gatewayReading(note);
  if (!edge) return reading;
  const label = wireLabel(lesson, edge, graphKey);
  const named = label ? `“${label}”` : 'this wire';
  const middle = edge.isDefault
    ? `Nothing else matched, so it took the default wire ${named}.`
    : `The rule ${edge.conditionExpression ? `(${edge.conditionExpression}) ` : ''}is true, so it took ${named}.`;
  return reading ? `${reading} ${middle}` : middle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Building the story
// ─────────────────────────────────────────────────────────────────────────────

function syntheticNode(lesson: Lesson, id: string): SyntheticNode {
  const found = lesson.layout.synthetic.find((s) => s.id === id);
  if (!found) throw new Error(`Lesson ${lesson.id} has no box ${id}`);
  return found;
}

const textFor = (lesson: Lesson, graphKey: GraphKey, id: string, fallbackTitle: string): StepText => stepTextFor(lesson, graphKey, id) ?? { title: fallbackTitle, what: '', why: '' };

/** What the last box of the chapter-5 and chapter-6 diagrams says happened, and how it reads. */
const END_NOTES: Partial<Record<GraphKey, Record<string, { happened: string; tone: StepTone }>>> = {
  a2a: {
    n_end_approved: { happened: 'The money leaves the account and the receiving bank is told yes. This cannot be called back.', tone: 'good' },
    n_end_invalid: { happened: 'The message is refused at the door, with the field at fault named. No money was touched.', tone: 'warn' },
    n_end_declined: { happened: 'The message was fine, but the account does not hold enough. The transfer is declined.', tone: 'bad' },
  },
  aml: {
    n_end_released: { happened: 'No name hit and no structuring. The payment is released.', tone: 'good' },
    n_end_cleared: { happened: 'The name was a near-miss and the audit log proves it. The payment is released, and the reason is kept for the auditors.', tone: 'good' },
    n_end_sar: { happened: 'No name hit, but the deposits were split to stay under the reporting line. A report is filed and the payment is parked.', tone: 'warn' },
    n_end_sanctions: { happened: 'The investigation found a true match on a sanctions list. The payment is blocked.', tone: 'bad' },
    n_end_edd: { happened: 'A true match on a politically-exposed-person list. The payment waits until the customer explains where the money comes from.', tone: 'warn' },
    n_end_escalate: { happened: 'The log could neither prove nor rule out a match. A senior analyst takes over and the payment waits.', tone: 'warn' },
  },
  dispute: {
    n_end_retrieval: { happened: 'A new claim. The bank asks the merchant for the receipt before anyone is out of pocket.', tone: 'neutral' },
    n_end_filed: { happened: 'The merchant sent nothing, so the bank files the first chargeback and credits the cardholder.', tone: 'warn' },
    n_end_represent: { happened: 'The merchant has answered, and the bank reviews whether the evidence is good enough.', tone: 'warn' },
    n_end_prearb: { happened: 'The bank rejects the merchant’s answer and escalates to pre-arbitration.', tone: 'warn' },
    n_end_refunded: { happened: 'The cardholder keeps the refund. The loss falls on the merchant.', tone: 'good' },
    n_end_absorbed: { happened: 'The purchase was authenticated, so the liability for fraud sits with the issuer. The bank refunds the cardholder and takes the loss.', tone: 'bad' },
    n_end_merchant: { happened: 'The merchant’s evidence was compelling. The credit is taken back from the cardholder.', tone: 'good' },
    n_end_barred: { happened: 'The claim was brought after the filing window closed. It is refused, whoever would have paid.', tone: 'neutral' },
  },
};

/** The id of the synthetic wire from one box to another, if the lesson has one. */
function linkBetween(lesson: Lesson, from: string, to: string): string | null {
  return lesson.layout.syntheticEdges.find((e) => e.from === from && e.to === to)?.id ?? null;
}

export function fraudNote(payload: BankingPayload, approved: boolean): { text: string; tone: StepTone } | null {
  if (payload.isFraud) {
    return approved
      ? { text: 'This payment was fraud, and the bank has just agreed to repay it.', tone: 'bad' }
      : { text: 'This payment was fraud, and the bank stopped it.', tone: 'good' };
  }
  return null;
}

/** The desk where the story of each diagram begins. */
const START_PLACE: Record<GraphKey, PlaceId | null> = {
  virtual: 'GATE_VIRTUAL',
  ecom: 'GATE_ECOM',
  bnpl: 'GATE_ECOM',
  settle: null,
  a2a: 'GATE_A2A',
  // The bank has no AML or dispute desk of its own on the floor: screening is done at the fraud and identity desk, and a dispute
  // starts there too, by looking up how the purchase was authenticated.
  aml: 'SEC_3DS',
  dispute: 'SEC_3DS',
};

function startNote(graphKey: GraphKey, payload: BankingPayload): string {
  switch (graphKey) {
    case 'settle':
      return 'The record arrives with its three amounts.';
    case 'a2a':
      return `A ${money(payload.amount)} transfer arrives as a pacs.008 message.`;
    case 'aml':
      return `A ${money(payload.amount)} payment is about to leave, sent by ${payload.aml?.customer.name ?? 'a customer'}.`;
    case 'dispute':
      return `The cardholder disputes a ${money(payload.amount)} purchase.`;
    default:
      return `A ${money(payload.amount)} payment arrives.`;
  }
}

export function buildWalkthrough(lessonId: ProcessId, exampleId: string, rulesIn: Partial<BankRules> = DEFAULT_RULES): Walkthrough {
  // The lesson's words in the active language; its diagram, payloads and dials are the same in every language.
  const lesson = localLesson(LESSONS[lessonId]);
  const example = lesson.examples.find((e) => e.id === exampleId) ?? lesson.examples[0];
  if (!example) throw new Error(`Lesson ${lessonId} has no examples`);
  const rules = clampRules(rulesIn);
  const graphs = buildGraphs(rules);
  const graphKey = graphKeyOf(lesson, example);
  const graph = graphs[graphKey];
  const byId = new Map<Id, ProcessNode>(graph.nodes.map((n) => [n.id, n]));
  const edgeById = new Map<Id, ProcessEdge>(graph.edges.map((e) => [e.id, e]));
  const payload = example.payload;
  const steps: WalkStep[] = [];
  const facts: DerivedFacts = { isVirtual: payload.cardType === 'VIRTUAL_DPAN' };

  const push = (s: Omit<WalkStep, 'index' | 'fails'>): void => {
    steps.push({ ...s, index: steps.length, fails: failCasesFor(lessonId, s.nodeId) });
  };

  /** Adds one box that is not in the process graph. */
  const addSynthetic = (id: string, happened: string, over: Partial<Pick<WalkStep, 'pass' | 'tone' | 'facts'>> = {}): void => {
    const box = syntheticNode(lesson, id);
    const prev = steps[steps.length - 1];
    push({
      nodeId: id,
      viaEdgeId: prev ? linkBetween(lesson, prev.nodeId, id) : null,
      kind: box.kind,
      place: box.place,
      pass: over.pass ?? 1,
      ...textFor(lesson, graphKey, id, box.label),
      happened,
      facts: over.facts ?? [],
      tone: over.tone ?? 'neutral',
    });
  };

  /** Adds every node the diagram ran for one pass. */
  const addRun = (runPayload: BankingPayload, pass: 1 | 2): { outcome: string; reason: string | null; finalFacts: DerivedFacts } => {
    const result = runGraph(graph, runPayload);
    const path: ExecutionStep[] = decidingPath(result);
    const finalFacts: DerivedFacts = { ...facts };
    const outcomeApproved = result.outcome === 'APPROVED';
    let emitted = 0;

    path.forEach((raw, i) => {
      const node = byId.get(raw.nodeId);
      if (!node) return;
      if (pass === 2 && node.type === 'EVENT_START') return;
      const kind = kindOfNode(node);
      const text = textFor(lesson, graphKey, node.id, node.label);
      Object.assign(finalFacts, raw.factsWritten);
      const prev = steps[steps.length - 1];
      // The first box of a run arrives along a wire the lesson draws itself when the box before it is not in the graph.
      const viaEdgeId = emitted === 0 ? (prev ? linkBetween(lesson, prev.nodeId, node.id) : null) : raw.viaEdgeId;
      emitted += 1;

      let happened = raw.note ?? '';
      let tone: StepTone = 'neutral';
      let place: PlaceId | null = null;

      if (kind === 'start') {
        place = START_PLACE[graphKey];
        happened = startNote(graphKey, runPayload);
      } else if (kind === 'task' && node.bankingCapability) {
        place = taskPlace(node.bankingCapability, runPayload, finalFacts);
        if (raw.factsWritten.reconStatus === 'MATCHED') tone = 'good';
        else if (raw.factsWritten.reconStatus) tone = 'warn';
        else if (raw.factsWritten.dcvvStatus && raw.factsWritten.dcvvStatus !== 'VALID') tone = 'bad';
        else if (raw.factsWritten.threeDsPath === 'CHALLENGE' || raw.factsWritten.threeDsPath === 'CHALLENGE_FAILED') tone = 'warn';
        else if (raw.factsWritten.threeDsPath === 'REJECT') tone = 'bad';
        else if (raw.factsWritten.bnplDecision === 'INELIGIBLE') tone = 'warn';
        else if (raw.factsWritten.ledgerDecision && raw.factsWritten.ledgerDecision !== 'SUFFICIENT') tone = 'bad';
        else if (raw.factsWritten.ledgerDecision === 'SUFFICIENT') tone = 'good';
        else if (raw.factsWritten.a2aValid !== undefined) tone = raw.factsWritten.a2aValid ? 'good' : 'bad';
        else if (raw.factsWritten.caseVerdict) tone = raw.factsWritten.caseVerdict === 'FALSE_POSITIVE' ? 'good' : raw.factsWritten.caseVerdict === 'TRUE_MATCH' ? 'bad' : 'warn';
        else if (raw.factsWritten.amlStatus) tone = raw.factsWritten.amlStatus === 'CLEAR' ? 'good' : 'warn';
        else if (raw.factsWritten.disputeWindow) tone = raw.factsWritten.disputeWindow === 'EXPIRED' ? 'bad' : raw.factsWritten.disputeLiability === 'ISSUER' ? 'warn' : 'neutral';
        if (raw.note?.startsWith('Raised TOKEN_NOT_FOUND')) {
          tone = 'bad';
          happened = 'The vault has never issued this virtual card number. It raises an error, and the error wire takes the payment straight to Declined.';
        }
      } else if (kind === 'gateway') {
        const next = path[i + 1];
        happened = describeWire(lesson, graphKey, next?.viaEdgeId ? edgeById.get(next.viaEdgeId) : undefined, raw.note);
      } else if (kind === 'end') {
        const own = END_NOTES[graphKey]?.[node.id];
        if (own) {
          tone = own.tone;
          happened = own.happened;
        } else if (result.outcome === 'CHALLENGE_REQUIRED') {
          tone = 'warn';
          happened = 'This run ends here: the customer is sent to their phone. The diagram will run again when they come back.';
        } else if (graphKey === 'settle') {
          const matched = result.outcome === 'APPROVED';
          tone = matched ? (example.realError ? 'bad' : 'good') : example.realError ? 'warn' : 'bad';
          happened = matched
            ? example.realError
              ? 'Settled. But there was a real mistake in these records, and the tolerance matched it away. Nobody will ever look at it.'
              : 'Settled. The records agree within the tolerance.'
            : example.realError
              ? `Parked in suspense (${REASON_WORDS[result.reasonCode ?? ''] ?? 'unmatched'}). A real mistake, correctly kept out of the settled pile.`
              : 'Parked in suspense, though the difference was only rounding dust. Someone will spend time on nothing.';
        } else {
          const fraud = fraudNote(runPayload, outcomeApproved);
          tone = fraud ? fraud.tone : outcomeApproved ? 'good' : 'bad';
          happened = `${outcomeApproved ? 'The hold is in place and the shop is told yes.' : 'The shop is told no.'}${fraud ? ` ${fraud.text}` : ''}`;
        }
      }

      push({
        nodeId: node.id,
        viaEdgeId,
        kind,
        place,
        pass,
        title: text.title,
        what: text.what,
        why: text.why,
        happened,
        facts: factsOf(raw.factsWritten),
        tone,
      });
    });

    Object.assign(facts, finalFacts);
    return { outcome: result.outcome, reason: result.reasonCode, finalFacts };
  };

  // ── Lesson-specific shape ──────────────────────────────────────────────────
  // Only the four checkout diagrams are planned across the floor; the other kinds never reach planCheckout.
  const checkoutKind: CheckoutKind = example.kind === 'VIRTUAL' || example.kind === 'ECOM' || example.kind === 'BNPL' || example.kind === 'A2A' ? example.kind : 'POS';
  const customer: Customer = { id: payload.txId, kind: checkoutKind, scenario: '', minute: 0, payload, otpCompletes: example.otpCompletes ?? false };

  let verdict: WalkVerdict;
  let broken = false;

  if (example.kind === 'SETTLEMENT') {
    const s = payload.settlement;
    addSynthetic('syn_batch', `This ${money(payload.amount)} payment is added to tonight’s clearing file.`);
    addSynthetic('syn_visa', s?.clearingAmount == null ? 'The scheme has no clearing record for this payment.' : `The scheme’s own record says ${money(s.clearingAmount)}${(s.clearingPresentments ?? 1) > 1 ? `, presented ${s.clearingPresentments} times` : ''}.`);
    const run = addRun(payload, 1);
    const plan = planSettlement(payload, graphs);
    broken = plan.broken;
    if (plan.outcome !== 'APPROVED') {
      const parked = plan.suspenseCents;
      addSynthetic('syn_suspense', `${money(parked)} is parked in the suspense account${run.reason ? ` (${REASON_WORDS[run.reason] ?? run.reason})` : ''}.`, { tone: 'warn' });
      addSynthetic('syn_cleared', 'On the next working day an ops clerk investigates and clears the item.');
      verdict = {
        outcome: 'ROUTED_TO_SUSPENSE',
        headline: `Parked in suspense: ${REASON_WORDS[run.reason ?? ''] ?? 'unmatched'}`,
        detail: example.realError ? 'A real mistake, caught. It costs a clerk’s time, which is what the suspense account is for.' : 'The difference was only dust. This is a false break: work for no reason.',
        tone: example.realError ? 'warn' : 'bad',
      };
    } else {
      verdict = {
        outcome: 'APPROVED',
        headline: 'Settled',
        detail: example.realError ? 'The records disagreed, but the tolerance was wide enough to match the mistake away.' : 'The three records agree within the tolerance.',
        tone: example.realError ? 'bad' : 'good',
      };
    }
  } else if (example.kind === 'A2A') {
    addRun(payload, 1);
    const plan = planCheckout(customer, graphs);
    broken = plan.broken;
    verdict = transferVerdict(plan.outcome === 'APPROVED', plan.decline === 'A2A_INVALID');
  } else if (example.kind === 'AML' || example.kind === 'DISPUTE') {
    const run = addRun(payload, 1);
    verdict = caseVerdict(example.kind, run.outcome, run.reason);
  } else if (example.kind === 'ECOM') {
    const first = addRun(payload, 1);
    const plan = planCheckout(customer, graphs);
    broken = plan.broken;
    if (first.outcome === 'CHALLENGE_REQUIRED') {
      const done = customer.otpCompletes;
      addSynthetic('syn_phone', done ? 'The customer types the code. The payment comes back marked “challenge completed”.' : 'The customer never types the code. The payment comes back marked “challenge abandoned”.', { tone: done ? 'good' : 'bad' });
      addRun({ ...payload, challenge: { status: done ? 'COMPLETED' : 'ABANDONED', method: 'OTP' } }, 2);
    }
    verdict = checkoutVerdict(plan, payload);
  } else {
    addRun(payload, 1);
    const plan = planCheckout(customer, graphs);
    broken = plan.broken;
    verdict = checkoutVerdict(plan, payload);
  }

  const walk: Walkthrough = { lessonId, exampleId: example.id, rules, carries: carriesOf(example), steps, verdict, broken };
  return activeLocale() === 'vi' ? localizeWalk(walk) : walk;
}

/**
 * The walkthrough in Vietnamese: the engine's and the builder's sentences rebuilt by noteText. Fact and carry labels stay in
 * English on purpose (the quizzes look them up by label); the screen translates them as it draws them.
 */
function localizeWalk(w: Walkthrough): Walkthrough {
  return {
    ...w,
    steps: w.steps.map((s) => ({ ...s, happened: noteText(s.happened) })),
    verdict: { ...w.verdict, headline: noteText(w.verdict.headline), detail: noteText(w.verdict.detail) },
  };
}

function transferVerdict(approved: boolean, invalid: boolean): WalkVerdict {
  if (approved) return { outcome: 'APPROVED', headline: 'Released', detail: 'The transfer is final: the money has left the account and the bank earns a small fee. There is no night cycle to catch a mistake.', tone: 'good' };
  if (invalid) return { outcome: 'DECLINED', headline: 'Rejected: invalid message', detail: 'Refused at the door, before any money was touched. The sending app is told which field to fix.', tone: 'warn' };
  return { outcome: 'DECLINED', headline: 'Declined: not enough money', detail: 'The message was fine. The customer’s balance is not the bank’s fault, and nothing the bank’s rules could change.', tone: 'bad' };
}

const CASE_ENDS: Record<string, { headline: string; detail: string; tone: StepTone; outcome: WalkVerdict['outcome'] }> = {
  PAYMENT_RELEASED: { headline: 'Released', detail: 'A clean customer, and the best screening is the kind they never notice.', tone: 'good', outcome: 'APPROVED' },
  CLEARED_FALSE_POSITIVE: { headline: 'Cleared: false positive', detail: 'The name looked like a sanctioned person’s, and the bank’s own evidence proved it was not. The customer is kept and the audit trail says why.', tone: 'good', outcome: 'APPROVED' },
  SAR_STRUCTURING: { headline: 'Reported: structuring', detail: 'Splitting deposits to stay under the reporting line is an offence in itself, even when the money is clean.', tone: 'warn', outcome: 'ROUTED_TO_SUSPENSE' },
  SANCTIONS_BLOCK: { headline: 'Blocked: sanctions match', detail: 'A confirmed match on a sanctions list. Dealing with a sanctioned person is illegal, so the payment stops here.', tone: 'bad', outcome: 'DECLINED' },
  EDD_SOURCE_OF_FUNDS: { headline: 'Held: source of funds requested', detail: 'A politically exposed person is risky, not forbidden. The bank asks where the money comes from.', tone: 'warn', outcome: 'ROUTED_TO_SUSPENSE' },
  EDD_ESCALATION: { headline: 'Escalated: enhanced due diligence', detail: 'The evidence could neither prove nor rule out a match, so a senior analyst takes over.', tone: 'warn', outcome: 'ROUTED_TO_SUSPENSE' },
  RETRIEVAL_REQUESTED: { headline: 'Receipt requested from the merchant', detail: 'The first move on a new claim. Most disputes end here, when the merchant proves delivery.', tone: 'neutral', outcome: 'ROUTED_TO_SUSPENSE' },
  CHARGEBACK_FILED: { headline: 'First chargeback filed', detail: 'The cardholder is credited at once. Who ends up paying is decided in the next stages.', tone: 'warn', outcome: 'ROUTED_TO_SUSPENSE' },
  REPRESENTMENT_REVIEW: { headline: 'Representment under review', detail: 'The merchant has fought back, and the bank decides whether the evidence is enough.', tone: 'warn', outcome: 'ROUTED_TO_SUSPENSE' },
  PRE_ARB_ESCALATED: { headline: 'Escalated to pre-arbitration', detail: 'The last chance to settle before the card scheme has to rule.', tone: 'warn', outcome: 'ROUTED_TO_SUSPENSE' },
  CARDHOLDER_REFUNDED: { headline: 'Cardholder refunded', detail: 'The loss falls on the merchant, who gave no answer or none good enough.', tone: 'good', outcome: 'APPROVED' },
  ISSUER_ABSORBS: { headline: 'Issuer absorbs the loss', detail: 'The purchase was authenticated with 3-D Secure, so the liability for fraud shifted to the issuer. The merchant did everything the scheme asks.', tone: 'bad', outcome: 'APPROVED' },
  MERCHANT_WON: { headline: 'Merchant won', detail: 'Compelling evidence keeps the sale, and the cardholder’s provisional credit is taken back.', tone: 'good', outcome: 'DECLINED' },
  TIME_BARRED: { headline: 'Time-barred', detail: 'A claim that is out of time is dead, whoever would have paid.', tone: 'neutral', outcome: 'DECLINED' },
};

function caseVerdict(kind: 'AML' | 'DISPUTE', outcome: string, reason: string | null): WalkVerdict {
  const found = CASE_ENDS[reason ?? ''];
  if (found) return found;
  return { outcome: outcome === 'APPROVED' ? 'APPROVED' : outcome === 'DECLINED' ? 'DECLINED' : 'ROUTED_TO_SUSPENSE', headline: kind === 'AML' ? 'Screened' : 'Dispute decided', detail: '', tone: 'neutral' };
}

/** "Expired dCVV" becomes "expired dCVV", but "OTP never typed" and "3DS rejected" keep their capitals. */
const lowerFirst = (text: string): string => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

function checkoutVerdict(plan: ReturnType<typeof planCheckout>, payload: BankingPayload): WalkVerdict {
  if (plan.outcome === 'APPROVED') {
    const fraud = fraudNote(payload, true);
    const how = plan.bnpl === 'ELIGIBLE' ? 'Approved: Pay-in-4' : plan.reasonCode === 'CARD_FALLBACK' ? 'Approved: paid in full by card' : 'Approved';
    return {
      outcome: 'APPROVED',
      headline: how,
      detail: fraud ? fraud.text : plan.reasonCode === 'BNPL_PAY_IN_4' ? 'A plan is live: the bank earns a fee and carries the risk of the unpaid instalments.' : 'A genuine sale, approved.',
      tone: fraud ? 'bad' : 'good',
    };
  }
  const why = plan.decline ? DECLINE_LABEL[plan.decline] : 'Declined';
  const fraud = fraudNote(payload, false);
  const ruleDecline = plan.decline === 'DCVV_EXPIRED' || plan.decline === 'DCVV_MISMATCH' || plan.decline === 'THREE_DS_REJECT' || plan.decline === 'OTP_ABANDONED';
  return {
    outcome: 'DECLINED',
    headline: `Declined: ${lowerFirst(why)}`,
    detail: fraud ? fraud.text : ruleDecline ? 'A genuine customer was turned away by a rule. That is a lost sale and an unhappy customer.' : 'The customer could not pay, or the card was not valid. Nothing the bank’s rules could have done differently.',
    tone: fraud ? 'good' : ruleDecline ? 'warn' : 'bad',
  };
}
