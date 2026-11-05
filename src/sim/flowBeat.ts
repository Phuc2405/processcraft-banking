/**
 * Who decides at a station on the learner's route, for the 3D flow highlight (TransactionFlow3D): a rule (STP, a machine) or a
 * person (MANUAL, a staffed desk). Pure, no React.
 */

import { isAutomatedNode } from './nodeKind';
import { isStation, type PlaceId } from './topology';

export type NodeMode = 'STP' | 'MANUAL';

/** A station's mode, or null for a place no one decides at (an outcome, a kiosk). */
export const nodeMode = (p: PlaceId): NodeMode | null => (isStation(p) ? (isAutomatedNode(p) ? 'STP' : 'MANUAL') : null);
