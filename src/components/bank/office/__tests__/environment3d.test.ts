import { describe, expect, it } from 'vitest';
import { VI_DICTIONARY } from '../../../../i18n/viDictionary';
import { STATION_IDS, WIRES } from '../../../../sim/topology';
import { routingRules } from '../../routingRules';
import { flowPlaces, flowScope } from '../../../../sim/guidedFlows';
import { FLOW_IDS } from '../../../../types/viewport';
import { badgeFocus, deskFocus, DIM, isOffShift, LANE_DIM, leaveAt, leaveRoute, litLanes, neighbours, PULSE, pulseDistance } from '../focus3d';
import { atmosphereAt, CLEAR, DAY_KEYS, gustOf, nextRandomWeather, RANDOM_EVERY_S, sameMix, stepMix, WEATHER_BLEND_S, WEATHER_MIX, WEATHERS, windOf } from '../atmosphere';
import { CITY_BLOCKS, driftAt, DRIFTS, swayAt, TREE_BELTS, TREES, umbrellaWobble, type Tree } from '../Environment3D';
import { deskPose, FLOOR_SLAB, KERB_Z, LANE_LABELS, LANES, laneLabelShown, lanesOf, ROAD_END, STREET } from '../layout3d';
import { BUS_STOP, outfitOf, outfitShirt, OVERHANG, PAVEMENT, PEDESTRIANS, pedestrianAt, shelterSpot, stormGoesToBus, UMBRELLA, umbrellaDelay, underRoof, WALK, weatherStore } from '../weather';

const lum = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

describe('the time of day over the 3D office', () => {
  it('names the four presets across the bank day', () => {
    expect(atmosphereAt(8 * 60).part).toBe('morning');
    expect(atmosphereAt(12 * 60).part).toBe('noon');
    expect(atmosphereAt(15 * 60).part).toBe('afternoon');
    expect(atmosphereAt(21 * 60).part).toBe('night');
  });

  it('mists the street early, burns it off by mid-morning, and lights the lamps and windows only after dark', () => {
    expect(atmosphereAt(8 * 60).mist).toBeGreaterThan(0.6);
    expect(atmosphereAt(10 * 60).mist).toBe(0);
    expect(atmosphereAt(12 * 60).lamps).toBe(0);
    expect(atmosphereAt(21 * 60).lamps).toBe(1);
    expect(atmosphereAt(21 * 60).windows).toBeGreaterThan(0.8);
    // The night sky is deep and dark, the noon sky bright; the sun is strongest at noon.
    expect(lum(atmosphereAt(21 * 60).skyTop)).toBeLessThan(40);
    expect(lum(atmosphereAt(12 * 60).skyHorizon)).toBeGreaterThan(200);
    const sun = [8, 12, 15.5, 21].map((h) => atmosphereAt(h * 60).sun.intensity);
    expect(Math.max(...sun)).toBe(sun[1]);
  });

  it('changes smoothly: no value jumps between two neighbouring minutes', () => {
    for (let m = DAY_KEYS[0]!.at; m < 24 * 60; m++) {
      const [a, b] = [atmosphereAt(m), atmosphereAt(m + 1)];
      expect(Math.abs(a.sun.intensity - b.sun.intensity), `${m}`).toBeLessThan(0.02);
      expect(Math.abs(a.fog.far - b.fog.far), `${m}`).toBeLessThan(0.5);
      expect(Math.abs(lum(a.skyTop) - lum(b.skyTop)), `${m}`).toBeLessThan(2);
    }
  });

  it('greys the sky, dims the sun, pulls the haze in and turns lamps on under rain', () => {
    const [dry, wet] = [atmosphereAt(12 * 60), atmosphereAt(12 * 60, true)];
    expect(wet.sun.intensity).toBeLessThan(dry.sun.intensity);
    expect(wet.fog.far).toBeLessThan(dry.fog.far);
    expect(wet.lamps).toBeGreaterThan(dry.lamps);
    expect(wet.skyTop).not.toBe(dry.skyTop);
  });
});

describe('people on the pavement', () => {
  it('stroll at a relaxed pace in dry weather, and two pairs stop to talk', () => {
    const dry = PEDESTRIANS.map((p) => pedestrianAt(p, 30, null));
    for (const [i, s] of dry.entries()) {
      expect(s.x, `${i}`).toBeGreaterThanOrEqual(PAVEMENT.x0);
      expect(s.x, `${i}`).toBeLessThanOrEqual(PAVEMENT.x1);
      expect(s.z, `${i}`).toBeGreaterThan(STREET.z0);
      expect(s.z, `${i}`).toBeLessThan(KERB_Z);
      if (s.pose === 'walk') expect(s.speed).toBeLessThanOrEqual(WALK.relaxed[1]);
    }
    expect(dry.filter((s) => s.pose === 'chat')).toHaveLength(4);
    // A walker really moves.
    const p = PEDESTRIANS.find((x) => x.chatX === null)!;
    expect(pedestrianAt(p, 10, null).x).not.toBe(pedestrianAt(p, 11, null).x);
  });

  it('in rain, umbrellas pop open one after another and their carriers walk on; everyone else sprints under the overhang', () => {
    const umbrellas = PEDESTRIANS.filter((p) => p.umbrella && p.chatX === null);
    const runners = PEDESTRIANS.filter((p) => !(p.umbrella && p.chatX === null));
    expect(umbrellas.length).toBeGreaterThan(1);
    expect(runners.length).toBeGreaterThan(0);
    // Not all at once: the umbrellas open at different moments, and each opens over UMBRELLA.open seconds.
    expect(new Set(umbrellas.map(umbrellaDelay)).size).toBeGreaterThan(1);
    for (const p of umbrellas) {
      const d = umbrellaDelay(p);
      expect(pedestrianAt(p, 60, d - 0.01).umbrella).toBe(0);
      expect(pedestrianAt(p, 60, d + UMBRELLA.open / 2).umbrella).toBeCloseTo(0.5, 1);
      const open = pedestrianAt(p, 60, 10);
      expect(open.pose).toBe('umbrella');
      expect(open.umbrella).toBe(1);
      expect(open.speed).toBe(WALK.umbrella);
    }
    for (const p of runners) {
      const early = pedestrianAt(p, 60, 0.2);
      expect(['run', 'shelter']).toContain(early.pose);
      if (early.pose === 'run') expect(early.speed).toBe(WALK.sprint);
      const later = pedestrianAt(p, 90, 30);
      expect(later.pose).toBe('shelter');
      expect(underRoof(OVERHANG, later.x, later.z)).toBe(true);
    }
  });

  it('in a storm, nobody stays out: the bus-stop group waits there on their phones, the rest under the overhang', () => {
    for (const p of PEDESTRIANS) {
      const s = pedestrianAt(p, 120, 40, true);
      if (stormGoesToBus(p)) {
        expect(s.pose, `${p.index}`).toBe('phone');
        expect(underRoof(BUS_STOP, s.x, s.z), `${p.index}`).toBe(true);
      } else {
        expect(s.pose, `${p.index}`).toBe('shelter');
        expect(underRoof(OVERHANG, s.x, s.z), `${p.index}`).toBe(true);
      }
    }
    // Everyone has their own spot.
    const spots = PEDESTRIANS.map((p) => shelterSpot(p, true).join(','));
    expect(new Set(spots).size).toBe(PEDESTRIANS.length);
  });

  it('puts both shelters on the pavement, between the building and the kerb', () => {
    for (const r of [OVERHANG, BUS_STOP]) {
      expect(r.z0).toBeGreaterThanOrEqual(STREET.z0);
      expect(r.z1).toBeLessThanOrEqual(KERB_Z);
      expect(r.h).toBeGreaterThan(2);
    }
  });

  it('starts in random mode, and a manual pick sets the weather at once', () => {
    expect(weatherStore.getState().choice).toBe('random');
    weatherStore.getState().choose('storm');
    expect(weatherStore.getState()).toMatchObject({ choice: 'storm', weather: 'storm' });
    // Back to random: it carries on from the weather now until the timer moves it on.
    weatherStore.getState().choose('random');
    expect(weatherStore.getState()).toMatchObject({ choice: 'random', weather: 'storm' });
    weatherStore.getState().setWeather('clear');
  });

  it('moves random mode on to a different weather, every few minutes', () => {
    expect(WEATHERS).toHaveLength(9);
    for (const w of WEATHERS) for (const r of [0, 0.3, 0.6, 0.999]) expect(nextRandomWeather(w, r)).not.toBe(w);
    const reached = new Set(Array.from({ length: 40 }, (_, k) => nextRandomWeather('clear', k / 40)));
    expect(reached.size).toBe(8);
    expect(RANDOM_EVERY_S).toBeGreaterThanOrEqual(60);
  });
});

describe('weather moods, the two-second blend and the wind', () => {
  it('turns the afternoon a deep golden amber, low in the west', () => {
    const a = atmosphereAt(17.5 * 60);
    expect(a.sun.color).toBe('#d35400');
    expect(atmosphereAt(15.5 * 60).sun.color).toBe('#e67e22');
    // Low and from the west (+x) late on; high at noon.
    expect(a.sun.dir[0]).toBeGreaterThan(0);
    expect(a.sun.dir[1]).toBeLessThan(atmosphereAt(12 * 60).sun.dir[1]);
  });

  it('gives harsh sun more contrast, overcast a soft grey light, and a storm a dark sky with lamps on', () => {
    const noon = 12 * 60;
    const [clear, harsh, overcast, storm] = [WEATHER_MIX.clear, WEATHER_MIX.hot, { ...CLEAR, overcast: 1 }, WEATHER_MIX.storm].map((w) => atmosphereAt(noon, w));
    expect(harsh!.sun.intensity).toBeGreaterThan(clear!.sun.intensity);
    expect(harsh!.hemi.intensity).toBeLessThan(clear!.hemi.intensity);
    expect(overcast!.sun.intensity).toBeLessThan(clear!.sun.intensity);
    expect(overcast!.hemi.intensity).toBeGreaterThan(clear!.hemi.intensity);
    // Overcast drains the colour: the sky's channels close up.
    const spread = (h: string) => {
      const c = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
      return Math.max(...c) - Math.min(...c);
    };
    expect(spread(overcast!.skyTop)).toBeLessThan(spread(clear!.skyTop));
    expect(lum(storm!.skyTop)).toBeLessThan(lum(clear!.skyTop) * 0.6);
    expect(storm!.lamps).toBeGreaterThan(0.4);
    expect(clear!.motes).toBeGreaterThan(0);
    expect(storm!.motes).toBe(0);
  });

  it('eases from one weather to the next over two seconds', () => {
    let m = { ...CLEAR };
    const steps: number[] = [];
    for (let k = 0; k < 30; k++) {
      m = stepMix(m, WEATHER_MIX.rain, 0.1);
      steps.push(m.rain);
    }
    // A drizzle first, then thicker, and full rain at two seconds, not before.
    expect(steps[0]).toBeCloseTo(0.05, 5);
    expect(steps[9]).toBeCloseTo(0.5, 5);
    expect(steps[18]).toBeLessThan(1);
    expect(steps[19]).toBe(1);
    expect(sameMix(m, WEATHER_MIX.rain)).toBe(true);
    expect(WEATHER_BLEND_S).toBe(2);
  });

  it('gives the golden hour an amber sun low in the west even at noon', () => {
    const noon = 12 * 60;
    const g = atmosphereAt(noon, WEATHER_MIX.golden);
    expect(g.sun.color).toBe('#e67e22');
    expect(g.sun.dir[0]).toBeGreaterThan(20);
    expect(g.sun.dir[1]).toBeLessThan(atmosphereAt(noon).sun.dir[1] / 2);
    expect(g.skyHorizon).not.toBe(atmosphereAt(noon).skyHorizon);
  });

  it('settles snow on the ground, closes in the fog, and keeps the sun’s dust out of both', () => {
    const noon = 12 * 60;
    const [clear, snow, fog] = [WEATHER_MIX.clear, WEATHER_MIX.snow, WEATHER_MIX.fog].map((w) => atmosphereAt(noon, w));
    expect(snow!.snowCover).toBe(1);
    expect(clear!.snowCover).toBe(0);
    expect(fog!.mist).toBe(1);
    expect(fog!.fog.far).toBeLessThan(clear!.fog.far - 25);
    expect(snow!.motes).toBe(0);
    expect(fog!.motes).toBe(0);
    expect(fog!.lamps).toBeGreaterThan(0.3);
  });

  it('blows a breeze in clear weather and a gale in a storm, and the trees lean with it', () => {
    const [calm, gale] = [windOf(WEATHER_MIX.clear), windOf(WEATHER_MIX.storm)];
    expect(gale).toBeGreaterThan(calm * 4);
    const lean = (wind: number) => Math.max(...Array.from({ length: 200 }, (_, k) => Math.abs(swayAt(3, k * 0.05, wind))));
    expect(lean(gale)).toBeGreaterThan(lean(calm) * 4);
    expect(lean(calm)).toBeGreaterThan(0);
    // Autumn is gusty; the streaks only show when the wind is up.
    expect(windOf(WEATHER_MIX.autumn)).toBeGreaterThan(calm * 2);
    expect(gustOf(WEATHER_MIX.clear)).toBe(0);
    expect(gustOf(WEATHER_MIX.storm)).toBeGreaterThan(0.8);
  });

  it('carries snow, leaves and petals downwind, inside the weather box', () => {
    expect(DRIFTS.map((d) => d.id).sort()).toEqual(['leaves', 'petals', 'snow']);
    for (const kind of DRIFTS) {
      const wind = windOf(WEATHER_MIX.autumn);
      let moved = 0;
      for (let i = 0; i < 40; i++) {
        for (const t of [0, 3.3, 17.9]) {
          const [x, y] = driftAt(kind, i, t, wind);
          expect(Math.abs(x)).toBeLessThanOrEqual(30 + 1e-6);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(13);
        }
        const [x0, y0] = driftAt(kind, i, 1, wind);
        const [x1, y1] = driftAt(kind, i, 1.05, wind);
        if (y1 < y0) moved++;
        // Leaves and petals ride the wind further than they fall; snow falls more than it drifts.
        expect(Number.isFinite(x1 - x0)).toBe(true);
      }
      expect(moved).toBeGreaterThan(30);
    }
    const leaves = DRIFTS.find((d) => d.id === 'leaves')!;
    expect(leaves.carry).toBeGreaterThan(leaves.fall);
  });

  it('shakes an umbrella harder in a storm than in a breeze', () => {
    const shake = (wind: number) => Math.max(...Array.from({ length: 200 }, (_, k) => Math.abs(umbrellaWobble(2, k * 0.05, wind).z)));
    expect(shake(windOf(WEATHER_MIX.storm))).toBeGreaterThan(shake(windOf(WEATHER_MIX.rain)) * 2);
    expect(shake(0)).toBe(0);
  });

  it('dresses the crowd for the weather', () => {
    expect(outfitOf('snow')).toBe('winter');
    expect(outfitOf('hot')).toBe('summer');
    expect(outfitOf('rain')).toBe('rain');
    expect(outfitOf('storm')).toBe('rain');
    expect(outfitOf('clear')).toBe('everyday');
    expect(outfitShirt('everyday', 3, '#123456')).toBe('#123456');
    expect(outfitShirt('winter', 3, '#123456')).not.toBe('#123456');
  });
});

describe('the ground under the city and the trees', () => {
  it('stands every tree on a belt of grass or paving, or on the pavement, never bare ground', () => {
    const on = (t: Tree) => [TREE_BELTS.far, ...TREE_BELTS.sides].some((b) => t.x >= b.x0 && t.x <= b.x1 && t.z >= b.z0 && t.z <= b.z1) || (t.z > STREET.z0 && t.z < KERB_Z);
    for (const t of TREES) expect(on(t), JSON.stringify(t)).toBe(true);
  });
});

describe('the city around the branch', () => {
  it('never stands on the office, the pavement or the road', () => {
    const site = { x0: -FLOOR_SLAB.w / 2 - 1, x1: FLOOR_SLAB.w / 2 + 1, z0: -FLOOR_SLAB.d / 2 - 1, z1: ROAD_END + 0.5 };
    for (const b of CITY_BLOCKS) {
      const overlaps = b.x + b.w / 2 > site.x0 && b.x - b.w / 2 < site.x1 && b.z + b.d / 2 > site.z0 && b.z - b.d / 2 < site.z1;
      expect(overlaps, JSON.stringify(b)).toBe(false);
    }
    expect(CITY_BLOCKS.length).toBeGreaterThan(30);
  });
});

describe('3D lanes follow the 2D map’s rules', () => {
  it('writes every condition on its lane, in both languages', () => {
    expect(LANE_LABELS.map((l) => l.id).sort()).toEqual(WIRES.filter(([, , label]) => label).map(([a, b]) => `${a}>${b}`).sort());
    for (const l of LANE_LABELS) expect(VI_DICTIONARY[l.text], l.text).toBeTruthy();
  });

  it('shows a decline condition only for the pointed-at desk, the others with Always Show', () => {
    const decline = LANE_LABELS.find((l) => l.to === 'OUT_DECLINED')!;
    const pass = LANE_LABELS.find((l) => l.to !== 'OUT_DECLINED')!;
    expect(laneLabelShown(decline, null, true)).toBe(false);
    expect(laneLabelShown(decline, decline.from, false)).toBe(true);
    expect(laneLabelShown(pass, null, true)).toBe(true);
    expect(laneLabelShown(pass, null, false)).toBe(false);
  });

  it('lights exactly the lanes of the desk under the pointer', () => {
    expect(lanesOf(null).size).toBe(0);
    const lit = lanesOf('SEC_FDS');
    expect([...lit].sort()).toEqual(LANES.filter((l) => l.from === 'SEC_FDS' || l.to === 'SEC_FDS').map((l) => l.id).sort());
  });

  it('gives every desk its pass and decline conditions, read from its own wires', () => {
    const fds = routingRules('SEC_FDS');
    expect(fds.decline).toEqual(['high-risk device']);
    expect(fds.pass).toEqual(expect.arrayContaining(['STR flag', 'clean']));
    for (const id of STATION_IDS) {
      const r = routingRules(id);
      const out = WIRES.filter(([from, , label]) => from === id && label).length;
      expect(r.pass.length + r.decline.length, id).toBe(out);
    }
  });
});

describe('the 3D view shares the 2D map’s overlays', () => {
  const src = import.meta.glob(['../Office3D.tsx', '../Desk3D.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

  it('puts the shared legend in the top-right corner, and replaces the white backdrop with the sky', () => {
    expect(src['../Office3D.tsx']).toContain('<MapLegend top={dockInset + 12} right={legendRight} />');
    expect(src['../Office3D.tsx']).toContain('<SkyBackdrop />');
    expect(src['../Office3D.tsx']).not.toContain('#fdf6e8');
  });

  it('opens an opaque description above a pointed-at desk, with its rules and its status', () => {
    const desk = src['../Desk3D.tsx']!;
    expect(desk).toMatch(/-translate-x-1\/2 -translate-y-full [^"]*bg-slate-900/);
    expect(desk).toContain('zIndexRange={[60, 50]}');
    for (const key of ["t('Passes when')", "t('Declines when')", "t('waiting')"]) expect(desk).toContain(key);
  });

  it('picks the weather from a dropdown, random by default, with every choice in both languages', () => {
    const office = src['../Office3D.tsx']!;
    expect(office).toContain('aria-haspopup="listbox"');
    expect(office).not.toContain('SegmentedToggle');
    const labels = [...office.matchAll(/^ {2}(?:random|clear|golden|hot|rain|storm|snow|fog|autumn|spring): '([^']+)',$/gm)].map((m) => m[1]!);
    // Ten labels and ten hints.
    expect(labels).toHaveLength(20);
    for (const l of labels) expect(VI_DICTIONARY[l], l).toBeTruthy();
  });
});

describe('lit lanes keep their 2D colours', () => {
  const scene = (import.meta.glob('../OfficeScene.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['../OfficeScene.tsx']!;
  it('draws the lit stripe, halo and pulses in each lane’s own colour, not one highlight colour', () => {
    expect(scene).toContain('color: laneHex(l.to, l.from) })), [lit]);');
    expect(scene).toContain('<LanePulses paths={paths} colors={colors} />');
    expect(scene).not.toContain('#fde047');
    expect(scene).toContain("material.opacity = focus === 'dim' ? LANE_DIM : 1;");
  });
});

describe('focus in 3D: a pointed-at desk and a guided scenario', () => {
  it('fades every desk but the pointed-at one and its neighbours to 20%', () => {
    const near = neighbours('SEC_FDS');
    expect(deskFocus('SEC_FDS', 'SEC_FDS', null)).toBe(1);
    for (const n of near) expect(deskFocus(n, 'SEC_FDS', null), n).toBe(1);
    const far = STATION_IDS.find((id) => !near.has(id))!;
    expect(deskFocus(far, 'SEC_FDS', null)).toBe(DIM.hover);
    expect(DIM.hover).toBe(0.2);
  });

  it('fades the desks a scenario leaves out to 20%, and lights its route', () => {
    const flow = FLOW_IDS[0]!;
    const inside = flowPlaces(flow);
    for (const id of STATION_IDS) expect(deskFocus(id, null, flow), id).toBe(inside.has(id) ? 1 : DIM.flow);
    const lit = litLanes(null, flow);
    expect(lit.dim).toBe(0.2);
    expect([...lit.lanes].sort()).toEqual([...flowScope(flow).wires].sort());
    // A pointed-at desk wins over the scenario; nothing in focus leaves everything as it is.
    expect(litLanes('SEC_FDS', flow).dim).toBe(LANE_DIM);
    expect(LANE_DIM).toBe(0.15);
    expect(litLanes(null, null).lanes.size).toBe(0);
    expect(deskFocus('SEC_FDS', null, null)).toBe(1);
  });

  it('lights a pointed-at desk’s own condition badges and fades every other badge', () => {
    const own = LANE_LABELS.filter((l) => l.from === 'SEC_FDS' || l.to === 'SEC_FDS');
    expect(own.length).toBeGreaterThan(0);
    for (const l of LANE_LABELS) expect(badgeFocus(l, 'SEC_FDS')).toBe(own.includes(l) ? 'lit' : 'dim');
    expect(badgeFocus(LANE_LABELS[0]!, null)).toBe('plain');
  });

  it('runs pulses along a lit lane, evenly spaced and looping', () => {
    const len = 10;
    const a = pulseDistance(len, 0, 1);
    const b = pulseDistance(len, 1, 1);
    expect(Math.abs(b - a)).toBeCloseTo(len / PULSE.perLane, 5);
    expect(pulseDistance(len, 0, len / PULSE.speed)).toBeCloseTo(0, 5);
    for (let t = 0; t < 20; t += 0.7) {
      const d = pulseDistance(len, 1, t);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(len);
    }
  });
});

describe('staff going home', () => {
  it('reads "off shift" from the simulation’s own words', () => {
    expect(isOffShift('Off shift until 08:00')).toBe(true);
    expect(isOffShift('Off shift until 22:30')).toBe(true);
    expect(isOffShift('Desk closed until 09:00')).toBe(true);
    expect(isOffShift('Morning briefing and systems check')).toBe(false);
  });

  it('walks from the seat, along the counter, down the aisle and out onto the pavement', () => {
    const pose = deskPose('TELLER_CASH');
    const route = leaveRoute(pose, [0.4, -0.86]);
    expect(route[0]).toEqual([pose.x + 0.4, pose.z - 0.86]);
    expect(route.at(-1)![1]).toBeGreaterThan(STREET.z0);
    for (let k = 1; k < route.length; k++) expect(route[k]![0] === route[k - 1]![0] || route[k]![1] === route[k - 1]![1]).toBe(true);
    expect(leaveAt(route, 0).done).toBe(false);
    expect(leaveAt(route, 0).at).toEqual(route[0]);
    const end = leaveAt(route, 120);
    expect(end.done).toBe(true);
    expect(end.at).toEqual(route.at(-1));
  });

  it('empties the seat of someone off shift, and walks them out only when it happens in front of the learner', () => {
    const src = (import.meta.glob('../Desk3D.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['../Desk3D.tsx']!;
    expect(src).toContain('if (!seat || (!automated && isOffShift(w.activity))) return null;');
    expect(src).toMatch(/was\.get\(w\.id\) === true && next\.get\(w\.id\) === false/);
  });
});
