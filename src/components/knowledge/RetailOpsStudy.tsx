import { useState } from 'react';
import { OPS_FLASHCARDS, type OpsFlashcard } from '../../data/retailOpsKnowledge';
import type { TopicModule } from '../../data/retailTopicModules';
import { pick, useLocale, type Locale } from '../../i18n/locale';
import { coreCodeOf, OPS_ACCOUNTS, opsSubProcess } from '../../sim/retailOps';
import { GL_CODE, type LedgerLine } from '../../sim/staffRoleplay';
import { formatMoney } from '../../sim/kpis';
import { message, useMessages } from '../../utils/i18nHelper';
import { analystWorkspaceMessages, type AnalystWorkspaceKey } from '../bank/analystWorkspace.messages';
import { retailOpsMessages } from '../bank/retailOps.messages';
import { OpsLines } from '../bank/RetailOpsDock';

/** The rich parts of a retail article (message flow, step cards, journals, red flags, regulations), the account crosswalk, and the flashcard tab. */

const kbId = (anchor: string): string => `kb-${anchor}`;
const th = 'border-b border-slate-700 px-2 py-1 text-left text-[12.5px] font-semibold uppercase tracking-wider text-slate-400';
const td = 'border-b border-slate-800 px-2 py-1 align-top';
const lit = (on: boolean): string => (on ? 'rounded-lg ring-2 ring-amber-300/80' : '');

/** A queue scenario's journal on the core ledger. */
export function CoreJournal({ title, lines, locale }: { title: string; lines: readonly LedgerLine[]; locale: Locale }) {
  const m = useMessages(retailOpsMessages);
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2" data-testid="kb-core-journal">
      <div className="mb-1 text-[13px] font-semibold text-slate-100">{title}</div>
      <ul className="space-y-0.5 font-mono text-[11.5px] tabular-nums">
        {lines.map((l, i) => {
          const debit = l.dr > 0;
          return (
            <li key={i} className={`flex min-w-0 items-baseline gap-2 ${debit ? '' : 'pl-4'}`} data-side={debit ? 'dr' : 'cr'} data-code={GL_CODE[l.gl]}>
              <span className={`shrink-0 font-bold ${debit ? 'text-sky-300' : 'text-amber-300'}`}>{debit ? m('dr') : m('cr')}</span>
              <span className="shrink-0 text-slate-400">{GL_CODE[l.gl]}</span>
              <span className="min-w-0 flex-1 truncate font-sans text-slate-200">{message(analystWorkspaceMessages, `gl_${l.gl}` as AnalystWorkspaceKey, undefined, locale)}</span>
              <span className="shrink-0 text-slate-100">{formatMoney(debit ? l.dr : l.cr)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One part of a retail article. */
export function TopicModuleView({ module: mod, highlight }: { module: TopicModule; highlight: string | null }) {
  const m = useMessages(retailOpsMessages);
  const locale = useLocale();
  return (
    <div id={kbId(mod.id)} data-section={mod.id} data-module={mod.id} className={`mt-3 scroll-mt-2 ${lit(highlight === mod.id)}`}>
      {mod.heading && <h4 className="text-[15.5px] font-bold text-emerald-200">{pick(mod.heading, locale)}</h4>}
      {mod.summary && <p className="mt-1 text-[14.5px] text-slate-300">{pick(mod.summary, locale)}</p>}

      <div className="mt-3 overflow-x-auto">
        <div className="text-[12.5px] font-bold uppercase tracking-wider text-sky-300">{m('messageFlow')}</div>
        <table className="mt-1 w-full min-w-[520px] border-collapse text-[14px]" data-testid="kb-message-flow">
          <thead>
            <tr>
              <th className={th}>{m('hop')}</th>
              <th className={th}>{m('message')}</th>
              <th className={th}>{m('whatItSays')}</th>
            </tr>
          </thead>
          <tbody>
            {mod.iso.map((i, n) => (
              <tr key={n}>
                <td className={`${td} whitespace-nowrap text-slate-300`}>{i.hop}</td>
                <td className={`${td} whitespace-nowrap font-mono text-emerald-200`}>{i.message}</td>
                <td className={`${td} text-slate-300`}>{pick(i.meaning, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3" data-testid="kb-step-cards">
        <div className="text-[12.5px] font-bold uppercase tracking-wider text-sky-300">{m('stepByStepSop')}</div>
        <ol className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
          {mod.sop.map((s, n) => (
            <li key={n} className="flex gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-[14px] text-slate-200">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-500/25 text-[11.5px] font-bold text-violet-100">{n + 1}</span>
              {pick(s, locale)}
            </li>
          ))}
        </ol>
      </div>

      {mod.diagrams.length > 0 && (
        <figure className="mt-3" data-testid="kb-journals">
          <figcaption className="text-[12.5px] font-bold uppercase tracking-wider text-emerald-300">{m('drCrJournals')}</figcaption>
          <div className="mt-1.5 grid gap-2 md:grid-cols-2">
            {mod.diagrams.map((d, n) => (
              <div key={n} className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2">
                <div className="mb-1 text-[13px] font-semibold text-slate-100">{pick(d.title, locale)}</div>
                <OpsLines lines={d.lines} />
              </div>
            ))}
          </div>
        </figure>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-rose-400/30 bg-rose-950/20 px-2.5 py-2" data-testid="kb-red-flags">
          <div className="text-[12.5px] font-bold uppercase tracking-wider text-rose-300">🚩 {m('redFlags')}</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[14px] text-slate-200">
            {mod.redFlags.map((r, n) => (
              <li key={n}>{pick(r, locale)}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-violet-400/30 bg-violet-950/20 px-2.5 py-2" data-testid="kb-regulations-retail">
          <div className="text-[12.5px] font-bold uppercase tracking-wider text-violet-300">⚖️ {m('rulesSbvAustralia')}</div>
          <ul className="mt-1 space-y-1 text-[14px] text-slate-200">
            {mod.rules.map((r, n) => (
              <li key={n}>
                <span className="font-semibold text-violet-100">{pick(r.source, locale)}:</span> {pick(r.rule, locale)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** The retail book's accounts against the core ledger's, at the end of the retail tab. */
export function OpsCrosswalk({ highlight = null }: { highlight?: string | null }) {
  const m = useMessages(retailOpsMessages);
  const locale = useLocale();
  return (
    <section className="mt-8 border-t border-slate-700 pt-5" data-testid="ops-crosswalk">
      <h3 className="text-[17px] font-bold text-slate-50">{m('thisBookSAccountsAnd')}</h3>
      <p className="mt-1 text-[14px] text-slate-300">{m('theRetailOpsBookHas')}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-[14px]">
          <thead>
            <tr>
              <th className={`${th} w-20`}>{m('code')}</th>
              <th className={th}>{m('account')}</th>
              <th className={th}>{m('whatItIs')}</th>
              <th className={`${th} w-24`}>{m('coreLedger')}</th>
            </tr>
          </thead>
          <tbody>
            {OPS_ACCOUNTS.map((a) => (
              <tr key={a.id} id={kbId(`retail-ops-gl-${a.id}`)} data-account={a.id} className={highlight === `retail-ops-gl-${a.id}` ? 'bg-amber-400/15 outline outline-2 outline-amber-300/80' : ''}>
                <td className={`${td} font-mono font-bold text-slate-100`}>{a.code}</td>
                <td className={td}>{pick(a.name, locale)}</td>
                <td className={`${td} text-slate-400`}>{pick(a.plain, locale)}</td>
                <td className={`${td} font-mono text-amber-200`}>{coreCodeOf(a.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Flashcard({ card, lit: on }: { card: OpsFlashcard; lit: boolean }) {
  const m = useMessages(retailOpsMessages);
  const locale = useLocale();
  const [flipped, setFlipped] = useState(false);
  const sub = opsSubProcess(card.sub);
  return (
    <button type="button" id={kbId(`flash-${card.id}`)} onClick={() => setFlipped((f) => !f)} aria-pressed={flipped} data-flipped={flipped} data-card={card.id} className={`kb-flip block h-full w-full min-w-0 scroll-mt-2 text-left ${lit(on)}`}>
      <span className="kb-flip-inner h-full">
        <span className={`kb-flip-face flex min-h-[13rem] min-w-0 flex-col rounded-xl border border-slate-700 bg-slate-950/70 p-3 ${flipped ? 'invisible' : ''}`} data-face="front">
          <span className="break-words text-[11.5px] font-bold uppercase tracking-wider text-sky-300">{pick(sub.title, locale)}</span>
          <span className="mt-2 line-clamp-6 flex-1 break-words text-[15px] font-semibold leading-snug text-slate-50" title={pick(card.front, locale)}>
            {pick(card.front, locale)}
          </span>
          <span className="mt-2 text-[11.5px] text-slate-500">{m('clickToFlip')}</span>
        </span>
        <span className={`kb-flip-face kb-flip-back flex min-h-[13rem] min-w-0 flex-col rounded-xl border border-emerald-400/40 bg-emerald-950/30 p-3 ${flipped ? '' : 'invisible'}`} data-face="back">
          {card.lines.length > 0 ? <OpsLines lines={card.lines} /> : <span className="text-[12px] font-semibold text-slate-400">{m('noJournalPosts')}</span>}
          <span className="mt-2 line-clamp-5 flex-1 break-words text-[13.5px] leading-snug text-slate-100" title={pick(card.rule, locale)}>
            {pick(card.rule, locale)}
          </span>
          <span className="mt-2 break-words font-mono text-[11.5px] text-violet-200">{pick(card.reference, locale)}</span>
        </span>
      </span>
    </button>
  );
}

export function OpsFlashcards({ highlight = null }: { highlight?: string | null }) {
  const m = useMessages(retailOpsMessages);
  return (
    <article data-testid="ops-flashcards" className="min-w-0 text-[15px] leading-relaxed text-slate-200">
      <h3 className="text-[20px] font-extrabold text-slate-50">{m('retailOperationsFlashcards')}</h3>
      <p className="mt-1 text-slate-300">{m('aRealSituationOnThe')}</p>
      <div className="mt-3 grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="ops-flashcard-grid">
        {OPS_FLASHCARDS.map((c) => (
          <Flashcard key={c.id} card={c} lit={highlight === `flash-${c.id}`} />
        ))}
      </div>
    </article>
  );
}
