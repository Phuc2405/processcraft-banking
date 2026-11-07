/**
 * Regression suite: the master reactivity and flow-fix pass.
 * 1. Soft-dimming: a picked child lights only the desks and wires it actually crosses; the rest of its sub-process stays drawn at
 *    35% (never unmounted). An ATM withdrawal never lights the Main Cash Vault or its gold cash line.
 * 2. One focus pipeline: a pick in the dock, the drawer or the top menu aims the map, names the same scenario everywhere, and replaces
 *    a finished run's result with the new sheet.
 * 3. The dock: the reset hides while a demo runs, the waiting shift sits on its own row, long names truncate, the selector is read-only.
 * 4. Flow 09 in 3D: the SBV step badge follows the van (step 2 once the crew meets it, step 3 once it pulls away) and stays in the lot.
 * 5. The shift-prompt buttons wrap inside themselves; the map legend keeps the wheel; Flow 04's suspense switch.
 * 6. V8: the dock is one fixed row that the drawer never moves; the bottom, top and right always name the same scenario (Flow 09
 *    too); in a sub-process the hover only opens the card; the SOP / run-result toggle; the SBV step badges never stack.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BankMap } from '../../../components/bank/BankMap';
import { ownWheel } from '../../../components/bank/MapLegend';
import { PresetDock } from '../../../components/bank/PresetDock';
import { ShiftPrompt } from '../../../components/bank/ShiftPrompt';
import { topBand } from '../../../components/bank/ViewportControls';
import { citSource } from '../../../components/bank/hopDriver';
import { executeDemo, focusChild, focusCitChild, litInfoKey, showLitInfo } from '../../../components/bank/retailOpsActions';
import { cancelDemo, demoLocked } from '../../../components/bank/DemoSession';
import { badgeXZ, CIT_BADGE_LIFT_PX, citBadgeAtBay, OFFSITE, OFFSITE_BADGE } from '../../../components/bank/office/TransactionFlow3D';
import { badgeFocus, deskFocus, litLanes } from '../../../components/bank/office/focus3d';
import { SubProcessMenu } from '../../../components/bank/SubProcessMenu';
import { TransactionPanel } from '../../../components/bank/TransactionPanel';
import { CitRun } from '../../../engine/world/citRun';
import { citRoutes } from '../../../engine/world/parking';
import { LANE_LABELS } from '../../../engine/plan/layout3d';
import { CIT_FLOW } from '../../../types/viewport';
import { hoverStrategy, litHover } from '../../hoverStrategy';
import { demoActionById } from '../../demoActions';
import { focusScope } from '../../demoGroups';
import { EodSuspenseToggle, SubProcessInfoView } from '../../../components/ops/SubProcessInfoDrawer';
import { eodSheet } from '../../../data/subProcessEodSheets';
import { glLine } from '../../../data/subProcessModel';
import { subProcessInfo } from '../../../data/subProcessRegistry';
import { LOT } from '../../../engine/world/parking';
import { setActiveLocale } from '../../../i18n/localeCore';
import { activeFlowOf, activeScopeOf, bankStore, citChildOf, focusSubOf } from '../../../store/bankStore';
import { CHILD_DIM, childFocusStore } from '../../../store/childFocusStore';
import { demoSessionStore } from '../../../store/demoSessionStore';
import { eodCaseStore } from '../../../store/eodCaseStore';
import { hopPlayerStore } from '../../../store/hopPlayerStore';
import { shiftQueueStore } from '../../../store/shiftQueueStore';
import { childCashWires, litWires } from '../../cashWires';
import { vanStepCap } from '../../citCrew';
import { childPlaces, DEMO_GROUPS, groupMembers, groupScope } from '../../demoGroups';
import { EOD_CASE_ROUTE, EOD_SUSPENSE_ROUTE } from '../../eodCase';
import { DEFAULT_STP, stpRoute } from '../../stpEngine';
import { OPS_ACTIONS } from '../../retailOps';
import { freshBank, src } from './harness';

// Server rendering reads a zustand store's initial state: point the stores the views read at their live state.
type Api = { getInitialState: () => unknown; getState: () => unknown };
const stores = [bankStore, childFocusStore, shiftQueueStore, demoSessionStore, eodCaseStore, topBand] as unknown as Api[];
const initials = stores.map((s) => s.getInitialState);
beforeAll(() => stores.forEach((s) => (s.getInitialState = s.getState)));
afterAll(() => stores.forEach((s, i) => (s.getInitialState = initials[i]!)));
beforeEach(() => freshBank());
afterEach(() => {
  childFocusStore.getState().reset();
  eodCaseStore.getState().setSuspense(false);
  topBand.setState({ mapW: 0, shortMap: false });
  bankStore.getState().setScope('advanced');
  setActiveLocale('en');
});

const html = (el: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(el);

describe('1. soft-dimming: only the active route is bright, nothing is unmounted', () => {
  it('an ATM $100 withdrawal never lights the Main Cash Vault, the Teller Desk or the gold cash line', () => {
    const child = childPlaces('atm-withdraw-100')!;
    expect(child.has('MAIN_CASH_VAULT')).toBe(false);
    expect(child.has('TELLER_CASH')).toBe(false);
    expect(childCashWires('atm-withdraw-100')).toEqual([]);
    expect(litWires(3, null, null, 'atm-napas', 'atm-withdraw-100')).toBeNull();
    // The CIT refill does draw on the vault: its line and the vault stay lit.
    expect(childPlaces('cassette-refill')!.has('MAIN_CASH_VAULT')).toBe(true);
    expect([...litWires(3, null, null, 'cassette-jam', 'cassette-refill')!]).toEqual(['ATM']);
  });

  it('every child of flows 01-08 lights only its own route under the live STP dials, inside its sub-process', () => {
    for (const g of DEMO_GROUPS) {
      const scope = groupScope(g.id).places;
      for (const m of groupMembers(g.id)) {
        const child = childPlaces(m.def.id, DEFAULT_STP)!;
        expect([...child].every((p) => scope.has(p)), m.def.id).toBe(true);
        if (m.source === 'ops') {
          // Never the union of every path it could take: a timely savings closure does not light both the desk route and the STP one.
          const route = new Set(stpRoute(m.def.id, m.def.route, DEFAULT_STP));
          for (const p of child) expect(route.has(p) || p === 'MAIN_CASH_VAULT', `${m.def.id} ${p}`).toBe(true);
        }
        expect(child.has('MAIN_CASH_VAULT'), m.def.id).toBe(childCashWires(m.def.id).length > 0 || (m.source === 'ops' && m.def.route.includes('MAIN_CASH_VAULT')));
      }
    }
    expect(OPS_ACTIONS.length).toBeGreaterThan(0);
  });

  it('in 2D the off-route desks and wires of the sub-process are drawn at 0.35, never removed', () => {
    bankStore.getState().setScope('beginner');
    focusChild('atm-withdraw-100');
    const out = html(createElement(BankMap));
    const scope = groupScope('atm-napas');
    const child = childPlaces('atm-withdraw-100', bankStore.getState().stp)!;
    for (const p of scope.places) expect(out, p).toContain(`data-place="${p}"`);
    // The vault is in the sub-process but off this route: drawn, soft-dimmed.
    expect(out).toMatch(new RegExp(`data-child-dim="true"[^>]*data-place="MAIN_CASH_VAULT"|data-place="MAIN_CASH_VAULT"[^>]*data-child-dim="true"`));
    const dimWires = [...out.matchAll(/<g data-wire="([^"]+)"[^>]*data-child-dim="true"[^>]*opacity="([0-9.]+)"/g)];
    expect(dimWires.length).toBeGreaterThan(0);
    for (const [, , op] of dimWires) expect(Number(op)).toBe(CHILD_DIM);
    for (const [, id] of dimWires) expect(scope.wires.has(id!.replace(/&gt;/g, '>')), id).toBe(true);
    expect([...child].length).toBeGreaterThan(0);
  });

  it('in 3D only the lanes the child rides glow', () => {
    bankStore.getState().setScope('beginner');
    focusChild('atm-withdraw-100');
    const s = bankStore.getState();
    const child = childPlaces('atm-withdraw-100', s.stp)!;
    const all = litLanes(null, activeFlowOf(s), focusSubOf(s)).lanes;
    const mine = litLanes(null, activeFlowOf(s), focusSubOf(s), null, child).lanes;
    expect(mine.size).toBeGreaterThan(0);
    expect(mine.size).toBeLessThan(all.size);
    for (const id of mine) expect(all.has(id)).toBe(true);
  });
});

describe('2. one focus pipeline: dock, drawer and menu always name the same scenario', () => {
  it('a pick replaces a finished run’s result with the sheet of the newly picked scenario', () => {
    bankStore.getState().setScope('beginner');
    bankStore.getState().select({ kind: 'transaction', id: 'tx-old' });
    focusChild('atm-61');
    const s = bankStore.getState();
    expect(s.selection).toEqual({ kind: 'subprocess', key: 'atm-napas' });
    expect(s.subProcess).toBe('atm-napas');
    expect(childFocusStore.getState().id).toBe('atm-61');
    // From another flow, the pick switches the flow and its sub-process with it.
    focusChild('td-mature-close');
    expect(bankStore.getState().flow).toBe(6);
    expect(bankStore.getState().subProcess).toBe('term-deposit');
    expect(bankStore.getState().selection).toEqual({ kind: 'subprocess', key: 'term-deposit' });
  });

  it('the drawer runs the scenario the dock names, and the dock’s dropdown shows it', () => {
    bankStore.getState().setScope('beginner');
    focusChild('atm-61');
    expect(html(createElement(SubProcessInfoView, { info: subProcessInfo('atm-napas'), liveStr: 0.5 }))).toContain('data-demo="atm-61"');
    topBand.setState({ mapW: 0, shortMap: true });
    expect(html(createElement(PresetDock))).toContain('data-picked="atm-61"');
  });

  it('the drawer re-opens on the lit sheet; a single-group flow reads its flow sheet', () => {
    bankStore.getState().setActiveFlow(4);
    showLitInfo();
    expect(bankStore.getState().selection).toEqual({ kind: 'subprocess', key: 'flow-4' });
    expect(litInfoKey(9, 'SBV')).toBe('09-cit-sbv');
    expect(litInfoKey(3, 'atm-napas')).toBe('atm-napas');
    // Every menu pick opens its sheet; the dock title and the "ℹ️ Process info" button bring it back.
    expect(src('components/bank/SubProcessMenu.tsx')).toContain('showInfo(c, true);');
    const dock = src('components/bank/PresetDock.tsx');
    expect(dock).toContain('data-testid="preset-dock-title"');
    expect(dock).toContain('data-testid="dock-info"');
  });
});

describe('3. the dock while a demo runs, waits or has a long name', () => {
  const dock = (): string => {
    topBand.setState({ mapW: 0, shortMap: true });
    return html(createElement(PresetDock));
  };

  it('hides "Show all desks" and locks the scenario selector while a demo runs, and brings both back after', () => {
    bankStore.getState().setScope('beginner');
    focusChild('atm-61');
    expect(dock()).toContain('data-testid="show-all-desks"');
    bankStore.getState().skipTo(10 * 60);
    executeDemo('atm-61');
    expect(demoLocked()).toBe(true);
    const running = dock();
    expect(running).not.toContain('data-testid="show-all-desks"');
    expect(running).toMatch(/<button[^>]*disabled=""[^>]*data-testid="demo-select"/);
    expect(running).toContain('data-testid="demo-cancel"');
    cancelDemo();
    expect(demoLocked()).toBe(false);
    expect(dock()).toContain('data-testid="show-all-desks"');
  });

  it('keeps "⏳ Waiting for the shift" inside the one row: a chip that truncates, never a second row', () => {
    bankStore.getState().setScope('beginner');
    focusChild('teller-51');
    shiftQueueStore.setState({ waiting: [{ id: 'teller-51', shift: 'day' }] });
    const out = dock();
    const row = out.indexOf('data-testid="preset-dock-row"');
    const waiting = out.indexOf('data-testid="shift-waiting"');
    expect(row).toBeGreaterThan(-1);
    expect(waiting).toBeGreaterThan(row);
    expect(out).toMatch(/data-testid="shift-waiting" class="[^"]*min-w-\[4\.5rem\][^"]*shrink/);
    expect(out).not.toMatch(/class="[^"]*flex-col[^"]*"[^>]*data-testid="preset-dock"/);
  });

  it('truncates a long scenario name with an ellipsis; the buttons never shrink', () => {
    setActiveLocale('vi');
    bankStore.getState().setScope('beginner');
    focusChild('teller-51');
    const out = dock();
    expect(out).toContain('Rút tiền tại quầy (Từ chối 51');
    expect(out).toMatch(/<span class="min-w-0 truncate">[^<]*Từ chối 51/);
    const tag = (id: string): string => new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`).exec(out)?.[0] ?? '';
    expect(tag('demo-run')).toContain('shrink-0');
    expect(tag('demo-run')).toContain('whitespace-nowrap');
    // The compact bar drops the title; the wide one truncates it (its full text the tooltip).
    expect(src('components/bank/PresetDock.tsx')).toMatch(/title=\{title\} data-testid="preset-dock-title" className=\{`mr-1 min-w-0 truncate/);
  });
});

describe('4. Flow 09 in 3D: the SBV step badge follows the van and stays on the map', () => {
  const OUT = ['VAULT', 'BAY', 'SBV'] as const;
  const IN = ['SBV', 'BAY', 'VAULT'] as const;

  it('outbound: step 2 only once the crew reaches the van, step 3 only once the van pulls away', () => {
    expect(vanStepCap(OUT, { phase: 'pending' })).toBe(0);
    expect(vanStepCap(OUT, { phase: 'arrive', u: 1 })).toBe(0);
    expect(vanStepCap(OUT, { phase: 'load', u: 0.3 })).toBe(0);
    expect(vanStepCap(OUT, { phase: 'load', u: 0.75 })).toBe(1);
    expect(vanStepCap(OUT, { phase: 'close', u: 1 })).toBe(1);
    expect(vanStepCap(OUT, { phase: 'depart', u: 1 })).toBe(2);
    // Inbound runs walk the cassettes in: the vault only after the walk.
    expect(vanStepCap(IN, { phase: 'load', u: 0.05 })).toBe(0);
    expect(vanStepCap(IN, { phase: 'load', u: 0.2 })).toBe(1);
    expect(vanStepCap(IN, { phase: 'load', u: 0.5 })).toBe(2);
    // No van (a till run, or 2D): nothing is capped.
    expect(vanStepCap(['VAULT', 'TELLER'], { phase: 'pending' })).toBeNull();
    expect(vanStepCap(OUT, null)).toBeNull();
  });

  it('the CIT source holds the badge back while the van is pending, and holds step 3 on show while it drives off', () => {
    const run = { order: { id: 'CIT-T', scenario: 'SBV', direction: 'OUT' }, status: 'ARRIVED' } as Parameters<typeof citSource>[0];
    expect(citSource(run, () => ({ phase: 'pending' }))!.reached).toBe(0);
    expect(citSource(run, () => ({ phase: 'load', u: 0.8 }))!.reached).toBe(1);
    const driving = citSource(run, () => ({ phase: 'depart', u: 1 }))!;
    expect(driving.reached).toBe(2);
    expect(driving.hold).toBe(true);
    // In 2D there is no van to wait for.
    expect(citSource(run, null)!.reached).toBe(2);
    // The final stop's countdown waits while the source holds it.
    hopPlayerStore.getState().tick(0, [{ ...driving, id: 'cit:HOLD', hold: false, reached: 0 }]);
    hopPlayerStore.setState({ play: { index: 2, phase: 'final', t: 0 } });
    for (let i = 0; i < 20; i++) hopPlayerStore.getState().tick(0.5, [{ ...driving, id: 'cit:HOLD' }]);
    expect(hopPlayerStore.getState().play?.phase).toBe('final');
    hopPlayerStore.getState().tick(2, [{ ...driving, id: 'cit:HOLD', hold: false }]);
    expect(hopPlayerStore.getState().session).toBeNull();
  });

  it('the step 3 badge stands inside the car park, never out on the back lane past the map', () => {
    const inLot = ([x, z]: readonly [number, number]): boolean => Math.abs(x) >= LOT.x0 && Math.abs(x) <= LOT.x1 && z >= LOT.z0 && z <= LOT.z1;
    expect(inLot(OFFSITE)).toBe(false);
    expect(inLot(OFFSITE_BADGE)).toBe(true);
    expect(badgeXZ({ place: null, cit: 'SBV' })).toEqual(OFFSITE_BADGE);
    expect(badgeXZ({ place: null, cit: 'HQ' })).toEqual(OFFSITE_BADGE);
  });
});

describe('5. modal buttons, the legend wheel and Flow 04’s suspense switch', () => {
  it('the shift prompt’s buttons share the row, wrap their label inside and never clip (23:06, "Giữ 23:06 và chờ đến ca")', () => {
    setActiveLocale('vi');
    bankStore.getState().skipTo(23 * 60 + 6);
    shiftQueueStore.getState().ask({ id: 'teller-51', snap: { shift: 'day', target: 9 * 60, direction: 'forward', reason: 'afterClosing' } });
    const out = html(createElement(ShiftPrompt));
    expect(out).toContain('Giữ 23:06 và chờ đến ca');
    for (const id of ['shift-prompt-stay', 'shift-prompt-confirm']) {
      const tag = new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`).exec(out)![0];
      expect(tag).toContain('flex-[1_1_12rem]');
      expect(tag).toContain('max-w-full');
      expect(tag).toContain('text-center');
      expect(tag).not.toContain('whitespace-nowrap');
    }
    shiftQueueStore.getState().dismiss();
  });

  it('the map legend keeps the mouse wheel: a passive listener that stops it reaching the map’s zoom', () => {
    const el = new EventTarget();
    const seen: string[] = [];
    let passive: boolean | undefined;
    const add = el.addEventListener.bind(el);
    el.addEventListener = ((type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
      passive = opts?.passive;
      add(type, fn, opts);
    }) as typeof el.addEventListener;
    const stop = ownWheel(el);
    const e = new Event('wheel', { cancelable: true });
    const stopProp = e.stopPropagation.bind(e);
    e.stopPropagation = () => {
      seen.push('stopped');
      stopProp();
    };
    el.dispatchEvent(e);
    expect(passive).toBe(true);
    expect(seen).toEqual(['stopped']);
    expect(e.defaultPrevented).toBe(false);
    stop();
    const again = new Event('wheel');
    again.stopPropagation = () => seen.push('again');
    el.dispatchEvent(again);
    expect(seen).toEqual(['stopped']);
    expect(src('components/bank/MapLegend.tsx')).toContain('useOwnWheel(panel, open && !covered)');
  });

  it('the suspense switch routes the night case through TK 1910 / 2912 and rewrites the five sections', () => {
    expect(EOD_CASE_ROUTE).not.toContain('SUSPENSE');
    expect(EOD_SUSPENSE_ROUTE).toContain('SUSPENSE');
    expect(childPlaces('eod', null, false)!.has('SUSPENSE')).toBe(false);
    expect(childPlaces('eod', null, true)!.has('SUSPENSE')).toBe(true);
    const on = eodSheet(true);
    const off = eodSheet(false);
    expect(off).toBe(subProcessInfo('flow-4'));
    for (const k of ['overview', 'steps', 'risks', 'gl', 'kpi'] as const) expect(on[k], k).not.toEqual(off[k]);
    expect(on.key).toBe(off.key);
    const codes = on.gl.map((g) => `${g.side} ${glLine(g, 'vi').code}`);
    for (const c of ['dr 1910', 'cr 1910', 'dr 2912', 'cr 2912']) expect(codes).toContain(c);
    expect(on.steps.some((s) => s.vi.includes('$0.00'))).toBe(true);

    // The night demo plays the route the switch picked.
    bankStore.getState().skipTo(23 * 60);
    eodCaseStore.getState().setSuspense(true);
    bankStore.getState().runPreset('eod');
    expect(bankStore.getState().sandboxTrace?.route).toEqual([...EOD_SUSPENSE_ROUTE]);
    bankStore.getState().clearDemo();
    eodCaseStore.getState().setSuspense(false);
    bankStore.getState().runPreset('eod');
    expect(bankStore.getState().sandboxTrace?.route).toEqual([...EOD_CASE_ROUTE]);
  });

  it('the switch shows on the Flow 04 sheet only, and is read-only while a demo runs', () => {
    expect(html(createElement(SubProcessInfoView, { info: eodSheet(false), liveStr: 0.5 }))).toContain('data-testid="eod-suspense"');
    expect(html(createElement(SubProcessInfoView, { info: subProcessInfo('flow-1'), liveStr: 0.5 }))).not.toContain('data-testid="eod-suspense"');
    expect(html(createElement(EodSuspenseToggle))).not.toMatch(/disabled=""/);
    bankStore.getState().skipTo(10 * 60);
    executeDemo('atm-61');
    expect(html(createElement(EodSuspenseToggle))).toMatch(/<button[^>]*disabled=""[^>]*data-testid="eod-suspense-switch"/);
    cancelDemo();
  });
});

describe('6. V8: one-row dock, three-way sync, hover strategy, result toggle, SBV badges', () => {
  const shell = (out: string): string => /<div[^>]*data-testid="preset-dock"[^>]*>/.exec(out)![0];
  type ChildId = Parameters<typeof focusChild>[0];

  it('the dock is one fixed-height row that never wraps, while idle, running or finished', () => {
    bankStore.getState().setScope('beginner');
    focusChild('atm-61');
    const rows = (): string => html(createElement(PresetDock));
    const check = (out: string): void => {
      expect(shell(out)).toMatch(/class="[^"]*\bh-12\b[^"]*\bflex-nowrap\b/);
      expect(shell(out)).not.toContain('flex-col');
      expect(out).toContain('class="flex min-w-0 flex-1 flex-nowrap items-center gap-2" data-testid="preset-dock-row"');
    };
    check(rows());
    bankStore.getState().skipTo(10 * 60);
    executeDemo('atm-61');
    check(rows());
    cancelDemo();
    check(rows());
    // "Payment on its way…" is gone: the Cancel button already says a run is going.
    expect(src('components/bank/PresetDock.tsx')).not.toContain('preset-running');
  });

  it('closing the drawer never moves the dock or re-lays its row; the info button keeps its width', () => {
    bankStore.getState().setScope('beginner');
    focusChild('atm-61');
    topBand.setState({ mapW: 1600, shortMap: false });
    const open = html(createElement(PresetDock));
    expect(bankStore.getState().selection.kind).toBe('subprocess');
    bankStore.getState().clearSelection();
    const closed = html(createElement(PresetDock));
    expect(shell(closed)).toBe(shell(open));
    const info = (out: string): string => /<button[^>]*data-testid="dock-info"[^>]*>[\s\S]*?<\/button>/.exec(out)![0].replace(/aria-pressed="[^"]*"|class="[^"]*"/g, '');
    expect(info(closed)).toBe(info(open));
    expect(open).toMatch(/aria-pressed="true"[^>]*data-testid="dock-info"/);
    expect(closed).toMatch(/aria-pressed="false"[^>]*data-testid="dock-info"/);
  });

  it('a pick in the bottom selector names the same scenario in the top menu and the drawer, in every flow 01-08', () => {
    bankStore.getState().setScope('beginner');
    for (const g of DEMO_GROUPS) {
      const id = groupMembers(g.id)[0]!.def.id as ChildId;
      focusChild(id);
      const s = bankStore.getState();
      expect(s.selection, g.id).toEqual({ kind: 'subprocess', key: litInfoKey(s.flow, s.subProcess) });
      expect(childFocusStore.getState().id).toBe(id);
      expect(html(createElement(SubProcessMenu))).toContain(`data-flow="${demoActionById(id).flow}"`);
    }
  });

  it('Flow 09: a CIT pick in the dock is the top menu’s pick: menu title, drawer sheet and the dim mask all follow', () => {
    bankStore.getState().setScope('beginner');
    bankStore.getState().setActiveFlow(CIT_FLOW);
    topBand.setState({ mapW: 0, shortMap: true });
    expect(html(createElement(PresetDock))).toContain('data-testid="cit-dock-select"');
    focusCitChild('SBV');
    let s = bankStore.getState();
    expect(citChildOf(s)).toBe('SBV');
    expect(s.selection).toEqual({ kind: 'subprocess', key: '09-cit-sbv' });
    expect(activeScopeOf(s)).toBe(focusScope(CIT_FLOW, 'SBV'));
    expect(html(createElement(PresetDock))).toMatch(/data-testid="cit-dock-select" data-picked="SBV"/);
    const sbvTitle = /data-testid="flow-menu-title">([^<]*)</.exec(html(createElement(SubProcessMenu)))![1];
    focusCitChild('ATM');
    s = bankStore.getState();
    expect(s.selection).toEqual({ kind: 'subprocess', key: '09-cit-atm' });
    expect(activeScopeOf(s)).toBe(focusScope(CIT_FLOW, 'ATM'));
    expect(activeScopeOf(s)).not.toBe(focusScope(CIT_FLOW, 'SBV'));
    expect(/data-testid="flow-menu-title">([^<]*)</.exec(html(createElement(SubProcessMenu)))![1]).not.toBe(sbvTitle);
    // Read-only while a demo runs, like the payment dock's selector.
    expect(src('components/ops/CitPanel.tsx')).toMatch(/testId="cit-dock" disabled=\{locked\}/);
  });

  it('hover strategy: in a sub-process pointing at a desk lights nothing (card only); in the full process it lights its desk and wires', () => {
    expect(hoverStrategy(null)).toBe('highlight');
    expect(hoverStrategy(3)).toBe('tooltip-only');
    expect(litHover('LEDGER_DEBIT', 3)).toBeNull();
    expect(litHover('LEDGER_DEBIT', null)).toBe('LEDGER_DEBIT');
    const child = childPlaces('atm-jam-200', DEFAULT_STP)!;
    for (const p of ['LEDGER_DEBIT', 'EOD_BATCH', 'OUT_APPROVED'] as const) {
      // Hovering an off-route desk of the jammed withdrawal changes neither the desks' fade nor the lanes.
      expect(deskFocus(p, p, 3, 'cassette-jam', child)).toBe(deskFocus(p, null, 3, 'cassette-jam', child));
      expect(litLanes(p, 3, 'cassette-jam', null, child)).toEqual(litLanes(null, 3, 'cassette-jam', null, child));
    }
    for (const l of LANE_LABELS.slice(0, 5)) expect(badgeFocus(l, l.from, 3)).toBe(badgeFocus(l, null, 3));
    // Full process: the hovered desk's own lanes light.
    expect(litLanes('LEDGER_DEBIT', null).lanes.size).toBeGreaterThan(0);
    // The gold cash wires and the 3D outline follow the same strategy; the hover card still reads the raw hover.
    for (const f of ['components/bank/CashLines2D.tsx', 'components/bank/office/VaultCash3D.tsx']) expect(src(f)).toContain('litHover(pointer, flow)');
    expect(src('components/bank/office/Desk3D.tsx')).toContain('litHover(pointed ? id : null, activeFlowOf(s))');
    expect(src('index.css')).not.toContain('.bk-flow-dim:hover');
  });

  it('2D: inside a sub-process no card lights under the pointer, and an off-route card loses its glow and status border', () => {
    bankStore.getState().setScope('beginner');
    focusChild('atm-withdraw-100');
    const out = html(createElement(BankMap));
    expect(out).not.toContain('hover:border-slate-400');
    const vault = /<div[^>]*data-place="MAIN_CASH_VAULT"[^>]*>[\s\S]*?data-testid="station-MAIN_CASH_VAULT"[^>]*>/.exec(out)?.[0] ?? '';
    expect(vault).toContain('data-child-dim="true"');
    expect(vault).not.toContain('bk-flow-lit');
    bankStore.getState().setScope('advanced');
    expect(html(createElement(BankMap))).toContain('hover:border-slate-400');
  });

  it('3D: off-route desks and gates stop glowing (lamp, strip, screens) and fade to 0.35 with the rest', () => {
    const desk = src('components/bank/office/Desk3D.tsx');
    expect(desk).toContain("const status = quiet ? 'IDLE' : live;");
    expect(desk).toContain('material={glow} visible={!quiet}');
    const kiosk = src('components/bank/office/Dressing.tsx');
    expect(kiosk).toContain('useFocusFade(root, id);');
    expect(kiosk).toContain('material={glow} visible={!quiet}');
    const child = childPlaces('atm-jam-200', DEFAULT_STP)!;
    const group = demoActionById('atm-jam-200').group as Parameters<typeof groupScope>[0];
    const off = [...groupScope(group).places].filter((p) => !child.has(p));
    expect(off.length).toBeGreaterThan(0);
    for (const p of off) expect(deskFocus(p, null, 3, group, child), p).toBe(CHILD_DIM);
    // The Approved gate is off the jam's route: faded (outside the sub-process, even further), its lights out.
    expect(child.has('OUT_APPROVED')).toBe(false);
    expect(deskFocus('OUT_APPROVED', null, 3, group, child)).toBeLessThanOrEqual(CHILD_DIM);
    expect(deskFocus('ATM_CASH', null, 3, group, child)).toBe(1);
  });

  it('the drawer toggles between the SOP sheet and the run result; a new pick shows its own sheet, the last result one click away', () => {
    bankStore.getState().setScope('beginner');
    focusChild('atm-61');
    const sop = (): string => html(createElement(SubProcessInfoView, { info: subProcessInfo('atm-napas'), liveStr: 0.5 }));
    expect(sop()).not.toContain('data-testid="run-result-toggle"');
    bankStore.getState().skipTo(10 * 60);
    executeDemo('atm-61');
    const tx = bankStore.getState().presetTxId!;
    expect(bankStore.getState().selection).toEqual({ kind: 'transaction', id: tx });
    expect(demoSessionStore.getState().last).toMatchObject({ kind: 'payment', id: tx });
    const result = html(createElement(TransactionPanel, { id: tx }));
    expect(result).toMatch(/data-testid="run-result-toggle" data-view="result"/);
    expect(result).toMatch(/aria-pressed="true"[^>]*data-testid="show-result"/);
    expect(sop()).toMatch(/data-testid="run-result-toggle" data-view="sop"/);
    // The same scenario is focused: no note.
    expect(sop()).not.toContain('data-testid="run-result-note"');
    // The run ends; another scenario is picked: its sheet replaces the result, and the toggle says whose result it keeps.
    hopPlayerStore.getState().reset();
    bankStore.setState({ presetTrace: { ...bankStore.getState().presetTrace!, done: true } });
    demoSessionStore.getState().finish();
    focusChild('atm-withdraw-100');
    expect(bankStore.getState().selection).toEqual({ kind: 'subprocess', key: 'atm-napas' });
    expect(sop()).toContain('data-testid="run-result-note"');
    expect(html(createElement(TransactionPanel, { id: tx }))).toContain('data-testid="show-sop"');
    // Any other payment's panel (one picked on the map) has no toggle.
    expect(html(createElement(TransactionPanel, { id: 'tx-other' }))).not.toContain('data-testid="run-result-toggle"');
  });

  it('SBV in 3D: the step badge stands in screen pixels above the van marker, and the bay label gives way under it', () => {
    expect(CIT_BADGE_LIFT_PX).toBeGreaterThanOrEqual(48);
    const session = { kind: 'cit', stops: [{ place: null, cit: 'VAULT' }, { place: null, cit: 'BAY' }, { place: null, cit: 'SBV' }] } as never;
    expect(citBadgeAtBay({ session, play: { index: 1, phase: 'stop' } })).toBe(true);
    expect(citBadgeAtBay({ session, play: { index: 1, phase: 'travel' } })).toBe(false);
    expect(citBadgeAtBay({ session, play: { index: 2, phase: 'final' } })).toBe(false);
    expect(citBadgeAtBay({ session: null, play: null })).toBe(false);
    expect(src('components/bank/office/LoadingBay3D.tsx')).toContain('{!stepHere && <Html position={[0, 3, 0]}');
    expect(src('components/bank/office/TransactionFlow3D.tsx')).toContain("lift={session.kind === 'cit' ? CIT_BADGE_LIFT_PX : 0}");
  });

  it('SBV in 3D: the van computes one pose per tick, shared by the renderers and every walker check', () => {
    const run = new CitRun(citRoutes());
    run.call('OUT');
    run.step(0.1, true);
    const a = run.pose();
    expect(run.pose()).toBe(a);
    for (let i = 0; i < 5; i++) run.inPath([0, 0]);
    expect(run.pose()).toBe(a);
    run.step(0.1, true);
    expect(run.pose()).not.toBe(a);
  });
});
