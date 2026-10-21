/**
 * Workflow store: the learner's diagram, as React Flow wants it, plus playback and grading state.
 *
 * Source of truth: `nodes` and `edges` (React Flow shapes, see graphConversion.ts). The pure
 * ProcessGraph that the engine runs and the evaluator grades is always rebuilt from them with
 * `getProcessGraph()`, never kept in parallel, so the two cannot drift apart.
 *
 * Playback is driven by calling `stepSimulation()`. The playback side has no timers, which keeps it
 * deterministic and testable. The canvas runs a small interval that calls it while `isRunning`.
 *
 * Progress is saved to the browser per level (see persistence.ts): every edit is autosaved after a
 * short delay, `loadChallenge` restores what was saved, and `resetToStarter` throws it away.
 */

import { nodeDefLabel, portLabel } from '../i18n/catalogVi';
import { labLabel } from '../i18n/labText';
import { tr } from '../i18n/locale';
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from '@xyflow/react';

import { CONDITION_VARIABLES, LEVELS, NODE_CATALOG } from '../data/seedChallenges';
import { evaluateChallenge } from '../engine/evaluator';
import { postTestResult } from '../engine/postings';
import { ProcessRunner, type RunEvent, type StepResult } from '../engine/processRunner';
import type {
  ChallengeLevel,
  ConditionVariable,
  ConfigValue,
  DetectedAnomaly,
  EvaluationResult,
  GLEntry,
  Id,
  NodeDefinition,
  Outcome,
  Port,
  ProcessGraph,
} from '../types/processLearning';
import {
  deriveActiveTokens,
  deriveEdgeTraffic,
  deriveNodeRuntime,
  detectAlarms,
  type ActiveToken,
  type EdgeTraffic,
  type NodeRuntime,
} from './liveSimulation';
import {
  attachAutosave,
  browserStorage,
  loadActiveLevelId,
  loadSavedDiagram,
  type Autosave,
  type KeyValueStorage,
  type SaveStatus,
} from './persistence';
import {
  fromProcessGraph,
  toFlowEdge,
  toFlowNode,
  toProcessGraph,
  type ProcessFlowEdge,
  type ProcessFlowNode,
  type XY,
} from './graphConversion';

// The animation layer's types live beside the code that derives them. Components import them from here.
export { deriveActiveTokens, deriveEdgeTraffic, deriveNodeRuntime, IDLE_RUNTIME } from './liveSimulation';
export type { ActiveToken, EdgeTraffic, NodeAlarm, NodeRunStatus, NodeRuntime, TokenChip, TokenLook } from './liveSimulation';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface Notice {
  /** Changes on every notice, so the UI can tell two identical messages apart. */
  seq: number;
  kind: 'info' | 'warn' | 'error';
  message: string;
}

export interface SimulationInfo {
  testCaseId: Id;
  testName: string;
  expectedOutcome: Outcome;
  finished: boolean;
  outcome: Outcome | 'NO_OUTCOME' | null;
  reasonCode: string | null;
  latencyMs: number | null;
  anomalies: DetectedAnomaly[];
  /** Null until the run finishes. */
  matchesExpected: boolean | null;
}

export interface PlaybackLogLine {
  tick: number;
  kind: 'step' | 'move' | 'fork' | 'join' | 'done' | 'fault' | 'anomaly';
  text: string;
}

export interface EdgePatch {
  /** Empty string or null clears it. */
  conditionExpression?: string | null;
  isDefault?: boolean;
  priority?: number | null;
  label?: string | null;
}

export type ConnectionCheck =
  | { ok: true; sourceHandle: Id; targetHandle: Id }
  | { ok: false; reason: string };

/** How a node or wire stands in a guided tour: the one being explained, behind us, still ahead, or not on this payment's path. */
export type SpotState = 'current' | 'seen' | 'ahead' | 'off';

/** Set only by a guided tour. The canvas dims what is `off` and lights the path. Null means no tour. */
export interface GraphSpotlight {
  nodes: Record<Id, SpotState>;
  edges: Record<Id, SpotState>;
}

export interface PaletteUsageRow {
  definitionId: Id;
  used: number;
  max: number | null;
  /** How many more the learner may place, counting both the per-node cap and the level budget. Null means unlimited. */
  remaining: number | null;
}

export interface PaletteUsage {
  rows: PaletteUsageRow[];
  placed: number;
  budget: number | null;
}

export interface WorkflowStoreConfig {
  levels?: readonly ChallengeLevel[];
  catalog?: readonly NodeDefinition[];
  conditionVariables?: readonly ConditionVariable[];
  /** Open this level first. Otherwise the level the learner last had open, otherwise the first. */
  initialLevelId?: Id;
  now?: () => Date;
  /** Where progress is saved. Null (the default) saves nothing, which keeps tests isolated. The app passes `browserStorage()`. */
  storage?: KeyValueStorage | null;
  /** Wait this long after the last edit before writing. Default 400 ms. */
  autosaveDelayMs?: number;
}

export interface WorkflowState {
  // Content
  levels: readonly ChallengeLevel[];
  catalog: readonly NodeDefinition[];
  conditionVariables: readonly ConditionVariable[];
  level: ChallengeLevel;
  graphId: Id;
  graphName: string;
  nodes: ProcessFlowNode[];
  edges: ProcessFlowEdge[];
  notice: Notice | null;
  /** Bumped when the canvas should re-centre on a freshly loaded diagram. */
  canvasEpoch: number;

  // Persistence
  saveStatus: SaveStatus;
  /** ISO time of the last write to storage for this level, or null. */
  lastSavedAt: string | null;

  // Playback
  isRunning: boolean;
  currentTick: number;
  /** Milliseconds one tick lasts while playing. Animations are timed from this. */
  playbackMs: number;
  activeTokens: ActiveToken[];
  nodeRuntime: Record<Id, NodeRuntime>;
  /** Edges a token travelled in the latest tick. */
  activeEdgeIds: Id[];
  /** Who travelled each of those edges, and what they look like. */
  edgeTraffic: Record<Id, EdgeTraffic[]>;
  /** Every edge a token has travelled in this simulation. */
  traversedEdgeIds: Id[];
  selectedTestId: Id | null;
  simulation: SimulationInfo | null;
  playbackLog: PlaybackLogLine[];
  /**
   * The general-ledger lines the replayed payment posted, once it has finished. Always derived from the finished run
   * (see engine/postings.ts), so it is empty while the payment is still travelling and for a payment that moved no money.
   */
  ledgerEntries: GLEntry[];
  /** A guided tour's dimming and glowing path. Null outside a tour. */
  spotlight: GraphSpotlight | null;

  // Grading
  lastEvaluationResult: EvaluationResult | null;
  /** True when the diagram has changed since lastEvaluationResult was produced. */
  isEvaluationStale: boolean;

  // Graph editing
  /** Opens a level: the learner's saved diagram if there is one, otherwise the level's starter graph. */
  loadChallenge: (levelId: Id) => boolean;
  loadGraph: (graph: ProcessGraph) => void;
  /** Discards this level's saved diagram and returns the canvas to the level's starter graph. */
  resetToStarter: () => void;
  /** Writes any edit still waiting for the autosave delay. Call when the page is hidden. */
  flushSave: () => void;
  addNode: (definitionId: Id, position: XY) => Id | null;
  updateNodeConfig: (nodeId: Id, key: string, value: ConfigValue) => boolean;
  updateNodeLabel: (nodeId: Id, label: string) => boolean;
  updateEdge: (edgeId: Id, patch: EdgePatch) => boolean;
  removeNode: (nodeId: Id) => boolean;
  removeEdge: (edgeId: Id) => boolean;
  /** Selects exactly this edge (used when a wire's label is clicked). */
  selectEdge: (edgeId: Id) => void;
  onNodesChange: (changes: NodeChange<ProcessFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<ProcessFlowEdge>[]) => void;
  onConnect: (connection: Connection) => boolean;
  canConnect: (connection: ConnectionLike) => ConnectionCheck;
  dismissNotice: () => void;

  // Grading
  getProcessGraph: () => ProcessGraph;
  runEvaluation: () => EvaluationResult;

  // Playback
  selectTest: (testCaseId: Id) => void;
  startSimulation: (testCaseId?: Id) => boolean;
  stepSimulation: () => void;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  resetSimulation: () => void;
  setPlaybackMs: (ms: number) => void;
}

export interface ConnectionLike {
  source: string | null;
  target: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported so they can be tested and reused by the UI)
// ─────────────────────────────────────────────────────────────────────────────

const portOf = (ports: readonly Port[], id: string | null | undefined): Port | undefined =>
  id ? ports.find((p) => p.id === id) : ports.length === 1 ? ports[0] : undefined;

/** Learner-placed nodes. Locked starter nodes are free, as in the evaluator. */
const isPlaced = (n: ProcessFlowNode): boolean => !n.data.node.locked;

export function computePaletteUsage(level: ChallengeLevel, nodes: readonly ProcessFlowNode[]): PaletteUsage {
  const budget = level.allowedNodePalette.totalNodeBudget;
  const placedNodes = nodes.filter(isPlaced);
  const placed = placedNodes.length;
  const rows = level.allowedNodePalette.entries.map((entry): PaletteUsageRow => {
    const used = placedNodes.filter((n) => n.data.node.definitionId === entry.nodeDefinitionId).length;
    const byType = entry.maxCount === null ? null : Math.max(0, entry.maxCount - used);
    const byBudget = budget === null ? null : Math.max(0, budget - placed);
    const remaining = byType === null ? byBudget : byBudget === null ? byType : Math.min(byType, byBudget);
    return { definitionId: entry.nodeDefinitionId, used, max: entry.maxCount, remaining };
  });
  return { rows, placed, budget };
}

/** Why a new node of this type may not be placed, or null when it may. */
export function paletteBlockReason(
  level: ChallengeLevel,
  catalog: readonly NodeDefinition[],
  nodes: readonly ProcessFlowNode[],
  definitionId: Id,
): string | null {
  const def = catalog.find((d) => d.id === definitionId);
  if (!def) return tr({ en: `Unknown node type '${definitionId}'.`, vi: `Loại nút không xác định '${definitionId}'.` });
  const usage = computePaletteUsage(level, nodes);
  const row = usage.rows.find((r) => r.definitionId === definitionId);
  if (!row) return tr({ en: `'${def.label}' is not available on this level.`, vi: `'${nodeDefLabel(def.id, def.label)}' không có ở cấp độ này.` });
  if (row.max !== null && row.used >= row.max) {
    return tr({ en: `This level allows ${row.max} '${def.label}' node${row.max === 1 ? '' : 's'}.`, vi: `Cấp độ này cho phép ${row.max} nút '${nodeDefLabel(def.id, def.label)}'.` });
  }
  if (usage.budget !== null && usage.placed >= usage.budget) {
    return tr({ en: `Node budget reached: this level allows ${usage.budget} nodes.`, vi: `Đã đạt giới hạn nút: cấp độ này cho phép ${usage.budget} nút.` });
  }
  return null;
}

/** Validates a wire before it is drawn. Also tells React Flow which handles to light up while dragging. */
export function checkConnection(
  nodes: readonly ProcessFlowNode[],
  edges: readonly ProcessFlowEdge[],
  c: ConnectionLike,
): ConnectionCheck {
  const from = nodes.find((n) => n.id === c.source)?.data.node;
  const to = nodes.find((n) => n.id === c.target)?.data.node;
  if (!from || !to) return { ok: false, reason: tr({ en: 'Both ends of a connection must be nodes on the canvas.', vi: 'Cả hai đầu của kết nối phải là nút trên canvas.' }) };
  if (from.id === to.id) return { ok: false, reason: tr({ en: `'${from.label}' cannot connect to itself. Route through another step to make a loop.`, vi: `'${labLabel(from.label)}' không thể nối với chính nó. Hãy đi qua một bước khác để tạo vòng.` }) };

  const out = portOf(from.outputPorts, c.sourceHandle);
  if (!out) return { ok: false, reason: tr({ en: `Start from an output handle on '${from.label}'.`, vi: `Hãy bắt đầu từ một điểm ra trên '${labLabel(from.label)}'.` }) };
  const inn = portOf(to.inputPorts, c.targetHandle);
  if (!inn) return { ok: false, reason: tr({ en: `End on an input handle on '${to.label}'.`, vi: `Hãy kết thúc ở một điểm vào trên '${labLabel(to.label)}'.` }) };

  const outUse = edges.filter((e) => e.source === from.id && e.sourceHandle === out.id).length;
  if (outUse >= out.maxEdges) {
    return { ok: false, reason: tr({ en: `'${out.label}' on '${from.label}' already has ${out.maxEdges === 1 ? 'a connection' : `${out.maxEdges} connections`}. Use another output.`, vi: `'${portLabel(out.label)}' trên '${labLabel(from.label)}' đã có ${out.maxEdges} kết nối. Hãy dùng cổng ra khác.` }) };
  }
  const inUse = edges.filter((e) => e.target === to.id && e.targetHandle === inn.id).length;
  if (inUse >= inn.maxEdges) {
    return { ok: false, reason: tr({ en: `'${inn.label}' on '${to.label}' is full (${inn.maxEdges}). Use another input.`, vi: `'${portLabel(inn.label)}' trên '${labLabel(to.label)}' đã đầy (${inn.maxEdges}). Hãy dùng cổng vào khác.` }) };
  }
  return { ok: true, sourceHandle: out.id, targetHandle: inn.id };
}

function firstFreeNodeId(definitionId: Id, nodes: readonly ProcessFlowNode[]): Id {
  const stem = definitionId.replace(/^nd_/, '');
  const taken = new Set(nodes.map((n) => n.id));
  let k = 1;
  while (taken.has(`n_${stem}_${k}`)) k++;
  return `n_${stem}_${k}`;
}

function nextEdgeId(edges: readonly ProcessFlowEdge[]): Id {
  let max = 0;
  for (const e of edges) {
    const m = /^e(\d+)$/.exec(e.id);
    if (m?.[1]) max = Math.max(max, Number(m[1]));
  }
  return `e${max + 1}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

const CLEAN_RUN = {
  isRunning: false,
  currentTick: 0,
  activeTokens: [] as ActiveToken[],
  nodeRuntime: {} as Record<Id, NodeRuntime>,
  activeEdgeIds: [] as Id[],
  edgeTraffic: {} as Record<Id, EdgeTraffic[]>,
  traversedEdgeIds: [] as Id[],
  simulation: null,
  playbackLog: [] as PlaybackLogLine[],
  ledgerEntries: [] as GLEntry[],
};

const MAX_LOG_LINES = 120;
export const DEFAULT_PLAYBACK_MS = 900;

const firstPlayableTest = (level: ChallengeLevel) => level.testSuite.find((t) => !t.hidden) ?? null;

export type WorkflowStore = StoreApi<WorkflowState>;

export function createWorkflowStore(config: WorkflowStoreConfig = {}): WorkflowStore {
  const levels = config.levels ?? LEVELS;
  const catalog = config.catalog ?? NODE_CATALOG;
  const conditionVariables = config.conditionVariables ?? CONDITION_VARIABLES;
  const now = config.now ?? (() => new Date());

  const storage = config.storage ?? null;
  const autosaveDelayMs = config.autosaveDelayMs ?? 400;

  const firstLevel =
    levels.find((l) => l.id === config.initialLevelId) ?? levels.find((l) => l.id === loadActiveLevelId(storage, levels)) ?? levels[0];
  if (!firstLevel) throw new Error('createWorkflowStore needs at least one challenge level.');

  /** The runner is not serialisable state, so it lives beside the store rather than in it. */
  let runner: ProcessRunner | null = null;
  let autosave: Autosave | null = null;
  let noticeSeq = 0;

  const makeNotice = (kind: Notice['kind'], message: string): Notice => ({ seq: ++noticeSeq, kind, message });

  const attemptId = (level: ChallengeLevel): Id => `g_attempt_${level.id}`;

  /**
   * The content a level opens with. With `restore`, the learner's saved diagram wins over the starter
   * graph, and a short notice says so (including anything that could not be brought back).
   */
  const contentFor = (level: ChallengeLevel, restore: boolean) => {
    const saved = restore ? loadSavedDiagram(storage, level, catalog) : null;
    const starter = level.starterGraph;
    const { nodes, edges } = saved ? fromProcessGraph(saved.graph) : starter ? fromProcessGraph(starter) : { nodes: [], edges: [] };
    const lost =
      saved && saved.dropped > 0
        ? tr({
            en: ` ${saved.dropped} piece${saved.dropped === 1 ? '' : 's'} could not be restored and ${saved.dropped === 1 ? 'was' : 'were'} left out.`,
            vi: ` ${saved.dropped} phần không khôi phục được và đã bị bỏ qua.`,
          })
        : '';
    return {
      level,
      graphId: attemptId(level),
      graphName: `${level.title}: my attempt`,
      nodes,
      edges,
      selectedTestId: firstPlayableTest(level)?.id ?? null,
      lastEvaluationResult: null,
      isEvaluationStale: false,
      notice: saved ? makeNotice('info', tr({ en: `Restored your saved diagram for Level ${level.levelNumber}.${lost}`, vi: `Đã khôi phục sơ đồ đã lưu của bạn cho Cấp độ ${level.levelNumber}.${lost}` })) : null,
      saveStatus: (storage === null ? 'unavailable' : saved ? 'saved' : 'pristine') as SaveStatus,
      lastSavedAt: saved?.savedAt ?? null,
    };
  };

  const store = createStore<WorkflowState>()((set, get) => {
    /** Anything that changes what the diagram means stops the playback and marks grading stale. */
    const invalidate = (): Partial<WorkflowState> => {
      runner = null;
      return { ...CLEAN_RUN, isEvaluationStale: true };
    };

    const warn = (message: string, kind: Notice['kind'] = 'warn'): void => set({ notice: makeNotice(kind, message) });

    const getProcessGraph = (): ProcessGraph => {
      const s = get();
      return toProcessGraph(s.nodes, s.edges, { id: s.graphId, name: s.graphName, challengeId: s.level.id }, now().toISOString());
    };

    const labelOf = (id: Id): string => {
      const label = get().nodes.find((n) => n.id === id)?.data.node.label;
      return label === undefined ? id : labLabel(label);
    };

    const describe = (e: RunEvent, tick: number): PlaybackLogLine | null => {
      switch (e.type) {
        case 'NODE_EXECUTED':
          return { tick, kind: 'step', text: tr({ en: `${e.tokenId} ran '${labelOf(e.nodeId)}' (${e.step.durationMs} ms)`, vi: `${e.tokenId} chạy '${labelOf(e.nodeId)}' (${e.step.durationMs} ms)` }) };
        case 'EDGE_TAKEN': {
          const why =
            e.reason === 'CONDITION'
              ? tr({ en: ' (condition matched)', vi: ' (điều kiện khớp)' })
              : e.reason === 'DEFAULT'
                ? tr({ en: ' (default branch)', vi: ' (nhánh mặc định)' })
                : e.reason === 'ERROR_PORT'
                  ? tr({ en: ' (error port)', vi: ' (cổng lỗi)' })
                  : '';
          return { tick, kind: 'move', text: `${e.tokenId}: '${labelOf(e.fromNodeId)}' → '${labelOf(e.toNodeId)}'${why}` };
        }
        case 'TOKEN_FORKED':
          return { tick, kind: 'fork', text: tr({ en: `${e.tokenId} forked into ${e.childTokenIds.length} parallel tokens at '${labelOf(e.nodeId)}'`, vi: `${e.tokenId} tách thành ${e.childTokenIds.length} token song song tại '${labelOf(e.nodeId)}'` }) };
        case 'JOIN_WAITING':
          return { tick, kind: 'join', text: tr({ en: `'${labelOf(e.nodeId)}' is waiting: ${e.arrived} of ${e.expected} branches have arrived`, vi: `'${labelOf(e.nodeId)}' đang chờ: ${e.arrived}/${e.expected} nhánh đã tới` }) };
        case 'JOIN_RELEASED':
          return { tick, kind: 'join', text: tr({ en: `'${labelOf(e.nodeId)}' released after ${e.elapsedMs} ms (the slowest branch)`, vi: `'${labelOf(e.nodeId)}' giải phóng sau ${e.elapsedMs} ms (nhánh chậm nhất)` }) };
        case 'TOKEN_COMPLETED':
          return { tick, kind: 'done', text: tr({ en: `${e.tokenId} finished: ${e.outcome}${e.reasonCode ? ` (${e.reasonCode})` : ''}`, vi: `${e.tokenId} hoàn tất: ${e.outcome}${e.reasonCode ? ` (${e.reasonCode})` : ''}` }) };
        case 'TOKEN_FAULTED':
          return {
            tick,
            kind: 'fault',
            text: tr({
              en: `${e.tokenId} ${e.state === 'DEADLOCKED' ? 'is stuck' : 'failed'}: ${e.exception.message}`,
              vi: `${e.tokenId} ${e.state === 'DEADLOCKED' ? 'bị kẹt' : 'thất bại'}: ${e.exception.message}`,
            }),
          };
        case 'ANOMALY':
          return { tick, kind: 'anomaly', text: e.anomaly.message };
        case 'TOKEN_SPAWNED':
          return null;
      }
    };

    /** Reads the runner and publishes what the canvas needs to draw. */
    const publishPlayback = (stepResult: StepResult | null, tick: number): void => {
      if (!runner) return;
      const s = get();
      const events = stepResult?.events ?? [];
      const taken = events.flatMap((e) => (e.type === 'EDGE_TAKEN' ? [e.edgeId] : []));
      const lines = events.flatMap((e) => {
        const line = describe(e, tick);
        return line ? [line] : [];
      });
      for (const { alarm } of detectAlarms(events, runner.tokens, tick)) {
        if (alarm.kind !== 'RECON_BREAK') lines.push({ tick, kind: 'anomaly', text: tr({ en: `ALARM: ${alarm.text}.`, vi: `CẢNH BÁO: ${alarm.text}.` }) });
      }

      let simulation = s.simulation;
      let ledgerEntries = s.ledgerEntries;
      const finished = runner.isDone;
      if (finished && simulation) {
        const r = runner.result();
        ledgerEntries = postTestResult({ actualOutcome: r.outcome, tokens: [...runner.tokens] });
        const test = s.level.testSuite.find((t) => t.id === simulation?.testCaseId);
        simulation = {
          ...simulation,
          finished: true,
          outcome: r.outcome,
          reasonCode: r.reasonCode,
          latencyMs: r.latencyMs,
          anomalies: r.anomalies,
          matchesExpected:
            test !== undefined &&
            r.outcome === test.expectedOutcome &&
            (test.expectedReasonCode === undefined || r.reasonCode === test.expectedReasonCode) &&
            r.anomalies.every((a) => a.severity !== 'ERROR'),
        };
      }

      set({
        currentTick: tick,
        activeTokens: deriveActiveTokens(runner.tokens),
        nodeRuntime: deriveNodeRuntime(
          s.nodes.map((n) => ({ id: n.id, type: n.data.node.type })),
          runner.tokens,
          s.nodeRuntime,
          stepResult,
          tick,
        ),
        activeEdgeIds: taken,
        edgeTraffic: deriveEdgeTraffic(events, runner.tokens, tick),
        traversedEdgeIds: [...new Set([...s.traversedEdgeIds, ...taken])],
        playbackLog: [...s.playbackLog, ...lines].slice(-MAX_LOG_LINES),
        simulation,
        ledgerEntries,
        isRunning: finished ? false : s.isRunning,
      });
    };

    return {
      levels,
      catalog,
      conditionVariables,
      ...contentFor(firstLevel, true),
      canvasEpoch: 0,
      playbackMs: DEFAULT_PLAYBACK_MS,
      spotlight: null,
      ...CLEAN_RUN,

      // ── loading ──────────────────────────────────────────────────────────

      loadChallenge: (levelId) => {
        const level = levels.find((l) => l.id === levelId);
        if (!level) {
          warn(tr({ en: `There is no level '${levelId}'.`, vi: `Không có cấp độ '${levelId}'.` }), 'error');
          return false;
        }
        runner = null;
        set({ ...contentFor(level, true), ...CLEAN_RUN, canvasEpoch: get().canvasEpoch + 1 });
        return true;
      },

      resetToStarter: () => {
        const s = get();
        runner = null;
        autosave?.discard(s.level);
        set({
          ...contentFor(s.level, false),
          ...CLEAN_RUN,
          canvasEpoch: s.canvasEpoch + 1,
          notice: makeNotice('info', tr({ en: 'Back to the starter graph. Your saved diagram for this level was cleared.', vi: 'Đã quay về sơ đồ khởi đầu. Sơ đồ đã lưu của bạn cho cấp độ này đã bị xóa.' })),
        });
      },

      flushSave: () => autosave?.flush(),

      loadGraph: (graph) => {
        const { nodes, edges } = fromProcessGraph(graph);
        set({ nodes, edges, ...invalidate(), lastEvaluationResult: null, notice: null });
      },

      // ── editing ──────────────────────────────────────────────────────────

      addNode: (definitionId, position) => {
        const s = get();
        const blocked = paletteBlockReason(s.level, s.catalog, s.nodes, definitionId);
        if (blocked) {
          warn(blocked);
          return null;
        }
        const def = s.catalog.find((d) => d.id === definitionId);
        if (!def) return null;

        const id = firstFreeNodeId(definitionId, s.nodes);
        const created = toFlowNode(
          {
            id,
            definitionId: def.id,
            type: def.type,
            label: def.label,
            bankingCapability: def.bankingCapability,
            inputPorts: def.inputPorts.map((p) => ({ ...p })),
            outputPorts: def.outputPorts.map((p) => ({ ...p })),
            configParams: Object.fromEntries(def.configSchema.map((c) => [c.key, c.defaultValue])),
          },
          { x: Math.round(position.x), y: Math.round(position.y) },
        );
        set({
          nodes: [...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), { ...created, selected: true }],
          edges: s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
          ...invalidate(),
          notice: null,
        });
        return id;
      },

      updateNodeConfig: (nodeId, key, value) => {
        const s = get();
        const target = s.nodes.find((n) => n.id === nodeId);
        if (!target) return false;
        const node = target.data.node;
        if (node.locked) {
          warn(tr({ en: `'${node.label}' is part of the starter diagram, so its settings are fixed.`, vi: `'${labLabel(node.label)}' thuộc sơ đồ khởi đầu, nên thiết lập của nó cố định.` }));
          return false;
        }
        const def = s.catalog.find((d) => d.id === node.definitionId);
        if (!def?.configSchema.some((c) => c.key === key)) return false;
        if (node.configParams[key] === value) return true;
        set({
          nodes: s.nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { node: { ...node, configParams: { ...node.configParams, [key]: value } } } } : n,
          ),
          ...invalidate(),
        });
        return true;
      },

      updateNodeLabel: (nodeId, label) => {
        const s = get();
        const target = s.nodes.find((n) => n.id === nodeId);
        if (!target || target.data.node.locked) return false;
        const clean = label.trim() === '' ? (s.catalog.find((d) => d.id === target.data.node.definitionId)?.label ?? target.data.node.label) : label;
        if (clean === target.data.node.label) return true;
        set({
          nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { node: { ...n.data.node, label: clean } } } : n)),
          ...invalidate(),
        });
        return true;
      },

      updateEdge: (edgeId, patch) => {
        const s = get();
        const edge = s.edges.find((e) => e.id === edgeId);
        if (!edge) return false;
        const fromXor = s.nodes.find((n) => n.id === edge.source)?.data.node.type === 'GATEWAY_XOR';

        const data = { ...edge.data };
        if (patch.label !== undefined) {
          if (patch.label === null || patch.label === '') delete data.label;
          else data.label = patch.label;
        }
        // Conditions, default and priority only mean something on an XOR's outgoing edges.
        if (fromXor) {
          if (patch.conditionExpression !== undefined) {
            if (patch.conditionExpression === null || patch.conditionExpression.trim() === '') delete data.conditionExpression;
            else {
              data.conditionExpression = patch.conditionExpression;
              delete data.isDefault; // writing a condition means this is no longer the fallback
            }
          }
          if (patch.priority !== undefined) {
            if (patch.priority === null || !Number.isFinite(patch.priority)) delete data.priority;
            else data.priority = patch.priority;
          }
          if (patch.isDefault !== undefined) {
            if (patch.isDefault) {
              data.isDefault = true;
              delete data.conditionExpression; // the fallback has no condition
            } else delete data.isDefault;
          }
        }

        const makesDefault = fromXor && patch.isDefault === true;
        set({
          edges: s.edges.map((e) => {
            if (e.id === edgeId) return { ...e, data };
            // At most one default per gateway: promoting this edge demotes its siblings.
            if (makesDefault && e.source === edge.source && e.data?.isDefault) {
              const rest = { ...e.data };
              delete rest.isDefault;
              return { ...e, data: rest };
            }
            return e;
          }),
          ...invalidate(),
        });
        return true;
      },

      removeNode: (nodeId) => {
        const s = get();
        const target = s.nodes.find((n) => n.id === nodeId);
        if (!target) return false;
        if (target.data.node.locked) {
          warn(tr({ en: `'${target.data.node.label}' is part of the starter diagram and cannot be deleted.`, vi: `'${labLabel(target.data.node.label)}' thuộc sơ đồ khởi đầu và không thể xóa.` }));
          return false;
        }
        set({
          nodes: s.nodes.filter((n) => n.id !== nodeId),
          edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
          ...invalidate(),
        });
        return true;
      },

      removeEdge: (edgeId) => {
        const s = get();
        if (!s.edges.some((e) => e.id === edgeId)) return false;
        set({ edges: s.edges.filter((e) => e.id !== edgeId), ...invalidate() });
        return true;
      },

      selectEdge: (edgeId) => {
        const s = get();
        set({
          nodes: s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
          edges: s.edges.map((e) => (e.selected !== (e.id === edgeId) ? { ...e, selected: e.id === edgeId } : e)),
        });
      },

      // ── React Flow callbacks ─────────────────────────────────────────────

      onNodesChange: (changes) => {
        const s = get();
        const locked = new Set(s.nodes.filter((n) => n.data.node.locked).map((n) => n.id));
        const allowed = changes.filter((c) => !(c.type === 'remove' && locked.has(c.id)));
        const removed = new Set(allowed.flatMap((c) => (c.type === 'remove' ? [c.id] : [])));
        const structural = allowed.some((c) => c.type === 'remove' || c.type === 'add' || c.type === 'replace');

        set({
          nodes: applyNodeChanges(allowed, s.nodes),
          // React Flow normally sends the edge removals itself. Doing it here too keeps the graph valid for any caller.
          edges: removed.size ? s.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)) : s.edges,
          ...(structural ? invalidate() : {}),
          ...(allowed.length !== changes.length
            ? { notice: makeNotice('warn', tr({ en: 'Starter nodes are locked. You can move them, but not delete them.', vi: 'Các nút khởi đầu bị khóa. Bạn có thể di chuyển, nhưng không thể xóa chúng.' })) }
            : {}),
        });
      },

      onEdgesChange: (changes) => {
        const s = get();
        const structural = changes.some((c) => c.type === 'remove' || c.type === 'add' || c.type === 'replace');
        set({ edges: applyEdgeChanges(changes, s.edges), ...(structural ? invalidate() : {}) });
      },

      onConnect: (connection) => {
        const s = get();
        const check = checkConnection(s.nodes, s.edges, connection);
        if (!check.ok) {
          warn(check.reason);
          return false;
        }
        const source = connection.source;
        const target = connection.target;
        if (!source || !target) return false;

        const fromXor = s.nodes.find((n) => n.id === source)?.data.node.type === 'GATEWAY_XOR';
        const priorities = s.edges.filter((e) => e.source === source).map((e) => e.data?.priority ?? 0);
        const created = toFlowEdge({
          id: nextEdgeId(s.edges),
          sourceNodeId: source,
          sourcePortId: check.sourceHandle,
          targetNodeId: target,
          targetPortId: check.targetHandle,
          // XOR branches are tried in priority order. New ones go last.
          ...(fromXor ? { priority: Math.max(0, ...priorities) + 1 } : {}),
        });
        set({
          // Select a new XOR branch so the condition editor opens straight away.
          edges: [...s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)), fromXor ? { ...created, selected: true } : created],
          ...invalidate(),
        });
        return true;
      },

      canConnect: (connection) => {
        const s = get();
        return checkConnection(s.nodes, s.edges, connection);
      },

      dismissNotice: () => set({ notice: null }),

      // ── grading ──────────────────────────────────────────────────────────

      getProcessGraph,

      runEvaluation: () => {
        const result = evaluateChallenge(getProcessGraph(), get().level, { catalog, conditionVariables });
        set({ lastEvaluationResult: result, isEvaluationStale: false });
        return result;
      },

      // ── playback ─────────────────────────────────────────────────────────

      selectTest: (testCaseId) => {
        const test = get().level.testSuite.find((t) => t.id === testCaseId);
        if (!test || test.hidden) return;
        runner = null;
        set({ ...CLEAN_RUN, selectedTestId: testCaseId });
      },

      startSimulation: (testCaseId) => {
        const s = get();
        const wanted = testCaseId ?? s.selectedTestId ?? firstPlayableTest(s.level)?.id;
        const test = s.level.testSuite.find((t) => t.id === wanted);
        if (!test) {
          warn(tr({ en: 'Pick a test to run.', vi: 'Hãy chọn một bài kiểm tra để chạy.' }));
          return false;
        }
        if (test.hidden) {
          // A playback shows the payload. Hidden tests are only ever graded, never replayed.
          warn(tr({ en: 'Hidden tests are graded when you submit. They cannot be replayed.', vi: 'Bài kiểm tra ẩn được chấm khi bạn nộp bài. Chúng không thể phát lại.' }));
          return false;
        }
        runner = new ProcessRunner(getProcessGraph(), test, { runnerConfig: s.level.runnerConfig, catalog, conditionVariables });
        set({
          ...CLEAN_RUN,
          selectedTestId: test.id,
          isRunning: true,
          simulation: {
            testCaseId: test.id,
            testName: test.name,
            expectedOutcome: test.expectedOutcome,
            finished: false,
            outcome: null,
            reasonCode: null,
            latencyMs: null,
            anomalies: [],
            matchesExpected: null,
          },
          notice: null,
        });
        publishPlayback(null, 0);
        return true;
      },

      stepSimulation: () => {
        if (!runner) {
          // Step with nothing loaded starts a paused run, like a debugger's first "step".
          if (get().startSimulation()) set({ isRunning: false });
          return;
        }
        if (runner.isDone) return;
        const result = runner.step();
        publishPlayback(result, get().currentTick + 1);
      },

      pauseSimulation: () => set({ isRunning: false }),

      resumeSimulation: () => {
        if (runner && !runner.isDone) set({ isRunning: true });
      },

      resetSimulation: () => {
        runner = null;
        set({ ...CLEAN_RUN });
      },

      setPlaybackMs: (ms) => {
        if (Number.isFinite(ms) && ms >= 50) set({ playbackMs: Math.round(ms) });
      },
    };
  });

  autosave = attachAutosave(store, { storage, delayMs: autosaveDelayMs, now });
  return store;
}

// ─────────────────────────────────────────────────────────────────────────────
// App-wide instance and React hook
// ─────────────────────────────────────────────────────────────────────────────

export const workflowStore = createWorkflowStore({ storage: browserStorage() });

/**
 * Which store the components below read. The app uses the one shared store; a guided tour gives its own canvas a
 * separate store, so a tour can run a diagram without touching the learner's.
 */
const StoreContext = createContext<WorkflowStore>(workflowStore);
export const WorkflowStoreProvider = StoreContext.Provider;

export function useWorkflowStore<T>(selector: (state: WorkflowState) => T): T {
  return useStore(useContext(StoreContext), selector);
}

/**
 * After a language switch: the grader's feedback, the playback log and the last notice were written in the old language.
 * A fresh grade is re-run in the new one (only when it still describes the diagram on the canvas), the playback is cleared
 * and the notice dropped. Nothing about the diagram changes.
 */
export function relocalizeWorkflow(store: typeof workflowStore = workflowStore): void {
  const s = store.getState();
  if (s.notice) s.dismissNotice();
  if (s.simulation) s.resetSimulation();
  if (s.lastEvaluationResult && !s.isEvaluationStale) s.runEvaluation();
}
