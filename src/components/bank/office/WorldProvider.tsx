import { setCitVanStage } from '../hopDriver';
import { useFrame } from '@react-three/fiber';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { SPEEDS } from '../../../sim/clock';
import { bankStore } from '../../../store/bankStore';
import { deskVisitStore } from '../../../store/deskVisitStore';
import { citStore, vanOrphaned } from '../../../store/citStore';
import { bayFlow, citBayRun } from '../../../sim/citEngine';
import { citNow, citSoloActive } from '../../ops/citActions';
import type { WorldEngine } from '../../../engine/simulation/WorldEngine';
import { simulation } from '../useSimulation';
import { deskView, subscribeDemo } from '../DemoSession';
import { liveMix, weatherStore } from '../../../engine/world/weather';

/** The 3D office's bridge to its world engine (engine/WorldEngine.ts). */
const WorldContext = createContext<WorldEngine | null>(null);

/** The world engine of the scene a view is drawn in. */
export function useWorld(): WorldEngine {
  const world = useContext(WorldContext);
  if (!world) throw new Error('useWorld: no WorldProvider above this view');
  return world;
}

/** A number from the world's people that changes when they do (a desk's line's version, say): re-renders only then. */
export function usePeopleVersion(read: (world: WorldEngine) => number): number {
  const world = useWorld();
  const snap = (): number => read(world);
  return useSyncExternalStore(world.subscribe, snap, snap);
}

/** Ticks the engine every frame, first of all (priority -10), with the bank's clock and speed and the weather picked. */
function WorldTicker({ world }: { world: WorldEngine }) {
  useFrame((_, dt) => {
    const s = bankStore.getState();
    // A van whose run has gone (a night run dropped at the day's turn, a cancelled demo) drives off alone and never holds the lock.
    const vanRun = world.citVanRun();
    const orphan = vanOrphaned(vanRun, citStore.getState(), s.view.day);
    const desks = deskView();
    const { mixChanged } = world.tick({
      realDt: dt,
      // A solo demo stops the clock when its one payment is done: the world keeps moving while people are still at a counter,
      // but never once the learner has paused (the visits are frozen then).
      playing: (s.playing || (deskVisitStore.getState().visits.length > 0 && deskVisitStore.getState().frozenAt === null)) && s.spotlight === null,
      speed: SPEEDS[s.speedIndex]?.factor ?? 1,
      minute: s.view.minute,
      weather: weatherStore.getState().weather,
      // The lines in 3D hold only the running demo's case while one runs (DemoSession.deskView), as the 2D map's do.
      queueLength: (id) => desks.stations[id].queueLength,
      citSolo: !s.playing && (orphan || citSoloActive()),
    });
    // The page's copy of the sky's blend (the gradient behind the canvas), a few times a second while it moves.
    if (mixChanged) weatherStore.setState({ mix: { ...liveMix } });
    // The dispatch lock holds while the learner's van is still out in 3D: until it has driven off, not only until its run settles.
    const van = !orphan && (vanRun?.includes('-M') ?? false);
    if (citStore.getState().van !== van) citStore.setState({ van });
  }, -10);
  return null;
}

/** Makes the scene's world engine, ticks it, and hands it to everything drawn inside. */
export function WorldProvider({ children }: { children: ReactNode }) {
  const world = useMemo(() => simulation.createWorld(weatherStore.getState().weather), []);
  // The people of the desks follow the bank as soon as it moves, before anything draws; put away with the scene.
  useEffect(() => {
    let seen: [unknown, unknown] = [null, null];
    const follow = (): void => {
      const view = deskView();
      const manual = citStore.getState().manual;
      world.onBank(view);
      if (seen[0] === view && seen[1] === manual) return;
      seen = [view, manual];
      const run = citBayRun(citNow());
      world.onCitBay(run?.order.id ?? null, run ? bayFlow(run.order) : 'IN');
    };
    follow();
    setCitVanStage((id) => world.citVanStage(id));
    // The bank, the CIT runs and the demo session: a demo starting or ending changes what the desks show.
    const stop = subscribeDemo(follow);
    return () => {
      stop();
      setCitVanStage(null);
      citStore.setState({ van: false });
      world.dispose();
    };
  }, [world]);
  return (
    <WorldContext.Provider value={world}>
      <WorldTicker world={world} />
      {children}
    </WorldContext.Provider>
  );
}
