import { useMemo } from 'react';
import { spotScope } from '../../../sim/spotlightPlan';
import { isStation, type PlaceId } from '../../../sim/topology';
import { activeScopeOf, bankStore, useBankStore } from '../../../store/bankStore';

/** Whether a desk takes part in the chapter being toured: true or false during a tour, null when there is no tour. */
export function useTourLit(place: PlaceId): boolean | null {
  const process = useBankStore((s) => s.spotlight?.process ?? null);
  // A guided flow (Beginner scope) lights its own desks the same way when no tour is running.
  const scope = useBankStore(activeScopeOf);
  return useMemo(() => (process ? spotScope(process).places.has(place) : scope ? scope.places.has(place) : null), [process, scope, place]);
}

/** What a click on a desk (or a person at it, or its badge) does. */
export function pickPlace(place: PlaceId): void {
  const s = bankStore.getState();
  if (s.spotlight) s.spotlightFocus(place);
  else if (isStation(place)) s.select({ kind: 'station', id: place });
}
