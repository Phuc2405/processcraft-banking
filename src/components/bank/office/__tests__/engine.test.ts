import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorldEngine } from '../engine/WorldEngine';
import { motion, substeps } from '../motion';
import { ParkingLot } from '../parking';
import { ParkCrowd, PARK_MEMBERS, wantsPark } from '../parkLife';
import { TrafficSim } from '../vehicles';

/** Every module reachable from `entry` by relative imports, with the bare package names they import. */
function importGraph(entry: string): { files: string[]; packages: Map<string, string> } {
  const files: string[] = [];
  const packages = new Map<string, string>();
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    files.push(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+'([^']+)';/gms)) {
      const spec = m[1]!;
      // Type-only imports vanish at build time and couple nothing.
      if (/^\s*(?:import|export)\s+type\s/.test(m[0])) continue;
      if (!spec.startsWith('.')) {
        packages.set(spec, file);
        continue;
      }
      const base = resolve(dirname(file), spec);
      const hit = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find((p) => existsSync(p));
      if (hit) visit(hit);
    }
  };
  visit(entry);
  return { files, packages };
}

describe('the simulation engine is pure', () => {
  const engineDir = join(__dirname, '..', 'engine');
  const entries = ['WorldEngine.ts', 'SimulationEngine.ts', 'EntityFactory.ts', 'staff.ts', 'deskStatus.ts', 'customerLifecycle.ts', 'routes.ts', 'dropOff.ts'].map((f) => join(engineDir, f));

  it('never reaches React, three.js or a React binding, through anything it imports', () => {
    for (const entry of entries) {
      if (!existsSync(entry)) continue;
      const { files, packages } = importGraph(entry);
      for (const [pkg, from] of packages) expect(['react', 'react-dom', '@react-three/fiber', '@react-three/drei', 'three', 'zustand'].includes(pkg), `${pkg} via ${from}`).toBe(false);
      // No view file anywhere in the graph.
      for (const f of files) expect(f.endsWith('.tsx'), f).toBe(false);
    }
  });
});

describe('the world engine steps the world exactly as the views used to', () => {
  const start = { minute: 12 * 60, weather: 'clear' as const };
  const frame = { realDt: 1 / 60, playing: true, speed: 2, minute: 12 * 60, weather: 'clear' as const };

  it('moves nothing while the bank is paused, and everything at the bank’s speed while it plays', () => {
    const world = new WorldEngine(start);
    const t0 = motion.t;
    for (let i = 0; i < 30; i++) world.tick({ ...frame, playing: false });
    expect(motion.t).toBe(t0);
    expect(world.traffic.t).toBe(0);
    for (let i = 0; i < 30; i++) world.tick(frame);
    expect(motion.t).toBeCloseTo(t0 + 30 * (1 / 60) * 2, 9);
    expect(world.traffic.t).toBeCloseTo(30 * (1 / 60) * 2, 9);
    expect(world.pavement.t).toBeCloseTo(30 * (1 / 60) * 2, 9);
  });

  it('gives the traffic, the car park and the park the very same steps they took on their own', () => {
    const world = new WorldEngine(start);
    const traffic = new TrafficSim();
    const lot = new ParkingLot();
    const park = new ParkCrowd(PARK_MEMBERS, (m) => wantsPark(m, start.minute));
    for (let i = 0; i < 600; i++) {
      world.tick(frame);
      for (const h of substeps(motion.dt)) {
        traffic.step(h);
      }
      lot.setClosed(false);
      for (const h of substeps(motion.dt)) lot.step(h);
      for (const h of substeps(motion.dt)) park.step(h, (m) => wantsPark(m, start.minute), 'dry', start.minute);
    }
    expect([...world.traffic.states()]).toEqual([...traffic.states()]);
    expect(world.trafficView.states).toEqual(traffic.states());
    expect(world.lot.parked().map((p) => p.v.id)).toEqual(lot.parked().map((p) => p.v.id));
    expect(world.lot.barrier()).toBe(lot.barrier());
    expect(world.park.people.map((p) => world.park.poseOf(p))).toEqual(park.people.map((p) => park.poseOf(p)));
  });

  it('makes each guard post once, and steps it with the rest of the world', async () => {
    const { FRONT_PLAN } = await import('../guardCabin');
    const world = new WorldEngine(start);
    const g = world.guard(FRONT_PLAN);
    expect(world.guard(FRONT_PLAN)).toBe(g);
    const t0 = g.t;
    world.tick(frame);
    expect(g.t).toBeGreaterThan(t0);
  });

  it('lets the pavement’s people react to the weather picked', () => {
    const world = new WorldEngine(start);
    world.tick({ ...frame, weather: 'rain' });
    expect(world.pavement.rainFor).not.toBeNull();
    world.tick(frame);
    expect(world.pavement.rainFor).toBeNull();
    expect(world.pavement.after).not.toBeNull();
  });
});

describe('one desk-status stream for both views (Observer)', () => {
  it('tells each desk’s subscribers about that desk only, and only when its status changes', async () => {
    const { createBankStore } = await import('../../../../store/bankStore');
    const { DeskStatusFeed } = await import('../engine/deskStatus');
    const store = createBankStore();
    // The clock only moves while the bank plays.
    store.setState({ playing: true });
    const feed = new DeskStatusFeed(store);
    const first = feed.get('GATE_POS');
    expect(first.waiting).toBe(store.getState().view.stations.GATE_POS.queueLength);
    let heard = 0;
    const stop = feed.subscribe('GATE_POS', () => heard++);
    // Play through the morning until the teller's status moves.
    for (let i = 0; i < 160 && feed.get('GATE_POS') === first; i++) store.getState().tickBeat();
    expect(feed.get('GATE_POS')).not.toBe(first);
    expect(heard).toBeGreaterThan(0);
    // The same object until the next real change: a view re-renders on change only.
    expect(feed.get('GATE_POS')).toBe(feed.get('GATE_POS'));
    stop();
    const before = heard;
    for (let i = 0; i < 20; i++) store.getState().tickBeat();
    expect(heard).toBe(before);
  });

  it('is what the 2D desk card and the 3D badge and tooltip all read', () => {
    const read = (rel: string): string => readFileSync(join(__dirname, rel), 'utf8');
    expect(read('../../BankMap.tsx')).toContain('const { working, showStatus } = useDeskStatus(id);');
    expect(read('../Desk3D.tsx').match(/useDeskStatus\(id\)/g)?.length).toBe(2);
  });
});
