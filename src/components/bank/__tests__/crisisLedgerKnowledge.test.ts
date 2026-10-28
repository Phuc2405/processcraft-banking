import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { CORE_LEDGER_ARTICLE, flowAmount, glUsage, INTERMEDIATE_ACCOUNTS, INTERMEDIATE_ROLE } from '../../../data/knowledgeBase';
import { buildSearchIndex, searchIndex } from '../../../hooks/useSearchIndex';
import {
  buildTaskCase,
  crisisJournalLines,
  crisisPool,
  crisisTask,
  DESK_INCIDENTS,
  GL_ACCOUNTS,
  GLOBAL_INCIDENTS,
  INCIDENT_DRILL,
  INCIDENT_IDS,
  journalBalanced,
  openingLedger,
  RANDOM_TASK,
  rollCrisis,
  ROLE_STATION,
  STAFF_ROLES,
  taskDeck,
  workingTask,
  type StaffCase,
} from '../../../sim/staffRoleplay';
import { createBankStore, EMPTY_SHIFT } from '../../../store/bankStore';
import { uiStore } from '../../../store/uiStore';
import { bundleProblems } from '../../../utils/i18nHelper';
import { CoreLedgerArticle } from '../../knowledge/KnowledgeBaseModal';
import { knowledgeBaseMessages } from '../../knowledge/knowledgeBase.messages';
import { runSearchAction } from '../../nav/navigate';
import { analystWorkspaceMessages, type AnalystWorkspaceKey } from '../analystWorkspace.messages';
import { AnalystWorkspaceView, CoreLedgerSheet, type AnalystWorkspaceViewProps } from '../AnalystWorkspaceModal';
import { glossaryTerms } from '../codeGlossary';

const msgs = analystWorkspaceMessages.messages;
const en = ((key: AnalystWorkspaceKey, values?: Record<string, string | number>): string => {
  let text: string = msgs[key].en;
  for (const [name, v] of Object.entries(values ?? {})) text = text.split(`{${name}}`).join(String(v));
  return text;
}) as Parameters<typeof CoreLedgerSheet>[0]['m'];
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

afterEach(() => uiStore.setState({ overlay: 'none', knowledgeAnchor: null }));

/** The first case of a task (with an amount) that satisfies `want`. */
function firstCase(role: (typeof STAFF_ROLES)[number], task: Parameters<typeof buildTaskCase>[1], want: (c: StaffCase) => boolean): StaffCase {
  for (let seq = 0; seq < 200; seq++) {
    const c = buildTaskCase(role, task, seq);
    if (c.amountCents > 0 && want(c)) return c;
  }
  throw new Error(`no ${role} case`);
}

describe('the Emergency Crisis Queue', () => {
  it('covers all 25 incidents across the seven desks, and every desk faces the four bank-wide ones', () => {
    const all = new Set(STAFF_ROLES.flatMap((r) => crisisPool(r)));
    expect(all.size).toBe(25);
    expect([...all].sort()).toEqual([...INCIDENT_IDS].sort());
    for (const r of STAFF_ROLES) expect(crisisPool(r)).toEqual(expect.arrayContaining([...GLOBAL_INCIDENTS, ...DESK_INCIDENTS[r]]));
  });

  it('always rolls a crisis from the desk pool, and never repeats the one that just ended', () => {
    for (const r of STAFF_ROLES) {
      for (const x of [0, 0.3, 0.6, 0.999]) {
        const id = rollCrisis(r, () => x);
        expect(crisisPool(r)).toContain(id);
        expect(rollCrisis(r, () => x, id)).not.toBe(id);
      }
    }
  });

  it('serves the drill a desk incident floods, all drills for a bank-wide one, and the routine task when off', () => {
    expect(crisisTask('FDS_BIN_STORM')).toBe(INCIDENT_DRILL.FDS_BIN_STORM);
    expect(crisisTask('AUDIT_DAY')).toBe(RANDOM_TASK);
    expect(workingTask(5, true, 'FDS_BIN_STORM')).toBe(INCIDENT_DRILL.FDS_BIN_STORM);
    expect(workingTask(5, false, 'FDS_BIN_STORM')).toBe(5);
    expect(workingTask(2, true, null)).toBe(2);
  });

  it('routes crisis money to 2930 frozen, 1920 dispute and 2912 suspense, and every journal still balances', () => {
    const aml = firstCase('aml', 1, () => true);
    expect(crisisJournalLines(aml, 'REJECT', 'AML_SMURF_WAVE').find((l) => l.cr)?.gl).toBe('FROZEN_ASSETS');
    const dispute = firstCase('dispute', 1, () => true);
    expect(crisisJournalLines(dispute, 'APPROVE', 'AUDIT_DAY').find((l) => l.dr)?.gl).toBe('DISPUTE_ACCOUNT');
    const wire = firstCase('swift', 1, () => true);
    const outage = crisisJournalLines(wire, 'APPROVE', 'NETWORK_LATENCY');
    expect(outage.map((l) => l.gl)).toContain('CLEARING_SUSPENSE');
    expect(outage.map((l) => l.gl)).not.toContain('NOSTRO');
    for (const r of STAFF_ROLES)
      for (const id of crisisPool(r))
        for (let seq = 0; seq < 6; seq++) {
          const c = buildTaskCase(r, crisisTask(id), seq, id);
          for (const d of ['APPROVE', 'REJECT'] as const) expect(journalBalanced(crisisJournalLines(c, d, id)), `${r} ${id} ${d}`).toBe(true);
        }
  });

  it('in the store: on serves and posts the crisis queue, off returns to the routine task from its first case', () => {
    const store = createBankStore({ storage: null, seed: 2026, incidentRandom: () => 0.5 });
    store.getState().openStaffDesk(ROLE_STATION.aml);
    store.getState().setStaffTask(2);
    store.getState().setIncidentMode(true);
    const crisis = store.getState().staffIncident!.id;
    expect(crisisPool('aml')).toContain(crisis);
    const head = buildTaskCase('aml', crisisTask(crisis), 0, crisis);
    const result = store.getState().staffTrain(head.id, 'REJECT', 3, 30);
    expect(result.ok).toBe(true);
    if (head.amountCents > 0) expect(result.journal?.lines.find((l) => l.cr)?.gl).toBe('FROZEN_ASSETS');
    store.getState().setIncidentMode(false);
    expect(store.getState()).toMatchObject({ staffIncidentMode: false, staffIncident: null, staffTask: 2, staffTaskSeq: 0 });
  });

  const handlers: Pick<AnalystWorkspaceViewProps, 'onClose' | 'onAdvance' | 'onDecide' | 'onTaskChange' | 'onSwitchRole'> = {
    onClose: () => undefined,
    onAdvance: () => undefined,
    onDecide: () => ({ result: { ok: false, packetId: '', decision: 'APPROVE' as const, expected: null, correct: false, statusCode: '' }, errors: 0 }),
    onTaskChange: () => undefined,
    onSwitchRole: () => undefined,
  };
  const view = (incidentMode: boolean) =>
    renderToStaticMarkup(
      createElement(AnalystWorkspaceView, {
        desk: ROLE_STATION.fds,
        cases: taskDeck('fds', workingTask(1, incidentMode, 'FDS_BIN_STORM'), 0, 4, 'FDS_BIN_STORM'),
        shift: EMPTY_SHIFT,
        initialMode: 'standard',
        task: 1,
        canAdvance: true,
        incidentMode,
        incident: { id: 'FDS_BIN_STORM', compliance: 100, reviews: 0 },
        ...handlers,
      }),
    );

  it('locks the task picker and raises the pulsing alarm over the case while on', () => {
    const on = view(true);
    expect(on).not.toContain('data-testid="workspace-task-select"');
    expect(on).toContain('data-testid="workspace-crisis-queue"');
    expect(on).toContain(esc(en('crisisAlert', { title: msgs.incident_FDS_BIN_STORM_title.en })));
    expect(on.indexOf('data-testid="workspace-crisis-alert"')).toBeLessThan(on.indexOf('data-testid="workspace-scenario"'));
    expect(on).toMatch(/data-testid="workspace-task" data-task="\d" data-crisis="FDS_BIN_STORM"/);
    const off = view(false);
    expect(off).toContain('data-testid="workspace-task-select"');
    expect(off).not.toContain('workspace-crisis-alert');
  });
});

describe('the ledger legend', () => {
  it('has a toggle in the header and, open, the equation, every tag and the door to the Knowledge Base', () => {
    const closed = renderToStaticMarkup(createElement(CoreLedgerSheet, { ledger: openingLedger(), m: en, onClose: () => undefined, onReset: () => undefined }));
    expect(closed).toContain('data-testid="workspace-ledger-legend-toggle"');
    expect(closed).toContain(esc(msgs.legendButton.en));
    expect(closed).not.toContain('data-testid="workspace-ledger-legend"');
    const open = renderToStaticMarkup(createElement(CoreLedgerSheet, { ledger: openingLedger(), m: en, onClose: () => undefined, onReset: () => undefined, legendOpen: true }));
    expect(open).toContain(esc(msgs.legendEquation.en));
    for (const key of ['legendSuspense', 'legendNostro', 'legendDispute', 'legendFrozen', 'legendCollateral', 'legendReadMore'] as const) expect(open).toContain(esc(msgs[key].en));
  });
});

describe('the Knowledge Base article', () => {
  it('passes the bundle checks', () => {
    expect(bundleProblems(knowledgeBaseMessages)).toEqual([]);
  });

  it('lists every GL account the ledger has, and explains every intermediate account', () => {
    const out = renderToStaticMarkup(createElement(CoreLedgerArticle, {}));
    for (const a of GL_ACCOUNTS) expect(out, a.id).toContain(`id="kb-gl-${a.id}"`);
    for (const gl of INTERMEDIATE_ACCOUNTS) expect(INTERMEDIATE_ROLE[gl], gl).toBeDefined();
    for (const s of CORE_LEDGER_ARTICLE.sections) expect(out).toContain(`id="kb-${s.id}"`);
    expect(out).toContain('data-testid="kb-equation"');
  });

  it('walks balanced flows, with the ATM suspense draining back to zero', () => {
    for (const f of CORE_LEDGER_ARTICLE.flows)
      for (const st of f.steps) {
        const side = (k: 'dr' | 'cr') => st.lines.filter((l) => l.side === k).reduce((n, l) => n + flowAmount(f, l), 0);
        expect(side('dr'), f.id).toBe(side('cr'));
      }
    const atm = CORE_LEDGER_ARTICLE.flows.find((f) => f.id === 'flow-atm-jam')!;
    const net = atm.steps.flatMap((s) => s.lines).filter((l) => l.gl === 'ATM_SUSPENSE').reduce((n, l) => n + (l.side === 'dr' ? 1 : -1), 0);
    expect(net).toBe(0);
  });

  it('defines every acronym the desks use', () => {
    const keys = glossaryTerms('en').map((t) => t.key);
    for (const k of ['CTR', 'STR', 'SWIFT', 'MDR', 'CHARGEBACK', 'NSF', 'BNPL', 'DTI', 'POS', 'EKYC', 'ATM', 'RTP', 'A2A', 'EOD', 'NOSTRO', 'SUSPENSE']) expect(keys).toContain(k);
    const out = renderToStaticMarkup(createElement(CoreLedgerArticle, { highlight: 'term-MDR' }));
    expect(out).toMatch(/id="kb-term-MDR"[^>]*class="[^"]*ring-2/);
  });
});

describe('the two views of the account glossary', () => {
  const kb = knowledgeBaseMessages.messages;

  it('Basic shows code, account, plain words and type; Advanced adds the trigger event and the contra entry', () => {
    const basic = renderToStaticMarkup(createElement(CoreLedgerArticle, {}));
    expect(basic).toContain('data-testid="kb-article" data-article="core-ledger" data-view="basic"');
    for (const key of ['colCode', 'colAccount', 'colPlain', 'colType'] as const) expect(basic).toContain(esc(kb[key].en));
    expect(basic).not.toContain(esc(kb.colTrigger.en));
    expect(basic).not.toContain('data-col="entry"');
    const adv = renderToStaticMarkup(createElement(CoreLedgerArticle, { view: 'advanced' }));
    expect(adv).toContain(esc(kb.colTrigger.en));
    expect(adv).toContain(esc(kb.colEntry.en));
    const atm = adv.slice(adv.indexOf('id="kb-gl-ATM_SUSPENSE"'), adv.indexOf('</tr>', adv.indexOf('id="kb-gl-ATM_SUSPENSE"')));
    expect(atm).toContain('Dr 1910 / Cr 2011');
    expect(atm).toContain(esc(msgs.retail_ATM_JAM_title.en));
  });

  it('reads every trigger and entry from the simulator, and says so when an account only has its opening balance', () => {
    const u = glUsage();
    for (const a of GL_ACCOUNTS) {
      for (const scene of u[a.id].scenes) if (scene !== 'crisis') expect(`${scene}_title` in msgs, `${a.id} ${scene}`).toBe(true);
      if (u[a.id].entry) expect(u[a.id].entry).toMatch(/^Dr \d{4}( \/ Dr \d{4})* \/ Cr \d{4}( \/ Cr \d{4})*$/);
      if (u[a.id].entry) expect(u[a.id].entry).toContain(a.code);
    }
    expect(u.EQUITY).toEqual({ scenes: [], entry: null });
    expect(u.FROZEN_ASSETS.scenes).toContain('crisis');
    const adv = renderToStaticMarkup(createElement(CoreLedgerArticle, { view: 'advanced' }));
    expect(adv).toContain(esc(kb.triggerOpening.en));
  });
});

describe('global search over the Knowledge Base', () => {
  const index = { en: buildSearchIndex('expert', 'en'), vi: buildSearchIndex('beginner', 'vi') };
  const top = (q: string, locale: 'en' | 'vi' = 'en') => searchIndex(index[locale], q).groups.kb[0];

  it('finds a workspace account by its GL number', () => {
    expect(top('1520')?.id).toBe('kb:gl:NOSTRO');
    expect(top('1910')?.id).toBe('kb:gl:ATM_SUSPENSE');
    expect(top('2912')?.id).toBe('kb:gl:CLEARING_SUSPENSE');
    expect(top('1920')?.id).toBe('kb:gl:DISPUTE_ACCOUNT');
    expect(top('2930', 'vi')?.id).toBe('kb:gl:FROZEN_ASSETS');
    expect(top('1520')?.action).toEqual({ kind: 'knowledge', anchor: 'gl-NOSTRO' });
  });

  it('finds the accounting terms in both languages', () => {
    for (const q of ['Bút toán kép', 'Double Entry', 'Nostro', 'Suspense', 'Tranh chấp', 'Chargeback', 'Balance Sheet', 'Cân đối sổ cái']) {
      expect(searchIndex(index.vi, q).groups.kb.length + searchIndex(index.en, q).groups.kb.length, q).toBeGreaterThan(0);
    }
    expect(top('double entry')?.action).toEqual({ kind: 'knowledge', anchor: 'double-entry' });
  });

  it('finds every banking acronym by name', () => {
    for (const q of ['CTR', 'STR', 'SWIFT', 'MDR', 'NSF', 'BNPL', 'DTI', 'POS', 'eKYC', 'ATM', 'RTP', 'A2A', 'EOD']) expect(searchIndex(index.en, q).groups.kb.some((e) => e.id.startsWith('kb:term:')), q).toBe(true);
    expect(top('CTR')?.id).toBe('kb:term:CTR');
  });

  it('opens the Knowledge Base at the result', () => {
    runSearchAction({ kind: 'knowledge', anchor: 'gl-NOSTRO' });
    expect(uiStore.getState()).toMatchObject({ overlay: 'knowledge', knowledgeAnchor: 'gl-NOSTRO' });
  });
});
