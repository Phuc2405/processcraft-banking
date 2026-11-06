/**
 * The CIT routing and step-progression pass:
 *  1. Flow 09 is the CIT domain (CIT-09), its four children `09-cit-*`, and the dock runs the picked child;
 *  2. a CIT child lights only the vault → bay → far-end route, never a payment desk (POS, CASA, STP, Approved / Declined);
 *  3. the Loading Bay is a station on both maps, with its own inspector (van, seal, custodians, today's log);
 *  4. SBV runs say whether they deposit (🟢) or withdraw (🔴), and why;
 *  5. manual demos run at any hour: a late CIT run plays alone, a sheet's scenario never waits for a shift;
 *  6. the hop player: badge at a stop → icon along one wire → badge at the next stop → … → final, never ahead of the run.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CitBayView } from '../../components/bank/CitBay2D';
import { badgeWindow, HopBadge } from '../../components/bank/HopBadge';
import { citSource, paymentSource } from '../../components/bank/hopDriver';
import { hopPath2D, stopBox2D } from '../../components/bank/hopGeometry2D';
import { runDemoAnytime } from '../../components/bank/retailOpsActions';
import { MENU_CHOICES } from '../../components/bank/SubProcessMenu';
import { citDemoBlock, citNow, dispatchCitDemo } from '../../components/ops/citActions';
import { SbvBadge } from '../../components/ops/CitPanel';
import { LoadingBayView } from '../../components/ops/LoadingBayPanel';
import { CASH_LINES, CIT_BAY, PLACE_BOX } from '../../engine/plan/layout';
import { CIT_INFO_KEYS } from '../../data/subProcessKeys';
import { subProcessInfo } from '../../data/subProcessRegistry';
import { setActiveLocale } from '../../i18n/localeCore';
import { activeScopeOf, bankStore } from '../../store/bankStore';
import { citStore } from '../../store/citStore';
import { hopPlayerStore } from '../../store/hopPlayerStore';
import { shiftQueueStore } from '../../store/shiftQueueStore';
import { CIT_FLOW, FLOW_IDS } from '../../types/viewport';
import { citAt, CIT_DEMOS, CIT_LIMITS, citOrder, sbvMode, sbvPlan, sbvReasonOf, sbvTrigger, startRun, advance, type CitStatus } from '../citEngine';
import { bayVehicle, citChildLines, citReached, citScope, citStops, citVanId, CIT_FLEET } from '../citRoute';
import { focusScope } from '../demoGroups';
import { GUIDED_FLOWS } from '../guidedFlows';
import { HOP_TIMING, iconShown, badgeShown, playTrace, startPlay, stepPlay, stopStates, travelU, type HopPlay } from '../hopPlayer';
import { livePath } from '../transactionPath';

const src = (p: string): string => readFileSync(join(__dirname, '../..', p), 'utf8');
const PAYMENT_NODES = ['LEDGER_DEBIT', 'LEDGER_CREDIT', 'STP_ENGINE', 'OUT_APPROVED', 'OUT_DECLINED', 'GATE_POS', 'AML_DESK'] as const;

afterEach(() => setActiveLocale('en'));

describe('Flow 09: the CIT domain', () => {
  it('is its own flow with the CIT-09 master code and four 09-cit children', () => {
    expect(FLOW_IDS).toContain(CIT_FLOW);
    expect(GUIDED_FLOWS[9].code).toBe('09');
    expect(Object.values(CIT_INFO_KEYS)).toEqual(['09-cit-atm', '09-cit-doorstep', '09-cit-sbv', '09-cit-teller-vault']);
    expect(subProcessInfo('flow-9').code).toBe('CIT-09');
    setActiveLocale('vi');
    expect(subProcessInfo('flow-9').title.vi).toBe('Vận chuyển tiền mặt & Quản lý Kho quỹ (CIT)');
    const titles = Object.values(CIT_INFO_KEYS).map((k) => subProcessInfo(k).title.vi);
    expect(titles).toEqual(['Tiếp quỹ & Rút hộc tiền ATM / CDM', 'Thu tiền mặt tận nơi cho Doanh nghiệp', 'Nộp / Rút tiền mặt tại Ngân hàng Nhà nước (SBV)', 'Điều chuyển & Phân loại tiền quầy']);
    for (const k of Object.values(CIT_INFO_KEYS)) expect(subProcessInfo(k).flow).toBe(9);
  });

  it('lists the four children under Flow 09 and maps the dock to the picked one', () => {
    const cit = MENU_CHOICES.filter((c) => c.kind === 'cit');
    expect(cit.map((c) => c.flow)).toEqual([9, 9, 9, 9]);
    const dock = src('components/bank/PresetDock.tsx');
    expect(dock).toContain('useBankStore(citChildOf)');
    expect(dock).toContain('<CitDockButton kind={cit} />');
  });
});

describe('a CIT child lights only its own route', () => {
  beforeEach(() => bankStore.getState().setActiveFlow(1));

  it.each(CIT_DEMOS)('%s never lights a payment desk or wire', (kind) => {
    const scope = focusScope(CIT_FLOW, kind);
    for (const p of PAYMENT_NODES) expect(scope.places.has(p), p).toBe(false);
    expect(scope.wires.size).toBe(0);
    expect(scope.places.has('MAIN_CASH_VAULT')).toBe(true);
  });

  it('runs vault → bay → far end for a van, vault ↔ till on foot', () => {
    expect(citStops('SBV', 'OUT')).toEqual(['VAULT', 'BAY', 'SBV']);
    expect(citStops('SBV', 'IN')).toEqual(['SBV', 'BAY', 'VAULT']);
    expect(citStops('ATM_CDM', 'OUT')).toEqual(['VAULT', 'BAY', 'ATM']);
    expect(citStops('DOORSTEP', 'IN')).toEqual(['CORP', 'BAY', 'VAULT']);
    expect(citStops('TELLER', 'IN')).toEqual(['TELLER', 'VAULT']);
    expect(citChildLines('SBV')).toEqual(['BAY']);
    expect(citChildLines('ATM')).toEqual(['BAY', 'ATM']);
    expect(citChildLines('TELLER')).toEqual(['TELLER']);
    expect([...citScope('ATM').places].sort()).toEqual(['ATM_CASH', 'MAIN_CASH_VAULT']);
  });

  it('is what the store lights once a child is picked, and a flow change clears it', () => {
    bankStore.getState().selectSubProcess('SBV', CIT_FLOW);
    const s = bankStore.getState();
    expect(s.flow).toBe(9);
    expect([...activeScopeOf(s)!.places]).toEqual(['MAIN_CASH_VAULT']);
    s.setActiveFlow(6);
    expect(bankStore.getState().subProcess).toBeNull();
  });
});

describe('the Loading Bay is a station', () => {
  beforeEach(() => {
    bankStore.getState().resetDay();
    bankStore.getState().skipTo(10 * 60 + 30);
    citStore.setState({ day: -1, manual: [], van: false });
  });

  it('opens its own inspector from both maps, titled in Title Case', () => {
    expect(src('components/bank/CitBay2D.tsx')).toContain("select({ kind: 'bay' })");
    expect(src('components/bank/office/LoadingBay3D.tsx')).toMatch(/name="cit-bay-hit"[\s\S]*select\(\{ kind: 'bay' \}\)/);
    setActiveLocale('vi');
    const html = renderToStaticMarkup(createElement(CitBayView, { cit: citNow(), live: true, onOpen: () => undefined }));
    expect(html).toContain('Sảnh Giao Nhận CIT');
    expect(html).not.toMatch(/data-testid="cit-bay-title"[^>]*class="[^"]*uppercase/);
    expect(src('components/bank/Inspector.tsx')).toContain("content.kind === 'bay' && <LoadingBayPanel />");
  });

  it('shows the vehicle, the van, the 4-eye seal, the custodians and today’s log', () => {
    expect(dispatchCitDemo('SBV')).toBe(true);
    const cit = citNow();
    const run = cit.lock!.run;
    expect(CIT_FLEET).toContain(citVanId(run.order));
    expect(citVanId(citOrder({ scenario: 'TELLER', direction: 'IN', amountCents: 1_000_000 }))).toBeNull();
    expect(bayVehicle(cit).state).not.toBe('IDLE');
    const html = renderToStaticMarkup(createElement(LoadingBayView, { cit, van3d: false }));
    expect(html).toContain('data-testid="loading-bay-panel"');
    expect(html).toContain(run.order.sealId);
    for (const name of run.order.custodians) expect(html).toContain(name);
    expect(html).toContain('data-testid="bay-log"');
    expect(html).toContain(`data-run="${run.order.id}"`);
    expect(html).toContain('data-testid="sbv-badge"');
  });
});

describe('SBV deposit or withdrawal', () => {
  const book = (vault: number, unfit = 0) => ({ ...citAt(1, 9 * 60).book, VAULT: vault, UNFIT: unfit });

  it('deposits over the $5.2M ceiling or with $10,000+ unfit, withdraws under the $1M floor or for a holiday', () => {
    expect(sbvTrigger(600_000_000, 0, false)).toMatchObject({ direction: 'OUT', reason: 'ceiling' });
    expect(sbvTrigger(400_000_000, CIT_LIMITS.unfitSurrenderCents, false)).toMatchObject({ direction: 'OUT', reason: 'unfit' });
    expect(sbvTrigger(90_000_000, 0, false)).toMatchObject({ direction: 'IN', reason: 'floor', amountCents: CIT_LIMITS.branchTargetCents - 90_000_000 });
    expect(sbvTrigger(400_000_000, 0, true)).toMatchObject({ direction: 'IN', reason: 'holiday' });
    expect(sbvPlan(book(400_000_000), false)).toMatchObject({ direction: 'IN', reason: 'holiday' });
    expect(sbvMode('OUT')).toBe('DEPOSIT');
    expect(sbvMode('IN')).toBe('WITHDRAW');
    expect(sbvReasonOf({ direction: 'OUT', amountCents: 0 })).toBe('unfit');
    expect(sbvReasonOf({ direction: 'IN', amountCents: CIT_LIMITS.holidayWithdrawCents })).toBe('holiday');
  });

  it('renders the 🟢 / 🔴 badges in Vietnamese', () => {
    setActiveLocale('vi');
    const dep = renderToStaticMarkup(createElement(SbvBadge, { mode: 'DEPOSIT', reason: 'ceiling' }));
    const wd = renderToStaticMarkup(createElement(SbvBadge, { mode: 'WITHDRAW', reason: 'holiday' }));
    expect(dep).toContain('🟢 Nộp tiền về NHNN');
    expect(dep).toContain('$5.2M');
    expect(wd).toContain('🔴 Rút tiền từ NHNN');
    expect(wd).toContain('Tết');
  });
});

describe('manual demos at any hour', () => {
  beforeEach(() => {
    bankStore.getState().resetDay();
    citStore.setState({ day: -1, manual: [], van: false });
    shiftQueueStore.getState().dismiss();
  });

  it('never blocks a CIT dispatch for the hour: a late run pauses the bank and plays alone', () => {
    bankStore.getState().skipTo(23 * 60 + 5);
    bankStore.getState().play();
    expect(citDemoBlock(citNow(), false)).toBeNull();
    expect(dispatchCitDemo('DOORSTEP')).toBe(true);
    expect(bankStore.getState().playing).toBe(false);
    expect(citNow().lock?.run.order.scenario).toBe('DOORSTEP');
  });

  it('runs a counter scenario from its sheet after closing without the shift prompt', () => {
    bankStore.getState().skipTo(23 * 60 + 5);
    runDemoAnytime('teller-12k');
    expect(shiftQueueStore.getState().prompt).toBeNull();
    expect(bankStore.getState().presetTxId).not.toBeNull();
    expect(bankStore.getState().view.minute).toBeGreaterThanOrEqual(23 * 60 + 5);
  });
});

describe('the hop player', () => {
  /** Plays `seconds` in small ticks, recording each distinct (index, phase). */
  const run = (count: number, reached: (p: HopPlay) => number, seconds = 60): string[] => {
    let p: HopPlay | null = startPlay();
    const seen: string[] = ['0:show'];
    for (let t = 0; t < seconds && p; t += 0.05) {
      p = stepPlay(p, 0.05, count, reached(p));
      const key = p ? `${p.index}:${p.phase}` : 'end';
      if (seen[seen.length - 1] !== key) seen.push(key);
    }
    return seen;
  };

  it('shows the badge, hides it while the icon travels, shows it at the next stop, then ends on the final step', () => {
    expect(run(3, () => 2)).toEqual(['0:show', '0:travel', '1:show', '1:travel', '2:final', 'end']);
    const p = startPlay();
    expect(badgeShown(p) && !iconShown(p)).toBe(true);
    const moving: HopPlay = { index: 0, phase: 'travel', t: HOP_TIMING.travel / 2 };
    expect(iconShown(moving) && !badgeShown(moving)).toBe(true);
    expect(travelU(moving)).toBeCloseTo(0.5);
  });

  it('never runs ahead of the run: a stop not reached holds the badge there', () => {
    const held = run(3, () => 0, 20);
    expect(held).toEqual(['0:show']);
    let p: HopPlay | null = startPlay();
    for (let i = 0; i < 100; i++) p = stepPlay(p!, 0.1, 3, 1);
    expect(p).toMatchObject({ index: 1, phase: 'show', t: HOP_TIMING.show });
    // The final stop counts down only once the run has really got there.
    let f: HopPlay | null = { index: 2, phase: 'final', t: 0 };
    for (let i = 0; i < 100; i++) f = stepPlay(f!, 0.1, 3, 1);
    expect(f).not.toBeNull();
  });

  it('marks the stop it stands at as the one active step, and lights the wire into it', () => {
    expect(stopStates({ index: 1, phase: 'show', t: 0 }, 3)).toEqual(['done', 'active', 'next']);
    const route = ['GATE_POS', 'LEDGER_DEBIT', 'OUT_APPROVED'] as const;
    expect(livePath(playTrace({ index: 0, phase: 'travel', t: 0 }, route))?.active).toBe('GATE_POS>LEDGER_DEBIT');
    expect(livePath(playTrace({ index: 0, phase: 'show', t: 0 }, route))?.active).toBeNull();
    const html = renderToStaticMarkup(createElement(HopBadge, { hops: [{ n: 1, name: 'Vault', state: 'done' }, { n: 2, name: 'Bay', state: 'active' }, { n: 3, name: 'SBV', state: 'next' }], tone: '#facc15' }));
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain('Step 1: Vault');
    expect(badgeWindow(Array.from({ length: 8 }, (_, i) => ({ state: i === 6 ? 'active' : 'next' as const }))).shown).toHaveLength(5);
  });

  it('follows a CIT run by its lifecycle state', () => {
    const order = citOrder({ scenario: 'DOORSTEP', direction: 'IN', amountCents: 30_000_000 });
    const at = (status: CitStatus) => citReached({ order, status });
    expect([at('EN_ROUTE'), at('ARRIVED'), at('IN_COUNT'), at('SETTLED')]).toEqual([0, 1, 2, 2]);
    const out = citOrder({ scenario: 'SBV', direction: 'OUT', amountCents: 80_000_000 });
    expect(citReached({ order: out, status: 'EN_ROUTE' })).toBe(1);
    expect(citReached(advance(startRun(out)))).toBe(2);
  });

  it('plays the newest run, finishes one that has gone, and never replays a finished one', () => {
    hopPlayerStore.getState().reset();
    const pay = paymentSource({ id: 'P1', route: ['GATE_POS', 'LEDGER_DEBIT', 'OUT_APPROVED'], at: 0, done: false })!;
    expect(pay.icon).toBe('💳');
    const tick = (dt: number, sources: Parameters<ReturnType<typeof hopPlayerStore.getState>['tick']>[1]) => hopPlayerStore.getState().tick(dt, sources);
    tick(0.05, [pay]);
    expect(hopPlayerStore.getState().session?.id).toBe('tx:P1');
    // The payment is done and gone from the sources: the player plays its last stops on its own, then ends.
    for (let i = 0; i < 400 && hopPlayerStore.getState().session; i++) tick(0.05, []);
    expect(hopPlayerStore.getState().session).toBeNull();
    tick(0.05, [pay]);
    expect(hopPlayerStore.getState().session).toBeNull();
    const cit = citSource(startRun(citOrder({ scenario: 'SBV', direction: 'OUT', amountCents: 80_000_000 })))!;
    expect(cit.icon).toBe('💵');
    tick(0.05, [cit]);
    expect(hopPlayerStore.getState().session?.stops.map((s) => s.cit)).toEqual(['VAULT', 'BAY', 'SBV']);
    hopPlayerStore.getState().reset();
  });

  it('places stops and hops on the 2D map: desks, the bay card, the vault’s gold lines', () => {
    const vault = { place: 'MAIN_CASH_VAULT' as const, cit: 'VAULT' as const };
    const bay = { place: null, cit: 'BAY' as const };
    expect(stopBox2D(vault).at).toEqual([PLACE_BOX.MAIN_CASH_VAULT.cx, PLACE_BOX.MAIN_CASH_VAULT.cy]);
    expect(stopBox2D(bay).top).toBe(CIT_BAY.y);
    expect(hopPath2D(vault, bay).points).toEqual(CASH_LINES.BAY);
    expect(hopPath2D(bay, vault).points).toEqual([...CASH_LINES.BAY].reverse());
    const sbv = stopBox2D({ place: null, cit: 'SBV' }).at;
    expect(sbv[1]).toBeGreaterThan(CIT_BAY.y);
    expect(src('components/bank/office/TransactionFlow3D.tsx')).toContain('hopPlayerStore.getState().play');
  });
});

describe('the hop driver', () => {
  it('starts a run’s play the moment the store changes, before it can finish between two ticks', () => {
    expect(readFileSync(join(__dirname, '../../components/bank/hopDriver.ts'), 'utf8')).toMatch(/sources = hopSources\(\);\s*\/\/[^\n]*\n\s*hopPlayerStore\.getState\(\)\.tick\(0, sources\)/);
    hopPlayerStore.getState().reset();
    const p = paymentSource({ id: 'FAST', route: ['GATE_POS', 'STP_ENGINE', 'OUT_APPROVED'], at: 0, done: false })!;
    hopPlayerStore.getState().tick(0, [p]);
    // Done a beat later: the play already holds it, so it still walks every stop.
    hopPlayerStore.getState().tick(0.04, [{ ...p, reached: 2, over: true }]);
    expect(hopPlayerStore.getState().session?.id).toBe('tx:FAST');
    hopPlayerStore.getState().reset();
  });
});
