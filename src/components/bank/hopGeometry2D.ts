import { BAY_ENDPOINTS, bayEndpointAt, cashWirePoints, CIT_BAY, PLACE_BOX, pointsOfWire } from '../../engine/plan/layout';
import { CASH_WIRES, WIRE_ENDS, type WireNode } from '../../sim/cashWires';
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

const CASH_NODES: readonly WireNode[] = ['VAULT', 'TELLER', 'ATM', 'BAY'];
const cashNode = (s: HopStop): WireNode | null => (s.cit && (CASH_NODES as readonly string[]).includes(s.cit) ? (s.cit as WireNode) : null);

/** A hop's line, and whether it runs on a drawn wire (only then is it stroked: an off-wire hop never draws a stray line). */
export interface HopPath {
  points: Pt[];
  wired: boolean;
}

/**
 * The line a hop's icon glides along: the payment wire between two desks (either way round), or the gold cash line between two
 * stations of the cash network (vault ↔ bay, till, ATM; bay ↔ till). Any other hop (the van from the bay to an off-site end or the
 * ATM) has no wire: the icon glides straight and nothing is stroked.
 */
export function hopPath2D(a: HopStop, b: HopStop): HopPath {
  if (a.place && b.place) {
    const fwd = pointsOfWire(edgeId(a.place, b.place));
    if (fwd) return { points: [...fwd], wired: true };
    const back = pointsOfWire(edgeId(b.place, a.place));
    if (back) return { points: reversed(back), wired: true };
  }
  const [na, nb] = [cashNode(a), cashNode(b)];
  for (const w of CASH_WIRES) {
    const [from, to] = WIRE_ENDS[w];
    if (na === from && nb === to) return { points: [...cashWirePoints(w)], wired: true };
    if (na === to && nb === from) return { points: reversed(cashWirePoints(w)), wired: true };
  }
  return { points: [stopBox2D(a).at, stopBox2D(b).at], wired: false };
}
