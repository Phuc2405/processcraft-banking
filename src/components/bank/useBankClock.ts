import { useEffect } from 'react';
import { beatMs, SPEEDS } from '../../sim/clock';
import { bankStore, useBankStore } from '../../store/bankStore';

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
  const tick = useBankStore((s) => s.view.tick);
  const speedIndex = useBankStore((s) => s.speedIndex);

  useEffect(() => {
    if (!playing) return;
    const factor = SPEEDS[speedIndex]?.factor ?? 1;
    const timer = window.setTimeout(() => bankStore.getState().tickBeat(), beatMs(phase, factor));
    return () => window.clearTimeout(timer);
  }, [playing, phase, tick, speedIndex]);
}
