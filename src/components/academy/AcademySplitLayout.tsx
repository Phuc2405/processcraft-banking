import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ACADEMY_TRACKS, chapterById, chapterStatus, chapterStatusBadge, LESSON_COUNT, levelById, localChapter, localTrack, type AcademyChapter, type ChapterStatus } from '../../sim/academyCatalog';
import { tr, useLocale } from '../../i18n/locale';
import { downloadCheatSheet } from '../../sim/cheatSheet';
import { academyStore, CATALOG_SPLIT, clampPanelWidth, PANEL_WIDTH, useAcademyStore } from '../../store/academyStore';
import { bindAcademySync } from '../../store/academySync';
import { bankStore } from '../../store/bankStore';
import { useResizableSplitter } from '../../hooks/useResizableSplitter';
import { useMessages } from '../../utils/i18nHelper';
import { academySplitMessages } from './academySplit.messages';
import { FlashcardsView, QuizView } from './AcademyStudy';
import { LessonView, ViewLevelToggle } from './LessonView';

/** The Academy split view. */

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

// Toggle

/** The button that opens and closes the split view (the top bar of the Living Bank). */
export function AcademySplitToggle() {
  const open = useAcademyStore((s) => s.isSplitScreenOpen);
  const toggle = useAcademyStore((s) => s.toggleSplitScreen);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={open}
      title={open ? tr({ en: 'Close the lesson panel', vi: 'Đóng bảng bài học' }) : tr({ en: 'Open the Academy split view: lessons on the left, the bank on the right', vi: 'Mở chế độ chia đôi Học viện: bài học bên trái, ngân hàng bên phải' })}
      data-testid="academy-split-toggle"
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold ring-1 transition-colors duration-200 ${open ? 'bg-lime-400 text-slate-950 ring-lime-300' : 'bg-slate-900 text-slate-100 ring-slate-700 hover:bg-slate-800'}`}
    >
      <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="1" y="1.5" width="14" height="11" rx="2" />
        <path d="M6 1.5v11" />
        <path d={open ? 'M3 5h1.5M3 7h1.5M3 9h1.5' : 'M3 5h1.5M3 7h1.5'} strokeLinecap="round" />
      </svg>
      {tr({ en: 'Lessons', vi: 'Bài học' })}
    </button>
  );
}

// Catalog

function ChapterCard({ chapter, open, onOpen }: { chapter: AcademyChapter; open: boolean; onOpen: () => void }) {
  const completed = useAcademyStore((s) => s.completedLessons);
  const started = useAcademyStore((s) => s.startedLessons);
  const activeLevel = useAcademyStore((s) => s.activeLevelId);
  const setLevel = useAcademyStore((s) => s.setLevel);
  const status = chapterStatus(chapter, completed, started);
  // Opening a chapter that sits partly below the fold brings it into view.
  const card = useRef<HTMLElement>(null);
  // ...and the chosen level inside it (search jumps land here).
  const levelHere = open && chapter.levels.some((l) => l.id === activeLevel) ? activeLevel : null;
  useEffect(() => {
    if (!open) return;
    const row = levelHere ? card.current?.querySelector<HTMLElement>(`[data-testid="level-${levelHere}"]`) : null;
    (row ?? card.current)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [open, levelHere]);
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
              {chapterStatusBadge(status)}
            </span>
            <span className="font-mono font-normal text-slate-500">
              {done}/{chapter.levels.length}
            </span>
          </span>
        </span>
      </button>
      {open && (
        <ol className="space-y-0.5 px-2 pb-2" aria-label={tr({ en: `Chapter ${chapter.id} levels`, vi: `Các bài của chương ${chapter.id}` })}>
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

// Panel

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
      aria-label={tr({ en: 'Resize the lesson panel', vi: 'Đổi kích thước bảng bài học' })}
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

/** The course roadmap above, the step details below, and a divider between them that drags up and down (or moves with the arrow keys). */
function RoadmapLessonSplit({ lesson }: { lesson: ReactNode }) {
  const m = useMessages(academySplitMessages);
  const ratio = useAcademyStore((s) => s.catalogRatio);
  const setRatio = useAcademyStore((s) => s.setCatalogRatio);
  const { containerRef, handleProps, dragging } = useResizableSplitter<HTMLDivElement>({ ratio, onChange: setRatio, bounds: CATALOG_SPLIT, axis: 'y' });
  return (
    <div ref={containerRef} className={`flex min-h-0 flex-1 flex-col ${dragging ? 'cursor-row-resize select-none' : ''}`} data-testid="academy-roadmap-split" data-ratio={ratio}>
      <div className="flex min-h-0 flex-col" style={{ flex: `0 0 ${ratio * 100}%` }}>
        <Catalog className="min-h-0 flex-1" />
      </div>
      <div
        {...handleProps}
        aria-label={m('divider')}
        title={m('dividerHint')}
        data-testid="academy-roadmap-resize"
        data-dragging={dragging || undefined}
        className="group relative z-10 -my-1 flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center focus-visible:outline-none"
      >
        <span aria-hidden="true" className={`absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition-colors ${dragging ? 'bg-lime-300' : 'bg-slate-800 group-hover:bg-lime-300/60 group-focus-visible:bg-lime-300'}`} />
        <span aria-hidden="true" className={`relative h-1.5 w-10 rounded-full ring-1 transition-colors ${dragging ? 'bg-lime-300 ring-lime-200' : 'bg-slate-700 ring-slate-600 group-hover:bg-lime-300/80 group-focus-visible:bg-lime-300'}`} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-950" data-testid="academy-lesson-pane">
        {lesson}
      </div>
    </div>
  );
}

/** [⛶ Focus Mode] / [↙ Split View]. */
function FocusToggle() {
  const maximized = useAcademyStore((s) => s.isMaximized);
  const toggle = useAcademyStore((s) => s.toggleMaximized);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={maximized}
      title={maximized ? tr({ en: 'Back to the split view: lessons beside the bank (Esc)', vi: 'Quay lại chế độ chia đôi: bài học cạnh ngân hàng (Esc)' }) : tr({ en: 'Focus Mode: the lessons fill the screen and the map steps back', vi: 'Chế độ tập trung: bài học chiếm toàn màn hình, bản đồ lùi lại' })}
      data-testid="academy-focus-toggle"
      className={`rounded-md px-2 py-0.5 text-[11.5px] font-bold ring-1 transition-colors ${maximized ? 'bg-slate-100 text-slate-950 ring-slate-100 hover:bg-white' : 'bg-lime-400 text-slate-950 ring-lime-300 hover:bg-lime-300'}`}
    >
      {maximized ? tr({ en: '[↙ Split View]', vi: '[↙ Chia đôi]' }) : tr({ en: '[⛶ Focus Mode]', vi: '[⛶ Tập trung]' })}
    </button>
  );
}

function Catalog({ className }: { className: string }) {
  const activeChapter = useAcademyStore((s) => s.activeChapterId);
  const setChapter = useAcademyStore((s) => s.setChapter);
  const locale = useLocale();
  return (
    <div className={`space-y-2 overflow-y-auto p-3 ${className}`} data-testid="academy-catalog">
      {ACADEMY_TRACKS.map((raw) => localTrack(raw, locale)).map((t) => (
        <div key={t.id} className="space-y-2" data-testid={`track-${t.id}`}>
          <div className="pt-1">
            <div className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: t.accent }}>
              {tr({ en: 'Track', vi: 'Lộ trình' })} {t.id} · {t.title}
            </div>
            <p className="text-[11.5px] leading-snug text-slate-500">{t.blurb}</p>
          </div>
          {t.chapters.map((id) => (
            <ChapterCard key={id} chapter={localChapter(chapterById(id), locale)} open={activeChapter === id} onOpen={() => setChapter(id)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function AcademyPanel() {
  const open = useAcademyStore((s) => s.isSplitScreenOpen);
  const maximized = useAcademyStore((s) => s.isMaximized && s.isSplitScreenOpen);
  const setMaximized = useAcademyStore((s) => s.setMaximized);
  const width = useAcademyStore((s) => s.panelWidth);
  const setWidth = useAcademyStore((s) => s.setPanelWidth);
  const toggle = useAcademyStore((s) => s.toggleSplitScreen);
  const levelId = useAcademyStore((s) => s.activeLevelId);
  const doneCount = useAcademyStore((s) => Object.keys(s.completedLessons).length);
  const [resizing, setResizing] = useState(false);
  const tab = useAcademyStore((s) => s.studyTab);
  const setTab = useAcademyStore((s) => s.setStudyTab);
  const aside = useRef<HTMLElement>(null);
  const level = levelById(levelId);

  // A closed panel is out of the tab order and hidden from screen readers while it slides shut.
  useEffect(() => {
    const el = aside.current as (HTMLElement & { inert: boolean }) | null;
    if (el) el.inert = !open;
  }, [open]);

  // Esc leaves Focus Mode.
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented) setMaximized(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized, setMaximized]);

  const drag = useCallback(
    (clientX: number) => {
      setResizing(true);
      const left = aside.current?.getBoundingClientRect().left ?? 0;
      setWidth(clampPanelWidth(clientX - left));
    },
    [setWidth],
  );

  const lesson = level ? (
    <LessonView key={`${level.id}-${maximized}`} level={level} roomy={maximized} />
  ) : (
    <p className={`text-[12px] leading-relaxed text-slate-400 ${maximized ? 'mx-auto max-w-3xl px-6 py-10 text-center text-[14px]' : 'px-3 py-3'}`} data-testid="lesson-empty">
      {tr({ en: 'Pick a level to light its step on the map.', vi: 'Chọn một bài để làm sáng bước tương ứng trên bản đồ.' })}
    </p>
  );

  return (
    <aside
      ref={aside}
      aria-label={tr({ en: 'Academy lessons', vi: 'Bài học Học viện' })}
      aria-hidden={!open}
      aria-modal={maximized || undefined}
      role={maximized ? 'dialog' : undefined}
      data-testid="academy-panel"
      data-open={open}
      data-maximized={maximized}
      onPointerUp={() => setResizing(false)}
      className={
        maximized
          ? 'fixed inset-0 z-40 flex justify-center bg-slate-950/80 backdrop-blur-md motion-safe:animate-[academy-focus-in_200ms_ease-out]'
          : `relative shrink-0 overflow-hidden border-slate-800 bg-slate-950 motion-reduce:transition-none ${resizing ? '' : 'transition-[width,border-width] duration-300 ease-out'} ${open ? 'border-r' : 'border-r-0'}`
      }
      style={maximized ? undefined : { width: open ? width : 0 }}
    >
      {/* The content keeps its own width while the frame opens and closes, so it slides in without rewrapping. */}
      <div className={`flex h-full flex-col overflow-hidden ${maximized ? 'w-full border-x border-slate-800 bg-slate-950 shadow-2xl xl:w-[85%]' : ''}`} style={maximized ? undefined : { width }}>
        <header className={`shrink-0 border-b border-slate-800 py-2.5 ${maximized ? 'px-5' : 'px-3'}`}>
          <div className="flex items-center gap-2">
            <h2 className={`flex-1 font-bold text-slate-50 ${maximized ? 'text-[16px]' : 'text-[13.5px]'}`}>
              <span aria-hidden="true">🎓 </span>
              {tr({ en: 'Academy', vi: 'Học viện' })}
            </h2>
            <span className="font-mono text-[11px] text-slate-400" data-testid="academy-progress-text">
              {doneCount}/{LESSON_COUNT} {tr({ en: 'lessons', vi: 'bài' })}
            </span>
            <button type="button" onClick={toggle} aria-label={tr({ en: 'Close the lesson panel', vi: 'Đóng bảng bài học' })} title={tr({ en: 'Close', vi: 'Đóng' })} data-testid="academy-close" className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white">
              ×
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <FocusToggle />
            <ViewLevelToggle />
            <button
              type="button"
              onClick={() => downloadCheatSheet()}
              data-testid="academy-export-cheatsheet"
              title={tr({ en: 'Download all 22 lessons, the ISO response codes and the GL accounts as one Markdown file', vi: 'Tải về toàn bộ 22 bài học, mã phản hồi ISO và tài khoản sổ cái trong một tệp Markdown' })}
              className="rounded-md bg-slate-800 px-2 py-0.5 text-[11.5px] font-bold text-slate-100 ring-1 ring-slate-600 transition-colors hover:bg-slate-700"
            >
              {tr({ en: '[📥 Export Fintech Cheat Sheet]', vi: '[📥 Xuất sổ tay Fintech]' })}
            </button>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={LESSON_COUNT} aria-valuenow={doneCount} aria-label={tr({ en: 'Lessons completed', vi: 'Bài đã hoàn thành' })}>
            <div className="h-full rounded-full bg-lime-300 transition-[width] duration-300" style={{ width: `${(doneCount / LESSON_COUNT) * 100}%` }} />
          </div>
          <div className={`mt-2 flex gap-1 ${maximized ? 'max-w-md' : ''}`} role="tablist" aria-label={tr({ en: 'Academy sections', vi: 'Các mục Học viện' })}>
            {(['lessons', 'cards', 'quiz'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                data-testid={`academy-tab-${t}`}
                className={`flex-1 rounded-md px-2 py-1 text-[12px] font-semibold ring-1 transition-colors ${tab === t ? 'bg-slate-100 text-slate-950 ring-slate-100' : 'text-slate-300 ring-slate-700 hover:bg-slate-800'}`}
              >
                {t === 'lessons' ? tr({ en: 'Lessons', vi: 'Bài học' }) : t === 'cards' ? tr({ en: 'Flashcards', vi: 'Thẻ ghi nhớ' }) : tr({ en: 'Quiz', vi: 'Câu hỏi' })}
              </button>
            ))}
          </div>
        </header>
        {tab === 'lessons' ? (
          maximized ? (
            <div className="flex min-h-0 flex-1">
              <Catalog className="hidden w-72 shrink-0 border-r border-slate-800 md:block" />
              <div className="min-h-0 flex-1 overflow-y-auto" data-testid="academy-reader">
                {lesson}
              </div>
            </div>
          ) : (
            <RoadmapLessonSplit lesson={lesson} />
          )
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-3" data-testid={`academy-${tab}`}>
            <div className={maximized ? 'mx-auto max-w-2xl py-4' : ''}>{tab === 'cards' ? <FlashcardsView /> : <QuizView />}</div>
          </div>
        )}
      </div>
      {open && !maximized && <ResizeHandle onDrag={drag} onKey={(d) => setWidth(width + d)} />}
    </aside>
  );
}

// Layout

/** Lays the lesson panel beside the Living Bank's map (`children`). */
export function AcademySplitLayout({ children }: { children: ReactNode }) {
  useEffect(() => bindAcademySync(academyStore, bankStore), []);
  const maximized = useAcademyStore((s) => s.isMaximized && s.isSplitScreenOpen);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stage.current as (HTMLDivElement & { inert: boolean }) | null;
    if (el) el.inert = maximized;
  }, [maximized]);
  return (
    <div className="flex min-h-0 min-w-0 flex-1" data-testid="academy-split">
      <AcademyPanel />
      <div ref={stage} aria-hidden={maximized || undefined} data-testid="academy-stage" className={`flex min-h-0 min-w-0 flex-1 transition-[filter] duration-300 ${maximized ? 'pointer-events-none blur-sm' : ''}`}>
        {children}
      </div>
    </div>
  );
}
