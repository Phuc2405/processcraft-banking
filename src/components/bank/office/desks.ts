/**
 * The desks, as parts. Two designs share one footprint (COUNTER):
 *
 *  - an L-shaped office desk for the back-office stations: the counter, a return running back from its right-hand end
 *    with a rounded tip, dual monitors for every member of staff, a keyboard and mouse, a PC tower;
 *  - a podium for the Ingestion Gates: a stadium-shaped counter under a gantry, with a terminal on top.
 *
 * The monitors face the staff, so the camera sees their backs; the back of every screen shows a lit customer display,
 * so the desk still reads as switched on.
 */

import { STATIONS, type StationId } from '../../../sim/topology';
import { box, cyl, mix, shade, tint, xform, type Part } from './kit';
import { COUNTER, hasWing, seatOffsets, SEAT_ROW, WING, wingPose } from './layout3d';
import { SET } from './palette';
import { stationProp, type PropParts } from './props';

const H = COUNTER.h;
const SLAB = H - 0.02;
/** The top surface of a desk. */
export const SURFACE = H + 0.01;
const BODY_H = H - 0.06;

/** Where a desk's prop stands, on the front edge at the left-hand end. */
export const PROP_AT = [-1.2, SURFACE, 0.27] as const;

export const isPodium = (id: StationId): boolean => STATIONS[id].kind === 'GATE';

function lDesk(accent: string, staff: number): Part[] {
  const w = COUNTER.w;
  const d = COUNTER.d;
  const parts: Part[] = [
    box([0, BODY_H / 2 + 0.02, 0], [w - 0.12, BODY_H, d - 0.1], SET.desk),
    box([0, 0.05, 0], [w - 0.04, 0.1, d - 0.02], SET.deskKick),
    box([0, H * 0.5, d / 2 - 0.05 + 0.012], [w - 0.55, H * 0.46, 0.03], tint(accent, 0.4)),
    box([0, SLAB, 0], [w + 0.06, 0.06, d + 0.08], SET.deskTop),
    box([0, SLAB, (d + 0.08) / 2 + 0.004], [w + 0.06, 0.04, 0.012], accent),
  ];
  if (hasWing(staff)) {
    const wp = wingPose();
    const r = WING.w / 2;
    const boxLen = WING.len - r;
    const bz = -d / 2 - boxLen / 2;
    const capZ = -d / 2 - boxLen;
    parts.push(
      box([wp.x, BODY_H / 2 + 0.02, bz], [WING.w - 0.1, BODY_H, boxLen], SET.desk),
      box([wp.x, SLAB, bz], [WING.w + 0.04, 0.06, boxLen], SET.deskTop),
      box([wp.x, 0.05, bz], [WING.w, 0.1, boxLen], SET.deskKick),
      cyl([wp.x, BODY_H / 2 + 0.02, capZ], r - 0.05, r - 0.05, BODY_H, SET.desk, 10),
      cyl([wp.x, SLAB, capZ], r + 0.02, r + 0.02, 0.06, SET.deskTop, 10),
      cyl([wp.x, 0.05, capZ], r, r, 0.1, SET.deskKick, 10),
    );
  }
  return parts;
}

function podium(accent: string): Part[] {
  const w = COUNTER.w;
  const d = COUNTER.d;
  const r = d / 2;
  const L = w - d;
  const parts: Part[] = [
    box([0, BODY_H / 2 + 0.02, 0], [L, BODY_H, d - 0.1], SET.desk),
    box([0, 0.05, 0], [L, 0.1, d - 0.02], SET.deskKick),
    box([0, SLAB, 0], [L, 0.06, d + 0.06], SET.deskTop),
    box([0, 0.34, d / 2 - 0.05 + 0.012], [L, 0.16, 0.03], accent),
  ];
  for (const s of [-1, 1]) {
    parts.push(cyl([s * L / 2, BODY_H / 2 + 0.02, 0], r - 0.05, r - 0.05, BODY_H, SET.desk, 12), cyl([s * L / 2, SLAB, 0], r + 0.03, r + 0.03, 0.06, SET.deskTop, 12), cyl([s * L / 2, 0.05, 0], r, r, 0.1, SET.deskKick, 12));
    // Gantry posts at both ends, and the beam across: the "gate" the payments enter by.
    parts.push(cyl([s * (w / 2 - 0.1), (H + 2.05) / 2, 0.05], 0.04, 0.04, 2.05 - H, SET.steel, 6));
  }
  parts.push(box([0, 2.05, 0.05], [w - 0.1, 0.14, 0.14], accent), box([0, 2.05, 0.05], [w - 0.1, 0.05, 0.16], shade(accent, 0.2)));
  return parts;
}

/** The lit parts of a desk: furniture, and the things on it that do not light up. */
export function deskSolid(id: StationId, staff: number, accent: string): Part[] {
  const parts = isPodium(id) ? podium(accent) : lDesk(accent, staff);
  const seats = seatOffsets(staff);

  seats.forEach(([x, z], i) => {
    const row = Math.floor(i / SEAT_ROW);
    if (row === 0) {
      const mons = isPodium(id) ? [0] : [-1, 1];
      for (const s of mons) {
        const yaw = Math.PI + (mons.length === 1 ? 0 : s * -0.24);
        parts.push(
          ...xform(
            [box([0, 0.19, 0], [0.33, 0.21, 0.03], '#1e2430'), box([0, 0.08, -0.01], [0.04, 0.12, 0.025], SET.steel), box([0, 0.012, 0], [0.17, 0.024, 0.12], '#2b3340')],
            [x + (mons.length === 1 ? 0 : s * 0.19), SURFACE, 0.1],
            yaw,
          ),
        );
      }
      parts.push(
        box([x, SURFACE + 0.01, -0.36], [0.36, 0.02, 0.12], '#e5e1d8'),
        box([x, SURFACE + 0.022, -0.36], [0.33, 0.004, 0.1], '#bdb7aa'),
        box([x + 0.27, SURFACE + 0.003, -0.36], [0.13, 0.006, 0.14], '#475569'),
        box([x + 0.27, SURFACE + 0.017, -0.36], [0.05, 0.022, 0.08], '#e5e1d8'),
        cyl([x - 0.3, SURFACE + 0.045, -0.3], 0.035, 0.03, 0.09, tint(accent, 0.55), 8),
      );
    } else {
      // A second row has no counter in front of it: a small table with a laptop.
      parts.push(
        box([x, 0.7, z + 0.62], [0.7, 0.04, 0.42], SET.deskTop),
        box([x - 0.3, 0.35, z + 0.62], [0.04, 0.7, 0.38], SET.steelDark),
        box([x + 0.3, 0.35, z + 0.62], [0.04, 0.7, 0.38], SET.steelDark),
        box([x, 0.73, z + 0.64], [0.32, 0.018, 0.22], '#cbd5e1'),
        box([x, 0.84, z + 0.53], [0.32, 0.2, 0.014], '#e2e8f0', [-0.2, 0, 0]),
      );
    }
  });

  // The PC tower: on the return of an L-desk, otherwise standing on the floor at the left-hand end.
  const tower = (x: number, y: number, z: number): Part[] => [
    box([x, y + 0.22, z], [0.2, 0.44, 0.38], '#2c3441'),
    box([x, y + 0.25, z + 0.192], [0.17, 0.36, 0.006], '#3b4656'),
    box([x, y + 0.36, z + 0.196], [0.13, 0.03, 0.004], '#1f2630'),
    box([x, y + 0.31, z + 0.196], [0.13, 0.03, 0.004], '#1f2630'),
    cyl([x, y + 0.2, z + 0.2], 0.022, 0.022, 0.01, '#1f2630', 8, [Math.PI / 2, 0, 0]),
  ];
  if (!isPodium(id) && hasWing(staff)) {
    const wp = wingPose();
    parts.push(...tower(wp.x, SURFACE, wp.z - 0.1));
  } else {
    parts.push(...tower(-COUNTER.w / 2 - 0.3, 0, -0.1));
    if (staff > 2) parts.push(...tower(-COUNTER.w / 2 - 0.55, 0, -0.1));
  }

  const prop = stationProp(id);
  parts.push(...xform(prop.solid, PROP_AT));
  return parts;
}

/** The unlit parts of a desk: screens, indicator lights. Their colour follows who is working. */
export function deskGlow(id: StationId, staff: number, working: readonly boolean[], accent: string): Part[] {
  const parts: Part[] = [];
  const seats = seatOffsets(staff);
  const back = (on: boolean): string => (on ? mix(accent, '#ffffff', 0.5) : '#7b8794');
  seats.forEach(([x], i) => {
    if (Math.floor(i / SEAT_ROW) !== 0) return;
    const on = working[i] ?? false;
    const mons = isPodium(id) ? [0] : [-1, 1];
    for (const s of mons) {
      const yaw = Math.PI + (mons.length === 1 ? 0 : s * -0.24);
      parts.push(
        ...xform(
          [
            // the face the member of staff looks at
            box([0, 0.19, 0.0155], [0.3, 0.18, 0.004], on ? SET.screenOn : '#52606f'),
            ...(on ? [box([-0.05, 0.24, 0.0185], [0.14, 0.02, 0.002], '#e0f2fe'), box([0.04, 0.17, 0.0185], [0.18, 0.012, 0.002], '#bae6fd')] : []),
            // the face the customers look at
            box([0, 0.19, -0.0155], [0.28, 0.16, 0.004], back(on)),
            box([-0.04, 0.24, -0.0185], [0.15, 0.016, 0.002], '#ffffff'),
            box([0.0, 0.195, -0.0185], [0.2, 0.01, 0.002], tint(back(on), 0.5)),
            box([0.0, 0.155, -0.0185], [0.12, 0.01, 0.002], tint(back(on), 0.5)),
          ],
          [x + (mons.length === 1 ? 0 : s * 0.19), SURFACE, 0.1],
          yaw,
        ),
      );
    }
  });
  const prop: PropParts = stationProp(id);
  parts.push(...xform(prop.glow, PROP_AT));
  return parts;
}
