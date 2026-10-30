import { fadeToward } from './atmosphere';
import type { SidewalkCrowd } from './sidewalk';
import { BUS_PEOPLE, busRiders, riderAt, type Vehicle, type VehicleState } from './vehicles';
import { PAVEMENT, PAVEMENT_SPAN, pedestrianAt, underCover, UMBRELLA_RATE, wrap, type PavementClock, type Pedestrian, type PedestrianPose } from './weather';

/** How long a pair stands talking, in the bank's minutes: 30 to 60, a little different each time they meet. */
export const CHAT_MINUTES = [30, 60] as const;

/** A deterministic 0-1 value for a pair and their meeting, so the street is the same on every load. */
const unit = (i: number, k: number): number => {
  const x = Math.sin(i * 91.17 + k * 47.31) * 43758.5453;
  return x - Math.floor(x);
};

/** How long pair `pair` talks at their `meeting`th meeting. */
export const chatMinutes = (pair: number, meeting: number): number => CHAT_MINUTES[0] + unit(pair, meeting) * (CHAT_MINUTES[1] - CHAT_MINUTES[0]);

/** One of a chatting pair (State): talking at their spot until the talk is over, then walking a lap of the street each their own way, back at the spot waiting for the other, and talking again once both are back. The weather freezes it: whoever it catches runs for cover from where they are. */
interface Chatter {
  state: 'talking' | 'walking' | 'waiting';
  /** How far they have walked from the spot this lap. */
  walked: number;
  /** Until when the pair talks (the bank's minute), and how many times they have met. */
  until: number | null;
  meeting: number;
  /** Back to their own walk after the weather (after a shower they rejoin this from wherever the weather left them). */
  settled: boolean;
}

/** A person out on the street, where the engine has them this frame (after stepping round others on the pavement). */
export interface StreetPose {
  x: number;
  z: number;
  heading: number;
  walking: boolean;
}

/** A passer-by: their pose, what they are doing, and how far their umbrella is up (eased: it never pops). */
export interface PasserPose extends StreetPose {
  pose: PedestrianPose;
  umbrella: number;
}

/** The people of the street: passers-by in their lanes and in the weather, and the passengers getting off and on the taxis, motorbikes and buses. */
export class StreetPeople {
  readonly passers: PasserPose[];
  /** By vehicle: its passenger on foot now, or null. */
  readonly riders = new Map<string, StreetPose | null>();
  /** By bus: the people getting off and on it now, by who they are (BUS_PEOPLE). */
  readonly busRiders = new Map<string, Map<string, StreetPose>>();
  /** The chatting pairs' people, by index. */
  private readonly chatters = new Map<number, Chatter>();

  constructor(
    private readonly walkers: readonly Pedestrian[],
    private readonly fleet: readonly Vehicle[],
    private readonly sidewalk: SidewalkCrowd,
  ) {
    this.passers = walkers.map((p) => ({ ...pedestrianAt(p, 0, null), walking: true, umbrella: 0 }));
    for (const p of walkers) if (p.chatX !== null) this.chatters.set(p.index, { state: 'talking', walked: 0, until: null, meeting: 0, settled: true });
  }

  /** Whether a chatter is talking (or waiting at the spot) now, and what their partner is doing. */
  chatState(index: number): Chatter['state'] | null {
    return this.chatters.get(index)?.state ?? null;
  }

  /** The talk's clock, in the bank's minutes: over, the pair part; both back at the spot, they meet again. Frozen in the wet. */
  private stepChatters(minute: number, dt: number, wet: boolean): void {
    for (const p of this.walkers) {
      const c = this.chatters.get(p.index);
      if (!c || wet || !c.settled) continue;
      const partner = this.chatters.get(p.index ^ 1);
      // The clock went back (the time bar dragged back, a new day): the talk starts again from now.
      if (c.until === null || minute < c.until - CHAT_MINUTES[1]) c.until = minute + chatMinutes(p.index >> 1, c.meeting);
      if (c.state === 'talking' && minute >= c.until) {
        c.state = 'walking';
        c.walked = 0;
      } else if (c.state === 'walking') {
        c.walked += p.pace * dt;
        if (c.walked >= PAVEMENT_SPAN) {
          c.walked = 0;
          c.state = 'waiting';
        }
      }
      if (c.state === 'waiting' && partner && partner.state === 'waiting') {
        // Both back: they talk again, for a while of their own.
        const until = minute + chatMinutes(p.index >> 1, c.meeting + 1);
        for (const x of [c, partner]) Object.assign(x, { state: 'talking', meeting: c.meeting + 1, until });
      }
    }
  }

  /** Where a chatter out walking is (null at the spot). */
  private outAt(p: Pedestrian): number | null {
    const c = this.chatters.get(p.index);
    return c && c.state === 'walking' ? wrap(p.chatX! + p.dir * c.walked) : null;
  }

  /** One frame: the vehicles' passengers first, then the passers-by (as the street was always drawn), each stepping round the others; `minute` is the bank's clock (how long the pairs talk). */
  step(clock: PavementClock, vehicles: Map<string, VehicleState>, closed: boolean, dt: number, minute = 0): void {
    const wet = clock.rainFor !== null;
    this.stepChatters(minute, dt, wet);
    for (const v of this.fleet) {
      const s = vehicles.get(v.id);
      if (!s) continue;
      const r = riderAt(v, s, closed);
      if (r) {
        const [x, z] = this.sidewalk.place(`rider-${v.id}`, r.x, r.z, dt, !r.walking);
        this.riders.set(v.id, { x, z, heading: r.heading, walking: r.walking });
      } else {
        this.riders.set(v.id, null);
        this.sidewalk.leave(`rider-${v.id}`);
      }
      if (v.kind !== 'bus') continue;
      const on = new Map(busRiders(v, s, closed).map((b) => [b.id, b]));
      const out = new Map<string, StreetPose>();
      for (const id of BUS_PEOPLE) {
        const b = on.get(id);
        if (!b) {
          this.sidewalk.leave(`bus-${id}`);
          continue;
        }
        const [x, z] = this.sidewalk.place(`bus-${id}`, b.x, b.z, dt, !b.walking);
        out.set(id, { x, z, heading: b.heading, walking: b.walking });
      }
      this.busRiders.set(v.id, out);
    }
    this.walkers.forEach((p, i) => {
      const c = this.chatters.get(p.index);
      if (c && wet) c.settled = false;
      let s = pedestrianAt(p, clock.t, clock.rainFor, clock.storm, clock.after, this.outAt(p));
      if (c && !wet && !c.settled && clock.after) {
        // Back where the weather left them, and on their way again: their own walk (or talk) takes over from here.
        const lane = PAVEMENT.lanes[p.lane];
        if (s.pose === 'chat' || (s.pose === 'walk' && Math.abs(s.z - lane) < 1e-6)) {
          c.settled = true;
          if (s.pose === 'walk' && c.state !== 'walking') c.state = 'walking';
          if (c.state === 'walking') c.walked = (((s.x - p.chatX!) * p.dir) % PAVEMENT_SPAN + PAVEMENT_SPAN) % PAVEMENT_SPAN;
        }
      } else if (c && !wet) c.settled = true;
      if (c && !wet && c.settled && c.state !== 'talking') {
        // Their own walk round the street, or standing at the spot waiting for the other.
        const along = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        s =
          c.state === 'walking'
            ? { x: this.outAt(p)!, z: PAVEMENT.lanes[p.lane], heading: along, pose: 'walk', speed: p.pace, umbrella: 0 }
            : { x: p.chatX!, z: PAVEMENT.lanes[p.lane], heading: p.index % 2 === 0 ? Math.PI / 2 : -Math.PI / 2, pose: 'chat', speed: 0, umbrella: 0 };
      }
      // Stepping aside for anyone else on the pavement rather than walking into them; standing still, locked in place.
      const [x, z] = this.sidewalk.place(`passer-${p.index}`, s.x, s.z, dt, s.speed === 0);
      // An umbrella carrier keeps it up in the wet out in the open, and puts it down under a roof.
      const out = clock.rainFor !== null && p.umbrella && s.pose !== 'lookup' ? 1 : 0;
      const want = underCover(x, z) ? 0 : Math.max(s.umbrella, out);
      const was = this.passers[i]!;
      this.passers[i] = { ...s, x, z, walking: s.speed > 0, umbrella: fadeToward(was.umbrella, want, dt, 1 / UMBRELLA_RATE) };
    });
  }
}
