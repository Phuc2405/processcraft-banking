/** Where a tooltip goes: centred over the (?) it explains, above it if there is room and below it otherwise, and always pushed back inside the window by a margin, so it never spills off a small screen. */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const TIP_MARGIN = 8;
export const TIP_GAP = 8;
/** The widest a tooltip gets; on a narrow screen it is the window less the margins. */
export const TIP_MAX_WIDTH = 280;

export const tipWidth = (viewportWidth: number): number => Math.max(120, Math.min(TIP_MAX_WIDTH, viewportWidth - TIP_MARGIN * 2));

export function placeTip(anchor: Box, tip: { width: number; height: number }, viewport: { width: number; height: number }): { left: number; top: number; side: 'above' | 'below' } {
  const centre = anchor.left + anchor.width / 2;
  const maxLeft = Math.max(TIP_MARGIN, viewport.width - tip.width - TIP_MARGIN);
  const left = Math.min(maxLeft, Math.max(TIP_MARGIN, centre - tip.width / 2));
  const above = anchor.top - TIP_GAP - tip.height;
  const below = anchor.top + anchor.height + TIP_GAP;
  const fitsAbove = above >= TIP_MARGIN;
  const fitsBelow = below + tip.height <= viewport.height - TIP_MARGIN;
  const side = fitsAbove || !fitsBelow ? 'above' : 'below';
  const raw = side === 'above' ? above : below;
  const top = Math.min(Math.max(TIP_MARGIN, raw), Math.max(TIP_MARGIN, viewport.height - tip.height - TIP_MARGIN));
  return { left: Math.round(left), top: Math.round(top), side };
}
