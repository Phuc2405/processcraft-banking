import { useMemo } from 'react';
import { spotScope } from '../../../sim/spotlightPlan';
import { isStation, type PlaceId } from '../../../sim/topology';
import { bankStore, useBankStore } from '../../../store/bankStore';

/**
 * Whether a desk takes part in the chapter being toured: true or false during a tour, null when there is no tour.
 * The desk badges use it to show only the lit desks while a tour runs, whichever label mode is chosen.
 */
export function useTourLit(place: PlaceId): boolean | null {
  const process = useBankStore((s) => s.spotlight?.process ?? null);
  return useMemo(() => (process ? spotScope(process).places.has(place) : null), [process, place]);
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
