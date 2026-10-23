import { Kickoff } from '../../education/GuidedWalkthrough';
import { DockedStepCard } from '../../education/WalkDock';
import { useSpotlightFocus, useTourPlayback } from '../useSpotlight';
import { useBankStore } from '../../../store/bankStore';
import { arrivalMs3d } from './TourStage';

/** 3D tour words: the briefing over the office, then the step card in the left dock once the token arrives. */
export function TourLayer3D() {
  const focus = useSpotlightFocus();
  const arrived = useTourPlayback(focus, arrivalMs3d);
  const collapsed = useBankStore((s) => s.walkCollapsed);
  if (!focus) return null;
  if (focus.tour.intro) return <Kickoff focus={focus} />;
  if (!arrived || collapsed) return null;
  return <DockedStepCard focus={focus} />;
}
