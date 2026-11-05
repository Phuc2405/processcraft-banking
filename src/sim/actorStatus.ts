/**
 * One status vocabulary for every person on the map who is on their way to a task, at it, or done with it (Strategy): customers on
 * a desk visit, people served at the walk-up counters and ATMs, walkers in from the sidewalk, drivers walking in from the car park,
 * and the CIT crew at the loading bay. Each kind maps its own phases to the same four words, so the 2D map and the 3D office draw
 * the same badge over every head (the words and colours are shared once, in components/bank/personStatus.ts: Flyweight).
 */

import type { CrewFlow, CrewStage } from './citCrew';

/** On the way in ("Đang đến quầy"), waiting a turn, at the counter, machine or bay ("Đang xử lý…"), done and on the way out ("Hoàn tất ✓"). */
export type ActorStatus = 'arriving' | 'waiting' | 'processing' | 'done';

/** Each kind of actor's phases, as its own engine names them. */
export interface ActorPhases {
  /** A desk visit (deskVisit.ts). */
  visit: 'walk' | 'queue' | 'transact' | 'leave';
  /** Someone served at a walk-up counter or ATM (customerLifecycle.ts). */
  served: 'walking' | 'interacting' | 'turning' | 'departing' | 'gone';
  /** A walker in from the sidewalk, or a passenger out of a parked car. */
  walker: 'in';
  /** A driver between their bay and the branch (parking.ts). */
  driver: 'walkingIn' | 'walkingOut';
  /** The CIT crew at the loading bay (citCrew.ts), by the way the cash moves. */
  cit: `${CrewFlow}:${CrewStage}`;
}
export type ActorKind = keyof ActorPhases;

type Strategy<K extends ActorKind> = Readonly<Record<ActorPhases[K], ActorStatus | null>>;

const STRATEGIES: { readonly [K in ActorKind]: Strategy<K> } = {
  visit: { walk: 'arriving', queue: 'waiting', transact: 'processing', leave: 'done' },
  served: { walking: 'arriving', interacting: 'processing', turning: 'done', departing: 'done', gone: null },
  walker: { in: 'arriving' },
  driver: { walkingIn: 'arriving', walkingOut: 'done' },
  cit: {
    'IN:stepOut': 'arriving',
    'IN:atVan': 'processing',
    'IN:toVault': 'arriving',
    'IN:atVault': 'processing',
    // The cassettes are in: walking back to the van is the way out.
    'IN:toVan': 'done',
    'IN:board': 'done',
    'OUT:stepOut': 'arriving',
    'OUT:atVault': 'processing',
    // Carrying the cassettes to the van is the way to the task (loading it).
    'OUT:toVault': 'arriving',
    'OUT:toVan': 'arriving',
    'OUT:atVan': 'processing',
    'OUT:board': 'done',
  },
};

/** The badge over an actor's head for the phase it is in, or null when it shows none (out of sight). */
export const actorStatus = <K extends ActorKind>(kind: K, phase: ActorPhases[K]): ActorStatus | null => (STRATEGIES[kind] as Strategy<K>)[phase];
