import { BAY_ENDPOINTS, bayEndpointAt, CASH_LINES, CIT_BAY, PLACE_BOX, pointsOfWire } from '../../engine/plan/layout';
import type { CitStopId } from '../../sim/citRoute';
import type { HopStop } from '../../sim/hopPlayer';
import { edgeId } from '../../sim/topology';
import type { Pt } from '../../types/geometry';

/** Where the hop player's stops and hops are on the 2D map: a desk's card, the CIT bay card, or an off-site end on the bay's bottom row. */

const BAY_ICON: Partial<Record<CitStopId, number>> = { HQ: BAY_ENDPOINTS.indexOf('HQ'), SBV: BAY_ENDPOINTS.indexOf('SBV'), CORP: BAY_ENDPOINTS.indexOf('CORP') };

/** A stop's centre and the top edge its badge stands on. */
export function stopBox2D(stop: HopStop): { at: Pt; top: number } {
  const box = stop.place ? PLACE_BOX[stop.place] : undefined;
  if (box) return { at: [box.cx, box.cy], top: box.cy - box.h / 2 };
  const i = stop.cit ? BAY_ICON[stop.cit] : undefined;
  if (i !== undefined) {
    const at = bayEndpointAt(i);
    return { at, top: at[1] - 12 };
  }
  return { at: [CIT_BAY.x + CIT_BAY.w / 2, CIT_BAY.y + CIT_BAY.h / 2], top: CIT_BAY.y };
}

const reversed = (pts: readonly Pt[]): Pt[] => [...pts].reverse();

/**
 * The line a hop's icon glides along: the payment wire between two desks (either way round), the vault's gold cash line to the bay
 * or the till, else straight from one stop to the next.
 */
export function hopPath2D(a: HopStop, b: HopStop): Pt[] {
  if (a.place && b.place) {
    const fwd = pointsOfWire(edgeId(a.place, b.place));
    if (fwd) return [...fwd];
    const back = pointsOfWire(edgeId(b.place, a.place));
    if (back) return reversed(back);
  }
  for (const end of ['BAY', 'TELLER'] as const) {
    if (a.cit === 'VAULT' && b.cit === end) return [...CASH_LINES[end]];
    if (b.cit === 'VAULT' && a.cit === end) return reversed(CASH_LINES[end]);
  }
  return [stopBox2D(a).at, stopBox2D(b).at];
}
