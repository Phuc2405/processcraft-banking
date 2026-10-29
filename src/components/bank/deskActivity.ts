import type { StationView } from '../../sim/types';

/**
 * Whether a desk is working on a case right now (something was worked on, or left it, in the latest beat), as distinct from
 * how many are waiting: a desk can show "0 waiting" and still be busy with the case at its counter. The 2D map's desk
 * cards and the 3D office's desk badges both show the two side by side.
 */
export const isWorking = (sv: Pick<StationView, 'working' | 'served'>): boolean => sv.working !== null || sv.served > 0;
