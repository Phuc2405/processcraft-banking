/**
 * The executive fix pass: demos at their own time (no 10:00 jump), one EoD case, only the demo's own case on screen, the CIT hall dimmed
 * outside Flow 09 and lit by hover in 3D, reading left open during a demo, the retail-ops chunk, contextual wire labels clear of every
 * card, no run button on any parent flow sheet (01-09), and the feedback form laid out as one left-aligned column.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CashLinesView } from '../../components/bank/CashLines2D';
import { BAY_ROWS, CitBayView } from '../../components/bank/CitBay2D';
import { demoLocked, isolateMoves } from '../../components/bank/DemoSession';
import { LIT_TUBE_RADIUS } from '../../components/bank/office/VaultCash3D';
import { executeDemo, runDemoAnytime } from '../../components/bank/retailOpsActions';
import { citMessages, wireLabelKey } from '../../components/ops/cit.messages';
import { citNow, dispatchCitDemo } from '../../components/ops/citActions';
import { SubProcessInfoView } from '../../components/ops/SubProcessInfoDrawer';
import { FeedbackModal } from '../../components/shell/FeedbackModal';
import { subProcessInfo } from '../../data/subProcessRegistry';
import { CIT_BAY, cashWireLabel, PLACE_BOX, STAGE, WIRE_BADGE, wireBadgeWidth } from '../../engine/plan/layout';
import { setActiveLocale } from '../../i18n/localeCore';
import { bankStore, EOD_CASE_ROUTE } from '../../store/bankStore';
import { citStore } from '../../store/citStore';
import { demoSessionStore } from '../../store/demoSessionStore';
import { hopPlayerStore } from '../../store/hopPlayerStore';
import { FLOW_IDS, type FlowId } from '../../types/viewport';
import { message } from '../../utils/i18nHelper';
import { CASH_WIRES, litWires, routeDirs, type CashWire } from '../cashWires';
import { EOD_START, WORK_START } from '../clock';
import { COUNTER_LATE_SLOT, demoMinute } from '../demoSchedule';
import { childSheetsOf, sheetDemo } from '../sheetDemo';

const src = (p: string): string => readFileSync(join(__dirname, '../..', p), 'utf8');

function fresh(): void {
  demoSessionStore.getState().finish();
  hopPlayerStore.getState().reset();
  bankStore.getState().resetDay();
  bankStore.getState().clearDemo();
  bankStore.getState().setActiveFlow(1);
  citStore.setState({ day: -1, manual: [], van: false, sbvCase: 'DEPOSIT' });
}
beforeEach(fresh);
afterEach(() => setActiveLocale('en'));

const closeToday = (): void => {
  bankStore.getState().skipTo(EOD_START);
  bankStore.getState().skipToEndOfDay();
};

describe('1. demos at their own time, one case, nothing else on screen', () => {
  it('plays a closed-day scenario at its designated time, never at a made-up 10:00 peak', () => {
    expect(demoMinute('eod', 30)).toBe(EOD_START);
    expect(demoMinute('teller-12k', 7 * 60)).toBe(WORK_START);
    expect(demoMinute('teller-12k', 22 * 60)).toBe(COUNTER_LATE_SLOT);
    expect(demoMinute('teller-12k', 14 * 60)).toBe(14 * 60);
    expect(demoMinute('qr-780', 22 * 60 + 5)).toBe(22 * 60 + 5);
    expect(src('store/bankStore.ts')).not.toContain('SANDBOX_MINUTE');
    closeToday();
    const day = bankStore.getState().view.day;
    runDemoAnytime('teller-12k');
    const s = bankStore.getState();
    expect(s.view.day).toBe(day);
    expect(s.view.dayOver).toBe(true);
    // The replay's payment arrived at the counter's own late slot (16:30), not at 10:00.
    expect((s.sandboxTrace as { bornMinute?: number } | null)?.bornMinute).toBeGreaterThanOrEqual(COUNTER_LATE_SLOT);
  });

  it('runs the EoD demo as ONE batch case at 23:00, paused, the rest of the night waiting for Play', () => {
    bankStore.getState().skipTo(10 * 60);
    executeDemo('eod');
    const s = bankStore.getState();
    expect(s.view.minute).toBe(EOD_START);
    expect(s.playing).toBe(false);
    expect(s.presetTxId).toBeNull();
    expect(s.sandboxTrace?.route).toEqual([...EOD_CASE_ROUTE]);
    expect(demoSessionStore.getState().active).toMatchObject({ kind: 'sandbox', id: s.sandboxTrace!.id });
    // The hop player takes that one case (and only it).
    hopPlayerStore.getState().tick(0, [{ id: `sbx:${s.sandboxTrace!.id}`, kind: 'payment', stops: EOD_CASE_ROUTE.map((place) => ({ place, cit: null })), route: [...EOD_CASE_ROUTE], icon: '📦', reached: EOD_CASE_ROUTE.length - 1, over: false }]);
    expect(hopPlayerStore.getState().session?.id).toBe(`sbx:${s.sandboxTrace!.id}`);
  });

  it('draws only the demo’s own case while it runs: no other packets, queues or passers-by, on either map', () => {
    const moves = [{ packetId: 'mine' }, { packetId: 'other' }, { packetId: 'night-1' }];
    expect(isolateMoves(moves, false, 'mine')).toHaveLength(3);
    expect(isolateMoves(moves, true, 'mine')).toEqual([{ packetId: 'mine' }]);
    expect(isolateMoves(moves, true, null)).toEqual([]);
    const map = src('components/bank/BankMap.tsx');
    expect(map).toContain('isolateMoves(view.moves, isolated, presetId)');
    expect(map).toContain('{!focus && !isolated && <DeskCrowd2D />}');
    const office = src('components/bank/office/OfficeScene.tsx');
    for (const layer of ['Evacuation', 'Park3D', 'Pedestrians', 'Arrivals', 'PeopleTags3D', 'SignalPulses']) expect(office).toContain(`{!isolated && <${layer} />}`);
    expect(src('components/bank/office/Traffic.tsx')).toContain('isolateMoves(state.view.moves, stageIsolated(), state.presetTxId)');
    expect(src('components/bank/office/Desk3D.tsx')).toContain('<group visible={!isolated} name={`desk-queue-${id}`}>');
  });
});

describe('2. the CIT hall: dimmed outside Flow 09, lit by hover in 3D', () => {
  it('greys the 2D hall out whenever Flow 09 is not the lit flow', () => {
    const view = (lit: boolean): string => renderToStaticMarkup(createElement(CitBayView, { cit: citNow(), live: true, lit, onOpen: () => undefined }));
    expect(view(false)).toMatch(/data-testid="cit-bay"[^>]*class="[^"]*opacity-40[^"]*grayscale/);
    expect(view(true)).not.toContain('opacity-40');
    const bay3d = src('components/bank/office/LoadingBay3D.tsx');
    expect(bay3d).toContain("opacity: lit || selected || hover ? 1 : 0.4");
    expect(bay3d).toContain("filter: lit || selected || hover ? undefined : 'grayscale(1)'");
  });

  it('lights the hall’s wires (to the vault and the teller) from its 3D pad and its always-visible label, as a glowing tube', () => {
    expect(litWires(2, null, 'BAY')).toEqual(new Set<CashWire>(['BAY', 'BAY_TELLER']));
    const bay3d = src('components/bank/office/LoadingBay3D.tsx');
    expect(bay3d).toContain("useWireHoverStore.getState().set(on ? 'BAY' : null)");
    expect(bay3d).toContain('onPointerEnter={() => point(true)}');
    expect(bay3d).toContain('onPointerLeave={() => point(false)}');
    expect(bay3d).toMatch(/onPointerOver=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*point\(true\);/);
    const vault = src('components/bank/office/VaultCash3D.tsx');
    expect(vault).toContain("route?.has(w) ? <primitive key={`tube-${w}`} object={LIT_TUBE[w]} /> : null");
    expect(LIT_TUBE_RADIUS).toBeGreaterThan(0.02);
  });
});

describe('3. reading stays open during a demo; only run triggers and the flow switcher lock', () => {
  it('keeps the sheet’s related links, the SBV toggle and the scenario dropdowns usable while a demo runs', () => {
    bankStore.getState().skipTo(10 * 60);
    expect(dispatchCitDemo('ATM')).toBe(true);
    expect(demoLocked()).toBe(true);
    const html = renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo('09-cit-sbv'), liveStr: 0.5 }));
    expect(html).toMatch(/data-testid="spi-go-[^"]+"/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="spi-go-/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="sbv-toggle-switch"/);
    // "Show on map" switches the lit flow, so it waits; the run button is "Hủy demo".
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="spi-show"/);
    expect(html).toContain('data-testid="demo-cancel"');
    expect(src('components/bank/PresetDock.tsx')).not.toContain('disabled={locked}');
    expect(src('components/ops/CitPanel.tsx')).not.toMatch(/ScenarioPicker[^\n]*disabled=\{locked\}/);
    expect(src('components/bank/WelcomeModal.tsx')).toContain("mode.id === 'academy' ? () => mode.pick(actions)");
    // The top flow switcher stays locked.
    expect(src('components/bank/SubProcessMenu.tsx')).toContain('disabled={locked}');
  });
});

describe('4. the retail-ops chunk', () => {
  it('keeps no retail-ops group: it put sim/retailOps in one chunk with retailOpsActions, a chunk cycle that blanked the page', () => {
    const vite = src('../vite.config.ts');
    expect(vite).toContain('includeDependenciesRecursively: false');
    expect(vite).not.toMatch(/name: 'retail-ops'/);
  });
});

describe('5. contextual wire labels', () => {
  const vi = (w: CashWire, d: 'IN' | 'OUT' | null): string => message(citMessages, wireLabelKey(w, d), undefined, 'vi');

  it('names the station each wire serves', () => {
    expect(vi('TELLER', null)).toBe('Xuất/Nhập quỹ ➔ Quầy GDV');
    expect(vi('ATM', null)).toBe('Tiếp/Rút quỹ ➔ Hộc ATM');
    expect(vi('BAY', null)).toBe('Điều chuyển ➔ Sảnh CIT');
    expect(vi('BAY_TELLER', null)).toBe('Nộp/Rút ➔ Quầy GDV');
    expect(vi('ATM', 'OUT')).toBe('Xuất quỹ ➔ Hộc ATM');
    expect(vi('TELLER', 'IN')).toBe('Nhập quỹ ⬅ Quầy GDV');
  });

  it('reads the picked scenario’s own movement: an ATM top-up is "Xuất quỹ ➔ Hộc ATM", the SBV child follows its toggle', () => {
    expect(routeDirs('ATM')).toEqual({ BAY: 'OUT', ATM: 'OUT' });
    expect(routeDirs('DOORSTEP')).toEqual({ BAY: 'IN' });
    expect(routeDirs('SBV', 'IN')).toEqual({ BAY: 'IN' });
    setActiveLocale('vi');
    const html = renderToStaticMarkup(createElement(CashLinesView, { flows: [], route: litWires(9, 'ATM', null), dirs: routeDirs('ATM') }));
    expect(html).toMatch(/cash-wire-label-ATM" data-dir="OUT"[\s\S]*?Xuất quỹ ➔ Hộc ATM/);
    expect(html).toMatch(/cash-wire-label-BAY" data-dir="OUT"[\s\S]*?Xuất quỹ ➔ Sảnh CIT/);
    // A live movement glows its badge.
    const live = renderToStaticMarkup(createElement(CashLinesView, { flows: [{ id: 'x', endpoint: 'TELLER', dir: 'IN', source: 'retail' } as never] }));
    expect(live).toMatch(/cash-wire-label-TELLER" data-dir="IN" data-live="true"[\s\S]*?Nhập quỹ ⬅ Quầy GDV/);
  });

  it('keeps every label (both languages, every direction) on the stage, off every card and the hall’s text rows, and apart from each other', () => {
    const cards = [...Object.values(PLACE_BOX).map((b) => ({ x0: b.cx - b.w / 2, x1: b.cx + b.w / 2, y0: b.cy - b.h / 2, y1: b.cy + b.h / 2 })), { x0: CIT_BAY.x, x1: CIT_BAY.x + CIT_BAY.w, y0: CIT_BAY.y + BAY_ROWS.header, y1: CIT_BAY.y + CIT_BAY.h }];
    const clear = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a): boolean => a.x1 <= b.x0 || a.x0 >= b.x1 || a.y1 <= b.y0 || a.y0 >= b.y1;
    for (const locale of ['en', 'vi'] as const) {
      for (const d of [null, 'IN', 'OUT'] as const) {
        const boxes = CASH_WIRES.map((w) => {
          const width = wireBadgeWidth(message(citMessages, wireLabelKey(w, d), undefined, locale));
          const l = cashWireLabel(w, width);
          const [hw, hh] = l.vertical ? [WIRE_BADGE.h / 2, width / 2] : [width / 2, WIRE_BADGE.h / 2];
          return { w, x0: l.x - hw, x1: l.x + hw, y0: l.y - hh, y1: l.y + hh };
        });
        for (const b of boxes) {
          expect(b.x0 >= 0 && b.x1 <= STAGE.width && b.y0 >= 0 && b.y1 <= STAGE.height, `${b.w} ${locale} ${d} on the stage`).toBe(true);
          for (const c of cards) expect(clear(b, c), `${b.w} ${locale} ${d} clear of the card at ${c.x0},${c.y0}`).toBe(true);
          for (const o of boxes) if (o !== b) expect(clear(b, o), `${b.w} vs ${o.w} ${locale} ${d}`).toBe(true);
        }
      }
    }
    // The ATM label reads level on its own run along y 374 (no rotated text up the margin).
    expect(cashWireLabel('ATM', 140)).toMatchObject({ y: 374, vertical: false });
  });

  it('floats the 3D labels over the arc tops, with the same station text', () => {
    const vault = src('components/bank/office/VaultCash3D.tsx');
    expect(vault).toContain('position={[x, y + LABEL_LIFT, z]}');
    expect(vault).toContain('{m(wireLabelKey(e, dir))}');
  });
});

describe('6. no run button on any parent flow sheet (01-09)', () => {
  it('shows the process title and a sub-process selector, never "▶ Chạy thử kịch bản này"', () => {
    setActiveLocale('vi');
    for (const flow of FLOW_IDS as readonly FlowId[]) {
      const key = `flow-${flow}` as const;
      expect(sheetDemo(key), key).toBeNull();
      const html = renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo(key), liveStr: 0.5 }));
      expect(html, key).not.toContain('▶ Chạy thử kịch bản này');
      for (const id of ['spi-run', 'spi-run-scenario', 'cit-run-scenario', 'cit-demo-picker', 'demo-cancel']) expect(html, `${key} ${id}`).not.toContain(`data-testid="${id}"`);
      expect(html, key).toContain('Thông tin quy trình<');
      if (childSheetsOf(flow).length) expect(html, key).toContain('data-testid="spi-child-picker"');
    }
  });

  it('keeps the run on each child sheet the selector opens', () => {
    setActiveLocale('vi');
    for (const flow of FLOW_IDS as readonly FlowId[]) {
      for (const child of childSheetsOf(flow)) {
        expect(sheetDemo(child), child).not.toBeNull();
        expect(renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo(child), liveStr: 0.5 })), child).toContain('▶ Chạy thử kịch bản này');
      }
    }
    expect([...childSheetsOf(9)].sort()).toEqual(['09-cit-atm', '09-cit-doorstep', '09-cit-sbv', '09-cit-teller-vault']);
  });
});

describe('7. the feedback form layout', () => {
  it('stacks every field as its label over a full-width control, left-aligned', () => {
    setActiveLocale('vi');
    const html = renderToStaticMarkup(createElement(FeedbackModal, { onClose: () => undefined, endpoint: '' }));
    expect(html).toMatch(/<fieldset class="[^"]*flex w-full min-w-0 flex-col[^"]*text-left/);
    for (const f of ['kind', 'text', 'reply', 'attach']) expect(html).toMatch(new RegExp(`class="flex w-full min-w-0 flex-col items-stretch gap-1 text-left" data-testid="feedback-field-${f}"`));
    expect(html).toMatch(/<textarea[^>]*class="block w-full/);
    expect(html).toMatch(/<input type="email"[^>]*class="block w-full/);
    expect(html).toMatch(/Nội dung|NỘI DUNG/i);
    // Nothing in the form pushes a control right.
    const form = html.slice(html.indexOf('<fieldset'), html.indexOf('</fieldset>'));
    expect(form).not.toMatch(/ml-auto|justify-end|text-right|float-right/);
  });
});
