import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, Color, MeshBasicMaterial, RepeatWrapping, SRGBColorSpace, type MeshStandardMaterial } from 'three';
import { bankStore } from '../../../store/bankStore';
import { Sign, useMerged } from './Dressing';
import { ATM_ALCOVE, KERB_Z, LAMP, ROAD_END, STREET, STREET_LAMPS } from './layout3d';
import { box, cyl, tint, type Part } from './kit';
import { glow, satin, solid } from './materials';
import { atmosphereAt, wetOf } from './atmosphere';
import { liveMix } from './weather';

/**
 * The street in front of the branch: a paved sidewalk with tiles, a kerb, a strip of road with its markings, the street
 * lamps along the kerb, and the low alcove wall that the two ATMs stand against.
 *
 * It is dressing only. Nothing here decides anything; the ATM kiosks themselves are desks (see AtmKiosk.tsx), and the
 * painted lanes and the people in the queue are the same ones the rest of the office draws.
 */

const HW = STREET.halfWidth;

/** 0 in the working day, 1 after dark: the lamps come on from 17:00 and are fully lit by 19:00. */
export function duskAt(minute: number): number {
  return Math.max(0, Math.min(1, (minute - 17 * 60) / 120));
}

// ─────────────────────────────────────────────────────────────────────────────
// Paving
// ─────────────────────────────────────────────────────────────────────────────

/** Paving slabs, one world unit square, each a slightly different grey, with a dark joint round it. Four by four to a texture. */
function usePavers(repeatX: number, repeatY: number): CanvasTexture {
  const tex = useMemo(() => {
    const S = 256;
    const tiles = 4;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    let seed = 11;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    if (g) {
      const t = S / tiles;
      for (let r = 0; r < tiles; r++) {
        for (let k = 0; k < tiles; k++) {
          const l = 80 + rnd() * 5;
          g.fillStyle = `hsl(${32 + rnd() * 8}, ${5 + rnd() * 5}%, ${l}%)`;
          g.fillRect(k * t, r * t, t, t);
          // a few specks
          for (let n = 0; n < 5; n++) {
            g.fillStyle = `rgba(90, 80, 70, ${0.05 + rnd() * 0.06})`;
            g.fillRect(k * t + rnd() * t, r * t + rnd() * t, 1 + rnd() * 2, 1 + rnd() * 2);
          }
        }
      }
      g.fillStyle = 'rgba(95, 88, 80, 0.55)';
      for (let i = 0; i <= tiles; i++) {
        g.fillRect(i * (S / tiles) - 1, 0, 2, S);
        g.fillRect(0, i * (S / tiles) - 1, S, 2);
      }
    }
    const texture = new CanvasTexture(c);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }, [repeatX, repeatY]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lamp light pools
// ─────────────────────────────────────────────────────────────────────────────

/** A soft warm disc of light for the ground under a lamp, drawn once. */
function useGlowTexture(): CanvasTexture {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      grad.addColorStop(0, 'rgba(255, 226, 150, 0.95)');
      grad.addColorStop(0.45, 'rgba(255, 214, 120, 0.4)');
      grad.addColorStop(1, 'rgba(255, 205, 100, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Where a lamp's head hangs, on the pavement side of its pole. */
const headAt = ([x, z]: readonly [number, number]): [number, number] => [x, z - LAMP.reach];

// ─────────────────────────────────────────────────────────────────────────────
// The street
// ─────────────────────────────────────────────────────────────────────────────

function groundParts(): Part[] {
  const w = HW * 2;
  const parts: Part[] = [
    // the block under the pavement, so the street has the same thickness as the office slab
    box([0, -0.3, STREET.z0 + (STREET.walk - 0.7) / 2], [w, 0.56, STREET.walk + 0.7], '#8d9399'),
    box([0, -0.012, STREET.z0 + (STREET.walk - 0.7) / 2], [w, 0.024, STREET.walk + 0.7], '#c9c3b8'),
    // the kerb stone
    box([0, STREET.kerbH / 2, KERB_Z + STREET.kerbW / 2], [w, STREET.kerbH, STREET.kerbW], '#dfe3e8'),
    // the road, a little below the pavement
    box([0, -0.3, KERB_Z + STREET.kerbW + (ROAD_END - KERB_Z - STREET.kerbW) / 2], [w, 0.32, ROAD_END - KERB_Z - STREET.kerbW], '#3f4651'),
    box([0, -0.14, KERB_Z + STREET.kerbW + (ROAD_END - KERB_Z - STREET.kerbW) / 2], [w, 0.012, ROAD_END - KERB_Z - STREET.kerbW], '#4b5563'),
  ];
  // dashed centre line between the two lanes, and a solid edge line along each side of the avenue
  const lineZ = KERB_Z + STREET.kerbW + (ROAD_END - KERB_Z - STREET.kerbW) / 2;
  for (let x = -HW + 0.9; x < HW - 0.9; x += 2.2) parts.push(box([x, -0.132, lineZ], [1.1, 0.006, 0.1], '#f3efe0'));
  for (const z of [KERB_Z + STREET.kerbW + 0.18, ROAD_END - 0.18]) parts.push(box([0, -0.132, z], [w, 0.006, 0.07], '#f3efe0'));
  // a zebra crossing, where the customers come in from the left
  const cz = KERB_Z + STREET.kerbW + (ROAD_END - KERB_Z - STREET.kerbW) / 2;
  for (let i = 0; i < 7; i++) parts.push(box([-9.2 + i * 0.52, -0.131, cz], [0.28, 0.006, ROAD_END - KERB_Z - STREET.kerbW - 0.3], '#f3efe0'));
  return parts;
}

/** A street lamp: base, pole, an arm reaching over the pavement, and a hood. The lit lens is a separate, glowing geometry. */
function lampParts(x: number, z: number): { solid: Part[]; lens: Part[] } {
  const [hx, hz] = headAt([x, z]);
  return {
    solid: [
      cyl([x, 0.09, z], 0.12, 0.15, 0.18, '#475569', 8),
      cyl([x, LAMP.height / 2, z], 0.045, 0.06, LAMP.height, '#64748b', 8),
      box([x, LAMP.height + 0.02, (z + hz) / 2], [0.08, 0.08, LAMP.reach + 0.08], '#64748b'),
      box([hx, LAMP.height - 0.04, hz], [0.58, 0.1, 0.3], '#334155'),
    ],
    lens: [box([hx, LAMP.height - 0.115, hz], [0.5, 0.05, 0.24], '#fff4cf')],
  };
}

const poolMaterial = (map: CanvasTexture): MeshBasicMaterial => new MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.3 });

/** The street lamps: lit a little in the day and brightly after dark, each with a warm pool of light on the pavement. */
const StreetLamps = memo(function StreetLamps() {
  const body = useMerged(() => STREET_LAMPS.flatMap(([x, z]) => lampParts(x, z).solid), []);
  const lens = useMerged(() => STREET_LAMPS.flatMap(([x, z]) => lampParts(x, z).lens), []);
  const map = useGlowTexture();
  const lensMaterial = useMemo(() => new MeshBasicMaterial({ vertexColors: true, toneMapped: false }), []);
  const pool = useMemo(() => poolMaterial(map), [map]);
  useEffect(
    () => () => {
      lensMaterial.dispose();
      pool.dispose();
    },
    [lensMaterial, pool],
  );
  useFrame(() => {
    // On after dusk, and partly on under a rain or storm sky (atmosphere.ts).
    const lamps = atmosphereAt(bankStore.getState().view.minute, liveMix).lamps;
    pool.opacity = 0.22 + 0.7 * lamps;
    lensMaterial.color.setScalar(0.72 + 0.28 * lamps);
  });
  return (
    <group name="street-lamps">
      <mesh geometry={body} material={satin} castShadow />
      <mesh geometry={lens} material={lensMaterial} />
      {STREET_LAMPS.map((at, i) => {
        const [px, pz] = headAt(at);
        return (
          <mesh key={i} position={[px, 0.02, pz]} rotation={[-Math.PI / 2, 0, 0]} material={pool} renderOrder={3}>
            <circleGeometry args={[LAMP.pool, 28]} />
          </mesh>
        );
      })}
    </group>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// The alcove the ATMs stand against
// ─────────────────────────────────────────────────────────────────────────────

/** A low blue-grey wall along the front of the building behind both kiosks, with a lit sign above each bay. */
const Alcove = memo(function Alcove() {
  const { x0, x1, z, h } = ATM_ALCOVE;
  const len = x1 - x0;
  const mid = (x0 + x1) / 2;
  const body = useMerged(
    () => [
      box([mid, h / 2, z], [len, h, 0.16], '#c7d2e0'),
      box([mid, h + 0.03, z], [len + 0.06, 0.06, 0.22], '#e8eef6'),
      box([mid, 0.08, z + 0.09], [len, 0.16, 0.04], '#94a3b8'),
      box([mid, h - 0.16, z + 0.085], [len - 0.2, 0.16, 0.02], '#1d4ed8'),
      ...[x0 + 0.05, x1 - 0.05].map((x) => box([x, h / 2 + 0.05, z + 0.02], [0.1, h + 0.1, 0.26], '#64748b')),
    ],
    [x0, x1, z, h, len, mid],
  );
  const lit = useMerged(() => [box([mid, h - 0.16, z + 0.098], [len - 0.4, 0.05, 0.006], tint('#60a5fa', 0.4))], [x0, x1, z, h, len, mid]);
  return (
    <group name="atm-alcove">
      <mesh geometry={body} material={solid} castShadow receiveShadow />
      <mesh geometry={lit} material={glow} />
      <Sign text="ATM  ·  24 HOURS" fg="#ffffff" bg="#1d4ed8" position={[mid, h + 0.42, z + 0.11]} width={2.1} />
    </group>
  );
});

export const Street = memo(function Street() {
  // The tiles lie on the pavement, from the building to the kerb: four to a texture.
  const tiles = usePavers((HW * 2) / 4, STREET.walk / 4);
  const ground = useMerged(groundParts, []);
  // Rain darkens the paving and gives it a sheen; it dries again over a few seconds when the rain stops.
  const paving = useRef<MeshStandardMaterial>(null);
  const wet = useRef(0);
  const dry = useMemo(() => new Color('#ffffff'), []);
  const soaked = useMemo(() => new Color('#9aa3ad'), []);
  useFrame((_, dt) => {
    const want = wetOf(liveMix);
    wet.current += (want - wet.current) * Math.min(1, dt * (want ? 1.2 : 0.4));
    if (!paving.current) return;
    paving.current.roughness = 0.9 - 0.62 * wet.current;
    paving.current.metalness = 0.18 * wet.current;
    paving.current.color.copy(dry).lerp(soaked, wet.current);
  });
  return (
    <group name="office-street">
      <mesh geometry={ground} material={solid} receiveShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, STREET.z0 + STREET.walk / 2]} receiveShadow name="street-pavement">
        <planeGeometry args={[HW * 2, STREET.walk]} />
        <meshStandardMaterial ref={paving} map={tiles} roughness={0.9} />
      </mesh>
      <Alcove />
      <StreetLamps />
    </group>
  );
});

