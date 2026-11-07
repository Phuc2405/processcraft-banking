import { useEffect, useMemo, useState } from 'react';
import type { SearchEntry, SearchResult } from '../../hooks/useSearchIndex';
import { useLocale } from '../../i18n/locale';
import { useBankStore } from '../../store/bankStore';

/**
 * The header search, without its index in the app chunk: the index (every knowledge article, lesson, GL table and retail-ops action
 * it searches, about 200 kB) is its own chunk, loaded the first time the search opens (focus or Ctrl/⌘+K), before the first keystroke.
 */
type SearchModule = typeof import('../../hooks/useSearchIndex');
let loaded: SearchModule | null = null;
let loading: Promise<SearchModule> | null = null;
const loadSearch = (): Promise<SearchModule> => (loading ??= import('../../hooks/useSearchIndex').then((m) => (loaded = m)));

const NONE: SearchResult & { flat: SearchEntry[] } = { groups: { station: [], lesson: [], gl: [], kb: [], ops: [] }, order: [], flat: [] };

/** Categorised live results for `query`, rebuilt when the language or vocabulary changes; `ready` once the index has loaded (`wanted`: the search is open). */
export function useLazySearch(query: string, wanted: boolean): SearchResult & { flat: SearchEntry[]; ready: boolean } {
  const [mod, setMod] = useState<SearchModule | null>(loaded);
  useEffect(() => {
    if (mod || !wanted) return;
    let live = true;
    void loadSearch().then((m) => live && setMod(m));
    return () => {
      live = false;
    };
  }, [mod, wanted]);
  const locale = useLocale();
  const mode = useBankStore((s) => s.termMode);
  const index = useMemo(() => mod?.buildSearchIndex(mode, locale) ?? null, [mod, mode, locale]);
  return useMemo(() => {
    if (!mod || !index) return { ...NONE, ready: false };
    const r = mod.searchIndex(index, query);
    return { ...r, flat: r.order.flatMap((c) => r.groups[c]), ready: true };
  }, [mod, index, query]);
}
