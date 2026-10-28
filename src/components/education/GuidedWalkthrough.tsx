import { forwardRef, useEffect, useRef, type ReactNode } from 'react';
import { modelCopy, modelForStation } from '../../data/mentalModels';
import { sceneOf, walkUi } from '../../data/walkthroughCopy';
import { factLabel, factValue } from '../../i18n/factsVi';
import { tr } from '../../i18n/locale';
import { lessonOf, processShort } from '../../sim/learningVi';
import { isStation } from '../../sim/topology';
import { quizzesOf } from '../../sim/walkQuiz';
import type { StepTone } from '../../sim/walkthrough';
import { bankStore, dataDepthOf, useBankStore } from '../../store/bankStore';
import { useWalkthroughDock } from '../../hooks/useWalkthroughDock';
import { useMessages } from '../../utils/i18nHelper';
import { useSpotlightFocus, type Focus } from '../bank/useSpotlight';
import { useTerms } from '../bank/useTerms';
import { DepthToggle } from '../shell/SegmentedToggle';
import { ScenarioPicker } from './ScenarioPicker';
import { walkMessages } from './walkthrough.messages';

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
/** The tour bar's terminology switch, over the same store setting as the Living Bank header. */
function WalkDepth() {
  const depth = useBankStore(dataDepthOf);
  const setDepth = useBankStore((s) => s.setDataDepth);
  return <DepthToggle value={depth} onChange={setDepth} testId="walk-depth" />;
}

// Kickoff
// ─────────────────────────────────────────────────────────────────────────────

export function Kickoff({ focus }: { focus: Focus }) {
  const ui = walkUi();
  const terms = useTerms();
  const begin = useBankStore((s) => s.beginSpotlight);
  const setExample = useBankStore((s) => s.setSpotlightExample);
  const exit = useBankStore((s) => s.exitSpotlight);
  const lesson = lessonOf(focus.tour.process);
  const scene = sceneOf(focus.tour.process);
  const example = lesson.examples.find((e) => e.id === focus.tour.exampleId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && !e.defaultPrevented) begin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [begin]);

  return (
    // A workspace-size card, drawn flat: no transform or scale anywhere on it or its parents (the map mounts it outside its
    // panned, zoomed stage), so the words render on whole pixels, crisp.
    <div className="absolute inset-0 z-40 grid place-items-center overflow-y-auto p-6 antialiased" data-testid="walk-kickoff">
      <div className="absolute inset-0 bg-[#050810]/85" onClick={exit} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={`${ui.tour}: ${lesson.title}`} className="relative w-full max-w-3xl select-text rounded-2xl border bg-[#0b1120] p-8 shadow-2xl" style={{ borderColor: focus.accent, boxShadow: `0 0 0 1px ${focus.accent}55, 0 0 48px ${focus.accent}33` }}>
        <span className="inline-flex items-center gap-2 rounded-full border border-lime-500/30 bg-lime-950/60 px-3 py-1 text-xs font-bold uppercase tracking-widest text-lime-400" data-testid="walk-chapter-tag">
          {ui.tour} · {ui.chapter} {lesson.chapter}
        </span>
        <h2 className="mt-3 text-[26px] font-bold leading-tight tracking-tight text-white">{terms.t(scene.chapter)}</h2>
        <p className="mt-3 text-base leading-relaxed text-slate-200">{terms.t(scene.scene)}</p>

        {example && (
          <div className="mt-5 rounded-xl border border-slate-700/80 bg-slate-900/90 p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-300">{ui.thisRun}</span>
              <ScenarioPicker lessonId={lesson.id} examples={lesson.examples} value={focus.tour.exampleId} onChange={setExample} accent={focus.accent} placement="down" testId="walk-example" />
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-200">{terms.t(example.story)}</p>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              {focus.plan.walk.carries.map((f) => (
                <div key={f.label} className="text-[13.5px]">
                  <dt className="inline text-slate-400">{factLabel(f.label)}: </dt>
                  <dd className="inline font-semibold tabular-nums text-slate-50">{factValue(f.value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-900/90 p-5">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-300">{ui.lookFor}</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-slate-200">
            {scene.lookFor.map((l) => (
              <li key={l}>{terms.t(l)}</li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="max-w-[380px] text-[13px] leading-snug text-slate-400">{ui.startHint}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={exit} className="whitespace-nowrap rounded-lg px-4 py-2.5 text-[14px] font-medium text-slate-200 ring-1 ring-slate-700 transition hover:bg-slate-800">
              {ui.exit}
            </button>
            <button type="button" onClick={begin} data-testid="walk-start" className="whitespace-nowrap rounded-lg px-5 py-2.5 text-[14px] font-bold text-slate-950 transition hover:brightness-110" style={{ background: focus.accent }}>
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

export const StepCard = forwardRef<HTMLDivElement, { focus: Focus; style?: React.CSSProperties; side?: string; docked?: boolean }>(function StepCard({ focus, style, side, docked = false }, ref) {
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
      className={docked ? 'relative w-full rounded-xl border bg-[#0b1120] p-3' : 'bk-callout absolute z-40 w-[400px] max-w-[calc(100%-16px)] overflow-y-auto rounded-xl border bg-[#0b1120]/95 p-3 shadow-2xl'}
      style={docked ? { ...style, borderColor: `${focus.accent}88` } : { ...style, maxHeight: 'calc(100% - 16px)', borderColor: focus.accent, boxShadow: `0 0 0 1px ${focus.accent}44, 0 10px 40px #000a, 0 0 32px ${focus.accent}33` }}
      data-testid="walk-callout"
      data-step={focus.index}
      data-node={step.nodeId}
      data-side={docked ? 'dock' : side}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-slate-950" style={{ background: focus.accent }} data-testid="walk-step-count">
          {ui.stepOf(focus.index + 1, focus.plan.steps.length)}
        </span>
        <span className={`truncate rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${TONE[step.tone]}`}>{terms.place(place)}</span>
        <button
          type="button"
          onClick={() => bankStore.getState().setWalkCollapsed(true)}
          aria-label={tr({ en: 'Minimise the step card', vi: 'Thu nhỏ thẻ bước' })}
          title={tr({ en: 'Minimise: fold this panel into a small badge so the whole map can be seen', vi: 'Thu nhỏ: gập bảng này thành một huy hiệu nhỏ để thấy toàn bộ bản đồ' })}
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
                <dt className="inline text-slate-400">{factLabel(f.label)}: </dt>
                <dd className="inline font-medium text-slate-100">{factValue(f.value)}</dd>
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
  const { jumpTo: go } = useWalkthroughDock();
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
  const lesson = lessonOf(tour.process);
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
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{ui.chapter} {lesson.chapter} · {tr({ en: 'Walkthrough', vi: 'Hướng dẫn từng bước' })}</div>
            <div className="truncate text-[12.5px] font-semibold text-slate-100" title={lesson.title}>
              {terms.t(processShort(tour.process))}
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
          {/* The same Standard / Expert switch as the header and the workspace: the tour's words follow it. */}
          <WalkDepth />
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
        <span className="flex items-center gap-1 whitespace-nowrap" title={tr({ en: 'The clock is stopped and the speed is locked while the tour runs.', vi: 'Đồng hồ dừng và tốc độ bị khóa trong khi chạy hướng dẫn.' })} data-testid="walk-lock">
          <span aria-hidden="true">🔒</span> {ui.speedLocked}
        </span>
        <span className="whitespace-nowrap tabular-nums" data-testid="walk-score">
          {quizzes.length === 0 ? ui.noQuestions : ui.score(rightCount, quizzes.length)}
          {quizzes.length > 0 && answered.length < quizzes.length ? tr({ en: ` (${answered.length}/${quizzes.length} answered)`, vi: ` (đã trả lời ${answered.length}/${quizzes.length})` }) : ''}
        </span>
        <div className="ml-auto">
          <ScenarioPicker lessonId={lesson.id} examples={lesson.examples} value={tour.exampleId} onChange={setExample} accent={focus.accent} placement="up" testId="walk-example-bar" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The step card folded away, and the way back into a tour that was left
// ─────────────────────────────────────────────────────────────────────────────

/**
 * [📘 Chapter 5: Step 1/4]: the chapter chip at the map's bottom-left, on screen for the whole tour. It glows when the step
 * changes (new content to read) and clicking it opens or folds the step-details column. State lives in useWalkthroughDock.
 */
export function WalkChip() {
  const m = useMessages(walkMessages);
  const dock = useWalkthroughDock();
  if (!dock.active || !dock.focus) return null;
  const { focus, collapsed, pulsing } = dock;
  return (
    <button
      type="button"
      onClick={dock.toggle}
      aria-expanded={!collapsed}
      aria-label={`${m('chip', { chapter: dock.chapter, step: dock.step, total: dock.total })}. ${collapsed ? m('chipShow') : m('chipHide')}`}
      title={collapsed ? m('chipShow') : m('chipHide')}
      data-testid="walk-badge"
      data-collapsed={collapsed}
      data-pulsing={pulsing || undefined}
      className={`bk-walk-chip absolute bottom-3 left-3 z-40 flex items-center gap-2 rounded-full border-2 bg-slate-950/90 py-1.5 pl-2 pr-3 text-[12.5px] font-bold text-slate-50 backdrop-blur transition hover:-translate-y-px hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${pulsing ? 'bk-walk-chip--pulse' : ''}`}
      style={{ borderColor: focus.accent, ['--chip-accent' as string]: focus.accent, boxShadow: `0 0 0 1px ${focus.accent}55, 0 0 20px ${focus.accent}55` }}
    >
      <span className="grid h-6 w-6 place-items-center rounded-full text-[13px]" style={{ background: `${focus.accent}2e` }} aria-hidden="true">
        📘
      </span>
      <span className="tabular-nums">{m('chip', { chapter: dock.chapter, step: dock.step, total: dock.total })}</span>
      {focus.blocked && <span className="rounded-full bg-amber-400/20 px-1.5 text-[10.5px] font-semibold text-amber-200">{m('questionWaiting')}</span>}
      {pulsing && collapsed && (
        <span className="sr-only" role="status">
          {m('chipNew')}
        </span>
      )}
      <span aria-hidden="true" className="text-slate-400">
        {collapsed ? '▸' : '◂'}
      </span>
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
  const lesson = lessonOf(left.process);
  return (
    <div className="absolute bottom-3 left-3 z-40 flex items-center overflow-hidden rounded-full border border-slate-700 bg-slate-900/95 shadow-xl" data-testid="walk-resume-box">
      <button
        type="button"
        onClick={resume}
        title={tr({ en: `Back to Chapter ${lesson.chapter}, step ${left.step + 1}`, vi: `Quay lại Chương ${lesson.chapter}, bước ${left.step + 1}` })}
        data-testid="walk-resume"
        className="flex items-center gap-2 py-1.5 pl-3 pr-2.5 text-[12px] font-semibold text-slate-950 transition hover:brightness-110"
        style={{ background: lesson.accent }}
      >
        <span aria-hidden="true">🎓</span> {tr({ en: 'Resume Walkthrough', vi: 'Tiếp tục hướng dẫn' })}
        <span className="font-medium text-slate-900/70">{tr({ en: `Ch ${lesson.chapter} · Step ${left.step + 1}`, vi: `Ch. ${lesson.chapter} · Bước ${left.step + 1}` })}</span>
      </button>
      <button type="button" onClick={dismiss} aria-label={tr({ en: 'Dismiss', vi: 'Bỏ qua' })} title={tr({ en: 'Dismiss', vi: 'Bỏ qua' })} data-testid="walk-resume-dismiss" className="px-2.5 py-1.5 text-[13px] text-slate-400 transition hover:text-white">
        ×
      </button>
    </div>
  );
}
