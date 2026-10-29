import { useEffect, useRef } from 'react';
import { tr } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { chapters, difficultyHint, difficultyText, laymanText, stepsText, type Chapter, type Difficulty } from '../../sim/chapters';
import { LESSONS } from '../../sim/learning';
import { lessonOf } from '../../sim/learningVi';
import { spotPlan } from '../../sim/spotlightPlan';
import { useBankStore } from '../../store/bankStore';
import { useTerms } from './useTerms';

/** The Academy: one button in the header and the Course Catalog it opens. */

const DIFFICULTY_STYLE: Record<Difficulty, string> = {
  Beginner: 'bg-emerald-400/10 text-emerald-200 ring-emerald-400/40',
  Intermediate: 'bg-amber-400/10 text-amber-200 ring-amber-400/40',
  Advanced: 'bg-rose-400/10 text-rose-200 ring-rose-400/40',
};

/** `[ 🎓 Academy ]`. The badge is the number of the chapter being toured while there is one, and the chapter count when there is not. */
export function AcademyButton() {
  const open = useBankStore((s) => s.academyOpen);
  const openAcademy = useBankStore((s) => s.openAcademy);
  const closeAcademy = useBankStore((s) => s.closeAcademy);
  const active = useBankStore((s) => s.spotlight?.process ?? null);
  const list = chapters();
  const live = active ? list.find((c) => c.id === active) : undefined;
  return (
    <button
      type="button"
      onClick={() => (open ? closeAcademy() : openAcademy())}
      aria-haspopup="dialog"
      aria-expanded={open}
      title={
        live
          ? tr({ en: `Academy: you are in Chapter ${live.number}. Open the Course Catalog.`, vi: `Học viện: bạn đang ở Chương ${live.number}. Mở danh mục khóa học.` })
          : t('Academy: six guided chapters on how a bank moves money')
      }
      data-testid="academy-button"
      data-active={live ? live.id : undefined}
      className={`flex items-center gap-2 rounded-lg py-1 pl-2.5 pr-1.5 text-[14.5px] font-semibold text-slate-100 ring-1 transition ${open ? 'bg-slate-800 ring-slate-500' : 'bg-slate-900 ring-slate-700 hover:bg-slate-800'}`}
    >
      <span aria-hidden="true">🎓</span>
      <span>{t('Academy')}</span>
      {live ? (
        <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] font-black tabular-nums text-slate-950" style={{ background: live.accent }} data-testid="academy-badge" aria-label={tr({ en: `Chapter ${live.number} in progress`, vi: `Đang học Chương ${live.number}` })}>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-950/70" aria-hidden="true" />
          {tr({ en: `Ch ${live.number}`, vi: `Ch. ${live.number}` })}
        </span>
      ) : (
        <span className="rounded-md bg-slate-700 px-1.5 py-0.5 text-[12.5px] font-bold tabular-nums text-slate-200" data-testid="academy-badge" aria-label={tr({ en: `${list.length} chapters`, vi: `${list.length} chương` })}>
          {list.length}
        </span>
      )}
    </button>
  );
}

function ChapterCard({ chapter, first }: { chapter: Chapter; first: boolean }) {
  const terms = useTerms();
  const startChapter = useBankStore((s) => s.startChapter);
  const openHub = useBankStore((s) => s.openHub);
  const tour = useBankStore((s) => s.spotlight);
  const rules = useBankStore((s) => s.view.rules);
  const here = tour?.process === chapter.id ? tour : null;
  const total = here ? spotPlan(here.process, here.exampleId, rules).steps.length : 0;
  const hasDials = LESSONS[chapter.id].knobs.length > 0;
  return (
    <li className="flex" data-testid={`chapter-card-${chapter.id}`} data-chapter={chapter.number} data-live={here ? 'yes' : 'no'}>
      <article className="flex w-full flex-col rounded-2xl border bg-slate-900/70 p-4 transition hover:bg-slate-900" style={{ borderColor: here ? chapter.accent : '#334155', boxShadow: here ? `0 0 0 1px ${chapter.accent}66, 0 0 28px ${chapter.accent}22` : undefined }}>
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[17px] font-black tabular-nums text-slate-950" style={{ background: chapter.accent }} aria-hidden="true">
            {chapter.number}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="text-[12.5px] font-bold uppercase tracking-wider" style={{ color: chapter.accent }}>
              {tr({ en: `Chapter ${chapter.number}`, vi: `Chương ${chapter.number}` })}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span title={difficultyHint(chapter.difficulty)} data-testid={`chapter-difficulty-${chapter.id}`} className={`rounded-full px-2 py-0.5 text-[12.5px] font-semibold ring-1 ${DIFFICULTY_STYLE[chapter.difficulty]}`}>
                {difficultyText(chapter.difficulty)}
              </span>
              <span className="text-[13px] tabular-nums text-slate-400" data-testid={`chapter-steps-${chapter.id}`} title={t('About how many steps the guided tour takes, depending on the example you pick')}>
                ≈ {stepsText(chapter)}
              </span>
            </div>
          </div>
        </div>

        <h3 className="mt-3 text-[17px] font-bold leading-normal text-slate-50" data-testid={`chapter-title-${chapter.id}`}>
          {terms.t(lessonOf(chapter.id).title)}
        </h3>
        <p className="mt-1.5 flex-1 text-[14.5px] leading-relaxed text-slate-300" data-testid={`chapter-layman-${chapter.id}`}>
          {laymanText(chapter)}
        </p>

        {here && (
          <p className="mt-2 text-[13.5px] font-semibold" style={{ color: chapter.accent }} data-testid={`chapter-live-${chapter.id}`}>
            {t('In progress')} · {here.intro ? t('at the briefing') : tr({ en: `step ${Math.min(here.step + 1, total)} of ${total}`, vi: `bước ${Math.min(here.step + 1, total)}/${total}` })}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            autoFocus={first}
            onClick={() => startChapter(chapter.id)}
            data-testid={`chapter-start-${chapter.id}`}
            className="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-[14.5px] font-bold text-slate-950 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            style={{ background: chapter.accent }}
          >
            {here ? t('Restart Chapter') : t('Start Chapter')} ▶
          </button>
          {hasDials && (
            <button
              type="button"
              onClick={() => openHub(chapter.id)}
              data-testid={`chapter-lab-${chapter.id}`}
              title={t('Change the bank’s rules and see what the same day would have looked like')}
              className="whitespace-nowrap rounded-lg px-2.5 py-2 text-[14px] font-medium text-slate-200 ring-1 ring-slate-700 transition hover:bg-slate-800"
            >
              {t('Rule Lab')}
            </button>
          )}
        </div>
      </article>
    </li>
  );
}

/** The modal. Closes on Esc, on the backdrop, or on the ✕; "Start Chapter" closes it too. */
export function CourseCatalog() {
  const open = useBankStore((s) => s.academyOpen);
  const close = useBankStore((s) => s.closeAcademy);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    return () => {
      if (returnTo.current instanceof HTMLElement) returnTo.current.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;
  const list = chapters();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()} data-testid="academy-backdrop">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="academy-title" className="flex max-h-[min(860px,calc(100vh-32px))] w-[min(1120px,100%)] flex-col overflow-hidden rounded-3xl border border-slate-700 bg-[#070b14] shadow-2xl" data-testid="academy-modal">
        <header className="flex shrink-0 items-start gap-3 border-b border-slate-800 bg-slate-950 px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-bold uppercase tracking-wider text-slate-500">🎓 {t('Academy')}</div>
            <h2 id="academy-title" className="text-[22px] font-bold leading-tight text-slate-50">
              {t('Course Catalog')}
            </h2>
            <p className="mt-1 max-w-[720px] text-[14.5px] leading-relaxed text-slate-400">
              {t('Six chapters, best taken in order. Each one is a guided tour of the bank at a quarter of normal speed: the parts that do not matter fade back, and at every decision the tour asks you what happens next.')}
            </p>
          </div>
          <button type="button" onClick={close} aria-label={t('Close the Course Catalog')} data-testid="academy-close" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          </button>
        </header>
        <ol className="grid min-h-0 flex-1 gap-3.5 overflow-y-auto p-5 sm:grid-cols-2 xl:grid-cols-3" aria-label={t('Chapters')} data-testid="academy-list">
          {list.map((c, i) => (
            <ChapterCard key={c.id} chapter={c} first={i === 0} />
          ))}
        </ol>
      </div>
    </div>
  );
}
