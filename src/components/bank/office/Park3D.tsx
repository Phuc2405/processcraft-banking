import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Color, ConeGeometry, CylinderGeometry, InstancedMesh, MeshStandardMaterial, Object3D, type Group, type Mesh } from 'three';
import { bankStore } from '../../../store/bankStore';
import { CustomerFigure, SittingFigure, type Wear } from './Avatars';
import { Bubble } from './Bubble3D';
import { Sign, useMerged } from './Dressing';
import { ball, box, cyl, type Part } from './kit';
import { customerShirt, SIDE_DOORS_RIGHT } from './layout3d';
import { glow, solid } from './materials';
import { motion, substeps } from './motion';
import { TREE_STRIP } from './parking';
import { ParkCrowd, SWING_XS, talkers, wantsPark, type ParkPose, type ParkSky, type ParkState, type Talker } from './parkLife';
import { FLOWERBEDS, FOUNTAIN, HEDGES, LOOP, PARK, PARK_BENCHES, PARK_CX as cx, PARK_CZ as cz, PICNIC, PLAYGROUND } from './parkPlan';
import { isRaining, outfitOf, outfitShirt, useWeather, weatherStore, type Outfit } from './weather';

export { FOUNTAIN, LOOP, PARK, PARK_BENCHES, PICNIC, PLAYGROUND, strollerAt } from './parkPlan';

/**
 * The public park on the right of the branch, between it and the houses: a striped, tufted lawn with a cobbled loop path,
 * paths in from the branch's three side doors, a fountain with leaping jets in a round plaza ringed with flowerbeds and
 * benches, street lamps, a picnic table under a sun umbrella, and a playground with swings and a slide.
 *
 * Its people (parkLife.ts) sit and chat on the benches, eat, drink and talk at the picnic table, swing on the swings (a swing
 * only ever moves with a child on it, and settles still after they hop off) and stroll the loop; more of them after the bank
 * closes at 17:00. When rain, hail or snow comes they look up, get up one after another and walk out through the gate to
 * the street, umbrellas up; when it clears they walk back in. Nobody appears or disappears inside the park.
 */

const GROUND_Y = -0.03;

const rnd = (i: number, k: number): number => {
  const x = Math.sin(i * 57.13 + k * 19.91) * 15731.743;
  return x - Math.floor(x);
};

const COBBLE = '#c9bfae';
const FLOWERS = ['#f43f5e', '#f59e0b', '#a855f7', '#fde047', '#fb7185', '#ffffff'];
const GATE_X = LOOP.x0 + 1.9;

/** The park's fixed parts. */
function parkParts(): { solid: Part[]; lit: Part[] } {
  const w = PARK.x1 - PARK.x0;
  const d = PARK.z1 - PARK.z0;
  const p: Part[] = [
    box([cx, -0.34, cz], [w, 0.6, d], '#8a7d6b'),
    box([cx, GROUND_Y - 0.004, cz], [w, 0.01, d], '#86bd62'),
    box([(TREE_STRIP.x0 + TREE_STRIP.x1) / 2, -0.34, cz], [TREE_STRIP.x1 - TREE_STRIP.x0, 0.62, d], '#6b8f4e'),
  ];
  // Mowing stripes: broad bands of a lighter green across the lawn.
  for (let z = PARK.z0 + 0.9, k = 0; z < PARK.z1 - 0.6; z += 1.8, k++) if (k % 2 === 0) p.push(box([cx, GROUND_Y - 0.002, z], [w - 0.2, 0.004, 0.9], '#97ca6f'));
  // A low hedge along the front, by the pavement, with a gap for the path.
  for (const h of HEDGES) p.push(box([(h.x0 + h.x1) / 2, 0.22, (h.z0 + h.z1) / 2], [h.x1 - h.x0, 0.5, h.z1 - h.z0], '#3f7d3a'));
  // The loop path, and the paths in from the side doors and across to the fountain.
  const y = GROUND_Y + 0.002;
  p.push(
    box([cx, y, LOOP.z0], [LOOP.x1 - LOOP.x0 + LOOP.w, 0.01, LOOP.w], COBBLE),
    box([cx, y, LOOP.z1], [LOOP.x1 - LOOP.x0 + LOOP.w, 0.01, LOOP.w], COBBLE),
    box([LOOP.x0, y, cz], [LOOP.w, 0.01, LOOP.z1 - LOOP.z0], COBBLE),
    box([LOOP.x1, y, cz], [LOOP.w, 0.01, LOOP.z1 - LOOP.z0], COBBLE),
    box([cx, y, cz], [LOOP.x1 - LOOP.x0, 0.01, 0.9], COBBLE),
    box([cx, y, cz], [0.9, 0.01, LOOP.z1 - LOOP.z0], COBBLE),
  );
  const HX = PARK.x0 - 0.4;
  for (const z of SIDE_DOORS_RIGHT) p.push(box([(HX + LOOP.x0) / 2, y + 0.001, z], [LOOP.x0 - HX, 0.01, 1.1], COBBLE));
  // The way in from the street.
  p.push(box([GATE_X, y, (LOOP.z1 + PARK.z1) / 2], [0.9, 0.01, PARK.z1 - LOOP.z1], COBBLE));
  // The fountain: a round plaza, a stone basin, water, a central column with two bowls.
  p.push(
    cyl([FOUNTAIN.x, y + 0.001, FOUNTAIN.z], FOUNTAIN.r, FOUNTAIN.r, 0.012, '#d6cfc0', 32),
    cyl([FOUNTAIN.x, 0.18, FOUNTAIN.z], 1.25, 1.32, 0.36, '#cbd5e1', 28),
    cyl([FOUNTAIN.x, 0.75, FOUNTAIN.z], 0.12, 0.16, 1.0, '#e2e8f0', 12),
    cyl([FOUNTAIN.x, 1.05, FOUNTAIN.z], 0.55, 0.3, 0.12, '#e2e8f0', 20),
    cyl([FOUNTAIN.x, 1.42, FOUNTAIN.z], 0.3, 0.18, 0.08, '#e2e8f0', 16),
  );
  // Flowerbeds between the benches round the plaza.
  FLOWERBEDS.forEach(({ at: [fx, fz], size }, b) => {
    p.push(box([fx, 0.08, fz], [size, 0.16, size], '#7c4a2d'), box([fx, 0.17, fz], [size - 0.08, 0.02, size - 0.08], '#4d7c0f'));
    for (let n = 0; n < 9; n++) {
      const fxn = fx + (rnd(b * 9 + n, 2) - 0.5) * (size - 0.2);
      const fzn = fz + (rnd(b * 9 + n, 5) - 0.5) * (size - 0.2);
      p.push(box([fxn, 0.21, fzn], [0.02, 0.08, 0.02], '#3f6212'), ball([fxn, 0.26, fzn], 0.065, FLOWERS[(b + n) % FLOWERS.length]!));
    }
  });
  // Benches round the fountain.
  for (const b of PARK_BENCHES) {
    const [x, z] = b.at;
    const along = b.facing + Math.PI / 2;
    const ux = Math.sin(along);
    const uz = Math.cos(along);
    const back = { x: -Math.sin(b.facing) * 0.24, z: -Math.cos(b.facing) * 0.24 };
    for (const k of [-0.5, 0, 0.5]) p.push(box([x + ux * k, 0.34, z + uz * k], [0.5, 0.05, 0.42], '#a16207', [0, along, 0]));
    p.push(box([x + back.x, 0.66, z + back.z], [1.4, 0.24, 0.05], '#a16207', [0, b.facing, 0]));
    for (const e of [-0.6, 0.6]) p.push(box([x + ux * e, 0.17, z + uz * e], [0.06, 0.34, 0.4], '#334155', [0, along, 0]));
  }
  // The picnic corner: a table and two benches under a sun umbrella, set for a meal.
  p.push(
    box([PICNIC.x, 0.62, PICNIC.z], [1.6, 0.06, 0.8], '#a16207'),
    box([PICNIC.x, 0.3, PICNIC.z], [0.1, 0.6, 0.6], '#78350f'),
    box([PICNIC.x, 0.36, PICNIC.z - 0.7], [1.6, 0.05, 0.3], '#a16207'),
    box([PICNIC.x, 0.36, PICNIC.z + 0.7], [1.6, 0.05, 0.3], '#a16207'),
    cyl([PICNIC.x, 1.1, PICNIC.z], 0.025, 0.025, 2.0, '#e2e8f0', 6),
    // A checked cloth, plates, a basket and a bottle.
    box([PICNIC.x, 0.655, PICNIC.z], [1.3, 0.008, 0.62], '#fecaca'),
    ...[-0.45, 0.45].flatMap((dx) => [-0.2, 0.2].map((dz) => cyl([PICNIC.x + dx, 0.665, PICNIC.z + dz], 0.11, 0.11, 0.012, '#f8fafc', 12))),
    ...[-0.45, 0.45].flatMap((dx) => [-0.2, 0.2].map((dz) => ball([PICNIC.x + dx, 0.69, PICNIC.z + dz], 0.045, '#f59e0b'))),
    box([PICNIC.x - 0.05, 0.72, PICNIC.z], [0.26, 0.12, 0.18], '#b45309'),
    cyl([PICNIC.x + 0.15, 0.75, PICNIC.z], 0.035, 0.035, 0.18, '#16a34a', 8),
  );
  // The playground: a sand pad, a swing frame (the seats swing, below) and a slide.
  p.push(box([PLAYGROUND.x, GROUND_Y + 0.004, PLAYGROUND.z], [4.4, 0.01, 3.4], '#e7d7a8'));
  const sx = PLAYGROUND.x - 1.1;
  for (const e of [-1, 1]) p.push(box([sx + e * 0.9, 0.85, PLAYGROUND.z - 0.35], [0.08, 1.75, 0.08], '#dc2626', [0.25, 0, 0]), box([sx + e * 0.9, 0.85, PLAYGROUND.z + 0.35], [0.08, 1.75, 0.08], '#dc2626', [-0.25, 0, 0]));
  p.push(box([sx, 1.7, PLAYGROUND.z], [1.9, 0.08, 0.08], '#dc2626'));
  const lx = PLAYGROUND.x + 1.2;
  p.push(
    box([lx, 0.55, PLAYGROUND.z - 0.6], [0.7, 0.06, 0.6], '#2563eb'),
    ...[-0.3, 0.3].map((e) => box([lx + e, 0.28, PLAYGROUND.z - 0.6], [0.06, 0.56, 0.06], '#1e3a8a')),
    box([lx, 0.32, PLAYGROUND.z - 1.05], [0.5, 0.06, 0.4], '#1e3a8a', [0.9, 0, 0]),
    box([lx, 0.3, PLAYGROUND.z + 0.15], [0.55, 0.05, 1.3], '#f59e0b', [-0.42, 0, 0]),
  );
  // Street lamps along the loop.
  const lit: Part[] = [];
  for (const [x, z] of [
    [LOOP.x0 - 0.65, LOOP.z0 + 3],
    [LOOP.x0 - 0.65, cz + 4],
    [LOOP.x0 - 0.65, LOOP.z1 - 2],
    [LOOP.x1 + 0.65, LOOP.z0 + 6],
    [LOOP.x1 + 0.65, cz - 3],
    [LOOP.x1 + 0.65, LOOP.z1 - 4],
  ] as const) {
    p.push(cyl([x, 1.2, z], 0.04, 0.06, 2.4, '#334155', 8), ball([x, 2.45, z], 0.16, '#1f2937'));
    lit.push(ball([x, 2.38, z], 0.12, '#fff4cf'));
  }
  return { solid: p, lit };
}

/** Whether a tuft of grass at (x, z) would sit on a path, the plaza, a bed, the playground's sand or under the picnic table. */
export function offLawn(x: number, z: number): boolean {
  const near = (a: number, b: number, r: number): boolean => Math.abs(a - b) < r;
  if (near(z, LOOP.z0, 0.6) || near(z, LOOP.z1, 0.6) || near(x, LOOP.x0, 0.6) || near(x, LOOP.x1, 0.6)) return true;
  if (near(x, cx, 0.55) || near(z, cz, 0.55)) return true;
  if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.r + 1.2) return true;
  if (near(x, PLAYGROUND.x, 2.3) && near(z, PLAYGROUND.z, 1.8)) return true;
  if (near(x, PICNIC.x, 1.0) && near(z, PICNIC.z, 1.0)) return true;
  if (near(x, GATE_X, 0.55) && z > LOOP.z1) return true;
  for (const zz of SIDE_DOORS_RIGHT) if (near(z, zz, 0.65) && x < LOOP.x0) return true;
  return x < PARK.x0 + 0.15 || x > PARK.x1 - 0.15 || z < PARK.z0 + 0.15 || z > PARK.z1 - 0.3;
}

const TUFTS = 900;
const tuftGeometry = new ConeGeometry(0.06, 0.2, 4, 1);
tuftGeometry.translate(0, 0.1, 0);

/** Tufts of grass over the lawn (one instanced mesh), in a few greens, swaying a little in the wind of the weather. */
function Grass() {
  const mesh = useRef<InstancedMesh>(null);
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.9 }), []);
  useEffect(() => () => material.dispose(), [material]);
  const spots = useMemo(() => {
    const out: Array<[number, number, number]> = [];
    for (let i = 0; out.length < TUFTS && i < TUFTS * 4; i++) {
      const x = PARK.x0 + rnd(i, 31) * (PARK.x1 - PARK.x0);
      const z = PARK.z0 + rnd(i, 37) * (PARK.z1 - PARK.z0);
      if (!offLawn(x, z)) out.push([x, z, rnd(i, 41)]);
    }
    return out;
  }, []);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    const c = new Color();
    const greens = ['#4d7c0f', '#65a30d', '#3f6212', '#84cc16'];
    spots.forEach(([x, z, r], i) => {
      o.position.set(x, GROUND_Y, z);
      o.rotation.set((r - 0.5) * 0.3, r * Math.PI * 2, 0);
      o.scale.setScalar(0.7 + r * 0.7);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(greens[i % greens.length]!));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [spots]);
  return <instancedMesh ref={mesh} args={[tuftGeometry, material, spots.length]} name="park-grass" receiveShadow />;
}

/** The water of the fountain: the pool's surface rippling, thin jets that rise and fall, and a crown of spray from the top bowl. */
function FountainWater() {
  const jets = useRef<Array<Mesh | null>>([]);
  const pool = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    jets.current.forEach((m, i) => {
      if (!m) return;
      const h = 0.35 + 0.12 * Math.sin(t * 3 + i * 1.7);
      m.scale.set(1, h / 0.4, 1);
      m.position.y = (i === 0 ? 1.46 : 0.32) + h / 2;
    });
    if (pool.current) pool.current.position.y = 0.3 + Math.sin(t * 2.2) * 0.006;
  });
  const spots = useMemo(() => [[0, 0] as const, ...Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3) * 0.8, Math.sin((k * Math.PI) / 3) * 0.8] as const)], []);
  return (
    <group position={[FOUNTAIN.x, 0, FOUNTAIN.z]} name="park-fountain-water">
      <mesh ref={pool} position={[0, 0.3, 0]}>
        <cylinderGeometry args={[1.12, 1.12, 0.04, 28]} />
        <meshStandardMaterial color="#38bdf8" roughness={0.08} metalness={0.2} transparent opacity={0.88} />
      </mesh>
      {spots.map(([x, z], i) => (
        <mesh
          key={i}
          ref={(m) => {
            jets.current[i] = m;
          }}
          position={[x, 0.5, z]}
        >
          <cylinderGeometry args={[i === 0 ? 0.05 : 0.03, i === 0 ? 0.09 : 0.05, 0.4, 8]} />
          <meshStandardMaterial color="#bae6fd" transparent opacity={0.7} roughness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

/** How far a swing swings, and how quickly it picks up with a child pumping on it and settles once they are off. */
export const SWING = { amp: 0.55, rate: 2.1, pickUp: 0.35, settle: 0.45 } as const;

/** The swing's amplitude after `dt` more seconds: building towards SWING.amp while taken, dying away to still while empty. */
export const swingAmp = (amp: number, taken: boolean, dt: number): number =>
  taken ? Math.min(SWING.amp, amp + SWING.amp * SWING.pickUp * dt) : amp * Math.exp(-SWING.settle * dt * 3);

/**
 * The two swing seats. A seat swings only with a child on it: the child pumps it up to full height; once they hop off it dies
 * away to still. On the motion clock, so everything stops on pause.
 */
function Swings({ crowd }: { crowd: ParkCrowd }) {
  const seats = useRef<Array<Group | null>>([]);
  const kids = useRef<Array<Group | null>>([]);
  const amp = useRef([0, 0]);
  const phase = useRef([0, 1.4]);
  useFrame(() => {
    for (let i = 0; i < 2; i++) {
      const taken = crowd.swingTaken(i);
      amp.current[i] = swingAmp(amp.current[i]!, taken, motion.dt);
      phase.current[i]! += motion.dt * SWING.rate;
      const g = seats.current[i];
      if (g) g.rotation.x = Math.sin(phase.current[i]!) * amp.current[i]!;
      const kid = kids.current[i];
      if (kid) kid.visible = taken;
    }
  });
  return (
    <>
      {SWING_XS().map((x, i) => (
        <group
          key={i}
          ref={(g) => {
            seats.current[i] = g;
          }}
          position={[x, 1.68, PLAYGROUND.z]}
          name={`park-swing-${i}`}
        >
          {[-0.14, 0.14].map((e) => (
            <mesh key={e} position={[e, -0.6, 0]} material={solid}>
              <boxGeometry args={[0.015, 1.2, 0.015]} />
            </mesh>
          ))}
          <mesh position={[0, -1.2, 0]}>
            <boxGeometry args={[0.34, 0.04, 0.16]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
          {/* The child on the seat, holding the chains: they swing with it. */}
          <group
            ref={(g) => {
              kids.current[i] = g;
            }}
            position={[0, -1.2 - 0.48 * 0.48, -0.08]}
            visible={false}
          >
            <SittingFigure index={i * 23 + 201} shirt={['#f472b6', '#38bdf8'][i]!} phase={i} scale={0.48} />
          </group>
        </group>
      ))}
    </>
  );
}

/** A small umbrella, held overhead in the wet. */
const canopy = new ConeGeometry(0.5, 0.26, 10, 1, true);
const stick = new CylinderGeometry(0.016, 0.016, 0.75, 5);
const UMBRELLAS = ['#1d4ed8', '#e11d48', '#0f766e', '#7c3aed', '#ea580c'];

const WEAR: Readonly<Record<Outfit, Wear>> = { everyday: 'none', summer: 'summer', winter: 'winter', rain: 'rain', mask: 'mask', jacket: 'none' };

/** What a person is drawn as: sitting (bench, picnic), standing (just got up), walking, or on a swing (drawn by Swings). */
type Look = 'sit' | 'stand' | 'walk' | 'swing' | 'away';
const lookOf = (p: ParkState, pose: ParkPose): Look => {
  if (pose === 'away') return 'away';
  if (pose === 'walk') return 'walk';
  if (p.m.role === 'swing') return pose === 'up' ? 'stand' : 'swing';
  if (p.m.role === 'stroll') return pose === 'up' ? 'stand' : 'walk';
  return pose === 'up' ? 'stand' : 'sit';
};

/** One person in the park, placed every frame from the crowd. */
function ParkPerson({ crowd, i, outfit }: { crowd: ParkCrowd; i: number; outfit: Outfit }) {
  const p = crowd.people[i]!;
  const root = useRef<Group>(null);
  const cup = useRef<Group>(null);
  const brolly = useRef<Group>(null);
  const raise = useMemo(() => ({ current: 0 }), []);
  const [look, setLook] = useState<Look>(() => lookOf(p, crowd.poseOf(p).pose));
  const [running, setRunning] = useState(false);
  useFrame(() => {
    const s = crowd.poseOf(p);
    const l = lookOf(p, s.pose);
    if (l !== look) setLook(l);
    // Hurrying out of a storm: at a run.
    const run = l === 'walk' && crowd.storm && p.going === 'out';
    if (run !== running) setRunning(run);
    const g = root.current;
    if (!g) return;
    g.visible = l !== 'away' && l !== 'swing';
    // A sitter who has just got up steps forward off the seat.
    const fwd = l === 'stand' && (p.m.role === 'bench' || p.m.role === 'picnic') ? 0.35 : 0;
    g.position.set(s.at[0] + Math.sin(s.heading) * fwd, l === 'sit' ? 0 : GROUND_Y, s.at[1] + Math.cos(s.heading) * fwd);
    g.rotation.y = s.heading;
    // Looking up at the sky before setting off.
    g.rotation.x = l === 'stand' ? -0.12 : 0;
    // Up goes the umbrella, wherever they are, as soon as it rains (or hails, or snows): on the bench, at the table, under
    // the swings, strolling.
    const wet = l !== 'away' && crowd.wet;
    raise.current += ((wet ? 1 : 0) - raise.current) * Math.min(1, motion.dt * 4 + (motion.dt > 0 ? 0.02 : 0));
    if (brolly.current) {
      brolly.current.visible = raise.current > 0.05;
      brolly.current.scale.setScalar(Math.max(0.05, raise.current));
    }
    // At the picnic table: a cup or a bite raised to the mouth now and then, then back down to the table.
    if (cup.current) {
      const u = Math.max(0, Math.sin(motion.t * 0.9 + p.m.k * 1.9));
      cup.current.position.set(0.1, 0.5 + 0.22 * u * u, 0.22 - 0.1 * u * u);
    }
  });
  const shirt = outfitShirt(outfit, p.m.k + 3, customerShirt(p.m.k * 4 + (p.m.role === 'picnic' ? 29 : p.m.role === 'stroll' ? 11 : 13)));
  const index = 141 + i * 7;
  return (
    <group ref={root} name={`park-${p.m.id}`}>
      {look === 'sit' ? (
        <>
          <SittingFigure index={index} shirt={shirt} phase={p.m.k * 1.3} />
          {p.m.role === 'picnic' && (
            <group ref={cup}>
              <mesh>
                <cylinderGeometry args={[0.035, 0.028, 0.09, 8]} />
                <meshStandardMaterial color={p.m.k % 2 ? '#f8fafc' : '#fbbf24'} roughness={0.5} />
              </mesh>
            </group>
          )}
        </>
      ) : (
        <CustomerFigure index={index} shirt={shirt} phase={p.m.k * 2.3} walking stride={look === 'walk' ? 1 : 0} tempo={running ? 1.7 : 1} scale={p.m.role === 'swing' ? 0.5 : 0.7} wear={WEAR[outfit]} raise={raise} />
      )}
      <group ref={brolly} position={[0.13, 0.95, 0.1]} visible={false}>
        <mesh geometry={stick} position={[0, -0.1, 0]} material={solid} />
        <mesh geometry={canopy} position={[0, 0.3, 0]}>
          <meshStandardMaterial color={UMBRELLAS[p.m.k % UMBRELLAS.length]} roughness={0.5} side={2} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Talk at the benches and the picnic table: a speech bubble over each person in a conversation (talkers), so both of a pair
 * (and everyone round the table) show one, never just one side. They take turns: each pops as the other quietens.
 */
function Chatter({ crowd }: { crowd: ParkCrowd }) {
  const [list, setList] = useState<readonly Talker[]>([]);
  useFrame(() => {
    const next = talkers(crowd);
    if (next.length !== list.length || next.some((t, i) => t.id !== list[i]?.id || t.turn !== list[i]?.turn)) setList(next);
  });
  return (
    <>
      {list.map((t) => (
        <Bubble key={t.id} kind="speech" position={[t.at[0], 1.2, t.at[1]]} phase={(t.turn % 2) * (Math.PI / 1.3) + t.turn * 0.3} size={0.3} />
      ))}
    </>
  );
}

/** Whether the bank has closed its doors to customers for the day (17:00 on). */
export const afterHours = (minute: number): boolean => minute >= 17 * 60;

export const Park3D = memo(function Park3D() {
  const parts = useMemo(parkParts, []);
  const ground = useMerged(() => parts.solid, [parts]);
  const lit = useMerged(() => parts.lit, [parts]);
  const outfit = useWeather((s) => outfitOf(s.weather));
  // Everyone wanted at the start is already in place; after that they come and go on foot.
  const crowd = useMemo(() => {
    const minute = bankStore.getState().view.minute;
    return new ParkCrowd(undefined, (m) => wantsPark(m, minute));
  }, []);
  useFrame(() => {
    const minute = bankStore.getState().view.minute;
    const w = weatherStore.getState().weather;
    // A storm or hail clears the park at a run; rain or snow cuts visits short under umbrellas.
    const sky: ParkSky = w === 'storm' || w === 'hail' ? 'storm' : isRaining() || w === 'snow' ? 'rain' : 'dry';
    for (const h of substeps(motion.dt)) crowd.step(h, (m) => wantsPark(m, minute), sky, minute);
  }, -1);
  return (
    <group name="office-park">
      <mesh geometry={ground} material={solid} receiveShadow />
      <mesh geometry={lit} material={glow} />
      <Grass />
      <FountainWater />
      <Swings crowd={crowd} />
      {/* The sun umbrella over the picnic table. */}
      <mesh position={[PICNIC.x, 2.05, PICNIC.z]}>
        <coneGeometry args={[1.25, 0.45, 8, 1, true]} />
        <meshStandardMaterial color="#f97316" roughness={0.6} side={2} />
      </mesh>
      <Sign text="CITY PARK" fg="#ffffff" bg="#15803d" position={[GATE_X, 1.35, PARK.z1 - 0.3]} width={1.5} />
      {crowd.people.map((_, i) => (
        <ParkPerson key={crowd.people[i]!.m.id} crowd={crowd} i={i} outfit={outfit} />
      ))}
      <Chatter crowd={crowd} />
    </group>
  );
});
