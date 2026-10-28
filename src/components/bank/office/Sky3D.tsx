import { useFrame, useThree } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, CanvasTexture, Color, IcosahedronGeometry, MeshBasicMaterial, SpriteMaterial, SRGBColorSpace, Vector3, type Group, type Mesh, type Sprite } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bankStore } from '../../../store/bankStore';
import { atmosphereAt, type WeatherMix } from './atmosphere';
import { FLOOR_SLAB, KERB_Z } from './layout3d';
import { liveMix } from './weather';

/**
 * The sky over the diorama: the sun (with a soft glare) or the moon, and a layer of low-poly clouds drifting across. The
 * camera looks down at the city, so there is no horizon to put them on: they are drawn in the band of the view above the
 * branch, the way a painted backdrop hangs behind a stage, and whatever would cover the office fades away. They follow the
 * camera as it pans and zooms, so the sky stays where the sky is.
 */

/** How cloudy the sky is, 0-1, and how dark its clouds are, 0-1. */
export const cloudCover = (w: WeatherMix): number => Math.min(1, 0.15 + 0.85 * w.overcast + 0.4 * w.rain + 0.5 * w.storm + 0.4 * w.snow + 0.5 * w.hail + 0.3 * w.smog);
export const cloudDark = (w: WeatherMix): number => Math.min(1, 0.25 * w.overcast + 0.35 * w.rain + 0.55 * w.storm + 0.3 * w.hail);

/** How many clouds there are at most, and how many show for a cover. */
export const CLOUDS = 14;
export const cloudsFor = (cover: number): number => Math.round(3 + (CLOUDS - 3) * cover);

/** Where the sun is across the view through the day: rising on the left, highest near the middle, setting on the right. */
export function sunPlace(minute: number): { x: number; y: number } {
  const day = Math.max(0, Math.min(1, (minute - 8 * 60) / (11 * 60)));
  return { x: -0.15 + 0.95 * day, y: 0.7 + 0.18 * Math.sin(Math.PI * Math.min(1, day * 1.15)) };
}

const rnd = (i: number, k: number): number => {
  const x = Math.sin(i * 31.7 + k * 91.3) * 43758.5453;
  return x - Math.floor(x);
};

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(255,250,225,0.95)');
    grad.addColorStop(0.32, 'rgba(255,236,170,0.45)');
    grad.addColorStop(1, 'rgba(255,220,140,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** One cloud: a few low-poly puffs in a row, flat-bottomed, in the plane of the view. */
function cloudGeometry(i: number) {
  const n = 4 + Math.floor(rnd(i, 1) * 3);
  const puffs = Array.from({ length: n }, (_, k) => {
    const r = 0.55 + rnd(i * 7 + k, 2) * 0.55 * (k === Math.floor(n / 2) ? 1.4 : 1);
    const g = new IcosahedronGeometry(r, 0);
    g.translate((k - (n - 1) / 2) * 0.75, r * 0.45, 0);
    g.scale(1, 0.75, 0.3);
    return g;
  });
  const merged = mergeGeometries(puffs)!;
  puffs.forEach((g) => g.dispose());
  return merged;
}

const ndc = new Vector3();
const tmp = new Vector3();

export const Sky3D = memo(function Sky3D() {
  const camera = useThree((s) => s.camera);
  const sky = useRef<Group>(null);
  const sun = useRef<Sprite>(null);
  const glare = useRef<Sprite>(null);
  const clouds = useRef<Array<Mesh | null>>([]);
  const glowMap = useMemo(glowTexture, []);
  const sunMaterial = useMemo(() => new SpriteMaterial({ map: glowMap, color: '#fff6d8', transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }), [glowMap]);
  const glareMaterial = useMemo(() => new SpriteMaterial({ map: glowMap, color: '#ffd27a', transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false, blending: AdditiveBlending, opacity: 0.35 }), [glowMap]);
  const geometries = useMemo(() => Array.from({ length: CLOUDS }, (_, i) => cloudGeometry(i)), []);
  const materials = useMemo(() => Array.from({ length: CLOUDS }, () => new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false })), []);
  useEffect(
    () => () => {
      glowMap.dispose();
      sunMaterial.dispose();
      glareMaterial.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
    [glowMap, sunMaterial, glareMaterial, geometries, materials],
  );
  const clock = useRef(0);
  const white = useMemo(() => new Color('#ffffff'), []);
  const storm = useMemo(() => new Color('#5b6472'), []);
  const night = useMemo(() => new Color('#3b4766'), []);

  useFrame((_, dt) => {
    clock.current += Math.min(dt, 0.1);
    const minute = bankStore.getState().view.minute;
    const a = atmosphereAt(minute, liveMix);
    // How high the office reaches up the view: the sky keeps above it.
    let top = -1;
    for (const x of [-FLOOR_SLAB.w / 2, FLOOR_SLAB.w / 2])
      for (const z of [-FLOOR_SLAB.d / 2, KERB_Z]) {
        ndc.set(x, 2.2, z).project(camera);
        top = Math.max(top, ndc.y);
      }
    // World size of one unit of view height, for sizing things the same on screen at any zoom.
    tmp.set(0, 1, 0.5).unproject(camera);
    ndc.set(0, 0, 0.5).unproject(camera);
    const unit = tmp.distanceTo(ndc);
    const place = (o: { position: Vector3 }, x: number, y: number): void => {
      o.position.set(x, y, 0.5).unproject(camera);
    };
    const clear = (y: number, half: number): number => Math.max(0, Math.min(1, (y - half - top) / 0.06));

    // The sun by day (dimmed by cloud), the moon at night.
    const isNight = a.part === 'night';
    const cover = cloudCover(liveMix);
    const sp = isNight ? { x: 0.62, y: 0.86 } : sunPlace(minute);
    const sunHalf = isNight ? 0.05 : 0.08;
    const seen = clear(sp.y, sunHalf) * (1 - 0.85 * Math.max(0, cover - 0.2));
    if (sun.current && glare.current) {
      place(sun.current, sp.x, sp.y);
      place(glare.current, sp.x, sp.y);
      const r = unit * (isNight ? 0.09 : 0.16);
      sun.current.scale.set(r, r, 1);
      glare.current.scale.set(r * 3.4, r * 3.4, 1);
      sunMaterial.color.set(isNight ? '#e8eefc' : a.sun.color).lerp(white, isNight ? 0.2 : 0.45);
      sunMaterial.opacity = seen;
      glareMaterial.opacity = (isNight ? 0.12 : 0.38) * seen;
    }

    // Clouds drift slowly from left to right, more and darker as the weather closes in.
    const shown = cloudsFor(cover);
    const dark = cloudDark(liveMix);
    for (let i = 0; i < CLOUDS; i++) {
      const m = clouds.current[i];
      if (!m) continue;
      if (i >= shown) {
        m.visible = false;
        continue;
      }
      const speed = 0.006 + rnd(i, 3) * 0.01;
      const x = -1.35 + ((((rnd(i, 4) * 2.7 + clock.current * speed) % 2.7) + 2.7) % 2.7);
      const y = 0.72 + rnd(i, 5) * 0.24;
      const size = unit * (0.07 + rnd(i, 6) * 0.06) * (1 + 0.4 * cover);
      place(m, x, y);
      m.quaternion.copy(camera.quaternion);
      m.scale.setScalar(size);
      const mat = materials[i]!;
      mat.color.copy(white).lerp(storm, dark).lerp(night, isNight ? 0.55 : 0);
      mat.opacity = 0.92 * clear(y, 0.06);
      m.visible = mat.opacity > 0.01;
    }
    if (sky.current) sky.current.visible = true;
  });

  return (
    <group ref={sky} name="office-sky">
      <sprite ref={glare} material={glareMaterial} renderOrder={-2} />
      <sprite ref={sun} material={sunMaterial} renderOrder={-1} name="office-sun" />
      {geometries.map((g, i) => (
        <mesh
          key={i}
          ref={(m) => {
            clouds.current[i] = m;
          }}
          geometry={g}
          material={materials[i]}
          renderOrder={0}
          name="office-cloud"
          frustumCulled={false}
        />
      ))}
    </group>
  );
});
