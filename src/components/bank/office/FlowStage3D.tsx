import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { flowPlaces, GUIDED_FLOWS } from '../../../sim/guidedFlows';
import type { PlaceId } from '../../../sim/topology';
import { academyFocusOf, activeFlowOf, useBankStore } from '../../../store/bankStore';
import type { FlowId } from '../../../types/viewport';
import { StepPreviewBody } from '../StepPreview';
import { GroundMark, type Role } from './TourStage';
import { frameFocus, placeXZ, type CamFocus } from './tour3d';

/** The 3D half of a guided flow (Beginner scope): a ring of the flow's colour round each of its desks while the daylight is turned down (see Lights in OfficeScene), the desk the learner's payment is at pulsing, and a step preview card floating over the lit desk under the pointer. */

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
  const [atText, doneText, routeText] = key ? key.split('|') : ['0', 'false', ''];
  const route = routeText ? (routeText.split('>') as PlaceId[]) : null;
  return (
    <>
      {[...flowPlaces(flow)].map((p) => (
        <GroundMark key={p} place={p} role={roleOf(p, route, Number(atText), doneText === 'true', academy)} accent={accent} />
      ))}
    </>
  );
}

function HoverPreview({ flow }: { flow: FlowId }) {
  const hover = useBankStore((s) => s.hoverPlace);
  if (!hover || !flowPlaces(flow).has(hover)) return null;
  const [x, z] = placeXZ(hover);
  return (
    <Html position={[x, 3.4, z]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <div className="w-[248px] rounded-lg border bg-slate-900/95 px-2.5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.45)]" style={{ borderColor: `${GUIDED_FLOWS[flow].accent}aa` }} data-testid="step-preview-3d">
        <StepPreviewBody flow={flow} place={hover} />
      </div>
    </Html>
  );
}

export function FlowStage3D() {
  const flow = useBankStore(activeFlowOf);
  const academy = useBankStore(academyFocusOf);
  if (!flow && !academy) return null;
  return (
    <group name="flow-stage">
      {flow ? <Rings flow={flow} academy={academy} /> : academy && <GroundMark place={academy} role="here" accent={ACADEMY_ACCENT} />}
      {flow && <HoverPreview flow={flow} />}
    </group>
  );
}
