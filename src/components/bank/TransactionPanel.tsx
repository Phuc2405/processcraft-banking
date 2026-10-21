import { tr } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { Fragment, type ReactNode } from 'react';
import { formatAud } from '../../engine/money';
import { postingKindLabel } from '../../data/ledgerCopy';
import type { PostingKind } from '../../types/processLearning';
import { journalLines, journalText, plainFacts, rawMessage, responseCodeFor, type ResponseCode } from '../../sim/isoMessages';
import { scenarioShort } from '../../sim/scenarios';
import { formatClock } from '../../sim/clock';
import type { PacketTrace } from '../../sim/types';
import { dataDepthOf, useBankStore } from '../../store/bankStore';
import { useTerms } from './useTerms';

/**
 * The inspector for a payment the learner sent with a preset action. It follows the payment desk by desk, and shows it at
 * the chosen data depth:
 *
 *   Standard   plain cards: Status, Amount, Hold Amount, Latency
 *   Expert     the ISO 8583 response code, the raw message as syntax-highlighted JSON, and the core banking GL journal
 */

const TONE_BADGE: Record<ResponseCode['tone'], string> = {
  good: 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/50',
  bad: 'bg-rose-400/15 text-rose-200 ring-rose-400/50',
  pending: 'bg-slate-700/70 text-slate-200 ring-slate-500/50',
};

const TONE_TEXT = { good: 'text-emerald-300', bad: 'text-rose-300', pending: 'text-sky-300' } as const;

/** JSON with its keys, strings, numbers and literals coloured. Built from tokens, never from HTML. */
function JsonBlock({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  const parts: ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      parts.push(
        <span key={k++} className={m[2] ? 'text-sky-300' : 'text-amber-200'}>
          {m[1]}
        </span>,
      );
      if (m[2]) parts.push(m[2]);
    } else if (m[3] !== undefined) {
      parts.push(
        <span key={k++} className="text-fuchsia-300">
          {m[3]}
        </span>,
      );
    } else {
      parts.push(
        <span key={k++} className="text-lime-300">
          {m[4]}
        </span>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <pre className="bk-scroll max-h-[300px] overflow-auto rounded-lg border border-slate-800 bg-[#050810] p-2.5 font-mono text-[11px] leading-[1.5] text-slate-300" data-testid="tx-json">
      {parts}
    </pre>
  );
}

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="mt-4" data-testid={testId}>
      <h3 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

function Route({ trace }: { trace: PacketTrace }) {
  const terms = useTerms();
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11px]" data-testid="tx-route">
      {trace.route.map((place, i) => {
        const state = trace.done || i < trace.at ? 'done' : i === trace.at ? 'here' : 'next';
        return (
          <Fragment key={`${place}-${i}`}>
            {i > 0 && <span className="text-slate-600" aria-hidden="true">→</span>}
            <li
              className={`rounded-full px-2 py-0.5 ring-1 ${state === 'here' ? 'animate-pulse bg-sky-400/15 text-sky-100 ring-sky-400/60' : state === 'done' ? 'bg-slate-800 text-slate-200 ring-slate-700' : 'text-slate-500 ring-slate-800'}`}
              data-state={state}
              title={trace.stops[i]?.note}
            >
              {terms.place(place)}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function Standard({ trace }: { trace: PacketTrace }) {
  return (
    <Section title={t('What happened')} testId="tx-standard">
      <dl className="grid grid-cols-2 gap-2">
        {plainFacts(trace).map((f) => (
          <div key={f.label} className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2">
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{f.label}</dt>
            <dd className={`mt-0.5 text-[13px] font-semibold ${f.tone ? TONE_TEXT[f.tone] : 'text-slate-100'}`}>{f.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function Expert({ trace }: { trace: PacketTrace }) {
  const rc = responseCodeFor(trace);
  const lines = journalLines(trace);
  return (
    <>
      <Section title={tr({ en: `${rc.scheme} response`, vi: `Phản hồi ${rc.scheme}` })} testId="tx-rc">
        <span className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1 font-mono text-[12.5px] font-bold ring-1 ${TONE_BADGE[rc.tone]}`} data-testid="tx-rc-badge" data-code={rc.code}>
          RC: {rc.code} <span className="font-sans font-semibold">{rc.text}</span>
        </span>
        <span className="ml-2 text-[11px] text-slate-500">{tr({ en: `latency ${Math.round(trace.plan.latencyMs)} ms`, vi: `độ trễ ${Math.round(trace.plan.latencyMs)} ms` })}</span>
      </Section>
      <Section title={trace.kind === 'A2A' ? t('Raw message (pacs.008)') : trace.done ? t('Raw message (ISO 8583 0110)') : t('Raw message (ISO 8583 0100)')}>
        <JsonBlock value={rawMessage(trace)} />
      </Section>
      <Section title={t('Core banking GL journal')} testId="tx-journal">
        {lines.length === 0 ? (
          <p className="text-[12px] text-slate-500">{t('Nothing posted yet: the ledger writes when the payment reaches the desk that books it.')}</p>
        ) : (
          <ul className="space-y-1.5">
            {lines.map((l, i) => (
              <li key={i} className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5" title={l.memo}>
                <div className="font-mono text-[11px] leading-snug text-slate-200" data-testid="tx-journal-line">
                  <span className="font-bold text-emerald-300">{t('DR:')}</span> {l.debit.code}-{l.debit.name} {formatAud(l.amountCents)} <span className="text-slate-600">|</span> <span className="font-bold text-rose-300">{t('CR:')}</span> {l.credit.code}-{l.credit.name} {formatAud(l.amountCents)}
                </div>
                <div className="mt-0.5 text-[10.5px] uppercase tracking-wide text-slate-500">{postingKindLabel(l.kind as PostingKind)}</div>
                <span className="sr-only">{journalText(l)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

export function TransactionPanel({ id }: { id: string }) {
  const trace = useBankStore((s) => (s.presetTrace?.id === id ? s.presetTrace : null));
  const depth = useBankStore(dataDepthOf);
  const clear = useBankStore((s) => s.clearSelection);
  const setDepth = useBankStore((s) => s.setDataDepth);
  const rc = trace ? responseCodeFor(trace) : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="tx-panel" data-depth={depth} data-done={trace?.done ?? undefined}>
      <header className="shrink-0 border-b border-slate-800 bg-gradient-to-b from-sky-500/10 to-transparent p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">{t('Your payment')}{trace ? ` · ${trace.id}` : ''}</div>
            <h2 className="mt-0.5 text-[16px] font-bold leading-tight text-slate-50" data-testid="inspector-title">
              {trace ? `${scenarioShort(trace.scenario) || t('Payment')} · ${formatAud(trace.amountCents)}` : t('Payment')}
            </h2>
            {trace && <div className="mt-0.5 text-[11px] text-slate-400">{tr({ en: `Arrived ${formatClock(trace.bornMinute)}`, vi: `Đến lúc ${formatClock(trace.bornMinute)}` })}</div>}
          </div>
          <button type="button" onClick={clear} aria-label={t('Close the inspector')} data-testid="inspector-close" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-800 hover:text-white">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          </button>
        </div>
        {rc && (
          <div className={`mt-2 text-[12px] font-semibold ${TONE_TEXT[rc.tone]}`} role="status">
            {rc.tone === 'pending'
              ? t('On its way through the bank…')
              : depth === 'expert'
                ? `RC ${rc.code} · ${rc.text}`
                : rc.tone === 'good'
                  ? t('Done: approved')
                  : tr({ en: `Done: declined (${rc.text.toLowerCase()})`, vi: `Xong: bị từ chối (${rc.text})` })}
          </div>
        )}
      </header>
      <div className="bk-scroll min-h-0 flex-1 overflow-y-auto p-3.5">
        {!trace ? (
          <p className="text-[12.5px] leading-relaxed text-slate-400">{t('This payment is not part of the bank any more: the day was replayed or a new day began. Send another with the buttons at the bottom of the map.')}</p>
        ) : (
          <>
            <Section title={t('Route')}>
              <Route trace={trace} />
            </Section>
            {depth === 'expert' ? <Expert trace={trace} /> : <Standard trace={trace} />}
            <p className="mt-4 text-[11px] leading-snug text-slate-500">
              {depth === 'expert' ? t('Want it in plain English? ') : t('Want the raw ISO 8583 message and the GL journal? ')}
              <button type="button" onClick={() => setDepth(depth === 'expert' ? 'standard' : 'expert')} className="font-semibold text-sky-300 underline-offset-2 hover:underline" data-testid="tx-depth-toggle">
                {depth === 'expert' ? t('Switch to Standard') : t('Switch to Expert')}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
