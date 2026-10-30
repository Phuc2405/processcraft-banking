/** The viewport: four independent choices about how the Living Bank is shown. */

export type Scope = 'beginner' | 'advanced';
export type Dimension = '2d' | '3d';
export type DataDepth = 'standard' | 'expert';
export type FlowId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

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
