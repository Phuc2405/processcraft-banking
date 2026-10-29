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
import { EntityFactory } from './EntityFactory';

/**
 * The world around the bank in the 3D office, as one pure simulation: the motion clock, the traffic on the avenue, the car
 * park (and the cash van's run), the park's people, the guards at their posts, the passers-by on the pavement and the sky's
 * weather blend. It owns every one of them and steps them all, in a fixed order, once a frame (`tick`); the 3D view only
 * reads them to draw. No React, no three.js, no DOM: everything it needs from outside (the bank's clock and speed, the
 * weather picked) comes in as WorldInputs, so it can be stepped in a test exactly as on screen.
 *
 * Pieces shared with the drawing of the bank's own desks (the pavement's steering, the hand-off of customers to the desks'
 * lines) are module singletons; the engine holds them too, so there is one place to find all of the world's state.
 */

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

  /**
   * One frame: the motion clock moves on (frozen on pause, at the bank's speed in play), then every system steps by it in
   * small substeps, in the order they always have: the guards, the traffic, the park, the car park (which closes to new
   * arrivals at closing time), the pavement's people; and last the sky's blend eases towards the weather picked (on real
   * time: weather keeps moving while the bank is paused).
   */
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

    return { mixChanged: this.stepSky(input.realDt, input.weather) };
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
