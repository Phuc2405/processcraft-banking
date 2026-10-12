import { describe, expect, it } from 'vitest';
import { placeCallout } from '../Spotlight';

const rect = (left: number, top: number, w = 120, h = 70) => ({ left, top, right: left + w, bottom: top + h });
const inside = (spot: { left: number; top: number }, card: { w: number; h: number }, bounds: { w: number; h: number }): boolean =>
  spot.left >= 0 && spot.top >= 0 && spot.left + card.w <= bounds.w && spot.top + card.h <= bounds.h;
const hit = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const boxOf = (spot: { left: number; top: number }, card: { w: number; h: number }) => ({ left: spot.left, top: spot.top, right: spot.left + card.w, bottom: spot.top + card.h });

const BOUNDS = { w: 830, h: 620 };
const CARD = { w: 400, h: 420 };

describe('placeCallout', () => {
  it('keeps the card on the stage', () => {
    for (const desk of [rect(10, 10), rect(700, 500), rect(350, 250), rect(0, 550), rect(710, 0)]) {
      const spot = placeCallout(desk, CARD, BOUNDS);
      expect(inside(spot, CARD, BOUNDS)).toBe(true);
    }
  });

  it('never covers the desk the token is at when there is room beside it', () => {
    for (const desk of [rect(30, 60), rect(650, 100), rect(300, 480), rect(40, 480)]) {
      const spot = placeCallout(desk, CARD, BOUNDS);
      expect(hit(boxOf(spot, CARD), desk)).toBe(false);
    }
  });

  it('puts the card on the side with room: a desk on the left gets a card on its right', () => {
    const spot = placeCallout(rect(20, 250), CARD, BOUNDS);
    expect(spot.side).toBe('right');
    expect(spot.left).toBeGreaterThan(140);
  });

  it('steers away from the desk the token goes to next', () => {
    const desk = rect(60, 250);
    const upNext = rect(220, 250);
    const without = placeCallout(desk, CARD, BOUNDS);
    const withNext = placeCallout(desk, CARD, BOUNDS, { next: upNext });
    expect(hit(boxOf(without, CARD), upNext)).toBe(true);
    expect(hit(boxOf(withNext, CARD), upNext)).toBe(false);
  });

  it('prefers a spot that hides fewer of the other lit desks', () => {
    const desk = rect(350, 250);
    const lit = [rect(480, 200, 200, 200), rect(500, 450)];
    const spot = placeCallout(desk, CARD, BOUNDS, { lit });
    const covered = lit.filter((l) => hit(boxOf(spot, CARD), l)).length;
    const plain = placeCallout(desk, CARD, BOUNDS);
    const plainCovered = lit.filter((l) => hit(boxOf(plain, CARD), l)).length;
    expect(covered).toBeLessThanOrEqual(plainCovered);
  });

  it('still returns a place when the card is taller than the stage', () => {
    const tall = { w: 400, h: 900 };
    const spot = placeCallout(rect(300, 300), tall, BOUNDS);
    expect(spot.top).toBe(8);
  });
});
