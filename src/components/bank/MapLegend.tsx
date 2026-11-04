import { useState } from 'react';
import { t } from '../../i18n/t';
import { useMessages } from '../../utils/i18nHelper';
import { mapLegendMessages, type MapLegendKey } from './mapLegend.messages';
import { useInspectorCovers, useTopBand } from './ViewportControls';

/** The legend of the bank map, shared by the 2D blueprint and the 3D office so both explain their lines, gateways, frames and wire words the same way. */

const LEGEND_LINES: ReadonlyArray<{ key: MapLegendKey; stroke: string; dash?: string }> = [
  { key: 'lineReject', stroke: '#fb7185', dash: '5 4' },
  { key: 'lineApprove', stroke: '#38bdf8' },
  { key: 'lineNight', stroke: '#fbbf24' },
  { key: 'lineOtp', stroke: '#a78bfa', dash: '3 3' },
  { key: 'lineLock', stroke: '#22d3ee', dash: '7 3' },
];
const LEGEND_DESKS: ReadonlyArray<{ key: MapLegendKey; icon: string }> = [
  { key: 'deskSavings', icon: '💰' },
  { key: 'deskCollateral', icon: '🔒' },
];
const LEGEND_TERMS = ['CTR', 'STR', 'clean', 'released', 'refund', 'matched', 'break', 'lien'] as const;
/** The wire label each legend term stands for, where the two differ. */
const LEGEND_LABEL: Partial<Record<(typeof LEGEND_TERMS)[number], string>> = { matched: 'matched overnight' };

/** The map's legend: a button in the top-right corner that opens what each line, diamond, frame and wire word means. */
export function MapLegend({ top = 12, right = 12, initiallyOpen = false }: { top?: number; right?: number; initiallyOpen?: boolean }) {
  // On a short or narrow map the button shrinks to its icon, but the legend is always one click away.
  const short = useTopBand((x) => x.shortMap);
  const narrow = useTopBand((x) => x.mapW > 0 && x.mapW < 640);
  const m = useMessages(mapLegendMessages);
  const [open, setOpen] = useState(initiallyOpen);
  const covered = useInspectorCovers();
  if (covered) return null;
  const compact = short || narrow;
  return (
    <div className="absolute z-40 flex max-w-[min(340px,calc(100vw-2rem))] flex-col items-end text-[12px]" style={{ top, right }} data-testid="map-legend" data-open={open || undefined}>
      {open ? (
        // Adaptive height: a long legend scrolls inside its panel (by wheel or, being focusable, by keyboard) instead of running off a short map.
        <div role="region" tabIndex={0} aria-label={m('title')} className={`bk-scroll ${compact ? 'max-h-[min(50vh,320px)]' : 'max-h-[min(60vh,400px)]'} overflow-y-auto overscroll-contain rounded-xl border border-slate-700 bg-[#0b1120]/95 p-3 shadow-2xl backdrop-blur focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400`} data-testid="map-legend-panel">
          <div className="sticky -top-3 z-10 -mx-3 -mt-3 flex items-center justify-between gap-2 rounded-t-xl bg-[#0b1120] px-3 pb-1 pt-3">
            <h3 className="text-[13px] font-bold text-slate-100">{m('title')}</h3>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md px-1.5 text-[12px] text-slate-400 hover:bg-slate-800 hover:text-white" data-testid="map-legend-close">
              {m('close')}
            </button>
          </div>
          <div className="mt-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{m('linesTitle')}</div>
          <ul className="mt-1 space-y-1.5">
            {LEGEND_LINES.map((l) => (
              <li key={l.key} className="flex items-start gap-2 leading-snug text-slate-300" data-legend={l.key}>
                <svg width="30" height="10" className="mt-1 shrink-0" aria-hidden="true">
                  <line x1="1" y1="5" x2="29" y2="5" stroke={l.stroke} strokeWidth="2.4" {...(l.dash ? { strokeDasharray: l.dash } : {})} />
                </svg>
                {m(l.key)}
              </li>
            ))}
            <li className="flex items-start gap-2 leading-snug text-slate-300" data-legend="gateway">
              <svg width="30" height="16" className="shrink-0" aria-hidden="true">
                <path d="M15 1L29 8L15 15L1 8Z" fill="#0b1120" stroke="#fb7185" strokeWidth="1.4" />
                <path d="M12 5L18 11M18 5L12 11" stroke="#fb7185" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {m('gateway')}
            </li>
            <li className="flex items-start gap-2 leading-snug text-slate-300" data-legend="frame">
              <span className="mt-0.5 h-3.5 w-[30px] shrink-0 rounded border border-violet-400/60 bg-violet-400/10" aria-hidden="true" />
              {m('frame')}
            </li>
            {LEGEND_DESKS.map((d) => (
              <li key={d.key} className="flex items-start gap-2 leading-snug text-slate-300" data-legend={d.key}>
                <span className="grid h-[18px] w-[30px] shrink-0 place-items-center rounded border border-emerald-400/60 bg-emerald-400/10 text-[11px]" aria-hidden="true">
                  {d.icon}
                </span>
                {m(d.key)}
              </li>
            ))}
          </ul>
          <div className="mt-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{m('termsTitle')}</div>
          <dl className="mt-1 space-y-1">
            {LEGEND_TERMS.map((term) => (
              <div key={term} className="leading-snug" data-legend-term={term}>
                <dt className="inline rounded bg-slate-800 px-1.5 font-mono text-[11px] font-bold text-sky-200">{t(LEGEND_LABEL[term] ?? term)}</dt>
                <dd className="inline text-slate-300"> {m(`term_${term}`)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] italic text-slate-500">{m('hoverTip')}</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={m('buttonHint')}
          aria-label={m('button')}
          aria-expanded={false}
          data-compact={compact || undefined}
          className="rounded-lg border border-slate-700 bg-[#0b1120]/90 px-2.5 py-1.5 text-[12px] font-semibold text-slate-200 shadow-lg transition hover:border-slate-500 hover:bg-slate-800"
          data-testid="map-legend-open"
        >
          {compact ? (
            <span aria-hidden="true">🗺️</span>
          ) : (
            m('button')
          )}
        </button>
      )}
    </div>
  );
}
