import { useMemo, useState } from 'react';
import { tr } from '../../i18n/locale';
import { localizeScenarioText } from '../../sim/scenarios';
import { formatAud } from '../../engine/money';
import { ledgerUi } from '../../data/ledgerCopy';
import { everyTransactionBalances } from '../../engine/ledger';
import { formatClock } from '../../sim/clock';
import { useBankStore } from '../../store/bankStore';
import { batchesFrom, LedgerView, type LedgerBatch } from '../ledger/LedgerView';
import { useBelowDock, useRightInset, useTopBand } from './ViewportControls';

/** The amount a batch owes the merchant side (credits to 2110): what a chargeback would reverse. 0 when it is not a card purchase. */
export const disputableCents = (batch: LedgerBatch): number =>
  /(-CB|-CLR|-RF)$|~\d+$|^tx_/.test(batch.id) ? 0 : batch.entries.filter((e) => e.creditAccount === 'CARD_CLEARING_PAYABLE').reduce((n, e) => n + e.amount, 0);

/** [⚖️ Dispute Transaction] on a card purchase in the live ledger: two clicks (ask, confirm) raise a chargeback 2110 → 2010. */
function DisputeAction({ batch }: { batch: LedgerBatch }) {
  const disputed = useBankStore((s) => s.view.disputed.includes(batch.id));
  const dayOver = useBankStore((s) => s.view.dayOver);
  const dispute = useBankStore((s) => s.disputeTransaction);
  const [confirming, setConfirming] = useState(false);
  const amount = disputableCents(batch);
  if (amount <= 0) return null;
  if (disputed) {
    return (
      <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10.5px] font-bold text-amber-200 ring-1 ring-amber-400/40" data-testid="ledger-disputed">
        ⚖️ {tr({ en: 'Charged back', vi: 'Đã tra soát' })}
      </span>
    );
  }
  if (confirming) {
    return (
      <span className="flex items-center gap-1" data-testid="ledger-dispute-confirm">
        <button
          type="button"
          onClick={() => {
            dispute(batch.id);
            setConfirming(false);
          }}
          className="rounded-md bg-rose-500 px-2 py-0.5 text-[10.5px] font-bold text-white hover:bg-rose-400"
          data-testid="ledger-dispute-yes"
          title={tr({ en: `Post DR 2110 / CR 2010 ${formatAud(amount)}`, vi: `Ghi Nợ 2110 / Có 2010 ${formatAud(amount)}` })}
        >
          {tr({ en: `Reverse ${formatAud(amount)}`, vi: `Đảo ${formatAud(amount)}` })}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-1.5 py-0.5 text-[10.5px] text-slate-400 hover:bg-slate-800 hover:text-slate-100">
          {tr({ en: 'Cancel', vi: 'Hủy' })}
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      disabled={dayOver}
      data-testid="ledger-dispute"
      title={tr({
        en: 'The cardholder disputes this purchase: reverse the amount owed to the merchant (2110 Merchant Payout) back to the customer’s account (2010 CASA)',
        vi: 'Chủ thẻ khiếu nại giao dịch này: đảo số tiền phải trả cửa hàng (2110) về tài khoản thanh toán của khách (2010)',
      })}
      className="rounded-md bg-slate-800 px-2 py-0.5 text-[10.5px] font-semibold text-amber-200 ring-1 ring-amber-400/40 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
    >
      ⚖️ {tr({ en: 'Dispute Transaction', vi: 'Khiếu nại giao dịch' })}
    </button>
  );
}

/** The bank's clock as a minute of the day, read back off a line's timestamp (see `BankSimulation.postLines`). */
const minuteOf = (timestamp: number): number => Math.round((timestamp % 86_400_000) / 60_000);

/** The Live Double-Entry Mini Ledger. */
export function LedgerDrawer() {
  const open = useBankStore((s) => s.ledgerOpen);
  const touring = useBankStore((s) => s.spotlight !== null);
  // The inspector and the zoom toolbar float over the right edge: the ledger keeps clear of them instead of hiding behind them.
  const rightInset = useRightInset();
  const belowDock = useBelowDock();
  const close = useBankStore((s) => s.closeLedger);
  const ledger = useBankStore((s) => s.view.ledger);
  const ui = ledgerUi().bank;
  const dockHeight = useTopBand((s) => (s.demoDock ? s.demoDock.bottom - s.demoDock.top : 0));
  const bottom = dockHeight ? dockHeight + 8 : 12;

  const batches = useMemo<LedgerBatch[]>(() => {
    // `recent` is newest first; group it oldest first so each payment's lines read in the order they were posted, then flip the payments.
    const chronological = [...ledger.recent].reverse();
    return batchesFrom(chronological, (txId) => {
      const first = chronological.find((e) => e.txId === txId);
      // A payment's title says what it was for ("🛒 Supermarket Groceries ($62.80)"); its id stays in the subtitle so it can still be traced.
      const what = localizeScenarioText(ledger.scenarios[txId] ?? '');
      const posted = first ? ui.postedAt(formatClock(minuteOf(first.timestamp))) : '';
      return what ? { title: what, subtitle: [ui.payment(txId), posted].filter(Boolean).join(' · ') } : { title: ui.payment(txId), ...(posted ? { subtitle: posted } : {}) };
    }).reverse();
  }, [ledger.recent, ledger.scenarios, ui]);

  const everyOneBalances = useMemo(() => everyTransactionBalances(ledger.recent), [ledger.recent]);

  if (!open || touring) return null;

  return (
    <aside
      // Clear of the inspector and the zoom toolbar, whatever width the learner has dragged it to, and on top of the demo bar, whatever height it takes.
      style={{ right: rightInset + 8, bottom, maxHeight: `min(62%, calc(100% - ${bottom + belowDock}px))` }}
      className={`absolute left-3 z-[41] flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950/95 shadow-2xl`}
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
            <LedgerView batches={batches} trial={ledger.trial} split actions={(b) => <DisputeAction batch={b} />} />
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
