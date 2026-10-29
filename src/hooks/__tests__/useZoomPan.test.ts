import { describe, expect, it } from 'vitest';
import { EDGE_PAD, needsRightPad, STAGE } from '../../engine/plan/layout';
import { flowScope } from '../../sim/guidedFlows';
import type { FlowId } from '../../types/viewport';
import { boundsOf, freeCentre, smartView } from '../useSmartZoom';
import { CONVERGE, converged, easeInOutCubic } from '../useZoomPan';

const VP = { w: 1100, h: 700 };
const FIT = Math.min(VP.w / STAGE.width, VP.h / STAGE.height);
const rectOf = (f: FlowId) => boundsOf(flowScope(f).places)!;

describe('right-edge padding', () => {
  it('pads Flows 3 and 4, not Flows 1 and 2', () => {
    expect(needsRightPad(rectOf(1))).toBe(false);
    expect(needsRightPad(rectOf(2))).toBe(false);
    expect(smartView(rectOf(1), VP, FIT).padRight).toBeUndefined();
    for (const f of [3, 4] as const) {
      expect(needsRightPad(rectOf(f))).toBe(true);
      expect(smartView(rectOf(f), VP, FIT).padRight).toBe(EDGE_PAD.right);
    }
  });

  it('keeps the padded cluster clear of the right gutter', () => {
    const gutter = 64;
    for (const f of [3, 4] as const) {
      const r = rectOf(f);
      const v = smartView(r, { w: VP.w - gutter, h: VP.h }, FIT);
      const scale = FIT * v.zoom;
      const c = freeCentre({ w: VP.w, h: VP.h }, { top: 0, right: gutter + (v.padRight ?? 0), bottom: 0, left: 0 });
      const rightEdgePx = c.x + (r.x1 - v.cx) * scale;
      expect(rightEdgePx).toBeLessThanOrEqual(VP.w - gutter - EDGE_PAD.right / 2);
    }
  });
});

describe('glide convergence', () => {
  const to = { zoom: 1.8, cx: 1200, cy: 500 };

  it('snaps inside the epsilon and not outside it', () => {
    expect(converged(1.8 + CONVERGE.zoom / 2, 1200.1, 500.1, to, 1)).toBe(true);
    expect(converged(1.81, 1200, 500, to, 1)).toBe(false);
    expect(converged(1.8, 1201, 500, to, 1)).toBe(false);
  });

  it('a 01 -> 03 -> 04 sequence reaches each target monotonically and stops', () => {
    let z = 1;
    let x = STAGE.width / 2;
    for (const f of [1, 3, 4] as const) {
      const t = smartView(rectOf(f), VP, FIT);
      const z0 = z;
      const x0 = x;
      let prevGap = Infinity;
      let frames = 0;
      for (let u = 0; ; u += 1 / 30) {
        const e = easeInOutCubic(Math.min(1, u));
        z = z0 * Math.pow(t.zoom / z0, e);
        x = x0 + (t.cx - x0) * e;
        const gap = Math.abs(x - t.cx);
        expect(gap).toBeLessThanOrEqual(prevGap + 1e-9);
        prevGap = gap;
        frames += 1;
        if (u >= 1 || converged(z, x, t.cy, { ...t, cy: t.cy }, FIT * z)) break;
      }
      expect(frames).toBeLessThanOrEqual(31);
      z = t.zoom;
      x = t.cx;
    }
  });
});
