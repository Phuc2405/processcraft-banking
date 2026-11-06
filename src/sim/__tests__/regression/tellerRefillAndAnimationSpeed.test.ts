/**
 * Regression suite: the teller's vault top-up fires once per breach (one crossing on the wire, one ⚡ line in the log, never a
 * loop), the tokens travel at a relaxed, traceable pace on both maps, and the clock bar's speeds are read-only while a demo runs.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CashLinesView } from '../../../components/bank/CashLines2D';
import { ClockBar } from '../../../components/bank/ClockBar';
import { cancelDemo, demoLocked } from '../../../components/bank/DemoSession';
import { executeDemo } from '../../../components/bank/retailOpsActions';
import { hopSources } from '../../../components/bank/hopDriver';
import { hopPlayerStore } from '../../../store/hopPlayerStore';
import { HOP_PACE, hopTiming } from '../../../engine/plan/layout3d';
import { bankStore } from '../../../store/bankStore';
import { notificationStore } from '../../../store/notificationStore';
import { REFILL_COOLDOWN_MS, RETAIL_FLOW_MS, tillRebalanceFlow, vaultFlowStore } from '../../../store/vaultFlowStore';
import { beatMs, SPEEDS } from '../../clock';
import { HOP_TIMING } from '../../hopPlayer';
import { openingLedger, postJournal, TILL_FLOOR_CENTS, vaultReplenishment, type JournalEntry } from '../../staffRoleplay';
import { CASH_ICON_SECONDS, CUSTODIAN_WALK_SECONDS, type VaultCashFlow } from '../../vaultFlows';
import { at, freshBank, playDemoToEnd } from './harness';

const refills = (): number => notificationStore.getState().queue.filter((n) => n.source?.startsWith('auto-refill:')).length;

beforeEach(() => {
  freshBank();
  notificationStore.getState().clear();
});
afterEach(() => {
  vaultFlowStore.getState().clear();
  vi.useRealTimers();
});

describe('single-shot teller auto-replenishment', () => {
  const topUp: VaultCashFlow = { endpoint: 'TELLER', dir: 'OUT', source: 'retail', id: 'VAULT-1@D1', cents: 1_200_000 };

  it('lights one crossing and logs one ⚡ line for one breach, however often it is re-announced', () => {
    vi.useFakeTimers();
    const s = vaultFlowStore.getState();
    expect(s.push(topUp)).toBe(true);
    for (let i = 0; i < 20; i++) expect(vaultFlowStore.getState().push(topUp)).toBe(false);
    expect(vaultFlowStore.getState().retail).toHaveLength(1);
    expect(refills()).toBe(1);
    const notice = notificationStore.getState().queue.find((n) => n.source?.startsWith('auto-refill:'))!;
    expect(notice.icon).toBe('⚡');
    expect(notice.title.vi).toBe('Tự động tiếp quỹ: Kho Quỹ ➔ Quầy GDV $12,000.00');
    // The same journal never lights again, even after it has gone dark.
    vi.advanceTimersByTime(RETAIL_FLOW_MS + REFILL_COOLDOWN_MS + 1);
    expect(vaultFlowStore.getState().push(topUp)).toBe(false);
    expect(refills()).toBe(1);
  });

  it('holds the lane while replenishing and through its cooldown, then lets the next breach through', () => {
    vi.useFakeTimers();
    vaultFlowStore.getState().push(topUp);
    // A new journal on every clock tick while the till is low: all blocked by the lock.
    for (let i = 2; i < 12; i++) {
      vi.advanceTimersByTime(500);
      expect(vaultFlowStore.getState().push({ ...topUp, id: `VAULT-${i}@D1` })).toBe(false);
    }
    expect(refills()).toBe(1);
    vi.advanceTimersByTime(RETAIL_FLOW_MS + REFILL_COOLDOWN_MS);
    expect(vaultFlowStore.getState().retail).toHaveLength(0);
    expect(vaultFlowStore.getState().push({ ...topUp, id: 'VAULT-99@D1' })).toBe(true);
    expect(refills()).toBe(2);
  });

  it('plays the echo once on wall time: it clears itself even with the bank paused', () => {
    vi.useFakeTimers();
    bankStore.getState().pause();
    vaultFlowStore.getState().push(topUp);
    vi.advanceTimersByTime(RETAIL_FLOW_MS + 1);
    expect(vaultFlowStore.getState().retail).toEqual([]);
  });

  it('tops the till up once: after the refill the balance is back at its float, so no second transfer is due', () => {
    const low = postJournal(openingLedger(), { caseId: 'W-1', role: 'cashier', scene: 'cashier_OUT', decision: 'APPROVE', statusCode: 'PAID', lines: [{ gl: 'CASA', dr: 2_000_000, cr: 0 }, { gl: 'TILL_CASH', dr: 0, cr: 2_000_000 }] });
    expect(low.balances.TILL_CASH).toBeLessThan(TILL_FLOOR_CENTS);
    const refill = vaultReplenishment(low, 'D1T10:00')!;
    expect(refill.statusCode).toBe('VAULT_TO_TILL');
    const after = postJournal(low, refill);
    expect(vaultReplenishment(after)).toBeNull();
    expect(tillRebalanceFlow(after.journal[0])).toMatchObject({ endpoint: 'TELLER', dir: 'OUT', cents: refill.lines[0]!.dr });
  });

  it('wires the bank ledger’s automatic top-up to the teller line exactly once, however many times the store re-renders', () => {
    const refill: JournalEntry = { caseId: 'VAULT-7', role: 'cashier', scene: 'cashier_OUT', decision: 'APPROVE', statusCode: 'VAULT_TO_TILL', at: 'D1T10:00', lines: [{ gl: 'TILL_CASH', dr: 1_500_000, cr: 0 }, { gl: 'VAULT_CASH', dr: 0, cr: 1_500_000 }] };
    const ledger = postJournal(bankStore.getState().retailLedger, refill);
    bankStore.setState({ retailLedger: ledger });
    for (let i = 0; i < 5; i++) bankStore.setState({ retailLedger: { ...ledger } });
    expect(vaultFlowStore.getState().retail.map((f) => `${f.endpoint}:${f.dir}`)).toEqual(['TELLER:OUT']);
    expect(refills()).toBe(1);
  });

  it('the $12,000 counter withdrawal lights “Xuất quỹ ➔ Quầy GDV” once and logs it once, beat after beat', () => {
    at(10 * 60);
    executeDemo('teller-12k');
    for (let i = 0; i < 30; i++) bankStore.getState().tickBeat();
    expect(vaultFlowStore.getState().retail.filter((f) => f.endpoint === 'TELLER')).toHaveLength(1);
    expect(refills()).toBe(1);
  });

  it('draws a retail echo’s 💵 for one pass (a CIT run, which lasts minutes, keeps looping)', () => {
    const retail = renderToStaticMarkup(createElement(CashLinesView, { flows: [{ endpoint: 'TELLER', dir: 'OUT', source: 'retail', id: 'r' }] }));
    expect(retail).toMatch(/<animateMotion[^>]*repeatCount="1"/);
    expect(retail).not.toMatch(/repeatCount="indefinite"/);
    const cit = renderToStaticMarkup(createElement(CashLinesView, { flows: [{ endpoint: 'ATM', dir: 'OUT', source: 'cit', id: 'c' }] }));
    expect(cit).toMatch(/repeatCount="indefinite"/);
  });
});

describe('calibrated, readable token velocity (2D and 3D)', () => {
  it('glides each guided hop for over a second, longer than its stop', () => {
    expect(HOP_TIMING.travel).toBeGreaterThanOrEqual(1.2);
    expect(HOP_TIMING.travel).toBeGreaterThan(HOP_TIMING.show);
  });

  it('runs the cash 💵 and the custodian at a relaxed pace, the walk slower than the 💵', () => {
    expect(CASH_ICON_SECONDS).toBeGreaterThanOrEqual(4);
    expect(CUSTODIAN_WALK_SECONDS).toBeGreaterThan(CASH_ICON_SECONDS);
    expect(RETAIL_FLOW_MS).toBeGreaterThanOrEqual(CASH_ICON_SECONDS * 1000);
  });

  it('gives a packet hop over 1.2 s at 1× on both maps, never a blink at 10×, and lands inside its beat', () => {
    const relaxed = beatMs('WORKING', 1);
    expect(hopTiming(0, relaxed).durationMs).toBeGreaterThanOrEqual(1_200);
    const fastest = beatMs('WORKING', SPEEDS[SPEEDS.length - 1]!.factor);
    expect(hopTiming(0, fastest).durationMs).toBe(HOP_PACE.minMs);
    const last = hopTiming(1, relaxed);
    expect(last.delayMs + last.durationMs).toBeLessThanOrEqual(relaxed);
  });
});

describe('read-only speed multiplier during a demo', () => {
  const speedButtons = (): string[] => renderToStaticMarkup(createElement(ClockBar)).match(/<button[^>]*data-testid="bank-speed-\d"[^>]*>/g) ?? [];

  it('disables every speed button while a demo runs and re-enables them once it is cancelled', () => {
    expect(speedButtons()).toHaveLength(SPEEDS.length);
    expect(speedButtons().every((b) => !/ disabled=""/.test(b))).toBe(true);
    at(10 * 60);
    executeDemo('teller-12k');
    expect(demoLocked()).toBe(true);
    expect(speedButtons().every((b) => / disabled=""/.test(b))).toBe(true);
    expect(renderToStaticMarkup(createElement(ClockBar))).toContain('data-demo-lock="true"');
    cancelDemo();
    expect(demoLocked()).toBe(false);
    expect(speedButtons().every((b) => !/ disabled=""/.test(b))).toBe(true);
  });

  it('re-enables them when the demo plays to its end (its payment done, the hop player’s last stop shown)', () => {
    at(10 * 60);
    executeDemo('pos-20');
    expect(speedButtons().every((b) => / disabled=""/.test(b))).toBe(true);
    expect(playDemoToEnd()).toBe(true);
    for (let i = 0; i < 2_000 && demoLocked(); i++) hopPlayerStore.getState().tick(0.05, hopSources());
    expect(demoLocked()).toBe(false);
    expect(speedButtons().every((b) => !/ disabled=""/.test(b))).toBe(true);
  });
});
