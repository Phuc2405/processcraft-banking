import { memo } from 'react';
import { PLACE_BOX } from '../../engine/plan/layout';
import { badgeHops, hopSteps, type HopState, type HopStep } from '../../sim/transactionPath';
import type { PlaceId } from '../../sim/topology';
import { useBankStore } from '../../store/bankStore';

/**
 * The floating step badge of the learner's payment (`1. POS Gate ➔ 2. Debit CASA ➔ 3. Approved`), one look for both maps: only the
 * CURRENT hop is accented (its pill filled in the flow's colour and ringed), the hops behind it are muted, the ones ahead plain.
 */

/** How one hop's pill looks: the active one stands out, the rest stay quiet. */
export function hopLook(state: HopState, tone: string): { color: string; background: string; ring: string; weight: number } {
  if (state === 'active') return { color: '#0f172a', background: tone, ring: `0 0 0 1px ${tone}, 0 0 10px ${tone}99`, weight: 800 };
  return { color: state === 'done' ? '#94a3b8' : '#cbd5e1', background: 'transparent', ring: 'none', weight: 600 };
}

export function HopBadge({ hops, tone }: { hops: readonly HopStep[]; tone: string }) {
  return (
    <div role="status" data-testid="flow-hop-badge" className="flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-semibold backdrop-blur-md" style={{ background: 'rgba(15,23,42,0.86)', boxShadow: '0 0 14px rgba(0,0,0,0.35)', borderColor: `${tone}aa` }}>
      {hops.map((h, i) => {
        const look = hopLook(h.state, tone);
        return (
          <span key={h.n} className="flex items-center gap-1" data-hop={h.n} data-state={h.state}>
            {i > 0 && <span className="text-slate-500">➔</span>}
            <span className="rounded-full px-1.5" style={{ color: look.color, background: look.background, boxShadow: look.ring, fontWeight: look.weight }} aria-current={h.state === 'active' ? 'step' : undefined}>
              {h.n}. {h.name}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** The 2D map's badge, floating over the station the payment is at now and moving with it hop by hop. */
export const HopBadge2D = memo(function HopBadge2D({ tone }: { tone: string }) {
  const key = useBankStore((s) => (s.presetTrace && !s.presetTrace.done ? `${s.presetTrace.at}|${s.presetTrace.route.join('>')}` : ''));
  if (!key) return null;
  const [at, route] = key.split('|');
  const trace = { route: route!.split('>') as PlaceId[], at: Number(at), done: false };
  const place = trace.route[trace.at];
  const box = place ? PLACE_BOX[place] : undefined;
  if (!box) return null;
  return (
    <div className="pointer-events-none absolute z-[30] -translate-x-1/2 -translate-y-full transition-[left,top] duration-500 ease-out" style={{ left: box.cx, top: box.cy - box.h / 2 - 6 }} data-testid="flow-hop-badge-2d" data-place={place}>
      <HopBadge hops={badgeHops(hopSteps(trace))} tone={tone} />
    </div>
  );
});
