import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RegulatoryRegistry } from '../../components/knowledge/RegulatoryRegistry';
import { setActiveLocale } from '../../i18n/localeCore';
import { ALL_DEMO_ACTIONS, demoActionById } from '../../sim/demoActions';
import { DEMO_GROUPS } from '../../sim/demoGroups';
import { knowledgeTabOf } from '../../store/uiStore';
import { documentsForScenario, foldSearch, REG_DOCUMENTS, REGULATORS, regulatorById, searchRegistry, searchRegulators } from '../regulatoryRegistry';

const ids = (docs: readonly { id: string }[]) => docs.map((d) => d.id);

describe('the regulatory registry', () => {
  it('has unique documents, each with a known issuer, an effective date, a summary in both languages and at least one scenario', () => {
    expect(new Set(ids(REG_DOCUMENTS)).size).toBe(REG_DOCUMENTS.length);
    expect(new Set(REGULATORS.map((r) => r.id)).size).toBe(REGULATORS.length);
    const known = new Set(ALL_DEMO_ACTIONS.map((a) => a.id));
    for (const d of REG_DOCUMENTS) {
      expect(regulatorById(d.issuer), d.id).toBeDefined();
      expect(d.effective, d.id).toMatch(/^(\d{2}\/)?(\d{2}\/)?\d{4}$/);
      expect(d.summary.en.length && d.summary.vi.length, d.id).toBeGreaterThan(0);
      expect(d.keyPoints.length, d.id).toBeGreaterThan(0);
      expect(d.scenarios.length, d.id).toBeGreaterThan(0);
      for (const s of d.scenarios) expect(known.has(s), `${d.id} -> ${s}`).toBe(true);
    }
  });

  it('grounds every sub-process of the dock in at least one document', () => {
    for (const g of DEMO_GROUPS) {
      const grounded = ALL_DEMO_ACTIONS.filter((a) => a.group === g.id).some((a) => documentsForScenario(a.id).length > 0);
      expect(grounded, g.id).toBe(true);
    }
  });

  it('finds a document by its number, with or without accents, in either language', () => {
    expect(ids(searchRegistry({ query: '18/2024' }))[0]).toBe('circ-18-2024');
    expect(ids(searchRegistry({ query: 'thong tu the ngan hang' }))).toContain('circ-18-2024');
    expect(ids(searchRegistry({ query: 'Thông tư thẻ' }))).toContain('circ-18-2024');
    expect(ids(searchRegistry({ query: 'provisioning' }))).toEqual(expect.arrayContaining(['decree-86-2024']));
    expect(ids(searchRegistry({ query: 'du phong' }))).toEqual(expect.arrayContaining(['decree-86-2024', 'circ-11-2021']));
    expect(ids(searchRegistry({ query: 'ví điện tử chính chủ' }))).toEqual(['circ-40-2024']);
  });

  it('finds a document by the scenario it explains', () => {
    setActiveLocale('vi');
    const label = (id: Parameters<typeof demoActionById>[0]) => demoActionById(id).label();
    expect(ids(searchRegistry({ query: 'Sổ đang cầm cố' }, label))).toContain('circ-48-2018');
    setActiveLocale('en');
  });

  it('filters by kind and jurisdiction, and every word of the query must match', () => {
    expect(searchRegistry({ query: '', jurisdictions: ['AU'] }).every((d) => d.jurisdiction === 'AU')).toBe(true);
    expect(searchRegistry({ query: '', kinds: ['circular'] }).every((d) => d.kind === 'circular')).toBe(true);
    expect(searchRegistry({ query: '', kinds: ['decree'] }).length).toBeGreaterThanOrEqual(3);
    expect(searchRegistry({ query: 'eKYC xyzzy' })).toHaveLength(0);
    expect(searchRegistry({ query: '' })).toHaveLength(REG_DOCUMENTS.length);
  });

  it('searches the regulators too', () => {
    expect(searchRegulators('ngan hang nha nuoc').map((r) => r.id)).toEqual(['SBV']);
    expect(searchRegulators('credit bureau').map((r) => r.id)).toContain('CIC');
    expect(foldSearch('Đưa Thông Tư')).toBe('dua thong tu');
  });

  it('renders as its own Knowledge Base tab, with a search box, filters, cards and the regulator table', () => {
    expect(knowledgeTabOf('legal-circ-18-2024')).toBe('legal');
    setActiveLocale('vi');
    const out = renderToStaticMarkup(createElement(RegulatoryRegistry, { highlight: 'legal-circ-18-2024' }));
    expect(out).toContain('data-testid="legal-search"');
    expect(out).toContain('data-testid="legal-kind-circular"');
    expect(out).toContain('data-testid="legal-regulators"');
    for (const d of REG_DOCUMENTS) expect(out).toContain(`id="kb-legal-${d.id}"`);
    expect(out).toContain('Ngày hiệu lực');
    expect(out).toContain('1/');
    setActiveLocale('en');
  });
});
