/**
 * The ultimate master pass: the parent Flow 09 sheet without a run button, the menu without CIT pills, no "welcome back" toast over
 * the Day 1 banner, the wire labels in padded badges on the wire, the station-hover wire highlight (2D and 3D) with the bay ↔ teller
 * handover and the flow 03 / 06 cash wires, the forced SBV deposit badge, the one execution-lock guard on every outside trigger,
 * the Step button animating a paused payment, the retail-ops chunk, the Flow 08 accounting lesson and the pooled 3D sparks.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CashLinesView } from '../../components/bank/CashLines2D';
import { demoLocked, guarded } from '../../components/bank/DemoSession';
import { hopFrozen } from '../../components/bank/hopDriver';
import { ARC_PEAK, endpointXZ, wirePoint } from '../../components/bank/office/VaultCash3D';
import { ObjectPool } from '../../components/bank/office/webglSafety';
import { executeDemo, simulateGuidedFlow } from '../../components/bank/retailOpsActions';
import { MENU_CHOICES } from '../../components/bank/SubProcessMenu';
import { dispatchCitDemo } from '../../components/ops/citActions';
import { SbvBadge } from '../../components/ops/CitPanel';
import { SubProcessInfoView } from '../../components/ops/SubProcessInfoDrawer';
import { AML_ARTICLE } from '../../data/amlKnowledge';
import { CIT_INFO_KEYS } from '../../data/subProcessKeys';
import { subProcessInfo } from '../../data/subProcessRegistry';
import { BAY_TELLER_LINE, CIT_BAY, PLACE_BOX } from '../../engine/plan/layout';
import { LOADING_DOOR } from '../../engine/world/citRun';
import { setActiveLocale } from '../../i18n/localeCore';
import { bankStore } from '../../store/bankStore';
import { citStore } from '../../store/citStore';
import { demoSessionStore } from '../../store/demoSessionStore';
import { hopPlayerStore } from '../../store/hopPlayerStore';
import { useWireHoverStore } from '../../store/wireHoverStore';
import { CIT_FLOW } from '../../types/viewport';
import { CASH_WIRES, litWires, wireNodeOf, wiresAt, WIRE_ENDS } from '../cashWires';
import { CIT_LIMITS, manualOrder, sbvCasePlan, type CitAccountId } from '../citEngine';

const src = (p: string): string => readFileSync(join(__dirname, '../..', p), 'utf8');
const AT = 10 * 60;
const book = (vault: number): Record<CitAccountId, number> => ({ VAULT: vault, HQ_VAULT: 0, TILL: 0, UNFIT: 0, ATM: 0, SBV: 0, TRANSIT: 0, CORP: 0 });

function fresh(): void {
  demoSessionStore.getState().finish();
  hopPlayerStore.getState().reset();
  bankStore.getState().resetDay();
  bankStore.getState().clearDemo();
  bankStore.getState().setActiveFlow(1);
  citStore.setState({ day: -1, manual: [], van: false, sbvCase: 'DEPOSIT' });
  useWireHoverStore.getState().set(null);
}

beforeEach(fresh);
afterEach(() => setActiveLocale('en'));

describe('1. the parent Flow 09 sheet and the menu', () => {
  it('shows no run button on the parent Flow 09 sheet; each CIT child keeps its own', () => {
    setActiveLocale('vi');
    const parent = renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo('flow-9'), liveStr: 0.5 }));
    expect(parent).not.toContain('▶ Chạy thử kịch bản này');
    expect(parent).not.toContain('cit-demo-picker');
    expect(parent).not.toContain('cit-run-scenario');
    for (const key of Object.values(CIT_INFO_KEYS)) {
      const child = renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo(key), liveStr: 0.5 }));
      expect(child, key).toContain('▶ Chạy thử kịch bản này');
    }
  });

  it('lists the four CIT children under Flow 09, mapped to CIT-09, with no "CIT" pill beside them', () => {
    const cit = MENU_CHOICES.filter((c) => c.kind === 'cit');
    expect(cit.map((c) => (c.kind === 'cit' ? c.key : null)).sort()).toEqual(['09-cit-atm', '09-cit-doorstep', '09-cit-sbv', '09-cit-teller-vault']);
    for (const c of cit) expect(c.flow).toBe(CIT_FLOW);
    expect(subProcessInfo('flow-9').code).toBe('CIT-09');
    const menu = src('components/bank/SubProcessMenu.tsx');
    expect(menu).not.toMatch(/c\.kind === 'cit' && \(/);
    expect(menu).not.toMatch(/>\s*CIT\s*</);
  });
});

describe('2. the first load', () => {
  it('never raises a "welcome back" toast beside the Day 1 banner', () => {
    expect(src('store/bankStore.ts')).not.toContain('Welcome back');
    expect(src('i18n/simVi.ts')).not.toContain('Chào mừng trở lại');
    expect(src('store/bankStore.ts')).toMatch(/DayIntroBanner\) already opens on the first look[\s\S]{0,40}notice: null/);
  });
});

describe('4. the station-hover wire highlight', () => {
  it('lights every wire of the hovered station, in one table for both maps', () => {
    expect(new Set(wiresAt('VAULT'))).toEqual(new Set(['TELLER', 'ATM', 'BAY']));
    expect(wiresAt('ATM')).toEqual(['ATM']);
    expect(new Set(wiresAt('BAY'))).toEqual(new Set(['BAY', 'BAY_TELLER']));
    expect(new Set(wiresAt('TELLER'))).toEqual(new Set(['TELLER', 'BAY_TELLER']));
    expect(wireNodeOf('MAIN_CASH_VAULT')).toBe('VAULT');
    expect(wireNodeOf('TELLER_CASH')).toBe('TELLER');
    expect(wireNodeOf('ATM_CASH')).toBe('ATM');
    expect(wireNodeOf('GATE_POS')).toBeNull();
    // Hovering the ATM in the cash-deposit flow lights its line to the vault on top of the flow's own.
    expect(litWires(3, null, 'ATM')).toEqual(new Set(['ATM']));
    expect(litWires(1, null, 'VAULT')).toEqual(new Set(['TELLER', 'ATM', 'BAY']));
    expect(litWires(1, null, null)).toBeNull();
  });

  it('dims the other wires and glows the lit ones on the 2D map', () => {
    const html = renderToStaticMarkup(createElement(CashLinesView, { flows: [], route: litWires(null, null, 'ATM'), hovered: true }));
    expect(html).toContain('data-cash-line="ATM" data-dir="idle" data-route="true"');
    expect(html).toContain('data-cash-line="TELLER" data-dir="idle" data-route="false" opacity="0.2"');
    expect(html).toContain('drop-shadow(0 0 3px #facc15)');
    // The map reports the card (or the CIT hall, which has no PlaceId) under the pointer.
    expect(src('components/bank/BankMap.tsx')).toContain("closest?.('[data-wire-node]')");
    expect(src('components/bank/CitBay2D.tsx')).toContain('data-wire-node="BAY"');
  });

  it('does the same in 3D: the desks through hoverPlace, the bay through the wire-hover store', () => {
    const v = src('components/bank/office/VaultCash3D.tsx');
    expect(v).toContain('useWireHover()');
    expect(v).toContain('litWires(flow, child, hover, group)');
    expect(v).toMatch(/STILL_LINE\[w\]\[route\?\.has\(w\) \? 'lit' : 'idle'\]/);
    expect(src('components/bank/office/LoadingBay3D.tsx')).toContain("useWireHoverStore.getState().set(on ? 'BAY' : null)");
  });
});

describe('5. the CIT hall wires and the flow 03 / 06 cash links', () => {
  it('draws the bay ↔ vault and the bay ↔ teller connections in 2D and 3D, all lit under Flow 09', () => {
    expect(WIRE_ENDS.BAY).toEqual(['VAULT', 'BAY']);
    expect(WIRE_ENDS.BAY_TELLER).toEqual(['BAY', 'TELLER']);
    expect(litWires(CIT_FLOW, null, null)).toEqual(new Set(CASH_WIRES));
    // 2D: out of the bay's left side, orthogonal, into the teller card.
    const [first, ...rest] = BAY_TELLER_LINE;
    expect(first![0]).toBe(CIT_BAY.x);
    const last = rest[rest.length - 1]!;
    const t = PLACE_BOX.TELLER_CASH;
    expect(Math.abs(last[0] - t.cx) <= t.w / 2 && Math.abs(last[1] - t.cy) <= t.h / 2 + 0.5).toBe(true);
    for (let i = 1; i < BAY_TELLER_LINE.length; i++) expect(BAY_TELLER_LINE[i]![0] === BAY_TELLER_LINE[i - 1]![0] || BAY_TELLER_LINE[i]![1] === BAY_TELLER_LINE[i - 1]![1]).toBe(true);
    const html = renderToStaticMarkup(createElement(CashLinesView, { flows: [], route: litWires(CIT_FLOW, null, null) }));
    expect(html).toContain('data-cash-line="BAY_TELLER" data-dir="idle" data-route="true"');
    // 3D: the arc leaves the loading door and lands on the teller counter, low over the desks.
    const [x0, , z0] = wirePoint('BAY_TELLER', 0);
    expect([x0, z0]).toEqual([LOADING_DOOR[0], LOADING_DOOR[1]]);
    const [x1, , z1] = wirePoint('BAY_TELLER', 1);
    expect(x1).toBeCloseTo(endpointXZ('TELLER')[0], 6);
    expect(z1).toBeCloseTo(endpointXZ('TELLER')[1], 6);
    for (let u = 0; u <= 1; u += 0.05) expect(wirePoint('BAY_TELLER', u)[1]).toBeLessThanOrEqual(ARC_PEAK + 1e-9);
  });

  it('links the cash machine to the vault under Flow 03, the teller till under Flow 06, and the till run stays vault ↔ till (no hall handover)', () => {
    expect(litWires(3, null, null)).toEqual(new Set(['ATM']));
    expect(litWires(6, null, null)).toEqual(new Set(['TELLER']));
    expect(litWires(CIT_FLOW, 'TELLER', null)).toEqual(new Set(['TELLER']));
    expect(litWires(CIT_FLOW, 'ATM', null)).toEqual(new Set(['BAY', 'ATM']));
  });

  it('opens the Loading Bay inspector from both maps, titled "Sảnh Giao Nhận CIT"', () => {
    expect(src('components/ops/cit.messages.ts')).toContain("vi: 'Sảnh Giao Nhận CIT'");
    expect(src('components/bank/CitBay2D.tsx')).toContain("select({ kind: 'bay' })");
    expect(src('components/bank/office/LoadingBay3D.tsx')).toContain("bankStore.getState().select({ kind: 'bay' })");
    const panel = src('components/ops/LoadingBayPanel.tsx');
    for (const id of ['bay-vehicle', 'bay-van-id', 'bay-seal', 'bay-custodians', 'bay-log']) expect(panel).toContain(`data-testid="${id}"`);
  });
});

describe('6. the forced SBV deposit', () => {
  const under = book(CIT_LIMITS.branchFloorCents / 2);

  it('tags a deposit forced from a vault under its floor, and only that one', () => {
    expect(sbvCasePlan(under, false, 'DEPOSIT').forced).toBe(true);
    expect(sbvCasePlan(under, false, 'WITHDRAW').forced).toBeUndefined();
    expect(sbvCasePlan(book(CIT_LIMITS.branchFloorCents * 4), false, 'DEPOSIT').forced).toBeUndefined();
    const o = manualOrder(3, 1, { kind: 'SBV', at: AT, sbv: 'DEPOSIT' }, under);
    expect(o.forced).toBe(true);
    expect(o.trigger.vi).toContain('nộp cưỡng chế vào NHNN (Demo)');
    expect(manualOrder(3, 1, { kind: 'SBV', at: AT, sbv: 'WITHDRAW' }, under).forced).toBeUndefined();
  });

  it('shows "Nộp cưỡng chế (Demo)" on the run card', () => {
    setActiveLocale('vi');
    const html = renderToStaticMarkup(createElement(SbvBadge, { mode: 'DEPOSIT', reason: 'unfit', forced: true }));
    expect(html).toContain('data-testid="sbv-forced"');
    expect(html).toContain('Nộp cưỡng chế (Demo)');
    expect(renderToStaticMarkup(createElement(SbvBadge, { mode: 'DEPOSIT', reason: 'ceiling' }))).not.toContain('sbv-forced');
    expect(src('components/ops/CitPanel.tsx')).toContain('forced={o.forced}');
    expect(src('components/ops/LoadingBayPanel.tsx')).toContain('forced={shown.order.forced}');
  });
});

describe('7. the one execution lock on every trigger', () => {
  it('guards the welcome window, the registry links, the Academy and every store-direct trigger', () => {
    let calls = 0;
    const fn = guarded(() => void calls++);
    fn();
    expect(calls).toBe(1);
    bankStore.getState().skipTo(AT);
    expect(dispatchCitDemo('ATM')).toBe(true);
    expect(demoLocked()).toBe(true);
    fn();
    expect(calls).toBe(1);
    const flow = bankStore.getState().flow;
    simulateGuidedFlow(1);
    expect(bankStore.getState().flow).toBe(flow);
    // The welcome modes that switch the flow, the scope or the role are guarded; opening the Academy (reading) never is.
    expect(src('components/bank/WelcomeModal.tsx')).toContain("onPick={mode.id === 'academy' ? () => mode.pick(actions) : guarded(() => mode.pick(actions))}");
    expect(src('components/bank/WelcomeModal.tsx')).toMatch(/const startShift = guarded\(/);
    expect(src('components/knowledge/RegulatoryRegistry.tsx')).toMatch(/function openScenario[\s\S]{0,160}if \(demoLocked\(\)\) return;/);
    expect(src('components/knowledge/RegulatoryRegistry.tsx')).toContain('disabled={locked}');
    expect(src('components/academy/AcademyStudy.tsx')).toContain('disabled={flow === null || locked}');
    expect(src('components/academy/AcademyStudy.tsx')).not.toContain('simulateFlow(academyStore');
  });

  it('opens a session for "Simulate this Flow", paused, so the navigation locks until it is over', () => {
    bankStore.getState().skipTo(AT);
    bankStore.getState().play();
    simulateGuidedFlow(1);
    const s = bankStore.getState();
    expect(s.flow).toBe(1);
    expect(demoSessionStore.getState().active).toMatchObject({ kind: 'payment', id: s.presetTxId });
    expect(demoLocked()).toBe(true);
  });
});

describe('8. the Step button while paused', () => {
  it('animates the stepped beat of a paused payment, and holds it otherwise', () => {
    bankStore.getState().skipTo(AT);
    executeDemo('pos-20');
    bankStore.getState().pause();
    const id = bankStore.getState().presetTxId!;
    const session = { kind: 'payment' as const, id: `tx:${id}` };
    expect(bankStore.getState().presetTrace?.done).toBe(false);
    expect(hopFrozen(bankStore.getState(), session)).toBe(true);
    bankStore.getState().step();
    const after = bankStore.getState();
    expect(after.playing).toBe(false);
    expect(after.stepView).toBe(after.view);
    expect(hopFrozen(after, session)).toBe(false);
    // The play never runs past the stop the stepped beat reached: stepPlay caps at `reached`.
    expect(src('components/bank/hopDriver.ts')).toContain('beatLive(bank)');
  });
});

describe('9. bundle, pooling and the Flow 08 lesson', () => {
  it('splits the demo pipeline into its own chunk (Rolldown manualChunks groups)', () => {
    const vite = src('../vite.config.ts');
    expect(vite).toMatch(/name: 'retail-ops', test: \/.*retailOpsActions/);
    expect(vite).toContain('manualChunks');
  });

  it('pools objects: the pool never grows past its cap and reuses what is handed back', () => {
    let made = 0;
    const pool = new ObjectPool(() => ({ n: made++ }), 2);
    const a = pool.acquire()!;
    pool.acquire();
    expect(pool.acquire()).toBeNull();
    pool.release(a);
    expect(pool.acquire()).toBe(a);
    expect(made).toBe(2);
  });

  it('adds a core accounting walkthrough for Flow 08 in the AML tab, beside the CTR and SWIFT anchors', () => {
    const ids = AML_ARTICLE.sections.map((s) => s.id);
    for (const id of ['aml-cash-ctr', 'aml-swift-disputes', 'aml-swift-ledger']) expect(ids).toContain(id);
    const ledger = AML_ARTICLE.sections.find((s) => s.id === 'aml-swift-ledger')!;
    expect(ledger.table?.rows.length).toBeGreaterThanOrEqual(5);
    expect(ledger.title.vi).toContain('Luồng 08');
    expect(JSON.stringify(ledger)).toContain('TK 1430');
  });
});
