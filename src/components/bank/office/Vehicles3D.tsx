import { useFrame } from '@react-three/fiber';
import { useWorld } from './WorldProvider';
import { memo, useMemo, useRef, useState } from 'react';
import type { Group } from 'three';
import { CustomerFigure, type Wear } from './Avatars';
import { useMerged } from './Dressing';
import { ball, box, shade, tint, type Part } from './kit';
import { customerShirt } from '../../../engine/plan/layout3d';
import { glow, solid } from './materials';
import { outfitOf, outfitShirt, type Outfit } from '../../../engine/world/weather';
import { useWeather } from './useWeather';
import { MeshBasicMaterial } from 'three';
import { ALIGHT, BUS_DOORS, BUS_X, busRiders, kerbZ, LENGTH, riderAt, WIDTH, VEHICLES, type BusRider, type Vehicle, type VehicleState } from '../../../engine/world/vehicles';
import { Html } from '@react-three/drei';
import { motion } from '../../../engine/simulation/motion';
import { sidewalk } from '../../../engine/world/sidewalk';
import { isClosed } from '../../../engine/world/evacuation';
import { bankStore } from '../../../store/bankStore';

/**
 * The traffic on the avenue (vehicles.ts says where everything is): motorbikes, many carrying two, cars, green taxis and
 * the city bus, with the people getting on and off at the kerb. (The armoured cash van's body is drawn here too, but it
 * drives the lane behind the block to the vault's loading bay: LoadingBay3D.) Riders put on their raincoats when it rains.
 */

const WHEEL = '#1f2937';
/** The amber of an indicator lamp, lit. */
const BLINKER = new MeshBasicMaterial({ color: '#fbbf24', toneMapped: false });
const GLASS = '#1e293b';
const SKIN = ['#f1c27d', '#e0ac82', '#c68642', '#f5d0b0'];

/** Four boxy wheels under a body `len` long and `w` wide. */
const wheels = (len: number, w: number, r: number): Part[] =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz) => box([sx * (len / 2 - r * 1.3), r, sz * (w / 2 - 0.04)], [r * 2, r * 2, 0.14], WHEEL)));

/** The bodywork of each kind, facing +x. */
export function bodyParts(v: Pick<Vehicle, 'kind' | 'color'>): { body: Part[]; lights: Part[] } {
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
    case 'cit': {
      // An armoured cash-in-transit truck: a heavy, tall steel body on big wheels, a small armoured cab window, a bull bar,
      // black-and-yellow hazard chevrons along both flanks and across the back doors, gun-port slits and an amber beacon.
      const chevrons: Part[] = [];
      for (let i = 0; i < 9; i++) for (const zs of [1, -1]) chevrons.push(box([-1.2 + i * 0.24, 0.5, zs * 0.605], [0.12, 0.26, 0.012], i % 2 ? '#111827' : '#facc15', [0.7 * zs, 0, 0]));
      for (let i = 0; i < 5; i++) chevrons.push(box([-1.455, 0.5, -0.48 + i * 0.24], [0.012, 0.26, 0.12], i % 2 ? '#111827' : '#facc15', [0.7, 0, 0]));
      return {
        body: [
          ...wheels(2.8, 1.18, 0.24),
          box([0, 0.95, 0], [2.9, 1.4, 1.2], c),
          box([1.08, 1.32, 0], [0.62, 0.42, 1.14], GLASS),
          box([0.78, 0.95, 0], [0.04, 1.36, 1.22], shade(c, 0.3)),
          box([-0.3, 0.38, 0], [2.3, 0.3, 1.21], shade(c, 0.4)),
          box([-0.3, 1.18, 0], [1.9, 0.07, 1.22], shade(c, 0.35)),
          ...[-0.9, -0.3, 0.3].flatMap((x) => [1, -1].map((zs) => box([x, 1.3, zs * 0.605], [0.22, 0.04, 0.01], '#0f172a'))),
          box([1.5, 0.42, 0], [0.12, 0.22, 1.1], '#475569'),
          box([0, 1.67, 0], [2.8, 0.06, 1.12], shade(c, 0.2)),
          ...chevrons,
        ],
        lights: [
          box([1.46, 0.62, 0.42], [0.03, 0.12, 0.2], '#fff7d6'),
          box([1.46, 0.62, -0.42], [0.03, 0.12, 0.2], '#fff7d6'),
          box([0.2, 1.78, 0], [0.24, 0.14, 0.24], '#f59e0b'),
          box([-1.46, 0.62, 0.42], [0.03, 0.1, 0.16], '#ef4444'),
          box([-1.46, 0.62, -0.42], [0.03, 0.1, 0.16], '#ef4444'),
        ],
      };
    }
    case 'bus': {
      // A city bus: a long, tall body with a band of windows, a lit destination board, and two doors on the kerb side (its +z
      // side: it runs on the near side, facing -x, so its doors' world offsets are mirrored here).
      const windows: Part[] = [];
      for (let i = 0; i < 6; i++) for (const zs of [1, -1]) windows.push(box([-1.75 + i * 0.6, 1.25, zs * 0.605], [0.5, 0.48, 0.012], GLASS));
      return {
        body: [
          ...wheels(4.3, 1.18, 0.24),
          box([0, 1.0, 0], [4.4, 1.5, 1.2], c),
          box([0, 0.42, 0], [4.42, 0.24, 1.22], shade(c, 0.35)),
          box([0, 1.78, 0], [4.3, 0.08, 1.12], tint(c, 0.4)),
          box([2.205, 1.2, 0], [0.012, 0.8, 1.08], GLASS),
          ...windows,
          ...[BUS_DOORS.front, BUS_DOORS.rear].map((dx) => box([-dx, 0.95, 0.607], [0.62, 1.15, 0.014], '#1e293b')),
          ...[BUS_DOORS.front, BUS_DOORS.rear].map((dx) => box([-dx, 0.95, 0.616], [0.02, 1.1, 0.012], '#94a3b8')),
        ],
        lights: [
          box([2.21, 0.58, 0.42], [0.02, 0.1, 0.2], '#fff7d6'),
          box([2.21, 0.58, -0.42], [0.02, 0.1, 0.2], '#fff7d6'),
          box([-2.21, 0.58, 0.42], [0.02, 0.1, 0.2], '#ef4444'),
          box([-2.21, 0.58, -0.42], [0.02, 0.1, 0.2], '#ef4444'),
          box([2.21, 1.62, 0], [0.02, 0.16, 0.8], '#fbbf24'),
        ],
      };
    }
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
export function Rider({ x, index, rain, wide }: { x: number; index: number; rain: boolean; wide: boolean }) {
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
function Car({ v, index, live }: { v: Vehicle; index: number; live: { states: Map<string, VehicleState>; t: number } }) {
  const root = useRef<Group>(null);
  const person = useRef<Group>(null);
  const door = useRef<Group>(null);
  const blinkL = useRef<Group>(null);
  const blinkR = useRef<Group>(null);
  const len = LENGTH[v.kind];
  const wid = WIDTH[v.kind];
  const parts = useMemo(() => bodyParts(v), [v]);
  const body = useMerged(() => parts.body, [parts]);
  const lights = useMerged(() => parts.lights, [parts]);
  const outfit = useWeather((s) => outfitOf(s.weather));
  const rain = outfit === 'rain';
  // The pillion passenger is on the back seat until they climb off at the kerb.
  const [aboard, setAboard] = useState(v.pillion);
  const [rider, setRider] = useState<{ walking: boolean } | null>(null);
  useFrame(() => {
    const s = live.states.get(v.id);
    if (!s) return;
    const clock = live;
    if (root.current) {
      root.current.position.set(s.x, -0.14, s.z);
      root.current.rotation.y = s.heading;
      // A motorbike leans a touch into the pull-in, and everything bobs a little on the move.
      root.current.rotation.x = v.kind === 'motorbike' ? 0.08 * Math.sin(s.pull * Math.PI) : 0;
      root.current.position.y = -0.14 + (s.speed > 0 ? Math.abs(Math.sin(clock.t * 9 + index)) * 0.012 : 0);
    }
    const seated = v.pillion && !(v.stop?.kind === 'pillion' && s.sinceStop !== null && s.sinceStop >= ALIGHT.door);
    if (seated !== aboard) setAboard(seated);
    // The indicator blinks on the side it is moving to (the kerb is always on a vehicle's own +z side).
    const on = Math.floor(live.t * 3) % 2 === 0;
    if (blinkL.current) blinkL.current.visible = s.signal === -1 && on;
    if (blinkR.current) blinkR.current.visible = s.signal === 1 && on;
    // The kerbside door swings open while the taxi stands, and shuts before it pulls away.
    if (door.current) door.current.rotation.y = 1.1 * s.door;
    const r = riderAt(v, s, isClosed(bankStore.getState().view.minute));
    if (person.current) {
      person.current.visible = r !== null;
      if (r) {
        // On the pavement they step aside for others rather than walk into them (sidewalk.ts).
        const [x, z] = sidewalk.place(`rider-${v.id}`, r.x, r.z, motion.dt, !r.walking);
        person.current.position.set(x, 0, z);
        person.current.rotation.y = r.heading;
      } else sidewalk.leave(`rider-${v.id}`);
    }
    const look = r ? { walking: r.walking } : null;
    if ((look === null) !== (rider === null) || (look && rider && look.walking !== rider.walking)) setRider(look);
  });
  return (
    <>
      <group ref={root} name={`vehicle-${v.id}`}>
        <mesh geometry={body} material={solid} castShadow />
        <mesh geometry={lights} material={glow} />
        {/* Indicators: amber lamps at the front and back corners, kerb side (+z) and road side (-z). */}
        {([
          [blinkL, 1],
          [blinkR, -1],
        ] as const).map(([ref, side]) => (
          <group key={side} ref={ref} visible={false}>
            {[-1, 1].map((end) => (
              <mesh key={end} position={[end * (len / 2 + 0.01), v.kind === 'sedan' || v.kind === 'taxi' ? 0.46 : 0.62, side * (wid / 2 - 0.06)]} material={BLINKER}>
                <boxGeometry args={[0.04, 0.07, 0.12]} />
              </mesh>
            ))}
          </group>
        ))}
        {v.kind === 'taxi' && (
          // The rear kerbside door, hinged at its front edge. Taxis stop in the near lane, facing -x, so the kerb is on their +z side.
          <group ref={door} position={[0.25, 0.5, 0.48]}>
            <mesh position={[-0.3, 0, 0]}>
              <boxGeometry args={[0.6, 0.42, 0.04]} />
              <meshStandardMaterial color={v.color} roughness={0.5} />
            </mesh>
          </group>
        )}
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
            shirt={outfitShirt(outfit, index + 2, customerShirt(index * 7 + 3))}
            phase={index}
            walking={rider.walking}
            scale={0.7}
            wear={WEAR[outfit]}
          />
        )}
      </group>
      {v.kind === 'bus' && <BusPeople v={v} index={index} live={live} />}
    </>
  );
}

/**
 * The yellow ▼ over the cash van, bobbing gently: the objective marker that says "follow the cash" wherever it is on its
 * way to the vault. An overlay, so it reads at any zoom.
 */
export function CitMarker() {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (g.current) g.current.position.y = 2.55 + Math.sin(clock.elapsedTime * 3) * 0.08;
  });
  return (
    <group ref={g} position={[0, 2.55, 0]} name="cit-marker">
      <Html center zIndexRange={[11, 0]} style={{ pointerEvents: 'none' }}>
        <div data-testid="cit-marker" className="flex flex-col items-center leading-none" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))' }}>
          <span className="rounded bg-yellow-400 px-1 text-[9px] font-black tracking-wide text-slate-900">CIT</span>
          <span className="text-[22px] text-yellow-400">▼</span>
        </div>
      </Html>
    </group>
  );
}

const BUS_PEOPLE = ['off-0', 'off-1', 'on-0', 'on-1'] as const;

/** The people getting off and on the bus (busRiders), each placed every frame. */
function BusPeople({ v, index, live }: { v: Vehicle; index: number; live: { states: Map<string, VehicleState> } }) {
  const groups = useRef<Array<Group | null>>([]);
  const outfit = useWeather((s) => outfitOf(s.weather));
  const [walking, setWalking] = useState<readonly boolean[]>(() => BUS_PEOPLE.map(() => true));
  useFrame(() => {
    const s = live.states.get(v.id);
    if (!s) return;
    const riders = new Map<string, BusRider>(busRiders(v, s, isClosed(bankStore.getState().view.minute)).map((r) => [r.id, r]));
    let changed = false;
    const next = BUS_PEOPLE.map((id, i) => {
      const g = groups.current[i];
      const r = riders.get(id);
      if (g) {
        g.visible = !!r;
        if (r) {
          const [x, z] = sidewalk.place(`bus-${id}`, r.x, r.z, motion.dt, !r.walking);
          g.position.set(x, 0, z);
          g.rotation.y = r.heading;
        } else sidewalk.leave(`bus-${id}`);
      }
      const w = r ? r.walking : walking[i]!;
      if (w !== walking[i]) changed = true;
      return w;
    });
    if (changed) setWalking(next);
  });
  return (
    <group name={`vehicle-${v.id}-people`}>
      {BUS_PEOPLE.map((id, i) => (
        <group
          key={id}
          ref={(g) => {
            groups.current[i] = g;
          }}
          visible={false}
        >
          <CustomerFigure index={index * 13 + i * 5 + 71} shirt={outfitShirt(outfit, index + i, customerShirt(index * 5 + i * 3))} phase={i * 1.7} walking stride={walking[i] ? 1 : 0} scale={0.7} wear={WEAR[outfit]} />
        </group>
      ))}
    </group>
  );
}

/** The bay painted in the kerb lane: the bus stop's white box. (The cash van's loading bay is behind the vault: LoadingBay3D.) */
function KerbBays() {
  const bays = useMerged(() => {
    const y = -0.128;
    const out: Part[] = [];
    const bay = (x: number, kind: 'bus', color: string, hatch: boolean): void => {
      const len = LENGTH[kind] + 1.0;
      const w = WIDTH[kind] + 0.3;
      const z = kerbZ(kind);
      for (const dz of [-w / 2, w / 2]) out.push(box([x, y, z + dz], [len, 0.006, 0.08], color));
      for (const dx of [-len / 2, len / 2]) out.push(box([x + dx, y, z], [0.08, 0.006, w], color));
      if (hatch) for (let k = -len / 2 + 0.35; k < len / 2 - 0.2; k += 0.45) out.push(box([x + k, y, z], [0.07, 0.006, w * 1.05], color, [0, 0.7, 0]));
    };
    bay(BUS_X, 'bus', '#f8fafc', false);
    return out;
  }, []);
  return <mesh geometry={bays} material={solid} name="kerb-bays" />;
}

/**
 * The whole fleet, drawn from the world engine's TrafficSim (WorldEngine.traffic), which it steps once a frame before the
 * vehicles read where they are. It runs only while the canvas draws, like the pedestrians.
 */
export const Vehicles3D = memo(function Vehicles3D() {
  const live = useWorld().trafficView;
  return (
    <group name="office-traffic">
      <KerbBays />
      {VEHICLES.map((v, i) => (
        <Car key={v.id} v={v} index={i} live={live} />
      ))}
    </group>
  );
});
