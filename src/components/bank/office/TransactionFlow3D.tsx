import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import { MeshBasicMaterial, RingGeometry, SphereGeometry, type Group, type Mesh } from 'three';
import { LANES, type V2 } from '../../../engine/plan/layout3d';
import { pathLength, pointAlongPath } from '../../../engine/plan/path';
import { motion } from '../../../engine/simulation/motion';
import { flowBeat, type NodeMode } from '../../../sim/flowBeat';
import type { PlaceId } from '../../../sim/topology';
import { badgeHops, flowIcon, hopSteps, orbArrived, orbProgress, type HopStep } from '../../../sim/transactionPath';
import { useBankStore } from '../../../store/bankStore';
import { useMessages } from '../../../utils/i18nHelper';
import { stpMessages } from '../../ops/stp.messages';
import { placeXZ } from './tour3d';

/**
 * The learner's payment made visible in 3D: one glowing energy orb travelling the wire from its last stop into the station it is
 * at, a floating step badge over the orb (`1. POS Gate ➔ 2. STP Engine ➔ 3. Core Banking`), and a pulsing LED ring round the
 * station only once the orb has reached it (it is being processed there), with who decides there (⚡ STP rules or 👤 a person).
 * Violet for STP, amber for manual. Only the payment's own wires are lit (OfficeScene's Lanes reads transactionPath too).
 */

const TONE: Readonly<Record<NodeMode, string>> = { STP: '#a78bfa', MANUAL: '#fbbf24' };
/** Flyweight: one orb core, one halo, one material each per mode, shared by every hop of every payment. */
const CORE = new SphereGeometry(0.17, 14, 12);
const HALO = new SphereGeometry(0.34, 14, 12);
const CORE_MAT: Readonly<Record<NodeMode, MeshBasicMaterial>> = { STP: new MeshBasicMaterial({ color: '#f5f3ff', toneMapped: false }), MANUAL: new MeshBasicMaterial({ color: '#fffbeb', toneMapped: false }) };
const HALO_MAT: Readonly<Record<NodeMode, MeshBasicMaterial>> = {
  STP: new MeshBasicMaterial({ color: TONE.STP, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }),
  MANUAL: new MeshBasicMaterial({ color: TONE.MANUAL, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }),
};
const RING = new RingGeometry(2.05, 2.3, 48);
const RING_MAT: Readonly<Record<NodeMode, MeshBasicMaterial>> = {
  STP: new MeshBasicMaterial({ color: TONE.STP, transparent: true, opacity: 0.85, toneMapped: false }),
  MANUAL: new MeshBasicMaterial({ color: TONE.MANUAL, transparent: true, opacity: 0.85, toneMapped: false }),
};
const WIRE_Y = 0.42;

/** The wire's points from `from` to `to`: the lane between them (either way round), else a straight line. */
function wire(from: PlaceId, to: PlaceId): readonly V2[] {
  const lane = LANES.find((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from));
  if (!lane) return [placeXZ(from), placeXZ(to)];
  return lane.from === from ? lane.points : [...lane.points].reverse();
}

const BADGE_STYLE = { background: 'rgba(15,23,42,0.86)', boxShadow: '0 0 14px rgba(0,0,0,0.35)' } as const;

/** The hop badge: the stops round the active one, numbered, the active one in the mode's colour. */
function HopBadge({ hops, tone }: { hops: readonly HopStep[]; tone: string }) {
  return (
    <div role="status" data-testid="flow-hop-badge" className="flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold backdrop-blur-md" style={{ ...BADGE_STYLE, borderColor: `${tone}aa` }}>
      {hops.map((h, i) => (
        <span key={h.n} className="flex items-center gap-1" data-hop={h.n} data-state={h.state}>
          {i > 0 && <span className="text-slate-500">➔</span>}
          <span style={{ color: h.state === 'active' ? tone : h.state === 'done' ? '#94a3b8' : '#cbd5e1', fontWeight: h.state === 'active' ? 800 : 600 }}>
            {h.n}. {h.name}
          </span>
        </span>
      ))}
    </div>
  );
}

/** The orb and its badge, crossing the wire into `to` once, on the motion clock (so it stops when the bank pauses), then held at the stop. */
function Orb({ from, to, mode, hops, icon, onArrive }: { from: PlaceId | null; to: PlaceId; mode: NodeMode; hops: readonly HopStep[]; icon: string; onArrive: (arrived: boolean) => void }) {
  const path = useMemo(() => (from ? wire(from, to) : [placeXZ(to)]), [from, to]);
  const len = useMemo(() => pathLength(path), [path]);
  const group = useRef<Group>(null);
  const halo = useRef<Mesh>(null);
  // When the orb left its last stop, on the motion clock; set on the first frame after this hop mounts.
  const start = useRef<number | null>(null);
  const arrived = useRef(false);
  useFrame(() => {
    if (start.current === null) start.current = motion.t;
    const elapsed = from ? motion.t - start.current : Infinity;
    const [x, z] = len > 0 ? pointAlongPath(path, orbProgress(elapsed) * len) : path[0]!;
    group.current?.position.set(x, WIRE_Y, z);
    halo.current?.scale.setScalar(1 + 0.18 * Math.sin(motion.t * 7));
    const now = orbArrived(elapsed);
    if (now !== arrived.current) {
      arrived.current = now;
      onArrive(now);
    }
  });
  return (
    <group ref={group} name="flow-orb" userData={{ from, to, mode }}>
      <mesh geometry={CORE} material={CORE_MAT[mode]} renderOrder={9} />
      <mesh ref={halo} geometry={HALO} material={HALO_MAT[mode]} renderOrder={9} />
      {/* The moving icon: what the payment is (a card from a POS, a box of records at night…), riding the orb along the wire. */}
      <Html position={[0, 0.55, 0]} center zIndexRange={[32, 0]} style={{ pointerEvents: 'none' }}>
        <span data-testid="flow-icon-3d" className="text-[18px] drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]">
          {icon}
        </span>
      </Html>
      <Html position={[0, 1.15, 0]} center zIndexRange={[31, 0]} style={{ pointerEvents: 'none' }}>
        <HopBadge hops={hops} tone={TONE[mode]} />
      </Html>
    </group>
  );
}

function StationPulse({ at, mode, ring }: { at: PlaceId; mode: NodeMode; ring: RefObject<Group> }) {
  const m = useMessages(stpMessages);
  const [x, z] = placeXZ(at);
  useFrame(() => {
    if (ring.current?.visible) ring.current.scale.setScalar(1 + 0.12 * Math.sin(motion.t * 5));
  });
  return (
    <group position={[x, 0.04, z]} name="flow-station-pulse">
      <group ref={ring} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={RING} material={RING_MAT[mode]} />
      </group>
      <Html position={[0, 3.3, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div role="status" data-testid="flow-node-badge-3d" data-mode={mode} className="whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold shadow-lg backdrop-blur-md" style={{ borderColor: `${TONE[mode]}aa`, background: 'rgba(15,23,42,0.82)', color: TONE[mode], boxShadow: `0 0 14px ${TONE[mode]}55` }}>
          {m(`node_${mode}`)}
        </div>
      </Html>
    </group>
  );
}

export function TransactionFlow3D() {
  // Read only where the payment is, so this re-renders when it moves rather than on every beat.
  const key = useBankStore((s) => (s.presetTrace ? `${s.presetTrace.at}|${s.presetTrace.done}|${s.presetTrace.route.join('>')}` : ''));
  const view = useMemo(() => {
    if (!key) return null;
    const [at, done, route] = key.split('|');
    const trace = { route: route!.split('>') as PlaceId[], at: Number(at), done: done === 'true' };
    const beat = flowBeat(trace);
    return beat ? { beat, hops: badgeHops(hopSteps(trace)), icon: flowIcon(trace.route) } : null;
  }, [key]);
  const ring = useRef<Group>(null);
  if (!view) return null;
  const { beat, hops, icon } = view;
  return (
    <group name="transaction-flow" userData={{ route: beat.route }}>
      {/* Keyed by the hop, so each wire's orb starts from its own beginning. */}
      <Orb key={`${beat.from ?? ''}>${beat.at}`} from={beat.from} to={beat.at} mode={beat.mode} hops={hops} icon={icon} onArrive={(on) => ring.current && (ring.current.visible = on)} />
      <StationPulse key={beat.at} at={beat.at} mode={beat.mode} ring={ring} />
    </group>
  );
}
