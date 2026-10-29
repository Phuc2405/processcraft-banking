import type { StationId } from '../../sim/topology';
import { pathLength, pointAlongPath } from '../plan/path';
import type { V2 } from '../plan/layout3d';
import { evacuees, EXIT_PACE } from '../world/evacuation';

/** Closing time's walk-out (EvacuatingState for everyone queuing at a customer desk when the doors close at 17:00). */

/** One person walking out: where they are, which way they face, and whether they are still in view. */
export interface WalkoutPose {
  id: StationId;
  k: number;
  at: V2;
  heading: number;
  visible: boolean;
}

/** How long after the one ahead of them in the same line each person sets off, in seconds. */
const STAGGER = 0.35;

export class ClosingWalkout {
  private walkers: ReturnType<typeof evacuees> = [];
  private lengths: number[] = [];
  private since = 0;
  private wasClosed: boolean;

  constructor(closed: boolean) {
    // Someone already gone when the office first looks is not walked out again.
    this.wasClosed = closed;
  }

  /** Follows the bank's doors: closing sets the lines walking out (their lengths now from `queueLength`); opening clears it. */
  update(closed: boolean, queueLength: (id: StationId) => number): boolean {
    let changed = false;
    if (closed && !this.wasClosed) {
      this.walkers = evacuees(queueLength);
      this.lengths = this.walkers.map((w) => pathLength(w.path));
      this.since = 0;
      changed = true;
    }
    if (!closed && this.walkers.length) {
      this.walkers = [];
      this.lengths = [];
      changed = true;
    }
    this.wasClosed = closed;
    return changed;
  }

  /** Moves the walk-out on by `dt` seconds of motion; true when the last of them has just gone. */
  step(dt: number): boolean {
    if (!this.walkers.length) return false;
    this.since += dt;
    if (this.walkers.every((w, i) => (this.since - w.k * STAGGER) * EXIT_PACE >= this.lengths[i]!)) {
      this.walkers = [];
      this.lengths = [];
      return true;
    }
    return false;
  }

  /** Who is walking out (in a steady order: the view draws one figure each). */
  get who(): ReadonlyArray<{ id: StationId; k: number }> {
    return this.walkers;
  }

  /** Where each of them is now. */
  poses(): WalkoutPose[] {
    return this.walkers.map((w, i) => {
      const len = this.lengths[i]!;
      const d = (this.since - w.k * STAGGER) * EXIT_PACE;
      if (d >= len) return { id: w.id, k: w.k, at: w.path[w.path.length - 1]!, heading: 0, visible: false };
      const at = pointAlongPath(w.path, Math.max(0, d));
      const ahead = pointAlongPath(w.path, Math.min(len, Math.max(0, d) + 0.05));
      return { id: w.id, k: w.k, at, heading: Math.atan2(ahead[0] - at[0], ahead[1] - at[1]), visible: true };
    });
  }
}
