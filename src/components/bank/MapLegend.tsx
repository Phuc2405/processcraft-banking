import { useState } from 'react';
import { t } from '../../i18n/t';
import { useMessages } from '../../utils/i18nHelper';
import { mapLegendMessages, type MapLegendKey } from './mapLegend.messages';

/** The legend of the bank map, shared by the 2D blueprint and the 3D office so both explain their lines, gateways, frames and wire words the same way. */

const LEGEND_LINES: ReadonlyArray<{ key: MapLegendKey; stroke: string; dash?: string }> = [
  { key: 'lineReject', stroke: '#fb7185', dash: '5 4' },
  { key: 'lineApprove', stroke: '#38bdf8' },
  { key: 'lineNight', stroke: '#fbbf24' },
  { key: 'lineOtp', stroke: '#a78bfa', dash: '3 3' },
];
const LEGEND_TERMS = ['CTR', 'STR', 'clean', 'released', 'refund', 'matched', 'break'] as const;
/** The wire label each legend term stands for, where the two differ. */
const LEGEND_LABEL: Partial<Record<(typeof LEGEND_TERMS)[number], string>> = { matched: 'matched overnight' };

/** The map's legend: a button in the top-right corner that opens what each line, diamond, frame and wire word means. */
export function MapLegend({ top = 12, right = 12, initiallyOpen = false }: { top?: number; right?: number; initiallyOpen?: boolean }) {
  const m = useMessages(mapLegendMessages);
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className="absolute z-40 flex max-w-[340px] flex-col items-end text-[12px]" style={{ top, right }} data-testid="map-legend" data-open={open || undefined}>
      {open ? (
        <div role="region" aria-label={m('title')} className="rounded-xl border border-slate-700 bg-[#0b1120]/95 p-3 shadow-2xl backdrop-blur" data-testid="map-legend-panel">
          <div className="flex items-center justify-between gap-2">
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
          aria-expanded={false}
          className="rounded-lg border border-slate-700 bg-[#0b1120]/90 px-2.5 py-1.5 text-[12px] font-semibold text-slate-200 shadow-lg transition hover:border-slate-500 hover:bg-slate-800"
          data-testid="map-legend-open"
        >
          {m('button')}
        </button>
      )}
    </div>
  );
}
