import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_IDS, CHART_OF_ACCOUNTS } from '../../engine/ledger';
import { PLACE_BOX } from '../../components/bank/layout';
import { ACADEMY_LEVELS } from '../../sim/academyCatalog';
import { STATION_IDS } from '../../sim/topology';
import { createNavStore } from '../../store/navStore';
import { buildSearchIndex, fold, GL_PLACE, searchIndex, SEARCH_LIMIT } from '../useSearchIndex';
import { freeCentre, NAV_ZOOM, smartView } from '../useSmartZoom';

const EN = buildSearchIndex('expert', 'en');
const VI = buildSearchIndex('expert', 'vi');

describe('fold', () => {
  it('drops case, accents and đ', () => {
    expect(fold('  Tiền  ĐẶT cọc ')).toBe('tien dat coc');
  });
});

describe('buildSearchIndex', () => {
  it('indexes every station, lesson and GL account', () => {
    for (const id of STATION_IDS) expect(EN.some((e) => e.id === `station:${id}`)).toBe(true);
    for (const l of ACADEMY_LEVELS) expect(EN.some((e) => e.id === `lesson:${l.id}`)).toBe(true);
    for (const id of ACCOUNT_IDS) expect(EN.some((e) => e.id === `gl:${id}`)).toBe(true);
  });

  it('has unique ids', () => {
    expect(new Set(EN.map((e) => e.id)).size).toBe(EN.length);
  });

  it('maps every GL account to a place on the 2D map', () => {
    for (const id of ACCOUNT_IDS) expect(PLACE_BOX[GL_PLACE[id]]).toBeDefined();
  });
});

describe('searchIndex', () => {
  it('returns nothing for a blank query', () => {
    const { groups: g, order } = searchIndex(EN, '   ');
    expect(g.station.length + g.lesson.length + g.gl.length).toBe(0);
    expect(order).toEqual([]);
  });

  it('finds the ATM desks', () => {
    const ids = searchIndex(EN, 'atm').groups.station.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['station:GATE_ATM', 'station:ATM_CASH']));
  });

  it('finds a GL account by code and by name', () => {
    const code = searchIndex(EN, '1910');
    expect(code.groups.gl[0]?.id).toBe('gl:RECON_SUSPENSE');
    // The core ledger's own 1910 (Knowledge Base) leads; the map account with the same number follows.
    expect(code.order.slice(0, 2)).toEqual(['kb', 'gl']);
    expect(searchIndex(EN, 'customer casa').groups.gl.map((e) => e.id)).toContain('gl:CUST_CASA');
    expect(searchIndex(EN, '2010').groups.gl[0]?.action).toEqual({ kind: 'place', place: 'LEDGER_DEBIT' });
  });

  it('finds key terms and points them at their lesson', () => {
    const hit = searchIndex(EN, 'dcvv').groups.lesson[0];
    expect(hit?.action.kind).toBe('lesson');
  });

  it('ranks a label prefix above a keyword match', () => {
    const top = searchIndex(EN, 'suspense').groups.station[0];
    expect(top?.id).toBe('station:SUSPENSE');
  });

  it('caps each group', () => {
    const g = searchIndex(EN, 'a').groups;
    expect(g.lesson.length).toBeLessThanOrEqual(SEARCH_LIMIT);
    expect(g.station.length).toBeLessThanOrEqual(SEARCH_LIMIT);
  });

  it('matches Vietnamese without accents and keeps English keys', () => {
    expect(searchIndex(VI, CHART_OF_ACCOUNTS.RECON_SUSPENSE.code).groups.gl[0]?.id).toBe('gl:RECON_SUSPENSE');
    expect(searchIndex(VI, 'customer casa').groups.gl.map((e) => e.id)).toContain('gl:CUST_CASA');
    const viName = VI.find((e) => e.id === 'gl:ATM_CASH')?.label ?? '';
    expect(searchIndex(VI, fold(viName).split(' ').slice(1, 3).join(' ')).groups.gl.map((e) => e.id)).toContain('gl:ATM_CASH');
  });
});

describe('navStore', () => {
  afterEach(() => vi.useRealTimers());

  it('holds a jump for the glow time, then clears it', () => {
    vi.useFakeTimers();
    const s = createNavStore(2000);
    s.getState().jump('RECON');
    expect(s.getState().target).toEqual({ place: 'RECON', serial: 1 });
    vi.advanceTimersByTime(1999);
    expect(s.getState().target).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(s.getState().target).toBeNull();
  });

  it('a new jump restarts the glow', () => {
    vi.useFakeTimers();
    const s = createNavStore(2000);
    s.getState().jump('RECON');
    vi.advanceTimersByTime(1500);
    s.getState().jump('SUSPENSE');
    vi.advanceTimersByTime(1500);
    expect(s.getState().target).toEqual({ place: 'SUSPENSE', serial: 2 });
  });
});

describe('smart zoom insets', () => {
  it('centres on the area the chrome leaves free', () => {
    expect(freeCentre({ w: 1000, h: 600 }, { top: 60, right: 64, bottom: 0, left: 0 })).toEqual({ x: 468, y: 330 });
  });

  it('a search jump zooms in closer than a cluster fit', () => {
    const b = PLACE_BOX.RECON;
    const r = { x0: b.cx - b.w / 2, y0: b.cy - b.h / 2, x1: b.cx + b.w / 2, y1: b.cy + b.h / 2 };
    const vp = { w: 1100, h: 700 };
    expect(smartView(r, vp, 0.7, 0.15, NAV_ZOOM.minBox).zoom).toBeGreaterThan(smartView(r, vp, 0.7).zoom);
  });
});
