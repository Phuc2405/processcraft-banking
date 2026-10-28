import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import type { Group, Mesh } from 'three';
import { useBankStore } from '../../../store/bankStore';
import { CustomerFigure, SittingFigure } from './Avatars';
import { Bubble } from './Bubble3D';
import { Sign, useMerged } from './Dressing';
import { ball, box, cyl, type Part } from './kit';
import { customerShirt, FLOOR_SLAB, SIDE_DOORS_RIGHT, type V2 } from './layout3d';
import { glow, solid } from './materials';
import { motion } from './motion';
import { LOT, TREE_STRIP } from './parking';
import { pathLength, pointAlongPath } from './tour3d';
import { outfitOf, outfitShirt, useWeather } from './weather';

/**
 * The public park on the right of the branch, between it and the houses: a lawn with a cobbled loop path, paths in from
 * the branch's three side doors, a fountain in a round plaza ringed with flowerbeds and benches, street lamps, a picnic
 * table under a sun umbrella, and a playground with swings and a slide. People stroll the loop and sit and chat on the
 * benches (more of them after the bank closes at 17:00); in rain, hail or snow they go home.
 */

const HX = FLOOR_SLAB.w / 2;
const GROUND_Y = -0.03;

/** The park, as world x (it is on the right) and z. */
export const PARK = {
  x0: HX + 0.4,
  x1: LOT.x1,
  z0: LOT.z0,
  z1: LOT.z1,
} as const;
const cx = (PARK.x0 + PARK.x1) / 2;
const cz = (PARK.z0 + PARK.z1) / 2;

/** The loop path, inset from the park's edge. */
export const LOOP = { x0: PARK.x0 + 0.9, x1: PARK.x1 - 0.9, z0: PARK.z0 + 1.2, z1: PARK.z1 - 1.0, w: 1.0 } as const;
/** The fountain plaza in the middle. */
export const FOUNTAIN = { x: cx, z: cz, r: 2.3 } as const;
/** The playground, at the back of the park; the picnic corner, at the front. */
export const PLAYGROUND = { x: cx, z: PARK.z0 + 5 } as const;
export const PICNIC = { x: cx + 1.2, z: PARK.z1 - 4.2 } as const;

/** The benches round the fountain, facing it (where, and which way the sitter faces). */
export const PARK_BENCHES: ReadonlyArray<{ at: V2; facing: number }> = [0, 1, 2, 3].map((k) => {
  const a = Math.PI / 4 + (k * Math.PI) / 2;
  const r = FOUNTAIN.r + 0.55;
  return { at: [FOUNTAIN.x + Math.cos(a) * r, FOUNTAIN.z + Math.sin(a) * r] as V2, facing: Math.atan2(-Math.cos(a), -Math.sin(a)) };
});

/** The loop as a closed path, for the strollers. */
const LOOP_PATH: V2[] = [
  [LOOP.x0, LOOP.z0],
  [LOOP.x1, LOOP.z0],
  [LOOP.x1, LOOP.z1],
  [LOOP.x0, LOOP.z1],
  [LOOP.x0, LOOP.z0],
];
const LOOP_LEN = pathLength(LOOP_PATH);

/** Where stroller `i` of `n` is on the loop at time `t`: evenly spread, walking at their own easy pace. */
export function strollerAt(i: number, n: number, t: number): { at: V2; heading: number } {
  const pace = 0.75 + (i % 3) * 0.12;
  const d = (((i / n) * LOOP_LEN + t * pace) % LOOP_LEN + LOOP_LEN) % LOOP_LEN;
  const at = pointAlongPath(LOOP_PATH, d);
  const ahead = pointAlongPath(LOOP_PATH, Math.min(LOOP_LEN, d + 0.05));
  return { at, heading: Math.atan2(ahead[0] - at[0], ahead[1] - at[1]) };
}

const rnd = (i: number, k: number): number => {
  const x = Math.sin(i * 57.13 + k * 19.91) * 15731.743;
  return x - Math.floor(x);
};

const COBBLE = '#c9bfae';
const FLOWERS = ['#f43f5e', '#f59e0b', '#a855f7', '#fde047', '#fb7185', '#ffffff'];

/** The park's fixed parts. */
function parkParts(): { solid: Part[]; lit: Part[] } {
  const w = PARK.x1 - PARK.x0;
  const d = PARK.z1 - PARK.z0;
  const p: Part[] = [
    box([cx, -0.34, cz], [w, 0.6, d], '#8a7d6b'),
    box([cx, GROUND_Y - 0.004, cz], [w, 0.01, d], '#86bd62'),
    box([(TREE_STRIP.x0 + TREE_STRIP.x1) / 2, -0.34, cz], [TREE_STRIP.x1 - TREE_STRIP.x0, 0.62, d], '#6b8f4e'),
    // A low hedge along the front, by the pavement, with a gap for the path.
    box([PARK.x0 + 1.4, 0.22, PARK.z1 - 0.12], [2.0, 0.5, 0.24], '#3f7d3a'),
    box([PARK.x1 - 2.4, 0.22, PARK.z1 - 0.12], [4.0, 0.5, 0.24], '#3f7d3a'),
  ];
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
  for (const z of SIDE_DOORS_RIGHT) p.push(box([(HX + LOOP.x0) / 2, y + 0.001, z], [LOOP.x0 - HX, 0.01, 1.1], COBBLE));
  // The way in from the street.
  p.push(box([LOOP.x0 + 1.9, y, (LOOP.z1 + PARK.z1) / 2], [0.9, 0.01, PARK.z1 - LOOP.z1], COBBLE));
  // The fountain: a round plaza, a stone basin, water, a central column with two bowls.
  p.push(
    cyl([FOUNTAIN.x, y + 0.001, FOUNTAIN.z], FOUNTAIN.r, FOUNTAIN.r, 0.012, '#d6cfc0', 32),
    cyl([FOUNTAIN.x, 0.18, FOUNTAIN.z], 1.25, 1.32, 0.36, '#cbd5e1', 28),
    cyl([FOUNTAIN.x, 0.3, FOUNTAIN.z], 1.12, 1.12, 0.04, '#38bdf8', 28),
    cyl([FOUNTAIN.x, 0.75, FOUNTAIN.z], 0.12, 0.16, 1.0, '#e2e8f0', 12),
    cyl([FOUNTAIN.x, 1.05, FOUNTAIN.z], 0.55, 0.3, 0.12, '#e2e8f0', 20),
    cyl([FOUNTAIN.x, 1.42, FOUNTAIN.z], 0.3, 0.18, 0.08, '#e2e8f0', 16),
  );
  // Flowerbeds between the benches round the plaza.
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const bx = FOUNTAIN.x + Math.cos(a) * (FOUNTAIN.r + 0.7);
    const bz = FOUNTAIN.z + Math.sin(a) * (FOUNTAIN.r + 0.7);
    // Not on the cross paths: the beds sit off them to one side.
    const ox = Math.abs(Math.cos(a)) > 0.5 ? 0 : 0.95;
    const oz = Math.abs(Math.cos(a)) > 0.5 ? 0.95 : 0;
    for (const e of [-1, 1]) {
      const fx = bx + e * ox;
      const fz = bz + e * oz;
      p.push(box([fx, 0.08, fz], [0.8, 0.16, 0.8], '#7c4a2d'), box([fx, 0.17, fz], [0.72, 0.02, 0.72], '#4d7c0f'));
      for (let n = 0; n < 7; n++) p.push(ball([fx + (rnd(k * 9 + n, e + 2) - 0.5) * 0.6, 0.24, fz + (rnd(k * 9 + n, e + 5) - 0.5) * 0.6], 0.07, FLOWERS[(k + n) % FLOWERS.length]!));
    }
  }
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
  // The picnic corner: a table and two benches under a sun umbrella.
  p.push(
    box([PICNIC.x, 0.62, PICNIC.z], [1.6, 0.06, 0.8], '#a16207'),
    box([PICNIC.x, 0.3, PICNIC.z], [0.1, 0.6, 0.6], '#78350f'),
    box([PICNIC.x, 0.36, PICNIC.z - 0.7], [1.6, 0.05, 0.3], '#a16207'),
    box([PICNIC.x, 0.36, PICNIC.z + 0.7], [1.6, 0.05, 0.3], '#a16207'),
    cyl([PICNIC.x, 1.1, PICNIC.z], 0.025, 0.025, 2.0, '#e2e8f0', 6),
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

/** The water jets of the fountain: thin columns that rise and fall, and a crown of spray from the top bowl. */
function FountainWater() {
  const jets = useRef<Array<Mesh | null>>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    jets.current.forEach((m, i) => {
      if (!m) return;
      const h = 0.35 + 0.12 * Math.sin(t * 3 + i * 1.7);
      m.scale.set(1, h / 0.4, 1);
      m.position.y = (i === 0 ? 1.46 : 0.32) + h / 2;
    });
  });
  const spots: V2[] = [[0, 0], ...Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3) * 0.8, Math.sin((k * Math.PI) / 3) * 0.8] as V2)];
  return (
    <group position={[FOUNTAIN.x, 0, FOUNTAIN.z]} name="park-fountain-water">
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

/** The two swing seats, swinging on the motion clock (still while the bank is paused). */
function Swings() {
  const seats = useRef<Array<Group | null>>([]);
  useFrame(() => {
    seats.current.forEach((g, i) => {
      if (g) g.rotation.x = Math.sin(motion.t * 2.1 + i * 1.4) * 0.55;
    });
  });
  return (
    <>
      {[-0.4, 0.4].map((dx, i) => (
        <group
          key={i}
          ref={(g) => {
            seats.current[i] = g;
          }}
          position={[PLAYGROUND.x - 1.1 + dx, 1.68, PLAYGROUND.z]}
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
        </group>
      ))}
    </>
  );
}

/** People strolling round the loop, on the motion clock. */
function Strollers({ count }: { count: number }) {
  const walkers = useRef<Array<Group | null>>([]);
  const outfit = useWeather((s) => outfitOf(s.weather));
  useFrame(() => {
    walkers.current.forEach((g, i) => {
      if (!g) return;
      const p = strollerAt(i, count, motion.t);
      g.position.set(p.at[0], GROUND_Y, p.at[1]);
      g.rotation.y = p.heading;
    });
  });
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <group
          key={i}
          ref={(g) => {
            walkers.current[i] = g;
          }}
        >
          <CustomerFigure index={i * 17 + 131} shirt={outfitShirt(outfit, i + 7, customerShirt(i * 3 + 11))} phase={i * 2.3} walking scale={0.7} />
        </group>
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
  // Nobody stays out in the rain, the hail or the snow.
  const outdoors = useWeather((s) => !['rain', 'storm', 'hail', 'snow'].includes(s.weather));
  // After the bank closes, its customers spill into the park: more people on the benches and on the paths.
  const evening = useBankStore((s) => afterHours(s.view.minute));
  const sitters = PARK_BENCHES.slice(0, evening ? 4 : 2);
  return (
    <group name="office-park">
      <mesh geometry={ground} material={solid} receiveShadow />
      <mesh geometry={lit} material={glow} />
      <FountainWater />
      <Swings />
      {/* The sun umbrella over the picnic table. */}
      <mesh position={[PICNIC.x, 2.05, PICNIC.z]}>
        <coneGeometry args={[1.25, 0.45, 8, 1, true]} />
        <meshStandardMaterial color="#f97316" roughness={0.6} side={2} />
      </mesh>
      <Sign text="CITY PARK" fg="#ffffff" bg="#15803d" position={[LOOP.x0 + 1.9, 1.35, PARK.z1 - 0.3]} width={1.5} />
      {outdoors &&
        sitters.flatMap((b, k) =>
          [-0.32, 0.32].map((dz, j) => {
            const along = b.facing + Math.PI / 2;
            return (
              <group key={`${k}-${j}`} position={[b.at[0] + Math.sin(along) * dz, 0, b.at[1] + Math.cos(along) * dz]} rotation={[0, b.facing, 0]}>
                <SittingFigure index={k * 11 + j * 5 + 141} shirt={outfitShirt(outfit, k * 2 + j, customerShirt(k * 4 + j + 13))} phase={k * 1.3 + j} />
              </group>
            );
          }),
        )}
      {outdoors && sitters.map((b, k) => <Bubble key={k} kind={k % 2 ? 'thought' : 'speech'} position={[b.at[0], 1.25, b.at[1]]} phase={k} size={0.34} />)}
      {outdoors && <Strollers count={evening ? 5 : 3} />}
    </group>
  );
});
