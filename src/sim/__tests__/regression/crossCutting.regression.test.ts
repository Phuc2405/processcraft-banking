/**
 * Regression suite §10 (beyond the mandate's list): the guarantees every other area leans on.
 *  - Bundle hygiene: no app module can reach test code, so `npm run build` never ships it.
 *  - Determinism: a seed replays the same day, so a learner's replay matches what they saw.
 *  - Persistence: a corrupt or hostile save is refused, never half-loaded.
 *  - The one execution lock under random click storms: one demo at a time, books balanced, and Cancel always unlocks.
 */

import fc from 'fast-check';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { cancelDemo, demoLocked } from '../../../components/bank/DemoSession';
import { executeDemo } from '../../../components/bank/retailOpsActions';
import { citNow, dispatchCitDemo } from '../../../components/ops/citActions';
import { everyTransactionBalances } from '../../../engine/ledger';
import { bankStore } from '../../../store/bankStore';
import { citStore } from '../../../store/citStore';
import { demoSessionStore } from '../../../store/demoSessionStore';
import { retailOpsStore } from '../../../store/retailOpsStore';
import { BankSimulation } from '../../bankSimulation';
import { CIT_DEMOS, citAt, type CitDemo } from '../../citEngine';
import { ALL_DEMO_ACTIONS, type DemoActionId } from '../../demoActions';
import { decodeBook, openingBook, opsTrial, runOpsAction } from '../../retailOps';
import { at, freshBank, src } from './harness';

const ROOT = join(__dirname, '../../..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? (name === 'node_modules' ? [] : files(p)) : [p];
  });
const isTest = (p: string): boolean => /[\\/]__tests__[\\/]/.test(p) || /\.test\.tsx?$/.test(p);

beforeEach(freshBank);

describe('§10.1 bundle hygiene: test code never reaches the production bundle', () => {
  const app = files(ROOT).filter((p) => /\.(ts|tsx)$/.test(p) && !isTest(p));

  it('finds the app’s modules', () => {
    expect(app.length).toBeGreaterThan(100);
    expect(app.some((p) => p.endsWith('main.tsx'))).toBe(true);
  });

  it('has no app module importing a test folder, a test runner, fast-check or Node’s file system', () => {
    const banned = [/from ['"][^'"]*__tests__[^'"]*['"]/, /from ['"]vitest['"]/, /from ['"]fast-check['"]/, /from ['"](node:)?fs['"]/, /from ['"](node:)?path['"]/];
    const hits = app.flatMap((p) => {
      const text = src(relative(ROOT, p));
      return banned.filter((re) => re.test(text)).map((re) => `${relative(ROOT, p)} ${re}`);
    });
    expect(hits).toEqual([]);
  });

  it('keeps the test libraries in devDependencies and collects only *.test.ts files', () => {
    const pkg = JSON.parse(src('../package.json')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    for (const lib of ['vitest', 'fast-check']) {
      expect(pkg.devDependencies[lib], lib).toBeDefined();
      expect(pkg.dependencies[lib], lib).toBeUndefined();
    }
    expect(src('../vite.config.ts')).toContain("include: ['src/**/*.test.ts']");
    // The build entry is the app's main module, not a test.
    expect(src('../index.html')).toMatch(/src="\/src\/main\.tsx"/);
  });
});

describe('§10.2 determinism', () => {
  it('replays the same day, ledger and STP tally from the same seed and day (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5_000 }), fc.integer({ min: 1, max: 5 }), (seed, day) => {
        const run = () => {
          const sim = new BankSimulation({ seed, day, headless: true });
          sim.runToEndOfDay();
          return JSON.stringify({ log: sim.transactionLog().length, lines: sim.ledgerEntries.length, stp: sim.stpTally(), total: sim.ledgerEntries.reduce((n, e) => n + e.amount, 0) });
        };
        expect(run()).toBe(run());
      }),
      { numRuns: 3 },
    );
  });

  it('plans the same CIT day, manual runs included, every time', () => {
    const manual = [{ kind: 'SBV' as const, at: 600, sbv: 'DEPOSIT' as const }, { kind: 'ATM' as const, at: 700 }];
    for (const day of [1, 7, 14]) {
      const a = citAt(day, 1440, manual);
      expect(a.journal.length, `day ${day}`).toBeGreaterThan(0);
      expect(JSON.stringify(citAt(day, 1440, manual))).toBe(JSON.stringify(a));
    }
  });
});

describe('§10.3 persistence: a bad save is refused whole', () => {
  it('reads a saved retail book back exactly, and refuses garbage', () => {
    const book = runOpsAction(runOpsAction(openingBook(), 'teller-deposit-5000', 'D1 10:00:00').book, 'fee-card-10', 'D1 10:01:00').book;
    const back = decodeBook(JSON.parse(JSON.stringify(book)));
    expect(back).toEqual(book);
    expect(opsTrial(back!).balanced).toBe(true);
    for (const bad of [null, undefined, 42, 'book', [], {}, { balances: 'x' }, { ...book, balances: { ...book.balances, CASH_VAULT: 'lots' } }]) expect(decodeBook(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe('§10.4 the one execution lock under random click storms', () => {
  type Click = { kind: 'demo'; id: DemoActionId } | { kind: 'cit'; demo: CitDemo } | { kind: 'cancel' } | { kind: 'beat' };
  const ids = ALL_DEMO_ACTIONS.map((a) => a.id).filter((id) => id !== 'eod');
  const click: fc.Arbitrary<Click> = fc.oneof(
    fc.constantFrom(...ids).map((id): Click => ({ kind: 'demo', id })),
    fc.constantFrom(...CIT_DEMOS).map((demo): Click => ({ kind: 'cit', demo })),
    fc.constant<Click>({ kind: 'cancel' }),
    fc.constant<Click>({ kind: 'beat' }),
  );

  it('never runs two demos at once, keeps every book balanced, and Cancel always unlocks (property)', () => {
    fc.assert(
      fc.property(fc.array(click, { minLength: 1, maxLength: 14 }), (clicks) => {
        freshBank();
        at(10 * 60);
        for (const c of clicks) {
          const before = demoSessionStore.getState().active;
          const locked = demoLocked();
          if (c.kind === 'demo') executeDemo(c.id);
          else if (c.kind === 'cit') dispatchCitDemo(c.demo);
          else if (c.kind === 'cancel') cancelDemo();
          else bankStore.getState().tickBeat();
          const after = demoSessionStore.getState().active;
          // A press while locked never replaces the running demo.
          if (locked && c.kind !== 'cancel' && c.kind !== 'beat') expect(after).toEqual(before);
          if (c.kind === 'cancel') {
            expect(demoLocked()).toBe(false);
            expect(bankStore.getState().playing).toBe(false);
          }
          expect(citStore.getState().manual.length).toBeLessThanOrEqual(clicks.length);
          expect(citNow().runs.filter((r) => r.planned.order.id.includes('-M') && r.run && r.run.status !== 'SETTLED').length).toBeLessThanOrEqual(1);
          expect(bankStore.getState().view.ledger.trial.balanced).toBe(true);
          expect(opsTrial(retailOpsStore.getState().book).balanced).toBe(true);
        }
        expect(everyTransactionBalances(bankStore.getState().sim.ledgerEntries)).toBe(true);
      }),
      { numRuns: 25 },
    );
  });
});
