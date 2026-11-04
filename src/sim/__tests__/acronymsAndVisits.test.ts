import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { acronymHint, acronymsIn, explainCode, glossaryTerms } from '../../components/bank/codeGlossary';
import { MapLegend } from '../../components/bank/MapLegend';
import { laneKind } from '../../components/bank/office/palette';
import { placeSideTip } from '../../components/bank/tipPlacement';
import { OpsFlashcards } from '../../components/knowledge/RetailOpsStudy';
import { SearchResultTitle } from '../../components/nav/SearchResultItem';
import { ACRONYM_DETAILS, AUDITED_ACRONYMS } from '../../data/acronyms';
import { RETAIL_FLASHCARDS } from '../../data/retailFlashcards';
import { VISIT_2D, VISIT_3D } from '../../engine/plan/deskVisitPaths';
import { STAGE } from '../../engine/plan/layout';
import { COUNTER, deskPose, FLOOR_SLAB, seatOffsets } from '../../engine/plan/layout3d';
import { buildSearchIndex, searchIndex } from '../../hooks/useSearchIndex';
import { deskVisitStore } from '../../store/deskVisitStore';
import { DESK_VISITS, SEATED_DESKS, VISIT_DESKS, VISIT_PACE, visitDuration, visitFrame, type DeskVisitStep, type Pt, type VisitAction, type VisitDesk, type VisitGeometry } from '../deskVisit';
import { opsActionById, opsJournalBalanced } from '../retailOps';
import { presetById } from '../presets';
import { modeOf, shiftOf } from '../demoSchedule';

const index = { en: buildSearchIndex('expert', 'en'), vi: buildSearchIndex('expert', 'vi') };
const top = (q: string, locale: 'en' | 'vi' = 'en') => {
  const r = searchIndex(index[locale], q);
  return r.order.flatMap((c) => r.groups[c])[0];
};

describe('the acronym audit', () => {
  it('gives every glossary term an expanded name, a Vietnamese name and a rule in both languages, and no orphan details', () => {
    const keys = glossaryTerms('en').map((t) => t.key);
    expect([...keys].sort()).toEqual(Object.keys(ACRONYM_DETAILS).sort());
    for (const d of Object.values(ACRONYM_DETAILS)) {
      expect(d.name.en.length).toBeGreaterThan(1);
      expect(d.name.vi.length).toBeGreaterThan(1);
      expect(d.rule.en.length).toBeGreaterThan(20);
      expect(d.rule.vi.length).toBeGreaterThan(20);
    }
  });

  it('explains the spellings plain capitals would miss', () => {
    for (const code of ['TSĐB', '3DS', 'dCVV', 'MT103', 'A2A']) expect(explainCode(code, 'vi'), code).toBeTruthy();
    expect(acronymsIn('Khóa TSĐB qua 3DS', 'vi').map((a) => a.label)).toEqual(['TSĐB', '3DS']);
  });

  it('expands a short label in its hover text and leaves a label with no acronym alone', () => {
    expect(acronymHint('SWIFT Gateway', 'en')).toContain('Society for Worldwide Interbank Financial Telecommunication');
    expect(acronymHint('Savings Desk', 'en')).toBe('Savings Desk');
  });
});

describe('Ctrl+K definition cards', () => {
  it('puts a definition card first for every audited acronym, typed in either form', () => {
    for (const key of AUDITED_ACRONYMS) {
      const hit = top(key);
      expect(hit?.id, key).toBe(`kb:term:${key}`);
      expect(hit?.full, key).toBe(ACRONYM_DETAILS[key]!.name.en);
      expect(hit?.rule, key).toBeTruthy();
      expect(hit?.vi, key).toBeTruthy();
    }
    expect(top('TSĐB', 'vi')?.abbr).toBe('TSĐB');
    expect(top('tsdb', 'vi')?.id).toBe('kb:term:TSDB');
  });

  it('finds an acronym by its expanded name too', () => {
    const hits = searchIndex(index.en, 'Society for Worldwide').groups.kb.map((e) => e.id);
    expect(hits).toContain('kb:term:SWIFT');
  });

  it('renders the short name in bold with the long name clipped to one line beside it', () => {
    const swift = top('SWIFT')!;
    const out = renderToStaticMarkup(createElement(SearchResultTitle, { entry: swift }));
    expect(out).toContain('text-sm font-semibold text-white');
    expect(out).toMatch(/data-testid="search-full"/);
    for (const c of ['truncate', 'max-w-[280px]', 'shrink', 'overflow-hidden', 'text-ellipsis', 'whitespace-nowrap', 'ml-2', 'text-xs', 'text-slate-400', 'font-normal']) expect(out).toContain(c);
  });

  it('keeps the card beside the panel, on whichever side fits, and under it on a phone', () => {
    const tip = { width: 300, height: 120 };
    const row = { left: 100, top: 80, width: 400, height: 40 };
    const panel = { left: 100, top: 50, width: 420, height: 300 };
    expect(placeSideTip(row, panel, tip, { width: 1400, height: 800 }).left).toBe(528);
    const left = placeSideTip({ ...row, left: 800 }, { ...panel, left: 800 }, tip, { width: 1280, height: 800 });
    expect(left.left).toBe(492);
    const phone = placeSideTip(row, { ...panel, left: 8, width: 360 }, tip, { width: 376, height: 800 });
    expect(phone.top).toBe(358);
    // Never off the bottom of the window.
    expect(placeSideTip({ ...row, top: 760 }, panel, tip, { width: 1400, height: 800 }).top).toBe(672);
  });
});

describe('the Retail Banking Flashcards', () => {
  it('cover the brief’s topics and every audited acronym, with a term and a rule on every back', () => {
    const ids = RETAIL_FLASHCARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['retail-bnpl', 'retail-card-swipe', 'retail-waterfall', 'retail-dti', 'retail-td-break', 'retail-collateral-lock', 'retail-collateral-liquidate', 'retail-autopay', 'retail-autopay-nsf']) expect(ids).toContain(id);
    for (const key of AUDITED_ACRONYMS) expect(ids).toContain(`retail-term-${key.toLowerCase()}`);
    for (const c of RETAIL_FLASHCARDS) {
      expect(c.term.en.length, c.id).toBeGreaterThan(1);
      expect(c.term.vi.length, c.id).toBeGreaterThan(1);
      expect(c.rule.vi.length, c.id).toBeGreaterThan(10);
      expect(opsJournalBalanced(c.lines), c.id).toBe(true);
    }
  });

  it('show on the Knowledge Base tab, and are found by Ctrl+K', () => {
    const out = renderToStaticMarkup(createElement(OpsFlashcards));
    for (const c of RETAIL_FLASHCARDS) expect(out).toContain(`data-card="${c.id}"`);
    const ids = new Set(index.vi.map((e) => e.id));
    for (const c of RETAIL_FLASHCARDS) expect(ids.has(`ops:flash:${c.id}`), c.id).toBe(true);
  });
});

const allSteps = Object.entries(DESK_VISITS) as Array<[VisitAction, readonly DeskVisitStep[]]>;
const views: Array<[string, Readonly<Record<VisitDesk, VisitGeometry>>]> = [
  ['2D', VISIT_2D],
  ['3D', VISIT_3D],
];

const timeline = (step: DeskVisitStep, geo: VisitGeometry) => {
  const end = visitDuration(step, geo);
  return { end, frames: Array.from({ length: Math.ceil(end * 20) + 40 }, (_, i) => ({ t: i / 20, figures: visitFrame(step, geo, i / 20) })) };
};

describe('people at the staffed counters (teller, disputes, savings, collateral, Pay-in-4 appraisal)', () => {
  it('brings people to every desk of a counter demo’s own route, and an officer to a desk without seated staff', () => {
    expect(Object.keys(DESK_VISITS).sort()).toEqual(
      [
        'bnpl-approve-400', 'bnpl-decline-cic', 'bnpl-decline-dti', 'claim-rejected', 'claim-return', 'collateral-liquidate', 'collateral-lock', 'collateral-release', 'collateral-shortfall',
        'td-break-10k', 'td-break-id-mismatch', 'td-break-pledged', 'td-mature-close',
        'teller-12k', 'teller-51', 'teller-counterfeit', 'teller-deposit-5000', 'teller-exceed-limit', 'teller-frozen', 'teller-smurf',
      ].sort(),
    );
    for (const [action, steps] of allSteps) {
      const desks = steps.map((s) => s.desk);
      if (!presetById(action)) for (const place of opsActionById(action as Parameters<typeof opsActionById>[0]).route) if ((VISIT_DESKS as readonly string[]).includes(place)) expect(desks, `${action} ${place}`).toContain(place);
      const seated = steps.every((s) => SEATED_DESKS.includes(s.desk));
      expect(steps.some((s) => s.officer), action).toBe(!seated);
    }
    expect(new Set(allSteps.flatMap(([, steps]) => steps.map((s) => s.desk))).size).toBe(VISIT_DESKS.length);
  });

  it('is the one human counter pattern: every counter demo is a human, day-shift demo, and the case stays 8 seconds', () => {
    expect(VISIT_PACE.serveCase).toBe(8);
    for (const [action] of allSteps) {
      expect(modeOf(action), action).toBe('human');
      expect(shiftOf(action), action).toBe('day');
    }
  });

  it('holds the case customer at the counter for the full 8 seconds on both maps', () => {
    for (const [action, steps] of allSteps)
      for (const [, geometry] of views) {
        const step = steps[0]!;
        const { frames } = timeline(step, geometry[step.desk]);
        const at = frames.filter((f) => f.figures.find((x) => x.key === 'c0')?.phase === 'transact');
        expect(at.length / 20, action).toBeGreaterThanOrEqual(VISIT_PACE.serveCase - 0.1);
      }
  });

  describe.each(views)('on the %s map', (_name, geometry) => {
    it.each(allSteps.flatMap(([a, steps]) => steps.map((s) => [a, s] as const)))('%s runs walk, queue, counter, leave, in order, and everyone goes', (_a, step) => {
      const geo = geometry[step.desk];
      const { end, frames } = timeline(step, geo);
      const seen = new Map<string, string[]>();
      for (const { figures } of frames)
        for (const f of figures) {
          if (!f.phase) continue;
          const list = seen.get(f.key) ?? [];
          if (list[list.length - 1] !== f.phase) list.push(f.phase);
          seen.set(f.key, list);
        }
      for (let i = 0; i < step.customers; i++) {
        const phases = seen.get(`c${i}`) ?? [];
        expect(phases[0], `c${i}`).toBe('walk');
        expect(phases, `c${i}`).toContain('transact');
        expect(phases[phases.length - 1], `c${i}`).toBe('leave');
        // Someone behind the first in line actually waited.
        if (i > 0) expect(phases, `c${i}`).toContain('queue');
      }
      if (step.officer) expect(seen.get('officer')).toEqual(expect.arrayContaining(['walk', 'transact', 'leave']));
      for (const f of visitFrame(step, geo, end + 0.1)) expect(f.phase, f.key).toBeNull();
    });

    it.each(allSteps.flatMap(([a, steps]) => steps.map((s) => [a, s] as const)))('%s serves one customer at a time, and nobody ever jumps', (_a, step) => {
      const geo = geometry[step.desk];
      const { frames } = timeline(step, geo);
      const last = new Map<string, Pt>();
      for (const { figures } of frames) {
        expect(figures.filter((f) => f.role === 'customer' && f.phase === 'transact').length).toBeLessThanOrEqual(1);
        for (const f of figures) {
          if (!f.phase) {
            last.delete(f.key);
            continue;
          }
          const prev = last.get(f.key);
          // A frame is 50ms: nobody moves further than a brisk step-up in one.
          if (prev) expect(Math.hypot(f.at[0] - prev[0], f.at[1] - prev[1]), f.key).toBeLessThan(geo.speed * 0.05 * 2.5);
          last.set(f.key, f.at);
        }
      }
    });
  });

  it('keeps the 2D routes on the stage', () => {
    for (const desk of VISIT_DESKS) {
      const g = VISIT_2D[desk];
      for (const [x, y] of [...g.walkIn(0), ...g.walkIn(2), ...g.walkOut, ...g.officerIn]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(STAGE.width);
        expect(y).toBeLessThanOrEqual(STAGE.height);
      }
    }
  });

  it('keeps the 3D routes out of every counter and the chairs behind the two desks', () => {
    const blocks = VISIT_DESKS.map((id) => {
      const p = deskPose(id);
      const chairs = seatOffsets(2).map(([, z]) => p.z + z);
      return { x0: p.x - COUNTER.w / 2, x1: p.x + COUNTER.w / 2, z0: Math.min(...chairs) - 0.35, z1: p.z + COUNTER.d / 2 };
    });
    const clear = (path: readonly Pt[], label: string): void => {
      for (let i = 1; i < path.length; i++) {
        const [ax, az] = path[i - 1]!;
        const [bx, bz] = path[i]!;
        for (let u = 0; u <= 1; u += 0.02) {
          const x = ax + (bx - ax) * u;
          const z = az + (bz - az) * u;
          for (const b of blocks) expect(x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1, `${label} at ${x.toFixed(2)},${z.toFixed(2)}`).toBe(false);
        }
      }
    };
    for (const desk of VISIT_DESKS) {
      const g = VISIT_3D[desk];
      for (const place of [0, 1, 2]) clear(g.walkIn(place), `${desk} in ${place}`);
      clear(g.walkOut, `${desk} out`);
      if (!SEATED_DESKS.includes(desk)) clear(g.officerIn, `${desk} officer`);
      // They come in from outside the hall (a side door beside their desk, or the main gate for the front counters), and stand inside it.
      const [ex, ez] = g.walkIn(0)[0]!;
      expect(Math.abs(ex) > FLOOR_SLAB.w / 2 || ez > FLOOR_SLAB.d / 2, desk).toBe(true);
      expect(Math.abs(g.slot(0)[0])).toBeLessThan(FLOOR_SLAB.w / 2);
    }
  });

  it('starts only for a demo that brings people, replaces a running one, and clears', () => {
    const store = deskVisitStore.getState();
    store.start('bill-electric-85');
    expect(deskVisitStore.getState().visits).toHaveLength(0);
    store.start('td-break-10k');
    expect(deskVisitStore.getState().visits.map((v) => v.step.desk)).toEqual(['SAVINGS_DESK']);
    store.start('collateral-lock');
    expect(deskVisitStore.getState().visits.map((v) => v.step.desk)).toEqual(['COLLATERAL_VAULT', 'SAVINGS_DESK']);
    store.clear();
    expect(deskVisitStore.getState().visits).toHaveLength(0);
  });
});

describe('the map legend', () => {
  it('scrolls inside an adaptive panel and explains the two new desks and the lock line', () => {
    const out = renderToStaticMarkup(createElement(MapLegend, { initiallyOpen: true }));
    expect(out).toContain('max-h-[min(60vh,400px)]');
    expect(out).toContain('overflow-y-auto');
    for (const key of ['deskSavings', 'deskCollateral', 'lineLock']) expect(out).toContain(`data-legend="${key}"`);
    expect(laneKind('SAVINGS_DESK', 'COLLATERAL_VAULT')).toBe('lock');
    expect(laneKind('LEDGER_DEBIT', 'SAVINGS_DESK')).toBe('approve');
  });
});
