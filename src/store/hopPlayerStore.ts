/**
 * The one hop player both maps draw (Observer): the learner's latest run, a payment or a CIT dispatch, played stop by stop
 * (sim/hopPlayer.ts). The driver (components/bank/hopDriver.ts) feeds it the run as it stands and ticks it; the 2D badge and icon
 * and the 3D orb only read it, so the two views can never disagree about where the run is.
 */

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { startPlay, stepPlay, type HopPlay, type HopStop } from '../sim/hopPlayer';
import type { PlaceId } from '../sim/topology';

export interface HopSource {
  /** `tx:<payment id>` or `cit:<run id>`. */
  id: string;
  kind: 'payment' | 'cit';
  stops: readonly HopStop[];
  /** The payment's route, for the wire highlight (empty for a CIT run: its lines are the vault's cash lines). */
  route: readonly PlaceId[];
  /** What rides the wire: 💳 💸 💵 📜 🛒 🌐 📦. */
  icon: string;
  /** The furthest stop the run itself has reached. */
  reached: number;
  /** The run was already over when first seen (a reload, a finished payment): it is not replayed. */
  over: boolean;
  /** Keep the last stop on show (a CIT van still driving off): its countdown waits until this clears. */
  hold?: boolean;
}

export type HopSession = Omit<HopSource, 'reached' | 'over' | 'hold'>;

interface HopPlayerState {
  session: HopSession | null;
  play: HopPlay | null;
  /**
   * Moves the play `dt` seconds on, against the runs as they stand now; a new run replaces the one on show. `frozen` (the learner
   * paused mid-run) holds the play exactly where it is: the badge and the moving icon stop mid-motion and pick up from there.
   */
  tick(dt: number, sources: readonly (HopSource | null)[], frozen?: boolean): void;
  reset(): void;
}

/** Runs already shown (or replaced): a finished run never plays again. Bounded, the oldest go first. */
const seen = new Set<string>();
const markSeen = (id: string): void => {
  seen.add(id);
  if (seen.size > 64) seen.delete(seen.values().next().value as string);
};

export const hopPlayerStore = createStore<HopPlayerState>((set, get) => ({
  session: null,
  play: null,
  tick: (dt, sources, frozen = false) => {
    const { session, play } = get();
    const fresh = sources.find((s): s is HopSource => s !== null && s.id !== session?.id && !seen.has(s.id) && !s.over);
    if (fresh) {
      if (session) markSeen(session.id);
      markSeen(fresh.id);
      const { reached: _r, over: _o, hold: _h, ...next } = fresh;
      set({ session: next, play: startPlay() });
      return;
    }
    if (!session || !play || frozen) return;
    // A run that has gone (settled, replaced, a new day) counts as arrived: the play finishes its last stops on its own.
    const live = sources.find((s) => s?.id === session.id);
    const reached = live ? live.reached : session.stops.length - 1;
    if (live?.hold && play.phase === 'final') return;
    const next = stepPlay(play, dt, session.stops.length, reached);
    if (!next) set({ session: null, play: null });
    else if (next.index !== play.index || next.phase !== play.phase || next.t !== play.t) set({ play: next });
  },
  reset: () => set({ session: null, play: null }),
}));

export const useHopPlayer = <T,>(select: (s: HopPlayerState) => T): T => useStore(hopPlayerStore, select);

/** The stop the play stands at (or is heading for), for a map's "the run is here" glow; null while nothing plays. */
export const hopStopOf = (s: Pick<HopPlayerState, 'session' | 'play'>): HopStop | null => (s.session && s.play ? (s.session.stops[s.play.index] ?? null) : null);
