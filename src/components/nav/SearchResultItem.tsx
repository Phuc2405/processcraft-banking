import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { SearchEntry } from '../../hooks/useSearchIndex';
import { useMessages } from '../../utils/i18nHelper';
import { codeGlossaryMessages } from '../bank/codeGlossary.messages';
import { placeSideTip } from '../bank/tipPlacement';

/** One Ctrl+K result: the short name in bold, its full name beside it clipped with an ellipsis, and a one-line description. The full words are on the tooltip, never in the row. */
export function SearchResultTitle({ entry }: { entry: SearchEntry }) {
  if (!entry.abbr) return <div className="truncate text-sm font-semibold text-white">{entry.label}</div>;
  return (
    <div className="flex min-w-0 items-baseline">
      <span className="shrink-0 text-sm font-semibold text-white" data-testid="search-abbr">
        {entry.abbr}
      </span>
      {entry.full && (
        <span className="ml-2 min-w-0 max-w-[280px] shrink truncate overflow-hidden text-ellipsis whitespace-nowrap text-xs font-normal text-slate-400" data-testid="search-full">
          {entry.full}
        </span>
      )}
    </div>
  );
}

const TIP_WIDTH = 300;

/** The floating card beside a hovered or highlighted result: the whole term, its Vietnamese name, and the rule. */
export function SearchResultTip({ entry, id, row, panel }: { entry: SearchEntry; id: string; row: RefObject<HTMLElement | null>; panel: RefObject<HTMLElement | null> }) {
  const m = useMessages(codeGlossaryMessages);
  const tip = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const place = (): void => {
      const r = row.current?.getBoundingClientRect();
      const p = panel.current?.getBoundingClientRect();
      const t = tip.current;
      if (!r || !p || !t) return;
      setPos(placeSideTip(r, p, { width: t.offsetWidth, height: t.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }));
    };
    place();
    const list = panel.current;
    list?.addEventListener('scroll', place);
    window.addEventListener('resize', place);
    return () => {
      list?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [entry.id, row, panel]);

  return createPortal(
    <div ref={tip} id={id} role="tooltip" data-testid="search-tip" data-entry={entry.id} className="pointer-events-none fixed z-[1000] rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-left shadow-[0_10px_30px_rgba(0,0,0,0.55)]" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: TIP_WIDTH, visibility: pos ? 'visible' : 'hidden' }}>
      <div className="text-[13px] font-bold leading-snug text-slate-50" data-testid="search-tip-term">
        {entry.abbr && entry.full ? `${entry.abbr}: ${entry.full}` : entry.label}
      </div>
      {entry.vi && (
        <div className="mt-1 text-[12px] leading-snug text-sky-200" data-testid="search-tip-vi">
          🇻🇳 {entry.vi}
        </div>
      )}
      {entry.rule ? (
        <div className="mt-1.5 border-t border-slate-700 pt-1.5 text-[12px] leading-snug text-slate-200" data-testid="search-tip-rule">
          <span className="font-semibold text-emerald-300">{m('ruleLabel')}</span>
          {entry.rule}
        </div>
      ) : (
        <div className="mt-1 text-[12px] leading-snug text-slate-300">{entry.detail}</div>
      )}
    </div>,
    document.body,
  );
}
