import { t } from '../../i18n/t';
import { useCallback, useEffect, type DragEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { NODE_DRAG_MIME } from './dragData';
import { edgeTypes, nodeTypes } from './flowTypes';
import { minimapColor } from './nodeTheme';
import { RunControls } from './RunControls';
import { timingVars } from './timing';
import type { ProcessFlowEdge, ProcessFlowNode } from '../../store/graphConversion';
import { useWorkflowStore } from '../../store/workflowStore';

// Leave room above the diagram for the run controls (top centre) and the overview map (top left) that float
// over the canvas, so the token at a desk, its warning badges and its red cross are never hidden underneath them.
const FIT_VIEW = { padding: { top: '190px', right: '70px', bottom: '70px', left: '70px' }, maxZoom: 1 } as const;

const NOTICE_COLOR = {
  info: 'border-sky-500/50 bg-sky-950/95 text-sky-100',
  warn: 'border-amber-500/50 bg-amber-950/95 text-amber-100',
  error: 'border-rose-500/50 bg-rose-950/95 text-rose-100',
} as const;

function Notice() {
  const notice = useWorkflowStore((s) => s.notice);
  const dismiss = useWorkflowStore((s) => s.dismissNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(dismiss, 5000);
    return () => clearTimeout(timer);
  }, [notice, dismiss]);

  if (!notice) return null;
  return (
    <div
      role="status"
      className={`pointer-events-auto flex max-w-[520px] items-start gap-3 rounded-lg border px-3 py-2 text-[12px] shadow-xl ${NOTICE_COLOR[notice.kind]}`}
    >
      <span className="flex-1 leading-snug">{notice.message}</span>
      <button type="button" onClick={dismiss} aria-label={t('Dismiss')} className="opacity-70 hover:opacity-100">
        ✕
      </button>
    </div>
  );
}

/**
 * The drawing surface: React Flow on a dark grid, wired to the workflow store.
 * Must be rendered inside a <ReactFlowProvider> so the palette can share its viewport.
 */
export function ProcessCanvas() {
  const levelId = useWorkflowStore((s) => s.level.id);
  const epoch = useWorkflowStore((s) => s.canvasEpoch);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const canConnect = useWorkflowStore((s) => s.canConnect);
  const addNode = useWorkflowStore((s) => s.addNode);
  const placedCount = useWorkflowStore((s) => s.nodes.filter((n) => !n.data.node.locked).length);
  const playbackMs = useWorkflowStore((s) => s.playbackMs);
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((e: DragEvent) => {
    if (!e.dataTransfer.types.includes(NODE_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      const definitionId = e.dataTransfer.getData(NODE_DRAG_MIME);
      if (!definitionId) return;
      e.preventDefault();
      const at = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // Centre the new node under the cursor rather than hanging it off the corner.
      addNode(definitionId, { x: at.x - 100, y: at.y - 40 });
    },
    [addNode, screenToFlowPosition],
  );

  return (
    <div className="relative h-full w-full" data-testid="process-canvas" style={timingVars(playbackMs)}>
      <ReactFlow<ProcessFlowNode, ProcessFlowEdge>
        key={`${levelId}:${epoch}`}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'process' }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={(c) => canConnect(c).ok}
        onDrop={onDrop}
        onDragOver={onDragOver}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={{ stroke: '#38bdf8', strokeWidth: 2.5 }}
        colorMode="dark"
        fitView
        fitViewOptions={FIT_VIEW}
        minZoom={0.25}
        maxZoom={1.75}
        snapToGrid
        snapGrid={[14, 14]}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
        attributionPosition="bottom-center"
      >
        <Background variant={BackgroundVariant.Lines} gap={28} lineWidth={1} color="#141c30" />
        <Background id="dots" variant={BackgroundVariant.Dots} gap={28} size={2} color="#1f2b46" />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap<ProcessFlowNode>
          position="top-left"
          pannable
          zoomable
          ariaLabel="Overview of the whole diagram"
          maskColor="rgba(9, 13, 22, 0.75)"
          style={{ background: '#0d1424', border: '1px solid #1e293b' }}
          nodeStrokeWidth={3}
          nodeColor={(n) => minimapColor({ type: n.data.node.type, bankingCapability: n.data.node.bankingCapability, outcome: n.data.node.configParams.outcome })}
        />

        <Panel position="top-center">
          <RunControls />
        </Panel>
        <Panel position="top-right">
          <InspectorPanel />
        </Panel>
        <Panel position="bottom-center" className="!mb-9">
          <Notice />
        </Panel>

      </ReactFlow>

      {placedCount === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center pt-16">
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/70 px-5 py-4 text-center">
            <p className="text-[13px] font-medium text-slate-200">{t('Your canvas is empty')}</p>
            <p className="mt-1 max-w-[260px] text-[12px] leading-snug text-slate-400">
              {t('Drag a desk from the palette, then pull a wire from its right-hand handle to the next node’s left-hand handle.')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
