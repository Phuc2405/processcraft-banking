import { describe, expect, it } from 'vitest';
import { LESSON_LIST } from '../../../../sim/learning';
import { spotPlan, spotScope } from '../../../../sim/spotlightPlan';
import { STATIONS, type PlaceId } from '../../../../sim/topology';
import { fitZoom, ISO_AZIMUTH, ORBIT_RANGE, SCENE, ZOOM_LIMITS } from '../../../../engine/plan/layout3d';
import {
  azimuthReachable,
  frameFocus,
  framedPlaces,
  groundToScreen,
  MAX_POOLS,
  pathLength,
  placeFootprint,
  placeXZ,
  pointAlongPath,
  poolPlaces,
  TOGETHER,
  TOUR_CLOSE,
  TOUR_GLIDE_MS,
  tourPath,
  tourTravelMs,
} from '../tour3d';

const VIEW = { w: 1100, h: 700 };

describe('where the camera goes for a step', () => {
  it('projects the floor the way the isometric camera sees it', () => {
    // At the home azimuth, +x runs to the right and a little up; +z runs to the right and down towards the viewer.
    const [rx, ry] = groundToScreen(ISO_AZIMUTH, 1, 0);
    expect(rx).toBeGreaterThan(0);
    expect(ry).toBeGreaterThan(0);
    const [dx, dy] = groundToScreen(ISO_AZIMUTH, 0, 1);
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeLessThan(0);
    // Moving a point straight along the view direction changes only its height on screen, in the 1 : sqrt(3) iso ratio.
    expect(groundToScreen(0, 0, 3)[1]).toBeCloseTo(-3 / Math.sqrt(3), 6);
    expect(groundToScreen(0, 3, 0)[0]).toBeCloseTo(3, 6);
  });

  it('frames any one desk of any chapter with the whole desk on screen, closer than the home view but never past the ceiling', () => {
    const home = fitZoom(VIEW.w, VIEW.h);
    for (const lesson of LESSON_LIST) {
      for (const place of spotScope(lesson.id).places) {
        const f = frameFocus([place], VIEW);
        expect(f.zoom, `${lesson.id}/${place}`).toBeGreaterThanOrEqual(home);
        expect(f.zoom, `${lesson.id}/${place}`).toBeLessThanOrEqual(Math.min(ZOOM_LIMITS.max, TOUR_CLOSE.ceiling) + 1e-9);
        expect(f.zoom).toBeGreaterThan(home * 1.2);
        expect(azimuthReachable(f.az), `${place}: azimuth`).toBe(true);
        // Every corner of the desk's footprint lands inside the canvas.
        const foot = placeFootprint(place);
        for (const [cx, cz] of [
          [foot.x - foot.w / 2, foot.z - foot.d / 2],
          [foot.x + foot.w / 2, foot.z + foot.d / 2],
          [foot.x - foot.w / 2, foot.z + foot.d / 2],
          [foot.x + foot.w / 2, foot.z - foot.d / 2],
        ] as const) {
          const a = groundToScreen(f.az, cx, cz);
          const c = groundToScreen(f.az, f.x, f.z);
          expect(Math.abs(a[0] - c[0]) * f.zoom, `${place} x`).toBeLessThanOrEqual(VIEW.w / 2);
          expect(Math.abs(a[1] - c[1]) * f.zoom, `${place} y`).toBeLessThanOrEqual(VIEW.h / 2);
        }
      }
    }
  });

  it('frames the whole of a chapter at once for the briefing, and never leaves the office', () => {
    for (const lesson of LESSON_LIST) {
      const f = frameFocus([...spotScope(lesson.id).places], VIEW);
      expect(f.x).toBeGreaterThanOrEqual(SCENE.x0);
      expect(f.x).toBeLessThanOrEqual(SCENE.x1);
      expect(f.z).toBeGreaterThanOrEqual(SCENE.z0);
      expect(f.z).toBeLessThanOrEqual(SCENE.z1);
      expect(f.zoom).toBeGreaterThanOrEqual(fitZoom(VIEW.w, VIEW.h));
    }
  });

  it('zooms out to fit two desks that are both in play', () => {
    const one = frameFocus(['SEC_VAULT'], VIEW);
    const two = frameFocus(['SEC_VAULT', 'SEC_DCVV'], VIEW);
    expect(two.zoom).toBeLessThanOrEqual(one.zoom);
  });

  it('turns towards the side of the office a desk is on: one way for the left, the other for the right', () => {
    const left = frameFocus(['GATE_VIRTUAL'], VIEW);
    const right = frameFocus(['LEDGER_CREDIT'], VIEW);
    expect(Math.sign(left.az - ISO_AZIMUTH)).not.toBe(Math.sign(right.az - ISO_AZIMUTH));
    expect(Math.abs(left.az - ISO_AZIMUTH)).toBeLessThanOrEqual(ORBIT_RANGE);
  });

  it('is repeatable, and gives a sensible answer for nothing at all', () => {
    expect(frameFocus(['RECON'], VIEW)).toEqual(frameFocus(['RECON'], VIEW));
    const none = frameFocus([], VIEW);
    expect(none.az).toBe(ISO_AZIMUTH);
    expect(none.zoom).toBe(fitZoom(VIEW.w, VIEW.h));
  });

  it('frames the desk and the next one only when they are close together', () => {
    expect(framedPlaces('SEC_VAULT', undefined)).toEqual(['SEC_VAULT']);
    expect(framedPlaces('SEC_VAULT', 'SEC_VAULT')).toEqual(['SEC_VAULT']);
    const near = framedPlaces('SEC_VAULT', 'SEC_DCVV');
    expect(near).toEqual(['SEC_VAULT', 'SEC_DCVV']);
    const a = placeXZ('GATE_VIRTUAL');
    const b = placeXZ('OUT_SETTLED');
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(TOGETHER);
    expect(framedPlaces('GATE_VIRTUAL', 'OUT_SETTLED')).toEqual(['GATE_VIRTUAL']);
  });
});

describe('the pools of light', () => {
  it('lights the desk the token is at first, the next one second, then the nearest of the rest, never more than the fixed pool', () => {
    for (const lesson of LESSON_LIST) {
      const scope = spotScope(lesson.id).places;
      const plan = spotPlan(lesson.id, lesson.examples[0]?.id ?? '');
      for (const [i, s] of plan.steps.entries()) {
        const next = plan.steps[i + 1]?.place;
        const pools = poolPlaces(scope, s.place, next);
        expect(pools[0], `${lesson.id} step ${i}`).toBe(s.place);
        if (next && next !== s.place) expect(pools[1]).toBe(next);
        expect(pools.length).toBeLessThanOrEqual(MAX_POOLS);
        expect(new Set(pools).size).toBe(pools.length);
        for (const p of pools.slice(1)) expect(scope.has(p) || p === next).toBe(true);
      }
    }
  });

  it('orders the rest by distance from the token', () => {
    const scope = new Set<PlaceId>(['SEC_VAULT', 'SEC_DCVV', 'LEDGER_DEBIT', 'OUT_APPROVED', 'GATE_VIRTUAL']);
    const pools = poolPlaces(scope, 'SEC_VAULT', undefined);
    const at = placeXZ('SEC_VAULT');
    const d = (p: PlaceId): number => Math.hypot(placeXZ(p)[0] - at[0], placeXZ(p)[1] - at[1]);
    for (let i = 2; i < pools.length; i++) expect(d(pools[i] as PlaceId)).toBeGreaterThanOrEqual(d(pools[i - 1] as PlaceId));
  });
});

describe('the token on the floor', () => {
  it('stays put for a one-desk route, and starts and ends at the centres of the desks it connects', () => {
    expect(tourPath(['RECON'])).toEqual([placeXZ('RECON')]);
    const path = tourPath(['SEC_VAULT', 'SEC_DCVV']);
    expect(path[0]).toEqual(placeXZ('SEC_VAULT'));
    expect(path[path.length - 1]).toEqual(placeXZ('SEC_DCVV'));
    expect(path.length).toBeGreaterThan(2);
  });

  it('gives a path for every step of every example of every chapter, and takes a sensible time over it', () => {
    for (const lesson of LESSON_LIST) {
      for (const ex of lesson.examples) {
        for (const s of spotPlan(lesson.id, ex.id).steps) {
          const path = tourPath(s.route);
          expect(path.length, `${lesson.id}/${ex.id}/${s.step.nodeId}`).toBeGreaterThan(0);
          for (const p of path) {
            expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
          }
          const ms = tourTravelMs(path);
          if (s.route.length > 1) expect(ms).toBeGreaterThanOrEqual(TOUR_GLIDE_MS);
          expect(ms).toBeLessThanOrEqual(3200);
        }
      }
    }
  });

  it('measures and walks a path', () => {
    const path: Array<readonly [number, number]> = [
      [0, 0],
      [3, 0],
      [3, 4],
    ];
    expect(pathLength(path)).toBe(7);
    expect(pointAlongPath(path, 0)).toEqual([0, 0]);
    expect(pointAlongPath(path, 1.5)).toEqual([1.5, 0]);
    expect(pointAlongPath(path, 5)).toEqual([3, 2]);
    expect(pointAlongPath(path, 99)).toEqual([3, 4]);
    expect(pointAlongPath([], 3)).toEqual([0, 0]);
    expect(tourTravelMs([[1, 1]])).toBe(0);
  });

  it('finds a centre for every desk and every tally', () => {
    for (const id of Object.keys(STATIONS)) {
      const [x, z] = placeXZ(id as PlaceId);
      expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true);
    }
  });
});
