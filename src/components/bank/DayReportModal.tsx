import { tr } from '../../i18n/locale';
import { declineGloss, declineLabel, reportGloss, reportLabel, tipText } from '../../i18n/reportVi';
import { t } from '../../i18n/t';
import { lessonOf, processShort } from '../../sim/learningVi';
import { eventText } from '../../sim/traffic';
import { exportAudit } from '../ops/auditExport';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatClock } from '../../sim/clock';
import { DECLINE_LABEL, DECLINE_REASONS, formatMoney, formatPct, pct, pnl } from '../../sim/kpis';
import { coachTips, declineGroups, pnlLines, reportCsv, reportFileName, revenueVsLosses, signedMoney, takeaway, topDrain, transactionsCsv, transactionsFileName } from '../../sim/reportSummary';
import type { ProcessId } from '../../sim/learning';
import type { DayReport, NightShiftReport } from '../../sim/types';
import { useBankStore } from '../../store/bankStore';
import { DECLINE_GLOSSARY, OVERVIEW_GLOSSARY, PNL_GLOSSARY, STAT_GLOSSARY, type OverviewLabel, type PnlLabel, type StatLabel } from '../../data/reportGlossary';
import { InfoTip } from './InfoTip';
import { useTerms } from './useTerms';

export { coachTips };

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function Line({ label, cents, sign, strong }: { label: PnlLabel; cents: number; sign: '+' | '−' | ''; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 text-[12.5px] ${strong ? 'border-t border-slate-700 pt-2 text-[14px] font-bold text-slate-50' : 'text-slate-300'}`}>
      <span className="flex items-center">
        {reportLabel(label)}
        <InfoTip label={reportLabel(label)} text={reportGloss(label, PNL_GLOSSARY[label])} testId={`tip-pnl-${slug(label)}`} />
      </span>
      <span className={`tabular-nums ${cents === 0 ? 'text-slate-400' : sign === '+' ? 'text-emerald-300' : sign === '−' ? 'text-rose-300' : strong ? (cents >= 0 ? 'text-emerald-300' : 'text-rose-300') : ''}`}>
        {cents === 0 ? '' : sign === '' && cents < 0 ? '−' : sign}
        {formatMoney(Math.abs(cents))}
      </span>
    </div>
  );
}

/** How a person finished the night, in one word and a colour. */
export function staminaState(fatigue: number): { label: string; tone: 'good' | 'warn' | 'bad'; bar: string } {
  if (fatigue >= 80) return { label: t('Exhausted'), tone: 'bad', bar: 'bg-rose-400' };
  if (fatigue >= 60) return { label: t('Worn out'), tone: 'warn', bar: 'bg-amber-400' };
  if (fatigue >= 40) return { label: t('Tired'), tone: 'warn', bar: 'bg-yellow-300' };
  return { label: t('Fine'), tone: 'good', bar: 'bg-emerald-400' };
}

const TONE_TEXT = { good: 'text-emerald-300', warn: 'text-amber-300', bad: 'text-rose-300' } as const;

/** Tonight's night shift: who was on, at which desk, how much stamina they had left, and whether the work got done. */
function NightShift({ shift }: { shift: NightShiftReport }) {
  const terms = useTerms();
  const done = shift.finishedAt !== null;
  const pctDone = Math.round(shift.completion * 100);
  return (
    <section data-testid="report-night-shift">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('Tonight’s night shift')}</h3>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
        <div className="flex items-center justify-between gap-3 text-[12px]">
          <span className={`font-semibold ${done ? 'text-emerald-300' : 'text-amber-300'}`} data-testid="night-shift-status">
            {done
              ? tr({ en: `Shift complete · finished at ${formatClock(shift.finishedAt as number)}`, vi: `Hoàn thành ca · xong lúc ${formatClock(shift.finishedAt as number)}` })
              : tr({ en: `Shift incomplete · ${shift.left} records left at midnight`, vi: `Chưa xong ca · còn ${shift.left} bản ghi lúc nửa đêm` })}
          </span>
          <span className="tabular-nums text-slate-400">
            {tr({ en: `${shift.records - shift.left} of ${shift.records} records`, vi: `${shift.records - shift.left}/${shift.records} bản ghi` })} · {pctDone}%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
          <div className={`h-full rounded-full ${done ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${pctDone}%` }} />
        </div>
        <ul className="mt-3 space-y-1.5" aria-label={t('Night crew')}>
          {shift.crew.map((m) => {
            const st = staminaState(m.fatigue);
            const stamina = Math.max(0, 100 - m.fatigue);
            return (
              <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_92px_74px] items-center gap-2 text-[12px]" data-testid={`night-crew-${m.id}`} data-fatigue={m.fatigue}>
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-100">
                    {m.name}
                    {m.temp && <span className="ml-1 text-[10.5px] text-slate-500">{t('(cover)')}</span>}
                  </div>
                  <div className="truncate text-[10.5px] text-slate-500">
                    {terms.station(m.station)} · {tr({ en: `${m.items} records`, vi: `${m.items} bản ghi` })}
                  </div>
                </div>
                <div title={tr({
                  en: `Stamina ${stamina}% (fatigue ${m.fatigue}%), working at ${Math.round(m.productivity * 100)}% of normal pace`,
                  vi: `Thể lực ${stamina}% (mệt mỏi ${m.fatigue}%), làm việc ở ${Math.round(m.productivity * 100)}% tốc độ bình thường`,
                })}>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${stamina}%` }} />
                  </div>
                  <div className="mt-0.5 text-[10.5px] tabular-nums text-slate-400">{tr({ en: `Stamina ${stamina}%`, vi: `Thể lực ${stamina}%` })}</div>
                </div>
                <span className={`text-right text-[11px] font-semibold ${TONE_TEXT[st.tone]}`}>{st.label}</span>
              </li>
            );
          })}
        </ul>
        {shift.resting.length > 0 && (
          <p className="mt-2.5 border-t border-slate-800 pt-2 text-[11.5px] leading-snug text-slate-400" data-testid="night-shift-resting">
            <span className="font-semibold text-slate-300">{t('Off tonight (rota): ')}</span>
            {shift.resting.join(', ')}. {t('The rota turns every night, so everyone works two nights in three.')}
          </p>
        )}
      </div>
    </section>
  );
}

type ReportView = 'overview' | 'audit';

const H3 = 'mb-1.5 flex items-center text-[11px] font-semibold uppercase tracking-wider text-slate-400';

/** Saves a CSV with the browser's own download, entirely on this device: nothing is sent anywhere. */
function downloadCsv(text: string, fileName: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function HeroCard({ title, testId, children }: { title: OverviewLabel; testId: string; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-4" data-testid={testId}>
      <h3 className="flex items-center text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
        {reportLabel(title)}
        <InfoTip label={reportLabel(title)} text={reportGloss(title, OVERVIEW_GLOSSARY[title])} testId={`tip-${testId}`} />
      </h3>
      {children}
    </section>
  );
}

function Overview({ report, onChapter }: { report: DayReport; onChapter: (p: ProcessId) => void }) {
  const terms = useTerms();
  const k = report.kpis;
  const p = pnl(k);
  const book = report.book;
  const bal = revenueVsLosses(report);
  const drain = topDrain(report);
  const groups = declineGroups(report);
  const declines = groups.reduce((n, g) => n + g.count, 0);
  const take = takeaway(report);
  const scale = Math.max(1, bal.revenueCents, bal.lossCents);
  return (
    <div className="space-y-4 overflow-y-auto p-4 sm:p-6" data-testid="report-overview">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <HeroCard title="Capital & P&L" testId="hero-capital">
          <div className={`mt-1 text-[26px] font-bold tabular-nums leading-tight ${p.netCents >= 0 ? 'text-emerald-300' : 'text-rose-300'}`} data-testid="hero-net">
            {signedMoney(p.netCents)}
          </div>
          <div className="text-[11.5px] text-slate-500">{t('today’s net result')}</div>
          {book && (
            <div className="mt-2 text-[12px] text-slate-300" data-testid="hero-reserves">
              {t('Reserves')} <span className="tabular-nums text-slate-400">{formatMoney(book.reservesStartCents)}</span>
              <span className="mx-1 text-slate-500" aria-hidden="true">→</span>
              <span className={`font-semibold tabular-nums ${book.reservesEndCents >= book.reservesStartCents ? 'text-emerald-200' : 'text-rose-200'}`}>{formatMoney(book.reservesEndCents)}</span>
            </div>
          )}
        </HeroCard>

        <HeroCard title="Settlement & volume" testId="hero-volume">
          <div className="mt-1 text-[26px] font-bold tabular-nums leading-tight text-slate-50" data-testid="hero-approval">
            {formatPct(pct(k.approved, k.arrivals))}
          </div>
          <div className="text-[11.5px] text-slate-500">
            {tr({ en: `approval rate · ${k.approved.toLocaleString()} of ${k.arrivals.toLocaleString()} payments`, vi: `tỷ lệ chấp thuận · ${k.approved.toLocaleString()}/${k.arrivals.toLocaleString()} giao dịch` })}
          </div>
          <div className="mt-2 text-[12px] text-slate-300">
            {t('Settled volume')} <span className="font-semibold tabular-nums text-slate-100" data-testid="hero-settled">{formatMoney(k.approvedCents, true)}</span>
          </div>
        </HeroCard>

        <HeroCard title="Customer base & churn" testId="hero-customers">
          {book ? (
            <>
              <div className="mt-1 text-[26px] font-bold tabular-nums leading-tight text-slate-50" data-testid="hero-active">
                {book.customersEnd.toLocaleString()}
              </div>
              <div className="text-[11.5px] text-slate-500">{t('active customers')}</div>
              <div className="mt-2 flex gap-4 text-[12px]">
                <span className="tabular-nums text-emerald-300" data-testid="hero-signups">+{book.signups} {t('new signups')}</span>
                <span className="tabular-nums text-rose-300" data-testid="hero-churn">−{book.churned} {t('churned')}</span>
              </div>
            </>
          ) : (
            <p className="mt-2 text-[12px] text-slate-500">{t('Not recorded for this saved day.')}</p>
          )}
        </HeroCard>

        <HeroCard title="Top revenue drain" testId="hero-drain">
          {drain ? (
            <>
              <div className="mt-1 text-[26px] font-bold tabular-nums leading-tight text-rose-300" data-testid="hero-drain-amount">
                −{formatMoney(drain.cents)}
              </div>
              <div className="flex items-center text-[12px] font-medium text-slate-200" data-testid="hero-drain-label">
                {reportLabel(drain.label)}
                <InfoTip label={reportLabel(drain.label)} text={reportGloss(drain.label, PNL_GLOSSARY[drain.label])} testId="tip-hero-drain-line" />
              </div>
              <div className="mt-1 text-[11.5px] text-slate-500">{tr({ en: `${Math.round(drain.share * 100)}% of everything lost today`, vi: `${Math.round(drain.share * 100)}% tổng tổn thất hôm nay` })}</div>
            </>
          ) : (
            <p className="mt-2 text-[12px] text-emerald-200">{t('Nothing was lost today.')}</p>
          )}
        </HeroCard>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4" data-testid="balance-bar">
        <h3 className={H3}>
          {reportLabel('Revenue vs losses')}
          <InfoTip label={reportLabel('Revenue vs losses')} text={reportGloss('Revenue vs losses', OVERVIEW_GLOSSARY['Revenue vs losses'])} testId="tip-balance" />
        </h3>
        {[
          { label: 'Gross revenue', cents: bal.revenueCents, bar: 'bg-emerald-400', text: 'text-emerald-300', sign: '+' },
          { label: 'Losses & write-offs', cents: bal.lossCents, bar: 'bg-rose-400', text: 'text-rose-300', sign: '−' },
        ].map((row) => (
          <div key={row.label} className="mt-2 grid grid-cols-[110px_minmax(0,1fr)_96px] items-center gap-3 text-[12px] sm:grid-cols-[140px_minmax(0,1fr)_110px]">
            <span className="text-slate-300">{reportLabel(row.label)}</span>
            <div className="h-3 overflow-hidden rounded-full bg-slate-800" role="img" aria-label={`${reportLabel(row.label)} ${formatMoney(row.cents)}`}>
              <div className={`h-full rounded-full ${row.bar}`} style={{ width: `${(row.cents / scale) * 100}%` }} />
            </div>
            <span className={`text-right font-semibold tabular-nums ${row.text}`}>
              {row.sign}
              {formatMoney(row.cents)}
            </span>
          </div>
        ))}
        <p className="mt-2 text-right text-[11.5px] text-slate-400">
          {t('Net')} <span className={`font-semibold tabular-nums ${bal.netCents >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{signedMoney(bal.netCents)}</span>
        </p>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4" data-testid="decline-bar">
        <h3 className={H3}>
          {reportLabel('Decline breakdown')}
          <InfoTip label={reportLabel('Decline breakdown')} text={reportGloss('Decline breakdown', OVERVIEW_GLOSSARY['Decline breakdown'])} testId="tip-decline-breakdown" />
          <span className="ml-auto font-normal normal-case tracking-normal text-slate-500">{tr({ en: `${declines.toLocaleString()} declined`, vi: `${declines.toLocaleString()} bị từ chối` })}</span>
        </h3>
        {declines === 0 ? (
          <p className="text-[12px] text-slate-500">{t('Nothing was declined.')}</p>
        ) : (
          <>
            <div className="mt-1 flex h-4 overflow-hidden rounded-full bg-slate-800" role="img" aria-label={groups.filter((g) => g.count > 0).map((g) => `${reportLabel(g.label)} ${g.count}`).join(', ')}>
              {groups.filter((g) => g.count > 0).map((g) => (
                <div key={g.id} className="h-full border-r border-[#070b14] last:border-r-0" style={{ width: `${g.share * 100}%`, background: g.color }} title={`${reportLabel(g.label)}: ${g.count}`} data-testid={`decline-seg-${g.id}`} />
              ))}
            </div>
            <ul className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-2">
              {groups.map((g) => (
                <li key={g.id} className={`flex items-center gap-2 ${g.count === 0 ? 'opacity-45' : ''}`}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: g.color }} aria-hidden="true" />
                  <span className="text-slate-300">{reportLabel(g.label)}</span>
                  <span className="ml-auto tabular-nums text-slate-400">
                    {g.count} · {Math.round(g.share * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-sky-400/30 bg-sky-400/[0.06] p-4" data-testid="takeaway">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">{tr({ en: `Takeaway for Day ${report.day + 1}`, vi: `Bài học cho Ngày ${report.day + 1}` })}</h3>
        <p className="mt-1 text-[13.5px] leading-relaxed text-slate-100">{terms.t(tipText(take.text))}</p>
        {take.process && (
          <button type="button" onClick={() => onChapter(take.process as ProcessId)} data-testid="takeaway-chapter" className="mt-2 text-[12.5px] font-semibold text-sky-300 underline-offset-2 transition hover:text-sky-200 hover:underline">
            {tr({ en: `Open Chapter ${lessonOf(take.process).chapter}`, vi: `Mở Chương ${lessonOf(take.process).chapter}` })}: {terms.t(processShort(take.process))} →
          </button>
        )}
      </section>
    </div>
  );
}

function Audit({ report, onHub }: { report: DayReport; onHub: (p: ProcessId) => void }) {
  const terms = useTerms();
  const k = report.kpis;
  const lines = pnlLines(report);
  const reasons = DECLINE_REASONS.map((r) => [r, k.declines[r]] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const maxReason = Math.max(1, ...reasons.map(([, n]) => n));
  const tips = coachTips(report);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto p-4 sm:p-6 md:grid-cols-2" data-testid="report-audit">
      <div className="space-y-5">
        <section>
          <h3 className={H3}>{t('Profit &amp; loss')}</h3>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-2.5" data-testid="report-pnl">
            {lines.map((l) => (
              <Line key={l.label} label={l.label} cents={l.cents} sign={l.kind === 'revenue' ? '+' : l.kind === 'loss' ? '−' : ''} strong={l.kind === 'net'} />
            ))}
          </div>
        </section>

        <section>
          <h3 className={H3}>{t('The day in numbers')}</h3>
          <dl className="grid grid-cols-2 gap-1.5 text-[12px]">
            {(
              [
                ['Payments', k.arrivals.toLocaleString()],
                ['Approved', `${formatPct(pct(k.approved, k.arrivals))} · ${formatMoney(k.approvedCents, true)}`],
                ['Fraud approved', tr({ en: `${k.fraudSlipped} of ${k.fraudAttempts}`, vi: `${k.fraudSlipped}/${k.fraudAttempts}` })],
                ['Pay-in-4 plans', String(k.bnpl.plans)],
                ['Instant transfers', tr({ en: `${k.a2a.released} of ${k.a2a.transfers}`, vi: `${k.a2a.released}/${k.a2a.transfers}` })],
                [
                  'Sidewalk ATM',
                  tr({
                    en: `${k.atm.dispensed} of ${k.atm.sessions} paid out${k.atm.jams > 0 ? ` · ${k.atm.jams} jammed` : ''}`,
                    vi: `${k.atm.dispensed}/${k.atm.sessions} đã nhả tiền${k.atm.jams > 0 ? ` · ${k.atm.jams} bị kẹt` : ''}`,
                  }),
                ],
                ['3DS challenged', String(k.threeDs.challenged)],
                ['Average wait', k.finished > 0 ? tr({ en: `${(k.waitSumMin / k.finished).toFixed(1)} min`, vi: `${(k.waitSumMin / k.finished).toFixed(1)} phút` }) : '—'],
                ['Matched overnight', tr({ en: `${k.recon.matched} of ${k.recon.records}`, vi: `${k.recon.matched}/${k.recon.records}` })],
                ['Suspense account', `${formatMoney(report.close.suspenseCents, true)} · ${report.close.suspenseItems}`],
              ] satisfies Array<[StatLabel, string]>
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/50 px-2.5 py-1.5">
                <dt className="flex items-center text-[10px] uppercase tracking-wide text-slate-500">
                  {reportLabel(label)}
                  <InfoTip label={reportLabel(label)} text={reportGloss(label, STAT_GLOSSARY[label])} testId={`tip-stat-${slug(label)}`} />
                </dt>
                <dd className="font-semibold tabular-nums text-slate-100">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <div className="space-y-5">
        {report.nightShift && <NightShift shift={report.nightShift} />}

        <section>
          <h3 className={H3}>{t('Why payments were declined')}</h3>
          <div className="space-y-1.5 rounded-2xl border border-slate-800 bg-slate-900/40 p-3" data-testid="report-declines">
            {reasons.length === 0 && <p className="text-[12px] text-slate-500">{t('Nothing was declined.')}</p>}
            {reasons.map(([reason, n]) => (
              <div key={reason}>
                <div className="flex justify-between text-[12px]">
                  <span className="flex items-center text-slate-300">
                    {terms.t(declineLabel(reason, DECLINE_LABEL[reason]))}
                    <InfoTip label={terms.t(declineLabel(reason, DECLINE_LABEL[reason]))} text={declineGloss(reason, DECLINE_GLOSSARY[reason])} testId={`tip-decline-${reason}`} />
                  </span>
                  <span className="tabular-nums text-slate-400">{n}</span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className={`h-full rounded-full ${reason === 'FUNDS' ? 'bg-slate-500' : 'bg-rose-400'}`} style={{ width: `${(n / maxReason) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className={H3}>{t('What to look at next')}</h3>
          {tips.length === 0 ? (
            <p className="rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-3 text-[12.5px] leading-relaxed text-emerald-100">{t('A clean day. Try changing a rule in the Rule Lab and see whether you can beat it.')}</p>
          ) : (
            <ul className="space-y-2" data-testid="report-tips">
              {tips.map((tip) => (
                <li key={tip.text} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 text-[12.5px] leading-relaxed text-slate-200">
                  {terms.t(tipText(tip.text))}
                  {tip.process && (
                    <button type="button" onClick={() => onHub(tip.process as ProcessId)} className="mt-1.5 block text-[12px] font-semibold text-sky-300 transition hover:text-sky-200">
                      {tr({ en: `Chapter ${lessonOf(tip.process).chapter}`, vi: `Chương ${lessonOf(tip.process).chapter}` })}: {terms.t(processShort(tip.process))} →
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export function DayReportModal() {
  const open = useBankStore((s) => s.reportOpen);
  const history = useBankStore((s) => s.view.history);
  const dayOver = useBankStore((s) => s.view.dayOver);
  const dismiss = useBankStore((s) => s.dismissReport);
  const startNextDay = useBankStore((s) => s.startNextDay);
  const openHub = useBankStore((s) => s.openHub);
  const startChapter = useBankStore((s) => s.startChapter);
  const terms = useTerms();
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ReportView>('overview');
  const sim = useBankStore((s) => s.sim);
  const simDay = useBankStore((s) => s.view.day);
  const report = history[history.length - 1];
  const reportDay = report?.day;

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  // Every new report opens on the executive view.
  useEffect(() => {
    if (open) setView('overview');
  }, [open, reportDay]);

  if (!open || !report) return null;
  const before = history[history.length - 2];
  const prevNet = before ? pnl(before.kpis).netCents : null;
  const done = report.close.nightDoneMinute;
  // The bank keeps the payments of the day it is on. Once the next day starts (or the page is reloaded) they are gone.
  const txAvailable = dayOver && simDay === report.day && sim.transactionLog().length > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-2 sm:p-4" data-testid="day-report-backdrop" onMouseDown={(e) => e.target === e.currentTarget && dismiss()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={tr({ en: `Day ${report.day} report`, vi: `Báo cáo ngày ${report.day}` })} tabIndex={-1} onKeyDown={(e) => e.key === 'Escape' && dismiss()} className="flex max-h-[min(900px,calc(100vh-16px))] w-[min(1020px,100%)] flex-col overflow-hidden rounded-3xl border border-slate-700 bg-[#070b14] shadow-2xl outline-none" data-testid="day-report" data-day={report.day} data-view={view}>
        <header className="flex shrink-0 flex-wrap items-start gap-x-4 gap-y-3 border-b border-slate-800 bg-gradient-to-b from-amber-400/10 to-transparent px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1 basis-[320px]">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">{tr({ en: 'The bank is closed for the night', vi: 'Ngân hàng đã đóng cửa qua đêm' })}</div>
            <h2 className="mt-0.5 text-[22px] font-bold text-slate-50">
              {tr({ en: 'Day', vi: 'Ngày' })} {report.day} · {terms.t(eventText(report.event).title)}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-slate-400">
              {done !== null
                ? tr({ en: `The night team finished at ${formatClock(done)}.`, vi: `Ca đêm hoàn thành lúc ${formatClock(done)}.` })
                : tr({ en: `The night team ran out of time: ${report.close.reconBacklog} records are still waiting.`, vi: `Ca đêm hết giờ: còn ${report.close.reconBacklog} bản ghi đang chờ.` })}
              {report.nightShift &&
                report.nightShift.crew.length > 0 &&
                tr({ en: ` On shift: ${report.nightShift.crew.map((m) => m.name.split(' ')[0]).join(', ')}.`, vi: ` Trong ca: ${report.nightShift.crew.map((m) => m.name.split(' ')[0]).join(', ')}.` })}
              {prevNet !== null && tr({ en: ` Yesterday made ${formatMoney(prevNet)}.`, vi: ` Hôm qua đạt ${formatMoney(prevNet)}.` })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-slate-900 p-0.5 ring-1 ring-slate-700" role="tablist" aria-label={t('Report view')}>
              {(
                [
                  ['overview', tr({ en: 'Overview', vi: 'Tổng quan' })],
                  ['audit', tr({ en: 'Detailed Audit', vi: 'Kiểm toán chi tiết' })],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  data-testid={`report-view-${id}`}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${view === id ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => downloadCsv(reportCsv(report), reportFileName(report))}
              data-testid="report-export"
              title={t('Download every P&L line, decline reason and operational figure of the day as a spreadsheet file')}
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] font-semibold text-slate-100 ring-1 ring-slate-700 transition hover:bg-slate-700"
            >
              <span aria-hidden="true">📥</span> {tr({ en: 'Export Day Report (.CSV)', vi: 'Xuất báo cáo ngày (.CSV)' })}
            </button>
            <button
              type="button"
              // The log is built only now, on the click: nothing extra runs while the day is being played.
              onClick={() => downloadCsv(transactionsCsv(sim.transactionLog()), transactionsFileName(report.day))}
              disabled={!txAvailable}
              data-testid="report-export-transactions"
              title={
                txAvailable
                  ? tr({
                      en: `Download every payment of day ${report.day} (${sim.transactionLog().length.toLocaleString()} rows) as a spreadsheet file`,
                      vi: `Tải mọi giao dịch của ngày ${report.day} (${sim.transactionLog().length.toLocaleString()} dòng) dưới dạng tệp bảng tính`,
                    })
                  : t('The transaction log is kept for the day just played. Reloading the page or starting the next day clears it.')
              }
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] font-semibold text-slate-100 ring-1 ring-slate-700 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">📥</span> {tr({ en: 'Export Transactions (.CSV)', vi: 'Xuất giao dịch (.CSV)' })}
            </button>
            <button
              type="button"
              // Built only on the click, from the log, the ledger and what Chaos Monkey did today.
              onClick={() => exportAudit(sim)}
              disabled={!txAvailable}
              data-testid="report-export-audit"
              title={tr({
                en: 'Download the end-of-day audit: summary, trial balance, Chaos Monkey impact, exceptions for sampling and the full audit trail with ISO response codes',
                vi: 'Tải báo cáo kiểm toán cuối ngày: tóm tắt, bảng cân đối thử, tác động Chaos Monkey, các ngoại lệ cần chọn mẫu và toàn bộ dấu vết kiểm toán kèm mã phản hồi ISO',
              })}
              className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-[12px] font-bold text-slate-950 ring-1 ring-amber-300 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">📥</span> {tr({ en: 'Export Audit Report (CSV)', vi: 'Xuất báo cáo kiểm toán (CSV)' })}
            </button>
          </div>
        </header>

        {view === 'overview' ? (
          <Overview
            report={report}
            onChapter={(p) => {
              dismiss();
              startChapter(p);
            }}
          />
        ) : (
          <Audit
            report={report}
            onHub={(p) => {
              dismiss();
              openHub(p);
            }}
          />
        )}

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-800 bg-slate-950 px-4 py-3 sm:px-6">
          <button type="button" onClick={dismiss} data-testid="report-dismiss" className="rounded-lg bg-slate-800 px-4 py-2 text-[13px] font-medium text-slate-200 transition hover:bg-slate-700">
            {tr({ en: 'Look around the bank', vi: 'Xem quanh ngân hàng' })}
          </button>
          <button type="button" onClick={startNextDay} disabled={!dayOver} data-testid="report-next-day" className="rounded-lg bg-lime-400 px-4 py-2 text-[13px] font-bold text-slate-950 transition hover:bg-lime-300 disabled:opacity-40">
            {tr({ en: `Start day ${report.day + 1}`, vi: `Bắt đầu ngày ${report.day + 1}` })}
          </button>
        </footer>
      </div>
    </div>
  );
}
