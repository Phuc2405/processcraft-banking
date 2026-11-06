/**
 * Regression suite: the map legend's cash wire, one Vietnamese name per desk across Standard and Expert,
 * the Token Vault in Vietnamese, and the 3D signs following the language toggle.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { MapLegend } from '../../../components/bank/MapLegend';
import { signMessages, type SignKey } from '../../../components/bank/office/signs.messages';
import { setActiveLocale } from '../../../i18n/localeCore';
import { hasVietnamese, message } from '../../../utils/i18nHelper';
import { departmentName, stationName, stationTip, stationTitle, TERM_MODES } from '../../terms';
import { src } from './harness';

afterEach(() => setActiveLocale('en'));

const legend = (): string => renderToStaticMarkup(createElement(MapLegend, { initiallyOpen: true }));

describe('the map legend explains the yellow cash wires', () => {
  it('draws a yellow dashed line for cash and vault transfers', () => {
    const out = legend();
    expect(out).toContain('data-legend="lineCash"');
    expect(out).toMatch(/stroke="#facc15"[^>]*stroke-dasharray="6 4"/);
    for (const word of ['Main Vault', 'tellers', 'ATMs', 'CIT Loading Bay']) expect(out).toContain(word);
  });

  it('names it Dây tiền mặt & Điều chuyển quỹ in Vietnamese', () => {
    setActiveLocale('vi');
    const out = legend();
    expect(out).toContain('Dây tiền mặt &amp; Điều chuyển quỹ');
    expect(out).toContain('Quầy Tiết kiệm:');
  });
});

describe('one Vietnamese name per desk, whichever vocabulary is on', () => {
  const same = (name: (mode: (typeof TERM_MODES)[number]) => string, want: string): void => {
    setActiveLocale('vi');
    for (const mode of TERM_MODES) expect(name(mode)).toBe(want);
  };

  it('writes Quầy Tiết kiệm with a capital T, never lower-case', () => {
    same((m) => stationName('SAVINGS_DESK', m), 'Quầy Tiết kiệm');
    same((m) => stationTitle('SAVINGS_DESK', m), 'Quầy Tiết kiệm');
    expect(src('sim/terms.ts')).not.toContain('Quầy tiết kiệm');
    expect(src('components/bank/mapLegend.messages.ts')).not.toContain('Quầy tiết kiệm');
  });

  it('heads the savings group Tiết kiệm & Tài sản bảo đảm in both modes', () => same((m) => departmentName('SAVINGS', m), 'Tiết kiệm & Tài sản bảo đảm'));

  it('names the ATM group and its card desk the same in both modes', () => {
    same((m) => departmentName('ATM', m), 'Máy ATM vỉa hè');
    same((m) => stationName('GATE_ATM', m), 'Thẻ & PIN máy ATM');
    same((m) => stationTitle('GATE_ATM', m), 'Thẻ & PIN máy ATM');
  });
});

describe('the Token Vault in Vietnamese', () => {
  it('is Kho Mã hóa Thẻ, with the English term only in brackets', () => {
    setActiveLocale('vi');
    expect(stationName('SEC_VAULT', 'expert')).toBe('Kho Mã hóa Thẻ (Token Vault)');
    for (const mode of TERM_MODES) {
      expect(stationName('SEC_VAULT', mode)).not.toMatch(/^Token Vault$/);
      expect(hasVietnamese(stationTip('SEC_VAULT', mode))).toBe(true);
    }
  });
});

describe('the 3D signs follow the language toggle', () => {
  const keys = Object.keys(signMessages.messages) as SignKey[];

  it('reads MAIN VAULT and CIT LOADING BAY in English, and the Vietnamese names in VI', () => {
    expect(message(signMessages, 'mainVault', {}, 'en')).toContain('MAIN VAULT');
    expect(message(signMessages, 'citBay', {}, 'en')).toBe('CIT LOADING BAY');
    expect(message(signMessages, 'mainEntrance', {}, 'en')).toBe('MAIN ENTRANCE');
    expect(message(signMessages, 'mainVault', {}, 'vi')).toContain('KHO QUỸ TRUNG TÂM');
    expect(message(signMessages, 'citBay', {}, 'vi')).toBe('SẢNH GIAO NHẬN CIT');
  });

  it('keeps every English sign free of Vietnamese', () => {
    for (const k of keys) expect(hasVietnamese(message(signMessages, k, {}, 'en')), k).toBe(false);
  });

  it('draws every sign from the bundle: no literal sign text left in the 3D scene', () => {
    for (const file of ['Dressing', 'AtmKiosk', 'GuardCabin3D', 'LoadingBay3D', 'Park3D', 'Parking3D', 'Street']) {
      const code = src(`components/bank/office/${file}.tsx`);
      expect(code, file).not.toMatch(/<Sign\s+text=/);
    }
    expect(src('components/bank/office/Dressing.tsx')).toContain('useMessages(signMessages)(sign)');
  });
});
