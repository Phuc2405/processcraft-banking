import { memo } from 'react';
import { Position, type NodeProps } from '@xyflow/react';
import type { ProcessFlowNode } from '../../../store/graphConversion';
import { IDLE_RUNTIME, useWorkflowStore } from '../../../store/workflowStore';
import { CATEGORY_THEME } from '../nodeTheme';
import { AlarmBadge, AlarmRing, CongestionBadges, DroppedToken, FrostOverlay, TokenDock } from './NodeReactions';
import { PortHandle } from './PortHandle';

const SIZE = 108;

/** Left/top (as %) of the i-th of n handles, laid along a diamond's slanted edge so each sits on the outline. */
function diamondSpot(side: 'left' | 'right', i: number, n: number): { left: string; top: string } {
  const y = ((i + 1) / (n + 1)) * 100;
  const inset = Math.abs(y - 50); // distance of the left edge from the left border at height y
  return { left: `${side === 'left' ? inset : 100 - inset}%`, top: `${y}%` };
}

const STROKE = {
  IDLE: '#818cf8',
  QUEUED: '#38bdf8',
  PROCESSING: '#fbbf24',
  WAITING: '#fb923c',
  DONE: '#34d399',
  FAULTED: '#fb7185',
  FROZEN: '#7dd3fc',
} as const;

function GatewayNodeView({ id, data, selected }: NodeProps<ProcessFlowNode>) {
  const node = data.node;
  const isXor = node.type === 'GATEWAY_XOR';
  const runtime = useWorkflowStore((s) => s.nodeRuntime[id] ?? IDLE_RUNTIME);
  const incoming = useWorkflowStore((s) => s.edges.filter((e) => e.target === id).length);
  const outgoing = useWorkflowStore((s) => s.edges.filter((e) => e.source === id).length);

  const accent = CATEGORY_THEME.ROUTING.accent;
  const stroke = runtime.alarm ? '#ef4444' : selected && runtime.status === 'IDLE' ? '#38bdf8' : STROKE[runtime.status];
  const glow = runtime.alarm
    ? 'drop-shadow(0 0 12px rgba(239,68,68,0.85))'
    : runtime.status === 'PROCESSING'
      ? 'drop-shadow(0 0 10px rgba(251,191,36,0.75))'
      : runtime.status === 'FAULTED'
        ? 'drop-shadow(0 0 10px rgba(244,63,94,0.75))'
        : runtime.status === 'FROZEN'
          ? 'drop-shadow(0 0 12px rgba(125,211,252,0.8))'
          : runtime.status === 'WAITING'
            ? 'drop-shadow(0 0 10px rgba(251,146,60,0.7))'
            : 'none';

  const role = isXor ? 'one path' : incoming >= 2 ? 'join: waits for all' : outgoing >= 2 ? 'fork: all at once' : 'parallel';

  return (
    <div
      className={`relative ${runtime.congested ? 'pc-shake-card' : ''}`}
      style={{ width: SIZE, height: SIZE }}
      data-testid={`gateway-${id}`}
      data-run-status={runtime.status}
    >
      <svg
        key={runtime.status === 'PROCESSING' ? `pulse-${runtime.workedAtTick}` : 'still'}
        width={SIZE}
        height={SIZE}
        viewBox="0 0 108 108"
        className={`block overflow-visible ${runtime.status === 'PROCESSING' ? 'pc-avatar-pulse' : ''}`}
        style={{ filter: glow }}
      >
        <polygon points="54,3 105,54 54,105 3,54" fill="#0f172a" stroke={stroke} strokeWidth={runtime.status === 'IDLE' ? 2.5 : 3.5} strokeLinejoin="round" />
        <polygon points="54,14 94,54 54,94 14,54" fill={stroke} opacity="0.07" />
        {isXor ? (
          <path d="M42 42l24 24M66 42L42 66" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
        ) : (
          <path d="M54 38v32M38 54h32" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
        )}
      </svg>

      {/* caption sits below the diamond, outside the measured box so it never moves the handles */}
      <div className="pointer-events-none absolute left-1/2 top-full mt-2 w-[170px] -translate-x-1/2 text-center">
        <p className="truncate text-[12px] font-semibold text-slate-100" title={node.label}>
          {node.label}
        </p>
        <p className={`text-[10px] ${runtime.status === 'FROZEN' ? 'font-semibold text-sky-200' : runtime.joinWaiting ? 'font-semibold text-orange-300' : 'text-slate-500'}`}>
          {runtime.status === 'FROZEN'
            ? 'frozen: a branch never arrives'
            : runtime.joinWaiting
              ? `waiting: ${runtime.joinWaiting.arrived} of ${runtime.joinWaiting.expected} arrived`
              : role}
        </p>
      </div>

      <TokenDock runtime={runtime} className="-left-6 -top-7" />
      {runtime.congested && <CongestionBadges runtime={runtime} className="-right-6 -top-6" />}
      {runtime.status === 'FROZEN' && <FrostOverlay shape="diamond" runtime={runtime} className="-top-9 left-1/2 -translate-x-1/2" />}
      {runtime.alarm && <AlarmRing alarm={runtime.alarm} shape="diamond" />}
      {runtime.alarm && <AlarmBadge alarm={runtime.alarm} className="-right-10 -top-6" />}
      {runtime.dropped && <DroppedToken marker={runtime.dropped} anchorClass="-left-6 -top-7" crossClass="-right-1 top-0" />}

      {node.inputPorts.map((p, i) => (
        <PortHandle key={p.id} port={p} side={Position.Left} accent={accent} style={diamondSpot('left', i, node.inputPorts.length)} />
      ))}
      {node.outputPorts.map((p, i) => (
        <PortHandle key={p.id} port={p} side={Position.Right} accent={accent} style={diamondSpot('right', i, node.outputPorts.length)} />
      ))}
    </div>
  );
}

export const GatewayNode = memo(GatewayNodeView);
