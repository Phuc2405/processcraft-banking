/**
 * The STP mandate's regression net: the strategy rules and their boundaries, the config clamp, the virtual STP node's routing
 * (every hop a wire), the fast-fail gates, the OTP desk's capacity, and the invariants STP must never break: balanced books,
 * unchanged outcomes and ledger lines, and nothing moving while paused. Property tests drive random configs and sequences.
 */
import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StpDrawer } from '../../components/ops/StpPanel';
import { KnowledgeDisclaimer, KnowledgeTabs, StpArticle } from '../../components/knowledge/KnowledgeBaseModal';
import { STP_ARTICLE } from '../../data/stpKnowledge';
import { RETAIL_FLASHCARDS } from '../../data/retailFlashcards';
import { PLACE_BOX } from '../../engine/plan/layout';
import { OFFICE_PLACE_BOX } from '../../engine/plan/officePlan';
import { everyTransactionBalances, trialBalance } from '../../engine/ledger';
import { bankStore } from '../../store/bankStore';
import type { BankingPayload } from '../../types/processLearning';
import { ACADEMY_CHAPTERS } from '../academyCatalog';
import { planExtended } from '../amlEngine';
import { BankSimulation, OTP_SURGE_THREADS } from '../bankSimulation';
import { WORK_START } from '../clock';
import { opsCustomer } from '../presets';
import { generateDay } from '../traffic';
import { buildGraphs, planCheckout, routeIsWired } from '../processes';
import { OPS_ACTIONS, opsActionById, type OpsActionId } from '../retailOps';
import { DEFAULT_RULES } from '../rules';
import { RETAIL_DESK, buildTaskCase, gradeTaskCase, RETAIL_TASK } from '../staffRoleplay';
import { bnplCreditProfile, clampStp, decideStp, DEFAULT_STP, fastFail, OPS_STP_CASE, opsStpVerdict, STP_LIMITS, stpPlaces, stpRoute, straightThroughRate, type StpCase, type StpConfig } from '../stpEngine';
import { hasWire, STATIONS, type PlaceId } from '../topology';
import type { Customer } from '../types';

const graphs = buildGraphs(DEFAULT_RULES);
const OFF: StpConfig = { ...DEFAULT_STP, enabled: false };
const bnpl = (over: Partial<StpCase> = {}): StpCase => ({ product: 'BNPL', amountCents: 40_000, ekyc: 'PASS', dtiPct: 23, cicGroup: 1, ...over });

const arbConfig: fc.Arbitrary<StpConfig> = fc.record({
  enabled: fc.boolean(),
  bnplMaxCents: fc.integer({ min: 0, max: 400_000 }),
  maxDtiPct: fc.integer({ min: 0, max: 60 }),
  termDeposit: fc.boolean(),
  cardFees: fc.boolean(),
  kiosk: fc.boolean(),
}).map(clampStp);

const wired = (route: readonly PlaceId[]): boolean => route.every((p, i) => i === 0 || hasWire(route[i - 1]!, p));

const bnplCustomer = (amount: number, score: number, extra: Partial<NonNullable<BankingPayload['bnpl']>> = {}, balance = 100_000): Customer => ({
  id: `c-${amount}-${score}`,
  kind: 'BNPL',
  scenario: '',
  minute: 600,
  otpCompletes: true,
  payload: { txId: 'tx', amount, channel: 'ECOMMERCE', cardType: 'DEBIT', rawCvv: '123', clientTimestamp: 1_800_000_000_000, riskScore: 10, isFraud: false, availableBalance: balance, creditLimit: 0, bnpl: { underwritingScore: score, downPaymentMinor: Math.ceil(amount / 4), ...extra } },
});

describe('the STP strategies', () => {
  it('auto-approves a BNPL case only when every rule holds, the DTI cap inclusive', () => {
    expect(decideStp(bnpl(), DEFAULT_STP)).toEqual({ route: 'STP', flags: [], action: 'APPROVE' });
    expect(decideStp(bnpl({ amountCents: 50_000 }), DEFAULT_STP).route).toBe('STP');
    expect(decideStp(bnpl({ amountCents: 65_000, dtiPct: 24 }), DEFAULT_STP)).toEqual({ route: 'MANUAL', flags: ['AMOUNT_OVER_LIMIT', 'DTI_OVER_LIMIT'] });
    expect(decideStp(bnpl({ cicGroup: 2 }), DEFAULT_STP).flags).toEqual(['CIC_NOT_GROUP_1']);
    expect(decideStp(bnpl({ amlHit: true }), DEFAULT_STP).flags).toEqual(['AML_SANCTION_MATCH']);
    // Missing facts never pass: no DTI is treated as 100%, no CIC as group 5 is a fast-fail.
    expect(decideStp({ product: 'BNPL', amountCents: 1_000, ekyc: 'PASS', cicGroup: 1 }, DEFAULT_STP).flags).toContain('DTI_OVER_LIMIT');
  });

  it('fast-fails bad eKYC, a high-risk device and CIC groups 3 to 5, even with STP switched off', () => {
    for (const ekyc of ['BIOMETRIC_AUTH_FAILED', 'FDS_HIGH_RISK_DEVICE'] as const) {
      expect(fastFail(bnpl({ ekyc }))).toBe(ekyc);
      expect(decideStp(bnpl({ ekyc }), OFF)).toEqual({ route: 'REJECT', flags: [ekyc] });
    }
    for (const cicGroup of [3, 4, 5] as const) expect(decideStp(bnpl({ cicGroup }), OFF)).toEqual({ route: 'REJECT', flags: ['CIC_BAD_DEBT'] });
    expect(fastFail(bnpl({ cicGroup: 2 }))).toBeNull();
  });

  it('sends everything to its desk when STP is off or the product is off', () => {
    expect(decideStp(bnpl(), OFF)).toEqual({ route: 'MANUAL', flags: ['STP_DISABLED'] });
    expect(decideStp({ product: 'TERM_DEPOSIT', amountCents: 1_000 }, { ...DEFAULT_STP, termDeposit: false }).flags).toEqual(['PRODUCT_OFF']);
    expect(decideStp({ product: 'CARD_FEE', amountCents: 1_000, casaCents: 9_000 }, { ...DEFAULT_STP, cardFees: false }).flags).toEqual(['PRODUCT_OFF']);
    expect(decideStp({ product: 'KIOSK_CASH', amountCents: 1_000 }, { ...DEFAULT_STP, kiosk: false }).flags).toEqual(['PRODUCT_OFF']);
  });

  it('renews clean term deposits under $50,000, waives premium fees, debits covered fees and routes cash under the CTR line', () => {
    expect(decideStp({ product: 'TERM_DEPOSIT', amountCents: 4_999_999 }, DEFAULT_STP)).toMatchObject({ route: 'STP', action: 'RENEW' });
    expect(decideStp({ product: 'TERM_DEPOSIT', amountCents: STP_LIMITS.termDepositMaxCents }, DEFAULT_STP).flags).toEqual(['AMOUNT_OVER_LIMIT']);
    expect(decideStp({ product: 'TERM_DEPOSIT', amountCents: 1_000, pledged: true }, DEFAULT_STP).flags).toEqual(['PLEDGED']);
    expect(decideStp({ product: 'CARD_FEE', amountCents: 4_500, casaCents: 0, spendCents: STP_LIMITS.premiumSpendCents }, DEFAULT_STP)).toMatchObject({ route: 'STP', action: 'WAIVE' });
    expect(decideStp({ product: 'CARD_FEE', amountCents: 4_500, casaCents: 4_500 }, DEFAULT_STP)).toMatchObject({ route: 'STP', action: 'DEBIT' });
    expect(decideStp({ product: 'CARD_FEE', amountCents: 4_500, casaCents: 2_000 }, DEFAULT_STP).flags).toEqual(['INSUFFICIENT_CASA']);
    expect(decideStp({ product: 'KIOSK_CASH', amountCents: STP_LIMITS.kioskMaxCents - 1 }, DEFAULT_STP).route).toBe('STP');
    expect(decideStp({ product: 'KIOSK_CASH', amountCents: STP_LIMITS.kioskMaxCents }, DEFAULT_STP).flags).toEqual(['OVER_CTR']);
  });

  it('works out the straight-through rate, 0 with nothing decided', () => {
    expect(straightThroughRate(0, 0)).toBe(0);
    expect(straightThroughRate(3, 1)).toBe(0.75);
  });
});

describe('the STP config', () => {
  it('defaults to $500 and 23%, with every product on', () => {
    expect(DEFAULT_STP).toEqual({ enabled: true, bnplMaxCents: 50_000, maxDtiPct: 23, termDeposit: true, cardFees: true, kiosk: true });
    expect(clampStp(null)).toEqual(DEFAULT_STP);
    expect(clampStp({ bnplMaxCents: Number.NaN, maxDtiPct: 'x' as never, enabled: 'yes' as never })).toEqual(DEFAULT_STP);
  });

  it('keeps any input on the slider ranges and steps: $100 to $2,000, DTI 15% to 35% (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e7, max: 1e7, noNaN: true }), fc.double({ min: -500, max: 500, noNaN: true }), (amount, dti) => {
        const c = clampStp({ bnplMaxCents: amount, maxDtiPct: dti });
        expect(c.bnplMaxCents).toBeGreaterThanOrEqual(10_000);
        expect(c.bnplMaxCents).toBeLessThanOrEqual(200_000);
        expect(c.bnplMaxCents % STP_LIMITS.bnplMaxCents.step).toBe(0);
        expect(c.maxDtiPct).toBeGreaterThanOrEqual(15);
        expect(c.maxDtiPct).toBeLessThanOrEqual(35);
        expect(clampStp(c)).toEqual(c);
      }),
    );
  });
});

describe('the virtual STP node', () => {
  it('is an automated core-ledger station with a slim card on the 2D map and a counter in the 3D ledger room', () => {
    expect(STATIONS.STP_ENGINE).toMatchObject({ department: 'LEDGER', kind: 'SYSTEM' });
    expect(STATIONS.STP_ENGINE.automated).toBeUndefined();
    expect(PLACE_BOX.STP_ENGINE.h).toBeLessThan(PLACE_BOX.BNPL.h);
    expect(OFFICE_PLACE_BOX.STP_ENGINE).toBeDefined();
    for (const [a, b] of [['GATE_ECOM', 'STP_ENGINE'], ['STP_ENGINE', 'OUT_APPROVED'], ['STP_ENGINE', 'OUT_DECLINED']] as const) expect(hasWire(a, b)).toBe(true);
  });

  it('routes every retail demo along real wires under any config, skipping the human desk only when STP takes it (property)', () => {
    fc.assert(
      fc.property(arbConfig, (cfg) => {
        for (const a of OPS_ACTIONS) {
          const route = stpRoute(a.id, a.route, cfg);
          expect(wired(route) || route === a.route, a.id).toBe(true);
          const v = opsStpVerdict(a.id, cfg);
          if (!v || v.route === 'MANUAL') expect(route).toBe(a.route);
          else {
            expect(route).not.toBe(a.route);
            expect(wired(route), a.id).toBe(true);
            expect(route).toContain(OPS_STP_CASE[a.id]!.product === 'KIOSK_CASH' && v.route === 'STP' ? 'ATM_CASH' : 'STP_ENGINE');
          }
          for (const p of route) expect(stpPlaces(a.id, a.route)).toContain(p);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('takes the named demos straight through on the defaults, and fast-fails CIC bad debt at the gate', () => {
    const route = (id: OpsActionId) => stpRoute(id, opsActionById(id).route, DEFAULT_STP);
    expect(route('td-mature-close')).toEqual(['STP_ENGINE', 'OUT_APPROVED']);
    expect(route('fee-card-10')).toEqual(['STP_ENGINE', 'OUT_APPROVED']);
    expect(route('teller-deposit-5000')).toEqual(['GATE_ATM', 'ATM_CASH', 'OUT_APPROVED']);
    expect(route('bnpl-decline-cic')).toEqual(['GATE_ECOM', 'STP_ENGINE', 'OUT_DECLINED']);
    expect(route('bnpl-decline-dti')).toEqual(opsActionById('bnpl-decline-dti').route);
    expect(route('td-break-pledged')).toEqual(opsActionById('td-break-pledged').route);
    expect(route('fee-annual-45')).toEqual(opsActionById('fee-annual-45').route);
    // With STP off every demo keeps its desk, except the fast-fail gate.
    expect(stpRoute('td-mature-close', opsActionById('td-mature-close').route, OFF)).toEqual(opsActionById('td-mature-close').route);
    expect(stpRoute('bnpl-decline-cic', opsActionById('bnpl-decline-cic').route, OFF)).toEqual(['GATE_ECOM', 'STP_ENGINE', 'OUT_DECLINED']);
  });

  it('sends the STP demos into the live bank as posted operations on the STP path, every hop wired', () => {
    for (const id of ['td-mature-close', 'fee-card-10', 'teller-deposit-5000', 'bnpl-decline-cic'] as const) {
      const c = opsCustomer(id, undefined, DEFAULT_STP)!;
      expect(c.kind, id).toBe('CREDIT_OPS');
      const plan = planExtended(c);
      expect(routeIsWired(plan.stops), id).toBe(true);
    }
    // Pay-in-4 keeps the live underwriting path, which itself goes straight through on DTI 23%, CIC group 1.
    const p = opsCustomer('bnpl-approve-400', undefined, DEFAULT_STP)!;
    expect(planCheckout(p, graphs, DEFAULT_STP).stops.map((s) => s.place)).toEqual(['GATE_ECOM', 'STP_ENGINE', 'OUT_APPROVED']);
    expect(planCheckout(p, graphs, OFF).stops.map((s) => s.place)).toContain('BNPL');
  });
});

describe('fast-fail gates', () => {
  it('refuses CIC bad debt at the online gate before any underwriter, posting nothing', () => {
    const plan = planCheckout(bnplCustomer(20_000, 700, { cicGroup: 4, dtiPct: 10 }), graphs);
    expect(plan.stops.map((s) => s.place)).toEqual(['GATE_ECOM', 'STP_ENGINE', 'OUT_DECLINED']);
    expect(plan).toMatchObject({ outcome: 'DECLINED', decline: 'CREDIT_RISK', reasonCode: 'CIC_BAD_DEBT', ledger: [] });
  });

  it('derives a stable credit profile for live applicants: a low score is bad debt', () => {
    expect(bnplCreditProfile('a', { underwritingScore: 700, downPaymentMinor: 0 }).cicGroup).toBe(1);
    expect(bnplCreditProfile('a', { underwritingScore: 400, downPaymentMinor: 0 }).cicGroup).toBeGreaterThanOrEqual(3);
    expect(bnplCreditProfile('a', { underwritingScore: 650, downPaymentMinor: 0 })).toEqual(bnplCreditProfile('a', { underwritingScore: 650, downPaymentMinor: 0 }));
    expect(bnplCreditProfile('a', { underwritingScore: 650, downPaymentMinor: 0, dtiPct: 31, cicGroup: 2 })).toEqual({ dtiPct: 31, cicGroup: 2 });
  });

  it('ends a failed eKYC and a high-risk device at their own checkpoint: nothing reaches a desk downstream', () => {
    const plans = [1, 2, 3, 4, 5].flatMap((d) => generateDay(7, d).customers.filter((c) => ['ONBOARD', 'QR', 'SWIFT'].includes(c.kind)).map(planExtended));
    const dead = plans.filter((p) => p.decline === 'EKYC_LIVENESS_FAILED' || p.decline === 'FDS_HIGH_RISK_DEVICE');
    expect(dead.length).toBeGreaterThan(0);
    for (const p of dead) {
      const places = p.stops.map((s) => s.place);
      expect(places.at(-1)).toBe('OUT_DECLINED');
      expect(places).not.toContain('AML_DESK');
      expect(places).not.toContain('LEDGER_DEBIT');
      expect(p.ledger).toEqual([]);
    }
  });
});

describe('the OTP desk', () => {
  it('runs four threads, and auto-scales on a flash-sale day at no cover cost', () => {
    expect(STATIONS.SEC_3DS.staff).toBeGreaterThanOrEqual(4);
    const normal = new BankSimulation({ seed: 3, headless: true });
    expect(normal.snapshot().stations.SEC_3DS.workers).toHaveLength(STATIONS.SEC_3DS.staff);
    const surge = new BankSimulation({ seed: 3, day: 2, headless: true, chaos: { scriptedDays: true } });
    expect(surge.snapshot().stations.SEC_3DS.workers).toHaveLength(STATIONS.SEC_3DS.staff + OTP_SURGE_THREADS);
    expect(surge.snapshot().kpis.coverCostCents).toBe(0);
  });
});

describe('STP in the live bank', () => {
  const day = (stp: Partial<StpConfig>) => {
    const sim = new BankSimulation({ seed: 11, headless: true, stp });
    sim.runToEndOfDay();
    return sim;
  };

  it('moves Pay-in-4 cases off the appraisal desk through the STP node, and a wider limit raises the STR', () => {
    const off = day({ enabled: false });
    const tight = day({ bnplMaxCents: 10_000, maxDtiPct: 15 });
    const wide = day({ bnplMaxCents: 200_000, maxDtiPct: 35 });
    expect(off.snapshot().stp.straight).toBe(0);
    expect(wide.snapshot().stp.straight).toBeGreaterThan(0);
    expect(wide.snapshot().stp.rate).toBeGreaterThan(tight.snapshot().stp.rate);
    expect(wide.snapshot().stations.BNPL.stats.processedToday).toBeLessThan(off.snapshot().stations.BNPL.stats.processedToday);
    for (const sim of [off, tight, wide]) {
      const t = sim.snapshot().stp;
      expect(t.rate).toBeGreaterThanOrEqual(0);
      expect(t.rate).toBeLessThanOrEqual(1);
      expect(trialBalance(sim.ledgerEntries).balanced).toBe(true);
    }
  });

  it('changes the path, never the outcome or the ledger lines, for any applicant and any config (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1_000, max: 300_000 }), fc.integer({ min: 300, max: 900 }), fc.integer({ min: 0, max: 60 }), fc.constantFrom(1, 2) as fc.Arbitrary<1 | 2>, arbConfig, (amount, score, dtiPct, cicGroup, cfg) => {
        const c = bnplCustomer(amount, score, { dtiPct, cicGroup });
        const manual = planCheckout(c, graphs, OFF);
        const plan = planCheckout(c, graphs, cfg);
        expect(plan.outcome).toBe(manual.outcome);
        expect(plan.ledger).toEqual(manual.ledger);
        expect(plan.heldCents).toBe(manual.heldCents);
        expect(routeIsWired(plan.stops)).toBe(true);
        if (plan.stops.some((s) => s.place === 'STP_ENGINE')) expect(plan.stops.some((s) => s.place === 'BNPL')).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('keeps Σ Dr = Σ Cr through any sequence of config toggles and beats (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(arbConfig, fc.integer({ min: 1, max: 40 })), { minLength: 1, maxLength: 6 }), (steps) => {
        const sim = new BankSimulation({ seed: 5, headless: true });
        for (const [cfg, beats] of steps) {
          sim.setStp(cfg);
          for (let i = 0; i < beats && !sim.dayOver; i++) sim.step();
          const t = sim.snapshot().stp;
          expect(t.straight + t.manual + t.fastFail).toBeGreaterThanOrEqual(0);
        }
        expect(everyTransactionBalances(sim.ledgerEntries)).toBe(true);
        expect(trialBalance(sim.ledgerEntries).balanced).toBe(true);
      }),
      { numRuns: 12 },
    );
  });
});

describe('the STP drawer and pause isolation', () => {
  afterEach(() => {
    bankStore.getState().setStp(DEFAULT_STP);
  });

  it('applies a config to the running bank at once, clamped, and moves nothing while paused (no ghost transactions)', () => {
    const s = () => bankStore.getState();
    s().skipTo(WORK_START + 90);
    expect(s().playing).toBe(false);
    const k = () => s().view.kpis.approved + s().view.kpis.declined;
    const before = { done: k(), minute: s().view.minute, inFlight: s().sim.snapshot().inFlight, entries: s().sim.ledgerEntries.length };
    s().setStp({ bnplMaxCents: 999_999, maxDtiPct: 2 });
    s().setStp({ enabled: false });
    s().setStp({ enabled: true, termDeposit: false });
    expect(s().stp).toMatchObject({ bnplMaxCents: 200_000, maxDtiPct: 15, enabled: true, termDeposit: false });
    expect(s().sim.stp).toEqual(s().stp);
    expect({ done: k(), minute: s().view.minute, inFlight: s().sim.snapshot().inFlight, entries: s().sim.ledgerEntries.length }).toEqual(before);
  });

  it('renders the switch, both sliders, the three product toggles and the live STR', () => {
    const html = renderToStaticMarkup(createElement(StpDrawer));
    for (const id of ['stp-enabled', 'stp-amount', 'stp-dti', 'stp-toggle-termDeposit', 'stp-toggle-cardFees', 'stp-toggle-kiosk', 'stp-stat-rate', 'stp-bnpl-queue']) expect(html, id).toContain(`data-testid="${id}"`);
    expect(html).toContain('min="10000"');
    expect(html).toContain('max="200000"');
    expect(html).toContain('min="15"');
    expect(html).toContain('max="35"');
  });
});

describe('the STP education suite', () => {
  it('has a Knowledge Base tab and article covering the architecture, STR, fast-fail and ISO 20022', () => {
    expect(renderToStaticMarkup(createElement(KnowledgeTabs, { tab: 'stp', onTab: () => undefined }))).toContain('data-testid="kb-tab-stp"');
    const basic = renderToStaticMarkup(createElement(StpArticle, { view: 'basic' }));
    const advanced = renderToStaticMarkup(createElement(StpArticle, { view: 'advanced' }));
    for (const id of ['stp-concept', 'stp-rules', 'stp-str', 'stp-fastfail']) expect(basic).toContain(`data-section="${id}"`);
    expect(basic).not.toContain('data-section="stp-iso20022"');
    expect(advanced).toContain('data-section="stp-iso20022"');
    expect(STP_ARTICLE.sections.every((s) => s.id.startsWith('stp-'))).toBe(true);
  });

  it('adds lesson 7 to the Academy with an STP flashcard in the 4-part format', () => {
    const ch7 = ACADEMY_CHAPTERS.find((c) => c.id === 7)!;
    expect(ch7.levels.map((l) => l.place)).toEqual(['STP_ENGINE', 'STP_ENGINE', 'BNPL', 'COLLATERAL_VAULT']);
    const card = RETAIL_FLASHCARDS.find((c) => c.id === 'retail-stp')!;
    expect(card.tag?.vi).toBe('Xử lý tự động STP');
    expect(card.rule.vi).toBe('Straight-Through Processing - Xử lý giao dịch tự động 100% không qua can thiệp thủ công.');
    expect(card.entry?.vi).toBe('Hạch toán Nợ/Có tự động tức thì vào sổ cái Core Banking (Real-time GL posting).');
    expect(card.detail?.vi).toBe('Kiểm tra tự động eKYC, điểm DTI, hạn mức rủi ro và danh sách cấm vận AML.');
    expect(card.reference.vi).toBe('Thông tư 31/2024/TT-NHNN & Tiêu chuẩn giao dịch điện tử ISO 20022');
  });

  it('plays the three STP roleplays with balanced journals and both verdicts', () => {
    expect(RETAIL_DESK.bnpl).toEqual(expect.arrayContaining(['STP_TUNING', 'STP_EXCEPTION']));
    expect(RETAIL_DESK.aml).toContain('STP_SANCTION');
    for (const role of ['bnpl', 'aml'] as const) {
      const cases = Array.from({ length: 80 }, (_, i) => buildTaskCase(role, RETAIL_TASK, i)).filter((c) => c.retail?.id.startsWith('STP_'));
      expect(cases.length, role).toBeGreaterThan(0);
      expect(new Set(cases.map((c) => c.expected))).toEqual(new Set(['APPROVE', 'REJECT']));
      for (const c of cases)
        for (const d of ['APPROVE', 'REJECT'] as const) {
          const lines = gradeTaskCase(c, d).journal?.lines ?? [];
          expect(lines.reduce((n, l) => n + l.dr - l.cr, 0), c.id).toBe(0);
        }
    }
  });
});

describe('the map overlay and the Knowledge Base footer', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

  it('folds the 3D time, weather and label controls into one display-options popover under 1280px', () => {
    const office = src('components/bank/office/Office3D.tsx');
    expect(office).toContain('export const TOOLBAR_OPTIONS_PX = 1280;');
    expect(office).toContain("{t('Display options')}");
    expect(office).toMatch(/\{!folded && \(\s*<button/);
  });

  it('clamps the disclaimer to two lines under 768px, with the full text as its tooltip', () => {
    const css = src('index.css');
    expect(css).toMatch(/@media \(max-width: 767px\) \{\s*\.kb-disclaimer \{[^}]*-webkit-line-clamp: 2;/);
    const html = renderToStaticMarkup(createElement(KnowledgeDisclaimer));
    expect(html).toContain('class="kb-disclaimer');
    expect(html).toMatch(/title="[^"]{20,}"/);
  });
});
