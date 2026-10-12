import { useEffect } from 'react';
import { useWorkflowStore, workflowStore } from '../../store/workflowStore';

/**
 * Drives the playback. The store has no timers on purpose; this hook calls `stepSimulation()` on an
 * interval while `isRunning` is true, and stops itself when the run finishes or is paused.
 * The interval is the store's `playbackMs`, the same number the canvas hands to the animations, so
 * the pace of the clock and the pace of the tokens can never disagree.
 */
export function useSimulationClock(): void {
  const isRunning = useWorkflowStore((s) => s.isRunning);
  const msPerTick = useWorkflowStore((s) => s.playbackMs);
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => workflowStore.getState().stepSimulation(), msPerTick);
    return () => clearInterval(timer);
  }, [isRunning, msPerTick]);
}
