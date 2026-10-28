import { memo, useEffect, useMemo } from 'react';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { SittingFigure } from './Avatars';
import { Bubble } from './Bubble3D';
import { useMerged } from './Dressing';
import { box, type Part } from './kit';
import { customerShirt, FLOOR_SLAB, STREET } from './layout3d';
import { solid } from './materials';
import { outfitOf, outfitShirt, useWeather } from './weather';

/**
 * The little public parks down both sides of the branch: a lawn, a cobbled walk along it with a crossing path, shade trees
 * (drawn with the other trees, Environment3D) and benches facing the walk, where people sit and chat.
 */

const HX = FLOOR_SLAB.w / 2;
const HZ = FLOOR_SLAB.d / 2;

/** One side's park, as |x| (mirrored on the left) and z. */
export const PARK = {
  x0: HX + 0.4,
  x1: HX + 6.0,
  z0: -HZ - 1,
  z1: STREET.z0,
  walk: { x0: HX + 2.6, x1: HX + 3.8 },
  cross: { z0: -0.6, z1: 0.6 },
  /** The benches, at |x| = bench.x, facing the walk; their middles on z. */
  bench: { x: HX + 4.3, len: 1.4, zs: [-HZ * 0.62, -HZ * 0.18, HZ * 0.42] },
  /** The two rows of shade trees, as |x|. */
  trees: [HX + 1.5, HX + 5.25],
} as const;

/** Who sits on which bench: two friends talking on the first, one person reading on the last. */
export const SITTERS: ReadonlyArray<{ bench: number; dz: number; talking: boolean }> = [
  { bench: 0, dz: -0.34, talking: true },
  { bench: 0, dz: 0.34, talking: true },
  { bench: 2, dz: 0.1, talking: false },
];

const rnd = (i: number, k: number): number => {
  const x = Math.sin(i * 57.13 + k * 19.91) * 15731.743;
  return x - Math.floor(x);
};

function texture(draw: (g: CanvasRenderingContext2D, S: number) => void, rx: number, rz: number): CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (g) draw(g, S);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(rx, rz);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A mown lawn: fresh green in soft stripes. */
const drawLawn = (g: CanvasRenderingContext2D, S: number): void => {
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#8fc46a' : '#86bd62';
    g.fillRect(0, (i * S) / 8, S, S / 8);
  }
  for (let n = 0; n < 500; n++) {
    g.fillStyle = `rgba(60, 110, 40, ${0.12 + rnd(n, 1) * 0.15})`;
    g.fillRect(rnd(n, 2) * S, rnd(n, 3) * S, 1.5, 3);
  }
};

/** Warm cobbles in a running bond. */
const drawCobbles = (g: CanvasRenderingContext2D, S: number): void => {
  g.fillStyle = '#9d948a';
  g.fillRect(0, 0, S, S);
  const n = 8;
  const c = S / n;
  for (let r = 0; r < n; r++)
    for (let k = 0; k <= n; k++) {
      const x = k * c + (r % 2 ? c / 2 : 0) - c / 2;
      g.fillStyle = `hsl(${28 + rnd(r * 13 + k, 4) * 12}, 12%, ${66 + rnd(r * 13 + k, 5) * 12}%)`;
      g.beginPath();
      g.roundRect(x + 2, r * c + 2, c - 4, c - 4, 7);
      g.fill();
    }
};

/** A slatted wooden bench, its seat along z, its back on the far side from the walk (`side` is -1 left, 1 right). */
function benchParts(side: number, z: number): Part[] {
  const x = side * PARK.bench.x;
  const back = x + side * 0.24;
  const wood = '#a16207';
  const iron = '#334155';
  return [
    ...[-0.1, 0, 0.1].map((dx) => box([x + side * dx, 0.34, z], [0.08, 0.04, PARK.bench.len], wood)),
    box([back, 0.6, z], [0.05, 0.12, PARK.bench.len], wood),
    box([back, 0.76, z], [0.05, 0.12, PARK.bench.len], wood),
    ...[-1, 1].flatMap((e) => [box([x, 0.16, z + e * (PARK.bench.len / 2 - 0.1)], [0.36, 0.32, 0.06], iron), box([back, 0.5, z + e * (PARK.bench.len / 2 - 0.1)], [0.05, 0.5, 0.06], iron)]),
  ];
}

export const Park3D = memo(function Park3D() {
  const lawn = useMemo(() => texture(drawLawn, (PARK.x1 - PARK.x0) / 3, (PARK.z1 - PARK.z0) / 3), []);
  const cobble = useMemo(() => texture(drawCobbles, 1, (PARK.z1 - PARK.z0) / 1.2), []);
  const crossTex = useMemo(() => texture(drawCobbles, (PARK.x1 - PARK.x0) / 1.2, 1), []);
  useEffect(
    () => () => {
      lawn.dispose();
      cobble.dispose();
      crossTex.dispose();
    },
    [lawn, cobble, crossTex],
  );
  const benches = useMerged(() => [-1, 1].flatMap((side) => PARK.bench.zs.map((z) => benchParts(side, z)).flat()), []);
  // The ground the park stands on, down to the land, so its edge reads as a raised bed rather than a sheet in the air.
  const plinth = useMerged(() => [-1, 1].map((side) => box([side * ((PARK.x0 + PARK.x1) / 2), -0.34, (PARK.z0 + PARK.z1) / 2], [PARK.x1 - PARK.x0, 0.6, PARK.z1 - PARK.z0], '#8a7d6b')), []);
  const outfit = useWeather((s) => outfitOf(s.weather));
  // Nobody sits out in the rain, the hail or the snow.
  const outdoors = useWeather((s) => !['rain', 'storm', 'hail', 'snow'].includes(s.weather));
  const midX = (PARK.x0 + PARK.x1) / 2;
  const midZ = (PARK.z0 + PARK.z1) / 2;
  return (
    <group name="office-park">
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[side * midX, -0.035, midZ]} receiveShadow name="park-lawn">
            <planeGeometry args={[PARK.x1 - PARK.x0, PARK.z1 - PARK.z0]} />
            <meshStandardMaterial map={lawn} roughness={1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(side * (PARK.walk.x0 + PARK.walk.x1)) / 2, -0.025, midZ]} receiveShadow name="park-walk">
            <planeGeometry args={[PARK.walk.x1 - PARK.walk.x0, PARK.z1 - PARK.z0]} />
            <meshStandardMaterial map={cobble} roughness={0.95} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[side * midX, -0.024, (PARK.cross.z0 + PARK.cross.z1) / 2]} receiveShadow name="park-cross">
            <planeGeometry args={[PARK.x1 - PARK.x0, PARK.cross.z1 - PARK.cross.z0]} />
            <meshStandardMaterial map={crossTex} roughness={0.95} />
          </mesh>
          {outdoors &&
            SITTERS.map((s, i) => {
              const z = PARK.bench.zs[s.bench]! + s.dz;
              // Seated on the bench, facing the walk.
              return (
                <group key={i} position={[side * (PARK.bench.x + 0.04), 0.0, z]} rotation={[0, -side * (Math.PI / 2), 0]}>
                  <SittingFigure index={i * 11 + (side > 0 ? 5 : 0) + 80} shirt={outfitShirt(outfit, i + (side > 0 ? 3 : 0), customerShirt(i * 4 + (side > 0 ? 9 : 2)))} phase={i * 1.3 + side} />
                </group>
              );
            })}
          {outdoors && <Bubble kind={side > 0 ? 'thought' : 'speech'} position={[side * (PARK.bench.x - 0.1), 1.25, PARK.bench.zs[0]!]} phase={side} />}
        </group>
      ))}
      <mesh geometry={benches} material={solid} castShadow name="park-benches" />
      <mesh geometry={plinth} material={solid} receiveShadow name="park-plinth" />
    </group>
  );
});
