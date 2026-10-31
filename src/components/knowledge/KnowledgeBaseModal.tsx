import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  accountsOn,
  ACRONYM_GL,
  ACRONYM_GL_WHY,
  BUFFER_MECHANICS,
  CORE_LEDGER_ARTICLE,
  flowAmount,
  flowBalances,
  GL_SIDES,
  GL_TAXONOMY,
  glUsage,
  INTERMEDIATE_ACCOUNTS,
  INTERMEDIATE_ROLE,
  INTERNAL_CONTROLS,
  isIntermediate,
  LEDGER_FORMULAS,
  lineRaises,
  normalSide,
  REGULATORY_RULES,
  statementOf,
  SIDE_RULE,
  SIDE_TITLE,
  type ArticleFlow,
  type BufferJournal,
} from '../../data/knowledgeBase';
import { AML_ARTICLE, type KbTable } from '../../data/amlKnowledge';
import { RETAIL_DEEP_DIVES, type RetailDeepDive } from '../../data/advancedKnowledge';
import { RETAIL_TOPICS, type RetailGuide } from '../../data/retailKnowledge';
import { scenarioJournals, TELLER_DECISION, TELLER_FLOW, TOPIC_MODULES } from '../../data/retailTopicModules';
import { pick, useLocale, type Locale, type Localized } from '../../i18n/locale';
import { fold } from '../../hooks/useSearchIndex';
import { formatMoney } from '../../sim/kpis';
import { GL_ACCOUNTS, GL_CODE, GL_SIDE, type GlAccount, type RetailScenarioId } from '../../sim/staffRoleplay';
import { uiStore, useUiStore, type KnowledgeTab } from '../../store/uiStore';
import { formatNodes, message, useMessages } from '../../utils/i18nHelper';
import { analystWorkspaceMessages, type AnalystWorkspaceKey } from '../bank/analystWorkspace.messages';
import { glossaryTerms, glPlain } from '../bank/codeGlossary';
import { LanguageToggle } from '../shell/LanguageToggle';
import { Modal } from '../shell/Modal';
import { ViewModeToggle, type ViewMode } from '../shell/SegmentedToggle';
import { knowledgeBaseMessages } from './knowledgeBase.messages';
import { AuthorLink } from '../shell/AuthorLink';
import { creditsMessages } from '../shell/credits.messages';
import { CoreJournal, OpsCrosswalk, OpsFlashcards, TopicModuleView } from './RetailOpsStudy';

/** The formal account name the ledger sheet uses ("Nostro accounts (correspondents)"). */
const glName = (gl: GlAccount, locale: Locale): string => message(analystWorkspaceMessages, `gl_${gl}` as AnalystWorkspaceKey, undefined, locale);
const aw = (key: string, locale: Locale): string => message(analystWorkspaceMessages, key as AnalystWorkspaceKey, undefined, locale);

/** A scene id from glUsage() in words: the drill or retail scenario's title, or the crisis queue. */
const sceneTitle = (scene: string, locale: Locale): string => (scene === 'crisis' ? message(knowledgeBaseMessages, 'triggerCrisis', undefined, locale) : aw(`${scene}_title`, locale));

const journalText = (j: BufferJournal): string => [...j.dr.map((gl) => `Dr ${GL_CODE[gl]}`), ...j.cr.map((gl) => `Cr ${GL_CODE[gl]}`)].join(' / ');

/** The element id of an anchor inside the article: a section id, `gl-<ID>` or `term-<KEY>`. */
export const kbAnchorId = (anchor: string): string => `kb-${anchor}`;

const th = 'border-b border-slate-700 px-2 py-1 text-left text-[12.5px] font-semibold uppercase tracking-wider text-slate-400';
const td = 'border-b border-slate-800 px-2 py-1 align-top';

/** The Basic / Advanced switch and the language switch, in the window's title bar: both govern the whole article. */
export function KnowledgeHeaderControls({ view, onView }: { view: ViewMode; onView: (view: ViewMode) => void }) {
  const m = useMessages(knowledgeBaseMessages);
  return (
    <>
      <ViewModeToggle view={view} onChange={onView} testId="kb-view" hints={{ basic: m('viewBasicHint'), advanced: m('viewAdvancedHint') }} />
      <LanguageToggle variant="globe" testId="kb-language" />
    </>
  );
}

/** The Advanced view's extra prose for a section, set apart so a reader sees what the deeper view added. */
function AdvancedNote({ id, paragraphs, locale }: { id: string; paragraphs: readonly Localized<string>[]; locale: Locale }) {
  const m = useMessages(knowledgeBaseMessages);
  return (
    <div className="mt-2 rounded-r-lg border-l-2 border-violet-400/70 bg-violet-500/[0.07] py-1.5 pl-3 pr-2" data-advanced={id}>
      <div className="text-[12px] font-bold uppercase tracking-wider text-violet-300">{m('advancedTag')}</div>
      {paragraphs.map((p, i) => (
        <p key={i} className="mt-1 text-slate-200">
          {pick(p, locale)}
        </p>
      ))}
    </div>
  );
}

function FlowCard({ flow, locale }: { flow: ArticleFlow; locale: Locale }) {
  const m = useMessages(knowledgeBaseMessages);
  const balances = flow.watch.map((gl) => ({ gl, after: flowBalances(flow, gl) }));
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3" id={kbAnchorId(flow.id)} data-flow={flow.id}>
      <h4 className="text-[15.5px] font-bold text-emerald-200">{pick(flow.title, locale)}</h4>
      <p className="mt-0.5 text-[14px] text-slate-400">{pick(flow.summary, locale)}</p>
      <ol className="mt-2 space-y-2">
        {flow.steps.map((st, i) => (
          <li key={i} className="rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-2" data-step={i + 1}>
            <div className="text-[12px] font-semibold uppercase tracking-wider text-sky-300">
              {m('step', { n: i + 1 })}
              {st.instead && <span className="ml-1.5 rounded bg-amber-400/15 px-1 normal-case tracking-normal text-amber-200">{m('stepInstead')}</span>}
            </div>
            <p className="mt-0.5 text-[14.5px] leading-normal text-slate-200">{pick(st.text, locale)}</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[13.5px] tabular-nums">
              {st.lines.map((l) => (
                <li key={`${l.side}-${l.gl}`} className={`flex min-w-0 items-baseline gap-2 ${l.side === 'cr' ? 'pl-4' : ''}`} data-gl={l.gl} data-side={l.side}>
                  <span className={`shrink-0 font-bold ${l.side === 'dr' ? 'text-sky-300' : 'text-amber-300'}`}>{l.side === 'dr' ? 'Dr' : 'Cr'}</span>
                  <span className="shrink-0 whitespace-nowrap text-slate-400">{GL_CODE[l.gl]}</span>
                  <span className="min-w-0 flex-1 truncate font-sans text-slate-200" title={glName(l.gl, locale)}>
                    {glName(l.gl, locale)}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-slate-100" data-amount={flowAmount(flow, l)}>
                    {formatMoney(flowAmount(flow, l))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-1 flex flex-wrap gap-1" data-statements={i + 1}>
              {st.lines.map((l) => (
                <span key={`${l.side}-${l.gl}`} className={`whitespace-nowrap rounded px-1.5 text-[12px] font-semibold ${statementOf(l.gl) === 'income' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-sky-500/15 text-sky-200'}`} data-statement={statementOf(l.gl)}>
                  {m(statementOf(l.gl) === 'income' ? 'statementIncome' : 'statementBalance')} - {GL_CODE[l.gl]} {lineRaises(l) ? '↑' : '↓'} {formatMoney(flowAmount(flow, l))}
                </span>
              ))}
            </div>
            {balances.map(({ gl, after }) => (
              <div key={gl} className="mt-1 text-[13px] font-semibold text-violet-200" data-balance={gl} data-after={after[i]}>
                {m('balanceAfter', { code: GL_CODE[gl], amount: formatMoney(after[i]!) })}
              </div>
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * A GL badge in the acronym table. Pointing at it (or focusing it) opens a card saying exactly why the account belongs to the
 * acronym. The card is portalled to <body> and placed beside the badge, so the table's scrolling never clips it.
 */
function GlWhyBadge({ gl, acronym, why, locale }: { gl: GlAccount; acronym: string; why: Localized<string> | undefined; locale: Locale }) {
  const m = useMessages(knowledgeBaseMessages);
  const id = useId();
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const open = (el: HTMLElement): void => {
    const r = el.getBoundingClientRect();
    setAt({ left: Math.min(r.left, window.innerWidth - 336), top: r.bottom + 6 });
  };
  return (
    <span
      tabIndex={0}
      className="cursor-help whitespace-nowrap rounded bg-slate-800 px-1.5 text-[13px] outline-none ring-sky-400 hover:bg-slate-700 focus-visible:ring-2"
      data-gl={gl}
      aria-describedby={why ? id : undefined}
      onPointerEnter={(e) => why && open(e.currentTarget)}
      onPointerLeave={() => setAt(null)}
      onFocus={(e) => why && open(e.currentTarget)}
      onBlur={() => setAt(null)}
    >
      <span className="font-mono font-bold text-amber-200">{GL_CODE[gl]}</span> <span className="text-slate-300">{glName(gl, locale)}</span>
      {why && <span id={id} className="sr-only">{pick(why, locale)}</span>}
      {at &&
        why &&
        createPortal(
          <div role="tooltip" className="pointer-events-none fixed z-[100] w-80 rounded-xl border border-sky-400/40 bg-[#0b1120] p-3 text-left shadow-2xl" style={at} data-testid="kb-gl-why">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-sky-300">{m('whyTitle', { code: GL_CODE[gl], acronym })}</div>
            <div className="mt-0.5 text-[14px] font-bold text-slate-50">{glName(gl, locale)}</div>
            <p className="mt-1 whitespace-normal text-[14px] leading-normal text-slate-200">{pick(why, locale)}</p>
          </div>,
          document.body,
        )}
    </span>
  );
}

/** Whether an account matches the quick filter: by number, internal id, or name and plain words in either language. */
const accountMatches = (gl: GlAccount, code: string, q: string): boolean =>
  !q || fold([code, gl.replace(/_/g, ' '), ...(['en', 'vi'] as const).flatMap((l) => [glName(gl, l), glPlain(gl, l)])].join(' | ')).includes(q);

/** Section 3: a card for every account in the ledger, with a quick filter. Advanced adds what posts to it and its journal. */
function AccountCards({ query, onQuery, advanced, locale }: { query: string; onQuery: (q: string) => void; advanced: boolean; locale: Locale }) {
  const m = useMessages(knowledgeBaseMessages);
  const q = fold(query);
  const shown = GL_ACCOUNTS.filter((a) => accountMatches(a.id, a.code, q));
  const usage = advanced ? glUsage() : null;
  return (
    <div className="mt-4" data-testid="kb-account-cards">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-[15px] font-bold text-slate-100">{m('cardsTitle')}</h4>
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={m('cardsFilter')}
          aria-label={m('cardsFilter')}
          className="min-w-[14rem] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[14px] text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
          data-testid="kb-account-filter"
        />
        <span className="text-[13px] tabular-nums text-slate-400" data-testid="kb-account-count">
          {m('cardsCount', { n: shown.length, total: GL_ACCOUNTS.length })}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="mt-2 text-[14px] italic text-slate-500">{m('cardsNone', { q: query.trim() })}</p>
      ) : (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((acc) => {
            const side = normalSide(acc.id);
            return (
              <div key={acc.id} className={`rounded-xl border p-3 ${isIntermediate(acc.id) ? 'border-amber-400/35 bg-amber-400/[0.04]' : 'border-slate-700 bg-slate-950/50'}`} data-account-card={acc.id}>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[17px] font-black text-slate-50">{acc.code}</span>
                  <span className="min-w-0 text-[14px] font-semibold leading-normal text-slate-100">{glName(acc.id, locale)}</span>
                </div>
                <p className="mt-1 text-[14px] leading-normal text-slate-300">{glPlain(acc.id, locale)}</p>
                <div className="mt-1.5 flex flex-wrap gap-1 text-[12px] font-semibold">
                  <span className="rounded bg-slate-800 px-1.5 text-slate-200">{pick(SIDE_TITLE[GL_SIDE[acc.id]], locale)}</span>
                  <span className={`rounded px-1.5 ${side === 'dr' ? 'bg-sky-500/15 text-sky-200' : 'bg-amber-500/15 text-amber-200'}`}>{m(side === 'dr' ? 'normalDr' : 'normalCr')}</span>
                  <span className="rounded bg-slate-800 px-1.5 text-slate-300">{m(statementOf(acc.id) === 'income' ? 'statementIncome' : 'statementBalance')}</span>
                  <span className={`rounded px-1.5 ${isIntermediate(acc.id) ? 'bg-amber-400/15 text-amber-200' : 'bg-slate-800 text-slate-300'}`}>{m(isIntermediate(acc.id) ? 'typeIntermediate' : 'typeOperational')}</span>
                </div>
                {usage && (
                  <dl className="mt-1.5 space-y-0.5 text-[13px]">
                    <div>
                      <dt className="inline font-semibold text-slate-400">{m('colTrigger')}: </dt>
                      <dd className="inline text-slate-300">{usage[acc.id].scenes.length ? usage[acc.id].scenes.map((sc) => sceneTitle(sc, locale)).join(' · ') : m('triggerOpening')}</dd>
                    </div>
                    {usage[acc.id].entry && (
                      <div>
                        <dt className="inline font-semibold text-slate-400">{m('colEntry')}: </dt>
                        <dd className="inline font-mono text-emerald-200">{usage[acc.id].entry}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The article body, separate from the window so it renders (and is tested) on its own. `view` comes from the title bar. */
export function CoreLedgerArticle({ highlight = null, view = 'basic', accountQuery = '' }: { highlight?: string | null; view?: ViewMode; accountQuery?: string }) {
  const m = useMessages(knowledgeBaseMessages);
  const locale = useLocale();
  const [query, setQuery] = useState(accountQuery);
  const advanced = view === 'advanced';
  const usage = advanced ? glUsage() : null;
  const a = CORE_LEDGER_ARTICLE;
  const lit = (anchor: string): string => (highlight === anchor ? 'ring-2 ring-amber-300/80 rounded-lg' : '');
  const terms = new Map(glossaryTerms(locale).map((t) => [t.key, t]));
  return (
    <article data-testid="kb-article" data-article={a.id} data-view={view} className="text-[15px] leading-relaxed text-slate-200">
      <h3 className="text-[20px] font-extrabold text-slate-50">{pick(a.title, locale)}</h3>
      <p className="mt-1 text-slate-300">{pick(a.intro, locale)}</p>
      <nav aria-label={m('onThisPage')} className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
        <div className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-500">{m('onThisPage')}</div>
        <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {a.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${kbAnchorId(s.id)}`} className="text-[14.5px] text-sky-300 hover:underline">
                {pick(s.title, locale)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {a.sections.map((s) => (
        <section key={s.id} id={kbAnchorId(s.id)} data-section={s.id} className={`mt-5 scroll-mt-2 ${lit(s.id)}`}>
          <h3 className="text-[17px] font-bold text-slate-50">{pick(s.title, locale)}</h3>
          {s.paragraphs.map((p, i) => (
            <p key={i} className="mt-1.5">
              {pick(p, locale)}
            </p>
          ))}
          {advanced && <AdvancedNote id={s.id} paragraphs={s.advanced} locale={locale} />}

          {s.id === 'double-entry' && (
            <>
              <div className="mx-auto mt-3 w-fit rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-center text-[17px] font-black text-emerald-100" data-testid="kb-equation">
                {m('equation')}
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-[14px]" data-testid="kb-rules">
                  <thead>
                    <tr>
                      <th className={th}>{m('colSide')}</th>
                      <th className={th}>{m('colDebit')}</th>
                      <th className={th}>{m('colCredit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GL_SIDES.map((side) => (
                      <tr key={side}>
                        <td className={`${td} font-semibold`}>{pick(SIDE_TITLE[side], locale)}</td>
                        <td className={`${td} text-sky-200`}>{pick(SIDE_RULE[side].dr, locale)}</td>
                        <td className={`${td} text-amber-200`}>{pick(SIDE_RULE[side].cr, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {advanced && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-[14px]" data-testid="kb-formulas">
                    <thead>
                      <tr>
                        <th className={th}>{m('colFormula')}</th>
                        <th className={th}>{m('colMeaning')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LEDGER_FORMULAS.map((f, i) => (
                        <tr key={i}>
                          <td className={`${td} whitespace-nowrap font-mono font-bold text-emerald-200`}>{pick(f.formula, locale)}</td>
                          <td className={`${td} text-slate-300`}>{pick(f.meaning, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {s.id === 'accounts' && (
            <div className="mt-3 space-y-3">
              {advanced && (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="kb-taxonomy">
                  {GL_TAXONOMY.map((f) => (
                    <div key={f.id} data-family={f.id} className={`rounded-lg border px-2.5 py-1.5 ${f.risk ? 'border-amber-400/40 bg-amber-400/[0.06]' : 'border-slate-700 bg-slate-950/50'}`}>
                      <div className="flex items-center gap-1.5 text-[14px] font-bold text-slate-100">
                        {pick(f.title, locale)}
                        {f.risk && <span className="rounded bg-amber-400/15 px-1.5 text-[12px] font-semibold text-amber-200">{m('riskTag')}</span>}
                      </div>
                      <p className="text-[13px] text-slate-400">{pick(f.note, locale)}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {f.accounts.map((gl) => (
                          <span key={gl} className="cursor-help rounded bg-slate-800 px-1.5 font-mono text-[13px] font-bold text-slate-200" title={glName(gl, locale)} data-gl={gl}>
                            {GL_CODE[gl]}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {GL_SIDES.map((side) => (
                <div key={side} className="overflow-x-auto">
                  <div className="text-[13px] font-bold uppercase tracking-wider text-slate-400">{pick(SIDE_TITLE[side], locale)}</div>
                  <table className={`mt-1 w-full border-collapse text-[14px] ${advanced ? 'min-w-[980px]' : 'min-w-[560px]'}`} data-testid={`kb-accounts-${side}`}>
                    <thead>
                      <tr>
                        <th className={`${th} w-16`}>{m('colCode')}</th>
                        <th className={th}>{m('colAccount')}</th>
                        <th className={th}>{m('colPlain')}</th>
                        <th className={`${th} w-28`}>{m('colType')}</th>
                        {advanced && <th className={th}>{m('colTrigger')}</th>}
                        {advanced && <th className={`${th} w-48`}>{m('colEntry')}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {accountsOn(side).map((acc) => (
                        <tr key={acc.id} id={kbAnchorId(`gl-${acc.id}`)} data-gl={acc.id} className={highlight === `gl-${acc.id}` ? 'bg-amber-400/15 outline outline-2 outline-amber-300/80' : ''}>
                          <td className={`${td} whitespace-nowrap font-mono font-bold text-slate-100`}>{acc.code}</td>
                          <td className={td}>{glName(acc.id, locale)}</td>
                          <td className={`${td} text-slate-400`}>{glPlain(acc.id, locale)}</td>
                          <td className={`${td} whitespace-nowrap`}>
                            {isIntermediate(acc.id) ? (
                              <span className="cursor-help rounded bg-amber-400/15 px-1.5 text-[12.5px] font-semibold text-amber-200" title={m('typeIntermediateHint')}>
                                {m('typeIntermediate')}
                              </span>
                            ) : (
                              <span className="rounded bg-slate-800 px-1.5 text-[12.5px] font-semibold text-slate-300">{m('typeOperational')}</span>
                            )}
                          </td>
                          {usage && (
                            <td className={`${td} text-slate-300`} data-col="trigger">
                              {usage[acc.id].scenes.length ? usage[acc.id].scenes.map((sc) => sceneTitle(sc, locale)).join(' · ') : <span className="italic text-slate-500">{m('triggerOpening')}</span>}
                            </td>
                          )}
                          {usage && (
                            <td className={`${td} whitespace-nowrap font-mono text-[13.5px] text-emerald-200`} data-col="entry">
                              {usage[acc.id].entry ?? '—'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {s.id === 'intermediate' && (
            <>
              <ul className="mt-3 space-y-1.5" data-testid="kb-intermediate">
                {INTERMEDIATE_ACCOUNTS.map((gl) => (
                  <li key={gl} className="rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-2.5 py-1.5" data-gl={gl}>
                    <span className="mr-2 whitespace-nowrap font-mono text-[14px] font-bold text-amber-200">{GL_CODE[gl]}</span>
                    <span className="font-semibold text-slate-100">{glName(gl, locale)}</span>
                    {INTERMEDIATE_ROLE[gl] && <p className="mt-0.5 text-[14px] text-slate-300">{pick(INTERMEDIATE_ROLE[gl]!, locale)}</p>}
                  </li>
                ))}
              </ul>
              <AccountCards query={query} onQuery={setQuery} advanced={advanced} locale={locale} />
              {advanced && (
                <div className="mt-3 grid gap-3 md:grid-cols-2" data-testid="kb-buffers">
                  {BUFFER_MECHANICS.map((b) => (
                    <div key={b.gl} className="rounded-xl border border-violet-400/30 bg-slate-950/60 p-3" data-buffer={b.gl}>
                      <h4 className="text-[15px] font-bold text-violet-100">
                        <span className="mr-2 font-mono text-amber-200">{GL_CODE[b.gl]}</span>
                        {glName(b.gl, locale)}
                      </h4>
                      <dl className="mt-1.5 space-y-1.5 text-[14px]">
                        <div>
                          <dt className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-400">{m('bufferFill')}</dt>
                          <dd className="text-slate-200">
                            {pick(b.fill, locale)} <span className="whitespace-nowrap font-mono text-[13.5px] text-emerald-200">{journalText(b.fillJournal)}</span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-400">{m('bufferDrain')}</dt>
                          <dd className="text-slate-200">
                            {pick(b.drain, locale)} <span className="whitespace-nowrap font-mono text-[13.5px] text-emerald-200">{journalText(b.drainJournal)}</span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-400">{m('bufferControl')}</dt>
                          <dd className="text-slate-300">{pick(b.control, locale)}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              )}
              {advanced && (
                <div className="mt-3 overflow-x-auto">
                  <h4 className="text-[15px] font-bold text-slate-100">{m('rulesTitle')}</h4>
                  <table className="mt-1 w-full min-w-[640px] border-collapse text-[14px]" data-testid="kb-regulations">
                    <thead>
                      <tr>
                        <th className={th}>{m('colRule')}</th>
                        <th className={`${th} w-32`}>{m('colThreshold')}</th>
                        <th className={`${th} w-64`}>{m('colSource')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {REGULATORY_RULES.map((r) => (
                        <tr key={r.id} data-rule={r.id}>
                          <td className={`${td} text-slate-200`}>{pick(r.rule, locale)}</td>
                          <td className={`${td} whitespace-nowrap font-mono font-bold text-amber-200`}>{r.cents !== undefined ? formatMoney(r.cents) : r.days !== undefined ? m('days', { n: r.days }) : m('seeRule')}</td>
                          <td className={`${td} text-slate-400`}>{pick(r.source, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-1 text-[12.5px] italic text-slate-500">{m('rulesNote')}</p>
                </div>
              )}
              {advanced && (
                <div className="mt-3">
                  <h4 className="text-[15px] font-bold text-slate-100">{m('controlsTitle')}</h4>
                  <ol className="mt-1 space-y-1.5" data-testid="kb-controls">
                    {INTERNAL_CONTROLS.map((c, i) => (
                      <li key={c.id} className="flex gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5" data-control={c.id}>
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-500/25 text-[12.5px] font-bold text-violet-100">{i + 1}</span>
                        <div>
                          <div className="text-[14px] font-semibold text-slate-100">{pick(c.title, locale)}</div>
                          <p className="text-[14px] text-slate-300">{pick(c.detail, locale)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}

          {s.id === 'flows' && (
            <div className="mt-3 grid gap-3 lg:grid-cols-2" data-testid="kb-flows">
              {a.flows.map((f) => (
                <FlowCard key={f.id} flow={f} locale={locale} />
              ))}
            </div>
          )}

          {s.id === 'glossary' && (
            <>
              <dl className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2" data-testid="kb-glossary">
                {glossaryTerms(locale).map((t) => (
                  <div key={t.key} id={kbAnchorId(`term-${t.key}`)} data-term={t.key} className={`rounded-md px-1.5 py-0.5 ${highlight === `term-${t.key}` ? 'bg-amber-400/15 ring-2 ring-amber-300/80' : ''}`}>
                    <dt className="inline whitespace-nowrap font-mono font-bold text-sky-200">{t.label}</dt>
                    <dd className="inline text-slate-300"> · {t.meaning}</dd>
                  </div>
                ))}
              </dl>
              {advanced && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-[14px]" data-testid="kb-acronyms">
                    <thead>
                      <tr>
                        <th className={`${th} w-24`}>{m('colAcronym')}</th>
                        <th className={th}>{m('colMeaning')}</th>
                        <th className={th}>{m('colGlAccounts')}</th>
                        <th className={`${th} w-48`}>{m('colDesk')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(ACRONYM_GL).map(([key, row]) => (
                        <tr key={key} data-acronym={key}>
                          <td className={`${td} whitespace-nowrap font-mono font-bold text-sky-200`}>{terms.get(key)?.label ?? key}</td>
                          <td className={`${td} text-slate-300`}>{terms.get(key)?.meaning}</td>
                          <td className={td}>
                            <div className="flex flex-wrap gap-1">
                              {row.gls.map((gl) => (
                                <GlWhyBadge key={gl} gl={gl} acronym={terms.get(key)?.label ?? key} why={ACRONYM_GL_WHY[key]?.[gl]} locale={locale} />
                              ))}
                            </div>
                          </td>
                          <td className={`${td} text-slate-300`}>{row.role ? aw(`role_${row.role}_title`, locale) : <span className="italic text-slate-500">{m('deskNone')}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      ))}
    </article>
  );
}

/** A comparison table of the AML article. */
function CompareTable({ table, locale, testId }: { table: KbTable; locale: Locale; testId: string }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[14px]" data-testid={testId}>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i} className={th}>
                {pick(c, locale)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td key={i} className={`${td} ${i === 0 ? 'font-semibold text-slate-100' : 'text-slate-300'}`}>
                  {pick(cell, locale)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A step-by-step SOP drawn as a flow: numbered boxes joined by arrows, wrapping on narrow screens. */
export function SopFlow({ steps, title, testId = 'kb-sop-flow' }: { steps: readonly string[]; title: string; testId?: string }) {
  return (
    <figure className="mt-3" data-testid={testId}>
      <figcaption className="text-[12.5px] font-bold uppercase tracking-wider text-sky-300">{title}</figcaption>
      <ol className="mt-1.5 flex flex-wrap items-stretch gap-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center" data-step={i + 1}>
            <span className="flex h-full max-w-[15rem] items-start gap-1.5 rounded-lg border border-sky-400/40 bg-sky-500/10 px-2.5 py-1.5 text-[13.5px] leading-snug text-sky-50">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-400 text-[11.5px] font-black text-slate-950">{i + 1}</span>
              {step}
            </span>
            {i < steps.length - 1 && (
              <span className="px-1.5 text-[18px] font-black text-sky-400" aria-hidden="true">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** What each answer leads to: the SOP followed, a breach approved, a clean case rejected. */
function DecisionTree({ right, wrongApprove, wrongReject, testId = 'kb-decision-tree' }: { right: string; wrongApprove: string; wrongReject: string; testId?: string }) {
  const m = useMessages(knowledgeBaseMessages);
  const leaf = (label: string, text: string, tone: string) => (
    <div className={`rounded-lg border px-2.5 py-1.5 text-[13.5px] ${tone}`}>
      <div className="font-bold">{label}</div>
      <div className="mt-0.5 leading-snug opacity-90">{text}</div>
    </div>
  );
  return (
    <figure className="mt-3" data-testid={testId}>
      <figcaption className="text-[12.5px] font-bold uppercase tracking-wider text-violet-300">{m('treeTitle')}</figcaption>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
        {leaf(m('treeRight'), right, 'border-lime-400/40 bg-lime-950/30 text-lime-50')}
        {leaf(m('treeWrongApprove'), wrongApprove, 'border-rose-400/40 bg-rose-950/30 text-rose-50')}
        {leaf(m('treeWrongReject'), wrongReject, 'border-amber-400/40 bg-amber-950/30 text-amber-50')}
      </div>
    </figure>
  );
}

/** The Advanced view's expert notes on a retail topic. */
function RetailDeepDiveView({ dive, id, locale }: { dive: RetailDeepDive; id: string; locale: Locale }) {
  const m = useMessages(knowledgeBaseMessages);
  const block = (key: string, title: string, body: ReactNode) => (
    <div key={key} className="rounded-lg border border-violet-400/25 bg-slate-950/50 px-2.5 py-2" data-deep={key}>
      <div className="text-[12.5px] font-bold uppercase tracking-wider text-violet-300">{title}</div>
      <div className="mt-1 text-[14px] leading-normal text-slate-200">{body}</div>
    </div>
  );
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-2" data-testid="kb-deep-dive" data-topic={id}>
      {block('statute', m('deepStatute'), pick(dive.statute, locale))}
      {block(
        'edge',
        m('deepEdgeCases'),
        <ul className="list-disc space-y-1 pl-4">
          {dive.edgeCases.map((e, i) => (
            <li key={i}>{pick(e, locale)}</li>
          ))}
        </ul>,
      )}
      {block('risk', m('deepRisk'), pick(dive.riskScoring, locale))}
      {block('settlement', m('deepSettlement'), pick(dive.settlement, locale))}
      <div className="md:col-span-2">{block('audit', m('deepAudit'), pick(dive.audit, locale))}</div>
    </div>
  );
}

/** What a queue scenario posts on the core ledger when it is approved, and when it is refused. */
function ScenarioJournals({ scenario, locale }: { scenario: RetailScenarioId; locale: Locale }) {
  const m = useMessages(knowledgeBaseMessages);
  const { approve, reject } = scenarioJournals(scenario);
  if (!approve.length && !reject.length) return null;
  return (
    <figure className="mt-3" data-testid="kb-scenario-journals">
      <figcaption className="text-[12.5px] font-bold uppercase tracking-wider text-emerald-300">{m('coreJournalsTitle')}</figcaption>
      <div className="mt-1.5 grid gap-2 md:grid-cols-2">
        {approve.length > 0 && <CoreJournal title={m('journalIfApproved')} lines={approve} locale={locale} />}
        {reject.length > 0 && <CoreJournal title={m('journalIfRefused')} lines={reject} locale={locale} />}
      </div>
    </figure>
  );
}

/** One retail guide: plain intro, then each scenario's trigger, SOP flow and decision tree (Basic or Advanced copy), and the rules and postings in the Advanced view. */
function RetailGuideSection({ g, advanced, locale, highlight }: { g: RetailGuide; advanced: boolean; locale: Locale; highlight: string | null }) {
  const m = useMessages(knowledgeBaseMessages);
  const v = advanced ? 'Exp' : 'Std';
  return (
    <section id={kbAnchorId(g.id)} data-section={g.id} className={`mt-6 scroll-mt-2 border-t border-slate-800 pt-5 ${highlight === g.id ? 'rounded-lg ring-2 ring-amber-300/80' : ''}`}>
      <h3 className="text-[17px] font-bold text-slate-50">{pick(g.title, locale)}</h3>
      <p className="mt-1.5">{pick(g.intro, locale)}</p>
      {advanced && (
        <div className="mt-2 rounded-r-lg border-l-2 border-violet-400/70 bg-violet-500/[0.07] py-1.5 pl-3 pr-2" data-advanced={g.id}>
          <div className="text-[12px] font-bold uppercase tracking-wider text-violet-300">{m('foundationTag')}</div>
          <p className="mt-1 text-slate-200">{pick(g.foundation, locale)}</p>
        </div>
      )}
      {advanced && RETAIL_DEEP_DIVES[g.id] && <RetailDeepDiveView dive={RETAIL_DEEP_DIVES[g.id]!} id={g.id} locale={locale} />}
      {g.scenarios.map((id) => (
        <div key={id} className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3" data-scenario={id}>
          <h4 className="text-[15px] font-bold text-emerald-200">{aw(`retail_${id}_title`, locale)}</h4>
          <p className="mt-1 text-[14px] text-slate-300">
            <span className="mr-1 font-semibold text-slate-400">{m('scenarioWhen')}:</span>
            {aw(`scene_retail_${id}_trigger${v}`, locale)}
          </p>
          <SopFlow title={m('flowTitle')} steps={[1, 2, 3].map((n) => aw(`retail_${id}_sop${v}_${n}`, locale))} />
          <DecisionTree right={aw(`risk_retail_${id}_benefit${v}`, locale)} wrongApprove={aw(`risk_retail_${id}_approve${v}`, locale)} wrongReject={aw(`risk_retail_${id}_reject${v}`, locale)} />
          <ScenarioJournals scenario={id} locale={locale} />
        </div>
      ))}
      {g.id === 'retail-teller-vault' && (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3" data-testid="kb-teller-flow">
          <SopFlow title={m('flowTitle')} steps={TELLER_FLOW.map((s) => pick(s, locale))} testId="kb-sop-flow-teller" />
          <DecisionTree right={pick(TELLER_DECISION.right, locale)} wrongApprove={pick(TELLER_DECISION.wrongApprove, locale)} wrongReject={pick(TELLER_DECISION.wrongReject, locale)} testId="kb-decision-tree-teller" />
        </div>
      )}
      {(TOPIC_MODULES[g.id] ?? []).map((mod) => (
        <TopicModuleView key={mod.id} module={mod} highlight={highlight} />
      ))}
    </section>
  );
}

/** The retail operations catalog: one article per topic, on both levels, each with its flow, decision tree, message flow, step cards, journals, red flags and regulations. */
export function RetailArticle({ highlight = null, view = 'basic' }: { highlight?: string | null; view?: ViewMode }) {
  const m = useMessages(knowledgeBaseMessages);
  const locale = useLocale();
  return (
    <article data-testid="kb-article" data-article="retail-operations" data-view={view} className="text-[15px] leading-relaxed text-slate-200">
      <h3 className="text-[20px] font-extrabold text-slate-50">{m('retailTitle')}</h3>
      <p className="mt-1 text-slate-300">{m('retailIntro')}</p>
      <nav aria-label={m('onThisPage')} className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
        <div className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-500">{m('onThisPage')}</div>
        <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {RETAIL_TOPICS.map((g) => (
            <li key={g.id}>
              <a href={`#${kbAnchorId(g.id)}`} className="text-[14.5px] text-sky-300 hover:underline">
                {pick(g.title, locale)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {RETAIL_TOPICS.map((g) => (
        <RetailGuideSection key={g.id} g={g} advanced={view === 'advanced'} locale={locale} highlight={highlight} />
      ))}
      <OpsCrosswalk highlight={highlight} />
    </article>
  );
}

/** The AML compliance article: AML and CFT, the 3 stages, the 3 fraud patterns, red flags, the legal rules, KYC and CFT, with a golden rule each.
 *  Basic shows the intuitive, action-oriented sections; Advanced adds the legal and technical foundations. */
export function AmlArticle({ highlight = null, view = 'basic' }: { highlight?: string | null; view?: ViewMode }) {
  const m = useMessages(knowledgeBaseMessages);
  const locale = useLocale();
  const advanced = view === 'advanced';
  const a = { ...AML_ARTICLE, sections: AML_ARTICLE.sections.filter((s) => advanced || !('level' in s && s.level === 'advanced')) };
  return (
    <article data-testid="kb-article" data-article={a.id} data-view={view} className="text-[15px] leading-relaxed text-slate-200">
      <h3 className="text-[20px] font-extrabold text-slate-50">{pick(a.title, locale)}</h3>
      <p className="mt-1 text-slate-300">{pick(a.intro, locale)}</p>
      <nav aria-label={m('onThisPage')} className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
        <div className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-500">{m('onThisPage')}</div>
        <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {a.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${kbAnchorId(s.id)}`} className="text-[14.5px] text-sky-300 hover:underline">
                {pick(s.title, locale)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {a.sections.map((s) => (
        <section key={s.id} id={kbAnchorId(s.id)} data-section={s.id} className={`mt-5 scroll-mt-2 ${highlight === s.id ? 'rounded-lg ring-2 ring-amber-300/80' : ''}`}>
          <h3 className="text-[17px] font-bold text-slate-50">{pick(s.title, locale)}</h3>
          {s.paragraphs.map((p, i) => (
            <p key={i} className="mt-1.5">
              {pick(p, locale)}
            </p>
          ))}
          {s.rule && (
            <div className="mt-3 rounded-lg border border-amber-300/50 bg-amber-400/10 px-3 py-2 text-[15px] font-bold text-amber-100" data-testid="kb-golden-rule">
              <span className="mr-1.5 text-[12.5px] font-black uppercase tracking-wider text-amber-300">{m('goldenRule')}</span>
              {pick(s.rule, locale)}
            </div>
          )}
          {'flow' in s && s.flow && <SopFlow title={m('flowTitle')} steps={s.flow.map((f) => pick(f, locale))} testId={`kb-flow-${s.id}`} />}
          {s.table && <CompareTable table={s.table} locale={locale} testId={`kb-table-${s.id}`} />}
          {advanced && s.advanced.length > 0 && <AdvancedNote id={s.id} paragraphs={s.advanced} locale={locale} />}
        </section>
      ))}
    </article>
  );
}

/** The Knowledge Base's categories (Strategy): each tab's label and the article it renders. A new category is one more entry. */
const KB_TABS: readonly { id: KnowledgeTab; label: 'tabCore' | 'tabAml' | 'tabRetail' | 'tabFlashcards'; render: (highlight: string | null, view: ViewMode) => ReactNode }[] = [
  { id: 'core', label: 'tabCore', render: (highlight, view) => <CoreLedgerArticle highlight={highlight} view={view} /> },
  { id: 'aml', label: 'tabAml', render: (highlight, view) => <AmlArticle highlight={highlight} view={view} /> },
  { id: 'retail', label: 'tabRetail', render: (highlight, view) => <RetailArticle highlight={highlight} view={view} /> },
  { id: 'flashcards', label: 'tabFlashcards', render: (highlight) => <OpsFlashcards highlight={highlight} /> },
];

/** The category tab bar: opens on the tab of wherever the window was opened from, and any tab is one click away. */
export function KnowledgeTabs({ tab, onTab }: { tab: KnowledgeTab; onTab: (tab: KnowledgeTab) => void }) {
  const m = useMessages(knowledgeBaseMessages);
  return (
    <div role="tablist" aria-label={m('tabsLabel')} className="sticky -top-5 z-10 -mx-6 -mt-5 mb-4 flex flex-wrap gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900 px-6 pt-3 sm:flex-nowrap" data-testid="kb-tabs">
      {KB_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          data-testid={`kb-tab-${t.id}`}
          onClick={() => onTab(t.id)}
          className={`shrink-0 whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2 text-[14.5px] font-bold transition ${tab === t.id ? 'border-sky-400 bg-slate-800/60 text-slate-50' : 'border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'}`}
        >
          {m(t.label)}
        </button>
      ))}
    </div>
  );
}

/** The window's footer: the knowledge is simulated, and feedback is welcome, via the author's LinkedIn. */
export function KnowledgeDisclaimer() {
  const c = useMessages(creditsMessages);
  return (
    <p className="text-center text-[12px] leading-snug text-slate-400" data-testid="kb-disclaimer">
      {formatNodes(c('kbDisclaimer', { author: '{author}' }), { author: <AuthorLink /> })}
    </p>
  );
}

/** The Knowledge Base window, opened from the search bar, the ledger legend or the AML desk. Sits above the workspace (z-[90]); closing it returns to where it was opened. */
export function KnowledgeBaseModal() {
  const m = useMessages(knowledgeBaseMessages);
  const anchor = useUiStore((s) => s.knowledgeAnchor);
  const tab = useUiStore((s) => s.knowledgeTab);
  const [highlight, setHighlight] = useState<string | null>(anchor);
  const [view, setView] = useState<ViewMode>('basic');
  useEffect(() => {
    setHighlight(anchor);
    if (!anchor) return;
    // After the article has laid out, bring the anchor into view.
    const t = window.setTimeout(() => document.getElementById(kbAnchorId(anchor))?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
    return () => window.clearTimeout(t);
  }, [anchor]);
  return (
    <Modal title={m('title')} subtitle={m('subtitle')} icon="📒" onClose={() => uiStore.getState().closeKnowledge()} width="max-w-5xl" testId="knowledge-base" z="z-[90]" bodyClass="overflow-x-hidden [scroll-padding-top:4rem]" actions={<KnowledgeHeaderControls view={view} onView={setView} />} footer={<KnowledgeDisclaimer />}>
      <KnowledgeTabs tab={tab} onTab={(t) => uiStore.getState().setKnowledgeTab(t)} />
      <div role="tabpanel" data-tab={tab}>
        {KB_TABS.find((t) => t.id === tab)!.render(highlight, view)}
      </div>
    </Modal>
  );
}
