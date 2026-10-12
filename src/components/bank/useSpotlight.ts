import { useEffect, useMemo, useState } from 'react';
import { LESSONS } from '../../sim/learning';
import { spotPlan, spotScope, trailUpTo, type SpotPlan, type SpotScope, type SpotStep } from '../../sim/spotlightPlan';
import type { PlaceId } from '../../sim/topology';
import { quizFor, type WalkQuiz } from '../../sim/walkQuiz';
import { useBankStore, type QuizAnswer, type SpotlightState } from '../../store/bankStore';
import { dwellMs } from './tokenPath';

/** Everything the map and the explanation card need to know about the tour in progress. */
export interface Focus {
  tour: SpotlightState;
  /** The colour of the process: the neon of the lit desks and wires. */
  accent: string;
  scope: SpotScope;
  plan: SpotPlan;
  index: number;
  current: SpotStep;
  /** The places the token has passed (and is at). */
  visited: ReadonlySet<PlaceId>;
  /** The wires the token has ridden so far. */
  trail: ReadonlySet<string>;
  /** The question at this step, if it is a decision. */
  quiz: WalkQuiz | null;
  /** What the learner answered to it, if they have. */
  answer: QuizAnswer | undefined;
  /** True when the step is a decision whose question is still unanswered: the token will not move on. */
  blocked: boolean;
  last: boolean;
}

/** The guided tour as the screen sees it, or null when there is no tour. */
export function useSpotlightFocus(): Focus | null {
  const tour = useBankStore((s) => s.spotlight);
  const rules = useBankStore((s) => s.view.rules);
  return useMemo(() => {
    if (!tour) return null;
    const plan = spotPlan(tour.process, tour.exampleId, rules);
    const index = Math.min(tour.step, plan.steps.length - 1);
    const current = plan.steps[index] as SpotStep;
    const trail = trailUpTo(plan, tour.intro ? -1 : index);
    const quiz = quizFor(plan, index);
    const answer = tour.answers[index];
    return {
      tour,
      accent: LESSONS[tour.process].accent,
      scope: spotScope(tour.process),
      plan,
      index,
      current,
      visited: trail.places,
      trail: trail.wires,
      quiz,
      answer,
      blocked: !tour.intro && quiz !== null && answer === undefined,
      last: index === plan.steps.length - 1,
    };
  }, [tour, rules]);
}

const wordCount = (...texts: string[]): number => texts.join(' ').split(/\s+/).filter(Boolean).length;

/**
 * The timing of a tour, shared by the 2D map and the 3D office. Returns true once the token has arrived at the step (so the
 * explanation card can appear), and drives auto-play: stay on a step long enough to read it, wait for any question to be
 * answered, then move on. `travelMs` is how long this view takes to bring the token to the step (0 for an instant arrival).
 *
 * The arrival is remembered against the step it belongs to, so the card of a new step can never show for a frame before the
 * token gets there.
 */
export function useTourPlayback(focus: Focus | null, travelMs: (focus: Focus) => number): boolean {
  const next = useBankStore((s) => s.spotlightNext);
  const setAuto = useBankStore((s) => s.setSpotlightAuto);
  const [arrivedKey, setArrivedKey] = useState('');

  const index = focus?.index ?? 0;
  const intro = focus?.tour.intro ?? true;
  const plan = focus?.plan;
  const stepKey = `${plan?.process ?? ''}|${plan?.exampleId ?? ''}|${index}`;
  const arrived = !intro && arrivedKey === stepKey;

  useEffect(() => {
    if (!focus || intro) {
      setArrivedKey('');
      return;
    }
    const t = window.setTimeout(() => setArrivedKey(stepKey), travelMs(focus) + 120);
    return () => window.clearTimeout(t);
  }, [index, intro, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const auto = focus?.tour.auto ?? false;
  const blocked = focus?.blocked ?? false;
  const last = focus?.last ?? false;
  const answered = focus?.answer !== undefined;
  useEffect(() => {
    if (!focus || !auto || intro || !arrived || blocked) return;
    if (last) {
      setAuto(false);
      return;
    }
    const s = focus.current.step;
    const wait = answered ? 3800 : dwellMs(wordCount(s.what, s.why, s.happened, ...s.fails));
    const t = window.setTimeout(next, wait);
    return () => window.clearTimeout(t);
  }, [auto, intro, arrived, blocked, last, answered, index, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  return arrived;
}
