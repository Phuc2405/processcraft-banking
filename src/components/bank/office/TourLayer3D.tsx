import { useLayoutEffect, useRef, useState } from 'react';
import { Kickoff, StepCard } from '../../education/GuidedWalkthrough';
import { placeCallout } from '../Spotlight';
import { useSpotlightFocus, useTourPlayback } from '../useSpotlight';
import { useTourScreen } from './tourBridge';
import { useBankStore } from '../../../store/bankStore';
import { arrivalMs3d } from './TourStage';

/**
 * The words of a tour in the 3D office: the opening briefing, then the explanation card at each desk once the token has
 * arrived. The card is placed where it hides the least of the lit desks, using where the scene says they are on screen.
 */
export function TourLayer3D() {
  const focus = useSpotlightFocus();
  const screen = useTourScreen();
  const [size, setSize] = useState({ w: 400, h: 360 });
  const cardRef = useRef<HTMLDivElement>(null);
  const arrived = useTourPlayback(focus, arrivalMs3d);
  const collapsed = useBankStore((s) => s.walkCollapsed);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = (): void => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [arrived, focus?.index, focus?.plan, focus?.answer]);

  if (!focus) return null;
  if (focus.tour.intro) return <Kickoff focus={focus} />;
  if (!arrived || collapsed) return null;
  if (!screen) return <StepCard ref={cardRef} focus={focus} style={{ right: 12, top: 64 }} side="far" />;
  const pad = 14;
  const desk = { left: screen.here.left - pad, top: screen.here.top - pad, right: screen.here.right + pad, bottom: screen.here.bottom + pad };
  // Kept below the viewport dock at the top of the office.
  const spot = placeCallout(desk, size, { w: screen.w, h: screen.h }, { next: screen.next, lit: screen.lit, minTop: 64 });
  return <StepCard ref={cardRef} focus={focus} style={{ left: spot.left, top: spot.top }} side={spot.side} />;
}
