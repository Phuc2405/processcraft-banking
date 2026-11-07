import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { MeshBasicMaterial, RingGeometry, SphereGeometry, type Group, type Mesh } from 'three';
import { LANES, type V2 } from '../../../engine/plan/layout3d';
import { pathLength, pointAlongPath } from '../../../engine/plan/path';
import { motion } from '../../../engine/simulation/motion';
import { LOADING_BAY, LOADING_DOOR } from '../../../engine/world/citRun';
import { AISLE, BACK_LANE, LANE_EXIT, LOT_SIDE } from '../../../engine/world/parking';
import { nodeMode, type NodeMode } from '../../../sim/flowBeat';
import { travelU, type HopStop } from '../../../sim/hopPlayer';
import type { PlaceId } from '../../../sim/topology';
import { hopPlayerStore, useHopPlayer } from '../../../store/hopPlayerStore';
import { useMessages } from '../../../utils/i18nHelper';
import { stpMessages } from '../../ops/stp.messages';
import { HopBadge, hopTone, useBadgeSteps } from '../HopBadge';
import { placeXZ } from './tour3d';

/**
 * The learner's run in 3D, drawn from the one hop player (sim/hopPlayer.ts) the 2D map reads too. At a stop: a pulsing LED ring and
 * the step badge over it, with who decides there (⚡ STP rules or 👤 a person). Between stops: the badge hides and one glowing orb
 * carries the run's icon along that wire only (a cash run arcs over the floor, peaking at 1.6 m). Violet for STP, amber for a desk,
 * gold for cash.
 */

const MODE_TONE: Readonly<Record<NodeMode, string>> = { STP: '#a78bfa', MANUAL: '#fbbf24' };
/** Flyweight: one orb core, one halo and one ring shape for every hop, and one material per colour. */
const CORE = new SphereGeometry(0.17, 14, 12);
const HALO = new SphereGeometry(0.34, 14, 12);
const RING = new RingGeometry(2.05, 2.3, 48);
const CORE_MAT = new MeshBasicMaterial({ color: '#fffbeb', toneMapped: false });
const MATS = new Map<string, { halo: MeshBasicMaterial; ring: MeshBasicMaterial }>();
const matsOf = (tone: string): { halo: MeshBasicMaterial; ring: MeshBasicMaterial } => {
  let m = MATS.get(tone);
  if (!m) {
    m = { halo: new MeshBasicMaterial({ color: tone, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }), ring: new MeshBasicMaterial({ color: tone, transparent: true, opacity: 0.6, toneMapped: false }) };
    MATS.set(tone, m);
  }
  return m;
};
const WIRE_Y = 0.42;
/** A cash hop's arc peak, metres over the wire: high enough to clear a counter, low enough to stay in the room. */
export const CASH_HOP_PEAK = 1.6;
/** The step badge's height over a stop, metres: just over a standing person and a desk's screens, comfortably in view. */
export const BADGE_Y_3D = 2.3;
/**
 * Where an off-site end (the SBV, a corporate client, HQ) is drawn: on the back lane's exit carriageway, where the van leaves the
 * site (parking.LANE_EXIT). The hop runs there along the van's own drive aisle, so it crosses no parked car, hedge or tree.
 */
export const OFFSITE: V2 = LANE_EXIT;
const DRIVE_AISLE: readonly V2[] = [
  [LOT_SIDE * AISLE, LOADING_BAY.z],
  [LOT_SIDE * AISLE, BACK_LANE.out],
];

/**
 * Where an off-site stop's step badge stands: at the head of the van's drive aisle, inside the car park, where the van turns out
 * of the bay to leave. The exit itself (OFFSITE) lies on the back lane past the edge of the lot, so a badge drawn there runs off the
 * office's frame; the moving icon still runs all the way out.
 */
export const OFFSITE_BADGE: V2 = DRIVE_AISLE[0]!;

/** Where a stop's badge and ring are drawn: its own spot on the floor, or OFFSITE_BADGE for an off-site end. */
export const badgeXZ = (stop: HopStop): V2 => (stop.place || stop.cit === 'BAY' ? stopXZ(stop) : OFFSITE_BADGE);

/** A stop on the floor: its desk, the loading bay, or the way off-site past it. */
export function stopXZ(stop: HopStop): V2 {
  if (stop.place) return placeXZ(stop.place);
  return stop.cit === 'BAY' ? [LOADING_BAY.x, LOADING_BAY.z] : OFFSITE;
}

/** The floor path from one stop to the next: the lane between two desks (either way round), the vault's loading door to the bay, else straight. */
export function hopPath3D(a: HopStop, b: HopStop): V2[] {
  if (a.place && b.place) {
    const [from, to]: [PlaceId, PlaceId] = [a.place, b.place];
    const lane = LANES.find((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from));
    if (lane) return lane.from === from ? [...lane.points] : [...lane.points].reverse();
  }
  const door = (a.cit === 'VAULT' && b.cit === 'BAY') || (a.cit === 'BAY' && b.cit === 'VAULT');
  if (door) return [stopXZ(a), LOADING_DOOR, stopXZ(b)];
  // The bay and an off-site end: out (or in) along the drive aisle and the back lane, as the van drives it.
  if (a.cit === 'BAY' && b.cit && b.cit !== 'VAULT' && !b.place) return [stopXZ(a), ...DRIVE_AISLE, OFFSITE];
  if (b.cit === 'BAY' && a.cit && a.cit !== 'VAULT' && !a.place) return [OFFSITE, ...[...DRIVE_AISLE].reverse(), stopXZ(b)];
  return [stopXZ(a), stopXZ(b)];
}

/** The orb crossing one wire, placed every frame from the player (no re-render per frame). */
function Orb({ from, to, icon, tone, cash }: { from: HopStop; to: HopStop; icon: string; tone: string; cash: boolean }) {
  const path = useMemo(() => hopPath3D(from, to), [from, to]);
  const len = useMemo(() => pathLength(path), [path]);
  const group = useRef<Group>(null);
  const halo = useRef<Mesh>(null);
  useFrame(() => {
    const play = hopPlayerStore.getState().play;
    const u = play ? travelU(play) : 1;
    const [x, z] = pointAlongPath(path, u * len);
    group.current?.position.set(x, WIRE_Y + (cash ? CASH_HOP_PEAK * Math.sin(Math.PI * u) : 0), z);
    halo.current?.scale.setScalar(1 + 0.18 * Math.sin(motion.t * 7));
  });
  return (
    <group ref={group} name="flow-orb" userData={{ from, to }}>
      <mesh geometry={CORE} material={CORE_MAT} renderOrder={9} />
      <mesh ref={halo} geometry={HALO} material={matsOf(tone).halo} renderOrder={9} />
      <Html position={[0, 0.55, 0]} center zIndexRange={[32, 0]} style={{ pointerEvents: 'none' }}>
        <span data-testid="flow-icon-3d" className="text-[18px] drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]">
          {icon}
        </span>
      </Html>
    </group>
  );
}

/** The stop the run stands at: a pulsing ring, the step badge and, at a desk, who decides there. */
function StopMarker({ stop, tone, mode, children }: { stop: HopStop; tone: string; mode: NodeMode | null; children: React.ReactNode }) {
  const m = useMessages(stpMessages);
  const ring = useRef<Group>(null);
  const [x, z] = badgeXZ(stop);
  useFrame(() => ring.current?.scale.setScalar(1 + 0.12 * Math.sin(motion.t * 5)));
  return (
    <group position={[x, 0.04, z]} name="flow-station-pulse">
      <group ref={ring}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={RING} material={matsOf(tone).ring} />
      </group>
      <Html position={[0, BADGE_Y_3D, 0]} center zIndexRange={[31, 0]} style={{ pointerEvents: 'none' }}>
        <div className="flex flex-col items-center gap-1">
          {children}
          {mode && (
            <div role="status" data-testid="flow-node-badge-3d" data-mode={mode} className="whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold shadow-lg backdrop-blur-md" style={{ borderColor: `${MODE_TONE[mode]}aa`, background: 'rgba(15,23,42,0.9)', color: MODE_TONE[mode] }}>
              {m(`node_${mode}`)}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

export function TransactionFlow3D() {
  const session = useHopPlayer((s) => s.session);
  const index = useHopPlayer((s) => s.play?.index ?? -1);
  const phase = useHopPlayer((s) => s.play?.phase ?? null);
  const steps = useBadgeSteps(session, index);
  const stop = session?.stops[index];
  if (!session || !stop || !phase) return null;
  const mode = stop.place ? nodeMode(stop.place) : null;
  const tone = session.kind === 'cit' ? hopTone(session, undefined) : MODE_TONE[mode ?? 'STP'];
  const next = session.stops[index + 1];
  return (
    <group name="transaction-flow" userData={{ id: session.id, index, phase }}>
      {phase === 'travel' && next ? (
        // Keyed by the hop, so each wire's orb starts from its own beginning.
        <Orb key={`${index}`} from={stop} to={next} icon={session.icon} tone={tone} cash={session.kind === 'cit'} />
      ) : (
        <StopMarker key={`${index}`} stop={stop} tone={tone} mode={session.kind === 'payment' ? mode : null}>
          <HopBadge hops={steps} tone={tone} complete={phase === 'final'} />
        </StopMarker>
      )}
    </group>
  );
}
