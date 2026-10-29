import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import type { BufferGeometry, Group } from 'three';
import type { WorkerProfileSeed } from '../../../sim/types';
import { blob, box, cyl, merge, shade, type Part } from './kit';
import { isSlumped, typingRate } from '../../../engine/plan/layout3d';
import { cursor } from './cursor';
import { solid } from './materials';
import { SET } from './palette';
import { motion } from '../../../engine/simulation/motion';

/** A stable number in [0, 2π) from a string, so every avatar breathes out of step with the others. */
export function phaseOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 6283) / 1000;
}

const TIES = ['#e11d48', '#2563eb', '#7c3aed', '#0f766e', '#d97706', '#475569'] as const;
const SKINS = ['#f5d0b0', '#e0ac82', '#c68642', '#8d5524', '#f1c27d', '#a96d3b'] as const;
const HAIRS = ['#1c1917', '#44281a', '#7c4a1d', '#d6b370', '#6b7280', '#111827'] as const;
const TROUSERS = ['#3b4760', '#4b5563', '#6b4f3a', '#334155', '#52525b'] as const;
const pick = <T,>(list: readonly T[], n: number): T => list[Math.abs(Math.trunc(n)) % list.length] as T;

// ─────────────────────────────────────────────────────────────────────────────
// Heads and hair (shared by staff and customers)
// ─────────────────────────────────────────────────────────────────────────────

/** A chibi head with its origin at the base of the neck, facing +z. Four hair styles, chosen by `style`. */
function headParts(skin: string, hair: string, style: number): Part[] {
  const parts: Part[] = [
    blob([0, 0.21, 0], 0.2, skin, [1, 1.02, 1], 1),
    box([-0.2, 0.21, 0], [0.04, 0.07, 0.05], skin),
    box([0.2, 0.21, 0], [0.04, 0.07, 0.05], skin),
    box([-0.075, 0.22, 0.19], [0.04, 0.055, 0.03], '#1f2937'),
    box([0.075, 0.22, 0.19], [0.04, 0.055, 0.03], '#1f2937'),
    box([0, 0.12, 0.195], [0.085, 0.016, 0.02], '#9a3b3b'),
    box([0, 0.175, 0.2], [0.035, 0.045, 0.035], shade(skin, 0.1)),
  ];
  switch (((style % 4) + 4) % 4) {
    case 0: // short
      parts.push(blob([0, 0.28, -0.02], 0.215, hair, [1, 0.78, 1.02]), box([0, 0.34, 0.1], [0.3, 0.05, 0.08], hair));
      break;
    case 1: // long
      parts.push(blob([0, 0.28, -0.02], 0.215, hair, [1, 0.8, 1.02]), box([0, 0.34, 0.1], [0.3, 0.05, 0.08], hair), box([0, 0.13, -0.16], [0.38, 0.36, 0.1], hair));
      break;
    case 2: // bun
      parts.push(blob([0, 0.28, -0.02], 0.215, hair, [1, 0.78, 1.02]), box([0, 0.34, 0.1], [0.3, 0.05, 0.08], hair), blob([0, 0.47, -0.08], 0.08, hair, [1, 1, 1], 1));
      break;
    default: // curly
      parts.push(blob([0, 0.3, -0.02], 0.235, hair, [1, 0.82, 1.04], 1), blob([-0.15, 0.2, -0.05], 0.09, hair), blob([0.15, 0.2, -0.05], 0.09, hair));
  }
  return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Staff: seated at a desk, facing the customers
// ─────────────────────────────────────────────────────────────────────────────

interface StaffRig {
  lower: BufferGeometry;
  upper: BufferGeometry;
  head: BufferGeometry;
  upperArm: BufferGeometry;
  foreArm: BufferGeometry;
}

const staffCache = new Map<string, StaffRig>();

function staffRig(profile: WorkerProfileSeed, look: number, temp: boolean): StaffRig {
  const key = `${profile.skin}|${profile.hair}|${profile.shirt}|${look}|${temp}`;
  const hit = staffCache.get(key);
  if (hit) return hit;
  const { skin, hair, shirt } = profile;
  const trousers = pick(TROUSERS, look);
  const lower = merge([
    box([0, 0.62, -0.02], [0.38, 0.14, 0.3], trousers),
    box([-0.1, 0.61, 0.15], [0.15, 0.13, 0.42], trousers),
    box([0.1, 0.61, 0.15], [0.15, 0.13, 0.42], trousers),
    box([-0.1, 0.33, 0.36], [0.13, 0.4, 0.13], trousers),
    box([0.1, 0.33, 0.36], [0.13, 0.4, 0.13], trousers),
    box([-0.1, 0.07, 0.42], [0.14, 0.08, 0.25], SET.shoes),
    box([0.1, 0.07, 0.42], [0.14, 0.08, 0.25], SET.shoes),
  ]);
  const tie = look % 3 === 0 ? null : pick(TIES, look);
  const upper = merge([
    box([0, 0.25, 0], [0.42, 0.5, 0.26], shirt),
    box([0, 0.02, 0], [0.43, 0.05, 0.27], '#1f2937'),
    box([0, 0.55, 0], [0.1, 0.12, 0.1], skin),
    box([0, 0.47, 0.1], [0.2, 0.05, 0.07], '#ffffff'),
    box([0.12, 0.33, 0.135], [0.07, 0.05, 0.012], '#ffffff'),
    ...(tie ? [box([0, 0.31, 0.138], [0.06, 0.27, 0.02], tie)] : []),
  ]);
  const head = merge([
    ...headParts(skin, hair, look),
    ...(temp ? [cyl([0, 0.42, 0], 0.17, 0.2, 0.07, '#f59e0b', 8), box([0, 0.39, 0.18], [0.24, 0.025, 0.1], '#f59e0b')] : []),
  ]);
  const upperArm = merge([box([0, -0.15, 0], [0.1, 0.3, 0.1], shirt), blob([0, 0, 0], 0.07, shirt, [1, 0.9, 1], 0)]);
  const foreArm = merge([box([0, -0.09, 0], [0.095, 0.18, 0.095], shirt), box([0, -0.22, 0], [0.085, 0.1, 0.085], skin), box([0, -0.3, 0.015], [0.1, 0.05, 0.12], skin)]);
  const rig = { lower, upper, head, upperArm, foreArm };
  staffCache.set(key, rig);
  return rig;
}

const chairCache = new Map<string, BufferGeometry>();

/** An ergonomic office chair: five-star base, gas lift, cushion, curved back, headrest and armrests. */
function chairGeometry(trim: string): BufferGeometry {
  const hit = chairCache.get(trim);
  if (hit) return hit;
  const parts: Part[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push(box([Math.cos(a) * 0.17, 0.07, Math.sin(a) * 0.17], [0.36, 0.035, 0.06], SET.steelDark, [0, -a, 0]));
    parts.push(box([Math.cos(a) * 0.33, 0.04, Math.sin(a) * 0.33], [0.07, 0.07, 0.07], '#1f2937'));
  }
  parts.push(
    cyl([0, 0.3, 0], 0.035, 0.035, 0.46, SET.steel, 6),
    box([0, 0.5, 0.02], [0.54, 0.09, 0.52], SET.chair),
    box([0, 0.84, -0.26], [0.5, 0.52, 0.07], SET.chair, [-0.08, 0, 0]),
    box([0, 0.74, -0.215], [0.4, 0.13, 0.04], trim, [-0.08, 0, 0]),
    box([0, 1.2, -0.29], [0.3, 0.15, 0.06], SET.chair, [-0.08, 0, 0]),
  );
  for (const side of [-1, 1]) parts.push(box([side * 0.29, 0.7, 0.0], [0.05, 0.04, 0.34], SET.chairTrim), box([side * 0.29, 0.6, -0.08], [0.04, 0.18, 0.04], SET.chairTrim));
  const g = merge(parts);
  chairCache.set(trim, g);
  return g;
}

interface SeatedProps {
  id: string;
  profile: WorkerProfileSeed;
  working: boolean;
  /** 0 fresh, 100 spent. */
  fatigue: number;
  /** 0-1: how much of a fresh person's pace they have left. */
  productivity: number;
  /** 0-1: how hard the desk is being pushed (a long queue, a warning light). */
  surge: number;
  temp: boolean;
  /** The department's colour, for the trim on the chair. */
  accent: string;
  selected: boolean;
  onSelect: () => void;
}

const HIP = 0.62;
const SHOULDER = 0.44;

/**
 * A low-poly member of staff in an office chair, facing the customers.
 *
 * They always type: lazily and with an idle head bob when there is nothing to do, briskly when they are working, and
 * frantically when the desk is in a surge. Spent (fatigue above 80) they slump: the shoulders drop, the head falls
 * forward and the hands barely move.
 */
export const SeatedAvatar = memo(function SeatedAvatar({ id, profile, working, fatigue, productivity, surge, temp, accent, selected, onSelect }: SeatedProps) {
  const seed = useMemo(() => phaseOf(id), [id]);
  const look = useMemo(() => Math.floor(seed * 100), [seed]);
  const rig = useMemo(() => staffRig(profile, look, temp), [profile, look, temp]);
  const chair = useMemo(() => chairGeometry(accent), [accent]);

  const swivel = useRef<Group>(null);
  const upper = useRef<Group>(null);
  const head = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const foreL = useRef<Group>(null);
  const foreR = useRef<Group>(null);

  useFrame(() => {
    // On the motion clock: the hands stop when the bank is paused, and tap faster when it runs faster.
    const t = motion.t + seed;
    const slumped = isSlumped(fatigue);
    const rate = typingRate({ working, productivity, surge, fatigue });
    const amp = slumped ? 0.012 : working ? 0.07 + 0.05 * surge : 0.03;
    // Two interleaved waves, so the hands do not tap in lockstep.
    const wl = Math.sin(t * rate) + 0.4 * Math.sin(t * rate * 1.9);
    const wr = Math.sin(t * rate + 2.4) + 0.4 * Math.sin(t * rate * 1.7 + 1);

    const reachUpper = slumped ? -0.25 : -0.59;
    const reachFore = slumped ? -0.55 : -1.32;
    if (armL.current) armL.current.rotation.x = reachUpper + wl * amp * 0.35;
    if (armR.current) armR.current.rotation.x = reachUpper + wr * amp * 0.35;
    if (foreL.current) foreL.current.rotation.x = reachFore + wl * amp;
    if (foreR.current) foreR.current.rotation.x = reachFore + wr * amp;

    if (upper.current) {
      const target = slumped ? 0.3 : working ? 0.05 + 0.05 * surge : 0.0;
      upper.current.rotation.x += (target - upper.current.rotation.x) * 0.08;
      upper.current.scale.y = 1 + Math.sin(t * 1.8) * 0.01;
    }
    if (head.current) {
      // Idle: a slow bob and a look about. Working: nods along with the typing. Spent: chin on chest.
      const nod = slumped ? 0.55 + Math.sin(t * 0.7) * 0.03 : working ? 0.1 + Math.sin(t * rate * 0.5) * (0.05 + 0.03 * surge) : Math.sin(t * 1.15) * 0.06;
      head.current.rotation.x += (nod - head.current.rotation.x) * 0.15;
      head.current.rotation.y = slumped ? Math.sin(t * 0.3) * 0.1 : working ? Math.sin(t * 0.5) * 0.14 : Math.sin(t * 0.45) * 0.38;
      head.current.rotation.z = slumped ? 0.12 : 0;
    }
    if (swivel.current) swivel.current.rotation.y = working ? Math.sin(t * 0.35) * 0.05 : Math.sin(t * 0.4) * 0.22;
  });

  const click = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    if (e.delta > 4) return;
    onSelect();
  };

  return (
    <group>
      <group ref={swivel}>
        <mesh geometry={chair} material={solid} castShadow receiveShadow />
        <mesh geometry={rig.lower} material={solid} castShadow receiveShadow />
        <group ref={upper} position={[0, HIP, -0.02]}>
          <mesh geometry={rig.upper} material={solid} castShadow />
          <group ref={head} position={[0, 0.6, 0]}>
            <mesh geometry={rig.head} material={solid} castShadow />
          </group>
          {([-1, 1] as const).map((side) => (
            <group key={side} ref={side < 0 ? armL : armR} position={[side * 0.27, SHOULDER, 0]}>
              <mesh geometry={rig.upperArm} material={solid} castShadow />
              <group ref={side < 0 ? foreL : foreR} position={[0, -0.3, 0]}>
                <mesh geometry={rig.foreArm} material={solid} castShadow />
              </group>
            </group>
          ))}
        </group>
      </group>

      {/* An invisible box around the person: it catches the pointer without testing every facet. */}
      <mesh
        visible={false}
        position={[0, 0.8, 0]}
        onClick={click}
        onPointerOver={(e) => {
          e.stopPropagation();
          cursor(true);
        }}
        onPointerOut={() => {
          cursor(false);
        }}
      >
        <boxGeometry args={[0.8, 1.7, 0.9]} />
      </mesh>

      {selected && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.46, 0.58, 28]} />
          <meshBasicMaterial color="#0ea5e9" />
        </mesh>
      )}
    </group>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Customers
// ─────────────────────────────────────────────────────────────────────────────

interface WalkerRig {
  body: BufferGeometry;
  leg: BufferGeometry;
  arm: BufferGeometry;
}

const walkerCache = new Map<string, WalkerRig>();
const standerCache = new Map<string, BufferGeometry>();

function customerLook(index: number): { skin: string; hair: string; trousers: string; style: number } {
  return { skin: pick(SKINS, index), hair: pick(HAIRS, index * 3 + 1), trousers: pick(TROUSERS, index * 5 + 2), style: index };
}

/** A customer in one piece, standing with arms by their sides. One mesh, so a long queue costs almost nothing. */
function standerGeometry(index: number, shirt: string): BufferGeometry {
  const { skin, hair, trousers, style } = customerLook(index);
  const key = `${skin}|${hair}|${trousers}|${style % 4}|${shirt}`;
  const hit = standerCache.get(key);
  if (hit) return hit;
  const parts: Part[] = [
    box([-0.1, 0.25, 0], [0.16, 0.5, 0.18], trousers),
    box([0.1, 0.25, 0], [0.16, 0.5, 0.18], trousers),
    box([-0.1, 0.03, 0.03], [0.16, 0.07, 0.24], SET.shoes),
    box([0.1, 0.03, 0.03], [0.16, 0.07, 0.24], SET.shoes),
    box([0, 0.78, 0], [0.42, 0.46, 0.25], shirt),
    box([-0.27, 0.74, 0], [0.1, 0.4, 0.12], shirt),
    box([0.27, 0.74, 0], [0.1, 0.4, 0.12], shirt),
    box([-0.27, 0.5, 0.01], [0.09, 0.08, 0.1], skin),
    box([0.27, 0.5, 0.01], [0.09, 0.08, 0.1], skin),
    box([0, 1.04, 0], [0.1, 0.1, 0.1], skin),
  ];
  const head = headParts(skin, hair, style).map((p) => ({ ...p, geometry: p.geometry.translate(0, 1.0, 0) }));
  const g = merge([...parts, ...head]);
  standerCache.set(key, g);
  return g;
}

function walkerRig(index: number, shirt: string): WalkerRig {
  const { skin, hair, trousers, style } = customerLook(index);
  const key = `${skin}|${hair}|${trousers}|${style % 4}|${shirt}`;
  const hit = walkerCache.get(key);
  if (hit) return hit;
  const body = merge([
    box([0, 0.78, 0], [0.42, 0.46, 0.25], shirt),
    box([0, 1.04, 0], [0.1, 0.1, 0.1], skin),
    box([0, 0.55, -0.16], [0.26, 0.3, 0.1], pick(['#f59e0b', '#38bdf8', '#a78bfa', '#fb7185'], index)),
    ...headParts(skin, hair, style).map((p) => ({ ...p, geometry: p.geometry.translate(0, 1.0, 0) })),
  ]);
  const leg = merge([box([0, -0.25, 0], [0.16, 0.5, 0.18], trousers), box([0, -0.47, 0.03], [0.16, 0.07, 0.24], SET.shoes)]);
  const arm = merge([box([0, -0.2, 0], [0.1, 0.4, 0.12], shirt), box([0, -0.43, 0.01], [0.09, 0.08, 0.1], skin)]);
  const rig = { body, leg, arm };
  walkerCache.set(key, rig);
  return rig;
}

/** What a passer-by has on over their clothes, for the weather: a beanie and scarf, sunglasses, or a raincoat hood. */
export type Wear = 'none' | 'winter' | 'summer' | 'rain' | 'mask' | 'guard';

interface CustomerProps {
  index: number;
  shirt: string;
  /** Animation offset, so a queue does not sway as one. */
  phase?: number;
  walking?: boolean;
  scale?: number;
  wear?: Wear;
  /** How far the right arm is raised overhead (holding an umbrella, waving a car in), 0-1, read every frame. */
  raise?: { current: number };
  /** How far the legs swing when walking, 0-1: 0 stands still (a guard waving cars in). Read every frame when a ref, for
   * someone who stands a while and then walks off. */
  stride?: number | { current: number };
  /** How quick the steps are: 1 a walk, more a run (quicker, longer strides and a lean into it). */
  tempo?: number;
}

const WEAR_TONES = ['#b91c1c', '#1d4ed8', '#047857', '#7c2d12', '#6d28d9', '#be185d'];

/** The weather's extras on a figure, in the figure's own units (its head sits at about 1.21). */
function Wearables({ wear, index }: { wear: Wear; index: number }) {
  if (wear === 'none') return null;
  const tone = WEAR_TONES[index % WEAR_TONES.length]!;
  if (wear === 'guard')
    // A security guard's peaked cap, with its badge.
    return (
      <group>
        <mesh position={[0, 1.37, -0.01]}>
          <cylinderGeometry args={[0.2, 0.22, 0.12, 12]} />
          <meshStandardMaterial color="#1e293b" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.32, 0.17]} rotation={[0.35, 0, 0]}>
          <boxGeometry args={[0.3, 0.03, 0.16]} />
          <meshStandardMaterial color="#0f172a" roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.38, 0.2]}>
          <boxGeometry args={[0.07, 0.06, 0.02]} />
          <meshStandardMaterial color="#facc15" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    );
  if (wear === 'mask')
    // A face mask over the nose and mouth, its straps round to the ears.
    return (
      <group>
        <mesh position={[0, 1.15, 0.19]}>
          <boxGeometry args={[0.24, 0.12, 0.05]} />
          <meshStandardMaterial color={index % 3 === 0 ? '#bfdbfe' : '#f8fafc'} roughness={0.9} />
        </mesh>
        <mesh position={[0, 1.2, 0.02]}>
          <boxGeometry args={[0.42, 0.015, 0.34]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.9} />
        </mesh>
      </group>
    );
  if (wear === 'summer')
    return (
      <mesh position={[0, 1.235, 0.205]}>
        <boxGeometry args={[0.3, 0.06, 0.03]} />
        <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.4} />
      </mesh>
    );
  if (wear === 'rain')
    return (
      <mesh position={[0, 1.27, -0.04]}>
        <sphereGeometry args={[0.25, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
        <meshStandardMaterial color="#facc15" roughness={0.45} />
      </mesh>
    );
  return (
    <group>
      <mesh position={[0, 1.36, -0.01]}>
        <sphereGeometry args={[0.235, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={tone} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.6, -0.01]}>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.06, 0]}>
        <boxGeometry args={[0.32, 0.1, 0.3]} />
        <meshStandardMaterial color={tone} roughness={0.9} />
      </mesh>
      <mesh position={[0.1, 0.92, 0.14]}>
        <boxGeometry args={[0.08, 0.22, 0.04]} />
        <meshStandardMaterial color={tone} roughness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * A customer. Smaller than the staff so a queue reads as a crowd at the front of a counter. Standing, they shift their
 * weight; walking, their legs and arms swing and they bob along.
 */
export const CustomerFigure = memo(function CustomerFigure({ index, shirt, phase = 0, walking = false, scale = 0.72, wear = 'none', raise, stride = 1, tempo = 1 }: CustomerProps) {
  return walking ? (
    <Walker index={index} shirt={shirt} phase={phase} scale={scale} wear={wear} raise={raise} stride={stride} tempo={tempo} />
  ) : (
    <Stander index={index} shirt={shirt} phase={phase} scale={scale} wear={wear} />
  );
});

type FigureProps = Required<Omit<CustomerProps, 'walking' | 'raise' | 'stride' | 'tempo'>> & { raise?: { current: number }; stride?: CustomerProps['stride']; tempo?: number };

/**
 * Someone sitting (on a park bench), facing +z: knees forward, hands in the lap, rocking gently as they talk. The seat is
 * at 0.48 in the figure's own units.
 */
export const SittingFigure = memo(function SittingFigure({ index, shirt, phase = 0, scale = 0.7, wear = 'none' }: Omit<CustomerProps, 'walking' | 'raise'>) {
  const geometry = useMemo(() => {
    const { skin, hair, trousers, style } = customerLook(index);
    return merge([
      ...[-0.1, 0.1].flatMap((x) => [
        box([x, 0.5, 0.16], [0.16, 0.14, 0.38], trousers),
        box([x, 0.25, 0.33], [0.15, 0.46, 0.16], trousers),
        box([x, 0.03, 0.38], [0.16, 0.07, 0.24], SET.shoes),
      ]),
      box([0, 0.8, -0.02], [0.42, 0.46, 0.25], shirt),
      box([-0.24, 0.66, 0.12], [0.1, 0.12, 0.36], shirt),
      box([0.24, 0.66, 0.12], [0.1, 0.12, 0.36], shirt),
      box([0, 0.62, 0.28], [0.3, 0.08, 0.1], skin),
      box([0, 1.06, 0], [0.1, 0.1, 0.1], skin),
      ...headParts(skin, hair, style).map((p) => ({ ...p, geometry: p.geometry.translate(0, 1.02, 0) })),
    ]);
  }, [index, shirt]);
  const root = useRef<Group>(null);
  useFrame(() => {
    if (root.current) root.current.rotation.x = Math.sin(motion.t * 1.1 + phase) * 0.03;
  });
  return (
    <group scale={scale}>
      <group ref={root}>
        <mesh geometry={geometry} material={solid} castShadow />
        <group position={[0, 0.02, 0]}>
          <Wearables wear={wear} index={index} />
        </group>
      </group>
    </group>
  );
});

function Stander({ index, shirt, phase, scale, wear }: Omit<FigureProps, 'raise' | 'stride'>) {
  const geometry = useMemo(() => standerGeometry(index, shirt), [index, shirt]);
  const root = useRef<Group>(null);
  useFrame(() => {
    const t = motion.t + phase;
    if (!root.current) return;
    root.current.rotation.z = Math.sin(t * 1.3) * 0.025;
    root.current.position.y = Math.abs(Math.sin(t * 0.65)) * 0.012;
  });
  return (
    <group scale={scale}>
      <group ref={root}>
        <mesh geometry={geometry} material={solid} castShadow />
        <Wearables wear={wear} index={index} />
      </group>
    </group>
  );
}

function Walker({ index, shirt, phase, scale, wear, raise, stride = 1, tempo = 1 }: FigureProps) {
  const rig = useMemo(() => walkerRig(index, shirt), [index, shirt]);
  const root = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  useFrame(() => {
    // The stride follows the motion clock, so legs swing in step with how fast the person moves (and stop on pause).
    // A run: quicker steps, a longer swing and a lean forward into it.
    const t = motion.t * 9 * tempo + phase;
    const swing = Math.sin(t) * (typeof stride === 'number' ? stride : stride.current) * Math.min(1.5, tempo);
    if (root.current) {
      root.current.position.y = Math.abs(swing) * 0.06;
      root.current.rotation.x = tempo > 1 ? 0.18 : 0;
    }
    if (legL.current) legL.current.rotation.x = swing * 0.7;
    if (legR.current) legR.current.rotation.x = -swing * 0.7;
    if (armL.current) armL.current.rotation.x = -swing * 0.55;
    // An umbrella held up: the right arm rises from its swing to straight up and a little forward.
    const up = raise?.current ?? 0;
    if (armR.current) armR.current.rotation.x = swing * 0.55 * (1 - up) - 2.7 * up;
  });
  return (
    <group scale={scale}>
      <group ref={root}>
        <mesh geometry={rig.body} material={solid} castShadow />
        <group ref={legL} position={[-0.1, 0.5, 0]}>
          <mesh geometry={rig.leg} material={solid} castShadow />
        </group>
        <group ref={legR} position={[0.1, 0.5, 0]}>
          <mesh geometry={rig.leg} material={solid} castShadow />
        </group>
        <group ref={armL} position={[-0.27, 0.95, 0]}>
          <mesh geometry={rig.arm} material={solid} castShadow />
        </group>
        <group ref={armR} position={[0.27, 0.95, 0]}>
          <mesh geometry={rig.arm} material={solid} castShadow />
        </group>
        <Wearables wear={wear} index={index} />
      </group>
    </group>
  );
}
