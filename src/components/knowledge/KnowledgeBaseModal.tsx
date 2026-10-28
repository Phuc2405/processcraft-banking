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
  isIntermediate,
  LEDGER_FORMULAS,
  SIDE_RULE,
  SIDE_TITLE,
  type ArticleFlow,
  type BufferJournal,
} from '../../data/knowledgeBase';
import { pick, useLocale, type Locale, type Localized } from '../../i18n/locale';
import { formatMoney } from '../../sim/kpis';
import { GL_CODE, type GlAccount } from '../../sim/staffRoleplay';
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

const th = 'border-b border-slate-700 px-2 py-1 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400';
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
      <div className="text-[10px] font-bold uppercase tracking-wider text-violet-300">{m('advancedTag')}</div>
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
  const balances = advanced ? flow.watch.map((gl) => ({ gl, after: flowBalances(flow, gl) })) : [];
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3" id={kbAnchorId(flow.id)} data-flow={flow.id}>
      <h4 className="text-[13.5px] font-bold text-emerald-200">{pick(flow.title, locale)}</h4>
      <p className="mt-0.5 text-[12px] text-slate-400">{pick(flow.summary, locale)}</p>
      <ol className="mt-2 space-y-2">
        {flow.steps.map((st, i) => (
          <li key={i} className="rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-2" data-step={i + 1}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
              {m('step', { n: i + 1 })}
              {st.instead && <span className="ml-1.5 rounded bg-amber-400/15 px-1 normal-case tracking-normal text-amber-200">{m('stepInstead')}</span>}
            </div>
            <p className="mt-0.5 text-[12.5px] leading-snug text-slate-200">{pick(st.text, locale)}</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[11.5px] tabular-nums">
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
            {balances.map(({ gl, after }) => (
              <div key={gl} className="mt-1 text-[11px] font-semibold text-violet-200" data-balance={gl} data-after={after[i]}>
                {m('balanceAfter', { code: GL_CODE[gl], amount: formatMoney(after[i]!) })}
              </div>
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The article body, separate from the window so it renders (and is tested) on its own. `view` comes from the title bar. */
export function CoreLedgerArticle({ highlight = null, view = 'basic' }: { highlight?: string | null; view?: ViewMode }) {
  const m = useMessages(knowledgeBaseMessages);
  const locale = useLocale();
  const advanced = view === 'advanced';
  const usage = advanced ? glUsage() : null;
  const a = CORE_LEDGER_ARTICLE;
  const lit = (anchor: string): string => (highlight === anchor ? 'ring-2 ring-amber-300/80 rounded-lg' : '');
  const terms = new Map(glossaryTerms(locale).map((t) => [t.key, t]));
  return (
    <article data-testid="kb-article" data-article={a.id} data-view={view} className="text-[13px] leading-relaxed text-slate-200">
      <h3 className="text-[18px] font-extrabold text-slate-50">{pick(a.title, locale)}</h3>
      <p className="mt-1 text-slate-300">{pick(a.intro, locale)}</p>
      <nav aria-label={m('onThisPage')} className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{m('onThisPage')}</div>
        <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {a.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${kbAnchorId(s.id)}`} className="text-[12.5px] text-sky-300 hover:underline">
                {pick(s.title, locale)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {a.sections.map((s) => (
        <section key={s.id} id={kbAnchorId(s.id)} data-section={s.id} className={`mt-5 scroll-mt-2 ${lit(s.id)}`}>
          <h3 className="text-[15px] font-bold text-slate-50">{pick(s.title, locale)}</h3>
          {s.paragraphs.map((p, i) => (
            <p key={i} className="mt-1.5">
              {pick(p, locale)}
            </p>
          ))}
          {advanced && <AdvancedNote id={s.id} paragraphs={s.advanced} locale={locale} />}

          {s.id === 'double-entry' && (
            <>
              <div className="mx-auto mt-3 w-fit rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-center text-[15px] font-black text-emerald-100" data-testid="kb-equation">
                {m('equation')}
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-[12px]" data-testid="kb-rules">
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
                  <table className="w-full min-w-[520px] border-collapse text-[12px]" data-testid="kb-formulas">
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
                      <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-100">
                        {pick(f.title, locale)}
                        {f.risk && <span className="rounded bg-amber-400/15 px-1.5 text-[10px] font-semibold text-amber-200">{m('riskTag')}</span>}
                      </div>
                      <p className="text-[11px] text-slate-400">{pick(f.note, locale)}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {f.accounts.map((gl) => (
                          <span key={gl} className="cursor-help rounded bg-slate-800 px-1.5 font-mono text-[11px] font-bold text-slate-200" title={glName(gl, locale)} data-gl={gl}>
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
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{pick(SIDE_TITLE[side], locale)}</div>
                  <table className={`mt-1 w-full border-collapse text-[12px] ${advanced ? 'min-w-[980px]' : 'min-w-[560px]'}`} data-testid={`kb-accounts-${side}`}>
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
                              <span className="cursor-help rounded bg-amber-400/15 px-1.5 text-[10.5px] font-semibold text-amber-200" title={m('typeIntermediateHint')}>
                                {m('typeIntermediate')}
                              </span>
                            ) : (
                              <span className="rounded bg-slate-800 px-1.5 text-[10.5px] font-semibold text-slate-300">{m('typeOperational')}</span>
                            )}
                          </td>
                          {usage && (
                            <td className={`${td} text-slate-300`} data-col="trigger">
                              {usage[acc.id].scenes.length ? usage[acc.id].scenes.map((sc) => sceneTitle(sc, locale)).join(' · ') : <span className="italic text-slate-500">{m('triggerOpening')}</span>}
                            </td>
                          )}
                          {usage && (
                            <td className={`${td} whitespace-nowrap font-mono text-[11.5px] text-emerald-200`} data-col="entry">
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
                    <span className="mr-2 whitespace-nowrap font-mono text-[12px] font-bold text-amber-200">{GL_CODE[gl]}</span>
                    <span className="font-semibold text-slate-100">{glName(gl, locale)}</span>
                    {INTERMEDIATE_ROLE[gl] && <p className="mt-0.5 text-[12px] text-slate-300">{pick(INTERMEDIATE_ROLE[gl]!, locale)}</p>}
                  </li>
                ))}
              </ul>
              {advanced && (
                <div className="mt-3 grid gap-3 md:grid-cols-2" data-testid="kb-buffers">
                  {BUFFER_MECHANICS.map((b) => (
                    <div key={b.gl} className="rounded-xl border border-violet-400/30 bg-slate-950/60 p-3" data-buffer={b.gl}>
                      <h4 className="text-[13px] font-bold text-violet-100">
                        <span className="mr-2 font-mono text-amber-200">{GL_CODE[b.gl]}</span>
                        {glName(b.gl, locale)}
                      </h4>
                      <dl className="mt-1.5 space-y-1.5 text-[12px]">
                        <div>
                          <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{m('bufferFill')}</dt>
                          <dd className="text-slate-200">
                            {pick(b.fill, locale)} <span className="whitespace-nowrap font-mono text-[11.5px] text-emerald-200">{journalText(b.fillJournal)}</span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{m('bufferDrain')}</dt>
                          <dd className="text-slate-200">
                            {pick(b.drain, locale)} <span className="whitespace-nowrap font-mono text-[11.5px] text-emerald-200">{journalText(b.drainJournal)}</span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{m('bufferControl')}</dt>
                          <dd className="text-slate-300">{pick(b.control, locale)}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
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
                  <table className="w-full min-w-[760px] border-collapse text-[12px]" data-testid="kb-acronyms">
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
                                <span key={gl} className="whitespace-nowrap rounded bg-slate-800 px-1.5 text-[11px]" data-gl={gl}>
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
