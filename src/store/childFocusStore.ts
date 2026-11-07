import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { demoActionById, type DemoActionId } from '../sim/demoActions';
import { childPlaces, groupOf } from '../sim/demoGroups';
import type { PlaceId } from '../sim/topology';
import { activeFlowOf, activeScopeOf, bankStore, useBankStore, type BankState } from './bankStore';
import { eodCaseStore, useEodCase } from './eodCaseStore';

/**
 * The child scenario the learner picked in the demo bar (a run, or a pick in its dropdown). Inside the lit sub-process, the desks
 * that scenario does not cross are soft-dimmed (CHILD_DIM), never hidden, so the whole sub-process stays readable; the bar's
 * "👁️ Show all desks" clears it.
 */
export const CHILD_DIM = 0.35;

interface ChildFocusState {
  id: DemoActionId | null;
  pick(id: DemoActionId): void;
  reset(): void;
}

export const childFocusStore = createStore<ChildFocusState>((set, get) => ({
  id: null,
  pick: (id) => {
    if (get().id !== id) set({ id });
  },
  reset: () => {
    if (get().id !== null) set({ id: null });
  },
}));

type FocusView = Pick<BankState, 'scope' | 'flow' | 'spotlight' | 'subProcess'> & Partial<Pick<BankState, 'stp'>>;

/**
 * The desks the picked child crosses, or null when nothing is soft-dimmed: no pick, no lit flow (Advanced scope, a tour), or a pick
 * that belongs to another flow or sub-process than the one lit now.
 */
export function activeChildPlaces(s: FocusView, id: DemoActionId | null, eodSuspense = false): ReadonlySet<PlaceId> | null {
  const flow = activeFlowOf(s);
  if (!id || flow === null) return null;
  const def = demoActionById(id);
  const sub = groupOf(s.subProcess);
  if (def.flow !== flow || (sub !== null && def.group !== sub)) return null;
  return childPlaces(id, s.stp ?? null, eodSuspense);
}

/** The opacity a place in the lit scope is drawn at: CHILD_DIM off the picked child's route, else full. */
export const childOpacity = (place: PlaceId, child: ReadonlySet<PlaceId> | null): number => (child && !child.has(place) ? CHILD_DIM : 1);

/** Now, for a per-frame reader (the 3D fade). */
export const childPlacesNow = (): ReadonlySet<PlaceId> | null => activeChildPlaces(bankStore.getState(), childFocusStore.getState().id, eodCaseStore.getState().suspense);

export const useChildFocusId = (): DemoActionId | null => useStore(childFocusStore, (s) => s.id);

/** The picked child while it soft-dims the map (its flow and sub-process are the lit ones), else null. */
export function useActiveChildId(): DemoActionId | null {
  const id = useChildFocusId();
  return useBankStore((s) => (activeChildPlaces(s, id) ? id : null));
}

/** The picked child's desks while it soft-dims the map, or null (a cached set, so the selector stays stable). */
export function useChildPlaces(): ReadonlySet<PlaceId> | null {
  const id = useChildFocusId();
  const suspense = useEodCase((s) => s.suspense);
  return useBankStore((s) => activeChildPlaces(s, id, suspense));
}

/**
 * Whether a place is off the bright path of the lit sub-process (outside its scope, or inside it but off the picked child's route):
 * its status lamp, status strip and screens stop glowing, so only the scenario's own desks read as active.
 */
export function useOffBrightPath(place: PlaceId): boolean {
  const child = useChildPlaces();
  return useBankStore((s) => {
    const scope = activeScopeOf(s);
    return !!scope && (!scope.places.has(place) || (!!child && !child.has(place)));
  });
}
