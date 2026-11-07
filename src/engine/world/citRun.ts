import { deskPose, FLOOR_SLAB, LEFT_WALK_X, vaultRoom, type V2 } from '../plan/layout3d';
import { pathLength, pointAlongPath } from '../plan/path';
import { actorStatus, type ActorStatus } from '../../sim/actorStatus';
import { crewOf, vaultPulseAt, walkShare, type CrewFlow, type CrewPoint } from '../../sim/citCrew';
import { LENGTH, WIDTH } from './vehicles';

/** The armoured cash-in-transit van's run to the vault, and its crew's walk (sim/citCrew.ts: the same timeline as the 2D bay). */

const HX = FLOOR_SLAB.w / 2;

/** The painted bay: where the van stands (its middle) nose-in to the left wall, and the bay's size (`len` across the row, `w` along it). */
export const LOADING_BAY = (() => {
  const len = LENGTH.cit + 0.5;
  return { x: -(HX + 0.35 + LENGTH.cit / 2), z: -4.6, len, w: WIDTH.cit + 0.7 } as const;
})();

/** The vault's loading door in the left wall, just past the van's nose on its door side. */
export const LOADING_DOOR: V2 = [-HX - 0.2, LOADING_BAY.z + 1.25];
/** Where the crew takes the cassettes from, or loads them into, behind the van's open rear doors. */
export const VAN_REAR: V2 = [LOADING_BAY.x - LENGTH.cit / 2 - 0.4, LOADING_BAY.z];
/** The striped walkway along the van's door side, and the cab door the crew steps out of onto it. */
const SIDE_Z = LOADING_BAY.z + WIDTH.cit / 2 + 0.45;
export const CAB_DOOR: V2 = [LOADING_BAY.x + LENGTH.cit / 2 - 0.9, SIDE_Z];

/** The walk outside: from the back of the van, round its corner and along its side to the loading door. */
export const CARRY_PATH: readonly V2[] = [VAN_REAR, [VAN_REAR[0], SIDE_Z], [-HX - 0.55, SIDE_Z], LOADING_DOOR];

/**
 * The cash vault's great round steel door (the golden-wheel door on the back wall of the glass vault room): where every deposit
 * and withdrawal of the CIT and teller runs crosses into the vault. Dressing.tsx draws it here.
 */
export const VAULT_DOOR = (() => {
  const room = vaultRoom();
  return { x: deskPose('SEC_VAULT').x, y: 1.45, z: room.z0 + 0.09, room } as const;
})();
/** Where the crew stands to hand cash over: facing the round door, clear of its swing. */
export const VAULT_STOP: V2 = [VAULT_DOOR.x, VAULT_DOOR.z + 1.0];
/** Just inside the loading door, where the vault's staff stands to roll the shutter up. */
export const DOOR_INSIDE: V2 = [LEFT_WALK_X, LOADING_DOOR[1]];
/** The aisle into the vault room: east of its desks, in through a doorway the glass front opens for it (Dressing cuts it). */
const ROOM_AISLE_X = deskPose('SEC_VAULT').x + deskPose('SEC_VAULT').w / 2 + 0.55;
/**
 * The walk inside, never across a desk: along the front of the vault room from the loading door, in through its glass front east
 * of the desks, back along the aisle to the round door's row, and across to the door.
 */
export const CORRIDOR: readonly V2[] = [LOADING_DOOR, DOOR_INSIDE, [ROOM_AISLE_X, DOOR_INSIDE[1]], [ROOM_AISLE_X, VAULT_STOP[1]], VAULT_STOP];

/** The crew's whole walk, cab door to vault: to the van's rear for the cassettes, back along its side, in at the door and down the corridor. */
export const CREW_PATH: readonly V2[] = [CAB_DOOR, [VAN_REAR[0], SIDE_Z], VAN_REAR, ...CARRY_PATH.slice(1), ...CORRIDOR.slice(1)];
const CREW_LEN = pathLength(CREW_PATH);
/** Where the van's rear is along the crew's walk, 0-1. */
export const REAR_AT = pathLength(CREW_PATH.slice(0, 3)) / CREW_LEN;
/** The vault staff's walk from the vault to just inside the loading door. */
const STAFF_PATH: readonly V2[] = [...CORRIDOR.slice(1)].reverse();
const STAFF_LEN = pathLength(STAFF_PATH);

/** How fast the van drives, how long its doors take, and how briskly the crew and the vault staff walk (seconds and metres on the motion clock). */
export const CIT_RUN = { speed: 5, doors: 1.2, crewPace: 1.5, staffPace: 1.7, signal: 6, gapMin: 70, gapMax: 100, first: 20 } as const;
/** Keeping clear of people on foot: the stretch in front of the van (behind it, backing out) it will not drive into while anyone stands there and how wide it is each side of the middle, how far from its bodywork a walker waits for it to pass, and how briskly it brakes and pulls away again. */
export const CIT_YIELD = { ahead: 3.2, half: WIDTH.cit / 2 + 0.25, wait: 1.6, ease: 5 } as const;
/** What the custodian carries: the steel cassette box. */
export type Load = 'box';

/** How long the crew's stop at the van takes for each way the cash moves: long enough that its longest walk is at the crew's pace. */
export const loadS = (flow: CrewFlow): number => (CREW_LEN * (1 - REAR_AT)) / CIT_RUN.crewPace / walkShare(flow);
/** How long the vault's staff takes to walk between the vault and the loading door. */
export const STAFF_WALK_S = STAFF_LEN / CIT_RUN.staffPace;

/** The van's phases: it opens its rear doors as it stops, while the crew already steps out (`load` begins on arrival), so nothing waits between the two. */
export type CitPhase = 'away' | 'arrive' | 'load' | 'close' | 'depart';

/** Someone of the run on foot: the custodian (carries), the guard (escorts) or the vault's staff (opens the loading door). */
export interface CrewFigure {
  role: 'custodian' | 'guard' | 'staff';
  at: V2;
  heading: number;
  walking: boolean;
  carrying: Load | null;
  status: ActorStatus | null;
}

export interface CitPose {
  phase: CitPhase;
  x: number;
  z: number;
  /** Yaw about y: 0 faces +x. */
  yaw: number;
  /** How far the rear doors are open, 0-1; how far the vault's loading door has rolled up, 0-1. */
  doors: number;
  shutter: number;
  /** The indicator: 1 left, -1 right (as the driver sits), 0 off. */
  signal: -1 | 0 | 1;
  /** Backing out of the bay. */
  reversing: boolean;
  crew: readonly CrewFigure[];
  /** The vault lit for the cash crossing its door: gold for a deposit (Dr 1111), orange for a withdrawal (Cr 1111). */
  vaultPulse: CrewFlow | null;
}

/** The van's drives, from the car park (parking.ts lays them along its drive): in to the bay; backing out of it; and away. */
export interface CitRoutes {
  arrive: readonly V2[];
  reverse: readonly V2[];
  depart: readonly V2[];
}

const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const driveTime = (len: number): number => len / CIT_RUN.speed + 1.2;
const yawOf = (dx: number, dz: number): number => Math.atan2(-dz, dx);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const rnd = (k: number): number => {
  const x = Math.sin(k * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
};

/** A point `d` metres along `path`, and the heading (rotation about y) of the way it runs there. */
function walkAt(path: readonly V2[], len: number, d: number): { at: V2; heading: number } {
  const s = Math.max(0, Math.min(len, d));
  const at = pointAlongPath(path, s);
  const [ax, az] = pointAlongPath(path, Math.min(len, s + 0.05));
  const [bx, bz] = pointAlongPath(path, Math.max(0, s - 0.05));
  return { at, heading: Math.atan2(ax - bx, az - bz) };
}

/** Facing the van's rear (+x), the vault (-z) or the loading door (-x), for someone standing still there. */
const FACE = { van: Math.PI / 2, vault: Math.PI, door: -Math.PI / 2 } as const;
/** Whether a stage walks back towards the van (the walk shrinking), so the figure faces that way. */
const BACK = new Set(['toVan', 'board']);

/** A crew member at a point of the shared timeline. */
function crewFigure(role: 'custodian' | 'guard', flow: CrewFlow, p: CrewPoint): CrewFigure {
  const w = walkAt(CREW_PATH, CREW_LEN, p.along * CREW_LEN);
  const heading = p.walking ? (BACK.has(p.stage) ? wrap(w.heading + Math.PI) : w.heading) : p.stage === 'atVault' ? FACE.vault : FACE.van;
  return { role, at: w.at, heading, walking: p.walking, carrying: p.carrying ? 'box' : null, status: actorStatus('cit', `${flow}:${p.stage}`) };
}

/** Which turn a drive along `path` takes over the next few metres from `d`: 1 left, -1 right, 0 (nearly) straight on. */
export function turnAhead(path: readonly V2[], d: number, look: number = CIT_RUN.signal): -1 | 0 | 1 {
  const len = routeLen(path);
  const at = (s: number): number => {
    const [ax, az] = pointAlongPath(path, Math.min(len, s + 0.05));
    const [bx, bz] = pointAlongPath(path, Math.max(0, s - 0.05));
    return yawOf(ax - bx, az - bz);
  };
  const turn = wrap(at(Math.min(len - 0.06, d + look)) - at(Math.max(0.06, d)));
  return Math.abs(turn) < 0.5 ? 0 : turn > 0 ? 1 : -1;
}

/** A route's length, measured once: the van's routes are fixed arrays, read every frame and every walker check while it drives. */
const ROUTE_LEN = new WeakMap<readonly V2[], number>();
const routeLen = (path: readonly V2[]): number => {
  let n = ROUTE_LEN.get(path);
  if (n === undefined) ROUTE_LEN.set(path, (n = pathLength(path)));
  return n;
};

export class CitRun {
  phase: CitPhase = 'away';
  /** Seconds into the phase. */
  t = 0;
  runs = 0;
  /** How much of its pace the van has on now, 0-1: it brakes to a stop for anyone in its way and pulls away when they are clear. */
  go = 1;
  /** Which way the cash crosses the bay on this stop: in to the vault, or out of it into the van. */
  flow: CrewFlow = 'IN';
  /** The vault's staff: walking out to the loading door, standing at it, or walking back to the vault; and seconds into that. */
  private staff: { leg: 'out' | 'at' | 'back'; t: number } | null = null;
  private due: number = CIT_RUN.first;
  /** Driven by the CIT schedule (citEngine): the van comes only when called, never on its own timer. */
  private scheduled = false;

  constructor(readonly routes: CitRoutes) {}

  /** Hands the van to the CIT schedule: from now on it waits away until `call()`. */
  follow(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    if (this.phase === 'away') this.due = Infinity;
  }

  /** A CIT run needs the van at the bay, `flow` saying which way its cash goes: it sets off as soon as the lot lets it (a van already there or on its way is unchanged). */
  call(flow: CrewFlow = this.flow): void {
    if (this.phase !== 'away') return;
    this.flow = flow;
    this.due = Math.min(this.due, this.t);
  }

  /** Steps the run on; `lotFree` says whether the car park is still, so the van may drive in or out now; `walkers` are the people on foot near its drive. */
  step(dt: number, lotFree: boolean, walkers: readonly V2[] = []): void {
    if (this.needsLane()) {
      const want = walkers.some((p) => this.inPath(p)) ? 0 : 1;
      this.go += (want - this.go) * Math.min(1, dt * CIT_YIELD.ease);
      if (want === 0 && this.go < 0.05) this.go = 0;
      this.t += dt * this.go;
    } else {
      this.go = 1;
      this.t += dt;
    }
    this.stepStaff(dt);
    switch (this.phase) {
      case 'away':
        if (this.t >= this.due && lotFree) {
          // The vault's staff sets off for the loading door as the van turns in.
          this.staff = { leg: 'out', t: 0 };
          this.next('arrive');
        }
        break;
      case 'arrive':
        // Stopped in the bay: the rear doors and the shutter open and the crew steps out in the same instant.
        if (this.t >= driveTime(routeLen(this.routes.arrive))) this.next('load');
        break;
      case 'load':
        if (this.t >= loadS(this.flow)) this.next('close');
        break;
      case 'close':
        // Shut up, then waits for the car park to be still before backing out; the staff walks back to the vault.
        // (Still on the way out, they turn round where they stand.)
        if (this.t >= CIT_RUN.doors && this.staff && this.staff.leg !== 'back') this.staff = { leg: 'back', t: this.staff.leg === 'out' ? STAFF_WALK_S - this.staff.t : 0 };
        if (this.t >= CIT_RUN.doors && lotFree) this.next('depart');
        break;
      case 'depart':
        if (this.t >= this.departS()) {
          this.runs++;
          this.due = this.scheduled ? Infinity : CIT_RUN.gapMin + rnd(this.runs) * (CIT_RUN.gapMax - CIT_RUN.gapMin);
          // On its own timer the van alternates deliveries into the vault and collections out of it.
          if (!this.scheduled) this.flow = this.runs % 2 === 1 ? 'OUT' : 'IN';
          this.next('away');
        }
        break;
    }
  }

  private stepStaff(dt: number): void {
    const s = this.staff;
    if (!s) return;
    s.t += dt;
    if (s.leg === 'out' && s.t >= STAFF_WALK_S) this.staff = { leg: 'at', t: 0 };
    else if (s.leg === 'back' && s.t >= STAFF_WALK_S) this.staff = null;
  }

  private departS(): number {
    return driveTime(routeLen(this.routes.reverse)) + driveTime(routeLen(this.routes.depart));
  }

  private next(phase: CitPhase): void {
    this.phase = phase;
    this.t = 0;
  }

  /** Whether the van is due and waiting to drive in: the lot sends nobody new up its lane meanwhile. */
  wantsIn(): boolean {
    return this.phase === 'away' && this.t >= this.due;
  }

  /** Whether the van is shut up and waiting to back out: the lot sends nobody else out onto its lane meanwhile. */
  wantsOut(): boolean {
    return this.phase === 'close' && this.t >= CIT_RUN.doors;
  }

  /** Whether the van is driving in the car park (or on its way in or out through the gate): it has the lot's turn. */
  needsLane(): boolean {
    return this.phase === 'arrive' || this.phase === 'depart';
  }

  /** Whether the van itself is still out: driving in, at the bay, or on its exit route (false once it has despawned at its away spot). */
  vanOut(): boolean {
    return this.phase !== 'away';
  }

  /** Whether anything of the run is still to be seen: the van out of its bay's away spot, or the vault's staff on the floor. */
  busy(): boolean {
    return this.phase !== 'away' || this.staff !== null;
  }

  /** Where `p` is against the van: along the way it is driving (from its middle) and out to the side; null while it is not driving. */
  private against(p: V2): { along: number; side: number } | null {
    if (!this.needsLane()) return null;
    const pose = this.pose();
    const back = pose.reversing ? -1 : 1;
    const fx = Math.cos(pose.yaw) * back;
    const fz = -Math.sin(pose.yaw) * back;
    const dx = p[0] - pose.x;
    const dz = p[1] - pose.z;
    return { along: dx * fx + dz * fz, side: Math.abs(dx * fz - dz * fx) };
  }

  /** Whether someone at `p` stands in the van's way: in the stretch just ahead of it as it drives (behind it as it backs out). */
  inPath(p: V2): boolean {
    const a = this.against(p);
    return a !== null && a.side < CIT_YIELD.half && a.along > LENGTH.cit / 2 - 0.3 && a.along < LENGTH.cit / 2 + CIT_YIELD.ahead;
  }

  /** Whether someone on foot at `p` stops and lets the van by: they are close to it as it drives, but not in its way (whoever is in its way walks on and clears it, so neither waits for the other for ever). */
  makesWait(p: V2): boolean {
    const a = this.against(p);
    if (a === null || this.inPath(p)) return false;
    return Math.abs(a.along) < LENGTH.cit / 2 + CIT_YIELD.wait && a.side < WIDTH.cit / 2 + CIT_YIELD.wait;
  }

  /** The last pose and the state it was computed from: the renderers and every walker's yield check share one pose per tick. */
  private memo: { phase: CitPhase; t: number; flow: CrewFlow; leg: string | null; st: number; pose: CitPose } | null = null;

  /** Where the van, its crew and the vault's staff are now. The same object until the run moves on (do not mutate it). */
  pose(): CitPose {
    const m = this.memo;
    const leg = this.staff?.leg ?? null;
    const st = this.staff?.t ?? -1;
    if (m && m.phase === this.phase && m.t === this.t && m.flow === this.flow && m.leg === leg && m.st === st) return m.pose;
    const pose = this.computePose();
    this.memo = { phase: this.phase, t: this.t, flow: this.flow, leg, st, pose };
    return pose;
  }

  private computePose(): CitPose {
    const { x, z } = LOADING_BAY;
    const staff = this.staffFigure();
    const still = (doors: number, shutter: number, crew: CrewFigure[] = [], vaultPulse: CrewFlow | null = null, signal: CitPose['signal'] = 0): CitPose => ({ phase: this.phase, x, z, yaw: 0, doors, shutter, signal, reversing: false, crew: staff ? [...crew, staff] : crew, vaultPulse });
    const on = (path: readonly V2[], t: number, back: boolean, signal: boolean): CitPose => {
      const len = routeLen(path);
      const d = len * ease(Math.min(1, t / driveTime(len)));
      const [px, pz] = pointAlongPath(path, d);
      const [ax, az] = pointAlongPath(path, Math.min(len, d + 0.05));
      const [bx, bz] = pointAlongPath(path, Math.max(0, d - 0.05));
      const yaw = yawOf(ax - bx, az - bz) + (back ? Math.PI : 0);
      return { phase: this.phase, x: px, z: pz, yaw, doors: 0, shutter: 0, signal: signal ? turnAhead(path, d) : 0, reversing: back, crew: staff ? [staff] : [], vaultPulse: null };
    };
    switch (this.phase) {
      case 'away': {
        // Out of sight, past the end of the lane.
        const [fx, fz] = this.routes.arrive[0]!;
        return { phase: this.phase, x: fx, z: fz, yaw: 0, doors: 0, shutter: 0, signal: 0, reversing: false, crew: staff ? [staff] : [], vaultPulse: null };
      }
      case 'arrive':
        // Indicating before each turn: into the car park's gate, and into the bay.
        return on(this.routes.arrive, this.t, false, true);
      case 'load': {
        const u = this.t / loadS(this.flow);
        const k = Math.min(1, this.t / CIT_RUN.doors);
        const crew = crewOf(this.flow, u, REAR_AT);
        const people: CrewFigure[] = [];
        if (crew?.custodian) people.push(crewFigure('custodian', this.flow, crew.custodian));
        if (crew?.guard) people.push(crewFigure('guard', this.flow, crew.guard));
        return still(k, k, people, vaultPulseAt(this.flow, u));
      }
      case 'close': {
        const k = Math.max(0, 1 - this.t / CIT_RUN.doors);
        // Indicating out once it is shut up and waiting to back out.
        return still(k, k, [], null, k === 0 ? turnAhead(this.routes.depart, 0, 4) || 1 : 0);
      }
      case 'depart': {
        const tr = driveTime(routeLen(this.routes.reverse));
        if (this.t < tr) return { ...on(this.routes.reverse, this.t, true, false), signal: turnAhead(this.routes.depart, 0, 4) || 1 };
        return on(this.routes.depart, this.t - tr, false, true);
      }
    }
  }

  /** The vault's staff on the floor: walking out to the loading door, standing just inside it, or walking back to the vault. */
  private staffFigure(): CrewFigure | null {
    const s = this.staff;
    if (!s) return null;
    if (s.leg === 'at') return { role: 'staff', at: DOOR_INSIDE, heading: FACE.door, walking: false, carrying: null, status: 'processing' };
    const d = s.leg === 'out' ? s.t * CIT_RUN.staffPace : STAFF_LEN - s.t * CIT_RUN.staffPace;
    const w = walkAt(STAFF_PATH, STAFF_LEN, d);
    return { role: 'staff', at: w.at, heading: s.leg === 'out' ? w.heading : wrap(w.heading + Math.PI), walking: true, carrying: null, status: s.leg === 'out' ? 'arriving' : 'done' };
  }
}
