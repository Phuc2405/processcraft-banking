import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { BufferGeometry, CircleGeometry, Float32BufferAttribute, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, type Group } from 'three';
import { deskPose } from '../../../engine/plan/layout3d';
import { LOADING_DOOR, VAULT_DOOR } from '../../../engine/world/citRun';
import type { CashEndpoint } from '../../../sim/topology';
import { vaultPost, type CashDir, type VaultCashFlow } from '../../../sim/vaultFlows';
import { useBankStore } from '../../../store/bankStore';
import { useVaultFlows } from '../useVaultFlows';
import { cursor } from './cursor';
import { pickPlace } from './tourHooks';
import { budgeted, GLOW } from './focus3d';
import { ObjectPool } from './webglSafety';

/**
 * The Central Cash Vault in 3D (MAIN_CASH_VAULT): the round steel door is the station. It takes the pointer (raycast hit disc), lights
 * when hovered or selected, glows gold while cash comes in (Dr 1111) and orange while it goes out (Cr 1111), and streams cash
 * particles and a moving 💵 icon along an arc between the door and the endpoint that needs or returns the cash (vaultFlows.ts).
 */

export const VAULT_STATION = 'MAIN_CASH_VAULT' as const;
const TONE: Readonly<Record<CashDir, string>> = { IN: '#facc15', OUT: '#f97316' };

/** What the vault room reads every frame (the wheel's spin): written by the streams, never through React state. */
export const vaultDoorActivity = { active: false };

// The door as a station

const HIT = new CircleGeometry(1.15, 24);
const HIT_MAT = new MeshBasicMaterial({ visible: false });
const HALO = new RingGeometry(1.2, 1.36, 48);
const HALO_MAT = {
  hover: new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, toneMapped: false }),
  selected: new MeshBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.85, toneMapped: false }),
  IN: new MeshBasicMaterial({ color: TONE.IN, transparent: true, opacity: 0.9, toneMapped: false }),
  OUT: new MeshBasicMaterial({ color: TONE.OUT, transparent: true, opacity: 0.9, toneMapped: false }),
} as const;
export type DoorHalo = keyof typeof HALO_MAT | null;

/** The door's ring: cash moving wins (it is what the learner is watching), then selected, then hovered. */
export const doorHalo = (flow: CashDir | null, selected: boolean, hover: boolean): DoorHalo => flow ?? (selected ? 'selected' : hover ? 'hover' : null);

/** The clickable door: a hidden disc over its face that the raycaster hits, opening the vault inspector like any desk. */
export const VaultDoorStation = memo(function VaultDoorStation() {
  const selected = useBankStore((s) => s.selection.kind === 'station' && s.selection.id === VAULT_STATION);
  const setHoverPlace = useBankStore((s) => s.setHoverPlace);
  const flows = useVaultFlows();
  const [hover, setHover] = useState(false);
  const halo = useRef<Mesh>(null);
  const mode = doorHalo(flows[0]?.dir ?? null, selected, hover);
  useEffect(
    () => () => {
      cursor(false);
      setHoverPlace(null);
    },
    [setHoverPlace],
  );
  useFrame(({ clock }) => {
    if (halo.current && mode) halo.current.scale.setScalar(1 + (mode === 'IN' || mode === 'OUT' ? 0.07 * Math.sin(clock.elapsedTime * 6) : 0));
  });
  const click = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    if (e.delta > 4) return;
    pickPlace(VAULT_STATION);
  };
  return (
    <group position={[VAULT_DOOR.x, VAULT_DOOR.y, VAULT_DOOR.z + 0.25]} name="vault-door-station" userData={{ station: VAULT_STATION, halo: mode }}>
      <mesh
        geometry={HIT}
        material={HIT_MAT}
        name="vault-door-hit"
        onClick={click}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          setHoverPlace(VAULT_STATION);
          cursor(true);
        }}
        onPointerOut={() => {
          setHover(false);
          setHoverPlace(null);
          cursor(false);
        }}
      />
      {mode && <mesh ref={halo} geometry={HALO} material={HALO_MAT[mode]} position={[0, 0, 0.08]} />}
    </group>
  );
});

// The cash streams

/** Where each endpoint is on the floor: the teller's counter, the ATM's cash bay, the loading door the CIT crew uses. */
export function endpointXZ(e: CashEndpoint): readonly [number, number] {
  if (e === 'TELLER') return [deskPose('TELLER_CASH').x, deskPose('TELLER_CASH').z];
  if (e === 'ATM') return [deskPose('ATM_CASH').x, deskPose('ATM_CASH').z];
  return LOADING_DOOR;
}

const ARC_STEPS = 32;
/** The arc's height at its middle, in metres: over the counters, well under the ceiling, so a long run to the ATM or the bay stays in the room. */
export const ARC_PEAK = 1.7;
const END_Y = 1.0;

/** The arc from the vault door to an endpoint, `u` = 0 at the door: a low lunge over the desks that peaks at ARC_PEAK halfway. */
export function arcPoint(e: CashEndpoint, u: number): [number, number, number] {
  const [ex, ez] = endpointXZ(e);
  const x0 = VAULT_DOOR.x;
  const z0 = VAULT_DOOR.z + 0.4;
  const base = VAULT_DOOR.y + (END_Y - VAULT_DOOR.y) * u;
  const y = base + 4 * (ARC_PEAK - (VAULT_DOOR.y + END_Y) / 2) * u * (1 - u);
  return [x0 + (ex - x0) * u, y, z0 + (ez - z0) * u];
}

/** Flyweight: one arc line per endpoint, made once for the app's life (the endpoints never move). */
const ARC_LINE: Readonly<Record<CashEndpoint, BufferGeometry>> = (() => {
  const make = (e: CashEndpoint): BufferGeometry => {
    const pts: number[] = [];
    for (let i = 0; i <= ARC_STEPS; i++) pts.push(...arcPoint(e, i / ARC_STEPS));
    return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pts, 3));
  };
  return { TELLER: make('TELLER'), ATM: make('ATM'), BAY: make('BAY') };
})();
/** The idle line is faint; the live one glows just enough ("vừa đủ"), never a neon. */
const LINE_MAT: Readonly<Record<CashDir | 'idle', LineBasicMaterial>> = {
  idle: new LineBasicMaterial({ color: '#a16207', transparent: true, opacity: GLOW.idle, toneMapped: false }),
  IN: new LineBasicMaterial({ color: TONE.IN, transparent: true, opacity: GLOW.live, toneMapped: false }),
  OUT: new LineBasicMaterial({ color: TONE.OUT, transparent: true, opacity: GLOW.live, toneMapped: false }),
};
const SPARK = new SphereGeometry(0.11, 10, 8);
const SPARK_MAT: Readonly<Record<CashDir, MeshBasicMaterial>> = { IN: new MeshBasicMaterial({ color: TONE.IN, toneMapped: false }), OUT: new MeshBasicMaterial({ color: TONE.OUT, toneMapped: false }) };
/** Sparks per live stream (at the GPU budget's density), and at most three streams (one per endpoint): the pool never grows past that. */
export const STREAM_SPARKS = budgeted(6);
export const STREAM_POOL_CAP = STREAM_SPARKS * 3;
const ICON: Readonly<Record<CashEndpoint, string>> = { TELLER: '🧑‍💼', ATM: '🏧', BAY: '🚚' };

/** Where spark `i` of `n` is along a stream at time `t`, 0 at the door: OUT runs door → endpoint, IN endpoint → door. */
export const sparkU = (dir: CashDir, i: number, n: number, t: number): number => {
  const u = (((t * 0.35 + i / n) % 1) + 1) % 1;
  return dir === 'OUT' ? u : 1 - u;
};

/** One live stream: its line lit, its sparks borrowed from the shared pool and handed back when it stops (no GPU allocation per run). */
function Stream({ flow, pool }: { flow: VaultCashFlow; pool: ObjectPool<Mesh> }) {
  const group = useRef<Group>(null);
  const icon = useRef<Group>(null);
  const sparks = useRef<Mesh[]>([]);
  const line = useMemo(() => new Line(ARC_LINE[flow.endpoint], LINE_MAT[flow.dir]), [flow.endpoint, flow.dir]);
  useEffect(() => {
    const g = group.current;
    for (let i = 0; i < STREAM_SPARKS; i++) {
      const m = pool.acquire();
      if (!m) break;
      m.material = SPARK_MAT[flow.dir];
      sparks.current.push(m);
      g?.add(m);
    }
    return () => {
      for (const m of sparks.current) {
        g?.remove(m);
        pool.release(m);
      }
      sparks.current = [];
    };
  }, [pool, flow.dir]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    sparks.current.forEach((m, i) => m.position.set(...arcPoint(flow.endpoint, sparkU(flow.dir, i, sparks.current.length, t))));
    icon.current?.position.set(...arcPoint(flow.endpoint, sparkU(flow.dir, 0, 1, t * 0.6)));
  });
  return (
    <group ref={group} name={`vault-stream-${flow.endpoint}`} userData={{ dir: flow.dir }}>
      <primitive object={line} />
      <group ref={icon}>
        <Html center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
          <div data-testid="vault-cash-icon" data-endpoint={flow.endpoint} data-dir={flow.dir} className="flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-bold" style={{ background: 'rgba(15,23,42,0.85)', color: TONE[flow.dir], boxShadow: `0 0 10px ${TONE[flow.dir]}66` }}>
            💵 <span aria-hidden="true">{flow.dir === 'OUT' ? '→' : '←'}</span> {ICON[flow.endpoint]} <span className="font-mono">{vaultPost(flow.dir)}</span>
          </div>
        </Html>
      </group>
    </group>
  );
}

/** The faint idle lines to every endpoint, and the live streams over them. One pool for every stream of the scene's life, drained on unmount. */
export const VaultCashStreams3D = memo(function VaultCashStreams3D() {
  const flows = useVaultFlows();
  const pool = useMemo(() => new ObjectPool<Mesh>(() => new Mesh(SPARK, SPARK_MAT.OUT), STREAM_POOL_CAP), []);
  // The meshes share the flyweight geometry and materials, which outlive the scene: draining only drops the pool's list.
  useEffect(() => () => pool.drain(), [pool]);
  const idle = useMemo(() => (['TELLER', 'ATM', 'BAY'] as const).map((e) => new Line(ARC_LINE[e], LINE_MAT.idle)), []);
  useEffect(() => {
    vaultDoorActivity.active = flows.length > 0;
  }, [flows]);
  useEffect(() => () => void (vaultDoorActivity.active = false), []);
  const live = new Set(flows.map((f) => f.endpoint));
  return (
    <group name="vault-cash-streams" userData={{ flows: flows.map((f) => `${f.endpoint}:${f.dir}`) }}>
      {idle.map((l, i) => (live.has((['TELLER', 'ATM', 'BAY'] as const)[i]!) ? null : <primitive key={i} object={l} />))}
      {flows.map((f) => (
        <Stream key={`${f.endpoint}:${f.dir}`} flow={f} pool={pool} />
      ))}
    </group>
  );
});
