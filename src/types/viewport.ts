/** The viewport: four independent choices about how the Living Bank is shown. */

export type Scope = 'beginner' | 'advanced';
export type Dimension = '2d' | '3d';
export type DataDepth = 'standard' | 'expert';
export type FlowId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const FLOW_IDS: readonly FlowId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
/** The cash-in-transit and vault domain (Flow 09): its runs are CIT dispatches, not payments, so it has no payment preset. */
export const CIT_FLOW = 9 as const;
export type PaymentFlowId = Exclude<FlowId, typeof CIT_FLOW>;
export const isPaymentFlow = (f: FlowId): f is PaymentFlowId => f !== CIT_FLOW;

export interface ViewportSettings {
  scope: Scope;
  dimension: Dimension;
  dataDepth: DataDepth;
  /** The guided flow in focus. Null in the Advanced scope, whichever flow was last picked. */
  activeFlow: FlowId | null;
}

export const isScope = (v: unknown): v is Scope => v === 'beginner' || v === 'advanced';
export const isFlowId = (v: unknown): v is FlowId => typeof v === 'number' && (FLOW_IDS as readonly number[]).includes(v);
