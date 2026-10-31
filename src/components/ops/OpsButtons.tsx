import { tr } from '../../i18n/locale';
import { useBankStore } from '../../store/bankStore';
import { uiStore } from '../../store/uiStore';

/** The header buttons of the ops overlays. They live apart from the overlays so the overlays can be loaded on demand. */

/** The header button that opens the AML desk. */
export function AmlButton() {
  return (
    <button
      type="button"
      onClick={() => uiStore.getState().toggle('aml')}
      data-testid="aml-button"
      title={tr({ en: 'AML / SAR compliance desk', vi: 'Bàn tuân thủ AML / SAR' })}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[12px] font-semibold text-slate-200 ring-1 ring-slate-700 transition hover:bg-slate-800"
    >
      <span aria-hidden="true">🛡️</span>
      <span className="max-[1439px]:sr-only">AML</span>
    </button>
  );
}

/** The header button that opens the benchmark. */
export function BenchmarkButton() {
  return (
    <button
      type="button"
      onClick={() => uiStore.getState().toggle('benchmark')}
      data-testid="benchmark-button"
      title={tr({ en: 'Compare card schemes, instant A2A and BNPL', vi: 'So sánh thẻ, A2A tức thì và BNPL' })}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[12px] font-semibold text-slate-200 ring-1 ring-slate-700 transition hover:bg-slate-800"
    >
      <span aria-hidden="true">📊</span>
      <span className="max-[1439px]:sr-only">{tr({ en: 'Rails', vi: 'Kênh TT' })}</span>
    </button>
  );
}

/** The header button that opens the panel. Pulses while any fault or scenario is active. */
export function ChaosButton() {
  const active = useBankStore((s) => s.view.chaos.active);
  return (
    <button
      type="button"
      onClick={() => uiStore.getState().toggle('chaos')}
      data-testid="chaos-button"
      data-active={active}
      title={tr({ en: 'Chaos Monkey: inject faults and see the scripted day 2 / day 3 scenarios', vi: 'Chaos Monkey: gây sự cố và xem kịch bản ngày 2 / ngày 3' })}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] font-semibold ring-1 transition ${active ? 'bg-rose-500/20 text-rose-100 ring-rose-400/70' : 'bg-slate-900 text-slate-200 ring-slate-700 hover:bg-slate-800'}`}
    >
      <span aria-hidden="true" className={active ? 'motion-safe:animate-pulse' : ''}>
        🐒
      </span>
      <span className="max-[1439px]:sr-only">{tr({ en: 'Chaos', vi: 'Sự cố' })}</span>
    </button>
  );
}
