/**
 * Regression suite: the child scenario's soft-dimming and the sidebar's three knowledge tiers.
 * - Picking a child demo (ATM Withdrawal, Declined 61) soft-dims the desks of its sub-process it does not cross to 35%, in 2D and 3D,
 *   never hides them, and "👁️ Show all desks" brings them back to full opacity.
 * - Every desk, gate and machine (and the CIT Loading Bay) has a "Think of it like" picture and a technical deep-dive, in both languages.
 * - Standard shows the picture and the acronyms; Expert keeps both and adds the deep-dive.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BankMap } from '../../../components/bank/BankMap';
import { deskFocus, DIM } from '../../../components/bank/office/focus3d';
import { PlaceKnowledge } from '../../../components/education/PlaceKnowledge';
import { DEEP_DIVE_ASPECTS, deepDive, placePicture, type KnowledgePlace } from '../../../data/stationKnowledge';
import { setActiveLocale } from '../../../i18n/localeCore';
import { activeFlowOf, bankStore, focusSubOf } from '../../../store/bankStore';
import { activeChildPlaces, CHILD_DIM, childFocusStore, childPlacesNow } from '../../../store/childFocusStore';
import { acronymsIn } from '../../../components/bank/codeGlossary';
import { childPlaces, groupScope } from '../../demoGroups';
import { isStation, STATION_IDS } from '../../topology';
import { src } from './harness';

// Server rendering reads a zustand store's initial state: point both stores at their live state.
type Api = { getInitialState: () => unknown; getState: () => unknown };
const stores = [bankStore, childFocusStore] as unknown as Api[];
const initials = stores.map((s) => s.getInitialState);
beforeAll(() => stores.forEach((s) => (s.getInitialState = s.getState)));
afterAll(() => stores.forEach((s, i) => (s.getInitialState = initials[i]!)));
afterEach(() => {
  childFocusStore.getState().reset();
  bankStore.getState().setScope('advanced');
  setActiveLocale('en');
});

const ALL: readonly KnowledgePlace[] = [...STATION_IDS, 'BAY'];

/** Flow 03, sub-process ATM & NAPAS, with the Declined-61 withdrawal picked. */
function pickAtm61(): void {
  bankStore.getState().selectSubProcess('atm-napas', 3);
  childFocusStore.getState().pick('atm-61');
}

/** The 2D map's place cards: which carry the child dim. */
function dimmedOnMap(): Set<string> {
  const html = renderToStaticMarkup(createElement(BankMap));
  const out = new Set<string>();
  for (const m of html.matchAll(/<[^>]*data-child-dim="true"[^>]*>/g)) {
    const place = /data-place="([A-Z_]+)"/.exec(m[0])?.[1];
    if (place) out.add(place);
    expect(m[0]).toContain(`opacity:${CHILD_DIM}`);
  }
  return out;
}

describe('child scenario soft-dimming', () => {
  it('the picked child crosses only part of its sub-process', () => {
    const child = childPlaces('atm-61')!;
    const scope = groupScope('atm-napas').places;
    expect([...child].every((p) => scope.has(p))).toBe(true);
    expect([...scope].some((p) => !child.has(p))).toBe(true);
    expect(child.has('ATM_CASH')).toBe(true);
    expect(child.has('OUT_DECLINED')).toBe(true);
  });

  it('dims the desks of the sub-process the child does not cross to 35% in 2D, and nothing it crosses or outside the scope', () => {
    pickAtm61();
    const child = childPlaces('atm-61')!;
    const scope = groupScope('atm-napas').places;
    const expected = new Set([...scope].filter((p) => !child.has(p)));
    expect(CHILD_DIM).toBe(0.35);
    expect(dimmedOnMap()).toEqual(expected);
  });

  it('dims the same desks to 35% in 3D, keeps the route at full opacity, and leaves the rest of the bank at the flow dim', () => {
    pickAtm61();
    const s = bankStore.getState();
    const child = childPlacesNow();
    expect(child).toBe(childPlaces('atm-61'));
    const scope = groupScope('atm-napas').places;
    for (const id of STATION_IDS) {
      const want = !scope.has(id) ? DIM.flow : child!.has(id) ? 1 : CHILD_DIM;
      expect(deskFocus(id, null, activeFlowOf(s), focusSubOf(s), child), id).toBe(want);
    }
  });

  it('"Show all desks" restores every desk of the sub-process to full opacity', () => {
    pickAtm61();
    expect(dimmedOnMap().size).toBeGreaterThan(0);
    childFocusStore.getState().reset();
    expect(childPlacesNow()).toBeNull();
    expect(dimmedOnMap().size).toBe(0);
    const s = bankStore.getState();
    for (const p of groupScope('atm-napas').places) if (isStation(p)) expect(deskFocus(p, null, activeFlowOf(s), focusSubOf(s), childPlacesNow()), p).toBe(1);
  });

  it('a pick from another flow or sub-process, or no lit flow, dims nothing', () => {
    childFocusStore.getState().pick('atm-61');
    bankStore.getState().setActiveFlow(1);
    expect(childPlacesNow()).toBeNull();
    bankStore.getState().setScope('advanced');
    expect(activeChildPlaces(bankStore.getState(), 'atm-61')).toBeNull();
  });

  it('every demo run and the dropdown pick set the child; the dock offers the reset', () => {
    expect(src('components/bank/retailOpsActions.ts').match(/childFocusStore\.getState\(\)\.pick\(id\)/g)?.length).toBe(2);
    const dock = src('components/bank/PresetDock.tsx');
    expect(dock).toContain('childFocusStore.getState().pick(action.id)');
    expect(dock).toContain('data-testid="show-all-desks"');
    expect(src('components/bank/retailOps.messages.ts')).toContain('Hiển thị tất cả quầy quy trình mẹ');
  });
});

describe('Think of it like: every place', () => {
  it.each(['en', 'vi'] as const)('every station, gate, machine and the CIT bay has a non-empty picture (%s)', (locale) => {
    for (const place of ALL) {
      const p = placePicture(place, locale);
      expect(p, place).not.toBeNull();
      expect(p!.title.trim().length, place).toBeGreaterThan(3);
      expect(p!.hook.trim().length, place).toBeGreaterThan(20);
      expect(p!.glyph, place).toBeTruthy();
    }
  });

  it.each(['en', 'vi'] as const)('every place has all three deep-dive aspects (%s)', (locale) => {
    for (const place of ALL) for (const a of DEEP_DIVE_ASPECTS) expect(deepDive(place, a, locale).trim().length, `${place} ${a}`).toBeGreaterThan(30);
  });

  it('the deep-dive response codes match ISO 8583 (00, 51, 61, 68)', () => {
    expect(deepDive('LEDGER_DEBIT', 'message', 'en')).toMatch(/00 approved.*51 insufficient funds.*61 exceeds the daily withdrawal limit/);
    expect(deepDive('ATM_CASH', 'message', 'en')).toContain('61 exceeds the daily withdrawal limit');
    expect(deepDive('GATE_POS', 'ledger', 'en')).toMatch(/RC 68.*0400\/0420 reversal/);
  });
});

/** The sidebar's knowledge tiers for one place, as rendered. */
function tiers(place: KnowledgePlace, expert: boolean, locale: 'en' | 'vi' = 'en'): { think: boolean; acronyms: boolean; deep: boolean; html: string } {
  setActiveLocale(locale);
  const html = renderToStaticMarkup(createElement(PlaceKnowledge, { place, text: '', expert }));
  return { think: html.includes('data-section="think-of-it-like"'), acronyms: html.includes('data-testid="acronym-notes"'), deep: html.includes('data-section="deep-dive"'), html };
}

describe('Standard and Expert sidebars', () => {
  it('Standard shows the picture and the acronyms, without the deep-dive', () => {
    for (const place of ALL) {
      const t = tiers(place, false);
      expect(t.think, place).toBe(true);
      expect(t.deep, place).toBe(false);
    }
    expect(tiers('SEC_VAULT', false).acronyms).toBe(true);
  });

  it.each(['en', 'vi'] as const)('Expert keeps the picture and the acronyms and adds the deep-dive, at every place (%s)', (locale) => {
    for (const place of ALL) {
      const t = tiers(place, true, locale);
      expect(t, place).toMatchObject({ think: true, acronyms: true, deep: true });
      // In that order: 1. picture, 2. acronyms, 3. deep-dive.
      const i = [t.html.indexOf('think-of-it-like'), t.html.indexOf('acronym-notes'), t.html.indexOf('data-section="deep-dive"')];
      expect(i, place).toEqual([...i].sort((a, b) => a - b));
    }
  });

  it('Expert explains the ISO 8583 terms of its deep-dive', () => {
    const keys = acronymsIn(DEEP_DIVE_ASPECTS.map((a) => deepDive('LEDGER_DEBIT', a, 'en')).join(' ') + ' ' + deepDive('GATE_VIRTUAL', 'message', 'en'), 'en').map((a) => a.key);
    expect(keys).toEqual(expect.arrayContaining(['DE', 'STAN', 'RRN', 'MTI', 'RC', 'CASA']));
    expect(tiers('GATE_POS', true).html).toContain('data-acronym="ISO8583"');
  });

  it('the Inspector and the Loading Bay render the tiers for both vocabularies, never gated on Standard', () => {
    const inspector = src('components/bank/Inspector.tsx');
    expect(inspector).toContain('<PlaceKnowledge place={id}');
    expect(inspector).toContain('expert={!terms.beginner}');
    expect(inspector).not.toMatch(/terms\.beginner && .*MentalModelCard/);
    expect(src('components/ops/LoadingBayPanel.tsx')).toContain('<PlaceKnowledge place="BAY"');
  });
});

