import { useMemo, type ReactNode } from 'react';
import { useLocale } from '../../i18n/locale';
import { accountDescription, accountName } from '../../sim/plainLanguage';
import { ledgerUi, postingKindLabel } from '../../data/ledgerCopy';
import { CHART_OF_ACCOUNTS, groupByTransaction, isBalanced, trialBalance, type TrialBalance as Trial } from '../../engine/ledger';
import { formatAud } from '../../engine/money';
import type { AccountId, GLEntry } from '../../types/processLearning';
import { useTerms } from '../bank/useTerms';

/**
 * The live double-entry mini ledger: the journal lines a run posted, grouped by payment, and the trial balance that proves
 * the books still add up. Pure display; the lines come from the engine (engine/postings.ts) and are never edited here.
 */

export interface LedgerBatch {
  id: string;
  title: string;
  subtitle?: string;
  entries: readonly GLEntry[];
}

/** One payment's lines as a batch, titled by the payment's id. */
export function batchesFrom(entries: readonly GLEntry[], titleOf?: (txId: string) => { title: string; subtitle?: string }): LedgerBatch[] {
  return [...groupByTransaction(entries)].map(([txId, lines]) => {
    const named = titleOf?.(txId);
    return { id: txId, title: named?.title ?? txId, ...(named?.subtitle !== undefined ? { subtitle: named.subtitle } : {}), entries: lines };
  });
}

function BalancedBadge({ ok, testId }: { ok: boolean; testId?: string }) {
  const ui = ledgerUi();
  return (
    <span
      data-testid={testId}
      data-balanced={ok}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${ok ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/40' : 'bg-rose-400/10 text-rose-300 ring-rose-400/40'}`}
    >
      <span aria-hidden="true">{ok ? '✓' : '✕'}</span>
      {ok ? ui.balanced : ui.outOfBalance}
    </span>
  );
}

function AccountName({ id }: { id: AccountId }) {
  const def = CHART_OF_ACCOUNTS[id];
  const locale = useLocale();
  return (
    <span title={accountDescription(id, locale)} className="block min-w-0 truncate">
      <span className="mr-1.5 font-mono text-[10.5px] text-slate-500">{def.code}</span>
      {accountName(id, locale)}
    </span>
  );
}

/** The memo of a line. The engine writes it in English; in Vietnamese it is rebuilt from the line's kind, accounts and amount. */
function memoOf(entry: GLEntry, locale: string, t: (s: string) => string): string {
  if (locale !== 'vi') return t(entry.memo);
  return `${postingKindLabel(entry.kind)}: Nợ ${CHART_OF_ACCOUNTS[entry.debitAccount].code} ${accountName(entry.debitAccount, 'vi')} / Có ${CHART_OF_ACCOUNTS[entry.creditAccount].code} ${accountName(entry.creditAccount, 'vi')}, ${formatAud(entry.amount)}.`;
}

function Line({ entry }: { entry: GLEntry }) {
  const ui = ledgerUi();
  const terms = useTerms();
  const locale = useLocale();
  const money = formatAud(entry.amount);
  return (
    <li className="rounded-md bg-slate-900/70 px-2.5 py-1.5" data-testid="ledger-line" data-kind={entry.kind}>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <span>{postingKindLabel(entry.kind)}</span>
        <span className="font-mono normal-case tracking-normal text-slate-600">{entry.id}</span>
      </div>
      <div className="mt-1 grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 text-[12px] text-slate-100">
        <span className="rounded bg-sky-400/15 px-1 text-center text-[10.5px] font-bold text-sky-300" title={ui.debit}>
          {ui.debitShort}
        </span>
        <AccountName id={entry.debitAccount} />
        <span className="text-right font-mono tabular-nums" data-testid="ledger-debit">
          {money}
        </span>
        <span className="ml-3 rounded bg-amber-400/15 px-1 text-center text-[10.5px] font-bold text-amber-300" title={ui.credit}>
          {ui.creditShort}
        </span>
        <span className="ml-3 min-w-0">
          <AccountName id={entry.creditAccount} />
        </span>
        <span className="text-right font-mono tabular-nums text-slate-300" data-testid="ledger-credit">
          {money}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-slate-400">{memoOf(entry, locale, terms.t)}</p>
    </li>
  );
}

function Batch({ batch, actions }: { batch: LedgerBatch; actions?: (batch: LedgerBatch) => ReactNode }) {
  const ui = ledgerUi();
  const ok = isBalanced(batch.entries);
  const extra = actions?.(batch);
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5" data-testid="ledger-batch" data-tx={batch.id}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="min-w-0 truncate text-[12.5px] font-semibold text-slate-100">{batch.title}</h4>
        {batch.subtitle && <span className="truncate text-[11px] text-slate-500">{batch.subtitle}</span>}
        <span className="ml-auto text-[11px] text-slate-500">{ui.entries(batch.entries.length)}</span>
        <BalancedBadge ok={ok} />
        {extra}
      </header>
      <ol className="mt-2 space-y-1.5">
        {batch.entries.map((e) => (
          <Line key={e.id} entry={e} />
        ))}
      </ol>
    </section>
  );
}

function TrialBalance({ tb }: { tb: Trial }) {
  const ui = ledgerUi();
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/60" aria-label={ui.trialBalance} data-testid="ledger-trial">
      <header className="flex items-center gap-3 border-b border-slate-800 px-2.5 py-1.5">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ui.trialBalance}</h4>
        <span className="ml-auto">
          <BalancedBadge ok={tb.balanced} testId="ledger-balanced" />
        </span>
      </header>
      <table className="w-full table-fixed text-[12px]">
        <colgroup>
          <col />
          <col className="w-[96px]" />
          <col className="w-[96px]" />
        </colgroup>
        <thead>
          <tr className="text-left text-[10.5px] uppercase tracking-wider text-slate-500">
            <th className="px-2.5 py-1 font-semibold">{ui.account}</th>
            <th className="px-2.5 py-1 text-right font-semibold">{ui.debit}</th>
            <th className="px-2.5 py-1 text-right font-semibold">{ui.credit}</th>
          </tr>
        </thead>
        <tbody>
          {tb.rows.map((r) => (
            <tr key={r.account} className="border-t border-slate-800/70 text-slate-200">
              <td className="px-2.5 py-1">
                <AccountName id={r.account} />
              </td>
              <td className="px-2.5 py-1 text-right font-mono tabular-nums">{r.debit > 0 ? formatAud(r.debit) : ''}</td>
              <td className="px-2.5 py-1 text-right font-mono tabular-nums">{r.credit > 0 ? formatAud(r.credit) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-700 font-semibold text-slate-100">
            <td className="px-2.5 py-1.5">
              {ui.totalDebits} / {ui.totalCredits}
            </td>
            <td className="px-2.5 py-1.5 text-right font-mono tabular-nums" data-testid="ledger-total-debits">
              {formatAud(tb.totalDebits)}
            </td>
            <td className="px-2.5 py-1.5 text-right font-mono tabular-nums" data-testid="ledger-total-credits">
              {formatAud(tb.totalCredits)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

/**
 * The journal, then the trial balance. Shows `empty` when there is nothing to show. Pass `trial` when the batches are only the latest
 * lines and the balance should cover more. `split` puts the trial balance beside the
 * journal on a wide screen (the results drawer); the default stacks them (a narrow card).
 */
export function LedgerView({ batches, empty, split = false, trial, actions }: { batches: readonly LedgerBatch[]; empty?: string; split?: boolean; trial?: Trial; actions?: (batch: LedgerBatch) => ReactNode }) {
  const ui = ledgerUi();
  const all = useMemo(() => batches.flatMap((b) => b.entries), [batches]);
  // The trial balance covers every line unless the caller has one for lines it is not showing (the Living Bank shows only the latest).
  const tb = useMemo(() => trial ?? trialBalance(all), [trial, all]);
  if (all.length === 0) {
    return (
      <p className="text-[12px] leading-relaxed text-slate-400" data-testid="ledger-empty">
        {empty ?? ui.empty}
      </p>
    );
  }
  return (
    <div className={split ? 'grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_440px]' : 'space-y-2.5'} data-testid="ledger-view">
      <div className="space-y-2.5">{batches.map((b) => (b.entries.length > 0 ? <Batch key={b.id} batch={b} {...(actions ? { actions } : {})} /> : null))}</div>
      <TrialBalance tb={tb} />
    </div>
  );
}
