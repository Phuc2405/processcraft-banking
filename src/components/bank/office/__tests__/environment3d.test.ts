import { describe, expect, it } from 'vitest';
import { VI_DICTIONARY } from '../../../../i18n/viDictionary';
import { STATION_IDS, WIRES } from '../../../../sim/topology';
import { routingRules } from '../../routingRules';
import { atmosphereAt, DAY_KEYS } from '../atmosphere';
import { CITY_BLOCKS } from '../Environment3D';
import { FLOOR_SLAB, KERB_Z, LANE_LABELS, LANES, laneLabelShown, lanesOf, ROAD_END, STREET } from '../layout3d';
import { PAVEMENT, PEDESTRIANS, pedestrianAt, shelterSpot, WALK, weatherStore } from '../weather';

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

  it('in rain, umbrella carriers keep walking and everyone else sprints to the canopy and waits there', () => {
    const umbrellas = PEDESTRIANS.filter((p) => p.umbrella && p.chatX === null);
    const runners = PEDESTRIANS.filter((p) => !(p.umbrella && p.chatX === null));
    expect(umbrellas.length).toBeGreaterThan(0);
    expect(runners.length).toBeGreaterThan(0);
    for (const p of umbrellas) expect(pedestrianAt(p, 60, 5).pose).toBe('umbrella');
    for (const p of runners) {
      const early = pedestrianAt(p, 60, 0.2);
      expect(['run', 'shelter']).toContain(early.pose);
      if (early.pose === 'run') expect(early.speed).toBe(WALK.sprint);
      const later = pedestrianAt(p, 90, 30);
      expect(later.pose).toBe('shelter');
      expect([later.x, later.z]).toEqual(shelterSpot(p));
      expect(later.z).toBeLessThan(STREET.z0 + 1.05);
    }
  });

  it('starts dry, and the rain switch is the learner’s own', () => {
    expect(weatherStore.getState().rain).toBe(false);
    weatherStore.getState().setRain(true);
    expect(weatherStore.getState().rain).toBe(true);
    weatherStore.getState().setRain(false);
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
});
