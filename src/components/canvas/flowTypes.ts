import type { EdgeTypes, NodeTypes } from '@xyflow/react';
import { ProcessEdgeView } from './edges/ProcessEdgeView';
import { EventNode } from './nodes/EventNode';
import { GatewayNode } from './nodes/GatewayNode';
import { TaskNode } from './nodes/TaskNode';

/**
 * How the diagram's boxes and wires are drawn. Defined once, outside any component: React Flow re-mounts every node if these
 * objects change identity. Shared by the learner's canvas and the guided tour's read-only canvas, so the two always look alike.
 */
export const nodeTypes = { task: TaskNode, gateway: GatewayNode, event: EventNode } satisfies NodeTypes;
export const edgeTypes = { process: ProcessEdgeView } satisfies EdgeTypes;
