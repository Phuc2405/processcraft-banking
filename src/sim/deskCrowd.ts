/**
 * The 2D map's line at the counters customers walk up to (the teller, the disputes desk, the ATMs), read from the simulation's own
 * queue: one figure per customer up to a cap, the head at the counter while the desk is working. Pure, so it is tested without a DOM.
 */

import type { ActorStatus } from './actorStatus';

/** Figures shown in a line at most; more are told by a "+N" tag. */
export const CROWD_CAP = 3;

export interface Crowd {
  /** The key the next newcomer gets. */
  next: number;
  /** Who stands in the line, head (at the counter) first. */
  line: readonly number[];
}

export const emptyCrowd = (size = 0): Crowd => ({ next: size, line: Array.from({ length: size }, (_, i) => i) });

/** The line once it holds `target` people (capped): the served leave from the head, newcomers join at the tail. */
export function crowdStep(c: Crowd, target: number): { crowd: Crowd; left: number[]; joined: number[] } {
  const want = Math.max(0, Math.min(CROWD_CAP, Math.floor(target)));
  if (want === c.line.length) return { crowd: c, left: [], joined: [] };
  if (want < c.line.length) {
    const gone = c.line.length - want;
    return { crowd: { next: c.next, line: c.line.slice(gone) }, left: c.line.slice(0, gone), joined: [] };
  }
  const joined = Array.from({ length: want - c.line.length }, (_, i) => c.next + i);
  return { crowd: { next: c.next + joined.length, line: [...c.line, ...joined] }, left: [], joined };
}

/** People at a desk for its line: those waiting, and the one at the counter while it is working. */
export const crowdSize = (queueLength: number, working: number): number => queueLength + (working > 0 ? 1 : 0);

/** The status a figure of the line carries (the desk visits' words), or null for one further back, whom the desk's badge counts. */
export function crowdStatus(f: { leaving: boolean; arriving: boolean; serving: boolean; place: number }): ActorStatus | null {
  if (f.leaving) return 'done';
  if (f.arriving) return 'arriving';
  if (f.place > 0) return null;
  return f.serving ? 'processing' : 'waiting';
}
