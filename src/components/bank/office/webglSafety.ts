/**
 * WebGL memory and context safety for the 3D office.
 *
 * Toggling 2D <-> 3D mounts and unmounts a whole Three.js scene. Every geometry, material and texture holds GPU memory that the
 * JavaScript garbage collector never frees by itself, so the view disposes all of it when it unmounts (disposeObject, disposeRenderer).
 * A browser can also take the WebGL context away (a driver reset, too many contexts, a tab in the background on a phone): the canvas
 * then fires `webglcontextlost`, and the app falls back to the 2D blueprint instead of crashing (bindContextEvents).
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
