import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beatMs, DAY_END, DEFAULT_SPEED_INDEX, EOD_START, SLOWEST_SPEED_INDEX, SPEEDS, WORK_END, WORK_START } from '../../sim/clock';
import { BankSimulation } from '../../sim/bankSimulation';
import { LESSONS } from '../../sim/learning';
import { DEFAULT_RULES } from '../../sim/rules';
import { spotPlan } from '../../sim/spotlightPlan';
import { quizzesOf } from '../../sim/walkQuiz';
import { BANK_KEY, decodeBank, decodePrefs, decodeUiPrefs, encodeBank, INSPECTOR_WIDTH, loadBank, loadPrefs, memoryStorage, PREFS_KEY, saveBank, UI_PREFS_KEY, type KeyValueStorage } from '../bankPersistence';
import { createBankStore, PROCESS_IDS, processesAt, quizPending } from '../bankStore';

const FIXED = () => new Date('2026-10-11T00:00:00Z');
const make = (storage: KeyValueStorage | null = memoryStorage()) => createBankStore({ storage, now: FIXED, seed: 7 });

describe('the bank on screen', () => {
  it('opens on day 1 at the 07:00 start, paused, with nothing selected', () => {
    const s = make().getState();
    expect(s.view.day).toBe(1);
    expect(s.view.minute).toBe(7 * 60);
    expect(s.playing).toBe(false);
    expect(s.selection).toEqual({ kind: 'none' });
    expect(s.hubOpen).toBe(false);
    expect(s.draftRules).toEqual(DEFAULT_RULES);
  });

  it('steps one beat at a time and keeps the view in step with the simulation', () => {
    const store = make();
    store.getState().step();
    const s = store.getState();
    expect(s.view.tick).toBe(1);
    expect(s.view.minute).toBe(s.sim.minute);
    expect(s.playing).toBe(false);
  });

  it('only advances on a tick while playing', () => {
    const store = make();
    store.getState().tickBeat();
    expect(store.getState().view.tick).toBe(0);
    store.getState().play();
    store.getState().tickBeat();
    store.getState().tickBeat();
    expect(store.getState().view.tick).toBe(2);
    store.getState().pause();
    store.getState().tickBeat();
    expect(store.getState().view.tick).toBe(2);
  });

  it('toggles between playing and paused', () => {
    const store = make();
    store.getState().toggle();
    expect(store.getState().playing).toBe(true);
    store.getState().toggle();
    expect(store.getState().playing).toBe(false);
  });

  it('keeps the speed inside the choices', () => {
    const store = make();
    store.getState().setSpeed(99);
    expect(store.getState().speedIndex).toBe(SPEEDS.length - 1);
    store.getState().setSpeed(-4);
    expect(store.getState().speedIndex).toBe(0);
  });

  it('skips ahead to a time of day, and never backwards', () => {
    const store = make();
    store.getState().skipTo(WORK_START);
    expect(store.getState().view.minute).toBe(WORK_START);
    store.getState().skipTo(WORK_START - 30);
    expect(store.getState().view.minute).toBe(WORK_START);
    store.getState().skipTo(WORK_END);
    expect(store.getState().view.phase).toBe('AFTER_HOURS');
    store.getState().skipTo(EOD_START);
    expect(store.getState().view.phase).toBe('EOD');
  });

  it('plays to midnight, stops, and opens the day report', () => {
    const store = make();
    store.getState().skipToEndOfDay();
    const s = store.getState();
    expect(s.view.dayOver).toBe(true);
    expect(s.view.minute).toBe(DAY_END);
    expect(s.playing).toBe(false);
    expect(s.reportOpen).toBe(true);
    expect(s.view.history).toHaveLength(1);
    s.play();
    expect(store.getState().playing).toBe(false);
  });

  it('stops playing by itself when the last beat of the day is played', () => {
    const store = make();
    store.getState().skipTo(DAY_END - 2);
    store.getState().play();
    store.getState().tickBeat();
    expect(store.getState().view.dayOver).toBe(true);
    expect(store.getState().playing).toBe(false);
    expect(store.getState().reportOpen).toBe(true);
  });

  it('starts the next day with the rules the learner chose', () => {
    const store = make();
    store.getState().skipToEndOfDay();
    store.getState().setDraftRule('frictionlessBelow', 55);
    store.getState().applyDraft();
    expect(store.getState().notice?.message).toMatch(/next day/);
    store.getState().startNextDay();
    const s = store.getState();
    expect(s.view.day).toBe(2);
    expect(s.view.minute).toBe(7 * 60);
    expect(s.view.rules.frictionlessBelow).toBe(55);
    expect(s.reportOpen).toBe(false);
    expect(s.view.event.id).toBe('PROMO');
  });
});

describe('looking at things', () => {
  it('selects departments, desks and people, and clears the selection', () => {
    const store = make();
    store.getState().select({ kind: 'department', id: 'SECURITY' });
    expect(store.getState().selection).toEqual({ kind: 'department', id: 'SECURITY' });
    store.getState().select({ kind: 'worker', station: 'SEC_3DS', workerId: 'w_sec_3ds_1' });
    expect(store.getState().selection.kind).toBe('worker');
    store.getState().clearSelection();
    expect(store.getState().selection).toEqual({ kind: 'none' });
  });

  it('knows which processes a desk takes part in', () => {
    expect(processesAt('SEC_3DS')).toEqual(['B', 'F']);
    expect(processesAt('LEDGER_DEBIT')).toEqual(['A', 'B', 'C', 'E']);
    expect(processesAt('RECON')).toEqual(['D', 'F']);
    expect(processesAt('GATE_POS').length).toBeGreaterThan(0);
  });

  it('books temporary cover and says so when a desk is full', () => {
    const store = make();
    store.getState().addCover('SEC_3DS');
    store.getState().addCover('SEC_3DS');
    expect(store.getState().notice).toBeNull();
    expect(store.getState().view.stations.SEC_3DS.workers.filter((w) => w.temp)).toHaveLength(2);
    store.getState().addCover('SEC_3DS');
    expect(store.getState().notice?.kind).toBe('warn');
  });
});

describe('the Learning Hub and the rules being tried out', () => {
  it('opens on a process, pauses the clock, and closes again', () => {
    const store = make();
    store.getState().play();
    store.getState().openHub('C');
    expect(store.getState().hubOpen).toBe(true);
    expect(store.getState().hubProcess).toBe('C');
    expect(store.getState().playing).toBe(false);
    store.getState().setHubProcess('D');
    expect(store.getState().hubProcess).toBe('D');
    store.getState().closeHub();
    expect(store.getState().hubOpen).toBe(false);
  });

  it('tries rules out without touching the bank, and clamps them', () => {
    const store = make();
    store.getState().setDraftRule('frictionlessBelow', 30);
    store.getState().setDraftRule('dcvvWindowSec', 9999);
    expect(store.getState().draftRules.frictionlessBelow).toBe(30);
    expect(store.getState().draftRules.dcvvWindowSec).toBe(150);
    expect(store.getState().sim.rules.frictionlessBelow).toBe(40);
  });

  it('puts the tried rules into the bank when applied, and can go back', () => {
    const store = make();
    store.getState().setDraftRule('bnplMinScore', 650);
    store.getState().applyDraft();
    expect(store.getState().view.rules.bnplMinScore).toBe(650);
    store.getState().setDraftRule('bnplMinScore', 500);
    store.getState().resetDraft();
    expect(store.getState().draftRules.bnplMinScore).toBe(650);
  });

  it('says so when there is nothing to apply', () => {
    const store = make();
    store.getState().applyDraft();
    expect(store.getState().notice?.message).toMatch(/already running/);
  });

  it('plays tomorrow under the tried rules and lines the numbers up', async () => {
    vi.useFakeTimers();
    try {
      const store = make();
      store.getState().setDraftRule('frictionlessBelow', 20);
      store.getState().runComparison(1);
      expect(store.getState().comparisonStatus).toBe('running');
      await vi.advanceTimersByTimeAsync(100);
      const s = store.getState();
      expect(s.comparisonStatus).toBe('done');
      expect(s.comparison?.startDay).toBe(2);
      expect(s.comparison?.changed).toEqual(['frictionlessBelow']);
      expect(s.comparison?.rows.find((r) => r.def.id === 'challengeRate')!.delta).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('saving', () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it('starts out with nothing saved', () => {
    expect(make(storage).getState().saveStatus).toBe('pristine');
    expect(storage.getItem(BANK_KEY)).toBeNull();
  });

  it('saves when a day ends, as the start of the next day, and a reload picks up from there', () => {
    const a = make(storage);
    a.getState().skipToEndOfDay();
    expect(a.getState().saveStatus).toBe('saved');
    const saved = decodeBank(storage.getItem(BANK_KEY));
    expect(saved?.day).toBe(2);
    expect(saved?.history).toHaveLength(1);
    expect(saved?.carry.suspense.length).toBeGreaterThan(0);

    const b = make(storage);
    const s = b.getState();
    expect(s.view.day).toBe(2);
    expect(s.view.history).toHaveLength(1);
    expect(s.view.suspense.items).toBe(saved!.carry.suspense.length);
    expect(s.notice?.message).toMatch(/day 2/);
  });

  it('keeps the rules across a reload', () => {
    const a = make(storage);
    a.getState().setDraftRule('reconToleranceCents', 25);
    a.getState().applyDraft();
    const b = make(storage);
    expect(b.getState().view.rules.reconToleranceCents).toBe(25);
    expect(b.getState().view.day).toBe(1);
  });

  it('a reload in the middle of a day starts that day again from 07:00', () => {
    const a = make(storage);
    a.getState().skipToEndOfDay();
    a.getState().startNextDay();
    a.getState().skipTo(13 * 60);
    const b = make(storage);
    expect(b.getState().view.day).toBe(2);
    expect(b.getState().view.minute).toBe(7 * 60);
  });

  it('forgets everything on reset', () => {
    const a = make(storage);
    a.getState().skipToEndOfDay();
    a.getState().resetBank();
    expect(storage.getItem(BANK_KEY)).toBeNull();
    expect(a.getState().view.day).toBe(1);
    expect(a.getState().view.history).toHaveLength(0);
    expect(make(storage).getState().view.day).toBe(1);
  });

  it('works without storage and says so', () => {
    const s = make(null).getState();
    expect(s.saveStatus).toBe('unavailable');
  });

  it('reports a full or blocked store instead of failing', () => {
    const broken: KeyValueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    };
    const store = make(broken);
    store.getState().skipToEndOfDay();
    expect(store.getState().saveStatus).toBe('error');
    expect(store.getState().view.dayOver).toBe(true);
  });
});

describe('what comes back from storage is never trusted', () => {
  const good = () => {
    const store = make(memoryStorage());
    store.getState().skipToEndOfDay();
    return JSON.parse(encodeBank({ seed: 7, day: 2, rules: DEFAULT_RULES, history: store.getState().view.history, carry: store.getState().sim.carryState() }, 'now')) as Record<string, any>;
  };
  const load = (value: unknown) => decodeBank(JSON.stringify(value));

  it('round-trips a good save', () => {
    const saved = good();
    const back = load(saved)!;
    expect(back.day).toBe(2);
    expect(back.history).toHaveLength(1);
    expect(back.carry.backlog.length + back.carry.suspense.length).toBeGreaterThan(0);
  });

  it('rejects junk, other versions and impossible days', () => {
    expect(decodeBank(null)).toBeNull();
    expect(decodeBank('not json')).toBeNull();
    expect(decodeBank('[]')).toBeNull();
    expect(load({ ...good(), version: 99 })).toBeNull();
    expect(load({ ...good(), day: 0 })).toBeNull();
    expect(load({ ...good(), day: -3 })).toBeNull();
    expect(load({ ...good(), day: 1.5 })).toBeNull();
    expect(load({ ...good(), seed: 'x' })).toBeNull();
  });

  it('clamps rules and falls back to the defaults for missing ones', () => {
    expect(load({ ...good(), rules: { frictionlessBelow: 5000, dcvvWindowSec: 'x' } })!.rules).toMatchObject({ frictionlessBelow: 75, dcvvWindowSec: 60 });
    expect(load({ ...good(), rules: null })!.rules).toEqual(DEFAULT_RULES);
  });

  it('drops reports that are not shaped like reports', () => {
    const saved = good();
    const broken = structuredClone(saved.history[0]);
    delete broken.kpis.threeDs;
    const unknownEvent = structuredClone(saved.history[0]);
    unknownEvent.event.id = 'ALIENS';
    const nan = structuredClone(saved.history[0]);
    nan.kpis.arrivals = 'many';
    const back = load({ ...saved, history: [saved.history[0], broken, unknownEvent, nan, 7, null] })!;
    expect(back.history).toHaveLength(1);
  });

  it('drops carried records that are not shaped like records, and caps how many it takes', () => {
    const saved = good();
    const suspense = [
      { id: 'a', amountCents: 500, reason: 'SUSP_MISSING_LEG', day: 1 },
      { id: 'b', amountCents: -5, reason: 'x', day: 1 },
      { id: '', amountCents: 5, reason: 'x', day: 1 },
      { id: 'c', amountCents: 5, reason: 'x', day: 0 },
      'junk',
    ];
    const backlog = [
      { txId: 'tx_1', cardType: 'DEBIT', amountCents: 100, heldCents: 100, bornDay: 1, place: 'RECON' },
      { txId: 'tx_2', cardType: 'GOLD', amountCents: 100, heldCents: 100, bornDay: 1, place: 'RECON' },
      { txId: 'tx_3', cardType: 'DEBIT', amountCents: 100, heldCents: 100, bornDay: 1, place: 'MOON' },
      { txId: 'tx_4', cardType: 'DEBIT', amountCents: Number.NaN, heldCents: 100, bornDay: 1, place: 'RECON' },
    ];
    const back = load({ ...saved, carry: { suspense, backlog } })!;
    expect(back.carry.suspense.map((i) => i.id)).toEqual(['a']);
    expect(back.carry.backlog.map((i) => i.txId)).toEqual(['tx_1']);
    const many = Array.from({ length: 6000 }, (_, i) => ({ id: `s${i}`, amountCents: 1, reason: 'x', day: 1 }));
    expect(load({ ...saved, carry: { suspense: many, backlog: [] } })!.carry.suspense).toHaveLength(3000);
  });

  it('survives a hostile store when the app opens', () => {
    const storage = memoryStorage({ [BANK_KEY]: '{"version":1,"seed":7,"day":3,"history":[{"day":1}],"carry":{"suspense":"x","backlog":7}}' });
    const s = make(storage).getState();
    expect(s.view.day).toBe(3);
    expect(s.view.history).toHaveLength(0);
    expect(s.view.suspense.items).toBe(0);
  });

  it('loads nothing when storage throws', () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(loadBank(throwing)).toBeNull();
    expect(saveBank(null, { seed: 1, day: 1, rules: DEFAULT_RULES, history: [], carry: { suspense: [], backlog: [] } }, FIXED)).toBe('unavailable');
  });
});

describe('moving a dial while tomorrow is being played out', () => {
  it('plays again when the dials changed during the run, so the numbers never describe old rules', async () => {
    vi.useFakeTimers();
    try {
      const store = make();
      store.getState().setDraftRule('frictionlessBelow', 20);
      store.getState().runComparison(1);
      // The learner moves the dial again while the first run is still going.
      store.getState().setDraftRule('frictionlessBelow', 70);
      store.getState().runComparison(1);
      expect(store.getState().comparisonStatus).toBe('running');
      await vi.advanceTimersByTimeAsync(400);
      const s = store.getState();
      expect(s.comparisonStatus).toBe('done');
      expect(s.comparison?.tweakedRules.frictionlessBelow).toBe(70);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not run twice when the dials did not change', async () => {
    vi.useFakeTimers();
    try {
      const store = make();
      store.getState().setDraftRule('bnplMinScore', 600);
      store.getState().runComparison(1);
      store.getState().runComparison(1);
      await vi.advanceTimersByTimeAsync(400);
      const first = store.getState().comparison;
      expect(store.getState().comparisonStatus).toBe('done');
      expect(first?.tweakedRules.bnplMinScore).toBe(600);
      await vi.advanceTimersByTimeAsync(400);
      expect(store.getState().comparison).toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the relaxed clock', () => {
  it('has six speeds from slow-mo to 10x, and starts on Relaxed', () => {
    expect(SPEEDS.map((s) => s.label)).toEqual(['0.25×', '0.5×', '1×', '2×', '5×', '10×']);
    expect(SPEEDS[DEFAULT_SPEED_INDEX]).toMatchObject({ label: '1×', name: 'Relaxed' });
    expect(make().getState().speedIndex).toBe(DEFAULT_SPEED_INDEX);
  });

  it('gives a beat of the working day about a second and a half at Relaxed, and scales with the speed', () => {
    expect(beatMs('WORKING', 1)).toBe(1500);
    expect(beatMs('EOD', 1)).toBe(1500);
    expect(beatMs('WORKING', 0.25)).toBe(6000);
    expect(beatMs('WORKING', 10)).toBe(150);
  });

  it('jumps to 23:00 and keeps playing so the night cycle can be watched', () => {
    const store = make();
    store.getState().jumpToEod();
    const s = store.getState();
    expect(s.view.minute).toBe(EOD_START);
    expect(s.view.phase).toBe('EOD');
    expect(s.playing).toBe(true);
    expect(s.notice?.message).toMatch(/23:00/);
  });

  it('does nothing when it is already night, or the day is over', () => {
    const store = make();
    store.getState().jumpToEod();
    const tick = store.getState().view.tick;
    store.getState().jumpToEod();
    expect(store.getState().view.tick).toBe(tick);
    store.getState().skipToEndOfDay();
    store.getState().jumpToEod();
    expect(store.getState().view.dayOver).toBe(true);
    expect(store.getState().playing).toBe(false);
  });
});

describe('the look of the bank', () => {
  it('opens in Fintech Expert words on the 2D map', () => {
    const s = make().getState();
    expect(s.termMode).toBe('expert');
    expect(s.viewMode).toBe('2d');
  });

  it('remembers Beginner words and the 3D office for next time', () => {
    const storage = memoryStorage();
    const a = make(storage);
    a.getState().setTermMode('beginner');
    a.getState().setViewMode('3d');
    expect(JSON.parse(storage.getItem(PREFS_KEY) ?? '{}')).toEqual({ terms: 'beginner', view: '3d' });
    const b = make(storage);
    expect(b.getState().termMode).toBe('beginner');
    expect(b.getState().viewMode).toBe('3d');
  });

  it('ignores a saved preference it does not recognise, one choice at a time', () => {
    expect(decodePrefs('{"terms":"klingon","view":"3d"}')).toEqual({ terms: 'expert', view: '3d' });
    expect(decodePrefs('not json')).toEqual({ terms: 'expert', view: '2d' });
    expect(decodePrefs(null)).toEqual({ terms: 'expert', view: '2d' });
    expect(loadPrefs(null)).toEqual({ terms: 'expert', view: '2d' });
  });

  it('keeps the preferences apart from the saved bank', () => {
    const storage = memoryStorage();
    const a = make(storage);
    a.getState().setTermMode('beginner');
    a.getState().resetBank();
    expect(make(storage).getState().termMode).toBe('beginner');
  });
});

describe('Learn & Explore (the guided tour)', () => {
  it('starts in the view the learner is in, with the clock stopped and locked to the slowest speed', () => {
    const store = make();
    store.getState().setViewMode('3d');
    store.getState().setSpeed(4);
    store.getState().play();
    store.getState().startSpotlight('A');
    const s = store.getState();
    expect(s.spotlight).toMatchObject({ process: 'A', exampleId: 'fresh', step: 0, intro: true, auto: false });
    expect(s.viewMode).toBe('3d');
    expect(s.playing).toBe(false);
    expect(s.speedIndex).toBe(SLOWEST_SPEED_INDEX);
    expect(s.selection).toEqual({ kind: 'none' });
  });

  it('refuses a speed change during the tour, and gives back everything when it ends', () => {
    const store = make();
    store.getState().setViewMode('3d');
    store.getState().setSpeed(4);
    store.getState().play();
    store.getState().startSpotlight('B');
    store.getState().setSpeed(5);
    expect(store.getState().speedIndex).toBe(SLOWEST_SPEED_INDEX);
    store.getState().exitSpotlight();
    const s = store.getState();
    expect(s.spotlight).toBeNull();
    expect(s.speedIndex).toBe(4);
    expect(s.viewMode).toBe('3d');
    expect(s.playing).toBe(true);
  });

  it('carries on at the same step when the learner switches between the 2D map and the 3D office', () => {
    const store = make();
    store.getState().startSpotlight('A');
    store.getState().beginSpotlight();
    store.getState().spotlightGo(2);
    store.getState().setViewMode('3d');
    expect(store.getState().viewMode).toBe('3d');
    expect(store.getState().spotlight).toMatchObject({ process: 'A', step: 2, intro: false });
    store.getState().setViewMode('2d');
    expect(store.getState().spotlight?.step).toBe(2);
    expect(store.getState().speedIndex).toBe(SLOWEST_SPEED_INDEX);
  });

  it('does not open the inspector over a lesson: selecting while a tour runs is ignored, clearing is not', () => {
    const store = make();
    store.getState().startSpotlight('B');
    store.getState().select({ kind: 'station', id: 'SEC_3DS' });
    expect(store.getState().selection).toEqual({ kind: 'none' });
    store.getState().exitSpotlight();
    store.getState().select({ kind: 'station', id: 'SEC_3DS' });
    expect(store.getState().selection).toEqual({ kind: 'station', id: 'SEC_3DS' });
    store.getState().startSpotlight('B');
    expect(store.getState().selection).toEqual({ kind: 'none' });
  });

  it('leaves the learner’s remembered view alone', () => {
    const storage = memoryStorage();
    const store = make(storage);
    store.getState().setViewMode('3d');
    store.getState().startSpotlight('C');
    expect(loadPrefs(storage).view).toBe('3d');
    expect(store.getState().viewMode).toBe('3d');
  });

  it('keeps the original settings when the tour moves from one process to another', () => {
    const store = make();
    store.getState().setSpeed(3);
    store.getState().startSpotlight('A');
    store.getState().startSpotlight('D');
    store.getState().exitSpotlight();
    expect(store.getState().speedIndex).toBe(3);
  });

  it('falls back to the default example when asked for one that does not exist', () => {
    const store = make();
    store.getState().startSpotlight('B', 'nonsense');
    expect(store.getState().spotlight?.exampleId).toBe('borderline');
    store.getState().startSpotlight('B', 'walkaway');
    expect(store.getState().spotlight?.exampleId).toBe('walkaway');
  });

  it('shows the briefing first; stepping only works once the token has set off', () => {
    const store = make();
    store.getState().startSpotlight('A');
    store.getState().spotlightNext();
    expect(store.getState().spotlight?.step).toBe(0);
    store.getState().beginSpotlight();
    expect(store.getState().spotlight?.intro).toBe(false);
    store.getState().spotlightNext();
    expect(store.getState().spotlight?.step).toBe(1);
    store.getState().spotlightPrev();
    store.getState().spotlightPrev();
    expect(store.getState().spotlight?.step).toBe(0);
  });

  it('never runs past the last step', () => {
    const store = make();
    store.getState().startSpotlight('A');
    store.getState().beginSpotlight();
    const last = spotPlan('A', 'fresh').steps.length - 1;
    store.getState().spotlightGo(999);
    // It stops at the first question it has not been answered.
    expect(store.getState().spotlight?.step).toBeLessThanOrEqual(last);
  });

  it('stops the token at a decision until the question is answered', () => {
    const store = make();
    store.getState().startSpotlight('B', 'calm');
    store.getState().beginSpotlight();
    const plan = spotPlan('B', 'calm');
    const first = quizzesOf(plan)[0];
    expect(first).toBeDefined();
    store.getState().spotlightGo(first!.step);
    expect(store.getState().spotlight?.step).toBe(first!.step);
    expect(quizPending(store.getState().spotlight, store.getState().sim.rules)).toBe(true);
    store.getState().spotlightNext();
    expect(store.getState().spotlight?.step).toBe(first!.step);
    store.getState().answerQuiz(first!.correct);
    expect(store.getState().spotlight?.answers[first!.step]).toEqual({ picked: first!.correct, correct: true });
    expect(quizPending(store.getState().spotlight, store.getState().sim.rules)).toBe(false);
    store.getState().spotlightNext();
    expect(store.getState().spotlight?.step).toBe(first!.step + 1);
  });

  it('marks a wrong answer wrong, keeps only the first answer, and still lets the tour go on', () => {
    const store = make();
    store.getState().startSpotlight('A');
    store.getState().beginSpotlight();
    const quiz = quizzesOf(spotPlan('A', 'fresh'))[0]!;
    store.getState().spotlightGo(quiz.step);
    const wrong = quiz.correct === 0 ? 1 : 0;
    store.getState().answerQuiz(wrong);
    store.getState().answerQuiz(quiz.correct);
    expect(store.getState().spotlight?.answers[quiz.step]).toEqual({ picked: wrong, correct: false });
    store.getState().spotlightNext();
    expect(store.getState().spotlight?.step).toBe(quiz.step + 1);
  });

  it('rejects an answer that is not one of the options', () => {
    const store = make();
    store.getState().startSpotlight('A');
    store.getState().beginSpotlight();
    const quiz = quizzesOf(spotPlan('A', 'fresh'))[0]!;
    store.getState().spotlightGo(quiz.step);
    store.getState().answerQuiz(99);
    store.getState().answerQuiz(-1);
    store.getState().answerQuiz(0.5);
    expect(store.getState().spotlight?.answers).toEqual({});
  });

  it('plays again from the start when auto-play is pressed at the end', () => {
    const store = make();
    store.getState().startSpotlight('D', 'clean');
    store.getState().beginSpotlight();
    const plan = spotPlan('D', 'clean');
    for (const q of quizzesOf(plan)) {
      store.getState().spotlightGo(q.step);
      store.getState().answerQuiz(q.correct);
    }
    store.getState().spotlightGo(plan.steps.length - 1);
    expect(store.getState().spotlight?.step).toBe(plan.steps.length - 1);
    store.getState().setSpotlightAuto(true);
    expect(store.getState().spotlight).toMatchObject({ step: 0, auto: true, answers: {} });
  });

  it('shows the briefing again when the learner picks another example', () => {
    const store = make();
    store.getState().startSpotlight('A');
    store.getState().beginSpotlight();
    store.getState().spotlightGo(2);
    store.getState().setSpotlightExample('slow');
    expect(store.getState().spotlight).toMatchObject({ exampleId: 'slow', step: 0, intro: true, answers: {} });
    store.getState().setSpotlightExample('no-such-example');
    expect(store.getState().spotlight?.exampleId).toBe('slow');
  });

  it('jumps the tour to the first step at a desk', () => {
    const store = make();
    store.getState().startSpotlight('A');
    store.getState().beginSpotlight();
    store.getState().spotlightFocus('SEC_VAULT');
    expect(spotPlan('A', 'fresh').steps[store.getState().spotlight?.step ?? -1]?.place).toBe('SEC_VAULT');
    // A desk the tour never visits leaves it where it is.
    const at = store.getState().spotlight?.step;
    store.getState().spotlightFocus('RECON');
    expect(store.getState().spotlight?.step).toBe(at);
  });

  it('ends when the learner plays, steps, skips, opens the hub or starts over', () => {
    const run = (act: (s: ReturnType<typeof make>) => void) => {
      const store = make();
      store.getState().startSpotlight('A');
      act(store);
      expect(store.getState().spotlight).toBeNull();
      expect(store.getState().speedIndex).toBe(DEFAULT_SPEED_INDEX);
    };
    run((s) => s.getState().play());
    run((s) => s.getState().step());
    run((s) => s.getState().skipTo(WORK_START));
    run((s) => s.getState().jumpToEod());
    run((s) => s.getState().openHub('A'));
    run((s) => s.getState().resetBank());
  });

  it('has a worked example for every process, and every lesson example has a plan', () => {
    for (const lesson of Object.values(LESSONS)) {
      for (const example of lesson.examples) {
        const store = make();
        store.getState().startSpotlight(lesson.id, example.id);
        expect(store.getState().spotlight?.exampleId).toBe(example.id);
      }
    }
  });
});

describe('the ledger drawer', () => {
  it('starts shut, opens and closes, and never touches the simulation', () => {
    const store = make();
    expect(store.getState().ledgerOpen).toBe(false);
    store.getState().toggleLedger();
    expect(store.getState().ledgerOpen).toBe(true);
    expect(store.getState().view.tick).toBe(0);
    store.getState().toggleLedger();
    expect(store.getState().ledgerOpen).toBe(false);
    store.getState().toggleLedger();
    store.getState().closeLedger();
    expect(store.getState().ledgerOpen).toBe(false);
  });

  it('shows the day’s lines as the bank plays, and the books agree at every beat', () => {
    const store = make();
    expect(store.getState().view.ledger.lines).toBe(0);
    let seen = 0;
    for (let i = 0; i < 160 && !store.getState().sim.dayOver; i++) {
      store.getState().step();
      const l = store.getState().view.ledger;
      expect(l.trial.balanced).toBe(true);
      expect(l.lines).toBeGreaterThanOrEqual(seen);
      seen = l.lines;
    }
    const l = store.getState().view.ledger;
    expect(l.lines).toBeGreaterThan(0);
    expect(l.recent.length).toBe(Math.min(l.lines, 40));
    // Newest first, so the drawer can put the latest payment on top.
    const stamps = l.recent.map((e) => e.timestamp);
    expect([...stamps].sort((a, b) => b - a)).toEqual(stamps);
  });

  it('steps aside for a guided tour and for the learning hub', () => {
    const store = make();
    store.getState().toggleLedger();
    store.getState().startSpotlight('A');
    expect(store.getState().ledgerOpen).toBe(false);
    store.getState().exitSpotlight();
    store.getState().toggleLedger();
    store.getState().openHub('B');
    expect(store.getState().ledgerOpen).toBe(false);
  });

  it('empties with a new day, because each day keeps its own books', () => {
    const store = make();
    store.getState().skipToEndOfDay();
    const day1 = store.getState().view.ledger.lines;
    expect(day1).toBeGreaterThan(50);
    store.getState().dismissReport();
    store.getState().startNextDay();
    expect(store.getState().view.ledger.lines).toBe(0);
    expect(store.getState().view.ledger.trial.balanced).toBe(true);
  });
});

describe('resetting the day', () => {
  const play = (store: ReturnType<typeof make>, beats: number): void => {
    for (let i = 0; i < beats; i++) store.getState().step();
  };

  it('puts the same day back at the 07:00 start, paused, with nothing selected', () => {
    const store = make();
    play(store, 40);
    store.getState().select({ kind: 'station', id: 'GATE_POS' });
    store.getState().play();
    expect(store.getState().view.minute).toBeGreaterThan(8 * 60);
    store.getState().resetDay();
    const s = store.getState();
    expect(s.view.day).toBe(1);
    expect(s.view.minute).toBe(7 * 60);
    expect(s.view.tick).toBe(0);
    expect(s.playing).toBe(false);
    expect(s.selection).toEqual({ kind: 'none' });
    expect(s.view.ledger.lines).toBe(0);
    expect(s.notice?.message).toMatch(/Day 1 is back at 07:00/);
  });

  it('replays exactly the same day: the same customers, the same numbers', () => {
    const store = make();
    play(store, 70);
    const first = store.getState().view.kpis;
    store.getState().resetDay();
    play(store, 70);
    expect(store.getState().view.kpis).toEqual(first);
  });

  it('keeps earlier days and what they carried over, and drops today’s own report', () => {
    const store = make();
    store.getState().skipToEndOfDay();
    store.getState().dismissReport();
    store.getState().startNextDay();
    expect(store.getState().view.day).toBe(2);
    const carried = store.getState().view.suspense;
    store.getState().skipToEndOfDay();
    expect(store.getState().view.history.map((h) => h.day)).toEqual([1, 2]);
    store.getState().resetDay();
    const s = store.getState();
    expect(s.view.day).toBe(2);
    expect(s.view.dayOver).toBe(false);
    expect(s.view.history.map((h) => h.day)).toEqual([1]);
    expect(s.view.suspense).toEqual(carried);
    expect(s.reportOpen).toBe(false);
  });

  it('keeps the rules the learner has now, so a dial plus a reset answers "what would this day have been?"', () => {
    const store = make();
    play(store, 40);
    store.getState().setDraftRule('frictionlessBelow', 20);
    store.getState().applyDraft();
    const rules = { ...store.getState().sim.rules };
    store.getState().resetDay();
    expect(store.getState().sim.rules).toEqual(rules);
    expect(store.getState().draftRules).toEqual(rules);
  });

  it('is saved, so a reload after a reset opens on the same 07:00 start', () => {
    const storage = memoryStorage();
    const a = make(storage);
    a.getState().skipToEndOfDay();
    a.getState().dismissReport();
    a.getState().startNextDay();
    play(a, 30);
    a.getState().resetDay();
    const b = make(storage);
    expect(b.getState().view.day).toBe(2);
    expect(b.getState().view.minute).toBe(7 * 60);
    expect(b.getState().view.history.map((h) => h.day)).toEqual([1]);
  });

  it('ends a guided tour instead of fighting it for the clock', () => {
    const store = make();
    play(store, 5);
    store.getState().startSpotlight('A');
    expect(store.getState().spotlight).not.toBeNull();
    store.getState().resetDay();
    expect(store.getState().spotlight).toBeNull();
  });
});

describe('the Academy (Course Catalog)', () => {
  it('opens and closes the catalog without touching the clock or the tour', () => {
    const store = make();
    store.getState().setSpeed(3);
    expect(store.getState().academyOpen).toBe(false);
    store.getState().openAcademy();
    expect(store.getState().academyOpen).toBe(true);
    expect(store.getState().speedIndex).toBe(3);
    expect(store.getState().spotlight).toBeNull();
    store.getState().closeAcademy();
    expect(store.getState().academyOpen).toBe(false);
  });

  it('"Start Chapter" closes the catalog, starts the tour on the briefing and locks the speed to 0.25×', () => {
    const store = make();
    store.getState().setSpeed(4);
    store.getState().play();
    store.getState().openAcademy();
    store.getState().startChapter('C');
    const s = store.getState();
    expect(s.academyOpen).toBe(false);
    expect(s.spotlight).toMatchObject({ process: 'C', step: 0, intro: true });
    expect(s.speedIndex).toBe(SLOWEST_SPEED_INDEX);
    expect(SPEEDS[s.speedIndex]?.factor).toBe(0.25);
    expect(s.playing).toBe(false);
    store.getState().exitSpotlight();
    expect(store.getState().speedIndex).toBe(4);
  });

  it('starts every one of the six chapters, in either view', () => {
    expect(PROCESS_IDS).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    for (const view of ['2d', '3d'] as const) {
      for (const id of PROCESS_IDS) {
        const store = make();
        store.getState().setViewMode(view);
        store.getState().startChapter(id);
        expect(store.getState().spotlight?.process).toBe(id);
        expect(store.getState().viewMode).toBe(view);
      }
    }
  });

  it('can start a chapter on a chosen example, and falls back to the default for one that does not exist', () => {
    const store = make();
    store.getState().startChapter('F', 'proof');
    expect(store.getState().spotlight?.exampleId).toBe('proof');
    store.getState().startChapter('E', 'nonsense');
    expect(store.getState().spotlight?.exampleId).toBe('split');
  });

  it('shuts the catalog when the Rule Lab opens, and the other way round', () => {
    const store = make();
    store.getState().openAcademy();
    store.getState().openHub('B');
    expect(store.getState().academyOpen).toBe(false);
    expect(store.getState().hubOpen).toBe(true);
    store.getState().openAcademy();
    expect(store.getState().hubOpen).toBe(false);
    expect(store.getState().academyOpen).toBe(true);
  });
});

describe('the time scrubber', () => {
  const at = (minute: number) => {
    const sim = new BankSimulation({ seed: 7, day: 1 });
    sim.stepUntil(minute);
    return sim.snapshot();
  };

  it('jumps forward to 12:00 with the clock, the KPIs and the ledger exactly where playing would have put them', () => {
    const store = make();
    store.getState().scrubTo(12 * 60);
    const v = store.getState().view;
    const expected = at(12 * 60);
    expect(v.minute).toBe(expected.minute);
    expect(v.kpis).toEqual(expected.kpis);
    expect(v.ledger).toEqual(expected.ledger);
  });

  it('goes back too: the same day is replayed from 07:00 with the same customers, up to the time asked for', () => {
    const store = make();
    store.getState().scrubTo(15 * 60);
    store.getState().scrubTo(10 * 60);
    const v = store.getState().view;
    const expected = at(10 * 60);
    expect(v.minute).toBe(expected.minute);
    expect(v.kpis).toEqual(expected.kpis);
    expect(v.ledger).toEqual(expected.ledger);
    expect(v.day).toBe(1);
  });

  it('runs the night cycle when taken to 23:00, and closes the day with its report at 24:00', () => {
    const store = make();
    store.getState().scrubTo(EOD_START);
    expect(store.getState().view.minute).toBe(EOD_START);
    expect(store.getState().view.dayOver).toBe(false);
    store.getState().scrubTo(DAY_END);
    expect(store.getState().view.dayOver).toBe(true);
    expect(store.getState().reportOpen).toBe(true);
    expect(store.getState().view.history).toHaveLength(1);
  });

  it('can take a finished day back to the evening, dropping only today’s report', () => {
    const store = make();
    store.getState().skipToEndOfDay();
    expect(store.getState().view.dayOver).toBe(true);
    store.getState().scrubTo(22 * 60);
    const s = store.getState();
    expect(s.view.dayOver).toBe(false);
    expect(s.view.minute).toBe(22 * 60);
    expect(s.view.history).toHaveLength(0);
    expect(s.reportOpen).toBe(false);
  });

  it('keeps the time inside the day, does nothing for the time already shown, and ends a tour', () => {
    const store = make();
    store.getState().scrubTo(2);
    expect(store.getState().view.minute).toBe(7 * 60);
    store.getState().scrubTo(11 * 60);
    const tick = store.getState().view.tick;
    store.getState().scrubTo(11 * 60);
    expect(store.getState().view.tick).toBe(tick);
    store.getState().startSpotlight('A');
    store.getState().scrubTo(13 * 60);
    expect(store.getState().spotlight).toBeNull();
    expect(store.getState().view.minute).toBe(13 * 60);
  });
});

describe('3D labels and the inspector width', () => {
  it('starts with every badge showing and the inspector at its usual width', () => {
    const s = make().getState();
    expect(s.labelMode).toBe('always');
    expect(s.inspectorWidth).toBe(INSPECTOR_WIDTH.default);
  });

  it('switches the 3D badges to Hover Only and remembers it, apart from the other preferences', () => {
    const storage = memoryStorage();
    const a = make(storage);
    a.getState().setLabelMode('hover');
    expect(a.getState().labelMode).toBe('hover');
    expect(JSON.parse(storage.getItem(UI_PREFS_KEY) ?? '{}')).toMatchObject({ labels: 'hover' });
    expect(make(storage).getState().labelMode).toBe('hover');
    expect(JSON.parse(storage.getItem(PREFS_KEY) ?? '{}')).not.toHaveProperty('labels');
  });

  it('remembers which workstation the pointer is over, and ignores a repeat', () => {
    const store = make();
    store.getState().setHoverPlace('RECON');
    const view = store.getState().view;
    store.getState().setHoverPlace('RECON');
    expect(store.getState().hoverPlace).toBe('RECON');
    expect(store.getState().view).toBe(view);
    store.getState().setHoverPlace(null);
    expect(store.getState().hoverPlace).toBeNull();
  });

  it('keeps the inspector between 360 and 600 pixels wide, and remembers the width', () => {
    const storage = memoryStorage();
    const a = make(storage);
    a.getState().setInspectorWidth(9999);
    expect(a.getState().inspectorWidth).toBe(600);
    a.getState().setInspectorWidth(10);
    expect(a.getState().inspectorWidth).toBe(360);
    a.getState().setInspectorWidth(480.4);
    expect(a.getState().inspectorWidth).toBe(480);
    expect(make(storage).getState().inspectorWidth).toBe(480);
  });

  it('decodes saved UI preferences one choice at a time, falling back on anything odd', () => {
    expect(decodeUiPrefs(null)).toEqual({ labels: 'always', inspectorWidth: INSPECTOR_WIDTH.default, scope: 'advanced', flow: 1 });
    expect(decodeUiPrefs('not json')).toEqual({ labels: 'always', inspectorWidth: INSPECTOR_WIDTH.default, scope: 'advanced', flow: 1 });
    expect(decodeUiPrefs('[1,2]')).toEqual({ labels: 'always', inspectorWidth: INSPECTOR_WIDTH.default, scope: 'advanced', flow: 1 });
    expect(decodeUiPrefs('{"labels":"sometimes","inspectorWidth":500}')).toEqual({ labels: 'always', inspectorWidth: 500, scope: 'advanced', flow: 1 });
    expect(decodeUiPrefs('{"labels":"hover","inspectorWidth":"wide"}')).toEqual({ labels: 'hover', inspectorWidth: INSPECTOR_WIDTH.default, scope: 'advanced', flow: 1 });
    expect(decodeUiPrefs('{"labels":"hover","inspectorWidth":2000}')).toEqual({ labels: 'hover', inspectorWidth: 600, scope: 'advanced', flow: 1 });
  });
});

describe('saved day reports and the night shift', () => {
  it('keeps who worked the night through a save and a load, and still loads reports saved before there was a rota', () => {
    const storage = memoryStorage();
    const a = make(storage);
    a.getState().skipToEndOfDay();
    const report = a.getState().view.history.at(-1);
    expect(report?.nightShift?.crew.length).toBeGreaterThan(0);
    const loaded = loadBank(storage);
    expect(loaded?.history.at(-1)?.nightShift).toEqual(report?.nightShift);
    const raw = JSON.parse(storage.getItem(BANK_KEY) ?? '{}');
    for (const r of raw.history) delete r.nightShift;
    storage.setItem(BANK_KEY, JSON.stringify(raw));
    const old = loadBank(storage);
    expect(old?.history.length).toBe(1);
    expect(old?.history[0]?.nightShift).toBeUndefined();
    raw.history[0].nightShift = { crew: [{ id: 1 }], resting: [], records: 1, left: 0, completion: 1, finishedAt: null };
    storage.setItem(BANK_KEY, JSON.stringify(raw));
    expect(loadBank(storage)?.history[0]?.nightShift).toBeUndefined();
  });
});

describe('saved day reports and the books', () => {
  it('keeps the reserves and customer books through a save and a load, and drops a malformed one', () => {
    const storage = memoryStorage();
    const a = make(storage);
    a.getState().skipToEndOfDay();
    const report = a.getState().view.history.at(-1);
    expect(report?.book?.reservesStartCents).toBe(10_000_000);
    expect(loadBank(storage)?.history.at(-1)?.book).toEqual(report?.book);
    const raw = JSON.parse(storage.getItem(BANK_KEY) ?? '{}');
    raw.history[0].book = { reservesStartCents: 'lots' };
    storage.setItem(BANK_KEY, JSON.stringify(raw));
    const loaded = loadBank(storage);
    expect(loaded?.history).toHaveLength(1);
    expect(loaded?.history[0]?.book).toBeUndefined();
  });
});
