import { useState, type ReactNode } from 'react';
import { localChallenge } from '../../i18n/challengeVi';
import { tr } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { useWorkflowStore } from '../../store/workflowStore';
import { LabTourLauncher } from '../education/LabWalkthrough';
import type { Difficulty } from '../../types/processLearning';

const DIFFICULTY_NAME: Record<Difficulty, { en: string; vi: string }> = {
  BEGINNER: { en: 'beginner', vi: 'cơ bản' },
  INTERMEDIATE: { en: 'intermediate', vi: 'trung cấp' },
  ADVANCED: { en: 'advanced', vi: 'nâng cao' },
};
const pickDifficulty = (d: Difficulty): string => tr(DIFFICULTY_NAME[d]);

const DIFFICULTY: Record<Difficulty, string> = {
  BEGINNER: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30',
  INTERMEDIATE: 'bg-amber-400/10 text-amber-300 ring-amber-400/30',
  ADVANCED: 'bg-rose-400/10 text-rose-300 ring-rose-400/30',
};

/** Text that may wrap after an underscore (a reason code, an outcome name) but never in the middle of a word. */
function breakable(text: string): ReactNode {
  const words = text.split(/(?<=_)/);
  if (words.length === 1) return text;
  return words.map((w, k) => (
    <span key={k}>
      {w}
      {k < words.length - 1 && <wbr />}
    </span>
  ));
}

/** Just enough Markdown for the level text: **bold**, `code`, and "1. " lists. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-slate-100">{breakable(part.slice(2, -2))}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="rounded bg-slate-800 px-1 font-mono text-[10.5px] text-sky-200">{breakable(part.slice(1, -1))}</code>;
    return part;
  });
}

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

function Table({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows;
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-auto border-collapse text-left text-[11.5px]">
        <thead>
          <tr>
            {head?.map((h, i) => (
              <th key={i} className="border-b border-slate-700 px-1.5 py-1 font-semibold text-slate-200">
                {inline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td key={j} className="border-b border-slate-800 px-1.5 py-1">
                  {inline(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Brief({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let items: string[] = [];
  let table: string[][] = [];
  const flush = (): void => {
    if (table.length) {
      blocks.push(<Table key={`t-${blocks.length}`} rows={table} />);
      table = [];
    }
    if (items.length) {
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="list-decimal space-y-1 pl-5">
          {items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ol>,
      );
      items = [];
    }
  };
  for (const line of text.split('\n')) {
    const item = /^\d+\.\s+(.*)$/.exec(line);
    if (/^\s*\|.*\|\s*$/.test(line)) {
      // A Markdown table row. The line of dashes under the header is dropped.
      if (items.length) flush();
      if (!/^\s*\|[\s:|-]+\|\s*$/.test(line)) table.push(cells(line));
    } else if (item?.[1] !== undefined) {
      if (table.length) flush();
      items.push(item[1]);
    } else {
      flush();
      if (line.trim() && !/^\*\*(Rules|Quy tắc)\*\*$/.test(line.trim())) blocks.push(<p key={`p-${blocks.length}`}>{inline(line)}</p>);
      else if (line.trim()) blocks.push(<h4 key={`h-${blocks.length}`} className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t('Rules')}</h4>);
    }
  }
  flush();
  return <div className="space-y-2 text-[12px] leading-relaxed text-slate-300">{blocks}</div>;
}

/** The level's story, goals and (on request) hints. */
export function ChallengeBrief() {
  const level = localChallenge(useWorkflowStore((s) => s.level));
  const [hintsShown, setHintsShown] = useState<{ levelId: string; count: number }>({ levelId: level.id, count: 0 });
  const shown = hintsShown.levelId === level.id ? hintsShown.count : 0;
  const hints = level.hints ?? [];

  return (
    <section aria-label={t('Challenge brief')} className="space-y-3">
      <header>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${DIFFICULTY[level.difficulty]}`}>{pickDifficulty(level.difficulty)}</span>
          <span className="text-[11px] text-slate-500">
            {tr({ en: `about ${level.estimatedMinutes} min · ${level.testSuite.length} tests`, vi: `khoảng ${level.estimatedMinutes} phút · ${level.testSuite.length} bài kiểm tra` })}
          </span>
        </div>
        <h2 className="mt-1.5 text-[15px] font-semibold leading-snug text-slate-100">
          {tr({ en: `Level ${level.levelNumber}`, vi: `Cấp độ ${level.levelNumber}` })}: {level.title}
        </h2>
      </header>

      <LabTourLauncher />

      <details open className="group">
        <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300">{t('The brief')}</summary>
        <div className="mt-2">
          <Brief text={level.problemDescription} />
        </div>
      </details>

      <details>
        <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300">{t('What you will practise')}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-snug text-slate-300">
          {level.learningObjectives.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      </details>

      {hints.length > 0 && (
        <div>
          {hints.slice(0, shown).map((h, i) => (
            <p key={i} className="mb-1.5 rounded-md border-l-2 border-sky-500/60 bg-sky-950/30 px-2.5 py-1.5 text-[12px] leading-snug text-sky-100">
              <span className="font-semibold">{tr({ en: `Hint ${i + 1}.`, vi: `Gợi ý ${i + 1}.` })}</span> {h}
            </p>
          ))}
          {shown < hints.length && (
            <button
              type="button"
              onClick={() => setHintsShown({ levelId: level.id, count: shown + 1 })}
              className="text-[12px] font-medium text-sky-300 hover:text-sky-200"
            >
              {shown === 0 ? t('Stuck? Show a hint') : t('Show the next hint')} ({shown}/{hints.length})
            </button>
          )}
        </div>
      )}
    </section>
  );
}
