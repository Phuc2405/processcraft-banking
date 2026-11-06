/**
 * Regression suite: the hover card's 📌 task banner names what the place DOES (an action verb phrase), never the step's place or account
 * name (the bug: "📌 Tác vụ quy trình: Tài khoản thanh toán (CASA)"); and the AML and reconciliation desks list their live TK 2930
 * Frozen assets balance from the core ledger.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { StationTooltip } from '../../../components/bank/StationTooltip';
import { setActiveLocale } from '../../../i18n/localeCore';
import { bankStore } from '../../../store/bankStore';
import { FLOW_IDS } from '../../../types/viewport';
import { DESK_ACCOUNTS, deskBalances } from '../../cashStationTip';
import { formatMoney } from '../../kpis';
import { GUIDED_FLOWS, STEP_ACTIONS, stepAction, stepText } from '../../guidedFlows';
import { openingLedger, postJournal } from '../../staffRoleplay';
import { STATION_IDS } from '../../topology';

type Api = { getInitialState: () => unknown };
const api = bankStore as unknown as Api;
const initial = api.getInitialState;
beforeAll(() => void (api.getInitialState = bankStore.getState));
afterAll(() => void (api.getInitialState = initial));
afterEach(() => {
  setActiveLocale('en');
  bankStore.getState().setScope('advanced');
});

/** Bare account/category nouns a task title must never be. */
const NOUN_TITLES = /^(Tài khoản thanh toán( \(CASA\)| của khách)?|Customer CASA|Debit CASA|CASA|Account Opened|Savings & Collateral|Tiết kiệm & Tài sản bảo đảm)$/;

describe('📌 task titles are actions, one per step, in both languages', () => {
  for (const flow of FLOW_IDS) {
    it(`Flow ${String(flow).padStart(2, '0')}: one action per step, none equal to the step's place name or a bare account noun`, () => {
      const steps = GUIDED_FLOWS[flow].steps;
      expect(STEP_ACTIONS[flow]).toHaveLength(steps.length);
      for (const [i, step] of steps.entries()) {
        const a = STEP_ACTIONS[flow][i]!;
        for (const title of [a.en, a.vi]) {
          expect(title.trim()).not.toBe('');
          expect(title).not.toMatch(NOUN_TITLES);
        }
        setActiveLocale('vi');
        expect(stepAction(flow, step)).toBe(a.vi);
        expect(stepAction(flow, step)).not.toBe(stepText(flow, step).name);
        setActiveLocale('en');
        expect(stepAction(flow, step)).toBe(a.en);
        expect(stepAction(flow, step)).not.toBe(step.name);
      }
    });
  }

  it('the Flow 01 debit desk banner reads "Ghi nợ & Kiểm tra số dư CASA", not "Tài khoản thanh toán (CASA)"', () => {
    setActiveLocale('vi');
    bankStore.getState().setActiveFlow(1);
    const html = renderToStaticMarkup(createElement(StationTooltip, { place: 'LEDGER_DEBIT' }));
    expect(html).toContain('📌 Tác vụ quy trình: Ghi nợ &amp; Kiểm tra số dư CASA');
    expect(html).not.toContain('Tác vụ quy trình: Tài khoản thanh toán');
  });
});

describe('TK 2930 on the AML and reconciliation desks', () => {
  it('only the AML and reconciliation desks carry ledger lines, and both list 2930', () => {
    expect(Object.keys(DESK_ACCOUNTS).sort()).toEqual(['AML_DESK', 'RECON']);
    for (const id of STATION_IDS) {
      const lines = deskBalances(id, openingLedger());
      if (id === 'AML_DESK' || id === 'RECON') expect(lines.map((l) => l.code)).toEqual(['2930']);
      else expect(lines).toEqual([]);
    }
  });

  it('reads the live frozen balance, credit-natural, after a freeze posts Dr 2011 / Cr 2930', () => {
    const before = deskBalances('AML_DESK', openingLedger())[0]!.cents;
    const frozen = postJournal(openingLedger(), {
      caseId: 't',
      role: 'aml',
      scene: 'bnpl_apply',
      decision: 'REJECT',
      statusCode: 'AML_FROZEN',
      lines: [
        { gl: 'CASA', dr: 12_345_00, cr: 0 },
        { gl: 'FROZEN_ASSETS', dr: 0, cr: 12_345_00 },
      ],
    });
    expect(deskBalances('AML_DESK', frozen)[0]!.cents).toBe(before + 12_345_00);
    expect(deskBalances('RECON', frozen)[0]!.cents).toBe(before + 12_345_00);
  });

  it('the AML desk card shows the TK 2930 line in Vietnamese; a desk without ledger lines shows none', () => {
    setActiveLocale('vi');
    const cents = deskBalances('AML_DESK', bankStore.getState().retailLedger)[0]!.cents;
    const html = renderToStaticMarkup(createElement(StationTooltip, { place: 'AML_DESK' }));
    expect(html).toContain('data-account="FROZEN_ASSETS"');
    expect(html).toContain('TK 2930 Tài sản phong tỏa');
    expect(html).toContain(formatMoney(cents).replace(/&/g, '&amp;'));
    expect(renderToStaticMarkup(createElement(StationTooltip, { place: 'RECON' }))).toContain('data-account="FROZEN_ASSETS"');
    expect(renderToStaticMarkup(createElement(StationTooltip, { place: 'LEDGER_DEBIT' }))).not.toContain('data-account="FROZEN_ASSETS"');
  });
});
