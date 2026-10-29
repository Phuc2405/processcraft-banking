import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { beatMinutesAt, beatMs, DAY_START, EOD_START, isPreShift } from '../../../../sim/clock';
import { STATION_IDS, STATIONS } from '../../../../sim/topology';
import { isAutomatedNode } from '../../../../sim/nodeKind';
import { isNightStation } from '../../../../sim/roster';
import { atmosphereAt } from '../atmosphere';
import { ARRIVE_SPEED, arriveRoute, arrivalMinute, STAFF_ARRIVAL } from '../focus3d';
import { deskPose, seatOffsets } from '../layout3d';
import { exitRoute, PARK_MEMBERS, wantsPark } from '../parkLife';
import { PARK_BENCHES, PARK_LAMPS, PICNIC } from '../parkPlan';
import { QueueHandoff } from '../queueHandoff';
import { pathLength, pointAlongPath } from '../tour3d';
import { BUS_STOP, OVERHANG, PAVEMENT, underCover } from '../weather';

const read = (rel: string): string => readFileSync(join(__dirname, rel), 'utf8');

describe('the hours before a shift tick by, never jumping', () => {
  it('starts the day at 07:00 and runs 07:00-08:00 and 22:00-23:00 in short beats', () => {
    expect(DAY_START).toBe(7 * 60);
    for (let m = 7 * 60; m < 8 * 60; m += 5) expect(beatMinutesAt(m)).toBe(5);
    for (let m = 22 * 60; m < EOD_START; m += 5) expect(beatMinutesAt(m)).toBe(5);
    expect(isPreShift(8 * 60)).toBe(false);
    expect(isPreShift(21 * 60)).toBe(false);
    // Slower to watch than an ordinary quiet-hour beat.
    expect(beatMs('PRE_OPEN', 1, 7 * 60)).toBeGreaterThan(beatMs('PRE_OPEN', 1, 8 * 60));
  });

  it('gets every member of staff walking in seated before their shift starts, at the real pace the clock runs', () => {
    // Real seconds (at 1x) from the window opening to `minute`, at the pre-shift beat.
    const secondsTo = (from: number, minute: number): number => ((minute - from) / 5) * (beatMs('PRE_OPEN', 1, from) / 1000);
    for (const id of STATION_IDS) {
      if (isAutomatedNode(id) || STATIONS[id].kind === 'ATM') continue;
      const night = isNightStation(id);
      const [from] = night ? STAFF_ARRIVAL.night : STAFF_ARRIVAL.day;
      const start = night ? EOD_START : DAY_START + 60;
      const seats = seatOffsets(STATIONS[id].staff);
      seats.forEach((seat, k) => {
        const due = arrivalMinute(night, `${id}-${k}`, k);
        const walk = pathLength(arriveRoute(deskPose(id), seat, k)) / ARRIVE_SPEED;
        expect(secondsTo(from, due) + walk, `${id} #${k}`).toBeLessThan(secondsTo(from, start));
      });
    }
    expect(ARRIVE_SPEED).toBeGreaterThan(2);
  });
});

describe('customers are handed from their walk to the line, never shown twice or vanishing', () => {
  it('keeps their place empty while they walk, then hands them over where they stopped, with their look', () => {
    const h = new QueueHandoff();
    h.expect('GATE_ATM');
    h.expect('GATE_ATM');
    expect(h.pending('GATE_ATM')).toBe(2);
    h.arrive('GATE_ATM', [1, 2], 10, 42);
    expect(h.pending('GATE_ATM')).toBe(1);
    expect(h.take('GATE_ATM', 10.5)).toEqual({ at: [1, 2], when: 10, who: 42 });
    expect(h.take('GATE_ATM', 10.5)).toBeUndefined();
    // Never taken up (the line closed meanwhile): forgotten.
    h.arrive('GATE_ATM', [3, 4], 10, 7);
    expect(h.take('GATE_ATM', 20)).toBeUndefined();
    h.drop('ATM_CASH');
    expect(h.pending('ATM_CASH')).toBe(0);
  });

  it('wires the walkers and the desks together', () => {
    const traffic = read('../Traffic.tsx');
    expect(traffic).toContain('queueHandoff.expect(id);');
    expect(traffic).toContain('const who = sv.stats.processedToday + place + queueSalt(id);');
    expect(traffic).toContain('queueHandoff.arrive(w.desk, w.path[w.path.length - 1]!, motion.t, w.who)');
    const desk = read('../Desk3D.tsx');
    expect(desk).toContain("const standing = style === 'people' ? Math.max(0, shown - queueHandoff.pending(id)) : shown;");
    // Someone who arrives after their turn came walks up, does their business, and leaves.
    expect(desk).toContain('wait: atm ? SERVED.business.atm : SERVED.business.counter, stopAt });');
  });
});

describe('umbrellas come down under cover', () => {
  it('knows the bus stop, the entrance overhang and the guard cabin as cover, and the open pavement as not', () => {
    expect(underCover((BUS_STOP.x0 + BUS_STOP.x1) / 2, (BUS_STOP.z0 + BUS_STOP.z1) / 2)).toBe(true);
    expect(underCover((OVERHANG.x0 + OVERHANG.x1) / 2, (OVERHANG.z0 + OVERHANG.z1) / 2)).toBe(true);
    expect(underCover(0, PAVEMENT.lanes[0])).toBe(false);
    // The walking lanes run under the bus stop: people pass beneath it, umbrella down, and up again past it.
    expect(underCover((BUS_STOP.x0 + BUS_STOP.x1) / 2, PAVEMENT.lanes[1])).toBe(true);
  });

  it('lowers them on the street and in the park, under the picnic umbrella too', () => {
    expect(read('../Environment3D.tsx')).toContain('const want = underCover(x, z) ? 0 : Math.max(s.umbrella, out);');
    const park = read('../Park3D.tsx');
    expect(park).toContain('PICNIC_ROOF');
    for (const m of PARK_MEMBERS.filter((x) => x.role === 'picnic')) expect(Math.hypot(m.at[0] - PICNIC.x, m.at[1] - PICNIC.z)).toBeLessThan(1.05);
  });
});

describe('the park after dark', () => {
  it('lights its lamps at dusk, through the night and at dawn, and not by day', async () => {
    const { parkLampGlow } = await import('../Park3D');
    expect(parkLampGlow(atmosphereAt(12 * 60).lamps)).toBe(0);
    expect(parkLampGlow(atmosphereAt(21 * 60).lamps)).toBe(1);
    expect(parkLampGlow(atmosphereAt(7 * 60).lamps)).toBeGreaterThan(0.5);
    expect(parkLampGlow(atmosphereAt(18 * 60).lamps)).toBeGreaterThan(0);
  });

  it('puts a lamp by every bench, and none on anyone’s way out', () => {
    for (const b of PARK_BENCHES) expect(Math.min(...PARK_LAMPS.map(([x, z]) => Math.hypot(x - b.at[0], z - b.at[1])))).toBeLessThan(2);
    for (const m of PARK_MEMBERS) {
      const route = exitRoute(m);
      const len = pathLength(route);
      for (let d = 0; d < len; d += 0.1) {
        const [x, z] = pointAlongPath(route, d);
        for (const [lx, lz] of PARK_LAMPS) expect(Math.hypot(x - lx, z - lz), m.id).toBeGreaterThan(0.25);
      }
    }
  });

  it('keeps people on the benches into the night', () => {
    const benches = PARK_MEMBERS.filter((m) => m.role === 'bench');
    expect(benches.filter((m) => wantsPark(m, 22.5 * 60)).length).toBeGreaterThan(4);
    expect(benches.some((m) => wantsPark(m, 23.75 * 60))).toBe(false);
  });
});

describe('a drop-off held up in traffic keeps its passenger’s stop', () => {
  it('looks again for a spot rather than giving up when the kerb lane fills', () => {
    expect(read('../vehicles.ts')).toMatch(/if \(dropping && this\.dropOff\.keepsIntent\(c\)\) \{[\s\S]*?c\.spot = null;/);
    expect(read('../vehicles.ts')).toMatch(/keepsIntent\(c: Driving\): boolean \{\s*return c\.speed < HALTED;/);
  });
});
