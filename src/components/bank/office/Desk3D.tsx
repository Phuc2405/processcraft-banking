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
import { COUNTER, LANE_LABELS, WING, accentOf, customerShirt, deskPose, hasWing, queueSlots, queueStyle, seatOffsets, surgeLevel, wingPose, type V2 } from './layout3d';
import { blobMaterial, glow, solid } from './materials';
import { STATUS_HEX } from './palette';
import { cursor } from './cursor';
import { isAutomatedNode } from '../../../sim/nodeKind';
import { ServerRack3D } from './ServerRack3D';
import { badgeRect, isOffShift, leaveAt, leaveRoute, tipSide3d, type TipSide3d } from './focus3d';
import { useFocusFade } from './useFocusFade';
import { t } from '../../../i18n/t';
import { routingRules } from '../routingRules';
import { statusLabel } from '../ui';
import { motion } from './motion';
import { CUSTOMER_DESKS, isClosed } from './evacuation';

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

/**
 * Who works the desk: people on a human desk, server racks on an automated node (sim/nodeKind.ts). A rack stands in the seat
 * of the thread it represents, so the count follows the engine's workers and clicking a rack selects that thread.
 */
/** Who is walking home from a desk: their seat, and how long they have been walking (seconds of drawn time). */
interface Leaver {
  id: string;
  seat: V2;
  t: number;
  index: number;
}

/**
 * Staff going home. When the simulation sends someone off shift (its "Off shift…" or "Desk closed…" words), they get up,
 * walk along the back of the counter, down the aisle beside the desk and out of the front of the branch onto the pavement,
 * and are gone. Someone already off shift when the office opens is simply not at their seat.
 */
function LeavingStaff({ id, accent, leavers, onGone }: { id: StationId; accent: string; leavers: readonly Leaver[]; onGone: (who: string) => void }) {
  const pose = useMemo(() => deskPose(id), [id]);
  return (
    <>
      {leavers.map((l) => (
        <Leaving key={l.id} leaver={l} pose={pose} accent={accent} onGone={onGone} />
      ))}
    </>
  );
}

function Leaving({ leaver, pose, accent, onGone }: { leaver: Leaver; pose: ReturnType<typeof deskPose>; accent: string; onGone: (who: string) => void }) {
  const root = useRef<Group>(null);
  const route = useMemo(() => leaveRoute(pose, leaver.seat), [pose, leaver.seat]);
  const gone = useRef(false);
  useFrame(() => {
    leaver.t += motion.dt;
    const s = leaveAt(route, leaver.t);
    if (root.current) {
      // The desk's group is the origin, so the walker is placed relative to it.
      root.current.position.set(s.at[0] - pose.x, 0, s.at[1] - pose.z);
      root.current.rotation.y = s.heading;
    }
    if (s.done && !gone.current) {
      gone.current = true;
      onGone(leaver.id);
    }
  });
  return (
    <group ref={root} name={`leaving-${leaver.id}`}>
      <CustomerFigure index={leaver.index + 70} shirt={accent} phase={leaver.index} walking scale={0.8} />
    </group>
  );
}

function DeskStaff({ id, accent }: { id: StationId; accent: string }) {
  const workers = useBankStore((s) => s.view.stations[id].workers);
  const automated = isAutomatedNode(id);
  // Who was on shift at the last look, so someone going off shift now (not already off when the office opened) walks out.
  const onShift = useRef<Map<string, boolean> | null>(null);
  const [leavers, setLeavers] = useState<Leaver[]>([]);
  const seatsNow = useMemo(() => seatOffsets(workers.length), [workers.length]);
  useEffect(() => {
    const was = onShift.current;
    const next = new Map(workers.map((w) => [w.id, automated || !isOffShift(w.activity)]));
    if (was) {
      const going = workers.flatMap((w, i) => (was.get(w.id) === true && next.get(w.id) === false && seatsNow[i] ? [{ id: w.id, seat: seatsNow[i]!, t: 0, index: i }] : []));
      if (going.length) setLeavers((l) => [...l.filter((x) => !going.some((g) => g.id === x.id)), ...going]);
      // Back on shift (the next morning): no longer walking out.
      const back = workers.filter((w) => was.get(w.id) === false && next.get(w.id) === true).map((w) => w.id);
      if (back.length) setLeavers((l) => l.filter((x) => !back.includes(x.id)));
    }
    onShift.current = next;
  }, [workers, automated, seatsNow]);
  const gone = useMemo(() => (who: string) => setLeavers((l) => l.filter((x) => x.id !== who)), []);
  return (
    <>
      <DeskSeats id={id} accent={accent} />
      {!automated && leavers.length > 0 && <LeavingStaff id={id} accent={accent} leavers={leavers} onGone={gone} />}
    </>
  );
}

function DeskSeats({ id, accent }: { id: StationId; accent: string }) {
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
        // Gone home: the chair is empty (a machine is never off shift).
        if (!seat || (!automated && isOffShift(w.activity))) return null;
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

/** The customers waiting at the front of the counter. Each takes the look of whoever is next in line, so the line seems to move up. */
export function DeskQueue({ id }: { id: StationId }) {
  // After closing time nobody queues at a customer desk (they walked out at 17:00: see Evacuation).
  const closedHere = useBankStore((s) => CUSTOMER_DESKS.includes(id) && isClosed(s.view.minute));
  const simQueue = useBankStore((s) => s.view.stations[id].queueLength);
  const queueLength = closedHere ? 0 : simQueue;
  const processed = useBankStore((s) => s.view.stations[id].stats.processedToday);
  const pose = useMemo(() => deskPose(id), [id]);
  const phones = queueStyle(id) === 'phones';
  const slots = useMemo(() => queueSlots(id, queueLength).map(([x, z]) => [x - pose.x, z - pose.z] as const), [id, queueLength, pose.x, pose.z]);
  const salt = useMemo(() => Math.abs(Math.trunc(pose.x * 7 + pose.z * 13)), [pose.x, pose.z]);
  return (
    <>
      {slots.map(([x, z], i) => {
        const who = processed + i + salt;
        return (
          <group key={i} position={[x, 0, z]} rotation={[0, Math.PI, 0]}>
            {phones ? <PhoneToken phase={i * 0.9 + salt} /> : <CustomerFigure index={who} shirt={customerShirt(who * 3 + 1)} phase={i * 0.9 + salt} />}
          </group>
        );
      })}
    </>
  );
}

/**
 * The floating badge above a desk: its name and how many are waiting. Click it to open the inspector. In "Hover Only" label
 * mode it is hidden until the pointer is over its workstation, which keeps the diorama clean.
 */
export function DeskPin({ id, height }: { id: StationId; height?: number }) {
  const status = useBankStore((s) => s.view.stations[id].status);
  const queueLength = useBankStore((s) => s.view.stations[id].queueLength);
  const selected = useBankStore((s) => s.selection.kind === 'station' && s.selection.id === id);
  const always = useBankStore((s) => s.labelMode === 'always');
  const hovered = useBankStore((s) => s.hoverPlace === id);
  // During a tour only the desks of the chapter wear a badge, so the lit desks are easy to find; a desk under the pointer always does.
  const lit = useTourLit(id);
  const visible = hovered || (lit === null ? always : lit);
  const terms = useTerms();
  const top = height ?? (isPodium(id) ? 2.6 : 2.3);
  return (
    <>
      {hovered && <DeskTooltip3D id={id} top={top} />}
      {visible && <PinBadge id={id} top={top} status={status} queueLength={queueLength} selected={selected} name={terms.station(id)} />}
    </>
  );
}

/**
 * The description that opens above a desk while it is pointed at, over everything in the scene: its name, what it does, the
 * conditions that pass or decline a case there, and its status. Solid, so no floor, mesh or label shows through it.
 */
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

/**
 * Where the description opens: the side (tipSide3d) whose card covers none of this desk's own condition badges on screen,
 * from an anchor on that side of the desk: its top, its front, or its flanks.
 */
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
  const status = useBankStore((s) => s.view.stations[id].status);
  const queueLength = useBankStore((s) => s.view.stations[id].queueLength);
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
          {queueLength} {t('waiting')} · {statusLabel(status)}
        </span>
      </div>
    </Html>
  );
}

function PinBadge({ id, top, status, queueLength, selected, name }: { id: StationId; top: number; status: keyof typeof STATUS_HEX; queueLength: number; selected: boolean; name: string }) {
  return (
    <Html position={[0, top, 0.1]} center zIndexRange={[20, 0]}>
      <button
        type="button"
        onClick={() => pickPlace(id)}
        data-testid={`pin-${id}`}
        data-selected={selected}
        title={STATIONS[id].name}
        className="flex items-center gap-1 whitespace-nowrap rounded-full border border-white bg-white/95 py-[2px] pl-1.5 pr-[2px] text-[10px] font-semibold text-slate-700 shadow-[0_2px_6px_rgba(60,40,20,0.28)] transition-transform hover:-translate-y-0.5 data-[selected=true]:border-sky-400 data-[selected=true]:ring-2 data-[selected=true]:ring-sky-300"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_HEX[status] }} />
        <span className="max-w-[118px] truncate">{name}</span>
        <span className="min-w-[16px] shrink-0 rounded-full px-1 text-center tabular-nums" style={queueLength > 0 ? { background: '#fde68a', color: '#78350f' } : { background: '#e2e8f0', color: '#64748b' }}>
          {queueLength}
        </span>
      </button>
    </Html>
  );
}

/**
 * One desk of the bank, standing in the office. Everything is read from the same bank store as the 2D map; clicking the
 * counter, a person or the pin selects the station, so the inspector opens exactly as it does in 2D.
 */
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
