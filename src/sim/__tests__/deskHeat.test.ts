import { describe, expect, it } from 'vitest';
import { DESK_HEAT, deskHeat, headBreachesSla } from '../deskHeat';
import { ROLE_STATION, STAFF_ROLES } from '../staffRoleplay';
import type { QueueItemView } from '../types';

const item = (waitedMin: number): QueueItemView => ({ id: 'p', kind: 'POS', scenario: '', cardType: 'DEBIT', amountCents: 100, waitedMin, detail: '' }) as QueueItemView;
const view = (queueLength: number, headWait = 0) => ({ queueLength, queue: queueLength > 0 ? [item(headWait)] : [] });

describe('desk congestion heat', () => {
  it('colours the 7 roleplay desks by queue length: green < 3, orange 3–5, red > 5', () => {
    for (const role of STAFF_ROLES) {
      const id = ROLE_STATION[role];
      expect(deskHeat(id, view(0))).toBe('green');
      expect(deskHeat(id, view(2))).toBe('green');
      expect(deskHeat(id, view(3))).toBe('orange');
      expect(deskHeat(id, view(5))).toBe('orange');
      expect(deskHeat(id, view(6))).toBe('red');
    }
  });

  it('turns red when the head of the queue breaches the SLA, whatever the length', () => {
    expect(headBreachesSla(view(1, DESK_HEAT.slaMin))).toBe(false);
    expect(headBreachesSla(view(1, DESK_HEAT.slaMin + 0.1))).toBe(true);
    expect(deskHeat(ROLE_STATION.aml, view(1, DESK_HEAT.slaMin + 1))).toBe('red');
    expect(deskHeat(ROLE_STATION.aml, view(4, DESK_HEAT.slaMin))).toBe('orange');
  });

  it('leaves every other station alone', () => {
    expect(deskHeat('SEC_3DS', view(9, 99))).toBeNull();
  });
});
