/** Evaluator and grader. validateGraph() static checks on a learner's diagram, before anything runs evaluateChallenge() runs every test in a level, scores the result, and explains each failure How a diagram is graded 1. validateGraph() looks for structural problems. */

import { CONDITION_VARIABLES, NODE_CATALOG } from '../data/seedChallenges';
import { configLabel, nodeDefLabel, portLabel } from '../i18n/catalogVi';
import { tagText } from '../i18n/challengeVi';
import { labLabel as L } from '../i18n/labText';
import { activeLocale, tr } from '../i18n/localeCore';
import type {
  BankingCapability,
  ChallengeLevel,
  ConditionVariable,
  DetectedAnomaly,
  EvaluationResult,
  ExecutionStep,
  FeedbackLog,
  Id,
  NodeDefinition,
  ProcessGraph,
  ProcessNode,
  SimulationToken,
  TestCase,
  TestCaseResult,
  TestFailureReason,
  TokenExceptionCode,
} from '../types/processLearning';
import { checkExpression } from './expression';
import { ProcessRunner, type RunResult, type UnsetFactRead } from './processRunner';

export interface EvaluateOptions {
  catalog?: readonly NodeDefinition[];
  conditionVariables?: readonly ConditionVariable[];
  /** Injected for deterministic results in tests. */
  now?: () => Date;
  newId?: () => string;
  /** Show payload-specific detail in feedback for hidden tests. For authoring tools only. */
  revealHidden?: boolean;
}

type AnomalyDraft = Omit<DetectedAnomaly, 'severity'>;

// Static validation

const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );

const effectiveConfig = (node: ProcessNode, def: NodeDefinition | undefined): Record<string, unknown> => ({
  ...Object.fromEntries((def?.configSchema ?? []).map((c) => [c.key, c.defaultValue])),
  ...node.configParams,
});

/** Starter nodes the learner may keep for free: locked, and identical to the level's starter node. */
function freeStarterNodeIds(graph: ProcessGraph, level: ChallengeLevel, defs: Map<Id, NodeDefinition>): Set<Id> {
  const free = new Set<Id>();
  const starter = level.starterGraph?.nodes.filter((n) => n.locked) ?? [];
  for (const s of starter) {
    const n = graph.nodes.find((x) => x.id === s.id);
    if (
      n &&
      n.locked &&
      n.definitionId === s.definitionId &&
      stableJson(effectiveConfig(n, defs.get(n.definitionId))) === stableJson(effectiveConfig(s, defs.get(s.definitionId)))
    ) {
      free.add(n.id);
    }
  }
  return free;
}

export function validateGraph(graph: ProcessGraph, level: ChallengeLevel, options: EvaluateOptions = {}): DetectedAnomaly[] {
  const catalog = options.catalog ?? NODE_CATALOG;
  const variables = options.conditionVariables ?? CONDITION_VARIABLES;
  const defs = new Map(catalog.map((d) => [d.id, d]));
  const found: DetectedAnomaly[] = [];

  const error = (type: DetectedAnomaly['type'], d: Omit<AnomalyDraft, 'type'>): void => {
    found.push({ type, severity: 'ERROR', ...d });
  };
  const warn = (type: DetectedAnomaly['type'], d: Omit<AnomalyDraft, 'type'>): void => {
    found.push({ type, severity: 'WARNING', ...d });
  };

  // ── identity ──
  const nodeIds = new Set<Id>();
  for (const n of graph.nodes) {
    if (nodeIds.has(n.id)) error('INVALID_STRUCTURE', { nodeId: n.id, message: tr({ en: `Two nodes share the id '${n.id}'.`, vi: `Hai nút có cùng id '${n.id}'.` }) });
    nodeIds.add(n.id);
  }
  const edgeIds = new Set<Id>();
  for (const e of graph.edges) {
    if (edgeIds.has(e.id)) error('INVALID_STRUCTURE', { edgeId: e.id, message: tr({ en: `Two edges share the id '${e.id}'.`, vi: `Hai cạnh có cùng id '${e.id}'.` }) });
    edgeIds.add(e.id);
  }
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const typeOf = (n: ProcessNode) => defs.get(n.definitionId)?.type ?? n.type;

  // ── start event ──
  const starts = graph.nodes.filter((n) => typeOf(n) === 'EVENT_START');
  if (starts.length === 0) {
    error('MISSING_START_EVENT', { message: tr({ en: 'The diagram has no Start event. Every transaction needs somewhere to enter.', vi: 'Sơ đồ không có sự kiện Bắt đầu. Mọi giao dịch cần một nơi để đi vào.' }) });
  } else if (starts.length > 1) {
    error('INVALID_STRUCTURE', { message: tr({ en: `The diagram has ${starts.length} Start events. Use exactly one.`, vi: `Sơ đồ có ${starts.length} sự kiện Bắt đầu. Hãy dùng đúng một.` }) });
  }

  // ── nodes: definition, palette, starter nodes, config ──
  const free = freeStarterNodeIds(graph, level, defs);
  const counts = new Map<Id, number>();
  let placed = 0;

  for (const s of level.starterGraph?.nodes.filter((n) => n.locked) ?? []) {
    const n = nodeById.get(s.id);
    if (!n) {
      error('INVALID_STRUCTURE', { nodeId: s.id, message: tr({ en: `The starter node '${s.label}' was removed. It is locked and must stay.`, vi: `Nút khởi đầu '${L(s.label)}' đã bị xóa. Nó bị khóa và phải được giữ lại.` }) });
    } else if (!free.has(n.id)) {
      error('INVALID_STRUCTURE', { nodeId: n.id, message: tr({ en: `The starter node '${s.label}' is locked, but it was changed.`, vi: `Nút khởi đầu '${L(s.label)}' bị khóa, nhưng đã bị thay đổi.` }) });
    }
  }

  for (const n of graph.nodes) {
    const def = defs.get(n.definitionId);
    if (n.locked && !free.has(n.id) && !level.starterGraph?.nodes.some((s) => s.id === n.id && s.locked)) {
      error('INVALID_STRUCTURE', { nodeId: n.id, message: tr({ en: `'${n.label}' is marked locked, but it is not one of this level's starter nodes.`, vi: `'${L(n.label)}' được đánh dấu khóa, nhưng không phải nút khởi đầu của cấp độ này.` }) });
    }
    if (!def) {
      error('PALETTE_VIOLATION', { nodeId: n.id, message: tr({ en: `'${n.label}' was not built from any known node type (${n.definitionId}).`, vi: `'${L(n.label)}' không được tạo từ loại nút nào đã biết (${n.definitionId}).` }) });
      continue;
    }
    if (def.type !== n.type || def.bankingCapability !== n.bankingCapability) {
      error('INVALID_STRUCTURE', { nodeId: n.id, message: tr({ en: `'${n.label}' does not behave like its node type '${def.label}'.`, vi: `'${L(n.label)}' không hoạt động như loại nút '${nodeDefLabel(def.id, def.label)}' của nó.` }) });
    }

    if (!free.has(n.id)) {
      placed++;
      counts.set(def.id, (counts.get(def.id) ?? 0) + 1);
    }

    for (const c of def.configSchema) {
      const v = n.configParams[c.key];
      if (v === undefined) {
        if (c.required) error('INVALID_CONFIG', { nodeId: n.id, message: tr({ en: `'${n.label}' needs a value for '${c.label}'.`, vi: `'${L(n.label)}' cần một giá trị cho '${configLabel(c.key, c.label)}'.` }) });
        continue;
      }
      const label = tr({ en: `'${c.label}' on '${n.label}'`, vi: `'${configLabel(c.key, c.label)}' trên '${L(n.label)}'` });
      if (c.type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) error('INVALID_CONFIG', { nodeId: n.id, message: tr({ en: `${label} must be a number.`, vi: `${label} phải là một số.` }) });
        else if ((c.min !== undefined && v < c.min) || (c.max !== undefined && v > c.max)) {
          error('INVALID_CONFIG', { nodeId: n.id, message: tr({ en: `${label} must be between ${c.min ?? '-∞'} and ${c.max ?? '∞'} (got ${v}).`, vi: `${label} phải nằm trong khoảng ${c.min ?? '-∞'} đến ${c.max ?? '∞'} (nhận ${v}).` }) });
        }
      } else if (c.type === 'boolean') {
        if (typeof v !== 'boolean') error('INVALID_CONFIG', { nodeId: n.id, message: tr({ en: `${label} must be true or false.`, vi: `${label} phải là true hoặc false.` }) });
      } else if (c.type === 'enum') {
        if (typeof v !== 'string' || !(c.options ?? []).includes(v)) {
          error('INVALID_CONFIG', { nodeId: n.id, message: tr({ en: `${label} must be one of ${(c.options ?? []).join(', ')} (got ${JSON.stringify(v)}).`, vi: `${label} phải là một trong ${(c.options ?? []).join(', ')} (nhận ${JSON.stringify(v)}).` }) });
        }
      } else if (typeof v !== 'string') {
        error('INVALID_CONFIG', { nodeId: n.id, message: tr({ en: `${label} must be text.`, vi: `${label} phải là văn bản.` }) });
      }
    }
    const known = new Set(def.configSchema.map((c) => c.key));
    for (const key of Object.keys(n.configParams)) {
      if (!known.has(key)) warn('INVALID_CONFIG', { nodeId: n.id, message: tr({ en: `'${n.label}' has a setting '${key}' that this node does not use.`, vi: `'${L(n.label)}' có thiết lập '${key}' mà nút này không dùng.` }) });
    }
    if (def.bankingCapability === 'THREE_DS_EVALUATOR') {
      const lo = n.configParams.frictionlessBelow;
      const hi = n.configParams.rejectAtOrAbove;
      if (typeof lo === 'number' && typeof hi === 'number' && lo > hi) {
        error('INVALID_CONFIG', {
          nodeId: n.id,
          message: tr({ en: `'${n.label}': the frictionless line (${lo}) is above the reject line (${hi}), so the bands overlap.`, vi: `'${L(n.label)}': ngưỡng xác thực liền mạch (${lo}) cao hơn ngưỡng từ chối (${hi}), nên các dải chồng lên nhau.` }),
        });
      }
    }
  }

  for (const [defId, count] of counts) {
    const entry = level.allowedNodePalette.entries.find((e) => e.nodeDefinitionId === defId);
    const name = nodeDefLabel(defId, defs.get(defId)?.label ?? defId);
    if (!entry) error('PALETTE_VIOLATION', { message: tr({ en: `'${name}' is not available on this level.`, vi: `'${name}' không có ở cấp độ này.` }) });
    else if (entry.maxCount !== null && count > entry.maxCount) {
      error('PALETTE_VIOLATION', { message: tr({ en: `This level allows ${entry.maxCount} '${name}' node${entry.maxCount === 1 ? '' : 's'}, but the diagram uses ${count}.`, vi: `Cấp độ này cho phép ${entry.maxCount} nút '${name}', nhưng sơ đồ dùng ${count}.` }) });
    }
  }
  const budget = level.allowedNodePalette.totalNodeBudget;
  if (budget !== null && placed > budget) {
    error('PALETTE_VIOLATION', { message: tr({ en: `This level allows ${budget} nodes, but the diagram uses ${placed}.`, vi: `Cấp độ này cho phép ${budget} nút, nhưng sơ đồ dùng ${placed}.` }) });
  }

  // ── edges ──
  const portUse = new Map<string, number>();
  for (const e of graph.edges) {
    const from = nodeById.get(e.sourceNodeId);
    const to = nodeById.get(e.targetNodeId);
    if (!from || !to) {
      error('INVALID_STRUCTURE', { edgeId: e.id, message: tr({ en: `Edge ${e.id} connects to a node that is not in the diagram.`, vi: `Cạnh ${e.id} nối tới một nút không có trong sơ đồ.` }) });
      continue;
    }
    const outPort = from.outputPorts.find((p) => p.id === e.sourcePortId);
    const inPort = to.inputPorts.find((p) => p.id === e.targetPortId);
    if (!outPort) error('INVALID_STRUCTURE', { edgeId: e.id, nodeId: from.id, message: tr({ en: `Edge ${e.id} leaves '${from.label}' from a port it does not have ('${e.sourcePortId}').`, vi: `Cạnh ${e.id} rời '${L(from.label)}' từ một cổng nó không có ('${e.sourcePortId}').` }) });
    if (!inPort) error('INVALID_STRUCTURE', { edgeId: e.id, nodeId: to.id, message: tr({ en: `Edge ${e.id} enters '${to.label}' at a port it does not have ('${e.targetPortId}').`, vi: `Cạnh ${e.id} vào '${L(to.label)}' ở một cổng nó không có ('${e.targetPortId}').` }) });
    for (const [key, port, node] of [
      [`${from.id}:${e.sourcePortId}`, outPort, from],
      [`${to.id}:${e.targetPortId}`, inPort, to],
    ] as const) {
      const used = (portUse.get(key) ?? 0) + 1;
      portUse.set(key, used);
      if (port && used === port.maxEdges + 1) {
        error('INVALID_STRUCTURE', { nodeId: node.id, message: tr({ en: `The '${port.label}' port on '${node.label}' takes at most ${port.maxEdges} connection${port.maxEdges === 1 ? '' : 's'}.`, vi: `Cổng '${portLabel(port.label)}' trên '${L(node.label)}' nhận tối đa ${port.maxEdges} kết nối.` }) });
      }
    }

    if (e.conditionExpression !== undefined) {
      if (typeOf(from) !== 'GATEWAY_XOR') {
        warn('INVALID_EXPRESSION', { edgeId: e.id, nodeId: from.id, message: tr({ en: `Edge ${e.id} has a condition, but only edges leaving a Decision (XOR) gateway use one. It is ignored.`, vi: `Cạnh ${e.id} có điều kiện, nhưng chỉ các cạnh rời cổng Quyết định (XOR) mới dùng điều kiện. Nó bị bỏ qua.` }) });
      } else {
        const check = checkExpression(e.conditionExpression, variables);
        for (const msg of check.errors) {
          error('INVALID_EXPRESSION', { edgeId: e.id, nodeId: from.id, message: tr({ en: `Condition "${e.conditionExpression}" on edge ${e.id} after '${from.label}': ${msg}`, vi: `Điều kiện "${e.conditionExpression}" trên cạnh ${e.id} sau '${L(from.label)}': ${msg}` }) });
        }
      }
    }
  }

  for (const n of graph.nodes.filter((x) => typeOf(x) === 'GATEWAY_XOR')) {
    const out = graph.edges.filter((e) => e.sourceNodeId === n.id);
    if (out.filter((e) => e.isDefault).length > 1) {
      error('INVALID_STRUCTURE', { nodeId: n.id, message: tr({ en: `The decision '${n.label}' has more than one default edge. Choose one.`, vi: `Quyết định '${L(n.label)}' có nhiều hơn một cạnh mặc định. Hãy chọn một.` }) });
    }
    if (out.length > 1 && out.some((e) => !e.isDefault && e.conditionExpression === undefined)) {
      warn('INVALID_STRUCTURE', { nodeId: n.id, message: tr({ en: `An edge out of the decision '${n.label}' has no condition and is not the default, so it is always taken when reached.`, vi: `Một cạnh rời quyết định '${L(n.label)}' không có điều kiện và không phải mặc định, nên nó luôn được đi khi tới đó.` }) });
    }
  }

  // ── reachability ──
  const reached = new Set<Id>();
  const queue = starts.map((s) => s.id);
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (reached.has(id)) continue;
    reached.add(id);
    for (const e of graph.edges) if (e.sourceNodeId === id) queue.push(e.targetNodeId);
  }
  if (starts.length > 0) {
    for (const n of graph.nodes) {
      if (!reached.has(n.id)) warn('UNREACHABLE_NODE', { nodeId: n.id, message: tr({ en: `'${n.label}' cannot be reached from the Start event, so it never runs.`, vi: `'${L(n.label)}' không thể tới được từ sự kiện Bắt đầu, nên nó không bao giờ chạy.` }) });
    }
  }

  return found;
}

// Judging one test

function judge(test: TestCase, run: RunResult): TestFailureReason[] {
  const reasons: TestFailureReason[] = [];
  const faulted = run.tokens.some((t) => t.state === 'EXCEPTION');
  const stuck = run.tokens.some((t) => t.state === 'DEADLOCKED');
  if (faulted) reasons.push('EXCEPTION');
  if (stuck) reasons.push('DEADLOCK');

  const explainedByFault = run.outcome === 'NO_OUTCOME' && (faulted || stuck);
  if (run.outcome !== test.expectedOutcome && !explainedByFault) reasons.push('WRONG_OUTCOME');
  if (run.outcome === test.expectedOutcome && test.expectedReasonCode !== undefined && run.reasonCode !== test.expectedReasonCode) {
    reasons.push('WRONG_REASON_CODE');
  }
  if (run.outcome !== 'NO_OUTCOME' && run.latencyMs > test.maxLatencyMs) reasons.push('LATENCY_EXCEEDED');
  if ((test.requiredCapabilities ?? []).some((c) => !run.visitedCapabilities.includes(c))) reasons.push('MISSING_REQUIRED_CAPABILITY');
  if ((test.forbiddenCapabilities ?? []).some((c) => run.visitedCapabilities.includes(c))) reasons.push('FORBIDDEN_CAPABILITY_VISITED');
  return reasons;
}

// Diagnostics

interface ExplainContext {
  graph: ProcessGraph;
  catalog: readonly NodeDefinition[];
  /** False for hidden tests: no payload-specific detail. */
  reveal: boolean;
}

const labelOf = (graph: ProcessGraph, id: Id): string => {
  const label = graph.nodes.find((n) => n.id === id)?.label;
  return label === undefined ? id : L(label);
};
const capabilityLabel = (catalog: readonly NodeDefinition[], cap: BankingCapability): string => {
  const def = catalog.find((d) => d.bankingCapability === cap);
  return def ? nodeDefLabel(def.id, def.label) : cap;
};

/** The steps a token took, including everything its ancestors did before it. */
function pathSteps(run: RunResult, tokenId: Id | null): ExecutionStep[] {
  const byId = new Map(run.tokens.map((t) => [t.id, t]));
  const chain: SimulationToken[] = [];
  for (let cur = tokenId ? byId.get(tokenId) : undefined; cur; cur = cur.parentTokenId ? byId.get(cur.parentTokenId) : undefined) {
    chain.unshift(cur);
  }
  return chain.flatMap((t) => t.executionPathHistory);
}

const describePath = (graph: ProcessGraph, steps: ExecutionStep[]): string =>
  steps.map((s) => labelOf(graph, s.nodeId)).join(' → ');

const FAULT_ADVICE_EN: Partial<Record<TokenExceptionCode, string>> = {
  TOKEN_NOT_FOUND: "Connect the Token Vault's error port to an End event (for example Declined) so unknown tokens are handled instead of stalling.",
  NO_MATCHING_BRANCH: 'Mark one outgoing edge as the default, so every case lands somewhere.',
  INVALID_EXPRESSION: 'Fix the condition on that edge.',
  INVALID_CONFIG: "Check that node's settings.",
  STEP_LIMIT_EXCEEDED: 'Give the loop an exit, or take it out. Every path should end at an End event.',
};
const FAULT_ADVICE_VI: Partial<Record<TokenExceptionCode, string>> = {
  TOKEN_NOT_FOUND: 'Nối cổng lỗi của Kho token tới một sự kiện kết thúc (ví dụ Từ chối) để token không xác định được xử lý thay vì bị treo.',
  NO_MATCHING_BRANCH: 'Đánh dấu một cạnh ra là mặc định, để mọi trường hợp đều có nơi đến.',
  INVALID_EXPRESSION: 'Sửa điều kiện trên cạnh đó.',
  INVALID_CONFIG: 'Kiểm tra thiết lập của nút đó.',
  STEP_LIMIT_EXCEEDED: 'Cho vòng lặp một lối ra, hoặc bỏ nó đi. Mọi nhánh nên kết thúc ở một sự kiện kết thúc.',
};

function explainFailure(test: TestCase, run: RunResult, reasons: TestFailureReason[], ctx: ExplainContext): FeedbackLog[] {
  const logs: FeedbackLog[] = [];
  const tag = `${test.name}${test.hidden ? tr({ en: ' (hidden test)', vi: ' (bài kiểm tra ẩn)' }) : ''}:`;
  const add = (message: string, nodeId?: Id): void => {
    logs.push({ level: 'ERROR', testCaseId: test.id, message: `${tag} ${message}`, ...(nodeId !== undefined ? { nodeId } : {}) });
  };
  const decider = pathSteps(run, run.decidingTokenId);

  // Faults: one explanation per distinct problem, however many tokens hit it.
  const seen = new Set<string>();
  for (const t of run.tokens) {
    if ((t.state !== 'EXCEPTION' && t.state !== 'DEADLOCKED') || !t.exception) continue;
    const key = `${t.exception.code}|${t.exception.nodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { code, nodeId, message } = t.exception;
    const nodeType = ctx.catalog.find((d) => d.id === ctx.graph.nodes.find((n) => n.id === nodeId)?.definitionId)?.type;
    const advice =
      code === 'DEAD_END'
        ? nodeType === 'GATEWAY_AND'
          ? tr({ en: 'Make sure every branch into the join is taken on every path, or do not use a join here.', vi: 'Đảm bảo mọi nhánh vào điểm gộp đều được đi trên mọi nhánh, hoặc đừng dùng điểm gộp ở đây.' })
          : tr({ en: 'Connect it to the next step, or to an End event.', vi: 'Nối nó tới bước tiếp theo, hoặc tới một sự kiện kết thúc.' })
        : (activeLocale() === 'vi' ? FAULT_ADVICE_VI : FAULT_ADVICE_EN)[code];
    const sentence = /[.!?]$/.test(message) ? message : `${message}.`;
    add(`${sentence} ${advice ?? ''}`.trim(), nodeId);
  }

  if (reasons.includes('WRONG_OUTCOME')) {
    if (run.outcome === 'NO_OUTCOME') {
      add(tr({ en: `Expected ${test.expectedOutcome}, but no path reached an End event.`, vi: `Mong đợi ${test.expectedOutcome}, nhưng không nhánh nào tới được sự kiện kết thúc.` }));
    } else {
      const last = decider[decider.length - 1];
      let msg = tr({
        en: `Expected ${test.expectedOutcome} but the transaction ended ${run.outcome} at '${last ? labelOf(ctx.graph, last.nodeId) : 'an End event'}'.`,
        vi: `Mong đợi ${test.expectedOutcome} nhưng giao dịch kết thúc ${run.outcome} tại '${last ? labelOf(ctx.graph, last.nodeId) : 'một sự kiện kết thúc'}'.`,
      });
      if (ctx.reveal) {
        msg += tr({ en: ` Path: ${describePath(ctx.graph, decider)}.`, vi: ` Đường đi: ${describePath(ctx.graph, decider)}.` });
        const decision = [...decider].reverse().find((s) => ctx.graph.nodes.find((n) => n.id === s.nodeId)?.type === 'GATEWAY_XOR' && s.note);
        if (decision) msg += tr({ en: ` Last decision, '${labelOf(ctx.graph, decision.nodeId)}': ${decision.note}`, vi: ` Quyết định cuối, '${labelOf(ctx.graph, decision.nodeId)}': ${decision.note}` });
      }
      add(msg, last?.nodeId);
    }
  }

  if (reasons.includes('WRONG_REASON_CODE')) {
    const last = decider[decider.length - 1];
    add(
      ctx.reveal
        ? tr({
            en: `The reason code is '${run.reasonCode ?? '(none)'}' but this case belongs in '${test.expectedReasonCode}'. Check the reason code on the End event '${last ? labelOf(ctx.graph, last.nodeId) : '?'}', or route this case to a different End event.`,
            vi: `Mã lý do là '${run.reasonCode ?? '(không có)'}' nhưng trường hợp này thuộc về '${test.expectedReasonCode}'. Kiểm tra mã lý do trên sự kiện kết thúc '${last ? labelOf(ctx.graph, last.nodeId) : '?'}', hoặc định tuyến trường hợp này tới sự kiện kết thúc khác.`,
          })
        : tr({
            en: 'The outcome is right but the reason code on the End event is wrong. Different kinds of break go to different queues.',
            vi: 'Kết quả đúng nhưng mã lý do trên sự kiện kết thúc sai. Các loại sai lệch khác nhau đi tới các hàng chờ khác nhau.',
          }),
      last?.nodeId,
    );
  }

  if (reasons.includes('LATENCY_EXCEEDED')) {
    const slow = [...decider].filter((s) => s.durationMs > 0).sort((a, b) => b.durationMs - a.durationMs).slice(0, 3);
    add(
      tr({ en: `It took ${run.latencyMs} ms but this case must finish within ${test.maxLatencyMs} ms.`, vi: `Mất ${run.latencyMs} ms nhưng trường hợp này phải xong trong ${test.maxLatencyMs} ms.` }) +
        (slow.length
          ? tr({ en: ' Slowest steps: ', vi: ' Các bước chậm nhất: ' }) + `${slow.map((s) => `${labelOf(ctx.graph, s.nodeId)} (${s.durationMs} ms)`).join(', ')}.`
          : '') +
        tr({ en: ' Remove steps this case does not need.', vi: ' Bỏ các bước trường hợp này không cần.' }),
    );
  }

  for (const cap of test.requiredCapabilities ?? []) {
    if (!run.visitedCapabilities.includes(cap)) {
      add(tr({ en: `This case has to pass through the ${capabilityLabel(ctx.catalog, cap)}, but your diagram skipped it.`, vi: `Trường hợp này phải đi qua ${capabilityLabel(ctx.catalog, cap)}, nhưng sơ đồ của bạn đã bỏ qua nó.` }));
    }
  }
  for (const cap of test.forbiddenCapabilities ?? []) {
    if (run.visitedCapabilities.includes(cap)) {
      const hit = run.tokens.flatMap((t) => t.executionPathHistory).find((s) => s.capability === cap);
      add(
        tr({ en: `This case must not reach the ${capabilityLabel(ctx.catalog, cap)}, but it did. Stop it earlier: a request that is already decided should not trigger that check.`, vi: `Trường hợp này không được tới ${capabilityLabel(ctx.catalog, cap)}, nhưng nó đã tới. Hãy dừng nó sớm hơn: một yêu cầu đã được quyết định thì không nên kích hoạt bước kiểm tra đó.` }),
        hit?.nodeId,
      );
    }
  }

  if (!ctx.reveal && test.tags?.length) {
    logs.push({ level: 'HINT', testCaseId: test.id, message: tr({ en: `${tag} this hidden test covers: ${test.tags.join(', ')}.`, vi: `${tag} bài kiểm tra ẩn này bao gồm: ${test.tags.map((x) => tagText(x)).join(', ')}.` }) });
  }
  return logs;
}

function dedupeAnomalies(list: DetectedAnomaly[]): DetectedAnomaly[] {
  const byKey = new Map<string, { anomaly: DetectedAnomaly; extra: number }>();
  for (const a of list) {
    const key = a.testCaseId === undefined
      ? `${a.type}|${a.nodeId ?? ''}|${a.edgeId ?? ''}|${a.message}`
      : `${a.type}|${a.nodeId ?? ''}|${a.edgeId ?? ''}`;
    const hit = byKey.get(key);
    if (hit) hit.extra++;
    else byKey.set(key, { anomaly: a, extra: 0 });
  }
  return [...byKey.values()].map(({ anomaly, extra }) =>
    extra > 0 ? { ...anomaly, message: tr({ en: `${anomaly.message} (also in ${extra} other test${extra === 1 ? '' : 's'})`, vi: `${anomaly.message} (cũng có ở ${extra} bài kiểm tra khác)` }) } : anomaly,
  );
}

// evaluateChallenge

export function evaluateChallenge(graph: ProcessGraph, level: ChallengeLevel, options: EvaluateOptions = {}): EvaluationResult {
  const catalog = options.catalog ?? NODE_CATALOG;
  const variables = options.conditionVariables ?? CONDITION_VARIABLES;
  const evaluatedAt = (options.now ?? (() => new Date()))();
  const defs = new Map(catalog.map((d) => [d.id, d]));

  const staticFindings = validateGraph(graph, level, options);
  const runtimeAnomalies: DetectedAnomaly[] = [];
  const testResults: TestCaseResult[] = [];
  const testLogs: FeedbackLog[] = [];
  const unsetReads: UnsetFactRead[] = [];
  const passedLatencies: number[] = [];
  let passedWeight = 0;
  let totalWeight = 0;

  for (const test of level.testSuite) {
    const run = new ProcessRunner(graph, test, {
      runnerConfig: level.runnerConfig,
      catalog,
      conditionVariables: variables,
    }).runToCompletion();

    const reasons = judge(test, run);
    const weight = test.weight ?? 1;
    totalWeight += weight;
    const passed = reasons.length === 0;
    if (passed) {
      passedWeight += weight;
      passedLatencies.push(run.latencyMs);
    }

    runtimeAnomalies.push(...run.anomalies);
    for (const u of run.unsetFactReads) {
      if (!unsetReads.some((x) => x.edgeId === u.edgeId && x.fact === u.fact)) unsetReads.push(u);
    }

    const leaked = run.outcome === 'APPROVED' && test.inputPayload.isFraud;
    if (leaked) {
      const lastStep = pathSteps(run, run.decidingTokenId).at(-1);
      runtimeAnomalies.push({
        type: 'FRAUD_LEAKAGE',
        severity: 'ERROR',
        testCaseId: test.id,
        ...(lastStep ? { nodeId: lastStep.nodeId } : {}),
        message: tr({ en: 'A fraudulent transaction was approved. Catch it with the risk score before it reaches an Approved end.', vi: 'Một giao dịch gian lận đã được chấp thuận. Hãy bắt nó bằng điểm rủi ro trước khi nó tới sự kiện kết thúc Chấp thuận.' }),
      });
    }

    testResults.push({
      testCaseId: test.id,
      passed,
      expectedOutcome: test.expectedOutcome,
      actualOutcome: run.outcome,
      actualReasonCode: run.reasonCode,
      latencyMs: run.latencyMs,
      failureReasons: reasons,
      // A trace carries the payload, so a hidden test's trace is withheld unless an authoring tool asks.
      tokens: test.hidden && options.revealHidden !== true ? [] : run.tokens,
    });

    if (!passed) {
      testLogs.push(...explainFailure(test, run, reasons, { graph, catalog, reveal: !test.hidden || options.revealHidden === true }));
      if (leaked) {
        testLogs.push({ level: 'ERROR', testCaseId: test.id, message: tr({ en: `${test.name}${test.hidden ? ' (hidden test)' : ''}: this was a fraudulent transaction and your diagram approved it.`, vi: `${test.name}${test.hidden ? ' (bài kiểm tra ẩn)' : ''}: đây là giao dịch gian lận và sơ đồ của bạn đã chấp thuận nó.` }) });
      }
    }
  }

  // ── scores ──
  const anomalies = dedupeAnomalies([...staticFindings, ...runtimeAnomalies]);
  const errorCount = anomalies.filter((a) => a.severity === 'ERROR').length;
  const passCount = testResults.filter((r) => r.passed).length;
  const failCount = testResults.length - passCount;
  const base = totalWeight > 0 ? Math.round((100 * passedWeight) / totalWeight) : 0;
  const correctnessScore = Math.max(0, Math.min(100, base - errorCount * level.scoring.anomalyPenaltyPoints));
  const passed = correctnessScore >= level.scoring.passMark;

  const free = freeStarterNodeIds(graph, level, defs);
  const nodesUsed = graph.nodes.filter((n) => !free.has(n.id)).length;
  const avgLatency = passedLatencies.length ? passedLatencies.reduce((a, b) => a + b, 0) / passedLatencies.length : 0;
  const bench = level.scoring.efficiency;
  const nodeRatio = Math.min(1, bench.optimalNodeCount / Math.max(1, nodesUsed));
  const latencyRatio = avgLatency > 0 ? Math.min(1, bench.optimalAvgLatencyMs / avgLatency) : 1;
  const weightSum = bench.nodeCountWeight + bench.latencyWeight || 1;
  const efficiencyScore = passed
    ? Math.round((100 * (bench.nodeCountWeight * nodeRatio + bench.latencyWeight * latencyRatio)) / weightSum)
    : 0;

  // ── feedback ──
  const logs: FeedbackLog[] = [];
  logs.push({
    level: 'INFO',
    message: tr({
      en:
        `Passed ${passCount} of ${testResults.length} tests. Correctness ${correctnessScore}/100` +
        (errorCount > 0 ? ` (${errorCount} problem${errorCount === 1 ? '' : 's'} cost ${errorCount * level.scoring.anomalyPenaltyPoints} points)` : '') +
        (passed ? `. Level passed. Efficiency ${efficiencyScore}/100.` : `. Level not passed yet; you need ${level.scoring.passMark}.`),
      vi:
        `Đạt ${passCount}/${testResults.length} bài kiểm tra. Độ chính xác ${correctnessScore}/100` +
        (errorCount > 0 ? ` (${errorCount} vấn đề bị trừ ${errorCount * level.scoring.anomalyPenaltyPoints} điểm)` : '') +
        (passed ? `. Đã qua cấp độ. Hiệu quả ${efficiencyScore}/100.` : `. Chưa qua cấp độ; bạn cần ${level.scoring.passMark}.`),
    }),
  });
  for (const a of staticFindings) {
    logs.push({ level: a.severity === 'ERROR' ? 'ERROR' : 'WARN', message: a.message, ...(a.nodeId !== undefined ? { nodeId: a.nodeId } : {}) });
  }
  logs.push(...testLogs);
  for (const u of unsetReads) {
    const producer = variables.find((v) => v.name === u.fact)?.producedBy;
    logs.push({
      level: 'WARN',
      nodeId: u.nodeId,
      message:
        tr({
          en: `The decision '${labelOf(graph, u.nodeId)}' (edge ${u.edgeId}) reads '${u.fact}', but nothing on that path has set it yet`,
          vi: `Quyết định '${labelOf(graph, u.nodeId)}' (cạnh ${u.edgeId}) đọc '${u.fact}', nhưng chưa có gì trên nhánh đó đặt giá trị cho nó`,
        }) +
        (producer
          ? tr({ en: `; it comes from the ${capabilityLabel(catalog, producer)}. Put that step before this decision.`, vi: `; nó đến từ ${capabilityLabel(catalog, producer)}. Hãy đặt bước đó trước quyết định này.` })
          : '.'),
    });
  }
  if (passed) {
    if (nodesUsed > bench.optimalNodeCount) {
      logs.push({ level: 'HINT', message: tr({ en: `Your diagram uses ${nodesUsed} nodes; the benchmark is ${bench.optimalNodeCount}. Look for a node you can remove.`, vi: `Sơ đồ của bạn dùng ${nodesUsed} nút; chuẩn là ${bench.optimalNodeCount}. Hãy tìm một nút có thể bỏ.` }) });
    }
    if (avgLatency > bench.optimalAvgLatencyMs * 1.005) {
      logs.push({ level: 'HINT', message: tr({ en: `Average latency is ${avgLatency.toFixed(1)} ms against a benchmark of ${bench.optimalAvgLatencyMs} ms. Look for checks that run on requests that are already decided.`, vi: `Độ trễ trung bình là ${avgLatency.toFixed(1)} ms so với chuẩn ${bench.optimalAvgLatencyMs} ms. Hãy tìm các bước kiểm tra chạy trên yêu cầu đã được quyết định.` }) });
    }
  } else {
    logs.push({ level: 'INFO', message: tr({ en: 'Efficiency is scored once all tests pass.', vi: 'Hiệu quả chỉ được chấm khi mọi bài kiểm tra đều đạt.' }) });
  }

  return {
    id: options.newId?.() ?? `eval_${level.id}_${evaluatedAt.getTime().toString(36)}`,
    challengeId: level.id,
    graphId: graph.id,
    evaluatedAt: evaluatedAt.toISOString(),
    passed,
    passCount,
    failCount,
    correctnessScore,
    efficiencyScore,
    detectedAnomalies: anomalies,
    feedbackLogs: logs,
    testResults,
  };
}
