import { describe, expect, it } from 'vitest';
import { createBankStore } from '../../store/bankStore';
import { memoryStorage } from '../../store/bankPersistence';
import { spotPlan } from '../../sim/spotlightPlan';
import { stepKey, STEP_PULSE_MS } from '../useWalkthroughDock';

const make = () => createBankStore({ storage: memoryStorage(), now: () => new Date('2026-10-14T00:00:00Z'), seed: 7 });

function touring() {
  const store = make();
  store.getState().startSpotlight('A');
  store.getState().beginSpotlight();
  return store;
}

describe('walkthrough dock: auto-expand', () => {
  it('a click on a desk of the story unfolds the folded step details', () => {
    const store = touring();
    const tour = store.getState().spotlight!;
    const plan = spotPlan(tour.process, tour.exampleId, store.getState().sim.rules);
    store.getState().setWalkCollapsed(true);
    store.getState().spotlightFocus(plan.steps[0]!.place);
    expect(store.getState().walkCollapsed).toBe(false);
  });

  it('a desk off the story does nothing, and Next / auto-play keep the fold', () => {
    const store = touring();
    store.getState().setWalkCollapsed(true);
    store.getState().spotlightFocus('ATM' as never);
    expect(store.getState().walkCollapsed).toBe(true);
    store.getState().spotlightNext();
    expect(store.getState().walkCollapsed).toBe(true);
    expect(store.getState().spotlight!.step).toBe(1);
  });
});

describe('walkthrough dock: pulse key', () => {
  it('changes with the step and the example, and is null during the intro', () => {
    const base = { tour: { process: 'A', exampleId: 'fresh', intro: false }, index: 2 } as never;
    expect(stepKey(base)).toBe('A:fresh:2');
    expect(stepKey({ tour: { process: 'A', exampleId: 'slow', intro: false }, index: 2 } as never)).not.toBe(stepKey(base));
    expect(stepKey({ tour: { process: 'A', exampleId: 'fresh', intro: true }, index: 0 } as never)).toBeNull();
    expect(stepKey(null)).toBeNull();
    expect(STEP_PULSE_MS).toBe(2000);
  });
});
