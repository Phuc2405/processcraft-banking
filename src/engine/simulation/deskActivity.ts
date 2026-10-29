import type { Phase } from '../../sim/clock';
import { STATIONS, type StationId } from '../../sim/topology';
import type { StationView } from '../../sim/types';

/** Whether a desk is working on a case right now (something was worked on, or left it, in the latest beat), as distinct from how many are waiting. */
export const isWorking = (sv: Pick<StationView, 'working' | 'served'>): boolean => sv.working !== null || sv.served > 0;

/** How many are working a case at the desk right now (its staff, or its machine): at least one whenever it is working. */
export const workingCount = (sv: Pick<StationView, 'working' | 'served' | 'workers'>): number => {
  const n = sv.workers.filter((w) => w.working).length;
  return n > 0 ? n : isWorking(sv) ? 1 : 0;
};

/** The status word to show after "X waiting · Y working": none while busy, as "Y working" already says it. */
export const statusAfterWorking = (status: StationView['status'], working: number): boolean => !(working > 0 && status === 'BUSY');

/** Whether desk `id` has work at this hour (a desk with none is drawn dim on the map unless something still waits at it). */
export function isOnShift(id: StationId, phase: Phase): boolean {
  const def = STATIONS[id];
  if (def.department === 'EOD') return def.openHoursOnly ? phase === 'WORKING' : phase === 'EOD';
  return phase === 'WORKING' || phase === 'AFTER_HOURS';
}
