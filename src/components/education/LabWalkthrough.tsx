import { flowAriaLabels } from '../../i18n/flowAria';
import { localChallenge } from '../../i18n/challengeVi';
import { t } from '../../i18n/t';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow, useStore as useFlowStore } from '@xyflow/react';
import { labUi } from '../../data/labTourCopy';
import { curriculumPosition, LEVELS, REFERENCE_SOLUTIONS } from '../../data/seedChallenges';
import { playableTests } from '../../sim/labTour';
import { dwellMs } from '../bank/tokenPath';
import { useTerms } from '../bank/useTerms';
import { edgeTypes, nodeTypes } from '../canvas/flowTypes';
import { prefersReducedMotion, timingVars, TRAVEL_SHARE, WORK_SHARE } from '../canvas/timing';
import { NODE_FOOTPRINT, type ProcessFlowEdge, type ProcessFlowNode } from '../../store/graphConversion';
import { connectLabTour, isBlocked, isFinished, labTourStore, useLabTour } from '../../store/labTourStore';
import { useWorkflowStore, WorkflowStoreProvider, workflowStore, type SpotState } from '../../store/workflowStore';
import { levelAccent } from '../../data/curriculumTheme';
import { LabIntro, LabStepCard, LabVerdict } from './LabCards';

/** The Build Lab guided tour. */

// The tour reads the learner's level and diagram from the Build Lab store.
connectLabTour({
  levelId: () => workflowStore.getState().level.id,
  learnerGraph: () => workflowStore.getState().getProcessGraph(),
});

// Launcher

export function LabTourLauncher() {
  const ui = labUi();
  const levelId = useWorkflowStore((s) => s.level.id);
  const open = useLabTour((s) => s.open);
  const hasExample = REFERENCE_SOLUTIONS.some((r) => r.challengeId === levelId);
  // An empty canvas has nothing to walk yet: the worked example is the way in.
  const placed = useWorkflowStore((s) => s.nodes.filter((n) => !n.data.node.locked).length);
  const empty = placed === 0 && hasExample;

  const launch = (source: 'example' | 'mine'): void => {
    workflowStore.getState().pauseSimulation();
    open(source);
  };

  return (
    <section aria-label={ui.launchTitle} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3" data-testid="lab-launcher">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ui.launchTitle}</h3>
      <p className="mt-1 text-[12px] leading-snug text-slate-400">{ui.launchBlurb}</p>
      <div className="mt-2.5 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => launch('mine')}
          disabled={empty}
          title={empty ? ui.mineEmpty : undefined}
          data-testid="lab-launch-mine"
          className="rounded-md bg-sky-500/90 px-3 py-1.5 text-left text-[12px] font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          ▶ {ui.launchMine}
        </button>
        {hasExample && (
          <button
            type="button"
            onClick={() => launch('example')}
            data-testid="lab-launch-example"
            className={`rounded-md px-3 py-1.5 text-left text-[12px] transition ${empty ? 'bg-sky-500/90 font-semibold text-slate-950 hover:bg-sky-400' : 'font-medium text-slate-200 ring-1 ring-slate-700 hover:bg-slate-800'}`}
          >
            {empty ? '▶ ' : ''}
            {ui.launchExample}
          </button>
        )}
        {empty && <p className="text-[11px] leading-snug text-slate-500">{ui.mineEmpty}</p>}
      </div>
    </section>
  );
}

// The tour's canvas

const LOOK: Record<SpotState, CSSProperties> = {
  off: { opacity: 0.15, filter: 'blur(1.6px) saturate(0.5)' },
  ahead: { opacity: 0.5, filter: 'none' },
  seen: { opacity: 0.8, filter: 'none' },
  current: { opacity: 1, filter: 'drop-shadow(0 0 14px rgba(56, 189, 248, 0.75))' },
};

const NODE_FADE: CSSProperties = { transition: 'opacity 0.6s ease, filter 0.6s ease' };

/** Where on the canvas the lit box sits, as a share of its width: left of centre, clear of the card on the right. */
const FOCUS_X = 0.36;
const TOUR_ZOOM = 0.9;

function LabFlow() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const spotlight = useWorkflowStore((s) => s.spotlight);
  const playbackMs = useWorkflowStore((s) => s.playbackMs);
  const phase = useLabTour((s) => s.phase);
  const index = useLabTour((s) => s.index);
  const tour = useLabTour((s) => s.tour);
  const flow = useReactFlow();
  const width = useFlowStore((s) => s.width);
  const height = useFlowStore((s) => s.height);

  // The boxes can't be moved, wired or selected: this canvas is for looking. The look of each follows the spotlight.
  const shown = useMemo<ProcessFlowNode[]>(
    () =>
      nodes.map((n) => ({
        ...n,
        draggable: false,
        selectable: false,
        connectable: false,
        deletable: false,
        style: { ...n.style, ...NODE_FADE, ...LOOK[spotlight?.nodes[n.id] ?? 'ahead'] },
      })),
    [nodes, spotlight],
  );
  const wires = useMemo<ProcessFlowEdge[]>(() => edges.map((e) => ({ ...e, selectable: false, deletable: false })), [edges]);

  // Keep the lit box in view, left of the card. Before the tour starts and after it ends, show the whole diagram.
  const finished = tour !== null && index >= tour.steps.length;
  const target = tour && phase === 'touring' && !finished ? tour.steps[index] : undefined;
  useEffect(() => {
    if (width === 0 || height === 0) return;
    const duration = prefersReducedMotion() ? 0 : 700;
    if (!target) {
      // Leave the right-hand side to the closing card, so the whole diagram, End events included, stays in view.
      const cardRoom = phase === 'touring' && width >= 1024 ? '440px' : '40px';
      void flow.fitView({ padding: { top: '60px', right: cardRoom, bottom: '60px', left: '60px' }, maxZoom: 1, duration });
      return;
    }
    const node = nodes.find((n) => n.id === target.nodeId);
    if (!node) return;
    const size = NODE_FOOTPRINT[node.type ?? 'task'];
    const w = node.measured?.width ?? size.width;
    const h = node.measured?.height ?? size.height;
    const cx = node.position.x + w / 2;
    const cy = node.position.y + h / 2;
    void flow.setViewport({ x: width * FOCUS_X - cx * TOUR_ZOOM, y: height * 0.5 - cy * TOUR_ZOOM, zoom: TOUR_ZOOM }, { duration });
    // `nodes` is deliberately left out: the boxes do not move, and re-centring on every token tick would fight the learner's panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.nodeId, phase, finished, width, height, flow]);

  return (
    <div className="relative h-full w-full" data-testid="lab-canvas" style={timingVars(playbackMs)}>
      <ReactFlow<ProcessFlowNode, ProcessFlowEdge>
        ariaLabelConfig={flowAriaLabels()}
        nodes={shown}
        edges={wires}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'process' }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        nodesFocusable={false}
        deleteKeyCode={null}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.14, maxZoom: 1 }}
        minZoom={0.25}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Lines} gap={28} lineWidth={1} color="#141c30" />
        <Background id="dots" variant={BackgroundVariant.Dots} gap={28} size={2} color="#1f2b46" />
      </ReactFlow>
    </div>
  );
}

// Arrival and auto-play

/** True once the token has reached the box the card is about. */
function useArrived(): boolean {
  const index = useLabTour((s) => s.index);
  const phase = useLabTour((s) => s.phase);
  const tour = useLabTour((s) => s.tour);
  const canvas = useLabTour((s) => s.canvas);
  const key = `${tour?.testId ?? ''}|${tour?.source ?? ''}|${index}`;
  const [arrivedKey, setArrivedKey] = useState('');
  const previous = useRef<{ key: string; index: number }>({ key: '', index: -1 });

  useLayoutEffect(() => {
    if (phase !== 'touring') {
      setArrivedKey('');
      previous.current = { key: '', index: -1 };
      return;
    }
    const before = previous.current;
    previous.current = { key, index };
    const stepForward = before.key.split('|').slice(0, 2).join('|') === key.split('|').slice(0, 2).join('|') && index === before.index + 1;
    if (!stepForward || prefersReducedMotion()) {
      setArrivedKey(key);
      return;
    }
    const ms = canvas?.getState().playbackMs ?? 0;
    const timer = window.setTimeout(() => setArrivedKey(key), Math.round(ms * (WORK_SHARE + TRAVEL_SHARE)) + 150);
    return () => window.clearTimeout(timer);
  }, [key, index, phase, canvas]);

  return phase === 'touring' && arrivedKey === key;
}

/** Auto-play: stay on a box long enough to read it, wait for any question to be answered, then move on. */
function useAutoPlay(arrived: boolean): void {
  const auto = useLabTour((s) => s.auto);
  const phase = useLabTour((s) => s.phase);
  const index = useLabTour((s) => s.index);
  const tour = useLabTour((s) => s.tour);
  const blocked = useLabTour((s) => isBlocked(s));
  const answered = useLabTour((s) => s.answers[s.index] !== undefined);
  const next = useLabTour((s) => s.next);
  const setAuto = useLabTour((s) => s.setAuto);

  useEffect(() => {
    if (!auto || phase !== 'touring' || !tour || !arrived || blocked) return;
    if (index >= tour.steps.length) {
      setAuto(false);
      return;
    }
    const step = tour.steps[index];
    if (!step) return;
    const words = [step.what, step.why, step.happened, ...step.fails].join(' ').split(/\s+/).filter(Boolean).length;
    const wait = answered ? 3800 : dwellMs(words);
    const timer = window.setTimeout(next, wait);
    return () => window.clearTimeout(timer);
  }, [auto, phase, tour, index, arrived, blocked, answered, next, setAuto]);
}

// The bar at the bottom

function LabBar({ accent }: { accent: string }) {
  const ui = labUi();
  const terms = useTerms();
  const tour = useLabTour((s) => s.tour);
  const index = useLabTour((s) => s.index);
  const auto = useLabTour((s) => s.auto);
  const answers = useLabTour((s) => s.answers);
  const quizzes = useLabTour((s) => s.quizzes);
  const blocked = useLabTour((s) => isBlocked(s));
  const prev = useLabTour((s) => s.prev);
  const next = useLabTour((s) => s.next);
  const go = useLabTour((s) => s.go);
  const setAuto = useLabTour((s) => s.setAuto);
  const exit = useLabTour((s) => s.exit);
  const setTest = useLabTour((s) => s.setTest);
  const testId = useLabTour((s) => s.testId);
  const levelId = useLabTour((s) => s.levelId);

  // Keyboard: ← → move, Space plays and pauses, Esc leaves. Not while a control that uses the same keys has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target;
      if (t instanceof HTMLSelectElement || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') exit();
      else if (e.key === ' ' && !(t instanceof HTMLButtonElement)) {
        e.preventDefault();
        setAuto(!labTourAuto());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, exit, setAuto]);

  if (!tour) return null;
  const total = tour.steps.length;
  const finished = isFinished({ tour, index });
  const quizSteps = new Set(quizzes.map((q) => q.step));
  const answered = quizzes.filter((q) => answers[q.step] !== undefined);
  const rightCount = answered.filter((q) => answers[q.step]?.correct).length;
  const position = levelId ? curriculumPosition(levelId) : null;
  const tests = testsFor(tour.levelId);

  const middle = auto ? ui.pause : finished ? ui.replay : index === 0 ? ui.autoPlay : ui.resume;
  const middleIcon = auto ? '❚❚' : finished ? '↻' : '▶';

  return (
    <div className="shrink-0 border-t bg-[#0a0f1c]" style={{ borderColor: `${accent}88` }} data-testid="lab-bar" role="toolbar" aria-label={ui.labTour}>
      <div className="flex items-center gap-3 px-4 pt-2.5">
        <div className="flex min-w-0 flex-1 basis-0 items-center gap-2">
          <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded px-1 text-[11px] font-black text-slate-950" style={{ background: accent }} aria-hidden="true">
            {position?.label ?? '·'}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{ui.labTour}</div>
            <div className="truncate text-[12.5px] font-semibold text-slate-100" title={tour.source === 'example' ? ui.exampleSource : ui.mineSource}>
              {tour.source === 'example' ? ui.exampleSource : ui.mineSource}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={prev} disabled={index === 0} data-testid="lab-prev" className="whitespace-nowrap rounded-lg bg-slate-800 px-3 py-2 text-[12.5px] font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35">
            ◀ {ui.previous}
          </button>
          <button
            type="button"
            onClick={() => setAuto(!auto)}
            data-testid="lab-auto"
            aria-pressed={auto}
            className="min-w-[116px] whitespace-nowrap rounded-lg px-3 py-2 text-[12.5px] font-bold text-slate-950 transition hover:brightness-110"
            style={{ background: accent }}
          >
            <span aria-hidden="true">{middleIcon}</span> {middle}
          </button>
          <button
            type="button"
            onClick={next}
            disabled={finished || blocked}
            title={blocked ? ui.quizLocked : undefined}
            data-testid="lab-next"
            className="whitespace-nowrap rounded-lg bg-slate-800 px-3 py-2 text-[12.5px] font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {index === total - 1 ? ui.tourDone : ui.next} ▶
          </button>
        </div>

        <div className="flex min-w-0 flex-1 basis-0 items-center justify-end gap-2">
          <button type="button" onClick={exit} data-testid="lab-exit" className="whitespace-nowrap rounded-lg bg-rose-500/90 px-3 py-2 text-[12.5px] font-bold text-white transition hover:bg-rose-400">
            {ui.exit} ✕
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pb-2 pt-2 text-[11.5px] text-slate-400">
        <ol className="flex items-center gap-1" aria-label={ui.stepOf(Math.min(index + 1, total), total)}>
          {tour.steps.map((s, i) => {
            const asked = quizSteps.has(i);
            const done = i < index;
            return (
              <li key={`${s.nodeId}-${i}`}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`${ui.stepOf(i + 1, total)}: ${terms.t(s.title)}`}
                  aria-current={i === index ? 'step' : undefined}
                  title={terms.t(s.title)}
                  data-testid={`lab-dot-${i}`}
                  className={`h-2.5 rounded-full transition-all ${asked ? 'w-3.5' : 'w-2.5'}`}
                  style={{
                    background: i === index ? accent : done ? `${accent}88` : '#334155',
                    outline: asked ? '1px solid #94a3b8' : undefined,
                    outlineOffset: 1,
                  }}
                />
              </li>
            );
          })}
        </ol>
        <span className="flex items-center gap-1 whitespace-nowrap" title={t('The speed is locked while the tour runs.')} data-testid="lab-lock">
          <span aria-hidden="true">🔒</span> {ui.speedLocked}
        </span>
        <span className="whitespace-nowrap tabular-nums" data-testid="lab-score">
          {quizzes.length === 0 ? ui.noQuestions : ui.score(rightCount, quizzes.length)}
          {quizzes.length > 0 && answered.length < quizzes.length ? ` (${answered.length}/${quizzes.length} answered)` : ''}
        </span>
        <label className="ml-auto flex items-center gap-2 whitespace-nowrap">
          <span>{ui.testLabel}</span>
          <select
            value={testId ?? ''}
            onChange={(e) => setTest(e.target.value)}
            data-testid="lab-test-bar"
            className="max-w-[260px] rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[12px] text-slate-100"
          >
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

const labTourAuto = (): boolean => labTourStore.getState().auto;
function testsFor(levelId: string): Array<{ id: string; name: string }> {
  const level = LEVELS.find((l) => l.id === levelId);
  return level ? playableTests(localChallenge(level)).map((tc) => ({ id: tc.id, name: tc.name })) : [];
}

// The overlay

const CARD_PLACE = 'absolute inset-x-2 bottom-2 max-h-[55%] lg:inset-x-auto lg:bottom-auto lg:right-3 lg:top-3 lg:max-h-[calc(100%-24px)] lg:w-[410px]';

function Cards({ accent }: { accent: string }) {
  const ui = labUi();
  const tour = useLabTour((s) => s.tour);
  const index = useLabTour((s) => s.index);
  const arrived = useArrived();
  useAutoPlay(arrived);
  if (!tour) return null;

  if (index >= tour.steps.length) return <LabVerdict tour={tour} accent={accent} className={CARD_PLACE} />;
  const step = tour.steps[index];
  if (!step) return null;
  if (!arrived) {
    return (
      <div className="pointer-events-none absolute right-3 top-3 z-30 rounded-full border border-slate-700 bg-[#0b1120]/90 px-3 py-1.5 text-[12px] text-slate-300 shadow-xl" role="status" data-testid="lab-travelling">
        {ui.onItsWay(step.title)}
      </div>
    );
  }
  return <LabStepCard step={step} total={tour.steps.length} accent={accent} className={CARD_PLACE} />;
}

/** Covers the canvas and the results drawer while a tour runs. Mounted by the Build Lab inside its main column. */
export function LabTourOverlay() {
  const phase = useLabTour((s) => s.phase);
  const canvas = useLabTour((s) => s.canvas);
  const tourKey = useLabTour((s) => `${s.tour?.levelId ?? ''}|${s.tour?.testId ?? ''}|${s.tour?.source ?? ''}`);
  const levelId = useLabTour((s) => s.levelId);
  const exit = useLabTour((s) => s.exit);
  const openLevel = useWorkflowStore((s) => s.level.id);

  // Switching level in the bar above leaves the tour: it was about the level that was open.
  useEffect(() => {
    if (phase !== 'closed' && levelId && openLevel !== levelId) exit();
  }, [phase, levelId, openLevel, exit]);

  if (phase === 'closed') return null;
  const accent = levelAccent(levelId ?? '');

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#060912]" data-testid="lab-tour" data-phase={phase}>
      <div className="relative min-h-0 flex-1">
        {canvas ? (
          <WorkflowStoreProvider value={canvas}>
            <ReactFlowProvider key={tourKey}>
              <LabFlow />
            </ReactFlowProvider>
          </WorkflowStoreProvider>
        ) : (
          <div className="h-full" />
        )}
        {phase === 'intro' ? <LabIntro accent={accent} /> : <Cards accent={accent} />}
      </div>
      {phase === 'touring' && <LabBar accent={accent} />}
    </div>
  );
}
