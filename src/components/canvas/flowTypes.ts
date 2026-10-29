import type { EdgeTypes, NodeTypes } from '@xyflow/react';
import { ProcessEdgeView } from './edges/ProcessEdgeView';
import { EventNode } from './nodes/EventNode';
import { GatewayNode } from './nodes/GatewayNode';
import { TaskNode } from './nodes/TaskNode';

/** How the diagram's boxes and wires are drawn. */
export const nodeTypes = { task: TaskNode, gateway: GatewayNode, event: EventNode } satisfies NodeTypes;
export const edgeTypes = { process: ProcessEdgeView } satisfies EdgeTypes;
