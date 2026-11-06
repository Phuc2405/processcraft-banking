/**
 * The sub-process info drawer and its registry, and the manual CIT demo dispatches: registry integrity, drawer rendering, how the
 * drawer is selected, the dispatch pipeline and its GL, replay and day-change safety, and the 3D van following the CIT schedule.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MENU_CHOICES, showInfo } from '../../components/bank/SubProcessMenu';
import { citNow, dispatchCitDemo, installCitSync, settleAtmRefills } from '../../components/ops/citActions';
import { CitDemoPicker } from '../../components/ops/CitPanel';
import { SubProcessInfoView } from '../../components/ops/SubProcessInfoDrawer';
import { regDocById } from '../../data/regulatoryRegistry';
import { RETAIL_FLASHCARDS } from '../../data/retailFlashcards';
import { STP_ARTICLE, STP_REF } from '../../data/stpKnowledge';
import { CIT_ARTICLE, CIT_REF } from '../../data/citKnowledge';
import { StpArticle } from '../../components/knowledge/KnowledgeBaseModal';
import { glLine, INFO_KEYS, infoKeyForChoice, infoKeyForPlace, isInfoKey, SUB_PROCESS_REGISTRY, subProcessInfo } from '../../data/subProcessRegistry';
import { BANK_WIRES, type Wire } from '../../engine/plan/layout';
import { OFFICE_WIRES } from '../../engine/plan/officePlan';
import { CitRun } from '../../engine/world/citRun';
import { citRoutes } from '../../engine/world/parking';
import { setActiveLocale } from '../../i18n/localeCore';
import { bankStore } from '../../store/bankStore';
import { citStore } from '../../store/citStore';
import { retailOpsStore } from '../../store/retailOpsStore';
import { FLOW_IDS } from '../../types/viewport';
import { bookAfter, citAt, citBayRun, CIT_DEMOS, CIT_LIMITS, CIT_TIMING, citDemoBusy, entryBalanced, manualOrder, manualPlan, CIT_OPENING, type CitManual } from '../citEngine';
import { OPS_LIMITS } from '../retailOps';
import { STATION_IDS } from '../topology';

afterEach(() => setActiveLocale('en'));

describe('the sub-process registry', () => {
  it('has a sheet for each of the nine flows (Flow 09 is the CIT domain) and the AML, 3DS and Pay-in-4 domains', () => {
    for (const f of FLOW_IDS) expect(isInfoKey(`flow-${f}`), `flow ${f}`).toBe(true);
    for (const k of ['flow-9', 'aml-sanctions', 'token-3ds', 'bnpl-credit']) expect(isInfoKey(k)).toBe(true);
    expect(FLOW_IDS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Object.keys(SUB_PROCESS_REGISTRY).sort()).toEqual([...INFO_KEYS].sort());
    for (const k of INFO_KEYS) expect(FLOW_IDS).toContain(SUB_PROCESS_REGISTRY[k].flow);
  });

  it('fills every section in both languages, with unique process codes', () => {
    const codes = INFO_KEYS.map((k) => subProcessInfo(k).code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const k of INFO_KEYS) {
      const e = subProcessInfo(k);
      for (const text of [e.title, e.overview, e.kpi.sla, e.kpi.note, ...e.steps, ...e.impact, ...e.risks, ...e.actors.map((a) => a.duty)]) {
        expect(text.en.trim(), `${k} en`).not.toBe('');
        expect(text.vi.trim(), `${k} vi`).not.toBe('');
      }
      expect(e.actors.length, k).toBeGreaterThanOrEqual(2);
      expect(e.steps.length, k).toBeGreaterThanOrEqual(3);
      for (const r of e.related) expect(isInfoKey(r), `${k} → ${r}`).toBe(true);
    }
  });

  it('cites only documents the regulatory registry holds, and names GL lines from the books that own them', () => {
    for (const k of INFO_KEYS) {
      const e = subProcessInfo(k);
      for (const id of e.legal) expect(regDocById(id), `${k}: ${id}`).toBeDefined();
      for (const ref of e.gl) {
        const g = glLine(ref, 'vi');
        expect(g.code, k).toMatch(/^\d{4}$/);
        expect(g.name, k).not.toBe('');
      }
    }
    const cit = subProcessInfo('flow-9').gl.map((r) => glLine(r, 'en').code);
    for (const code of ['1131', '1111', '1113', '4211']) expect(cit).toContain(code);
  });

  it('resolves every menu choice and every desk on the map to a sheet', () => {
    for (const c of MENU_CHOICES) expect(isInfoKey(infoKeyForChoice(c.flow, c.kind === 'sub' ? c.sub : null))).toBe(true);
    expect(infoKeyForChoice(2, 'bnpl-credit')).toBe('bnpl-credit');
    expect(infoKeyForChoice(6, 'teller-vault')).toBe('teller-vault');
    expect(infoKeyForChoice(4, 'eod-batch')).toBe('flow-4');
    // The cash sheet belongs to the Main Cash Vault; the collateral desk reads the collateral sheet.
    expect(infoKeyForPlace('MAIN_CASH_VAULT')).toBe('flow-9');
    expect(infoKeyForPlace('COLLATERAL_VAULT')).toBe('collateral');
    expect(infoKeyForPlace('AML_DESK')).toBe('aml-sanctions');
    expect(infoKeyForPlace('SEC_3DS')).toBe('token-3ds');
    for (const id of STATION_IDS) {
      const k = infoKeyForPlace(id);
      if (k) expect(isInfoKey(k)).toBe(true);
    }
  });
});

describe('the info drawer', () => {
  const render = (key: (typeof INFO_KEYS)[number]) => renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo(key), liveStr: 0.42 }));

  it('renders the header and all seven sections for every sheet', () => {
    for (const k of INFO_KEYS) {
      const html = render(k);
      for (const id of ['spi-code', 'spi-mode', 'spi-close', 'spi-overview', 'spi-actors', 'spi-steps', 'spi-impact', 'spi-risks', 'spi-gl', 'spi-kpi']) expect(html, `${k}: ${id}`).toContain(`data-testid="${id}"`);
      expect(html).toContain(subProcessInfo(k).code);
      for (const a of subProcessInfo(k).actors) expect(html).toContain(`data-testid="spi-actor-${a.id}"`);
    }
  });

  it('shows the status badge, the live STR on automated sheets and the van dispatches on the CIT sheet, in Vietnamese', () => {
    setActiveLocale('vi');
    const cit = render('flow-9');
    expect(cit).toContain('data-mode="MANUAL"');
    expect(cit).toContain('Thủ công');
    expect(cit).toContain('📌 Tổng quan &amp; Định danh');
    expect(cit).toContain('📈 KPIs &amp; SLAs');
    expect(cit).toContain('data-code="1131"');
    // The parent Flow 09 sheet runs nothing itself: each CIT child's sheet (and the dock) carries the run.
    expect(cit).not.toContain('data-testid="cit-demo-picker"');
    expect(cit).not.toContain('▶ Chạy thử kịch bản này');
    for (const k of CIT_DEMOS) expect(cit).not.toContain(`data-testid="cit-demo-${k}"`);
    const bnpl = render('bnpl-credit');
    expect(bnpl).toContain('Kết hợp');
    expect(bnpl).toContain('42%');
    expect(bnpl).not.toContain('cit-demo-picker');
  });
});

describe('selecting the drawer', () => {
  beforeEach(() => bankStore.getState().clearSelection());

  it('opens the choice’s sheet from the top menu when nothing else is inspected', () => {
    showInfo({ kind: 'sub', flow: 2, sub: 'bnpl-credit' });
    expect(bankStore.getState().selection).toEqual({ kind: 'subprocess', key: 'bnpl-credit' });
    showInfo({ kind: 'flow', flow: 4 });
    expect(bankStore.getState().selection).toEqual({ kind: 'subprocess', key: 'flow-4' });
  });

  it('never replaces a desk or a payment the learner is inspecting, unless asked through the ⓘ button', () => {
    bankStore.getState().select({ kind: 'station', id: 'TELLER_CASH' });
    showInfo({ kind: 'flow', flow: 6 });
    expect(bankStore.getState().selection.kind).toBe('station');
    showInfo({ kind: 'flow', flow: 6 }, true);
    expect(bankStore.getState().selection).toEqual({ kind: 'subprocess', key: 'flow-6' });
  });
});

describe('manual CIT runs (engine)', () => {
  const DAY = 3;
  const at = 10 * 60 + 30;

  it('posts the dispatch at once, walks the states on the clock and settles with 1131 back to zero', () => {
    for (const kind of CIT_DEMOS) {
      const manual: CitManual[] = [{ kind, at }];
      const now = citAt(DAY, at, manual);
      const run = now.runs.find((r) => r.planned.order.id === `CIT-${DAY}-M1`)!.run!;
      expect(run.status, kind).toBe('EN_ROUTE');
      expect(run.entries[0]!.lines.some((l) => l.account === 'TRANSIT' && l.dr > 0), kind).toBe(true);
      const later = citAt(DAY, at + CIT_TIMING.SETTLED, manual);
      expect(later.runs.find((r) => r.planned.order.id === `CIT-${DAY}-M1`)!.run!.status, kind).toBe('SETTLED');
      for (const e of later.journal) expect(entryBalanced(e)).toBe(true);
    }
    const atm = citAt(DAY, at, [{ kind: 'ATM', at }]);
    expect(atm.vaultFlow).toBe('OUT');
    expect(citBayRun(atm)?.order.id).toBe(`CIT-${DAY}-M1`);
  });

  it('sizes an ATM run from the retail cassette’s shortfall when there is one, and SBV runs against the live vault', () => {
    expect(manualOrder(DAY, 1, { kind: 'ATM', at, refillCents: 1_234_000 }, CIT_OPENING).amountCents).toBe(1_234_000);
    expect(manualOrder(DAY, 1, { kind: 'ATM', at }, { ...CIT_OPENING, ATM: 500_000 }).amountCents).toBe(CIT_LIMITS.atmTargetCents - 500_000);
    const sbv = manualOrder(1, 1, { kind: 'SBV', at }, { ...CIT_OPENING, VAULT: CIT_LIMITS.sbvLineCents + 50_000_000 });
    expect(sbv.direction).toBe('OUT');
    expect(sbv.amountCents).toBe(50_000_000);
    expect(manualOrder(1, 1, { kind: 'SBV', at }, { ...CIT_OPENING, UNFIT: 0, VAULT: 100_000_000 }).direction).toBe('IN');
  });

  it('keeps the book square and 1131 at zero by night through any mix of scheduled and manual runs (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.array(fc.record({ kind: fc.constantFrom(...CIT_DEMOS), at: fc.integer({ min: 8 * 60, max: 18 * 60 }) }), { maxLength: 8 }), (day, raw) => {
        const manual = [...raw].sort((a, b) => a.at - b.at);
        const night = citAt(day, 23 * 60 + 59, manual);
        expect(night.book.TRANSIT).toBe(0);
        expect(Object.values(bookAfter(night.journal)).reduce((s, v) => s + v, 0)).toBe(0);
        expect(manualPlan(day, manual)).toEqual(manualPlan(day, manual));
      }),
      { numRuns: 60 },
    );
  });

  it('holds the one-van mutex from dispatch until the run is settled, and not a minute longer', () => {
    const manual: CitManual[] = [{ kind: 'DOORSTEP', at }];
    expect(citDemoBusy(citAt(DAY, at - 1, manual))).toBeNull();
    const home = CIT_TIMING.SETTLED;
    for (const dt of [0, CIT_TIMING.ARRIVED, CIT_TIMING.IN_COUNT, CIT_TIMING.DELIVERED, home - 1]) expect(citDemoBusy(citAt(DAY, at + dt, manual))?.order.id, `+${dt}`).toBe(`CIT-${DAY}-M1`);
    expect(citDemoBusy(citAt(DAY, at + home, manual))).toBeNull();
    // A scheduled run on the road never blocks the learner's demo.
    expect(citDemoBusy(citAt(DAY, 9 * 60 + 20, []))).toBeNull();
  });
});

describe('manual CIT dispatch (store pipeline)', () => {
  beforeEach(() => {
    bankStore.getState().resetDay();
    bankStore.getState().skipTo(10 * 60);
    citStore.setState({ day: -1, manual: [] });
    retailOpsStore.getState().reset();
  });

  it('dispatches a van immediately at the bank’s clock and refuses every other demo until it is settled', () => {
    const start = bankStore.getState().view.minute;
    expect(dispatchCitDemo('ATM')).toBe(true);
    expect(citStore.getState().manual[0]!.at).toBe(start);
    const live = citNow();
    expect(live.runs.filter((r) => r.planned.order.id.includes('-M') && r.run?.status === 'EN_ROUTE')).toHaveLength(1);
    expect(live.book.TRANSIT).toBeGreaterThan(0);
    for (const kind of CIT_DEMOS) expect(dispatchCitDemo(kind), kind).toBe(false);
    bankStore.getState().skipTo(start + CIT_TIMING.DELIVERED);
    expect(dispatchCitDemo('DOORSTEP'), 'not settled yet').toBe(false);
    // The 3D van still on its exit route holds the lock on its own; the moment it despawns, the lock is gone.
    citStore.setState({ van: true });
    bankStore.getState().skipTo(start + CIT_TIMING.SETTLED);
    expect(dispatchCitDemo('DOORSTEP'), 'settled, 3D van still leaving').toBe(false);
    citStore.setState({ van: false });
    const home = CIT_TIMING.SETTLED;
    for (const kind of ['DOORSTEP', 'SBV', 'TELLER'] as const) {
      expect(dispatchCitDemo(kind), kind).toBe(true);
      bankStore.getState().skipTo(bankStore.getState().view.minute + home + CIT_TIMING.incident);
    }
    expect(citStore.getState().manual.map((m) => m.kind)).toEqual(['ATM', 'DOORSTEP', 'SBV', 'TELLER']);
  });

  it('refills the retail ATM cassette with the same van, sized from its shortfall, once the van reaches the ATM', () => {
    retailOpsStore.getState().runAction('atm-withdraw-100', 'D1 10:00:00');
    const before = retailOpsStore.getState().book.balances.CASH_ATM;
    const short = OPS_LIMITS.cassetteCapacityCents - before;
    expect(short).toBeGreaterThan(0);
    const start = bankStore.getState().view.minute;
    expect(dispatchCitDemo('ATM')).toBe(true);
    expect(citStore.getState().manual[0]!.refillCents).toBe(short);
    // Not at dispatch: the cash is still in the van.
    expect(retailOpsStore.getState().book.balances.CASH_ATM).toBe(before);
    bankStore.getState().skipTo(start + CIT_TIMING.DELIVERED);
    expect(settleAtmRefills()).toBe(1);
    expect(retailOpsStore.getState().book.balances.CASH_ATM).toBe(OPS_LIMITS.cassetteCapacityCents);
    expect(citNow().runs.find((r) => r.planned.order.id.endsWith('-M1'))!.planned.order.amountCents).toBe(short);
  });

  it('drops dispatches a replay rewinds past or a new day leaves behind, so nothing posts twice', () => {
    const stop = installCitSync();
    try {
      dispatchCitDemo('DOORSTEP');
      expect(citStore.getState().manual).toHaveLength(1);
      bankStore.getState().resetDay();
      expect(citStore.getState().manual).toHaveLength(0);
      bankStore.getState().skipTo(11 * 60);
      dispatchCitDemo('DOORSTEP');
      bankStore.getState().startNextDay();
      expect(citStore.getState().manual).toHaveLength(0);
    } finally {
      stop();
    }
  });

  it('puts the CIT dispatches in one scenario dropdown, named in Vietnamese as the brief names them', () => {
    setActiveLocale('vi');
    const html = renderToStaticMarkup(createElement(CitDemoPicker));
    expect(html).toContain('Tiếp quỹ &amp; Rút hộc tiền ATM / CDM');
    expect(html).toContain('▶ Chạy thử kịch bản này');
  });
});

describe('the 3D van follows the CIT schedule', () => {
  it('waits away until a run calls it, drives in, and goes back to waiting after it leaves', () => {
    const run = new CitRun(citRoutes());
    run.follow();
    for (let i = 0; i < 3000; i++) run.step(0.1, true);
    expect(run.phase).toBe('away');
    run.call();
    run.step(0.1, true);
    expect(run.phase).toBe('arrive');
    for (let i = 0; i < 5000 && run.runs === 0; i++) run.step(0.1, true);
    expect(run.runs).toBe(1);
    for (let i = 0; i < 3000; i++) run.step(0.1, true);
    expect(run.phase).toBe('away');
  });

  it('keeps its own timer when nothing drives it (the car-park tests’ van)', () => {
    const run = new CitRun(citRoutes());
    for (let i = 0; i < 400 && run.phase === 'away'; i++) run.step(0.1, true);
    expect(run.phase).not.toBe('away');
  });
});

describe('decline-lane spacing (2D top corridor, 3D right gutter)', () => {
  type Seg = { id: string; at: number; lo: number; hi: number };
  const segs = (wires: readonly Wire[], axis: 'h' | 'v', keep: (at: number) => boolean): Seg[] =>
    wires.flatMap((w) =>
      w.points.slice(1).flatMap((b, i): Seg[] => {
        const a = w.points[i]!;
        const flat = axis === 'h' ? a[1] === b[1] : a[0] === b[0];
        const at = axis === 'h' ? a[1] : a[0];
        const [p, q] = axis === 'h' ? [a[0], b[0]] : [a[1], b[1]];
        return flat && p !== q && keep(at) ? [{ id: w.id, at, lo: Math.min(p, q), hi: Math.max(p, q) }] : [];
      }),
    );
  const tightest = (all: Seg[]): number => {
    let min = Infinity;
    for (const s of all) for (const o of all) if (s.id < o.id && Math.min(s.hi, o.hi) - Math.max(s.lo, o.lo) > 20 && s.at !== o.at) min = Math.min(min, Math.abs(s.at - o.at));
    return min;
  };

  it('keeps at least 11px between parallel runs in the 2D top corridor (y < 60)', () => {
    const gap = tightest(segs(BANK_WIRES, 'h', (y) => y < 60));
    expect(gap).toBeGreaterThanOrEqual(11);
    expect(gap).toBeLessThan(20);
  });

  it('keeps at least 9 units between parallel decline runs in the 3D right gutter (x 1040–1080)', () => {
    const gap = tightest(segs(OFFICE_WIRES, 'v', (x) => x >= 1040 && x <= 1080));
    expect(gap).toBeGreaterThanOrEqual(9);
    expect(gap).toBeLessThan(20);
  });
});

describe('citation alignment', () => {
  it('cites Circular 31/2024 & ISO 20022 on every STP flashcard and on the STP article, from one source', () => {
    const stp = RETAIL_FLASHCARDS.filter((c) => c.tag === RETAIL_FLASHCARDS.find((x) => x.id === 'retail-stp')!.tag);
    expect(stp.length).toBeGreaterThanOrEqual(3);
    for (const c of stp) expect(c.reference, c.id).toBe(STP_REF);
    expect(STP_REF.vi).toBe('Thông tư 31/2024/TT-NHNN & Tiêu chuẩn giao dịch điện tử ISO 20022');
    expect(STP_ARTICLE.basis).toBe(STP_REF);
    expect(CIT_ARTICLE.basis).toBe(CIT_REF);
    setActiveLocale('vi');
    expect(renderToStaticMarkup(createElement(StpArticle))).toContain('Cơ sở pháp lý: Thông tư 31/2024/TT-NHNN');
  });
});
