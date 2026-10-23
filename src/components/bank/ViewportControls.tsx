import { t } from '../../i18n/t';
import { memo, useEffect, useState, type ReactNode } from 'react';
import { flowText, GUIDED_FLOWS } from '../../sim/guidedFlows';
import { FLOW_IDS, type DataDepth, type Dimension, type FlowId, type Scope } from '../../types/viewport';
import { dataDepthOf, useBankStore } from '../../store/bankStore';
import { webglAvailable } from './office/webgl';

/**
 * The viewport dock, floating at the top centre of the Living Bank (clear of the walkthrough card, which is placed beside
 * the desk it explains): three two-way switches that combine into eight views, and, in the Beginner scope, a bar of the four
 * guided flows that slides down beneath it.
 *
 *   Scope        🟢 Beginner | 🟣 Advanced
 *   Dimension    2D | 3D
 *   Data depth   Standard | </> Expert
 *
 * Over the 3D office the dock is a solid panel: a backdrop blur over a live WebGL canvas makes the browser re-blur every frame.
 */

interface Option<T> {
  id: T;
  label: ReactNode;
  title: string;
}

/** A two-way switch with a thumb that slides to the chosen side. */
function Pill<T extends string>({ label, value, options, onChange, testPrefix, accent }: { label: string; value: T; options: readonly [Option<T>, Option<T>]; onChange: (v: T) => void; testPrefix: string; accent?: Partial<Record<T, string>> }) {
  const index = options[1].id === value ? 1 : 0;
  const thumb = accent?.[value] ?? '#334155';
  return (
    <div className="relative grid grid-cols-2 rounded-xl bg-slate-900 p-0.5 ring-1 ring-slate-800" role="group" aria-label={label}>
      <span aria-hidden="true" className="absolute bottom-0.5 left-0.5 top-0.5 w-[calc(50%-2px)] rounded-[10px] shadow transition-transform duration-200 ease-out" style={{ transform: `translateX(${index * 100}%)`, background: thumb }} />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          title={o.title}
          data-testid={`${testPrefix}-${o.id}`}
          className={`relative z-10 flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-2.5 py-1 text-[11.5px] font-semibold transition-colors duration-200 ${value === o.id ? 'text-white' : 'text-slate-400 hover:text-slate-100'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SchematicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="1.5" y="2" width="5" height="4" rx="1" />
    <rect x="9.5" y="10" width="5" height="4" rx="1" />
    <path d="M4 6v4h5.5" strokeLinecap="round" />
  </svg>
);

const IsoBoxIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 1.8 14 5v6.2L8 14.4 2 11.2V5z" />
    <path d="M2 5l6 3.2L14 5M8 8.2v6.2" />
  </svg>
);

const Dot = ({ color }: { color: string }) => <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />;

const SCOPE_OPTIONS = (): readonly [Option<Scope>, Option<Scope>] => [
  { id: 'beginner', label: <><Dot color="#4ade80" />{t('Beginner')}</>, title: t('Guided: one payment flow at a time is lit, everything else fades back') },
  { id: 'advanced', label: <><Dot color="#c084fc" />{t('Advanced')}</>, title: t('The whole Living Bank, every desk and wire lit') },
];
const DIMENSION_OPTIONS = (): readonly [Option<Dimension>, Option<Dimension>] => [
  { id: '2d', label: <><SchematicIcon />2D</>, title: t('The flat blueprint map of departments and wires') },
  { id: '3d', label: <><IsoBoxIcon />3D</>, title: t('The same bank as an isometric office: desks, staff and customers') },
];
const DEPTH_OPTIONS = (): readonly [Option<DataDepth>, Option<DataDepth>] => [
  { id: 'standard', label: <>{t('Standard')}</>, title: t('Plain-English names and simple facts in the inspector') },
  { id: 'expert', label: <><span className="font-mono text-[10.5px] text-lime-300">&lt;/&gt;</span>{t('Expert')}</>, title: t('Fintech terms, ISO 8583 response codes, the raw message and the GL journal') },
];

/** The four guided flows, under the dock while the Beginner scope is on. */
function FlowBar() {
  const flow = useBankStore((s) => s.flow);
  const setFlow = useBankStore((s) => s.setActiveFlow);
  return (
    <nav aria-label={t('Guided flows')} className="bk-slide-down mt-1.5 flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/95 p-1 shadow-xl" data-testid="flow-bar">
      {FLOW_IDS.map((id: FlowId) => {
        const f = GUIDED_FLOWS[id];
        const on = flow === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setFlow(id)}
            aria-pressed={on}
            title={flowText(id).blurb}
            data-testid={`flow-${id}`}
            className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition ${on ? 'text-slate-950' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            style={on ? { background: f.accent, boxShadow: `0 0 14px ${f.accent}66` } : undefined}
          >
            <span className={`mr-1 font-mono ${on ? 'text-slate-900/70' : 'text-slate-500'}`}>{f.code}.</span>
            {flowText(id).title}
          </button>
        );
      })}
    </nav>
  );
}

function ViewportControlsView() {
  const scope = useBankStore((s) => s.scope);
  const dimension = useBankStore((s) => s.viewMode);
  const depth = useBankStore(dataDepthOf);
  const touring = useBankStore((s) => s.spotlight !== null);
  const setScope = useBankStore((s) => s.setScope);
  const setDimension = useBankStore((s) => s.setDimension);
  const setDepth = useBankStore((s) => s.setDataDepth);
  const [noWebgl, setNoWebgl] = useState(false);

  useEffect(() => {
    if (dimension === '3d' && !webglAvailable()) setNoWebgl(true);
  }, [dimension]);

  const chooseDimension = (d: Dimension): void => {
    if (d === '3d' && !webglAvailable()) {
      setNoWebgl(true);
      return;
    }
    setNoWebgl(false);
    setDimension(d);
  };

  const solid = dimension === '3d';
  const left = useMapCentre();
  return (
    <div className="pointer-events-none absolute top-3 z-40 flex -translate-x-1/2 flex-col items-center transition-[left] duration-200 ease-out" style={{ left }} data-testid="viewport-controls">
      <div className={`pointer-events-auto flex items-center gap-3 rounded-2xl border border-slate-800 p-1.5 px-3 shadow-2xl ${solid ? 'bg-slate-900/95' : 'bg-slate-950/90 backdrop-blur-md'}`} role="toolbar" aria-label={t('Viewport')}>
        <Pill<Scope> label={t('Scope')} value={scope} options={SCOPE_OPTIONS()} onChange={setScope} testPrefix="scope" accent={{ beginner: '#166534', advanced: '#6b21a8' }} />
        <span className="h-5 w-px bg-slate-800" aria-hidden="true" />
        <Pill<Dimension> label={t('Dimension')} value={dimension} options={DIMENSION_OPTIONS()} onChange={chooseDimension} testPrefix="dim" accent={{ '2d': '#0c4a6e', '3d': '#0c4a6e' }} />
        <span className="h-5 w-px bg-slate-800" aria-hidden="true" />
        <Pill<DataDepth> label={t('Data depth')} value={depth} options={DEPTH_OPTIONS()} onChange={setDepth} testPrefix="depth" accent={{ standard: '#334155', expert: '#3f6212' }} />
      </div>
      {noWebgl && (
        <p role="alert" className="pointer-events-auto mt-1.5 w-[270px] rounded-lg border border-amber-400/40 bg-amber-950/95 px-3 py-2 text-center text-[12px] leading-snug text-amber-100 shadow-xl" data-testid="view-no-webgl">
          {t('This browser cannot draw 3D (WebGL is off). The 2D map shows exactly the same bank.')}
        </p>
      )}
      {scope === 'beginner' && !touring && (
        <div className="pointer-events-auto">
          <FlowBar />
        </div>
      )}
    </div>
  );
}

export const ViewportControls = memo(ViewportControlsView);

/**
 * The left edge for a panel centred over the map: the middle of the space the inspector leaves free, so the dock and the
 * preset bar never slide under the drawer when it opens.
 */
export function useMapCentre(): string {
  const shift = useBankStore((s) => (s.selection.kind !== 'none' ? Math.round(s.inspectorWidth / 2) : 0));
  return shift ? `calc(50% - ${shift}px)` : '50%';
}

/** How much room the dock (and the flow bar under it) takes at the top of the map, so the 2D blueprint can sit below it. */
export function useDockInset(): number {
  const beginnerBar = useBankStore((s) => s.scope === 'beginner' && s.spotlight === null);
  return beginnerBar ? 100 : 60;
}
