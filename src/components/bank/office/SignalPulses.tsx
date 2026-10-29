import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import { MeshBasicMaterial, type Mesh } from 'three';
import { bankStore, useBankStore } from '../../../store/bankStore';
import type { StationId } from '../../../sim/topology';
import { useMerged } from './Dressing';
import { box, cyl } from './kit';
import { glow, solid } from './materials';
import { motion } from '../../../engine/simulation/motion';
import { PACKET_HEX } from './palette';
import { CELL_TOWER, DIGITAL_GATES, SIGNAL, SIGNAL_KIND, signalPoint, signalTarget } from '../../../engine/world/signals';

/** How many pulses can be in the air at once, and how many ripples can spread at the tower and the desks. */
const PULSES = 24;
const RIPPLES = 8;

interface Pulse {
  gate: StationId;
  start: number;
}

/** The cell tower: a tapered mast on a concrete base, three antenna panels near the top, and a red warning light. */
function towerParts() {
  const { x, z, top } = CELL_TOWER;
  return {
    body: [
      box([x, 0.15, z], [1.0, 0.3, 1.0], '#9ca3af'),
      cyl([x, top / 2, z], 0.08, 0.22, top, '#94a3b8', 6),
      ...[0, 1, 2].map((k) => {
        const a = (k * Math.PI * 2) / 3;
        return box([x + Math.cos(a) * 0.22, top - 0.5, z + Math.sin(a) * 0.22], [0.1, 0.8, 0.22], '#e2e8f0', [0, -a, 0]);
      }),
      cyl([x, top - 1.2, z], 0.32, 0.32, 0.05, '#64748b', 8),
    ],
    lit: [box([x, top + 0.12, z], [0.12, 0.12, 0.12], '#ef4444')],
  };
}

/** The digital gates' customers arriving as signals (signals.ts). */
export const SignalPulses = memo(function SignalPulses() {
  const tick = useBankStore((s) => s.view.tick);
  const parts = useMemo(towerParts, []);
  const body = useMerged(() => parts.body, [parts]);
  const lit = useMerged(() => parts.lit, [parts]);
  const live = useRef<Pulse[]>([]);
  const dots = useRef<Array<Mesh | null>>([]);
  const rings = useRef<Array<Mesh | null>>([]);
  const ripples = useRef<Array<{ at: readonly [number, number, number]; start: number; hex: string }>>([]);
  const dotMats = useMemo(() => Array.from({ length: PULSES }, () => new MeshBasicMaterial({ toneMapped: false, transparent: true })), []);
  const ringMats = useMemo(() => Array.from({ length: RIPPLES }, () => new MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false })), []);
  useEffect(
    () => () => {
      for (const m of [...dotMats, ...ringMats]) m.dispose();
    },
    [dotMats, ringMats],
  );

  useEffect(() => {
    const stations = bankStore.getState().view.stations;
    for (const gate of DIGITAL_GATES) {
      const n = Math.min(SIGNAL.perBeat, stations[gate].arrivals);
      for (let k = 0; k < n; k++) live.current.push({ gate, start: motion.t + k * SIGNAL.gap });
    }
    if (live.current.length > PULSES) live.current.splice(0, live.current.length - PULSES);
  }, [tick]);

  useFrame(() => {
    const t = motion.t;
    const hexOf = (gate: StationId): string => PACKET_HEX[SIGNAL_KIND[gate] ?? 'A2A'];
    const ripple = (at: readonly [number, number, number], hex: string) => {
      ripples.current.push({ at, start: t, hex });
      if (ripples.current.length > RIPPLES) ripples.current.shift();
    };
    for (let i = live.current.length - 1; i >= 0; i--) {
      const p = live.current[i]!;
      if (t - p.start >= SIGNAL.flight) {
        ripple(signalTarget(p.gate), hexOf(p.gate));
        live.current.splice(i, 1);
      }
    }
    for (let i = 0; i < PULSES; i++) {
      const m = dots.current[i];
      if (!m) continue;
      const p = live.current[i];
      if (!p || t < p.start) {
        m.visible = false;
        continue;
      }
      const u = (t - p.start) / SIGNAL.flight;
      // Leaving the tower: a ripple at the antennas.
      if (!m.visible) ripple([CELL_TOWER.x, CELL_TOWER.top - 0.4, CELL_TOWER.z], hexOf(p.gate));
      m.visible = true;
      m.position.set(...signalPoint(p.gate, u));
      m.scale.setScalar(0.8 + Math.sin(u * Math.PI * 6) * 0.15);
      dotMats[i]!.color.set(hexOf(p.gate));
      dotMats[i]!.opacity = 0.95;
    }
    for (let i = 0; i < RIPPLES; i++) {
      const m = rings.current[i];
      if (!m) continue;
      const r = ripples.current[i];
      const k = r ? (t - r.start) / 0.7 : 1;
      if (!r || k >= 1 || k < 0) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.position.set(r.at[0], r.at[1], r.at[2]);
      m.scale.setScalar(0.2 + k * 0.9);
      ringMats[i]!.color.set(r.hex);
      ringMats[i]!.opacity = 0.8 * (1 - k);
    }
  });

  return (
    <group name="office-signals">
      <group name="cell-tower">
        <mesh geometry={body} material={solid} castShadow />
        <mesh geometry={lit} material={glow} />
      </group>
      {dotMats.map((m, i) => (
        <mesh
          key={`dot-${i}`}
          ref={(el) => {
            dots.current[i] = el;
          }}
          material={m}
          visible={false}
        >
          <sphereGeometry args={[0.13, 10, 8]} />
        </mesh>
      ))}
      {ringMats.map((m, i) => (
        <mesh
          key={`ring-${i}`}
          ref={(el) => {
            rings.current[i] = el;
          }}
          material={m}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        >
          <ringGeometry args={[0.8, 1, 24]} />
        </mesh>
      ))}
    </group>
  );
});
