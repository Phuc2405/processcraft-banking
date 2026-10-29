import { fadeToward } from './atmosphere';
import type { SidewalkCrowd } from './sidewalk';
import { BUS_PEOPLE, busRiders, riderAt, type Vehicle, type VehicleState } from './vehicles';
import { pedestrianAt, underCover, UMBRELLA_RATE, type PavementClock, type Pedestrian, type PedestrianPose } from './weather';

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

  constructor(
    private readonly walkers: readonly Pedestrian[],
    private readonly fleet: readonly Vehicle[],
    private readonly sidewalk: SidewalkCrowd,
  ) {
    this.passers = walkers.map((p) => ({ ...pedestrianAt(p, 0, null), walking: true, umbrella: 0 }));
  }

  /** One frame: the vehicles' passengers first, then the passers-by (as the street was always drawn), each stepping round the others. */
  step(clock: PavementClock, vehicles: Map<string, VehicleState>, closed: boolean, dt: number): void {
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
      const s = pedestrianAt(p, clock.t, clock.rainFor, clock.storm, clock.after);
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
