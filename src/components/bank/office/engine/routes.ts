import { STATIONS, type StationId } from '../../../../sim/topology';
import { evacuationRoute } from '../evacuation';
import { arriveRoute, leaveRoute } from '../focus3d';
import { arrivalPath, atmExitPath, queueSlots, type Pose, type V2 } from '../layout3d';

/**
 * How people find their way in the 3D office (Strategy). A customer's way to and from a desk depends on the kind of desk:
 * down the pavement and into a sidewalk ATM's booth, or from the car park in at the side door to a counter; staff come and
 * go by the main entrance. Each kind is one strategy, and whoever moves people asks the desk's strategy for the way rather
 * than knowing every kind of route. All routes keep clear of ropes, posts, desks, booth glass and the machines.
 */

/** A customer's ways at one desk. */
export interface PathfindingStrategy {
  /** The way a newcomer walks to place `place` of the desk's line (0 at the counter or machine). */
  approach(place: number): V2[];
  /** The way the customer served in place `k` of the line walks off. */
  depart(k: number): V2[];
}

/** A sidewalk ATM: down the pavement and in at the rope's gap; out along the inside of the booth and off down the street. */
class PavementAtmRoute implements PathfindingStrategy {
  constructor(private readonly id: StationId) {}
  approach(place: number): V2[] {
    return arrivalPath(this.id, place);
  }
  depart(k: number): V2[] {
    return [queueSlots(this.id, k + 1)[k]!, ...atmExitPath(this.id)];
  }
}

/** A counter in the branch: from the car park in at the side door, along the wall and the front aisle; back out the same way. */
class SideDoorCounterRoute implements PathfindingStrategy {
  constructor(private readonly id: StationId) {}
  approach(place: number): V2[] {
    return arrivalPath(this.id, place);
  }
  depart(k: number): V2[] {
    return evacuationRoute(queueSlots(this.id, k + 1)[k]!, 2).path;
  }
}

const strategies = new Map<StationId, PathfindingStrategy>();

/** The way-finding strategy for customers of desk `id`. */
export function routesFor(id: StationId): PathfindingStrategy {
  let s = strategies.get(id);
  if (!s) {
    s = STATIONS[id].kind === 'ATM' ? new PavementAtmRoute(id) : new SideDoorCounterRoute(id);
    strategies.set(id, s);
  }
  return s;
}

/** The staff's ways to and from their chairs. */
export interface StaffRouteStrategy {
  arrive(pose: Pose, seat: V2, k: number): V2[];
  leave(pose: Pose, seat: V2, k: number): V2[];
}

/** By the main entrance: up the aisles to the chair, and back out the same way and off down the street. */
export const MAIN_GATE_STAFF_ROUTE: StaffRouteStrategy = {
  arrive: arriveRoute,
  leave: leaveRoute,
};
