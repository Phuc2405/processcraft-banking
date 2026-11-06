import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { flowPlaces, GUIDED_FLOWS } from '../../../sim/guidedFlows';
import type { PlaceId } from '../../../sim/topology';
import { academyFocusOf, activeFlowOf, activeScopeOf, useBankStore } from '../../../store/bankStore';
import { cassetteStatus } from '../../../sim/retailOps';
import { useRetailOpsStore } from '../../../store/retailOpsStore';
import type { FlowId } from '../../../types/viewport';
import { GroundMark, type Role } from './TourStage';
import { frameFocus, placeXZ, type CamFocus } from './tour3d';

/** The 3D half of a guided flow (Beginner scope): a ring of the flow's colour round each of its desks while the daylight is turned down (see Lights in OfficeScene), and the desk the learner's payment is at pulsing. The step context of a lit desk under the pointer is the top of its one hover card (StationTooltip3D). */

/** The ring colour of a node the Academy teaches when no guided flow is lit. */
const ACADEMY_ACCENT = '#38bdf8';

/** Where the camera goes for the node the Academy split view is teaching, or null (the whole office) when there is none. */
export function useAcademyCamera(): CamFocus | null {
  const place = useBankStore(academyFocusOf);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  return useMemo(() => (place ? frameFocus([place], { w: width, h: height }) : null), [place, width, height]);
}

function roleOf(place: PlaceId, route: readonly PlaceId[] | null, at: number, done: boolean, academy: PlaceId | null): Role {
  if (place === academy) return 'here';
  if (!route) return 'lit';
  if (!done && route[at] === place) return 'here';
  return route.slice(0, at).includes(place) ? 'visited' : 'lit';
}

function Rings({ flow, academy }: { flow: FlowId; academy: PlaceId | null }) {
  const accent = GUIDED_FLOWS[flow].accent;
  // Read only where the payment is, so the rings change when it moves rather than on every beat.
  const key = useBankStore((s) => (s.presetTrace ? `${s.presetTrace.at}|${s.presetTrace.done}|${s.presetTrace.route.join('>')}` : ''));
  const places = useBankStore((s) => activeScopeOf(s)?.places);
  const [atText, doneText, routeText] = key ? key.split('|') : ['0', 'false', ''];
  const route = routeText ? (routeText.split('>') as PlaceId[]) : null;
  return (
    <>
      {[...(places ?? flowPlaces(flow))].map((p) => (
        <GroundMark key={p} place={p} role={roleOf(p, route, Number(atText), doneText === 'true', academy)} accent={accent} />
      ))}
    </>
  );
}

/** The warning over the ATM while its cassette is under 15%. */
function CassetteBadge3D() {
  const pct = useRetailOpsStore((s) => cassetteStatus(s.book).pct);
  const low = useRetailOpsStore((s) => cassetteStatus(s.book).low);
  if (!low) return null;
  const [x, z] = placeXZ('ATM_CASH');
  return (
    <Html position={[x, 3.1, z]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <div className="whitespace-nowrap rounded-full border border-amber-300/70 bg-amber-950/95 px-2 py-0.5 text-[11px] font-bold text-amber-100 shadow-lg" role="status" data-testid="atm-low-badge-3d">
        🔔 {pct}%
      </div>
    </Html>
  );
}

export function FlowStage3D() {
  const flow = useBankStore(activeFlowOf);
  const academy = useBankStore(academyFocusOf);
  if (!flow && !academy) return <CassetteBadge3D />;
  return (
    <group name="flow-stage">
      <CassetteBadge3D />
      {flow ? <Rings flow={flow} academy={academy} /> : academy && <GroundMark place={academy} role="here" accent={ACADEMY_ACCENT} />}
    </group>
  );
}
