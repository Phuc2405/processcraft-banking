/**
 * Regression suite §3: the AML / CTF and sanctions engine. Screening against the sanctions list, the PEP / structuring / large
 * cross-border holds, the $10,000 cash transaction report, the AML desk on the route, and the AML lesson anchors.
 */

import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { executeDemo } from '../../../components/bank/retailOpsActions';
import { AmlArticle } from '../../../components/knowledge/KnowledgeBaseModal';
import { lessonAnchor } from '../../../data/subProcessLessons';
import { bestWatchlistMatch, normalizeName } from '../../../engine/aml';
import { bankStore } from '../../../store/bankStore';
import { knowledgeTabOf, uiStore } from '../../../store/uiStore';
import { AML_POLICY, CTR_THRESHOLD_CENTS, checkTellerCash, isStructuring, reviewAml, SANCTIONS_LIST, sanctionsScore, screenAml } from '../../amlEngine';
import { sheetDemo } from '../../sheetDemo';
import { decideStp } from '../../stpEngine';
import { at, freshBank, playDemoToEnd } from './harness';

const clean = { name: 'Nguyen Thi Lan', pep: false };
const cashIn = (recent: number[] = []) => ({ direction: 'IN' as const, suspectSerials: 0, tillCents: 5_000_000, recentCashCents: recent });

beforeEach(freshBank);

describe('§3.1 sanctions and blacklist screening', () => {
  it('freezes every listed name, whatever the case or spacing, and the analyst can only confirm the block', () => {
    for (const e of SANCTIONS_LIST) {
      for (const name of [e.name, e.name.toUpperCase(), `  ${e.name.toLowerCase()}  `]) {
        expect(sanctionsScore(name), name).toBeGreaterThanOrEqual(AML_POLICY.sanctionMatchAt);
        const screen = screenAml({ subject: { name, pep: false }, amountCents: 10_000 });
        expect(screen.verdict, name).toBe('SANCTION_MATCH');
        expect(screen.reason).toBe('OFAC');
        // Even an analyst who thinks it is not fraud cannot release a sanctions hit.
        expect(reviewAml(screen, false).verdict).toBe('BLOCKED_SANCTION');
      }
      expect(bestWatchlistMatch(e.name, SANCTIONS_LIST)?.entry.name).toBe(e.name);
    }
  });

  it('lets an ordinary name through clean', () => {
    expect(sanctionsScore(clean.name)).toBeLessThan(AML_POLICY.sanctionMatchAt);
    expect(screenAml({ subject: clean, amountCents: 50_000 })).toMatchObject({ verdict: 'CLEAN', reason: 'NONE', ctr: false });
    expect(normalizeName('  Nguyễn  Thị Lan ')).toBe(normalizeName('nguyen thi lan'));
  });

  it('holds a PEP and a large cross-border payment as STR_PENDING for the analyst', () => {
    expect(screenAml({ subject: { ...clean, pep: true }, amountCents: 10_000 })).toMatchObject({ verdict: 'STR_PENDING', reason: 'PEP' });
    expect(screenAml({ subject: clean, amountCents: AML_POLICY.largeCrossBorderCents, crossBorder: true })).toMatchObject({ verdict: 'STR_PENDING', reason: 'LARGE_CROSS_BORDER' });
    expect(screenAml({ subject: clean, amountCents: AML_POLICY.largeCrossBorderCents - 1, crossBorder: true }).verdict).toBe('CLEAN');
  });

  it('files an STR and releases a structuring case the analyst clears, blocks it when it is fraud', () => {
    const smurf = screenAml({ subject: clean, amountCents: 900_000, cash: cashIn([950_000]) });
    expect(smurf).toMatchObject({ verdict: 'STR_PENDING', reason: 'STRUCTURING' });
    expect(reviewAml(smurf, false).verdict).toBe('STR_FILED_RELEASED');
    expect(reviewAml(smurf, true).verdict).toBe('BLOCKED_STR');
  });

  it('ranks a sanctions hit above every other hold (property)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...SANCTIONS_LIST.map((e) => e.name)), fc.boolean(), fc.integer({ min: 1, max: 5_000_000 }), fc.boolean(), (name, pep, amount, crossBorder) => {
        expect(screenAml({ subject: { name, pep }, amountCents: amount, crossBorder, cash: cashIn([amount]) }).verdict).toBe('SANCTION_MATCH');
      }),
    );
  });

  it('blocks the SWIFT sanction demo at the AML desk, end to end', () => {
    expect(sheetDemo('aml-sanctions')).toEqual({ kind: 'action', id: 'swift-sanction' });
    at(10 * 60);
    executeDemo('swift-sanction');
    expect(playDemoToEnd()).toBe(true);
    const t = bankStore.getState().presetTrace!;
    expect(t.route).toContain('AML_DESK');
    expect(t.route.at(-1)).toBe('OUT_DECLINED');
    expect(t.plan.outcome).toBe('DECLINED');
    expect(t.plan.reasonCode).toBe('AML_SANCTION_MATCH');
  });
});

describe('§3.2 the cash transaction report (CTR) line', () => {
  it('sits at $10,000 and flags cash at or above it, never below', () => {
    expect(CTR_THRESHOLD_CENTS).toBe(1_000_000);
    for (const dir of ['IN', 'OUT'] as const) {
      const cash = { ...cashIn(), direction: dir, tillCents: 10_000_000 };
      expect(checkTellerCash(cash, CTR_THRESHOLD_CENTS).ctr, dir).toBe(true);
      expect(checkTellerCash(cash, CTR_THRESHOLD_CENTS - 1).ctr, dir).toBe(false);
      expect(screenAml({ subject: clean, amountCents: CTR_THRESHOLD_CENTS, cash }).ctr, dir).toBe(true);
    }
    // Only cash is reported: a transfer of the same amount is not a CTR.
    expect(screenAml({ subject: clean, amountCents: CTR_THRESHOLD_CENTS }).ctr).toBe(false);
  });

  it('flags the CTR for any cash amount at or over the line (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50_000_000 }), (amount) => {
        expect(checkTellerCash({ ...cashIn(), tillCents: 100_000_000 }, amount).ctr).toBe(amount >= CTR_THRESHOLD_CENTS);
      }),
    );
  });

  it('never splits under the line without being caught: several deposits just under it that cross it together are structuring', () => {
    const near = CTR_THRESHOLD_CENTS - 50_000;
    expect(isStructuring(near, [near])).toBe(true);
    expect(isStructuring(near, [])).toBe(false);
    expect(isStructuring(100_000, [100_000, 100_000])).toBe(false);
  });

  it('keeps cash at the CTR line off the Smart Kiosk’s straight-through path', () => {
    expect(decideStp({ product: 'KIOSK_CASH', amountCents: CTR_THRESHOLD_CENTS }, { enabled: true, bnplMaxCents: 50_000, maxDtiPct: 23, termDeposit: true, cardFees: true, kiosk: true })).toMatchObject({ route: 'MANUAL', flags: ['OVER_CTR'] });
  });

  it('pays the $12,000 counter withdrawal and files its CTR; routes the smurfing deposit to the AML desk', () => {
    at(10 * 60);
    executeDemo('teller-12k');
    expect(playDemoToEnd()).toBe(true);
    const big = bankStore.getState().presetTrace!;
    expect(big.plan.outcome).toBe('APPROVED');
    expect(big.amountCents).toBeGreaterThanOrEqual(CTR_THRESHOLD_CENTS);
    expect(big.stops.find((s) => s.place === 'TELLER_CASH')?.note).toMatch(/CTR filed/);

    freshBank();
    at(10 * 60);
    executeDemo('teller-smurf');
    expect(playDemoToEnd()).toBe(true);
    const smurf = bankStore.getState().presetTrace!;
    expect(smurf.route).toContain('AML_DESK');
    expect(smurf.route.indexOf('AML_DESK')).toBeGreaterThan(smurf.route.indexOf('TELLER_CASH'));
  });
});

describe('§3.3 AML lesson anchors', () => {
  it('maps the CTR group and Flow 08 to their own AML lessons', () => {
    expect(lessonAnchor('cash-ctr')).toBe('aml-cash-ctr');
    expect(lessonAnchor('flow-8')).toBe('aml-swift-disputes');
    expect(lessonAnchor('aml-sanctions').startsWith('aml')).toBe(true);
  });

  it('opens both on the AML tab of the Knowledge Base, scrolled to their section', () => {
    for (const anchor of ['aml-cash-ctr', 'aml-swift-disputes']) {
      expect(knowledgeTabOf(anchor)).toBe('aml');
      uiStore.getState().openKnowledge(anchor);
      expect(uiStore.getState()).toMatchObject({ overlay: 'knowledge', knowledgeTab: 'aml', knowledgeAnchor: anchor });
      uiStore.getState().closeKnowledge();
      expect(renderToStaticMarkup(createElement(AmlArticle, { highlight: anchor }))).toContain(`id="kb-${anchor}"`);
    }
  });
});
