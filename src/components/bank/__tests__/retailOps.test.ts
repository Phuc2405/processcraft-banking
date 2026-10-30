import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setActiveLocale } from '../../../i18n/locale';
import {
  atmFeeCents,
  buildRetailCase,
  buildTaskCase,
  GL_IDS,
  gradeTaskCase,
  journalBalanced,
  ledgerSummary,
  OPENING_BALANCES,
  openingLedger,
  postJournal,
  RETAIL_DESK,
  RETAIL_SCENARIOS,
  RETAIL_SCENES,
  RETAIL_SOP,
  RETAIL_TASK,
  retailKpis,
  ROLE_STATION,
  STAFF_ROLES,
  STAFF_TASKS,
  taskDeck,
  tdInterestCents,
  waterfall,
  WORKSPACE_TASKS,
  type RetailScenarioId,
  type StaffCase,
  type StaffRoleId,
} from '../../../sim/staffRoleplay';
import { decodeRetailLedger, memoryStorage, RETAIL_LEDGER_KEY } from '../../../store/bankPersistence';
import { createBankStore, EMPTY_SHIFT } from '../../../store/bankStore';
import { hasVietnamese } from '../../../utils/i18nHelper';
import { analystWorkspaceMessages } from '../analystWorkspace.messages';
import { AnalystWorkspaceView, ConsequenceOverlay, consequenceKey, CoreLedgerSheet, riskKey, sopGroups, sopKeys, type AnalystWorkspaceViewProps } from '../AnalystWorkspaceModal';

const msgs = analystWorkspaceMessages.messages;
const has = (key: string): boolean => key in msgs;
const m = ((key: keyof typeof msgs, values?: Record<string, string | number>): string => {
  let text: string = msgs[key].en;
  for (const [name, v] of Object.entries(values ?? {})) text = text.split(`{${name}}`).join(String(v));
  return text;
}) as Parameters<typeof ConsequenceOverlay>[0]['m'];

afterEach(() => setActiveLocale('en'));

/** The first case of a desk's retail queue that plays `scenario` with the given verdict. */
function caseOf(role: StaffRoleId, scenario: RetailScenarioId, expected: 'APPROVE' | 'REJECT', pred: (c: StaffCase) => boolean = () => true): StaffCase {
  const c = taskDeck(role, RETAIL_TASK, 0, 400).find((x) => x.retail?.id === scenario && x.expected === expected && pred(x));
  if (!c) throw new Error(`no ${scenario} ${expected} case`);
  return c;
}
const field = (c: StaffCase, key: string) => c.fields.find((f) => f.key === key)!;
const moneyOf = (c: StaffCase, key: string): number => {
  const v = field(c, key).value;
  if (v.t !== 'money') throw new Error(`${key} is not money`);
  return v.cents;
};
const lineOf = (c: StaffCase, decision: 'APPROVE' | 'REJECT', gl: string) => gradeTaskCase(c, decision).journal!.lines.find((l) => l.gl === gl);

describe('Phase 10 retail operations: scenario catalogue', () => {
  it('keeps the 28-task matrix and adds one retail task per desk', () => {
    expect(STAFF_TASKS).toEqual([1, 2, 3, 4]);
    expect(WORKSPACE_TASKS).toEqual([1, 2, 3, 4, RETAIL_TASK]);
    expect(RETAIL_SCENARIOS).toHaveLength(18);
    const homed = STAFF_ROLES.flatMap((r) => RETAIL_DESK[r]);
    expect(new Set(homed)).toEqual(new Set(RETAIL_SCENARIOS));
    expect(homed).toHaveLength(RETAIL_SCENARIOS.length);
    for (const role of STAFF_ROLES) expect(RETAIL_DESK[role].length, role).toBeGreaterThanOrEqual(2);
  });

  it('builds stable, English-only retail cases at every desk, mixing every scenario and both verdicts', () => {
    for (const role of STAFF_ROLES) {
      const deck = taskDeck(role, RETAIL_TASK, 0, 60);
      expect(taskDeck(role, RETAIL_TASK, 0, 60)).toEqual(deck);
      expect(buildTaskCase(role, RETAIL_TASK, 7)).toEqual(buildRetailCase(role, 7));
      expect(new Set(deck.map((c) => c.id)).size).toBe(60);
      expect(new Set(deck.map((c) => c.retail?.id))).toEqual(new Set(RETAIL_DESK[role]));
      for (const s of RETAIL_DESK[role]) expect(new Set(deck.filter((c) => c.retail?.id === s).map((c) => c.expected)), `${role} ${s}`).toEqual(new Set(['APPROVE', 'REJECT']));
      for (const c of deck) {
        expect(c.role).toBe(role);
        expect(c.station).toBe(ROLE_STATION[role]);
        expect(c.drill).toBeUndefined();
        expect(c.scene).toBe(`retail_${c.retail!.id}`);
        expect(hasVietnamese(JSON.stringify(c))).toBe(false);
      }
    }
  });

  it('flags a breach exactly on the cases the SOP rejects; the low-cash alert never decides', () => {
    for (const role of STAFF_ROLES)
      for (const c of taskDeck(role, RETAIL_TASK, 0, 80)) {
        expect(c.fields.some((f) => f.flag), c.id).toBe(c.expected === 'REJECT');
        if (c.fields.some((f) => f.alert)) expect(c.expected).toBe('APPROVE');
      }
  });

  it('posts a balanced journal for every decision, with positive legs only', () => {
    for (const role of STAFF_ROLES)
      for (const c of taskDeck(role, RETAIL_TASK, 0, 80))
        for (const d of ['APPROVE', 'REJECT'] as const) {
          const r = gradeTaskCase(c, d);
          expect(r.correct).toBe(d === c.expected);
          expect(r.statusCode).toBe(c.retail!.codes[d === 'APPROVE' ? 0 : 1]);
          expect(r.journal).toMatchObject({ caseId: c.id, role, scene: c.scene, decision: d, statusCode: r.statusCode });
          expect(journalBalanced(r.journal!.lines), `${c.id} ${d}`).toBe(true);
          for (const l of r.journal!.lines) {
            expect(Number.isSafeInteger(l.dr) && Number.isSafeInteger(l.cr)).toBe(true);
            expect((l.dr > 0) !== (l.cr > 0), `${c.id} ${l.gl}`).toBe(true);
          }
        }
  });

});

describe('Phase 10 retail operations: the SOP numbers', () => {
  it('lets an annual fee overdraw inside the limit, booking the shortfall to overdraft receivables', () => {
    const c = caseOf('ekyc', 'ANNUAL_FEE', 'APPROVE', (x) => moneyOf(x, 'accountBalance') < x.amountCents);
    expect(moneyOf(c, 'headroom')).toBeGreaterThanOrEqual(c.amountCents);
    const od = lineOf(c, 'APPROVE', 'OVERDRAFT_RECV');
    expect(od?.dr).toBe(c.amountCents - Math.max(0, moneyOf(c, 'accountBalance')));
    expect(lineOf(c, 'APPROVE', 'FEE_INCOME')?.cr).toBe(c.amountCents);
    const over = caseOf('ekyc', 'ANNUAL_FEE', 'REJECT');
    expect(moneyOf(over, 'headroom')).toBeLessThan(over.amountCents);
    expect(gradeTaskCase(over, 'REJECT').journal!.lines).toEqual([]);
  });

  it('returns an unfunded direct debit and charges the NSF fee', () => {
    const c = caseOf('ekyc', 'AUTO_PAY', 'REJECT');
    expect(moneyOf(c, 'accountBalance')).toBeLessThan(c.amountCents);
    expect(gradeTaskCase(c, 'REJECT').statusCode).toBe('DD_RETURNED_NSF');
    expect(lineOf(c, 'REJECT', 'PENALTY_INCOME')?.cr).toBe(RETAIL_SOP.nsfFeeCents);
    expect(lineOf(caseOf('ekyc', 'AUTO_PAY', 'APPROVE'), 'APPROVE', 'BILLER_PAYABLE')?.cr).toBeGreaterThan(0);
  });

  it('pays 1–5% rewards on settled eligible spend and nothing on excluded MCCs or reversals', () => {
    const ok = caseOf('fds', 'CASHBACK', 'APPROVE');
    const rate = field(ok, 'rewardRate').value;
    expect(rate.t === 'pct' && rate.v >= 1 && rate.v <= 5).toBe(true);
    expect(lineOf(ok, 'APPROVE', 'REWARDS_EXPENSE')?.dr).toBe(Math.round((ok.amountCents * (rate.t === 'pct' ? rate.v : 0)) / 100));
    const bad = caseOf('fds', 'CASHBACK', 'REJECT', (x) => field(x, 'mcc').flag === true);
    const mcc = field(bad, 'mcc').value;
    expect(mcc.t === 'msg' && RETAIL_SOP.cashbackExcludedMcc.some((x) => mcc.key === `mcc${x}`)).toBe(true);
  });

  it('waives a fee with points only when the balance covers it', () => {
    const c = caseOf('fds', 'POINTS_WAIVER', 'APPROVE');
    expect(lineOf(c, 'APPROVE', 'LOYALTY_LIABILITY')?.dr).toBe(c.amountCents);
    expect(lineOf(caseOf('fds', 'POINTS_WAIVER', 'REJECT'), 'REJECT', 'CASA')?.dr).toBeGreaterThan(0);
  });

  it('prices interbank ATM fees per network and declines when the fee is not covered', () => {
    expect(atmFeeCents('napas', 30_000)).toBe(110 + 30);
    expect(atmFeeCents('intl', 30_000)).toBe(350 + 300);
    const trap = caseOf('swift', 'ATM_INTERBANK', 'REJECT', (x) => moneyOf(x, 'accountBalance') >= x.amountCents);
    expect(moneyOf(trap, 'accountBalance')).toBeLessThan(moneyOf(trap, 'totalDebit'));
    const ok = caseOf('swift', 'ATM_INTERBANK', 'APPROVE');
    expect(lineOf(ok, 'APPROVE', 'FEE_INCOME')?.cr).toBe(moneyOf(ok, 'networkFee'));
    expect(lineOf(ok, 'APPROVE', 'SWITCH_FEE_EXPENSE')?.dr).toBeGreaterThan(0);
  });

  it('raises the low-cassette alert yet still dispenses, and declines a short cassette', () => {
    const low = caseOf('cashier', 'ATM_LOW_CASH', 'APPROVE', (x) => field(x, 'cashAfter').alert === true);
    expect(moneyOf(low, 'cashAfter')).toBeLessThan(RETAIL_SOP.lowCassetteCents);
    expect(gradeTaskCase(low, 'APPROVE').statusCode).toBe('ATM_DISPENSED_REPLENISH');
    expect(lineOf(low, 'APPROVE', 'ATM_CASH')?.cr).toBe(low.amountCents);
    const short = caseOf('cashier', 'ATM_LOW_CASH', 'REJECT');
    expect(moneyOf(short, 'cassetteCash')).toBeLessThan(short.amountCents);
  });

  it('routes a jammed ATM refund through ATM settlement suspense, and a clearing break into clearing suspense', () => {
    const jam = caseOf('dispute', 'ATM_JAM', 'APPROVE');
    expect(lineOf(jam, 'APPROVE', 'ATM_SUSPENSE')?.dr).toBe(jam.amountCents);
    expect(lineOf(jam, 'APPROVE', 'CASA')?.cr).toBe(jam.amountCents);
    const brk = caseOf('swift', 'CLEARING_BREAK', 'APPROVE');
    expect(lineOf(brk, 'APPROVE', 'CLEARING_SUSPENSE')?.cr).toBe(brk.amountCents);
    expect(gradeTaskCase(caseOf('dispute', 'CARD_CAPTURED', 'REJECT'), 'REJECT').journal!.lines).toEqual([]);
  });

  it('recovers debt strictly as penalty → interest → principal', () => {
    expect(waterfall(50, 30, 40, 1_000)).toEqual({ penalty: 30, interest: 20, principal: 0 });
    expect(waterfall(500, 30, 40, 1_000)).toEqual({ penalty: 30, interest: 40, principal: 430 });
    const bad = caseOf('bnpl', 'DEBT_WATERFALL', 'REJECT');
    const right = waterfall(bad.amountCents, moneyOf(bad, 'latePenaltyDue'), moneyOf(bad, 'overdueInterestDue'), moneyOf(bad, 'principalDue'));
    expect(moneyOf(bad, 'allocPrincipal')).toBeGreaterThan(right.principal);
    // Rejecting reposts the correct waterfall.
    expect(lineOf(bad, 'REJECT', 'LATE_PENALTY_INCOME')?.cr).toBe(right.penalty);
    expect(lineOf(bad, 'REJECT', 'LOAN_PRINCIPAL')?.cr ?? 0).toBe(right.principal);
    const ok = caseOf('bnpl', 'DEBT_WATERFALL', 'APPROVE');
    expect(moneyOf(ok, 'allocPenalty')).toBe(Math.min(ok.amountCents, moneyOf(ok, 'latePenaltyDue')));
  });

  it('recalculates an early break at the 0.1% demand rate, and locks / liquidates TD collateral by the rules', () => {
    expect(tdInterestCents(3_650_000, 0.1, 100)).toBe(1_000);
    const brk = caseOf('cashier', 'TD_EARLY_BREAK', 'REJECT');
    expect(moneyOf(brk, 'payoutInterest')).toBeGreaterThan(lineOf(brk, 'REJECT', 'INTEREST_EXPENSE')!.dr);
    const pledge = caseOf('bnpl', 'TD_PLEDGE', 'APPROVE');
    expect(lineOf(pledge, 'APPROVE', 'TD_PLEDGED')?.cr).toBe(moneyOf(pledge, 'tdBalance'));
    const ltv = field(caseOf('bnpl', 'TD_PLEDGE', 'REJECT'), 'ltv').value;
    expect(ltv.t === 'pct' && ltv.v > RETAIL_SOP.tdMaxLtvPct).toBe(true);
    const liq = caseOf('bnpl', 'TD_LIQUIDATION', 'APPROVE');
    expect(lineOf(liq, 'APPROVE', 'OVERDRAFT_RECV')?.cr).toBe(liq.amountCents);
    const dpd = field(caseOf('bnpl', 'TD_LIQUIDATION', 'REJECT'), 'daysPastDue').value;
    expect(dpd.t === 'num' && dpd.v < RETAIL_SOP.defaultDpd).toBe(true);
  });

  it('settles e-wallets both ways and blocks a QR whose payee name does not match', () => {
    const topUps = taskDeck('aml', RETAIL_TASK, 0, 200).filter((c) => c.retail?.id === 'WALLET' && c.expected === 'APPROVE');
    const dirs = new Set(topUps.map((c) => gradeTaskCase(c, 'APPROVE').journal!.lines.find((l) => l.gl === 'WALLET_SETTLEMENT')!.cr > 0));
    expect(dirs).toEqual(new Set([true, false]));
    const qr = caseOf('aml', 'RTP_QR', 'REJECT', (x) => field(x, 'lookupName').flag === true);
    expect(field(qr, 'lookupName').value).not.toEqual(field(qr, 'qrMerchant').value);
    expect(lineOf(caseOf('aml', 'RTP_QR', 'APPROVE'), 'APPROVE', 'INTERBANK_SETTLEMENT')?.cr).toBeGreaterThan(0);
  });
});

describe('Phase 10 retail operations: the core ledger', () => {
  it('opens square, with capital as the balancing figure', () => {
    expect(GL_IDS.reduce((s, gl) => s + OPENING_BALANCES[gl], 0)).toBe(0);
    expect(ledgerSummary(openingLedger())).toMatchObject({ balanced: true, net: 0 });
    expect(OPENING_BALANCES.EQUITY).toBeLessThan(0);
  });

  it('stays balanced through hundreds of postings and moves the four KPIs', () => {
    let ledger = openingLedger();
    for (const role of STAFF_ROLES)
      for (const c of taskDeck(role, RETAIL_TASK, 0, 40)) {
        const d = c.expected;
        ledger = postJournal(ledger, gradeTaskCase(c, d).journal!);
      }
    expect(ledger.posted).toBe(STAFF_ROLES.length * 40);
    expect(ledger.journal).toHaveLength(25);
    expect(GL_IDS.reduce((s, gl) => s + ledger.balances[gl], 0)).toBe(0);
    const sum = ledgerSummary(ledger);
    expect(sum.balanced).toBe(true);
    const k0 = retailKpis(openingLedger());
    const k = retailKpis(ledger);
    expect(k.feeIncome).toBeGreaterThan(k0.feeIncome);
    expect(k.atmCash).toBeLessThan(k0.atmCash);
    expect(k.suspense).toBeGreaterThan(0);
    expect(k.overdraft).not.toBe(k0.overdraft);
  });

  it('reads the ledger back, and refuses books that do not balance', () => {
    const c = caseOf('ekyc', 'ANNUAL_FEE', 'APPROVE');
    const ledger = postJournal(openingLedger(), gradeTaskCase(c, 'APPROVE').journal!);
    expect(decodeRetailLedger(JSON.stringify(ledger))).toEqual(ledger);
    expect(decodeRetailLedger(null)).toEqual(openingLedger());
    expect(decodeRetailLedger('{nope')).toEqual(openingLedger());
    expect(decodeRetailLedger(JSON.stringify({ ...ledger, balances: { ...ledger.balances, CASA: ledger.balances.CASA + 1 } }))).toEqual(openingLedger());
    const lopsided = { ...ledger.journal[0]!, lines: [{ gl: 'CASA', dr: 5, cr: 0 }] };
    expect(decodeRetailLedger(JSON.stringify({ ...ledger, journal: [lopsided, ...ledger.journal] })).journal).toEqual(ledger.journal);
  });

  it('posts through the store on the retail task, keeps the books in storage and resets them', () => {
    const storage = memoryStorage();
    const store = createBankStore({ storage, seed: 2026, incidentRandom: () => 1 });
    store.getState().openStaffDesk(ROLE_STATION.dispute);
    store.getState().setStaffTask(RETAIL_TASK);
    for (let i = 0; i < 6; i++) {
      const s = store.getState();
      const head = buildTaskCase('dispute', RETAIL_TASK, s.staffTaskSeq);
      const r = s.staffTrain(head.id, head.expected, 3, 30);
      expect(r.journal?.caseId).toBe(head.id);
    }
    const ledger = store.getState().retailLedger;
    expect(ledger.posted).toBe(6);
    expect(store.getState().staffShift.dispute?.reviews).toBe(6);
    expect(decodeRetailLedger(storage.getItem(RETAIL_LEDGER_KEY))).toEqual(ledger);
    expect(createBankStore({ storage, seed: 2026 }).getState().retailLedger).toEqual(ledger);

    store.getState().setStaffTask(1);
    store.getState().staffTrain(buildTaskCase('dispute', 1, store.getState().staffTaskSeq).id, 'APPROVE', 3, 30);
    expect(store.getState().retailLedger.posted).toBe(7);
    expect(store.getState().retailLedger.journal[0]!.scene).toBe('task_dispute_1');

    expect(store.getState().auditLog).toHaveLength(7);
    store.getState().resetRetailLedger();
    expect(store.getState().retailLedger).toEqual(openingLedger());
    expect(decodeRetailLedger(storage.getItem(RETAIL_LEDGER_KEY))).toEqual(openingLedger());
    // The audit trail is the history of those journals: it goes too, and a reload does not rebuild it.
    expect(store.getState().auditLog).toEqual([]);
    expect(createBankStore({ storage, seed: 2026 }).getState().auditLog).toEqual([]);
  });
});

describe('Phase 10 retail operations: bilingual copy and the workspace', () => {
  it('has every title, story, trigger, SOP step and risk card in both registers', () => {
    for (const role of STAFF_ROLES) {
      expect(has(`task_${role}_5_title`), role).toBe(true);
      const groups = sopGroups(role, RETAIL_TASK, 'expert');
      expect(groups.map((g) => g.retail)).toEqual(RETAIL_DESK[role]);
      const std = sopKeys(role, RETAIL_TASK, 'standard');
      const exp = sopKeys(role, RETAIL_TASK, 'expert');
      expect(std).toHaveLength(3 * RETAIL_DESK[role].length);
      for (const key of [...std, ...exp]) expect(has(key), key).toBe(true);
      std.forEach((key, i) => expect(msgs[key].en, key).not.toBe(msgs[exp[i]!].en));
    }
    for (const scene of RETAIL_SCENES) for (const part of ['story', 'triggerStd', 'triggerExp']) expect(has(`scene_${scene}_${part}`), `${scene} ${part}`).toBe(true);
    for (const id of RETAIL_SCENARIOS) {
      expect(has(`retail_${id}_title`), id).toBe(true);
      for (const kind of ['approve', 'reject', 'benefit'] as const)
        for (const mode of ['standard', 'expert'] as const) expect(has(riskKey('aml', undefined, kind, mode, id)), `${id} ${kind} ${mode}`).toBe(true);
    }
    for (const gl of GL_IDS) expect(has(`gl_${gl}`), gl).toBe(true);
  });

  it('labels every field and value a retail case can show', () => {
    for (const role of STAFF_ROLES)
      for (const c of taskDeck(role, RETAIL_TASK, 0, 60))
        for (const f of c.fields) {
          expect(has(`field_${f.key}`), f.key).toBe(true);
          if (f.value.t === 'msg') expect(has(`val_${f.value.key}`), f.value.key).toBe(true);
        }
  });

  it('quotes the retail scenario’s card when the decision lands', () => {
    const result = { ok: true, packetId: 'x', decision: 'APPROVE' as const, expected: 'REJECT' as const, correct: false, statusCode: 'X' };
    expect(consequenceKey({ role: 'bnpl', retail: 'DEBT_WATERFALL', result }, 'expert')).toBe('risk_retail_DEBT_WATERFALL_approveExp');
  });

  const handlers: Pick<AnalystWorkspaceViewProps, 'onClose' | 'onAdvance' | 'onDecide' | 'onTaskChange' | 'onSwitchRole'> = {
    onClose: () => undefined,
    onAdvance: () => undefined,
    onDecide: () => ({ result: { ok: false, packetId: '', decision: 'APPROVE' as const, expected: null, correct: false, statusCode: '' }, errors: 0 }),
    onTaskChange: () => undefined,
    onSwitchRole: () => undefined,
  };

  it('renders the retail queue with its tag, SOP groups, ledger strip and a Task 5 picker option', () => {
    const out = renderToStaticMarkup(
      createElement(AnalystWorkspaceView, { desk: ROLE_STATION.cashier, cases: taskDeck('cashier', RETAIL_TASK, 0, 4), shift: EMPTY_SHIFT, initialMode: 'standard', task: RETAIL_TASK, canAdvance: true, ledger: openingLedger(), ...handlers }),
    );
    expect(out).toContain('data-testid="workspace-retail"');
    expect(out).toContain('data-testid="workspace-ledger-strip"');
    expect(out).toContain('data-testid="workspace-ledger-open"');
    expect(out).toContain('data-testid="ledger-kpi-atm"');
    for (const id of RETAIL_DESK.cashier) expect(out).toContain(`data-retail="${id}"`);
    expect(out).toContain('<option value="5" selected="">');
    const matrix = renderToStaticMarkup(createElement(AnalystWorkspaceView, { desk: ROLE_STATION.cashier, cases: taskDeck('cashier', 1, 0, 4), shift: EMPTY_SHIFT, initialMode: 'standard', task: 1, canAdvance: true, ...handlers }));
    expect(matrix).not.toContain('data-testid="workspace-ledger-strip"');
  });

  it('draws the balance sheet in both languages with the balance check and the latest journals', () => {
    const c = caseOf('dispute', 'ATM_JAM', 'APPROVE');
    const ledger = postJournal(openingLedger(), gradeTaskCase(c, 'APPROVE').journal!);
    const out = renderToStaticMarkup(createElement(CoreLedgerSheet, { ledger, m, onClose: () => undefined, onReset: () => undefined }));
    expect(out).toContain('data-balanced="true"');
    for (const side of ['asset', 'liability', 'equity', 'income', 'expense']) expect(out).toContain(`data-testid="ledger-side-${side}"`);
    expect(out).toContain(`data-case="${c.id}"`);
    expect(out).toContain('data-gl="ATM_SUSPENSE"');
    expect(out).toContain(msgs.gl_ATM_SUSPENSE.en);
    for (const k of ['fees', 'atm', 'suspense', 'overdraft']) expect(out).toContain(`data-testid="ledger-kpi-${k}"`);
  });

  it('shows the posted journal on the consequence overlay, or the memo note when nothing moves', () => {
    const jam = caseOf('dispute', 'ATM_JAM', 'APPROVE');
    const out = renderToStaticMarkup(createElement(ConsequenceOverlay, { consequence: { result: gradeTaskCase(jam, 'APPROVE'), role: 'dispute', retail: 'ATM_JAM', errors: 0 }, mode: 'expert', m }));
    expect(out).toContain('data-testid="workspace-consequence-journal"');
    expect(out).toContain('data-side="dr"');
    expect(out).toContain('data-side="cr"');
    const card = caseOf('dispute', 'CARD_CAPTURED', 'APPROVE');
    const memo = renderToStaticMarkup(createElement(ConsequenceOverlay, { consequence: { result: gradeTaskCase(card, 'APPROVE'), role: 'dispute', retail: 'CARD_CAPTURED', errors: 0 }, mode: 'standard', m }));
    expect(memo).toContain(msgs.ledgerMemo.en);
  });
});
