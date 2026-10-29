import { afterEach, describe, expect, it } from 'vitest';
import { STATION_IDS, STATIONS, type StationId } from '../../../../sim/topology';
import { AUTOMATED_NODES, HUMAN_NODES } from '../../../../sim/nodeKind';
import { isNightStation } from '../../../../sim/roster';
import { createBankStore } from '../../../../store/bankStore';
import { SimulationEngine } from '../../../../engine/simulation/SimulationEngine';
import { isOnShift } from '../../../../engine/simulation/deskActivity';
import { arrivalMinute, ARRIVE_SPEED, arriveRoute, walkedFor } from '../../../../engine/simulation/staff';
import { deskPose, seatOffsets } from '../../../../engine/plan/layout3d';
import { pathLength } from '../../../../engine/plan/path';
import { CIT_YIELD, CitRun, LOADING_BAY } from '../../../../engine/world/citRun';
import { approachPath, citRoutes, departPath, ParkingLot } from '../../../../engine/world/parking';
import { LENGTH } from '../../../../engine/world/vehicles';
import { SIDEWALK, SidewalkCrowd } from '../../../../engine/world/sidewalk';
import { StaffWalks } from '../../../../engine/simulation/people';
import { LABEL_LOD, labelLodAt, lodShows } from '../labelLod';
import { buildSearchIndex, searchIndex } from '../../../../hooks/useSearchIndex';
import type { WorldEngine } from '../../../../engine/simulation/WorldEngine';

/** The worlds a test opened: put away after it, as the scene does, so nobody still walking to a line is waited for by the next. */
const opened: WorldEngine[] = [];
afterEach(() => {
  for (const w of opened.splice(0)) w.dispose();
});

/** A bank at `minute` (played beat by beat from 07:00), and a 3D world opened on it then. */
function bankAt(minute: number) {
  const store = createBankStore();
  store.setState({ playing: true });
  while (store.getState().view.minute < minute) store.getState().tickBeat();
  const world = new SimulationEngine(store).createWorld('clear');
  opened.push(world);
  return { store, world };
}

/** Plays on from where the bank is, `framesPerBeat` frames a beat, the world following as the scene does. */
function play(store: ReturnType<typeof createBankStore>, world: WorldEngine, beats: number, onFrame: () => void = () => {}, framesPerBeat = 72) {
  const stop = store.subscribe((s) => world.onBank(s.view));
  for (let b = 0; b < beats; b++) {
    store.getState().tickBeat();
    for (let f = 0; f < framesPerBeat; f++) {
      const s = store.getState();
      world.tick({ realDt: 1 / 30, playing: true, speed: 1, minute: s.view.minute, weather: 'clear', queueLength: (id) => s.view.stations[id].queueLength });
      onFrame();
    }
  }
  stop();
}

const PEOPLE_DESKS = STATION_IDS.filter((id) => !AUTOMATED_NODES.includes(id as (typeof AUTOMATED_NODES)[number]) && STATIONS[id].kind !== 'ATM');

describe('staff placed by the clock', () => {
  it('opened (or scrubbed) to 08:40, the day staff are part-way along their walk in, exactly as far as the clock says', () => {
    const { world } = bankAt(8 * 60 + 40);
    let walking = 0;
    for (const id of PEOPLE_DESKS) {
      if (isNightStation(id)) continue;
      const staff = world.staff(id);
      const seats = seatOffsets(STATIONS[id].staff);
      for (const w of staff.walks.filter((x) => x.arriving)) {
        walking++;
        const due = arrivalMinute(false, w.id, w.index);
        expect(w.t, `${id} ${w.id}`).toBeCloseTo(walkedFor(due, 8 * 60 + 40), 6);
        expect(w.t).toBeLessThan(pathLength(arriveRoute(deskPose(id), seats[w.index]!, w.index)) / ARRIVE_SPEED);
        // Their seat stays empty until they sit down.
        expect(staff.absent().has(w.id)).toBe(true);
      }
    }
    expect(walking).toBeGreaterThan(0);
  });

  it('has every day desk staffed and seated at 09:00, whether played through or opened then', () => {
    const { store, world } = bankAt(8 * 60 + 40);
    play(store, world, 4);
    expect(store.getState().view.minute).toBe(9 * 60);
    const opened = bankAt(9 * 60).world;
    for (const w of [world, opened])
      for (const id of PEOPLE_DESKS) {
        if (isNightStation(id)) continue;
        expect(w.staff(id).absent().size, id).toBe(0);
      }
  });

  it('at 22:45 has the night crew on their way in or sitting ready, and all of them seated at 23:00', () => {
    const { store, world } = bankAt(22 * 60 + 45);
    const night = PEOPLE_DESKS.filter(isNightStation);
    const coming = night.reduce((n, id) => n + world.staff(id).walks.filter((x) => x.arriving).length + world.staff(id).early.size, 0);
    expect(coming).toBeGreaterThan(0);
    play(store, world, 3);
    expect(store.getState().view.minute).toBe(23 * 60);
    for (const id of night) expect(world.staff(id).absent().size, id).toBe(0);
  });

  it('starts walks afresh when the clock jumps back, and never leaves anyone walking in after their shift has begun', () => {
    const walks = new StaffWalks('TELLER_CASH', false);
    const workers = createBankStore().getState().view.stations.TELLER_CASH.workers;
    walks.sync(workers, 8 * 60 + 40);
    const midway = walks.walks.filter((w) => w.arriving).length;
    walks.sync(workers, 10 * 60);
    expect(walks.walks.filter((w) => w.arriving)).toHaveLength(0);
    walks.sync(workers, 8 * 60 + 40);
    expect(walks.walks.filter((w) => w.arriving)).toHaveLength(midway);
  });
});

describe('the machines run round the clock, the branch keeps its hours', () => {
  it('keeps the gateways, ATMs, 3DS, fraud engine and ledger on shift at every hour, the counters only while the doors are open', () => {
    for (const phase of ['PRE_OPEN', 'WORKING', 'AFTER_HOURS', 'EOD'] as const) {
      for (const id of AUTOMATED_NODES) expect(isOnShift(id, phase), `${id} ${phase}`).toBe(true);
      expect(isOnShift('TELLER_CASH', phase)).toBe(phase === 'WORKING');
      expect(isOnShift('DISPUTE_DESK', phase)).toBe(phase === 'WORKING');
    }
    expect(isOnShift('RECON', 'EOD')).toBe(true);
    expect(isOnShift('RECON', 'WORKING')).toBe(false);
    expect(HUMAN_NODES).toContain('TELLER_CASH');
  });

  it('sends the branch staff home after 17:00 once their desk is clear, while the machines work on', () => {
    const { store } = bankAt(20 * 60);
    const v = store.getState().view;
    for (const id of ['TELLER_CASH', 'DISPUTE_DESK'] as const) {
      if (v.stations[id].queueLength > 0) continue;
      // Anyone still finishing a case from before closing finishes it first.
      for (const w of v.stations[id].workers) if (!w.working) expect(w.activity).toMatch(/^Off shift/);
    }
    // The machines processed cases after hours.
    const after = (['GATE_POS', 'GATE_ECOM', 'GATE_A2A', 'GATE_ATM'] as StationId[]).reduce((n, id) => n + v.stations[id].stats.processedToday, 0);
    const { store: atClose } = bankAt(17 * 60);
    const before = (['GATE_POS', 'GATE_ECOM', 'GATE_A2A', 'GATE_ATM'] as StationId[]).reduce((n, id) => n + atClose.getState().view.stations[id].stats.processedToday, 0);
    expect(after).toBeGreaterThan(before);
  });

  it('walks ATM customers up after hours: they key in at the machine, then walk away', () => {
    const { store, world } = bankAt(19 * 60);
    let walked = 0;
    let keyedIn = 0;
    play(store, world, 3, () => {
      walked = Math.max(walked, world.arrivals.walks.filter((w) => STATIONS[w.desk].kind === 'ATM').length);
      for (const id of ['GATE_ATM', 'ATM_CASH'] as const) for (const p of world.line(id).servedPoses.values()) if (p.busy) keyedIn++;
    }, 600);
    expect(walked).toBeGreaterThan(0);
    expect(keyedIn).toBeGreaterThan(0);
  });
});

describe('the car park never jams', () => {
  it('keeps vehicles coming and going all day: drivers stay a while, drive out, and are gone down the lane', () => {
    const lot = new ParkingLot();
    const seen = new Set(lot.vehicles.map((v) => v.id));
    const gone = new Set<string>();
    let readyFor = new Map<string, number>();
    let longestWait = 0;
    for (let i = 0; i < 20 * 600; i++) {
      lot.step(1 / 20);
      for (const v of lot.vehicles) seen.add(v.id);
      for (const d of lot.departing) gone.add(d.id);
      const next = new Map<string, number>();
      for (const v of lot.vehicles) if (v.phase === 'ready') next.set(v.id, (readyFor.get(v.id) ?? 0) + 1 / 20);
      readyFor = next;
      for (const t of next.values()) longestWait = Math.max(longestWait, t);
      // One vehicle at a time in the lot itself, however many are on the lane.
      expect(lot.vehicles.filter((v) => v.phase === 'arriving' || v.phase === 'leaving').length).toBeLessThanOrEqual(1);
      expect(lot.vehicles.filter((v) => v.phase === 'approaching').length).toBeLessThanOrEqual(1);
    }
    expect(gone.size).toBeGreaterThan(25);
    // Nobody back at their car waits long for the lot's turn.
    expect(longestWait).toBeLessThan(45);
    // The cash van got its turns too.
    expect(lot.cit.runs).toBeGreaterThan(2);
  });

  it('empties at closing time, and starts empty when the office is opened after hours', () => {
    const lot = new ParkingLot();
    lot.setClosed(true);
    for (let i = 0; i < 20 * 900 && (lot.vehicles.length > 0 || lot.departing.length > 0); i++) lot.step(1 / 20);
    expect(lot.vehicles).toHaveLength(0);
    expect(lot.departing).toHaveLength(0);
    expect(bankAt(20 * 60).world.lot.vehicles).toHaveLength(0);
  });

  it('drives the lane traffic along the lane, keeping the lot to its own', () => {
    expect(pathLength(approachPath())).toBeGreaterThan(20);
    expect(pathLength(departPath())).toBeGreaterThan(20);
    const lot = new ParkingLot();
    for (let i = 0; i < 20 * 120; i++) {
      lot.step(1 / 20);
      for (const p of lot.lanePoses()) expect(Math.abs(p.x)).toBeGreaterThan(9);
    }
  });
});

describe('the cash van gives way to people on foot', () => {
  it('stops for someone in front of it and drives on once they are clear; those beside it wait for it to pass', () => {
    const run = new CitRun(citRoutes());
    while (run.phase !== 'arrive') run.step(0.1, true);
    for (let i = 0; i < 40; i++) run.step(0.1, true);
    const pose = run.pose();
    const back = pose.reversing ? -1 : 1;
    const fx = Math.cos(pose.yaw) * back;
    const fz = -Math.sin(pose.yaw) * back;
    const ahead: [number, number] = [pose.x + fx * (LENGTH.cit / 2 + 1), pose.z + fz * (LENGTH.cit / 2 + 1)];
    const beside: [number, number] = [pose.x - fz * (CIT_YIELD.half + 0.6), pose.z + fx * (CIT_YIELD.half + 0.6)];
    expect(run.inPath(ahead)).toBe(true);
    expect(run.makesWait(ahead)).toBe(false);
    expect(run.inPath(beside)).toBe(false);
    expect(run.makesWait(beside)).toBe(true);
    const t = run.t;
    for (let i = 0; i < 30; i++) run.step(0.1, true, [ahead]);
    expect(run.go).toBe(0);
    const held = run.t;
    for (let i = 0; i < 10; i++) run.step(0.1, true, [ahead]);
    expect(run.t).toBe(held);
    expect(held).toBeGreaterThan(t);
    for (let i = 0; i < 30; i++) run.step(0.1, true);
    expect(run.go).toBeGreaterThan(0.9);
    expect(run.t).toBeGreaterThan(held);
    // Parked in its bay, nobody waits for it.
    while ((run.phase as string) !== 'load') run.step(0.1, true);
    expect(run.makesWait([LOADING_BAY.x, LOADING_BAY.z + 1])).toBe(false);
  });
});

describe('the pavement', () => {
  it('steers passers-by round staff walking to work, not through them', () => {
    const crowd = new SidewalkCrowd();
    const walks = new StaffWalks('TELLER_CASH', false, crowd);
    const workers = createBankStore().getState().view.stations.TELLER_CASH.workers;
    let seen = 0;
    for (let m = 8 * 60 + 15; m <= 8 * 60 + 45; m += 0.5) {
      walks.sync(workers, m);
      walks.step(0.24);
      // Everyone walking along the pavement is one of the crowd the passers-by step round; once inside, they are not.
      const onPavement = walks.walks.filter((w) => {
        const z = walks.poseOf(w).at[1];
        return z >= SIDEWALK.z0 - 0.05 && z <= SIDEWALK.z1 + 0.05;
      }).length;
      expect(crowd.size).toBe(onPavement);
      seen = Math.max(seen, onPavement);
    }
    expect(seen).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) walks.step(0.1);
    expect(walks.walks).toHaveLength(0);
    expect(crowd.size).toBe(0);
  });
});

describe('labels by zoom', () => {
  it('folds badges to a dot and count zoomed out, names them in between, says everything close up', () => {
    expect(labelLodAt(LABEL_LOD.mid - 1)).toBe('far');
    expect(labelLodAt(100)).toBe('mid');
    expect(labelLodAt(LABEL_LOD.near)).toBe('near');
    expect(lodShows('far')).toEqual({ name: false, working: false, tally: false });
    expect(lodShows('mid')).toEqual({ name: true, working: false, tally: true });
    expect(lodShows('near')).toEqual({ name: true, working: true, tally: true });
  });
});

describe('the cash van in the search', () => {
  it('finds it by CIT, Cash-in-Transit and its Vietnamese name, and shows the desk it brings cash to', () => {
    for (const [locale, q] of [['en', 'CIT'], ['en', 'cash-in-transit'], ['en', 'cash in transit'], ['vi', 'xe chở tiền'], ['vi', 'CIT']] as const) {
      const r = searchIndex(buildSearchIndex('expert', locale), q);
      const hit = r.groups.station.find((e) => e.id === 'station:CIT_VAN');
      expect(hit, `${locale} ${q}`).toBeDefined();
      expect(hit!.action).toEqual({ kind: 'place', place: 'TELLER_CASH' });
    }
    expect(buildSearchIndex('expert', 'en').find((e) => e.id === 'station:CIT_VAN')!.label).toBe('Cash Transporter (CIT)');
    expect(buildSearchIndex('expert', 'vi').find((e) => e.id === 'station:CIT_VAN')!.label).toBe('Xe chở tiền (CIT)');
  });
});
