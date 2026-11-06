/**
 * The hop player: how every guided run is shown on both maps, one stop at a time (State pattern). For each stop:
 *   SHOW   the step badge stands over the stop (`Step 1: A ➔ Step 2: B ➔ Step 3: C`, this one highlighted), the moving icon hidden;
 *   TRAVEL the badge hides and the icon (💳 💸 💵 📜 📦…) glides along the one wire to the next stop, that wire lit;
 *   FINAL  at the last stop the badge comes back with every step done, holds, then the run is over.
 * It never runs ahead of the run itself: a stop the payment (or the CIT van) has not reached yet holds the badge in SHOW, so a desk
 * that is still deciding is where the learner sees the badge. Pure, no React: the store ticks it, both maps draw the same frame.
 */

import type { TraceLike } from './transactionPath';
import type { PlaceId } from './topology';
import type { CitStopId } from './citRoute';

/** A stop: a place on the map, or a CIT stop with no desk (the loading bay, the State Bank…). */
export interface HopStop {
  place: PlaceId | null;
  cit: CitStopId | null;
}

export type HopPhase = 'show' | 'travel' | 'final';

export interface HopPlay {
  index: number;
  phase: HopPhase;
  /** Seconds into the phase. */
  t: number;
}

/**
 * Seconds per phase: 2.2 s a hop (show + travel), so a six-stop payment plays in about 13 s with its final hold. The glide takes
 * longer than the stop: a learner traces the icon along each wire, at a relaxed pace, rather than seeing it jump desk to desk.
 */
export const HOP_TIMING = { show: 0.9, travel: 1.3, final: 1.5 } as const;

export const startPlay = (): HopPlay => ({ index: 0, phase: 'show', t: 0 });

/**
 * The play `dt` seconds on. `reached` is the furthest stop the run itself has got to; `count` how many stops it has. A stop not
 * reached yet holds the play where it is (its clock stops at the end of the phase), so it picks up smoothly once the run moves.
 * Returns null once the final stop has been shown.
 */
export function stepPlay(p: HopPlay, dt: number, count: number, reached: number): HopPlay | null {
  if (count <= 0) return null;
  let { index, phase, t } = p;
  t += Math.max(0, dt);
  for (;;) {
    if (phase === 'show') {
      if (index >= count - 1) {
        phase = 'final';
        continue;
      }
      if (t < HOP_TIMING.show) break;
      if (reached <= index) {
        t = HOP_TIMING.show;
        break;
      }
      t -= HOP_TIMING.show;
      phase = 'travel';
    } else if (phase === 'travel') {
      if (t < HOP_TIMING.travel) break;
      t -= HOP_TIMING.travel;
      index++;
      phase = 'show';
    } else {
      // The last stop counts down only once the run has really got there.
      if (reached < count - 1) {
        t = 0;
        break;
      }
      if (t < HOP_TIMING.final) break;
      return null;
    }
  }
  return { index, phase, t };
}

/** How far the icon is along the wire it is crossing, 0-1 (eased in and out); 1 when it is not travelling. */
export function travelU(p: HopPlay): number {
  if (p.phase !== 'travel') return 1;
  const u = Math.min(1, p.t / HOP_TIMING.travel);
  return u * u * (3 - 2 * u);
}

/** The badge shows while the play stands at a stop; the moving icon shows only while it travels. */
export const badgeShown = (p: HopPlay | null): boolean => p !== null && p.phase !== 'travel';
export const iconShown = (p: HopPlay | null): boolean => p !== null && p.phase === 'travel';

export type StopState = 'done' | 'active' | 'next';

/** Each stop's state for the badge: those behind are done, the one stood at is active (on FINAL, every stop is done but the last, which stays active and ticked). */
export function stopStates(p: HopPlay, count: number): StopState[] {
  return Array.from({ length: count }, (_, i) => (i < p.index ? 'done' : i === p.index ? 'active' : 'next'));
}

/** The play as a trace for the wire highlight (transactionPath.livePath): while travelling the wire into the next stop is the live one. */
export const playTrace = (p: HopPlay, route: readonly PlaceId[]): TraceLike => ({ route, at: Math.min(route.length - 1, p.phase === 'travel' ? p.index + 1 : p.index), done: false });
