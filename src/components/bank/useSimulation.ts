import { useCallback, useSyncExternalStore } from 'react';
import type { StationId } from '../../sim/topology';
import { bankStore } from '../../store/bankStore';
import type { DeskStatus } from './office/engine/deskStatus';
import { SimulationEngine } from './office/engine/SimulationEngine';

/** The app's one simulation engine, over the bank store: what both views of the bank read through the hooks below. */
export const simulation = new SimulationEngine(bankStore);

/** A desk's "X waiting · Y working" status, re-rendering the caller only when that desk's status changes. */
export function useDeskStatus(id: StationId): DeskStatus {
  const subscribe = useCallback((onChange: () => void) => simulation.desks.subscribe(id, onChange), [id]);
  const read = useCallback(() => simulation.desks.get(id), [id]);
  return useSyncExternalStore(subscribe, read, read);
}
