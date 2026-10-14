import { memo } from 'react';
import { EOD_START } from '../../sim/clock';
import { GUIDED_FLOWS } from '../../sim/guidedFlows';
import { presetsFor, type PresetVariant } from '../../sim/presets';
import { activeFlowOf, useBankStore } from '../../store/bankStore';
import { useMapCentre } from './ViewportControls';

/**
 * The preset actions of the guided flow in focus, docked at the bottom of the map in the Beginner scope. Each button sends
 * one scripted payment into the live bank (or, for the night flow, runs the clock to 23:00), and the inspector follows it.
 */

const VARIANT: Record<PresetVariant, string> = {
  success: 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400',
  danger: 'bg-rose-500 text-white hover:bg-rose-400',
  primary: 'bg-sky-500 text-sky-950 hover:bg-sky-400',
  warning: 'bg-amber-400 text-amber-950 hover:bg-amber-300',
};

function PresetDockView() {
  const flow = useBankStore(activeFlowOf);
  const run = useBankStore((s) => s.runPreset);
  const dayOver = useBankStore((s) => s.view.dayOver);
  const night = useBankStore((s) => s.view.minute >= EOD_START);
  const solid = useBankStore((s) => s.viewMode === '3d');
  const running = useBankStore((s) => s.presetTrace !== null && !s.presetTrace.done);
  const left = useMapCentre();
  if (!flow) return null;
  const f = GUIDED_FLOWS[flow];
  return (
    <div
      style={{ left }}
      className={`absolute bottom-4 z-30 flex -translate-x-1/2 items-center gap-2 rounded-2xl transition-[left] duration-200 ease-out border border-slate-800 px-3 py-2 shadow-2xl ${solid ? 'bg-slate-900/95' : 'bg-slate-950/90 backdrop-blur-md'}`}
      role="toolbar"
      aria-label={`${f.title} actions`}
      data-testid="preset-dock"
      data-flow={flow}
    >
      <span className="mr-1 whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wider" style={{ color: f.accent }}>
        {f.code}. {f.title}
      </span>
      {presetsFor(flow).map((p) => {
        const blocked = dayOver || (p.id === 'eod' ? false : night);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => run(p.id)}
            disabled={blocked}
            title={dayOver ? 'Today is over: start the next day (or reset this one) to send another payment.' : blocked ? 'The branch is closed for the night cycle. Start the next day to send another payment.' : p.hint}
            data-testid={`preset-${p.id}`}
            data-variant={p.variant}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-bold shadow transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT[p.variant]}`}
          >
            <span aria-hidden="true">{p.icon}</span> {p.label}
          </button>
        );
      })}
      {running && (
        <span className="whitespace-nowrap text-[11px] text-slate-400" role="status" data-testid="preset-running">
          Payment on its way…
        </span>
      )}
    </div>
  );
}

export const PresetDock = memo(PresetDockView);
