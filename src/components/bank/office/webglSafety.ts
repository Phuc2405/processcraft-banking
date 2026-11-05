/**
 * WebGL memory and context safety for the 3D office.
 *
 * Toggling 2D <-> 3D mounts and unmounts a whole Three.js scene. Every geometry, material and texture holds GPU memory that the
 * JavaScript garbage collector never frees by itself, so the view disposes all of it when it unmounts (disposeObject, disposeRenderer).
 * A browser can also take the WebGL context away (a driver reset, too many contexts, a tab in the background on a phone): the canvas
 * then fires `webglcontextlost`: the view waits for `webglcontextrestored` (ContextGuard) and only falls back to the 2D blueprint
 * when the context does not come back. Animated objects that come and go (the cash van, its crew, cash particles) are pooled
 * (ObjectPool) and shared (flyweight geometries and materials), so a run never allocates GPU memory of its own.
 *
 * No React and no live WebGL here, so the tests can drive it with plain objects.
 */

/** What disposeObject needs of a Three.js object: its children and, on a mesh, its geometry and material(s). */
export interface Disposable {
  dispose(): void;
}
interface MaterialLike extends Disposable {
  [key: string]: unknown;
}
export interface SceneNode {
  children?: readonly SceneNode[];
  geometry?: Disposable | null;
  material?: MaterialLike | readonly MaterialLike[] | null;
}

const isTexture = (v: unknown): v is Disposable & { isTexture: true } => typeof v === 'object' && v !== null && (v as { isTexture?: unknown }).isTexture === true && typeof (v as Disposable).dispose === 'function';

/** Disposes one material and every texture it holds (map, normalMap, emissiveMap… and shader uniforms). Returns how many textures. */
export function disposeMaterial(material: MaterialLike, seen: Set<unknown> = new Set()): number {
  if (seen.has(material)) return 0;
  seen.add(material);
  let textures = 0;
  for (const value of Object.values(material)) {
    if (isTexture(value) && !seen.has(value)) {
      seen.add(value);
      value.dispose();
      textures++;
    }
  }
  const uniforms = (material as { uniforms?: Record<string, { value?: unknown }> }).uniforms;
  if (uniforms) {
    for (const u of Object.values(uniforms)) {
      if (isTexture(u?.value) && !seen.has(u.value)) {
        seen.add(u.value);
        u.value.dispose();
        textures++;
      }
    }
  }
  material.dispose();
  return textures;
}

export interface DisposeCount {
  geometries: number;
  materials: number;
  textures: number;
}

/** Walks a scene graph and disposes every geometry, material and texture under it, each exactly once. */
export function disposeObject(root: SceneNode | null | undefined): DisposeCount {
  const count: DisposeCount = { geometries: 0, materials: 0, textures: 0 };
  if (!root) return count;
  const seen = new Set<unknown>();
  const stack: SceneNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.geometry && !seen.has(node.geometry)) {
      seen.add(node.geometry);
      node.geometry.dispose();
      count.geometries++;
    }
    const mats = node.material ? (Array.isArray(node.material) ? node.material : [node.material as MaterialLike]) : [];
    for (const m of mats) {
      if (seen.has(m)) continue;
      count.textures += disposeMaterial(m, seen);
      count.materials++;
    }
    if (node.children) stack.push(...node.children);
  }
  return count;
}

/** What disposeRenderer needs of a WebGLRenderer. */
export interface RendererLike {
  dispose(): void;
  renderLists?: { dispose(): void };
}

/** Frees the renderer's own GPU state (render lists, programs, the context's buffers). */
export function disposeRenderer(gl: RendererLike | null | undefined): void {
  if (!gl) return;
  gl.renderLists?.dispose();
  gl.dispose();
}

/** The canvas the context lives on. */
export interface ContextTarget {
  addEventListener(type: 'webglcontextlost' | 'webglcontextrestored', listener: (e: Event) => void): void;
  removeEventListener(type: 'webglcontextlost' | 'webglcontextrestored', listener: (e: Event) => void): void;
}

/**
 * Listens for the context being lost and restored. A lost context's default is cancelled (so the browser may restore it), and the
 * caller falls back to 2D. Returns the unbind, to run on unmount before the renderer is disposed.
 */
export function bindContextEvents(canvas: ContextTarget, handlers: { onLost: () => void; onRestored?: () => void }): () => void {
  const lost = (e: Event): void => {
    e.preventDefault();
    handlers.onLost();
  };
  const restored = (): void => handlers.onRestored?.();
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return () => {
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
  };
}

// Object Pool: reuse instead of allocate

/**
 * A fixed set of reusable objects (Object Pool). `acquire` hands out a free one, building it only while the pool is under its
 * capacity; `release` returns it for the next caller. Nothing is freed while the pool lives; `drain` disposes all of it once,
 * at unmount. So a van, a crew or a burst of cash particles costs the same GPU memory on its hundredth run as on its first.
 */
export class ObjectPool<T> {
  private readonly free: T[] = [];
  private readonly all: T[] = [];

  constructor(
    private readonly make: () => T,
    readonly capacity: number,
    private readonly destroy?: (item: T) => void,
  ) {}

  /** A free item, or null when all `capacity` of them are out (the caller then skips, never allocates past the cap). */
  acquire(): T | null {
    const hit = this.free.pop();
    if (hit !== undefined) return hit;
    if (this.all.length >= this.capacity) return null;
    const made = this.make();
    this.all.push(made);
    return made;
  }

  /** Gives an item back. An item the pool never made, or one already free, is ignored. */
  release(item: T): void {
    if (!this.all.includes(item) || this.free.includes(item)) return;
    this.free.push(item);
  }

  /** How many items exist, and how many are out now. */
  get size(): number {
    return this.all.length;
  }
  get inUse(): number {
    return this.all.length - this.free.length;
  }

  /** Disposes every item the pool made and empties it. */
  drain(): void {
    if (this.destroy) for (const item of this.all) this.destroy(item);
    this.all.length = 0;
    this.free.length = 0;
  }
}

/**
 * Computes `fn` at most once per frame key (the frame clock's elapsed time): several components that read the same pose in one
 * frame share one computation and one allocation instead of each making their own.
 */
export function frameMemo<T>(fn: () => T): (frame: number) => T {
  let key = Number.NaN;
  let value: T;
  return (frame) => {
    if (frame !== key) {
      key = frame;
      value = fn();
    }
    return value;
  };
}

// Context loss: restore, and fall back to 2D only when it will not come back (State)

export type ContextState = 'live' | 'restoring' | 'lost';

export interface ContextGuardOptions {
  /** How long to wait for `webglcontextrestored` before giving up on 3D, in ms. */
  restoreMs?: number;
  /** More losses than this inside `windowMs` means the GPU keeps dropping it: unrecoverable. */
  maxLosses?: number;
  windowMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * The WebGL context's state machine: live → restoring on a loss; back to live when the browser restores it; to lost (the 2D
 * fallback) only if it does not come back in time, or keeps being lost. `onChange` hears every transition.
 */
export class ContextGuard {
  state: ContextState = 'live';
  private losses: number[] = [];
  private timer: unknown = null;
  private readonly restoreMs: number;
  private readonly maxLosses: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(
    private readonly onChange: (state: ContextState) => void,
    o: ContextGuardOptions = {},
  ) {
    this.restoreMs = o.restoreMs ?? 4000;
    this.maxLosses = o.maxLosses ?? 3;
    this.windowMs = o.windowMs ?? 60_000;
    this.now = o.now ?? (() => Date.now());
    this.setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  private go(next: ContextState): void {
    if (next === this.state) return;
    this.state = next;
    this.onChange(next);
  }

  private stopTimer(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  lost(): void {
    if (this.state === 'lost') return;
    const t = this.now();
    this.losses = [...this.losses.filter((x) => t - x < this.windowMs), t];
    if (this.losses.length > this.maxLosses) {
      this.stopTimer();
      this.go('lost');
      return;
    }
    this.go('restoring');
    this.stopTimer();
    this.timer = this.setTimer(() => {
      this.timer = null;
      if (this.state === 'restoring') this.go('lost');
    }, this.restoreMs);
  }

  restored(): void {
    if (this.state !== 'restoring') return;
    this.stopTimer();
    this.go('live');
  }

  dispose(): void {
    this.stopTimer();
  }
}
