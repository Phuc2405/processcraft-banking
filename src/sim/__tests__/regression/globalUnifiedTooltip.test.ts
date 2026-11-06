/**
 * Regression suite: ONE hover card per place, map-wide, in every flow (01-09) and in 2D and 3D. While a flow is lit, a place that plays a
 * step in it opens a single card whose top is the step context (📌 sub-process, 👉 step) over a divider, and whose bottom is the place's
 * metrics; with no flow, the same single card without the banner. No second card, no native title popup, anywhere.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BankMap } from '../../../components/bank/BankMap';
import { StationTooltip } from '../../../components/bank/StationTooltip';
import { setActiveLocale } from '../../../i18n/localeCore';
import { bankStore } from '../../../store/bankStore';
import { useWireHoverStore } from '../../../store/wireHoverStore';
import { CIT_FLOW, FLOW_IDS, type FlowId } from '../../../types/viewport';
import { GUIDED_FLOWS, flowPlaces, stepAt } from '../../guidedFlows';
import { cardKind, cardStep, hoverCardPlace } from '../../hoverCard';
import { EXTERNAL_IDS, STATION_IDS, type PlaceId } from '../../topology';
import { src } from './harness';

// Server rendering reads a zustand store's initial state: point it at the live one, so the map renders the flow the test lit.
type Api = { getInitialState: () => unknown };
const api = bankStore as unknown as Api;
const initial = api.getInitialState;
beforeAll(() => void (api.getInitialState = bankStore.getState));
afterAll(() => void (api.getInitialState = initial));
afterEach(() => {
  setActiveLocale('en');
  bankStore.getState().setScope('advanced');
  bankStore.getState().setHoverPlace(null);
  useWireHoverStore.getState().set(null);
});

const ALL_PLACES: readonly PlaceId[] = [...STATION_IDS, ...EXTERNAL_IDS];

/** The 2D map, with `flow` lit (or none): every hover card it mounts, by place, with its context. */
function mapCards(flow: FlowId | null): { html: string; cards: Array<{ place: string; context: string }> } {
  if (flow === null) bankStore.getState().setScope('advanced');
  else bankStore.getState().setActiveFlow(flow);
  const html = renderToStaticMarkup(createElement(BankMap));
  const cards = [...html.matchAll(/data-testid="station-card" data-place="([^"]+)" data-kind="\w+" data-context="(\w+)"/g)].map((m) => ({ place: m[1]!, context: m[2]! }));
  return { html, cards };
}

const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

describe('one hover card per place on the 2D map, in every flow', () => {
  for (const flow of [null, ...FLOW_IDS] as const) {
    it(`${flow === null ? 'no flow lit' : `Flow ${String(flow).padStart(2, '0')}`}: every place mounts exactly one tooltip node, and nothing else is a tooltip`, () => {
      const { html, cards } = mapCards(flow);
      // Every place has its card, and only one.
      expect(cards.map((c) => c.place).sort()).toEqual([...ALL_PLACES].sort());
      // The map holds no other tooltip node: no step preview beside a desk card, no second cash card.
      expect(count(html, /role="tooltip"/g)).toBe(ALL_PLACES.length);
      expect(html).not.toContain('data-testid="step-preview-tip"');
      expect(html).not.toContain('data-testid="hover-tip"');
    });
  }

  it('lets no native browser title pop up over a place card (only the department frame labels and the legend button keep theirs)', () => {
    const { html } = mapCards(6);
    const titles = [...html.matchAll(/<(\w+)[^>]*\stitle="[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(titles.length).toBeGreaterThan(0);
    for (const tag of titles) expect(tag).toMatch(/data-testid="dept-|aria-label="🗺️ Map legend"/);
  });
});

describe('the card merges the step context with the place metrics', () => {
  for (const flow of FLOW_IDS) {
    it(`Flow ${String(flow).padStart(2, '0')}: a place in a step shows 📌 and 👉 over a divider, the rest show metrics only`, () => {
      const { html, cards } = mapCards(flow);
      for (const c of cards) {
        const place = c.place as PlaceId;
        const step = flowPlaces(flow).has(place) ? stepAt(flow, place) : null;
        expect(c.context, place).toBe(step ? 'step' : 'idle');
      }
      // A step's banner names the flow and the step, divided from the metrics underneath.
      const lit = cards.filter((c) => c.context === 'step');
      expect(lit.length).toBeGreaterThan(0);
      expect(count(html, /data-card="context"/g)).toBe(lit.length);
      expect(count(html, /data-card="metrics"/g)).toBe(ALL_PLACES.length);
      expect(html).toMatch(/class="[^"]*border-b border-slate-700\/50[^"]*"[^>]*data-card="context"/);
      expect(html).toContain(`📌 Process: ${GUIDED_FLOWS[flow].code}.`);
      const first = stepAt(flow, lit[0]!.place as PlaceId)!;
      expect(html).toContain(`👉 Step ${first.number}/${first.total}:`);
    });
  }

  it('reads 📌 Quy trình and 👉 Bước in Vietnamese', () => {
    setActiveLocale('vi');
    const { html } = mapCards(3);
    expect(html).toContain('📌 Quy trình:');
    expect(html).toContain('👉 Bước');
  });

  it('puts the cash metrics (TK 1111 / 1112 / 1131) under the step on the vault, and on the CIT bay', () => {
    bankStore.getState().setActiveFlow(CIT_FLOW);
    for (const place of ['MAIN_CASH_VAULT', 'LOADING_BAY'] as const) {
      const html = renderToStaticMarkup(createElement(StationTooltip, { place }));
      expect(count(html, /role="tooltip"/g)).toBe(1);
      expect(html).toContain('data-context="step"');
      expect(html.indexOf('data-card="context"')).toBeLessThan(html.indexOf('data-card="metrics"'));
      expect(html).toContain('data-account="VAULT"');
      expect(html).toContain('data-account="TRANSIT"');
    }
    // The bay is Flow 09's step 2 (cit_bay), though it has no PlaceId.
    expect(cardStep(CIT_FLOW, 'LOADING_BAY')?.number).toBe(2);
    expect(cardStep(6, 'LOADING_BAY')).toBeNull();
  });

  it('shows a desk its queue and status, and a channel its tally, under the same structure', () => {
    expect(cardKind('TELLER_CASH')).toBe('desk');
    expect(cardKind('OUT_SETTLED')).toBe('external');
    expect(cardKind('MAIN_CASH_VAULT')).toBe('cash');
    const desk = renderToStaticMarkup(createElement(StationTooltip, { place: 'AML_DESK' }));
    expect(desk).toContain('data-tip="status"');
    expect(desk).toContain('data-desk-status=');
    const out = renderToStaticMarkup(createElement(StationTooltip, { place: 'OUT_SETTLED' }));
    expect(out).toContain('Total so far');
  });

  it('drops the banner when no flow is lit', () => {
    bankStore.getState().setScope('advanced');
    for (const place of ALL_PLACES) expect(cardStep(null, place)).toBeNull();
    const html = renderToStaticMarkup(createElement(StationTooltip, { place: 'MAIN_CASH_VAULT' }));
    expect(html).toContain('data-context="idle"');
    expect(html).not.toContain('data-card="context"');
  });
});

describe('the 3D office has one card host for every place', () => {
  it('maps whatever its hover handlers dispatch to exactly one place', () => {
    for (const p of ALL_PLACES) expect(hoverCardPlace(p, null)).toBe(p);
    expect(hoverCardPlace(null, 'BAY')).toBe('LOADING_BAY');
    expect(hoverCardPlace(null, null)).toBeNull();
    // A desk under the pointer wins over a stale bay node: still one card.
    expect(hoverCardPlace('TELLER_CASH', 'BAY')).toBe('TELLER_CASH');
  });

  it('mounts the host once, and no other 3D tooltip anywhere', () => {
    expect(src('components/bank/office/OfficeScene.tsx').match(/<StationTooltip3D \/>/g)).toHaveLength(1);
    const host = src('components/bank/office/StationTooltip3D.tsx');
    expect(host).toMatch(/hoverCardPlace\(hover, node\)/);
    expect(host).toMatch(/<StationTooltip place=\{place\}/);
    for (const f of ['Desk3D.tsx', 'AtmKiosk.tsx', 'VaultCash3D.tsx', 'LoadingBay3D.tsx', 'FlowStage3D.tsx', 'Dressing.tsx']) {
      const code = src(`components/bank/office/${f}`);
      expect(code, f).not.toContain('role="tooltip"');
      expect(code, f).not.toMatch(/DeskTooltip3D|StepPreviewBody|CashStationTip|HoverPreview/);
    }
    // The desk badge and the bay label no longer carry a native title beside the card.
    expect(src('components/bank/office/Desk3D.tsx')).not.toContain('title={STATIONS[id].name}');
    expect(src('components/bank/office/LoadingBay3D.tsx')).not.toContain("title={m('bayOpen')}");
  });

  it('the 2D map renders its card through the same component, and the old tooltips are gone', () => {
    const map = src('components/bank/BankMap.tsx');
    expect(map).not.toMatch(/function HoverTip|function StepPreviewTip/);
    expect(map.match(/<MapCard /g)!.length).toBe(4);
    expect(src('components/bank/CitBay2D.tsx')).toContain('<StationTooltip place="LOADING_BAY"');
  });
});
