/**
 * Stops new inline translations in UI components.
 *
 * `tr({ en, vi })` inside a component hides the copy from review and from reuse. New copy goes through `defineMessages` +
 * `useMessages` (src/utils/i18nHelper.ts). The pairs that were already inline are listed in inlineBudget.json, and a file may
 * only go down: when you migrate a file, lower or delete its entry.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import budget from './inlineBudget.json';

const COMPONENTS = join(__dirname, '..', '..', 'components');
const INLINE = /(?<![\w.])tr\(\s*\{/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.|\.messages\./.test(name) ? [path] : [];
  });
}

const counts = new Map(files(COMPONENTS).map((f) => [relative(COMPONENTS, f).split('\\').join('/'), (readFileSync(f, 'utf8').match(INLINE) ?? []).length] as const));
const allowed = budget as Record<string, number>;

describe('inline translations in components', () => {
  it('never grow: new copy belongs in a defineMessages bundle', () => {
    const over = [...counts].filter(([file, n]) => n > (allowed[file] ?? 0)).map(([file, n]) => `${file}: ${n} inline tr({…}), budget ${allowed[file] ?? 0}. Move the copy to a *.messages.ts bundle (useMessages).`);
    expect(over).toEqual([]);
  });

  it('has no stale budget entry (migrated files are removed from inlineBudget.json)', () => {
    const stale = Object.keys(allowed).filter((file) => (counts.get(file) ?? 0) === 0);
    expect(stale).toEqual([]);
  });
});
