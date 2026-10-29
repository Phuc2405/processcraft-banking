import { ATM_STATIONS, atmBooth, KERB_Z } from './layout3d';

/**
 * Keeping people apart on the pavement. Everyone walking along the front of the branch follows their own line (passers-by
 * in their two lanes, customers on their way to and from the ATMs, people off the buses and taxis), and those lines cross
 * and run into each other. So each of them, every frame, is steered a little: anyone within arm's reach pushes them aside,
 * across the pavement (never along it, so nobody is slowed down or sped up), and they ease back onto their own line once
 * the way is clear. Two people meeting head on step to either side and pass; someone faster coming up behind steps out
 * and goes by. The steering is bounded by the pavement: never into the ATM booths' glass or off the kerb.
 *
 * Driven by the motion clock's step, so it freezes on pause and keeps pace with the speed multiplier.
 */

/** The strip of pavement where people steer round each other: from just in front of the ATM booths to just short of the
 * kerb. `reach` is how close two people may come side by side (a body's width and a little room); `look`, how far ahead
 * along the pavement they start to make room; `ease` and `back`, how fast they step aside and back. */
export const SIDEWALK = {
  z0: Math.max(...ATM_STATIONS.map((id) => atmBooth(id).front)) + 0.12,
  z1: KERB_Z - 0.18,
  reach: 0.55,
  look: 1.6,
  ease: 7,
  back: 1.4,
} as const;

interface Agent {
  x: number;
  z: number;
  off: number;
}

/** The people on the pavement, and how far each is stepping aside from their own line. */
export class SidewalkCrowd {
  private agents = new Map<string, Agent>();

  /**
   * Where someone whose own line puts them at (`x`, `z`) walks this frame, `dt` seconds on: pushed aside by whoever is
   * within reach. Someone off the pavement strip (in a booth, in a shelter, in the lobby) is not steered.
   */
  place(id: string, x: number, z: number, dt: number): [number, number] {
    if (z < SIDEWALK.z0 - 0.05 || z > SIDEWALK.z1 + 0.05) {
      this.agents.delete(id);
      return [x, z];
    }
    let a = this.agents.get(id);
    if (!a) {
      a = { x, z, off: 0 };
      this.agents.set(id, a);
    }
    const here = z + a.off;
    let push = 0;
    for (const [other, o] of this.agents) {
      if (other === id) continue;
      const dx = Math.abs(x - o.x);
      const dz = here - o.z;
      if (dx >= SIDEWALK.look || Math.abs(dz) >= SIDEWALK.reach) continue;
      // Away from them across the pavement, more the closer they come; dead in line, the two pick opposite sides (always
      // the same way round).
      const side = Math.abs(dz) > 1e-3 ? Math.sign(dz) : id < other ? -1 : 1;
      push += side * (SIDEWALK.reach - Math.abs(dz)) * (1 - dx / SIDEWALK.look);
    }
    const lo = SIDEWALK.z0 - z;
    const hi = SIDEWALK.z1 - z;
    // Someone at the edge of the strip who is pushed into it steps the other way instead.
    if ((a.off + push > hi && push > 0) || (a.off + push < lo && push < 0)) push = -push;
    const target = push !== 0 ? a.off + 1.6 * push : 0;
    const rate = push !== 0 ? SIDEWALK.ease : SIDEWALK.back;
    a.off += (target - a.off) * Math.min(1, dt * rate);
    a.off = Math.min(hi, Math.max(lo, a.off));
    a.x = x;
    a.z = z + a.off;
    return [a.x, a.z];
  }

  /** Someone who has left the pavement (or the scene). */
  leave(id: string): void {
    this.agents.delete(id);
  }

  /** How many people are being steered now. */
  get size(): number {
    return this.agents.size;
  }
}

/** The one crowd every walker on the pavement in the 3D office shares. */
export const sidewalk = new SidewalkCrowd();
