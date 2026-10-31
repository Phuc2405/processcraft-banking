import { useEffect, useMemo, useState } from 'react';
import { tr, useLocale } from '../../i18n/locale';
import { ACADEMY_CHAPTERS, chapterById, localChapter, type AcademyLevel, type ChapterId } from '../../sim/academyCatalog';
import { glossaryFor, GLOSSARY, gradeQuiz, isOpsQuestion, localGlossary, localQuestion, quizFor, type GlossaryEntry } from '../../sim/academyKnowledge';
import { retailOpsStore } from '../../store/retailOpsStore';
import { useMessages } from '../../utils/i18nHelper';
import { retailOpsMessages } from '../bank/retailOps.messages';
import { ChapterArticles } from './ChapterArticles';
import { sampleForLevel } from '../../sim/academySamples';
import { formatAud } from '../../engine/money';
import { GL_PLAIN, rcLabel } from '../../sim/plainLanguage';
import type { FlowId } from '../../types/viewport';
import { academyStore, useAcademyStore } from '../../store/academyStore';
import { simulateFlow } from '../../store/academySync';
import { bankStore, useBankStore } from '../../store/bankStore';
import { postingKindLabel } from '../../data/ledgerCopy';
import type { PostingKind } from '../../types/processLearning';

/** The Academy's study views: flashcards and glossary, the chapter quizzes, the message and ledger inspector, and the "[▶ Simulate this Flow]" button that hands a lesson over to the live map. */

// Simulate

/** Closes the lesson panel and plays the flow on the map. Disabled where no guided flow covers the desk. */
export function SimulateButton({ flow, testId = 'simulate-flow' }: { flow: FlowId | null; testId?: string }) {
  return (
    <button
      type="button"
      disabled={flow === null}
      onClick={() => flow !== null && simulateFlow(academyStore, bankStore, flow)}
      title={flow === null ? tr({ en: 'No guided flow covers this desk yet', vi: 'Chưa có luồng hướng dẫn cho quầy này' }) : tr({ en: 'Close the lessons and watch this flow run on the map', vi: 'Đóng bài học và xem luồng này chạy trên bản đồ' })}
      data-testid={testId}
      data-flow={flow ?? undefined}
      className="rounded-lg bg-sky-500 px-3 py-1.5 text-[12px] font-bold text-sky-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {tr({ en: '[▶ Simulate this Flow]', vi: '[▶ Mô phỏng luồng này]' })}
    </button>
  );
}

// Chapter chips

function ChapterChips({ value, onChange, withAll, extra }: { value: ChapterId | 'all'; onChange: (v: ChapterId | 'all') => void; withAll?: boolean; extra?: (c: ChapterId) => string }) {
  const locale = useLocale();
  const chip = (active: boolean) => `rounded-md px-2 py-1 text-[11.5px] font-semibold ring-1 transition-colors ${active ? 'bg-slate-100 text-slate-950 ring-slate-100' : 'text-slate-300 ring-slate-700 hover:bg-slate-800'}`;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr({ en: 'Chapter', vi: 'Chương' })}>
      {withAll && (
        <button type="button" className={chip(value === 'all')} aria-pressed={value === 'all'} onClick={() => onChange('all')} data-testid="chip-all">
          {tr({ en: 'All', vi: 'Tất cả' })}
        </button>
      )}
      {ACADEMY_CHAPTERS.map((c) => (
        <button key={c.id} type="button" className={chip(value === c.id)} aria-pressed={value === c.id} onClick={() => onChange(c.id)} title={localChapter(c, locale).title} data-testid={`chip-${c.id}`}>
          {c.id}
          {extra ? <span className="ml-1 font-mono font-normal opacity-70">{extra(c.id)}</span> : null}
        </button>
      ))}
    </div>
  );
}

// Flashcards and glossary

function Flashcard({ entry, flipped, onFlip }: { entry: GlossaryEntry; flipped: boolean; onFlip: () => void }) {
  const chapter = chapterById(entry.chapter);
  return (
    <button
      type="button"
      onClick={onFlip}
      aria-label={flipped ? tr({ en: `${entry.term}: definition. Press to see the term again.`, vi: `${entry.term}: định nghĩa. Nhấn để xem lại thuật ngữ.` }) : tr({ en: `${entry.term}. Press to see the definition.`, vi: `${entry.term}. Nhấn để xem định nghĩa.` })}
      data-testid="flashcard"
      data-flipped={flipped}
      className="flex min-h-[9.5rem] w-full flex-col justify-between rounded-xl border bg-slate-900 p-4 text-left transition hover:bg-slate-800/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      style={{ borderColor: `${chapter.accent}88` }}
    >
      <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: chapter.accent }}>
        {tr({ en: `Chapter ${chapter.id} · ${flipped ? 'Definition' : 'Term'}`, vi: `Chương ${chapter.id} · ${flipped ? 'Định nghĩa' : 'Thuật ngữ'}` })}
      </span>
      {flipped ? (
        <span className="mt-2 text-[12.5px] leading-relaxed text-slate-200" data-testid="flashcard-back">
          {entry.definition}
        </span>
      ) : (
        <span className="mt-2 text-[16px] font-bold leading-snug text-slate-50" data-testid="flashcard-front">
          {entry.term}
        </span>
      )}
      <span className="mt-3 text-[11px] text-slate-500">{flipped ? tr({ en: 'Click to flip back', vi: 'Nhấn để lật lại' }) : tr({ en: 'Click to flip', vi: 'Nhấn để lật' })}</span>
    </button>
  );
}

/** The flashcards, one at a time or as a glossary list. */
export function FlashcardsView() {
  const locale = useLocale();
  const chapter = useAcademyStore((s) => s.cardsChapter);
  const setChapter = useAcademyStore((s) => s.setCardsChapter);
  const [mode, setMode] = useState<'cards' | 'list'>('cards');
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const entries = useMemo(() => (chapter === 'all' ? GLOSSARY : glossaryFor(chapter)).map((g) => localGlossary(g, locale)), [chapter, locale]);
  const entry = entries[Math.min(index, entries.length - 1)];
  const go = (delta: number): void => {
    setIndex((i) => (i + delta + entries.length) % entries.length);
    setFlipped(false);
  };
  return (
    <div className="space-y-3" data-testid="flashcards-view" data-chapter={chapter}>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ChapterChips
            value={chapter}
            withAll
            onChange={(v) => {
              setChapter(v);
              setIndex(0);
              setFlipped(false);
            }}
          />
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-md ring-1 ring-slate-700" role="group" aria-label={tr({ en: 'View', vi: 'Kiểu xem' })}>
          {(['cards', 'list'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} data-testid={`mode-${m}`} className={`px-2 py-1 text-[11.5px] font-semibold capitalize ${mode === m ? 'bg-slate-100 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>
              {m === 'cards' ? tr({ en: 'Cards', vi: 'Thẻ' }) : tr({ en: 'Glossary', vi: 'Thuật ngữ' })}
            </button>
          ))}
        </div>
      </div>

      {mode === 'cards' && entry ? (
        <>
          <Flashcard entry={entry} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => go(-1)} data-testid="flashcard-prev" className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800">
              {tr({ en: 'Back', vi: 'Trước' })}
            </button>
            <span className="flex-1 text-center font-mono text-[11px] text-slate-400" data-testid="flashcard-count">
              {Math.min(index, entries.length - 1) + 1} / {entries.length}
            </span>
            <button type="button" onClick={() => go(1)} data-testid="flashcard-next" className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800">
              {tr({ en: 'Next', vi: 'Tiếp' })}
            </button>
          </div>
          <SimulateButton flow={chapterById(entry.chapter).flow} testId="flashcard-simulate" />
        </>
      ) : (
        <ul className="space-y-1.5" data-testid="glossary-list">
          {entries.map((g) => (
            <li key={g.id}>
              <details className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                <summary className="cursor-pointer text-[12.5px] font-semibold text-slate-100">
                  {g.term} <span className="font-mono text-[10.5px] font-normal text-slate-500">{tr({ en: `ch ${g.chapter}`, vi: `ch. ${g.chapter}` })}</span>
                </summary>
                <p className="mt-1.5 text-[12px] leading-relaxed text-slate-300">{g.definition}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Quiz

export function QuizView() {
  const locale = useLocale();
  const rm = useMessages(retailOpsMessages);
  const focused = useAcademyStore((s) => s.activeChapterId);
  const [chapter, setChapter] = useState<ChapterId>(focused);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState(false);
  const [earned, setEarned] = useState(0);
  const scores = useAcademyStore((s) => s.quizScores);
  const record = useAcademyStore((s) => s.recordQuiz);
  const questions = useMemo(() => quizFor(chapter).map((q) => localQuestion(q, locale)), [chapter, locale]);
  const result = checked ? gradeQuiz(chapter, answers) : null;
  const complete = questions.every((q) => answers[q.id] !== undefined);
  const reset = (c: ChapterId): void => {
    setChapter(c);
    setAnswers({});
    setChecked(false);
    setEarned(0);
  };
  // Ctrl+K can open a question's chapter while the quiz is already showing.
  useEffect(() => {
    if (focused !== chapter) reset(focused);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);
  return (
    <div className="space-y-3" data-testid="quiz-view">
      <ChapterChips
        value={chapter}
        onChange={(v) => v !== 'all' && reset(v)}
        extra={(c) => {
          const sc = scores[String(c)];
          return sc ? `${sc.best}/${sc.total}` : '';
        }}
      />
      <ChapterArticles chapter={chapter} />
      <h3 className="text-[13px] font-bold text-slate-50">{tr({ en: `Chapter ${chapter} quiz · ${localChapter(chapterById(chapter), locale).title}`, vi: `Câu hỏi chương ${chapter} · ${localChapter(chapterById(chapter), locale).title}` })}</h3>
      <ol className="space-y-3">
        {questions.map((q, qi) => {
          const missed = result?.missed.includes(q.id);
          return (
            <li key={q.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3" data-testid={`quiz-q-${q.id}`} data-state={result ? (missed ? 'wrong' : 'right') : undefined}>
              <p className="text-[12.5px] font-semibold leading-snug text-slate-100">
                {qi + 1}. {q.prompt}
              </p>
              <div className="mt-2 space-y-1" role="radiogroup" aria-label={q.prompt}>
                {q.options.map((o, oi) => {
                  const picked = answers[q.id] === oi;
                  const right = checked && q.answer === oi;
                  return (
                    <label key={oi} className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[12px] text-slate-300 ${picked ? 'bg-slate-800' : 'hover:bg-slate-800/60'} ${right ? 'ring-1 ring-lime-300' : ''}`}>
                      <input type="radio" name={q.id} checked={picked} disabled={checked} onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))} data-testid={`quiz-${q.id}-${oi}`} className="mt-0.5" />
                      <span>{o}</span>
                    </label>
                  );
                })}
              </div>
              {result && (
                <p className={`mt-2 text-[11.5px] leading-snug ${missed ? 'text-rose-300' : 'text-lime-300'}`}>
                  {missed ? tr({ en: 'Not quite. ', vi: 'Chưa đúng. ' }) : tr({ en: 'Correct. ', vi: 'Chính xác. ' })}
                  <span className="text-slate-300">{q.explanation}</span>
                  {missed && answers[q.id] !== undefined && q.optionNotes?.[answers[q.id]!] && <span className="mt-0.5 block text-slate-400" data-testid="quiz-option-note">{q.optionNotes[answers[q.id]!]}</span>}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {result ? (
        <div className="space-y-2">
          <p className="text-[13px] font-bold text-slate-50" role="status" data-testid="quiz-score">
            {tr({ en: 'Score', vi: 'Điểm' })}: {result.score}/{result.total}
            {earned > 0 && <span className="ml-2 text-amber-200" data-testid="quiz-xp">{rm('quizXpEarned', { xp: earned })}</span>}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => reset(chapter)} data-testid="quiz-retry" className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800">
              {tr({ en: 'Try again', vi: 'Làm lại' })}
            </button>
            <SimulateButton flow={chapterById(chapter).flow} testId="quiz-simulate" />
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!complete}
          onClick={() => {
            const graded = gradeQuiz(chapter, answers);
            record(chapter, graded.score);
            // Each retail operations question pays its XP once, the first time it is right.
            const xp = questions.filter((q) => isOpsQuestion(q.id) && !graded.missed.includes(q.id)).reduce((sum, q) => sum + retailOpsStore.getState().answerQuiz(q.id, true), 0);
            bankStore.getState().awardCareerXp(xp);
            setEarned(xp);
            setChecked(true);
          }}
          data-testid="quiz-check"
          className="w-full rounded-lg bg-lime-400 px-3 py-1.5 text-[12px] font-bold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {complete ? tr({ en: 'Check answers', vi: 'Kiểm tra đáp án' }) : tr({ en: 'Answer every question to check', vi: 'Trả lời mọi câu hỏi để kiểm tra' })}
        </button>
      )}
    </div>
  );
}

// Message & ledger inspector

/** The raw ISO 8583 message and the double-entry GL postings of a real example payment for the lesson in focus. */
export function MessageInspector({ level }: { level: Pick<AcademyLevel, 'flow'> }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'iso' | 'gl'>('iso');
  const beginner = useBankStore((s) => s.termMode === 'beginner');
  const locale = useLocale();
  // The example is played only when the learner opens the inspector.
  const sample = useMemo(() => (open ? sampleForLevel(level) : null), [open, level]);
  if (level.flow === null) return null;
  return (
    <details className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60" onToggle={(e) => setOpen(e.currentTarget.open)} data-testid="inspector">
      <summary className="cursor-pointer px-2.5 py-1.5 text-[12px] font-semibold text-slate-200">{tr({ en: 'Inspect the message and the ledger', vi: 'Xem thông điệp và sổ cái' })}</summary>
      {sample && (
        <div className="space-y-2 px-2.5 pb-2.5">
          <p className="text-[11px] text-slate-400">
            {tr({ en: 'Example', vi: 'Ví dụ' })}: {sample.label} · {beginner ? tr({ en: 'answer', vi: 'phản hồi' }) : tr({ en: 'response code', vi: 'mã phản hồi' })}{' '}
            <span className={beginner ? 'text-slate-200' : 'font-mono text-slate-200'} data-testid="inspector-rc">
              {beginner ? rcLabel(sample.responseCode, 'beginner') : sample.responseCode}
            </span>
          </p>
          <div className="flex gap-1.5" role="tablist" aria-label={tr({ en: 'Inspector', vi: 'Bộ xem' })}>
            {(['iso', 'gl'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`inspector-tab-${t}`} className={`rounded-md px-2 py-1 text-[11.5px] font-semibold ring-1 ${tab === t ? 'bg-slate-100 text-slate-950 ring-slate-100' : 'text-slate-300 ring-slate-700 hover:bg-slate-800'}`}>
                {t === 'iso' ? tr({ en: 'ISO 8583 message', vi: 'Bản tin ISO 8583' }) : tr({ en: 'GL journal', vi: 'Nhật ký sổ cái' })}
              </button>
            ))}
          </div>
          {tab === 'iso' ? (
            <pre className="max-h-48 overflow-auto rounded-md bg-slate-950 p-2 font-mono text-[10.5px] leading-snug text-slate-300" data-testid="inspector-iso">
              {JSON.stringify(sample.message, null, 2)}
            </pre>
          ) : (
            <ul className="space-y-1" data-testid="inspector-gl">
              {sample.journal.length === 0 ? <li className="text-[11.5px] text-slate-400">{tr({ en: 'This payment posted nothing to the ledger.', vi: 'Giao dịch này không ghi gì vào sổ cái.' })}</li> : null}
              {sample.journal.map((l, i) => (
                <li key={i} className="rounded-md bg-slate-950 px-2 py-1.5 font-mono text-[10.5px] leading-snug text-slate-300">
                  {beginner ? (
                    <>
                      <span className="font-bold text-emerald-300">{tr({ en: 'Debit', vi: 'Nợ' })}</span> {GL_PLAIN[l.debit.code] ?? l.debit.name} {formatAud(l.amountCents)} · <span className="font-bold text-sky-300">{tr({ en: 'Credit', vi: 'Có' })}</span> {GL_PLAIN[l.credit.code] ?? l.credit.name}
                    </>
                  ) : locale === 'vi' ? (
                    <>
                      <span className="font-bold text-emerald-300">Nợ</span> {l.debit.code}-{GL_PLAIN[l.debit.code] ?? l.debit.name} {formatAud(l.amountCents)} · <span className="font-bold text-sky-300">Có</span> {l.credit.code}-{GL_PLAIN[l.credit.code] ?? l.credit.name}
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-emerald-300">DR</span> {sample.journalText[i]?.replace(/^DR: /, '').replace(' | CR: ', '  ·  CR ')}
                    </>
                  )}
                  <span className="mt-0.5 block uppercase tracking-wide text-slate-500">{locale === 'vi' ? postingKindLabel(l.kind as PostingKind) : l.kind.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </details>
  );
}
