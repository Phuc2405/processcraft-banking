import type { CSSProperties } from 'react';

/**
 * How one playback tick is spent. A tick is one desk doing one piece of work, so the first part of it
 * is the desk working (the token sits at the desk), then the token travels along the wire, and the
 * last part is a short rest before the next tick.
 *
 *   |-- work --|------- travel -------|-- rest --|
 *   0         35%                     85%       100%
 */
export const WORK_SHARE = 0.35;
export const TRAVEL_SHARE = 0.5;

/** Reads the OS "reduce motion" setting. Tokens then jump to where they are going and nothing loops. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** CSS custom properties the stylesheet's animations use, so they follow the playback speed. */
export function timingVars(tickMs: number): CSSProperties {
  return {
    ['--pc-tick' as string]: `${tickMs}ms`,
    ['--pc-work' as string]: `${Math.round(tickMs * WORK_SHARE)}ms`,
    ['--pc-travel' as string]: `${Math.round(tickMs * TRAVEL_SHARE)}ms`,
    ['--pc-arrive' as string]: `${Math.round(tickMs * (WORK_SHARE + TRAVEL_SHARE))}ms`,
  };
}
