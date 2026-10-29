import { ATM_STATIONS, atmBooth, KERB_Z } from '../plan/layout3d';

/** Keeping people apart on the pavement. */

/** The strip of pavement where people steer round each other: from just in front of the ATM booths to just short of the kerb. */
export const SIDEWALK = {
  z0: Math.max(...ATM_STATIONS.map((id) => atmBooth(id).front)) + 0.12,
  z1: KERB_Z - 0.18,
  reach: 0.55,
  look: 1.6,
  ease: 4,
  back: 1.2,
  stride: 1.1,
} as const;

interface Agent {
  x: number;
  z: number;
  off: number;
  /** How fast they are moving sideways now (eased, so a sidestep starts and ends gently). */
  v: number;
  /** Which side of each person near them they have chosen to pass on: kept until they are past, so nobody dithers. */
  sides: Map<string, 1 | -1>;
}

/** The people on the pavement, and how far each is stepping aside from their own line. */
export class SidewalkCrowd {
  private agents = new Map<string, Agent>();

  /** Where someone whose own line puts them at (`x`, `z`) walks this frame, `dt` seconds on: curving aside for whoever is close. */
  place(id: string, x: number, z: number, dt: number, still = false): [number, number] {
    if (z < SIDEWALK.z0 - 0.05 || z > SIDEWALK.z1 + 0.05) {
      this.agents.delete(id);
      return [x, z];
    }
    let a = this.agents.get(id);
    if (!a) {
      a = { x, z, off: 0, v: 0, sides: new Map() };
      this.agents.set(id, a);
    }
    if (still) {
      // Locked: exactly where they stopped, however close anyone passes.
      a.v = 0;
      a.sides.clear();
      a.x = x;
      a.z = z + a.off;
      return [a.x, a.z];
    }
    const lo = SIDEWALK.z0 - z;
    const hi = SIDEWALK.z1 - z;
    // The offsets that keep the room to pass everyone close: at least `min` (passing them on the far side), at most `max`.
    let min = -Infinity;
    let max = Infinity;
    for (const [other, o] of this.agents) {
      if (other === id) continue;
      const dx = Math.abs(x - o.x);
      const dz = z + a.off - o.z;
      if (dx >= SIDEWALK.look || Math.abs(dz) >= SIDEWALK.reach * 2) {
        a.sides.delete(other);
        continue;
      }
      // The side to pass them on is chosen once, when they first come near.
      let side = a.sides.get(other);
      if (side === undefined) {
        side = Math.abs(dz) > 1e-3 ? (Math.sign(dz) as 1 | -1) : id < other ? -1 : 1;
        a.sides.set(other, side);
      }
      // The room to keep grows smoothly from nothing as they close in along the pavement to the full reach level with them, so the curve aside starts gently.
      const u = 1 - dx / SIDEWALK.look;
      const edge = o.z - z + side * SIDEWALK.reach * u * u * (3 - 2 * u);
      if (side > 0) min = Math.max(min, edge);
      else max = Math.min(max, edge);
    }
    // Someone at the edge of the strip with no room on their side passes on the other side instead.
    if (min > hi) {
      for (const [k, v] of a.sides) if (v === 1) a.sides.set(k, -1);
      min = -Infinity;
    }
    if (max < lo) {
      for (const [k, v] of a.sides) if (v === -1) a.sides.set(k, 1);
      max = Infinity;
    }
    // Their own line where there is room for it, else the least step aside that makes room.
    const free = min <= max ? Math.max(min, Math.min(max, 0)) : (min + max) / 2;
    const target = Math.min(hi, Math.max(lo, free));
    const rate = Math.abs(target) > Math.abs(a.off) ? SIDEWALK.ease : SIDEWALK.back;
    const want = Math.max(-SIDEWALK.stride, Math.min(SIDEWALK.stride, (target - a.off) * rate));
    a.v += (want - a.v) * Math.min(1, dt * 10);
    a.off += a.v * dt;
    a.off = Math.min(hi, Math.max(lo, a.off));
    a.x = x;
    a.z = z + a.off;
    return [a.x, a.z];
  }

  /** Someone who has left the pavement (or the scene). */
  leave(id: string): void {
    this.agents.delete(id);
    for (const a of this.agents.values()) a.sides.delete(id);
  }

  /** How many people are being steered now. */
  get size(): number {
    return this.agents.size;
  }
}

/** The one crowd every walker on the pavement in the 3D office shares. */
export const sidewalk = new SidewalkCrowd();
