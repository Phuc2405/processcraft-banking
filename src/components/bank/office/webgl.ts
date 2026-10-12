/** True when this browser can create a WebGL context, which the 3D office needs. Checked once and remembered. */
let cached: boolean | null = null;

export function webglAvailable(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    cached = Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    cached = false;
  }
  return cached;
}
