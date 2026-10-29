import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef, useState } from 'react';
import type { Group, MeshBasicMaterial } from 'three';
import { bankStore } from '../../../store/bankStore';
import { atmosphereAt } from './atmosphere';
import { CustomerFigure } from './Avatars';
import { Sign, useMerged } from './Dressing';
import { FRONT_PLAN, FrontGuard, type Cabin, type GuardPostPlan } from './guardCabin';
import { box, type Part } from './kit';
import { glow, pane, solid } from './materials';
import { motion, substeps } from './motion';
import { liveMix, weatherStore } from './weather';

/**
 * The security guard's cabin by the main entrance (guardCabin.ts says where the guard is): a small glass booth on a plinth,
 * a solid lower wall, glass windows on three sides and the door side open towards the entrance, a flat roof with an
 * overhang, and a lamp inside that glows warmer as the evening comes on. The guard on duty patrols by day and keeps watch
 * from inside it in the wet and at night; at a change of shift the next guard walks up and the other walks off.
 */

const WALL = 0.95;
const FRAME = '#334155';

function cabinParts({ x, z, w, d, h, door }: Cabin): { solid: Part[]; glass: Part[]; lamp: Part[] } {
  const dx = (door * w) / 2;
  const s: Part[] = [
    box([x, 0.05, z], [w + 0.1, 0.1, d + 0.1], '#94a3b8'),
    // The lower walls: the two long sides, the back end; on the door side only the half beside the door.
    box([x, WALL / 2, z - d / 2], [w, WALL, 0.08], '#e2e8f0'),
    box([x, WALL / 2, z + d / 2], [w, WALL, 0.08], '#e2e8f0'),
    box([x - dx, WALL / 2, z], [0.08, WALL, d], '#e2e8f0'),
    box([x + dx, WALL / 2, z - d / 2 + 0.17], [0.08, WALL, 0.34], '#e2e8f0'),
    // A blue band and the corner posts.
    box([x, WALL - 0.05, z + d / 2 + 0.005], [w, 0.1, 0.08], '#1d4ed8'),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box([x + (sx * w) / 2, h / 2, z + (sz * d) / 2], [0.07, h, 0.07], FRAME))),
    // The door frame, and the roof with its overhang and a darker fascia.
    box([x + dx, h / 2, z + 0.4], [0.07, h, 0.07], FRAME),
    box([x, h + 0.06, z], [w + 0.5, 0.1, d + 0.45], '#475569'),
    box([x, h - 0.02, z + d / 2 + 0.22], [w + 0.5, 0.12, 0.03], '#1e293b'),
    // Inside: a little desk with a phone and a log book, and a stool.
    box([x - door * 0.3, 0.78, z - d / 2 + 0.22], [0.6, 0.05, 0.36], '#a16207'),
    box([x - door * 0.42, 0.82, z - d / 2 + 0.2], [0.2, 0.03, 0.14], '#f8fafc'),
    box([x - door * 0.15, 0.83, z - d / 2 + 0.2], [0.08, 0.05, 0.12], '#111827'),
    box([x - door * 0.3, 0.4, z - d / 2 + 0.25], [0.05, 0.76, 0.05], '#78350f'),
  ];
  const g: Part[] = [
    box([x, WALL + (h - WALL) / 2, z - d / 2], [w - 0.07, h - WALL, 0.02], '#bfdbfe'),
    box([x, WALL + (h - WALL) / 2, z + d / 2], [w - 0.07, h - WALL, 0.02], '#bfdbfe'),
    box([x - dx, WALL + (h - WALL) / 2, z], [0.02, h - WALL, d - 0.07], '#bfdbfe'),
  ];
  const lamp: Part[] = [box([x, h - 0.06, z], [0.42, 0.03, 0.3], '#fff4cf')];
  return { solid: s, glass: g, lamp };
}

const LOOKS = [93, 97, 101];

/** The guard on duty and (during a handover) the guard going off, moved every frame from their FrontGuard. A hand raised
 * to a driver only when `raiseFor` says so (the car park's gate), and never while walking or in the cabin. */
function Guards({ guard, looks, name, raiseFor }: { guard: FrontGuard; looks: readonly number[]; name: string; raiseFor?: () => boolean }) {
  const duty = useRef<Group>(null);
  const off = useRef<Group>(null);
  const raise = useMemo(() => ({ current: 0 }), []);
  const [state, setState] = useState(() => ({ shift: guard.shift, walking: false, leaving: false, offWalking: true }));
  useFrame(() => {
    const f = guard.figures();
    duty.current?.position.set(f.duty.at[0], 0, f.duty.at[1]);
    if (duty.current) duty.current.rotation.y = f.duty.heading;
    if (off.current && f.leaving) {
      off.current.position.set(f.leaving.at[0], 0, f.leaving.at[1]);
      off.current.rotation.y = f.leaving.heading;
    }
    const wave = raiseFor?.() === true && !f.duty.walking && !guard.sheltered();
    raise.current += ((wave ? 0.55 : 0) - raise.current) * Math.min(1, motion.dt * 4 + 0.02);
    const next = { shift: guard.shift, walking: f.duty.walking, leaving: f.leaving !== null, offWalking: f.leaving?.walking ?? true };
    if (next.shift !== state.shift || next.walking !== state.walking || next.leaving !== state.leaving || next.offWalking !== state.offWalking) setState(next);
  });
  const prev = ((state.shift + 2) % 3) as 0 | 1 | 2;
  return (
    <>
      <group ref={duty} name={name}>
        <CustomerFigure index={looks[state.shift]!} shirt="#1e3a5f" walking stride={state.walking ? 1 : 0} scale={0.72} wear="guard" raise={raise} />
      </group>
      {state.leaving && (
        <group ref={off} name={`${name}-off-duty`}>
          <CustomerFigure index={looks[prev]!} shirt="#1e3a5f" walking stride={state.offWalking ? 1 : 0} scale={0.72} wear="guard" />
        </group>
      )}
    </>
  );
}

/**
 * A guard's cabin and the guards who keep it (`plan`, guardCabin.ts): the front entrance's by default, or the car park's.
 * Stepped on the motion clock, so frozen on pause.
 */
export const GuardCabin3D = memo(function GuardCabin3D({ plan = FRONT_PLAN, name = 'guard-cabin', guardName = 'front-guard', looks = LOOKS, raiseFor }: { plan?: GuardPostPlan; name?: string; guardName?: string; looks?: readonly number[]; raiseFor?: () => boolean }) {
  const { x, z, w, d, h } = plan.cabin;
  const parts = useMemo(() => cabinParts(plan.cabin), [plan]);
  const body = useMerged(() => parts.solid, [parts]);
  const glass = useMerged(() => parts.glass, [parts]);
  const lamp = useMerged(() => parts.lamp, [parts]);
  const light = useRef<MeshBasicMaterial>(null);
  const guard = useMemo(() => {
    const st = bankStore.getState();
    return new FrontGuard(st.view.minute, wetNow(), plan);
  }, [plan]);
  useFrame(() => {
    const minute = bankStore.getState().view.minute;
    for (const dt of substeps(motion.dt)) guard.step(dt, minute, wetNow());
    // The lamp inside: always on, brightest after dark and in the gloom of bad weather.
    if (light.current) light.current.opacity = 0.1 + 0.28 * atmosphereAt(minute, liveMix).lamps;
  }, -1);
  return (
    <group name={name}>
      <mesh geometry={body} material={solid} castShadow receiveShadow />
      <mesh geometry={glass} material={pane} />
      <mesh geometry={lamp} material={glow} />
      {/* The lamp's glow on the inside of the cabin. */}
      <mesh position={[x, h - 0.4, z]}>
        <boxGeometry args={[w - 0.12, 0.7, d - 0.12]} />
        <meshBasicMaterial ref={light} color="#ffe8a3" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
      </mesh>
      <Sign text="SECURITY" fg="#ffffff" bg="#1e3a8a" position={[x, h + 0.3, z + d / 2 + 0.24]} width={1.1} />
      <Guards guard={guard} looks={looks} name={guardName} raiseFor={raiseFor} />
    </group>
  );
});

/** Rain, a storm, hail or snow: weather a guard waits out in the cabin. */
const wetNow = (): boolean => ['rain', 'storm', 'hail', 'snow'].includes(weatherStore.getState().weather);
