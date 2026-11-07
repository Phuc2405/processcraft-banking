/**
 * The master pass on Flow 09 and the demo pipeline: Flow 09's own CIT children and names, the CIT scenario dropdown, the SBV
 * deposit / withdrawal toggle, the clickable Loading Bay, the internal till-run toast, the demo lock with its "Hủy demo" dialog, the
 * automatic pause, the closed-day sandbox, the single-stream EoD, the vault's wires in 2D and 3D, the hop pacing and freeze, the
 * night van's release, and the pooled 3D sparks.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CashLinesView } from '../../components/bank/CashLines2D';
import { CitBayView } from '../../components/bank/CitBay2D';
import { cancelDemo, CancelDemoDialog, CancelDemoView, demoLocked, demoRunning, RunOrCancel } from '../../components/bank/DemoSession';
import { badgeFit2D } from '../../components/bank/HopBadge';
import { hopFrozen, sandboxSource } from '../../components/bank/hopDriver';
import { BADGE_Y_3D, hopPath3D, OFFSITE } from '../../components/bank/office/TransactionFlow3D';
import { STREAM_POOL_CAP, STREAM_SPARKS } from '../../components/bank/office/VaultCash3D';
import { ObjectPool } from '../../components/bank/office/webglSafety';
import { executeDemo, purgeForEod, runDemo, runDemoAnytime, selectSubProcess } from '../../components/bank/retailOpsActions';
import { citNow, dispatchCitDemo, dispatchTitle } from '../../components/ops/citActions';
import { CitDemoPicker } from '../../components/ops/CitPanel';
import { SubProcessInfoView } from '../../components/ops/SubProcessInfoDrawer';
import { CIT_SHEETS, SBV_CASE_SHEETS, SBV_DOMAIN } from '../../data/subProcessCitSheets';
import { CIT_INFO_KEYS } from '../../data/subProcessKeys';
import { lessonAnchor } from '../../data/subProcessLessons';
import { subProcessInfo } from '../../data/subProcessRegistry';
import { cashWireLabel, STAGE } from '../../engine/plan/layout';
import { LANE_EXIT } from '../../engine/world/parking';
import { setActiveLocale } from '../../i18n/localeCore';
import { bankStore, citChildOf } from '../../store/bankStore';
import { citStore, manualIndexOf, vanOrphaned } from '../../store/citStore';
import { demoSessionStore } from '../../store/demoSessionStore';
import { hopPlayerStore } from '../../store/hopPlayerStore';
import { notificationStore } from '../../store/notificationStore';
import { vaultFlowStore } from '../../store/vaultFlowStore';
import { CIT_FLOW } from '../../types/viewport';
import { CASH_ENDPOINTS } from '../topology';
import { CIT_DEMOS, sbvCasePlan, sbvMode, sbvPlan } from '../citEngine';
import { EOD_START } from '../clock';
import { citDemoOf, focusScope, groupOf } from '../demoGroups';
import * as flowBeat from '../flowBeat';
import { HOP_TIMING, startPlay, stepPlay } from '../hopPlayer';

const src = (p: string): string => readFileSync(join(__dirname, '../..', p), 'utf8');
const AT = 10 * 60;

function fresh(): void {
  demoSessionStore.getState().finish();
  hopPlayerStore.getState().reset();
  bankStore.getState().resetDay();
  bankStore.getState().clearDemo();
  bankStore.getState().setActiveFlow(1);
  citStore.setState({ day: -1, manual: [], van: false, sbvCase: 'DEPOSIT' });
  notificationStore.setState({ queue: [] } as never);
}

beforeEach(fresh);
afterEach(() => setActiveLocale('en'));

describe('1. Flow 09 owns cash in transit', () => {
  it('names the four children as the brief does, under Flow 09, with CIT-09 as the domain code', () => {
    setActiveLocale('vi');
    const title = (k: string): string => CIT_SHEETS.find((c) => c.key === k)!.title.vi;
    expect(title('09-cit-doorstep')).toBe('Thu tiền mặt tận nơi cho Doanh nghiệp');
    expect(title('09-cit-teller-vault')).toBe('Điều chuyển & Phân loại tiền quầy');
    expect(title('09-cit-atm')).toBe('Tiếp quỹ & Rút hộc tiền ATM / CDM');
    expect(title('09-cit-sbv')).toBe('Nộp / Rút tiền mặt tại Ngân hàng Nhà nước (SBV)');
    for (const k of Object.values(CIT_INFO_KEYS)) expect(subProcessInfo(k).flow).toBe(CIT_FLOW);
    expect(subProcessInfo('flow-9').code).toBe('CIT-09');
    // The old names are gone from the CIT copy.
    const copy = src('components/ops/cit.messages.ts');
    for (const old of ['Thu tiền WinMart', 'Tiếp quỹ quầy GDV', "'Tiếp quỹ ATM'", 'Nộp/Rút tiền NHNN']) expect(copy).not.toContain(old);
  });

  it('keeps one sub-process field: a CIT child is a first-class target, narrowed by the flow', () => {
    expect(citDemoOf('SBV')).toBe('SBV');
    expect(groupOf('SBV')).toBeNull();
    expect(groupOf('card-auth')).toBe('card-auth');
    bankStore.getState().selectSubProcess('ATM', CIT_FLOW);
    const s = bankStore.getState();
    expect(s.subProcess).toBe('ATM');
    expect(citChildOf(s)).toBe('ATM');
    expect(focusScope(CIT_FLOW, 'ATM').places.has('ATM_CASH')).toBe(true);
    expect(src('store/bankStore.ts')).not.toContain('citChild:');
  });
});

describe('2. the CIT demo scenario dropdown', () => {
  it('replaces the four inline buttons on the dock, the bay and the vault with the shared dropdown (the parent sheet has none)', () => {
    const html = renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo('flow-9'), liveStr: 0.5 }));
    expect(html).not.toContain('data-testid="cit-demo-picker"');
    for (const k of CIT_DEMOS) expect(html).not.toContain(`data-testid="cit-demo-${k}"`);
    expect(src('components/bank/PresetDock.tsx')).toContain('<CitDockPicker />');
    expect(src('components/ops/LoadingBayPanel.tsx')).toContain('<CitDemoPicker');
    expect(src('components/ops/CitPanel.tsx')).not.toContain('export function CitDemoButtons');
    // One dropdown component behind the payment dock and the CIT picker.
    expect(src('components/bank/PresetDock.tsx')).toContain('<ScenarioPicker');
    expect(src('components/ops/CitPanel.tsx')).toContain('<ScenarioPicker');
  });

  it('runs the picked scenario from its one Run button', () => {
    const html = renderToStaticMarkup(createElement(CitDemoPicker));
    expect(html).toContain('data-testid="cit-demo-run"');
    expect(html).toContain('data-picked="ATM"');
  });
});

describe('3. the SBV deposit / withdrawal toggle', () => {
  it('lays a single-case sheet out with the 📖 on the far left and the action centred on one line', () => {
    const html = renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo('09-cit-sbv'), liveStr: 0 }));
    expect(html).toContain('data-testid="spi-single-case"');
    expect(html).toMatch(/data-testid="spi-single-case"[^>]*><[^>]*data-testid="subprocess-lesson"/);
    expect(html).toContain('data-testid="sbv-toggle"');
  });

  it('switches all six knowledge sections with the case', () => {
    const D = SBV_CASE_SHEETS.DEPOSIT;
    const W = SBV_CASE_SHEETS.WITHDRAW;
    expect(D.overview.en).not.toBe(W.overview.en);
    expect(D.steps.map((x) => x.en)).not.toEqual(W.steps.map((x) => x.en));
    expect(D.impact[0]!.en).not.toBe(W.impact[0]!.en);
    expect(D.risks[0]!.en).not.toBe(W.risks[0]!.en);
    expect(D.gl).not.toEqual(W.gl);
    expect(D.kpi.sla.en).not.toBe(W.kpi.sla.en);
    expect(D.legal.length).toBeGreaterThan(0);
    // The drawer shows the picked case's sheet (a static render reads the store's first state, so the views are rendered directly).
    expect(src('components/ops/SubProcessInfoDrawer.tsx')).toContain("infoKey === '09-cit-sbv' ? SBV_CASE_SHEETS[sbvCase]");
    setActiveLocale('vi');
    const w = renderToStaticMarkup(createElement(SubProcessInfoView, { info: W, liveStr: 0 }));
    expect(w).toContain('Case Rút tiền');
    expect(w).toContain('Nợ 1131 / Có 1121');
    const d = renderToStaticMarkup(createElement(SubProcessInfoView, { info: D, liveStr: 0 }));
    expect(d).toContain('Case Nộp tiền');
    expect(d).toContain('🟢 Case Nộp Tiền (Deposit)');
    expect(d).toContain('🔴 Case Rút Tiền (Withdrawal)');
    citStore.getState().setSbvCase('WITHDRAW');
    expect(citStore.getState().sbvCase).toBe('WITHDRAW');
  });

  it('names the SBV as the central bank and ProcessCraft as a commercial bank', () => {
    expect(SBV_DOMAIN.centralBank.en).toMatch(/central bank/);
    expect(SBV_DOMAIN.commercialBank.en).toMatch(/commercial bank/);
    expect(subProcessInfo('09-cit-sbv').overview.vi).toContain('ngân hàng trung ương');
  });

  it('sends the run the toggle picked, whatever the live rule says', () => {
    const book = citNow().book;
    for (const mode of ['DEPOSIT', 'WITHDRAW'] as const) expect(sbvMode(sbvCasePlan(book, false, mode).direction)).toBe(mode);
    // The live rule pointing the same way is kept as it is.
    const auto = sbvPlan(book, false);
    expect(sbvCasePlan(book, false, sbvMode(auto.direction))).toEqual(auto);
    bankStore.getState().skipTo(AT);
    citStore.getState().setSbvCase('WITHDRAW');
    expect(dispatchCitDemo('SBV')).toBe(true);
    expect(citNow().lock?.run.order.direction).toBe('IN');
    cancelDemo();
    citStore.getState().setSbvCase('DEPOSIT');
    expect(dispatchCitDemo('SBV')).toBe(true);
    expect(citNow().lock?.run.order.direction).toBe('OUT');
  });
});

describe('4. the vault network, its wires and the Loading Bay', () => {
  it('draws the vault ↔ teller, ATM and bay wires with their direction in 2D', () => {
    const lit = renderToStaticMarkup(createElement(CashLinesView, { flows: [], route: new Set(CASH_ENDPOINTS) }));
    for (const e of CASH_ENDPOINTS) expect(lit).toContain(`data-testid="cash-wire-label-${e}"`);
    expect(lit).toContain('Cash out/in ➔ Teller');
    const out = renderToStaticMarkup(createElement(CashLinesView, { flows: [{ id: 'x', endpoint: 'TELLER', dir: 'OUT', source: 'retail' } as never] }));
    expect(out).toContain('data-dir="OUT"');
    expect(out).toContain('Cash out ➔ Teller');
    for (const e of CASH_ENDPOINTS) {
      const { x, y } = cashWireLabel(e, 140);
      expect(x).toBeLessThan(STAGE.width);
      expect(y).toBeGreaterThan(0);
    }
    // The teller line runs straight along the corridor at y 944: no loop under it.
    expect(src('engine/plan/layout.ts')).toContain('CASH_CORRIDOR = { x: 1306, y: 944 }');
  });

  it('labels the same wires in 3D', () => {
    const v = src('components/bank/office/VaultCash3D.tsx');
    expect(v).toContain('<WireLabels3D');
    expect(v).toContain('vault-wire-label-');
  });

  it('highlights the bay only in Flow 09, and opens its inspector from both maps', () => {
    let opened = 0;
    const view = (lit: boolean): string => renderToStaticMarkup(createElement(CitBayView, { cit: citNow(), live: true, lit, onOpen: () => opened++ }));
    expect(view(true)).toContain('data-lit="true"');
    expect(view(false)).toContain('data-lit="false"');
    expect(view(false)).toContain('data-testid="cit-bay"');
    expect(src('components/bank/CitBay2D.tsx')).toContain('activeFlowOf(s) === CIT_FLOW');
    // 3D: a thin floor pad (the van and the crew stand above it), and the floating label is a button too.
    const bay3d = src('components/bank/office/LoadingBay3D.tsx');
    expect(bay3d).toContain('BAY_HIT_SIZE = { h: 0.06, y: 0.03 }');
    expect(bay3d).toMatch(/data-testid="cit-bay-label-3d"/);
    expect(bay3d).toMatch(/onClick=\{\(\) => bankStore\.getState\(\)\.select\(\{ kind: 'bay' \}\)\}/);
    expect(opened).toBe(0);
  });

  it('lands the off-site end on the back lane, along the van’s own drive', () => {
    expect(OFFSITE).toEqual(LANE_EXIT);
    const path = hopPath3D({ place: null, cit: 'BAY' }, { place: null, cit: 'SBV' });
    expect(path[path.length - 1]).toEqual(LANE_EXIT);
    expect(path.length).toBeGreaterThan(2);
    expect(BADGE_Y_3D).toBeGreaterThanOrEqual(2.2);
    expect(BADGE_Y_3D).toBeLessThanOrEqual(2.5);
  });
});

describe('5. the internal till run', () => {
  it('headlines the toast as an internal transfer, never as a van', () => {
    expect(dispatchTitle('TELLER').vi).toBe('Điều chuyển nội bộ Quầy ↔ Kho');
    bankStore.getState().skipTo(AT);
    expect(dispatchCitDemo('TELLER')).toBe(true);
    const toast = notificationStore.getState().queue.find((n) => n.source === 'cit-demo:TELLER')!;
    expect(`${toast.icon} ${toast.title.vi}`).toBe('🚚 Điều chuyển nội bộ Quầy ↔ Kho');
    expect(toast.title.vi).not.toContain('Đã điều xe CIT');
  });
});

describe('6. the demo lock, the cancel dialog and the automatic pause', () => {
  it('pauses the bank for every demo, locks the navigation and turns Run into "Hủy demo"', () => {
    bankStore.getState().skipTo(AT);
    bankStore.getState().play();
    expect(dispatchCitDemo('ATM')).toBe(true);
    expect(bankStore.getState().playing).toBe(false);
    expect(demoLocked()).toBe(true);
    // Nothing else starts and the menu holds while it runs.
    expect(dispatchCitDemo('SBV')).toBe(false);
    const flow = bankStore.getState().flow;
    selectSubProcess('card-fees');
    runDemo('pos-20');
    expect(bankStore.getState().flow).toBe(flow);
    setActiveLocale('vi');
    const html = renderToStaticMarkup(createElement(RunOrCancel, null, createElement('button', null, 'Thực hiện')));
    expect(html).toContain('data-testid="demo-cancel"');
    expect(html).toContain('Hủy demo');
    expect(html).not.toContain('Thực hiện');
    expect(src('components/bank/SubProcessMenu.tsx')).toContain('disabled={locked}');
  });

  it('asks before it cancels, and only Yes stops the run and unlocks', () => {
    bankStore.getState().skipTo(AT);
    expect(dispatchCitDemo('DOORSTEP')).toBe(true);
    setActiveLocale('vi');
    expect(renderToStaticMarkup(createElement(CancelDemoDialog))).toBe('');
    demoSessionStore.getState().askCancel();
    expect(demoSessionStore.getState().confirming).toBe(true);
    const dialog = renderToStaticMarkup(createElement(CancelDemoView, { onKeep: () => undefined, onConfirm: () => undefined }));
    expect(dialog).toContain('Bạn có chắc chắn muốn hủy demo?');
    expect(dialog).toContain('data-testid="cancel-demo-confirm"');
    // "Keep watching" leaves it running.
    demoSessionStore.getState().dismissCancel();
    expect(demoLocked()).toBe(true);
    demoSessionStore.getState().askCancel();
    cancelDemo();
    expect(demoLocked()).toBe(false);
    expect(citStore.getState().manual).toHaveLength(0);
    expect(citNow().lock).toBeNull();
    expect(bankStore.getState().playing).toBe(false);
  });

  it('plays a payment alone and leaves the clock paused when it is done', () => {
    bankStore.getState().skipTo(AT);
    bankStore.getState().play();
    executeDemo('pos-20');
    const s = bankStore.getState();
    expect(s.solo).toBe(true);
    expect(demoSessionStore.getState().active).toMatchObject({ kind: 'payment', id: s.presetTxId });
    for (let i = 0; i < 200 && bankStore.getState().playing; i++) bankStore.getState().tickBeat();
    expect(bankStore.getState().playing).toBe(false);
    expect(bankStore.getState().presetTrace?.done).toBe(true);
    expect(demoRunning()).toBe(false);
  });
});

describe('7. the closed-day sandbox and the night van', () => {
  it('plays a scenario on a closed day in a sandbox, never rolling the clock into the next day', () => {
    bankStore.getState().skipToEndOfDay();
    const day = bankStore.getState().view.day;
    runDemoAnytime('pos-20');
    const s = bankStore.getState();
    expect(s.view.day).toBe(day);
    expect(s.view.dayOver).toBe(true);
    expect(s.sandboxTrace?.route.length).toBeGreaterThan(1);
    expect(sandboxSource(s.sandboxTrace)).toMatchObject({ kind: 'payment', over: false });
    expect(demoSessionStore.getState().active).toMatchObject({ kind: 'sandbox', id: s.sandboxTrace!.id });
    expect(src('components/bank/retailOpsActions.ts')).not.toMatch(/runDemoAnytime[\s\S]{0,400}startNextDay/);
  });

  it('lets a van whose run was dropped at the day’s turn drive off without holding the lock', () => {
    expect(manualIndexOf('CIT-3-M2', 3)).toBe(1);
    expect(manualIndexOf('CIT-3-M2', 4)).toBe(-1);
    const today = { day: 4, manual: [{ kind: 'ATM' as const, at: AT }] };
    expect(vanOrphaned(null, today, 4)).toBe(false);
    expect(vanOrphaned('CIT-4-M1', today, 4)).toBe(false);
    // The night run of day 3, pruned when day 4 began.
    expect(vanOrphaned('CIT-3-M1', today, 4)).toBe(true);
    // A cancelled run (gone from the list).
    expect(vanOrphaned('CIT-4-M2', today, 4)).toBe(true);
    expect(src('components/bank/office/WorldProvider.tsx')).toContain('citSolo: !s.playing && (orphan || citSoloActive())');
  });
});

describe('8. the single-case EoD', () => {
  it('purges what earlier flows left on screen, then shows one batch case at 23:00, paused', () => {
    bankStore.getState().skipTo(AT);
    executeDemo('pos-20');
    expect(bankStore.getState().presetTxId).not.toBeNull();
    vaultFlowStore.getState().push({ id: 'echo', endpoint: 'TELLER', dir: 'IN', source: 'retail' } as never);
    demoSessionStore.getState().finish();
    purgeForEod();
    expect(bankStore.getState().presetTxId).toBeNull();
    expect(hopPlayerStore.getState().session).toBeNull();
    expect(vaultFlowStore.getState().retail).toHaveLength(0);
    executeDemo('eod');
    const s = bankStore.getState();
    expect(s.view.minute).toBe(EOD_START);
    expect(s.playing).toBe(false);
    expect(s.solo).toBe(false);
    expect(s.presetTxId).toBeNull();
    expect(s.sandboxTrace?.route).toEqual(['OUT_APPROVED', 'EOD_BATCH', 'EOD_VISA', 'RECON', 'OUT_SETTLED']);
    expect(demoSessionStore.getState().active).toMatchObject({ kind: 'sandbox', id: s.sandboxTrace!.id });
  });
});

describe('9. pacing, freeze and lighter graphics', () => {
  it('plays a six-stop payment in about 12–15 s (a relaxed, traceable pace)', () => {
    const hop = HOP_TIMING.show + HOP_TIMING.travel;
    expect(hop).toBeGreaterThanOrEqual(2);
    expect(hop).toBeLessThanOrEqual(2.5);
    let p = startPlay();
    let t = 0;
    for (; t < 30; t += 0.04) {
      const next = stepPlay(p, 0.04, 6, 5);
      if (!next) break;
      p = next;
    }
    expect(t).toBeGreaterThanOrEqual(12);
    expect(t).toBeLessThanOrEqual(15);
  });

  it('freezes the hop mid-motion while the learner has paused the payment, and lets a finished one play out', () => {
    const trace = { id: 'p1', route: ['GATE_POS', 'OUT_APPROVED'], at: 0, done: false } as never;
    const session = { kind: 'payment' as const, id: 'tx:p1' };
    const still = { view: {} as never, stepView: null };
    expect(hopFrozen({ ...still, playing: false, presetTrace: trace }, session)).toBe(true);
    expect(hopFrozen({ ...still, playing: true, presetTrace: trace }, session)).toBe(false);
    expect(hopFrozen({ ...still, playing: false, presetTrace: { ...(trace as object), done: true } as never }, session)).toBe(false);
    expect(hopFrozen({ ...still, playing: false, presetTrace: trace }, { kind: 'cit', id: 'cit:x' })).toBe(false);
    // A frozen tick holds the play exactly where it was.
    hopPlayerStore.setState({ session: { id: 'tx:p1', kind: 'payment', stops: [{ place: 'GATE_POS', cit: null }, { place: 'OUT_APPROVED', cit: null }], route: ['GATE_POS', 'OUT_APPROVED'], icon: '💳' }, play: { index: 0, phase: 'travel', t: 0.3 } });
    hopPlayerStore.getState().tick(0.2, [], true);
    expect(hopPlayerStore.getState().play).toEqual({ index: 0, phase: 'travel', t: 0.3 });
  });

  it('fits a long route into a dense 2D badge', () => {
    expect(badgeFit2D(5)).toEqual({ max: 3, dense: true });
    expect(badgeFit2D(3).dense).toBe(false);
  });

  it('pools the vault sparks: the pool never grows past its cap and reuses what is handed back', () => {
    let made = 0;
    const pool = new ObjectPool(() => ({ n: made++ }), STREAM_POOL_CAP);
    const out = Array.from({ length: STREAM_POOL_CAP + 2 }, () => pool.acquire());
    expect(out.filter(Boolean)).toHaveLength(STREAM_POOL_CAP);
    expect(STREAM_POOL_CAP).toBe(STREAM_SPARKS * 3);
    pool.release(out[0]!);
    expect(pool.acquire()).toBe(out[0]);
    expect(made).toBe(STREAM_POOL_CAP);
  });
});

describe('10. leftovers', () => {
  it('drops flowBeat / routeMode and keeps only nodeMode', () => {
    expect(Object.keys(flowBeat)).toEqual(['nodeMode']);
  });

  it('gives the CIT children, the cash CTR group and Flow 08 lessons of their own', () => {
    const keys = ['09-cit-atm', '09-cit-doorstep', '09-cit-sbv', '09-cit-teller-vault', 'cash-ctr', 'flow-8'] as const;
    const anchors = keys.map((k) => lessonAnchor(k));
    expect(new Set(anchors).size).toBe(keys.length);
    expect(lessonAnchor('cash-ctr')).toBe('aml-cash-ctr');
    expect(lessonAnchor('flow-8')).toBe('aml-swift-disputes');
    expect(lessonAnchor('flow-8')).not.toBe(lessonAnchor('swift-remit'));
  });
});
