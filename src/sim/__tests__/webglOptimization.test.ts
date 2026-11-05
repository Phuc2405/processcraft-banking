/**
 * The WebGL crash fix and the transaction path: pooled and shared GPU objects (no allocation per run), disposal exactly once, the
 * context-loss state machine (restore first, 2D only when unrecoverable), the payment's own path and its hop badge, and the
 * sub-process drawer's "▶ Run this scenario" for every sheet.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wearableCacheSize, wearableResources, type Wear } from '../../components/bank/office/Avatars';
import { litLanes } from '../../components/bank/office/focus3d';
import { bindContextEvents, ContextGuard, disposeObject, frameMemo, ObjectPool, type ContextState, type ContextTarget } from '../../components/bank/office/webglSafety';
import { runDemo } from '../../components/bank/retailOpsActions';
import { SubProcessInfoView } from '../../components/ops/SubProcessInfoDrawer';
import { CIT_INFO_KEYS, INFO_KEYS } from '../../data/subProcessKeys';
import { subProcessInfo } from '../../data/subProcessRegistry';
import { LANES } from '../../engine/plan/layout3d';
import { setActiveLocale } from '../../i18n/localeCore';
import { bankStore } from '../../store/bankStore';
import { CIT_DEMOS } from '../citEngine';
import { demoActionById } from '../demoActions';
import { groupMembers } from '../demoGroups';
import { sheetDemo } from '../sheetDemo';
import { edgeId, type PlaceId } from '../topology';
import { badgeHops, BADGE_HOPS, HOP_SECONDS, hopSteps, livePath, onPath, orbArrived, orbProgress } from '../transactionPath';

const disposable = () => ({ dispose: vi.fn() });

describe('Object Pool', () => {
  it('builds at most `capacity` objects and hands the same ones back after release', () => {
    const make = vi.fn(() => ({ id: Math.random() }));
    const pool = new ObjectPool(make, 3);
    const a = pool.acquire()!;
    const b = pool.acquire()!;
    const c = pool.acquire()!;
    expect(pool.acquire()).toBeNull();
    expect(make).toHaveBeenCalledTimes(3);
    expect(pool.inUse).toBe(3);
    pool.release(b);
    expect(pool.acquire()).toBe(b);
    // A hundred runs later the pool still holds the same three objects.
    for (let i = 0; i < 100; i++) {
      for (const x of [a, b, c]) pool.release(x);
      expect(new Set([pool.acquire(), pool.acquire(), pool.acquire()])).toEqual(new Set([a, b, c]));
    }
    expect(make).toHaveBeenCalledTimes(3);
    expect(pool.size).toBe(3);
  });

  it('ignores foreign and double releases, and disposes every item exactly once on drain', () => {
    const destroy = vi.fn();
    const pool = new ObjectPool(() => disposable(), 2, destroy);
    const a = pool.acquire()!;
    pool.release(a);
    pool.release(a);
    pool.release(disposable());
    expect(pool.inUse).toBe(0);
    expect(pool.acquire()).toBe(a);
    expect(pool.acquire()).not.toBe(a);
    pool.drain();
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(pool.size).toBe(0);
  });
});

describe('frameMemo', () => {
  it('computes once per frame however many readers ask', () => {
    const fn = vi.fn(() => ({ pose: 1 }));
    const pose = frameMemo(fn);
    const first = pose(0.016);
    for (let i = 0; i < 5; i++) expect(pose(0.016)).toBe(first);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(pose(0.032)).not.toBe(first);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('flyweight wearables', () => {
  it('shares one geometry and one material per piece across every figure, so remounting allocates nothing', () => {
    const wears: Wear[] = ['guard', 'mask', 'summer', 'rain', 'winter'];
    const first = wears.flatMap((w) => wearableResources(w, 3));
    const again = wears.flatMap((w) => wearableResources(w, 3));
    first.forEach((r, i) => {
      expect(again[i]!.geometry).toBe(r.geometry);
      expect(again[i]!.material).toBe(r.material);
    });
    // A thousand figures in every weather: the cache stays bounded by the pieces and the tones, never by the crowd.
    for (let i = 0; i < 1000; i++) for (const w of wears) wearableResources(w, i);
    const { shapes, surfaces } = wearableCacheSize();
    expect(shapes).toBeLessThanOrEqual(11);
    expect(surfaces).toBeLessThanOrEqual(20);
    expect(wearableResources('none', 1)).toEqual([]);
  });

  it('disposes a shared geometry and material once even when many meshes use them', () => {
    const geometry = disposable();
    const material = disposable();
    const scene = { children: Array.from({ length: 30 }, () => ({ geometry, material })) };
    expect(disposeObject(scene)).toEqual({ geometries: 1, materials: 1, textures: 0 });
    expect(geometry.dispose).toHaveBeenCalledTimes(1);
    expect(material.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('WebGL context loss: restore first, 2D only when unrecoverable', () => {
  function rig(opts: { restoreMs?: number; maxLosses?: number } = {}) {
    let now = 0;
    const timers: Array<{ fn: () => void; at: number; live: boolean }> = [];
    const states: ContextState[] = [];
    const guard = new ContextGuard((s) => states.push(s), {
      ...opts,
      now: () => now,
      setTimer: (fn, ms) => {
        const t = { fn, at: now + ms, live: true };
        timers.push(t);
        return t;
      },
      clearTimer: (h) => ((h as { live: boolean }).live = false),
    });
    const advance = (ms: number): void => {
      now += ms;
      for (const t of timers) if (t.live && t.at <= now) (t.live = false), t.fn();
    };
    return { guard, states, advance };
  }

  it('waits for the browser to restore the context and goes back to live', () => {
    const { guard, states, advance } = rig();
    guard.lost();
    expect(guard.state).toBe('restoring');
    advance(1000);
    guard.restored();
    advance(10_000);
    expect(states).toEqual(['restoring', 'live']);
  });

  it('falls back to 2D when the context does not come back in time', () => {
    const { guard, states, advance } = rig({ restoreMs: 3000 });
    guard.lost();
    advance(2999);
    expect(guard.state).toBe('restoring');
    advance(1);
    expect(states).toEqual(['restoring', 'lost']);
    // A late restore no longer flips the view back.
    guard.restored();
    expect(guard.state).toBe('lost');
  });

  it('treats a context that keeps being lost as unrecoverable', () => {
    const { guard, states, advance } = rig({ maxLosses: 2 });
    for (let i = 0; i < 2; i++) {
      guard.lost();
      advance(100);
      guard.restored();
    }
    guard.lost();
    expect(guard.state).toBe('lost');
    expect(states.at(-1)).toBe('lost');
  });

  it('is driven by the canvas events, and cancels the loss so the browser may restore', () => {
    const listeners = new Map<string, (e: Event) => void>();
    const canvas: ContextTarget = { addEventListener: (t, l) => listeners.set(t, l), removeEventListener: (t) => listeners.delete(t) };
    const { guard } = rig();
    const unbind = bindContextEvents(canvas, { onLost: () => guard.lost(), onRestored: () => guard.restored() });
    let prevented = false;
    listeners.get('webglcontextlost')!({ preventDefault: () => (prevented = true) } as unknown as Event);
    expect(prevented).toBe(true);
    expect(guard.state).toBe('restoring');
    listeners.get('webglcontextrestored')!({} as Event);
    expect(guard.state).toBe('live');
    unbind();
    expect(listeners.size).toBe(0);
    guard.dispose();
  });
});

describe('the payment’s own path', () => {
  const route = ['GATE_POS', 'STP_ENGINE', 'CORE_LEDGER', 'OUT_APPROVED'] as unknown as PlaceId[];

  it('lights only the wires crossed and the one being crossed, either way round', () => {
    expect(livePath(null)).toBeNull();
    expect(livePath({ route, at: 1, done: true })).toBeNull();
    const first = livePath({ route, at: 0, done: false })!;
    expect(first.all.size).toBe(0);
    expect(first.active).toBeNull();
    const p = livePath({ route, at: 2, done: false })!;
    expect(p.active).toBe(edgeId(route[1]!, route[2]!));
    expect(onPath(p, edgeId(route[0]!, route[1]!))).toBe(true);
    expect(onPath(p, edgeId(route[2]!, route[1]!))).toBe(true);
    expect(p.current.has(edgeId(route[2]!, route[1]!))).toBe(true);
    expect(p.travelled.has(p.active!)).toBe(false);
    // The wire after the stop is not lit yet.
    expect(onPath(p, edgeId(route[2]!, route[3]!))).toBe(false);
  });

  it('numbers the hops and marks the active one, in a short window for the badge', () => {
    const steps = hopSteps({ route, at: 2, done: false });
    expect(steps.map((s) => [s.n, s.state])).toEqual([
      [1, 'done'],
      [2, 'done'],
      [3, 'active'],
      [4, 'next'],
    ]);
    const shown = badgeHops(steps);
    expect(shown).toHaveLength(BADGE_HOPS);
    expect(shown.map((s) => s.n)).toEqual([2, 3, 4]);
    expect(badgeHops(hopSteps({ route, at: 0, done: false })).map((s) => s.n)).toEqual([1, 2, 3]);
    expect(hopSteps({ route, at: 1, done: true }).every((s) => s.state === 'done')).toBe(true);
  });

  it('moves the orb once along the wire, eased, then holds it at the stop where the LED ring lights', () => {
    expect(orbProgress(0)).toBe(0);
    let last = 0;
    for (let t = 0.05; t <= HOP_SECONDS; t += 0.05) {
      const u = orbProgress(t);
      expect(u).toBeGreaterThanOrEqual(last);
      last = u;
    }
    expect(orbProgress(HOP_SECONDS)).toBe(1);
    expect(orbProgress(HOP_SECONDS * 5)).toBe(1);
    expect(orbArrived(HOP_SECONDS / 2)).toBe(false);
    expect(orbArrived(HOP_SECONDS)).toBe(true);
  });
});

describe('a demo run lights only its own path, on both maps', () => {
  beforeEach(() => {
    bankStore.getState().resetDay();
    bankStore.getState().clearSelection();
  });

  it('runs the bill-pay sheet’s scenario, opens the payment in the inspector and narrows the 3D lanes to its path', () => {
    const demo = sheetDemo('bill-pay');
    expect(demo?.kind).toBe('action');
    runDemo((demo as { id: Parameters<typeof runDemo>[0] }).id);
    const s = bankStore.getState();
    expect(s.presetTrace).not.toBeNull();
    expect(s.selection).toEqual({ kind: 'transaction', id: s.presetTrace!.id });
    // Step through to a hop past the first stop and check only its wires are lit.
    const trace = { ...s.presetTrace!, at: Math.min(2, s.presetTrace!.route.length - 1), done: false };
    const path = livePath(trace)!;
    const lit = litLanes(null, 1, 'bill-pay', path);
    expect(lit.pulses).toBe(false);
    for (const id of lit.lanes) expect(path.all.has(id)).toBe(true);
    for (const l of LANES) if (path.all.has(l.id)) expect(lit.lanes.has(l.id)).toBe(true);
    // The scenario's whole flow is not lit, only the path.
    const flowWide = litLanes(null, 1, null, null);
    expect(lit.lanes.size).toBeLessThanOrEqual(flowWide.lanes.size);
    // Pointing at a desk still wins.
    expect(litLanes('CORE_LEDGER' as PlaceId, 1, null, path).pulses).toBe(true);
  });
});

describe('“▶ Run this scenario” on every sub-process sheet', () => {
  it('gives every sheet but the CIT overview a scenario, each a real button or CIT dispatch', () => {
    for (const k of INFO_KEYS) {
      const d = sheetDemo(k);
      if (k === 'cit-vault') {
        expect(d).toBeNull();
        continue;
      }
      expect(d, k).not.toBeNull();
      if (d!.kind === 'action') expect(() => demoActionById(d!.id)).not.toThrow();
    }
    for (const kind of CIT_DEMOS) expect(sheetDemo(CIT_INFO_KEYS[kind])).toEqual({ kind: 'cit', demo: kind });
    expect(sheetDemo('aml-sanctions')).toEqual({ kind: 'action', id: 'swift-sanction' });
    expect(sheetDemo('flow-1')).toEqual({ kind: 'action', id: 'pos-20' });
    for (const g of ['card-auth', 'bill-pay', 'bnpl-credit', 'token-3ds'] as const) expect(sheetDemo(g)).toEqual({ kind: 'action', id: groupMembers(g)[0]!.def.id });
  });

  it('renders the button in the drawer for POS, Bill Pay, BNPL, 3DS, AML and the four CIT children, in Vietnamese', () => {
    setActiveLocale('vi');
    const render = (k: (typeof INFO_KEYS)[number]) => renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo(k), liveStr: 0.5 }));
    for (const k of ['card-auth', 'bill-pay', 'bnpl-credit', 'token-3ds', 'aml-sanctions'] as const) {
      const html = render(k);
      expect(html, k).toContain('data-testid="spi-run-scenario"');
      expect(html).toContain(`data-demo="${(sheetDemo(k) as { id: string }).id}"`);
      expect(html).toContain('▶ Chạy thử kịch bản này');
    }
    for (const kind of CIT_DEMOS) {
      const html = render(CIT_INFO_KEYS[kind]);
      expect(html).toContain(`data-testid="cit-run-${kind}"`);
      expect(html).not.toContain('data-testid="spi-run-scenario"');
    }
    setActiveLocale('en');
  });
});
