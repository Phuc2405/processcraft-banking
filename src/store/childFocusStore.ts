import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { demoActionById, type DemoActionId } from '../sim/demoActions';
import { childPlaces, groupOf } from '../sim/demoGroups';
import type { PlaceId } from '../sim/topology';
import { activeFlowOf, bankStore, useBankStore, type BankState } from './bankStore';

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

type FocusView = Pick<BankState, 'scope' | 'flow' | 'spotlight' | 'subProcess'>;

/**
 * The desks the picked child crosses, or null when nothing is soft-dimmed: no pick, no lit flow (Advanced scope, a tour), or a pick
 * that belongs to another flow or sub-process than the one lit now.
 */
export function activeChildPlaces(s: FocusView, id: DemoActionId | null): ReadonlySet<PlaceId> | null {
  const flow = activeFlowOf(s);
  if (!id || flow === null) return null;
  const def = demoActionById(id);
  const sub = groupOf(s.subProcess);
  if (def.flow !== flow || (sub !== null && def.group !== sub)) return null;
  return childPlaces(id);
}

/** The opacity a place in the lit scope is drawn at: CHILD_DIM off the picked child's route, else full. */
export const childOpacity = (place: PlaceId, child: ReadonlySet<PlaceId> | null): number => (child && !child.has(place) ? CHILD_DIM : 1);

/** Now, for a per-frame reader (the 3D fade). */
export const childPlacesNow = (): ReadonlySet<PlaceId> | null => activeChildPlaces(bankStore.getState(), childFocusStore.getState().id);

export const useChildFocusId = (): DemoActionId | null => useStore(childFocusStore, (s) => s.id);

/** The picked child's desks while it soft-dims the map, or null (a cached set, so the selector stays stable). */
export function useChildPlaces(): ReadonlySet<PlaceId> | null {
  const id = useChildFocusId();
  return useBankStore((s) => activeChildPlaces(s, id));
}
