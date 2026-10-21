import { CHAOS_RESPONSE_CODE, CHAOS_TOGGLE_IDS, congestionOn, type ChaosToggleId } from '../../engine/chaos';
import { tr, type Localized } from '../../i18n/locale';
import { formatMoney } from '../../sim/kpis';
import { bankStore, useBankStore } from '../../store/bankStore';
import { uiStore, useUiStore } from '../../store/uiStore';
import { Modal } from '../shell/Modal';
import { exportAudit } from './auditExport';

const TOGGLE_TEXT: Record<ChaosToggleId, { icon: string; title: Localized<string>; body: Localized<string>; rc: string }> = {
  posOutage: {
    icon: '🔌',
    title: { en: 'POS Station Outage', vi: 'Sự cố trạm POS' },
    body: {
      en: 'Every card-present tap is refused: the terminals cannot reach the switch.',
      vi: 'Mọi giao dịch chạm thẻ tại quầy đều bị từ chối: máy POS không kết nối được bộ chuyển mạch.',
    },
    rc: `RC ${CHAOS_RESPONSE_CODE.posOutage}`,
  },
  hsmFailure: {
    icon: '🔐',
    title: { en: '3DS HSM Cryptography Failure', vi: 'Lỗi mật mã HSM của 3DS' },
    body: {
      en: 'The hardware security module that signs 3DS and dCVV cryptograms is down: every online, virtual-card and Pay-in-4 payment fails.',
      vi: 'Thiết bị bảo mật phần cứng ký mã 3DS và dCVV ngừng hoạt động: mọi giao dịch trực tuyến, thẻ ảo và trả góp 4 kỳ đều thất bại.',
    },
    rc: `RC ${CHAOS_RESPONSE_CODE.hsmFailure}`,
  },
  congestion: {
    icon: '🚦',
    title: { en: 'Network Congestion', vi: 'Nghẽn mạng' },
    body: {
      en: '+4.5 s on every payment and 35% hit a 504 timeout. An automatic status inquiry recovers 80%; the rest are declined and reversed.',
      vi: 'Mỗi giao dịch chậm thêm 4,5 giây và 35% gặp lỗi 504. Truy vấn trạng thái tự động cứu được 80%; phần còn lại bị từ chối và đảo.',
    },
    rc: `RC ${CHAOS_RESPONSE_CODE.timeout}`,
  },
  fatigueSpike: {
    icon: '🥱',
    title: { en: 'Staff Fatigue Spike', vi: 'Nhân viên kiệt sức đột ngột' },
    body: {
      en: 'Everyone on shift is pushed to at least 90% fatigue: queues slow down and mistakes multiply.',
      vi: 'Mọi người trong ca bị đẩy lên ít nhất 90% mệt mỏi: hàng chờ chậm lại và sai sót tăng vọt.',
    },
    rc: '—',
  },
};

const SCENARIO_TEXT: Record<'NONE' | 'FLASH_SURGE' | 'BOTNET', { icon: string; title: Localized<string>; body: Localized<string> }> = {
  NONE: {
    icon: '🌤️',
    title: { en: 'An ordinary day', vi: 'Một ngày bình thường' },
    body: { en: 'No scripted scenario today. Switch faults on below to stress the bank.', vi: 'Hôm nay không có kịch bản nào. Bật sự cố bên dưới để thử sức ngân hàng.' },
  },
  FLASH_SURGE: {
    icon: '🛍️',
    title: { en: 'Day 2: Flash Sale Traffic Spike', vi: 'Ngày 2: Lưu lượng tăng vọt do Flash Sale' },
    body: {
      en: 'Three times the usual customers and a congested network. 504 timeouts are chased by automatic status inquiries.',
      vi: 'Lượng khách gấp ba bình thường và mạng bị nghẽn. Lỗi 504 được xử lý bằng truy vấn trạng thái tự động.',
    },
  },
  BOTNET: {
    icon: '🤖',
    title: { en: 'Day 3: Botnet CVV Brute-Force & Staff Fatigue', vi: 'Ngày 3: Botnet dò CVV & nhân viên kiệt sức' },
    body: {
      en: 'Bots fire $1 card tests four at a time. Each alert tires the fraud desk; above 70% fatigue analysts start waving bots through.',
      vi: 'Bot bắn các giao dịch dò thẻ $1, mỗi lần bốn cái. Mỗi cảnh báo làm đội gian lận mệt thêm; trên 70% mệt mỏi, chuyên viên bắt đầu cho bot lọt qua.',
    },
  },
};

function Stat({ label, value, tone = 'text-slate-100', testId }: { label: string; value: string | number; tone?: string; testId?: string }) {
  return (
    <div className="rounded-lg bg-slate-950/70 px-3 py-2 ring-1 ring-slate-800" data-testid={testId}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 font-mono text-[16px] font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

/** The Chaos Monkey Active Fault Injection panel. */
export function ChaosPanel() {
  const open = useUiStore((s) => s.overlay === 'chaos');
  const chaos = useBankStore((s) => s.view.chaos);
  const day = useBankStore((s) => s.view.day);
  const setChaos = useBankStore((s) => s.setChaos);
  if (!open) return null;
  const close = (): void => uiStore.getState().close();
  const st = chaos.stats;
  const sc = SCENARIO_TEXT[chaos.scenario];
  const congestion = congestionOn(chaos.config, chaos.scenario);
  return (
    <Modal
      testId="chaos-panel"
      icon="🐒"
      title={tr({ en: 'Chaos Monkey: Active Fault Injection', vi: 'Chaos Monkey: Chủ động gây sự cố' })}
      subtitle={tr({ en: `Day ${day}. Faults apply to new payments from the next beat; the Ops feed and alerts show every hit.`, vi: `Ngày ${day}. Sự cố áp dụng cho giao dịch mới từ nhịp tiếp theo; bảng tin vận hành và cảnh báo ghi lại mọi tác động.` })}
      onClose={close}
      footer={
        <>
          <button type="button" onClick={() => exportAudit(bankStore.getState().sim)} data-testid="chaos-export-audit" className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] font-semibold text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700">
            <span aria-hidden="true">📥</span> {tr({ en: 'Export Audit Report (CSV)', vi: 'Xuất báo cáo kiểm toán (CSV)' })}
          </button>
          <button
            type="button"
            onClick={() => setChaos({ posOutage: false, hsmFailure: false, congestion: false, fatigueSpike: false })}
            data-testid="chaos-clear"
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] font-semibold text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700"
          >
            {tr({ en: 'Clear all faults', vi: 'Tắt mọi sự cố' })}
          </button>
          <button type="button" onClick={close} className="rounded-lg bg-lime-400 px-4 py-1.5 text-[12.5px] font-bold text-slate-950 hover:bg-lime-300">
            {tr({ en: 'Done', vi: 'Xong' })}
          </button>
        </>
      }
    >
      <section className={`flex items-start gap-3 rounded-xl border p-3 ${chaos.scenario === 'NONE' ? 'border-slate-800 bg-slate-950/50' : 'border-rose-400/50 bg-rose-950/40'}`} data-testid="chaos-scenario" data-scenario={chaos.scenario}>
        <span className="text-[24px] leading-none" aria-hidden="true">
          {sc.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-bold text-slate-50">{tr(sc.title)}</h3>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-300">{tr(sc.body)}</p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[11.5px] text-slate-300" title={tr({ en: 'Takes effect from the next day', vi: 'Có hiệu lực từ ngày tiếp theo' })}>
          <input type="checkbox" checked={chaos.config.scriptedDays} onChange={(e) => setChaos({ scriptedDays: e.target.checked })} data-testid="chaos-scripted" className="h-4 w-4 accent-rose-400" />
          {tr({ en: 'Scripted days 2 & 3', vi: 'Kịch bản ngày 2 & 3' })}
        </label>
      </section>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {CHAOS_TOGGLE_IDS.map((id) => {
          const t = TOGGLE_TEXT[id];
          const on = chaos.config[id] || (id === 'congestion' && congestion);
          const forced = id === 'congestion' && !chaos.config.congestion && congestion;
          return (
            <button
              key={id}
              type="button"
              role="switch"
              aria-checked={on}
              disabled={forced}
              onClick={() => setChaos({ [id]: !chaos.config[id] })}
              data-testid={`chaos-toggle-${id}`}
              data-on={on}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${on ? 'border-rose-400/70 bg-rose-500/10' : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800/50'} disabled:cursor-not-allowed`}
            >
              <span className="text-[20px] leading-none" aria-hidden="true">
                {t.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-slate-50">{tr(t.title)}</span>
                  <span className="rounded bg-slate-800 px-1.5 py-px font-mono text-[10px] text-slate-300">{t.rc}</span>
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-400">{tr(t.body)}</span>
                {forced && <span className="mt-1 block text-[11px] font-semibold text-rose-300">{tr({ en: 'On for the flash sale', vi: 'Đang bật do Flash Sale' })}</span>}
              </span>
              <span className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-rose-400' : 'bg-slate-700'}`} aria-hidden="true">
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </span>
            </button>
          );
        })}
      </div>

      <h3 className="mt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">{tr({ en: 'Impact today', vi: 'Tác động hôm nay' })}</h3>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="chaos-stats">
        <Stat label={tr({ en: 'Surge customers', vi: 'Khách tăng thêm' })} value={st.surgeCustomers} testId="chaos-stat-surge" />
        <Stat label={tr({ en: '504 timeouts', vi: 'Lỗi 504' })} value={st.timeouts504} tone="text-amber-300" testId="chaos-stat-504" />
        <Stat label={tr({ en: 'Inquiry recovered', vi: 'Truy vấn cứu được' })} value={st.inquiriesRecovered} tone="text-lime-300" />
        <Stat label={tr({ en: 'Timed out (RC 68)', vi: 'Quá hạn (RC 68)' })} value={st.inquiriesFailed} tone="text-rose-300" />
        <Stat label={tr({ en: 'POS outage (RC 91)', vi: 'Sự cố POS (RC 91)' })} value={st.posOutageDeclines} tone="text-rose-300" />
        <Stat label={tr({ en: 'HSM failure (RC 96)', vi: 'Lỗi HSM (RC 96)' })} value={st.hsmDeclines} tone="text-rose-300" />
        <Stat label={tr({ en: 'Bot attempts', vi: 'Lượt bot thử' })} value={st.botAttempts} testId="chaos-stat-bots" />
        <Stat label={tr({ en: 'Bots blocked', vi: 'Bot bị chặn' })} value={st.botBlocked} tone="text-lime-300" />
        <Stat label={tr({ en: 'Bots approved', vi: 'Bot lọt qua' })} value={st.botApproved} tone="text-rose-300" />
        <Stat label={tr({ en: 'Fatigue mis-approvals', vi: 'Duyệt nhầm do mệt' })} value={st.misApprovals} tone="text-rose-300" />
        <Stat label={tr({ en: 'Velocity alerts', vi: 'Cảnh báo tần suất' })} value={st.velocityAlerts} tone="text-amber-300" />
        <Stat label={tr({ en: 'Added latency', vi: 'Độ trễ thêm' })} value={`${Math.round(st.addedLatencyMs / 1000).toLocaleString()} s`} />
      </div>
      <p className="mt-3 text-[11.5px] leading-snug text-slate-500">
        {tr({
          en: `Bot losses are tiny on their own (${formatMoney(100)} each) but every approved bot confirms a stolen card is live, which is what the fraudster sells on.`,
          vi: `Tổn thất từ bot rất nhỏ (${formatMoney(100)} mỗi lần) nhưng mỗi bot lọt qua xác nhận một thẻ bị đánh cắp còn hoạt động, và đó là thứ kẻ gian đem bán.`,
        })}
      </p>
    </Modal>
  );
}
