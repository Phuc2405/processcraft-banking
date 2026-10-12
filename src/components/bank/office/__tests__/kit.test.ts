import { describe, expect, it } from 'vitest';
import { BufferGeometry, Vector3 } from 'three';
import { ball, blob, box, cyl, merge, mix, ribbon, ribbonGeometry, rope, roundedRect, shade, tint, xform } from '../kit';

const count = (g: BufferGeometry): number => g.getAttribute('position').count;

describe('the geometry kit', () => {
  it('merges coloured parts into one geometry with a colour for every vertex and nothing else to upload', () => {
    const parts = [box([0, 0, 0], [1, 1, 1], '#ff0000'), cyl([2, 0, 0], 0.5, 0.5, 1, '#00ff00', 6), blob([4, 0, 0], 0.5, '#0000ff'), ball([6, 0, 0], 0.5, '#ffffff')];
    const sizes = parts.map((p) => count(p.geometry.index ? p.geometry.toNonIndexed() : p.geometry));
    const g = merge(parts);
    expect(count(g)).toBe(sizes.reduce((a, b) => a + b, 0));
    expect(g.getAttribute('color').count).toBe(count(g));
    expect(g.getAttribute('uv')).toBeUndefined();
    expect(g.getAttribute('normal').count).toBe(count(g));
    g.dispose();
  });

  it('bakes each part colour into its own vertices', () => {
    const g = merge([box([0, 0, 0], [1, 1, 1], '#ff0000'), box([3, 0, 0], [1, 1, 1], '#0000ff')]);
    const c = g.getAttribute('color');
    const half = count(g) / 2;
    expect([c.getX(0), c.getY(0), c.getZ(0)]).toEqual([1, 0, 0]);
    expect([c.getX(half), c.getY(half), c.getZ(half)]).toEqual([0, 0, 1]);
  });

  it('places a box where it was asked to go, with the size it was given', () => {
    const g = merge([box([2, 1, -3], [4, 2, 6], '#888888')]);
    g.computeBoundingBox();
    expect(g.boundingBox?.min.toArray()).toEqual([0, 0, -6]);
    expect(g.boundingBox?.max.toArray()).toEqual([4, 2, 0]);
  });

  it('moves a group of parts as one: turned about the vertical axis, then put down', () => {
    const [moved] = xform([box([1, 0, 0], [1, 1, 1], '#888888')], [10, 0, 5], Math.PI / 2);
    const g = merge(moved ? [moved] : []);
    g.computeBoundingBox();
    const c = g.boundingBox?.getCenter(new Vector3());
    // (1, 0, 0) turned a quarter about y is (0, 0, -1); then shifted by (10, 0, 5).
    expect(c?.x).toBeCloseTo(10, 6);
    expect(c?.z).toBeCloseTo(4, 6);
  });

  it('blends colours: none of the way is the first, all of the way the second, and tint and shade go toward white and black', () => {
    expect(mix('#336699', '#ffffff', 0)).toBe('#336699');
    expect(mix('#336699', '#ffffff', 1)).toBe('#ffffff');
    expect(tint('#336699', 1)).toBe('#ffffff');
    expect(shade('#336699', 1)).toBe('#000000');
    const half = mix('#000000', '#ffffff', 0.5);
    expect(half > '#000000' && half < '#ffffff').toBe(true);
    expect(mix('#336699', '#ffffff', 7)).toBe('#ffffff');
  });

  it('rounds a rectangle: it is as large as asked and its corners are cut', () => {
    const pts = roundedRect(4, 2, 0.5).getPoints(8);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2, 6);
    // No point sits on the sharp corner.
    expect(pts.some((p) => Math.abs(p.x - 2) < 1e-9 && Math.abs(p.y - 1) < 1e-9)).toBe(false);
  });
});

describe('painted lanes', () => {
  it('lays a flat strip of the given width along a path, one quad per segment, facing up', () => {
    const r = ribbon([[0, 0], [2, 0], [2, 3]], 0.2, 0.05);
    expect(r.position).toHaveLength(2 * 4 * 3);
    expect(r.index).toHaveLength(2 * 6);
    for (let i = 0; i < r.position.length; i += 3) expect(r.position[i + 1]).toBeCloseTo(0.05, 6);
    // Every triangle's normal points up (+y), whichever way the segment runs.
    for (let t = 0; t < r.index.length; t += 3) {
      const [a, b, c] = [r.index[t], r.index[t + 1], r.index[t + 2]] as [number, number, number];
      const p = (i: number): [number, number, number] => [r.position[i * 3] as number, r.position[i * 3 + 1] as number, r.position[i * 3 + 2] as number];
      const [pa, pb, pc] = [p(a), p(b), p(c)];
      const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]] as const;
      const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]] as const;
      expect(u[2] * v[0] - u[0] * v[2]).toBeGreaterThan(0);
    }
    // The first segment runs along x, so its edges are 0.2 apart in z.
    expect(Math.abs((r.position[2] as number) - (r.position[5] as number))).toBeCloseTo(0.2, 6);
  });

  it('has no strip for a path with fewer than two points', () => {
    expect(ribbon([], 0.1, 0).index).toHaveLength(0);
    expect(ribbon([[1, 1]], 0.1, 0).index).toHaveLength(0);
  });

  it('puts many lanes in one geometry, each with its own colour and its own indices', () => {
    const g = ribbonGeometry(
      [
        { points: [[0, 0], [1, 0]], color: '#ff0000' },
        { points: [[0, 2], [1, 2], [1, 4]], color: '#0000ff' },
      ],
      0.1,
      0.02,
    );
    expect(count(g)).toBe(3 * 4);
    expect(g.index?.count).toBe(3 * 6);
    const max = Math.max(...Array.from(g.index?.array ?? []));
    expect(max).toBe(count(g) - 1);
    const c = g.getAttribute('color');
    expect([c.getX(0), c.getZ(0)]).toEqual([1, 0]);
    expect([c.getX(count(g) - 1), c.getZ(count(g) - 1)]).toEqual([0, 1]);
  });
});

describe('ropes', () => {
  it('hangs a rope between two posts so that it sags in the middle and meets both ends', () => {
    const part = rope([0, 0.8, 0], [2, 0.8, 0], 0.2, 0.02, '#ff0000');
    const g = part.geometry;
    g.computeBoundingBox();
    expect(g.boundingBox?.max.y).toBeLessThanOrEqual(0.8 + 0.021);
    expect(g.boundingBox?.min.y).toBeLessThan(0.8 - 0.09);
    expect(g.boundingBox?.min.x).toBeLessThanOrEqual(0.001);
    expect(g.boundingBox?.max.x).toBeGreaterThanOrEqual(1.999);
  });
});
