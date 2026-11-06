import { beforeEach, describe, expect, it } from 'vitest';
import { BankSimulation } from '../bankSimulation';
import { WORK_START } from '../clock';
import { presetCustomer } from '../presets';
import { DEFAULT_RULES } from '../rules';
import { bankStore } from '../../store/bankStore';
import { deskVisitStore, visitElapsed } from '../../store/deskVisitStore';
import { shiftQueueStore } from '../../store/shiftQueueStore';
import { retailOpsStore } from '../../store/retailOpsStore';
import { executeDemo, releaseDueDemos, runDemo, stayForShift } from '../../components/bank/retailOpsActions';

/** Everything the bank has finished today: what a leaked background payment would add to. */
const finished = (sim: BankSimulation): number => {
  const k = sim.snapshot().kpis;
  return k.approved + k.declined;
};

describe('a paused bank plays one demo and nothing else', () => {
  it('serves only the scripted demo payment on a solo beat: every customer already queued stays where they were', () => {
    const sim = new BankSimulation({ seed: 7 });
    sim.stepUntil(WORK_START);
    // Play on to a busy moment, with customers still queued or mid-way between desks at the end of a beat.
    for (let i = 0; i < 96 && sim.snapshot().inFlight === 0; i++) sim.step();
    const queued = sim.snapshot().inFlight;
    expect(queued, 'the bank needs background customers in its queues for this test').toBeGreaterThan(0);
    const before = finished(sim);
    const id = sim.inject(presetCustomer('pos-20', DEFAULT_RULES)!)!;
    for (let i = 0; i < 40 && !sim.traceOf(id)!.done; i++) sim.step({ solo: true });
    expect(sim.traceOf(id)!.done).toBe(true);
    // Exactly one more payment finished: the demo's own.
    expect(finished(sim)).toBe(before + 1);
    expect(sim.snapshot().inFlight).toBe(queued);
  });

  it('lets the background customers carry on once the bank plays again', () => {
    const sim = new BankSimulation({ seed: 7 });
    sim.stepUntil(WORK_START + 60);
    const before = finished(sim);
    sim.step();
    expect(finished(sim)).toBeGreaterThan(before);
  });
});

describe('the store keeps a pause a pause', () => {
  beforeEach(() => {
    bankStore.getState().resetDay();
    shiftQueueStore.getState().clear();
    retailOpsStore.getState().reset();
    deskVisitStore.getState().clear();
  });

  it('never starts a paused bank when the clock is moved, the flow or sub-process is switched, or the view is toggled', () => {
    const s = () => bankStore.getState();
    s().skipTo(WORK_START);
    s().setActiveFlow(6);
    s().selectSubProcess('term-deposit', 6);
    s().setViewMode('3d');
    s().setViewMode('2d');
    s().jumpToEod();
    expect(s().playing).toBe(false);
    expect(s().presetTxId).toBeNull();
  });

  it('holds a queued counter scenario while paused, even after the clock enters its shift', () => {
    runDemo('teller-12k');
    stayForShift();
    bankStore.getState().skipTo(WORK_START + 30);
    releaseDueDemos();
    expect(shiftQueueStore.getState().waiting.map((w) => w.id)).toEqual(['teller-12k']);
    expect(retailOpsStore.getState().last).toBeNull();
  });

  it('freezes the people at a counter on pause, where they stand, and carries on from the same frame on play', () => {
    bankStore.getState().skipTo(WORK_START);
    executeDemo('td-break-10k');
    const visit = deskVisitStore.getState().visits[0]!;
    const t0 = visit.startedAt;
    deskVisitStore.getState().freeze(t0 + 2_000);
    expect(visitElapsed(visit, t0 + 2_000)).toBeCloseTo(2, 5);
    // Ten seconds later, still paused: nobody has moved.
    expect(visitElapsed(visit, t0 + 12_000)).toBeCloseTo(2, 5);
    deskVisitStore.getState().thaw(t0 + 12_000);
    expect(visitElapsed(visit, t0 + 13_000)).toBeCloseTo(3, 5);
    expect(deskVisitStore.getState().visits).toHaveLength(1);
  });
});
