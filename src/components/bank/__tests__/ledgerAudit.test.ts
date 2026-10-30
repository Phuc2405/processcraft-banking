import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildTaskCase,
  caseJournalLines,
  GL_CODE,
  GL_IDS,
  gradeTaskCase,
  journalBalanced,
  ledgerSummary,
  NOSTRO_OPENING_CENTS,
  OPENING_BALANCES,
  GL_ACCOUNTS,
  openingLedger,
  postJournal,
  RETAIL_DESK,
  RETAIL_TASK,
  retailKpis,
  ROLE_STATION,
  settledCents,
  STAFF_ROLES,
  STAFF_TASKS,
  taskDeck,
  WIRE_FEE_CENTS,
  remittanceBreakdown,
  fxMarkupCents,
  fxSpreadBps,
  PREPAID_CARD_LOAD_CENTS,
  type GlAccount,
  type RetailLedger,
  type StaffCase,
  type StaffDecision,
} from '../../../sim/staffRoleplay';
import { decodeRetailLedger, memoryStorage, RETAIL_LEDGER_KEY } from '../../../store/bankPersistence';
import { createBankStore, EMPTY_SHIFT } from '../../../store/bankStore';
import { analystWorkspaceMessages } from '../analystWorkspace.messages';
import { AnalystWorkspaceView, CoreLedgerCard, CoreLedgerSheet, JournalDetail, journalTitleKey, personaFor, type AnalystWorkspaceViewProps } from '../AnalystWorkspaceModal';

const msgs = analystWorkspaceMessages.messages;
const m = ((key: keyof typeof msgs, values?: Record<string, string | number>): string => {
  let text: string = msgs[key].en;
  for (const [name, v] of Object.entries(values ?? {})) text = text.split(`{${name}}`).join(String(v));
  return text;
}) as Parameters<typeof CoreLedgerCard>[0]['m'];

const post = (l: RetailLedger, c: StaffCase, d: StaffDecision): RetailLedger => postJournal(l, gradeTaskCase(c, d).journal!);
const legOf = (c: StaffCase, d: StaffDecision, gl: GlAccount) => caseJournalLines(c, d).find((l) => l.gl === gl);
const firstOf = (role: (typeof STAFF_ROLES)[number], task: 1 | 2 | 3, pred: (c: StaffCase) => boolean): StaffCase => {
  const c = taskDeck(role, task, 0, 200).find(pred);
  if (!c) throw new Error(`no ${role} ${task} case`);
  return c;
};
const esc = (s: string): string => s.replace(/&/g, '&amp;');
const isCashIn = (c: StaffCase): boolean => c.fields.some((f) => f.key === 'direction' && f.value.t === 'msg' && f.value.key === 'cashIn');

describe('Phase 11 core ledger: chart of accounts', () => {
  it('adds till, nostro, dispute, frozen-asset and revenue accounts and opens square', () => {
    for (const gl of ['TILL_CASH', 'NOSTRO', 'DISPUTE_ACCOUNT', 'FROZEN_ASSETS', 'INTEREST_INCOME', 'LATE_PENALTY_INCOME', 'WIRE_FEE_INCOME'] as const) expect(GL_IDS).toContain(gl);
    expect(GL_IDS).not.toContain('PENALTY_RECV' as GlAccount);
    expect(new Set(Object.values(GL_CODE)).size).toBe(GL_IDS.length);
    expect(OPENING_BALANCES.NOSTRO).toBe(NOSTRO_OPENING_CENTS);
    expect(GL_IDS.reduce((s, gl) => s + OPENING_BALANCES[gl], 0)).toBe(0);
    expect(openingLedger().settledVolume).toBe(0);
  });
});

describe('Phase 11 core ledger: postings on every desk', () => {
  it('posts a balanced journal on every 28-task-matrix decision', () => {
    for (const role of STAFF_ROLES)
      for (const task of STAFF_TASKS)
        for (const c of taskDeck(role, task, 0, 30))
          for (const d of ['APPROVE', 'REJECT'] as const) {
            const j = gradeTaskCase(c, d).journal!;
            expect(j).toMatchObject({ caseId: c.id, role, scene: c.scene, decision: d });
            expect(journalBalanced(j.lines), `${c.id} ${d}`).toBe(true);
          }
  });

  it('moves till cash against customer deposits for teller cash in and out', () => {
    const cashIn = firstOf('cashier', 2, isCashIn);
    expect(legOf(cashIn, 'APPROVE', 'TILL_CASH')?.dr).toBe(cashIn.amountCents);
    expect(legOf(cashIn, 'APPROVE', 'CASA')?.cr).toBe(cashIn.amountCents);
    const cashOut = firstOf('cashier', 3, (c) => !isCashIn(c));
    expect(legOf(cashOut, 'APPROVE', 'TILL_CASH')?.cr).toBe(cashOut.amountCents);
    expect(caseJournalLines(cashOut, 'REJECT')).toEqual([]);
  });

  it('pays a wire out of the nostro and books the wire fee and the FX markup as revenue (2011 / 1520 / 4540)', () => {
    const wire = firstOf('swift', 2, () => true);
    const fx = remittanceBreakdown(wire);
    expect(fx.markup).toBe(fxMarkupCents(wire.amountCents, fxSpreadBps(wire)));
    expect(fx.markup).toBeGreaterThan(0);
    expect(legOf(wire, 'APPROVE', 'CASA')?.dr).toBe(wire.amountCents + WIRE_FEE_CENTS + fx.markup);
    expect(legOf(wire, 'APPROVE', 'NOSTRO')?.cr).toBe(wire.amountCents);
    expect(legOf(wire, 'APPROVE', 'WIRE_FEE_INCOME')?.cr).toBe(WIRE_FEE_CENTS + fx.markup);
    // The inspector shows the breakdown: rate, spread, gross in the foreign currency, and the markup fee.
    for (const key of ['fxRate', 'fxSpread', 'fxGross', 'fxMarkup']) expect(wire.fields.some((f) => f.key === key), key).toBe(true);
  });

  it('routes dispute refunds into the dispute account and AML freezes into frozen assets', () => {
    const refund = firstOf('dispute', 1, () => true);
    expect(legOf(refund, 'APPROVE', 'DISPUTE_ACCOUNT')?.dr).toBe(refund.amountCents);
    for (const drill of [1, 3] as const) {
      const hit = firstOf('aml', drill, (c) => c.expected === 'REJECT');
      expect(legOf(hit, 'REJECT', 'FROZEN_ASSETS')?.cr, `aml ${drill}`).toBe(hit.amountCents);
    }
    expect(caseJournalLines(firstOf('aml', 2, (c) => c.expected === 'REJECT'), 'REJECT')).toEqual([]);
    // eKYC verified: an instant virtual prepaid card (Dr 1510 / Cr 2410); refused: nothing moves.
    const kyc = firstOf('ekyc', 1, () => true);
    expect(caseJournalLines(kyc, 'APPROVE')).toEqual([{ gl: 'INTERBANK_SETTLEMENT', dr: PREPAID_CARD_LOAD_CENTS, cr: 0 }, { gl: 'WALLET_SETTLEMENT', dr: 0, cr: PREPAID_CARD_LOAD_CENTS }]);
    expect(caseJournalLines(kyc, 'REJECT')).toEqual([]);
  });

  it('credits late penalty and interest revenue, then loan receivables, on a waterfall repayment', () => {
    const c = taskDeck('bnpl', RETAIL_TASK, 0, 200).find((x) => x.retail?.id === 'DEBT_WATERFALL' && x.expected === 'APPROVE' && x.fields.some((f) => f.key === 'allocPrincipal' && f.value.t === 'money' && f.value.cents > 0))!;
    const lines = gradeTaskCase(c, 'APPROVE').journal!.lines;
    expect(lines.map((l) => l.gl)).toEqual(['CASA', 'LATE_PENALTY_INCOME', 'INTEREST_INCOME', 'LOAN_PRINCIPAL']);
  });
});

describe('Phase 11 core ledger: the header metrics', () => {
  it('counts settled volume, but not money routed into suspense, frozen, pledged or disputed accounts', () => {
    expect(settledCents([{ gl: 'CASA', dr: 500, cr: 0 }, { gl: 'NOSTRO', dr: 0, cr: 500 }])).toBe(500);
    expect(settledCents([{ gl: 'CASA', dr: 500, cr: 0 }, { gl: 'FROZEN_ASSETS', dr: 0, cr: 500 }])).toBe(0);
    expect(settledCents([{ gl: 'ATM_SUSPENSE', dr: 300, cr: 0 }, { gl: 'CASA', dr: 0, cr: 300 }])).toBe(0);
    expect(settledCents([{ gl: 'LOAN_PRINCIPAL', dr: 700, cr: 0 }, { gl: 'INTERBANK_SETTLEMENT', dr: 0, cr: 700 }])).toBe(700);
    // Releasing pledged collateral settles the debt it secured.
    expect(settledCents([{ gl: 'TD_PLEDGED', dr: 900, cr: 0 }, { gl: 'OVERDRAFT_RECV', dr: 0, cr: 600 }, { gl: 'CASA', dr: 0, cr: 300 }])).toBe(900);
  });

  it('tracks settled volume, net revenue, suspense and frozen & pledged funds as decisions post', () => {
    let l = openingLedger();
    const wire = firstOf('swift', 1, () => true);
    l = post(l, wire, 'APPROVE');
    const fx = remittanceBreakdown(wire);
    expect(retailKpis(l)).toMatchObject({ settledVolume: fx.total, netRevenue: WIRE_FEE_CENTS + fx.markup, suspense: 0, frozenCollateral: -OPENING_BALANCES.TD_PLEDGED });

    const sanction = firstOf('aml', 1, (c) => c.expected === 'REJECT');
    l = post(l, sanction, 'REJECT');
    const pledge = taskDeck('bnpl', RETAIL_TASK, 0, 200).find((c) => c.retail?.id === 'TD_PLEDGE' && c.expected === 'APPROVE')!;
    l = post(l, pledge, 'APPROVE');
    const pledged = gradeTaskCase(pledge, 'APPROVE').journal!.lines.find((x) => x.gl === 'TD_PLEDGED')!.cr;
    expect(retailKpis(l).frozenCollateral).toBe(sanction.amountCents + pledged - OPENING_BALANCES.TD_PLEDGED);

    const jam = taskDeck('dispute', RETAIL_TASK, 0, 200).find((c) => c.retail?.id === 'ATM_JAM' && c.expected === 'APPROVE')!;
    const brk = taskDeck('swift', RETAIL_TASK, 0, 200).find((c) => c.retail?.id === 'CLEARING_BREAK' && c.expected === 'APPROVE')!;
    l = post(post(l, jam, 'APPROVE'), brk, 'APPROVE');
    const k = retailKpis(l);
    expect(k.suspense).toBe(jam.amountCents + brk.amountCents);
    expect(k.settledVolume).toBe(fx.total);
    expect(k.netRevenue).toBe(ledgerSummary(l).net);
    expect(ledgerSummary(l).balanced).toBe(true);
  });

  it('posts live-queue decisions through the store and keeps them in storage', () => {
    const storage = memoryStorage();
    const store = createBankStore({ storage, seed: 2026, incidentRandom: () => 1 });
    store.getState().openStaffDesk('BNPL');
    let posted = 0;
    for (let guard = 0; guard < 400 && posted < 3 && !store.getState().sim.dayOver; guard++) {
      const head = (store.getState().pendingQueueMap.BNPL ?? [])[0];
      if (!head) {
        store.getState().step();
        continue;
      }
      const r = store.getState().staffDecide(head.id, head.expected, 5, 30);
      expect(r.journal).toMatchObject({ caseId: head.id, role: 'bnpl', scene: head.scene });
      posted++;
    }
    const ledger = store.getState().retailLedger;
    expect(ledger.posted).toBe(posted);
    expect(ledger.journal[0]!.scene).toBe('bnpl_apply');
    expect(decodeRetailLedger(storage.getItem(RETAIL_LEDGER_KEY))).toEqual(ledger);
  });
});

describe('Phase 11 core ledger: persistence', () => {
  it('round-trips the settled volume and maps Phase 10 journal entries onto their desk', () => {
    const l = post(openingLedger(), firstOf('swift', 1, () => true), 'APPROVE');
    expect(decodeRetailLedger(JSON.stringify(l))).toEqual(l);
    const legacy = { caseId: 'RT-EKYC-001', scenario: 'ANNUAL_FEE', decision: 'APPROVE', statusCode: 'FEE_POSTED', lines: [] };
    expect(decodeRetailLedger(JSON.stringify({ ...l, journal: [legacy] })).journal).toEqual([{ caseId: 'RT-EKYC-001', role: 'ekyc', scene: 'retail_ANNUAL_FEE', decision: 'APPROVE', statusCode: 'FEE_POSTED', lines: [] }]);
  });

  it('restarts books saved with the retired receivable accounts', () => {
    const old = { ...OPENING_BALANCES, PENALTY_RECV: 300_000, EQUITY: OPENING_BALANCES.EQUITY - 300_000 };
    expect(decodeRetailLedger(JSON.stringify({ balances: old, journal: [], posted: 4 }))).toEqual(openingLedger());
  });
});

describe('Phase 11 core ledger: the header card and bilingual labels', () => {
  it('labels Debit, Credit, Suspense, Nostro, Collateral and Net revenue in both languages', () => {
    for (const key of ['labelDebit', 'labelCredit', 'labelSuspense', 'labelNostro', 'labelCollateral', 'labelNetRevenue', 'ledgerCardTitle', 'ledgerCardVolume', 'ledgerCardSuspense', 'ledgerCardFrozen'] as const) {
      expect(msgs[key].en.trim(), key).not.toBe('');
      expect(msgs[key].vi, key).not.toBe(msgs[key].en);
    }
    for (const gl of GL_IDS) expect(`gl_${gl}` in msgs, gl).toBe(true);
  });

  it('names a journal by its retail scenario, matrix task or live desk', () => {
    expect(journalTitleKey({ role: 'ekyc', scene: 'retail_ANNUAL_FEE' })).toBe('retail_ANNUAL_FEE_title');
    expect(journalTitleKey({ role: 'swift', scene: 'task_swift_2' })).toBe('task_swift_2_title');
    expect(journalTitleKey({ role: 'bnpl', scene: 'bnpl_apply' })).toBe('role_bnpl_title');
    for (const role of STAFF_ROLES) for (const id of RETAIL_DESK[role]) expect(journalTitleKey({ role, scene: `retail_${id}` }) in msgs).toBe(true);
  });

  it('renders the Core Ledger Balance Sheet card in the workspace header with its four live figures', () => {
    const l = post(openingLedger(), firstOf('swift', 1, () => true), 'APPROVE');
    const card = renderToStaticMarkup(createElement(CoreLedgerCard, { kpis: retailKpis(l), onOpen: () => undefined, m }));
    expect(card).toContain(esc(msgs.ledgerCardTitle.en));
    for (const id of ['volume', 'revenue', 'suspense', 'frozen']) expect(card).toContain(`data-testid="ledger-card-${id}"`);

    const handlers: Pick<AnalystWorkspaceViewProps, 'onClose' | 'onAdvance' | 'onDecide' | 'onTaskChange' | 'onSwitchRole'> = {
      onClose: () => undefined,
      onAdvance: () => undefined,
      onDecide: () => ({ result: { ok: false, packetId: '', decision: 'APPROVE' as const, expected: null, correct: false, statusCode: '' }, errors: 0 }),
      onTaskChange: () => undefined,
      onSwitchRole: () => undefined,
    };
    const view = renderToStaticMarkup(createElement(AnalystWorkspaceView, { desk: ROLE_STATION.aml, cases: taskDeck('aml', 1, 0, 4), shift: EMPTY_SHIFT, initialMode: 'standard', task: 1, canAdvance: true, ledger: l, ...handlers }));
    const header = view.slice(view.indexOf('<header'), view.indexOf('</header>'));
    expect(header).toContain('data-testid="workspace-ledger-open"');
    expect(header).toContain(msgs.ledgerCardTitle.en);
  });

  it('details every journal: customer, case ID, channel/desk code, timestamp and each Debit/Credit line by GL code', () => {
    const wire = firstOf('swift', 2, () => true);
    const journal = { ...gradeTaskCase(wire, 'APPROVE').journal!, station: ROLE_STATION.swift, at: '2026-10-27T12:00:00.000Z' };
    const out = renderToStaticMarkup(createElement('ol', null, createElement(JournalDetail, { j: journal, m })));
    expect(out).toContain(esc(personaFor(wire.id).name));
    expect(out).toContain(wire.id);
    expect(out).toContain(`data-station="${ROLE_STATION.swift}"`);
    expect(out).toMatch(/27\/10\/2026 \d\d:00:00/);
    for (const l of journal.lines) expect(out).toContain(`data-gl="${l.gl}"`);
    expect(out).toContain(esc(msgs.ledgerTotal.en));
  });

  it('stamps posted journals with the desk and the time, and keeps the stamp across a reload', () => {
    const storage = memoryStorage();
    const store = createBankStore({ storage, seed: 2026, incidentRandom: () => 1, now: () => new Date('2026-10-27T12:00:00.000Z') });
    store.getState().openStaffDesk(ROLE_STATION.swift);
    store.getState().setStaffTask(2);
    const head = buildTaskCase('swift', 2, store.getState().staffTaskSeq);
    store.getState().staffTrain(head.id, head.expected, 2, 30);
    const posted = store.getState().retailLedger.journal[0]!;
    expect(posted).toMatchObject({ caseId: head.id, station: head.station, at: '2026-10-27T12:00:00.000Z' });
    expect(decodeRetailLedger(storage.getItem(RETAIL_LEDGER_KEY)).journal[0]).toMatchObject({ station: head.station, at: posted.at });
  });

  it('ellipsises long account names on the balance sheet, keeps amounts pinned right, and puts the full text on hover', () => {
    const out = renderToStaticMarkup(createElement(CoreLedgerSheet, { ledger: openingLedger(), m, onClose: () => undefined, onReset: () => undefined }));
    const nostro = out.slice(out.indexOf('data-gl="NOSTRO"'), out.indexOf('</li>', out.indexOf('data-gl="NOSTRO"')));
    const name = `${GL_ACCOUNTS.find((a) => a.id === 'NOSTRO')!.code} ${msgs.gl_NOSTRO.en}`;
    expect(nostro).toContain(`title="${esc(name)}"`);
    expect(nostro).toMatch(/min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap/);
    expect(nostro).toMatch(/shrink-0 whitespace-nowrap text-right[^"]*" title="[^"]*: \$/);
    expect(nostro).toContain(`title="${msgs.labelNostro.en}"`);
    expect(out).toContain('sm:grid-cols-[repeat(2,minmax(0,1fr))]');
  });

  it('tags suspense, nostro, collateral and frozen accounts on the balance sheet and titles matrix journals', () => {
    const wire = firstOf('swift', 2, () => true);
    const l = post(openingLedger(), wire, 'APPROVE');
    const out = renderToStaticMarkup(createElement(CoreLedgerSheet, { ledger: l, m, onClose: () => undefined, onReset: () => undefined }));
    for (const key of ['labelSuspense', 'labelNostro', 'labelCollateral', 'labelFrozen', 'labelNetRevenue'] as const) expect(out).toContain(esc(msgs[key].en));
    expect(out).toContain(esc(msgs.task_swift_2_title.en));
    expect(out).toContain(`title="${msgs.labelDebit.en}"`);
    expect(buildTaskCase('swift', 2, 0).id).toBe(wire.id);
  });
});
