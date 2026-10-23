import { tr } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { useState } from 'react';
import { formatClock } from '../../sim/clock';
import { formatMoney, formatPct, pct, pnl } from '../../sim/kpis';
import { isStation } from '../../sim/topology';
import type { AlertView, DayReport, FeedEntry } from '../../sim/types';
import { useBankStore } from '../../store/bankStore';
import { SEVERITY_BOX, SEVERITY_DOT, SEVERITY_TEXT, SectionTitle, Stat } from './ui';
import { useTerms } from './useTerms';
import { eventText } from '../../sim/traffic';
import { feedText } from '../../i18n/feedVi';

type Tab = 'today' | 'feed' | 'history';

function Briefing() {
  const terms = useTerms();
  const event = useBankStore((s) => s.view.event);
  const day = useBankStore((s) => s.view.day);
  const special = event.id !== 'NORMAL';
  return (
    <section className={`rounded-xl border p-3 ${special ? 'border-fuchsia-400/30 bg-fuchsia-400/5' : 'border-slate-800 bg-slate-900/50'}`} data-testid="briefing">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{tr({ en: `Morning briefing · day ${day}`, vi: `Họp đầu ngày · ngày ${day}` })}</div>
      <h2 className={`mt-0.5 text-[14px] font-semibold ${special ? 'text-fuchsia-100' : 'text-slate-100'}`}>{terms.t(eventText(event).title)}</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{terms.t(eventText(event).blurb)}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
        <span className="font-semibold text-slate-300">{t('Watch: ')}</span>
        {terms.t(eventText(event).watch)}
      </p>
    </section>
  );
}

function Numbers() {
  const terms = useTerms();
  const k = useBankStore((s) => s.view.kpis);
  const suspense = useBankStore((s) => s.view.suspense);
  const inFlight = useBankStore((s) => s.view.inFlight);
  const p = pnl(k);
  const waitAvg = k.finished > 0 ? k.waitSumMin / k.finished : 0;
  return (
    <section data-testid="today-numbers">
      <SectionTitle aside={<span className="text-[10px] text-slate-500">{t('so far today')}</span>}>{t('Today’s numbers')}</SectionTitle>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label={t('Profit & loss')} value={formatMoney(p.netCents, true)} tone={p.netCents >= 0 ? 'ok' : 'crit'} hint={t('Fees earned, minus fraud, bad Pay-in-4 debt, missed breaks, lost goodwill and the cost of clearing the suspense account.')} />
        <Stat label={t('Payments')} value={k.arrivals.toLocaleString()} hint={tr({ en: `${inFlight} still in the bank`, vi: `${inFlight} giao dịch còn trong ngân hàng` })} />
        <Stat label={t('Approval rate')} value={k.arrivals > 0 ? formatPct(pct(k.approved, k.arrivals)) : '—'} tone={k.arrivals > 0 && pct(k.approved, k.arrivals) < 88 ? 'warn' : 'info'} />
        <Stat label={t('Avg wait')} value={k.finished > 0 ? tr({ en: `${waitAvg.toFixed(1)} min`, vi: `${waitAvg.toFixed(1)} phút` }) : '—'} tone={waitAvg > 4 ? 'warn' : 'info'} />
        <Stat label={t('Fraud approved')} value={k.fraudSlipped} tone={k.fraudSlipped > 0 ? 'crit' : 'info'} hint={t('Fraudulent payments the bank said yes to. The bank repays them.')} />
        <Stat label={t('Good customers lost')} value={k.frictionLostCount} tone={k.frictionLostCount > 8 ? 'warn' : 'info'} hint={t('Genuine customers lost to an expired code, an abandoned OTP, a 3DS reject or a long wait.')} />
        <Stat label={tr({ en: terms.t('Suspense account'), vi: terms.beginner ? 'Két giữ tiền lệch' : 'Tài khoản treo' })} value={formatMoney(suspense.cents, true)} tone={suspense.items > 40 ? 'warn' : 'info'} hint={tr({ en: terms.t(`${suspense.items} unexplained items${suspense.items > 0 ? `, oldest ${suspense.oldestDays} day${suspense.oldestDays === 1 ? '' : 's'}` : ''}`), vi: `${suspense.items} mục chưa giải thích${suspense.items > 0 ? `, lâu nhất ${suspense.oldestDays} ngày` : ''}` })} />
        <Stat label={tr({ en: terms.t('Suspense items'), vi: terms.beginner ? 'Số mục trong két tiền lệch' : 'Số mục treo' })} value={suspense.items} tone={suspense.items > 40 ? 'warn' : 'info'} />
      </div>
    </section>
  );
}

function AlertRow({ alert }: { alert: AlertView }) {
  const terms = useTerms();
  const select = useBankStore((s) => s.select);
  return (
    <button
      type="button"
      onClick={() => alert.station && select({ kind: 'station', id: alert.station })}
      disabled={!alert.station}
      className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-[12px] leading-snug transition enabled:hover:brightness-125 ${SEVERITY_BOX[alert.severity]}`}
      data-testid="alert-row"
    >
      <span className="mr-1.5 font-mono text-[10px] opacity-70">{formatClock(alert.minute)}</span>
      {terms.t(feedText(alert.text))}
    </button>
  );
}

function Alerts() {
  const alerts = useBankStore((s) => s.view.alerts);
  const sorted = [...alerts].sort((a, b) => (a.severity === b.severity ? b.minute - a.minute : a.severity === 'crit' ? -1 : b.severity === 'crit' ? 1 : 0));
  return (
    <section data-testid="alerts">
      <SectionTitle aside={<span className={`text-[10px] ${alerts.length > 0 ? 'text-amber-300' : 'text-slate-500'}`}>{alerts.length === 0 ? t('all quiet') : tr({ en: `${alerts.length} open`, vi: `${alerts.length} đang mở` })}</span>}>{t('Error alerts')}</SectionTitle>
      {sorted.length === 0 ? (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-[12px] text-slate-500">{t('Nothing needs attention right now.')}</p>
      ) : (
        <div className="space-y-1.5">
          {sorted.slice(0, 8).map((a) => (
            <AlertRow key={a.id} alert={a} />
          ))}
          {sorted.length > 8 && <p className="px-1 text-[11px] text-slate-500">{tr({ en: `…and ${sorted.length - 8} more`, vi: `…và ${sorted.length - 8} cảnh báo khác` })}</p>}
        </div>
      )}
    </section>
  );
}

function FeedList({ limit }: { limit: number }) {
  const terms = useTerms();
  const feed = useBankStore((s) => s.view.feed);
  const select = useBankStore((s) => s.select);
  const notable = feed.filter((f) => f.notable).slice(-limit).reverse();
  if (notable.length === 0) return <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-[12px] text-slate-500">{t('Press play. What happens in the bank appears here.')}</p>;
  const open = (f: FeedEntry): void => {
    if (f.place && isStation(f.place)) select({ kind: 'station', id: f.place });
  };
  return (
    <ul className="space-y-1" data-testid="feed-list">
      {notable.map((f) => (
        <li key={f.id}>
          <button type="button" onClick={() => open(f)} className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-[12px] leading-snug transition hover:bg-slate-900">
            <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[f.severity]}`} />
            <span className="min-w-0">
              <span className="mr-1.5 font-mono text-[10px] text-slate-500">{formatClock(f.minute)}</span>
              <span className={SEVERITY_TEXT[f.severity]}>{terms.t(feedText(f.text))}</span>
              {f.place && isStation(f.place) && <span className="ml-1 text-[10.5px] text-slate-500">· {terms.station(f.place)}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function History() {
  const terms = useTerms();
  const history = useBankStore((s) => s.view.history);
  const reopen = useBankStore((s) => s.reopenReport);
  if (history.length === 0) return <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-[12px] text-slate-500">{t('Finished days are listed here with their profit and loss.')}</p>;
  const rows: DayReport[] = [...history].reverse();
  return (
    <div data-testid="history-list">
      <table className="w-full text-left text-[12px]">
        <thead className="text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-1 font-medium">{t('Day')}</th>
            <th className="py-1 font-medium">{t('What happened')}</th>
            <th className="py-1 text-right font-medium">{t('P&L')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const net = pnl(r.kpis).netCents;
            return (
              <tr key={r.day} className="border-t border-slate-800/80">
                <td className="py-1.5 font-mono text-slate-400">{r.day}</td>
                <td className="py-1.5 pr-1 text-slate-300">{terms.t(eventText(r.event).title)}</td>
                <td className={`py-1.5 text-right font-medium tabular-nums ${net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatMoney(net, true)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" onClick={reopen} className="mt-2 text-[11px] font-medium text-sky-300 hover:text-sky-200">
        {t('Open the latest day report')}
      </button>
    </div>
  );
}

export function BankSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: (collapsed: boolean) => void }) {
  const [tab, setTab] = useState<Tab>('today');
  const alertCount = useBankStore((s) => s.view.alerts.length);
  const tabs: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'today', label: t('Today'), ...(alertCount > 0 ? { badge: alertCount } : {}) },
    { id: 'feed', label: t('Live feed') },
    { id: 'history', label: t('Days') },
  ];
  if (collapsed) {
    const rail: Array<{ id: Tab; label: string; path: string }> = [
      { id: 'today', label: t('Today'), path: 'M4 19V9m5 10V5m5 14v-7m5 7V8' },
      { id: 'feed', label: t('Live feed'), path: 'M5 6h14M5 12h14M5 18h9' },
      { id: 'history', label: t('Days'), path: 'M5 5h14v14H5zM5 10h14M9 3v4m6-4v4' },
    ];
    return (
      <aside className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-slate-800 bg-slate-950 py-2" aria-label={t('Bank overview (collapsed)')} data-testid="bank-sidebar" data-collapsed="true">
        <button type="button" onClick={() => onToggle(false)} aria-label={t('Show the overview panel')} title={t('Show the overview panel')} data-testid="sidebar-expand" className="mb-1 grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-slate-800 hover:text-white">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
        {rail.map((r) => (
          <button
            key={r.id}
            type="button"
            title={r.label}
            aria-label={r.label}
            onClick={() => {
              setTab(r.id);
              onToggle(false);
            }}
            className="relative grid h-9 w-9 place-items-center rounded-md text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={r.path} />
            </svg>
            {r.id === 'today' && alertCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-slate-950">{alertCount}</span>}
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="flex w-[286px] shrink-0 flex-col border-r border-slate-800 bg-slate-950" aria-label={t('Bank overview')} data-testid="bank-sidebar" data-collapsed="false">
      <div className="flex items-center gap-1 border-b border-slate-800 p-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            data-testid={`sidebar-tab-${t.id}`}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium transition ${tab === t.id ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
          >
            {t.label}
            {t.badge !== undefined && <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-slate-950">{t.badge}</span>}
          </button>
        ))}
        <button type="button" onClick={() => onToggle(true)} aria-label={t('Hide the overview panel')} title={t('Hide the overview panel')} data-testid="sidebar-collapse" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-800 hover:text-white">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {tab === 'today' && (
          <>
            <Briefing />
            <Numbers />
            <Alerts />
          </>
        )}
        {tab === 'feed' && (
          <section>
            <SectionTitle>{t('What is happening')}</SectionTitle>
            <FeedList limit={60} />
          </section>
        )}
        {tab === 'history' && (
          <section>
            <SectionTitle>{t('Finished days')}</SectionTitle>
            <History />
          </section>
        )}
      </div>
    </aside>
  );
}
