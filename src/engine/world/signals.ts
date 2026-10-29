import type { PacketKind } from '../../sim/types';
import { STATION_IDS, STATIONS, type StationId } from '../../sim/topology';
import { deskPose, FLOOR_SLAB, isDigital } from '../plan/layout3d';

/**
 * How the digital gates' customers arrive in the 3D office. Nobody walks in for a card tapped at a shop's terminal, a
 * virtual card or an online checkout, a transfer, a QR payment, a SWIFT message or an eKYC selfie: each comes in as a
 * signal, a glowing pulse beamed from the cell tower at the back corner of the car park and arcing down onto its gate's
 * desk, in the colour of its kind of payment. Pure, so the tests can check where the pulses fly.
 */

const HX = FLOOR_SLAB.w / 2;
const HZ = FLOOR_SLAB.d / 2;

/** The cell tower: in the corner of the car park behind the branch's left wall, clear of its bays and drive. `top` is the
 * height of its antennas, where the pulses leave from. */
export const CELL_TOWER = { x: -(HX + 1.5), z: -HZ - 0.3, top: 7.4 } as const;

/** The gates whose customers arrive as signals. */
export const DIGITAL_GATES: readonly StationId[] = STATION_IDS.filter((id) => STATIONS[id].kind === 'GATE' && isDigital(id));

/** The kind of payment each gate takes in, for its pulses' colour. */
export const SIGNAL_KIND: Partial<Record<StationId, PacketKind>> = {
  GATE_VIRTUAL: 'VIRTUAL',
  GATE_POS: 'POS',
  GATE_ECOM: 'ECOM',
  GATE_A2A: 'A2A',
  GATE_QR: 'QR',
  GATE_SWIFT: 'SWIFT',
  GATE_EKYC: 'ONBOARD',
};

/** How long a pulse takes from the tower to its desk (seconds on the motion clock), and how many are sent per beat at most. */
export const SIGNAL = { flight: 1.6, perBeat: 3, gap: 0.35, arc: 2.2 } as const;

/** Where a pulse lands: just over the middle of its gate's counter. */
export const signalTarget = (id: StationId): readonly [number, number, number] => {
  const p = deskPose(id);
  return [p.x, 1.25, p.z];
};

/** Where a pulse to gate `id` is, `u` (0-1) of the way there: a curve from the tower's top, arcing up and down onto the desk. */
export function signalPoint(id: StationId, u: number): [number, number, number] {
  const k = Math.max(0, Math.min(1, u));
  const [tx, ty, tz] = signalTarget(id);
  const x = CELL_TOWER.x + (tx - CELL_TOWER.x) * k;
  const z = CELL_TOWER.z + (tz - CELL_TOWER.z) * k;
  const y = CELL_TOWER.top + (ty - CELL_TOWER.top) * k + Math.sin(k * Math.PI) * SIGNAL.arc;
  return [x, y, z];
}
