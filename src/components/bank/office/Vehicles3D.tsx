import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef, useState } from 'react';
import type { Group } from 'three';
import { CustomerFigure, type Wear } from './Avatars';
import { useMerged } from './Dressing';
import { ball, box, shade, tint, type Part } from './kit';
import { customerShirt } from './layout3d';
import { glow, solid } from './materials';
import { outfitOf, outfitShirt, useWeather, type Outfit } from './weather';
import { riderAt, VEHICLES, vehicleAt, type Vehicle } from './vehicles';

/**
 * The traffic on the avenue (vehicles.ts says where everything is): motorbikes, many carrying two, cars, green taxis and
 * the armoured cash van, with the people getting on and off at the kerb. Riders put on their raincoats when it rains.
 */

const WHEEL = '#1f2937';
const GLASS = '#1e293b';
const SKIN = ['#f1c27d', '#e0ac82', '#c68642', '#f5d0b0'];

/** Four boxy wheels under a body `len` long and `w` wide. */
const wheels = (len: number, w: number, r: number): Part[] =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz) => box([sx * (len / 2 - r * 1.3), r, sz * (w / 2 - 0.04)], [r * 2, r * 2, 0.14], WHEEL)));

/** The bodywork of each kind, facing +x. */
function bodyParts(v: Vehicle): { body: Part[]; lights: Part[] } {
  const c = v.color;
  switch (v.kind) {
    case 'motorbike':
      return {
        body: [
          box([0.42, 0.18, 0], [0.34, 0.34, 0.08], WHEEL),
          box([-0.42, 0.18, 0], [0.34, 0.34, 0.08], WHEEL),
          box([0, 0.4, 0], [0.86, 0.2, 0.22], c),
          box([0.36, 0.56, 0], [0.18, 0.3, 0.2], c),
          box([-0.12, 0.55, 0], [0.56, 0.08, 0.24], '#111827'),
          box([0.44, 0.8, 0], [0.05, 0.05, 0.5], '#334155'),
        ],
        lights: [box([0.47, 0.66, 0], [0.04, 0.08, 0.12], '#fff7d6'), box([-0.47, 0.44, 0], [0.03, 0.05, 0.1], '#ef4444')],
      };
    case 'cit':
      // An armoured cash van: a tall steel box with a small cab window, a yellow security band and an amber beacon.
      return {
        body: [
          ...wheels(2.4, 1.05, 0.2),
          box([0, 0.78, 0], [2.4, 1.12, 1.05], c),
          box([0.95, 1.05, 0], [0.48, 0.38, 1.0], GLASS),
          box([-0.25, 0.72, 0], [1.6, 0.14, 1.07], '#facc15'),
          box([-0.25, 1.0, 0], [1.4, 0.06, 1.07], shade(c, 0.35)),
          box([0, 1.36, 0], [2.3, 0.05, 1.0], shade(c, 0.2)),
        ],
        lights: [box([1.21, 0.55, 0.36], [0.03, 0.1, 0.18], '#fff7d6'), box([1.21, 0.55, -0.36], [0.03, 0.1, 0.18], '#fff7d6'), box([0.2, 1.45, 0], [0.22, 0.12, 0.22], '#f59e0b')],
      };
    default: {
      // A saloon car (a taxi has a roof sign and a white band along the side).
      const taxi = v.kind === 'taxi';
      return {
        body: [
          ...wheels(2.0, 0.95, 0.17),
          box([0, 0.36, 0], [2.0, 0.36, 0.95], c),
          box([-0.1, 0.72, 0], [1.08, 0.36, 0.86], tint(c, 0.15)),
          box([-0.1, 0.73, 0], [1.1, 0.26, 0.88], GLASS),
          ...(taxi ? [box([0, 0.42, 0], [1.6, 0.06, 0.97], '#f8fafc'), box([-0.1, 0.96, 0], [0.42, 0.12, 0.2], '#f8fafc')] : []),
        ],
        lights: [
          box([1.01, 0.42, 0.32], [0.02, 0.08, 0.18], '#fff7d6'),
          box([1.01, 0.42, -0.32], [0.02, 0.08, 0.18], '#fff7d6'),
          box([-1.01, 0.42, 0.32], [0.02, 0.08, 0.18], '#ef4444'),
          box([-1.01, 0.42, -0.32], [0.02, 0.08, 0.18], '#ef4444'),
          ...(taxi ? [box([-0.1, 0.96, 0.105], [0.3, 0.07, 0.01], '#22c55e')] : []),
        ],
      };
    }
  }
}

/** Raincoat colours: bright ponchos in the rain. */
const PONCHO = ['#2563eb', '#facc15', '#16a34a', '#e11d48', '#7c3aed'];

/**
 * A rider on a motorbike, at `x` along it: in their own clothes and a helmet, or, in the rain, under a poncho. With
 * `pillion`, the driver's poncho is the big two-person kind that covers the passenger too.
 */
function Rider({ x, index, rain, wide }: { x: number; index: number; rain: boolean; wide: boolean }) {
  const parts = useMemo(() => {
    const skin = SKIN[index % SKIN.length]!;
    const shirt = customerShirt(index * 3 + 1);
    const p: Part[] = [
      box([x + 0.12, 0.6, 0], [0.36, 0.12, 0.28], '#334155'),
      box([x + 0.28, 0.42, 0.1], [0.08, 0.3, 0.08], '#334155'),
      box([x + 0.28, 0.42, -0.1], [0.08, 0.3, 0.08], '#334155'),
      ball([x, 1.15, 0], 0.11, skin),
      ball([x - 0.01, 1.2, 0], 0.13, ['#f8fafc', '#ef4444', '#1d4ed8', '#111827', '#facc15'][index % 5]!, [1, 0.85, 1]),
    ];
    if (rain) {
      // Áo mưa: a poncho down over the knees (over both riders when it is the two-person kind).
      const tone = PONCHO[index % PONCHO.length]!;
      p.push(box([x - (wide ? 0.17 : 0), 0.82, 0], [wide ? 0.78 : 0.42, 0.52, 0.5], tone), box([x - (wide ? 0.17 : 0), 0.56, 0], [wide ? 0.9 : 0.52, 0.06, 0.58], shade(tone, 0.15)));
    } else p.push(box([x, 0.86, 0], [0.24, 0.42, 0.3], shirt), box([x + 0.2, 0.86, 0.17], [0.32, 0.08, 0.08], shirt), box([x + 0.2, 0.86, -0.17], [0.32, 0.08, 0.08], shirt));
    return p;
  }, [x, index, rain, wide]);
  const g = useMerged(() => parts, [parts]);
  return <mesh geometry={g} material={solid} castShadow />;
}

const WEAR: Readonly<Record<Outfit, Wear>> = { everyday: 'none', summer: 'summer', winter: 'winter', rain: 'rain', mask: 'mask', jacket: 'none' };

/** One vehicle, and the person getting on or off it at the kerb. */
function Car({ v, index, clock }: { v: Vehicle; index: number; clock: { t: number } }) {
  const root = useRef<Group>(null);
  const person = useRef<Group>(null);
  const parts = useMemo(() => bodyParts(v), [v]);
  const body = useMerged(() => parts.body, [parts]);
  const lights = useMerged(() => parts.lights, [parts]);
  const outfit = useWeather((s) => outfitOf(s.weather));
  const rain = outfit === 'rain';
  // The pillion passenger is on the back seat until they climb off at the kerb.
  const [aboard, setAboard] = useState(v.pillion);
  const [rider, setRider] = useState<{ walking: boolean; carrying: boolean } | null>(null);
  useFrame(() => {
    const s = vehicleAt(v, clock.t);
    if (root.current) {
      root.current.position.set(s.x, -0.14, s.z);
      root.current.rotation.y = s.heading;
      // A motorbike leans a touch into the pull-in, and everything bobs a little on the move.
      root.current.rotation.x = v.kind === 'motorbike' ? 0.08 * Math.sin(s.pull * Math.PI) : 0;
      root.current.position.y = -0.14 + (s.speed > 0 ? Math.abs(Math.sin(clock.t * 9 + index)) * 0.012 : 0);
    }
    const on = v.pillion && !(v.stop?.kind === 'pillion' && s.sinceStop !== null && s.sinceStop >= 0.6);
    if (on !== aboard) setAboard(on);
    const r = riderAt(v, clock.t);
    if (person.current) {
      person.current.visible = r !== null;
      if (r) {
        person.current.position.set(r.x, 0, r.z);
        person.current.rotation.y = r.heading;
      }
    }
    const look = r ? { walking: r.walking, carrying: r.carrying } : null;
    if ((look === null) !== (rider === null) || (look && rider && (look.walking !== rider.walking || look.carrying !== rider.carrying))) setRider(look);
  });
  const guard = v.kind === 'cit';
  return (
    <>
      <group ref={root} name={`vehicle-${v.id}`}>
        <mesh geometry={body} material={solid} castShadow />
        <mesh geometry={lights} material={glow} />
        {v.kind === 'motorbike' && (
          <>
            <Rider x={0.05} index={index} rain={rain} wide={rain && aboard} />
            {aboard && !rain && <Rider x={-0.3} index={index + 3} rain={false} wide={false} />}
            {aboard && rain && (
              // Under the driver's two-person poncho only the passenger's helmet shows.
              <mesh position={[-0.3, 1.2, 0]}>
                <sphereGeometry args={[0.13, 10, 8]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.5} />
              </mesh>
            )}
          </>
        )}
      </group>
      <group ref={person} visible={false} name={`vehicle-${v.id}-rider`}>
        {rider && (
          <CustomerFigure
            index={index * 5 + 61}
            shirt={guard ? '#1e293b' : outfitShirt(outfit, index + 2, customerShirt(index * 7 + 3))}
            phase={index}
            walking={rider.walking}
            scale={0.7}
            wear={guard ? 'none' : WEAR[outfit]}
          />
        )}
        {rider?.carrying && (
          // The guard's cash box.
          <mesh position={[0.2, 0.42, 0.04]}>
            <boxGeometry args={[0.1, 0.16, 0.26]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.3} />
          </mesh>
        )}
      </group>
    </>
  );
}

/** The whole fleet. Its clock runs only while the canvas draws, like the pedestrians'. */
export const Vehicles3D = memo(function Vehicles3D() {
  const clock = useMemo(() => ({ t: 0 }), []);
  useFrame((_, dt) => {
    clock.t += Math.min(dt, 0.1);
  });
  return (
    <group name="office-traffic">
      {VEHICLES.map((v, i) => (
        <Car key={v.id} v={v} index={i} clock={clock} />
      ))}
    </group>
  );
});
