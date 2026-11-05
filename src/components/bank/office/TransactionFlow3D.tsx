import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { MeshBasicMaterial, SphereGeometry, type Group, type Mesh } from 'three';
import { LANES, type V2 } from '../../../engine/plan/layout3d';
import { pathLength, pointAlongPath } from '../../../engine/plan/path';
import { flowBeat, type NodeMode } from '../../../sim/flowBeat';
import type { PlaceId } from '../../../sim/topology';
import { useBankStore } from '../../../store/bankStore';
import { useMessages } from '../../../utils/i18nHelper';
import { stpMessages } from '../../ops/stp.messages';
import { placeXZ } from './tour3d';

/**
 * The learner's payment made visible in 3D: glowing packets travelling the wire into the station it is at, a pulsing LED ring
 * round that station, and a floating badge saying who decides there (⚡ STP rules or 👤 a person). Violet for STP, amber for manual.
 */

const TONE: Readonly<Record<NodeMode, string>> = { STP: '#a78bfa', MANUAL: '#fbbf24' };
/** Flyweight: one packet sphere and one material per mode, shared by every packet. */
const PACKET = new SphereGeometry(0.13, 12, 10);
const PACKET_MAT: Readonly<Record<NodeMode, MeshBasicMaterial>> = { STP: new MeshBasicMaterial({ color: TONE.STP, toneMapped: false }), MANUAL: new MeshBasicMaterial({ color: TONE.MANUAL, toneMapped: false }) };
const PACKETS = 5;
const WIRE_Y = 0.42;

/** The wire's points from `from` to `to`: the lane between them (either way round), else a straight line. */
function wire(from: PlaceId, to: PlaceId): readonly V2[] {
  const lane = LANES.find((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from));
  if (!lane) return [placeXZ(from), placeXZ(to)];
  return lane.from === from ? lane.points : [...lane.points].reverse();
}

function Packets({ from, to, mode }: { from: PlaceId; to: PlaceId; mode: NodeMode }) {
  const path = useMemo(() => wire(from, to), [from, to]);
  const len = useMemo(() => pathLength(path), [path]);
  const dots = useRef<Array<Mesh | null>>([]);
  useFrame(({ clock }) => {
    dots.current.forEach((m, i) => {
      if (!m) return;
      const u = (clock.elapsedTime * 0.45 + i / PACKETS) % 1;
      const [x, z] = pointAlongPath(path, u * len);
      m.position.set(x, WIRE_Y, z);
      m.scale.setScalar(0.7 + 0.5 * Math.sin(u * Math.PI));
    });
  });
  return (
    <group name="flow-packets" userData={{ from, to, mode }}>
      {Array.from({ length: PACKETS }, (_, i) => (
        <mesh key={i} ref={(m) => (dots.current[i] = m)} geometry={PACKET} material={PACKET_MAT[mode]} />
      ))}
    </group>
  );
}

function StationPulse({ at, mode }: { at: PlaceId; mode: NodeMode }) {
  const m = useMessages(stpMessages);
  const ring = useRef<Group>(null);
  const [x, z] = placeXZ(at);
  useFrame(({ clock }) => {
    if (ring.current) ring.current.scale.setScalar(1 + 0.12 * Math.sin(clock.elapsedTime * 5));
  });
  return (
    <group position={[x, 0.04, z]} name="flow-station-pulse">
      <group ref={ring}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.05, 2.3, 48]} />
          <meshBasicMaterial color={TONE[mode]} transparent opacity={0.85} toneMapped={false} />
        </mesh>
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
  const beat = useMemo(() => {
    if (!key) return null;
    const [at, done, route] = key.split('|');
    return flowBeat({ route: route!.split('>') as PlaceId[], at: Number(at), done: done === 'true' });
  }, [key]);
  if (!beat) return null;
  return (
    <group name="transaction-flow" userData={{ route: beat.route }}>
      {beat.from && <Packets from={beat.from} to={beat.at} mode={beat.mode} />}
      <StationPulse at={beat.at} mode={beat.mode} />
    </group>
  );
}
