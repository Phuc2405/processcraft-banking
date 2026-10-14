import { Html } from '@react-three/drei';
import { flowPlaces, GUIDED_FLOWS } from '../../../sim/guidedFlows';
import type { PlaceId } from '../../../sim/topology';
import { activeFlowOf, useBankStore } from '../../../store/bankStore';
import type { FlowId } from '../../../types/viewport';
import { StepPreviewBody } from '../StepPreview';
import { GroundMark, type Role } from './TourStage';
import { placeXZ } from './tour3d';

/**
 * The 3D half of a guided flow (Beginner scope): a ring of the flow's colour round each of its desks while the daylight is
 * turned down (see Lights in OfficeScene), the desk the learner's payment is at pulsing, and a step preview card floating
 * over the lit desk under the pointer. Nothing here runs while a chapter tour has the office.
 */

function roleOf(place: PlaceId, route: readonly PlaceId[] | null, at: number, done: boolean): Role {
  if (!route) return 'lit';
  if (!done && route[at] === place) return 'here';
  return route.slice(0, at).includes(place) ? 'visited' : 'lit';
}

function Rings({ flow }: { flow: FlowId }) {
  const accent = GUIDED_FLOWS[flow].accent;
  // Read only where the payment is, so the rings change when it moves rather than on every beat.
  const key = useBankStore((s) => (s.presetTrace ? `${s.presetTrace.at}|${s.presetTrace.done}|${s.presetTrace.route.join('>')}` : ''));
  const [atText, doneText, routeText] = key ? key.split('|') : ['0', 'false', ''];
  const route = routeText ? (routeText.split('>') as PlaceId[]) : null;
  return (
    <>
      {[...flowPlaces(flow)].map((p) => (
        <GroundMark key={p} place={p} role={roleOf(p, route, Number(atText), doneText === 'true')} accent={accent} />
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
  if (!flow) return null;
  return (
    <group name="flow-stage">
      <Rings flow={flow} />
      <HoverPreview flow={flow} />
    </group>
  );
}
