import type { CSSProperties } from 'react';
import { portLabel } from '../../../i18n/catalogVi';
import { tr } from '../../../i18n/locale';
import { Handle, Position, useNodeId } from '@xyflow/react';
import { useWorkflowStore } from '../../../store/workflowStore';
import type { Port } from '../../../types/processLearning';

interface Props {
  port: Port;
  /** Input ports are React Flow "target" handles, output ports are "source" handles. */
  side: Position;
  accent: string;
  /** Offsets the handle along the node border. Pass left/top percentages to fan several ports out. */
  style?: CSSProperties;
  /** Text next to the handle, for ports whose meaning is not obvious (the error port). */
  caption?: string;
}

const ERROR_COLOR = '#fb7185';

/** One port on a node. */
export function PortHandle({ port, side, accent, style, caption }: Props) {
  const nodeId = useNodeId();
  const isInput = port.direction === 'IN';
  const connected = useWorkflowStore((s) =>
    s.edges.some((e) =>
      isInput ? e.target === nodeId && e.targetHandle === port.id : e.source === nodeId && e.sourceHandle === port.id,
    ),
  );
  const color = port.role === 'ERROR' ? ERROR_COLOR : accent;

  return (
    <>
      <Handle
        id={port.id}
        type={isInput ? 'target' : 'source'}
        position={side}
        title={`${portLabel(port.label)}${port.role === 'ERROR' ? tr({ en: ' (error path)', vi: ' (nhánh lỗi)' }) : ''}`}
        className="pc-handle"
        style={{
          width: 13,
          height: 13,
          background: connected ? color : '#0b1220',
          border: `2px solid ${color}`,
          opacity: connected ? 1 : 0.85,
          ...style,
        }}
      />
      {caption && (
        <span
          className="pointer-events-none absolute whitespace-nowrap text-[10px] font-medium"
          style={{
            color,
            ...(side === Position.Bottom ? { top: '100%', left: style?.left ?? '50%', transform: 'translate(-50%, 9px)' } : {}),
          }}
        >
          {caption}
        </span>
      )}
    </>
  );
}
