/**
 * Where the learner's payment is on its route, for the 3D flow highlight (TransactionFlow3D): the wire it is crossing, the station
 * it is at, and whether that station decides by rule (STP, a machine) or by a person (MANUAL, a staffed desk). The route as a
 * whole is STP, MANUAL or HYBRID (rules take the clean cases, a desk the exceptions). Pure, no React.
 */

import { isAutomatedNode } from './nodeKind';
import { isStation, type PlaceId } from './topology';

export type NodeMode = 'STP' | 'MANUAL';
export type RouteMode = NodeMode | 'HYBRID';

/** A station's mode, or null for a place no one decides at (an outcome, a kiosk). */
export const nodeMode = (p: PlaceId): NodeMode | null => (isStation(p) ? (isAutomatedNode(p) ? 'STP' : 'MANUAL') : null);

/** A route's mode: every station automated is STP, every one staffed is MANUAL, a mix is HYBRID; null with no station at all. */
export function routeMode(route: readonly PlaceId[]): RouteMode | null {
  const modes = new Set(route.map(nodeMode).filter((m): m is NodeMode => m !== null));
  return modes.size === 0 ? null : modes.size > 1 ? 'HYBRID' : [...modes][0]!;
}

export interface FlowBeat {
  /** The wire the payment is crossing into `at` (null at its first stop). */
  from: PlaceId | null;
  at: PlaceId;
  mode: NodeMode;
  route: RouteMode;
}

/** The payment's beat now, or null once it is done or while it stands at a place nobody decides at. */
export function flowBeat(trace: { route: readonly PlaceId[]; at: number; done: boolean } | null): FlowBeat | null {
  if (!trace || trace.done) return null;
  const at = trace.route[trace.at];
  const mode = at ? nodeMode(at) : null;
  if (!at || !mode) return null;
  return { from: trace.at > 0 ? trace.route[trace.at - 1]! : null, at, mode, route: routeMode(trace.route) ?? mode };
}
