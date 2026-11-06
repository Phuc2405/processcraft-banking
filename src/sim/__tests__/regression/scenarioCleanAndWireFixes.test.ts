/**
 * Clean demo stages and precise wires, across Flows 01-09:
 *   1. the moving 💵 badges ride a layer above the cards (never clipped), and no hop draws a stray diagonal (vault → ATM);
 *   2. a demo's stage shows only its own route: off-route wires are not drawn, the till rebalance never lights the CIT hall, its
 *      van status or the hall handover, and one token carries its cash;
 *   3. a demo's start, end or cancel leaves 0 customers and "0 waiting" on every desk, with no background spawn after it.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { CashLinesView } from '../../../components/bank/CashLines2D';
import { bayLit } from '../../../components/bank/CitBay2D';
import { cancelDemo, deskView, installDemoSession, offRouteOpacity, postScenarioCleanup, preScenarioReset, stageIsolated } from '../../../components/bank/DemoSession';
import { hopPath2D } from '../../../components/bank/hopGeometry2D';
import { executeDemo } from '../../../components/bank/retailOpsActions';
import { CitBusyBadge } from '../../../components/ops/CitPanel';
import { cashWirePoints } from '../../../engine/plan/layout';
import { bankStore } from '../../../store/bankStore';
import { demoSessionStore } from '../../../store/demoSessionStore';
import { deskVisitStore } from '../../../store/deskVisitStore';
import { hopPlayerStore } from '../../../store/hopPlayerStore';
import { onStage, vaultFlowStore } from '../../../store/vaultFlowStore';
import { setActiveLocale } from '../../../i18n/locale';
import { CIT_FLOW, FLOW_IDS } from '../../../types/viewport';
import type { Pt } from '../../../types/geometry';
import { CASH_WIRES, FLOW_WIRES, GROUP_WIRES, litWires, type CashWire } from '../../cashWires';
import { CIT_DEMOS } from '../../citEngine';
import { CIT_STOPS, citChildStops } from '../../citRoute';
import { DEMO_GROUPS } from '../../demoGroups';
import { STATION_IDS } from '../../topology';
import type { VaultCashFlow } from '../../vaultFlows';
import { at, freshBank, playDemoToEnd, src } from './harness';

beforeEach(freshBank);

const orthogonal = (pts: readonly Pt[]): boolean => pts.slice(1).every((p, i) => p[0] === pts[i]![0] || p[1] === pts[i]![1]);
const stop = (id: keyof typeof CIT_STOPS) => ({ place: CIT_STOPS[id].place, cit: id });
const waitingOnStage = (): number => STATION_IDS.reduce((n, st) => n + deskView().stations[st].queueLength, 0);
const flowOf = (endpoint: CashWire, source: VaultCashFlow['source'] = 'retail'): VaultCashFlow => ({ endpoint: endpoint as VaultCashFlow['endpoint'], dir: 'OUT', source, id: `t-${endpoint}`, cents: 100 });

describe('§1 token badges are never clipped, and no stray vault wire', () => {
  it('draws the moving 💵 on its own layer above the cards (z 31, overflow visible), outside the wires layer', () => {
    const html = renderToStaticMarkup(createElement(CashLinesView, { flows: [flowOf('ATM')] }));
    const [lines, tokens] = html.split('data-testid="cash-tokens"');
    expect(tokens, 'a token layer').toBeDefined();
    expect(lines).not.toContain('cash-icon-ATM');
    expect(tokens).toContain('data-testid="cash-icon-ATM"');
    expect(html).toMatch(/z-\[31\] overflow-visible[^>]*style="overflow:visible"[^>]*data-testid="cash-tokens"/);
    // cards sit at z 20: the token layer is above them, the wires below.
    expect(html).toContain('z-[11]');
  });

  it('runs every hop between cash stations on its gold right-angle line, and strokes nothing for a hop with no wire', () => {
    for (const w of CASH_WIRES) expect(orthogonal(cashWirePoints(w)), w).toBe(true);
    expect(hopPath2D(stop('VAULT'), stop('ATM'))).toEqual({ points: [...cashWirePoints('ATM')], wired: true });
    expect(hopPath2D(stop('ATM'), stop('VAULT')).points).toEqual([...cashWirePoints('ATM')].reverse());
    expect(hopPath2D(stop('BAY'), stop('TELLER')).points).toEqual([...cashWirePoints('BAY_TELLER')]);
    // The van's leg from the bay to the machine has no wire: no diagonal stroke from the vault's corner to the ATM.
    expect(hopPath2D(stop('BAY'), stop('ATM')).wired).toBe(false);
    for (const child of CIT_DEMOS) {
      const stops = citChildStops(child);
      for (let i = 1; i < stops.length; i++) {
        const p = hopPath2D(stop(stops[i - 1]!), stop(stops[i]!));
        if (p.wired) expect(orthogonal(p.points), `${child} ${stops[i - 1]}→${stops[i]}`).toBe(true);
      }
    }
    expect(src('components/bank/HopBadge.tsx')).toContain('{wired && <polyline');
  });
});

describe('§2 a demo’s stage shows only its own route (Flows 01-09)', () => {
  const scenarios = [
    ...DEMO_GROUPS.map((g) => ({ name: `${g.flow}/${g.id}`, route: litWires(g.flow, null, null, g.id) })),
    ...CIT_DEMOS.map((c) => ({ name: `9/${c}`, route: litWires(CIT_FLOW, c, null) })),
  ];

  it.each(scenarios.map((s) => [s.name, s.route] as const))('%s: draws only its lit cash wires, and no token off them', (_name, route) => {
    const html = renderToStaticMarkup(createElement(CashLinesView, { flows: CASH_WIRES.filter((w) => w !== 'BAY_TELLER').map((w) => flowOf(w)), route, isolated: true }));
    for (const w of CASH_WIRES) {
      const lit = route?.has(w) ?? false;
      expect(html.includes(`data-cash-line="${w}"`), `${w} line`).toBe(lit);
      if (w !== 'BAY_TELLER') expect(html.includes(`cash-icon-${w}"`), `${w} token`).toBe(lit);
    }
  });

  it('hides payment wires off the route on a demo’s stage instead of dimming them', () => {
    expect(offRouteOpacity(true)).toBe(0);
    expect(offRouteOpacity(false)).toBe(0.15);
    const map = src('components/bank/BankMap.tsx');
    expect(map).toContain('if (!shown && isolated) return null;');
    expect(map).toContain('if (!labelShown && isolated) return null;');
    expect(map).toContain('!isolated && dimMoves.length > 0');
  });

  it('lights each cash sub-process’s own line only: the savings closure and collateral lock none, CTR and the till the teller line', () => {
    expect(litWires(6, null, null, 'term-deposit')).toBeNull();
    expect(litWires(6, null, null, 'collateral')).toBeNull();
    expect(litWires(6, null, null, 'cash-ctr')).toEqual(new Set(['TELLER']));
    expect(litWires(6, null, null, 'teller-vault')).toEqual(new Set(['TELLER']));
    for (const g of DEMO_GROUPS) for (const w of GROUP_WIRES[g.id] ?? []) expect(FLOW_WIRES[g.flow], `${g.id} ${w}`).toContain(w);
    for (const f of FLOW_IDS) if (!FLOW_WIRES[f]) for (const g of DEMO_GROUPS.filter((x) => x.flow === f)) expect(litWires(f, null, null, g.id), g.id).toBeNull();
  });

  it('09 till rebalance: vault ↔ till alone, the CIT hall never lit, no van status, one cash token', () => {
    expect(citChildStops('TELLER')).not.toContain('BAY');
    expect(litWires(CIT_FLOW, 'TELLER', null)).toEqual(new Set(['TELLER']));
    expect(bayLit('TELLER')).toBe(false);
    for (const c of ['ATM', 'DOORSTEP', 'SBV'] as const) expect(bayLit(c), c).toBe(true);
    setActiveLocale('vi');
    const till = renderToStaticMarkup(createElement(CitBusyBadge, { stage: 'EN_ROUTE', van: false }));
    expect(till).not.toContain('Xe CIT đang vận chuyển');
    expect(till).not.toContain('🚚');
    expect(till).toContain('Đang điều chuyển quỹ nội bộ');
    expect(renderToStaticMarkup(createElement(CitBusyBadge, { stage: 'EN_ROUTE' }))).toContain('Xe CIT đang vận chuyển');
    // One token on the Xuất/Nhập quỹ ➔ Quầy GDV wire: the custodian on foot (no second 💵), or the hop player's own icon (none here).
    const run: VaultCashFlow = { ...flowOf('TELLER', 'cit'), dir: 'IN' };
    const route = litWires(CIT_FLOW, 'TELLER', null);
    const walked = renderToStaticMarkup(createElement(CashLinesView, { flows: [run], route, isolated: true }));
    expect((walked.match(/data-testid="cash-(icon|walker)-/g) ?? []).length).toBe(1);
    expect(walked).not.toContain('data-cash-line="BAY_TELLER"');
    expect(walked).not.toContain('data-cash-line="BAY"');
    expect(renderToStaticMarkup(createElement(CashLinesView, { flows: [run], route, isolated: true, hopIcon: true }))).not.toMatch(/cash-(icon|walker)-/);
  });

  it('lets an automatic vault crossing light on a demo’s stage only on its own route', () => {
    const teller = flowOf('TELLER');
    expect(onStage(teller), 'live bank').toBe(true);
    bankStore.getState().selectSubProcess('term-deposit', 6);
    preScenarioReset();
    expect(onStage(teller), 'savings closure: no till top-up').toBe(false);
    bankStore.getState().selectSubProcess('cash-ctr', 6);
    expect(onStage(teller), 'CTR withdrawal: its till top-up').toBe(true);
    expect(onStage(flowOf('ATM'))).toBe(false);
  });
});

describe('§3 start, end or cancel: 0 customers, 0 waiting, no spawn after', () => {
  /** A busy, playing bank: customers queue at the desks before the demo. */
  const busyBank = (): void => {
    at(10 * 60);
    bankStore.getState().play();
    for (let i = 0; i < 6; i++) bankStore.getState().tickBeat();
    expect(STATION_IDS.reduce((n, st) => n + bankStore.getState().view.stations[st].queueLength, 0)).toBeGreaterThan(0);
  };

  it('clears the stage the moment a demo is about to start: paused, nobody at the counters, 0 waiting', () => {
    busyBank();
    preScenarioReset();
    expect(bankStore.getState().playing).toBe(false);
    expect(deskVisitStore.getState().visits).toEqual([]);
    expect(stageIsolated()).toBe(true);
    expect(waitingOnStage()).toBe(0);
  });

  it.each(['teller-12k', 'td-break-10k', 'td-mature-close'] as const)('%s: completes silently, leaving 0 avatars and 0 waiting until Play', (id) => {
    const stop = installDemoSession();
    try {
      busyBank();
      executeDemo(id);
      playDemoToEnd();
      hopPlayerStore.getState().reset();
      expect(demoSessionStore.getState().active).toBeNull();
      const visits = deskVisitStore.getState().visits.length;
      const flows = vaultFlowStore.getState().retail.length;
      expect(visits, 'no customer avatar after completion').toBe(0);
      expect(waitingOnStage(), 'no queue after completion').toBe(0);
      // Nothing spawns after it: the clock stays paused and the stage stays clean.
      expect(bankStore.getState().playing).toBe(false);
      expect(deskVisitStore.getState().visits).toHaveLength(0);
      expect(vaultFlowStore.getState().retail).toHaveLength(flows);
      expect(stageIsolated()).toBe(true);
      bankStore.getState().play();
      expect(stageIsolated(), 'Play hands the stage back to the live bank').toBe(false);
    } finally {
      stop();
    }
  });

  it('cancel and completion share one silent cleanup that purges every entity and spawns none', () => {
    busyBank();
    executeDemo('teller-12k');
    expect(deskVisitStore.getState().visits.length).toBeGreaterThan(0);
    cancelDemo();
    expect(deskVisitStore.getState().visits).toEqual([]);
    expect(vaultFlowStore.getState().retail).toEqual([]);
    expect(waitingOnStage()).toBe(0);
    const session = src('components/bank/DemoSession.tsx');
    expect(session).toContain('if (active && !demoRunning(active)) postScenarioCleanup();');
    expect(session.match(/export function postScenarioCleanup\(\): void \{[\s\S]*?\n\}/)![0]).not.toMatch(/start\(|arrive\(|play\(|push\(/);
    postScenarioCleanup();
    expect(deskVisitStore.getState().visits).toEqual([]);
  });
});
