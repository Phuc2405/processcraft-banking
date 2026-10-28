import { useFrame, useThree } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, Fog, Group, LineBasicMaterial, MeshBasicMaterial, SRGBColorSpace } from 'three';
import { bankStore } from '../../../store/bankStore';
import { atmosphereAt } from './atmosphere';
import { useMerged } from './Dressing';
import { box, blob, cyl, mix, type Part } from './kit';
import { customerShirt, FLOOR_SLAB, KERB_Z, ROAD_END, STREET } from './layout3d';
import { glow, pane, solid } from './materials';
import { CustomerFigure } from './Avatars';
import { PAVEMENT, PEDESTRIANS, pedestrianAt, weatherStore, useWeather, type Pedestrian, type PedestrianPose } from './weather';

/**
 * The world around the branch in the 3D office: the city it stands in, the sky and the haze, the morning mist, the rain and
 * the people on the pavement. All of it is dressing; nothing here changes the bank. The city is kept low, pale and in the haze
 * so the branch stays the sharp, bright focus of the view.
 */

const HX = FLOOR_SLAB.w / 2;
const HZ = FLOOR_SLAB.d / 2;
const HW = STREET.halfWidth;
/** How far the ground, the road and the pavements carry on past the drawn street, into the haze. */
const REACH = 70;

/** A deterministic 0-1 value, so the city is the same on every load. */
const rnd = (i: number, k: number): number => {
  const x = Math.sin(i * 91.17 + k * 47.31) * 24634.6345;
  return x - Math.floor(x);
};

// ─────────────────────────────────────────────────────────────────────────────
// Ground, road and pavements past the drawn street
// ─────────────────────────────────────────────────────────────────────────────

function groundParts(): Part[] {
  const roadMid = (KERB_Z + STREET.kerbW + ROAD_END) / 2;
  const roadW = ROAD_END - KERB_Z - STREET.kerbW;
  const parts: Part[] = [
    // The land everything stands on, just under the office slab and the street.
    box([0, -0.66, 4], [REACH * 2, 0.04, REACH * 1.6], '#5c6470'),
  ];
  for (const side of [-1, 1]) {
    const x0 = side * HW;
    const len = REACH - HW;
    const cx = x0 + side * (len / 2);
    // The pavement, kerb and road carry on to both sides, square to the facade and level with the drawn street.
    parts.push(
      box([cx, -0.3, STREET.z0 + (STREET.walk - 0.7) / 2], [len, 0.56, STREET.walk + 0.7], '#8d9399'),
      box([cx, -0.012, STREET.z0 + STREET.walk / 2], [len, 0.024, STREET.walk], '#c9c3b8'),
      box([cx, STREET.kerbH / 2, KERB_Z + STREET.kerbW / 2], [len, STREET.kerbH, STREET.kerbW], '#dfe3e8'),
      box([cx, -0.3, roadMid], [len, 0.32, roadW], '#3f4651'),
      box([cx, -0.14, roadMid], [len, 0.012, roadW], '#4b5563'),
    );
    for (let x = x0 + side * 0.9; Math.abs(x) < REACH - 1; x += side * 2.2) parts.push(box([x, -0.132, roadMid], [1.1, 0.006, 0.1], '#f3efe0'));
  }
  // The pavement on the far side of the road, and a strip of road along the side of the block.
  const farZ = ROAD_END + 1.3;
  parts.push(box([0, -0.2, farZ], [REACH * 2, 0.36, 2.6], '#a8a39a'));
  for (const side of [-1, 1]) parts.push(box([side * (HX + 4.6), -0.3, -HZ + (STREET.z0 + HZ) / 2 - 2], [3, 0.32, HZ * 2 + 6], '#3f4651'));
  // The lane behind the block.
  parts.push(box([0, -0.3, -HZ - 3.2], [REACH * 2, 0.32, 3], '#3f4651'));
  return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
// The city: low blocks, trees, lit windows
// ─────────────────────────────────────────────────────────────────────────────

interface Block {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
}

const CITY_TONES = ['#c9d2dd', '#d8d2c6', '#bfc8d4', '#d3c9bb', '#c4ccc2', '#cfc6d6'];

/** Rows of blocks behind the branch, to both sides of it, and across the road, leaving the site and the street clear. */
export const CITY_BLOCKS: readonly Block[] = (() => {
  const out: Block[] = [];
  let n = 0;
  const row = (x0: number, x1: number, z: number, depth: number, maxH: number): void => {
    for (let x = x0; x < x1; ) {
      const w = 3 + rnd(n, 1) * 4;
      out.push({ x: x + w / 2, z, w: w - 0.5, d: depth - rnd(n, 2) * 1.2, h: 2.4 + rnd(n, 3) * maxH, color: CITY_TONES[n % CITY_TONES.length]! });
      x += w;
      n++;
    }
  };
  row(-REACH + 4, REACH - 4, -HZ - 9, 7, 7);
  row(-REACH + 4, REACH - 4, -HZ - 17.5, 7, 10);
  // Beside the branch, past the side streets.
  for (const side of [-1, 1]) {
    for (let z = -HZ - 1; z < STREET.z0 - 1; z += 5.5) {
      const w = 4 + rnd(n, 4) * 3;
      out.push({ x: side * (HX + 6.2 + w / 2), z: z + 2.5, w, d: 4.8, h: 2.2 + rnd(n, 5) * 5, color: CITY_TONES[n % CITY_TONES.length]! });
      n++;
    }
  }
  // Across the road: low shops, so the view over them stays open.
  row(-REACH + 4, REACH - 4, ROAD_END + 5.6, 5, 3.2);
  return out;
})();

function cityParts(): { body: Part[]; windows: Part[] } {
  const body: Part[] = [];
  const windows: Part[] = [];
  for (const [i, b] of CITY_BLOCKS.entries()) {
    body.push(box([b.x, b.h / 2 - 0.62, b.z], [b.w, b.h, b.d], b.color), box([b.x, b.h - 0.58, b.z], [b.w + 0.12, 0.08, b.d + 0.12], mix(b.color, '#ffffff', 0.35)));
    // Windows on the two faces the camera sees (+z and -x), floor by floor.
    for (let y = 0.6; y < b.h - 1; y += 1.2) {
      for (let x = b.x - b.w / 2 + 0.7; x < b.x + b.w / 2 - 0.4; x += 1.1) if (rnd(i * 31 + Math.round(x * 3), y) > 0.25) windows.push(box([x, y, b.z + b.d / 2 + 0.01], [0.55, 0.55, 0.02], '#ffffff'));
      for (let z = b.z - b.d / 2 + 0.7; z < b.z + b.d / 2 - 0.4; z += 1.1) if (rnd(i * 17 + Math.round(z * 3), y + 7) > 0.35) windows.push(box([b.x - b.w / 2 - 0.01, y, z], [0.02, 0.55, 0.55], '#ffffff'));
    }
  }
  return { body, windows };
}

function treeParts(): Part[] {
  const parts: Part[] = [];
  const tree = (x: number, z: number, s: number, i: number): void => {
    parts.push(cyl([x, 0.45 * s, z], 0.07 * s, 0.1 * s, 0.9 * s, '#7c5a3c', 6), blob([x, 1.35 * s, z], 0.62 * s, i % 2 ? '#8fb27d' : '#7fa775', [1, 1.1, 1], 0));
  };
  let i = 0;
  // Along the far pavement and down both sides of the drawn street.
  for (let x = -REACH + 6; x < REACH - 6; x += 5.2) tree(x + rnd(i, 9) * 1.2, ROAD_END + 1.3, 1 + rnd(i, 8) * 0.2, i++);
  for (const side of [-1, 1]) for (let x = HW + 2; x < REACH - 6; x += 6) tree(side * x, KERB_Z - 0.25, 0.95, i++);
  for (const side of [-1, 1]) for (let z = -HZ + 1; z < STREET.z0; z += 4.5) tree(side * (HX + 2.6), z, 0.9 + rnd(i, 7) * 0.2, i++);
  return parts;
}

/** The glass canopy over the pavement along the front, on slim posts: where people shelter when it rains. */
function canopyParts(): { frame: Part[]; glass: Part[] } {
  const x0 = PAVEMENT.shelterX0 - 0.8;
  const x1 = PAVEMENT.shelterX1 + 0.6;
  const z0 = STREET.z0 + 0.05;
  const z1 = STREET.z0 + 1.05;
  const h = 2.55;
  const frame: Part[] = [box([(x0 + x1) / 2, h, z1], [x1 - x0, 0.08, 0.08], '#64748b')];
  for (let x = x0 + 0.3; x <= x1 - 0.3; x += 3.2) frame.push(cyl([x, h / 2, z1 - 0.05], 0.035, 0.035, h, '#64748b', 6));
  return { frame, glass: [box([(x0 + x1) / 2, h + 0.03, (z0 + z1) / 2], [x1 - x0, 0.03, z1 - z0], '#cfe8f5')] };
}

const City = memo(function City() {
  const ground = useMerged(groundParts, []);
  const { body, windows } = useMemo(cityParts, []);
  const blocks = useMerged(() => body, [body]);
  const lit = useMerged(() => windows, [windows]);
  const trees = useMerged(treeParts, []);
  const canopy = useMemo(canopyParts, []);
  const frame = useMerged(() => canopy.frame, [canopy]);
  const glass = useMerged(() => canopy.glass, [canopy]);
  // Windows are dark glass by day and a warm glow after dark, following the atmosphere.
  const windowMaterial = useMemo(() => new MeshBasicMaterial({ color: '#4b5a6e', toneMapped: false }), []);
  useEffect(() => () => windowMaterial.dispose(), [windowMaterial]);
  const day = useMemo(() => new Color('#56677d'), []);
  const night = useMemo(() => new Color('#ffd58a'), []);
  useFrame(() => {
    const a = atmosphereAt(bankStore.getState().view.minute, weatherStore.getState().rain);
    windowMaterial.color.copy(day).lerp(night, a.windows);
  });
  return (
    <group name="office-city">
      <mesh geometry={ground} material={solid} receiveShadow />
      <mesh geometry={blocks} material={solid} />
      <mesh geometry={lit} material={windowMaterial} />
      <mesh geometry={trees} material={solid} />
      <mesh geometry={frame} material={solid} />
      <mesh geometry={glass} material={pane} />
    </group>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Haze, mist and rain
// ─────────────────────────────────────────────────────────────────────────────

/** Distance haze that fades the city into the sky, coloured and pulled in by the time of day and the weather. */
function Haze() {
  const scene = useThree((s) => s.scene);
  const fog = useMemo(() => new Fog('#e6eef6', 62, 104), []);
  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);
  useFrame(() => {
    const a = atmosphereAt(bankStore.getState().view.minute, weatherStore.getState().rain);
    fog.color.set(a.fog.color);
    fog.near = a.fog.near;
    fog.far = a.fog.far;
  });
  return null;
}

/** A soft, patchy white wash drawn once, for the mist banks. */
function useMistTexture(): CanvasTexture {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    if (g) {
      for (let i = 0; i < 28; i++) {
        const x = rnd(i, 1) * 256;
        const y = rnd(i, 2) * 256;
        const r = 40 + rnd(i, 3) * 70;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.55)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 256, 256);
      }
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Morning mist: low banks over the street and the city (never inside the branch), fading out as the morning goes on. */
function Mist() {
  const map = useMistTexture();
  const material = useMemo(() => new MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }), [map]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    const a = atmosphereAt(bankStore.getState().view.minute, weatherStore.getState().rain);
    material.opacity = 0.55 * a.mist;
  });
  const banks: Array<[number, number, number, number]> = [
    [0, 0.5, KERB_Z + 1.2, 1],
    [-HX - 8, 0.8, 0, 1.2],
    [HX + 8, 0.7, -2, 1.1],
    [0, 1.1, -HZ - 8, 1.6],
    [0, 0.9, ROAD_END + 5, 1.4],
  ];
  return (
    <group name="office-mist">
      {banks.map(([x, y, z, s], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={4}>
          <planeGeometry args={[34 * s, 9 * s]} />
        </mesh>
      ))}
    </group>
  );
}

const DROPS = 1400;
const RAIN_BOX = { x: 30, z0: -HZ - 6, z1: ROAD_END + 6, top: 13 } as const;

/** Rain: slanting streaks falling through the whole scene, drawn only while it rains. */
function Rain() {
  const raining = useWeather((s) => s.rain);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const p = new Float32Array(DROPS * 6);
    for (let i = 0; i < DROPS; i++) {
      const x = (rnd(i, 11) * 2 - 1) * RAIN_BOX.x;
      const y = rnd(i, 12) * RAIN_BOX.top;
      const z = RAIN_BOX.z0 + rnd(i, 13) * (RAIN_BOX.z1 - RAIN_BOX.z0);
      p.set([x, y, z, x + 0.06, y - 0.42, z + 0.03], i * 6);
    }
    g.setAttribute('position', new BufferAttribute(p, 3));
    return g;
  }, []);
  const material = useMemo(() => new LineBasicMaterial({ color: '#c3d1e2', transparent: true, opacity: 0.55, depthWrite: false }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame((_, dt) => {
    if (!raining) return;
    const p = geometry.getAttribute('position') as BufferAttribute;
    const a = p.array as Float32Array;
    const fall = Math.min(dt, 0.1) * 16;
    for (let i = 0; i < DROPS; i++) {
      const o = i * 6;
      let y = a[o + 1]! - fall;
      if (y < 0) y += RAIN_BOX.top;
      a[o + 1] = y;
      a[o + 4] = y - 0.42;
    }
    p.needsUpdate = true;
  });
  if (!raining) return null;
  return <lineSegments geometry={geometry} material={material} name="office-rain" frustumCulled={false} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// People on the pavement
// ─────────────────────────────────────────────────────────────────────────────

const umbrellaCanopy = new ConeGeometry(0.62, 0.32, 10, 1, true);
const umbrellaStick = new CylinderGeometry(0.018, 0.018, 0.9, 5);
const UMBRELLA_TONES = ['#1d4ed8', '#e11d48', '#0f766e', '#7c3aed', '#ea580c', '#334155'];

/** One person on the pavement, placed each frame from pedestrianAt (weather.ts). Walking and standing are separate rigs. */
function Passer({ p, clock }: { p: Pedestrian; clock: { t: number; rainFor: number | null } }) {
  const root = useRef<Group>(null);
  const [pose, setPose] = useState<PedestrianPose>(() => pedestrianAt(p, 0, null).pose);
  useFrame(() => {
    const s = pedestrianAt(p, clock.t, clock.rainFor);
    if (root.current) {
      root.current.position.set(s.x, 0, s.z);
      root.current.rotation.y = s.heading;
    }
    if (s.pose !== pose) setPose(s.pose);
  });
  const moving = pose === 'walk' || pose === 'umbrella' || pose === 'run';
  return (
    <group ref={root} name={`pedestrian-${p.index}`}>
      <CustomerFigure index={p.index + 40} shirt={customerShirt(p.index * 5 + 2)} phase={p.index * 1.7} walking={moving} scale={0.7} />
      {pose === 'umbrella' && (
        <group position={[0.12, 0, 0]}>
          <mesh geometry={umbrellaStick} position={[0, 1.15, 0]} material={solid} />
          <mesh geometry={umbrellaCanopy} position={[0, 1.66, 0]}>
            <meshStandardMaterial color={UMBRELLA_TONES[p.index % UMBRELLA_TONES.length]} roughness={0.5} />
          </mesh>
        </group>
      )}
      {pose === 'chat' && (
        // A small speech bubble over the pair who stop to talk.
        <mesh position={[0, 1.18, 0]} material={glow}>
          <sphereGeometry args={[0.07, 8, 6]} />
        </mesh>
      )}
    </group>
  );
}

/** The passers-by: their own clock runs only while the canvas draws, so a resting office never makes them jump. */
function Pedestrians() {
  const raining = useWeather((s) => s.rain);
  const clock = useMemo(() => ({ t: 0, rainFor: null as number | null }), []);
  useEffect(() => {
    clock.rainFor = raining ? 0 : null;
  }, [raining, clock]);
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.1);
    clock.t += step;
    if (clock.rainFor !== null) clock.rainFor += step;
  });
  return (
    <group name="office-pedestrians">
      {PEDESTRIANS.map((p) => (
        <Passer key={p.index} p={p} clock={clock} />
      ))}
    </group>
  );
}

/** Everything around the branch. */
export const Environment3D = memo(function Environment3D() {
  // The time of day reaches the city, the haze and the mist through useFrame, so nothing here re-renders on the clock.
  return (
    <>
      <Haze />
      <City />
      <Mist />
      <Rain />
      <Pedestrians />
    </>
  );
});
