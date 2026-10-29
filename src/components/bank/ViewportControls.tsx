import { t } from '../../i18n/t';
import { memo, useEffect, useState } from 'react';
import { flowText, GUIDED_FLOWS } from '../../sim/guidedFlows';
import { FLOW_IDS, type Dimension, type FlowId, type Scope } from '../../types/viewport';
import { dataDepthOf, useBankStore } from '../../store/bankStore';
import { webglAvailable } from './office/webgl';
import { DepthToggle, SegmentedToggle, type SegmentOption } from '../shell/SegmentedToggle';

/** The viewport dock, floating at the top centre of the Living Bank (clear of the walkthrough card, which is placed beside the desk it explains). */

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

const SCOPE_OPTIONS = (): readonly SegmentOption<Scope>[] => [
  { value: 'beginner', label: <><span aria-hidden="true">🧩</span>{t('Sub-process')}</>, hint: t('One isolated sub-flow at a time (pick 01-08): only its desks, wires and conditions stay lit, the rest fades back'), tone: 'emerald' },
  { value: 'advanced', label: <><span aria-hidden="true">🔄</span>{t('Full process')}</>, hint: t('The full end-to-end bank: every desk, wire and condition lit'), tone: 'violet' },
];
export const SCOPE_TITLE = 'Switch between an isolated sub-process view (Sub-process) and the full end-to-end operating map (Full process)';
const DIMENSION_OPTIONS = (): readonly SegmentOption<Dimension>[] => [
  { value: '2d', label: <><SchematicIcon />2D</>, hint: t('The flat blueprint map of departments and wires') },
  { value: '3d', label: <><IsoBoxIcon />3D</>, hint: t('The same bank as an isometric office: desks, staff and customers') },
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
        <SegmentedToggle<Scope> label={t('Scope')} value={scope} options={SCOPE_OPTIONS()} onChange={setScope} testId="scope" stateKey="scope" title={t(SCOPE_TITLE)} />
        <span className="h-5 w-px bg-slate-800" aria-hidden="true" />
        <SegmentedToggle<Dimension> label={t('Dimension')} value={dimension} options={DIMENSION_OPTIONS()} onChange={chooseDimension} testId="dim" stateKey="dimension" />
        <span className="h-5 w-px bg-slate-800" aria-hidden="true" />
        <DepthToggle value={depth} onChange={setDepth} testId="depth" />
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

/** The left edge for a panel centred over the map: the middle of the space the inspector leaves free, so the dock and the preset bar never slide under the drawer when it opens. */
export function useMapCentre(): string {
  const shift = useBankStore((s) => (s.selection.kind !== 'none' ? Math.round(s.inspectorWidth / 2) : 0));
  return shift ? `calc(50% - ${shift}px)` : '50%';
}

/** How much room the dock (and the flow bar under it) takes at the top of the map, so the 2D blueprint can sit below it. */
export function useDockInset(): number {
  const beginnerBar = useBankStore((s) => s.scope === 'beginner' && s.spotlight === null);
  return beginnerBar ? 100 : 60;
}
