import { memo, useMemo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { checkExpression } from '../../../engine/expression';
import type { ProcessFlowEdge } from '../../../store/graphConversion';
import { useWorkflowStore } from '../../../store/workflowStore';
import { TRAVEL_SHARE, WORK_SHARE } from '../timing';
import { EdgeTraveller } from './EdgeTraveller';

type Tone = 'plain' | 'condition' | 'default' | 'todo' | 'bad';

const PILL: Record<Tone, string> = {
  plain: 'border-slate-600 bg-slate-800 text-slate-300',
  condition: 'border-indigo-400/50 bg-slate-900 text-indigo-200',
  default: 'border-slate-500 bg-slate-800 text-slate-300 italic',
  todo: 'border-amber-400/60 bg-amber-950 text-amber-200',
  bad: 'border-rose-400/70 bg-rose-950 text-rose-200',
};

const ERROR_COLOR = '#fb7185';

/**
 * A smooth bezier wire with an arrowhead. Its label is a button: on an XOR branch it shows the
 * condition (or "default", or a nudge to write one), and clicking it opens the editor.
 * While a simulation runs, the wire a token just took lights up and the token itself (a chip card,
 * a Pay-in-4 badge or a settlement folder) glides along it.
 */
function ProcessEdgeViewImpl({
  id,
  source,
  sourceHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps<ProcessFlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.4 });

  const fromXor = useWorkflowStore((s) => s.nodes.find((n) => n.id === source)?.data.node.type === 'GATEWAY_XOR');
  const isErrorPath = useWorkflowStore(
    (s) => s.nodes.find((n) => n.id === source)?.data.node.outputPorts.find((p) => p.id === sourceHandleId)?.role === 'ERROR',
  );
  const isActive = useWorkflowStore((s) => s.activeEdgeIds.includes(id));
  const wasTaken = useWorkflowStore((s) => s.traversedEdgeIds.includes(id));
  const traffic = useWorkflowStore((s) => s.edgeTraffic[id]);
  const playbackMs = useWorkflowStore((s) => s.playbackMs);
  const spot = useWorkflowStore((s) => s.spotlight?.edges[id]);
  const variables = useWorkflowStore((s) => s.conditionVariables);
  const selectEdge = useWorkflowStore((s) => s.selectEdge);

  const condition = data?.conditionExpression ?? '';
  const invalid = useMemo(() => (fromXor && condition.trim() ? checkExpression(condition, variables).errors.length > 0 : false), [fromXor, condition, variables]);

  let caption: { text: string; tone: Tone } | null = null;
  if (fromXor) {
    if (data?.isDefault) caption = { text: 'default', tone: 'default' };
    else if (condition.trim()) caption = { text: condition, tone: invalid ? 'bad' : 'condition' };
    else caption = { text: 'set a condition', tone: 'todo' };
  } else if (data?.label) caption = { text: data.label, tone: 'plain' };

  const baseColor = selected ? '#38bdf8' : isActive ? '#fbbf24' : wasTaken ? '#34d399' : isErrorPath ? ERROR_COLOR : '#64748b';
  // In a guided tour the wires on this payment's path glow, and every other wire fades back.
  const color = spot === 'current' ? '#fbbf24' : spot === 'seen' ? '#34d399' : spot === 'ahead' ? '#7dd3fc' : baseColor;
  const glow = spot === 'current' || spot === 'seen' || spot === 'ahead';
  const faded = spot === 'off';
  const width = glow ? (spot === 'current' ? 4 : 3) : selected ? 3 : isActive ? 3.5 : 2.25;
  const markerId = `pc-arrow-${id}`;
  const showOrder = fromXor && !data?.isDefault && data?.priority !== undefined;

  return (
    <>
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="13" markerHeight="13" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M1 1.2L9 5L1 8.8z" fill={color} stroke={color} strokeLinejoin="round" strokeWidth="1" />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={`url(#${markerId})`}
        interactionWidth={26}
        className={isActive ? 'pc-edge-active' : undefined}
        style={{
          stroke: color,
          strokeWidth: width,
          strokeDasharray: spot === 'ahead' ? '3 7' : isErrorPath && !isActive && !spot ? '7 5' : undefined,
          strokeLinecap: spot === 'ahead' ? 'round' : undefined,
          opacity: faded ? 0.15 : 1,
          filter: glow ? `drop-shadow(0 0 5px ${color})` : faded ? 'blur(1.5px)' : undefined,
          transition: 'stroke 150ms, opacity 300ms',
        }}
      />
      {traffic?.map((t) => (
        <EdgeTraveller
          key={`${t.tokenId}:${t.tick}`}
          path={path}
          look={t.look}
          delayMs={playbackMs * WORK_SHARE}
          durationMs={playbackMs * TRAVEL_SHARE}
        />
      ))}
      {caption && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={() => selectEdge(id)}
            title={caption.tone === 'todo' ? 'Click to write the condition for this branch' : caption.text}
            className={`nodrag nopan pointer-events-auto absolute flex max-w-[190px] items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] shadow-md ${PILL[caption.tone]} ${selected ? 'ring-2 ring-sky-400' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, opacity: faded ? 0.15 : 1, filter: faded ? 'blur(1px)' : undefined, transition: 'opacity 300ms' }}
          >
            {showOrder && <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-slate-700 text-[9px] font-bold text-slate-200">{data?.priority}</span>}
            <span className="truncate">{caption.text}</span>
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const ProcessEdgeView = memo(ProcessEdgeViewImpl);
