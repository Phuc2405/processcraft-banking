import { describe, expect, it } from 'vitest';
import { DECLINE_GLOSSARY, OVERVIEW_GLOSSARY, PNL_GLOSSARY, STAT_GLOSSARY } from '../../../data/reportGlossary';
import { pnlLines } from '../../../sim/reportSummary';
import { simulateDay } from '../../../sim/whatIf';
import { DECLINE_REASONS } from '../../../sim/kpis';
import { placeTip, TIP_MARGIN, TIP_MAX_WIDTH, tipWidth } from '../tipPlacement';

const all = (): Array<[string, string]> => [...Object.entries(PNL_GLOSSARY), ...Object.entries(STAT_GLOSSARY), ...Object.entries(DECLINE_GLOSSARY)];

describe('the End-of-Day glossary', () => {
  it('says exactly what the brief asked for the five key terms', () => {
    expect(PNL_GLOSSARY['Card interchange']).toBe('Fee earned by the issuing bank from merchants on card transactions.');
    expect(PNL_GLOSSARY['Clearing the suspense account']).toBe('Temporary holding ledger cleared when overnight reconcilers match physical cash and failed transactions.');
    expect(DECLINE_GLOSSARY.DCVV_EXPIRED).toBe('3-digit rotating security code (dCVV) on virtual cards that expired before transaction completion.');
    expect(PNL_GLOSSARY['Good customers lost']).toBe('Legitimate revenue missed due to excessive 3DS authentication friction or false declines.');
    expect(DECLINE_GLOSSARY.ATM_JAM).toBe('Physical banknote jam in the ATM tray; debited funds are parked in Suspense until audit.');
  });

  it('keeps every explanation to one line of one sentence', () => {
    for (const [key, text] of all()) {
      expect(text, key).not.toMatch(/\n/);
      expect(text.length, key).toBeGreaterThan(20);
      expect(text.length, key).toBeLessThanOrEqual(140);
      expect(text, key).toMatch(/\.$/);
      expect(text.slice(0, -1), key).not.toMatch(/\.\s+[A-Z]/);
    }
  });

  it('explains every decline reason the report can list', () => {
    for (const r of DECLINE_REASONS) expect(DECLINE_GLOSSARY[r], r).toBeTruthy();
  });

  it('covers every Profit & Loss line the report draws, including temporary cover', () => {
    const plain = simulateDay({ seed: 7, day: 1, rules: {}, cover: {} });
    const covered = simulateDay({ seed: 7, day: 1, rules: {}, cover: { SEC_3DS: 1 } });
    const labels = new Set([...pnlLines(plain), ...pnlLines(covered)].map((l) => l.label));
    expect(labels.size).toBe(Object.keys(PNL_GLOSSARY).length);
    for (const l of labels) expect(PNL_GLOSSARY[l], l).toBeTruthy();
  });

  it('explains every hero card and chart of the overview in one line', () => {
    for (const [k, v] of Object.entries(OVERVIEW_GLOSSARY)) {
      expect(v, k).not.toMatch(/\n/);
      expect(v.length, k).toBeLessThanOrEqual(140);
    }
  });
});

describe('where a tooltip goes', () => {
  const viewport = { width: 1280, height: 800 };
  const tip = { width: 280, height: 60 };

  it('sits centred above the (?) when there is room', () => {
    const p = placeTip({ left: 600, top: 400, width: 15, height: 15 }, tip, viewport);
    expect(p.side).toBe('above');
    expect(p.left).toBe(Math.round(607.5 - 140));
    expect(p.top + tip.height).toBeLessThanOrEqual(400);
  });

  it('flips below when the (?) is near the top of the window', () => {
    const p = placeTip({ left: 600, top: 20, width: 15, height: 15 }, tip, viewport);
    expect(p.side).toBe('below');
    expect(p.top).toBeGreaterThanOrEqual(35);
  });

  it('never spills off either side or the bottom, even on a phone', () => {
    const phone = { width: 360, height: 640 };
    const narrow = { width: tipWidth(phone.width), height: 80 };
    expect(narrow.width).toBeLessThanOrEqual(phone.width - TIP_MARGIN * 2);
    for (const left of [0, 5, 100, 200, 340, 355]) {
      for (const top of [0, 10, 300, 620, 635]) {
        const p = placeTip({ left, top, width: 15, height: 15 }, narrow, phone);
        expect(p.left).toBeGreaterThanOrEqual(TIP_MARGIN);
        expect(p.left + narrow.width).toBeLessThanOrEqual(phone.width - TIP_MARGIN);
        expect(p.top).toBeGreaterThanOrEqual(TIP_MARGIN);
        expect(p.top + narrow.height).toBeLessThanOrEqual(phone.height - TIP_MARGIN);
      }
    }
  });

  it('is as wide as it is allowed on a big screen, and the window less its margins on a small one', () => {
    expect(tipWidth(1600)).toBe(TIP_MAX_WIDTH);
    expect(tipWidth(250)).toBe(250 - TIP_MARGIN * 2);
  });
});
