import { tr } from '../../../i18n/locale';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Group, Mesh, MeshBasicMaterial } from 'three';
import { useFocusFade } from './useFocusFade';
import type { StationId } from '../../../sim/topology';
import { useBankStore } from '../../../store/bankStore';
import { pickPlace } from './tourHooks';
import { Sign } from './Dressing';
import { DeskPin, DeskQueue, SelectionFrame, cursor } from './Desk3D';
import { box, merge, type Part } from './kit';
import { ATM_KIOSK, deskPose } from './layout3d';
import { blobMaterial, glow, solid } from './materials';
import { STATUS_HEX } from './palette';

/**
 * A sidewalk ATM: a blue kiosk on the pavement outside the branch, its screen, card slot and cash slot facing the street.
 *
 * The brief's two kiosks are the two bays of one cash machine, and each is a station of the simulation. The first is the
 * Card & PIN bay, where the customer inserts the card and keys in the PIN; the second is the Cash bay, which counts out the
 * notes. The kiosk is a desk in every way that matters to the rest of the app: it has a queue (people waiting on the pavement),
 * a status lamp, a badge, and clicking it opens the inspector.
 */

const FRONT = ATM_KIOSK.d / 2;

function kioskSolid(): Part[] {
  const keys: Part[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) keys.push(box([-0.12 + c * 0.12, 0.918 + r * -0.012, 0.3 + r * 0.05], [0.09, 0.016, 0.04], '#e5e7eb', [-0.2, 0, 0]));
  return [
    box([0, 0.07, 0], [ATM_KIOSK.w + 0.06, 0.14, ATM_KIOSK.d + 0.06], '#94a3b8'),
    box([0, 0.64, -0.03], [ATM_KIOSK.w - 0.04, 1.0, ATM_KIOSK.d - 0.1], '#2563eb'),
    box([0, 1.2, 0.0], [ATM_KIOSK.w - 0.06, 0.58, ATM_KIOSK.d - 0.18], '#1d4ed8'),
    box([0, 1.58, -0.04], [ATM_KIOSK.w, 0.22, ATM_KIOSK.d - 0.06], '#1e3a8a'),
    box([0, 1.72, -0.02], [0.8, 0.3, 0.46], '#e0f2fe'),
    // the screen's bezel, tilted back a little
    box([0, 1.26, 0.28], [0.66, 0.42, 0.04], '#0f172a', [-0.22, 0, 0]),
    // the shelf the keypad is on
    box([0, 0.9, 0.3], [0.74, 0.12, 0.3], '#334155', [-0.2, 0, 0]),
    ...keys,
    // the card reader, and the receipt slot
    box([0.27, 1.02, 0.4], [0.2, 0.1, 0.05], '#0f172a'),
    box([-0.28, 0.72, 0.4], [0.16, 0.035, 0.05], '#0f172a'),
    // the cash dispenser: a dark mouth with a steel lip
    box([0, 0.5, 0.4], [0.62, 0.2, 0.06], '#111827'),
    box([0, 0.395, 0.44], [0.66, 0.04, 0.1], '#64748b'),
    box([0, 0.34, 0.405], [0.66, 0.012, 0.012], '#1e3a8a'),
  ];
}

function kioskGlow(): Part[] {
  return [
    // the screen, tilted with its bezel
    box([0, 1.27, 0.305], [0.58, 0.34, 0.006], '#7dd3fc', [-0.22, 0, 0]),
    box([0, 1.33, 0.309], [0.38, 0.04, 0.003], '#e0f2fe', [-0.22, 0, 0]),
    box([0, 1.24, 0.309], [0.46, 0.025, 0.003], '#bae6fd', [-0.22, 0, 0]),
    // the lit slots
    box([0.27, 1.02, 0.427], [0.14, 0.014, 0.006], '#4ade80'),
    box([0, 0.5, 0.432], [0.5, 0.025, 0.006], '#fbbf24'),
  ];
}

/** The pinned colours of a status flash: amber when a card is kept, red when the dispenser jams. */
const FLASH = { jam: '#ef4444', locked: '#f59e0b', off: '#1e3a8a' } as const;

/** One kiosk of the sidewalk ATM. */
export const AtmKiosk = memo(function AtmKiosk({ id }: { id: StationId }) {
  const pose = useMemo(() => deskPose(id), [id]);
  const status = useBankStore((s) => s.view.stations[id].status);
  const selected = useBankStore((s) => s.selection.kind === 'station' && s.selection.id === id);
  const jams = useBankStore((s) => s.view.kpis.atm.jams);
  const locked = useBankStore((s) => s.view.kpis.atm.pinLocked);
  const setHoverPlace = useBankStore((s) => s.setHoverPlace);
  const [hover, setHover] = useState(false);
  const root = useRef<Group>(null);
  useFocusFade(root, id);

  const body = useMemo(() => merge(kioskSolid()), []);
  const lit = useMemo(() => merge(kioskGlow()), []);
  useEffect(
    () => () => {
      body.dispose();
      lit.dispose();
      cursor(false);
    },
    [body, lit],
  );

  // A jam (or a card kept after three wrong PINs) makes the lamp on top flash for a few seconds.
  const lamp = useRef<Mesh>(null);
  const seen = useRef({ jams, locked });
  const flash = useRef<{ until: number; colour: string } | null>(null);
  useEffect(() => {
    if (id === 'ATM_CASH' && jams > seen.current.jams) flash.current = { until: performance.now() + 4500, colour: FLASH.jam };
    if (id === 'GATE_ATM' && locked > seen.current.locked) flash.current = { until: performance.now() + 4500, colour: FLASH.locked };
    seen.current = { jams, locked };
  }, [id, jams, locked]);
  useFrame(() => {
    const m = lamp.current;
    if (!m) return;
    const f = flash.current;
    const on = f !== null && performance.now() < f.until;
    (m.material as MeshBasicMaterial).color.set(on ? f.colour : STATUS_HEX[status]);
    const t = on ? 1 + 0.35 * Math.sin(performance.now() / 90) : 1;
    m.scale.setScalar(t);
  });

  const click = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    if (e.delta > 4) return;
    pickPlace(id);
  };
  const over = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation();
    setHover(true);
    setHoverPlace(id);
    cursor(true);
  };
  const out = (): void => {
    setHover(false);
    setHoverPlace(null);
    cursor(false);
  };

  const sign = id === 'ATM_CASH' ? tr({ en: 'ATM · CASH', vi: 'ATM · TIỀN MẶT' }) : 'ATM · PIN';
  return (
    <group ref={root} position={[pose.x, 0, pose.z]} name={`atm-${id}`}>
      <group position={[-0.5, 0, 0]}>
        <mesh geometry={body} material={solid} castShadow receiveShadow />
        <mesh geometry={lit} material={glow} />
        <Sign text={sign} fg="#ffffff" bg="#1d4ed8" position={[0, 1.72, 0.232]} width={0.78} />
        {/* the lamp on top, and the state strip across the foot */}
        <mesh ref={lamp} position={[0.36, 1.96, 0.1]}>
          <sphereGeometry args={[0.07, 12, 8]} />
          <meshBasicMaterial color={STATUS_HEX[status]} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.19, FRONT + 0.035]}>
          <boxGeometry args={[ATM_KIOSK.w - 0.12, 0.04, 0.014]} />
          <meshBasicMaterial color={STATUS_HEX[status]} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={blobMaterial()}>
          <planeGeometry args={[ATM_KIOSK.w + 1.4, ATM_KIOSK.d + 1.4]} />
        </mesh>
        {(hover || selected) && (
          <mesh position={[0, 0.03, 0.15]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.95, 1.12, 32]} />
            <meshBasicMaterial color={selected ? '#7dd3fc' : '#ffffff'} transparent opacity={selected ? 0.75 : 0.55} depthWrite={false} toneMapped={false} />
          </mesh>
        )}
        {/* an invisible box that catches the pointer */}
        <mesh visible={false} position={[0, 1.0, 0]} onClick={click} onPointerOver={over} onPointerOut={out}>
          <boxGeometry args={[ATM_KIOSK.w + 0.3, 2.1, ATM_KIOSK.d + 0.3]} />
        </mesh>
        {selected && <SelectionFrame w={ATM_KIOSK.w + 0.7} d={ATM_KIOSK.d + 0.7} />}
        <DeskPin id={id} height={2.55} />
      </group>
      <DeskQueue id={id} />
    </group>
  );
});
