import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { memo, useMemo } from 'react';
import { Vector3 } from 'three';
import { deskPose, kioskPose, LANE_LABELS } from '../../../engine/plan/layout3d';
import { LOADING_BAY, VAULT_DOOR } from '../../../engine/world/citRun';
import { t } from '../../../i18n/t';
import { hoverCardPlace, type CardPlace } from '../../../sim/hoverCard';
import { isStation, type StationId } from '../../../sim/topology';
import { useBankStore } from '../../../store/bankStore';
import { useWireHoverStore } from '../../../store/wireHoverStore';
import { StationTooltip } from '../StationTooltip';
import { pinTop } from './Desk3D';
import { badgeRect, tipSide3d, type TipSide3d } from './focus3d';
import { VAULT_STATION } from './VaultCash3D';

/**
 * The 3D office's ONE hover card host, mounted once in the scene: whatever is under the pointer (a desk, an ATM, a kiosk, the vault
 * door, the CIT bay: hoverCardPlace), it shows the very card the 2D map shows (StationTooltip). One host and one hovered place, so two
 * cards can never open at once. Hidden during a spotlight, whose own card explains.
 */
export const StationTooltip3D = memo(function StationTooltip3D() {
  const spot = useBankStore((s) => s.spotlight !== null);
  const hover = useBankStore((s) => s.hoverPlace);
  const node = useWireHoverStore((s) => s.node);
  const place = spot ? null : hoverCardPlace(hover, node);
  return place ? <PlacedCard key={place} place={place} /> : null;
});

function PlacedCard({ place }: { place: CardPlace }) {
  const { side, at } = useTipPlacement(place);
  return (
    // Above the badges' layer (the canvas) and every other overlay, on the side where it hides none of the desk's badges.
    <Html position={at} zIndexRange={[60, 50]} style={{ pointerEvents: 'none' }}>
      <div data-testid="station-card-3d" data-side={side} style={{ transform: TIP_SHIFT[side] }}>
        <StationTooltip place={place} />
      </div>
    </Html>
  );
}

/** The card's size on screen, for placing it (its real height varies with the step banner and the rules it lists). */
export const TIP_3D = { w: 264, h: 236 } as const;

/** How the card is shifted off its anchor point for each side (it is drawn from that point by CSS). */
const TIP_SHIFT: Record<TipSide3d, string> = {
  above: 'translate(-50%, calc(-100% - 10px))',
  below: 'translate(-50%, 10px)',
  right: 'translate(10px, -50%)',
  left: 'translate(calc(-100% - 10px), -50%)',
};

/** Where a card opens over a place that is not a desk: above the vault door, the bay's label, or a kiosk. */
function fixedAnchor(place: CardPlace): [number, number, number] {
  if (place === VAULT_STATION) return [VAULT_DOOR.x, VAULT_DOOR.y + 1.3, VAULT_DOOR.z + 0.35];
  if (place === 'LOADING_BAY') return [LOADING_BAY.x, 3.4, LOADING_BAY.z];
  const k = kioskPose(place);
  return [k.x, 2.2, k.z];
}

const projected = new Vector3();

/** A desk's card opens on the side (tipSide3d) whose card covers none of the desk's own lane badges on screen; anything else opens above. */
function useTipPlacement(place: CardPlace): { side: TipSide3d; at: [number, number, number] } {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  return useMemo(() => {
    if (place === 'LOADING_BAY' || place === VAULT_STATION || !isStation(place)) return { side: 'above', at: fixedAnchor(place) };
    const id: StationId = place;
    const pose = deskPose(id);
    const top = pinTop(id);
    const world: Record<TipSide3d, [number, number, number]> = {
      above: [pose.x, top + 0.35, pose.z + 0.1],
      below: [pose.x, 0.1, pose.z + pose.d / 2 + 0.3],
      right: [pose.x + pose.w / 2 + 0.3, top * 0.55, pose.z],
      left: [pose.x - pose.w / 2 - 0.3, top * 0.55, pose.z],
    };
    const toScreen = (x: number, y: number, z: number) => {
      projected.set(x, y, z).project(camera);
      return { x: ((projected.x + 1) / 2) * size.width, y: ((1 - projected.y) / 2) * size.height };
    };
    const anchors = Object.fromEntries((Object.keys(world) as TipSide3d[]).map((s) => [s, toScreen(...world[s])])) as Record<TipSide3d, { x: number; y: number }>;
    // CSS pixels to a world unit, from two projected points a unit apart.
    const a = toScreen(0, 0, 0);
    const b = toScreen(0, 1, 0);
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    const badges = LANE_LABELS.filter((l) => l.from === id || l.to === id).map((l) => badgeRect(toScreen(l.at[0], 0.36, l.at[1]), t(l.text).length, px));
    const side = tipSide3d(anchors, TIP_3D, badges, { w: size.width, h: size.height });
    return { side, at: world[side] };
  }, [place, camera, size]);
}
