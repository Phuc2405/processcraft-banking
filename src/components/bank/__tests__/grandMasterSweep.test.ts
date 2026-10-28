import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ACRONYM_GL, BUFFER_MECHANICS, CORE_LEDGER_ARTICLE, flowBalances, GL_TAXONOMY, LEDGER_FORMULAS } from '../../../data/knowledgeBase';
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
import { BANK_WIRES, connectedWires, gatewayCarries, GATEWAYS, PLACE_BOX } from '../layout';
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
    // The band's eight declines meet a local collector under the band; its one trunk joins 3DS at the reject gateway.
    expect(byId.get('GATEWAY_XOR_REJECT_BAND')!.wires).toHaveLength(8);
    expect(byId.get('GATEWAY_XOR_REJECT_BAND')!.into).toBe('GATEWAY_XOR_REJECT');
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
      const last = (next ?? g).trunk.at(-1)!;
      const ends = new Set<string>();
      for (const id of g.wires) {
        const w = BANK_WIRES.find((x) => x.id === id)!;
        expect(w.gateway, id).toBe(g.id);
        expect(w.to, id).toBe(g.to);
        const tip = w.drawPoints.at(-1)!;
        // On the diamond's edge, each feeder at its own point.
        expect(Math.abs(tip[0] - g.cx) + Math.abs(tip[1] - g.cy), id).toBe(g.half);
        ends.add(tip.join(','));
        // The packet's path still runs all the way, through every diamond and down the last trunk.
        expect(w.points.at(-1), id).toEqual(last);
      }
      expect(ends.size, g.id).toBe(g.wires.length);
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
    expect(basic).not.toContain('data-statement=');
  });
});

describe('readability pass: the map legend and one switch for the dock', () => {
  it('opens a legend of the lines, gateways, frames and wire words', async () => {
    const { MapLegend } = await import('../BankMap');
    const closed = renderToStaticMarkup(createElement(MapLegend, {}));
    expect(closed).toContain('data-testid="map-legend-open"');
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
