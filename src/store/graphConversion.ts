/** Pure conversion between the React Flow world (what the canvas draws) and the ProcessGraph world (what the engine runs and the evaluator grades). */

import type { Edge, Node } from '@xyflow/react';
import type { Id, NodeType, Port, ProcessEdge, ProcessGraph, ProcessNode } from '../types/processLearning';

// React Flow shapes

export type FlowNodeKind = 'task' | 'gateway' | 'event';

export type ProcessNodeData = {
  /** The pure node. `position` is deliberately absent: React Flow owns it. */
  node: Omit<ProcessNode, 'position'>;
};

export type ProcessFlowNode = Node<ProcessNodeData, FlowNodeKind>;

export type ProcessEdgeData = {
  conditionExpression?: string;
  isDefault?: boolean;
  priority?: number;
  label?: string;
};

export type ProcessFlowEdge = Edge<ProcessEdgeData, 'process'>;

export interface GraphMeta {
  id: Id;
  name: string;
  challengeId?: Id;
}

export interface XY {
  x: number;
  y: number;
}

// Node and edge kinds

export function flowKindOf(type: NodeType): FlowNodeKind {
  switch (type) {
    case 'TASK':
      return 'task';
    case 'GATEWAY_XOR':
    case 'GATEWAY_AND':
      return 'gateway';
    case 'EVENT_START':
    case 'EVENT_END':
      return 'event';
  }
}

// ProcessGraph → React Flow

function withoutPosition(node: ProcessNode): ProcessNodeData['node'] {
  const copy: ProcessNode = structuredClone(node);
  delete copy.position;
  return copy;
}

export function toFlowNode(node: ProcessNode, position: XY): ProcessFlowNode {
  return {
    id: node.id,
    type: flowKindOf(node.type),
    position: { x: position.x, y: position.y },
    data: { node: withoutPosition(node) },
    // Starter nodes stay on the canvas. They can still be moved: position is layout only.
    deletable: !node.locked,
  };
}

export function toFlowEdge(edge: ProcessEdge): ProcessFlowEdge {
  const data: ProcessEdgeData = {};
  if (edge.conditionExpression !== undefined) data.conditionExpression = edge.conditionExpression;
  if (edge.isDefault !== undefined) data.isDefault = edge.isDefault;
  if (edge.priority !== undefined) data.priority = edge.priority;
  if (edge.label !== undefined) data.label = edge.label;
  return {
    id: edge.id,
    type: 'process',
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    sourceHandle: edge.sourcePortId,
    targetHandle: edge.targetPortId,
    data,
  };
}

const COLUMN_WIDTH = 300;
const ROW_HEIGHT = 170;
const LAYOUT_ORIGIN: XY = { x: 60, y: 80 };

/** Left-to-right layers by breadth-first distance from the Start event. */
export function autoLayout(graph: ProcessGraph): Map<Id, XY> {
  const next = new Map<Id, Id[]>();
  for (const e of graph.edges) {
    const list = next.get(e.sourceNodeId);
    if (list) list.push(e.targetNodeId);
    else next.set(e.sourceNodeId, [e.targetNodeId]);
  }

  const depth = new Map<Id, number>();
  const queue: Id[] = graph.nodes.filter((n) => n.type === 'EVENT_START').map((n) => n.id);
  for (const id of queue) depth.set(id, 0);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (id === undefined) continue;
    const d = depth.get(id) ?? 0;
    for (const to of next.get(id) ?? []) {
      if (!depth.has(to)) {
        depth.set(to, d + 1);
        queue.push(to);
      }
    }
  }
  // Anything the Start event cannot reach goes in a final column so it is still visible.
  const lastColumn = (depth.size ? Math.max(...depth.values()) : -1) + 1;
  for (const n of graph.nodes) if (!depth.has(n.id)) depth.set(n.id, lastColumn);

  const rowsUsed = new Map<number, number>();
  const out = new Map<Id, XY>();
  for (const n of graph.nodes) {
    const column = depth.get(n.id) ?? 0;
    const row = rowsUsed.get(column) ?? 0;
    rowsUsed.set(column, row + 1);
    out.set(n.id, { x: LAYOUT_ORIGIN.x + column * COLUMN_WIDTH, y: LAYOUT_ORIGIN.y + row * ROW_HEIGHT });
  }
  return out;
}

export function fromProcessGraph(graph: ProcessGraph): { nodes: ProcessFlowNode[]; edges: ProcessFlowEdge[] } {
  const layout = autoLayout(graph);
  return {
    nodes: graph.nodes.map((n) => toFlowNode(n, n.position ?? layout.get(n.id) ?? LAYOUT_ORIGIN)),
    edges: graph.edges.map(toFlowEdge),
  };
}

// React Flow → ProcessGraph

export function toProcessNode(flow: ProcessFlowNode): ProcessNode {
  return {
    ...structuredClone(flow.data.node),
    id: flow.id,
    position: { x: flow.position.x, y: flow.position.y },
  };
}

/** React Flow can leave a handle id null when a node has a single handle on that side. */
function resolvePortId(handle: string | null | undefined, ports: readonly Port[] | undefined): Id {
  if (handle) return handle;
  return ports && ports.length === 1 && ports[0] ? ports[0].id : '';
}

export function toProcessEdge(flow: ProcessFlowEdge, nodesById: ReadonlyMap<Id, ProcessFlowNode>): ProcessEdge {
  const source = nodesById.get(flow.source)?.data.node;
  const target = nodesById.get(flow.target)?.data.node;
  const edge: ProcessEdge = {
    id: flow.id,
    sourceNodeId: flow.source,
    sourcePortId: resolvePortId(flow.sourceHandle, source?.outputPorts),
    targetNodeId: flow.target,
    targetPortId: resolvePortId(flow.targetHandle, target?.inputPorts),
  };
  const d = flow.data;
  if (d?.conditionExpression !== undefined && d.conditionExpression.trim() !== '') edge.conditionExpression = d.conditionExpression;
  if (d?.isDefault) edge.isDefault = true;
  if (d?.priority !== undefined) edge.priority = d.priority;
  if (d?.label !== undefined && d.label !== '') edge.label = d.label;
  return edge;
}

export function toProcessGraph(
  nodes: readonly ProcessFlowNode[],
  edges: readonly ProcessFlowEdge[],
  meta: GraphMeta,
  updatedAt?: string,
): ProcessGraph {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return {
    id: meta.id,
    name: meta.name,
    ...(meta.challengeId !== undefined ? { challengeId: meta.challengeId } : {}),
    nodes: nodes.map(toProcessNode),
    edges: edges.map((e) => toProcessEdge(e, byId)),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

// Placement

/** Rough footprint of each kind of node, used to keep click-to-add from stacking nodes on top of each other. */
export const NODE_FOOTPRINT: Record<FlowNodeKind, { width: number; height: number }> = {
  task: { width: 240, height: 170 },
  gateway: { width: 120, height: 150 },
  event: { width: 220, height: 64 },
};

/** The free spot nearest `around` where a box of `size` fits without touching an existing node. */
export function findFreeSpot(nodes: readonly ProcessFlowNode[], around: XY, size: { width: number; height: number }): XY {
  const gap = 24;
  const boxes = nodes.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    w: n.measured?.width ?? NODE_FOOTPRINT[n.type ?? 'task'].width,
    h: n.measured?.height ?? NODE_FOOTPRINT[n.type ?? 'task'].height,
  }));
  const isFree = (p: XY): boolean =>
    boxes.every((b) => p.x + size.width + gap <= b.x || b.x + b.w + gap <= p.x || p.y + size.height + gap <= b.y || b.y + b.h + gap <= p.y);

  const stepX = size.width + gap;
  const stepY = size.height + gap;
  const candidates: Array<XY & { distance: number }> = [];
  for (let dx = -6; dx <= 6; dx++) {
    for (let dy = -4; dy <= 4; dy++) {
      // Bias to the right: a process reads left to right.
      candidates.push({ x: around.x + dx * stepX, y: around.y + dy * stepY, distance: Math.hypot(dx * stepX, dy * stepY) + (dx < 0 ? 1 : 0) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const found = candidates.find((c) => isFree(c));
  return found ? { x: found.x, y: found.y } : around;
}
