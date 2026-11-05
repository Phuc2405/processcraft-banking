import { useMemo } from 'react';
import { playTrace } from '../../sim/hopPlayer';
import { livePath, type LivePath } from '../../sim/transactionPath';
import { useBankStore } from '../../store/bankStore';
import { useHopPlayer } from '../../store/hopPlayerStore';

/**
 * The learner's payment's path as the hop player shows it (the wires it has crossed and the one its icon is on), for both maps;
 * null when no payment is on show (a CIT run lights the vault's cash lines instead) or a tour owns the highlight. Keyed on the
 * stop and the phase, so it changes once a hop, not a tick.
 */
export function useLivePath(): LivePath | null {
  const tour = useBankStore((s) => s.spotlight !== null);
  const route = useHopPlayer((s) => (s.session?.kind === 'payment' ? s.session.route : null));
  const at = useHopPlayer((s) => (s.play ? `${s.play.index}|${s.play.phase}` : ''));
  return useMemo(() => {
    if (tour || !route || !at) return null;
    const [index, phase] = at.split('|');
    return livePath(playTrace({ index: Number(index), phase: phase as 'show', t: 0 }, route));
  }, [tour, route, at]);
}
