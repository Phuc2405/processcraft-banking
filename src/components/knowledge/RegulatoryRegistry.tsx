import { useMemo, useState } from 'react';
import { JURISDICTION_LABEL, KIND_LABEL, regulatorById, searchRegistry, searchRegulators, sourceLink, type Jurisdiction, type RegDocument, type RegKind } from '../../data/regulatoryRegistry';
import { pick, useLocale, type Locale } from '../../i18n/locale';
import { demoActionById, type DemoActionId } from '../../sim/demoActions';
import { demoGroup } from '../../sim/demoGroups';
import { uiStore } from '../../store/uiStore';
import { useMessages } from '../../utils/i18nHelper';
import { runDemo, selectSubProcess } from '../bank/retailOpsActions';
import { knowledgeBaseMessages } from './knowledgeBase.messages';

/**
 * The "Circulars & Decrees" tab: every legal document and standard the project cites, searchable (accents optional, either language,
 * by number, title, topic, issuer or scenario), filterable by type and jurisdiction, each one linked to the demos that show it at work.
 */

const KINDS: readonly RegKind[] = ['law', 'decree', 'decision', 'circular', 'standard', 'basel', 'accounting'];
const PLACES: readonly Jurisdiction[] = ['VN', 'INTL', 'AU'];
const KIND_TONE: Readonly<Record<RegKind, string>> = {
  law: 'border-rose-400/50 bg-rose-400/10 text-rose-200',
  decree: 'border-amber-400/50 bg-amber-400/10 text-amber-200',
  decision: 'border-orange-400/50 bg-orange-400/10 text-orange-200',
  circular: 'border-sky-400/50 bg-sky-400/10 text-sky-200',
  standard: 'border-violet-400/50 bg-violet-400/10 text-violet-200',
  basel: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200',
  accounting: 'border-teal-400/50 bg-teal-400/10 text-teal-200',
};

const scenarioLabel = (id: DemoActionId): string => demoActionById(id).label();

/**
 * An authority label: pure metadata. It names the authority in full on hover and does nothing on click. The way to the document
 * itself is the "Find the official text" link beside it (SourceButton), which opens the text, or a search for its exact number.
 */
export function AuthorityBadge({ short, full, icon = '🏛️', testId }: { short: string; full: string; icon?: string; testId?: string }) {
  return (
    <span title={full} aria-label={`${short}: ${full}`} data-testid={testId} data-badge="authority" className="inline-flex cursor-default select-none items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11.5px] font-semibold text-slate-300">
      <span aria-hidden="true">{icon}</span>
      {short}
    </span>
  );
}

/** The way to a document's official text: a real link, in a new tab, to its own page or to a search for its number on the official portals. */
function SourceButton({ doc, locale }: { doc: RegDocument; locale: Locale }) {
  const m = useMessages(knowledgeBaseMessages);
  const link = sourceLink(doc);
  const number = pick(doc.number, locale);
  const hint = link.direct ? m('legalOpenSource', { number, where: link.where }) : m('legalSearchSource', { number, where: link.where });
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={hint}
      aria-label={`${m('legalFindSource')}: ${hint}`}
      data-testid={`legal-source-${doc.id}`}
      data-direct={link.direct}
      className="inline-flex items-center gap-1 rounded-full border border-sky-400/60 bg-sky-400/10 px-2 py-0.5 text-[11.5px] font-semibold text-sky-100 transition hover:border-sky-300 hover:bg-sky-400/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
    >
      <span aria-hidden="true">🔎</span>
      {m('legalFindSource')}
      <span aria-hidden="true" className="text-[10px] opacity-80">↗</span>
    </a>
  );
}

/** Runs a scenario from the registry: close the Knowledge Base, light its sub-process, and send the case in. */
function openScenario(id: DemoActionId): void {
  uiStore.getState().closeKnowledge();
  selectSubProcess(demoActionById(id).group);
  runDemo(id);
}

function Toggle({ on, onClick, children, testId }: { on: boolean; onClick: () => void; children: React.ReactNode; testId: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} data-testid={testId} className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold transition ${on ? 'border-sky-400 bg-sky-400/20 text-sky-100' : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>
      {children}
    </button>
  );
}

function DocumentCard({ doc, locale, lit }: { doc: RegDocument; locale: Locale; lit: boolean }) {
  const m = useMessages(knowledgeBaseMessages);
  const issuer = regulatorById(doc.issuer);
  const regulator = doc.regulator ? regulatorById(doc.regulator) : undefined;
  return (
    <article id={`kb-legal-${doc.id}`} data-doc={doc.id} className={`min-w-0 scroll-mt-16 rounded-xl border bg-slate-950/60 p-3 ${lit ? 'border-amber-300 ring-2 ring-amber-300/60' : 'border-slate-700'}`}>
      <header className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[12.5px] font-bold text-slate-50">{pick(doc.number, locale)}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${KIND_TONE[doc.kind]}`}>{pick(KIND_LABEL[doc.kind], locale)}</span>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300">{pick(JURISDICTION_LABEL[doc.jurisdiction], locale)}</span>
      </header>
      <h4 className="mt-1.5 break-words text-[15px] font-bold leading-snug text-slate-50">{pick(doc.title, locale)}</h4>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[12.5px]">
        <dt className="text-slate-400">{m('legalIssuer')}</dt>
        <dd className="min-w-0 break-words text-slate-200">{issuer ? `${pick(issuer.name, locale)} (${issuer.short})` : doc.issuer}</dd>
        {regulator && (
          <>
            <dt className="text-slate-400">{m('legalRegulatedBy')}</dt>
            <dd className="min-w-0 break-words text-slate-200">{`${pick(regulator.name, locale)} (${regulator.short})`}</dd>
          </>
        )}
        {doc.issued && (
          <>
            <dt className="text-slate-400">{m('legalIssued')}</dt>
            <dd className="text-slate-200">{doc.issued}</dd>
          </>
        )}
        <dt className="text-slate-400">{m('legalEffective')}</dt>
        <dd className="font-semibold text-emerald-200" data-testid="legal-effective">
          {doc.effective}
        </dd>
        {doc.status && (
          <>
            <dt className="text-slate-400">{m('legalStatus')}</dt>
            <dd className="min-w-0 break-words text-amber-100">{pick(doc.status, locale)}</dd>
          </>
        )}
      </dl>
      <p className="mt-2 text-[13.5px] leading-snug text-slate-200">{pick(doc.summary, locale)}</p>
      <ol className="mt-2 space-y-1 pl-1 text-[13px] leading-snug text-slate-300">
        {doc.keyPoints.map((p, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="w-5 shrink-0 font-mono font-bold text-sky-300">{i + 1}/</span>
            <span className="min-w-0 break-words">{pick(p, locale)}</span>
          </li>
        ))}
      </ol>
      <div className="mt-2.5 border-t border-slate-800 pt-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{m('legalScenarios')}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {doc.scenarios.map((id) => {
            const a = demoActionById(id);
            return (
              <button key={id} type="button" onClick={() => openScenario(id)} title={`${pick(demoGroup(a.group).title, locale)} · ${m('legalRunScenario')}`} data-testid={`legal-scenario-${doc.id}-${id}`} className="max-w-full truncate rounded-lg border border-slate-700 bg-slate-900 px-2 py-0.5 text-left text-[12px] font-semibold text-slate-100 hover:border-sky-400 hover:bg-slate-800">
                <span aria-hidden="true">{a.icon}</span> {a.label()}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`legal-badges-${doc.id}`}>
        <SourceButton doc={doc} locale={locale} />
        {issuer && <AuthorityBadge short={issuer.short} full={pick(issuer.name, locale)} testId={`legal-issuer-${doc.id}`} />}
        {regulator && <AuthorityBadge icon="⚖️" short={regulator.short} full={`${m('legalRegulatedBy')}: ${pick(regulator.name, locale)}`} testId={`legal-regulator-${doc.id}`} />}
      </div>
    </article>
  );
}

export function RegulatoryRegistry({ highlight = null }: { highlight?: string | null }) {
  const m = useMessages(knowledgeBaseMessages);
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<RegKind[]>([]);
  const [places, setPlaces] = useState<Jurisdiction[]>([]);
  const docs = useMemo(() => searchRegistry({ query, kinds, jurisdictions: places }, scenarioLabel), [query, kinds, places]);
  const regulators = useMemo(() => searchRegulators(query), [query]);
  const flip = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const lit = highlight?.startsWith('legal-') ? highlight.slice('legal-'.length) : null;
  return (
    <article data-testid="legal-registry" className="min-w-0 text-[15px] leading-relaxed text-slate-200">
      <h3 className="text-[20px] font-extrabold text-slate-50">{m('legalTitle')}</h3>
      <p className="mt-1 text-slate-300">{m('legalIntro')}</p>

      <div className="sticky top-8 z-[5] -mx-1 mt-3 rounded-xl border border-slate-700 bg-slate-900/95 p-2.5 shadow-lg backdrop-blur" role="search">
        <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-1.5 focus-within:border-sky-400">
          <span aria-hidden="true">🔍</span>
          <span className="sr-only">{m('legalSearchLabel')}</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={m('legalSearchPlaceholder')} data-testid="legal-search" className="min-w-0 flex-1 bg-transparent text-[14px] text-slate-100 placeholder:text-slate-500 focus:outline-none" />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label={m('legalClear')} className="text-[13px] text-slate-400 hover:text-slate-200">
              ✕
            </button>
          )}
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {KINDS.map((k) => (
            <Toggle key={k} on={kinds.includes(k)} onClick={() => setKinds((list) => flip(list, k))} testId={`legal-kind-${k}`}>
              {pick(KIND_LABEL[k], locale)}
            </Toggle>
          ))}
          <span className="mx-1 h-4 w-px bg-slate-700" aria-hidden="true" />
          {PLACES.map((p) => (
            <Toggle key={p} on={places.includes(p)} onClick={() => setPlaces((list) => flip(list, p))} testId={`legal-place-${p}`}>
              {pick(JURISDICTION_LABEL[p], locale)}
            </Toggle>
          ))}
          <span className="ml-auto text-[12px] text-slate-400" role="status" data-testid="legal-count">
            {m('legalCount', { n: docs.length })}
          </span>
        </div>
      </div>

      {docs.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-700 p-4 text-center text-slate-400" data-testid="legal-empty">
          {m('legalNoResults')}
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="legal-results">
          {docs.map((d) => (
            <DocumentCard key={d.id} doc={d} locale={locale} lit={lit === d.id} />
          ))}
        </div>
      )}

      <h3 className="mt-8 text-[18px] font-extrabold text-slate-50">{m('legalRegulators')}</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-[13.5px]" data-testid="legal-regulators">
          <thead>
            <tr>
              <th className="border-b border-slate-700 px-2 py-1 text-left text-[12px] font-semibold uppercase tracking-wider text-slate-400">{m('legalRegulator')}</th>
              <th className="border-b border-slate-700 px-2 py-1 text-left text-[12px] font-semibold uppercase tracking-wider text-slate-400">{m('legalRole')}</th>
              <th className="border-b border-slate-700 px-2 py-1 text-left text-[12px] font-semibold uppercase tracking-wider text-slate-400">{m('legalWebsite')}</th>
            </tr>
          </thead>
          <tbody>
            {regulators.map((r) => (
              <tr key={r.id} data-regulator={r.id}>
                <td className="border-b border-slate-800 px-2 py-1 align-top">
                  <div className="font-semibold text-slate-100">{pick(r.name, locale)}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-400">
                    <AuthorityBadge short={r.short} full={pick(r.name, locale)} /> {pick(JURISDICTION_LABEL[r.jurisdiction], locale)}
                  </div>
                </td>
                <td className="border-b border-slate-800 px-2 py-1 align-top text-slate-300">{pick(r.role, locale)}</td>
                <td className="border-b border-slate-800 px-2 py-1 align-top font-mono text-[12.5px]" data-testid={`legal-website-${r.id}`}>
                  <a href={r.website} target="_blank" rel="noopener noreferrer" title={m('legalOpenWebsite', { name: pick(r.name, locale) })} className="text-sky-300 underline-offset-2 hover:text-sky-200 hover:underline">
                    {r.website.replace(/^https?:\/\//, '')}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-[12.5px] leading-snug text-amber-100" data-testid="legal-disclaimer">
        {m('legalDisclaimer')}
      </p>
    </article>
  );
}
