import { describe, expect, it } from 'vitest';
import { clampPan, homePan, includePan, PAN, PAN_BLOCK, panBounds, rubberBand } from '../useZoomPan';

const FRAME = { w: 1000, h: 700 };

describe('drag-to-pan bounds', () => {
  it('lets a stage smaller than the frame move half a frame past either edge', () => {
    const b = panBounds(FRAME, { w: 800, h: 600 });
    expect(b).toEqual({ x0: -500, x1: 200 + 500, y0: -350, y1: 100 + 350 });
  });

  it('lets a zoomed stage move from flush edge to flush edge, plus the slack', () => {
    const b = panBounds(FRAME, { w: 2400, h: 1800 });
    expect(b).toEqual({ x0: 1000 - 2400 - 500, x1: 500, y0: 700 - 1800 - 350, y1: 350 });
  });

  it('always keeps part of the stage in view at the bounds', () => {
    for (const stage of [{ w: 800, h: 600 }, { w: 2400, h: 1800 }]) {
      const b = panBounds(FRAME, stage);
      // Corner at the right/bottom bound: the stage's left/top edge is still inside the frame.
      expect(b.x1).toBeLessThan(FRAME.w);
      expect(b.y1).toBeLessThan(FRAME.h);
      // Corner at the left/top bound: the stage's right/bottom edge is still inside the frame.
      expect(b.x0 + stage.w).toBeGreaterThan(0);
      expect(b.y0 + stage.h).toBeGreaterThan(0);
    }
  });

  it('clamps, and grows to include a view a glide left outside', () => {
    const b = panBounds(FRAME, { w: 800, h: 600 });
    expect(clampPan({ x: 5000, y: -5000 }, b)).toEqual({ x: b.x1, y: b.y0 });
    const grown = includePan(b, { x: 900, y: 0 });
    expect(grown.x1).toBe(900);
    expect(clampPan({ x: 900, y: 0 }, grown)).toEqual({ x: 900, y: 0 });
  });
});

describe('rubber band', () => {
  it('follows the pointer inside the bounds and resists past them', () => {
    expect(rubberBand(50, 0, 100)).toBe(50);
    const small = rubberBand(110, 0, 100);
    expect(small).toBeGreaterThan(100);
    expect(small - 100).toBeLessThan(10 * PAN.rubber + 1e-9);
    expect(rubberBand(-10, 0, 100)).toBeCloseTo(-(small - 100));
  });

  it('never stretches past the limit, however far the pointer goes', () => {
    expect(rubberBand(1e6, 0, 100)).toBeLessThan(100 + PAN.stretch);
    expect(rubberBand(1e6, 0, 100)).toBeGreaterThan(100 + PAN.stretch * 0.9);
  });
});

describe('home view', () => {
  it('centres the stage across the frame and between the top dock and the bottom bar', () => {
    expect(homePan(FRAME, { w: 800, h: 500 }, { top: 60, bottom: 40 })).toEqual({ x: 100, y: 60 + 50 });
    expect(homePan(FRAME, { w: 800, h: 680 }, { top: 60, bottom: 40 }).y).toBe(60);
  });
});

describe('node click protection', () => {
  it('blocks presses on cards, buttons, dialogs and the step card', () => {
    for (const sel of ['button', '[role="button"]', '[role="dialog"]', '[role="region"]', '[data-no-pan]']) expect(PAN_BLOCK).toContain(sel);
  });
});
