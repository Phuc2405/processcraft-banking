import { describe, expect, it } from 'vitest';
import { setActiveLocale } from '../../i18n/localeCore';
import { STATION_BRAND } from '../../i18n/stationBrand.messages';
import { DEPARTMENTS, DEPARTMENT_IDS, EXTERNAL_IDS, STATION_IDS, STATIONS } from '../topology';
import {
  departmentName,
  departmentTip,
  externalLabel,
  externalSub,
  externalTip,
  isTermMode,
  modeLabel,
  placeTip,
  placeTitle,
  plainText,
  stationCaption,
  stationName,
  stationTip,
  stationTitle,
  termText,
} from '../terms';

const sentences = (text: string): number => (text.match(/[.!?](\s|$)/g) ?? []).length;

describe('names in the two vocabularies', () => {
  it('uses the topology names for the Fintech Expert', () => {
    for (const id of STATION_IDS.filter((s) => !STATION_BRAND[s])) {
      expect(stationName(id, 'expert')).toBe(STATIONS[id].name);
      expect(stationTitle(id, 'expert')).toBe(STATIONS[id].name);
      expect(stationTip(id, 'expert')).toBe(STATIONS[id].blurb);
    }
    for (const id of DEPARTMENT_IDS) expect(departmentName(id, 'expert')).toBe(DEPARTMENTS[id].name);
  });

  it('renames the desks the way the brief asks for, in full', () => {
    expect(stationTitle('SEC_VAULT', 'beginner')).toBe('Virtual Card Masking Vault (Hides Real Card Number)');
    expect(stationTitle('SEC_DCVV', 'beginner')).toBe('Dynamic Security Code Check (Rotates Every Minute)');
    expect(stationTitle('SEC_3DS', 'beginner')).toBe('Fraud & SMS OTP Check');
    expect(departmentName('LEDGER', 'beginner')).toBe('Account Balance & Credit Check');
    expect(departmentName('BNPL', 'beginner')).toBe('BNPL Pay-in-4 Instalments');
    expect(stationTitle('BNPL', 'beginner')).toBe('BNPL Pay-in-4 Instalments');
    expect(stationTitle('RECON', 'beginner')).toBe('Night Bookkeeping & Ledger Balance');
    expect(stationTitle('SUSPENSE', 'beginner')).toBe('Holding Box for Mismatched Money');
  });

  it('names the instant-transfer desk by its global rail, with local brands in the caption and tip', () => {
    for (const mode of ['expert', 'beginner'] as const) {
      expect(stationTitle('GATE_A2A', mode)).toBe('Instant Bank Transfer (PayID / Real-Time Rail)');
      expect(stationName('GATE_A2A', mode)).toBe('Instant A2A');
      expect(stationTip('GATE_A2A', mode)).toContain('PayID/NPP (Australia)');
    }
    expect(stationCaption('GATE_A2A')).toBe('Real-time account-to-account & dynamic QR rail');
    expect(stationCaption('GATE_POS')).toBeNull();
    setActiveLocale('vi');
    try {
      expect(stationTitle('GATE_A2A', 'expert')).toBe('Chuyển tiền Tức thời (Napas247 / VietQR)');
      expect(stationName('GATE_A2A', 'beginner')).toBe('Chuyển tiền 24/7');
      expect(stationCaption('GATE_A2A')).toBe('Hạ tầng chuyển tiền nhanh & mã QR nội địa');
      expect(stationTip('GATE_A2A', 'expert')).toContain('Napas247/VietQR (Việt Nam)');
    } finally {
      setActiveLocale('en');
    }
  });

  it('gives every desk, department and tally a plain name, a short name that fits a card, and one sentence of explanation', () => {
    for (const id of STATION_IDS) {
      expect(stationTitle(id, 'beginner').length).toBeGreaterThan(3);
      expect(stationName(id, 'beginner').length).toBeLessThanOrEqual(36);
      if (STATION_BRAND[id]) continue;
      const tip = stationTip(id, 'beginner');
      expect(tip.endsWith('.')).toBe(true);
      expect(sentences(tip)).toBe(1);
    }
    for (const id of DEPARTMENT_IDS) {
      expect(departmentName(id, 'beginner').length).toBeLessThanOrEqual(36);
      expect(sentences(departmentTip(id, 'beginner'))).toBe(1);
    }
    for (const id of EXTERNAL_IDS) {
      expect(externalLabel(id, 'beginner').length).toBeGreaterThan(0);
      expect(externalSub(id, 'beginner').length).toBeGreaterThan(0);
      expect(sentences(externalTip(id, 'beginner'))).toBe(1);
      expect(sentences(externalTip(id, 'expert'))).toBe(1);
    }
  });

  it('keeps beginner names free of the jargon they replace', () => {
    for (const id of STATION_IDS) {
      expect(stationName(id, 'beginner')).not.toMatch(/\b(CASA|dCVV|DPAN|Token Vault|3DS|Reconciliation)\b/);
    }
  });

  it('names any place on the map', () => {
    expect(placeTitle('SEC_3DS', 'beginner')).toBe('Fraud & SMS OTP Check');
    expect(placeTitle('OUT_SETTLED', 'expert')).toBe('Settled & cleared');
    expect(placeTitle('OUT_SETTLED', 'beginner')).toBe('Money moved & confirmed');
    expect(placeTip('CUSTOMER_OTP', 'beginner')).toMatch(/text/);
    expect(placeTip('LEDGER_DEBIT', 'expert')).toBe(STATIONS.LEDGER_DEBIT.blurb);
  });

  it('labels the two modes for the header toggle', () => {
    expect(modeLabel('expert')).toBe('Fintech Expert');
    expect(modeLabel('beginner')).toBe('Concept Explorer');
    expect(isTermMode('beginner')).toBe(true);
    expect(isTermMode('Beginner')).toBe(false);
    expect(isTermMode(null)).toBe(false);
  });
});

describe('plain-English text', () => {
  it('swaps jargon for plain words', () => {
    expect(plainText('The dCVV is wrong.')).toBe('The dynamic security code is wrong.');
    expect(plainText('A DPAN points to an FPAN.')).toBe('A virtual card number points to a real card number.');
  });

  it('matches the longest phrase first, so one word is not replaced inside another phrase', () => {
    expect(plainText('Park it in the suspense account.')).toBe('Park it in the holding box for mismatched money.');
    expect(plainText('3-D Secure 2.x asks for an OTP.')).toBe('The extra identity check asks for a one-time SMS code.');
  });

  it('keeps "a" and "an" right for the word that replaces the jargon', () => {
    expect(plainText('an FPAN and a CASA balance')).toBe('a real card number and an everyday account balance');
    expect(plainText('An OTP is sent. A dCVV is checked.')).toBe('A one-time SMS code is sent. A dynamic security code is checked.');
  });

  it('never replaces a replacement', () => {
    // "dynamic security code" contains "cvv"-free words; the point is that output is stable when run twice.
    const once = plainText('Check the dCVV, then the OTP, then the CASA balance.');
    expect(plainText(once)).toBe(once);
  });

  it('only touches whole words', () => {
    expect(plainText('The position of the footprint and the cvvs')).toBe('The position of the footprint and the cvvs');
    expect(plainText('A POS terminal')).toBe('A shop card reader terminal');
  });

  it('starts a sentence with a capital, and only then', () => {
    expect(plainText('OTP sent. dCVV checked: suspense account next')).toBe('One-time SMS code sent. Dynamic security code checked: Holding box for mismatched money next');
    expect(plainText('the otp arrives')).toBe('the one-time SMS code arrives');
  });

  it('leaves expert text alone', () => {
    const text = 'The dCVV expired, so 3DS never ran.';
    expect(termText(text, 'expert')).toBe(text);
    expect(termText(text, 'beginner')).not.toBe(text);
    expect(plainText('')).toBe('');
  });
});
