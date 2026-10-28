import { t } from '../../i18n/t';
import { memo, useEffect, useState } from 'react';
import { flowText, GUIDED_FLOWS } from '../../sim/guidedFlows';
import { FLOW_IDS, type DataDepth, type Dimension, type FlowId, type Scope } from '../../types/viewport';
import { dataDepthOf, useBankStore } from '../../store/bankStore';
import { webglAvailable } from './office/webgl';
import { SegmentedToggle, type SegmentOption } from '../shell/SegmentedToggle';

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

const SCOPE_OPTIONS = (): readonly SegmentOption<Scope>[] => [
  { value: 'beginner', label: <><Dot color="#4ade80" />{t('Beginner')}</>, hint: t('Guided: one payment flow at a time is lit, everything else fades back'), tone: 'emerald' },
  { value: 'advanced', label: <><Dot color="#c084fc" />{t('Advanced')}</>, hint: t('The whole Living Bank, every desk and wire lit'), tone: 'violet' },
];
const DIMENSION_OPTIONS = (): readonly SegmentOption<Dimension>[] => [
  { value: '2d', label: <><SchematicIcon />2D</>, hint: t('The flat blueprint map of departments and wires') },
  { value: '3d', label: <><IsoBoxIcon />3D</>, hint: t('The same bank as an isometric office: desks, staff and customers') },
];
const DEPTH_OPTIONS = (): readonly SegmentOption<DataDepth>[] => [
  { value: 'standard', label: <>{t('Standard')}</>, hint: t('Plain-English names and simple facts in the inspector') },
  { value: 'expert', label: <><span className="font-mono text-[10.5px]">&lt;/&gt;</span>{t('Expert')}</>, hint: t('Fintech terms, ISO 8583 response codes, the raw message and the GL journal'), tone: 'emerald' },
];

/** The guided flows under the dock while the Beginner scope is on: 01-04 on the first row, the Phase 8 flows 05-08 on the second. */
function FlowBar() {
  const flow = useBankStore((s) => s.flow);
  const setFlow = useBankStore((s) => s.setActiveFlow);
  return (
    <nav aria-label={t('Guided flows')} className="bk-slide-down mt-1.5 grid grid-cols-4 items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/95 p-1 shadow-xl" data-testid="flow-bar">
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
        <SegmentedToggle<Scope> label={t('Scope')} value={scope} options={SCOPE_OPTIONS()} onChange={setScope} testId="scope" stateKey="scope" />
        <span className="h-5 w-px bg-slate-800" aria-hidden="true" />
        <SegmentedToggle<Dimension> label={t('Dimension')} value={dimension} options={DIMENSION_OPTIONS()} onChange={chooseDimension} testId="dim" stateKey="dimension" />
        <span className="h-5 w-px bg-slate-800" aria-hidden="true" />
        <SegmentedToggle<DataDepth> label={t('Data depth')} value={depth} options={DEPTH_OPTIONS()} onChange={setDepth} testId="depth" stateKey="depth" />
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
