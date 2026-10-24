import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Color, type Mesh, type MeshBasicMaterial } from 'three';
import { cursor } from './cursor';
import { box, merge } from './kit';
import { solid } from './materials';

/** Rack size in world units: it stands where a seated person would, behind the counter, and rises well above it. */
export const RACK = { w: 0.6, h: 1.62, d: 0.55 } as const;
const BLADES = 6;

/** LED colour by thread load (the engine's 0–100 strain number), matching the inspector's load looks. */
export function rackLedHex(load: number): string {
  if (load >= 85) return '#fb7185';
  if (load >= 60) return '#fb923c';
  if (load >= 35) return '#38bdf8';
  return '#34d399';
}

/**
 * One server rack: a dark cabinet with six blade servers facing the counter, a status LED on every blade and a bot badge on
 * top. The LEDs blink in a ripple while the thread is processing and hold steady while it idles; their colour follows the
 * load. Clicking the rack selects its thread, like clicking the person who used to sit there.
 */
export const ServerRack3D = memo(function ServerRack3D({ load, working, temp, accent, selected, onSelect }: { load: number; working: boolean; temp: boolean; accent: string; selected: boolean; onSelect: () => void }) {
  const body = useMemo(() => {
    const parts = [
      // plinth, cabinet, top cap
      box([0, 0.04, 0], [RACK.w + 0.06, 0.08, RACK.d + 0.06], '#1f2630'),
      box([0, RACK.h / 2 + 0.08, 0], [RACK.w, RACK.h, RACK.d], temp ? '#334155' : '#1e293b'),
      box([0, RACK.h + 0.1, 0], [RACK.w + 0.04, 0.04, RACK.d + 0.04], '#2b3340'),
      // side rails in the department's colour
      box([-RACK.w / 2 - 0.006, RACK.h / 2 + 0.08, RACK.d / 2 - 0.03], [0.014, RACK.h - 0.06, 0.03], accent),
      box([RACK.w / 2 + 0.006, RACK.h / 2 + 0.08, RACK.d / 2 - 0.03], [0.014, RACK.h - 0.06, 0.03], accent),
    ];
    for (let i = 0; i < BLADES; i++) {
      const y = 0.26 + i * 0.235;
      parts.push(box([0, y, RACK.d / 2 + 0.004], [RACK.w - 0.08, 0.17, 0.012], '#334155'));
      parts.push(box([0.06, y, RACK.d / 2 + 0.012], [0.3, 0.02, 0.006], '#64748b'));
      parts.push(box([0.06, y - 0.04, RACK.d / 2 + 0.012], [0.22, 0.02, 0.006], '#475569'));
    }
    // bot badge on top: head, eyes, antenna
    parts.push(box([0, RACK.h + 0.22, 0.05], [0.26, 0.18, 0.2], accent));
    parts.push(box([-0.06, RACK.h + 0.23, 0.152], [0.05, 0.05, 0.006], '#0b1120'));
    parts.push(box([0.06, RACK.h + 0.23, 0.152], [0.05, 0.05, 0.006], '#0b1120'));
    parts.push(box([0, RACK.h + 0.36, 0.05], [0.02, 0.1, 0.02], accent));
    return merge(parts);
  }, [accent, temp]);
  useEffect(() => () => body.dispose(), [body]);

  const hex = rackLedHex(load);
  const leds = useRef<Array<Mesh | null>>([]);
  const base = useMemo(() => new Color(hex), [hex]);
  const dim = useMemo(() => new Color(hex).multiplyScalar(0.25), [hex]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    leds.current.forEach((m, i) => {
      if (!m) return;
      const mat = m.material as MeshBasicMaterial;
      if (!working) {
        mat.color.copy(base);
        return;
      }
      // A ripple up the blades, two blinks a second.
      const on = Math.sin(t * 12 - i * 0.9) > -0.2;
      mat.color.copy(on ? base : dim);
    });
  });

  const click = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    if (e.delta > 4) return;
    onSelect();
  };

  return (
    <group name="server-rack">
      <mesh geometry={body} material={solid} castShadow receiveShadow />
      {Array.from({ length: BLADES }, (_, i) => (
        <mesh key={i} ref={(m) => (leds.current[i] = m)} position={[-RACK.w / 2 + 0.1, 0.26 + i * 0.235, RACK.d / 2 + 0.014]}>
          <boxGeometry args={[0.05, 0.05, 0.008]} />
          <meshBasicMaterial color={hex} toneMapped={false} />
        </mesh>
      ))}
      {/* An invisible box around the rack catches the pointer. */}
      <mesh
        visible={false}
        position={[0, RACK.h / 2 + 0.1, 0]}
        onClick={click}
        onPointerOver={(e) => {
          e.stopPropagation();
          cursor(true);
        }}
        onPointerOut={() => cursor(false)}
      >
        <boxGeometry args={[RACK.w + 0.1, RACK.h + 0.4, RACK.d + 0.1]} />
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
