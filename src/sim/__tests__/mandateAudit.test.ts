/**
 * The regression net for the production-polish mandate: balanced pass/fail coverage in every sub-process, the named edge cases,
 * strict pause isolation, 24/7 digital channels against counter hours, the Australian regulatory mapping, the non-clickable
 * authority badges, the flashcard format and the WebGL safety helpers.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { executeDemo, releaseDueDemos, runDemo, stayForShift } from '../../components/bank/retailOpsActions';
import { RegulatoryRegistry } from '../../components/knowledge/RegulatoryRegistry';
import { Flashcard, flashcardPoints } from '../../components/knowledge/RetailOpsStudy';
import { retailOpsMessages } from '../../components/bank/retailOps.messages';
import { bindContextEvents, disposeObject, disposeRenderer, type ContextTarget } from '../../components/bank/office/webglSafety';
import { AU_AUTHORITIES, documentsOfAuthority, REG_DOCUMENTS, REGULATORS, regulatorById, SOURCE_URLS, sourceLink } from '../../data/regulatoryRegistry';
import { RETAIL_FLASHCARDS } from '../../data/retailFlashcards';
import { advanceMotion, motion } from '../../engine/simulation/motion';
import { setActiveLocale } from '../../i18n/localeCore';
import { declineLabel } from '../../i18n/reportVi';
import type { DeclineReason } from '../types';
import { bankStore } from '../../store/bankStore';
import { deskVisitStore } from '../../store/deskVisitStore';
import { retailOpsStore } from '../../store/retailOpsStore';
import { shiftQueueStore } from '../../store/shiftQueueStore';
import { EOD_START, WORK_END, WORK_START } from '../clock';
import { ALL_DEMO_ACTIONS, demoActionById, type DemoActionId } from '../demoActions';
import { DEMO_GROUPS } from '../demoGroups';
import { shiftOf, shiftSnap } from '../demoSchedule';
import { presetById, presetTextIn } from '../presets';
import type { OpsActionId } from '../retailOps';

const PASS = new Set(['success', 'primary']);
const FAIL = new Set(['danger', 'warning']);

describe('every sub-process shows both sides of its decision', () => {
  it('has at least one pass and one fail scenario in every child sub-group of flows 01-08', () => {
    for (const g of DEMO_GROUPS) {
      const members = ALL_DEMO_ACTIONS.filter((a) => a.group === g.id);
      // A single-button night batch (EOD) has nothing to decline; every other group must carry both.
      if (members.length < 2) continue;
      expect(members.some((a) => PASS.has(a.variant)), `${g.id} pass`).toBe(true);
      expect(members.some((a) => FAIL.has(a.variant)), `${g.id} fail`).toBe(true);
    }
  });

  const run = (id: OpsActionId) => {
    retailOpsStore.getState().reset();
    retailOpsStore.getState().runAction(id, 'D1 10:00');
    return retailOpsStore.getState().last!;
  };
  const lines = (id: OpsActionId) => run(id).journal?.lines.map((l) => `${l.dr ? 'dr' : 'cr'} ${l.account} ${l.dr || l.cr}`) ?? [];

  it('declines a bill for funds (51) with the NSF fee, and auto-reverses a biller timeout (68) without posting', () => {
    expect(run('bill-nsf-51').status).toBe('DECLINED');
    expect(lines('bill-nsf-51')).toEqual(['dr CASA 1500', 'cr NSF_INCOME 1500']);
    const timeout = run('bill-timeout-68');
    expect(timeout.status).toBe('DECLINED');
    expect(timeout.journal).toBeFalsy();
    expect(timeout.message.vi).toMatch(/68/);
  });

  it('fails to collect a card fee from an empty account', () => {
    expect(run('fee-collect-fail').status).toBe('DECLINED');
  });

  it('refuses Pay-in-4 on bad debt at the credit bureau (CIC group 3)', () => {
    expect(run('bnpl-decline-cic').status).toBe('DECLINED');
    expect(demoActionById('bnpl-decline-cic').label()).toMatch(/CIC|bureau/i);
  });

  it('moves a missed repayment overdue with a $25 late penalty, provisions group 5 at 100%, and cures back to group 1', () => {
    expect(run('waterfall-nsf').status).toBe('DECLINED');
    expect(lines('waterfall-nsf')).toEqual(['dr OVERDRAFT 2500', 'cr NSF_INCOME 2500']);
    const g5 = run('risk-migrate-group5');
    expect(g5.message.en).toMatch(/100%/);
    expect(lines('risk-migrate-group5')[0]).toMatch(/^dr PROVISION_EXPENSE/);
    const cure = run('risk-cure');
    expect(cure.status).toBe('APPROVED');
    expect(lines('risk-cure')[0]).toMatch(/^dr ALLOWANCE/);
  });

  it('holds counterfeit notes at the cash counter without crediting the customer', () => {
    const r = run('teller-counterfeit');
    expect(r.status).toBe('DECLINED');
    expect(r.journal).toBeFalsy();
  });

  it('refuses a pledged savings book and an ID/signature mismatch, and reports a collateral shortfall', () => {
    expect(run('td-break-pledged').status).toBe('DECLINED');
    expect(run('td-break-id-mismatch').status).toBe('DECLINED');
    const s = run('collateral-shortfall');
    expect(s.status).toBe('ALERT');
    expect(s.message.en).toMatch(/\$1,500\.00/);
  });

  it('refuses a wallet top-up from an account in another name', () => {
    expect(run('wallet-name-mismatch').status).toBe('DECLINED');
  });

  it('rejects a chargeback / return claim when the funds were already withdrawn, and freezes a SWIFT sanction hit', () => {
    bankStore.getState().resetDay();
    bankStore.getState().skipTo(WORK_START + 60);
    executeDemo('claim-rejected');
    expect(bankStore.getState().presetTrace!.plan).toMatchObject({ outcome: 'DECLINED', decline: 'DISPUTE_REJECTED' });
    executeDemo('swift-sanction');
    expect(bankStore.getState().presetTrace!.plan).toMatchObject({ outcome: 'DECLINED', decline: 'AML_SANCTION_MATCH' });
  });
});

describe('professional Vietnamese terminology', () => {
  it('labels the SWIFT sanction hold, and the decline codes, in Vietnamese', () => {
    expect(presetTextIn(presetById('swift-sanction')!, 'vi').label).toBe('Tạm dừng kiểm tra Cấm vận SWIFT (AML/OFAC)');
    setActiveLocale('vi');
    expect(declineLabel('AML_SANCTION_MATCH', '')).toBe('Tạm dừng kiểm tra Cấm vận (AML/OFAC)');
    const codes: DeclineReason[] = ['FUNDS', 'AML_SANCTION_MATCH', 'FDS_HIGH_RISK_DEVICE', 'SWIFT_INVALID', 'DISPUTE_REJECTED', 'ACCOUNT_FROZEN', 'OTP_LOCKED', 'DAILY_LIMIT', 'BIOMETRIC_AUTH_REQUIRED', 'TELLER_SUSPECT_NOTE'];
    for (const code of codes) expect(declineLabel(code, code), code).not.toMatch(/^[A-Z0-9_]+$/);
    setActiveLocale('en');
  });

  it('leaves no English decision words in any Vietnamese button label', () => {
    setActiveLocale('vi');
    const english = /\b(Hold|Sanction|Declined|Approved|Timeout|Reversal|Insufficient|Rejected|Frozen|Withdraw|Deposit|Shortfall|Mismatch|Counterfeit)\b/;
    for (const a of ALL_DEMO_ACTIONS) expect(a.label(), a.id).not.toMatch(english);
    setActiveLocale('en');
  });
});

describe('24/7 digital channels and day counter flows', () => {
  beforeEach(() => {
    bankStore.getState().resetDay();
    shiftQueueStore.getState().clear();
    retailOpsStore.getState().reset();
    deskVisitStore.getState().clear();
  });

  const DIGITAL: readonly DemoActionId[] = ['qr-780', 'qr-rooted', 'wallet-cashin-100', 'wallet-name-mismatch', 'pos-20', 'token-45', 'otp-250', 'ekyc-open', 'swift-6800'];
  const COUNTER: readonly DemoActionId[] = ['teller-12k', 'teller-counterfeit', 'claim-rejected', 'td-break-pledged', 'collateral-shortfall', 'bnpl-decline-cic'];

  it('classifies VietQR, FacePay, cards, 3DS, wallets, eKYC and transfers as 24/7, and the counters as day work', () => {
    for (const id of DIGITAL) expect(shiftOf(id), id).toBe('always');
    for (const id of COUNTER) expect(shiftOf(id), id).toBe('day');
  });

  it.each([20 * 60, 22 * 60 + 30, EOD_START + 30])('runs every digital channel at %i minutes with no time prompt, to completion', (minute) => {
    for (const id of DIGITAL) {
      bankStore.getState().resetDay();
      bankStore.getState().skipTo(minute);
      runDemo(id);
      expect(shiftQueueStore.getState().prompt, id).toBeNull();
      for (let i = 0; i < 200 && !bankStore.getState().presetTrace?.done; i++) bankStore.getState().tickBeat();
      expect(bankStore.getState().presetTrace?.done, id).toBe(true);
    }
  });

  it('runs a digital channel even after midnight, rolling the bank into the next day', () => {
    bankStore.getState().skipTo(EOD_START);
    bankStore.getState().skipToEndOfDay();
    expect(bankStore.getState().view.dayOver).toBe(true);
    const day = bankStore.getState().view.day;
    runDemo('qr-780');
    expect(shiftQueueStore.getState().prompt).toBeNull();
    expect(bankStore.getState().view.day).toBe(day + 1);
    expect(bankStore.getState().presetTrace).not.toBeNull();
  });

  it('asks the Day Counter Flows question for a counter task outside 09:00-17:00', () => {
    for (const minute of [WORK_START - 30, WORK_END + 60]) {
      for (const id of COUNTER) {
        expect(shiftSnap(id, minute)?.shift, `${id} ${minute}`).toBe('day');
        bankStore.getState().resetDay();
        shiftQueueStore.getState().clear();
        bankStore.getState().skipTo(minute);
        runDemo(id);
        expect(shiftQueueStore.getState().prompt?.id, `${id} ${minute}`).toBe(id);
      }
    }
    expect(shiftSnap('teller-12k', WORK_START + 60)).toBeNull();
  });

  it('brings the case customer to the teller and the disputes desk for a counter preset', () => {
    bankStore.getState().skipTo(WORK_START + 30);
    executeDemo('teller-12k');
    expect(deskVisitStore.getState().visits.map((v) => v.step.desk)).toEqual(['TELLER_CASH']);
    executeDemo('claim-rejected');
    expect(deskVisitStore.getState().visits.map((v) => v.step.desk)).toEqual(['DISPUTE_DESK']);
  });
});

describe('strict pause isolation', () => {
  beforeEach(() => {
    bankStore.getState().resetDay();
    shiftQueueStore.getState().clear();
    retailOpsStore.getState().reset();
    deskVisitStore.getState().clear();
  });

  const finished = () => {
    const k = bankStore.getState().view.kpis;
    return k.approved + k.declined;
  };

  it('processes nothing while paused through view toggles, flow and sub-process switches, and time-slider drags', () => {
    const s = () => bankStore.getState();
    s().skipTo(WORK_START + 120);
    expect(s().playing).toBe(false);
    const before = { done: finished(), minute: s().view.minute, inFlight: s().sim.snapshot().inFlight };
    s().setViewMode('3d');
    s().setActiveFlow(7);
    s().selectSubProcess('wallet-qr', 7);
    s().setViewMode('2d');
    s().setActiveFlow(6);
    expect(s().playing).toBe(false);
    expect(finished()).toBe(before.done);
    expect(s().view.minute).toBe(before.minute);
    expect(s().sim.snapshot().inFlight).toBe(before.inFlight);
    // Dragging the slider replays to the new minute but leaves the bank paused, with nothing in motion afterwards.
    s().scrubTo(WORK_START + 200);
    const after = { done: finished(), minute: s().view.minute };
    s().setViewMode('3d');
    s().setViewMode('2d');
    expect(s().playing).toBe(false);
    expect(finished()).toBe(after.done);
    expect(s().view.minute).toBe(after.minute);
  });

  it('never releases a queued counter task while paused, only once Play is pressed', () => {
    bankStore.getState().skipTo(WORK_START - 60);
    runDemo('td-break-pledged');
    stayForShift();
    bankStore.getState().skipTo(WORK_START + 15);
    releaseDueDemos();
    expect(shiftQueueStore.getState().waiting.map((w) => w.id)).toEqual(['td-break-pledged']);
    bankStore.getState().play();
    releaseDueDemos();
    bankStore.getState().pause();
    expect(shiftQueueStore.getState().waiting).toHaveLength(0);
  });

  it('keeps the 3D motion clock still while paused, whatever the frame time', () => {
    const t0 = motion.t;
    const ms0 = motion.ms;
    for (let i = 0; i < 30; i++) advanceMotion(1 / 60, false, 5);
    expect(motion.t).toBe(t0);
    expect(motion.ms).toBe(ms0);
    advanceMotion(1 / 60, true, 1);
    expect(motion.t).toBeGreaterThan(t0);
  });
});

describe('the Australian regulatory registry', () => {
  it('names AUSTRAC, APRA, ASIC and AFCA, each with documents mapped to runnable scenarios', () => {
    const known = new Set(ALL_DEMO_ACTIONS.map((a) => a.id));
    for (const id of AU_AUTHORITIES) {
      const r = regulatorById(id);
      expect(r?.jurisdiction, id).toBe('AU');
      const docs = documentsOfAuthority(id);
      expect(docs.length, id).toBeGreaterThan(0);
      for (const d of docs) for (const s of d.scenarios) expect(known.has(s), `${d.id} -> ${s}`).toBe(true);
    }
  });

  it('covers the AML/CTF Act and its reports, the Banking Act and the APRA standards, the ASIC regime and AFCA', () => {
    const au = new Set(REG_DOCUMENTS.filter((d) => d.jurisdiction === 'AU').map((d) => d.id));
    for (const id of ['au-amlctf-2006', 'au-austrac-rules', 'au-ttr', 'au-smr', 'au-ifti', 'au-banking-act-1959', 'au-cps-230', 'au-cps-234', 'au-aps-110', 'au-aps-210', 'au-aps-220', 'au-corps-act-2001', 'au-nccp-2009', 'au-rg-209', 'au-epayments-code', 'au-afca-rules']) expect(au.has(id), id).toBe(true);
    expect(documentsOfAuthority('AUSTRAC').map((d) => d.id)).toEqual(expect.arrayContaining(['au-ttr', 'au-smr', 'au-ifti']));
    expect(documentsOfAuthority('AFCA').flatMap((d) => d.scenarios)).toEqual(expect.arrayContaining(['claim-return', 'claim-rejected']));
    expect(documentsOfAuthority('ASIC').flatMap((d) => d.scenarios)).toEqual(expect.arrayContaining(['bnpl-decline-dti', 'bnpl-decline-cic']));
  });

  it('gives every regulator a full name for the badge tooltip, and the Vietnamese issuers their full titles', () => {
    expect(regulatorById('NA')?.name.vi).toBe('Quốc hội Việt Nam');
    expect(regulatorById('GOV')?.name.vi).toBe('Chính phủ Việt Nam');
    expect(regulatorById('PM')?.name.vi).toBe('Thủ tướng Chính phủ Việt Nam');
    for (const r of REGULATORS) expect(r.name.en.length && r.name.vi.length, r.id).toBeGreaterThan(0);
    for (const d of REG_DOCUMENTS) if (d.regulator) expect(regulatorById(d.regulator), d.id).toBeDefined();
  });

  it('keeps authority chips as non-clickable badges with tooltips, and gives every document a real link to its official text', () => {
    setActiveLocale('vi');
    const out = renderToStaticMarkup(createElement(RegulatoryRegistry, { highlight: null }));
    setActiveLocale('en');
    expect(out).toContain('data-badge="authority"');
    expect(out).toContain('cursor-default');
    expect(out).toContain('title="Quốc hội Việt Nam"');
    expect(out).toContain('title="Thủ tướng Chính phủ Việt Nam"');
    for (const id of AU_AUTHORITIES) expect(out).toContain(`data-regulator="${id}"`);
    // The badges themselves are never links: only the source button and the website column are.
    expect(out).not.toMatch(/<a[^>]*data-badge=/);
    for (const d of REG_DOCUMENTS) {
      const link = sourceLink(d);
      expect(out, d.id).toContain(`data-testid="legal-source-${d.id}"`);
      expect(out).toContain(`href="${link.url.replace(/&/g, '&amp;')}"`);
    }
    // Every outside link opens in a new tab without handing the app's window to the other site.
    const anchors = out.match(/<a\b[^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThanOrEqual(REG_DOCUMENTS.length + REGULATORS.length);
    for (const a of anchors) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
    }
  });

  it('links every document to an https page: its own when known, else a search for its exact number on the official portals', () => {
    for (const d of REG_DOCUMENTS) {
      const link = sourceLink(d);
      expect(link.url, d.id).toMatch(/^https:\/\/[^\s]+$/);
      expect(() => new URL(link.url)).not.toThrow();
      if (SOURCE_URLS[d.id]) expect(link).toMatchObject({ url: SOURCE_URLS[d.id], direct: true });
      else {
        expect(link.direct, d.id).toBe(false);
        const q = new URL(link.url).searchParams.get('q') ?? '';
        expect(q, d.id).toContain(`"${d.number.vi}"`);
        if (d.jurisdiction === 'VN') {
          expect(q).toContain('site:vbpl.vn');
          expect(q).toContain('site:thuvienphapluat.vn');
        }
      }
    }
    // Every Vietnamese law, decree and circular is found by its number (none hard-codes a page that may move).
    for (const d of REG_DOCUMENTS.filter((x) => x.jurisdiction === 'VN')) expect(SOURCE_URLS[d.id], d.id).toBeUndefined();
    for (const id of Object.keys(SOURCE_URLS)) expect(REG_DOCUMENTS.some((d) => d.id === id), id).toBe(true);
  });
});

describe('the retail flashcard format', () => {
  it('heads every card "Thẻ ghi nhớ nghiệp vụ bán lẻ" with the sub-process as a tag', () => {
    expect(retailOpsMessages.messages.flashcardHeader.vi).toBe('Thẻ ghi nhớ nghiệp vụ bán lẻ');
    setActiveLocale('vi');
    const out = renderToStaticMarkup(createElement(Flashcard, { card: RETAIL_FLASHCARDS[0]!, lit: false }));
    setActiveLocale('en');
    expect(out).toContain('Thẻ ghi nhớ nghiệp vụ bán lẻ');
    expect(out).toContain('data-testid="flashcard-sub"');
  });

  it('numbers the back 1/ Định nghĩa, 2/ Bút toán, 3/ Quy tắc nghiệp vụ, 4/ Căn cứ pháp lý on every card', () => {
    const titles = ['flashcardDefinition', 'flashcardEntry', 'flashcardRule', 'flashcardReference'];
    expect(titles.map((t) => retailOpsMessages.messages[t as keyof typeof retailOpsMessages.messages].vi)).toEqual(['Định nghĩa', 'Bút toán', 'Quy tắc nghiệp vụ', 'Căn cứ pháp lý']);
    for (const c of RETAIL_FLASHCARDS) expect(flashcardPoints(c).map((p) => p.title), c.id).toEqual(titles);
  });
});

describe('WebGL safety', () => {
  const disposable = () => {
    const d = { n: 0, dispose() { d.n++; } };
    return d;
  };

  it('disposes every geometry, material and texture once, even when shared', () => {
    const geo = disposable();
    const map = Object.assign(disposable(), { isTexture: true as const });
    const uniformTex = Object.assign(disposable(), { isTexture: true as const });
    const mat = Object.assign(disposable(), { map });
    const shader = Object.assign(disposable(), { uniforms: { u: { value: uniformTex } } });
    const scene = { children: [{ geometry: geo, material: mat }, { geometry: geo, material: [mat, shader] }, { children: [{ geometry: disposable(), material: null }] }] };
    const count = disposeObject(scene);
    expect(count).toEqual({ geometries: 2, materials: 2, textures: 2 });
    expect(geo.n).toBe(1);
    expect(mat.n).toBe(1);
    expect(map.n).toBe(1);
    expect(uniformTex.n).toBe(1);
    expect(disposeObject(null)).toEqual({ geometries: 0, materials: 0, textures: 0 });
  });

  it('disposes the renderer and its render lists', () => {
    const lists = disposable();
    const gl = Object.assign(disposable(), { renderLists: lists });
    disposeRenderer(gl);
    expect(gl.n).toBe(1);
    expect(lists.n).toBe(1);
    expect(() => disposeRenderer(null)).not.toThrow();
  });

  it('cancels a lost context, falls back, hears the restore, and unbinds cleanly', () => {
    const listeners = new Map<string, (e: Event) => void>();
    const canvas: ContextTarget = {
      addEventListener: (type, l) => void listeners.set(type, l),
      removeEventListener: (type, l) => {
        if (listeners.get(type) === l) listeners.delete(type);
      },
    };
    const calls: string[] = [];
    const unbind = bindContextEvents(canvas, { onLost: () => calls.push('lost'), onRestored: () => calls.push('restored') });
    let prevented = false;
    listeners.get('webglcontextlost')!({ preventDefault: () => (prevented = true) } as unknown as Event);
    listeners.get('webglcontextrestored')!({} as Event);
    expect(prevented).toBe(true);
    expect(calls).toEqual(['lost', 'restored']);
    unbind();
    expect(listeners.size).toBe(0);
  });
});
