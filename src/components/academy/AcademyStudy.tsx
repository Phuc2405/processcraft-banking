import { useMemo, useState } from 'react';
import { ACADEMY_CHAPTERS, chapterById, type AcademyLevel, type ChapterId } from '../../sim/academyCatalog';
import { glossaryFor, GLOSSARY, gradeQuiz, quizFor, type GlossaryEntry } from '../../sim/academyKnowledge';
import { sampleForLevel } from '../../sim/academySamples';
import { formatAud } from '../../engine/money';
import { GL_PLAIN, rcLabel } from '../../sim/plainLanguage';
import type { FlowId } from '../../types/viewport';
import { academyStore, useAcademyStore } from '../../store/academyStore';
import { simulateFlow } from '../../store/academySync';
import { bankStore, useBankStore } from '../../store/bankStore';

/**
 * The Academy's study views: flashcards and glossary, the chapter quizzes, the message and ledger inspector, and the
 * "[▶ Simulate this Flow]" button that hands a lesson over to the live map.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Simulate
// ─────────────────────────────────────────────────────────────────────────────

/** Closes the lesson panel and plays the flow on the map. Disabled where no guided flow covers the desk. */
export function SimulateButton({ flow, testId = 'simulate-flow' }: { flow: FlowId | null; testId?: string }) {
  return (
    <button
      type="button"
      disabled={flow === null}
      onClick={() => flow !== null && simulateFlow(academyStore, bankStore, flow)}
      title={flow === null ? 'No guided flow covers this desk yet' : 'Close the lessons and watch this flow run on the map'}
      data-testid={testId}
      data-flow={flow ?? undefined}
      className="rounded-lg bg-sky-500 px-3 py-1.5 text-[12px] font-bold text-sky-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
    >
      [▶ Simulate this Flow]
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chapter chips
// ─────────────────────────────────────────────────────────────────────────────

function ChapterChips({ value, onChange, withAll, extra }: { value: ChapterId | 'all'; onChange: (v: ChapterId | 'all') => void; withAll?: boolean; extra?: (c: ChapterId) => string }) {
  const chip = (active: boolean) => `rounded-md px-2 py-1 text-[11.5px] font-semibold ring-1 transition-colors ${active ? 'bg-slate-100 text-slate-950 ring-slate-100' : 'text-slate-300 ring-slate-700 hover:bg-slate-800'}`;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chapter">
      {withAll && (
        <button type="button" className={chip(value === 'all')} aria-pressed={value === 'all'} onClick={() => onChange('all')} data-testid="chip-all">
          All
        </button>
      )}
      {ACADEMY_CHAPTERS.map((c) => (
        <button key={c.id} type="button" className={chip(value === c.id)} aria-pressed={value === c.id} onClick={() => onChange(c.id)} title={c.title} data-testid={`chip-${c.id}`}>
          {c.id}
          {extra ? <span className="ml-1 font-mono font-normal opacity-70">{extra(c.id)}</span> : null}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Flashcards and glossary
// ─────────────────────────────────────────────────────────────────────────────

function Flashcard({ entry, flipped, onFlip }: { entry: GlossaryEntry; flipped: boolean; onFlip: () => void }) {
  const chapter = chapterById(entry.chapter);
  return (
    <button
      type="button"
      onClick={onFlip}
      aria-label={flipped ? `${entry.term}: definition. Press to see the term again.` : `${entry.term}. Press to see the definition.`}
      data-testid="flashcard"
      data-flipped={flipped}
      className="flex min-h-[9.5rem] w-full flex-col justify-between rounded-xl border bg-slate-900 p-4 text-left transition hover:bg-slate-800/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      style={{ borderColor: `${chapter.accent}88` }}
    >
      <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: chapter.accent }}>
        Chapter {chapter.id} · {flipped ? 'Definition' : 'Term'}
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
      <span className="mt-3 text-[11px] text-slate-500">{flipped ? 'Click to flip back' : 'Click to flip'}</span>
    </button>
  );
}

export function FlashcardsView() {
  const [chapter, setChapter] = useState<ChapterId | 'all'>('all');
  const [mode, setMode] = useState<'cards' | 'list'>('cards');
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const entries = useMemo(() => (chapter === 'all' ? GLOSSARY : glossaryFor(chapter)), [chapter]);
  const entry = entries[Math.min(index, entries.length - 1)];
  const go = (delta: number): void => {
    setIndex((i) => (i + delta + entries.length) % entries.length);
    setFlipped(false);
  };
  return (
    <div className="space-y-3" data-testid="flashcards-view">
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
        <div className="flex shrink-0 overflow-hidden rounded-md ring-1 ring-slate-700" role="group" aria-label="View">
          {(['cards', 'list'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} data-testid={`mode-${m}`} className={`px-2 py-1 text-[11.5px] font-semibold capitalize ${mode === m ? 'bg-slate-100 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>
              {m === 'cards' ? 'Cards' : 'Glossary'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'cards' && entry ? (
        <>
          <Flashcard entry={entry} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => go(-1)} data-testid="flashcard-prev" className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800">
              Back
            </button>
            <span className="flex-1 text-center font-mono text-[11px] text-slate-400" data-testid="flashcard-count">
              {Math.min(index, entries.length - 1) + 1} / {entries.length}
            </span>
            <button type="button" onClick={() => go(1)} data-testid="flashcard-next" className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800">
              Next
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
                  {g.term} <span className="font-mono text-[10.5px] font-normal text-slate-500">ch {g.chapter}</span>
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

// ─────────────────────────────────────────────────────────────────────────────
// Quiz
// ─────────────────────────────────────────────────────────────────────────────

export function QuizView() {
  const [chapter, setChapter] = useState<ChapterId>(1);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState(false);
  const scores = useAcademyStore((s) => s.quizScores);
  const record = useAcademyStore((s) => s.recordQuiz);
  const questions = quizFor(chapter);
  const result = checked ? gradeQuiz(chapter, answers) : null;
  const complete = questions.every((q) => answers[q.id] !== undefined);
  const reset = (c: ChapterId): void => {
    setChapter(c);
    setAnswers({});
    setChecked(false);
  };
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
      <h3 className="text-[13px] font-bold text-slate-50">
        Chapter {chapter} quiz · {chapterById(chapter).title}
      </h3>
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
                  {missed ? 'Not quite. ' : 'Correct. '}
                  <span className="text-slate-300">{q.explanation}</span>
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {result ? (
        <div className="space-y-2">
          <p className="text-[13px] font-bold text-slate-50" role="status" data-testid="quiz-score">
            Score: {result.score}/{result.total}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => reset(chapter)} data-testid="quiz-retry" className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800">
              Try again
            </button>
            <SimulateButton flow={chapterById(chapter).flow} testId="quiz-simulate" />
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!complete}
          onClick={() => {
            record(chapter, gradeQuiz(chapter, answers).score);
            setChecked(true);
          }}
          data-testid="quiz-check"
          className="w-full rounded-lg bg-lime-400 px-3 py-1.5 text-[12px] font-bold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {complete ? 'Check answers' : 'Answer every question to check'}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Message & ledger inspector
// ─────────────────────────────────────────────────────────────────────────────

/** The raw ISO 8583 message and the double-entry GL postings of a real example payment for the lesson in focus. */
export function MessageInspector({ level }: { level: Pick<AcademyLevel, 'flow'> }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'iso' | 'gl'>('iso');
  const beginner = useBankStore((s) => s.termMode === 'beginner');
  // The example is played only when the learner opens the inspector.
  const sample = useMemo(() => (open ? sampleForLevel(level) : null), [open, level]);
  if (level.flow === null) return null;
  return (
    <details className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60" onToggle={(e) => setOpen(e.currentTarget.open)} data-testid="inspector">
      <summary className="cursor-pointer px-2.5 py-1.5 text-[12px] font-semibold text-slate-200">Inspect the message and the ledger</summary>
      {sample && (
        <div className="space-y-2 px-2.5 pb-2.5">
          <p className="text-[11px] text-slate-400">
            Example: {sample.label} · {beginner ? 'answer' : 'response code'}{' '}
            <span className={beginner ? 'text-slate-200' : 'font-mono text-slate-200'} data-testid="inspector-rc">
              {beginner ? rcLabel(sample.responseCode, 'beginner') : sample.responseCode}
            </span>
          </p>
          <div className="flex gap-1.5" role="tablist" aria-label="Inspector">
            {(['iso', 'gl'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`inspector-tab-${t}`} className={`rounded-md px-2 py-1 text-[11.5px] font-semibold ring-1 ${tab === t ? 'bg-slate-100 text-slate-950 ring-slate-100' : 'text-slate-300 ring-slate-700 hover:bg-slate-800'}`}>
                {t === 'iso' ? 'ISO 8583 message' : 'GL journal'}
              </button>
            ))}
          </div>
          {tab === 'iso' ? (
            <pre className="max-h-48 overflow-auto rounded-md bg-slate-950 p-2 font-mono text-[10.5px] leading-snug text-slate-300" data-testid="inspector-iso">
              {JSON.stringify(sample.message, null, 2)}
            </pre>
          ) : (
            <ul className="space-y-1" data-testid="inspector-gl">
              {sample.journal.length === 0 ? <li className="text-[11.5px] text-slate-400">This payment posted nothing to the ledger.</li> : null}
              {sample.journal.map((l, i) => (
                <li key={i} className="rounded-md bg-slate-950 px-2 py-1.5 font-mono text-[10.5px] leading-snug text-slate-300">
                  {beginner ? (
                    <>
                      <span className="font-bold text-emerald-300">Debit</span> {GL_PLAIN[l.debit.code] ?? l.debit.name} {formatAud(l.amountCents)} · <span className="font-bold text-sky-300">Credit</span> {GL_PLAIN[l.credit.code] ?? l.credit.name}
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-emerald-300">DR</span> {sample.journalText[i]?.replace(/^DR: /, '').replace(' | CR: ', '  ·  CR ')}
                    </>
                  )}
                  <span className="mt-0.5 block uppercase tracking-wide text-slate-500">{l.kind.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </details>
  );
}
