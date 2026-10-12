import { describe, expect, it } from 'vitest';
import { DAY_END, DAY_START, EOD_START, PHASES, WORK_END, WORK_START } from '../../../sim/clock';
import { clampMinute, fractionToMinute, keyStep, minuteToFraction, SCRUB_SNAP, SEGMENT_WIDTH } from '../timeline';

describe('the time bar’s scale', () => {
  it('spreads the day over the whole bar, phase by phase', () => {
    expect(Object.values(SEGMENT_WIDTH).reduce((a, b) => a + b, 0)).toBe(100);
    expect(minuteToFraction(DAY_START)).toBe(0);
    expect(minuteToFraction(DAY_END)).toBe(1);
    expect(minuteToFraction(WORK_START)).toBeCloseTo(0.11, 9);
    expect(minuteToFraction(WORK_END)).toBeCloseTo(0.51, 9);
    expect(minuteToFraction(EOD_START)).toBeCloseTo(0.8, 9);
  });

  it('turns a click back into the time it shows, snapped to five minutes', () => {
    for (let m = DAY_START; m <= DAY_END; m += SCRUB_SNAP) expect(fractionToMinute(minuteToFraction(m)), String(m)).toBe(m);
    expect(fractionToMinute(minuteToFraction(12 * 60 + 2))).toBe(12 * 60);
    expect(fractionToMinute(-0.3)).toBe(DAY_START);
    expect(fractionToMinute(7)).toBe(DAY_END);
  });

  it('puts 12:00 (the peak) and 23:00 (the EOD run) where a learner would click for them', () => {
    const noon = minuteToFraction(12 * 60);
    const eod = minuteToFraction(EOD_START);
    expect(fractionToMinute(noon)).toBe(12 * 60);
    expect(fractionToMinute(eod)).toBe(EOD_START);
    // The one-hour night cycle is a fifth of the bar: easy to hit.
    expect(minuteToFraction(DAY_END) - minuteToFraction(EOD_START)).toBeCloseTo(0.2, 9);
  });

  it('never goes backwards: a later time is always further along', () => {
    let last = -1;
    for (const seg of PHASES) {
      for (let m = seg.from; m <= seg.to; m += 7) {
        const f = minuteToFraction(m);
        expect(f).toBeGreaterThanOrEqual(last);
        last = f;
      }
    }
  });
});

describe('the scrubber’s keys', () => {
  it('moves a quarter of an hour with the arrows, an hour with Page Up and Down, and to the ends with Home and End', () => {
    expect(keyStep('ArrowRight', 600)).toBe(615);
    expect(keyStep('ArrowLeft', 600)).toBe(585);
    expect(keyStep('PageUp', 600)).toBe(660);
    expect(keyStep('PageDown', 600)).toBe(540);
    expect(keyStep('Home', 900)).toBe(DAY_START);
    expect(keyStep('End', 900)).toBe(DAY_END);
    expect(keyStep('a', 900)).toBeNull();
  });

  it('stays inside the day', () => {
    expect(keyStep('ArrowLeft', DAY_START)).toBe(DAY_START);
    expect(keyStep('PageUp', DAY_END - 10)).toBe(DAY_END);
    expect(clampMinute(10)).toBe(DAY_START);
    expect(clampMinute(5000)).toBe(DAY_END);
  });
});
