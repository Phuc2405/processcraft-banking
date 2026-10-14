import { useMemo } from 'react';
import { spotScope } from '../../../sim/spotlightPlan';
import { isStation, type PlaceId } from '../../../sim/topology';
import { activeFlowOf, bankStore, useBankStore } from '../../../store/bankStore';
import { flowPlaces } from '../../../sim/guidedFlows';

/**
 * Whether a desk takes part in the chapter being toured: true or false during a tour, null when there is no tour.
 * The desk badges use it to show only the lit desks while a tour runs, whichever label mode is chosen.
 */
export function useTourLit(place: PlaceId): boolean | null {
  const process = useBankStore((s) => s.spotlight?.process ?? null);
  // A guided flow (Beginner scope) lights its own desks the same way when no tour is running.
  const flow = useBankStore(activeFlowOf);
  return useMemo(() => (process ? spotScope(process).places.has(place) : flow ? flowPlaces(flow).has(place) : null), [process, flow, place]);
}

/**
 * What a click on a desk (or a person at it, or its badge) does: during a tour it takes the token to that desk if the story
 * goes there, as on the 2D map; otherwise it opens the desk in the inspector.
 */
export function pickPlace(place: PlaceId): void {
  const s = bankStore.getState();
  if (s.spotlight) s.spotlightFocus(place);
  else if (isStation(place)) s.select({ kind: 'station', id: place });
}
