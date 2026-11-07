/**
 * The visual repair pass: the bay's text rows, Title Case station names, the vault's cash-movement line, the teller cash line's
 * direct route, the icon categories, the low 3D cash arc, the GPU budget, the CIT dock buttons and toast, the per-child lessons,
 * the active-step badge, the sim-time retail echoes and the 2D custodian walk.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CashLinesView, walkedOnFoot } from '../../components/bank/CashLines2D';
import { BAY_ROWS } from '../../components/bank/CitBay2D';
import { HopBadge, hopLook } from '../../components/bank/HopBadge';
import { vaultMovesLine } from '../../components/bank/Inspector';
import { budgeted, GLOW, GPU_BUDGET, LANE_GLOW, PULSE } from '../../components/bank/office/focus3d';
import { ARC_PEAK, arcPoint, STREAM_POOL_CAP, STREAM_SPARKS } from '../../components/bank/office/VaultCash3D';
import { ObjectPool } from '../../components/bank/office/webglSafety';
import { citMessages } from '../../components/ops/cit.messages';
import { dispatchTitle } from '../../components/ops/citActions';
import { subProcessInfoMessages } from '../../components/ops/subProcessInfo.messages';
import { CIT_ARTICLE } from '../../data/citKnowledge';
import { subProcessInfo } from '../../data/subProcessRegistry';
import { CIT_INFO_KEYS, citDemoOfKey } from '../../data/subProcessKeys';
import { lessonAnchor } from '../../data/subProcessLessons';
import { CASH_LINES, PLACE_BOX, STAGE } from '../../engine/plan/layout';
import { VI_DICTIONARY } from '../../i18n/viDictionary';
import { vaultFlowStore } from '../../store/vaultFlowStore';
import { citAt, CIT_DEMOS } from '../citEngine';
import type { OpsJournal } from '../retailOps';
import { TERMS } from '../terms';
import type { PlaceId } from '../topology';
import { CATEGORY_ICON, flowIcon, PLACE_CATEGORY } from '../transactionPath';
import { stopStates } from '../hopPlayer';
import { dailyCashMovements, type VaultCashFlow } from '../vaultFlows';

const src = (rel: string): string => readFileSync(join(__dirname, '..', '..', rel), 'utf8');

describe('2D layout: the bay, the vault card and the teller line', () => {
  it('gives the bay header and the vault balance rows of their own', () => {
    expect(BAY_ROWS.balance - BAY_ROWS.header).toBeGreaterThanOrEqual(14);
    const bay = src('components/bank/CitBay2D.tsx');
    expect(bay).toContain('top: BAY_ROWS.header');
    expect(bay).toContain('top: BAY_ROWS.balance');
  });

  it('names the vault in Title Case', () => {
    expect(JSON.stringify(TERMS.vi)).not.toContain('KHO QUỸ TRUNG TÂM');
    expect(src('sim/terms.ts')).toContain("plain: 'Kho Quỹ Trung Tâm'");
  });

  it('runs the teller cash line straight along the corridor, never round the bottom edge', () => {
    const pts = CASH_LINES.TELLER;
    const teller = PLACE_BOX.TELLER_CASH;
    for (const [, y] of pts) expect(y).toBeLessThan(960);
    expect(pts.some(([, y]) => y === 1056)).toBe(false);
    const [x, y] = pts[pts.length - 1]!;
    expect(x).toBe(teller.cx);
    expect(y).toBe(teller.cy + teller.h / 2);
    const len = pts.slice(1).reduce((s, p, i) => s + Math.abs(p[0] - pts[i]![0]) + Math.abs(p[1] - pts[i]![1]), 0);
    expect(len).toBeLessThan(1300);
    expect(STAGE.height).toBe(1080);
  });

  it('shows the vault’s daily cash movements instead of a case count', () => {
    const cit = citAt(1, 23 * 60);
    const runs = cit.runs.filter((r) => r.run).length;
    const journal = (id: string, at: string, dr: number, cr: number): OpsJournal => ({ id, source: 'vault-transfer', at, lines: [{ account: 'CASH_VAULT', dr, cr }] }) as OpsJournal;
    const m = dailyCashMovements(cit, [journal('a', 'D1 10:00:00', 500, 0), journal('b', 'D1 11:00:00', 0, 500), journal('c', 'D0 11:00:00', 0, 500)], 1);
    expect(m.total).toBe(m.in + m.out);
    expect(m.total).toBeGreaterThanOrEqual(2);
    expect(m.total).toBeLessThanOrEqual(runs + 2);
    const line = vaultMovesLine(m);
    expect(line.label).toBe('Daily cash movements');
    expect(VI_DICTIONARY['Daily cash movements']).toBe('Tổng lượt điều chuyển tiền mặt hôm nay');
    expect(src('sim/bankSimulation.ts')).not.toMatch(/case 'MAIN_CASH_VAULT':\s*return \[\{ label: 'Cases worked'/);
  });
});

describe('one icon per payment category', () => {
  it('maps every entry point to its category and never shows a refresh icon', () => {
    const want: Partial<Record<PlaceId, string>> = {
      GATE_POS: '💳', GATE_VIRTUAL: '💳', GATE_A2A: '💸', GATE_QR: '💸', GATE_ATM: '💵', ATM_CASH: '💵', TELLER_CASH: '💵', MAIN_CASH_VAULT: '💵',
      GATE_EKYC: '📜', SAVINGS_DESK: '📜', COLLATERAL_VAULT: '📜', DISPUTE_DESK: '📜', GATE_ECOM: '🛒', GATE_SWIFT: '🌐', OUT_APPROVED: '📦', EOD_BATCH: '📦',
    };
    for (const [p, icon] of Object.entries(want)) expect(flowIcon([p as PlaceId]), p).toBe(icon);
    for (const p of Object.keys(PLACE_BOX) as PlaceId[]) expect(['🔄', '🔁']).not.toContain(flowIcon([p]));
    expect(new Set(Object.values(PLACE_CATEGORY)).size).toBe(Object.keys(CATEGORY_ICON).length);
  });
});

describe('3D: a low cash arc and a light GPU budget', () => {
  it('peaks the vault’s arcs at 1.5–1.8 m, inside the room', () => {
    expect(ARC_PEAK).toBeGreaterThanOrEqual(1.5);
    expect(ARC_PEAK).toBeLessThanOrEqual(1.8);
    for (const e of ['TELLER', 'ATM', 'BAY'] as const) for (let u = 0; u <= 1; u += 0.05) expect(arcPoint(e, u)[1]).toBeLessThanOrEqual(1.8);
  });

  it('halves the particles, softens the glow and lightens the shadows', () => {
    expect(GPU_BUDGET.particles).toBe(0.5);
    expect(STREAM_SPARKS).toBe(3);
    expect(PULSE.perLane).toBe(1);
    expect(budgeted(1800)).toBe(900);
    expect(budgeted(1)).toBe(1);
    expect(GLOW.live).toBeLessThanOrEqual(0.5);
    expect(LANE_GLOW.halo).toBeLessThanOrEqual(0.2);
    expect(GPU_BUDGET.shadowPx).toBeLessThanOrEqual(256);
    expect(src('components/bank/office/OfficeScene.tsx')).not.toContain('resolution={512}');
  });

  it('pools the sparks: never past the cap, reused, disposed once on drain', () => {
    let made = 0;
    let disposed = 0;
    const pool = new ObjectPool(() => ({ n: made++ }), STREAM_POOL_CAP, () => void disposed++);
    const out = Array.from({ length: STREAM_POOL_CAP + 2 }, () => pool.acquire());
    expect(out.filter(Boolean)).toHaveLength(STREAM_POOL_CAP);
    out.forEach((o) => o && pool.release(o));
    for (let i = 0; i < STREAM_POOL_CAP; i++) pool.acquire();
    expect(made).toBe(STREAM_POOL_CAP);
    pool.drain();
    expect(disposed).toBe(STREAM_POOL_CAP);
    expect(pool.size).toBe(0);
  });
});

describe('CIT: the dock, the toast, the drawer and the lessons', () => {
  it('maps each CIT child to its own dock button', () => {
    const vi: Record<string, string> = {
      '09-cit-atm': '▶ Tiếp quỹ & Rút hộc tiền ATM/CDM ($60k)',
      '09-cit-doorstep': '▶ Thu tiền mặt Doanh nghiệp ($300k)',
      '09-cit-sbv': '▶ Nộp / Rút tiền mặt Ngân hàng Nhà nước ($1.5M)',
      '09-cit-teller-vault': '▶ Điều chuyển & Phân loại tiền quầy ($50k)',
    };
    for (const [key, label] of Object.entries(vi)) {
      const kind = citDemoOfKey(key)!;
      expect(CIT_INFO_KEYS[kind]).toBe(key);
      expect(citMessages.messages[`dock_${kind}`].vi).toBe(label);
    }
    expect(src('components/ops/CitPanel.tsx')).toContain('<CitDockButton kind={picked} />');
  });

  it('calls a till run an internal transfer, never a van dispatch', () => {
    expect(dispatchTitle('TELLER').vi).toBe('Điều chuyển nội bộ Quầy ↔ Kho');
    for (const k of CIT_DEMOS.filter((k) => k !== 'TELLER')) expect(dispatchTitle(k).vi).toBe('Đã điều xe CIT');
    expect(src('components/ops/citActions.ts')).toContain('title: dispatchTitle(kind)');
  });

  it('labels the drawer “Thông tin về quy trình này”', () => {
    expect(subProcessInfoMessages.messages.open.vi).toBe('Thông tin về quy trình này');
  });

  it('gives every CIT child a lesson of its own', () => {
    const ids = new Set(CIT_ARTICLE.sections.map((s) => s.id));
    const anchors = Object.values(CIT_INFO_KEYS).map((k) => lessonAnchor(k));
    expect(new Set(anchors).size).toBe(4);
    for (const a of anchors) expect(ids.has(a as never), a).toBe(true);
  });

  it('spells out the SBV deposit and withdrawal triggers in the tooltip and the drawer', () => {
    const hint = citMessages.messages.demoHint_SBV.vi;
    for (const s of ['$5.2M', '$10,000', '$1M', 'Tết']) expect(hint).toContain(s);
    const steps = subProcessInfo('09-cit-sbv').steps.map((s) => s.vi).join(' ');
    expect(steps).toMatch(/Nộp tiền về NHNN.*\$5\.2M.*\$10,000/);
    expect(steps).toMatch(/Rút tiền từ NHNN.*\$1M.*Tết/);
  });
});

describe('the active step and the moving icon', () => {
  it('accents only the current hop of the badge', () => {
    const steps = stopStates({ index: 1, phase: 'show', t: 0 }, 3).map((state, i) => ({ n: i + 1, name: ['POS Gate', 'Debit CASA', 'Approved'][i]!, state }));
    expect(steps.map((s) => s.state)).toEqual(['done', 'active', 'next']);
    expect(hopLook('active', '#fbbf24').background).toBe('#fbbf24');
    expect(hopLook('done', '#fbbf24').background).toBe('transparent');
    const html = renderToStaticMarkup(createElement(HopBadge, { hops: steps, tone: '#fbbf24' }));
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toMatch(/data-state="active"[\s\S]*?aria-current="step"[^>]*>Step 2:/);
  });

  it('walks the custodian along the 2D teller line on a till run', () => {
    const run: VaultCashFlow = { endpoint: 'TELLER', dir: 'IN', source: 'cit', id: 't' };
    expect(walkedOnFoot(run)).toBe(true);
    expect(walkedOnFoot({ ...run, source: 'retail' })).toBe(false);
    expect(renderToStaticMarkup(createElement(CashLinesView, { flows: [run] }))).toContain('data-testid="cash-walker-TELLER"');
    expect(renderToStaticMarkup(createElement(CashLinesView, { flows: [{ ...run, source: 'retail' }] }))).not.toContain('cash-walker');
  });
});

describe('retail echoes are single-shot', () => {
  afterEach(() => {
    vaultFlowStore.getState().clear();
    vi.useRealTimers();
  });

  it('plays once on wall time and clears itself, even while the bank is paused', () => {
    vi.useFakeTimers();
    const flow: VaultCashFlow = { endpoint: 'ATM', dir: 'OUT', source: 'retail', id: 'e' };
    expect(vaultFlowStore.getState().push(flow, 4_500)).toBe(true);
    vi.advanceTimersByTime(4_400);
    expect(vaultFlowStore.getState().retail).toContain(flow);
    vi.advanceTimersByTime(200);
    expect(vaultFlowStore.getState().retail).not.toContain(flow);
  });
});
