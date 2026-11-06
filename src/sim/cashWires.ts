/**
 * The vault's cash-wire network, one table for the 2D map and the 3D office: which gold wires touch which station, and which wires a
 * flow, a CIT child or a hovered station lights. Pure: no React, no Three.js.
 *
 *   VAULT ── TELLER   (till top-ups / returns: Flow 06, CIT teller ↔ vault)
 *   VAULT ── ATM      (cassette loads / CDM pickups: Flow 03, CIT ATM)
 *   VAULT ── BAY      (every van run: doorstep, SBV, HQ, ATM)
 *   BAY   ── TELLER   (the CIT hall's own handover to the till counter)
 */

import type { CitDemo, CitDirection } from './citEngine';
import { citChildDirection, citChildLines } from './citRoute';
import type { CashEndpoint, PlaceId } from './topology';
import { CIT_FLOW, type FlowId } from '../types/viewport';

/** A station on the cash network: the vault and its three endpoints. */
export type WireNode = 'VAULT' | CashEndpoint;
/** A gold wire: a vault ↔ endpoint line (named by its endpoint), or the bay ↔ teller handover. */
export type CashWire = CashEndpoint | 'BAY_TELLER';

export const CASH_WIRES = ['TELLER', 'ATM', 'BAY', 'BAY_TELLER'] as const satisfies readonly CashWire[];

export const WIRE_ENDS: Readonly<Record<CashWire, readonly [WireNode, WireNode]>> = {
  TELLER: ['VAULT', 'TELLER'],
  ATM: ['VAULT', 'ATM'],
  BAY: ['VAULT', 'BAY'],
  BAY_TELLER: ['BAY', 'TELLER'],
};

/** Every wire that touches a station: hovering it lights them all (the vault lights its three, the ATM its line to the vault). */
export const wiresAt = (node: WireNode): CashWire[] => CASH_WIRES.filter((w) => WIRE_ENDS[w].includes(node));

const NODE_OF_PLACE: Readonly<Partial<Record<PlaceId, WireNode>>> = { MAIN_CASH_VAULT: 'VAULT', TELLER_CASH: 'TELLER', ATM_CASH: 'ATM' };
/** The cash-network station a map place is, if any (the bay has no PlaceId: it reports 'BAY' itself). */
export const wireNodeOf = (place: PlaceId | null): WireNode | null => (place ? (NODE_OF_PLACE[place] ?? null) : null);

/**
 * The wires a flow moves cash on: 03 (cash deposit at the CDM) the machine's cassettes ↔ the vault, 06 (teller cash) the till ↔ the
 * vault, 09 (CIT) the whole network. Payment-only flows touch no cash wire.
 */
export const FLOW_WIRES: Readonly<Partial<Record<FlowId, readonly CashWire[]>>> = { 3: ['ATM'], 6: ['TELLER'], [CIT_FLOW]: CASH_WIRES };

/** The bay ↔ teller handover belongs to the till run (the CIT hall hands the counter its float). */
const childWires = (child: CitDemo): CashWire[] => [...citChildLines(child), ...(child === 'TELLER' ? (['BAY_TELLER'] as const) : [])];

/**
 * The direction each vault wire of a picked CIT child carries its cash, so the label reads that movement ("Xuất quỹ ➔ Hộc ATM" for an
 * ATM top-up) before and while it runs. The SBV child follows the sheet's case toggle (`sbv`: a deposit leaves the vault, a
 * withdrawal comes in). The bay ↔ teller handover has no vault side: it keeps its two-way label.
 */
export function routeDirs(child: CitDemo | null, sbv: CitDirection = 'OUT'): Readonly<Partial<Record<CashWire, CitDirection>>> {
  if (!child) return {};
  const dir = child === 'SBV' ? sbv : citChildDirection(child);
  return Object.fromEntries(citChildLines(child).map((w) => [w, dir]));
}

/**
 * The lit wires: the active flow's (or the picked CIT child's), plus every wire of the hovered station. Null when nothing narrows the
 * view (no cash flow lit, nothing hovered): every wire then shows at its idle weight.
 */
export function litWires(flow: FlowId | null, child: CitDemo | null, hover: WireNode | null): ReadonlySet<CashWire> | null {
  const route = child ? childWires(child) : flow ? (FLOW_WIRES[flow] ?? []) : [];
  const hovered = hover ? wiresAt(hover) : [];
  return route.length || hovered.length ? new Set([...route, ...hovered]) : null;
}
