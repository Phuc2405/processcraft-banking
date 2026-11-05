/**
 * Brings the day's walk-ins to the Savings Desk and the Cash & Collateral Vault (sim/deskVisit.ts AMBIENT_VISITS) as the bank's clock runs
 * through opening hours. Only while the bank is really playing: a paused bank, a solo demo run, a guided tour and a clock moved
 * while paused (a skip, a jump, a replay) never bring anyone in, so nothing moves behind the learner's back.
 */

import { WORK_END, WORK_START } from '../sim/clock';
import { ambientVisitsDue } from '../sim/deskVisit';
import { bankStore } from './bankStore';
import { deskVisitStore } from './deskVisitStore';

type BankLike = Pick<typeof bankStore, 'getState' | 'subscribe'>;
type VisitsLike = Pick<typeof deskVisitStore, 'getState'>;

/** Starts following the clock; returns the way to stop. */
export function installAmbientVisits(bank: BankLike = bankStore, visits: VisitsLike = deskVisitStore): () => void {
  let last = bank.getState().view;
  return bank.subscribe((s) => {
    const prev = last;
    last = s.view;
    if (s.view === prev) return;
    const live = s.playing && !s.solo && s.spotlight === null && !s.view.dayOver;
    // A new day (or a replay of today) starts the count again; a step backwards never brings anyone.
    if (!live || s.view.day !== prev.day || s.view.minute <= prev.minute) return;
    for (const step of ambientVisitsDue(prev.minute, s.view.minute, WORK_START, WORK_END)) visits.getState().arrive(step);
  });
}
