import { useMemo } from 'react';
import { ledgerUi } from '../../data/ledgerCopy';
import { everyTransactionBalances } from '../../engine/ledger';
import { formatClock } from '../../sim/clock';
import { useBankStore } from '../../store/bankStore';
import { batchesFrom, LedgerView, type LedgerBatch } from '../ledger/LedgerView';

/** The bank's clock as a minute of the day, read back off a line's timestamp (see `BankSimulation.postLines`). */
const minuteOf = (timestamp: number): number => Math.round((timestamp % 86_400_000) / 60_000);

/**
 * The Live Double-Entry Mini Ledger. A drawer over the map showing the latest journal lines, newest payment first, and the
 * trial balance for the whole day. It only reads `view.ledger`; the lines are written by the simulation as payments finish.
 */
export function LedgerDrawer() {
  const open = useBankStore((s) => s.ledgerOpen);
  const touring = useBankStore((s) => s.spotlight !== null);
  // The inspector floats over the right edge: the ledger keeps clear of it instead of hiding behind it.
  const inspecting = useBankStore((s) => s.selection.kind !== 'none');
  const inspectorWidth = useBankStore((s) => s.inspectorWidth);
  const close = useBankStore((s) => s.closeLedger);
  const ledger = useBankStore((s) => s.view.ledger);
  const ui = ledgerUi().bank;

  const batches = useMemo<LedgerBatch[]>(() => {
    // `recent` is newest first; group it oldest first so each payment's lines read in the order they were posted, then flip the payments.
    const chronological = [...ledger.recent].reverse();
    return batchesFrom(chronological, (txId) => {
      const first = chronological.find((e) => e.txId === txId);
      // A payment's title says what it was for ("🛒 Supermarket Groceries ($62.80)"); its id stays in the subtitle so it can still be traced.
      const what = ledger.scenarios[txId];
      const posted = first ? ui.postedAt(formatClock(minuteOf(first.timestamp))) : '';
      return what ? { title: what, subtitle: [ui.payment(txId), posted].filter(Boolean).join(' · ') } : { title: ui.payment(txId), ...(posted ? { subtitle: posted } : {}) };
    }).reverse();
  }, [ledger.recent, ledger.scenarios, ui]);

  const everyOneBalances = useMemo(() => everyTransactionBalances(ledger.recent), [ledger.recent]);

  if (!open || touring) return null;

  return (
    <aside
      // Beside the inspector, whatever width the learner has dragged it to.
      style={{ right: inspecting ? inspectorWidth + 12 : 12 }}
      className={`absolute bottom-3 left-3 z-20 flex max-h-[62%] min-h-0 flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950/95 shadow-2xl`}
      aria-label={ui.title}
      data-testid="bank-ledger"
      data-balanced={ledger.trial.balanced && everyOneBalances}
    >
      <header className="flex items-start gap-3 border-b border-slate-800 px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-semibold text-slate-50">{ui.title}</h3>
          <p className="mt-0.5 text-[11.5px] leading-snug text-slate-400">{ui.lede}</p>
        </div>
        <span className="mt-0.5 whitespace-nowrap text-[11px] text-slate-400" data-testid="bank-ledger-summary">
          {ui.summary(ledger.payments, ledger.lines)}
        </span>
        <button type="button" onClick={close} aria-label={ui.close} title={ui.close} data-testid="bank-ledger-close" className="rounded-md px-2 py-0.5 text-[16px] leading-none text-slate-400 transition hover:bg-slate-800 hover:text-slate-100">
          ×
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {ledger.lines === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-slate-400" data-testid="bank-ledger-quiet">
            {ui.quiet}
          </p>
        ) : (
          <>
            <p className="mb-2.5 text-[11.5px] text-slate-500" data-testid="bank-ledger-showing">
              {ui.showing(ledger.recent.length, ledger.lines)} {ledger.trial.balanced && everyOneBalances ? ui.allBalance : ''}
            </p>
            <LedgerView batches={batches} trial={ledger.trial} split />
          </>
        )}
      </div>
    </aside>
  );
}

/** The header button that opens the drawer. The dot says at a glance whether the day's books agree. */
export function LedgerButton() {
  const open = useBankStore((s) => s.ledgerOpen);
  const toggle = useBankStore((s) => s.toggleLedger);
  const lines = useBankStore((s) => s.view.ledger.lines);
  const balanced = useBankStore((s) => s.view.ledger.trial.balanced);
  const ui = ledgerUi().bank;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={open}
      title={ui.buttonTitle}
      data-testid="bank-ledger-toggle"
      className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium ring-1 transition ${open ? 'bg-slate-700 text-white ring-slate-500' : 'text-slate-300 ring-slate-700 hover:bg-slate-800'}`}
    >
      <span className={`h-2 w-2 rounded-full ${balanced ? 'bg-emerald-400' : 'bg-rose-400'}`} aria-hidden="true" />
      {ui.button}
      <span className="tabular-nums text-slate-500" data-testid="bank-ledger-count">
        {lines}
      </span>
    </button>
  );
}
