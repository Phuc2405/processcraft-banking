import { useEffect } from 'react';
import { bankStore, useBankStore } from '../../store/bankStore';
import { simulation } from './useSimulation';

/**
 * Drives the bank's clock. The store has no timers on purpose; while the bank is playing this hook asks it
 * for the next beat once the current one has had its time on screen. The wait depends on the phase (the
 * busy working hours are slow enough to watch, the quiet hours fly by) and on the speed the learner chose.
 *
 * One timeout per beat, rather than an interval, so a slow screen never queues up beats it has not shown.
 */
export function useBankClock(): void {
  const playing = useBankStore((s) => s.playing);
  const phase = useBankStore((s) => s.view.phase);
  const minute = useBankStore((s) => s.view.minute);
  const tick = useBankStore((s) => s.view.tick);
  const speedIndex = useBankStore((s) => s.speedIndex);

  useEffect(() => {
    // How long this beat stays on screen is the simulation engine's to say; the page only keeps the time.
    const wait = simulation.nextBeatMs();
    if (wait === null) return;
    const timer = window.setTimeout(() => bankStore.getState().tickBeat(), wait);
    return () => window.clearTimeout(timer);
  }, [playing, phase, minute, tick, speedIndex]);
}
