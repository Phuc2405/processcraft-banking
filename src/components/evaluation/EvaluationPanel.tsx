import { useEffect, useMemo, useRef, useState } from 'react';
import { ledgerUi } from '../../data/ledgerCopy';
import { postTestResult } from '../../engine/postings';
import { useWorkflowStore, type PlaybackLogLine } from '../../store/workflowStore';
import type { EvaluationResult, FeedbackLog, GLEntry, TestFailureReason } from '../../types/processLearning';
import { LedgerView, type LedgerBatch } from '../ledger/LedgerView';

const REASON_TEXT: Record<TestFailureReason, string> = {
  WRONG_OUTCOME: 'wrong outcome',
  WRONG_REASON_CODE: 'wrong reason code',
  LATENCY_EXCEEDED: 'too slow',
  MISSING_REQUIRED_CAPABILITY: 'skipped a required check',
  FORBIDDEN_CAPABILITY_VISITED: 'ran a check it should have skipped',
  DEADLOCK: 'got stuck',
  EXCEPTION: 'unhandled error',
};

const FEEDBACK_STYLE: Record<FeedbackLog['level'], string> = {
  INFO: 'border-slate-700 text-slate-300',
  HINT: 'border-sky-500/50 text-sky-200',
  WARN: 'border-amber-500/50 text-amber-200',
  ERROR: 'border-rose-500/50 text-rose-200',
};

const LOG_STYLE: Record<PlaybackLogLine['kind'], string> = {
  step: 'text-slate-200',
  move: 'text-slate-400',
  fork: 'text-violet-300',
  join: 'text-orange-300',
  done: 'text-emerald-300',
  fault: 'text-rose-300',
  anomaly: 'text-rose-300',
};

const pretty = (s: string): string => s.replace(/_/g, ' ').toLowerCase();

function ScoreBar({ label, value, shown, tone }: { label: string; value: number; shown: string; tone: 'good' | 'warn' | 'idle' }) {
  const fill = tone === 'good' ? 'bg-emerald-400' : tone === 'warn' ? 'bg-amber-400' : 'bg-slate-600';
  return (
    <div className="min-w-[150px] flex-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
        <span className="font-mono text-lg font-semibold text-slate-100">{shown}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <div className={`h-full rounded-full transition-all duration-500 ${fill}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Results({ result, stale }: { result: EvaluationResult; stale: boolean }) {
  const level = useWorkflowStore((s) => s.level);
  const nameOf = (id: string): string => level.testSuite.find((t) => t.id === id)?.name ?? id;
  const isHidden = (id: string): boolean => level.testSuite.find((t) => t.id === id)?.hidden === true;
  const errors = result.detectedAnomalies.filter((a) => a.severity === 'ERROR');

  return (
    <div className="space-y-4 p-4">
      {stale && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-950/60 px-3 py-2 text-[12px] text-amber-200">
          You have changed the diagram since this was graded. Press <strong>Submit</strong> to grade it again.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <span
          className={`rounded-full px-3 py-1 text-[12px] font-semibold ring-1 ${result.passed ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/40' : 'bg-amber-400/10 text-amber-300 ring-amber-400/40'}`}
        >
          {result.passed ? 'Level passed' : 'Not passing yet'}
        </span>
        <ScoreBar label="Correctness" value={result.correctnessScore} shown={`${result.correctnessScore}%`} tone={result.passed ? 'good' : 'warn'} />
        <ScoreBar
          label="Efficiency"
          value={result.efficiencyScore}
          shown={result.passed ? `${result.efficiencyScore}%` : '–'}
          tone={result.passed ? 'good' : 'idle'}
        />
        <p className="text-[12px] text-slate-400">
          <span className="font-semibold text-emerald-300">{result.passCount}</span> passed · <span className="font-semibold text-rose-300">{result.failCount}</span> failed
        </p>
      </div>

      {errors.length > 0 && (
        <section aria-label="Problems found">
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Problems in the diagram</h3>
          <ul className="space-y-1">
            {errors.map((a, i) => (
              <li key={`${a.type}-${a.nodeId ?? ''}-${a.edgeId ?? ''}-${i}`} className="flex gap-2 rounded-md border border-rose-500/30 bg-rose-950/30 px-2.5 py-1.5 text-[12px] text-rose-100">
                <code className="shrink-0 rounded bg-rose-950 px-1.5 text-[10px] font-semibold leading-5 text-rose-300">{pretty(a.type)}</code>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Test results">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tests</h3>
        <ul className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800">
          {result.testResults.map((t) => (
            <li key={t.testCaseId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 bg-slate-900/60 px-3 py-1.5 text-[12px]">
              <span className={`w-4 text-center font-bold ${t.passed ? 'text-emerald-400' : 'text-rose-400'}`} aria-label={t.passed ? 'passed' : 'failed'}>
                {t.passed ? '✓' : '✕'}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-100">
                {nameOf(t.testCaseId)}
                {isHidden(t.testCaseId) && <span className="ml-2 rounded bg-slate-800 px-1.5 py-px text-[10px] uppercase tracking-wide text-slate-400">hidden</span>}
              </span>
              <span className="text-slate-400">
                wanted <span className="text-slate-200">{pretty(t.expectedOutcome)}</span>
                {!t.passed && (
                  <>
                    , got <span className="text-rose-300">{pretty(t.actualOutcome)}</span>
                  </>
                )}
              </span>
              <span className="w-16 text-right font-mono text-slate-500">{t.latencyMs} ms</span>
              {!t.passed && t.failureReasons.length > 0 && <span className="w-full pl-7 text-[11px] text-rose-300">{t.failureReasons.map((r) => REASON_TEXT[r]).join(', ')}</span>}
            </li>
          ))}
        </ul>
      </section>

      {result.feedbackLogs.length > 0 && (
        <section aria-label="Feedback">
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Feedback</h3>
          <ul className="space-y-1.5">
            {result.feedbackLogs.map((f, i) => (
              <li key={i} className={`rounded-md border-l-2 bg-slate-900/60 px-3 py-1.5 text-[12px] leading-snug ${FEEDBACK_STYLE[f.level]}`}>
                {f.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RunLog() {
  const log = useWorkflowStore((s) => s.playbackLog);
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [log.length]);

  if (log.length === 0) {
    return <p className="p-4 text-[12px] text-slate-400">Press play on the canvas toolbar. Every step a token takes is listed here.</p>;
  }
  return (
    <ol className="space-y-0.5 p-3 font-mono text-[11.5px]">
      {log.map((l, i) => (
        <li key={i} className={`flex gap-3 ${LOG_STYLE[l.kind]}`}>
          <span className="w-8 shrink-0 text-right text-slate-600">{l.tick}</span>
          <span>{l.text}</span>
        </li>
      ))}
      <li ref={end} />
    </ol>
  );
}

type LedgerSource = 'replay' | 'graded';

/**
 * The live double-entry mini ledger. Two views of the same engine: the lines the payment on the canvas posted when its replay
 * finished, and the lines every visible test would post on the diagram as last graded.
 */
function LedgerTab() {
  const ui = ledgerUi();
  const level = useWorkflowStore((s) => s.level);
  const replay = useWorkflowStore((s) => s.ledgerEntries);
  const simulation = useWorkflowStore((s) => s.simulation);
  const result = useWorkflowStore((s) => s.lastEvaluationResult);
  const [source, setSource] = useState<LedgerSource>('replay');

  const replayBatches = useMemo<LedgerBatch[]>(
    () => (replay.length === 0 ? [] : [{ id: replay[0]?.txId ?? 'replay', title: simulation?.testName ?? 'Replay', subtitle: replay[0]?.txId, entries: replay }]),
    [replay, simulation],
  );
  const gradedBatches = useMemo<LedgerBatch[]>(() => {
    if (!result) return [];
    return result.testResults.flatMap((t) => {
      const entries: GLEntry[] = postTestResult(t);
      if (entries.length === 0) return [];
      const test = level.testSuite.find((x) => x.id === t.testCaseId);
      return [{ id: t.testCaseId, title: test?.name ?? t.testCaseId, subtitle: entries[0]?.txId, entries }];
    });
  }, [result, level]);

  const batches = source === 'replay' ? replayBatches : gradedBatches;
  const tab = (active: boolean): string => `rounded-md px-2.5 py-1 text-[11.5px] font-medium ${active ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`;

  return (
    <div className="space-y-3 p-4" data-testid="ledger-tab">
      <header>
        <h3 className="text-[13px] font-semibold text-slate-100">{ui.title}</h3>
        <p className="mt-0.5 max-w-[760px] text-[12px] leading-relaxed text-slate-400">{ui.lede}</p>
      </header>
      <div className="flex items-center gap-1" role="group" aria-label={ui.title}>
        <button type="button" className={tab(source === 'replay')} aria-pressed={source === 'replay'} onClick={() => setSource('replay')} data-testid="ledger-source-replay">
          {ui.replaySource}
        </button>
        <button type="button" className={tab(source === 'graded')} aria-pressed={source === 'graded'} onClick={() => setSource('graded')} data-testid="ledger-source-graded">
          {ui.gradedSource}
        </button>
        {batches.length > 0 && <span className="ml-3 text-[11px] text-slate-500">{ui.summary(batches.length, batches.reduce((n, b) => n + b.entries.length, 0))}</span>}
      </div>
      <LedgerView
        split
        batches={batches}
        empty={
          source === 'replay'
            ? simulation?.finished
              ? ui.declinedNothing
              : ui.emptyLab
            : result
              ? ui.declinedNothing
              : ui.noGraded
        }
      />
    </div>
  );
}

/** Bottom drawer: the graded result of the last Submit, the step-by-step log of the last replay, and the ledger they post. */
export function EvaluationPanel() {
  const result = useWorkflowStore((s) => s.lastEvaluationResult);
  const stale = useWorkflowStore((s) => s.isEvaluationStale);
  const logLength = useWorkflowStore((s) => s.playbackLog.length);
  const ledgerLines = useWorkflowStore((s) => s.ledgerEntries.length);
  const [tab, setTab] = useState<'results' | 'log' | 'ledger'>('results');
  const [open, setOpen] = useState(true);

  // A fresh grade is the thing the learner just asked for: show it.
  useEffect(() => {
    if (result) {
      setTab('results');
      setOpen(true);
    }
  }, [result]);
  // The first line of a new replay switches to the log so the narration is visible.
  const previousLogLength = useRef(0);
  useEffect(() => {
    if (previousLogLength.current === 0 && logLength > 0) {
      setTab('log');
      setOpen(true);
    }
    previousLogLength.current = logLength;
  }, [logLength]);

  const tabClass = (active: boolean): string =>
    `rounded-md px-3 py-1 text-[12px] font-medium ${active ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`;

  return (
    <section aria-label="Results" className={`flex shrink-0 flex-col border-t border-slate-800 bg-slate-950 ${open ? 'h-[270px]' : 'h-10'}`}>
      <header className="flex h-10 shrink-0 items-center gap-1 px-3">
        <button type="button" role="tab" aria-selected={tab === 'results'} onClick={() => { setTab('results'); setOpen(true); }} className={tabClass(tab === 'results')}>
          Results
          {result && <span className={`ml-2 font-mono ${result.passed ? 'text-emerald-300' : 'text-amber-300'}`}>{result.correctnessScore}%</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'log'} onClick={() => { setTab('log'); setOpen(true); }} className={tabClass(tab === 'log')}>
          Replay log
        </button>
        <button type="button" role="tab" aria-selected={tab === 'ledger'} onClick={() => { setTab('ledger'); setOpen(true); }} data-testid="tab-ledger" className={tabClass(tab === 'ledger')}>
          Ledger
          {ledgerLines > 0 && <span className="ml-2 font-mono text-sky-300">{ledgerLines}</span>}
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Collapse results' : 'Expand results'} className="ml-auto grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={open ? '' : 'rotate-180'}>
            <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>
      {open && (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-800/80">
          {tab === 'results' ? (
            result ? (
              <Results result={result} stale={stale} />
            ) : (
              <p className="p-4 text-[12px] text-slate-400">Press <strong className="text-slate-200">Submit</strong> to grade your diagram against every test, including the hidden ones.</p>
            )
          ) : tab === 'log' ? (
            <RunLog />
          ) : (
            <LedgerTab />
          )}
        </div>
      )}
    </section>
  );
}
