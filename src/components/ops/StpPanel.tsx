import { formatMoney } from '../../sim/kpis';
import { DEFAULT_STP, STP_LIMITS, type StpConfig } from '../../sim/stpEngine';
import { useBankStore } from '../../store/bankStore';
import { uiStore, useUiStore } from '../../store/uiStore';
import { useMessages } from '../../utils/i18nHelper';
import { Modal } from '../shell/Modal';
import { stpMessages } from './stp.messages';

type Toggle = 'termDeposit' | 'cardFees' | 'kiosk';

const TOGGLES: ReadonlyArray<{ key: Toggle; icon: string }> = [
  { key: 'termDeposit', icon: '🏦' },
  { key: 'cardFees', icon: '💳' },
  { key: 'kiosk', icon: '🏧' },
];

function Switch({ on, onChange, testId, label }: { on: boolean; onChange: (v: boolean) => void; testId: string; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} data-testid={testId} className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-violet-400' : 'bg-slate-700'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function Slider({ label, hint, value, shown, min, max, step, disabled, onChange, testId }: { label: string; hint: string; value: number; shown: string; min: number; max: number; step: number; disabled: boolean; onChange: (v: number) => void; testId: string }) {
  return (
    <label title={hint} className={`block rounded-xl border border-slate-800 bg-slate-950/50 p-3 ${disabled ? 'opacity-50' : ''}`}>
      <span className="flex items-center justify-between gap-2 text-[14px] font-semibold text-slate-200">
        {label}
        <span className="font-mono text-[15px] font-bold text-violet-200" data-testid={`${testId}-value`}>
          {shown}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} data-testid={testId} className="mt-2 w-full accent-violet-400" />
    </label>
  );
}

function Stat({ label, hint, value, tone, testId }: { label: string; hint: string; value: string | number; tone: string; testId?: string }) {
  return (
    <div title={hint} className="cursor-help rounded-lg bg-slate-950/70 px-3 py-2 ring-1 ring-slate-800" data-testid={testId}>
      <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 font-mono text-[18px] font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

/** The STP drawer, while its overlay is open. */
export function StpPanel() {
  const open = useUiStore((s) => s.overlay === 'stp');
  return open ? <StpDrawer /> : null;
}

/** The STP configuration drawer: the bank-wide switch, the credit thresholds and the product toggles, with today's live STR. */
export function StpDrawer() {
  const m = useMessages(stpMessages);
  const stp = useBankStore((s) => s.stp);
  const tally = useBankStore((s) => s.view.stp);
  const bnplQueue = useBankStore((s) => s.view.stations.BNPL.queueLength);
  const setStp = useBankStore((s) => s.setStp);
  const close = (): void => uiStore.getState().close();
  const set = (patch: Partial<StpConfig>): void => setStp(patch);
  const sectionTitle = 'mt-4 text-[13px] font-bold uppercase tracking-wider text-slate-400';
  return (
    <Modal
      testId="stp-panel"
      icon="⚡"
      width="max-w-3xl"
      title={m('title')}
      subtitle={m('subtitle')}
      onClose={close}
      footer={
        <>
          <button type="button" onClick={() => set(DEFAULT_STP)} data-testid="stp-reset" className="rounded-lg bg-slate-800 px-3 py-1.5 text-[14px] font-semibold text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700">
            {m('reset')}
          </button>
          <button type="button" onClick={close} className="rounded-lg bg-violet-400 px-4 py-1.5 text-[14.5px] font-bold text-slate-950 hover:bg-violet-300">
            {m('done')}
          </button>
        </>
      }
    >
      <section className={`flex items-center gap-3 rounded-xl border p-3 ${stp.enabled ? 'border-violet-400/60 bg-violet-950/40' : 'border-slate-800 bg-slate-950/50'}`}>
        <span className="text-[24px] leading-none" aria-hidden="true">
          ⚡
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15.5px] font-bold text-slate-50">{m('globalTitle')}</h3>
          <p className="mt-0.5 text-[13.5px] leading-normal text-slate-300">{m('globalBody')}</p>
        </div>
        <Switch on={stp.enabled} onChange={(v) => set({ enabled: v })} testId="stp-enabled" label={m('globalTitle')} />
      </section>

      <h3 className={sectionTitle}>{m('creditTitle')}</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Slider label={m('amount')} hint={m('amountHint')} value={stp.bnplMaxCents} shown={formatMoney(stp.bnplMaxCents)} {...STP_LIMITS.bnplMaxCents} disabled={!stp.enabled} onChange={(v) => set({ bnplMaxCents: v })} testId="stp-amount" />
        <Slider label={m('dti')} hint={m('dtiHint')} value={stp.maxDtiPct} shown={`${stp.maxDtiPct}%`} {...STP_LIMITS.maxDtiPct} disabled={!stp.enabled} onChange={(v) => set({ maxDtiPct: v })} testId="stp-dti" />
      </div>
      <p className="mt-2 text-[13px] leading-normal text-slate-500">{m('creditRule', { amount: formatMoney(stp.bnplMaxCents), dti: stp.maxDtiPct })}</p>

      <h3 className={sectionTitle}>{m('routingTitle')}</h3>
      <div className="mt-2 grid gap-2">
        {TOGGLES.map((t) => (
          <div key={t.key} className={`flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 ${stp.enabled ? '' : 'opacity-50'}`}>
            <span className="text-[20px] leading-none" aria-hidden="true">
              {t.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-bold text-slate-50">{m(`${t.key}Title`)}</span>
              <span className="mt-0.5 block text-[13px] leading-normal text-slate-400">{m(`${t.key}Body`)}</span>
            </span>
            <Switch on={stp[t.key]} onChange={(v) => set({ [t.key]: v })} testId={`stp-toggle-${t.key}`} label={m(`${t.key}Title`)} />
          </div>
        ))}
      </div>

      <h3 className={sectionTitle}>{m('liveTitle')}</h3>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="stp-stats">
        <Stat label={m('straight')} hint={m('straightHint')} value={tally.straight} tone="text-violet-200" testId="stp-stat-straight" />
        <Stat label={m('manual')} hint={m('manualHint')} value={tally.manual} tone="text-amber-300" testId="stp-stat-manual" />
        <Stat label={m('fastFail')} hint={m('fastFailHint')} value={tally.fastFail} tone="text-rose-300" testId="stp-stat-fastfail" />
        <Stat label="STR" hint={m('rateHint')} value={`${Math.round(tally.rate * 100)}%`} tone="text-lime-300" testId="stp-stat-rate" />
      </div>
      <p className="mt-2 text-[13px] text-slate-500" data-testid="stp-bnpl-queue">
        {m('queue', { n: bnplQueue })}
      </p>
    </Modal>
  );
}
