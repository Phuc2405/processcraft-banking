import { useMessages } from '../../../utils/i18nHelper';
import { useDeskStatus } from '../useSimulation';
import { deskBadgeMessages } from '../deskBadge.messages';
import { ATM_TURN_S } from './Traffic';
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
import { COUNTER, LANE_LABELS, QUEUE_VISIBLE, WING, accentOf, customerShirt, deskPose, hasWing, laneAt, laneLength, queueSalt, queueSlots, queueStyle, seatOffsets, surgeLevel, wingPose, type V2 } from './layout3d';
import { blobMaterial, glow, solid } from './materials';
import { STATUS_HEX } from './palette';
import { cursor } from './cursor';
import { isAutomatedNode } from '../../../sim/nodeKind';
import { ServerRack3D } from './ServerRack3D';
import { ARRIVE_SPEED, arriveRoute, arrivalState, badgeRect, LEAVE_SPEED, isOffShift, leaveAt, leaveRoute, tipSide3d, type TipSide3d } from './focus3d';
import { isNightStation } from '../../../sim/roster';
import { useFocusFade } from './useFocusFade';
import { t } from '../../../i18n/t';
import { routingRules } from '../routingRules';
import { statusLabel } from '../ui';
import { motion } from './motion';
import { CUSTOMER_DESKS, isClosed, servedExit } from './evacuation';
import { sidewalk } from './sidewalk';
import { queueHandoff } from './queueHandoff';
import { pointAlongPath } from './tour3d';

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
/** Who is walking to or from a desk: their way (home, or in to their seat), and how long they have been walking (seconds of
 * drawn time). */
interface Leaver {
  id: string;
  route: V2[];
  t: number;
  index: number;
  /** Coming in to work (their seat stays empty until they reach it), rather than going home. */
  arriving?: boolean;
}

/**
 * Staff coming and going. When the simulation sends someone off shift (its "Off shift…" or "Desk closed…" words), they get
 * up, walk along the back of the counter, down the aisle beside the desk, along the front of the hall and out of the main
 * entrance, and off down the street. Before their shift they come the same way in (focus3d.STAFF_ARRIVAL): the day's staff
 * between 08:00 and 08:30, the night's between 22:00 and 22:30, each walking in from down the street, through the main
 * entrance and up the aisles to their chair, and sitting down. Someone already off shift when the office opens is simply
 * not at their seat.
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
  const route = leaver.route;
  const gone = useRef(false);
  useFrame(() => {
    leaver.t += motion.dt;
    const s = leaveAt(route, leaver.t, leaver.arriving ? ARRIVE_SPEED : LEAVE_SPEED);
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
      <CustomerFigure index={leaver.index + 70} shirt={accent} phase={leaver.index} walking tempo={leaver.arriving ? 1.6 : 1} scale={0.8} />
    </group>
  );
}

function DeskStaff({ id, accent }: { id: StationId; accent: string }) {
  const workers = useBankStore((s) => s.view.stations[id].workers);
  const automated = isAutomatedNode(id);
  const pose = useMemo(() => deskPose(id), [id]);
  // Who is not in yet this morning (or tonight), and which of the night's staff has come in early and sits ready: as a key,
  // so the desk only redraws when someone arrives.
  const arrivalKey = useBankStore((s) => {
    if (automated) return '|';
    const st = arrivalState(isNightStation(id), s.view.stations[id].workers.map((w) => w.id), s.view.minute);
    return `${st.away.join(',')}|${st.early.join(',')}`;
  });
  const [awayKey = '', earlyKey = ''] = arrivalKey.split('|');
  const away = useMemo(() => new Set(awayKey ? awayKey.split(',') : []), [awayKey]);
  const early = useMemo(() => new Set(earlyKey ? earlyKey.split(',') : []), [earlyKey]);
  const wasAway = useRef<ReadonlySet<string> | null>(null);
  // Who was on shift at the last look, so someone going off shift now (not already off when the office opened) walks out.
  const onShift = useRef<Map<string, boolean> | null>(null);
  const [leavers, setLeavers] = useState<Leaver[]>([]);
  const seatsNow = useMemo(() => seatOffsets(workers.length), [workers.length]);
  useEffect(() => {
    const was = onShift.current;
    const next = new Map(workers.map((w) => [w.id, automated || !isOffShift(w.activity)]));
    if (was) {
      const going = workers.flatMap((w, i) => (was.get(w.id) === true && next.get(w.id) === false && seatsNow[i] ? [{ id: w.id, route: leaveRoute(pose, seatsNow[i]!, i), t: 0, index: i }] : []));
      if (going.length) setLeavers((l) => [...l.filter((x) => !going.some((g) => g.id === x.id)), ...going]);
      // Back on shift (the next morning): no longer walking out.
      const back = workers.filter((w) => was.get(w.id) === false && next.get(w.id) === true).map((w) => w.id);
      if (back.length) setLeavers((l) => l.filter((x) => !back.includes(x.id)));
    }
    onShift.current = next;
  }, [workers, automated, seatsNow, pose]);
  useEffect(() => {
    // Someone whose time to come in has just come (while the office was watching) walks in to their seat.
    const was = wasAway.current;
    wasAway.current = away;
    if (!was || automated) return;
    const coming = workers.flatMap((w, i) => (was.has(w.id) && !away.has(w.id) && seatsNow[i] ? [{ id: w.id, route: arriveRoute(pose, seatsNow[i]!, i), t: 0, index: i, arriving: true }] : []));
    if (coming.length) setLeavers((l) => [...l.filter((x) => !coming.some((c) => c.id === x.id)), ...coming]);
    // Read when the arrivals change; the desk's people and seats as they stand then.
  }, [away]); // eslint-disable-line react-hooks/exhaustive-deps
  const gone = useMemo(() => (who: string) => setLeavers((l) => l.filter((x) => x.id !== who)), []);
  // Empty seats: not in yet, or still on the way in.
  const absent = useMemo(() => new Set([...away, ...leavers.filter((l) => l.arriving).map((l) => l.id)]), [away, leavers]);
  return (
    <>
      <DeskSeats id={id} accent={accent} absent={absent} early={early} />
      {!automated && leavers.length > 0 && <LeavingStaff id={id} accent={accent} leavers={leavers} onGone={gone} />}
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

/**
 * The customer at an ATM, facing its panel and keying in: the right hand goes out to the keypad and taps it in short bursts,
 * with a pause now and then to read the screen. On the motion clock, so it stops on pause.
 */
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

/**
 * The customer at the front of a counter's line, talking to the teller: the right hand comes up now and then as they
 * explain, and goes back down while they listen. Standing still on their spot (only the arm moves).
 */
function CounterUser({ index, shirt, phase }: { index: number; shirt: string; phase: number }) {
  const hand = useMemo(() => ({ current: 0 }), []);
  useFrame(() => {
    hand.current = counterGesture(motion.t + phase);
  });
  return <CustomerFigure index={index} shirt={shirt} phase={phase} walking stride={0} raise={hand} />;
}

/** How far the hand is up while talking at a counter at time `t`: down while listening, a little up and moving while speaking. */
export const counterGesture = (t: number): number => (Math.sin(t * 0.8) > 0 ? 0.1 + 0.08 * Math.max(0, Math.sin(t * 3.1)) : 0);

/**
 * When someone has been served: how long they stay at the counter (finishing up) or the machine (taking their card and
 * cash) before walking off, the last `turn` of it turning round to face the way out; and how fast they walk away. `business`
 * is how long someone who walks up to an empty counter or machine stands at it doing their business (keying in, talking).
 */
export const SERVED = { counter: 1.1, atm: ATM_TURN_S, turn: 0.45, pace: 0.95, business: { atm: 3.5, counter: 4 } } as const;

interface Served {
  key: number;
  /** Who they are (their look), the same as when they stood in the line. */
  who: number;
  path: V2[];
  length: number;
  start: number;
  wait: number;
  /** How far along `path` the counter or machine is: 0 when they are already at it, else they walk up to it first and do
   * their business there (keying in, talking) through `wait`, then turn and go. */
  stopAt: number;
}

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Someone served at a desk, start to finish: walking up to the counter or machine (when they only got there after their
 * turn had come), standing at it facing it, keying in or talking, then turning round and walking away along their way out
 * (servedExit) until they are out of the branch or off down the street. Positions are the desk's own (the group sits at the
 * desk), worked out from the way out in the world. On the motion clock.
 */
function ServedCustomer({ id, s, onGone }: { id: StationId; s: Served; onGone: (key: number) => void }) {
  const pose = useMemo(() => deskPose(id), [id]);
  const g = useRef<Group>(null);
  const stride = useMemo(() => ({ current: 0 }), []);
  const hand = useMemo(() => ({ current: 0 }), []);
  const who = `served-${id}-${s.key}`;
  const atm = STATIONS[id].kind === 'ATM';
  useEffect(() => () => sidewalk.leave(who), [who]);
  useFrame(() => {
    const el = g.current;
    if (!el) return;
    const t = motion.t - s.start;
    const walkUp = s.stopAt / SERVED.pace;
    const place = (d: number): void => {
      const p = laneAt(s.path, d);
      // On the pavement they curve round the others there (sidewalk.ts).
      const [x, z] = sidewalk.place(who, p.x, p.z, motion.dt);
      el.position.set(x - pose.x, 0, z - pose.z);
      el.rotation.y = p.heading + Math.PI / 2;
      stride.current = 1;
      hand.current = 0;
    };
    if (t < walkUp) {
      place(t * SERVED.pace);
      return;
    }
    if (t < walkUp + s.wait) {
      // At the counter or machine, facing it: keying in or talking (when they came up to do their business here), then
      // turning round to the way out (never a snap).
      const at = pointAlongPath(s.path, s.stopAt);
      el.position.set(at[0] - pose.x, 0, at[1] - pose.z);
      const u = Math.max(0, Math.min(1, (t - walkUp - (s.wait - SERVED.turn)) / SERVED.turn));
      const out = laneAt(s.path, s.stopAt + 0.05).heading + Math.PI / 2;
      el.rotation.y = Math.PI + wrapAngle(out - Math.PI) * u * u * (3 - 2 * u);
      stride.current = 0;
      hand.current = s.stopAt > 0 && u === 0 ? (atm ? atmPress(motion.t) : counterGesture(motion.t)) : 0;
      return;
    }
    const d = s.stopAt + (t - walkUp - s.wait) * SERVED.pace;
    if (d >= s.length) {
      el.visible = false;
      onGone(s.key);
      return;
    }
    place(d);
  });
  const [x, z] = s.path[0]!;
  return (
    <group ref={g} position={[x - pose.x, 0, z - pose.z]} rotation={[0, Math.PI, 0]}>
      <CustomerFigure index={s.who} shirt={customerShirt(s.who * 3 + 1)} phase={s.key * 0.7} walking stride={stride} raise={hand} />
    </group>
  );
}

/**
 * A case waiting at an internal desk: a wire tray on a short stand with a few case folders in it, a coloured tab on top.
 * Only the bank's own staff and systems work these desks, so what queues there is paperwork, never a customer.
 */
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

/** How fast people in a queue walk up a place when the one in front is served (units a second on the motion clock). */
export const STEP_UP_PACE = 0.9;

/**
 * What waits at the front of the counter: customers at the desks customers come to (at an ATM, the one at the machine
 * keying in; at a counter, the one at the front talking to the teller), phones at a digital gate, case files at an internal
 * desk. Each place takes the look of whoever is next in line. When the one in front is served they finish up, turn round
 * and walk away (ServedCustomer: nobody vanishes at a counter or a machine), and once they have stepped clear everyone
 * walks up a place (on the motion clock): at an ATM, the next in the line behind the rope steps up to the machine.
 */
export function DeskQueue({ id }: { id: StationId }) {
  // After closing time nobody queues at a customer desk (they walked out at 17:00: see Evacuation).
  const closedHere = useBankStore((s) => CUSTOMER_DESKS.includes(id) && isClosed(s.view.minute));
  const simQueue = useBankStore((s) => s.view.stations[id].queueLength);
  const queueLength = closedHere ? 0 : simQueue;
  const processed = useBankStore((s) => s.view.stations[id].stats.processedToday);
  const pose = useMemo(() => deskPose(id), [id]);
  const style = queueStyle(id);
  const slots = useMemo(() => queueSlots(id, QUEUE_VISIBLE).map(([x, z]) => [x - pose.x, z - pose.z] as const), [id, pose.x, pose.z]);
  const shown = Math.min(queueLength, slots.length);
  const salt = useMemo(() => queueSalt(id), [id]);
  const groups = useRef<Array<Group | null>>([]);
  const placed = useRef<boolean[]>([]);
  const last = useRef(processed);
  const hold = useRef(0);
  const [leaving, setLeaving] = useState<readonly Served[]>([]);
  const nextKey = useRef(0);
  // How many of the line are standing in it (not still on their way to it: queueHandoff), as last drawn.
  const inLine = useRef(0);
  const atm = STATIONS[id].kind === 'ATM';
  useEffect(() => {
    const served = processed - last.current;
    const before = last.current;
    last.current = processed;
    if (served <= 0 || style === 'files') return;
    // Whoever was served (those who were at the front, up to two in a beat) finishes up, turns round and walks away.
    if (style === 'people' && !closedHere) {
      const wait = atm ? SERVED.atm : SERVED.counter;
      const out: Served[] = [];
      for (let j = 0; j < Math.min(2, served, inLine.current); j++) {
        const path = servedExit(id, j);
        out.push({ key: nextKey.current++, who: before + j + salt, path, length: laneLength(path), start: motion.t + j * 0.6, wait, stopAt: 0 });
      }
      if (out.length) setLeaving((list) => [...list, ...out].slice(-4));
    }
    // Everyone left in line was `served` places further back: they walk up from there, once the one who has finished has
    // turned round and stepped away from the machine or the counter.
    hold.current = motion.t + (atm ? SERVED.atm : SERVED.counter) + 0.7;
    groups.current.forEach((g, i) => {
      const from = slots[i + served];
      if (g && from && placed.current[i]) g.position.set(from[0], 0, from[1]);
    });
  }, [processed, slots, style, id]);
  const gone = useMemo(() => (key: number) => setLeaving((list) => list.filter((s) => s.key !== key)), []);
  useFrame(() => {
    const step = motion.t < hold.current ? 0 : STEP_UP_PACE * motion.dt;
    // The last places of the line are kept empty for those still walking up to it; each is taken over where they stop.
    const standing = style === 'people' ? Math.max(0, shown - queueHandoff.pending(id)) : shown;
    inLine.current = standing;
    groups.current.forEach((g, i) => {
      const to = slots[i];
      if (!g || !to) return;
      if (i >= standing) {
        g.visible = false;
        placed.current[i] = false;
        return;
      }
      if (!placed.current[i]) {
        const got = style === 'people' ? queueHandoff.take(id, motion.t) : undefined;
        if (got) g.position.set(got.at[0] - pose.x, 0, got.at[1] - pose.z);
        else g.position.set(to[0], 0, to[1]);
        g.visible = true;
        placed.current[i] = true;
        return;
      }
      const dx = to[0] - g.position.x;
      const dz = to[1] - g.position.z;
      const d = Math.hypot(dx, dz);
      if (d <= step) g.position.set(to[0], 0, to[1]);
      else g.position.set(g.position.x + (dx / d) * step, 0, g.position.z + (dz / d) * step);
    });
    // Someone who got to the line after their turn had already come (the desk served them while they were on their way):
    // they walk up to the counter or machine, do their business, and go. Nobody vanishes on arrival.
    if (style !== 'people') return;
    const late: Served[] = [];
    for (let got = queueHandoff.take(id, motion.t); got; got = queueHandoff.take(id, motion.t)) {
      const exit = servedExit(id);
      const path: V2[] = [got.at, ...exit];
      const stopAt = Math.hypot(exit[0]![0] - got.at[0], exit[0]![1] - got.at[1]);
      late.push({ key: nextKey.current++, who: got.who, path, length: laneLength(path), start: motion.t, wait: atm ? SERVED.business.atm : SERVED.business.counter, stopAt });
    }
    if (late.length) setLeaving((list) => [...list, ...late].slice(-6));
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
              if (!g) placed.current[i] = false;
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
      {leaving.map((s) => (
        <ServedCustomer key={s.key} id={id} s={s} onGone={gone} />
      ))}
    </>
  );
}

/**
 * The floating badge above a desk: its name and how many are waiting. Click it to open the inspector. In "Hover Only" label
 * mode it is hidden until the pointer is over its workstation, which keeps the diorama clean.
 */
export function DeskPin({ id, height }: { id: StationId; height?: number }) {
  // The same status stream the 2D desk cards read (SimulationEngine.desks).
  const { status, waiting: queueLength, working } = useDeskStatus(id);
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
      {visible && <PinBadge id={id} top={top} status={status} queueLength={queueLength} working={working} selected={selected} name={terms.station(id)} />}
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
  const { status, waiting: queueLength, working, showStatus } = useDeskStatus(id);
  const bm = useMessages(deskBadgeMessages);
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
          {queueLength} {t('waiting')}
          {working > 0 ? ` · ${bm('working', { n: working })}` : ''}
          {showStatus ? ` · ${statusLabel(status)}` : ''}
        </span>
      </div>
    </Html>
  );
}

/**
 * The badge itself: the status dot, the desk's name, how many are waiting ("3 waiting", amber when anyone is), and beside it
 * a green "2 working" while cases are being worked on at the counter, so a busy desk with an empty queue never reads as
 * idle: "X waiting · Y working", the same as the 2D map's desk cards.
 */
function PinBadge({ id, top, status, queueLength, working, selected, name }: { id: StationId; top: number; status: keyof typeof STATUS_HEX; queueLength: number; working: number; selected: boolean; name: string }) {
  const bm = useMessages(deskBadgeMessages);
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
        <span className="min-w-[16px] shrink-0 rounded-full px-1 text-center tabular-nums" style={queueLength > 0 ? { background: '#fde68a', color: '#78350f' } : { background: '#e2e8f0', color: '#64748b' }} data-testid={`pin-waiting-${id}`}>
          {queueLength} {t('waiting')}
        </span>
        {working > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1 text-emerald-800" data-testid={`pin-working-${id}`}>
            <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-500" />
            {bm('working', { n: working })}
          </span>
        )}
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
