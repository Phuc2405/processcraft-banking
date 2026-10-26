import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setActiveLocale } from '../../../i18n/locale';
import { comboMultiplier, comboTier, comboTierUp, comboXp, STAFF_XP_PER_CORRECT } from '../../../sim/staffRoleplay';
import { bookCombo, EMPTY_SHIFT } from '../../../store/bankStore';
import { reviewSound } from '../../../utils/audioFX';
import { hasVietnamese } from '../../../utils/i18nHelper';
import { analystWorkspaceMessages, type AnalystWorkspaceKey } from '../analystWorkspace.messages';
import { ComboBadge, ConsequenceOverlay, SopViolationPulse } from '../AnalystWorkspaceModal';

const mFor = (locale: 'en' | 'vi') => (key: AnalystWorkspaceKey, values?: Record<string, string | number>) =>
  Object.entries(values ?? {}).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, String(v)), analystWorkspaceMessages.messages[key][locale]);

afterEach(() => setActiveLocale('en'));

describe('combo multiplier', () => {
  it('tiers: 0–2 ×1.0, 3–4 ×1.5, 5+ ×2.0', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(comboMultiplier)).toEqual([1, 1, 1, 1.5, 1.5, 2, 2]);
    expect([2, 3, 5].map(comboTier)).toEqual(['none', 'hot', 'zone']);
    expect(comboXp(3)).toBe(STAFF_XP_PER_CORRECT * 1.5);
    expect([2, 3, 4, 5, 6].map(comboTierUp)).toEqual([false, true, false, true, false]);
  });

  it('books XP at the new streak and resets on an error', () => {
    let s = { ...EMPTY_SHIFT };
    const xp: number[] = [];
    for (let i = 0; i < 6; i++) {
      const next = { ...s, ...bookCombo(s, true) };
      xp.push(next.xp - s.xp);
      s = next;
    }
    expect(xp).toEqual([100, 100, 150, 150, 200, 200]);
    expect(s.comboCount).toBe(6);
    const err = bookCombo(s, false);
    expect(err).toEqual({ comboCount: 0, xp: s.xp });
  });

  it('picks the review sound', () => {
    expect(reviewSound(false, 0)).toBe('sopError');
    expect(reviewSound(true, 1)).toBe('comboSuccess');
    expect(reviewSound(true, 3)).toBe('comboUp');
    expect(reviewSound(true, 5)).toBe('comboUp');
  });

  it('renders badge tiers, overlay bonus and the violation banner in both languages', () => {
    for (const locale of ['en', 'vi'] as const) {
      const m = mFor(locale);
      expect(renderToStaticMarkup(createElement(ComboBadge, { combo: 0, m }))).toBe('');
      expect(renderToStaticMarkup(createElement(ComboBadge, { combo: 3, m }))).toContain('x1.5');
      const zone = renderToStaticMarkup(createElement(ComboBadge, { combo: 5, m }));
      expect(zone).toContain('data-tier="zone"');
      expect(zone).toContain('x2.0');
      const ok = renderToStaticMarkup(createElement(ConsequenceOverlay, { consequence: { role: 'bnpl', errors: 0, xp: 200, combo: 5, result: { ok: true, packetId: 'p', decision: 'APPROVE', expected: 'APPROVE', correct: true, statusCode: 'X' } }, mode: 'standard', m }));
      expect(ok).toContain('+200');
      expect(ok).toContain('workspace-consequence-combo');
      const bad = renderToStaticMarkup(createElement(ConsequenceOverlay, { consequence: { role: 'bnpl', errors: 1, combo: 0, result: { ok: true, packetId: 'p', decision: 'APPROVE', expected: 'REJECT', correct: false, statusCode: 'X' } }, mode: 'standard', m }));
      expect(bad).toContain('workspace-combo-broken');
      const pulse = renderToStaticMarkup(createElement(SopViolationPulse, { m }));
      expect(pulse).toContain('VI PHẠM SOP');
      expect(pulse).toContain('SOP VIOLATION');
      if (locale === 'en') expect(hasVietnamese(m('comboZone'))).toBe(false);
    }
  });
});
