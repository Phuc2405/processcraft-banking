/**
 * The Build Lab guided tour, as data.
 *
 * A tour takes one diagram and one test payment, runs them through the same process runner the grader uses, and turns the
 * path the payment took into steps: one per box, each with what the box does (from the copy table) and what it did to this
 * payment (from the runner's own notes). At every decision gateway it builds a question whose right answer is the wire the
 * runner actually took, so a question can never disagree with the simulation.
 *
 * Nothing here decides anything and nothing here draws anything. The tour store (store/labTourStore.ts) steps the canvas;
 * the components (components/education/LabWalkthrough.tsx) show it.
 */

import { capabilityText, endText, factLabel, gatewayText, labUi, outcomeText, startText } from '../data/labTourCopy';
import { CONDITION_VARIABLES, NODE_CATALOG } from '../data/seedChallenges';
import { formatAud } from '../engine/money';
import { labLabel } from '../i18n/labText';
import { activeLocale, tr } from '../i18n/locale';
import { noteText } from '../i18n/notesVi';
import { pacs008From, pacs008Xml, type Rail } from '../engine/iso20022';
import { postTestResult } from '../engine/postings';
import { ProcessRunner, type RunResult } from '../engine/processRunner';
import type {
  BankingCapability,
  BankingPayload,
  ChallengeLevel,
  DerivedFacts,
  GLEntry,
  Id,
  Outcome,
  ProcessEdge,
  ProcessGraph,
  ProcessNode,
  SimulationToken,
  TestCase,
} from '../types/processLearning';
import type { GraphSpotlight, SpotState } from '../store/workflowStore';

export type StepTone = 'neutral' | 'good' | 'bad' | 'warn';
export type StepKind = 'start' | 'task' | 'gateway' | 'end';
export type TourSource = 'example' | 'mine';

export interface TourFact {
  label: string;
  value: string;
}

export interface LabStep {
  index: number;
  nodeId: Id;
  /** The wire the payment came along. Null for the first step. */
  viaEdgeId: Id | null;
  kind: StepKind;
  capability: BankingCapability | null;
  title: string;
  what: string;
  why: string;
  /** What this box did to this payment, from the runner. */
  happened: string;
  /** New things the bank learned at this box. */
  facts: TourFact[];
  fails: string[];
  tone: StepTone;
  /** Everything the payment knew when it arrived at this box: the facts the desks before it had written. */
  factsBefore: DerivedFacts;
  /** The bank-to-bank message at this box, as the XML a gateway would see. Only on the Start event and the A2A gateway. */
  message?: { title: string; xml: string };
  /** On an End event: how the payment ended. */
  outcome?: Outcome;
  reasonCode?: string | null;
}

export interface TourVerdict {
  outcome: Outcome | 'NO_OUTCOME';
  reasonCode: string | null;
  headline: string;
  detail: string;
  tone: StepTone;
  /** Did the payment end the way the test expects? */
  matchesExpected: boolean;
}

export interface LabTour {
  levelId: Id;
  testId: Id;
  testName: string;
  source: TourSource;
  graph: ProcessGraph;
  /** The token whose journey the steps follow: the one that decided the outcome. Null when nothing ran. */
  tokenId: Id | null;
  /** The payment being followed, kept so a question can quote its numbers. */
  payload: BankingPayload;
  /** What the payment carries when it arrives. */
  carries: TourFact[];
  steps: LabStep[];
  verdict: TourVerdict;
  /** The lines the payment posted to the general ledger. Empty when it moved no money. */
  ledger: GLEntry[];
  /** Why this diagram cannot be walked to the end, or null when it can. */
  problem: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Words for values
// ─────────────────────────────────────────────────────────────────────────────

const MONEY_FACTS: ReadonlySet<string> = new Set(['amount', 'availableBalance', 'creditLimit', 'authHoldMinor', 'reconVarianceMinor', 'installment1Minor', 'installmentAmountMinor']);

/** Words that are spelled out in a code ("SUSP_FX_LOSS") and the way a person writes them. */
const WORD_FIXES: Readonly<Record<string, string>> = { susp: 'suspense', ofac: 'OFAC', pep: 'PEP', rtgs: 'RTGS', fx: 'FX', aml: 'AML', a2a: 'A2A', otp: 'OTP', bnpl: 'BNPL', kyc: 'KYC', '3ds': '3DS' };

/** "SUSP_FX_LOSS" -> "suspense FX loss": a code read as a person would say it. */
export function plainWords(code: string): string {
  return code
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((w) => WORD_FIXES[w] ?? w)
    .join(' ');
}

/** "ledgerDecision" -> money? number? word? The one place a fact becomes text. */
export function valueText(name: string, value: unknown): string {
  if (value === undefined || value === null) return tr({ en: 'not set', vi: 'chưa đặt' });
  if (typeof value === 'boolean') return value ? tr({ en: 'yes', vi: 'có' }) : tr({ en: 'no', vi: 'không' });
  if (typeof value === 'number') {
    if (MONEY_FACTS.has(name)) return formatAud(value);
    if (name === 'downPaymentPct') return `${value}%`;
    if (name === 'amlMatchScore') return tr({ en: `${value} out of 100`, vi: `${value}/100` });
    return String(value);
  }
  const words = plainWords(String(value));
  return activeLocale() === 'vi' ? (VALUE_WORDS_VI[words] ?? words) : words;
}

/** The values a fact can take, as a Vietnamese reader would say them. Keyed by the English words plainWords gives. */
const VALUE_WORDS_VI: Readonly<Record<string, string>> = {
  valid: 'hợp lệ',
  expired: 'hết hạn',
  mismatch: 'không khớp',
  'not applicable': 'không áp dụng',
  resolved: 'đã tra được',
  suspended: 'tạm ngưng',
  debit: 'ghi nợ',
  credit: 'tín dụng',
  prepaid: 'trả trước',
  frictionless: 'không ma sát',
  challenge: 'thử thách',
  'challenge passed': 'đã qua thử thách',
  'challenge failed': 'thử thách thất bại',
  reject: 'từ chối',
  issuer: 'ngân hàng phát hành',
  merchant: 'cửa hàng',
  sufficient: 'đủ',
  'insufficient funds': 'không đủ tiền',
  'over limit': 'vượt hạn mức',
  matched: 'khớp',
  'break amount': 'sai lệch số tiền',
  'break missing leg': 'sai lệch thiếu vế',
  'break duplicate': 'sai lệch trùng lặp',
  eligible: 'đủ điều kiện',
  ineligible: 'không đủ điều kiện',
  'fx rate': 'tỷ giá',
  unexplained: 'không giải thích được',
  gain: 'lãi',
  loss: 'lỗ',
  instant: 'tức thì',
  priority: 'ưu tiên',
  normal: 'thường',
  open: 'mở',
  congested: 'nghẽn',
  shortfall: 'thiếu hụt',
  clear: 'sạch',
  structuring: 'chia nhỏ giao dịch',
  'pep hit': 'trùng PEP',
  'sanction hit': 'trùng cấm vận',
  none: 'không có',
  'false positive': 'cảnh báo sai',
  'true match': 'trùng thật',
  inconclusive: 'chưa kết luận',
  'retrieval request': 'yêu cầu chứng từ',
  'first chargeback': 'tra soát lần đầu',
  representment: 'phản hồi của cửa hàng',
  'pre arbitration': 'tiền trọng tài',
  'resolved cardholder': 'chủ thẻ thắng',
  'resolved merchant': 'cửa hàng thắng',
  pos: 'POS',
  ecommerce: 'thương mại điện tử',
  'mobile wallet': 'ví di động',
  'in app': 'trong ứng dụng',
  'virtual dpan': 'thẻ ảo (DPAN)',
};

/** The facts a desk wrote, as label and value, in the order the catalog lists them. */
function factsOf(written: Partial<DerivedFacts>): TourFact[] {
  const out: TourFact[] = [];
  const known = new Set(CONDITION_VARIABLES.filter((v) => v.source === 'DERIVED' && v.learnerVisible).map((v) => v.name));
  for (const [name, value] of Object.entries(written)) {
    if (value === undefined || !known.has(name)) continue;
    out.push({ label: factLabel(name), value: valueText(name, value) });
  }
  return out;
}

/** What the payment carries when it reaches the first box. */
export function carriesOf(p: Readonly<BankingPayload>): TourFact[] {
  const out: TourFact[] = [{ label: 'Amount', value: formatAud(p.amount) }];
  const add = (label: string, value: string): void => void out.push({ label, value });

  if (p.a2a) {
    add('Payment reference', p.a2a.endToEndId || 'missing');
    add('From bank', p.a2a.debtorAgent);
    add('To bank', p.a2a.creditorAgent);
    add('Purpose', p.a2a.purposeCode === 'SALA' ? 'payroll' : p.a2a.purposeCode === 'SUPP' ? 'supplier payment' : p.a2a.purposeCode.toLowerCase());
    return out;
  }
  if (p.aml) {
    add('Customer', p.aml.customer.name);
    add('Born', p.aml.customer.dateOfBirth);
    if (p.aml.customer.vip) add('Status', 'VIP client');
    if (p.aml.cashDeposits.length > 0) add('Cash deposits', `${p.aml.cashDeposits.length} in ${p.aml.lookbackDays} days`);
    return out;
  }
  if (p.dispute) {
    add('Claim', plainWords(p.dispute.reason));
    add('Purchase was', `${p.dispute.daysSinceTransaction} days ago`);
    add('Stage', p.dispute.stage === 'NEW' ? 'new claim' : plainWords(p.dispute.stage));
    add('Merchant evidence', p.dispute.merchantEvidence.toLowerCase());
    if (p.riskScore !== undefined) add('Risk score', String(p.riskScore));
    return out;
  }
  if (p.settlement) {
    const leg = (v: number | null): string => (v === null ? 'missing' : formatAud(v));
    add('Bank ledger', leg(p.settlement.ledgerAmount));
    add('Scheme clearing', leg(p.settlement.clearingAmount));
    add('Shop’s bank', leg(p.settlement.switchAmount));
    if (p.settlement.clearingPresentments > 1) add('Presented', `${p.settlement.clearingPresentments} times`);
    if (p.settlement.fx) add('Currency', p.settlement.fx.currency);
    return out;
  }
  if (p.virtualCard) {
    add('Virtual card', p.virtualCard.dpan);
    add('Code typed', p.rawCvv);
    const vault = p.virtualCard.vaultEntry;
    if (vault) add('Code age', `${Math.round((p.clientTimestamp - vault.dcvvIssuedAt) / 1000)} s`);
  } else {
    add('Card', p.cardType === 'VIRTUAL_DPAN' ? 'virtual card' : `${p.cardType.toLowerCase()} card`);
  }
  if (p.recentAttempts !== undefined) add('Attempts in 10 min', String(p.recentAttempts));
  if (p.channel === 'ECOMMERCE') add('Risk score', String(p.riskScore));
  if (p.bnpl) {
    add('Score', String(p.bnpl.underwritingScore));
    add('Down payment', `${formatAud(p.bnpl.downPaymentMinor)} (${Math.round((p.bnpl.downPaymentMinor / p.amount) * 100)}%)`);
  }
  add('Customer can spend', formatAud(p.availableBalance));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the run
// ─────────────────────────────────────────────────────────────────────────────

const kindOf = (n: ProcessNode): StepKind => (n.type === 'EVENT_START' ? 'start' : n.type === 'EVENT_END' ? 'end' : n.type === 'TASK' ? 'task' : 'gateway');

/** What a wire is called in a sentence: its label, or where it leads. */
function wireName(graph: ProcessGraph, edge: ProcessEdge): string {
  if (edge.label) return `“${edge.label}”`;
  const target = graph.nodes.find((n) => n.id === edge.targetNodeId);
  return target ? tr({ en: `the wire to “${target.label}”`, vi: `dây tới “${labLabel(target.label)}”` }) : tr({ en: 'the wire', vi: 'dây này' });
}

/**
 * What a decision read and which wire it took, in a sentence or two. The facts come from what the desks before it wrote and
 * from the payment itself, not from the runner's note, so the words are the learner's ("Ledger: insufficient funds").
 */
function describeDecision(graph: ProcessGraph, node: ProcessNode, taken: ProcessEdge | undefined, facts: DerivedFacts, payload: BankingPayload): string {
  const out = graph.edges.filter((e) => e.sourceNodeId === node.id);
  const read = variablesRead(out).map((n) => `${factLabel(n)}: ${valueText(n, readVariable(n, facts, payload))}`);
  const reading = read.length > 0 ? `${read.join(', ')}.` : '';
  if (!taken) return reading;
  const name = wireName(graph, taken);
  const middle = taken.isDefault
    ? tr({ en: `No other rule matched, so it took the default wire, ${name}.`, vi: `Không quy tắc nào khác khớp, nên nó đi dây mặc định, ${name}.` })
    : tr({ en: `The rule ${taken.conditionExpression ?? 'on this wire'} is true, so it took ${name}.`, vi: `Quy tắc ${taken.conditionExpression ?? 'trên dây này'} đúng, nên nó đi ${name}.` });
  return reading ? `${reading} ${middle}` : middle;
}

function toneOfFacts(w: Partial<DerivedFacts>): StepTone {
  if (w.reconStatus === 'MATCHED') return 'good';
  if (w.reconStatus) return 'warn';
  if (w.dcvvStatus && w.dcvvStatus !== 'VALID') return 'bad';
  if (w.threeDsPath === 'CHALLENGE' || w.threeDsPath === 'CHALLENGE_FAILED') return 'warn';
  if (w.threeDsPath === 'REJECT') return 'bad';
  if (w.bnplDecision === 'INELIGIBLE') return 'warn';
  if (w.ledgerDecision && w.ledgerDecision !== 'SUFFICIENT') return 'bad';
  if (w.ledgerDecision === 'SUFFICIENT') return 'good';
  if (w.a2aValid === false) return 'bad';
  if (w.a2aLiquidity === 'SHORTFALL' || w.a2aQueue === 'CONGESTED') return 'warn';
  if (w.a2aValid === true) return 'good';
  if (w.amlStatus === 'SANCTION_HIT') return 'bad';
  if (w.amlStatus === 'PEP_HIT' || w.amlStatus === 'STRUCTURING') return 'warn';
  if (w.amlStatus === 'CLEAR') return 'good';
  if (w.caseVerdict === 'FALSE_POSITIVE') return 'good';
  if (w.caseVerdict === 'TRUE_MATCH') return 'bad';
  if (w.caseVerdict === 'INCONCLUSIVE') return 'warn';
  if (w.disputeWindow === 'EXPIRED') return 'bad';
  if (w.disputeLiability === 'ISSUER') return 'warn';
  if (w.disputeNext) return 'neutral';
  return 'neutral';
}

const toneOfOutcome = (o: Outcome | 'NO_OUTCOME'): StepTone => (o === 'APPROVED' ? 'good' : o === 'DECLINED' ? 'bad' : o === 'NO_OUTCOME' ? 'bad' : 'warn');

const OUTCOME_WORD_EN: Record<Outcome, string> = {
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  ROUTED_TO_SUSPENSE: 'Parked in suspense',
  CHALLENGE_REQUIRED: 'More information needed',
};
const OUTCOME_WORD_VI: Record<Outcome, string> = {
  APPROVED: 'Chấp thuận',
  DECLINED: 'Từ chối',
  ROUTED_TO_SUSPENSE: 'Đưa vào tài khoản treo',
  CHALLENGE_REQUIRED: 'Cần thêm thông tin',
};
const outcomeWord = (o: Outcome): string => (activeLocale() === 'vi' ? OUTCOME_WORD_VI[o] : OUTCOME_WORD_EN[o]);

const reasonWords = (code: string | null): string => (code ? plainWords(code) : '');

/** The token whose journey counted, or the last one to run when none finished. */
function decidingToken(result: RunResult): SimulationToken | undefined {
  return result.tokens.find((t) => t.id === result.decidingTokenId) ?? result.tokens[result.tokens.length - 1];
}

export function buildLabTour(level: ChallengeLevel, graph: ProcessGraph, test: TestCase, source: TourSource): LabTour {
  const runner = new ProcessRunner(graph, test, { runnerConfig: level.runnerConfig, catalog: NODE_CATALOG, conditionVariables: CONDITION_VARIABLES });
  const result = runner.runToCompletion();
  const token = decidingToken(result);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(graph.edges.map((e) => [e.id, e]));
  const path = token?.executionPathHistory ?? [];
  const payload = test.inputPayload;

  const steps: LabStep[] = [];
  const facts: DerivedFacts = { isVirtual: payload.cardType === 'VIRTUAL_DPAN' };

  path.forEach((raw, i) => {
    const node = byId.get(raw.nodeId);
    if (!node) return;
    const kind = kindOf(node);
    const factsBefore: DerivedFacts = { ...facts };
    Object.assign(facts, raw.factsWritten);

    let text = { title: labLabel(node.label), what: '', why: '', fails: [] as string[] };
    let happened = noteText(raw.note ?? '');
    let tone: StepTone = 'neutral';
    let outcome: Outcome | undefined;
    let reasonCode: string | null | undefined;
    let message: LabStep['message'];
    const wire = pacs008From(payload);

    if (kind === 'start') {
      text = { ...startText(payload.a2a !== undefined) };
      happened = payload.a2a
        ? tr({ en: `A ${formatAud(payload.amount)} payment instruction arrives as a pacs.008 message.`, vi: `Một lệnh thanh toán ${formatAud(payload.amount)} đến dưới dạng thông điệp pacs.008.` })
        : tr({ en: `A ${formatAud(payload.amount)} payment arrives.`, vi: `Một giao dịch ${formatAud(payload.amount)} đến.` });
      if (wire) message = { title: labUi().messageArrives, xml: pacs008Xml(wire) };
    } else if (kind === 'task' && node.bankingCapability) {
      text = { ...capabilityText(node.bankingCapability) };
      tone = toneOfFacts(raw.factsWritten);
      if (raw.note?.startsWith('Raised') || raw.note?.startsWith('Phát sinh')) tone = 'bad';
      const rail = raw.factsWritten.a2aRail;
      if (wire && node.bankingCapability === 'A2A_GATEWAY' && (rail === 'INSTANT' || rail === 'RTGS')) message = { title: labUi().messageStamped, xml: pacs008Xml(wire, rail as Rail) };
    } else if (kind === 'gateway') {
      text = { ...gatewayText(), title: node.label ? labLabel(node.label) : gatewayText().title };
      const next = path[i + 1];
      happened = node.type === 'GATEWAY_XOR' ? describeDecision(graph, node, next?.viaEdgeId ? edgeById.get(next.viaEdgeId) : undefined, factsBefore, payload) : noteText(raw.note ?? '');
    } else if (kind === 'end') {
      const cfg = node.configParams;
      outcome = (typeof cfg.outcome === 'string' ? cfg.outcome : undefined) as Outcome | undefined;
      reasonCode = typeof cfg.reasonCode === 'string' && cfg.reasonCode !== '' ? cfg.reasonCode : null;
      text = { ...endText(), title: labLabel(node.label) };
      if (outcome) {
        tone = toneOfOutcome(outcome);
        happened = `${outcomeWord(outcome)}${reasonCode ? ` (${reasonWords(reasonCode)})` : ''}. ${outcomeText(outcome)}`;
      }
    }

    steps.push({
      index: steps.length,
      nodeId: node.id,
      viaEdgeId: raw.viaEdgeId,
      kind,
      capability: node.bankingCapability,
      title: text.title,
      what: text.what,
      why: text.why,
      happened,
      facts: factsOf(raw.factsWritten),
      fails: text.fails,
      tone,
      factsBefore,
      ...(message ? { message } : {}),
      ...(outcome ? { outcome } : {}),
      ...(reasonCode !== undefined ? { reasonCode } : {}),
    });
  });

  const last = steps[steps.length - 1];
  let problem: string | null = null;
  if (steps.length === 0) {
    problem = 'there is no Start event with a wire leading out of it.';
  } else if (last && last.kind !== 'end') {
    const stopped = result.anomalies.find((a) => a.severity === 'ERROR');
    problem = stopped ? stopped.message : `the payment stops at “${last.title}”, which has no wire leading on.`;
  }

  const actualReason = result.reasonCode;
  const matchesExpected = result.outcome === test.expectedOutcome && (test.expectedReasonCode === undefined || actualReason === test.expectedReasonCode);
  const verdict: TourVerdict = {
    outcome: result.outcome,
    reasonCode: actualReason,
    headline: result.outcome === 'NO_OUTCOME' ? tr({ en: 'No outcome', vi: 'Không có kết quả' }) : `${outcomeWord(result.outcome)}${actualReason ? `: ${reasonWords(actualReason)}` : ''}`,
    detail:
      result.outcome === 'NO_OUTCOME'
        ? tr({ en: 'The payment never reached an End event.', vi: 'Giao dịch không bao giờ tới sự kiện kết thúc.' })
        : matchesExpected
          ? outcomeText(result.outcome)
          : tr({
              en: `The test expects ${outcomeWord(test.expectedOutcome).toLowerCase()}${test.expectedReasonCode ? ` (${reasonWords(test.expectedReasonCode)})` : ''}, so this diagram would fail it.`,
              vi: `Bài kiểm tra mong đợi ${outcomeWord(test.expectedOutcome).toLowerCase()}${test.expectedReasonCode ? ` (${test.expectedReasonCode})` : ''}, nên sơ đồ này sẽ không đạt.`,
            }),
    tone: result.outcome === 'NO_OUTCOME' ? 'bad' : matchesExpected ? toneOfOutcome(result.outcome) : 'bad',
    matchesExpected,
  };

  return {
    levelId: level.id,
    testId: test.id,
    testName: test.name,
    source,
    graph,
    tokenId: token?.id ?? null,
    payload,
    carries: carriesOf(payload),
    steps,
    verdict,
    ledger: postTestResult({ actualOutcome: result.outcome, tokens: [...result.tokens] }),
    problem,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Which payment to follow
// ─────────────────────────────────────────────────────────────────────────────

/** The payment each Academy level's opening scene is about. Levels not listed pick the test with the most decisions. */
const FEATURED: Readonly<Record<Id, Id>> = {
  lvl_05_first_swipes: 'L5-T2',
  lvl_06_card_testing: 'L6-T01',
  lvl_07_a2a_iso20022: 'L7-T05',
  lvl_08_fx_breaks: 'L8-FX01',
  lvl_09_sanctions_storm: 'L9-T04',
  lvl_10_chargeback_warfare: 'L10-T01',
};

export const playableTests = (level: ChallengeLevel): TestCase[] => level.testSuite.filter((t) => !t.hidden);

export function featuredTest(level: ChallengeLevel, graph: ProcessGraph): TestCase | null {
  const tests = playableTests(level);
  const named = tests.find((t) => t.id === FEATURED[level.id]);
  if (named) return named;
  let best: TestCase | null = null;
  let bestScore = -1;
  for (const t of tests) {
    const score = buildLabTour(level, graph, t, 'example').steps.filter((s) => s.kind === 'gateway').length;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// The spotlight
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the canvas shows at step `index`: the box being explained is lit, the boxes behind it are seen, the rest of the path is
 * ahead, and everything this payment will never touch is off. The wire the token is about to take is current.
 */
export function spotlightFor(tour: LabTour, index: number): GraphSpotlight {
  const nodes: Record<Id, SpotState> = {};
  const edges: Record<Id, SpotState> = {};
  for (const n of tour.graph.nodes) nodes[n.id] = 'off';
  for (const e of tour.graph.edges) edges[e.id] = 'off';

  tour.steps.forEach((s, i) => {
    nodes[s.nodeId] = i < index ? 'seen' : i === index ? 'current' : 'ahead';
    if (s.viaEdgeId) edges[s.viaEdgeId] = i <= index ? 'seen' : i === index + 1 ? 'current' : 'ahead';
  });
  return { nodes, edges };
}

// ─────────────────────────────────────────────────────────────────────────────
// Questions at the decisions
// ─────────────────────────────────────────────────────────────────────────────

export interface LabQuiz {
  /** The step the question belongs to. */
  step: number;
  nodeId: Id;
  prompt: string;
  options: string[];
  /** Index of the right option. */
  correct: number;
  /** What the diagram actually did, shown after the answer. */
  explain: string;
}

const compareEdges = (a: ProcessEdge, b: ProcessEdge): number => {
  if (a.isDefault !== b.isDefault) return a.isDefault ? 1 : -1;
  const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
  const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
  return pa !== pb ? pa - pb : a.id < b.id ? -1 : 1;
};

/** Where a wire leads, in a few plain words. */
function destination(graph: ProcessGraph, edge: ProcessEdge): string {
  const target = graph.nodes.find((n) => n.id === edge.targetNodeId);
  if (!target) return tr({ en: 'Nowhere', vi: 'Không đâu cả' });
  const name = labLabel(target.label);
  if (target.type === 'EVENT_END') return tr({ en: `End: ${target.label}`, vi: `Kết thúc: ${name}` });
  if (target.type === 'TASK') return tr({ en: `On to ${target.label}`, vi: `Tiếp tới ${name}` });
  return tr({ en: `On to the next decision (${target.label})`, vi: `Tiếp tới quyết định kế tiếp (${name})` });
}

/** The variables a gateway's rules read, in the order they first appear. */
function variablesRead(edges: readonly ProcessEdge[]): string[] {
  const known = new Set(CONDITION_VARIABLES.filter((v) => v.learnerVisible).map((v) => v.name));
  const seen: string[] = [];
  for (const e of edges) {
    for (const m of (e.conditionExpression ?? '').matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
      const name = m[0];
      if (known.has(name) && !seen.includes(name)) seen.push(name);
    }
  }
  return seen;
}

/** What the payment knows about a variable at this point: the facts so far, else the payment itself. */
function readVariable(name: string, facts: DerivedFacts, payload: BankingPayload): unknown {
  const fromFacts = (facts as Record<string, unknown>)[name];
  return fromFacts !== undefined ? fromFacts : (payload as unknown as Record<string, unknown>)[name];
}

/** Questions the generic builder cannot ask as well as a person would. Keyed by level and gateway box. */
const PROMPTS: Readonly<Record<string, (c: { payload: BankingPayload; facts: DerivedFacts }) => string>> = {
  'lvl_01_virtual_card_dcvv/n_xor_dcvv': ({ facts }) => tr({ en: `The dCVV check says the code is ${valueText('dcvvStatus', facts.dcvvStatus)}. Does the payment go on to the ledger?`, vi: `Kiểm tra dCVV cho biết mã ${valueText('dcvvStatus', facts.dcvvStatus)}. Giao dịch có đi tiếp tới sổ cái không?` }),
  'lvl_02_three_ds_routing/n_xor_3ds': ({ payload }) => tr({ en: `Risk score is ${payload.riskScore}. Does the customer need to enter an OTP?`, vi: `Điểm rủi ro là ${payload.riskScore}. Khách có cần nhập OTP không?` }),
  'lvl_03_eod_recon_suspense/n_xor_recon': ({ payload }) => {
    const s = payload.settlement;
    const leg = (v: number | null | undefined): string => (v == null ? tr({ en: 'missing', vi: 'thiếu' }) : formatAud(v));
    return tr({ en: `The bank’s ledger says ${leg(s?.ledgerAmount)}, the scheme says ${leg(s?.clearingAmount)} and the shop’s bank says ${leg(s?.switchAmount)}. What does the desk do?`, vi: `Sổ cái ngân hàng ghi ${leg(s?.ledgerAmount)}, tổ chức thẻ ghi ${leg(s?.clearingAmount)} và ngân hàng của cửa hàng ghi ${leg(s?.switchAmount)}. Quầy sẽ làm gì?` });
  },
  'lvl_04_bnpl_pay_in_4/n_xor_plan': ({ payload }) => {
    const b = payload.bnpl;
    return tr({ en: `The customer’s score is ${b?.underwritingScore ?? '—'} and they put ${b ? formatAud(b.downPaymentMinor) : '—'} down. Is the plan approved?`, vi: `Điểm của khách là ${b?.underwritingScore ?? '—'} và họ trả trước ${b ? formatAud(b.downPaymentMinor) : '—'}. Kế hoạch có được duyệt không?` });
  },
  'lvl_06_card_testing/n_xor_burst': ({ payload }) => tr({ en: `This is attempt ${payload.recentAttempts ?? 1} on the card in ten minutes, for ${formatAud(payload.amount)}. Is it a bot testing stolen cards?`, vi: `Đây là lần thử thứ ${payload.recentAttempts ?? 1} trên thẻ trong mười phút, với ${formatAud(payload.amount)}. Đây có phải bot đang dò thẻ bị đánh cắp không?` }),
  'lvl_06_card_testing/n_xor_route': ({ payload, facts }) => tr({ en: `The 3DS desk chose “${valueText('threeDsPath', facts.threeDsPath)}” for a ${formatAud(payload.amount)} payment. Where does it go?`, vi: `Quầy 3DS chọn “${valueText('threeDsPath', facts.threeDsPath)}” cho giao dịch ${formatAud(payload.amount)}. Nó đi đâu?` }),
  'lvl_07_a2a_iso20022/n_xor_checks': ({ facts }) => tr({ en: `The gateway says: message valid ${valueText('a2aValid', facts.a2aValid)}, liquidity ${valueText('a2aLiquidity', facts.a2aLiquidity)}, queue ${valueText('a2aQueue', facts.a2aQueue)}, priority ${valueText('a2aPriority', facts.a2aPriority)}. Can the payment go?`, vi: `Cổng cho biết: thông điệp hợp lệ ${valueText('a2aValid', facts.a2aValid)}, thanh khoản ${valueText('a2aLiquidity', facts.a2aLiquidity)}, hàng chờ ${valueText('a2aQueue', facts.a2aQueue)}, ưu tiên ${valueText('a2aPriority', facts.a2aPriority)}. Giao dịch có đi được không?` }),
  'lvl_07_a2a_iso20022/n_xor_rail': ({ payload, facts }) => tr({ en: `The payment is ${formatAud(payload.amount)} and the gateway picked the ${valueText('a2aRail', facts.a2aRail)} rail. Which end does it reach?`, vi: `Giao dịch là ${formatAud(payload.amount)} và cổng chọn kênh ${valueText('a2aRail', facts.a2aRail)}. Nó tới sự kiện kết thúc nào?` }),
  'lvl_08_fx_breaks/n_xor_status': ({ facts }) => tr({ en: `Reconciliation says ${valueText('reconStatus', facts.reconStatus)}. Is the payment settled?`, vi: `Đối soát cho biết ${valueText('reconStatus', facts.reconStatus)}. Giao dịch có được quyết toán không?` }),
  'lvl_08_fx_breaks/n_xor_cause': ({ facts }) => tr({ en: `The amounts disagree. The desk says the cause is ${valueText('reconCause', facts.reconCause)}${facts.fxDirection ? ` and the difference is an FX ${valueText('fxDirection', facts.fxDirection)}` : ''}. Where is the gap parked?`, vi: `Các số tiền không khớp. Quầy cho biết nguyên nhân là ${valueText('reconCause', facts.reconCause)}${facts.fxDirection ? ` và khoản chênh là ${valueText('fxDirection', facts.fxDirection)} tỷ giá` : ''}. Khoản chênh được treo ở đâu?` }),
  'lvl_09_sanctions_storm/n_xor_hit': ({ facts }) => tr({ en: `The best name match scored ${valueText('amlMatchScore', facts.amlMatchScore)} against the ${valueText('amlList', facts.amlList)} list${facts.amlStructuring ? ', and the deposits look like structuring' : ''}. Does this payment need an investigation?`, vi: `Lần trùng tên tốt nhất đạt ${valueText('amlMatchScore', facts.amlMatchScore)} so với danh sách ${valueText('amlList', facts.amlList)}${facts.amlStructuring ? ', và các lần nộp trông như chia nhỏ giao dịch' : ''}. Giao dịch này có cần điều tra không?` }),
  'lvl_09_sanctions_storm/n_xor_verdict': ({ facts }) => tr({ en: `The investigator found ${facts.caseEvidenceCount ?? 0} verified identity item${facts.caseEvidenceCount === 1 ? '' : 's'} and the verdict is ${valueText('caseVerdict', facts.caseVerdict)}. What does the bank do?`, vi: `Điều tra viên tìm thấy ${facts.caseEvidenceCount ?? 0} mục danh tính đã xác minh và kết luận là ${valueText('caseVerdict', facts.caseVerdict)}. Ngân hàng làm gì?` }),
  'lvl_10_chargeback_warfare/n_xor_gate': ({ facts }) => tr({ en: `The claim window is ${valueText('disputeWindow', facts.disputeWindow)} and the loss falls on the ${valueText('disputeLiability', facts.disputeLiability)}. Can the dispute go ahead?`, vi: `Thời hạn khiếu nại đang ${valueText('disputeWindow', facts.disputeWindow)} và tổn thất thuộc về ${valueText('disputeLiability', facts.disputeLiability)}. Khiếu nại có tiếp tục được không?` }),
  'lvl_10_chargeback_warfare/n_xor_stage': ({ facts }) => tr({ en: `The dispute moves to ${valueText('disputeNext', facts.disputeNext)}. Where does the diagram send it?`, vi: `Khiếu nại chuyển sang ${valueText('disputeNext', facts.disputeNext)}. Sơ đồ gửi nó tới đâu?` }),
};

const FUNDS_PROMPT = ({ payload }: { payload: BankingPayload }): string => tr({ en: `The payment is ${formatAud(payload.amount)} and the customer can spend ${formatAud(payload.availableBalance)}. Does the bank approve it?`, vi: `Giao dịch là ${formatAud(payload.amount)} và khách có thể chi ${formatAud(payload.availableBalance)}. Ngân hàng có chấp thuận không?` });
for (const key of ['lvl_01_virtual_card_dcvv/n_xor_ledger', 'lvl_02_three_ds_routing/n_xor_ledger', 'lvl_05_first_swipes/n_xor_funds', 'lvl_06_card_testing/n_xor_funds']) {
  (PROMPTS as Record<string, (c: { payload: BankingPayload; facts: DerivedFacts }) => string>)[key] = FUNDS_PROMPT;
}

/** The question at step `index`, or null when that step is not a decision with a clear next wire. */
export function quizFor(tour: LabTour, index: number): LabQuiz | null {
  const step = tour.steps[index];
  const next = tour.steps[index + 1];
  if (!step || !next || step.kind !== 'gateway' || !next.viaEdgeId) return null;
  const node = tour.graph.nodes.find((n) => n.id === step.nodeId);
  if (!node || node.type !== 'GATEWAY_XOR') return null;

  const out = tour.graph.edges.filter((e) => e.sourceNodeId === node.id).sort(compareEdges);
  if (out.length < 2) return null;
  const correct = out.findIndex((e) => e.id === next.viaEdgeId);
  if (correct < 0) return null;

  // Two wires can lead to the same place (a low-value exemption and a full check both go to the ledger). Tell them apart.
  const base = out.map((e) => destination(tour.graph, e));
  const options = out.map((e, i) => {
    const text = base[i] ?? '';
    if (base.filter((b) => b === text).length === 1) return text;
    return e.label ? `${text} (${e.label})` : `${text} (${e.isDefault ? tr({ en: 'otherwise', vi: 'trường hợp khác' }) : e.conditionExpression ?? tr({ en: 'this rule', vi: 'quy tắc này' })})`;
  });

  const bespoke = PROMPTS[`${tour.levelId}/${node.id}`];
  const prompt = bespoke ? bespoke({ payload: tour.payload, facts: step.factsBefore }) : genericPrompt(node.label, variablesRead(out), step.factsBefore, tour.payload);

  return { step: index, nodeId: node.id, prompt, options, correct, explain: step.happened };
}

function genericPrompt(label: string, names: string[], facts: DerivedFacts, payload: BankingPayload): string {
  const known = names.map((n) => `${factLabel(n)}: ${valueText(n, readVariable(n, facts, payload))}`);
  const name = labLabel(label);
  return known.length > 0
    ? tr({ en: `${known.join(', ')}. Which way does “${label}” send the payment?`, vi: `${known.join(', ')}. “${name}” gửi giao dịch đi hướng nào?` })
    : tr({ en: `Which way does “${label}” send this payment?`, vi: `“${name}” gửi giao dịch này đi hướng nào?` });
}

/** Every question a tour asks, in order. */
export function quizzesOf(tour: LabTour): LabQuiz[] {
  const out: LabQuiz[] = [];
  for (let i = 0; i < tour.steps.length; i++) {
    const q = quizFor(tour, i);
    if (q) out.push(q);
  }
  return out;
}
