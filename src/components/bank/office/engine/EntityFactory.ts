import { isNightStation } from '../../../../sim/roster';
import type { StationId } from '../../../../sim/topology';
import { FrontGuard, type GuardPostPlan } from '../guardCabin';
import { ParkingLot } from '../parking';
import { ParkCrowd, PARK_MEMBERS, wantsPark } from '../parkLife';
import { TrafficSim, VEHICLES, type Vehicle } from '../vehicles';
import { PEDESTRIANS, type Pedestrian } from '../weather';
import { StaffEntity, NIGHT_SHIFT_SCHEDULE, MORNING_SHIFT_SCHEDULE } from './staff';

/**
 * Factory for everyone and everything that moves in the 3D office's world: the fleet on the avenue, the car park (with its
 * cash van), the park's people, the guards at a post, the passers-by on the pavement and the staff coming in to a desk.
 * The world engine makes all of them here and nowhere else, so what the world is made of is in one place, and a test (or a
 * variant of the scene) can hand the engine a factory of its own.
 */
export class EntityFactory {
  constructor(
    private readonly fleet: readonly Vehicle[] = VEHICLES,
    private readonly walkers: readonly Pedestrian[] = PEDESTRIANS,
  ) {}

  /** The avenue's traffic: every vehicle on its lap, driven by one simulation. */
  traffic(): TrafficSim {
    return new TrafficSim(this.fleet);
  }

  /** The car park, its barrier, its bays and the cash-in-transit van's run. */
  carPark(): ParkingLot {
    return new ParkingLot();
  }

  /** The park's people, with those wanted there at `minute` already in their places. */
  parkCrowd(minute: number): ParkCrowd {
    return new ParkCrowd(PARK_MEMBERS, (m) => wantsPark(m, minute));
  }

  /** The guards at a post, starting their shift as things stand at `minute` (in the cabin if it is `wet`). */
  guards(plan: GuardPostPlan, minute: number, wet: boolean): FrontGuard {
    return new FrontGuard(minute, wet, plan);
  }

  /** The passers-by on the pavement. */
  pedestrians(): readonly Pedestrian[] {
    return this.walkers;
  }

  /** The people at desk `id` (`ids`, in seat order), each on the shift schedule of the desk: the night's or the day's. */
  staff(id: StationId, ids: readonly string[]): StaffEntity[] {
    const schedule = isNightStation(id) ? NIGHT_SHIFT_SCHEDULE : MORNING_SHIFT_SCHEDULE;
    return ids.map((who, seat) => new StaffEntity(who, id, seat, schedule));
  }
}
