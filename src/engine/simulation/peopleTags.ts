import type { VisitStatus } from '../../sim/deskVisit';
import type { StationId } from '../../sim/topology';
import { deskPose, WALKER_STATIONS } from '../plan/layout3d';
import type { ArrivalWalks, DeskLine, ServedPose } from './people';

/**
 * The status over the heads of the customers at the walk-up counters in the 3D office (the teller, the disputes desk, the ATMs),
 * in the same words as the desk visits: on the way in, at the counter or machine, done and walking off, and the head of a line
 * waiting its turn. The rest of a line is left untagged: the desk's badge already counts it, and a tag each would hide the floor.
 */

export interface PersonTag {
  x: number;
  z: number;
  status: VisitStatus;
}

/** A served customer's journey (customerLifecycle.ts) in the status words: up to the counter, at it, then done and on their way. */
const SERVED_STATUS: Readonly<Record<ServedPose['state'], VisitStatus | null>> = { walking: 'arriving', interacting: 'processing', turning: 'done', departing: 'done', gone: null };

/** Most useful first, when there are more than the labels to show them. */
const RANK: Readonly<Record<VisitStatus, number>> = { processing: 0, arriving: 1, done: 2, waiting: 3 };

export interface TagSource {
  arrivals: Pick<ArrivalWalks, 'poses'>;
  line(id: StationId): Pick<DeskLine, 'figures' | 'servedPoses'>;
}

/** Everyone who carries a tag now, in world coordinates, best first, at most `max`. */
export function counterTags(world: TagSource, max: number, desks: readonly StationId[] = WALKER_STATIONS): PersonTag[] {
  const out: PersonTag[] = [];
  for (const p of world.arrivals.poses) if (p.visible) out.push({ x: p.x, z: p.z, status: 'arriving' });
  for (const id of desks) {
    const line = world.line(id);
    const pose = deskPose(id);
    let busy = false;
    for (const s of line.servedPoses.values()) {
      const status = SERVED_STATUS[s.state];
      if (!status) continue;
      busy ||= status === 'processing';
      out.push({ x: s.at[0], z: s.at[1], status });
    }
    // The head of the line is at the counter or machine, unless someone late is doing their business there.
    const head = line.figures[0];
    if (head?.visible) out.push({ x: head.x + pose.x, z: head.z + pose.z, status: busy ? 'waiting' : 'processing' });
  }
  return out.sort((a, b) => RANK[a.status] - RANK[b.status]).slice(0, max);
}
