import type { V2 } from './layout3d';

/** Polylines on the floor: how long one is, and the point a given distance along it. Pure geometry, for everything that
 * walks, drives or flies a path. */

/** The length of a path. */
export function pathLength(path: readonly V2[]): number {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += Math.hypot((path[i] as V2)[0] - (path[i - 1] as V2)[0], (path[i] as V2)[1] - (path[i - 1] as V2)[1]);
  return n;
}

/** The point `d` along a path (clamped to its ends). */
export function pointAlongPath(path: readonly V2[], d: number): V2 {
  const first = path[0];
  if (!first) return [0, 0];
  let left = Math.max(0, d);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as V2;
    const b = path[i] as V2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= len) {
      const t = len === 0 ? 0 : left / len;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= len;
  }
  return path[path.length - 1] as V2;
}
