import { isNightStation } from '../../sim/roster';
import { STATIONS, type StationId } from '../../sim/topology';
import type { StationView } from '../../sim/types';
import { laneAt, laneLength, QUEUE_VISIBLE, queueSalt, queueSlots, queueStyle, seatOffsets, deskPose, type V2, WALKER_STATIONS, ATM_STATIONS } from '../plan/layout3d';
import { CUSTOMER_DESKS, isClosed, servedExit } from '../world/evacuation';
import type { SidewalkCrowd } from '../world/sidewalk';
import { journeyPose, type CustomerPose, type Journey } from './customerLifecycle';
import type { QueueHandoff } from './queueHandoff';
import { routesFor, MAIN_GATE_STAFF_ROUTE } from './routes';
import { ARRIVE_SPEED, arrivalState, isOffShift, LEAVE_SPEED, leaveAt } from './staff';

/** People of the 3D office the views draw but never move: customers walking to and standing in the desks' lines, the ones being served, and staff walking in and out. */

/** Walking paces to the desks: a stroll down the pavement to the ATMs, a little brisker into the branch. */
export const ARRIVAL_PACE = { atm: 0.85, gate: 1.0 } as const;
/** How many customers can be walking to the desks at once. */
export const MAX_WALKERS = 14;
/** How long someone finishing at the machine takes to put their card and cash away and turn round. */
export const ATM_TURN_S = 0.8;
/** How fast people in a line walk up a place when the one in front is served. */
export const STEP_UP_PACE = 0.9;
/** Served customers: time at the counter or machine before leaving, the turn, the walking pace, and the business of one who walks up late. */
export const SERVED = { counter: 1.1, atm: ATM_TURN_S, turn: 0.45, pace: 0.95, business: { atm: 3.5, counter: 4 } } as const;

/** A pose for a figure the view draws: where (world or desk-local, as stated), which way it faces, and whether it shows. */
export interface FigurePose {
  x: number;
  z: number;
  yaw: number;
  visible: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Customers walking to the desks' lines
// ─────────────────────────────────────────────────────────────────────────────

export interface ArrivalWalk {
  path: V2[];
  length: number;
  start: number;
  pace: number;
  /** The figure that walks it, kept for the whole walk. */
  slot: number;
  desk: StationId;
  /** Their look, the same as they will have in the line. */
  who: number;
}

/** Customers walking from the car park or down the pavement to the end of a desk's line, handed over to the line where they stop. */
export class ArrivalWalks {
  readonly walks: ArrivalWalk[] = [];
  readonly looks: number[] = Array.from({ length: MAX_WALKERS }, (_, i) => i * 7 + 2);
  readonly poses: FigurePose[] = Array.from({ length: MAX_WALKERS }, () => ({ x: 0, z: 0, yaw: 0, visible: false }));
  version = 0;
  private queued: Partial<Record<StationId, number>> = {};

  constructor(
    private readonly handoff: QueueHandoff,
    private readonly sidewalk: SidewalkCrowd,
  ) {}

  /** A new beat: whoever joined a counter's line (or came to an ATM) sets off for their place in it. */
  onBeat(stations: Readonly<Record<StationId, StationView>>, minute: number, now: number): void {
    // After closing time customers only come for the sidewalk ATMs.
    const closed = isClosed(minute);
    let changed = false;
    for (const id of WALKER_STATIONS) {
      const sv = stations[id];
      // A counter's newcomers are what its queue grew by (its arrivals are counted at the gates the cases came in at).
      const grew = Math.max(0, sv.queueLength - (this.queued[id] ?? sv.queueLength));
      this.queued[id] = sv.queueLength;
      if (closed && !ATM_STATIONS.includes(id)) continue;
      const count = Math.min(2, ATM_STATIONS.includes(id) ? sv.arrivals : Math.max(sv.arrivals, grew));
      for (let k = 0; k < count; k++) {
        // The newcomers are the line's last `count`; further back than the line drawn, they join unseen.
        const place = sv.queueLength - count + k;
        if (place < 0 || place >= QUEUE_VISIBLE) continue;
        const slot = this.freeSlot();
        if (slot < 0) break;
        const path = routesFor(id).approach(place);
        const pace = ATM_STATIONS.includes(id) ? ARRIVAL_PACE.atm : ARRIVAL_PACE.gate;
        const who = sv.stats.processedToday + place + queueSalt(id);
        this.walks.push({ path, length: laneLength(path), start: now + k * 0.9, pace, slot, desk: id, who });
        this.handoff.expect(id);
        this.looks[slot] = who;
        changed = true;
      }
    }
    if (changed) this.version++;
  }

  /** Moves everyone on to time `now`, curving round others on the pavement; those at their place are handed to the line. */
  step(now: number, dt: number): void {
    for (let i = this.walks.length - 1; i >= 0; i--) {
      const w = this.walks[i]!;
      if ((now - w.start) * w.pace > w.length) {
        this.handoff.arrive(w.desk, w.path[w.path.length - 1]!, now, w.who);
        this.walks.splice(i, 1);
      }
    }
    for (let i = 0; i < MAX_WALKERS; i++) {
      const pose = this.poses[i]!;
      const w = this.walks.find((x) => x.slot === i);
      if (!w || now < w.start) {
        pose.visible = false;
        this.sidewalk.leave(`arrival-${i}`);
        continue;
      }
      const p = laneAt(w.path, (now - w.start) * w.pace);
      const [x, z] = this.sidewalk.place(`arrival-${i}`, p.x, p.z, dt);
      pose.x = x;
      pose.z = z;
      // Facing the way they walk; towards the counter on the last leg.
      pose.yaw = p.heading + Math.PI / 2;
      pose.visible = true;
    }
  }

  /** Anyone still on their way when the world is put away will never arrive. */
  dispose(): void {
    for (const w of this.walks) this.handoff.drop(w.desk);
  }

  private freeSlot(): number {
    for (let i = 0; i < MAX_WALKERS; i++) if (!this.walks.some((w) => w.slot === i)) return i;
    return -1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A desk's line, and the customers served at it
// ─────────────────────────────────────────────────────────────────────────────

/** A customer served at a desk, through their journey (customerLifecycle.ts). */
export interface Served {
  key: number;
  who: number;
  path: V2[];
  length: number;
  start: number;
  wait: number;
  stopAt: number;
}

/** A served customer's pose now (world coordinates), and whether they are doing their business at the counter or machine. */
export interface ServedPose {
  at: V2;
  yaw: number;
  walking: boolean;
  busy: boolean;
}

/**
 * What waits at a desk (people at the customers' desks, phones at a digital gate, case files at an internal desk), each
 * stepping up a place when the one in front is served; those served finish up, turn and walk away. The figures' positions
 * are the desk's own (desk-local), served customers' are the world's.
 */
export class DeskLine {
  readonly id: StationId;
  /** How many of the line are drawn, and the count of served the figures' looks follow (place i is processed + i + salt). */
  shown = 0;
  processed = 0;
  readonly salt: number;
  /** The figures' desk-local positions, and whether each shows. */
  readonly figures: FigurePose[] = Array.from({ length: QUEUE_VISIBLE }, () => ({ x: 0, z: 0, yaw: Math.PI, visible: false }));
  readonly served: Served[] = [];
  readonly servedPoses = new Map<number, ServedPose>();
  version = 0;
  private readonly style: ReturnType<typeof queueStyle>;
  private readonly atm: boolean;
  private readonly pose: ReturnType<typeof deskPose>;
  private readonly slots: ReadonlyArray<readonly [number, number]>;
  private readonly placed: boolean[] = [];
  private last: number | null = null;
  private hold = 0;
  private nextKey = 0;
  private inLine = 0;
  private closedHere = false;

  constructor(
    id: StationId,
    private readonly handoff: QueueHandoff,
    private readonly sidewalk: SidewalkCrowd,
  ) {
    this.id = id;
    this.style = queueStyle(id);
    this.atm = STATIONS[id].kind === 'ATM';
    this.pose = deskPose(id);
    this.slots = queueSlots(id, QUEUE_VISIBLE).map(([x, z]) => [x - this.pose.x, z - this.pose.z] as const);
    this.salt = queueSalt(id);
  }

  /** The bank moved on: how many wait (none at a customer desk after closing), and who has been served since. */
  sync(sv: StationView, minute: number, now: number): void {
    this.closedHere = CUSTOMER_DESKS.includes(this.id) && isClosed(minute);
    const queueLength = this.closedHere ? 0 : sv.queueLength;
    const shown = Math.min(queueLength, this.slots.length);
    const processed = sv.stats.processedToday;
    let changed = shown !== this.shown || processed !== this.processed;
    // Figures past the line drawn are put away.
    for (let i = shown; i < this.shown; i++) this.placed[i] = false;
    this.shown = shown;
    this.processed = processed;
    if (this.last === null) this.last = processed;
    const served = processed - this.last;
    const before = this.last;
    this.last = processed;
    if (served > 0 && this.style !== 'files') {
      // Whoever was served (those who were at the front, up to two in a beat) finishes up, turns round and walks away.
      if (this.style === 'people' && !this.closedHere) {
        const wait = this.atm ? SERVED.atm : SERVED.counter;
        for (let j = 0; j < Math.min(2, served, this.inLine); j++) {
          const path = servedExit(this.id, j);
          this.addServed({ key: this.nextKey++, who: before + j + this.salt, path, length: laneLength(path), start: now + j * 0.6, wait, stopAt: 0 }, 4);
          changed = true;
        }
      }
      // Everyone left in line was `served` places further back: they walk up from there, once the one served has stepped away.
      this.hold = now + (this.atm ? SERVED.atm : SERVED.counter) + 0.7;
      for (let i = 0; i < this.shown; i++) {
        const from = this.slots[i + served];
        if (from && this.placed[i]) {
          this.figures[i]!.x = from[0];
          this.figures[i]!.z = from[1];
        }
      }
    }
    if (changed) this.version++;
  }

  /** Moves the line on: the places kept empty for those still walking up, step-ups, late arrivals, and the served. */
  step(now: number, dt: number): void {
    const step = now < this.hold ? 0 : STEP_UP_PACE * dt;
    // The last places of the line are kept empty for those still walking up to it; each is taken over where they stop.
    const standing = this.style === 'people' ? Math.max(0, this.shown - this.handoff.pending(this.id)) : this.shown;
    this.inLine = standing;
    for (let i = 0; i < QUEUE_VISIBLE; i++) {
      const f = this.figures[i]!;
      const to = this.slots[i];
      if (i >= this.shown || !to) {
        f.visible = false;
        continue;
      }
      if (i >= standing) {
        f.visible = false;
        this.placed[i] = false;
        continue;
      }
      if (!this.placed[i]) {
        const got = this.style === 'people' ? this.handoff.take(this.id, now) : undefined;
        f.x = got ? got.at[0] - this.pose.x : to[0];
        f.z = got ? got.at[1] - this.pose.z : to[1];
        f.visible = true;
        this.placed[i] = true;
        continue;
      }
      const dx = to[0] - f.x;
      const dz = to[1] - f.z;
      const d = Math.hypot(dx, dz);
      if (d <= step) {
        f.x = to[0];
        f.z = to[1];
      } else {
        f.x += (dx / d) * step;
        f.z += (dz / d) * step;
      }
      f.visible = true;
    }
    if (this.style === 'people') {
      // Someone who got to the line after their turn had come walks up to the counter or machine, does their business, and goes.
      let late = false;
      for (let got = this.handoff.take(this.id, now); got; got = this.handoff.take(this.id, now)) {
        const exit = servedExit(this.id);
        const path: V2[] = [got.at, ...exit];
        const stopAt = Math.hypot(exit[0]![0] - got.at[0], exit[0]![1] - got.at[1]);
        this.addServed({ key: this.nextKey++, who: got.who, path, length: laneLength(path), start: now, wait: this.atm ? SERVED.business.atm : SERVED.business.counter, stopAt }, 6);
        late = true;
      }
      if (late) this.version++;
    }
    this.stepServed(now, dt);
  }

  private addServed(s: Served, keep: number): void {
    this.served.push(s);
    while (this.served.length > keep) this.forget(this.served[0]!);
  }

  private forget(s: Served): void {
    this.served.splice(this.served.indexOf(s), 1);
    this.servedPoses.delete(s.key);
    this.sidewalk.leave(`served-${this.id}-${s.key}`);
  }

  private stepServed(now: number, dt: number): void {
    for (const s of [...this.served]) {
      const journey: Journey = { path: s.path, length: s.length, stopAt: s.stopAt, wait: s.wait, turn: SERVED.turn, pace: SERVED.pace };
      const p: CustomerPose = journeyPose(journey, now - s.start);
      if (p.state === 'gone') {
        this.forget(s);
        this.version++;
        continue;
      }
      // Walking, they curve round the others on the pavement; standing, they stay put.
      const at: V2 = p.walking ? this.sidewalk.place(`served-${this.id}-${s.key}`, p.at[0], p.at[1], dt) : p.at;
      this.servedPoses.set(s.key, { at, yaw: p.yaw, walking: p.walking, busy: p.busy });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Staff walking in before their shift and out at its end
// ─────────────────────────────────────────────────────────────────────────────

export interface StaffWalk {
  id: string;
  route: V2[];
  t: number;
  index: number;
  /** Coming in to work (their seat stays empty until they reach it), rather than going home. */
  arriving: boolean;
}

/** A desk's staff walking home when the simulation sends them off shift, and walking in before their shift starts. */
export class StaffWalks {
  readonly walks: StaffWalk[] = [];
  /** Not in yet, and (night desks) in early and sitting ready. */
  away: ReadonlySet<string> = new Set();
  early: ReadonlySet<string> = new Set();
  version = 0;
  private readonly automated: boolean;
  private readonly pose: ReturnType<typeof deskPose>;
  private onShift: Map<string, boolean> | null = null;
  private wasAway: ReadonlySet<string> | null = null;
  private workers: StationView['workers'] | null = null;
  private awayKey = '';

  constructor(
    readonly id: StationId,
    automated: boolean,
  ) {
    this.automated = automated;
    this.pose = deskPose(id);
  }

  /** The bank moved on: who went off shift (walks out), who came back, and whose time to come in has come (walks in). */
  sync(workers: StationView['workers'], minute: number): void {
    const seats = seatOffsets(workers.length);
    let changed = false;
    if (workers !== this.workers) {
      this.workers = workers;
      const was = this.onShift;
      const next = new Map(workers.map((w) => [w.id, this.automated || !isOffShift(w.activity)]));
      if (was) {
        const going = workers.flatMap((w, i) => (was.get(w.id) === true && next.get(w.id) === false && seats[i] ? [{ id: w.id, route: MAIN_GATE_STAFF_ROUTE.leave(this.pose, seats[i]!, i), t: 0, index: i, arriving: false }] : []));
        if (going.length) changed = this.replace(going) || changed;
        // Back on shift (the next morning): no longer walking out.
        const back = workers.filter((w) => was.get(w.id) === false && next.get(w.id) === true).map((w) => w.id);
        if (back.length) changed = this.remove((x) => back.includes(x.id)) || changed;
      }
      this.onShift = next;
    }
    const st = this.automated ? { away: [], early: [] } : arrivalState(isNightStation(this.id), workers.map((w) => w.id), minute);
    const key = `${st.away.join(',')}|${st.early.join(',')}`;
    if (key !== this.awayKey || this.wasAway === null) {
      this.awayKey = key;
      this.away = new Set(st.away);
      this.early = new Set(st.early);
      const was = this.wasAway;
      this.wasAway = this.away;
      changed = true;
      if (was && !this.automated) {
        // Someone whose time to come in has just come (while the office was watching) walks in to their seat.
        const coming = workers.flatMap((w, i) => (was.has(w.id) && !this.away.has(w.id) && seats[i] ? [{ id: w.id, route: MAIN_GATE_STAFF_ROUTE.arrive(this.pose, seats[i]!, i), t: 0, index: i, arriving: true }] : []));
        if (coming.length) this.replace(coming);
      }
    }
    if (changed) this.version++;
  }

  /** Moves the walkers on by `dt` seconds; those who have arrived or are out are done. */
  step(dt: number): void {
    let done = false;
    for (const w of [...this.walks]) {
      w.t += dt;
      if (leaveAt(w.route, w.t, w.arriving ? ARRIVE_SPEED : LEAVE_SPEED).done) {
        this.walks.splice(this.walks.indexOf(w), 1);
        done = true;
      }
    }
    if (done) this.version++;
  }

  /** Where a walker is now (world coordinates), and which way they face. */
  poseOf(w: StaffWalk): { at: V2; heading: number } {
    return leaveAt(w.route, w.t, w.arriving ? ARRIVE_SPEED : LEAVE_SPEED);
  }

  /** Seats left empty: not in yet, or still on the way in. */
  absent(): Set<string> {
    return new Set([...this.away, ...this.walks.filter((w) => w.arriving).map((w) => w.id)]);
  }

  private replace(list: StaffWalk[]): boolean {
    for (let i = this.walks.length - 1; i >= 0; i--) if (list.some((g) => g.id === this.walks[i]!.id)) this.walks.splice(i, 1);
    this.walks.push(...list);
    return true;
  }

  private remove(match: (w: StaffWalk) => boolean): boolean {
    const n = this.walks.length;
    for (let i = this.walks.length - 1; i >= 0; i--) if (match(this.walks[i]!)) this.walks.splice(i, 1);
    return this.walks.length !== n;
  }
}
