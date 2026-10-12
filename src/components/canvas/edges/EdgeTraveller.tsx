import { useLayoutEffect, useRef } from 'react';
import type { TokenLook } from '../../../store/liveSimulation';
import { prefersReducedMotion } from '../timing';
import { TokenShape } from '../tokens/TokenGlyph';

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * One token riding a wire. It waits `delayMs` (the desk is still working on it), then glides from
 * one end of the path to the other in `durationMs` and disappears into the next desk, which shows it
 * docked from then on.
 *
 * The motion is driven from requestAnimationFrame along the real path (getPointAtLength) rather than
 * SMIL: it restarts reliably each tick, follows the playback speed, and can be switched off cleanly
 * for people who ask their system for reduced motion (the token then just appears at the far end).
 */
export function EdgeTraveller({ path, look, delayMs, durationMs }: { path: string; look: TokenLook; delayMs: number; durationMs: number }) {
  const pathRef = useRef<SVGPathElement>(null);
  const groupRef = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    const route = pathRef.current;
    const token = groupRef.current;
    if (!route || !token) return;
    const length = route.getTotalLength();
    const place = (t: number): void => {
      const p = route.getPointAtLength(length * t);
      token.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    };

    if (prefersReducedMotion()) {
      place(1);
      token.style.opacity = '1';
      return;
    }

    place(0);
    token.style.opacity = '0';
    const departs = performance.now() + delayMs;
    let frame = 0;
    const tick = (now: number): void => {
      if (now >= departs) {
        const t = Math.min(1, (now - departs) / Math.max(1, durationMs));
        place(easeInOut(t));
        token.style.opacity = t >= 1 ? '0' : '1';
        if (t >= 1) return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [path, delayMs, durationMs]);

  return (
    <g data-testid="edge-traveller" data-token-kind={look.kind} pointerEvents="none">
      <path ref={pathRef} d={path} fill="none" stroke="none" />
      <g ref={groupRef} style={{ opacity: 0 }}>
        <TokenShape look={look} />
      </g>
    </g>
  );
}
