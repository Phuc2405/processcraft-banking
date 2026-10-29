import { t } from '../../i18n/t';
import { memo, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { flowText, GUIDED_FLOWS } from '../../sim/guidedFlows';
import { FLOW_IDS, type Dimension, type FlowId, type Scope } from '../../types/viewport';
import { dataDepthOf, kickoffOpenOf, useBankStore } from '../../store/bankStore';
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
  // While a tour's kickoff card is open the dock stands aside; it is back as soon as the tour starts, to switch views during its steps.
  const kickoff = useBankStore(kickoffOpenOf);
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
  const box = useRef<HTMLDivElement>(null);
  useMeasuredBox(box, (b) => topBand.setState({ dock: b }), [left, scope, touring, noWebgl, kickoff]);
  useEffect(() => {
    if (kickoff) topBand.setState({ dock: null });
  }, [kickoff]);
  if (kickoff) return null;
  return (
    <div ref={box} className="pointer-events-none absolute top-3 z-40 flex -translate-x-1/2 flex-col items-center transition-[left] duration-200 ease-out" style={{ left }} data-testid="viewport-controls">
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

/** A floating panel's box on the map, in pixels from the map's top-left corner. */
export interface MapBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** What floats along the top of the map, as measured on screen: the viewport dock (with its flow bar), the 3D office's toolbar and its weather bar. Each panel reports its own box, so the others can keep clear of it whatever its language, the flow bar's rows or the width of the window. */
export interface TopBand {
  dock: MapBox | null;
  toolbar: MapBox | null;
  weather: MapBox | null;
}
export const topBand = createStore<TopBand>(() => ({ dock: null, toolbar: null, weather: null }));
export const useTopBand = <T,>(select: (s: TopBand) => T): T => useStore(topBand, select);

const sameBox = (a: MapBox | null, b: MapBox | null): boolean => a === b || (!!a && !!b && a.left === b.left && a.right === b.right && a.top === b.top && a.bottom === b.bottom);

/** Reports `ref`'s box on the map (its offset parent) whenever it may have moved: it or the map resizes, the window resizes, its slide ends, or one of `deps` changes. Null once it is gone. */
export function useMeasuredBox(ref: RefObject<HTMLElement | null>, report: (box: MapBox | null) => void, deps: readonly unknown[]): void {
  const last = useRef<MapBox | null>(null);
  const tell = useRef(report);
  tell.current = report;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const parent = (el.offsetParent as HTMLElement | null) ?? el.parentElement;
      if (!parent) return;
      const r = el.getBoundingClientRect();
      const p = parent.getBoundingClientRect();
      const box = { left: Math.round(r.left - p.left), right: Math.round(r.right - p.left), top: Math.round(r.top - p.top), bottom: Math.round(r.bottom - p.top) };
      if (sameBox(box, last.current)) return;
      last.current = box;
      tell.current(box);
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    if (el.parentElement) ro?.observe(el.parentElement);
    window.addEventListener('resize', measure);
    el.addEventListener('transitionend', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      el.removeEventListener('transitionend', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(
    () => () => {
      last.current = null;
      tell.current(null);
    },
    [],
  );
}

/** How much room the dock (and the flow bar under it) takes at the top of the map, so what sits below it keeps clear: as measured, and never less than its usual height. */
export function useDockInset(): number {
  const beginnerBar = useBankStore((s) => s.scope === 'beginner' && s.spotlight === null);
  const measured = useTopBand((s) => s.dock?.bottom ?? 0);
  return Math.max(beginnerBar ? 100 : 60, measured);
}

/** The 3D office's weather bar, just under the dock: the gap above it and its height. */
export const WEATHER_BAR_GAP = 6;
export const WEATHER_BAR_H = 34;

/** Where the first thing under the dock may start: under the weather bar (and the toolbar, if it had to drop below the dock) in 3D, straight under the dock in 2D. */
export function useBelowDock(): number {
  const inset = useDockInset();
  const office = useBankStore((s) => s.viewMode === '3d');
  const below = useTopBand((s) => Math.max(s.weather?.bottom ?? 0, s.toolbar?.bottom ?? 0));
  return office ? Math.max(inset + WEATHER_BAR_GAP + WEATHER_BAR_H, below) + 8 : inset;
}

/** Where the 3D office's top-left toolbar and the weather bar go, from their measured sizes: the toolbar stays in the corner while the dock leaves room beside it, else it drops just under the dock; the weather bar goes centred under the dock, and under the toolbar as well if the two would touch. */
export function topBandLayout(band: { dock: MapBox | null; toolbarW: number; toolbarH: number; weatherW: number }): { toolbarTop: number; weatherTop: number } {
  const { dock, toolbarW, toolbarH, weatherW } = band;
  const corner = 12;
  if (!dock) return { toolbarTop: corner, weatherTop: 60 + WEATHER_BAR_GAP };
  const below = dock.bottom + WEATHER_BAR_GAP;
  const toolbarRight = TOOLBAR_LEFT + toolbarW + 12;
  const drop = toolbarRight > dock.left && corner < dock.bottom;
  const toolbarTop = drop ? below : corner;
  const centre = (dock.left + dock.right) / 2;
  const touches = centre - weatherW / 2 < toolbarRight && below < toolbarTop + toolbarH;
  return { toolbarTop, weatherTop: touches ? toolbarTop + toolbarH + WEATHER_BAR_GAP : below };
}

/** The 3D toolbar's distance from the map's left edge (left-4). */
export const TOOLBAR_LEFT = 16;
