import { useEffect } from 'react';
import { useWorkflowStore, workflowStore } from '../../store/workflowStore';

/** Drives the playback. */
export function useSimulationClock(): void {
  const isRunning = useWorkflowStore((s) => s.isRunning);
  const msPerTick = useWorkflowStore((s) => s.playbackMs);
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => workflowStore.getState().stepSimulation(), msPerTick);
    return () => clearInterval(timer);
  }, [isRunning, msPerTick]);
}
