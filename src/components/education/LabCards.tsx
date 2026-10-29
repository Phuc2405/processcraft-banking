import { factLabel, factValue } from '../../i18n/factsVi';
import { localChallenge } from '../../i18n/challengeVi';
import { forwardRef, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { labScene, labUi } from '../../data/labTourCopy';
import { curriculumPosition, LEVELS } from '../../data/seedChallenges';
import { batchesFrom, LedgerView } from '../ledger/LedgerView';
import { ledgerUi } from '../../data/ledgerCopy';
import { playableTests, type LabQuiz, type LabStep, type LabTour, type StepTone } from '../../sim/labTour';
import { isBlocked, quizAt, useLabTour, type QuizAnswer } from '../../store/labTourStore';
import { useTerms } from '../bank/useTerms';
import { MessagePreview } from '../inspector/MessagePreview';

/** What the Build Lab tour puts on screen besides the canvas. */

const TONE: Record<StepTone, string> = {
  neutral: 'bg-slate-800 text-slate-200 ring-slate-600',
  good: 'bg-emerald-400/10 text-emerald-200 ring-emerald-400/40',
  warn: 'bg-amber-400/10 text-amber-200 ring-amber-400/40',
  bad: 'bg-rose-400/10 text-rose-200 ring-rose-400/40',
};

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="mt-2.5" data-testid={testId}>
      <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{title}</h4>
      <div className="mt-1 text-[12.5px] leading-relaxed text-slate-200">{children}</div>
    </section>
  );
}

function Facts({ items }: { items: ReadonlyArray<{ label: string; value: string }> }) {
  if (items.length === 0) return null;
  return (
    <dl className="mt-1.5 flex flex-wrap gap-1">
      {items.map((f) => (
        <div key={f.label} className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[11px]">
          <dt className="inline text-slate-400">{factLabel(f.label)}: </dt>
          <dd className="inline font-medium text-slate-100">{factValue(f.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

// Opening card

export function LabIntro({ accent }: { accent: string }) {
  const ui = labUi();
  const terms = useTerms();
  const tour = useLabTour((s) => s.tour);
  const refusal = useLabTour((s) => s.refusal);
  const levelId = useLabTour((s) => s.levelId);
  const source = useLabTour((s) => s.source);
  const begin = useLabTour((s) => s.begin);
  const exit = useLabTour((s) => s.exit);
  const setTest = useLabTour((s) => s.setTest);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLButtonElement)) begin();
      else if (e.key === 'Escape') exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [begin, exit]);

  const position = levelId ? curriculumPosition(levelId) : null;
  const scene = levelId ? labScene(levelId) : null;
  const tests = tour ? tourTests(tour) : [];
  const canStart = tour !== null && tour.steps.length > 0;

  return (
    <div className="absolute inset-0 z-40 grid place-items-center overflow-y-auto p-6" data-testid="lab-kickoff">
      <div className="absolute inset-0 bg-[#050810]/80" onClick={exit} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ui.labTour}
        className="relative w-full max-w-[580px] rounded-2xl border bg-[#0b1120] p-5 shadow-2xl"
        style={{ borderColor: accent, boxShadow: `0 0 0 1px ${accent}55, 0 0 48px ${accent}33` }}
      >
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
          <span className="grid h-5 min-w-5 place-items-center rounded px-1 text-[11px] font-black text-slate-950" style={{ background: accent }}>
            {position?.label ?? '·'}
          </span>
          {ui.labTour}
          {position && <span className="font-medium normal-case tracking-normal text-slate-400">{ui.stageOf(position.stage, position.stageTitle)}</span>}
        </div>

        {refusal || !scene || !tour ? (
          <p className="mt-3 text-[13px] leading-relaxed text-rose-200" role="alert" data-testid="lab-refusal">
            {refusal ?? ui.noQuestions}
          </p>
        ) : (
          <>
            <h2 className="mt-1.5 text-[19px] font-bold leading-tight text-slate-50">{terms.t(scene.chapter)}</h2>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-slate-200">{terms.t(scene.scene)}</p>

            <div className={`mt-3 rounded-lg border px-3 py-2 text-[12px] leading-snug ${source === 'example' ? 'border-amber-500/40 bg-amber-950/30 text-amber-100' : 'border-sky-500/40 bg-sky-950/30 text-sky-100'}`}>
              {(source === 'example' || !tour.problem) && <span className="font-semibold">{source === 'example' ? ui.exampleSource : ui.mineSource}. </span>}
              {source === 'example' ? ui.spoiler : tour.problem ? ui.mineProblem(tour.problem) : ui.mineBlurb}
            </div>

            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{ui.thisRun}</span>
                <label className="flex items-center gap-2 text-[11px] text-slate-400">
                  {ui.testLabel}
                  <select
                    value={tour.testId}
                    onChange={(e) => setTest(e.target.value)}
                    data-testid="lab-test"
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
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {tour.carries.map((f) => (
                  <div key={f.label} className="text-[11.5px]">
                    <dt className="inline text-slate-500">{factLabel(f.label)}: </dt>
                    <dd className="inline font-medium tabular-nums text-slate-200">{factValue(f.value)}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="mt-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{ui.lookFor}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px] leading-snug text-slate-300">
                {scene.lookFor.map((l) => (
                  <li key={l}>{terms.t(l)}</li>
                ))}
              </ul>
            </div>
          </>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="max-w-[300px] text-[11.5px] leading-snug text-slate-500">{ui.startHint}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={exit} data-testid="lab-kickoff-exit" className="whitespace-nowrap rounded-lg px-3 py-2 text-[12.5px] font-medium text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-800">
              {ui.exit}
            </button>
            <button
              type="button"
              onClick={begin}
              disabled={!canStart}
              data-testid="lab-start"
              className="whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-bold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: accent }}
            >
              {ui.start} ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The payments the learner may follow on this level: every test that is not hidden. */
function tourTests(tour: LabTour): Array<{ id: string; name: string }> {
  const level = LEVELS.find((l) => l.id === tour.levelId);
  return level ? playableTests(localChallenge(level)).map((tc) => ({ id: tc.id, name: tc.name })) : [];
}

// The question at a decision

export function LabQuizGate({ quiz, answer, accent }: { quiz: LabQuiz; answer: QuizAnswer | undefined; accent: string }) {
  const ui = labUi();
  const terms = useTerms();
  const answerQuiz = useLabTour((s) => s.answer);
  const next = useLabTour((s) => s.next);
  const box = useRef<HTMLDivElement>(null);
  const answered = answer !== undefined;
  useEffect(() => {
    if (answered) box.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [answered]);
  const right = answer?.correct === true;

  return (
    <div
      ref={box}
      className="mt-3 rounded-lg border p-2.5"
      style={{ borderColor: answer ? (right ? '#34d399aa' : '#fb7185aa') : `${accent}aa`, background: answer ? (right ? '#022c2233' : '#4c051933') : '#0f172a' }}
      data-testid="lab-quiz"
      data-answered={answer ? (right ? 'right' : 'wrong') : 'no'}
    >
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: accent }}>
        <span aria-hidden="true">?</span>
        {ui.quizTitle}
      </div>
      <p className="mt-1 text-[13px] font-medium leading-snug text-slate-50">{terms.t(quiz.prompt)}</p>
      <div className="mt-2 grid gap-1.5" role="group" aria-label={ui.quizTitle}>
        {quiz.options.map((opt, i) => {
          const isRight = i === quiz.correct;
          const picked = answer?.picked === i;
          const state = !answer ? 'open' : isRight ? 'right' : picked ? 'wrong' : 'rest';
          return (
            <button
              key={`${i}-${opt}`}
              type="button"
              disabled={answer !== undefined}
              onClick={() => answerQuiz(i)}
              data-testid={`lab-quiz-option-${i}`}
              data-state={state}
              className={[
                'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-[12.5px] leading-snug transition',
                state === 'open' ? 'border-slate-600 bg-slate-900 text-slate-100 hover:border-slate-300 hover:bg-slate-800' : '',
                state === 'right' ? 'border-emerald-400 bg-emerald-400/15 text-emerald-100' : '',
                state === 'wrong' ? 'border-rose-400 bg-rose-400/15 text-rose-100' : '',
                state === 'rest' ? 'border-slate-800 bg-slate-950 text-slate-500' : '',
              ].join(' ')}
            >
              <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px] font-bold" aria-hidden="true">
                {state === 'right' ? '✓' : state === 'wrong' ? '✕' : String.fromCharCode(65 + i)}
              </span>
              <span>{terms.t(opt)}</span>
            </button>
          );
        })}
      </div>
      {answer ? (
        <div role="status" className="mt-2 text-[12.5px] leading-relaxed" data-testid="lab-quiz-feedback">
          <p className={`font-semibold ${right ? 'text-emerald-300' : 'text-rose-300'}`}>
            {right ? ui.correct : `${ui.notQuite} ${ui.rightAnswer}: ${terms.t(quiz.options[quiz.correct] ?? '')}`}
          </p>
          <p className="mt-0.5 text-slate-300">{terms.t(quiz.explain)}</p>
          <button type="button" onClick={next} data-testid="lab-quiz-continue" className="mt-2 rounded-md px-3 py-1.5 text-[12px] font-bold text-slate-950 transition hover:brightness-110" style={{ background: accent }}>
            {ui.next} ▶
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">{ui.quizAsk}</p>
      )}
    </div>
  );
}

// The explanation at a box

export const LabStepCard = forwardRef<HTMLDivElement, { step: LabStep; total: number; accent: string; style?: CSSProperties; className?: string }>(function LabStepCard(
  { step, total, accent, style, className },
  ref,
) {
  const ui = labUi();
  const terms = useTerms();
  const quiz = useLabTour((s) => quizAt(s, step.index));
  const answer = useLabTour((s) => s.answers[step.index]);
  const blocked = useLabTour((s) => isBlocked(s));

  return (
    <div
      ref={ref}
      role="region"
      aria-label={terms.t(step.title)}
      aria-live="polite"
      className={`z-30 overflow-y-auto rounded-xl border bg-[#0b1120]/95 p-3 shadow-2xl ${className ?? ''}`}
      style={{ ...style, borderColor: accent, boxShadow: `0 0 0 1px ${accent}44, 0 10px 40px #000a, 0 0 32px ${accent}33` }}
      data-testid="lab-callout"
      data-step={step.index}
      data-node={step.nodeId}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-slate-950" style={{ background: accent }} data-testid="lab-step-count">
          {ui.stepOf(step.index + 1, total)}
        </span>
        <span className={`truncate rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${TONE[step.tone]}`}>{ui.kinds[step.kind]}</span>
      </div>
      <h3 className="mt-1.5 text-[15px] font-bold leading-snug text-slate-50" data-testid="lab-title">
        {terms.t(step.title)}
      </h3>

      <Section title={ui.whatHappens} testId="lab-what">
        <p>{terms.t(step.what)}</p>
        {step.happened && (
          <p className={`mt-1.5 rounded-md px-2 py-1.5 text-[12px] ring-1 ${TONE[step.tone]}`}>
            <span className="font-semibold">{ui.forThisPayment}: </span>
            {terms.t(step.happened)}
          </p>
        )}
        <Facts items={step.facts} />
        {step.message && (
          <div className="mt-2">
            <MessagePreview title={step.message.title} xml={step.message.xml} testId="lab-message" />
          </div>
        )}
      </Section>

      <Section title={ui.takeaway} testId="lab-takeaway">
        <p>{terms.t(step.why)}</p>
      </Section>

      {step.fails.length > 0 && (
        <details className="group mt-2.5" open={!blocked} data-testid="lab-fails">
          <summary className="cursor-pointer select-none text-[10.5px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200">
            {ui.canGoWrong} <span className="font-medium normal-case tracking-normal text-slate-500">({step.fails.length})</span>
          </summary>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] leading-relaxed text-slate-300 marker:text-rose-400">
            {step.fails.map((f) => (
              <li key={f}>{terms.t(f)}</li>
            ))}
          </ul>
        </details>
      )}

      {quiz && <LabQuizGate quiz={quiz} answer={answer} accent={accent} />}
    </div>
  );
});

// How it ended

export function LabVerdict({ tour, accent, className }: { tour: LabTour; accent: string; className?: string }) {
  const ui = labUi();
  const lui = ledgerUi();
  const terms = useTerms();
  const answers = useLabTour((s) => s.answers);
  const quizzes = useLabTour((s) => s.quizzes);
  const replay = useLabTour((s) => s.setAuto);
  const { verdict } = tour;
  const right = quizzes.filter((q) => answers[q.step]?.correct).length;

  return (
    <div
      role="region"
      aria-label={ui.verdictTitle}
      aria-live="polite"
      className={`z-30 overflow-y-auto rounded-xl border bg-[#0b1120]/95 p-3 shadow-2xl ${className ?? ''}`}
      style={{ borderColor: accent, boxShadow: `0 0 0 1px ${accent}44, 0 10px 40px #000a, 0 0 32px ${accent}33` }}
      data-testid="lab-verdict"
      data-outcome={verdict.outcome}
      data-matches={verdict.matchesExpected}
    >
      <div className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: accent }}>
        {ui.tourDone}
      </div>
      <h3 className="mt-1 text-[15px] font-bold leading-snug text-slate-50">{ui.verdictTitle}</h3>
      <p className={`mt-1.5 rounded-md px-2 py-1.5 text-[12.5px] ring-1 ${TONE[verdict.tone]}`} data-testid="lab-verdict-headline">
        <span className="font-semibold">{terms.t(verdict.headline)}.</span> {terms.t(verdict.detail)}
      </p>

      <p className={`mt-1.5 text-[12px] font-semibold ${verdict.matchesExpected ? 'text-emerald-300' : 'text-rose-300'}`} data-testid="lab-verdict-match">
        <span aria-hidden="true">{verdict.matchesExpected ? '✓' : '✕'}</span> {verdict.matchesExpected ? ui.matchesTest : ui.missesTest}
      </p>

      {tour.problem && (
        <Section title={ui.stuckTitle} testId="lab-problem">
          <p className="text-rose-200">{tour.problem}</p>
        </Section>
      )}

      <p className="mt-2 text-[12px] text-slate-400" data-testid="lab-verdict-score">
        {quizzes.length === 0 ? ui.noQuestions : ui.score(right, quizzes.length)}
      </p>

      <Section title={ui.ledgerTitle} testId="lab-verdict-ledger">
        {tour.ledger.length === 0 ? (
          <p className="text-slate-400">{lui.declinedNothing}</p>
        ) : (
          <LedgerView batches={batchesFrom(tour.ledger, () => ({ title: tour.testName }))} />
        )}
      </Section>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => replay(true)} data-testid="lab-replay" className="rounded-md px-3 py-1.5 text-[12px] font-bold text-slate-950 transition hover:brightness-110" style={{ background: accent }}>
          ↻ {ui.replayTour}
        </button>
      </div>
    </div>
  );
}
