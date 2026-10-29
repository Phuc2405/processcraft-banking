/** English data stays English. */

import { describe, expect, it } from 'vitest';
import { hasVietnamese } from '../../utils/i18nHelper';

const MODULES = import.meta.glob('../../{data,sim,engine,types}/*.ts', { eager: true }) as Record<string, Record<string, unknown>>;

const VIETNAMESE_ON_PURPOSE = /(^|_)VI(_|$)|Vi$/;

function leaks(value: unknown, path: string, out: string[], seen = new Set<unknown>()): number {
  if (typeof value === 'string') {
    if (hasVietnamese(value)) out.push(`${path}: ${value.slice(0, 80)}`);
    return 1;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  const keys = Object.keys(value);
  if (!Array.isArray(value) && keys.includes('en') && keys.includes('vi')) return leaks((value as { en: unknown }).en, `${path}.en`, out, seen);
  let n = 0;
  for (const [k, v] of Object.entries(value)) if (typeof v !== 'function') n += leaks(v, `${path}.${k}`, out, seen);
  return n;
}

describe('the leak detector', () => {
  it('flags Vietnamese, ignores accented loanwords, and reads only the en side of a pair', () => {
    const out: string[] = [];
    leaks({ a: { en: 'ok', vi: 'xin chào' }, b: ['café résumé', 'Chia hóa đơn qua QR'] }, 'planted', out);
    expect(out).toEqual(['planted.b.1: Chia hóa đơn qua QR']);
  });
});

describe('English data tables', () => {
  const files = Object.keys(MODULES).filter((f) => !/Vi\.ts$/.test(f));

  it('covers the real data modules', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('contain no Vietnamese outside an { en, vi } pair', () => {
    const found: string[] = [];
    let strings = 0;
    for (const file of files) {
      for (const [name, value] of Object.entries(MODULES[file]!)) {
        if (VIETNAMESE_ON_PURPOSE.test(name)) continue;
        strings += leaks(value, `${file.replace('../../', '')}#${name}`, found);
      }
    }
    expect(strings).toBeGreaterThan(5000);
    expect(found).toEqual([]);
  });
});
