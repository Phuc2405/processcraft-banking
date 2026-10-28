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
  Vector3,
  type AmbientLight,
  type Group,
} from 'three';
import { bankStore } from '../../../store/bankStore';
import { atmosphereAt, gustOf, rainOf, sameMix, stepMix, WEATHER_MIX, windOf, type WeatherMix } from './atmosphere';
import { useMerged } from './Dressing';
import { box, cyl, mix, type Part } from './kit';
import { customerShirt, FLOOR_SLAB, KERB_Z, ROAD_END, STATION_POSES, STREET } from './layout3d';
import { glow, pane, solid } from './materials';
import { CustomerFigure, type Wear } from './Avatars';
import { Bubble } from './Bubble3D';
import { LOT, TREE_STRIP } from './parking';
import { Parking3D } from './Parking3D';
import { Sky3D } from './Sky3D';
import { Vehicles3D } from './Vehicles3D';
import {
  BUS_STOP,
  carriesDrink,
  liveMix,
  outfitOf,
  outfitShirt,
  OVERHANG,
  PEDESTRIANS,
  pedestrianAt,
  useWeather,
  weatherStore,
  type AfterRain,
  type Downpour,
  type Outfit,
  type Pedestrian,
  type PedestrianPose,
  type Roof,
} from './weather';

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
    for (const z of [KERB_Z + STREET.kerbW + 0.18, ROAD_END - 0.18]) parts.push(box([cx, -0.132, z], [len, 0.006, 0.07], '#f3efe0'));
  }
  // The lane behind the block, which the car parks open onto. (Down both sides of the branch are its car parks, Parking3D.)
  parts.push(box([0, -0.3, -HZ - 3.2], [REACH * 2, 0.32, 3], '#3f4651'));
  return parts;
}

/** Belts of ground under the tree rows: cobbles along the far pavement, the grass strips along the car parks' outer edges. */
export const TREE_BELTS = {
  far: { x0: -REACH, x1: REACH, z0: ROAD_END + 0.1, z1: ROAD_END + 2.6 },
  sides: [-1, 1].map((side) => ({ x0: side < 0 ? -TREE_STRIP.x1 : TREE_STRIP.x0, x1: side < 0 ? -TREE_STRIP.x0 : TREE_STRIP.x1, z0: LOT.z0, z1: LOT.z1 })),
} as const;

function Ground() {
  const grass = useTiled(drawGrass, LAND / 6);
  const cobbles = useTiled(drawCobbles, 1);
  const roads = useMerged(roadParts, []);
  const far = TREE_BELTS.far;
  const cobbleTex = useMemo(() => {
    const t = cobbles.clone();
    t.repeat.set((far.x1 - far.x0) / 2, (far.z1 - far.z0) / 2);
    t.needsUpdate = true;
    return t;
  }, [cobbles, far]);
  useEffect(() => () => cobbleTex.dispose(), [cobbleTex]);
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
  // A row of shade trees along each car park's outer edge.
  for (const side of [-1, 1]) for (let z = LOT.z0 + 1.6; z < LOT.z1 - 0.6; z += 4.2) out.push({ x: side * TREE_STRIP.x, z, scale: 0.9 + rnd(i++, 7) * 0.2 });
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

/** The branch's footprint, floor slab and pavement: no rain, snow or haze ever falls or hangs inside it. */
export const INDOORS = { x0: -HX, x1: HX, z0: -HZ, z1: STREET.z0 } as const;
export const indoors = (x: number, z: number): boolean => x > INDOORS.x0 && x < INDOORS.x1 && z > INDOORS.z0 && z < INDOORS.z1;

/** How far beyond the farthest corner of the branch (in depth from the camera) the haze may begin. */
export const HAZE_CLEARANCE = 2;

/**
 * Distance haze that fades the city into the sky, coloured and pulled in by the time of day and the weather. However thick
 * the fog, smog or storm, it never starts before the far side of the branch, so the floor, the desks, the lanes and their
 * words stay sharp; the weather shows on the street through the mist banks, the rain and the sky.
 */
function Haze() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
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
    // The depth of the branch's farthest corner from the camera, along the way it looks.
    camera.getWorldDirection(look);
    let deepest = 0;
    for (const x of [INDOORS.x0, INDOORS.x1])
      for (const z of [INDOORS.z0, KERB_Z]) deepest = Math.max(deepest, corner.set(x, 0, z).sub(camera.position).dot(look));
    fog.near = Math.max(a.fog.near, deepest + HAZE_CLEARANCE);
    fog.far = Math.max(a.fog.far, fog.near + 14);
  });
  return null;
}
const look = new Vector3();
const corner = new Vector3();

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
/** Where weather falls: from cloud height, over the whole view. */
const RAIN_BOX = { x: 30, z0: -HZ - 6, z1: ROAD_END + 6, top: 20 } as const;
/** Below the ground, where a drop over the branch is parked so it is not drawn. */
const UNDER = -50;

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
      p.set([x, y, z, x + 0.06, y - 0.42, z], i * 6);
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
    const fall = Math.min(dt, 0.1) * (18 + 6 * liveMix.storm);
    // Rain falls straight down from the clouds; only a storm's wind drives it at a slant.
    const slant = 0.2 * liveMix.storm + 0.02 * wind * liveMix.storm;
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
      // Nothing falls inside the branch: over it, a drop shrinks to a point (draws nothing) until it is out again.
      if (indoors(x, a[o + 2]!)) {
        a[o + 3] = x;
        a[o + 4] = y;
      }
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

/** Things drifting down on the wind: snowflakes, autumn leaves or blossom petals. */
export interface DriftKind {
  id: 'snow' | 'leaves' | 'petals' | 'hail';
  count: number;
  colors: readonly string[];
  /** Point size in pixels. */
  size: number;
  /** How fast they fall (units a second) and how far the wind carries them sideways for each unit of wind. */
  fall: number;
  carry: number;
  /** How wide they flutter from side to side. */
  flutter: number;
  /** Seconds a pellet spends bouncing on the ground before the next one falls (hail). */
  bounce?: number;
}

export const DRIFTS: readonly DriftKind[] = [
  { id: 'snow', count: 1400, colors: ['#ffffff', '#eef4ff', '#dbe7f5'], size: 3.5, fall: 1.1, carry: 0.9, flutter: 0.35 },
  { id: 'leaves', count: 260, colors: ['#c2410c', '#ea580c', '#b45309', '#a16207', '#92400e', '#dc2626'], size: 6, fall: 0.8, carry: 3.2, flutter: 0.7 },
  { id: 'petals', count: 320, colors: ['#fbcfe8', '#f9a8d4', '#ffffff', '#fce7f3', '#f472b6'], size: 4.5, fall: 0.45, carry: 2.2, flutter: 0.9 },
  { id: 'hail', count: 1100, colors: ['#f8fafc', '#e2e8f0', '#dbeafe'], size: 3, fall: 11, carry: 0.6, flutter: 0.02, bounce: 0.45 },
];

/** How high a hail pellet bounces, at `u` (0-1) through its bounce: one big hop, then a little one. */
const hop = (u: number): number => (u < 0.65 ? 0.35 * Math.sin((Math.PI * u) / 0.65) : 0.08 * Math.sin((Math.PI * (u - 0.65)) / 0.35));

/** Where drifting particle `i` is after `t` seconds in wind `wind`: falling, carried downwind (+x) and fluttering, wrapped round the box. */
export function driftAt(kind: DriftKind, i: number, t: number, wind: number): [number, number, number] {
  const span = RAIN_BOX.x * 2;
  const x0 = (rnd(i, 41) * 2 - 1) * RAIN_BOX.x;
  const y0 = rnd(i, 42) * RAIN_BOX.top;
  const z = RAIN_BOX.z0 + rnd(i, 43) * (RAIN_BOX.z1 - RAIN_BOX.z0);
  const speed = kind.fall * (0.7 + 0.6 * rnd(i, 44));
  let y = RAIN_BOX.top - ((((RAIN_BOX.top - y0 + t * speed) % RAIN_BOX.top) + RAIN_BOX.top) % RAIN_BOX.top);
  if (kind.bounce) {
    // Hail: a fall, then a bounce on the ground, then the next pellet from the top.
    const fallT = RAIN_BOX.top / speed;
    const cycle = fallT + kind.bounce;
    const c = (((t + (y0 / RAIN_BOX.top) * cycle) % cycle) + cycle) % cycle;
    y = c < fallT ? RAIN_BOX.top - c * speed : hop((c - fallT) / kind.bounce);
  }
  const x = x0 + t * kind.carry * wind + Math.sin(t * (1.3 + rnd(i, 45)) + i) * kind.flutter;
  return [-RAIN_BOX.x + ((((x + RAIN_BOX.x) % span) + span) % span), y, z + Math.cos(t * 0.9 + i * 0.7) * kind.flutter * 0.5];
}

/** One kind of drift, drawn while its mood is in the blend: as many particles as the blend's share of it. */
function Drift({ kind }: { kind: DriftKind }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const c = new Float32Array(kind.count * 3);
    const tone = new Color();
    for (let i = 0; i < kind.count; i++) {
      tone.set(kind.colors[i % kind.colors.length]!);
      c.set([tone.r, tone.g, tone.b], i * 3);
    }
    g.setAttribute('position', new BufferAttribute(new Float32Array(kind.count * 3), 3));
    g.setAttribute('color', new BufferAttribute(c, 3));
    g.setDrawRange(0, 0);
    return g;
  }, [kind]);
  const material = useMemo(() => new PointsMaterial({ size: kind.size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }), [kind]);
  const points = useRef<Group>(null);
  const clock = useRef(0);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame((_, dt) => {
    const amount = Math.min(1, liveMix[kind.id]);
    const count = Math.round(kind.count * amount);
    geometry.setDrawRange(0, count);
    if (points.current) points.current.visible = count > 0;
    if (count === 0) return;
    clock.current += Math.min(dt, 0.1);
    const wind = windOf(liveMix);
    const p = geometry.getAttribute('position') as BufferAttribute;
    const arr = p.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const at = driftAt(kind, i, clock.current, wind);
      // Snow, hail, leaves and petals stay out of the branch.
      if (indoors(at[0], at[2])) at[1] = UNDER;
      arr.set(at, i * 3);
    }
    p.needsUpdate = true;
  });
  return (
    <group ref={points} visible={false}>
      <points geometry={geometry} material={material} name={`office-${kind.id}`} frustumCulled={false} />
    </group>
  );
}

const STREAKS = 90;

/** Wind made visible: thin white streaks blowing across the scene when the wind gets up (a storm, an autumn gale). */
function WindStreaks() {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(STREAKS * 6), 3));
    return g;
  }, []);
  const material = useMemo(() => new LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }), []);
  const lines = useRef<Group>(null);
  const clock = useRef(0);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame((_, dt) => {
    const gust = gustOf(liveMix);
    if (lines.current) lines.current.visible = gust > 0;
    material.opacity = 0.45 * gust;
    if (gust <= 0) return;
    clock.current += Math.min(dt, 0.1);
    const wind = windOf(liveMix);
    const span = RAIN_BOX.x * 2;
    const p = geometry.getAttribute('position') as BufferAttribute;
    const arr = p.array as Float32Array;
    for (let i = 0; i < STREAKS; i++) {
      const len = 0.8 + rnd(i, 51) * 1.6;
      const x = -RAIN_BOX.x + ((((rnd(i, 52) * span + clock.current * (9 + 6 * rnd(i, 53)) * wind) % span) + span) % span);
      const y = 0.6 + rnd(i, 54) * 5 + Math.sin(clock.current * 2 + i) * 0.15;
      const z = RAIN_BOX.z0 + rnd(i, 55) * (RAIN_BOX.z1 - RAIN_BOX.z0);
      arr.set([x, y, z, x - len, y + 0.04, z], i * 6);
    }
    p.needsUpdate = true;
  });
  return (
    <group ref={lines} visible={false}>
      <lineSegments geometry={geometry} material={material} name="office-wind" frustumCulled={false} />
    </group>
  );
}

/** Settled snow: a white cover over the land and the street (never the branch floor), thickening as the snow goes on. */
function SnowCover() {
  const material = useMemo(() => new MeshStandardMaterial({ color: '#f4f8fc', roughness: 0.95, transparent: true, opacity: 0, depthWrite: false }), []);
  const mesh = useRef<Group>(null);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    const cover = atmosphereAt(bankStore.getState().view.minute, liveMix).snowCover;
    material.opacity = 0.7 * cover;
    if (mesh.current) mesh.current.visible = cover > 0.01;
  });
  const patches: Array<[number, number, number, number]> = [
    // Behind and either side of the branch, and the far side of the street.
    [0, -HZ - REACH / 2 - 0.2, REACH * 2, REACH],
    [-HX - REACH / 2 - 0.2, 0, REACH, HZ * 2 + 0.4],
    [HX + REACH / 2 + 0.2, 0, REACH, HZ * 2 + 0.4],
    [0, ROAD_END + REACH / 2, REACH * 2, REACH],
  ];
  return (
    <group ref={mesh} visible={false} name="office-snow-cover">
      {patches.map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.035, z]} rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={2}>
          <planeGeometry args={[w, d]} />
        </mesh>
      ))}
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

const WEAR: Readonly<Record<Outfit, Wear>> = { everyday: 'none', summer: 'summer', winter: 'winter', rain: 'rain', mask: 'mask', jacket: 'none' };

/** The weather the people on the pavement react to, from a pick's blend: dry (null), rain, a storm, or hail. */
export const downpourOf = (w: WeatherMix): Downpour | null => (w.hail > 0 ? 'hail' : w.storm > 0 ? true : w.rain > 0 ? false : null);

interface PavementClock {
  t: number;
  rainFor: number | null;
  storm: Downpour;
  after: AfterRain | null;
}

/** Where the hand holding an umbrella is (figure scale 0.7): low by the side, then raised overhead and a little forward. */
const HAND = { down: [0.19, 0.36, 0], up: [0.19, 0.95, 0.13] } as const;

/**
 * How an umbrella moves in the wind at time `t`: a lean downwind and a shake that grows with the wind (radians about z and x).
 * Pure, so the tests can check a storm shakes it harder than a breeze.
 */
export const umbrellaWobble = (index: number, t: number, wind: number): { z: number; x: number } => ({
  z: -wind * (0.06 + 0.08 * Math.sin(t * 3.1 + index) + 0.05 * Math.sin(t * 7.3 + index * 2)),
  x: wind * 0.07 * Math.sin(t * 2.3 + index * 1.3),
});

/** One person on the pavement, placed each frame from pedestrianAt (weather.ts). Walking and standing are separate rigs. */
function Passer({ p, clock }: { p: Pedestrian; clock: PavementClock }) {
  const root = useRef<Group>(null);
  const hand = useRef<Group>(null);
  const brolly = useRef<Group>(null);
  const raise = useMemo(() => ({ current: 0 }), []);
  const outfit = useWeather((s) => outfitOf(s.weather));
  const drink = useWeather((s) => carriesDrink(s.weather));
  const [pose, setPose] = useState<PedestrianPose>(() => pedestrianAt(p, 0, null).pose);
  useFrame(() => {
    const s = pedestrianAt(p, clock.t, clock.rainFor, clock.storm, clock.after);
    if (root.current) {
      root.current.position.set(s.x, 0, s.z);
      root.current.rotation.y = s.heading;
      // Looking up at the first drops: a lean back. Shaking the water off a furled umbrella: a quick wiggle.
      root.current.rotation.x = s.pose === 'lookup' ? -0.12 : 0;
      root.current.rotation.z = s.pose === 'shake' ? Math.sin(clock.t * 34) * 0.09 : 0;
    }
    // The arm comes up first, then the umbrella pops open over the head: from a furled stick to its full canopy.
    raise.current = Math.min(1, s.umbrella * 2);
    const h = hand.current;
    if (h) {
      const u = raise.current;
      h.position.set(HAND.down[0], HAND.down[1] + (HAND.up[1] - HAND.down[1]) * u, HAND.down[2] + (HAND.up[2] - HAND.down[2]) * u);
      const wob = umbrellaWobble(p.index, clock.t, windOf(liveMix) * s.umbrella);
      h.rotation.set(wob.x, 0, wob.z);
    }
    if (brolly.current) brolly.current.scale.set(0.2 + 0.8 * s.umbrella, 0.5 + 0.5 * s.umbrella, 0.2 + 0.8 * s.umbrella);
    if (s.pose !== pose) setPose(s.pose);
  });
  const moving = pose === 'walk' || pose === 'umbrella' || pose === 'run' || pose === 'fold';
  return (
    <group ref={root} name={`pedestrian-${p.index}`}>
      <CustomerFigure
        index={p.index + 40}
        shirt={outfitShirt(outfit, p.index, customerShirt(p.index * 5 + 2))}
        phase={p.index * 1.7}
        walking={moving}
        scale={0.7}
        wear={WEAR[outfit]}
        raise={raise}
      />
      {drink && pose !== 'umbrella' && pose !== 'fold' && (
        // A cold drink in the heat: a cup with a straw, in the left hand.
        <group position={[-0.19, 0.4, 0.05]}>
          <mesh>
            <cylinderGeometry args={[0.04, 0.032, 0.12, 8]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.6} />
          </mesh>
          <mesh position={[0.01, 0.09, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.08, 4]} />
            <meshStandardMaterial color="#ef4444" />
          </mesh>
        </group>
      )}
      {(pose === 'umbrella' || pose === 'fold') && (
        <group ref={hand} position={[HAND.down[0], HAND.down[1], HAND.down[2]]}>
          <mesh geometry={umbrellaStick} position={[0, 0.45, 0]} material={solid} />
          <group ref={brolly} position={[0, 0.92, 0]}>
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
      {pose === 'chat' && p.index % 2 === 0 && (
        // A speech (or thought) bubble floating between the pair who stop to talk, over the one who faces the other.
        <Bubble kind={p.index % 4 === 0 ? 'speech' : 'thought'} position={[0, 1.2, 0.35]} phase={p.index} size={0.36} />
      )}
    </group>
  );
}

/** The passers-by: their own clock runs only while the canvas draws, so a resting office never makes them jump. */
function Pedestrians() {
  const clock = useMemo<PavementClock>(() => ({ t: 0, rainFor: null, storm: false, after: null }), []);
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.1);
    clock.t += step;
    // The weather they react to is the one picked, so they move as the first drops fall rather than when the blend is done.
    const wet = downpourOf(WEATHER_MIX[weatherStore.getState().weather]);
    if (wet === null) {
      // It has just dried up: remember how long it lasted and what it was, so they fold their umbrellas and step back out.
      if (clock.rainFor !== null) clock.after = { since: 0, lasted: clock.rainFor, was: clock.storm };
      else if (clock.after) clock.after.since += step;
      clock.rainFor = null;
    } else {
      clock.after = null;
      clock.rainFor = clock.rainFor === null ? 0 : clock.rainFor + step;
      clock.storm = wet;
    }
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
      <Parking3D />
      <Sky3D />
      <City />
      <Trees />
      <Shelters />
      <Mist />
      <Motes />
      <Rain />
      {DRIFTS.map((k) => (
        <Drift key={k.id} kind={k} />
      ))}
      <WindStreaks />
      <SnowCover />
      <Lightning />
      <DeskLights />
      <Pedestrians />
      <Vehicles3D />
    </>
  );
});
