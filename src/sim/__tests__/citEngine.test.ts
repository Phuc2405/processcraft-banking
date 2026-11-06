import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CitBayView } from '../../components/bank/CitBay2D';
import { CitArticle, KnowledgeTabs } from '../../components/knowledge/KnowledgeBaseModal';
import { CitDrill, CitInspectorView } from '../../components/ops/CitPanel';
import { CIT_ARTICLE } from '../../data/citKnowledge';
import { RETAIL_FLASHCARDS } from '../../data/retailFlashcards';
import { knowledgeTabOf } from '../../store/uiStore';
import { ACADEMY_CHAPTERS } from '../academyCatalog';
import { glossaryFor, quizFor } from '../academyKnowledge';
import {
  advance,
  atmTrigger,
  bookAfter,
  branchTrigger,
  CIT_ACCOUNT_IDS,
  CIT_LIMITS,
  CIT_OPENING,
  CIT_STATUSES,
  citAccount,
  citAt,
  citDay,
  citOrder,
  citSchedule,
  countCash,
  dispatchEntry,
  entryBalanced,
  logIncident,
  postEntry,
  receiptEntry,
  runAt,
  sbvTrigger,
  startRun,
  verifySeal,
  type CitAccountId,
  type CitEntry,
  type CitLine,
  type CitOrder,
  type CitRun,
} from '../citEngine';

const code = (l: CitLine): string => citAccount(l.account).code;
/** "Dr 1131 100 | Cr 1111 100" style, by code (and account id where 1111 is split). */
const legs = (e: CitEntry): string[] => e.lines.map((l) => `${l.dr > 0 ? 'Dr' : 'Cr'} ${code(l)} ${l.account} ${l.dr || l.cr}`);
const sum = (b: Record<CitAccountId, number>): number => CIT_ACCOUNT_IDS.reduce((s, id) => s + b[id], 0);
const runToEnd = (o: CitOrder): CitRun => {
  let r = startRun(o);
  for (let i = 0; i < 10 && r.status !== 'SETTLED'; i++) r = advance(r);
  return r;
};

describe('CIT GL postings: the four scenarios', () => {
  it('1. ATM replenishment: Dr 1131 / Cr 1111, then Dr 1113 / Cr 1131', () => {
    const o = citOrder({ scenario: 'ATM_CDM', direction: 'OUT', amountCents: 5_000_000 });
    expect(legs(dispatchEntry(o))).toEqual(['Dr 1131 TRANSIT 5000000', 'Cr 1111 VAULT 5000000']);
    expect(legs(receiptEntry(o))).toEqual(['Dr 1113 ATM 5000000', 'Cr 1131 TRANSIT 5000000']);
  });

  it('1b. CDM cassette collection comes back to the vault and is sorted', () => {
    const o = citOrder({ scenario: 'ATM_CDM', direction: 'IN', amountCents: 4_000_000, unfitBp: 250 });
    expect(legs(dispatchEntry(o))).toEqual(['Dr 1131 TRANSIT 4000000', 'Cr 1113 ATM 4000000']);
    expect(legs(receiptEntry(o))).toEqual(['Dr 1111 VAULT 3900000', 'Dr 1112 UNFIT 100000', 'Cr 1131 TRANSIT 4000000']);
  });

  it('2. Branch A excess to HQ: Dr 1131 / Cr 1111 branch, then Dr 1111 HQ / Cr 1131', () => {
    const o = citOrder({ scenario: 'BRANCH_BALANCING', direction: 'OUT', amountCents: 200_000_000 });
    expect(legs(dispatchEntry(o))).toEqual(['Dr 1131 TRANSIT 200000000', 'Cr 1111 VAULT 200000000']);
    expect(legs(receiptEntry(o))).toEqual(['Dr 1111 HQ_VAULT 200000000', 'Cr 1131 TRANSIT 200000000']);
    const back = citOrder({ scenario: 'BRANCH_BALANCING', direction: 'IN', amountCents: 50_000_000 });
    expect(legs(dispatchEntry(back))).toEqual(['Dr 1131 TRANSIT 50000000', 'Cr 1111 HQ_VAULT 50000000']);
    expect(legs(receiptEntry(back))).toEqual(['Dr 1111 VAULT 50000000', 'Cr 1131 TRANSIT 50000000']);
  });

  it('3. Doorstep pickup: Dr 1131 / Cr 4211 provisional, then Dr 1111 / Cr 1131 on the count', () => {
    const o = citOrder({ scenario: 'DOORSTEP', direction: 'IN', amountCents: 30_000_000, client: 'WinMart' });
    expect(legs(dispatchEntry(o))).toEqual(['Dr 1131 TRANSIT 30000000', 'Cr 4211 CORP 30000000']);
    expect(legs(receiptEntry(o))).toEqual(['Dr 1111 VAULT 30000000', 'Cr 1131 TRANSIT 30000000']);
  });

  it('3b. a doorstep shortfall reverses the provisional credit, and unfit notes go to 1112', () => {
    const o = citOrder({ scenario: 'DOORSTEP', direction: 'IN', amountCents: 30_000_000, shortCents: 20_000, unfitBp: 100 });
    const c = countCash(o);
    expect(c).toEqual({ receivedCents: 29_980_000, fitCents: 29_680_000, unfitCents: 300_000, shortCents: 20_000 });
    expect(legs(receiptEntry(o))).toEqual(['Dr 1111 VAULT 29680000', 'Dr 1112 UNFIT 300000', 'Dr 4211 CORP 20000', 'Cr 1131 TRANSIT 30000000']);
    // The client ends up credited only with what was counted.
    const b = bookAfter([dispatchEntry(o), receiptEntry(o)]);
    expect(CIT_OPENING.CORP - b.CORP).toBe(29_980_000);
  });

  it('4a. SBV deposit: Dr 1131 / Cr 1111 (and 1112 surrendered), then Dr 1121 / Cr 1131', () => {
    const o = citOrder({ scenario: 'SBV', direction: 'OUT', amountCents: 100_000_000, unfitSurrenderCents: 1_500_000 });
    expect(legs(dispatchEntry(o))).toEqual(['Dr 1131 TRANSIT 101500000', 'Cr 1111 VAULT 100000000', 'Cr 1112 UNFIT 1500000']);
    expect(legs(receiptEntry(o))).toEqual(['Dr 1121 SBV 101500000', 'Cr 1131 TRANSIT 101500000']);
  });

  it('4b. SBV withdrawal: Dr 1131 / Cr 1121, then Dr 1111 / Cr 1131', () => {
    const o = citOrder({ scenario: 'SBV', direction: 'IN', amountCents: 150_000_000 });
    expect(legs(dispatchEntry(o))).toEqual(['Dr 1131 TRANSIT 150000000', 'Cr 1121 SBV 150000000']);
    expect(legs(receiptEntry(o))).toEqual(['Dr 1111 VAULT 150000000', 'Cr 1131 TRANSIT 150000000']);
  });

  it('only doorstep orders carry shortfalls and only SBV deposits surrender unfit notes', () => {
    expect(citOrder({ scenario: 'ATM_CDM', direction: 'OUT', amountCents: 1_000_000, shortCents: 5_000 }).shortCents).toBe(0);
    expect(citOrder({ scenario: 'SBV', direction: 'IN', amountCents: 1_000_000, unfitSurrenderCents: 5_000 }).unfitSurrenderCents).toBe(0);
    expect(citOrder({ scenario: 'DOORSTEP', direction: 'OUT', amountCents: 1_000_000 }).direction).toBe('IN');
  });
});

describe('cash fitness sorting', () => {
  it('only counts that land in the branch vault sort notes', () => {
    expect(countCash(citOrder({ scenario: 'ATM_CDM', direction: 'OUT', amountCents: 1_000_000, unfitBp: 900 })).unfitCents).toBe(0);
    expect(countCash(citOrder({ scenario: 'SBV', direction: 'IN', amountCents: 1_000_000, unfitBp: 900 })).unfitCents).toBe(0);
    expect(countCash(citOrder({ scenario: 'DOORSTEP', direction: 'IN', amountCents: 1_000_000, unfitBp: 900 })).unfitCents).toBe(90_000);
  });

  it('fit + unfit always equals what arrived, in whole notes (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 0, max: 500 }), (k, bp, short) => {
        const o = citOrder({ scenario: 'DOORSTEP', direction: 'IN', amountCents: k * 1_000, unfitBp: bp, shortCents: short * 1_000 });
        const c = countCash(o);
        return c.fitCents + c.unfitCents === c.receivedCents && c.unfitCents % CIT_LIMITS.noteCents === 0 && c.fitCents >= 0 && c.unfitCents >= 0;
      }),
    );
  });
});

const arbOrder = fc
  .record({
    scenario: fc.constantFrom('ATM_CDM', 'BRANCH_BALANCING', 'DOORSTEP', 'SBV' as const),
    direction: fc.constantFrom('OUT', 'IN' as const),
    amountCents: fc.integer({ min: 0, max: 1_000_000_000 }),
    unfitBp: fc.integer({ min: 0, max: 10_000 }),
    shortCents: fc.integer({ min: 0, max: 10_000_000 }),
    unfitSurrenderCents: fc.integer({ min: 0, max: 5_000_000 }),
  })
  .map(citOrder);

describe('invariants', () => {
  it('Σ Dr = Σ Cr on every entry, and a settled run leaves 1131 at zero (property)', () => {
    fc.assert(
      fc.property(arbOrder, (o) => {
        const r = runToEnd(o);
        const transit = r.entries.flatMap((e) => e.lines).reduce((s, l) => s + (l.account === 'TRANSIT' ? l.dr - l.cr : 0), 0);
        return r.status === 'SETTLED' && r.entries.every(entryBalanced) && transit === 0;
      }),
      { numRuns: 300 },
    );
  });

  it('the book stays square through any sequence of runs (property)', () => {
    fc.assert(
      fc.property(fc.array(arbOrder, { maxLength: 12 }), (orders) => sum(bookAfter(orders.flatMap((o) => runToEnd(o).entries))) === 0),
    );
  });

  it('postEntry refuses an unbalanced entry', () => {
    const bad: CitEntry = { runId: 'x', status: 'EN_ROUTE', memo: { en: '', vi: '' }, lines: [{ account: 'TRANSIT', dr: 100, cr: 0 }] };
    expect(() => postEntry(CIT_OPENING, bad)).toThrow(/does not balance/);
  });

  it('the opening book is square', () => {
    expect(sum(CIT_OPENING)).toBe(0);
  });
});

describe('lifecycle (state pattern)', () => {
  const o = citOrder({ scenario: 'ATM_CDM', direction: 'OUT', amountCents: 5_000_000 });

  it('walks EN_ROUTE → ARRIVED → IN_COUNT → DELIVERED → SETTLED, posting on dispatch and on delivery only', () => {
    let r = startRun(o);
    const seen = [r.status];
    const posted = [r.entries.length];
    while (r.status !== 'SETTLED') {
      r = advance(r);
      seen.push(r.status);
      posted.push(r.entries.length);
    }
    expect(seen).toEqual([...CIT_STATUSES]);
    expect(posted).toEqual([1, 1, 1, 2, 2]);
    expect(advance(r)).toEqual({ ...r, blocked: null });
  });

  it('a tampered seal blocks the count until the incident is minuted', () => {
    const t = citOrder({ scenario: 'DOORSTEP', direction: 'IN', amountCents: 1_000_000, sealId: 'SEAL-1', presentedSealId: 'SEAL-1-X' });
    let r = advance(startRun(t));
    expect(r.status).toBe('ARRIVED');
    r = advance(r);
    expect(r.status).toBe('ARRIVED');
    expect(r.blocked).toBe('SEAL_MISMATCH');
    r = advance(logIncident(r));
    expect(r.status).toBe('IN_COUNT');
  });

  it('4-eye: one custodian signing twice never passes, incident or not', () => {
    const solo = citOrder({ scenario: 'ATM_CDM', direction: 'OUT', amountCents: 1_000_000, custodians: ['An', 'An'] });
    expect(verifySeal(solo)).toEqual({ ok: false, sealMatches: true, fourEyes: false });
    const r = advance(logIncident(advance(startRun(solo))));
    expect(r.status).toBe('ARRIVED');
    expect(r.blocked).toBe('NO_FOUR_EYES');
    expect(verifySeal(o).ok).toBe(true);
  });
});

describe('triggers', () => {
  it('ATM under $10k replenishes to the target; a full CDM cassette is collected', () => {
    expect(atmTrigger(800_000, 0)).toMatchObject({ direction: 'OUT', amountCents: CIT_LIMITS.atmTargetCents - 800_000 });
    expect(atmTrigger(2_000_000, 96)).toMatchObject({ direction: 'IN' });
    expect(atmTrigger(2_000_000, 50)).toBeNull();
  });

  it('branch vault over $5M sends the excess to HQ; under the floor draws from HQ', () => {
    expect(branchTrigger(560_000_000)).toMatchObject({ direction: 'OUT', amountCents: 260_000_000 });
    expect(branchTrigger(50_000_000)).toMatchObject({ direction: 'IN', amountCents: 250_000_000 });
    expect(branchTrigger(400_000_000)).toBeNull();
  });

  it('SBV: deposits surplus and unfit notes, withdraws before a holiday', () => {
    expect(sbvTrigger(600_000_000, 2_000_000, false)).toMatchObject({ direction: 'OUT', amountCents: 80_000_000, unfitSurrenderCents: 2_000_000 });
    expect(sbvTrigger(400_000_000, 500_000, false)).toBeNull();
    expect(sbvTrigger(400_000_000, 0, true)).toMatchObject({ direction: 'IN', amountCents: CIT_LIMITS.holidayWithdrawCents });
  });
});

describe('the day of runs (clock-derived)', () => {
  it('is deterministic per day and posts nothing before the first dispatch', () => {
    expect(citDay(3)).toEqual(citDay(3));
    const s = citAt(3, 8 * 60);
    expect(s.journal).toEqual([]);
    expect(s.book).toEqual(CIT_OPENING);
  });

  it('every day covers doorstep pickups, and over a fortnight all four scenarios run', () => {
    const scenarios = new Set<string>();
    for (let d = 1; d <= 14; d++) {
      const plan = citDay(d);
      expect(plan.filter((p) => p.order.scenario === 'DOORSTEP').map((p) => p.order.client)).toEqual(['WinMart', 'Go!']);
      plan.forEach((p) => scenarios.add(p.order.scenario));
    }
    expect([...scenarios].sort()).toEqual(['ATM_CDM', 'BRANCH_BALANCING', 'DOORSTEP', 'SBV']);
  });

  it('a holiday eve withdraws from the SBV', () => {
    expect(citDay(7).find((p) => p.order.scenario === 'SBV')?.order.direction).toBe('IN');
  });

  it('by evening every run is settled, 1131 is back to zero and the book is square', () => {
    for (let d = 1; d <= 10; d++) {
      const s = citAt(d, 18 * 60);
      expect(s.runs.every((r) => r.run?.status === 'SETTLED')).toBe(true);
      expect(s.book.TRANSIT).toBe(0);
      expect(sum(s.book)).toBe(0);
    }
  });

  it('mid-run, 1131 carries exactly the cash on the road', () => {
    const p = citDay(2)[0]!;
    const s = citAt(2, p.start + 5);
    expect(s.active?.run.status).toBe('EN_ROUTE');
    expect(s.book.TRANSIT).toBe(p.order.amountCents + p.order.unfitSurrenderCents);
  });

  it('the journal only grows as the clock moves (no run posts twice)', () => {
    let last = 0;
    for (let m = 9 * 60; m <= 18 * 60; m += 5) {
      const n = citAt(4, m).journal.length;
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
    expect(last).toBe(citDay(4).length * 2);
  });

  it('vault flow: OUT while vault cash is on the road, IN while it is counted into the vault', () => {
    const p = citDay(5).find((x) => x.order.scenario === 'DOORSTEP')!;
    const at = citSchedule(p);
    expect(citAt(5, at.DELIVERED).vaultFlow).toBe('IN');
    const atm = citDay(5).find((x) => x.order.scenario === 'ATM_CDM' && x.order.direction === 'OUT');
    if (atm) expect(citAt(5, atm.start + 5).vaultFlow).toBe('OUT');
  });

  it('a tampered doorstep seal is held at ARRIVED, then counted after the incident is minuted', () => {
    let found = false;
    for (let d = 1; d <= 60 && !found; d++) {
      const p = citDay(d).find((x) => !verifySeal(x.order).sealMatches);
      if (!p) continue;
      found = true;
      const at = citSchedule(p);
      expect(runAt(p, at.ARRIVED + 1)).toMatchObject({ status: 'ARRIVED', blocked: 'SEAL_MISMATCH', incident: false });
      expect(runAt(p, at.IN_COUNT)).toMatchObject({ status: 'IN_COUNT', incident: true });
      expect(runAt(p, at.SETTLED)?.status).toBe('SETTLED');
    }
    expect(found).toBe(true);
  });
});

describe('CIT on screen: map bay, inspector, Knowledge Base, flashcards, Academy', () => {
  const bay = (day: number, minute: number): string => renderToStaticMarkup(createElement(CitBayView, { cit: citAt(day, minute), live: true, onOpen: () => undefined }));

  it('the inspector shows the status stepper, the 4-eye seal badge and the 1131 counter-entry', () => {
    const p = citDay(2)[0]!;
    const html = renderToStaticMarkup(createElement(CitInspectorView, { cit: citAt(2, p.start + 5) }));
    expect(html).toContain('data-testid="cit-inspector"');
    expect(html).toContain('data-status="EN_ROUTE"');
    expect(html).toContain('data-testid="cit-seal" data-ok="true"');
    expect(html).toContain(p.order.sealId);
    expect(html).toMatch(/data-account="TRANSIT" data-side="dr" data-code="1131"/);
  });

  it('the loading bay walks the crew out of the vault with the cassettes (Cr 1111) and into it with them (Dr 1111)', () => {
    const plan = citDay(5);
    const out = plan.find((x) => leavesVault(x.order))!;
    // Outflow, a fifth of the way through the stop: the custodian carries the cassettes from the vault to the van, the guard escorts.
    const outHtml = bay(5, out.start + 5);
    expect(outHtml).toContain('bk-vault-out');
    expect(outHtml).toMatch(/data-testid="cit-crew-custodian" data-stage="toVan" data-carrying="true"/);
    expect(outHtml).toMatch(/data-testid="cit-crew-guard" data-stage="toVan" data-carrying="false"/);
    expect(outHtml).toContain('data-status="arriving"');
    for (const icon of ['🚚', '🏧', '🏛️', '🔐', '💼']) expect(outHtml).toContain(icon);
    // At the vault at the start of an outflow: the withdrawal posts (orange Cr 1111).
    expect(bay(5, out.start)).toMatch(/data-testid="cit-vault-post" data-flow="OUT"/);
    const inbound = plan.find((x) => x.order.scenario === 'DOORSTEP')!;
    const at = citSchedule(inbound);
    // Inflow: the crew steps out as the van stops (ARRIVED); halfway through the stop, in the count, the custodian hands the cassettes over (gold Dr 1111).
    expect(bay(5, at.ARRIVED)).toMatch(/data-testid="cit-crew-custodian" data-stage="stepOut"/);
    const deposit = bay(5, Math.round((at.ARRIVED + at.SETTLED) / 2));
    expect(deposit).toMatch(/data-testid="cit-vault-post" data-flow="IN"/);
    expect(deposit).toMatch(/data-testid="cit-crew-custodian" data-stage="atVault"/);
    expect(deposit).toContain('data-status="processing"');
    // Delivered: walking back to the van, done.
    const back = bay(5, at.DELIVERED);
    expect(back).toContain('bk-vault-in');
    expect(back).toMatch(/data-testid="cit-crew-custodian" data-stage="toVan" data-carrying="false"/);
    expect(back).toContain('data-status="done"');
    expect(bay(5, 8 * 60)).not.toContain('cit-crew-');
  });

  it('has its own Knowledge Base tab, reached from any cit- anchor, with the drill', () => {
    expect(renderToStaticMarkup(createElement(KnowledgeTabs, { tab: 'cit', onTab: () => undefined }))).toContain('data-testid="kb-tab-cit"');
    expect(knowledgeTabOf('cit-scenarios')).toBe('cit');
    expect(CIT_ARTICLE.title.vi).toBe('Nghiệp vụ Quản lý Kho quỹ, Vận chuyển tiền mặt (CIT) & Tuân thủ Thông tư 01/2014/TT-NHNN');
    const basic = renderToStaticMarkup(createElement(CitArticle, { view: 'basic' }));
    const advanced = renderToStaticMarkup(createElement(CitArticle, { view: 'advanced' }));
    expect(basic).toContain('data-section="cit-scenarios"');
    expect(basic).not.toContain('data-section="cit-controls"');
    expect(advanced).toContain('data-section="cit-controls"');
    expect(basic).toContain('data-testid="cit-drill"');
    expect(renderToStaticMarkup(createElement(CitDrill))).toContain('data-status="EN_ROUTE"');
  });

  it('adds CIT flashcards whose journals balance and run through 1131, covering every account', () => {
    const cards = RETAIL_FLASHCARDS.filter((c) => c.id.startsWith('retail-cit-'));
    expect(cards).toHaveLength(6);
    const codes = new Set<string>();
    for (const c of cards) {
      expect(c.tag?.vi).toBe('Kho quỹ & CIT');
      if (!c.cit) continue;
      expect(c.cit.reduce((s, l) => s + l.dr - l.cr, 0), c.id).toBe(0);
      expect(c.cit.some((l) => l.account === 'TRANSIT'), c.id).toBe(true);
      c.cit.forEach((l) => codes.add(citAccount(l.account).code));
    }
    expect([...codes].sort()).toEqual(['1111', '1112', '1113', '1121', '1131', '4211']);
    expect(cards.find((c) => c.id === 'retail-cit-four-eyes')?.cit).toBeUndefined();
  });

  it('teaches CIT in Academy chapter 7: lesson 7.4 at the vault, a glossary entry and a quiz question', () => {
    const l = ACADEMY_CHAPTERS.find((c) => c.id === 7)!.levels.find((x) => x.id === '7.4')!;
    expect(l.place).toBe('COLLATERAL_VAULT');
    expect(l.stepByStepFlow.map((s) => s.action.split(':')[0])).toEqual([...CIT_STATUSES]);
    expect(glossaryFor(7).map((g) => g.id)).toContain('cit');
    expect(quizFor(7).find((q) => q.id === '7-e')?.answer).toBe(1);
  });
});

function leavesVault(o: CitOrder): boolean {
  return dispatchEntry(o).lines.some((l) => l.account === 'VAULT' && l.cr > 0);
}
