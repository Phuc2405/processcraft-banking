/** A tiny kit for building low-poly furniture and people. */

import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, IcosahedronGeometry, Matrix4, Path, QuadraticBezierCurve3, Quaternion, Shape, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = readonly [number, number, number];
export type P2 = readonly [number, number];

/** One coloured primitive, already moved to where it belongs. */
export interface Part {
  geometry: BufferGeometry;
  color: string;
}

const m4 = new Matrix4();
const quat = new Quaternion();
const euler = new Euler();
const pos = new Vector3();
const scl = new Vector3();

function place(g: BufferGeometry, at: V3, rot?: V3, scale?: V3): BufferGeometry {
  euler.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0);
  quat.setFromEuler(euler);
  m4.compose(pos.set(at[0], at[1], at[2]), quat, scl.set(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1));
  g.applyMatrix4(m4);
  return g;
}

/** A box of this size centred at `at`. */
export const box = (at: V3, size: V3, color: string, rot?: V3): Part => ({ geometry: place(new BoxGeometry(1, 1, 1), at, rot, size), color });

/** A cylinder (a cone when one radius is 0), standing on the y axis unless rotated. Few segments make it faceted. */
export const cyl = (at: V3, rTop: number, rBottom: number, h: number, color: string, seg = 8, rot?: V3): Part => ({ geometry: place(new CylinderGeometry(rTop, rBottom, h, seg), at, rot), color });

/** A faceted blob: an icosahedron, optionally squashed. Heads, leaves, cushions. */
export const blob = (at: V3, r: number, color: string, scale: V3 = [1, 1, 1], detail = 1, rot?: V3): Part => ({ geometry: place(new IcosahedronGeometry(r, detail), at, rot, scale), color });

/** A smooth-ish ball. */
export const ball = (at: V3, r: number, color: string, scale?: V3): Part => ({ geometry: place(new SphereGeometry(r, 10, 8), at, undefined, scale), color });

/** A ring (a torus) of radius r with a round tube. */
export const ring = (at: V3, r: number, tube: number, color: string, rot?: V3, seg = 14): Part => ({ geometry: place(new TorusGeometry(r, tube, 6, seg), at, rot), color });

/** A cord hanging between two points, sagging in the middle: the rope between two stanchions. */
export function rope(a: V3, b: V3, sag: number, radius: number, color: string, seg = 10): Part {
  const mid = new Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - sag, (a[2] + b[2]) / 2);
  const curve = new QuadraticBezierCurve3(new Vector3(a[0], a[1], a[2]), mid, new Vector3(b[0], b[1], b[2]));
  return { geometry: new TubeGeometry(curve, seg, radius, 5, false), color };
}

/** Draw a rectangle with rounded corners onto a path (or a shape), centred on the origin. */
export function roundedRectPath<T extends Path>(path: T, w: number, h: number, radius: number): T {
  const r = Math.max(0.0001, Math.min(radius, w / 2, h / 2));
  const x = -w / 2;
  const y = -h / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x + w, y + h - r);
  path.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  path.lineTo(x + r, y + h);
  path.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(x, y + r);
  path.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}

export const roundedRect = (w: number, h: number, radius: number): Shape => roundedRectPath(new Shape(), w, h, radius);

/** Move a group of parts as one: turn it about the y axis, scale it, then put it at `at`. The parts are changed in place. */
export function xform(parts: readonly Part[], at: V3, rotY = 0, scale = 1): Part[] {
  const m = new Matrix4().compose(new Vector3(at[0], at[1], at[2]), new Quaternion().setFromEuler(new Euler(0, rotY, 0)), new Vector3(scale, scale, scale));
  return parts.map((p) => ({ color: p.color, geometry: p.geometry.applyMatrix4(m) }));
}

/** Merge parts into one geometry with their colours baked in as vertex colours. */
export function merge(parts: readonly Part[]): BufferGeometry {
  if (parts.length === 0) return new BufferGeometry();
  const prepared = parts.map(({ geometry, color }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    const c = new Color(color);
    const n = g.getAttribute('position').count;
    const rgb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      rgb[i * 3] = c.r;
      rgb[i * 3 + 1] = c.g;
      rgb[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new Float32BufferAttribute(rgb, 3));
    return g;
  });
  const out = mergeGeometries(prepared, false);
  for (const g of prepared) g.dispose();
  return out ?? new BufferGeometry();
}

// Colour

/** A blend of two #rrggbb colours: t = 0 is a, t = 1 is b. */
export function mix(a: string, b: string, t: number): string {
  const c = new Color(a).lerp(new Color(b), Math.max(0, Math.min(1, t)));
  return `#${c.getHexString()}`;
}

/** The colour toward white. */
export const tint = (hex: string, t: number): string => mix(hex, '#ffffff', t);

/** The colour toward black. */
export const shade = (hex: string, t: number): string => mix(hex, '#000000', t);

// Ribbons (painted lanes)

export interface RibbonData {
  /** x, y, z triples. */
  position: Float32Array;
  /** Triangles, as indices into the positions. */
  index: Uint32Array;
}

/** A flat strip along a floor path: the lanes the payments follow. */
export function ribbon(points: readonly P2[], width: number, y: number): RibbonData {
  const segs = Math.max(0, points.length - 1);
  const position = new Float32Array(segs * 4 * 3);
  const index = new Uint32Array(segs * 6);
  let v = 0;
  let t = 0;
  const half = width / 2;
  for (let i = 0; i < segs; i++) {
    const a = points[i] as P2;
    const b = points[i + 1] as P2;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    // Perpendicular on the floor, chosen so that the triangles face up.
    const nx = (dz / len) * half;
    const nz = (-dx / len) * half;
    const base = v / 3;
    position.set([a[0] + nx, y, a[1] + nz, a[0] - nx, y, a[1] - nz, b[0] - nx, y, b[1] - nz, b[0] + nx, y, b[1] + nz], v);
    v += 12;
    index.set([base, base + 1, base + 2, base, base + 2, base + 3], t);
    t += 6;
  }
  return { position, index };
}

/** Many ribbons in one geometry, each in its own colour. */
export function ribbonGeometry(items: ReadonlyArray<{ points: readonly P2[]; color: string }>, width: number, y: number): BufferGeometry {
  const datas = items.map((it) => ({ data: ribbon(it.points, width, y), color: new Color(it.color) }));
  const verts = datas.reduce((s, d) => s + d.data.position.length / 3, 0);
  const idx = datas.reduce((s, d) => s + d.data.index.length, 0);
  const position = new Float32Array(verts * 3);
  const color = new Float32Array(verts * 3);
  const index = new Uint32Array(idx);
  let vo = 0;
  let io = 0;
  for (const { data, color: c } of datas) {
    const n = data.position.length / 3;
    position.set(data.position, vo * 3);
    for (let i = 0; i < n; i++) {
      color[(vo + i) * 3] = c.r;
      color[(vo + i) * 3 + 1] = c.g;
      color[(vo + i) * 3 + 2] = c.b;
    }
    for (let i = 0; i < data.index.length; i++) index[io + i] = (data.index[i] as number) + vo;
    vo += n;
    io += data.index.length;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('color', new Float32BufferAttribute(color, 3));
  g.setIndex(Array.from(index));
  g.computeVertexNormals();
  return g;
}
