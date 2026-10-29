import type { StationView } from '../../sim/types';

/**
 * Whether a desk is working on a case right now (something was worked on, or left it, in the latest beat), as distinct from
 * how many are waiting: a desk can show "0 waiting" and still be busy with the case at its counter. The 2D map's desk
 * cards and the 3D office's desk badges both show the two side by side.
 */
export const isWorking = (sv: Pick<StationView, 'working' | 'served'>): boolean => sv.working !== null || sv.served > 0;

/** How many are working a case at the desk right now (its staff, or its machine): at least one whenever it is working. */
export const workingCount = (sv: Pick<StationView, 'working' | 'served' | 'workers'>): number => {
  const n = sv.workers.filter((w) => w.working).length;
  return n > 0 ? n : isWorking(sv) ? 1 : 0;
};

/** The status word to show after "X waiting · Y working": none while busy, as "Y working" already says it. */
export const statusAfterWorking = (status: StationView['status'], working: number): boolean => !(working > 0 && status === 'BUSY');
