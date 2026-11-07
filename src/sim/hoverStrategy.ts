import type { FlowId } from '../types/viewport';

/**
 * How pointing at a place reacts, on both maps (Strategy). Full process scope (no flow lit): the place and its wires light up.
 * Sub-process scope (a flow lit): the hover only opens the place's summary card, so the scenario's own path stays the one bright
 * thing; no desk, lane or cash wire lights up under the pointer.
 */
export type HoverStrategy = 'highlight' | 'tooltip-only';

export const hoverStrategy = (flow: FlowId | null): HoverStrategy => (flow === null ? 'highlight' : 'tooltip-only');

/** The hovered place as the lighting reads it: itself under 'highlight', null under 'tooltip-only' (the card still reads the raw hover). */
export const litHover = <T>(hover: T | null, flow: FlowId | null): T | null => (hoverStrategy(flow) === 'highlight' ? hover : null);
