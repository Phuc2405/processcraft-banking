import { useState } from 'react';
import { tr, type Localized } from '../../i18n/locale';
import { uiStore, useUiStore } from '../../store/uiStore';
import { Modal } from '../shell/Modal';

/**
 * Payment Rail Benchmark: card schemes (ISO 8583), instant account-to-account (ISO 20022) and BNPL Pay-in-4, side by side on
 * latency, settlement, merchant fees, fraud risk and chargeback rights. Each cell has the fact and a 1-5 score from the
 * merchant's point of view (5 is best for the merchant), drawn as a bar so the trade-offs show at a glance.
 *
 * Figures are typical Australian market ranges for teaching, not quotes from any provider.
 */

type RailId = 'card' | 'a2a' | 'bnpl';
type MetricId = 'latency' | 'settlement' | 'mdr' | 'fraud' | 'chargeback' | 'standard' | 'finality';

interface Cell {
  text: Localized<string>;
  /** 1 worst, 5 best, from the merchant's side. */
  score: 1 | 2 | 3 | 4 | 5;
}

const RAILS: ReadonlyArray<{ id: RailId; icon: string; name: Localized<string>; sub: string; accent: string }> = [
  { id: 'card', icon: '💳', name: { en: 'Card Schemes', vi: 'Tổ chức thẻ' }, sub: 'ISO 8583 · Visa / Mastercard / eftpos', accent: '#a78bfa' },
  { id: 'a2a', icon: '⚡', name: { en: 'Instant A2A', vi: 'Chuyển khoản tức thì A2A' }, sub: 'ISO 20022 · NPP / PayTo / PayID', accent: '#38bdf8' },
  { id: 'bnpl', icon: '🛍️', name: { en: 'BNPL Pay-in-4', vi: 'BNPL trả 4 kỳ' }, sub: 'Lender API · Afterpay / Zip style', accent: '#f472b6' },
];

const METRICS: ReadonlyArray<{ id: MetricId; label: Localized<string>; hint: Localized<string> }> = [
  { id: 'latency', label: { en: 'Latency (authorisation)', vi: 'Độ trễ (cấp phép)' }, hint: { en: 'How long the customer waits for a yes or no.', vi: 'Khách hàng chờ bao lâu để nhận câu trả lời.' } },
  { id: 'settlement', label: { en: 'Settlement to merchant', vi: 'Quyết toán cho cửa hàng' }, hint: { en: 'When the money actually reaches the merchant’s account.', vi: 'Khi nào tiền thật sự vào tài khoản cửa hàng.' } },
  { id: 'mdr', label: { en: 'Merchant fees (MDR)', vi: 'Phí cửa hàng (MDR)' }, hint: { en: 'What the merchant pays per sale.', vi: 'Cửa hàng trả bao nhiêu cho mỗi giao dịch.' } },
  { id: 'fraud', label: { en: 'Fraud risk', vi: 'Rủi ro gian lận' }, hint: { en: 'How exposed the merchant is to fraud losses.', vi: 'Cửa hàng phơi nhiễm tổn thất gian lận đến đâu.' } },
  { id: 'chargeback', label: { en: 'Chargeback rights', vi: 'Quyền tra soát hoàn tiền' }, hint: { en: 'Can the customer force the money back? (Good for customers, a cost for merchants.)', vi: 'Khách có thể buộc hoàn tiền không? (Tốt cho khách, là chi phí cho cửa hàng.)' } },
  { id: 'standard', label: { en: 'Message standard', vi: 'Chuẩn thông điệp' }, hint: { en: 'The data format between the banks.', vi: 'Định dạng dữ liệu giữa các ngân hàng.' } },
  { id: 'finality', label: { en: 'Finality', vi: 'Tính cuối cùng' }, hint: { en: 'Once paid, can it be pulled back?', vi: 'Đã trả rồi, có thể thu hồi không?' } },
];

const GRID: Record<RailId, Record<MetricId, Cell>> = {
  card: {
    latency: { text: { en: '1-2 s authorisation (0100/0110)', vi: '1-2 giây cấp phép (0100/0110)' }, score: 4 },
    settlement: { text: { en: 'T+1 to T+2, after the nightly clearing batch', vi: 'T+1 đến T+2, sau lô bù trừ ban đêm' }, score: 2 },
    mdr: { text: { en: '0.5%-1.9% (interchange + scheme fee + acquirer margin)', vi: '0,5%-1,9% (interchange + phí tổ chức thẻ + biên ngân hàng thanh toán)' }, score: 2 },
    fraud: { text: { en: 'Medium: CNP fraud; 3DS shifts liability to the issuer', vi: 'Trung bình: gian lận CNP; 3DS chuyển trách nhiệm sang ngân hàng phát hành' }, score: 3 },
    chargeback: { text: { en: 'Strong: 120-day dispute window, scheme arbitration', vi: 'Mạnh: thời hạn khiếu nại 120 ngày, tổ chức thẻ phân xử' }, score: 1 },
    standard: { text: { en: 'ISO 8583 bitmapped fixed fields', vi: 'ISO 8583 trường cố định có bitmap' }, score: 3 },
    finality: { text: { en: 'Reversible: voids, refunds and chargebacks', vi: 'Có thể đảo: hủy, hoàn tiền và tra soát' }, score: 2 },
  },
  a2a: {
    latency: { text: { en: 'Under 15 s end to end, 24/7', vi: 'Dưới 15 giây từ đầu đến cuối, 24/7' }, score: 4 },
    settlement: { text: { en: 'Real time (RTGS-backed), seconds', vi: 'Thời gian thực (có RTGS bảo đảm), vài giây' }, score: 5 },
    mdr: { text: { en: 'Flat cents per payment, often under 0.2%', vi: 'Vài cent cố định mỗi giao dịch, thường dưới 0,2%' }, score: 5 },
    fraud: { text: { en: 'Authorised push-payment scams; no network fraud scoring', vi: 'Lừa đảo khách tự chuyển tiền; không có chấm điểm gian lận của mạng lưới' }, score: 3 },
    chargeback: { text: { en: 'None: only a recall request the receiver may refuse', vi: 'Không có: chỉ có yêu cầu thu hồi mà bên nhận có thể từ chối' }, score: 5 },
    standard: { text: { en: 'ISO 20022 XML (pacs.008 / pacs.002), rich remittance data', vi: 'ISO 20022 XML (pacs.008 / pacs.002), dữ liệu chuyển tiền phong phú' }, score: 5 },
    finality: { text: { en: 'Final and irrevocable once settled', vi: 'Cuối cùng và không thể hủy sau khi quyết toán' }, score: 5 },
  },
  bnpl: {
    latency: { text: { en: '2-5 s including the credit decision', vi: '2-5 giây kể cả quyết định tín dụng' }, score: 3 },
    settlement: { text: { en: 'Merchant paid in full in 1-3 days; lender carries the instalments', vi: 'Cửa hàng được trả đủ trong 1-3 ngày; bên cho vay gánh các kỳ trả góp' }, score: 3 },
    mdr: { text: { en: '3%-6% plus a fixed fee per order', vi: '3%-6% cộng phí cố định mỗi đơn' }, score: 1 },
    fraud: { text: { en: 'Low for the merchant: credit and fraud risk sit with the lender', vi: 'Thấp với cửa hàng: rủi ro tín dụng và gian lận thuộc bên cho vay' }, score: 4 },
    chargeback: { text: { en: 'Lender dispute process; plan paused while it runs', vi: 'Quy trình khiếu nại của bên cho vay; kế hoạch tạm dừng khi xử lý' }, score: 3 },
    standard: { text: { en: 'Provider REST/JSON APIs; card rails underneath', vi: 'API REST/JSON của nhà cung cấp; nền tảng thẻ bên dưới' }, score: 3 },
    finality: { text: { en: 'Merchant payment final; customer repays over 6 weeks', vi: 'Khoản trả cho cửa hàng là cuối cùng; khách trả dần trong 6 tuần' }, score: 4 },
  },
};

function Bar({ score, accent }: { score: number; accent: string }) {
  return (
    <span className="mt-1.5 flex gap-0.5" aria-label={`${score}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i <= score ? accent : '#1e293b' }} />
      ))}
    </span>
  );
}

/** The benchmark modal. */
export function PaymentBenchmarkModal() {
  const open = useUiStore((s) => s.overlay === 'benchmark');
  const [focus, setFocus] = useState<RailId | null>(null);
  if (!open) return null;
  const close = (): void => uiStore.getState().close();
  const totals = Object.fromEntries(RAILS.map((r) => [r.id, METRICS.reduce((n, m) => n + GRID[r.id][m.id].score, 0)])) as Record<RailId, number>;
  const best = (Object.keys(totals) as RailId[]).reduce((a, b) => (totals[b] > totals[a] ? b : a));
  return (
    <Modal
      testId="benchmark-modal"
      icon="📊"
      width="max-w-5xl"
      title={tr({ en: 'Payment Rail Benchmark: Cards vs Instant A2A vs BNPL', vi: 'So sánh kênh thanh toán: Thẻ vs A2A tức thì vs BNPL' })}
      subtitle={tr({
        en: 'Typical Australian ranges for teaching. Bars score each rail from the merchant’s side: a full bar is best for the merchant.',
        vi: 'Khoảng giá trị điển hình tại Úc dùng cho học tập. Thanh điểm đánh giá từ phía cửa hàng: thanh đầy là tốt nhất cho cửa hàng.',
      })}
      onClose={close}
      footer={
        <button type="button" onClick={close} className="rounded-lg bg-lime-400 px-4 py-1.5 text-[12.5px] font-bold text-slate-950 hover:bg-lime-300">
          {tr({ en: 'Close', vi: 'Đóng' })}
        </button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-[12px]" data-testid="benchmark-table">
          <thead>
            <tr>
              <th className="w-[19%] px-3 py-2 align-bottom text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{tr({ en: 'Dimension', vi: 'Tiêu chí' })}</th>
              {RAILS.map((r) => (
                <th key={r.id} className="px-3 py-2 align-bottom">
                  <button
                    type="button"
                    onClick={() => setFocus(focus === r.id ? null : r.id)}
                    aria-pressed={focus === r.id}
                    data-testid={`benchmark-rail-${r.id}`}
                    className="w-full rounded-xl border px-3 py-2 text-left transition hover:bg-slate-800/50"
                    style={{ borderColor: focus === r.id ? r.accent : `${r.accent}55`, background: focus === r.id ? `${r.accent}1a` : undefined }}
                  >
                    <span className="flex items-center gap-2 text-[14px] font-bold text-slate-50">
                      <span aria-hidden="true">{r.icon}</span>
                      {tr(r.name)}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10.5px] font-normal text-slate-400">{r.sub}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m.id} data-testid={`benchmark-row-${m.id}`}>
                <th scope="row" className="border-t border-slate-800 px-3 py-2.5 align-top">
                  <span className="block text-[12.5px] font-semibold text-slate-100">{tr(m.label)}</span>
                  <span className="mt-0.5 block text-[11px] font-normal leading-snug text-slate-500">{tr(m.hint)}</span>
                </th>
                {RAILS.map((r) => {
                  const cell = GRID[r.id][m.id];
                  const top = Math.max(...RAILS.map((x) => GRID[x.id][m.id].score)) === cell.score;
                  return (
                    <td key={r.id} className={`border-t border-slate-800 px-3 py-2.5 align-top transition-opacity ${focus && focus !== r.id ? 'opacity-40' : ''}`}>
                      <span className="block leading-snug text-slate-200">
                        {tr(cell.text)}
                        {top && (
                          <span className="ml-1.5 rounded bg-lime-400/15 px-1 text-[10px] font-bold text-lime-300" title={tr({ en: 'Best for the merchant on this dimension', vi: 'Tốt nhất cho cửa hàng ở tiêu chí này' })}>
                            ★
                          </span>
                        )}
                      </span>
                      <Bar score={cell.score} accent={r.accent} />
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row" className="border-t border-slate-700 px-3 py-2.5 text-[12.5px] font-bold text-slate-100">
                {tr({ en: 'Merchant score', vi: 'Điểm cho cửa hàng' })}
              </th>
              {RAILS.map((r) => (
                <td key={r.id} className="border-t border-slate-700 px-3 py-2.5" data-testid={`benchmark-total-${r.id}`}>
                  <span className="font-mono text-[18px] font-black" style={{ color: r.accent }}>
                    {totals[r.id]}
                  </span>
                  <span className="text-[11px] text-slate-500"> / {METRICS.length * 5}</span>
                  {best === r.id && <span className="ml-2 rounded-full bg-lime-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">{tr({ en: 'Best for merchants', vi: 'Tốt nhất cho cửa hàng' })}</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {[
          {
            icon: '💳',
            text: {
              en: 'Cards win on reach and consumer protection: the chargeback right is why shoppers trust them online, and merchants pay for it in fees and disputes.',
              vi: 'Thẻ thắng về độ phủ và bảo vệ người tiêu dùng: quyền tra soát là lý do người mua tin dùng khi mua trực tuyến, và cửa hàng trả giá bằng phí và tranh chấp.',
            },
          },
          {
            icon: '⚡',
            text: {
              en: 'Instant A2A is cheapest and settles in seconds, but it is final: a scam payment cannot be charged back, so the bank’s checks must happen before the money moves.',
              vi: 'A2A tức thì rẻ nhất và quyết toán trong vài giây, nhưng là cuối cùng: giao dịch lừa đảo không thể tra soát, nên kiểm tra của ngân hàng phải diễn ra trước khi tiền đi.',
            },
          },
          {
            icon: '🛍️',
            text: {
              en: 'BNPL is the most expensive for merchants but lifts basket size; the lender, not the merchant, carries the credit and fraud risk of the instalments.',
              vi: 'BNPL đắt nhất với cửa hàng nhưng làm tăng giá trị giỏ hàng; bên cho vay, không phải cửa hàng, gánh rủi ro tín dụng và gian lận của các kỳ trả góp.',
            },
          },
        ].map((n, i) => (
          <p key={i} className="flex gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-[12px] leading-relaxed text-slate-300">
            <span aria-hidden="true">{n.icon}</span>
            {tr(n.text)}
          </p>
        ))}
      </div>
    </Modal>
  );
}
