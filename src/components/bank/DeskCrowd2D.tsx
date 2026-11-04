import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CROWD_APPROACH, crowdSlot2d } from '../../engine/plan/deskVisitPaths';
import { WALKER_STATIONS } from '../../engine/plan/layout3d';
import { workingCount } from '../../engine/simulation/deskActivity';
import { CROWD_CAP, crowdSize, crowdStatus, crowdStep, emptyCrowd, type Crowd } from '../../sim/deskCrowd';
import { useLocale } from '../../i18n/locale';
import { STATUS_TEXT } from './personStatus';
import type { StationId } from '../../sim/topology';
import { beatLive, useBankStore } from '../../store/bankStore';
import { H, Person, SHIRTS, W } from './DeskVisitors2D';

/**
 * The customers at the walk-up counters on the 2D map (the teller, the disputes desk, the ATMs), the twin of the 3D office's queues:
 * one figure per customer in the simulation's line, walking up as they join, stepping up as the head is served, walking off once done.
 * They move only on a beat played live: a paused bank (or the map drawn again from 3D) shows the line standing where it is.
 */

const MOVE_MS = 650;

const place = (at: readonly [number, number], dy = 0): string => `translate(${at[0] - W / 2}px, ${at[1] + dy - H / 2}px)`;

/** One figure: it walks in from below on joining, moves up the line, and walks off below when served. */
function CrowdFigure({ id, k, at, serving, leaving, entering }: { id: StationId; k: number; at: number; serving: boolean; leaving: boolean; entering: boolean }) {
  // A newcomer is drawn one frame below its place and a leaver one frame at the counter: the transition needs a first position to move from.
  const [settled, setSettled] = useState(!(entering || leaving));
  useLayoutEffect(() => {
    if (settled) return;
    const raf = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(raf);
  }, [settled]);
  // Still on the way up for the length of the walk: "Arriving" until they stand in their place.
  const [arriving, setArriving] = useState(entering);
  useEffect(() => {
    if (!arriving) return;
    const t = setTimeout(() => setArriving(false), MOVE_MS);
    return () => clearTimeout(t);
  }, [arriving]);
  const locale = useLocale();
  const off = entering ? !settled : leaving && settled;
  const phase = off || arriving ? 'walk' : serving ? 'transact' : 'queue';
  const status = crowdStatus({ leaving, arriving, serving, place: at });
  return (
    <div
      className="bk-visit-figure bk-crowd-figure pointer-events-none absolute left-0 top-0"
      style={{ transform: place(crowdSlot2d(id, at), off ? CROWD_APPROACH : 0), opacity: off ? 0 : 1 }}
      data-phase={phase}
      data-testid={`desk-crowd-${id}-${k}`}
    >
      <Person shirt={SHIRTS[k % SHIRTS.length] as string} officer={false} />
      {status && (
        <span className="bk-visit-status" data-status={status} aria-hidden="true">
          {STATUS_TEXT[status][locale]}
        </span>
      )}
    </div>
  );
}

function CounterLine({ id, live }: { id: StationId; live: boolean }) {
  const size = useBankStore((s) => crowdSize(s.view.stations[id].queueLength, workingCount(s.view.stations[id])));
  const working = useBankStore((s) => workingCount(s.view.stations[id]) > 0);
  const queue = useBankStore((s) => s.view.stations[id].queueLength);
  const [crowd, setCrowd] = useState<Crowd>(() => emptyCrowd(Math.min(CROWD_CAP, size)));
  const [leavers, setLeavers] = useState<readonly number[]>([]);
  const [joiners, setJoiners] = useState<ReadonlySet<number>>(() => new Set());
  const crowdRef = useRef(crowd);

  useEffect(() => {
    const r = crowdStep(crowdRef.current, size);
    if (r.left.length === 0 && r.joined.length === 0) return;
    crowdRef.current = r.crowd;
    setCrowd(r.crowd);
    // Only a beat played live walks: otherwise the line simply is what it is.
    setJoiners(new Set(live ? r.joined : []));
    if (live && r.left.length) setLeavers((l) => [...l, ...r.left]);
    // Keyed on the size alone: a pause or a play changes nobody's place.
  }, [size]);

  useEffect(() => {
    if (leavers.length === 0) return;
    const t = setTimeout(() => setLeavers([]), MOVE_MS);
    return () => clearTimeout(t);
  }, [leavers]);

  const extra = queue + (working ? 1 : 0) - crowd.line.length;
  const tail = crowdSlot2d(id, crowd.line.length);
  return (
    <>
      {leavers.map((k) => (
        <CrowdFigure key={k} id={id} k={k} at={0} serving={false} leaving entering={false} />
      ))}
      {crowd.line.map((k, i) => (
        <CrowdFigure key={k} id={id} k={k} at={i} serving={i === 0 && working} leaving={false} entering={joiners.has(k)} />
      ))}
      {extra > 0 && (
        <span className="pointer-events-none absolute left-0 top-0 rounded-full bg-slate-900/90 px-1.5 text-[10px] font-bold text-amber-200 ring-1 ring-amber-300/50" style={{ transform: `translate(${tail[0] - 4}px, ${tail[1] - 6}px)` }} data-testid={`desk-crowd-more-${id}`}>
          +{extra}
        </span>
      )}
    </>
  );
}

export function DeskCrowd2D() {
  const live = useBankStore(beatLive);
  return (
    <div className="pointer-events-none absolute inset-0 z-30" data-testid="desk-crowd-2d" data-frozen={!live} style={{ ['--crowd-ms' as string]: `${MOVE_MS}ms` }}>
      {WALKER_STATIONS.map((id) => (
        <CounterLine key={id} id={id} live={live} />
      ))}
    </div>
  );
}
