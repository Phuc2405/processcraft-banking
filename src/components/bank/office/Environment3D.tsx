import { useFrame, useThree } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Fog,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointsMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type AmbientLight,
  type Group,
} from 'three';
import { bankStore } from '../../../store/bankStore';
import { atmosphereAt, rainOf, sameMix, stepMix, WEATHER_MIX, windOf } from './atmosphere';
import { useMerged } from './Dressing';
import { box, cyl, mix, type Part } from './kit';
import { customerShirt, FLOOR_SLAB, KERB_Z, ROAD_END, STATION_POSES, STREET } from './layout3d';
import { glow, pane, solid } from './materials';
import { CustomerFigure } from './Avatars';
import { BUS_STOP, liveMix, OVERHANG, PEDESTRIANS, pedestrianAt, weatherStore, type Pedestrian, type PedestrianPose, type Roof } from './weather';

/**
 * The world around the branch in the 3D office: the city it stands in, the sky light and the haze, the morning mist, the
 * weather (eased between picks by WeatherDriver), the wind in the trees, the shelters on the pavement and the people under
 * them. All of it is dressing; nothing here changes the bank. The city is kept low, pale and in the haze so the branch
 * stays the sharp, bright focus of the view.
 */

const HX = FLOOR_SLAB.w / 2;
const HZ = FLOOR_SLAB.d / 2;
const HW = STREET.halfWidth;
/** How far the road and the pavements carry on past the drawn street, into the haze. */
const REACH = 70;
/** The land: big enough that no zoom or pan ever shows the edge of the world. */
const LAND = 600;

/** A deterministic 0-1 value, so the city is the same on every load. */
const rnd = (i: number, k: number): number => {
  const x = Math.sin(i * 91.17 + k * 47.31) * 24634.6345;
  return x - Math.floor(x);
};

// ─────────────────────────────────────────────────────────────────────────────
// The weather blend
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Eases the live weather blend (liveMix) towards the pick, over WEATHER_BLEND_S, and refreshes the store's copy a few times
 * a second for the page (the sky gradient behind the canvas).
 */
function WeatherDriver() {
  const since = useRef(0);
  useFrame((_, dt) => {
    const want = WEATHER_MIX[weatherStore.getState().weather];
    if (sameMix(liveMix, want)) return;
    Object.assign(liveMix, stepMix(liveMix, want, Math.min(dt, 0.1)));
    since.current += dt;
    if (since.current > 0.1 || sameMix(liveMix, want)) {
      since.current = 0;
      weatherStore.setState({ mix: { ...liveMix } });
    }
  });
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ground, road and pavements past the drawn street
// ─────────────────────────────────────────────────────────────────────────────

/** A canvas texture, drawn once and tiled. */
function useTiled(draw: (g: CanvasRenderingContext2D, s: number) => void, repeat: number): CanvasTexture {
  const tex = useMemo(() => {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    if (g) draw(g, S);
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [draw, repeat]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Grass: a soft green with darker tufts. */
const drawGrass = (g: CanvasRenderingContext2D, S: number): void => {
  g.fillStyle = '#8bab73';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${60 + rnd(i, 1) * 40}, ${100 + rnd(i, 2) * 50}, ${50 + rnd(i, 3) * 30}, ${0.25 + rnd(i, 4) * 0.3})`;
    g.fillRect(rnd(i, 5) * S, rnd(i, 6) * S, 1 + rnd(i, 7) * 2, 2 + rnd(i, 8) * 4);
  }
};

/** Cobbles: rounded warm-grey setts in staggered rows. */
const drawCobbles = (g: CanvasRenderingContext2D, S: number): void => {
  g.fillStyle = '#8f877c';
  g.fillRect(0, 0, S, S);
  const n = 8;
  const c = S / n;
  for (let r = 0; r < n; r++) {
    for (let k = 0; k <= n; k++) {
      const x = k * c + (r % 2 ? c / 2 : 0) - c / 2;
      const l = 62 + rnd(r * 13 + k, 1) * 14;
      g.fillStyle = `hsl(${30 + rnd(r * 13 + k, 2) * 10}, 9%, ${l}%)`;
      g.beginPath();
      g.roundRect(x + 2, r * c + 2, c - 4, c - 4, 6);
      g.fill();
    }
  }
};

/** Concrete paving for the far pavement and the side belts. */
const drawSlabs = (g: CanvasRenderingContext2D, S: number): void => {
  g.fillStyle = '#c3bdb2';
  g.fillRect(0, 0, S, S);
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) {
      g.fillStyle = `hsl(36, 6%, ${74 + rnd(r * 4 + k, 3) * 6}%)`;
      g.fillRect(k * 64 + 1, r * 64 + 1, 62, 62);
    }
};

function roadParts(): Part[] {
  const roadMid = (KERB_Z + STREET.kerbW + ROAD_END) / 2;
  const roadW = ROAD_END - KERB_Z - STREET.kerbW;
  const parts: Part[] = [];
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
  // The roads down both sides of the block, and the lane behind it.
  for (const side of [-1, 1]) parts.push(box([side * (HX + 4.6), -0.3, -HZ + (STREET.z0 + HZ) / 2 - 2], [3, 0.32, HZ * 2 + 6], '#3f4651'));
  parts.push(box([0, -0.3, -HZ - 3.2], [REACH * 2, 0.32, 3], '#3f4651'));
  return parts;
}

/** Belts of ground under the tree rows: cobbles along the far pavement, grass down both sides of the block. */
export const TREE_BELTS = {
  far: { x0: -REACH, x1: REACH, z0: ROAD_END + 0.1, z1: ROAD_END + 2.6 },
  sides: [-1, 1].map((side) => ({ x0: side < 0 ? -HX - 3.1 : HX + 2.1, x1: side < 0 ? -HX - 2.1 : HX + 3.1, z0: -HZ, z1: STREET.z0 })),
} as const;

function Ground() {
  const grass = useTiled(drawGrass, LAND / 6);
  const cobbles = useTiled(drawCobbles, 1);
  const slabs = useTiled(drawSlabs, 1);
  const roads = useMerged(roadParts, []);
  const far = TREE_BELTS.far;
  const cobbleTex = useMemo(() => {
    const t = cobbles.clone();
    t.repeat.set((far.x1 - far.x0) / 2, (far.z1 - far.z0) / 2);
    t.needsUpdate = true;
    return t;
  }, [cobbles, far]);
  const slabTex = useMemo(() => {
    const t = slabs.clone();
    t.repeat.set(1, (HZ + STREET.z0) / 2);
    t.needsUpdate = true;
    return t;
  }, [slabs]);
  useEffect(
    () => () => {
      cobbleTex.dispose();
      slabTex.dispose();
    },
    [cobbleTex, slabTex],
  );
  return (
    <group name="office-ground">
      {/* Grass to the horizon, under everything. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.64, 0]} receiveShadow>
        <planeGeometry args={[LAND, LAND]} />
        <meshStandardMaterial map={grass} roughness={1} />
      </mesh>
      <mesh geometry={roads} material={solid} receiveShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(far.x0 + far.x1) / 2, -0.02, (far.z0 + far.z1) / 2]} receiveShadow name="tree-belt-far">
        <planeGeometry args={[far.x1 - far.x0, far.z1 - far.z0]} />
        <meshStandardMaterial map={cobbleTex} roughness={0.95} />
      </mesh>
      {TREE_BELTS.sides.map((b, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[(b.x0 + b.x1) / 2, -0.03, (b.z0 + b.z1) / 2]} receiveShadow name="tree-belt-side">
          <planeGeometry args={[b.x1 - b.x0, b.z1 - b.z0]} />
          <meshStandardMaterial map={slabTex} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The city: low blocks, lit windows
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

const City = memo(function City() {
  const { body, windows } = useMemo(cityParts, []);
  const blocks = useMerged(() => body, [body]);
  const lit = useMerged(() => windows, [windows]);
  // Windows are dark glass by day and a warm glow after dark (or under a storm), following the atmosphere.
  const windowMaterial = useMemo(() => new MeshBasicMaterial({ color: '#4b5a6e', toneMapped: false }), []);
  useEffect(() => () => windowMaterial.dispose(), [windowMaterial]);
  const day = useMemo(() => new Color('#56677d'), []);
  const night = useMemo(() => new Color('#ffd58a'), []);
  useFrame(() => {
    const a = atmosphereAt(bankStore.getState().view.minute, liveMix);
    windowMaterial.color.copy(day).lerp(night, a.windows);
  });
  return (
    <group name="office-city">
      <mesh geometry={blocks} material={solid} />
      <mesh geometry={lit} material={windowMaterial} />
    </group>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Trees that sway in the wind
// ─────────────────────────────────────────────────────────────────────────────

export interface Tree {
  x: number;
  z: number;
  scale: number;
}

/** Along the far pavement, down both sides of the block, and along the kerb past the drawn street. */
export const TREES: readonly Tree[] = (() => {
  const out: Tree[] = [];
  let i = 0;
  for (let x = -REACH + 6; x < REACH - 6; x += 5.2) out.push({ x: x + rnd(i, 9) * 1.2, z: (TREE_BELTS.far.z0 + TREE_BELTS.far.z1) / 2, scale: 1 + rnd(i++, 8) * 0.2 });
  for (const side of [-1, 1]) for (let x = HW + 2; x < REACH - 6; x += 6) out.push({ x: side * x, z: KERB_Z - 0.25, scale: 0.95 });
  for (const b of TREE_BELTS.sides) for (let z = -HZ + 1; z < STREET.z0; z += 4.5) out.push({ x: (b.x0 + b.x1) / 2, z, scale: 0.9 + rnd(i++, 7) * 0.2 });
  return out;
})();

/** How far a crown leans at time `t` (seconds) in wind `wind`: a gentle breeze nods it, a storm bends it over and back. */
export const swayAt = (tree: number, t: number, wind: number): number => wind * 0.06 * (Math.sin(t * (1.1 + wind * 0.9) + tree * 1.7) * 0.75 + Math.sin(t * 2.9 + tree) * 0.25) + wind * wind * 0.025;

/** Trunks stand still; the crowns are instances, each tipped by the wind every frame about the top of its trunk. */
function Trees() {
  const trunks = useMerged(() => TREES.map((t) => cyl([t.x, 0.45 * t.scale, t.z], 0.07 * t.scale, 0.1 * t.scale, 0.9 * t.scale, '#7c5a3c', 6)), []);
  const crown = useMemo(() => new IcosahedronGeometry(0.62, 0).translate(0, 0.45, 0), []);
  const leaves = useMemo(() => new MeshStandardMaterial({ color: '#86ad79', flatShading: true, roughness: 0.9 }), []);
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const clock = useRef(0);
  useEffect(
    () => () => {
      crown.dispose();
      leaves.dispose();
    },
    [crown, leaves],
  );
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    clock.current += Math.min(dt, 0.1);
    const wind = windOf(liveMix);
    TREES.forEach((t, i) => {
      dummy.position.set(t.x, 0.9 * t.scale, t.z);
      dummy.scale.set(t.scale, t.scale * 1.1, t.scale);
      // The wind blows along the street (+x), so the crowns lean that way and rock about it.
      dummy.rotation.set(0, 0, -swayAt(i, clock.current, wind));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <group name="office-trees">
      <mesh geometry={trunks} material={solid} />
      <instancedMesh ref={mesh} args={[crown, leaves, TREES.length]} frustumCulled={false} />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shelters: the entrance overhang and the bus stop
// ─────────────────────────────────────────────────────────────────────────────

/** A glass roof on posts, with a fascia along its front: shared by the entrance overhang and the bus stop. */
function roofParts(r: Roof, posts: number): { frame: Part[]; glass: Part[] } {
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const frame: Part[] = [
    box([cx, r.h + 0.05, r.z1], [r.x1 - r.x0, 0.14, 0.08], '#475569'),
    box([cx, r.h + 0.05, r.z0], [r.x1 - r.x0, 0.1, 0.06], '#475569'),
    box([r.x0, r.h + 0.05, cz], [0.06, 0.1, r.z1 - r.z0], '#475569'),
    box([r.x1, r.h + 0.05, cz], [0.06, 0.1, r.z1 - r.z0], '#475569'),
  ];
  for (let k = 0; k < posts; k++) {
    const x = r.x0 + 0.1 + ((r.x1 - r.x0 - 0.2) * k) / Math.max(1, posts - 1);
    frame.push(cyl([x, r.h / 2, r.z1 - 0.06], 0.04, 0.04, r.h, '#64748b', 6));
  }
  return { frame, glass: [box([cx, r.h + 0.08, cz], [r.x1 - r.x0, 0.03, r.z1 - r.z0], '#cfe8f5')] };
}

function shelterParts(): { frame: Part[]; glass: Part[]; sign: Part[] } {
  const overhang = roofParts(OVERHANG, 9);
  const bus = roofParts(BUS_STOP, 2);
  const b = BUS_STOP;
  const cx = (b.x0 + b.x1) / 2;
  const frame = [
    ...overhang.frame,
    ...bus.frame,
    // The bus stop's back posts, a bench along the back, and the timetable post.
    cyl([b.x0 + 0.1, b.h / 2, b.z0 + 0.06], 0.04, 0.04, b.h, '#64748b', 6),
    cyl([b.x1 - 0.1, b.h / 2, b.z0 + 0.06], 0.04, 0.04, b.h, '#64748b', 6),
    box([cx, 0.42, b.z0 + 0.3], [b.x1 - b.x0 - 0.6, 0.06, 0.34], '#8b5e3c'),
    box([cx - 1.1, 0.2, b.z0 + 0.3], [0.06, 0.4, 0.3], '#475569'),
    box([cx + 1.1, 0.2, b.z0 + 0.3], [0.06, 0.4, 0.3], '#475569'),
  ];
  // Glass panels at the back and the downwind end of the bus stop.
  const glass = [...overhang.glass, ...bus.glass, box([cx, b.h / 2 + 0.15, b.z0 + 0.04], [b.x1 - b.x0 - 0.2, b.h - 0.6, 0.03], '#cfe8f5'), box([b.x1 - 0.04, b.h / 2 + 0.15, (b.z0 + b.z1) / 2 - 0.2], [0.03, b.h - 0.6, b.z1 - b.z0 - 0.5], '#cfe8f5')];
  // Lit strips: "BUS · TAXI" on the bus stop's fascia, and the overhang's underside light.
  const sign = [box([cx, b.h + 0.05, b.z1 + 0.045], [1.6, 0.1, 0.01], '#fde047'), box([(OVERHANG.x0 + OVERHANG.x1) / 2, OVERHANG.h + 0.01, OVERHANG.z1 - 0.1], [OVERHANG.x1 - OVERHANG.x0 - 0.6, 0.02, 0.06], '#fff7d6')];
  return { frame, glass, sign };
}

const Shelters = memo(function Shelters() {
  const parts = useMemo(shelterParts, []);
  const frame = useMerged(() => parts.frame, [parts]);
  const glass = useMerged(() => parts.glass, [parts]);
  const sign = useMerged(() => parts.sign, [parts]);
  return (
    <group name="office-shelters">
      <mesh geometry={frame} material={solid} castShadow />
      <mesh geometry={glass} material={pane} />
      <mesh geometry={sign} material={glow} />
    </group>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Haze, mist, motes, rain and lightning
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
    const a = atmosphereAt(bankStore.getState().view.minute, liveMix);
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
    const a = atmosphereAt(bankStore.getState().view.minute, liveMix);
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

const MOTES = 220;

/** Dust and pollen drifting in the sunlight over the office and the street, on sunny days only. */
function Motes() {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const p = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i++) p.set([(rnd(i, 21) * 2 - 1) * HX, 0.4 + rnd(i, 22) * 2.6, -HZ + rnd(i, 23) * (KERB_Z + HZ)], i * 3);
    g.setAttribute('position', new BufferAttribute(p, 3));
    return g;
  }, []);
  const material = useMemo(() => new PointsMaterial({ color: '#fff3c4', size: 3, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }), []);
  const base = useMemo(() => Float32Array.from(geometry.getAttribute('position').array), [geometry]);
  const clock = useRef(0);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame((_, dt) => {
    const a = atmosphereAt(bankStore.getState().view.minute, liveMix);
    material.opacity = 0.75 * a.motes;
    if (a.motes <= 0) return;
    clock.current += Math.min(dt, 0.1);
    const t = clock.current;
    const p = geometry.getAttribute('position') as BufferAttribute;
    const arr = p.array as Float32Array;
    for (let i = 0; i < MOTES; i++) {
      arr[i * 3] = base[i * 3]! + Math.sin(t * 0.3 + i) * 0.35;
      arr[i * 3 + 1] = base[i * 3 + 1]! + Math.sin(t * 0.5 + i * 1.3) * 0.18;
      arr[i * 3 + 2] = base[i * 3 + 2]! + Math.cos(t * 0.25 + i * 0.7) * 0.3;
    }
    p.needsUpdate = true;
  });
  return <points geometry={geometry} material={material} name="office-motes" frustumCulled={false} />;
}

const DROPS = 1800;
const RAIN_BOX = { x: 30, z0: -HZ - 6, z1: ROAD_END + 6, top: 13 } as const;

/**
 * Rain: slanting streaks falling through the whole scene. How many are drawn follows the blend, so a shower starts as a few
 * drops and thickens to a downpour over the blend's two seconds; the wind slants and lengthens them in a storm.
 */
function Rain() {
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
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const material = useMemo(() => new LineBasicMaterial({ color: '#c3d1e2', transparent: true, opacity: 0.55, depthWrite: false }), []);
  const lines = useRef<Group>(null);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame((_, dt) => {
    const amount = rainOf(liveMix);
    const count = Math.round(DROPS * amount);
    geometry.setDrawRange(0, count * 2);
    if (lines.current) lines.current.visible = count > 0;
    if (count === 0) return;
    const wind = windOf(liveMix);
    const fall = Math.min(dt, 0.1) * (16 + 6 * liveMix.storm);
    const slant = 0.06 + 0.22 * liveMix.storm + 0.04 * wind;
    const len = 0.42 + 0.3 * liveMix.storm;
    const p = geometry.getAttribute('position') as BufferAttribute;
    const a = p.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const o = i * 6;
      let y = a[o + 1]! - fall;
      let x = a[o]! + fall * slant;
      if (y < 0) {
        y += RAIN_BOX.top;
        x = (rnd(i, 11) * 2 - 1) * RAIN_BOX.x;
      }
      a[o] = x;
      a[o + 1] = y;
      a[o + 3] = x - slant * len * 2;
      a[o + 4] = y - len;
    }
    p.needsUpdate = true;
    material.opacity = 0.35 + 0.3 * amount;
  });
  return (
    <group ref={lines} visible={false}>
      <lineSegments geometry={geometry} material={material} name="office-rain" frustumCulled={false} />
    </group>
  );
}

/** The DOM layer the sky gradient lives in (Office3D), so a lightning flash can brighten it from inside the canvas. */
export const skyFlash: { el: HTMLElement | null } = { el: null };

/** When the next flash comes in a storm: every 3-8 seconds, with a double flicker. */
export const nextFlashIn = (k: number): number => 3 + rnd(k, 31) * 5;

/** Lightning in a storm: the whole scene and the sky flick bright for a moment, now and then. */
function Lightning() {
  const light = useRef<AmbientLight>(null);
  const state = useRef({ wait: 4, flash: 0, n: 0 });
  useFrame((_, dt) => {
    const s = state.current;
    const storm = liveMix.storm;
    s.flash = Math.max(0, s.flash - dt * 5);
    if (storm > 0.6) {
      s.wait -= dt;
      if (s.wait <= 0) {
        s.flash = 1;
        s.n++;
        s.wait = nextFlashIn(s.n);
      }
      // A second, weaker flicker right after the first.
      if (s.flash < 0.55 && s.flash > 0.45) s.flash = 0.8;
    }
    if (light.current) light.current.intensity = 3.2 * s.flash * storm;
    if (skyFlash.el) skyFlash.el.style.opacity = String(0.7 * s.flash * storm);
  });
  return <ambientLight ref={light} intensity={0} color="#dfe8ff" />;
}

/** After dark (or under a storm) a warm pool of light on the floor by every desk: the lights the staff work under. */
function DeskLights() {
  const map = useMistTexture();
  const material = useMemo(() => new MeshBasicMaterial({ map, color: '#ffdca0', transparent: true, depthWrite: false, opacity: 0, toneMapped: false, blending: AdditiveBlending }), [map]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    material.opacity = 0.55 * atmosphereAt(bankStore.getState().view.minute, liveMix).lamps;
  });
  return (
    <group name="office-desk-lights">
      {Object.values(STATION_POSES).map((p, i) => (
        <mesh key={i} position={[p.x, 0.05, p.z]} rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={3}>
          <planeGeometry args={[p.w + 2.4, p.d + 2.6]} />
        </mesh>
      ))}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// People on the pavement
// ─────────────────────────────────────────────────────────────────────────────

const umbrellaCanopy = new ConeGeometry(0.62, 0.32, 10, 1, true);
const umbrellaStick = new CylinderGeometry(0.018, 0.018, 0.9, 5);
const UMBRELLA_TONES = ['#1d4ed8', '#e11d48', '#0f766e', '#7c3aed', '#ea580c', '#334155'];

/** One person on the pavement, placed each frame from pedestrianAt (weather.ts). Walking and standing are separate rigs. */
function Passer({ p, clock }: { p: Pedestrian; clock: { t: number; rainFor: number | null; storm: boolean } }) {
  const root = useRef<Group>(null);
  const brolly = useRef<Group>(null);
  const [pose, setPose] = useState<PedestrianPose>(() => pedestrianAt(p, 0, null).pose);
  useFrame(() => {
    const s = pedestrianAt(p, clock.t, clock.rainFor, clock.storm);
    if (root.current) {
      root.current.position.set(s.x, 0, s.z);
      root.current.rotation.y = s.heading;
    }
    // The umbrella pops open: it grows from a furled stick to its full canopy.
    if (brolly.current) brolly.current.scale.set(0.2 + 0.8 * s.umbrella, 0.5 + 0.5 * s.umbrella, 0.2 + 0.8 * s.umbrella);
    if (s.pose !== pose) setPose(s.pose);
  });
  const moving = pose === 'walk' || pose === 'umbrella' || pose === 'run';
  return (
    <group ref={root} name={`pedestrian-${p.index}`}>
      <CustomerFigure index={p.index + 40} shirt={customerShirt(p.index * 5 + 2)} phase={p.index * 1.7} walking={moving} scale={0.7} />
      {pose === 'umbrella' && (
        <group position={[0.12, 0, 0]}>
          <mesh geometry={umbrellaStick} position={[0, 1.15, 0]} material={solid} />
          <group ref={brolly} position={[0, 1.66, 0]}>
            <mesh geometry={umbrellaCanopy}>
              <meshStandardMaterial color={UMBRELLA_TONES[p.index % UMBRELLA_TONES.length]} roughness={0.5} />
            </mesh>
          </group>
        </group>
      )}
      {pose === 'phone' && (
        // Calling a taxi: a phone held up to the ear, its screen lit.
        <group position={[0.17, 0.98, 0.04]}>
          <mesh material={solid}>
            <boxGeometry args={[0.05, 0.12, 0.02]} />
          </mesh>
          <mesh position={[-0.012, 0, 0]} material={glow}>
            <boxGeometry args={[0.004, 0.1, 0.016]} />
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
  const clock = useMemo(() => ({ t: 0, rainFor: null as number | null, storm: false }), []);
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.1);
    clock.t += step;
    // The weather they react to is the one picked, so they move as the first drops fall rather than when the blend is done.
    const want = WEATHER_MIX[weatherStore.getState().weather];
    const raining = want.rain > 0;
    if (!raining) clock.rainFor = null;
    else clock.rainFor = clock.rainFor === null ? 0 : clock.rainFor + step;
    clock.storm = want.storm > 0;
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
  // The time of day and the weather reach everything here through useFrame, so nothing re-renders on the clock.
  return (
    <>
      <WeatherDriver />
      <Haze />
      <Ground />
      <City />
      <Trees />
      <Shelters />
      <Mist />
      <Motes />
      <Rain />
      <Lightning />
      <DeskLights />
      <Pedestrians />
    </>
  );
});
