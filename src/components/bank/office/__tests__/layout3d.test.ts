import { describe, expect, it } from 'vitest';
import { STATION_IDS, STATIONS, WIRES, edgeId } from '../../../../sim/topology';
import { OFFICE_DEPT_BOX as DEPT_BOX, OFFICE_PLACE_BOX as PLACE_BOX } from '../officePlan';
import { BUILDING } from '../../layout';
import {
  arrivalPath,
  CAR_PARK_FOOTWAY_X,
  ATM_ALCOVE,
  ATM_KIOSK,
  ATM_STATIONS,
  atmBooth,
  bayRect,
  frontPlinth,
  HOME_TARGET,
  isMachine,
  KERB_Z,
  kioskCentre,
  LAMP,
  queueStyle,
  ROAD_END,
  ROPED_QUEUES,
  SCENE,
  STREET,
  STREET_LAMPS,
  WALK_IN_DESKS,
  CUSTOMER_DOOR,
  FRONT_AISLE_Z,
  LEFT_WALK_X,
  WALKER_STATIONS,
  CAMERA_DIRECTION,
  CAMERA_DISTANCE,
  crossings,
  hasWing,
  hopHeight,
  isSlumped,
  ISO_AZIMUTH,
  ISO_POLAR,
  packetLane,
  partition,
  PLANTS,
  SERVER_ROOM,
  SEAT_BACK,
  SLUMP_FATIGUE,
  smoothLane,
  stanchionLine,
  surgeLevel,
  typingRate,
  vaultRoom,
  viewGround,
  WALL_WINDOWS,
  wingPose,
  WING,
  clampTarget,
  COUNTER,
  departmentFloor,
  deskPose,
  ENTRANCES,
  FLOOR,
  FLOOR_SLAB,
  fitZoom,
  hopTiming,
  kioskPose,
  laneAt,
  laneLength,
  LANES,
  queueSlots,
  QUEUE_VISIBLE,
  seatOffsets,
  SEAT_ROW,
  toWorld,
  WORLD_SCALE,
  wireLane,
  ZOOM_LIMITS,
  STATION_POSES,
} from '../layout3d';

/** The Ingestion Gates in the order they stand down the left of the floor. */
const GATE_COLUMN = ['GATE_VIRTUAL', 'GATE_POS', 'GATE_A2A', 'GATE_ECOM'] as const;

describe('the office floor', () => {
  it('maps the middle of the 2D stage to the middle of the floor, and the corners to the corners', () => {
    expect(toWorld(BUILDING.width / 2, BUILDING.height / 2)).toEqual([0, 0]);
    expect(toWorld(0, 0)).toEqual([-FLOOR.w / 2, -FLOOR.d / 2]);
    expect(toWorld(BUILDING.width, BUILDING.height)).toEqual([FLOOR.w / 2, FLOOR.d / 2]);
  });

  it('puts every desk where the frozen floor plan has it, keeping left, right, above and below', () => {
    for (const id of STATION_IDS) {
      const box = PLACE_BOX[id];
      const pose = deskPose(id);
      expect(pose.x).toBeCloseTo((box.cx - BUILDING.width / 2) / WORLD_SCALE, 9);
      expect(pose.z).toBeCloseTo((box.cy - BUILDING.height / 2) / WORLD_SCALE, 9);
      expect(pose.w).toBe(COUNTER.w);
    }
    expect(STATION_POSES.GATE_VIRTUAL.x).toBeLessThan(STATION_POSES.SEC_VAULT.x);
    expect(STATION_POSES.GATE_VIRTUAL.z).toBeLessThan(STATION_POSES.GATE_POS.z);
    expect(STATION_POSES.SEC_DCVV.x).toBeLessThan(STATION_POSES.LEDGER_DEBIT.x);
  });

  it('keeps every counter inside its own department floor', () => {
    for (const id of STATION_IDS) {
      const pose = deskPose(id);
      const floor = departmentFloor(STATIONS[id].department);
      expect(pose.x - pose.w / 2).toBeGreaterThanOrEqual(floor.x - floor.w / 2);
      expect(pose.x + pose.w / 2).toBeLessThanOrEqual(floor.x + floor.w / 2);
      expect(pose.z - pose.d / 2).toBeGreaterThanOrEqual(floor.z - floor.d / 2);
      expect(pose.z + pose.d / 2).toBeLessThanOrEqual(floor.z + floor.d / 2);
    }
  });

  it('draws a floor for every department and a kiosk for every tally', () => {
    for (const box of Object.values(DEPT_BOX)) expect(box.w).toBeGreaterThan(0);
    for (const id of ['OUT_APPROVED', 'OUT_DECLINED', 'OUT_SETTLED', 'CUSTOMER_OTP'] as const) {
      const k = kioskPose(id);
      expect(k.w).toBeGreaterThan(0.5);
      expect(k.d).toBeGreaterThan(0.5);
    }
  });

  it('keeps every counter, kiosk and door on the slab, except the ATMs, which stand on the pavement outside', () => {
    const hx = FLOOR_SLAB.w / 2;
    const hz = FLOOR_SLAB.d / 2;
    for (const id of STATION_IDS) {
      const p = deskPose(id);
      expect(Math.abs(p.x) + p.w / 2).toBeLessThan(hx);
      if (isMachine(id)) {
        expect(p.z - p.d / 2, id).toBeGreaterThan(hz);
        continue;
      }
      expect(Math.abs(p.z) + p.d / 2).toBeLessThan(hz);
    }
    for (const e of ENTRANCES) expect(Math.abs(e.at[0])).toBeLessThanOrEqual(hx);
  });

  it('puts the world origin in the middle of the building, not of the stage that also holds the pavement', () => {
    expect(toWorld(BUILDING.width / 2, BUILDING.height / 2)).toEqual([0, 0]);
    expect(toWorld(540, BUILDING.height)[1]).toBe(FLOOR.d / 2);
    // The ATM cards sit below the building on the 2D stage, and so on the pavement in front of it in 3D.
    expect(deskPose('GATE_ATM').z).toBeGreaterThan(FLOOR.d / 2);
  });
});

describe('people', () => {
  it('seats staff behind the counter, four to a row, centred, without overlap', () => {
    for (let n = 1; n <= 9; n++) {
      const seats = seatOffsets(n);
      expect(seats).toHaveLength(n);
      for (const [, z] of seats) expect(z).toBeLessThan(-COUNTER.d / 2);
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const a = seats[i] as [number, number];
          const b = seats[j] as [number, number];
          expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(0.6);
        }
      // Each row is centred on the counter.
      const firstRow = seats.slice(0, SEAT_ROW);
      const mean = firstRow.reduce((s, p) => s + p[0], 0) / firstRow.length;
      expect(mean).toBeCloseTo(0, 9);
    }
    expect(seatOffsets(0)).toEqual([]);
  });

  it('lines customers up in front of the counter, head of the queue first, at most five', () => {
    expect(queueSlots('GATE_POS', 0)).toEqual([]);
    const slots = queueSlots('GATE_POS', 40);
    const pose = deskPose('GATE_POS');
    expect(slots).toHaveLength(QUEUE_VISIBLE);
    for (const [, z] of slots) expect(z).toBeGreaterThan(pose.z + pose.d / 2);
    for (let i = 1; i < slots.length; i++) expect((slots[i] as [number, number])[1]).toBeGreaterThan((slots[i - 1] as [number, number])[1]);
  });

  it('keeps the queue of a gate clear of the counter in front of it', () => {
    const gates = GATE_COLUMN;
    for (let i = 0; i + 1 < gates.length; i++) {
      const slots = queueSlots(gates[i] as (typeof gates)[number], 40);
      const last = slots[slots.length - 1] as [number, number];
      const next = deskPose(gates[i + 1] as (typeof gates)[number]);
      // The tail of the line stops before the next counter's seats (they sit behind it).
      expect(last[1]).toBeLessThan(next.z - next.d / 2);
    }
  });

  it('sends walkers to the teller and the disputes desk by a side door and to the ATM down the pavement, and nobody to a digital gate', () => {
    expect(WALK_IN_DESKS).toEqual(['TELLER_CASH', 'DISPUTE_DESK']);
    expect([...WALKER_STATIONS].sort()).toEqual(['GATE_ATM', 'ATM_CASH', 'TELLER_CASH', 'DISPUTE_DESK'].sort());
    for (const id of ['GATE_A2A', 'GATE_POS', 'GATE_VIRTUAL', 'GATE_ECOM'] as const) expect(WALKER_STATIONS).not.toContain(id);
    for (const id of ATM_STATIONS) {
      const path = arrivalPath(id, 2);
      // The customer comes from the far left end of the street, along the pavement, never through the building.
      expect((path[0] as [number, number])[0]).toBeLessThan(-FLOOR.w / 2);
      for (const [, z] of path) {
        expect(z).toBeGreaterThan(STREET.z0);
        expect(z).toBeLessThan(KERB_Z);
      }
    }
  });

  it('queues every gate as phones (all digital), customers at the teller, disputes and ATMs, and case files at internal desks', () => {
    const phones = ['GATE_A2A', 'GATE_QR', 'GATE_SWIFT', 'GATE_EKYC', 'GATE_POS', 'GATE_VIRTUAL', 'GATE_ECOM'];
    const people = ['TELLER_CASH', 'DISPUTE_DESK', 'GATE_ATM', 'ATM_CASH'];
    for (const id of STATION_IDS) expect(queueStyle(id), id).toBe(phones.includes(id) ? 'phones' : people.includes(id) ? 'people' : 'files');
    // The night's desks are internal: only files wait there.
    for (const id of ['EOD_BATCH', 'EOD_VISA', 'RECON', 'SUSPENSE'] as const) expect(queueStyle(id)).toBe('files');
  });

  it('sends arrivals from the car park, in at the customers’ side door and along the front aisle, to the back of the queue', () => {
    expect(ENTRANCES).toHaveLength(3);
    expect(ENTRANCES.map((e) => e.at)).toContainEqual(CUSTOMER_DOOR);
    for (const id of WALK_IN_DESKS) {
      const path = arrivalPath(id, 2);
      // From beside a car on the car park's footway, across the walkway and in at the door: nobody appears at the door.
      expect(path[0]![0]).toBe(CAR_PARK_FOOTWAY_X);
      expect(path[1]).toEqual([CAR_PARK_FOOTWAY_X, CUSTOMER_DOOR[1]]);
      expect(path).toContainEqual(CUSTOMER_DOOR);
      expect(path).toContainEqual([LEFT_WALK_X, FRONT_AISLE_Z]);
      expect(CUSTOMER_DOOR[0]).toBeLessThan(-FLOOR.w / 2);
      const tail = path[path.length - 1] as [number, number];
      expect(tail[0]).toBeGreaterThan(CUSTOMER_DOOR[0]);
      expect(laneLength(path)).toBeGreaterThan(1);
    }
  });
});

describe('lanes and packets', () => {
  it('has a floor lane for every wire, along the same points as the 2D map', () => {
    expect(LANES).toHaveLength(WIRES.length);
    for (const [from, to] of WIRES) {
      const lane = wireLane(edgeId(from, to));
      expect(lane, `${from}>${to}`).not.toBeNull();
      expect((lane ?? []).length).toBeGreaterThanOrEqual(2);
    }
    expect(wireLane('NOT>A_WIRE')).toBeNull();
  });

  it('walks along a lane and points the way it goes', () => {
    const lane: Array<[number, number]> = [
      [0, 0],
      [4, 0],
      [4, 3],
    ];
    expect(laneLength(lane)).toBe(7);
    expect(laneAt(lane, 0)).toMatchObject({ x: 0, z: 0 });
    expect(laneAt(lane, 2)).toMatchObject({ x: 2, z: 0, heading: 0 });
    const turn = laneAt(lane, 5.5);
    expect(turn.x).toBe(4);
    expect(turn.z).toBeCloseTo(1.5, 9);
    expect(turn.heading).toBeCloseTo(-Math.PI / 2, 9);
    expect(laneAt(lane, 99)).toMatchObject({ x: 4, z: 3 });
    expect(laneAt([], 3)).toEqual({ x: 0, z: 0, heading: 0 });
  });

  it('times a hop like the 2D map: a later move in the beat starts later, and a hop is neither a blink nor a crawl', () => {
    const fast = hopTiming(0.5, 150);
    const slow = hopTiming(0.5, 6000);
    expect(fast.durationMs).toBe(240);
    expect(slow.durationMs).toBe(720);
    expect(hopTiming(0, 1500).delayMs).toBe(0);
    expect(hopTiming(1, 1500).delayMs).toBeGreaterThan(hopTiming(0.5, 1500).delayMs);
  });
});

describe('the camera', () => {
  it('chooses a zoom that fits the floor, within limits, and a smaller window zooms out', () => {
    const big = fitZoom(1600, 900);
    const small = fitZoom(800, 450);
    expect(big).toBeGreaterThan(small);
    for (const z of [big, small, fitZoom(0, 0), fitZoom(5000, 4000), fitZoom(50, 50)]) {
      expect(z).toBeGreaterThanOrEqual(ZOOM_LIMITS.min);
      expect(z).toBeLessThanOrEqual(ZOOM_LIMITS.max);
    }
  });

  it('holds the point the camera looks at over the office or its pavement', () => {
    expect(clampTarget(0, 0)).toEqual([0, 0]);
    const [x, z] = clampTarget(500, -500);
    expect(x).toBe(FLOOR_SLAB.w / 2);
    expect(z).toBe(-FLOOR_SLAB.d / 2);
    // Dragged towards the street, the view may reach the kerb, and no further.
    expect(clampTarget(0, 500)[1]).toBe(SCENE.z1);
    expect(SCENE.z1).toBeGreaterThan(KERB_Z);
    expect(SCENE.z1).toBeLessThan(ROAD_END);
  });

  it('fits the office and the pavement together, so the ATMs are in the first view', () => {
    expect(SCENE.z1).toBeGreaterThan(deskPose('ATM_CASH').z + 2);
    // The home view looks at the middle of that scene, which is a little towards the street from the middle of the office.
    expect(HOME_TARGET).toEqual([SCENE.cx, SCENE.cz]);
    expect(HOME_TARGET[1]).toBeGreaterThan(0);
    // Fitting a taller scene needs a smaller zoom than the office alone would.
    const officeOnly = Math.min(1600 / (((FLOOR_SLAB.w + FLOOR_SLAB.d) / Math.SQRT2) * 1.04), 900 / (((FLOOR_SLAB.w + FLOOR_SLAB.d) / Math.sqrt(6) + 3.7) * 1.04));
    expect(fitZoom(1600, 900)).toBeLessThan(officeOnly);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// The diorama
// ─────────────────────────────────────────────────────────────────────────────

const footprints = (): Array<{ name: string; x0: number; x1: number; z0: number; z1: number }> => {
  const out: Array<{ name: string; x0: number; x1: number; z0: number; z1: number }> = [];
  for (const id of STATION_IDS) {
    const p = deskPose(id);
    // The counter, the staff behind it, and the wing: a generous box around the working part of a desk.
    out.push({ name: id, x0: p.x - p.w / 2 - 0.3, x1: p.x + p.w / 2 + 0.3, z0: p.z - 2.1, z1: p.z + p.d / 2 + 0.2 });
  }
  for (const id of ['OUT_APPROVED', 'OUT_DECLINED', 'OUT_SETTLED', 'CUSTOMER_OTP'] as const) {
    const k = kioskPose(id);
    out.push({ name: id, x0: k.x - k.w / 2 - 0.25, x1: k.x + k.w / 2 + 0.25, z0: k.z - k.d / 2 - 0.25, z1: k.z + k.d / 2 + 0.25 });
  }
  return out;
};

/** The distance from a point to a segment. */
function distToSegment(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t));
}

describe('rounded paths for the packets', () => {
  const corner: Array<[number, number]> = [
    [0, 0],
    [6, 0],
    [6, 5],
  ];

  it('keeps the ends of a lane and rounds the corner between them, so the path is shorter and has more points', () => {
    const s = smoothLane(corner, 1, 6);
    expect(s[0]).toEqual([0, 0]);
    expect(s[s.length - 1]).toEqual([6, 5]);
    expect(s.length).toBeGreaterThan(corner.length);
    expect(laneLength(s)).toBeLessThan(laneLength(corner));
    expect(laneLength(s)).toBeGreaterThan(laneLength(corner) - 1);
    // Nothing leaves the box of the original corner.
    for (const [x, z] of s) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(6);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(5);
    }
  });

  it('never turns the path through a right angle in one step', () => {
    const s = smoothLane(corner, 1.5, 8);
    for (let i = 2; i < s.length; i++) {
      const a = s[i - 2] as [number, number];
      const b = s[i - 1] as [number, number];
      const c = s[i] as [number, number];
      const d1 = [b[0] - a[0], b[1] - a[1]];
      const d2 = [c[0] - b[0], c[1] - b[1]];
      const dot = ((d1[0] as number) * (d2[0] as number) + (d1[1] as number) * (d2[1] as number)) / (Math.hypot(d1[0] as number, d1[1] as number) * Math.hypot(d2[0] as number, d2[1] as number));
      expect(dot).toBeGreaterThan(0.6);
    }
  });

  it('leaves straight lanes, two-point lanes and a zero radius alone', () => {
    const straight: Array<[number, number]> = [
      [0, 0],
      [2, 0],
      [5, 0],
    ];
    expect(smoothLane(straight)).toEqual(straight);
    const two: Array<[number, number]> = [
      [0, 0],
      [3, 4],
    ];
    expect(smoothLane(two)).toEqual(two);
    expect(smoothLane(corner, 0)).toEqual(corner);
  });

  it('flies a smoothed lane for every wire, once per wire', () => {
    for (const [from, to] of WIRES) {
      const id = edgeId(from, to);
      const lane = packetLane(id);
      const painted = wireLane(id) as Array<[number, number]>;
      expect(lane).not.toBeNull();
      expect((lane ?? [])[0]).toEqual(painted[0]);
      expect((lane ?? [])[(lane ?? []).length - 1]).toEqual(painted[painted.length - 1]);
      expect(packetLane(id)).toBe(lane);
    }
    expect(packetLane('NOT>A_WIRE')).toBeNull();
  });

  it('hops: on the floor at both ends, highest in the middle', () => {
    expect(hopHeight(0)).toBeCloseTo(0, 9);
    expect(hopHeight(1)).toBeCloseTo(0, 9);
    expect(hopHeight(0.5)).toBeCloseTo(0.34, 9);
    expect(hopHeight(0.25)).toBeLessThan(hopHeight(0.5));
    expect(hopHeight(-4)).toBeCloseTo(0, 9);
    expect(hopHeight(9)).toBeCloseTo(0, 9);
  });
});

describe('glass partitions', () => {
  const room = { x0: 0, z0: 0, x1: 10, z1: 6 };

  it('finds where a lane crosses a side of a room, and ignores lanes that stay outside or run along it', () => {
    const through: Array<[number, number]> = [
      [-2, 2],
      [12, 2],
    ];
    expect(crossings(room, 'left', [through])).toEqual([2]);
    expect(crossings(room, 'right', [through])).toEqual([2]);
    expect(crossings(room, 'front', [through])).toEqual([]);
    const outside: Array<[number, number]> = [
      [-2, 8],
      [12, 8],
    ];
    expect(crossings(room, 'left', [outside])).toEqual([]);
    const along: Array<[number, number]> = [
      [0, -2],
      [0, 9],
    ];
    expect(crossings(room, 'left', [along])).toEqual([]);
    const down: Array<[number, number]> = [
      [4, -1],
      [4, 9],
    ];
    expect(crossings(room, 'front', [down])).toEqual([4]);
    expect(crossings(room, 'back', [down])).toEqual([4]);
  });

  it('cuts a doorway where a lane passes and keeps the rest as glass', () => {
    const lane: Array<[number, number]> = [
      [-2, 2],
      [12, 2],
    ];
    const { runs, doors } = partition(room, ['left'], [lane], 1);
    expect(doors).toEqual([{ axis: 'z', at: 0, centre: 2, width: 1 }]);
    expect(runs).toEqual([
      { axis: 'z', at: 0, from: 0, to: 1.5 },
      { axis: 'z', at: 0, from: 2.5, to: 6 },
    ]);
  });

  it('merges doorways that are close together, and drops slivers of wall', () => {
    const a: Array<[number, number]> = [
      [-1, 2],
      [3, 2],
    ];
    const b: Array<[number, number]> = [
      [-1, 2.6],
      [3, 2.6],
    ];
    const { doors } = partition(room, ['left'], [a, b], 1);
    expect(doors).toHaveLength(1);
    expect((doors[0] as { width: number }).width).toBeCloseTo(1.6, 9);
    const edge: Array<[number, number]> = [
      [-1, 0.2],
      [3, 0.2],
    ];
    const { runs } = partition(room, ['left'], [edge], 1);
    expect(runs).toHaveLength(1);
    expect((runs[0] as { from: number }).from).toBeCloseTo(0.7, 9);
  });

  it('puts a whole side up as glass when nothing passes through it', () => {
    const { runs, doors } = partition(room, ['front', 'back'], [], 1);
    expect(doors).toEqual([]);
    expect(runs).toEqual([
      { axis: 'x', at: 6, from: 0, to: 10 },
      { axis: 'x', at: 0, from: 0, to: 10 },
    ]);
  });

  it('builds the vault room out to the back wall, over the whole Security department, with a doorway for every lane that crosses its walls', () => {
    const rect = vaultRoom();
    const dept = departmentFloor('SECURITY');
    expect(rect.x0).toBeCloseTo(dept.x - dept.w / 2, 9);
    expect(rect.x1).toBeCloseTo(dept.x + dept.w / 2, 9);
    expect(rect.z1).toBeCloseTo(dept.z + dept.d / 2, 9);
    expect(rect.z0).toBeLessThan(dept.z - dept.d / 2);
    expect(rect.z0).toBeGreaterThan(-FLOOR_SLAB.d / 2);
    const lanes = LANES.map((l) => l.points);
    const sides = ['front', 'left', 'right'] as const;
    const { runs, doors } = partition(rect, sides, lanes, 1.1);
    expect(doors.length).toBeGreaterThan(3);
    // No stretch of glass stands where a lane passes.
    for (const side of sides) {
      const at = side === 'left' ? 'x0' : side === 'right' ? 'x1' : 'z1';
      for (const c of crossings(rect, side, lanes)) {
        const wall = runs.filter((r) => r.at === rect[at]);
        for (const r of wall) expect(c > r.from + 1e-6 && c < r.to - 1e-6, `${side} ${c.toFixed(2)}`).toBe(false);
      }
    }
  });

  it('keeps every lane out of the server room, so it needs no doorways', () => {
    const { racks, ...rect } = SERVER_ROOM;
    for (const lane of LANES) {
      for (let i = 1; i < lane.points.length; i++) {
        const a = lane.points[i - 1] as [number, number];
        const b = lane.points[i] as [number, number];
        for (let t = 0; t <= 1; t += 0.02) {
          const x = a[0] + (b[0] - a[0]) * t;
          const z = a[1] + (b[1] - a[1]) * t;
          expect(x > rect.x0 - 0.1 && x < rect.x1 + 0.1 && z > rect.z0 - 0.1 && z < rect.z1 + 0.1, `${lane.id} at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(false);
        }
      }
    }
    expect(racks).toHaveLength(4);
    for (const [x, z] of racks) {
      expect(x).toBeGreaterThan(rect.x0);
      expect(x).toBeLessThan(rect.x1);
      expect(z).toBeGreaterThan(rect.z0);
      expect(z).toBeLessThan(rect.z1);
    }
    expect(rect.x1).toBeLessThan(FLOOR_SLAB.w / 2);
  });
});

describe('desks and gates', () => {
  it('gives an L-shaped desk its return at the right-hand end, behind the counter, where up to two staff can still sit beside it', () => {
    const w = wingPose();
    expect(w.x + w.w / 2).toBeCloseTo(COUNTER.w / 2, 9);
    expect(w.z + w.d / 2).toBeCloseTo(-COUNTER.d / 2, 9);
    expect(w.d).toBe(WING.len);
    expect(hasWing(1)).toBe(true);
    expect(hasWing(2)).toBe(true);
    expect(hasWing(3)).toBe(false);
    for (const n of [1, 2]) for (const [x] of seatOffsets(n)) expect(x + 0.3).toBeLessThan(w.x - w.w / 2);
  });

  it('seats staff close enough to the counter for their hands to reach the keyboard', () => {
    expect(SEAT_BACK).toBeGreaterThan(COUNTER.d / 2 + 0.3);
    expect(SEAT_BACK).toBeLessThan(COUNTER.d / 2 + 0.6);
  });

  it('lines the queue of a gate with posts and ropes that straddle the line of customers and stop short of the next gate', () => {
    const gates = GATE_COLUMN;
    gates.forEach((id, i) => {
      const { posts, ropes } = stanchionLine(id);
      const pose = deskPose(id);
      expect(posts).toHaveLength(4);
      expect(ropes).toHaveLength(2);
      const line = pose.x - 0.5;
      expect(posts.filter(([x]) => x < line)).toHaveLength(2);
      expect(posts.filter(([x]) => x > line)).toHaveLength(2);
      for (const [, z] of posts) expect(z).toBeGreaterThan(pose.z + pose.d / 2);
      for (const slot of queueSlots(id, 5)) {
        expect(slot[0]).toBeGreaterThan(line - 0.58);
        expect(slot[0]).toBeLessThan(line + 0.58);
      }
      const next = gates[i + 1];
      if (next) {
        const n = deskPose(next);
        for (const [, z] of posts) expect(z).toBeLessThan(n.z - SEAT_BACK - 0.3);
      }
    });
  });

  it('puts the two ATMs on the pavement in front of the building, each facing the street with its queue in front of it', () => {
    expect(ATM_STATIONS).toEqual(['GATE_ATM', 'ATM_CASH']);
    for (const id of ATM_STATIONS) {
      expect(isMachine(id)).toBe(true);
      const [x, z] = kioskCentre(id);
      // Standing on the pavement, in front of the building and behind the kerb.
      expect(z - ATM_KIOSK.d / 2).toBeGreaterThan(STREET.z0);
      expect(z + ATM_KIOSK.d / 2).toBeLessThan(KERB_Z);
      expect(Math.abs(x) + ATM_KIOSK.w / 2).toBeLessThan(STREET.halfWidth);
      // The customer at the machine stands straight in front of it; the rest wait in a line across its glass booth, every
      // one inside the booth, behind its rope, never out on the open pavement.
      const slots = queueSlots(id, 40);
      const booth = atmBooth(id);
      expect(Math.abs(slots[0]![0] - x)).toBeLessThanOrEqual(0.01);
      for (const [sx, sz] of slots) {
        expect(sz).toBeGreaterThan(z + ATM_KIOSK.d / 2);
        expect(sx).toBeGreaterThan(booth.x0 + 0.15);
        expect(sx).toBeLessThan(booth.x1 - 0.15);
        expect(sz).toBeLessThan(booth.front - 0.2);
      }
      expect(booth.front).toBeLessThan(KERB_Z - 0.9);
      // The paved bay covers the kiosk and the whole queue.
      const bay = bayRect(id);
      expect(bay.x0).toBeLessThan(x - ATM_KIOSK.w / 2);
      expect(bay.x1).toBeGreaterThan(x + ATM_KIOSK.w / 2);
      expect(bay.z1).toBeGreaterThan((slots[slots.length - 1] as [number, number])[1]);
      expect(bay.z1).toBeLessThanOrEqual(KERB_Z);
    }
    // The two bays do not overlap, and the second is to the right of the first.
    const [a, b] = ATM_STATIONS.map(bayRect) as [ReturnType<typeof bayRect>, ReturnType<typeof bayRect>];
    expect(b.x0).toBeGreaterThan(a.x1);
  });

  it('draws the ATM department as a floor on the pavement, never inside the lobby', () => {
    const f = departmentFloor('ATM');
    expect(f.z - f.d / 2).toBeGreaterThanOrEqual(STREET.z0);
    expect(f.z + f.d / 2).toBeLessThanOrEqual(KERB_Z);
  });

  it('backs both kiosks with a low alcove wall along the front of the building, lower than a person', () => {
    expect(ATM_ALCOVE.h).toBeLessThan(1.7);
    for (const id of ATM_STATIONS) {
      const [x] = kioskCentre(id);
      expect(ATM_ALCOVE.x0).toBeLessThan(x - ATM_KIOSK.w / 2);
      expect(ATM_ALCOVE.x1).toBeGreaterThan(x + ATM_KIOSK.w / 2);
    }
    expect(ATM_ALCOVE.z).toBeGreaterThan(STREET.z0);
    expect(ATM_ALCOVE.z).toBeLessThan(kioskCentre('GATE_ATM')[1] - ATM_KIOSK.d / 2);
  });

  it('ropes both ATMs’ queues (the gates are digital: nobody queues at them in person)', () => {
    expect([...ROPED_QUEUES].sort()).toEqual(['ATM_CASH', 'GATE_ATM']);
    for (const id of ATM_STATIONS) {
      // A rope across the booth's open front, with a gap at one end to walk in.
      const { posts, ropes } = stanchionLine(id);
      expect(posts).toHaveLength(2);
      expect(ropes).toHaveLength(1);
      const booth = atmBooth(id);
      for (const [px, z] of posts) {
        expect(z).toBeLessThan(KERB_Z);
        expect(z).toBeGreaterThan(booth.front - 0.2);
        expect(px).toBeGreaterThanOrEqual(booth.x0);
        expect(px).toBeLessThanOrEqual(booth.x1);
      }
      expect(booth.x1 - Math.max(...posts.map(([px]) => px))).toBeGreaterThan(0.5);
    }
  });

  it('lights the street with lamps along the kerb, clear of every ATM queue and of every painted lane', () => {
    expect(STREET_LAMPS.length).toBeGreaterThanOrEqual(3);
    for (const [x, z] of STREET_LAMPS) {
      expect(z).toBeGreaterThan(STREET.z0 + STREET.walk / 2);
      expect(z).toBeLessThan(KERB_Z);
      expect(Math.abs(x)).toBeLessThan(STREET.halfWidth);
      for (const id of ATM_STATIONS) for (const [sx, sz] of queueSlots(id, 5)) expect(Math.hypot(sx - x, sz - z)).toBeGreaterThan(1.2);
      for (const lane of LANES) for (let i = 1; i < lane.points.length; i++) expect(distToSegment([x, z], lane.points[i - 1] as [number, number], lane.points[i] as [number, number]), `lamp ${x},${z} on ${lane.id}`).toBeGreaterThan(0.3);
    }
    // Each lamp's pool of light falls on the pavement.
    for (const [, z] of STREET_LAMPS) expect(z - LAMP.reach - LAMP.pool).toBeGreaterThan(STREET.z0 - LAMP.pool);
    // Two lamps stand either side of the ATM bays, so both are lit.
    const xs = ATM_STATIONS.map((id) => kioskCentre(id)[0]);
    expect(STREET_LAMPS.some(([x]) => x < Math.min(...xs))).toBe(true);
    expect(STREET_LAMPS.some(([x]) => x > Math.max(...xs))).toBe(true);
  });

  it('opens the front plinth wherever a lane leaves the building for the pavement, and keeps the rest as wall', () => {
    const { runs, doors } = frontPlinth();
    const out = LANES.filter((l) => l.points.some(([, z]) => z > FLOOR_SLAB.d / 2) && l.points.some(([, z]) => z < FLOOR_SLAB.d / 2));
    expect(out.length).toBeGreaterThan(0);
    expect(doors.length).toBeGreaterThan(0);
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      expect(run.axis).toBe('x');
      expect(run.at).toBe(FLOOR_SLAB.d / 2);
    }
  });
});

describe('plants and windows', () => {
  it('stands every plant on the slab, away from every desk, kiosk and lane', () => {
    expect(PLANTS.length).toBeGreaterThan(8);
    const boxes = footprints();
    for (const p of PLANTS) {
      expect(Math.abs(p.x), `${p.x},${p.z}`).toBeLessThan(FLOOR_SLAB.w / 2 - 0.2);
      expect(Math.abs(p.z), `${p.x},${p.z}`).toBeLessThan(FLOOR_SLAB.d / 2 - 0.2);
      for (const b of boxes) expect(p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1, `plant ${p.x},${p.z} in ${b.name}`).toBe(false);
      for (const lane of LANES) for (let i = 1; i < lane.points.length; i++) expect(distToSegment([p.x, p.z], lane.points[i - 1] as [number, number], lane.points[i] as [number, number]), `plant ${p.x},${p.z} on ${lane.id}`).toBeGreaterThan(0.35);
    }
  });

  it('keeps plants clear of one another', () => {
    for (let i = 0; i < PLANTS.length; i++)
      for (let j = i + 1; j < PLANTS.length; j++) {
        const a = PLANTS[i] as (typeof PLANTS)[number];
        const b = PLANTS[j] as (typeof PLANTS)[number];
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.9);
      }
  });

  it('spaces the windows along each wall so that they do not touch and stay on the wall', () => {
    for (const wall of ['back', 'right'] as const) {
      const at = WALL_WINDOWS.filter((w) => w.wall === wall).map((w) => w.at).sort((a, b) => a - b);
      expect(at.length).toBeGreaterThan(2);
      const half = (wall === 'back' ? FLOOR_SLAB.w : FLOOR_SLAB.d) / 2;
      for (const x of at) expect(Math.abs(x) + 1.15).toBeLessThan(half);
      for (let i = 1; i < at.length; i++) expect((at[i] as number) - (at[i - 1] as number)).toBeGreaterThan(2.4);
    }
  });
});

describe('people at work', () => {
  it('slumps staff only when they are more than 80 per cent spent', () => {
    expect(SLUMP_FATIGUE).toBe(80);
    expect(isSlumped(80)).toBe(false);
    expect(isSlumped(80.1)).toBe(true);
    expect(isSlumped(0)).toBe(false);
  });

  it('types lazily when idle, briskly when working, frantically in a surge, and barely at all when spent', () => {
    const idle = typingRate({ working: false, productivity: 1, surge: 0, fatigue: 10 });
    const working = typingRate({ working: true, productivity: 1, surge: 0, fatigue: 10 });
    const surging = typingRate({ working: true, productivity: 1, surge: 1, fatigue: 10 });
    const spent = typingRate({ working: true, productivity: 1, surge: 1, fatigue: 95 });
    expect(idle).toBeGreaterThan(spent);
    expect(working).toBeGreaterThan(idle * 2);
    expect(surging).toBeGreaterThan(working);
    expect(spent).toBeLessThan(idle);
    // A tired worker is slower at the same load.
    expect(typingRate({ working: true, productivity: 0.4, surge: 0, fatigue: 10 })).toBeLessThan(working);
    // Out-of-range inputs are held to their range.
    expect(typingRate({ working: true, productivity: 9, surge: 9, fatigue: 0 })).toBe(typingRate({ working: true, productivity: 1, surge: 1, fatigue: 0 }));
  });

  it('calls it a surge when the queue is long or a warning light is on', () => {
    expect(surgeLevel(0, 'IDLE')).toBe(0);
    expect(surgeLevel(0, 'BUSY')).toBe(0);
    expect(surgeLevel(6, 'BUSY')).toBeCloseTo(0.5, 9);
    expect(surgeLevel(40, 'BUSY')).toBe(1);
    expect(surgeLevel(0, 'CONGESTED')).toBeGreaterThan(0.5);
    expect(surgeLevel(0, 'ALERT')).toBeGreaterThan(surgeLevel(0, 'CONGESTED'));
    expect(surgeLevel(12, 'CONGESTED')).toBe(1);
  });
});

describe('the isometric camera', () => {
  it('looks down at the true isometric angle, from the front and the left', () => {
    const k = CAMERA_DISTANCE / Math.sqrt(CAMERA_DIRECTION[0] ** 2 + CAMERA_DIRECTION[1] ** 2 + 1);
    const [x, y, z] = [CAMERA_DIRECTION[0] * k, k, CAMERA_DIRECTION[1] * k];
    expect(Math.acos(y / Math.hypot(x, y, z))).toBeCloseTo(ISO_POLAR, 9);
    expect(Math.atan2(x, z)).toBeCloseTo(ISO_AZIMUTH, 9);
    expect(ISO_POLAR).toBeCloseTo(0.9553, 3);
    expect(ISO_AZIMUTH).toBeCloseTo(-Math.PI / 4, 9);
  });

  it('finds where the middle of the view meets the floor, however far the camera has been dragged', () => {
    const k = CAMERA_DISTANCE / Math.sqrt(3);
    expect(viewGround([-k, k, k], [0, 0, 0])).toEqual([0, 0]);
    // Slide the camera and its target together along the screen's up direction: the floor point moves.
    const up = [1 / Math.sqrt(6), Math.sqrt(2 / 3), -1 / Math.sqrt(6)] as const;
    const [gx, gz] = viewGround([-k + up[0] * 3, k + up[1] * 3, k + up[2] * 3], [up[0] * 3, up[1] * 3, up[2] * 3]);
    expect(Math.hypot(gx, gz)).toBeGreaterThan(3);
    // A target already on the floor is its own answer, and a level camera has nothing to intersect.
    expect(viewGround([-k + 2, k, k - 5], [2, 0, -5])).toEqual([2, -5]);
    expect(viewGround([0, 3, 0], [4, 3, 1])).toEqual([4, 1]);
  });
});
