/**
 * The learner's own payment as a path on the map: which wires it has crossed and which one it is crossing now (the hop player,
 * sim/hopPlayer.ts, says where it is shown to be), and the icon it wears. Both maps read this (BankMap's wires,
 * the 3D lanes and TransactionFlow3D), so only the payment's own path lights up while it runs, never the whole flow.
 * Pure, no React, no Three.js.
 */

import { edgeId, type PlaceId } from './topology';

export interface TraceLike {
  route: readonly PlaceId[];
  at: number;
  done: boolean;
}

/** The wires a live payment lights: those it has crossed (`travelled`) and the one it is crossing into its stop now (`active`). */
export interface LivePath {
  travelled: ReadonlySet<string>;
  active: string | null;
  /** Both spellings of the active wire, for a test against a wire stored either way round. */
  current: ReadonlySet<string>;
  /** travelled ∪ active, for a plain "is this wire on the path" test. */
  all: ReadonlySet<string>;
}

/** Both spellings of a hop's wire: the map stores each wire one way round, a route may cross it either way. */
const hopWires = (a: PlaceId, b: PlaceId): readonly string[] => [edgeId(a, b), edgeId(b, a)];

/** The path of a payment still on its way, or null once it has finished (or before there is one). */
export function livePath(trace: TraceLike | null): LivePath | null {
  if (!trace || trace.done || trace.route.length === 0) return null;
  const at = Math.max(0, Math.min(trace.at, trace.route.length - 1));
  const travelled = new Set<string>();
  for (let i = 1; i < at; i++) for (const id of hopWires(trace.route[i - 1]!, trace.route[i]!)) travelled.add(id);
  const active = at > 0 ? edgeId(trace.route[at - 1]!, trace.route[at]!) : null;
  const current = new Set(at > 0 ? hopWires(trace.route[at - 1]!, trace.route[at]!) : []);
  return { travelled, active, current, all: new Set([...travelled, ...current]) };
}

/** Whether wire `id` is on the payment's path (either way round). */
export const onPath = (path: LivePath | null, id: string): boolean => path !== null && path.all.has(id);

/** The six things a payment can be, each with one icon (Flyweight: the icon belongs to the category, never to a place). */
export const CATEGORY_ICON = { card: '💳', transfer: '💸', cash: '💵', paper: '📜', ecom: '🛒', swift: '🌐', batch: '📦' } as const;
export type FlowCategory = keyof typeof CATEGORY_ICON;

/** What a payment is, from where it entered the bank (Strategy keyed by its first stop). */
export const PLACE_CATEGORY: Readonly<Partial<Record<PlaceId, FlowCategory>>> = {
  GATE_POS: 'card',
  GATE_VIRTUAL: 'card',
  GATE_A2A: 'transfer',
  GATE_QR: 'transfer',
  GATE_ATM: 'cash',
  ATM_CASH: 'cash',
  TELLER_CASH: 'cash',
  MAIN_CASH_VAULT: 'cash',
  GATE_EKYC: 'paper',
  SAVINGS_DESK: 'paper',
  COLLATERAL_VAULT: 'paper',
  DISPUTE_DESK: 'paper',
  GATE_ECOM: 'ecom',
  GATE_SWIFT: 'swift',
  OUT_APPROVED: 'batch',
  EOD_BATCH: 'batch',
};

/** The moving icon a payment wears along its wires: its category's icon, or a plain spark for a route that starts elsewhere. */
export function flowIcon(route: readonly PlaceId[]): string {
  const c = route[0] && PLACE_CATEGORY[route[0]];
  return c ? CATEGORY_ICON[c] : '💠';
}
