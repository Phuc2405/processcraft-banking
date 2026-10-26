/**
 * Phase 8: the desk congestion heatmap on the 2D bank map.
 *
 * Each of the seven roleplay desks takes a heat colour from its live queue: green under 3 items, orange at 3-5, red above 5
 * or when the item at the head of the queue has waited past the desk SLA. Pure: the map only reads the result.
 */

import { roleForStation } from './staffRoleplay';
import type { StationId } from './topology';
import type { StationView } from './types';

export type DeskHeat = 'green' | 'orange' | 'red';

export const DESK_HEAT = {
  /** Queue length from which a desk turns orange. */
  warnAt: 3,
  /** Queue length above which a desk turns red. */
  critAbove: 5,
  /** Bank-clock minutes the head of a desk's queue may wait before its SLA is breached. */
  slaMin: 15,
} as const;

/** Whether the item at the head of the queue has waited past the desk SLA. */
export const headBreachesSla = (sv: Pick<StationView, 'queue'>): boolean => (sv.queue[0]?.waitedMin ?? 0) > DESK_HEAT.slaMin;

/** The heat colour of a roleplay desk, or null for any other station. */
export function deskHeat(id: StationId, sv: Pick<StationView, 'queueLength' | 'queue'>): DeskHeat | null {
  if (!roleForStation(id)) return null;
  if (sv.queueLength > DESK_HEAT.critAbove || headBreachesSla(sv)) return 'red';
  if (sv.queueLength >= DESK_HEAT.warnAt) return 'orange';
  return 'green';
}
