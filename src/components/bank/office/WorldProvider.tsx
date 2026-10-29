import { useFrame } from '@react-three/fiber';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { SPEEDS } from '../../../sim/clock';
import { bankStore } from '../../../store/bankStore';
import type { WorldEngine } from '../../../engine/simulation/WorldEngine';
import { simulation } from '../useSimulation';
import { liveMix, weatherStore } from '../../../engine/world/weather';

/**
 * The 3D office's bridge to its world engine (engine/WorldEngine.ts): one engine per scene, made when the scene mounts,
 * handed to every view that draws part of the world (useWorld), and ticked by one frame callback that runs before anything
 * draws. The views only read the engine; nothing but WorldTicker steps it.
 */
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
    const { mixChanged } = world.tick({
      realDt: dt,
      playing: s.playing && s.spotlight === null,
      speed: SPEEDS[s.speedIndex]?.factor ?? 1,
      minute: s.view.minute,
      weather: weatherStore.getState().weather,
      queueLength: (id) => s.view.stations[id].queueLength,
    });
    // The page's copy of the sky's blend (the gradient behind the canvas), a few times a second while it moves.
    if (mixChanged) weatherStore.setState({ mix: { ...liveMix } });
  }, -10);
  return null;
}

/** Makes the scene's world engine, ticks it, and hands it to everything drawn inside. */
export function WorldProvider({ children }: { children: ReactNode }) {
  const world = useMemo(() => simulation.createWorld(weatherStore.getState().weather), []);
  // The people of the desks follow the bank as soon as it moves, before anything draws; put away with the scene.
  useEffect(() => {
    world.onBank(bankStore.getState().view);
    const stop = bankStore.subscribe((s) => world.onBank(s.view));
    return () => {
      stop();
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
