/** Saving the learner's diagram in the browser, one slot per level. key processcraft:v1:diagram:<levelId> the nodes, wires and every wire's condition key processcraft:v1:active-level the level to reopen on the next visit What is stored is the pure graph (ProcessNode / ProcessEdge, with positions), never React Flow's own bookkeeping (selection, measured size). */

import type { StoreApi } from 'zustand/vanilla';
import type {
  ChallengeLevel,
  ConfigParamDef,
  ConfigValue,
  Id,
  NodeDefinition,
  ProcessEdge,
  ProcessGraph,
  ProcessNode,
} from '../types/processLearning';
import { fromProcessGraph, toProcessGraph, type ProcessFlowEdge, type ProcessFlowNode } from './graphConversion';

// Storage access

/** The slice of the Web Storage API this file uses. `localStorage` satisfies it. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_VERSION = 1;
const KEY_PREFIX = `processcraft:v${STORAGE_VERSION}:`;
export const ACTIVE_LEVEL_KEY = `${KEY_PREFIX}active-level`;
export const diagramKey = (levelId: Id): string => `${KEY_PREFIX}diagram:${levelId}`;

/** `window.localStorage`, or null when the browser refuses it (private windows, blocked site data, no DOM at all). */
export function browserStorage(): KeyValueStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    const s = window.localStorage;
    const probe = `${KEY_PREFIX}probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** An in-memory storage with the same shape. Used by tests, and handy for a "demo" mode. */
export function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { dump(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    dump: () => Object.fromEntries(data),
  };
}

function safeGet(storage: KeyValueStorage | null, key: string): string | null {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}

// Encoding

export interface SavedDiagram {
  version: typeof STORAGE_VERSION;
  levelId: Id;
  savedAt: string;
  nodes: ProcessNode[];
  edges: ProcessEdge[];
}

export interface DiagramSource {
  level: ChallengeLevel;
  nodes: readonly ProcessFlowNode[];
  edges: readonly ProcessFlowEdge[];
}

/** The part of a save that says what the diagram is, with no timestamp. */
export function diagramBody(source: DiagramSource): string {
  const graph = toProcessGraph(source.nodes, source.edges, { id: 'saved', name: 'saved' });
  return JSON.stringify({ version: STORAGE_VERSION, levelId: source.level.id, nodes: graph.nodes, edges: graph.edges });
}

export function encodeDiagram(source: DiagramSource, savedAt: string): string {
  const graph = toProcessGraph(source.nodes, source.edges, { id: 'saved', name: 'saved' });
  const record: SavedDiagram = { version: STORAGE_VERSION, levelId: source.level.id, savedAt, nodes: graph.nodes, edges: graph.edges };
  return JSON.stringify(record);
}

/** The body of the level exactly as it first opens: starter nodes, no learner work. */
export function pristineBody(level: ChallengeLevel): string {
  const { nodes, edges } = level.starterGraph ? fromProcessGraph(level.starterGraph) : { nodes: [], edges: [] };
  return diagramBody({ level, nodes, edges });
}

// Decoding (untrusted input)

export interface RestoredDiagram {
  graph: ProcessGraph;
  savedAt: string | null;
  /** Pieces that could not be restored (unknown node types, wires to nodes that no longer exist). */
  dropped: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readConfigValue(def: ConfigParamDef, v: unknown): ConfigValue | undefined {
  switch (def.type) {
    case 'number':
      return isFiniteNumber(v) ? v : undefined;
    case 'boolean':
      return typeof v === 'boolean' ? v : undefined;
    case 'enum':
    case 'string':
      return isString(v) ? v : undefined;
  }
}

/** Rebuilds one node from what was saved. */
function rebuildNode(raw: unknown, defs: ReadonlyMap<Id, NodeDefinition>, lockedStarter: ReadonlyMap<Id, ProcessNode>): ProcessNode | null {
  if (!isRecord(raw) || !isString(raw.id) || raw.id === '') return null;
  const starter = lockedStarter.get(raw.id);
  const definitionId = starter ? starter.definitionId : raw.definitionId;
  const def = isString(definitionId) ? defs.get(definitionId) : undefined;
  if (!def) return null;

  const position =
    isRecord(raw.position) && isFiniteNumber(raw.position.x) && isFiniteNumber(raw.position.y)
      ? { x: raw.position.x, y: raw.position.y }
      : starter?.position;

  if (starter) {
    // The level decides what a locked node is. The learner may only have moved it.
    return { ...structuredClone(starter), ...(position ? { position } : {}) };
  }

  const saved = isRecord(raw.configParams) ? raw.configParams : {};
  const configParams: Record<string, ConfigValue> = {};
  for (const param of def.configSchema) {
    configParams[param.key] = readConfigValue(param, saved[param.key]) ?? param.defaultValue;
  }
  return {
    id: raw.id,
    definitionId: def.id,
    type: def.type,
    label: isString(raw.label) && raw.label.trim() !== '' ? raw.label : def.label,
    bankingCapability: def.bankingCapability,
    inputPorts: def.inputPorts.map((p) => ({ ...p })),
    outputPorts: def.outputPorts.map((p) => ({ ...p })),
    configParams,
    ...(position ? { position } : {}),
  };
}

function rebuildEdge(raw: unknown, nodes: ReadonlyMap<Id, ProcessNode>): ProcessEdge | null {
  if (!isRecord(raw)) return null;
  const { id, sourceNodeId, sourcePortId, targetNodeId, targetPortId } = raw;
  if (!isString(id) || !isString(sourceNodeId) || !isString(sourcePortId) || !isString(targetNodeId) || !isString(targetPortId)) return null;
  const from = nodes.get(sourceNodeId);
  const to = nodes.get(targetNodeId);
  if (!from || !to) return null;
  if (!from.outputPorts.some((p) => p.id === sourcePortId) || !to.inputPorts.some((p) => p.id === targetPortId)) return null;

  const edge: ProcessEdge = { id, sourceNodeId, sourcePortId, targetNodeId, targetPortId };
  if (isString(raw.conditionExpression) && raw.conditionExpression.trim() !== '') edge.conditionExpression = raw.conditionExpression;
  if (raw.isDefault === true) edge.isDefault = true;
  if (isFiniteNumber(raw.priority)) edge.priority = raw.priority;
  if (isString(raw.label) && raw.label !== '') edge.label = raw.label;
  return edge;
}

/** Turns a stored string into a graph for `level`, or null when there is nothing usable (no entry, not JSON, another format version, or an entry that belongs to another level). */
export function decodeDiagram(raw: string | null, level: ChallengeLevel, catalog: readonly NodeDefinition[]): RestoredDiagram | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION || parsed.levelId !== level.id) return null;
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;

  const defs = new Map(catalog.map((d) => [d.id, d]));
  const lockedStarter = new Map((level.starterGraph?.nodes ?? []).filter((n) => n.locked).map((n) => [n.id, n]));

  let dropped = 0;
  const nodes = new Map<Id, ProcessNode>();
  for (const rawNode of parsed.nodes as unknown[]) {
    const node = rebuildNode(rawNode, defs, lockedStarter);
    if (!node || nodes.has(node.id)) dropped++;
    else nodes.set(node.id, node);
  }
  // A starter node that is missing from the save comes back. The level cannot be played without it.
  for (const [id, starter] of lockedStarter) if (!nodes.has(id)) nodes.set(id, structuredClone(starter));

  const edges = new Map<Id, ProcessEdge>();
  for (const rawEdge of parsed.edges as unknown[]) {
    const edge = rebuildEdge(rawEdge, nodes);
    if (!edge || edges.has(edge.id)) dropped++;
    else edges.set(edge.id, edge);
  }

  return {
    graph: { id: `g_restored_${level.id}`, name: `${level.title}: my attempt`, challengeId: level.id, nodes: [...nodes.values()], edges: [...edges.values()] },
    savedAt: isString(parsed.savedAt) ? parsed.savedAt : null,
    dropped,
  };
}

/** Reads and decodes the saved diagram for a level. Never throws. */
export function loadSavedDiagram(storage: KeyValueStorage | null, level: ChallengeLevel, catalog: readonly NodeDefinition[]): RestoredDiagram | null {
  return decodeDiagram(safeGet(storage, diagramKey(level.id)), level, catalog);
}

/** The level to reopen, if one was saved and still exists. */
export function loadActiveLevelId(storage: KeyValueStorage | null, levels: readonly ChallengeLevel[]): Id | null {
  const id = safeGet(storage, ACTIVE_LEVEL_KEY);
  return id !== null && levels.some((l) => l.id === id) ? id : null;
}

// Autosave

/** - unavailable the browser gives no storage, so nothing is being saved - pristine the level is exactly as it starts. */
export type SaveStatus = 'unavailable' | 'pristine' | 'pending' | 'saved' | 'error';

/** The part of the workflow state autosave reads and writes. */
export interface AutosaveState extends DiagramSource {
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
}

export interface AutosaveOptions {
  storage: KeyValueStorage | null;
  /** How long after the last change the write happens. Dragging a node changes the diagram every frame. */
  delayMs: number;
  now: () => Date;
}

export interface Autosave {
  /** Writes any waiting change straight away. Call when the page is hidden or closed. */
  flush(): void;
  /** Forgets the saved diagram for this level and any change still waiting. Leaves the live state alone. */
  discard(level: ChallengeLevel): void;
  /** Stops listening and drops any waiting change. */
  dispose(): void;
}

export function attachAutosave<S extends AutosaveState>(store: StoreApi<S>, options: AutosaveOptions): Autosave {
  const { storage, delayMs, now } = options;
  const pristineCache = new Map<Id, string>();
  const pristineOf = (level: ChallengeLevel): string => {
    let body = pristineCache.get(level.id);
    if (body === undefined) {
      body = pristineBody(level);
      pristineCache.set(level.id, body);
    }
    return body;
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  /** The diagram body most recently written, restored or started from, for the level on screen. */
  let lastBody = diagramBody(store.getState());

  const report = (saveStatus: SaveStatus, lastSavedAt?: string | null): void => {
    const s = store.getState();
    if (s.saveStatus === saveStatus && (lastSavedAt === undefined || s.lastSavedAt === lastSavedAt)) return;
    store.setState({ saveStatus, ...(lastSavedAt !== undefined ? { lastSavedAt } : {}) } as Partial<S>);
  };

  const cancelTimer = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const write = (source: DiagramSource, reportStatus: boolean): void => {
    cancelTimer();
    const body = diagramBody(source);
    lastBody = body;
    const key = diagramKey(source.level.id);
    if (!storage) {
      if (reportStatus) report('unavailable');
      return;
    }
    try {
      if (body === pristineOf(source.level)) {
        storage.removeItem(key);
        if (reportStatus) report('pristine', null);
      } else {
        const savedAt = now().toISOString();
        storage.setItem(key, encodeDiagram(source, savedAt));
        if (reportStatus) report('saved', savedAt);
      }
    } catch {
      if (reportStatus) report('error');
    }
  };

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.level !== prev.level) {
      // Leaving a level: whatever was waiting belongs to it, so write that before anything else.
      if (timer !== null) write(prev, false);
      lastBody = diagramBody(s);
      try {
        storage?.setItem(ACTIVE_LEVEL_KEY, s.level.id);
      } catch {
        /* the status line already says saving is unavailable or failing */
      }
      return;
    }
    if (s.nodes === prev.nodes && s.edges === prev.edges) return;

    const body = diagramBody(s);
    if (body === lastBody) return; // a click or a pan, not an edit
    if (!storage) {
      lastBody = body;
      report('unavailable');
      return;
    }
    cancelTimer();
    report('pending');
    timer = setTimeout(() => write(store.getState(), true), delayMs);
  });

  try {
    storage?.setItem(ACTIVE_LEVEL_KEY, store.getState().level.id);
  } catch {
    /* see above */
  }

  return {
    flush: () => {
      if (timer !== null) write(store.getState(), true);
    },
    discard: (level) => {
      cancelTimer();
      lastBody = pristineOf(level);
      try {
        storage?.removeItem(diagramKey(level.id));
      } catch {
        /* nothing to do: the live state is reset either way */
      }
    },
    dispose: () => {
      cancelTimer();
      unsubscribe();
    },
  };
}
