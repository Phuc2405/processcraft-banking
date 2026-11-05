/**
 * Knowledge regression for the sub-process registry. It fails as soon as domain knowledge is lost or drifts:
 *  1. parity with the pre-refactor registry (fixtures/subProcessBaseline.json): every code, GL line, legal id and SOP step survives;
 *  2. granularity: every sub-group the menu lists has a sheet of its own, distinct from its flow's and its siblings';
 *  3. engine parity: each sheet's GL lines cover what its demo buttons post in the retail book, and the CIT sheet what the CIT engine posts;
 *  4. account codes quoted in prose exist in a chart, and the legal anchors (31/2024, 01/2014, ISO 20022, AUSTRAC) are intact.
 */
import { describe, expect, it } from 'vitest';
import baseline from './fixtures/subProcessBaseline.json';
import { MENU_CHOICES } from '../../components/bank/SubProcessMenu';
import { CIT_ARTICLE, CIT_REF } from '../../data/citKnowledge';
import { regDocById } from '../../data/regulatoryRegistry';
import { RETAIL_FLASHCARDS } from '../../data/retailFlashcards';
import { STP_ARTICLE, STP_REF } from '../../data/stpKnowledge';
import { GROUP_INFO_KEYS, glLine, INFO_KEYS, infoKeyForChoice, subProcessInfo, type GroupInfoKey, type InfoKey } from '../../data/subProcessRegistry';
import type { Localized } from '../../i18n/localeCore';
import { CHART_OF_ACCOUNTS } from '../../engine/ledger';
import { citAt, CIT_ACCOUNTS, CIT_DEMOS, type CitManual } from '../citEngine';
import { DEMO_GROUPS, groupMembers, showsGroupsOf } from '../demoGroups';
import { exampleJournal, exampleLiquidation, examplePresetJournal, exampleTicketClose, exampleVaultTransfer, OPS_ACCOUNTS, OPS_ACTIONS, type OpsLine } from '../retailOps';

type Baseline = Record<string, { code: string; gl: string[]; legal: string[]; steps: string[]; stepsVi: string[] }>;
const BASE = baseline as Baseline;

const glOf = (k: InfoKey): string[] => subProcessInfo(k).gl.map((r) => `${r.side === 'dr' ? 'Dr' : 'Cr'} ${glLine(r, 'en').code} ${r.book}:${r.account}`);
const opsLines = (k: InfoKey): Set<string> => new Set(subProcessInfo(k).gl.filter((r) => r.book === 'ops').map((r) => `${r.side}:${r.account}`));
const posted = (lines: readonly OpsLine[]): string[] => lines.map((l) => `${l.dr ? 'dr' : 'cr'}:${l.account}`);

describe('parity with the pre-refactor registry', () => {
  it('still has every sheet the baseline had', () => {
    for (const k of Object.keys(BASE)) expect(INFO_KEYS, k).toContain(k);
  });

  it.each(Object.keys(BASE))('%s keeps its code, GL lines, legal basis and SOP steps', (k) => {
    const was = BASE[k]!;
    const now = subProcessInfo(k as InfoKey);
    expect(now.code).toBe(was.code);
    for (const line of was.gl) expect(glOf(k as InfoKey), `${k} lost ${line}`).toContain(line);
    for (const id of was.legal) expect(now.legal, `${k} lost ${id}`).toContain(id);
    expect(now.steps.map((s) => s.en)).toEqual(expect.arrayContaining(was.steps));
    expect(now.steps.map((s) => s.vi)).toEqual(expect.arrayContaining(was.stepsVi));
  });
});

describe('sub-process granularity', () => {
  it('has a sheet for exactly the sub-groups the menu lists', () => {
    const listed = DEMO_GROUPS.filter((g) => showsGroupsOf(g.flow)).map((g) => g.id);
    expect([...GROUP_INFO_KEYS].sort()).toEqual([...listed].sort());
    for (const c of MENU_CHOICES) {
      if (c.kind !== 'sub') continue;
      expect(infoKeyForChoice(c.flow, c.sub), c.sub).toBe(c.sub);
      expect(subProcessInfo(c.sub as GroupInfoKey).flow).toBe(c.flow);
    }
  });

  it('never shows a sub-group the same sheet as its flow or a sibling', () => {
    const fingerprint = (k: InfoKey) => {
      const e = subProcessInfo(k);
      return JSON.stringify([e.title, e.overview, e.steps, [...new Set(glOf(k))].sort()]);
    };
    const prints = new Map<string, InfoKey>();
    for (const k of INFO_KEYS) {
      const p = fingerprint(k);
      expect(prints.get(p), `${k} duplicates ${prints.get(p)}`).toBeUndefined();
      prints.set(p, k);
    }
    for (const k of GROUP_INFO_KEYS) {
      const e = subProcessInfo(k);
      const parent = subProcessInfo(`flow-${e.flow}`);
      expect(e.title.en, k).not.toBe(parent.title.en);
      expect(e.overview.vi, k).not.toBe(parent.overview.vi);
    }
  });

  it('fills all seven sections in English and Vietnamese', () => {
    const filled = (t: Localized<string>) => t.en.trim().length > 10 && t.vi.trim().length > 10;
    for (const k of INFO_KEYS) {
      const e = subProcessInfo(k);
      expect(filled(e.overview), `${k} overview`).toBe(true);
      expect(e.actors.length >= 2 && e.actors.every((a) => filled(a.duty)), `${k} actors`).toBe(true);
      expect(e.steps.length >= 3 && e.steps.every(filled), `${k} steps`).toBe(true);
      expect(e.impact.length >= 1 && e.impact.every(filled), `${k} impact`).toBe(true);
      expect(e.risks.length >= 1 && e.risks.every(filled), `${k} risks`).toBe(true);
      expect(e.gl.length >= 1 && e.legal.length >= 1, `${k} GL & legal`).toBe(true);
      expect(filled(e.kpi.sla) && filled(e.kpi.note), `${k} KPI`).toBe(true);
      expect(e.title.vi).not.toBe(e.title.en);
    }
  });
});

describe('engine parity', () => {
  /** Journals a group's sheet must cover beyond its buttons: the follow-up postings its SOP describes. */
  const FOLLOW_UPS: Partial<Record<GroupInfoKey, readonly OpsLine[]>> = {
    'cassette-jam': [...exampleTicketClose('REFUNDED'), ...exampleTicketClose('DISPENSED')],
    'teller-vault': exampleVaultTransfer(),
    collateral: exampleLiquidation(),
  };

  it.each([...GROUP_INFO_KEYS])('%s lists every retail-book line its buttons post', (k) => {
    const have = opsLines(k);
    const need = groupMembers(k).flatMap((m) => posted(m.source === 'ops' ? exampleJournal(m.def.id) : m.def.id === 'eod' ? [] : examplePresetJournal(m.def.id)));
    need.push(...posted(FOLLOW_UPS[k] ?? []));
    for (const line of need) expect(have, `${k} is missing ${line}`).toContain(line);
  });

  it('the CIT sheet carries every CIT account code the engine posts, scheduled or dispatched', () => {
    const codes = new Set(glOf('cit-vault').map((l) => l.split(' ')[1]));
    const manual: CitManual[] = CIT_DEMOS.map((kind, i) => ({ kind, at: 8 * 60 + i * 90 }));
    const usedCodes = new Set<string>();
    for (const day of [1, 2, 3, 4, 5, 6, 7]) {
      for (const r of citAt(day, 24 * 60 - 1, manual).runs) for (const e of r.run?.entries ?? []) for (const l of e.lines) usedCodes.add(CIT_ACCOUNTS.find((a) => a.id === l.account)!.code);
    }
    expect(usedCodes.size).toBeGreaterThanOrEqual(5);
    for (const c of usedCodes) expect(codes, `CIT sheet is missing ${c}`).toContain(c);
  });

  it('keeps the CIT chart codes the knowledge base teaches', () => {
    const code = Object.fromEntries(CIT_ACCOUNTS.map((a) => [a.id, a.code]));
    expect(code).toMatchObject({ VAULT: '1111', UNFIT: '1112', ATM: '1113', SBV: '1121', TRANSIT: '1131', CORP: '4211' });
  });
});

describe('codes and citations in prose', () => {
  const known = new Set([...OPS_ACCOUNTS.map((a) => a.code), ...CIT_ACCOUNTS.map((a) => a.code), ...Object.values(CHART_OF_ACCOUNTS).map((a) => a.code)]);
  const quoted = (text: string): string[] => [...text.matchAll(/(?:\b(?:Dr|Cr|TK|Nợ|Có|GL)|[+/])\s+(\d{4})\b/g)].map((m) => m[1]!);

  it('quotes only account codes that exist in a chart, in the sheets and in the retail button hints', () => {
    const texts: string[] = [];
    for (const k of INFO_KEYS) {
      const e = subProcessInfo(k);
      for (const t of [e.overview, ...e.steps, ...e.risks, e.title]) texts.push(t.en, t.vi);
    }
    for (const a of OPS_ACTIONS) texts.push(a.hint.en, a.hint.vi);
    let seen = 0;
    for (const t of texts) {
      for (const c of quoted(t)) {
        seen++;
        expect(known, `"${t}" quotes ${c}`).toContain(c);
      }
    }
    expect(seen).toBeGreaterThan(40);
  });

  it('keeps the legal anchors: 31/2024 & ISO 20022 for STP, 01/2014 for vault and CIT, AUSTRAC for the Australian reports', () => {
    expect(regDocById('circ-31-2024')!.number.vi).toContain('31/2024/TT-NHNN');
    expect(regDocById('circ-01-2014')!.number.vi).toContain('01/2014/TT-NHNN');
    expect(regDocById('iso-20022')!.title.en).toContain('ISO 20022');
    for (const id of ['au-ttr', 'au-smr', 'au-ifti']) expect(regDocById(id)!.regulator ?? regDocById(id)!.issuer, id).toBe('AUSTRAC');
    expect(STP_REF.vi).toContain('Thông tư 31/2024/TT-NHNN');
    expect(STP_REF.vi).toContain('ISO 20022');
    expect(CIT_REF.vi).toContain('Thông tư 01/2014/TT-NHNN');
    expect(STP_ARTICLE.basis).toBe(STP_REF);
    expect(CIT_ARTICLE.basis).toBe(CIT_REF);
    const cards = (ref: Localized<string>) => RETAIL_FLASHCARDS.filter((c) => c.reference === ref).length;
    expect(cards(STP_REF)).toBeGreaterThanOrEqual(3);
    expect(cards(CIT_REF)).toBeGreaterThanOrEqual(3);
  });

  it('cites the domain rule on each cash and credit sheet', () => {
    for (const k of ['cit-vault', 'flow-6', 'teller-vault', 'cassette-jam'] as const) expect(subProcessInfo(k).legal, k).toContain('circ-01-2014');
    for (const k of ['bnpl-credit', 'credit-risk', 'flow-2'] as const) expect(subProcessInfo(k).legal, k).toContain('circ-31-2024');
    for (const k of ['flow-2', 'flow-4', 'flow-8', 'swift-remit', 'cit-vault'] as const) expect(subProcessInfo(k).legal, k).toContain('iso-20022');
    for (const k of ['aml-sanctions', 'cash-ctr', 'flow-6'] as const) expect(subProcessInfo(k).legal.some((id) => regDocById(id)?.regulator === 'AUSTRAC' || regDocById(id)?.issuer === 'AUSTRAC'), k).toBe(true);
  });
});
