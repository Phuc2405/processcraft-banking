/**
 * The STP follow-ups: kiosk cash counted in the STR, a waived card fee that posts nothing, what-if replays under the live STP
 * rules, a bureau-like credit profile, per-analyst override KPIs, Academy chapter 7 on the map and the drawer's tooltips.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StpDrawer } from '../../components/ops/StpPanel';
import { RETAIL_FLASHCARDS } from '../../data/retailFlashcards';
import { BankSimulation } from '../bankSimulation';
import { chapterOf, chapters } from '../chapters';
import { LESSONS } from '../learning';
import { opsCustomer } from '../presets';
import { openingBook, runOpsAction } from '../retailOps';
import { DEFAULT_RULES } from '../rules';
import { spotPlan, spotScope, wiresOfRoute } from '../spotlightPlan';
import { isOverride, OVERRIDE_ALERT_PCT, overrideKpis } from '../staffRoleplay';
import { bnplCreditProfile, DEFAULT_STP, opsStpVerdict } from '../stpEngine';
import { WIRES, edgeId } from '../topology';
import { compareDays } from '../whatIf';

const AT = 'D1 09:00:00';

describe('Smart Kiosk cash in the STR', () => {
  const day = (inject: boolean) => {
    const sim = new BankSimulation({ seed: 5, headless: true });
    if (inject) sim.inject(opsCustomer('teller-deposit-5000', undefined, DEFAULT_STP)!);
    sim.runToEndOfDay();
    return sim.snapshot().stp;
  };

  it('books a straight-through kiosk deposit on the STP engine, raising today’s straight-through count by one', () => {
    const c = opsCustomer('teller-deposit-5000', undefined, DEFAULT_STP)!;
    expect(c.ext?.creditOps?.kioskStp).toBe(true);
    expect(c.ext?.creditOps?.route).not.toContain('STP_ENGINE');
    expect(day(true).straight).toBe(day(false).straight + 1);
  });

  it('does not flag a case that already walks through the STP node, so nothing is counted twice', () => {
    expect(opsCustomer('td-mature-close', undefined, DEFAULT_STP)!.ext?.creditOps?.kioskStp).toBeUndefined();
    expect(opsCustomer('teller-deposit-5000', undefined, { ...DEFAULT_STP, kiosk: false })?.ext?.creditOps?.kioskStp).toBeUndefined();
  });
});

describe('a waived card fee', () => {
  it('is a WAIVE verdict for a premium cardholder, and posts no fee income whichever lane decides it', () => {
    expect(opsStpVerdict('fee-annual-waived', DEFAULT_STP)).toEqual({ route: 'STP', flags: [], action: 'WAIVE' });
    expect(opsStpVerdict('fee-annual-waived', { ...DEFAULT_STP, enabled: false })?.route).toBe('MANUAL');
    const book = openingBook();
    const { book: after, outcome } = runOpsAction(book, 'fee-annual-waived', AT);
    expect(outcome.status).toBe('APPROVED');
    expect(outcome.journal).toBeNull();
    expect(after.balances).toEqual(book.balances);
    expect(outcome.customer).toEqual({ before: 60_000, after: 60_000 });
  });

  it('still charges the ordinary annual fee to fee income', () => {
    const { outcome } = runOpsAction(openingBook(), 'fee-annual-45', AT);
    expect(outcome.journal?.lines.some((l) => l.account === 'FEE_INCOME' && l.cr === 4_500)).toBe(true);
  });
});

describe('what-if replays under the STP rules', () => {
  it('plays both runs under the config passed, so switching STP off changes the comparison', () => {
    const args = { seed: 3, startDay: 2, baseRules: DEFAULT_RULES, tweakedRules: { bnplMinScore: DEFAULT_RULES.bnplMinScore + 20 } };
    const on = compareDays({ ...args, stp: DEFAULT_STP });
    const off = compareDays({ ...args, stp: { ...DEFAULT_STP, enabled: false } });
    expect(on.before.kpis).not.toEqual(off.before.kpis);
    expect(compareDays(args).before.kpis).toEqual(on.before.kpis);
  });
});

describe('the bureau credit profile', () => {
  const sample = (score: number, n = 4000) => Array.from({ length: n }, (_, i) => bnplCreditProfile(`p${score}-${i}`, { underwritingScore: score, downPaymentMinor: 0 }));

  it('gives good scores mostly clean files and lower DTIs, without making any band certain', () => {
    const good = sample(720);
    const poor = sample(500);
    const share = (xs: ReturnType<typeof sample>, f: (x: (typeof xs)[number]) => boolean) => xs.filter(f).length / xs.length;
    expect(share(good, (x) => x.cicGroup === 1)).toBeGreaterThan(0.9);
    expect(share(good, (x) => x.cicGroup >= 3)).toBeLessThan(0.02);
    expect(share(poor, (x) => x.cicGroup >= 3)).toBeGreaterThan(0.3);
    expect(share(poor, (x) => x.cicGroup === 1)).toBeGreaterThan(0);
    const median = (xs: ReturnType<typeof sample>) => xs.map((x) => x.dtiPct).sort((a, b) => a - b)[xs.length >> 1]!;
    expect(median(good)).toBeLessThan(median(poor));
    for (const x of [...good, ...poor]) expect(x.dtiPct).toBeGreaterThanOrEqual(4);
  });

  it('runs synthetic identities at a higher DTI, and keeps scripted bureau facts as given', () => {
    expect(bnplCreditProfile('s', { underwritingScore: 650, downPaymentMinor: 0 }, true).dtiPct).toBeGreaterThan(bnplCreditProfile('s', { underwritingScore: 650, downPaymentMinor: 0 }).dtiPct);
    expect(bnplCreditProfile('s', { underwritingScore: 650, downPaymentMinor: 0, dtiPct: 31, cicGroup: 2 })).toEqual({ dtiPct: 31, cicGroup: 2 });
  });
});

describe('override KPIs per analyst', () => {
  const field = (flag: boolean) => ({ key: 'dti', value: { kind: 'text', text: '' } as never, flag });

  it('counts an approval of a flagged or referred case, or an explicit override code, as an override', () => {
    expect(isOverride({ expected: 'APPROVE', fields: [field(true)] }, 'APPROVE', '00')).toBe(true);
    expect(isOverride({ expected: 'REJECT', fields: [] }, 'APPROVE', '00')).toBe(true);
    expect(isOverride({ expected: 'APPROVE', fields: [] }, 'APPROVE', 'STP_OVERRIDE_APPROVED')).toBe(true);
    expect(isOverride({ expected: 'APPROVE', fields: [field(true)] }, 'REJECT', '05')).toBe(false);
    expect(isOverride({ expected: 'APPROVE', fields: [] }, 'APPROVE', '00')).toBe(false);
  });

  it('works out each desk-and-shift seat’s override rate and raises the red flag above the threshold', () => {
    const row = (role: 'bnpl' | 'aml', shift: number, override: boolean, compliance = 'COMPLIANT') => ({ role, shift, override, compliance });
    const kpis = overrideKpis([row('bnpl', 1, true, 'SOP_BREACH'), row('bnpl', 1, false), row('bnpl', 1, false), row('aml', 1, false), row('bnpl', 2, false)]);
    expect(kpis).toEqual([
      { role: 'aml', shift: 1, decisions: 1, overrides: 0, badOverrides: 0, ratePct: 0, alert: false },
      { role: 'bnpl', shift: 1, decisions: 3, overrides: 1, badOverrides: 1, ratePct: 33.3, alert: true },
      { role: 'bnpl', shift: 2, decisions: 1, overrides: 0, badOverrides: 0, ratePct: 0, alert: false },
    ]);
    expect(33.3).toBeGreaterThan(OVERRIDE_ALERT_PCT);
  });
});

describe('Academy chapter 7 in the Course Catalog', () => {
  it('is an Advanced card after chapter 6, with five examples', () => {
    expect(chapters()).toHaveLength(7);
    const g = chapterOf('G');
    expect(g.number).toBe(7);
    expect(g.difficulty).toBe('Advanced');
    expect(g.examples).toBe(5);
  });

  it('walks a clean case through the STP engine and a flagged one through the Pay-in-4 desk, every hop on a real wire', () => {
    const wires = new Set(WIRES.map(([a, b]) => edgeId(a, b)));
    const places = (id: string) => spotPlan('G', id).steps.map((s) => s.place);
    expect(places('straight')).toContain('STP_ENGINE');
    expect(places('straight')).not.toContain('BNPL');
    expect(places('straight').at(-1)).toBe('OUT_APPROVED');
    for (const id of ['dti', 'large', 'group2']) {
      expect(places(id), id).toContain('BNPL');
      expect(places(id), id).not.toContain('STP_ENGINE');
    }
    for (const e of LESSONS.G.examples) for (const s of spotPlan('G', e.id).steps) for (const w of wiresOfRoute(s.route)) expect(wires.has(w), `${e.id}: ${w}`).toBe(true);
    expect(spotScope('G').places.has('STP_ENGINE')).toBe(true);
  });
});

describe('the STP drawer tooltips and the flashcard citation', () => {
  it('explains every metric and both sliders on hover', () => {
    const html = renderToStaticMarkup(createElement(StpDrawer));
    for (const text of ['Straight-Through Processing', 'fast-fail', 'Straight-Through Rate = ', 'reviewed automatically by STP', 'debt-to-income']) expect(html, text).toContain(text);
    expect((html.match(/title="/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it('cites Circular 31/2024 and ISO 20022 on the STP definition card', () => {
    const card = RETAIL_FLASHCARDS.find((c) => c.id === 'retail-stp')!;
    expect(card.reference.vi).toBe('Thông tư 31/2024/TT-NHNN & Tiêu chuẩn giao dịch điện tử ISO 20022');
  });
});
