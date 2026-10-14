import { describe, expect, it } from 'vitest';
import { HUD_EVENTS, HUD_MAX, HUD_TTL_MS, newEvents, pushToasts, type HudToast } from '../hudToastLogic';

describe('HUD alert toasts', () => {
  it('watches the three events of the brief, amber for walk-aways and timeouts, red for NSF', () => {
    expect(HUD_EVENTS.map((e) => [e.title, e.reason, e.tone])).toEqual([
      ['SMS OTP Abandonment', 'OTP_ABANDONED', 'amber'],
      ['dCVV Timeout', 'DCVV_EXPIRED', 'amber'],
      ['NSF Block', 'FUNDS', 'red'],
    ]);
    expect(HUD_MAX).toBe(3);
    expect(HUD_TTL_MS).toBe(3500);
  });

  it('reports what went up between two snapshots, and how many', () => {
    expect(newEvents({ FUNDS: 2, OTP_ABANDONED: 1 }, { FUNDS: 4, OTP_ABANDONED: 1, DCVV_EXPIRED: 1 })).toEqual([
      { kind: 'DCVV', count: 1 },
      { kind: 'NSF', count: 2 },
    ]);
  });

  it('says nothing on the first snapshot, for other decline reasons, or when the counters fall back (a new day)', () => {
    expect(newEvents(null, { FUNDS: 9 })).toEqual([]);
    expect(newEvents({ THREE_DS_REJECT: 0 }, { THREE_DS_REJECT: 5 })).toEqual([]);
    expect(newEvents({ FUNDS: 30, OTP_ABANDONED: 9 }, { FUNDS: 0, OTP_ABANDONED: 0 })).toEqual([]);
  });

  it('keeps at most three, newest first', () => {
    const t = (id: number): HudToast => ({ id, kind: 'NSF', count: 1, at: id });
    let list: HudToast[] = [];
    list = pushToasts(list, [t(1), t(2)]);
    expect(list.map((x) => x.id)).toEqual([2, 1]);
    list = pushToasts(list, [t(3), t(4)]);
    expect(list.map((x) => x.id)).toEqual([4, 3, 2]);
  });
});
