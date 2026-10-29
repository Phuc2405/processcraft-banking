import { CanvasTexture, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace } from 'three';

/** The materials of the office. */

/** Lit, faceted, matte: furniture, people, plants. */
export const solid = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.84, metalness: 0.02 });

/** Lit but glossier: glass frames, steel, screens' bezels. */
export const satin = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.45, metalness: 0.25 });

/** Unlit and always bright: screens, lamps, LEDs. They glow because nothing darkens them. */
export const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });

/** Painted lanes: unlit tape lying on the floor, in front of the rugs. */
export const tape = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

/** Panes of glass: very light, see-through, and not written to the depth buffer so people behind them stay visible. */
export const pane = new MeshStandardMaterial({ color: '#bfe7f5', transparent: true, opacity: 0.2, roughness: 0.1, metalness: 0.1, depthWrite: false, side: DoubleSide });

// Soft contact shadows

let blobTex: CanvasTexture | null = null;
let blobMat: MeshBasicMaterial | null = null;

/** A soft dark smudge for under furniture and plants: it grounds them on the floor the way ambient occlusion would, at the price of a single textured quad. */
export function blobMaterial(): MeshBasicMaterial {
  if (blobMat) return blobMat;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d');
  if (c) {
    const g = c.createRadialGradient(64, 64, 6, 64, 64, 62);
    g.addColorStop(0, 'rgba(40,30,20,0.55)');
    g.addColorStop(0.6, 'rgba(40,30,20,0.22)');
    g.addColorStop(1, 'rgba(40,30,20,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  }
  blobTex = new CanvasTexture(canvas);
  blobTex.colorSpace = SRGBColorSpace;
  blobMat = new MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  return blobMat;
}
