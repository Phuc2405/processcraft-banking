import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, SpriteMaterial, SRGBColorSpace, type Sprite } from 'three';

/**
 * A speech bubble (💬) or a thought bubble (💭) floating over people who are talking, drawn once on a canvas and shown as
 * a sprite that always faces the camera. It bobs gently and now and then pops a little, as if someone just spoke.
 */

export type BubbleKind = 'speech' | 'thought';

const cache = new Map<BubbleKind, CanvasTexture>();

function bubbleTexture(kind: BubbleKind): CanvasTexture {
  const hit = cache.get(kind);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 112;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#94a3b8';
    g.lineWidth = 4;
    if (kind === 'speech') {
      g.beginPath();
      g.roundRect(6, 6, 116, 74, 26);
      g.moveTo(40, 78);
      g.lineTo(30, 104);
      g.lineTo(62, 78);
      g.fill();
      g.stroke();
      // Cover the stroke where the tail joins the bubble.
      g.fillRect(40, 70, 22, 10);
    } else {
      g.beginPath();
      g.ellipse(64, 42, 58, 36, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      for (const [x, y, r] of [
        [34, 88, 9],
        [20, 104, 5],
      ] as const) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
    // The three dots of a conversation.
    g.fillStyle = '#475569';
    for (const x of [40, 64, 88]) {
      g.beginPath();
      g.arc(x, kind === 'speech' ? 43 : 42, 7, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  cache.set(kind, t);
  return t;
}

/** A bubble at `position`, `phase` keeping neighbouring bubbles out of step. */
export function Bubble({ kind, position, phase = 0, size = 0.42 }: { kind: BubbleKind; position: readonly [number, number, number]; phase?: number; size?: number }) {
  const material = useMemo(() => new SpriteMaterial({ map: bubbleTexture(kind), transparent: true, depthWrite: false, toneMapped: false }), [kind]);
  useEffect(() => () => material.dispose(), [material]);
  const sprite = useRef<Sprite>(null);
  useFrame(({ clock }) => {
    const s = sprite.current;
    if (!s) return;
    const t = clock.elapsedTime + phase;
    s.position.set(position[0], position[1] + Math.sin(t * 1.8) * 0.05, position[2]);
    // A little pop every few seconds, as if someone just spoke.
    const pop = 1 + 0.12 * Math.max(0, Math.sin(t * 1.3)) ** 8;
    s.scale.set(size * (128 / 112) * pop, size * pop, 1);
  });
  return <sprite ref={sprite} material={material} renderOrder={8} />;
}
