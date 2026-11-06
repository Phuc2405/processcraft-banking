import { GUIDED_FLOWS, stepAt, type FlowStep, type StepStatus } from './guidedFlows';
import type { HopStop } from './hopPlayer';
import { isStation, type PlaceId } from './topology';
import { CIT_FLOW, type FlowId } from '../types/viewport';

/**
 * The one hover card rule, for every place on both maps (Flows 01-09): a place under the pointer opens exactly ONE card. Its top is
 * the step context (cardContext): with a sub-process lit but no demo running, the place's role in it (📌 its task, 💡 run a
 * scenario), never a static "Step X/Y"; while a scenario demo runs, its own step number on that scenario's route (👉), and nothing
 * on a place off that route. Under it, always, the place's own metrics (what it is, its queue and status, its GL balances).
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

/** The scenario demo on show: its name and its route as the hop player walks it (`index`: the stop it stands at). */
export interface DemoPath {
  name: string;
  stops: readonly HopStop[];
  index: number;
}

/** What the card's banner says: the place's role in the lit sub-process (no demo), or its step on the running scenario's route. */
export type CardContext =
  | { mode: 'role'; step: FlowStep }
  | { mode: 'scenario'; name: string; number: number; total: number; status: StepStatus; step: FlowStep | null };

/** Where `place` stands on a route: the stop the run is at if it is this place, else its first visit; -1 off the route. */
export function stopIndexOf(stops: readonly HopStop[], place: CardPlace, at: number): number {
  const is = (s: HopStop | undefined): boolean => !!s && (place === 'LOADING_BAY' ? s.cit === 'BAY' : s.place === place);
  return is(stops[at]) ? at : stops.findIndex(is);
}

/**
 * The banner of a place's card. A running demo decides alone: its step number counts that scenario's stops only (Step X of its own
 * total), and a place off its route gets no banner. With no demo, a place of the lit scope shows its role, numberless.
 */
export function cardContext(flow: FlowId | null, place: CardPlace, inScope: boolean, demo: DemoPath | null): CardContext | null {
  if (demo) {
    const i = stopIndexOf(demo.stops, place, demo.index);
    if (i < 0) return null;
    const status: StepStatus = i < demo.index ? 'completed' : i === demo.index ? 'in-progress' : 'upcoming';
    return { mode: 'scenario', name: demo.name, number: i + 1, total: demo.stops.length, status, step: cardStep(flow, place)?.step ?? null };
  }
  const own = cardStep(flow, place, inScope);
  return own ? { mode: 'role', step: own.step } : null;
}

/**
 * The place whose card the 3D office shows, from what its hover handlers dispatch: desks, ATMs, kiosks and the vault door report
 * bankStore.hoverPlace; the bay reports its wire node ('BAY'). One value, so never two cards.
 */
export const hoverCardPlace = (hoverPlace: PlaceId | null, wireNode: string | null): CardPlace | null => hoverPlace ?? (wireNode === 'BAY' ? 'LOADING_BAY' : null);
