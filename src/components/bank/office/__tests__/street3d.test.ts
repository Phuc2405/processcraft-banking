import { describe, expect, it } from 'vitest';
import { CLEAR, WEATHER_MIX } from '../atmosphere';
import { INDOORS, indoors } from '../Environment3D';
import { FLOOR_SLAB, KERB_Z, ROAD_END, STREET } from '../layout3d';
import { PARK, SITTERS } from '../Park3D';
import { cloudCover, cloudDark, CLOUDS, cloudsFor, sunPlace } from '../Sky3D';
import { ALIGHT, LANE_Z, lapOf, riderAt, ROAD, taxiAction, TRAFFIC_SPAN, VEHICLES, vehicleAt, type Vehicle } from '../vehicles';

const src = import.meta.glob(['../Environment3D.tsx', '../Office3D.tsx', '../Vehicles3D.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** The time in a vehicle's first lap when it has stood at its stop for `s` seconds. */
function whenStopped(v: Vehicle, s: number): number {
  for (let t = 0; t < lapOf(v) * 2; t += 0.01) {
    const st = vehicleAt(v, t);
    // From the start of a stop, not partway into one already under way at time 0.
    if (st.stoppedFor !== null && st.stoppedFor >= s && st.stoppedFor < s + 0.02) return t;
  }
  throw new Error(`${v.id} never stops`);
}

describe('the two-lane avenue and its traffic', () => {
  it('is a two-lane road, a lane each way, wide enough for a car beside a car', () => {
    expect(ROAD_END - KERB_Z).toBeGreaterThanOrEqual(5);
    expect(LANE_Z.near).toBeGreaterThan(ROAD.z0 + 0.8);
    expect(LANE_Z.far).toBeLessThan(ROAD.z1 - 0.8);
    expect(LANE_Z.far - LANE_Z.near).toBeGreaterThan(2);
  });

  it('runs motorbikes (some carrying two), cars, green taxis and the armoured cash van', () => {
    const kinds = new Set(VEHICLES.map((v) => v.kind));
    for (const k of ['motorbike', 'sedan', 'taxi', 'cit'] as const) expect(kinds.has(k), k).toBe(true);
    expect(VEHICLES.some((v) => v.kind === 'motorbike' && v.pillion)).toBe(true);
    expect(VEHICLES.filter((v) => v.kind === 'taxi').every((v) => v.color === '#16a34a')).toBe(true);
    // Traffic keeps to the right: the near lane runs towards -x, the far lane towards +x; only the near lane stops.
    for (const v of VEHICLES) {
      const a = vehicleAt(v, 1);
      const b = vehicleAt(v, 1.5);
      if (a.cycle === b.cycle && a.stoppedFor === null && b.stoppedFor === null) expect(Math.sign(b.x - a.x), v.id).toBe(v.lane === 'near' ? -1 : 1);
      if (v.stop) expect(v.lane).toBe('near');
    }
    // One speed to a lane, so nobody drives through anybody.
    for (const lane of ['near', 'far'] as const) expect(new Set(VEHICLES.filter((v) => v.lane === lane).map((v) => v.speed)).size).toBe(1);
  });

  it('brakes to the kerb, stands, and pulls away without a jump', () => {
    for (const v of VEHICLES.filter((x) => x.stop)) {
      const t = whenStopped(v, 0.5);
      const s = vehicleAt(v, t);
      expect(s.x).toBeCloseTo(v.stop!.x, 5);
      expect(s.pull).toBe(1);
      expect(s.z).toBeLessThan(LANE_Z.near);
      for (let k = 0; k < lapOf(v) * 10; k++) {
        const a = vehicleAt(v, k / 10);
        const b = vehicleAt(v, k / 10 + 0.01);
        if (a.cycle === b.cycle) expect(Math.abs(b.x - a.x), `${v.id} @${k / 10}`).toBeLessThan(0.1);
      }
      expect(Math.abs(vehicleAt(v, 0).x)).toBeLessThanOrEqual(TRAFFIC_SPAN.x1);
    }
  });

  it('lets a pillion passenger off at the kerb to walk to the lobby while the rider rides on', () => {
    const bike = VEHICLES.find((v) => v.stop?.kind === 'pillion')!;
    const t = whenStopped(bike, 0);
    expect(riderAt(bike, t + ALIGHT.door - 0.05)).toBeNull();
    const off = riderAt(bike, t + ALIGHT.door + 0.3)!;
    expect(off.action).toBe('alight');
    expect(off.walking).toBe(true);
    // Later they are on the pavement, walking towards the building, while the motorbike has gone on.
    const later = riderAt(bike, t + bike.stop!.wait + 4)!;
    expect(later.z).toBeLessThan(KERB_Z);
    expect(later.z).toBeGreaterThan(STREET.z0);
    expect(vehicleAt(bike, t + bike.stop!.wait + 4).stoppedFor).toBeNull();
  });

  it('has the taxi drop someone off on one lap and pick someone up on the next', () => {
    expect(taxiAction(0)).toBe('alight');
    expect(taxiAction(1)).toBe('board');
    const taxi = VEHICLES.find((v) => v.stop?.kind === 'taxi')!;
    const lap = lapOf(taxi);
    const first = whenStopped(taxi, 1.2);
    const second = first + lap;
    const a = riderAt(taxi, first);
    const b = riderAt(taxi, second);
    expect(vehicleAt(taxi, first).cycle % 2 === 0 ? a?.action : b?.action).toBe('alight');
    // The rider who boards waits at the kerb as the taxi comes in.
    const boardLap = vehicleAt(taxi, first).cycle % 2 === 1 ? first : second;
    const waiting = riderAt(taxi, boardLap - 1.2 - 2);
    expect(waiting?.action).toBe('board');
    expect(waiting?.walking).toBe(false);
  });

  it('sends the cash van’s guard with a cash box to the ATMs and back while the van waits', () => {
    const van = VEHICLES.find((v) => v.kind === 'cit')!;
    const t = whenStopped(van, 0);
    const going = riderAt(van, t + ALIGHT.door + 0.5)!;
    expect(going.action).toBe('guard');
    expect(going.carrying).toBe(true);
    const at = riderAt(van, t + van.stop!.wait / 2)!;
    expect(at.walking).toBe(false);
    expect(at.z).toBeLessThan(KERB_Z);
    expect(riderAt(van, t + van.stop!.wait + 1)).toBeNull();
  });

  it('puts riders in raincoats only when it rains', () => {
    const scene = src['../Vehicles3D.tsx']!;
    expect(scene).toContain("const rain = outfit === 'rain';");
    expect(scene).toContain('Áo mưa');
  });
});

describe('the sky over the diorama', () => {
  it('fills with darker clouds as the weather closes in', () => {
    expect(cloudCover(CLEAR)).toBeLessThan(cloudCover(WEATHER_MIX.cloudy));
    expect(cloudCover(WEATHER_MIX.storm)).toBe(1);
    expect(cloudsFor(cloudCover(CLEAR))).toBeLessThan(cloudsFor(1));
    expect(cloudsFor(1)).toBe(CLOUDS);
    expect(cloudDark(WEATHER_MIX.storm)).toBeGreaterThan(cloudDark(WEATHER_MIX.cloudy));
    expect(cloudDark(CLEAR)).toBe(0);
  });

  it('moves the sun across the top of the view through the day, highest at midday', () => {
    const [morning, noon, evening] = [8.5, 13, 18.5].map((h) => sunPlace(h * 60));
    expect(morning!.x).toBeLessThan(noon!.x);
    expect(noon!.x).toBeLessThan(evening!.x);
    expect(evening!.x).toBeGreaterThan(0.5);
    expect(noon!.y).toBeGreaterThan(morning!.y);
    for (const p of [morning, noon, evening]) expect(p!.y).toBeGreaterThan(0.6);
  });
});

describe('the weather stays outside the branch', () => {
  it('knows the branch’s footprint, and clips rain, snow and haze to the outside', () => {
    expect(indoors(0, 0)).toBe(true);
    expect(indoors(INDOORS.x1 + 1, 0)).toBe(false);
    expect(indoors(0, KERB_Z + 1)).toBe(false);
    const env = src['../Environment3D.tsx']!;
    expect(env).toContain('if (indoors(x, a[o + 2]!))');
    expect(env).toContain('if (indoors(at[0], at[2])) at[1] = UNDER;');
    expect(env).toContain('fog.near = Math.max(a.fog.near, deepest + HAZE_CLEARANCE);');
  });
});

describe('the parks beside the branch', () => {
  it('lay lawns, a cobbled walk and benches between the branch and the next block, clear of the office', () => {
    expect(PARK.x0).toBeGreaterThan(FLOOR_SLAB.w / 2);
    expect(PARK.walk.x0).toBeGreaterThan(PARK.x0);
    expect(PARK.walk.x1).toBeLessThan(PARK.bench.x);
    expect(PARK.bench.x + 0.3).toBeLessThan(PARK.x1);
    for (const z of PARK.bench.zs) {
      expect(z - PARK.bench.len / 2).toBeGreaterThan(PARK.z0);
      expect(z + PARK.bench.len / 2).toBeLessThan(PARK.z1);
      expect(Math.abs(z) - PARK.bench.len / 2).toBeGreaterThan(PARK.cross.z1);
    }
    expect(SITTERS.filter((s) => s.talking).length).toBe(2);
  });

  it('draws speech bubbles over people talking instead of the old black dots', () => {
    const env = src['../Environment3D.tsx']!;
    expect(env).toContain("<Bubble kind={p.index % 4 === 0 ? 'speech' : 'thought'}");
    expect(env).not.toMatch(/pose === 'chat' && \(\s*\/\/[^\n]*\n\s*<mesh/);
  });
});

describe('the 3D toolbar', () => {
  it('keeps Reset view, Labels, the time and the weather in one row in the top-left corner, whatever panel is open', () => {
    const office = src['../Office3D.tsx']!;
    expect(office).toContain("export const TOOLBAR_CLASS = 'absolute left-4 top-3 z-40 flex flex-row flex-nowrap items-center gap-1.5';");
    expect(office).not.toContain("top-[108px]");
    expect(office).toContain('<WeatherControls compact={splitOpen} />');
  });
});
