import { useMessages } from '../../../utils/i18nHelper';
import { useDeskStatus, useDeskStatusLine } from '../useSimulation';
import { deskBadgeMessages } from '../deskBadge.messages';
import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Vector3, type Group, type Mesh } from 'three';
import { STATIONS, type StationId } from '../../../sim/topology';
import { bankStore, useBankStore } from '../../../store/bankStore';
import { pickPlace, useTourLit } from './tourHooks';
import { useTerms } from '../useTerms';
import { CustomerFigure, SeatedAvatar } from './Avatars';
import { deskGlow, deskSolid, isPodium, SURFACE } from './desks';
import { box, merge } from './kit';
import { COUNTER, LANE_LABELS, WING, accentOf, customerShirt, deskPose, hasWing, queueStyle, seatOffsets, surgeLevel, wingPose } from '../../../engine/plan/layout3d';
import { blobMaterial, glow, solid } from './materials';
import { STATUS_HEX } from './palette';
import { cursor } from './cursor';
import { isAutomatedNode } from '../../../sim/nodeKind';
import { ServerRack3D } from './ServerRack3D';
import { badgeRect, isOffShift, tipSide3d, type TipSide3d } from './focus3d';
import { useFocusFade } from './useFocusFade';
import { t } from '../../../i18n/t';
import { routingRules } from '../../../engine/plan/routingRules';
import { motion } from '../../../engine/simulation/motion';
import { DeskLine, StaffWalks, type Served, type StaffWalk } from '../../../engine/simulation/people';
import { usePeopleVersion, useWorld } from './WorldProvider';
import { ACCUMULATING, badgeMode, badgePills, lodShows, useLabelLod, type LabelLod } from './labelLod';
export { SERVED, STEP_UP_PACE } from '../../../engine/simulation/people';

export { cursor } from './cursor';

/** A glowing outline on the floor around a selected desk: four thin bars. */
export function SelectionFrame({ w, d }: { w: number; d: number }) {
  const t = 0.1;
  const bars: Array<[number, number, number, number]> = [
    [0, -d / 2, w, t],
    [0, d / 2, w, t],
    [-w / 2, 0, t, d],
    [w / 2, 0, t, d],
  ];
  return (
    <group position={[0, 0.045, 0]} name="office-selection">
      {bars.map(([x, z, bw, bd], i) => (
        <mesh key={i} position={[x, 0, z]}>
          <boxGeometry args={[bw, 0.02, bd]} />
          <meshBasicMaterial color="#0ea5e9" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** The desk's lamp: a bulb on a post. It pulses when the desk is in trouble. */
function Lamp({ status }: { status: keyof typeof STATUS_HEX }) {
  const bulb = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!bulb.current) return;
    const speed = status === 'ALERT' ? 8 : status === 'CONGESTED' ? 3.2 : 0;
    const s = speed ? 1 + Math.sin(clock.elapsedTime * speed) * 0.22 : 1;
    bulb.current.scale.setScalar(s);
  });
  const hex = STATUS_HEX[status];
  return (
    <group position={[COUNTER.w / 2 - 0.14, SURFACE, 0.27]}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.4, 6]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      <mesh ref={bulb} position={[0, 0.46, 0]}>
        <sphereGeometry args={[0.09, 12, 8]} />
        <meshBasicMaterial color={hex} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The furniture of a desk: the counter or podium, monitors, props. Rebuilt only when the staff change. */
function DeskBody({ id, accent }: { id: StationId; accent: string }) {
  const staff = useBankStore((s) => s.view.stations[id].workers.length);
  const workingKey = useBankStore((s) => s.view.stations[id].workers.map((w) => (w.working ? '1' : '0')).join(''));
  const status = useBankStore((s) => s.view.stations[id].status);
  const selected = useBankStore((s) => s.selection.kind === 'station' && s.selection.id === id);
  const setHoverPlace = useBankStore((s) => s.setHoverPlace);
  const [hover, setHover] = useState(false);

  const body = useMemo(() => merge(deskSolid(id, staff, accent)), [id, staff, accent]);
  const lights = useMemo(
    () =>
      merge(
        deskGlow(
          id,
          staff,
          [...workingKey].map((c) => c === '1'),
          accent,
        ),
      ),
    [id, staff, workingKey, accent],
  );
  useEffect(() => () => body.dispose(), [body]);
  useEffect(() => () => lights.dispose(), [lights]);
  useEffect(
    () => () => {
      cursor(false);
      setHoverPlace(null);
    },
    [setHoverPlace],
  );

  const click = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    if (e.delta > 4) return;
    pickPlace(id);
  };
  const over = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation();
    setHover(true);
    setHoverPlace(id);
    cursor(true);
  };
  const out = (): void => {
    setHover(false);
    setHoverPlace(null);
    cursor(false);
  };

  const wing = !isPodium(id) && hasWing(staff) ? wingPose() : null;
  const hex = STATUS_HEX[status];

  return (
    <group name={`desk-${id}`}>
      <mesh geometry={body} material={solid} castShadow receiveShadow />
      <mesh geometry={lights} material={glow} />
      {/* the desk's state, along the front edge of the top */}
      <mesh position={[0, SURFACE - 0.035, COUNTER.d / 2 + 0.056]}>
        <boxGeometry args={[COUNTER.w - 0.3, 0.035, 0.014]} />
        <meshBasicMaterial color={hex} toneMapped={false} />
      </mesh>
      <Lamp status={status} />
      {/* a soft smudge under the desk */}
      <mesh position={[wing ? 0.35 : 0, 0.02, wing ? -0.5 : 0]} rotation={[-Math.PI / 2, 0, 0]} material={blobMaterial()}>
        <planeGeometry args={[COUNTER.w + 1.6, COUNTER.d + (wing ? WING.len : 0) + 1.5]} />
      </mesh>
      {(hover || selected) && (
        <mesh position={[0, SURFACE + 0.008, 0]}>
          <boxGeometry args={[COUNTER.w + 0.1, 0.012, COUNTER.d + 0.1]} />
          <meshBasicMaterial color={selected ? '#7dd3fc' : '#ffffff'} transparent opacity={selected ? 0.4 : 0.3} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {/* invisible boxes that catch the pointer: the counter, and the return behind it */}
      <mesh visible={false} position={[0, 0.65, 0]} onClick={click} onPointerOver={over} onPointerOut={out}>
        <boxGeometry args={[COUNTER.w + 0.2, 1.3, COUNTER.d + 0.2]} />
      </mesh>
      {wing && (
        <mesh visible={false} position={[wing.x, 0.5, wing.z]} onClick={click} onPointerOver={over} onPointerOut={out}>
          <boxGeometry args={[wing.w, 1.0, wing.d]} />
        </mesh>
      )}
      {selected && <SelectionFrame w={COUNTER.w + 0.5} d={COUNTER.d + 0.5} />}
    </group>
  );
}

/** Who works the desk: people on a human desk, server racks on an automated node (sim/nodeKind.ts). */
/** Who is walking to or from a desk: their way (home, or in to their seat), and how long they have been walking (seconds of drawn time). */
/** Staff walking in before their shift and home at its end (WorldEngine.staff): this only draws them. */
function StaffWalker({ walks, walk, pose, accent }: { walks: StaffWalks; walk: StaffWalk; pose: ReturnType<typeof deskPose>; accent: string }) {
  const root = useRef<Group>(null);
  useFrame(() => {
    const s = walks.poseOf(walk);
    if (!root.current) return;
    // The desk's group is the origin, so the walker is placed relative to it.
    root.current.position.set(s.at[0] - pose.x, 0, s.at[1] - pose.z);
    root.current.rotation.y = s.heading;
  });
  return (
    <group ref={root} name={`leaving-${walk.id}`}>
      <CustomerFigure index={walk.index + 70} shirt={accent} phase={walk.index} walking tempo={walk.arriving ? 1.6 : 1} scale={0.8} />
    </group>
  );
}

function DeskStaff({ id, accent }: { id: StationId; accent: string }) {
  const automated = isAutomatedNode(id);
  const pose = useMemo(() => deskPose(id), [id]);
  const walks = useWorld().staff(id);
  usePeopleVersion((w) => w.staff(id).version);
  return (
    <>
      <DeskSeats id={id} accent={accent} absent={walks.absent()} early={walks.early} />
      {!automated && walks.walks.map((w) => <StaffWalker key={w.id} walks={walks} walk={w} pose={pose} accent={accent} />)}
    </>
  );
}

function DeskSeats({ id, accent, absent, early }: { id: StationId; accent: string; absent: ReadonlySet<string>; early: ReadonlySet<string> }) {
  const workers = useBankStore((s) => s.view.stations[id].workers);
  const surge = useBankStore((s) => surgeLevel(s.view.stations[id].queueLength, s.view.stations[id].status));
  const selectedWorker = useBankStore((s) => (s.selection.kind === 'worker' && s.selection.station === id ? s.selection.workerId : null));
  const select = useBankStore((s) => s.select);
  const seats = useMemo(() => seatOffsets(workers.length), [workers.length]);
  const automated = isAutomatedNode(id);
  return (
    <>
      {workers.map((w, i) => {
        const seat = seats[i];
        // Gone home, or not in yet: the chair is empty (a machine is never off shift). The night's staff, in early, sit ready.
        if (!seat || absent.has(w.id) || (!automated && isOffShift(w.activity) && !early.has(w.id))) return null;
        return (
          <group key={w.id} position={[seat[0], 0, seat[1]]}>
            {automated ? (
              <ServerRack3D
                load={w.fatigue}
                working={w.working}
                temp={w.temp}
                accent={accent}
                selected={selectedWorker === w.id}
                onSelect={() => (bankStore.getState().spotlight ? pickPlace(id) : select({ kind: 'worker', station: id, workerId: w.id }))}
              />
            ) : (
            <SeatedAvatar
              id={w.id}
              profile={w.profile}
              working={w.working}
              fatigue={w.fatigue}
              productivity={w.productivity}
              surge={surge}
              temp={w.temp}
              accent={accent}
              selected={selectedWorker === w.id}
              onSelect={() => (bankStore.getState().spotlight ? pickPlace(id) : select({ kind: 'worker', station: id, workerId: w.id }))}
            />
            )}
          </group>
        );
      })}
    </>
  );
}

/** A transfer waiting in the queue: a phone standing on its end, glowing teal, with a little bolt. */
function PhoneToken({ phase }: { phase: number }) {
  const body = useMemo(
    () => merge([box([0, 0.5, 0], [0.2, 0.36, 0.035], '#1e293b'), box([0, 0.13, 0], [0.12, 0.26, 0.05], '#475569')]),
    [],
  );
  const lit = useMemo(() => merge([box([0, 0.5, 0.019], [0.17, 0.3, 0.004], '#ccfbf1'), box([0, 0.56, 0.023], [0.05, 0.1, 0.004], '#14b8a6', [0, 0, 0.5]), box([0, 0.46, 0.023], [0.05, 0.08, 0.004], '#14b8a6', [0, 0, -0.5])]), []);
  const group = useRef<Group>(null);
  useFrame(() => {
    if (group.current) group.current.position.y = 0.32 + Math.sin(motion.t * 1.8 + phase) * 0.04;
  });
  useEffect(
    () => () => {
      body.dispose();
      lit.dispose();
    },
    [body, lit],
  );
  return (
    <group ref={group}>
      <mesh geometry={body} material={solid} castShadow />
      <mesh geometry={lit} material={glow} />
    </group>
  );
}

/** The customer at an ATM, facing its panel and keying in: the right hand goes out to the keypad and taps it in short bursts, with a pause now and then to read the screen. */
function AtmUser({ index, shirt, phase }: { index: number; shirt: string; phase: number }) {
  const reach = useMemo(() => ({ current: 0.42 }), []);
  useFrame(() => {
    const t = motion.t + phase;
    const reading = Math.sin(t * 0.7) > 0.55;
    reach.current = reading ? 0.3 : atmPress(t);
  });
  return <CustomerFigure index={index} shirt={shirt} phase={phase} walking stride={0} raise={reach} />;
}

/** The arm's reach while keying in at time `t`: out to the keypad (about 0.42) with a quick tap down and up on each press. */
export const atmPress = (t: number): number => 0.42 + 0.05 * Math.max(0, Math.sin(t * 9));

/** The customer at the front of a counter's line, talking to the teller: the right hand comes up now and then as they explain, and goes back down while they listen. */
function CounterUser({ index, shirt, phase }: { index: number; shirt: string; phase: number }) {
  const hand = useMemo(() => ({ current: 0 }), []);
  useFrame(() => {
    hand.current = counterGesture(motion.t + phase);
  });
  return <CustomerFigure index={index} shirt={shirt} phase={phase} walking stride={0} raise={hand} />;
}

/** How far the hand is up while talking at a counter at time `t`: down while listening, a little up and moving while speaking. */
export const counterGesture = (t: number): number => (Math.sin(t * 0.8) > 0 ? 0.1 + 0.08 * Math.max(0, Math.sin(t * 3.1)) : 0);

/** Someone served at a desk, drawn where their journey has them (WorldEngine.line(id).servedPoses); the hand keys in or gestures while they do their business. */
function ServedCustomer({ id, s, line }: { id: StationId; s: Served; line: DeskLine }) {
  const pose = useMemo(() => deskPose(id), [id]);
  const g = useRef<Group>(null);
  const stride = useMemo(() => ({ current: 0 }), []);
  const hand = useMemo(() => ({ current: 0 }), []);
  const atm = STATIONS[id].kind === 'ATM';
  useFrame(() => {
    const el = g.current;
    const now = line.servedPoses.get(s.key);
    if (!el || !now) return;
    el.position.set(now.at[0] - pose.x, 0, now.at[1] - pose.z);
    el.rotation.y = now.yaw;
    stride.current = now.walking ? 1 : 0;
    hand.current = now.busy ? (atm ? atmPress(motion.t) : counterGesture(motion.t)) : 0;
  });
  const [x, z] = s.path[0]!;
  return (
    <group ref={g} position={[x - pose.x, 0, z - pose.z]} rotation={[0, Math.PI, 0]}>
      <CustomerFigure index={s.who} shirt={customerShirt(s.who * 3 + 1)} phase={s.key * 0.7} walking stride={stride} raise={hand} />
    </group>
  );
}

/** A case waiting at an internal desk: a wire tray on a short stand with a few case folders in it, a coloured tab on top. */
function FileToken({ phase, tab }: { phase: number; tab: string }) {
  const body = useMemo(
    () =>
      merge([
        box([0, 0.2, 0], [0.05, 0.4, 0.05], '#64748b'),
        box([0, 0.42, 0], [0.42, 0.03, 0.3], '#94a3b8'),
        box([0, 0.46, 0], [0.36, 0.05, 0.26], '#f8fafc'),
        box([0.01, 0.5, 0.01], [0.36, 0.03, 0.26], '#e7d7b1'),
        box([-0.01, 0.53, -0.01], [0.36, 0.03, 0.26], '#f1e4c3'),
      ]),
    [],
  );
  const lit = useMemo(() => merge([box([0.12, 0.56, -0.1], [0.1, 0.02, 0.05], tab)]), [tab]);
  const group = useRef<Group>(null);
  useFrame(() => {
    // A slight sway, as if just set down.
    if (group.current) group.current.rotation.y = Math.sin(motion.t * 1.1 + phase) * 0.06;
  });
  useEffect(
    () => () => {
      body.dispose();
      lit.dispose();
    },
    [body, lit],
  );
  return (
    <group ref={group}>
      <mesh geometry={body} material={solid} castShadow />
      <mesh geometry={lit} material={glow} />
    </group>
  );
}

/** What waits at the front of a desk, drawn from the world engine's line (WorldEngine.line). */
export function DeskQueue({ id }: { id: StationId }) {
  const line = useWorld().line(id);
  usePeopleVersion((w) => w.line(id).version);
  const style = queueStyle(id);
  const atm = STATIONS[id].kind === 'ATM';
  const { shown, processed, salt } = line;
  const groups = useRef<Array<Group | null>>([]);
  useFrame(() => {
    groups.current.forEach((g, i) => {
      const f = line.figures[i];
      if (!g || !f) return;
      g.visible = f.visible;
      g.position.set(f.x, 0, f.z);
    });
  });
  return (
    <>
      {Array.from({ length: shown }, (_, i) => {
        const who = processed + i + salt;
        return (
          <group
            key={i}
            ref={(g) => {
              groups.current[i] = g;
            }}
            rotation={[0, Math.PI, 0]}
            visible={false}
          >
            {style === 'phones' ? (
              <PhoneToken phase={i * 0.9 + salt} />
            ) : style === 'files' ? (
              <FileToken phase={i * 0.9 + salt} tab={accentOf(id)} />
            ) : i === 0 && atm ? (
              <AtmUser index={who} shirt={customerShirt(who * 3 + 1)} phase={salt} />
            ) : i === 0 ? (
              <CounterUser index={who} shirt={customerShirt(who * 3 + 1)} phase={salt} />
            ) : (
              <CustomerFigure index={who} shirt={customerShirt(who * 3 + 1)} phase={i * 0.9 + salt} />
            )}
          </group>
        );
      })}
      {line.served.map((s) => (
        <ServedCustomer key={s.key} id={id} s={s} line={line} />
      ))}
    </>
  );
}

/** The floating badge above a desk: its name and how many are waiting. */
export function DeskPin({ id, height }: { id: StationId; height?: number }) {
  // The same status stream the 2D desk cards read (SimulationEngine.desks).
  const { status, waiting: queueLength, working } = useDeskStatus(id);
  const selected = useBankStore((s) => s.selection.kind === 'station' && s.selection.id === id);
  const always = useBankStore((s) => s.labelMode === 'always');
  const hovered = useBankStore((s) => s.hoverPlace === id);
  // During a tour only the desks of the chapter wear a badge, so the lit desks are easy to find; a desk under the pointer always does.
  const lit = useTourLit(id);
  // Only desks with something active (waiting + working > 0) wear a badge; one with nothing shows its badge only when pointed at or picked (badgeMode).
  const mode = badgeMode({ hovered, selected, lit, always, waiting: queueLength, working, accumulates: ACCUMULATING.has(id) });
  const terms = useTerms();
  const top = height ?? (isPodium(id) ? 2.6 : 2.3);
  // Zoomed out the badge folds to its dot and count; a desk pointed at or picked always says everything; a compact one is always just its dot and count.
  const zoomLod = useLabelLod();
  const lod = hovered || selected ? 'near' : mode === 'compact' ? 'far' : zoomLod;
  return (
    <>
      {hovered && <DeskTooltip3D id={id} top={top} />}
      {mode !== 'hidden' && <PinBadge id={id} top={top} status={status} queueLength={queueLength} working={working} selected={selected} name={terms.station(id)} lod={lod} quiet={!hovered && !selected} />}
    </>
  );
}

/** The description that opens above a desk while it is pointed at, over everything in the scene. */
/** The description's size on screen, for placing it (its real height varies a little with the rules it lists). */
const TIP_3D = { w: 260, h: 176 } as const;

/** How the description is shifted off its anchor point for each side (it is drawn from that point by CSS). */
const TIP_SHIFT: Record<TipSide3d, string> = {
  above: 'translate(-50%, calc(-100% - 10px))',
  below: 'translate(-50%, 10px)',
  right: 'translate(10px, -50%)',
  left: 'translate(calc(-100% - 10px), -50%)',
};

const projected = new Vector3();

/** Where the description opens: the side (tipSide3d) whose card covers none of this desk's own condition badges on screen, from an anchor on that side of the desk. */
function useTipPlacement(id: StationId, top: number): { side: TipSide3d; at: [number, number, number] } {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  return useMemo(() => {
    const pose = deskPose(id);
    const local: Record<TipSide3d, [number, number, number]> = {
      above: [0, top + 0.35, 0.1],
      below: [0, 0.1, pose.d / 2 + 0.3],
      right: [pose.w / 2 + 0.3, top * 0.55, 0],
      left: [-pose.w / 2 - 0.3, top * 0.55, 0],
    };
    const toScreen = (x: number, y: number, z: number) => {
      projected.set(x, y, z).project(camera);
      return { x: ((projected.x + 1) / 2) * size.width, y: ((1 - projected.y) / 2) * size.height };
    };
    const anchors = Object.fromEntries((Object.keys(local) as TipSide3d[]).map((s) => [s, toScreen(pose.x + local[s][0], local[s][1], pose.z + local[s][2])])) as Record<TipSide3d, { x: number; y: number }>;
    // CSS pixels to a world unit, from two projected points a unit apart.
    const a = toScreen(0, 0, 0);
    const b = toScreen(0, 1, 0);
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    const badges = LANE_LABELS.filter((l) => l.from === id || l.to === id).map((l) => badgeRect(toScreen(l.at[0], 0.36, l.at[1]), t(l.text).length, px));
    const side = tipSide3d(anchors, TIP_3D, badges, { w: size.width, h: size.height });
    return { side, at: local[side] };
  }, [id, top, camera, size]);
}

function DeskTooltip3D({ id, top }: { id: StationId; top: number }) {
  // The same "X waiting · Y working · status" line as the 2D desk card's tooltip.
  const { line } = useDeskStatusLine(id);
  const terms = useTerms();
  const rules = routingRules(id);
  const { side, at } = useTipPlacement(id, top);
  return (
    // Above the badges' layer (the canvas) and every other overlay, on the side where it hides none of this desk's badges.
    <Html position={at} zIndexRange={[60, 50]} style={{ pointerEvents: 'none' }}>
      <div
        role="tooltip"
        data-testid={`desk-tip-${id}`}
        data-side={side}
        style={{ transform: TIP_SHIFT[side] }}
        className="w-[260px] rounded-lg border border-slate-500 bg-slate-900 px-3 py-2 text-left shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
      >
        <div className="text-[13px] font-semibold leading-snug text-slate-50">{terms.stationTitle(id)}</div>
        <p className="mt-0.5 text-[12px] leading-snug text-slate-300">{terms.tip(id)}</p>
        {(rules.pass.length > 0 || rules.decline.length > 0) && (
          <dl className="mt-1.5 space-y-0.5 text-[11.5px] leading-snug">
            {rules.pass.length > 0 && (
              <div>
                <dt className="inline font-semibold text-emerald-300">{t('Passes when')}: </dt>
                <dd className="inline text-slate-200">{rules.pass.map((l) => t(l)).join(' · ')}</dd>
              </div>
            )}
            {rules.decline.length > 0 && (
              <div>
                <dt className="inline font-semibold text-rose-300">{t('Declines when')}: </dt>
                <dd className="inline text-slate-200">{rules.decline.map((l) => t(l)).join(' · ')}</dd>
              </div>
            )}
          </dl>
        )}
        <span className="mt-1.5 inline-block rounded bg-slate-800 px-1.5 py-px text-[11px] font-semibold text-slate-200">
          {line}
        </span>
      </div>
    </Html>
  );
}

/** The badge itself: the status dot, the desk's name, how many are waiting ("3 waiting", amber when anyone is), and beside it a green "2 working" while cases are being worked on at the counter, so a busy desk with an empty queue never reads as idle. */
function PinBadge({ id, top, status, queueLength, working, selected, name, lod, quiet }: { id: StationId; top: number; status: keyof typeof STATUS_HEX; queueLength: number; working: number; selected: boolean; name: string; lod: LabelLod; quiet: boolean }) {
  const bm = useMessages(deskBadgeMessages);
  const shows = lodShows(lod);
  // Never a pill that says 0: the total active zoomed out, "X waiting" and "Y working" closer, each only when not 0.
  const pills = badgePills({ waiting: queueLength, working, lod });
  return (
    <Html position={[0, top, 0.1]} center zIndexRange={[20, 0]}>
      <button
        type="button"
        onClick={() => pickPlace(id)}
        data-testid={`pin-${id}`}
        data-selected={selected}
        data-lod={lod}
        // Not pointed at or picked, it lets the payments flying past behind it show through.
        data-quiet={quiet}
        title={STATIONS[id].name}
        className="flex items-center gap-1 whitespace-nowrap rounded-full border border-white bg-white/95 py-[2px] pl-1.5 pr-[2px] text-[10px] font-semibold text-slate-700 shadow-[0_2px_6px_rgba(60,40,20,0.28)] transition-transform hover:-translate-y-0.5 data-[selected=true]:border-sky-400 data-[selected=true]:ring-2 data-[selected=true]:ring-sky-300 data-[quiet=true]:opacity-75 hover:opacity-100"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_HEX[status] }} />
        {shows.name && <span className="pc-lod-in max-w-[118px] truncate">{name}</span>}
        {pills.total !== null && (
          <span className="min-w-[16px] shrink-0 rounded-full px-1 text-center tabular-nums" style={queueLength > 0 ? { background: '#fde68a', color: '#78350f' } : { background: '#d1fae5', color: '#065f46' }} data-testid={`pin-total-${id}`}>
            {pills.total}
          </span>
        )}
        {pills.waiting !== null && (
          <span className="min-w-[16px] shrink-0 rounded-full px-1 text-center tabular-nums" style={{ background: '#fde68a', color: '#78350f' }} data-testid={`pin-waiting-${id}`}>
            {pills.waiting} {t('waiting')}
          </span>
        )}
        {pills.working !== null && (
          <span className="pc-lod-in flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1 text-emerald-800" data-testid={`pin-working-${id}`}>
            <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-500" />
            {bm('working', { n: pills.working })}
          </span>
        )}
      </button>
    </Html>
  );
}

/** One desk of the bank, standing in the office. */
export const Desk3D = memo(function Desk3D({ id }: { id: StationId }) {
  const pose = useMemo(() => deskPose(id), [id]);
  const accent = accentOf(id);
  const root = useRef<Group>(null);
  // Fades with the rest of the office when another desk is pointed at, or a guided scenario leaves this one out.
  useFocusFade(root, id);
  return (
    <group ref={root} position={[pose.x, 0, pose.z]}>
      <DeskBody id={id} accent={accent} />
      <DeskStaff id={id} accent={accent} />
      <DeskQueue id={id} />
      <DeskPin id={id} />
    </group>
  );
});
