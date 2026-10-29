/** A small seeded random number generator. */

/** FNV-1a over the text of the parts. Stable across runs and platforms. */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Mulberry32. Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Whole number in [min, max], both included. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Real number in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))]!;
  }

  /** Picks one item with probability proportional to its weight. */
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    const total = items.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.next() * total;
    for (const [item, w] of items) {
      roll -= w;
      if (roll < 0) return item;
    }
    return items[items.length - 1]![0];
  }

  /** Box-Muller. */
  normal(mean: number, sd: number): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** A positive, right-skewed number whose median is `median`. Prices and balances look like this. */
  lognormal(median: number, sigma: number): number {
    return median * Math.exp(sigma * this.normal(0, 1));
  }

  /** Knuth. Fine for the small rates used here (a handful of customers per beat). */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    const limit = Math.exp(-Math.min(lambda, 700));
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > limit && k < 500);
    return k - 1;
  }
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
