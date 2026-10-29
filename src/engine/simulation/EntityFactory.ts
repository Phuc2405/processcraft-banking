import { isNightStation } from '../../sim/roster';
import type { StationId } from '../../sim/topology';
import { FrontGuard, type GuardPostPlan } from '../world/guardCabin';
import { ParkingLot } from '../world/parking';
import { ParkCrowd, PARK_MEMBERS, wantsPark } from '../world/parkLife';
import { TrafficSim, VEHICLES, type Vehicle } from '../world/vehicles';
import { PEDESTRIANS, type Pedestrian } from '../world/weather';
import { StaffEntity, NIGHT_SHIFT_SCHEDULE, MORNING_SHIFT_SCHEDULE } from './staff';

/** Factory for everyone and everything that moves in the 3D office's world. */
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

  /** The fleet on the avenue. */
  vehicles(): readonly Vehicle[] {
    return this.fleet;
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
