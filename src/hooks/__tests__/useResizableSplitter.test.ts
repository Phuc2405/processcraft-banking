import { describe, expect, it } from 'vitest';
import { clampRatio, ratioAt } from '../useResizableSplitter';
import { CATALOG_SPLIT, createAcademyStore, clampCatalogRatio, ACADEMY_KEY } from '../../store/academyStore';
import { memoryStorage } from '../../store/bankPersistence';

const B = { min: 0.15, max: 0.85 };

describe('useResizableSplitter maths', () => {
  it('maps the pointer to a share of the container', () => {
    expect(ratioAt(300, 100, 400, B)).toBe(0.5);
    expect(ratioAt(180, 100, 400, B)).toBe(0.2);
  });

  it('clamps to the bounds, past either edge', () => {
    expect(ratioAt(0, 100, 400, B)).toBe(0.15);
    expect(ratioAt(9999, 100, 400, B)).toBe(0.85);
  });

  it('falls back to the midpoint for a collapsed container or NaN', () => {
    expect(ratioAt(10, 0, 0, B)).toBe(0.5);
    expect(clampRatio(Number.NaN, B)).toBe(0.5);
  });
});

describe('academy roadmap split', () => {
  it('starts at the default and clamps what it is given', () => {
    const a = createAcademyStore({ storage: null });
    expect(a.getState().catalogRatio).toBe(CATALOG_SPLIT.initial);
    a.getState().setCatalogRatio(2);
    expect(a.getState().catalogRatio).toBe(CATALOG_SPLIT.max);
    a.getState().setCatalogRatio(-1);
    expect(a.getState().catalogRatio).toBe(CATALOG_SPLIT.min);
    expect(clampCatalogRatio(Number.POSITIVE_INFINITY)).toBe(CATALOG_SPLIT.initial);
  });

  it('is remembered, and a bad saved value falls back', () => {
    const storage = memoryStorage();
    createAcademyStore({ storage }).getState().setCatalogRatio(0.62);
    expect(createAcademyStore({ storage }).getState().catalogRatio).toBe(0.62);
    storage.setItem(ACADEMY_KEY, JSON.stringify({ catalogRatio: 'tall' }));
    expect(createAcademyStore({ storage }).getState().catalogRatio).toBe(CATALOG_SPLIT.initial);
  });
});
