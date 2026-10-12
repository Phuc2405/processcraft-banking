import { memo, useMemo } from 'react';
import { exampleOf, graphKeyOf, layoutFor, type Lesson, type DiagramKind, type EdgeRoute, type GraphKey, type Side } from '../../sim/learning';
import { lessonGraph, wireLabel, type StepTone, type Walkthrough } from '../../sim/walkthrough';
import type { TokenLook } from '../../store/liveSimulation';
import type { Outcome } from '../../types/processLearning';
import { roundedPath } from './layout';
import { useTerms } from './useTerms';
import { EdgeTraveller } from '../canvas/edges/EdgeTraveller';
import { TokenShape } from '../canvas/tokens/TokenGlyph';
import { CATEGORY_THEME, categoryOf, isOutcome, OUTCOME_THEME, WORKER_PROFILE } from '../canvas/nodeTheme';

type Pt = readonly [number, number];

interface Shape {
  id: string;
  kind: DiagramKind;
  x: number;
  y: number;
  hw: number;
  hh: number;
  label: string;
  sub: string | null;
  accent: string;
}

interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label: string | null;
  isDefault: boolean;
}

const TONE_COLOR: Record<StepTone, string> = { neutral: '#94a3b8', good: '#34d399', bad: '#fb7185', warn: '#fbbf24' };

const FONT = { fontFamily: 'ui-sans-serif, system-ui, sans-serif' } as const;

function pillWidth(label: string): number {
  return Math.max(86, Math.round(label.length * 6.4 + 28));
}

function shapesOf(lesson: Lesson, graphKey: GraphKey): Map<string, Shape> {
  const graph = lessonGraph(lesson, graphKey);
  const layout = layoutFor(lesson, graphKey);
  const out = new Map<string, Shape>();
  for (const n of graph.nodes) {
    const at = layout.nodes[n.id];
    if (!at) continue;
    const category = categoryOf(n);
    let accent: string = CATEGORY_THEME[category].accent;
    const kind: DiagramKind = n.type === 'EVENT_START' ? 'start' : n.type === 'EVENT_END' ? 'end' : n.type === 'TASK' ? 'task' : 'gateway';
    if (kind === 'end') {
      const outcome = n.configParams.outcome as Outcome | undefined;
      if (isOutcome(outcome)) accent = OUTCOME_THEME[outcome].accent;
    }
    const sub = kind === 'task' && n.bankingCapability ? WORKER_PROFILE[n.bankingCapability].role : null;
    const size = kind === 'start' ? { hw: 15, hh: 15 } : kind === 'gateway' ? { hw: 23, hh: 23 } : kind === 'end' ? { hw: pillWidth(n.label) / 2, hh: 15 } : { hw: 76, hh: 28 };
    out.set(n.id, { id: n.id, kind, x: at.x, y: at.y, label: n.label, sub, accent, ...size });
  }
  for (const s of layout.synthetic) {
    const size = s.kind === 'phone' ? { hw: 68, hh: 29 } : s.kind === 'account' ? { hw: 68, hh: 26 } : s.kind === 'end' ? { hw: 46, hh: 15 } : { hw: 62, hh: 24 };
    const accent = s.kind === 'phone' ? '#a78bfa' : s.kind === 'account' ? '#fbbf24' : s.kind === 'end' ? '#34d399' : '#fbbf24';
    out.set(s.id, { id: s.id, kind: s.kind, x: s.x, y: s.y, label: s.label, sub: s.sub ?? null, accent, ...size });
  }
  return out;
}

function edgesOf(lesson: Lesson, graphKey: GraphKey): DiagramEdge[] {
  const graph = lessonGraph(lesson, graphKey);
  const real = graph.edges.map((e) => ({ id: e.id, from: e.sourceNodeId, to: e.targetNodeId, label: wireLabel(lesson, e, graphKey) ?? null, isDefault: Boolean(e.isDefault) }));
  const fake = layoutFor(lesson, graphKey).syntheticEdges.map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label ?? null, isDefault: false }));
  return [...real, ...fake];
}

function portOf(s: Shape, side: Side, dx = 0, dy = 0): Pt {
  switch (side) {
    case 'l':
      return [s.x - s.hw, s.y + dy];
    case 'r':
      return [s.x + s.hw, s.y + dy];
    case 't':
      return [s.x + dx, s.y - s.hh];
    case 'b':
      return [s.x + dx, s.y + s.hh];
  }
}

const DIR: Record<Side, Pt> = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };

interface Drawn {
  d: string;
  label: Pt;
}

function drawEdge(from: Shape, to: Shape, route: EdgeRoute | undefined): Drawn {
  const fromSide = route?.fromSide ?? 'r';
  const toSide = route?.toSide ?? 'l';
  const a = portOf(from, fromSide, route?.fromDx, route?.fromDy);
  const b = portOf(to, toSide, route?.toDx, route?.toDy);

  if (route?.via && route.via.length > 0) {
    const via = route.via.map((p) => [p[0], p[1]] as [number, number]);
    // Keep the first and last runs square to the sides they leave and arrive by.
    const first = via[0] as [number, number];
    if (fromSide === 'l' || fromSide === 'r') first[1] = a[1];
    else first[0] = a[0];
    const last = via[via.length - 1] as [number, number];
    if (toSide === 'l' || toSide === 'r') last[1] = b[1];
    else last[0] = b[0];
    const points: Pt[] = [a, ...via, b];
    let best: Pt = points[0] as Pt;
    let bestLen = -1;
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1] as Pt;
      const q = points[i] as Pt;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len > bestLen) {
        bestLen = len;
        best = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      }
    }
    return { d: roundedPath(points, 14), label: route.labelAt ?? best };
  }

  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const k = Math.max(26, Math.min(110, dist * 0.45));
  const c1: Pt = [a[0] + DIR[fromSide][0] * k, a[1] + DIR[fromSide][1] * k];
  const c2: Pt = [b[0] + DIR[toSide][0] * k, b[1] + DIR[toSide][1] * k];
  const mid: Pt = [(a[0] + 3 * c1[0] + 3 * c2[0] + b[0]) / 8, (a[1] + 3 * c1[1] + 3 * c2[1] + b[1]) / 8];
  return { d: `M${a[0]} ${a[1]}C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${b[0]} ${b[1]}`, label: route?.labelAt ?? mid };
}

// ─────────────────────────────────────────────────────────────────────────────
// Node drawings
// ─────────────────────────────────────────────────────────────────────────────

function NodeShape({ s, color, state, current }: { s: Shape; color: string; state: 'ahead' | 'seen' | 'off'; current: boolean }) {
  const fill = state === 'off' ? '#0a0f1a' : '#101a2e';
  const stroke = state === 'off' ? '#27324a' : color;
  const opacity = state === 'off' ? 0.55 : 1;
  const ring = current ? <rect x={-s.hw - 5} y={-s.hh - 5} width={s.hw * 2 + 10} height={s.hh * 2 + 10} rx={s.kind === 'gateway' ? 12 : 14} fill="none" stroke={color} strokeWidth="2" className="bk-ring" /> : null;

  switch (s.kind) {
    case 'start':
      return (
        <g opacity={opacity}>
          {current && <circle r="22" fill="none" stroke={color} strokeWidth="2" className="bk-ring" />}
          <circle r="15" fill={fill} stroke={stroke} strokeWidth="2.4" />
          <path d="M-4 -6l9 6-9 6z" fill={stroke} />
        </g>
      );
    case 'gateway':
      return (
        <g opacity={opacity}>
          {current && <path d="M0 -33L33 0 0 33-33 0z" fill="none" stroke={color} strokeWidth="2" className="bk-ring" />}
          <path d="M0 -23L23 0 0 23-23 0z" fill={fill} stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M-6 -6l12 12M6 -6l-12 12" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      );
    case 'end':
      return (
        <g opacity={opacity}>
          {ring}
          <rect x={-s.hw} y={-s.hh} width={s.hw * 2} height={s.hh * 2} rx={s.hh} fill={state === 'off' ? fill : `${color}1f`} stroke={stroke} strokeWidth="2.2" />
          <text textAnchor="middle" y="4" fontSize="11" fontWeight="700" fill={state === 'off' ? '#64748b' : '#f1f5f9'} style={FONT}>
            {s.label}
          </text>
        </g>
      );
    case 'task':
      return (
        <g opacity={opacity}>
          {ring}
          <rect x={-s.hw} y={-s.hh} width={s.hw * 2} height={s.hh * 2} rx="10" fill={fill} stroke={stroke} strokeWidth="2" />
          <rect x={-s.hw} y={-s.hh} width="6" height={s.hh * 2} rx="3" fill={stroke} opacity="0.9" />
          <text x="4" y={s.sub ? -3 : 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={state === 'off' ? '#64748b' : '#f8fafc'} style={FONT}>
            {s.label.length > 22 ? `${s.label.slice(0, 21)}…` : s.label}
          </text>
          {s.sub && (
            <text x="4" y="13" textAnchor="middle" fontSize="9.5" fill="#94a3b8" style={FONT}>
              {s.sub}
            </text>
          )}
        </g>
      );
    case 'phone':
      return (
        <g opacity={opacity}>
          {ring}
          <rect x={-s.hw} y={-s.hh} width={s.hw * 2} height={s.hh * 2} rx="10" fill={fill} stroke={stroke} strokeWidth="2" strokeDasharray="5 3" />
          <rect x="-56" y="-17" width="16" height="30" rx="3.2" fill="none" stroke={stroke} strokeWidth="1.8" />
          <path d="M-50 8h4" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
          <text x="12" y="-2" textAnchor="middle" fontSize="11" fontWeight="700" fill="#f8fafc" style={FONT}>
            {s.label}
          </text>
          <text x="12" y="12" textAnchor="middle" fontSize="9.5" fill="#94a3b8" style={FONT}>
            {s.sub}
          </text>
        </g>
      );
    case 'account':
      return (
        <g opacity={opacity}>
          {ring}
          <rect x={-s.hw} y={-s.hh} width={s.hw * 2} height={s.hh * 2} rx="8" fill={fill} stroke={stroke} strokeWidth="2" />
          <text textAnchor="middle" y="-2" fontSize="11.5" fontWeight="700" fill="#f8fafc" style={FONT}>
            {s.label}
          </text>
          <text textAnchor="middle" y="12" fontSize="9.5" fill="#94a3b8" style={FONT}>
            {s.sub}
          </text>
        </g>
      );
    default:
      return (
        <g opacity={opacity}>
          {ring}
          <rect x={-s.hw} y={-s.hh} width={s.hw * 2} height={s.hh * 2} rx="8" fill={fill} stroke={stroke} strokeWidth="2" strokeDasharray="6 3" />
          <text textAnchor="middle" y={s.sub ? -2 : 4} fontSize="11.5" fontWeight="700" fill="#f8fafc" style={FONT}>
            {s.label}
          </text>
          {s.sub && (
            <text textAnchor="middle" y="12" fontSize="9.5" fill="#94a3b8" style={FONT}>
              {s.sub}
            </text>
          )}
        </g>
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The diagram
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  lesson: Lesson;
  walk: Walkthrough;
  active: number;
  onSelectStep: (index: number) => void;
  token: TokenLook;
  /** Changes whenever the story restarts, so the token's journey replays. */
  runKey: string;
}

export const ProcessDiagram = memo(function ProcessDiagram({ lesson, walk, active, onSelectStep, token, runKey }: Props) {
  const terms = useTerms();
  // A chapter with two diagrams draws the one the example is walked through.
  const graphKey = graphKeyOf(lesson, exampleOf(lesson, walk.exampleId));
  const layout = layoutFor(lesson, graphKey);
  const baseShapes = useMemo(() => shapesOf(lesson, graphKey), [lesson, graphKey]);
  const baseEdges = useMemo(() => edgesOf(lesson, graphKey), [lesson, graphKey]);
  // In Beginner mode the boxes and wires say it in plain English.
  const shapes = useMemo(() => (terms.beginner ? new Map([...baseShapes].map(([k, sh]) => [k, { ...sh, label: terms.t(sh.label), sub: sh.sub ? terms.t(sh.sub) : null }] as const)) : baseShapes), [baseShapes, terms]);
  const edges = useMemo(() => (terms.beginner ? baseEdges.map((e) => ({ ...e, label: e.label ? terms.t(e.label) : null })) : baseEdges), [baseEdges, terms]);
  const drawn = useMemo(() => {
    const m = new Map<string, Drawn>();
    for (const e of edges) {
      const from = shapes.get(e.from);
      const to = shapes.get(e.to);
      if (from && to) m.set(e.id, drawEdge(from, to, layout.routes[e.id]));
    }
    return m;
  }, [edges, shapes, layout]);

  // Which step first reaches each box and wire, and what the story says about each.
  const firstStep = new Map<string, number>();
  const toneAt = new Map<string, StepTone>();
  const edgeStep = new Map<string, number>();
  walk.steps.forEach((s, i) => {
    if (!firstStep.has(s.nodeId)) firstStep.set(s.nodeId, i);
    if (i <= active) toneAt.set(s.nodeId, s.tone);
    if (s.viaEdgeId && !edgeStep.has(s.viaEdgeId)) edgeStep.set(s.viaEdgeId, i);
  });
  const here = walk.steps[active];
  const hereShape = here ? shapes.get(here.nodeId) : undefined;
  const hereEdge = here?.viaEdgeId ? drawn.get(here.viaEdgeId) : undefined;
  const arrowColors = ['#334155', '#64748b', '#e2e8f0', '#fb7185'];

  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="h-auto w-full" role="img" aria-label={`Diagram of Process ${lesson.id}: ${terms.t(lesson.title)}`} data-testid="process-diagram" data-active={active}>
      <defs>
        {arrowColors.map((c) => (
          <marker key={c} id={`bk-d-arrow-${c.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1 1.2L9 5 1 8.8z" fill={c} />
          </marker>
        ))}
      </defs>

      {edges.map((e) => {
        const dr = drawn.get(e.id);
        if (!dr) return null;
        const step = edgeStep.get(e.id);
        const taken = step !== undefined && step <= active;
        const ahead = step !== undefined && step > active;
        const color = taken ? (walk.steps[step as number]?.tone === 'bad' ? '#fb7185' : '#e2e8f0') : ahead ? '#64748b' : '#334155';
        return (
          <g key={e.id} data-edge={e.id} data-taken={taken}>
            <path d={dr.d} fill="none" stroke={color} strokeWidth={taken ? 2.8 : 1.8} strokeDasharray={ahead ? '6 4' : e.isDefault && !taken ? '2 4' : undefined} strokeLinecap="round" markerEnd={`url(#bk-d-arrow-${color.slice(1)})`} opacity={taken || ahead ? 1 : 0.55} />
            {taken && step === active && <path d={dr.d} fill="none" stroke={color} strokeWidth="2.8" strokeDasharray="6 8" className="bk-flow" />}
          </g>
        );
      })}

      {edges.map((e) => {
        const dr = drawn.get(e.id);
        if (!dr || !e.label) return null;
        const step = edgeStep.get(e.id);
        const taken = step !== undefined && step <= active;
        const w = Math.round(e.label.length * 5.5 + 12);
        return (
          <g key={`l-${e.id}`} transform={`translate(${dr.label[0]} ${dr.label[1]})`} opacity={taken ? 1 : 0.7}>
            <rect x={-w / 2} y="-8.5" width={w} height="17" rx="5" fill="#060912" stroke={taken ? '#94a3b8' : '#1e293b'} />
            <text textAnchor="middle" y="3.6" fontSize="10" fill={taken ? '#f1f5f9' : '#94a3b8'} style={FONT}>
              {e.label}
            </text>
          </g>
        );
      })}

      {[...shapes.values()].map((s) => {
        const first = firstStep.get(s.id);
        const seen = first !== undefined && first <= active;
        const ahead = first !== undefined && first > active;
        const tone = toneAt.get(s.id);
        const color = tone && tone !== 'neutral' && seen ? TONE_COLOR[tone] : s.accent;
        const current = here?.nodeId === s.id;
        const clickable = first !== undefined;
        return (
          <g
            key={s.id}
            transform={`translate(${s.x} ${s.y})`}
            data-node={s.id}
            data-state={seen ? 'seen' : ahead ? 'ahead' : 'off'}
            data-current={current}
            onClick={clickable ? () => onSelectStep(first) : undefined}
            style={{ cursor: clickable ? 'pointer' : 'default' }}
            role={clickable ? 'button' : undefined}
            aria-label={clickable ? `Go to step ${first + 1}: ${s.label}` : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={clickable ? (ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), onSelectStep(first)) : undefined}
          >
            <NodeShape s={s} color={color} state={seen ? 'seen' : ahead ? 'ahead' : 'off'} current={current} />
          </g>
        );
      })}

      {hereShape && (
        <g transform={`translate(${hereShape.x} ${hereShape.y - hereShape.hh - 20})`} className="bk-dock" key={`dock-${runKey}-${active}`} pointerEvents="none">
          <TokenShape look={token} />
        </g>
      )}
      {hereEdge && <EdgeTraveller key={`go-${runKey}-${active}`} path={hereEdge.d} look={token} delayMs={0} durationMs={650} />}
    </svg>
  );
});
