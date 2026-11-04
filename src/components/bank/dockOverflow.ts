/**
 * How the bottom dock lays out a sub-process's buttons. There are exactly two layouts, never a mix of the two:
 *  - 'inline':   every button as a pill on one horizontal row, when they all fit (and there are no more than MAX_INLINE);
 *  - 'dropdown': the whole action area becomes a single selector and its Run button.
 * The old hybrid ("a few pills + ⋯ More scenarios (N)") is gone on purpose: half of a sub-process hidden behind a second menu read
 * as two different controls for the same job.
 */

import type { PresetVariant } from '../../sim/presets';

export interface DockItem {
  id: string;
  variant: PresetVariant;
  /** The text the pill shows (icon and label), for the width estimate. */
  text: string;
}

export type DockLayout = 'inline' | 'dropdown';

/** Pixels a pill takes for its text: 12px bold runs about 6.6px a character, plus the padding and the gap. */
export const pillWidth = (text: string): number => Math.round(text.length * 6.6 + 34);
/** Never more pills than this inline, however wide the map: a long row is as hard to read as a stack. */
export const MAX_INLINE = 5;
/** Under this window width the dock is always a dropdown (tablets and phones). */
export const DROPDOWN_BELOW_PX = 1024;

/** The row's total width, pills only. */
export const rowWidth = (items: readonly DockItem[]): number => items.reduce((w, it) => w + pillWidth(it.text), 0);

/** Inline when every pill fits on one row of `budgetPx` on a window at least DROPDOWN_BELOW_PX wide; a dropdown otherwise. */
export function dockLayout(items: readonly DockItem[], budgetPx: number, windowWidth = Infinity): DockLayout {
  if (windowWidth < DROPDOWN_BELOW_PX) return 'dropdown';
  return items.length <= MAX_INLINE && rowWidth(items) <= budgetPx ? 'inline' : 'dropdown';
}
