import { create } from 'zustand';
import { wireNodeOf, type WireNode } from '../sim/cashWires';
import { useBankStore } from './bankStore';

/**
 * The cash-network station under the pointer, for the gold-wire highlight (sim/cashWires.ts). The 2D map writes it from the card
 * under the pointer; the 3D bay writes 'BAY' (it has no PlaceId). The 3D desks and the vault door already report bankStore.hoverPlace,
 * which useWireHover folds in, so they need no second write.
 */
export const useWireHoverStore = create<{ node: WireNode | null; set: (node: WireNode | null) => void }>((set, get) => ({
  node: null,
  set: (node) => {
    if (get().node !== node) set({ node });
  },
}));

/** The hovered cash station, from either map. */
export function useWireHover(): WireNode | null {
  const own = useWireHoverStore((s) => s.node);
  const place = useBankStore((s) => wireNodeOf(s.hoverPlace));
  return own ?? place;
}
