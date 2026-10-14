import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEED_INDEX, EOD_START, WORK_START } from '../../sim/clock';
import { memoryStorage, UI_PREFS_KEY, type KeyValueStorage } from '../bankPersistence';
import { activeFlowOf, createBankStore, dataDepthOf, viewportOf } from '../bankStore';

const make = (storage: KeyValueStorage | null = memoryStorage()) => createBankStore({ storage, now: () => new Date('2026-10-14T00:00:00Z'), seed: 7 });

describe('the viewport', () => {
  it('starts in the Advanced scope on flow 1, and remembers scope and flow', () => {
    const storage = memoryStorage();
    const a = make(storage);
    expect(viewportOf(a.getState())).toEqual({ scope: 'advanced', dimension: '2d', dataDepth: 'expert', activeFlow: null });
    a.getState().setActiveFlow(3);
    expect(viewportOf(a.getState())).toMatchObject({ scope: 'beginner', activeFlow: 3 });
    expect(JSON.parse(storage.getItem(UI_PREFS_KEY) ?? '{}')).toMatchObject({ scope: 'beginner', flow: 3 });
    const b = make(storage).getState();
    expect(b.scope).toBe('beginner');
    expect(b.flow).toBe(3);
  });

  it('keeps the four choices independent', () => {
    const store = make();
    const s = () => store.getState();
    s().setScope('beginner');
    s().setDimension('3d');
    s().setDataDepth('standard');
    expect(viewportOf(s())).toEqual({ scope: 'beginner', dimension: '3d', dataDepth: 'standard', activeFlow: 1 });
    expect(s().termMode).toBe('beginner');
    s().setScope('advanced');
    expect(viewportOf(s())).toEqual({ scope: 'advanced', dimension: '3d', dataDepth: 'standard', activeFlow: null });
    expect(s().flow).toBe(1);
    s().setDataDepth('expert');
    expect(dataDepthOf(s())).toBe('expert');
  });

  it('puts the flows aside while a chapter tour has the map', () => {
    const store = make();
    store.getState().setActiveFlow(2);
    store.getState().startSpotlight('B');
    expect(activeFlowOf(store.getState())).toBeNull();
    store.getState().exitSpotlight();
    expect(activeFlowOf(store.getState())).toBe(2);
  });
});

describe('preset actions from the store', () => {
  it('sends the payment, starts the clock at no more than normal speed and opens it in the inspector', () => {
    const store = make();
    store.getState().skipTo(WORK_START + 15);
    store.getState().setSpeed(DEFAULT_SPEED_INDEX + 1);
    store.getState().runPreset('pos-20');
    const s = store.getState();
    expect(s.playing).toBe(true);
    expect(s.speedIndex).toBe(DEFAULT_SPEED_INDEX);
    expect(s.presetTxId).toMatch(/^d1-9001$/);
    expect(s.selection).toEqual({ kind: 'transaction', id: 'd1-9001' });
    expect(s.presetTrace?.done).toBe(false);
    for (let i = 0; i < 30 && !store.getState().presetTrace?.done; i++) store.getState().tickBeat();
    expect(store.getState().presetTrace?.record?.status).toBe('APPROVED');
  });

  it('plays a preset on its own when the bank is paused: no live customers walk in, and the clock stops when it is done', () => {
    const store = make();
    store.getState().skipTo(WORK_START + 15);
    const arrivalsBefore = store.getState().view.kpis.arrivals;
    store.getState().runPreset('pos-20');
    expect(store.getState().solo).toBe(true);
    for (let i = 0; i < 40 && store.getState().playing; i++) store.getState().tickBeat();
    const s = store.getState();
    expect(s.playing).toBe(false);
    expect(s.solo).toBe(false);
    expect(s.presetTrace?.done).toBe(true);
    expect(s.presetTrace?.record?.status).toBe('APPROVED');
    // Only the one test payment arrived, and the panel still has it.
    expect(s.view.kpis.arrivals).toBe(arrivalsBefore + 1);
    expect(s.selection).toEqual({ kind: 'transaction', id: 'd1-9001' });
    store.getState().tickBeat();
    expect(store.getState().view.kpis.arrivals).toBe(arrivalsBefore + 1);
  });

  it('lets held-back customers in once the bank runs live again', () => {
    const store = make();
    store.getState().skipTo(WORK_START + 15);
    store.getState().runPreset('pos-20');
    for (let i = 0; i < 40 && store.getState().playing; i++) store.getState().tickBeat();
    const solo = store.getState().view.kpis.arrivals;
    store.getState().play();
    for (let i = 0; i < 12; i++) store.getState().tickBeat();
    expect(store.getState().view.kpis.arrivals).toBeGreaterThan(solo);
  });

  it('leaves a bank that is already live running: the preset joins the traffic', () => {
    const store = make();
    store.getState().skipTo(WORK_START + 15);
    store.getState().play();
    store.getState().runPreset('pos-20');
    expect(store.getState().solo).toBe(false);
    for (let i = 0; i < 40 && !store.getState().presetTrace?.done; i++) store.getState().tickBeat();
    expect(store.getState().playing).toBe(true);
  });

  it('Pause and Play end a solo run', () => {
    const store = make();
    store.getState().skipTo(WORK_START + 15);
    store.getState().runPreset('pos-20');
    store.getState().pause();
    expect(store.getState()).toMatchObject({ playing: false, solo: false });
    store.getState().runPreset('pos-500');
    store.getState().play();
    expect(store.getState()).toMatchObject({ playing: true, solo: false });
  });

  it('forgets the payment when the day is replayed', () => {
    const store = make();
    store.getState().skipTo(WORK_START + 15);
    store.getState().runPreset('cdm-200');
    store.getState().resetDay();
    expect(store.getState().presetTxId).toBeNull();
    expect(store.getState().presetTrace).toBeNull();
  });

  it('runs the clock to the night cycle for the EOD preset', () => {
    const store = make();
    store.getState().runPreset('eod');
    expect(store.getState().view.minute).toBe(EOD_START);
    expect(store.getState().playing).toBe(true);
  });
});

describe('leaving and resuming a walkthrough', () => {
  it('offers to resume at the same chapter, step and answers', () => {
    const store = make();
    const s = () => store.getState();
    s().startSpotlight('B', 'borderline');
    s().beginSpotlight();
    s().spotlightGo(2);
    const answers = s().spotlight?.answers;
    const step = s().spotlight?.step;
    s().setWalkCollapsed(true);
    s().exitSpotlight();
    expect(s().spotlight).toBeNull();
    expect(s().walkCollapsed).toBe(false);
    expect(s().leftTour).toMatchObject({ process: 'B', exampleId: 'borderline', step });
    s().resumeSpotlight();
    expect(s().spotlight).toMatchObject({ process: 'B', exampleId: 'borderline', step, intro: false, answers });
    expect(s().leftTour).toBeNull();
  });

  it('drops the offer when it is dismissed or another chapter starts', () => {
    const store = make();
    store.getState().startSpotlight('A');
    store.getState().exitSpotlight();
    store.getState().dismissResume();
    expect(store.getState().leftTour).toBeNull();
    store.getState().startSpotlight('A');
    store.getState().exitSpotlight();
    store.getState().startSpotlight('C');
    expect(store.getState().leftTour).toBeNull();
  });
});
