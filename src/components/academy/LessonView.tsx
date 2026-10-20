import { useId, useMemo, useState, type ReactNode } from 'react';
import { chapterById, nextLevel, type AcademyLevel, type EdgeCase } from '../../sim/academyCatalog';
import { plainText, rcLabel } from '../../sim/plainLanguage';
import type { TermMode } from '../../sim/terms';
import { useAcademyStore } from '../../store/academyStore';
import { useBankStore } from '../../store/bankStore';
import { termsFor } from '../bank/useTerms';
import { MessageInspector, SimulateButton } from './AcademyStudy';

/**
 * One lesson, in four sections: 📌 the real-world scenario, 🔄 the step-by-step flow (with [▶ Simulate this Flow] right under
 * it), 🧠 why it matters and ⚠️ edge cases, the last two as accordions. `roomy` is Focus Mode: bigger type, sections open.
 * Every code in the text follows the Beginner / Expert View (plainLanguage.ts).
 */

const Check = ({ className = '' }: { className?: string }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="m2.5 6.5 2.3 2.3 4.7-5.3" />
  </svg>
);

function SectionTitle({ icon, children, roomy }: { icon: string; children: ReactNode; roomy: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 font-bold text-slate-100 ${roomy ? 'text-[14px]' : 'text-[12.5px]'}`}>
      <span aria-hidden="true">{icon}</span>
      {children}
    </span>
  );
}

function Accordion({ icon, title, roomy, testId, children }: { icon: string; title: string; roomy: boolean; testId: string; children: ReactNode }) {
  const [open, setOpen] = useState(roomy);
  const body = useId();
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60" data-testid={testId} data-open={open}>
      <button type="button" aria-expanded={open} aria-controls={body} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-slate-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
        <span className="flex-1">
          <SectionTitle icon={icon} roomy={roomy}>
            {title}
          </SectionTitle>
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <path d="m3 4.5 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={body} hidden={!open} className="px-3 pb-3">
        {children}
      </div>
    </section>
  );
}

function EdgeCaseRow({ item, mode, roomy }: { item: EdgeCase; mode: TermMode; roomy: boolean }) {
  return (
    <li className="flex gap-2.5 rounded-lg bg-slate-950/70 px-2.5 py-2" data-testid="edge-case">
      {item.code !== null ? (
        <span className={`h-fit shrink-0 rounded-md bg-rose-500/15 px-1.5 py-0.5 font-semibold text-rose-200 ring-1 ring-rose-400/40 ${mode === 'expert' ? 'font-mono text-[10.5px]' : 'text-[11px]'}`} data-testid="edge-case-code">
          {rcLabel(item.code, mode)}
        </span>
      ) : (
        <span className="h-fit shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-400/30">Ops</span>
      )}
      <span className={`min-w-0 leading-relaxed text-slate-300 ${roomy ? 'text-[13.5px]' : 'text-[12px]'}`}>
        <span className="font-semibold text-slate-100">{plainText(item.title, mode)}. </span>
        {plainText(item.detail, mode)}
      </span>
    </li>
  );
}

/** `viewLevel` pins the Beginner / Expert View (previews, tests); by default it follows the global switch. */
export function LessonView({ level, roomy = false, viewLevel }: { level: AcademyLevel; roomy?: boolean; viewLevel?: TermMode }) {
  const chapter = chapterById(level.chapter);
  const done = useAcademyStore((s) => Boolean(s.completedLessons[level.id]));
  const complete = useAcademyStore((s) => s.completeLesson);
  const setLevel = useAcademyStore((s) => s.setLevel);
  const globalMode = useBankStore((s) => s.termMode);
  const mode = viewLevel ?? globalMode;
  const terms = useMemo(() => termsFor(mode), [mode]);
  const index = chapter.levels.findIndex((l) => l.id === level.id);
  const prev = chapter.levels[index - 1];
  const next = nextLevel(level.id);
  const body = roomy ? 'text-[14.5px] leading-7' : 'text-[12.5px] leading-relaxed';
  const t = (text: string): string => terms.t(plainText(text, mode));

  return (
    <article className={`space-y-3 ${roomy ? 'mx-auto w-full max-w-3xl px-2 py-6 sm:px-6' : 'p-3'}`} aria-label="Lesson" data-testid="lesson-card" data-level={level.id}>
      <header>
        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: chapter.accent }}>
          <span>
            Chapter {chapter.id} · Step {index + 1} of {chapter.levels.length}
          </span>
          {done && (
            <span className="flex items-center gap-1 text-lime-300">
              <Check /> Done
            </span>
          )}
        </div>
        <h3 className={`mt-1 font-bold text-slate-50 ${roomy ? 'text-[24px] leading-tight' : 'text-[14px]'}`}>{level.title}</h3>
        <p className={`mt-1 text-slate-400 ${body}`}>{t(level.goal)}</p>
      </header>

      <section className="rounded-xl border p-3" style={{ borderColor: `${chapter.accent}55`, background: `${chapter.accent}0d` }} data-testid="lesson-scenario">
        <SectionTitle icon="📌" roomy={roomy}>
          Real-World Scenario
        </SectionTitle>
        <p className={`mt-1.5 text-slate-200 ${body}`}>{t(level.realWorldScenario)}</p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3" data-testid="lesson-step-summary">
        <SectionTitle icon="🔄" roomy={roomy}>
          Step-by-Step Operational Flow
        </SectionTitle>
        <ol className="mt-2 space-y-2">
          {level.stepByStepFlow.map((s, i) => (
            <li key={i} className="flex gap-2.5" data-testid="lesson-flow-step">
              <span className={`grid shrink-0 place-items-center rounded-full font-black text-slate-950 ${roomy ? 'h-7 w-7 text-[12.5px]' : 'h-5 w-5 text-[10.5px]'}`} style={{ background: chapter.accent }} aria-hidden="true">
                {i + 1}
              </span>
              <span className={`min-w-0 text-slate-300 ${body}`}>
                <span className="mr-1 font-semibold text-slate-100">
                  <span className="sr-only">Step {i + 1}, </span>
                  {s.actor}:
                </span>
                {t(s.action)}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-800 pt-3">
          <SimulateButton flow={level.flow} testId="lesson-simulate" />
          <span className="flex items-center gap-1.5 text-[11.5px] text-slate-400" data-testid="lesson-focus">
            <span className="h-2 w-2 rounded-full" style={{ background: chapter.accent, boxShadow: `0 0 6px ${chapter.accent}` }} aria-hidden="true" />
            On the map: <span className="font-semibold text-slate-200">{terms.place(level.place)}</span>
          </span>
        </div>
      </section>

      <Accordion icon="🧠" title="Why It Matters" roomy={roomy} testId="lesson-why">
        <p className={`text-slate-300 ${body}`}>{t(level.whyItMatters)}</p>
      </Accordion>

      <Accordion icon="⚠️" title="Edge Cases & Real-World Failures" roomy={roomy} testId="lesson-edge-cases">
        <ul className="space-y-1.5">
          {level.edgeCasesAndErrors.map((e, i) => (
            <EdgeCaseRow key={i} item={e} mode={mode} roomy={roomy} />
          ))}
        </ul>
      </Accordion>

      <MessageInspector level={level} />

      <div className="flex items-center gap-2 pt-1">
        <button type="button" disabled={!prev} onClick={() => prev && setLevel(prev.id)} data-testid="lesson-prev" className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
          Back
        </button>
        <button
          type="button"
          onClick={() => {
            complete(level.id);
            if (next) setLevel(next.id);
          }}
          data-testid="lesson-complete"
          className="flex-1 rounded-lg px-3 py-1.5 text-[12px] font-bold text-slate-950 transition hover:brightness-110"
          style={{ background: chapter.accent }}
        >
          {next === null ? 'Mark complete' : next.chapter !== level.chapter ? 'Complete chapter & continue' : 'Mark complete & next'}
        </button>
      </div>
    </article>
  );
}

/** [🟢 Beginner View | 🔴 Expert View]: the same switch as the Living Bank's vocabulary (bankStore.termMode). */
export function ViewLevelToggle() {
  const mode = useBankStore((s) => s.termMode);
  const setMode = useBankStore((s) => s.setTermMode);
  const options = [
    { id: 'beginner', icon: '🟢', label: 'Beginner View', title: 'Plain English: no GL numbers or response codes' },
    { id: 'expert', icon: '🔴', label: 'Expert View', title: 'GL codes, ISO 8583 response codes and scheme jargon' },
  ] as const;
  return (
    <div className="flex rounded-lg bg-slate-900 p-0.5 ring-1 ring-slate-800" role="group" aria-label="View level">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setMode(o.id)}
          aria-pressed={mode === o.id}
          title={o.title}
          data-testid={`view-level-${o.id}`}
          className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-semibold transition ${mode === o.id ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}
        >
          <span aria-hidden="true" className="text-[9px]">
            {o.icon}
          </span>
          {o.label}
        </button>
      ))}
    </div>
  );
}
