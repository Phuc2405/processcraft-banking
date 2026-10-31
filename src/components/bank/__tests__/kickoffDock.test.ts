import { describe, expect, it } from 'vitest';
import { createBankStore, floatingBarsHiddenOf, kickoffOpenOf } from '../../../store/bankStore';

const dock = import.meta.glob(['../ViewportControls.tsx', '../office/Office3D.tsx', '../DayReportModal.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('the floating dock and the weather bar stand aside for the day’s report', () => {
  it('is hidden while the report is open, back when it closes, and the report sits above the map’s bars', () => {
    const store = createBankStore();
    expect(floatingBarsHiddenOf(store.getState())).toBe(false);
    store.setState({ reportOpen: true });
    expect(floatingBarsHiddenOf(store.getState())).toBe(true);
    store.setState({ reportOpen: false });
    expect(floatingBarsHiddenOf(store.getState())).toBe(false);
    // Over the weather bar (z-45) and the dock (z-40), under the language switch (z-60) and the workspace (z-70).
    expect(dock['../DayReportModal.tsx']).toContain('fixed inset-0 z-[55]');
  });
});

describe('the floating dock and the weather bar stand aside for a tour’s kickoff card', () => {
  it('is hidden while the kickoff card is open', () => {
    const store = createBankStore();
    expect(kickoffOpenOf(store.getState())).toBe(false);
    store.getState().startSpotlight('A');
    expect(store.getState().spotlight?.intro).toBe(true);
    expect(kickoffOpenOf(store.getState())).toBe(true);
  });

  it('is back the moment the tour starts ("Start the tour"), for the whole of its steps', () => {
    const store = createBankStore();
    store.getState().startSpotlight('A');
    store.getState().beginSpotlight();
    expect(store.getState().spotlight).not.toBeNull();
    expect(kickoffOpenOf(store.getState())).toBe(false);
    store.getState().spotlightGo(1);
    expect(kickoffOpenOf(store.getState())).toBe(false);
  });

  it('is hidden again when another example re-opens the briefing, and back once the tour ends', () => {
    const store = createBankStore();
    store.getState().startSpotlight('B');
    store.getState().beginSpotlight();
    store.getState().startSpotlight('A');
    expect(kickoffOpenOf(store.getState())).toBe(true);
    store.getState().exitSpotlight();
    expect(store.getState().spotlight).toBeNull();
    expect(kickoffOpenOf(store.getState())).toBe(false);
  });

  it('wires the rule into the dock and the weather bar, and lets go of their measured places while hidden', () => {
    const controls = dock['../ViewportControls.tsx']!;
    expect(controls).toContain('const kickoff = useBankStore(floatingBarsHiddenOf);');
    expect(controls).toContain('if (kickoff) topBand.setState({ dock: null });');
    expect(controls).toContain('if (kickoff) return null;');
    const office = dock['../office/Office3D.tsx']!;
    expect(office).toContain('{!kickoff && <WeatherControls compact={tight} />}');
    // The random weather goes on changing while its controls are away.
    expect(office).toContain('<RandomWeather />');
  });
});
