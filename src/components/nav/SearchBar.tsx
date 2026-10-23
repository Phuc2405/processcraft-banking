import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchIndex, type SearchCategory, type SearchEntry } from '../../hooks/useSearchIndex';
import { tr } from '../../i18n/locale';
import { runSearchAction } from './navigate';

const GROUP: Record<SearchCategory, { icon: string; en: string; vi: string }> = {
  station: { icon: '📍', en: 'Stations & Nodes', vi: 'Trạm & nút' },
  lesson: { icon: '📚', en: 'FinTech Terms & Lessons', vi: 'Thuật ngữ & bài học FinTech' },
  gl: { icon: '📊', en: 'GL Accounts', vi: 'Tài khoản sổ cái' },
};

const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Header search with Ctrl/⌘+K. `onBeforeGo` lets the shell switch to the Living Bank first. */
export function SearchBar({ onBeforeGo }: { onBeforeGo?: () => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { groups, order, flat } = useSearchIndex(query);
  const shortcut = isMac() ? '⌘K' : 'Ctrl K';

  // Ctrl/⌘+K focuses from anywhere.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close on outside press.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const choose = (entry: SearchEntry | undefined): void => {
    if (!entry) return;
    onBeforeGo?.();
    runSearchAction(entry.action);
    setOpen(false);
    setQuery('');
    input.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (flat.length) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : flat.length - 1)) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(flat[active]);
    } else if (e.key === 'Escape') {
      // Keep Esc from leaving a tour or Focus Mode.
      e.preventDefault();
      e.stopPropagation();
      if (query) setQuery('');
      else {
        setOpen(false);
        input.current?.blur();
      }
    }
  };

  const showList = open && query.trim().length > 0;
  const optionId = (i: number): string => `${listId}-opt-${i}`;
  let row = -1;

  return (
    <div ref={root} className="relative min-w-[140px] max-w-[300px] flex-1" data-testid="global-search">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-slate-500" aria-hidden="true">
        🔍
      </span>
      <input
        ref={input}
        type="search"
        role="combobox"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && flat.length ? optionId(active) : undefined}
        aria-label={tr({ en: 'Search stations, lessons and GL accounts', vi: 'Tìm trạm, bài học và tài khoản sổ cái' })}
        placeholder={tr({ en: 'Search stations, terms, GL…', vi: 'Tìm trạm, thuật ngữ, sổ cái…' })}
        data-testid="search-input"
        className="h-8 w-full rounded-md bg-slate-900 pl-8 pr-14 text-[12.5px] text-slate-100 ring-1 ring-slate-700 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400 [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-700 bg-slate-950 px-1 font-mono text-[10px] text-slate-400" aria-hidden="true">
        {shortcut}
      </kbd>

      {showList && (
        <div id={listId} role="listbox" aria-label={tr({ en: 'Search results', vi: 'Kết quả tìm kiếm' })} data-testid="search-results" className="absolute left-0 top-full z-[60] mt-1 max-h-[70vh] w-[420px] overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/98 p-1.5 shadow-2xl">
          {flat.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] text-slate-400" data-testid="search-empty">
              {tr({ en: `No matches for “${query.trim()}”`, vi: `Không có kết quả cho “${query.trim()}”` })}
            </p>
          ) : (
            order.map((c) => (
              <div key={c} role="group" aria-label={tr(GROUP[c])} data-testid={`search-group-${c}`} className="py-0.5">
                <div className="px-2 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <span aria-hidden="true">{GROUP[c].icon} </span>
                  {tr(GROUP[c])}
                </div>
                {groups[c].map((entry) => {
                  row += 1;
                  const i = row;
                  const on = i === active;
                  return (
                    <div
                      key={entry.id}
                      id={optionId(i)}
                      role="option"
                      aria-selected={on}
                      data-testid={`search-option-${entry.id}`}
                      onPointerMove={() => setActive(i)}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => choose(entry)}
                      className={`cursor-pointer rounded-lg px-2.5 py-1.5 ${on ? 'bg-slate-800' : ''}`}
                    >
                      <div className="truncate text-[12.5px] font-medium text-slate-100">{entry.label}</div>
                      <div className="truncate text-[11px] text-slate-400">{entry.detail}</div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
