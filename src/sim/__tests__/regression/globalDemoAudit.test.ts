/**
 * System-wide audit of the three demo guarantees, across every scenario of Flows 01-09:
 *   1. a demo pauses the bank and locks its clock (no time passes, no background traffic, no 504 / RC 68 fault on the demo);
 *   2. no two wires of different colours run on top of each other anywhere on the map, in any flow;
 *   3. a demo's desks count exactly its own customers, and nothing it put on the stage outlives it.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { cancelDemo, destroyAllActiveEntities, demoLocked, deskView, installDemoSession } from '../../../components/bank/DemoSession';
import { executeDemo } from '../../../components/bank/retailOpsActions';
import { dispatchCitDemo } from '../../../components/ops/citActions';
import { BANK_WIRES, CASH_LINES, mapStrokes } from '../../../engine/plan/layout';
import { LANE_GAP, laneConflicts, separateLanes, wireTone, type Stroke } from '../../../engine/plan/wireLanes';
import { isolateView } from '../../../engine/simulation/deskStatus';
import { bankStore, clockPaused } from '../../../store/bankStore';
import { demoSessionStore } from '../../../store/demoSessionStore';
import { deskVisitStore } from '../../../store/deskVisitStore';
import { hopPlayerStore } from '../../../store/hopPlayerStore';
import { vaultFlowStore } from '../../../store/vaultFlowStore';
import { FLOW_IDS, type FlowId } from '../../../types/viewport';
import { BankSimulation } from '../../bankSimulation';
import { CIT_DEMOS } from '../../citEngine';
import { WORK_END, WORK_START } from '../../clock';
import { ALL_DEMO_ACTIONS, type DemoActionId } from '../../demoActions';
import { ambientVisitsDue, DESK_VISITS } from '../../deskVisit';
import { flowScope } from '../../guidedFlows';
import { presetCustomer } from '../../presets';
import { DEFAULT_RULES } from '../../rules';
import { STATION_IDS } from '../../topology';
import { freshBank, playDemoToEnd, at, src } from './harness';

beforeEach(freshBank);

/** Payments of every flow but the night batch (its own one-case replay) and the cassette-low sensor drill (a book-only alert). */
const PAYMENT_DEMOS = ALL_DEMO_ACTIONS.filter((a) => a.id !== 'eod' && a.id !== 'cassette-low');

/** A live, busy bank at 10:00 with Chaos Monkey's network congestion on (35% of payments hit a 504), playing. */
function liveNoisyBank(): void {
  at(10 * 60);
  bankStore.getState().setChaos({ congestion: true });
  bankStore.getState().play();
  for (let i = 0; i < 6; i++) bankStore.getState().tickBeat();
  expect(bankStore.getState().view.inFlight, 'background customers in the bank').toBeGreaterThan(0);
}

const finished = (): number => bankStore.getState().view.kpis.approved + bankStore.getState().view.kpis.declined;

describe('§1 every demo pauses the bank and locks its clock', () => {
  it.each(PAYMENT_DEMOS.map((a) => [a.id, a.flow] as const))('%s (flow %i): paused, clock frozen, no background traffic, no chaos fault', (id, flow) => {
    liveNoisyBank();
    const { minute, day } = bankStore.getState().view;
    const before = finished();
    const timeouts = bankStore.getState().view.chaos.stats.timeouts504;
    executeDemo(id as DemoActionId);
    const s = bankStore.getState();
    expect(s.flow).toBe(flow);
    // The bank's clock is paused from the first moment, whatever the internal solo driver does.
    expect(clockPaused(s), `${id} pauses the bank`).toBe(true);
    if (s.presetTrace === null) return;
    expect(demoLocked()).toBe(true);
    // Nothing the learner can press resumes the clock while it runs.
    s.play();
    s.toggle();
    s.step();
    expect(clockPaused(bankStore.getState())).toBe(true);
    expect(playDemoToEnd(), `${id} finishes`).toBe(true);
    const end = bankStore.getState();
    expect(end.view.minute, `${id} never moves the clock`).toBe(minute);
    expect(end.view.day).toBe(day);
    expect(clockPaused(end)).toBe(true);
    // Only the demo's own payment finished: no background customer moved on.
    expect(finished() - before, `${id} finishes only its own payment`).toBeLessThanOrEqual(1);
    // The congestion generator never touched the demo's payment.
    expect(end.view.chaos.stats.timeouts504, `${id} raises no 504`).toBe(timeouts);
  });

  it('runs the EoD night-batch case paused at its own 23:00, with the bank left on it', () => {
    at(10 * 60);
    bankStore.getState().play();
    executeDemo('eod');
    const s = bankStore.getState();
    expect(clockPaused(s)).toBe(true);
    expect(s.playing).toBe(false);
    expect(demoSessionStore.getState().active?.kind).toBe('sandbox');
  });

  it.each(CIT_DEMOS.map((k) => [k] as const))('CIT %s (flow 09): the bank pauses and stays paused through the run', (kind) => {
    liveNoisyBank();
    const minute = bankStore.getState().view.minute;
    expect(dispatchCitDemo(kind)).toBe(true);
    expect(clockPaused(bankStore.getState())).toBe(true);
    expect(demoLocked()).toBe(true);
    bankStore.getState().play();
    expect(bankStore.getState().view.minute).toBe(minute);
  });

  it('keeps the sim clock still through a solo beat, on the demo’s own clock, and lets the bank carry on from the same minute', () => {
    const sim = new BankSimulation({ seed: 3 });
    sim.stepUntil(WORK_START + 30);
    const minute = sim.minute;
    const id = sim.inject(presetCustomer('teller-12k', DEFAULT_RULES)!)!;
    for (let i = 0; i < 120 && !sim.traceOf(id)!.done; i++) sim.step({ solo: true });
    expect(sim.traceOf(id)!.done).toBe(true);
    expect(sim.minute).toBe(minute);
    sim.step();
    expect(sim.minute).toBeGreaterThan(minute);
  });

  it('never lets a chaos fault land on a scripted demo payment, even with every generator on', () => {
    const sim = new BankSimulation({ seed: 11, chaos: { congestion: true, posOutage: true, hsmFailure: true } });
    sim.stepUntil(WORK_START + 20);
    for (const preset of ['pos-20', 'otp-250', 'pos-500', 'qr-780'] as const) {
      const id = sim.inject(presetCustomer(preset, DEFAULT_RULES)!)!;
      for (let i = 0; i < 120 && !sim.traceOf(id)!.done; i++) sim.step({ solo: true });
      expect(sim.traceOf(id)!.done, preset).toBe(true);
      expect(sim.transactionLog().find((t) => t.txId === `tx_${id}`)?.chaos, preset).toBeUndefined();
    }
  });

  it('locks every clock control of the clock bar for the whole demo (Play, Step, speeds, skips, scrubber, day buttons)', () => {
    const bar = src('components/bank/ClockBar.tsx');
    for (const [test, lock] of [
      ['bank-play', 'disabled={dayOver || demoRun}'],
      ['bank-step', 'disabled={dayOver || demoRun}'],
      ['bank-jump-eod', 'disabled={dayOver || demoRun || minute >= SKIP_TARGETS.night}'],
      ['bank-skip-end', 'disabled={dayOver || demoRun}'],
      ['bank-reset-day', 'disabled={!started || demoRun}'],
      ['bank-next-day', 'disabled={!dayOver || demoRun}'],
    ] as const) {
      expect(bar, test).toContain(test);
      expect(bar, test).toContain(lock);
    }
    expect(bar).toContain('disabled={dayOver || demoRun || minute >= s.target}');
    expect(bar).toContain('<Timeline minute={minute} dayOver={dayOver} locked={demoRun} />');
    expect(bar).toContain('const playing = useBankStore((s) => !clockPaused(s));');
  });

  it('routes the AML desk’s test transfer through the demo pipeline, never the live bank', () => {
    const aml = src('components/ops/AmlPanel.tsx');
    expect(aml).toContain('runCustomerDemo(');
    expect(aml).not.toMatch(/\.play\(\)/);
  });
});

describe('§2 no two wires of different colours share a lane, map-wide and in every flow', () => {
  it('finds no crowded pair among all routed wires, gateway trunks and gold cash lines', () => {
    expect(laneConflicts(mapStrokes())).toEqual([]);
  });

  it.each(FLOW_IDS.map((f) => [f] as const))('Flow %i: its lit route never lies on an unlit wire (a gateway bus excepted)', (flow: FlowId) => {
    const scope = flowScope(flow);
    // The flow's wires drawn in its accent, every other wire in its own colour: one scenario, colour by colour.
    const strokes = mapStrokes().map((s) => ({ ...s, key: undefined, tone: scope.wires.has(s.id) ? ('lit' as never) : s.tone }));
    expect(laneConflicts(strokes)).toEqual([]);
  });

  it('keeps the teller cash line at least LANE_GAP off the teller’s ledger, AML and dispute wires', () => {
    // The corridor run (third corner to fourth) sits LANE_GAP or more off each of those wires' horizontal runs.
    const corridor = CASH_LINES.TELLER[2]![1];
    for (const id of ['TELLER_CASH>LEDGER_DEBIT', 'TELLER_CASH>AML_DESK', 'DISPUTE_DESK>LEDGER_DEBIT']) {
      const pts = BANK_WIRES.find((x) => x.id === id)!.drawPoints;
      const runs = pts.slice(1).filter((b, i) => b[1] === pts[i]![1]).map(([, y]) => y);
      for (const y of runs) expect(Math.abs(y - corridor), id).toBeGreaterThanOrEqual(LANE_GAP);
    }
    expect(laneConflicts(mapStrokes().filter((s) => s.id === 'cash:TELLER' || s.id.startsWith('TELLER_CASH>') || s.id === 'DISPUTE_DESK>LEDGER_DEBIT'))).toEqual([]);
  });

  it('separateLanes slides a crowded inner run of another colour to a clear lane, keeping its ports and right angles', () => {
    const a: Stroke = { id: 'a', tone: 'route', points: [[0, 0], [0, 100], [300, 100], [300, 200]] };
    const b: Stroke = { id: 'b', tone: 'cash', points: [[50, 0], [50, 102], [250, 102], [250, 200]] };
    const out = separateLanes([a, b]);
    const moved = out.get('b')!;
    expect(out.get('a')).toEqual(a.points);
    expect(moved[0]).toEqual([50, 0]);
    expect(moved[3]).toEqual([250, 200]);
    expect(Math.abs(moved[1]![1] - 100)).toBeGreaterThanOrEqual(LANE_GAP);
    expect(moved[1]![1]).toBe(moved[2]![1]);
    expect(laneConflicts([a, { ...b, points: moved }])).toEqual([]);
  });

  it('separateLanes leaves a same-colour bus alone and never routes a moved run through a card', () => {
    const a: Stroke = { id: 'a', tone: 'decline', points: [[0, 0], [0, 100], [300, 100], [300, 200]] };
    const b: Stroke = { id: 'b', tone: 'decline', points: [[50, 0], [50, 100], [250, 100], [250, 200]] };
    expect(separateLanes([a, b]).get('b')).toEqual(b.points);
    const c: Stroke = { id: 'c', tone: 'cash', points: [[50, 0], [50, 104], [250, 104], [250, 200]] };
    const card = { x0: 40, y0: 112, x1: 260, y1: 150 };
    const moved = separateLanes([a, c], [card]).get('c')!;
    expect(moved[1]![1]).toBeLessThanOrEqual(card.y0);
    expect(Math.abs(moved[1]![1] - 100)).toBeGreaterThanOrEqual(LANE_GAP);
  });

  it('colours the 2D map from the same tone table the lanes are separated by', () => {
    expect(src('components/bank/BankMap.tsx')).toContain('TONE_STYLE[wireTone(to, from)]');
    expect(wireTone('OUT_DECLINED', 'GATE_POS')).toBe('decline');
    expect(wireTone('LEDGER_DEBIT', 'GATE_POS')).toBe('route');
  });
});

/** Customers waiting at every desk, as the desks show them. */
const waitingOnStage = (): number => STATION_IDS.reduce((n, st) => n + deskView().stations[st].queueLength, 0);

describe('§3 a demo’s desks count exactly its own customers, and nothing outlives it', () => {
  /** A walk-in standing at the savings desk before the demo, to prove the stage is cleared. */
  const walkIn = (): void => {
    const [step] = ambientVisitsDue(WORK_START, WORK_START + 60, WORK_START, WORK_END);
    expect(deskVisitStore.getState().arrive(step!)).toBe(true);
  };

  it.each(PAYMENT_DEMOS.map((a) => [a.id] as const))('%s: only its own customer at the desks while it runs; baseline 0 after cancel', (id) => {
    liveNoisyBank();
    walkIn();
    executeDemo(id as DemoActionId);
    const own = DESK_VISITS[id as keyof typeof DESK_VISITS];
    // Exactly the demo's own visitors, none from before: X customers, X figures (or none, for a case the machines take).
    const visits = deskVisitStore.getState().visits;
    expect(visits.every((v) => own?.includes(v.step) ?? false), `${id}: no walk-in survives the demo's start`).toBe(true);
    expect([0, own?.length ?? 0], `${id} visitors`).toContain(visits.length);
    if (demoLocked()) {
      const waiting = waitingOnStage();
      expect(waiting, `${id}: the paused bank's queues are not counted`).toBeLessThanOrEqual(1);
      expect(bankStore.getState().view.inFlight).toBeGreaterThan(waiting);
    }
    cancelDemo();
    expect(demoLocked()).toBe(false);
    expect(deskVisitStore.getState().visits, `${id}: no ghost visitor after cancel`).toEqual([]);
    expect(deskVisitStore.getState().frozenAt).toBeNull();
    expect(vaultFlowStore.getState().retail).toHaveLength(0);
    expect(hopPlayerStore.getState().session).toBeNull();
    // The stage stays clean ("0 waiting" everywhere) until the learner plays the bank on: the paused bank's queues never come back as ghosts.
    expect(waitingOnStage(), `${id}: 0 waiting after cancel`).toBe(0);
  });

  it('closes a finished demo by itself, clearing any visitor left frozen, back to the bank’s own view', () => {
    const stop = installDemoSession();
    try {
      at(10 * 60);
      executeDemo('teller-12k');
      expect(deskVisitStore.getState().visits).toHaveLength(DESK_VISITS['teller-12k']!.length);
      // A visitor held frozen would never walk off on its own clock.
      deskVisitStore.getState().freeze();
      expect(playDemoToEnd()).toBe(true);
      hopPlayerStore.getState().reset();
      expect(demoLocked()).toBe(false);
      expect(demoSessionStore.getState().active).toBeNull();
      expect(deskVisitStore.getState().visits).toEqual([]);
      expect(waitingOnStage()).toBe(0);
      // Play hands the stage back to the live bank.
      bankStore.getState().play();
      expect(deskView()).toBe(bankStore.getState().view);
    } finally {
      stop();
    }
  });

  it('starts every demo on a clear stage: no walk-in, earlier visitor or cash echo from before', () => {
    walkIn();
    expect(vaultFlowStore.getState().push({ endpoint: 'TELLER', dir: 'OUT', source: 'retail', cents: 100, id: 'echo-before' }, 60_000)).toBe(true);
    expect(vaultFlowStore.getState().retail).toHaveLength(1);
    destroyAllActiveEntities();
    expect(deskVisitStore.getState().visits).toEqual([]);
    expect(vaultFlowStore.getState().retail).toEqual([]);
  });

  it('isolateView keeps only the demo’s payment at the desks, and nobody for a run the hop player draws', () => {
    const sim = new BankSimulation({ seed: 7 });
    sim.stepUntil(WORK_START + 90);
    const view = sim.snapshot();
    const busy = STATION_IDS.filter((id) => view.stations[id].queueLength > 0);
    expect(busy.length).toBeGreaterThan(0);
    const none = isolateView(view, null);
    for (const id of STATION_IDS) {
      expect(none.stations[id].queueLength, id).toBe(0);
      expect(none.stations[id].working, id).toBeNull();
      expect(none.stations[id].workers.some((w) => w.working), id).toBe(false);
    }
    const target = view.stations[busy[0]!].queue[0]!.id;
    const one = isolateView(view, target);
    expect(STATION_IDS.reduce((n, id) => n + one.stations[id].queueLength, 0)).toBe(1);
    // The bank's own view is untouched.
    expect(view.stations[busy[0]!].queueLength).toBeGreaterThan(0);
  });

  it('feeds the isolated view to every desk counter: both maps’ badges, the 2D cards and frames, the 3D lines and staff', () => {
    expect(src('components/bank/useSimulation.ts')).toContain('{ getState: () => ({ view: deskView() }), subscribe: (fn) => subscribeDemo(fn) }');
    expect(src('components/bank/BankMap.tsx')).toContain('sv={desks.stations[def.id]}');
    expect(src('components/bank/BankMap.tsx')).toContain('n + desks.stations[st].queueLength');
    expect(src('components/bank/office/WorldProvider.tsx')).toContain('const view = deskView();');
    expect(src('components/bank/office/Desk3D.tsx')).toContain('useDeskViewOf((v) => surgeLevel(');
  });
});
