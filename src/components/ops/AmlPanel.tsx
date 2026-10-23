import { useEffect, useMemo, useState } from 'react';
import { tr, useLocale, type Localized } from '../../i18n/locale';
import { amlTestCustomer, AML_THRESHOLD_CENTS, isBotBurst, SAR_ACTIVITIES, SAR_MIN_NARRATIVE, sarProblems, sarReference, scanForAml, VELOCITY_MIN_COUNT, VELOCITY_WINDOW_MIN, type AmlAlert, type SarActivity, type SarDraft } from '../../sim/amlMonitor';
import { formatClock, WORK_END } from '../../sim/clock';
import { formatMoney } from '../../sim/kpis';
import { rcLabel } from '../../sim/plainLanguage';
import { localizeScenarioText, scenarioLabel } from '../../sim/scenarios';
import type { TxRecord } from '../../sim/types';
import { amlStore, useAmlStore, type AmlCase } from '../../store/amlStore';
import { bankStore, useBankStore } from '../../store/bankStore';
import { uiStore, useUiStore } from '../../store/uiStore';
import { Modal } from '../shell/Modal';

/**
 * The AML / SAR compliance desk, in three steps:
 *   1. Monitor      alerts raised automatically on the day's payments (over $10,000, or a velocity burst of tiny online payments)
 *   2. Investigate  the payments behind an alert and the risk factors, then close it or escalate it
 *   3. Report       the Suspicious Activity Report form, and [Submit SAR to Regulator]
 */

type Step = 1 | 2 | 3;

const KIND_TEXT: Record<AmlAlert['kind'], { icon: string; label: Localized<string>; tone: string }> = {
  LARGE_VALUE: { icon: '💰', label: { en: 'Over $10,000', vi: 'Trên $10,000' }, tone: 'bg-amber-400/15 text-amber-200 ring-amber-400/40' },
  VELOCITY_BURST: { icon: '⚡', label: { en: 'Velocity burst', vi: 'Tần suất bất thường' }, tone: 'bg-rose-400/15 text-rose-200 ring-rose-400/40' },
};

const ACTIVITY_TEXT: Record<SarActivity, Localized<string>> = {
  LARGE_UNUSUAL: { en: 'Large or unusual transaction', vi: 'Giao dịch lớn hoặc bất thường' },
  CARD_TESTING: { en: 'Card testing / account takeover', vi: 'Dò thẻ / chiếm đoạt tài khoản' },
  STRUCTURING: { en: 'Structuring to avoid reporting', vi: 'Chia nhỏ giao dịch để né báo cáo' },
  SANCTIONS: { en: 'Possible sanctions match', vi: 'Nghi trùng danh sách cấm vận' },
  OTHER: { en: 'Other suspicious activity', vi: 'Hoạt động đáng ngờ khác' },
};

const STEP_TEXT: Record<Step, Localized<string>> = {
  1: { en: 'Monitor', vi: 'Giám sát' },
  2: { en: 'Investigate', vi: 'Điều tra' },
  3: { en: 'Report', vi: 'Báo cáo' },
};

function statusBadge(c: AmlCase | undefined) {
  if (!c) return <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[10.5px] font-bold text-sky-200 ring-1 ring-sky-400/40">{tr({ en: 'Open', vi: 'Đang mở' })}</span>;
  if (c.status === 'SAR_FILED') return <span className="rounded-full bg-lime-400/15 px-2 py-0.5 text-[10.5px] font-bold text-lime-200 ring-1 ring-lime-400/40">{tr({ en: 'SAR filed', vi: 'Đã nộp SAR' })}</span>;
  return <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10.5px] font-bold text-slate-300 ring-1 ring-slate-600">{tr({ en: 'False positive', vi: 'Cảnh báo sai' })}</span>;
}

function riskFactors(a: AmlAlert, rows: readonly TxRecord[]): string[] {
  const out: string[] = [];
  if (a.kind === 'LARGE_VALUE') {
    out.push(tr({ en: `Amount ${formatMoney(a.amountCents)} is above the ${formatMoney(AML_THRESHOLD_CENTS)} threshold-transaction line.`, vi: `Số tiền ${formatMoney(a.amountCents)} vượt ngưỡng giao dịch ${formatMoney(AML_THRESHOLD_CENTS)}.` }));
    const r = rows[0];
    if (r?.kind === 'A2A') out.push(tr({ en: 'Instant account-to-account transfer: final once settled, it cannot be recalled.', vi: 'Chuyển khoản tức thì: đã quyết toán là cuối cùng, không thể thu hồi.' }));
    if (r?.kind === 'ATM' && r.deposit) out.push(tr({ en: 'Cash deposit: the source of the cash is unknown.', vi: 'Nộp tiền mặt: không rõ nguồn gốc tiền.' }));
  } else {
    out.push(tr({ en: `${a.count} card-not-present payments of $5.00 or less inside ${VELOCITY_WINDOW_MIN} minutes (rule fires at ${VELOCITY_MIN_COUNT}).`, vi: `${a.count} giao dịch không xuất trình thẻ từ $5.00 trở xuống trong ${VELOCITY_WINDOW_MIN} phút (quy tắc kích hoạt ở ${VELOCITY_MIN_COUNT}).` }));
    out.push(tr({ en: 'Tiny amounts on many different cards: the signature of a bot testing stolen card numbers.', vi: 'Số tiền rất nhỏ trên nhiều thẻ khác nhau: dấu hiệu của bot dò số thẻ bị đánh cắp.' }));
  }
  if (a.approved > 0) out.push(tr({ en: `${a.approved} of these payments were approved: money moved, or a stolen card was confirmed live.`, vi: `${a.approved} giao dịch trong số này đã được duyệt: tiền đã đi, hoặc một thẻ bị đánh cắp đã được xác nhận còn sống.` }));
  if (rows.some((r) => r.isFraud)) out.push(tr({ en: 'The fraud desk has confirmed at least one of these payments as fraud.', vi: 'Bộ phận gian lận đã xác nhận ít nhất một giao dịch là gian lận.' }));
  return out;
}

function defaultNarrative(a: AmlAlert, day: number, locale: 'en' | 'vi'): string {
  const time = formatClock(Math.floor(a.minute));
  if (a.kind === 'LARGE_VALUE') {
    return locale === 'vi'
      ? `Ngày ${day} lúc ${time}, khách hàng thực hiện giao dịch ${localizeScenarioText(a.scenario, 'vi')} trị giá ${formatMoney(a.amountCents)}, vượt ngưỡng ${formatMoney(AML_THRESHOLD_CENTS)}. Giao dịch không phù hợp với hồ sơ thông thường của khách hàng và nguồn tiền chưa được giải trình.`
      : `On day ${day} at ${time} the customer made a ${localizeScenarioText(a.scenario, 'en')} payment of ${formatMoney(a.amountCents)}, above the ${formatMoney(AML_THRESHOLD_CENTS)} threshold. The payment does not fit the customer's usual profile and the source of funds has not been explained.`;
  }
  return locale === 'vi'
    ? `Ngày ${day} từ ${time}, ${a.count} giao dịch trực tuyến từ $5.00 trở xuống (tổng ${formatMoney(a.amountCents)}) được thực hiện trên nhiều thẻ khác nhau trong ${VELOCITY_WINDOW_MIN} phút, ${a.approved} giao dịch được duyệt. Mẫu hình phù hợp với hoạt động dò thẻ tự động bằng thẻ bị đánh cắp.`
    : `On day ${day} from ${time}, ${a.count} online payments of $5.00 or less (${formatMoney(a.amountCents)} in all) were made on many different cards inside ${VELOCITY_WINDOW_MIN} minutes, ${a.approved} of them approved. The pattern is consistent with automated card testing using stolen card numbers.`;
}

/** The SAR form, step 3. */
function SarForm({ alert, day, minute, onFiled, onBack }: { alert: AmlAlert; day: number; minute: number; onFiled: () => void; onBack: () => void }) {
  const locale = useLocale();
  const [draft, setDraft] = useState<SarDraft>(() => ({
    alertId: alert.id,
    subject: alert.kind === 'LARGE_VALUE' ? tr({ en: `Account holder of payment ${alert.txIds[0]}`, vi: `Chủ tài khoản của giao dịch ${alert.txIds[0]}` }) : tr({ en: 'Unknown operator of a card-testing botnet', vi: 'Kẻ vận hành botnet dò thẻ chưa xác định' }),
    activity: alert.kind === 'LARGE_VALUE' ? 'LARGE_UNUSUAL' : 'CARD_TESTING',
    narrative: defaultNarrative(alert, day, locale),
    noTipOff: false,
  }));
  const [tried, setTried] = useState(false);
  const problems = sarProblems(draft);
  const submit = (): void => {
    setTried(true);
    if (problems.length > 0) return;
    amlStore.getState().fileSar(alert.id, { status: 'SAR_FILED', reference: sarReference(alert.id, day), activity: draft.activity, subject: draft.subject.trim(), narrative: draft.narrative.trim(), day, filedMinute: minute });
    onFiled();
  };
  const err = (p: (typeof problems)[number]): boolean => tried && problems.includes(p);
  return (
    <form
      className="space-y-3"
      data-testid="sar-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[12px] text-slate-300">
        <span className="font-semibold text-slate-100">{tr({ en: 'Alert', vi: 'Cảnh báo' })}:</span> <span className="font-mono">{alert.id}</span> · {tr(KIND_TEXT[alert.kind].label)} · {formatMoney(alert.amountCents)}
      </div>
      <label className="block">
        <span className="text-[11.5px] font-semibold text-slate-300">{tr({ en: 'Subject of the report', vi: 'Đối tượng của báo cáo' })}</span>
        <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} data-testid="sar-subject" aria-invalid={err('SUBJECT')} className={`mt-1 w-full rounded-lg border bg-slate-950 px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-sky-400 ${err('SUBJECT') ? 'border-rose-400' : 'border-slate-700'}`} />
        {err('SUBJECT') && <span className="mt-1 block text-[11px] text-rose-300">{tr({ en: 'Name who the report is about.', vi: 'Hãy ghi rõ báo cáo về ai.' })}</span>}
      </label>
      <label className="block">
        <span className="text-[11.5px] font-semibold text-slate-300">{tr({ en: 'Type of suspicious activity', vi: 'Loại hoạt động đáng ngờ' })}</span>
        <select value={draft.activity} onChange={(e) => setDraft({ ...draft, activity: e.target.value as SarActivity })} data-testid="sar-activity" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-sky-400">
          {SAR_ACTIVITIES.map((a) => (
            <option key={a} value={a}>
              {tr(ACTIVITY_TEXT[a])}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="flex items-baseline justify-between text-[11.5px] font-semibold text-slate-300">
          {tr({ en: 'Grounds for suspicion (narrative)', vi: 'Cơ sở nghi ngờ (diễn giải)' })}
          <span className={`font-mono font-normal ${draft.narrative.trim().length < SAR_MIN_NARRATIVE ? 'text-rose-300' : 'text-slate-500'}`}>
            {draft.narrative.trim().length}/{SAR_MIN_NARRATIVE}+
          </span>
        </span>
        <textarea value={draft.narrative} onChange={(e) => setDraft({ ...draft, narrative: e.target.value })} rows={5} data-testid="sar-narrative" aria-invalid={err('NARRATIVE')} className={`mt-1 w-full resize-y rounded-lg border bg-slate-950 px-3 py-2 text-[12.5px] leading-relaxed text-slate-100 outline-none focus:border-sky-400 ${err('NARRATIVE') ? 'border-rose-400' : 'border-slate-700'}`} />
        {err('NARRATIVE') && <span className="mt-1 block text-[11px] text-rose-300">{tr({ en: `Explain what happened and why it is suspicious, in at least ${SAR_MIN_NARRATIVE} characters.`, vi: `Giải thích điều gì đã xảy ra và vì sao đáng ngờ, tối thiểu ${SAR_MIN_NARRATIVE} ký tự.` })}</span>}
      </label>
      <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${err('TIP_OFF') ? 'border-rose-400 bg-rose-950/30' : 'border-slate-800 bg-slate-950/50'}`}>
        <input type="checkbox" checked={draft.noTipOff} onChange={(e) => setDraft({ ...draft, noTipOff: e.target.checked })} data-testid="sar-no-tipoff" className="mt-0.5 h-4 w-4 accent-lime-400" />
        <span className="text-slate-300">
          {tr({
            en: 'I confirm the customer has not been told about this report. Tipping off a customer is an offence in its own right.',
            vi: 'Tôi xác nhận khách hàng không được thông báo về báo cáo này. Tiết lộ cho khách hàng là một hành vi vi phạm.',
          })}
        </span>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button type="button" onClick={onBack} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800">
          ← {tr({ en: 'Back to the investigation', vi: 'Quay lại điều tra' })}
        </button>
        <button type="submit" data-testid="sar-submit" className="rounded-lg bg-rose-500 px-4 py-2 text-[12.5px] font-bold text-white shadow hover:bg-rose-400">
          📨 {tr({ en: 'Submit SAR to Regulator', vi: 'Nộp SAR cho cơ quan quản lý' })}
        </button>
      </div>
    </form>
  );
}

/** The AML / SAR compliance panel. */
export function AmlPanel() {
  const open = useUiStore((s) => s.overlay === 'aml');
  const finished = useBankStore((s) => s.view.kpis.finished);
  const day = useBankStore((s) => s.view.day);
  const minute = useBankStore((s) => s.view.minute);
  const dayOver = useBankStore((s) => s.view.dayOver);
  const cases = useAmlStore((s) => s.cases);
  const [step, setStep] = useState<Step>(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('all');
  const [sent, setSent] = useState<string | null>(null);

  // The alerts are recomputed only when another payment has finished, and only while the panel is open.
  const log = useMemo(() => (open ? [...bankStore.getState().sim.transactionLog()] : []), [open, finished, day]);
  const alerts = useMemo(() => scanForAml(log), [log]);
  const shown = filter === 'open' ? alerts.filter((a) => !cases[a.id]) : alerts;
  const alert = alerts.find((a) => a.id === selected) ?? null;
  const rows = useMemo(() => (alert ? alert.txIds.map((id) => log.find((t) => t.id === id)).filter((t): t is TxRecord => t !== undefined) : []), [alert, log]);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelected(null);
    }
  }, [open]);

  if (!open) return null;
  const close = (): void => uiStore.getState().close();
  const c = alert ? cases[alert.id] : undefined;

  const sendTest = (): void => {
    const s = bankStore.getState();
    const id = s.sendCustomer(amlTestCustomer(s.seed, s.sim.day, s.sim.minute, s.sim.event));
    setSent(id);
    if (id && !s.playing) s.play();
  };

  return (
    <Modal
      testId="aml-panel"
      icon="🛡️"
      width="max-w-4xl"
      title={tr({ en: 'AML Compliance Desk: Monitor · Investigate · Report', vi: 'Bàn tuân thủ AML: Giám sát · Điều tra · Báo cáo' })}
      subtitle={tr({
        en: `Day ${day}. Rules run over every finished payment: over ${formatMoney(AML_THRESHOLD_CENTS)}, or ${VELOCITY_MIN_COUNT}+ tiny online payments in ${VELOCITY_WINDOW_MIN} minutes.`,
        vi: `Ngày ${day}. Quy tắc chạy trên mọi giao dịch đã hoàn tất: trên ${formatMoney(AML_THRESHOLD_CENTS)}, hoặc từ ${VELOCITY_MIN_COUNT} giao dịch trực tuyến rất nhỏ trong ${VELOCITY_WINDOW_MIN} phút.`,
      })}
      onClose={close}
    >
      <ol className="mb-4 flex items-center gap-2" aria-label={tr({ en: 'Steps', vi: 'Các bước' })} data-testid="aml-steps">
        {([1, 2, 3] as const).map((n) => {
          const active = step === n;
          const done = step > n;
          return (
            <li key={n} className="flex flex-1 items-center gap-2">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-black ${active ? 'bg-sky-400 text-slate-950' : done ? 'bg-lime-400 text-slate-950' : 'bg-slate-800 text-slate-400'}`} aria-current={active ? 'step' : undefined}>
                {done ? '✓' : n}
              </span>
              <span className={`text-[12.5px] font-semibold ${active ? 'text-slate-50' : 'text-slate-400'}`}>{tr(STEP_TEXT[n])}</span>
              {n < 3 && <span className="h-px flex-1 bg-slate-700" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <section data-testid="aml-monitor">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-slate-950 p-0.5 ring-1 ring-slate-800" role="group">
              {(['all', 'open'] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${filter === f ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-100'}`}>
                  {f === 'all' ? tr({ en: `All alerts (${alerts.length})`, vi: `Tất cả (${alerts.length})` }) : tr({ en: `Open (${alerts.filter((a) => !cases[a.id]).length})`, vi: `Đang mở (${alerts.filter((a) => !cases[a.id]).length})` })}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <button
              type="button"
              onClick={sendTest}
              disabled={dayOver || minute >= WORK_END}
              data-testid="aml-send-test"
              title={tr({ en: 'Send a well-formed $12,500 instant business transfer into the bank to see the >$10,000 rule fire', vi: 'Gửi một lệnh chuyển khoản doanh nghiệp $12,500 hợp lệ vào ngân hàng để thấy quy tắc >$10,000 kích hoạt' })}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] font-semibold text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              🧪 {tr({ en: 'Send a $12,500 test transfer', vi: 'Gửi lệnh chuyển thử $12,500' })}
            </button>
          </div>
          {sent && (
            <p className="mb-3 rounded-lg border border-sky-400/40 bg-sky-950/40 px-3 py-2 text-[12px] text-sky-100" role="status" data-testid="aml-test-sent">
              {tr({ en: `Test transfer ${sent} is in the bank. Its alert appears here as soon as it finishes.`, vi: `Lệnh chuyển thử ${sent} đã vào ngân hàng. Cảnh báo sẽ hiện ở đây ngay khi giao dịch hoàn tất.` })}
            </p>
          )}
          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-[12.5px] leading-relaxed text-slate-400" data-testid="aml-empty">
              {tr({
                en: 'No alerts yet today. Ordinary traffic rarely crosses $10,000; send the test transfer, or play day 3 (botnet) to see a velocity burst.',
                vi: 'Hôm nay chưa có cảnh báo. Giao dịch thông thường hiếm khi vượt $10,000; hãy gửi lệnh chuyển thử, hoặc chạy ngày 3 (botnet) để thấy tần suất bất thường.',
              })}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <table className="w-full text-left text-[12px]" data-testid="aml-alerts">
                <thead className="bg-slate-950 text-[10.5px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{tr({ en: 'Time', vi: 'Giờ' })}</th>
                    <th className="px-3 py-2 font-semibold">{tr({ en: 'Rule', vi: 'Quy tắc' })}</th>
                    <th className="px-3 py-2 font-semibold">{tr({ en: 'What', vi: 'Nội dung' })}</th>
                    <th className="px-3 py-2 text-right font-semibold">{tr({ en: 'Value', vi: 'Giá trị' })}</th>
                    <th className="px-3 py-2 text-right font-semibold">{tr({ en: 'Risk', vi: 'Rủi ro' })}</th>
                    <th className="px-3 py-2 font-semibold">{tr({ en: 'Status', vi: 'Trạng thái' })}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((a) => (
                    <tr key={a.id} className="border-t border-slate-800 text-slate-200 hover:bg-slate-800/40" data-testid="aml-alert" data-kind={a.kind}>
                      <td className="px-3 py-2 font-mono tabular-nums text-slate-400">{formatClock(Math.floor(a.minute))}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${KIND_TEXT[a.kind].tone}`}>
                          <span aria-hidden="true">{KIND_TEXT[a.kind].icon}</span>
                          {tr(KIND_TEXT[a.kind].label)}
                        </span>
                      </td>
                      <td className="max-w-[16rem] truncate px-3 py-2" title={localizeScenarioText(a.scenario)}>
                        {a.kind === 'VELOCITY_BURST' ? tr({ en: `${a.count} payments${isBotBurst(a, log) ? ' (botnet)' : ''}`, vi: `${a.count} giao dịch${isBotBurst(a, log) ? ' (botnet)' : ''}` }) : localizeScenarioText(a.scenario)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{formatMoney(a.amountCents)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono font-bold ${a.riskScore >= 80 ? 'text-rose-300' : 'text-amber-300'}`}>{a.riskScore}</span>
                      </td>
                      <td className="px-3 py-2">{statusBadge(cases[a.id])}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(a.id);
                            setStep(2);
                          }}
                          data-testid="aml-investigate"
                          className="rounded-md bg-sky-500 px-2.5 py-1 text-[11.5px] font-bold text-sky-950 hover:bg-sky-400"
                        >
                          {tr({ en: 'Investigate →', vi: 'Điều tra →' })}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {step === 2 && alert && (
        <section className="space-y-3" data-testid="aml-investigate-step">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${KIND_TEXT[alert.kind].tone}`}>
              {KIND_TEXT[alert.kind].icon} {tr(KIND_TEXT[alert.kind].label)}
            </span>
            <span className="font-mono text-[12px] text-slate-400">{alert.id}</span>
            {statusBadge(c)}
            <span className="flex-1" />
            <span className="text-[12px] text-slate-300">
              {tr({ en: 'Risk score', vi: 'Điểm rủi ro' })} <b className="font-mono text-rose-300">{alert.riskScore}</b>
            </span>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{tr({ en: 'Risk factors', vi: 'Yếu tố rủi ro' })}</h3>
            <ul className="mt-2 space-y-1.5" data-testid="aml-factors">
              {riskFactors(alert, rows).map((f, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-slate-200">
                  <span className="text-rose-300" aria-hidden="true">
                    ▲
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="max-h-56 overflow-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-[11.5px]">
              <thead className="sticky top-0 bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-1.5">{tr({ en: 'Payment', vi: 'Giao dịch' })}</th>
                  <th className="px-3 py-1.5">{tr({ en: 'Time', vi: 'Giờ' })}</th>
                  <th className="px-3 py-1.5">{tr({ en: 'Scenario', vi: 'Tình huống' })}</th>
                  <th className="px-3 py-1.5 text-right">{tr({ en: 'Amount', vi: 'Số tiền' })}</th>
                  <th className="px-3 py-1.5">{tr({ en: 'Answer', vi: 'Phản hồi' })}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r) => (
                  <tr key={r.id} className="border-t border-slate-800 text-slate-300">
                    <td className="px-3 py-1.5 font-mono">{r.id}</td>
                    <td className="px-3 py-1.5 font-mono tabular-nums">{formatClock(Math.floor(r.minute))}</td>
                    <td className="px-3 py-1.5">{scenarioLabel(r.scenario)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatMoney(r.amountCents)}</td>
                    <td className={`px-3 py-1.5 ${r.status === 'APPROVED' ? 'text-lime-300' : 'text-rose-300'}`}>{r.responseCode ? rcLabel(r.responseCode, 'expert') : r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c?.status === 'SAR_FILED' && (
            <p className="rounded-lg border border-lime-400/40 bg-lime-950/30 px-3 py-2 text-[12px] text-lime-100">
              {tr({ en: `SAR filed with the regulator, reference ${c.reference}.`, vi: `Đã nộp SAR cho cơ quan quản lý, mã tham chiếu ${c.reference}.` })}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={() => setStep(1)} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800">
              ← {tr({ en: 'All alerts', vi: 'Tất cả cảnh báo' })}
            </button>
            <span className="flex-1" />
            {c ? (
              <button type="button" onClick={() => amlStore.getState().reopen(alert.id)} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800">
                {tr({ en: 'Reopen the case', vi: 'Mở lại hồ sơ' })}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    amlStore.getState().closeFalsePositive(alert.id, day, minute);
                    setStep(1);
                  }}
                  data-testid="aml-close-fp"
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] font-semibold text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700"
                >
                  {tr({ en: 'Close as false positive', vi: 'Đóng: cảnh báo sai' })}
                </button>
                <button type="button" onClick={() => setStep(3)} data-testid="aml-escalate" className="rounded-lg bg-rose-500 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-rose-400">
                  {tr({ en: 'Escalate: draft a SAR →', vi: 'Chuyển cấp: soạn SAR →' })}
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {step === 3 && alert && (
        <section data-testid="aml-report-step">
          {c?.status === 'SAR_FILED' ? (
            <div className="space-y-3 text-center" data-testid="sar-filed">
              <div className="text-[40px]" aria-hidden="true">
                ✅
              </div>
              <h3 className="text-[16px] font-bold text-slate-50">{tr({ en: 'Suspicious Activity Report submitted', vi: 'Đã nộp báo cáo giao dịch đáng ngờ' })}</h3>
              <p className="text-[12.5px] text-slate-300">
                {tr({ en: 'Reference', vi: 'Mã tham chiếu' })} <span className="font-mono font-bold text-lime-300" data-testid="sar-reference">{c.reference}</span> ·{' '}
                {tr({ en: `filed day ${c.day} at ${formatClock(Math.floor(c.filedMinute))}`, vi: `nộp ngày ${c.day} lúc ${formatClock(Math.floor(c.filedMinute))}` })}
              </p>
              <p className="mx-auto max-w-lg text-[12px] leading-relaxed text-slate-400">
                {tr({
                  en: 'In Australia this is a suspicious matter report to AUSTRAC, due within three business days (24 hours for terrorism financing). The customer must not be told.',
                  vi: 'Tại Úc đây là báo cáo vấn đề đáng ngờ gửi AUSTRAC, hạn trong ba ngày làm việc (24 giờ với tài trợ khủng bố). Không được thông báo cho khách hàng.',
                })}
              </p>
              <button type="button" onClick={() => setStep(1)} className="rounded-lg bg-lime-400 px-4 py-1.5 text-[12.5px] font-bold text-slate-950 hover:bg-lime-300">
                {tr({ en: 'Back to the alerts', vi: 'Quay lại danh sách cảnh báo' })}
              </button>
            </div>
          ) : (
            <SarForm alert={alert} day={day} minute={minute} onFiled={() => setStep(3)} onBack={() => setStep(2)} />
          )}
        </section>
      )}
    </Modal>
  );
}
