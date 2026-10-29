import { describe, expect, it } from 'vitest';
import { PLACE_BOX, STAGE } from '../../engine/plan/layout';
import { clampZoom3d, isCameraResetKey, zoomBounds3d, ZOOM_3D } from '../../engine/plan/layout3d';
import { LESSONS } from '../../sim/learning';
import { flowScope } from '../../sim/guidedFlows';
import { spotPlan, spotScope } from '../../sim/spotlightPlan';
import { ZOOM_2D } from '../../store/zoomStore';
import type { SpotlightState } from '../../store/bankStore';
import { activePlaces, boundsOf, inflateToMin, smartView, SMART_ZOOM } from '../useSmartZoom';

const VP = { w: 1200, h: 700 };
const fitOf = (vp: { w: number; h: number }) => Math.min(vp.w / STAGE.width, vp.h / STAGE.height);

describe('boundsOf', () => {
  it('wraps only the given places', () => {
    const r = boundsOf(['EOD_BATCH', 'RECON']);
    const a = PLACE_BOX.EOD_BATCH;
    const b = PLACE_BOX.RECON;
    expect(r).toEqual({ x0: a.cx - a.w / 2, y0: a.cy - a.h / 2, x1: b.cx + b.w / 2, y1: b.cy + b.h / 2 });
  });

  it('is null for an empty set', () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe('smartView', () => {
  it('fits a cluster tighter than the full map, leaving 15% of the viewport free', () => {
    const fit = fitOf(VP);
    const rect = boundsOf(flowScope(1).places)!;
    const v = smartView(rect, VP, fit);
    const r = inflateToMin(rect);
    const shown = { w: (r.x1 - r.x0) * fit * v.zoom, h: (r.y1 - r.y0) * fit * v.zoom };
    expect(v.zoom).toBeGreaterThanOrEqual(1);
    expect(shown.w).toBeLessThanOrEqual(VP.w * (1 - SMART_ZOOM.padding) + 1e-6);
    expect(shown.h).toBeLessThanOrEqual(VP.h * (1 - SMART_ZOOM.padding) + 1e-6);
    expect(Math.max(shown.w / (VP.w * 0.85), shown.h / (VP.h * 0.85))).toBeCloseTo(1, 6);
    expect(v.cx).toBeCloseTo((rect.x0 + rect.x1) / 2, 6);
    expect(v.cy).toBeCloseTo((rect.y0 + rect.y1) / 2, 6);
  });

  it('never zooms in past the 2D max on a single desk', () => {
    const v = smartView(boundsOf(['RECON'])!, { w: 4000, h: 3000 }, 1);
    expect(v.zoom).toBe(ZOOM_2D.max);
  });

  it('never zooms out below the full-map fit', () => {
    expect(smartView({ x0: 0, y0: 0, x1: STAGE.width, y1: STAGE.height }, VP, fitOf(VP)).zoom).toBe(1);
  });

  it('survives a zero viewport', () => {
    expect(smartView(boundsOf(['RECON'])!, { w: 0, h: 0 }, 0).zoom).toBe(1);
  });
});

describe('activePlaces', () => {
  const tour = (step: number, intro = false) => {
    const process = 'A' as const;
    const exampleId = LESSONS[process].examples[0]!.id;
    const plan = spotPlan(process, exampleId);
    const index = Math.min(step, plan.steps.length - 1);
    return { tour: { process, exampleId, step, intro } as unknown as SpotlightState, plan, index, current: plan.steps[index]!, scope: spotScope(process) };
  };

  it('uses the whole process during a tour intro', () => {
    expect(new Set(activePlaces(tour(0, true), null, null))).toEqual(new Set(spotScope('A').places));
  });

  it('uses the current route plus the next stop during a tour step', () => {
    const f = tour(0);
    const next = f.plan.steps[1]?.place;
    const got = new Set(activePlaces(f, 2, 'RECON'));
    for (const p of f.current.route) expect(got.has(p)).toBe(true);
    if (next) expect(got.has(next)).toBe(true);
    if (!f.current.route.includes('RECON') && next !== 'RECON') expect(got.has('RECON')).toBe(false);
  });

  it('falls back to the guided flow, then the Academy node, then nothing', () => {
    expect(new Set(activePlaces(null, 3, 'RECON'))).toEqual(new Set(flowScope(3).places));
    expect(activePlaces(null, null, 'RECON')).toEqual(['RECON']);
    expect(activePlaces(null, null, null)).toBeNull();
  });
});

describe('3D zoom bounds', () => {
  it('spans 0.2x to 5x the fitted zoom', () => {
    expect(zoomBounds3d(30)).toEqual({ min: 30 * ZOOM_3D.min, max: 30 * ZOOM_3D.max });
    expect(ZOOM_3D).toMatchObject({ min: 0.2, max: 5.0, speed: 1.2 });
    expect(clampZoom3d(1, 30)).toBe(6);
    expect(clampZoom3d(1000, 30)).toBe(150);
    expect(clampZoom3d(40, 30)).toBe(40);
    expect(zoomBounds3d(Number.NaN).min).toBeGreaterThan(0);
  });
});

describe('3D reset hotkey', () => {
  const key = (k: string, extra: Partial<KeyboardEvent> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, repeat: false, ...extra });

  it('fires on R and Esc', () => {
    expect(isCameraResetKey(key('r'), null)).toBe(true);
    expect(isCameraResetKey(key('R'), { tagName: 'DIV' })).toBe(true);
    expect(isCameraResetKey(key('Escape'), null)).toBe(true);
  });

  it('ignores typing, modifiers, repeats and handled events', () => {
    expect(isCameraResetKey(key('r'), { tagName: 'INPUT' })).toBe(false);
    expect(isCameraResetKey(key('r'), { tagName: 'textarea' })).toBe(false);
    expect(isCameraResetKey(key('r'), { isContentEditable: true })).toBe(false);
    expect(isCameraResetKey(key('r', { ctrlKey: true }), null)).toBe(false);
    expect(isCameraResetKey(key('r', { repeat: true }), null)).toBe(false);
    expect(isCameraResetKey(key('Escape', { defaultPrevented: true }), null)).toBe(false);
    expect(isCameraResetKey(key('x'), null)).toBe(false);
  });
});
