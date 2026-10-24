import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHALLENGE_VI_IDS, challengeTestVi, localChallenge } from '../challengeVi';
import { LEVELS } from '../../data/seedChallenges';
import { VI_DICTIONARY } from '../viDictionary';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    // t.ts and the dictionary mention t('…') in their own comments.
    if (name === 't.ts' || name === 'viDictionary.ts' || name === 'i18nHelper.ts') return [];
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every `t('…')`, `t("…")` and `tf('…', values)` call with a literal first argument, as the English key. */
function literalKeys(text: string): string[] {
  const keys: string[] = [];
  const re = /(?<![\w.])tf?\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*[,)]/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const raw = m[2] ?? '';
    keys.push(raw.replace(/\\(['"\\])/g, '$1'));
  }
  return keys;
}

describe('Vietnamese dictionary', () => {
  it('has an entry for every t() call in the source', () => {
    const missing: string[] = [];
    for (const file of sourceFiles(SRC)) {
      for (const key of literalKeys(readFileSync(file, 'utf8'))) {
        if (VI_DICTIONARY[key] === undefined) missing.push(`${file.slice(SRC.length + 1)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('never maps a key to an empty string', () => {
    expect(Object.entries(VI_DICTIONARY).filter(([, vi]) => vi.trim() === '')).toEqual([]);
  });
});

describe('Build Lab levels in Vietnamese', () => {
  it('translates every level and every test', () => {
    expect([...CHALLENGE_VI_IDS].sort()).toEqual(LEVELS.map((l) => l.id).sort());
    const missing = LEVELS.flatMap((l) => l.testSuite.filter((tc) => challengeTestVi(l.id, tc.id) === undefined).map((tc) => `${l.id}/${tc.id}`));
    expect(missing).toEqual([]);
  });

  it('keeps everything the grader reads', () => {
    for (const level of LEVELS) {
      const vi = localChallenge(level, 'vi');
      expect(vi.testSuite.map((tc) => [tc.id, tc.expectedOutcome, tc.expectedReasonCode, tc.inputPayload])).toEqual(level.testSuite.map((tc) => [tc.id, tc.expectedOutcome, tc.expectedReasonCode, tc.inputPayload]));
      expect(vi.starterGraph).toBe(level.starterGraph);
      expect(vi.learningObjectives).toHaveLength(level.learningObjectives.length);
      expect(vi.hints ?? []).toHaveLength((level.hints ?? []).length);
      expect(localChallenge(level, 'en')).toBe(level);
    }
  });
});
