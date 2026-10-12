import type { MinorUnits } from '../types/processLearning';

/** 8950 -> "$89.50". Whole-number maths only, so no float rounding can touch a balance. */
export function formatAud(minor: MinorUnits): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}
