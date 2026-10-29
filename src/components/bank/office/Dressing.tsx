import { LOADING_DOOR } from '../../../engine/world/citRun';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, type DependencyList } from 'react';
import { CanvasTexture, SRGBColorSpace, type BufferGeometry, type Group, type Mesh } from 'three';
import type { ExternalId } from '../../../sim/topology';
import { bankStore, useBankStore } from '../../../store/bankStore';
import { useTourLit } from './tourHooks';
import { useTerms } from '../useTerms';
import { ball, blob, box, cyl, merge, ring, rope, shade, tint, xform, type Part, type V3 } from './kit';
import {
  ENTRANCES,
  FLOOR_SLAB,
  MAIN_GATE,
  SIDE_DOOR_W,
  SIDE_DOORS_RIGHT,
  KERB_H,
  LANES,
  PLANTS,
  ROPED_QUEUES,
  SERVER_ROOM,
  WALL_H,
  WALL_T,
  WALL_WINDOWS,
  deskPose,
  frontPlinth,
  kioskPose,
  partition,
  stanchionLine,
  vaultRoom,
  type PlantKind,
  type Rect,
  type WallSide,
} from '../../../engine/plan/layout3d';
import { blobMaterial, glow, pane, satin, solid } from './materials';
import { KIOSK_HEX, SET } from './palette';
import { lodShows, useLabelLod } from './labelLod';

const HX = FLOOR_SLAB.w / 2;
const HZ = FLOOR_SLAB.d / 2;

/** Merge parts into a geometry for as long as the component lives. */
export function useMerged(build: () => Part[], deps: DependencyList): BufferGeometry {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(() => merge(build()), deps);
  useEffect(() => () => g.dispose(), [g]);
  return g;
}

/** A signboard: words on a plate, drawn on a canvas. */
function useSign(text: string, fg: string, bg: string): CanvasTexture {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = bg;
      g.fillRect(0, 0, 512, 128);
      g.fillStyle = fg;
      g.fillRect(0, 100, 512, 28);
      g.font = '800 58px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 52);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [text, fg, bg]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

export function Sign({ text, fg, bg, position, rotationY = 0, width = 1.8 }: { text: string; fg: string; bg: string; position: V3; rotationY?: number; width?: number }) {
  const map = useSign(text, fg, bg);
  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[width, width / 4]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}

// Walls

/** A wall running along local x with its room-side face toward +z: wainscot, skirting, a cap, and windows. */
function wallParts(len: number, windows: readonly number[]): { body: Part[]; lights: Part[] } {
  const T = WALL_T;
  const H = WALL_H;
  const body: Part[] = [
    box([0, H / 2, 0], [len, H, T], SET.wall),
    box([0, 0.5, T / 2 + 0.02], [len, 1.0, 0.04], SET.wainscot),
    box([0, 1.03, T / 2 + 0.035], [len, 0.06, 0.07], tint(SET.wainscot, 0.45)),
    box([0, 0.07, T / 2 + 0.04], [len, 0.14, 0.08], SET.skirting),
    box([0, H + 0.04, 0], [len + 0.02, 0.08, T + 0.1], SET.wallCap),
  ];
  const lights: Part[] = [];
  for (const x of windows) {
    body.push(
      box([x, 1.95, T / 2 + 0.03], [2.1, 1.5, 0.08], '#fffdf8'),
      box([x, 1.17, T / 2 + 0.1], [2.3, 0.06, 0.2], '#fffdf8'),
      box([x, 1.95, T / 2 + 0.085], [0.06, 1.45, 0.03], '#fffdf8'),
      box([x, 1.95, T / 2 + 0.085], [2.05, 0.06, 0.03], '#fffdf8'),
    );
    for (const dx of [-0.5, 0.5]) lights.push(box([x + dx, 2.33, T / 2 + 0.072], [0.93, 0.62, 0.01], '#eaf6ff'), box([x + dx, 1.57, T / 2 + 0.072], [0.93, 0.62, 0.01], '#cfe6f8'));
  }
  return { body, lights };
}

const DOOR = 1.5;

/** The two far walls, with windows; the low kerb along the near-left side, with a doorway for every gate. */
const BACK_WINDOWS = WALL_WINDOWS.filter((w) => w.wall === 'back').map((w) => w.at);
const RIGHT_WINDOWS = WALL_WINDOWS.filter((w) => w.wall === 'right').map((w) => w.at - WALL_T / 2);

/** The right-hand wall, in pieces between its side doors onto the park. */
function rightWall(windows: readonly number[]): { body: Part[]; lights: Part[] } {
  const len = FLOOR_SLAB.d - WALL_T;
  // Along the wall's own x, which is world z less half a wall's thickness.
  const doors = SIDE_DOORS_RIGHT.map((z) => z - WALL_T / 2).sort((a, c) => a - c);
  const pieces: Array<[number, number]> = [];
  let from = -len / 2;
  for (const d of doors) {
    pieces.push([from, d - SIDE_DOOR_W / 2]);
    from = d + SIDE_DOOR_W / 2;
  }
  pieces.push([from, len / 2]);
  const body: Part[] = [];
  const lights: Part[] = [];
  const place = (parts: Part[], mid: number): Part[] => xform(parts, [HX - WALL_T / 2, 0, mid + WALL_T / 2], -Math.PI / 2);
  for (const [a, c] of pieces) {
    const mid = (a + c) / 2;
    const w = wallParts(
      c - a,
      windows.filter((x) => x > a + 1.1 && x < c - 1.1).map((x) => x - mid),
    );
    body.push(...place(w.body, mid));
    lights.push(...place(w.lights, mid));
  }
  // Above each doorway, the wall from the lintel up.
  for (const d of doors) body.push(...place([box([0, (2.3 + WALL_H) / 2, 0], [SIDE_DOOR_W, WALL_H - 2.3, WALL_T], SET.wall)], d));
  return { body, lights };
}

export const Walls = memo(function Walls() {
  const back = BACK_WINDOWS;
  const right = RIGHT_WINDOWS;
  const body = useMerged(() => {
    const b = wallParts(FLOOR_SLAB.w, back);
    const parts = [...xform(b.body, [0, 0, -HZ + WALL_T / 2]), ...rightWall(right).body];
    // The kerb on the left, in pieces between the doors (and open at the vault's loading door, where the cash goes in).
    const cuts = [...ENTRANCES.map((e) => e.at[1]), LOADING_DOOR[1]].sort((a, c) => a - c);
    const pieces: Array<[number, number]> = [];
    let from = -HZ;
    for (const c of cuts) {
      if (c - DOOR / 2 > from) pieces.push([from, c - DOOR / 2]);
      from = c + DOOR / 2;
    }
    if (HZ > from) pieces.push([from, HZ]);
    for (const [a, c] of pieces) parts.push(box([-HX + WALL_T / 2, KERB_H / 2, (a + c) / 2], [WALL_T, KERB_H, c - a], SET.wainscot), box([-HX + WALL_T / 2, KERB_H + 0.02, (a + c) / 2], [WALL_T + 0.06, 0.04, c - a + 0.04], SET.wallCap));
    // The front of the building, towards the street: a low plinth, open wherever a lane runs out to the pavement, and at the main entrance.
    const g0 = MAIN_GATE.x - MAIN_GATE.width / 2;
    const g1 = MAIN_GATE.x + MAIN_GATE.width / 2;
    for (const r of frontPlinth().runs) {
      for (const [from, to] of [
        [r.from, Math.min(r.to, g0)],
        [Math.max(r.from, g1), r.to],
      ] as const) {
        if (to - from < 0.05) continue;
        const mid = (from + to) / 2;
        const len = to - from;
        parts.push(box([mid, KERB_H / 2, HZ - WALL_T / 2], [len, KERB_H, WALL_T], SET.wainscot), box([mid, KERB_H + 0.02, HZ - WALL_T / 2], [len + 0.04, 0.04, WALL_T + 0.06], SET.wallCap));
      }
    }
    // The main entrance: two stone pillars, a beam with a lit edge, and a wide mat.
    const gz = HZ - WALL_T / 2;
    for (const e of [-1, 1]) parts.push(box([MAIN_GATE.x + e * (MAIN_GATE.width / 2 + 0.15), 1.4, gz], [0.36, 2.8, 0.42], '#e7e2d6'), box([MAIN_GATE.x + e * (MAIN_GATE.width / 2 + 0.15), 0.08, gz], [0.46, 0.16, 0.52], '#a8a29e'));
    parts.push(box([MAIN_GATE.x, 2.9, gz], [MAIN_GATE.width + 0.9, 0.3, 0.5], '#1e3a8a'), box([MAIN_GATE.x, 0.012, gz - 0.9], [MAIN_GATE.width - 0.2, 0.024, 1.6], '#7a5b45'));
    // The side doors onto the park: a frame and a mat for each.
    for (const z of SIDE_DOORS_RIGHT) {
      const x = HX - WALL_T / 2;
      for (const e of [-1, 1]) parts.push(box([x, 1.1, z + e * (SIDE_DOOR_W / 2 + 0.04)], [0.26, 2.2, 0.12], '#16a34a'));
      parts.push(box([x, 2.24, z], [0.28, 0.12, SIDE_DOOR_W + 0.3], '#16a34a'), box([x - 0.7, 0.012, z], [1.2, 0.024, SIDE_DOOR_W - 0.3], '#7a5b45'));
    }
    // The doorways: a frame, a lintel, and a mat.
    for (const e of ENTRANCES) {
      const z = e.at[1];
      const x = -HX + WALL_T / 2;
      for (const s of [-1, 1]) parts.push(box([x, 0.9, z + s * (DOOR / 2 + 0.04)], [0.16, 1.8, 0.12], '#84cc16'));
      parts.push(box([x, 1.84, z], [0.2, 0.12, DOOR + 0.3], '#84cc16'), box([x + 0.7, 0.012, z], [1.2, 0.024, DOOR - 0.3], '#7a5b45'), box([x + 0.7, 0.026, z], [1.0, 0.004, DOOR - 0.55], '#a07a5a'));
    }
    return parts;
  }, [back, right]);
  const lights = useMerged(() => {
    const b = wallParts(FLOOR_SLAB.w, back);
    return [...xform(b.lights, [0, 0, -HZ + WALL_T / 2]), ...rightWall(right).lights];
  }, [back, right]);
  return (
    <group name="office-walls">
      <mesh geometry={body} material={solid} castShadow receiveShadow />
      <mesh geometry={lights} material={glow} />
      <Sign text="MAIN ENTRANCE" fg="#ffffff" bg="#1e3a8a" position={[MAIN_GATE.x, 2.9, HZ - WALL_T / 2 + 0.27]} width={2.4} />
    </group>
  );
});

// Glass rooms

const GLASS_H = 2.3;

/** Frames and panes for the walls of a glass room: cut open wherever a lane passes through. */
function glassRoomParts(rect: Rect, sides: readonly WallSide[], accent: string): { frame: Part[]; panes: Part[] } {
  const lanes = LANES.map((l) => l.points);
  const { runs, doors } = partition(rect, sides, lanes);
  const frame: Part[] = [];
  const panes: Part[] = [];
  const on = (axis: 'x' | 'z', at: number, along: number, y: number, lenAlong: number, h: number, across: number): [V3, V3] => (axis === 'z' ? [[at, y, along], [across, h, lenAlong]] : [[along, y, at], [lenAlong, h, across]]);
  const add = (list: Part[], axis: 'x' | 'z', at: number, along: number, y: number, lenAlong: number, h: number, across: number, color: string): void => {
    const [p, s] = on(axis, at, along, y, lenAlong, h, across);
    list.push(box(p, s, color));
  };
  for (const r of runs) {
    const len = r.to - r.from;
    const mid = (r.from + r.to) / 2;
    add(panes, r.axis, r.at, mid, GLASS_H / 2 + 0.1, len, GLASS_H - 0.1, 0.03, SET.glass);
    add(frame, r.axis, r.at, mid, 0.07, len, 0.14, 0.1, SET.steelDark);
    add(frame, r.axis, r.at, mid, GLASS_H + 0.04, len, 0.07, 0.09, SET.steelDark);
    const posts = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i <= posts; i++) add(frame, r.axis, r.at, r.from + (len * i) / posts, GLASS_H / 2 + 0.05, 0.08, GLASS_H + 0.1, 0.08, SET.steel);
  }
  for (const d of doors) {
    for (const s of [-1, 1]) add(frame, d.axis, d.at, d.centre + (s * d.width) / 2, GLASS_H / 2 + 0.05, 0.1, GLASS_H + 0.1, 0.1, accent);
    add(frame, d.axis, d.at, d.centre, 2.08, d.width, 0.1, 0.1, accent);
    add(panes, d.axis, d.at, d.centre, 2.19, d.width, 0.2, 0.03, SET.glass);
  }
  return { frame, panes };
}

const GlassRoom = memo(function GlassRoom({ rect, sides, accent }: { rect: Rect; sides: readonly WallSide[]; accent: string }) {
  const frame = useMerged(() => glassRoomParts(rect, sides, accent).frame, [rect, sides, accent]);
  const panes = useMerged(() => glassRoomParts(rect, sides, accent).panes, [rect, sides, accent]);
  return (
    <group>
      <mesh geometry={frame} material={satin} castShadow />
      <mesh geometry={panes} material={pane} renderOrder={5} />
    </group>
  );
});

const VAULT_SIDES: readonly WallSide[] = ['front', 'left', 'right'];
const SERVER_SIDES: readonly WallSide[] = ['left', 'front', 'back'];

/** The Security & 3DS Risk Vault, in glass, with its great round door on the wall behind the vault desk. */
export const VaultRoom = memo(function VaultRoom() {
  const rect = useMemo(() => vaultRoom(), []);
  const desk = useMemo(() => deskPose('SEC_VAULT'), []);
  const body = useMerged(() => {
    const bolts: Part[] = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return cyl([Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0.1], 0.045, 0.045, 0.06, '#6b7787', 6, [Math.PI / 2, 0, 0]);
    });
    return [
      box([0, 0, -0.07], [2.2, 2.2, 0.14], '#7b8794'),
      cyl([0, 0, 0], 0.88, 0.88, 0.2, '#aab6c3', 18, [Math.PI / 2, 0, 0]),
      ring([0, 0, 0.1], 0.88, 0.08, '#7e8b99', undefined, 18),
      ring([0, 0, 0.11], 0.58, 0.035, '#8895a4', undefined, 16),
      box([-0.96, 0.5, 0.02], [0.12, 0.34, 0.16], '#5f6b7a'),
      box([-0.96, -0.5, 0.02], [0.12, 0.34, 0.16], '#5f6b7a'),
      ...bolts,
    ];
  }, []);
  const wheel = useMerged(() => [ring([0, 0, 0], 0.3, 0.035, SET.brass, undefined, 14), ...[0, 1, 2].map((i) => box([0, 0, 0], [0.62, 0.05, 0.04], SET.brass, [0, 0, (i * Math.PI) / 3])), ball([0, 0, 0], 0.07, SET.brass), ...[0, 1, 2, 3, 4, 5].map((i) => ball([Math.cos((i * Math.PI) / 3) * 0.31, Math.sin((i * Math.PI) / 3) * 0.31, 0], 0.045, '#c0392b'))], []);
  const wheelRef = useRef<Group>(null);
  useFrame((_, dt) => {
    const busy = bankStore.getState().view.stations.SEC_VAULT.status !== 'IDLE';
    if (wheelRef.current) wheelRef.current.rotation.z += dt * (busy ? 1.2 : 0.12);
  });
  return (
    <group name="office-vault">
      <GlassRoom rect={rect} sides={VAULT_SIDES} accent="#a78bfa" />
      <group position={[desk.x, 1.45, rect.z0 + 0.09]}>
        <mesh geometry={body} material={satin} castShadow receiveShadow />
        <group ref={wheelRef} position={[0, 0, 0.2]}>
          <mesh geometry={wheel} material={satin} castShadow />
        </group>
      </group>
      <Sign text="RISK VAULT" fg="#ffffff" bg="#7c3aed" position={[rect.x1 - 1.7, GLASS_H + 0.42, rect.z1 + 0.05]} width={1.9} />
    </group>
  );
});

// Server racks

const LED_SPOTS: V3[] = [[-0.28, 0.5, 0.455], [-0.28, 0.9, 0.455], [-0.28, 1.3, 0.455], [-0.28, 1.7, 0.455]];

/** The core server racks, in their own glass room against the right-hand wall. The lights blink faster when the ledger is busy. */
export const ServerRoom = memo(function ServerRoom() {
  const { racks, ...rect } = SERVER_ROOM;
  const rectOnly = useMemo<Rect>(() => ({ x0: rect.x0, x1: rect.x1, z0: rect.z0, z1: rect.z1 }), [rect.x0, rect.x1, rect.z0, rect.z1]);
  const rack = useMerged(() => {
    const parts: Part[] = [box([0, 1.0, 0], [0.82, 2.0, 0.85], '#323a47'), box([0, 1.0, 0.43], [0.74, 1.9, 0.02], '#232a35'), box([0, 2.02, 0], [0.86, 0.04, 0.89], '#1b212b')];
    for (let i = 0; i < 9; i++) parts.push(box([0, 0.22 + i * 0.2, 0.445], [0.68, 0.14, 0.012], i % 3 === 0 ? '#4a5568' : '#2d3643'), box([0.1, 0.22 + i * 0.2, 0.453], [0.34, 0.025, 0.004], '#1a202a'));
    return parts;
  }, []);
  const lit = useMerged(() => Array.from({ length: 9 }, (_, i) => box([0.28, 0.22 + i * 0.2, 0.455], [0.03, 0.03, 0.006], i % 4 === 1 ? '#fbbf24' : '#4ade80')), []);
  const floor = useMerged(() => [box([(rect.x0 + rect.x1) / 2, 0.03, (rect.z0 + rect.z1) / 2], [rect.x1 - rect.x0, 0.06, rect.z1 - rect.z0], '#cdd5de')], [rect.x0, rect.x1, rect.z0, rect.z1]);
  const blinkers = useRef<Array<Mesh | null>>([]);
  useFrame(({ clock }) => {
    const s = bankStore.getState().view.stations;
    const hot = s.LEDGER_DEBIT.status !== 'IDLE' || s.LEDGER_CREDIT.status !== 'IDLE';
    const rate = hot ? 9 : 2.5;
    blinkers.current.forEach((m, i) => {
      if (m) m.visible = Math.sin(clock.elapsedTime * rate + i * 1.9) > -0.2;
    });
  });
  let n = 0;
  return (
    <group name="office-servers">
      <mesh geometry={floor} material={solid} receiveShadow />
      {racks.map(([x, z], i) => (
        <group key={i} position={[x, 0.06, z]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh geometry={rack} material={solid} castShadow receiveShadow />
          <mesh geometry={lit} material={glow} />
          {LED_SPOTS.map((p, k) => {
            const idx = n++;
            return (
              <mesh
                key={k}
                ref={(m) => {
                  blinkers.current[idx] = m;
                }}
                position={p}
              >
                <boxGeometry args={[0.035, 0.035, 0.008]} />
                <meshBasicMaterial color={k % 2 ? '#fb7185' : '#22d3ee'} toneMapped={false} />
              </mesh>
            );
          })}
        </group>
      ))}
      <GlassRoom rect={rectOnly} sides={SERVER_SIDES} accent="#34d399" />
      <Sign text="CORE SERVERS" fg="#ffffff" bg="#059669" position={[rect.x0 - 0.06, GLASS_H + 0.42, (rect.z0 + rect.z1) / 2]} rotationY={-Math.PI / 2} width={2.1} />
    </group>
  );
});

// Plants

function plantParts(kind: PlantKind): Part[] {
  const [l0, l1, l2] = SET.leaf;
  const pot: Part[] = [cyl([0, 0.17, 0], 0.2, 0.14, 0.34, SET.pot, 8), cyl([0, 0.345, 0], 0.215, 0.215, 0.04, SET.potDark, 8), cyl([0, 0.36, 0], 0.17, 0.17, 0.02, '#5b4636', 8)];
  if (kind === 'ficus') {
    return [
      ...pot,
      cyl([0, 0.75, 0], 0.03, 0.05, 0.8, '#7a5a3a', 6),
      blob([0, 1.28, 0], 0.34, l0 as string, [1, 1.1, 1]),
      blob([0.24, 1.0, 0.1], 0.25, l1 as string),
      blob([-0.22, 1.05, -0.1], 0.26, l2 as string),
      blob([0.06, 1.62, 0.04], 0.22, l1 as string),
      blob([-0.17, 0.86, 0.2], 0.2, l0 as string),
      blob([0.2, 1.4, -0.14], 0.2, l2 as string),
    ];
  }
  if (kind === 'monstera') {
    const leaves: Part[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.3;
      const h = 0.62 + (k % 3) * 0.14;
      const reach = 0.3 + (k % 2) * 0.1;
      leaves.push(cyl([Math.cos(a) * reach * 0.5, (0.36 + h) / 2, Math.sin(a) * reach * 0.5], 0.012, 0.014, h - 0.3, '#4d7c3a', 4, [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]));
      leaves.push(blob([Math.cos(a) * reach, h, Math.sin(a) * reach], 0.25, [l0, l1, l2][k % 3] as string, [1, 0.2, 0.8], 1, [0, -a, 0.45]));
    }
    return [...pot, ...leaves];
  }
  // palm
  const fronds: Part[] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    fronds.push(blob([Math.cos(a) * 0.38, 1.5, Math.sin(a) * 0.38], 0.36, [l1, l2, l0][k % 3] as string, [1, 0.1, 0.3], 1, [0, -a, -0.45]));
  }
  return [...pot, cyl([0, 0.9, 0], 0.035, 0.055, 1.1, '#8b6b45', 6, [0.05, 0, 0.03]), ...fronds, ball([0, 1.5, 0], 0.08, '#8b6b45')];
}

const plantCache = new Map<PlantKind, BufferGeometry>();
const plantGeometry = (kind: PlantKind): BufferGeometry => {
  let g = plantCache.get(kind);
  if (!g) {
    g = merge(plantParts(kind));
    plantCache.set(kind, g);
  }
  return g;
};

/** Potted plants: ficus, monstera and palm, standing against the walls and in the corners. */
export const Plants = memo(function Plants() {
  return (
    <group name="office-plants">
      {PLANTS.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, i * 1.7, 0]} scale={p.scale}>
          <mesh geometry={plantGeometry(p.kind)} material={solid} castShadow receiveShadow />
          <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]} material={blobMaterial()}>
            <planeGeometry args={[1.5, 1.5]} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

// Gates: stanchion ropes and the ATM

const stanchion = (x: number, z: number): Part[] => [cyl([x, 0.02, z], 0.15, 0.16, 0.04, SET.brass, 10), cyl([x, 0.45, z], 0.025, 0.025, 0.84, SET.brass, 8), ball([x, 0.89, z], 0.055, SET.brass)];

/** Brass posts and red velvet ropes line the queues at the three shop gates and at the two sidewalk ATMs. */
export const GateStanchions = memo(function GateStanchions() {
  const geo = useMerged(() => {
    const parts: Part[] = [];
    for (const id of ROPED_QUEUES) {
      const { posts, ropes } = stanchionLine(id);
      for (const [x, z] of posts) parts.push(...stanchion(x, z));
      for (const [a, b] of ropes) parts.push(rope([a[0], 0.83, a[1]], [b[0], 0.83, b[1]], 0.13, 0.024, SET.rope));
    }
    return parts;
  }, []);
  return <mesh geometry={geo} material={satin} castShadow name="office-stanchions" />;
});

// The tallies and the phone

export const KIOSKS: readonly ExternalId[] = ['OUT_APPROVED', 'OUT_DECLINED', 'OUT_SETTLED', 'CUSTOMER_OTP'];

function kioskParts(id: ExternalId, w: number, d: number, blocks: number): { body: Part[]; lights: Part[] } {
  const hex = KIOSK_HEX[id];
  const bw = w - 0.3;
  const bd = d - 0.5;
  switch (id) {
    case 'OUT_APPROVED': {
      const body: Part[] = [box([0, 0.25, 0], [bw, 0.5, bd], '#eef3ee'), box([0, 0.27, bd / 2 + 0.01], [bw, 0.12, 0.02], hex), box([0, 0.53, 0], [bw + 0.1, 0.06, bd + 0.1], tint(hex, 0.25))];
      for (let i = 0; i < blocks; i++) {
        const gx = ((i % 3) - 1) * 0.5;
        const gz = (Math.floor(i / 3) - 1) * 0.4;
        for (let k = 0; k < 2 + (i % 3); k++) body.push(cyl([gx, 0.6 + k * 0.045, gz], 0.15, 0.15, 0.04, k % 2 ? shade('#e0b13c', 0.1) : '#e0b13c', 10));
      }
      return { body, lights: [box([0, 0.565, bd / 2 - 0.08], [0.8, 0.014, 0.08], '#052e16')] };
    }
    case 'OUT_DECLINED': {
      const body: Part[] = [box([0, 0.25, 0], [bw, 0.5, bd], '#f6e6e8'), box([0, 0.27, bd / 2 + 0.01], [bw, 0.12, 0.02], hex), box([0, 0.53, 0], [bw + 0.1, 0.06, bd + 0.1], tint(hex, 0.35))];
      for (let i = 0; i < blocks; i++) body.push(box([((i % 3) - 1) * 0.42, 0.58 + Math.floor(i / 3) * 0.035, ((i * 5) % 3) * 0.18 - 0.2], [0.5, 0.03, 0.36], '#ffffff', [0, i * 0.7, 0]));
      return { body, lights: [box([0, 0.565, bd / 2 - 0.08], [0.8, 0.014, 0.08], '#4c0519')] };
    }
    case 'OUT_SETTLED': {
      const body: Part[] = [box([0, 0.08, 0], [bw, 0.16, bd], '#d9b172')];
      for (let i = 0; i < blocks; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        body.push(box([(col - 1) * 0.6, 0.38 + row * 0.42, 0], [0.54, 0.4, 0.5], row % 2 ? '#f0b04a' : hex), box([(col - 1) * 0.6, 0.38 + row * 0.42, 0.255], [0.54, 0.06, 0.01], '#fff7ed'));
      }
      return { body, lights: [] };
    }
    default: {
      // the customer's phone, on a stand
      return {
        body: [cyl([0, 0.05, 0], 0.28, 0.32, 0.1, '#cbd5e1', 10), box([0, 0.16, -0.05], [0.12, 0.2, 0.08], '#94a3b8'), box([0, 0.78, -0.02], [0.62, 1.05, 0.08], '#1e293b', [-0.18, 0, 0]), ring([0, 0.28, 0.1], 0.24, 0.02, '#a78bfa', [Math.PI / 2, 0, 0], 16)],
        lights: [box([0, 0.78, 0.025], [0.54, 0.94, 0.01], '#ddd6fe', [-0.18, 0, 0]), box([0, 0.95, 0.034], [0.4, 0.14, 0.004], '#7c3aed', [-0.18, 0, 0]), box([0, 0.74, 0.034], [0.4, 0.07, 0.004], '#a78bfa', [-0.18, 0, 0]), box([0, 0.62, 0.034], [0.3, 0.07, 0.004], '#c4b5fd', [-0.18, 0, 0])],
      };
    }
  }
}

const Kiosk = memo(function Kiosk({ id }: { id: ExternalId }) {
  const pose = useMemo(() => kioskPose(id), [id]);
  const count = useBankStore((s) => s.view.externals[id].count);
  const terms = useTerms();
  const hex = KIOSK_HEX[id];
  const always = useBankStore((s) => s.labelMode === 'always');
  const hovered = useBankStore((s) => s.hoverPlace === id);
  const lit = useTourLit(id);
  // A tally's badge is a dense sub-label: zoomed right out it shows only when pointed at or lit by a tour.
  const tally = lodShows(useLabelLod()).tally;
  const labelled = hovered || (lit === null ? always && tally : lit);
  const setHoverPlace = useBankStore((s) => s.setHoverPlace);
  // A pile that grows with the tally, slowly: one block for a handful, up to nine.
  const blocks = Math.min(9, Math.ceil(Math.sqrt(count)));
  const body = useMerged(() => kioskParts(id, pose.w, pose.d, blocks).body, [id, pose.w, pose.d, blocks]);
  const lights = useMerged(() => kioskParts(id, pose.w, pose.d, blocks).lights, [id, pose.w, pose.d, blocks]);
  return (
    <group position={[pose.x, 0, pose.z]} name={`office-kiosk-body-${id}`}>
      <mesh geometry={body} material={solid} castShadow receiveShadow />
      <mesh geometry={lights} material={glow} />
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={blobMaterial()}>
        <planeGeometry args={[pose.w + 1.2, pose.d + 1.2]} />
      </mesh>
      {/* an invisible box so that a tally can be hovered like a desk: in "Hover Only" label mode this is how its badge appears */}
      <mesh visible={false} position={[0, 0.5, 0]} onPointerOver={() => setHoverPlace(id)} onPointerOut={() => setHoverPlace(null)}>
        <boxGeometry args={[pose.w, 1.1, pose.d]} />
      </mesh>
      {labelled && (
        <Html position={[0, id === 'CUSTOMER_OTP' ? 1.8 : 1.7, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="pc-lod-in flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white bg-white/95 py-[2px] pl-1.5 pr-[2px] text-[10px] font-semibold text-slate-700 shadow-[0_2px_6px_rgba(60,40,20,0.28)]" data-testid={`office-kiosk-${id}`}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: hex }} />
            <span>{terms.external(id)}</span>
            <span className="min-w-[16px] rounded-full bg-slate-200 px-1 text-center tabular-nums text-slate-600">{count.toLocaleString()}</span>
          </div>
        </Html>
      )}
    </group>
  );
});

export const Kiosks = memo(function Kiosks() {
  return (
    <>
      {KIOSKS.map((id) => (
        <Kiosk key={id} id={id} />
      ))}
    </>
  );
});
