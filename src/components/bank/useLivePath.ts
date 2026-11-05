import { useMemo } from 'react';
import type { PlaceId } from '../../sim/topology';
import { livePath, type LivePath } from '../../sim/transactionPath';
import { useBankStore } from '../../store/bankStore';

/**
 * The learner's payment's path while it runs (the wires it has crossed and the one it is crossing), for both maps; null when no
 * payment of theirs is on its way or a tour owns the highlight. Keyed on where the payment is, so it changes once a hop, not a beat.
 */
export function useLivePath(): LivePath | null {
  const key = useBankStore((s) => (s.spotlight || !s.presetTrace || s.presetTrace.done ? '' : `${s.presetTrace.at}|${s.presetTrace.route.join('>')}`));
  return useMemo(() => {
    if (!key) return null;
    const [at, route] = key.split('|');
    return livePath({ route: route!.split('>') as PlaceId[], at: Number(at), done: false });
  }, [key]);
}
