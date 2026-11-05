/**
 * The CIT demo pass: the crew's shared walk (2D and 3D read one timeline), the one status vocabulary every actor maps into, the
 * one-van mutex and the bottom dock's dropdown, and pause-isolated demos (a paused bank plays the learner's van and nothing else).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CitBusyBadge } from '../../components/ops/CitPanel';
import { citDemoBlock, citNow, citSoloActive, CIT_SOLO_MS, dispatchCitDemo, installCitSync } from '../../components/ops/citActions';
import { counterTags } from '../../engine/simulation/peopleTags';
import { CitRun, loadS } from '../../engine/world/citRun';
import { citRoutes, ParkingLot } from '../../engine/world/parking';
import { setActiveLocale } from '../../i18n/localeCore';
import { bankStore } from '../../store/bankStore';
import { citStore } from '../../store/citStore';
import { retailOpsStore } from '../../store/retailOpsStore';
import { actorStatus, type ActorPhases } from '../actorStatus';
import { crewAt, crewOf, GUARD_LAG, vaultPulseAt, type CrewFlow } from '../citCrew';
import { citAt, citDemoBusy, CIT_TIMING, type CitManual } from '../citEngine';

const FLOWS: readonly CrewFlow[] = ['IN', 'OUT'];
const u01 = fc.double({ min: 0, max: 1, noNaN: true });

afterEach(() => setActiveLocale('en'));

describe('the crew’s walk at the loading bay (one timeline for 2D and 3D)', () => {
  it('stays on the walk, never jumps, and only the custodian ever carries', () => {
    fc.assert(
      fc.property(fc.constantFrom(...FLOWS), u01, u01, (flow, u, rear) => {
        const c = crewOf(flow, u, rear * 0.3);
        for (const p of [c?.custodian, c?.guard]) {
          if (!p) continue;
          expect(p.along).toBeGreaterThanOrEqual(0);
          expect(p.along).toBeLessThanOrEqual(1);
        }
        expect(c?.guard?.carrying ?? false).toBe(false);
        const a = crewAt(flow, u, 0.1);
        const b = crewAt(flow, Math.min(0.999, u + 0.002), 0.1);
        if (a && b) expect(Math.abs(a.along - b.along)).toBeLessThan(0.05);
      }),
    );
  });

  it('inflow: out of the cab, cassettes from the van to the vault (gold), back and aboard', () => {
    const stages = [0.04, 0.12, 0.3, 0.5, 0.7, 0.92].map((u) => crewAt('IN', u)!);
    expect(stages.map((s) => s.stage)).toEqual(['stepOut', 'atVan', 'toVault', 'atVault', 'toVan', 'board']);
    expect(stages[2]!.carrying).toBe(true);
    expect(stages[4]!.carrying).toBe(false);
    expect(crewAt('IN', 0.005)!.along).toBeLessThan(0.05);
    expect(crewAt('IN', 0.99)).toBeNull();
    expect(vaultPulseAt('IN', 0.5)).toBe('IN');
    expect(vaultPulseAt('IN', 0.3)).toBeNull();
  });

  it('outflow: out of the vault with the cassettes (orange), to the van, loaded, aboard', () => {
    const stages = [0.05, 0.4, 0.75, 0.9].map((u) => crewAt('OUT', u)!);
    expect(stages.map((s) => s.stage)).toEqual(['atVault', 'toVan', 'atVan', 'board']);
    expect(stages[1]!.carrying).toBe(true);
    expect(stages[3]!.carrying).toBe(false);
    expect(crewAt('OUT', 0.005)!.along).toBe(1);
    expect(vaultPulseAt('OUT', 0.05)).toBe('OUT');
    // The guard trails: not yet out of the vault at the very start.
    expect(crewOf('OUT', GUARD_LAG / 2)!.guard).toBeNull();
  });

  it('the 3D stop is long enough to walk the corridor at the crew’s pace, both ways', () => {
    for (const flow of FLOWS) expect(loadS(flow)).toBeGreaterThan(20);
  });
});

describe('one status badge for every actor (Strategy)', () => {
  const ALL: { [K in keyof ActorPhases]: readonly ActorPhases[K][] } = {
    visit: ['walk', 'queue', 'transact', 'leave'],
    served: ['walking', 'interacting', 'turning', 'departing', 'gone'],
    walker: ['in'],
    driver: ['walkingIn', 'walkingOut'],
    cit: ['IN:stepOut', 'IN:atVan', 'IN:toVault', 'IN:atVault', 'IN:toVan', 'IN:board', 'OUT:atVault', 'OUT:toVan', 'OUT:atVan', 'OUT:board'],
  };

  it('maps every phase of every kind to the shared words, and walkers on the way in say what counter visitors say', () => {
    for (const [kind, phases] of Object.entries(ALL)) for (const ph of phases) expect(['arriving', 'waiting', 'processing', 'done', null]).toContain(actorStatus(kind as keyof ActorPhases, ph as never));
    expect(actorStatus('walker', 'in')).toBe(actorStatus('visit', 'walk'));
    expect(actorStatus('driver', 'walkingIn')).toBe('arriving');
    expect(actorStatus('driver', 'walkingOut')).toBe('done');
    for (const flow of FLOWS) {
      const words = new Set(ALL.cit.filter((p) => p.startsWith(flow)).map((p) => actorStatus('cit', p)));
      expect([...words].sort()).toEqual(['arriving', 'done', 'processing']);
    }
  });

  it('tags car-park drivers and the CIT crew in the 3D pool with the counter customers', () => {
    const lot = new ParkingLot(0.6);
    lot.cit.call('IN');
    let crewTagged = false;
    let driverTagged = false;
    for (let i = 0; i < 20 * 400 && !(crewTagged && driverTagged); i++) {
      lot.step(0.05);
      const tags = counterTags({ arrivals: { poses: [] }, line: () => ({ figures: [], servedPoses: new Map() }), lot }, 40, []);
      const crew = lot.cit.pose().crew;
      if (crew.length) crewTagged ||= crew.every((c) => tags.some((t) => t.x === c.at[0] && t.z === c.at[1]));
      const walkers = lot.walkers();
      if (walkers.length) driverTagged ||= walkers.every((w) => tags.some((t) => t.x === w.x && t.z === w.z));
    }
    expect(crewTagged).toBe(true);
    expect(driverTagged).toBe(true);
  });
});

describe('pause-isolated CIT demos', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    bankStore.getState().resetDay();
    bankStore.getState().skipTo(10 * 60);
    bankStore.getState().pause();
    citStore.setState({ day: -1, manual: [] });
    retailOpsStore.getState().reset();
  });
  afterEach(() => vi.useRealTimers());

  it('plays the learner’s van to settlement while the bank stays paused, and moves nothing else', () => {
    const stop = installCitSync();
    try {
      const view = bankStore.getState().view;
      const before = citNow();
      expect(dispatchCitDemo('DOORSTEP')).toBe(true);
      expect(citSoloActive()).toBe(true);
      const scheduled = (s: typeof before) => JSON.stringify(s.runs.filter((r) => !r.planned.order.id.includes('-M')));
      vi.advanceTimersByTime(CIT_SOLO_MS * (CIT_TIMING.SETTLED + CIT_TIMING.incident + 5));
      const after = citNow();
      // The bank's clock, its payments and every scheduled van are exactly where they were.
      expect(bankStore.getState().view).toBe(view);
      expect(bankStore.getState().playing).toBe(false);
      expect(scheduled(after)).toBe(scheduled(before));
      // The demo walked every state and settled, 1131 back to zero for it.
      const demo = after.runs.find((r) => r.planned.order.id.endsWith('-M1'))!.run!;
      expect(demo.status).toBe('SETTLED');
      expect(citDemoBusy(after)).toBeNull();
      expect(citSoloActive()).toBe(false);
      expect(citStore.getState().manual[0]!.lead).toBeGreaterThanOrEqual(CIT_TIMING.SETTLED);
    } finally {
      stop();
    }
  });

  it('leaves the van to the bank’s own clock while it plays', () => {
    const stop = installCitSync();
    try {
      dispatchCitDemo('ATM');
      bankStore.getState().play();
      vi.advanceTimersByTime(CIT_SOLO_MS * 20);
      expect(citStore.getState().manual[0]!.lead ?? 0).toBe(0);
    } finally {
      bankStore.getState().pause();
      stop();
    }
  });

  it('a lead moves the run on as if dispatched earlier, without resizing it', () => {
    const at = 11 * 60;
    const plain: CitManual[] = [{ kind: 'SBV', at }];
    const ahead: CitManual[] = [{ kind: 'SBV', at, lead: CIT_TIMING.DELIVERED }];
    const a = citAt(4, at, plain).runs.find((r) => r.planned.order.id.endsWith('-M1'))!;
    const b = citAt(4, at, ahead).runs.find((r) => r.planned.order.id.endsWith('-M1'))!;
    expect(b.planned.order).toEqual(a.planned.order);
    expect(a.run!.status).toBe('EN_ROUTE');
    expect(b.run!.status).toBe('DELIVERED');
  });

  it('the 3D car park steps the van and its crew alone: nobody else moves', () => {
    const lot = new ParkingLot(0.6);
    for (let i = 0; i < 200; i++) lot.step(0.05);
    const others = JSON.stringify(lot.vehicles.map((v) => [v.id, v.phase, v.t]));
    lot.cit.follow();
    lot.cit.call('OUT');
    for (let i = 0; i < 20 * 60; i++) lot.stepCitAlone(0.05);
    expect(lot.cit.phase).not.toBe('away');
    expect(JSON.stringify(lot.vehicles.map((v) => [v.id, v.phase, v.t]))).toBe(others);
  });

  it('a scheduled 3D van keeps going until its stop is over, so a paused demo is never left half walked', () => {
    const run = new CitRun(citRoutes());
    run.follow();
    run.call('IN');
    for (let i = 0; i < 20 * 600 && (run.runs === 0 || run.busy()); i++) run.step(0.05, true);
    expect(run.runs).toBe(1);
    expect(run.busy()).toBe(false);
  });
});

describe('no CIT dropdown on the bottom dock: the runs start from their sheets and the vault inspector', () => {
  beforeEach(() => {
    bankStore.getState().resetDay();
    bankStore.getState().skipTo(10 * 60);
    citStore.setState({ day: -1, manual: [] });
  });

  it('gives Flow 09 one CIT scenario dropdown in the dock, and a picked child its own run', () => {
    const dock = readFileSync(join(__dirname, '../../components/bank/PresetDock.tsx'), 'utf8');
    expect(dock).not.toContain('CitDemoButtons');
    expect(dock).toMatch(/citFlow \? \(\s*<CitDemoPicker \/>/);
    expect(dock).toContain('<CitDockButton kind={cit} />');
  });

  it('shows "Xe CIT đang vận chuyển..." on the run buttons and blocks every option while a van is en route or in count', () => {
    expect(dispatchCitDemo('ATM')).toBe(true);
    setActiveLocale('vi');
    // The run buttons read this one lock (useCitLock); the badge they show while it holds:
    expect(citDemoBlock(citNow(), false)).toBe('busy');
    const html = renderToStaticMarkup(createElement(CitBusyBadge, { stage: 'EN_ROUTE' }));
    expect(html).toContain('Xe CIT đang vận chuyển...');
    for (const kind of ['ATM', 'DOORSTEP', 'SBV'] as const) expect(dispatchCitDemo(kind)).toBe(false);
  });
});
