import { memo, useMemo } from 'react';
import { pathLength, pointAlongPath } from '../../engine/plan/path';
import { pick, useLocale, type Locale } from '../../i18n/locale';
import { CIT_STOPS } from '../../sim/citRoute';
import { stopStates, travelU, type HopStop, type StopState } from '../../sim/hopPlayer';
import { placeTitle, type TermMode } from '../../sim/terms';
import { useBankStore } from '../../store/bankStore';
import { useHopPlayer, type HopSession } from '../../store/hopPlayerStore';
import { useMessages } from '../../utils/i18nHelper';
import { deskBadgeMessages } from './deskBadge.messages';
import { hopPath2D, stopBox2D } from './hopGeometry2D';

/**
 * The step badge of the learner's run, one look for both maps: `Step 1: Vault ➔ Step 2: Loading bay ➔ Step 3: SBV`, the stop the
 * run stands at filled in the run's colour and ringed (aria-current), those behind muted, those ahead plain. On the last stop every
 * step is ticked. The 2D layer below draws it over the stop, or, between stops, the moving icon on the wire (sim/hopPlayer.ts).
 */

export interface BadgeStep {
  n: number;
  name: string;
  state: StopState;
}

/** How one hop's pill looks: the active one stands out, the rest stay quiet. */
export function hopLook(state: StopState, tone: string): { color: string; background: string; ring: string; weight: number } {
  if (state === 'active') return { color: '#0f172a', background: tone, ring: `0 0 0 1px ${tone}, 0 0 10px ${tone}99`, weight: 800 };
  return { color: state === 'done' ? '#94a3b8' : '#cbd5e1', background: 'transparent', ring: 'none', weight: 600 };
}

/** At most this many steps on the badge, round the active one, so a long route stays readable; an ellipsis marks the cut. */
export const BADGE_STEPS = 5;

export function badgeWindow<T extends { state: StopState }>(steps: readonly T[], max = BADGE_STEPS): { shown: T[]; before: boolean; after: boolean } {
  const i = Math.max(0, steps.findIndex((s) => s.state === 'active'));
  const start = Math.max(0, Math.min(i - 1, steps.length - max));
  return { shown: steps.slice(start, start + max), before: start > 0, after: start + max < steps.length };
}

/**
 * How the 2D badge fits a route: a long one (five steps or more) floats as a dense badge of three steps round the active one, its
 * names cut short, so it never spreads over the neighbouring cards of the top row.
 */
export const badgeFit2D = (count: number): { max: number; dense: boolean } => (count >= 5 ? { max: 3, dense: true } : { max: BADGE_STEPS, dense: false });

export function HopBadge({ hops, tone, complete = false, max = BADGE_STEPS, dense = false }: { hops: readonly BadgeStep[]; tone: string; complete?: boolean; max?: number; dense?: boolean }) {
  const { shown, before, after } = badgeWindow(hops, max);
  const word = useMessages(deskBadgeMessages)('step');
  return (
    <div role="status" data-testid="flow-hop-badge" data-dense={dense || undefined} data-complete={complete || undefined} className={`flex items-center gap-1 whitespace-nowrap rounded-full border font-semibold backdrop-blur-md ${dense ? 'px-1.5 py-px text-[9.5px]' : 'px-2 py-0.5 text-[10.5px]'}`} style={{ background: 'rgba(15,23,42,0.88)', boxShadow: '0 0 14px rgba(0,0,0,0.45)', borderColor: `${tone}88` }}>
      {before && <span className="text-slate-500">…</span>}
      {shown.map((h, i) => {
        const look = hopLook(h.state, tone);
        return (
          <span key={h.n} className="flex items-center gap-1" data-hop={h.n} data-state={h.state}>
            {(i > 0 || before) && <span className="text-slate-500">➔</span>}
            <span className={`rounded-full px-1.5 ${dense ? 'max-w-[104px] truncate' : ''}`} title={dense ? `${word} ${h.n}: ${h.name}` : undefined} style={{ color: look.color, background: look.background, boxShadow: look.ring, fontWeight: look.weight }} aria-current={h.state === 'active' ? 'step' : undefined}>
              {complete && h.state === 'active' ? '✓ ' : ''}
              {word} {h.n}: {h.name}
            </span>
          </span>
        );
      })}
      {after && <span className="text-slate-500">➔ …</span>}
    </div>
  );
}

/** A stop's name in the learner's language and wording. */
export const stopName = (stop: HopStop, locale: Locale, mode: TermMode): string => (stop.cit ? pick(CIT_STOPS[stop.cit].name, locale) : stop.place ? placeTitle(stop.place, mode) : '');

/** The badge's steps for a session standing at `index`. */
export function useBadgeSteps(session: HopSession | null, index: number): BadgeStep[] {
  const locale = useLocale();
  const mode = useBankStore((s) => s.termMode);
  return useMemo(() => {
    if (!session) return [];
    const states = stopStates({ index, phase: 'show', t: 0 }, session.stops.length);
    return session.stops.map((stop, i) => ({ n: i + 1, name: stopName(stop, locale, mode), state: states[i]! }));
  }, [session, index, locale, mode]);
}

/** The colour a run is drawn in: the CIT gold for a cash run, else the lit flow's accent. */
export const hopTone = (session: HopSession | null, accent: string | undefined): string => (session?.kind === 'cit' ? '#facc15' : (accent ?? '#38bdf8'));

/** The moving icon between two stops on the 2D map, read from the player every tick (only this small node redraws). */
function HopIcon2D({ from, to, icon, tone }: { from: HopStop; to: HopStop; icon: string; tone: string }) {
  const path = useMemo(() => hopPath2D(from, to), [from, to]);
  const len = useMemo(() => pathLength(path), [path]);
  const u = useHopPlayer((s) => (s.play ? travelU(s.play) : 1));
  const [x, y] = pointAlongPath(path, u * len);
  return (
    <svg className="pointer-events-none absolute left-0 top-0 z-[31] overflow-visible" width="1" height="1" aria-hidden="true">
      <polyline points={path.map((p) => p.join(',')).join(' ')} fill="none" stroke={tone} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" className="bk-tour-path bk-flow" style={{ filter: `drop-shadow(0 0 5px ${tone})` }} data-testid="flow-hop-wire-2d" />
      <g transform={`translate(${x} ${y})`} data-testid="flow-icon-2d">
        <circle r={12} fill="#0f172a" stroke={tone} strokeWidth={1.6} style={{ filter: `drop-shadow(0 0 5px ${tone})` }} />
        <text y={4.5} textAnchor="middle" fontSize={13}>
          {icon}
        </text>
      </g>
    </svg>
  );
}

/**
 * The 2D map's hop layer: over the stop the run stands at, its step badge; between two stops, only the icon gliding along that one
 * wire. Both read the one hop player, as the 3D office does.
 */
export const HopLayer2D = memo(function HopLayer2D({ accent }: { accent?: string }) {
  const session = useHopPlayer((s) => s.session);
  const index = useHopPlayer((s) => s.play?.index ?? -1);
  const phase = useHopPlayer((s) => s.play?.phase ?? null);
  const steps = useBadgeSteps(session, index);
  if (!session || index < 0 || !phase) return null;
  const tone = hopTone(session, accent);
  const stop = session.stops[index]!;
  if (phase === 'travel') {
    const next = session.stops[index + 1];
    return next ? <HopIcon2D from={stop} to={next} icon={session.icon} tone={tone} /> : null;
  }
  const { at, top } = stopBox2D(stop);
  return (
    <div className="bk-slide-down pointer-events-none absolute z-[32] -translate-x-1/2 -translate-y-full" style={{ left: at[0], top: top - 6 }} data-testid="flow-hop-badge-2d" data-stop={stop.place ?? stop.cit ?? undefined} data-phase={phase}>
      <HopBadge hops={steps} tone={tone} complete={phase === 'final'} {...badgeFit2D(steps.length)} />
    </div>
  );
});
