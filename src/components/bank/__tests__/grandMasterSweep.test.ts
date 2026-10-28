import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ACRONYM_GL, ACRONYM_GL_WHY, BUFFER_MECHANICS, CORE_LEDGER_ARTICLE, flowBalances, GL_TAXONOMY, LEDGER_FORMULAS } from '../../../data/knowledgeBase';
import { buildSearchIndex, glCodeQuery, searchIndex } from '../../../hooks/useSearchIndex';
import { setActiveLocale } from '../../../i18n/locale';
import {
  buildRetailCase,
  buildTaskCase,
  clampCrisisBatch,
  CRISIS_BATCH,
  crisisCasesLeft,
  crisisOver,
  crisisPool,
  GL_ACCOUNTS,
  GL_CODE,
  gradeTaskCase,
  isCrisisStream,
  ROLE_STATION,
  STAFF_DRILLS,
  taskDeck,
  workingTask,
  type GlAccount,
  type IncidentId,
  type StaffRoleId,
} from '../../../sim/staffRoleplay';
import { memoryStorage } from '../../../store/bankPersistence';
import { createBankStore, EMPTY_SHIFT } from '../../../store/bankStore';
import { CoreLedgerArticle, KnowledgeHeaderControls } from '../../knowledge/KnowledgeBaseModal';
import { knowledgeBaseMessages } from '../../knowledge/knowledgeBase.messages';
import { SegmentedToggle } from '../../shell/SegmentedToggle';
import { analystWorkspaceMessages, type AnalystWorkspaceKey } from '../analystWorkspace.messages';
import { AnalystWorkspaceView, CoreLedgerSheet, type AnalystWorkspaceViewProps } from '../AnalystWorkspaceModal';
import { BANK_WIRES, connectedWires, GATEWAY_HALF, GATEWAY_SPOKES, gatewayCarries, GATEWAYS, labelChars, labelPill, PLACE_BOX } from '../layout';
import { VI_DICTIONARY } from '../../../i18n/viDictionary';
import { WIRES } from '../../../sim/topology';
import { openingLedger } from '../../../sim/staffRoleplay';

const msgs = analystWorkspaceMessages.messages;
const kb = knowledgeBaseMessages.messages;
const en = ((key: AnalystWorkspaceKey, values?: Record<string, string | number>): string => {
  let text: string = msgs[key].en;
  for (const [name, v] of Object.entries(values ?? {})) text = text.split(`{${name}}`).join(String(v));
  return text;
}) as Parameters<typeof CoreLedgerSheet>[0]['m'];
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

describe('the emergency queue: batch size and the mixed crisis stream', () => {
  /** Decides `n` cases at the open desk, returning the crisis each one was decided under. */
  const work = (store: ReturnType<typeof createBankStore>, role: StaffRoleId, n: number): IncidentId[] => {
    const seen: IncidentId[] = [];
    for (let i = 0; i < n; i++) {
      const s = store.getState();
      const id = s.staffIncident!.id;
      const head = buildTaskCase(role, workingTask(s.staffTask, true, id), s.staffTaskSeq, id);
      expect(s.staffTrain(head.id, head.expected, 3, 30).ok).toBe(true);
      seen.push(id);
    }
    return seen;
  };
  const deskWithCrisis = (batch: number, stream = false) => {
    let x = 0;
    const store = createBankStore({ storage: null, seed: 2026, incidentRandom: () => (x = (x + 0.37) % 1) });
    store.getState().openStaffDesk(ROLE_STATION.fds);
    store.getState().setCrisisBatch(batch);
    store.getState().setCrisisStream(stream);
    store.getState().setIncidentMode(true);
    return store;
  };

  it('keeps a crisis for exactly its batch of cases, then rolls a different one at once', () => {
    for (const batch of [3, 5, 10]) {
      const seen = work(deskWithCrisis(batch), 'fds', batch * 3);
      for (let k = 0; k < 3; k++) {
        const run = seen.slice(k * batch, (k + 1) * batch);
        expect(new Set(run).size, `batch ${batch} run ${k}`).toBe(1);
        if (k > 0) expect(run[0], `batch ${batch} run ${k}`).not.toBe(seen[k * batch - 1]);
      }
    }
  });

  it('in the mixed stream, switches crisis on every case and never repeats the one before', () => {
    for (const store of [deskWithCrisis(10, true), deskWithCrisis(1)]) {
      const seen = work(store, 'fds', 12);
      for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
      for (const id of seen) expect(crisisPool('fds')).toContain(id);
    }
  });

  it('never stops while Incident Mode is on, and stops at once when it is turned off', () => {
    const store = deskWithCrisis(3);
    work(store, 'fds', 40);
    expect(store.getState().staffIncident).not.toBeNull();
    store.getState().setIncidentMode(false);
    expect(store.getState().staffIncident).toBeNull();
  });

  it('bounds a custom batch, and counts the cases left in the running crisis', () => {
    expect(clampCrisisBatch(0)).toBe(CRISIS_BATCH.min);
    expect(clampCrisisBatch(999)).toBe(CRISIS_BATCH.max);
    expect(clampCrisisBatch(Number.NaN)).toBe(CRISIS_BATCH.default);
    expect(isCrisisStream(1, false)).toBe(true);
    expect(isCrisisStream(5, false)).toBe(false);
    const a = { id: 'FDS_BIN_STORM' as const, compliance: 100, reviews: 2 };
    expect(crisisCasesLeft(a, 5)).toBe(3);
    expect(crisisOver(a, 5, false)).toBe(false);
    expect(crisisOver({ ...a, reviews: 5 }, 5, false)).toBe(true);
    expect(crisisOver(a, 5, true)).toBe(true);
  });

  const handlers: Pick<AnalystWorkspaceViewProps, 'onClose' | 'onAdvance' | 'onDecide' | 'onTaskChange' | 'onSwitchRole'> = {
    onClose: () => undefined,
    onAdvance: () => undefined,
    onDecide: () => ({ result: { ok: false, packetId: '', decision: 'APPROVE' as const, expected: null, correct: false, statusCode: '' }, errors: 0 }),
    onTaskChange: () => undefined,
    onSwitchRole: () => undefined,
  };
  const view = (extra: Partial<AnalystWorkspaceViewProps>) =>
    renderToStaticMarkup(
      createElement(AnalystWorkspaceView, {
        desk: ROLE_STATION.fds,
        cases: taskDeck('fds', workingTask(1, true, 'FDS_BIN_STORM'), 0, 4, 'FDS_BIN_STORM'),
        shift: EMPTY_SHIFT,
        initialMode: 'standard',
        task: 1,
        canAdvance: true,
        incidentMode: true,
        incident: { id: 'FDS_BIN_STORM', compliance: 100, reviews: 2 },
        ...handlers,
        ...extra,
      }),
    );

  it('shows the batch picker and the stream switch with Incident Mode on, and the cases left in the banner', () => {
    const out = view({ crisisBatch: 5 });
    expect(out).toContain('data-testid="workspace-crisis-batch" data-batch="5"');
    for (const n of [3, 5, 10]) expect(out).toContain(`data-testid="workspace-crisis-batch-${n}"`);
    expect(out).toContain(esc(msgs.crisisBatchCustom.en));
    expect(out).toContain('data-testid="workspace-crisis-stream"');
    expect(out).toContain(esc(en('incidentShiftLeft', { n: 3 })));
    expect(msgs.incidentShiftLeft.vi).toBe('Kết thúc tình huống này (còn {n} hồ sơ)');
    expect(msgs.crisisStream.vi).toBe('🌀 Mô phỏng Đa luồng Khẩn cấp');
    const custom = view({ crisisBatch: 7 });
    expect(custom).toContain('data-batch="custom"');
    expect(custom).toContain('data-testid="workspace-crisis-batch-input"');
    const stream = view({ crisisBatch: 1 });
    expect(stream).toContain('data-stream="true"');
    expect(stream).toContain(esc(msgs.crisisStreamLeft.en));
  });

  it('keeps the toolbar and the desk below it in place when Incident Mode switches on', () => {
    const off = view({ incidentMode: false, incident: null });
    const on = view({ crisisBatch: 5 });
    const toolbar = (out: string) => out.slice(out.indexOf('data-testid="workspace-toolbar"'), out.indexOf('</header>'));
    const ids = (out: string) => [...toolbar(out).matchAll(/data-testid="([^"]+)"/g)].map((x) => x[1]).filter((id) => !id!.startsWith('workspace-crisis-batch-'));
    // The same controls, in the same order: the batch picker is only disabled while off.
    expect(ids(off)).toEqual(ids(on));
    expect(off).toMatch(/<fieldset disabled=""[^>]*data-testid="workspace-crisis-batch-group" data-disabled="true"/);
    expect(on.indexOf('workspace-crisis-batch-group')).toBeGreaterThan(on.indexOf('workspace-incident-toggle'));
    // One banner strip of one fixed height either way, and no alarm card pushing the case column down.
    const strip = (out: string, id: string) => {
      const at = out.indexOf(`data-testid="${id}"`);
      return out.slice(out.lastIndexOf('<div', at), out.indexOf('>', at));
    };
    expect(strip(off, 'workspace-incident-idle')).toContain('h-[112px]');
    expect(strip(on, 'workspace-incident')).toContain('h-[112px]');
    expect(on).toContain('data-testid="workspace-case-column"');
    expect(on.slice(on.lastIndexOf('<div', on.indexOf('data-testid="workspace-case-column"')))).toMatch(/^<div class="contents"/);
  });

  it('lays the header out in two fixed tiers: controls, then badges, ledger and audit', () => {
    for (const out of [view({ crisisBatch: 5 }), view({ incidentMode: false, incident: null })]) {
      const tier1 = out.slice(out.lastIndexOf('<div', out.indexOf('data-testid="workspace-toolbar"')), out.indexOf('data-testid="workspace-subheader"'));
      const tier2 = out.slice(out.lastIndexOf('<div', out.indexOf('data-testid="workspace-subheader"')), out.indexOf('</header>'));
      expect(tier1).toMatch(/^<div class="[^"]*flex-nowrap/);
      expect(tier2).toMatch(/^<div class="[^"]*flex-nowrap/);
      const order = ['workspace-incident-toggle', 'workspace-crisis-batch-group', 'workspace-crisis-stream', 'workspace-sound', 'workspace-language', 'workspace-mode', 'workspace-challenge'].map((id) => tier1.indexOf(id));
      for (const i of order) expect(i).toBeGreaterThan(-1);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      for (const id of ['workspace-badges', 'workspace-ledger-open', 'workspace-audit-open']) expect(tier2, id).toContain(id);
      expect(tier1).not.toContain('workspace-ledger-open');
    }
  });
});

describe('resetting the core ledger', () => {
  const sheet = (confirmOpen: boolean) => renderToStaticMarkup(createElement(CoreLedgerSheet, { ledger: openingLedger(), m: en, onClose: () => undefined, onReset: () => undefined, auditCount: 12, confirmOpen }));

  it('asks first, with the explicit wipe warning and what it erases', () => {
    expect(sheet(false)).not.toContain('workspace-ledger-reset-confirm');
    const out = sheet(true);
    expect(out).toContain('role="alertdialog"');
    expect(out).toContain(esc(msgs.ledgerResetWarning.en));
    expect(out).toContain(esc(en('ledgerResetCounts', { journals: 0, audit: 12 })));
    expect(out).toContain('data-testid="workspace-ledger-reset-ok"');
    expect(out).toContain('data-testid="workspace-ledger-reset-cancel"');
    expect(msgs.ledgerResetWarning.vi).toContain('Việc đặt lại số dư đầu kỳ sẽ xóa sạch toàn bộ lịch sử hạch toán.');
    expect(msgs.ledgerResetTitle.vi).toBe('⚠️ BÁO ĐỘNG XÓA DỮ LIỆU');
  });

  it('erases the ledger and the audit trail together', () => {
    const storage = memoryStorage();
    const store = createBankStore({ storage, seed: 2026 });
    store.getState().openStaffDesk(ROLE_STATION.swift);
    store.getState().setStaffTask(1);
    for (let i = 0; i < 3; i++) {
      const head = buildTaskCase('swift', 1, store.getState().staffTaskSeq);
      store.getState().staffTrain(head.id, head.expected, 3, 30);
    }
    expect(store.getState().auditLog.length).toBe(3);
    store.getState().resetRetailLedger();
    expect(store.getState().auditLog).toEqual([]);
    expect(createBankStore({ storage, seed: 2026 }).getState().auditLog).toEqual([]);
  });
});

describe('numeric GL codes in the Ctrl K search', () => {
  const CODES = ['1011', '1012', '1310', '1320', '1510', '1520', '1910', '1920', '2011', '2021', '2410', '2450', '2912', '2930', '3010'];

  it('finds every account by its number, bare or with a GL / TK / tài khoản prefix, and opens its row in the Knowledge Base', () => {
    for (const locale of ['en', 'vi'] as const) {
      const idx = buildSearchIndex('expert', locale);
      for (const code of CODES) {
        const acc = GL_ACCOUNTS.find((a) => a.code === code)!;
        expect(acc, code).toBeDefined();
        for (const q of [code, `GL ${code}`, `TK ${code}`, `tài khoản ${code}`, `#${code}`]) {
          const r = searchIndex(idx, q);
          expect(r.order[0], `${locale} ${q}`).toBe('kb');
          expect(r.groups.kb[0]!.action, `${locale} ${q}`).toEqual({ kind: 'knowledge', anchor: `gl-${acc.id}` });
        }
      }
    }
  });

  it('finds every acronym of the lookup table', () => {
    const idx = buildSearchIndex('expert', 'vi');
    for (const term of ['CTR', 'STR', 'SWIFT', 'BNPL', 'MDR', 'DTI', 'POS', 'eKYC', 'EOD']) {
      const r = searchIndex(idx, term);
      expect(r.groups.kb.some((e) => e.action.kind === 'knowledge' && e.action.anchor === `term-${term.toUpperCase()}`), term).toBe(true);
    }
    expect(glCodeQuery('so hieu 2930')).toBe('2930');
    expect(glCodeQuery('glossary')).toBe('glossary');
  });
});

describe('the Knowledge Base, Basic and Advanced', () => {
  it('puts the view and language switches in the title bar, governing the whole article', () => {
    const out = renderToStaticMarkup(createElement(KnowledgeHeaderControls, { view: 'advanced', onView: () => undefined }));
    expect(out).toContain('data-testid="kb-view" data-view="advanced"');
    expect(out).toContain('data-testid="kb-language"');
  });

  it('spells every section title out in full', () => {
    expect(CORE_LEDGER_ARTICLE.sections.map((s) => s.title.vi)).toEqual([
      '1. Nguyên tắc bút toán kép',
      '2. Hệ thống tài khoản',
      '3. Tài khoản nghiệp vụ và tài khoản trung gian',
      '4. Ví dụ dòng hạch toán chi tiết',
      '5. Từ viết tắt và mã hiệu tài khoản',
    ]);
    for (const s of CORE_LEDGER_ARTICLE.sections) expect(s.title.en, s.id).not.toMatch(/\bvs\.|\betc\./);
  });

  it('adds a deeper layer to all five sections in Advanced, in both languages', () => {
    for (const locale of ['en', 'vi'] as const) {
      setActiveLocale(locale);
      const basic = renderToStaticMarkup(createElement(CoreLedgerArticle, {}));
      const adv = renderToStaticMarkup(createElement(CoreLedgerArticle, { view: 'advanced' }));
      for (const s of CORE_LEDGER_ARTICLE.sections) {
        expect(s.advanced.length, s.id).toBeGreaterThan(0);
        expect(adv, `${locale} ${s.id}`).toContain(`data-advanced="${s.id}"`);
        expect(basic).not.toContain(`data-advanced="${s.id}"`);
        expect(adv).toContain(esc(s.advanced[0]![locale]));
      }
      for (const id of ['kb-formulas', 'kb-taxonomy', 'kb-buffers', 'kb-acronyms']) {
        expect(adv, `${locale} ${id}`).toContain(`data-testid="${id}"`);
        expect(basic).not.toContain(`data-testid="${id}"`);
      }
      expect(adv).toContain(esc(LEDGER_FORMULAS[0]!.formula[locale]));
    }
    setActiveLocale('en');
  });

  it('files every account in exactly one family of the taxonomy', () => {
    const filed = GL_TAXONOMY.flatMap((f) => f.accounts);
    expect([...filed].sort()).toEqual(GL_ACCOUNTS.map((a) => a.id).sort());
    expect(new Set(filed).size).toBe(filed.length);
  });

  it('explains how Nostro, ATM suspense, dispute and frozen funds fill and drain', () => {
    expect(BUFFER_MECHANICS.map((b) => GL_CODE[b.gl])).toEqual(['1520', '1910', '1920', '2930']);
    const adv = renderToStaticMarkup(createElement(CoreLedgerArticle, { view: 'advanced' }));
    for (const b of BUFFER_MECHANICS) expect(adv).toContain(`data-buffer="${b.gl}"`);
    for (const b of BUFFER_MECHANICS) expect([...b.fillJournal.dr, ...b.fillJournal.cr, ...b.drainJournal.dr, ...b.drainJournal.cr]).toContain(b.gl);
  });

  it('walks the ATM jam, SWIFT and dispute flows with amounts, and every watched buffer ends at zero', () => {
    const ids = CORE_LEDGER_ARTICLE.flows.map((f) => f.id);
    for (const id of ['flow-atm-jam', 'flow-swift', 'flow-dispute']) expect(ids).toContain(id);
    for (const f of CORE_LEDGER_ARTICLE.flows) for (const gl of f.watch) expect(flowBalances(f, gl).at(-1), `${f.id} ${gl}`).toBe(0);
    const atm = CORE_LEDGER_ARTICLE.flows.find((f) => f.id === 'flow-atm-jam')!;
    expect(flowBalances(atm, 'ATM_SUSPENSE')).toEqual([0, atm.sample, 0]);
    const adv = renderToStaticMarkup(createElement(CoreLedgerArticle, { view: 'advanced' }));
    expect(adv).toContain('data-balance="CLEARING_SUSPENSE" data-after="2070000"');
    expect(adv).toContain('$20,725.00');
  });

  it('maps every acronym to accounts its desk really posts to (or that a worked flow uses)', () => {
    const flowGls = new Set(CORE_LEDGER_ARTICLE.flows.flatMap((f) => f.steps.flatMap((s) => s.lines.map((l) => l.gl))));
    const posted = (role: StaffRoleId): Set<GlAccount> => {
      const out = new Set<GlAccount>();
      for (let seq = 0; seq < 24; seq++)
        for (const c of [...STAFF_DRILLS.map((d) => buildTaskCase(role, d, seq)), buildRetailCase(role, seq)])
          for (const d of ['APPROVE', 'REJECT'] as const) for (const l of gradeTaskCase(c, d).journal?.lines ?? []) out.add(l.gl);
      return out;
    };
    for (const term of ['CTR', 'STR', 'SWIFT', 'BNPL', 'MDR', 'DTI', 'POS', 'EKYC', 'EOD']) expect(ACRONYM_GL[term], term).toBeDefined();
    for (const [term, row] of Object.entries(ACRONYM_GL)) {
      if (!row.role) continue;
      const desk = posted(row.role);
      for (const gl of row.gls) expect(desk.has(gl) || flowGls.has(gl), `${term} ${gl}`).toBe(true);
    }
    const adv = renderToStaticMarkup(createElement(CoreLedgerArticle, { view: 'advanced' }));
    const ctr = adv.slice(adv.indexOf('data-acronym="CTR"'), adv.indexOf('</tr>', adv.indexOf('data-acronym="CTR"')));
    expect(ctr).toContain('>1012<');
    expect(ctr).toContain(esc(msgs.role_cashier_title.en));
    expect(kb.colGlAccounts.vi).toBeTruthy();
  });
});

describe('one shared segmented switch', () => {
  it('draws a radio group with the state on the group and a radio per option', () => {
    const out = renderToStaticMarkup(createElement(SegmentedToggle<'a' | 'b'>, { label: 'Pick', value: 'b', onChange: () => undefined, testId: 'x', stateKey: 'pick', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', badge: 3 }] }));
    expect(out).toContain('role="radiogroup" aria-label="Pick"');
    expect(out).toContain('data-testid="x" data-pick="b"');
    expect(out).toMatch(/aria-checked="true"[^>]*data-testid="x-b"/);
    expect(out).toMatch(/aria-checked="false"[^>]*data-testid="x-a"/);
  });

  it('is the only place in the app that builds a segmented radio group or a language switch', () => {
    const sources = import.meta.glob('../../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const groups = Object.entries(sources).filter(([path, src]) => !path.includes('__tests__') && /role="radiogroup"/.test(src)).map(([path]) => path.split('/').pop());
    // The academy quiz is a list of answers, not a switch.
    expect(groups.sort()).toEqual(['AcademyStudy.tsx', 'SegmentedToggle.tsx']);
    const languages = Object.entries(sources).filter(([path, src]) => !path.includes('__tests__') && /setLocale\(/.test(src)).map(([path]) => path.split('/').pop());
    expect(languages).toEqual(['LanguageToggle.tsx']);
  });
});

describe('BPMN collector gateways on the map', () => {
  it('collects the long declines, the band approvals and the night handovers, each into one trunk', () => {
    const byId = new Map(GATEWAYS.map((g) => [g.id, g]));
    // Local collectors beside the band's desks cascade into one trunk that joins 3DS at the reject gateway.
    expect(byId.get('GATEWAY_XOR_REJECT_ROW1')!.wires).toHaveLength(4);
    expect(['GATEWAY_XOR_REJECT_ROW2_A', 'GATEWAY_XOR_REJECT_ROW2_B', 'GATEWAY_XOR_REJECT_ROW2_C'].flatMap((id) => byId.get(id as never)!.wires)).toHaveLength(4);
    expect(gatewayCarries(byId.get('GATEWAY_XOR_REJECT_BAND')!)).toHaveLength(8);
    expect(byId.get('GATEWAY_XOR_REJECT_BAND')!.into).toBe('GATEWAY_XOR_REJECT');
    for (const g of GATEWAYS) expect(g.half, g.id).toBe(GATEWAY_HALF);
    expect(byId.get('GATEWAY_XOR_REJECT')!.wires).toEqual(['SEC_3DS>OUT_DECLINED']);
    expect(gatewayCarries(byId.get('GATEWAY_XOR_REJECT')!)).toHaveLength(9);
    expect(byId.get('GATEWAY_XOR_APPROVE')!.wires).toHaveLength(5);
    expect(byId.get('GATEWAY_XOR_NIGHT')!.wires).toEqual(['RECON>OUT_SETTLED', 'SUSPENSE>OUT_SETTLED']);
    for (const g of GATEWAYS) {
      const end = g.trunk.at(-1)!;
      const next = g.into ? byId.get(g.into)! : null;
      const b = PLACE_BOX[g.to];
      if (next) expect(Math.abs(end[0] - next.cx) + Math.abs(end[1] - next.cy), g.id).toBe(next.half);
      else expect(end[0] === b.cx - b.w / 2 || end[0] === b.cx + b.w / 2 || end[1] === b.cy - b.h / 2 || end[1] === b.cy + b.h / 2, g.id).toBe(true);
      let final = g;
      while (final.into) final = byId.get(final.into)!;
      const last = final.trunk.at(-1)!;
      const ends = new Set<string>();
      for (const id of g.wires) {
        const w = BANK_WIRES.find((x) => x.id === id)!;
        expect(w.gateway, id).toBe(g.id);
        expect(w.to, id).toBe(g.to);
        const tip = w.drawPoints.at(-1)!;
        // On the diamond's edge: a merging gateway's feeders all meet its corner, the others each at their own point.
        expect(Math.abs(tip[0] - g.cx) + Math.abs(tip[1] - g.cy), id).toBe(g.half);
        if (g.merge) expect(tip[0] === g.cx || tip[1] === g.cy, id).toBe(true);
        ends.add(tip.join(','));
        // The packet's path still runs all the way, through every diamond and down the last trunk.
        expect(w.points.at(-1), id).toEqual(last);
      }
      expect(ends.size, g.id).toBe(g.merge ? 1 : g.wires.length);
    }
  });

  it('lights only the paths of the node under the pointer', () => {
    expect(connectedWires(null)).toBeNull();
    const lit = connectedWires('SEC_FDS')!;
    expect([...lit].sort()).toEqual(BANK_WIRES.filter((w) => w.from === 'SEC_FDS' || w.to === 'SEC_FDS').map((w) => w.id).sort());
    expect(lit.has('SEC_FDS>OUT_DECLINED')).toBe(true);
    expect(lit.has('GATE_ATM>OUT_DECLINED')).toBe(false);
  });
});

describe('readability pass: the Knowledge Base cards, balances and Advanced depth', () => {
  it('gives every ledger account a card in Section 3, with a filter by number or name', () => {
    const all = renderToStaticMarkup(createElement(CoreLedgerArticle, {}));
    for (const a of GL_ACCOUNTS) expect(all, a.code).toContain(`data-account-card="${a.id}"`);
    expect(all).toContain('data-testid="kb-account-filter"');
    const one = renderToStaticMarkup(createElement(CoreLedgerArticle, { accountQuery: '1011' }));
    expect(one.match(/data-account-card=/g)).toHaveLength(1);
    expect(one).toContain('data-account-card="ATM_CASH"');
    const byName = renderToStaticMarkup(createElement(CoreLedgerArticle, { accountQuery: 'nostro' }));
    expect(byName).toContain('data-account-card="NOSTRO"');
    const none = renderToStaticMarkup(createElement(CoreLedgerArticle, { accountQuery: 'zzzz' }));
    expect(none).not.toContain('data-account-card=');
    expect(none).toContain(esc(kb.cardsNone.en.replace('{q}', 'zzzz')));
  });

  it('shows the balance after each step in Basic and Advanced alike', () => {
    expect(kb.balanceAfter.vi).toContain('Số dư sau bước này');
    for (const view of ['basic', 'advanced'] as const) expect(renderToStaticMarkup(createElement(CoreLedgerArticle, { view }))).toContain('data-balance="ATM_SUSPENSE"');
  });

  it('in Advanced, adds statement effects, the regulatory thresholds and the internal controls', () => {
    const basic = renderToStaticMarkup(createElement(CoreLedgerArticle, {}));
    const adv = renderToStaticMarkup(createElement(CoreLedgerArticle, { view: 'advanced' }));
    for (const id of ['kb-regulations', 'kb-controls']) {
      expect(adv).toContain(`data-testid="${id}"`);
      expect(basic).not.toContain(`data-testid="${id}"`);
    }
    expect(adv).toContain('data-statement="balance"');
    expect(adv).toContain('data-statement="income"');
    expect(adv).toContain('$10,000.00');
    expect(adv).toContain('data-rule="vn-large-value"');
    // Amounts and the balance sheet / income statement badges are in both views.
    expect(basic).toContain('data-statement="balance"');
    expect(basic).toContain('$140.00');
    expect(basic).toContain(esc(`${kb.statementBalance.en} - 2011 ↓ $140.00`));
    expect(adv).toContain('data-rule="au-ttr"');
  });

  it('says why every account of the acronym table belongs to its acronym', () => {
    for (const [term, row] of Object.entries(ACRONYM_GL)) for (const gl of row.gls) expect(ACRONYM_GL_WHY[term]?.[gl]?.vi, `${term} ${gl}`).toBeTruthy();
    expect(ACRONYM_GL_WHY.SWIFT!.NOSTRO!.en).toContain('nostro');
    const adv = renderToStaticMarkup(createElement(CoreLedgerArticle, { view: 'advanced' }));
    const swift = adv.slice(adv.indexOf('data-acronym="SWIFT"'), adv.indexOf('</tr>', adv.indexOf('data-acronym="SWIFT"')));
    expect(swift).toMatch(/tabindex="0"[^>]*data-gl="NOSTRO" aria-describedby=/);
    expect(swift).toContain(esc(ACRONYM_GL_WHY.SWIFT!.NOSTRO!.en));
  });
});

describe('readability pass: the map legend and one switch for the dock', () => {
  it('opens a legend of the lines, gateways, frames and wire words', async () => {
    const { MapLegend } = await import('../BankMap');
    const closed = renderToStaticMarkup(createElement(MapLegend, { top: 60, right: 80 }));
    expect(closed).toContain('data-testid="map-legend-open"');
    // Top-right of the viewport, never the bottom-left.
    expect(closed).toContain('top:60px;right:80px');
    expect(closed).not.toMatch(/left-3|bottom:/);
    const open = renderToStaticMarkup(createElement(MapLegend, { initiallyOpen: true }));
    for (const key of ['lineReject', 'lineApprove', 'lineNight', 'lineOtp', 'gateway', 'frame']) expect(open).toContain(`data-legend="${key}"`);
    for (const term of ['CTR', 'STR', 'clean', 'released', 'refund']) expect(open).toContain(`data-legend-term="${term}"`);
  });

  it('passes the bundle checks', async () => {
    const { bundleProblems } = await import('../../../utils/i18nHelper');
    const { mapLegendMessages } = await import('../mapLegend.messages');
    const { viewModeMessages } = await import('../../shell/viewModeToggle.messages');
    expect(bundleProblems(mapLegendMessages)).toEqual([]);
    expect(bundleProblems(viewModeMessages)).toEqual([]);
    expect(bundleProblems(knowledgeBaseMessages)).toEqual([]);
    expect(bundleProblems(analystWorkspaceMessages)).toEqual([]);
  });

  it('leaves no hand-made two-way switch behind in the dock or the Build Lab', () => {
    const sources = import.meta.glob('../*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    for (const file of ['../ViewportControls.tsx', '../ViewControls.tsx']) {
      expect(sources[file], file).toContain('<SegmentedToggle');
      expect(sources[file], file).not.toMatch(/function (Pill|Segmented)</);
    }
  });
});

describe('every edge on the map says what it means', () => {
  it('labels every wire, shows every label, and has it in Vietnamese too', () => {
    for (const [from, to, label] of WIRES) {
      expect(label, `${from}>${to}`).toBeTruthy();
      expect(VI_DICTIONARY[label!], label).toBeTruthy();
      expect(VI_DICTIONARY[label!], label).not.toBe(label);
    }
    for (const w of BANK_WIRES) expect(w.showLabel, w.id).toBe(true);
  });

  it('says what the routes in the brief say', () => {
    const vi = (id: string) => VI_DICTIONARY[BANK_WIRES.find((w) => w.id === id)!.label!];
    expect(vi('GATE_POS>LEDGER_DEBIT')).toBe('Thẻ ghi nợ (Debit)');
    expect(vi('GATE_POS>LEDGER_CREDIT')).toBe('Thẻ tín dụng (Credit)');
    expect(vi('GATE_ECOM>SEC_3DS')).toBe('Xác thực OTP SMS');
    expect(vi('GATE_ECOM>BNPL')).toBe('Trả góp BNPL');
    expect(vi('GATE_SWIFT>SEC_FDS')).toBe('Rà soát AML & Cấm vận (Sanctions Check)');
    expect(vi('DISPUTE_DESK>OUT_DECLINED')).toBe('Rủi ro cao / Từ chối bồi hoàn');
  });

  it('keeps a callout close to the wire it belongs to', () => {
    for (const w of BANK_WIRES) {
      const a = w.labelAnchor ?? w.labelAt;
      expect(Math.hypot(a[0] - w.labelAt[0], a[1] - w.labelAt[1]), w.id).toBeLessThan(110);
    }
  });
});

describe('a calmer map for a first-time learner', () => {
  type P = readonly [number, number];
  /** Whether two axis-aligned segments cross (touching at an end does not count). */
  const cross = ([a, b]: readonly [P, P], [c, d]: readonly [P, P]): boolean => {
    const h1 = a[1] === b[1];
    const h2 = c[1] === d[1];
    if (h1 === h2) return false;
    const [h, v] = h1 ? [[a, b], [c, d]] : [[c, d], [a, b]];
    const x = v[0]![0];
    const y = h[0]![1];
    return x > Math.min(h[0]![0], h[1]![0]) && x < Math.max(h[0]![0], h[1]![0]) && y > Math.min(v[0]![1], v[1]![1]) && y < Math.max(v[0]![1], v[1]![1]);
  };
  const segs = (p: readonly P[]) => p.slice(1).map((b, i) => [p[i]!, b] as const);

  it('routes the OTP out and back on side-by-side channels that never cross', () => {
    const out = BANK_WIRES.find((w) => w.id === 'SEC_3DS>CUSTOMER_OTP')!;
    const back = BANK_WIRES.find((w) => w.id === 'CUSTOMER_OTP>SEC_3DS')!;
    for (const a of segs(out.drawPoints)) for (const b of segs(back.drawPoints)) expect(cross(a, b)).toBe(false);
  });

  it('merges the row-1 declines and the band approvals into one stroke into their gateway', () => {
    for (const id of ['GATEWAY_XOR_REJECT_ROW1', 'GATEWAY_XOR_APPROVE'] as const) {
      const g = GATEWAYS.find((x) => x.id === id)!;
      expect(g.merge, id).toBe(true);
      const tips = new Set(g.wires.map((w) => BANK_WIRES.find((x) => x.id === w)!.drawPoints.at(-1)!.join(',')));
      expect(tips.size, id).toBe(1);
    }
    // Their dashes start at the diamond, so the shared stroke reads as one line.
    for (const w of BANK_WIRES.filter((x) => x.gateway)) expect(w.strokePath, w.id).toBeTruthy();
  });

  it('hides decline conditions until their line or desk is pointed at, and keeps every other label on show', () => {
    for (const w of BANK_WIRES) expect(w.revealOnly ?? false, w.id).toBe(w.to === 'OUT_DECLINED');
    const sources = import.meta.glob('../BankMap.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(sources['../BankMap.tsx']).toMatch(/if \(w\.revealOnly && !lit && !traced\) return null;/);
  });

  it('keeps desk icons one size in every vocabulary, and the tooltip opaque with title, definition and status', () => {
    const src = (import.meta.glob('../BankMap.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['../BankMap.tsx']!;
    expect(src).not.toMatch(/long \? 'h-\[\d+px\] w-\[\d+px\]'/);
    expect(src.match(/className=\{DESK_ICON\}/g)).toHaveLength(2);
    for (const part of ['title', 'definition', 'status']) expect(src).toContain(`data-tip="${part}"`);
    expect(src).toMatch(/bk-hovertip [^`]*bg-slate-900[^`]*opacity-100/);
    expect(src).toContain("'opacity-50 hover:opacity-100 has-[:focus-visible]:opacity-100'");
  });
});

describe('cleaner nodes and labels near the desk they belong to', () => {
  it('draws the joins partway along the one-line trunk as junction dots, keeping diamonds where lines really meet', () => {
    const junctions = GATEWAYS.filter((g) => g.junction).map((g) => g.id).sort();
    expect(junctions).toEqual(['GATEWAY_XOR_REJECT_BAND', 'GATEWAY_XOR_REJECT_ROW2_B', 'GATEWAY_XOR_REJECT_ROW2_C']);
    for (const id of junctions) {
      const g = GATEWAYS.find((x) => x.id === id)!;
      const spokes = GATEWAY_SPOKES[id]!;
      // A spoke from every arriving line, and one on to the trunk: the bus is unbroken.
      for (const w of BANK_WIRES.filter((x) => x.gateway === id)) expect(spokes, w.id).toContain(`M${w.drawPoints.at(-1)!.join(' ')}L${g.cx} ${g.cy}`);
      for (const o of GATEWAYS.filter((x) => x.into === id)) expect(spokes, o.id).toContain(`M${o.trunk.at(-1)!.join(' ')}L${g.cx} ${g.cy}`);
      expect(spokes).toContain(`M${g.cx} ${g.cy}L${g.trunk[0]!.join(' ')}`);
    }
    for (const id of ['GATEWAY_XOR_REJECT', 'GATEWAY_XOR_REJECT_ROW1', 'GATEWAY_XOR_REJECT_ROW2_A', 'GATEWAY_XOR_APPROVE', 'GATEWAY_XOR_NIGHT']) expect(GATEWAYS.find((g) => g.id === id)!.junction ?? false, id).toBe(false);
  });

  it('puts the SWIFT, eKYC and VietQR decline conditions right above their own desk, clear of every other line', () => {
    const strokes = [...BANK_WIRES.map((w) => ({ id: w.id, p: w.drawPoints })), ...GATEWAYS.map((g) => ({ id: g.id, p: g.trunk }))];
    for (const id of ['GATE_SWIFT>OUT_DECLINED', 'GATE_EKYC>OUT_DECLINED', 'GATE_QR>OUT_DECLINED']) {
      const w = BANK_WIRES.find((x) => x.id === id)!;
      const src = PLACE_BOX[w.from];
      expect(Math.abs(w.labelAt[0] - src.cx), id).toBeLessThanOrEqual(src.w / 2);
      expect(src.cy - src.h / 2 - w.labelAt[1], id).toBeGreaterThan(0);
      expect(src.cy - src.h / 2 - w.labelAt[1], id).toBeLessThan(100);
      const b = labelPill(labelChars(w.label!), w.labelAt);
      const over = strokes.filter((st) => st.id !== w.id && st.p.slice(1).some(([bx, by], i) => {
        const [ax, ay] = st.p[i]!;
        return Math.min(ax, bx) < b.x1 + 2 && Math.max(ax, bx) > b.x0 - 2 && Math.min(ay, by) < b.y1 + 2 && Math.max(ay, by) > b.y0 - 2;
      }));
      expect(over.map((x) => x.id), id).toEqual([]);
    }
  });

  it('keeps each desk card on fixed rows and says "N waiting" on every desk', () => {
    const src = (import.meta.glob('../BankMap.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['../BankMap.tsx']!;
    expect(src).not.toMatch(/\blong \?/);
    expect(src).toContain('className="flex h-[24px] shrink-0 items-start gap-1.5" data-testid={`station-title-${id}`}');
    expect(src).toContain("const unit = t('waiting');");
    expect(src).not.toContain("t('items')");
    expect(VI_DICTIONARY.waiting).toBe('đang chờ');
  });
});
