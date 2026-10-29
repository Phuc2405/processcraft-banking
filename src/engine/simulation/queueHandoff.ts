import type { StationId } from '../../sim/topology';
import type { V2 } from '../plan/layout3d';

/** How long an arrival waits to be taken over by its desk (motion-clock seconds). */
const HANDOFF_S = 3;

/** Someone who has just reached the end of a line: where, when, and their look. */
export interface Landed {
  at: V2;
  when: number;
  who: number;
}

/** A customer walking up to a desk's line (Traffic: Arrivals) and the line drawn at the desk (Desk3D: DeskQueue) are the same person, never two. */
export class QueueHandoff {
  private walking = new Map<StationId, number>();
  private landed = new Map<StationId, Landed[]>();

  /** Someone has set off for the end of `id`'s line. */
  expect(id: StationId): void {
    this.walking.set(id, (this.walking.get(id) ?? 0) + 1);
  }

  /** They (`who`, their look) have reached it, at `at`, at time `when` (motion clock): the desk draws them from here on. */
  arrive(id: StationId, at: V2, when: number, who: number): void {
    this.walking.set(id, Math.max(0, (this.walking.get(id) ?? 0) - 1));
    const list = this.landed.get(id) ?? [];
    list.push({ at, when, who });
    this.landed.set(id, list);
  }

  /** They will not arrive after all (the office stopped drawing them). */
  drop(id: StationId): void {
    this.walking.set(id, Math.max(0, (this.walking.get(id) ?? 0) - 1));
  }

  /** How many are still on their way to `id`'s line. */
  pending(id: StationId): number {
    return this.walking.get(id) ?? 0;
  }

  /** Where the next to have just arrived stopped, for the desk to take them over there (or undefined: nobody to take over). */
  take(id: StationId, now: number): Landed | undefined {
    const list = this.landed.get(id);
    while (list && list.length > 0) {
      const next = list.shift()!;
      if (now - next.when <= HANDOFF_S) return next;
    }
    return undefined;
  }

  reset(): void {
    this.walking.clear();
    this.landed.clear();
  }
}

/** The one handoff the 3D office shares. */
export const queueHandoff = new QueueHandoff();
