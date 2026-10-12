import { describe, expect, it } from 'vitest';
import { ATM_MAX_CENTS, ATM_MIN_CENTS, describeNotes, dispense, MAX_PIN_TRIES, noteMix, verifyPin } from '../atm';

describe('the sidewalk ATM: PIN verification', () => {
  it('accepts the right PIN first time, or after one or two wrong tries', () => {
    expect(verifyPin(0, true)).toMatchObject({ outcome: 'VERIFIED', tries: 1 });
    expect(verifyPin(1, true)).toMatchObject({ outcome: 'VERIFIED', tries: 2 });
    expect(verifyPin(2, true)).toMatchObject({ outcome: 'VERIFIED', tries: 3 });
  });

  it('locks the session and keeps the card after three wrong PINs', () => {
    expect(MAX_PIN_TRIES).toBe(3);
    expect(verifyPin(3, true)).toMatchObject({ outcome: 'LOCKED', tries: 3 });
    expect(verifyPin(0, false).outcome).toBe('LOCKED');
    expect(verifyPin(5, true).note).toMatch(/keeps the card/);
  });

  it('treats nonsense counts sensibly', () => {
    expect(verifyPin(-2, true)).toMatchObject({ outcome: 'VERIFIED', tries: 1 });
    expect(verifyPin(1.7, true).tries).toBe(2);
  });
});

describe('the sidewalk ATM: counting the notes', () => {
  it('pays the brief’s $100 cash-out as two $50 notes', () => {
    const mix = noteMix(10_000);
    expect(mix).toMatchObject({ ok: true, total: 10_000 });
    expect(mix.notes).toEqual([{ value: 5000, count: 2 }]);
    expect(describeNotes(mix)).toBe('2 × $50.00');
  });

  it('builds amounts that need $20s too, always exactly', () => {
    for (const cents of [2000, 4000, 6000, 8000, 11_000, 13_000, 26_000]) {
      const mix = noteMix(cents);
      expect(mix.ok, String(cents)).toBe(true);
      expect(mix.notes.reduce((n, x) => n + x.value * x.count, 0)).toBe(cents);
    }
    expect(noteMix(6000).notes).toEqual([{ value: 2000, count: 3 }]);
  });

  it('cannot pay what no mix of $50s and $20s makes', () => {
    for (const cents of [1000, 3000, 2500, 4550]) expect(noteMix(cents).ok, String(cents)).toBe(false);
    expect(describeNotes(noteMix(3000))).toBe('no combination of notes');
  });
});

describe('the sidewalk ATM: dispensing', () => {
  it('dispenses a good amount', () => {
    const r = dispense(10_000, false);
    expect(r.outcome).toBe('DISPENSED');
    expect(r.note).toMatch(/2 × \$50\.00/);
  });

  it('jams: the notes were counted, nothing came out (the bank routes the money to suspense)', () => {
    const r = dispense(10_000, true);
    expect(r.outcome).toBe('JAMMED');
    expect(r.mix.total).toBe(10_000);
    expect(r.note).toMatch(/nothing came out/);
  });

  it('refuses amounts outside the machine’s limits or not payable in notes, even on a jam day', () => {
    expect(dispense(ATM_MIN_CENTS - 2000 || 1000, false).outcome).toBe('REFUSED');
    expect(dispense(ATM_MAX_CENTS + 5000, false).outcome).toBe('REFUSED');
    expect(dispense(3000, true).outcome).toBe('REFUSED');
  });
});
