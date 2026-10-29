import { rainOf, sameMix, stepMix, WEATHER_MIX, type Weather } from '../world/atmosphere';
import { isClosed } from '../world/evacuation';
import type { FrontGuard, GuardPostPlan } from '../world/guardCabin';
import { advanceMotion, motion, substeps } from './motion';
import type { ParkingLot } from '../world/parking';
import { wantsPark, type ParkCrowd, type ParkSky } from '../world/parkLife';
import { queueHandoff, type QueueHandoff } from './queueHandoff';
import { sidewalk, type SidewalkCrowd } from '../world/sidewalk';
import type { TrafficSim, VehicleState } from '../world/vehicles';
import { liveMix, newPavementClock, stepPavementClock, type PavementClock } from '../world/weather';
import { isAutomatedNode } from '../../sim/nodeKind';
import { STATION_IDS, type StationId } from '../../sim/topology';
import type { BankView } from '../../sim/types';
import { ClosingWalkout } from './closingWalkout';
import { ArrivalWalks, DeskLine, StaffWalks } from './people';
import { StreetPeople } from '../world/streetPeople';
import { EntityFactory } from './EntityFactory';

/** The world around the bank in the 3D office, as one pure simulation. */

/** What the world needs from outside each frame. */
export interface WorldInputs {
  /** Real seconds since the last frame. */
  realDt: number;
  /** Whether the bank is playing (and no guided tour holds the clock): the motion clock runs only then. */
  playing: boolean;
  /** The bank's speed multiplier. */
  speed: number;
  /** The bank's clock, minutes since midnight. */
  minute: number;
  /** The weather picked now. */
  weather: Weather;
  /** How many are queuing at each desk in the bank now (for closing time's walk-out). */
  queueLength?: (id: StationId) => number;
}

/** What a tick changed that the page outside the engine has to hear about. */
export interface WorldTickResult {
  /** The sky's blend moved on enough to refresh the page's copy (the sky gradient behind the canvas). */
  mixChanged: boolean;
}

/** The weathers in which a guard keeps to the cabin. */
const GUARD_WET: readonly Weather[] = ['rain', 'storm', 'hail', 'snow'];

export class WorldEngine {
  readonly traffic: TrafficSim;
  /** The fleet's states as of the last tick, and the traffic's own clock: what the vehicles are drawn from. */
  readonly trafficView: { states: Map<string, VehicleState>; t: number };
  readonly lot: ParkingLot;
  readonly park: ParkCrowd;
  readonly pavement: PavementClock = newPavementClock();
  readonly sidewalk: SidewalkCrowd = sidewalk;
  readonly handoff: QueueHandoff = queueHandoff;
  /** Closing time's walk-out of the counters' lines; `walkoutVersion` moves on whenever who is walking out changes. */
  readonly walkout: ClosingWalkout;
  walkoutVersion = 0;
  /** The street's people: passers-by and the passengers of the taxis, motorbikes and buses. */
  readonly street: StreetPeople;
  /** Customers walking to the desks' lines; each desk's line and served customers; each desk's staff walking in and out. */
  readonly arrivals: ArrivalWalks;
  private readonly lines = new Map<StationId, DeskLine>();
  private readonly staffWalks = new Map<StationId, StaffWalks>();
  private readonly listeners = new Set<() => void>();
  private seenView: BankView | null = null;
  private seenTick: number | null = null;
  private peopleVersion = 0;
  private readonly guards = new Map<GuardPostPlan, FrontGuard>();
  private minute: number;
  private weather: Weather;
  /** Seconds since the page's copy of the sky's blend was last refreshed. */
  private mixSince = 0;

  constructor(start: { minute: number; weather: Weather }, readonly factory: EntityFactory = new EntityFactory()) {
    this.minute = start.minute;
    this.weather = start.weather;
    this.traffic = factory.traffic();
    this.trafficView = { states: this.traffic.states(), t: 0 };
    this.lot = factory.carPark();
    // Everyone wanted in the park at the start is already in place; after that they come and go on foot.
    this.park = factory.parkCrowd(start.minute);
    this.walkout = new ClosingWalkout(isClosed(start.minute));
    this.arrivals = new ArrivalWalks(this.handoff, this.sidewalk);
    this.street = new StreetPeople(factory.pedestrians(), factory.vehicles(), this.sidewalk);
  }

  /** The guards at a post (made the first time it is asked for, as things stand then), stepped with the rest of the world. */
  guard(plan: GuardPostPlan): FrontGuard {
    let g = this.guards.get(plan);
    if (!g) {
      g = this.factory.guards(plan, this.minute, GUARD_WET.includes(this.weather));
      this.guards.set(plan, g);
    }
    return g;
  }

  /** One frame: the motion clock moves on (frozen on pause, at the bank's speed in play), then every system steps by it in small substeps, in the order they always have. */
  tick(input: WorldInputs): WorldTickResult {
    advanceMotion(input.realDt, input.playing, input.speed);
    this.minute = input.minute;
    this.weather = input.weather;
    const steps = substeps(motion.dt);
    const minute = input.minute;

    const guardWet = GUARD_WET.includes(input.weather);
    for (const g of this.guards.values()) for (const h of steps) g.step(h, minute, guardWet);

    for (const h of steps) this.traffic.step(h);
    this.trafficView.states = this.traffic.states();
    this.trafficView.t = this.traffic.t;

    const sky = parkSky(input.weather);
    for (const h of steps) this.park.step(h, (m) => wantsPark(m, minute), sky, minute);

    // At closing time the drivers in the branch walk back to their cars and drive off; nobody parks again until it opens.
    this.lot.setClosed(isClosed(minute));
    for (const h of steps) this.lot.step(h);

    stepPavementClock(this.pavement, motion.dt, input.weather);
    this.street.step(this.pavement, this.trafficView.states, isClosed(minute), motion.dt);

    // The people of the desks: walkers to the lines first (they hand over to the lines), then the lines, then the staff.
    this.arrivals.step(motion.t, motion.dt);
    for (const line of this.lines.values()) line.step(motion.t, motion.dt);
    for (const staff of this.staffWalks.values()) staff.step(motion.dt);
    this.publishPeople();

    // Closing time: everyone in the counters' lines walks out (pausing never sets anyone walking; the clock reaching 17:00 does).
    if (this.walkout.update(isClosed(minute), input.queueLength ?? (() => 0))) this.walkoutVersion++;
    if (this.walkout.step(motion.dt)) this.walkoutVersion++;

    return { mixChanged: this.stepSky(input.realDt, input.weather) };
  }

  /** A desk's line and the customers served at it. */
  line(id: StationId): DeskLine {
    let l = this.lines.get(id);
    if (!l) {
      l = new DeskLine(id, this.handoff, this.sidewalk);
      this.lines.set(id, l);
    }
    return l;
  }

  /** A desk's staff walking in and out. */
  staff(id: StationId): StaffWalks {
    let s = this.staffWalks.get(id);
    if (!s) {
      s = new StaffWalks(id, isAutomatedNode(id));
      this.staffWalks.set(id, s);
    }
    return s;
  }

  /** The bank moved on (call it as soon as the bank's view changes, and once at the start). */
  onBank(view: BankView): void {
    if (view === this.seenView) return;
    this.seenView = view;
    if (view.tick !== this.seenTick) {
      this.seenTick = view.tick;
      this.arrivals.onBeat(view.stations, view.minute, motion.t);
    }
    for (const id of STATION_IDS) {
      this.line(id).sync(view.stations[id], view.minute, motion.t);
      this.staff(id).sync(view.stations[id].workers, view.minute);
    }
    this.publishPeople();
  }

  /** Hears whenever the people of the desks change (Observer); returns the way to stop. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Puts the world away: anyone still walking to a line will never arrive. */
  dispose(): void {
    this.arrivals.dispose();
  }

  private publishPeople(): void {
    let v = this.arrivals.version;
    for (const l of this.lines.values()) v += l.version;
    for (const s of this.staffWalks.values()) v += s.version;
    if (v === this.peopleVersion) return;
    this.peopleVersion = v;
    for (const l of this.listeners) l();
  }

  /** Eases the live weather blend (liveMix) towards the pick, over WEATHER_BLEND_S; true a few times a second while it moves. */
  private stepSky(realDt: number, weather: Weather): boolean {
    const want = WEATHER_MIX[weather];
    if (sameMix(liveMix, want)) return false;
    Object.assign(liveMix, stepMix(liveMix, want, Math.min(realDt, 0.1)));
    this.mixSince += realDt;
    if (this.mixSince > 0.1 || sameMix(liveMix, want)) {
      this.mixSince = 0;
      return true;
    }
    return false;
  }
}

/** The park's weather for a pick: a storm or hail clears it at a run; rain or snow cuts visits short under umbrellas. */
export function parkSky(weather: Weather): ParkSky {
  if (weather === 'storm' || weather === 'hail') return 'storm';
  const raining = rainOf(liveMix) > 0.02 || WEATHER_MIX[weather].rain > 0;
  return raining || weather === 'snow' ? 'rain' : 'dry';
}
