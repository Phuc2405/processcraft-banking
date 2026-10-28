import { useEffect, useState } from 'react';
import {
  accountsOn,
  ACRONYM_GL,
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
import { pick, useLocale, type Locale, type Localized } from '../../i18n/locale';
import { fold } from '../../hooks/useSearchIndex';
import { formatMoney } from '../../sim/kpis';
import { GL_ACCOUNTS, GL_CODE, GL_SIDE, type GlAccount } from '../../sim/staffRoleplay';
import { uiStore, useUiStore } from '../../store/uiStore';
import { message, useMessages } from '../../utils/i18nHelper';
import { analystWorkspaceMessages, type AnalystWorkspaceKey } from '../bank/analystWorkspace.messages';
import { glossaryTerms, glPlain } from '../bank/codeGlossary';
import { LanguageToggle } from '../shell/LanguageToggle';
import { Modal } from '../shell/Modal';
import { ViewModeToggle, type ViewMode } from '../shell/SegmentedToggle';
import { knowledgeBaseMessages } from './knowledgeBase.messages';

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

function FlowCard({ flow, locale, advanced }: { flow: ArticleFlow; locale: Locale; advanced: boolean }) {
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
                  {advanced && (
                    <span className="shrink-0 whitespace-nowrap text-slate-100" data-amount={flowAmount(flow, l)}>
                      {formatMoney(flowAmount(flow, l))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {advanced && (
              <div className="mt-1 flex flex-wrap gap-1" data-statements={i + 1}>
                {st.lines.map((l) => (
                  <span key={`${l.side}-${l.gl}`} className={`whitespace-nowrap rounded px-1.5 text-[12px] font-semibold ${statementOf(l.gl) === 'income' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-sky-500/15 text-sky-200'}`} data-statement={statementOf(l.gl)}>
                    {m(statementOf(l.gl) === 'income' ? 'statementIncome' : 'statementBalance')} · {GL_CODE[l.gl]} {lineRaises(l) ? '↑' : '↓'} {formatMoney(flowAmount(flow, l))}
                  </span>
                ))}
              </div>
            )}
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
                <FlowCard key={f.id} flow={f} locale={locale} advanced={advanced} />
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
                                <span key={gl} className="whitespace-nowrap rounded bg-slate-800 px-1.5 text-[13px]" data-gl={gl}>
                                  <span className="font-mono font-bold text-amber-200">{GL_CODE[gl]}</span> <span className="text-slate-300">{glName(gl, locale)}</span>
                                </span>
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

/** The Knowledge Base window, opened from the search bar or the ledger legend. Sits above the workspace (z-[90]). */
export function KnowledgeBaseModal() {
  const m = useMessages(knowledgeBaseMessages);
  const anchor = useUiStore((s) => s.knowledgeAnchor);
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
    <Modal title={m('title')} subtitle={m('subtitle')} icon="📒" onClose={() => uiStore.getState().close()} width="max-w-5xl" testId="knowledge-base" z="z-[90]" actions={<KnowledgeHeaderControls view={view} onView={setView} />}>
      <CoreLedgerArticle highlight={highlight} view={view} />
    </Modal>
  );
}
