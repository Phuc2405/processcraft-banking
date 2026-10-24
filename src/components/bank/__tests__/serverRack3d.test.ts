import { describe, expect, it } from 'vitest';
import { rackLedHex } from '../office/ServerRack3D';

describe('3D server rack LEDs', () => {
  it('follow the load bands the inspector uses', () => {
    expect(rackLedHex(10)).toBe('#34d399');
    expect(rackLedHex(40)).toBe('#38bdf8');
    expect(rackLedHex(70)).toBe('#fb923c');
    expect(rackLedHex(90)).toBe('#fb7185');
  });
});
