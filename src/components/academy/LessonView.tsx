import { ChapterArticles } from './ChapterArticles';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { tr, useLocale } from '../../i18n/locale';
import { chapterById, localChapter, localLevel, nextLevel, type AcademyLevel, type EdgeCase } from '../../sim/academyCatalog';
import { extrasFor, type KeyTerm } from '../../sim/lessonExtras';
import { plainText, rcLabel } from '../../sim/plainLanguage';
import type { TermMode } from '../../sim/terms';
import { useAcademyStore } from '../../store/academyStore';
import { dataDepthOf, useBankStore } from '../../store/bankStore';
import { DepthToggle } from '../shell/SegmentedToggle';
import { termsFor } from '../bank/useTerms';
import { MessageInspector, SimulateButton } from './AcademyStudy';

/** One lesson, in four sections: 📌 the real-world scenario, 🔄 the step-by-step flow (with [▶ Simulate this Flow] right under it), 🧠 why it matters and ⚠️ edge cases, the last two as accordions. */

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

function Accordion({ icon, title, roomy, testId, children, initiallyOpen }: { icon: string; title: string; roomy: boolean; testId: string; children: ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen ?? roomy);
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
        <span className="h-fit shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-400/30">{tr({ en: 'Ops', vi: 'Vận hành' })}</span>
      )}
      <span className={`min-w-0 leading-relaxed text-slate-300 ${roomy ? 'text-[13.5px]' : 'text-[12px]'}`}>
        <span className="font-semibold text-slate-100">{plainText(item.title, mode)}. </span>
        {plainText(item.detail, mode)}
      </span>
    </li>
  );
}

/** A key term that flips between the term and its meaning, in place. */
function MiniCard({ term: raw, accent, roomy, mode }: { term: KeyTerm; accent: string; roomy: boolean; mode: TermMode }) {
  const [flipped, setFlipped] = useState(false);
  const term: KeyTerm = { term: plainText(raw.term, mode), definition: plainText(raw.definition, mode) };
  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      aria-pressed={flipped}
      aria-label={flipped ? tr({ en: `${term.term}: meaning. Press to see the term.`, vi: `${term.term}: nghĩa. Nhấn để xem thuật ngữ.` }) : tr({ en: `${term.term}. Press to see the meaning.`, vi: `${term.term}. Nhấn để xem nghĩa.` })}
      data-testid="key-term-card"
      data-flipped={flipped}
      className={`group relative flex w-full flex-col justify-between rounded-xl border p-3 text-left transition [perspective:800px] hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${roomy ? 'min-h-[7.5rem]' : 'min-h-[6rem]'}`}
      style={{ borderColor: flipped ? accent : `${accent}55`, background: flipped ? `${accent}14` : 'rgba(2,6,23,0.6)' }}
    >
      <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: accent }}>
        {flipped ? tr({ en: 'Meaning', vi: 'Nghĩa' }) : tr({ en: 'Term', vi: 'Thuật ngữ' })}
      </span>
      {flipped ? (
        <span className={`mt-1.5 leading-snug text-slate-200 ${roomy ? 'text-[13px]' : 'text-[11.5px]'}`} data-testid="key-term-back">
          {term.definition}
        </span>
      ) : (
        <span className={`mt-1.5 font-bold leading-snug text-slate-50 ${roomy ? 'text-[15px]' : 'text-[13px]'}`} data-testid="key-term-front">
          {term.term}
        </span>
      )}
      <span className="mt-2 text-[10px] text-slate-500">{flipped ? tr({ en: '↺ flip back', vi: '↺ lật lại' }) : tr({ en: '↻ click to flip', vi: '↻ nhấn để lật' })}</span>
    </button>
  );
}

/** `viewLevel` pins the Beginner / Expert View (previews, tests); by default it follows the global switch. */
export function LessonView({ level: raw, roomy = false, viewLevel }: { level: AcademyLevel; roomy?: boolean; viewLevel?: TermMode }) {
  const locale = useLocale();
  const level = useMemo(() => localLevel(raw, locale), [raw, locale]);
  const chapter = useMemo(() => localChapter(chapterById(level.chapter), locale), [level.chapter, locale]);
  const done = useAcademyStore((s) => Boolean(s.completedLessons[level.id]));
  const complete = useAcademyStore((s) => s.completeLesson);
  const setLevel = useAcademyStore((s) => s.setLevel);
  const openFlashcards = useAcademyStore((s) => s.openFlashcards);
  const globalMode = useBankStore((s) => s.termMode);
  const mode = viewLevel ?? globalMode;
  const terms = useMemo(() => termsFor(mode), [mode]);
  const extras = useMemo(() => extrasFor(level.id), [level.id, locale]);
  const index = chapter.levels.findIndex((l) => l.id === level.id);
  const prev = chapter.levels[index - 1];
  const next = nextLevel(level.id);
  const body = roomy ? 'text-[14.5px] leading-7' : 'text-[12.5px] leading-relaxed';
  const t = (text: string): string => terms.t(plainText(text, mode));

  return (
    <article className={`space-y-3 ${roomy ? 'mx-auto w-full max-w-3xl px-2 py-6 sm:px-6' : 'p-3'}`} aria-label={tr({ en: 'Lesson', vi: 'Bài học' })} data-testid="lesson-card" data-level={level.id}>
      <header>
        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: chapter.accent }}>
          <span>{tr({ en: `Chapter ${chapter.id} · Step ${index + 1} of ${chapter.levels.length}`, vi: `Chương ${chapter.id} · Bước ${index + 1} / ${chapter.levels.length}` })}</span>
          {done && (
            <span className="flex items-center gap-1 text-lime-300">
              <Check /> {tr({ en: 'Done', vi: 'Hoàn thành' })}
            </span>
          )}
        </div>
        <h3 className={`mt-1 font-bold text-slate-50 ${roomy ? 'text-[24px] leading-tight' : 'text-[14px]'}`}>{level.title}</h3>
        <p className={`mt-1 text-slate-400 ${body}`}>{t(level.goal)}</p>
      </header>

      <section className="rounded-xl border p-3" style={{ borderColor: `${chapter.accent}55`, background: `${chapter.accent}0d` }} data-testid="lesson-scenario">
        <SectionTitle icon="📌" roomy={roomy}>
          {tr({ en: 'Real-World Scenario', vi: 'Tình huống thực tế' })}
        </SectionTitle>
        <p className={`mt-1.5 text-slate-200 ${body}`}>{t(level.realWorldScenario)}</p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3" data-testid="lesson-step-summary">
        <SectionTitle icon="🔄" roomy={roomy}>
          {tr({ en: 'Step-by-Step Operational Flow', vi: 'Quy trình nghiệp vụ từng bước' })}
        </SectionTitle>
        <ol className="mt-2 space-y-2">
          {level.stepByStepFlow.map((s, i) => (
            <li key={i} className="flex gap-2.5" data-testid="lesson-flow-step">
              <span className={`grid shrink-0 place-items-center rounded-full font-black text-slate-950 ${roomy ? 'h-7 w-7 text-[12.5px]' : 'h-5 w-5 text-[10.5px]'}`} style={{ background: chapter.accent }} aria-hidden="true">
                {i + 1}
              </span>
              <span className={`min-w-0 text-slate-300 ${body}`}>
                <span className="mr-1 font-semibold text-slate-100">
                  <span className="sr-only">{tr({ en: `Step ${i + 1}, `, vi: `Bước ${i + 1}, ` })}</span>
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
            {tr({ en: 'On the map:', vi: 'Trên bản đồ:' })} <span className="font-semibold text-slate-200">{terms.place(level.place)}</span>
          </span>
        </div>
      </section>

      <Accordion icon="🧠" title={tr({ en: 'Why It Matters', vi: 'Vì sao quan trọng' })} roomy={roomy} testId="lesson-why">
        <p className={`text-slate-300 ${body}`}>{t(level.whyItMatters)}</p>
      </Accordion>

      <Accordion icon="⚠️" title={tr({ en: 'Edge Cases & Real-World Failures', vi: 'Tình huống biên & lỗi thực tế' })} roomy={roomy} testId="lesson-edge-cases">
        <ul className="space-y-1.5">
          {level.edgeCasesAndErrors.map((e, i) => (
            <EdgeCaseRow key={i} item={e} mode={mode} roomy={roomy} />
          ))}
        </ul>
      </Accordion>

      {extras.keyTerms.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3" data-testid="lesson-key-terms">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1">
              <SectionTitle icon="📇" roomy={roomy}>
                {tr({ en: 'Key Terms & Flashcards', vi: 'Thuật ngữ chính & Thẻ ghi nhớ' })}
              </SectionTitle>
            </span>
            <button
              type="button"
              onClick={() => openFlashcards(level.chapter)}
              data-testid="lesson-practice-flashcards"
              data-chapter={level.chapter}
              title={tr({ en: `Open the Flashcards tab filtered to chapter ${level.chapter}`, vi: `Mở tab Thẻ ghi nhớ đã lọc theo chương ${level.chapter}` })}
              className="rounded-lg px-2.5 py-1 text-[11.5px] font-bold text-slate-950 transition hover:brightness-110"
              style={{ background: chapter.accent }}
            >
              📇 {tr({ en: 'Practice in Flashcards Tab', vi: 'Luyện tập ở tab Thẻ ghi nhớ' })}
            </button>
          </div>
          <div className={`mt-2.5 grid gap-2 ${roomy ? 'sm:grid-cols-3' : 'grid-cols-1 min-[360px]:grid-cols-2'}`}>
            {extras.keyTerms.map((k) => (
              <MiniCard key={`${locale}-${k.term}`} term={k} accent={chapter.accent} roomy={roomy} mode={mode} />
            ))}
          </div>
        </section>
      )}

      {extras.exploreDeeper.length > 0 && (
        <Accordion icon="🔭" title={tr({ en: 'Explore Deeper', vi: 'Tìm hiểu sâu hơn' })} roomy={roomy} testId="lesson-explore-deeper" initiallyOpen>
          <p className="mb-2 text-[11.5px] text-slate-500">{tr({ en: 'Advanced topics for self-study once this lesson makes sense.', vi: 'Chủ đề nâng cao để tự học khi bạn đã nắm bài này.' })}</p>
          <ul className="space-y-1.5">
            {extras.exploreDeeper.map((d) => (
              <li key={d.title} className="flex gap-2.5 rounded-lg bg-slate-950/70 px-2.5 py-2" data-testid="deeper-topic">
                <span className="mt-0.5 text-[13px]" aria-hidden="true">
                  🔹
                </span>
                <span className={`min-w-0 leading-relaxed text-slate-300 ${roomy ? 'text-[13.5px]' : 'text-[12px]'}`}>
                  <span className="font-semibold text-slate-100">{d.title}. </span>
                  {d.blurb}
                </span>
              </li>
            ))}
          </ul>
        </Accordion>
      )}

      <MessageInspector level={level} />

      <div className="flex items-center gap-2 pt-1">
        <button type="button" disabled={!prev} onClick={() => prev && setLevel(prev.id)} data-testid="lesson-prev" className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
          {tr({ en: 'Back', vi: 'Quay lại' })}
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
          {next === null
            ? tr({ en: 'Mark complete', vi: 'Đánh dấu hoàn thành' })
            : next.chapter !== level.chapter
              ? tr({ en: 'Complete chapter & continue', vi: 'Hoàn thành chương & tiếp tục' })
              : tr({ en: 'Mark complete & next', vi: 'Hoàn thành & bài tiếp' })}
        </button>
      </div>
      <div className="mt-3">
        <ChapterArticles chapter={level.chapter} />
      </div>
    </article>
  );
}

/** [💡 Standard | </> Expert]: the shared DepthToggle over the Living Bank's vocabulary (bankStore.termMode). */
export function ViewLevelToggle() {
  const depth = useBankStore(dataDepthOf);
  const setDepth = useBankStore((s) => s.setDataDepth);
  return <DepthToggle value={depth} onChange={setDepth} testId="view-level" />;
}
