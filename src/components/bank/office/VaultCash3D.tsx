import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { BufferGeometry, CircleGeometry, Float32BufferAttribute, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, type Group } from 'three';
import { deskPose } from '../../../engine/plan/layout3d';
import { LOADING_DOOR, VAULT_DOOR } from '../../../engine/world/citRun';
import type { CashEndpoint } from '../../../sim/topology';
import { vaultPost, type CashDir, type VaultCashFlow } from '../../../sim/vaultFlows';
import { activeFlowOf, citChildOf, useBankStore } from '../../../store/bankStore';
import { CASH_WIRES, litWires, WIRE_ENDS, type CashWire, type WireNode } from '../../../sim/cashWires';
import { useWireHover } from '../../../store/wireHoverStore';
import { CIT_FLOW } from '../../../types/viewport';
import { useMessages } from '../../../utils/i18nHelper';
import { citMessages, WIRE_LABEL } from '../../ops/cit.messages';
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

/** Each wire's direction, as on the 2D map: Xuất quỹ (Outflow ➔) / Nhập quỹ (Inflow 🡨) at the arc's top, live or (lit) both. */
function WireLabels3D({ flows, route }: { flows: readonly VaultCashFlow[]; route: ReadonlySet<CashWire> | null }) {
  const m = useMessages(citMessages);
  const live = new Map<CashWire, CashDir>(flows.map((f) => [f.endpoint, f.dir]));
  return (
    <>
      {CASH_WIRES.map((e) => {
        const dir = live.get(e) ?? null;
        if (!dir && !route?.has(e)) return null;
        return (
          <Html key={e} position={wirePoint(e, 0.5)} center zIndexRange={[11, 0]} style={{ pointerEvents: 'none' }}>
            <div data-testid={`vault-wire-label-${e}`} data-dir={dir ?? 'both'} className="whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold leading-tight" style={{ background: 'rgba(2,6,23,0.88)', color: dir ? TONE[dir] : '#fde68a', border: `1px solid ${dir ? TONE[dir] : '#fde68a'}66`, opacity: dir ? 1 : 0.85 }}>
              {dir ? m(WIRE_LABEL[dir]) : `${m(WIRE_LABEL.OUT)} · ${m(WIRE_LABEL.IN)}`}
            </div>
          </Html>
        );
      })}
    </>
  );
}

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

/** A wire's end in the room: the vault door's face, or an endpoint at counter height. */
const nodeAt = (n: WireNode): readonly [number, number, number] => (n === 'VAULT' ? [VAULT_DOOR.x, VAULT_DOOR.y, VAULT_DOOR.z + 0.4] : [endpointXZ(n)[0], END_Y, endpointXZ(n)[1]]);

/** Any wire's arc, `u` = 0 at its first end (the vault, for a vault line): a low lunge over the desks that peaks at ARC_PEAK halfway. */
export function wirePoint(w: CashWire, u: number): [number, number, number] {
  const [a, b] = WIRE_ENDS[w];
  const [x0, y0, z0] = nodeAt(a);
  const [x1, y1, z1] = nodeAt(b);
  const base = y0 + (y1 - y0) * u;
  const y = base + 4 * (ARC_PEAK - (y0 + y1) / 2) * u * (1 - u);
  return [x0 + (x1 - x0) * u, y, z0 + (z1 - z0) * u];
}
/** The arc from the vault door to an endpoint, `u` = 0 at the door. */
export const arcPoint = (e: CashEndpoint, u: number): [number, number, number] => wirePoint(e, u);

/** Flyweight: one arc line per wire, made once for the app's life (the endpoints never move). */
const ARC_LINE: Readonly<Record<CashWire, BufferGeometry>> = Object.fromEntries(
  CASH_WIRES.map((w) => {
    const pts: number[] = [];
    for (let i = 0; i <= ARC_STEPS; i++) pts.push(...wirePoint(w, i / ARC_STEPS));
    return [w, new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pts, 3))];
  }),
) as Record<CashWire, BufferGeometry>;
/** The idle line is faint; a lit one (its flow active, or a station it touches hovered) soft gold; the live one glows just enough ("vừa đủ"), never a neon. */
const LINE_MAT: Readonly<Record<CashDir | 'idle' | 'lit', LineBasicMaterial>> = {
  idle: new LineBasicMaterial({ color: '#a16207', transparent: true, opacity: GLOW.idle, toneMapped: false }),
  lit: new LineBasicMaterial({ color: '#facc15', transparent: true, opacity: GLOW.lit, toneMapped: false }),
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

/** Flyweight: the two Line objects (idle, lit) of each wire, shared by every mount; a still wire swaps between them, never allocating. */
type StillLines = Readonly<Record<'idle' | 'lit', Line<BufferGeometry, LineBasicMaterial>>>;
const STILL_LINE = Object.fromEntries(CASH_WIRES.map((w): [CashWire, StillLines] => [w, { idle: new Line(ARC_LINE[w], LINE_MAT.idle), lit: new Line(ARC_LINE[w], LINE_MAT.lit) }])) as Readonly<Record<CashWire, StillLines>>;

/**
 * Every wire (the vault to the teller, the ATM and the CIT bay, and the bay to the teller), still or lit, and the live streams over
 * them. Lit, as on the 2D map: the active flow's wires (03 ATM, 06 teller, 09 all; a picked CIT child its own) and every wire of the
 * hovered station (sim/cashWires.ts). One pool for every stream of the scene's life, drained on unmount.
 */
export const VaultCashStreams3D = memo(function VaultCashStreams3D() {
  const flows = useVaultFlows();
  const pool = useMemo(() => new ObjectPool<Mesh>(() => new Mesh(SPARK, SPARK_MAT.OUT), STREAM_POOL_CAP), []);
  // The meshes share the flyweight geometry and materials, which outlive the scene: draining only drops the pool's list.
  useEffect(() => () => pool.drain(), [pool]);
  useEffect(() => {
    vaultDoorActivity.active = flows.length > 0;
  }, [flows]);
  useEffect(() => () => void (vaultDoorActivity.active = false), []);
  const live = new Set<CashWire>(flows.map((f) => f.endpoint));
  const flow = useBankStore(activeFlowOf);
  const child = useBankStore((s) => (activeFlowOf(s) === CIT_FLOW ? citChildOf(s) : null));
  const hover = useWireHover();
  const route = useMemo(() => litWires(flow, child, hover), [flow, child, hover]);
  return (
    <group name="vault-cash-streams" userData={{ flows: flows.map((f) => `${f.endpoint}:${f.dir}`), lit: route ? [...route] : [] }}>
      <WireLabels3D flows={flows} route={route} />
      {CASH_WIRES.map((w) => (live.has(w) ? null : <primitive key={w} object={STILL_LINE[w][route?.has(w) ? 'lit' : 'idle']} />))}
      {flows.map((f) => (
        <Stream key={`${f.endpoint}:${f.dir}`} flow={f} pool={pool} />
      ))}
    </group>
  );
});
