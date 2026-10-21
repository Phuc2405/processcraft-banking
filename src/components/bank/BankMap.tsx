import { tr } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { beatMs, SPEEDS, type Phase } from '../../sim/clock';
import { formatMoney } from '../../sim/kpis';
import { LESSONS, type ProcessId } from '../../sim/learning';
import { processShort } from '../../sim/learningVi';
import { wiresOfRoute } from '../../sim/spotlightPlan';
import { DEPARTMENTS, DEPARTMENT_IDS, STATIONS, type DepartmentId, type ExternalId, type PlaceId, type StationId } from '../../sim/topology';
import type { Move, StationView } from '../../sim/types';
import { academyFocusOf, activeFlowOf, useBankStore } from '../../store/bankStore';
import { flowScope, GUIDED_FLOWS, type FlowScope } from '../../sim/guidedFlows';
import type { FlowId } from '../../types/viewport';
import { StepPreviewBody } from './StepPreview';
import { useDockInset } from './ViewportControls';
import { PathTraveller } from '../canvas/edges/PathTraveller';
import { WorkstationGraphic } from '../canvas/nodes/WorkstationGraphic';
import { BANK_WIRES, CARD, DEPT_BOX, pathOfWire, PLACE_BOX, STAGE, TIP_SIDE, type TipSide } from './layout';
import { SpotlightOverlay, SpotlightToken } from './Spotlight';
import { StageScaleContext, useStageScale } from './stage';
import { lookOfKind, RUN_STATUS, STATUS_DOT_CLASS, STATUS_TEXT_CLASS, statusLabel, WorkerFace } from './ui';
import { useSpotlightFocus, type Focus } from './useSpotlight';
import { useTerms, type Terms } from './useTerms';
import { clampZoom, wheelZoom, ZOOM_STEP, zoomStore } from '../../store/zoomStore';

// ─────────────────────────────────────────────────────────────────────────────
// Scaling the stage to the space it is given
// ─────────────────────────────────────────────────────────────────────────────

const MIN_SCALE = 0.5;
const MAX_SCALE = 1.3;

function useFitScale(topInset: number, bottomInset: number): { ref: RefObject<HTMLDivElement>; scale: number } {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const w = el.clientWidth - 24;
      const h = el.clientHeight - 12 - topInset - bottomInset;
      if (w <= 0 || h <= 0) return;
      setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(w / STAGE.width, h / STAGE.height))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [topInset, bottomInset]);
  return { ref, scale };
}

/**
 * Zoom and pan on top of the fitted scale. The mouse wheel zooms about the cursor (the point under it stays put), a drag on the
 * empty background pans, and the floating toolbar's +, − and Fit arrive through zoomStore. Returns the zoom (a multiple of the
 * fitted size), the ref of the content box, and whether the last pointer press was a pan (so it is not taken for a click).
 */
function useZoomPan(frame: RefObject<HTMLDivElement>, fit: number): { zoom: number; content: RefObject<HTMLDivElement>; panned: RefObject<boolean> } {
  const [zoom, setZoom] = useState(1);
  const content = useRef<HTMLDivElement>(null);
  const panned = useRef(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const fitRef = useRef(fit);
  fitRef.current = fit;
  /** The stage point that must end up under (cx, cy) of the frame once the new scale has been drawn. */
  const anchor = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);

  const zoomAbout = (next: number, cx: number, cy: number): void => {
    const el = frame.current;
    const box = content.current;
    const target = clampZoom(next);
    if (!el || !box || target === zoomRef.current) return;
    const scale = fitRef.current * zoomRef.current;
    anchor.current = { sx: (el.scrollLeft + cx - box.offsetLeft) / scale, sy: (el.scrollTop + cy - box.offsetTop) / scale, cx, cy };
    setZoom(target);
  };

  // The wheel listener must be non-passive to stop the page scrolling while it zooms.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAbout(wheelZoom(zoomRef.current, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After the new scale is drawn, scroll so the anchored stage point is back under the cursor.
  useLayoutEffect(() => {
    const el = frame.current;
    const box = content.current;
    const a = anchor.current;
    if (!el || !box || !a) return;
    anchor.current = null;
    const scale = fit * zoom;
    el.scrollLeft = box.offsetLeft + a.sx * scale - a.cx;
    el.scrollTop = box.offsetTop + a.sy * scale - a.cy;
  }, [zoom, fit, frame]);

  // The toolbar's commands, and the percentage it shows.
  useEffect(
    () =>
      zoomStore.subscribe((s, prev) => {
        const c = s.command;
        if (!c || c === prev.command) return;
        const el = frame.current;
        if (!el) return;
        if (c.kind === 'fit') {
          anchor.current = null;
          setZoom(1);
          el.scrollTo({ left: 0, top: 0 });
          return;
        }
        zoomAbout(zoomRef.current * (c.kind === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP), el.clientWidth / 2, el.clientHeight / 2);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    zoomStore.getState().report(fit * zoom * 100);
  }, [fit, zoom]);

  // Drag on the empty background to pan.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let start: { x: number; y: number; left: number; top: number; id: number } | null = null;
    const onDown = (e: PointerEvent): void => {
      const t = e.target as HTMLElement;
      const background = t === el || t.dataset.testid === 'bank-stage' || t === content.current;
      panned.current = false;
      if (e.button !== 0 || !background) return;
      start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, id: e.pointerId };
    };
    const onMove = (e: PointerEvent): void => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!panned.current && Math.hypot(dx, dy) < 4) return;
      if (!panned.current) {
        panned.current = true;
        el.setPointerCapture?.(e.pointerId);
        el.style.cursor = 'grabbing';
      }
      el.scrollLeft = start.left - dx;
      el.scrollTop = start.top - dy;
    };
    const onUp = (e: PointerEvent): void => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      el.style.cursor = '';
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [frame]);

  return { zoom, content, panned };
}

// ─────────────────────────────────────────────────────────────────────────────
// Who is on shift
// ─────────────────────────────────────────────────────────────────────────────

/** Desks that have nothing to do at this hour are drawn dim, unless something is still waiting at them. */
function isOnShift(id: StationId, phase: Phase): boolean {
  const def = STATIONS[id];
  if (def.department === 'EOD') return def.openHoursOnly ? phase === 'WORKING' : phase === 'EOD';
  return phase === 'WORKING' || phase === 'AFTER_HOURS';
}

// ─────────────────────────────────────────────────────────────────────────────
// Chips that open the Learning Hub
// ─────────────────────────────────────────────────────────────────────────────

function ProcessChip({ process, accent }: { process: ProcessId; accent: string }) {
  const startSpotlight = useBankStore((s) => s.startSpotlight);
  return (
    <button
      type="button"
      onClick={() => startSpotlight(process)}
      title={tr({ en: `Chapter ${LESSONS[process].chapter}: ${processShort(process)}`, vi: `Chương ${LESSONS[process].chapter}: ${processShort(process)}` })}
      aria-label={tr({ en: `Start Chapter ${LESSONS[process].chapter}: ${processShort(process)}`, vi: `Bắt đầu Chương ${LESSONS[process].chapter}: ${processShort(process)}` })}
      data-testid={`chip-process-${process}`}
      className="pointer-events-auto grid h-[17px] w-[17px] place-items-center rounded-[5px] text-[10px] font-black leading-none text-slate-950 transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      style={{ background: accent }}
    >
      {LESSONS[process].chapter}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Learn & Explore: what is lit and what is dimmed
// ─────────────────────────────────────────────────────────────────────────────

/** Nothing on the map is dimmed outside a tour. During one, everything the process does not use fades to 15%. */
const dimClass = (focus: Focus | null, lit: boolean): string => (focus && !lit ? 'bk-dimmed' : '');

/** The guided flow in focus in the Beginner scope: what it lights, and its colour. Null in Advanced and during a tour. */
interface FlowFocus {
  flow: FlowId;
  accent: string;
  scope: FlowScope;
}

/** Outside the active flow a part of the map fades to 15% and grey (a tour's own dimming wins while one runs). */
const flowDim = (flow: FlowFocus | null, lit: boolean): string => (flow && !lit ? 'bk-flow-dim' : '');
const flowVar = (flow: FlowFocus | null): CSSProperties | undefined => (flow ? ({ ['--flow' as string]: flow.accent } as CSSProperties) : undefined);

const TIP_ORIGIN: Record<TipSide, string> = { below: 'top center', above: 'bottom center', right: 'center left', left: 'center right' };

/**
 * The step preview of a lit desk in a guided flow: step number, name, status and what happens there. It lives inside the
 * scaled stage, so it is scaled back up to reading size (never past 1.35×) from the edge that touches the desk.
 */
function StepPreviewTip({ flow, place, side }: { flow: FlowId; place: PlaceId; side: TipSide }) {
  const stage = useStageScale();
  const grow = Math.min(1.35, Math.max(1, 1 / stage));
  return (
    <span
      role="tooltip"
      className={`bk-steptip pointer-events-none absolute z-50 w-[248px] rounded-lg border bg-[#0b1120] px-2.5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.6)] ${TIP_POSITION[side]}`}
      style={{ borderColor: `${GUIDED_FLOWS[flow].accent}aa`, scale: String(grow), transformOrigin: TIP_ORIGIN[side] }}
      data-testid="step-preview-tip"
      data-side={side}
    >
      <StepPreviewBody flow={flow} place={place} />
    </span>
  );
}

/** A custom property the stylesheet reads for the neon colour of the tour. */
const neon = (focus: Focus | null): CSSProperties | undefined => (focus ? ({ ['--tour' as string]: focus.accent } as CSSProperties) : undefined);

/** A one-sentence "what is this" that appears when the pointer rests on a desk. Hidden during a tour: the card explains. */
const TIP_POSITION: Record<TipSide, string> = {
  below: 'left-1/2 top-full mt-1.5 -translate-x-1/2',
  above: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  right: 'left-full top-1/2 ml-1.5 -translate-y-1/2',
  left: 'right-full top-1/2 mr-1.5 -translate-y-1/2',
};

/**
 * Opens on the side of the desk where it covers no other card (see tipSideFor), and the desk under the pointer is lifted above
 * its neighbours while it shows, so no other card can paint over it.
 */
function HoverTip({ name, tip, side }: { name: string; tip: string; side: TipSide }) {
  return (
    <span
      role="tooltip"
      className={`bk-hovertip pointer-events-none absolute z-50 w-[236px] rounded-lg border border-slate-500 bg-[#0b1120] px-2.5 py-1.5 text-left shadow-[0_10px_30px_rgba(0,0,0,0.6)] ${TIP_POSITION[side]}`}
      data-testid="hover-tip"
      data-side={side}
    >
      <span className="block text-[11.5px] font-semibold leading-snug text-slate-50">{name}</span>
      <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-300">{tip}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Departments
// ─────────────────────────────────────────────────────────────────────────────

function DepartmentFrame({ id, focus, flow, terms }: { id: DepartmentId; focus: Focus | null; flow: FlowFocus | null; terms: Terms }) {
  const dept = DEPARTMENTS[id];
  const box = DEPT_BOX[id];
  const selected = useBankStore((s) => s.selection.kind === 'department' && s.selection.id === id);
  const select = useBankStore((s) => s.select);
  const waiting = useBankStore((s) => dept.stations.reduce((n, st) => n + s.view.stations[st].queueLength, 0));
  const night = useBankStore((s) => s.view.phase === 'EOD');

  const glowing = id === 'EOD' && night && !focus;
  const lit = focus ? focus.scope.departments.has(id) : false;
  const accent = focus && lit ? focus.accent : dept.accent;
  const name = terms.department(id);

  return (
    <div className={`${dimClass(focus, lit)} ${flowDim(flow, flow ? flow.scope.departments.has(id) : true)}`} style={neon(focus)} data-lit={focus ? lit : flow ? flow.scope.departments.has(id) : undefined}>
      <div
        aria-hidden="true"
        className="absolute rounded-2xl border transition-[box-shadow,border-color] duration-500"
        style={{
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          borderColor: selected ? dept.accent : lit ? `${accent}aa` : `${dept.accent}${glowing ? '88' : '38'}`,
          background: lit ? `${accent}12` : `${dept.accent}${selected ? '1a' : glowing ? '14' : '09'}`,
          boxShadow: lit ? `0 0 0 1px ${accent}55, 0 0 34px ${accent}33` : selected ? `0 0 0 3px ${dept.accent}88, 0 0 30px ${dept.accent}44` : glowing ? `0 0 38px ${dept.accent}33` : undefined,
        }}
      />
      <div className="pointer-events-none absolute z-20 flex items-center gap-2" style={{ left: box.x + 8, top: box.y + 6, width: box.w - 16 }}>
        <button
          type="button"
          onClick={() => !focus && select({ kind: 'department', id })}
          aria-pressed={selected}
          data-testid={`dept-${id}`}
          title={`${terms.departmentTitle(id)}: ${terms.departmentTip(id)}`}
          className="pointer-events-auto flex min-w-0 items-start gap-1.5 rounded-md bg-[#0b1120]/90 px-1.5 py-0.5 text-left transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
          <span className="line-clamp-2 text-[11px] font-semibold leading-[1.15] tracking-tight" data-testid={`dept-name-${id}`} style={{ color: accent }}>
            {name}
          </span>
          {waiting > 0 && !focus && <span className="shrink-0 rounded bg-slate-800 px-1 text-[10px] font-semibold tabular-nums text-slate-200">{waiting}</span>}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Desks
// ─────────────────────────────────────────────────────────────────────────────

const StationCard = memo(function StationCard({
  id,
  sv,
  phase,
  tick,
  selected,
  accent,
  focus,
  flow,
  flowHere,
  terms,
}: {
  id: StationId;
  sv: StationView;
  phase: Phase;
  tick: number;
  selected: boolean;
  accent: string;
  focus: Focus | null;
  /** The guided flow in focus (Beginner scope), or null. */
  flow: FlowFocus | null;
  /** The learner's preset payment is at this desk right now. */
  flowHere: boolean;
  terms: Terms;
}) {
  const select = useBankStore((s) => s.select);
  const spotlightFocus = useBankStore((s) => s.spotlightFocus);
  const def = STATIONS[id];
  const box = PLACE_BOX[id];
  const first = sv.workers[0];
  const lit = focus ? focus.scope.places.has(id) : false;
  const here = focus ? focus.current.place === id && !focus.tour.intro : false;
  const passed = focus ? focus.visited.has(id) : false;
  const flowLit = flow ? flow.scope.places.has(id) : false;
  const dim = !focus && !flowLit && sv.status === 'IDLE' && sv.queueLength === 0 && !isOnShift(id, phase);
  const worst = sv.alerts.some((a) => a.severity === 'crit' && a.live) ? 'crit' : sv.alerts.length > 0 ? 'warn' : null;
  const unit = def.kind === 'ACCOUNT' ? t('items') : t('waiting');
  const name = terms.station(id);
  const title = terms.stationTitle(id);
  // A long plain-English name takes two lines, so the desk art gives up a little height for it.
  const long = name.length > 22;

  const border =
    sv.status === 'ALERT' ? 'border-rose-500/70' : sv.status === 'CONGESTED' ? 'border-amber-400/70' : sv.status === 'BUSY' ? 'border-emerald-400/35' : 'border-slate-700/80';

  return (
    <div
      className={`group absolute z-20 transition-opacity duration-500 hover:z-[45] has-[:focus-visible]:z-[45] ${focus ? '' : dim ? 'opacity-50' : 'opacity-100'} ${dimClass(focus, lit)} ${flowDim(flow, flowLit)} ${here ? 'bk-spot-here' : ''}`}
      style={{ left: box.cx - CARD.w / 2, top: box.cy - CARD.h / 2, width: CARD.w, height: CARD.h, ...neon(focus), ...flowVar(flow) }}
      data-lit={focus ? lit : flow ? flowLit : undefined}
      data-flow-here={flowHere || undefined}
      data-here={here || undefined}
    >
      <button
        type="button"
        onClick={() => (focus ? spotlightFocus(id) : select({ kind: 'station', id }))}
        aria-pressed={selected}
        aria-label={`${title}: ${statusLabel(sv.status)}, ${sv.queueLength} ${unit}`}
        data-testid={`station-${id}`}
        data-status={sv.status}
        className={`absolute inset-0 rounded-xl border bg-gradient-to-b from-slate-900 to-[#0b1120] transition hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${lit && focus ? 'bk-spot-lit' : flowLit ? 'bk-flow-lit' : border} ${flowHere ? 'bk-flow-here' : ''} ${selected ? 'ring-2 ring-sky-400' : ''} ${sv.status === 'CONGESTED' && !focus ? 'bk-congested' : ''}`}
      />
      <div className="pointer-events-none absolute inset-0 flex flex-col p-1.5">
        <div className={`flex gap-1.5 ${long ? 'items-start' : 'items-center'}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${long ? 'mt-[3px]' : ''} ${passed && focus ? 'bg-[var(--tour)]' : STATUS_DOT_CLASS[sv.status]}`} />
          <span className={`font-semibold text-slate-100 ${long ? 'line-clamp-2 text-[10.5px] leading-[1.12]' : 'truncate text-[11.5px] leading-none'}`} data-testid={`station-name-${id}`} title={name}>
            {name}
          </span>
          {worst && !focus && (
            <span className={`ml-auto grid h-[13px] w-[13px] shrink-0 place-items-center rounded-full text-[9px] font-black text-slate-950 ${worst === 'crit' ? 'animate-pulse bg-rose-400' : 'bg-amber-300'}`} title={sv.alerts[0]?.text} data-testid={`alert-badge-${id}`}>
              !
            </span>
          )}
        </div>
        <div className={`flex min-h-0 flex-1 items-center gap-1 ${long ? 'mt-0.5' : 'mt-1'}`}>
          <WorkstationGraphic capability={def.capability ?? 'CORE_LEDGER_CHECK'} status={RUN_STATUS[sv.status]} className={`shrink-0 ${long ? 'h-[40px] w-[54px]' : 'h-[52px] w-[70px]'}`} {...(first ? { profile: first.profile } : {})} />
          <div className="min-w-0 flex-1 text-right">
            <div className={`text-[21px] font-bold leading-none tabular-nums ${sv.queueLength > 0 ? (sv.status === 'CONGESTED' || sv.status === 'ALERT' ? 'text-amber-300' : 'text-slate-100') : 'text-slate-600'}`} data-testid={`queue-${id}`}>
              {sv.queueLength}
            </div>
            {/* The unit and the status share a line, so a two-line name never pushes them into the staff and chapter row. */}
            <div className="mt-0.5 truncate text-[9.5px] leading-tight">
              <span className="uppercase tracking-wide text-slate-500">{unit}</span>
              <span className="text-slate-600"> · </span>
              <span className={`font-medium ${STATUS_TEXT_CLASS[sv.status]}`}>{statusLabel(sv.status)}</span>
            </div>
          </div>
        </div>
        <div className="flex h-[19px] items-end justify-between">
          <div className="flex items-center gap-0.5">
            {sv.workers.slice(0, 6).map((w) => (
              <WorkerButton key={w.id} id={w.id} station={id} name={w.name} role={w.role} fatigue={w.fatigue} temp={w.temp} profile={w.profile} touring={focus !== null} lit={lit} />
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            {def.processes.map((p) => (
              <ProcessChip key={p} process={p} accent={accent} />
            ))}
          </div>
        </div>
      </div>
      {sv.arrivals > 0 && !focus && (
        <span key={tick} className="bk-arrival pointer-events-none absolute -top-1 right-1 rounded-full bg-sky-400/90 px-1.5 text-[10px] font-bold text-slate-950">
          +{sv.arrivals}
        </span>
      )}
      {!focus && (flow && flowLit ? <StepPreviewTip flow={flow.flow} place={id} side={TIP_SIDE[id]} /> : <HoverTip name={title} tip={terms.tip(id)} side={TIP_SIDE[id]} />)}
    </div>
  );
});

function WorkerButton({
  id,
  station,
  name,
  role,
  fatigue,
  temp,
  profile,
  touring,
  lit,
}: {
  id: string;
  station: StationId;
  name: string;
  role: string;
  fatigue: number;
  temp: boolean;
  profile: { skin: string; hair: string; shirt: string };
  touring: boolean;
  lit: boolean;
}) {
  const select = useBankStore((s) => s.select);
  const spotlightFocus = useBankStore((s) => s.spotlightFocus);
  const selected = useBankStore((s) => s.selection.kind === 'worker' && s.selection.workerId === id);
  return (
    <button
      type="button"
      onClick={() => (touring ? spotlightFocus(station) : select({ kind: 'worker', station, workerId: id }))}
      aria-pressed={selected}
      aria-label={`${name}, ${role}`}
      title={tr({ en: `${name} · ${role} · fatigue ${Math.round(fatigue)}`, vi: `${name} · ${role} · mệt mỏi ${Math.round(fatigue)}` })}
      data-testid={`worker-${id}`}
      className={`pointer-events-auto rounded-full transition hover:scale-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${touring && lit ? 'bk-worker-glow' : ''}`}
    >
      <WorkerFace profile={profile} fatigue={fatigue} size={18} temp={temp} selected={selected} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Places outside the departments
// ─────────────────────────────────────────────────────────────────────────────

const PhoneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
    <path d="M11 18.5h2" />
  </svg>
);
const TickIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const CrossIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </svg>
);

const EXTERNAL_THEME: Record<ExternalId, { icon: ReactNode; border: string; text: string; bg: string }> = {
  CUSTOMER_OTP: { icon: <PhoneIcon />, border: 'border-violet-400/50 border-dashed', text: 'text-violet-300', bg: 'from-violet-950/60 to-slate-950' },
  OUT_APPROVED: { icon: <TickIcon />, border: 'border-emerald-400/50', text: 'text-emerald-300', bg: 'from-emerald-950/50 to-slate-950' },
  OUT_DECLINED: { icon: <CrossIcon />, border: 'border-rose-400/50', text: 'text-rose-300', bg: 'from-rose-950/50 to-slate-950' },
  OUT_SETTLED: { icon: <TickIcon />, border: 'border-amber-400/50', text: 'text-amber-300', bg: 'from-amber-950/40 to-slate-950' },
};

function ExternalNode({ id, focus, flow, flowHere, terms }: { id: ExternalId; focus: Focus | null; flow: FlowFocus | null; flowHere: boolean; terms: Terms }) {
  const count = useBankStore((s) => s.view.externals[id]);
  const startSpotlight = useBankStore((s) => s.startSpotlight);
  const spotlightFocus = useBankStore((s) => s.spotlightFocus);
  const box = PLACE_BOX[id];
  const theme = EXTERNAL_THEME[id];
  const lit = focus ? focus.scope.places.has(id) : false;
  const here = focus ? focus.current.place === id && !focus.tour.intro : false;
  const big = id !== 'CUSTOMER_OTP';
  const body = (
    <>
      <div className={`flex items-start gap-1.5 ${theme.text}`}>
        <span className="mt-px shrink-0">{theme.icon}</span>
        <span className="line-clamp-2 text-[11px] font-semibold leading-[1.15]">{terms.external(id)}</span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-1">
        <span className="text-[19px] font-bold leading-none tabular-nums text-slate-100" data-testid={`external-${id}`}>
          {count.count.toLocaleString()}
        </span>
        <span className="text-[10px] tabular-nums text-slate-400">{formatMoney(count.cents, true)}</span>
      </div>
      <div className="mt-0.5 text-[9.5px] uppercase tracking-wide text-slate-500">{terms.externalSub(id)}</div>
    </>
  );
  const flowLit = flow ? flow.scope.places.has(id) : false;
  const style: CSSProperties = { left: box.cx - box.w / 2, top: box.cy - box.h / 2, width: box.w, height: box.h, ...neon(focus), ...flowVar(flow) };
  const klass = `group absolute z-20 hover:z-[45] has-[:focus-visible]:z-[45] rounded-xl border bg-gradient-to-b p-2 text-left ${lit && focus ? 'bk-spot-lit' : flowLit ? 'bk-flow-lit' : theme.border} ${theme.bg} ${dimClass(focus, lit)} ${flowDim(flow, flowLit)} ${here ? 'bk-spot-here' : ''} ${flowHere ? 'bk-flow-here' : ''}`;
  if (id === 'CUSTOMER_OTP') {
    return (
      <button
        type="button"
        onClick={() => (focus ? spotlightFocus(id) : startSpotlight('B'))}
        className={`${klass} transition hover:border-violet-300`}
        style={style}
        title={focus || (flow && flowLit) ? undefined : t('Chapter 2: the 3DS challenge sends the customer here')}
        data-testid="external-CUSTOMER_OTP-box"
        data-here={here || undefined}
        data-lit={flow ? flowLit : undefined}
      >
        {body}
        {!focus && flow && flowLit && <StepPreviewTip flow={flow.flow} place={id} side={TIP_SIDE[id]} />}
      </button>
    );
  }
  return (
    <div className={klass} style={style} data-big={big} data-here={here || undefined} data-lit={flow ? flowLit : undefined} data-testid={`place-${id}`}>
      {body}
      {!focus && (flow && flowLit ? <StepPreviewTip flow={flow.flow} place={id} side={TIP_SIDE[id]} /> : <HoverTip name={terms.place(id)} tip={terms.externalTip(id)} side={TIP_SIDE[id]} />)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wires and the packets on them
// ─────────────────────────────────────────────────────────────────────────────

const HEAT_DECAY = 0.82;

function useWireHeat(moves: readonly Move[], tick: number): Record<string, number> {
  const [heat, setHeat] = useState<Record<string, number>>({});
  useEffect(() => {
    setHeat((prev) => {
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(prev)) if (v * HEAT_DECAY > 0.04) next[k] = v * HEAT_DECAY;
      for (const m of moves) next[m.edge] = Math.min(8, (next[m.edge] ?? 0) + 1);
      return next;
    });
    // `moves` changes identity every beat along with `tick`.
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return heat;
}

function wireStyle(to: string, from: string): { base: string; glow: string; dash?: string } {
  if (to === 'OUT_DECLINED') return { base: '#7f1d1d', glow: '#fb7185', dash: '5 4' };
  if (from === 'OUT_APPROVED' || from.startsWith('EOD_') || from === 'RECON' || from === 'SUSPENSE' || to === 'OUT_SETTLED') return { base: '#78350f', glow: '#fbbf24' };
  if (to === 'CUSTOMER_OTP' || from === 'CUSTOMER_OTP') return { base: '#4c1d95', glow: '#a78bfa', dash: '3 3' };
  return { base: '#334155', glow: '#38bdf8' };
}

function Wires({ moves, tick, focus, flow }: { moves: readonly Move[]; tick: number; focus: Focus | null; flow: FlowFocus | null }) {
  const heat = useWireHeat(moves, tick);
  // The wires the token is on right now glow brightest; the ones it has already ridden stay lit.
  const current = new Set(focus && !focus.tour.intro ? wiresOfRoute(focus.current.route) : []);

  return (
    <svg className="pointer-events-none absolute inset-0 z-10" width={STAGE.width} height={STAGE.height} aria-hidden="true">
      <defs>
        {(['#334155', '#7f1d1d', '#78350f', '#4c1d95'] as const).map((c) => (
          <marker key={c} id={`bk-arrow-${c.slice(1)}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0.5 0.8L7 4L0.5 7.2z" fill={c} />
          </marker>
        ))}
      </defs>
      {BANK_WIRES.map((w) => {
        const st = wireStyle(w.to, w.from);
        const h = focus ? 0 : (heat[w.id] ?? 0);
        const inScope = !focus || focus.scope.wires.has(w.id);
        const inFlow = !flow || flow.scope.wires.has(w.id);
        const ridden = focus?.trail.has(w.id) ?? false;
        return (
          <g key={w.id} data-wire={w.id} data-lit={focus ? inScope : flow ? inFlow : undefined} data-ridden={ridden || undefined} opacity={inScope && inFlow ? 1 : 0.15} style={focus && !inScope ? { filter: 'blur(1px)' } : flow && !inFlow ? { filter: 'grayscale(1)' } : undefined}>
            <path d={w.path} fill="none" stroke={focus && inScope ? `${focus.accent}66` : flow && inFlow ? `${flow.accent}88` : st.base} strokeWidth="2" {...(st.dash ? { strokeDasharray: st.dash } : {})} markerEnd={`url(#bk-arrow-${st.base.slice(1)})`} />
            {h > 0.05 && <path d={w.path} fill="none" stroke={st.glow} strokeWidth={2 + Math.min(h, 6) * 0.3} strokeLinecap="round" opacity={Math.min(0.55, 0.1 + h * 0.07)} style={{ transition: 'opacity 400ms' }} />}
            {focus && ridden && (
              <path
                d={w.path}
                fill="none"
                stroke={focus.accent}
                strokeWidth={current.has(w.id) ? 3.6 : 2.6}
                strokeLinecap="round"
                className={current.has(w.id) ? 'bk-tour-path bk-flow' : 'bk-tour-path'}
                style={{ filter: `drop-shadow(0 0 5px ${focus.accent})` }}
                data-testid={`tour-wire-${w.id}`}
              />
            )}
          </g>
        );
      })}
      {BANK_WIRES.filter((w) => w.label && w.showLabel).map((w) => (
        <g key={`label-${w.id}`} transform={`translate(${w.labelAt[0]} ${w.labelAt[1]})`} opacity={(!focus || focus.scope.wires.has(w.id)) && (!flow || flow.scope.wires.has(w.id)) ? 1 : 0.15}>
          <rect x={-(w.label as string).length * 2.7 - 4} y="-7" width={(w.label as string).length * 5.4 + 8} height="14" rx="4" fill="#060912" stroke="#1e293b" />
          <text textAnchor="middle" y="3.2" fontSize="9" fill="#94a3b8" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
            {w.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * The tokens on the move this beat. They are HTML layers above the wires, not drawn inside the wire SVG: a token that is moved
 * by the GPU costs the page nothing per frame, where one drawn in the SVG made the whole wire layer lay itself out each frame.
 */
/** How many of a beat's tokens wear a badge saying what the payment is. */
const LABELLED_TOKENS = 6;

function Travellers({ moves, tick, phase, speedIndex, className = '' }: { moves: readonly Move[]; tick: number; phase: Phase; speedIndex: number; className?: string }) {
  const beat = beatMs(phase, SPEEDS[speedIndex]?.factor ?? 1);
  const hop = Math.round(Math.max(240, Math.min(720, beat * 0.5)));
  return (
    <div className={`pointer-events-none absolute inset-0 z-10 ${className}`} aria-hidden="true">
      {moves.map((m, i) => {
        const path = pathOfWire(m.edge);
        if (!path) return null;
        // The first few payments of a beat say what they are for. More would only hide the wires, and a hop that is over in a blink cannot be read.
        const label = i < LABELLED_TOKENS && hop >= 320 ? m.scenario : '';
        return <PathTraveller key={`${tick}-${m.key}`} path={path} look={lookOfKind(m.kind, m.cardType)} delayMs={Math.round(m.at * beat * 0.55)} durationMs={hop} {...(label ? { label } : {})} />;
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The map
// ─────────────────────────────────────────────────────────────────────────────

const STATION_LIST = Object.values(STATIONS);
const EXTERNALS: readonly ExternalId[] = ['CUSTOMER_OTP', 'OUT_APPROVED', 'OUT_DECLINED', 'OUT_SETTLED'];

function BankMapView() {
  const inset = useDockInset();
  // The preset bar of a guided flow floats at the bottom of the map: the blueprint stops above it.
  const bottomInset = useBankStore((s) => (activeFlowOf(s) ? 64 : 0));
  const { ref, scale: fit } = useFitScale(inset, bottomInset);
  const { zoom, content, panned } = useZoomPan(ref, fit);
  const scale = fit * zoom;
  const view = useBankStore((s) => s.view);
  const selection = useBankStore((s) => s.selection);
  const speedIndex = useBankStore((s) => s.speedIndex);
  const clearSelection = useBankStore((s) => s.clearSelection);
  const focus = useSpotlightFocus();
  const terms = useTerms();
  const activeFlow = useBankStore(activeFlowOf);
  const presetId = useBankStore((s) => s.presetTxId);
  const presetPlace = useBankStore((s) => (s.presetTrace && !s.presetTrace.done ? (s.presetTrace.route[s.presetTrace.at] ?? null) : null));
  const flow = useMemo<FlowFocus | null>(() => (activeFlow ? { flow: activeFlow, accent: GUIDED_FLOWS[activeFlow].accent, scope: flowScope(activeFlow) } : null), [activeFlow]);
  const flowHereAt = flow ? presetPlace : null;
  // The node the Academy split view is teaching pulses like the learner's own payment does.
  const academyAt = useBankStore(academyFocusOf);
  // The learner's own payment goes first, so it is always one of the tokens that wear a badge.
  const moves = useMemo(() => (presetId ? [...view.moves].sort((a, b) => Number(b.packetId === presetId) - Number(a.packetId === presetId)) : view.moves), [view.moves, presetId]);
  const litMoves = useMemo(() => (flow ? moves.filter((m) => flow.scope.wires.has(m.edge)) : moves), [moves, flow]);
  const dimMoves = useMemo(() => (flow ? moves.filter((m) => !flow.scope.wires.has(m.edge)) : []), [moves, flow]);

  const night = view.phase === 'EOD';
  const selectedStation = selection.kind === 'station' ? selection.id : selection.kind === 'worker' ? selection.station : null;
  const spotlit: PlaceId | null = focus ? focus.current.place : null;

  return (
    <StageScaleContext.Provider value={scale}>
      <div ref={ref} className="relative h-full w-full overflow-auto" onClick={(e) => e.target === e.currentTarget && !panned.current && clearSelection()} data-testid="bank-map" data-zoom={Math.round(scale * 100)} data-phase={view.phase} data-day={view.day} data-touring={focus ? 'yes' : 'no'} data-spot={spotlit ?? undefined} data-flow={flow?.flow ?? undefined}>
        <div ref={content} className="relative mx-auto" style={{ width: STAGE.width * scale, height: STAGE.height * scale, marginTop: inset }}>
          <div
            className={`bk-stage relative ${night ? 'bk-night' : ''} ${focus ? 'bk-touring' : ''}`}
            style={{ width: STAGE.width, height: STAGE.height, transform: `scale(${scale})`, transformOrigin: 'top left' }}
            data-testid="bank-stage"
            data-phase={view.phase}
            onClick={(e) => e.target === e.currentTarget && !panned.current && clearSelection()}
          >
            {DEPARTMENT_IDS.map((id) => (
              <DepartmentFrame key={id} id={id} focus={focus} flow={flow} terms={terms} />
            ))}
            <Wires moves={view.moves} tick={view.tick} focus={focus} flow={flow} />
            {!focus && <Travellers moves={litMoves} tick={view.tick} phase={view.phase} speedIndex={speedIndex} />}
            {!focus && dimMoves.length > 0 && <Travellers moves={dimMoves} tick={view.tick} phase={view.phase} speedIndex={speedIndex} className="opacity-15 grayscale" />}
            {STATION_LIST.map((def) => (
              <StationCard key={def.id} id={def.id} sv={view.stations[def.id]} phase={view.phase} tick={view.tick} selected={selectedStation === def.id} accent={DEPARTMENTS[def.department].accent} focus={focus} flow={flow} flowHere={flowHereAt === def.id || academyAt === def.id} terms={terms} />
            ))}
            {EXTERNALS.map((id) => (
              <ExternalNode key={id} id={id} focus={focus} flow={flow} flowHere={flowHereAt === id || academyAt === id} terms={terms} />
            ))}
            {night && !focus && (
              <div className="pointer-events-none absolute z-20 flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10.5px] font-semibold text-amber-200" style={{ left: DEPT_BOX.EOD.x + DEPT_BOX.EOD.w - 200, top: DEPT_BOX.EOD.y + 8 }}>
                <MoonIcon /> {t('night cycle running')}
              </div>
            )}
            {focus && <SpotlightToken focus={focus} />}
          </div>
          <SpotlightOverlay />
        </div>
      </div>
    </StageScaleContext.Provider>
  );
}

/** The map takes no props and reads the store itself, so it redraws for the bank's own changes only, never because a parent did. */
export const BankMap = memo(BankMapView);
