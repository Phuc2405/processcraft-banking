import { forwardRef, useEffect, useRef, type ReactNode } from 'react';
import { modelCopy, modelForStation } from '../../data/mentalModels';
import { sceneOf, walkUi } from '../../data/walkthroughCopy';
import { LESSONS, PROCESS_SHORT } from '../../sim/learning';
import { isStation } from '../../sim/topology';
import { quizzesOf } from '../../sim/walkQuiz';
import type { StepTone } from '../../sim/walkthrough';
import { bankStore, useBankStore } from '../../store/bankStore';
import { useSpotlightFocus, type Focus } from '../bank/useSpotlight';
import { useTerms } from '../bank/useTerms';

/**
 * The guided walkthrough: the part of Learn & Explore the learner reads and answers.
 *
 *   Kickoff        the opening scene ("Customer An has just bought a shirt online…") before the token moves
 *   StepCard       at every desk: What is happening here? / Key takeaway / What can go wrong
 *   QuizGate       at every decision (XOR gateway): a question the learner must answer before the token carries on
 *   GuidedBar      the sticky bar at the bottom: Previous step, Auto-play / Pause / Resume, Next step, Exit tutorial
 *
 * The map side (dimming, the glowing path, the token that rides the wires) is in bank/Spotlight.tsx. Everything here
 * reads and writes the same bank store as the rest of the screen.
 */

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

// ─────────────────────────────────────────────────────────────────────────────
// Kickoff
// ─────────────────────────────────────────────────────────────────────────────

export function Kickoff({ focus }: { focus: Focus }) {
  const ui = walkUi();
  const terms = useTerms();
  const begin = useBankStore((s) => s.beginSpotlight);
  const setExample = useBankStore((s) => s.setSpotlightExample);
  const exit = useBankStore((s) => s.exitSpotlight);
  const lesson = LESSONS[focus.tour.process];
  const scene = sceneOf(focus.tour.process);
  const example = lesson.examples.find((e) => e.id === focus.tour.exampleId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLSelectElement)) begin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [begin]);

  return (
    <div className="absolute inset-0 z-40 grid place-items-center p-6" data-testid="walk-kickoff">
      <div className="absolute inset-0 bg-[#050810]/80" onClick={exit} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={`${ui.tour}: ${lesson.title}`} className="relative w-full max-w-[560px] rounded-2xl border bg-[#0b1120] p-5 shadow-2xl" style={{ borderColor: focus.accent, boxShadow: `0 0 0 1px ${focus.accent}55, 0 0 48px ${focus.accent}33` }}>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: focus.accent }}>
          <span className="grid h-5 w-5 place-items-center rounded text-[11px] font-black text-slate-950" style={{ background: focus.accent }}>
            {lesson.chapter}
          </span>
          {ui.tour} · {ui.chapter} {lesson.chapter}
        </div>
        <h2 className="mt-1.5 text-[19px] font-bold leading-tight text-slate-50">{terms.t(scene.chapter)}</h2>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-slate-200">{terms.t(scene.scene)}</p>

        {example && (
          <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{ui.thisRun}</span>
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                {ui.example}
                <select
                  value={focus.tour.exampleId}
                  onChange={(e) => setExample(e.target.value)}
                  data-testid="walk-example"
                  className="max-w-[240px] rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[12px] text-slate-100"
                >
                  {lesson.examples.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-300">{terms.t(example.story)}</p>
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {focus.plan.walk.carries.map((f) => (
                <div key={f.label} className="text-[11.5px]">
                  <dt className="inline text-slate-500">{f.label}: </dt>
                  <dd className="inline font-medium tabular-nums text-slate-200">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="mt-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{ui.lookFor}</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px] leading-snug text-slate-300">
            {scene.lookFor.map((l) => (
              <li key={l}>{terms.t(l)}</li>
            ))}
          </ul>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="max-w-[300px] text-[11.5px] leading-snug text-slate-500">{ui.startHint}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={exit} className="whitespace-nowrap rounded-lg px-3 py-2 text-[12.5px] font-medium text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-800">
              {ui.exit}
            </button>
            <button type="button" onClick={begin} data-testid="walk-start" className="whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-bold text-slate-950 transition hover:brightness-110" style={{ background: focus.accent }}>
              {ui.start} ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The question at a decision
// ─────────────────────────────────────────────────────────────────────────────

export function QuizGate({ focus }: { focus: Focus }) {
  const ui = walkUi();
  const terms = useTerms();
  const answerQuiz = useBankStore((s) => s.answerQuiz);
  const next = useBankStore((s) => s.spotlightNext);
  const { quiz, answer } = focus;
  const box = useRef<HTMLDivElement>(null);
  const answered = answer !== undefined;
  useEffect(() => {
    if (answered) box.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [answered]);
  if (!quiz) return null;
  const right = answer?.correct === true;

  return (
    <div ref={box} className="mt-3 rounded-lg border p-2.5" style={{ borderColor: answer ? (right ? '#34d399aa' : '#fb7185aa') : `${focus.accent}aa`, background: answer ? (right ? '#022c2233' : '#4c051933') : '#0f172a' }} data-testid="walk-quiz" data-answered={answer ? (right ? 'right' : 'wrong') : 'no'}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: focus.accent }}>
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
              key={opt}
              type="button"
              disabled={answer !== undefined}
              onClick={() => answerQuiz(i)}
              data-testid={`quiz-option-${i}`}
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
        <div role="status" className="mt-2 text-[12.5px] leading-relaxed" data-testid="quiz-feedback">
          <p className={`font-semibold ${right ? 'text-emerald-300' : 'text-rose-300'}`}>
            {right ? ui.correct : `${ui.notQuite} ${ui.rightAnswer}: ${terms.t(quiz.options[quiz.correct] ?? '')}`}
          </p>
          <p className="mt-0.5 text-slate-300">{terms.t(quiz.explain)}</p>
          <button type="button" onClick={next} data-testid="quiz-continue" className="mt-2 rounded-md px-3 py-1.5 text-[12px] font-bold text-slate-950 transition hover:brightness-110" style={{ background: focus.accent }}>
            {ui.next} ▶
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">{ui.quizAsk}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The explanation at a desk
// ─────────────────────────────────────────────────────────────────────────────

export const StepCard = forwardRef<HTMLDivElement, { focus: Focus; style?: React.CSSProperties; side?: string }>(function StepCard({ focus, style, side }, ref) {
  const ui = walkUi();
  const terms = useTerms();
  const { step } = focus.current;
  const place = focus.current.place;
  const model = terms.beginner && isStation(place) ? modelForStation(place) : null;
  const picture = model ? modelCopy(model.id) : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={terms.t(step.title)}
      aria-live="polite"
      className="bk-callout absolute z-40 w-[400px] max-w-[calc(100%-16px)] overflow-y-auto rounded-xl border bg-[#0b1120]/95 p-3 shadow-2xl"
      style={{ ...style, maxHeight: 'calc(100% - 16px)', borderColor: focus.accent, boxShadow: `0 0 0 1px ${focus.accent}44, 0 10px 40px #000a, 0 0 32px ${focus.accent}33` }}
      data-testid="walk-callout"
      data-step={focus.index}
      data-node={step.nodeId}
      data-side={side}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-slate-950" style={{ background: focus.accent }} data-testid="walk-step-count">
          {ui.stepOf(focus.index + 1, focus.plan.steps.length)}
        </span>
        <span className={`truncate rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${TONE[step.tone]}`}>{terms.place(place)}</span>
        <button
          type="button"
          onClick={() => bankStore.getState().setWalkCollapsed(true)}
          aria-label="Minimise the step card"
          title="Minimise: fold this card into a small badge so the whole map can be seen"
          data-testid="walk-collapse"
          className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-md text-[15px] font-bold leading-none text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-800 hover:text-white"
        >
          −
        </button>
      </div>
      <h3 className="mt-1.5 text-[15px] font-bold leading-snug text-slate-50" data-testid="walk-title">
        {terms.t(step.title)}
      </h3>

      <Section title={ui.whatHappens} testId="walk-what">
        <p>{terms.t(step.what)}</p>
        {step.happened && (
          <p className={`mt-1.5 rounded-md px-2 py-1.5 text-[12px] ring-1 ${TONE[step.tone]}`}>
            <span className="font-semibold">{ui.forThisPayment}: </span>
            {terms.t(step.happened)}
          </p>
        )}
        {step.facts.length > 0 && (
          <dl className="mt-1.5 flex flex-wrap gap-1">
            {step.facts.map((f) => (
              <div key={f.label} className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[11px]">
                <dt className="inline text-slate-400">{f.label}: </dt>
                <dd className="inline font-medium text-slate-100">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      <Section title={ui.takeaway} testId="walk-takeaway">
        <p>{terms.t(step.why)}</p>
      </Section>

      {step.fails.length > 0 && (
        <details className="group mt-2.5" open={!focus.blocked} data-testid="walk-fails">
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

      {picture && (
        <p className="mt-2.5 rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1.5 text-[12px] leading-snug text-slate-300" data-testid="walk-picture">
          <span className="font-semibold text-slate-100">
            {ui.thinkOfItLike} {picture.title.charAt(0).toLowerCase() + picture.title.slice(1)}:{' '}
          </span>
          {picture.hook}
        </p>
      )}

      <QuizGate focus={focus} />
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// The bar at the bottom
// ─────────────────────────────────────────────────────────────────────────────

export function GuidedBar() {
  const focus = useSpotlightFocus();
  const ui = walkUi();
  const terms = useTerms();
  const exit = useBankStore((s) => s.exitSpotlight);
  const prev = useBankStore((s) => s.spotlightPrev);
  const next = useBankStore((s) => s.spotlightNext);
  const go = useBankStore((s) => s.spotlightGo);
  const setAuto = useBankStore((s) => s.setSpotlightAuto);
  const setExample = useBankStore((s) => s.setSpotlightExample);
  const openHub = useBankStore((s) => s.openHub);

  // Keyboard: ← → move, Space plays and pauses, Esc leaves. Not while a control that uses the same keys has focus.
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target;
      if (t instanceof HTMLSelectElement || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') exit();
      else if (e.key === ' ' && !(t instanceof HTMLButtonElement)) {
        e.preventDefault();
        const state = bankStore.getState().spotlight;
        if (state && !state.intro) setAuto(!state.auto);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, next, prev, exit, setAuto]);

  if (!focus) return null;
  const { tour } = focus;
  const lesson = LESSONS[tour.process];
  const total = focus.plan.steps.length;
  const quizzes = quizzesOf(focus.plan);
  const quizSteps = new Set(quizzes.map((q) => q.step));
  const answered = quizzes.filter((q) => tour.answers[q.step] !== undefined);
  const rightCount = answered.filter((q) => tour.answers[q.step]?.correct).length;

  const middle = tour.auto ? ui.pause : focus.last && !tour.intro ? ui.replay : tour.step === 0 || tour.intro ? ui.autoPlay : ui.resume;
  const middleIcon = tour.auto ? '❚❚' : focus.last && !tour.intro ? '↻' : '▶';

  return (
    <div className="shrink-0 border-t bg-[#0a0f1c]" style={{ borderColor: `${focus.accent}88` }} data-testid="walk-bar" data-chapter={lesson.chapter} role="toolbar" aria-label={ui.tour}>
      <div className="flex items-center gap-3 px-4 pt-2.5">
        <div className="flex min-w-0 flex-1 basis-0 items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded text-[12px] font-black text-slate-950" style={{ background: focus.accent }} aria-hidden="true">
            {lesson.chapter}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{ui.chapter} {lesson.chapter} · Walkthrough</div>
            <div className="truncate text-[12.5px] font-semibold text-slate-100" title={lesson.title}>
              {terms.t(PROCESS_SHORT[tour.process])}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={prev} disabled={tour.intro || tour.step === 0} data-testid="walk-prev" className="whitespace-nowrap rounded-lg bg-slate-800 px-3 py-2 text-[12.5px] font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35">
            ◀ {ui.previous}
          </button>
          <button
            type="button"
            onClick={() => setAuto(!tour.auto)}
            disabled={tour.intro}
            data-testid="walk-auto"
            aria-pressed={tour.auto}
            className="min-w-[116px] whitespace-nowrap rounded-lg px-3 py-2 text-[12.5px] font-bold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
            style={{ background: focus.accent }}
          >
            <span aria-hidden="true">{middleIcon}</span> {middle}
          </button>
          <button
            type="button"
            onClick={next}
            disabled={tour.intro || focus.last || focus.blocked}
            title={focus.blocked ? ui.quizLocked : undefined}
            data-testid="walk-next"
            className="whitespace-nowrap rounded-lg bg-slate-800 px-3 py-2 text-[12.5px] font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {ui.next} ▶
          </button>
        </div>

        <div className="flex min-w-0 flex-1 basis-0 items-center justify-end gap-2">
          <button type="button" onClick={() => openHub(tour.process)} data-testid="walk-rule-lab" className="whitespace-nowrap rounded-lg px-2.5 py-2 text-[12px] font-medium text-slate-200 ring-1 ring-slate-700 transition hover:bg-slate-800">
            {ui.ruleLab}
          </button>
          <button type="button" onClick={exit} data-testid="walk-exit" className="whitespace-nowrap rounded-lg bg-rose-500/90 px-3 py-2 text-[12.5px] font-bold text-white transition hover:bg-rose-400">
            {ui.exit} ✕
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pb-2 pt-2 text-[11.5px] text-slate-400">
        <ol className="flex items-center gap-1" aria-label={ui.stepOf(tour.step + 1, total)}>
          {focus.plan.steps.map((s, i) => {
            const asked = quizSteps.has(i);
            const done = i < tour.step || (i === tour.step && !tour.intro && focus.last);
            return (
              <li key={`${s.step.nodeId}-${i}`}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`${ui.stepOf(i + 1, total)}: ${terms.t(s.step.title)}`}
                  aria-current={i === focus.index && !tour.intro ? 'step' : undefined}
                  title={terms.t(s.step.title)}
                  data-testid={`walk-dot-${i}`}
                  className={`h-2.5 rounded-full transition-all ${asked ? 'w-3.5' : 'w-2.5'}`}
                  style={{
                    background: i === focus.index && !tour.intro ? focus.accent : done ? `${focus.accent}88` : '#334155',
                    outline: asked ? '1px solid #94a3b8' : undefined,
                    outlineOffset: 1,
                  }}
                />
              </li>
            );
          })}
        </ol>
        <span className="flex items-center gap-1 whitespace-nowrap" title="The clock is stopped and the speed is locked while the tour runs." data-testid="walk-lock">
          <span aria-hidden="true">🔒</span> {ui.speedLocked}
        </span>
        <span className="whitespace-nowrap tabular-nums" data-testid="walk-score">
          {quizzes.length === 0 ? ui.noQuestions : ui.score(rightCount, quizzes.length)}
          {quizzes.length > 0 && answered.length < quizzes.length ? ` (${answered.length}/${quizzes.length} answered)` : ''}
        </span>
        <label className="ml-auto flex items-center gap-2 whitespace-nowrap">
          <span>{ui.example}</span>
          <select
            value={tour.exampleId}
            onChange={(e) => setExample(e.target.value)}
            data-testid="walk-example-bar"
            className="max-w-[260px] rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[12px] text-slate-100"
          >
            {lesson.examples.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The step card folded away, and the way back into a tour that was left
// ─────────────────────────────────────────────────────────────────────────────

/** The step card minimised: "📖 Chapter 2: Step 3/10". Click it to bring the card back. */
export function WalkBadge() {
  const focus = useSpotlightFocus();
  const collapsed = useBankStore((s) => s.walkCollapsed);
  const expand = useBankStore((s) => s.setWalkCollapsed);
  if (!focus || !collapsed || focus.tour.intro) return null;
  const chapter = LESSONS[focus.tour.process].chapter;
  return (
    <button
      type="button"
      onClick={() => expand(false)}
      title="Show the step card again"
      data-testid="walk-badge"
      className="absolute bottom-3 left-3 z-40 flex items-center gap-2 rounded-full border bg-slate-900/95 px-3 py-1.5 text-[12px] font-semibold text-slate-100 shadow-xl transition hover:bg-slate-800"
      style={{ borderColor: focus.accent, boxShadow: `0 0 18px ${focus.accent}44` }}
    >
      <span aria-hidden="true">📖</span>
      <span className="tabular-nums">
        Chapter {chapter}: Step {focus.index + 1}/{focus.plan.steps.length}
      </span>
      {focus.blocked && <span className="rounded-full bg-amber-400/20 px-1.5 text-[10.5px] text-amber-200">question waiting</span>}
      <span aria-hidden="true" className="text-slate-400">▴</span>
    </button>
  );
}

/** After "Exit tutorial": a way back to the same chapter and step, without reloading anything. */
export function ResumeWalkthrough() {
  const left = useBankStore((s) => s.leftTour);
  const touring = useBankStore((s) => s.spotlight !== null);
  const resume = useBankStore((s) => s.resumeSpotlight);
  const dismiss = useBankStore((s) => s.dismissResume);
  if (!left || touring) return null;
  const lesson = LESSONS[left.process];
  return (
    <div className="absolute bottom-3 left-3 z-40 flex items-center overflow-hidden rounded-full border border-slate-700 bg-slate-900/95 shadow-xl" data-testid="walk-resume-box">
      <button
        type="button"
        onClick={resume}
        title={`Back to Chapter ${lesson.chapter}, step ${left.step + 1}`}
        data-testid="walk-resume"
        className="flex items-center gap-2 py-1.5 pl-3 pr-2.5 text-[12px] font-semibold text-slate-950 transition hover:brightness-110"
        style={{ background: lesson.accent }}
      >
        <span aria-hidden="true">🎓</span> Resume Walkthrough
        <span className="font-medium text-slate-900/70">Ch {lesson.chapter} · Step {left.step + 1}</span>
      </button>
      <button type="button" onClick={dismiss} aria-label="Dismiss" title="Dismiss" data-testid="walk-resume-dismiss" className="px-2.5 py-1.5 text-[13px] text-slate-400 transition hover:text-white">
        ×
      </button>
    </div>
  );
}
