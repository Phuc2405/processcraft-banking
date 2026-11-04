/**
 * How many people the desk visits (deskVisitStore) have waiting and at the counter, desk by desk: the overlay the desk status feed
 * adds to the simulation's own queue, so a desk with people at it says "X waiting · Y working" instead of "0 waiting · idle".
 * Counted a few times a second while the visits run, once when they freeze, and cleared when they end.
 */

import { createStore } from 'zustand/vanilla';
import { VISIT_2D, VISIT_3D } from '../engine/plan/deskVisitPaths';
import type { DeskOverlay, DeskPeople } from '../engine/simulation/deskStatus';
import { visitCounts, type VisitDesk } from '../sim/deskVisit';
import type { StationId } from '../sim/topology';
import { bankStore } from './bankStore';
import { deskVisitStore, visitElapsed, type ActiveVisit } from './deskVisitStore';

export type Occupancy = Readonly<Partial<Record<VisitDesk, DeskPeople>>>;

/** The people at each desk at `now`, timed on the walks of the view on screen (the 2D map's and the 3D floor's differ a little). */
export function occupancyOf(visits: readonly ActiveVisit[], view: '2d' | '3d', now?: number): Occupancy {
  const out: Partial<Record<VisitDesk, DeskPeople>> = {};
  for (const v of visits) {
    const geo = (view === '3d' ? VISIT_3D : VISIT_2D)[v.step.desk];
    const c = visitCounts(v.step, geo, visitElapsed(v, now));
    const was = out[v.step.desk];
    out[v.step.desk] = was ? { waiting: was.waiting + c.waiting, processing: was.processing + c.processing } : c;
  }
  for (const k of Object.keys(out) as VisitDesk[]) if (out[k]!.waiting + out[k]!.processing === 0) delete out[k];
  return out;
}

/** The new occupancy, reusing each desk's entry from `prev` when its counts did not change (the feed re-reads a desk only then). */
function merge(prev: Occupancy, next: Occupancy): Occupancy {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]) as Set<VisitDesk>;
  let changed = false;
  const out: Partial<Record<VisitDesk, DeskPeople>> = {};
  for (const k of keys) {
    const a = prev[k];
    const b = next[k];
    if (a && b && a.waiting === b.waiting && a.processing === b.processing) out[k] = a;
    else {
      changed = true;
      if (b) out[k] = b;
    }
  }
  return changed ? out : prev;
}

export const deskOccupancyStore = createStore<{ occ: Occupancy }>(() => ({ occ: {} }));

const recount = (): void => {
  const { visits } = deskVisitStore.getState();
  const occ = merge(deskOccupancyStore.getState().occ, occupancyOf(visits, bankStore.getState().viewMode));
  if (occ !== deskOccupancyStore.getState().occ) deskOccupancyStore.setState({ occ });
};

/** The overlay for the desk status feed. */
export const deskPeopleOverlay: DeskOverlay = {
  get: (id: StationId) => deskOccupancyStore.getState().occ[id as VisitDesk],
  subscribe: (listener) => deskOccupancyStore.subscribe(listener),
};

/** Keeps the count while visits run (4 times a second, the pace a person steps up the line); returns the way to stop. */
export function installDeskOccupancy(periodMs = 250): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const sync = (): void => {
    recount();
    const { visits, frozenAt } = deskVisitStore.getState();
    const run = visits.length > 0 && frozenAt === null;
    if (run && !timer) timer = setInterval(recount, periodMs);
    if (!run && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
  sync();
  const stopVisits = deskVisitStore.subscribe(sync);
  // The walks differ a little between the views: switching recounts at once.
  const stopView = bankStore.subscribe((s, p) => s.viewMode !== p.viewMode && recount());
  return () => {
    stopVisits();
    stopView();
    if (timer) clearInterval(timer);
    timer = null;
  };
}
