import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OpsFlashcards } from '../../components/knowledge/RetailOpsStudy';
import { AmlArticle, KnowledgeTabs, RetailArticle } from '../../components/knowledge/KnowledgeBaseModal';
import { AML_DEEP_SECTIONS, RETAIL_DEEP_DIVES } from '../../data/advancedKnowledge';
import { dayIntroStore } from '../../components/bank/dayIntro';
import { RETAIL_TOPICS } from '../../data/retailKnowledge';
import { scenarioJournals, TOPIC_MODULES } from '../../data/retailTopicModules';
import { runDemo, selectSubProcess } from '../../components/bank/retailOpsActions';
import { MENU_CHOICES, SubProcessMenu } from '../../components/bank/SubProcessMenu';
import { dockIsCompact } from '../../components/bank/PresetDock';
import { listboxKey, popoverPlace } from '../../components/shell/AdaptivePopover';
import { chapterArticles, OPS_FLASHCARDS, OPS_LESSONS, OPS_QUIZ } from '../../data/retailOpsKnowledge';
import { buildSearchIndex, searchIndex } from '../../hooks/useSearchIndex';
import { setActiveLocale } from '../../i18n/locale';
import { memoryStorage } from '../../store/persistence';
import { activeScopeOf, bankStore } from '../../store/bankStore';
import { notificationStore } from '../../store/notificationStore';
import { createRetailOpsStore, OPS_QUIZ_XP, RETAIL_OPS_KEY, retailOpsStore } from '../../store/retailOpsStore';
import { knowledgeTabOf } from '../../store/uiStore';
import { FLOW_IDS } from '../../types/viewport';
import { ALL_DEMO_ACTIONS, demoActionsFor, demoBlocked } from '../demoActions';
import { flowPlaces, flowScope } from '../guidedFlows';
import { isOpsQuestion, localQuestion, quizFor } from '../academyKnowledge';
import { journalLines } from '../isoMessages';
import { applyPresetJournal, settleEod, OPS_SUB_CHAPTER, opsScope, cassetteStatus, decodeBook, openingBook, OPS_ACCOUNTS, OPS_ACTIONS, OPS_LIMITS, OPS_SUBPROCESSES, opsActionById, opsFlowOf, opsJournalBalanced, opsNatural, opsTrial, refillCassette, resolveTicket, runOpsAction, transferToVault, type OpsActionId, type OpsLine } from '../retailOps';
import { hasWire, isStation, STATIONS } from '../topology';

const AT = 'D1 09:00:00';
const pickLabel = (t: { en: string }): string => t.en;
const run = (id: OpsActionId, book = openingBook()) => runOpsAction(book, id, AT);
/** "dr 2010 101.65" per line, by the GL number the desk prints. */
const entry = (lines: readonly OpsLine[] | undefined): string[] => (lines ?? []).map((l) => `${l.dr > 0 ? 'dr' : 'cr'} ${OPS_ACCOUNTS.find((a) => a.id === l.account)!.code} ${l.dr || l.cr}`);

afterEach(() => setActiveLocale('en'));

describe('the eight guided flows carry the six sub-processes', () => {
  it('keeps exactly the eight flows', () => {
    expect(FLOW_IDS).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('maps each sub-process to the flow the brief names', () => {
    expect(Object.fromEntries(OPS_SUBPROCESSES.map((s) => [s.id, s.flow]))).toEqual({ 'bill-pay': 1, 'card-fees': 1, 'wallet-qr': 7, 'atm-napas': 3, 'cassette-jam': 3, 'teller-vault': 6 });
  });

  it('walks every action through desks its flow lights', () => {
    for (const a of OPS_ACTIONS) for (const p of a.route) expect(flowPlaces(opsFlowOf(a)).has(p), `${a.id} ${p}`).toBe(true);
  });

  it('wires every newly lit desk to the rest of its flow', () => {
    for (const f of [3, 7] as const) {
      for (const p of flowPlaces(f)) {
        if (!isStation(p) || STATIONS[p].department === 'LEDGER') continue;
        expect([...flowPlaces(f)].some((q) => q !== p && (hasWire(p, q) || hasWire(q, p))), `${f} ${p}`).toBe(true);
      }
    }
  });

  it('merges the core presets and the retail actions into one bar per flow', () => {
    const ids = (f: 1 | 2 | 3 | 6 | 7) => demoActionsFor(f).map((a) => a.id);
    expect(ids(1)).toEqual(['pos-20', 'pos-500', 'bill-electric-85', 'bill-water-250', 'fee-annual-45', 'fee-card-10']);
    expect(ids(2)).toEqual(['token-45', 'otp-250']);
    expect(ids(3)).toEqual(['cdm-200', 'atm-withdraw-100', 'atm-jam-200', 'cassette-low']);
    expect(ids(6)).toEqual(['teller-12k', 'teller-smurf', 'teller-deposit-5000', 'teller-exceed-limit']);
    expect(ids(7)).toEqual(['qr-780', 'qr-rooted', 'wallet-cashin-100', 'qr-45']);
  });

  it('narrows the bar and the lit path to a chosen sub-process', () => {
    expect(demoActionsFor(1, 'card-fees').map((a) => a.id)).toEqual(['fee-annual-45', 'fee-card-10']);
    expect(opsScope('cassette-jam').places.has('SUSPENSE')).toBe(true);
    expect(opsScope('atm-napas').places.has('SUSPENSE')).toBe(false);
    for (const s of OPS_SUBPROCESSES) for (const p of opsScope(s.id).places) expect(flowPlaces(s.flow).has(p), `${s.id} ${p}`).toBe(true);
  });

  it('offers every flow and sub-process in the menu, and names the choice on its trigger', () => {
    expect(MENU_CHOICES).toHaveLength(FLOW_IDS.length + OPS_SUBPROCESSES.length);
    const out = renderToStaticMarkup(createElement(SubProcessMenu));
    expect(out).toContain('data-testid="flow-menu"');
    expect(out).toContain('role="combobox"');
    expect(out).toContain('aria-haspopup="listbox"');
    for (const s of OPS_SUBPROCESSES) expect(pickLabel(s.title)).not.toMatch(/^\d/);
  });
});

describe('every demo button runs one pipeline', () => {
  beforeEach(() => {
    retailOpsStore.getState().reset();
  });

  it('opens the inspector on a real payment and the retail journal, for every button but the night cycle', () => {
    for (const a of ALL_DEMO_ACTIONS) {
      if (a.id === 'eod') continue;
      retailOpsStore.getState().reset();
      runDemo(a.id);
      const bank = bankStore.getState();
      expect(bank.flow, a.id).toBe(a.flow);
      expect(retailOpsStore.getState().last?.action, a.id).toBe(a.id);
      if (a.id === 'cassette-low') {
        // An alert is not a payment: it says so in a toast, and the inspector stays as it was.
        expect(notificationStore.getState().queue.some((n) => n.source === 'cassette-low')).toBe(true);
        continue;
      }
      expect(bank.selection.kind, a.id).toBe('transaction');
      expect(bank.presetTrace, a.id).not.toBeNull();
      expect(bank.presetTrace!.route.length, a.id).toBeGreaterThan(0);
    }
  });

  it('walks each retail payment only through desks its sub-process lights', () => {
    for (const a of OPS_ACTIONS) {
      if (a.id === 'cassette-low') continue;
      retailOpsStore.getState().reset();
      runDemo(a.id);
      const route = bankStore.getState().presetTrace!.route;
      for (const p of route) expect(opsScope(a.sub).places.has(p), `${a.id} ${p}`).toBe(true);
    }
  });

  it('gets the answer each button promises from the bank itself', () => {
    const outcome = (id: OpsActionId) => {
      retailOpsStore.getState().reset();
      runDemo(id);
      return bankStore.getState().presetTrace!.plan.outcome;
    };
    expect(outcome('bill-electric-85')).toBe('APPROVED');
    expect(outcome('bill-water-250')).toBe('DECLINED');
    expect(outcome('wallet-cashin-100')).toBe('APPROVED');
    expect(outcome('qr-45')).toBe('APPROVED');
    expect(outcome('atm-withdraw-100')).toBe('APPROVED');
    expect(outcome('teller-deposit-5000')).toBe('APPROVED');
    expect(outcome('fee-annual-45')).toBe('APPROVED');
  });

  it('still posts the core journal while the inspector shows the retail one', () => {
    runDemo('atm-withdraw-100');
    for (let i = 0; i < 80 && !bankStore.getState().presetTrace?.done; i++) bankStore.getState().sim.step();
    const trace = bankStore.getState().sim.traceOf(bankStore.getState().presetTrace!.id)!;
    expect(journalLines(trace).length).toBeGreaterThan(0);
    expect(entry(retailOpsStore.getState().last?.journal?.lines)).toEqual(['dr 2010 10165', 'cr 1011 10000', 'cr 4520 110', 'cr 3510 55']);
  });

  it('keeps a chosen sub-process through its own buttons, and clears it on a flow change', () => {
    selectSubProcess('card-fees');
    expect(bankStore.getState().flow).toBe(1);
    expect(activeScopeOf(bankStore.getState())).toBe(opsScope('card-fees'));
    runDemo('fee-card-10');
    expect(bankStore.getState().subProcess).toBe('card-fees');
    bankStore.getState().setActiveFlow(1);
    expect(bankStore.getState().subProcess).toBeNull();
    expect(activeScopeOf(bankStore.getState())).toBe(flowScope(1));
  });

  it('runs even a counter lock through the same pipeline', () => {
    runDemo('teller-exceed-limit');
    expect(retailOpsStore.getState().book.vaultPrompt).not.toBeNull();
    const before = bankStore.getState().presetTrace?.id;
    runDemo('teller-deposit-5000');
    expect(retailOpsStore.getState().last?.status).toBe('BLOCKED');
    expect(bankStore.getState().presetTrace?.id).toBe(before);
  });

  it('blocks a payment at night and after the day, but never the sensor drill', () => {
    expect(demoBlocked('qr-45', { dayOver: true, minute: 600 })).toBe('dayOver');
    expect(demoBlocked('qr-45', { dayOver: false, minute: 23 * 60 })).toBe('night');
    expect(demoBlocked('eod', { dayOver: false, minute: 23 * 60 })).toBeNull();
    expect(demoBlocked('cassette-low', { dayOver: true, minute: 600 })).toBeNull();
  });
});

describe('the core presets on the retail book', () => {
  it('posts what went through and nothing for what did not', () => {
    expect(entry(applyPresetJournal(openingBook(), 'pos-20', 'APPROVED', AT).outcome.journal?.lines)).toEqual(['dr 2010 2000', 'cr 1113 2000']);
    const declined = applyPresetJournal(openingBook(), 'pos-500', 'DECLINED', AT).outcome;
    expect(declined).toMatchObject({ status: 'DECLINED', rc: '51', journal: null });
    expect(entry(applyPresetJournal(openingBook(), 'cdm-200', 'APPROVED', AT).outcome.journal?.lines)).toEqual(['dr 1011 20000', 'cr 2010 20000']);
    expect(applyPresetJournal(openingBook(), 'swift-sanction', 'ROUTED_TO_SUSPENSE', AT).outcome).toMatchObject({ status: 'HELD', journal: null });
  });

  it('settles NAPAS and the wallets at night, to zero', () => {
    let book = run('atm-withdraw-100').book;
    book = run('wallet-cashin-100', book).book;
    const { book: settled, outcome } = settleEod(book, AT);
    expect(entry(outcome.journal?.lines)).toEqual(['dr 3510 55', 'dr 1950 10000', 'cr 1113 10055']);
    expect(settled.balances.NAPAS_FEE).toBe(0);
    expect(settled.balances.WALLET_SETTLEMENT).toBe(0);
    expect(settleEod(settled, AT).outcome.journal).toBeNull();
  });
});

describe('the demo actions post what the brief says', () => {
  it('$85 electric bill: approved, Dr 2010 / Cr 1113', () => {
    const { outcome } = run('bill-electric-85');
    expect(outcome).toMatchObject({ status: 'APPROVED', rc: '00' });
    expect(entry(outcome.journal?.lines)).toEqual(['dr 2010 8500', 'cr 1113 8500']);
  });

  it('$250 water bill: declined 51, only the $15 NSF fee to 4510', () => {
    const { outcome } = run('bill-water-250');
    expect(outcome).toMatchObject({ status: 'DECLINED', rc: '51' });
    expect(entry(outcome.journal?.lines)).toEqual(['dr 2010 1500', 'cr 4510 1500']);
  });

  it('$100 MoMo: Dr 2010 / Cr 1950', () => {
    expect(entry(run('wallet-cashin-100').outcome.journal?.lines)).toEqual(['dr 2010 10000', 'cr 1950 10000']);
  });

  it('$45 VietQR clears inside the 5-second SLA', () => {
    const { outcome } = run('qr-45');
    expect(entry(outcome.journal?.lines)).toEqual(['dr 2010 4500', 'cr 1113 4500']);
    expect(outcome.clearing).toMatchObject({ slaMs: 5_000, withinSla: true });
    expect(outcome.clearing!.elapsedMs).toBeLessThanOrEqual(5_000);
  });

  it('$100 withdrawal: $101.65 from CASA, split to cash, bank fee and NAPAS fee', () => {
    const { outcome } = run('atm-withdraw-100');
    expect(outcome.rc).toBe('00');
    expect(entry(outcome.journal?.lines)).toEqual(['dr 2010 10165', 'cr 1011 10000', 'cr 4520 110', 'cr 3510 55']);
  });

  it('refuses a withdrawal the cassette cannot cover, in full, posting nothing', () => {
    const empty = { ...openingBook(), balances: { ...openingBook().balances, CASH_ATM: 5_000, CASA: openingBook().balances.CASA + 1_595_000 } };
    const { book, outcome } = run('atm-withdraw-100', empty);
    expect(outcome).toMatchObject({ status: 'BLOCKED', rc: '91', journal: null });
    expect(book).toBe(empty);
  });

  it('$200 jam: to TK 2930, with an open EOD ticket', () => {
    const { book, outcome } = run('atm-jam-200');
    expect(outcome.status).toBe('HELD');
    expect(entry(outcome.journal?.lines)).toEqual(['dr 2010 20000', 'cr 2930 20000']);
    expect(book.tickets).toHaveLength(1);
    expect(book.tickets[0]).toMatchObject({ status: 'OPEN', amountCents: 20_000 });
    expect(opsTrial(book).suspenseOpenCents).toBe(20_000);
  });

  it('closes a jam either way, and TK 2930 drains to zero', () => {
    const jammed = run('atm-jam-200').book;
    const id = jammed.tickets[0]!.id;
    const refunded = resolveTicket(jammed, id, 'REFUNDED', AT);
    expect(entry(refunded.journal?.lines)).toEqual(['dr 2930 20000', 'cr 2010 20000']);
    expect(refunded.book.balances.ATM_SUSPENSE).toBe(0);
    expect(refunded.book.tickets[0]!.status).toBe('REFUNDED');
    const taken = resolveTicket(jammed, id, 'DISPENSED', AT);
    expect(entry(taken.journal?.lines)).toEqual(['dr 2930 20000', 'cr 1011 20000']);
    expect(taken.book.balances.CASH_ATM).toBe(jammed.balances.CASH_ATM - 20_000);
    // A closed ticket cannot post twice.
    expect(resolveTicket(refunded.book, id, 'REFUNDED', AT).journal).toBeNull();
  });

  it('low cassette: a badge-worthy reading with no money moved, cleared by the refill', () => {
    const before = openingBook();
    expect(cassetteStatus(before).low).toBe(false);
    const { book, outcome } = run('cassette-low', before);
    expect(outcome).toMatchObject({ status: 'ALERT', journal: null });
    expect(book.balances).toEqual(before.balances);
    expect(cassetteStatus(book)).toMatchObject({ low: true, drill: true });
    expect(cassetteStatus(book).pct).toBeLessThan(OPS_LIMITS.cassetteLowPct);
    const refilled = refillCassette(book, AT);
    expect(entry(refilled.journal?.lines)).toEqual(['dr 1011 400000', 'cr 1011 400000']);
    expect(cassetteStatus(refilled.book)).toMatchObject({ pct: 100, low: false, drill: false });
  });

  it('$5,000 at the counter: Dr 1011 / Cr 2010, no prompt under the limit', () => {
    const { book, outcome } = run('teller-deposit-5000');
    expect(entry(outcome.journal?.lines)).toEqual(['dr 1011 500000', 'cr 2010 500000']);
    expect(book.vaultPrompt).toBeNull();
    expect(outcome.ctrRequired).toBeUndefined();
  });

  it('over the $50,000 limit: mandatory transfer, the counter locked until it is done', () => {
    const { book, outcome } = run('teller-exceed-limit');
    expect(outcome.status).toBe('ALERT');
    expect(outcome.ctrRequired).toBe(true);
    expect(book.balances.CASH_TILL).toBe(OPS_LIMITS.tillLimitCents + 250_000);
    expect(book.vaultPrompt?.surplusCents).toBe(2_750_000);
    const refused = run('teller-deposit-5000', book);
    expect(refused.outcome.status).toBe('BLOCKED');
    expect(refused.book).toBe(book);
    const moved = transferToVault(book, AT);
    expect(entry(moved.journal?.lines)).toEqual(['dr 1011 2750000', 'cr 1011 2750000']);
    expect(moved.book.vaultPrompt).toBeNull();
    expect(moved.book.balances.CASH_TILL).toBe(OPS_LIMITS.tillFloatCents);
    expect(run('teller-deposit-5000', moved.book).outcome.status).toBe('APPROVED');
  });

  it('reaches the prompt through plain $5,000 deposits too', () => {
    let book = openingBook();
    for (let i = 0; i < 6; i++) book = run('teller-deposit-5000', book).book;
    expect(book.vaultPrompt).not.toBeNull();
  });

  it('$45 annual fee on $20: the statement shows -$25, booked on 1310', () => {
    const { outcome } = run('fee-annual-45');
    expect(entry(outcome.journal?.lines)).toEqual(['dr 2010 2000', 'dr 1310 2500', 'cr 4520 4500']);
    expect(outcome.customer).toEqual({ before: 2_000, after: -2_500 });
  });

  it('$10 card fee: Dr 2010 / Cr 4520', () => {
    expect(entry(run('fee-card-10').outcome.journal?.lines)).toEqual(['dr 2010 1000', 'cr 4520 1000']);
  });

  it('shows the case it names whatever was clicked before', () => {
    let book = openingBook();
    for (let i = 0; i < 20; i++) book = run('teller-deposit-5000', transferToVault(book, AT).book).book;
    expect(run('bill-water-250', book).outcome.rc).toBe('51');
    expect(run('fee-annual-45', book).outcome.customer?.after).toBe(-2_500);
  });

  it('keeps the books balanced over any sequence of actions and follow-ups', () => {
    const step = fc.oneof(
      fc.constantFrom(...OPS_ACTIONS.map((a) => a.id)).map((id) => ({ kind: 'action' as const, id })),
      fc.constant({ kind: 'vault' as const }),
      fc.constant({ kind: 'refill' as const }),
      fc.constantFrom('REFUNDED', 'DISPENSED').map((f) => ({ kind: 'ticket' as const, f: f as 'REFUNDED' | 'DISPENSED' })),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 60 }), (steps) => {
        let book = openingBook();
        for (const s of steps) {
          if (s.kind === 'action') {
            const r = runOpsAction(book, s.id, AT);
            if (r.outcome.journal) expect(opsJournalBalanced(r.outcome.journal.lines)).toBe(true);
            book = r.book;
          } else if (s.kind === 'vault') book = transferToVault(book, AT).book;
          else if (s.kind === 'refill') book = refillCassette(book, AT).book;
          else {
            const open = book.tickets.find((t) => t.status === 'OPEN');
            if (open) book = resolveTicket(book, open.id, s.f, AT).book;
          }
          expect(opsTrial(book).balanced).toBe(true);
          expect(book.balances.CASH_TILL).toBeLessThanOrEqual(OPS_LIMITS.tillLimitCents + 250_000 + 500_000);
          // TK 2930 always holds exactly what the open tickets hold.
          expect(opsNatural('ATM_SUSPENSE', book.balances.ATM_SUSPENSE)).toBe(book.tickets.filter((t) => t.status === 'OPEN').reduce((n, t) => n + t.amountCents, 0));
        }
      }),
    );
  });
});

describe('the store', () => {
  it('remembers the book and restores it, and rejects a damaged save', () => {
    const storage = memoryStorage();
    const a = createRetailOpsStore({ storage });
    a.getState().runAction('atm-jam-200', AT);
    const saved = a.getState().book;
    a.getState().reset();
    expect(createRetailOpsStore({ storage }).getState().book).toEqual(openingBook());
    a.getState().runAction('atm-jam-200', AT);
    expect(a.getState().book.tickets).toHaveLength(saved.tickets.length);
    const b = createRetailOpsStore({ storage });
    expect(b.getState().book).toEqual(a.getState().book);
    expect(b.getState().book.tickets[0]?.status).toBe('OPEN');
    a.getState().reset();
    storage.setItem(RETAIL_OPS_KEY, JSON.stringify({ book: { ...openingBook(), balances: { ...openingBook().balances, CASA: 1 } } }));
    expect(createRetailOpsStore({ storage }).getState().book).toEqual(openingBook());
    storage.setItem(RETAIL_OPS_KEY, '{not json');
    expect(createRetailOpsStore({ storage }).getState().book).toEqual(openingBook());
    expect(decodeBook(null)).toBeNull();
  });

  it('pays quiz XP once per question, only for a correct answer, and keeps it across a book reset', () => {
    const s = createRetailOpsStore({ storage: null });
    expect(s.getState().answerQuiz('q', false)).toBe(0);
    expect(s.getState().answerQuiz('q', true)).toBe(OPS_QUIZ_XP);
    expect(s.getState().answerQuiz('q', true)).toBe(0);
    s.getState().reset();
    expect(s.getState().quizAwarded).toEqual(['q']);
  });
});

describe('the knowledge', () => {
  it('has a complete lesson for every sub-process', () => {
    expect(OPS_LESSONS.map((l) => l.sub).sort()).toEqual(OPS_SUBPROCESSES.map((s) => s.id).sort());
    for (const l of OPS_LESSONS) {
      expect(l.iso.length, l.id).toBeGreaterThanOrEqual(3);
      expect(l.rules.length, l.id).toBeGreaterThanOrEqual(3);
      expect(l.sop.length, l.id).toBeGreaterThanOrEqual(5);
      expect(l.redFlags.length, l.id).toBeGreaterThanOrEqual(3);
      expect(l.diagrams.length, l.id).toBeGreaterThanOrEqual(1);
      for (const d of l.diagrams) {
        expect(d.lines.length, l.id).toBeGreaterThanOrEqual(2);
        expect(opsJournalBalanced(d.lines), l.id).toBe(true);
      }
    }
  });

  it('has at least 12 flashcards and 10 quiz questions, each explained in both languages', () => {
    expect(OPS_FLASHCARDS.length).toBeGreaterThanOrEqual(12);
    expect(OPS_QUIZ.length).toBeGreaterThanOrEqual(10);
    expect(new Set(OPS_FLASHCARDS.map((c) => c.id)).size).toBe(OPS_FLASHCARDS.length);
    expect(new Set(OPS_QUIZ.map((q) => q.id)).size).toBe(OPS_QUIZ.length);
    for (const q of OPS_QUIZ) {
      expect(q.options.length, q.id).toBe(4);
      expect(q.options[q.correct], q.id).toBeDefined();
      for (const o of q.options) for (const t of [o.text.en, o.text.vi, o.why.en, o.why.vi]) expect(t.length, q.id).toBeGreaterThan(0);
    }
    for (const c of OPS_FLASHCARDS) expect(opsJournalBalanced(c.lines), c.id).toBe(true);
  });

  it('renders the merged catalog and the flip cards in both languages', () => {
    for (const locale of ['en', 'vi'] as const) {
      setActiveLocale(locale);
      const lessons = renderToStaticMarkup(createElement(RetailArticle, { view: 'basic' }));
      for (const l of OPS_LESSONS) expect(lessons).toContain(`id="kb-${l.id}"`);
      for (const a of OPS_ACCOUNTS) expect(lessons).toContain(`id="kb-retail-ops-gl-${a.id}"`);
      const cards = renderToStaticMarkup(createElement(OpsFlashcards));
      for (const c of OPS_FLASHCARDS) expect(cards).toContain(`data-card="${c.id}"`);
      expect(cards).toContain('data-face="back"');
    }
  });

  it('finds the tab each anchor lives on', () => {
    expect(knowledgeTabOf('retail-ops-bill-pay')).toBe('retail');
    expect(knowledgeTabOf('flash-jam')).toBe('flashcards');
    expect(knowledgeTabOf('gl-CASA')).toBe('core');
  });
});

describe('one retail catalog', () => {
  it('gives every topic all seven modules', () => {
    expect(RETAIL_TOPICS).toHaveLength(12);
    for (const g of RETAIL_TOPICS) {
      const mods = TOPIC_MODULES[g.id]!;
      expect(mods?.length, g.id).toBeGreaterThan(0);
      for (const mod of mods) {
        expect(mod.iso.length, mod.id).toBeGreaterThanOrEqual(3);
        expect(mod.sop.length, mod.id).toBeGreaterThanOrEqual(5);
        expect(mod.redFlags.length, mod.id).toBeGreaterThanOrEqual(3);
        expect(mod.rules.length, mod.id).toBeGreaterThanOrEqual(3);
      }
      // A topic's journals come from its scenarios' cases or its book's lessons.
      const journals = [...mods.flatMap((m) => m.diagrams.map((d) => d.lines.length)), ...g.scenarios.flatMap((s) => [scenarioJournals(s).approve.length, scenarioJournals(s).reject.length])];
      expect(journals.some((n) => n > 0), g.id).toBe(true);
    }
    const html = renderToStaticMarkup(createElement(RetailArticle, { view: 'basic' }));
    const modules = RETAIL_TOPICS.flatMap((g) => TOPIC_MODULES[g.id]!).length;
    for (const id of ['kb-message-flow', 'kb-step-cards', 'kb-red-flags', 'kb-regulations-retail']) expect(html.split(`data-testid="${id}"`).length - 1, id).toBe(modules);
    expect(html).toContain('kb-decision-tree-teller');
    expect(html).toContain('kb-sop-flow-teller');
    expect(html.match(/Phase 1\/4/)).toBeNull();
  });

  it('keeps the old lesson anchors landing inside the merged articles', () => {
    const html = renderToStaticMarkup(createElement(RetailArticle, { view: 'basic' }));
    for (const s of OPS_SUBPROCESSES) expect(html, s.id).toContain(`id="kb-retail-ops-${s.id}"`);
  });

  it('balances every queue scenario’s journal', () => {
    for (const g of RETAIL_TOPICS) for (const sc of g.scenarios) for (const lines of Object.values(scenarioJournals(sc))) expect(lines.reduce((n, l) => n + l.dr - l.cr, 0), sc).toBe(0);
  });
});

describe('the day banner and the language', () => {
  it('keeps what it has shown outside any component, so a remount cannot bring it back', () => {
    dayIntroStore.setState({ shownFor: 3, open: false });
    expect(dayIntroStore.getState()).toEqual({ shownFor: 3, open: false });
    dayIntroStore.setState({ shownFor: null, open: false });
  });
});

describe('the Advanced view', () => {
  it('adds a deep dive to every retail topic, in Advanced only', () => {
    const basic = renderToStaticMarkup(createElement(RetailArticle, { view: 'basic' }));
    const advanced = renderToStaticMarkup(createElement(RetailArticle, { view: 'advanced' }));
    expect(basic).not.toContain('kb-deep-dive');
    for (const g of RETAIL_TOPICS) {
      const d = RETAIL_DEEP_DIVES[g.id]!;
      expect(d, g.id).toBeDefined();
      expect(d.edgeCases.length, g.id).toBeGreaterThanOrEqual(3);
      expect(advanced, g.id).toContain(`data-topic="${g.id}"`);
    }
  });

  it('adds specialist AML sections, in Advanced only', () => {
    const basic = renderToStaticMarkup(createElement(AmlArticle, { view: 'basic' }));
    const advanced = renderToStaticMarkup(createElement(AmlArticle, { view: 'advanced' }));
    for (const s of AML_DEEP_SECTIONS) {
      expect(basic, s.id).not.toContain(`id="kb-${s.id}"`);
      expect(advanced, s.id).toContain(`id="kb-${s.id}"`);
      expect(knowledgeTabOf(s.id), s.id).toBe('aml');
    }
  });
});

describe('the adaptive popover', () => {
  const view = { w: 1280, h: 700 };
  it('opens down from the top of the screen and up from the bottom, and stays inside the limits', () => {
    const top = popoverPlace({ left: 400, right: 600, top: 100, bottom: 130 }, view, { width: 360 });
    expect(top).toMatchObject({ direction: 'down', top: 134, maxHeight: 380 });
    const bottom = popoverPlace({ left: 400, right: 600, top: 650, bottom: 690 }, view, { direction: 'up', width: 380, maxVh: 0.45, maxPx: 320 });
    expect(bottom).toMatchObject({ direction: 'up', bottom: 54, maxHeight: 315 });
  });

  it('flips when there is no room, clamps to what is left, and never leaves the window', () => {
    const tight = popoverPlace({ left: 400, right: 600, top: 600, bottom: 640 }, view, { width: 360 });
    expect(tight.direction).toBe('up');
    const short = popoverPlace({ left: 400, right: 600, top: 100, bottom: 130 }, { w: 1280, h: 300 }, { width: 360 });
    expect(short.maxHeight).toBeLessThanOrEqual(300 - 130);
    expect(popoverPlace({ left: 1200, right: 1270, top: 10, bottom: 40 }, view, { width: 360 }).left).toBe(1280 - 360 - 8);
    expect(popoverPlace({ left: 0, right: 40, top: 10, bottom: 40 }, view, { width: 360 }).left).toBe(8);
    expect(popoverPlace({ left: 0, right: 40, top: 10, bottom: 40 }, { w: 300, h: 700 }, { width: 360 }).width).toBe(284);
  });

  it('reads the keyboard the same way in every menu', () => {
    expect(listboxKey('ArrowDown', 3, 4)).toBe(0);
    expect(listboxKey('ArrowUp', 0, 4)).toBe(3);
    expect(listboxKey('Enter', 1, 4)).toBe('pick');
    expect(listboxKey('Escape', 1, 4)).toBe('close');
    expect(listboxKey('x', 1, 4)).toBeNull();
  });
});

describe('the demo bar', () => {
  it('becomes a selector when the pills would stack', () => {
    expect(dockIsCompact(1100, false, 1500)).toBe(false);
    expect(dockIsCompact(500, false, 1500)).toBe(true);
    expect(dockIsCompact(1100, true, 1500)).toBe(true);
    expect(dockIsCompact(1100, false, 900)).toBe(true);
    // Not measured yet: the usual pills.
    expect(dockIsCompact(-64, false, 1500)).toBe(false);
  });
});

describe('English terminology', () => {
  it('names the domestic switch, wallets and bill pay in global terms, and keeps Vietnamese concise', () => {
    const t = Object.fromEntries(OPS_SUBPROCESSES.map((s) => [s.id, s.title]));
    expect(t['bill-pay']!.en).toBe('Utility Bill Pay & Direct Debit');
    expect(t['wallet-qr']!.en).toBe('e-Wallet & Dynamic QR (MoMo / VietQR)');
    expect(t['atm-napas']!.en).toBe('ATM Cash & Domestic Interbank Fee (NAPAS)');
    expect(t['atm-napas']!.vi).toBe('Rút tiền ATM & Phí NAPAS');
    expect(t['bill-pay']!.vi).toBe('Thanh toán hóa đơn & Ủy nhiệm thu');
  });
});

describe('the Academy keeps its chapters and takes the quiz', () => {
  it('has only the four reference tabs in the Knowledge Base', () => {
    const tabs = renderToStaticMarkup(createElement(KnowledgeTabs, { tab: 'core', onTab: () => undefined }));
    expect(tabs.match(/role="tab"/g)).toHaveLength(4);
    for (const id of ['core', 'aml', 'retail', 'flashcards']) expect(tabs).toContain(`kb-tab-${id}`);
    expect(tabs).not.toContain('kb-tab-quiz');
  });

  it('puts every retail question in its sub-process’s chapter, in both languages', () => {
    expect(OPS_SUB_CHAPTER).toEqual({ 'bill-pay': 2, 'card-fees': 2, 'wallet-qr': 4, 'atm-napas': 5, 'cassette-jam': 5, 'teller-vault': 5 });
    const ops = ([1, 2, 3, 4, 5, 6] as const).flatMap((c) => quizFor(c).filter((q) => isOpsQuestion(q.id)));
    expect(ops).toHaveLength(OPS_QUIZ.length);
    for (const q of ops) {
      expect(new Set(q.options).size, q.id).toBe(4);
      expect(q.optionNotes, q.id).toHaveLength(4);
      const vi = localQuestion(q, 'vi');
      expect(vi.answer, q.id).toBe(q.answer);
      expect(vi.prompt, q.id).not.toBe(q.prompt);
    }
  });

  it('points each chapter to its articles, including debt recovery in chapter 2', () => {
    expect(chapterArticles(2).map((a) => a.anchor)).toEqual(expect.arrayContaining(['retail-ops-bill-pay', 'retail-ops-card-fees', 'retail-waterfall']));
    expect(chapterArticles(4).map((a) => a.anchor)).toContain('retail-ops-wallet-qr');
    expect(chapterArticles(5).map((a) => a.anchor)).toEqual(expect.arrayContaining(['retail-ops-atm-napas', 'retail-ops-cassette-jam', 'retail-ops-teller-vault']));
    expect(chapterArticles(1)).toEqual([]);
  });
});

describe('Ctrl+K', () => {
  const EN = buildSearchIndex('expert', 'en');
  const VI = buildSearchIndex('expert', 'vi');

  it('indexes every sub-process, action, account, lesson, card and question', () => {
    const ids = new Set(EN.map((e) => e.id));
    for (const s of OPS_SUBPROCESSES) expect(ids.has(`ops:sub:${s.id}`), s.id).toBe(true);
    for (const a of OPS_ACTIONS) expect(ids.has(`ops:action:${a.id}`), a.id).toBe(true);
    for (const a of OPS_ACCOUNTS) expect(ids.has(`ops:gl:${a.id}`), a.id).toBe(true);
    for (const l of OPS_LESSONS) expect(ids.has(`ops:lesson:${l.sub}`), l.id).toBe(true);
    for (const c of OPS_FLASHCARDS) expect(ids.has(`ops:flash:${c.id}`), c.id).toBe(true);
    for (const q of OPS_QUIZ) expect(ids.has(`ops:quiz:${q.id}`), q.id).toBe(true);
    expect(ids.size).toBe(EN.length);
  });

  it('finds each GL number the brief lists', () => {
    for (const code of ['1011', '1113', '1310', '1950', '2930', '3510', '4510', '4520']) {
      expect(searchIndex(EN, code).groups.ops.some((e) => e.id.startsWith('ops:gl:') && e.label.startsWith(code)), code).toBe(true);
      expect(searchIndex(VI, `TK ${code}`).groups.ops.some((e) => e.label.startsWith(code)), code).toBe(true);
    }
  });

  it('sends a quiz hit to the Academy and a sub-process to its path', () => {
    const quiz = EN.find((e) => e.id === 'ops:quiz:till-limit')!;
    expect(quiz.action).toEqual({ kind: 'quiz', chapter: 5 });
    expect(EN.find((e) => e.id === 'ops:sub:card-fees')!.action).toEqual({ kind: 'sub', sub: 'card-fees' });
  });

  it('runs a demo action from the palette, and finds it accent-free in Vietnamese', () => {
    expect(searchIndex(EN, 'Cash Jam').groups.ops.some((e) => e.action.kind === 'opsAction' && e.action.action === 'atm-jam-200')).toBe(true);
    expect(searchIndex(VI, 'ket tien').groups.ops.length).toBeGreaterThan(0);
    expect(opsActionById('atm-jam-200').sub).toBe('cassette-jam');
  });
});
