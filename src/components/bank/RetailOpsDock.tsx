import { useState } from 'react';
import { formatAud } from '../../engine/money';
import { pick, useLocale } from '../../i18n/locale';
import { useMessages } from '../../utils/i18nHelper';
import { retailOpsMessages } from './retailOps.messages';
import { PLACE_BOX } from '../../engine/plan/layout';
import { cassetteStatus, OPS_ACCOUNTS, OPS_LIMITS, opsAccount, opsNatural, opsTrial, type OpsLine, type OpsOutcome, type OpsStatus } from '../../sim/retailOps';
import { useBankStore } from '../../store/bankStore';
import { retailOpsStore, useRetailOpsStore } from '../../store/retailOpsStore';
import { opsStamp } from './retailOpsActions';

/** The retail operations journal: what the latest demo did in plain words and which retail accounts it moved, shown inside the transaction inspector. */

const STATUS: Record<OpsStatus, { en: string; vi: string; tone: string }> = {
  APPROVED: { en: 'Approved', vi: 'Chấp thuận', tone: 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/50' },
  DECLINED: { en: 'Declined', vi: 'Từ chối', tone: 'bg-rose-400/15 text-rose-200 ring-rose-400/50' },
  HELD: { en: 'Held', vi: 'Tạm giữ', tone: 'bg-amber-400/15 text-amber-200 ring-amber-400/50' },
  ALERT: { en: 'Alert', vi: 'Cảnh báo', tone: 'bg-amber-400/15 text-amber-200 ring-amber-400/50' },
  BLOCKED: { en: 'Refused', vi: 'Không thực hiện', tone: 'bg-slate-700 text-slate-200 ring-slate-500' },
};

/** A journal's lines, debits first, indented on the credit side. */
export function OpsLines({ lines, testId }: { lines: readonly OpsLine[]; testId?: string }) {
  const m = useMessages(retailOpsMessages);
  const locale = useLocale();
  return (
    <ul className="space-y-0.5 font-mono text-[11.5px] tabular-nums" data-testid={testId}>
      {lines.map((l, i) => {
        const a = opsAccount(l.account);
        const debit = l.dr > 0;
        return (
          <li key={i} className={`flex min-w-0 items-baseline gap-2 ${debit ? '' : 'pl-4'}`} data-account={l.account} data-side={debit ? 'dr' : 'cr'} data-code={a.code} data-amount={debit ? l.dr : l.cr}>
            <span className={`shrink-0 font-bold ${debit ? 'text-sky-300' : 'text-amber-300'}`}>{debit ? m('dr') : m('cr')}</span>
            <span className="shrink-0 text-slate-400">{a.code}</span>
            <span className="min-w-0 flex-1 truncate font-sans text-slate-200" title={pick(a.plain, locale)}>
              {pick(a.name, locale)}
            </span>
            <span className="shrink-0 text-slate-100">{formatAud(debit ? l.dr : l.cr)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ResultCard({ outcome }: { outcome: OpsOutcome }) {
  const m = useMessages(retailOpsMessages);
  const locale = useLocale();
  const s = STATUS[outcome.status];
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-2" data-testid="ops-result" data-status={outcome.status} data-rc={outcome.rc} data-action={outcome.action}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-1.5 text-[10.5px] font-bold ring-1 ${s.tone}`}>
          {pick(s, locale)}
          {outcome.rc ? ` · RC ${outcome.rc}` : ''}
        </span>
        {outcome.journal && (
          <span className="font-mono text-[10.5px] text-slate-500">
            {outcome.journal.id} · {outcome.journal.at}
          </span>
        )}
        {outcome.clearing && (
          <span className="rounded bg-sky-500/15 px-1.5 text-[10.5px] font-semibold text-sky-200" data-testid="ops-sla" data-within={outcome.clearing.withinSla}>
            {m('clearedInSSlaS', {seconds: (outcome.clearing.elapsedMs / 1000).toFixed(1), sla: outcome.clearing.slaMs / 1000 })}
          </span>
        )}
        {outcome.ctrRequired && <span className="rounded bg-amber-400/15 px-1.5 text-[10.5px] font-semibold text-amber-200">{m('largeCashReportDue')}</span>}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-slate-200" data-testid="ops-explanation">
        {pick(outcome.message, locale)}
      </p>
      {outcome.customer && (
        <p className="mt-0.5 text-[11px] text-slate-400" data-testid="ops-customer" data-after={outcome.customer.after}>
          {m('customerBalance')}: {formatAud(outcome.customer.before)} → <span className={outcome.customer.after < 0 ? 'font-bold text-rose-300' : 'text-slate-200'}>{outcome.customer.after < 0 ? `-${formatAud(-outcome.customer.after)}` : formatAud(outcome.customer.after)}</span>
        </p>
      )}
      {outcome.journal ? (
        <div className="mt-1">
          <OpsLines lines={outcome.journal.lines} testId="ops-journal-lines" />
        </div>
      ) : (
        <p className="mt-1 text-[11px] italic text-slate-500">{m('noJournalPosts')}</p>
      )}
    </div>
  );
}

/** The mandatory transfer: it can be done but not dismissed, and the counter stays locked until it is. */
function VaultPromptCard() {
  const m = useMessages(retailOpsMessages);
  const prompt = useRetailOpsStore((s) => s.book.vaultPrompt);
  if (!prompt) return null;
  return (
    <div role="alertdialog" aria-label={m('vaultTransferRequired')} className="rounded-lg border border-amber-300/60 bg-amber-950/70 px-2.5 py-2" data-testid="ops-vault-prompt">
      <p className="text-[12px] font-bold text-amber-100">⚠️ {m('tillOverItsLimitVault')}</p>
      <p className="mt-0.5 text-[11.5px] leading-snug text-amber-50/90">
        {m('theTillHoldsAgainstA', {till: formatAud(prompt.tillCents), limit: formatAud(OPS_LIMITS.tillLimitCents), surplus: formatAud(prompt.surplusCents) })}
      </p>
      <button type="button" onClick={() => retailOpsStore.getState().transferToVault(opsStamp())} data-testid="ops-vault-transfer" className="mt-1.5 rounded-lg bg-amber-400 px-3 py-1 text-[12px] font-bold text-amber-950 hover:bg-amber-300">
        {m('transferToTheVault', {surplus: formatAud(prompt.surplusCents) })}
      </button>
    </div>
  );
}

function TicketList() {
  const m = useMessages(retailOpsMessages);
  const open = useRetailOpsStore((s) => s.book.tickets).filter((t) => t.status === 'OPEN');
  if (!open.length) return null;
  const resolve = retailOpsStore.getState().resolveTicket;
  return (
    <ul className="space-y-1" data-testid="ops-tickets">
      {open.map((t) => (
        <li key={t.id} className="rounded-lg border border-rose-400/30 bg-rose-950/30 px-2.5 py-1.5 text-[11.5px] text-rose-50" data-ticket={t.id}>
          <div className="font-semibold">
            🧾 {t.id} · {formatAud(t.amountCents)} · {t.openedAt}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <button type="button" onClick={() => resolve(t.id, 'REFUNDED', opsStamp())} data-testid="ops-ticket-refund" className="rounded bg-slate-800 px-2 py-0.5 font-semibold text-slate-100 hover:bg-slate-700">
              {m('cashCountNotesStayedRefund')}
            </button>
            <button type="button" onClick={() => resolve(t.id, 'DISPENSED', opsStamp())} data-testid="ops-ticket-dispensed" className="rounded bg-slate-800 px-2 py-0.5 font-semibold text-slate-100 hover:bg-slate-700">
              {m('cashCountCustomerTookThem')}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CassetteGauge() {
  const m = useMessages(retailOpsMessages);
  const status = cassetteStatus(useRetailOpsStore((s) => s.book));
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-slate-300" data-testid="ops-cassette" data-low={status.low}>
      <span className="font-semibold">{m('cassette')}</span>
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
        <span className={`block h-full ${status.low ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(100, status.pct)}%` }} />
      </span>
      <span className="tabular-nums">{status.pct}%</span>
      {status.drill && <span className="rounded bg-amber-400/15 px-1 text-[10.5px] font-semibold text-amber-200">{m('sensorDrill')}</span>}
      <button type="button" onClick={() => retailOpsStore.getState().refillCassette(opsStamp())} data-testid="ops-cassette-refill" className="rounded bg-slate-800 px-2 py-0.5 font-semibold text-slate-100 hover:bg-slate-700">
        🚚 {m('citRefill')}
      </button>
    </div>
  );
}

function BookTable() {
  const locale = useLocale();
  const balances = useRetailOpsStore((s) => s.book.balances);
  return (
    <ul className="space-y-0.5 text-[11.5px]" data-testid="ops-book">
      {OPS_ACCOUNTS.map((a) => (
        <li key={a.id} className="flex min-w-0 items-baseline gap-1.5" data-account={a.id} data-balance={opsNatural(a.id, balances[a.id])}>
          <span className="shrink-0 font-mono text-slate-400">{a.code}</span>
          <span className="min-w-0 flex-1 truncate text-slate-300" title={pick(a.plain, locale)}>
            {pick(a.name, locale)}
          </span>
          <span className="shrink-0 font-mono tabular-nums text-slate-100">{formatAud(opsNatural(a.id, balances[a.id]))}</span>
        </li>
      ))}
    </ul>
  );
}

/** The retail book's block in the inspector: the latest result in plain words with its Dr/Cr lines, and what the desk still has to do. `txId`, when given, names the payment the inspector is on. */
export function RetailOpsSection({ txId }: { txId?: string }) {
  const m = useMessages(retailOpsMessages);
  const flow = useBankStore((s) => s.flow);
  const last = useRetailOpsStore((s) => s.last);
  const lastTxId = useRetailOpsStore((s) => s.lastTxId);
  const book = useRetailOpsStore((s) => s.book);
  const [showBook, setShowBook] = useState(false);
  const trial = opsTrial(book);
  // A payment sent from elsewhere (the Academy's "Simulate this Flow") is not on this book, so the latest demo is not its explanation.
  const linked = txId === undefined || lastTxId === txId;
  return (
    <div className="flex flex-col gap-1.5" data-testid="ops-journal" data-balanced={trial.balanced}>
      <VaultPromptCard />
      {linked && last ? <ResultCard outcome={last} /> : <p className="text-[12px] leading-snug text-slate-400" data-testid="ops-unlinked">{m('notOnRetailBook')}</p>}
      {trial.suspenseOpenCents > 0 && <p className="text-[11px] font-semibold text-amber-200">{m('tkOpen', { amount: formatAud(trial.suspenseOpenCents) })}</p>}
      {flow === 3 && <CassetteGauge />}
      <TicketList />
      {flow === 6 && (
        <div className="text-[11.5px] text-slate-300" data-testid="ops-till" data-till={book.balances.CASH_TILL}>
          {m('till')}: <span className="font-mono tabular-nums text-slate-100">{formatAud(book.balances.CASH_TILL)}</span> / {formatAud(OPS_LIMITS.tillLimitCents)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
        <span className={trial.balanced ? 'text-emerald-300' : 'text-rose-300'} data-testid="ops-trial">
          {trial.balanced ? m('balanced') : m('outOfBalance')}
        </span>
        <span className="tabular-nums">{m('journals', { n: book.posted })}</span>
        <span className="ml-auto flex gap-0.5">
          <button type="button" onClick={() => setShowBook((b) => !b)} aria-pressed={showBook} data-testid="ops-book-toggle" className="rounded px-1 hover:bg-slate-800 hover:text-slate-100">
            {m('balances')}
          </button>
          <button type="button" onClick={() => retailOpsStore.getState().reset()} data-testid="ops-reset" className="rounded px-1 hover:bg-slate-800 hover:text-slate-100">
            {m('reset')}
          </button>
        </span>
      </div>
      {showBook && <BookTable />}
    </div>
  );
}

/** The warning on the 2D map's ATM while its cassette is under 15%, whichever view the learner is in. */
export function AtmCassetteBadge() {
  const m = useMessages(retailOpsMessages);
  const status = cassetteStatus(useRetailOpsStore((s) => s.book));
  if (!status.low) return null;
  const box = PLACE_BOX.ATM_CASH;

  return (
    <div className="pointer-events-none absolute z-30 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-amber-300/70 bg-amber-950/95 px-2 py-0.5 text-[10.5px] font-bold text-amber-100 shadow-lg" style={{ left: box.cx - box.w / 2, top: box.cy - box.h / 2 }} role="status" data-testid="atm-low-badge">
      🔔 {m('cassette2', {pct: status.pct })}
    </div>
  );
}
