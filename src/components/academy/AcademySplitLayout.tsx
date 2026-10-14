import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import {
  ACADEMY_CHAPTERS,
  CHAPTER_STATUS_BADGE,
  chapterById,
  chapterStatus,
  flowStepOf,
  LESSON_COUNT,
  levelById,
  nextLevel,
  type AcademyChapter,
  type AcademyLevel,
  type ChapterStatus,
} from '../../sim/academyCatalog';
import { academyStore, clampPanelWidth, PANEL_WIDTH, useAcademyStore } from '../../store/academyStore';
import { bindAcademySync } from '../../store/academySync';
import { bankStore, dataDepthOf, useBankStore } from '../../store/bankStore';
import { useTerms } from '../bank/useTerms';

/**
 * The Academy split view. The lesson panel sits on the left (400 px by default, drag its edge to resize) and the Living Bank,
 * 2D or 3D with its viewport controls, keeps the rest. Choosing a lesson step lights and focuses its node on the map: that link
 * is academySync.ts, bound here for as long as the Living Bank is on screen.
 */

const STATUS_STYLE: Record<ChapterStatus, string> = {
  'not-started': 'text-slate-500',
  'in-progress': 'text-amber-300',
  completed: 'text-lime-300',
};

const Check = ({ className = '' }: { className?: string }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="m2.5 6.5 2.3 2.3 4.7-5.3" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Toggle
// ─────────────────────────────────────────────────────────────────────────────

/** The button that opens and closes the split view (the top bar of the Living Bank). */
export function AcademySplitToggle() {
  const open = useAcademyStore((s) => s.isSplitScreenOpen);
  const toggle = useAcademyStore((s) => s.toggleSplitScreen);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={open}
      title={open ? 'Close the lesson panel' : 'Open the Academy split view: lessons on the left, the bank on the right'}
      data-testid="academy-split-toggle"
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold ring-1 transition-colors duration-200 ${open ? 'bg-lime-400 text-slate-950 ring-lime-300' : 'bg-slate-900 text-slate-100 ring-slate-700 hover:bg-slate-800'}`}
    >
      <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="1" y="1.5" width="14" height="11" rx="2" />
        <path d="M6 1.5v11" />
        <path d={open ? 'M3 5h1.5M3 7h1.5M3 9h1.5' : 'M3 5h1.5M3 7h1.5'} strokeLinecap="round" />
      </svg>
      Lessons
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog
// ─────────────────────────────────────────────────────────────────────────────

function ChapterCard({ chapter, open, onOpen }: { chapter: AcademyChapter; open: boolean; onOpen: () => void }) {
  const completed = useAcademyStore((s) => s.completedLessons);
  const started = useAcademyStore((s) => s.startedLessons);
  const activeLevel = useAcademyStore((s) => s.activeLevelId);
  const setLevel = useAcademyStore((s) => s.setLevel);
  const status = chapterStatus(chapter, completed, started);
  // Opening a chapter that sits partly below the fold brings it into view.
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open) card.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [open]);
  const done = chapter.levels.filter((l) => completed[l.id]).length;
  return (
    <section ref={card} className="rounded-xl border bg-slate-900/60 transition-colors" style={{ borderColor: open ? `${chapter.accent}88` : '#1e293b' }} data-testid={`chapter-${chapter.id}`} data-status={status}>
      <button type="button" onClick={onOpen} aria-expanded={open} className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-slate-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" data-testid={`chapter-btn-${chapter.id}`}>
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-[12px] font-black text-slate-950" style={{ background: chapter.accent }} aria-hidden="true">
          {chapter.id}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-tight text-slate-100">{chapter.title}</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-400">{chapter.topic}</span>
          <span className="mt-1 flex items-center gap-2 text-[11px] font-semibold">
            <span className={STATUS_STYLE[status]} data-testid={`chapter-status-${chapter.id}`}>
              {CHAPTER_STATUS_BADGE[status]}
            </span>
            <span className="font-mono font-normal text-slate-500">
              {done}/{chapter.levels.length}
            </span>
          </span>
        </span>
      </button>
      {open && (
        <ol className="space-y-0.5 px-2 pb-2" aria-label={`Chapter ${chapter.id} levels`}>
          {chapter.levels.map((l) => {
            const active = activeLevel === l.id;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setLevel(l.id)}
                  aria-current={active ? 'step' : undefined}
                  data-testid={`level-${l.id}`}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${active ? 'bg-slate-800 text-slate-50' : 'text-slate-300 hover:bg-slate-800/60'}`}
                  style={active ? { boxShadow: `inset 2px 0 0 ${chapter.accent}` } : undefined}
                >
                  <span className="w-7 shrink-0 font-mono text-[11px]" style={{ color: active ? chapter.accent : '#64748b' }}>
                    {l.id}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{l.title}</span>
                  {completed[l.id] && <Check className="shrink-0 text-lime-300" />}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The lesson in focus
// ─────────────────────────────────────────────────────────────────────────────

function LessonCard({ level }: { level: AcademyLevel }) {
  const chapter = chapterById(level.chapter);
  const done = useAcademyStore((s) => Boolean(s.completedLessons[level.id]));
  const complete = useAcademyStore((s) => s.completeLesson);
  const setLevel = useAcademyStore((s) => s.setLevel);
  const depth = useBankStore(dataDepthOf);
  const terms = useTerms();
  const step = flowStepOf(level);
  const index = chapter.levels.findIndex((l) => l.id === level.id);
  const prev = chapter.levels[index - 1];
  const next = nextLevel(level.id);
  const lastOfCourse = next === null;
  return (
    <section className="shrink-0 border-t border-slate-800 bg-slate-950 p-3" aria-label="Lesson" data-testid="lesson-card" data-level={level.id}>
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
      <h3 className="mt-1 text-[14px] font-bold text-slate-50">{level.title}</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-slate-300">{level.goal}</p>
      {step && (
        <p className="mt-2 rounded-lg bg-slate-900 px-2.5 py-2 text-[12px] leading-relaxed text-slate-300" data-testid="lesson-step-summary">
          <span className="font-semibold text-slate-100">{step.name}: </span>
          {step.summary[depth]}
        </p>
      )}
      <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-slate-400" data-testid="lesson-focus">
        <span className="h-2 w-2 rounded-full" style={{ background: chapter.accent, boxShadow: `0 0 6px ${chapter.accent}` }} aria-hidden="true" />
        On the map: <span className="font-semibold text-slate-200">{terms.place(level.place)}</span>
      </p>
      <div className="mt-3 flex items-center gap-2">
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
          {lastOfCourse ? 'Mark complete' : next && next.chapter !== level.chapter ? 'Complete chapter & continue' : 'Mark complete & next'}
        </button>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────────────────────────────────────

function ResizeHandle({ onDrag, onKey }: { onDrag: (clientX: number) => void; onKey: (delta: number) => void }) {
  const width = useAcademyStore((s) => s.panelWidth);
  const dragging = useRef(false);
  const down = (e: PointerEvent<HTMLDivElement>): void => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>): void => {
    if (dragging.current) onDrag(e.clientX);
  };
  const up = (e: PointerEvent<HTMLDivElement>): void => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowLeft') onKey(-16);
    else if (e.key === 'ArrowRight') onKey(16);
    else return;
    e.preventDefault();
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the lesson panel"
      aria-valuemin={PANEL_WIDTH.min}
      aria-valuemax={PANEL_WIDTH.max}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      data-testid="academy-resize"
      className="group absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none focus-visible:outline-none"
    >
      <span className="absolute inset-y-0 right-0 w-0.5 bg-transparent transition-colors group-hover:bg-lime-300/70 group-focus-visible:bg-lime-300 group-active:bg-lime-300" />
    </div>
  );
}

function AcademyPanel() {
  const open = useAcademyStore((s) => s.isSplitScreenOpen);
  const width = useAcademyStore((s) => s.panelWidth);
  const setWidth = useAcademyStore((s) => s.setPanelWidth);
  const toggle = useAcademyStore((s) => s.toggleSplitScreen);
  const activeChapter = useAcademyStore((s) => s.activeChapterId);
  const setChapter = useAcademyStore((s) => s.setChapter);
  const levelId = useAcademyStore((s) => s.activeLevelId);
  const doneCount = useAcademyStore((s) => Object.keys(s.completedLessons).length);
  const [resizing, setResizing] = useState(false);
  const aside = useRef<HTMLElement>(null);
  const level = levelById(levelId);

  // A closed panel is out of the tab order and hidden from screen readers while it slides shut.
  useEffect(() => {
    const el = aside.current as (HTMLElement & { inert: boolean }) | null;
    if (el) el.inert = !open;
  }, [open]);

  const drag = useCallback(
    (clientX: number) => {
      setResizing(true);
      const left = aside.current?.getBoundingClientRect().left ?? 0;
      setWidth(clampPanelWidth(clientX - left));
    },
    [setWidth],
  );

  return (
    <aside
      ref={aside}
      aria-label="Academy lessons"
      aria-hidden={!open}
      data-testid="academy-panel"
      data-open={open}
      onPointerUp={() => setResizing(false)}
      className={`relative shrink-0 overflow-hidden border-slate-800 bg-slate-950 motion-reduce:transition-none ${resizing ? '' : 'transition-[width,border-width] duration-300 ease-out'} ${open ? 'border-r' : 'border-r-0'}`}
      style={{ width: open ? width : 0 }}
    >
      {/* The content keeps its own width while the frame opens and closes, so it slides in without rewrapping. */}
      <div className="flex h-full flex-col overflow-hidden" style={{ width }}>
        <header className="shrink-0 border-b border-slate-800 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-[13.5px] font-bold text-slate-50">
              <span aria-hidden="true">🎓 </span>Academy
            </h2>
            <span className="font-mono text-[11px] text-slate-400" data-testid="academy-progress-text">
              {doneCount}/{LESSON_COUNT} lessons
            </span>
            <button type="button" onClick={toggle} aria-label="Close the lesson panel" title="Close" data-testid="academy-close" className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white">
              ×
            </button>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={LESSON_COUNT} aria-valuenow={doneCount} aria-label="Lessons completed">
            <div className="h-full rounded-full bg-lime-300 transition-[width] duration-300" style={{ width: `${(doneCount / LESSON_COUNT) * 100}%` }} />
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" data-testid="academy-catalog">
          {ACADEMY_CHAPTERS.map((c) => (
            <ChapterCard key={c.id} chapter={c} open={activeChapter === c.id} onOpen={() => setChapter(c.id)} />
          ))}
        </div>
        {level ? (
          <LessonCard key={level.id} level={level} />
        ) : (
          <p className="shrink-0 border-t border-slate-800 px-3 py-3 text-[12px] leading-relaxed text-slate-400" data-testid="lesson-empty">
            Pick a level to light its step on the map.
          </p>
        )}
      </div>
      {open && <ResizeHandle onDrag={drag} onKey={(d) => setWidth(width + d)} />}
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lays the lesson panel beside the Living Bank's map (`children`). It also keeps the panel and the map in step: while it is on
 * screen, the level in focus is lit and focused on the 2D map and in the 3D office.
 */
export function AcademySplitLayout({ children }: { children: ReactNode }) {
  useEffect(() => bindAcademySync(academyStore, bankStore), []);
  return (
    <div className="flex min-h-0 min-w-0 flex-1" data-testid="academy-split">
      <AcademyPanel />
      {children}
    </div>
  );
}
