// Search jumps: the place the 2D map should fly to and glow for a moment.

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { PlaceId } from '../sim/topology';

export const NAV_GLOW_MS = 2000;

export interface NavTarget {
  place: PlaceId;
  serial: number;
}

export interface NavState {
  target: NavTarget | null;
  jump(place: PlaceId): void;
  clear(): void;
}

export function createNavStore(glowMs: number = NAV_GLOW_MS): StoreApi<NavState> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return createStore<NavState>()((set, get) => ({
    target: null,
    jump: (place) => {
      if (timer) clearTimeout(timer);
      const serial = (get().target?.serial ?? 0) + 1;
      set({ target: { place, serial } });
      timer = setTimeout(() => {
        timer = null;
        if (get().target?.serial === serial) set({ target: null });
      }, glowMs);
    },
    clear: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (get().target) set({ target: null });
    },
  }));
}

export const navStore = createNavStore();

export function useNavStore<T>(selector: (state: NavState) => T): T {
  return useStore(navStore, selector);
}
