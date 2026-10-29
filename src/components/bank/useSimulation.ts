import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { t } from '../../i18n/t';
import { useMessages } from '../../utils/i18nHelper';
import { deskBadgeMessages } from './deskBadge.messages';
import { statusLabel } from './ui';
import type { StationId } from '../../sim/topology';
import { bankStore } from '../../store/bankStore';
import { deskStatusLine, type DeskStatus } from '../../engine/simulation/deskStatus';
import { SimulationEngine } from '../../engine/simulation/SimulationEngine';

/** The app's one simulation engine, over the bank store: what both views of the bank read through the hooks below. */
export const simulation = new SimulationEngine(bankStore);

/** A desk's "X waiting · Y working" status, re-rendering the caller only when that desk's status changes. */
export function useDeskStatus(id: StationId): DeskStatus {
  const subscribe = useCallback((onChange: () => void) => simulation.desks.subscribe(id, onChange), [id]);
  const read = useCallback(() => simulation.desks.get(id), [id]);
  return useSyncExternalStore(subscribe, read, read);
}

/** A desk's status as the one line both views show in their tooltips and labels: "X waiting · Y working · status". */
export function useDeskStatusLine(id: StationId): { status: DeskStatus; line: string } {
  const status = useDeskStatus(id);
  const bm = useMessages(deskBadgeMessages);
  const line = useMemo(() => deskStatusLine(status, { waiting: t('waiting'), working: (n) => bm('working', { n }), status: statusLabel }), [status, bm]);
  return { status, line };
}
