import { useLayoutEffect, useRef } from 'react';
import type { TokenLook } from '../../../store/liveSimulation';
import { prefersReducedMotion } from '../timing';
import { TokenShape } from '../tokens/TokenGlyph';

/**
 * One token riding a wire across the Living Bank's map, as a compositor animation.
 *
 * `EdgeTraveller` (used inside a React Flow canvas) moves its token by rewriting an SVG `transform` attribute 60 times a second
 * from JavaScript. On the busy bank map that is a dozen tokens at once, each forcing the whole wire layer to be laid out and
 * painted every frame, and it is what made the map stutter whenever anything else changed. This version does the same journey
 * without any per-frame work on the page:
 *
 *   - the wire is sampled once (and remembered) into a short list of points;
 *   - the token is a small HTML layer (`will-change: transform`), so it is painted once and only ever moved by the GPU;
 *   - the motion is a Web Animations keyframe list: wait `delayMs` hidden, glide along the points with the same ease, vanish.
 *
 * What the learner sees is the same: the token waits while the desk works, rides the wire at the playback speed, and is gone
 * when it reaches the next desk. With "reduce motion" on, the token simply appears at the far end.
 */

/** Samples along a wire. More points make a curve smoother; 40 is smooth at the sizes the map uses. */
const SAMPLES = 40;
/** The token is drawn inside a box this big, centred on the point it is at. */
const HALF_W = 22;
const HALF_H = 16;

interface Pt {
  x: number;
  y: number;
}

const cache = new Map<string, readonly Pt[]>();

/** The point at every 1/SAMPLES of the wire's length. Measured once per distinct path and kept. */
export function samplePath(d: string): readonly Pt[] {
  const known = cache.get(d);
  if (known) return known;
  const route = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  route.setAttribute('d', d);
  const length = route.getTotalLength();
  const points: Pt[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const p = route.getPointAtLength((length * i) / SAMPLES);
    points.push({ x: p.x, y: p.y });
  }
  cache.set(d, points);
  return points;
}

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Where along the wire (0 to 1 of its length) a token is `t` of the way through its journey: the point list, read at the eased position. */
function pointAt(points: readonly Pt[], along: number): Pt {
  const at = Math.min(1, Math.max(0, along)) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(at));
  const f = at - i;
  const a = points[i] as Pt;
  const b = points[i + 1] as Pt;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

const place = (p: Pt): string => `translate(${(p.x - HALF_W).toFixed(1)}px, ${(p.y - HALF_H).toFixed(1)}px)`;

/** The keyframes for a token that waits, rides, and vanishes. Exported so the motion can be tested without a browser. */
export function journeyFrames(points: readonly Pt[], delayMs: number, durationMs: number): Array<{ offset: number; transform: string; opacity: number }> {
  const total = Math.max(1, delayMs + durationMs);
  const start = pointAt(points, 0);
  const end = pointAt(points, 1);
  const frames: Array<{ offset: number; transform: string; opacity: number }> = [{ offset: 0, transform: place(start), opacity: 0 }];
  const leaves = delayMs / total;
  if (delayMs > 0) frames.push({ offset: leaves, transform: place(start), opacity: 0 });
  const steps = Math.max(8, Math.min(SAMPLES, Math.round(durationMs / 20)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const offset = leaves + (1 - leaves) * t;
    frames.push({ offset: Math.min(1, offset), transform: place(pointAt(points, easeInOut(t))), opacity: i === steps ? 0 : 1 });
  }
  // The token is hidden the moment it arrives; the last keyframe sits at the far end.
  frames[frames.length - 1] = { offset: 1, transform: place(end), opacity: 0 };
  return frames;
}

/**
 * `label` is what the money is for ("☕ Corner Cafe Tap ($4.50)"). It rides beside the token as a small badge and moves with it,
 * so it costs no extra animation. Leave it out for a token that has no story to tell.
 */
export function PathTraveller({ path, look, delayMs, durationMs, label }: { path: string; look: TokenLook; delayMs: number; durationMs: number; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const points = samplePath(path);
    if (prefersReducedMotion()) {
      el.style.transform = place(pointAt(points, 1));
      el.style.opacity = '1';
      return;
    }
    const animation = el.animate(journeyFrames(points, delayMs, durationMs), { duration: Math.max(1, delayMs + durationMs), fill: 'both', easing: 'linear' });
    return () => animation.cancel();
  }, [path, delayMs, durationMs]);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute left-0 top-0 will-change-transform"
      style={{ width: HALF_W * 2, height: HALF_H * 2, opacity: 0 }}
      data-testid="edge-traveller"
      data-token-kind={look.kind}
    >
      <svg width={HALF_W * 2} height={HALF_H * 2} viewBox={`${-HALF_W} ${-HALF_H} ${HALF_W * 2} ${HALF_H * 2}`} overflow="visible" aria-hidden="true">
        <TokenShape look={look} />
      </svg>
      {label ? (
        <span
          className="absolute left-[calc(100%-8px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-slate-500/70 bg-slate-900/95 px-2 py-[1px] text-[10px] font-medium text-slate-100 shadow-md"
          data-testid="edge-traveller-label"
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
