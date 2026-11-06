/**
 * Regression suite §1: every process flow (01-09) and its child sub-processes.
 *  - A parent flow's sheet never carries a run button: only its title and the child selector.
 *  - Every child scenario mounts, runs and finishes; nothing is left holding the demo lock.
 *  - Flow 09 (CIT) keeps its four top-level children, its master code and its routing.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoLocked } from '../../../components/bank/DemoSession';
import { executeDemo } from '../../../components/bank/retailOpsActions';
import { MENU_CHOICES } from '../../../components/bank/SubProcessMenu';
import { citNow, dispatchCitDemo } from '../../../components/ops/citActions';
import { SubProcessInfoView } from '../../../components/ops/SubProcessInfoDrawer';
import { CIT_INFO_KEYS, citDemoOfKey, INFO_KEYS, infoKeyForChoice, infoKeyForPlace, isInfoKey, subProcessInfo, SUB_PROCESS_REGISTRY } from '../../../data/subProcessRegistry';
import { setActiveLocale } from '../../../i18n/localeCore';
import { bankStore, citChildOf } from '../../../store/bankStore';
import { citStore } from '../../../store/citStore';
import { demoSessionStore } from '../../../store/demoSessionStore';
import { retailOpsStore } from '../../../store/retailOpsStore';
import { CIT_FLOW, FLOW_IDS, type FlowId } from '../../../types/viewport';
import { CIT_DEMOS, CIT_TIMING, type CitDemo } from '../../citEngine';
import { ALL_DEMO_ACTIONS, demoActionsFor } from '../../demoActions';
import { DEMO_GROUPS, demoGroupsIn, groupMembers } from '../../demoGroups';
import { GUIDED_FLOWS } from '../../guidedFlows';
import { childSheetsOf, sheetDemo } from '../../sheetDemo';
import { freshBank, playDemoToEnd, at } from './harness';

const RUN_BUTTON_VI = '▶ Chạy thử kịch bản này';
const RUN_BUTTON_EN = '▶ Run this scenario';
const sheet = (key: Parameters<typeof subProcessInfo>[0]): string => renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo(key), liveStr: 0.5 }));

beforeEach(freshBank);

describe('§1.1 parent vs child header contract', () => {
  it.each(FLOW_IDS as readonly FlowId[])('Flow %i: the parent sheet never renders a run button, in either language', (flow) => {
    const key = `flow-${flow}` as const;
    expect(sheetDemo(key)).toBeNull();
    for (const locale of ['vi', 'en'] as const) {
      setActiveLocale(locale);
      const html = sheet(key);
      expect(html).not.toContain(RUN_BUTTON_VI);
      expect(html).not.toContain(RUN_BUTTON_EN);
      for (const id of ['spi-run', 'spi-run-scenario', 'cit-run-scenario', 'cit-demo-run', 'demo-cancel']) expect(html, `${key} ${locale} ${id}`).not.toContain(`data-testid="${id}"`);
      // The static title is still there.
      expect(html).toContain('data-testid="inspector-title"');
      expect(html).toContain(`data-key="${key}"`);
    }
  });

  it('gives every parent with children the child selector, pointed at its own flow', () => {
    for (const flow of FLOW_IDS) {
      const html = sheet(`flow-${flow}`);
      if (childSheetsOf(flow).length === 0) {
        expect(html, `flow ${flow}`).not.toContain('data-testid="spi-child-picker"');
        continue;
      }
      expect(html, `flow ${flow}`).toContain(`data-testid="spi-child-picker" data-flow="${flow}"`);
    }
    // Flows with more than one demo group (and Flow 09) always have children to pick.
    for (const flow of [1, 2, 3, 6, 8, 9] as const) expect(childSheetsOf(flow).length, `flow ${flow}`).toBeGreaterThan(1);
  });

  it('lists only real child sheets of the same flow under a parent, each with a run of its own', () => {
    for (const flow of FLOW_IDS) {
      for (const child of childSheetsOf(flow)) {
        expect(isInfoKey(child), child).toBe(true);
        expect(child.startsWith('flow-'), child).toBe(false);
        expect(subProcessInfo(child).flow, child).toBe(flow);
        expect(sheetDemo(child), child).not.toBeNull();
        expect(sheet(child), child).toContain(RUN_BUTTON_EN);
      }
    }
  });

  it('keeps every sheet key in the registry exactly once, keyed by itself', () => {
    expect(new Set(INFO_KEYS).size).toBe(INFO_KEYS.length);
    for (const key of INFO_KEYS) expect(SUB_PROCESS_REGISTRY[key]?.key, key).toBe(key);
    expect(Object.keys(SUB_PROCESS_REGISTRY).sort()).toEqual([...INFO_KEYS].sort());
  });

  it('opens each menu choice on a sheet of its own flow', () => {
    for (const c of MENU_CHOICES) {
      const key = c.kind === 'cit' ? c.key : infoKeyForChoice(c.flow, c.kind === 'sub' ? c.sub : null);
      expect(isInfoKey(key), JSON.stringify(c)).toBe(true);
      expect(subProcessInfo(key).flow, JSON.stringify(c)).toBe(c.flow);
    }
  });
});

describe('§1.2 every child scenario mounts, runs and completes', () => {
  // Every demo button of flows 01-08 (the night batch has its own suite; the cassette alert is a toast, not a payment).
  const payments = ALL_DEMO_ACTIONS.filter((a) => a.id !== 'eod' && a.id !== 'cassette-low');

  it('covers every demo group with at least one runnable scenario', () => {
    for (const g of DEMO_GROUPS) expect(groupMembers(g.id).length, g.id).toBeGreaterThan(0);
    for (const flow of FLOW_IDS) if (flow !== CIT_FLOW) expect(demoActionsFor(flow).length, `flow ${flow}`).toBeGreaterThan(0);
  });

  it.each(payments.map((a) => [a.id, a.flow] as const))('%s (flow %i) runs to a finished payment and releases the lock', (id, flow) => {
    at(10 * 60);
    executeDemo(id);
    const s = bankStore.getState();
    expect(s.flow).toBe(flow);
    if (s.presetTrace === null) {
      // A book-only retail action (the cassette refill) or one its book refuses from a fresh day (nothing pledged): it posts or
      // says why in the retail book, sends no payment and holds no lock.
      expect(retailOpsStore.getState().last?.action, id).toBe(id);
      expect(demoLocked(), id).toBe(false);
      return;
    }
    expect(demoSessionStore.getState().active?.kind).toBe('payment');
    expect(playDemoToEnd(), `${id} finished`).toBe(true);
    const end = bankStore.getState();
    expect(end.playing, `${id} stays paused after its run`).toBe(false);
    expect(end.presetTrace!.route.length).toBeGreaterThan(0);
    // The ledger stays balanced after every scenario.
    expect(end.view.ledger.trial.balanced, id).toBe(true);
  });

  it('runs the two refused-from-fresh retail actions once their precondition is set up', () => {
    at(10 * 60);
    executeDemo('collateral-lock');
    expect(playDemoToEnd()).toBe(true);
    demoSessionStore.getState().finish();
    executeDemo('collateral-liquidate');
    expect(retailOpsStore.getState().last?.status).not.toBe('BLOCKED');
    expect(bankStore.getState().presetTrace).not.toBeNull();
    expect(playDemoToEnd()).toBe(true);
  });

  it('plays each sub-group sheet’s headline run as the first button of that group', () => {
    for (const flow of FLOW_IDS) {
      for (const child of childSheetsOf(flow)) {
        const demo = sheetDemo(child)!;
        if (demo.kind !== 'action') continue;
        const members = groupMembers(child as Parameters<typeof groupMembers>[0]);
        expect(members[0]?.def.id, child).toBe(demo.id);
      }
    }
  });

  it.each(CIT_DEMOS as readonly CitDemo[])('CIT child %s dispatches, settles and unlocks', (kind) => {
    at(10 * 60);
    expect(dispatchCitDemo(kind)).toBe(true);
    expect(demoLocked()).toBe(true);
    expect(citChildOf(bankStore.getState())).toBe(kind);
    const s = citStore.getState();
    const run = citNow().runs.find((r) => r.planned.order.id === `CIT-${s.day}-M1`);
    expect(run?.run?.status).toBe('EN_ROUTE');
    // Play the run on by itself (the bank stays paused) past its settlement.
    citStore.getState().playAhead(0, CIT_TIMING.SETTLED + CIT_TIMING.incident + 1);
    const done = citNow();
    expect(done.runs.find((r) => r.planned.order.id === `CIT-${s.day}-M1`)?.run?.status).toBe('SETTLED');
    expect(done.lock).toBeNull();
    // The demo's own transit account is back to zero (scheduled vans may still be on the road).
    const own = done.runs.find((r) => r.planned.order.id === `CIT-${s.day}-M1`)!.run!;
    expect(own.entries.flatMap((e) => e.lines).reduce((n, l) => n + (l.account === 'TRANSIT' ? l.dr - l.cr : 0), 0)).toBe(0);
    expect(demoLocked()).toBe(false);
    expect(bankStore.getState().playing).toBe(false);
  });

  it('refuses a second run while one is still going (one execution lock)', () => {
    at(10 * 60);
    executeDemo('pos-20');
    expect(demoLocked()).toBe(true);
    expect(dispatchCitDemo('ATM')).toBe(false);
    const before = bankStore.getState().presetTxId;
    executeDemo('teller-12k');
    expect(bankStore.getState().presetTxId).toBe(before);
  });
});

describe('§1.3 Flow 09 CIT architecture', () => {
  it('has exactly four top-level children, each its own sheet, under the CIT-09 master code', () => {
    expect(Object.values(CIT_INFO_KEYS).sort()).toEqual(['09-cit-atm', '09-cit-doorstep', '09-cit-sbv', '09-cit-teller-vault']);
    expect([...childSheetsOf(CIT_FLOW)].sort()).toEqual(['09-cit-atm', '09-cit-doorstep', '09-cit-sbv', '09-cit-teller-vault']);
    expect(subProcessInfo('flow-9').code).toBe('CIT-09');
    expect(GUIDED_FLOWS[9].code).toBe('09');
    for (const key of Object.values(CIT_INFO_KEYS)) {
      const info = subProcessInfo(key);
      expect(info.flow, key).toBe(9);
      expect(info.code.startsWith('09-CIT-'), key).toBe(true);
    }
  });

  it('routes each child to its own CIT demo and every other sheet to none', () => {
    for (const [demo, key] of Object.entries(CIT_INFO_KEYS) as [CitDemo, string][]) {
      expect(citDemoOfKey(key)).toBe(demo);
      expect(sheetDemo(key as (typeof CIT_INFO_KEYS)[CitDemo])).toEqual({ kind: 'cit', demo });
    }
    for (const key of INFO_KEYS) if (!Object.values(CIT_INFO_KEYS).includes(key as never)) expect(citDemoOfKey(key), key).toBeNull();
  });

  it('lists the four children in the top menu under Flow 09 only, and no payment demo group in Flow 09', () => {
    const cit = MENU_CHOICES.filter((c) => c.kind === 'cit');
    expect(cit).toHaveLength(4);
    expect(cit.every((c) => c.flow === CIT_FLOW)).toBe(true);
    expect(demoGroupsIn(CIT_FLOW)).toHaveLength(0);
    expect(demoActionsFor(CIT_FLOW)).toHaveLength(0);
  });

  it('opens the vault desk on the Flow 09 parent sheet', () => {
    expect(infoKeyForPlace('MAIN_CASH_VAULT')).toBe('flow-9');
  });

  it('selecting a CIT child lights Flow 09 with that child, and a payment flow never reports a CIT child', () => {
    for (const kind of CIT_DEMOS) {
      bankStore.getState().selectSubProcess(kind, CIT_FLOW);
      expect(bankStore.getState().flow).toBe(CIT_FLOW);
      expect(citChildOf(bankStore.getState())).toBe(kind);
    }
    bankStore.getState().setActiveFlow(6);
    expect(citChildOf(bankStore.getState())).toBeNull();
  });
});
