import { GUIDED_FLOWS, stepAt, type FlowStep } from './guidedFlows';
import { isStation, type PlaceId } from './topology';
import { CIT_FLOW, type FlowId } from '../types/viewport';

/**
 * The one hover card rule, for every place on both maps (Flows 01-09): a place under the pointer opens exactly ONE card. While a
 * flow is lit and the place plays a step in it, the card's top is the step context (📌 the sub-process, 👉 the step); under it,
 * always, the place's own metrics (what it is, its queue and status, its GL balances where it holds cash).
 */

/** Every place a card can open on: the map's places, and the CIT Loading Bay (a station of Flow 09 with no PlaceId). */
export type CardPlace = PlaceId | 'LOADING_BAY';

/** Which metrics the card's lower half shows: a cash station's balances, a desk's queue and rules, or an outcome / channel's tally. */
export type CardKind = 'cash' | 'desk' | 'external';

export const cardKind = (p: CardPlace): CardKind => (p === 'MAIN_CASH_VAULT' || p === 'LOADING_BAY' ? 'cash' : isStation(p) ? 'desk' : 'external');

/** The step a place plays in the lit flow, for the card's context banner; null (no banner) with no flow, or a place outside the lit scope (`inScope`). */
export function cardStep(flow: FlowId | null, place: CardPlace, inScope = true): { index: number; number: number; total: number; step: FlowStep } | null {
  if (flow === null) return null;
  const steps = GUIDED_FLOWS[flow].steps;
  if (place === 'LOADING_BAY') {
    // The bay has no PlaceId: it is Flow 09's cit_bay step.
    const i = flow === CIT_FLOW ? steps.findIndex((s) => s.node === 'cit_bay') : -1;
    return i < 0 ? null : { index: i, number: i + 1, total: steps.length, step: steps[i]! };
  }
  if (!inScope) return null;
  const found = stepAt(flow, place);
  return found ? { ...found, index: found.number - 1 } : null;
}

/**
 * The place whose card the 3D office shows, from what its hover handlers dispatch: desks, ATMs, kiosks and the vault door report
 * bankStore.hoverPlace; the bay reports its wire node ('BAY'). One value, so never two cards.
 */
export const hoverCardPlace = (hoverPlace: PlaceId | null, wireNode: string | null): CardPlace | null => hoverPlace ?? (wireNode === 'BAY' ? 'LOADING_BAY' : null);
