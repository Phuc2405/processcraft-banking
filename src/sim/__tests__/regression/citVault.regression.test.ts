/**
 * Regression suite §2: the SBV case toggle, the vault's reserve floor and the forced deposit, and the CIT loading bay's lit state.
 */

import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { CitBayView } from '../../../components/bank/CitBay2D';
import { citMessages } from '../../../components/ops/cit.messages';
import { citNow, dispatchCitDemo } from '../../../components/ops/citActions';
import { SbvBadge } from '../../../components/ops/CitPanel';
import { SubProcessInfoView } from '../../../components/ops/SubProcessInfoDrawer';
import { SBV_CASE_SHEETS } from '../../../data/subProcessCitSheets';
import { subProcessInfo } from '../../../data/subProcessRegistry';
import { setActiveLocale } from '../../../i18n/localeCore';
import { activeFlowOf, bankStore } from '../../../store/bankStore';
import { executeDemo } from '../../../components/bank/retailOpsActions';
import { citStore } from '../../../store/citStore';
import { message } from '../../../utils/i18nHelper';
import { CIT_FLOW, FLOW_IDS } from '../../../types/viewport';
import { branchTrigger, CIT_LIMITS, CIT_OPENING, manualOrder, sbvCasePlan, sbvMode, sbvPlan, sbvTrigger, type CitAccountId, type SbvMode } from '../../citEngine';
import { at, freshBank, src } from './harness';

const MODES: readonly SbvMode[] = ['DEPOSIT', 'WITHDRAW'];
const book = (over: Partial<Record<CitAccountId, number>> = {}): Record<CitAccountId, number> => ({ ...CIT_OPENING, ...over });
const sbvSheet = (): string => renderToStaticMarkup(createElement(SubProcessInfoView, { info: SBV_CASE_SHEETS[citStore.getState().sbvCase], liveStr: 0.5 }));

beforeEach(freshBank);

describe('§2.1 the SBV toggle (09-cit-sbv)', () => {
  it('starts on the deposit case and swaps cleanly both ways', () => {
    expect(citStore.getState().sbvCase).toBe('DEPOSIT');
    citStore.getState().setSbvCase('WITHDRAW');
    expect(citStore.getState().sbvCase).toBe('WITHDRAW');
    citStore.getState().setSbvCase('DEPOSIT');
    expect(citStore.getState().sbvCase).toBe('DEPOSIT');
  });

  it('labels the two sides 🟢 Nộp tiền and 🔴 Rút tiền', () => {
    const vi = (k: 'sbvCase_DEPOSIT' | 'sbvCase_WITHDRAW'): string => message(citMessages, k, undefined, 'vi');
    expect(vi('sbvCase_DEPOSIT')).toMatch(/^🟢 .*Nộp Tiền.*Deposit/);
    expect(vi('sbvCase_WITHDRAW')).toMatch(/^🔴 .*Rút Tiền.*Withdrawal/);
  });

  it('gives each case its own six knowledge sections (overview, SOP, impact, risks, GL, KPI/SLA)', () => {
    const [d, w] = [SBV_CASE_SHEETS.DEPOSIT, SBV_CASE_SHEETS.WITHDRAW];
    for (const field of ['overview', 'steps', 'impact', 'risks', 'gl', 'kpi'] as const) expect(d[field], field).not.toEqual(w[field]);
    // The identity of the sheet stays the parent's.
    for (const field of ['key', 'code', 'flow', 'actors', 'related', 'legal', 'place'] as const) expect(d[field], field).toEqual(w[field]);
    expect(d.key).toBe('09-cit-sbv');
    // Deposit leaves the vault for the SBV (Cr 1111, Dr 1121); withdrawal does the opposite.
    expect(d.gl).toContainEqual({ book: 'cit', account: 'VAULT', side: 'cr' });
    expect(d.gl).toContainEqual({ book: 'cit', account: 'SBV', side: 'dr' });
    expect(w.gl).toContainEqual({ book: 'cit', account: 'SBV', side: 'cr' });
    expect(w.gl).toContainEqual({ book: 'cit', account: 'VAULT', side: 'dr' });
  });

  it('re-renders the drawer with the picked case’s text in every section, and shows the toggle only on the SBV sheet', () => {
    setActiveLocale('vi');
    const deposit = sbvSheet();
    citStore.getState().setSbvCase('WITHDRAW');
    const withdraw = sbvSheet();
    // Server rendering reads the stores' initial state, so the switch itself is checked by its wiring; the sections by their text.
    for (const html of [deposit, withdraw]) expect(html).toContain('data-testid="sbv-toggle"');
    expect(src('components/ops/SubProcessInfoDrawer.tsx')).toContain("infoKey === '09-cit-sbv' ? SBV_CASE_SHEETS[sbvCase] : infoKey === 'flow-4' ? eodSheet(suspense) : subProcessInfo(infoKey)");
    expect(src('components/ops/CitPanel.tsx')).toMatch(/data-testid="sbv-toggle" data-mode=\{mode\}/);
    for (const mode of MODES) {
      const html = mode === 'DEPOSIT' ? deposit : withdraw;
      const other = mode === 'DEPOSIT' ? withdraw : deposit;
      const info = SBV_CASE_SHEETS[mode];
      expect(html).toContain(info.overview.vi.slice(0, 40));
      expect(other).not.toContain(info.overview.vi.slice(0, 40));
      expect(html).toContain(info.steps[0]!.vi.slice(0, 30));
      expect(html).toContain(info.risks[0]!.vi.slice(0, 30));
      expect(html).toContain(info.kpi.sla.vi.slice(0, 20));
    }
    expect(renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo('09-cit-atm'), liveStr: 0.5 }))).not.toContain('data-testid="sbv-toggle"');
  });

  it('dispatches the picked case: a deposit run leaves the vault, a withdrawal run arrives at it', () => {
    for (const mode of MODES) {
      freshBank();
      at(10 * 60);
      citStore.getState().setSbvCase(mode);
      expect(dispatchCitDemo('SBV')).toBe(true);
      expect(citStore.getState().manual[0]?.sbv).toBe(mode);
      const run = citNow().runs.find((r) => r.planned.order.id.endsWith('-M1'))!;
      expect(sbvMode(run.planned.order.direction), mode).toBe(mode);
    }
  });
});

describe('§2.2 vault reserves, the $1M floor and the forced deposit', () => {
  it('holds the floor at $1M and the ceiling above it', () => {
    expect(CIT_LIMITS.branchFloorCents).toBe(100_000_000);
    expect(CIT_LIMITS.branchFloorCents).toBeLessThan(CIT_LIMITS.branchTargetCents);
    expect(CIT_LIMITS.branchTargetCents).toBeLessThan(CIT_LIMITS.branchMaxCents);
    expect(CIT_LIMITS.branchMaxCents).toBeLessThan(CIT_LIMITS.sbvLineCents);
  });

  it('refills a vault under its floor back to target, from the SBV or HQ', () => {
    expect(sbvTrigger(90_000_000, 0, false)).toMatchObject({ direction: 'IN', amountCents: CIT_LIMITS.branchTargetCents - 90_000_000, reason: 'floor' });
    expect(branchTrigger(90_000_000)).toMatchObject({ direction: 'IN', amountCents: CIT_LIMITS.branchTargetCents - 90_000_000 });
    expect(sbvTrigger(CIT_LIMITS.branchFloorCents, 0, false)).toBeNull();
    expect(branchTrigger(CIT_LIMITS.branchFloorCents)).toBeNull();
  });

  it('forces the deposit case from a vault at or under the floor, tagged as a demo, and never deposits more than the vault holds', () => {
    for (const vault of [CIT_LIMITS.branchFloorCents, 90_000_000, 500_000, 0]) {
      const t = sbvCasePlan(book({ VAULT: vault, UNFIT: 0 }), false, 'DEPOSIT');
      expect(t.direction, `${vault}`).toBe('OUT');
      expect(t.forced, `${vault}`).toBe(true);
      expect(t.amountCents).toBeLessThanOrEqual(vault);
    }
    // Above the floor the deposit is a live rule, not forced.
    expect(sbvCasePlan(book({ VAULT: 200_000_000 }), false, 'DEPOSIT').forced).toBeUndefined();
  });

  it('writes "nộp cưỡng chế vào NHNN (Demo)" into a forced run’s order and shows the ⚠ badge', () => {
    const order = manualOrder(1, 1, { kind: 'SBV', at: 600, sbv: 'DEPOSIT' }, book({ VAULT: 90_000_000 }));
    expect(order.forced).toBe(true);
    expect(order.trigger.vi).toContain('nộp cưỡng chế vào NHNN (Demo)');
    expect(order.trigger.en).toContain('forced deposit at the SBV (demo)');
    const live = manualOrder(1, 1, { kind: 'SBV', at: 600, sbv: 'DEPOSIT' }, book({ VAULT: 400_000_000 }));
    expect(live.forced).toBeUndefined();
    setActiveLocale('vi');
    const badge = renderToStaticMarkup(createElement(SbvBadge, { mode: 'DEPOSIT', reason: 'ceiling', forced: true }));
    expect(badge).toContain('data-testid="sbv-forced"');
    expect(badge).toContain('Nộp cưỡng chế (Demo)');
    expect(renderToStaticMarkup(createElement(SbvBadge, { mode: 'DEPOSIT', reason: 'ceiling' }))).not.toContain('sbv-forced');
  });

  it('never plans a case against the picked mode, and never overdraws the vault (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 800_000_000 }), fc.integer({ min: 0, max: 20_000_000 }), fc.boolean(), fc.constantFrom<SbvMode>('DEPOSIT', 'WITHDRAW'), (vault, unfit, holiday, mode) => {
        const t = sbvCasePlan(book({ VAULT: vault, UNFIT: unfit }), holiday, mode);
        expect(sbvMode(t.direction)).toBe(mode);
        if (t.direction === 'OUT') {
          expect(t.amountCents).toBeGreaterThanOrEqual(0);
          expect(t.amountCents).toBeLessThanOrEqual(vault);
          expect(t.forced === true).toBe(vault <= CIT_LIMITS.branchFloorCents);
        } else expect(t.forced).toBeUndefined();
        // The live rule (no toggle) always has something to show.
        expect(sbvPlan(book({ VAULT: vault, UNFIT: unfit }), holiday).amountCents + sbvPlan(book({ VAULT: vault, UNFIT: unfit }), holiday).unfitSurrenderCents).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

describe('§2.3 the loading bay (Sảnh Giao Nhận CIT) is lit only for Flow 09', () => {
  const bay = (lit: boolean): string => renderToStaticMarkup(createElement(CitBayView, { cit: citNow(), live: true, lit, onOpen: () => undefined }));

  it('dims the 2D hall to opacity-40 grayscale when not lit, and lifts it when lit', () => {
    expect(bay(false)).toMatch(/data-testid="cit-bay"[^>]*class="[^"]*opacity-40[^"]*grayscale/);
    const lit = bay(true);
    expect(lit).not.toContain('opacity-40');
    expect(lit).toContain('border-cyan-300');
  });

  it('wires the lit flag to Flow 09 alone, on both maps', () => {
    expect(src('components/bank/CitBay2D.tsx')).toContain('useBankStore((s) => activeFlowOf(s) === CIT_FLOW && bayLit(citChildOf(s)))');
    const bay3d = src('components/bank/office/LoadingBay3D.tsx');
    expect(bay3d).toContain("s.scope === 'beginner' && s.flow === CIT_FLOW");
    expect(bay3d).toContain('opacity: lit || selected || hover ? 1 : 0.4');
  });

  it('shows the hall’s Vietnamese name', () => {
    setActiveLocale('vi');
    expect(bay(true)).toContain('Sảnh Giao Nhận CIT');
  });

  it('is lit for Flow 09 and dimmed for every other flow, and dimmed in the whole-bank (advanced) scope', () => {
    for (const flow of FLOW_IDS) {
      bankStore.getState().setActiveFlow(flow);
      expect(activeFlowOf(bankStore.getState()) === CIT_FLOW, `flow ${flow}`).toBe(flow === CIT_FLOW);
    }
    bankStore.getState().setActiveFlow(CIT_FLOW);
    bankStore.getState().setScope('advanced');
    expect(activeFlowOf(bankStore.getState())).toBeNull();
    bankStore.getState().setScope('beginner');
  });

  it('stays dimmed while another flow’s demo runs', () => {
    at(10 * 60);
    executeDemo('teller-12k');
    expect(activeFlowOf(bankStore.getState())).toBe(6);
  });
});
