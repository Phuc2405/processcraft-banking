import { useEffect, useState } from 'react';
import { accountsOn, CORE_LEDGER_ARTICLE, GL_SIDES, INTERMEDIATE_ACCOUNTS, INTERMEDIATE_ROLE, isIntermediate, SIDE_RULE, SIDE_TITLE, type ArticleFlow } from '../../data/knowledgeBase';
import { pick, useLocale, type Locale } from '../../i18n/locale';
import { GL_CODE, type GlAccount } from '../../sim/staffRoleplay';
import { uiStore, useUiStore } from '../../store/uiStore';
import { message, useMessages } from '../../utils/i18nHelper';
import { analystWorkspaceMessages, type AnalystWorkspaceKey } from '../bank/analystWorkspace.messages';
import { glossaryTerms, glPlain } from '../bank/codeGlossary';
import { Modal } from '../shell/Modal';
import { knowledgeBaseMessages } from './knowledgeBase.messages';

/** The formal account name the ledger sheet uses ("Nostro accounts (correspondents)"). */
const glName = (gl: GlAccount, locale: Locale): string => message(analystWorkspaceMessages, `gl_${gl}` as AnalystWorkspaceKey, undefined, locale);

/** The element id of an anchor inside the article: a section id, `gl-<ID>` or `term-<KEY>`. */
export const kbAnchorId = (anchor: string): string => `kb-${anchor}`;

function FlowCard({ flow, locale }: { flow: ArticleFlow; locale: Locale }) {
  const m = useMessages(knowledgeBaseMessages);
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3" id={kbAnchorId(flow.id)} data-flow={flow.id}>
      <h4 className="text-[13.5px] font-bold text-emerald-200">{pick(flow.title, locale)}</h4>
      <p className="mt-0.5 text-[12px] text-slate-400">{pick(flow.summary, locale)}</p>
      <ol className="mt-2 space-y-2">
        {flow.steps.map((st, i) => (
          <li key={i} className="rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">{m('step', { n: i + 1 })}</div>
            <p className="mt-0.5 text-[12.5px] leading-snug text-slate-200">{pick(st.text, locale)}</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[11.5px] tabular-nums">
              {st.lines.map((l) => (
                <li key={`${l.side}-${l.gl}`} className={`flex min-w-0 items-baseline gap-2 ${l.side === 'cr' ? 'pl-4' : ''}`} data-gl={l.gl} data-side={l.side}>
                  <span className={`shrink-0 font-bold ${l.side === 'dr' ? 'text-sky-300' : 'text-amber-300'}`}>{l.side === 'dr' ? 'Dr' : 'Cr'}</span>
                  <span className="shrink-0 whitespace-nowrap text-slate-400">{GL_CODE[l.gl]}</span>
                  <span className="min-w-0 truncate font-sans text-slate-200" title={glName(l.gl, locale)}>
                    {glName(l.gl, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The article body, separate from the window so it renders (and is tested) on its own. */
export function CoreLedgerArticle({ highlight = null }: { highlight?: string | null }) {
  const m = useMessages(knowledgeBaseMessages);
  const locale = useLocale();
  const a = CORE_LEDGER_ARTICLE;
  const lit = (anchor: string): string => (highlight === anchor ? 'ring-2 ring-amber-300/80 rounded-lg' : '');
  const th = 'border-b border-slate-700 px-2 py-1 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400';
  const td = 'border-b border-slate-800 px-2 py-1 align-top';
  return (
    <article data-testid="kb-article" data-article={a.id} className="text-[13px] leading-relaxed text-slate-200">
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
            </>
          )}

          {s.id === 'accounts' && (
            <div className="mt-3 space-y-3">
              {GL_SIDES.map((side) => (
                <div key={side} className="overflow-x-auto">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{pick(SIDE_TITLE[side], locale)}</div>
                  <table className="mt-1 w-full min-w-[560px] border-collapse text-[12px]" data-testid={`kb-accounts-${side}`}>
                    <thead>
                      <tr>
                        <th className={`${th} w-16`}>{m('colCode')}</th>
                        <th className={th}>{m('colAccount')}</th>
                        <th className={th}>{m('colPlain')}</th>
                        <th className={`${th} w-28`}>{m('colType')}</th>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {s.id === 'intermediate' && (
            <ul className="mt-3 space-y-1.5" data-testid="kb-intermediate">
              {INTERMEDIATE_ACCOUNTS.map((gl) => (
                <li key={gl} className="rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-2.5 py-1.5" data-gl={gl}>
                  <span className="mr-2 whitespace-nowrap font-mono text-[12px] font-bold text-amber-200">{GL_CODE[gl]}</span>
                  <span className="font-semibold text-slate-100">{glName(gl, locale)}</span>
                  {INTERMEDIATE_ROLE[gl] && <p className="mt-0.5 text-[12px] text-slate-300">{pick(INTERMEDIATE_ROLE[gl]!, locale)}</p>}
                </li>
              ))}
            </ul>
          )}

          {s.id === 'flows' && (
            <div className="mt-3 grid gap-3 lg:grid-cols-3" data-testid="kb-flows">
              {a.flows.map((f) => (
                <FlowCard key={f.id} flow={f} locale={locale} />
              ))}
            </div>
          )}

          {s.id === 'glossary' && (
            <dl className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2" data-testid="kb-glossary">
              {glossaryTerms(locale).map((t) => (
                <div key={t.key} id={kbAnchorId(`term-${t.key}`)} data-term={t.key} className={`rounded-md px-1.5 py-0.5 ${highlight === `term-${t.key}` ? 'bg-amber-400/15 ring-2 ring-amber-300/80' : ''}`}>
                  <dt className="inline whitespace-nowrap font-mono font-bold text-sky-200">{t.label}</dt>
                  <dd className="inline text-slate-300"> · {t.meaning}</dd>
                </div>
              ))}
            </dl>
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
  useEffect(() => {
    setHighlight(anchor);
    if (!anchor) return;
    // After the article has laid out, bring the anchor into view.
    const t = window.setTimeout(() => document.getElementById(kbAnchorId(anchor))?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
    return () => window.clearTimeout(t);
  }, [anchor]);
  return (
    <Modal title={m('title')} subtitle={m('subtitle')} icon="📒" onClose={() => uiStore.getState().close()} width="max-w-5xl" testId="knowledge-base" z="z-[90]">
      <CoreLedgerArticle highlight={highlight} />
    </Modal>
  );
}
