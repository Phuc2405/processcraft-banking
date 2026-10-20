import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../bankPersistence';
import { ACADEMY_KEY, createAcademyStore } from '../academyStore';
import { simulateFlow } from '../academySync';
import { createBankStore } from '../bankStore';

const bank = () => createBankStore({ storage: memoryStorage(), now: () => new Date('2026-10-14T00:00:00Z'), seed: 7 });

describe('Academy Focus Mode', () => {
  it('starts off, and is never restored from storage', () => {
    expect(createAcademyStore({ storage: null }).getState().isMaximized).toBe(false);
    const storage = memoryStorage();
    const a = createAcademyStore({ storage });
    a.getState().setMaximized(true);
    expect(JSON.parse(storage.getItem(ACADEMY_KEY) ?? '{}')).not.toHaveProperty('isMaximized');
    expect(createAcademyStore({ storage }).getState().isMaximized).toBe(false);
  });

  it('entering opens the panel; closing the panel leaves Focus Mode', () => {
    const a = createAcademyStore({ storage: null });
    a.getState().toggleMaximized();
    expect(a.getState()).toMatchObject({ isMaximized: true, isSplitScreenOpen: true });
    a.getState().toggleSplitScreen();
    expect(a.getState()).toMatchObject({ isMaximized: false, isSplitScreenOpen: false });
    a.getState().setMaximized(true);
    a.getState().setSplitScreen(false);
    expect(a.getState()).toMatchObject({ isMaximized: false, isSplitScreenOpen: false });
  });

  it('leaving Focus Mode keeps the split view open', () => {
    const a = createAcademyStore({ storage: null });
    a.getState().setMaximized(true);
    a.getState().toggleMaximized();
    expect(a.getState()).toMatchObject({ isMaximized: false, isSplitScreenOpen: true });
  });

  it('Simulate this Flow from Focus Mode minimizes the reader and plays the flow on the map', () => {
    const a = createAcademyStore({ storage: null });
    const b = bank();
    a.getState().setMaximized(true);
    simulateFlow(a, b, 1);
    expect(a.getState()).toMatchObject({ isMaximized: false, isSplitScreenOpen: false });
    expect(b.getState().flow).toBe(1);
  });
});
