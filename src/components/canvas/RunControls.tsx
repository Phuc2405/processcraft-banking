import { useEffect, useState, type ReactNode } from 'react';
import type { SaveStatus } from '../../store/persistence';
import { useWorkflowStore } from '../../store/workflowStore';
import { TokenGlyph } from './tokens/TokenGlyph';
import { useSimulationClock } from './useSimulationClock';

const SPEEDS = [
  { label: '0.5×', ms: 1800 },
  { label: '1×', ms: 900 },
  { label: '2×', ms: 450 },
  { label: '4×', ms: 225 },
] as const;

function IconButton({ label, onClick, disabled, children, tone = 'plain' }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; tone?: 'plain' | 'primary' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={[
        'grid h-8 w-8 place-items-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-35',
        tone === 'primary' ? 'bg-sky-500 text-slate-950 hover:bg-sky-400' : 'bg-slate-800 text-slate-200 hover:bg-slate-700',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

const svgProps = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'currentColor', 'aria-hidden': true } as const;

const SAVE_COPY: Record<SaveStatus, { text: string; dot: string; tone: string }> = {
  unavailable: { text: 'Not saved: this browser blocks local storage', dot: 'bg-amber-400', tone: 'text-amber-300' },
  pristine: { text: 'Autosave on', dot: 'bg-slate-500', tone: 'text-slate-400' },
  pending: { text: 'Saving…', dot: 'bg-sky-400 animate-pulse', tone: 'text-sky-300' },
  saved: { text: 'Saved to this browser', dot: 'bg-emerald-400', tone: 'text-emerald-300' },
  error: { text: 'Could not save (storage full or blocked)', dot: 'bg-rose-400', tone: 'text-rose-300' },
};

const clockTime = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/** Autosave state, and the one control that throws a saved diagram away. Resetting asks twice, because it cannot be undone. */
function PersistenceRow() {
  const status = useWorkflowStore((s) => s.saveStatus);
  const savedAt = useWorkflowStore((s) => s.lastSavedAt);
  const levelNumber = useWorkflowStore((s) => s.level.levelNumber);
  const resetToStarter = useWorkflowStore((s) => s.resetToStarter);

  const [armed, setArmed] = useState(false);
  // Disarm after a few seconds, and when the level or the diagram state changes under the button.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  useEffect(() => setArmed(false), [levelNumber]);

  const copy = SAVE_COPY[status];
  const nothingToReset = status === 'pristine';
  const time = status === 'saved' ? clockTime(savedAt) : '';

  return (
    <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-slate-800 pt-1.5">
      <span className={`flex min-w-0 items-center gap-1.5 text-[11px] ${copy.tone}`} role="status" data-testid="save-status" data-status={status}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${copy.dot}`} aria-hidden="true" />
        <span className="truncate">
          {copy.text}
          {time && <span className="text-slate-500"> · {time}</span>}
        </span>
      </span>
      <button
        type="button"
        disabled={nothingToReset}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          resetToStarter();
        }}
        title={nothingToReset ? 'This level is already on its starter graph.' : 'Clear your saved diagram for this level and go back to the starting point.'}
        data-testid="reset-starter"
        className={[
          'shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
          armed ? 'border-rose-500 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25' : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100',
        ].join(' ')}
      >
        {armed ? 'Click again to erase this level' : 'Reset to Starter Graph'}
      </button>
    </div>
  );
}

/**
 * Test picker, play / pause / step / reset, speed, and Submit.
 * "Play" watches one visible test travel through the diagram. "Submit" grades the whole suite,
 * including the hidden tests, which are never replayed.
 */
export function RunControls() {
  const level = useWorkflowStore((s) => s.level);
  const selectedTestId = useWorkflowStore((s) => s.selectedTestId);
  const isRunning = useWorkflowStore((s) => s.isRunning);
  const simulation = useWorkflowStore((s) => s.simulation);
  const tick = useWorkflowStore((s) => s.currentTick);
  const result = useWorkflowStore((s) => s.lastEvaluationResult);
  const stale = useWorkflowStore((s) => s.isEvaluationStale);

  const selectTest = useWorkflowStore((s) => s.selectTest);
  const start = useWorkflowStore((s) => s.startSimulation);
  const step = useWorkflowStore((s) => s.stepSimulation);
  const pause = useWorkflowStore((s) => s.pauseSimulation);
  const resume = useWorkflowStore((s) => s.resumeSimulation);
  const reset = useWorkflowStore((s) => s.resetSimulation);
  const evaluate = useWorkflowStore((s) => s.runEvaluation);

  const playbackMs = useWorkflowStore((s) => s.playbackMs);
  const setPlaybackMs = useWorkflowStore((s) => s.setPlaybackMs);
  const activeTokens = useWorkflowStore((s) => s.activeTokens);
  useSimulationClock();
  const speed = Math.max(
    0,
    SPEEDS.findIndex((s) => s.ms === playbackMs),
  );

  // The kinds of token on the canvas right now, one entry per look, for the legend in the status line.
  const looks = [...new Map(activeTokens.map((t) => [`${t.look.kind}:${t.look.cardType}`, t.look])).values()];

  const visible = level.testSuite.filter((t) => !t.hidden);
  const hiddenCount = level.testSuite.length - visible.length;
  const finished = simulation?.finished === true;
  const live = simulation !== null && !finished;

  const play = (): void => {
    if (!simulation || finished) start();
    else resume();
  };

  return (
    <div className="pointer-events-auto w-[min(560px,calc(100vw-800px))] min-w-[400px] rounded-xl border border-slate-700 bg-slate-950/95 p-2 shadow-2xl">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Test to replay"
          value={selectedTestId ?? ''}
          onChange={(e) => selectTest(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[12px] text-slate-100 focus:border-sky-500 focus:outline-none"
        >
          {visible.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1" role="group" aria-label="Playback">
          <IconButton label="Reset" onClick={reset} disabled={!simulation}>
            <svg {...svgProps}>
              <path d="M7 2a5 5 0 1 0 5 5h-1.6A3.4 3.4 0 1 1 7 3.6V6l3-3-3-3z" transform="translate(0 1) scale(.9)" />
            </svg>
          </IconButton>
          <IconButton label="Step one node" onClick={step} disabled={finished || isRunning}>
            <svg {...svgProps}>
              <path d="M2 2l6 5-6 5zM10 2h2v10h-2z" />
            </svg>
          </IconButton>
          {isRunning ? (
            <IconButton label="Pause" onClick={pause} tone="primary">
              <svg {...svgProps}>
                <path d="M3 2h3v10H3zM8 2h3v10H8z" />
              </svg>
            </IconButton>
          ) : (
            <IconButton label={finished ? 'Replay' : live ? 'Resume' : 'Play'} onClick={play} tone="primary">
              <svg {...svgProps}>
                <path d="M3 1.5l9 5.5-9 5.5z" />
              </svg>
            </IconButton>
          )}
        </div>

        <select
          aria-label="Playback speed"
          value={speed}
          onChange={(e) => setPlaybackMs(SPEEDS[Number(e.target.value)]?.ms ?? 900)}
          className="rounded-md border border-slate-700 bg-slate-900 px-1.5 py-1.5 text-[12px] text-slate-200 focus:border-sky-500 focus:outline-none"
        >
          {SPEEDS.map((s, i) => (
            <option key={s.label} value={i}>
              {s.label}
            </option>
          ))}
        </select>

        <span className="mx-0.5 h-6 w-px bg-slate-700" aria-hidden="true" />

        <button
          type="button"
          onClick={() => evaluate()}
          className="rounded-md bg-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-slate-950 hover:bg-emerald-400"
          title={`Grade your diagram against all ${level.testSuite.length} tests`}
        >
          Submit
        </button>
      </div>

      <p className="mt-1.5 flex min-h-[18px] flex-wrap items-center gap-x-2 px-0.5 text-[11px] text-slate-400" aria-live="polite" data-testid="run-status">
        {simulation && looks.length > 0 && (
          <span className="flex items-center gap-1.5" data-testid="token-legend">
            {looks.map((look) => (
              <span key={`${look.kind}:${look.cardType}`} className="flex items-center gap-1 rounded-full bg-slate-800/80 py-px pl-1 pr-2 text-slate-200" data-token-kind={look.kind}>
                <TokenGlyph look={look} width={20} />
                {look.label}
              </span>
            ))}
          </span>
        )}
        {!simulation && (
          <>
            Press play to watch one transaction travel through your diagram.
            {hiddenCount > 0 && <> {hiddenCount} hidden test{hiddenCount === 1 ? '' : 's'} run only when you submit.</>}
          </>
        )}
        {live && (
          <>
            Tick <span className="font-mono text-slate-200">{tick}</span> · replaying <span className="text-slate-200">{simulation.testName}</span>
          </>
        )}
        {finished && simulation.matchesExpected && (
          <span className="text-emerald-300">
            ✓ Ended as expected: {simulation.outcome?.replace(/_/g, ' ').toLowerCase()} in {simulation.latencyMs} ms
          </span>
        )}
        {finished && !simulation.matchesExpected && (
          <span className="text-rose-300">
            ✕ Expected {simulation.expectedOutcome.replace(/_/g, ' ').toLowerCase()}, got {simulation.outcome?.replace(/_/g, ' ').toLowerCase()}
            {simulation.anomalies[0] ? `. ${simulation.anomalies[0].message}` : ''}
          </span>
        )}
        {result && (
          <span className="float-right ml-2">
            <span className={result.passed ? 'text-emerald-300' : 'text-amber-300'}>
              Last submit: {result.correctnessScore}% correct{stale ? ' (out of date)' : ''}
            </span>
          </span>
        )}
      </p>

      <PersistenceRow />
    </div>
  );
}
