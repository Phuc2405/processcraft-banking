/**
 * Regression suite: the hover card's step context is scenario-aware, map-wide (Flows 01-09, 2D and 3D share StationTooltip).
 *   - Idle (a sub-process lit, no demo running): a place shows its role (📌 task, 💡 run a scenario), never a static "Step X/Y", so
 *     two entry desks of one step no longer both read "Step 1/5".
 *   - A demo running: a place on that scenario's route shows "👉 [Scenario: name] - Step X/Y", counted on that route alone.
 *   - A place off the running scenario's route shows no step banner at all.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BankMap } from '../../../components/bank/BankMap';
import { hopSources } from '../../../components/bank/hopDriver';
import { executeDemo } from '../../../components/bank/retailOpsActions';
import { StationTooltip } from '../../../components/bank/StationTooltip';
import { setActiveLocale } from '../../../i18n/localeCore';
import { bankStore } from '../../../store/bankStore';
import { demoSessionStore } from '../../../store/demoSessionStore';
import { hopPlayerStore } from '../../../store/hopPlayerStore';
import { FLOW_IDS } from '../../../types/viewport';
import { demoActionById } from '../../demoActions';
import { flowPlaces, GUIDED_FLOWS } from '../../guidedFlows';
import { cardContext, stopIndexOf, type DemoPath } from '../../hoverCard';
import { STATION_IDS, EXTERNAL_IDS, type PlaceId } from '../../topology';
import { freshBank } from './harness';

// Server rendering reads a zustand store's initial state: point each store the card reads at its live state.
type Api = { getState: () => unknown; getInitialState: () => unknown };
const stores = [bankStore, demoSessionStore, hopPlayerStore] as unknown as Api[];
const initials = stores.map((s) => s.getInitialState);
beforeAll(() => stores.forEach((s) => (s.getInitialState = s.getState)));
afterAll(() => stores.forEach((s, i) => (s.getInitialState = initials[i]!)));
beforeEach(() => freshBank());
afterEach(() => freshBank());

const ALL_PLACES: readonly PlaceId[] = [...STATION_IDS, ...EXTERNAL_IDS];
const FRACTION = /(Step|Bước) \d+\/\d+/;
const card = (place: PlaceId | 'LOADING_BAY'): string => renderToStaticMarkup(createElement(StationTooltip, { place }));

describe('idle sub-process: role badges, no static step numbers', () => {
  for (const flow of FLOW_IDS) {
    it(`Flow ${String(flow).padStart(2, '0')}: every place in the flow gets a numberless role, the map shows no "Step X/Y"`, () => {
      for (const place of GUIDED_FLOWS[flow].steps.flatMap((st) => st.places)) {
        const ctx = cardContext(flow, place, true, null);
        expect(ctx?.mode, place).toBe('role');
        expect(ctx && 'number' in ctx, place).toBe(false);
      }
      bankStore.getState().setActiveFlow(flow);
      const html = renderToStaticMarkup(createElement(BankMap));
      expect(html).not.toMatch(FRACTION);
      expect(html).toContain('📌 Process task:');
      expect(html).toContain('💡 Note:');
    });
  }

  it('in Vietnamese: 📌 Tác vụ quy trình and the 💡 Ghi chú hint, and no duplicate "Bước 1/5" on the multi-entry desks', () => {
    setActiveLocale('vi');
    // A step played by several desks (each used to read the same "Bước N/…").
    const flow = FLOW_IDS.find((f) => GUIDED_FLOWS[f].steps.some((st) => st.places.length > 1))!;
    const entry = GUIDED_FLOWS[flow].steps.find((st) => st.places.length > 1)!.places;
    bankStore.getState().setActiveFlow(flow);
    for (const place of entry) {
      const html = card(place);
      expect(html).toContain('📌 Tác vụ quy trình:');
      expect(html).toContain('💡 Ghi chú: Bấm &quot;Thực hiện&quot; kịch bản bên dưới để xem luồng chạy thực tế.');
      expect(html).not.toMatch(FRACTION);
    }
  });
});

describe('active demo: the step number counts the running scenario alone', () => {
  const path = (stops: PlaceId[], index = 0): DemoPath => ({ name: 'Case A', stops: stops.map((place) => ({ place, cit: null })), index });

  it('numbers a place by its position on the scenario route, out of that route’s own length', () => {
    const [a, b, c] = [...flowPlaces(1)];
    const demo = path([a!, b!, c!], 1);
    expect(cardContext(1, a!, true, demo)).toMatchObject({ mode: 'scenario', name: 'Case A', number: 1, total: 3, status: 'completed' });
    expect(cardContext(1, b!, true, demo)).toMatchObject({ number: 2, total: 3, status: 'in-progress' });
    expect(cardContext(1, c!, true, demo)).toMatchObject({ number: 3, total: 3, status: 'upcoming' });
  });

  it('gives a place off the route no banner, even one the lit flow has a step for', () => {
    const [a, b, off] = [...flowPlaces(1)];
    expect(cardContext(1, off!, true, path([a!, b!]))).toBeNull();
  });

  it('finds the CIT loading bay by its BAY stop, and a revisited place at the stop the run stands at', () => {
    const stops = [{ place: 'MAIN_CASH_VAULT' as PlaceId, cit: 'VAULT' as const }, { place: null, cit: 'BAY' as const }, { place: 'MAIN_CASH_VAULT' as PlaceId, cit: 'VAULT' as const }];
    expect(stopIndexOf(stops, 'LOADING_BAY', 0)).toBe(1);
    expect(stopIndexOf(stops, 'MAIN_CASH_VAULT', 2)).toBe(2);
    expect(stopIndexOf(stops, 'MAIN_CASH_VAULT', 1)).toBe(0);
    expect(stopIndexOf(stops, 'TELLER_CASH', 0)).toBe(-1);
  });

  it('renders "👉 [Scenario: name] - Step X/Y" on the real demo route, and nothing on places off it', () => {
    executeDemo('token-45');
    hopPlayerStore.getState().tick(0, hopSources());
    const run = demoSessionStore.getState().active;
    const session = hopPlayerStore.getState().session;
    expect(run?.name?.()).toBe(demoActionById('token-45').label());
    expect(session).not.toBeNull();
    const route = session!.stops.map((s) => s.place).filter((p): p is PlaceId => p !== null);
    const name = demoActionById('token-45').label();
    for (const place of route) {
      const html = card(place);
      expect(html, place).toContain('data-context="step"');
      expect(html, place).toContain(`👉 [Scenario: ${name}] - Step ${route.indexOf(place) + 1}/${route.length}:`);
    }
    for (const place of ALL_PLACES.filter((p) => !route.includes(p))) {
      const html = card(place);
      expect(html, place).toContain('data-context="idle"');
      expect(html, place).not.toMatch(FRACTION);
    }
  });

  it('drops back to the numberless role once the demo is over', () => {
    executeDemo('token-45');
    hopPlayerStore.getState().tick(0, hopSources());
    demoSessionStore.getState().finish();
    const place = [...flowPlaces(2)][0]!;
    expect(card(place)).toContain('data-context="role"');
    expect(card(place)).not.toMatch(FRACTION);
  });
});
