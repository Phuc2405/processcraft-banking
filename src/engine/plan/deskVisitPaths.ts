import type { Pt, VisitDesk, VisitGeometry } from '../../sim/deskVisit';
import { PLACE_BOX as STAGE_BOX, CARD } from './layout';
import { carParkApproach, COUNTER, CUSTOMER_DOOR, deskPose, FLOOR_SLAB, FRONT_AISLE_Z, LEFT_WALK_X, MAIN_GATE, QUEUE_GAP, queueSlots, QUEUE_VISIBLE, SIDE_DOORS_RIGHT, streetEnd, WALKWAY_Z } from './layout3d';
import { LOOP } from '../world/parkPlan';
import { PARK_EXIT } from '../world/parkLife';

/** The walking routes of a desk visit (sim/deskVisit.ts): the same queue and the same people, in the 2D stage's pixels and on the 3D floor. */

// 3D: everyone walks in from the far end of the street (savings and vault via the right park's side door, appraisal via the left car park,
// counter cases via the main gate). 2.2 m/s outside gets a demo case to the counter soon after the button is pressed.

const SIDE_DOOR_Z = SIDE_DOORS_RIGHT[2]!;
const OUTSIDE: Pt = [FLOOR_SLAB.w / 2 + 1.2, SIDE_DOOR_Z];
/** From the street's right end, in at the park's gate, up its loop path to the side door. */
const PARK_IN: readonly Pt[] = [...[...PARK_EXIT].reverse(), [LOOP.x0, LOOP.z1], [LOOP.x0, SIDE_DOOR_Z], OUTSIDE];
const PARK_OUT: readonly Pt[] = [...PARK_IN].reverse();
const VISIT_SPEED_3D = 2.2;

function geometry3d(desk: VisitDesk): VisitGeometry {
  const pose = deskPose(desk);
  const slots = queueSlots(desk, QUEUE_VISIBLE);
  const lane = pose.x + COUNTER.w / 2 + 0.75;
  const door: Pt = [lane, SIDE_DOOR_Z];
  const slot = (place: number): Pt => slots[Math.min(place, slots.length - 1)]!;
  const spot: Pt = [pose.x + COUNTER.w / 2 + 0.35, pose.z];
  return {
    speed: VISIT_SPEED_3D,
    slot,
    walkIn: (place) => [...PARK_IN, door, [lane, slot(place)[1]], slot(place)],
    walkOut: [slot(0), [lane, slot(0)[1]], door, ...PARK_OUT],
    // The officer gets up from the back office behind the counter and comes round its end: staff never come in from the street.
    officerIn: [[pose.x, pose.z - COUNTER.d / 2 - 0.9], [lane, pose.z - COUNTER.d / 2 - 0.9], [lane, pose.z], spot],
  };
}

/**
 * The Pay-in-4 appraisal counter (BNPL) is on the left of the hall: its applicants come in at the customers' side door in the left
 * wall, down the clear strip inside it, and along a lane in front of the counter's short line (short of the eKYC desk's chairs below).
 */
function appraisal3d(): VisitGeometry {
  const pose = deskPose('BNPL');
  const slots = queueSlots('BNPL', 3);
  const slot = (place: number): Pt => slots[Math.min(place, slots.length - 1)]!;
  const laneZ = slot(2)[1] + 0.4;
  const outside = carParkApproach(CUSTOMER_DOOR, 0);
  const strip = (z: number): Pt => [LEFT_WALK_X, z];
  const spot: Pt = [pose.x - COUNTER.w / 2 - 0.35, pose.z];
  return {
    speed: VISIT_SPEED_3D,
    slot,
    walkIn: (place) => [...outside, CUSTOMER_DOOR, strip(CUSTOMER_DOOR[1]), strip(laneZ), [slot(place)[0], laneZ], slot(place)],
    walkOut: [slot(0), [slot(0)[0] - 0.6, slot(0)[1]], [slot(0)[0] - 0.6, laneZ], strip(laneZ), strip(CUSTOMER_DOOR[1]), CUSTOMER_DOOR, ...[...outside].reverse()],
    // The credit officer gets up from behind the counter and comes round its end.
    officerIn: [[pose.x, pose.z - COUNTER.d / 2 - 0.9], [spot[0], pose.z - COUNTER.d / 2 - 0.9], spot],
  };
}

/**
 * The teller's cash counter and the disputes desk, at the front of the hall: their own seated staff serve all day, and their ambient
 * line stands at the left half of the counter. The demo's case customer comes in at the main gate, along the front aisle, and up to
 * the counter's right-hand case window, so they never stand in (or walk through) the line already there.
 */
function caseWindow3d(desk: 'TELLER_CASH' | 'DISPUTE_DESK'): VisitGeometry {
  const pose = deskPose(desk);
  const x = pose.x + 0.9;
  const z0 = pose.z + COUNTER.d / 2 + 0.42;
  const slot = (place: number): Pt => [x, z0 + Math.min(place, QUEUE_VISIBLE - 1) * QUEUE_GAP];
  const from = streetEnd(-1);
  const outside: Pt = [MAIN_GATE.x, FLOOR_SLAB.d / 2 + 1.0];
  const gate: Pt = [MAIN_GATE.x, FRONT_AISLE_Z];
  const aisle: Pt = [x, FRONT_AISLE_Z];
  const away: Pt = [x + 0.45, FRONT_AISLE_Z];
  const to = streetEnd(1);
  return {
    speed: VISIT_SPEED_3D,
    slot,
    walkIn: (place) => [from, [MAIN_GATE.x, from[1]], outside, gate, aisle, slot(place)],
    walkOut: [slot(0), [away[0], slot(0)[1]], away, [MAIN_GATE.x + 0.45, FRONT_AISLE_Z], [MAIN_GATE.x + 0.45, outside[1]], [MAIN_GATE.x + 0.45, WALKWAY_Z + 0.25], to],
    // Unused (their staff are seated), but a valid path: from the gate to the case window's side.
    officerIn: [outside, gate, aisle, [x + 0.4, z0]],
  };
}

export const VISIT_3D: Readonly<Record<VisitDesk, VisitGeometry>> = {
  TELLER_CASH: caseWindow3d('TELLER_CASH'),
  DISPUTE_DESK: caseWindow3d('DISPUTE_DESK'),
  SAVINGS_DESK: geometry3d('SAVINGS_DESK'),
  COLLATERAL_VAULT: geometry3d('COLLATERAL_VAULT'),
  BNPL: appraisal3d(),
};

// 2D: up the free column left of the Savings department from the bottom of the stage. The vault's line stands under its card and the savings desk's in the gap under its own, left of the wire between them.

const STAGE_COLUMN_X = 1322;
const STAGE_BOTTOM = 1000;
const FIGURE_GAP = 26;

function geometry2d(desk: VisitDesk): VisitGeometry {
  const box = STAGE_BOX[desk];
  const savings = desk === 'SAVINGS_DESK';
  // Under the card, the head of the line nearest the wire and the tail towards the column.
  const y = box.cy + CARD.h / 2 + (savings ? 24 : 26);
  const headX = box.cx + (savings ? -22 : 20);
  const slot = (place: number): Pt => [headX - Math.min(place, QUEUE_VISIBLE - 1) * FIGURE_GAP, y];
  const spot: Pt = [box.cx - CARD.w / 2 - 12, box.cy];
  return {
    speed: 120,
    slot,
    walkIn: (place) => [[STAGE_COLUMN_X, STAGE_BOTTOM], [STAGE_COLUMN_X, y], slot(place)],
    // Out along a lane just below the line, so nobody walks back through those still waiting.
    walkOut: [slot(0), [headX, y + 16], [STAGE_COLUMN_X, y + 16], [STAGE_COLUMN_X, STAGE_BOTTOM]],
    officerIn: [[STAGE_COLUMN_X, STAGE_BOTTOM], [STAGE_COLUMN_X, box.cy], spot],
  };
}

/** 2D: the appraisal counter's applicants come up the free gap between the Back Office and the Entrance departments, and line up under the BNPL card. */
const APPRAISAL_COLUMN_X = 199;

function appraisal2d(): VisitGeometry {
  const box = STAGE_BOX.BNPL;
  const y = box.cy + CARD.h / 2 + 18;
  const headX = box.cx + 20;
  const slot = (place: number): Pt => [headX - Math.min(place, QUEUE_VISIBLE - 1) * FIGURE_GAP, y];
  return {
    speed: 120,
    slot,
    walkIn: (place) => [[APPRAISAL_COLUMN_X, STAGE_BOTTOM], [APPRAISAL_COLUMN_X, y], slot(place)],
    walkOut: [slot(0), [headX, y + 14], [APPRAISAL_COLUMN_X, y + 14], [APPRAISAL_COLUMN_X, STAGE_BOTTOM]],
    officerIn: [[APPRAISAL_COLUMN_X, STAGE_BOTTOM], [APPRAISAL_COLUMN_X, box.cy], [box.cx - CARD.w / 2 + 6, box.cy]],
  };
}

/** 2D: the teller and the disputes desk sit on the bottom row; their case customer comes up from the bottom of the stage to under the card. */
function caseWindow2d(desk: 'TELLER_CASH' | 'DISPUTE_DESK'): VisitGeometry {
  const box = STAGE_BOX[desk];
  const y = box.cy + CARD.h / 2 + 22;
  const headX = box.cx + 30;
  const entryX = box.cx + CARD.w / 2 + 10;
  const slot = (place: number): Pt => [headX + Math.min(place, QUEUE_VISIBLE - 1) * FIGURE_GAP, y];
  return {
    speed: 100,
    slot,
    walkIn: (place) => [[entryX, STAGE_BOTTOM], [entryX, y], slot(place)],
    walkOut: [slot(0), [headX, y + 16], [entryX, y + 16], [entryX, STAGE_BOTTOM]],
    officerIn: [[entryX, STAGE_BOTTOM], [entryX, box.cy], [box.cx + CARD.w / 2 - 6, box.cy]],
  };
}

export const VISIT_2D: Readonly<Record<VisitDesk, VisitGeometry>> = {
  TELLER_CASH: caseWindow2d('TELLER_CASH'),
  DISPUTE_DESK: caseWindow2d('DISPUTE_DESK'),
  SAVINGS_DESK: geometry2d('SAVINGS_DESK'),
  COLLATERAL_VAULT: geometry2d('COLLATERAL_VAULT'),
  BNPL: appraisal2d(),
};

/**
 * 2D: where the simulation's own line stands under a walk-up counter's card (sim/deskCrowd.ts), place 0 at the counter. It runs to
 * the left of the card's centre, clear of the demo's case customer, who lines up to the right (caseWindow2d).
 */
export function crowdSlot2d(id: keyof typeof STAGE_BOX, place: number): Pt {
  const box = STAGE_BOX[id];
  return [box.cx - 30 - place * FIGURE_GAP, box.cy + CARD.h / 2 + 22];
}
/** 2D: how far below its slot a figure appears from, and walks off to. */
export const CROWD_APPROACH = 46;
