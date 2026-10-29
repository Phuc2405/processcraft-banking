import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import type { BufferGeometry, Group, Mesh } from 'three';
import { beatMs, SPEEDS } from '../../../sim/clock';
import { localizeScenarioText } from '../../../sim/scenarios';
import type { Move, PacketKind } from '../../../sim/types';
import { bankStore, useBankStore } from '../../../store/bankStore';
import { CustomerFigure, phaseOf } from './Avatars';
import { box, cyl, merge, shade, tint, type Part } from './kit';
import { arrivalPath, atmBooth, atmExitPath, customerShirt, hopHeight, hopTiming, laneAt, laneLength, packetLane, WALKER_STATIONS, type V2 } from './layout3d';
import { glow } from './materials';
import { PACKET_HEX } from './palette';
import { motion, motionNow } from './motion';
import { sidewalk } from './sidewalk';
import { isClosed } from './evacuation';
import { ATM_STATIONS } from './layout3d';

const MAX_WALKERS = 14;
const HEIGHT = 0.62;
const KINDS = Object.keys(PACKET_HEX) as PacketKind[];

/** How many of each kind can be in the air at once. A busy beat is never bigger than this; the oldest hops are dropped first. */
const POOL: Record<PacketKind, number> = { VIRTUAL: 18, POS: 26, ECOM: 26, BNPL: 18, A2A: 14, ATM: 14, ONBOARD: 8, QR: 14, TELLER: 10, SWIFT: 8, DISPUTE: 6, SETTLEMENT: 18 };

type Shape = 'card' | 'coins' | 'folder' | 'bolt' | 'note';
const SHAPE: Record<PacketKind, Shape> = { VIRTUAL: 'card', POS: 'card', ECOM: 'card', BNPL: 'coins', A2A: 'bolt', ATM: 'note', ONBOARD: 'card', QR: 'bolt', TELLER: 'note', SWIFT: 'bolt', DISPUTE: 'folder', SETTLEMENT: 'folder' };

const GOLD = '#f2c14e';

/**
 * Miniature payments. A card payment is a glowing chip card, a Pay-in-4 is a stack of coin tokens, a settlement is a
 * file folder. Each is a few boxes in the payment's colour.
 */
function packetParts(kind: PacketKind): Part[] {
  const hex = PACKET_HEX[kind];
  switch (SHAPE[kind]) {
    case 'card':
      return [
        box([0, 0, 0], [0.54, 0.045, 0.35], hex),
        box([0, 0.024, -0.1], [0.52, 0.012, 0.07], shade(hex, 0.45)),
        box([-0.16, 0.026, 0.05], [0.1, 0.012, 0.08], GOLD),
        box([0.12, 0.024, 0.1], [0.24, 0.01, 0.025], tint(hex, 0.65)),
        box([0.12, 0.024, 0.06], [0.14, 0.01, 0.02], tint(hex, 0.65)),
      ];
    case 'bolt':
      // An instant transfer: a rounded slab with a yellow bolt across it.
      return [
        box([0, 0, 0], [0.5, 0.05, 0.34], hex),
        box([0, 0.03, 0], [0.4, 0.012, 0.24], shade(hex, 0.35)),
        box([0.05, 0.04, -0.06], [0.1, 0.014, 0.16], '#fde047', [0, 0.5, 0]),
        box([-0.05, 0.04, 0.07], [0.1, 0.014, 0.16], '#fde047', [0, 0.5, 0]),
      ];
    case 'note':
      // A banknote: green, with a lighter band and a round seal.
      return [
        box([0, 0, 0], [0.56, 0.03, 0.3], hex),
        box([0, 0.018, 0], [0.5, 0.008, 0.24], tint(hex, 0.55)),
        cyl([0, 0.026, 0], 0.07, 0.07, 0.01, shade(hex, 0.3), 10),
      ];
    case 'coins':
      return [0, 1, 2].flatMap((i) => [cyl([0, i * 0.05, 0], 0.17, 0.17, 0.045, i % 2 ? shade(hex, 0.15) : hex, 12), cyl([0, i * 0.05 + 0.024, 0], 0.11, 0.11, 0.008, tint(hex, 0.5), 12)]);
    case 'folder':
      return [
        box([0, 0, 0], [0.48, 0.04, 0.35], hex),
        box([-0.14, 0, -0.2], [0.18, 0.04, 0.06], hex),
        box([0, 0.026, 0.01], [0.42, 0.014, 0.28], '#fff7ed'),
        box([0, 0.036, -0.04], [0.3, 0.006, 0.02], '#cbd5e1'),
        box([0, 0.036, 0.03], [0.3, 0.006, 0.02], '#cbd5e1'),
        box([0, 0.036, 0.1], [0.22, 0.006, 0.02], '#cbd5e1'),
      ];
  }
}

interface Flight {
  lane: V2[];
  length: number;
  start: number;
  duration: number;
  /** "☕ Corner Cafe Tap ($4.50)", or '' for a payment with no story (the night cycle). */
  label: string;
  kind: PacketKind;
}

/** How many payments can wear a name tag at once. More than a handful would only hide the office. */
const TAGS = 6;

/** The payments' clock: it stops while the bank is paused, so a payment in flight hangs where it is to be looked at. */
const now = (): number => motionNow();

/**
 * The payments on their way between desks. Every move the simulation reports in a beat becomes a small glowing card,
 * coin stack or folder that flies the wire's lane with its corners rounded by Bezier curves, hopping gently, with the
 * same timing the 2D map gives its tokens. A fixed pool of meshes is reused, so a busy beat costs no allocations.
 */
export const Packets = memo(function Packets() {
  const tick = useBankStore((s) => s.view.tick);
  const flights = useRef<Record<PacketKind, Flight[]>>({ VIRTUAL: [], POS: [], ECOM: [], BNPL: [], A2A: [], ATM: [], ONBOARD: [], QR: [], TELLER: [], SWIFT: [], DISPUTE: [], SETTLEMENT: [] });
  const slots = useRef<Record<PacketKind, Array<Group | null>>>({ VIRTUAL: [], POS: [], ECOM: [], BNPL: [], A2A: [], ATM: [], ONBOARD: [], QR: [], TELLER: [], SWIFT: [], DISPUTE: [], SETTLEMENT: [] });
  const discs = useRef<Record<PacketKind, Array<Mesh | null>>>({ VIRTUAL: [], POS: [], ECOM: [], BNPL: [], A2A: [], ATM: [], ONBOARD: [], QR: [], TELLER: [], SWIFT: [], DISPUTE: [], SETTLEMENT: [] });
  const tagGroups = useRef<Array<Group | null>>([]);
  const tagBoxes = useRef<Array<HTMLDivElement | null>>([]);
  const tagText = useRef<string[]>([]);

  const geometries = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, merge(packetParts(k))])) as Record<PacketKind, BufferGeometry>, []);
  useEffect(
    () => () => {
      for (const g of Object.values(geometries)) g.dispose();
    },
    [geometries],
  );

  useEffect(() => {
    const state = bankStore.getState();
    const moves: readonly Move[] = state.view.moves;
    if (moves.length === 0) return;
    const beat = beatMs(state.view.phase, SPEEDS[state.speedIndex]?.factor ?? 1);
    const t0 = now();
    for (const m of moves) {
      const lane = packetLane(m.edge);
      if (!lane) continue;
      const { delayMs, durationMs } = hopTiming(m.at, beat);
      const list = flights.current[m.kind];
      list.push({ lane, length: laneLength(lane), start: t0 + delayMs, duration: durationMs, label: localizeScenarioText(m.scenario), kind: m.kind });
      if (list.length > POOL[m.kind]) list.splice(0, list.length - POOL[m.kind]);
    }
  }, [tick]);

  useFrame(() => {
    const t = now();
    const tagged: Array<{ x: number; y: number; z: number; label: string; kind: PacketKind }> = [];
    for (const kind of KINDS) {
      const live = flights.current[kind];
      for (let i = live.length - 1; i >= 0; i--) if (t > (live[i] as Flight).start + (live[i] as Flight).duration + 60) live.splice(i, 1);
      const spin = SHAPE[kind] === 'coins';
      for (let i = 0; i < POOL[kind]; i++) {
        const g = slots.current[kind][i];
        if (!g) continue;
        const f = live[i];
        if (!f || t < f.start) {
          g.visible = false;
          continue;
        }
        const u = Math.min(1, (t - f.start) / f.duration);
        const eased = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const p = laneAt(f.lane, f.length * eased);
        const lift = hopHeight(u);
        g.visible = true;
        g.position.set(p.x, HEIGHT + lift, p.z);
        if (f.label && tagged.length < TAGS) tagged.push({ x: p.x, y: HEIGHT + lift + 0.5, z: p.z, label: f.label, kind });
        g.rotation.y = spin ? motion.t * 5 + i : p.heading;
        g.rotation.z = Math.sin(u * Math.PI * 2) * 0.12;
        const d = discs.current[kind][i];
        if (d) {
          d.position.y = 0.035 - g.position.y;
          d.scale.setScalar(1 - lift * 0.9);
        }
      }
    }
    // Name tags ride on the first few payments in flight: what the money is for. "Hover Only" label mode hides them.
    const tags = bankStore.getState().labelMode === 'always' ? tagged : [];
    for (let i = 0; i < TAGS; i++) {
      const g = tagGroups.current[i];
      const box = tagBoxes.current[i];
      if (!g || !box) continue;
      const tag = tags[i];
      if (!tag) {
        if (box.style.display !== 'none') box.style.display = 'none';
        continue;
      }
      g.position.set(tag.x, tag.y, tag.z);
      if (tagText.current[i] !== tag.label) {
        tagText.current[i] = tag.label;
        box.textContent = tag.label;
        box.style.borderColor = PACKET_HEX[tag.kind];
      }
      if (box.style.display !== 'block') box.style.display = 'block';
    }
  });

  return (
    <group name="office-packets">
      {KINDS.map((kind) =>
        Array.from({ length: POOL[kind] }, (_, i) => (
          <group
            key={`${kind}-${i}`}
            ref={(g) => {
              slots.current[kind][i] = g;
            }}
            visible={false}
          >
            <mesh geometry={geometries[kind]} material={glow} castShadow />
            <mesh
              ref={(m) => {
                discs.current[kind][i] = m;
              }}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, -HEIGHT + 0.035, 0]}
            >
              <circleGeometry args={[0.36, 14]} />
              <meshBasicMaterial color={PACKET_HEX[kind]} transparent opacity={0.28} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        )),
      )}
      {Array.from({ length: TAGS }, (_, i) => (
        <group
          key={`tag-${i}`}
          ref={(g) => {
            tagGroups.current[i] = g;
          }}
        >
          <Html center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
            <div
              ref={(el) => {
                tagBoxes.current[i] = el;
              }}
              data-testid="packet-tag"
              style={{ display: 'none' }}
              className="whitespace-nowrap rounded-full border-2 bg-white/95 px-2 py-[1px] text-[10px] font-semibold text-slate-800 shadow-[0_2px_6px_rgba(60,40,20,0.3)]"
            />
          </Html>
        </group>
      ))}
    </group>
  );
});

interface Walk {
  path: V2[];
  length: number;
  /** When they set off (motion-clock seconds), and how fast they walk. */
  start: number;
  pace: number;
  /** The figure that walks it, kept for the whole walk (so nobody swaps looks or jumps when someone else arrives). */
  slot: number;
}

/**
 * How fast customers walk to the desks, on the motion clock: an unhurried pace at 1x (it follows the speed multiplier like
 * everything else). Down the pavement to the ATMs they stroll; into the branch, a little brisker.
 */
export const ARRIVAL_PACE = { atm: 0.85, gate: 1.0 } as const;

/** The first figure of a pool not walking anyone, or -1 when all are busy. */
const freeSlot = (walks: readonly Walk[], size: number): number => {
  for (let i = 0; i < size; i++) if (!walks.some((w) => w.slot === i)) return i;
  return -1;
};

/** Places pooled walkers on their walks at time `t`, steering those on the pavement round each other (sidewalk.ts). */
function placeWalkers(walks: Walk[], pool: Array<Group | null>, prefix: string): void {
  const t = motion.t;
  for (let i = walks.length - 1; i >= 0; i--) if ((t - walks[i]!.start) * walks[i]!.pace > walks[i]!.length) walks.splice(i, 1);
  pool.forEach((g, i) => {
    if (!g) return;
    const w = walks.find((x) => x.slot === i);
    if (!w || t < w.start) {
      g.visible = false;
      sidewalk.leave(`${prefix}-${i}`);
      return;
    }
    const p = laneAt(w.path, (t - w.start) * w.pace);
    const [x, z] = sidewalk.place(`${prefix}-${i}`, p.x, p.z, motion.dt);
    g.visible = true;
    g.position.set(x, 0, z);
    // Face the way they walk; towards the counter on the last leg.
    g.rotation.y = p.heading + Math.PI / 2;
  });
}

/**
 * Customers coming to the desks. Whenever a gate takes in new customers in a beat, a few of them walk in from their cars in
 * the car park, across to the side door in the wall and on to the back of the queue; an ATM's come strolling down the
 * pavement to the booth. (The queue itself is drawn by the desk from the queue length.) Each walks the whole way on one
 * figure at their own unhurried pace; when every figure is out walking, the newest customer simply joins the queue unseen.
 */
export const Arrivals = memo(function Arrivals() {
  const tick = useBankStore((s) => s.view.tick);
  const walks = useRef<Walk[]>([]);
  const pool = useRef<Array<Group | null>>([]);

  useEffect(() => {
    const state = bankStore.getState();
    // Customers walk in at the shop gates and up the pavement to the ATM; a transfer is a message, so its gate sees no one walk in.
    // After closing time customers only come for the sidewalk ATMs.
    const closed = isClosed(state.view.minute);
    for (const id of WALKER_STATIONS) {
      if (closed && !ATM_STATIONS.includes(id)) continue;
      const sv = state.view.stations[id];
      const count = Math.min(2, sv.arrivals);
      for (let k = 0; k < count; k++) {
        const slot = freeSlot(walks.current, MAX_WALKERS);
        if (slot < 0) return;
        const path = arrivalPath(id, sv.queueLength + k);
        const pace = ATM_STATIONS.includes(id) ? ARRIVAL_PACE.atm : ARRIVAL_PACE.gate;
        walks.current.push({ path, length: laneLength(path), start: motion.t + k * 0.9, pace, slot });
      }
    }
  }, [tick]);

  useFrame(() => placeWalkers(walks.current, pool.current, 'arrival'));

  return (
    <group name="office-arrivals">
      {Array.from({ length: MAX_WALKERS }, (_, i) => (
        <group
          key={i}
          ref={(g) => {
            pool.current[i] = g;
          }}
          visible={false}
        >
          <CustomerFigure index={i * 7 + 2} shirt={customerShirt(i)} phase={phaseOf(`walker-${i}`)} walking />
        </group>
      ))}
    </group>
  );
});

/** How many people can be walking away from the ATMs at once, and how fast they go. */
const MAX_LEAVERS = 6;
export const LEAVE_PACE = 0.9;
/** How long someone finishing at the machine takes to put their card and cash away and turn round before walking off. */
export const ATM_TURN_S = 0.8;

/**
 * Customers walking away from the sidewalk ATMs. Each time a machine finishes with someone (its count of the day goes up), that
 * person takes their card and cash, turns round from the panel, walks along the inside of the booth to the gap by the rope,
 * out onto the pavement and off down the street: nobody vanishes at the machine. They walk on the motion clock, so they stop
 * where they are on pause.
 */
export const AtmLeavers = memo(function AtmLeavers() {
  const tick = useBankStore((s) => s.view.tick);
  const walks = useRef<Walk[]>([]);
  const seen = useRef<Partial<Record<string, number>>>({});
  const pool = useRef<Array<Group | null>>([]);

  useEffect(() => {
    const state = bankStore.getState();
    for (const [n, id] of ATM_STATIONS.entries()) {
      const done = state.view.stations[id].stats.processedToday;
      const before = seen.current[id];
      seen.current[id] = done;
      // The first look, and a new day's reset, set nobody walking.
      if (before === undefined || done <= before) continue;
      for (let k = 0; k < Math.min(2, done - before); k++) {
        const slot = freeSlot(walks.current, MAX_LEAVERS);
        if (slot < 0) break;
        // A moment at the machine first (turning round), then off: the walk starts with a short pause at the panel.
        const b = atmBooth(id);
        const kx = (b.x0 + b.x1) / 2;
        const path: V2[] = [[kx, b.head - 0.01], ...atmExitPath(id)];
        walks.current.push({ path, length: laneLength(path), start: motion.t + ATM_TURN_S + k * 1.6 + n * 0.3, pace: LEAVE_PACE, slot });
      }
    }
  }, [tick]);

  useFrame(() => placeWalkers(walks.current, pool.current, 'atm-leaver'));

  return (
    <group name="office-atm-leavers">
      {Array.from({ length: MAX_LEAVERS }, (_, i) => (
        <group
          key={i}
          ref={(g) => {
            pool.current[i] = g;
          }}
          visible={false}
        >
          <CustomerFigure index={i * 11 + 5} shirt={customerShirt(i * 5 + 2)} phase={phaseOf(`atm-leaver-${i}`)} walking />
        </group>
      ))}
    </group>
  );
});
