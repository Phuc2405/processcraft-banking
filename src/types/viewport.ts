/**
 * The viewport: four independent choices about how the Living Bank is shown. Together they make 2 × 2 × 2 = 8 views, and
 * in the Beginner scope one of four guided flows is in focus.
 *
 *   Scope       beginner  one guided flow is lit, everything else fades to 15%
 *               advanced  the whole Living Bank, every desk lit
 *   Dimension   2d        the blueprint map
 *               3d        the isometric office
 *   Data depth  standard  plain-English names and plain cards in the inspector
 *               expert    professional terms, ISO 8583 response codes, the raw message and the GL journal
 *   Active flow 1-8       only while scope is beginner (5-8 are the Phase 8 extended flows)
 */

export type Scope = 'beginner' | 'advanced';
export type Dimension = '2d' | '3d';
export type DataDepth = 'standard' | 'expert';
export type FlowId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const SCOPES: readonly Scope[] = ['beginner', 'advanced'];
export const DIMENSIONS: readonly Dimension[] = ['2d', '3d'];
export const DATA_DEPTHS: readonly DataDepth[] = ['standard', 'expert'];
export const FLOW_IDS: readonly FlowId[] = [1, 2, 3, 4, 5, 6, 7, 8];

export interface ViewportSettings {
  scope: Scope;
  dimension: Dimension;
  dataDepth: DataDepth;
  /** The guided flow in focus. Null in the Advanced scope, whichever flow was last picked. */
  activeFlow: FlowId | null;
}

export const isScope = (v: unknown): v is Scope => v === 'beginner' || v === 'advanced';
export const isFlowId = (v: unknown): v is FlowId => typeof v === 'number' && (FLOW_IDS as readonly number[]).includes(v);
