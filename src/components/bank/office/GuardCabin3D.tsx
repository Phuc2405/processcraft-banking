import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef, useState } from 'react';
import type { Group, MeshBasicMaterial } from 'three';
import { bankStore } from '../../../store/bankStore';
import { atmosphereAt } from './atmosphere';
import { CustomerFigure } from './Avatars';
import { Sign, useMerged } from './Dressing';
import { FrontGuard } from './guardCabin';
import { box, type Part } from './kit';
import { GUARD_CABIN } from './layout3d';
import { glow, pane, solid } from './materials';
import { motion, substeps } from './motion';
import { liveMix, weatherStore } from './weather';

/**
 * The security guard's cabin by the main entrance (guardCabin.ts says where the guard is): a small glass booth on a plinth,
 * a solid lower wall, glass windows on three sides and the door side open towards the entrance, a flat roof with an
 * overhang, and a lamp inside that glows warmer as the evening comes on. The guard on duty patrols by day and keeps watch
 * from inside it in the wet and at night; at a change of shift the next guard walks up and the other walks off.
 */

const { x, z, w, d, h } = GUARD_CABIN;
const WALL = 0.95;
const FRAME = '#334155';

function cabinParts(): { solid: Part[]; glass: Part[]; lamp: Part[] } {
  const s: Part[] = [
    box([x, 0.05, z], [w + 0.1, 0.1, d + 0.1], '#94a3b8'),
    // The lower walls: back, the two ends; on the door side only the half beside the door.
    box([x, WALL / 2, z - d / 2], [w, WALL, 0.08], '#e2e8f0'),
    box([x, WALL / 2, z + d / 2], [w, WALL, 0.08], '#e2e8f0'),
    box([x - w / 2, WALL / 2, z], [0.08, WALL, d], '#e2e8f0'),
    box([x + w / 2, WALL / 2, z - d / 2 + 0.17], [0.08, WALL, 0.34], '#e2e8f0'),
    // A blue band and the corner posts.
    box([x, WALL - 0.05, z + d / 2 + 0.005], [w, 0.1, 0.08], '#1d4ed8'),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box([x + (sx * w) / 2, h / 2, z + (sz * d) / 2], [0.07, h, 0.07], FRAME))),
    // The door frame, and the roof with its overhang and a darker fascia.
    box([x + w / 2, h / 2, z + 0.4], [0.07, h, 0.07], FRAME),
    box([x, h + 0.06, z], [w + 0.5, 0.1, d + 0.45], '#475569'),
    box([x, h - 0.02, z + d / 2 + 0.22], [w + 0.5, 0.12, 0.03], '#1e293b'),
    // Inside: a little desk with a phone and a log book, and a stool.
    box([x - 0.3, 0.78, z - d / 2 + 0.22], [0.6, 0.05, 0.36], '#a16207'),
    box([x - 0.42, 0.82, z - d / 2 + 0.2], [0.2, 0.03, 0.14], '#f8fafc'),
    box([x - 0.15, 0.83, z - d / 2 + 0.2], [0.08, 0.05, 0.12], '#111827'),
    box([x - 0.3, 0.4, z - d / 2 + 0.25], [0.05, 0.76, 0.05], '#78350f'),
  ];
  const g: Part[] = [
    box([x, WALL + (h - WALL) / 2, z - d / 2], [w - 0.07, h - WALL, 0.02], '#bfdbfe'),
    box([x, WALL + (h - WALL) / 2, z + d / 2], [w - 0.07, h - WALL, 0.02], '#bfdbfe'),
    box([x - w / 2, WALL + (h - WALL) / 2, z], [0.02, h - WALL, d - 0.07], '#bfdbfe'),
  ];
  const lamp: Part[] = [box([x, h - 0.06, z], [0.42, 0.03, 0.3], '#fff4cf')];
  return { solid: s, glass: g, lamp };
}

const LOOKS = [93, 97, 101];

/** The guard on duty and (during a handover) the guard going off, moved every frame from FrontGuard. */
function Guards({ guard }: { guard: FrontGuard }) {
  const duty = useRef<Group>(null);
  const off = useRef<Group>(null);
  const [state, setState] = useState(() => ({ shift: guard.shift, walking: false, leaving: false, offWalking: true }));
  useFrame(() => {
    const f = guard.figures();
    duty.current?.position.set(f.duty.at[0], 0, f.duty.at[1]);
    if (duty.current) duty.current.rotation.y = f.duty.heading;
    if (off.current && f.leaving) {
      off.current.position.set(f.leaving.at[0], 0, f.leaving.at[1]);
      off.current.rotation.y = f.leaving.heading;
    }
    const next = { shift: guard.shift, walking: f.duty.walking, leaving: f.leaving !== null, offWalking: f.leaving?.walking ?? true };
    if (next.shift !== state.shift || next.walking !== state.walking || next.leaving !== state.leaving || next.offWalking !== state.offWalking) setState(next);
  });
  const prev = ((state.shift + 2) % 3) as 0 | 1 | 2;
  return (
    <>
      <group ref={duty} name="front-guard">
        <CustomerFigure index={LOOKS[state.shift]!} shirt="#1e3a5f" walking stride={state.walking ? 1 : 0} scale={0.72} wear="guard" />
      </group>
      {state.leaving && (
        <group ref={off} name="front-guard-off-duty">
          <CustomerFigure index={LOOKS[prev]!} shirt="#1e3a5f" walking stride={state.offWalking ? 1 : 0} scale={0.72} wear="guard" />
        </group>
      )}
    </>
  );
}

export const GuardCabin3D = memo(function GuardCabin3D() {
  const parts = useMemo(cabinParts, []);
  const body = useMerged(() => parts.solid, [parts]);
  const glass = useMerged(() => parts.glass, [parts]);
  const lamp = useMerged(() => parts.lamp, [parts]);
  const light = useRef<MeshBasicMaterial>(null);
  const guard = useMemo(() => {
    const st = bankStore.getState();
    return new FrontGuard(st.view.minute, wetNow());
  }, []);
  useFrame(() => {
    const minute = bankStore.getState().view.minute;
    for (const dt of substeps(motion.dt)) guard.step(dt, minute, wetNow());
    // The lamp inside: always on, brightest after dark and in the gloom of bad weather.
    if (light.current) light.current.opacity = 0.1 + 0.28 * atmosphereAt(minute, liveMix).lamps;
  }, -1);
  return (
    <group name="guard-cabin">
      <mesh geometry={body} material={solid} castShadow receiveShadow />
      <mesh geometry={glass} material={pane} />
      <mesh geometry={lamp} material={glow} />
      {/* The lamp's glow on the inside of the cabin. */}
      <mesh position={[x, h - 0.4, z]}>
        <boxGeometry args={[w - 0.12, 0.7, d - 0.12]} />
        <meshBasicMaterial ref={light} color="#ffe8a3" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
      </mesh>
      <Sign text="SECURITY" fg="#ffffff" bg="#1e3a8a" position={[x, h + 0.3, z + d / 2 + 0.24]} width={1.1} />
      <Guards guard={guard} />
    </group>
  );
});

/** Rain, a storm, hail or snow: weather a guard waits out in the cabin. */
const wetNow = (): boolean => ['rain', 'storm', 'hail', 'snow'].includes(weatherStore.getState().weather);
