/**
 * The overnight EOD demo's one batch case, and its two routes (Flow 04): the standard close, where the 3-way match is clean and the
 * case settles straight from reconciliation, and the suspense close, where a break is parked in the suspense accounts (TK 1910
 * reconciliation suspense, TK 2912 clearing suspense) and worked back to $0.00 before the day is closed. Pure.
 */

import type { PlaceId } from './topology';

export const EOD_CASE_ROUTE = ['OUT_APPROVED', 'EOD_BATCH', 'EOD_VISA', 'RECON', 'OUT_SETTLED'] as const satisfies readonly PlaceId[];
/** RECON → SUSPENSE is the 'break' wire, SUSPENSE → OUT_SETTLED the 'cleared' one (topology.WIRES). */
export const EOD_SUSPENSE_ROUTE = ['OUT_APPROVED', 'EOD_BATCH', 'EOD_VISA', 'RECON', 'SUSPENSE', 'OUT_SETTLED'] as const satisfies readonly PlaceId[];

export const eodCaseRoute = (suspense: boolean): readonly PlaceId[] => (suspense ? EOD_SUSPENSE_ROUTE : EOD_CASE_ROUTE);
