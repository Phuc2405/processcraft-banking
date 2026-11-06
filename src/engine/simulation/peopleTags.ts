import { actorStatus, type ActorStatus } from '../../sim/actorStatus';
import type { StationId } from '../../sim/topology';
import { deskPose, WALKER_STATIONS } from '../plan/layout3d';
import type { CitPose } from '../world/citRun';
import type { ArrivalWalks, DeskLine } from './people';

/**
 * The status over the heads of the people in the 3D office who are on their way to a task, at it, or done with it (ActorStatusBadge):
 * walkers in from the sidewalk, drivers walking between the car park and the branch, customers at the walk-up counters and ATMs
 * (the head of a line waiting its turn), and the CIT crew at the loading bay. Every kind maps its phases through actorStatus.ts,
 * so the words are the same everywhere; the rest of a line is left untagged (the desk's badge counts it).
 */

export interface PersonTag {
  x: number;
  z: number;
  status: ActorStatus;
}

/** Most useful first, when there are more than the labels to show them. */
const RANK: Readonly<Record<ActorStatus, number>> = { processing: 0, arriving: 1, done: 2, waiting: 3 };

export interface TagSource {
  arrivals: Pick<ArrivalWalks, 'poses'>;
  line(id: StationId): Pick<DeskLine, 'figures' | 'servedPoses'>;
  /** The car park: its drivers on foot, and the cash van's run with its crew. */
  lot?: { walkers(): ReadonlyArray<{ x: number; z: number; phase: 'walkingIn' | 'walkingOut' }>; cit: { pose(): Pick<CitPose, 'crew'> } };
}

/** Everyone who carries a tag now, in world coordinates, best first, at most `max`. */
export function counterTags(world: TagSource, max: number, desks: readonly StationId[] = WALKER_STATIONS): PersonTag[] {
  const out: PersonTag[] = [];
  const add = (x: number, z: number, status: ActorStatus | null): void => {
    if (status) out.push({ x, z, status });
  };
  for (const p of world.arrivals.poses) if (p.visible) add(p.x, p.z, actorStatus('walker', 'in'));
  for (const w of world.lot?.walkers() ?? []) add(w.x, w.z, actorStatus('driver', w.phase));
  for (const c of world.lot?.cit.pose().crew ?? []) add(c.at[0], c.at[1], c.status);
  for (const id of desks) {
    const line = world.line(id);
    const pose = deskPose(id);
    let busy = false;
    for (const s of line.servedPoses.values()) {
      const status = actorStatus('served', s.state);
      busy ||= status === 'processing';
      add(s.at[0], s.at[1], status);
    }
    // The head of the line is at the counter or machine, unless someone late is doing their business there.
    const head = line.figures[0];
    if (head?.visible) add(head.x + pose.x, head.z + pose.z, busy ? 'waiting' : 'processing');
  }
  return out.sort((a, b) => RANK[a.status] - RANK[b.status]).slice(0, max);
}
